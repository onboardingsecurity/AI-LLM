"""카드 배경 3장을 Pillow로 직접 그리는 스크립트 (Gamja Flower 손글씨 글꼴에 맞춘 분필 낙서 배경).

외부 저작물 없이 도형을 코드로 그리고, 메타데이터(EXIF, 텍스트 청크)를 넣지 않는다.
화면비(1:1, 4:5, 9:16)와 같은 크기로 그려서 카드에 얹을 때 잘리는 곳이 없다.
같은 결과가 나오도록 난수 씨앗을 고정했다. 실행: python3 tools/make_backgrounds.py
"""
import math
import os
import random
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "samples", "backgrounds")
os.makedirs(OUT, exist_ok=True)
SS = 2  # 2배로 그린 뒤 줄여서 선을 부드럽게 한다


def gradient(w, h, top, bottom):
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / (h - 1)
        d.line([(0, y), (w, y)], fill=tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return img


class Chalk:
    """손으로 그린 듯 살짝 흔들리는 선을 긋는다."""

    def __init__(self, w, h, rng):
        self.w, self.h, self.rng = w, h, rng
        self.layer = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.layer)

    def stroke(self, pts, width, color, closed=False):
        rng = self.rng
        if closed:
            pts = pts + [pts[0]]
        for _ in range(2):  # 두 번 겹쳐 그려서 분필 느낌을 낸다
            jit = [(x * SS + rng.gauss(0, 1.6), y * SS + rng.gauss(0, 1.6)) for x, y in pts]
            a = color[3] if _ == 0 else int(color[3] * 0.7)
            col = color[:3] + (a,)
            wd = max(1, round(width * SS * (1 if _ == 0 else 0.75)))
            self.d.line(jit, fill=col, width=wd, joint="curve")
            for x, y in (jit[0], jit[-1]):
                self.d.ellipse([x - wd / 2, y - wd / 2, x + wd / 2, y + wd / 2], fill=col)

    def result(self):
        # 투명한 곳의 색이 선 가장자리에 번지지 않도록 곱해진 알파 형식으로 줄인다.
        small = self.layer.convert("RGBa").resize((self.w, self.h), Image.LANCZOS)
        return small.convert("RGBA")


def circle_pts(cx, cy, r, n=28, start=0.0, sweep=2 * math.pi):
    return [(cx + r * math.cos(start + sweep * i / n), cy + r * math.sin(start + sweep * i / n)) for i in range(n + 1)]


def spiked(c, cx, cy, r, color, wd, spikes, inner):
    """뾰족한 모양(별, 반짝이)을 그린다. spikes개의 뾰족한 끝과 그 사이의 안쪽 점(반지름 r*inner)을 번갈아 잇는다."""
    pts = []
    for i in range(2 * spikes):
        rad = r if i % 2 == 0 else r * inner
        a = -math.pi / 2 + i * math.pi / spikes
        pts.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))
    c.stroke(pts, wd, color, closed=True)


def star(c, cx, cy, r, color, wd):
    spiked(c, cx, cy, r, color, wd, 5, 0.45)


def heart(c, cx, cy, r, color, wd):
    pts = []
    for i in range(41):
        t = 2 * math.pi * i / 40
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((cx + x * r / 17, cy - y * r / 17))
    c.stroke(pts, wd, color)


def sparkle(c, cx, cy, r, color, wd):
    spiked(c, cx, cy, r, color, wd, 4, 0.22)


def flower(c, cx, cy, r, color, wd):
    for i in range(5):
        a = -math.pi / 2 + i * 2 * math.pi / 5
        c.stroke(circle_pts(cx + r * 0.6 * math.cos(a), cy + r * 0.6 * math.sin(a), r * 0.36, 18), wd, color)
    c.stroke(circle_pts(cx, cy, r * 0.22, 14), wd, color)


def spiral(c, cx, cy, r, color, wd):
    pts = [(cx + r * (i / 60) * math.cos(i * 0.22), cy + r * (i / 60) * math.sin(i * 0.22)) for i in range(61)]
    c.stroke(pts, wd, color)


def squiggle(c, cx, cy, r, color, wd):
    pts = [(cx - r + 2 * r * i / 30, cy + r * 0.22 * math.sin(i * 0.9)) for i in range(31)]
    c.stroke(pts, wd, color)


def ring(c, cx, cy, r, color, wd):
    c.stroke(circle_pts(cx, cy, r * 0.5, 22), wd, color)


def plus(c, cx, cy, r, color, wd):
    c.stroke([(cx - r * 0.5, cy), (cx + r * 0.5, cy)], wd, color)
    c.stroke([(cx, cy - r * 0.5), (cx, cy + r * 0.5)], wd, color)


SHAPES = [star, heart, sparkle, flower, spiral, squiggle, ring, plus, star, heart, sparkle]


def make(name, w, h, top, bottom, colors, seed, count, band):
    rng = random.Random(seed)
    base = gradient(w, h, top, bottom).convert("RGBA")
    chalk = Chalk(w, h, rng)
    placed = []
    margin = 46
    cy0, cy1 = h / 2 - band / 2, h / 2 + band / 2  # 가운데는 문구 자리로 비워 둔다
    tries = 0
    while len(placed) < count and tries < 6000:
        tries += 1
        r = rng.uniform(38, 92)
        x = rng.uniform(margin + r, w - margin - r)
        y = rng.uniform(margin + r, h - margin - r)
        if cy0 - r < y < cy1 + r:
            continue
        if any(math.hypot(x - px, y - py) < r + pr + 26 for px, py, pr in placed):
            continue
        placed.append((x, y, r))
        shape = rng.choice(SHAPES)
        color = rng.choice(colors)
        shape(chalk, x, y, r, color, rng.uniform(6.5, 8.5))
    out = Image.alpha_composite(base, chalk.result()).convert("RGB")
    path = os.path.join(OUT, name)
    out.save(path, format="PNG", optimize=True)
    print("생성:", path, out.size)


WHITE = (255, 255, 255, 245)
CREAM = (255, 240, 170, 245)
PINK = (255, 214, 228, 245)
MINT = (208, 255, 236, 245)

make("bg-1x1.png", 1080, 1080, (76, 201, 176), (36, 140, 150), [WHITE, CREAM, PINK], 11, 15, 330)
make("bg-4x5.png", 1080, 1350, (255, 154, 118), (238, 104, 146), [WHITE, CREAM, MINT], 23, 18, 380)
make("bg-9x16.png", 1080, 1920, (110, 140, 255), (176, 118, 232), [WHITE, CREAM, PINK], 37, 22, 400)
print("생성 완료:", sorted(os.listdir(OUT)))
