// web/index.html에 브라우저용으로 옮겨 넣은 adapter 로직·fixture가
// 실제 패키지(assets/studio-task-assets/t04-real-information-board/)의
// adapter-reset.example.js + fixtures/*.json 과 동작이 같은지 대조한다.

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PKG_DIR = path.join(ROOT, 'assets', 'studio-task-assets', 't04-real-information-board');
const realAdapter = require(path.join(PKG_DIR, 'adapter-reset.example.js'));

const html = fs.readFileSync(path.join(ROOT, 'web', 'index.html'), 'utf-8');
const m = html.match(/\/\/ --- SYNC-EXTRACT-START ---\n([\s\S]*?)\/\/ --- SYNC-EXTRACT-END ---/);
if (!m) {
  console.error('FAIL — index.html에서 SYNC-EXTRACT 구간을 찾지 못함');
  process.exit(1);
}
const extracted = new Function(`
  ${m[1]}
  return { resetEvaluationState, runFixture, FIXTURES };
`)();

let failCount = 0;
function check(label, condition, detail) {
  const pass = !!condition;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) { console.log('   ' + (detail || '')); failCount++; }
}

// 부분집합 대조: inline fixture의 모든 키가 원본 fixture 파일과 같은 값이어야 함
function subsetEquals(inline, original, label) {
  for (const key of Object.keys(inline)) {
    if (!(key in original)) { check(`${label}.${key} 원본에 존재`, false, 'inline에만 있는 키'); continue; }
    const iv = inline[key], ov = original[key];
    if (iv && typeof iv === 'object' && !Array.isArray(iv)) subsetEquals(iv, ov, `${label}.${key}`);
    else check(`${label}.${key} 값 일치`, iv === ov, `inline=${JSON.stringify(iv)} 원본=${JSON.stringify(ov)}`);
  }
}

const fixtureFileMap = {
  D1A: 'normal-d1-a.json', D1B: 'normal-d1-b.json', D2: 'normal-d2.json',
  TIMEOUT: 'timeout.json', AUTH: 'auth-401.json', RATE: 'rate-429.json',
  OFFLINE: 'offline.json', SCHEMA: 'schema-break.json', RECOVER_D2: 'recover-d2.json',
};
for (const [key, file] of Object.entries(fixtureFileMap)) {
  const original = JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'fixtures', file), 'utf-8'));
  subsetEquals(extracted.FIXTURES[key], original, `FIXTURES.${key}`);
}

// 행동 동등성: 인라인 로직과 실제 adapter가 같은 순서로 같은 결과를 내는지 비교
console.log('\n--- 인라인 로직 vs 실제 adapter 행동 대조 ---');
function runSeq(adapter, fixtures) {
  let st = adapter.resetEvaluationState();
  for (const f of fixtures) st = adapter.runFixture(st, f);
  return st;
}
function summarize(st) {
  return {
    freshness: st.status ? st.status.freshness : null,
    error_code: st.status ? st.status.error_code : null,
    row_count: st.daily_readings.length,
    stored_value: st.current_reading ? st.current_reading.normalized_value : null,
    delta: st.last_delta,
  };
}

const realFixtures = {};
for (const [key, file] of Object.entries(fixtureFileMap)) {
  realFixtures[key] = JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'fixtures', file), 'utf-8'));
}

const sequences = {
  '성공 D1A→D1B→D2': ['D1A', 'D1B', 'D2'],
  'D1A→D1B→TIMEOUT': ['D1A', 'D1B', 'TIMEOUT'],
  'D1A→D1B→AUTH': ['D1A', 'D1B', 'AUTH'],
  'D1A→D1B→RATE': ['D1A', 'D1B', 'RATE'],
  'D1A→D1B→OFFLINE': ['D1A', 'D1B', 'OFFLINE'],
  'D1A→D1B→SCHEMA': ['D1A', 'D1B', 'SCHEMA'],
  'D1A→D1B→TIMEOUT→RECOVER_D2': ['D1A', 'D1B', 'TIMEOUT', 'RECOVER_D2'],
};

for (const [label, keys] of Object.entries(sequences)) {
  const realResult = summarize(runSeq(realAdapter, keys.map(k => realFixtures[k])));
  const inlineResult = summarize(runSeq(extracted, keys.map(k => extracted.FIXTURES[k])));
  check(`${label}: 인라인 결과가 실제 adapter와 일치`,
    JSON.stringify(realResult) === JSON.stringify(inlineResult),
    `실제=${JSON.stringify(realResult)} 인라인=${JSON.stringify(inlineResult)}`);
}

console.log(`\n총 실패 ${failCount}건`);
process.exit(failCount === 0 ? 0 : 1);
