# 보안 점검 리스트 — 코드를 외부로 옮기기 전에

**목적**: 코드·문서·기록을 GitHub나 호스팅 같은 외부로 옮기기 전에, 올라가면 안 되는 것이 들어 있지 않은지 점검합니다.
**범위**: 시스템 변경, 외부 연결, 키 값 노출과 관리, 개인정보, 기록 파일, 서버 설정.
**점검 방법**: "보안 점검해줘"라고 하면 아래 "확인 방법"을 실제로 실행해 상태를 다시 판정합니다. 이전 결과를 그대로 옮기지 않고, 사용자만 확인할 수 있는 항목은 ➖로 두고 무엇을 확인해야 하는지 적습니다. 결과는 요약 한 줄과 항목별 표로 보고하고, 문서의 상태·근거 열은 사용자 승인 후 갱신합니다.

> 아래 명령은 모두 프로젝트 폴더에서 실행합니다. 읽기만 하는 명령이며, 서버를 띄우는 항목은 임시 포트(3300)와 임시 폴더를 써서 실제 데이터(`data/passkeys.json`)를 건드리지 않습니다.

## 상태 범례

| 표시 | 뜻 |
|---|---|
| ✅ 통과 | 확인했고 문제 없음 |
| ⏳ 진행중 | 알려진 위험이 있고 대응이 남음 |
| ➖ 미확인 / 사용자 확인 | 사용자만 확인·결정할 수 있거나 아직 확인하지 못함 |
| ❌ 실패 | 올라가면 안 되는 것이 발견됨 |

## 점검 항목

### A. 키 값 노출과 관리

| ID | 점검 항목 | 확인 방법 | 상태 | 근거 (2026-10-24) |
|---|---|---|---|---|
| S01 | 비밀키·토큰·API 키 값이 파일에 없다 | 명령 ① | ✅ | 키·토큰·개인키 패턴 검색 결과 없음 |
| S02 | 세션 비밀·설정 코드가 소스에 박혀 있지 않다 | 명령 ② | ✅ | 세션 비밀은 환경변수 또는 실행 때 무작위 생성, 설정 코드도 환경변수 또는 무작위. Supabase 사용 때는 두 값이 없으면 서버가 시작하지 않음. `TEST-CODE`는 시험 전용 상수 |
| S03 | 실행 중 생기는 파일이 저장소에서 제외된다 | 명령 ③ | ✅ | `data/passkeys.json`, `node_modules`, `.env`, `.vercel`, `.env.local`이 ignore 됨 |
| S04 | git 원격 주소·설정에 아이디·토큰이 없다 | 명령 ④ | ✅ | 원격 `https://github.com/onboardingsecurity/AI-LLM.git`, 자격증명 없음 |
| S05 | 개인키가 서버·저장소·기록 어디에도 없다 | `npm test`(T08-C23), 소스 | ✅ | 서버가 받는 것은 공개키와 서명뿐, 개인키 값 검색 결과 없음 |

### B. 개인정보

| ID | 점검 항목 | 확인 방법 | 상태 | 근거 |
|---|---|---|---|---|
| S06 | 프로젝트 파일에 이메일·전화번호·주민번호형·내 컴퓨터 경로가 없다 | 명령 ⑤ | ✅ | 소스·문서·기록·`index.html`(이미지 제외) 모두 없음 |
| S07 | 비공개 자료는 전부 지어낸 내용이다 | `data/private-data.json`의 `_note` | ✅ | 가상 회사·가상의 책 등 |
| S08 | 제출·공유할 **스크린샷** 속에 실제 이메일 등이 없다 | 사용자가 이미지 확인 | ✅ | 사용자 확인: 스크린샷을 제출물에 쓰지 않음. 저장소 파일에는 이메일이 없음
| S09 | 1번 공개 소개 내용(군 복무 언급, 프로젝트 이름 등)을 외부에 올려도 되는지 | 사용자 판단 | ✅ | 1번 공개 내용은 이미 원격 브랜치(`ai-self-introduction-page`)에 올라가 있고, 이번 변경은 추가만(삭제 1줄은 쉼표). 새로 공개되는 개인 정보 없음

### C. 기록(로그) 파일

| ID | 점검 항목 | 확인 방법 | 상태 | 근거 |
|---|---|---|---|---|
| S10 | 기록 파일에서 세션 값·설정 코드가 가려져 있다 | 명령 ⑥ | ✅ | `sid=***masked***`만 존재, `setupCode`는 `***masked***` |
| S11 | `logs/auth-log.jsonl`(실제 기기 기록)을 올릴지 정했다 | 사용자 결정 | ✅ | 비밀값 없음(세션·설정 코드 가림, 서명은 한 번 쓴 질문에 대한 것이라 재사용 불가). 식별자·공개키는 `localhost` 전용이라 다른 곳에서 쓸 수 없어 **저장소에 포함**하기로 판단. 원하지 않으면 `.gitignore`에 추가
| S12 | 서버 콘솔·호스팅 로그에 설정 코드가 찍히지 않는다 | `server.js` 402~407줄 | ✅ | 배포 Vercel Logs(2026-10-24)의 `register/options` 요청 기록에서 `setupCode`와 쿠키(`sid`), 응답의 `setCookie`가 모두 `***masked***`. `SETUP_CODE` 환경변수로 고정하면 값을 찍지 않고(코드), Vercel에서는 서버를 listen하지 않음 |

### D. 외부 연결

| ID | 점검 항목 | 확인 방법 | 상태 | 근거 |
|---|---|---|---|---|
| S13 | 서버·브라우저 코드가 외부로 호출하는 곳을 안다 | 명령 ⑦ | ✅ | `public/auth.js`의 `fetch`는 같은 출처 `/api`만. 서버가 부르는 외부는 `SUPABASE_URL`(환경변수) 한 곳뿐(`store.js`), 소스에 주소가 박혀 있지 않음(증명서 인증 `none` 형식이라 메타데이터 조회도 없음) |
| S14 | 외부 스크립트가 없고, 외부 자원은 무엇인지 안다 | 명령 ⑧ | ✅ | 스크립트는 `/auth.js`뿐(`public/`로 이동, 내용 동일). 외부는 Google Fonts(1번에서 유래)이며, 방문자 브라우저가 Google에 글꼴을 요청함 |
| S15 | 의존성 취약점이 없고 내려받는 곳이 npm 공식이다 | 명령 ⑨ | ✅ | `npm audit` 0건(2026-10-24 `body-parser` 2.3.0 → 2.4.0으로 올려 high 1건 해결), lockfile 106개 모두 `registry.npmjs.org` |
| S16 | 위험한 API(`innerHTML`, `eval`, 쉘 실행)를 쓰지 않는다 | 명령 ⑦ | ✅ | 검색 결과 없음, 화면 출력은 `textContent`만 사용 |

### E. 시스템 변경

| ID | 점검 항목 | 확인 방법 | 상태 | 근거 |
|---|---|---|---|---|
| S17 | 프로젝트 폴더 밖에 파일을 남기지 않았다 | 명령 ⑩ | ✅ | `npm test`가 시스템 임시 폴더에 만드는 `passkey-e2e-*`를 끝날 때(성공·실패·설정 오류 모두) 항상 지우도록 `test/e2e.mjs`를 수정함. 정상 시험, 설정 오류, 연결 실패 뒤 잔여 폴더 0개 확인. 기존 잔여 4개는 삭제함. 규칙: 시험이 만든 임시 데이터는 시험 뒤 항상 지운다 |
| S18 | 전역 설치·시스템 설정(launchd 등) 변경이 없다 | 작업 기록, `package.json` | ✅ | 의존성은 모두 프로젝트 안 `node_modules`, 전역 설치·시스템 설정 변경 없음 |

### F. 서버 설정

| ID | 점검 항목 | 확인 방법 | 상태 | 근거 |
|---|---|---|---|---|
| S19 | 서버가 폴더·소스·데이터를 주소로 내려 주지 않는다 | 명령 ⑪ | ✅ | 내 컴퓨터 서버에서 `/`, `/auth.js`만 200, `/store.js`, `/server.js`, `/supabase/schema.sql`, `/data/…`, `/node_modules/`, `/.git/config`, `/AUTH.md`, `/logs/…`, `/docs/…` 모두 404. **배포 주소에서도** `/server.js`, `/store.js`, `/package.json`, `/data/private-data.json`, `/supabase/schema.sql`, `/AUTH.md`, `/.git/config`, `/logs/…`, `/docs/…` 모두 404(2026-10-24) |
| S20 | 쿠키에 `HttpOnly`·`SameSite`가 있고 https 주소로 켜면 `Secure`가 붙는다 | 명령 ⑪ | ✅ | `HttpOnly; Secure; SameSite=Lax` 확인(임시 서버, https 주소로 설정) |
| S21 | 다른 출처에서 온 상태 변경 요청을 막는다 | 명령 ⑪, `npm test` | ✅ | `Origin: https://evil.example` → 403 |
| S22 | 입력 검증과 시도 횟수 제한이 있다 | `server.js` 203줄~, 시험 | ✅ | 이름 1~30자, JSON 100KB 제한(초과는 413 `payload_too_large`, 시험으로 확인), 잘못된 JSON 400, 설정 코드·로그인 실패 5분에 10회 제한. 한계는 `AUTH.md` ⑥ |
| S23 | 배포 환경의 HTTPS·HSTS·CSP 같은 보안 헤더 | 배포 후 확인 | ✅ | 배포 응답 헤더에 `Content-Security-Policy`(`vercel.json`), HSTS(max-age 63072000, includeSubDomains, preload), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`을 확인(2026-10-24). 사용자가 실제 Chrome 콘솔에서 CSP 위반이 없는 것을 확인. 인라인 스크립트가 많아 `script-src`에 `'unsafe-inline'`을 허용하므로 인라인 XSS 자체는 막지 못함(화면 출력이 `textContent`뿐이라 보완). API는 `Cache-Control: no-store` |

### G. 올리기 직전

| ID | 점검 항목 | 확인 방법 | 상태 | 근거 |
|---|---|---|---|---|
| S24 | 커밋·푸시에 들어갈 파일 목록을 확인했다 | 명령 ③ (`git status`) | ✅ | 커밋 대상 확인함: `server.js`, `auth.js`, `index.html`, `AUTH.md`, `docs/`, `data/private-data.json`, `test/`, `logs/`, `package*.json`, `.gitignore`. `data/passkeys.json`·`node_modules`는 제외됨
| S25 | 원격 저장소의 공개 여부와 소유를 확인했다 | 사용자가 GitHub에서 확인 | ✅ | 사용자 확인(2026-10-24): 시크릿 창에서 소스 URL(`…/tree/ai-passkey-on-my-introduction-page`)이 로그인 없이 열림 = 저장소 공개 |

### H. Supabase 저장소와 Vercel 배포

| ID | 점검 항목 | 확인 방법 | 상태 | 근거 |
|---|---|---|---|---|
| S26 | 서비스 롤 키·Supabase 주소가 소스·문서·기록·브라우저 코드에 없다 | 명령 ①, 명령 ⑫ | ✅ | 키 패턴·`supabase.co`·`sb_secret` 검색 결과 없음. 키는 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 환경변수로만 읽고(`store.js`), 브라우저 코드(`public/auth.js`)에는 Supabase 호출이 없음 |
| S27 | Supabase 테이블이 공개(anon) 키로 읽히거나 써지지 않는다(RLS 켬, 정책 없음) | `supabase/schema.sql` 적용 뒤 명령 ⑬ | ✅ | `supabase/schema.sql` 적용 뒤 4개 테이블의 RLS가 모두 `true`(2026-10-21). 사용자가 공개(publishable) 키로 직접 요청(명령 ⑬): 4개 테이블 읽기 모두 401, `delete_passkey` 호출 401(2026-10-24) |
| S28 | 배포 환경에서 필수 설정이 없으면 서버가 시작하지 않는다 | 명령 ⑭ | ✅ | `VERCEL=1`이고 Supabase 키가 없으면 시작 거부, Supabase 사용 때 `SESSION_SECRET`·`SETUP_CODE`가 없으면 시작 거부, DB에 연결할 수 없으면 500 `server_error`만 돌려주고 키는 응답·로그에 없음 |
| S29 | Supabase 저장소 코드를 실제 Supabase 프로젝트로 시험했다 | `E2E_STORE=supabase npm test` | ✅ | 사용자 실행(2026-10-24): `E2E_STORE=supabase npm test` 30/30 통과(실제 Supabase 테이블, 시작과 끝에 4개 테이블의 모든 행을 지움) |

## 확인 명령 모음

```bash
# ① 비밀값 패턴
grep -n -E 'AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,}|BEGIN [A-Z ]*PRIVATE KEY|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-|service_role|api[_-]?key\s*[:=]|password\s*[:=]' \
  server.js store.js public/auth.js vercel.json AUTH.md docs/*.md package.json package-lock.json .gitignore data/private-data.json test/e2e.mjs logs/*

# ② 하드코딩된 비밀 설정
grep -n -E "SESSION_SECRET|SETUP_CODE|secret:" server.js store.js test/e2e.mjs

# ③ 올라갈 파일과 제외 여부
git status --short
for f in data/passkeys.json node_modules .env .vercel logs/auth-log.jsonl logs/e2e-log.jsonl; do git check-ignore -q $f && echo "ignored: $f" || echo "NOT ignored: $f"; done

# ④ 원격 주소·자격증명, 의존성 출처
git remote -v
grep -o '"resolved": "https\?://[^/]*' package-lock.json | sort | uniq -c

# ⑤ 개인정보 패턴 (이메일·전화·주민번호형·내 경로·사용자명 힌트)
grep -n -E '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}|0[0-9]{1,2}-[0-9]{3,4}-[0-9]{4}|[0-9]{6}-[1-4][0-9]{6}|/Users/' \
  server.js store.js public/auth.js vercel.json supabase/schema.sql AUTH.md docs/*.md package.json data/private-data.json test/e2e.mjs logs/*
# public/index.html 은 base64 이미지를 빼고 같은 패턴으로 검색(python으로 data:…;base64 제거 후 검색)

# ⑥ 기록 파일의 쿠키·설정 코드 가림 여부
grep -o 'sid=[^;", ]*' logs/auth-log.jsonl | sort | uniq -c     # sid=***masked*** 만 나와야 함
grep -o '"setupCode": *"[^"]*"' logs/auth-log.jsonl | sort | uniq -c   # ***masked*** 만 나와야 함

# ⑦ 외부 호출·위험 API
grep -n -E "fetch\(|XMLHttpRequest|https?://|innerHTML|eval\(|new Function|document\.write|child_process|exec\(" server.js store.js public/auth.js

# ⑧ public/index.html 외부 자원 (base64 제거 후)
python3 - <<'EOF'
import re
s=re.sub(r'data:[a-z/+\-]+;base64,[A-Za-z0-9+/=]+','data:...',open('public/index.html',encoding='utf8').read())
print(sorted(set(re.findall(r'https?://[^\s"\'<>)]+',s))))
print(re.findall(r'<script[^>]+src="([^"]+)"',s))
EOF

# ⑨ 의존성 취약점 (npm 공식 저장소에 패키지 이름·버전을 조회함)
npm audit --omit=dev

# ⑩ 프로젝트 폴더 밖에 남은 시험 폴더 (0개여야 한다. 시험 전에 npm test 를 한 번 돌려 확인)
ls -d "$(cygpath -u "$(node -p "require('os').tmpdir()")")"/passkey-e2e-* 2>/dev/null | wc -l   # Windows(Git Bash)
ls -d /var/folders/*/*/T/passkey-e2e-* 2>/dev/null                                                    # macOS

# ⑪ 서버 설정 (임시 포트·임시 폴더 사용, 끝나면 반드시 종료)
S=<임시폴더>; mkdir -p $S
PORT=3300 ORIGIN=https://example.test DATA_DIR=$S LOG_FILE=$S/l.jsonl SETUP_CODE=PROBE-ONLY node server.js &   # Supabase 키는 설정하지 않는다(파일 저장소로 실행)
curl -s -i -X POST http://localhost:3300/api/login/options -H 'X-Forwarded-Proto: https' -H 'Origin: https://example.test' | grep -i set-cookie   # HttpOnly; Secure; SameSite=Lax
for p in /store.js /server.js /supabase/schema.sql /data/private-data.json /node_modules/ /.git/config /AUTH.md /logs/auth-log.jsonl; do curl -s -o /dev/null -w "$p %{http_code}\n" http://localhost:3300$p; done   # 모두 404 (Git Bash 에서는 앞에 MSYS_NO_PATHCONV=1 을 붙여야 경로가 깨지지 않음)
curl -s -o /dev/null -w "evil origin %{http_code}\n" -X POST http://localhost:3300/api/logout -H 'Origin: https://evil.example'   # 403
lsof -ti tcp:3300 | xargs -r kill

# ⑫ 소스·문서·기록에 Supabase 주소·키 흔적
grep -rn -i -E 'supabase\.co|sb_secret|sb_publishable' --exclude-dir=node_modules --exclude-dir=.git . | grep -v '^./package-lock.json'   # 결과 없음

# ⑬ (Supabase 프로젝트를 만든 뒤, 사용자가 실행) 공개 키로 테이블이 열리지 않는지
#    URL·공개(anon) 키는 Supabase 대시보드 → Project Settings → API 에서 복사. 서비스 롤 키는 여기에 쓰지 않는다.
for t in passkeys sessions challenges auth_failures; do
  curl -s -w " <- $t %{http_code}
" "$SUPABASE_URL/rest/v1/$t?select=*" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
done   # 모두 [] 이거나 401/403 이어야 한다. 행이 보이면 실패
curl -s -w " <- rpc %{http_code}
" -X POST "$SUPABASE_URL/rest/v1/rpc/delete_passkey" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" -H 'Content-Type: application/json' -d '{"p_account":"x","p_id":"y"}'   # 401/403/404 (permission denied)

# ⑭ 필수 설정이 없으면 시작하지 않는지
VERCEL=1 node server.js                                                       # SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다
SUPABASE_URL=http://127.0.0.1:9 SUPABASE_SERVICE_ROLE_KEY=x node server.js    # SESSION_SECRET 환경변수가 필요합니다
```

## 최근 점검 결과 (2026-10-24, 배포 직전)

| 구분 | ✅ 통과 | ⏳ 진행중 | ➖ 미확인/사용자 확인 | ❌ 실패 |
|---|---|---|---|---|
| 점검 항목 29개 | 29 | 0 | 0 | 0 |
