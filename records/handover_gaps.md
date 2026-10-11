# 인수인계 누락 기록

AI A가 남긴 문서(docs/HANDOVER.md)를 AI B가 받아 작업하면서 막히거나 확인하지 못한 곳을 문서 누락으로 기록한다.

누락: 있음 (3건. 누락 1·2는 AI B가 작업이 막힌 것은 아니고 확인하지 못했다고 밝힌 것, 누락 3은 재현 중 발견한 것)

AI B에게 앞 대화를 요구받았나: 없음. AI B는 대화 전문을 요구하지 않았다.

## 누락 1: 이름 입력칸 글자 수 제한

- AI B가 밝힌 내용: "K06은 이름 입력칸의 maxlength가 15인지 HTML에서 확인하지 못했다."
- 원인: 인수인계 문서에 index.html의 입력칸 제한 정보가 없었고, AI B에게 index.html도 주지 않았다.
- 영향: K06 판정 근거(15자 입력)를 AI B가 코드만으로 확인하지 못했다. 결과에는 영향이 없었다(K06은 PASS).

## 누락 2: K10의 JSON 파일 준비 방법

- AI B가 밝힌 내용: "K09와 K10은 JSON 파일을 미리 준비해 두고 실행한다." 준비 방법은 문서에도 plan.md에도 없었다.
- 영향: 검사를 실제로 돌릴 사람이 파일을 어떻게 만드는지 몰랐다. 결과에는 영향이 없었다.

## 누락 3: 이 저장소만으로는 앱이 열리지 않는다 (C11 재현 시 발견)

- 발견한 때: AI B 종료 뒤, 새 작업 폴더에서 문서의 실행 명령을 재현하는 과정에서 확인했다. AI B가 밝힌 것은 아니다.
- 내용: 인수인계 문서는 "저장소 루트에서 python3 -m http.server 8765를 실행한다"고 했지만, 이 저장소에는 js/app.js만 있어서 index.html, css, 이미지가 없다. 문서의 명령만으로는 화면이 열리지 않는다.
- 영향: AI B가 받은 문서에도 같은 문제가 있었다. AI B는 코드만 읽고 작업해 막히지 않았다.

## 문서 수정 전후

수정한 파일: docs/HANDOVER.md ("실행 명령" 항목 끝에 추가. 누락 1·2의 보강, 누락 3의 보강 순서로 두 번에 걸쳐 추가함)

누락 3 보강 수정 전 (누락 1·2 보강만 들어 있는 상태, 시작 부분)

```
브라우저에서 http://localhost:8765/에 접속한다.

검사 준비 (AI B가 확인하지 못해 보강한 내용)
```

누락 3 보강 수정 후 (추가된 부분)

```
브라우저에서 http://localhost:8765/에 접속한다.

이 저장소에는 js/app.js만 들어 있어서 위 명령만으로는 화면이 열리지 않는다. 앱 전체(index.html, css, 이미지)는 GitHub의 ai-meme-card-studio 브랜치 6908a03에 있다. 아래처럼 새 폴더에 받고 이 저장소의 js/app.js로 덮어쓴 뒤 실행한다.

1. git clone --branch ai-meme-card-studio --single-branch https://github.com/onboardingsecurity/AI-LLM.git meme-card-studio
2. cd meme-card-studio
3. js/app.js를 이 저장소의 js/app.js로 덮어쓴다.
4. python3 -m http.server 8765 를 실행하고 http://localhost:8765/ 에 접속한다.

검사 준비 (AI B가 확인하지 못해 보강한 내용)
```

누락 1·2 보강 (앞서 한 수정)

수정한 위치: docs/HANDOVER.md ("실행 명령" 항목 끝)

수정 전 (AI B가 받은 문서, records/handover_received.md와 같음)

```
브라우저에서 http://localhost:8765/에 접속한다.

## 통과 검사
```

수정 후

```
브라우저에서 http://localhost:8765/에 접속한다.

검사 준비 (AI B가 확인하지 못해 보강한 내용)

- 이름 입력칸은 index.html에서 최대 15자(maxlength 15)로 막혀 있다. 저장 데이터는 이름 40자까지 허용한다.
- K10의 JSON 파일은 앱에서 템플릿을 저장한 뒤 "JSON 내보내기"로 만든 파일을 "JSON 가져오기"로 다시 가져와 쓴다.

## 통과 검사
```

## 같은 문서 유지 확인

- AI A가 남긴 문서와 AI B가 받은 문서는 바이트 단위로 같다. (records/handover_received.md = AI B에게 준 시점의 docs/HANDOVER.md, cmp로 확인)
- 위 보강은 AI B가 받은 뒤에 한 수정이라서 records/handover_received.md에는 반영하지 않았다.
