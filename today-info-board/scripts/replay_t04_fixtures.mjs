// T04 3단계: 실제 제공 패키지(assets/studio-task-assets/t04-real-information-board/)의
// adapter-reset.example.js + fixtures/*.json 을 그대로 재생해 C12~C21, C26을 검증한다.
// (지어낸 값 아님 — 2026-09-23 사용자가 붙여준 실제 패키지 파일을 그대로 사용)

import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_DIR = path.join(__dirname, '..', 'assets', 'studio-task-assets', 't04-real-information-board');

const adapter = require(path.join(PKG_DIR, 'adapter-reset.example.js'));

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'fixtures', name), 'utf-8'));
}

let failCount = 0;
function check(label, condition, detail) {
  const pass = !!condition;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}${detail !== undefined ? '\n   ' + detail : ''}`);
  if (!pass) failCount++;
  return pass;
}

function observed(state) {
  return {
    freshness: state.status ? state.status.freshness : null,
    error_code: state.status ? state.status.error_code : null,
    row_count: state.daily_readings.length,
    stored_value: state.current_reading ? state.current_reading.normalized_value : null,
    delta: state.last_delta,
  };
}

function checkAgainstExpected(label, state, expected) {
  const o = observed(state);
  check(`${label}: freshness=${expected.freshness}`, o.freshness === expected.freshness, `실제: ${o.freshness}`);
  check(`${label}: error_code=${expected.error_code}`, o.error_code === expected.error_code, `실제: ${o.error_code}`);
  check(`${label}: row_count=${expected.row_count}`, o.row_count === expected.row_count, `실제: ${o.row_count}`);
  check(`${label}: stored_value=${expected.stored_value}`, o.stored_value === expected.stored_value, `실제: ${o.stored_value}`);
  check(`${label}: delta=${expected.delta}`, o.delta === expected.delta, `실제: ${o.delta}`);
}

// ---------------------------------------------------------------------------
console.log('=== 성공 순서: reset → D1-A → D1-B → D2 (C20, C21 부수 확인) ===');
const dA = loadFixture('normal-d1-a.json');
const dB = loadFixture('normal-d1-b.json');
const d2 = loadFixture('normal-d2.json');

let s = adapter.resetEvaluationState();
check('reset 직후 daily_readings=0', s.daily_readings.length === 0);

s = adapter.runFixture(s, dA);
checkAgainstExpected('D1-A', s, dA.expected);
const recordIdAfterA = s.daily_readings[0].record_id;

s = adapter.runFixture(s, dB);
checkAgainstExpected('D1-B', s, dB.expected);
check('C20: D1-B가 D1-A와 같은 record_id로 원자적 갱신됨',
  s.daily_readings.find(r => r.record_date === '2026-08-24').record_id === recordIdAfterA);

s = adapter.runFixture(s, d2);
checkAgainstExpected('D2', s, d2.expected);
check('C21: D2가 다음 날짜에 새 행을 만듦 (row_count 1→2)', s.daily_readings.length === 2);

// ---------------------------------------------------------------------------
console.log('\n=== 실패 5종: 각각 reset → D1-A → D1-B → 실패 fixture (C12~C18, C26) ===');
const failureCases = [
  { file: 'timeout.json', criterion: 'T04-C12' },
  { file: 'auth-401.json', criterion: 'T04-C13' },
  { file: 'rate-429.json', criterion: 'T04-C14' },
  { file: 'offline.json', criterion: 'T04-C15' },
  { file: 'schema-break.json', criterion: 'T04-C16' },
];

const recoverD2 = loadFixture('recover-d2.json');
const distinctErrorCodes = new Set();

for (const fc of failureCases) {
  const fixture = loadFixture(fc.file);
  console.log(`\n--- ${fc.criterion}: ${fc.file} ---`);

  let st = adapter.resetEvaluationState();
  st = adapter.runFixture(st, dA);
  st = adapter.runFixture(st, dB);
  const beforeValue = st.current_reading.normalized_value;
  const beforeRowCount = st.daily_readings.length;

  st = adapter.runFixture(st, fixture);
  checkAgainstExpected(fc.criterion, st, fixture.expected);
  check(`${fc.criterion}: 실패 종류 고유 (error_code=${fixture.expected.error_code})`, true);
  distinctErrorCodes.add(fixture.expected.error_code);
  check(`C17: 마지막 정상값(${beforeValue}) 안 지워짐`, st.current_reading.normalized_value === beforeValue);
  check(`C18: freshness='stale'로 표시(오래됨 배지 근거)`, st.status.freshness === 'stale');
  check(`실패는 일별 행을 늘리지 않음 (${beforeRowCount}건 유지)`, st.daily_readings.length === beforeRowCount);

  // C19: 이 실패 뒤 RECOVER-D2로 복구
  st = adapter.runFixture(st, recoverD2);
  checkAgainstExpected(`${fc.criterion} 후 RECOVER-D2`, st, recoverD2.expected);
  check(`C19: 다음 날짜 행 정확히 1건 추가 (총 ${beforeRowCount + 1}건)`, st.daily_readings.length === beforeRowCount + 1);
}

check('C26: 5가지 실패의 error_code가 모두 서로 다름', distinctErrorCodes.size === failureCases.length,
  `고유 개수: ${distinctErrorCodes.size} / ${failureCases.length}`);

// ---------------------------------------------------------------------------
console.log('\n=== criterion-registry.json의 T04-C19 expected_recovery_transition 정확 대조 ===');
const registry = JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'criterion-registry.json'), 'utf-8'));
const c19 = registry.criteria.find(c => c.id === 'T04-C19');
const transition = c19.expected_recovery_transition;

let st2 = adapter.resetEvaluationState();
st2 = adapter.runFixture(st2, dA);
st2 = adapter.runFixture(st2, dB);
st2 = adapter.runFixture(st2, loadFixture('timeout.json'));
check('before_retry: freshness/error_code/row_count/last_good_value 일치',
  st2.status.freshness === transition.before_retry.freshness &&
  st2.status.error_code === transition.before_retry.error_code &&
  st2.daily_readings.length === transition.before_retry.daily_row_count &&
  st2.current_reading.normalized_value === transition.before_retry.last_good_value);

st2 = adapter.runFixture(st2, recoverD2);
check('after_retry: freshness/error_code/row_count/stored_value 일치',
  st2.status.freshness === transition.after_retry.freshness &&
  st2.status.error_code === transition.after_retry.error_code &&
  st2.daily_readings.length === transition.after_retry.daily_row_count &&
  st2.current_reading.normalized_value === transition.after_retry.stored_value);
check('after_retry: 새 날짜 행이 정확히 1건 추가',
  st2.daily_readings.filter(r => r.record_date === transition.after_retry.record_date).length === 1);

// ---------------------------------------------------------------------------
console.log('\n=== D1/D2(합성) 격리 확인 ===');
const realDir = path.join(__dirname, '..', 'data', 'weather');
const realFiles = fs.existsSync(realDir) ? fs.readdirSync(realDir) : [];
check('실제 기록 폴더(data/weather/)에 합성 날짜(2026-08-24/25)가 섞이지 않음',
  !realFiles.some(f => f.startsWith('2026-08-24') || f.startsWith('2026-08-25')),
  `data/weather 내 파일: ${realFiles.join(', ')}`);

console.log(`\n총 실패 ${failCount}건`);
process.exit(failCount === 0 ? 0 : 1);
