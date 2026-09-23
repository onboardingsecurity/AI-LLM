# scripts/ 안내

| 파일 | 역할 | 관련 기준 |
|---|---|---|
| `fetch_weather.py` | 실제 운영 코드. Open-Meteo에서 지정한 지역의 기온을 조회해 `data/weather/<지역id>/<날짜>.json`에 upsert 저장(같은 날 갱신, 다른 날 새 파일). 지역ID를 인자로 받음(`python3 fetch_weather.py gumi`), 생략 시 `seoul`. 지원 지역: `seoul`, `gumi`, `daegu`, `grace-cc`(REGIONS 상수, `web/index.html`의 REGIONS와 좌표 동일하게 유지). | C03~C10, C20, C21 |
| `test_daily_dedup.py` | `fetch_weather`의 저장 로직을 임시 폴더에서 합성 시계(같은 날 3회+다음 날 1회)로 시험(지역과 무관, 로직만 검증). | C20, C21 |
| `test_failure_replays.mjs` | `web/index.html` 실시간 카드의 실패 처리(`showError`) 분기를 합성 시나리오로 재생. | C26 (실시간 카드) |
| `replay_t04_fixtures.mjs` | 사용자가 전달한 실제 T04 패키지(`assets/studio-task-assets/.../adapter-reset.example.js` + fixtures)를 그대로 재생. | C12~C21, C26 |
| `verify_asset_manifest.mjs` | 그 패키지 파일들의 SHA-256·바이트 수가 `asset-manifest.json`과 일치하는지 재계산 대조. | 패키지 무결성 |
| `verify_fixture_sync.mjs` | `web/index.html`에 옮겨 넣은 adapter·fixture 사본이 원본 패키지와 데이터·동작 모두 일치하는지 대조. | 합성 콘솔 신뢰성 |
| `verify_daily_records_sync.mjs` | `web/index.html`의 지역별 "전일 대비" 임베드 값(`DAILY_RECORDS_BY_REGION`)이 `data/weather/<지역id>/*.json` 전부와 일치하는지, 재계산 델타가 맞는지 지역마다 대조. C22(서로 다른 실제 날짜 기록 정확히 2건)는 공식 채점 대상인 `seoul`에만 적용. | C22~C24 |

## 지역 추가/조회
```
python3 scripts/fetch_weather.py seoul     # 기본값, 생략 가능
python3 scripts/fetch_weather.py gumi
python3 scripts/fetch_weather.py daegu
python3 scripts/fetch_weather.py grace-cc
```
각 지역은 실제 날짜가 하루 지날 때마다 위 명령을 다시 실행해 두 번째 날짜 기록을 쌓아야 `verify_daily_records_sync.mjs`의 전일 대비 재계산(C24류) 대상이 된다. 새로 기록이 쌓이면 `web/index.html`의 `DAILY_RECORDS_BY_REGION`(`--- DAILY-RECORDS-SYNC-START/END ---` 구간)에도 같은 값을 손으로 추가해야 한다(자동 동기화 아님, `verify_daily_records_sync.mjs`가 어긋나면 잡아냄).

## 한 번에 전부 확인
```
./scripts/run_all_checks.sh
```
위 스크립트 전부를 순서대로 돌리고, 마지막에 통과/실패 요약을 보여준다. 개별 스크립트는 각자 `python3 scripts/xxx.py` 또는 `node scripts/xxx.mjs`로도 실행 가능(Windows에서 한글 출력이 깨지면 `PYTHONIOENCODING=utf-8`을 먼저 설정).

## 원본과 사본 관계 (왜 두 군데에 같은 내용이 있나)
`web/index.html`은 Claude Artifact로 게시되는 단일 HTML 파일이라, Node 전용(CommonJS) 파일인 `adapter-reset.example.js`를 그대로 불러올 수 없다. 그래서 브라우저용으로 옮겨 적었고, 이 옮겨 적은 사본이 원본과 어긋나지 않았는지는 코드 리뷰가 아니라 `verify_fixture_sync.mjs`/`verify_daily_records_sync.mjs`가 **실행할 때마다 자동으로** 대조한다. 원본(`assets/.../adapter-reset.example.js`, `data/weather/*.json`)을 고치면 이 스크립트들을 다시 돌려서 사본도 맞춰야 한다.
