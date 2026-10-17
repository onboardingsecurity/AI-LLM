// 그림 클릭 효과. data-fx 가 붙은 이미지를 누르면 누른 자리에서 조각들이 풍선처럼 떠올라 흩어진다.
//   hearts: 픽셀 하트(1번 그림)   laugh: "ㅋ" 글자(2번 그림)   bomb: 폭탄이 터짐(3번 그림)   firework: 폭죽이 올라가 터짐(4번 그림)
// 효과마다 data-fx 이름을 하나씩 두고, 아래 EFFECTS 에 이름과 동작을 추가하면 다른 그림에도 다른 효과를 붙일 수 있다.
(function () {
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- 하트 그림(픽셀 도트)을 SVG 로 만들어 둔다. 갈색 테두리 + 색 채움. ----
  const SHAPE = [
    "..XX.XX..",
    ".XXXXXXX.",
    "XXXXXXXXX",
    "XXXXXXXXX",
    ".XXXXXXX.",
    "..XXXXX..",
    "...XXX...",
    "....X...."
  ];
  const COLORS = ["#d6453d", "#f06a8a", "#ff9a6b"];   // 빨강, 분홍, 연한 주황
  const INK = "#3b2a1e";
  const GRID_W = SHAPE[0].length + 2;
  const GRID_H = SHAPE.length + 2;

  function heartUrl(fill) {
    const on = function (x, y) { return y >= 0 && y < SHAPE.length && x >= 0 && x < SHAPE[0].length && SHAPE[y][x] === "X"; };
    let outline = "";
    let body = "";
    for (let y = -1; y <= SHAPE.length; y++) {
      for (let x = -1; x <= SHAPE[0].length; x++) {
        const cell = "M" + (x + 1) + " " + (y + 1) + "h1v1h-1z";
        if (on(x, y)) body += cell;
        else if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) outline += cell;
      }
    }
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 " + GRID_W + " " + GRID_H + "' shape-rendering='crispEdges'>" +
      "<path fill='" + INK + "' d='" + outline + "'/><path fill='" + fill + "' d='" + body + "'/></svg>";
    return "url(\"data:image/svg+xml," + encodeURIComponent(svg) + "\")";
  }
  const heartImages = COLORS.map(heartUrl);

  // 하트가 날아다니는 층: 화면 전체를 덮되 클릭은 통과시킨다.
  const layer = document.createElement("div");
  layer.id = "fx-layer";
  layer.setAttribute("aria-hidden", "true");
  document.body.appendChild(layer);

  const MAX_ALIVE = 40;   // 한꺼번에 화면에 있을 수 있는 조각 수(연달아 눌러도 느려지지 않게)
  const rand = function (a, b) { return a + Math.random() * (b - a); };

  // 조각 하나(하트, 글자 등)를 누른 자리에서 풍선처럼 띄운다. 효과마다 모양만 다르고 움직임은 이 함수가 맡는다.
  //   piece: 이미 만든 요소(크기는 style 로 정해져 있어야 함), x·y: 누른 자리(화면 좌표)
  function launch(piece, x, y) {
    while (layer.childElementCount >= MAX_ALIVE) layer.removeChild(layer.firstChild);
    layer.appendChild(piece);
    const w = piece.offsetWidth;
    const h = piece.offsetHeight;
    piece.style.left = (x - w / 2 + rand(-12, 12)) + "px";
    piece.style.top = (y - h / 2 + rand(-8, 8)) + "px";

    let anim;
    if (reduceMotion) {
      anim = piece.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, easing: "ease-out", fill: "forwards" });
    } else {
      const rise = rand(180, 340);          // 위로 떠오르는 높이
      const drift = rand(-140, 140);        // 결국 옆으로 얼마나 흘러가는지
      const sway = rand(18, 40) * (Math.random() < 0.5 ? -1 : 1);   // 좌우 흔들림 폭과 첫 방향
      const spin = rand(-18, 18);           // 살짝 기울어지는 각도
      anim = piece.animate([
        { transform: "translate(0px, 0px) scale(0.3) rotate(0deg)", opacity: 0, offset: 0 },
        { transform: "translate(" + sway * 0.3 + "px, " + (-rise * 0.08) + "px) scale(1.15) rotate(" + spin * 0.3 + "deg)", opacity: 1, offset: 0.12 },
        { transform: "translate(" + (drift * 0.3 + sway) + "px, " + (-rise * 0.35) + "px) scale(1) rotate(" + spin + "deg)", opacity: 1, offset: 0.4 },
        { transform: "translate(" + (drift * 0.65 - sway * 0.8) + "px, " + (-rise * 0.7) + "px) scale(0.9) rotate(" + (-spin) + "deg)", opacity: 0.9, offset: 0.72 },
        { transform: "translate(" + drift + "px, " + (-rise) + "px) scale(0.6) rotate(" + spin * 0.5 + "deg)", opacity: 0, offset: 1 }
      ], { duration: rand(2200, 3200), easing: "ease-in-out", fill: "forwards" });
    }
    anim.onfinish = function () { if (piece.parentNode) piece.parentNode.removeChild(piece); };
  }

  function makeHeart() {
    const size = Math.round(rand(2, 3.4) * 10) / 10;                       // 도트 한 칸 크기(px)
    const heart = document.createElement("span");
    heart.className = "fx-heart";
    heart.style.width = GRID_W * size + "px";
    heart.style.height = GRID_H * size + "px";
    heart.style.backgroundImage = heartImages[Math.floor(Math.random() * heartImages.length)];
    return heart;
  }

  // "ㅋ" 글자: 갈색 테두리를 두른 색 글자. 크기와 색이 제각각이다.
  const LAUGH_COLORS = ["#f0b429", "#ff9a6b", "#4c9a5b", "#f06a8a"];   // 노랑, 연한 주황, 초록, 분홍
  function makeLaugh() {
    const t = document.createElement("span");
    t.className = "fx-laugh";
    t.textContent = "ㅋ";
    t.style.fontSize = Math.round(rand(28, 46)) + "px";
    t.style.color = LAUGH_COLORS[Math.floor(Math.random() * LAUGH_COLORS.length)];
    return t;
  }

  function burst(make) {
    return function (x, y) {
      const n = 3 + Math.floor(Math.random() * 3);   // 한 번에 3~5개
      for (let i = 0; i < n; i++) launch(make(), x, y);
    };
  }
  // ---- 폭탄(3번 그림): 폭탄이 나타나 흔들리다가 펑 터지며 파편이 사방으로 퍼진다. 떠오르는 효과와 달리 "터지는" 움직임. ----
  // 도트 그림은 글자 지도로 그린다. 칸 하나가 도트 하나이고, 테두리(갈색)는 채운 칸 둘레에 자동으로 두른다.
  const BOMB = [
    "........s...",
    ".......sws..",
    "........s...",
    ".......f....",
    "......f.....",
    "....nnnn....",
    "..bbbbbbbb..",
    ".bbbbbbbbbb.",
    ".bhhbbbbbbb.",
    "bhhbbbbbbbbb",
    "bhbbbbbbbbbb",
    "bbbbbbbbbbbb",
    "bbbbbbbbbbbb",
    ".bbbbbbbbbb.",
    ".bbbbbbbbbb.",
    "..bbbbbbbb.."
  ];
  const BOMB_COLORS = { b: "#3a3d46", h: "#8a90a0", n: "#5a5f6c", f: "#8a5a2b", s: "#f0b429", w: "#fff6c2" };

  function spriteUrl(rows, colors, outlined) {
    const H = rows.length;
    const W = rows[0].length;
    const at = function (x, y) { return y >= 0 && y < H && x >= 0 && x < W ? rows[y][x] : "."; };
    const solid = function (x, y) { const c = at(x, y); return c !== "." && outlined.indexOf(c) >= 0; };
    let out = "";
    for (let y = -1; y <= H; y++) {
      for (let x = -1; x <= W; x++) {
        if (at(x, y) === "." && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) {
          out += "M" + (x + 1) + " " + (y + 1) + "h1v1h-1z";
        }
      }
    }
    let body = "";
    Object.keys(colors).forEach(function (ch) {
      let d = "";
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rows[y][x] === ch) d += "M" + (x + 1) + " " + (y + 1) + "h1v1h-1z";
      if (d) body += "<path fill='" + colors[ch] + "' d='" + d + "'/>";
    });
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 " + (W + 2) + " " + (H + 2) + "' shape-rendering='crispEdges'>" +
      "<path fill='" + INK + "' d='" + out + "'/>" + body + "</svg>";
    return { url: "url(\"data:image/svg+xml," + encodeURIComponent(svg) + "\")", w: W + 2, h: H + 2 };
  }
  const bombSprite = spriteUrl(BOMB, BOMB_COLORS, "bhnf");

  // 폭발 별 모양(뾰족한 8방향): 바깥 주황빨강 → 노랑 → 한가운데 밝은 노랑 3겹
  const BURST = (function () {
    const N = 25;
    const c = (N - 1) / 2;
    const rows = [];
    for (let y = 0; y < N; y++) {
      let row = "";
      for (let x = 0; x < N; x++) {
        const dx = x - c;
        const dy = y - c;
        const r = Math.sqrt(dx * dx + dy * dy);
        const R = 5 + 5.4 * Math.pow(Math.abs(Math.cos(4 * Math.atan2(dy, dx))), 4);
        row += r <= R * 0.42 ? "w" : r <= R * 0.72 ? "y" : r <= R ? "o" : ".";
      }
      rows.push(row);
    }
    return spriteUrl(rows, { o: "#e8501c", y: "#f9c32b", w: "#fff6c2" }, "owy");
  })();

  const CHIP_COLORS = ["#d6453d", "#f06a30", "#f9c32b", "#3a3d46", "#fff6c2"];
  const BOOM_WORDS = ["펑!", "쾅!", "뻥!"];

  function place(node, x, y) {   // 요소 한가운데가 (x, y) 에 오게 놓는다
    layer.appendChild(node);
    node.style.left = (x - node.offsetWidth / 2) + "px";
    node.style.top = (y - node.offsetHeight / 2) + "px";
  }
  function dropWhenDone(node, anim) {
    anim.onfinish = function () { if (node.parentNode) node.parentNode.removeChild(node); };
  }

  function explode(x, y, target) {
    while (layer.childElementCount > 90) layer.removeChild(layer.firstChild);

    const burst = document.createElement("span");
    burst.className = "fx-heart";   // 도트 그림 요소(배경 이미지 확대) 공통 스타일
    burst.style.backgroundImage = BURST.url;
    burst.style.width = BURST.w * 3 + "px";
    burst.style.height = BURST.h * 3 + "px";
    place(burst, x, y);

    const word = document.createElement("span");
    word.className = "fx-laugh";   // 갈색 테두리 글자 공통 스타일
    word.textContent = BOOM_WORDS[Math.floor(Math.random() * BOOM_WORDS.length)];
    word.style.fontSize = "22px";
    word.style.color = "#fff6c2";
    place(word, x, y);

    if (reduceMotion) {   // 움직임 줄이기: 별과 글자가 제자리에서 흐려지기만 한다
      dropWhenDone(burst, burst.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, fill: "forwards" }));
      dropWhenDone(word, word.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, fill: "forwards" }));
      return;
    }

    dropWhenDone(burst, burst.animate([
      { transform: "scale(0.2)", opacity: 1, offset: 0 },
      { transform: "scale(1.05)", opacity: 1, offset: 0.35 },
      { transform: "scale(1.3)", opacity: 0, offset: 1 }
    ], { duration: 460, easing: "ease-out", fill: "forwards" }));

    const tilt = rand(-14, 14);
    dropWhenDone(word, word.animate([
      { transform: "translateY(0) scale(0.3) rotate(" + tilt + "deg)", opacity: 0, offset: 0 },
      { transform: "translateY(-7px) scale(1.35) rotate(" + tilt + "deg)", opacity: 1, offset: 0.25 },
      { transform: "translateY(-11px) scale(1) rotate(" + tilt * 0.5 + "deg)", opacity: 1, offset: 0.7 },
      { transform: "translateY(-22px) scale(0.9) rotate(" + tilt * 0.5 + "deg)", opacity: 0, offset: 1 }
    ], { duration: 900, easing: "ease-out", fill: "forwards" }));

    // 파편: 사방으로 튀어 나가다가 아래로 떨어지며 사라진다
    const chips = 16 + Math.floor(Math.random() * 6);
    for (let i = 0; i < chips; i++) {
      const chip = document.createElement("span");
      chip.className = "fx-chip";
      const size = Math.round(rand(3, 5));
      chip.style.width = chip.style.height = size + "px";
      chip.style.background = CHIP_COLORS[Math.floor(Math.random() * CHIP_COLORS.length)];
      place(chip, x, y);
      const ang = rand(0, Math.PI * 2);
      const dist = rand(35, 95);
      const dx = Math.cos(ang) * dist;
      const dy = Math.sin(ang) * dist;
      const fall = rand(20, 55);
      dropWhenDone(chip, chip.animate([
        { transform: "translate(0px, 0px) rotate(0deg) scale(1)", opacity: 1, offset: 0 },
        { transform: "translate(" + dx * 0.8 + "px, " + dy * 0.8 + "px) rotate(" + rand(-180, 180) + "deg) scale(1)", opacity: 1, offset: 0.45 },
        { transform: "translate(" + dx + "px, " + (dy + fall) + "px) rotate(" + rand(-360, 360) + "deg) scale(0.4)", opacity: 0, offset: 1 }
      ], { duration: rand(650, 950), easing: "cubic-bezier(.2,.7,.4,1)", fill: "forwards" }));
    }

    // 폭발 순간 그림이 쿵 하고 흔들린다
    if (target && target.animate) {
      target.animate([
        { transform: "translate(0, 0)" }, { transform: "translate(-3px, 1px)" }, { transform: "translate(3px, -1px)" },
        { transform: "translate(-2px, -1px)" }, { transform: "translate(2px, 1px)" }, { transform: "translate(0, 0)" }
      ], { duration: 300, easing: "linear" });
    }
  }

  function bomb(x, y, target) {
    while (layer.childElementCount > 90) layer.removeChild(layer.firstChild);
    const b = document.createElement("span");
    b.className = "fx-heart";
    b.style.backgroundImage = bombSprite.url;
    b.style.width = bombSprite.w * 2 + "px";
    b.style.height = bombSprite.h * 2 + "px";
    place(b, x, y);
    const done = function () { if (b.parentNode) b.parentNode.removeChild(b); explode(x, y, target); };
    if (reduceMotion) { setTimeout(done, 250); return; }
    const a = b.animate([
      { transform: "scale(0) rotate(0deg)", offset: 0 },
      { transform: "scale(1.25) rotate(0deg)", offset: 0.15 },
      { transform: "scale(1) rotate(-6deg)", offset: 0.25 },
      { transform: "scale(1.1) rotate(6deg)", offset: 0.4 },
      { transform: "scale(1.2) rotate(-8deg)", offset: 0.55 },
      { transform: "scale(1.3) rotate(8deg)", offset: 0.7 },
      { transform: "scale(1.4) rotate(-10deg)", offset: 0.85 },
      { transform: "scale(1.5) rotate(10deg)", offset: 1 }
    ], { duration: 650, easing: "linear", fill: "forwards" });
    a.onfinish = done;
  }

  // ---- 폭죽(4번 그림): 누른 자리에서 로켓이 위로 올라가 일정 높이에서 펑 터진다. ----
  //   · 한 번 누르면 로켓 3발(가운데 큰 것 + 양옆 작은 것 둘)이 시간차로 올라간다.
  //   · 터지는 모양은 매번 다르다: 동그라미(겹고리) / 하트 / 별 / 버들(길게 늘어지는 불꽃)
  //   · 불꽃은 꼬리를 끌고, 흰색 → 고유색 → 금색으로 색이 변하며, 터진 뒤에는 반짝이가 흩날린다.
  const FIRE_COLORS = ["#ffd34d", "#ff6fae", "#5ad6ff", "#9dff6a", "#ff5a4f", "#c58bff", "#ff9a3d"];   // 노랑, 분홍, 하늘, 연두, 빨강, 보라, 주황
  const FIRE_GOLD = "#ffc94d";
  const MAX_FIRE_PIECES = 460;   // 폭죽은 조각이 많아서 한도를 넉넉히 둔다(그래도 넘으면 오래된 것부터 지움)
  const pickColor = function () { return FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)]; };

  function spark(x, y, color, size) {   // 빛나는 작은 네모 하나
    const sp = document.createElement("span");
    sp.className = "fx-spark";
    sp.style.width = sp.style.height = size + "px";
    sp.style.background = color;
    sp.style.boxShadow = "0 0 " + size * 2 + "px " + color;
    place(sp, x, y);
    return sp;
  }

  // 모양별로 불꽃이 가 닿을 자리(중심 기준 dx, dy) 목록을 만든다. R 은 크기(반지름).
  function shapePoints(kind, R, n) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      if (kind === "heart") {   // 하트 곡선
        pts.push({ dx: (16 * Math.pow(Math.sin(t), 3)) * R / 17, dy: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * R / 17 });
      } else if (kind === "star") {   // 5각 별: 꼭짓점(R)과 안쪽 꼭짓점(0.42R)을 번갈아 잇는 선 위의 점
        const seg = (i / n) * 10;
        const k = Math.floor(seg);
        const f = seg - k;
        const a0 = (k / 10) * Math.PI * 2 - Math.PI / 2;
        const a1 = ((k + 1) / 10) * Math.PI * 2 - Math.PI / 2;
        const r0 = k % 2 === 0 ? R : R * 0.42;
        const r1 = k % 2 === 0 ? R * 0.42 : R;
        pts.push({ dx: Math.cos(a0) * r0 * (1 - f) + Math.cos(a1) * r1 * f, dy: Math.sin(a0) * r0 * (1 - f) + Math.sin(a1) * r1 * f });
      } else {   // 동그라미
        pts.push({ dx: Math.cos(t) * R, dy: Math.sin(t) * R });
      }
    }
    return pts;
  }

  // 의성어 글자("슝~", "팡!"): 갈색 테두리 글자(.fx-laugh)를 (x, y) 에 놓는다.
  function sfxText(text, x, y, size, color) {
    const t = document.createElement("span");
    t.className = "fx-laugh";
    t.textContent = text;
    t.style.fontSize = Math.round(size) + "px";
    t.style.color = color;
    place(t, x, y);
    return t;
  }

  // 불꽃 하나(+꼬리)를 (cx, cy) 에서 (dx, dy) 로 쏘아 보낸다.
  function flySpark(cx, cy, dx, dy, o) {
    const tails = o.still ? 0 : o.tails;
    for (let k = 0; k <= tails; k++) {   // k=0 이 본체, 나머지는 시간차를 둔 꼬리(더 작고 흐림)
      const alpha = k === 0 ? 1 : 0.55 / k;
      const sz = Math.max(2, o.size * (k === 0 ? 1 : 0.78 - k * 0.1));
      const sp = spark(cx, cy, "#ffffff", sz);
      if (o.still) {   // 움직임 줄이기: 자리에 놓고 그 자리에서 흐려지기만 한다
        sp.style.transform = "translate(" + dx + "px, " + dy + "px)";
        sp.style.background = o.color;
        dropWhenDone(sp, sp.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, fill: "forwards" }));
        continue;
      }
      const glow = function (c) { return "0 0 " + sz * 2 + "px " + c; };
      dropWhenDone(sp, sp.animate([
        { transform: "translate(0px, 0px) scale(1)", opacity: 0, background: "#ffffff", boxShadow: glow("#ffffff"), offset: 0, easing: "cubic-bezier(.1,.8,.3,1)" },
        { transform: "translate(" + dx + "px, " + dy + "px) scale(1)", opacity: alpha, background: o.color, boxShadow: glow(o.color), offset: 0.3, easing: "linear" },
        { transform: "translate(" + dx * 1.03 + "px, " + (dy + o.fall * 0.35) + "px) scale(0.95)", opacity: alpha, background: o.color, boxShadow: glow(o.color), offset: 0.62, easing: "ease-in" },
        { transform: "translate(" + dx * 1.07 + "px, " + (dy + o.fall) + "px) scale(0.3)", opacity: 0, background: FIRE_GOLD, boxShadow: glow(FIRE_GOLD), offset: 1 }
      ], { duration: o.duration, delay: o.delay + k * 70, easing: "linear", fill: "both" }));
    }
  }

  function fireworkBurst(cx, cy, scale, still) {
    while (layer.childElementCount > MAX_FIRE_PIECES) layer.removeChild(layer.firstChild);
    const kinds = ["peony", "peony", "heart", "star", "willow"];   // 동그라미를 조금 더 자주
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const main = pickColor();
    let second = pickColor();
    if (second === main) second = "#ffffff";
    const R = rand(120, 150) * scale;

    // 번쩍임 + 퍼지는 충격 고리
    const flash = spark(cx, cy, "#ffffff", 22 * scale);
    dropWhenDone(flash, flash.animate([
      { transform: "scale(0.4)", opacity: 1, offset: 0 }, { transform: "scale(3.2)", opacity: 0, offset: 1 }
    ], { duration: 420, easing: "ease-out", fill: "forwards" }));
    if (!still) {
      const ring = document.createElement("span");
      ring.className = "fx-ring";
      ring.style.width = ring.style.height = "24px";
      place(ring, cx, cy);
      dropWhenDone(ring, ring.animate([
        { transform: "scale(0.3)", opacity: 0.9, offset: 0 }, { transform: "scale(" + (R / 12) + ")", opacity: 0, offset: 1 }
      ], { duration: 520, easing: "ease-out", fill: "forwards" }));
    }

    // "팡!": 터지는 자리에서 통통 튀어나왔다가 위로 살짝 뜨며 사라진다
    const pang = sfxText("팡!", cx, cy - 4 * scale, 64 * scale, still ? "#ffffff" : main);
    if (still) {
      dropWhenDone(pang, pang.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, fill: "forwards" }));
    } else {
      const tilt = rand(-10, 10);
      dropWhenDone(pang, pang.animate([
        { transform: "translateY(0) scale(0.3) rotate(" + tilt + "deg)", opacity: 0, offset: 0 },
        { transform: "translateY(-10px) scale(1.4) rotate(" + tilt + "deg)", opacity: 1, offset: 0.2 },
        { transform: "translateY(-20px) scale(1) rotate(" + tilt * 0.5 + "deg)", opacity: 1, offset: 0.6 },
        { transform: "translateY(-48px) scale(0.95) rotate(" + tilt * 0.5 + "deg)", opacity: 0, offset: 1 }
      ], { duration: 1000, easing: "ease-out", fill: "forwards" }));
    }

    // 불꽃 층: 모양마다 다르게 짠다
    const layers = kind === "willow"
      ? [{ shape: "peony", n: 24, R: R * 0.95, color: FIRE_GOLD, size: 7, fall: 150, dur: 3000, tails: 3, delay: 0 },
         { shape: "peony", n: 14, R: R * 0.55, color: "#ffffff", size: 5, fall: 130, dur: 2800, tails: 2, delay: 120 }]
      : kind === "heart" || kind === "star"
      ? [{ shape: kind, n: 34, R: R, color: main, size: 8, fall: 70, dur: 2400, tails: 2, delay: 0 },
         { shape: kind, n: 18, R: R * 0.5, color: second, size: 6, fall: 60, dur: 2300, tails: 1, delay: 140 }]
      : [{ shape: "peony", n: 26, R: R, color: main, size: 8, fall: 90, dur: 2400, tails: 2, delay: 0 },
         { shape: "peony", n: 14, R: R * 0.5, color: second, size: 6, fall: 80, dur: 2300, tails: 1, delay: 140 }];
    layers.forEach(function (L) {
      shapePoints(L.shape, L.R, still ? Math.min(L.n, 12) : L.n).forEach(function (pt) {
        const jitter = L.shape === "peony" ? rand(0.9, 1.08) : 1;   // 동그라미만 반지름을 살짝 흩어 입체감을 준다
        flySpark(cx, cy, pt.dx * jitter, pt.dy * jitter, {
          color: L.color, size: L.size * scale, fall: L.fall * rand(0.8, 1.2) * scale, duration: L.dur * rand(0.9, 1.15),
          delay: L.delay, tails: L.tails, still: still
        });
      });
    });

    // 터진 뒤 반짝이: 작은 별가루가 깜빡이며 천천히 내려앉는다
    if (!still) {
      for (let i = 0; i < Math.round(18 * scale); i++) {
        const ang = rand(0, Math.PI * 2);
        const rad = rand(0.2, 1.0) * R;
        const g = spark(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad, Math.random() < 0.5 ? "#ffffff" : FIRE_GOLD, 3);
        dropWhenDone(g, g.animate([
          { transform: "translate(0px, 0px)", opacity: 0, offset: 0 },
          { transform: "translate(" + rand(-6, 6) + "px, 6px)", opacity: 1, offset: 0.25 },
          { transform: "translate(" + rand(-8, 8) + "px, 16px)", opacity: 0.25, offset: 0.5 },
          { transform: "translate(" + rand(-10, 10) + "px, 28px)", opacity: 1, offset: 0.75 },
          { transform: "translate(" + rand(-12, 12) + "px, 44px)", opacity: 0, offset: 1 }
        ], { duration: rand(900, 1400), delay: rand(500, 1400) * scale + 300, easing: "linear", fill: "both" }));
      }
    }
  }

  // 로켓 한 발: 누른 자리에서 위로 올라가며 꼬리를 흘리다가 꼭대기에서 터진다.
  function launchRocket(x, y, scale, riseMin, riseMax) {
    const rise = Math.max(50, Math.min(rand(riseMin, riseMax), y - 190));   // 화면 위쪽을 벗어나지 않게 제한
    if (reduceMotion) { fireworkBurst(x, y - rise * 0.5, scale, true); return; }   // 움직임 줄이기: 쏘아 올리지 않고 그 자리에서 터진 뒤 흐려지기만

    const rocket = spark(x, y, "#fff3c4", 7);
    const wob = rand(5, 9) * (Math.random() < 0.5 ? -1 : 1);   // 올라가며 살짝 좌우로 흔들린다
    const a = rocket.animate([
      { transform: "translate(0px, 0px)", offset: 0 },
      { transform: "translate(" + wob + "px, " + (-rise * 0.3) + "px)", offset: 0.3 },
      { transform: "translate(" + (-wob) + "px, " + (-rise * 0.65) + "px)", offset: 0.65 },
      { transform: "translate(0px, " + (-rise) + "px)", offset: 1 }
    ], { duration: rand(1200, 1500), easing: "cubic-bezier(.25,.6,.35,1)", fill: "forwards" });

    // "슝~": 로켓 옆에서 같이 위로 올라가며 사라진다(뒤처지게 해서 로켓을 따라가는 느낌)
    const side = Math.random() < 0.5 ? -1 : 1;
    const whoosh = sfxText("슝~", x + side * (30 + 14 * scale), y, 40 * scale + 8, "#fff3c4");
    const wt = rand(-12, 12);
    dropWhenDone(whoosh, whoosh.animate([
      { transform: "translateY(0) rotate(" + wt + "deg) scale(0.6)", opacity: 0, offset: 0 },
      { transform: "translateY(" + (-rise * 0.2) + "px) rotate(" + wt + "deg) scale(1)", opacity: 1, offset: 0.15 },
      { transform: "translateY(" + (-rise * 0.75) + "px) rotate(" + wt + "deg) scale(1)", opacity: 0.9, offset: 0.7 },
      { transform: "translateY(" + (-rise * 0.95) + "px) rotate(" + wt + "deg) scale(0.9)", opacity: 0, offset: 1 }
    ], { duration: a.effect.getTiming().duration, easing: "cubic-bezier(.25,.6,.35,1)", fill: "forwards" }));

    const sparkle = ["#ffcf6b", "#ffffff", "#ff9a3d"];
    const trail = setInterval(function () {
      const r = rocket.getBoundingClientRect();
      if (!r.width) return;
      const t = spark(r.left + r.width / 2, r.top + r.height / 2, sparkle[Math.floor(Math.random() * sparkle.length)], rand(3, 5));
      dropWhenDone(t, t.animate([
        { transform: "translate(0px, 0px) scale(1)", opacity: 0.95 },
        { transform: "translate(" + rand(-6, 6) + "px, " + rand(10, 28) + "px) scale(0.2)", opacity: 0 }
      ], { duration: 560, easing: "ease-out", fill: "forwards" }));
    }, 55);

    a.onfinish = function () {
      clearInterval(trail);
      const r = rocket.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (rocket.parentNode) rocket.parentNode.removeChild(rocket);
      fireworkBurst(cx, cy, scale, false);
    };
  }

  function firework(x, y) {
    launchRocket(x, y, 1, 100, 160);                                                        // 가운데: 크게
    if (reduceMotion) return;
    setTimeout(function () { launchRocket(x + rand(-80, -40), y, 0.62, 70, 120); }, 220);  // 왼쪽 작은 것
    setTimeout(function () { launchRocket(x + rand(40, 80), y, 0.62, 70, 120); }, 400);    // 오른쪽 작은 것
  }

  const EFFECTS = {
    hearts: burst(makeHeart),   // 1번 그림
    laugh: burst(makeLaugh),    // 2번 그림
    bomb: bomb,                 // 3번 그림
    firework: firework          // 4번 그림
  };

  document.querySelectorAll("[data-fx]").forEach(function (node) {
    const effect = EFFECTS[node.getAttribute("data-fx")];
    if (!effect) return;
    function fire(x, y) { effect(x, y, node); }
    node.addEventListener("click", function (e) {
      if (e.detail === 0) {   // 키보드(Enter/Space)로 눌렀을 때는 클릭 좌표가 없으니 그림 한가운데에서
        const r = node.getBoundingClientRect();
        fire(r.left + r.width / 2, r.top + r.height / 2);
      } else {
        fire(e.clientX, e.clientY);
      }
    });
    node.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); node.click(); }
    });
  });
})();
