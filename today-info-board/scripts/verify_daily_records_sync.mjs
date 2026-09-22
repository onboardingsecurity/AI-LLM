// web/index.html에 넣은 DAILY_RECORDS(전일 대비용)가
// data/weather/*.json에 저장된 실제 값과 정확히 같은지 대조한다 (T04-C23 근거).

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
const { DAILY_RECORDS } = new Function(`${m[1]}\nreturn { DAILY_RECORDS };`)();

let failCount = 0;
function check(label, condition, detail) {
  const pass = !!condition;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) { console.log('   ' + (detail || '')); failCount++; }
}

const weatherDir = path.join(ROOT, 'data', 'weather');
const realFiles = fs.readdirSync(weatherDir).filter(f => f.endsWith('.json')).sort();

check('data/weather/에 정확히 2개 파일 (T04-C22)', realFiles.length === 2, `실제: ${realFiles.join(', ')}`);
check('화면 임베드 레코드도 정확히 2건', DAILY_RECORDS.length === 2);

for (const file of realFiles) {
  const date = file.replace('.json', '');
  const real = JSON.parse(fs.readFileSync(path.join(weatherDir, file), 'utf-8'));
  const embedded = DAILY_RECORDS.find(r => r.date === date);

  check(`${date}: 화면에 임베드된 레코드 존재`, !!embedded);
  if (!embedded) continue;

  check(`${date}: value 일치`, embedded.value === real.stored.value,
    `임베드=${embedded.value} 원본=${real.stored.value}`);
  check(`${date}: unit 일치`, embedded.unit === real.stored.unit);
  check(`${date}: source 일치`, embedded.source === real.stored.source);
  check(`${date}: source_url 일치`, embedded.source_url === real.stored.source_url);
  check(`${date}: source_time 일치`, embedded.source_time === real.stored.source_time,
    `임베드=${embedded.source_time} 원본=${real.stored.source_time}`);
  // 원자료(raw_response)와 저장값(stored)도 다시 대조 (T04-C23 원자료 쪽)
  check(`${date}: 원자료 current.temperature_2m와 저장값 일치`,
    real.raw_response.current.temperature_2m === real.stored.value);
}

// T04-C24: 두 값의 날짜순 재계산이 화면 표시 규칙과 같은지
if (realFiles.length === 2) {
  const [d1, d2] = realFiles.map(f => JSON.parse(fs.readFileSync(path.join(weatherDir, f), 'utf-8')));
  const dates = realFiles.map(f => f.replace('.json', ''));
  const sortedIdx = dates[0] < dates[1] ? [0, 1] : [1, 0];
  const earlier = [d1, d2][sortedIdx[0]];
  const later = [d1, d2][sortedIdx[1]];
  const recomputedDelta = later.stored.value - earlier.stored.value;

  const sortedEmbed = DAILY_RECORDS.slice().sort((a, b) => a.date.localeCompare(b.date));
  const embedDelta = sortedEmbed[sortedEmbed.length - 1].value - sortedEmbed[0].value;

  check('T04-C24: 원자료 기준 재계산 델타 == 화면 규칙(늦은 값-이른 값) 델타',
    Math.abs(recomputedDelta - embedDelta) < 1e-9,
    `원자료 기준=${recomputedDelta.toFixed(2)}, 화면 임베드 기준=${embedDelta.toFixed(2)}`);
  console.log(`   재계산 결과: ${earlier.stored.value}${earlier.stored.unit} → ${later.stored.value}${later.stored.unit} = ${recomputedDelta >= 0 ? '+' : ''}${recomputedDelta.toFixed(1)}${later.stored.unit}`);
}

console.log(`\n총 실패 ${failCount}건`);
process.exit(failCount === 0 ? 0 : 1);
