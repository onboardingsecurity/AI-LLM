// 큰 분류 탭(계획 · 할 일 · 돌아보기). 선택한 탭은 주소 끝(#plan, #do, #see)에 남겨서 같은 탭을 바로 열 수 있다.
(function () {
  const tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
  if (!tabs.length) return;

  function select(tab, focus) {
    tabs.forEach(function (t) {
      const on = t === tab;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
    if (focus) tab.focus();
    try { history.replaceState(null, "", "#" + tab.id.replace("tab-", "")); } catch (e) { /* 주소를 바꿀 수 없어도 탭은 동작한다 */ }
  }

  tabs.forEach(function (tab, i) {
    tab.addEventListener("click", function () { select(tab, false); });
    tab.addEventListener("keydown", function (e) {
      let next = null;
      if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
      else if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === "Home") next = tabs[0];
      else if (e.key === "End") next = tabs[tabs.length - 1];
      if (next) { e.preventDefault(); select(next, true); }
    });
  });

  const wanted = document.getElementById("tab-" + location.hash.replace("#", ""));
  select(wanted && tabs.indexOf(wanted) >= 0 ? wanted : tabs[0], false);
})();
