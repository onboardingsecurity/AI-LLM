/* 나만의 자리: 패스키 등록·로그인·로그아웃·비공개 자료 조회 (브라우저 쪽)
   개인키는 기기 안에서만 쓰이고, 서버로는 공개키와 서명만 보낸다. */
(function(){
  'use strict';

  var $ = function(id){ return document.getElementById(id); };
  var lockedEl = $('private-locked');
  var openEl = $('private-open');
  var statusEl = $('auth-status');

  var MESSAGES = {
    login_required: '로그인이 필요합니다.',
    forbidden: '이 계정으로는 할 수 없는 요청입니다.',
    bad_setup_code: '설정 코드가 올바르지 않습니다.',
    too_many_attempts: '시도가 너무 많습니다. 잠시 뒤에 다시 해 주세요.',
    name_required: '패스키 이름을 1~30자로 적어 주세요.',
    unknown_account: '알 수 없는 계정입니다.',
    challenge_missing: '로그인 질문이 없습니다. 처음부터 다시 시도해 주세요.',
    challenge_expired: '질문이 만료되었습니다. 처음부터 다시 시도해 주세요.',
    challenge_already_used: '이미 사용한 질문입니다. 처음부터 다시 시도해 주세요.',
    unknown_credential: '서버에 등록되어 있지 않은 패스키입니다.',
    signature_invalid: '서명을 확인하지 못했습니다.',
    registration_invalid: '등록 정보를 확인하지 못했습니다.',
    already_registered: '이미 등록된 패스키입니다.',
    last_passkey: '마지막 패스키는 지울 수 없습니다. 먼저 다른 패스키를 하나 더 등록하세요.',
    not_found: '찾을 수 없습니다.',
    bad_origin: '허용되지 않은 출처의 요청입니다.'
  };

  function say(text){ statusEl.textContent = text || ''; }

  function errorText(res){
    var code = res.data && res.data.error;
    return MESSAGES[code] || ('요청에 실패했습니다. (' + res.status + ')');
  }

  async function api(method, url, body){
    var res = await fetch(url, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin'
    });
    var data = null;
    try{ data = await res.json(); }catch(e){}
    return { ok: res.ok, status: res.status, data: data };
  }

  /* ---------- base64url <-> ArrayBuffer ---------- */
  function toBuffer(b64url){
    var s = b64url.replace(/-/g, '+').replace(/_/g, '/');
    s += '='.repeat((4 - s.length % 4) % 4);
    var bin = atob(s);
    var bytes = new Uint8Array(bin.length);
    for(var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  function toB64url(buffer){
    var bytes = new Uint8Array(buffer);
    var bin = '';
    for(var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function creationOptionsFromJSON(json){
    var opts = Object.assign({}, json);
    opts.challenge = toBuffer(json.challenge);
    opts.user = Object.assign({}, json.user, { id: toBuffer(json.user.id) });
    opts.excludeCredentials = (json.excludeCredentials || []).map(function(c){
      return Object.assign({}, c, { id: toBuffer(c.id) });
    });
    return opts;
  }

  function requestOptionsFromJSON(json){
    var opts = Object.assign({}, json);
    opts.challenge = toBuffer(json.challenge);
    opts.allowCredentials = (json.allowCredentials || []).map(function(c){
      return Object.assign({}, c, { id: toBuffer(c.id) });
    });
    return opts;
  }

  function registrationToJSON(cred){
    return {
      id: cred.id,
      rawId: toB64url(cred.rawId),
      type: cred.type,
      authenticatorAttachment: cred.authenticatorAttachment || undefined,
      clientExtensionResults: cred.getClientExtensionResults(),
      response: {
        clientDataJSON: toB64url(cred.response.clientDataJSON),
        attestationObject: toB64url(cred.response.attestationObject),
        transports: cred.response.getTransports ? cred.response.getTransports() : []
      }
    };
  }

  function assertionToJSON(cred){
    var r = cred.response;
    return {
      id: cred.id,
      rawId: toB64url(cred.rawId),
      type: cred.type,
      authenticatorAttachment: cred.authenticatorAttachment || undefined,
      clientExtensionResults: cred.getClientExtensionResults(),
      response: {
        clientDataJSON: toB64url(r.clientDataJSON),
        authenticatorData: toB64url(r.authenticatorData),
        signature: toB64url(r.signature),
        userHandle: r.userHandle ? toB64url(r.userHandle) : undefined
      }
    };
  }

  function supported(){
    if(window.PublicKeyCredential && navigator.credentials) return true;
    say('이 브라우저나 기기는 패스키를 지원하지 않습니다. 최신 Chrome·Safari·Edge에서 열어 주세요.');
    return false;
  }

  /* ---------- 화면 전환 ---------- */
  // 로그아웃·잠금 상태에서는 받아 둔 비공개 내용을 화면에서도 지운다
  function showLocked(){
    openEl.hidden = true; $('add-form').reset();
    lockedEl.hidden = false;
    $('private-items').textContent = '';
    $('passkey-list').textContent = '';
    relayout();
  }

  function showOpen(account){
    lockedEl.hidden = true;
    openEl.hidden = false;
    $('private-who').textContent = '🔓 ' + account.label + '으로 들어와 있습니다';
    relayout();
  }

  // 섹션 높이가 바뀌면 밧줄 위치 계산도 다시 하도록 알린다
  function relayout(){ window.dispatchEvent(new Event('resize')); }

  /* ---------- 비공개 자료·패스키 목록 그리기 (textContent만 사용) ---------- */
  function renderItems(items){
    var box = $('private-items');
    box.textContent = '';
    items.forEach(function(it){
      var card = document.createElement('div');
      card.className = 'private-item';
      var kind = document.createElement('div');
      kind.className = 'item-id mono';
      kind.textContent = it.kind;
      var title = document.createElement('div');
      title.className = 'item-title';
      title.textContent = it.title;
      var body = document.createElement('p');
      body.className = 'item-desc';
      body.textContent = it.body;
      card.append(kind, title, body);
      box.appendChild(card);
    });
  }

  function formatDate(iso){
    return iso ? new Date(iso).toLocaleString('ko-KR') : '아직 없음';
  }

  function renderPasskeys(list){
    var ul = $('passkey-list');
    ul.textContent = '';
    list.forEach(function(p){
      var li = document.createElement('li');
      li.className = 'passkey-row';

      var info = document.createElement('div');
      var name = document.createElement('span');
      name.className = 'passkey-name';
      name.textContent = p.name;
      info.appendChild(name);
      if(p.current){
        var cur = document.createElement('span');
        cur.className = 'passkey-current';
        cur.textContent = '지금 로그인에 사용 중';
        info.appendChild(cur);
      }
      var meta = document.createElement('div');
      meta.className = 'passkey-meta';
      meta.textContent = '등록한 날짜 ' + formatDate(p.createdAt) + ' · 마지막 사용 ' + formatDate(p.lastUsedAt);
      info.appendChild(meta);

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'auth-btn auth-btn-quiet';
      del.textContent = '삭제';
      del.disabled = list.length <= 1;
      del.addEventListener('click', function(){ removePasskey(p); });

      li.append(info, del);
      ul.appendChild(li);
    });
    $('passkey-note').textContent = list.length <= 1
      ? '패스키가 하나뿐이라 지울 수 없습니다. 지우면 이 자리에 들어올 방법이 없어지기 때문입니다. 먼저 하나 더 등록하세요.'
      : '패스키가 ' + list.length + '개 있습니다. 하나를 지워도 나머지로 들어올 수 있습니다.';
  }

  async function refresh(){
    var s = await api('GET', '/api/session');
    if(!s.data || !s.data.loggedIn){ showLocked(); return; }
    var priv = await api('GET', '/api/private');
    var keys = await api('GET', '/api/passkeys');
    if(!priv.ok || !keys.ok){ showLocked(); say(errorText(priv.ok ? keys : priv)); return; }
    renderItems(priv.data.items);
    renderPasskeys(keys.data.passkeys);
    showOpen(priv.data.account);
  }

  /* ---------- ① 등록 ---------- */
  async function registerPasskey(fields){
    if(!supported()) return false;
    var opt = await api('POST', '/api/register/options', fields);
    if(!opt.ok){ if(opt.data && opt.data.error === 'login_required'){ say(''); alert('이미 패스키가 존재합니다. 로그인 후 시도해주세요.'); } else say(errorText(opt)); return false; }

    var cred;
    try{
      cred = await navigator.credentials.create({ publicKey: creationOptionsFromJSON(opt.data) });
    }catch(e){
      await api('POST', '/api/register/cancel');
      if(e && e.name === 'InvalidStateError'){ var dup = '이미 패스키가 존재합니다. 다른 기기나 보안 키로 등록해 보세요.'; say(dup); alert(dup); }
      else if(e && e.name === 'NotAllowedError') say('패스키 등록을 취소했습니다. 서버에는 아무것도 저장되지 않았습니다.');
      else say('패스키를 만들지 못했습니다. 서버에는 아무것도 저장되지 않았습니다.');
      return false;
    }

    var done = await api('POST', '/api/register/verify', { response: registrationToJSON(cred) });
    if(!done.ok){ say(errorText(done)); return false; }
    say('패스키 "' + done.data.passkey.name + '"을(를) 등록했습니다. 서버에는 공개키만 저장되었습니다.');
    return true;
  }

  $('register-form').addEventListener('submit', async function(ev){
    ev.preventDefault();
    var ok = await registerPasskey({
      account: $('reg-account').value,
      name: $('reg-name').value,
      setupCode: $('reg-code').value
    });
    if(ok){
      $('register-form').reset();
      $('register-details').open = false;
      say('패스키를 등록했습니다. 이제 "패스키로 들어가기"를 눌러 주세요.');
    }
  });

  $('add-form').addEventListener('submit', async function(ev){
    ev.preventDefault();
    var s = await api('GET', '/api/session');
    if(!s.data || !s.data.loggedIn){ say(MESSAGES.login_required); return; }
    var ok = await registerPasskey({ account: s.data.account.id, name: $('add-name').value });
    $('add-form').reset(); if(ok){ await refresh(); }
  });

  /* ---------- ② 로그인 ---------- */
  $('btn-login').addEventListener('click', async function(){
    if(!supported()) return;
    say('');
    var now = await api('GET', '/api/session');
    if(now.data && now.data.loggedIn){ await refresh(); return; }
    var opt = await api('POST', '/api/login/options');
    if(!opt.ok){ say(errorText(opt)); return; }

    var cred;
    try{
      cred = await navigator.credentials.get({ publicKey: requestOptionsFromJSON(opt.data) });
    }catch(e){
      say(e && e.name === 'NotAllowedError' ? '' : '패스키로 들어가지 못했습니다.');
      return;
    }

    var done = await api('POST', '/api/login/verify', { response: assertionToJSON(cred) });
    if(!done.ok){ say(errorText(done)); if(done.data && done.data.error === 'unknown_credential') alert(errorText(done)); return; }
    var okMsg = '로그인되었습니다.'; say('');
    await refresh();
    alert(okMsg); $('private-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ---------- 로그아웃 ---------- */
  $('btn-logout').addEventListener('click', async function(){
    await api('POST', '/api/logout');
    showLocked();
    var byeMsg = '정상적으로 로그아웃되었습니다.'; say(''); alert(byeMsg);
  });

  /* ---------- ④ 패스키 삭제 ---------- */
  async function removePasskey(p){
    if(!(await window.askConfirm('삭제 시 해당 패스키로는 더 이상 들어올 수 없습니다. 삭제하시겠습니까?', '삭제'))) return;
    var res = await api('DELETE', '/api/passkeys/' + encodeURIComponent(p.id));
    if(!res.ok){ say(errorText(res)); return; }
    say(p.name + ' 패스키를 삭제했습니다. 남은 패스키: ' + res.data.remaining + '개');
    await refresh();
  }

  /* ---------- 시작 ---------- */
  (async function init(){
    var accounts = await api('GET', '/api/accounts');
    var select = $('reg-account');
    ((accounts.data && accounts.data.accounts) || []).forEach(function(a){
      var o = document.createElement('option');
      o.value = a.id;
      o.textContent = a.label;
      select.appendChild(o);
    });
    await refresh();
  })();
})();

/* ---------- 알림·확인 창: 브라우저 기본 팝업 대신 이 페이지의 모양으로 ---------- */
(function(){
  var style = document.createElement('style');
  style.textContent = [
    '.pk-dialog-back{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(4,12,32,0.6);backdrop-filter:blur(3px);animation:pk-fade .15s ease-out}',
    '.pk-dialog{box-sizing:border-box;width:min(420px,100%);background:rgba(8,20,48,0.96);border:2px dashed var(--accent-warm,#f2a65a);border-radius:14px;padding:20px 22px;color:var(--text,#fff);font-family:inherit;box-shadow:0 18px 48px rgba(0,0,0,0.45);animation:pk-pop .18s ease-out}',
    '.pk-dialog-title{margin:0 0 8px;font-size:13px;font-weight:700;color:var(--accent,#4fd8c4)}',
    '.pk-dialog-msg{margin:0;font-size:16px;font-weight:700;line-height:1.55;word-break:keep-all;white-space:pre-line}',
    '.pk-dialog-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}',
    '.pk-dialog-actions .auth-btn{min-width:72px}',
    '.pk-dialog-actions .pk-warn{background:var(--accent-warm,#f2a65a)}',
    '@keyframes pk-fade{from{opacity:0}to{opacity:1}}',
    '@keyframes pk-pop{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}',
    '@media (prefers-reduced-motion:reduce){.pk-dialog-back,.pk-dialog{animation:none}}'
  ].join('');
  document.head.appendChild(style);

  var queue = [], busy = false;

  function el(tag, cls, text){
    var n = document.createElement(tag);
    n.className = cls;
    if(text != null) n.textContent = text;
    return n;
  }

  function show(kind, message, okLabel, done){
    queue.push({ kind: kind, message: String(message), okLabel: okLabel, done: done });
    if(!busy) next();
  }

  function next(){
    var job = queue.shift();
    if(!job){ busy = false; return; }
    busy = true;
    var isConfirm = job.kind === 'confirm';
    var before = document.activeElement;

    var back = el('div', 'pk-dialog-back');
    var box = el('div', 'pk-dialog');
    box.setAttribute('role', isConfirm ? 'alertdialog' : 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'pk-dialog-title');
    box.setAttribute('aria-describedby', 'pk-dialog-msg');
    var title = el('p', 'pk-dialog-title', isConfirm ? '🔑 확인' : '🔒 알림');
    title.id = 'pk-dialog-title';
    var msg = el('p', 'pk-dialog-msg', job.message);
    msg.id = 'pk-dialog-msg';
    var actions = el('div', 'pk-dialog-actions');
    var ok = el('button', 'auth-btn' + (isConfirm ? ' pk-warn' : ''), job.okLabel || '확인');
    ok.type = 'button';
    var cancel = null;
    if(isConfirm){
      cancel = el('button', 'auth-btn auth-btn-quiet', '취소');
      cancel.type = 'button';
      actions.appendChild(cancel);
    }
    actions.appendChild(ok);
    box.appendChild(title);
    box.appendChild(msg);
    box.appendChild(actions);
    back.appendChild(box);
    document.body.appendChild(back);

    function close(result){
      document.removeEventListener('keydown', onKey, true);
      back.remove();
      if(before && before.focus) before.focus();
      job.done(result);
      next();
    }
    function onKey(e){
      if(e.key === 'Escape'){ e.preventDefault(); close(false); return; }
      if(e.key !== 'Tab') return;
      e.preventDefault();
      if(!cancel) return;
      (document.activeElement === cancel ? ok : cancel).focus();
    }
    ok.addEventListener('click', function(){ close(true); });
    if(cancel) cancel.addEventListener('click', function(){ close(false); });
    back.addEventListener('click', function(e){ if(e.target === back) close(false); });
    document.addEventListener('keydown', onKey, true);
    // 확인 창은 실수로 지우지 않도록 "취소"에 먼저 초점을 둔다
    (cancel || ok).focus();
  }

  // 기존 alert(...) 호출은 그대로 두고, 이 페이지에서만 같은 모양의 창으로 바꾼다
  window.alert = function(message){ show('alert', message, '확인', function(){}); };
  window.askConfirm = function(message, okLabel){
    return new Promise(function(resolve){ show('confirm', message, okLabel, resolve); });
  };
})();
