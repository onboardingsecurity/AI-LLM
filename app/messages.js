// 결과에 붙는 문장들. 쉬운 서비스 말투(해요체)로 쓴다.
// 유머는 쓰지 않는다. 인과를 단정하거나 가게를 가라거나 말라고 권하는 문장도 넣지 않는다.
// 논문이 말한 것(표와 설문의 숫자, 논문의 한계)만 쓰고, 논문이 말하지 않은 것은 "알 수 없어요"라고 쓴다.
// "보통 가격"은 논문의 중앙값을 소비자가 쓰는 말로 바꾼 것이다. 소비자 입장 문장에서는 그 값을 보여 주지 않는다.
// {title}은 호칭 이름으로 바뀐다.
globalThis.App = globalThis.App || {};

App.messages = (function () {
  const data = App.data;
  const won = (n) => n.toLocaleString('ko-KR') + '원';
  const num = (n) => n.toLocaleString('ko-KR');
  const THRESHOLD = '5,000원';

  // "설문에 답한 30명 중 N명은 이 정도 차이면 확실히 다르다고 했어요." 전원이면 "30명 모두".
  const agreeSentence = (n) =>
    '설문에 답한 ' + data.survey.people + '명' + (n === data.survey.people ? ' 모두' : ' 중 ' + n + '명은') + ' 이 정도 차이면 "확실히 다르다"고 했어요.';

  const OTHER_CONDITIONS = '리뷰 수, 위치, 시술 구성 같은 다른 조건도 가격 차이의 이유일 수 있어요.';

  return {
    // 두 가게의 가격 차이를 기준 금액(5,000원)과 비교한 결과 한 줄. 금액은 보이지 않고 작다(A)·적당하다(B, 기준과 같음)·크다(C)로만 말한다.
    headline: {
      A: '두 가게 가격 차이가 작아요.',
      B: '두 가게 가격 차이가 적당해요.',
      C: '두 가게 가격 차이가 커요.',
    },

    // 가게 한 곳의 가격이 같은 호칭 가게들 사이에서 어디쯤인지 한 줄. 범위 밖은 아래 unknown으로 말한다.
    singleHeadline: {
      low: '{title} 가게 가격대에서 싼 편이에요.',
      mid: '{title} 가게들 사이에서 보통 수준이에요.',
      high: '{title} 가게 가격대에서 비싼 편이에요.',
    },

    // 가게 한 곳의 헤드라인 뒤에 붙는, 같은 호칭의 보통 가격(논문의 중앙값)과의 차이. 위치 말만으로 차이가 크게 읽히지 않게 한다.
    medianSuffix(vsMedian) {
      if (vsMedian === 0) return ' (보통 가격과 같아요)';
      return ' (보통 가격보다 ' + won(Math.abs(vsMedian)) + (vsMedian > 0 ? ' 비싸요)' : ' 싸요)');
    },

    // 소비자의 마음이나 판단을 이해해 주는 한 줄. 유머는 쓰지 않고, 상태(작다·중간·크다)마다 하나씩만 둔다.
    // 두 가게는 가격 차이(작다 A, 경계 B, 크다 C)로, 한 곳은 가격대에서의 위치(낮은 쪽, 가운데, 높은 쪽)로 나눈다.
    // 논문이 본 가격 범위 밖은 판단하지 않으므로 이 한 줄도 없다(아래 unknown).
    feeling: {
      compare: {
        A: '가격이 거의 비슷해서, 가격만으로는 고르기 어렵게 느껴질 수 있어요. 이런 때는 다른 조건도 함께 보게 되죠.',
        B: '딱 경계선이라 차이가 큰 건지 작은 건지 헷갈릴 수 있어요. 설문에서도 사람마다 다르게 느끼는 금액이었어요.',
        C: '가격 차이가 꽤 크게 느껴질 수 있어요. 왜 이렇게 다른지 궁금해지는 게 자연스러워요.',
      },
      single: {
        low: '다른 가게보다 가격 부담이 덜해서 마음이 가벼울 수 있어요. 다만 왜 이 가격인지는 숫자만으로는 알 수 없어요.',
        mid: '"이 정도면 무난하네" 싶은 가격이에요. 호칭이 달라도 보통 가격은 비슷한 편이었어요.',
        high: '조금 비싸게 느껴져서 망설여질 수 있어요. 호칭 때문인지 다른 이유인지 궁금해지는 것도 자연스러워요. 다만 이 숫자만으로는 이유를 알 수 없어요.',
      },
    },

    // 이유 칸에 붙이는 위치 설명. 유머 없이 사실만 쓴다.
    positionText: {
      belowMin: '논문에서 본 가장 싼 곳보다도 싸요',
      low: '가격대 아래쪽이에요',
      mid: '가격대 가운데예요',
      high: '가격대 위쪽이에요',
      aboveMax: '논문에서 본 가장 비싼 곳보다도 비싸요',
    },

    // 논문이 본 가격 범위(그 호칭 가게의 최저~최고) 밖의 가격. 논문으로는 판단할 수 없어서 알 수 없다고 말한다.
    unknown: {
      headline(title, t) {
        return '이 가격은 논문에서 본 ' + title + ' 가게들의 가격대(' + won(t.min) + '~' + won(t.max) + ')를 벗어나서, 논문으로는 판단할 수 없어요.';
      },
      reason(label, title, t) {
        return label + ': 논문에서 본 ' + title + ' 가게들의 가격대(' + won(t.min) + '~' + won(t.max) + ')를 벗어난 가격이라, 같은 호칭 가게들 사이에서 어느 정도인지는 알 수 없어요.';
      },
    },

    // 논문의 결론. 결과 화면의 이유 칸에 한 줄로 붙는다.
    paperConclusion: '논문에서는 호칭에 따라 가격이 다르다는 뚜렷한 증거를 찾지 못했어요.',
    sameTitleNote: '두 가게의 호칭이 같아서, 이 가격 차이는 호칭이 달라서 생긴 게 아니에요.',

    // 알아 둘 점. 논문의 한계 절에서 줄여 옮겼다.
    limits: [
      '논문에 나온 가격은 가게가 올린 정상가(비회원가)예요.',
      '호칭별 가게는 많아야 10곳, 설문은 30명이라 표본이 작아요.',
      '차이를 찾지 못했다고 해서, 차이가 없다고 증명한 것은 아니에요.',
      '호칭이 가격을 정하는지는 이 앱이 말하지 않아요.',
    ],

    // 소비자 입장에서 따져 볼 점. 소비를 받아들일 이유 / 소비를 망설일 이유 / 더 확인해 볼 점.
    // 가게를 가라거나 말라고 권하지 않고, 논문 값으로 말할 수 있는 것만 쓴다.
    consumer: {
      titles: { accept: '소비를 받아들일 이유', hesitate: '소비를 망설일 이유', check: '더 확인해 볼 점' },
      noneAccept: '이 자료에서는 소비를 받아들일 이유로 꼽을 만한 게 없어요.',
      noneHesitate: '이 자료에서는 소비를 망설일 이유로 꼽을 만한 게 없어요.',
      otherConditions: OTHER_CONDITIONS,

      // 가격 위치에 따른 점. [[묶음, 문장], ...]을 돌려준다. 보통 가격의 값은 보여 주지 않고 차이만 말한다.
      price(label, s) {
        const abs = Math.abs(s.vsMedian);
        switch (s.position) {
          case 'low':
            return [['accept', label + ': ' + s.title + ' 가게 가격대에서 싼 편이고, 보통 가격보다 ' + won(abs) + ' 싸요.']];
          case 'mid':
            return [[
              'accept',
              label + ': ' + s.title + ' 가게들 사이에서 보통 수준이에요(' +
                (s.vsMedian === 0 ? '보통 가격과 같아요' : '보통 가격보다 ' + won(abs) + (s.vsMedian > 0 ? ' 비싸요' : ' 싸요')) + ').',
            ]];
          case 'high':
            return [['hesitate', label + ': ' + s.title + ' 가게 가격대에서 비싼 편이고, 보통 가격보다 ' + won(abs) + ' 비싸요.']];
          default:
            return [];   // 범위 밖(최저가 미만, 최고가 초과)은 판단하지 않는다. logic.consumerView가 따로 처리한다.
        }
      },

      // 가게 한 곳일 때 보통 가격과의 거리를 기준 금액에 견준 참고 문장. 5,000원 미만이면 null.
      medianGap(s) {
        const abs = Math.abs(s.vsMedian);
        if (abs < data.thresholdWon) return null;
        const note = ' 기준 금액(' + THRESHOLD + ') 이상이에요(참고용).';
        return s.vsMedian > 0
          ? ['hesitate', '보통 가격보다 ' + won(abs) + ' 비싸요.' + note]
          : ['accept', '보통 가격보다 ' + won(abs) + ' 싸요.' + note];
      },

      // 두 가게의 가격 차이. 기준 금액과 설문 응답을 한 줄로.
      gap(result) {
        if (result.kind === 'A') {
          return ['accept', '두 가게 가격 차이는 ' + won(result.diff) + '으로, 기준 금액(' + THRESHOLD + ')보다 작아요.'];
        }
        if (result.kind === 'B') {
          return ['hesitate', '두 가게 가격 차이는 정확히 ' + THRESHOLD + '이에요. ' + agreeSentence(result.agree)];
        }
        return ['hesitate', '두 가게 가격 차이는 ' + won(result.diff) + '으로, 기준 금액(' + THRESHOLD + ')보다 커요. ' + agreeSentence(result.agree)];
      },

      // 가게 한 곳의 호칭에 대한 설문 인상과 가격 위치.
      titleSingle(s) {
        const p = data.profiles[s.title];
        if (!p) return null;
        const high = p.impression.mean < data.impressionHighBelow;
        if (high && s.vsMedian > 0) {
          return ['hesitate', "호칭 '" + s.title + "'의 설문 인상은 전문성이 높게 느껴지는 편이지만, 논문에서는 호칭에 따른 가격 차이가 뚜렷하지 않았어요."];
        }
        if (high) {
          return ['accept', "호칭 '" + s.title + "'의 설문 인상은 전문성이 높게 느껴지는 편인데도 가격은 " + (s.vsMedian === 0 ? '보통 가격과 같아요.' : '보통 가격보다 싸요.')];
        }
        if (s.vsMedian > 0) {
          return ['hesitate', "호칭 '" + s.title + "'의 설문 인상은 낮은 편인데 가격은 보통 가격보다 비싸요."];
        }
        return null;
      },

      // 두 가게의 호칭에 대한 설문 인상 비교. 호칭이 같거나 가격이 같으면 null.
      titlePair(result) {
        if (result.sameTitle || result.diff === 0) return null;
        const hi = result.shops[result.pricier];
        const lo = result.shops[1 - result.pricier];
        const ph = data.profiles[hi.title];
        const pl = data.profiles[lo.title];
        if (!ph || !pl) return null;
        if (ph.impression.mean < pl.impression.mean) {
          if (result.kind === 'A') {
            return ['accept', "더 비싼 가게는 호칭이 '" + hi.title + "'이고, 설문에서 전문성이 높게 느껴지지만 두 가게 가격은 비슷해요."];
          }
          return ['hesitate', "더 비싼 가게는 호칭이 '" + hi.title + "'이고, 설문에서는 '" + lo.title + "'보다 전문성이 높게 느껴지지만, 논문에서는 호칭 사이 가격 차이가 뚜렷하지 않았어요."];
        }
        if (ph.impression.mean > pl.impression.mean && result.kind !== 'A') {
          return ['hesitate', "더 비싼 가게는 호칭이 '" + hi.title + "'이고, 설문에서는 '" + lo.title + "'보다 전문성이 낮게 느껴졌어요. 인상 순서와 가격 순서가 맞지 않아요."];
        }
        return null;
      },

      // 호칭별 리뷰 수의 보통 값(논문의 중앙값, 인기의 대용).
      reviews(label, title) {
        const r = data.profiles[title].reviews;
        return label + ': ' + title + ' 가게 리뷰는 보통 ' + num(r.median) + '개예요.';
      },
    },

    // 호칭의 설문 인상 순위와, 인상 순서와 가격 순서의 관계를 한 줄씩. 결과 화면의 "알아 둘 점" 맨 위에 붙는다.
    extras: {
      impression(title) {
        const i = data.profiles[title].impression;
        return title + ' 호칭은 설문에서 전문성이 높게 느껴지는 순서로 ' + i.rank + '번째예요(설문 호칭 ' + data.survey.titleCount + '개 중).';
      },
      orderVsPrice: '호칭 인상 순서는 가격 순서와 약하게만 맞았어요. 이 순서는 호칭이 주는 인상일 뿐, 실제 실력과는 달라요.',
    },
  };
})();
