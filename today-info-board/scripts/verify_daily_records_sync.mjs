// web/index.html에 넣은 DAILY_RECORDS_BY_REGION(전일 대비용)이
// data/weather/<지역id>/*.json에 저장된 실제 값과 정확히 같은지 대조한다 (T04-C23 근거).
//
// T04 공식 채점 대상은 서울(seoul)이며 서울만 C22(서로 다른 실제 날짜 기록 정확히 2건)를
// 만족해야 한다. 나머지 지역은 채점 기준 밖의 보강 기능이라 1건이어도 통과로 본다.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const html = fs.readFileSync(path.join(ROOT, 'web', 'index.html'), 'utf-8');
const m = html.match(/\/\/ --- DAILY-RECORDS-SYNC-START ---\n([\s\S]*?)\/\/ --- DAILY-RECORDS-SYNC-END ---/);
if (!m) {
  console.error('FAIL — index.html에서 DAILY-RECORDS-SYNC 구간을 찾지 못함');
  process.exit(1);
}
const { DAILY_RECORDS_BY_REGION } = new Function(`${m[1]}\nreturn { DAILY_RECORDS_BY_REGION };`)();

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
  const DAILY_RECORDS = DAILY_RECORDS_BY_REGION[regionId] || [];

  if (regionId === 'seoul') {
    check('seoul: data/weather/seoul/에 정확히 2개 파일 (T04-C22)', realFiles.length === 2, `실제: ${realFiles.join(', ')}`);
  }
  check(`${regionId}: 실제 파일 수 == 화면 임베드 레코드 수`, realFiles.length === DAILY_RECORDS.length,
    `실제=${realFiles.length}, 임베드=${DAILY_RECORDS.length}`);

  for (const file of realFiles) {
    const date = file.replace('.json', '');
    const real = JSON.parse(fs.readFileSync(path.join(regionDir, file), 'utf-8'));
    const embedded = DAILY_RECORDS.find(r => r.date === date);

    check(`${regionId} ${date}: 화면에 임베드된 레코드 존재`, !!embedded);
    if (!embedded) continue;

    check(`${regionId} ${date}: value 일치`, embedded.value === real.stored.value,
      `임베드=${embedded.value} 원본=${real.stored.value}`);
    check(`${regionId} ${date}: unit 일치`, embedded.unit === real.stored.unit);
    check(`${regionId} ${date}: source 일치`, embedded.source === real.stored.source);
    check(`${regionId} ${date}: source_url 일치`, embedded.source_url === real.stored.source_url);
    check(`${regionId} ${date}: source_time 일치`, embedded.source_time === real.stored.source_time,
      `임베드=${embedded.source_time} 원본=${real.stored.source_time}`);
    // 원자료(raw_response)와 저장값(stored)도 다시 대조 (T04-C23 원자료 쪽)
    check(`${regionId} ${date}: 원자료 current.temperature_2m와 저장값 일치`,
      real.raw_response.current.temperature_2m === real.stored.value);
  }

  // T04-C24: 두 값의 날짜순 재계산이 화면 표시 규칙과 같은지 (2건 이상 쌓인 지역만)
  if (realFiles.length >= 2) {
    const records = realFiles.map(f => JSON.parse(fs.readFileSync(path.join(regionDir, f), 'utf-8')));
    const dates = realFiles.map(f => f.replace('.json', ''));
    const sortedIdx = dates.map((d, i) => i).sort((a, b) => dates[a].localeCompare(dates[b]));
    const earlier = records[sortedIdx[0]];
    const later = records[sortedIdx[sortedIdx.length - 1]];
    const recomputedDelta = later.stored.value - earlier.stored.value;

    const sortedEmbed = DAILY_RECORDS.slice().sort((a, b) => a.date.localeCompare(b.date));
    const embedDelta = sortedEmbed[sortedEmbed.length - 1].value - sortedEmbed[0].value;

    check(`${regionId} T04-C24: 원자료 기준 재계산 델타 == 화면 규칙(늦은 값-이른 값) 델타`,
      Math.abs(recomputedDelta - embedDelta) < 1e-9,
      `원자료 기준=${recomputedDelta.toFixed(2)}, 화면 임베드 기준=${embedDelta.toFixed(2)}`);
    console.log(`   재계산 결과: ${earlier.stored.value}${earlier.stored.unit} → ${later.stored.value}${later.stored.unit} = ${recomputedDelta >= 0 ? '+' : ''}${recomputedDelta.toFixed(1)}${later.stored.unit}`);
  }
}

console.log(`\n총 실패 ${failCount}건`);
process.exit(failCount === 0 ? 0 : 1);
