@echo off
chcp 65001 >nul
cd /d "%~dp0"
py -3 --version >nul 2>&1
if not errorlevel 1 (
  set "PHYSICS_PYTHON=py -3"
  goto run
)
python3 --version >nul 2>&1
if not errorlevel 1 (
  set "PHYSICS_PYTHON=python3"
  goto run
)
python --version >nul 2>&1
if not errorlevel 1 (
  set "PHYSICS_PYTHON=python"
  goto run
)
echo Python 3를 먼저 설치해 주세요: https://www.python.org/downloads/
echo 설치 후 이 파일을 다시 두 번 클릭하세요.
pause
exit /b 1
:run
echo 물리 놀이터 3D를 실행합니다. 이 창을 그대로 두세요.
echo 브라우저 주소: http://localhost:8000
start "" "http://localhost:8000"
%PHYSICS_PYTHON% -m http.server 8000 --bind 127.0.0.1
echo 서버가 종료되었습니다. 오류가 보이면 실행방법.txt를 확인해 주세요.
pause
