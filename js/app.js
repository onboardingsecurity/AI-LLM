(function () {
  "use strict";

  // ---- 상수 ----------------------------------------------------------------
  // 화면비별 출력 크기. 미리보기 캔버스와 내려받는 파일이 같은 크기를 쓴다.
  var RATIOS = {
    "1:1": { w: 1080, h: 1080, file: "1x1" },
    "4:5": { w: 1080, h: 1350, file: "4x5" },
    "9:16": { w: 1080, h: 1920, file: "9x16" }
  };
  var MAX_FILE_BYTES = 25 * 1024 * 1024;
  var MAX_PIXELS = 50 * 1000 * 1000;
  var FONT_FAMILY = '"Gamja Flower", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  var LINE_HEIGHT = 1.25;
  var TEXT_MAX_W = 0.9;   // 문구 폭 한도 (캔버스 폭 대비)
  var TEXT_MAX_H = 0.9;   // 문구 높이 한도 (캔버스 높이 대비)
  var MIN_FIT_SIZE = 16;  // 자동 축소의 최소 크기
  var TEXT_LOCK_MESSAGE = "이미지를 넣어주세요.";
  var SIZE_MIN = 16;      // 문구 크기 조작(슬라이더, +/-)의 범위
  var SIZE_MAX = 100;
  var SIZE_DATA_MAX = 240; // 저장 데이터가 허용하는 최대값. 예전에 최대 240까지 저장한 템플릿과 JSON도 계속 읽을 수 있게 그대로 둔다.
  // 기본 문구와 위치. 처음 열 때, 이미지를 넣을 때, 기본 템플릿을 만들 때 같은 값을 쓴다.
  var DEFAULT_TEXT = "문구를 끌어서 위치를 옮기세요.\n화살표 키로도 옮길 수 있습니다.";
  var DEFAULT_SIZE = 26;
  var DEFAULT_X = 0.5;
  var DEFAULT_Y = 0.7;    // 가운데에서 아래쪽

  // ---- 상태 (화면이 아니라 이 객체가 원본이다) --------------------------------
  var state = {
    ratio: "1:1",
    image: null,       // ImageBitmap 또는 null
    imageName: "",
    blank: false,      // 이미지 없이 흰 카드로 시작했는가(이미지가 없어도 문구를 고칠 수 있는 상태)
    text: DEFAULT_TEXT,
    size: DEFAULT_SIZE,          // 1080 기준 px
    color: "#222222",  // 기본 글자색(기본 배경이 흰색이라 어둡게)
    x: DEFAULT_X,      // 캔버스 폭 대비 문구 중심 위치 (0~1)
    y: DEFAULT_Y       // 캔버스 높이 대비 문구 중심 위치 (0~1)
  };

  // ---- 요소 ----------------------------------------------------------------
  var canvas = document.getElementById("preview");
  var ctx = canvas.getContext("2d");
  var fileInput = document.getElementById("file-input");
  var uploadEl = document.getElementById("upload-card");
  var uploadStartBtn = document.getElementById("upload-start");
  var uploadSkipBtn = document.getElementById("upload-skip");
  var changeImageBtn = document.getElementById("change-image");
  var textInput = document.getElementById("text-input");
  var sizeInput = document.getElementById("size-input");
  var sizeOut = document.getElementById("size-out");
  var sizeDecBtn = document.getElementById("size-dec");
  var sizeIncBtn = document.getElementById("size-inc");
  var textFieldsEl = document.getElementById("text-fields");
  var colorInput = document.getElementById("color-input");
  var colorOut = document.getElementById("color-out");
  var ratioInputs = document.querySelectorAll('input[name="ratio"]');
  var downloadBtn = document.getElementById("download-btn");
  var textClearBtn = document.getElementById("text-clear");
  var tplNameInput = document.getElementById("tpl-name");
  var tplMemoInput = document.getElementById("tpl-memo");
  var tplSaveNewBtn = document.getElementById("tpl-save-new");
  var tplSaveUpdateBtn = document.getElementById("tpl-save-update");
  var tplListEl = document.getElementById("tpl-list");
  var tplDefaultsEl = document.getElementById("tpl-defaults"); // 미리보기 창 왼쪽에 세로로 놓이는 기본 템플릿 그림
  var tplEmptyEl = document.getElementById("tpl-empty");
  var tplExportBtn = document.getElementById("tpl-export");
  var tplImportInput = document.getElementById("tpl-import-input");

  // ---- 그리기 (미리보기와 이후 내보내기가 함께 쓸 함수) ------------------------
  function fontString(size) {
    return "400 " + size + "px " + FONT_FAMILY;
  }

  function drawBackground(c, w, h, image) {
    if (image) {
      var scale = Math.max(w / image.width, h / image.height);
      var dw = image.width * scale;
      var dh = image.height * scale;
      c.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
      return;
    }
    c.fillStyle = "#ffffff";   // 이미지를 불러오지 않았을 때의 기본 배경
    c.fillRect(0, 0, w, h);
  }

  // 글자 단위(이모지, 결합 문자를 쪼개지 않는 단위)로 나눈다.
  var segmenter = (typeof Intl !== "undefined" && Intl.Segmenter) ? new Intl.Segmenter("ko", { granularity: "grapheme" }) : null;
  function graphemes(str) {
    if (!segmenter) return Array.from(str);
    var out = [];
    var it = segmenter.segment(str)[Symbol.iterator]();
    for (var n = it.next(); !n.done; n = it.next()) out.push(n.value.segment);
    return out;
  }

  // 한 문단을 maxW 안에 들어가도록 줄바꿈한다. 공백이 있으면 공백에서, 없으면 글자 사이에서 나눈다.
  // c.font는 호출하는 쪽이 미리 맞춰 둔다.
  function wrapParagraph(c, para, maxW) {
    var lines = [];
    var cur = [];
    function joined(arr) { return arr.join("").replace(/\s+$/, ""); }
    function width(arr) { return c.measureText(joined(arr)).width; }
    var gs = graphemes(para);
    for (var i = 0; i < gs.length; i++) {
      cur.push(gs[i]);
      while (cur.length > 1 && width(cur) > maxW) {
        var sp = -1;
        for (var k = cur.length - 2; k > 0; k--) { if (/^\s$/.test(cur[k])) { sp = k; break; } }
        if (sp > 0) {
          lines.push(joined(cur.slice(0, sp)));
          cur = cur.slice(sp + 1);
        } else {
          lines.push(joined(cur.slice(0, -1)));
          cur = cur.slice(-1);
        }
      }
    }
    lines.push(joined(cur));
    return lines;
  }

  function wrapText(c, text, size, maxW) {
    c.font = fontString(size);
    var lines = [];
    var paras = text.split("\n");
    for (var i = 0; i < paras.length; i++) lines = lines.concat(wrapParagraph(c, paras[i], maxW));
    return lines;
  }

  // 줄바꿈과 글꼴 축소를 한곳에서 계산한다. 미리보기와 내보내기가 같은 결과를 얻는다.
  // 설정한 크기로 높이 한도 안에 들어가지 않으면 들어가는 가장 큰 크기로 줄인다.
  function computeLayout(c, w, h, s) {
    var maxW = w * TEXT_MAX_W;
    var maxH = h * TEXT_MAX_H;
    function fits(lines, size) { return lines.length * size * LINE_HEIGHT <= maxH; }
    var lines = wrapText(c, s.text, s.size, maxW);
    if (fits(lines, s.size)) return { lines: lines, size: s.size, shrunk: false, overflow: false };
    var lo = MIN_FIT_SIZE, hi = s.size, best = null;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      var l = wrapText(c, s.text, mid, maxW);
      if (fits(l, mid)) { best = { lines: l, size: mid }; lo = mid + 1; } else { hi = mid - 1; }
    }
    if (best) return { lines: best.lines, size: best.size, shrunk: true, overflow: false };
    // 최소 크기로도 넘친다: 조용히 자르지 않고 알려 준다.
    return { lines: wrapText(c, s.text, MIN_FIT_SIZE, maxW), size: MIN_FIT_SIZE, shrunk: true, overflow: true };
  }

  // 결과는 문구, 크기, 캔버스 크기, 글꼴 준비 여부에만 달라진다. 위치와 색을 바꿀 때(끌기 등)는 다시 계산하지 않는다.
  var layoutCache = null;
  function layoutText(c, w, h, s) {
    var key = JSON.stringify([s.text, s.size, w, h, fontReady()]);
    if (!layoutCache || layoutCache.key !== key) layoutCache = { key: key, lay: computeLayout(c, w, h, s) };
    return layoutCache.lay;
  }

  function drawText(c, w, h, s) {
    if (!s.text || !s.text.trim()) return null;
    c.save();
    var lay = layoutText(c, w, h, s);
    var lines = lay.lines;
    var lineH = lay.size * LINE_HEIGHT;
    var top = s.y * h - (lineH * (lines.length - 1)) / 2;
    c.font = fontString(lay.size);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = s.color;
    c.shadowColor = "rgba(0, 0, 0, 0.55)";
    c.shadowBlur = lay.size * 0.08;
    c.shadowOffsetY = lay.size * 0.03;
    for (var i = 0; i < lines.length; i++) {
      c.fillText(lines[i], s.x * w, top + i * lineH);
    }
    c.restore();
    return lay;
  }

  // 그린 결과의 배치 정보(줄여 그렸는지 등)를 돌려준다.
  function render(c, w, h, s) {
    c.clearRect(0, 0, w, h);
    drawBackground(c, w, h, s.image);
    return drawText(c, w, h, s);
  }

  var fitKey = null;
  // 글자가 최소 크기로도 넘치면 알림 창으로만 알린다. (크기를 줄여 그린 경우는 캔버스에서 바로 보이므로 알리지 않는다.)
  function showFitNote(lay) {
    var msg = "";
    if (lay && lay.overflow) {
      msg = "문구가 너무 길어 최소 크기(" + lay.size + ")로도 다 들어가지 않습니다. 문구를 줄여 주세요.";
    }
    if (msg === fitKey) return; // 그릴 때마다 같은 내용을 다시 알리지 않는다.
    fitKey = msg;
    if (msg) notifyTpl(msg);
  }

  function draw() {
    var r = RATIOS[state.ratio];
    showFitNote(render(ctx, r.w, r.h, state));
  }

  // 화면비를 바꾸면 캔버스 크기와 표시 비율을 함께 바꾼다.
  function applyRatio() {
    var r = RATIOS[state.ratio];
    canvas.width = r.w;   // 크기를 지정하면 캔버스가 지워지므로 바로 다시 그린다.
    canvas.height = r.h;
    canvas.style.setProperty("--ratio", String(r.w / r.h));
    draw();
  }

  // 지금 문구에 쓰이는 글꼴을 불러온다. 글꼴 API가 없으면 바로 끝난 것으로 본다.
  function fontSample() { return state.text || "가A"; }
  function fontReady() { return !document.fonts || document.fonts.check(fontString(state.size), fontSample()); }
  function loadFont() {
    return document.fonts && document.fonts.load ? document.fonts.load(fontString(state.size), fontSample()) : Promise.resolve();
  }

  // 글꼴 파일이 준비되면 다시 그린다 (준비 전에는 대체 글꼴로 그려진다). 이미 준비되어 있으면 방금 그린 것으로 충분하다.
  function ensureFontThenDraw() {
    if (fontReady()) return;
    loadFont().then(draw, function () { /* 글꼴 실패 시 대체 글꼴로 유지 */ });
  }

  function redraw() {
    draw();
    ensureFontThenDraw();
  }

  // 내보내기 전에 지금 문구에 쓰이는 글꼴이 모두 준비될 때까지 기다린다.
  function fontsReadyForCurrentText() {
    return loadFont().then(function () {
      return document.fonts && document.fonts.ready;
    }, function () { /* 실패하면 대체 글꼴로 계속한다. */ });
  }

  // 저장하지 않은 편집이 있는지. 템플릿을 불러와 덮어쓰기 전에 사용자에게 알리는 데 쓴다.

  // 이미지를 불러오기 전에 미리보기 창을 채우는 올리기 카드.
  // 이미지를 불러왔거나, 편집을 시작했거나, "이미지 없이 시작"을 누르면 닫는다. 카드가 덮고 있는 동안 캔버스에는 초점이 가지 않는다.
  function setUploadOpen(open) {
    uploadEl.hidden = !open;
    uploadEl.parentNode.classList.toggle("empty", open); // 카드가 열려 있는 동안은 미리보기 창의 회색 바탕을 없앤다
    canvas.inert = open;
    // 카드를 닫으면 미리보기 창 모서리에 이미지를 다시 고르는 버튼을 보여 준다. 이미지가 있으면 "바꾸기", 없으면 "넣기".
    changeImageBtn.hidden = open;
    downloadBtn.hidden = open; // "이미지 바꾸기" 버튼이 안 보이면 "내려받기"도 안 보인다
    changeImageBtn.textContent = state.image ? "이미지 바꾸기" : "이미지 넣기";
    uploadSkipBtn.textContent = state.image || state.blank ? "돌아가기" : "이미지 없이 시작";
    if (!open) uploadEl.classList.remove("dragover");
    updateTextLock();
  }

  // 이미지를 넣거나 "이미지 없이 시작"(흰 카드)을 누르기 전에는 문구 도구(내용, 크기, 색)를 쓸 수 없다.
  var tplStorageBroken = false;
  function updateTextLock() {
    var locked = !state.image && !state.blank;
    textFieldsEl.disabled = locked;
    // 입력이 막혀 있는 동안 입력칸에는 이유를 안내하는 글씨(placeholder)만 보이고, 풀리면 원래 문구가 나타난다.
    textInput.placeholder = locked ? TEXT_LOCK_MESSAGE : "";
    textInput.value = locked ? "" : state.text;
    tplSaveNewBtn.disabled = !uploadEl.hidden || tplStorageBroken; // 올리기 카드가 보이는 동안에는 새 템플릿 저장을 막는다
  }

  // ---- 파일 검사와 불러오기 ---------------------------------------------------
  function startsWith(bytes, sig, offset) {
    offset = offset || 0;
    for (var i = 0; i < sig.length; i++) {
      if (bytes[offset + i] !== sig[i]) return false;
    }
    return true;
  }

  // 확장자가 아니라 파일 앞부분(서명)으로 형식을 판별한다.
  function sniff(bytes) {
    if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ok: true, type: "PNG" };
    if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { ok: true, type: "JPEG" };
    if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return { ok: false, type: "GIF" };
    if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return { ok: false, type: "WebP" };
    if (startsWith(bytes, [0x42, 0x4d])) return { ok: false, type: "BMP" };
    if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return { ok: false, type: "PDF" };
    if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])) return { ok: false, type: "TIFF" };
    var head = "";
    for (var i = 0; i < bytes.length; i++) head += String.fromCharCode(bytes[i]);
    if (/^\s*<(\?xml|svg)/i.test(head)) return { ok: false, type: "SVG" };
    return { ok: false, type: "" };
  }

  function closeBitmap(img) {
    if (img && typeof img.close === "function") img.close();
  }

  // 파일 앞부분을 읽어 형식을 판별한다.
  function sniffBlob(blob) {
    return blob.slice(0, 32).arrayBuffer().then(function (buf) { return sniff(new Uint8Array(buf)); });
  }

  // 입력칸에서 고른 파일을 꺼내고, 같은 파일을 다시 골라도 change가 발생하도록 비운다.
  function takeFile(input) {
    var f = input.files && input.files[0];
    input.value = "";
    return f;
  }

  function decodeImage(file) {
    if (typeof createImageBitmap === "function") {
      return createImageBitmap(file);
    }
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("decode")); };
      img.src = url;
    });
  }

  function reject(file, reason) {
    // 기존 작업(state)은 건드리지 않는다.
    notifyTpl("\"" + file.name + "\" 파일을 불러오지 못했습니다. " + reason + " 기존 작업은 그대로 유지됩니다.");
  }

  var loadSeq = 0;
  function loadFile(file) {
    if (!file) return;
    var seq = ++loadSeq;

    if (file.size === 0) return reject(file, "빈 파일입니다.");
    if (file.size > MAX_FILE_BYTES) {
      return reject(file, "파일이 너무 큽니다. " + Math.round(MAX_FILE_BYTES / 1024 / 1024) + "MB 이하의 파일을 사용해 주세요.");
    }

    sniffBlob(file).then(function (kind) {
      if (!kind.ok) {
        var what = kind.type ? kind.type + " 형식은 지원하지 않습니다." : "이미지 파일이 아니거나 알 수 없는 형식입니다.";
        return reject(file, what + " PNG 또는 JPEG 파일을 선택해 주세요.");
      }
      return decodeImage(file).then(function (img) {
        if (seq !== loadSeq) { closeBitmap(img); return; } // 더 나중에 시작한 불러오기가 있으면 이 결과는 버린다.
        if (!img.width || !img.height || img.width * img.height > MAX_PIXELS) {
          closeBitmap(img);
          return reject(file, "이미지 크기가 올바르지 않거나 너무 큽니다.");
        }
        // 여기까지 모두 통과한 뒤에만 기존 이미지를 교체한다.
        closeBitmap(state.image);
        state.image = img;
        state.imageName = file.name;
        // 이미지를 넣을 때마다 문구와 위치를 기본값으로 되돌린다. 크기와 색은 그대로 둔다.
        state.text = DEFAULT_TEXT;
        state.x = DEFAULT_X;
        state.y = DEFAULT_Y;
        textInput.value = DEFAULT_TEXT;
        setUploadOpen(false);
        draw();
      }, function () {
        if (seq !== loadSeq) return;
        reject(file, kind.type + " 파일이 손상되어 열 수 없습니다.");
      });
    }, function () {
      reject(file, "파일을 읽을 수 없습니다.");
    });
  }

  fileInput.addEventListener("change", function () { loadFile(takeFile(fileInput)); });

  function dragHasFiles(e) { return !!(e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") !== -1); }
  uploadStartBtn.addEventListener("click", function () { fileInput.click(); });
  uploadSkipBtn.addEventListener("click", function () { state.blank = !state.image; setUploadOpen(false); }); // 이미지 없이 시작하면 흰 카드가 이미지 자리를 대신한다
  changeImageBtn.addEventListener("click", function () { setUploadOpen(true); uploadStartBtn.focus(); });
  document.addEventListener("dragover", function (e) {
    e.preventDefault();
    if (!uploadEl.hidden) uploadEl.classList.toggle("dragover", dragHasFiles(e)); // 파일을 끌고 오면 카드를 강조한다
  });
  document.addEventListener("dragleave", function (e) { if (!e.relatedTarget) uploadEl.classList.remove("dragover"); });
  document.addEventListener("drop", function (e) {
    e.preventDefault();
    uploadEl.classList.remove("dragover");
    var files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length) loadFile(files[0]);
  });

  // ---- 문구 도구 -----------------------------------------------------------
  // 상태(state)의 크기, 색을 화면의 숫자 표시와 +/- 버튼, 문구 지우기 버튼에 반영한다.
  function renderReadouts() {
    sizeOut.textContent = String(state.size);
    sizeDecBtn.disabled = state.size <= SIZE_MIN;
    sizeIncBtn.disabled = state.size >= SIZE_MAX;
    colorOut.textContent = state.color;
    textClearBtn.disabled = !state.text;
  }
  textInput.addEventListener("input", function () {
    state.text = textInput.value;
    renderReadouts();
    redraw();
  });
  // 문구 지우기: 문구 내용을 통째로 비운다(크기, 색, 위치는 그대로). 빈 문구는 카드에 글자를 그리지 않는다.
  textClearBtn.addEventListener("click", function () {
    state.text = "";
    textInput.value = "";
    renderReadouts();
    redraw();
    textInput.focus();
  });
  // 슬라이더와 +/- 버튼이 같은 곳으로 크기를 바꾼다.
  function setSize(v) {
    state.size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(v)));
    sizeInput.value = String(state.size);
    renderReadouts();
    redraw();
  }
  sizeInput.addEventListener("input", function () { setSize(Number(sizeInput.value)); });
  sizeDecBtn.addEventListener("click", function () { setSize(state.size - 1); });
  sizeIncBtn.addEventListener("click", function () { setSize(state.size + 1); });
  colorInput.addEventListener("input", function () {
    state.color = colorInput.value;
    renderReadouts();
    draw();
  });

  // ---- 위치: 끌어서 옮기기 + 화살표 키 ------------------------------------------
  function clamp01(v) { return Math.min(1, Math.max(0, v)); }

  var drag = null;
  canvas.addEventListener("pointerdown", function (e) {
    drag = { id: e.pointerId, px: e.clientX, py: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    canvas.focus({ preventScroll: true });
  });
  canvas.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var rect = canvas.getBoundingClientRect();
    state.x = clamp01(state.x + (e.clientX - drag.px) / rect.width);
    state.y = clamp01(state.y + (e.clientY - drag.py) / rect.height);
    drag.px = e.clientX;
    drag.py = e.clientY;
    draw();
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  canvas.addEventListener("keydown", function (e) {
    var step = e.shiftKey ? 0.05 : 0.01;
    var moved = true;
    if (e.key === "ArrowLeft") state.x = clamp01(state.x - step);
    else if (e.key === "ArrowRight") state.x = clamp01(state.x + step);
    else if (e.key === "ArrowUp") state.y = clamp01(state.y - step);
    else if (e.key === "ArrowDown") state.y = clamp01(state.y + step);
    else moved = false;
    if (moved) { e.preventDefault(); draw(); }
  });

  // ---- 화면비 선택 -----------------------------------------------------------
  Array.prototype.forEach.call(ratioInputs, function (input) {
    input.addEventListener("change", function () {
      if (!input.checked) return;
      state.ratio = input.value;
      applyRatio();
    });
  });

  // ---- 내려받기 ---------------------------------------------------------------
  // 미리보기 캔버스를 그대로 저장하지 않고, 같은 render()로 새 캔버스에 다시 그려 저장한다.
  // 그래서 화면과 파일이 같은지 실제로 대조할 수 있다.
  function timestamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  function canvasToPngBlob(c) {
    return new Promise(function (resolve, reject) {
      c.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error("toBlob")); }, "image/png");
    });
  }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  function exportPng() {
    downloadBtn.disabled = true;
    return fontsReadyForCurrentText().then(function () {
      var r = RATIOS[state.ratio];
      draw(); // 글꼴이 준비된 상태로 미리보기도 다시 그려 화면과 파일을 맞춘다.
      var off = document.createElement("canvas");
      off.width = r.w;
      off.height = r.h;
      render(off.getContext("2d"), r.w, r.h, state);
      return canvasToPngBlob(off).then(function (blob) {
        var name = "meme-card-" + r.file + "-" + timestamp() + ".png";
        downloadBlob(blob, name);
        notifyTpl(name + " (" + r.w + "×" + r.h + ") 을 내려받았습니다.");
      });
    }).catch(function () {
      notifyTpl("파일을 만들지 못했습니다. 다시 시도해 주세요.");
    }).then(function () {
      downloadBtn.disabled = false;
    });
  }
  downloadBtn.addEventListener("click", exportPng);

  // ---- 템플릿: 데이터 정의와 검사 ----------------------------------------------------
  // 항목과 필수 여부는 docs/template-schema.md에 적어 두었다. 이후 JSON 내보내기, 가져오기 검증도 이 정의를 쓴다.
  var DB_NAME = "meme-card-studio";
  var DB_VERSION = 1;
  var STORE = "templates";
  var TEMPLATE_VERSION = 1;
  // 글자 수 한도는 입력칸(maxlength)과 같은 값을 쓴다.
  // 새로 입력하는 이름과 메모는 입력칸 제한(15자, 20자)만 따르고, 저장 데이터가 허용하는 길이는 예전 그대로(40자, 100자)다: 예전에 길게 저장한 템플릿과 JSON도 읽힌다.
  var NAME_MAX = 40;
  var MEMO_MAX = 100;
  var TEXT_MAX = 200; // 저장 데이터가 허용하는 문구 길이. 화면에서 입력하는 길이는 입력칸의 maxlength(50)로 제한하고, 예전에 더 길게 저장한 템플릿도 읽을 수 있게 그대로 둔다.

  var FILE_FORMAT = "meme-card-studio-templates"; // JSON 파일 맨 위의 format 값
  var FILE_VERSION = 1;
  var MAX_JSON_BYTES = 100 * 1024 * 1024;

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function isStr(v) { return typeof v === "string"; }
  function isUnit(v) { return isNum(v) && v >= 0 && v <= 1; }
  function isPosInt(v) { return Number.isInteger(v) && v >= 1; }

  function shown(v) {
    var t;
    try { t = JSON.stringify(v); } catch (e) { t = String(v); }
    if (t === undefined) t = String(v);
    return t.length > 30 ? t.slice(0, 30) + "…" : t;
  }

  // 항목이 없는 것과 값이 잘못된 것을 구분해 알려 준다.
  function need(errs, obj, prefix, field, label, ok, hint) {
    var v = obj[field];
    var name = prefix + field + "(" + label + ")";
    if (v === undefined) { errs.push("필수 항목이 없습니다: " + name); errs.missing = true; }
    else if (!ok(v)) errs.push(name + " 값이 올바르지 않습니다. " + hint + " (받은 값: " + shown(v) + ")");
  }

  // form: "stored"(IndexedDB에 저장된 모습, 이미지 본체는 Blob) 또는 "file"(JSON 파일 안의 모습, 이미지 본체는 Base64 문자열 data)
  // 문제가 있으면 사람이 읽을 수 있는 문장 배열을, 없으면 빈 배열을 돌려준다. 첫 오류에서 멈추지 않고 모두 모은다.
  function validateTemplate(t, form) {
    var errs = [];
    if (!isObj(t)) return ["템플릿 데이터가 객체가 아닙니다."];
    var isTime = function (v) { return isStr(v) && !isNaN(Date.parse(v)); };
    need(errs, t, "", "id", "고유 번호", function (v) { return isStr(v) && v.length > 0 && v.length <= 100; }, "비어 있지 않은 문자열이어야 합니다.");
    need(errs, t, "", "version", "구조 버전", function (v) { return v === TEMPLATE_VERSION; }, TEMPLATE_VERSION + "이어야 합니다.");
    need(errs, t, "", "name", "이름", function (v) { return isStr(v) && v.trim().length > 0 && v.length <= NAME_MAX; }, "공백을 뺀 1~" + NAME_MAX + "자여야 합니다.");
    need(errs, t, "", "memo", "메모", function (v) { return isStr(v) && v.length <= MEMO_MAX; }, "0~" + MEMO_MAX + "자 문자열이어야 합니다(없으면 빈 문자열).");
    need(errs, t, "", "createdAt", "만든 시각", isTime, "날짜와 시각 문자열이어야 합니다.");
    need(errs, t, "", "updatedAt", "고친 시각", isTime, "날짜와 시각 문자열이어야 합니다.");
    need(errs, t, "", "ratio", "화면비", function (v) { return isStr(v) && Object.prototype.hasOwnProperty.call(RATIOS, v); }, "\"1:1\", \"4:5\", \"9:16\" 중 하나여야 합니다.");
    need(errs, t, "", "text", "문구", function (v) { return isStr(v) && v.length <= TEXT_MAX; }, "0~" + TEXT_MAX + "자 문자열이어야 합니다.");
    need(errs, t, "", "size", "문구 크기", function (v) { return isNum(v) && v >= SIZE_MIN && v <= SIZE_DATA_MAX; }, SIZE_MIN + "~" + SIZE_DATA_MAX + " 사이의 숫자여야 합니다.");
    need(errs, t, "", "color", "문구 색", function (v) { return isStr(v) && /^#[0-9a-fA-F]{6}$/.test(v); }, "#rrggbb 형식이어야 합니다.");
    need(errs, t, "", "x", "문구 가로 위치", isUnit, "0~1 사이의 숫자여야 합니다.");
    need(errs, t, "", "y", "문구 세로 위치", isUnit, "0~1 사이의 숫자여야 합니다.");
    need(errs, t, "", "image", "이미지", function (v) { return v === null || isObj(v); }, "이미지가 없으면 null, 있으면 객체여야 합니다.");
    if (isObj(t.image)) {
      var im = t.image;
      need(errs, im, "image.", "name", "파일 이름", isStr, "문자열이어야 합니다.");
      need(errs, im, "image.", "width", "가로 화소", isPosInt, "1 이상의 정수여야 합니다.");
      need(errs, im, "image.", "height", "세로 화소", isPosInt, "1 이상의 정수여야 합니다.");
      need(errs, im, "image.", "mime", "형식", function (v) { return v === "image/png"; }, "\"image/png\"여야 합니다.");
      if (form === "file") need(errs, im, "image.", "data", "이미지 본체(Base64)", function (v) { return isStr(v) && v.length > 0; }, "비어 있지 않은 Base64 문자열이어야 합니다.");
      else need(errs, im, "image.", "blob", "이미지 본체", function (v) { return v instanceof Blob && v.size > 0; }, "비어 있지 않은 이미지 데이터여야 합니다.");
    }
    return errs;
  }

  // ---- 템플릿: IndexedDB ----------------------------------------------------------
  var dbPromise = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error("no-indexeddb"));
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = function () {
        var db = req.result;
        db.onversionchange = function () { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = function () { reject(req.error); };
      req.onblocked = function () { reject(new Error("blocked")); };
    });
    dbPromise.catch(function () { dbPromise = null; });
    return dbPromise;
  }

  // 트랜잭션 하나를 열고, 끝나면(commit) 결과를 돌려준다.
  function withStore(mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode);
        var result;
        fn(t.objectStore(STORE), function (v) { result = v; });
        t.oncomplete = function () { resolve(result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error("abort")); };
      });
    });
  }

  function dbGetAll() {
    return withStore("readonly", function (st, set) { var r = st.getAll(); r.onsuccess = function () { set(r.result); }; });
  }
  function dbGet(id) {
    return withStore("readonly", function (st, set) { var r = st.get(id); r.onsuccess = function () { set(r.result || null); }; });
  }
  function dbAdd(rec) {
    return withStore("readwrite", function (st) { st.add(rec); });
  }
  // 있을 때만 바꾼다(없으면 새로 만들지 않는다). 바꿨으면 true, 이미 없었으면 false.
  function dbReplace(rec) {
    return withStore("readwrite", function (st, set) {
      var g = st.getKey(rec.id);
      g.onsuccess = function () {
        if (g.result === undefined) return set(false);
        st.put(rec);
        set(true);
      };
    });
  }
  function dbCount() {
    return withStore("readonly", function (st, set) { var r = st.count(); r.onsuccess = function () { set(r.result); }; });
  }
  // 있었으면 true, 이미 없었으면 false.
  function dbDelete(id) {
    return withStore("readwrite", function (st, set) {
      var g = st.getKey(id);
      g.onsuccess = function () {
        if (g.result === undefined) return set(false);
        st.delete(id);
        set(true);
      };
    });
  }

  // ---- 템플릿: 화면 상태 <-> 저장 데이터 ---------------------------------------------
  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return Array.prototype.map.call(b, function (x) { return (x < 16 ? "0" : "") + x.toString(16); }).join("");
  }

  // 불러온 이미지를 원본 화소 그대로 새 캔버스에 다시 그려 PNG로 만든다. (EXIF 등 메타데이터는 남지 않는다.)
  function imageToRecord() {
    if (!state.image) return Promise.resolve(null);
    var img = state.image;
    var c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    return canvasToPngBlob(c).then(function (blob) {
      return { name: state.imageName, width: img.width, height: img.height, mime: "image/png", blob: blob };
    });
  }

  // 사용자가 저장할 수 있는 템플릿은 최대 3개다(기본 템플릿 3개는 세지 않는다). 예전에 더 많이 저장된 것은 지우지 않고 그대로 둔다.
  var USER_TEMPLATE_MAX = 3;
  function userCount(records) { return records.filter(function (r) { return !isDefaultTemplate(r.id); }).length; }
  var LIMIT_ALERT = "저장 가능한 템플릿은 최대 " + USER_TEMPLATE_MAX + "개입니다.";

  function cleanName(v) { return v.replace(/\s+/g, " ").trim().slice(0, NAME_MAX); }

  function autoName(records) {
    var used = {};
    records.forEach(function (r) { used[r.name] = true; });
    for (var n = 1; ; n++) if (!used["템플릿 " + n]) return "템플릿 " + n;
  }

  // 지금 편집 상태에서 저장 데이터를 만들고 검사한다. base가 있으면 id, createdAt을 그대로 쓴다.
  function buildRecord(base, name) {
    return imageToRecord().then(function (image) {
      var now = new Date().toISOString();
      var rec = {
        id: base ? base.id : newId(),
        version: TEMPLATE_VERSION,
        name: name,
        memo: tplMemoInput.value.trim().slice(0, MEMO_MAX),
        createdAt: base ? base.createdAt : now,
        updatedAt: now,
        ratio: state.ratio,
        text: state.text,
        size: state.size,
        color: state.color,
        x: state.x,
        y: state.y,
        image: image
      };
      var errs = validateTemplate(rec);
      if (errs.length) throw new Error(errs[0]);
      return rec;
    });
  }

  function syncControlsFromState() {
    textInput.value = state.text;
    sizeInput.value = String(state.size);
    colorInput.value = state.color;
    Array.prototype.forEach.call(ratioInputs, function (i) { i.checked = i.value === state.ratio; });
    renderReadouts();
    applyRatio();
    ensureFontThenDraw();
  }

  // 검사와 이미지 해독이 모두 성공한 뒤에만 현재 편집 상태를 바꾼다.
  function restoreTemplate(rec) {
    var errs = validateTemplate(rec);
    if (errs.length) return Promise.reject(new Error("저장된 데이터가 올바르지 않습니다: " + errs[0]));
    var decoding = rec.image ? decodeImage(rec.image.blob) : Promise.resolve(null);
    return decoding.then(function (img) {
      closeBitmap(state.image);
      state.image = img;
      state.imageName = rec.image ? rec.image.name : "";
      state.ratio = rec.ratio;
      // 문구(내용, 크기, 색, 위치)는 템플릿 것으로 바꾸지 않고 지금 것을 그대로 유지한다(사용자 요청). 저장된 문구 등은 템플릿 데이터에 그대로 남는다.
      state.blank = !img; // 이미지 없는 템플릿은 흰 카드로 시작한 것과 같다
      setUploadOpen(false);
      syncControlsFromState();
    }, function () {
      throw new Error("저장된 이미지를 열 수 없습니다.");
    });
  }

  // ---- 템플릿: 화면 ---------------------------------------------------------------
  var selectedId = null;
  var tplBusy = false;

  // 템플릿 창(저장 버튼 아래)에는 글씨를 띄우지 않고 알림 창으로만 알린다.
  // 브라우저 기본 alert/confirm 대신 화면 스타일에 맞춘 <dialog>를 쓴다. 여러 개가 겹치면 차례로 띄운다.
  var dlg = document.getElementById("app-dialog");
  var dlgQueue = Promise.resolve();
  var WARN_WORDS = /실패|못했|없습니다|없어|삭제할 수 없|최대|이미 삭제|손상/;

  function showDialog(text, confirmMode, warn) {
    var run = function () {
      return new Promise(function (resolve) {
        var icon = document.getElementById("dlg-icon");
        var cancelBtn = document.getElementById("dlg-cancel");
        document.getElementById("dlg-title").textContent = confirmMode ? "확인" : (warn ? "알림" : "완료");
        document.getElementById("dlg-text").textContent = text;
        icon.textContent = confirmMode ? "?" : (warn ? "!" : "\u2713");
        dlg.className = "dlg " + (confirmMode ? "dlg-ask" : (warn ? "dlg-warn" : "dlg-ok"));
        cancelBtn.hidden = !confirmMode;
        dlg.addEventListener("close", function onClose() {
          dlg.removeEventListener("close", onClose);
          resolve(dlg.returnValue === "ok");
        });
        if (typeof dlg.showModal === "function") {
          dlg.returnValue = "cancel";
          dlg.showModal();
        } else {
          resolve(confirmMode ? window.confirm(text) : (window.alert(text), true));
        }
      });
    };
    var p = dlgQueue.then(run);
    dlgQueue = p.catch(function () {});
    return p;
  }

  function notifyTpl(text) { return showDialog(text, false, WARN_WORDS.test(text)); }
  function confirmTpl(text) { return showDialog(text, true, false); }

  // 어두운 배경(::backdrop)을 눌러도 알림은 닫힌다. 확인 질문은 실수로 닫히지 않게 둔다.
  dlg.addEventListener("click", function (e) {
    if (e.target === dlg && document.getElementById("dlg-cancel").hidden) dlg.close("ok");
  });

  var timeFormat = null;
  function fmtTime(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    timeFormat = timeFormat || new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" });
    return timeFormat.format(d);
  }

  // 저장 데이터를 만든 순서(같으면 id 순서)로 정렬한다.
  function sortByCreated(records) {
    return records.sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1; });
  }

  function addSpan(parent, cls, text) {
    var el = document.createElement("span");
    el.className = cls;
    el.textContent = text;
    parent.appendChild(el);
  }

  function makeButton(label, action, cls, iconSrc) {
    var b = document.createElement("button");
    b.type = "button";
    b.dataset.action = action;
    if (cls) b.className = cls;
    if (iconSrc) {
      // 글씨 대신 그림 버튼. 스크린 리더는 label을 읽는다.
      b.classList.add("img-btn");
      b.setAttribute("aria-label", label);
      var img = document.createElement("img");
      img.src = iconSrc;
      img.alt = "";
      img.decoding = "async";
      b.appendChild(img);
    } else {
      b.textContent = label;
    }
    return b;
  }

  // 기본 템플릿(처음 열 때 넣어 주는 3개)은 삭제 버튼이 없고 삭제도 막는다. 사용자가 만든 템플릿은 삭제할 수 있다.
  function isDefaultTemplate(id) {
    return DEFAULT_TEMPLATES.some(function (d) { return d.id === id; });
  }

  // 목록에 보여 줄 작은 그림. 템플릿의 카드 모양(화면비대로 꽉 채워 중앙을 자른 모습)을 미리 그려 둔다. 글자는 그리지 않는다.
  // 같은 템플릿(같은 수정 시각, 화면비, 이미지)은 다시 만들지 않고, 없어지거나 바뀐 템플릿의 그림은 메모리에서 지운다.
  var thumbCache = {};        // id -> { key, url, promise }
  var thumbQueue = Promise.resolve();

  function thumbKey(r) { return r.updatedAt + "|" + r.ratio + "|" + (r.image ? r.image.blob.size : 0); }

  function makeThumb(rec) {
    var ratio = RATIOS[rec.ratio];
    var h = 176, w = Math.round(h * ratio.w / ratio.h);
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    var cx = c.getContext("2d");
    cx.imageSmoothingQuality = "high";
    function done(img) {
      drawBackground(cx, w, h, img);   // 이미지가 없으면 카드 기본 배경(흰색)
      closeBitmap(img);
      return canvasToPngBlob(c).then(function (blob) { return URL.createObjectURL(blob); });
    }
    return rec.image ? decodeImage(rec.image.blob).then(done) : done(null);
  }

  // 목록 그림의 주소를 돌려준다. 만드는 일은 하나씩 차례로 해서 화면이 멈추지 않게 한다.
  function thumbFor(rec) {
    var key = thumbKey(rec), hit = thumbCache[rec.id];
    if (hit && hit.key === key) return hit;
    if (hit && hit.url) URL.revokeObjectURL(hit.url);
    var entry = { key: key, url: null, promise: null };
    entry.promise = new Promise(function (resolve) {
      thumbQueue = thumbQueue.then(function () {
        return makeThumb(rec).then(function (url) { entry.url = url; resolve(url); }, function () { resolve(null); });
      });
    });
    thumbCache[rec.id] = entry;
    return entry;
  }

  function dropStaleThumbs(records) {
    var alive = {};
    records.forEach(function (r) { alive[r.id] = true; });
    Object.keys(thumbCache).forEach(function (id) {
      if (alive[id]) return;
      if (thumbCache[id].url) URL.revokeObjectURL(thumbCache[id].url);
      delete thumbCache[id];
    });
  }

  // 저장소에 있는 내용을 그대로 읽어 목록을 다시 그린다. 화면 상태를 원본으로 삼지 않는다.
  function renderList(records) {
    sortByCreated(records);
    var sel = records.filter(function (r) { return r.id === selectedId; })[0];
    selectedId = sel ? sel.id : null;
    tplListEl.textContent = "";
    tplDefaultsEl.textContent = "";
    records.forEach(function (r) {
      var li = document.createElement("li");
      li.dataset.id = r.id; // 수정과 삭제는 이 ID로만 대상을 찾는다.
      if (r.id === selectedId) li.className = "selected";
      var isDefault = isDefaultTemplate(r.id);
      // 기본 템플릿은 그림만 보여 주고, 그림을 누르면 불러온다(이름, 설명, 화면비, 불러오기 버튼은 두지 않는다).
      var thumb = document.createElement(isDefault ? "button" : "div");
      thumb.className = "tpl-thumb";
      if (isDefault) {
        thumb.type = "button";
        thumb.dataset.action = "load";
        thumb.setAttribute("aria-label", String(r.name) + " 불러오기"); // 눈에는 안 보이고 스크린 리더만 읽는다
      }
      var ratio = RATIOS[r.ratio];
      if (ratio) thumb.style.aspectRatio = ratio.w + " / " + ratio.h; // 카드와 같은 모양
      var img = document.createElement("img");
      img.alt = "";
      thumb.appendChild(img);
      li.appendChild(thumb);
      if (ratio) {
        var t = thumbFor(r);
        if (t.url) img.src = t.url;
        else t.promise.then(function (url) { if (url) img.src = url; });
      }
      if (isDefault) { tplDefaultsEl.appendChild(li); return; }
      var body = document.createElement("div");
      body.className = "tpl-body";
      addSpan(body, "tpl-name", String(r.name));
      if (r.memo) addSpan(body, "tpl-memo", String(r.memo));
      var actions = document.createElement("div");
      actions.className = "tpl-actions";
      actions.appendChild(makeButton("불러오기", "load", "", "assets/button/button-load-crop.png"));
      actions.appendChild(makeButton("삭제", "delete", "danger", "assets/button/button-delete-crop.png"));
      body.appendChild(actions);
      li.appendChild(body);
      tplListEl.appendChild(li);
    });
    dropStaleThumbs(records);
    tplEmptyEl.hidden = !!tplListEl.firstChild; // 기본 템플릿은 창 왼쪽에 따로 있으므로, 이 목록은 직접 만든 것만 센다
    tplSaveUpdateBtn.disabled = !sel;
  }

  function refreshList() {
    return dbGetAll().then(renderList);
  }

  function errReason(err) {
    return err && err.message && !/^(no-indexeddb|blocked|abort|toBlob)$/.test(err.message) ? err.message : "";
  }

  // 한 번에 하나의 저장 작업만 한다(연타로 중복 저장되는 것을 막는다).
  function runTpl(job) {
    if (tplBusy) return Promise.resolve();
    tplBusy = true;
    return job().then(function () { tplBusy = false; }, function (e) { tplBusy = false; throw e; });
  }

  function saveNewTemplate() {
    var addedName = "";
    return runTpl(function () {
      // 이름을 비워 두었을 때만 자동 이름을 정하려고 저장된 이름을 읽는다.
      var typed = cleanName(tplNameInput.value);
      return dbGetAll().then(function (all) {
        if (userCount(all) >= USER_TEMPLATE_MAX) { var e = new Error("limit"); e.limit = true; throw e; } // 알림창으로만 알리고 템플릿 창에는 문구를 남기지 않는다
        return typed || autoName(all);
      }).then(function (name) {
        return buildRecord(null, name).then(function (rec) {
          return dbAdd(rec).then(function () {
            selectedId = rec.id;
            tplNameInput.value = rec.name;
            addedName = rec.name;
          });
        });
      }).then(refreshList).then(function () {
        notifyTpl("\"" + addedName + "\" 템플릿이 추가되었습니다."); // 목록이 새로 그려진 뒤에 알린다
      });
    }).catch(function (e) {
      if (e && e.limit) { notifyTpl(LIMIT_ALERT); return; }
      notifyTpl(errReason(e) || "템플릿 저장에 실패했습니다.");
    });
  }

  function selectedGone() {
    selectedId = null;
    notifyTpl("선택한 템플릿이 이미 삭제되어 저장하지 않았습니다.");
  }

  function updateSelectedTemplate() {
    var id = selectedId;
    if (!id) return Promise.resolve();
    return runTpl(function () {
      return dbGet(id).then(function (existing) {
        if (!existing) {
          selectedGone();
          return refreshList();
        }
        var name = cleanName(tplNameInput.value) || existing.name;
        return buildRecord(existing, name).then(function (rec) {
          // 저장 시점에 대상이 여전히 있는지 다시 확인한다. 없으면 새로 만들지 않는다.
          return dbReplace(rec).then(function (saved) {
            if (!saved) selectedGone();
            return refreshList();
          });
        });
      });
    }).catch(function (e) { notifyTpl("템플릿 수정에 실패했습니다."); });
  }

  function loadTemplate(id) {
    return runTpl(function () {
      return dbGet(id).then(function (rec) {
        if (!rec) {
          notifyTpl("템플릿이 이미 삭제되었습니다.");
          return refreshList();
        }
        // 직접 저장한 템플릿만 묻는다. 기본 템플릿(왼쪽 그림)은 바로 불러온다.
        var ask = isDefaultTemplate(id) ? Promise.resolve(true) : confirmTpl("\"" + rec.name + "\" 템플릿을 불러오시겠습니까?");
        return ask.then(function (ok) {
          if (!ok) return;
          return restoreTemplate(rec).then(function () {
            selectedId = rec.id;
            tplNameInput.value = rec.name;
            tplMemoInput.value = rec.memo;
            return refreshList();
          });
        });
      });
    }).catch(function (e) { notifyTpl("템플릿을 불러오지 못했습니다. 지금 편집 내용은 그대로입니다." + (errReason(e) ? " " + errReason(e) : "")); });
  }

  function deleteTemplate(id) {
    if (isDefaultTemplate(id)) {
      notifyTpl("기본 템플릿은 삭제할 수 없습니다.");
      return Promise.resolve();
    }
    return runTpl(function () {
      return dbGet(id).then(function (rec) {
        if (!rec) return refreshList();
        return confirmTpl("\"" + rec.name + "\" 템플릿을 삭제할까요?").then(function (ok) {
          if (!ok) return;
          return dbDelete(id).then(function () {
            if (selectedId === id) selectedId = null;
            return refreshList();
          });
        });
      });
    }).catch(function (e) { notifyTpl("템플릿 삭제에 실패했습니다."); });
  }

  tplSaveNewBtn.addEventListener("click", saveNewTemplate);
  tplSaveUpdateBtn.addEventListener("click", updateSelectedTemplate);
  function onTemplateListClick(e) {
    var btn = e.target.closest && e.target.closest("button[data-action]");
    var li = btn && btn.closest("li[data-id]");
    if (!li) return;
    if (btn.dataset.action === "load") loadTemplate(li.dataset.id);
    else if (btn.dataset.action === "delete") deleteTemplate(li.dataset.id);
  }
  tplListEl.addEventListener("click", onTemplateListClick);
  tplDefaultsEl.addEventListener("click", onTemplateListClick);

  // ---- 템플릿: JSON 내보내기와 가져오기 ---------------------------------------------------
  // 파일 모양: { format, version, exportedAt, templates: [ 템플릿... ] }. 템플릿 항목은 docs/template-schema.md와 같고,
  // 이미지 본체(Blob)만 Base64 문자열(image.data)로 바뀐다.
  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { var t = String(r.result); resolve(t.slice(t.indexOf(",") + 1)); };
      r.onerror = function () { reject(r.error); };
      r.readAsDataURL(blob);
    });
  }

  function base64ToBlob(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: "image/png" });
  }

  // 저장된 모습(이미지 본체는 Blob)을 파일 안의 모습(Base64 문자열)으로 바꾼다.
  function toFileForm(r) {
    var copy = Object.assign({}, r);
    if (!r.image) return copy;
    var img = r.image;
    return blobToBase64(img.blob).then(function (data) {
      copy.image = { name: img.name, width: img.width, height: img.height, mime: img.mime, data: data };
      return copy;
    });
  }

  function exportTemplates() {
    return runTpl(function () {
      return dbGetAll().then(function (records) {
        var mine = records.filter(function (r) { return !isDefaultTemplate(r.id); });
        var good = sortByCreated(mine).filter(function (r) { return validateTemplate(r).length === 0; });
        var skipped = mine.length - good.length;
        if (!good.length) {
          if (skipped) {
            notifyTpl("저장된 " + skipped + "건이 손상되어 내보내기에 실패했습니다.");
          } else {
            notifyTpl("내보내기 할 템플릿이 없습니다.");
          }
          return;
        }
        return Promise.all(good.map(toFileForm)).then(function (out) {
          var payload = { format: FILE_FORMAT, version: FILE_VERSION, exportedAt: new Date().toISOString(), templates: out };
          var name = "meme-card-templates-" + timestamp() + ".json";
          downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), name);
          notifyTpl(skipped ? "손상된 " + skipped + "건을 제외한 템플릿 " + out.length + "건을 " + name + "으로 내보냈습니다." : name + "으로 템플릿 " + out.length + "건을 내보냈습니다.");
        });
      });
    }).catch(function (e) { notifyTpl("템플릿 내보내기에 실패했습니다."); });
  }

  // 글자 위치(줄, 칸)를 알려 주기 위해 오류 메시지에서 위치를 뽑는다. 브라우저마다 메시지 모양이 다르다.
  function syntaxWhere(text, err) {
    var m = String(err && err.message).match(/line (\d+) column (\d+)/i);
    if (m) return m[1] + "번째 줄 " + m[2] + "번째 글자 근처";
    m = String(err && err.message).match(/position (\d+)/i);
    if (m) {
      var pos = Number(m[1]);
      var before = text.slice(0, pos);
      var line = before.split("\n").length;
      var col = pos - before.lastIndexOf("\n");
      return line + "번째 줄 " + col + "번째 글자 근처";
    }
    return "";
  }

  function readText(file) {
    if (file.text) return file.text();
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result)); };
      r.onerror = function () { reject(r.error); };
      r.readAsText(file);
    });
  }

  // 이미지 본체가 실제 PNG이고 적어 둔 크기와 같은지 확인한다. 문제 문장 또는 null(문제 없음)과 Blob을 돌려준다.
  function checkImageData(im) {
    var blob;
    try { blob = base64ToBlob(im.data); } catch (e) { return Promise.resolve({ problem: "image.data가 올바른 Base64 문자열이 아닙니다." }); }
    return sniffBlob(blob).then(function (kind) {
      if (kind.type !== "PNG") return { problem: "image.data가 PNG 이미지가 아닙니다." };
      return decodeImage(blob).then(function (img) {
        var w = img.width, h = img.height;
        closeBitmap(img);
        if (w * h > MAX_PIXELS) return { problem: "이미지가 너무 큽니다(" + w + "×" + h + ")." };
        if (w !== im.width || h !== im.height) return { problem: "image의 width/height(" + im.width + "×" + im.height + ")가 실제 이미지 크기(" + w + "×" + h + ")와 다릅니다." };
        return { blob: blob };
      }, function () { return { problem: "image.data를 이미지로 열 수 없습니다(손상되었습니다)." }; });
    });
  }

  // 1단계 읽기, 2단계 문법(파싱), 3단계 파일 구조, 4단계 모든 항목 검사. 여기까지는 저장소를 건드리지 않는다.
  // 성공: { ok: true, records }. 실패: { ok: false, kind, headline, problems }
  function prepareImport(file) {
    function fail(kind, headline, problems) { return { ok: false, kind: kind, headline: headline, problems: problems || [] }; }
    if (file.size === 0) return Promise.resolve(fail("file", "빈 파일이라 가져오지 않았습니다."));
    if (file.size > MAX_JSON_BYTES) return Promise.resolve(fail("file", "파일이 너무 커서 가져오지 않았습니다. " + Math.round(MAX_JSON_BYTES / 1024 / 1024) + "MB 이하의 파일을 사용해 주세요."));
    return readText(file).then(function (text) {
      var data;
      try {
        data = JSON.parse(text.replace(/^﻿/, ""));
      } catch (e) {
        var where = syntaxWhere(text, e);
        return fail("syntax", "JSON 문법이 올바르지 않아 가져오지 않았습니다.", [(where ? where + " " : "") + "(브라우저 원문: " + String(e.message) + ")"]);
      }
      var top = [];
      if (!isObj(data)) return fail("structure", "템플릿 파일 구조가 올바르지 않아 가져오지 않았습니다.", ["파일의 맨 바깥이 객체({ })가 아닙니다."]);
      if (data.format === undefined) top.push("필수 항목이 없습니다: format. 이 프로그램에서 내보낸 파일이 아닌 것 같습니다.");
      else if (data.format !== FILE_FORMAT) top.push("format 값이 올바르지 않습니다. \"" + FILE_FORMAT + "\"이어야 합니다. (받은 값: " + shown(data.format) + ")");
      if (data.version === undefined) top.push("필수 항목이 없습니다: version");
      else if (data.version !== FILE_VERSION) top.push("version 값이 올바르지 않습니다. " + FILE_VERSION + "이어야 합니다. (받은 값: " + shown(data.version) + ")");
      if (data.templates === undefined) top.push("필수 항목이 없습니다: templates(템플릿 목록)");
      else if (!Array.isArray(data.templates)) top.push("templates 값이 올바르지 않습니다. 목록([ ])이어야 합니다.");
      else if (data.templates.length === 0) top.push("templates가 비어 있어 가져올 템플릿이 없습니다.");
      if (top.length) return fail("structure", "템플릿 파일 구조가 올바르지 않아 가져오지 않았습니다.", top);

      // 모든 항목을 끝까지 검사해서 문제를 전부 모은다(첫 문제에서 멈추지 않는다).
      var problems = [];
      var missing = false; // 필수 항목이 빠진 항목이 있는지
      var seen = {};
      var records = [];
      var chain = Promise.resolve();
      data.templates.forEach(function (t, i) {
        chain = chain.then(function () {
          var label = (i + 1) + "번째 항목" + (isObj(t) && typeof t.name === "string" && t.name ? "(\"" + t.name.slice(0, 20) + "\")" : "");
          var errs = validateTemplate(t, "file");
          if (errs.missing) missing = true;
          if (isObj(t) && typeof t.id === "string" && t.id) {
            if (seen[t.id] !== undefined) errs.push("id가 " + seen[t.id] + "번째 항목과 같습니다. 파일 안에서 id는 겹치면 안 됩니다.");
            else seen[t.id] = i + 1;
          }
          var pre = errs.length ? Promise.resolve(null) : (t.image ? checkImageData(t.image) : Promise.resolve({}));
          return pre.then(function (res) {
            if (res && res.problem) errs.push(res.problem);
            if (errs.length) { errs.forEach(function (m) { problems.push(label + ": " + m); }); return; }
            records.push({
              id: t.id, version: t.version, name: t.name, memo: t.memo, createdAt: t.createdAt, updatedAt: t.updatedAt,
              ratio: t.ratio, text: t.text, size: t.size, color: t.color, x: t.x, y: t.y,
              image: t.image ? { name: t.image.name, width: t.image.width, height: t.image.height, mime: t.image.mime, blob: res.blob } : null
            });
          });
        });
      });
      return chain.then(function () {
        if (problems.length) {
          return fail("items", (missing ? "필수 항목이 빠졌거나 값이 잘못된 템플릿이 있어" : "값이 잘못된 템플릿이 있어") + " 아무것도 가져오지 않았습니다.", problems);
        }
        return { ok: true, records: records };
      });
    }, function () {
      return fail("file", "파일을 읽을 수 없어 가져오지 않았습니다.");
    });
  }

  // 한 트랜잭션에서 모두 추가한다. 하나라도 실패하면 전체가 취소된다. 이미 있는 id와 겹치면 그 항목만 새 id를 받는다.
  function dbAddMany(records) {
    return withStore("readwrite", function (st, set) {
      var k = st.getAllKeys();
      k.onsuccess = function () {
        var used = {};
        k.result.forEach(function (id) { used[id] = true; });
        var renamed = 0;
        records.forEach(function (r) {
          var rec = Object.assign({}, r);
          if (used[rec.id]) { rec.id = newId(); renamed++; }
          used[rec.id] = true;
          st.add(rec);
        });
        set({ added: records.length, renamed: renamed });
      };
    });
  }

  function importFile(file) {
    if (!file) return Promise.resolve();
    return runTpl(function () {
      return dbCount().then(function (n0) {
        return prepareImport(file).then(function (res) {
          if (res.ok) {
            // 가져온 것은 모두 사용자 템플릿으로 센다(기본 템플릿과 id가 같으면 새 id로 추가된다). 넘으면 아무것도 저장하지 않는다.
            var over = dbGetAll().then(function (all) {
              var have = userCount(all);
              if (have + res.records.length <= USER_TEMPLATE_MAX) return null;
              return { ok: false, kind: "limit", headline: "저장한 템플릿은 최대 " + USER_TEMPLATE_MAX + "개라서 아무것도 가져오지 않았습니다(지금 " + have + "개, 파일 " + res.records.length + "개).", problems: [] };
            });
            return over.then(function (o) { return o ? o : res; }).then(function (r2) { res = r2; return go(); });
          }
          return go();
          function go() {
          return (res.ok ? dbAddMany(res.records) : Promise.resolve(null)).then(function (done) {
            // 성공이든 실패든 저장소를 다시 읽어 목록을 새로 그린다.
            return dbGetAll().then(function (after) {
              var text;
              if (!done) {
                text = res.kind === "limit" ? LIMIT_ALERT : "JSON 가져오기에 실패했습니다.";
              } else {
                text = "\"" + file.name + "\"에서 템플릿 " + done.added + "건을 가져왔습니다." +
                  (done.renamed ? " 그중 " + done.renamed + "건은 id가 이미 있어 새 id로 추가했습니다." : "");
              }
              renderList(after);
              notifyTpl(text); // 목록이 새로 그려진 뒤에 알린다
            });
          });
          }
        });
      });
    }).catch(function (e) { notifyTpl("템플릿 가져오기에 실패했습니다."); });
  }

  tplExportBtn.addEventListener("click", exportTemplates);
  tplImportInput.addEventListener("change", function () { importFile(takeFile(tplImportInput)); });

  // ---- 기본 템플릿 ----------------------------------------------------------------
  // assets/templates의 이미지로 만든 기본 템플릿 3개는 삭제할 수 없고, 열 때마다 저장소에 없는 것만 다시 채운다(수정한 것은 그대로 둔다).
  // 세 이미지는 넓은 배경 가운데에 캐릭터가 있어서, 어느 화면비(1:1, 4:5, 9:16)로 바꿔도 캐릭터가 잘리지 않는다.
  var DEFAULT_TEMPLATES = [
    { id: "default-template-1", name: "기본 템플릿 1", file: "assets/templates/template-image1.png", ratio: "1:1", memo: "누워 있는 공룡과 주황 캐릭터" },
    { id: "default-template-2", name: "기본 템플릿 2", file: "assets/templates/template-image2.png", ratio: "4:5", memo: "주황 캐릭터를 안은 공룡" },
    { id: "default-template-3", name: "기본 템플릿 3", file: "assets/templates/template-image3.png", ratio: "9:16", memo: "꽃을 머리에 인 공룡" }
  ];

  function loadDefaultTemplate(d, order) {
    return fetch(d.file).then(function (res) {
      if (!res.ok) throw new Error("fetch");
      return res.blob();
    }).then(function (blob) {
      return sniffBlob(blob).then(function (kind) {
        if (kind.type !== "PNG") throw new Error("not-png");
        return decodeImage(blob);
      }).then(function (img) {
        var w = img.width, h = img.height;
        closeBitmap(img);
        var t = new Date(order.base + order.index).toISOString(); // 만든 순서대로 목록 맨 위에 온다
        return {
          id: d.id, version: TEMPLATE_VERSION, name: d.name, memo: d.memo, createdAt: t, updatedAt: t,
          ratio: d.ratio, text: DEFAULT_TEXT, size: DEFAULT_SIZE, color: "#222222", x: DEFAULT_X, y: DEFAULT_Y,
          image: { name: d.file.split("/").pop(), width: w, height: h, mime: "image/png", blob: blob }
        };
      });
    });
  }

  // 이미 있는 id는 건너뛰고 없는 것만 한 트랜잭션으로 추가한다(탭 여러 개를 동시에 열어도 기본 템플릿이 중복되지 않는다).
  function dbAddMissing(records) {
    return withStore("readwrite", function (st) {
      var k = st.getAllKeys();
      k.onsuccess = function () {
        var used = {};
        k.result.forEach(function (id) { used[id] = true; });
        records.forEach(function (r) { if (!used[r.id]) st.add(r); });
      };
    });
  }

  function dbKeys() {
    return withStore("readonly", function (st, set) { var r = st.getAllKeys(); r.onsuccess = function () { set(r.result); }; });
  }

  // 기본 템플릿의 문구, 크기, 위치가 지금 기본값과 다르면 맞춘다. 사용자가 수정 저장한 것(고친 시각이 만든 시각과 다른 것)은 건드리지 않는다.
  // 고친 시각은 그대로 둬서, 앞으로 기본값이 바뀌어도 계속 따라간다.
  function syncDefaultTemplates() {
    var ids = DEFAULT_TEMPLATES.map(function (d) { return d.id; });
    return withStore("readwrite", function (st) {
      ids.forEach(function (id) {
        var g = st.get(id);
        g.onsuccess = function () {
          var r = g.result;
          if (!r || r.updatedAt !== r.createdAt) return;
          var d = DEFAULT_TEMPLATES.filter(function (x) { return x.id === id; })[0];
          if (r.text === DEFAULT_TEXT && r.size === DEFAULT_SIZE && r.x === DEFAULT_X && r.y === DEFAULT_Y && r.memo === d.memo) return;
          r.text = DEFAULT_TEXT; r.size = DEFAULT_SIZE; r.x = DEFAULT_X; r.y = DEFAULT_Y; r.memo = d.memo;
          st.put(r);
        };
      });
    });
  }

  function ensureDefaultTemplates() {
    return dbKeys().then(function (keys) {
      var have = {};
      keys.forEach(function (id) { have[id] = true; });
      var base = Date.now();
      var todo = DEFAULT_TEMPLATES.map(function (d, i) { return { d: d, index: i }; }).filter(function (x) { return !have[x.d.id]; });
      if (!todo.length) return null; // 모두 있으면 이미지를 받지 않는다
      return Promise.all(todo.map(function (x) { return loadDefaultTemplate(x.d, { base: base, index: x.index }); })).then(function (recs) {
        recs.forEach(function (r) { var errs = validateTemplate(r); if (errs.length) throw new Error(errs[0]); });
        return dbAddMissing(recs);
      });
    });
  }

  function startTemplates() {
    // 기본 템플릿을 채우지 못해도(파일을 못 받는 등) 나머지 기능은 그대로 쓴다. 다음에 열 때 다시 시도한다.
    ensureDefaultTemplates().then(null, function () {}).then(syncDefaultTemplates).then(null, function () {}).then(refreshList).catch(function () {
      // 저장소를 쓸 수 없는 환경(예: 일부 사생활 보호 모드)에서도 편집과 내려받기는 그대로 쓸 수 있다.
      tplStorageBroken = true;
      tplSaveNewBtn.disabled = true;
      tplExportBtn.disabled = true;
      tplImportInput.disabled = true;
      tplEmptyEl.hidden = true;
      notifyTpl("해당 브라우저에서는 템플릿을 저장할 수 없습니다.");
    });
  }

  // ---- 시작 ----------------------------------------------------------------
  setUploadOpen(true);
  startTemplates();
  renderReadouts();
  applyRatio();
  ensureFontThenDraw();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
})();
