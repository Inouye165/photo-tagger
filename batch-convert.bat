@echo off
echo ========================================
echo HEIC to JPEG Batch Converter
echo ========================================
echo.

REM Check if ImageMagick is available
magick -version >nul 2>&1
if errorlevel 1 (
    echo ERROR: ImageMagick not found!
    echo Please install ImageMagick first:
    echo   winget install ImageMagick.ImageMagick
    pause
    exit /b 1
)

echo ImageMagick found - ready to convert!
echo.

REM Get input folder from user
set /p "INPUT_FOLDER=Enter path to folder with HEIC files: "
if not exist "%INPUT_FOLDER%" (
    echo ERROR: Folder does not exist!
    pause
    exit /b 1
)

REM Create output folder
set "OUTPUT_FOLDER=%~dp0converted-jpegs"
if not exist "%OUTPUT_FOLDER%" mkdir "%OUTPUT_FOLDER%"

echo.
echo Converting HEIC files from: %INPUT_FOLDER%
echo Saving JPEG files to: %OUTPUT_FOLDER%
echo.

REM Convert all HEIC files
set COUNT=0
for %%F in ("%INPUT_FOLDER%\*.heic" "%INPUT_FOLDER%\*.HEIC" "%INPUT_FOLDER%\*.heif" "%INPUT_FOLDER%\*.HEIF") do (
    if exist "%%F" (
        set /a COUNT+=1
        echo Converting: %%~nxF
        magick "%%F" -quality 92 "%OUTPUT_FOLDER%\%%~nF.jpg"
        if errorlevel 1 (
            echo   ERROR: Failed to convert %%~nxF
        ) else (
            echo   SUCCESS: Saved as %%~nF.jpg
        )
    )
)

echo.
if %COUNT%==0 (
    echo No HEIC files found in the specified folder.
) else (
    echo Conversion complete! Processed %COUNT% files.
    echo.
    echo Converted files are in: %OUTPUT_FOLDER%
    echo You can now load these JPEG files in your photo app.
)

echo.
echo Press any key to exit...
pause >nul
