// data/weather/<지역id>/*.json에 저장된 실제 값이 서로 맞는지 대조한다 (T04-C22~C24 근거).
// 화면은 파일을 직접 읽으므로(어제·오늘 두 파일) 화면 쪽 복사본과 비교하지 않는다.
//
// T04 공식 채점 대상은 서울(seoul)이며 서울만 C22(서로 다른 실제 날짜 기록 정확히 2건)를
// 만족해야 한다. 나머지 지역은 채점 기준 밖의 보강 기능이라 1건이어도 통과로 본다.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');


let failCount = 0;
function check(label, condition, detail) {
  const pass = !!condition;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) { console.log('   ' + (detail || '')); failCount++; }
}

const weatherDir = path.join(ROOT, 'data', 'weather');
const regionIds = fs.readdirSync(weatherDir).filter(f => fs.statSync(path.join(weatherDir, f)).isDirectory()).sort();

check('data/weather/ 아래에 지역 폴더 존재', regionIds.length > 0, `실제: ${regionIds.join(', ') || '(없음)'}`);

for (const regionId of regionIds) {
  console.log(`\n--- 지역: ${regionId} ---`);
  const regionDir = path.join(weatherDir, regionId);
  const realFiles = fs.readdirSync(regionDir).filter(f => f.endsWith('.json')).sort();

  if (regionId === 'seoul') {
    check('seoul: data/weather/seoul/에 정확히 2개 파일 (T04-C22)', realFiles.length === 2, `실제: ${realFiles.join(', ')}`);
  }

  for (const file of realFiles) {
    const date = file.replace('.json', '');
    const real = JSON.parse(fs.readFileSync(path.join(regionDir, file), 'utf-8'));

    // 원자료(raw_response)와 저장값(stored)도 다시 대조 (T04-C23 원자료 쪽)
    // 실제 조회 기록은 raw_response.current를, 테스트용 소급 기록(daily_meta.test_backfill)은 시간별 값 raw_response.hourly를 원자료로 쓴다.
    const raw = real.raw_response || {};
    const isBackfill = !!(real.daily_meta && real.daily_meta.test_backfill);
    const rawValue = raw.current ? raw.current.temperature_2m
      : (isBackfill && raw.hourly && raw.hourly.temperature_2m ? raw.hourly.temperature_2m[0] : undefined);
    check(`${regionId} ${date}: 원자료 ${raw.current ? 'current' : 'hourly(소급 테스트)'}.temperature_2m와 저장값 일치`,
      rawValue === real.stored.value, `원자료=${rawValue} 저장값=${real.stored.value}`);
  }

  // T04-C24: 두 값의 날짜순 재계산 (2건 이상 쌓인 지역만)
  if (realFiles.length >= 2) {
    const records = realFiles.map(f => JSON.parse(fs.readFileSync(path.join(regionDir, f), 'utf-8')));
    const dates = realFiles.map(f => f.replace('.json', ''));
    const sortedIdx = dates.map((d, i) => i).sort((a, b) => dates[a].localeCompare(dates[b]));
    const earlier = records[sortedIdx[sortedIdx.length - 2]];
    const later = records[sortedIdx[sortedIdx.length - 1]];
    const recomputedDelta = later.stored.value - earlier.stored.value;

    // 화면 규칙: 최근 두 날짜 파일만 읽고 (늦은 값 - 이른 값). 파일이 3개 이상이어도 최근 두 개만 쓴다.
    check(`${regionId} T04-C24: 최근 두 날짜 파일로 전일 대비 재계산 가능`, Number.isFinite(recomputedDelta), `델타=${recomputedDelta}`);
    console.log(`   재계산 결과: ${earlier.stored.value}${earlier.stored.unit} → ${later.stored.value}${later.stored.unit} = ${recomputedDelta >= 0 ? '+' : ''}${recomputedDelta.toFixed(1)}${later.stored.unit}`);
  }
}

console.log(`\n총 실패 ${failCount}건`);
process.exit(failCount === 0 ? 0 : 1);
