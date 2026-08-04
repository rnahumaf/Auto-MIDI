@echo off
setlocal
cd /d "%~dp0"

if /I "%~1"=="install" goto install
if /I "%~1"=="check" goto check
if /I "%~1"=="demo" goto demo
if /I "%~1"=="preview" goto preview
if /I "%~1"=="skills" goto skills
if /I "%~1"=="pack" goto pack
if not "%~1"=="" goto usage

:menu
echo.
echo Auto-MIDI
echo [1] Instalar dependencias
echo [2] Typecheck + testes + build
echo [3] Gerar demonstracao MIDI
echo [4] Validar skills
echo [5] Inspecionar pacote npm
echo [6] Renderizar previas com SoundFont
echo [0] Sair
choice /c 1234560 /n /m "Escolha: "
if errorlevel 7 exit /b 0
if errorlevel 6 goto preview
if errorlevel 5 goto pack
if errorlevel 4 goto skills
if errorlevel 3 goto demo
if errorlevel 2 goto check
if errorlevel 1 goto install

:install
npm install
goto end

:check
npm run check
goto end

:demo
npm run demo
goto end

:preview
npm run preview:demo
goto end

:skills
npm run validate:skills
goto end

:pack
npm run pack:check
goto end

:usage
echo Uso: auto-midi.cmd [install^|check^|demo^|preview^|skills^|pack]
exit /b 1

:end
set "EXITCODE=%ERRORLEVEL%"
if "%~1"=="" pause
exit /b %EXITCODE%
