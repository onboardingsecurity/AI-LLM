"""테스트용 합성 이미지 생성 스크립트.

Pillow로 직접 그린 그림이라 외부 저작물이 없고, 메타데이터(EXIF, 텍스트 청크)를 넣지 않는다.
실행: python3 tools/make_test_images.py
"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "samples", "test-inputs")
os.makedirs(OUT, exist_ok=True)


def scene(w, h, top, bottom):
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        t = y / (h - 1)
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(w):
            px[x, y] = c
    d = ImageDraw.Draw(img)
    d.ellipse([w * 0.6, h * 0.1, w * 0.85, h * 0.1 + w * 0.25], fill=(255, 224, 130))
    d.polygon([(0, h), (w * 0.35, h * 0.55), (w * 0.7, h)], fill=(52, 73, 94))
    d.polygon([(w * 0.3, h), (w * 0.7, h * 0.65), (w, h)], fill=(39, 55, 70))
    # 가장자리 확인용 테두리
    d.rectangle([0, 0, w - 1, h - 1], outline=(255, 255, 255), width=6)
    return img


# 정상 PNG (가로)
scene(1200, 800, (255, 154, 118), (94, 75, 139)).save(
    os.path.join(OUT, "valid-landscape.png"), format="PNG", optimize=True
)
# 정상 JPEG (세로)
scene(800, 1200, (72, 201, 176), (26, 82, 118)).save(
    os.path.join(OUT, "valid-portrait.jpg"), format="JPEG", quality=90
)
# 정상 PNG (투명): 왼쪽 절반은 완전 투명, 오른쪽 절반은 불투명 주황, 가운데 원은 반투명
def transparent():
    img = Image.new("RGBA", (600, 600), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([300, 0, 599, 599], fill=(255, 140, 66, 255))
    d.ellipse([150, 150, 450, 450], fill=(30, 120, 220, 128))
    return img


transparent().save(os.path.join(OUT, "valid-transparent.png"), format="PNG", optimize=True)
# 지원하지 않는 파일: GIF
Image.new("P", (200, 200), 5).save(os.path.join(OUT, "unsupported.gif"), format="GIF")
# 지원하지 않는 파일: 확장자만 png인 텍스트
with open(os.path.join(OUT, "fake-image.png"), "w", encoding="utf-8") as f:
    f.write("이 파일은 이미지가 아니라 텍스트입니다.\n")
# 손상된 PNG: 서명은 정상이나 내용이 잘림
with open(os.path.join(OUT, "valid-landscape.png"), "rb") as f:
    data = f.read()
with open(os.path.join(OUT, "corrupt.png"), "wb") as f:
    f.write(data[:200])
print("생성 완료:", sorted(os.listdir(OUT)))
