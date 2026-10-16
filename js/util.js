// 여러 화면이 같이 쓰는 도우미. 사용자가 입력한 글자는 항상 textContent 로만 넣는다.
(function () {
  const seoulTime = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
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

  function showDialog(text, kind) {
    const run = function () {
      return new Promise(function (resolve) {
        if (!dlg || typeof dlg.showModal !== "function") {
          resolve(kind === "ask" ? window.confirm(text) : (window.alert(text), true));
          return;
        }
        const titles = { ok: "완료", warn: "알림", ask: "확인" };
        const icons = { ok: "\u2713", warn: "!", ask: "?" };
        document.getElementById("dlg-title").textContent = titles[kind];
        document.getElementById("dlg-text").textContent = text;
        document.getElementById("dlg-icon").textContent = icons[kind];
        document.getElementById("dlg-cancel").hidden = kind !== "ask";
        dlg.className = "dlg dlg-" + kind;
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
  });

  // ---- 기본값용 "오늘"·"지금" (모두 서울 시간 기준) ----
  function seoulParts(date) {
    const parts = {};
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(date).forEach(function (p) { parts[p.type] = p.value; });
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
  // 시작일을 고르면 끝나는 날이 비었거나 시작일보다 빠를 때 시작일과 같은 날로 맞춘다.
  function keepEndAfterStart(startInput, endInput) {
    startInput.addEventListener("change", function () {
      if (startInput.value && (!endInput.value || endInput.value < startInput.value)) {
        endInput.value = startInput.value;
      }
    });
  }

  window.PDS_UTIL = {
    todayKST: todayKST,
    nowKST: nowKST,
    keepEndAfterStart: keepEndAfterStart,
    notify: function (text) { return showDialog(text, "ok"); },
    warn: function (text) { return showDialog(text, "warn"); },
    confirmBox: function (text) { return showDialog(text, "ask"); },
    el: el,
    formatSeoul: function (iso) { return seoulTime.format(new Date(iso)); },
    PRIORITY_LABEL: { 1: "높음", 2: "중간", 3: "낮음" }
  };
})();
