// 논문 「네일샵 시술자 호칭 유형과 손 젤 원톤 가격 수준의 관계: 대구 지역 탐색적 비교」의 값.
// 표 1(손 젤 원톤, 비교 41곳), 표 4의 리뷰 수, 설문 30명의 결과만 쓴다.
// 가게 단위 원자료는 들어 있지 않다.
globalThis.App = globalThis.App || {};

App.data = {
  paperTitle: '네일샵 시술자 호칭 유형과 손 젤 원톤 가격 수준의 관계: 대구 지역 탐색적 비교',
  // 기준 금액. 논문에서 응답자 30명이 "확실히 다르다"고 느낀 가격 차이의 중앙값이다.
  thresholdWon: 5000,

  // 설문 30명(지인 5명, 커뮤니티 25명). 이름과 연락처는 받지 않았다.
  survey: {
    people: 30,
    // "같은 시술에서 가격이 얼마 이상 차이 나면 확실히 다르다고 느끼나요?"에 대한 답. 5,000원 18명, 10,000원 12명.
    thresholds: [
      { won: 5000, people: 18 },
      { won: 10000, people: 12 },
    ],
    // 평소 손 젤 원톤에 내는 가격.
    usualPrice: { median: 35000, min: 28000, max: 50000 },
    // 호칭 7개를 전문성이 높게 느껴지는 순서로 나열하게 했을 때 응답자 사이의 일치도(켄달의 W).
    kendallW: 0.8,
    // 호칭 인상 순서와 가격 중앙값 순서의 스피어만 상관(유형 5개라 검정하지 않음).
    spearman: 0.34,
    titleCount: 7,
  },

  // 시술 메뉴. 표에서 곳수가 5곳 이상인 호칭만 넣었다. 나머지 호칭은 1~2곳이라 논문도 해석하지 않았다.
  menus: {
    hand: {
      id: 'hand',
      name: '손 젤 원톤',
      compared: 41,
      gapWon: 5000,   // 중앙값이 가장 높은 유형(35,000원)과 가장 낮은 유형(아티스트 30,000원)의 차이
      p: 0.146,
      titles: [
        { name: '원장', shops: 10, median: 35000, q1: 35000, q3: 35000, min: 30000, max: 40000 },
        { name: '디자이너', shops: 9, median: 35000, q1: 35000, q3: 35000, min: 30000, max: 40000 },
        { name: '아티스트', shops: 7, median: 30000, q1: 29000, q3: 32500, min: 29000, max: 35000 },
        { name: '네일리스트', shops: 6, median: 32500, q1: 29250, q3: 38750, min: 29000, max: 40000 },
        { name: '선생님', shops: 5, median: 35000, q1: 30000, q3: 40000, min: 30000, max: 49000 },
      ],
    },
  },

  // 호칭마다 따로 붙는 논문 값.
  // impression: 설문의 전문성 순서(7개 호칭 중 순위와 평균 순위, 작을수록 높게 느낌)와 이유 경향.
  // reviews: 호칭이 확인된 포함 58곳의 리뷰 수 중앙값(표 4). 인기의 대용이다.
  // priceNote: 인상 순서와 가격 순서가 어긋난 호칭에 대해 논문이 적은 사실.
  profiles: {
    원장: {
      impression: { rank: 1, mean: 1.87, why: '전문 기술보다 책임자라는 인상이 이유로 많았어요' },
      reviews: { median: 234, shops: 11 },
      priceNote: null,
    },
    디자이너: {
      impression: { rank: 2, mean: 2.53, why: '디자인 역량이나 창의성이 이유로 꼽혔어요' },
      reviews: { median: 551, shops: 15 },
      priceNote: null,
    },
    네일리스트: {
      impression: { rank: 3, mean: 2.8, why: '네일 분야에 특화된 표현이라는 점이 고려되어 순위가 다양하게 흩어졌어요' },
      reviews: { median: 799.5, shops: 10 },
      priceNote: null,
    },
    아티스트: {
      impression: { rank: 4, mean: 2.87, why: '디자인 역량이나 창의성이 이유로 꼽혔어요' },
      reviews: { median: 2073, shops: 9 },
      priceNote: '인상 순위는 4번째인데, 손 젤 원톤의 보통 가격은 가장 싼 30,000원이었어요.',
    },
    선생님: {
      impression: { rank: 5, mean: 5.3, why: '응답자마다 순위가 달랐어요' },
      reviews: { median: 622, shops: 9 },
      priceNote: '인상 순위는 5번째인데, 손 젤 원톤의 보통 가격은 공동 최상위(35,000원)였어요.',
    },
  },

  // 전문성이 높게 느껴진다고 보는 평균 순위의 경계. 이 값보다 작으면 높게 느껴지는 편으로 쓴다.
  impressionHighBelow: 3,

  // 논문이 다룬 직업은 네일 하나뿐이다. 나머지는 이름만 있는 자리이고 가격이나 판단 데이터는 없다.
  // 이름은 비교하려는 호칭 짝을 보여 준다. icon은 assets/icons/job-<icon>.png(누를 수 있는 그림)와 job-<icon>-off.png(준비 중인 회색 그림)다.
  // 열린 직업(ready)에는 services가 있다. 서비스 id는 menus의 키와 같고, ready인 서비스는 menus에 호칭별 값이 있어야 한다.
  // 논문이 다루지 않았거나 아직 판단하지 않는 서비스는 ready: false로 넣으면 선택 화면에 잠긴 칸으로 보이고 누를 수 없다.
  jobs: [
    { id: 'nail', name: '네일', icon: 'nail', ready: true, services: [{ id: 'hand', name: '손 젤 원톤', icon: 'hand', ready: true }] },
    { id: 'cook', name: '요리사 vs 쉐프', icon: 'cook', ready: false },
    { id: 'dev', name: '개발자 vs 엔지니어', icon: 'dev', ready: false },
    // 완전히 잠긴 칸(locked): 아직 어떤 직업인지 정해지지 않았다. 눌러도 아무 일이 없고 알림도 뜨지 않는다.
    { id: 'sealed-1', name: '준비중', icon: 'sealed', ready: false, locked: true },
    { id: 'sealed-2', name: '준비중', icon: 'sealed', ready: false, locked: true },
    { id: 'sealed-3', name: '준비중', icon: 'sealed', ready: false, locked: true },
  ],
  // 입력할 수 있는 가격의 범위(원). 이 밖은 오타로 보고 안내한다.
  inputMinWon: 1000,
  inputMaxWon: 1000000,
};

// 이전 이름. 손 젤 원톤 호칭 목록과 같은 배열이다.
App.data.titles = App.data.menus.hand.titles;
