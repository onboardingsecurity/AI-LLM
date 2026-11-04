// 판단 규칙. 화면과 무관한 계산만 둔다.
// 두 가게의 가격 차이를 논문의 기준 금액과 비교하고, 각 가격이 논문의 같은 호칭 가격 범위 어디에 있는지 본다.
globalThis.App = globalThis.App || {};

App.logic = (function () {
  const data = App.data;

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

  function findTitle(name) {
    return data.titles.find((t) => t.name === name) || null;
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

  // shopA, shopB는 { title: '원장', price: 35000 } 모양이다. 입력 검증은 호출하는 쪽에서 한다.
  function compare(shopA, shopB) {
    const shops = [shopA, shopB].map((s) => {
      const stats = findTitle(s.title);
      return { title: s.title, price: s.price, stats, position: position(s.price, stats) };
    });
    const diff = Math.abs(shopA.price - shopB.price);
    // 더 비싼 가게. 같으면 첫 번째 가게.
    const pricier = shopB.price > shopA.price ? 1 : 0;
    return {
      diff,
      kind: kindOf(diff),
      sameTitle: shopA.title === shopB.title,
      shops,
      pricier,
    };
  }

  // 같은 입력이면 같은 문장이 나오도록 입력에서 번호를 만든다. cycle은 "다른 한 줄" 버튼 횟수다.
  function seedOf(result, cycle) {
    const titleIndex = (name) => data.titles.findIndex((t) => t.name === name);
    const [a, b] = result.shops;
    return a.price + b.price + titleIndex(a.title) * 7 + titleIndex(b.title) * 13 + cycle;
  }

  function pick(list, seed) {
    return list[((seed % list.length) + list.length) % list.length];
  }

  return { parsePrice, findTitle, position, kindOf, compare, seedOf, pick };
})();
