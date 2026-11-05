// 판단 규칙. 화면과 무관한 계산만 둔다.
// 가게 한 곳은 논문의 같은 호칭 가격 범위와 견주고, 두 곳이면 가격 차이를 논문의 기준 금액과도 견준다.
globalThis.App = globalThis.App || {};

App.logic = (function () {
  const data = App.data;
  const messages = App.messages;

  // 입력 문자열을 가격(원)으로 바꾼다. 쉼표, 공백, 끝의 "원"은 허용한다.
  function parsePrice(raw) {
    const text = String(raw == null ? '' : raw).replace(/[,\s]/g, '').replace(/원$/, '');
    if (text === '') return { ok: false, error: '가격을 입력해 주세요.' };
    if (!/^\d+$/.test(text)) return { ok: false, error: '숫자만 입력해 주세요. 예: 35000' };
    const value = Number(text);
    if (value < data.inputMinWon || value > data.inputMaxWon) {
      return {
        ok: false,
        error: `${data.inputMinWon.toLocaleString('ko-KR')}원에서 ${data.inputMaxWon.toLocaleString('ko-KR')}원 사이로 입력해 주세요.`,
      };
    }
    return { ok: true, value };
  }

  function menuOf(id) {
    return data.menus[id] || data.menus.hand;
  }

  function findTitle(name, menu) {
    return menuOf(menu || 'hand').titles.find((t) => t.name === name) || null;
  }

  // 가격이 논문의 해당 호칭 가격 범위 어디에 있는지. 낮은 쪽부터 다섯 가지.
  function position(price, t) {
    if (price < t.min) return 'belowMin';
    if (price < t.q1) return 'low';
    if (price <= t.q3) return 'mid';
    if (price <= t.max) return 'high';
    return 'aboveMax';
  }

  // 가격 차이를 기준 금액과 비교한다. A는 미만, B는 같음, C는 초과.
  function kindOf(diff) {
    if (diff < data.thresholdWon) return 'A';
    if (diff === data.thresholdWon) return 'B';
    return 'C';
  }

  // 설문 응답자 중 "이 정도 차이면 확실히 다르다"고 답한 사람 수. 답한 금액이 차이 이하인 사람을 센다.
  function agreeCount(diff) {
    return data.survey.thresholds.reduce((n, t) => (t.won <= diff ? n + t.people : n), 0);
  }

  function describe(shop, menu) {
    const stats = findTitle(shop.title, menu);
    return {
      title: shop.title,
      price: shop.price,
      stats,
      position: position(shop.price, stats),
      vsMedian: shop.price - stats.median,   // 양수면 같은 호칭 중앙값보다 비쌈
    };
  }

  // 가게 한 곳. shop은 { title: '원장', price: 35000 } 모양이다. 입력 검증은 호출하는 쪽에서 한다.
  function single(shop, menu) {
    const id = menuOf(menu || 'hand').id;
    const one = describe(shop, id);
    return {
      mode: 'single',
      menu: id,
      shops: [one],
      medianGap: Math.abs(one.vsMedian),
      pricier: 0,
    };
  }

  // 가게 두 곳.
  function compare(shopA, shopB, menu) {
    const id = menuOf(menu || 'hand').id;
    const shops = [describe(shopA, id), describe(shopB, id)];
    const diff = Math.abs(shopA.price - shopB.price);
    // 더 비싼 가게. 같으면 첫 번째 가게.
    const pricier = shopB.price > shopA.price ? 1 : 0;
    return {
      mode: 'compare',
      menu: id,
      diff,
      kind: kindOf(diff),
      agree: agreeCount(diff),
      sameTitle: shopA.title === shopB.title,
      shops,
      pricier,
    };
  }

  // 입력한 가격이 논문에서 본 그 호칭 가게들의 가격 범위(최저~최고) 밖인지. 밖이면 논문으로는 판단할 수 없다.
  function isOutside(shop) {
    return shop.position === 'belowMin' || shop.position === 'aboveMax';
  }

  // 호칭의 설문 인상이 높게 느껴지는 편인지.
  function impressionHigh(title) {
    const p = data.profiles[title];
    return !!p && p.impression.mean < data.impressionHighBelow;
  }

  // 소비자 입장에서 따져 볼 점. 세 묶음으로 나눈다.
  // accept: 소비를 받아들일 이유, hesitate: 소비를 망설일 이유, check: 더 확인해 볼 점.
  // 가게를 가라거나 말라고 권하지 않고, 논문 값으로 말할 수 있는 것만 쓴다.
  function consumerView(result) {
    const C = messages.consumer;
    const accept = [];
    const hesitate = [];
    const check = [];

    result.shops.forEach((s, i) => {
      const label = result.mode === 'single' ? '이 가게' : '가게 ' + (i + 1) + '(' + s.title + ')';
      check.push(C.reviews(label, s.title));
      if (isOutside(s)) {
        // 논문이 본 가격 범위 밖: 위치, 중앙값과의 거리, 호칭 인상으로 이유를 만들지 않고 알 수 없다고만 한다.
        check.unshift(messages.unknown.reason(label, s.title, s.stats));
        return;
      }
      C.price(label, s).forEach(([bucket, text]) => (bucket === 'accept' ? accept : hesitate).push(text));
      if (result.mode === 'single') {
        const m = C.medianGap(s);
        if (m) (m[0] === 'accept' ? accept : hesitate).push(m[1]);
        const t = C.titleSingle(s);
        if (t) (t[0] === 'accept' ? accept : hesitate).push(t[1]);
      }
    });

    if (result.mode === 'compare') {
      const gap = C.gap(result);
      (gap[0] === 'accept' ? accept : hesitate).push(gap[1]);
      const t = C.titlePair(result);
      if (t) (t[0] === 'accept' ? accept : hesitate).push(t[1]);
      if (result.sameTitle) check.push(messages.sameTitleNote);
    }
    check.push(C.otherConditions);

    if (accept.length === 0) accept.push(C.noneAccept);
    if (hesitate.length === 0) hesitate.push(C.noneHesitate);
    return { accept, hesitate, check };
  }

  // 논문이 더 알려 주는 것: 호칭에 대한 설문 인상과 그 이유, 인상과 가격이 어긋난 사례.
  function paperExtras(result) {
    const E = messages.extras;
    const lines = [];
    const seen = new Set();
    result.shops.forEach((s) => {
      if (seen.has(s.title)) return;
      seen.add(s.title);
      lines.push(E.impression(s.title));
    });
    lines.push(E.orderVsPrice);
    return lines;
  }

  return {
    parsePrice, findTitle, position, kindOf, agreeCount,
    single, compare, isOutside, impressionHigh, consumerView, paperExtras,
  };
})();
