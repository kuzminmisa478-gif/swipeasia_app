/* Сборка маршрута по правилам, без ИИ.
   Вход: выбранные места, анкета. Выход: дни с точками, временем и дорогой. */
(function (root) {
  'use strict';

  const CENTER = { lat: 12.2395, lng: 109.1965 }; // ЖК Panorama, от него считались цены Grab

  // Стартовые точки по районам проживания (центры районов из карты районов)
  const BASES = {
    euro: { lat: 12.2385, lng: 109.1905, label: 'Европейский квартал' },
    tranphu: { lat: 12.2395, lng: 109.1965, label: 'Первая линия Trần Phú' },
    north: { lat: 12.2745, lng: 109.2000, label: 'Север, Хон Чонг' },
    south: { lat: 12.2205, lng: 109.2010, label: 'Юг, за старым аэропортом' },
    baidai: { lat: 12.0600, lng: 109.2050, label: 'Бай Дай / Камрань' },
  };

  const FOOD = ['еда', 'кофе', 'бар'];
  const DEFAULT_TIME = { 'кофе': 60, 'еда': 75, 'бар': 90, 'спа': 90, 'пляж': 180, 'храм': 60, 'природа': 180, 'рынок': 60, 'шопинг': 60, 'развлечения': 180, 'фотоспот': 45 };
  const SLOT = { 'утро': 0, 'день': 1, 'любое': 1, 'закат': 2, 'вечер': 3 };
  const DEFAULT_SLOT = { 'храм': 'утро', 'природа': 'утро', 'рынок': 'утро', 'пляж': 'утро', 'спа': 'день', 'шопинг': 'день', 'развлечения': 'день', 'фотоспот': 'закат', 'бар': 'вечер' };

  function km(a, b) {
    const R = 6371, r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // Время в пути: дорога ≈ 1.35 × прямая, средняя скорость 25 км/ч в городе и 40 за городом, плюс 10 минут на ожидание
  function travelMin(a, b) {
    const d = km(a, b) * 1.35;
    const speed = d > 12 ? 40 : 25;
    return Math.round((d / speed) * 60 + 10);
  }

  // Режимы: bike / car - Grab, mbike / mcar - Maxim. Maxim по опыту Миши на 20-30% дешевле Grab, берём середину.
  const MAXIM = 0.75;
  const vehicle = mode => /car$/.test(mode) ? 'car' : 'bike';
  const isMaxim = mode => mode === 'mbike' || mode === 'mcar';
  const MODES = {
    bike: { label: 'Grab байк', short: 'байк' },
    car: { label: 'Grab машина', short: 'машина' },
    mbike: { label: 'Maxim байк', short: 'Maxim байк' },
    mcar: { label: 'Maxim машина', short: 'Maxim машина' },
  };

  // Grab: по скринам Миши от Panorama. Город ≈ 6 200 ₫ за км по прямой, минимум 13 000 ₫.
  // Машина ≈ байк × 3 в городе и × 3,8 на дальних поездках.
  // Цена со скрина Миши, если поездка из города к месту со скрином (поле grab: «байк 84 000 ₫, машина 320 000 ₫»)
  function fixedFare(p, mode) {
    if (!p || !p.grab || !/скрин/.test(p.grab)) return 0;
    const bike = p.grab.match(/(?:байк\s*)?(\d[\d\s]*)\s*₫/), car = p.grab.match(/машина\s*(\d[\d\s]*)\s*₫/);
    const n = m => m ? +m[1].replace(/\s/g, '') : 0;
    return mode === 'car' ? n(car) : n(bike);
  }
  function grab(a, b, mode) {
    const v = vehicle(mode);
    const fare = grabFare(a, b, v);
    return isMaxim(mode) ? Math.round(fare * MAXIM / 1000) * 1000 : fare;
  }
  function grabFare(a, b, mode) {
    const d = km(a, b);
    if (d > 6) {
      const inCity = km(a, CENTER) < 5 ? b : km(b, CENTER) < 5 ? a : null;
      const f = fixedFare(inCity, mode);
      if (f) return f;
    }
    if (d < 0.6) return 0; // пешком
    let bike = Math.max(13, Math.round(d * 6.2));
    if (d > 12) bike = Math.round(d * 5.1);
    const car = Math.round(bike * (d > 12 ? 3.8 : 3));
    return (mode === 'car' ? car : bike) * 1000;
  }

  // Старт дня: геопозиция (если в пределах Нячанга) или выбранный район
  function baseOf(quiz) {
    if (quiz && quiz.base === 'geo' && quiz.geo) return { lat: quiz.geo.lat, lng: quiz.geo.lng, label: 'Моя геопозиция' };
    return BASES[quiz && quiz.base] || Object.assign({ label: 'Центр' }, CENTER);
  }

  function slotOf(p) {
    const b = (p.best || DEFAULT_SLOT[p.cat] || 'любое').split(',')[0].trim();
    return SLOT[b] ?? 1;
  }
  function durOf(p) {
    const t = (p.time || '').toLowerCase();
    let m = t.match(/(\d+)\s*ч/);
    if (m) return +m[1] * 60;
    if (t.includes('полдня')) return 240;
    if (t.includes('несколько')) return 180;
    return DEFAULT_TIME[p.cat] || 60;
  }
  const isFar = p => p.zone === 'за городом';

  // Делим места на группы по близости: жадно, от самого дальнего от базы
  function clusters(items, n, base) {
    if (!items.length) return Array.from({ length: n }, () => []);
    const left = items.slice().sort((a, b) => km(base, b) - km(base, a));
    const seeds = [left.shift()];
    while (seeds.length < Math.min(n, items.length)) {
      let best = null, bestD = -1;
      for (const p of left) {
        const d = Math.min(...seeds.map(s => km(s, p)));
        if (d > bestD) { bestD = d; best = p; }
      }
      seeds.push(best); left.splice(left.indexOf(best), 1);
    }
    const groups = seeds.map(s => [s]);
    const cap = Math.ceil(items.length / n) + 1;
    for (const p of left) {
      const order = groups.map((g, i) => [i, km(g[0], p)]).sort((a, b) => a[1] - b[1]);
      const slot = order.find(([i]) => groups[i].length < cap) || order[0];
      groups[slot[0]].push(p);
    }
    while (groups.length < n) groups.push([]);
    return groups;
  }

  function nearest(from, pool, used) {
    let best = null, bd = Infinity;
    for (const p of pool) {
      if (used.has(p.id)) continue;
      const d = km(from, p);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  function pickMeal(kind, near, food, used, budget) {
    const ok = food.filter(p => {
      if (used.has(p.id)) return false;
      if (budget === 'эконом' && p.budget === 'дорого') return false;
      if (kind === 'breakfast') return p.cat === 'кофе' && p.img !== 'dessert';
      if (kind === 'lunch') return p.cat === 'еда';
      return p.cat === 'еда';
    });
    const liked = ok.filter(p => p._liked);
    return nearest(near, liked.length ? liked : ok, used) ;
  }

  /*
    places: все места города
    picks: { id: 'like' | 'must' }
    quiz: { days, pace, budget, transport, base, start }
  */
  function build(places, picks, quiz) {
    const days = Math.max(1, Math.min(10, quiz.days || 4));
    const base = baseOf(quiz);
    const mode = MODES[quiz.transport] ? quiz.transport : 'bike';
    const perDay = quiz.pace === 'active' ? 4 : 2;

    const all = places.map(p => Object.assign({}, p, { _liked: !!picks[p.id], _must: picks[p.id] === 'must' }));
    const chosen = all.filter(p => p._liked);
    const food = all.filter(p => FOOD.includes(p.cat));
    let sights = chosen.filter(p => !FOOD.includes(p.cat));
    const bars = chosen.filter(p => p.cat === 'бар');

    // Если мест мало - добираем из популярных по интересам (пока по категориям из анкеты)
    const need = perDay * days - (days > 1 ? 1 : 0);
    const added = [];
    if (sights.length < Math.min(need, 3 * days)) {
      const extra = all.filter(p => !p._liked && !FOOD.includes(p.cat) && (!quiz.cats || quiz.cats.includes(p.cat)))
        .sort((a, b) => km(base, a) - km(base, b));
      for (const p of extra) { if (sights.length >= need) break; sights.push(p); added.push(p.id); }
    }

    // Слишком много - обязательные вперёд, лишнее в «не влезло»
    sights.sort((a, b) => (b._must - a._must) || (b._liked - a._liked));
    const capacity = perDay * days - (days > 1 ? (perDay - 2) : 0);
    const overflow = sights.slice(capacity);
    sights = sights.slice(0, capacity);

    // Дальние выезды - каждый в свой день, не больше одного в день
    const far = sights.filter(isFar);
    const near = sights.filter(p => !isFar(p));
    const dayPlans = Array.from({ length: days }, (_, i) => ({ n: i + 1, items: [], far: null }));
    // день 1 лёгкий: дальние ставим со второго дня
    const farDays = dayPlans.slice(days > 1 ? 1 : 0);
    far.forEach((p, i) => {
      const d = farDays[i % farDays.length];
      if (!d.far) d.far = p; else overflow.push(p);
    });

    const openDays = dayPlans.filter(d => !d.far);
    const groups = clusters(near, Math.max(1, openDays.length || days), base);
    // самая близкая к базе группа - на день 1
    groups.sort((a, b) => (a.length ? km(base, a[0]) : 99) - (b.length ? km(base, b[0]) : 99));
    (openDays.length ? openDays : dayPlans).forEach((d, i) => { d.items = groups[i] || []; });
    // день 1 - не больше 2 точек, остальное двигаем дальше
    if (days > 1 && dayPlans[0].items.length > 2) {
      const extra = dayPlans[0].items.splice(2);
      extra.forEach(p => {
        const target = dayPlans.slice(1).sort((a, b) => (a.items.length + (a.far ? 2 : 0)) - (b.items.length + (b.far ? 2 : 0)))[0];
        target.items.push(p);
      });
    }
    // вечерние бары раскидываем по дням
    bars.forEach((b, i) => { dayPlans[(i + (days > 1 ? 1 : 0)) % days].bar = b; });

    const used = new Set(chosen.filter(p => !FOOD.includes(p.cat)).map(p => p.id));
    const out = dayPlans.map(d => schedule(d, base, food, used, quiz, mode));
    return { days: out, overflow: overflow.map(p => p.id), added, mode, base };
  }

  function orderBySlotAndDistance(items, start) {
    const bySlot = [[], [], [], []];
    items.forEach(p => bySlot[slotOf(p)].push(p));
    const order = []; let cur = start;
    for (const group of bySlot) {
      const pool = group.slice();
      while (pool.length) {
        pool.sort((a, b) => km(cur, a) - km(cur, b));
        const p = pool.shift(); order.push(p); cur = p;
      }
    }
    return order;
  }

  function schedule(d, base, food, used, quiz, mode) {
    const stops = [];
    let t = (quiz.pace === 'active' ? 8 * 60 : 9 * 60);
    let cur = base;
    const add = (p, kind) => {
      const travel = travelMin(cur, p);
      t += travel; t = Math.ceil(t / 5) * 5;
      if (p.hours) { const m = p.hours.match(/с\s*(\d{1,2}):(\d{2})/); if (m) t = Math.max(t, +m[1] * 60 + +m[2]); }
      const dur = kind ? (kind === 'breakfast' ? 50 : kind === 'lunch' ? 70 : 90) : durOf(p);
      stops.push({ id: p.id, kind: kind || 'sight', start: t, dur, travel, grab: grab(cur, p, mode), km: km(cur, p) });
      t += dur; cur = p; used.add(p.id);
    };

    // Обед: перед местом, если уже полдень или место съест обеденное время
    const lunchBefore = (p, done) => {
      if (done) return true;
      if (p && !(t >= 12 * 60 || (t >= 11 * 60 && t + durOf(p) > 13 * 60 + 30))) return false;
      const l = pickMeal('lunch', p || cur, food, used, quiz.budget);
      if (!l) return true;
      t = Math.max(t, 11 * 60 + 30); add(l, 'lunch'); return true;
    };

    let items = d.items.slice();
    if (d.far) {
      // выезд за город: рано утром, завтрак рядом с базой
      t = Math.min(t, 7 * 60 + 30);
      const b = pickMeal('breakfast', base, food, used, quiz.budget); if (b) add(b, 'breakfast');
      add(d.far);
      const rest = orderBySlotAndDistance(items, d.far);
      const l = pickMeal('lunch', d.far, food, used, quiz.budget);
      let lunchDone = false;
      if (l && km(d.far, l) < 15) { t = Math.max(t, 11 * 60 + 30); add(l, 'lunch'); lunchDone = true; }
      rest.forEach(p => { lunchDone = lunchBefore(p, lunchDone); add(p); });
      if (!lunchDone && rest.length) lunchBefore(null, false);
    } else {
      const ordered = orderBySlotAndDistance(items, base);
      const first = ordered[0] || base;
      const b = pickMeal('breakfast', first, food, used, quiz.budget); if (b) add(b, 'breakfast');
      let lunchDone = false;
      ordered.forEach(p => { lunchDone = lunchBefore(p, lunchDone); add(p); });
      if (!lunchDone) lunchBefore(null, false);
    }
    t = Math.max(t, 18 * 60 + 30);
    if (d.bar) add(d.bar);
    const dn = pickMeal('dinner', cur, food, used, quiz.budget); if (dn) add(dn, 'dinner');
    const grabTotal = stops.reduce((s, x) => s + x.grab, 0);
    return { n: d.n, stops, far: d.far ? d.far.id : null, grabTotal };
  }

  root.Route = { build, km, grab, travelMin, baseOf, BASES, CENTER, MODES, MAXIM };
  if (typeof module !== 'undefined') module.exports = root.Route;
})(typeof window !== 'undefined' ? window : globalThis);
