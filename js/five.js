// 5일 측정 화면 (7번 카드 5). 하루 값·합계·평균·전후 비교는 모두 DB 함수 experiment_report 가 계산한 값이고,
// 이 파일은 그 값을 그대로 보여 주기만 한다. (다시 계산하지 않는다. 사용자가 입력한 글자는 항상 textContent 로만 넣는다.)
(function () {
  const api = window.PDS_API;
  const el = window.PDS_UTIL.el;
  const formatSeoul = window.PDS_UTIL.formatSeoul;
  const notify = window.PDS_UTIL.notify;
  const warn = window.PDS_UTIL.warn;
  const confirmBox = window.PDS_UTIL.confirmBox;

  const body = document.getElementById("five-body");
  const statusEl = document.getElementById("five-status");

  // 고정 화면에 처음 채워 두는 글자. 사용자가 고쳐서 고정할 수 있다.
  const DEFAULT_QUESTION = "할 일을 더 잘게 쪼개 계획하면, 예상 시간과 실제 시간의 차이가 줄어드는가?";
  const DEFAULT_RULE_A = "할 일 하나의 크기에 제한 없이 계획한다.";

  let seq = 0;

  function setStatus(msg) { statusEl.textContent = msg || ""; statusEl.hidden = !msg; }
  function num(n) { return n === null || n === undefined ? "-" : String(n); }

  // 표: heads 는 [{ label, num }], rows 는 [{ cells: [글자 또는 노드], off: true 면 흐리게 }]
  function table(heads, rows) {
    const thead = el("thead", null, [el("tr", null, heads.map(function (h) {
      return el("th", { class: h.num ? "num" : "", text: h.label });
    }))]);
    const tbody = el("tbody", null, rows.map(function (r) {
      return el("tr", { class: r.off ? "off" : "" }, r.cells.map(function (c, i) {
        const td = el("td", { class: heads[i].num ? "num" : "" });
        if (c instanceof Node) td.appendChild(c); else td.textContent = c;
        return td;
      }));
    }));
    return el("div", { class: "five-table-wrap" }, [el("table", { class: "five-table" }, [thead, tbody])]);
  }

  function section(title, children) {
    return el("div", { class: "five-sec" }, [el("h3", { text: title })].concat(children));
  }
  function note(t) { return el("p", { class: "five-note", text: t }); }

  // 고정한 값(또는 고정할 값)의 항목·내용 표
  function fixedTable(src) {
    return table([{ label: "항목" }, { label: "내용" }], [
      { cells: ["지표", src.metric_label] },
      { cells: ["단위", src.unit] },
      { cells: ["세는 기록", src.eligibility_rule] },
      { cells: ["값이 빠졌을 때", src.missing_rule] },
      { cells: ["값이 중복될 때", src.duplicate_rule] },
      { cells: ["값이 유난히 튈 때", src.outlier_rule] },
      { cells: ["반올림", src.rounding_rule] },
      { cells: ["주 시작 요일", src.week_start] }
    ]);
  }

  function field(label, input) { return el("label", { text: label }, [input]); }
  function textarea(value, max, rows) {
    const t = el("textarea", { rows: String(rows || 2), maxlength: String(max) });
    t.value = value;
    return t;
  }

  // ---------- 시작 전: 질문·계획 규칙을 정하고 고정한다 ----------
  function renderIntro(report) {
    const q = textarea(DEFAULT_QUESTION, 200, 2);
    const rule = textarea(DEFAULT_RULE_A, 200, 2);
    const err = el("p", { class: "error", role: "alert", hidden: "" });
    const submit = el("button", { type: "submit", text: "고정하고 1일차 시작" });
    const form = el("form", { class: "five-form", novalidate: "" }, [
      field("1일차에 답하려는 질문 한 문장", q),
      field("1·2일차에 쓰는 계획 규칙(규칙 A)", rule),
      err,
      el("div", { class: "actions" }, [submit])
    ]);
    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      err.hidden = true;
      if (!q.value.trim() || !rule.value.trim()) { err.textContent = "질문과 계획 규칙을 모두 적어 주세요."; err.hidden = false; return; }
      const ok = await confirmBox("고정하면 질문·계획 규칙·지표·단위·처리 규칙을 바꿀 수 없습니다. 지금부터 입력하는 기록만 측정에 셉니다. 고정할까요?",
        "5일 측정 고정", { ok: "고정", cancel: "취소", safe: true });
      if (!ok) return;
      submit.disabled = true;
      try {
        await api.startExperiment(q.value, rule.value);
        await notify("고정했습니다. 지금부터 입력한 기록이 1일차로 셈됩니다.", "5일 측정");
        load();
      } catch (e) {
        submit.disabled = false;
        err.textContent = e.message; err.hidden = false;
      }
    });
    body.textContent = "";
    body.appendChild(note("서로 다른 날짜 5일 동안 그날 한 일을 그날 기록하고, 3일차 기록 전에 계획 규칙을 하나만 바꿔서 전후를 같은 지표로 비교합니다. 아래 값은 고정한 뒤에는 바꿀 수 없습니다."));
    body.appendChild(section("고정할 질문과 계획 규칙", [form]));
    body.appendChild(section("고정되는 지표·단위·처리 규칙", [fixedTable(report.defaults)]));
  }

  // ---------- 고정한 뒤 ----------
  function renderRunning(r) {
    const x = r.experiment;
    body.textContent = "";

    body.appendChild(section("고정한 값", [
      table([{ label: "항목" }, { label: "내용" }], [
        { cells: ["질문", x.question] },
        { cells: ["계획 규칙(규칙 A)", x.plan_rule_a] },
        { cells: ["고정한 시각(서울)", formatSeoul(x.started_at)] }
      ]),
      fixedTable(x)
    ]));

    // 일차별 결과 + 합계·평균
    const days = r.days.map(function (d) {
      return { cells: [d.day_no + "일차", d.date, String(d.count), String(d.value), "규칙 " + d.rule, d.outlier ? "튀는 날" : ""] };
    });
    if (r.days.length) {
      days.push({ cells: ["합계", "", "", String(r.summary.total), "", ""] });
      days.push({ cells: ["일 평균", "", "", num(r.summary.avg), "", "기록 있는 날 " + r.summary.days + "일 기준"] });
    }
    const dayBlock = [];
    if (r.days.length) {
      dayBlock.push(table([{ label: "일차" }, { label: "날짜(서울)" }, { label: "기록 수", num: true }, { label: "값(분)", num: true },
        { label: "규칙" }, { label: "표시" }], days));
    } else {
      dayBlock.push(note("아직 측정에 세는 기록이 없습니다. 할 일 탭에서 일을 끝내고 [완료]로 기록하면 여기에 나옵니다."));
    }
    dayBlock.push(note("기록 있는 날 " + r.summary.days + "일 / 5일. 기록이 없는 날은 표에 나오지 않고 평균에서 뺍니다."
      + (r.canceled_count ? " 되돌린 기록 " + r.canceled_count + "건은 뺐습니다." : "")));
    body.appendChild(section("일차별 결과 (" + x.metric_label + ", 단위 " + x.unit + ")", dayBlock));

    // 일차별 기록 상세: 손으로 더해 보는 용도
    const detail = r.rows.map(function (e) {
      return {
        off: !e.counted,
        cells: [e.day_no ? e.day_no + "일차" : "-", e.task_title, String(e.estimated_minutes), String(e.actual_minutes), String(e.gap),
          formatSeoul(e.created_at), e.counted ? "센다" : "안 센다: " + (e.reason || "")]
      };
    });
    body.appendChild(section("기록 상세 (손으로 더해 확인하는 용)", [
      r.rows.length
        ? table([{ label: "일차" }, { label: "할 일" }, { label: "예상(분)", num: true }, { label: "실제(분)", num: true },
            { label: "차이(분)", num: true }, { label: "입력 시각(서울)" }, { label: "측정에" }], detail)
        : note("고정한 뒤에 입력한 실행 기록이 아직 없습니다."),
      note("차이(분) = |실제 − 예상|. 그날 '센다' 기록의 차이를 더하면 위 일차별 값과 같습니다.")
    ]));

    // 규칙 바꾸기
    const changeBlock = [];
    if (r.change) {
      const c = r.change;
      changeBlock.push(table([{ label: "항목" }, { label: "내용" }], [
        { cells: ["바꾼 시각(서울)", formatSeoul(c.changed_at)] },
        { cells: ["바꾸기 전 규칙(A)", c.rule_before] },
        { cells: ["바꾼 규칙(B)", c.rule_after] },
        { cells: ["바꾼 이유", c.reason] },
        { cells: ["1일차 기록", c.day1_date + " · 기록 번호 " + c.day1_execution_ids.join(", ")] },
        { cells: ["2일차 기록", c.day2_date + " · 기록 번호 " + c.day2_execution_ids.join(", ")] }
      ]));
      changeBlock.push(note("2일차 기록 뒤, 3일차 기록 앞에서 바꿨습니다. 규칙은 한 번만 바꿀 수 있습니다."));
    } else if (r.can_change) {
      changeBlock.push(note(r.change_hint));
      const after = textarea("", 200, 2);
      const why = textarea("", 300, 2);
      const err = el("p", { class: "error", role: "alert", hidden: "" });
      const submit = el("button", { type: "submit", text: "규칙 바꾸기" });
      const form = el("form", { class: "five-form", novalidate: "" }, [
        field("바꿀 규칙(규칙 B) — 하나만", after), field("바꾸는 이유", why), err, el("div", { class: "actions" }, [submit])
      ]);
      form.addEventListener("submit", async function (ev) {
        ev.preventDefault();
        err.hidden = true;
        if (!after.value.trim() || !why.value.trim()) { err.textContent = "바꿀 규칙과 이유를 모두 적어 주세요."; err.hidden = false; return; }
        const ok = await confirmBox("규칙은 한 번만 바꿀 수 있고, 바꾼 시각이 기록되며 되돌릴 수 없습니다. 바꿀까요?", "계획 규칙 바꾸기", { ok: "바꾸기", cancel: "취소", safe: true });
        if (!ok) return;
        submit.disabled = true;
        try {
          await api.changeRule(after.value, why.value);
          await notify("규칙을 바꿨습니다. 이제부터 입력하는 기록은 규칙 B로 셉니다.", "5일 측정");
          load();
        } catch (e) {
          submit.disabled = false;
          err.textContent = e.message; err.hidden = false;
        }
      });
      changeBlock.push(form);
    } else {
      changeBlock.push(note(r.change_hint));
      changeBlock.push(note("규칙은 2일차 기록이 끝난 뒤, 3일차 기록을 하기 전에 한 번만 바꿀 수 있습니다."));
    }
    body.appendChild(section("계획 규칙 바꾸기", changeBlock));

    // 전후 비교: 같은 지표·단위·계산 규칙
    const a = r.compare.A;
    const b = r.compare.B;
    const cmp = [
      table([{ label: "구분" }, { label: "계획 규칙" }, { label: "기록 있는 날", num: true }, { label: "합계(분)", num: true }, { label: "일 평균(분)", num: true }], [
        { cells: ["바꾸기 전 (규칙 A)", x.plan_rule_a, String(a.days), String(a.total), num(a.avg)] },
        { cells: ["바꾼 뒤 (규칙 B)", r.change ? r.change.rule_after : "(아직 안 바꿈)", String(b.days), String(b.total), num(b.avg)] }
      ]),
      note("두 줄 모두 같은 지표(" + x.metric_label + "), 같은 단위(" + x.unit + "), 같은 계산 규칙으로 계산했습니다.")
    ];
    if (a.avg !== null && b.avg !== null) {
      const diff = Math.round((b.avg - a.avg) * 10) / 10;
      cmp.push(note("일 평균 차이(B − A): " + (diff > 0 ? "+" : "") + diff + x.unit + (diff < 0 ? " — 줄었습니다." : diff > 0 ? " — 늘었습니다." : " — 같습니다.")));
    }
    body.appendChild(section("바꾸기 전후 비교", cmp));
  }

  async function load() {
    const my = ++seq;
    setStatus("불러오는 중…");
    try {
      const r = await api.experimentReport();
      if (my !== seq) return;
      setStatus("");
      if (!r.experiment) renderIntro(r); else renderRunning(r);
    } catch (e) {
      if (my !== seq) return;
      body.textContent = "";
      setStatus(e.message);
    }
  }

  document.getElementById("tab-five").addEventListener("click", load);   // 탭을 열 때마다 새로 읽는다(다른 탭에서 기록한 것이 바로 보인다)
  load();
})();
