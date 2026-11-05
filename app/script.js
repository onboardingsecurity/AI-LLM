// 화면. 사용자 입력과 결과는 모두 textContent로만 넣는다.
(function () {
  const { data, logic, messages } = App;
  const $ = (id) => document.getElementById(id);
  const won = (n) => n.toLocaleString('ko-KR') + '원';
  const fill = (text, title) => text.replace(/\{title\}/g, title);

  const screenJobs = $('screen-jobs');
  const screenServices = $('screen-services');
  const screenCompare = $('screen-compare');
  const screenResult = $('screen-result');
  const form = $('compare-form');
  const resultBox = $('result');

  // 고른 서비스(논문의 menus 키). 처음에는 열린 첫 직업의 열린 첫 서비스다.
  let menuId = data.jobs.find((j) => j.ready).services.find((sv) => sv.ready).id;

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
  // 가게 두 곳이면 결과 종류마다 효과가 다르다. A 차이 작음은 하트, B 경계는 물음표, C 차이 큼은 느낌표.
  const FX_BY_KIND = { A: 'hearts', B: '?', C: '!' };
  // 가게 한 곳이면 가격 위치마다 다르다. 낮은 쪽과 가운데는 하트, 높은 쪽은 물음표, 범위 밖 높은 가격은 느낌표.
  const FX_BY_POSITION = { belowMin: '?', low: 'hearts', mid: 'hearts', high: '?', aboveMax: '?' };

  $('mascot').addEventListener('click', (event) => burst('hearts', event.clientX, event.clientY));

  // ---------- 직업 선택 ----------
  const backBar = $('back-bar');
  let currentScreen = screenJobs;
  function show(screen, headingId) {
    currentScreen = screen;
    // 뒤로 가기 줄은 직업 선택에서만 보이지 않는다(자리는 그대로 두어 화면이 바뀌어도 위치가 변하지 않는다)
    const off = screen === screenJobs;
    backBar.dataset.off = String(off);
    backBar.inert = off;
    $('lead').hidden = screen === screenResult; // 결과 화면에서는 첫 문장 상자와 그 아래 설명을 보이지 않는다
    $('lead-sub').hidden = screen === screenResult;
    screenJobs.hidden = screen !== screenJobs;
    screenServices.hidden = screen !== screenServices;
    screenCompare.hidden = screen !== screenCompare;
    screenResult.hidden = screen !== screenResult;
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
      const button = el('button', null, job.ready ? 'job' : job.locked ? 'job off sealed' : 'job off', { type: 'button' });
      if (!job.ready) button.setAttribute('aria-label', job.locked ? '준비중' : job.name + ', 준비중');
      button.appendChild(art);
      button.appendChild(el('span', job.name, 'job-name'));
      if (job.ready) {
        button.addEventListener('click', () => openServices(job));
      } else if (job.locked) {
        // 완전히 잠긴 칸: 누를 수도, 키보드로 고를 수도 없고 알림도 없다.
        button.disabled = true;
      } else {
        button.setAttribute('aria-disabled', 'true');
        button.appendChild(el('img', null, 'lock', { src: 'assets/icons/lock.png', alt: '' }));
        button.addEventListener('click', () => notify('해당 직업은 준비중입니다.', 'warn'));
      }
      item.appendChild(button);
      list.appendChild(item);
    });
  }

  // ---------- 서비스 선택 ----------
  // 직업을 누르면 그 직업의 서비스 목록을 보여 준다. 논문이 판단한 서비스(ready)만 누를 수 있다.
  function openServices(job) {
    const list = $('service-list');
    list.replaceChildren();
    job.services.forEach((service) => {
      const item = el('li');
      const art = el('img', null, 'job-art', {
        src: 'assets/icons/service-' + service.icon + (service.ready ? '' : '-off') + '.png',
        alt: '',
        width: '144',
        height: '144',
      });
      const button = el('button', null, service.ready ? 'job' : 'job off', { type: 'button' });
      if (!service.ready) button.setAttribute('aria-label', service.name + ', 논문에서 아직 다루지 않았어요');
      button.appendChild(art);
      button.appendChild(el('span', service.name, 'job-name'));
      if (service.ready) {
        button.addEventListener('click', () => openCompare(service.id));
      } else {
        button.setAttribute('aria-disabled', 'true');
        button.appendChild(el('img', null, 'lock', { src: 'assets/icons/lock.png', alt: '' }));
        button.addEventListener('click', () => notify('이 서비스는 논문에서 아직 다루지 않았어요.', 'warn'));
      }
      item.appendChild(button);
      list.appendChild(item);
    });
    show(screenServices, 'services-title');
  }

  // 서비스를 고르면 호칭·가격 화면으로 간다. 다른 서비스로 바뀌면 고른 호칭과 가격은 비운다.
  function openCompare(id) {
    if (id !== menuId) {
      menuId = id;
      renderPickers();
      [0, 1].forEach((i) => {
        $('price-' + i).value = '';
        $('price-' + i).removeAttribute('aria-invalid');
      });
    }
    updatePriceTexts();
    resultBox.hidden = true;
    show(screenCompare, 'compare-title');
  }

  // 칸이 비어 있을 때 + 를 누르면 시작하는 값. 손 젤 원톤은 설문 평소 가격 중앙값, 다른 서비스는 첫 호칭의 논문 중앙값이다.
  const stepStart = () => (menuId === 'hand' ? data.survey.usualPrice.median : data.menus[menuId].titles[0].median);

  // 가격 칸의 예시 글자.
  function updatePriceTexts() {
    [0, 1].forEach((i) => {
      $('label-price-' + i).textContent = data.menus[menuId].name + ' 가격(원)';
      $('price-' + i).placeholder = '예: ' + stepStart();
    });
  }

  // ---------- 호칭 고르기(펼쳐서 고르는 옵션 칸) ----------
  // 진짜 <select>는 값을 담아 두는 용도로 숨기고, 그 자리에 픽셀 화살표 버튼(.dd-btn)과 색이 들어간 목록(.dd-list)을 보인다.
  // 다이어리(플랜두씨)의 선택 상자와 같은 모양이다. 값은 계속 select에서 읽는다.
  let openDropdown = null;
  const dropdownClose = () => { if (openDropdown) openDropdown.close(false); };
  document.addEventListener('mousedown', (e) => {
    if (openDropdown && !openDropdown.contains(e.target)) openDropdown.close(false);
  }, true);
  window.addEventListener('resize', dropdownClose);
  window.addEventListener('scroll', (e) => {
    if (openDropdown && !openDropdown.contains(e.target)) openDropdown.close(false);
  }, { capture: true, passive: true });

  function enhanceSelect(select) {
    const btn = el('button', null, 'dd-btn', { type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-labelledby': select.getAttribute('aria-labelledby') });
    const list = el('ul', null, 'dd-list', { role: 'listbox', tabindex: '-1' });
    list.hidden = true;
    select.parentNode.insertBefore(btn, select);
    select.classList.add('dd-native');
    select.tabIndex = -1;
    select.ddButton = btn; // 알림 뒤에 이 칸으로 돌아갈 때 쓴다

    function refresh() {
      const o = select.options[select.selectedIndex];
      btn.textContent = o && o.text ? o.text : ' ';
      btn.classList.toggle('empty', !select.value); // 아직 고르지 않았으면 안내 글씨를 옅게
    }
    const state = {
      contains: (n) => list.contains(n) || btn.contains(n),
      close(refocus) {
        list.hidden = true;
        if (list.parentNode) list.parentNode.removeChild(list);
        btn.setAttribute('aria-expanded', 'false');
        if (openDropdown === state) openDropdown = null;
        if (refocus) btn.focus();
      },
    };

    function place() {
      const r = btn.getBoundingClientRect();
      const room = 12;
      const below = window.innerHeight - r.bottom - room;
      const above = r.top - room;
      const down = list.scrollHeight <= below || below >= above;
      list.style.width = r.width + 'px';
      list.style.left = r.left + 'px';
      list.style.maxHeight = Math.max(80, Math.min(280, down ? below : above)) + 'px';
      list.style.top = (down ? r.bottom + 6 : Math.max(room, r.top - 6 - list.offsetHeight)) + 'px';
    }

    function choose(i) {
      if (select.selectedIndex !== i) {
        select.selectedIndex = i;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      refresh();
      state.close(true);
    }

    function open() {
      dropdownClose();
      list.textContent = '';
      Array.prototype.forEach.call(select.options, (o, i) => {
        const li = el('li', o.text, 'dd-opt', { role: 'option', tabindex: '-1', 'aria-selected': String(i === select.selectedIndex) });
        if (!o.value) li.classList.add('dd-hint');
        li.addEventListener('click', (e) => { e.preventDefault(); choose(i); });
        list.appendChild(li);
      });
      document.body.appendChild(list);
      list.hidden = false;
      place();
      btn.setAttribute('aria-expanded', 'true');
      openDropdown = state;
      const cur = list.children[select.selectedIndex] || list.firstChild;
      if (cur) cur.focus({ preventScroll: true });
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (openDropdown === state) state.close(false); else open();
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); }
      else if (e.key === 'Escape' && openDropdown === state) { e.preventDefault(); state.close(false); }
    });
    list.addEventListener('keydown', (e) => {
      const li = document.activeElement && document.activeElement.closest ? document.activeElement.closest('.dd-opt') : null;
      if (e.key === 'Escape') { e.preventDefault(); state.close(true); }
      else if (e.key === 'Tab') { state.close(false); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = li ? (e.key === 'ArrowDown' ? li.nextElementSibling : li.previousElementSibling) : list.firstChild;
        if (n) n.focus({ preventScroll: true });
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        const n = e.key === 'Home' ? list.firstElementChild : list.lastElementChild;
        if (n) n.focus({ preventScroll: true });
      } else if ((e.key === 'Enter' || e.key === ' ') && li) {
        e.preventDefault();
        choose(Array.prototype.indexOf.call(list.children, li));
      }
    });
    select.addEventListener('change', refresh);
    refresh();
  }

  function renderPickers() {
    dropdownClose();
    [0, 1].forEach((i) => {
      const host = $('picker-' + i);
      host.replaceChildren();
      const select = el('select', null, 'title-select', { id: 'title-' + i, 'aria-labelledby': 'label-title-' + i });
      select.appendChild(el('option', '호칭을 골라 주세요', null, { value: '' }));
      data.menus[menuId].titles.forEach((t) => select.appendChild(el('option', t.name, null, { value: t.name })));
      host.appendChild(select);
      enhanceSelect(select);
    });
  }
  const focusTitle = (select) => (select.ddButton || select).focus();

  // ---------- 가격 칸의 − + 버튼 ----------
  document.querySelectorAll('button.step').forEach((button) => {
    button.addEventListener('click', () => {
      const input = $(button.dataset.target);
      const parsed = logic.parsePrice(input.value);
      const base = parsed.ok ? parsed.value : stepStart();
      const next = Math.min(data.inputMaxWon, Math.max(data.inputMinWon, base + Number(button.dataset.delta)));
      input.value = String(next);
      input.removeAttribute('aria-invalid');
    });
  });

  // ---------- 알아보기 ----------
  // 입력을 검사해 가게 값을 돌려준다. 두 번째 가게는 호칭과 가격을 모두 비워 두면 건너뛴다(가게 한 곳).
  // 잘못되면 알림 창을 띄우고 그 칸으로 돌아가며 null을 돌려준다.
  async function readShops() {
    const shops = [];
    for (let i = 0; i < 2; i += 1) {
      const select = $('picker-' + i).querySelector('select'); // 보이는 버튼(.dd-btn)이 select 앞에 있어서 첫 요소가 아니다
      const title = select.value;
      const input = $('price-' + i);
      if (i === 1) {
        const hasTitle = Boolean(title);
        const hasPrice = input.value.trim() !== '';
        if (!hasTitle && !hasPrice) break;
        if (hasTitle !== hasPrice) {
          await notify('가게 2는 호칭과 가격을 모두 넣거나, 둘 다 비워 두세요.', 'warn');
          if (hasTitle) input.focus(); else focusTitle(select);
          return null;
        }
      }
      if (!logic.findTitle(title, menuId)) {
        await notify('가게 ' + (i + 1) + '의 호칭을 골라 주세요.', 'warn');
        focusTitle(select);
        return null;
      }
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

  // 이유 칸의 가게 설명. 같은 호칭 가게들 사이에서 어디쯤인지만 한 줄로 쓴다.
  function shopLine(index, shop, alone) {
    const head = alone ? '이 가게' : '가게 ' + (index + 1);
    return head + '(' + shop.title + ', ' + won(shop.price) + '): ' + shop.title + ' 가게들 중 ' + messages.positionText[shop.position] + '.';
  }

  function list(items) {
    const ul = el('ul', null, 'reasons');
    items.forEach((text) => ul.appendChild(el('li', text)));
    return ul;
  }

  function renderResult(result) {
    const pricier = result.shops[result.pricier];
    const alone = result.mode === 'single';

    resultBox.replaceChildren();
    // 논문이 본 가격 범위 밖이면 위치를 판정하지 않고 알 수 없다고 하며, 공감 한 줄도 붙이지 않는다.
    const outside = logic.isOutside(pricier);
    let headlineText;
    if (!alone) headlineText = messages.headline[result.kind];
    else if (outside) headlineText = messages.unknown.headline(pricier.title, pricier.stats) + messages.medianSuffix(pricier.vsMedian);
    else headlineText = fill(messages.singleHeadline[pricier.position], pricier.title) + messages.medianSuffix(pricier.vsMedian);
    const headline = el('h3', headlineText);
    resultBox.appendChild(headline);
    // 소비자의 마음이나 판단을 이해해 주는 한 줄(상태마다 하나). 범위 밖이면 없다.
    const feeling = alone ? (outside ? null : messages.feeling.single[pricier.position]) : messages.feeling.compare[result.kind];
    if (feeling) resultBox.appendChild(el('p', feeling, 'quip'));

    // 이유: 항상 함께 보인다.
    const reasons = [];
    if (!alone) {
      reasons.push('두 가게 가격 차이는 ' + won(result.diff) + '이에요(기준 금액 ' + won(data.thresholdWon) + ').');
    }
    result.shops.forEach((shop, i) => reasons.push(shopLine(i, shop, alone)));
    if (!alone && result.sameTitle) reasons.push(messages.sameTitleNote);
    reasons.push(messages.paperConclusion);
    resultBox.appendChild(el('h4', '이렇게 나온 이유'));
    resultBox.appendChild(list(reasons));

    // 소비자 입장에서 따져 볼 점.
    const view = logic.consumerView(result);
    resultBox.appendChild(el('h4', '소비자 입장에서 따져 보면'));
    ['accept', 'hesitate', 'check'].forEach((key) => {
      resultBox.appendChild(el('h5', messages.consumer.titles[key], 'view-' + key));
      resultBox.appendChild(list(view[key]));
    });

    // 알아 둘 점: 호칭의 설문 인상 순위와 순서·가격의 관계를 맨 위에, 그 아래에 논문의 한계를 붙인다.
    resultBox.appendChild(el('h4', '알아 둘 점'));
    resultBox.appendChild(list([...logic.paperExtras(result), ...messages.limits]));

    resultBox.hidden = false;
    burstAt(alone ? FX_BY_POSITION[pricier.position] : FX_BY_KIND[result.kind], headline);
  }

  // 알아보기를 누르면 계산 중 모달 창이 뜨고, 끝나면 결과만 담긴 별도 화면으로 넘어간다(입력 화면 아래에 붙이지 않는다).
  // 계산하는 동안 창을 닫으면(Esc) 결과 화면으로 가지 않고 입력 화면에 남는다.
  const loadingDialog = $('loading-dialog');
  loadingDialog.addEventListener('cancel', () => { runId += 1; });
  const LOADING_MS = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 300 : 1500;
  let runId = 0;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      const result = shops.length === 1 ? logic.single(shops[0], menuId) : logic.compare(shops[0], shops[1], menuId);
      const run = ++runId;
      resultBox.hidden = true;
      loadingDialog.showModal();
      await wait(LOADING_MS);
      if (loadingDialog.open) loadingDialog.close();
      if (run !== runId) return; // 계산하는 동안 창을 닫았다
      show(screenResult, 'result-title'); // 먼저 화면을 바꿔야 효과(하트 등)가 결과 줄 위치에서 나온다
      renderResult(result);
    } finally {
      busy = false;
    }
  });

  // 결과 화면에서는 입력 화면으로, 호칭·가격 화면에서는 서비스 선택으로, 서비스 선택에서는 직업 선택으로 돌아간다(같은 버튼 하나가 지금 화면에 맞게 움직인다).
  $('back').addEventListener('click', () => {
    runId += 1;
    if (currentScreen === screenResult) {
      show(screenCompare, 'compare-title'); // 입력해 둔 호칭과 가격은 그대로 남아 있다
    } else if (currentScreen === screenCompare) {
      resultBox.hidden = true;
      show(screenServices, 'services-title');
    } else if (currentScreen === screenServices) {
      show(screenJobs, 'jobs-title');
    }
  });

  renderJobs();
  renderPickers();
  updatePriceTexts();
})();
