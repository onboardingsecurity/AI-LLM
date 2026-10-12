// 화면 동작. 사용자가 입력한 글자는 항상 textContent 로만 넣는다. (innerHTML 사용 금지)
(function () {
  const api = window.PDS_API;

  const PRIORITY_LABEL = window.PDS_UTIL.PRIORITY_LABEL;
  const formatSeoul = window.PDS_UTIL.formatSeoul;
  const el = window.PDS_UTIL.el;
  const FIELDS = [
    ["title", "계획 이름", function (v) { return v; }],
    ["start_date", "시작일", function (v) { return v; }],
    ["end_date", "끝나는 날", function (v) { return v; }],
    ["priority", "우선순위", function (v) { return PRIORITY_LABEL[v] || String(v); }],
    ["estimated_minutes", "예상 시간", function (v) { return v + "분"; }],
    ["success_criteria", "성공 기준", function (v) { return v; }]
  ];

  const form = document.getElementById("plan-form");
  const formMode = document.getElementById("form-mode");
  const formError = document.getElementById("form-error");
  const submitBtn = document.getElementById("f-submit");
  const cancelBtn = document.getElementById("f-cancel");
  const listEl = document.getElementById("plan-list");
  const statusEl = document.getElementById("list-status");

  let editingId = null;
  let plans = [];
  const openHistory = new Set();

  function showError(msg) {
    formError.textContent = msg || "";
    formError.hidden = !msg;
  }

  function readForm() {
    return {
      title: form.title.value.trim(),
      start_date: form.start_date.value,
      end_date: form.end_date.value,
      priority: Number(form.priority.value),
      success_criteria: form.success_criteria.value.trim(),
      estimated_minutes: form.estimated_minutes.value === "" ? NaN : Number(form.estimated_minutes.value)
    };
  }

  function validate(p) {
    if (!p.title) return "계획 이름을 적어 주세요.";
    if (!p.start_date || !p.end_date) return "시작일과 끝나는 날을 정해 주세요.";
    if (p.end_date < p.start_date) return "끝나는 날은 시작일보다 빠를 수 없습니다.";
    if (!p.success_criteria) return "성공 기준을 적어 주세요.";
    if (!Number.isInteger(p.estimated_minutes) || p.estimated_minutes < 0) {
      return "예상 시간은 0 이상의 정수(분)로 적어 주세요.";
    }
    return "";
  }

  function fillForm(plan) {
    form.title.value = plan.title;
    form.start_date.value = plan.start_date;
    form.end_date.value = plan.end_date;
    form.priority.value = String(plan.priority);
    form.success_criteria.value = plan.success_criteria;
    form.estimated_minutes.value = String(plan.estimated_minutes);
  }

  function setMode(plan) {
    editingId = plan ? plan.id : null;
    if (plan) {
      formMode.textContent = "계획 " + plan.id + "번을 고치는 중입니다. 저장하면 이전 내용은 수정 이력에 남습니다.";
      formMode.hidden = false;
      submitBtn.textContent = "고친 내용 저장";
      cancelBtn.hidden = false;
      fillForm(plan);
      form.title.focus();
    } else {
      formMode.hidden = true;
      submitBtn.textContent = "계획 저장";
      cancelBtn.hidden = true;
      form.reset();
      form.priority.value = "2";
    }
    showError("");
  }

  function factsList(values, changed) {
    const dl = el("dl", { class: "facts" });
    FIELDS.forEach(function (f) {
      dl.appendChild(el("dt", { text: f[1] }));
      const dd = el("dd", { text: f[2](values[f[0]]) });
      if (changed && changed.has(f[0])) dd.className = "changed";
      dl.appendChild(dd);
    });
    return dl;
  }

  function renderRevisions(container, revisions) {
    container.textContent = "";
    container.appendChild(el("h4", { text: "수정 이력 (" + revisions.length + "개 버전)" }));
    revisions.forEach(function (r, i) {
      const prev = i > 0 ? revisions[i - 1] : null;
      const changed = new Set();
      if (prev) FIELDS.forEach(function (f) { if (prev[f[0]] !== r[f[0]]) changed.add(f[0]); });
      const head = (i === 0 ? "버전 1 · 처음 세운 계획" : "버전 " + r.version + " · 고친 내용") +
        " · " + formatSeoul(r.recorded_at);
      container.appendChild(el("div", { class: "rev" }, [
        el("div", { class: "rev-head", text: head }),
        factsList(r, changed)
      ]));
    });
    if (revisions.length > 1) {
      container.appendChild(el("p", { class: "hint", text: "노란 칸은 바로 앞 버전에서 바뀐 값입니다." }));
    }
  }

  async function toggleHistory(plan, container, button) {
    if (openHistory.has(plan.id)) {
      openHistory.delete(plan.id);
      container.hidden = true;
      button.textContent = "수정 이력 보기";
      return;
    }
    button.disabled = true;
    try {
      const revisions = await api.listRevisions(plan.id);
      renderRevisions(container, revisions);
      container.hidden = false;
      openHistory.add(plan.id);
      button.textContent = "수정 이력 닫기";
    } catch (e) {
      container.textContent = e.message;
      container.hidden = false;
    } finally {
      button.disabled = false;
    }
  }

  function renderPlans() {
    listEl.textContent = "";
    statusEl.hidden = plans.length > 0;
    if (!plans.length) statusEl.textContent = "아직 계획이 없습니다. 왼쪽에서 첫 계획을 세워 보세요.";

    plans.forEach(function (plan) {
      const history = el("div", { class: "history" });
      history.hidden = true;

      const editBtn = el("button", { type: "button", text: "고치기" });
      editBtn.addEventListener("click", function () { setMode(plan); });

      const histBtn = el("button", { type: "button", class: "ghost", text: "수정 이력 보기" });
      histBtn.addEventListener("click", function () { toggleHistory(plan, history, histBtn); });

      const title = el("h3", {}, [el("span", { class: "id", text: "계획 " + plan.id }), document.createTextNode(plan.title)]);

      const li = el("li", { class: "plan" }, [
        title,
        factsList(plan),
        el("div", { class: "actions" }, [editBtn, histBtn]),
        history
      ]);
      listEl.appendChild(li);

      if (openHistory.has(plan.id)) {
        api.listRevisions(plan.id).then(function (revs) {
          renderRevisions(history, revs);
          history.hidden = false;
          histBtn.textContent = "수정 이력 닫기";
        }).catch(function () { openHistory.delete(plan.id); });
      }
    });
  }

  async function load() {
    statusEl.hidden = false;
    statusEl.textContent = "불러오는 중…";
    try {
      plans = await api.listPlans();
      renderPlans();
      document.dispatchEvent(new CustomEvent("plans-changed", { detail: plans }));
    } catch (e) {
      statusEl.textContent = e.message;
    }
  }

  form.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    const plan = readForm();
    const problem = validate(plan);
    if (problem) { showError(problem); return; }

    showError("");
    submitBtn.disabled = true;
    try {
      if (editingId === null) await api.createPlan(plan);
      else await api.updatePlan(editingId, plan);
      setMode(null);
      await load();
    } catch (e) {
      showError(e.message);
    } finally {
      submitBtn.disabled = false;
    }
  });

  cancelBtn.addEventListener("click", function () { setMode(null); });

  // 다른 화면(돌아보기)이 새 계획을 만들면 목록을 다시 불러온다.
  document.addEventListener("plans-reload", load);

  load();
})();
