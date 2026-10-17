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
  const detailTitle = $("r-detail-title");
  const detailList = $("r-detail");

  // 숫자 카드 정의. metric 은 DB 함수 review_tasks 에 넘기는 값이다.
  const STATS = [
    { key: "plan_count", label: "계획 수 (딸린 할 일)", metric: "all", unit: "개" },
    { key: "done_count", label: "완료 수", metric: "done", unit: "개" },
    { key: "overdue_count", label: "지연 수", metric: "overdue", unit: "개" },
    { key: "blocked_count", label: "막힘 수", metric: "blocked", unit: "개" },
    { key: "estimated_minutes", label: "예상 시간", metric: "all", unit: "분" },
    { key: "actual_minutes", label: "실제 시간", metric: "all", unit: "분" },
    { key: "diff_minutes", label: "차이 (실제 − 예상)", metric: "all", unit: "분" }
  ];

  let plans = [];
  let planId = null;
  let selectedKey = null;
  let summary = null;
  let seq = 0;

  function range() {
    return { from: $("r-from").value || null, to: $("r-to").value || null };
  }

  function signed(n) { return (n > 0 ? "+" : "") + n; }

  // ---------- 집계 ----------

  async function loadSummary() {
    const my = ++seq;
    if (planId === null) {
      statsEl.textContent = "";
      detailList.textContent = "";
      detailTitle.textContent = "";
      statusEl.textContent = "먼저 계획을 하나 세워 주세요.";
      return;
    }
    const r = range();
    if (r.from && r.to && r.to < r.from) {
      statusEl.textContent = "기간 끝은 시작보다 빠를 수 없습니다.";
      return;
    }
    statusEl.textContent = "불러오는 중…";
    try {
      const s = await api.reviewSummary(planId, r.from, r.to);
      if (my !== seq) return;
      summary = s;
      statusEl.textContent = r.from || r.to
        ? "마감일 " + (r.from || "처음") + " ~ " + (r.to || "끝") + " 기준입니다."
        : "계획 전체 기준입니다.";
      renderStats();
      if (selectedKey) await showDetail(selectedKey);
      else { detailList.textContent = ""; detailTitle.textContent = ""; }
    } catch (e) {
      if (my === seq) statusEl.textContent = e.message;
    }
  }

  function renderStats() {
    statsEl.textContent = "";
    STATS.forEach(function (st) {
      const value = summary[st.key];
      const shown = st.key === "diff_minutes" ? signed(value) : String(value);
      const btn = el("button", {
        type: "button",
        class: "stat" + (selectedKey === st.key ? " on" : ""),
        "aria-pressed": selectedKey === st.key ? "true" : "false"
      }, [
        el("span", { class: "num", text: shown + st.unit }),
        el("span", { class: "lbl", text: st.label })
      ]);
      btn.addEventListener("click", function () {
        selectedKey = st.key;
        renderStats();
        showDetail(st.key);
      });
      statsEl.appendChild(btn);
    });
  }

  // ---------- 숫자의 근거 ----------

  function addFact(dl, k, v) {
    dl.appendChild(el("dt", { text: k }));
    dl.appendChild(el("dd", { text: v }));
  }

  async function showDetail(key) {
    const st = STATS.filter(function (x) { return x.key === key; })[0];
    const r = range();
    detailTitle.textContent = "\"" + st.label + "\"의 근거";
    detailList.textContent = "";
    try {
      const tasks = await api.reviewTasks(planId, r.from, r.to, st.metric);
      const execs = await api.listActiveExecutions(tasks.map(function (t) { return t.id; }));
      const byTask = {};
      execs.forEach(function (e) { byTask[e.task_id] = e; });

      let sumEst = 0;
      let sumAct = 0;
      tasks.forEach(function (t) {
        sumEst += t.estimated_minutes;
        if (byTask[t.id]) sumAct += byTask[t.id].actual_minutes;
        detailList.appendChild(renderRow(t, byTask[t.id]));
      });

      let note;
      if (key === "estimated_minutes") note = "할 일 " + tasks.length + "개의 예상 시간 합계 = " + sumEst + "분";
      else if (key === "actual_minutes") note = "실행 기록 " + execs.length + "건의 걸린 시간 합계 = " + sumAct + "분";
      else if (key === "diff_minutes") note = "실제 " + sumAct + "분 − 예상 " + sumEst + "분 = " + signed(sumAct - sumEst) + "분";
      else note = "목록 " + tasks.length + "개 = 숫자 " + summary[key] + "개" + (tasks.length === summary[key] ? " (일치)" : " (불일치!)");
      detailTitle.textContent += " — " + note;
      if (!tasks.length) detailList.appendChild(el("li", { class: "status", text: "해당하는 할 일이 없습니다." }));
    } catch (e) {
      detailTitle.textContent = e.message;
    }
  }

  function renderRow(task, exec) {
    const done = task.status === "done";
    const dl = el("dl", { class: "facts" });
    addFact(dl, "마감일", task.due_date || "없음");
    addFact(dl, "우선순위", PRIORITY_LABEL[task.priority]);
    addFact(dl, "예상 시간", task.estimated_minutes + "분");
    if (exec) {
      addFact(dl, "실제 시간", exec.actual_minutes + "분");
      addFact(dl, "시작~끝", formatSeoul(exec.started_at) + " ~ " + formatSeoul(exec.ended_at));
      addFact(dl, "막혔던 이유", exec.blocked_reason ? exec.blocked_reason : "없음");
      addFact(dl, "실행 기록", "기록 " + exec.id + " (할 일 " + exec.task_id + "번에 붙어 있음)");
    }
    return el("li", { class: "plan" }, [
      el("h3", {}, [
        el("span", { class: "id", text: "할 일 " + task.id }),
        document.createTextNode(task.title),
        el("span", { class: done ? "badge done" : "badge", text: done ? "완료" : "진행 중" })
      ]),
      dl
    ]);
  }

  // ---------- 고칠 점을 다음 계획으로 ----------

  const hForm = $("handover-form");
  const hError = $("h-error");
  const hResult = $("h-result");
  const hSubmit = $("h-submit");
  let titleTouched = false;
  let successTouched = false;

  function showHError(msg) { hError.textContent = msg || ""; hError.hidden = !msg; }

  // 기본값: 다음 계획의 시작일·종료일은 오늘(서울), 예상 시간은 0분
  function handoverDefaults() {
    $("h-start").value = window.PDS_UTIL.todayKST();
    $("h-end").value = $("h-start").value;
    $("h-minutes").value = "0";
  }
  handoverDefaults();
  window.PDS_UTIL.keepEndAfterStart($("h-start"), $("h-end"));

  $("h-improve").addEventListener("input", function () {
    const v = $("h-improve").value;
    if (!titleTouched) $("h-title-in").value = v.slice(0, nameLimit());
    if (!successTouched) $("h-success").value = v.slice(0, 500);
  });
  $("h-title-in").addEventListener("input", function () { titleTouched = true; });
  // 다음 계획 이름도 계획 이름 길이 규칙(5자 단위, 목록에서 한 줄로 보이는 길이)을 따른다. 계획 탭에서 잰 값을 쓴다.
  function nameLimit() {
    const n = window.PDS_PLAN_NAME ? window.PDS_PLAN_NAME.cached() : 20;
    $("h-title-in").maxLength = n;
    return n;
  }
  nameLimit();
  $("h-title-in").addEventListener("focus", nameLimit);
  $("h-success").addEventListener("input", function () { successTouched = true; });

  function currentPlan() {
    return plans.filter(function (p) { return p.id === planId; })[0] || null;
  }

  async function loadRetros() {
    const list = $("h-list");
    list.textContent = "";
    if (planId === null) return;
    try {
      const rows = await api.listRetrospectives(planId);
      if (!rows.length) {
        list.appendChild(el("li", { class: "status", text: "아직 넘긴 기록이 없습니다." }));
        return;
      }
      rows.forEach(function (r) {
        const dl = el("dl", { class: "facts" });
        addFact(dl, "돌아본 기간", r.period_start + " ~ " + r.period_end);
        addFact(dl, "고칠 점", r.improvement);
        addFact(dl, "다음 계획", "계획 " + r.next_plan_id + "번으로 넘어감");
        list.appendChild(el("li", { class: "plan" }, [
          el("h3", {}, [el("span", { class: "id", text: "돌아보기 " + r.id }), document.createTextNode("계획 " + r.plan_id + "번")]),
          dl
        ]));
      });
    } catch (e) {
      list.appendChild(el("li", { class: "status", text: e.message }));
    }
  }

  hForm.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    const plan = currentPlan();
    if (!plan) { showHError("먼저 계획을 하나 세워 주세요."); return; }

    const r = range();
    const a = {
      planId: planId,
      periodStart: r.from || plan.start_date,
      periodEnd: r.to || plan.end_date,
      improvement: $("h-improve").value.trim(),
      nextTitle: $("h-title-in").value.trim(),
      nextStart: $("h-start").value,
      nextEnd: $("h-end").value,
      nextPriority: Number($("h-priority").value),
      nextSuccess: $("h-success").value.trim(),
      nextMinutes: $("h-minutes").value === "" ? NaN : Number($("h-minutes").value)
    };
    if (a.periodEnd < a.periodStart) { showHError("돌아본 기간이 올바르지 않습니다."); return; }
    if (!a.improvement) { showHError("고칠 점을 한 줄 적어 주세요."); return; }
    if (!a.nextTitle) { showHError("다음 계획 이름을 적어 주세요."); return; }
    if (!a.nextStart || !a.nextEnd) { showHError("다음 계획의 시작일과 종료일을 정해 주세요."); return; }
    if (a.nextEnd < a.nextStart) { showHError("종료일은 시작일보다 빠를 수 없습니다."); return; }
    if (!a.nextSuccess) { showHError("다음 계획의 성공 기준을 적어 주세요."); return; }
    if (!Number.isInteger(a.nextMinutes) || a.nextMinutes < 0) {
      showHError("예상 시간은 0 이상의 정수(분)로 적어 주세요.");
      return;
    }

    showHError("");
    hResult.textContent = "";
    hSubmit.disabled = true;
    try {
      const retro = await api.handOver(a);
      const already = retro.improvement !== a.improvement;
      const message = already
        ? "이 기간은 이미 넘긴 기록이 있어 기존 기록을 그대로 두었습니다.\n(고칠 점: " + retro.improvement + " → 계획 " + retro.next_plan_id + "번)"
        : "\"" + retro.improvement + "\" 한 줄이 다음 계획 " + retro.next_plan_id + "번으로 넘어갔습니다.";
      hForm.reset();
      $("h-priority").value = "2";
      handoverDefaults();
      titleTouched = false;
      successTouched = false;
      document.dispatchEvent(new CustomEvent("plans-reload"));
      await loadRetros();
      notify(message);
    } catch (e) {
      warn(e.message);
    } finally {
      hSubmit.disabled = false;
    }
  });

  // ---------- 선택·기간이 바뀌면 다시 계산 ----------

  planSelect.addEventListener("change", function () {
    planId = Number(planSelect.value);
    selectedKey = null;
    loadSummary();
    loadRetros();
  });
  ["r-from", "r-to"].forEach(function (id) { $(id).addEventListener("change", loadSummary); });

  document.addEventListener("plans-changed", function (ev) {
    plans = ev.detail;
    planSelect.textContent = "";
    plans.forEach(function (p) {
      planSelect.appendChild(el("option", { value: String(p.id), text: "계획 " + p.id + " · " + p.title }));
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
