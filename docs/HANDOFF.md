# 핸드오프 — 패스키로 나만의 자리 잠그기 (8번 과제)

작성일: 2026-10-22 · 브랜치: `ai-passkey-on-my-introduction-page` · 이 문서만 읽고 이어서 작업할 수 있도록 적었습니다.

관련 문서: [요구사항 명세서](REQUIREMENTS.md) · [보안 점검 리스트](SECURITY-CHECKLIST.md) · [인증 구현 설명서(제출용)](../AUTH.md)

## 1. 한 줄 요약

1번 과제의 자기소개 페이지(공개)에 **패스키로만 열리는 "나만의 자리"**를 이어 붙였고, **Vercel + Supabase로 배포**했습니다. Supabase는 리전을 잘못 골라 **서울 리전 새 프로젝트로 다시 만들었고**(2026-10-21 밤), 그 뒤 배포 주소에서 **계정 A 패스키 등록·로그인까지 성공**했습니다(이전의 DB 500은 해결됨). 지금 막힌 곳은 ① **배포 주소에서 두 번째 패스키 추가가 `challenge_missing`으로 실패한 것(미해결, 로컬에서는 정상)**, ② 사용자가 브라우저에서 패스키를 직접 지워서 **서버 DB에 계정 A 행이 남아 "처음 등록하기"가 `login_required`로 막힌 것**(§6-1의 1번으로 복구)입니다. 배포는 **제출 직전에 한 번만 다시** 하기로 했습니다.

- 배포 주소: https://skt-aleph-ai-passkey-on-my-introduc.vercel.app (첫 화면 `/`는 `/index.html`로 이동하는 공개 소개 페이지)
- 소스: https://github.com/onboardingsecurity/AI-LLM (브랜치 `ai-passkey-on-my-introduction-page`)

## 2. 현재 상태 (2026-10-22)

| 구분 | 상태 |
|---|---|
| 서버·화면 구현 (카드 1~5) | ✅ 완료. `npm test` 30개 통과(파일·메모리 저장소 기준, 2026-10-22 재확인) |
| 로컬 실제 기기 확인 (Mac Chrome, `localhost`, 2026-10-21 밤) | ✅ 등록, 로그인, 새로고침 뒤 로그인 유지, 두 번째 패스키 추가, 삭제 뒤 남은 패스키로 로그인, 같은 위치 중복 등록 거절(팝업), 삭제된 패스키 거절(팝업), 로그인·로그아웃 알림, 이름 칸 초기화. **임시 폴더로 실행해 증빙 `logs/auth-log.jsonl`은 건드리지 않음**, 끝나고 서버·임시 파일 정리 완료 |
| 취소 화면 (C25) | ✅ Windows Chrome 실기기 화면과 서버 기록(이전 세션) |
| Supabase | ✅ **새 프로젝트(서울 리전, 새 계정)**. `supabase/schema.sql` 적용, 4개 테이블 RLS `true` 확인. 이전 프로젝트(리전 오류)는 쓰지 않음. 새 Project URL은 점검 명령 ⑫가 찾는 패턴이라 **문서에 적지 않음**(대시보드 Project Settings → Data API에서 확인) |
| Vercel 환경변수 | ✅ `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 새 프로젝트 값으로 교체, `SETUP_CODE`는 새로 만들어 넣음(사용자가 클립보드로 생성, 값은 어디에도 기록하지 않음). `ORIGIN` 값이 접속 주소와 달라 `bad_origin`(403, "허용되지 않은 출처의 요청입니다")이 나왔고 사용자가 고쳐 재배포해 해결 |
| 배포 주소의 DB 요청 | ✅ 정상(2026-10-22 확인). `POST /api/login/options` 200, 틀린 설정 코드 403 `bad_setup_code`. 이전 08:27 UTC 이후의 500은 새 Supabase로 바꾼 뒤 사라짐(원인은 끝내 확인하지 못함) |
| 배포 주소에서 **실제 패스키 등록·로그인** | ✅ 계정 A `배포 테스트 1`(Google 비밀번호 관리자) 등록(2026-10-21 14:31 UTC)과 로그인 성공 |
| 배포 주소에서 **두 번째 패스키 추가** | ❌ **미해결.** 같은 화면에서 "로그인 질문이 없습니다. 처음부터 다시 시도해 주세요."(`challenge_missing`)가 남. 로컬 파일 저장소에서는 같은 동작이 정상 → Supabase·Vercel 쪽 원인일 가능성이 큼(§6-1의 2번) |
| 현재 막힌 상태 | 사용자가 Chrome/Google 비밀번호 관리자에서 계정 A 패스키를 직접 지움 → 브라우저에는 패스키가 없는데 **Supabase `passkeys`에 `배포 테스트 1` 행이 1개 남음** → "처음 등록하기"가 401 `login_required`. 복구 SQL은 §6-1의 1번. **사용자가 실행했는지는 아직 모름** |
| 배포된 `auth.js` | 사용자가 2026-10-22에 배포. 확인: 배포 주소의 `/auth.js`가 그 시점 저장소 파일과 **바이트 단위로 같음**(`ab8d947`까지의 수정). **이후 수정(§3-3의 마지막 두 항목)은 아직 배포 안 됨** → 제출 직전 최종 배포 때 반영 |
| 요구사항 47개 | ✅40 ⏳4(C10, C26, C47, C53) ➖3(C01~C03) ❌0 (2026-10-22 재점검) |
| 보안 29개 | ✅24 ⏳3(S12, S23, S27) ➖2(S25, S29) ❌0 (2026-10-22 재점검) |
| 설명서 `AUTH.md` | ⏳ 초안 완료, `【사용자 작성】` **9줄**(맨 위 안내문 1줄 포함) 남음 |
| 점검 문서의 "최근 점검 결과" | 아직 **2026-10-21 값**. 갱신은 사용자 승인 대기 |
| Git | 푸시된 커밋 `ab8d947` 이후 `public/auth.js` 수정과 이 문서를 같은 날 커밋·푸시함(`git log`로 확인) |

## 3. 지금까지 한 일

### 3-1. 구현과 검증
- Node(Express 5) + `express-session` + `@simplewebauthn/server`. 비공개 자료는 로그인한 계정 것만 서버가 내려 줌. 상세는 [AUTH.md](../AUTH.md).
- 가상 인증기로 서버를 끝까지 시험하는 `npm test`(30개). 시험이 만든 임시 폴더와 Supabase 행은 **끝나면 항상 지움**(성공·실패·설정 오류 모두).

### 3-2. Supabase 저장소 전환과 배포
- 이유: Vercel 함수는 메모리·파일이 유지되지 않음 → 패스키·세션·질문·실패 횟수를 Supabase로 옮김.
- `store.js`: 저장소 계층. `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`가 있으면 Supabase, 없으면 파일·메모리. **Vercel에서 키가 없으면 시작 거부**, Supabase 사용 때 `SESSION_SECRET`·`SETUP_CODE`도 필수.
- `supabase/schema.sql`: 테이블 4개(`passkeys`, `sessions`, `challenges`, `auth_failures`)와 `delete_passkey` 함수. RLS를 켜고 정책은 만들지 않음(공개 키로는 못 읽음).
- `public/`: `index.html`(5.7MB)과 `auth.js`를 옮김. Vercel 함수 응답 한도가 4.5MB라서 정적 파일로 서빙해야 함.
- 사용자 결정: Vercel↔GitHub 연동과 CLI 로그인은 쓰지 않고 **Vercel Drop**으로 배포. 배포에 담은 파일(8개): `server.js`, `store.js`, `package.json`, `package-lock.json`, `vercel.json`, `public/`(`index.html`, `auth.js`), `data/private-data.json`. `node_modules`는 넣지 않음.
- `vercel.json`: `/`를 `/index.html`로 보내는 `redirects`(307)와 응답 헤더 3종.
- 환경변수 6개(값은 Vercel에만 있고 문서·채팅에 없음):

| 이름 | 내용 |
|---|---|
| `ORIGIN` | `https://skt-aleph-ai-passkey-on-my-introduc.vercel.app` (끝에 `/` 없이, 앞뒤 공백 없이, **접속 주소와 글자까지 같아야 함**. 다르면 모든 상태 변경 요청이 `bad_origin` 403) |
| `RP_ID` | `skt-aleph-ai-passkey-on-my-introduc.vercel.app` |
| `SUPABASE_URL` | Supabase Project URL (새 프로젝트 값) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **Secret** 키(접두사가 `sb_`로 시작). **Publishable/anon 키는 쓰면 안 됨**(RLS 정책이 없어 서버도 막힘) |
| `SESSION_SECRET` | 무작위 긴 값 |
| `SETUP_CODE` | 첫 등록용 코드. 값을 사용자가 알아야 등록 화면에 입력할 수 있음(2026-10-21에 새로 만듦) |

### 3-3. 이번 세션(2026-10-21 밤 ~ 10-22)에 바꾼 것

**Supabase 재생성 순서(다시 해야 할 때 그대로 따라 하면 됨)**
1. 새 프로젝트를 **서울(Northeast Asia) 리전**으로 만듦. 무료 플랜은 조직당 활성 프로젝트 2개 제한이라 한도가 차면 다른 계정(조직)을 쓰거나 안 쓰는 프로젝트를 일시 중지(Pause, 되돌릴 수 있음)해야 함.
2. SQL Editor에 `supabase/schema.sql` 전체를 붙여 넣고 Run → `Success`.
3. RLS 확인 SQL: `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname in ('passkeys','sessions','challenges','auth_failures');` → 4개 모두 `true`.
4. Vercel Settings → Environment Variables에서 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 교체, `SETUP_CODE`·`ORIGIN` 확인 → **Redeploy**.
5. `curl`로 확인(§5-3).

**`public/auth.js` 수정(사용자 요청, 로컬에서 실기기 확인 후)** — 모두 **기존 줄 안에서** 고쳐 `AUTH.md` ③의 줄 번호(`auth.js` 206·218·225·263·273·287)를 유지함.
- 로그인 버튼(263줄): 서버 세션이 이미 살아 있으면 **새 서명(지문) 없이 화면만 갱신**. 새로고침 직후 잠금 화면이 잠깐 보이는 사이에 버튼을 눌러도 지문 창이 뜨지 않음. 서버는 그대로이고 비공개 자료는 여전히 서버가 판단.
- 알림 팝업(`alert`):
  - 로그인 성공 "로그인되었습니다." (팝업만, 상태 줄 문구 없음)
  - 로그아웃 "정상적으로 로그아웃되었습니다." (팝업만)
  - 같은 위치에 중복 등록(`InvalidStateError`) "이미 패스키가 존재합니다. 다른 기기나 보안 키로 등록해 보세요." (팝업 + 상태 줄)
  - 삭제됐거나 서버에 없는 패스키(`unknown_credential`) "서버에 등록되어 있지 않은 패스키입니다." (팝업 + 상태 줄, 괄호 설명은 뺌)
  - 패스키가 이미 있는 계정을 로그인 없이 "처음 등록하기"로 등록(`login_required`) "이미 패스키가 존재합니다. 로그인 후 시도해주세요." (팝업만, 상태 줄 비움)
- 로그인 창을 취소하면(`NotAllowedError`) 상태 줄에 아무 문구도 띄우지 않음("로그인을 취소했거나 사용할 패스키가 없습니다." 제거). 다른 실패는 "패스키로 들어가지 못했습니다."
- 삭제 확인창 "삭제 시 해당 패스키로는 더 이상 들어올 수 없습니다. 삭제하시겠습니까?", 삭제 뒤 "<패스키 이름> 패스키를 삭제했습니다. 남은 패스키: N개".
- "패스키 하나 더 등록" 이름 칸은 추가를 시도한 직후(성공·실패 모두)와 잠금 화면으로 돌아갈 때 비워짐.
- 마지막 두 항목(로그인 취소 문구 삭제, 등록의 `login_required` 알림)은 **아직 배포되지 않았고 브라우저에서도 시험하지 않음**.

### 3-4. 배포 주소에서 확인한 것 (2026-10-22, 읽기 요청만)
- `/` 307 → `/index.html` 200, `/auth.js`가 저장소 파일과 같음
- `/api/accounts` 200(계정 A·B), `/api/session` 200 `loggedIn:false`, 로그인 없이 `/api/private` **401** `login_required`
- DB 쓰기: `POST /api/login/options` 200(질문 발급, `rpId`가 배포 도메인), 틀린 설정 코드로 등록 시도 **403** `bad_setup_code`
- 소스·설정 파일 직접 요청(`/server.js`, `/store.js`, `/package.json`, `/data/private-data.json`, `/supabase/schema.sql`, `/AUTH.md`, `/.git/config`, `/logs/…`, `/node_modules/`, `/public/index.html`, `/docs/HANDOFF.md`) **모두 404**
- 다른 출처(`Origin: https://evil.example`) 변경 요청 **403**
- 보안 헤더: `Strict-Transport-Security`(max-age 63072000, includeSubDomains, preload), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`. API는 `Cache-Control: no-store`. CSP는 없음(S23 ⏳)
- DB에 시험 요청으로 임시 행(질문, 세션, 실패 기록)이 생길 수 있음. 세션 행은 만료돼도 자동으로 지워지지 않음(§7-2).

### 3-5. 점검 결과 (2026-10-22, 커밋 전)
- 보안 ✅24 / ⏳3 / ➖2 / ❌0, 요구사항 ✅40 / ⏳4 / ➖3 / ❌0. `npm test` 30/30, `npm audit` 0건.
- 명령 ①⑤⑫는 점검 문서가 적어 둔 명령 문자열이 **스스로 걸리는 것**(`docs/SECURITY-CHECKLIST.md`)을 빼면 0건. `index.html`의 `eyJ…` 같은 문자열은 base64 이미지 데이터의 우연한 일치(오탐).
- `index.html`의 `innerHTML`은 1번 원본에서 온 `innerHTML = ''` 두 건(내용 비우기)뿐.

### 3-6. 그 밖의 정리
- gstack(브라우저 도구)의 **프로젝트 안 흔적은 삭제함.** 전역 설치(`~/.claude/skills/gstack` 1.3GB, `~/.gstack`, `~/.claude/CLAUDE.md`의 gstack 항목)는 **사용자 결정 대기**(§6-2).
- 로컬 시험 뒤 임시 데이터(서버, 임시 패스키·기록 폴더, `passkey-e2e-*`)는 모두 지움. `npm install`로 만든 `node_modules/`(git 제외)는 남겨 둠.

## 4. 파일 지도

| 파일 | 역할 |
|---|---|
| `public/index.html` | 1번 소개 페이지 + 추가분(경계선, 나만의 자리). 5.7MB(base64 이미지)라 **통째로 읽지 말고 줄 범위로** 읽을 것. 줄 번호 기준은 `AUTH.md` ③ |
| `public/auth.js` | 브라우저 쪽(WebAuthn 호출, 화면 전환, 목록·삭제, 알림). 줄 번호가 `AUTH.md` ③에 적혀 있으니 **줄을 늘리거나 줄이는 수정은 `AUTH.md` 60~63행도 함께 갱신** |
| `server.js` | Express 서버. 등록·로그인·로그아웃·비공개 조회·패스키 목록/삭제. 앱을 `export default`, Vercel이 아닐 때만 포트를 엶 |
| `store.js` | 저장소 계층(Supabase 또는 파일·메모리) |
| `supabase/schema.sql` | 테이블·함수·RLS. 여러 번 실행해도 안전 |
| `vercel.json` | `/` → `/index.html` 리다이렉트, 응답 헤더 3종 |
| `data/private-data.json` | 지어낸 비공개 자료(계정 A·B 각 3개). 서버가 import |
| `data/passkeys.json` | **내 컴퓨터에서 실행할 때만** 생기는 패스키 저장소. git 제외. 지금은 없음. 있으면 **지우지 말 것** |
| `test/e2e.mjs` | 가상 인증기로 서버 시험(30개). `E2E_STORE=supabase`면 실제 Supabase로 시험하되 **모든 행을 지움** |
| `logs/auth-log.jsonl` | **실제 기기 요청·응답 기록(제출 증빙).** 시험·점검이 여기에 섞이지 않게 `LOG_FILE`을 임시 위치로 돌릴 것 |
| `logs/e2e-log.jsonl`, `e2e-report.json` | `npm test`를 돌릴 때마다 바뀌는 추적 파일. 커밋할 의도가 없으면 `git checkout`으로 되돌림 |
| `AUTH.md` | 제출용 인증 구현 설명서(여섯 항목 + 확인 방법 + 제출문) |
| `docs/` | 이 문서, 요구사항 명세서, 보안 점검 리스트 |

## 5. 실행·배포·재배포 방법

### 5-1. 내 컴퓨터에서 (먼저 로컬에서 시험하고 배포는 마지막에 — 사용자 결정)
```bash
npm install
npm test       # 임시 포트 3100, 끝나면 임시 폴더를 지움. logs/e2e-* 가 바뀌면 git checkout 으로 되돌림

# 실기기(패스키) 시험: 증빙을 건드리지 않게 임시 폴더로 실행
D=$(mktemp -d)
DATA_DIR=$D LOG_FILE=$D/auth-log.jsonl node server.js   # http://localhost:3000, 저장소: 파일. 첫 등록용 설정 코드가 콘솔에 출력됨
# 끝나면 서버를 종료하고(포트 3000 확인) 임시 폴더 $D 삭제
```
- 패스키는 도메인에 묶임. **`localhost`로 열어야 함**(`127.0.0.1`이나 IP 주소로는 등록·로그인이 거절됨). `localhost`에서 만든 패스키는 배포 주소에서 쓸 수 없고 배포 주소에서 다시 등록해야 함.
- 로컬은 **파일 저장소**라 Supabase·Vercel에서만 나는 문제(예: 두 번째 패스키 `challenge_missing`)는 로컬에서 재현되지 않음.
- `app.listen(PORT)`가 모든 네트워크 주소에서 열림. 패스키 로그인이라 위험은 낮다고 사용자와 합의했고, 필요하면 `127.0.0.1`로 제한할 수 있음(Vercel에는 영향 없음). 지금은 수정하지 않음.

### 5-2. 코드를 고친 뒤 다시 배포하기 (Vercel Drop, 공식 문서로 확인함 2026-10-22)
- `vercel.com/new`·`vercel.com/drop`에 올리면 **항상 새 프로젝트**가 만들어져 환경변수·주소가 모두 달라짐. **프로젝트를 지우고 다시 만들 필요는 없음.**
- 공식 문서: **대시보드의 기존 프로젝트 화면에 폴더를 끌어다 놓으면** 그 프로젝트의 새 프로덕션 배포가 만들어지고 환경변수는 유지됨. 문서는 "폴더"라고 적었고 zip이 풀려서 올라가는지는 확인하지 못했으므로 **폴더로 올릴 것**.
1. 배포용 폴더를 만든다(프로젝트 루트에서). macOS:
   ```bash
   zip -r -X passkey-deploy.zip server.js store.js package.json package-lock.json vercel.json public data/private-data.json -x "*.DS_Store"
   # Finder에서 zip을 더블클릭하면 passkey-deploy 폴더가 생김. 폴더 안에 8개 항목(파일 7 + public 폴더)이 있어야 함
   ```
   Windows는 PowerShell의 `tar.exe -a -c -f passkey-deploy.zip …`(Git Bash의 `tar`는 `C:` 경로를 원격 주소로 읽어 실패함).
2. 풀린 결과가 저장소 파일과 같은지(`cmp`), 비밀값 패턴이 없는지 확인한다. (`index.html`은 base64 이미지 때문에 `eyJ…` 오탐이 있음)
3. Vercel 대시보드에서 **기존 프로젝트**(`skt-aleph-ai-passkey-on-my-introduc…`) 화면 안에 폴더를 끌어다 놓는다. `public/`·`data/` 구조가 유지되어야 함. 새 프로젝트를 만들겠다는 화면이 뜨면 진행하지 말 것.
4. **Deployments**에서 새 배포가 **Ready**인지 확인한다. 환경변수를 바꿨다면 **Redeploy**가 필요(환경변수는 새 배포부터 적용).
5. 올린 뒤 `curl -s $U/auth.js | cmp - public/auth.js`로 저장소와 같은지 확인한다. 배포용 zip·폴더는 끝나면 지운다(프로젝트 폴더에 남기지 않음).

### 5-3. 배포 직후 확인 명령
```bash
U=https://skt-aleph-ai-passkey-on-my-introduc.vercel.app
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" $U/            # 307 …/index.html
curl -s -w " [%{http_code}]\n" $U/api/accounts                           # 200, 계정 A·B
curl -s -w " [%{http_code}]\n" $U/api/private                            # 401 login_required
curl -s -o /dev/null -w "%{http_code}\n" $U/server.js                    # 404
curl -s -w " [%{http_code}]\n" -X POST $U/api/register/options -H 'Content-Type: application/json' -d '{"account":"account-a","name":"x","setupCode":"WRONG"}'   # 403 bad_setup_code (DB 읽기·쓰기 확인)
curl -s -o /dev/null -w "%{http_code}\n" -X POST $U/api/logout -H "Origin: https://evil.example"   # 403 (ORIGIN 설정이 맞는지도 이 명령에 Origin: $U 를 넣어 보면 알 수 있음)
```
**`ORIGIN` 환경변수 점검:** `POST /api/login/options`에 `Origin: $U` 헤더를 붙였는데 403 `bad_origin`이면 `ORIGIN` 값이 접속 주소와 다른 것.
Windows Git Bash에서 `curl`에 `/`로 시작하는 경로를 쓸 때 경로가 깨지면 `MSYS_NO_PATHCONV=1`을 앞에 붙인다. macOS zsh에서는 `*` 같은 glob이 맞는 파일이 없으면 오류가 나므로 여러 줄 점검 명령은 `bash -c`로 실행한다.

## 6. 남은 일 (순서대로)

### 6-1. 사용자가 할 일
1. **(지금 막힌 것) 서버에 남은 계정 A 행 지우기**: 브라우저에서 패스키를 직접 지워서 서버에 `배포 테스트 1`이 남아 있음. Supabase **SQL Editor → New query**에서 먼저 확인(읽기 전용) `select id, account_id, name, created_at from public.passkeys order by created_at;` → 계정 A 한 줄이 보이면 아래로 지움(계정·이름 조건이라 다른 행은 안 지워짐).
   ```sql
   delete from public.passkeys
   where account_id = 'account-a' and name = '배포 테스트 1';
   ```
   그다음 배포 주소에서 **"패스키 처음 등록하기"**로 계정 A를 `SETUP_CODE`로 다시 등록 → "패스키로 들어가기"로 로그인. (앞으로는 패스키를 **브라우저에서 직접 지우지 말고 사이트의 삭제 버튼**을 쓸 것. §7-3 참고)
2. **배포 주소에서 두 번째 패스키 다시 시험**(최신 `auth.js`가 올라간 상태): 로그인 후 "패스키 하나 더 등록"에 이름을 적고 **한 번만** 눌러 **첫 번째와 다른 저장 위치**를 고름. 또 `로그인 질문이 없습니다`가 나오면 ① 선택 창이 뜨기 전인지 후인지, ② Vercel **Logs**(Production, Error)에서 `/api/register/verify` 요청의 오류 줄을 복사해 Claude에게 알려 줄 것. (사실: 로컬에서는 정상. `challenge_missing`은 서버의 `register/verify`에서 세션에 질문 값이 없을 때 나옴 → 세션이 Supabase에 저장·읽히는 과정이나 요청이 겹친 것을 의심. 아직 원인 미확인)
3. 두 번째 패스키가 되면 하나를 삭제한 뒤 남은 하나로 로그인해 보기, **계정 B**는 "처음 등록하기" + `SETUP_CODE`로 등록·로그인.
4. **시크릿 창**에서 결과물 URL과 소스 URL을 열어 로그인·가입 없이 열리는지 확인(C01~C03, C10). 비공개 영역이 잠겨 있는지, 주소창에 `…/api/private`을 열면 `{"error":"login_required"}`가 나오는지도 확인. 열리지 않으면 Vercel **Settings → Deployment Protection**에서 인증 보호가 꺼져 있는지 확인.
5. **GitHub 저장소가 공개인지 확인**(S25, C02). 비공개면 소스 URL이 시크릿 창에서 열리지 않음.
6. **C26**: 계정 B 패스키를 어디에 저장했는지(Google 비밀번호 관리자 / 이 기기 / 보안 키) 알려 주면 `AUTH.md` ③ 표에 반영. (참고: 계정 A의 첫 배포 패스키는 Google 비밀번호 관리자)
7. **`AUTH.md`의 `【사용자 작성】` 채우기**: 결과물·소스 URL, ②(왜 골랐나), ⑤(내가 직접 읽고 고친 부분), 제출문 ②·③, 호스팅 위치(`grep -n "사용자 작성" AUTH.md`). **AI가 대신 지어 쓰지 않음.**
8. **C04~C09 내용 전달**: 원문에서 받지 못한 기준 번호.
9. **S12**: Vercel **Logs**에서 설정 코드 값이 찍힌 줄이 없는지 확인해 알려 주기. **(선택) S27**: 점검 리스트 명령 ⑬(공개 키로 테이블이 안 열리는지, **서비스 키는 절대 쓰지 않음**).
10. **제출 직전에 최종 배포**(§5-2): 아직 배포되지 않은 `auth.js` 수정(§3-3 마지막 두 항목)이 들어 있는지 §5-2의 5번 `cmp`로 확인. 대시보드에 불필요한 중복 Vercel 프로젝트가 있으면 삭제(Settings → Delete Project).

### 6-2. 사용자 결정이 필요한 것
- **상태 줄(아래쪽 문구) 정리 범위**: 사용자가 "그 자리에 뜨는 문구 전부 삭제"를 요청했는데 범위가 모호해 **적용하지 않고** 물어 둠. 상태 줄 문구를 전부 없애면 요구사항 **C25**("등록을 취소하면 화면에 안내가 나온다")의 근거 문구와 설정 코드·시도 횟수 같은 오류 안내가 사라짐. ① 알림성 문구(삭제 완료, 등록 완료 등)만 삭제(권장) ② 전부 삭제하고 알림창으로 옮기기 ③ 이미 지운 "로그인 취소" 문구 하나만 지우고 끝내기.
- **`node_modules/` 삭제 여부**: 로컬 실행·`npm test`용으로 남겨 둠(git 제외, 배포에 안 들어감).
- **점검 문서의 "최근 점검 결과"를 2026-10-22 값으로 갱신해도 되는지**(승인 대기).
- **전역 gstack 삭제 범위**: 아래 중 무엇을 지울지(전부 지우면 다른 프로젝트의 gstack 스킬도 사라지고, `CLAUDE.md`의 "웹 브라우징은 `/browse`" 규칙도 함께 지워야 앞뒤가 맞음). 아직 답이 없어 **건드리지 않음**.

| 위치 | 크기 | 내용 |
|---|---|---|
| `~/.claude/skills/gstack` | 1.3GB | gstack 본체 |
| `~/.claude/skills/` 아래 gstack 스킬 폴더 약 50개 | - | `browse`, `qa`, `ship`, `review` 등 |
| `~/.gstack` | 27MB | 세션·분석·학습 기록 |
| `~/.claude/CLAUDE.md`의 gstack 항목 | - | 브라우징 규칙 포함 |

### 6-3. Claude가 할 수 있는 일 (사용자 승인 후)
1. **두 번째 패스키 `challenge_missing` 원인 조사**: 사용자가 Vercel Logs를 주면 `server.js`의 세션·질문 저장(`takeChallenge`/`storeChallenge`, `store.js`의 Supabase 세션 저장소)과 대조.
2. **상태 줄 문구 정리**(§6-2 결정 뒤). 고칠 때는 **줄 수를 바꾸지 않는 한 줄 수정**으로 해서 `AUTH.md`의 줄 번호를 유지.
3. **점검 문서 갱신**: "최근 점검 결과"(2026-10-22)와 S12·S19·S21~S23·S27, C10 등을 사용자 확인 결과에 맞춰 올림.
4. **`AUTH.md` 갱신**: 호스팅(Vercel)과 배포 확인 기록, 배포 환경 요청·응답 기록 추가(Vercel 함수 로그의 `audit` 줄을 사용자가 복사해 주면 반영 가능. 값은 가려져 있음).
5. **로컬 시험 서버 띄우기**(§5-1의 임시 폴더 방식)와 배포 후 `curl` 확인(§5-3).
6. 필요하면 **세션 행 정리(만료 행 삭제)** 구현, 서비스 키 교체 절차 문서화, `127.0.0.1` 바인딩, CSP. 전역 gstack 삭제(§6-2 결정 후).

## 7. 알려진 한계와 함정

### 7-1. 하면 안 되는 것
- **실제 패스키를 등록한 Supabase 프로젝트에 `E2E_STORE=supabase npm test`를 돌리지 말 것.** 시험은 시작할 때와 끝날 때 4개 테이블의 **모든 행을 지움**(`E2E_ALLOW_WIPE=yes`가 필요한 이유). 지금 배포 프로젝트에는 실제 패스키가 있을 수 있음.
- 서비스 키·`SESSION_SECRET`·`SETUP_CODE`·Vercel 토큰·**새 Supabase 주소**를 **채팅·소스·문서·기록에 쓰지 말 것.** 점검 명령 ①·⑫가 Supabase 주소와 키 접두사 패턴을 검색하므로, 이 문서에도 그런 문자열을 그대로 적지 않음.
- `logs/auth-log.jsonl`에 시험 요청을 섞지 말 것(제출 증빙). 섞이면 `git checkout -- logs/auth-log.jsonl`.
- 공개(Publishable/anon) 키를 `SUPABASE_SERVICE_ROLE_KEY`에 넣지 말 것. RLS에 정책이 없어 서버가 전부 실패함.
- 패스키를 **Chrome·Google 비밀번호 관리자에서 직접 지우지 말 것**(§7-3). 지울 때는 사이트의 삭제 버튼으로.

### 7-2. 설계상 못 막은 것 (제출용 `AUTH.md` ⑥에도 적혀 있음)
- 모든 패스키를 잃었을 때의 복구 경로 없음(운영자가 Supabase `passkeys` 테이블에서 그 계정 행을 직접 지워야 함. §6-1의 1번이 그 예).
- **서비스 롤 키가 유출되면** 공격자가 자기 공개키를 등록해 로그인할 수 있음. 키 교체 절차는 아직 문서화하지 않음.
- 패스키 삭제 때 재확인 없음, 시도 제한이 IP 기준, 설정 코드가 환경변수 한 값에 의존(고정값이라 알아낸 사람은 패스키가 없는 계정에 먼저 등록 가능), 요청 기록이 Vercel 함수 로그에만 남음.
- **만료된 세션 행이 자동으로 지워지지 않음.** 읽을 때는 만료를 걸러 내므로 보안 문제는 아니고 테이블이 천천히 커질 뿐. 정리 SQL 예: `delete from public.sessions where expires_at < now();`

### 7-3. 동작을 이해해 둘 것
- **계정에 패스키가 1개 이상 있으면 "패스키 처음 등록하기"는 로그인해야만 됨**(401 `login_required`, [server.js](../server.js) 210~216줄). 설정 코드만 알면 남의 계정에 패스키를 추가할 수 있게 되는 것을 막는 설계. 이미 있는 계정에는 로그인한 뒤 "패스키 하나 더 등록"을 쓴다. 패스키가 0개인 계정만 설정 코드로 처음 등록할 수 있다.
- **브라우저에서 패스키를 직접 지우면 서버는 모름.** 서버 행이 남아 위의 `login_required`가 나오고 "패스키로 들어가기"에는 선택지가 없음. 사이트의 **삭제** 버튼을 써야 서버에서도 지워지며, **마지막 하나는 삭제 버튼이 막힘**(409 `last_passkey`).
- Chrome 패스키 선택 창은 서버에서 지운 패스키도 계속 보여 줄 수 있음(브라우저는 모름). 고르면 서버가 401 `unknown_credential`로 거절하고 화면에 팝업이 뜸. 같은 저장 위치에는 두 번째 패스키가 안 들어감(서버가 제외 목록을 보냄) → 다른 위치를 고를 것.
- 로그인된 상태에서 새로고침하면 세션(쿠키, 마지막 활동 후 30분)이 살아 있어 **지문 없이 비공개 자료가 바로 보임**. 정상 동작. 로그인 버튼은 열린 화면에서는 숨겨져 있고, 새로고침 직후 잠깐 보이는 사이에 눌러도 이제는 서명을 다시 요구하지 않음.
- Vercel Hobby 플랜 사용 중. 미리보기(Preview) 주소에서는 `ORIGIN`이 달라 등록·로그인이 거절됨(정상). 항상 **프로덕션 주소**로 접속할 것.
- Supabase 무료 플랜은 조직당 활성 프로젝트 2개. 잘못 만든 프로젝트는 지우거나(되돌릴 수 없음) Pause로 자리를 비울 수 있음.

### 7-4. 환경 함정
- **macOS**: `timeout` 명령이 없음. 시험용 서버를 띄우면 **시작 전에 포트가 비었는지, 끝난 뒤 종료됐는지**(`lsof -ti tcp:3000`) 확인한다. zsh에서는 맞는 파일이 없는 glob(`*`)이 오류를 내므로 여러 줄 점검은 `bash -c`로. 점검 명령 ⑩의 임시 폴더 경로는 `$TMPDIR/passkey-e2e-*`.
- **Windows(이전 세션)**: Git Bash에서 `MSYS_NO_PATHCONV=1`을 켜면 `taskkill //F`가 동작하지 않음 → `taskkill /F /PID`. Git Bash의 `tar`는 `C:` 경로를 원격 호스트로 읽음 → PowerShell의 `tar.exe`. Python 출력이 한글로 깨지면 `PYTHONIOENCODING=utf8`.
- 여러 줄 스크립트를 `bash` 인라인 heredoc으로 넘기면 따옴표 때문에 실패하는 경우가 있음 → 파일로 저장해서 실행.

## 8. 작업 규칙 (사용자 선호)

- **파일 수정·생성·삭제는 먼저 설명하고 승인받은 뒤에** 합니다(사용자가 수정을 직접 요청한 파일·문구는 예외). 다만 요청한 수정이 요구사항(C25 등)을 해칠 수 있으면 먼저 알립니다.
- **커밋·푸시·배포는 사용자가 요청할 때만** 합니다. 요청하면 **보안 점검과 요구사항 점검을 먼저 실제로 돌려** ❌가 없을 때만 진행합니다.
- **먼저 로컬에서 시험하고, 배포는 제출 직전에 한 번만** 합니다(사용자 결정, 2026-10-22). 배포 자체는 사용자가 직접 합니다.
- **커밋 형식**: `type: 요약`(feat·fix·docs·test·refactor·chore) 한 줄(점검 요약 숫자를 붙이기도 함), 빈 줄, 파일별 `- 파일: 설명` 본문, 마지막에 `Co-Authored-By` 줄. 논리 단위로 나누고 `git add`는 파일을 하나씩 지정(`-A` 금지). 메시지는 파일로 만들어 `git commit -F`.
- **커밋 작성자 주소**: 이 컴퓨터의 전역 git 설정 이메일은 개인 메일이라 그대로 쓰면 이력에 공개됨. 설정은 바꾸지 말고 `git -c user.name=onboardingsecurity -c user.email=<GitHub 비공개용 noreply 주소> commit …`처럼 지정(주소는 `git log`의 기존 커밋 작성자와 같은 값. **문서·파일에는 적지 않음**, 점검 명령 ⑤가 이메일 패턴을 찾음). zsh에서는 `G=(git -c … -c …); "${G[@]}" commit` 배열 형태로 씀.
- **한 번에 하나씩 짧게** 안내합니다. 사용자가 할 일은 어디의 어떤 버튼인지까지 구체적으로 알려 줍니다.
- **알림은 팝업(`alert`)을 선호합니다.** 문구 수정은 사용자가 정한 문장 그대로 반영하고, 해석이 갈리면 어떻게 해석했는지 알립니다.
- **`public/auth.js`는 줄 수를 바꾸지 않는 한 줄 수정**으로 고쳐 `AUTH.md` ③의 줄 번호를 유지합니다(어쩔 수 없이 줄이 바뀌면 `AUTH.md` 60~63행 갱신).
- **지어내지 않습니다.** 받지 못한 기준(C04~C09)이나 사용자 본인의 판단(②, ⑤, 제출문)은 임의로 채우지 않습니다. 확인하지 못한 것은 ✅로 올리지 않고 어떤 근거로 확인했는지(시뮬레이션인지 실제인지)를 적습니다.
- **시험 뒤 임시 데이터(임시 폴더, 시험 서버, 시험 DB 행)는 항상 지웁니다.** 시험을 시작하기 전후로 남은 프로세스·포트를 확인합니다.
- 브라우저: 전역 `~/.claude/CLAUDE.md`는 웹 브라우징에 gstack `/browse`를 쓰고 `mcp__claude-in-chrome__*`는 쓰지 말라고 함. **사용자 본인의 확인(패스키 등)은 사용자의 일반 Chrome**에서 하게 한다(gstack 브라우저는 별도 프로필이라 패스키 저장 위치가 다름). 전역 gstack을 지우기로 하면 이 규칙도 함께 정리할 것.
- **프로젝트 폴더 밖 변경**(시스템 설정, 전역 파일 삭제 등)은 먼저 확인받습니다.
- 제출물에 **실제 개인정보를 넣지 않습니다**(이메일, 연락처, 내 컴퓨터 경로).

## 9. 점검 실행 방법

사용자가 "보안 점검, 요구사항 점검해줘"라고 하면 다음 순서로 합니다. 하나만 요청하면 해당 점검만 합니다.

1. [SECURITY-CHECKLIST.md](SECURITY-CHECKLIST.md)와 [REQUIREMENTS.md](REQUIREMENTS.md)를 읽는다.
2. 각 항목의 "확인 방법"을 **실제로 실행**한다. 표에 적힌 이전 결과를 그대로 옮기지 않는다(`npm test`, 명령 모음, 소스·줄 번호 대조, 실제 기기 기록 확인). 서버를 띄우는 점검은 임시 포트와 임시 폴더를 쓰고 끝나면 종료를 확인한다. 배포 주소 점검은 읽기 요청만 보낸다.
3. 사용자만 확인할 수 있는 항목(배포 URL, 스크린샷, 본인 판단)은 ➖로 두고 무엇을 확인해야 하는지 적는다.
4. 결과를 **요약 한 줄 + 모든 항목을 한 줄씩 보여 주는 표**로 출력한다. ❌와 ➖는 표 아래에 따로 모아 "무엇을 해야 하는지"를 적는다.
5. 문서의 상태·근거 열과 "최근 점검 결과"는 **사용자 승인 후** 갱신한다.

**상태 표시**: ✅ 통과 · ⏳ 진행중 · ➖ 미확인 또는 사용자 확인 · ❌ 실패

```
보안 점검 29개: ✅ 24 / ⏳ 3 / ➖ 2 / ❌ 0
요구사항 47개: ✅ 40 / ⏳ 4 / ➖ 3 / ❌ 0

| ID | 항목 | 상태 | 근거 / 해야 할 일 |
|---|---|---|---|
```
