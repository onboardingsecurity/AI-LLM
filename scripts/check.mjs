#!/usr/bin/env node
// 요구사항·보안 점검. 읽기 전용이다: 파일을 쓰지 않고, 네트워크를 쓰지 않고, git 만 고정 인자로 부른다.
// 사용: node scripts/check.mjs [req|sec]   (인자가 없으면 둘 다)
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SELF = 'scripts/check.mjs';
const NARRATIVE = 'NARRATIVE.md';
const SEC_DOC = 'docs/SECURITY-CHECKLIST.md';

const OK = '✅', WIP = '⏳', ASK = '➖', NG = '❌';
const row = (id, name, status, note) => ({ id, name, status, note });
const frag = (...parts) => new RegExp(parts.join(''));

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const gitOk = (...args) => { try { git(...args); return true; } catch { return false; } };

// ---------- 파일 목록 ----------
const BINARY = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.docx', '.zip', '.ico']);
function listFiles() {
  let names;
  try { names = git('ls-files', '-co', '--exclude-standard').split('\n').filter(Boolean); }
  catch { names = []; }
  return [...new Set(names)].filter((f) => existsSync(join(ROOT, f)) && statSync(join(ROOT, f)).isFile());
}
const FILES = listFiles();
const isText = (f) => !BINARY.has(extname(f).toLowerCase()) && statSync(join(ROOT, f)).size < 2_000_000;
const TEXT_FILES = FILES.filter(isText);
const CODE_FILES = TEXT_FILES.filter((f) => ['.js', '.mjs', '.cjs', '.html'].includes(extname(f)));

// 패턴에 걸린 곳을 file:line 으로만 돌려준다(걸린 내용은 출력하지 않는다).
function scan(files, re) {
  const hits = [];
  for (const f of files) {
    read(f).split('\n').forEach((line, i) => { if (re.test(line)) hits.push(`${f}:${i + 1}`); });
  }
  return hits;
}
const where = (hits) => {
  const uniq = [...new Set(hits)];
  return uniq.slice(0, 5).join(', ') + (uniq.length > 5 ? ` 외 ${uniq.length - 5}곳` : '');
};

// ---------- 서사 문서 읽기 ----------
const PH = /【사용자 작성/;
const filled = (s) => !!s && s.trim() !== '' && !PH.test(s);
const compact = (s) => s.replace(/\s/g, '').length;

const stripHints = (s) => s.split('\n').filter((l) => !l.startsWith('>')).join('\n').replace(/<!--[\s\S]*?-->/g, '');
const NARR_RAW = existsSync(join(ROOT, NARRATIVE)) ? read(NARRATIVE) : '';
const NARR = stripHints(NARR_RAW);

function sectionMap(text) {
  const map = {};
  for (const part of text.split(/\n(?=## )/)) {
    const m = part.match(/^## (\d+)\./);
    if (m) map[m[1]] = part;
  }
  return map;
}
const SEC = sectionMap(NARR);
const subs = (sec = '') => sec.split(/\n(?=### )/).filter((b) => b.startsWith('### '));
const field = (block, key) => (block.match(new RegExp(`^- ${key}:[ \\t]*(.*)$`, 'm')) || [])[1] || '';
const cell = (block, label) => {
  const line = block.split('\n').find((l) => l.startsWith(`| ${label} |`));
  return line ? line.split('|')[2].trim() : '';
};
const tableRows = (block = '') => block.split('\n').filter((l) => l.startsWith('|') && !/^\|\s*-/.test(l)).slice(1)
  .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
const ticked = (block, text) => new RegExp(`^- \\[x\\] ${text}`, 'mi').test(block);
const body = (block = '') => block.split('\n').filter((l) => !l.startsWith('#') && !l.startsWith('- [') && !l.startsWith('|')).join('\n').trim();

const DATE = /\d{4}-\d{2}-\d{2}|\d{1,2}월 \d{1,2}일/;
const MY_NAME = (NARR.split('\n').filter((l) => l.trim()).slice(0, 6).join('\n').match(/^\*\*이름:\*\*\s*(.+)$/m) || [])[1] || '';

// ---------- 요구사항 ----------
function recordsText() {
  const dir = join(ROOT, 'records');
  if (!existsSync(dir)) return '';
  return readdirSync(dir).filter((n) => !['README.md', 'names-to-hide.txt'].includes(n) && !n.startsWith('.'))
    .map((n) => { try { return readFileSync(join(dir, n), 'utf8'); } catch { return ''; } }).join('\n');
}
function dateForms(d) {
  const m = d.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? [d, `${m[1]}.${m[2]}.${m[3]}`, `${m[1]}/${m[2]}/${m[3]}`, `${+m[2]}월 ${+m[3]}일`] : [d];
}

function checkRequirements() {
  const out = [];
  const none = !NARR_RAW;

  // 카드 1
  out.push(row('T09-C01', '서사 문서 첫머리에 본인 이름', none ? NG : filled(MY_NAME) ? OK : WIP,
    none ? `${NARRATIVE} 없음` : filled(MY_NAME) ? '첫머리 이름 줄에 이름이 있음' : '이름 줄이 비어 있음'));

  const s1 = SEC['1'] || '';
  const picks = tableRows(s1).filter((c) => filled(c[0]) && DATE.test(c[0]) && filled(c[1]));
  const rec = recordsText();
  let c02, n02;
  if (!picks.length) { c02 = WIP; n02 = '날짜와 대목이 적힌 줄이 없음'; }
  else if (!ticked(s1, '위 대목은 내가 직접')) { c02 = WIP; n02 = `${picks.length}줄 있음, 직접 고른 것인지 체크 칸이 비어 있음`; }
  else if (!rec.trim()) { c02 = ASK; n02 = `${picks.length}줄 있음, records/에 원문이 없어 날짜를 원문과 대조하지 못함`; }
  else {
    const missing = picks.filter((c) => !dateForms(c[0].match(/\d{4}-\d{2}-\d{2}/)?.[0] || c[0]).some((f) => rec.includes(f))).map((c) => c[0]);
    c02 = missing.length ? WIP : OK;
    n02 = missing.length ? `원문에서 찾지 못한 날짜: ${missing.join(', ')}` : `${picks.length}줄의 날짜를 원문에서 모두 찾음`;
  }
  out.push(row('T09-C02', '직접 고른 대목이 날짜와 함께 적혀 있음', c02, n02));

  // 카드 2
  const s2 = SEC['2'] || '';
  const rules = s2.split('\n').filter((l) => /^R\d+\.\s*\S/.test(l) && filled(l));
  const mine = ticked(s2, '규칙과 우선순위를 내 말로');
  const mineNote = mine ? '' : ', 내 말로 고쳤다는 체크 칸이 비어 있음';
  out.push(row('T09-C03', '에이전트 규칙 다섯 개 이상', rules.length >= 5 && mine ? OK : WIP, `규칙 ${rules.length}개${mineNote}`));
  const fill = rules.filter((l) => /기록(이|에) 없/.test(l) && /(채|이어|잇)/.test(l));
  out.push(row('T09-C04', '기록이 없어도 서사를 채우는 규칙', fill.length && mine ? OK : WIP,
    (fill.length ? `${fill[0].split('.')[0]}가 해당` : '해당 규칙을 찾지 못함') + mineNote));
  const prio = s2.split('\n').filter((l) => l.startsWith('우선순위:'));
  out.push(row('T09-C05', '규칙이 부딪칠 때의 우선순위 한 줄', prio.length === 1 && filled(prio[0].slice(5)) && mine ? OK : WIP,
    (prio.length === 1 ? '우선순위 한 줄 있음' : `우선순위 줄 ${prio.length}개`) + mineNote));

  // 카드 3
  const s3 = subs(SEC['3']);
  const strengths = s3.filter((b) => /^### 강점 \d/.test(b));
  const named = strengths.filter((b) => filled(b.split('\n')[0].replace(/^### 강점 \d+\.?/, '')));
  out.push(row('T09-C06', '강점이 세 개 이상', named.length >= 3 ? OK : WIP, `이름이 있는 강점 ${named.length}개`));
  const count = (test) => strengths.filter(test).length;
  const nDate = count((b) => filled(cell(b, '날짜 있는 장면')) && DATE.test(cell(b, '날짜 있는 장면')));
  out.push(row('T09-C07', '강점마다 날짜가 적힌 장면', strengths.length >= 3 && nDate === strengths.length ? OK : WIP, `${nDate}/${strengths.length}개 강점`));
  const nPeer = count((b) => filled(cell(b, '동료가 말한 것 / 자신의 느낌')));
  out.push(row('T09-C08', '강점마다 동료가 말한 것 또는 자신의 느낌', strengths.length >= 3 && nPeer === strengths.length ? OK : WIP, `${nPeer}/${strengths.length}개 강점`));
  const nTask = count((b) => filled(cell(b, '1~8번 과제에서 드러난 것')) && /[1-8]\s*번/.test(cell(b, '1~8번 과제에서 드러난 것')));
  out.push(row('T09-C09', '강점마다 1~8번 과제 중 관련된 것', strengths.length >= 3 && nTask === strengths.length ? OK : WIP, `${nTask}/${strengths.length}개 강점`));
  const erased = tableRows(s3.find((b) => b.startsWith('### 지운 항목')) || '').filter((c) => filled(c[0]) && filled(c[1]));
  out.push(row('T09-C10', '지운 항목과 이유가 하나 이상', erased.length ? OK : WIP, `이유가 있는 지운 항목 ${erased.length}개`));

  // 카드 4
  const s4 = subs(SEC['4']);
  const part = (p) => s4.find((b) => b.startsWith(`### ${p}`)) || '';
  const [b1, b2, b3, b4, b5, b6] = ['4-1', '4-2', '4-3', '4-4', '4-5', '4-6'].map(part);
  const lack = [];
  if (!/\d{4}/.test(field(b1, '연도'))) lack.push('고난 연도');
  for (const k of ['장소', '장면', '그때 바꾼 것']) if (!filled(field(b1, k))) lack.push(`고난 ${k}`);
  if (!ticked(b1, '이 일은 과정에 오기 전')) lack.push('과정 이전 체크');
  for (const k of ['날짜', '장면']) if (!filled(field(b2, k))) lack.push(`다시 일어난 날 ${k}`);
  for (const k of ['달라진 점', '앞으로 하고 싶은 것']) if (!filled(field(b3, k))) lack.push(`더 나아진 나 ${k}`);
  out.push(row('T09-C11', '고난·다시 일어난 날·더 나아진 나 세 부분', lack.length ? WIP : OK, lack.length ? `비어 있음: ${lack.join(', ')}` : '세 부분이 모두 있고 고난은 연도·장소·과정 이전 체크가 있음'));

  const t3 = body(b4), t1 = body(b5);
  const problems = [];
  if (!filled(t3) || compact(t3) < 300) problems.push('3인칭 초안이 비었거나 짧음');
  else if (!t3.includes('님은')) problems.push('3인칭 초안에 "님은"이 없음');
  if (!filled(t1) || compact(t1) < 300) problems.push('1인칭 완성본이 비었거나 짧음');
  else if (!/(저는|나는|제가|내가)/.test(t1)) problems.push('1인칭 완성본에 1인칭 표현이 없음');
  out.push(row('T09-C12', '3인칭 초안과 1인칭 완성본', problems.length ? WIP : OK, problems.length ? problems.join(', ') : `3인칭 ${compact(t3)}자, 1인칭 ${compact(t1)}자`));

  const peers = tableRows(b6).filter((c) => filled(c[1]) && filled(c[2]));
  out.push(row('T09-C13', '동료 두 사람의 답이 이름 없이 적힘', peers.length >= 2 && ticked(b6, '답에 동료의 이름') ? OK : WIP,
    `답이 채워진 동료 ${peers.length}명, 이름 없음 체크 ${ticked(b6, '답에 동료의 이름') ? '함' : '안 함'}`));

  // 카드 5
  const s5 = SEC['5'] || '';
  const letter = body(s5), len = compact(letter);
  const boxes = ['본인 이름이', '강점 셋이', '고비 한 장면이', '지금 하고 싶은 것이', '첫 문장과 마지막 문장은'].filter((t) => !ticked(s5, t));
  const p14 = [];
  if (!filled(letter)) p14.push('자기소개서가 비어 있음');
  else {
    if (len < 700 || len > 1300) p14.push(`분량 ${len}자(1,000자 안팎이 목표)`);
    if (filled(MY_NAME) && !letter.includes(MY_NAME)) p14.push('본문에 이름이 없음');
  }
  if (boxes.length) p14.push(`체크 안 된 칸 ${boxes.length}개`);
  out.push(row('T09-C14', '자기소개서에 이름·강점 셋·고비·하고 싶은 것', p14.length ? WIP : OK, p14.length ? p14.join(', ') : `${len}자, 확인 칸 모두 체크`));

  const s6 = subs(SEC['6'] ? SEC['6'] : '');
  const proof = s6.filter((b) => /^### 강점 \d 아래/.test(b));
  const proofOk = proof.filter((b) => filled(body(b)) && /[1-8]\s*번/.test(body(b)));
  const s6text = SEC['6'] || '';
  const p15 = [];
  if (!filled(MY_NAME) || !s6text.includes(`**이름:** ${MY_NAME}`)) p15.push('포트폴리오 이름 줄이 비었거나 다름');
  if (proofOk.length < 3) p15.push(`증거가 있는 강점 ${proofOk.length}/3`);
  if (!/10번/.test(s6text) || !/11번/.test(s6text)) p15.push('비워 둘 자리 표시 없음');
  out.push(row('T09-C15', '포트폴리오 뼈대에 이름과 강점별 1~8번 산출물', p15.length ? WIP : OK, p15.length ? p15.join(', ') : '이름, 강점 3개의 증거, 비워 둔 자리가 있음'));

  const s7 = SEC['7'] || '';
  const labels = ['AI에게 맡긴 일', '내가 직접 판단한 일', 'AI 제안을 따르지 않은 일'];
  const have = labels.filter((l) => filled((s7.match(new RegExp(`^- \\*\\*${l}:\\*\\*\\s*(.*)$`, 'm')) || [])[1]));
  out.push(row('T09-C16', '제출문 세 가지가 나뉘어 적힘', have.length === 3 ? OK : WIP, `${have.length}/3개 작성`));

  const s8 = SEC['8'] || '';
  out.push(row('T09-C17', '짧은 확인 방법에 자기소개서·강점 지도 위치', filled(s8) && s8.includes('자기소개서') && s8.includes('강점 지도') ? OK : WIP,
    filled(s8) ? '두 위치가 적혀 있음' : '비어 있거나 위치가 빠짐'));

  const narrFiles = readdirSync(ROOT).filter((n) => /^NARRATIVE\./.test(n));
  const okExt = narrFiles.length === 1 && ['.md', '.txt', '.docx'].includes(extname(narrFiles[0]));
  out.push(row('T09-C18', '서사 문서 파일 한 개(DOCX·MD·TXT), 계정 없이 열림', okExt ? OK : NG, `NARRATIVE 파일 ${narrFiles.length}개: ${narrFiles.join(', ') || '없음'}`));

  const urls = NARR_RAW.match(/https?:\/\/[^\s)>\]]+/g) || [];
  out.push(row('T09-C19', '제출 URL이 로그인 없이 열림', urls.length ? ASK : OK,
    urls.length ? `서사 문서에 URL ${urls.length}개: 시크릿 창에서 열어 확인(사용자)` : 'URL을 제출하지 않음(문서 안 목차로 제출)'));

  // C26
  const personal = scan(NARR_RAW ? [NARRATIVE] : [], PERSONAL);
  const secret = scan(NARR_RAW ? [NARRATIVE] : [], SECRET);
  const names = hideNames();
  const nameHits = names.length ? scan(NARR_RAW ? [NARRATIVE] : [], nameRe(names)) : [];
  let c26, n26;
  if (personal.length || secret.length || nameHits.length) { c26 = NG; n26 = `발견: ${where([...personal, ...secret, ...nameHits])}`; }
  else if (!names.length) { c26 = ASK; n26 = '연락처·키 패턴은 없음. records/names-to-hide.txt가 없어 다른 사람 이름은 대조하지 못함'; }
  else { c26 = OK; n26 = `연락처·키 패턴 없음, 가릴 이름 ${names.length}명 대조 결과 없음`; }
  out.push(row('T09-C26', '본인 외 실명·연락처와 비밀번호·토큰이 없음', c26, n26));

  return out;
}

// ---------- 보안 ----------
const SECRET = /AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{20,}|BEGIN [A-Z ]*PRIVATE KEY|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-|(api[_-]?key|secret|token|password)\s*[:=]\s*['"]?[A-Za-z0-9_-]{12,}/i;
const PERSONAL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}|\b0\d{1,2}-\d{3,4}-\d{4}\b|\b01\d{9}\b|\b\d{6}-[1-4]\d{6}\b|\/Users\/|\/home\/[a-z]|C:\\Users\\/;
const hideNames = () => {
  const p = join(ROOT, 'records/names-to-hide.txt');
  return existsSync(p) ? readFileSync(p, 'utf8').split('\n').map((s) => s.trim()).filter((s) => s.length >= 2) : [];
};
const nameRe = (names) => new RegExp(names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'));

const EXTERNAL = new RegExp([
  frag('fetch', '\\(').source, frag('XMLHttp', 'Request').source, frag('Web', 'Socket').source,
  frag('https?', ':\\/\\/').source, frag("from ['\"]node:(", 'http|https|net|dns|tls|dgram', ')').source,
].join('|'));
const DANGEROUS = new RegExp([
  frag('ev', 'al\\(').source, frag('new ', 'Function').source, frag('inner', 'HTML').source, frag('document\\.', 'write').source,
].join('|'));
const WRITES = new RegExp([
  frag('(write|append)', 'File').source, frag('create', 'WriteStream').source,
  frag('\\b(mkdir|unlink|rmdir|rename|copyFile|symlink|truncate)', '(Sync)?\\(').source, frag('\\brm', '(Sync)?\\(').source,
].join('|'));

function secDocStatus(id) {
  if (!existsSync(join(ROOT, SEC_DOC))) return null;
  const line = read(SEC_DOC).split('\n').find((l) => l.startsWith(`| ${id} |`));
  const cellText = line ? (line.split('|')[4] || '').trim() : '';
  return [OK, WIP, ASK, NG].find((s) => cellText.startsWith(s)) || null;
}

function checkSecurity() {
  const out = [];
  const patternFiles = TEXT_FILES.filter((f) => f !== SELF);

  const secrets = scan(patternFiles, SECRET);
  out.push(row('S01', '비밀키·토큰·API 키 값이 파일에 없음', secrets.length ? NG : OK, secrets.length ? `발견: ${where(secrets)}` : `검사한 파일 ${patternFiles.length}개에서 패턴 없음`));

  const ignored = ['records/ritual-records.txt', 'records/names-to-hide.txt', '.env', '.env.local', 'node_modules/x'];
  const notIgnored = ignored.filter((f) => !gitOk('check-ignore', '-q', f));
  out.push(row('S02', '기록 원문·키 파일·node_modules가 저장소에서 제외됨', notIgnored.length ? NG : OK, notIgnored.length ? `제외 안 됨: ${notIgnored.join(', ')}` : `${ignored.length}개 경로가 모두 ignore 됨`));

  let remote = '';
  try { remote = git('remote', '-v').trim(); } catch { /* git 저장소가 아님 */ }
  const cred = /\/\/[^/@\s]+@/.test(remote);
  out.push(row('S03', 'git 원격 주소에 아이디·토큰이 없음', cred ? NG : OK, remote ? (cred ? '원격 주소에 자격증명이 들어 있음' : '원격 주소에 자격증명 없음') : '원격 주소 없음'));

  const personal = scan(patternFiles, PERSONAL);
  out.push(row('S04', '이메일·전화·주민번호형·내 컴퓨터 경로가 없음', personal.length ? NG : OK, personal.length ? `발견: ${where(personal)}` : '패턴 없음'));

  const names = hideNames();
  const nameHits = names.length ? scan(patternFiles, nameRe(names)) : [];
  out.push(row('S05', '다른 사람 이름 목록과 대조해 제출물에 없음', nameHits.length ? NG : names.length ? OK : ASK,
    nameHits.length ? `발견: ${where(nameHits)}` : names.length ? `가릴 이름 ${names.length}명 대조 결과 없음` : 'records/names-to-hide.txt가 없어 대조하지 못함(사용자가 목록을 만들어야 함)'));

  const rawRecords = FILES.filter((f) => f.startsWith('records/') && f !== 'records/README.md');
  out.push(row('S06', '리추얼 기록 원문이 올라갈 파일에 없음', rawRecords.length ? NG : OK, rawRecords.length ? `올라갈 파일에 포함됨: ${rawRecords.join(', ')}` : 'records/에는 README.md만 올라감'));

  const ext = scan(CODE_FILES, EXTERNAL);
  out.push(row('S07', '코드가 외부로 연결하지 않음', ext.length ? NG : OK, ext.length ? `발견: ${where(ext)}` : `코드 파일 ${CODE_FILES.length}개에서 fetch·소켓·URL 없음`));

  const danger = scan(CODE_FILES, DANGEROUS);
  out.push(row('S08', '위험한 API를 쓰지 않음', danger.length ? NG : OK, danger.length ? `발견: ${where(danger)}` : '없음'));

  let deps = 0;
  if (existsSync(join(ROOT, 'package.json'))) {
    const pkg = JSON.parse(read('package.json'));
    deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies }).length;
  }
  out.push(row('S09', '외부 패키지에 의존하지 않음', deps ? WIP : OK, deps ? `의존성 ${deps}개: npm audit로 확인 필요` : '의존성 0개'));

  const writes = scan(CODE_FILES, WRITES);
  out.push(row('S10', '점검 코드가 파일을 쓰거나 지우지 않음', writes.length ? NG : OK, writes.length ? `발견: ${where(writes)}` : '쓰기·삭제 API 없음(프로젝트 폴더 밖 변경 없음)'));

  const callRe = new RegExp(frag('exec', 'FileSync\\(\\s*\'([^\']+)\'').source, 'g');
  const programs = new Set();
  for (const f of CODE_FILES) for (const m of read(f).matchAll(callRe)) programs.add(m[1]);
  const otherChild = scan(CODE_FILES.filter((f) => f !== SELF), frag('child_', 'process'));
  const loose = scan(CODE_FILES, frag('\\b(exec|spawn|spawnSync|execSync)', '\\('));
  const bad = [...programs].filter((p) => p !== 'git');
  out.push(row('S11', '외부 프로그램은 git 하나만 부름', bad.length || otherChild.length || loose.length ? NG : OK,
    bad.length || otherChild.length || loose.length ? `git 외 호출: ${[...bad, ...otherChild, ...loose].join(', ')}` : `부르는 프로그램: ${[...programs].join(', ') || '없음'}`));

  const urls = scan(NARR_RAW ? [NARRATIVE] : [], /https?:\/\//);
  out.push(row('S12', '제출 문서에 적힌 URL을 알고 있음', urls.length ? ASK : OK, urls.length ? `URL이 있는 곳: ${where(urls)} (시크릿 창에서 로그인 없이 열리는지 확인)` : '서사 문서에 URL 없음'));

  // 사용자만 판단할 수 있는 항목: 문서의 상태 열을 읽는다(사용자 확인 뒤 갱신).
  const manual = [
    ['S13', '올라갈 파일 목록을 확인했음', `올라갈 파일 ${FILES.length}개: ${FILES.join(', ')}`],
    ['S14', '원격 저장소 공개 여부와 실명 문서의 공개 판단', '저장소가 공개인지 비공개인지, 실명이 든 서사 문서를 올려도 되는지 사용자가 정해야 함'],
    ['S15', '외부 AI 서비스로 보내는 기록의 범위와 서비스 설정', '이름을 가린 기록만 붙였는지, 서비스의 기록 보관·학습 사용 설정을 확인했는지 사용자가 확인해야 함'],
    ['S16', '제출 파일을 열어 다른 사람 이름이 없는지 직접 읽었음', '자동 대조로 못 찾는 별명이 있을 수 있어 사용자가 제출 전에 한 번 더 읽어야 함'],
  ];
  for (const [id, name, todo] of manual) {
    const st = secDocStatus(id);
    out.push(row(id, name, st || ASK, st === OK ? '사용자 확인 완료(문서 상태 열 기준)' : todo));
  }
  return out;
}

// ---------- 출력 ----------
function show(title, rows) {
  const n = (s) => rows.filter((r) => r.status === s).length;
  console.log(`\n## ${title}\n`);
  console.log(`${OK} ${n(OK)} / ${WIP} ${n(WIP)} / ${ASK} ${n(ASK)} / ${NG} ${n(NG)}\n`);
  console.log('| ID | 항목 | 상태 | 근거 / 해야 할 일 |\n|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.id} | ${r.name} | ${r.status} | ${r.note} |`);
}

const mode = process.argv[2];
if (!mode || mode === 'req') show('요구사항 점검 (T09)', checkRequirements());
if (!mode || mode === 'sec') show('보안 점검', checkSecurity());
if (!mode || mode === 'req') {
  const left = (NARR_RAW.match(/【사용자 작성/g) || []).length;
  console.log(`\n남은 【사용자 작성】 표시: ${left}개. 안내 줄(>)과 표시는 제출 전에 모두 지웁니다.`);
}
