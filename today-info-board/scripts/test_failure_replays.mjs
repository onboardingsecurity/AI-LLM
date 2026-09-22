// T04-C26: 다섯 실패 재생 (합성 시험값만 사용, 실제 API 호출 없음)
//
// web/index.html의 load() 실패 분기를 그대로 옮긴 순수 함수로 재현해서
// 각 실패 상황에서 "조회 실패"가 정직하게 표시되는지 검증한다.
// (동일 메시지 문자열을 index.html과 그대로 맞춰야 하므로, index.html의 분기를 고치면 이 파일도 같이 고칠 것.)

function evaluate(scenario) {
  if (scenario.kind === 'network-error') {
    return { ok: false, message: '조회 실패: 네트워크 요청 자체가 차단되었거나 응답이 오지 않았습니다.' };
  }
  if (scenario.kind === 'http-error') {
    return { ok: false, message: `조회 실패: 서버가 HTTP ${scenario.status}을 반환했습니다.` };
  }
  if (scenario.kind === 'bad-json') {
    return { ok: false, message: '조회 실패: 응답을 JSON으로 해석할 수 없습니다.' };
  }
  const raw = scenario.raw;
  if (!raw || !raw.current || typeof raw.current.temperature_2m !== 'number') {
    return { ok: false, message: '조회 실패: 응답에 기대한 값(current.temperature_2m)이 없습니다.' };
  }
  return { ok: true, value: raw.current.temperature_2m };
}

const cases = [
  {
    name: '1. 네트워크 자체 차단 (fetch 실패)',
    scenario: { kind: 'network-error' },
    expectSubstring: '네트워크 요청 자체가 차단',
  },
  {
    name: '2. 서버 오류 응답 (HTTP 500)',
    scenario: { kind: 'http-error', status: 500 },
    expectSubstring: 'HTTP 500',
  },
  {
    name: '3. 손상된 JSON 응답',
    scenario: { kind: 'bad-json' },
    expectSubstring: 'JSON으로 해석할 수 없습니다',
  },
  {
    name: '4. current 필드 자체가 없는 응답 (합성값 {})',
    scenario: { kind: 'raw', raw: {} },
    expectSubstring: 'current.temperature_2m',
  },
  {
    name: '5. current는 있으나 값 타입이 잘못된 응답 (합성값 "N/A")',
    scenario: { kind: 'raw', raw: { current: { temperature_2m: 'N/A', time: '2099-01-01T00:00' } } },
    expectSubstring: 'current.temperature_2m',
  },
];

let failCount = 0;
for (const c of cases) {
  const result = evaluate(c.scenario);
  const pass = result.ok === false && result.message.includes(c.expectSubstring);
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${c.name}`);
  console.log(`   표시 메시지: ${result.message}`);
  if (!pass) failCount++;
}

// 정상 케이스도 함께 확인: 실패 로직이 정상 데이터를 오탐하지 않는지
const sane = evaluate({ kind: 'raw', raw: { current: { temperature_2m: 21.2, time: '2026-09-22T23:15' } } });
const sanePass = sane.ok === true && sane.value === 21.2;
console.log(`${sanePass ? 'PASS' : 'FAIL'} — 0. 정상 데이터는 실패로 오탐하지 않음 (대조군)`);
if (!sanePass) failCount++;

console.log(`\n총 ${cases.length + 1}건 중 실패 ${failCount}건`);
process.exit(failCount === 0 ? 0 : 1);
