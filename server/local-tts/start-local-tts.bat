@echo off
echo Starting Kokoro-82M TTS Server...
cd /d "%~dp0"

if not exist "venv" (
    echo ERROR: Virtual environment not found. Run setup.bat first.
    pause
    exit /b 1
)

if not exist "kokoro-v1.0.onnx" (
    echo ERROR: Model file not found. Run setup.bat first.
    pause
    exit /b 1
)

call venv\Scripts\activate.bat
python tts_server.py
