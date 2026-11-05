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

test('두 가게 결과 한 문장은 금액 없이 작다·적당하다·크다로만 말한다', () => {
  assert.deepEqual(Array.from(Object.values(messages.headline)), ['두 가게 가격 차이가 작아요.', '두 가게 가격 차이가 적당해요.', '두 가게 가격 차이가 커요.']);
  assert.ok(Object.values(messages.headline).every((t) => !/\d/.test(t)));
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
          assert.ok(messages.feeling.compare[r.kind]);
          count += 1;
        }
      }
    }
  }
  assert.equal(count, 5 * 5 * 11 * 11);
});

test('유머 대신 소비자의 마음을 이해해 주는 한 줄이 상태마다 하나씩만 있다', () => {
  // 두 가게는 작다·경계·크다, 한 곳은 낮은 쪽·가운데·높은 쪽. 많이 두지 않고 하나씩이다.
  assert.deepEqual(Array.from(Object.keys(messages.feeling.compare)), ['A', 'B', 'C']);
  assert.deepEqual(Array.from(Object.keys(messages.feeling.single)), ['low', 'mid', 'high']);
  const all = [...Object.values(messages.feeling.compare), ...Object.values(messages.feeling.single)];
  assert.equal(new Set(all).size, 6);
  for (const text of all) {
    assert.equal(typeof text, 'string');
    assert.ok(text.length > 0);
    assert.ok(!/ㅋㅋ|ㅎㅎ|농담|웃/.test(text), `유머: ${text}`);
  }
  // 유머 목록과 그것을 고르던 코드는 없다.
  assert.equal(messages.kind, undefined);
  assert.equal(messages.position, undefined);
  assert.equal(logic.seedOf, undefined);
  assert.equal(logic.pick, undefined);
  const script = fs.readFileSync(path.join(appDir, 'script.js'), 'utf8');
  assert.ok(!script.includes('다른 한 줄'));
  // 위치 설명(이유 칸)은 다섯 가지가 그대로 있다.
  for (const pos of ['belowMin', 'low', 'mid', 'high', 'aboveMax']) assert.ok(messages.positionText[pos]);
});

test('문장에 인과 단정이나 권유 표현이 없다', () => {
  const all = [
    ...Object.values(messages.headline),
    ...Object.values(messages.feeling.compare),
    ...Object.values(messages.feeling.single),
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
  assert.deepEqual(Array.from(data.jobs, (j) => j.id), ['nail', 'cook', 'dev', 'sealed-1', 'sealed-2', 'sealed-3']);
  for (const job of data.jobs.filter((j) => !j.ready && !j.locked)) {
    assert.deepEqual(Array.from(Object.keys(job)).sort(), ['icon', 'id', 'name', 'ready']);
  }
});

test('완전히 잠긴 칸 세 개는 누를 수 없고, 알림도 값도 없다', () => {
  const sealed = data.jobs.filter((j) => j.locked);
  assert.equal(sealed.length, 3);
  for (const job of sealed) {
    assert.deepEqual(Array.from(Object.keys(job)).sort(), ['icon', 'id', 'locked', 'name', 'ready']);
    assert.equal(job.ready, false);
    assert.equal(job.services, undefined);
  }
  // 직업 칸은 위 세 개(네일 등)와 아래 세 개(잠금)로 모두 여섯 칸
  assert.equal(data.jobs.length, 6);
  const script = fs.readFileSync(path.join(appDir, 'script.js'), 'utf8');
  assert.ok(script.includes('button.disabled = true'));
});

test('직업마다 그림 파일이 있고, 화면이 부르는 파일이 모두 실제로 있다', () => {
  for (const job of data.jobs) {
    for (const name of [`job-${job.icon}.png`, `job-${job.icon}-off.png`]) {
      assert.ok(fs.existsSync(path.join(appDir, 'assets', 'icons', name)), `없음: ${name}`);
    }
  }
  for (const job of data.jobs.filter((j) => j.services)) {
    for (const sv of job.services) {
      for (const name of [`service-${sv.icon}.png`, `service-${sv.icon}-off.png`]) {
        assert.ok(fs.existsSync(path.join(appDir, 'assets', 'icons', name)), `없음: ${name}`);
      }
    }
  }
  for (const name of ['lock.png', 'heart-red.png', 'heart-pink.png', 'heart-orange.png']) {
    assert.ok(fs.existsSync(path.join(appDir, 'assets', 'icons', name)), `없음: ${name}`);
  }
  // 보안 헤더(vercel.json)가 img-src 'self'라서 화면 파일에 data: 주소를 쓰면 배포했을 때 그림이 막힌다
  const csp = JSON.parse(fs.readFileSync(path.join(appDir, 'vercel.json'), 'utf8')).headers[0].headers.find((h) => h.key === 'Content-Security-Policy').value;
  assert.ok(/img-src 'self'(;|$)/.test(csp) && !/img-src[^;]*data:/.test(csp));
  for (const f of ['index.html', 'style.css', 'script.js']) {
    assert.ok(!/data:image|url\(["']?data:/.test(fs.readFileSync(path.join(appDir, f), 'utf8')), `${f}에 data: 이미지 주소가 있음`);
  }
  assert.ok(fs.existsSync(path.join(appDir, 'assets', 'icons', 'dd-arrow.png')));
  // 화면(html, css, js)이 상대 경로로 부르는 파일이 없는 일이 없어야 한다.
  const sources = ['index.html', 'style.css', 'script.js'].map((f) => fs.readFileSync(path.join(appDir, f), 'utf8')).join('\n');
  const refs = new Set([...sources.matchAll(/(?:src=|href=|url\()["']?((?:assets|fonts)\/[^"')\s]+)/g)].map((m) => m[1]));
  for (const ref of refs) assert.ok(fs.existsSync(path.join(appDir, ref)), `화면이 부르는데 없음: ${ref}`);
});

// ---------- 논문 값 대조: 설문, 표 4 ----------
test('논문 설문 값: 30명, 5,000원 18명과 10,000원 12명, 평소 가격, 일치도와 상관', () => {
  const s = data.survey;
  assert.equal(s.people, 30);
  assert.deepEqual(Array.from(s.thresholds, (t) => [t.won, t.people]), [[5000, 18], [10000, 12]]);
  assert.equal(s.thresholds.reduce((n, t) => n + t.people, 0), s.people);
  assert.deepEqual(Array.from([s.usualPrice.median, s.usualPrice.min, s.usualPrice.max]), [35000, 28000, 50000]);
  assert.equal(s.kendallW, 0.8);
  assert.equal(s.spearman, 0.34);
});

test('논문 호칭별 설문 인상 순위와 리뷰 수(표 4)', () => {
  const p = data.profiles;
  assert.deepEqual(Array.from(['원장', '디자이너', '네일리스트', '아티스트', '선생님'], (n) => p[n].impression.mean), [1.87, 2.53, 2.8, 2.87, 5.3]);
  assert.deepEqual(Array.from(['원장', '디자이너', '네일리스트', '아티스트', '선생님'], (n) => p[n].impression.rank), [1, 2, 3, 4, 5]);
  assert.deepEqual(Array.from(['원장', '디자이너', '네일리스트', '아티스트', '선생님'], (n) => p[n].reviews.median), [234, 551, 799.5, 2073, 622]);
  assert.deepEqual(Array.from(['원장', '디자이너', '네일리스트', '아티스트', '선생님'], (n) => p[n].reviews.shops), [11, 15, 10, 9, 9]);
  // 순위는 평균 순위가 작은 순서와 같다.
  const byMean = Object.keys(p).sort((a, b) => p[a].impression.mean - p[b].impression.mean);
  assert.deepEqual(byMean, Array.from(Object.keys(p), (n) => n).sort((a, b) => p[a].impression.rank - p[b].impression.rank));
  // 표의 모든 호칭에 따로 붙는 값이 있다.
  for (const menu of Object.values(data.menus)) for (const t of menu.titles) assert.ok(p[t.name], `profile 없음: ${t.name}`);
});

test('설문 응답자 수: 이 차이면 확실히 다르다고 답한 사람', () => {
  assert.equal(logic.agreeCount(0), 0);
  assert.equal(logic.agreeCount(4999), 0);
  assert.equal(logic.agreeCount(5000), 18);
  assert.equal(logic.agreeCount(9999), 18);
  assert.equal(logic.agreeCount(10000), 30);
  assert.equal(logic.agreeCount(50000), 30);
});

// ---------- 가게 한 곳 ----------
test('가게 한 곳: 같은 호칭 논문 중앙값과의 차이와 가격 위치', () => {
  const r = logic.single({ title: '아티스트', price: 38000 }, 'hand');
  assert.equal(r.mode, 'single');
  assert.equal(r.shops.length, 1);
  assert.equal(r.shops[0].vsMedian, 8000);
  assert.equal(r.shops[0].position, 'aboveMax');
  assert.equal(r.medianGap, 8000);
  const mid = logic.single({ title: '원장', price: 35000 }, 'hand');
  assert.equal(mid.shops[0].position, 'mid');
  assert.equal(mid.shops[0].vsMedian, 0);
  const low = logic.single({ title: '아티스트', price: 29500 }, 'hand');
  assert.equal(low.shops[0].position, 'mid');
  assert.equal(low.shops[0].vsMedian, -500);
});

test('compare와 single이 모든 호칭·가격으로 오류 없이 돌고 문장이 빠지지 않는다', () => {
  const prices = [1000, 29000, 35000, 40000, 45000, 58000, 1000000];
  for (const menu of ['hand']) {
    const titles = data.menus[menu].titles;
    for (const a of titles) {
      for (const pa of prices) {
        const one = logic.single({ title: a.name, price: pa }, menu);
        if (logic.isOutside(one.shops[0])) {
          assert.ok(messages.unknown.headline(a.name, one.shops[0].stats).includes('판단할 수 없어요'));
        } else {
          assert.ok(messages.singleHeadline[one.shops[0].position]);
          assert.ok(messages.feeling.single[one.shops[0].position]);
        }
        const view = logic.consumerView(one);
        for (const key of ['accept', 'hesitate', 'check']) {
          assert.ok(view[key].length > 0);
          assert.ok(view[key].every((x) => typeof x === 'string' && x.length > 0 && !x.includes('undefined') && !x.includes('NaN')));
        }
        assert.ok(logic.paperExtras(one).every((x) => !x.includes('undefined') && !x.includes('NaN')));
        for (const b of titles) {
          for (const pb of prices) {
            const two = logic.compare({ title: a.name, price: pa }, { title: b.name, price: pb }, menu);
            const v = logic.consumerView(two);
            for (const key of ['accept', 'hesitate', 'check']) {
              assert.ok(v[key].length > 0);
              assert.ok(v[key].every((x) => typeof x === 'string' && !x.includes('undefined') && !x.includes('NaN')));
            }
            assert.ok(logic.paperExtras(two).every((x) => !x.includes('undefined') && !x.includes('NaN')));
          }
        }
      }
    }
  }
});

test('소비자 입장 정리: 값에 따라 소비를 받아들일 이유와 망설일 이유가 나뉜다', () => {
  // 낮은 가격: 소비를 받아들일 이유에 중앙값과의 차이가 나온다.
  const cheap = logic.consumerView(logic.single({ title: '원장', price: 30000 }, 'hand'));
  assert.ok(cheap.accept.some((x) => x.includes('싼 편') && x.includes('보통 가격보다 5,000원 싸요')));
  assert.ok(cheap.accept.some((x) => x.includes('기준 금액(5,000원) 이상')));
  // 범위 안에서 높은 쪽(아티스트 34,000원): 소비를 망설일 이유에 중앙값과의 차이가 나오고, 인상이 높은 호칭이면 호칭 문장도 나온다.
  const pricey = logic.consumerView(logic.single({ title: '아티스트', price: 34000 }, 'hand'));
  assert.ok(pricey.hesitate.some((x) => x.includes('비싼 편') && x.includes('보통 가격보다 4,000원 비싸요') && !x.includes('중앙값')));
  assert.ok(pricey.hesitate.some((x) => x.includes("호칭 '아티스트'") && x.includes('설문 인상')));
  // 두 가게: 5,000원 미만이면 소비를 받아들일 이유, 이상이면 소비를 망설일 이유에 설문 응답자 수가 나온다.
  const near = logic.consumerView(logic.compare({ title: '원장', price: 35000 }, { title: '아티스트', price: 32000 }, 'hand'));
  assert.ok(near.accept.some((x) => x.includes('기준 금액(5,000원)보다 작아요')));
  const edge = logic.consumerView(logic.compare({ title: '원장', price: 35000 }, { title: '아티스트', price: 30000 }, 'hand'));
  assert.ok(edge.hesitate.some((x) => x.includes('정확히 5,000원') && x.includes('30명 중 18명')));
  const far = logic.consumerView(logic.compare({ title: '원장', price: 45000 }, { title: '아티스트', price: 30000 }, 'hand'));
  assert.ok(far.hesitate.some((x) => x.includes('30명 모두')));
  // 호칭이 같으면 호칭이 달라서 생긴 차이가 아니라는 문장이 더 확인해 볼 점에 있다.
  const same = logic.consumerView(logic.compare({ title: '원장', price: 30000 }, { title: '원장', price: 45000 }, 'hand'));
  assert.ok(same.check.includes(messages.sameTitleNote));
  // 인기(리뷰 수)와 다른 조건은 늘 더 확인해 볼 점에 있다.
  for (const v of [cheap, pricey, near, edge, far, same]) {
    assert.ok(v.check.includes(messages.consumer.otherConditions));
    assert.ok(v.check.some((x) => x.includes('가게 리뷰는 보통')));
  }
});

test('알아 둘 점 맨 위: 인상 순위와 인상·가격 순서의 관계를 한 줄씩', () => {
  const x = logic.paperExtras(logic.compare({ title: '아티스트', price: 30000 }, { title: '선생님', price: 35000 }, 'hand'));
  assert.ok(x.some((l) => l.startsWith('아티스트 호칭은') && l.includes('4번째')));
  assert.ok(x.some((l) => l.startsWith('선생님 호칭은') && l.includes('5번째')));
  assert.ok(x.some((l) => l.includes('약하게만 맞았어요')));
  // 한 줄씩이라 길지 않다(예전의 긴 풀이와 호칭별 가격 사례는 결과에서 뺐다)
  assert.ok(x.every((l) => l.length <= 70), x.join(' / '));
  // 따로 소제목을 두지 않고 "알아 둘 점" 하나로 합쳤다
  const script = fs.readFileSync(path.join(appDir, 'script.js'), 'utf8');
  assert.ok(!script.includes('논문이 더 알려 주는 것'));
  assert.ok(script.includes('...logic.paperExtras(result), ...messages.limits'));
});

test('알아 둘 점에 "차이를 못 찾은 것이 차이가 없다는 증명은 아니다"가 표본 한계 바로 아래에 있다', () => {
  const i = messages.limits.findIndex((l) => l.includes('표본이 작아요'));
  assert.ok(i >= 0);
  assert.equal(messages.limits[i + 1], '차이를 찾지 못했다고 해서, 차이가 없다고 증명한 것은 아니에요.');
  assert.equal(messages.limits.length, 4);
  assert.ok(messages.limits.every((l) => l.length <= 70));
});

test('새 문장에도 인과 단정, 책임 돌리기, 권유, 무관 단정이 없다', () => {
  const texts = [
    ...Object.values(messages.singleHeadline),
    messages.paperConclusion,
    ...messages.limits,
    messages.consumer.noneAccept, messages.consumer.noneHesitate, messages.consumer.otherConditions,
    messages.extras.orderVsPrice,
  ];
  for (const t of data.menus.hand.titles) {
    texts.push(messages.unknown.headline(t.name, t), messages.unknown.reason('이 가게', t.name, t));
  }
  const prices = [20000, 30000, 33000, 35000, 38000, 40000, 45000, 60000];
  for (const menu of ['hand']) {
    for (const a of data.menus[menu].titles) {
      for (const pa of prices) {
        texts.push(...logic.consumerView(logic.single({ title: a.name, price: pa }, menu)).accept);
        texts.push(...logic.consumerView(logic.single({ title: a.name, price: pa }, menu)).hesitate);
        texts.push(...logic.consumerView(logic.single({ title: a.name, price: pa }, menu)).check);
        texts.push(...logic.paperExtras(logic.single({ title: a.name, price: pa }, menu)));
        for (const b of data.menus[menu].titles) {
          for (const pb of prices) {
            const v = logic.consumerView(logic.compare({ title: a.name, price: pa }, { title: b.name, price: pb }, menu));
            texts.push(...v.accept, ...v.hesitate, ...v.check);
          }
        }
      }
    }
  }
  const advice = [/가세요/, /가지 ?마/, /가는 ?게 좋/, /추천/, /권합니다/, /반대/];
  // 호칭을 범인으로 모는 말, 호칭과 무관하다는 단정, 논문에 없는 "근거가 없다"는 판정은 모든 문장에서 막는다.
  const overclaim = [/호칭 탓/, /범인/, /용의자/, /알리바이/, /근거가 없/];
  // 인과 단정은 부정문("...말하지 않습니다")이 아닌 문장에서만 막는다.
  const causal = [/호칭 때문에 (비싸|저렴|높|낮)/, /호칭이 (가격을|값을) (정|올|내)/, /호칭 덕분/];
  for (const t of texts) {
    for (const re of advice) assert.ok(!re.test(t), `권유 표현 ${re}: ${t}`);
    for (const re of overclaim) assert.ok(!re.test(t), `논문 밖 표현 ${re}: ${t}`);
    if (!t.includes('않')) for (const re of causal) assert.ok(!re.test(t), `인과 단정 ${re}: ${t}`);
    // "무관"은 "무관하다고 증명한 것은 아닙니다"처럼 부정할 때만 쓴다.
    if (t.includes('무관')) assert.ok(/무관(하다고 증명한 것은 아닙니다|합니다\)?$)|실제 실력과는 다릅니다|무관하다는/.test(t) || t.includes('실력과는'), `무관 단정: ${t}`);
  }
  // 기존 두 가게 문장도 같은 표현을 쓰지 않는다.
  const old = [
    ...Object.values(messages.headline),
    ...Object.values(messages.feeling.compare),
    ...Object.values(messages.feeling.single),
    messages.paperConclusion, messages.sameTitleNote,
  ];
  for (const t of old) for (const re of [...advice, /호칭 탓/, /범인/, /용의자/, /알리바이/, /근거가 없/]) assert.ok(!re.test(t), `${re}: ${t}`);
});

test('한 곳 헤드라인은 위치마다 있고 범위 밖은 위치 말 대신 판단할 수 없다고 한다', () => {
  for (const pos of ['low', 'mid', 'high']) assert.ok(messages.singleHeadline[pos].includes('{title}'));
  // 범위 밖은 위치 헤드라인이 아니라 "판단할 수 없습니다"로 말한다.
  assert.equal(messages.singleHeadline.belowMin, undefined);
  assert.equal(messages.singleHeadline.aboveMax, undefined);
});

test('알아보기를 누르면 계산하는 사람이 나오는 모달 창을 보인 뒤 결과만 담긴 별도 화면으로 넘어간다', () => {
  const html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
  const script = fs.readFileSync(path.join(appDir, 'script.js'), 'utf8');
  assert.ok(html.includes('<dialog id="loading-dialog"') && html.includes('assets/icons/calc-a.png') && html.includes('assets/icons/calc-b.png'));
  for (const name of ['calc-a.png', 'calc-b.png']) assert.ok(fs.existsSync(path.join(appDir, 'assets', 'icons', name)), `없음: ${name}`);
  // 결과 상자는 입력 화면(compare) 안이 아니라 결과 화면(screen-result) 안에 있다
  const compare = html.slice(html.indexOf('id="screen-compare"'), html.indexOf('id="screen-result"'));
  const resultScreen = html.slice(html.indexOf('id="screen-result"'), html.indexOf('id="back-bar"'));
  assert.ok(!compare.includes('id="result"') && resultScreen.includes('id="result"'));
  // 모달을 띄우고 기다린 뒤에 결과 화면으로 바꾸고 결과를 그린다. 결과 화면의 뒤로 가기는 입력 화면으로 간다
  assert.ok(script.includes('loadingDialog.showModal()'));
  // 결과 화면에서는 첫 문장 상자를 숨기고, 제목은 "결과 화면"이다
  assert.ok(script.includes("$('lead').hidden = screen === screenResult"));
  assert.ok(script.includes("$('lead-sub').hidden = screen === screenResult"));
  // 첫 문장 아래에 논문 제목(사용자가 줄인 말)과 이 서비스가 누구를 어떻게 돕는지 한 문장이 작게 있다
  assert.ok(html.includes('<p class="lead-sub" id="lead-sub">호칭과 가격 수준의 관계: 해당 서비스는 호칭과 가게들의 가격을 비교해 사용자의 소비 결정을 돕습니다.</p>'));
  assert.ok(html.includes('id="lead"') && html.includes('<h2 id="result-title" tabindex="-1">결과 화면</h2>'));
  assert.ok(script.indexOf('await wait(LOADING_MS)') < script.indexOf("show(screenResult, 'result-title')"));
  assert.ok(script.indexOf("show(screenResult, 'result-title')") < script.lastIndexOf('renderResult(result)'));
  assert.ok(script.includes("show(screenCompare, 'compare-title')") && script.includes('runId += 1'));
});

test('호칭은 눌러서 고르는 버튼이 아니라 옵션 칸(select)으로 고른다', () => {
  const script = fs.readFileSync(path.join(appDir, 'script.js'), 'utf8');
  assert.ok(script.includes("el('select'"));
  assert.ok(!script.includes("'chip ghost'") && !script.includes('"'+"radio"+'"') && !/role:\s*'radio'/.test(script));
  // 보이는 버튼이 select 앞에 들어가므로, 값은 첫 요소가 아니라 select를 찾아서 읽어야 한다(예전에 놓쳤던 버그)
  assert.ok(script.includes("$('picker-' + i).querySelector('select')"));
  assert.ok(!script.includes("$('picker-' + i).firstElementChild"));
  // 첫 옵션은 안내문(값 없음)이라, 호칭을 고르지 않으면 findTitle이 거른다.
  assert.equal(logic.findTitle('', 'hand'), null);
});

test('입력칸 아래에 평소 가격 안내문을 두지 않는다', () => {
  assert.equal(messages.usualPriceHint, undefined);
  const html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
  assert.ok(!html.includes('price-hint'));
});

test('시술은 손 젤 원톤 하나뿐이고 발 젤 데이터와 문장이 앱에 없다', () => {
  assert.deepEqual(Array.from(Object.keys(data.menus)), ['hand']);
  assert.equal(data.menus.hand.name, '손 젤 원톤');
  assert.equal(data.menus.hand.compared, 41);
  assert.ok(data.menus.hand.titles.every((t) => typeof t.q1 === 'number' && typeof t.q3 === 'number'));
  for (const file of ['index.html', 'script.js', 'data.js', 'messages.js', 'logic.js']) {
    const text = fs.readFileSync(path.join(appDir, file), 'utf8');
    assert.ok(!/발 젤|foot/.test(text), file + '에 발 젤이 남아 있음');
  }
});

test('가게 한 곳 헤드라인에 중앙값과의 차이가 붙는다', () => {
  assert.equal(messages.medianSuffix(0), ' (보통 가격과 같아요)');
  assert.equal(messages.medianSuffix(1000), ' (보통 가격보다 1,000원 비싸요)');
  assert.equal(messages.medianSuffix(-5000), ' (보통 가격보다 5,000원 싸요)');
  // 원장 36,000원: 위치는 "높은 쪽"이지만 중앙값과의 차이가 1,000원뿐임이 함께 나온다.
  const r = logic.single({ title: '원장', price: 36000 }, 'hand');
  assert.equal(r.shops[0].position, 'high');
  assert.equal(messages.medianSuffix(r.shops[0].vsMedian), ' (보통 가격보다 1,000원 비싸요)');
  assert.ok(!/호칭 때문|근거가 없|추천/.test(messages.medianSuffix(r.shops[0].vsMedian)));
});

test('흐름: 직업 → 서비스 → 호칭·가격. 열린 직업마다 서비스가 있고 열린 서비스는 논문 값이 있다', () => {
  for (const job of data.jobs) {
    if (!job.ready) {
      assert.equal(job.services, undefined, '잠긴 직업에는 서비스 목록이 없다');
      continue;
    }
    assert.ok(Array.isArray(job.services) && job.services.length > 0);
    assert.ok(job.services.some((sv) => sv.ready), '열린 서비스가 하나는 있다');
    for (const sv of job.services) {
      assert.deepEqual(Array.from(Object.keys(sv)).sort(), ['icon', 'id', 'name', 'ready']);
      if (sv.ready) {
        assert.ok(data.menus[sv.id], `열린 서비스에 논문 값이 없음: ${sv.id}`);
        assert.equal(data.menus[sv.id].name, sv.name);
        assert.ok(data.menus[sv.id].titles.length > 0);
      } else {
        assert.equal(data.menus[sv.id], undefined, `잠긴 서비스에 값이 있으면 안 됨: ${sv.id}`);
      }
    }
  }
  assert.deepEqual(Array.from(data.jobs.find((j) => j.id === 'nail').services, (sv) => sv.id), ['hand']);
});

test('화면에 서비스 선택 단계가 있고 뒤로 가기가 한 단계씩이다', () => {
  const html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
  const script = fs.readFileSync(path.join(appDir, 'script.js'), 'utf8');
  for (const id of ['screen-jobs', 'screen-services', 'screen-compare', 'screen-result', 'service-list', 'back-bar', 'back']) {
    assert.ok(html.includes(`id="${id}"`), `index.html에 ${id} 없음`);
  }
  // 뒤로 가기 버튼은 화면마다 새로 만들지 않고 카드 맨 아래에 하나만 있다
  assert.equal(html.split('id="back"').length - 1, 1);
  assert.ok(!html.includes('id="back-jobs"'));
  assert.ok(script.includes("show(screenServices, 'services-title')"));
  assert.ok(script.includes("show(screenJobs, 'jobs-title')"));
  assert.ok(script.includes("show(screenCompare, 'compare-title')"));
});

test('소비자 입장 정리의 소제목은 소비 관점이고 권유 말투가 아니다', () => {
  const t = messages.consumer.titles;
  assert.equal(t.accept, '소비를 받아들일 이유');
  assert.equal(t.hesitate, '소비를 망설일 이유');
  assert.equal(t.check, '더 확인해 볼 점');
  for (const text of [...Object.values(t), messages.consumer.noneAccept, messages.consumer.noneHesitate]) {
    assert.ok(!/추천|반대|가세요|가지 ?마|권합니다/.test(text), `권유 표현: ${text}`);
  }
});

test('논문이 본 가격 범위 밖의 가격은 판단하지 않고 알 수 없다고 한다', () => {
  for (const [title, price] of [['아티스트', 38000], ['원장', 29000], ['원장', 100000], ['선생님', 1000], ['선생님', 1000000]]) {
    const r = logic.single({ title, price }, 'hand');
    assert.ok(logic.isOutside(r.shops[0]), `${title} ${price}`);
    const t = r.shops[0].stats;
    assert.ok(messages.unknown.headline(title, t).includes('논문으로는 판단할 수 없어요'));
    const v = logic.consumerView(r);
    assert.ok(v.check.some((x) => x.includes('알 수 없어요') && x.includes('가격대(')));
    // 위치, 중앙값과의 거리, 호칭 인상으로 소비를 받아들이거나 망설일 이유를 만들지 않는다.
    assert.deepEqual(Array.from(v.accept), [messages.consumer.noneAccept]);
    assert.deepEqual(Array.from(v.hesitate), [messages.consumer.noneHesitate]);
  }
  // 범위의 끝(최저가, 최고가)은 범위 안이라 판단한다.
  for (const [title, price] of [['원장', 30000], ['원장', 40000], ['아티스트', 29000], ['아티스트', 35000], ['선생님', 49000]]) {
    assert.ok(!logic.isOutside(logic.single({ title, price }, 'hand').shops[0]), `${title} ${price}`);
  }
  // 두 가게 중 하나만 범위 밖이면 그 가게만 알 수 없다고 하고, 가격 차이 비교는 그대로 한다.
  const two = logic.compare({ title: '원장', price: 100000 }, { title: '아티스트', price: 30000 }, 'hand');
  const tv = logic.consumerView(two);
  assert.ok(tv.check.some((x) => x.startsWith('가게 1(원장)') && x.includes('가격대(') && x.includes('알 수 없어요')));
  assert.ok(!tv.check.some((x) => x.startsWith('가게 2(아티스트)') && x.includes('가격대(')));
  assert.ok(tv.hesitate.some((x) => x.includes('가격 차이') && x.includes('70,000원')));
  assert.ok(tv.accept.some((x) => x.startsWith('가게 2(아티스트)')));
});

test('화면 문구는 쉬운 서비스 말투(해요체)이고 중앙값·"논문의" 같은 딱딱한 말을 쓰지 않는다', () => {
  const texts = [];
  // 가격 위치와 호칭을 바꿔 가며 소비자 입장 문장, 헤드라인, 알아 둘 점을 모은다.
  for (const t of data.menus.hand.titles) {
    for (const price of [t.min - 1000, t.min, t.q1, t.median, t.q3, t.max, t.max + 1000, t.median + 3000, t.median - 3000, t.median + 5000, t.median - 5000]) {
      if (price < data.inputMinWon) continue;
      const one = logic.single({ title: t.name, price }, 'hand');
      const v = logic.consumerView(one);
      texts.push(...v.accept, ...v.hesitate, ...v.check, ...logic.paperExtras(one));
      if (!logic.isOutside(one.shops[0])) texts.push(messages.singleHeadline[one.shops[0].position].replace('{title}', t.name));
      texts.push(messages.medianSuffix(one.shops[0].vsMedian));
    }
  }
  for (const [a, b] of [[35000, 30000], [35000, 34000], [45000, 30000], [30000, 30000]]) {
    const two = logic.compare({ title: '원장', price: a }, { title: '아티스트', price: b }, 'hand');
    const v = logic.consumerView(two);
    texts.push(...v.accept, ...v.hesitate, ...v.check, messages.headline[two.kind]);
  }
  texts.push(...Object.values(messages.feeling.compare), ...Object.values(messages.feeling.single));
  texts.push(...Object.values(messages.positionText), ...messages.limits, messages.paperConclusion, messages.sameTitleNote);
  texts.push(messages.unknown.headline('원장', data.menus.hand.titles[0]), messages.unknown.reason('이 가게', '원장', data.menus.hand.titles[0]));
  const stiff = [/중앙값/, /논문의 [가-힣]+ 가게|논문 속|논문 중앙/, /(입니다|습니다|ㅂ니다)[.?!)\s]*$/];
  for (const text of texts) {
    for (const re of stiff.slice(0, 2)) assert.ok(!re.test(text), `딱딱한 말 ${re}: ${text}`);
    // 문장마다 "...습니다/입니다" 끝맺음이 남아 있지 않다(해요체로 통일).
    for (const sentence of text.split(/(?<=[.?!])\s+/)) {
      assert.ok(!/(습니다|입니다|됩니다|합니다|있습니다)[.?!)]*$/.test(sentence.trim()), `해요체가 아님: ${sentence}`);
    }
  }
  // 연구 결과를 가리키는 문장은 "논문"을 그대로 쓴다.
  const pricey = logic.consumerView(logic.single({ title: '아티스트', price: 34000 }, 'hand'));
  assert.ok(pricey.hesitate.some((x) => x.includes('논문에서는 호칭에 따른 가격 차이가 뚜렷하지 않았어요')));
});

test('서비스 이름이 탭 제목, 첫 화면 제목, README에 같게 들어 있다', () => {
  const NAME = '대구! 갈래? 말래?';
  const html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
  assert.ok(html.includes(`<title>${NAME}</title>`));
  assert.ok(html.includes(`<h1>${NAME}</h1>`));
  const readme = fs.readFileSync(path.join(appDir, 'README.md'), 'utf8');
  assert.equal(readme.split(/\r?\n/)[0], `# ${NAME}`);
  assert.ok(!/가제|대구 직업 호칭 가격 비교/.test(html + readme), '옛 가제가 남아 있음');
});

console.log(`\n${passed}개 통과`);
