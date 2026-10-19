// 가입·로그인·로그아웃. 인증 서비스는 Supabase Auth(GoTrue)이고, 라이브러리 없이 fetch 로 직접 부른다.
// 비밀번호는 서버(Supabase)로만 보내고, 이 브라우저에는 저장하지 않는다. (해시는 서버가 bcrypt 로 한다)
// 사람을 알아보는 값: 접근 토큰(JWT, 만료 있음) + 갱신 토큰. 탭을 닫으면 사라지도록 sessionStorage 에만 둔다.
// 이 파일은 로그인이 되기 전에도 실행되는 유일한 앱 코드다. 나머지 앱 코드(js/api.js 등)는 로그인한 뒤에만 불러온다.
(function () {
  const AUTH = window.PDS_CONFIG.SUPABASE_URL + "/auth/v1/";
  const KEY = window.PDS_CONFIG.SUPABASE_PUBLISHABLE_KEY;   // 공개용 키. 비밀 값이 아니다.
  const STORE = "pds-session";
  const MIN_PASSWORD = 8;
  const LOGIN_FAILED = "이메일 또는 비밀번호가 맞지 않습니다.";   // 비밀번호가 틀렸을 때와 없는 이메일일 때 같은 문구
  const APP_SCRIPTS = [
    "js/api.js", "js/cal.js", "js/app.js", "js/tasks.js",
    "js/review.js", "js/export.js", "js/tabs.js", "js/fx.js"
  ];

  let session = readSession();
  let refreshing = null;

  // ---------- 세션 보관 ----------
  function readSession() {
    try {
      const s = JSON.parse(window.sessionStorage.getItem(STORE));
      if (s && s.access_token && s.refresh_token && typeof s.expires_at === "number") return s;
    } catch (e) { /* 저장소를 못 읽으면 로그인 화면으로 간다 */ }
    return null;
  }
  function saveSession(body) {
    session = {
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      expires_at: typeof body.expires_at === "number" ? body.expires_at : Math.floor(Date.now() / 1000) + Number(body.expires_in || 3600),
      user: { id: body.user && body.user.id, email: body.user && body.user.email }
    };
    try { window.sessionStorage.setItem(STORE, JSON.stringify(session)); } catch (e) { /* 저장이 막혀도 이번 화면에서는 동작 */ }
  }
  function clearSession() {
    session = null;
    try { window.sessionStorage.removeItem(STORE); } catch (e) { /* 무시 */ }
  }

  // ---------- 서버 호출 ----------
  async function call(path, body, token) {
    const headers = { apikey: KEY, "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    let res;
    try {
      res = await fetch(AUTH + path, { method: "POST", headers: headers, body: JSON.stringify(body || {}) });
    } catch (e) {
      throw new Error("서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.");
    }
    let json = null;
    try { json = await res.json(); } catch (e) { /* 본문 없음 */ }
    return { ok: res.ok, status: res.status, json: json || {} };
  }

  function signupMessage(r) {
    const code = r.json.error_code || r.json.code || "";
    if (code === "user_already_exists" || code === "email_exists") return "이미 가입된 이메일입니다.";
    if (code === "weak_password") return "비밀번호가 너무 쉽습니다. 더 길거나 복잡하게 만들어 주세요.";
    if (code === "validation_failed" || code === "email_address_invalid") return "이메일 형식을 확인해 주세요.";
    if (r.status === 429) return "요청이 너무 많습니다. 잠시 뒤에 다시 해 주세요.";
    if (code === "signup_disabled") return "지금은 새로 가입할 수 없습니다.";
    return "가입하지 못했습니다. (오류 " + r.status + ")";
  }

  async function signUp(email, password) {
    const r = await call("signup", { email: email, password: password });
    if (!r.ok) throw new Error(signupMessage(r));
    if (!r.json.access_token) throw new Error("가입은 되었지만 이메일 확인이 필요합니다.");
    saveSession(r.json);
  }

  async function logIn(email, password) {
    const r = await call("token?grant_type=password", { email: email, password: password });
    if (r.status === 429) throw new Error("요청이 너무 많습니다. 잠시 뒤에 다시 해 주세요.");
    if (!r.ok) throw new Error(LOGIN_FAILED);   // 400·그 밖의 거절은 모두 같은 문구
    saveSession(r.json);
  }

  // 갱신 토큰으로 새 접근 토큰을 받는다. 동시에 여러 번 불려도 서버 요청은 한 번만 간다.
  function refresh() {
    if (!session) return Promise.resolve(null);
    if (!refreshing) {
      const old = session.refresh_token;
      refreshing = call("token?grant_type=refresh_token", { refresh_token: old }).then(function (r) {
        if (r.ok) { saveSession(r.json); return session; }
        if (r.status === 400 || r.status === 401 || r.status === 403) clearSession();   // 서버가 끊은 세션
        return null;
      }).catch(function () { return null; }).then(function (s) { refreshing = null; return s; });
    }
    return refreshing;
  }

  // 요청에 실을 접근 토큰. 만료 60초 전이면 먼저 갱신한다. 로그인하지 않았으면 null.
  async function getToken() {
    if (!session) return null;
    if (session.expires_at - Math.floor(Date.now() / 1000) < 60) {
      const s = await refresh();
      return s ? s.access_token : null;
    }
    return session.access_token;
  }

  // 서버에서도 세션을 끊고(전체 기기), 이 브라우저의 값도 지운다.
  async function logOut() {
    const token = session && session.access_token;
    if (token) {
      try { await call("logout?scope=global", {}, token); } catch (e) { /* 서버에 닿지 않아도 이 브라우저에서는 끊는다 */ }
    }
    clearSession();
    window.location.reload();
  }

  // 서버가 세션을 더는 받아 주지 않을 때(만료·끊김) 로그인 화면으로 돌아간다.
  function expired() {
    clearSession();
    window.location.reload();
  }

  window.PDS_AUTH = {
    getToken: getToken, refresh: refresh, logOut: logOut, expired: expired,
    user: function () { return session ? session.user : null; }
  };

  // ---------- 화면 ----------
  const view = document.getElementById("auth-view");
  const form = document.getElementById("auth-form");
  const emailIn = document.getElementById("auth-email");
  const passIn = document.getElementById("auth-password");
  const errorEl = document.getElementById("auth-error");
  const submitBtn = document.getElementById("auth-submit");
  const switchBtn = document.getElementById("auth-switch");
  const modeTitle = document.getElementById("auth-mode-title");
  let mode = "login";

  function showError(msg) {
    errorEl.textContent = msg || "";
    errorEl.hidden = !msg;
  }

  function setMode(next) {
    mode = next;
    const signup = mode === "signup";
    modeTitle.textContent = signup ? "가입하기" : "로그인";
    submitBtn.textContent = signup ? "가입하기" : "로그인";
    switchBtn.textContent = signup ? "이미 계정이 있어요. 로그인" : "처음이에요. 가입하기";
    passIn.autocomplete = signup ? "new-password" : "current-password";
    passIn.placeholder = signup ? MIN_PASSWORD + "자 이상 입력해 주세요." : "";
    showError("");
  }

  function loadScripts(i) {
    if (i >= APP_SCRIPTS.length) return;
    const s = document.createElement("script");
    s.src = APP_SCRIPTS[i];
    s.onload = function () { loadScripts(i + 1); };
    s.onerror = function () { showError("화면 파일을 불러오지 못했습니다."); };
    document.body.appendChild(s);
  }

  function showApp() {
    view.hidden = true;
    ["app-top", "app-tabs", "app-board"].forEach(function (id) { document.getElementById(id).hidden = false; });
    const u = session && session.user;
    document.getElementById("user-email").textContent = u && u.email ? u.email : "";
    document.getElementById("logout-btn").addEventListener("click", function () {
      document.getElementById("logout-btn").disabled = true;
      logOut();
    });
    loadScripts(0);
  }

  function showLogin() {
    view.hidden = false;
    setMode("login");
  }

  switchBtn.addEventListener("click", function () { setMode(mode === "login" ? "signup" : "login"); });

  form.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    const email = emailIn.value.trim();
    const password = passIn.value;
    if (!email || !password) { showError("이메일과 비밀번호를 적어 주세요."); return; }
    if (mode === "signup" && password.length < MIN_PASSWORD) {
      showError("비밀번호는 " + MIN_PASSWORD + "자 이상으로 적어 주세요.");
      return;
    }
    showError("");
    submitBtn.disabled = true;
    try {
      if (mode === "signup") await signUp(email, password); else await logIn(email, password);
      passIn.value = "";   // 입력 칸에서도 바로 지운다
      showApp();
    } catch (e) {
      showError(e.message);
    } finally {
      submitBtn.disabled = false;
    }
  });

  // 시작: 로그인 상태(세션이 살아 있음)이면 앱을 열고, 아니면 로그인 화면만 보인다.
  getToken().then(function (token) {
    if (token) showApp(); else showLogin();
  });
})();
