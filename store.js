// 저장소 계층: 패스키·세션·질문(challenge)·실패 횟수를 어디에 두는지만 책임진다.
//  - 파일 저장소 (기본, 내 컴퓨터에서 `npm start`/`npm test`): 패스키는 data/passkeys.json, 나머지는 서버 메모리
//  - Supabase 저장소 (Vercel 배포): 전부 Supabase(Postgres) 테이블. SQL은 supabase/schema.sql
// 두 저장소는 같은 함수 모양을 가진다. 서버 코드(server.js)는 어느 쪽인지 모른다.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import session from 'express-session';

const sha256hex = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

/* ====================== 파일 저장소 (내 컴퓨터) ====================== */
class FileStore {
  constructor({ dataDir, failureWindowMs }) {
    this.kind = 'file';
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'passkeys.json');
    this.failureWindowMs = failureWindowMs;
    this.sessionStore = undefined; // express-session 기본(메모리) 저장소를 쓴다
    this.challenges = new Map();
    this.failures = new Map();
    try { this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch { this.data = { accounts: {} }; }
  }

  save() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  async passkeysOf(accountId) {
    return this.data.accounts[accountId]?.passkeys ?? [];
  }

  async userHandleOf(accountId) {
    return this.data.accounts[accountId]?.userHandle ?? null;
  }

  async findCredential(credentialId) {
    for (const [accountId, acc] of Object.entries(this.data.accounts)) {
      const passkey = acc.passkeys.find((p) => p.id === credentialId);
      if (passkey) return { accountId, passkey };
    }
    return null;
  }

  async addPasskey(accountId, userHandle, passkey) {
    this.data.accounts[accountId] ??= { userHandle, passkeys: [] };
    this.data.accounts[accountId].passkeys.push(passkey);
    this.save();
  }

  async touchPasskey(credentialId, counter, lastUsedAt) {
    const found = await this.findCredential(credentialId);
    if (!found) return;
    found.passkey.counter = counter;
    found.passkey.lastUsedAt = lastUsedAt;
    this.save();
  }

  async deletePasskey(accountId, credentialId) {
    const list = this.data.accounts[accountId]?.passkeys ?? [];
    if (!list.some((p) => p.id === credentialId)) return { status: 'not_found' };
    if (list.length <= 1) return { status: 'last_passkey' };
    this.data.accounts[accountId].passkeys = list.filter((p) => p.id !== credentialId);
    this.save();
    return { status: 'ok', remaining: list.length - 1 };
  }

  async putChallenge(value, type, data, expiresAt) {
    this.challenges.set(value, { type, data, expiresAt });
    for (const [v, c] of this.challenges) if (c.expiresAt < Date.now()) this.challenges.delete(v);
  }

  // 꺼내자마자 지운다. 같은 질문은 두 번 나오지 않는다
  async takeChallenge(value) {
    const c = this.challenges.get(value);
    this.challenges.delete(value);
    return c ?? null;
  }

  async isBlocked(key, max) {
    const now = Date.now();
    const recent = (this.failures.get(key) ?? []).filter((t) => now - t < this.failureWindowMs);
    this.failures.set(key, recent);
    return recent.length >= max;
  }

  async recordFailure(key) {
    this.failures.set(key, [...(this.failures.get(key) ?? []), Date.now()]);
  }
}

/* ====================== Supabase 저장소 (Vercel) ====================== */
function fail(where, error) {
  // 오류 메시지에 키나 주소가 섞이지 않도록 위치와 코드만 남긴다
  const err = new Error(`supabase_${where}: ${error.code ?? ''} ${error.message ?? ''}`.trim());
  return err;
}

const toPasskey = (r) => ({
  id: r.id,
  name: r.name,
  publicKey: r.public_key,
  counter: Number(r.counter),
  transports: r.transports ?? [],
  deviceType: r.device_type,
  backedUp: r.backed_up,
  createdAt: r.created_at,
  lastUsedAt: r.last_used_at,
});

class SupabaseSessionStore extends session.Store {
  constructor(db, ttlMs) {
    super();
    this.db = db;
    this.ttlMs = ttlMs;
  }

  // 쿠키의 세션 ID는 해시로만 저장한다. 테이블이 새어도 쿠키로 쓸 수 없다
  expiryOf(sess) {
    const exp = sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + this.ttlMs;
    return new Date(exp).toISOString();
  }

  get(sid, cb) {
    this.db.from('sessions').select('data').eq('sid_hash', sha256hex(sid)).gt('expires_at', new Date().toISOString())
      .maybeSingle()
      .then(({ data, error }) => (error ? cb(fail('session_get', error)) : cb(null, data?.data ?? null)), cb);
  }

  set(sid, sess, cb) {
    this.db.from('sessions')
      .upsert({ sid_hash: sha256hex(sid), data: sess, expires_at: this.expiryOf(sess) })
      .then(({ error }) => cb(error ? fail('session_set', error) : null), cb);
  }

  touch(sid, sess, cb) {
    this.db.from('sessions').update({ expires_at: this.expiryOf(sess) }).eq('sid_hash', sha256hex(sid))
      .then(({ error }) => cb(error ? fail('session_touch', error) : null), cb);
  }

  destroy(sid, cb) {
    this.db.from('sessions').delete().eq('sid_hash', sha256hex(sid))
      .then(({ error }) => cb(error ? fail('session_destroy', error) : null), cb);
  }
}

class SupabaseStore {
  constructor({ db, sessionTtlMs, failureWindowMs }) {
    this.kind = 'supabase';
    this.db = db;
    this.failureWindowMs = failureWindowMs;
    this.sessionStore = new SupabaseSessionStore(db, sessionTtlMs);
  }

  async passkeysOf(accountId) {
    const { data, error } = await this.db.from('passkeys').select('*').eq('account_id', accountId).order('created_at');
    if (error) throw fail('passkeys_of', error);
    return data.map(toPasskey);
  }

  async userHandleOf(accountId) {
    const { data, error } = await this.db.from('passkeys').select('user_handle').eq('account_id', accountId).limit(1);
    if (error) throw fail('user_handle', error);
    return data[0]?.user_handle ?? null;
  }

  async findCredential(credentialId) {
    const { data, error } = await this.db.from('passkeys').select('*').eq('id', credentialId).maybeSingle();
    if (error) throw fail('find_credential', error);
    return data ? { accountId: data.account_id, passkey: toPasskey(data) } : null;
  }

  async addPasskey(accountId, userHandle, p) {
    const { error } = await this.db.from('passkeys').insert({
      id: p.id,
      account_id: accountId,
      user_handle: userHandle,
      name: p.name,
      public_key: p.publicKey,
      counter: p.counter,
      transports: p.transports,
      device_type: p.deviceType,
      backed_up: p.backedUp,
      created_at: p.createdAt,
      last_used_at: p.lastUsedAt,
    });
    if (error) throw fail('add_passkey', error);
  }

  async touchPasskey(credentialId, counter, lastUsedAt) {
    const { error } = await this.db.from('passkeys').update({ counter, last_used_at: lastUsedAt }).eq('id', credentialId);
    if (error) throw fail('touch_passkey', error);
  }

  async deletePasskey(accountId, credentialId) {
    const { data, error } = await this.db.rpc('delete_passkey', { p_account: accountId, p_id: credentialId });
    if (error) throw fail('delete_passkey', error);
    return data;
  }

  async putChallenge(value, type, data, expiresAt) {
    const { error } = await this.db.from('challenges')
      .insert({ value, type, data, expires_at: new Date(expiresAt).toISOString() });
    if (error) throw fail('put_challenge', error);
    // 만료된 질문 정리 (실패해도 로그인 흐름과 무관)
    await this.db.from('challenges').delete().lt('expires_at', new Date().toISOString());
  }

  // 삭제와 조회를 한 문장(DELETE ... RETURNING)으로 한다. 동시에 두 번 와도 한 쪽만 값을 받는다
  async takeChallenge(value) {
    const { data, error } = await this.db.from('challenges').delete().eq('value', value).select();
    if (error) throw fail('take_challenge', error);
    const row = data[0];
    return row ? { type: row.type, data: row.data, expiresAt: new Date(row.expires_at).getTime() } : null;
  }

  async isBlocked(key, max) {
    const since = new Date(Date.now() - this.failureWindowMs).toISOString();
    const { count, error } = await this.db.from('auth_failures')
      .select('id', { count: 'exact', head: true }).eq('key_hash', sha256hex(key)).gt('at', since);
    if (error) throw fail('is_blocked', error);
    return count >= max;
  }

  async recordFailure(key) {
    const { error } = await this.db.from('auth_failures').insert({ key_hash: sha256hex(key) });
    if (error) throw fail('record_failure', error);
    await this.db.from('auth_failures').delete().lt('at', new Date(Date.now() - this.failureWindowMs).toISOString());
  }
}

/* ====================== 선택 ====================== */
export async function createStore({ dataDir, sessionTtlMs, failureWindowMs, onVercel }) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const { createClient } = await import('@supabase/supabase-js');
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    return new SupabaseStore({ db, sessionTtlMs, failureWindowMs });
  }
  // 배포 환경에서 키가 빠졌을 때 조용히 메모리·파일 저장소로 떨어지면, 서버가 꺼질 때마다 패스키가 사라진다
  if (onVercel) throw new Error('SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.');
  return new FileStore({ dataDir, failureWindowMs });
}
