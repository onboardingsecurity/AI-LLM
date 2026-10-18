// 여러 화면이 같이 쓰는 도우미. 사용자가 입력한 글자는 항상 textContent 로만 넣는다.
(function () {
  const seoulTime = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false   // 분 단위까지(입력도 분 단위라 초는 항상 00)
  });

  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        if (k === "text") node.textContent = props[k];
        else if (k === "class") node.className = props[k];
        else node.setAttribute(k, props[k]);
      });
    }
    (children || []).forEach(function (c) { node.appendChild(c); });
    return node;
  }

  // ---- 알림·확인 창 ----
  // 처리 결과는 브라우저 기본 alert/confirm 대신 화면 스타일에 맞춘 <dialog>로 알린다.
  // 여러 개가 겹치면 차례로 띄운다. 글자는 textContent 로만 넣는다.
  const dlg = document.getElementById("app-dialog");
  let queue = Promise.resolve();

  function showDialog(text, kind, title, extraClass) {
    const run = function () {
      return new Promise(function (resolve) {
        if (!dlg || typeof dlg.showModal !== "function") {
          resolve(kind === "ask" ? window.confirm(text) : (window.alert(text), true));
          return;
        }
        const titles = { ok: "완료", warn: "알림", ask: "확인" };
        const icons = { ok: "\u2713", warn: "!", ask: "?" };
        document.getElementById("dlg-title").textContent = title || titles[kind];   // title 을 주면 기본 제목(확인·알림·완료) 대신 쓴다
        document.getElementById("dlg-text").textContent = text;
        document.getElementById("dlg-icon").textContent = icons[kind];
        document.getElementById("dlg-cancel").hidden = kind !== "ask";
        dlg.className = "dlg dlg-" + kind + (extraClass ? " " + extraClass : "");   // extraClass: 이 알림만 따로 꾸밀 때(예: dlg-fit)
        dlg.addEventListener("close", function onClose() {
          dlg.removeEventListener("close", onClose);
          resolve(dlg.returnValue === "ok");
        });
        dlg.returnValue = "cancel";
        dlg.showModal();
      });
    };
    const p = queue.then(run);
    queue = p.catch(function () {});
    return p;
  }

  if (dlg) {
    // 어두운 배경을 눌러도 알림은 닫힌다. 확인 질문은 실수로 닫히지 않게 둔다.
    dlg.addEventListener("click", function (e) {
      if (e.target === dlg && document.getElementById("dlg-cancel").hidden) dlg.close("ok");
    });
  }

  // ---- 분 단위 숫자 칸: 위아래 화살표 대신 [−] 숫자 [+] ----
  // data-stepper 가 붙은 숫자 칸 양옆에 버튼을 붙인다. 한 번에 1분, 0 아래로는 내려가지 않는다.
  // 입력칸을 DOM 에서 가장 앞에 두어(눈에 보이는 순서만 CSS 로 바꿈) 라벨을 눌러도 입력칸이 선택된다.
  document.querySelectorAll("input[data-stepper]").forEach(function (input) {
    const wrap = el("div", { class: "stepper" });
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    function step(delta) {
      const now = Number(input.value);
      const base = input.value === "" || !isFinite(now) ? 0 : Math.round(now);
      input.value = String(Math.max(0, base + delta));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const minus = el("button", { type: "button", class: "ghost step-btn step-minus", text: "−", "aria-label": "1분 줄이기", tabindex: "-1" });
    const plus = el("button", { type: "button", class: "ghost step-btn step-plus", text: "+", "aria-label": "1분 늘리기", tabindex: "-1" });
    minus.addEventListener("click", function () { step(-1); });
    plus.addEventListener("click", function () { step(1); });
    wrap.appendChild(minus);
    wrap.appendChild(plus);
  });

  // ---- 선택 상자: 브라우저 기본 목록 대신 화면 스타일에 맞는 목록 ----
  // 기본 <select> 는 그대로 두되 화면에서는 숨기고(값·change 이벤트·폼 전송은 그대로 그 select 가 맡는다),
  // 그 자리에 버튼을 두어 누르면 바로 아래에 픽셀 스타일 목록이 열린다.
  // 목록은 열려 있는 창(<dialog>) 안에 붙인다. 창 밖(body)에 붙이면 창 뒤에 가려진다.
  let current = null;   // 지금 열려 있는 팝업(선택 목록 또는 달력) 하나. 서로 겹쳐 열리지 않게 같이 쓴다.

  // 창(<dialog>)의 애니메이션 때문에 fixed 기준점이 화면이 아니라 창으로 잡힐 수 있다.
  // 놓은 뒤 실제 위치를 재서, 어긋난 만큼 되돌려 원하는 자리(wantLeft, wantTop)에 맞춘다.
  function settle(node, wantLeft, wantTop) {
    const got = node.getBoundingClientRect();
    if (Math.abs(got.left - wantLeft) > 0.5) node.style.left = (wantLeft - (got.left - wantLeft)) + "px";
    if (Math.abs(got.top - wantTop) > 0.5) node.style.top = (wantTop - (got.top - wantTop)) + "px";
  }
  (function () {
    const valueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
    const indexDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "selectedIndex");

    function closeCurrent(refocus) { if (current) current.close(refocus); }
    document.addEventListener("mousedown", function (e) {
      if (current && !current.contains(e.target)) current.close(false);
    }, true);
    window.addEventListener("resize", function () { closeCurrent(false); });
    window.addEventListener("scroll", function (e) {
      if (current && !current.contains(e.target)) current.close(false);
    }, { capture: true, passive: true });

    function enhance(select) {
      const btn = el("button", { type: "button", class: "dd-btn", "aria-haspopup": "listbox", "aria-expanded": "false" });
      const list = el("ul", { class: "dd-list", role: "listbox", tabindex: "-1" });
      list.hidden = true;
      if (select.id) list.setAttribute("data-for", select.id);   // 목록마다 따로 꾸밀 수 있게(예: 할 일의 계획 선택)
      select.parentNode.insertBefore(btn, select);
      select.classList.add("dd-native");
      select.tabIndex = -1;

      function refresh() {
        const o = select.options[select.selectedIndex];
        btn.textContent = o && o.text ? o.text : "\u00a0";
        btn.disabled = select.disabled;
      }
      // 코드에서 select.value = "..." 로 값을 바꿔도 버튼 글자가 따라오게 한다.
      Object.defineProperty(select, "value", {
        configurable: true,
        get: function () { return valueDesc.get.call(select); },
        set: function (v) { valueDesc.set.call(select, v); refresh(); }
      });
      Object.defineProperty(select, "selectedIndex", {
        configurable: true,
        get: function () { return indexDesc.get.call(select); },
        set: function (v) { indexDesc.set.call(select, v); refresh(); }
      });
      new MutationObserver(refresh).observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
      if (select.form) select.form.addEventListener("reset", function () { setTimeout(refresh, 0); });
      select.addEventListener("change", refresh);

      const state = {
        contains: function (n) { return list.contains(n) || btn.contains(n); },
        close: function (refocus) {
          list.hidden = true;
          if (list.parentNode) list.parentNode.removeChild(list);
          btn.setAttribute("aria-expanded", "false");
          if (current === state) current = null;
          if (refocus) btn.focus();
        }
      };

      function place() {
        const r = btn.getBoundingClientRect();
        const room = 12;
        const below = window.innerHeight - r.bottom - room;
        const above = r.top - room;
        const openDown = list.scrollHeight <= below || below >= above;
        list.style.width = r.width + "px";
        list.style.left = r.left + "px";
        list.style.maxHeight = Math.max(80, Math.min(280, openDown ? below : above)) + "px";
        const wantTop = openDown ? r.bottom + 6 : Math.max(room, r.top - 6 - list.offsetHeight);
        list.style.top = wantTop + "px";
        settle(list, r.left, wantTop);   // 버튼 바로 아래(또는 위)에 맞춘다
      }

      function open() {
        if (select.disabled) return;
        closeCurrent(false);
        list.textContent = "";
        Array.prototype.forEach.call(select.options, function (o, i) {
          const li = el("li", { role: "option", tabindex: "-1", class: "dd-opt", "aria-selected": String(i === select.selectedIndex) });
          li.textContent = o.text;
          if (o.disabled) li.setAttribute("aria-disabled", "true");
          li.addEventListener("click", function (e) { e.preventDefault(); if (!o.disabled) choose(i); });
          list.appendChild(li);
        });
        (select.closest("dialog") || document.body).appendChild(list);
        list.hidden = false;
        place();
        btn.setAttribute("aria-expanded", "true");
        current = state;
        const cur = list.children[select.selectedIndex] || list.firstChild;
        if (cur) cur.focus();
      }

      function choose(i) {
        if (select.selectedIndex !== i) {
          indexDesc.set.call(select, i);
          select.dispatchEvent(new Event("input", { bubbles: true }));
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
        refresh();
        state.close(true);
      }

      function move(from, step) {
        let n = from;
        do { n = n[step > 0 ? "nextElementSibling" : "previousElementSibling"]; } while (n && n.getAttribute("aria-disabled") === "true");
        return n;
      }

      btn.addEventListener("click", function (e) {
        e.preventDefault();
        if (current === state) state.close(false); else open();
      });
      btn.addEventListener("keydown", function (e) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); open(); }
        else if (e.key === "Escape" && current === state) { e.preventDefault(); e.stopPropagation(); state.close(false); }
      });
      list.addEventListener("keydown", function (e) {
        const li = document.activeElement && document.activeElement.closest ? document.activeElement.closest(".dd-opt") : null;
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); state.close(true); }
        else if (e.key === "Tab") { state.close(false); }
        else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const n = li ? move(li, e.key === "ArrowDown" ? 1 : -1) : list.firstChild;
          if (n) n.focus();
        } else if (e.key === "Home" || e.key === "End") {
          e.preventDefault();
          const n = e.key === "Home" ? list.firstElementChild : list.lastElementChild;
          if (n) n.focus();
        } else if ((e.key === "Enter" || e.key === " ") && li) {
          e.preventDefault();
          if (li.getAttribute("aria-disabled") !== "true") choose(Array.prototype.indexOf.call(list.children, li));
        }
      });

      refresh();
    }

    document.querySelectorAll("select").forEach(enhance);
  })();

  // ---- 날짜 칸: 연도는 4자리까지 ----
  // 브라우저 기본 날짜 칸은 연도를 5~6자리까지 받는다. 범위를 1000~9999년으로 정하고,
  // 5자리 이상이 입력되면 앞 4자리만 남긴다. (이 줄은 tasks.js 보다 먼저 읽혀서, 그쪽 계산도 고친 값을 쓴다)
  document.querySelectorAll('input[type="date"], input[type="datetime-local"]').forEach(function (input) {
    const withTime = input.type === "datetime-local";
    input.min = withTime ? "1000-01-01T00:00" : "1000-01-01";
    input.max = withTime ? "9999-12-31T23:59" : "9999-12-31";
    input.addEventListener("input", function () {
      const m = /^(\d{5,})(-.*)$/.exec(input.value);
      if (m) input.value = m[1].slice(0, 4) + m[2];
    });

    // 숫자 칸([−][+])과 같은 틀로 감싸고, 기본 달력 아이콘 대신 같은 모양의 픽셀 버튼을 오른쪽에 둔다.
    const wrap = el("div", { class: "stepper datebox" });
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const cal = el("button", { type: "button", class: "ghost step-btn cal-btn", "aria-label": "달력 열기", tabindex: "-1" });
    cal.addEventListener("click", function () {
      if (withTime) {   // 날짜+시간 칸은 시간 고르기가 있어 브라우저 기본 달력을 그대로 쓴다.
        if (typeof input.showPicker === "function") {
          try { input.showPicker(); return; } catch (e) { /* 아래에서 입력 칸에 포커스만 준다 */ }
        }
        input.focus();
      } else if (current && current.owner === cal) {
        current.close(false);
      } else {
        openCalendar(input, wrap, cal);
      }
    });
    wrap.appendChild(cal);
  });

  // ---- 달력: 브라우저 기본 달력 대신 화면 스타일에 맞는 달력 ----
  // 날짜(date) 칸 전용. 값·change 이벤트는 그 input 이 그대로 맡고, 달력은 고른 날짜를 넣어 줄 뿐이다.
  // 선택 목록과 같이, 열려 있는 창(<dialog>) 안에 붙이고 버튼 바로 아래에 놓는다.
  const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
  const MIN_ISO = "1000-01-01";
  const MAX_ISO = "9999-12-31";
  function pad(n, w) { return String(n).padStart(w || 2, "0"); }
  function isoOf(o) { return pad(o.y, 4) + "-" + pad(o.m + 1) + "-" + pad(o.d); }
  function parseISO(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || "");
    return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
  }
  function addDays(o, n) {
    const t = new Date(Date.UTC(o.y, o.m, o.d + n));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() };
  }
  function addMonths(o, n) {   // 달을 옮길 때 31일 → 30일뿐인 달이면 그 달 마지막 날로 맞춘다
    const t = new Date(Date.UTC(o.y, o.m + n, 1));
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: Math.min(o.d, last) };
  }

  function openCalendar(input, wrap, calBtn) {
    if (current) current.close(false);
    const today = parseISO(todayKST());
    let focus = parseISO(input.value) || today;
    if (isoOf(focus) < MIN_ISO) focus = parseISO(MIN_ISO);
    if (isoOf(focus) > MAX_ISO) focus = parseISO(MAX_ISO);

    const box = el("div", { class: "cal", role: "dialog", "aria-label": "달력" });
    const state = {
      owner: calBtn,
      contains: function (n) { return box.contains(n) || calBtn.contains(n); },
      close: function (refocus) {
        if (box.parentNode) box.parentNode.removeChild(box);
        if (current === state) current = null;
        if (refocus) input.focus();
      }
    };

    function pick(iso) {
      input.value = iso;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      state.close(true);
    }
    function move(next) {
      const iso = isoOf(next);
      if (iso < MIN_ISO || iso > MAX_ISO) return;
      focus = next;
      render(true);
    }

    function navBtn(text, label, months) {
      const b = el("button", { type: "button", class: "ghost cal-nav", text: text, "aria-label": label });
      b.addEventListener("click", function () { move(addMonths(focus, months)); });
      return b;
    }

    function render(keepFocus) {
      box.textContent = "";
      box.appendChild(el("div", { class: "cal-head" }, [
        navBtn("«", "이전 해", -12), navBtn("‹", "이전 달", -1),
        el("span", { class: "cal-title", text: focus.y + "년 " + (focus.m + 1) + "월" }),
        navBtn("›", "다음 달", 1), navBtn("»", "다음 해", 12)
      ]));

      const grid = el("div", { class: "cal-grid", role: "grid" });
      WEEK.forEach(function (w) { grid.appendChild(el("span", { class: "cal-wd", text: w })); });
      const first = { y: focus.y, m: focus.m, d: 1 };
      const start = addDays(first, -new Date(Date.UTC(focus.y, focus.m, 1)).getUTCDay());
      const sel = input.value;
      const todayIso = todayKST();
      const focusIso = isoOf(focus);
      let focusBtn = null;
      for (let i = 0; i < 42; i++) {
        const day = addDays(start, i);
        const iso = isoOf(day);
        const cls = "cal-day" + (day.m !== focus.m ? " out" : "") + (iso === todayIso ? " today" : "") + (iso === sel ? " sel" : "");
        const b = el("button", { type: "button", class: cls, text: String(day.d), tabindex: iso === focusIso ? "0" : "-1", "data-iso": iso, "aria-label": day.y + "년 " + (day.m + 1) + "월 " + day.d + "일" });
        if (iso === sel) b.setAttribute("aria-pressed", "true");
        if (iso < MIN_ISO || iso > MAX_ISO) b.disabled = true;
        if (iso === focusIso) focusBtn = b;
        grid.appendChild(b);
      }
      grid.addEventListener("click", function (e) {   // 날짜 42칸에 따로 달지 않고 칸 전체에서 한 번에 받는다
        const day = e.target.closest ? e.target.closest(".cal-day") : null;
        if (day && !day.disabled) pick(day.getAttribute("data-iso"));
      });
      box.appendChild(grid);

      const foot = el("div", { class: "cal-foot" });
      if (!input.required) {
        const clear = el("button", { type: "button", class: "ghost", text: "삭제" });
        clear.addEventListener("click", function () { pick(""); });
        foot.appendChild(clear);
      }
      const now = el("button", { type: "button", class: "ghost", text: "오늘" });
      now.style.marginLeft = "auto";   // 삭제 버튼이 없을 때도 오른쪽에 둔다
      now.addEventListener("click", function () { pick(todayKST()); });
      foot.appendChild(now);
      box.appendChild(foot);

      if (keepFocus && focusBtn) focusBtn.focus();
    }

    box.addEventListener("keydown", function (e) {
      const onDay = document.activeElement && document.activeElement.classList.contains("cal-day");
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); state.close(true); return; }
      if (e.key === "Tab") { state.close(false); return; }
      if (!onDay) return;
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      if (step) { e.preventDefault(); move(addDays(focus, step)); }
      else if (e.key === "PageUp" || e.key === "PageDown") { e.preventDefault(); move(addMonths(focus, e.key === "PageUp" ? -1 : 1)); }
    });

    render(false);
    (input.closest("dialog") || document.body).appendChild(box);
    current = state;

    // 위치: 날짜 칸 바로 아래. 아래 공간이 모자라면 위. 창(<dialog>)이 기준점이 되어 어긋나면 되돌린다.
    const r = wrap.getBoundingClientRect();
    const w = Math.min(216, window.innerWidth - 16);   // 브라우저 기본 달력과 같은 폭
    const wantLeft = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const h = box.offsetHeight;
    const wantTop = window.innerHeight - r.bottom - 12 >= h || r.top < h + 12 ? r.bottom + 6 : r.top - 6 - h;
    box.style.width = w + "px";
    box.style.left = wantLeft + "px";
    box.style.top = wantTop + "px";
    settle(box, wantLeft, wantTop);

    const f = box.querySelector('.cal-day[tabindex="0"]');
    if (f) f.focus();
  }

  // ---- 기본값용 "오늘"·"지금" (모두 서울 시간 기준) ----
  const seoulParted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  });
  function seoulParts(date) {
    const parts = {};
    seoulParted.formatToParts(date).forEach(function (p) { parts[p.type] = p.value; });
    return parts;
  }
  function todayKST() {
    const p = seoulParts(new Date());
    return p.year + "-" + p.month + "-" + p.day;
  }
  function nowKST() {
    const p = seoulParts(new Date());
    return p.year + "-" + p.month + "-" + p.day + "T" + p.hour + ":" + p.minute;
  }
  // 시작일을 고르면 종료일이 비었거나 시작일보다 빠를 때 시작일과 같은 날로 맞춘다.
  function keepEndAfterStart(startInput, endInput) {
    startInput.addEventListener("change", function () {
      if (startInput.value && (!endInput.value || endInput.value < startInput.value)) {
        endInput.value = startInput.value;
      }
    });
  }

  // "2026-10-12" → 1970-01-01 부터 지난 날 수
  function dayNumber(iso) { const p = iso.split("-"); return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / 86400000; }

  // 칸 막대(계획·할 일 목록 공용): total 칸을 가로로 나누어 선으로 가르고, 앞에서부터 green 칸은 초록, 이어서 gray 칸은 회색, 나머지는 흰색.
  // 칸이 너무 많으면(MAX_CELLS 초과) 선 없이 비율만큼만 칠한다. total 이 0 이면 빈 막대.
  const MAX_CELLS = 40;
  function cellBar(o) {
    const bar = el("div", { class: "pl-bar", "aria-hidden": "true" });
    const total = o.total;
    if (total <= 0) return bar;
    const green = Math.min(total, o.green);
    const gray = Math.min(total - green, o.gray);
    if (total <= MAX_CELLS) {
      for (let i = 0; i < total; i++) {
        bar.appendChild(el("span", { class: "pl-cell" + (i < green ? " ok" : (i < green + gray ? " bad" : "")) }));
      }
    } else {
      bar.classList.add("solid");
      bar.appendChild(el("span", { class: "pl-fill ok", style: "left:0;width:" + (green / total * 100) + "%" }));
      bar.appendChild(el("span", { class: "pl-fill bad", style: "left:" + (green / total * 100) + "%;width:" + (gray / total * 100) + "%" }));
    }
    return bar;
  }

  // 목록/달력(그림/달력) 보기 선택을 브라우저에 기억한다. 저장이 막혀 있어도 화면은 동작한다.
  function viewStore(key) {
    return {
      get: function () { try { return window.localStorage.getItem(key); } catch (e) { return null; } },
      set: function (v) { try { window.localStorage.setItem(key, v); } catch (e) { /* 저장이 막혀 있어도 화면은 동작 */ } }
    };
  }

  // 마감·종료일까지 남은 날(서울 오늘 기준). 남았으면 D-3, 오늘이면 D-Day, 지났으면 D+2.
  function ddayText(endDate, today) {
    const left = dayNumber(endDate) - dayNumber(today);
    if (left > 0) return "D-" + left;
    if (left === 0) return "D-Day";
    return "D+" + (-left);
  }

  // 할 일 한 줄(할 일 탭 목록·돌아보기 근거 목록 공용)의 머리: li 클래스, 네모칸(완료 = 체크, 진행 중 = 우선순위 색, 마감 지남 = ✕), 마감일 + D-day.
  // late: 진행 중인데 마감일이 지남(서울 오늘 기준). 완료한 할 일은 D-day 를 보여 주지 않는다.
  function taskRowHead(task, today) {
    const done = task.status === "done";
    const late = !done && !!task.due_date && task.due_date < today;
    const dateLine = [document.createTextNode(task.due_date ? "마감일 " + task.due_date : "마감일 없음")];
    if (!done && task.due_date) {
      dateLine.push(el("span", { class: "pl-dday", text: ddayText(task.due_date, today), title: "마감일까지 남은 날" }));
    }
    return {
      late: late,
      cls: "pl-item" + (done ? " done" : (late ? " late" : "")) + " pri-" + task.priority,
      dot: el("span", { class: "pl-dot", title: done ? "완료" : (late ? "마감일이 지났는데 못 했어요" : "진행 중"), "aria-hidden": "true" }),
      date: el("div", { class: "pl-date" }, dateLine)
    };
  }

  window.PDS_UTIL = {
    cellBar: cellBar,
    viewStore: viewStore,
    reduceMotion: function () { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); },
    todayKST: todayKST,
    nowKST: nowKST,
    dayNumber: dayNumber,
    ddayText: ddayText,
    taskRowHead: taskRowHead,
    keepEndAfterStart: keepEndAfterStart,
    notify: function (text, title) { return showDialog(text, "ok", title); },
    warn: function (text, title, extraClass) { return showDialog(text, "warn", title, extraClass); },
    confirmBox: function (text, title) { return showDialog(text, "ask", title); },
    el: el,
    formatSeoul: function (iso) { return seoulTime.format(new Date(iso)); },
    PRIORITY_LABEL: { 1: "높음", 2: "중간", 3: "낮음" }
  };
})();
