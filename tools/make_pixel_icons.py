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
    "W": (0xB8, 0xD8, 0xF0),  # 바람 줄(연한 하늘색)
    "a": (0xC9, 0xE9, 0xF5),  # 하늘
    "L": (0x6F, 0xCF, 0x7F),  # 연한 나뭇잎
    "T": (0x2F, 0x9A, 0x5E),  # 짙은 나뭇잎(그늘)
    "G": (0x5B, 0xBF, 0x6A),  # 풀밭
    "E": (0xD9, 0xB2, 0x7C),  # 흙길
    "e": (0xC4, 0x9A, 0x62),  # 흙길의 자갈
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

HAND = [  # 손 젤 원톤: 손톱 다섯 개에 같은 색을 바른 손
    ".......pp......",
    "....wp.wp.wp...",
    "....pp.nn.pp...",
    ".wp.nn.nn.nn...",
    ".pp.nn.nn.nn...",
    ".nn.nn.nn.nn...",
    ".nnnnnnnnnnnnwp",
    ".nnnnnnnnnnnnpp",
    ".nnnnnnnnnnnnnn",
    ".nnnnnnnnnnnnn.",
    ".nnnnnnnnnnnn..",
    "..nnnnnnnnnn...",
    "..nnnnnnnnnn...",
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

WALKER = [  # 뒤로 가기: 왼쪽으로 걸어가는 사람. 오른쪽(뒤)의 'W'는 바람 줄
    "...KKKK.......",
    "..KKKKKK......",
    "..nnnKKK......",
    "..nknnKK..WWW.",
    "..nnnnn.......",
    "...BBBB..WWWW.",
    "..BBBBBB......",
    ".nBBBBBBn.WWW.",
    ".nBBBBBBn.....",
    "..BBBBBB..WWWW",
    "..SSSSSS......",
    ".SSS..SSS.WW..",
    ".SS....SS.....",
    "SSS.....SS....",
    "KKK.....KK....",
]

SEALED = [  # 완전히 잠긴 직업 칸: 큰 자물쇠(회색으로 칠한다)
    "...ssssss...",
    "..ss....ss..",
    "..s......s..",
    "..s......s..",
    "..s......s..",
    "yyyyyyyyyyyy",
    "yyyyyyyyyyyy",
    "yyyyykkyyyyy",
    "yyyyykkyyyyy",
    "yyyyyykyyyyy",
    "yyyyyykyyyyy",
    "yyyyyyyyyyyy",
    "yyyyyyyyyyyy",
]

def calc_frame(pressed):
    """계산하는 사람: 걷는 사람(WALKER)과 같은 머리·몸에 다리만 모으고, 왼쪽 손에 계산기를 들고 있다.
    pressed가 0이면 윗줄 키, 1이면 아랫줄 키가 눌린(빨강) 그림이고, 화면 숫자 칸도 번갈아 바뀐다."""
    body = [row[:11].replace("W", ".") for row in WALKER[:10]]  # 바람 줄은 빼고 몸만 가져온다
    legs = ["..SSSSSS...", "..SSSSSS...", "..SSSSSS...", "..KKKKKK..."]
    rows = ["...." + r for r in body + legs]
    screen = "SbkbS" if pressed == 0 else "SbbkS"
    k1 = "SrSwS" if pressed == 0 else "SwSwS"
    k2 = "SwSwS" if pressed == 0 else "SwSrS"
    calc = {5: "SSSSS", 6: screen, 7: k1, 8: k2, 9: "SSSSS"}
    out = []
    for y, row in enumerate(rows):
        if y in calc:
            row = calc[y] + row[5:]
        out.append(row)
    return out


ARROW = [  # 호칭 고르기 버튼 오른쪽의 ▾ 화살표(10x6칸, 갈색)
    "XXXXXXXXXX",
    "XXXXXXXXXX",
    "..XXXXXX..",
    "..XXXXXX..",
    "....XX....",
    "....XX....",
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


def forest_layers():
    """숲 배경을 세 겹의 글자 지도로 돌려준다(폭 30칸, 높이 9칸): 하늘(구름 포함) / 나무 / 풀밭과 흙길.
    '.'은 투명. 세 겹 모두 가로로 이어 붙여도 어색하지 않게 가장자리에는 나무와 구름을 걸치지 않는다.
    화면에서는 세 겹을 서로 다른 속도로 흘려 보내(멀수록 느리게) 사람이 숲을 걸어가는 느낌을 낸다.
    풀밭 줄(7번째)의 아래 끝이 걷는 사람의 발이 닿는 자리다."""
    W, H = 30, 9

    def blank(fill):
        return [[fill] * W for _ in range(H)]

    def put(g, x, y, ch):
        if 0 <= x < W and 0 <= y < H:
            g[y][x] = ch

    sky = blank("a")
    for x in (9, 10, 11):
        put(sky, x, 1, "w")
    for x in (8, 9, 10, 11, 12):
        put(sky, x, 2, "w")

    trees = blank(".")
    tree = ["..LLT..", ".LLLLTT", "LLLLLTT", "LLLLTTT", ".TTTTT."]  # 폭 7칸 잎 다섯 줄
    for left in (1, 12, 22):
        for dy, row in enumerate(tree):
            for dx, ch in enumerate(row):
                if ch != ".":
                    put(trees, left + dx, 1 + dy, ch)
        put(trees, left + 3, 6, "K")  # 줄기

    ground = blank(".")
    for x in range(W):
        ground[7][x] = "G"
        ground[8][x] = "E"
    for x in (4, 9, 15, 20, 26):
        put(ground, x, 7, "L")
    for x in (3, 11, 17, 24, 28):
        put(ground, x, 8, "e")
    put(ground, 10, 7, "y")
    put(ground, 19, 7, "p")
    put(ground, 29, 7, "r")

    return {name: ["".join(r) for r in g] for name, g in (("sky", sky), ("trees", trees), ("ground", ground))}


def render_scene(rows, palette, scale):
    """테두리 없이 칸마다 색을 채운 그림(배경용). '.'은 투명."""
    h, w = len(rows), len(rows[0])
    assert all(len(r) == w for r in rows), "줄마다 칸 수가 같아야 한다"
    pixels = []
    for y in range(h * scale):
        row = rows[y // scale]
        pixels.append([(palette[row[x // scale]] + (255,)) if row[x // scale] != "." else (0, 0, 0, 0) for x in range(w * scale)])
    return pixels


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

    # 서비스 선택 그림(직업 그림과 같은 방식): service-<아이콘>.png, service-<아이콘>-off.png
    services = {"hand": HAND}
    for name, rows in services.items():
        write_png(out / f"service-{name}.png", render(rows, PALETTE, INK))
        write_png(out / f"service-{name}-off.png", render(rows, gray_palette, gray_ink))

    write_png(out / "back-walker.png", render(WALKER, PALETTE, INK, scale=4))
    for name, rows in forest_layers().items():
        write_png(out / f"back-{name}.png", render_scene(rows, PALETTE, 8))

    # 완전히 잠긴 칸: 누를 수 없는 칸이라 회색판만 쓰지만, 직업 그림과 같은 이름 규칙(job-<아이콘>.png, -off.png)을 따른다
    sealed = render(SEALED, gray_palette, gray_ink)
    write_png(out / "job-sealed.png", sealed)
    write_png(out / "job-sealed-off.png", sealed)

    # 계산하는 사람(로딩 화면): 두 장을 번갈아 보여 손가락이 키를 누르는 것처럼 보인다
    write_png(out / "calc-a.png", render(calc_frame(0), PALETTE, INK, scale=6))
    write_png(out / "calc-b.png", render(calc_frame(1), PALETTE, INK, scale=6))

    write_png(out / "dd-arrow.png", render_scene(ARROW, {"X": INK}, 4))

    write_png(out / "lock.png", render(LOCK, PALETTE, INK, scale=4))

    for name, color in {"red": (0xD6, 0x45, 0x3D), "pink": (0xF0, 0x6A, 0x8A), "orange": (0xFF, 0x9A, 0x6B)}.items():
        write_png(out / f"heart-{name}.png", render(HEART, {"X": color}, INK, scale=3))

    for path in sorted(out.glob("*.png")):
        print(path.name, path.stat().st_size, "bytes")


if __name__ == "__main__":
    sys.exit(main())
