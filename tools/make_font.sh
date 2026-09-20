#!/bin/sh
# fonts/gamja-flower-400.woff2 를 만드는 방법(글꼴 원본을 웹용 woff2로 바꾼다. 글자 모양은 바꾸지 않는다).
# 원본: https://github.com/google/fonts/tree/main/ofl/gamjaflower (GamjaFlower-Regular.ttf, OFL.txt)
# 준비: python3 -m venv fv && ./fv/bin/pip install fonttools brotli
./fv/bin/pyftsubset GamjaFlower-Regular.ttf --unicodes='*' --glyphs='*' --layout-features='*' \
  --no-hinting --flavor=woff2 --output-file=fonts/gamja-flower-400.woff2
