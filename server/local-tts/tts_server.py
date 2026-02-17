"""
Kokoro-82M Local TTS Server

FastAPI server that serves text-to-speech using the Kokoro-82M model
via ONNX Runtime. Supports GPU acceleration with CUDA.

Usage:
    python tts_server.py
    # or: uvicorn tts_server:app --host 0.0.0.0 --port 5001
"""

import io
import os
import sys
import time
import base64
import logging

import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

# Windows espeak-ng paths (set before importing kokoro_onnx)
if os.name == "nt":
    espeak_paths = [
        r"C:\Program Files\eSpeak NG",
        r"C:\Program Files (x86)\eSpeak NG",
    ]
    for p in espeak_paths:
        if os.path.exists(p):
            os.environ.setdefault("PHONEMIZER_ESPEAK_LIBRARY", os.path.join(p, "libespeak-ng.dll"))
            os.environ.setdefault("PHONEMIZER_ESPEAK_PATH", os.path.join(p, "espeak-ng.exe"))
            break

from kokoro_onnx import Kokoro

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("kokoro-tts")

app = FastAPI(title="Kokoro TTS Server", version="1.0.0")

# Allow CORS from Express server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Model instance
kokoro: Optional[Kokoro] = None
gpu_available = False

# Model file paths (relative to this script's directory)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(SCRIPT_DIR, "kokoro-v1.0.onnx")
VOICES_PATH = os.path.join(SCRIPT_DIR, "voices-v1.0.bin")

# Available voices
VOICES = {
    "en-us": {
        "female": [
            {"id": "af_heart", "name": "Heart", "grade": "A-"},
            {"id": "af_bella", "name": "Bella", "grade": "A-"},
            {"id": "af_nicole", "name": "Nicole", "grade": "B-"},
            {"id": "af_sarah", "name": "Sarah", "grade": "C+"},
            {"id": "af_nova", "name": "Nova", "grade": "C"},
            {"id": "af_sky", "name": "Sky", "grade": "C-"},
            {"id": "af_alloy", "name": "Alloy", "grade": "C"},
            {"id": "af_aoede", "name": "Aoede", "grade": "C+"},
            {"id": "af_kore", "name": "Kore", "grade": "C+"},
            {"id": "af_jessica", "name": "Jessica", "grade": "D"},
            {"id": "af_river", "name": "River", "grade": "D"},
        ],
        "male": [
            {"id": "am_fenrir", "name": "Fenrir", "grade": "C+"},
            {"id": "am_puck", "name": "Puck", "grade": "C+"},
            {"id": "am_michael", "name": "Michael", "grade": "C+"},
            {"id": "am_adam", "name": "Adam", "grade": "F+"},
            {"id": "am_echo", "name": "Echo", "grade": "D"},
            {"id": "am_eric", "name": "Eric", "grade": "D"},
            {"id": "am_liam", "name": "Liam", "grade": "D"},
            {"id": "am_onyx", "name": "Onyx", "grade": "D"},
            {"id": "am_santa", "name": "Santa", "grade": "D-"},
        ],
    },
    "en-gb": {
        "female": [
            {"id": "bf_alice", "name": "Alice"},
            {"id": "bf_emma", "name": "Emma"},
            {"id": "bf_isabella", "name": "Isabella"},
            {"id": "bf_lily", "name": "Lily"},
        ],
        "male": [
            {"id": "bm_daniel", "name": "Daniel"},
            {"id": "bm_fable", "name": "Fable"},
            {"id": "bm_george", "name": "George"},
            {"id": "bm_lewis", "name": "Lewis"},
        ],
    },
}


class TTSRequest(BaseModel):
    text: str
    voice: str = "af_heart"
    speed: float = 1.0
    lang: str = "en-us"
    format: str = "wav"  # wav or mp3


@app.on_event("startup")
async def startup():
    global kokoro, gpu_available
    logger.info("Loading Kokoro-82M model...")

    if not os.path.exists(MODEL_PATH):
        logger.error(f"Model file not found: {MODEL_PATH}")
        logger.error("Run setup.bat to download model files")
        return

    if not os.path.exists(VOICES_PATH):
        logger.error(f"Voices file not found: {VOICES_PATH}")
        logger.error("Run setup.bat to download model files")
        return

    try:
        import onnxruntime as ort
        providers = ort.get_available_providers()
        logger.info(f"Available ONNX providers: {providers}")

        if "CUDAExecutionProvider" in providers:
            logger.info("GPU detected! Using CUDA acceleration")
            try:
                session = ort.InferenceSession(
                    MODEL_PATH,
                    providers=[
                        ("CUDAExecutionProvider", {
                            "cudnn_conv_algo_search": "DEFAULT"
                        }),
                        "CPUExecutionProvider"
                    ]
                )
                kokoro = Kokoro.from_session(session, VOICES_PATH)
                gpu_available = True
                logger.info("Model loaded with GPU acceleration")
            except Exception as gpu_err:
                logger.warning(f"GPU init failed, falling back to CPU: {gpu_err}")
                kokoro = Kokoro(MODEL_PATH, VOICES_PATH)
                logger.info("Model loaded on CPU (GPU fallback)")
        else:
            kokoro = Kokoro(MODEL_PATH, VOICES_PATH)
            logger.info("Model loaded on CPU")

        # Warmup inference
        logger.info("Warming up model...")
        t0 = time.time()
        _ = kokoro.create("Hello.", voice="af_heart", speed=1.0, lang="en-us")
        warmup_time = (time.time() - t0) * 1000
        logger.info(f"Warmup complete: {warmup_time:.0f}ms")

    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        import traceback
        traceback.print_exc()


@app.post("/synthesize")
async def synthesize(req: TTSRequest):
    """Synthesize speech and return base64-encoded audio."""
    if kokoro is None:
        raise HTTPException(status_code=503, detail="Model not loaded. Run setup.bat first.")

    try:
        t0 = time.time()
        samples, sample_rate = kokoro.create(
            req.text,
            voice=req.voice,
            speed=req.speed,
            lang=req.lang,
        )
        inference_time = (time.time() - t0) * 1000

        # Encode to WAV in memory
        buffer = io.BytesIO()
        sf.write(buffer, samples, sample_rate, format="WAV")
        audio_bytes = buffer.getvalue()

        # Base64 encode for compatibility with existing frontend
        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")

        logger.info(
            f"Synthesized: voice={req.voice}, "
            f"len={len(req.text)} chars, "
            f"time={inference_time:.0f}ms, "
            f"audio={len(audio_bytes)} bytes"
        )

        return {
            "success": True,
            "audioData": audio_b64,
            "format": "wav",
            "inference_ms": round(inference_time),
            "gpu": gpu_available,
        }

    except Exception as e:
        logger.error(f"Synthesis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/voices")
async def list_voices():
    """List all available voices."""
    return {"voices": VOICES}


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok" if kokoro is not None else "model_not_loaded",
        "model_loaded": kokoro is not None,
        "gpu": gpu_available,
        "model": "kokoro-82m-v1.0",
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("KOKORO_PORT", "5001"))
    logger.info(f"Starting Kokoro TTS server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
