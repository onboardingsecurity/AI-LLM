// assets/studio-task-assets/t04-real-information-board/asset-manifest.json에 적힌
// SHA-256·바이트 수를 실제 파일에서 다시 계산해 대조한다.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_DIR = path.join(__dirname, '..', 'assets', 'studio-task-assets', 't04-real-information-board');
const manifest = JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'asset-manifest.json'), 'utf-8'));

console.log(`package_id: ${manifest.package_id}`);
let failCount = 0;
for (const entry of manifest.files) {
  const full = path.join(PKG_DIR, entry.path);
  if (!fs.existsSync(full)) {
    console.log(`FAIL — ${entry.path} (파일 없음)`);
    failCount++;
    continue;
  }
  const buf = fs.readFileSync(full);
  const actual = crypto.createHash('sha256').update(buf).digest('hex');
  const pass = actual === entry.sha256 && buf.length === entry.bytes;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${entry.path}`);
  if (!pass) {
    console.log(`   manifest: ${entry.sha256} (${entry.bytes}B)`);
    console.log(`   실제:     ${actual} (${buf.length}B)`);
    failCount++;
  }
}
console.log(`\n총 ${manifest.files.length}개 파일 중 불일치 ${failCount}건`);
console.log('참고: fixture-manifest.json의 canonical_sha256은 "aleph-json-canonical-v1" 정규화 후 해시라',
  '정규화 규격이 없어 이 스크립트로는 재계산·대조하지 못함(원본 바이트 SHA-256만 asset-manifest.json으로 확인함).');
process.exit(failCount === 0 ? 0 : 1);
