#!/bin/bash
cd -- "$(dirname -- "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3를 먼저 설치해 주세요: https://www.python.org/downloads/"
  read -r -p "Enter 키를 누르면 닫힙니다. "
  exit 1
fi
echo "물리 놀이터 3D를 실행합니다. 이 창을 그대로 두세요."
echo "브라우저 주소: http://localhost:8000"
open "http://localhost:8000"
python3 -m http.server 8000 --bind 127.0.0.1
read -r -p "서버가 종료되었습니다. Enter 키를 누르면 닫힙니다. "
