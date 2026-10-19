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
    ["end_date", "종료일", function (v) { return v; }],
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
  const emptyEl = document.getElementById("p-empty");   // 계획이 하나도 없을 때 보이는 그림

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

  // ---- 계획 이름 길이 규칙 ----
  // 목록에서 계획 이름이 칸 막대 끝을 넘지 않고 한 줄로 보이는 글자 수를 지금 화면에서 재서, 5자 단위(…15, 20, 25…)로 내림해 규칙으로 쓴다.
  // 가장 넓은 글자(한글·W·M 등)가 모두 들어가는 폭을 기준으로 하니, 어떤 글자로 써도 막대 끝을 넘지 않는다.
  // 화면 크기·글자 크기에 따라 달라지므로 계획 만들기 창을 열 때와 화면이 바뀔 때 다시 잰다.
  const NAME_MIN = 10;
  const NAME_MAX = 100;           // DB 규칙(1~100자)과 같은 상한
  let nameLimit = 20;             // 아직 못 쟀을 때(계획 탭이 숨겨져 있을 때)의 기본값. 재면 이 값을 갱신한다.

  let measureCtx = null;          // 글자 폭 재기용 캔버스(한 번만 만든다)

  function measureNameLimit() {
    if (!listEl.getClientRects().length) return nameLimit;     // 계획 탭이 안 보이면 잴 수 없다
    const btn = el("button", { type: "button", class: "pl-name", text: "가" });
    const probe = el("li", { class: "pl-item", "aria-hidden": "true", style: "visibility:hidden" }, [
      el("h3", {}, [btn]), el("div", { class: "pl-bar" })
    ]);
    listEl.appendChild(probe);
    const bar = probe.querySelector(".pl-bar").getBoundingClientRect();
    const box = btn.getBoundingClientRect();
    const cs = window.getComputedStyle(btn);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const ctx = measureCtx || (measureCtx = document.createElement("canvas").getContext("2d"));
    ctx.font = cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
    const prefix = ctx.measureText("▸ ").width;                 // 이름 앞의 ▸ 표시
    listEl.removeChild(probe);
    let widest = 0;
    "가힣ㅋW@M%mQ0".split("").forEach(function (ch) { widest = Math.max(widest, ctx.measureText(ch).width); });
    const room = bar.right - box.left - padX - prefix;           // 이름 글자가 놓일 수 있는 폭(막대 끝까지)
    if (!(room > 0) || !(widest > 0)) return nameLimit;
    const fit = Math.floor(room / widest);
    nameLimit = Math.max(NAME_MIN, Math.min(NAME_MAX, Math.floor(fit / 5) * 5));
    return nameLimit;
  }
  // 돌아보기의 "다음 계획 이름"도 같은 길이 규칙·같은 문구를 쓴다.
  window.PDS_PLAN_NAME = {
    cached: function () { return nameLimit; },
    placeholder: function (n) { return "최대 " + n + "자 입력 가능합니다."; },
    tooLong: function (title, n) { return "계획 이름은 " + n + "자까지 쓸 수 있습니다. (지금 " + title.length + "자)"; }
  };

  function applyNameLimit() {
    const n = measureNameLimit();
    form.title.maxLength = n;
    form.title.placeholder = window.PDS_PLAN_NAME.placeholder(n);
    return n;
  }

  let originalTitle = null;       // 고치기일 때 원래 이름(길이 규칙이 생기기 전에 만든 긴 이름은 그대로 저장할 수 있게)

  function validate(p) {
    if (!p.title) return "계획 이름을 적어 주세요.";
    if (p.title.length > nameLimit && p.title !== originalTitle) {
      return window.PDS_PLAN_NAME.tooLong(p.title, nameLimit);
    }
    if (!p.start_date || !p.end_date) return "시작일과 종료일을 정해 주세요.";
    if (p.end_date < p.start_date) return "종료일은 시작일보다 빠를 수 없습니다.";
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
    originalTitle = plan ? plan.title : null;
    if (plan) {
      formTitle.textContent = plan.title;
      formMode.textContent = "수정 시 이전 내용은 이력에 남습니다.";
      formMode.hidden = false;
      submitBtn.textContent = "고친 내용 저장";
      fillForm(plan);
    } else {
      formTitle.textContent = "계획 만들기";
      formMode.hidden = true;
      submitBtn.textContent = "계획 저장";
      form.reset();
      form.priority.value = "2";
      // 기본값: 시작일·종료일은 오늘(서울), 예상 시간은 0분
      form.start_date.value = window.PDS_UTIL.todayKST();
      form.end_date.value = form.start_date.value;
      form.estimated_minutes.value = "0";
    }
    showError("");
    applyNameLimit();
    dialog.showModal();
    form.title.focus();
  }

  function factsList(values, changed, skipKeys) {
    const dl = el("dl", { class: "facts" });
    FIELDS.forEach(function (f) {
      if (skipKeys && skipKeys.indexOf(f[0]) >= 0) return;
      dl.appendChild(el("dt", { text: f[1] }));
      const dd = el("dd", { text: f[2](values[f[0]]) });
      if (changed && changed.has(f[0])) dd.className = "changed";
      dl.appendChild(dd);
    });
    return dl;
  }

  // 계획 상세: 이름은 위에, 우선순위는 색깔 점과 색 안내 바로 보이니 빼고, 시작일·종료일은 "기간" 한 줄로 합친다.
  // (저장하는 값은 시작일·종료일 두 칸 그대로다. 수정 이력 창은 어느 쪽이 바뀌었는지 보이도록 따로 보여 준다.)
  function detailFacts(plan) {
    const dl = factsList(plan, null, ["title", "priority", "start_date", "end_date"]);
    dl.insertBefore(el("dd", { text: plan.start_date + " ~ " + plan.end_date }), dl.firstChild);
    dl.insertBefore(el("dt", { text: "기간" }), dl.firstChild);
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
      histTitle.textContent = plan.title;
      renderRevisions(histBody, revisions);
      histDialog.showModal();
    } catch (e) {
      warn(e.message);
    } finally {
      button.disabled = false;
    }
  }

  // 계획 이름을 대표로 세운 세로 타임라인. 시작일 순으로 위에서 아래로 놓고,
  // 이름을 누르면 그 자리에서 데이터와 고치기·수정 이력이 펼쳐진다.
  const openIds = new Set();

  // 상세를 펼치면 그 계획이 목록 칸의 한가운데 오도록 스크롤한다. 계획이 칸보다 크면 맨 위(이름)가 보이게 맞춘다.
  // 맨 위·맨 아래 계획은 가운데까지 못 가도 스크롤 끝까지만 가고, 그래도 상세는 모두 보인다.
  function centerInList(li) {
    const box = li.closest(".plan-scroll");
    if (!box) return;
    window.requestAnimationFrame(function () {
      const b = box.getBoundingClientRect();
      const r = li.getBoundingClientRect();
      const gap = r.height >= b.height ? 0 : (b.height - r.height) / 2;
      const delta = (r.top - b.top) - gap;
      box.scrollTo({ top: box.scrollTop + delta, behavior: window.PDS_UTIL.reduceMotion() ? "auto" : "smooth" });
    });
  }

  // ---------- 오른쪽 영역: 그림 ↔ 달력 ----------
  // 달력은 계획의 시작일~종료일을 주 단위 막대로 그린다. 막대를 누르면 왼쪽 목록이 그 계획으로 이동해 펼쳐진다.
  const sideEl = document.getElementById("plan-side");
  const calEl = document.getElementById("plan-cal");
  const viewStore = window.PDS_UTIL.viewStore("pds-plan-view");

  function focusPlan(id) {
    const li = listEl.querySelector('[data-plan-id="' + id + '"]');
    if (!li) return;
    const btn = li.querySelector(".pl-name");
    if (btn.getAttribute("aria-expanded") !== "true") btn.click();   // 펼치면서 가운데로 이동
    else centerInList(li);
  }

  // 달력은 js/cal.js 가 그린다(할 일 탭의 달력과 같은 모양). 막대를 누르면 그 계획의 상세로 간다.
  const planCal = window.PDS_CAL.create(calEl, function () {
    return plans.map(function (p) {
      return { id: p.id, title: p.title, start: p.start_date, end: p.end_date, priority: p.priority,
               cls: "pri-" + p.priority, tip: p.title + " (" + p.start_date + " ~ " + p.end_date + ")" };
    });
  }, { noun: "계획", onClick: function (item) { focusPlan(item.id); } });

  function setView(view, save) {
    sideEl.setAttribute("data-view", view);
    document.getElementById("view-art").setAttribute("aria-pressed", String(view === "art"));
    document.getElementById("view-cal").setAttribute("aria-pressed", String(view === "cal"));
    if (view === "cal") planCal.render();   // 달력이 보일 때만 그린다
    if (save) viewStore.set(view);
  }
  document.getElementById("view-art").addEventListener("click", function () { setView("art", true); });
  document.getElementById("view-cal").addEventListener("click", function () { setView("cal", true); });
  if (viewStore.get() === "cal") setView("cal", false);   // 저장값을 못 읽으면 기본(그림)

  // 정렬 선택(날짜순·종료일순·우선순위순)을 바꾸면 목록을 다시 그린다.
  document.getElementById("plan-sort").addEventListener("change", function () { renderPlans(); });

  // 칸 막대: 그 계획의 할 일 개수만큼 칸. 완료한 수만큼 초록, 기간 안에 못 끝낸 것(마감일이 지났거나 계획 종료일이 지났는데 미완료)은 회색, 나머지는 흰색.
  let briefsByPlan = new Map();   // 계획 번호 → 그 계획 할 일들의 { plan_id, status, due_date }
  function planBar(plan, today) {
    let total = 0, done = 0, missed = 0;
    (briefsByPlan.get(plan.id) || []).forEach(function (t) {
      total++;
      if (t.status === "done") done++;
      else if (plan.end_date < today || (t.due_date && t.due_date < today)) missed++;
    });
    return window.PDS_UTIL.cellBar({ total: total, green: done, gray: missed });
  }
  async function loadBriefs() {
    const byPlan = new Map();
    try {
      (await api.listTaskBrief()).forEach(function (t) {
        if (!byPlan.has(t.plan_id)) byPlan.set(t.plan_id, []);
        byPlan.get(t.plan_id).push(t);
      });
    } catch (e) { /* 막대만 비고 목록은 그대로 보인다 */ }
    briefsByPlan = byPlan;
  }
  document.addEventListener("tasks-changed", async function () { await loadBriefs(); renderPlans(); });

  function renderPlans() {
    listEl.textContent = "";
    statusEl.hidden = true;
    emptyEl.hidden = plans.length > 0;   // 계획이 없으면 글자 대신 그림

    const today = window.PDS_UTIL.todayKST();
    // 정렬: 날짜순(기본, 시작일) / 종료일순(종료일이 가까운 것부터) / 우선순위순(높음 먼저). 같으면 시작일, 그다음 번호 순.
    const byStart = function (a, b) {
      if (a.start_date !== b.start_date) return a.start_date < b.start_date ? -1 : 1;
      return a.id - b.id;
    };
    const sorters = {
      date: byStart,
      dday: function (a, b) {
        if (a.end_date !== b.end_date) return a.end_date < b.end_date ? -1 : 1;
        return byStart(a, b);
      },
      priority: function (a, b) {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return byStart(a, b);
      }
    };
    const sorted = plans.slice().sort(sorters[document.getElementById("plan-sort").value] || sorters.date);

    sorted.forEach(function (plan) {
      const panelId = "plan-panel-" + plan.id;
      const isOpen = openIds.has(plan.id);

      const nameBtn = el("button", {
        type: "button", class: "pl-name", text: plan.title,
        "aria-expanded": String(isOpen), "aria-controls": panelId
      });

      const editBtn = el("button", { type: "button", text: "고치기" });
      editBtn.addEventListener("click", function () { openForm(plan); });

      const histBtn = el("button", { type: "button", class: "ghost", text: "수정 이력" });
      histBtn.addEventListener("click", function () { showHistory(plan, histBtn); });

      const panel = el("div", { class: "pl-panel", id: panelId }, [
        detailFacts(plan),
        el("div", { class: "actions" }, [editBtn, histBtn])
      ]);
      panel.hidden = !isOpen;

      nameBtn.addEventListener("click", function () {
        const open = panel.hidden;
        panel.hidden = !open;
        nameBtn.setAttribute("aria-expanded", String(open));
        if (open) { openIds.add(plan.id); centerInList(li); } else openIds.delete(plan.id);
      });

      const li = el("li", { class: "pl-item pri-" + plan.priority, "data-plan-id": String(plan.id) }, [
        el("span", { class: "pl-dot", "aria-hidden": "true" }),
        el("div", { class: "pl-date" }, [
          document.createTextNode(plan.start_date + " ~ " + plan.end_date),
          el("span", { class: "pl-dday", text: window.PDS_UTIL.ddayText(plan.end_date, today), title: "종료일까지 남은 날" })
        ]),
        el("h3", {}, [nameBtn]),
        planBar(plan, today),
        panel
      ]);
      listEl.appendChild(li);
    });
    if (sideEl.getAttribute("data-view") === "cal") planCal.render();
  }

  let resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (dialog.open) applyNameLimit(); else measureNameLimit(); }, 200);   // 창이 열려 있으면 안내(플레이스 홀더)도 새 숫자로
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureNameLimit);
  document.getElementById("tab-plan").addEventListener("click", function () { setTimeout(measureNameLimit, 80); });   // 다른 탭에서 돌아오면 다시 잰다

  async function load() {
    statusEl.hidden = false;
    statusEl.textContent = "불러오는 중…";
    try {
      const got = await Promise.all([api.listPlans(), loadBriefs()]);
      plans = got[0];
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
        ? "계획을 고쳤습니다."
        : "계획을 저장했습니다.");
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

  // T06 의 공개 안내(로그인 없음)는 로그인을 붙이면서 없앴다. 로그인 화면에 "나만 볼 수 있다"는 안내가 있다.
  load();
})();
