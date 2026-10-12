// 할 일 화면 (카드 2) + 완료 기록 입력(카드 3). 입력 글자는 항상 textContent 로만 넣는다.
(function () {
  const api = window.PDS_API;
  const el = window.PDS_UTIL.el;
  const formatSeoul = window.PDS_UTIL.formatSeoul;
  const notify = window.PDS_UTIL.notify;
  const warn = window.PDS_UTIL.warn;
  const confirmBox = window.PDS_UTIL.confirmBox;
  const PRIORITY_LABEL = window.PDS_UTIL.PRIORITY_LABEL;

  // 정렬 기준. 화면에 그대로 밝히고, 같은 값일 때의 순서도 끝까지 정해 둔다(마지막은 항상 ID).
  const SORTS = {
    default: {
      label: "마감일 빠른 순(마감일 없는 것은 맨 뒤) → 우선순위 높은 순 → 만든 시각 빠른 순 → ID 작은 순",
      order: "due_date.asc.nullslast,priority.asc,created_at.asc,id.asc"
    },
    priority: {
      label: "우선순위 높은 순 → 마감일 빠른 순(마감일 없는 것은 맨 뒤) → 만든 시각 빠른 순 → ID 작은 순",
      order: "priority.asc,due_date.asc.nullslast,created_at.asc,id.asc"
    },
    minutes: {
      label: "예상 시간 긴 순 → 마감일 빠른 순(마감일 없는 것은 맨 뒤) → 우선순위 높은 순 → ID 작은 순",
      order: "estimated_minutes.desc,due_date.asc.nullslast,priority.asc,id.asc"
    }
  };

  const $ = function (id) { return document.getElementById(id); };
  const planSelect = $("t-plan");
  const form = $("task-form");
  const formMode = $("t-form-mode");
  const formError = $("t-form-error");
  const submitBtn = $("t-submit");
  const cancelBtn = $("t-cancel");
  const listEl = $("t-list");
  const statusMsg = $("t-status-msg");
  const criteriaEl = $("t-criteria");

  const dialog = $("c-dialog");
  const cForm = $("c-form");
  const cError = $("c-error");
  const cSubmit = $("c-submit");

  let planId = null;
  let editingId = null;
  let completingId = null;
  let requestKey = null;
  let minutesTouched = false;
  let debounce = null;
  let loadSeq = 0;

  // ---------- 입력 읽기·검사 ----------

  function cleanTag(t) { return t.replace(/[{}"\\,]/g, "").trim(); }

  function parseTags(text) {
    const seen = new Set();
    const out = [];
    text.split(",").forEach(function (piece) {
      const t = cleanTag(piece);
      if (t && !seen.has(t)) { seen.add(t); out.push(t); }
    });
    return out;
  }

  function readForm() {
    return {
      plan_id: planId,
      title: $("t-title").value.trim(),
      due_date: $("t-due").value || null,
      priority: Number($("t-priority").value),
      estimated_minutes: $("t-minutes").value === "" ? NaN : Number($("t-minutes").value),
      tags: parseTags($("t-tags").value)
    };
  }

  function validate(t) {
    if (planId === null) return "먼저 계획을 하나 세워 주세요.";
    if (!t.title) return "할 일 이름을 적어 주세요.";
    if (!Number.isInteger(t.estimated_minutes) || t.estimated_minutes < 0) {
      return "예상 시간은 0 이상의 정수(분)로 적어 주세요.";
    }
    if (t.tags.length > 10) return "태그는 10개까지 달 수 있습니다.";
    if (t.tags.some(function (x) { return x.length > 20; })) return "태그 하나는 20자까지입니다.";
    return "";
  }

  function showError(node, msg) {
    node.textContent = msg || "";
    node.hidden = !msg;
  }

  // ---------- 만들기·고치기 ----------

  function setMode(task) {
    editingId = task ? task.id : null;
    if (task) {
      formMode.textContent = "할 일 " + task.id + "번을 고치는 중입니다.";
      formMode.hidden = false;
      submitBtn.textContent = "고친 내용 저장";
      cancelBtn.hidden = false;
      $("t-title").value = task.title;
      $("t-due").value = task.due_date || "";
      $("t-priority").value = String(task.priority);
      $("t-minutes").value = String(task.estimated_minutes);
      $("t-tags").value = (task.tags || []).join(", ");
      $("t-title").focus();
    } else {
      formMode.hidden = true;
      submitBtn.textContent = "할 일 저장";
      cancelBtn.hidden = true;
      form.reset();
      $("t-priority").value = "2";
    }
    showError(formError, "");
  }

  form.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    const task = readForm();
    const problem = validate(task);
    if (problem) { showError(formError, problem); return; }

    showError(formError, "");
    submitBtn.disabled = true;
    try {
      const wasEdit = editingId !== null;
      const saved = wasEdit ? await api.updateTask(editingId, task) : await api.createTask(task);
      setMode(null);
      await loadTasks();
      notify(wasEdit ? "할 일 " + saved.id + "번을 고쳤습니다." : "할 일 " + saved.id + "번을 저장했습니다.");
    } catch (e) {
      warn(e.message);
    } finally {
      submitBtn.disabled = false;
    }
  });

  cancelBtn.addEventListener("click", function () { setMode(null); });

  // ---------- 검색·거르기·정렬 ----------

  function readFilters() {
    const sort = SORTS[$("t-sort").value] || SORTS.default;
    return {
      q: $("t-search").value.trim(),
      status: $("t-status").value,
      priority: $("t-priority-filter").value,
      tag: cleanTag($("t-tag-filter").value),
      order: sort.order
    };
  }

  function describeCriteria(f) {
    const sort = SORTS[$("t-sort").value] || SORTS.default;
    const conds = [];
    if (f.q) conds.push("제목에 \"" + f.q + "\" 포함");
    if (f.status) conds.push("상태: " + (f.status === "done" ? "완료" : "진행 중"));
    if (f.priority) conds.push("우선순위: " + PRIORITY_LABEL[f.priority]);
    if (f.tag) conds.push("태그: " + f.tag);
    criteriaEl.textContent =
      "정렬 기준: " + sort.label + ". 같은 값이면 위 순서대로 다음 기준으로 정합니다. " +
      "거르기·검색: " + (conds.length ? conds.join(", ") : "조건 없음") +
      ". (검색·거르기·정렬은 서버 DB에서 처리합니다.)";
  }

  ["t-status", "t-priority-filter", "t-sort"].forEach(function (id) {
    $(id).addEventListener("change", loadTasks);
  });
  ["t-search", "t-tag-filter"].forEach(function (id) {
    $(id).addEventListener("input", function () {
      clearTimeout(debounce);
      debounce = setTimeout(loadTasks, 250);
    });
  });
  $("t-clear").addEventListener("click", function () {
    $("t-search").value = "";
    $("t-status").value = "";
    $("t-priority-filter").value = "";
    $("t-tag-filter").value = "";
    $("t-sort").value = "default";
    loadTasks();
  });

  planSelect.addEventListener("change", function () {
    planId = Number(planSelect.value);
    setMode(null);
    loadTasks();
  });

  // ---------- 목록 그리기 ----------

  function addFact(dl, key, value) {
    dl.appendChild(el("dt", { text: key }));
    dl.appendChild(el("dd", { text: value }));
  }

  function renderExecution(exec) {
    const dl = el("dl", { class: "facts" });
    addFact(dl, "시작 시각", formatSeoul(exec.started_at));
    addFact(dl, "끝난 시각", formatSeoul(exec.ended_at));
    addFact(dl, "걸린 시간", exec.actual_minutes + "분");
    addFact(dl, "막혔던 이유", exec.blocked_reason ? exec.blocked_reason : "없음");
    return el("div", { class: "exec" }, [
      el("h4", { text: "실행 기록 " + exec.id + " (할 일 " + exec.task_id + "번에 붙어 있음)" }),
      dl
    ]);
  }

  function renderTask(task) {
    const done = task.status === "done";

    const dl = el("dl", { class: "facts" });
    addFact(dl, "마감일", task.due_date || "없음");
    addFact(dl, "우선순위", PRIORITY_LABEL[task.priority]);
    addFact(dl, "예상 시간", task.estimated_minutes + "분");
    addFact(dl, "태그", task.tags && task.tags.length ? task.tags.join(", ") : "없음");

    const editBtn = el("button", { type: "button", text: "고치기" });
    editBtn.addEventListener("click", function () { setMode(task); });

    const toggleBtn = el("button", { type: "button", class: "ghost", text: done ? "진행 중으로 되돌리기" : "완료하기" });
    toggleBtn.addEventListener("click", function () {
      if (done) reopen(task, toggleBtn);
      else openComplete(task);
    });

    const delBtn = el("button", { type: "button", class: "ghost", text: "지우기" });
    delBtn.addEventListener("click", function () { remove(task, delBtn); });

    const badge = el("span", { class: done ? "badge done" : "badge", text: done ? "완료" : "진행 중" });
    const heading = el("h3", {}, [
      el("span", { class: "id", text: "할 일 " + task.id }),
      document.createTextNode(task.title),
      badge
    ]);

    const children = [heading, dl];
    const active = (task.executions || [])[0];
    if (done && active) children.push(renderExecution(active));
    children.push(el("div", { class: "actions" }, [editBtn, toggleBtn, delBtn]));
    return el("li", { class: "plan" }, children);
  }

  async function loadTasks() {
    const seq = ++loadSeq;
    if (planId === null) {
      criteriaEl.textContent = "";
      listEl.textContent = "";
      statusMsg.textContent = "먼저 위쪽에서 계획을 하나 세워 주세요.";
      return;
    }
    const f = readFilters();
    describeCriteria(f);
    statusMsg.textContent = "불러오는 중…";
    try {
      const tasks = await api.listTasks(planId, f);
      if (seq !== loadSeq) return; // 더 최근 요청이 있으면 이 결과는 버린다
      listEl.textContent = "";
      tasks.forEach(function (t) { listEl.appendChild(renderTask(t)); });
      statusMsg.textContent = tasks.length
        ? "할 일 " + tasks.length + "개"
        : "조건에 맞는 할 일이 없습니다.";
      document.dispatchEvent(new CustomEvent("tasks-changed"));
    } catch (e) {
      if (seq === loadSeq) statusMsg.textContent = e.message;
    }
  }

  // ---------- 지우기·되돌리기 ----------

  async function remove(task, btn) {
    if (!(await confirmBox("할 일 " + task.id + "번 \"" + task.title + "\"을(를) 지울까요?\n지운 할 일은 목록과 돌아보기 집계에서 빠집니다."))) return;
    btn.disabled = true;
    try {
      await api.deleteTask(task.id);
      if (editingId === task.id) setMode(null);
      await loadTasks();
      notify("할 일 " + task.id + "번을 지웠습니다.");
    } catch (e) {
      btn.disabled = false;
      warn(e.message);
    }
  }

  async function reopen(task, btn) {
    if (!(await confirmBox("할 일 " + task.id + "번을 진행 중으로 되돌릴까요?\n완료 기록은 지우지 않고 \"취소됨\"으로 남고, 돌아보기 완료 수에서는 빠집니다."))) return;
    btn.disabled = true;
    try {
      await api.reopenTask(task.id);
      await loadTasks();
      notify("할 일 " + task.id + "번을 진행 중으로 되돌렸습니다.");
    } catch (e) {
      btn.disabled = false;
      warn(e.message);
    }
  }

  // ---------- 완료하기 (실행 기록과 함께) ----------

  function newKey() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, function (c) {
      return (c ^ (window.crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16);
    });
  }

  // 입력칸의 "2026-10-12T22:40" 은 서울 시간으로 해석한다.
  function seoulIso(localValue) { return localValue + ":00+09:00"; }

  function openComplete(task) {
    completingId = task.id;
    requestKey = newKey(); // 이 창을 연 동안은 같은 키로 보낸다 → 두 번 눌러도 같은 요청
    cForm.reset();
    minutesTouched = false;
    showError(cError, "");
    $("c-title").textContent = "할 일 " + task.id + "번 완료하기";
    dialog.showModal();
  }

  $("c-cancel").addEventListener("click", function () { dialog.close(); });

  // 시작·끝 시각에서 걸린 시간(분)을 자동으로 채운다. 사용자가 직접 고친 뒤에는 덮어쓰지 않는다.
  function autoFillMinutes() {
    if (minutesTouched) return;
    const start = $("c-start").value;
    const end = $("c-end").value;
    if (!start || !end) return;
    const diff = Date.parse(seoulIso(end)) - Date.parse(seoulIso(start));
    if (diff >= 0) $("c-minutes").value = String(Math.round(diff / 60000));
  }
  $("c-start").addEventListener("input", autoFillMinutes);
  $("c-end").addEventListener("input", autoFillMinutes);
  $("c-minutes").addEventListener("input", function () { minutesTouched = true; });

  cForm.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    const start = $("c-start").value;
    const end = $("c-end").value;
    const minutesText = $("c-minutes").value;
    if (!start || !end) { showError(cError, "시작 시각과 끝난 시각을 정해 주세요."); return; }

    const startMs = Date.parse(seoulIso(start));
    const endMs = Date.parse(seoulIso(end));
    if (endMs < startMs) { showError(cError, "끝난 시각은 시작 시각보다 빠를 수 없습니다."); return; }

    const minutes = minutesText === "" ? NaN : Number(minutesText);
    if (!Number.isInteger(minutes) || minutes < 0) {
      showError(cError, "걸린 시간은 0 이상의 정수(분)로 적어 주세요.");
      return;
    }
    if (minutes > Math.ceil((endMs - startMs) / 60000)) {
      showError(cError, "걸린 시간은 시작~끝 사이의 시간(분)을 넘을 수 없습니다.");
      return;
    }

    showError(cError, "");
    cSubmit.disabled = true;
    try {
      await api.completeTask({
        taskId: completingId,
        requestKey: requestKey,
        startedAt: seoulIso(start),
        endedAt: seoulIso(end),
        actualMinutes: minutes,
        blockedReason: $("c-blocked").value.trim() || null
      });
      const doneId = completingId;
      dialog.close();
      await loadTasks();
      notify("할 일 " + doneId + "번을 완료로 기록했습니다.");
    } catch (e) {
      showError(cError, e.message);
    } finally {
      cSubmit.disabled = false;
    }
  });

  // ---------- 계획 목록이 바뀌면 선택 상자를 다시 채운다 ----------

  document.addEventListener("plans-changed", function (ev) {
    const plans = ev.detail;
    planSelect.textContent = "";
    plans.forEach(function (p) {
      planSelect.appendChild(el("option", { value: String(p.id), text: "계획 " + p.id + " · " + p.title }));
    });
    if (!plans.length) {
      planId = null;
    } else {
      const stillThere = plans.some(function (p) { return p.id === planId; });
      if (!stillThere) planId = plans[0].id;
      planSelect.value = String(planId);
    }
    loadTasks();
  });

  describeCriteria(readFilters());
})();
