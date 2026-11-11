/* SWIPEASIA - прототип без оплаты (этап 2 ТЗ). */
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
  const PLANS = [
    { days: 7, price: 390 }, { days: 14, price: 590, main: true }, { days: 30, price: 890 },
  ];
  const STEPS = ['days', 'who', 'mood', 'pace', 'budget', 'transport', 'base'];

  let S = Object.assign(fresh(), load() || {});
  function fresh() {
    return { screen: 'start', step: 0, quiz: { days: 4, start: '', who: '', moods: [], pace: 'calm', budget: 'средний', transport: 'bike', base: 'euro', geo: null }, deck: [], idx: 0, picks: {}, route: null, unlocked: false, day: 1, tab: 'trip', rq: { want: '', budget: 'средний', mood: 'any', near: false }, rstep: 0, rseen: [], rcur: null };
  }
  function save() {
    const data = JSON.stringify(S);
    try { localStorage.setItem(KEY, data); } catch (e) {}
    // В облако Telegram (лимит 4096 символов) кладём только анкету и мэтчи, маршрут пересоберётся
    const lite = JSON.stringify({ quiz: S.quiz, picks: S.picks, unlocked: S.unlocked });
    try { if (tg && tg.CloudStorage && lite.length < 4000) tg.CloudStorage.setItem(KEY, lite); } catch (e) {}
  }
  function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const money = n => n ? '≈ ' + Math.round(n / 1000).toLocaleString('ru-RU') + ' 000 ₫' : 'пешком';
  // Своё фото места - если id есть в data/photos.js, иначе фото категории «для настроения»
  const OWN = new Set(window.PLACE_PHOTOS || []);
  const hasOwn = p => OWN.has(p.id);
  const img = p => hasOwn(p) ? `img/places/${p.id}.webp` : `img/cat/${p.img}.webp`;
  const MODES = Route.MODES;
  const modeLabel = m => (MODES[m] || MODES.bike).label;
  const baseNow = () => (S.screen === 'roulette' && S.rq.near && S.quiz.geo) ? Route.baseOf({ base: 'geo', geo: S.quiz.geo }) : (S.route && S.route.base) || Route.baseOf(S.quiz);
  const fromWhere = () => baseNow().label === 'Моя геопозиция' ? 'от тебя' : 'от дома';
  const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return n + ' ' + (m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c); };
  const haptic = t => { try { tg && tg.HapticFeedback && (t === 'ok' ? tg.HapticFeedback.notificationOccurred('success') : tg.HapticFeedback.impactOccurred(t || 'light')); } catch (e) {} };
  const mapsUrl = p => p.url || `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
  function toast(t) { const el = document.getElementById('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('on'), 2200); }

  function go(screen, extra) { Object.assign(S, extra || {}, { screen }); save(); render(); window.scrollTo(0, 0); }

  /* ---------- Telegram ---------- */
  if (tg) {
    try { tg.ready(); tg.expand(); tg.setHeaderColor('#1E3A2B'); tg.setBackgroundColor('#EEEAE0'); tg.disableVerticalSwipes && tg.disableVerticalSwipes(); } catch (e) {}
    tg.BackButton && tg.BackButton.onClick(back);
  }
  function back() {
    if (closeSheet()) return;
    const s = S.screen;
    if (s === 'quiz') { if (S.step > 0) { S.step--; save(); render(); } else go('start'); }
    else if (s === 'intro') go('quiz', { step: STEPS.length - 1 });
    else if (s === 'swipe') go(S.route ? 'matches' : 'intro');
    else if (s === 'matches') go('swipe');
    else if (s === 'trip' && S.tab !== 'trip') { S.tab = 'trip'; save(); render(); }
    else if (s === 'trip') go('matches');
    else if (s === 'roulette') { if (S.rstep === 'spin') go('roulette', { rstep: 0 }); else go('start'); }
  }
  function syncBack() {
    if (!tg || !tg.BackButton) return;
    const show = S.screen !== 'start';
    show ? tg.BackButton.show() : tg.BackButton.hide();
  }

  /* ---------- Render ---------- */
  function render() {
    $tabs.hidden = S.screen !== 'trip';
    document.body.classList.toggle('with-tabs', S.screen === 'trip');
    (({ start: renderStart, quiz: renderQuiz, intro: renderIntro, swipe: renderSwipe, matches: renderMatches, trip: renderTrip, roulette: renderRoulette })[S.screen] || renderStart)();
    syncBack();
  }

  function renderStart() {
    const has = !!S.route;
    $app.innerHTML = `
    <section class="start">
      <div class="start-photo"><img src="img/ui/cover.webp" alt=""></div>
      <div class="start-body">
        <span class="kicker">Свидание с Нячангом</span>
        <h1>SWIPEASIA</h1>
        <p class="lead">Свайпаешь места как анкеты - получаешь маршрут по дням с картой и ценами на Grab. Места собрал местный.</p>
        <div class="cities">
          <div class="city on"><div><b>Нячанг</b><br><small>${PLACES.length} мест в базе</small></div><span class="hand" style="color:var(--forest)">Погнали</span></div>
          <div class="city"><div><b>Дананг</b><br><small>Скоро</small></div><button class="soon" data-soon>Сообщить о запуске</button></div>
          <div class="city"><div><b>Фукуок</b><br><small>Скоро</small></div><button class="soon" data-soon>Сообщить о запуске</button></div>
        </div>
        <button class="roul-entry" data-roul><span class="em">🎲</span><span><b>Живу в Нячанге</b><small>Рулетка: не знаешь, куда пойти сегодня - крутани</small></span><span class="arrow">→</span></button>
        <div class="foot">
          ${has ? `<button class="btn btn-lime btn-block" data-open>Моя поездка <span class="arrow">→</span></button>
                   <button class="btn btn-ghost btn-block" style="color:var(--paper);border-color:#5F7A68" data-new>Собрать новую</button>`
                : `<button class="btn btn-lime btn-block" data-new>Собрать поездку <span class="arrow">→</span></button>`}
          <div class="note">Анкета и свайпы бесплатно. Первый день маршрута - тоже.</div>
        </div>
      </div>
    </section>`;
    $app.querySelector('[data-new]').onclick = () => { const r = fresh(); r.screen = 'quiz'; S = r; save(); render(); };
    $app.querySelector('[data-roul]').onclick = () => go('roulette', { rstep: 0 });
    const o = $app.querySelector('[data-open]'); if (o) o.onclick = () => go('trip', { tab: 'trip' });
    $app.querySelectorAll('[data-soon]').forEach(b => b.onclick = () => { b.textContent = 'Записал ✓'; b.disabled = true; toast('Напишу в боте, когда город появится'); });
  }

  /* ---------- Quiz ---------- */
  function renderQuiz() {
    const q = S.quiz, key = STEPS[S.step];
    const pct = Math.round((S.step + 1) / (STEPS.length + 1) * 100);
    let body = '', canNext = true;
    if (key === 'days') {
      body = `<h2>На сколько дней прилетаешь?</h2><p class="sub">Даты нужны, чтобы в поездке открывать план на сегодня. Можно пропустить.</p>
        <div class="stepper"><button data-d="-1" aria-label="Меньше">−</button><div class="val">${q.days}<small>${plural(q.days, 'день', 'дня', 'дней').split(' ')[1]}</small></div><button data-d="1" aria-label="Больше">+</button></div>
        <label class="field"><span>Первый день поездки</span><input type="date" value="${esc(q.start)}" data-start></label>`;
    } else if (key === 'who') {
      body = `<h2>Кто едет?</h2><p class="sub">От этого зависят места и темп.</p><div class="tiles">${WHO.map(w => `<button class="tile ${q.who === w.id ? 'sel' : ''}" data-who="${w.id}"><img src="img/ui/${w.img}.webp" alt=""><span>${w.label}</span></button>`).join('')}</div>`;
    } else if (key === 'mood') {
      body = `<h2>Какое настроение?</h2><p class="sub">Можно несколько.</p><div class="tiles">${MOODS.map((m, i) => `<button class="tile ${q.moods.includes(m.id) ? 'sel' : ''} ${i === 4 ? 'wide' : ''}" data-mood="${m.id}"><img src="img/ui/${m.img}.webp" alt=""><span>${m.label}</span></button>`).join('')}</div>`;
      canNext = q.moods.length > 0;
    } else if (key === 'pace') {
      body = `<h2>Какой темп?</h2><p class="sub">Первый день после прилёта всё равно сделаю лёгким.</p><div class="opts">
        ${opt('pace', 'calm', '🌴', 'Спокойно', '2-3 места в день плюс еда')}
        ${opt('pace', 'active', '⚡', 'Активно', '4-5 мест в день, ранние подъёмы')}</div>`;
    } else if (key === 'budget') {
      body = `<h2>Бюджет на день без жилья?</h2><p class="sub">Дорогие места при «экономно» в маршрут не попадут.</p><div class="opts">
        ${opt('budget', 'эконом', '🍜', 'Экономно', 'Стритфуд и бесплатные места')}
        ${opt('budget', 'средний', '🥂', 'Нормально', 'Кафе, спа, иногда руфтоп')}
        ${opt('budget', 'дорого', '💸', 'Ни в чём себе не отказываю', 'Берём всё лучшее')}</div>`;
    } else if (key === 'transport') {
      body = `<h2>Как будешь передвигаться?</h2><p class="sub">Под это посчитаю время и цену такси между точками.</p><div class="opts">
        ${opt('transport', 'bike', '🛵', 'Grab байк', 'Дёшево и быстро, если едешь один')}
        ${opt('transport', 'car', '🚕', 'Grab машина', 'Для пар, семей и компаний')}
        ${opt('transport', 'mbike', '🛵', 'Maxim байк', 'Обычно на 20-30% дешевле Grab')}
        ${opt('transport', 'mcar', '🚕', 'Maxim машина', 'Обычно на 20-30% дешевле Grab')}</div>`;
    } else if (key === 'base') {
      body = `<h2>Где живёшь?</h2><p class="sub">Отсюда начинается каждый день. Если ты уже в Нячанге - определю по геопозиции.</p><div class="opts">
        <button class="opt ${q.base === 'geo' ? 'sel' : ''}" data-geo><span class="em">🧭</span><span><b>Я уже здесь - определить</b><small>${q.base === 'geo' && q.geo ? 'Точка сохранена, маршрут начнётся от тебя' : 'Telegram спросит разрешение на геопозицию'}</small></span></button>
        ${Object.entries(Route.BASES).map(([k, b]) => opt('base', k, '📍', b.label, '')).join('')}</div>`;
    }
    $app.innerHTML = `
      <div class="top"><button class="icon-btn" data-back aria-label="Назад">←</button><div class="progress"><i style="width:${pct}%"></i></div>${key !== 'mood' ? '<button class="skip" data-skip>Пропустить</button>' : '<span style="width:70px"></span>'}</div>
      <section class="quiz">${body}<div class="foot"><button class="btn btn-dark btn-block" data-next ${canNext ? '' : 'disabled'}>${S.step === STEPS.length - 1 ? 'К свайпам' : 'Дальше'}</button></div></section>`;
    $app.querySelector('[data-back]').onclick = back;
    const next = () => {
      if (S.step < STEPS.length - 1) { S.step++; save(); render(); return; }
      buildDeck();
      if (S.route) { go('matches'); toast('Анкета обновлена. Пересобери маршрут'); } else go('intro');
    };
    $app.querySelector('[data-next]').onclick = next;
    const sk = $app.querySelector('[data-skip]'); if (sk) sk.onclick = next;
    $app.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { q.days = Math.max(1, Math.min(10, q.days + +b.dataset.d)); haptic(); save(); render(); });
    const st = $app.querySelector('[data-start]'); if (st) st.onchange = e => { q.start = e.target.value; save(); };
    $app.querySelectorAll('[data-who]').forEach(b => b.onclick = () => { q.who = b.dataset.who; haptic(); save(); render(); });
    $app.querySelectorAll('[data-mood]').forEach(b => b.onclick = () => { const m = b.dataset.mood; q.moods = q.moods.includes(m) ? q.moods.filter(x => x !== m) : q.moods.concat(m); haptic(); save(); render(); });
    $app.querySelectorAll('[data-opt]').forEach(b => b.onclick = () => { const [k, v] = b.dataset.opt.split(':'); q[k] = v; haptic(); save(); render(); });
    const g = $app.querySelector('[data-geo]'); if (g) g.onclick = () => locate(pt => { q.geo = pt; q.base = 'geo'; haptic('ok'); save(); render(); });
  }

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
  function opt(k, v, em, title, sub) {
    return `<button class="opt ${S.quiz[k] === v ? 'sel' : ''}" data-opt="${k}:${v}"><span class="em">${em}</span><span><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span></button>`;
  }

  function quizCats() {
    const cats = new Set();
    MOODS.filter(m => S.quiz.moods.includes(m.id)).forEach(m => m.cats.forEach(c => cats.add(c)));
    return cats.size ? [...cats] : null;
  }

  function buildDeck() {
    const cats = quizCats();
    const q = S.quiz;
    let pool = PLACES.filter(p => !(q.budget === 'эконом' && p.budget === 'дорого') && !S.picks[p.id]);
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
    S.deck = out; S.idx = 0;
  }

  function renderIntro() {
    $app.innerHTML = `
      <div class="top"><button class="icon-btn" data-back aria-label="Назад">←</button><div class="progress"><i style="width:100%"></i></div><span style="width:40px"></span></div>
      <section class="quiz">
        <h2>Анкеты готовы</h2>
        <p class="sub">${S.deck.length} мест под твоё настроение.</p>
        <div class="opts">
          <div class="opt"><span class="em">👉</span><span><b>Вправо - берём в план</b></span></div>
          <div class="opt"><span class="em">👈</span><span><b>Влево - не твой тип</b></span></div>
          <div class="opt"><span class="em">⭐</span><span><b>Вверх - обязательно</b><small>Даже если придётся встать в 6 утра</small></span></div>
        </div>
        <p class="sub" style="margin-top:16px">Собрать маршрут можно в любой момент - хватит и 10 мест.</p>
        <div class="foot"><button class="btn btn-lime btn-block" data-go>Свайпать <span class="arrow">→</span></button></div>
      </section>`;
    $app.querySelector('[data-back]').onclick = back;
    $app.querySelector('[data-go]').onclick = () => go('swipe');
  }

  /* ---------- Swipe ---------- */
  function picked() { return Object.keys(S.picks).length; }
  function renderSwipe() {
    const id = S.deck[S.idx], nextId = S.deck[S.idx + 1];
    const card = (p, cls) => flipCard(p, cls, cls === 'front' ? '<span class="stamp yes">Беру</span><span class="stamp no">Не мой тип</span><span class="stamp must">Обязательно</span>' : '');
    $app.innerHTML = `
      <section class="swipe">
        <div class="swipe-top"><button class="icon-btn" data-back aria-label="Назад">←</button><div class="counter">Выбрано <b>${picked()}</b> · осталось ${Math.max(0, S.deck.length - S.idx)}</div><button class="icon-btn" data-list aria-label="Мэтчи">♥</button></div>
        <div class="deck"><div class="deck-in">
          ${id ? (nextId ? card(BY[nextId], 'back') : '') + card(BY[id], 'front')
               : `<div class="empty"><div><h3>Анкеты закончились</h3><p>Выбрано ${picked()}. Самое время собрать маршрут.</p></div></div>`}
        </div></div>
        ${id ? `<div class="actions"><button class="act" data-a="no" aria-label="Не мой тип">✕</button><button class="act must" data-a="must" aria-label="Обязательно">★</button><button class="act yes" data-a="like" aria-label="Беру">♥</button></div>` : ''}
        <div class="swipe-foot"><button class="btn ${picked() >= 3 ? 'btn-lime' : 'btn-ghost'} btn-block" data-build ${picked() ? '' : 'disabled'}>Собрать маршрут${picked() ? ' · ' + picked() : ''}</button></div>
      </section>`;
    $app.querySelector('[data-back]').onclick = back;
    $app.querySelector('[data-list]').onclick = () => go('matches');
    $app.querySelector('[data-build]').onclick = () => go('matches');
    $app.querySelectorAll('[data-a]').forEach(b => b.onclick = () => decide(b.dataset.a));
    const top = $app.querySelector('.card.front');
    if (top) drag(top, { like: el => decide('like', el), no: el => decide('no', el), must: el => decide('must', el) });
    if (top && !S.flipHint) { const h = document.createElement('div'); h.className = 'flip-hint'; h.textContent = 'Нажми на карточку - она перевернётся'; top.appendChild(h); S.flipHint = 1; save(); }
  }

  // Карточка с двумя сторонами: лицо - фото и фраза, оборот - всё, что знаем о месте
  function flipCard(p, cls, extra) {
    return `
      <article class="card ${cls}" data-id="${p.id}">
        <div class="flip">
          <div class="face face-front">
            <img class="ph" src="${img(p)}" alt="">
            ${hasOwn(p) ? '' : '<span class="illu">Фото для настроения</span>'}
            <span class="turn" aria-hidden="true">↻</span>
            <div class="info"><span class="cat">${CAT_LABEL[p.cat] || p.cat}</span><h3>${esc(p.name)}</h3><p>${esc(p.phrase)}</p>
              <div class="chips">${chips(p)}</div></div>
          </div>
          <div class="face face-back">${cls === 'back' ? '' : backSide(p)}</div>
        </div>
        ${extra || ''}
      </article>`;
  }
  function backSide(p) {
    const fare = money(Route.grab(baseNow(), p, S.quiz.transport));
    const kv = [
      p.price && ['Цена', p.price], p.time && ['На месте', p.time], p.hours && ['Часы', p.hours],
      p.best && ['Лучше', p.best], (p.district || p.zone) && ['Район', (p.district || p.zone).replace(/^\d+\.\s*/, '')],
      [modeLabel(S.quiz.transport) + ' ' + fromWhere(), fare],
      p.rain === 'да' && ['Дождь', 'Можно и в дождь'], p.rain === 'нет' && ['Дождь', 'После дождя лучше не ехать'],
      p.fits && ['Подходит', p.fits],
    ].filter(Boolean);
    return `<div class="bk">
      <span class="cat">${CAT_LABEL[p.cat] || p.cat}</span>
      <h3>${esc(p.name)}</h3>
      ${p.latin && p.latin !== p.name ? `<div class="latin">${esc(p.latin)}</div>` : ''}
      <p class="phrase">${esc(p.phrase)}</p>
      ${p.tip ? `<div class="tip"><span class="from">От меня</span>${esc(p.tip)}</div>` : ''}
      ${p.take ? `<div class="warn">Взять с собой: ${esc(p.take)}</div>` : ''}
      <dl class="kv">${kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <div class="row-btns"><a class="btn btn-dark" href="${esc(mapsUrl(p))}" target="_blank" rel="noopener" data-nodrag>Google Maps</a><button class="btn btn-ghost" data-copy="${esc(p.latin || p.name)}" data-nodrag>Для таксиста</button></div>
      <p class="turnback">Нажми, чтобы перевернуть обратно</p>
    </div>`;
  }
  function chips(p) {
    const c = [];
    if (p.price) c.push(p.price);
    if (p.time) c.push(p.time);
    if (p.zone) c.push(p.zone[0].toUpperCase() + p.zone.slice(1));
    if (p.rain === 'да') c.push('В дождь можно');
    return c.slice(0, 4).map(x => `<span class="chip">${esc(x)}</span>`).join('');
  }
  function decide(kind, el) {
    const id = S.deck[S.idx]; if (!id) return;
    const card = el || $app.querySelector('.card.front');
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
  function matchFlash(p) {
    const d = document.createElement('div'); d.className = 'match';
    d.innerHTML = `<div><h2>Это мэтч!</h2><p>${esc(p.name)} - в плане обязательно.</p></div>`;
    document.body.appendChild(d); setTimeout(() => d.remove(), 900);
  }
  function drag(el, act) {
    let sx = 0, sy = 0, dx = 0, dy = 0, on = false;
    const stub = { style: {} };
    const yes = el.querySelector('.stamp.yes') || stub, no = el.querySelector('.stamp.no') || stub, must = el.querySelector('.stamp.must') || stub;
    el.querySelectorAll('[data-copy]').forEach(b => b.onclick = e => { e.stopPropagation(); copy(b.dataset.copy); });
    el.addEventListener('pointerdown', e => { if (e.target.closest('[data-nodrag]')) return; on = true; sx = e.clientX; sy = e.clientY; el.setPointerCapture(e.pointerId); el.style.transition = 'none'; });
    el.addEventListener('pointermove', e => {
      if (!on) return; dx = e.clientX - sx; dy = e.clientY - sy;
      el.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`;
      yes.style.opacity = Math.max(0, Math.min(1, dx / 90));
      no.style.opacity = Math.max(0, Math.min(1, -dx / 90));
      must.style.opacity = Math.abs(dx) < 60 ? Math.max(0, Math.min(1, -dy / 110)) : 0;
    });
    const end = () => {
      if (!on) return; on = false;
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) { el.style.transform = ''; el.classList.toggle('flipped'); haptic(); const h = el.querySelector('.flip-hint'); if (h) h.remove(); }
      else if (dx > 100 && act.like) act.like(el);
      else if (dx < -100 && act.no) act.no(el);
      else if (dy < -120 && Math.abs(dx) < 80 && act.must) act.must(el);
      else { el.style.transition = 'transform .2s'; el.style.transform = ''; [yes, no, must].forEach(s => s.style.opacity = 0); }
      dx = dy = 0;
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
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
        <div class="foot"><button class="btn btn-lime btn-block" data-spin ${q.want ? '' : 'disabled'}>Крутить <span class="arrow">↻</span></button></div>
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
    $app.innerHTML = `
      <section class="swipe">
        <div class="swipe-top"><button class="icon-btn" data-back aria-label="Назад">←</button><div class="counter">${w ? w.em + ' ' + w.label : ''}</div><button class="icon-btn" data-filters aria-label="Фильтры">⚙</button></div>
        ${note ? `<div class="rnote">${esc(note)}</div>` : ''}
        <div class="deck"><div class="deck-in">${flipCard(p, 'front', '<span class="stamp yes">Иду</span><span class="stamp no">Ещё</span>')}</div></div>
        <div class="actions"><button class="act" data-again aria-label="Крутить ещё">↻</button><button class="act yes" data-go aria-label="Иду">✓</button></div>
        <div class="swipe-foot"><p class="rhint">Влево - крутить ещё · вправо - иду · нажми - подробности</p></div>
      </section>`;
    $app.querySelector('[data-back]').onclick = back;
    $app.querySelector('[data-filters]').onclick = () => go('roulette', { rstep: 0 });
    const card = $app.querySelector('.card.front');
    const again = el => { fly(el || card, -1); rPick(); setTimeout(() => { render(); spinFx(); }, 200); };
    const goNow = el => { fly(el || card, 1); haptic('ok'); setTimeout(() => { render(); sheet(p, { go: true }); }, 220); };
    drag(card, { no: again, like: goNow });
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

  /* ---------- Sheet ---------- */
  function sheet(p, opts = {}) {
    closeSheet();
    const free = opts.tipOpen !== false;
    const bg = document.createElement('div'); bg.className = 'sheet-bg';
    bg.innerHTML = `<div class="sheet" role="dialog" aria-label="${esc(p.name)}">
      <div class="grip"></div>${opts.go ? '<div class="go-head">Погнали! Маршрут и адрес для таксиста ниже</div>' : `<img class="ph" src="${img(p)}" alt="">`}
      <div class="body">
        <span class="chip light">${CAT_LABEL[p.cat] || p.cat}</span>
        <h3>${esc(p.name)}</h3>
        ${p.latin && p.latin !== p.name ? `<p style="color:var(--muted);margin-top:-4px">${esc(p.latin)}</p>` : ''}
        <p>${esc(p.phrase)}</p>
        ${p.tip ? (free ? `<div class="tip"><span class="from">От меня</span>${esc(p.tip)}</div>` : `<div class="tip"><span class="from">От меня</span>🔒 Совет откроется с пропуском</div>`) : ''}
        ${p.take ? `<div class="warn">Взять с собой: ${esc(p.take)}</div>` : ''}
        <dl class="kv">
          ${p.price ? `<dt>Цена</dt><dd>${esc(p.price)}</dd>` : ''}
          ${p.time ? `<dt>На месте</dt><dd>${esc(p.time)}</dd>` : ''}
          ${p.hours ? `<dt>Часы</dt><dd>${esc(p.hours)}</dd>` : ''}
          ${p.district ? `<dt>Район</dt><dd>${esc(p.district.replace(/^\d+\.\s*/, ''))}</dd>` : p.zone ? `<dt>Зона</dt><dd>${esc(p.zone)}</dd>` : ''}
          <dt>${esc(modeLabel(S.quiz.transport))} ${fromWhere()}</dt><dd>${money(Route.grab(baseNow(), p, S.quiz.transport))}</dd>
        </dl>
        <div class="row-btns">
          <a class="btn btn-dark" href="${esc(mapsUrl(p))}" target="_blank" rel="noopener">Google Maps</a>
          <button class="btn btn-ghost" data-copy>Для таксиста</button>
          ${opts.swipe ? '<button class="btn btn-lime" data-like>Беру</button>' : ''}
          ${opts.go ? '<button class="btn btn-lime" data-again>Крутить ещё</button>' : ''}
        </div>
        ${hasOwn(p) ? '' : '<p style="font-size:12px;color:var(--muted);margin-top:14px">Фото для настроения, не снимок этого места.</p>'}
      </div></div>`;
    document.body.appendChild(bg);
    bg.onclick = e => { if (e.target === bg) closeSheet(); };
    bg.querySelector('[data-copy]').onclick = () => copy(p.latin || p.name);
    const l = bg.querySelector('[data-like]'); if (l) l.onclick = () => { closeSheet(); decide('like'); };
    const ag = bg.querySelector('[data-again]'); if (ag) ag.onclick = () => { closeSheet(); rPick(); render(); spinFx(); };
    syncBackForSheet(true);
  }
  function closeSheet() { const s = document.querySelector('.sheet-bg'); if (s) { s.remove(); syncBack(); return true; } return false; }
  function syncBackForSheet() { tg && tg.BackButton && tg.BackButton.show(); }
  function copy(t) {
    const done = () => toast('Скопировал: ' + t + '. Вставь в Grab');
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, done); else done();
  }

  /* ---------- Matches ---------- */
  function renderMatches() {
    const ids = Object.keys(S.picks);
    $app.innerHTML = `
      <div class="top"><button class="icon-btn" data-back aria-label="Назад">←</button><div style="flex:1"></div></div>
      <section class="page">
        <h2>Твои мэтчи</h2>
        <p class="sub">${ids.length ? plural(ids.length, 'место', 'места', 'мест') + '. Лишнее можно убрать.' : 'Пока пусто. Вернись к свайпам.'}</p>
        <div class="list">${ids.map(id => { const p = BY[id]; return `<div class="item"><img src="${img(p)}" alt=""><div><b>${esc(p.name)}${S.picks[id] === 'must' ? '<span class="badge">Обязательно</span>' : ''}</b><small>${CAT_LABEL[p.cat] || p.cat}${p.zone ? ' · ' + esc(p.zone) : ''}</small></div><button class="x" data-rm="${id}" aria-label="Убрать">✕</button></div>`; }).join('')}</div>
        <div class="sticky-foot">
          <button class="btn btn-lime btn-block" data-build ${ids.length ? '' : 'disabled'}>${S.route ? 'Пересобрать' : 'Собрать'} маршрут на ${plural(S.quiz.days, 'день', 'дня', 'дней')} <span class="arrow">→</span></button>
          ${S.route ? '<button class="btn btn-ghost btn-block" data-plan style="margin-top:10px">Вернуться к плану без изменений</button>' : ''}
          <p style="text-align:center;margin:10px 0 0">${S.idx < S.deck.length ? '<button class="link" data-more>Ещё посвайпать</button> · ' : ''}<button class="link" data-quiz>Изменить анкету</button></p>
        </div>
      </section>`;
    $app.querySelector('[data-back]').onclick = back;
    $app.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { delete S.picks[b.dataset.rm]; save(); render(); });
    const m = $app.querySelector('[data-more]'); if (m) m.onclick = () => go('swipe');
    const pl = $app.querySelector('[data-plan]'); if (pl) pl.onclick = () => go('trip', { tab: 'trip' });
    $app.querySelector('[data-quiz]').onclick = () => go('quiz', { step: 0 });
    $app.querySelector('[data-build]').onclick = () => {
      const q = Object.assign({}, S.quiz, { cats: quizCats() });
      const r = Route.build(PLACES, S.picks, q);
      S.route = { days: r.days, overflow: r.overflow, added: r.added, mode: r.mode, baseKey: S.quiz.base, base: r.base };
      haptic('ok'); go('trip', { tab: 'trip', day: 1 });
    };
  }

  /* ---------- Trip ---------- */
  const TABS = [['trip', '🗓', 'Поездка'], ['map', '🗺', 'Карта'], ['places', '📍', 'Места'], ['profile', '👤', 'Профиль']];
  function renderTabs() {
    $tabs.innerHTML = TABS.map(([k, i, t]) => `<button class="${S.tab === k ? 'on' : ''}" data-tab="${k}"><span class="i">${i}</span>${t}</button>`).join('');
    $tabs.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; save(); render(); window.scrollTo(0, 0); });
  }
  const dayOpen = n => n === 1 || S.unlocked;

  function renderTrip() {
    renderTabs();
    if (!S.route) { go('start'); return; }
    if (S.tab === 'map') return renderMapTab();
    if (S.tab === 'places') return renderPlaces();
    if (S.tab === 'profile') return renderProfile();
    const R = S.route, n = R.days.length;
    const cur = S.day; // 0 = обзор
    $app.innerHTML = `
      <header class="trip-head"><button class="head-back" data-tomatches>← К мэтчам</button><small>SWIPEASIA · Нячанг</small><h2>Твой Нячанг на ${plural(n, 'день', 'дня', 'дней')}</h2><small>${Object.keys(S.picks).length} мэтчей · ${esc(modeLabel(R.mode))} · старт: ${esc(baseNow().label || 'центр')}</small></header>
      <nav class="daytabs"><button class="daytab ${cur === 0 ? 'on' : ''}" data-day="0">Обзор</button>${R.days.map(d => `<button class="daytab ${cur === d.n ? 'on' : ''}" data-day="${d.n}"><i style="background:${DAY_COLORS[(d.n - 1) % 10]}"></i>День ${d.n}${dayOpen(d.n) ? '' : ' 🔒'}</button>`).join('')}</nav>
      <div class="map" id="map"></div>
      ${cur === 0 ? overview(R) : dayView(R.days[cur - 1])}
      <a class="cross" href="https://t.me/kuzmisha_azia_bot?start=catalog" target="_blank" rel="noopener" style="margin:22px var(--pad) 0"><b>Переезжаешь надолго?</b><small>В «Азии без стресса» жильё, визы, деньги и быт в Нячанге →</small></a>`;
    $app.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { S.day = +b.dataset.day; save(); render(); });
    $app.querySelector('[data-tomatches]').onclick = () => go('matches');
    bindDay();
    drawMap(document.getElementById('map'), cur === 0 ? R.days : [R.days[cur - 1]], false);
  }

  function overview(R) {
    return `<div class="overview">${R.days.map(d => {
      const sights = d.stops.filter(s => s.kind === 'sight').map(s => BY[s.id].name);
      return `<button class="ov" data-day="${d.n}"><span class="n" style="color:${DAY_COLORS[(d.n - 1) % 10]}">${d.n}</span><span><b>${dayTitle(d)}</b><small>${dayOpen(d.n) ? esc(sights.join(' · ') || 'Еда и отдых') : 'Откроется с пропуском'}</small></span></button>`;
    }).join('')}
    ${R.overflow.length ? `<div class="warn">Не влезло: ${R.overflow.map(id => esc(BY[id].name)).join(', ')}. Добавь день или выкинь лишнее.</div>` : ''}
    ${R.added.length ? `<div class="tip"><span class="from">От меня</span>Ты лайкнул мало мест, поэтому я добавил: ${R.added.map(id => esc(BY[id].name)).join(', ')}.</div>` : ''}
    </div>`;
  }
  function dayTitle(d) {
    if (d.n === 1) return 'Лёгкий день после прилёта';
    if (d.far) return 'Выезд: ' + BY[d.far].name;
    const zones = [...new Set(d.stops.filter(s => s.kind === 'sight').map(s => BY[s.id].zone).filter(Boolean))];
    return zones.length ? 'Город: ' + zones.join(', ') : 'Город';
  }
  const KIND = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', sight: '' };

  function dayView(d) {
    const open = dayOpen(d.n);
    const html = `<section class="day"><h3>День ${d.n}. ${esc(dayTitle(d))}</h3>
      <div class="meta">${dateOf(d.n)}${plural(d.stops.filter(s => s.kind === 'sight').length, 'место', 'места', 'мест')} и еда · такси за день ${money(d.grabTotal)}</div>
      ${d.stops.map((s, i) => {
        const p = BY[s.id];
        return `${`<div class="leg"><span></span><span>${s.travel} мин · ${s.grab ? (MODES[S.route.mode] || MODES.bike).short + ' ' + money(s.grab) : 'пешком'}</span></div>`}
        <div class="stop"><div class="time">${hm(s.start)}</div><div class="box">
          <span class="kind">${KIND[s.kind] ? KIND[s.kind] + ' · ' : ''}${CAT_LABEL[p.cat] || ''}${s.kind === 'sight' ? ' · ' + Math.round(s.dur / 60 * 10) / 10 + ' ч' : ''}</span>
          <b>${esc(p.name)}</b><p>${esc(p.phrase)}</p>
          ${open && p.tip ? `<div class="tip"><span class="from">От меня</span>${esc(p.tip)}</div>` : ''}
          ${p.rain === 'нет' ? '<div class="warn">После дождя лучше не ехать</div>' : ''}
          <div class="tools"><button data-info="${p.id}">Подробнее</button><a href="${esc(mapsUrl(p))}" target="_blank" rel="noopener">Google Maps</a><button data-copy="${esc(p.latin || p.name)}">Для таксиста</button>${open ? `<button data-move="${d.n}:${i}">В другой день</button><button data-del="${d.n}:${i}">Убрать</button>` : ''}</div>
        </div></div>`;
      }).join('')}
      ${d.far && !d.stops.some(s => s.kind === 'lunch') ? '<div class="warn">Это выезд на весь день: обед возьми с собой или ищи на месте, в базе рядом пока ничего нет.</div>' : ''}
      <div class="daysum">Итого: ${plural(d.stops.length, 'точка', 'точки', 'точек')}, ${esc(modeLabel(S.route.mode))} ${money(d.grabTotal)}. Входы и еда - по ценам в карточках.</div>
    </section>`;
    if (open) return html;
    const left = S.route.days.length - 1;
    return `<div class="locked"><div class="blur">${html}</div>
      <div class="paywall"><h3>Твой первый день готов. Ещё ${plural(left, 'день', 'дня', 'дней')} ждут за замком</h3>
        <ul><li>Маршрут на все дни с картой</li><li>Сколько ехать и сколько стоит Grab</li><li>Мои советы к каждой точке</li><li>Правка дней под себя</li></ul>
        <div class="plans">${PLANS.map(pl => `<div class="plan ${pl.main ? 'main' : ''}"><span>${plural(pl.days, 'день', 'дня', 'дней')}</span><span>${pl.price} ₽</span></div>`).join('')}</div>
        <button class="btn btn-lime btn-block" data-unlock>Открыть (прототип)</button>
        <div class="proto">Оплата подключится на этапе 3. Сейчас открывается бесплатно.</div>
      </div></div>`;
  }
  function dateOf(n) {
    if (!S.quiz.start) return '';
    const d = new Date(S.quiz.start); d.setDate(d.getDate() + n - 1);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' }) + ' · ';
  }
  function bindDay() {
    $app.querySelectorAll('[data-info]').forEach(b => b.onclick = () => sheet(BY[b.dataset.info], { tipOpen: dayOpen(S.day) }));
    $app.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copy(b.dataset.copy));
    const u = $app.querySelector('[data-unlock]'); if (u) u.onclick = () => { S.unlocked = true; haptic('ok'); save(); render(); };
    $app.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { const [dn, i] = b.dataset.del.split(':').map(Number); S.route.days[dn - 1].stops.splice(i, 1); retime(S.route.days[dn - 1]); save(); render(); toast('Убрал'); });
    $app.querySelectorAll('[data-move]').forEach(b => b.onclick = () => moveSheet(...b.dataset.move.split(':').map(Number)));
  }
  function moveSheet(dn, i) {
    closeSheet();
    const bg = document.createElement('div'); bg.className = 'sheet-bg';
    bg.innerHTML = `<div class="sheet"><div class="grip"></div><div class="body"><h3>В какой день?</h3><div class="opts">${S.route.days.filter(d => d.n !== dn).map(d => `<button class="opt" data-to="${d.n}"><span class="em" style="color:${DAY_COLORS[(d.n - 1) % 10]}">●</span><span><b>День ${d.n}</b><small>${esc(dayTitle(d))}</small></span></button>`).join('')}</div></div></div>`;
    document.body.appendChild(bg);
    bg.onclick = e => { if (e.target === bg) closeSheet(); };
    bg.querySelectorAll('[data-to]').forEach(b => b.onclick = () => {
      const from = S.route.days[dn - 1], to = S.route.days[+b.dataset.to - 1];
      const [s] = from.stops.splice(i, 1);
      const dinnerAt = to.stops.findIndex(x => x.kind === 'dinner');
      to.stops.splice(dinnerAt >= 0 ? dinnerAt : to.stops.length, 0, s);
      retime(from); retime(to); closeSheet(); save(); render(); toast('Перенёс в день ' + to.n);
    });
  }
  // Пересчёт времени дня после правок: порядок сохраняем, время и дорогу считаем заново
  function retime(d) {
    const base = baseNow();
    let cur = base, t = S.quiz.pace === 'active' ? 8 * 60 : 9 * 60; let total = 0;
    d.stops.forEach(s => {
      const p = BY[s.id];
      if (s.kind === 'dinner') t = Math.max(t, 18 * 60 + 30);
      if (s.kind === 'lunch') t = Math.max(t, 12 * 60);
      s.travel = Route.travelMin(cur, p); s.grab = Route.grab(cur, p, S.route.mode);
      t += s.travel; t = Math.ceil(t / 5) * 5; s.start = t; t += s.dur; cur = p; total += s.grab;
    });
    d.grabTotal = total;
  }

  /* ---------- Map ---------- */
  let mapObj = null;
  function drawMap(el, days, full) {
    if (!el || !window.L) { if (el) el.innerHTML = '<p style="padding:20px">Карта не загрузилась. Проверь интернет.</p>'; return; }
    if (mapObj) { mapObj.remove(); mapObj = null; }
    const m = L.map(el, { zoomControl: false, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
    const pts = [];
    const base = baseNow();
    L.marker([base.lat, base.lng], { icon: L.divIcon({ className: '', html: '<div class="pin base">⌂</div>', iconSize: [28, 28] }) }).addTo(m).bindPopup('Старт: ' + base.label);
    pts.push([base.lat, base.lng]);
    days.forEach(d => {
      const open = dayOpen(d.n), color = DAY_COLORS[(d.n - 1) % 10];
      const line = [[base.lat, base.lng]];
      let k = 0;
      d.stops.forEach(s => {
        const p = BY[s.id]; const food = s.kind !== 'sight';
        if (!food) k++;
        line.push([p.lat, p.lng]); pts.push([p.lat, p.lng]);
        L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', html: `<div class="pin ${food ? 'food' : ''}" style="background:${color}">${food ? '•' : k}</div>`, iconSize: food ? [22, 22] : [28, 28] }) })
          .addTo(m).on('click', () => sheet(p, { tipOpen: open }));
      });
      if (open) L.polyline(line, { color, weight: 4, opacity: .8, dashArray: '2 8', lineCap: 'round' }).addTo(m);
    });
    m.fitBounds(L.latLngBounds(pts).pad(0.15));
    mapObj = m;
    setTimeout(() => m.invalidateSize(), 60);
  }
  function renderMapTab() {
    const R = S.route;
    const sel = S.mapDay || 0;
    $app.innerHTML = `<nav class="daytabs"><button class="daytab ${sel === 0 ? 'on' : ''}" data-md="0">Все дни</button>${R.days.map(d => `<button class="daytab ${sel === d.n ? 'on' : ''}" data-md="${d.n}"><i style="background:${DAY_COLORS[(d.n - 1) % 10]}"></i>День ${d.n}</button>`).join('')}</nav><div class="map full" id="map"></div>`;
    $app.querySelectorAll('[data-md]').forEach(b => b.onclick = () => { S.mapDay = +b.dataset.md; save(); render(); });
    drawMap(document.getElementById('map'), sel ? [R.days[sel - 1]] : R.days, true);
  }

  /* ---------- Places ---------- */
  function renderPlaces() {
    const f = S.placesFilter || 'all';
    const cats = [...new Set(PLACES.map(p => p.cat))];
    const list = PLACES.filter(p => f === 'all' || p.cat === f);
    $app.innerHTML = `<section class="page"><h2>Все места</h2><p class="sub">${PLACES.length} мест в Нячанге. ♥ - в твоих мэтчах.</p>
      <div class="filters"><button class="${f === 'all' ? 'on' : ''}" data-f="all">Все</button>${cats.map(c => `<button class="${f === c ? 'on' : ''}" data-f="${c}">${CAT_LABEL[c] || c}</button>`).join('')}</div>
      <div class="list">${list.map(p => `<button class="item" data-p="${p.id}" style="text-align:left;width:100%"><img src="${img(p)}" alt=""><div><b>${esc(p.name)}${S.picks[p.id] ? ' ♥' : ''}</b><small>${esc(p.phrase)}</small></div></button>`).join('')}</div></section>`;
    $app.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { S.placesFilter = b.dataset.f; save(); render(); });
    $app.querySelectorAll('[data-p]').forEach(b => b.onclick = () => sheet(BY[b.dataset.p], { tipOpen: S.unlocked }));
  }

  /* ---------- Profile ---------- */
  function renderProfile() {
    const u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
    $app.innerHTML = `<section class="page"><h2>${u ? 'Привет, ' + esc(u.first_name) : 'Профиль'}</h2>
      <p class="sub">Доступ: ${S.unlocked ? 'открыт (прототип)' : 'день 1 бесплатно'}</p>
      <div class="opts">
        <button class="opt" data-edit><span class="em">✏️</span><span><b>Изменить анкету</b><small>Дни, темп, бюджет, где живёшь</small></span></button>
        <button class="opt" data-swipe><span class="em">💚</span><span><b>Досвайпать места</b><small>Потом пересоберу маршрут</small></span></button>
        <button class="opt" data-rebuild><span class="em">🔄</span><span><b>Пересобрать маршрут</b><small>Из текущих мэтчей</small></span></button>
        <button class="opt" data-reset><span class="em">🗑</span><span><b>Начать заново</b><small>Сотрёт анкету и мэтчи</small></span></button>
      </div>
      <a class="cross" href="https://t.me/kuzmisha_azia_bot?start=catalog" target="_blank" rel="noopener"><b>Азия без стресса</b><small>Справочник для тех, кто переезжает в Нячанг надолго →</small></a>
      <p style="font-size:12.5px;color:var(--muted);margin-top:18px">SWIPEASIA от команды «Азия без стресса». Прототип, этап 2: без оплаты. Цены Grab приблизительные, от ЖК Panorama.</p></section>`;
    $app.querySelector('[data-edit]').onclick = () => go('quiz', { step: 0 });
    $app.querySelector('[data-swipe]').onclick = () => go('swipe');
    $app.querySelector('[data-rebuild]').onclick = () => { const r = Route.build(PLACES, S.picks, Object.assign({}, S.quiz, { cats: quizCats() })); S.route = { days: r.days, overflow: r.overflow, added: r.added, mode: r.mode, baseKey: S.quiz.base, base: r.base }; go('trip', { tab: 'trip', day: 1 }); toast('Маршрут пересобран'); };
    $app.querySelector('[data-reset]').onclick = () => { S = fresh(); save(); render(); };
  }

  // Пробуем подтянуть сохранённое из облака Telegram (если локально пусто)
  if (!load() && tg && tg.CloudStorage) {
    try { tg.CloudStorage.getItem(KEY, (err, v) => {
      if (err || !v) return;
      try {
        const c = JSON.parse(v); if (!c.picks || !Object.keys(c.picks).length) return;
        S = Object.assign(fresh(), c);
        const r = Route.build(PLACES, S.picks, Object.assign({}, S.quiz, { cats: quizCats() }));
        S.route = { days: r.days, overflow: r.overflow, added: r.added, mode: r.mode, baseKey: S.quiz.base, base: r.base };
        save(); render();
      } catch (e) {}
    }); } catch (e) {}
  }
  render();
})();
