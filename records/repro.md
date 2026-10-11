# 새 폴더 재현 기록 (T05-C11)

인수인계 문서(docs/HANDOVER.md)의 실행 방법을 새 폴더에서 따라 해서 재현되는지 확인한 기록이다.

- 실행한 사람: 사용자
- 확인한 때: 2026-10-12 00:05 무렵(이 기록을 쓴 시각)
- 대상 문서: docs/HANDOVER.md (c99842f 시점, 실행 방법 1~4단계 보강 포함)
- 대상 코드: js/app.js, AI B 종료 버전(54e76d52e87983e4ff4438109d88e7211487cbb5)

## 한 일

새 폴더(repro)에서 문서의 1~4단계를 그대로 따라 했다.

1. `git clone --branch ai-meme-card-studio --single-branch https://github.com/onboardingsecurity/AI-LLM.git meme-card-studio`
2. `cd meme-card-studio`
3. `js/app.js`를 이 저장소의 `js/app.js`로 덮어쓴다.
4. `python3 -m http.server`로 서버를 띄우고 브라우저에서 접속한다.

문서와 다른 점: 서버 포트를 문서의 8765가 아니라 8000으로 띄웠다. 방식은 같다.

## 결과

- 사용자 보고: 문서의 단계대로 끝까지 진행했고 막히거나 오류가 난 곳은 없었다.
- 화면이 열렸고 K01(이름 `고양이`로 새 템플릿 저장)을 실행했다. 목록에 `고양이`가 나왔다. (기대값과 같다)
- 결과: 재현됨

## 참고

- 이 구성(meme-card-studio 폴더 + 이 저장소의 js/app.js + 서버)으로 K01~K10 전체를 이미 실행했다. AI B 종료 버전에서 10/10 PASS (records/results_b.md).
- 이 저장소에는 js/app.js만 있어서 문서의 첫 실행 명령만으로는 열리지 않는다. 이 점을 records/handover_gaps.md의 누락 3으로 기록하고 문서에 1~4단계를 보강했다.
