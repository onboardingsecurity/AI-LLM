// app/ 의 판단 규칙과 문장 목록을 시험한다. 실행: node tests/logic.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appDir = path.join(__dirname, '..', 'app');
const context = vm.createContext({});
for (const file of ['data.js', 'messages.js', 'logic.js']) {
  vm.runInContext(fs.readFileSync(path.join(appDir, file), 'utf8'), context, { filename: file });
}
const { data, messages, logic } = context.App;

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('통과:', name);
}

test('논문 표 1 값이 그대로 들어 있다', () => {
  assert.equal(data.thresholdWon, 5000);
  assert.deepEqual(Array.from(data.titles, (t) => t.name), ['원장', '디자이너', '아티스트', '네일리스트', '선생님']);
  assert.ok(data.titles.every((t) => t.shops >= 5));
  const jang = logic.findTitle('원장');
  assert.deepEqual(Array.from([jang.shops, jang.median, jang.q1, jang.q3, jang.min, jang.max]), [10, 35000, 35000, 35000, 30000, 40000]);
  const sensei = logic.findTitle('선생님');
  assert.equal(sensei.max, 49000);
});

test('가격 입력: 쉼표·공백·원은 허용한다', () => {
  for (const input of ['35,000', ' 35000원 ', '35 000']) {
    const r = logic.parsePrice(input);
    assert.equal(r.ok, true);
    assert.equal(r.value, 35000);
  }
});

test('잘못된 가격 입력은 멈추지 않고 안내를 돌려준다', () => {
  for (const bad of ['', '   ', 'abc', '-5000', '35000.5', '3만원', '0', '999', '1000001', '１２３４５', null, undefined, '<script>', '35000; DROP']) {
    const r = logic.parsePrice(bad);
    assert.equal(r.ok, false, `거부해야 함: ${JSON.stringify(bad)}`);
    assert.equal(typeof r.error, 'string');
    assert.ok(r.error.length > 0);
  }
});

test('가격 입력 경계: 1,000원과 1,000,000원은 허용', () => {
  assert.equal(logic.parsePrice('1000').ok, true);
  assert.equal(logic.parsePrice('1000000').ok, true);
});

test('가격 차이를 기준 5,000원과 비교한다 (A 미만, B 같음, C 초과)', () => {
  assert.equal(logic.kindOf(0), 'A');
  assert.equal(logic.kindOf(4999), 'A');
  assert.equal(logic.kindOf(5000), 'B');
  assert.equal(logic.kindOf(5001), 'C');
});

test('논문 값으로 확인: 원장 35,000과 아티스트 30,000은 경계(B)', () => {
  const r = logic.compare({ title: '원장', price: 35000 }, { title: '아티스트', price: 30000 });
  assert.equal(r.diff, 5000);
  assert.equal(r.kind, 'B');
  assert.equal(r.pricier, 0);
  assert.equal(r.sameTitle, false);
});

test('순서를 바꿔도 같은 결과 종류, 더 비싼 가게는 바뀐다', () => {
  const r = logic.compare({ title: '아티스트', price: 30000 }, { title: '원장', price: 35000 });
  assert.equal(r.kind, 'B');
  assert.equal(r.pricier, 1);
});

test('같은 가격이면 차이 0원(A)이고 첫 가게가 더 비싼 쪽으로 잡힌다', () => {
  const r = logic.compare({ title: '원장', price: 35000 }, { title: '디자이너', price: 35000 });
  assert.equal(r.diff, 0);
  assert.equal(r.kind, 'A');
  assert.equal(r.pricier, 0);
});

test('같은 호칭끼리 비교하면 sameTitle', () => {
  const r = logic.compare({ title: '원장', price: 30000 }, { title: '원장', price: 45000 });
  assert.equal(r.sameTitle, true);
  assert.equal(r.kind, 'C');
});

test('가격 위치 다섯 가지(원장: 최소 30,000, 사분위 35,000~35,000, 최대 40,000)', () => {
  const t = logic.findTitle('원장');
  assert.equal(logic.position(29999, t), 'belowMin');
  assert.equal(logic.position(30000, t), 'low');
  assert.equal(logic.position(34999, t), 'low');
  assert.equal(logic.position(35000, t), 'mid');
  assert.equal(logic.position(35001, t), 'high');
  assert.equal(logic.position(40000, t), 'high');
  assert.equal(logic.position(40001, t), 'aboveMax');
});

test('가격 위치: 선생님(사분위 30,000~40,000, 최대 49,000)', () => {
  const t = logic.findTitle('선생님');
  assert.equal(logic.position(30000, t), 'mid');
  assert.equal(logic.position(40000, t), 'mid');
  assert.equal(logic.position(49000, t), 'high');
  assert.equal(logic.position(49001, t), 'aboveMax');
});

test('모든 호칭, 여러 가격에서 compare가 오류 없이 돈다', () => {
  const prices = [1000, 15000, 29000, 30000, 32500, 35000, 38750, 40000, 49000, 100000, 1000000];
  let count = 0;
  for (const a of data.titles) {
    for (const b of data.titles) {
      for (const pa of prices) {
        for (const pb of prices) {
          const r = logic.compare({ title: a.name, price: pa }, { title: b.name, price: pb });
          assert.ok(['A', 'B', 'C'].includes(r.kind));
          assert.ok(messages.headline[r.kind]);
          assert.ok(messages.position[r.shops[r.pricier].position]);
          for (let c = 0; c < 3; c += 1) {
            const seed = logic.seedOf(r, c);
            assert.ok(logic.pick(messages.kind[r.kind], seed));
            assert.ok(logic.pick(messages.position[r.shops[r.pricier].position], seed * 3));
          }
          count += 1;
        }
      }
    }
  }
  assert.equal(count, 5 * 5 * 11 * 11);
});

test('같은 입력이면 같은 문장, 다른 한 줄을 누르면 바뀐다', () => {
  const r = logic.compare({ title: '원장', price: 35000 }, { title: '아티스트', price: 30000 });
  const first = logic.pick(messages.kind[r.kind], logic.seedOf(r, 0));
  assert.equal(first, logic.pick(messages.kind[r.kind], logic.seedOf(r, 0)));
  assert.notEqual(first, logic.pick(messages.kind[r.kind], logic.seedOf(r, 1)));
});

test('문장 수와 중복', () => {
  for (const kind of ['A', 'B', 'C']) {
    assert.equal(messages.kind[kind].length, 8);
    assert.equal(new Set(messages.kind[kind]).size, 8);
  }
  for (const pos of ['belowMin', 'low', 'mid', 'high', 'aboveMax']) {
    assert.equal(messages.position[pos].length, 4);
    assert.equal(new Set(messages.position[pos]).size, 4);
    assert.ok(messages.positionText[pos]);
  }
});

test('문장에 인과 단정이나 권유 표현이 없다', () => {
  const all = [
    ...Object.values(messages.headline),
    ...Object.values(messages.kind).flat(),
    ...Object.values(messages.position).flat(),
    ...Object.values(messages.positionText),
    messages.paperConclusion,
    messages.sameTitleNote,
  ];
  // 권유 표현은 모든 문장에서 막는다.
  const advice = [/가세요/, /가지 ?마/, /가는 ?게 좋/, /추천/, /권합니다/];
  // 인과 단정은 부정문("...말하지 않았습니다")이 아닌 문장에서 막는다. 논문 결론이 그 주장을 부정하는 문장이기 때문이다.
  const causal = [/호칭 때문에 (비싸|저렴|높|낮)/, /호칭이 (가격을|값을) (정|올|내)/, /호칭 덕분/];
  for (const text of all) {
    for (const re of advice) assert.ok(!re.test(text), `권유 표현 ${re}: ${text}`);
    if (!text.includes('않')) {
      for (const re of causal) assert.ok(!re.test(text), `인과 단정 ${re}: ${text}`);
    }
  }
});

test('논문에 없는 직업은 누를 수 없고 데이터도 없다', () => {
  const ready = data.jobs.filter((j) => j.ready);
  assert.deepEqual(Array.from(ready, (j) => j.id), ['nail']);
  assert.deepEqual(Array.from(data.jobs, (j) => j.id), ['nail', 'cook', 'dev']);
  for (const job of data.jobs.filter((j) => !j.ready)) {
    assert.deepEqual(Array.from(Object.keys(job)).sort(), ['icon', 'id', 'name', 'ready']);
  }
});

test('직업마다 그림 파일이 있고, 화면이 부르는 파일이 모두 실제로 있다', () => {
  for (const job of data.jobs) {
    for (const name of [`job-${job.icon}.png`, `job-${job.icon}-off.png`]) {
      assert.ok(fs.existsSync(path.join(appDir, 'assets', 'icons', name)), `없음: ${name}`);
    }
  }
  for (const name of ['lock.png', 'heart-red.png', 'heart-pink.png', 'heart-orange.png']) {
    assert.ok(fs.existsSync(path.join(appDir, 'assets', 'icons', name)), `없음: ${name}`);
  }
  // 화면(html, css, js)이 상대 경로로 부르는 파일이 없는 일이 없어야 한다.
  const sources = ['index.html', 'style.css', 'script.js'].map((f) => fs.readFileSync(path.join(appDir, f), 'utf8')).join('\n');
  const refs = new Set([...sources.matchAll(/(?:src=|href=|url\()["']?((?:assets|fonts)\/[^"')\s]+)/g)].map((m) => m[1]));
  for (const ref of refs) assert.ok(fs.existsSync(path.join(appDir, ref)), `화면이 부르는데 없음: ${ref}`);
});

console.log(`\n${passed}개 통과`);
