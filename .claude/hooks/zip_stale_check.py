# -*- coding: utf-8 -*-
"""제출 ZIP(가장 높은 버전)이 현재 파일과 같은지 확인한다. 읽기만 하며 파일을 바꾸지 않는다.

ZIP 이름은 dist/title-price-study-v숫자.zip 이다. 숫자가 가장 큰 파일을 최신본으로 보고,
그 안의 파일과 현재 파일을 내용(바이트)으로 비교한다. 수정 시각은 보지 않는다.
다른 점이 있을 때만 JSON 한 줄을 출력해 Claude가 사용자에게 새 버전을 만들지 먼저 묻게 한다.
버전 ZIP이 아직 없으면 아무것도 출력하지 않는다. 이전 버전은 지우지 않고 그대로 둔다.

안전 장치
- 프로젝트 폴더 밖을 가리키는 파일과 심볼릭 링크는 읽지 않는다.
- 출력에는 글자·숫자·밑줄·점·빗금·하이픈만 든 짧은 파일 이름만 싣는다.
  그 밖의 이름은 개수만 알린다(파일 이름에 적은 문장이 Claude의 문맥에 들어가는 것을 막기 위함).
- ZIP이 너무 크면 열지 않는다.
"""
import glob
import json
import os
import re
import sys
import zipfile

ROOT = os.path.realpath(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
ZIP_DIR = os.path.join(ROOT, 'dist')
ZIP_NAME = re.compile(r'^title-price-study-v(\d+)\.zip$')
# 제출 ZIP에 담기로 한 범위. 이 범위에 새로 생긴 파일도 찾는다.
PATTERNS = ['paper/PAPER.md', 'paper/figures/*.svg', 'data/raw/*.csv',
            'data/processed/*.csv', 'scripts/analyze.py']
MAX_ZIP_BYTES = 50 * 1024 * 1024
MAX_NAMES = 10
SAFE_NAME = re.compile(r'^[\w./-]{1,80}$')


def inside_root(path):
    """심볼릭 링크가 아니고 실제 위치가 프로젝트 폴더 안인 파일만 허용한다."""
    if os.path.islink(path):
        return False
    real = os.path.realpath(path)
    return real == ROOT or real.startswith(ROOT + os.sep)


def describe(label, names):
    safe = [n for n in names if SAFE_NAME.match(n)]
    other = len(names) - len(safe)
    text = ', '.join(safe[:MAX_NAMES])
    if len(safe) > MAX_NAMES:
        text += ' 외 %d개' % (len(safe) - MAX_NAMES)
    if other:
        text += (', ' if text else '') + '이름에 허용되지 않는 문자가 있는 파일 %d개' % other
    return '%s: %s' % (label, text)


def latest_zip():
    """번호가 가장 큰 버전 ZIP의 (번호, 경로)를 돌려준다. 없으면 None."""
    best = None
    for p in glob.glob(os.path.join(ZIP_DIR, '*.zip')):
        m = ZIP_NAME.match(os.path.basename(p))
        if m and os.path.isfile(p) and inside_root(p):
            n = int(m.group(1))
            if best is None or n > best[0]:
                best = (n, p)
    return best


def main():
    best = latest_zip()
    if best is None or os.path.getsize(best[1]) > MAX_ZIP_BYTES:
        return
    version, zip_path = best
    try:
        z = zipfile.ZipFile(zip_path)
        packed = {n: z.read(n) for n in z.namelist()}
    except (OSError, zipfile.BadZipFile, RuntimeError):
        return
    current = set()
    for pat in PATTERNS:
        for p in glob.glob(os.path.join(ROOT, pat)):
            if os.path.isfile(p) and inside_root(p):
                current.add(os.path.relpath(p, ROOT).replace(os.sep, '/'))
    changed, added, removed = [], [], []
    for n in sorted(current):
        if n not in packed:
            added.append(n)
            continue
        try:
            with open(os.path.join(ROOT, n), 'rb') as f:
                if f.read() != packed[n]:
                    changed.append(n)
        except OSError:
            changed.append(n)
    for n in sorted(packed):
        if n not in current:
            removed.append(n)
    if not (changed or added or removed):
        return
    parts = []
    if changed:
        parts.append(describe('바뀐 파일', changed))
    if added:
        parts.append(describe('ZIP에 없는 새 파일', added))
    if removed:
        parts.append(describe('지워졌거나 범위 밖이 된 파일', removed))
    cur = 'title-price-study-v%d.zip' % version
    nxt = 'title-price-study-v%d.zip' % (version + 1)
    msg = ('[ZIP 새 버전 확인] 최신 제출 ZIP dist/' + cur + '이 현재 파일과 다릅니다. ' + ' / '.join(parts) +
           '. 다른 일을 하기 전에 사용자에게 dist/' + nxt + '을 새로 만들지 먼저 물어보세요. '
           '허락받기 전에는 만들지 마세요. 이전 버전은 지우지 않고 그대로 둡니다. '
           '새로 만든 뒤에는 빈 폴더에 풀어 재현 방법 4단계와 금지 파일, 키, 개인정보 검색을 다시 확인하고 '
           '제출 화면에는 번호가 가장 큰 ZIP만 올리도록 안내하세요.')
    sys.stdout.write(json.dumps(
        {'hookSpecificOutput': {'hookEventName': 'UserPromptSubmit', 'additionalContext': msg}},
        ensure_ascii=False))


if __name__ == '__main__':
    main()
