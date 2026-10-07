# T04 통과 근거 기록

## 전체 검증 한 번에 돌리기
```
./scripts/run_all_checks.sh
```
아래 근거에 나오는 검증 스크립트 6개(합성 재생·동기화 대조·해시 검증)를 순서대로 실행하고 요약을 보여준다. 각 스크립트의 역할은 `scripts/README.md` 참고.

## 공개 심사 주소
- 화면(Artifact): https://claude.ai/artifact/NU3dnjRnBuhYWbACYmDXiw
  - ⚠️ 게시 직후 상태는 **비공개**. C01(로그인 없이 시크릿 창에서 열림)을 만족시키려면
    사용자가 Share 메뉴에서 "링크가 있는 모든 사람" 등 로그인 불필요 공유로 직접 변경해야 함.
    변경 후 실제 시크릿 창 테스트로 재확인 필요.
- 원천 API: https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.9780&current=temperature_2m,relative_humidity_2m,weather_code&timezone=Asia%2FSeoul
  (API 키 없음, 이 URL 자체도 브라우저에서 그대로 열림 → 인증 요소 없음)

## 정상 1건 — 원자료 · 저장값 · 화면값 대조

기준 캡처: `data/weather/seoul/2026-09-27.json` (스크립트: `scripts/fetch_weather.py`, 조회 시각 2026-09-27T04:24:50Z)

| 항목 | 원자료 (raw_response) | 저장값 (stored) | 화면값 (index.html 표시) |
|---|---|---|---|
| 값 | `current.temperature_2m = 25.8` | `25.8` | `25.8` |
| 단위 | `current_units.temperature_2m = "°C"` | `"°C"` | `°C` |
| 출처 | (API 호출 URL 자체) | `"Open-Meteo (api.open-meteo.com)"` | `Open-Meteo (api.open-meteo.com)` |
| 출처 시각 | `current.time = "2026-09-27T13:15"` (+ `utc_offset_seconds=32400`) | `"2026-09-27T13:15:00+09:00"` | `2026-09-27T13:15:00+09:00` |
| 조회 시각 | 원 응답에는 없음(응답 수신 순간을 별도 기록) | `"2026-09-27T04:24:50Z"` | 화면이 fetch를 보낸 순간의 UTC (예: `2026-09-27T04:24:50Z (UTC)`) |
| 기준 시간대 | `timezone = "Asia/Seoul"`, `utc_offset_seconds = 32400` | `"Asia/Seoul"` | `Asia/Seoul (UTC+09:00)` |

**일치 근거**: `scripts/fetch_weather.py`의 저장 로직과 `web/index.html`의 표시 로직이
동일한 원본 필드(`current.temperature_2m`, `current_units.temperature_2m`, `current.time` + `utc_offset_seconds`, `timezone`)를
동일한 방식으로 가공한다 — 값 자체를 변형·반올림·재계산하지 않고 그대로 옮긴다.
값이 15분 간격으로만 갱신되므로, 스크립트 실행과 화면 로드가 같은 15분 창 안에서 이뤄지면
`current.time`과 값이 동일하게 관측된다.

⚠️ 화면은 "실시간 조회"이므로 리뷰어가 나중에 열면 그 시점의 새 값(다른 조회 시각·다른 기온)이 표시되는 것이 **정상**이며,
이는 T04-C03(실제 동적 값 조회)의 의도된 동작임. 이 표를 위한 "정상 1건" 증거는 위 캡처 시점 기준.

## 실패 시 표시 및 다섯 실패 재생 (C26)
`web/index.html`의 `showError()`는 네트워크 차단 / HTTP 오류 / JSON 파싱 실패 / 필드 누락(타입 불일치 포함) 네 가지 분기에서
"조회 실패"를 화면에 명시하고, 값 자리를 `—`로 비우며, 실패 사유를 그대로 출력한다.

`scripts/test_failure_replays.mjs`로 이 분기 로직을 5개의 **합성 시험값**(실제 API 호출 없음)으로 재생 확인함:

| # | 재생 시나리오 (합성값) | 결과 |
|---|---|---|
| 1 | fetch 자체가 실패(네트워크 차단) | PASS — "네트워크 요청 자체가 차단..." 표시 |
| 2 | HTTP 500 응답 | PASS — "서버가 HTTP 500을 반환..." 표시 |
| 3 | 손상된 JSON | PASS — "JSON으로 해석할 수 없습니다" 표시 |
| 4 | 응답 본문이 `{}` (current 없음) | PASS — "기대한 값이 없습니다" 표시 |
| 5 | `current.temperature_2m`이 문자열 `"N/A"` | PASS — "기대한 값이 없습니다" 표시(타입 검증) |
| 대조군 | 정상 합성 데이터 | PASS — 실패로 오탐하지 않음 |

실행: `node scripts/test_failure_replays.mjs` → 6건 중 실패 0건 (2026-09-22 확인).
단, 이 스크립트는 `index.html`의 분기 로직을 그대로 옮겨 재현한 것이며, 두 파일의 메시지 문자열이
서로 달라지면 이 테스트가 그 사실을 잡아내지 못하므로 index.html 수정 시 반드시 함께 갱신해야 함.

## 비밀값 검색 결과 (C11)

- **API 키 필요 여부**: Open-Meteo는 API 키가 원천적으로 필요 없음(1단계에서 이 이유로 선택). 따라서 클라이언트 코드·요청 어디에도 넣을 비밀값 자체가 없음.
- **브라우저/네트워크**: `web/index.html`의 요청은 `fetch(API_URL, { cache: 'no-store' })` 한 줄뿐 — `Authorization` 헤더, 쿼리 파라미터 `key=` 등 어떤 형태의 비밀값도 붙이지 않음. `API_URL`은 `latitude`, `longitude`, `current`, `timezone` 파라미터만 포함.
- **저장소 파일 검색** (2026-09-22, `today-info-board/` 전체 대상):
  ```
  grep -rniE "api[_-]?key|apikey|secret|token|authorization|bearer|password|client[_-]?secret" .
  ```
  → 매치 0건.
- **Git 기록**: `today-info-board/`는 아직 어떤 커밋에도 포함된 적 없음(`git status` 상 전부 untracked) → 이 프로젝트의 Git 기록에는 검색할 대상 자체가 없어 0건.
  저장소 전체(`git log --all -p`)에서 같은 패턴을 검색하면 3건이 나오지만, 전부 **다른 브랜치의 과거 프로젝트 문서**에 있는 "제출 전 key/token/secret 문자열을 검색하라"는 체크리스트 문구이며, 실제 하드코딩된 비밀값이 아님을 원문 대조로 확인함.

**결론: T04-C11 통과.**

## 3단계: 다섯 실패 재생 + 복구 (C12~C19, 부수적으로 C20·C21·C26)

### 경위
2026-09-23에 3단계를 처음 진행할 때 "제공된 파일이 없다"는 확인에 근거해 패키지를 직접 지어냈으나,
곧 사용자가 실제 패키지 파일 18개 중 17개(zip 자체 제외)를 찾아 전달했다.
지어낸 버전(package_id, fixture 값·날짜, 실패 이름 등)은 전부 삭제하고, 실제 파일로 다시 진행했다.

### 공개 package ID·파일 hash 대조
- package_id: `aleph-t04-real-information-board-public-contract-v2`
- 위치: `assets/studio-task-assets/t04-real-information-board/`
- `node scripts/verify_asset_manifest.mjs` → asset-manifest.json에 적힌 17개 파일 전부 SHA-256·바이트 수 일치 (불일치 0건, 2026-09-23).
  단 `fixture-manifest.json`의 `canonical_sha256`은 `aleph-json-canonical-v1`이라는, 규격이 공개되지 않은 정규화 방식의 해시라 재계산·대조하지 못했음(원본 바이트 SHA-256만 확인).
- criterion-registry.json 확인 결과, 정본 조건은 `T04-C01`~`T04-C35` 35개이며, **C02도 실제로 존재하는 조건**(로그인 없이 열림)이다.
  이전에 "C02는 요구사항에 없다"고 판단했던 것은 사용자가 그 시점에 실제 registry 없이 판단한 것이었고, 지금 근거로 정정한다.

### 외부 원천 실패 다섯 상태 재생 결과
`node scripts/replay_t04_fixtures.mjs` — 실제 `adapter-reset.example.js` + `fixtures/*.json`을 그대로 재생, 2026-09-23 실행, **총 74건 검사 중 실패 0건**.

| 기준 | 실패 fixture | error_code | 결과 |
|---|---|---|---|
| C12 | T04-TIMEOUT | `timeout` | PASS |
| C13 | T04-AUTH-401 | `auth` | PASS |
| C14 | T04-RATE-429 | `rate_limit` | PASS |
| C15 | T04-OFFLINE | `offline` | PASS |
| C16 | T04-SCHEMA-BREAK | `schema_error` | PASS |

C26: 5가지 error_code가 서로 완전히 다름을 확인(고유 5/5), 전부 합성 fixture만 사용(실제 API 호출 없음).

### 마지막 정상값·오래된 값 표시·다시 시도·복구 (C17~C19)
- **C17**: `reset → D1-A(100) → D1-B(105) →` 실패 5종 각각에서 `current_reading.normalized_value`가 105로 그대로 유지됨(지워지지 않음).
- **C18**: 실패 시 `status.freshness='stale'`이 되고, 화면(index.html)에서 값 옆에 "오래됨(stale)" 배지로 표시.
- **C19**: 실패 5종 각각 뒤 `T04-RECOVER-D2` 재생 → `freshness=fresh`, `error_code=none`, 일별 행이 1건→2건으로 **정확히 1건**만 추가(2026-08-24 → 2026-08-25), 저장값 120, 전일 대비 +15. 화면에는 실패 상태에서 "다시 시도(RECOVER-D2 재생)" 버튼 노출.
  `criterion-registry.json`의 `T04-C19.expected_recovery_transition`(T04-TIMEOUT 기준 before/after 전이값)과도 정확히 일치함을 별도로 재확인.

### 부수 확인 (C20, C21 — 아직 공식 요청 단계는 아니지만 같은 재생으로 근거 확보)
- C20: `D1-A → D1-B`(같은 날짜, 값 100→105)가 같은 `record_id`로 원자적 갱신되어 일별 행이 1건 유지됨.
- C21: `D1-B → D2`(다음 날짜, 값 105→120)가 새 행을 만들어 일별 행이 2건이 됨, 전일 대비 +15.

### 화면 반영
공개 Artifact(위 URL, v4)에 "합성 실패 재생 콘솔" 절 추가. 1단계 실시간 카드와는 완전히 분리된 별도 카드이며,
버튼(D1-A/D1-B/D2/TIMEOUT/AUTH-401/RATE-429/OFFLINE/SCHEMA-BREAK/RECOVER-D2/reset)으로 직접 재생해
freshness/error_code/값/오래됨 배지/전일 대비/합성 기록 건수가 바뀌는 것을 화면에서 직접 볼 수 있다.

`web/index.html`에 인라인으로 넣은 adapter 로직·fixture는 `scripts/verify_fixture_sync.mjs`로 검증:
① fixture 데이터가 원본 파일과 부분집합 일치, ② 인라인 로직과 실제 `adapter-reset.example.js`가 7가지 재생 시퀀스에서 동일한 결과(freshness/error_code/row_count/stored_value/delta)를 냄. 총 실패 0건(2026-09-23).

### D1/D2 격리 확인
`replay_t04_fixtures.mjs` 마지막 단계에서 `data/weather/`(실제 기록)에 합성 날짜(`2026-08-24`, `2026-08-25`)가 섞이지 않았음을 확인 — 실제 파일은 `2026-09-27.json`(지역별 폴더 아래)뿐.
합성 날짜가 실제 캡처 날짜(2026-09-27 등)와 겹치지 않아 혼동 여지도 없음.

## 4단계: 일별 고유키·중복 방지 (C20, C21)

### 일별 고유키·갱신 규칙
- 일별 고유키: `stored.source_time`(출처 시각)의 **Asia/Seoul 날짜 부분**(`YYYY-MM-DD`). 조회 시각(query_time_utc)이 아니라 출처 시각 기준으로 잡음 — 자정 근처에서 조회 시각과 출처 시각의 날짜가 어긋날 수 있기 때문(막히는 지점 대응: 기준 시간대 확인 → 날짜 키 생성 위치 확인 → UTC와 화면 날짜 대조).
- 갱신 규칙: 같은 날짜 키로 다시 저장하면 **같은 파일을 덮어써서 최신값으로 합친다**(upsert). `daily_meta.revision_count`로 같은 날 몇 번 갱신됐는지, `first_seen_query_time_utc`/`last_seen_query_time_utc`로 처음·마지막 갱신 시각을 보존한다. 이전 코드는 "이미 있으면 건너뛰기"였는데, 이번에 "있으면 갱신"으로 고쳤다(`scripts/fetch_weather.py`의 `save_record()`).

### 합성 시계 시험 (같은 날짜 세 번 + 다음 날짜 한 번)
`python3 scripts/test_daily_dedup.py` — 임시 디렉터리에서 실행(실제 `data/weather/`는 건드리지 않음), 2026-09-23 실행, **17건 검사 중 실패 0건**.

| 시점 | 동작 | 파일 수 | revision_count |
|---|---|---|---|
| 합성 1일차 1회차 (2099-02-01, 10.0°C) | created | 1 | 1 |
| 합성 1일차 2회차 (2099-02-01, 10.5°C) | updated | 1 | 2 |
| 합성 1일차 3회차 (2099-02-01, 11.0°C) | updated | **1** | **3** |
| 합성 2일차 1회차 (2099-02-02, 12.0°C) | created | **2** | 1(새 파일) |

**같은 날 재실행 전후 행 수**: 세 번 재실행 후에도 1건 유지 → 다음 날짜 진입 후 2건(정확히 1건 추가). 1일차 파일 값은 마지막(3번째) 호출값(11.0)으로 갱신되고, 2일차 저장이 1일차 파일을 건드리지 않음을 확인.

## 5단계: 서로 다른 실제 날짜 기록 2건 + 전일 대비 재계산 (C22~C24) — 현재 미충족

### 현재 상태 (2026-09-27 기준)
- 이전에 확보했던 2026-09-22, 2026-09-23 서울 기록 파일과 그 밖의 2026-09-23 지역 기록은 사용자 결정으로 의도적으로 삭제했다. 따라서 이전 근거(값 21.2 → 20.3, 델타 -0.9°C, 16건 검사)는 더 이상 이 저장소의 증거가 아니다.
- 현재 실제 기록은 4개 지역 모두 `data/weather/<지역id>/2026-09-27.json` 한 건씩이다. 서울도 1건이므로 **C22(서로 다른 Asia/Seoul 실제 날짜 정확히 2건)는 충족되지 않는다.** 다음 실제 날짜(2026-09-28)에 `python3 scripts/fetch_weather.py seoul`을 실행해 기록이 쌓여야 충족된다.
- `node scripts/verify_daily_records_sync.mjs`는 서울 파일 수가 2개가 아니어서 C22 항목에서 실패를 보고한다(나머지 값·단위·출처·출처 시각·원자료 일치 항목은 통과).
- 화면(index.html)에 표시된 2026-09-26 값은 시연용 **더미**이며 `data/weather/`에 저장하지 않았다. 실제 기록이 아니므로 C22~C24의 근거로 쓰지 않는다. 실제 두 번째 날짜 기록이 생기면 더미 코드를 제거한다.

### 저장값·화면값 일치 (C23) / 재계산 (C24)
2026-09-27 한 건 기준으로 각 지역의 값·단위·출처 URL·출처 시각이 저장 파일과 화면 임베드 값에서 일치함을 `verify_daily_records_sync.mjs`가 확인한다. 전일 대비 재계산(`델타 = 늦은 날짜 값 − 이른 날짜 값`)은 실제 날짜 기록이 2건 이상 있어야 성립하므로 아직 검증하지 못했다.

## 개인정보 점검 (C25)
- 좌표: 서울 시청 인근 공개 좌표(37.5665, 126.9780) — 개인 주소/기기/계정 정보 아님.
- 코드·데이터 파일 전체에 이름, 이메일, 계정, 위치기록(개인) 등 없음.

## 6단계: 지역 선택 화면 4개 지역 전부 동일 구성으로 확장 (보강 기능, 채점 기준 밖)

첫 화면의 지역 선택 그리드(서울/구미/대구/청도 그레이스 CC)에서 서울만 T04 전체 필드(값·단위·출처·출처시각·조회시각·기준시간대, 전일 대비, 추이, 합성 실패 재생 콘솔)를 갖춘 보드로 연결되고 나머지 3개 지역은 값·습도·풍속만 보여주는 간이 화면으로 연결되던 구조를, 4개 지역 모두 같은 보드 화면(파라미터화된 단일 `boardView`)으로 연결되도록 바꿨다.

- `scripts/fetch_weather.py`가 지역ID 인자를 받도록 바뀌었고(REGIONS: seoul/gumi/daegu/grace-cc), 저장 경로가 `data/weather/<지역id>/<날짜>.json`으로 바뀌었다(기존 서울 파일은 `data/weather/seoul/`로 이동).
- `web/index.html`의 실시간 카드·추이 그래프·전일 대비 표가 모두 지역 파라미터를 받아 동작하도록 리팩터링됐다(`window.TIB.loadCurrent/loadTrend/renderDailyRecords`).
- 구미·대구·청도 그레이스 CC 세 지역은 2026-09-27에 실제 Open-Meteo 호출로 1일차 기록을 확보했다(값·출처시각·조회시각 전부 실제 응답, 합성값 아님). `scripts/verify_daily_records_sync.mjs`로 4개 지역 전부 화면 임베드 값과 저장 파일이 일치함을 확인했다(2026-09-27 실행). 이전 2026-09-23 지역 기록은 사용자 결정으로 삭제했다.
- 현재 4개 지역 모두 실제 기록이 1건뿐이라 T04-C22(서로 다른 실제 날짜 기록 정확히 2건)는 서울도 충족하지 못한다(5단계 참고). 다음 실제 날짜(Asia/Seoul 기준)에 `python3 scripts/fetch_weather.py <지역id>`를 한 번 더 실행하고 `web/index.html`의 `DAILY_RECORDS_BY_REGION`에 그 값을 추가하면 채워진다. 공식 T04 채점 대상은 서울 하나이며, 이 확장은 코드 코멘트에 명시된 대로 "채점 기준 밖의 추가 기능"이다.
- `scripts/verify_asset_manifest.mjs`가 `assets/studio-task-assets/` 패키지 17개 파일 전부에서 바이트 수·해시 불일치로 실패한다. 원인 분석(2026-09-27): git에 커밋된 원본(blob)은 LF이고 asset-manifest.json의 SHA-256과 17/17 일치하지만, Windows의 `core.autocrlf=true` 설정으로 작업 폴더에 체크아웃된 파일이 CRLF로 바뀌어 바이트가 달라진 것이다(작업 폴더 파일을 CRLF→LF로 정규화해 해시하면 17/17 일치). 원본 패키지는 채점 기준이라 임의로 줄바꿈을 고치지 않았다.
- 이미지 자산 출처: `assets/tab/*.png`(seoul, gumi, daegu, grace-cc — 지역 탭 이미지 4개)와 `assets/common/mouse-cursor.png`(커스텀 마우스 커서)는 전부 ChatGPT로 생성한 이미지다(사용자 확인). 실제 사진이나 제3자 저작물이 아니라 개인정보·저작권 문제는 없다. (이전에 쓰던 `assets/region/*.png`는 삭제되어 더 이상 사용하지 않는다.)


## 7단계: 슬라이드 화면·지역 탭 이미지 (보강 기능, 채점 기준 밖)

- 첫 화면을 "하우스 웨더" 이름의 슬라이드 구성으로 바꿨다. 상단 탭(지역 이미지 4개)과 옆으로 넘기는 카드가 연동되고, 카드에는 값·단위·출처·출처 시각·조회 시각·기준 시간대가 표시된다. 지역 선택 그리드(이미지 클릭 진입)는 제거했다.
- 기존 상세 영역(실시간 조회 카드, 전일 대비, 최근 기온 추이, 합성 실패 재생 콘솔)은 슬라이드 아래에 항상 노출되며, 선택된 탭의 지역으로 바뀐다.
- 카드의 "전일 대비" 줄과 2026-09-26 값은 시연용 더미이며 실제 기록이 아니다(`data/weather/`에는 없음, `[9/26은 더미]`로 화면에 표시).

## 8단계: 빈 공간 안내 이미지·그레이스 탭 이미지 교체 (보강 기능, 채점 기준 밖)

- `assets/etc/empty.png`, `assets/etc/general-space.png`, `assets/etc/small-space.png`, `assets/etc/sun.png`는 날씨 연결 안내 메시지 창과 8시간 날씨 예보 창의 빈 공간 안내용 그림이다(`web/index.html`에서 사용).
- 위 4개와, 새 그림으로 교체한 `assets/tab/grace-cc.png`(청도 그레이스 CC 탭 이미지)는 전부 ChatGPT로 생성한 이미지다(사용자 확인, 2026-10-08). 실제 사진이나 제3자 저작물이 아니라 개인정보·저작권 문제는 없다.
- 2026-10-08 실제 조회 기록 4건: `data/weather/{seoul,gumi,daegu,grace-cc}/2026-10-08.json`은 `scripts/fetch_weather.py`로 2026-10-08 01:2x(KST)에 Open-Meteo에서 받은 실제 조회 값이다.
- **테스트용 소급 기록 4건**: `data/weather/{seoul,gumi,daegu,grace-cc}/2026-10-07.json`은 10-07에 실시간으로 조회한 기록이 아니다. 전일 대비 화면을 시험하려고(사용자 요청, 2026-10-08) 10-08에 Open-Meteo 시간별 과거 값(`past_days=1`, 10-07 01:00)을 가져와 같은 형식으로 저장했고, 파일의 `daily_meta.test_backfill`·`backfill_note`에 표시했다. **T04-C22~C24(서로 다른 실제 날짜에 조회한 기록 2건, 재계산)의 증거로 쓰지 않는다.** 실제 증거는 10-09에 `fetch_weather.py`를 다시 실행해 10-08·10-09 두 건을 만들어야 한다.
- 지역 탭 날씨 배경(보강 기능, 채점 기준 밖): 지역 탭 네모 칸 뒤에 그 지역의 현재 날씨 배경 그림(화면 배경과 같은 그림·같은 선택 규칙)을 깐다. 선택된 지역은 실시간 조회가 알려주는 날씨를 그대로 따르고, 나머지 지역은 Open-Meteo에 네 지역 좌표를 한 번에 묻는 요청 1건(`current=weather_code,wind_speed_10m,is_day`)으로 채운 뒤 1시간마다 다시 받는다. 이 값은 화면 장식에만 쓰고 저장하지 않으며(`data/`에 기록 없음), 조회에 실패하면 탭은 이전 상태 그대로 둔다. 새 자산은 없다(기존 `assets/weather/background/*.png` 재사용).
- 이미지 최적화(보강 기능, 채점 기준 밖, 2026-10-08): 첫 화면을 열 때 받는 이미지가 약 12MB라 무거워서, 원본을 그대로 두고 화면에 쓰는 크기에 맞춘 복사본을 `assets/optimized/`에 만들었다(원본 PNG는 삭제·수정하지 않았다). 복사본은 원본에서 변환만 했으므로 출처는 원본과 같다(ChatGPT로 생성, 사용자 확인).
  - `optimized/tab/*.webp`: 지역 탭 이미지 4개를 폭 480px 무손실 WebP로 축소(원본 약 2MB → 150~230KB).
  - `optimized/background/*.webp`: 화면 배경 7장. 원본과 픽셀이 완전히 같은 무손실 WebP(약 20% 작음).
  - `optimized/background-tab/*.webp`: 지역 탭 칸 뒤에 까는 같은 배경 7장을 폭 640px(품질 92)로 줄인 것.
  - `optimized/etc/small-space.webp`, `optimized/etc/sun.webp`: 둘레의 빈 여백만 잘라낸 무손실 WebP(화면에 나오는 픽셀은 원본과 같음, small-space 2.1MB → 0.8MB).
  - 효과: 1920×1080에서 처음 열 때 받는 이미지 12.1MB → 3.3MB, 폰 너비 12.1MB → 3.2MB. 원본 PNG와 줄인 복사본을 쓴 화면을 같은 조건에서 캡처해 비교했을 때 안내 메시지 창은 픽셀이 같았고, 지역 탭과 오른쪽 공룡은 눈으로는 구분되지 않는 미세한 차이(탭 평균 2/255)만 있었다.
- 날씨 데이터 정리(2026-10-08): 화면에 내장된 대체 기록(`DAILY_RECORDS_BY_REGION`)을 현재 `data/weather/<지역>/` 파일(지역별 2026-10-07 소급 테스트 1건 + 2026-10-08 실제 조회 1건)과 같게 맞췄다. `scripts/verify_daily_records_sync.mjs`는 원자료를 `raw_response.current`로만 읽었는데 소급 기록은 시간별(`hourly`) 구조라 오류로 멈췄으므로, `daily_meta.test_backfill`이 표시된 기록에 한해 `raw_response.hourly`로 대조하도록 고쳤다(실제 조회 기록의 대조 방식은 그대로). 이로써 `run_all_checks.sh`는 6개 스크립트 모두 통과한다.
  - ⚠️ 이 통과는 기계적 통과다. 서울 폴더가 "정확히 2개 파일"이라 C22 검사도 통과하지만, 10-07 기록은 그날 실제로 조회한 기록이 아니므로 C22~C24의 **실제 날짜 증거는 아직 아니다**. 실제 증거는 2026-10-09에 `fetch_weather.py`를 다시 실행해 10-08·10-09 두 건을 만든 뒤(10-07 테스트 파일 삭제, 내장 기록 재동기화) 얻는다.
