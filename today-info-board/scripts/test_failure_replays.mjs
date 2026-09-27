// 다섯 실패 재생 (합성 시험값만 사용, 실제 API 호출 없음)
//
// web/index.html의 load() 실패 분기 + showError()의 FAILURE_MESSAGES를 그대로 옮긴 순수 함수로
// 재현해서 각 실패 상황에서 "조회 실패"가 정직하게 표시되는지 검증한다.
// (동일 분류·문구를 index.html과 그대로 맞춰야 하므로, index.html의 FAILURE_MESSAGES나
// load()의 분기를 고치면 이 파일도 같이 고칠 것.)

const FAILURE_MESSAGES = {
  network: { explain: '네트워크 연결이 끊겼거나 요청이 차단되었습니다.', next_action: '네트워크 연결을 확인한 뒤 다시 시도하세요.' },
  auth: { explain: '외부 데이터 원천이 인증을 거절했습니다 (401/403).', next_action: '접근 조건이 바뀌었는지 확인이 필요합니다.' },
  rate_limit: { explain: '외부 원천이 호출을 제한했습니다 (429).', next_action: '잠시(약 60초) 뒤 다시 시도하세요.' },
  http: { explain: '서버가 오류 응답을 반환했습니다.', next_action: '잠시 후 다시 시도해 보세요.' },
  schema_error: { explain: '응답 형식이 예상과 달라 값을 해석할 수 없습니다.', next_action: '형식이 바뀌었는지 확인이 필요합니다.' },
};

function bubbleText(code) {
  const m = FAILURE_MESSAGES[code] || FAILURE_MESSAGES.http;
  return `💬 ${m.explain} ${m.next_action}`;
}

function evaluate(scenario) {
  if (scenario.kind === 'network-error') {
    return { ok: false, code: 'network' };
  }
  if (scenario.kind === 'http-error') {
    if (scenario.status === 401 || scenario.status === 403) return { ok: false, code: 'auth' };
    if (scenario.status === 429) return { ok: false, code: 'rate_limit' };
    return { ok: false, code: 'http' };
  }
  if (scenario.kind === 'bad-json') {
    return { ok: false, code: 'schema_error' };
  }
  const raw = scenario.raw;
  if (!raw || !raw.current || typeof raw.current.temperature_2m !== 'number') {
    return { ok: false, code: 'schema_error' };
  }
  return { ok: true, value: raw.current.temperature_2m };
}

const cases = [
  {
    name: '1. 네트워크 자체 차단 (fetch 실패)',
    scenario: { kind: 'network-error' },
    expectSubstring: '네트워크 연결이 끊겼거나',
  },
  {
    name: '2. 서버 오류 응답 (HTTP 500)',
    scenario: { kind: 'http-error', status: 500 },
    expectSubstring: '서버가 오류 응답을 반환',
  },
  {
    name: '3. 인증 거절 (HTTP 401)',
    scenario: { kind: 'http-error', status: 401 },
    expectSubstring: '인증을 거절',
  },
  {
    name: '4. 호출 제한 (HTTP 429)',
    scenario: { kind: 'http-error', status: 429 },
    expectSubstring: '호출을 제한',
  },
  {
    name: '5. 손상된 JSON 응답',
    scenario: { kind: 'bad-json' },
    expectSubstring: '응답 형식이 예상과 달라',
  },
  {
    name: '6. current 필드 자체가 없는 응답 (합성값 {})',
    scenario: { kind: 'raw', raw: {} },
    expectSubstring: '응답 형식이 예상과 달라',
  },
  {
    name: '7. current는 있으나 값 타입이 잘못된 응답 (합성값 "N/A")',
    scenario: { kind: 'raw', raw: { current: { temperature_2m: 'N/A', time: '2099-01-01T00:00' } } },
    expectSubstring: '응답 형식이 예상과 달라',
  },
];

let failCount = 0;
for (const c of cases) {
  const result = evaluate(c.scenario);
  const message = result.ok ? '' : bubbleText(result.code);
  const pass = result.ok === false && message.includes(c.expectSubstring);
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${c.name}`);
  console.log(`   표시 메시지: ${message}`);
  if (!pass) failCount++;
}

// 정상 케이스도 함께 확인: 실패 로직이 정상 데이터를 오탐하지 않는지
const sane = evaluate({ kind: 'raw', raw: { current: { temperature_2m: 21.2, time: '2026-09-22T23:15' } } });
const sanePass = sane.ok === true && sane.value === 21.2;
console.log(`${sanePass ? 'PASS' : 'FAIL'} — 0. 정상 데이터는 실패로 오탐하지 않음 (대조군)`);
if (!sanePass) failCount++;

console.log(`\n총 ${cases.length + 1}건 중 실패 ${failCount}건`);
process.exit(failCount === 0 ? 0 : 1);
