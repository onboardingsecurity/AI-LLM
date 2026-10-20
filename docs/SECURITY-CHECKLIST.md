# 보안 점검 리스트 — 코드를 외부로 옮기기 전에

**목적**: 코드·문서·기록을 GitHub나 호스팅 같은 외부로 옮기기 전에, 올라가면 안 되는 것이 들어 있지 않은지 점검합니다.
**범위**: 시스템 변경, 외부 연결, 키 값 노출과 관리, 개인정보, 기록 파일, 서버 설정.
**점검 방법**: "보안 점검해줘"라고 하면 아래 "확인 방법"을 실제로 실행해 상태를 다시 판정합니다. 절차는 [HANDOFF.md](HANDOFF.md)의 "점검 실행 방법"을 따릅니다.

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

| ID | 점검 항목 | 확인 방법 | 상태 | 근거 (2026-10-21) |
|---|---|---|---|---|
| S01 | 비밀키·토큰·API 키 값이 파일에 없다 | 명령 ① | ✅ | 키·토큰·개인키 패턴 검색 결과 없음 |
| S02 | 세션 비밀·설정 코드가 소스에 박혀 있지 않다 | 명령 ② | ✅ | 세션 비밀은 환경변수 또는 실행 때 무작위 생성, 설정 코드도 환경변수 또는 무작위. `TEST-CODE`는 시험 전용 상수 |
| S03 | 실행 중 생기는 파일이 저장소에서 제외된다 | 명령 ③ | ✅ | `data/passkeys.json`, `node_modules`, `.env`가 ignore 됨 |
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
| S12 | 서버 콘솔·호스팅 로그에 설정 코드가 찍히지 않는다 | `server.js` 427줄 | ⏳ | 시작할 때 설정 코드를 콘솔에 출력함(설계 D02). 호스팅 로그를 보는 사람은 코드를 알 수 있음. 대응: 배포 때 `SETUP_CODE` 환경변수 사용과 로그 접근 제한 |

### D. 외부 연결

| ID | 점검 항목 | 확인 방법 | 상태 | 근거 |
|---|---|---|---|---|
| S13 | 서버·브라우저 코드가 외부로 호출하지 않는다 | 명령 ⑦ | ✅ | `auth.js`의 `fetch`는 같은 출처 `/api`만. 서버 코드에 외부 호출 없음(증명서 인증 `none` 형식이라 메타데이터 조회도 없음) |
| S14 | 외부 스크립트가 없고, 외부 자원은 무엇인지 안다 | 명령 ⑧ | ✅ | 스크립트는 `/auth.js`뿐. 외부는 Google Fonts(1번에서 유래)이며, 방문자 브라우저가 Google에 글꼴을 요청함 |
| S15 | 의존성 취약점이 없고 내려받는 곳이 npm 공식이다 | 명령 ⑨ | ✅ | `npm audit` 0건, lockfile 98개 모두 `registry.npmjs.org` |
| S16 | 위험한 API(`innerHTML`, `eval`, 쉘 실행)를 쓰지 않는다 | 명령 ⑦ | ✅ | 검색 결과 없음, 화면 출력은 `textContent`만 사용 |

### E. 시스템 변경

| ID | 점검 항목 | 확인 방법 | 상태 | 근거 |
|---|---|---|---|---|
| S17 | 프로젝트 폴더 밖에 파일을 남기지 않았다 | 명령 ⑩ | ➖ | `npm test`가 시스템 임시 폴더(`/var/folders/…/T/passkey-e2e-*`)에 가짜 패스키 저장소를 만들고 지우지 않음(현재 3개). 올리는 내용과 무관한 정리 사항이라 푸시를 막지 않음. 시험 코드 수정과 폴더 삭제는 승인 후
| S18 | 전역 설치·시스템 설정(launchd 등) 변경이 없다 | 작업 기록, `package.json` | ✅ | 의존성은 모두 프로젝트 안 `node_modules`, 전역 설치·시스템 설정 변경 없음 |

### F. 서버 설정

| ID | 점검 항목 | 확인 방법 | 상태 | 근거 |
|---|---|---|---|---|
| S19 | 서버가 폴더·소스·데이터를 주소로 내려 주지 않는다 | 명령 ⑪ | ✅ | `/node_modules/`, `/.git/config`, `/AUTH.md`, `/logs/…` 모두 404, 공개는 `/`와 `/auth.js`뿐 |
| S20 | 쿠키에 `HttpOnly`·`SameSite`가 있고 https 주소로 켜면 `Secure`가 붙는다 | 명령 ⑪ | ✅ | `HttpOnly; Secure; SameSite=Lax` 확인(임시 서버, https 주소로 설정) |
| S21 | 다른 출처에서 온 상태 변경 요청을 막는다 | 명령 ⑪, `npm test` | ✅ | `Origin: https://evil.example` → 403 |
| S22 | 입력 검증과 시도 횟수 제한이 있다 | `server.js` 226줄~, 시험 | ✅ | 이름 1~30자, JSON 100KB 제한, 잘못된 JSON 400, 설정 코드·로그인 실패 5분에 10회 제한. 한계는 `AUTH.md` ⑥ |
| S23 | 배포 환경의 HTTPS·HSTS·CSP 같은 보안 헤더 | 배포 후 확인 | ⏳ | 서버는 `Cache-Control: no-store`, `nosniff`만 설정. HSTS는 호스팅이 처리하는지 확인 필요. CSP는 페이지에 인라인 스크립트가 많아 아직 없음 |

### G. 올리기 직전

| ID | 점검 항목 | 확인 방법 | 상태 | 근거 |
|---|---|---|---|---|
| S24 | 커밋·푸시에 들어갈 파일 목록을 확인했다 | 명령 ③ (`git status`) | ✅ | 커밋 대상 확인함: `server.js`, `auth.js`, `index.html`, `AUTH.md`, `docs/`, `data/private-data.json`, `test/`, `logs/`, `package*.json`, `.gitignore`. `data/passkeys.json`·`node_modules`는 제외됨
| S25 | 원격 저장소의 공개 여부와 소유를 확인했다 | 사용자가 GitHub에서 확인 | ➖ | `gh`가 설치돼 있지 않아 공개 여부를 확인하지 못함. 올리는 내용은 점검을 통과했으므로 공개여도 문제가 되는 값은 없음. 소스 URL로 낼 저장소의 공개 설정은 GitHub에서 사용자가 확인

## 확인 명령 모음

```bash
# ① 비밀값 패턴
grep -n -E 'AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,}|BEGIN [A-Z ]*PRIVATE KEY|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-|service_role|api[_-]?key\s*[:=]|password\s*[:=]' \
  server.js auth.js AUTH.md docs/REQUIREMENTS.md docs/HANDOFF.md package.json package-lock.json .gitignore data/private-data.json test/e2e.mjs logs/*

# ② 하드코딩된 비밀 설정
grep -n -E "SESSION_SECRET|SETUP_CODE|secret:" server.js test/e2e.mjs

# ③ 올라갈 파일과 제외 여부
git status --short
for f in data/passkeys.json node_modules .env logs/auth-log.jsonl logs/e2e-log.jsonl; do git check-ignore -q $f && echo "ignored: $f" || echo "NOT ignored: $f"; done

# ④ 원격 주소·자격증명, 의존성 출처
git remote -v
grep -o '"resolved": "https\?://[^/]*' package-lock.json | sort | uniq -c

# ⑤ 개인정보 패턴 (이메일·전화·주민번호형·내 경로·사용자명 힌트)
grep -n -E '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}|0[0-9]{1,2}-[0-9]{3,4}-[0-9]{4}|[0-9]{6}-[1-4][0-9]{6}|/Users/' \
  server.js auth.js AUTH.md docs/REQUIREMENTS.md docs/HANDOFF.md package.json data/private-data.json test/e2e.mjs logs/*
# index.html 은 base64 이미지를 빼고 같은 패턴으로 검색(python으로 data:…;base64 제거 후 검색)

# ⑥ 기록 파일의 쿠키·설정 코드 가림 여부
grep -o 'sid=[^;", ]*' logs/auth-log.jsonl | sort | uniq -c     # sid=***masked*** 만 나와야 함
grep -o '"setupCode": *"[^"]*"' logs/auth-log.jsonl | sort | uniq -c   # ***masked*** 만 나와야 함

# ⑦ 외부 호출·위험 API
grep -n -E "fetch\(|XMLHttpRequest|https?://|innerHTML|eval\(|new Function|document\.write|child_process|exec\(" server.js auth.js

# ⑧ index.html 외부 자원 (base64 제거 후)
python3 - <<'EOF'
import re
s=re.sub(r'data:[a-z/+\-]+;base64,[A-Za-z0-9+/=]+','data:...',open('index.html',encoding='utf8').read())
print(sorted(set(re.findall(r'https?://[^\s"\'<>)]+',s))))
print(re.findall(r'<script[^>]+src="([^"]+)"',s))
EOF

# ⑨ 의존성 취약점 (npm 공식 저장소에 패키지 이름·버전을 조회함)
npm audit --omit=dev

# ⑩ 프로젝트 폴더 밖에 남은 시험 폴더
ls -d /var/folders/*/*/T/passkey-e2e-* 2>/dev/null

# ⑪ 서버 설정 (임시 포트·임시 폴더 사용, 끝나면 반드시 종료)
S=<임시폴더>; mkdir -p $S
PORT=3300 ORIGIN=https://example.test DATA_DIR=$S LOG_FILE=$S/l.jsonl SETUP_CODE=PROBE-ONLY node server.js &
curl -s -i -X POST http://localhost:3300/api/login/options -H 'X-Forwarded-Proto: https' -H 'Origin: https://example.test' | grep -i set-cookie   # HttpOnly; Secure; SameSite=Lax
for p in /node_modules/ /.git/config /AUTH.md /logs/auth-log.jsonl; do curl -s -o /dev/null -w "$p %{http_code}\n" http://localhost:3300$p; done   # 모두 404
curl -s -o /dev/null -w "evil origin %{http_code}\n" -X POST http://localhost:3300/api/logout -H 'Origin: https://evil.example'   # 403
lsof -ti tcp:3300 | xargs -r kill
```

## 최근 점검 결과 (2026-10-21)

| 구분 | ✅ 통과 | ⏳ 진행중 | ➖ 미확인/사용자 확인 | ❌ 실패 |
|---|---|---|---|---|
| 점검 항목 25개 | 21 | 2 (S12, S23) | 2 (S17, S25) | 0 |
