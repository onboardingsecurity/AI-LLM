// 화면 동작. 사용자가 입력한 글자는 항상 textContent 로만 넣는다. (innerHTML 사용 금지)
(function () {
  const api = window.PDS_API;

  const PRIORITY_LABEL = window.PDS_UTIL.PRIORITY_LABEL;
  const formatSeoul = window.PDS_UTIL.formatSeoul;
  const el = window.PDS_UTIL.el;
  const notify = window.PDS_UTIL.notify;
  const warn = window.PDS_UTIL.warn;
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
  const dialog = document.getElementById("p-dialog");
  const formTitle = document.getElementById("form-title");
  const newBtn = document.getElementById("p-new");
  const histDialog = document.getElementById("hist-dialog");
  const histTitle = document.getElementById("hist-title");
  const histBody = document.getElementById("hist-body");
  const listEl = document.getElementById("plan-list");
  const statusEl = document.getElementById("list-status");

  let editingId = null;
  let plans = [];

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

  // 입력 창(모달)을 연다. plan 이 있으면 고치기, 없으면 새 계획 만들기.
  function openForm(plan) {
    editingId = plan ? plan.id : null;
    if (plan) {
      formTitle.textContent = "계획 고치기";
      formMode.textContent = "계획 " + plan.id + "번을 고치는 중입니다. 저장하면 이전 내용은 수정 이력에 남습니다.";
      formMode.hidden = false;
      submitBtn.textContent = "고친 내용 저장";
      fillForm(plan);
    } else {
      formTitle.textContent = "계획 만들기";
      formMode.hidden = true;
      submitBtn.textContent = "계획 저장";
      form.reset();
      form.priority.value = "2";
      // 기본값: 시작일·끝나는 날은 오늘(서울), 예상 시간은 0분
      form.start_date.value = window.PDS_UTIL.todayKST();
      form.end_date.value = form.start_date.value;
      form.estimated_minutes.value = "0";
    }
    showError("");
    dialog.showModal();
    form.title.focus();
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

  // 수정 이력을 세로 카드 타임라인으로 그린다. 위(처음)에서 아래(최근)로 내려오며, 카드가 조금씩 오른쪽으로 밀린다.
  // 맨 처음 기록은 전체 값을, 그다음부터는 바로 앞 기록에서 바뀐 항목만 "이전 → 지금"으로 보여 준다.
  function renderRevisions(container, revisions) {
    container.textContent = "";

    // 카드가 밀리는 폭: 기록이 적으면 36px, 많으면 줄여서 전체가 창 폭 안에 들어가게 한다.
    const n = revisions.length;
    const step = n > 1 ? Math.max(14, Math.min(36, Math.floor(240 / (n - 1)))) : 0;
    const line = el("div", { class: "timeline", style: "--n:" + n + ";--step:" + step + "px" });
    revisions.forEach(function (r, i) {
      const prev = i > 0 ? revisions[i - 1] : null;

      const body = el("div", { class: "tl-body" });
      if (!prev) {
        body.appendChild(factsList(r));
      } else {
        let any = false;
        FIELDS.forEach(function (f) {
          if (prev[f[0]] === r[f[0]]) return;
          any = true;
          const oldText = f[2](prev[f[0]]);
          const newText = f[2](r[f[0]]);
          // 이전·새 값이 둘 다 짧으면(예상 시간·우선순위·날짜 등) 한 줄로, 길면 두 줄로 보여 준다.
          const short = oldText.length <= 16 && newText.length <= 16 && oldText.indexOf("\n") < 0 && newText.indexOf("\n") < 0;
          body.appendChild(el("div", { class: "tl-chg" }, [
            el("div", { class: "tl-key", text: f[1] }),
            el("div", { class: short ? "tl-val tl-inline" : "tl-val" }, [
              el("div", { class: "tl-old", text: oldText }),
              el("div", { class: "tl-new", text: "→ " + newText })
            ])
          ]));
        });
        if (!any) body.appendChild(el("p", { class: "hint", text: "바뀐 항목이 없습니다." }));
      }

      line.appendChild(el("div", { class: "tl-item", style: "--i:" + i }, [
        el("span", { class: "tl-dot", "aria-hidden": "true" }),
        el("div", { class: "tl-card" }, [
          el("div", { class: "tl-time", text: formatSeoul(r.recorded_at) }),
          body
        ])
      ]));
    });
    container.appendChild(line);

  }

  // 수정 이력은 화면 가운데 창(모달)으로 띄운다. 열 때마다 서버에서 새로 읽는다.
  async function showHistory(plan, button) {
    button.disabled = true;
    try {
      const revisions = await api.listRevisions(plan.id);
      histTitle.textContent = "계획 " + plan.id + "번 수정 이력";
      renderRevisions(histBody, revisions);
      histDialog.showModal();
    } catch (e) {
      warn(e.message);
    } finally {
      button.disabled = false;
    }
  }

  function renderPlans() {
    listEl.textContent = "";
    statusEl.hidden = plans.length > 0;
    if (!plans.length) statusEl.textContent = "아직 계획이 없습니다. 왼쪽에서 첫 계획을 세워 보세요.";

    plans.forEach(function (plan) {
      const editBtn = el("button", { type: "button", text: "고치기" });
      editBtn.addEventListener("click", function () { openForm(plan); });

      const histBtn = el("button", { type: "button", class: "ghost", text: "수정 이력 보기" });
      histBtn.addEventListener("click", function () { showHistory(plan, histBtn); });

      const title = el("h3", {}, [el("span", { class: "id", text: "계획 " + plan.id }), document.createTextNode(plan.title)]);

      const li = el("li", { class: "plan" }, [
        title,
        factsList(plan),
        el("div", { class: "actions" }, [editBtn, histBtn])
      ]);
      listEl.appendChild(li);
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
      const wasEdit = editingId !== null;
      const saved = wasEdit ? await api.updatePlan(editingId, plan) : await api.createPlan(plan);
      dialog.close();
      editingId = null;
      await load();
      notify(wasEdit
        ? "계획 " + saved.id + "번을 고쳤습니다. 이전 내용은 수정 이력에 그대로 남았습니다."
        : "계획 " + saved.id + "번을 저장했습니다.");
    } catch (e) {
      warn(e.message);
    } finally {
      submitBtn.disabled = false;
    }
  });

  cancelBtn.addEventListener("click", function () { dialog.close(); });
  window.PDS_UTIL.keepEndAfterStart(form.start_date, form.end_date);
  newBtn.addEventListener("click", function () { openForm(null); });
  document.getElementById("hist-close").addEventListener("click", function () { histDialog.close(); });

  // 다른 화면(돌아보기)이 새 계획을 만들면 목록을 다시 불러온다.
  document.addEventListener("plans-reload", load);

  load();
})();
