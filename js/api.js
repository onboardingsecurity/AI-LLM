// Supabase(PostgREST) 통신. 외부 라이브러리 없이 fetch 만 쓴다.
(function () {
  const BASE = window.PDS_CONFIG.SUPABASE_URL + "/rest/v1/";
  const KEY = window.PDS_CONFIG.SUPABASE_PUBLISHABLE_KEY;

  async function request(path, options) {
    const opts = options || {};
    const headers = { apikey: KEY };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.prefer) headers.Prefer = opts.prefer;

    let res;
    try {
      res = await fetch(BASE + path, {
        method: opts.method || "GET",
        headers: headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
      });
    } catch (e) {
      throw new Error("서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.");
    }

    if (!res.ok) {
      let code = "";
      let message = "";
      try {
        const body = await res.json();
        code = body.code || "";
        message = body.message || "";
      } catch (e) { /* 본문 없음 */ }
      if (code === "23514") {
        throw new Error("입력값이 규칙에 맞지 않습니다. 글자 수·날짜·숫자 범위를 확인해 주세요.");
      }
      if (code === "23505") {
        throw new Error("이미 처리된 요청입니다. 새로고침해서 확인해 주세요.");
      }
      // 우리가 DB 함수에서 직접 쓴 한국어 안내(raise exception)만 그대로 보여 준다.
      if (code === "P0001" && message) {
        throw new Error(message);
      }
      throw new Error("저장하거나 불러오지 못했습니다. (오류 " + res.status + ")");
    }
    return res.status === 204 ? null : res.json();
  }

  const PLAN_FIELDS = ["title", "start_date", "end_date", "priority", "success_criteria", "estimated_minutes"];

  function pick(plan) {
    const out = {};
    PLAN_FIELDS.forEach(function (k) { out[k] = plan[k]; });
    return out;
  }

  window.PDS_API = {
    listPlans: function () {
      return request("plans?select=*&order=id.asc");
    },
    createPlan: function (plan) {
      return request("plans", { method: "POST", body: pick(plan), prefer: "return=representation" })
        .then(function (rows) { return rows[0]; });
    },
    updatePlan: function (id, plan) {
      return request("plans?id=eq." + encodeURIComponent(id), {
        method: "PATCH", body: pick(plan), prefer: "return=representation"
      }).then(function (rows) { return rows[0]; });
    },
    listRevisions: function (planId) {
      return request("plan_revisions?select=*&plan_id=eq." + encodeURIComponent(planId) + "&order=version.asc");
    },

    // ---- 할 일 (카드 2) ----
    // 검색·거르기·정렬은 서버(DB)에서 한다. f: { status, priority, q, tag, order }
    listTasks: function (planId, f) {
      const params = [
        "select=*,executions(*)",
        "plan_id=eq." + encodeURIComponent(planId),
        "deleted_at=is.null",
        "executions.status=eq.active"
      ];
      if (f.status) params.push("status=eq." + encodeURIComponent(f.status));
      if (f.priority) params.push("priority=eq." + encodeURIComponent(f.priority));
      if (f.q) {
        const safe = f.q.replace(/\*/g, "").replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
        params.push("title=ilike." + encodeURIComponent("*" + safe + "*"));
      }
      if (f.tag) params.push("tags=cs." + encodeURIComponent('{"' + f.tag + '"}'));
      params.push("order=" + f.order);
      return request("tasks?" + params.join("&"));
    },
    createTask: function (task) {
      return request("tasks", {
        method: "POST",
        body: {
          plan_id: task.plan_id, title: task.title, due_date: task.due_date, priority: task.priority,
          tags: task.tags, estimated_minutes: task.estimated_minutes
        },
        prefer: "return=representation"
      }).then(function (rows) { return rows[0]; });
    },
    updateTask: function (id, task) {
      return request("tasks?id=eq." + encodeURIComponent(id), {
        method: "PATCH",
        body: {
          title: task.title, due_date: task.due_date, priority: task.priority,
          tags: task.tags, estimated_minutes: task.estimated_minutes
        },
        prefer: "return=representation"
      }).then(function (rows) { return rows[0]; });
    },
    // 지우기: 행을 없애지 않고 지운 시각만 적는다(소프트 삭제). 돌아보기 집계에서 빠진다.
    deleteTask: function (id) {
      return request("tasks?id=eq." + encodeURIComponent(id), {
        method: "PATCH", body: { deleted_at: new Date().toISOString() }, prefer: "return=minimal"
      });
    },
    completeTask: function (a) {
      return request("rpc/complete_task", {
        method: "POST",
        body: {
          p_task_id: a.taskId, p_request_key: a.requestKey,
          p_started_at: a.startedAt, p_ended_at: a.endedAt,
          p_actual_minutes: a.actualMinutes, p_blocked_reason: a.blockedReason
        }
      });
    },
    reopenTask: function (id) {
      return request("rpc/reopen_task", { method: "POST", body: { p_task_id: id } });
    },

    // ---- 내보내기 (카드 5) ---- 정해 둔 표만 읽는다.
    exportTable: function (name) {
      const allowed = ["plans", "plan_revisions", "tasks", "executions", "retrospectives"];
      if (allowed.indexOf(name) < 0) return Promise.reject(new Error("내보낼 수 없는 표입니다."));
      return request(name + "?select=*&order=id.asc");
    },

    // ---- 돌아보기 (카드 4) ----
    // 집계와 "숫자를 눌러 가는 목록"은 DB의 같은 함수에서 나온다.
    reviewSummary: function (planId, from, to) {
      return request("rpc/review_summary", {
        method: "POST", body: { p_plan_id: planId, p_from: from, p_to: to }
      }).then(function (rows) { return rows[0]; });
    },
    reviewTasks: function (planId, from, to, metric) {
      return request("rpc/review_tasks", {
        method: "POST", body: { p_plan_id: planId, p_from: from, p_to: to, p_metric: metric }
      });
    },
    listActiveExecutions: function (taskIds) {
      if (!taskIds.length) return Promise.resolve([]);
      return request("executions?select=*&status=eq.active&task_id=in.(" +
        taskIds.map(function (n) { return encodeURIComponent(n); }).join(",") + ")");
    },
    handOver: function (a) {
      return request("rpc/hand_over_improvement", {
        method: "POST",
        body: {
          p_plan_id: a.planId, p_period_start: a.periodStart, p_period_end: a.periodEnd,
          p_improvement: a.improvement, p_next_title: a.nextTitle,
          p_next_start: a.nextStart, p_next_end: a.nextEnd, p_next_priority: a.nextPriority,
          p_next_success: a.nextSuccess, p_next_minutes: a.nextMinutes
        }
      });
    },
    listRetrospectives: function (planId) {
      return request("retrospectives?select=*&plan_id=eq." + encodeURIComponent(planId) + "&order=id.asc");
    }
  };
})();
