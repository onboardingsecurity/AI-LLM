import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { createStore } from './store.js';
// 파일로 읽지 않고 가져와서, Vercel이 함수 묶음에 이 자료를 확실히 넣게 한다 (public/ 밖이라 주소로는 열리지 않는다)
import privateJson from './data/private-data.json' with { type: 'json' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ---------- 설정 (배포 주소가 정해지면 환경변수로만 바꾼다) ---------- */
const ON_VERCEL = !!process.env.VERCEL;
const PORT = Number(process.env.PORT) || 3000;
const ORIGIN = process.env.ORIGIN || `http://localhost:${PORT}`;
const RP_ID = process.env.RP_ID || new URL(ORIGIN).hostname;
const RP_NAME = '연결 프로필';
const IS_HTTPS = ORIGIN.startsWith('https://');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const LOG_FILE = process.env.LOG_FILE || path.join(__dirname, 'logs', 'auth-log.jsonl');
const PUBLIC_DIR = path.join(__dirname, 'public');

const CHALLENGE_TTL_MS = 2 * 60 * 1000;
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 5 * 60 * 1000;

const privateData = privateJson.accounts;

/* ---------- 저장소: 로컬은 파일·메모리, 배포(Supabase 키가 있을 때)는 Supabase ---------- */
const store = await createStore({ dataDir: DATA_DIR, sessionTtlMs: SESSION_TTL_MS, failureWindowMs: FAILURE_WINDOW_MS, onVercel: ON_VERCEL });

// 서버가 여러 번 켜지고 꺼지는 환경에서는 실행마다 바뀌는 값이 쓸모없다. 반드시 환경변수로 고정해야 한다
if (store.kind === 'supabase') {
  if (!process.env.SESSION_SECRET) throw new Error('SESSION_SECRET 환경변수가 필요합니다.');
  if (!process.env.SETUP_CODE) throw new Error('SETUP_CODE 환경변수가 필요합니다.');
}

function publicView(p, currentId) {
  return {
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    lastUsedAt: p.lastUsedAt,
    deviceType: p.deviceType,
    backedUp: p.backedUp,
    current: p.id === currentId,
  };
}

/* ---------- 첫 등록 보호용 일회용 설정 코드 ---------- */
const FIXED_SETUP_CODE = process.env.SETUP_CODE || null;
let setupCode = FIXED_SETUP_CODE || newSetupCode();

function newSetupCode() {
  const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/* ---------- 질문(challenge): 저장소에 보관하고, 한 번 꺼내면 폐기한다 ---------- */
// 세션에는 질문의 값(식별용)만 두고, 종류·계정 같은 내용은 저장소에 둔다.
async function takeChallenge(req, type) {
  const value = req.session.challengeId;
  delete req.session.challengeId;
  if (!value) return { error: 'challenge_missing' };
  // 같은 질문이 동시에 두 번 도착해도 저장소가 한 번만 내준다
  const row = await store.takeChallenge(value);
  if (!row) return { error: 'challenge_already_used' };
  if (row.type !== type) return { error: 'challenge_missing' };
  if (Date.now() > row.expiresAt) return { error: 'challenge_expired' };
  return { challenge: { value, ...row.data } };
}

async function storeChallenge(req, type, value, fields) {
  await store.putChallenge(value, type, fields, Date.now() + CHALLENGE_TTL_MS);
  req.session.challengeId = value;
}

/* ---------- 기록: 세션·토큰·설정 코드 값은 가려서 남긴다 ---------- */
const SECRET_KEYS = /^(setupcode|token|authorization|password)$/i;

function maskCookieHeader(value) {
  return String(value).replace(/\bsid=[^;,]*/g, 'sid=***masked***');
}

function maskDeep(value) {
  if (Array.isArray(value)) return value.map(maskDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [
      k,
      SECRET_KEYS.test(k) ? '***masked***' : maskDeep(v),
    ]));
  }
  return value;
}

function auditLog(req, res, resBody) {
  const setCookie = res.getHeader('set-cookie');
  const entry = {
    time: new Date().toISOString(),
    request: {
      method: req.method,
      url: req.originalUrl,
      cookie: req.get('cookie') ? maskCookieHeader(req.get('cookie')) : null,
      body: maskDeep(req.body ?? null),
    },
    response: {
      status: res.statusCode,
      setCookie: setCookie ? [].concat(setCookie).map(maskCookieHeader) : null,
      body: maskDeep(resBody ?? null),
    },
  };
  // 서버리스는 파일을 남길 수 없다. 값을 가린 같은 기록을 호스팅 로그(표준 출력)로 보낸다
  if (ON_VERCEL) {
    console.log(JSON.stringify({ audit: entry }));
    return;
  }
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
}

/* ---------- 앱 ---------- */
const app = express();
if (IS_HTTPS) app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(express.json({ limit: '100kb' }));
app.use(session({
  name: 'sid',
  store: store.sessionStore, // 배포: Supabase 세션 테이블 / 로컬: 기본(메모리)
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: IS_HTTPS, maxAge: SESSION_TTL_MS },
}));

app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  // 다른 사이트에서 보낸 상태 변경 요청 차단
  const origin = req.get('origin');
  if (req.method !== 'GET' && origin && origin !== ORIGIN) {
    return res.status(403).json({ error: 'bad_origin' });
  }
  const json = res.json.bind(res);
  res.json = (body) => {
    const out = json(body);
    auditLog(req, res, body);
    return out;
  };
  next();
});

/* 공개 영역: 소개 페이지와 그 스크립트만 내려 준다 (폴더 전체를 열지 않는다)
   Vercel에서는 public/ 의 같은 두 파일을 CDN이 먼저 내려 주므로, 아래 두 줄은 내 컴퓨터에서만 쓰인다. */
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.get('/auth.js', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'auth.js')));

/* ---------- 세션 확인 ---------- */
// 로그인 뒤 무엇으로 사람을 알아보는가: 서버 쪽 세션(저장소에 보관) + httpOnly 쿠키(sid)
async function currentAccount(req) {
  const { accountId, passkeyId } = req.session;
  if (!accountId) return null;
  // 로그인에 쓴 패스키가 지워졌다면 그 세션도 더는 인정하지 않는다
  const found = await store.findCredential(passkeyId);
  if (!found || found.accountId !== accountId) return null;
  return { id: accountId, label: privateData[accountId].label, passkeyId };
}

async function requireLogin(req, res, next) {
  const account = await currentAccount(req);
  if (!account) {
    if (req.session.accountId) req.session.destroy(() => {});
    return res.status(401).json({ error: 'login_required' });
  }
  req.account = account;
  next();
}

app.get('/api/accounts', (req, res) => {
  res.json({ accounts: Object.entries(privateData).map(([id, a]) => ({ id, label: a.label })) });
});

app.get('/api/session', async (req, res) => {
  const account = await currentAccount(req);
  res.json({ loggedIn: !!account, account: account && { id: account.id, label: account.label } });
});

/* ---------- ① 등록 ---------- */
app.post('/api/register/options', async (req, res) => {
  const { account: accountId, name, setupCode: code } = req.body ?? {};
  if (!privateData[accountId]) return res.status(400).json({ error: 'unknown_account' });
  const label = typeof name === 'string' ? name.trim() : '';
  if (label.length < 1 || label.length > 30) return res.status(400).json({ error: 'name_required' });

  const existing = await store.passkeysOf(accountId);
  let firstRegistration = false;
  if (existing.length > 0) {
    // 패스키가 이미 있는 계정은, 그 계정으로 로그인한 사람만 추가할 수 있다
    const me = await currentAccount(req);
    if (!me) return res.status(401).json({ error: 'login_required' });
    if (me.id !== accountId) return res.status(403).json({ error: 'forbidden' });
  } else {
    const key = `setup:${req.ip}`;
    if (await store.isBlocked(key, MAX_FAILURES)) return res.status(429).json({ error: 'too_many_attempts' });
    if (typeof code !== 'string' || !safeEqual(code, setupCode)) {
      await store.recordFailure(key);
      return res.status(403).json({ error: 'bad_setup_code' });
    }
    firstRegistration = true;
  }

  const userHandle = (await store.userHandleOf(accountId)) ?? crypto.randomBytes(32).toString('base64url');
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: accountId,
    userDisplayName: privateData[accountId].label,
    userID: Buffer.from(userHandle, 'base64url'),
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    timeout: 60_000,
  });
  await storeChallenge(req, 'register', options.challenge, { account: accountId, name: label, userHandle, firstRegistration });
  res.json(options);
});

app.post('/api/register/verify', async (req, res) => {
  const taken = await takeChallenge(req, 'register');
  if (taken.error) return res.status(400).json({ error: taken.error });
  const c = taken.challenge;

  const existing = await store.passkeysOf(c.account);
  if (existing.length > 0) {
    const me = await currentAccount(req);
    if (!me || me.id !== c.account) return res.status(403).json({ error: 'forbidden' });
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: req.body?.response,
      expectedChallenge: c.value,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });
  } catch {
    return res.status(400).json({ error: 'registration_invalid' });
  }
  if (!verification.verified) return res.status(400).json({ error: 'registration_invalid' });

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  if (await store.findCredential(credential.id)) return res.status(409).json({ error: 'already_registered' });

  // 저장하는 값: 공개키(COSE)·식별자·이름·횟수 카운터. 비밀번호도 개인키도 아니다.
  const saved = {
    id: credential.id,
    name: c.name,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: credential.transports ?? [],
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
  await store.addPasskey(c.account, c.userHandle, saved);
  if (c.firstRegistration && !FIXED_SETUP_CODE) {
    setupCode = newSetupCode();
    console.log(`새 설정 코드: ${setupCode}`);
  }
  res.json({ ok: true, passkey: publicView(saved), storedPublicKey: saved.publicKey });
});

app.post('/api/register/cancel', async (req, res) => {
  const value = req.session.challengeId;
  delete req.session.challengeId;
  if (value) await store.takeChallenge(value); // 받아 둔 질문도 함께 폐기
  res.json({ ok: true, saved: false });
});

/* ---------- ② 로그인 ---------- */
app.post('/api/login/options', async (req, res) => {
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: 'required',
    timeout: 60_000,
  });
  await storeChallenge(req, 'login', options.challenge, {});
  res.json(options);
});

app.post('/api/login/verify', async (req, res) => {
  const key = `login:${req.ip}`;
  if (await store.isBlocked(key, MAX_FAILURES)) return res.status(429).json({ error: 'too_many_attempts' });

  const taken = await takeChallenge(req, 'login');
  if (taken.error) {
    await store.recordFailure(key);
    return res.status(401).json({ error: taken.error });
  }
  const response = req.body?.response;
  const found = typeof response?.id === 'string' ? await store.findCredential(response.id) : null;
  if (!found) {
    await store.recordFailure(key);
    return res.status(401).json({ error: 'unknown_credential' });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: taken.challenge.value,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
      credential: {
        id: found.passkey.id,
        publicKey: Buffer.from(found.passkey.publicKey, 'base64url'),
        counter: found.passkey.counter,
        transports: found.passkey.transports,
      },
    });
  } catch {
    await store.recordFailure(key);
    return res.status(401).json({ error: 'signature_invalid' });
  }
  if (!verification.verified) {
    await store.recordFailure(key);
    return res.status(401).json({ error: 'signature_invalid' });
  }

  await store.touchPasskey(found.passkey.id, verification.authenticationInfo.newCounter, new Date().toISOString());

  // 세션 고정 공격 방지: 로그인 성공 시 세션 ID를 새로 발급한다
  await new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
  req.session.accountId = found.accountId;
  req.session.passkeyId = found.passkey.id;
  res.json({ ok: true, account: { id: found.accountId, label: privateData[found.accountId].label } });
});

/* ---------- 로그아웃 ---------- */
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('sid');
    res.json({ ok: true });
  });
});

/* ---------- ③ 비공개 자료 조회: 로그인한 계정의 것만, 계정은 세션에서만 정한다 ---------- */
app.get('/api/private', requireLogin, (req, res) => {
  // 주소(?account=)·본문·헤더에 다른 계정을 적어 보내도 무시한다
  res.json({ account: { id: req.account.id, label: req.account.label }, items: privateData[req.account.id].items });
});

app.get('/api/accounts/:accountId/private', requireLogin, (req, res) => {
  if (req.params.accountId !== req.account.id) return res.status(403).json({ error: 'forbidden' });
  res.json({ account: { id: req.account.id, label: req.account.label }, items: privateData[req.account.id].items });
});

/* ---------- ④ 패스키 목록·삭제 ---------- */
app.get('/api/passkeys', requireLogin, async (req, res) => {
  const list = await store.passkeysOf(req.account.id);
  res.json({ passkeys: list.map((p) => publicView(p, req.account.passkeyId)) });
});

app.delete('/api/passkeys/:id', requireLogin, async (req, res) => {
  // 내 계정 목록에 없으면 404(남의 패스키는 존재 여부도 알려 주지 않음), 마지막 하나면 409
  const result = await store.deletePasskey(req.account.id, req.params.id);
  if (result.status === 'not_found') return res.status(404).json({ error: 'not_found' });
  if (result.status === 'last_passkey') return res.status(409).json({ error: 'last_passkey' });
  res.json({ ok: true, remaining: result.remaining });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json' });
  // 본문 크기 한도(100KB) 초과는 보낸 쪽의 문제이므로 서버 오류(500)가 아니라 413
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'payload_too_large' });
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

// Vercel은 내보낸 앱을 직접 실행한다. 내 컴퓨터에서만 포트를 연다.
if (!ON_VERCEL) {
  app.listen(PORT, () => {
    console.log(`서버 시작: ${ORIGIN} (rpID: ${RP_ID}, 저장소: ${store.kind})`);
    // 환경변수로 고정한 코드는 값을 찍지 않는다(호스팅 로그에 남지 않게)
    console.log(FIXED_SETUP_CODE
      ? '첫 등록용 설정 코드: 환경변수 SETUP_CODE 로 고정됨'
      : `첫 등록용 설정 코드: ${setupCode} (등록 한 번마다 새로 바뀜)`);
  });
}

export default app;
