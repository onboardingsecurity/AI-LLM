// 가상 패스키(소프트웨어 인증기)로 서버를 끝까지 두드려 보는 시험.
// 실제 기기의 패스키 창은 쓰지 않는다. 서버가 요구사항대로 막고 여는지만 확인한다.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3100;
const ORIGIN = `http://localhost:${PORT}`;
const RP_ID = 'localhost';
const SETUP_CODE = 'TEST-CODE';
// 기본: 파일·메모리 저장소로 시험. E2E_STORE=supabase 이면 실제 Supabase 테이블로 같은 시험을 한다.
// 이때 시험 시작 전에 네 테이블의 모든 행을 지우므로, 연습용 프로젝트에만 쓰고 E2E_ALLOW_WIPE=yes 를 직접 붙여야 한다.
const USE_SUPABASE = process.env.E2E_STORE === 'supabase';
let sb = null;
if (USE_SUPABASE) {
  if (process.env.E2E_ALLOW_WIPE !== 'yes') throw new Error('E2E_STORE=supabase 는 테이블을 비웁니다. 연습용 프로젝트라면 E2E_ALLOW_WIPE=yes 를 함께 지정하세요.');
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.');
  const { createClient } = await import('@supabase/supabase-js');
  sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
// 임시 폴더는 설정 확인이 끝난 뒤에 만든다 (설정 오류로 끝나도 폴더가 남지 않게)
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'passkey-e2e-'));
async function wipeSupabase() {
  for (const [table, col] of [['passkeys', 'id'], ['sessions', 'sid_hash'], ['challenges', 'value'], ['auth_failures', 'key_hash']]) {
    const { error } = await sb.from(table).delete().neq(col, '');
    if (error) throw new Error(`${table} 비우기 실패: ${error.message}`);
  }
}
if (USE_SUPABASE) {
  try { await wipeSupabase(); } catch (e) { fs.rmSync(DATA_DIR, { recursive: true, force: true }); throw e; }
}

// 시험이 만든 임시 데이터는 성공·실패와 관계없이 끝에 항상 지운다 (시스템 임시 폴더, Supabase 에 넣은 시험 행)
async function cleanup() {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  if (USE_SUPABASE) {
    try { await wipeSupabase(); } catch (e) { console.error(`시험 데이터 정리 실패: ${e.message}`); }
  }
}
const LOG_FILE = path.join(ROOT, 'logs', 'e2e-log.jsonl');
const REPORT_FILE = path.join(ROOT, 'logs', 'e2e-report.json');
const privateData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'private-data.json'), 'utf8')).accounts;

/* ---------- 가상 인증기 ---------- */
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest();

function cborHead(major, len) {
  if (len < 24) return Buffer.from([(major << 5) | len]);
  if (len < 256) return Buffer.from([(major << 5) | 24, len]);
  return Buffer.from([(major << 5) | 25, len >> 8, len & 255]);
}
const cborBytes = (b) => Buffer.concat([cborHead(2, b.length), b]);
const cborText = (s) => Buffer.concat([cborHead(3, Buffer.byteLength(s)), Buffer.from(s)]);

class SoftAuthenticator {
  constructor(label) {
    this.label = label;
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    this.privateKey = privateKey;
    this.jwk = publicKey.export({ format: 'jwk' });
    this.privateD = privateKey.export({ format: 'jwk' }).d; // 개인키 값: 서버로 새어 나가면 안 된다
    this.credId = crypto.randomBytes(32);
    this.counter = 0;
    this.userHandle = null;
  }

  get id() { return b64u(this.credId); }

  coseKey() {
    return Buffer.concat([
      Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]), Buffer.from(this.jwk.x, 'base64url'),
      Buffer.from([0x22, 0x58, 0x20]), Buffer.from(this.jwk.y, 'base64url'),
    ]);
  }

  clientData(type, challenge) {
    return Buffer.from(JSON.stringify({ type, challenge, origin: ORIGIN, crossOrigin: false }));
  }

  create(options) {
    this.userHandle = options.user.id;
    const credIdLen = Buffer.alloc(2); credIdLen.writeUInt16BE(this.credId.length);
    const authData = Buffer.concat([
      sha256(RP_ID), Buffer.from([0x45]), Buffer.alloc(4), Buffer.alloc(16), credIdLen, this.credId, this.coseKey(),
    ]);
    const attObj = Buffer.concat([
      Buffer.from([0xa3]), cborText('fmt'), cborText('none'), cborText('attStmt'), Buffer.from([0xa0]),
      cborText('authData'), cborBytes(authData),
    ]);
    return {
      id: this.id, rawId: this.id, type: 'public-key', clientExtensionResults: {},
      response: {
        clientDataJSON: b64u(this.clientData('webauthn.create', options.challenge)),
        attestationObject: b64u(attObj),
        transports: ['internal'],
      },
    };
  }

  get(options, { signWith = this.privateKey } = {}) {
    this.counter += 1;
    const ctr = Buffer.alloc(4); ctr.writeUInt32BE(this.counter);
    const authData = Buffer.concat([sha256(RP_ID), Buffer.from([0x05]), ctr]);
    const clientDataJSON = this.clientData('webauthn.get', options.challenge);
    const signature = crypto.sign('sha256', Buffer.concat([authData, sha256(clientDataJSON)]), signWith);
    return {
      id: this.id, rawId: this.id, type: 'public-key', clientExtensionResults: {},
      response: {
        clientDataJSON: b64u(clientDataJSON), authenticatorData: b64u(authData),
        signature: b64u(signature), userHandle: this.userHandle,
      },
    };
  }
}

/* ---------- 쿠키를 들고 다니는 요청기 ---------- */
class Client {
  constructor(name) { this.name = name; this.sid = null; }

  async req(method, url, body, headers = {}) {
    const res = await fetch(ORIGIN + url, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(this.sid ? { Cookie: `sid=${this.sid}` } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const m = /^sid=([^;]*)/.exec(c);
      if (m) this.sid = m[1] || null;
    }
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* HTML 등 */ }
    return { status: res.status, data, text };
  }

  // GET 요청에 JSON 본문을 실어 보낸다 (fetch는 GET 본문을 막아서 http를 직접 쓴다)
  rawGetWithBody(url, bodyObj, headers = {}) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(bodyObj);
      const r = http.request(ORIGIN + url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), Cookie: `sid=${this.sid}`, ...headers },
      }, (res) => {
        let text = '';
        res.on('data', (d) => { text += d; });
        res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(text) }));
      });
      r.on('error', reject);
      r.end(payload);
    });
  }

  async register(auth, account, name, extra = {}) {
    const opt = await this.req('POST', '/api/register/options', { account, name, ...extra });
    if (opt.status !== 200) return { opt, done: null };
    const done = await this.req('POST', '/api/register/verify', { response: auth.create(opt.data) });
    return { opt, done };
  }

  async login(auth) {
    const opt = await this.req('POST', '/api/login/options');
    const done = await this.req('POST', '/api/login/verify', { response: auth.get(opt.data) });
    return { opt, done };
  }
}

/* ---------- 결과 모으기 ---------- */
const results = [];
function check(id, desc, pass, evidence) {
  results.push({ id, desc, pass: !!pass, evidence });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${desc}\n        ${evidence}`);
}
// 저장소에 실제로 들어 있는 패스키 (파일 저장소는 passkeys.json, Supabase 는 passkeys 테이블)
const passkeysJson = async () => {
  if (!USE_SUPABASE) {
    try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'passkeys.json'), 'utf8')); } catch { return { accounts: {} }; }
  }
  const { data, error } = await sb.from('passkeys').select('*').order('created_at');
  if (error) throw new Error(error.message);
  const accounts = {};
  for (const r of data) {
    accounts[r.account_id] ??= { userHandle: r.user_handle, passkeys: [] };
    accounts[r.account_id].passkeys.push({ id: r.id, name: r.name, publicKey: r.public_key, counter: Number(r.counter), transports: r.transports, deviceType: r.device_type, backedUp: r.backed_up, createdAt: r.created_at, lastUsedAt: r.last_used_at });
  }
  return { accounts };
};

/* ---------- 서버 띄우기 ---------- */
fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
fs.writeFileSync(LOG_FILE, '');
const server = spawn('node', ['server.js'], {
  cwd: ROOT,
  env: {
    ...process.env, PORT: String(PORT), ORIGIN, DATA_DIR, LOG_FILE, SETUP_CODE,
    // 배포 환경변수가 시험 서버에 섞여 들어가지 않도록, Supabase 는 시험 모드일 때만 넘긴다
    ...(USE_SUPABASE ? { SESSION_SECRET: process.env.SESSION_SECRET || crypto.randomBytes(16).toString('hex') } : { SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' }),
  },
  stdio: ['ignore', 'pipe', 'inherit'],
});
let ready = false;
server.stdout.on('data', (d) => { if (String(d).includes('서버 시작')) ready = true; });
for (let i = 0; i < 50 && !ready; i++) await new Promise((r) => setTimeout(r, 100));
if (!ready) { server.kill(); await cleanup(); throw new Error('서버가 시작되지 않았습니다'); }

try {
  const secretStrings = Object.values(privateData).flatMap((a) => a.items.flatMap((it) => [it.title, it.body]));
  const anon = new Client('anon');

  /* ===== 카드 1: 무엇을 잠글지 ===== */
  const page = await anon.req('GET', '/');
  const leaked = secretStrings.filter((s) => page.text.includes(s));
  check('T08-C18', '로그인 없이 받은 페이지 소스에 비공개 내용이 없다', page.status === 200 && leaked.length === 0,
    `GET / → ${page.status}, 소스 ${page.text.length}자, 비공개 문장 ${secretStrings.length}개 중 발견 ${leaked.length}개`);
  const a401 = await anon.req('GET', '/api/private');
  const a401b = await anon.req('GET', '/api/accounts/account-a/private');
  check('T08-C16/C17', '로그인 없이 비공개 자료를 직접 요청하면 401로 거절된다',
    a401.status === 401 && a401b.status === 401 && !JSON.stringify(a401.data).includes('items'),
    `GET /api/private → ${a401.status} ${JSON.stringify(a401.data)} / GET /api/accounts/account-a/private → ${a401b.status}`);
  const files = await Promise.all(['/data/private-data.json', '/private-data.json', '/server.js', '/package.json', '/data/passkeys.json'].map((u) => anon.req('GET', u)));
  check('T08-C16', '비공개 데이터 파일과 서버 소스를 주소로 직접 열 수 없다', files.every((f) => f.status === 404),
    `직접 요청 상태: ${files.map((f) => f.status).join(', ')}`);

  /* ===== 카드 2: 등록 ===== */
  const A = new Client('A-browser');
  const a1 = new SoftAuthenticator('A1 내 맥북');
  const badCode = await A.req('POST', '/api/register/options', { account: 'account-a', name: '내 맥북', setupCode: 'WRONG' });
  check('T08-C19', '설정 코드가 틀리면 등록 질문을 주지 않는다', badCode.status === 403 && !badCode.data.challenge,
    `틀린 코드 → ${badCode.status} ${JSON.stringify(badCode.data)}`);

  const opt1 = await A.req('POST', '/api/register/options', { account: 'account-a', name: '내 맥북', setupCode: SETUP_CODE });
  const opt2 = await A.req('POST', '/api/register/options', { account: 'account-a', name: '내 맥북', setupCode: SETUP_CODE });
  check('T08-C19/C20', '등록 요청마다 서버가 새 질문을 만들고 값이 서로 다르다',
    opt1.status === 200 && opt2.status === 200 && opt1.data.challenge !== opt2.data.challenge,
    `질문1=${opt1.data.challenge} / 질문2=${opt2.data.challenge}`);

  // 취소: 질문을 받은 뒤 기기 창에서 취소 → 취소 알림 → 같은 질문으로는 더 등록할 수 없고 아무것도 저장되지 않는다
  await A.req('POST', '/api/register/cancel', {});
  const afterCancel = await A.req('POST', '/api/register/verify', { response: a1.create(opt2.data) });
  check('T08-C25', '등록을 중간에 취소하면 서버에 아무것도 저장되지 않는다',
    afterCancel.status === 400 && Object.keys((await passkeysJson()).accounts).length === 0,
    `취소 뒤 등록 시도 → ${afterCancel.status} ${JSON.stringify(afterCancel.data)}, 저장소(${USE_SUPABASE ? 'Supabase passkeys 테이블' : 'passkeys.json'}) 계정 수 ${Object.keys((await passkeysJson()).accounts).length}`);

  const reg1 = await A.register(a1, 'account-a', '내 맥북', { setupCode: SETUP_CODE });
  const stored1 = (await passkeysJson()).accounts['account-a']?.passkeys?.[0];
  check('T08-C21/C24', '등록이 끝나면 서버에 공개키가 이름과 함께 저장된다',
    reg1.done?.status === 200 && stored1?.publicKey && stored1.name === '내 맥북',
    `저장 레코드: ${JSON.stringify({ id: stored1?.id, name: stored1?.name, publicKey: stored1?.publicKey, counter: stored1?.counter })}`);
  const storedText = JSON.stringify(await passkeysJson());
  const logText1 = fs.readFileSync(LOG_FILE, 'utf8');
  check('T08-C23', '개인키는 서버로 가지 않는다 (저장소와 요청 기록에 개인키 값이 없다)',
    !storedText.includes(a1.privateD) && !logText1.includes(a1.privateD),
    `개인키 값(d) 길이 ${a1.privateD.length}자를 저장소·요청 기록에서 검색 → 없음. 등록 요청 본문 필드: id, rawId, type, response{clientDataJSON, attestationObject, transports}`);

  const reuse = await A.req('POST', '/api/register/verify', { response: reg1.opt && a1.create(reg1.opt.data) });
  check('T08-C19', '검증이 끝난 등록 질문은 다시 쓸 수 없다', reuse.status === 400,
    `같은 등록 질문 재사용 → ${reuse.status} ${JSON.stringify(reuse.data)}`);

  const B = new Client('B-browser');
  const b1 = new SoftAuthenticator('B1 계정B 패스키');
  const regB = await B.register(b1, 'account-b', '계정B 노트북', { setupCode: SETUP_CODE });
  check('T08-C36', '계정 B에도 패스키가 등록된다', regB.done?.status === 200, `계정 B 등록 → ${regB.done?.status}`);

  /* ===== 카드 3: 로그인 ===== */
  const l1 = await A.req('POST', '/api/login/options');
  const l2 = await A.req('POST', '/api/login/options');
  const assertion2 = a1.get(l2.data);
  const okLogin = await A.req('POST', '/api/login/verify', { response: assertion2 });
  check('T08-C27/C28', '로그인 요청마다 서버가 새 질문을 보내고 값이 서로 다르다',
    l1.data.challenge !== l2.data.challenge && okLogin.status === 200,
    `질문1=${l1.data.challenge} / 질문2=${l2.data.challenge} → 질문2로 서명, 로그인 ${okLogin.status}`);
  const oldSid = A.sid;

  const l3 = await A.req('POST', '/api/login/options');
  const attacker = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
  const badSig = await A.req('POST', '/api/login/verify', { response: a1.get(l3.data, { signWith: attacker }) });
  check('T08-C29/C30', '틀린 서명은 거절되고, 맞는 서명은 통과한다 (나란히)',
    okLogin.status === 200 && badSig.status === 401,
    `맞는 서명 → ${okLogin.status} ${JSON.stringify(okLogin.data)} / 틀린 서명 → ${badSig.status} ${JSON.stringify(badSig.data)}`);

  const l4 = await A.req('POST', '/api/login/options');
  const body4 = { response: a1.get(l4.data) };
  const first = await A.req('POST', '/api/login/verify', body4);
  const replay = await A.req('POST', '/api/login/verify', body4);
  check('T08-C31', '이미 한 번 쓴 질문·서명으로 다시 로그인하려는 요청은 거절된다',
    first.status === 200 && replay.status === 401,
    `처음 → ${first.status} / 같은 본문 다시 → ${replay.status} ${JSON.stringify(replay.data)}`);

  const l5 = await anon.req('POST', '/api/login/options');
  const replayOther = await anon.req('POST', '/api/login/verify', { response: body4.response });
  check('T08-C31', '지난 로그인의 서명을 새 질문에 붙여 보내도 거절된다', replayOther.status === 401 && l5.status === 200,
    `새 질문(${l5.data.challenge})에 지난 서명 → ${replayOther.status} ${JSON.stringify(replayOther.data)}`);

  const priv = await A.req('GET', '/api/private');
  check('T08-C29', '서명 확인 뒤에는 비공개 자리가 열린다',
    priv.status === 200 && priv.data.items.length === 3,
    `로그인 뒤 GET /api/private → ${priv.status}, 계정 ${priv.data.account?.label}, 항목 ${priv.data.items?.length}건`);

  const oldCookieSid = A.sid;
  const logout = await A.req('POST', '/api/logout', {});
  const stale = new Client('stale');
  stale.sid = oldCookieSid;
  const afterLogout = await stale.req('GET', '/api/private');
  check('T08-C33', '로그아웃한 뒤 같은 세션 값으로 다시 요청하면 거절된다',
    logout.status === 200 && afterLogout.status === 401,
    `로그아웃 → ${logout.status} / 같은 쿠키로 GET /api/private → ${afterLogout.status} ${JSON.stringify(afterLogout.data)}`);

  const logTextAll = fs.readFileSync(LOG_FILE, 'utf8');
  const sids = [oldSid, oldCookieSid].filter(Boolean);
  check('T08-C34', '기록 파일에서 세션 값이 가려져 있다',
    sids.every((s) => !logTextAll.includes(s)) && logTextAll.includes('sid=***masked***') && !logTextAll.includes(SETUP_CODE),
    `세션 값 ${sids.length}개를 기록 전체에서 검색 → 없음, "sid=***masked***" 표기 확인, 설정 코드도 없음`);

  /* ===== 카드 4: 기기를 잃어버렸을 때 ===== */
  const A1c = new Client('A-1');
  await A1c.login(a1);
  const a2 = new SoftAuthenticator('A2 휴대폰');
  const regA2opt = await A1c.req('POST', '/api/register/options', { account: 'account-a', name: '휴대폰' });
  const excluded = regA2opt.data.excludeCredentials?.map((c) => c.id) ?? [];
  const regA2 = await A1c.req('POST', '/api/register/verify', { response: a2.create(regA2opt.data) });
  const list2 = await A1c.req('GET', '/api/passkeys');
  check('T08-C42/C43', '한 계정에 패스키가 두 개 등록되고, 목록에 이름과 등록 날짜가 보인다',
    regA2.status === 200 && list2.data.passkeys.length === 2 && list2.data.passkeys.every((p) => p.name && p.createdAt),
    `목록: ${JSON.stringify(list2.data.passkeys.map((p) => ({ name: p.name, createdAt: p.createdAt })))} / 두 번째 등록 질문의 제외 목록에 첫 패스키 포함: ${excluded.includes(a1.id)}`);

  const delA1 = await A1c.req('DELETE', `/api/passkeys/${encodeURIComponent(a1.id)}`);
  const sessionAfterDelete = await A1c.req('GET', '/api/private');
  const A2c = new Client('A-2');
  const loginA2 = await A2c.login(a2);
  const privA2 = await A2c.req('GET', '/api/private');
  check('T08-C44', '패스키 하나를 지운 뒤 남은 하나로 들어갈 수 있다',
    delA1.status === 200 && loginA2.done.status === 200 && privA2.status === 200,
    `A1 삭제 → ${delA1.status} ${JSON.stringify(delA1.data)} / A2로 로그인 → ${loginA2.done.status}, GET /api/private → ${privA2.status}`);

  const loginA1 = await new Client('A-1-again').login(a1);
  check('T08-C45', '지운 패스키로는 더 이상 들어갈 수 없다',
    loginA1.done.status === 401 && sessionAfterDelete.status === 401,
    `지운 A1로 로그인 → ${loginA1.done.status} ${JSON.stringify(loginA1.done.data)} / A1로 열어 둔 세션도 삭제 뒤 GET /api/private → ${sessionAfterDelete.status}`);

  const delLast = await A2c.req('DELETE', `/api/passkeys/${encodeURIComponent(a2.id)}`);
  const afterLast = await A2c.req('GET', '/api/passkeys');
  check('T08-C46', '마지막 패스키는 지워지지 않는다 (잠기는 일이 없다)',
    delLast.status === 409 && afterLast.data.passkeys.length === 1,
    `마지막 패스키 삭제 → ${delLast.status} ${JSON.stringify(delLast.data)}, 남은 패스키 ${afterLast.data.passkeys.length}개`);

  /* ===== 카드 5: 계정 두 개, 서로의 자료 ===== */
  await B.login(b1); // 앞서 B가 등록만 하고 로그인은 안 했다

  const nonOwner = await B.req('POST', '/api/register/options', { account: 'account-a', name: '침입' });
  check('T08-C37', '다른 계정으로 로그인한 채 내 계정에 패스키를 추가하려 하면 거절된다', nonOwner.status === 403,
    `B 세션으로 account-a에 패스키 추가 요청 → ${nonOwner.status} ${JSON.stringify(nonOwner.data)}`);
  const aOwn = await A2c.req('GET', '/api/private');
  const bOwn = await B.req('GET', '/api/private');
  const differ = aOwn.data.items.every((x) => !bOwn.data.items.some((y) => y.id === x.id || y.title === x.title));
  check('T08-C36', '계정 두 개에 각각 서로 다른 비공개 내용이 들어 있다',
    aOwn.data.items.length === 3 && bOwn.data.items.length === 3 && differ,
    `A: ${aOwn.data.items.map((i) => i.id).join(',')} / B: ${bOwn.data.items.map((i) => i.id).join(',')}`);

  const bCountBefore = (await B.req('GET', '/api/private')).data.items.length;
  const aReadB = await A2c.req('GET', '/api/accounts/account-b/private');
  const bCountAfter = (await B.req('GET', '/api/private')).data.items.length;
  check('T08-C37/C39', 'A로 들어가 B의 자료를 읽으려 하면 거절되고, B의 자료 건수는 그대로다',
    aReadB.status === 403 && !aReadB.data.items && bCountBefore === bCountAfter,
    `A→B 요청 ${aReadB.status} ${JSON.stringify(aReadB.data)} / B의 자료 건수 요청 전 ${bCountBefore} → 후 ${bCountAfter}`);

  const aCountBefore = (await A2c.req('GET', '/api/private')).data.items.length;
  const bReadA = await B.req('GET', '/api/accounts/account-a/private');
  const aCountAfter = (await A2c.req('GET', '/api/private')).data.items.length;
  check('T08-C38/C39', '반대로 B로 들어가 A의 자료를 읽으려 해도 거절되고, A의 자료 건수는 그대로다',
    bReadA.status === 403 && !bReadA.data.items && aCountBefore === aCountAfter,
    `B→A 요청 ${bReadA.status} ${JSON.stringify(bReadA.data)} / A의 자료 건수 요청 전 ${aCountBefore} → 후 ${aCountAfter}`);

  const viaQuery = await A2c.req('GET', '/api/private?account=account-b&accountId=account-b', undefined, { 'X-Account-Id': 'account-b' });
  const viaBody = await A2c.rawGetWithBody('/api/private?account=account-b', { account: 'account-b', accountId: 'account-b' });
  check('T08-C40', '주소·헤더·본문에 다른 계정을 적어 보내도 내 자료만 돌아온다',
    viaQuery.status === 200 && viaQuery.data.account.id === 'account-a' && viaQuery.data.items.every((i) => i.id.startsWith('a-'))
      && viaBody.status === 200 && viaBody.data.account.id === 'account-a' && viaBody.data.items.every((i) => i.id.startsWith('a-')),
    `?account=account-b → 계정 ${viaQuery.data.account.id}, 항목 ${viaQuery.data.items.map((i) => i.id)} / 본문 {account:"account-b"} → 계정 ${viaBody.data.account.id}, 항목 ${viaBody.data.items.map((i) => i.id)}`);

  const delOther = await A2c.req('DELETE', `/api/passkeys/${encodeURIComponent(b1.id)}`);
  const bStill = await B.req('GET', '/api/passkeys');
  check('T08-C37', '다른 계정의 패스키는 지울 수 없고, 지우려 해도 그대로 남는다',
    delOther.status === 404 && bStill.data.passkeys.length === 1,
    `A가 B의 패스키 삭제 요청 → ${delOther.status} ${JSON.stringify(delOther.data)}, B의 패스키 ${bStill.data.passkeys.length}개 그대로`);

  const tooBig = await anon.req('POST', '/api/login/options', { pad: 'x'.repeat(120_000) });
  check('보안', '100KB를 넘는 요청 본문은 413으로 거절된다 (서버 오류 500이 아니다)', tooBig.status === 413,
    `120KB 본문 → ${tooBig.status} ${JSON.stringify(tooBig.data)}`);

  const evil = await A2c.req('DELETE', `/api/passkeys/${encodeURIComponent(a2.id)}`, undefined, { Origin: 'https://evil.example' });
  check('보안', '다른 사이트(Origin)에서 온 상태 변경 요청은 거절된다', evil.status === 403, `Origin: https://evil.example → ${evil.status} ${JSON.stringify(evil.data)}`);

  const noPw = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8').match(/type="password"/g);
  check('T08-C35', '페이지 어디에도 비밀번호 입력 칸이 없다', !noPw, `public/index.html 에서 type="password" 검색 → ${noPw ? noPw.length : 0}건`);
} finally {
  server.kill();
  await cleanup();
}

const failed = results.filter((r) => !r.pass);
fs.writeFileSync(REPORT_FILE, JSON.stringify({ ranAt: new Date().toISOString(), note: '가상 인증기(소프트웨어)로 실행한 서버 시험 결과', results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} 통과${failed.length ? ' — 실패: ' + failed.map((f) => f.id).join(', ') : ''}`);
console.log(`요청·응답 기록: ${path.relative(ROOT, LOG_FILE)} / 결과: ${path.relative(ROOT, REPORT_FILE)}`);
process.exit(failed.length ? 1 : 0);
