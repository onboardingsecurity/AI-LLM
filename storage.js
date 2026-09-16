// 요구사항 4단계: 보존 대상(순위 기록)만 localStorage에 저장한다.
// 빈 값/손상값 모두 안전한 기본값으로 폴백한다 (T02-C24, T02-C25).

var RankingStorage = (function () {
  var STORAGE_KEY = "spot-the-diff:rankings";
  var SCHEMA_VERSION = 1;

  function defaultData() {
    return { version: SCHEMA_VERSION, records: [] };
  }

  function isValidRecord(r) {
    return (
      r &&
      typeof r === "object" &&
      typeof r.name === "string" &&
      r.name.trim().length > 0 &&
      typeof r.totalTimeSeconds === "number" &&
      isFinite(r.totalTimeSeconds) &&
      r.totalTimeSeconds >= 0
    );
  }

  function isValidData(data) {
    if (!data || typeof data !== "object") return false;
    if (data.version !== SCHEMA_VERSION) return false;
    if (!Array.isArray(data.records)) return false;
    return data.records.every(isValidRecord);
  }

  function load() {
    var raw;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return defaultData();
    }

    if (raw === null || raw === undefined) {
      return defaultData(); // T02-C24: 빈 저장값
    }

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      var fallback = defaultData();
      save(fallback); // 손상값을 정상 기본값으로 즉시 재저장
      return fallback; // T02-C25: 손상 저장값
    }

    if (!isValidData(parsed)) {
      var fallback2 = defaultData();
      save(fallback2);
      return fallback2; // T02-C25: 스키마 불일치도 손상값으로 취급
    }

    return parsed;
  }

  function save(data) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // 저장 실패해도 게임은 계속 진행되어야 한다 (조용히 무시)
    }
  }

  function addRecord(name, totalTimeSeconds) {
    var data = load();
    data.records.push({
      name: name,
      totalTimeSeconds: totalTimeSeconds,
      achievedAt: new Date().toISOString(),
    });
    save(data);
    return data;
  }

  function getSortedRecords() {
    var data = load();
    return data.records.slice().sort(function (a, b) {
      return a.totalTimeSeconds - b.totalTimeSeconds;
    });
  }

  return {
    addRecord: addRecord,
    getSortedRecords: getSortedRecords,
  };
})();
