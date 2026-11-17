@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ==================================================
echo   Chess Assistant - сборка EXE для Windows
echo ==================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ОШИБКА] Node.js не найден.
  echo Установите Node.js LTS с https://nodejs.org и запустите build.bat снова.
  echo.
  pause
  exit /b 1
)

echo [1/3] Установка зависимостей (нужен интернет, первый раз ~2-5 минут)...
call npm install
if errorlevel 1 (
  echo [ОШИБКА] npm install не удался.
  pause
  exit /b 1
)

echo.
echo [2/3] Проверка распознавания и стратегий...
call npm test
if errorlevel 1 (
  echo [ПРЕДУПРЕЖДЕНИЕ] Самопроверка не прошла, но продолжаю сборку.
)

echo.
echo [3/3] Сборка ChessAssistant.exe...
call npm run pack
if errorlevel 1 (
  echo [ОШИБКА] Сборка не удалась.
  pause
  exit /b 1
)

echo.
echo ==================================================
echo   ГОТОВО!
echo   Программа: dist\ChessAssistant-win32-x64\ChessAssistant.exe
echo ==================================================
start "" explorer "%~dp0dist\ChessAssistant-win32-x64"
pause
endlocal
