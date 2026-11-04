// 화면. 사용자 입력과 결과는 모두 textContent로만 넣는다.
(function () {
  const { data, logic, messages } = App;
  const $ = (id) => document.getElementById(id);
  const won = (n) => n.toLocaleString('ko-KR') + '원';
  const fill = (text, title) => text.replace(/\{title\}/g, title);

  const screenJobs = $('screen-jobs');
  const screenCompare = $('screen-compare');
  const form = $('compare-form');
  const resultBox = $('result');

  let cycle = 0;
  let lastResult = null;

  function el(tag, text, className, attrs) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    if (attrs) Object.keys(attrs).forEach((k) => node.setAttribute(k, attrs[k]));
    return node;
  }

  // ---------- 알림 창 ----------
  // 알림은 브라우저 기본 alert 대신 화면 스타일에 맞춘 <dialog>로 띄운다. 글자는 textContent로만 넣는다.
  const dlg = $('app-dialog');
  function notify(text, kind) {
    return new Promise((resolve) => {
      if (!dlg || typeof dlg.showModal !== 'function') {
        window.alert(text);
        resolve();
        return;
      }
      const tone = kind || 'warn';
      $('dlg-title').textContent = tone === 'ok' ? '완료' : '알림';
      $('dlg-icon').textContent = tone === 'ok' ? '✓' : '!';
      $('dlg-text').textContent = text;
      dlg.className = 'dlg dlg-' + tone;
      const onClose = () => {
        dlg.removeEventListener('close', onClose);
        resolve();
      };
      dlg.addEventListener('close', onClose);
      dlg.showModal();
    });
  }
  // 어두운 배경을 눌러도 알림이 닫힌다.
  dlg.addEventListener('click', (event) => {
    if (event.target === dlg) dlg.close();
  });

  // ---------- 클릭 효과 ----------
  const fxLayer = $('fx-layer');
  const MAX_ALIVE = 40;
  const rand = (a, b) => a + Math.random() * (b - a);

  function launch(piece, x, y) {
    while (fxLayer.childElementCount > MAX_ALIVE - 1) fxLayer.removeChild(fxLayer.firstChild);
    fxLayer.appendChild(piece);
    const w = piece.offsetWidth;
    const h = piece.offsetHeight;
    piece.style.left = x - w / 2 + rand(-14, 14) + 'px';
    piece.style.top = y - h / 2 + rand(-8, 8) + 'px';
    const rise = rand(120, 240);
    const drift = rand(-90, 90);
    const anim = piece.animate(
      [
        { transform: 'translate(0, 0) scale(0.3)', opacity: 0, offset: 0 },
        { transform: 'translate(0, ' + -rise * 0.1 + 'px) scale(1.15)', opacity: 1, offset: 0.15 },
        { transform: 'translate(' + drift * 0.5 + 'px, ' + -rise * 0.55 + 'px) scale(1)', opacity: 1, offset: 0.55 },
        { transform: 'translate(' + drift + 'px, ' + -rise + 'px) scale(0.6)', opacity: 0, offset: 1 },
      ],
      { duration: rand(1500, 2200), easing: 'steps(12)', fill: 'forwards' }
    );
    anim.onfinish = () => {
      if (piece.parentNode) piece.parentNode.removeChild(piece);
    };
  }

  const HEARTS = ['red', 'pink', 'orange'];
  const GLYPH_COLORS = ['#f0b429', '#ff9a6b', '#4c9a5b', '#f06a8a'];
  function makePiece(kind) {
    if (kind === 'hearts') {
      const size = Math.round(rand(2, 3.4) * 10) / 10;
      const img = el('img', null, 'fx-heart', {
        src: 'assets/icons/heart-' + HEARTS[Math.floor(Math.random() * HEARTS.length)] + '.png',
        alt: '',
      });
      img.style.width = 11 * size + 'px';
      img.style.height = 10 * size + 'px';
      return img;
    }
    const glyph = el('span', kind, 'fx-glyph');
    glyph.style.fontSize = Math.round(rand(26, 42)) + 'px';
    glyph.style.color = GLYPH_COLORS[Math.floor(Math.random() * GLYPH_COLORS.length)];
    return glyph;
  }
  function burst(kind, x, y) {
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i += 1) launch(makePiece(kind), x, y);
  }
  function burstAt(kind, node) {
    const r = node.getBoundingClientRect();
    burst(kind, r.left + r.width / 2, r.top + r.height / 2);
  }
  // 결과 종류마다 효과가 다르다. A 차이 작음은 하트, B 경계는 물음표, C 차이 큼은 느낌표.
  const FX_BY_KIND = { A: 'hearts', B: '?', C: '!' };

  $('mascot').addEventListener('click', (event) => burst('hearts', event.clientX, event.clientY));

  // ---------- 직업 선택 ----------
  function show(screen, headingId) {
    screenJobs.hidden = screen !== screenJobs;
    screenCompare.hidden = screen !== screenCompare;
    $(headingId).focus();
  }

  function renderJobs() {
    const list = $('job-list');
    data.jobs.forEach((job) => {
      const item = el('li');
      const art = el('img', null, 'job-art', {
        src: 'assets/icons/job-' + job.icon + (job.ready ? '' : '-off') + '.png',
        alt: '',
        width: '144',
        height: '144',
      });
      // 그림 아래에 이름 글씨를 함께 보인다. 준비 중인 직업은 읽기 프로그램용 설명을 덧붙인다.
      const button = el('button', null, job.ready ? 'job' : 'job off', { type: 'button' });
      if (!job.ready) button.setAttribute('aria-label', job.name + ', 논문에서 아직 다루지 않았습니다');
      button.appendChild(art);
      button.appendChild(el('span', job.name, 'job-name'));
      if (job.ready) {
        button.addEventListener('click', () => show(screenCompare, 'compare-title'));
      } else {
        button.setAttribute('aria-disabled', 'true');
        button.appendChild(el('img', null, 'lock', { src: 'assets/icons/lock.png', alt: '' }));
        button.addEventListener('click', () => notify('이 직업은 논문에서 아직 다루지 않았습니다.', 'warn'));
      }
      item.appendChild(button);
      list.appendChild(item);
    });
  }

  // ---------- 호칭 고르기(눌러서 고르는 버튼) ----------
  function renderPickers() {
    [0, 1].forEach((i) => {
      const group = el('div', null, 'chips', { role: 'radiogroup', 'aria-labelledby': 'label-title-' + i });
      group.dataset.value = '';
      data.titles.forEach((t) => {
        const chip = el('button', t.name, 'chip ghost', { type: 'button', role: 'radio', 'aria-checked': 'false' });
        chip.dataset.value = t.name;
        chip.addEventListener('click', () => selectTitle(group, t.name));
        group.appendChild(chip);
      });
      $('picker-' + i).appendChild(group);
    });
  }
  function selectTitle(group, name) {
    group.dataset.value = name;
    group.querySelectorAll('.chip').forEach((chip) => {
      chip.setAttribute('aria-checked', String(chip.dataset.value === name));
    });
  }

  // ---------- 가격 칸의 − + 버튼 ----------
  const STEP_START_WON = 35000;   // 칸이 비어 있을 때 + 를 누르면 시작하는 값(논문에서 가장 흔한 중앙값)
  document.querySelectorAll('button.step').forEach((button) => {
    button.addEventListener('click', () => {
      const input = $(button.dataset.target);
      const parsed = logic.parsePrice(input.value);
      const base = parsed.ok ? parsed.value : STEP_START_WON;
      const next = Math.min(data.inputMaxWon, Math.max(data.inputMinWon, base + Number(button.dataset.delta)));
      input.value = String(next);
      input.removeAttribute('aria-invalid');
    });
  });

  // ---------- 비교 ----------
  // 입력을 검사해 두 가게 값을 돌려준다. 잘못되면 알림 창을 띄우고 그 칸으로 돌아가며 null을 돌려준다.
  async function readShops() {
    const shops = [];
    for (let i = 0; i < 2; i += 1) {
      const group = $('picker-' + i).firstElementChild;
      const title = group.dataset.value;
      if (!logic.findTitle(title)) {
        await notify('가게 ' + (i + 1) + '의 호칭을 골라 주세요.', 'warn');
        const first = group.querySelector('.chip');
        if (first) first.focus();
        return null;
      }
      const input = $('price-' + i);
      const parsed = logic.parsePrice(input.value);
      if (!parsed.ok) {
        input.setAttribute('aria-invalid', 'true');
        await notify('가게 ' + (i + 1) + ': ' + parsed.error, 'warn');
        input.focus();
        return null;
      }
      input.removeAttribute('aria-invalid');
      shops.push({ title, price: parsed.value });
    }
    return shops;
  }

  function shopLine(index, shop) {
    const t = shop.stats;
    // 가운데 절반의 시작과 끝이 같으면 "35,000원~35,000원" 대신 "모두 35,000원"이라고 쓴다.
    const middle = t.q1 === t.q3 ? '가운데 절반이 모두 ' + won(t.q1) : '가운데 절반이 ' + won(t.q1) + '~' + won(t.q3);
    return (
      '가게 ' + (index + 1) + '(' + shop.title + ', ' + won(shop.price) + '): 논문의 ' + shop.title + ' ' + t.shops + '곳은 ' +
      '중앙값 ' + won(t.median) + ', ' + middle + ', ' +
      '가장 낮은 곳 ' + won(t.min) + ', 가장 높은 곳 ' + won(t.max) + '이었습니다. ' +
      '이 가격은 ' + messages.positionText[shop.position] + '.'
    );
  }

  function renderResult(result) {
    const seed = logic.seedOf(result, cycle);
    const pricier = result.shops[result.pricier];

    resultBox.replaceChildren();
    const headline = el('h3', messages.headline[result.kind]);
    resultBox.appendChild(headline);
    resultBox.appendChild(el('p', logic.pick(messages.kind[result.kind], seed), 'quip'));
    resultBox.appendChild(
      el('p', fill(logic.pick(messages.position[pricier.position], seed * 3), pricier.title), 'quip')
    );

    const reasons = el('ul', null, 'reasons');
    reasons.appendChild(
      el('li', '두 가게의 가격 차이는 ' + won(result.diff) + '이고, 논문의 기준 금액은 ' + won(data.thresholdWon) + '입니다.')
    );
    result.shops.forEach((shop, i) => reasons.appendChild(el('li', shopLine(i, shop))));
    if (result.sameTitle) reasons.appendChild(el('li', messages.sameTitleNote));
    reasons.appendChild(el('li', messages.paperConclusion));

    const more = el('button', '다른 한 줄 보기', 'ghost', { type: 'button' });
    more.addEventListener('click', () => {
      cycle += 1;
      renderResult(lastResult);
    });

    resultBox.appendChild(el('h4', '이유'));
    resultBox.appendChild(reasons);
    resultBox.appendChild(more);
    resultBox.hidden = false;
    burstAt(FX_BY_KIND[result.kind], headline);
  }

  let busy = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    try {
      const shops = await readShops();
      if (!shops) {
        resultBox.hidden = true;
        return;
      }
      cycle = 0;
      lastResult = logic.compare(shops[0], shops[1]);
      renderResult(lastResult);
      resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } finally {
      busy = false;
    }
  });

  $('back').addEventListener('click', () => {
    resultBox.hidden = true;
    show(screenJobs, 'jobs-title');
  });

  renderJobs();
  renderPickers();
})();
