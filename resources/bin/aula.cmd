@echo off
rem AULA Toolkit command-line launcher. Runs the CLI script with the app's own executable in Node mode,
rem so no separate Node.js install is needed. Usage: aula help
setlocal
set "ELECTRON_RUN_AS_NODE=1"
"%~dp0..\..\AULA Toolkit.exe" "%~dp0..\cli\aula.js" %*
set "AULA_EXIT=%ERRORLEVEL%"
endlocal & exit /b %AULA_EXIT%
