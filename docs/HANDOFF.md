# 핸드오프 — 패스키로 나만의 자리 잠그기 (8번 과제)

작성일: 2026-10-21 · 브랜치: `ai-passkey-on-my-introduction-page` · 이 문서만 읽고 이어서 작업할 수 있도록 적었습니다.

관련 문서: [요구사항 명세서](REQUIREMENTS.md) · [보안 점검 리스트](SECURITY-CHECKLIST.md) · [인증 구현 설명서(제출용)](../AUTH.md)

## 1. 한 줄 요약

1번 과제의 자기소개 페이지(공개)에 **패스키로만 열리는 "나만의 자리"**를 이어 붙였고, **Vercel + Supabase로 배포했고, 배포 주소의 정적 페이지와 보안 설정은 확인했습니다. 다만 2026-10-21 08:27 UTC(17:27 로컬) 이후 배포 주소에서 DB를 쓰는 요청이 500을 돌려줍니다(§2, 원인 조사 중).** 남은 것은 ① 이 500의 원인 해결, ② 배포 주소에서 사용자가 실제 패스키로 등록·로그인해 보는 것, ③ 설명서의 `【사용자 작성】` 칸, ④ 배포 결과를 점검 문서에 반영하는 것입니다.

- 배포 주소: https://skt-aleph-ai-passkey-on-my-introduc.vercel.app (첫 화면 `/`는 `/index.html`로 이동하는 공개 소개 페이지)
- 소스: https://github.com/onboardingsecurity/AI-LLM (브랜치 `ai-passkey-on-my-introduction-page`)

## 2. 현재 상태 (2026-10-21)

| 구분 | 상태 |
|---|---|
| 서버·화면 구현 (카드 1~5) | ✅ 완료. `npm test` 30개 통과(파일·메모리 저장소 기준) |
| 실제 기기 확인 (Mac Chrome, localhost) | ✅ 등록, 로그인, 두 번째 패스키, 삭제 후 로그인, 지운 패스키 거절, 계정 B, 계정 간 403. 기록은 `logs/auth-log.jsonl` |
| 취소 화면 (C25) | ✅ Windows Chrome에서 실제로 취소한 화면과 서버 기록 확인 |
| Supabase 저장소 전환 | ✅ 코드 작성, 프로젝트 생성, `supabase/schema.sql` 적용, 4개 테이블 RLS `true` 확인 |
| Vercel 배포 | ✅ 배포됨(정적 페이지, 소스 차단, 보안 헤더 확인). 환경변수 6개 입력 직후(약 07:44 UTC)에는 DB를 쓰는 요청이 정상 응답했음 |
| **배포 주소의 DB 요청 (Supabase 연결)** | ❌ **08:27 UTC 이후 `POST /api/login/options`, `POST /api/register/options`가 500 `server_error`**(17:31 로컬에도 같음). DB를 안 쓰는 `/api/accounts`는 200. 코드는 그 사이 바뀌지 않았고 환경변수는 있어서(서버가 JSON 오류로 응답) 실패한 곳은 Supabase 호출. **원인 미확인** → §6-1의 0번 |
| 배포 주소에서 **사용자의 실제 패스키 등록·로그인** | ⏳ 사용자가 진행 중(아직 결과 미확인) |
| 요구사항 47개 | ✅40 ⏳4(C10, C26, C47, C53) ➖3(C01~C03) ❌0 |
| 보안 29개 | ✅24 ⏳3(S12, S23, S27) ➖2(S25, S29) ❌0 |
| 설명서 `AUTH.md` | ⏳ 초안 완료, **`【사용자 작성】` 8곳** 남음 |
| Git | 푸시된 마지막 커밋 `928e85d`. **미커밋 변경: `vercel.json`(`/` 리다이렉트)**. 이 `docs/HANDOFF.md`도 새 파일 |

> 위 점검 표의 숫자는 **배포 결과가 아직 반영되지 않은 값**입니다. 또한 **배포 주소의 DB 500은 점검 문서에 반영되지 않았습니다**(코드 변경이 아니라 배포 환경 문제로 보고 있음). 원인을 해결한 뒤 §3-4의 배포 점검 결과와 함께 점검 문서(S12, S23 등)를 갱신하세요.

## 3. 지금까지 한 일

### 3-1. 구현과 검증
- Node(Express 5) + `express-session` + `@simplewebauthn/server`. 비공개 자료는 로그인한 계정 것만 서버가 내려 줌. 상세는 [AUTH.md](../AUTH.md).
- 가상 인증기로 서버를 끝까지 시험하는 `npm test`(30개). 시험이 만든 임시 폴더와 Supabase 행은 **끝나면 항상 지움**(성공·실패·설정 오류 모두).

### 3-2. Supabase 저장소 전환 (이번 세션)
- 이유: Vercel 함수는 메모리·파일이 유지되지 않음 → 패스키·세션·질문·실패 횟수를 Supabase로 옮김.
- `store.js`: 저장소 계층. `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`가 있으면 Supabase, 없으면 파일·메모리. **Vercel에서 키가 없으면 시작 거부**, Supabase 사용 때 `SESSION_SECRET`·`SETUP_CODE`도 필수.
- `supabase/schema.sql`: 테이블 4개(`passkeys`, `sessions`, `challenges`, `auth_failures`)와 `delete_passkey` 함수. RLS를 켜고 정책은 만들지 않음(공개 키로는 못 읽음).
- `public/`: `index.html`(5.7MB)과 `auth.js`를 옮김. **Vercel 함수 응답 한도가 4.5MB**라서 정적 파일로 서빙해야 함. `express.static()`은 Vercel에서 무시됨.
- 100KB 초과 요청은 500이 아닌 **413**(시험으로 확인).

### 3-3. 배포 (사용자 결정: GitHub 연동 없음, CLI 로그인 없음 → **Vercel Drop**)
- 이유: 사용자가 Vercel↔GitHub 연동과 CLI 로그인을 원하지 않음. 공식 문서에 `vercel.com/drop`(브라우저에 폴더·zip을 끌어다 놓기)이 있음.
- 배포에 담은 파일(8개): `server.js`, `store.js`, `package.json`, `package-lock.json`, `vercel.json`, `public/`(`index.html`, `auth.js`), `data/private-data.json`. **`node_modules`는 넣지 않음**(Vercel이 `package.json`·lockfile로 설치).
- 겪은 문제와 해결:
  - `/`가 정적 파일이 아니라 Express 함수로 들어감 → 서버가 켜지면 5.7MB 응답이 한도에 걸릴 상황. `vercel.json`에 `redirects`로 `/`를 `/index.html`로 보내 해결(`rewrites`는 효과가 불확실해 `redirects`를 씀). **배포 확인 완료**: `/` → 307 → `/index.html` 200.
  - **`vercel.com/new`나 `/drop`에 올리면 새 프로젝트가 만들어짐.** 기존 프로젝트를 갱신하려면 그 **프로젝트 화면 안**에서 올려야 함. 사용자가 새 프로젝트 화면(New Project)을 본 적이 있어, 대시보드에 **불필요한 중복 프로젝트가 있는지 확인**할 것.
- 환경변수 6개(값은 Vercel에만 있고 문서·채팅에 없음):

| 이름 | 내용 |
|---|---|
| `ORIGIN` | `https://skt-aleph-ai-passkey-on-my-introduc.vercel.app` (끝에 `/` 없이, 접속 주소와 글자까지 같아야 함) |
| `RP_ID` | `skt-aleph-ai-passkey-on-my-introduc.vercel.app` |
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **Secret** 키(접두사가 `sb_`로 시작) 또는 구 방식의 서비스 롤 키. **Publishable/anon 키는 쓰면 안 됨**(RLS 정책이 없어 서버도 막힘) |
| `SESSION_SECRET` | 무작위 긴 값 |
| `SETUP_CODE` | 첫 등록용 코드(사용자만 앎). 두 계정 모두 첫 등록을 마친 뒤에는 쓸 일이 없음 |

### 3-4. 배포 주소에서 확인한 것 (2026-10-21, 직접 요청한 결과)

> **시간 순서:** 약 07:44 UTC에는 아래 DB 요청이 정상이었습니다. 08:27 UTC에 같은 요청이 500으로 바뀐 것을 확인했고 그 뒤로 계속 500입니다. 아래 "Supabase 쓰기·읽기" 항목은 **정상이던 시점의 결과**입니다.
- `/` 307 → `/index.html` 200, `/auth.js` 200
- `/api/accounts` 200(계정 A·B), `/api/session` 200 `loggedIn:false`, 로그인 없이 `/api/private` **401** `login_required`
- Supabase 쓰기·읽기(07:44 UTC, **현재는 500**): `POST /api/login/options` 200(질문 발급, 쿠키에 `HttpOnly; Secure; SameSite=Lax`, `rpId`가 배포 도메인), 틀린 설정 코드로 등록 시도 **403** `bad_setup_code`
- 소스·설정 파일 직접 요청(`/server.js`, `/store.js`, `/package.json`, `/data/private-data.json`, `/supabase/schema.sql`, `/AUTH.md`, `/.git/config`, `/logs/…`, `/node_modules/`, `/public/index.html`) **모두 404**
- 다른 출처(`Origin: https://evil.example`) 변경 요청 **403**, 120KB 본문 **413**
- 보안 헤더: `Strict-Transport-Security`(HSTS), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`. API는 `Cache-Control: no-store`
- 위 확인 때문에 DB에 임시 행 3개(질문, 세션, 실패 기록)가 생겼음. 질문·실패 기록은 다음 기록 때 만료분이 지워지고, 세션 행은 만료돼도 **자동으로 지워지지 않음**(§7 참고). 아직 실제 패스키는 등록하지 않았으므로 필요하면 `passkeys` 외 3개 테이블을 비워도 안전.

### 3-5. 그 밖의 정리
- `docs/HANDOFF.md`는 한 번 삭제했다가(사용자 요청) 이 문서로 다시 만듦.
- gstack(브라우저 도구)의 **프로젝트 안 흔적(`.gstack/`, `.gitignore`의 자동 추가 줄)은 삭제함.** 전역 설치(`~/.claude/skills/gstack` 1.3GB, `~/.gstack`, `~/.claude/CLAUDE.md`의 gstack 항목)는 **사용자 결정 대기**(§6-2).
- 메모리에 "시험 뒤 임시 데이터는 항상 삭제" 규칙을 저장함.

## 4. 파일 지도

| 파일 | 역할 |
|---|---|
| `public/index.html` | 1번 소개 페이지 + 추가분(경계선, 나만의 자리). 5.7MB(base64 이미지)라 **통째로 읽지 말고 줄 범위로** 읽을 것. 줄 번호 기준은 `AUTH.md` ③ |
| `public/auth.js` | 브라우저 쪽(WebAuthn 호출, 화면 전환, 목록·삭제) |
| `server.js` | Express 서버. 등록·로그인·로그아웃·비공개 조회·패스키 목록/삭제. 앱을 `export default`, Vercel이 아닐 때만 포트를 엶 |
| `store.js` | 저장소 계층(Supabase 또는 파일·메모리) |
| `supabase/schema.sql` | 테이블·함수·RLS. 여러 번 실행해도 안전 |
| `vercel.json` | `/` → `/index.html` 리다이렉트, 응답 헤더 3종 |
| `data/private-data.json` | 지어낸 비공개 자료(계정 A·B 각 3개). 서버가 import |
| `data/passkeys.json` | **내 컴퓨터에서 실행할 때만** 생기는 패스키 저장소. git 제외. 이 컴퓨터에는 없음. 있으면 **지우지 말 것** |
| `test/e2e.mjs` | 가상 인증기로 서버 시험(30개). `E2E_STORE=supabase`면 실제 Supabase로 시험하되 **모든 행을 지움** |
| `logs/auth-log.jsonl` | **실제 기기 요청·응답 기록(제출 증빙).** 시험·점검이 여기에 섞이지 않게 `LOG_FILE`을 임시 위치로 돌릴 것 |
| `logs/e2e-log.jsonl`, `e2e-report.json` | `npm test`를 돌릴 때마다 바뀌는 추적 파일. 커밋할 의도가 없으면 `git checkout`으로 되돌림 |
| `AUTH.md` | 제출용 인증 구현 설명서(여섯 항목 + 확인 방법 + 제출문) |
| `docs/` | 이 문서, 요구사항 명세서, 보안 점검 리스트 |

## 5. 실행·배포·재배포 방법

### 5-1. 내 컴퓨터에서
```bash
npm install
npm start      # http://localhost:3000, 저장소: 파일. 첫 등록용 설정 코드가 콘솔에 출력됨
npm test       # 임시 포트 3100, 끝나면 임시 폴더를 지움
```
- 패스키는 도메인에 묶임. **`localhost`로 열어야 함**(`127.0.0.1`이나 IP 주소로는 등록·로그인이 거절됨). `localhost`에서 만든 패스키는 배포 주소에서 쓸 수 없고 배포 주소에서 다시 등록해야 함.
- `app.listen(PORT)`가 모든 네트워크 주소에서 열림. 패스키 로그인이라 위험은 낮다고 사용자와 합의했고, 필요하면 `127.0.0.1`로 제한할 수 있음(Vercel에는 영향 없음). 지금은 수정하지 않음.

### 5-2. 코드를 고친 뒤 다시 배포하기 (Vercel Drop)
1. 배포용 zip을 새로 만든다(프로젝트 루트에서, **PowerShell의 `tar`** 또는 `C:\Windows\System32\tar.exe`. Git Bash의 `tar`는 `C:` 경로를 원격 주소로 읽어 실패함).
   ```powershell
   tar.exe -a -c -f passkey-deploy.zip server.js store.js package.json package-lock.json vercel.json public data/private-data.json
   ```
2. zip을 푼 결과가 저장소 파일과 같은지, 비밀값 패턴이 없는지 확인한다.
3. Vercel 대시보드에서 **기존 프로젝트 화면을 열고 그 안에서** zip(또는 압축을 푼 항목 전부)을 끌어다 놓는다. `public/`·`data/` 폴더 구조가 유지되어야 함.
4. **Deployments**에서 새 배포가 **Ready**인지 확인한다. 환경변수를 바꿨다면 **Redeploy**가 필요(환경변수는 새 배포부터 적용).

### 5-3. 배포 직후 확인 명령
```bash
U=https://skt-aleph-ai-passkey-on-my-introduc.vercel.app
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" $U/            # 307 …/index.html
curl -s -w " [%{http_code}]\n" $U/api/accounts                           # 200, 계정 A·B
curl -s -w " [%{http_code}]\n" $U/api/private                            # 401 login_required
curl -s -o /dev/null -w "%{http_code}\n" $U/server.js                    # 404
curl -s -w " [%{http_code}]\n" -X POST $U/api/register/options -H 'Content-Type: application/json' -d '{"account":"account-a","name":"x","setupCode":"WRONG"}'   # 403 bad_setup_code (DB 읽기·쓰기 확인)
```
Windows Git Bash에서 `curl`에 `/`로 시작하는 경로를 쓸 때 경로가 깨지면 `MSYS_NO_PATHCONV=1`을 앞에 붙인다.

## 6. 남은 일 (순서대로)

### 6-1. 사용자가 할 일
0. **배포 주소의 DB 500 원인 찾기 (가장 먼저).** 아래를 확인해 Claude에게 알려 줄 것.
   - 최근에 **Supabase 키를 바꾸거나 환경변수를 수정**했는지(Publishable/anon 키가 들어갔으면 RLS 때문에 모든 DB 요청이 실패함).
   - Vercel 프로젝트 **Logs**(상단 메뉴)에서 환경 **Production**, 수준 **Error**로 `/api/login/options` 요청의 오류 줄을 복사. 우리 코드는 `supabase_<동작>: <오류코드> <메시지>` 형태로 남김(키는 포함되지 않음).
   - Supabase 대시보드에 **일시 중지 배너**가 있는지, **Table Editor**에 4개 테이블이 그대로 있는지, **RLS enabled**가 유지되는지.
   - 원인이 환경변수라면 값을 고친 뒤 **Redeploy**(환경변수는 새 배포부터 적용).
1. **배포 주소에서 패스키 등록·로그인 (0번이 해결된 뒤)**: 평소 Chrome **일반 창**에서 주소를 열고, "패스키 처음 등록하기"에서 계정 A, 이름(예: `배포 테스트 1`), Vercel에 넣은 `SETUP_CODE`로 등록 → "패스키로 들어가기"로 로그인. 결과(성공 문구 또는 오류 문구, 화면 캡처)를 Claude에게 알려 줄 것.
2. 같은 계정에 **두 번째 패스키**를 등록하고, 하나를 삭제한 뒤 남은 하나로 들어가 보기. 계정 B도 등록·로그인. (배포 환경에서의 재확인)
3. **시크릿 창**에서 결과물 URL과 소스 URL을 열어 로그인·가입 없이 열리는지 확인(C01~C03, C10). 비공개 영역이 잠겨 있는지, 주소창에 `…/api/private`을 열면 `{"error":"login_required"}`가 나오는지도 확인. 열리지 않으면 Vercel **Settings → Deployment Protection**에서 인증 보호가 꺼져 있는지 확인.
4. **GitHub 저장소가 공개인지 확인**(S25, C02). 비공개면 소스 URL이 시크릿 창에서 열리지 않음.
5. **C26**: 계정 B 패스키를 어디에 저장했는지(Google 비밀번호 관리자 / 이 기기 / 보안 키) 알려 주면 `AUTH.md` ③ 표에 반영.
6. **`AUTH.md`의 `【사용자 작성】` 채우기**: 결과물·소스 URL, ②(왜 골랐나), ⑤(내가 직접 읽고 고친 부분), 제출문 ②·③, 호스팅 위치(`grep -n "사용자 작성" AUTH.md`). **AI가 대신 지어 쓰지 않음.**
7. **C04~C09 내용 전달**: 원문에서 받지 못한 기준 번호.
8. **(선택) 공개 키로 테이블이 안 열리는지 확인(S27)**: 점검 리스트의 명령 ⑬. 공개(Publishable/anon) 키를 쓰는 요청이며, **서비스 키는 절대 쓰지 않음**.
9. 대시보드에 **불필요한 중복 Vercel 프로젝트**가 있으면 삭제(Settings → Delete Project).

### 6-2. 사용자 결정이 필요한 것
- **전역 gstack 삭제 범위**: 아래 중 무엇을 지울지(전부 지우면 다른 프로젝트의 gstack 스킬도 사라지고, `CLAUDE.md`의 "웹 브라우징은 `/browse`" 규칙도 함께 지워야 앞뒤가 맞음). 아직 답이 없어 **건드리지 않음**.

| 위치 | 크기 | 내용 |
|---|---|---|
| `~/.claude/skills/gstack` | 1.3GB | gstack 본체 |
| `~/.claude/skills/` 아래 gstack 스킬 폴더 약 50개 | - | `browse`, `qa`, `ship`, `review` 등 |
| `~/.gstack` | 27MB | 세션·분석·학습 기록 |
| `~/.claude/CLAUDE.md`의 gstack 항목 | - | 브라우징 규칙 포함 |

### 6-3. Claude가 할 수 있는 일 (사용자 승인 후)
1. **`vercel.json` 변경과 이 문서 커밋·푸시**(사용자가 요청할 때만, §8 규칙대로 보안 점검 먼저).
2. **배포 결과를 점검 문서에 반영**: S19(배포 주소 기준 재확인), S21·S22, S23(헤더·HSTS 확인), S12(Vercel 함수 로그에 설정 코드가 없는지는 사용자가 로그를 보고 알려 줘야 확정), C10 등. 사용자 확인 결과가 오면 상태를 올림.
3. **`AUTH.md` 갱신**: 호스팅(Vercel)과 배포 확인 기록, 배포 환경의 시각이 적힌 요청·응답 기록 추가(Vercel 함수 로그의 `audit` 줄을 사용자가 복사해 주면 반영 가능. 값은 가려져 있음).
4. **Supabase 저장소 실제 시험(S29)**: 아래 §7-1 경고를 지킬 것.
5. 필요하면 **세션 행 정리(만료 행 삭제)** 구현, 서비스 키 교체 절차 문서화, `127.0.0.1` 바인딩, CSP.
6. 전역 gstack 삭제(§6-2 결정 후).

## 7. 알려진 한계와 함정

### 7-1. 하면 안 되는 것
- **실제 패스키를 등록한 Supabase 프로젝트에 `E2E_STORE=supabase npm test`를 돌리지 말 것.** 시험은 시작할 때와 끝날 때 4개 테이블의 **모든 행을 지움**(`E2E_ALLOW_WIPE=yes`가 필요한 이유). 돌리려면 별도의 연습용 프로젝트에서, 또는 실제 패스키를 등록하기 전에만.
- 서비스 키·`SESSION_SECRET`·`SETUP_CODE`·Vercel 토큰을 **채팅·소스·문서·기록에 쓰지 말 것.** 점검 명령 ①·⑫가 Supabase 주소와 키 접두사 패턴을 검색하므로, 이 문서에도 그런 문자열을 그대로 적지 않음.
- `logs/auth-log.jsonl`에 시험 요청을 섞지 말 것(제출 증빙). 섞이면 `git checkout -- logs/auth-log.jsonl`.
- 공개(Publishable/anon) 키를 `SUPABASE_SERVICE_ROLE_KEY`에 넣지 말 것. RLS에 정책이 없어 서버가 전부 실패함.

### 7-2. 설계상 못 막은 것 (제출용 `AUTH.md` ⑥에도 적혀 있음)
- 모든 패스키를 잃었을 때의 복구 경로 없음(운영자가 Supabase `passkeys` 테이블에서 그 계정 행을 직접 지워야 함).
- **서비스 롤 키가 유출되면** 공격자가 자기 공개키를 등록해 로그인할 수 있음. 키 교체 절차는 아직 문서화하지 않음.
- 패스키 삭제 때 재확인 없음, 시도 제한이 IP 기준, 설정 코드가 환경변수 한 값에 의존(고정값이라 알아낸 사람은 패스키가 없는 계정에 먼저 등록 가능), 요청 기록이 Vercel 함수 로그에만 남음.
- **만료된 세션 행이 자동으로 지워지지 않음.** 읽을 때는 만료를 걸러 내므로 보안 문제는 아니고 테이블이 천천히 커질 뿐. 정리 SQL 예: `delete from public.sessions where expires_at < now();`

### 7-3. 환경 함정 (Windows)
- Git Bash에서 `MSYS_NO_PATHCONV=1`을 켜면 `taskkill //F`가 동작하지 않음 → `taskkill /F /PID`를 쓴다. 시험용 서버를 띄우면 **시작 전에 포트가 비었는지, 끝난 뒤 종료됐는지** 확인한다(이번 세션에서 종료되지 않은 서버가 옛 코드로 응답해 점검 결과가 틀릴 뻔했음).
- Git Bash의 `tar`는 `C:` 경로를 원격 호스트로 읽음 → PowerShell의 `tar.exe`(bsdtar) 사용.
- Python 출력이 한글로 깨지면 `PYTHONIOENCODING=utf8`.
- 여러 줄 스크립트를 `bash` 인라인 heredoc으로 넘기면 따옴표 때문에 실패하는 경우가 있음 → 파일로 저장해서 실행.
- Chrome 패스키 선택 창은 서버에서 지운 패스키도 계속 보여 줌(브라우저는 모름). 고르면 서버가 401 `unknown_credential`로 거절함. 같은 저장 위치에는 두 번째 패스키가 안 들어감(서버가 제외 목록을 보냄) → 다른 위치를 고를 것.
- Vercel Hobby 플랜 사용 중. 미리보기(Preview) 주소에서는 `ORIGIN`이 달라 등록·로그인이 거절됨(정상). 항상 **프로덕션 주소**로 접속할 것.

## 8. 작업 규칙 (사용자 선호)

- **파일 수정·생성·삭제는 먼저 설명하고 승인받은 뒤에** 합니다(요청한 파일은 예외).
- **커밋·푸시·배포는 사용자가 요청할 때만** 합니다. 요청하면 **보안 점검과 요구사항 점검을 먼저 실제로 돌려** ❌가 없을 때만 진행합니다.
- **커밋 형식**: `type: 요약`(feat·fix·docs·test·refactor·chore) 한 줄, 빈 줄, 파일별 `- 파일: 설명` 본문, 마지막에 `Co-Authored-By` 줄. 논리 단위로 나누고 `git add`는 파일을 하나씩 지정(`-A` 금지). 메시지는 파일로 만들어 `git commit -F`.
- **커밋 작성자 주소**: 이 컴퓨터의 전역 git 설정 이메일은 개인 메일이라 그대로 쓰면 이력에 공개됨. 설정은 바꾸지 말고 `git -c user.name=onboardingsecurity -c user.email=<GitHub 비공개용 noreply 주소> commit …`처럼 지정(주소는 `git log`의 기존 커밋 작성자와 같은 값. **문서·파일에는 적지 않음**, 점검 명령 ⑤가 이메일 패턴을 찾음).
- **한 번에 하나씩 짧게** 안내합니다. 사용자가 할 일은 어디의 어떤 버튼인지까지 구체적으로 알려 줍니다.
- **지어내지 않습니다.** 받지 못한 기준(C04~C09)이나 사용자 본인의 판단(②, ⑤, 제출문)은 임의로 채우지 않습니다. 확인하지 못한 것은 ✅로 올리지 않고 어떤 근거로 확인했는지(시뮬레이션인지 실제인지)를 적습니다.
- **시험 뒤 임시 데이터(임시 폴더, 시험 서버, 시험 DB 행)는 항상 지웁니다.** 시험을 시작하기 전후로 남은 프로세스·포트를 확인합니다.
- 브라우저: 전역 `~/.claude/CLAUDE.md`는 웹 브라우징에 gstack `/browse`를 쓰고 `mcp__claude-in-chrome__*`는 쓰지 말라고 함. **사용자 본인의 확인(패스키 등)은 사용자의 일반 Chrome**에서 하게 한다(gstack 브라우저는 별도 프로필이라 패스키 저장 위치가 다름). 전역 gstack을 지우기로 하면 이 규칙도 함께 정리할 것.
- **프로젝트 폴더 밖 변경**(시스템 설정, 전역 파일 삭제 등)은 먼저 확인받습니다.
- 제출물에 **실제 개인정보를 넣지 않습니다**(이메일, 연락처, 내 컴퓨터 경로).

## 9. 점검 실행 방법

사용자가 "보안 점검, 요구사항 점검해줘"라고 하면 다음 순서로 합니다. 하나만 요청하면 해당 점검만 합니다.

1. [SECURITY-CHECKLIST.md](SECURITY-CHECKLIST.md)와 [REQUIREMENTS.md](REQUIREMENTS.md)를 읽는다.
2. 각 항목의 "확인 방법"을 **실제로 실행**한다. 표에 적힌 이전 결과를 그대로 옮기지 않는다(`npm test`, 명령 모음, 소스·줄 번호 대조, 실제 기기 기록 확인). 서버를 띄우는 점검은 임시 포트와 임시 폴더를 쓰고 끝나면 종료를 확인한다.
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
