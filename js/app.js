/* SWIPEASIA - прототип без оплаты (этап 2 ТЗ). Светлая тема, шторки, карта на весь экран. */
(function () {
  'use strict';
  const tg = window.Telegram && window.Telegram.WebApp;
  const $app = document.getElementById('app');
  const $tabs = document.getElementById('tabs');
  const PLACES = window.PLACES || [];
  const BY = Object.fromEntries(PLACES.map(p => [p.id, p]));
  const KEY = 'swipeasia_v1';
  const DAY_COLORS = ['#1E3A2B', '#C77B30', '#3C7EA6', '#7A3E6E', '#8BA33A', '#B5523B', '#2E7D7A', '#5D6A60', '#A0782C', '#44506E'];
  const CAT_LABEL = { 'еда': 'Еда', 'кофе': 'Кофе и завтраки', 'бар': 'Бар', 'спа': 'Спа', 'храм': 'Культура', 'пляж': 'Пляж', 'природа': 'Природа', 'рынок': 'Рынок', 'шопинг': 'Шопинг', 'развлечения': 'Развлечения', 'фотоспот': 'Фотоспот' };
  const CAT_EM = { 'еда': '🍜', 'кофе': '☕', 'бар': '🍸', 'спа': '💆', 'храм': '🛕', 'пляж': '🏖', 'природа': '🌿', 'рынок': '🧺', 'шопинг': '🛍', 'развлечения': '🎢', 'фотоспот': '📸' };
  const CAT_COLOR = { 'еда': '#C77B30', 'кофе': '#8BA33A', 'бар': '#7A3E6E', 'спа': '#3C7EA6', 'храм': '#B5523B', 'пляж': '#2E7D7A', 'природа': '#1E3A2B', 'рынок': '#A0782C', 'шопинг': '#44506E', 'развлечения': '#5D6A60', 'фотоспот': '#D3E27A' };
  const MOODS = [
    { id: 'chill', label: 'Чилл у моря', img: 'mood-chill', cats: ['пляж', 'спа', 'кофе', 'бар'] },
    { id: 'see', label: 'Хочу всё увидеть', img: 'mood-see', cats: ['храм', 'пляж', 'рынок', 'фотоспот', 'природа'] },
    { id: 'food', label: 'Еда и бары', img: 'mood-food', cats: ['еда', 'кофе', 'бар', 'рынок'] },
    { id: 'culture', label: 'Культура', img: 'mood-culture', cats: ['храм', 'рынок'] },
    { id: 'nature', label: 'Природа и движуха', img: 'mood-nature', cats: ['природа', 'пляж', 'развлечения'] },
  ];
  const WHO = [
    { id: 'solo', label: 'Один', img: 'who-solo' },
    { id: 'couple', label: 'Вдвоём', img: 'who-couple' },
    { id: 'friends', label: 'Компанией', img: 'who-friends' },
    { id: 'family', label: 'С детьми', img: 'who-family' },
  ];
  const PACE = { calm: 'Спокойно', active: 'Активно' };
  const BUDGET = { 'эконом': 'Экономно', 'средний': 'Нормально', 'дорого': 'Без ограничений' };
  const PLANS = [{ days: 7, price: 390 }, { days: 14, price: 590, main: true }, { days: 30, price: 890 }];

  let S = Object.assign(fresh(), load() || {});
  S.quiz = Object.assign(fresh().quiz, S.quiz || {});
  if (S.screen === 'loading') S.screen = S.route ? 'trip' : 'matches';
  function fresh() {
    return {
      screen: 'start', qOpen: 'when',
      quiz: { days: 4, start: '', dayStart: 9, dayEnd: 22, who: '', moods: [], pace: 'calm', budget: 'средний', transport: 'bike', base: 'euro', geo: null },
      deck: [], idx: 0, hist: [], picks: {}, route: null, unlocked: false, day: 0, tab: 'trip', chk: {},
      rq: { want: '', budget: 'средний', mood: 'any', near: false }, rstep: 0, rseen: [], rcur: null,
    };
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
    // В облако Telegram (лимит 4096 символов) кладём только анкету и мэтчи, маршрут пересоберётся
    const lite = JSON.stringify({ quiz: S.quiz, picks: S.picks, unlocked: S.unlocked });
    try { if (tg && tg.CloudStorage && lite.length < 4000) tg.CloudStorage.setItem(KEY, lite); } catch (e) {}
  }
  function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const money = n => n ? '≈ ' + Math.round(n / 1000).toLocaleString('ru-RU') + ' 000 ₫' : 'пешком';
  const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return n + ' ' + (m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c); };
  const haptic = t => { try { tg && tg.HapticFeedback && (t === 'ok' ? tg.HapticFeedback.notificationOccurred('success') : tg.HapticFeedback.impactOccurred(t || 'light')); } catch (e) {} };
  const mapsUrl = p => p.url || `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
  function toast(t) { const el = document.getElementById('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('on'), 2200); }

  // Фото: своё (img/places) или фото категории. Все фото сейчас сгенерированы - честно подписываем «Иллюстрация»,
  // кроме тех id, что внесены в PLACE_PHOTOS_REAL (живые снимки места).
  const OWN = new Set(window.PLACE_PHOTOS || []);
  const REAL = new Set(window.PLACE_PHOTOS_REAL || []);
  const hasOwn = p => OWN.has(p.id);
  const img = p => hasOwn(p) ? `img/places/${p.id}.webp` : `img/cat/${p.img}.webp`;
  const thumb = p => hasOwn(p) ? `img/places/t/${p.id}.webp` : `img/cat/${p.img}.webp`;
  const illu = p => REAL.has(p.id) ? '' : '<span class="illu">Иллюстрация</span>';
  const MODES = Route.MODES;
  const modeLabel = m => (MODES[m] || MODES.bike).label;
  const modeIcon = m => /car$/.test(m || '') ? '🚕' : '🛵';
  const baseNow = () => (S.screen === 'roulette' && S.rq.near && S.quiz.geo) ? Route.baseOf({ base: 'geo', geo: S.quiz.geo }) : (S.route && S.route.base) || Route.baseOf(S.quiz);
  const fromWhere = () => baseNow().label === 'Моя геопозиция' ? 'от тебя' : 'от дома';
  const budgetMark = p => ({ 'эконом': '₫', 'средний': '₫₫', 'дорого': '₫₫₫' }[p.budget] || '');

  function go(screen, extra) { closeSheet(); Object.assign(S, extra || {}, { screen }); save(); render(); window.scrollTo(0, 0); }

  /* ---------- Telegram ---------- */
  if (tg) {
    try { tg.ready(); tg.expand(); tg.setHeaderColor('#F6F3EC'); tg.setBackgroundColor('#F6F3EC'); tg.disableVerticalSwipes && tg.disableVerticalSwipes(); } catch (e) {}
    tg.BackButton && tg.BackButton.onClick(back);
  }
  function back() {
    if (closeSheet()) return;
    const s = S.screen;
    if (s === 'quiz') go(S.route ? 'matches' : 'start');
    else if (s === 'intro') go('quiz');
    else if (s === 'swipe') go(S.route ? 'matches' : 'intro');
    else if (s === 'matches') go('swipe');
    else if (s === 'trip' && S.tab !== 'trip') { S.tab = 'trip'; save(); render(); }
    else if (s === 'trip') go('matches');
    else if (s === 'roulette') { if (S.rstep === 'spin') go('roulette', { rstep: 0 }); else go('start'); }
  }
  function syncBack() {
    if (!tg || !tg.BackButton) return;
    S.screen !== 'start' || document.querySelector('.sheet-bg') ? tg.BackButton.show() : tg.BackButton.hide();
  }

  /* ---------- Render ---------- */
  function render() {
    $tabs.hidden = S.screen !== 'trip';
    document.body.className = 'scr-' + S.screen + (S.screen === 'trip' ? ' with-tabs tab-' + S.tab : '');
    if (mapObj && !(S.screen === 'trip' && S.tab === 'trip')) { mapObj.remove(); mapObj = null; }
    (({ start: renderStart, quiz: renderQuiz, intro: renderIntro, swipe: renderSwipe, matches: renderMatches, loading: renderLoading, trip: renderTrip, roulette: renderRoulette })[S.screen] || renderStart)();
    syncBack();
  }

  /* ---------- Старт ---------- */
  function renderStart() {
    const has = !!S.route;
    $app.innerHTML = `
    <section class="start">
      <div class="start-photo"><img src="img/ui/cover.webp" alt=""></div>
      <span class="kicker">Свидание с Нячангом</span>
      <h1>SWIPEASIA</h1>
      <p class="lead">Свайпаешь места как анкеты - получаешь маршрут по дням с картой и ценами на такси. Места собрал местный.</p>
      <div class="cities">
        <div class="city on"><div><b>Нячанг</b><small>${PLACES.length} мест в базе</small></div><span class="hand">Погнали</span></div>
        <div class="city"><div><b>Дананг</b><small>Скоро</small></div><button class="soon" data-soon>Сообщить о запуске</button></div>
        <div class="city"><div><b>Фукуок</b><small>Скоро</small></div><button class="soon" data-soon>Сообщить о запуске</button></div>
      </div>
      <button class="roul-entry" data-roul><span class="em">🎲</span><span><b>Живу в Нячанге</b><small>Рулетка: не знаешь, куда пойти сегодня - крутани</small></span><span class="arr">→</span></button>
      <div class="foot">
        ${has ? `<button class="btn btn-dark btn-block" data-open>Моя поездка <span class="arrow">→</span></button>
                 <button class="btn btn-ghost btn-block" data-new>Собрать новую</button>`
              : `<button class="btn btn-dark btn-block" data-new>Собрать поездку <span class="arrow">→</span></button>`}
        <div class="note">Анкета и свайпы бесплатно. Первый день маршрута - тоже.</div>
      </div>
    </section>`;
    $app.querySelector('[data-new]').onclick = () => { const r = fresh(); r.screen = 'quiz'; r.rq = S.rq; S = r; save(); render(); };
    $app.querySelector('[data-roul]').onclick = () => go('roulette', { rstep: 0 });
    const o = $app.querySelector('[data-open]'); if (o) o.onclick = () => go('trip', { tab: 'trip' });
    $app.querySelectorAll('[data-soon]').forEach(b => b.onclick = () => { b.textContent = 'Записал ✓'; b.disabled = true; toast('Напишу в боте, когда город появится'); });
  }

  /* ---------- Анкета: один экран, строки раскрываются ---------- */
  function renderQuiz() {
    const q = S.quiz, open = S.qOpen;
    const who = WHO.find(w => w.id === q.who);
    const moods = MOODS.filter(m => q.moods.includes(m.id)).map(m => m.label);
    const base = Route.baseOf(q);
    const dateTxt = q.start ? new Date(q.start).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : 'даты не важны';
    const rows = [
      { k: 'when', em: '📅', t: 'Когда', v: `${plural(q.days, 'день', 'дня', 'дней')} · ${dateTxt} · ${q.dayStart}:00-${q.dayEnd}:00`, body: () => `
        <div class="stepper"><button data-d="-1" aria-label="Меньше">−</button><div class="val">${q.days}<small>${plural(q.days, 'день', 'дня', 'дней').split(' ')[1]}</small></div><button data-d="1" aria-label="Больше">+</button></div>
        <label class="field"><span>Первый день поездки (можно пропустить)</span><input type="date" value="${esc(q.start)}" data-start></label>
        <div class="hours"><span>Активные часы</span>
          <div class="hrs"><button data-h="dayStart:-1">−</button><b>${q.dayStart}:00</b><button data-h="dayStart:1">+</button></div>
          <i>до</i>
          <div class="hrs"><button data-h="dayEnd:-1">−</button><b>${q.dayEnd}:00</b><button data-h="dayEnd:1">+</button></div>
        </div>` },
      { k: 'who', em: '👥', t: 'Кто едет', v: who ? who.label : 'Не выбрано', body: () => `<div class="tiles">${WHO.map(w => `<button class="tile ${q.who === w.id ? 'sel' : ''}" data-who="${w.id}"><img src="img/ui/${w.img}.webp" alt=""><span>${w.label}</span></button>`).join('')}</div>` },
      { k: 'mood', em: '✨', t: 'Настроение', v: moods.length ? moods.join(', ') : 'Выбери хотя бы одно', need: !moods.length, body: () => `<p class="hint">Можно несколько.</p><div class="tiles">${MOODS.map((m, i) => `<button class="tile ${q.moods.includes(m.id) ? 'sel' : ''} ${i === 4 ? 'wide' : ''}" data-mood="${m.id}"><img src="img/ui/${m.img}.webp" alt=""><span>${m.label}</span></button>`).join('')}</div>` },
      { k: 'pace', em: '🚶', t: 'Темп', v: PACE[q.pace], body: () => `<div class="pills">${pill('pace', 'calm', '🌴 Спокойно · 2-3 места')}${pill('pace', 'active', '⚡ Активно · 4-5 мест')}</div>` },
      { k: 'budget', em: '💰', t: 'Бюджет на день', v: BUDGET[q.budget], body: () => `<div class="pills">${Object.entries(BUDGET).map(([v, l]) => pill('budget', v, l)).join('')}</div>` },
      { k: 'transport', em: modeIcon(q.transport), t: 'Как едем', v: modeLabel(q.transport), body: () => `<div class="pills">${pill('transport', 'bike', '🛵 Grab байк')}${pill('transport', 'car', '🚕 Grab машина')}${pill('transport', 'mbike', '🛵 Maxim байк')}${pill('transport', 'mcar', '🚕 Maxim машина')}</div><p class="hint">Maxim обычно на 20-30% дешевле Grab.</p>` },
      { k: 'base', em: '📍', t: 'Где живёшь', v: base.label, body: () => `<div class="pills"><button class="pill ${q.base === 'geo' ? 'on' : ''}" data-geo>🧭 ${q.base === 'geo' && q.geo ? 'Моя геопозиция ✓' : 'Я уже здесь - определить'}</button>${Object.entries(Route.BASES).map(([k, b]) => pill('base', k, b.label)).join('')}</div>` },
    ];
    $app.innerHTML = `
      <div class="top"><button class="icon-btn" data-back aria-label="Назад">←</button><div style="flex:1"></div></div>
      <section class="quiz">
        <h2>Создай поездку</h2>
        <p class="sub">Нячанг. Нажми на строку, чтобы изменить.</p>
        <div class="rows">${rows.map(r => `
          <div class="qrow ${open === r.k ? 'open' : ''} ${r.need ? 'need' : ''}">
            <button class="qhead" data-row="${r.k}"><span class="em">${r.em}</span><span class="qt"><small>${r.t}</small><b>${esc(r.v)}</b></span><span class="chev">${open === r.k ? '⌃' : '⌄'}</span></button>
            ${open === r.k ? `<div class="qbody">${r.body()}</div>` : ''}
          </div>`).join('')}</div>
        <div class="qfoot"><button class="link" data-clear>Сбросить</button><button class="btn btn-dark" data-next ${q.moods.length ? '' : 'disabled'}>${S.route ? 'Сохранить' : 'Дальше'} <span class="arrow">→</span></button></div>
      </section>`;
    $app.querySelector('[data-back]').onclick = back;
    $app.querySelectorAll('[data-row]').forEach(b => b.onclick = () => { S.qOpen = S.qOpen === b.dataset.row ? '' : b.dataset.row; haptic(); save(); render(); });
    $app.querySelector('[data-clear]').onclick = () => { S.quiz = fresh().quiz; S.qOpen = 'when'; save(); render(); };
    $app.querySelector('[data-next]').onclick = () => {
      buildDeck();
      if (S.route) { go('matches'); toast('Анкета обновлена. Пересобери маршрут'); } else go('intro');
    };
    $app.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { q.days = Math.max(1, Math.min(10, q.days + +b.dataset.d)); haptic(); save(); render(); });
    $app.querySelectorAll('[data-h]').forEach(b => b.onclick = () => {
      const [k, d] = b.dataset.h.split(':'); const v = q[k] + +d;
      if (k === 'dayStart' && (v < 5 || v > q.dayEnd - 6)) return;
      if (k === 'dayEnd' && (v > 24 || v < q.dayStart + 6)) return;
      q[k] = v; haptic(); save(); render();
    });
    const st = $app.querySelector('[data-start]'); if (st) st.onchange = e => { q.start = e.target.value; save(); render(); };
    $app.querySelectorAll('[data-who]').forEach(b => b.onclick = () => { q.who = b.dataset.who; haptic(); S.qOpen = 'mood'; save(); render(); });
    $app.querySelectorAll('[data-mood]').forEach(b => b.onclick = () => { const m = b.dataset.mood; q.moods = q.moods.includes(m) ? q.moods.filter(x => x !== m) : q.moods.concat(m); haptic(); save(); render(); });
    $app.querySelectorAll('[data-opt]').forEach(b => b.onclick = () => { const [k, v] = b.dataset.opt.split(':'); q[k] = v; haptic(); save(); render(); });
    const g = $app.querySelector('[data-geo]'); if (g) g.onclick = () => locate(pt => { q.geo = pt; q.base = 'geo'; haptic('ok'); save(); render(); });
  }
  function pill(k, v, label) { return `<button class="pill ${S.quiz[k] === v ? 'on' : ''}" data-opt="${k}:${v}">${label}</button>`; }

  /* ---------- Геопозиция ---------- */
  // Сначала LocationManager Telegram (Bot API 8.0+), если его нет - геолокация браузера.
  // Точку берём, только если она в пределах ~40 км от Нячанга, иначе просим выбрать район.
  function locate(ok, quiet) {
    const done = (lat, lng) => {
      if (lat == null) { if (!quiet) toast('Не получилось определить. Выбери район из списка'); return; }
      const pt = { lat: +lat.toFixed(5), lng: +lng.toFixed(5) };
      if (Route.km(pt, Route.CENTER) > 40) { toast('Ты пока не в Нячанге. Выбери район, где будешь жить'); return; }
      ok(pt);
    };
    const browser = () => {
      if (!navigator.geolocation) return done(null);
      navigator.geolocation.getCurrentPosition(p => done(p.coords.latitude, p.coords.longitude), () => done(null), { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
    };
    const lm = tg && tg.LocationManager;
    if (!lm || !tg.isVersionAtLeast || !tg.isVersionAtLeast('8.0')) return browser();
    toast('Определяю…');
    try {
      lm.init(() => {
        if (!lm.isLocationAvailable) return browser();
        if (lm.isAccessRequested && !lm.isAccessGranted) {
          toast('Доступ к геопозиции выключен - открою настройки');
          return setTimeout(() => lm.openSettings(), 900);
        }
        lm.getLocation(d => d ? done(d.latitude, d.longitude) : done(null));
      });
    } catch (e) { browser(); }
  }

  function quizCats() {
    const cats = new Set();
    MOODS.filter(m => S.quiz.moods.includes(m.id)).forEach(m => m.cats.forEach(c => cats.add(c)));
    return cats.size ? [...cats] : null;
  }
  function buildDeck() {
    const cats = quizCats();
    const q = S.quiz;
    const pool = PLACES.filter(p => !(q.budget === 'эконом' && p.budget === 'дорого') && !S.picks[p.id]);
    const score = p => {
      let s = Math.random() * 0.5;
      if (!cats || cats.includes(p.cat)) s += 2;
      if (q.who === 'family' && /дети/.test(p.fits)) s += 1;
      if (!['еда', 'кофе'].includes(p.cat)) s += 0.6; // места важнее еды
      return s;
    };
    pool.sort((a, b) => score(b) - score(a));
    // не больше 10 мест еды в колоде, чтобы не утонуть в кафе
    const out = []; let food = 0;
    for (const p of pool) {
      if (out.length >= 30) break;
      if (['еда', 'кофе'].includes(p.cat)) { if (food >= 10) continue; food++; }
      out.push(p.id);
    }
    S.deck = out; S.idx = 0; S.hist = [];
  }

  function renderIntro() {
    $app.innerHTML = `
      <div class="top"><button class="icon-btn" data-back aria-label="Назад">←</button><div style="flex:1"></div></div>
      <section class="quiz">
        <h2>Анкеты готовы</h2>
        <p class="sub">${S.deck.length} мест под твоё настроение.</p>
        <div class="howto">
          <div><span>👉</span><b>Вправо</b> - берём в план</div>
          <div><span>👈</span><b>Влево</b> - не твой тип</div>
          <div><span>👆</span><b>Вверх</b> - обязательно, даже если придётся встать в 6 утра</div>
          <div><span>☝️</span><b>Нажми</b> на карточку - выедет подробное описание</div>
        </div>
        <p class="sub">Собрать маршрут можно в любой момент - хватит и 10 мест.</p>
        <div class="qfoot"><span></span><button class="btn btn-dark" data-go>Свайпать <span class="arrow">→</span></button></div>
      </section>`;
    $app.querySelector('[data-back]').onclick = back;
    $app.querySelector('[data-go]').onclick = () => go('swipe');
  }

  /* ---------- Свайп ---------- */
  function picked() { return Object.keys(S.picks).length; }
  // Карточка: фото целиком 4:5, поверх - категория, название, фраза и кнопка «Подробнее»
  function card(p, cls, stamps) {
    return `
      <article class="card ${cls}" data-id="${p.id}">
        <img class="ph" src="${img(p)}" alt="" draggable="false">
        ${illu(p)}
        <div class="info">
          <div class="tags"><span class="cat">${CAT_EM[p.cat] || ''} ${CAT_LABEL[p.cat] || p.cat}</span>${budgetMark(p) ? `<span class="tag">${budgetMark(p)}</span>` : ''}${p.zone ? `<span class="tag">${esc(p.zone[0].toUpperCase() + p.zone.slice(1))}</span>` : ''}</div>
          <h3>${esc(p.name)}</h3>
          <p>${esc(p.phrase)}</p>
          ${cls === 'front' ? '<button class="more" data-more>Подробнее ⌃</button>' : ''}
        </div>
        ${cls === 'front' ? (stamps || '') : ''}
      </article>`;
  }
  function renderSwipe() {
    const id = S.deck[S.idx], nextId = S.deck[S.idx + 1];
    const n = S.deck.length;
    $app.innerHTML = `
      <section class="swipe">
        <div class="segs">${S.deck.map((_, i) => `<i class="${i < S.idx ? 'done' : i === S.idx ? 'cur' : ''}"></i>`).join('')}</div>
        <div class="swipe-top">
          <button class="icon-btn" data-back aria-label="Назад">✕</button>
          <div class="counter">Выбрано <b>${picked()}</b><span> · ${Math.min(S.idx + 1, n)} из ${n}</span></div>
          <button class="icon-btn" data-undo aria-label="Отменить" ${S.hist.length ? '' : 'disabled'}>↶</button>
          <button class="btn btn-dark btn-sm" data-done ${picked() ? '' : 'disabled'}>Готово</button>
        </div>
        <div class="deck"><div class="deck-in">
          ${id ? (nextId ? card(BY[nextId], 'back') : '') + card(BY[id], 'front', '<span class="stamp yes">Беру</span><span class="stamp no">Не мой тип</span><span class="stamp must">Обязательно</span>')
               : `<div class="empty"><div><h3>Анкеты закончились</h3><p>Выбрано ${picked()}. Самое время собрать маршрут.</p><button class="btn btn-dark" data-done2>Собрать маршрут</button></div></div>`}
        </div></div>
        ${id ? `<div class="actions"><button class="act" data-a="no" aria-label="Не мой тип">✕</button><button class="act must" data-a="must" aria-label="Обязательно">★</button><button class="act yes" data-a="like" aria-label="Беру">♥</button></div>` : ''}
      </section>`;
    $app.querySelector('[data-back]').onclick = back;
    $app.querySelector('[data-done]').onclick = () => go('matches');
    const d2 = $app.querySelector('[data-done2]'); if (d2) d2.onclick = () => go('matches');
    $app.querySelector('[data-undo]').onclick = undo;
    $app.querySelectorAll('[data-a]').forEach(b => b.onclick = () => decide(b.dataset.a));
    const top = $app.querySelector('.card.front');
    if (top) {
      const open = () => detail(BY[top.dataset.id], { swipe: true });
      drag(top, { like: el => decide('like', el), no: el => decide('no', el), must: el => decide('must', el), tap: open });
      top.querySelector('[data-more]').onclick = e => { e.stopPropagation(); open(); };
    }
  }
  function decide(kind, el) {
    const id = S.deck[S.idx]; if (!id) return;
    closeSheet();
    const card = el || $app.querySelector('.card.front');
    S.hist.push({ id, prev: S.picks[id] || null });
    if (kind === 'like' || kind === 'must') { S.picks[id] = kind; haptic(kind === 'must' ? 'ok' : 'light'); }
    else { delete S.picks[id]; haptic('soft'); }
    const dx = kind === 'no' ? -1 : kind === 'like' ? 1 : 0, dy = kind === 'must' ? -1 : 0;
    if (card) {
      card.style.transition = 'transform .28s ease-out, opacity .28s';
      card.style.transform = `translate(${dx * 520}px, ${dy * 700}px) rotate(${dx * 18}deg)`;
      card.style.opacity = '0';
    }
    S.idx++; save();
    setTimeout(render, card ? 220 : 0);
    if (kind === 'must') matchFlash(BY[id]);
  }
  function undo() {
    const h = S.hist.pop(); if (!h) return;
    if (h.prev) S.picks[h.id] = h.prev; else delete S.picks[h.id];
    S.idx = Math.max(0, S.idx - 1); haptic(); save(); render();
  }
  function matchFlash(p) {
    const d = document.createElement('div'); d.className = 'match';
    d.innerHTML = `<div><h2>Это мэтч!</h2><p>${esc(p.name)} - в плане обязательно.</p></div>`;
    document.body.appendChild(d); setTimeout(() => d.remove(), 900);
  }
  // Свайп карточки. act: { like, no, must, tap }
  function drag(el, act) {
    let sx = 0, sy = 0, dx = 0, dy = 0, on = false;
    const stub = { style: {} };
    const yes = el.querySelector('.stamp.yes') || stub, no = el.querySelector('.stamp.no') || stub, must = el.querySelector('.stamp.must') || stub;
    el.addEventListener('pointerdown', e => { if (e.target.closest('[data-more]')) return; on = true; sx = e.clientX; sy = e.clientY; dx = dy = 0; el.setPointerCapture(e.pointerId); el.style.transition = 'none'; });
    el.addEventListener('pointermove', e => {
      if (!on) return; dx = e.clientX - sx; dy = e.clientY - sy;
      el.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`;
      yes.style.opacity = Math.max(0, Math.min(1, dx / 90));
      no.style.opacity = Math.max(0, Math.min(1, -dx / 90));
      must.style.opacity = Math.abs(dx) < 60 ? Math.max(0, Math.min(1, -dy / 110)) : 0;
    });
    const end = () => {
      if (!on) return; on = false;
      const reset = () => { el.style.transition = 'transform .2s'; el.style.transform = ''; [yes, no, must].forEach(s => s.style.opacity = 0); };
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) { reset(); act.tap && act.tap(el); }
      else if (dx > 100 && act.like) act.like(el);
      else if (dx < -100 && act.no) act.no(el);
      else if (dy < -120 && Math.abs(dx) < 80 && act.must) act.must(el);
      else reset();
      dx = dy = 0;
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }

  /* ---------- Шторка с подробностями места ---------- */
  function detail(p, opts = {}) {
    closeSheet();
    const free = opts.tipOpen !== false;
    const base = baseNow(), mode = (S.route && S.route.mode) || S.quiz.transport;
    const kv = [
      p.price && ['Цена', p.price], p.time && ['На месте', p.time], p.hours && ['Часы', p.hours],
      p.best && ['Лучше всего', p.best], (p.district || p.zone) && ['Район', (p.district || p.zone).replace(/^\d+\.\s*/, '')],
      [modeLabel(mode) + ' ' + fromWhere(), money(Route.grab(base, p, mode)) + ' · ' + Route.travelMin(base, p) + ' мин'],
      p.rain === 'да' && ['В дождь', 'Можно'], p.rain === 'нет' && ['В дождь', 'После дождя лучше не ехать'],
      p.fits && ['Подходит', p.fits],
    ].filter(Boolean);
    const bg = document.createElement('div'); bg.className = 'sheet-bg';
    bg.innerHTML = `<div class="sheet" role="dialog" aria-label="${esc(p.name)}">
      <div class="grip"></div>
      ${opts.go ? '<div class="go-head">Погнали! Адрес для таксиста и карта ниже</div>' : ''}
      <div class="sh-photo"><img src="${img(p)}" alt="">${illu(p)}</div>
      <div class="body">
        <div class="tags"><span class="cat">${CAT_EM[p.cat] || ''} ${CAT_LABEL[p.cat] || p.cat}</span>${budgetMark(p) ? `<span class="tag">${budgetMark(p)}</span>` : ''}</div>
        <h3>${esc(p.name)}</h3>
        ${p.latin && p.latin !== p.name ? `<p class="latin">${esc(p.latin)}</p>` : ''}
        <p class="about">${esc(p.about || p.phrase)}</p>
        ${p.tip ? (free ? `<div class="tip"><span class="from">От меня</span>${esc(p.tip)}</div>` : `<div class="tip"><span class="from">От меня</span>🔒 Совет откроется с пропуском</div>`) : ''}
        ${p.take ? `<div class="warn">Взять с собой: ${esc(p.take)}</div>` : ''}
        <dl class="kv">${kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        <div class="row-btns">
          <a class="btn btn-dark" href="${esc(mapsUrl(p))}" target="_blank" rel="noopener">Google Maps</a>
          <button class="btn btn-ghost" data-copy>Для таксиста</button>
        </div>
      </div>
      ${opts.swipe ? '<div class="sh-actions"><button class="btn btn-ghost" data-no>✕ Не мой тип</button><button class="btn btn-dark" data-like>♥ Беру</button></div>' : ''}
      ${opts.go ? '<div class="sh-actions"><button class="btn btn-dark btn-block" data-again>↻ Крутить ещё</button></div>' : ''}
    </div>`;
    document.body.appendChild(bg);
    requestAnimationFrame(() => bg.classList.add('on'));
    bg.onclick = e => { if (e.target === bg) closeSheet(); };
    pullToClose(bg.querySelector('.sheet'));
    bg.querySelector('[data-copy]').onclick = () => copy(p.latin || p.name);
    const l = bg.querySelector('[data-like]'); if (l) l.onclick = () => decide('like');
    const n = bg.querySelector('[data-no]'); if (n) n.onclick = () => decide('no');
    const ag = bg.querySelector('[data-again]'); if (ag) ag.onclick = () => { closeSheet(); rPick(); render(); spinFx(); };
    syncBack();
  }
  // Шторку можно смахнуть вниз за верх (когда она прокручена в начало)
  function pullToClose(sh) {
    let y0 = null, dy = 0;
    sh.addEventListener('touchstart', e => { y0 = sh.scrollTop <= 0 ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
    sh.addEventListener('touchmove', e => { if (y0 == null) return; dy = e.touches[0].clientY - y0; if (dy > 0) { sh.style.transform = `translateY(${dy}px)`; sh.style.transition = 'none'; } }, { passive: true });
    sh.addEventListener('touchend', () => { if (y0 == null) return; sh.style.transition = ''; if (dy > 110) closeSheet(); else sh.style.transform = ''; y0 = null; });
  }
  function closeSheet() { const s = document.querySelector('.sheet-bg'); if (s) { s.remove(); syncBack(); return true; } return false; }
  function copy(t) {
    const done = () => toast('Скопировал: ' + t + '. Вставь в Grab');
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, done); else done();
  }

  /* ---------- Мэтчи ---------- */
  function renderMatches() {
    const ids = Object.keys(S.picks);
    $app.innerHTML = `
      <div class="top"><button class="icon-btn" data-back aria-label="Назад">←</button><div style="flex:1"></div></div>
      <section class="page">
        <h2>Твои мэтчи</h2>
        <p class="sub">${ids.length ? plural(ids.length, 'место', 'места', 'мест') + '. Лишнее можно убрать.' : 'Пока пусто. Вернись к свайпам.'}</p>
        <div class="list">${ids.map(id => { const p = BY[id]; return `<div class="item"><img src="${thumb(p)}" alt="" data-p="${id}"><div data-p="${id}"><b>${esc(p.name)}${S.picks[id] === 'must' ? '<span class="badge">Обязательно</span>' : ''}</b><small>${CAT_LABEL[p.cat] || p.cat}${p.zone ? ' · ' + esc(p.zone) : ''}</small></div><button class="x" data-rm="${id}" aria-label="Убрать">✕</button></div>`; }).join('')}</div>
        <div class="sticky-foot">
          <button class="btn btn-dark btn-block" data-build ${ids.length ? '' : 'disabled'}>${S.route ? 'Пересобрать' : 'Собрать'} маршрут на ${plural(S.quiz.days, 'день', 'дня', 'дней')} <span class="arrow">→</span></button>
          ${S.route ? '<button class="btn btn-ghost btn-block" data-plan style="margin-top:10px">Вернуться к плану без изменений</button>' : ''}
          <p class="links">${S.idx < S.deck.length ? '<button class="link" data-more>Ещё посвайпать</button> · ' : ''}<button class="link" data-quiz>Изменить анкету</button></p>
        </div>
      </section>`;
    $app.querySelector('[data-back]').onclick = back;
    $app.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { delete S.picks[b.dataset.rm]; save(); render(); });
    $app.querySelectorAll('[data-p]').forEach(b => b.onclick = () => detail(BY[b.dataset.p]));
    const m = $app.querySelector('[data-more]'); if (m) m.onclick = () => go('swipe');
    const pl = $app.querySelector('[data-plan]'); if (pl) pl.onclick = () => go('trip', { tab: 'trip' });
    $app.querySelector('[data-quiz]').onclick = () => go('quiz');
    $app.querySelector('[data-build]').onclick = () => { buildRoute(); haptic('ok'); go('loading'); };
  }
  function buildRoute() {
    const r = Route.build(PLACES, S.picks, Object.assign({}, S.quiz, { cats: quizCats() }));
    S.route = { days: r.days, overflow: r.overflow, added: r.added, mode: r.mode, baseKey: S.quiz.base, base: r.base };
    S.day = 0; S.tab = 'trip';
  }

  /* ---------- Сборка: экран загрузки ---------- */
  function renderLoading() {
    const steps = ['Читаю твою анкету и мэтчи', 'Раскладываю места по дням и районам', 'Считаю дорогу и цены такси', 'Добавляю завтраки, обеды и ужины'];
    $app.innerHTML = `<section class="loading"><img class="lfig" src="img/fig/go.webp" alt="" onerror="this.remove()">
      <h2>Собираю твой Нячанг</h2><p class="sub">Это займёт пару секунд</p>
      <ul>${steps.map((s, i) => `<li data-i="${i}"><span class="dot"></span>${s}</li>`).join('')}</ul></section>`;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let i = 0;
    const tick = () => {
      const li = $app.querySelector(`li[data-i="${i}"]`); if (!li || S.screen !== 'loading') return;
      li.classList.add('on'); haptic('soft'); i++;
      if (i < steps.length) setTimeout(tick, reduce ? 150 : 650);
      else setTimeout(() => { if (S.screen === 'loading') go('trip', { tab: 'trip', day: 0 }); }, reduce ? 200 : 700);
    };
    setTimeout(tick, 250);
  }

  /* ---------- Поездка: карта на весь экран + шторка ---------- */
  const TABS = [['trip', '🗺', 'Поездка'], ['places', '📍', 'Места'], ['profile', '👤', 'Профиль']];
  function renderTabs() {
    $tabs.innerHTML = TABS.map(([k, i, t]) => `<button class="${S.tab === k ? 'on' : ''}" data-tab="${k}"><span class="i">${i}</span>${t}</button>`).join('');
    $tabs.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; save(); render(); window.scrollTo(0, 0); });
  }
  const dayOpen = n => n === 1 || S.unlocked;
  const SNAP = () => { const H = window.innerHeight, tabsH = 64; return { full: Math.round(H * 0.1), mid: Math.round(H * 0.46), low: H - tabsH - 150 }; };

  function renderTrip() {
    renderTabs();
    if (!S.route) { go('start'); return; }
    if (S.tab === 'places') return renderPlaces();
    if (S.tab === 'profile') return renderProfile();
    const R = S.route, n = R.days.length, cur = S.day;
    const snaps = SNAP(); const y = snaps[S.snap || 'mid'];
    const tabs = [['0', 'Обзор']].concat(R.days.map(d => [String(d.n), `День ${d.n}${dayOpen(d.n) ? '' : ' 🔒'}`]));
    if (R.overflow.length) tabs.push(['x', `Не вошло · ${R.overflow.length}`]);
    $app.innerHTML = `
      <div class="trip">
        <div id="map" class="map-full"></div>
        <div class="map-top"><button class="round" data-tomatches aria-label="К мэтчам">←</button><span class="mt-title">SWIPEASIA · Нячанг</span><button class="round" data-toquiz aria-label="Анкета">⚙</button></div>
        <section class="tsheet" style="top:${y}px">
          <div class="tgrab"><div class="grip"></div>
            <div class="th"><div><h2>Твой Нячанг на ${plural(n, 'день', 'дня', 'дней')}</h2><small>${tripDates()}${esc(modeLabel(R.mode))} · старт: ${esc(baseNow().label || 'центр')}</small></div></div>
            <nav class="daytabs">${tabs.map(([k, t]) => `<button class="daytab ${String(cur) === k ? 'on' : ''}" data-day="${k}">${k !== '0' && k !== 'x' ? `<i style="background:${DAY_COLORS[(+k - 1) % 10]}"></i>` : ''}${t}</button>`).join('')}</nav>
          </div>
          <div class="tbody">${cur === 0 ? overview(R) : cur === 'x' ? unplanned(R) : dayView(R.days[cur - 1])}
            <a class="cross" href="https://t.me/kuzmisha_azia_bot?start=catalog" target="_blank" rel="noopener"><b>Переезжаешь надолго?</b><small>В «Азии без стресса» жильё, визы, деньги и быт в Нячанге →</small></a>
          </div>
        </section>
      </div>`;
    $app.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { const k = b.dataset.day; S.day = k === 'x' ? 'x' : +k; if (!S.snap || S.snap === 'low') S.snap = 'mid'; save(); render(); });
    $app.querySelector('[data-tomatches]').onclick = () => go('matches');
    $app.querySelector('[data-toquiz]').onclick = () => go('quiz');
    bindTrip();
    sheetDrag($app.querySelector('.tsheet'));
    const days = cur === 0 || cur === 'x' ? R.days : [R.days[cur - 1]];
    drawMap(document.getElementById('map'), days, cur === 0, y);
  }
  function tripDates() {
    if (!S.quiz.start) return '';
    const a = new Date(S.quiz.start), b = new Date(S.quiz.start); b.setDate(b.getDate() + S.route.days.length - 1);
    const f = d => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    return `${f(a)} - ${f(b)} · `;
  }
  // Шторку тянем за верх: три положения - почти на весь экран, середина, внизу
  function sheetDrag(sh) {
    const grab = sh.querySelector('.tgrab');
    let y0 = null, top0 = 0, moved = false;
    grab.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; y0 = e.clientY; top0 = sh.offsetTop; moved = false; sh.style.transition = 'none'; grab.setPointerCapture(e.pointerId); });
    grab.addEventListener('pointermove', e => { if (y0 == null) return; const d = e.clientY - y0; if (Math.abs(d) > 4) moved = true; sh.style.top = Math.max(SNAP().full, top0 + d) + 'px'; });
    const up = () => {
      if (y0 == null) return; y0 = null; sh.style.transition = '';
      const s = SNAP(), t = sh.offsetTop;
      let best = 'mid'; let bd = 1e9;
      for (const k of ['full', 'mid', 'low']) { const dd = Math.abs(s[k] - t); if (dd < bd) { bd = dd; best = k; } }
      if (!moved) best = S.snap === 'full' ? 'mid' : S.snap === 'low' ? 'mid' : 'full';
      S.snap = best; save(); sh.style.top = s[best] + 'px';
      if (mapObj && mapObj._fit) setTimeout(() => mapObj._fit(s[best]), 260);
    };
    grab.addEventListener('pointerup', up); grab.addEventListener('pointercancel', up);
  }

  function overview(R) {
    const sights = R.days.flatMap(d => d.stops.filter(s => s.kind === 'sight').map(s => BY[s.id]));
    const food = R.days.reduce((a, d) => a + d.stops.filter(s => s.kind !== 'sight').length, 0);
    const taxi = R.days.reduce((a, d) => a + d.grabTotal, 0);
    const byCat = {}; sights.forEach(p => byCat[p.cat] = (byCat[p.cat] || 0) + 1);
    const who = WHO.find(w => w.id === S.quiz.who);
    const moods = MOODS.filter(m => S.quiz.moods.includes(m.id)).map(m => m.label.toLowerCase());
    const left = Math.max(0, S.deck.length - S.idx);
    const hasTemple = sights.some(p => p.cat === 'храм'), hasWater = sights.some(p => ['пляж', 'спа'].includes(p.cat));
    const checklist = [
      ['esim', 'eSIM или местная симка'], ['grab', `Приложение ${/^m/.test(R.mode) ? 'Maxim' : 'Grab'} с привязанной картой`], ['cash', 'Наличные донги на рынки и стритфуд'],
      hasTemple && ['cover', 'Одежда, закрывающая плечи и колени, для храмов'], hasWater && ['swim', 'Купальник и сменная одежда'], ['sun', 'Крем от солнца и вода'],
    ].filter(Boolean);
    const done = checklist.filter(([k]) => S.chk[k]).length;
    return `<div class="ovw">
      <div class="tiles4">
        <div class="tl stats"><b class="tt">📊 Поездка в цифрах</b>${donut(byCat)}<div class="nums"><span><b>${sights.length}</b> мест</span><span><b>${food}</b> еда</span><span><b>${money(taxi).replace('≈ ', '')}</b> такси</span></div></div>
        <button class="tl more" data-toswipe><b class="tt">💚 Досвайпать</b><div class="stack">${(S.deck.slice(S.idx, S.idx + 3).map(id => `<img src="${thumb(BY[id])}" alt="">`).join('')) || '<span class="em">✓</span>'}</div><small>${left ? 'Ещё ' + plural(left, 'анкета', 'анкеты', 'анкет') : 'Все анкеты просмотрены'}</small></button>
        <div class="tl memo"><b class="tt">📝 Заметка</b><p>${esc([plural(R.days.length, 'день', 'дня', 'дней'), who ? who.label.toLowerCase() : '', moods.length ? 'настроение: ' + moods.join(', ') : '', PACE[S.quiz.pace].toLowerCase() + ' темп', BUDGET[S.quiz.budget].toLowerCase()].filter(Boolean).join(', '))}.</p><button class="link" data-toquiz2>Изменить</button></div>
        <div class="tl chk"><b class="tt">✅ Чек-лист · ${done}/${checklist.length}</b>${checklist.map(([k, t]) => `<label><input type="checkbox" data-chk="${k}" ${S.chk[k] ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>
      </div>
      <h4 class="sec">По дням</h4>
      ${R.days.map(d => {
        const names = d.stops.filter(s => s.kind === 'sight').map(s => BY[s.id]);
        return `<button class="ov" data-day="${d.n}"><span class="n" style="background:${DAY_COLORS[(d.n - 1) % 10]}">${d.n}</span>
          <span class="ovt"><b>${esc(dayTitle(d))}</b><small>${dayOpen(d.n) ? esc(names.map(p => p.name).join(' · ') || 'Еда и отдых') : '🔒 Откроется с пропуском'}</small></span>
          <span class="ovimg">${names.slice(0, 2).map(p => `<img src="${thumb(p)}" alt="">`).join('')}</span></button>`;
      }).join('')}
      ${R.added.length ? `<div class="tip"><span class="from">От меня</span>Ты лайкнул мало мест, поэтому я добавил: ${R.added.map(id => esc(BY[id].name)).join(', ')}.</div>` : ''}
    </div>`;
  }
  // Кольцо по категориям мест (SVG, без библиотек)
  function donut(byCat) {
    const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((a, [, v]) => a + v, 0);
    if (!total) return '<div class="donut-empty">Пока пусто</div>';
    const r = 26, c = 2 * Math.PI * r; let off = 0;
    const arcs = entries.map(([k, v]) => { const len = c * v / total; const s = `<circle r="${r}" cx="34" cy="34" fill="none" stroke="${CAT_COLOR[k] || '#999'}" stroke-width="12" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}"/>`; off += len; return s; }).join('');
    return `<div class="donut"><svg viewBox="0 0 68 68" width="68" height="68" aria-hidden="true"><g transform="rotate(-90 34 34)">${arcs}</g></svg>
      <ul>${entries.slice(0, 4).map(([k, v]) => `<li><i style="background:${CAT_COLOR[k] || '#999'}"></i>${CAT_LABEL[k] || k} · ${v}</li>`).join('')}</ul></div>`;
  }
  function dayTitle(d) {
    if (d.n === 1) return 'Лёгкий день после прилёта';
    if (d.far) return 'Выезд: ' + BY[d.far].name;
    const zones = [...new Set(d.stops.filter(s => s.kind === 'sight').map(s => BY[s.id].zone).filter(Boolean))];
    return zones.length ? 'Город: ' + zones.join(', ') : 'Город';
  }
  const KIND = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', sight: '' };

  function dayView(d) {
    const open = dayOpen(d.n), mode = S.route.mode;
    const end = d.stops.length ? d.stops[d.stops.length - 1] : null;
    const html = `<section class="day">
      <div class="dh"><h3>День ${d.n}</h3><span>${dateOf(d.n)}${d.stops.length ? hm(d.stops[0].start) + ' - ' + hm(end.start + end.dur) : ''}</span></div>
      <p class="meta">${esc(dayTitle(d))} · ${modeIcon(mode)} за день ${money(d.grabTotal)}</p>
      ${d.stops.map((s, i) => {
        const p = BY[s.id];
        return `<div class="leg"><span>${s.grab ? modeIcon(mode) : '🚶'} ${s.travel} мин${s.grab ? ' · ' + money(s.grab) : ' · пешком'}</span></div>
        <div class="stop" data-info="${p.id}">
          <div class="sthumb"><img src="${thumb(p)}" alt=""><span class="num" style="background:${DAY_COLORS[(d.n - 1) % 10]}">${i + 1}</span></div>
          <div class="sbody">
            <div class="srow"><span class="kind">${KIND[s.kind] ? KIND[s.kind] + ' · ' : ''}${CAT_LABEL[p.cat] || ''}</span><span class="time">🕘 ${hm(s.start)}</span></div>
            <b>${esc(p.name)}</b>
            <p>${esc(p.phrase)}</p>
            ${open && p.tip ? `<div class="tip"><span class="from">От меня</span>${esc(p.tip)}</div>` : ''}
            ${p.rain === 'нет' ? '<div class="warn">После дождя лучше не ехать</div>' : ''}
            <div class="tools"><a href="${esc(mapsUrl(p))}" target="_blank" rel="noopener" data-stop>Карта</a><button data-copy="${esc(p.latin || p.name)}">Для таксиста</button>${open ? `<button data-move="${d.n}:${i}">В другой день</button><button data-del="${d.n}:${i}">Убрать</button>` : ''}</div>
          </div>
        </div>`;
      }).join('')}
      ${d.far && !d.stops.some(s => s.kind === 'lunch') ? '<div class="warn">Это выезд на весь день: обед возьми с собой или ищи на месте, в базе рядом пока ничего нет.</div>' : ''}
      <div class="daysum">Итого: ${plural(d.stops.length, 'точка', 'точки', 'точек')}, ${esc(modeLabel(mode))} ${money(d.grabTotal)}. Входы и еда - по ценам в карточках.</div>
    </section>`;
    if (open) return html;
    const left = S.route.days.length - 1;
    return `<div class="locked"><div class="blur">${html}</div>
      <div class="paywall"><img class="pwfig" src="img/fig/go.webp" alt="" onerror="this.remove()"><h3>Твой первый день готов. Ещё ${plural(left, 'день', 'дня', 'дней')} ждут за замком</h3>
        <ul><li>Маршрут на все дни с картой</li><li>Сколько ехать и сколько стоит такси</li><li>Мои советы к каждой точке</li><li>Правка дней под себя</li></ul>
        <div class="plans">${PLANS.map(pl => `<div class="plan ${pl.main ? 'main' : ''}"><span>${plural(pl.days, 'день', 'дня', 'дней')}</span><span>${pl.price} ₽</span></div>`).join('')}</div>
        <button class="btn btn-dark btn-block" data-unlock>Открыть (прототип)</button>
        <div class="proto">Оплата подключится на этапе 3. Сейчас открывается бесплатно.</div>
      </div></div>`;
  }
  function unplanned(R) {
    return `<section class="day"><div class="dh"><h3>Не вошло</h3></div>
      <p class="meta">Эти мэтчи не влезли в дни. Добавь их сам или добавь день в анкете.</p>
      ${R.overflow.map(id => { const p = BY[id]; return `<div class="stop" data-info="${id}"><div class="sthumb"><img src="${thumb(p)}" alt=""></div><div class="sbody"><div class="srow"><span class="kind">${CAT_LABEL[p.cat] || ''}</span></div><b>${esc(p.name)}</b><p>${esc(p.phrase)}</p><div class="tools"><button data-add="${id}">Добавить в день</button></div></div></div>`; }).join('')}
    </section>`;
  }
  function dateOf(n) {
    if (!S.quiz.start) return '';
    const d = new Date(S.quiz.start); d.setDate(d.getDate() + n - 1);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' }) + ' · ';
  }
  function bindTrip() {
    const tipOpen = () => typeof S.day === 'number' && S.day > 0 ? dayOpen(S.day) : S.unlocked;
    $app.querySelectorAll('[data-info]').forEach(b => b.onclick = e => { if (e.target.closest('button,a')) return; detail(BY[b.dataset.info], { tipOpen: tipOpen() }); });
    $app.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copy(b.dataset.copy));
    $app.querySelectorAll('[data-chk]').forEach(b => b.onchange = () => { S.chk[b.dataset.chk] = b.checked; haptic(); save(); render(); });
    const sw = $app.querySelector('[data-toswipe]'); if (sw) sw.onclick = () => { if (S.idx >= S.deck.length) buildDeck(); go('swipe'); };
    const tq = $app.querySelector('[data-toquiz2]'); if (tq) tq.onclick = () => go('quiz');
    const u = $app.querySelector('[data-unlock]'); if (u) u.onclick = () => { S.unlocked = true; haptic('ok'); save(); render(); };
    $app.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { const [dn, i] = b.dataset.del.split(':').map(Number); S.route.days[dn - 1].stops.splice(i, 1); retime(S.route.days[dn - 1]); save(); render(); toast('Убрал'); });
    $app.querySelectorAll('[data-move]').forEach(b => b.onclick = () => { const [dn, i] = b.dataset.move.split(':').map(Number); dayPicker(dn, to => moveStop(dn, i, to)); });
    $app.querySelectorAll('[data-add]').forEach(b => b.onclick = () => dayPicker(0, to => addStop(b.dataset.add, to)));
  }
  function dayPicker(except, cb) {
    closeSheet();
    const bg = document.createElement('div'); bg.className = 'sheet-bg';
    bg.innerHTML = `<div class="sheet small"><div class="grip"></div><div class="body"><h3>В какой день?</h3><div class="opts">${S.route.days.filter(d => d.n !== except).map(d => `<button class="opt" data-to="${d.n}"><span class="em" style="color:${DAY_COLORS[(d.n - 1) % 10]}">●</span><span><b>День ${d.n}</b><small>${esc(dayTitle(d))}</small></span></button>`).join('')}</div></div></div>`;
    document.body.appendChild(bg); requestAnimationFrame(() => bg.classList.add('on'));
    bg.onclick = e => { if (e.target === bg) closeSheet(); };
    bg.querySelectorAll('[data-to]').forEach(b => b.onclick = () => { closeSheet(); cb(+b.dataset.to); });
    syncBack();
  }
  function insertBeforeDinner(day, stop) {
    const at = day.stops.findIndex(x => x.kind === 'dinner');
    day.stops.splice(at >= 0 ? at : day.stops.length, 0, stop);
  }
  function moveStop(dn, i, toN) {
    const from = S.route.days[dn - 1], to = S.route.days[toN - 1];
    const [s] = from.stops.splice(i, 1); insertBeforeDinner(to, s);
    retime(from); retime(to); save(); render(); toast('Перенёс в день ' + toN);
  }
  function addStop(id, toN) {
    const p = BY[id], to = S.route.days[toN - 1];
    const dur = ({ 'пляж': 180, 'природа': 180, 'спа': 90, 'бар': 90 })[p.cat] || 60;
    insertBeforeDinner(to, { id, kind: 'sight', start: 0, dur, travel: 0, grab: 0 });
    S.route.overflow = S.route.overflow.filter(x => x !== id);
    retime(to); if (!S.route.overflow.length) S.day = toN; save(); render(); toast('Добавил в день ' + toN);
  }
  // Пересчёт времени дня после правок: порядок сохраняем, время и дорогу считаем заново
  function retime(d) {
    const base = baseNow();
    let cur = base, t = (S.quiz.dayStart || 9) * 60; let total = 0;
    d.stops.forEach(s => {
      const p = BY[s.id];
      if (s.kind === 'dinner') t = Math.max(t, 18 * 60 + 30);
      if (s.kind === 'lunch') t = Math.max(t, 12 * 60);
      s.travel = Route.travelMin(cur, p); s.grab = Route.grab(cur, p, S.route.mode);
      t += s.travel; t = Math.ceil(t / 5) * 5; s.start = t; t += s.dur; cur = p; total += s.grab;
    });
    d.grabTotal = total;
  }

  /* ---------- Карта ---------- */
  let mapObj = null;
  function drawMap(el, days, overview, sheetTop) {
    if (!el || !window.L) { if (el) el.innerHTML = '<p style="padding:80px 20px">Карта не загрузилась. Проверь интернет.</p>'; return; }
    if (mapObj) { mapObj.remove(); mapObj = null; }
    const m = L.map(el, { zoomControl: false, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
    const pts = [];
    const base = baseNow();
    L.marker([base.lat, base.lng], { icon: L.divIcon({ className: '', html: '<div class="pin base">⌂</div>', iconSize: [30, 30] }) }).addTo(m).bindPopup('Старт: ' + base.label);
    pts.push([base.lat, base.lng]);
    days.forEach(d => {
      const open = dayOpen(d.n), color = DAY_COLORS[(d.n - 1) % 10];
      const line = [[base.lat, base.lng]];
      const sightPts = [];
      d.stops.forEach((s, i) => {
        const p = BY[s.id]; const food = s.kind !== 'sight';
        line.push([p.lat, p.lng]); pts.push([p.lat, p.lng]); if (!food) sightPts.push([p.lat, p.lng]);
        if (overview) {
          if (!food) L.circleMarker([p.lat, p.lng], { radius: 6, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }).addTo(m).on('click', () => detail(p, { tipOpen: open }));
        } else {
          L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', html: `<div class="pin ${food ? 'food' : ''}" style="background:${color}">${i + 1}</div>`, iconSize: food ? [24, 24] : [30, 30] }) })
            .addTo(m).on('click', () => detail(p, { tipOpen: open }));
        }
      });
      if (open && !overview) L.polyline(line, { color, weight: 4, opacity: .85, lineCap: 'round', lineJoin: 'round' }).addTo(m);
      if (overview && sightPts.length) {
        const c = sightPts.reduce((a, q) => [a[0] + q[0] / sightPts.length, a[1] + q[1] / sightPts.length], [0, 0]);
        L.marker(c, { icon: L.divIcon({ className: '', html: `<div class="daypin" style="background:${color}">День ${d.n}</div>`, iconSize: [66, 26], iconAnchor: [33, 13] }), zIndexOffset: 1000 }).addTo(m).on('click', () => { S.day = d.n; save(); render(); });
      }
    });
    const bounds = L.latLngBounds(pts);
    m._fit = top => m.fitBounds(bounds, { paddingTopLeft: [30, 80], paddingBottomRight: [30, Math.max(40, window.innerHeight - top + 20)], maxZoom: 15 });
    m._fit(sheetTop);
    mapObj = m;
    setTimeout(() => { m.invalidateSize(); m._fit(sheetTop); }, 80);
  }

  /* ---------- Места ---------- */
  function renderPlaces() {
    const f = S.placesFilter || 'all';
    const cats = [...new Set(PLACES.map(p => p.cat))];
    const list = PLACES.filter(p => f === 'all' || p.cat === f);
    $app.innerHTML = `<section class="page"><h2>Все места</h2><p class="sub">${PLACES.length} мест в Нячанге. ♥ - в твоих мэтчах.</p>
      <div class="filters"><button class="${f === 'all' ? 'on' : ''}" data-f="all">Все</button>${cats.map(c => `<button class="${f === c ? 'on' : ''}" data-f="${c}">${CAT_EM[c] || ''} ${CAT_LABEL[c] || c}</button>`).join('')}</div>
      <div class="grid">${list.map(p => `<button class="gcard" data-p="${p.id}"><img src="${thumb(p)}" alt=""><span><b>${esc(p.name)}${S.picks[p.id] ? ' ♥' : ''}</b><small>${CAT_LABEL[p.cat] || p.cat}</small></span></button>`).join('')}</div></section>`;
    $app.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { S.placesFilter = b.dataset.f; save(); render(); });
    $app.querySelectorAll('[data-p]').forEach(b => b.onclick = () => detail(BY[b.dataset.p], { tipOpen: S.unlocked }));
  }

  /* ---------- Профиль ---------- */
  function renderProfile() {
    const u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
    $app.innerHTML = `<section class="page"><h2>${u ? 'Привет, ' + esc(u.first_name) : 'Профиль'}</h2>
      <p class="sub">Доступ: ${S.unlocked ? 'открыт (прототип)' : 'день 1 бесплатно'}</p>
      <div class="opts">
        <button class="opt" data-edit><span class="em">✏️</span><span><b>Изменить анкету</b><small>Дни, часы, темп, бюджет, где живёшь</small></span></button>
        <button class="opt" data-swipe><span class="em">💚</span><span><b>Досвайпать места</b><small>Потом пересоберу маршрут</small></span></button>
        <button class="opt" data-rebuild><span class="em">🔄</span><span><b>Пересобрать маршрут</b><small>Из текущих мэтчей</small></span></button>
        <button class="opt" data-roul><span class="em">🎲</span><span><b>Рулетка: куда сходить</b><small>Для тех, кто живёт в Нячанге</small></span></button>
        <button class="opt" data-reset><span class="em">🗑</span><span><b>Начать заново</b><small>Сотрёт анкету и мэтчи</small></span></button>
      </div>
      <a class="cross" href="https://t.me/kuzmisha_azia_bot?start=catalog" target="_blank" rel="noopener"><b>Азия без стресса</b><small>Справочник для тех, кто переезжает в Нячанг надолго →</small></a>
      <p class="fine">SWIPEASIA от команды «Азия без стресса». Прототип, этап 2: без оплаты. Цены такси приблизительные. Фото мест - иллюстрации.</p></section>`;
    $app.querySelector('[data-edit]').onclick = () => go('quiz');
    $app.querySelector('[data-swipe]').onclick = () => { if (S.idx >= S.deck.length) buildDeck(); go('swipe'); };
    $app.querySelector('[data-rebuild]').onclick = () => { buildRoute(); go('loading'); };
    $app.querySelector('[data-roul]').onclick = () => go('roulette', { rstep: 0 });
    $app.querySelector('[data-reset]').onclick = () => { S = fresh(); save(); render(); };
  }

  /* ---------- Рулетка «Куда сходить» для тех, кто живёт в Нячанге ---------- */
  const WANT = [
    { id: 'breakfast', em: '🍳', label: 'Завтрак', test: p => p.img === 'breakfast' || p.id === 'bo-ne-3-ngon' },
    { id: 'coffee', em: '☕', label: 'Кофе или десерт', test: p => p.cat === 'кофе' && p.img !== 'breakfast' },
    { id: 'food', em: '🍜', label: 'Обед или ужин', test: p => p.cat === 'еда' && p.img !== 'breakfast' },
    { id: 'bar', em: '🍸', label: 'Бар', test: p => p.cat === 'бар' },
    { id: 'spa', em: '💆', label: 'Спа и массаж', test: p => p.cat === 'спа' },
    { id: 'beach', em: '🏖', label: 'Пляж', test: p => p.cat === 'пляж' },
    { id: 'see', em: '🛕', label: 'Погулять, посмотреть', test: p => ['храм', 'фотоспот', 'рынок', 'природа', 'развлечения', 'шопинг'].includes(p.cat) },
    { id: 'any', em: '🎲', label: 'Удиви меня', test: () => true },
  ];
  // Настроение подбираем по словам в описании места, без выдуманных признаков
  const RMOOD = [
    { id: 'any', label: 'Любое' },
    { id: 'cozy', label: 'Тихо и уютно', re: /тих|уют|зелен|дворик|пруд|крошечн/i },
    { id: 'view', label: 'С видом', re: /вид|крыш|этаж|руфтоп|над вод|мыс|смотров/i },
    { id: 'local', label: 'По-местному', re: /вьетнам|местн|фо |фо$|бо не|барбекю|рынок|пагод|чам/i, not: /достаточн/i },
    { id: 'euro', label: 'Как дома', re: /европ|сырник|паст|стейк|вафл|тост|круассан|шакшук|гирос|рибай|достаточн/i },
  ];
  const RBUDGET = [['эконом', 'Экономно'], ['средний', 'Нормально'], ['дорого', 'Можно шикануть']];

  function rPool() {
    const q = S.rq, w = WANT.find(x => x.id === q.want) || WANT[WANT.length - 1];
    const here = q.near && S.quiz.geo ? S.quiz.geo : null;
    let pool = PLACES.filter(p => w.test(p) && !(q.budget === 'эконом' && p.budget === 'дорого') && !(here && p.zone === 'за городом'));
    const m = RMOOD.find(x => x.id === q.mood);
    let note = '';
    if (m && m.re) { const f = pool.filter(p => m.re.test(p.phrase + ' ' + p.tip) && !(m.not && m.not.test(p.phrase))); if (f.length) pool = f; else note = 'Под это настроение ничего не нашёл, кручу из всех'; }
    if (here) {
      const near = r => pool.filter(p => Route.km(here, p) <= r);
      const r3 = near(3), r6 = near(6);
      if (r3.length >= 2) pool = r3; else if (r6.length) { pool = r6; note = note || 'Рядом мало мест, беру в радиусе 6 км'; } else note = note || 'Рядом ничего нет, кручу по всему городу';
    }
    return { pool, note };
  }
  function rPick() {
    const { pool } = rPool();
    if (!pool.length) return null;
    let left = pool.filter(p => !S.rseen.includes(p.id) && p.id !== S.rcur);
    if (!left.length) { S.rseen = []; left = pool.filter(p => p.id !== S.rcur); if (!left.length) left = pool; }
    const p = left[Math.floor(Math.random() * left.length)];
    S.rseen.push(p.id); S.rcur = p.id; save();
    return p;
  }
  function renderRoulette() {
    if (S.rstep === 'spin' && S.rcur && BY[S.rcur]) return renderSpin();
    const q = S.rq;
    const chip = (k, v, label, em) => `<button class="pill ${q[k] === v ? 'on' : ''}" data-r="${k}:${v}">${em ? em + ' ' : ''}${label}</button>`;
    $app.innerHTML = `
      <div class="top"><button class="icon-btn" data-back aria-label="Назад">←</button><div style="flex:1"></div></div>
      <section class="quiz roul">
        <span class="kicker-dark">Рулетка</span>
        <h2>Куда сходить сегодня?</h2>
        <p class="sub">Выбери, что хочется, - выкину случайное место из базы. Не понравилось - свайпни, и рулетка крутанётся ещё раз.</p>
        <h4>Что хочется</h4><div class="pills">${WANT.map(w => chip('want', w.id, w.label, w.em)).join('')}</div>
        <h4>Бюджет</h4><div class="pills">${RBUDGET.map(([v, l]) => chip('budget', v, l)).join('')}</div>
        <h4>Настроение</h4><div class="pills">${RMOOD.map(m => chip('mood', m.id, m.label)).join('')}</div>
        <h4>Где искать</h4><div class="pills"><button class="pill ${!q.near ? 'on' : ''}" data-near="0">По всему городу</button><button class="pill ${q.near ? 'on' : ''}" data-near="1">🧭 Рядом со мной</button></div>
        <div class="qfoot"><span></span><button class="btn btn-dark" data-spin ${q.want ? '' : 'disabled'}>Крутить <span class="arrow">↻</span></button></div>
      </section>`;
    $app.querySelector('[data-back]').onclick = back;
    $app.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { const [k, v] = b.dataset.r.split(':'); q[k] = v; haptic(); save(); render(); });
    $app.querySelectorAll('[data-near]').forEach(b => b.onclick = () => {
      if (b.dataset.near === '0') { q.near = false; save(); render(); return; }
      locate(pt => { S.quiz.geo = pt; q.near = true; haptic('ok'); save(); render(); });
    });
    $app.querySelector('[data-spin]').onclick = () => { S.rseen = []; S.rcur = null; if (!rPick()) { toast('Под такие условия мест пока нет'); return; } go('roulette', { rstep: 'spin' }); spinFx(); };
  }
  function renderSpin() {
    const p = BY[S.rcur], { note } = rPool();
    const w = WANT.find(x => x.id === S.rq.want);
    const base = baseNow(), mode = S.quiz.transport;
    $app.innerHTML = `
      <section class="swipe">
        <div class="swipe-top"><button class="icon-btn" data-back aria-label="Назад">←</button><div class="counter">${w ? w.em + ' ' + w.label : ''}</div><button class="icon-btn" data-filters aria-label="Фильтры">⚙</button></div>
        ${note ? `<div class="rnote">${esc(note)}</div>` : ''}
        <div class="deck"><div class="deck-in">${card(p, 'front', '<span class="stamp yes">Иду</span><span class="stamp no">Ещё</span>')}</div></div>
        <p class="rdist">${modeIcon(mode)} ${Route.travelMin(base, p)} мин · ${money(Route.grab(base, p, mode))} ${fromWhere()}</p>
        <div class="actions"><button class="act" data-again aria-label="Крутить ещё">↻</button><button class="act yes" data-go aria-label="Иду">✓</button></div>
      </section>`;
    $app.querySelector('[data-back]').onclick = back;
    $app.querySelector('[data-filters]').onclick = () => go('roulette', { rstep: 0 });
    const c = $app.querySelector('.card.front');
    const again = el => { fly(el || c, -1); rPick(); setTimeout(() => { render(); spinFx(); }, 200); };
    const goNow = el => { fly(el || c, 1); haptic('ok'); setTimeout(() => { render(); detail(p, { go: true }); }, 220); };
    drag(c, { no: again, like: goNow, tap: () => detail(p) });
    c.querySelector('[data-more]').onclick = e => { e.stopPropagation(); detail(p); };
    $app.querySelector('[data-again]').onclick = () => again();
    $app.querySelector('[data-go]').onclick = () => goNow();
  }
  function fly(el, dir) {
    if (!el) return;
    el.style.transition = 'transform .28s ease-out, opacity .28s';
    el.style.transform = `translate(${dir * 520}px, 0) rotate(${dir * 18}deg)`;
    el.style.opacity = '0';
  }
  // Короткая «прокрутка»: мелькают названия, потом открывается выпавшее место
  function spinFx() {
    const box = $app.querySelector('.deck-in'); if (!box) return;
    const { pool } = rPool();
    if (pool.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const o = document.createElement('div'); o.className = 'spinfx';
    box.appendChild(o);
    let i = 0; const steps = 9;
    const tick = () => {
      if (i >= steps) { o.classList.add('out'); setTimeout(() => o.remove(), 200); haptic('ok'); return; }
      const r = pool[Math.floor(Math.random() * pool.length)];
      o.innerHTML = `<span>${esc(r.name)}</span>`; haptic('soft'); i++;
      setTimeout(tick, 50 + i * 18);
    };
    tick();
  }

  window.addEventListener('resize', () => { if (S.screen === 'trip' && S.tab === 'trip') { const sh = document.querySelector('.tsheet'); if (sh) sh.style.top = SNAP()[S.snap || 'mid'] + 'px'; } });

  // Пробуем подтянуть сохранённое из облака Telegram (если локально пусто)
  if (!load() && tg && tg.CloudStorage) {
    try { tg.CloudStorage.getItem(KEY, (err, v) => {
      if (err || !v) return;
      try {
        const c = JSON.parse(v); if (!c.picks || !Object.keys(c.picks).length) return;
        S = Object.assign(fresh(), c); S.quiz = Object.assign(fresh().quiz, c.quiz || {});
        buildRoute(); S.screen = 'trip';
        save(); render();
      } catch (e) {}
    }); } catch (e) {}
  }
  render();
})();
