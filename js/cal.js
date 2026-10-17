// 달력: 계획 탭(오른쪽)과 할 일 탭이 같이 쓴다. 한 주가 한 줄이고, 날짜 숫자 아래에 막대가 최대 3줄 놓인다.
// 같은 날 막대가 3개를 넘으면 우선순위가 높은(1에 가까운) 것부터 3개만 남기고, 남긴 것은 마감이 빠른 순(위쪽 줄)으로 보여 준다.
// 가려진 것은 그 주 오른쪽 위에 "+N" 으로 알린다.
//
//   const cal = PDS_CAL.create(container, getItems, { noun: "계획", onClick: function (item) {...} });
//   cal.render();   // 목록이 바뀌었거나 화면에 보이게 되었을 때
//
// getItems() 가 돌려주는 항목: { id, title, start("YYYY-MM-DD"), end, priority(1~3), cls(막대 색 클래스), tip(마우스를 올렸을 때 글) }
(function () {
  const el = window.PDS_UTIL.el;
  const dayNumber = window.PDS_UTIL.dayNumber;
  const MAX_LANES = 3;   // 같은 날에 겹쳐 보여 줄 수 있는 막대 수

  function isoFromDay(n) { return new Date(n * 86400000).toISOString().slice(0, 10); }

  function create(container, getItems, opts) {
    const options = opts || {};
    const noun = options.noun || "항목";
    let month = null;   // { y, m(0~11) }

    function render() {
      const today = window.PDS_UTIL.todayKST();
      if (!month) {
        const t = today.split("-");
        month = { y: Number(t[0]), m: Number(t[1]) - 1 };
      }
      container.textContent = "";

      function moveMonth(delta) {
        const d = new Date(Date.UTC(month.y, month.m + delta, 1));
        month = { y: d.getUTCFullYear(), m: d.getUTCMonth() };
        render();
      }
      const prev = el("button", { type: "button", class: "ghost pc-nav", text: "‹", "aria-label": "이전 달" });
      const next = el("button", { type: "button", class: "ghost pc-nav", text: "›", "aria-label": "다음 달" });
      const nowBtn = el("button", { type: "button", class: "ghost pc-now", text: "오늘" });
      prev.addEventListener("click", function () { moveMonth(-1); });
      next.addEventListener("click", function () { moveMonth(1); });
      nowBtn.addEventListener("click", function () { month = null; render(); });
      container.appendChild(el("div", { class: "pc-head" }, [
        prev, el("span", { class: "pc-title", text: month.y + "년 " + (month.m + 1) + "월" }), next, nowBtn
      ]));

      const wd = el("div", { class: "pc-wd" });
      ["일", "월", "화", "수", "목", "금", "토"].forEach(function (w, i) {
        wd.appendChild(el("span", { class: i === 0 ? "sun" : "", text: w }));
      });
      container.appendChild(wd);

      const first = Date.UTC(month.y, month.m, 1) / 86400000;
      const startDay = first - new Date(first * 86400000).getUTCDay();
      const ordered = getItems().slice().sort(function (a, b) {
        if (a.start !== b.start) return a.start < b.start ? -1 : 1;
        return a.id - b.id;
      });

      const weeks = el("div", { class: "pc-weeks" });
      for (let w = 0; w < 6; w++) {
        const ws = startDay + w * 7;
        const week = el("div", { class: "pc-week" });
        for (let i = 0; i < 7; i++) {
          const d = ws + i;
          const dt = new Date(d * 86400000);
          const cls = "pc-day" + (dt.getUTCMonth() !== month.m ? " out" : "") + (isoFromDay(d) === today ? " today" : "");
          week.appendChild(el("div", { class: cls, style: "grid-column:" + (i + 1), text: String(dt.getUTCDate()) }));
        }

        const inWeek = ordered.filter(function (p) {
          return dayNumber(p.end) >= ws && dayNumber(p.start) <= ws + 6;
        }).map(function (p) {
          return { p: p, a: Math.max(dayNumber(p.start), ws) - ws, b: Math.min(dayNumber(p.end), ws + 6) - ws };
        });
        const perDay = [0, 0, 0, 0, 0, 0, 0];
        const shown = [];
        inWeek.slice().sort(function (x, y) {
          if (x.p.priority !== y.p.priority) return x.p.priority - y.p.priority;
          if (x.p.end !== y.p.end) return x.p.end < y.p.end ? -1 : 1;
          if (x.p.start !== y.p.start) return x.p.start < y.p.start ? -1 : 1;
          return x.p.id - y.p.id;
        }).forEach(function (it) {
          for (let d = it.a; d <= it.b; d++) if (perDay[d] >= MAX_LANES) return;
          for (let d = it.a; d <= it.b; d++) perDay[d]++;
          shown.push(it);
        });
        const hidden = inWeek.length - shown.length;

        // 줄 배정: 마감이 빠른 것이 위쪽 줄. 그렇게 해서 3줄에 안 들어가면 시작일 순으로 다시 배정한다.
        function assign(list) {
          const used = [[], [], []];
          const out = [];
          for (let k = 0; k < list.length; k++) {
            const it = list[k];
            let lane = -1;
            for (let l = 0; l < MAX_LANES && lane < 0; l++) {
              let free = true;
              for (let d = it.a; d <= it.b; d++) if (used[l][d]) free = false;
              if (free) lane = l;
            }
            if (lane < 0) return null;
            for (let d = it.a; d <= it.b; d++) used[lane][d] = true;
            out.push({ it: it, lane: lane });
          }
          return out;
        }
        const byEnd = shown.slice().sort(function (x, y) {
          if (x.p.end !== y.p.end) return x.p.end < y.p.end ? -1 : 1;
          return x.p.id - y.p.id;
        });
        const placed = assign(byEnd) || assign(shown.slice().sort(function (x, y) { return x.a - y.a || x.p.id - y.p.id; })) || [];
        placed.forEach(function (pl) {
          const p = pl.it.p;
          const seg = el("button", {
            type: "button", class: "pc-seg " + p.cls, text: p.title, title: p.tip || p.title,
            style: "grid-column:" + (pl.it.a + 1) + " / " + (pl.it.b + 2) + ";grid-row:" + (pl.lane + 2)
          });
          if (options.onClick) seg.addEventListener("click", function () { options.onClick(p); });
          else seg.tabIndex = -1;   // 누르면 이동하는 기능이 없는 달력: 키보드 이동에서도 뺀다
          week.appendChild(seg);
        });
        if (hidden) week.appendChild(el("span", { class: "pc-more", text: "+" + hidden, title: "이 주에 더 있는 " + noun + " " + hidden + "개 (우선순위가 낮은 것)" }));
        weeks.appendChild(week);
      }
      container.appendChild(weeks);
    }

    return { render: render };
  }

  window.PDS_CAL = { create: create };
})();
