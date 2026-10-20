"""5일 측정(supabase/five-day.sql)을 적용한 뒤 한 번 돌리는 서버 확인.

사용: python -X utf8 supabase/five-day-check.py js/config.js
- 공개 API 와 시험 계정 2개만 쓴다. 비밀번호는 무작위로 만들어 어디에도 출력하지 않고, 끝나면 두 계정을 탈퇴시킨다.
- 서버가 시각을 찍으므로 "며칠이 지난 것처럼"은 시험할 수 없다. 여기서는 1일차 안에서 확인할 수 있는 것만 본다:
  고정(한 번만), 소급·미래 기록 제외, 하루 값·합계·평균, 되돌린 기록 제외, 규칙 바꾸기 거절, 남의 자료 차단, 로그인 없는 호출 거절.
- 규칙 바꾸기의 성공 경로(2일차 뒤·3일차 앞)는 실제 3일차에 확인한다.
"""
import json, re, sys, uuid, secrets, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone

cfg = open(sys.argv[1], encoding="utf-8").read()
URL = re.search(r'SUPABASE_URL:\s*"([^"]+)"', cfg).group(1)
KEY = re.search(r'SUPABASE_PUBLISHABLE_KEY:\s*"([^"]+)"', cfg).group(1)

def call(method, path, body=None, token=None, extra=None):
    h = {"apikey": KEY, "Content-Type": "application/json"}
    if token: h["Authorization"] = "Bearer " + token
    if extra: h.update(extra)
    req = urllib.request.Request(URL + path, method=method, headers=h, data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            t = r.read().decode()
            return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try: return e.code, json.loads(t)
        except Exception: return e.code, t

out = []
def check(cid, ok, detail=""):
    out.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + cid + (" | " + detail if detail else ""))

def make():
    em = "pds-five-%s@example.com" % secrets.token_hex(8)
    pw = secrets.token_urlsafe(18)
    s, j = call("POST", "/auth/v1/signup", {"email": em, "password": pw})
    return em, pw, j["access_token"], j
def rpc(fn, body, t): return call("POST", "/rest/v1/rpc/" + fn, body, t)
def iso(dt): return dt.astimezone(timezone.utc).isoformat()

now = datetime.now(timezone.utc)
seoul_now = now + timedelta(hours=9)
if seoul_now.hour < 1 or seoul_now.hour >= 21:
    print("서울 시각이 01시 이전 또는 21시 이후라 날짜 경계 때문에 시험 결과가 흔들립니다. 낮에 다시 돌려 주세요.")
    sys.exit(1)

emA, pwA, tA, jA = make()
emB, pwB, tB, jB = make()
cleanup = [(tA, emA, pwA), (tB, emB, pwB)]
try:
    s, rep = rpc("experiment_report", {}, tA)
    check("시작 전 보고서: experiment 없음, 고정할 기본값 있음", s == 200 and rep["experiment"] is None and rep["defaults"]["unit"] == "분", "HTTP %s" % s)

    s, exp = rpc("start_experiment", {"p_question": "시험 질문?", "p_plan_rule": "규칙A"}, tA)
    check("고정(start_experiment) -> 200, 지표·단위·처리 규칙이 서버 값", s == 200 and exp["unit"] == "분" and exp["metric"] == "daily_abs_gap_minutes"
          and exp["week_start"] == "월요일" and exp["plan_rule_a"] == "규칙A", "HTTP %s" % s)
    s, again = rpc("start_experiment", {"p_question": "다른 질문", "p_plan_rule": "다른 규칙"}, tA)
    check("두 번째 고정은 거절", s >= 400 and "이미 측정을 시작" in json.dumps(again, ensure_ascii=False), "HTTP %s" % s)
    s, b = call("PATCH", "/rest/v1/experiments?id=eq.%d" % exp["id"], {"question": "침입"}, tA)
    check("표에 직접 수정 -> 403", s == 403, "HTTP %s" % s)
    s, b = call("POST", "/rest/v1/experiments", {"question": "x", "plan_rule_a": "x", "metric": "x", "metric_label": "x", "unit": "x",
                "eligibility_rule": "x", "missing_rule": "x", "duplicate_rule": "x", "outlier_rule": "x", "rounding_rule": "x", "week_start": "x"}, tB)
    check("표에 직접 쓰기 -> 403", s == 403, "HTTP %s" % s)

    s, plan = rpc("create_plan", {"p_title": "5일시험", "p_start_date": "2026-10-20", "p_end_date": "2026-10-31", "p_priority": 1,
                                  "p_success_criteria": "x", "p_estimated_minutes": 100}, tA)
    def task(title, est):
        s, t = rpc("create_task", {"p_plan_id": plan["id"], "p_title": title, "p_due_date": None, "p_priority": 2, "p_tags": [], "p_estimated_minutes": est}, tA)
        return t
    t1, t2, t3 = task("오늘-제대로", 20), task("어제-소급", 30), task("미래-미리", 40)
    def done(t, st, en, act):
        return rpc("complete_task", {"p_task_id": t["id"], "p_request_key": str(uuid.uuid4()), "p_started_at": iso(st), "p_ended_at": iso(en),
                                     "p_actual_minutes": act, "p_blocked_reason": None}, tA)
    s1, e1 = done(t1, now - timedelta(minutes=60), now - timedelta(minutes=30), 30)     # 오늘, 이미 끝남 -> 센다 (|30-20| = 10)
    s2, e2 = done(t2, now - timedelta(hours=26), now - timedelta(hours=25), 60)          # 어제 날짜로 입력 -> 안 센다
    s3, e3 = done(t3, now + timedelta(hours=1), now + timedelta(hours=2), 60)            # 아직 안 온 시각 -> 안 센다
    check("완료 기록 3건 저장(소급·미래도 앱은 막지 않는다)", s1 == 200 and s2 == 200 and s3 == 200, "%s %s %s" % (s1, s2, s3))

    s, rep = rpc("experiment_report", {}, tA)
    rows = {r["task_title"]: r for r in rep["rows"]}
    check("오늘 끝낸 기록만 센다(1일차, 차이 10분)", rows["오늘-제대로"]["counted"] and rows["오늘-제대로"]["day_no"] == 1 and rows["오늘-제대로"]["gap"] == 10)
    check("어제 날짜로 입력한 기록은 안 센다(사유 표시)", not rows["어제-소급"]["counted"] and "다름" in (rows["어제-소급"]["reason"] or ""), str(rows["어제-소급"]["reason"]))
    check("아직 안 온 시각의 기록은 안 센다(사유 표시)", not rows["미래-미리"]["counted"] and rows["미래-미리"]["reason"], str(rows["미래-미리"]["reason"]))
    check("하루 값 10분, 합계 10, 평균 10.0, 기록 있는 날 1일", len(rep["days"]) == 1 and rep["days"][0]["value"] == 10
          and rep["summary"]["total"] == 10 and float(rep["summary"]["avg"]) == 10.0 and rep["summary"]["days"] == 1,
          json.dumps(rep["summary"]))
    check("전후 비교: A는 1일 10분, B는 아직 0일(평균 없음)", rep["compare"]["A"]["days"] == 1 and rep["compare"]["A"]["total"] == 10
          and rep["compare"]["B"]["days"] == 0 and rep["compare"]["B"]["avg"] is None)
    check("규칙을 지금 바꿀 수 없음(2일차 전)", rep["can_change"] is False and "2일차" in rep["change_hint"], rep["change_hint"])
    s, b = rpc("change_rule", {"p_rule_after": "규칙B", "p_reason": "이유"}, tA)
    check("change_rule 거절(2일차 전)", s >= 400 and "2일차" in json.dumps(b, ensure_ascii=False), "HTTP %s" % s)

    rpc("reopen_task", {"p_task_id": t1["id"]}, tA)
    s, rep2 = rpc("experiment_report", {}, tA)
    check("되돌린 기록은 빠지고 취소 건수에 잡힌다", rep2["summary"]["days"] == 0 and rep2["canceled_count"] == 1 and rep2["days"] == [],
          "canceled_count=%s" % rep2["canceled_count"])

    # 남의 자료 차단
    s, rb = rpc("experiment_report", {}, tB)
    check("B의 보고서에는 A의 실험이 없다", s == 200 and rb["experiment"] is None)
    s, lst = call("GET", "/rest/v1/experiments?select=*", None, tB)
    check("B가 experiments 표를 읽어도 A의 행이 없다", s == 200 and lst == [], str(lst))
    s, lst = call("GET", "/rest/v1/rule_changes?select=*", None, tB)
    check("B가 rule_changes 표를 읽어도 비어 있다", s == 200 and lst == [])
    s, b = rpc("change_rule", {"p_rule_after": "침입", "p_reason": "침입"}, tB)
    check("B가 규칙 바꾸기 -> 거절(먼저 시작해야 함)", s >= 400 and "먼저 측정을 시작" in json.dumps(b, ensure_ascii=False), "HTTP %s" % s)
    s, mine = call("GET", "/rest/v1/experiments?select=question,user_id", None, tA)
    check("A는 자기 실험만 읽힌다", s == 200 and len(mine) == 1 and mine[0]["question"] == "시험 질문?")
    s, b = call("POST", "/rest/v1/rpc/experiment_report", {}, None)
    check("로그인 없는 보고서 호출 -> 401", s == 401, "HTTP %s" % s)
    s, b = call("GET", "/rest/v1/experiments?select=*", None, None)
    check("로그인 없는 표 읽기 -> 401", s == 401, "HTTP %s" % s)

    # 로그아웃 뒤
    s, _ = call("POST", "/auth/v1/logout?scope=global", {}, tA)
    s2, b2 = rpc("experiment_report", {}, tA)
    s3, b3 = call("GET", "/rest/v1/experiments?select=*", None, tA)
    check("로그아웃 뒤 옛 토큰: 보고서 403, 표 읽기는 빈 목록", s2 == 403 and s3 == 200 and b3 == [], "%s / %s %s" % (s2, s3, b3))
    s, j2 = call("POST", "/auth/v1/token?grant_type=password", {"email": emA, "password": pwA})
    cleanup[0] = (j2["access_token"], emA, pwA)
finally:
    for t, em, pw in cleanup:
        s, _ = call("POST", "/rest/v1/rpc/delete_my_account", {}, t)
        s2, _ = call("POST", "/auth/v1/token?grant_type=password", {"email": em, "password": pw})
        print("정리: 시험 계정 탈퇴 HTTP", s, "/ 탈퇴 뒤 로그인 HTTP", s2, "(204 / 400이면 정상)")
print("\n합계: PASS %d / FAIL %d" % (sum(out), len(out) - sum(out)))
