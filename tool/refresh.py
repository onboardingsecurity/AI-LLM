#!/usr/bin/env python3
"""기록에서 숫자와 문단 후보를 다시 만드는 장치.

- 표준 라이브러리만 쓴다. 네트워크 연결 없음, AI 호출 없음, 키 필요 없음.
- 입력 파일은 읽기만 한다. 쓰기는 --out 으로 지정한 폴더 안에서만 한다.
- 같은 입력이면 같은 결과가 나온다(결과에 시각을 넣지 않는다).
- 동료의 말이나 이름은 결과에 옮기지 않고, 개수만 센다.
"""
import argparse
import datetime as dt
import hashlib
import html
import json
import re
import sys
from pathlib import Path

SRC_ATT = "내 출석 기록"
SRC_RIT = "리추얼 기록"
SRC_SUB = "내 제출 현황"
ABILITIES = ("자기조절력", "자기동기력", "대인관계력")


class InputError(Exception):
    pass


# ---------------------------------------------------------------- 읽기
def load_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise InputError(f"{path} 를 읽을 수 없습니다: {e}")


def values(lines, label):
    """'라벨: 값' 줄 중 라벨이 같은 것의 값 목록."""
    out = []
    for s in lines:
        k, sep, v = s.partition(":")
        if sep and k.strip() == label:
            out.append(v.strip())
    return out


def values_re(lines, pattern):
    rx = re.compile(pattern)
    out = []
    for s in lines:
        k, sep, v = s.partition(":")
        if sep and rx.fullmatch(k.strip()):
            out.append(v.strip())
    return out


def not_blank(v):
    return re.search(r"[0-9A-Za-z가-힣]", v) is not None


def status_of(v):
    if v.startswith("일부"):
        return "partial"
    if "못" in v:
        return "no"
    if v.startswith("실천"):
        return "full"
    raise InputError("알 수 없는 '강점 행동' 값입니다(내용은 출력하지 않음)")


def parse_history(data):
    if not isinstance(data, dict) or not isinstance(data.get("days"), list):
        raise InputError("리추얼 기록에 days 목록이 없습니다")
    days = []
    for d in data["days"]:
        try:
            date = dt.date.fromisoformat(d["date"])
            op, cl = list(d["open"]), list(d["close"])
        except (KeyError, TypeError, ValueError):
            raise InputError("days 항목은 date, open, close 를 가져야 합니다")
        st = values(cl, "강점 행동")
        if len(st) != 1:
            raise InputError(f"{date} 에 '강점 행동'이 정확히 한 줄이어야 합니다")
        br = values(op, "호흡")
        m = re.search(r"\d+(?:\.\d+)?", br[0]) if br else None
        days.append({
            "date": date,
            "status": status_of(st[0]),
            "breath": float(m.group()) if m else 0.0,
            "got": sum(not_blank(v) for v in values_re(op, r"동료 \d+가 말해 준 내 장점")),
            "gave": sum(not_blank(v) for v in values_re(op, r"동료 \d+에게 말한 장점")),
        })
    days.sort(key=lambda x: x["date"])
    if not days:
        raise InputError("기록이 비어 있습니다")
    if len({x["date"] for x in days}) != len(days):
        raise InputError("같은 날짜가 두 번 있습니다")
    return days


def parse_manual(m):
    try:
        att = m["attendance"]
        sub = m["submissions"]
        entries = [(str(e["task"]), dt.date.fromisoformat(e["date"])) for e in sub["entries"]]
        return {
            "att_days": int(att["attended_days"]),
            "absent": int(att["absent_days"]),
            "as_of": dt.date.fromisoformat(att["as_of"]),
            "entries": sorted(entries, key=lambda e: (e[1], e[0])),
            "all_confirmed": bool(sub.get("all_final_confirmed", False)),
        }
    except (KeyError, TypeError, ValueError):
        raise InputError("manual 파일 형식이 맞지 않습니다(README의 예시 참고)")


# ---------------------------------------------------------------- 계산
def kdate(d):
    return f"{d.year}년 {d.month}월 {d.day}일"


def iso(d):
    return d.isoformat()


def weekdays_between(a, b):
    n, d = [], a
    while d <= b:
        if d.weekday() < 5:
            n.append(d)
        d += dt.timedelta(days=1)
    return n


def longest_run(flags):
    """flags: 참/거짓 목록. 가장 긴 참의 구간 (길이, 시작 위치)."""
    best = (0, 0)
    cur = 0
    for i, f in enumerate(flags):
        cur = cur + 1 if f else 0
        if cur > best[0]:
            best = (cur, i - cur + 1)
    return best


def compute(days, man):
    first, last = days[0]["date"], days[-1]["date"]
    have = {x["date"] for x in days}
    wd = weekdays_between(first, last)
    missing = [d for d in wd if d not in have]
    weekend = [d for d in have if d.weekday() >= 5]

    wk = lambda d: d.isocalendar()[:2]
    covered = {wk(x["date"]) for x in days}
    span, d = set(), first
    while d <= last:
        span.add(wk(d))
        d += dt.timedelta(days=1)
    wnums = sorted(w for _, w in covered)

    n, i0 = longest_run([d in have for d in wd])
    streak = (n, wd[i0], wd[i0 + n - 1]) if n else (0, None, None)

    stat = [x["status"] for x in days]
    fn, fi = longest_run([s == "full" for s in stat])
    full_run = (fn, days[fi]["date"], days[fi + fn - 1]["date"]) if fn else (0, None, None)

    less = [i for i, s in enumerate(stat) if s != "full"]
    comparable = [i for i in less if i + 1 < len(days)]
    recovered = [i for i in comparable if stat[i + 1] == "full"]

    ents = man["entries"]
    distinct = sorted({t for t, _ in ents})
    return {
        "first": first, "last": last, "recorded": len(days),
        "weekday_total": len(wd), "weekday_recorded": len(wd) - len(missing),
        "missing": missing, "weekend_records": len(weekend),
        "weeks_cov": len(covered & span), "weeks_span": len(span),
        "week_from": wnums[0], "week_to": wnums[-1],
        "streak": streak, "full_run": full_run,
        "full": stat.count("full"), "partial": stat.count("partial"), "no": stat.count("no"),
        "less": len(less), "comparable": len(comparable), "recovered": len(recovered),
        "last_has_no_next": len(less) - len(comparable),
        "breath_total": round(sum(x["breath"] for x in days), 1),
        "breath_days": sum(1 for x in days if x["breath"] > 0),
        "got": sum(x["got"] for x in days), "gave": sum(x["gave"] for x in days),
        "att_days": man["att_days"], "absent": man["absent"], "as_of": man["as_of"],
        "sub_total": len(ents), "sub_distinct": len(distinct),
        "sub_resub": len(ents) - len(distinct), "sub_first": ents[0][1] if ents else None,
        "sub_last": ents[-1][1] if ents else None, "all_confirmed": man["all_confirmed"],
        "entries": ents,
    }


def build_numbers(c):
    rng = f"{iso(c['first'])}~{iso(c['last'])}"
    miss = ", ".join(d.strftime("%m-%d") for d in c["missing"]) or "없음"
    s_n, s_a, s_b = c["streak"]
    f_n, f_a, f_b = c["full_run"]
    nums = [
        dict(id="attendance", group="출석", value=f"{c['att_days']}일",
             label=f"출석 일수 (결석 {c['absent']}일)",
             detail=f"개강일 {iso(c['first'])}부터 {iso(c['as_of'])} 화면 기준", source=SRC_ATT),
        dict(id="ritual_days", group="꾸준함", value=f"{c['recorded']}일",
             label="리추얼 기록을 남긴 날", detail=rng, source=SRC_RIT),
        dict(id="weekday_cov", group="꾸준함",
             value=f"평일 {c['weekday_total']}일 중 {c['weekday_recorded']}일",
             label="평일 기록", detail=f"기록이 없는 평일: {miss}", source=SRC_RIT),
        dict(id="weeks", group="꾸준함", value=f"{c['weeks_span']}주 중 {c['weeks_cov']}주",
             label="매주 하루 이상 기록",
             detail=f"ISO {c['week_from']}~{c['week_to']}주차", source=SRC_RIT),
        dict(id="streak", group="꾸준함", value=f"{s_n}일 연속",
             label="평일에 빠짐없이 기록한 가장 긴 구간",
             detail=f"{iso(s_a)}~{iso(s_b)}" if s_n else "-", source=SRC_RIT),
        dict(id="full_run", group="다시 일어나기", value=f"{f_n}일 연속",
             label="강점 행동을 '실천했다'로 기록한 가장 긴 구간(기록일 기준)",
             detail=f"{iso(f_a)}~{iso(f_b)}" if f_n else "-", source=SRC_RIT),
        dict(id="actions", group="다시 일어나기",
             value=f"실천 {c['full']}일 · 일부 {c['partial']}일 · 못 함 {c['no']}일",
             label=f"강점 행동 기록 {c['recorded']}일의 내역(스스로 매긴 평가)",
             detail=rng, source=SRC_RIT),
        dict(id="recovery", group="다시 일어나기", value=f"{c['less']}일 중 {c['recovered']}일",
             label=(f"덜 실천한 날 {c['less']}일 중 {c['recovered']}일은 "
                    "바로 다음 기록일에 다시 실천"),
             detail=(f"덜 실천한 날 = 일부 실천 + 못 함. 다음 기록일이 있는 {c['comparable']}일 중 "
                     f"{c['recovered']}일. 마지막 기록일은 다음 기록일이 없어 비교하지 않음"
                     if c["last_has_no_next"] else
                     f"덜 실천한 날 = 일부 실천 + 못 함. {c['comparable']}일 중 {c['recovered']}일"),
             source=SRC_RIT),
        dict(id="breath", group="다시 일어나기", value=f"{c['breath_total']:g}분",
             label="호흡 기록 합계", detail=f"{c['breath_days']}일, {rng}", source=SRC_RIT),
        dict(id="gave", group="사람", value=f"{c['gave']}건", label="동료에게 말해 준 장점(빈 칸 제외)",
             detail=rng, source=SRC_RIT),
        dict(id="got", group="사람", value=f"{c['got']}건", label="동료가 말해 준 내 장점(빈 칸 제외)",
             detail=rng, source=SRC_RIT),
        dict(id="submits", group="과제", value=f"{c['sub_total']}건", label="과제 제출 건수",
             detail=(f"서로 다른 과제 {c['sub_distinct']}개, 고쳐서 다시 낸 {c['sub_resub']}건 포함"
                     + (", 모두 최종 확인 완료" if c["all_confirmed"] else "")),
             source=SRC_SUB),
    ]
    return nums


def build_candidates(c):
    """능력별 문단 후보. 날짜와 근거를 붙인다. 문장 속 숫자는 모두 위 계산값이다."""
    rng = f"{iso(c['first'])}~{iso(c['last'])}"
    s_n, s_a, s_b = c["streak"]
    f_n, f_a, f_b = c["full_run"]
    cand = [
        ("reg-recover", "자기조절력",
         f"덜 실천한 날 {c['less']}일 가운데 {c['recovered']}일은 바로 다음 기록일에 다시 실천했습니다.",
         f"{rng}, {SRC_RIT}의 '강점 행동' 줄"),
        ("reg-breath", "자기조절력",
         f"{kdate(c['first'])}부터 {kdate(c['last'])}까지 호흡을 {c['breath_days']}일 기록했고 합계는 {c['breath_total']:g}분입니다.",
         f"{rng}, {SRC_RIT}의 '호흡' 줄"),
        ("mot-streak", "자기동기력",
         f"{kdate(s_a)}부터 {kdate(s_b)}까지 평일 {s_n}일을 하루도 빠짐없이 기록했습니다." if s_n else "",
         f"{iso(s_a)}~{iso(s_b)}, {SRC_RIT}의 날짜" if s_n else ""),
        ("mot-full", "자기동기력",
         f"강점 행동을 '실천했다'로 기록한 날이 {f_n}일 이어진 적이 있습니다." if f_n else "",
         f"{iso(f_a)}~{iso(f_b)}, {SRC_RIT}의 '강점 행동' 줄" if f_n else ""),
        ("mot-attend", "자기동기력",
         f"{kdate(c['first'])} 개강일부터 {kdate(c['as_of'])} 기준으로 출석은 {c['att_days']}일, 결석은 {c['absent']}일입니다.",
         f"{iso(c['first'])}~{iso(c['as_of'])}, {SRC_ATT}"),
        ("mot-submit", "자기동기력",
         f"{kdate(c['sub_first'])}부터 {kdate(c['sub_last'])}까지 과제를 {c['sub_total']}건 제출했고 그중 {c['sub_resub']}건은 고쳐서 다시 냈습니다.",
         f"{iso(c['sub_first'])}~{iso(c['sub_last'])}, {SRC_SUB}"),
        ("rel-gave", "대인관계력",
         f"{kdate(c['first'])}부터 {kdate(c['last'])}까지 동료에게 장점을 {c['gave']}건 말해 주었습니다.",
         f"{rng}, {SRC_RIT}의 '동료에게 말한 장점' 줄(빈 칸 제외)"),
        ("rel-got", "대인관계력",
         f"{kdate(c['first'])}부터 {kdate(c['last'])}까지 동료가 말해 준 제 장점이 {c['got']}건 기록되었습니다.",
         f"{rng}, {SRC_RIT}의 '동료가 말해 준 내 장점' 줄(빈 칸 제외)"),
    ]
    out = []
    for cid, ab, text, ev in cand:
        if text:
            out.append(dict(id=cid, ability=ab, text=text, evidence=ev,
                            sha=hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]))
    return out


def approval_status(cands, approved):
    """승인 파일의 {id, sha} 와 후보를 맞춰 본다. 문장이 바뀌면 다시 승인받아야 한다."""
    ok = {a.get("id"): a.get("sha") for a in approved}
    for c in cands:
        if c["id"] not in ok:
            c["status"] = "미승인"
        elif ok[c["id"]] == c["sha"]:
            c["status"] = "승인됨"
        else:
            c["status"] = "승인 후 문장이 바뀜(다시 승인 필요)"
    return cands


# ---------------------------------------------------------------- 쓰기
# 사이트에는 스크립트·인라인 스타일·외부 리소스가 없으므로 같은 출처의 CSS와 그림만 허용한다.
CSP = "default-src 'none'; font-src 'self'; img-src 'self'; style-src 'self'; base-uri 'none'; form-action 'none'"
NAV = (("index.html", "처음"), ("story.html", "이야기"),
       ("numbers.html", "숫자"), ("works.html", "대표작"))


def page(title, current, body):
    cur = ' aria-current="page"'
    nav = " ".join(
        f'<a href="{h}"{cur if h == current else ""}>{html.escape(t)}</a>' for h, t in NAV)
    return (
        '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f'<meta http-equiv="Content-Security-Policy" content="{CSP}">\n'
        '<meta name="referrer" content="no-referrer">\n'
        f"<title>{html.escape(title)}</title>\n"
        '<link rel="stylesheet" href="style.css">\n</head>\n<body>\n'
        f'<header><nav aria-label="사이트 메뉴">{nav}</nav></header>\n'
        f"<main>\n{body}</main>\n"
        "<footer><p>이 페이지의 숫자와 이야기는 장치(tool/refresh.py)가 승인된 문장과 기록에서 다시 만듭니다.</p></footer>\n"
        "</body>\n</html>\n")


def story_page(story, nums):
    by_id = {n["id"]: n for n in nums}
    parts = ["<h1>내 이야기</h1>\n"]
    stage = None
    for b in story["blocks"]:
        text = html.escape(b["text"])
        if b["kind"] == "first":
            parts.append(f'<p class="lead">{text}</p>\n')
            continue
        if b["kind"] == "last":
            parts.append(f'<p class="closing">{text}</p>\n')
            continue
        if b.get("stage") and b["stage"] != stage:
            stage = b["stage"]
            parts.append(f'<h2>{html.escape(stage)}</h2>\n')
        parts.append(f"<p>{text}</p>\n")
        tags = "".join(f'<span class="tag">{html.escape(a)}</span>' for a in b.get("abilities", []))
        if tags:
            parts.append(f'<p class="tags" aria-label="이 대목에서 드러나는 능력">{tags}</p>\n')
        if b.get("pair"):
            n = by_id.get(b["pair"])
            if not n:
                raise InputError(f"짝으로 지정한 숫자 {b['pair']} 가 없습니다")
            parts.append(
                '<aside class="pair"><p class="pair-head">이 시기 옆에 놓는 숫자</p>'
                f'<p class="pair-main">{html.escape(n["label"])}</p>'
                f'<p class="src">출처: {html.escape(n["source"])} · {html.escape(n["detail"])}</p></aside>\n')
    return page("내 이야기", "story.html", "".join(parts))


def numbers_page(nums, cands, c):
    rows = []
    group = None
    for n in nums:
        if n["group"] != group:
            group = n["group"]
            rows.append(f'<tr class="grp"><th colspan="3" scope="colgroup">{html.escape(group)}</th></tr>\n')
        rows.append(
            f'<tr><td class="val">{html.escape(n["value"])}</td>'
            f'<td>{html.escape(n["label"])}<br><span class="sub">{html.escape(n["detail"])}</span></td>'
            f'<td class="src">{html.escape(n["source"])}</td></tr>\n')
    subs = "".join(
        f"<tr><td>{html.escape(t)}</td><td>{iso(d)}</td></tr>\n" for t, d in c["entries"])
    body = [
        "<h1>숫자</h1>\n",
        f"<p>모두 원본 기록을 세어 옮긴 값입니다. 기록 기간은 {iso(c['first'])}~{iso(c['last'])}입니다.</p>\n",
        '<table class="nums">\n<thead><tr><th scope="col">숫자</th><th scope="col">무엇을 센 값인가</th>'
        '<th scope="col">출처</th></tr></thead>\n<tbody>\n' + "".join(rows)
        + "</tbody>\n</table>\n",
    ]
    for ab in ABILITIES:
        ok = [x for x in cands if x["ability"] == ab and x["status"] == "승인됨"]
        if ok:
            body.append(f"<h2>{html.escape(ab)}</h2>\n<ul>\n")
            for x in ok:
                body.append(f'<li>{html.escape(x["text"])} <span class="sub">({html.escape(x["evidence"])})</span></li>\n')
            body.append("</ul>\n")
    body.append('<h2>제출 목록</h2>\n<p class="sub">출처: ' + SRC_SUB + "</p>\n"
                '<table class="nums">\n<thead><tr><th scope="col">과제</th><th scope="col">제출일</th></tr></thead>\n<tbody>\n'
                + subs + "</tbody>\n</table>\n")
    return page("숫자", "numbers.html", "".join(body))


def candidates_md(cands, c, chars):
    L = ["# 문단 후보 (장치가 만든 파일)", "",
         f"- 기록 기간: {iso(c['first'])}~{iso(c['last'])}",
         "- 사이트에는 상태가 '승인됨'인 문장만 들어갑니다.",
         "- 승인하려면 `approved/candidates.json`에 `{\"id\": \"...\", \"sha\": \"...\"}`를 추가하고 다시 실행합니다.",
         "- 기록이 늘어 문장이 바뀌면 sha 가 달라져 다시 승인해야 합니다.", ""]
    for ab in ABILITIES:
        L += [f"## {ab}", ""]
        for x in (y for y in cands if y["ability"] == ab):
            L += [f"- **{x['id']}** [{x['status']}] sha `{x['sha']}`",
                  f"  - 문장: {x['text']}", f"  - 근거: {x['evidence']}"]
        L.append("")
    L += [f"본편 글자 수(공백 포함): {chars}", ""]
    return "\n".join(L)


def generate(history_path, manual_path, approved_dir):
    """결과 파일을 {상대경로: 바이트}로 돌려준다. 디스크에는 쓰지 않는다."""
    days = parse_history(load_json(history_path))
    man = parse_manual(load_json(manual_path))
    story = load_json(Path(approved_dir) / "story.json")
    approved = load_json(Path(approved_dir) / "candidates.json")
    c = compute(days, man)
    nums = build_numbers(c)
    cands = approval_status(build_candidates(c), approved)
    chars = sum(len(b["text"]) for b in story["blocks"])
    summary = {
        "period": [iso(c["first"]), iso(c["last"])],
        "story_chars_with_spaces": chars,
        "numbers": [{k: n[k] for k in ("id", "value", "label", "detail", "source")} for n in nums],
        "candidates": [{k: x[k] for k in ("id", "ability", "text", "evidence", "sha", "status")} for x in cands],
    }
    files = {
        "site/story.html": story_page(story, nums),
        "site/numbers.html": numbers_page(nums, cands, c),
        "numbers.json": json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        "candidates.md": candidates_md(cands, c, chars),
    }
    return {k: v.encode("utf-8") for k, v in files.items()}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--history", required=True, help="리추얼 기록 JSON")
    ap.add_argument("--manual", required=True, help="출석·제출 현황을 옮겨 적은 JSON")
    ap.add_argument("--approved", default=str(Path(__file__).parent / "approved"),
                    help="승인된 문장 폴더(story.json, candidates.json)")
    ap.add_argument("--out", required=True, help="결과를 쓸 폴더")
    ap.add_argument("--twice", action="store_true", help="두 번 만들어 결과가 같은지 compare.txt 에 적기")
    a = ap.parse_args(argv)
    try:
        files = generate(a.history, a.manual, a.approved)
        out = Path(a.out).resolve()
        inputs = {Path(p).resolve() for p in (a.history, a.manual)}
        for rel in files:
            if (out / rel).resolve() in inputs:
                raise InputError("결과 파일이 입력 파일과 겹칩니다")
        if a.twice:
            again = generate(a.history, a.manual, a.approved)
            same = files == again
            lines = [f"{'같음' if again[k] == v else '다름'}  {hashlib.sha256(v).hexdigest()[:16]}  {k}"
                     for k, v in sorted(files.items())]
            files["compare.txt"] = (
                f"같은 입력으로 두 번 만든 결과 비교: {'모두 같음' if same else '다른 파일이 있음'}\n"
                + "\n".join(lines) + "\n").encode("utf-8")
        for rel, data in files.items():
            p = out / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(data)
    except InputError as e:
        print(f"오류: {e}", file=sys.stderr)
        return 2
    print(f"{len(files)}개 파일을 {out} 에 썼습니다.")
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except AttributeError:
        pass
    sys.exit(main())
