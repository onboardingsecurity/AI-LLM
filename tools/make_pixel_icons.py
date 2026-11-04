"""app/assets/icons 의 픽셀 그림을 만든다. 파이썬 표준 라이브러리만 쓴다.

실행: python3 tools/make_pixel_icons.py

그림은 글자 지도로 그린다(플랜두씨 다이어리의 하트·폭탄과 같은 방식).
글자 하나가 칸 하나이고 '.'은 투명이다. 칸 둘레에는 갈색 테두리를 자동으로 두른다.
"""
import struct
import sys
import zlib
from pathlib import Path

INK = (0x3B, 0x2A, 0x1E)  # 다이어리의 픽셀 테두리 색
SCALE = 8                 # 한 칸을 8x8 점으로 키운다(확대할 때 번지지 않게 미리 키워 둔다)

PALETTE = {
    "K": (0x6B, 0x4A, 0x33),  # 갈색
    "p": (0xF0, 0x6A, 0x8A),  # 분홍
    "D": (0xC2, 0x47, 0x6C),  # 진한 분홍(그늘)
    "w": (0xFF, 0xFF, 0xFF),  # 흰색
    "s": (0xC9, 0xCE, 0xD6),  # 은색
    "S": (0x8A, 0x90, 0xA0),  # 진한 은색
    "r": (0xD6, 0x45, 0x3D),  # 빨강
    "b": (0x7C, 0xC4, 0xEE),  # 연한 파랑
    "B": (0x3A, 0x7B, 0xD5),  # 파랑
    "N": (0xE0, 0xA5, 0x7A),  # 진한 살색(마디 주름)
    "k": (0x3B, 0x2A, 0x1E),  # 눈동자, 입
    "n": (0xF7, 0xC9, 0xA4),  # 살색
    "P": (0xFF, 0x9A, 0x9A),  # 볼
    "y": (0xF0, 0xB4, 0x29),  # 노랑
    "o": (0xF0, 0x8A, 0x5D),  # 주황
    "g": (0x22, 0xB5, 0x73),  # 초록
}

NAIL = [  # 네일: 손톱을 단 손가락 끝과 반짝이
    "...nnnnnn.......",
    "..npppppDn......",
    ".nnpwpppDnn..y..",
    ".nnpwpppDnn.yyy.",
    ".nnppppppnn..y..",
    ".nnppppppnn.....",
    ".nnnDDDDnnn.....",
    ".nnnnnnnnnn.....",
    ".nnnnnnnnnn.....",
    ".nnnNNNNnnn.....",
    ".nnnnnnnnnn.....",
    ".nnnnnnnnnn.....",
]

COOK = [  # 요리사 vs 쉐프: 쉐프 모자
    "..wwww..wwww..",
    ".wwwwwwwwwwwws",
    "wwwwwwwwwwwwws",
    "wwwwwwwwwwwwws",
    ".wwwwwwwwwwwws",
    "..wwwwwwwwwws.",
    "..wwwwwwwwwws.",
    "..rrrrrrrrrrr.",
    "..wwwwwwwwwws.",
    "..wwwwwwwwwws.",
]

DEV = [  # 개발자 vs 엔지니어: 노트북 화면의 </>
    "SSSSSSSSSSSSSSS",
    "SkkkkkkkkkkkkkS",
    "SkkkgkkkgkgkkkS",
    "SkkgkkkgkkkgkkS",
    "SkgkkkkgkkkkgkS",
    "SkkgkkgkkkkgkkS",
    "SkkkgkgkkkgkkkS",
    "SkkkkkkkkkkkkkS",
    "SSSSSSSSSSSSSSS",
    "sssssssssssssss",
    ".SSSSSSSSSSSSS.",
]

LOCK = [  # 잠금 표시(준비 중인 직업 위에 겹친다)
    "..ssss..",
    ".s....s.",
    ".s....s.",
    "yyyyyyyy",
    "yyyyyyyy",
    "yyykkyyy",
    "yyykkyyy",
    "yyyyyyyy",
]

HEART = [  # 클릭 효과용 하트(다이어리와 같은 모양)
    "..XX.XX..",
    ".XXXXXXX.",
    "XXXXXXXXX",
    "XXXXXXXXX",
    ".XXXXXXX.",
    "..XXXXX..",
    "...XXX...",
    "....X....",
]


def gray(color):
    """준비 중인 직업은 같은 그림을 연한 회색으로 만든다."""
    lum = int(0.3 * color[0] + 0.59 * color[1] + 0.11 * color[2])
    mixed = int(lum * 0.45 + 0xD8 * 0.55)
    return (mixed, mixed, mixed)


def render(rows, palette, ink, scale=SCALE):
    """글자 지도를 테두리를 두른 RGBA 점 배열로 바꾼다."""
    h, w = len(rows), len(rows[0])
    assert all(len(r) == w for r in rows), "줄마다 칸 수가 같아야 한다"
    cells = {}
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != ".":
                cells[(x, y)] = palette[ch]
    outline = set()
    for (x, y) in cells:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if (x + dx, y + dy) not in cells:
                outline.add((x + dx, y + dy))
    full_w, full_h = (w + 2) * scale, (h + 2) * scale
    pixels = [[(0, 0, 0, 0)] * full_w for _ in range(full_h)]
    for (x, y), color in list(cells.items()) + [(c, ink) for c in outline]:
        for py in range((y + 1) * scale, (y + 2) * scale):
            for px in range((x + 1) * scale, (x + 2) * scale):
                pixels[py][px] = color + (255,)
    return pixels


def write_png(path, pixels):
    h, w = len(pixels), len(pixels[0])
    raw = b"".join(b"\x00" + b"".join(bytes(p) for p in row) for row in pixels)

    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def main():
    out = Path(__file__).resolve().parent.parent / "app" / "assets" / "icons"
    out.mkdir(parents=True, exist_ok=True)

    jobs = {"nail": NAIL, "cook": COOK, "dev": DEV}
    gray_palette = {k: gray(v) for k, v in PALETTE.items()}
    gray_ink = (0x8A, 0x81, 0x78)
    for name, rows in jobs.items():
        write_png(out / f"job-{name}.png", render(rows, PALETTE, INK))
        write_png(out / f"job-{name}-off.png", render(rows, gray_palette, gray_ink))

    write_png(out / "lock.png", render(LOCK, PALETTE, INK, scale=4))

    for name, color in {"red": (0xD6, 0x45, 0x3D), "pink": (0xF0, 0x6A, 0x8A), "orange": (0xFF, 0x9A, 0x6B)}.items():
        write_png(out / f"heart-{name}.png", render(HEART, {"X": color}, INK, scale=3))

    for path in sorted(out.glob("*.png")):
        print(path.name, path.stat().st_size, "bytes")


if __name__ == "__main__":
    sys.exit(main())
