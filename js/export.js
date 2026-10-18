// 내 자료 전체를 파일 하나(JSON)로 내려받는다. 서버 DB의 값을 그대로 담는다.
(function () {
  const api = window.PDS_API;
  const notify = window.PDS_UTIL.notify;
  const warn = window.PDS_UTIL.warn;
  const btn = document.getElementById("export-btn");
  const msg = document.getElementById("export-msg");

  const TABLES = ["plans", "plan_revisions", "tasks", "executions", "retrospectives"];

  function stamp(d) {
    function p(n) { return String(n).padStart(2, "0"); }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
  }

  btn.addEventListener("click", async function () {
    btn.disabled = true;
    msg.textContent = "불러오는 중…";
    try {
      const results = await Promise.all(TABLES.map(function (t) { return api.exportTable(t); }));
      const tables = {};
      const counts = {};
      TABLES.forEach(function (t, i) { tables[t] = results[i]; counts[t] = results[i].length; });

      const now = new Date();
      const data = {
        schema_version: "pds-schema-v2",
        exported_at: now.toISOString(),
        rules: {
          timestamps: "UTC ISO 8601 (화면에서는 Asia/Seoul 로 보여 줌)",
          dates: "YYYY-MM-DD, 서울 기준 날짜",
          minutes: "모든 시간 값은 분 단위 정수",
          priority: "1=높음, 2=중간, 3=낮음",
          deleted_tasks: "deleted_at 이 있는 할 일은 지운 것 (집계에서 제외)",
          canceled_executions: "status=canceled 인 실행 기록은 되돌린 것 (집계에서 제외)"
        },
        counts: counts,
        tables: tables
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "plan-do-see-" + stamp(now) + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      msg.textContent = "";
      notify("내려받기를 완료했습니다.");
    } catch (e) {
      msg.textContent = "";
      warn(e.message);
    } finally {
      btn.disabled = false;
    }
  });
})();
