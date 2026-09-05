# 🚀 물리 놀이터 3D

포물선 운동, 충돌과 운동량, 롤러코스터 에너지, 중력과 행성 궤도를 조작하는 한국어 교육용 웹앱입니다. Gemini API 키를 등록하면 현재 실험을 함께 보는 AI 물리 선생님에게 질문할 수 있습니다.

## Netlify 배포

Netlify에서 **Add new project → Import an existing project → GitHub**를 선택하고 이 저장소를 연결합니다. 저장소의 `netlify.toml`이 아래 설정을 적용합니다.

| 항목 | 값 |
|---|---|
| Branch | `main` |
| Base directory | `physics-playground-3d` |
| Build command | 비워 두기 |
| Publish directory | `.` |

**npm 설치나 빌드가 필요 없는 정적 HTML/CSS/JS 앱입니다.** 배포가 끝나면 Netlify가 제공하는 주소를 열면 됩니다. 방문자는 Python을 설치할 필요가 없습니다.

[Netlify 공식 배포 안내](https://docs.netlify.com/build/configure-builds/overview/)

## 내 컴퓨터에서 실행

1. **Code → Download ZIP**을 선택하고 압축을 풉니다.
2. `physics-playground-3d` 폴더 안에서 Windows는 **실행하기.bat**, Mac은 **실행하기.command**를 두 번 클릭합니다.
3. 실행 창을 그대로 두고 **http://localhost:8000**을 엽니다. Python 3가 필요합니다.

자세한 설치·실행·문제 해결은 [실행방법.txt](physics-playground-3d/실행방법.txt)에 있습니다. `index.html`을 직접 두 번 클릭해서 실행하면 안 됩니다.

## 구현된 기능

- 포물선: 각도·속도·지구/달/화성 중력, 최대 3개 궤적, 100m 과녁
- 충돌: 질량·초기 속도·반발계수, 붙는 충돌, 운동량·운동에너지 막대 비교
- 롤러코스터: 높이·마찰, 두 언덕과 루프, 위치·운동·열 에너지의 보존, 되돌아오기
- 행성 궤도: 거리·속도·항성 질량, 속도 베르레 적분, 궤도 분류와 공전 주기, 최근 2000점
- 실시간 측정, 12개 미션, 브라우저 별 저장, 전체화면 F 및 숫자키 1~4
- Gemini AI 선생님: 학년별 설명, 빠른 질문, 현재 실험 JSON, 최근 10턴, 한국어 오류 안내
- 설정: API 키 저장·삭제, 모든 학습 기록 초기화

## AI 설정

⚙️ 선생님 설정에서 본인의 [Google AI Studio API 키](https://aistudio.google.com/apikey)를 등록합니다. 키가 없어도 네 실험은 작동합니다.

모델은 요청한 **`gemini-3.7-flash`**입니다. 해당 모델이 계정에서 제공되지 않으면 `physics-playground-3d/js/ai-teacher.js` **1번째 줄**의 `GEMINI_MODEL`을 사용 가능한 모델명으로 바꾸세요. 코드에는 실제 키를 넣지 않습니다.

키는 현재 브라우저에 저장되며 질문할 때 인증용 키, 질문과 실험 정보가 Google Gemini API로 전송됩니다. 대화 내용은 브라우저 저장소에 영구 저장하지 않습니다.

## 수업용 모형의 범위

- 포물선은 발사점과 착지점 높이가 같고 공기저항이 없습니다.
- 충돌은 바깥 힘이 없는 1차원 모형이며 두 공의 크기는 같습니다.
- 롤러코스터는 회전·레일 이탈을 생략한 질점 모형입니다. 열은 마찰력×이동 거리로 계산합니다.
- 궤도는 교육용 단위의 G=1, 행성 질량 1kg을 사용하며 항성은 고정합니다.

기본 포물선(45°, 30m/s, 지구)은 거리 **91.8m**, 최고 높이 **23.0m**, 체공 시간 **4.33초**입니다. 같은 조건의 달에서는 거리 **562.5m**입니다.

## 검증과 제한

JavaScript 문법, HTTP 응답, 포물선 경계값, 54개 충돌 조합, 롤러코스터 에너지 보존·루프·되돌아오기, 원 궤도 에너지 오차·공전 주기·탈출 및 실제 모듈의 미션·초기화 로직을 점검했습니다.

**작업 환경 브라우저의 WebGL이 비활성화되어 실제 3D 렌더링과 시각적 반응형 검증은 미완료입니다. 실제 Gemini 응답은 사용자 API 키로 확인해야 합니다.**

`package.json`, `preview-server.mjs`, `qa/`는 개발 환경 점검용입니다. Netlify는 `physics-playground-3d/`만 공개하며 학생용 앱은 Node/npm을 사용하지 않습니다.
