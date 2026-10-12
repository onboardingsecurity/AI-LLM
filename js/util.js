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

  window.PDS_UTIL = {
    notify: function (text) { return showDialog(text, "ok"); },
    warn: function (text) { return showDialog(text, "warn"); },
    confirmBox: function (text) { return showDialog(text, "ask"); },
    el: el,
    formatSeoul: function (iso) { return seoulTime.format(new Date(iso)); },
    PRIORITY_LABEL: { 1: "1 · 높음", 2: "2 · 보통", 3: "3 · 낮음" }
  };
})();
