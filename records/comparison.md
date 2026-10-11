이 문서는 배포한 결과 페이지(`site/index.html`)와 같은 내용을 저장소 안에 문서로 남긴 것입니다.

대화가 끊겨도 이어지는 프로젝트

# 한 AI가 멈춘 작업을, 다른 AI가 문서만 보고 이어서 끝냈습니다.

앞 대화 없이 저장소와 인수인계 문서만 받은 AI가 템플릿 이름 중복 정리 기능을 완성하는지 시험했습니다.  
서비스·모델 이름과 작업 순서는 가리고 AI 가, AI 나로만 표시합니다.

> 같은 검사 10개에서 AI 가는 10개 모두 통과, AI 나는 8개 통과(K09, K10 실패)했습니다.

## 무엇을 시험했나요?

밈 카드 스튜디오에서 템플릿 이름이 겹치면 `(2)`, `(3)`처럼 가장 작은 빈 번호를 붙이는 기능을 만들게 했습니다.  
두 AI는 같은 최초 요청, 같은 검사 10개, 같은 상한(15분, 5회)으로 일했고, 검사는 사람이 브라우저에서 직접 실행했습니다.

1. 한 AI가 새 템플릿 저장 기능까지 만들고, 수정 저장과 JSON 가져오기는 남긴 채 멈췄습니다.
2. 멈추면서 목표, 현재 상태, 실행 명령 등 일곱 칸의 인수인계 문서를 남겼습니다.
3. 다른 AI가 앞 대화 없이 js/app.js와 인수인계 문서만 받아 남은 기능을 이어서 만들었습니다.
4. 고정한 검사 K01~K10을 사람이 브라우저에서 직접 실행해 PASS/FAIL을 기록했습니다.

## 비교

| | 작업시간 | 요청 수 | 오류 수 | 검사 통과 |
|---|---:|---:|---:|---:|
| AI 가 | 1분 | 1회 | 0 | 10 / 10 |
| AI 나 | 2분 | 1회 | 1 | 8 / 10 |

오류 수는 FAIL이 하나라도 나온 실행 회차의 수이며, 두 AI 모두 한 회차씩 실행했습니다.

## 검사 10개 결과

| 검사 | 확인한 내용 | AI 가 | AI 나 |
|---|---|---|---|
| K01 | `고양이`를 저장하면 이름 그대로 저장됩니다. | PASS | PASS |
| K02 | 같은 이름을 한 번 더 저장하면 `고양이 (2)`가 됩니다. | PASS | PASS |
| K03 | 세 번째로 저장하면 `고양이 (3)`이 되며, 직접 만든 템플릿 3개 한도의 경계 상황입니다. | PASS | PASS |
| K04 | `고양이 (2)`를 삭제하고 저장하면 비어 있는 가장 작은 번호 (2)가 다시 쓰입니다. | PASS | PASS |
| K05 | 이름을 비우고 저장하면 `템플릿 1`이 됩니다. | PASS | PASS |
| K06 | 15자 이름을 두 번 저장하면 두 번째는 뒤에 (2)가 붙은 19자로 잘리지 않고 저장됩니다. | PASS | PASS |
| K07 | 끝에 공백이 있는 같은 이름도 같은 이름으로 보고 `고양이 (2)`가 됩니다. | PASS | PASS |
| K08 | 기본 템플릿과 같은 이름을 쓰면 `기본 템플릿 1 (2)`가 됩니다. | PASS | PASS |
| K09 | 수정 저장에서 다른 템플릿과 이름이 겹치면 `B (2)`가 되고 자기 이름은 유지됩니다. | PASS | FAIL |
| K10 | JSON 가져오기에서 겹친 이름은 `고양이 (2)`로 추가되고 3개 한도 초과는 거부됩니다. | PASS | FAIL |

## 이 결과를 확인하는 방법

1. 소스 버전 표의 종료 버전 두 개를 각각 열면 `js/app.js` 한 파일의 변경만 보입니다.
2. 검사 결과 문서 두 개의 K01~K10 표가 위의 검사 10개 결과와 같은지 비교합니다.
3. 인수인계 문서에 일곱 제목(목표·현재 상태·실행 명령 등)이 모두 있는지 확인합니다.

통과 변경은 `js/app.js` 한 파일이고, PASS 수와 일곱 제목이 이 페이지와 같습니다.  
안 될 때 새 시크릿 창에 주소를 다시 붙여 넣어도 안 열리면 저장소가 비공개이거나 삭제된 것입니다.

## 소스 버전

재작업량은 제출 뒤 채점기가 `js/app.js` 한 파일을 기준으로 이 버전 쌍으로 계산합니다.

| | 시작 | 종료 |
|---|---|---|
| AI 가 | [0ad488e](https://github.com/onboardingsecurity/AI-LLM/commit/0ad488e8841590a88cf544d34dd3e37c8d325e17) | [54e76d5](https://github.com/onboardingsecurity/AI-LLM/commit/54e76d52e87983e4ff4438109d88e7211487cbb5) |
| AI 나 | [1603d0b](https://github.com/onboardingsecurity/AI-LLM/commit/1603d0ba6731d01891e901aca0f841a4cb3b64b4) | [0ad488e](https://github.com/onboardingsecurity/AI-LLM/commit/0ad488e8841590a88cf544d34dd3e37c8d325e17) |

## 관련 문서

- [인수인계 문서](https://github.com/onboardingsecurity/AI-LLM/blob/a2c5e4584fade4f7a4d7d8ef352f60870d7d781d/docs/HANDOVER.md): 앞 작업자가 남긴 일곱 칸 문서이며 실행 방법 1~4단계도 들어 있습니다.
- [AI 나 검사 결과](https://github.com/onboardingsecurity/AI-LLM/blob/a2c5e4584fade4f7a4d7d8ef352f60870d7d781d/records/results_a.md), [AI 가 검사 결과](https://github.com/onboardingsecurity/AI-LLM/blob/a2c5e4584fade4f7a4d7d8ef352f60870d7d781d/records/results_b.md): K01~K10 각각의 PASS/FAIL을 적은 원본 기록입니다.
- [인수인계 누락 기록](https://github.com/onboardingsecurity/AI-LLM/blob/a2c5e4584fade4f7a4d7d8ef352f60870d7d781d/records/handover_gaps.md): 받은 쪽이 확인하지 못한 세 가지와 문서를 고친 전후 내용을 적었습니다.
- [새 폴더 재현 기록](https://github.com/onboardingsecurity/AI-LLM/blob/a2c5e4584fade4f7a4d7d8ef352f60870d7d781d/records/repro.md): 새 폴더에서 실행 방법 1~4단계를 따라 해 화면이 열리고 K01이 통과한 결과를 적었습니다.
- [다음 작업 도구 선택 기준](https://github.com/onboardingsecurity/AI-LLM/blob/a2c5e4584fade4f7a4d7d8ef352f60870d7d781d/records/submission.md): 이 비교 결과를 보고 정한 기준을 한 문장으로 적었습니다.
