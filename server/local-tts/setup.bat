@echo off
echo ============================================
echo  Kokoro-82M Local TTS Setup
echo ============================================
echo.

cd /d "%~dp0"

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Install Python 3.10+ from python.org
    pause
    exit /b 1
)

REM Create virtual environment if it doesn't exist
if not exist "venv" (
    echo Creating Python virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo ERROR: Failed to create venv
        pause
        exit /b 1
    )
    echo Virtual environment created.
) else (
    echo Virtual environment already exists.
)

REM Activate venv
call venv\Scripts\activate.bat

REM Upgrade pip
echo.
echo Upgrading pip...
python -m pip install --upgrade pip

REM Install dependencies
echo.
echo Installing Python dependencies...
pip install -r requirements.txt
if errorlevel 1 (
    echo WARNING: Some packages may have failed. Trying CPU-only fallback...
    pip install kokoro-onnx fastapi uvicorn[standard] soundfile numpy
)

REM Download model files if not present
echo.
if not exist "kokoro-v1.0.onnx" (
    echo Downloading Kokoro model (310 MB)...
    curl -L -o kokoro-v1.0.onnx "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
    if errorlevel 1 (
        echo ERROR: Failed to download model. Check your internet connection.
        pause
        exit /b 1
    )
    echo Model downloaded.
) else (
    echo Model file already exists.
)

if not exist "voices-v1.0.bin" (
    echo Downloading voice data...
    curl -L -o voices-v1.0.bin "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"
    if errorlevel 1 (
        echo ERROR: Failed to download voices. Check your internet connection.
        pause
        exit /b 1
    )
    echo Voices downloaded.
) else (
    echo Voices file already exists.
)

REM Check espeak-ng
where espeak-ng >nul 2>&1
if errorlevel 1 (
    if exist "C:\Program Files\eSpeak NG\espeak-ng.exe" (
        echo espeak-ng found at C:\Program Files\eSpeak NG\
    ) else (
        echo.
        echo WARNING: espeak-ng not found!
        echo Please install it from: https://github.com/espeak-ng/espeak-ng/releases
        echo Download the .msi installer for Windows x64.
        echo.
    )
) else (
    echo espeak-ng found on PATH.
)

echo.
echo ============================================
echo  Setup complete!
echo ============================================
echo.
echo To start the TTS server, run:
echo   start-local-tts.bat
echo.
echo Or manually:
echo   cd server\local-tts
echo   venv\Scripts\activate
echo   python tts_server.py
echo.
pause
