@echo off
title Pixory Emulator Starter
echo Starting Android Emulator (Pixory_API_35) with Software Rendering...
echo Please wait for the window to appear.
echo Do not close this black window, or the emulator will close!
echo.

emulator -avd Pixory_API_35 -gpu swiftshader_indirect -no-snapshot-load

echo.
echo Emulator closed.
pause
