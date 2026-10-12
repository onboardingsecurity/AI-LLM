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

  window.PDS_UTIL = {
    el: el,
    formatSeoul: function (iso) { return seoulTime.format(new Date(iso)); },
    PRIORITY_LABEL: { 1: "1 · 높음", 2: "2 · 보통", 3: "3 · 낮음" }
  };
})();
