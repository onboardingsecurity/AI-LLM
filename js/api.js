// Supabase(PostgREST) 통신. 외부 라이브러리 없이 fetch 만 쓴다.
(function () {
  const BASE = window.PDS_CONFIG.SUPABASE_URL + "/rest/v1/";
  const KEY = window.PDS_CONFIG.SUPABASE_PUBLISHABLE_KEY;

  // 한 번 보낸다. 로그인한 사람의 접근 토큰을 Authorization 헤더에 싣는다. (주소에는 싣지 않는다)
  async function send(path, opts, token) {
    const headers = { apikey: KEY, Authorization: "Bearer " + token };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.prefer) headers.Prefer = opts.prefer;
    try {
      return await fetch(BASE + path, {
        method: opts.method || "GET",
        headers: headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
      });
    } catch (e) {
      throw new Error("서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.");
    }
  }

  async function request(path, options) {
    const opts = options || {};
    const token = await window.PDS_AUTH.getToken();
    if (!token) { window.PDS_AUTH.expired(); throw new Error("로그인이 필요합니다."); }

    let res = await send(path, opts, token);
    let authProblem = res.status === 401;
    if (res.status === 403) {
      // 다른 기기에서 로그아웃했거나 비밀번호를 바꿔 서버가 세션을 끊은 경우도 같은 길로 간다. (42501 = 로그인 세션 없음)
      try { authProblem = (await res.clone().json()).code === "42501"; } catch (e) { /* 본문 없음 */ }
    }
    if (authProblem) {
      // 접근 토큰이 만료됐거나 세션이 끊겼을 수 있다. 갱신 토큰으로 한 번만 다시 시도하고, 그래도 안 되면 로그인 화면으로 돌아간다.
      const fresh = await window.PDS_AUTH.refresh();
      if (!fresh) { window.PDS_AUTH.expired(); throw new Error("로그인이 만료되었습니다. 다시 로그인해 주세요."); }
      res = await send(path, opts, fresh.access_token);
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
      // PT404 = 내 자료가 아니거나 없는 자료(둘을 구별하지 않는다). 42501 = 권한 없음.
      if ((code === "P0001" || code === "PT404") && message) {
        throw new Error(message);
      }
      if (code === "42501") {
        throw new Error("권한이 없습니다. 다시 로그인해 주세요.");
      }
      throw new Error("저장하거나 불러오지 못했습니다. (오류 " + res.status + ")");
    }
    return res.status === 204 ? null : res.json();
  }

  // 읽기는 표(RLS 가 내 행만 돌려줌), 쓰기는 DB 함수(rpc)로만 한다. 함수가 주인을 확인한다. (supabase/auth-lock.sql)
  // 이쪽에서 user_id 를 보내지 않는다. 주인은 서버가 토큰으로 정한다.
  function planArgs(plan) {
    return {
      p_title: plan.title, p_start_date: plan.start_date, p_end_date: plan.end_date,
      p_priority: plan.priority, p_success_criteria: plan.success_criteria,
      p_estimated_minutes: plan.estimated_minutes
    };
  }

  window.PDS_API = {
    listPlans: function () {
      return request("plans?select=*&order=id.asc");
    },
    createPlan: function (plan) {
      return request("rpc/create_plan", { method: "POST", body: planArgs(plan) });
    },
    updatePlan: function (id, plan) {
      return request("rpc/update_plan", { method: "POST", body: Object.assign({ p_id: id }, planArgs(plan)) });
    },
    listRevisions: function (planId) {
      return request("rpc/plan_revisions_of", { method: "POST", body: { p_plan_id: planId } });
    },

    // ---- 할 일 (카드 2) ----
    // 검색·거르기·정렬은 서버(DB)에서 한다. f: { status, priority, q, tag, order }
    // 계획 목록의 칸 막대용: 지워지지 않은 모든 할 일의 계획 번호·상태·마감일만 가져온다.
    listTaskBrief: function () {
      return request("tasks?select=plan_id,status,due_date&deleted_at=is.null");
    },
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
      return request("rpc/create_task", {
        method: "POST",
        body: {
          p_plan_id: task.plan_id, p_title: task.title, p_due_date: task.due_date, p_priority: task.priority,
          p_tags: task.tags, p_estimated_minutes: task.estimated_minutes
        }
      });
    },
    updateTask: function (id, task) {
      return request("rpc/update_task", {
        method: "POST",
        body: {
          p_id: id, p_title: task.title, p_due_date: task.due_date, p_priority: task.priority,
          p_tags: task.tags, p_estimated_minutes: task.estimated_minutes
        }
      });
    },
    // 지우기: 행을 없애지 않고 지운 시각만 적는다(소프트 삭제). 돌아보기 집계에서 빠진다. (시각은 서버가 정한다)
    deleteTask: function (id) {
      return request("rpc/delete_task", { method: "POST", body: { p_id: id } });
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
      const allowed = ["plans", "plan_revisions", "tasks", "executions", "retrospectives", "experiments", "rule_changes"];
      if (allowed.indexOf(name) < 0) return Promise.reject(new Error("내보낼 수 없는 표입니다."));
      return request(name + "?select=*&order=id.asc");
    },

    // ---- 돌아보기 (카드 4) ----
    // 집계와 "숫자를 눌러 가는 목록"은 DB의 같은 함수에서 나온다.
    // 기간 제한 없이 그 계획에 딸린 할 일 전체를 센다(DB 함수의 기간 인자는 비워 둔다).
    reviewSummary: function (planId) {
      return request("rpc/review_summary", {
        method: "POST", body: { p_plan_id: planId, p_from: null, p_to: null }
      }).then(function (rows) { return rows[0]; });
    },
    reviewTasks: function (planId, metric) {
      return request("rpc/review_tasks", {
        method: "POST", body: { p_plan_id: planId, p_from: null, p_to: null, p_metric: metric }
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
    },

    // ---- 5일 측정 (7번 카드 5, supabase/five-day.sql) ----
    // 하루 값·합계·평균·전후 비교는 모두 DB 함수 experiment_report 가 계산해서 준다. 시각은 서버가 찍는다.
    experimentReport: function () {
      return request("rpc/experiment_report", { method: "POST", body: {} });
    },
    startExperiment: function (question, planRule) {
      return request("rpc/start_experiment", { method: "POST", body: { p_question: question, p_plan_rule: planRule } });
    },
    changeRule: function (ruleAfter, reason) {
      return request("rpc/change_rule", { method: "POST", body: { p_rule_after: ruleAfter, p_reason: reason } });
    }
  };
})();
