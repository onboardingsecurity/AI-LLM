// 논문 「네일샵 시술자 호칭 유형과 손 젤 원톤 가격 수준의 관계: 대구 지역 탐색적 비교」의 값.
// 표 1(손 젤 원톤 가격, 비교 41곳)과 기준 금액(설문 30명의 중앙값)만 쓴다. 가게 단위 원자료는 들어 있지 않다.
globalThis.App = globalThis.App || {};

App.data = {
  paperTitle: '네일샵 시술자 호칭 유형과 손 젤 원톤 가격 수준의 관계: 대구 지역 탐색적 비교',
  // 기준 금액. 논문에서 응답자 30명이 "확실히 다르다"고 느낀 가격 차이의 중앙값이다.
  thresholdWon: 5000,
  // 표 1에서 곳수가 5곳 이상인 호칭만 넣었다. 나머지 호칭은 1~2곳이라 논문도 해석하지 않았다.
  titles: [
    { name: '원장', shops: 10, median: 35000, q1: 35000, q3: 35000, min: 30000, max: 40000 },
    { name: '디자이너', shops: 9, median: 35000, q1: 35000, q3: 35000, min: 30000, max: 40000 },
    { name: '아티스트', shops: 7, median: 30000, q1: 29000, q3: 32500, min: 29000, max: 35000 },
    { name: '네일리스트', shops: 6, median: 32500, q1: 29250, q3: 38750, min: 29000, max: 40000 },
    { name: '선생님', shops: 5, median: 35000, q1: 30000, q3: 40000, min: 30000, max: 49000 },
  ],
  // 논문이 다룬 직업은 네일 하나뿐이다. 나머지는 이름만 있는 자리이고 가격이나 판단 데이터는 없다.
  // 이름은 비교하려는 호칭 짝을 보여 준다. icon은 assets/icons/job-<icon>.png(누를 수 있는 그림)와 job-<icon>-off.png(준비 중인 회색 그림)다.
  jobs: [
    { id: 'nail', name: '네일', icon: 'nail', ready: true },
    { id: 'cook', name: '요리사 vs 쉐프', icon: 'cook', ready: false },
    { id: 'dev', name: '개발자 vs 엔지니어', icon: 'dev', ready: false },
  ],
  // 입력할 수 있는 가격의 범위(원). 이 밖은 오타로 보고 안내한다.
  inputMinWon: 1000,
  inputMaxWon: 1000000,
};
