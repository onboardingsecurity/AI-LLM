(function () {
  "use strict";

  // ---------------------------------------------------------------
  // 단계별 제한시간 (요구사항 3단계 표 그대로 순서대로 사용, 단계 수는 감지된 이미지 세트 수만큼)
  // ---------------------------------------------------------------
  var STAGE_TIME_LIMITS = [180, 150, 120, 90, 60];
  var WRONG_CLICK_PENALTY_SECONDS = 10;
  var VARIANTS_PER_SET = 3;
  var imageCache = {};

  // ---------------------------------------------------------------
  // DOM 참조
  // ---------------------------------------------------------------
  var el = {
    home: document.getElementById("home-screen"),
    rules: document.getElementById("rules-screen"),
    game: document.getElementById("game-screen"),
    ranking: document.getElementById("ranking-screen"),

    nameInput: document.getElementById("player-name"),
    btnStart: document.getElementById("btn-start"),
    btnStartConfirmed: document.getElementById("btn-start-confirmed"),
    imageLoadingNote: document.getElementById("image-loading-note"),
    btnGotoRanking: document.getElementById("btn-goto-ranking"),
    muteToggles: Array.prototype.slice.call(document.querySelectorAll('[data-toggle="mute"]')),
    reducedMotionToggles: Array.prototype.slice.call(document.querySelectorAll('[data-toggle="reduced-motion"]')),

    statusStage: document.getElementById("status-stage"),
    statusFound: document.getElementById("status-found"),
    timeBarFill: document.getElementById("time-bar-fill"),
    btnPause: document.getElementById("btn-pause"),
    btnRestart: document.getElementById("btn-restart"),

    boards: document.getElementById("boards"),
    boardLeft: document.getElementById("board-left"),
    boardRight: document.getElementById("board-right"),

    pauseOverlay: document.getElementById("pause-overlay"),
    btnResume: document.getElementById("btn-resume"),

    clearOverlay: document.getElementById("stage-clear-overlay"),
    clearMessage: document.getElementById("stage-clear-message"),
    btnNextStage: document.getElementById("btn-next-stage"),

    failOverlay: document.getElementById("fail-overlay"),
    btnRestartAfterFail: document.getElementById("btn-restart-after-fail"),

    rankingBody: document.getElementById("ranking-body"),
    rankingEmpty: document.getElementById("ranking-empty"),
    btnRankingHome: document.getElementById("btn-ranking-home"),
  };

  // ---------------------------------------------------------------
  // 현재 판 상태 (요구사항 4단계: 저장하지 않음, 메모리에만 존재)
  // ---------------------------------------------------------------
  var state = {
    name: "",
    stage: 1,
    remaining: 0,
    foundCells: [],
    boardData: null, // { basePath, variantPath, baseImg, variantImg, width, height, hotspots: [{x,y,radius}] }
    isPaused: false,
    tickTimer: null,
    startTimestamp: 0,
    pausedAt: 0,
    pausedTotal: 0,
    penaltySeconds: 0, // 오답 클릭 1회당 10초씩 누적
    cumulativeElapsed: 0,
    usedImageSets: [], // 이번 게임에서 이미 사용한 이미지 세트 id (단계 순서대로)
    imageSets: [], // 페이지 로드 시 자동 탐지된 이미지 세트 목록
    imageSetsReady: false,
    mute: false,
    reducedMotion: false,
    wrongMarkTimer: null,
    audioCtx: null,
    currentOscillator: null,
  };

  // ---------------------------------------------------------------
  // 화면 전환
  // ---------------------------------------------------------------
  function showScreen(name) {
    el.home.hidden = name !== "home";
    el.rules.hidden = name !== "rules";
    el.game.hidden = name !== "game";
    el.ranking.hidden = name !== "ranking";
  }

  // ---------------------------------------------------------------
  // 이미지 세트 자동 탐지 (assets/image숫자/image숫자.png + image숫자-{1,2,3}.png)
  // 폴더 이름/개수를 하드코딩하지 않고 존재 여부를 프로브하여 목록을 만든다.
  // ---------------------------------------------------------------
  function probeImage(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function () {
        resolve(null);
      };
      img.src = src;
    });
  }

  // diffs.js는 <script src>로 로드한다 (fetch/XHR는 file://에서 로컬 파일 접근이
  // 차단되어 인코그니토 창에서 서버 없이 바로 열 때 실패하므로 사용하지 않는다).
  function loadScript(src) {
    return new Promise(function (resolve) {
      var script = document.createElement("script");
      script.onload = function () {
        resolve(true);
      };
      script.onerror = function () {
        resolve(false);
      };
      script.src = src;
      document.head.appendChild(script);
    });
  }

  // 세트별 diffs 데이터 스키마 검증: { "파일명": [{x,y,radius}, ...], ... } 형태이고
  // x/y/radius가 모두 0~1 사이 숫자인지 확인한다. 어긋나면 그 세트는 쓰지 않는다.
  function isValidDiffsForSet(diffs, variantPaths) {
    if (!diffs || typeof diffs !== "object") return false;
    return variantPaths.every(function (variantPath) {
      var key = variantPath.split("/").pop();
      var hotspots = diffs[key];
      if (!Array.isArray(hotspots) || hotspots.length === 0) return false;
      return hotspots.every(function (hs) {
        return (
          hs &&
          typeof hs.x === "number" &&
          typeof hs.y === "number" &&
          typeof hs.radius === "number" &&
          hs.x >= 0 &&
          hs.x <= 1 &&
          hs.y >= 0 &&
          hs.y <= 1 &&
          hs.radius > 0
        );
      });
    });
  }

  // image1, image2, ... 순서로 폴더가 이어져 있다고 가정하고 하나씩 확인하다가
  // 처음으로 없는 번호를 만나면 멈춘다 (없는 폴더 번호를 병렬로 미리 다 찔러보며
  // 콘솔에 불필요한 404를 쌓지 않기 위함).
  function detectImageSets() {
    var results = [];
    var n = 1;
    function probeNext() {
      var current = n;
      var setId = "image" + current;
      var basePath = "assets/" + setId + "/" + setId + ".png";
      return probeImage(basePath).then(function (baseImg) {
        if (!baseImg) return results; // 이 번호부터는 없다고 간주하고 탐지 종료
        var variantPromises = [];
        for (var k = 1; k <= VARIANTS_PER_SET; k++) {
          variantPromises.push(probeImage("assets/" + setId + "/" + setId + "-" + k + ".png"));
        }
        return Promise.all(variantPromises).then(function (variants) {
          var variantPaths = [];
          variants.forEach(function (v, idx) {
            if (v) variantPaths.push("assets/" + setId + "/" + setId + "-" + (idx + 1) + ".png");
          });
          if (variantPaths.length === 0) {
            n++;
            return probeNext();
          }
          return loadScript("assets/" + setId + "/diffs.js").then(function () {
            var diffs = window.IMAGE_DIFFS && window.IMAGE_DIFFS[setId];
            if (isValidDiffsForSet(diffs, variantPaths)) {
              imageCache[basePath] = baseImg;
              results.push({ id: setId, basePath: basePath, variantPaths: variantPaths, diffs: diffs });
            }
            // diffs.js가 없거나 좌표가 불완전하면 이 세트는 목록에서 제외하고 다음 번호로 넘어간다.
            n++;
            return probeNext();
          });
        });
      });
    }
    return probeNext();
  }

  // ---------------------------------------------------------------
  // 이미지 기반 보드 (기준 이미지 vs 오답 이미지, 실제 사진 페어 비교)
  // ---------------------------------------------------------------
  function loadImage(src, cb) {
    var cached = imageCache[src];
    if (cached && cached.complete && cached.naturalWidth > 0) {
      cb(cached);
      return;
    }
    var img = cached || new Image();
    imageCache[src] = img;
    img.onload = function () {
      cb(img);
    };
    img.src = src;
  }

  function pickImageSet(usedSetIds, imageSets) {
    var last = usedSetIds[usedSetIds.length - 1];
    var candidates = imageSets.filter(function (s) {
      return s.id !== last;
    });
    if (candidates.length === 0) candidates = imageSets.slice(); // 세트가 1개뿐이면 규칙 완화
    var unused = candidates.filter(function (s) {
      return usedSetIds.indexOf(s.id) === -1;
    });
    var pool = unused.length > 0 ? unused : candidates;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // 다른점 좌표는 이미지 세트별 diffs.js에 하드코딩되어 있다 (사람이 육안으로
  // 확인한 위치를 기준으로 픽셀 비교해 계산한 값). 여기서는 그 값을 그대로 쓴다.
  function buildBoard(baseImg, variantImg, basePath, variantPath, hotspots) {
    return {
      basePath: basePath,
      variantPath: variantPath,
      baseImg: baseImg,
      variantImg: variantImg,
      width: Math.min(baseImg.naturalWidth, variantImg.naturalWidth),
      height: Math.min(baseImg.naturalHeight, variantImg.naturalHeight),
      hotspots: hotspots,
    };
  }

  function drawFoundRing(canvas, hotspot) {
    var ctx = canvas.getContext("2d");
    var cx = hotspot.x * canvas.width;
    var cy = hotspot.y * canvas.height;
    var rad = hotspot.radius * canvas.width;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(2, rad * 0.15);
    ctx.strokeStyle = "#1fa34a";
    ctx.stroke();
  }

  function renderBoards() {
    el.boardLeft.innerHTML = "";
    el.boardRight.innerHTML = "";

    var leftCanvas = document.createElement("canvas");
    var rightCanvas = document.createElement("canvas");
    leftCanvas.className = "board-canvas";
    rightCanvas.className = "board-canvas";
    leftCanvas.width = rightCanvas.width = state.boardData.width;
    leftCanvas.height = rightCanvas.height = state.boardData.height;
    el.boardLeft.appendChild(leftCanvas);
    el.boardRight.appendChild(rightCanvas);
    redrawBoards();
  }

  function getBoardCanvases() {
    return [el.boardLeft.querySelector("canvas"), el.boardRight.querySelector("canvas")];
  }

  function redrawBoards() {
    var data = state.boardData;
    var canvases = getBoardCanvases();
    var leftCanvas = canvases[0];
    var rightCanvas = canvases[1];
    if (!leftCanvas || !rightCanvas) return;
    var leftCtx = leftCanvas.getContext("2d");
    var rightCtx = rightCanvas.getContext("2d");
    leftCtx.clearRect(0, 0, leftCanvas.width, leftCanvas.height);
    rightCtx.clearRect(0, 0, rightCanvas.width, rightCanvas.height);
    leftCtx.drawImage(data.baseImg, 0, 0, leftCanvas.width, leftCanvas.height);
    rightCtx.drawImage(data.variantImg, 0, 0, rightCanvas.width, rightCanvas.height);

    data.hotspots.forEach(function (hotspot, idx) {
      var isFound = state.foundCells.indexOf(idx) !== -1;
      if (isFound) {
        drawFoundRing(rightCanvas, hotspot);
        drawFoundRing(leftCanvas, hotspot);
      }
    });
  }

  // ---------------------------------------------------------------
  // 타이머
  // ---------------------------------------------------------------
  function getTotalStages() {
    return state.imageSets.length || 1;
  }

  function stopTicking() {
    if (state.tickTimer !== null) {
      clearInterval(state.tickTimer);
      state.tickTimer = null;
    }
  }

  function stageTimeLimit(stageNumber) {
    var idx = Math.min(stageNumber - 1, STAGE_TIME_LIMITS.length - 1);
    return STAGE_TIME_LIMITS[idx];
  }

  function elapsedSeconds(timeLimit) {
    var raw = (Date.now() - state.startTimestamp - state.pausedTotal) / 1000;
    var used = raw + state.penaltySeconds; // 오답 차감분 포함
    return Math.min(timeLimit, Math.max(0, used));
  }

  function tick() {
    var timeLimit = stageTimeLimit(state.stage);
    var used = elapsedSeconds(timeLimit);
    state.remaining = Math.max(0, timeLimit - used);
    updateStatusBar();
    if (state.remaining <= 0) {
      handleFail();
    }
  }

  function startTicking() {
    stopTicking();
    state.tickTimer = setInterval(tick, 250);
  }

  function formatTime(seconds) {
    var s = Math.ceil(seconds);
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  function updateStatusBar() {
    var totalStages = getTotalStages();
    var totalDiffs = state.boardData ? state.boardData.hotspots.length : 0;
    el.statusStage.textContent = "단계 " + state.stage + " / " + totalStages;
    el.statusFound.textContent = "찾은 개수 " + state.foundCells.length + " / " + totalDiffs;

    var timeLimit = stageTimeLimit(state.stage);
    var ratio = timeLimit > 0 ? Math.max(0, Math.min(1, state.remaining / timeLimit)) : 0;
    el.timeBarFill.style.width = (ratio * 100) + "%";
  }

  // ---------------------------------------------------------------
  // 단계 시작 / 게임 시작 / 재시작
  // ---------------------------------------------------------------
  function startStage(stageNumber) {
    hideAllOverlays();
    var timeLimit = stageTimeLimit(stageNumber);
    state.stage = stageNumber;
    state.foundCells = [];
    state.isPaused = false;
    state.pausedTotal = 0;
    state.penaltySeconds = 0;
    state.remaining = timeLimit;

    var set = pickImageSet(state.usedImageSets, state.imageSets);
    state.usedImageSets.push(set.id);
    var variantPath = set.variantPaths[Math.floor(Math.random() * set.variantPaths.length)];
    var hotspots = set.diffs[variantPath.split("/").pop()];

    loadImage(set.basePath, function (baseImg) {
      loadImage(variantPath, function (variantImg) {
        state.boardData = buildBoard(baseImg, variantImg, set.basePath, variantPath, hotspots);
        state.startTimestamp = Date.now();
        renderBoards();
        updateStatusBar();
        startTicking();
      });
    });
  }

  function startNewGame() {
    state.name = el.nameInput.value.trim();
    state.cumulativeElapsed = 0;
    state.usedImageSets = [];
    showScreen("game");
    startStage(1);
  }

  function resetToHome() {
    stopTicking();
    stopCurrentSound();
    hideAllOverlays();
    state.isPaused = false;
    el.nameInput.value = "";
    el.btnStart.disabled = true;
    showScreen("home");
  }

  function hideAllOverlays() {
    el.pauseOverlay.hidden = true;
    el.clearOverlay.hidden = true;
    el.failOverlay.hidden = true;
  }

  // object-fit: contain으로 표시되는 캔버스는 CSS 박스 크기와 실제 그려지는
  // 이미지 영역 크기가 다를 수 있다(비율이 안 맞으면 상하 또는 좌우에 여백이
  // 생김). 클릭 좌표를 실제 이미지가 그려진 영역 기준으로 보정해서 반환한다.
  function getRenderedImageRect(canvas) {
    var rect = canvas.getBoundingClientRect();
    var canvasAspect = canvas.width / canvas.height;
    var boxAspect = rect.width / rect.height;
    var width, height;
    if (canvasAspect > boxAspect) {
      width = rect.width;
      height = rect.width / canvasAspect;
    } else {
      height = rect.height;
      width = rect.height * canvasAspect;
    }
    return {
      left: rect.left + (rect.width - width) / 2,
      top: rect.top + (rect.height - height) / 2,
      width: width,
      height: height,
    };
  }

  // ---------------------------------------------------------------
  // 클릭 처리 (요구사항 2단계: 요소당 리스너 1개, 멱등 처리)
  // ---------------------------------------------------------------
  function handleBoardClick(e) {
    if (state.isPaused) return;
    var canvas = e.target.closest("canvas");
    if (!canvas) return;

    var rect = getRenderedImageRect(canvas);
    var fx = (e.clientX - rect.left) / rect.width;
    var fy = (e.clientY - rect.top) / rect.height;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return; // 여백(letterbox) 영역 클릭은 무시
    var data = state.boardData;

    var hitIndex = -1;
    for (var i = 0; i < data.hotspots.length; i++) {
      var h = data.hotspots[i];
      var dx = h.x - fx;
      var dy = h.y - fy;
      if (Math.sqrt(dx * dx + dy * dy) <= h.radius * 1.15) {
        hitIndex = i;
        break;
      }
    }

    if (hitIndex === -1) {
      state.penaltySeconds += WRONG_CLICK_PENALTY_SECONDS;
      showWrongMark(canvas, fx, fy);
      tick(); // 페널티를 즉시 반영하고, 0 이하가 되면 바로 실패 처리
      return;
    }
    if (state.foundCells.indexOf(hitIndex) !== -1) return; // 이미 찾은 대상: 무시 (멱등)

    state.foundCells.push(hitIndex);
    redrawBoards();
    triggerFirework(canvas, data.hotspots[hitIndex]);
    updateStatusBar();
    if (state.foundCells.length >= data.hotspots.length) {
      handleStageSuccess();
    }
  }

  // 오답 클릭 위치에 빨간 X 표시를 잠깐 그리고 보드 영역을 흔든다. X 표시는
  // 애니메이션이 아니라 정적 표시라 움직임 감소와 무관하게 항상 보여주고,
  // 흔들림(모션)만 움직임 감소 시 끈다.
  function drawWrongMark(canvas, fx, fy) {
    var ctx = canvas.getContext("2d");
    var cx = fx * canvas.width;
    var cy = fy * canvas.height;
    var r = Math.max(10, canvas.width * 0.025);
    ctx.save();
    ctx.strokeStyle = "#e0435b";
    ctx.lineWidth = Math.max(3, r * 0.35);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - r, cy - r);
    ctx.lineTo(cx + r, cy + r);
    ctx.moveTo(cx + r, cy - r);
    ctx.lineTo(cx - r, cy + r);
    ctx.stroke();
    ctx.restore();
  }

  function triggerBoardsShake() {
    if (state.reducedMotion) return;
    el.boards.classList.remove("shake-effect");
    void el.boards.offsetWidth; // 강제 리플로우로 같은 클래스를 다시 붙여도 애니메이션이 재시작되게 한다
    el.boards.classList.add("shake-effect");
  }

  function showWrongMark(canvas, fx, fy) {
    drawWrongMark(canvas, fx, fy);
    triggerBoardsShake();
    if (state.wrongMarkTimer) clearTimeout(state.wrongMarkTimer);
    state.wrongMarkTimer = setTimeout(function () {
      redrawBoards(); // X 표시만 지우고 기존 그림(찾은 표시 포함)은 그대로 복원
    }, 500);
  }

  // 다른점을 찾았을 때 그 지점(초록 원과 같은 좌표)에서 잠깐 폭죽 파티클이
  // 터진다. 애니메이션이라 움직임 감소 시에는 생략하고 기존 초록 원만 남긴다.
  // 클릭한 쪽 캔버스에만 표시한다(반대쪽 판은 그대로 둠). 커스텀 마우스
  // 커서가 클릭 지점을 가리므로(사용자 피드백: "커서 때문에 안 보여", "그냥
  // 크게 폭죽 터뜨려줘") 파티클 수/크기/퍼지는 반경과 충격파 링을 눈에 띄게
  // 크게 잡았다. .board가 overflow:hidden이라 판 가장자리 근처에서 터지면
  // 일부가 잘려 보일 수 있는데, 이는 판 밖으로 새어나가지 않게 하려는
  // 의도된 동작이다.
  var FIREWORK_COLORS = ["#ff6b4a", "#ffd166", "#17a672", "#14b8a6", "#7c6cf0", "#ff4d6d"];
  var FIREWORK_PARTICLE_COUNT = 28;

  function triggerFirework(canvas, hotspot) {
    if (state.reducedMotion) return;
    var board = canvas.parentElement; // .board (position: relative, overflow: hidden)
    if (!board) return;
    var rect = getRenderedImageRect(canvas);
    var boardRect = board.getBoundingClientRect();
    var originX = rect.left + hotspot.x * rect.width - boardRect.left;
    var originY = rect.top + hotspot.y * rect.height - boardRect.top;

    var ring = document.createElement("span");
    ring.className = "firework-ring";
    ring.style.left = originX + "px";
    ring.style.top = originY + "px";
    ring.addEventListener(
      "animationend",
      function () {
        this.remove();
      },
      { once: true }
    );
    board.appendChild(ring);

    for (var i = 0; i < FIREWORK_PARTICLE_COUNT; i++) {
      var angle = (Math.PI * 2 * i) / FIREWORK_PARTICLE_COUNT + Math.random() * 0.4;
      var distance = 90 + Math.random() * 100;
      var size = 10 + Math.random() * 9;
      var particle = document.createElement("span");
      particle.className = "firework-particle";
      particle.style.left = originX + "px";
      particle.style.top = originY + "px";
      particle.style.width = size + "px";
      particle.style.height = size + "px";
      var color = FIREWORK_COLORS[i % FIREWORK_COLORS.length];
      particle.style.background = color;
      particle.style.color = color; // box-shadow의 currentColor가 이 색을 그대로 쓰도록
      particle.style.setProperty("--dx", Math.cos(angle) * distance + "px");
      particle.style.setProperty("--dy", Math.sin(angle) * distance + "px");
      particle.addEventListener(
        "animationend",
        function () {
          this.remove();
        },
        { once: true }
      );
      board.appendChild(particle);
    }
  }

  // ---------------------------------------------------------------
  // 성공 / 실패
  // ---------------------------------------------------------------
  function handleStageSuccess() {
    stopTicking();
    var timeLimit = stageTimeLimit(state.stage);
    state.cumulativeElapsed += elapsedSeconds(timeLimit);

    playSuccessEffect();

    var totalStages = getTotalStages();
    if (state.stage >= totalStages) {
      RankingStorage.addRecord(state.name, Math.round(state.cumulativeElapsed));
      el.clearMessage.textContent = totalStages + "단계 클리어! 순위로 이동합니다...";
      el.btnNextStage.hidden = true;
      el.clearOverlay.hidden = false;
      setTimeout(function () {
        el.btnNextStage.hidden = false;
        goToRanking();
      }, 1500);
    } else {
      el.clearMessage.textContent = "단계 성공!";
      el.btnNextStage.hidden = false;
      el.clearOverlay.hidden = false;
    }
  }

  function handleFail() {
    stopTicking();
    el.failOverlay.hidden = false;
  }

  // ---------------------------------------------------------------
  // 일시정지 / 재개 (요구사항 2단계)
  // ---------------------------------------------------------------
  function pauseGame() {
    if (state.isPaused) return;
    state.isPaused = true;
    state.pausedAt = Date.now();
    stopTicking();
    el.pauseOverlay.hidden = false;
  }

  function resumeGame() {
    if (!state.isPaused) return;
    state.pausedTotal += Date.now() - state.pausedAt;
    state.isPaused = false;
    el.pauseOverlay.hidden = true;
    startTicking();
  }

  // ---------------------------------------------------------------
  // 이벤트 효과 (요구사항 5단계): 단계 성공 시 소리+애니메이션, 정확히 1회
  // ---------------------------------------------------------------
  function stopCurrentSound() {
    if (state.currentOscillator) {
      try {
        state.currentOscillator.stop();
      } catch (e) {}
      state.currentOscillator = null;
    }
  }

  function playSuccessSound() {
    if (state.mute) return;
    try {
      if (!state.audioCtx) {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        state.audioCtx = new Ctx();
      }
      var ctx = state.audioCtx;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      state.currentOscillator = osc;
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
      osc.onended = function () {
        if (state.currentOscillator === osc) state.currentOscillator = null;
      };
    } catch (e) {
      // 오디오 미지원 환경에서도 게임은 계속 진행
    }
  }

  function playSuccessAnimation() {
    if (state.reducedMotion) return;
    getBoardCanvases().forEach(function (canvas) {
      if (!canvas) return;
      canvas.classList.add("flash-effect");
      canvas.addEventListener(
        "animationend",
        function () {
          canvas.classList.remove("flash-effect");
        },
        { once: true }
      );
    });
  }

  function playSuccessEffect() {
    playSuccessSound();
    playSuccessAnimation();
  }

  // ---------------------------------------------------------------
  // 순위 화면
  // ---------------------------------------------------------------
  function goToRanking() {
    var records = RankingStorage.getSortedRecords();
    el.rankingBody.innerHTML = "";
    el.rankingEmpty.hidden = records.length > 0;
    records.forEach(function (r, idx) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + (idx + 1) + "</td><td></td><td>" + formatTime(r.totalTimeSeconds) + "</td>";
      tr.children[1].textContent = r.name; // XSS 방지: textContent로 삽입
      el.rankingBody.appendChild(tr);
    });
    showScreen("ranking");
  }

  // ---------------------------------------------------------------
  // 이벤트 바인딩 (모두 최초 1회만 등록)
  // ---------------------------------------------------------------
  function canStartGame() {
    return el.nameInput.value.trim().length > 0 && state.imageSetsReady && state.imageSets.length > 0;
  }

  function updateStartButtonState() {
    el.btnStart.disabled = !canStartGame();
    if (el.imageLoadingNote) {
      if (!state.imageSetsReady) {
        el.imageLoadingNote.hidden = false;
      } else if (state.imageSets.length === 0) {
        el.imageLoadingNote.textContent = "사용 가능한 그림을 찾지 못했습니다. assets 폴더를 확인해 주세요.";
        el.imageLoadingNote.hidden = false;
      } else {
        el.imageLoadingNote.hidden = true;
      }
    }
  }

  el.nameInput.addEventListener("input", updateStartButtonState);

  el.btnStart.addEventListener("click", function () {
    if (!canStartGame()) return;
    showScreen("rules");
  });

  el.btnStartConfirmed.addEventListener("click", function () {
    startNewGame();
  });

  detectImageSets().then(function (sets) {
    state.imageSets = sets;
    state.imageSetsReady = true;
    updateStartButtonState();
  });

  el.btnGotoRanking.addEventListener("click", goToRanking);
  el.btnRankingHome.addEventListener("click", resetToHome);

  function bindExclusiveToggle(toggles, onChange) {
    toggles.forEach(function (toggle) {
      toggle.addEventListener("click", function () {
        var pressed = toggle.getAttribute("aria-pressed") !== "true";
        toggles.forEach(function (other) {
          other.setAttribute("aria-pressed", pressed ? "true" : "false");
        });
        onChange(pressed);
      });
    });
  }

  bindExclusiveToggle(el.muteToggles, function (pressed) {
    state.mute = pressed;
    if (state.mute) stopCurrentSound();
  });

  bindExclusiveToggle(el.reducedMotionToggles, function (pressed) {
    state.reducedMotion = pressed;
    if (state.reducedMotion) {
      getBoardCanvases().forEach(function (canvas) {
        if (canvas) canvas.classList.remove("flash-effect");
      });
      el.boards.classList.remove("shake-effect");
    }
  });

  el.boardLeft.addEventListener("click", handleBoardClick);
  el.boardRight.addEventListener("click", handleBoardClick);
  el.boards.addEventListener("animationend", function () {
    el.boards.classList.remove("shake-effect");
  });

  el.btnPause.addEventListener("click", pauseGame);
  el.btnResume.addEventListener("click", resumeGame);
  el.btnRestart.addEventListener("click", resetToHome);
  el.btnRestartAfterFail.addEventListener("click", resetToHome);
  el.btnNextStage.addEventListener("click", function () {
    startStage(state.stage + 1);
  });

  // 초기 화면
  showScreen("home");
})();
