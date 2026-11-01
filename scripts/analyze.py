# -*- coding: utf-8 -*-
"""호칭 유형과 가격 수준 분석 스크립트.

표준 라이브러리만 쓰고 외부 연결이나 패키지 설치를 하지 않는다(S07, S11).
data/raw 의 원자료는 읽기만 하고 결과는 data/processed 에만 쓴다(S15).

실행 방법(프로젝트 폴더에서):
  python3 scripts/analyze.py check     자료 점검과 호칭별 가게 수(가격 값은 보지 않음)
  python3 scripts/analyze.py survey    설문 응답 요약(전문성 순서, 일치도, 기준 금액)
  python3 scripts/analyze.py prices    가격 비교. 설문 응답이 20건 이상일 때만 실행됨(D28)
  python3 scripts/analyze.py prices --fallback-5000   설문이 모자랄 때 5,000원 기준으로 실행(D20 ③)
  python3 scripts/analyze.py figure    호칭별 가격 점 그림(SVG)을 paper/figures 에 저장. 설문 20건 이상일 때만
"""
import argparse
import csv
import math
import os
import re
import statistics
import sys
from collections import Counter, defaultdict

MAIN_TITLES = ['디자이너', '원장', '네일리스트', '선생님', '아티스트']
# 설문에서 순위를 물은 호칭 7개. 가격 비교는 5곳 이상인 유형만 하지만 순위는 7개 전체를 받았다(D29).
SURVEY_TITLES = MAIN_TITLES + ['테크니시언', '이름']
MIN_N_TEST = 5          # 검정을 덧붙이는 유형의 최소 가게 수(D18)
MIN_RESPONSES = 20      # 설문 응답 하한(D29)
FALLBACK_THRESHOLD = 5000
# 비교 메뉴 "원톤류"의 이름 규칙(D26). 띄어쓰기는 무시한다.
BASE_WORDS = ('원톤', '원컬러', '원칼라', '풀컬러', '젤원톤')
EXCLUDE_WORDS = ('추가', '연장', '제거', '아트', '케어만', '맨즈', '키즈', '남성', '남자', '여성',
                 '행사', '이벤트', '플래닝', '교정', '파우더', '자석', '프렌치', '그라', '글리터',
                 '치크', '오마카세', '디자인', '시그니처', '프리미엄', '패디플래닝')
CATEGORIES = (('손 젤', '손'), ('발 젤', '발'))


# ---------- 입출력 ----------
def read_csv(path):
    with open(path, encoding='utf-8', newline='') as f:
        return list(csv.DictReader(f))


def write_csv(processed_dir, name, header, rows):
    path = os.path.join(processed_dir, name)
    if os.path.dirname(os.path.abspath(path)) != os.path.abspath(processed_dir):
        raise ValueError('결과는 data/processed 에만 쓸 수 있습니다')
    os.makedirs(processed_dir, exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(header)
        w.writerows(rows)
    return path


def to_int(text):
    text = (text or '').strip().replace(',', '')
    return int(text) if text.isdigit() else None


# ---------- 기초 통계(표준 라이브러리만) ----------
def quantile(sorted_values, q):
    n = len(sorted_values)
    if n == 1:
        return float(sorted_values[0])
    pos = (n - 1) * q
    lo = int(math.floor(pos))
    hi = min(lo + 1, n - 1)
    return sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (pos - lo)


def describe(values):
    v = sorted(values)
    return {'n': len(v), 'median': statistics.median(v), 'q1': quantile(v, 0.25),
            'q3': quantile(v, 0.75), 'min': v[0], 'max': v[-1]}


def average_ranks(values):
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        avg = (i + j) / 2 + 1
        for k in range(i, j + 1):
            ranks[order[k]] = avg
        i = j + 1
    return ranks


def pearson(x, y):
    mx, my = sum(x) / len(x), sum(y) / len(y)
    sxx = sum((a - mx) ** 2 for a in x)
    syy = sum((b - my) ** 2 for b in y)
    if sxx == 0 or syy == 0:
        return None
    return sum((a - mx) * (b - my) for a, b in zip(x, y)) / math.sqrt(sxx * syy)


def spearman(x, y):
    return pearson(average_ranks(x), average_ranks(y))


def gammaincc(a, x):
    """정규화된 상부 불완전 감마 함수 Q(a, x)."""
    if x <= 0:
        return 1.0
    gln = math.lgamma(a)
    if x < a + 1:
        ap, total, delta = a, 1.0 / a, 1.0 / a
        for _ in range(1000):
            ap += 1
            delta *= x / ap
            total += delta
            if abs(delta) < abs(total) * 1e-14:
                break
        return 1.0 - total * math.exp(-x + a * math.log(x) - gln)
    b = x + 1.0 - a
    c = 1.0 / 1e-300
    d = 1.0 / b
    h = d
    for i in range(1, 1000):
        an = -i * (i - a)
        b += 2.0
        d = an * d + b
        d = 1e-300 if abs(d) < 1e-300 else d
        c = b + an / c
        c = 1e-300 if abs(c) < 1e-300 else c
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < 1e-14:
            break
    return math.exp(-x + a * math.log(x) - gln) * h


def chi2_sf(x, df):
    return gammaincc(df / 2.0, x / 2.0)


def kruskal_wallis(groups):
    """크러스컬–월리스 H와 p값(동점 보정 포함). groups 는 값 목록의 목록."""
    values = [v for g in groups for v in g]
    n_total = len(values)
    ranks = average_ranks(values)
    h, start = 0.0, 0
    for g in groups:
        r = ranks[start:start + len(g)]
        h += sum(r) ** 2 / len(g)
        start += len(g)
    h = 12.0 / (n_total * (n_total + 1)) * h - 3 * (n_total + 1)
    ties = Counter(values)
    correction = 1 - sum(t ** 3 - t for t in ties.values()) / (n_total ** 3 - n_total)
    if correction > 0:
        h /= correction
    return h, chi2_sf(h, len(groups) - 1)


def kendall_w(rank_rows, items):
    """켄달의 W. rank_rows 는 {항목: 순위(1이 가장 높음)} 목록."""
    m, n = len(rank_rows), len(items)
    sums = [sum(row[it] for row in rank_rows) for it in items]
    mean = m * (n + 1) / 2.0
    s = sum((r - mean) ** 2 for r in sums)
    return 12.0 * s / (m ** 2 * (n ** 3 - n))


# ---------- 자료 처리 ----------
def is_base_menu(name):
    n = re.sub(r'\s+', '', name)
    return not any(e in n for e in EXCLUDE_WORDS) and any(w in n for w in BASE_WORDS)


def base_prices(shops, menus, category):
    """포함된 가게의 비교 메뉴 가격(원). 같은 메뉴가 여럿이면 낮은 값을 쓴다(D17)."""
    included = {s['shop_id'] for s in shops if s['included'] == '포함'}
    found = defaultdict(list)
    for m in menus:
        if m['shop_id'] in included and m['category'] == category and is_base_menu(m['menu_name']):
            price = to_int(m['price_won'])
            if price:
                found[m['shop_id']].append(price)
    return {sid: min(p) for sid, p in found.items()}


def load_survey(path):
    """유효한 설문 응답과 무효 사유를 돌려준다."""
    if not os.path.exists(path):
        return [], []
    valid, invalid = [], []
    for row in read_csv(path):
        rid = row.get('response_id', '?')
        ranks = [(row.get('rank_%d' % i) or '').strip() for i in range(1, len(SURVEY_TITLES) + 1)]
        usual, diff = to_int(row.get('usual_price_won')), to_int(row.get('diff_threshold_won'))
        if sorted(ranks) != sorted(SURVEY_TITLES):
            invalid.append((rid, '일곱 호칭이 모두 한 번씩 적혀 있지 않음'))
        elif not diff:
            invalid.append((rid, '확실히 다르다고 느끼는 차이 금액이 숫자가 아님'))
        else:
            valid.append({'id': rid, 'order': ranks, 'usual': usual, 'diff': diff})
    return valid, invalid


def survey_summary(valid):
    rank_rows = [{t: i + 1 for i, t in enumerate(r['order'])} for r in valid]
    mean_rank = {t: sum(r[t] for r in rank_rows) / len(rank_rows) for t in SURVEY_TITLES}
    w = kendall_w(rank_rows, SURVEY_TITLES) if len(valid) >= 2 else None
    diffs = [r['diff'] for r in valid]
    return {'mean_rank': mean_rank, 'w': w, 'diff_median': statistics.median(diffs) if diffs else None}


# ---------- 명령 ----------
def cmd_check(root, shops, menus):
    included = [s for s in shops if s['included'] == '포함']
    print('가게 %d곳 (포함 %d, 제외 %d, 보류 %d)' % (
        len(shops), len(included),
        sum(1 for s in shops if s['included'] == '제외'),
        sum(1 for s in shops if s['included'] == '보류')))
    ids = {s['shop_id'] for s in shops}
    print('메뉴 %d줄, 가게 목록에 없는 번호 %d개' % (len(menus), len({m['shop_id'] for m in menus} - ids)))
    bad = [m for m in menus if m['price_won'] and to_int(m['price_won']) is None]
    print('가격이 숫자가 아닌 줄: %d' % len(bad))
    print('채택 호칭이 비어 있는 포함 가게: %d' % sum(1 for s in included if not s['title_adopted']))
    titles = Counter(s['title_adopted'] for s in included)
    print('\n호칭별 가게 수와 비교 메뉴에 숫자 가격이 있는 가게 수(가격 값은 보지 않음)')
    prices = {cat: base_prices(shops, menus, cat) for cat, _ in CATEGORIES}
    for t, n in titles.most_common():
        cells = ['%s젤 %d곳' % (short, sum(1 for s in included
                                           if s['title_adopted'] == t and s['shop_id'] in prices[cat]))
                 for cat, short in CATEGORIES]
        print('  %s: 포함 %d곳 / %s' % (t, n, ', '.join(cells)))
    print('\n호칭별 구 분포와 리뷰 수 중앙값')
    for t, _ in titles.most_common():
        group = [s for s in included if s['title_adopted'] == t]
        districts = Counter(s['district'] for s in group)
        reviews = [to_int(s['review_count']) for s in group if to_int(s['review_count'])]
        med = statistics.median(reviews) if reviews else '-'
        print('  %s: %s / 리뷰 수 중앙값 %s' % (t, dict(districts.most_common()), med))


def cmd_survey(root, survey_path):
    valid, invalid = load_survey(survey_path)
    print('설문 응답: 유효 %d건, 무효 %d건 (하한 %d건)' % (len(valid), len(invalid), MIN_RESPONSES))
    for rid, why in invalid:
        print('  무효 %s: %s' % (rid, why))
    if not valid:
        return valid
    summ = survey_summary(valid)
    order = sorted(SURVEY_TITLES, key=lambda t: summ['mean_rank'][t])
    print('전문성이 높게 느껴지는 순서(평균 순위 작은 순): ' +
          ' > '.join('%s(%.2f)' % (t, summ['mean_rank'][t]) for t in order))
    if summ['w'] is not None:
        print('응답자 일치도 켄달의 W: %.3f (효과 크기로만 보고 검정은 하지 않음)' % summ['w'])
    print('"확실히 다르다"고 느끼는 차이 금액의 중앙값: %d원' % summ['diff_median'])
    return valid


def group_stats(price_by_shop, shops):
    title_of = {s['shop_id']: s['title_adopted'] for s in shops}
    groups = defaultdict(list)
    for sid, price in price_by_shop.items():
        groups[title_of[sid]].append(price)
    return groups


def judge(groups, threshold):
    tested = {t: v for t, v in groups.items() if len(v) >= MIN_N_TEST}
    if len(tested) < 2:
        return '판정 불가(5곳 이상인 유형이 2개 미만)', None, None, tested
    meds = {t: statistics.median(v) for t, v in tested.items()}
    hi, lo = max(meds, key=meds.get), min(meds, key=meds.get)
    gap = meds[hi] - meds[lo]
    verdict = '차이 있음' if gap >= threshold else '차이 없음'
    return verdict, gap, (hi, lo), tested


def report_block(label, shops, price_by_shop, threshold, processed_dir, tag, mean_rank=None):
    groups = group_stats(price_by_shop, shops)
    print('\n[%s] 비교 가게 %d곳' % (label, len(price_by_shop)))
    rows = []
    for t, values in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        d = describe(values)
        rows.append([t, d['n'], d['median'], d['q1'], d['q3'], d['min'], d['max']])
        print('  %s: %d곳, 중앙값 %d, 사분위 %d~%d, 최소 %d, 최대 %d' % (
            t, d['n'], d['median'], d['q1'], d['q3'], d['min'], d['max']))
    write_csv(processed_dir, 'price_by_title_%s.csv' % tag,
              ['호칭', '곳수', '중앙값', '사분위25', '사분위75', '최소', '최대'], rows)
    verdict, gap, pair, tested = judge(groups, threshold)
    print('  판정(기준 %d원): %s' % (threshold, verdict))
    if gap is not None:
        print('  가장 높은 유형 %s와 가장 낮은 유형 %s의 중앙값 차이 %d원' % (pair[0], pair[1], gap))
    if len(tested) >= 2:
        h, p = kruskal_wallis(list(tested.values()))
        print('  크러스컬–월리스(참고): H=%.3f, p=%.3f, 유형 %d개' % (h, p, len(tested)))
    if mean_rank and len(tested) >= 3:
        common = [t for t in tested if t in mean_rank]
        if len(common) >= 3:
            score = [len(SURVEY_TITLES) + 1 - mean_rank[t] for t in common]
            meds = [statistics.median(tested[t]) for t in common]
            rho = spearman(score, meds)
            if rho is not None:
                print('  전문성 순서와 가격 중앙값 순서의 스피어만 상관: %.3f (유형 %d개, 검정하지 않음)' % (rho, len(common)))
    return rows


def cmd_prices(root, shops, menus, survey_path, processed_dir, fallback):
    valid, invalid = load_survey(survey_path)
    mean_rank = None
    if len(valid) >= MIN_RESPONSES:
        summ = survey_summary(valid)
        threshold, mean_rank = summ['diff_median'], summ['mean_rank']
        print('기준 금액: 설문 %d건의 중앙값 %d원' % (len(valid), threshold))
    elif fallback:
        threshold = FALLBACK_THRESHOLD
        if valid:
            mean_rank = survey_summary(valid)['mean_rank']
        print('설문이 %d건뿐이라 D20 ③에 따라 %d원을 기준으로 씁니다(논문에 그렇게 적어야 함)' % (len(valid), threshold))
    else:
        print('설문 응답이 %d건입니다(하한 %d건). 설문을 마치기 전에는 가격 비교를 하지 않습니다(D28).' % (len(valid), MIN_RESPONSES))
        print('설문을 못 하는 경우에만 --fallback-5000 을 붙여 실행하세요.')
        sys.exit(2)
    included = [s for s in shops if s['included'] == '포함']
    review_values = [to_int(s['review_count']) for s in included if to_int(s['review_count'])]
    review_median = statistics.median(review_values)
    for cat, short in CATEGORIES:
        prices = base_prices(shops, menus, cat)
        label = '%s 젤 원톤' % short + ('' if short == '손' else ' (보조 결과)')
        report_block(label, shops, prices, threshold, processed_dir, short, mean_rank)
        no_chain = {sid: p for sid, p in prices.items()
                    if next(s for s in shops if s['shop_id'] == sid)['chain_possible'] != '예'}
        report_block(label + ' / 지점 표기 가게 제외', shops, no_chain, threshold, processed_dir, short + '_지점제외')
        low = {sid: p for sid, p in prices.items()
               if (to_int(next(s for s in shops if s['shop_id'] == sid)['review_count']) or 0) <= review_median}
        high = {sid: p for sid, p in prices.items() if sid not in low}
        report_block(label + ' / 리뷰 수 중앙값 이하', shops, low, threshold, processed_dir, short + '_리뷰이하')
        report_block(label + ' / 리뷰 수 중앙값 초과', shops, high, threshold, processed_dir, short + '_리뷰초과')


def svg_strip_plot(groups, order, title):
    """호칭별 가격을 점으로 찍고 중앙값을 선으로 표시한 SVG 문자열(표준 라이브러리만 사용)."""
    width, height = 820, 460
    left, right, top, bottom = 80, 20, 50, 80
    values = [v for t in order for v in groups.get(t, [])]
    ymin = (min(values) // 5000) * 5000 - 5000
    ymax = -(-max(values) // 5000) * 5000 + 5000
    plot_w, plot_h = width - left - right, height - top - bottom
    step = plot_w / len(order)

    def y_of(v):
        return top + plot_h * (1 - (v - ymin) / float(ymax - ymin))

    parts = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" role="img" '
             'font-family="sans-serif" font-size="13">' % (width, height, width, height),
             '<title>%s</title>' % title,
             '<rect width="%d" height="%d" fill="#ffffff"/>' % (width, height),
             '<text x="%d" y="26" font-size="15" font-weight="bold" fill="#1a1a1a">%s</text>' % (left, title)]
    for v in range(int(ymin), int(ymax) + 1, 5000):
        parts.append('<line x1="%d" y1="%.1f" x2="%d" y2="%.1f" stroke="#e1e4e8"/>' % (left, y_of(v), width - right, y_of(v)))
        parts.append('<text x="%d" y="%.1f" text-anchor="end" fill="#555">%s</text>' % (left - 8, y_of(v) + 4, format(v, ',')))
    parts.append('<text x="18" y="%d" transform="rotate(-90 18 %d)" text-anchor="middle" fill="#555">가격(원)</text>' % (top + plot_h // 2, top + plot_h // 2))
    for i, t in enumerate(order):
        cx = left + step * (i + 0.5)
        vals = sorted(groups.get(t, []))
        seen = Counter()
        for v in vals:
            offset = (seen[v] - (vals.count(v) - 1) / 2.0) * 11
            seen[v] += 1
            parts.append('<circle cx="%.1f" cy="%.1f" r="4.5" fill="#2a6fdb" fill-opacity="0.75" stroke="#1d4f9f"/>' % (cx + offset, y_of(v)))
        if vals:
            med = statistics.median(vals)
            parts.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="#c0392b" stroke-width="3"/>' % (cx - step * 0.38, y_of(med), cx + step * 0.38, y_of(med)))
        parts.append('<text x="%.1f" y="%d" text-anchor="middle" fill="#1a1a1a">%s</text>' % (cx, top + plot_h + 22, t))
        parts.append('<text x="%.1f" y="%d" text-anchor="middle" fill="#555">%d곳</text>' % (cx, top + plot_h + 40, len(vals)))
    parts.append('<text x="%d" y="%d" fill="#555">파란 점은 가게 한 곳, 빨간 선은 중앙값(점이 겹치면 옆으로 나란히 둠)</text>' % (left, height - 12))
    parts.append('</svg>')
    return '\n'.join(parts)


def cmd_figure(root, shops, menus, survey_path, fallback):
    valid, _ = load_survey(survey_path)
    if len(valid) < MIN_RESPONSES and not fallback:
        print('설문 응답이 %d건입니다(하한 %d건). 설문을 마치기 전에는 그림도 만들지 않습니다(D28).' % (len(valid), MIN_RESPONSES))
        sys.exit(2)
    out_dir = os.path.join(root, 'paper', 'figures')
    os.makedirs(out_dir, exist_ok=True)
    for cat, short in CATEGORIES:
        groups = group_stats(base_prices(shops, menus, cat), shops)
        order = [t for t, _ in sorted(groups.items(), key=lambda kv: -len(kv[1]))]
        svg = svg_strip_plot(groups, order, '호칭 유형별 %s 젤 원톤 가격(대구 네일샵)' % short)
        path = os.path.join(out_dir, 'price_by_title_%s.svg' % short)
        with open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(svg + '\n')
        print('그림 저장:', os.path.relpath(path, root))


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('command', choices=['check', 'survey', 'prices', 'figure'])
    parser.add_argument('--root', default=os.path.dirname(here), help='프로젝트 폴더(기본: 이 스크립트의 상위 폴더)')
    parser.add_argument('--fallback-5000', action='store_true', help='설문이 모자랄 때 5,000원 기준 사용(D20 ③)')
    args = parser.parse_args()
    raw = os.path.join(args.root, 'data', 'raw')
    processed = os.path.join(args.root, 'data', 'processed')
    shops = read_csv(os.path.join(raw, 'nail_shops.csv'))
    menus = read_csv(os.path.join(raw, 'nail_menus.csv'))
    survey_path = os.path.join(raw, 'survey_responses.csv')
    if args.command == 'check':
        cmd_check(args.root, shops, menus)
    elif args.command == 'survey':
        cmd_survey(args.root, survey_path)
    elif args.command == 'figure':
        cmd_figure(args.root, shops, menus, survey_path, args.fallback_5000)
    else:
        cmd_prices(args.root, shops, menus, survey_path, processed, args.fallback_5000)


if __name__ == '__main__':
    main()
