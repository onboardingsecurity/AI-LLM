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
      label: "빠른 마감, 높은 우선순위, 빠른 생성, 작은 아이디",
      order: "due_date.asc.nullslast,priority.asc,created_at.asc,id.asc"
    },
    priority: {
      label: "높은 우선순위, 빠른 마감, 빠른 생성, 작은 아이디",
      order: "priority.asc,due_date.asc.nullslast,created_at.asc,id.asc"
    },
    minutes: {
      label: "긴 예상 시간, 빠른 마감, 높은 우선순위, 작은 아이디",
      order: "estimated_minutes.desc,due_date.asc.nullslast,priority.asc,id.asc"
    }
  };

  const $ = function (id) { return document.getElementById(id); };
  const planSelect = $("t-plan");
  const form = $("task-form");
  const formError = $("t-form-error");
  const submitBtn = $("t-submit");
  const cancelBtn = $("t-cancel");
  const taskDialog = $("t-dialog");
  const formTitle = $("t-form-title");
  const newBtn = $("t-new");
  const listEl = $("t-list");
  const statusMsg = $("t-status-msg");
  const emptyEl = $("t-empty");   // 할 일이 없을 때 리스트 창 가운데에 보이는 그림
  const countEl = $("t-count");   // 할 일 리스트 제목 옆에 개수만
  function setStatus(text) { statusMsg.textContent = text; statusMsg.hidden = !text; }
  const criteriaEl = $("t-criteria");

  const dialog = $("c-dialog");
  const cForm = $("c-form");
  const cError = $("c-error");
  const cSubmit = $("c-submit");

  let planId = null;
  let planTitles = {};   // 계획 id → 계획 이름 (입력 창에 어느 계획의 할 일인지 보여 줄 때 쓴다)
  let editingId = null;
  let completingId = null;
  let completingTitle = "";   // 완료 창을 연 할 일의 이름(알림 창 제목에 쓴다)
  let requestKey = null;
  let minutesTouched = false;
  let debounce = null;
  let loadSeq = 0;
  let shownTasks = [];   // 지금 리스트에 보이는 할 일(달력도 같은 것을 그린다)

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

  // 입력 창(모달)을 연다. task 가 있으면 고치기, 없으면 새 할 일 만들기.
  function openForm(task) {
    if (!task && planId === null) { warn("먼저 계획을 하나 세워 주세요."); return; }
    if (task && task.status === "done") { warn("완료한 할 일은 고칠 수 없습니다. 진행 중으로 되돌리면 고칠 수 있습니다.", task.title); return; }
    editingId = task ? task.id : null;
    if (task) {
      formTitle.textContent = task.title;
      submitBtn.textContent = "고친 내용 저장";
      $("t-title").value = task.title;
      $("t-due").value = task.due_date || "";
      $("t-priority").value = String(task.priority);
      $("t-minutes").value = String(task.estimated_minutes);
      $("t-tags").value = (task.tags || []).join(", ");
    } else {
      formTitle.textContent = "할 일 만들기";
      submitBtn.textContent = "할 일 저장";
      form.reset();
      // 기본값(계획 만들기와 같은 방식): 마감일은 오늘(서울), 우선순위는 중간, 예상 시간은 0분
      $("t-due").value = window.PDS_UTIL.todayKST();
      $("t-priority").value = "2";
      $("t-minutes").value = "0";
    }
    showError(formError, "");
    taskDialog.showModal();
    $("t-title").focus();
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
      taskDialog.close();
      editingId = null;
      await loadTasks();
      notify(wasEdit ? "할 일을 고쳤습니다." : "할 일을 저장했습니다.", task.title);
    } catch (e) {
      warn(e.message, task.title);
    } finally {
      submitBtn.disabled = false;
    }
  });

  cancelBtn.addEventListener("click", function () { taskDialog.close(); });
  newBtn.addEventListener("click", function () { openForm(null); });

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

  // 화면에 밝히는 정렬 기준(요구사항: 정렬은 화면에 적힌 기준대로). 거르기 조건은 입력 칸에 그대로 보이니 따로 적지 않는다.
  function describeCriteria() {
    const sort = SORTS[$("t-sort").value] || SORTS.default;
    criteriaEl.textContent = "동일 정렬 기준\n: " + sort.label;   // 두 줄(줄바꿈은 CSS white-space: pre-line)
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
    return el("div", { class: "exec" }, [dl]);
  }

  // 할 일도 계획처럼 세로 타임라인. 이름이 대표이고, 이름을 누르면 그 자리에서 데이터와 버튼이 펼쳐진다.
  // 위에서 아래 순서는 서버가 화면에 밝힌 정렬 기준대로 정해 준 목록 순서 그대로다.
  const openIds = new Set();

  // 기간 막대: 만든 날 ~ 마감일. 보이는 할 일 전체의 가장 이른 날 ~ 가장 늦은 마감일을 한 줄(축)로 보고, 각 할 일이 그 안에서 어디에 놓이는지 그린다.
  // 완료 = 초록, 진행 중 = 주황(마감 전) / 회색(마감 지남). 마감일이 없으면 칸만 비워 둔다. 검은 세로선이 서울 오늘.
  function createdDay(task) { return new Date(Date.parse(task.created_at) + 9 * 3600000).toISOString().slice(0, 10); }
  function taskAxis(tasks) {
    let s = null, e = null;
    tasks.forEach(function (t) {
      const a = createdDay(t);
      const b = t.due_date && t.due_date > a ? t.due_date : a;
      if (s === null || a < s) s = a;
      if (e === null || b > e) e = b;
    });
    const today = window.PDS_UTIL.todayKST();
    if (s === null) return null;
    if (today < s) s = today;
    if (today > e) e = today;
    return { start: s, end: e };
  }
  function taskBar(task, axis, done, late, today) {
    const made = task.due_date ? createdDay(task) : null;
    return window.PDS_UTIL.periodBar({
      axisStart: axis.start, axisEnd: axis.end, today: today,
      start: made && made < task.due_date ? made : task.due_date, end: task.due_date,
      cls: done ? "done" : (late ? "over" : "ing")
    });
  }

  // ---------- 리스트 ↔ 달력 ----------
  // 달력은 계획 탭의 달력과 같은 모양(js/cal.js)이다. 막대는 만든 날 ~ 마감일(마감일 없는 할 일은 그릴 자리가 없어 빠진다).
  // 색: 진행 중 = 우선순위 색, 완료 = 초록, 진행 중인데 마감이 지남 = 회색. 막대를 눌러 이동하는 기능은 없다.
  const taskCal = window.PDS_CAL.create($("t-cal"), function () {
    const today = window.PDS_UTIL.todayKST();
    return shownTasks.filter(function (t) { return !!t.due_date; }).map(function (t) {
      const made = createdDay(t);
      const start = made < t.due_date ? made : t.due_date;
      const done = t.status === "done";
      const late = !done && t.due_date < today;
      return { id: t.id, title: t.title, start: start, end: t.due_date, priority: t.priority,
               cls: done ? "done" : (late ? "late" : "pri-" + t.priority),
               tip: t.title + " (" + start + " ~ " + t.due_date + ")" };
    });
  }, { noun: "할 일" });
  const viewStore = window.PDS_UTIL.viewStore("pds-task-view");
  function setTaskView(view, save) {
    const cal = view === "cal";
    $("t-cal").hidden = !cal;
    document.querySelector("#tasks-area .task-scroll").hidden = cal;
    $("t-view-list").setAttribute("aria-pressed", String(!cal));
    $("t-view-cal").setAttribute("aria-pressed", String(cal));
    if (cal) taskCal.render();
    if (save) viewStore.set(view);
  }
  $("t-view-list").addEventListener("click", function () { setTaskView("list", true); });
  $("t-view-cal").addEventListener("click", function () { setTaskView("cal", true); });
  if (viewStore.get() === "cal") setTaskView("cal", false);   // 저장값을 못 읽으면 기본(리스트)

  function renderTask(task, axis, today) {
    const done = task.status === "done";
    const panelId = "task-panel-" + task.id;
    const isOpen = openIds.has(task.id);

    const dl = el("dl", { class: "facts" });
    addFact(dl, "마감일", task.due_date || "없음");
    addFact(dl, "예상 시간", task.estimated_minutes + "분");
    addFact(dl, "태그", task.tags && task.tags.length ? task.tags.join(", ") : "없음");

    const editBtn = el("button", { type: "button", text: "고치기" });
    if (done) {
      // 완료한 할 일은 고칠 수 없다. 고치려면 먼저 "진행 중으로 되돌리기".
      editBtn.disabled = true;
      editBtn.title = "완료한 할 일은 고칠 수 없습니다. 진행 중으로 되돌리면 고칠 수 있습니다.";
    } else {
      editBtn.addEventListener("click", function () { openForm(task); });
    }

    const toggleBtn = el("button", { type: "button", class: "ghost", text: done ? "진행 중으로 되돌리기" : "완료하기" });
    toggleBtn.addEventListener("click", function () {
      if (done) reopen(task, toggleBtn);
      else openComplete(task);
    });

    const delBtn = el("button", { type: "button", class: "ghost", text: "지우기" });
    delBtn.addEventListener("click", function () { remove(task, delBtn); });

    const panelChildren = [dl];
    const active = (task.executions || [])[0];
    if (done && active) panelChildren.push(renderExecution(active));
    panelChildren.push(el("div", { class: "actions" }, [editBtn, toggleBtn, delBtn]));
    const panel = el("div", { class: "pl-panel", id: panelId }, panelChildren);
    panel.hidden = !isOpen;

    const nameBtn = el("button", {
      type: "button", class: "pl-name", text: task.title,
      "aria-expanded": String(isOpen), "aria-controls": panelId
    });
    nameBtn.addEventListener("click", function () {
      const open = panel.hidden;
      panel.hidden = !open;
      nameBtn.setAttribute("aria-expanded", String(open));
      if (open) openIds.add(task.id); else openIds.delete(task.id);
    });

    const badge = el("span", { class: done ? "badge done" : "badge", text: done ? "완료" : "진행 중" });
    // 네모칸: 완료 = 체크 표시, 진행 중 = 우선순위 색, 진행 중인데 마감일이 지났으면(서울 오늘 기준) 못한 표시(✕)
    const late = !done && !!task.due_date && task.due_date < today;
    const state = done ? "done" : (late ? "late" : "");
    const dotTitle = done ? "완료" : (late ? "마감일이 지났는데 못 했어요" : "진행 중");
    // 날짜 줄: 마감일 + (진행 중이고 마감일이 있으면) 남은 날 D-day. 완료한 할 일은 D-day 를 보여 주지 않는다.
    const dateLine = [document.createTextNode(task.due_date ? "마감일 " + task.due_date : "마감일 없음")];
    if (!done && task.due_date) {
      dateLine.push(el("span", { class: "pl-dday", text: window.PDS_UTIL.ddayText(task.due_date, today), title: "마감일까지 남은 날" }));
    }
    return el("li", { class: "pl-item" + (state ? " " + state : "") + " pri-" + task.priority }, [
      el("span", { class: "pl-dot", title: dotTitle, "aria-hidden": "true" }),
      el("div", { class: "pl-date" }, dateLine),
      el("h3", {}, [nameBtn, badge]),
      taskBar(task, axis, done, late, today),
      panel
    ]);
  }

  async function loadTasks() {
    const seq = ++loadSeq;
    if (planId === null) {
      criteriaEl.textContent = "";
      listEl.textContent = "";
      countEl.textContent = "";
      emptyEl.hidden = false;
      setStatus("먼저 위쪽에서 계획을 하나 세워 주세요.");
      return;
    }
    const f = readFilters();
    describeCriteria();
    countEl.textContent = "";
    emptyEl.hidden = true;
    setStatus("불러오는 중…");
    try {
      const tasks = await api.listTasks(planId, f);
      if (seq !== loadSeq) return; // 더 최근 요청이 있으면 이 결과는 버린다
      listEl.textContent = "";
      const axis = taskAxis(tasks);
      const today = window.PDS_UTIL.todayKST();
      tasks.forEach(function (t) { listEl.appendChild(renderTask(t, axis, today)); });
      shownTasks = tasks;
      if (!$("t-cal").hidden) taskCal.render();   // 달력이 보일 때만 그린다(보이게 될 때는 setTaskView 가 그린다)
      countEl.textContent = tasks.length ? tasks.length + "개" : "";   // 없을 때는 안내 문구만
      emptyEl.hidden = tasks.length > 0;
      // 검색·거르기 조건이 걸려 있는데 결과가 없으면 "조건에 맞는", 계획에 할 일이 아예 없으면 "할 일이 없습니다."
      const filtered = !!(f.q || f.status || f.priority || f.tag);
      setStatus(tasks.length ? "" : (filtered ? "조건에 맞는 할 일이 없습니다." : "할 일이 없습니다."));
      document.dispatchEvent(new CustomEvent("tasks-changed"));
    } catch (e) {
      if (seq === loadSeq) { countEl.textContent = ""; setStatus(e.message); }
    }
  }

  // ---------- 지우기·되돌리기 ----------

  async function remove(task, btn) {
    // 알림을 두 번에 나눈다: 먼저 집계 안내 → 확인하면 "지울까요?" → 확인하면 삭제. 어느 쪽에서든 취소하면 아무것도 하지 않는다.
    if (!(await confirmBox("삭제 시 돌아보기 집계에서 빠집니다.", task.title))) return;
    if (!(await confirmBox("해당 할 일을 지울까요?", task.title))) return;
    btn.disabled = true;
    try {
      await api.deleteTask(task.id);
      openIds.delete(task.id);
      await loadTasks();
      notify("삭제가 완료되었습니다.", task.title);
    } catch (e) {
      btn.disabled = false;
      warn(e.message, task.title);
    }
  }

  async function reopen(task, btn) {
    // 삭제와 같이 알림을 두 번에 나눈다: 먼저 기록·집계 안내 → 확인하면 "되돌릴까요?" → 확인하면 되돌린다. 어느 쪽에서든 취소하면 아무것도 하지 않는다.
    if (!(await confirmBox("완료 기록은 지우지 않고 취소로 남으며 돌아보기 집계에서 빠집니다.", task.title))) return;
    if (!(await confirmBox("해당 할 일을 진행 중으로 되돌릴까요?", task.title))) return;
    btn.disabled = true;
    try {
      await api.reopenTask(task.id);
      await loadTasks();
      notify("진행 중으로 되돌렸습니다.", task.title);
    } catch (e) {
      btn.disabled = false;
      warn(e.message, task.title);
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
    completingTitle = task.title;
    requestKey = newKey(); // 이 창을 연 동안은 같은 키로 보낸다 → 두 번 눌러도 같은 요청
    cForm.reset();
    // 기본값: 시작·끝난 시각은 지금(서울), 걸린 시간은 0분. 시각을 고치면 걸린 시간이 자동으로 채워진다.
    $("c-start").value = window.PDS_UTIL.nowKST();
    $("c-end").value = $("c-start").value;
    $("c-minutes").value = "0";
    minutesTouched = false;
    showError(cError, "");
    $("c-title").textContent = task.title;
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
      dialog.close();
      await loadTasks();
      notify("완료로 기록했습니다.", completingTitle);
    } catch (e) {
      showError(cError, e.message);
    } finally {
      cSubmit.disabled = false;
    }
  });

  // ---------- 계획 목록이 바뀌면 선택 상자를 다시 채운다 ----------

  document.addEventListener("plans-changed", function (ev) {
    const plans = ev.detail;
    planTitles = {};
    plans.forEach(function (p) { planTitles[p.id] = p.title; });
    planSelect.textContent = "";
    plans.forEach(function (p) {
      planSelect.appendChild(el("option", { value: String(p.id), text: p.title }));
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

  // ---------- 계획 선택 칸의 글자 크기 ----------
  // 지금 있는 계획 이름 중 가장 넓은 것이 선택 칸(과 펼친 목록)에 한 줄로 다 들어가는 가장 큰 글자 크기(10~16px)로 맞춘다.
  // 이름은 길이 규칙(app.js)을 넘지 않으니, 가장 긴 이름이 한 줄에 들어가고 칸이 필요 이상으로 비지 않는다.
  // 계획이 바뀌거나 칸 너비가 바뀌면(창 크기) 다시 맞춘다.
  const planPick = planSelect.previousElementSibling;   // util.js 가 select 앞에 끼워 넣은 ▼ 버튼
  if (planPick) planPick.classList.add("plan-pick");
  let pickCtx = null;                                  // 글자 폭 재기용 캔버스(한 번만 만든다)
  let pickSize = "";
  function fitPlanPick() {
    if (!planPick || !planPick.getClientRects().length) return;   // 탭이 숨겨져 있으면 잴 수 없다(보이게 되면 다시 맞춘다)
    const cs = window.getComputedStyle(planPick);
    const room = planPick.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const ctx = pickCtx || (pickCtx = document.createElement("canvas").getContext("2d"));
    ctx.font = cs.fontWeight + " 100px " + cs.fontFamily;
    let widest = 0;                                    // 글자 크기 1px 일 때 가장 넓은 이름의 너비
    Object.keys(planTitles).forEach(function (id) { widest = Math.max(widest, ctx.measureText(planTitles[id]).width / 100); });
    if (!(room > 0)) return;
    const size = widest > 0 ? Math.max(10, Math.min(16, Math.floor(room / widest * 2) / 2)) : 16;
    if (pickSize !== size + "px") { pickSize = size + "px"; document.documentElement.style.setProperty("--plan-pick-fs", pickSize); }
  }
  if (window.ResizeObserver && planPick) new ResizeObserver(function () { window.requestAnimationFrame(fitPlanPick); }).observe(planPick);   // 탭이 보이게 될 때·창 크기가 바뀔 때
  document.addEventListener("plans-changed", function () { setTimeout(fitPlanPick, 0); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitPlanPick);

  $("t-minutes").value = "0"; // 처음 화면의 기본값: 예상 시간 0분
  describeCriteria();
})();
