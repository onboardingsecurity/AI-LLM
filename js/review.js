// 돌아보기 화면 (카드 4). 숫자는 DB 함수에서 오고, 숫자를 누르면 같은 함수가 그 숫자의 근거 목록을 준다.
(function () {
  const api = window.PDS_API;
  const el = window.PDS_UTIL.el;
  const formatSeoul = window.PDS_UTIL.formatSeoul;
  const notify = window.PDS_UTIL.notify;
  const warn = window.PDS_UTIL.warn;
  const PRIORITY_LABEL = window.PDS_UTIL.PRIORITY_LABEL;

  const $ = function (id) { return document.getElementById(id); };
  const planSelect = $("r-plan");
  const statsEl = $("r-stats");
  const statusEl = $("r-status");
  const detailList = $("r-detail");
  const artsEl = $("r-arts");   // 집계를 고르지 않았을 때 보이는 그림 4장(계획 탭의 그림과 같다)
  const emptyEl = $("r-empty");   // 고른 집계에 해당하는 할 일이 없을 때 보이는 그림

  // 숫자 카드 정의. metric 은 DB 함수 review_tasks 에 넘기는 값이다.
  const STATS = {
    plan_count: { key: "plan_count", label: "계획 수", metric: "all", empty: "할 일이 없습니다." },
    done_count: { key: "done_count", label: "완료 수", metric: "done", empty: "완료한 일이 없습니다." },
    overdue_count: { key: "overdue_count", label: "지연 수", metric: "overdue", empty: "지연된 일이 없습니다." },
    blocked_count: { key: "blocked_count", label: "막힘 수", metric: "blocked", empty: "막힌 일이 없습니다." }
  };
  // 시간 집계(예상·실제·차이)는 별도 블록 없이 "계획 수" 블록 안에 함께 보인다. 셋 다 그 계획의 할 일 전체를 합한 값이라 근거 목록은 계획 수와 같다.
  const TIME_ROWS = [
    { key: "estimated_minutes", label: "예상 시간" },
    { key: "actual_minutes", label: "실제 시간" },
    { key: "diff_minutes", label: "차이" }
  ];

  // 제목 옆 안내(" - 계획 전체 기준입니다."): 비어 있으면 숨겨서 "-" 만 남지 않게 한다.
  function setStatus(msg) { statusEl.textContent = msg; statusEl.hidden = !msg; }

  let plans = [];
  let planId = null;
  let selectedKey = null;
  let summary = null;
  let seq = 0;

  function signed(n) { return (n > 0 ? "+" : "") + n; }

  // ---------- 집계 ----------

  function syncArts() { artsEl.hidden = selectedKey !== null; }

  async function loadSummary() {
    const my = ++seq;
    if (planId === null) {   // 계획이 없으면 모든 숫자가 0인 블록을 그대로 보여 준다
      summary = { plan_count: 0, done_count: 0, overdue_count: 0, blocked_count: 0, estimated_minutes: 0, actual_minutes: 0, diff_minutes: 0 };
      renderStats();
      clearDetail();
      setStatus("먼저 계획을 하나 세워 주세요.");
      return;
    }
    setStatus("불러오는 중…");
    try {
      const s = await api.reviewSummary(planId);
      if (my !== seq) return;
      summary = s;
      setStatus("");
      renderStats();
      if (selectedKey) await showDetail(selectedKey);
      else clearDetail();
    } catch (e) {
      if (my === seq) setStatus(e.message);
    }
  }

  // 집계 숫자 글자: 개수는 "5개", 시간은 "99분", 차이는 부호를 붙여 "+30분"
  function statText(st) { return summary[st.key] + "개"; }
  function minutesText(key) { return (key === "diff_minutes" ? signed(summary[key]) : String(summary[key])) + "분"; }

  // 집계 4개를 테트리스 블록(ㅣ ㄴ ㅁ ㄱ)으로 맞물려 집계 창(4칸 × 4줄 = 16칸)을 가득 채운다. 가운데 ㅁ 블록이 가장 크고 "계획 수"와 시간 줄이 들어간다.
  // cells 는 [줄, 칸](0부터), at 은 글자의 가운데 자리(칸 단위, [위에서, 왼쪽에서]), w 는 글자 폭(칸 수, 없으면 글자만큼).
  // color 는 우선순위·상태 색과 같은 진한 색(완료=초록, 지연=빨강, 계획 수=파랑, 막힘=노랑), text 는 그 위에 읽히는 글자 색.
  //   0 0 0 0     0 완료 수 (ㅣ)     1 지연 수 (ㄴ)
  //   1 2 2 3     2 계획 수 (ㅁ)     3 막힘 수 (ㄱ 모양을 뒤집은 것)
  //   1 2 2 3
  //   1 1 3 3
  const PIECES = [
    { key: "done_count", cells: [[0, 0], [0, 1], [0, 2], [0, 3]], at: [0.5, 2], color: "var(--st-done)", text: "#fff" },
    { key: "overdue_count", cells: [[1, 0], [2, 0], [3, 0], [3, 1]], at: [2.5, 0.5], color: "var(--pri-1)", text: "#fff" },
    { key: "plan_count", cells: [[1, 1], [1, 2], [2, 1], [2, 2]], at: [2, 2], w: 2, color: "var(--pri-3)", text: "var(--pixel-ink)" },
    { key: "blocked_count", cells: [[1, 3], [2, 3], [3, 3], [3, 2]], at: [2.5, 3.5], color: "var(--pri-2)", text: "var(--pixel-ink)" }
  ];

  function renderStats() {
    statsEl.textContent = "";
    PIECES.forEach(function (piece) {
      const st = STATS[piece.key];
      const on = selectedKey === st.key;
      const cellSet = new Set(piece.cells.map(function (x) { return x[0] + "," + x[1]; }));
      const has = function (r, c) { return cellSet.has(r + "," + c); };
      const li = el("li", { class: "stat-piece", style: "--pc:" + piece.color + ";--tc:" + piece.text });
      piece.cells.forEach(function (rc) {
        const r = rc[0];
        const c = rc[1];
        // 같은 블록의 이웃 칸이 없는 쪽에만 테두리와 바깥 간격을 둔다(그래서 블록 바깥 윤곽만 그려진다).
        const sides = (has(r - 1, c) ? "" : " bt") + (has(r, c + 1) ? "" : " br") + (has(r + 1, c) ? "" : " bb") + (has(r, c - 1) ? "" : " bl");
        const cell = el("span", { class: "stat-cell" + sides, style: "grid-area:" + (r + 1) + "/" + (c + 1), "aria-hidden": "true" });
        // 안쪽으로 꺾이는 모서리(양옆 이웃은 같은 블록인데 대각선 칸만 다른 블록)는 두 테두리가 이어지도록 모서리 조각을 얹는다.
        // 그 칸의 바탕이 모서리의 간격 자리를 덮지 않도록 칸에 ck-* 클래스도 붙인다(칸 하나에 이런 모서리는 하나뿐이다).
        [["tl", -1, -1], ["tr", -1, 1], ["bl", 1, -1], ["br", 1, 1]].forEach(function (k) {
          if (has(r + k[1], c) && has(r, c + k[2]) && !has(r + k[1], c + k[2])) {
            cell.appendChild(el("span", { class: "stat-corner k-" + k[0] }));
            cell.classList.add("ck-" + k[0]);
          }
        });
        li.appendChild(cell);
      });
      const parts = [
        el("span", { class: "stat-lbl", text: st.label }),
        el("span", { class: "stat-num", text: statText(st) })
      ];
      if (st.key === "plan_count") {   // 이 블록 안에 예상 시간·실제 시간·차이를 함께 보인다
        parts.push(el("span", { class: "stat-subs" }, TIME_ROWS.map(function (t) {
          return el("span", { class: "stat-sub" }, [el("span", { text: t.label }), el("b", { text: minutesText(t.key) })]);
        })));
      }
      const width = piece.w ? "width:calc(" + (piece.w * 25) + "% - 24px);" : "";
      const btn = el("button", {
        type: "button", class: "stat-text", "aria-pressed": String(on),
        style: "top:" + (piece.at[0] * 25) + "%;left:" + (piece.at[1] * 25) + "%;" + width
      }, parts);
      li.appendChild(btn);
      li.addEventListener("click", function () {   // 블록의 어느 칸(글자 포함)을 눌러도 같다. 누를 때마다 보였다 안 보였다(켬/끔)를 하며, 켜진 표시는 따로 없다.
        li.classList.remove("press");
        void li.offsetWidth;   // 같은 블록을 연달아 눌러도 눌림 모션이 매번 다시 재생되게
        li.classList.add("press");
        if (selectedKey === st.key) clearDetail();
        else selectedKey = st.key;
        statsEl.querySelectorAll(".stat-text").forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn && selectedKey === st.key)); });   // 보이지 않는 켬/끔 상태(보조기기용)
        if (selectedKey) showDetail(st.key);
      });
      li.addEventListener("animationend", function () { li.classList.remove("press"); });
      statsEl.appendChild(li);
    });
  }

  // ---------- 숫자의 근거 ----------

  function addFact(dl, k, v) {
    dl.appendChild(el("dt", { text: k }));
    dl.appendChild(el("dd", { text: v }));
  }

  let detailSeq = 0;   // 근거 목록을 불러오는 도중에 껐거나 다른 집계를 눌렀으면 늦게 온 결과는 버린다

  // 고른 집계를 끈다: 근거 목록·그림·제목 옆 표시를 모두 지운다.
  function clearDetail() {
    selectedKey = null;
    detailSeq++;
    detailList.textContent = "";
    emptyEl.hidden = true;
    setStatus("");
    syncArts();
  }

  async function showDetail(key) {
    const my = ++detailSeq;
    const st = STATS[key];
    detailList.textContent = "";
    emptyEl.hidden = true;
    syncArts();
    // 제목 옆에 고른 집계 종류와 숫자(할 일 리스트의 개수 표시처럼). 해당하는 할 일이 하나도 없으면 숫자 대신 안내 문구.
    setStatus(summary[key] === 0 ? st.empty : st.label + " " + statText(st));
    try {
      const tasks = planId === null ? [] : await api.reviewTasks(planId, st.metric);
      const execs = await api.listActiveExecutions(tasks.map(function (t) { return t.id; }));
      if (my !== detailSeq) return;
      const byTask = {};
      execs.forEach(function (e) { byTask[e.task_id] = e; });

      const today = window.PDS_UTIL.todayKST();
      tasks.forEach(function (t) {
        detailList.appendChild(renderRow(t, byTask[t.id], today));
      });
      emptyEl.hidden = tasks.length > 0;   // 없으면 글자 대신 그림
    } catch (e) {
      setStatus(e.message);
    }
  }

  // 할 일 탭의 리스트와 같은 모양: 네모칸(완료 = 초록 체크, 진행 중 = 우선순위 색, 마감 지남 = 회색 ✕), 마감일 + D-day, 이름 + 상태, 구분선.
  // 근거 자료라서 상세(데이터와 실행 기록)는 처음부터 펼쳐 둔다.
  function renderRow(task, exec, today) {
    const done = task.status === "done";
    const dl = el("dl", { class: "facts" });
    addFact(dl, "우선순위", PRIORITY_LABEL[task.priority]);
    addFact(dl, "시간", task.estimated_minutes + "분 → " + (exec ? exec.actual_minutes + "분" : "기록 없음"));   // 예상 시간 → 실제 시간
    addFact(dl, "태그", task.tags && task.tags.length ? task.tags.join(", ") : "없음");   // 할 일 탭의 상세와 같은 표기
    if (exec) {
      addFact(dl, "기간", formatSeoul(exec.started_at) + " ~ " + formatSeoul(exec.ended_at));
      addFact(dl, "막혔던 이유", exec.blocked_reason ? exec.blocked_reason : "없음");
    }
    const head = window.PDS_UTIL.taskRowHead(task, today);
    return el("li", { class: head.cls }, [
      head.dot,
      head.date,
      el("h3", {}, [
        el("span", { class: "pl-name static", text: task.title }),
        el("span", { class: done ? "badge done" : "badge", text: done ? "완료" : "진행 중" })
      ]),
      el("div", { class: "pl-panel" }, [dl])
    ]);
  }

  // ---------- 고칠 점을 다음 계획으로 ----------

  const hForm = $("handover-form");
  const hError = $("h-error");
  const hDialog = $("h-dialog");
  const hSubmit = $("h-submit");

  function showHError(msg) { hError.textContent = msg || ""; hError.hidden = !msg; }

  // 기본값: 다음 계획의 시작일·종료일은 오늘(서울), 예상 시간은 0분
  function handoverDefaults() {
    $("h-start").value = window.PDS_UTIL.todayKST();
    $("h-end").value = $("h-start").value;
    $("h-minutes").value = "0";
  }
  handoverDefaults();
  window.PDS_UTIL.keepEndAfterStart($("h-start"), $("h-end"));

  // 계획 만들기처럼 열 때마다 빈 입력 창에 기본값(우선순위 중간, 시작일·종료일 오늘, 예상 시간 0분)을 채운다.
  function resetHandoverForm() {
    hForm.reset();
    $("h-priority").value = "2";
    handoverDefaults();
  }

  // 다음 계획 이름도 계획 이름 길이 규칙(5자 단위, 목록에서 한 줄로 보이는 길이)을 따른다. 계획 탭에서 잰 값을 쓴다.
  function nameLimit() {
    const n = window.PDS_PLAN_NAME.cached();
    $("h-title-in").maxLength = n;
    $("h-title-in").placeholder = window.PDS_PLAN_NAME.placeholder(n);
    return n;
  }

  // 계획 번호 대신 이름으로 보여 준다(목록에 아직 없으면 번호로).
  function titleOf(id) {
    const p = plans.filter(function (x) { return x.id === id; })[0];
    return p ? p.title : "계획 " + id + "번";
  }

  function currentPlan() {
    return plans.filter(function (p) { return p.id === planId; })[0] || null;
  }

  async function loadRetros() {
    const list = $("h-list");
    list.textContent = "";
    try {
      const rows = planId === null ? [] : await api.listRetrospectives(planId);
      if (!rows.length) {
        list.appendChild(el("li", { class: "plan plan-empty", text: "아직 넘긴 기록이 없습니다." }));
        return;
      }
      rows.forEach(function (r) {
        // 네 줄 모두 같은 표(항목 이름 칸 + 내용 칸)에 넣어 글자 크기와 시작 위치가 같다.
        const dl = el("dl", { class: "facts" });
        addFact(dl, "돌아본 계획", titleOf(r.plan_id));
        addFact(dl, "돌아본 기간", r.period_start + " ~ " + r.period_end);
        addFact(dl, "고칠 점", r.improvement);
        addFact(dl, "다음 계획", titleOf(r.next_plan_id));
        list.appendChild(el("li", { class: "plan" }, [dl]));
      });
    } catch (e) {
      list.appendChild(el("li", { class: "status", text: e.message }));
    }
  }

  hForm.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    const plan = currentPlan();
    if (!plan) { showHError("먼저 계획을 하나 세워 주세요."); return; }

    const a = {
      planId: planId,
      periodStart: plan.start_date,   // 돌아본 기간 = 그 계획의 기간
      periodEnd: plan.end_date,
      improvement: $("h-improve").value.trim(),
      nextTitle: $("h-title-in").value.trim(),
      nextStart: $("h-start").value,
      nextEnd: $("h-end").value,
      nextPriority: Number($("h-priority").value),
      nextSuccess: $("h-success").value.trim(),
      nextMinutes: $("h-minutes").value === "" ? NaN : Number($("h-minutes").value)
    };
    if (!a.improvement) { showHError("고칠 점을 한 줄 적어 주세요."); return; }
    // 새 계획이 만들어지는 것이라 계획 만들기와 같은 규칙·같은 문구를 쓴다.
    if (!a.nextTitle) { showHError("계획 이름을 적어 주세요."); return; }
    if (a.nextTitle.length > nameLimit()) {
      showHError(window.PDS_PLAN_NAME.tooLong(a.nextTitle, nameLimit()));
      return;
    }
    if (!a.nextStart || !a.nextEnd) { showHError("시작일과 종료일을 정해 주세요."); return; }
    if (a.nextEnd < a.nextStart) { showHError("종료일은 시작일보다 빠를 수 없습니다."); return; }
    if (!a.nextSuccess) { showHError("성공 기준을 적어 주세요."); return; }
    if (!Number.isInteger(a.nextMinutes) || a.nextMinutes < 0) {
      showHError("예상 시간은 0 이상의 정수(분)로 적어 주세요.");
      return;
    }

    showHError("");
    hSubmit.disabled = true;
    try {
      const retro = await api.handOver(a);
      const already = retro.improvement !== a.improvement;
      const message = already
        ? "이미 넘긴 기록이 있습니다."
        : "다음 계획으로 넘겼습니다.";
      resetHandoverForm();
      hDialog.close();
      document.dispatchEvent(new CustomEvent("plans-reload"));
      await loadRetros();
      notify(message);
    } catch (e) {
      warn(e.message);
    } finally {
      hSubmit.disabled = false;
    }
  });

  // "고칠 점을 다음 계획으로" 버튼: 계획 만들기·할 일 만들기처럼 입력 창을 띄운다.
  $("h-open").addEventListener("click", function () {
    if (!currentPlan()) { warn("먼저 계획을 하나 세워 주세요."); return; }
    resetHandoverForm();
    showHError("");
    nameLimit();
    hDialog.showModal();
    $("h-improve").focus();
  });
  $("h-cancel").addEventListener("click", function () { hDialog.close(); });

  // ---------- 선택·기간이 바뀌면 다시 계산 ----------

  planSelect.addEventListener("change", function () {
    planId = Number(planSelect.value);
    selectedKey = null;
    loadSummary();
    loadRetros();
  });

  document.addEventListener("plans-changed", function (ev) {
    plans = ev.detail;
    planSelect.textContent = "";
    plans.forEach(function (p) {
      planSelect.appendChild(el("option", { value: String(p.id), text: p.title }));
    });
    if (!plans.length) planId = null;
    else {
      if (!plans.some(function (p) { return p.id === planId; })) planId = plans[0].id;
      planSelect.value = String(planId);
    }
    loadSummary();
    loadRetros();
  });

  // 할 일 화면에서 완료·되돌리기·지우기 등이 일어나면 숫자를 다시 계산한다.
  document.addEventListener("tasks-changed", loadSummary);
})();
