# 인증 구현 설명서 (플랜두씨 다이어리, 7번)

6번에서 만든 다이어리에 가입·로그인을 붙여, 내 계획과 기록을 로그인한 나만 볼 수 있게 만들었습니다.
이 문서는 여섯 항목(①~⑥)으로 나뉘어 있습니다. 비밀번호·토큰·비밀키는 원문을 적지 않고 가려서 적습니다.(예: `eyJhb…생략`)

- 이어서 쓴 6번 결과: (작성 예정: 실제 제출한 6번 결과 주소와 커밋)

---

## ① 무엇으로 붙였나

인증은 직접 만들지 않고 **인증 서비스인 Supabase Auth**를 사용했습니다.

- 이름과 버전: **Supabase Auth(GoTrue) v2.197.0** (서버의 `/auth/v1/health` 응답으로 확인한 버전)
- 브라우저에서는 별도 인증 라이브러리를 쓰지 않고 `fetch`로 Auth REST API를 직접 호출했으므로, 따로 적을 라이브러리 버전은 없습니다.

### 비밀번호 보관

- **되돌릴 수 없게 바꾸는 방법: bcrypt**
- **bcrypt인 이유:** 이 프로젝트는 비밀번호 처리를 인증 서비스에 맡겼고, Supabase Auth가 쓰는 방식이 bcrypt입니다. 계정마다 다른 소금값(salt)을 자동으로 붙여서 같은 비밀번호도 저장된 값이 달라지고, 일부러 느리게 계산하도록 설계되어 무차별 대입을 어렵게 하기 때문에 이 방식이 적합하다고 판단했습니다.
- **직접 만들지 않았다는 사실:** 비밀번호를 해시하고 저장하는 부분은 널리 쓰이는 인증 서비스(Supabase Auth)에 맡겼고, 이 저장소의 코드에는 비밀번호를 해시하거나 저장하는 코드가 없습니다.
- **DB에 저장된 모습:** 같은 시험용 비밀번호로 만든 시험 계정 2개(A, B)의 `auth.users.encrypted_password` 값입니다. 입력한 글자는 어디에도 보이지 않고, 뒷부분은 생략했습니다.

  | 계정 | 저장된 값 (앞부분) | 읽는 법 |
  |---|---|---|
  | A | `$2a$10$MAYIGwMA/dfS.pJpBb2sIe…(생략)` | `$2a$` = bcrypt, `10` = 계산 비용, 그다음 22글자 = 소금값 |
  | B | `$2a$10$.mBfDS0J2qnXve0TL8XESe…(생략)` | 위와 같음 |

  두 계정은 **같은 비밀번호**인데 소금값이 달라서(`MAYIGwMA…` / `.mBfDS0J2…`) 저장된 값이 서로 다릅니다. (확인 방법: Supabase SQL Editor에서 `select email, encrypted_password from auth.users` 실행, 시험 계정은 확인 뒤 삭제)

### 로그인 뒤 사람을 알아보는 방법: JWT 토큰 방식으로 구분

- 로그인에 성공하면 Supabase Auth가 접근 토큰과 갱신 토큰을 발급합니다.
- 요청마다 접근 토큰을 Authorization 헤더로 보내고, 서버는 토큰 안의 사용자 id로 구분합니다.
- 접근 토큰은 발급 후 1시간 뒤 만료되며 만료 전 갱신 토큰으로 새 토큰을 받습니다.
- 토큰은 브라우저의 sessionStorage에만 두며 탭을 닫으면 사라지고, URL에는 싣지 않습니다.
- 로그아웃하면 서버에서 세션을 지워서, 같은 토큰으로 다시 요청해도 거절됩니다.

## ② 왜 그걸 골랐나

함께 검토했지만 고르지 않은 방법과 이유입니다.

1. **직접 구현:** 비밀번호 해시, 세션 발급, 만료, 폐기 등을 직접 만드는 방법으로 세밀한 부분까지 제어 가능하지만, 보안 지식 부족으로 인한 위험성과 개발 생산성 저하로 선택하지 않았습니다.
2. **Firebase Auth:** 다른 인증 서비스로 Firebase Auth를 검토했지만, DB가 이미 Supabase 플랫폼을 사용해서 한 곳에서 관리하기 쉬운 Supabase Auth가 더 적합했습니다.
3. **OIDC(Google 계정 로그인):** 외부 계정으로 로그인하는 방법도 검토했지만, 복잡성과 개발 생산성 저하로 선택하지 않았습니다.

## ③ 어디를 어떻게 고쳤나

(줄 번호는 작성 시점 기준)

### 고친 곳 한눈에

| 파일 | 한 일 |
|---|---|
| `js/auth.js` (새 파일) | 가입·로그인·로그아웃, 토큰 보관과 갱신 |
| `index.html` | 로그인 화면 추가. 머리말·탭·본문은 로그인 뒤에만 열리고, 앱 스크립트는 `js/auth.js`가 로그인 뒤에 불러옴 |
| `js/api.js` | 요청마다 토큰을 `Authorization` 헤더로 전송, 401·403이면 갱신 후 한 번 재시도, 쓰기를 DB 함수 호출로 바꿈 |
| `supabase/auth-lock.sql` (새 파일) | 모든 표에 `user_id`(주인), 내 것만 읽는 정책, 주인을 확인하는 쓰기·읽기 함수 |
| `supabase/auth-session-check.sql` (새 파일) | 로그아웃·비밀번호 변경 뒤 옛 토큰을 거절 |

### 네 흐름이 지나는 소스

1. **가입:** 화면 `index.html:18` → 제출 처리 `js/auth.js:183` → `signUp` `js/auth.js:66` → Supabase Auth `/auth/v1/signup` → 토큰 보관 `saveSession` `js/auth.js:27` → 앱 열기 `showApp` `js/auth.js:164`
2. **로그인:** 제출 처리 `js/auth.js:183` → `logIn` `js/auth.js:73` → `/auth/v1/token?grant_type=password` → `saveSession` → `showApp` → 앱 스크립트 불러오기 `loadScripts` `js/auth.js:155`
3. **로그아웃:** 버튼 `index.html:45` → `logOut` `js/auth.js:105` → `/auth/v1/logout?scope=global`(서버가 세션을 지움, `js/auth.js:108`) → 브라우저 값 삭제 → 새로고침 → 로그인 화면
4. **자료 조회:** 화면 → `request` `js/api.js:22` → 토큰 준비 `getToken` `js/auth.js:95`(만료 60초 전이면 `refresh` `js/auth.js:81`) → `send` `js/api.js:7`(`Authorization` 헤더) → Supabase REST → DB
   - 읽기는 표의 정책 `supabase/auth-session-check.sql:54`, 쓰기·집계는 DB 함수 `supabase/auth-lock.sql:172` 이후를 지납니다.
   - 함수는 먼저 `require_user` `supabase/auth-session-check.sql:33`(세션이 살아 있는지 `session_alive` `:19`)과 `assert_plan_owner` `supabase/auth-lock.sql:132`(내 계획인지)를 확인합니다.
   - 401이나 403을 받으면 `js/api.js:28`에서 갱신을 한 번 시도하고, 안 되면 `expired` `js/auth.js:117`로 로그인 화면으로 돌아갑니다.

### 거절을 만들어 내는 소스 위치

| 거절 | 만드는 곳 |
|---|---|
| 로그인 없는 요청(401) | 표·함수 권한을 anon에게서 회수: `supabase/auth-lock.sql:90`(표), `:448`(함수) |
| 표에 직접 쓰기(403) | 쓰기 권한을 주지 않고 읽기만 부여: `supabase/auth-lock.sql:105` |
| 남의 자료를 표로 읽기(빈 목록) | 정책 "내 것만 읽기": `supabase/auth-session-check.sql:54`~`58` (처음 만든 곳은 `supabase/auth-lock.sql:109`~`113`) |
| 남의 자료를 함수로 읽기·수정·삭제(404) | `assert_plan_owner` `supabase/auth-lock.sql:132`와 각 함수의 주인 조건: `update_plan` `:193`, `plan_revisions_of` `:219`, `create_task` `:232`, `update_task` `:254`, `delete_task` `:278`, `complete_task` `:294`, `reopen_task` `:339`, `review_tasks` `:362`, `hand_over_improvement` `:399` |
| 로그아웃·비밀번호 변경 뒤 옛 토큰(403) | `session_alive` `supabase/auth-session-check.sql:19`, `require_user` `:33` |

## ④ 안 열리는 것을 확인한 기록

### 시험 준비: 계정 두 개와 자료

다른 사람의 자료가 보이는지 확인하려고 시험 계정 2개를 만들었습니다.
두 계정의 비밀번호는 시험용 무작위 값으로 정했고, 각 계정에는 계획·할 일·실행 기록을 넣었습니다.

| 계정 | 넣은 자료 | 서버가 매긴 번호 |
|---|---|---|
| A | 계획 2개(수정 이력 계획과 다음 계획으로 만들어진 계획), 할 일 1개를 완료 처리한 실행 기록 1개, 돌아보기 1건 | 계획 10, 할 일 13, 실행 기록 10 |
| B | 계획 1개, 할 일 1개를 완료 처리한 실행 기록 1개 | 계획 11, 할 일 14, 실행 기록 11 |

두 계정은 서로의 자료를 조작해 보는 테스트를 마친 뒤 삭제합니다.

### 확인 다섯 가지: 성공한 요청과 거절된 요청

각 확인마다 **같은 주소, 같은 방식**으로 보낸 요청 두 개를 나란히 적었습니다. 두 요청의 차이는 "달라진 것" 한 가지뿐입니다. 토큰은 `eyJhb…생략`으로 가렸고, 계정 번호(uuid)는 앞부분만 남겼습니다. 시각은 UTC입니다.

#### 확인 1. 로그인 없이 자료 요청

달라진 것: 토큰을 보냈는지 여부뿐 (같은 주소, 같은 방식)

**성공한 요청**
```
GET /rest/v1/plans?select=id
Authorization: Bearer eyJhb…생략
→ HTTP 200  [{"id":10}, 
 {"id":12}]
```

**거절된 요청**
```
GET /rest/v1/plans?select=id
(Authorization 헤더 없음)
→ HTTP 401  {"code":"42501","details":null,"hint":"Grant the required privileges to the current role with: GRANT SELECT ON public.plans TO anon;","message":"permission denied for table plans"}
```

#### 확인 2. 남의 자료 읽기

달라진 것: 요청한 계획이 내 것(A의 계획 10)이냐 남의 것(B의 계획 11)이냐뿐

**성공한 요청**
```
POST /rest/v1/rpc/review_summary
Authorization: Bearer eyJhb…생략
본문: {"p_plan_id":10,"p_from":null,"p_to":null}
→ HTTP 200  [{"plan_count":3,"done_count":1,"overdue_count":0,"blocked_count":0,"estimated_minutes":50,"actual_minutes":30,"diff_minutes":-20}]
```

**거절된 요청**
```
POST /rest/v1/rpc/review_summary
Authorization: Bearer eyJhb…생략
본문: {"p_plan_id":11,"p_from":null,"p_to":null}
→ HTTP 404  {"code":"PT404","details":null,"hint":null,"message":"찾을 수 없습니다."}
```

#### 확인 3. 남의 자료 수정

달라진 것: 고치려는 할 일이 내 것(A의 할 일 21)이냐 남의 것(B의 할 일 14)이냐뿐

**성공한 요청**
```
POST /rest/v1/rpc/update_task
Authorization: Bearer eyJhb…생략
본문: {"p_id":21,"p_title":"A-수정한-할일","p_due_date":null,"p_priority":2,"p_tags":[],"p_estimated_minutes":10}
→ HTTP 200  {"id":21,"plan_id":10,"title":"A-수정한-할일","due_date":null,"priority":2,"tags":[],"estimated_minutes":10,"status":"todo","completed_at":null,"deleted_at":null,"created_at":"2026-10-19T16:23:24.267185+00:00","updated_at":"2026-10-19T…(생략)
```

**거절된 요청**
```
POST /rest/v1/rpc/update_task
Authorization: Bearer eyJhb…생략
본문: {"p_id":14,"p_title":"침입-수정","p_due_date":null,"p_priority":2,"p_tags":[],"p_estimated_minutes":10}
→ HTTP 404  {"code":"PT404","details":null,"hint":null,"message":"찾을 수 없습니다."}
```

#### 확인 4. 남의 자료 삭제

달라진 것: 지우려는 할 일이 내 것(A의 할 일 22)이냐 남의 것(B의 할 일 14)이냐뿐

**성공한 요청**
```
POST /rest/v1/rpc/delete_task
Authorization: Bearer eyJhb…생략
본문: {"p_id":22}
→ HTTP 200  {"id":22,"plan_id":10,"title":"A-삭제할-할일","due_date":null,"priority":2,"tags":[],"estimated_minutes":10,"status":"todo","completed_at":null,"deleted_at":"2026-10-19T16:23:24.732598+00:00","created_at":"2026-10-19T16:23:24.332189+00…(생략)
```

**거절된 요청**
```
POST /rest/v1/rpc/delete_task
Authorization: Bearer eyJhb…생략
본문: {"p_id":14}
→ HTTP 404  {"code":"PT404","details":null,"hint":null,"message":"찾을 수 없습니다."}
```

덧붙임: 표에 직접 DELETE를 보내는 길도 막혀 있습니다.

**거절된 요청(표 직접 삭제)**
```
DELETE /rest/v1/tasks?id=eq.14
Authorization: Bearer eyJhb…생략
→ HTTP 403  {"code":"42501","details":null,"hint":"Grant the required privileges to the current role with: GRANT DELETE ON public.tasks TO authenticated;","message":"permission denied for table tasks"}
```

#### 확인 5. 로그아웃 뒤 옛 토큰

달라진 것: 그 사이에 로그아웃(`POST /auth/v1/logout?scope=global`)을 했는지뿐 (같은 토큰, 같은 주소, 같은 방식)

**성공한 요청**
```
POST /rest/v1/rpc/review_summary
Authorization: Bearer eyJhb…생략
본문: {"p_plan_id":10,"p_from":null,"p_to":null}
→ HTTP 200  [{"plan_count":2,"done_count":1,"overdue_count":0,"blocked_count":0,"estimated_minutes":40,"actual_minutes":30,"diff_minutes":-10}]
```

**거절된 요청**
```
POST /rest/v1/rpc/review_summary
Authorization: Bearer eyJhb…생략
본문: {"p_plan_id":10,"p_from":null,"p_to":null}
→ HTTP 403  {"code":"42501","details":null,"hint":null,"message":"로그인이 끝났습니다. 다시 로그인해 주세요."}
```

#### 거절 앞뒤로 B의 자료

B의 [계획 수, 지우지 않은 할 일 수]: 시험 전 `[1,1]`, 시험 후 `[1,1]` → 같음(B의 자료는 그대로)

## ⑤ AI와 나

**과제 제출 화면의 AI와 내 판단 3줄 칸**에 직접 작성했습니다.

## ⑥ 아직 못 막은 것

아래는 이번 작업에서 **막지 못했거나 확인하지 못한 것**입니다. 위험의 크기를 같이 적었습니다.

| # | 못 막은 것 | 왜 위험한가 | 지금 있는 완화 |
|---|---|---|---|
| 1 | **무차별 대입(비밀번호를 계속 바꿔 가며 시도) 방어를 따로 만들지 않았다.** | 약한 비밀번호를 쓴 계정은 반복 시도로 뚫릴 수 있다. | 로그인 시도 횟수 제한은 Supabase Auth 기본 설정에 맡겼고, 그 제한이 실제로 동작하는지 직접 시험하지 않았다. 가입 화면에서는 비밀번호 8자 이상을 요구하며, 서버 쪽 추가 규칙은 확인하지 않았다. |
| 2 | **이메일 확인 없이 가입된다.** (서버 설정 `mailer_autoconfirm`이 켜져 있음) | 남의 이메일 주소로 계정을 만들 수 있고, 오타 주소로 가입하면 주인이 확인할 방법이 없다. | 계정마다 자료가 분리되어 있어 가입만으로 남의 자료는 못 본다. |
| 3 | **비밀번호 재설정이 없다.** | 비밀번호를 잊으면 복구할 수 없고, 계정 주인임을 확인할 수단이 없다. | 없음 |
| 4 | **두 번째 인증 수단(2차 인증)이 없다.** | 비밀번호가 한 번 유출되면 바로 로그인된다. | 없음 |
| 5 | **로그와 알림이 없다.** 로그인 실패나 접근 거절을 우리가 따로 기록하거나 알리지 않는다. | 누가 계속 시도해도 알아차릴 수 없다. | Supabase 대시보드의 접속 로그만 남는다. |
| 6 | **가입 화면에서 가입 여부가 드러난다.** 이미 가입된 이메일이면 "이미 가입된 이메일입니다"라고 알려 준다. | 어떤 이메일이 가입되어 있는지 알아낼 수 있다. | 로그인 화면은 비밀번호 틀림과 없는 아이디의 문구가 같다. |
| 7 | **토큰이 브라우저 `sessionStorage`에 있다.** | 화면에 악성 스크립트가 실행되는 문제(XSS)가 생기면 토큰을 빼 갈 수 있다. | 사용자 입력은 `textContent`로만 넣고 `innerHTML`을 쓰지 않으며, 외부 스크립트를 불러오지 않는다. 탭을 닫으면 사라진다. |
| 8 | **로그아웃 요청이 서버에 닿지 않으면 서버 세션이 남는다.** (네트워크 오류 등) | 브라우저에서는 지워지지만 서버에서는 토큰이 만료(1시간)될 때까지 유효하다. | 브라우저 값은 항상 지운다. 접근 토큰은 1시간 뒤 만료된다. |
| 9 | **API 오류 응답이 표 이름과 권한 힌트를 보여 준다.** (API를 직접 호출했을 때) | 내부 구조를 조금 알려 준다. | 앱 화면에는 일반 문구만 보인다. 표 이름은 공개 소스에도 있고, 힌트가 접근을 열어 주지는 않는다. |
