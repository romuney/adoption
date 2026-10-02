/* ============================================================================
   Макет 2.2: ДВЕ СИММЕТРИЧНЫЕ ВКЛАДКИ, у каждой свой каталог-руль.

   Вкладка «Отчёты»: слева каталог (отчёты · коллекции · владельцы) — клик
   по строке задаёт ОБЛАСТЬ. Справа переключатель: «Динамика» области или
   «Кто смотрит» — сводная таблица зрителей: группировка по людским разрезам
   (УС-3, УС-4, специализация, стрим, AD-группа, тим-лиды) или поимённо —
   поимённый список тоже умеет группироваться по разрезу, — и корзины
   частоты («сколько разных дней заходили») прямо в этой панели.
   Внизу — закрепляемость.

   Вкладка «Аудитория»: СВОЙ каталог слева (выбор независим от первой
   вкладки — там смотрят «вообще», здесь настраивают adoption). KPI с
   метрикой Adoption — долей целевой аудитории, зашедшей за год; воронка
   «ЦА → доступ → зашли → вернулись → регулярно», динамика охвата и
   «Кто из целевой аудитории» — той же формы, что «Кто смотрит»: разрезы
   или поимённо с сегментами.

   ПРАВИЛО БЕЗ ДУБЛЕЙ: каждый список на экране ровно один раз В РАМКАХ
   ВКЛАДКИ. Каталоги двух вкладок — это два независимых руля одного
   списка. Людские разрезы — в «Кто смотрит» и «Кто из ЦА». Частота —
   только в «Кто смотрит».

   ЛЮДСКАЯ ШИНА: клик по строке «Кто смотрит» (вкладка «Отчёты») сужает
   каталог и динамику до того, что смотрит эта публика — в бою это
   люди-фильтры куба, перезапрос, помечен ⟳. Всякое ⟳ честно подписано.
   ========================================================================== */
(function () {
  'use strict';

  const D = window.PA_DATA;
  const U = window.UI;
  const CH = window.CHARTS;

  /* ============================== Вкладки ================================ */
  const TABS = [
    { key: 'reports', label: 'Отчёты', fn: renderReports },
    { key: 'audience', label: 'Аудитория', fn: renderAudience },
  ];

  /* В разрезе чего каталог. Только отчётные разрезы: людские (УС,
     специализация) живут в «Кто смотрит» — правило без дублей. */
  const MODES = [
    { key: 'report',     label: 'Отчёты',    axis: 'rep', one: 'Отчёт' },
    { key: 'collection', label: 'Коллекции', axis: 'grp', one: 'Коллекция' },
    { key: 'owner',      label: 'Владельцы', axis: 'grp', one: 'Владелец' },
  ];
  const MODE = (k) => MODES.find((m) => m.key === k) || MODES[0];

  /* «Кто смотрит» — ВСЕГДА поимённый список зрителей области (решение
     владельца 2026-09-21: режим выбора не нужен). ГРУППИРОВКА списка —
     по людским разрезам;_heads даёт две группы (руководители/остальные),
     adgroup кладёт человека в каждую его группу. */
  const WHO_GROUPS = [
    { key: 'none', label: 'Без группировки' }, { key: 'lvl3', label: 'УС-3' },
    { key: 'lvl4', label: 'Департамент' }, { key: 'spec', label: 'Специализация' },
    { key: 'stream', label: 'Стрим' }, { key: 'adgroup', label: 'AD-группа' },
    { key: 'heads', label: 'Тим-лиды' },
  ];
  const WHO_LABEL = {};
  WHO_GROUPS.forEach((w) => { WHO_LABEL[w.key] = w.label; });
  const WHO_FLD = { lvl3: 'lvl3', lvl4: 'lvl4', spec: 'spec', stream: 'stream', adgroup: 'adgroup' };

  /* Корзины частоты по АКТИВНЫМ ДНЯМ — «сигаретка» над поимённым списком:
     числа считаются ПО СПИСКУ, поэтому клик и список всегда сходятся. */
  const FREQ_BINS = [
    { k: '1 день', min: 1, max: 1 }, { k: '2–3 дня', min: 2, max: 3 },
    { k: '4–7 дней', min: 4, max: 7 }, { k: '8–15 дней', min: 8, max: 15 },
    { k: '16+ дней', min: 16, max: 1e9 },
  ];
  const FREQ_COLORS = ['#c3e6f7', '#8fd0ea', '#5cc0ee', '#2ba8c6', '#0073a0'];
  const freqBinOf = (days) => FREQ_BINS.find((b) => days >= b.min && days <= b.max) || FREQ_BINS[0];

  /* Разрезы охвата на вкладке «Аудитория» — те же людские, что в data.js */
  const DIM_ORDER = ['lvl3', 'lvl4', 'stream', 'spec', 'adgroup', 'exp', 'it', 'hq'];
  const SEGMENTS = [
    { key: 'Постоянный',    plural: 'Постоянные',    color: CH.C.seg3, note: '8+ активных дней' },
    { key: 'Эпизодический', plural: 'Эпизодические', color: CH.C.seg2, note: '2–7 активных дней' },
    { key: 'Разовый',       plural: 'Разовые',       color: CH.C.seg1, note: 'ровно один день' },
    { key: 'Не заходил',    plural: 'Не заходили',   color: CH.C.seg0, note: 'доступ есть, визитов нет' },
    { key: 'Нет доступа',   plural: 'Нет доступа',   color: '#eceef1', note: 'под условия попал, но прав на отчёт нет', accessOnly: true },
  ];
  const DIM_HINT = {
    lvl3: 'Блок — третий уровень управленческой структуры. Самый частый способ очертить аудиторию: «отчёт для розницы».',
    lvl4: 'Департамент — четвёртый уровень. Нужен, когда отчёт делали не для блока целиком.',
    stream: 'Стрим — продуктовое направление; с управленческой структурой совпадает не всегда.',
    spec: 'Кем человек работает: аналитик, разработчик, руководитель. Отчёт часто делают под роль, а не под подразделение.',
    adgroup: 'Членство в AD-группе. Годится, когда нужная аудитория уже описана группой — пусть даже не той, которой роздан доступ к этому отчёту.',
    exp: 'Стаж в компании. Новички и старожилы пользуются отчётностью по-разному.',
    it: 'IT или не IT.',
    hq: 'Головной офис или сеть.',
  };

  /* ============================== Состояние ============================== */
  const S = {
    tab: 'reports',
    grain: 'd',
    mode: 'report',
    /* Выбор в каталоге: обычный клик ПЕРЕКЛЮЧАЕТ область на строку,
       Shift+клик ДОБАВЛЯЕТ строку к выбору (снимает повторно). По каждому
       разрезу свой список. У КАЖДОЙ вкладки свой руль: picks рулит
       вкладкой «Отчёты», audPicks — вкладкой «Аудитория». */
    picks: { report: [], collection: [], owner: [] },
    audMode: 'report',
    audPicks: { report: [], collection: [], owner: [] },
    rightView: 'dyn',              // правая панель «Отчётов»: dyn | who
    retView: 'cohort',
    viewsMode: 'total',
    ctBase: 'col',
    legOff: { new: false, react: false, ret: false },  // гашение ступеней стека пилюльками
    freqSel: null,                 // кросс-фильтр «как часто заходят» ⟳
    whoCut: 'none',                // группировка поимённого «Кто смотрит»
    whoQuery: '',                  // поиск в поимённом списке
    whoGrpClosed: {},              // свёрнутые группы (ключ → true)
    whoHeads: false,               // настройки «Кто смотрит»: только руководители
    whoExcl: [],                   // …и исключённые логины (не мешают в просмотрах)
    whoExQuery: '',
    repSort: { col: 'users', dir: -1 },
    repQuery: '',
    audRepSort: { col: 'users', dir: -1 },
    audRepQuery: '',
    /* Людская шина. В бое — колонки *_f куба; здесь — те же множества.
       login — клик по строке человека в «Кто смотрит» (в проде кубу нужна
       колонка логинов, см. Архитектуру). */
    filters: {
      published: true, actual: true, excludeOwners: true,
      emp: { lvl3: [], lvl4: [], stream: [], spec: [], adgroup: [], login: [], heads: false },
    },
    /* Вкладка «Аудитория»: целевая аудитория и её просмотр */
    audDef: { mode: 'access', filters: {}, draft: {} },
    _audCfg: false, _audDim: 'lvl3', _dimQuery: '',
    audCut: 'lvl3', audUnit: null, audSeg: null, audQuery: '',
    _dd: null,
  };

  const OV = D.ds_overview;
  const RP = D.ds_reports;

  const HAS_PREV = { d: true, w: true, m: false, q: false };
  const NO_PREV_WHY = 'В витрине 12 месяцев истории. Предыдущего периода такой же длины в ней нет, поэтому сравнивать не с чем.';

  /* ========================= Выборки из датасетов ========================= */
  const EMP_DIMS = ['stream', 'spec', 'adgroup', 'login'];
  const EMP_LABEL = {
    lvl3: 'Блок', lvl4: 'Департамент', stream: 'Стрим',
    spec: 'Специализация', adgroup: 'AD-группа', login: 'Человек',
  };
  function empOn() {
    const e = S.filters.emp;
    return !!(e.lvl3.length || e.lvl4.length || e.heads ||
      EMP_DIMS.some((k) => e[k].length));
  }
  const REP_DIMS = ['report', 'collection', 'owner'];
  /* Каталогов два («Отчёты» и «Аудитория»), у каждого свой набор условий.
     scope 'rep' — по умолчанию, как было. */
  const picksOf = (scope) => (scope === 'aud' ? S.audPicks : S.picks);
  const pickList = (k, scope) => (picksOf(scope)[k] || []);
  const pickCount = (scope) => MODES.reduce((a, m) => a + pickList(m.key, scope).length, 0);
  const hasPeople = () => empOn();
  /* Сколько людских условий активно — счётчик «выбрано: N» в «Кто смотрит». */
  const empSelN = () => {
    const e = S.filters.emp;
    return ['lvl3', 'lvl4'].concat(EMP_DIMS).reduce((a, k) => a + (e[k] ? e[k].length : 0), 0) + (e.heads ? 1 : 0);
  };

  /* Словарь людей по pid: population — массив, а строкам зрителей нужен
     доступ к человеку (AD-группы, ФИО). */
  const P_BY = {};
  D.population.forEach((p) => { P_BY[p.pid] = p; });
  const FIO_BY = {};
  D.population.forEach((p) => { FIO_BY[p.login] = p.fio; });

  function peopleKey() {
    return S.grain + '|' + JSON.stringify([S.filters.emp]);
  }

  /* Множество отчётов, которые смотрит публика (людская шина). */
  const _audSetCache = {};
  function audRepSet() {
    const key = peopleKey();
    if (_audSetCache[key]) return _audSetCache[key];
    const people = pickedPeople();
    const mp = {};
    people.forEach((p) => { mp[p.pid] = 1; });
    const set = {};
    RP.forEach((r) => {
      if (r.section !== 'report' || r.grain !== S.grain) return;
      const vis = D.visitorsOf([r.dashboard_id], S.grain);
      for (const pid in vis.set) {
        if (mp[pid]) { set[r.dashboard_id] = 1; break; }
      }
    });
    _audSetCache[key] = set;
    return set;
  }

  /* reportRowsBase — свитки качества, без людской шины: так «Кто смотрит»
     держит контекст дерева групп от собственных кликов (числа при этом
     остаются шина-калиброванными — см. whoAreaPeople/whoAreaPeopleNoBus). */
  function reportRowsBase() {
    const f = S.filters;
    return RP.filter((r) => r.section === 'report' && r.grain === S.grain)
      .filter((r) => (!f.published || r.published === 1))
      .filter((r) => (!f.actual || r.actual_flg === 1));
  }
  function reportRows() {
    let rows = reportRowsBase();
    if (hasPeople()) {
      const set = audRepSet();
      rows = rows.filter((r) => set[r.dashboard_id]);
    }
    return rows;
  }
  function reportById(id) {
    return RP.find((r) => r.section === 'report' && r.grain === S.grain && r.dashboard_id === id);
  }

  function pickedIds(scope, noBus) {
    let rows = noBus ? reportRowsBase() : reportRows();
    if (pickList('report', scope).length) {
      const set = {}; pickList('report', scope).forEach((id) => { set[id] = 1; });
      rows = rows.filter((r) => set[r.dashboard_id]);
    }
    if (pickList('collection', scope).length) rows = rows.filter((r) => pickList('collection', scope).indexOf(r.collection) >= 0);
    if (pickList('owner', scope).length) rows = rows.filter((r) => pickList('owner', scope).indexOf(r.owner_login) >= 0);
    return rows.map((r) => r.dashboard_id);
  }

  function pickedPeople() {
    if (!hasPeople()) return null;
    const e = S.filters.emp;
    return D.population.filter((p) =>
      (!e.lvl3.length || e.lvl3.indexOf(p.lvl3) >= 0) &&
      (!e.lvl4.length || e.lvl4.indexOf(p.lvl4) >= 0) &&
      EMP_DIMS.every((k) => !e[k].length || (k === 'adgroup'
        ? e[k].some((g) => D.inAdGroup(p, g))
        : e[k].indexOf(p[k]) >= 0)) &&
      (!e.heads || !!p.is_head));
  }

  function cutTitle() {
    const e = S.filters.emp;
    const parts = ['lvl3', 'lvl4'].concat(EMP_DIMS).filter((k) => e[k] && e[k].length).map((k) => {
      const v = e[k];
      const one = k === 'login' ? (FIO_BY[v[0]] || String(v[0])) : String(v[0]);
      return v.length === 1 ? one : EMP_LABEL[k].toLowerCase() + ': ' + v.length;
    });
    if (e.heads) parts.push('только тим-лиды');
    return parts.join(' · ') || 'выбранный срез';
  }

  const DEDUP = (n) => 1 / (1 + .16 * Math.log(1 + n));

  function cutShare(ids) {
    const people = pickedPeople();
    if (!people || !ids.length) return 1;
    const vis = D.visitorsOf(ids, S.grain);
    if (!vis.count) return 0;
    let n = 0;
    people.forEach((p) => { if (vis.set[p.pid]) n++; });
    return n / vis.count;
  }

  /* Область экрана = выбор каталога. scope 'rep' — вкладка «Отчёты»,
     'aud' — вкладка «Аудитория» (свой каталог). */
  function selectionOf(scope) {
    const ids = pickedIds(scope);
    const parts = MODES.filter((m) => pickList(m.key, scope).length).map((m) => {
      const v = pickList(m.key, scope);
      return v.length === 1 ? String(v[0]) : m.label.toLowerCase() + ': ' + v.length;
    });
    if (!pickCount(scope)) {
      if (empOn()) {
        return {
          kind: 'mix', ids,
          title: 'Все отчёты · ' + cutTitle(),
          sub: 'фильтр по сотрудникам ⟳ · на экране только их визиты',
        };
      }
      return {
        kind: 'all', ids, title: 'Все отчёты',
        sub: 'клик по строке каталога задаёт область экрана; условия накапливаются',
      };
    }
    const onlyRep = pickList('report', scope).length === 1 && pickCount(scope) === 1;
    if (onlyRep) {
      const r = reportById(pickList('report', scope)[0]);
      if (r) {
        return {
          kind: 'rep', report: r, ids: [r.dashboard_id], title: r.dashboard_nm,
          sub: 'владелец ' + r.owner_login + ' · ' + r.collection,
        };
      }
    }
    const onlyGrp = pickCount(scope) === 1 && (pickList('collection', scope).length === 1 || pickList('owner', scope).length === 1);
    if (onlyGrp) {
      const gk = pickList('collection', scope).length ? 'collection' : 'owner';
      const gv = pickList(gk, scope)[0];
      const g = RP.find((r) => r.section === 'gkpi' && r.grain === S.grain && r.group_key === gk && r.group_val === gv);
      return {
        kind: 'grp', group: g, gk, gv, ids, title: gv,
        sub: MODE(gk).one.toLowerCase() + ' · ' + U.nf(ids.length) + ' ' +
          U.plural(ids.length, 'отчёт', 'отчёта', 'отчётов'),
      };
    }
    return {
      kind: 'mix', ids,
      title: parts.join(' · '),
      sub: (hasPeople() ? 'пересечение с людьми ⟳ · ' : '') +
        U.nf(ids.length) + ' ' + U.plural(ids.length, 'отчёт', 'отчёта', 'отчётов') + ' в выборе',
    };
  }
  const selection = () => selectionOf('rep');

  /* --- Динамика по бакетам ----------------------------------------------- */
  function series() {
    const sl = selection();
    let rows;
    if (sl.kind === 'all') {
      rows = OV.filter((r) => r.section === 'ts' && r.grain === S.grain && r.cut_key === 'all');
    } else if (sl.kind === 'rep') {
      rows = RP.filter((r) => r.section === 'rts' && r.grain === S.grain && r.dashboard_id === sl.ids[0]);
    } else if (sl.kind === 'grp') {
      rows = RP.filter((r) => r.section === 'gts' && r.grain === S.grain &&
        r.group_key === sl.gk && r.group_val === sl.gv);
    } else {
      const set = {}; sl.ids.forEach((id) => { set[id] = 1; });
      const d = DEDUP(sl.ids.length || 1);
      const by = {};
      RP.forEach((r) => {
        if (r.section !== 'rts' || r.grain !== S.grain || !set[r.dashboard_id]) return;
        const t = (by[r.bucket] = by[r.bucket] || { bucket: r.bucket, users: 0, new_users: 0, react_users: 0, ret_users: 0, views: 0 });
        t.users += r.users; t.new_users += r.new_users; t.react_users += r.react_users;
        t.ret_users += r.ret_users; t.views += r.views;
      });
      rows = Object.values(by).map((t) => ({
        bucket: t.bucket, views: t.views,
        users: Math.round(t.users * d), new_users: Math.round(t.new_users * d),
        react_users: Math.round(t.react_users * d), ret_users: Math.round(t.ret_users * d),
      }));
    }
    rows = rows.slice().sort((a, b) => a.bucket - b.bucket);
    const k = hasPeople() ? cutShare(sl.ids) : 1;
    if (k === 1) return rows;
    return rows.map((r) => ({
      bucket: r.bucket,
      users: Math.round(r.users * k), new_users: Math.round(r.new_users * k),
      react_users: Math.round(r.react_users * k), ret_users: Math.round(r.ret_users * k),
      views: Math.round(r.views * k),
    }));
  }

  /* --- Итоги за период ---------------------------------------------------- */
  function kpiRow() {
    const sl = selection();
    let k;
    if (sl.kind === 'all') {
      k = OV.find((r) => r.section === 'kpi' && r.grain === S.grain && r.cut_key === 'all');
    } else if (sl.kind === 'rep') {
      k = reportById(sl.ids[0]);
    } else if (sl.kind === 'grp' && sl.group) {
      k = sl.group;
    } else {
      const set = {}; sl.ids.forEach((id) => { set[id] = 1; });
      const d = DEDUP(sl.ids.length || 1);
      const reps = RP.filter((r) => r.section === 'report' && r.grain === S.grain && set[r.dashboard_id]);
      const S_ = (f) => reps.reduce((a, b) => a + (b[f] || 0), 0);
      k = {
        users: Math.round(S_('users') * d), users_prev: Math.round(S_('users_prev') * d),
        views: S_('views'), views_prev: S_('views_prev'),
        new_users: Math.round(S_('new_users') * d), new_users_prev: Math.round(S_('new_users_prev') * d),
        regular_users: Math.round(S_('regular_users') * d), regular_users_prev: Math.round(S_('regular_users_prev') * d),
        sleeping_users: Math.round(S_('sleeping_users') * d),
        reports: reps.length,
      };
    }
    if (!k) return k;
    const sh = hasPeople() ? cutShare(sl.ids) : 1;
    if (sh === 1) return k;
    const scale = (v) => (v == null ? v : Math.round(v * sh));
    return Object.assign({}, k, {
      users: scale(k.users), users_prev: scale(k.users_prev),
      views: scale(k.views), views_prev: scale(k.views_prev),
      new_users: scale(k.new_users), new_users_prev: scale(k.new_users_prev),
      regular_users: scale(k.regular_users), regular_users_prev: scale(k.regular_users_prev),
      sleeping_users: scale(k.sleeping_users),
    });
  }

  /* --- MAU ---------------------------------------------------------------- */
  function mauRow() {
    const sl = selection();
    let m;
    if (sl.kind === 'all') {
      m = OV.find((r) => r.section === 'mau' && r.cut_key === 'all');
    } else if (sl.kind === 'rep') {
      m = RP.find((r) => r.section === 'rmau' && r.dashboard_id === sl.ids[0]);
    } else if (sl.kind === 'grp') {
      m = RP.find((r) => r.section === 'gmau' && r.group_key === sl.gk && r.group_val === sl.gv);
    } else {
      const set = {}; sl.ids.forEach((id) => { set[id] = 1; });
      const d = DEDUP(sl.ids.length || 1);
      const rows = RP.filter((r) => r.section === 'rmau' && set[r.dashboard_id]);
      if (!rows.length) return null;
      const S_ = (f) => rows.reduce((a, b) => a + (b[f] || 0), 0);
      m = { users: Math.round(S_('users') * d), users_prev: Math.round(S_('users_prev') * d) };
    }
    if (!m) return m;
    const sh = hasPeople() ? cutShare(sl.ids) : 1;
    if (sh === 1) return m;
    return Object.assign({}, m, {
      users: Math.round(m.users * sh),
      users_prev: m.users_prev == null ? m.users_prev : Math.round(m.users_prev * sh),
    });
  }

  /* --- Частота визитов ---------------------------------------------------- */
  function freqRows() {
    const sl = selection();
    const pick = (rows) => D.FREQ.map((fb) => ({
      bucket: fb, users: rows.filter((r) => r.freq_bucket === fb).reduce((a, b) => a + b.users, 0),
    }));
    let out;
    if (sl.kind === 'all') {
      out = pick(OV.filter((r) => r.section === 'freq' && r.grain === S.grain && r.cut_key === 'all'));
    } else if (sl.kind === 'rep') {
      out = pick(RP.filter((r) => r.section === 'rfreq' && r.grain === S.grain && r.dashboard_id === sl.ids[0]));
    } else if (sl.kind === 'grp') {
      out = pick(RP.filter((r) => r.section === 'gfreq' && r.grain === S.grain &&
        r.group_key === sl.gk && r.group_val === sl.gv));
    } else {
      const set = {}; sl.ids.forEach((id) => { set[id] = 1; });
      const d = DEDUP(sl.ids.length || 1);
      const raw = pick(RP.filter((r) => r.section === 'rfreq' && r.grain === S.grain && set[r.dashboard_id]));
      out = raw.map((r) => ({ bucket: r.bucket, users: Math.round(r.users * d) }));
    }
    const sh = hasPeople() ? cutShare(sl.ids) : 1;
    return sh === 1 ? out : out.map((r) => ({ bucket: r.bucket, users: Math.round(r.users * sh) }));
  }

  /* --- Когорты ------------------------------------------------------------ */
  function cohortRows() {
    const sl = selection();
    return sl.kind === 'rep' ? D.reportCohorts(sl.ids[0]) : D.globalCohorts();
  }

  /* --- Кросс-фильтр «как часто заходят» ⟳ --------------------------------- */
  const FREQ_DAYS = { '1 день': 1, '2–3 дня': 2.5, '4–7 дней': 5.5, '8–15 дней': 11.5, '16+ дней': 21 };
  const REGULAR_FREQ = { '8–15 дней': 1, '16+ дней': 1 };

  function freqPresence(bucketName, nBuckets) {
    const days = FREQ_DAYS[bucketName] || 1;
    return Math.max(0.02, Math.min(1, days / Math.max(1, nBuckets)));
  }

  function freqSlice(ts, k) {
    if (!S.freqSel || !k || !ts.length) return { ts, k, sliced: false };
    const fr = freqRows();
    const total = fr.reduce((a, b) => a + b.users, 0);
    const mine = fr.find((r) => r.bucket === S.freqSel);
    if (!mine || !total) return { ts, k, sliced: false };

    const n = ts.length;
    const share = mine.users / total;
    const pres = freqPresence(S.freqSel, n);
    const sumU = ts.reduce((a, b) => a + b.users, 0) || 1;
    const sumNew = ts.reduce((a, b) => a + b.new_users, 0) || 1;
    const uScale = (mine.users * pres * n) / sumU;
    const newTarget = Math.round((k.new_users || 0) * share);
    const nScale = newTarget / sumNew;
    const vBoost = 1 + (FREQ_DAYS[S.freqSel] - 1) / 22;

    const rows = ts.map((r) => {
      const u = Math.max(0, Math.min(r.users, Math.round(r.users * uScale)));
      const nu = Math.min(u, Math.round(r.new_users * nScale));
      const ret = Math.min(u - nu, Math.round(u * pres));
      return Object.assign({}, r, {
        users: u, new_users: nu, ret_users: ret, react_users: Math.max(0, u - nu - ret),
        views: Math.round(u * (r.users ? r.views / r.users : 0) * vBoost),
      });
    });
    const k2 = Object.assign({}, k, {
      users: mine.users, users_prev: null,
      views: rows.reduce((a, b) => a + b.views, 0), views_prev: null,
      new_users: newTarget, new_users_prev: null,
      regular_users: REGULAR_FREQ[S.freqSel] ? mine.users : 0, regular_users_prev: null,
      sleeping_users: null,
      freq_share: share * 100,
    });
    return { ts: rows, k: k2, sliced: true };
  }

  /* Средняя кривая: складываем числители и знаменатели по всем когортам. */
  function retentionPoints(rows) {
    const byAge = {};
    rows.forEach((c) => c.cells.forEach((x) => {
      if (x.partial) return;
      const a = (byAge[x.age] = byAge[x.age] || { age: x.age, num: 0, den: 0, cohorts: 0 });
      a.num += x.active; a.den += c.size; a.cohorts++;
    }));
    return Object.values(byAge).filter((a) => a.cohorts >= 2)
      .map((a) => ({ age: a.age, pct: a.den ? a.num / a.den * 100 : 0, cohorts: a.cohorts }))
      .sort((a, b) => a.age - b.age);
  }

  /* ========================== Правила наблюдений ========================= */
  function obsMain(kIn) {
    const k = kIn || kpiRow(); const out = []; const sl = selection();
    if (!k) return out;
    const dU = k.users_prev ? (k.users / k.users_prev - 1) * 100 : null;
    const shNew = k.users ? k.new_users / k.users * 100 : 0;
    const shReg = k.users ? k.regular_users / k.users * 100 : 0;
    const shSleep = k.users && k.sleeping_users != null ? k.sleeping_users / k.users * 100 : 0;
    const what = sl.kind === 'all' ? 'В Proteus' : ('«' + sl.title + '»');

    if (dU != null && Math.abs(dU) >= 10) {
      out.push({
        sev: dU > 0 ? 'good' : 'high',
        lead: 'Пользователей ' + (dU > 0 ? 'больше' : 'меньше') + ' на ' + U.pct(Math.abs(dU)) + ' ' + U.prevPeriodLabel(S.grain),
        body: U.esc(what) + ': за период <b>' + U.nf(k.users) + '</b> пользователей против <b>' + U.nf(k.users_prev) +
          '</b> в предыдущем — изменение <b>' + U.signed(dU, 1, '%') + '</b>.',
        rule: 'изменение к предыдущему периоду ≥10%',
      });
    }
    if (shNew >= 22) {
      out.push({
        sev: 'good',
        lead: 'Новые дают ' + U.pct(shNew) + ' всей аудитории',
        body: 'Из <b>' + U.nf(k.users) + '</b> пользователей <b>' + U.nf(k.new_users) + '</b> пришли впервые. ' +
          'Рост идёт за счёт притока, а не за счёт того, что прежние стали ходить чаще.',
        rule: 'доля новых ≥22%',
      });
    }
    if (shSleep >= 15) {
      out.push({
        sev: 'mid',
        lead: U.nf(k.sleeping_users) + ' ' + U.plural(k.sleeping_users, 'пользователь', 'пользователя', 'пользователей') +
          ' ' + U.plural(k.sleeping_users, 'не заходил', 'не заходили', 'не заходили') + ' больше 30 дней',
        body: '<b>' + U.nf(k.sleeping_users) + '</b> человек (<b>' + U.pct(shSleep) + '</b> аудитории) не открывали ничего ' +
          'более 30 дней. Это те, кого уже привели — и потеряли.',
        rule: 'доля не заходивших >30 дней ≥15%',
      });
    }
    if (shReg < 25) {
      out.push({
        sev: 'mid',
        lead: 'Постоянных пользователей ' + U.pct(shReg) + ' — меньше четверти',
        body: 'Только <b>' + U.nf(k.regular_users) + '</b> человек заходили 8 и более дней за период. Остальные — эпизодически.',
        rule: 'доля постоянных <25%',
      });
    }
    if (sl.kind === 'rep' && sl.report.last_view_days >= 14) {
      out.push({
        sev: 'high',
        lead: 'Отчёт не открывали ' + U.days(sl.report.last_view_days),
        body: 'Последний просмотр «' + U.esc(sl.report.dashboard_nm) + '» был <b>' + U.days(sl.report.last_view_days) +
          '</b> назад, при том что отчёт опубликован и помечен актуальным.',
        rule: 'с последнего просмотра прошло ≥14 дней',
      });
    }
    const ord = { high: 0, mid: 1, good: 2, none: 3 };
    return out.sort((a, b) => ord[a.sev] - ord[b.sev]);
  }

  const SRV = '<span class="info" data-tip="' + U.esc(U.tipHtml({
    title: 'Пересчёт', text: 'Этот фильтр меняет SQL-запрос: комбинация атрибутов не помещается в предрасчёт. Остальные переключатели считаются в браузере мгновенно.',
  })) + '" aria-label="Требует пересчёта">⟳</span>';

  /* ======================================================================
     ЗОНЫ И ГРАФИКИ: экран собран зонами, рендер переписывает только
     изменившиеся, графики живут в своих контейнерах с подписью данных.
     ==================================================================== */
  let QUEUE = [];
  const INSTANCES = {};
  let ZONE = 'z';
  let ZN = 0;

  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  function chart(cls, optFn, sigData) {
    const id = 'ch-' + ZONE + '-' + (ZN++);
    QUEUE.push({ id, optFn });
    const sig = sigData == null ? '' : ' data-sig="' + hash(JSON.stringify(sigData)) + '"';
    return '<div class="chart ' + cls + '" id="' + id + '"' + sig + '></div>';
  }

  /* SVG-чарт (воронка): тот же паттерн, что у ECharts-контейнеров, но
     внутрь кладётся строка SVG. */
  function svgChart(cls, drawFn, sigData) {
    const id = 'ch-' + ZONE + '-' + (ZN++);
    QUEUE.push({ id, drawFn });
    const sig = sigData == null ? '' : ' data-sig="' + hash(JSON.stringify(sigData)) + '"';
    return '<div class="chart ' + cls + '" id="' + id + '"' + sig + '></div>';
  }

  function zone(id, fn) {
    ZONE = id; ZN = 0;
    return { id, html: fn() };
  }
  const group = (cls, zones) => ({ group: cls, zones });

  function paint(items) {
    const view = document.getElementById('view');
    const flat = [];
    const skeleton = items.map((it) => {
      if (!it.group) { flat.push(it); return '<div class="zone" id="z-' + it.id + '"></div>'; }
      it.zones.forEach((z) => flat.push(z));
      return '<div class="' + it.group + '">' +
        it.zones.map((z) => '<div class="zone" id="z-' + z.id + '"></div>').join('') + '</div>';
    }).join('');
    const want = items.map((it) => (it.group ? it.group + '(' + it.zones.map((z) => z.id).join(',') + ')' : it.id)).join('|');

    if (view.dataset.zones !== want) {
      view.innerHTML = skeleton;
      view.dataset.zones = want;
    }
    flat.forEach((z) => {
      const el = document.getElementById('z-' + z.id);
      if (!el) return;
      const sig = z.html.length + ':' + z.html;
      if (el.dataset.sig === sig) return;
      el.innerHTML = z.html;
      el.dataset.sig = sig;
    });
  }

  function mountCharts() {
    Object.keys(INSTANCES).forEach((id) => {
      const rec = INSTANCES[id];
      if (rec.el === document.getElementById(id)) return;
      try { rec.inst.dispose(); } catch (e) { /* уже снят */ }
      delete INSTANCES[id];
    });
    QUEUE.forEach((q) => {
      if (INSTANCES[q.id]) return;
      const el = document.getElementById(q.id);
      if (!el) return;
      if (q.optFn) {
        const inst = echarts.init(el, null, { renderer: 'canvas' });
        inst.setOption(q.optFn(el.clientWidth, el.clientHeight));
        INSTANCES[q.id] = { inst, el };
      } else if (q.drawFn) {
        el.innerHTML = q.drawFn(el.clientWidth, el.clientHeight);
        INSTANCES[q.id] = { inst: { dispose() {}, resize() {} }, el };
      }
    });
    QUEUE = [];
  }
  addEventListener('resize', () => Object.keys(INSTANCES).forEach((id) => {
    const rec = INSTANCES[id];
    try { rec.inst.resize(); } catch (e) { /* снят */ }
  }));

  /* ======================================================================
     ПОЛОСКА — период, опции, чипы обеих шин, сброс
     ==================================================================== */
  /* Чипы обеих шин кросс-фильтров. Живут В У САМОГО контента (строка под
     «Что видно в данных», над каталогом и динамикой): полоска сверху при
     скролле уезжает с глаз, а условия обязаны быть перед глазами — рядом с
     тем, что они фильтруют. Строка рендерится ВСЕГДА, пустая занимает те же
     пиксели — вёрстка не прыгает при появлении условий. */
  function chipsAll() {
    const f = S.filters;
    const chips = [];
    /* Условия каталога показываются чипами активной вкладки: у «Отчётов» и
       «Аудитории» выборы независимы, смешивать их нельзя. */
    const chipScope = S.tab === 'audience' ? 'aud' : 'rep';
    MODES.forEach((m) => pickList(m.key, chipScope).forEach((v) => {
      const lbl = m.key === 'report' ? ((reportById(v) || {}).dashboard_nm || v) : v;
      chips.push(U.chip(m.one + ': ' + lbl, (chipScope === 'aud' ? 'audpick' : 'pick') + ':' + m.key + ':' + v));
    }));
    if (S.freqSel) chips.push(U.chip('Частота: ' + S.freqSel, 'freqSel'));
    const fchip = (key, one, arr) => {
      if (!arr.length) return;
      const lbl = arr.length > 1 ? one + ': ' + arr.length
        : (String(arr[0]).toLowerCase().indexOf(one.toLowerCase()) === 0 ? arr[0] : one + ': ' + arr[0]);
      chips.push(U.chip(lbl, 'flt:' + key));
    };
    const emp = f.emp;
    fchip('emp.lvl3', EMP_LABEL.lvl3, emp.lvl3);
    fchip('emp.lvl4', EMP_LABEL.lvl4, emp.lvl4);
    EMP_DIMS.forEach((k) => {
      if (k === 'login') {
        /* чип человека подписываем ФИО, а не логином */
        if (!emp.login.length) return;
        chips.push(U.chip(emp.login.length > 1
          ? 'Люди: ' + emp.login.length
          : 'Человек: ' + (FIO_BY[emp.login[0]] || emp.login[0]), 'flt:emp.login'));
        return;
      }
      fchip('emp.' + k, EMP_LABEL[k], emp[k]);
    });
    if (emp.heads) chips.push(U.chip('Только тим-лиды', 'flt:emp.heads'));
    if (!f.published) chips.push(U.chip('Включая неопубликованные', 'published'));
    if (!f.actual) chips.push(U.chip('Включая неактуальные', 'actual'));
    if (!f.excludeOwners) chips.push(U.chip('Владельцы в просмотрах', 'excludeOwners'));
    return chips;
  }

  function ctxChips() {
    const chips = chipsAll();
    return '<div class="ctx-row">' +
      '<span class="ctx-l">Фильтры</span>' +
      (chips.length
        ? '<div class="chips ctx-chips">' + chips.join('') + '</div>' +
          '<button class="btn ghost xs" id="ctxReset"' +
            U.tip({ text: 'Снимет условия обеих шин и выбор обоих каталогов; период останется.' }) + '>Сбросить</button>'
        : '<span class="ctx-hint">клик по строке каталога, группе «Кто смотрит» или корзине частоты добавит условия сюда</span>') +
      '</div>';
  }

  function strip() {
    return '<div class="strip">' +
      '<div class="strip-seg" role="group" aria-label="Период">' +
        Object.keys(D.GRAINS).map((g) =>
          '<button data-grain="' + g + '"' + (g === S.grain ? ' class="on"' : '') + '>' +
          D.GRAINS[g].label + '</button>').join('') +
      '</div>' +
      optsPop() +
      '<span class="strip-hint">активные условия — чипами над каталогом</span>' +
      '<span class="sp"></span>' +
      '<button class="btn ghost" id="fltReset">Сбросить всё</button>' +
      '</div>';
  }

  function optsPop() {
    const f = S.filters;
    const open = S._dd === 'opts';
    const sw = (key, label, on, hint) =>
      '<label class="swt"><input type="checkbox" data-f="' + key + '"' + (on ? ' checked' : '') + '><span>' +
      U.esc(label) + (hint ? ' <span class="info"' + U.tip({ text: hint }) + '>i</span>' : '') + '</span></label>';
    return '<div class="opts' + (open ? ' open' : '') + '">' +
      '<button class="opts-trg" data-ddtoggle="opts" aria-expanded="' + open + '"' +
        U.tip({ title: 'Опции', text: 'Свитки качества отчётов. Период — слева; фильтры по людям — кликами по строкам «Кто смотрит»; отчётные условия — выбором в каталоге.' }) + '>' +
        'Опции <span class="st-c" aria-hidden="true">▾</span></button>' +
      (open
        ? '<div class="opts-pop">' +
            sw('published', 'Только опубликованные', f.published) +
            sw('actual', 'Только актуальные', f.actual) +
            sw('excludeOwners', 'Исключить владельцев из просмотров', f.excludeOwners,
              'Владелец открывает свой отчёт при каждой правке — его визиты завышают аудиторию.') +
          '</div>'
        : '') +
      '</div>';
  }

  /* ======================================================================
     КАТАЛОГ — один компонент, две копии: «Отчёты» и «Аудитория».
     scope определяет, в чьё состояние пишутся клики (data-catscope).
     ==================================================================== */
  const catMode = (scope) => (scope === 'aud' ? S.audMode : S.mode);
  const catSort = (scope) => (scope === 'aud' ? S.audRepSort : S.repSort);
  const catQuery = (scope) => (scope === 'aud' ? S.audRepQuery : S.repQuery);
  const catScopeAttr = (scope) => (scope === 'aud' ? ' data-catscope="aud"' : '');

  function cutBar(scope) {
    const mode = catMode(scope);
    return '<div class="cutbar">' +
      '<span class="cb-l">В разрезе</span>' +
      '<div class="sub-tabs">' + MODES.map((m) => {
        const n = pickList(m.key, scope).length;
        return '<button class="sub-tab' + (m.key === mode ? ' active' : '') + (n ? ' has' : '') +
          '" data-mode="' + m.key + '"' + catScopeAttr(scope) +
          (n ? U.tip({ text: n + ' ' + U.plural(n, 'условие', 'условия', 'условий') + ' в этом разрезе' }) : '') + '>' +
          U.esc(m.label) + (n ? '<span class="sub-cnt">' + n + '</span>' : '') + '</button>';
      }).join('') + '</div>' +
      '</div>';
  }

  const matchQ = (txt, scope) => {
    const q = catQuery(scope);
    return !q || String(txt).toLowerCase().indexOf(q.toLowerCase()) >= 0;
  };

  function reportTable(scope) {
    const rows = reportRows()
      .filter((r) => matchQ(r.dashboard_nm, scope) || matchQ(r.collection, scope) || matchQ(r.owner_login, scope));
    const sort = catSort(scope);
    const sorted = rows.slice().sort((a, b) => (a[sort.col] > b[sort.col] ? 1 : -1) * sort.dir);
    const picked = pickList('report', scope);
    const isSel = (id) => picked.indexOf(id) >= 0;

    const th = (col, label, hint) => '<th data-sort="' + col + '"' + catScopeAttr(scope) +
      (sort.col === col ? ' class="on"' : '') +
      (hint ? U.tip(hint) : '') + '>' + U.esc(label) + '<span class="sa">' + (sort.dir < 0 ? '▼' : '▲') + '</span></th>';

    if (!sorted.length) {
      return '<div class="empty" style="box-shadow:none"><b>Ничего не найдено</b>Снимите часть условий в полоске сверху или очистите поиск.</div>';
    }
    return '<table class="ptable dense sortable reps"><thead><tr>' +
      '<th class="txt" data-sort="dashboard_nm"' + catScopeAttr(scope) + '>Отчёт<span class="sa">▲</span></th>' +
      th('users', 'Польз.') + th('views', 'Просм.') +
      th('regular_users', 'Пост.', { text: 'Доля тех, кто заходил в отчёт 8+ дней за период' }) +
      th('last_view_days', 'Тишина', { text: 'Дней с последнего просмотра' }) +
      '</tr></thead><tbody>' +
      sorted.map((r) => '<tr class="urow' + (isSel(r.dashboard_id) ? ' sel' : '') + '"' +
        ' data-rep="' + r.dashboard_id + '"' + catScopeAttr(scope) +
        ' tabindex="0" role="button" aria-pressed="' + isSel(r.dashboard_id) + '"' +
        U.tip({
          title: r.dashboard_nm,
          rows: [
            { label: 'Пользователи', value: U.nf(r.users), color: CH.C.ret },
            { label: 'Просмотры', value: U.nf(r.views), dash: true, color: CH.C.bench },
            { label: 'На пользователя', value: U.nf(r.views_per_user, 1) },
          ],
          note: 'создан ' + U.fmtDate(r.created_dt),
        }) + '>' +
        '<td class="txt">' + U.esc(r.dashboard_nm) +
          '<span class="unit-sub">' +
            (r.certified_by ? '<i class="rflag cert"' + U.tip({ title: 'Сертифицирован', text: r.certified_by }) + '>✓</i>' : '') +
            (r.is_new ? '<i class="rflag new"' + U.tip({ text: 'Создан меньше 90 дней назад' }) + '>новый</i>' : '') +
            U.esc(r.owner_login) + ' · ' + U.esc(r.collection) + '</span></td>' +
        '<td class="lead">' + U.nf(r.users) + '</td>' +
        '<td>' + U.compact(r.views) + '</td>' +
        '<td>' + U.pct(r.users ? r.regular_users / r.users * 100 : 0, 0) + '</td>' +
        '<td>' + (r.last_view_days === 0 ? '<span class="mut">вчера</span>' : U.days(r.last_view_days)) + '</td>' +
        '</tr>').join('') +
      '</tbody></table>';
  }

  const emptyRows = () => '<div class="empty" style="box-shadow:none"><b>Ничего не найдено</b>' +
    'Очистите поиск или снимите часть условий в полоске сверху.</div>';

  function groupTable(scope) {
    const gk = catMode(scope);
    const rows = RP.filter((r) => r.section === 'gkpi' && r.grain === S.grain && r.group_key === gk)
      .map((r) => ({
        key: r.group_val, label: r.group_val,
        reports: r.reports, users: r.users, views: r.views, regular: r.regular_users,
      }))
      .filter((r) => matchQ(r.label, scope))
      .sort((a, b) => b.users - a.users);
    const reps = reportRows();
    const dedup = (n) => 1 / (1 + .16 * Math.log(1 + n));
    const d = dedup(reps.length || 1);
    const sum = (f) => Math.round(reps.reduce((a, b) => a + b[f], 0) * d);
    const totUsers = sum('users');
    if (!rows.length) return emptyRows();
    return U.barTable({
      cutKey: gk, selected: pickList(gk, scope), extraAttr: catScopeAttr(scope),
      firstH: MODE(gk).one, firstW: '34%', colW: '15%', barH: 'Доля пользователей',
      barClass: 'c-rep', dense: true,
      cols: [
        { label: 'Отчётов' },
        { label: 'Польз.', hint: { text: 'Уникальные пользователи группы за период' } },
        { label: 'Просм.' },
      ],
      total: {
        cells: [U.nf(reps.length), U.nf(totUsers),
          U.compact(reps.reduce((a, b) => a + b.views, 0))],
        tip: {
          title: 'ИТОГО',
          text: 'Пользователи в ИТОГО — уникальные по всей выборке, а не сумма строк: ' +
            'один человек, открывший отчёты двух коллекций, посчитан один раз.',
        },
      },
      rows: rows.map((r) => ({
        key: r.key, label: r.label,
        cells: [U.nf(r.reports), U.nf(r.users), U.compact(r.views)],
        bar: r.users,
        tip: {
          title: r.label,
          rows: [{ label: 'Пользователи', value: U.nf(r.users), color: CH.C.ret },
            { label: 'Просмотры', value: U.compact(r.views), dash: true, color: CH.C.bench },
            { label: 'Постоянные', value: U.pct(r.users ? r.regular / r.users * 100 : 0, 0) }],
        },
      })),
      note: 'Пользователи группы — <b>уникальные</b>: один человек, открывший три отчёта коллекции, ' +
        'считается один раз, поэтому строки в ИТОГО не складываются. Просмотры складываются.',
    });
  }

  /* ======================================================================
     «КТО СМОТРИТ» — правая панель вкладки «Отчёты»: сводная по людским
     разрезам или поимённо, частота — здесь же.
     ==================================================================== */
  const _arowCache = {};
  function areaRows(ids) {
    const key = S.grain + '|' + ids.join(',');
    if (!_arowCache[key]) _arowCache[key] = D.audienceRows(ids, D.population, S.grain);
    return _arowCache[key];
  }

  /* Поимённая детализация зрителей области. whoAreaPeople — все зрители
     (сигаретка частоты считает по ним, до поиска и корзины); whoPeople —
     видимый список: корзина частоты + поиск + топ-60 по активным дням. */
  function whoAreaPeople() {
    const sl = selection();
    const rows = areaRows(sl.ids).filter((r) => r.came);
    const ppl = hasPeople() ? pickedPeople() : null;
    if (!ppl) return rows;
    const mp = {};
    ppl.forEach((p) => { mp[p.pid] = 1; });
    return rows.filter((r) => mp[r.pid]);
  }
  /* Контекст дерева групп: люди области БЕЗ людской шины. Принцип тот же,
     что у сигаретки частоты: селектор держит весь контекст, содержимое
     сужается. Без этого клик по группе схлопывал дерево до самой себя —
     переключить выбор становилось негде (паттерн кросс-фильтров BI:
     источник себя не фильтрует, несвязанное гаснет, а не исчезает). */
  function whoAreaPeopleNoBus() {
    const ids = pickedIds('rep', true);
    return areaRows(ids).filter((r) => r.came);
  }
  function whoPeople() {
    const q = S.whoQuery.toLowerCase();
    return whoAreaPeople()
      .filter((r) => !S.freqSel || freqBinOf(r.active_days || 0).k === S.freqSel)
      .filter((r) => !q || (r.fio + ' ' + r.login).toLowerCase().indexOf(q) >= 0)
      .sort((a, b) => b.active_days - a.active_days)
      .slice(0, 60);
  }

  /* Строка поимённого списка — одна на «Кто смотрит» и «Кто из ЦА»:
     вёрстка совпадает, отличается только состав сегментов. indented —
     строка внутри группы дерева: сдвинута правее, иерархия читается.
     pickable — строка пишет в людскую шину («Кто смотрит»); «Кто из ЦА»
     пока без кликов (хвост на следующий раунд). */
  const SEG_CHIP = { 'Постоянный': 'good', 'Эпизодический': 'note', 'Разовый': 'neutral', 'Не заходил': 'bad', 'Нет доступа': 'warn' };
  function personRow(p, indented, deep, pickable) {
    const on = !!pickable && S.filters.emp.login.indexOf(p.login) >= 0;
    return '<tr class="' + (indented ? 'grp-child' + (deep ? ' deep' : '') : 'plain') +
      (pickable ? ' pk' : '') + (on ? ' sel' : '') + '"' +
      (pickable ? ' data-who="' + U.esc(p.login) + '" data-whocut="login" tabindex="0" role="button" aria-pressed="' + on + '"' : '') +
      U.tip({
        title: p.fio,
        rows: [
          { label: 'Активных дней', value: U.nf(p.active_days), color: CH.C.act },
          { label: 'Просмотров', value: p.views ? U.nf(p.views) : '—' },
          { label: 'Стаж в компании', value: p.exp || '—' },
        ],
        note: pickable ? 'Клик сузит каталог и динамику до отчётов этого человека ⟳; Shift — добавить к выбору' : null,
      }) + '>' +
      '<td class="txt">' + U.esc(p.fio) +
        (p.is_head ? ' <i class="rflag head"' + U.tip({ text: 'Руководитель' }) + '>рук.</i>' : '') +
        '<span class="unit-sub">' + U.esc(p.login) + '</span></td>' +
      '<td class="txt sec">' + U.esc(p.lvl3) + '<span class="unit-sub">' + U.esc(p.spec) + '</span></td>' +
      '<td class="txt">' + U.esc(p.exp || '—') + '</td>' +
      '<td class="lead">' + (p.active_days || '<span class="mut">0</span>') + '</td>' +
      '<td>' + (p.last_visit_days == null ? '<span class="mut">нет</span>' : (p.last_visit_days === 0 ? 'вчера' : U.days(p.last_visit_days))) + '</td>' +
      '<td class="txt"><span class="sig-chip ' + (SEG_CHIP[p.segment] || 'neutral') + '">' + p.segment + '</span></td>' +
      '</tr>';
  }

  /* Группировка поимённого списка: список людей → секции по значению
     разреза. У AD-групп человек попадает в каждую свою группу, у тим-лидов
     группы две — «Тим-лиды» и «Остальные». */
  function peopleGroups(list, groupKey) {
    if (!groupKey || groupKey === 'none') return null;
    const order = [];
    const idx = {};
    list.forEach((r) => {
      const keys = groupKey === 'adgroup'
        ? D.AD_GROUPS.filter((g) => D.inAdGroup(P_BY[r.pid], g))
        : (groupKey === 'heads'
          ? [r.is_head ? 'Тим-лиды' : 'Остальные']
          : [r[groupKey] != null && r[groupKey] !== '' ? r[groupKey] : '—']);
      keys.forEach((kk) => {
        let u = idx[kk];
        if (!u) { u = idx[kk] = { key: kk, people: [] }; order.push(u); }
        u.people.push(r);
      });
    });
    return order.sort((a, b) => b.people.length - a.people.length);
  }

  /* Дерево групп. Блок — С ЛЕВОГО КРАЯ, департамент правее, люди ещё
     правее: иерархия читается отступами. При группировке «Департамент»
     дерево ДВУХУРОВНЕВОЕ: lvl3-блок → lvl4-департамент → люди. Каретка
     раскрывает; КЛИК ПО СТРОКЕ группы — людская шина ⟳ (сужает каталоги
     и динамику). Список при этом остаётся на месте, как корзины сигаретки:
     выбранная строка подсвечивается, группы без людей текущей выборки
     гаснут (grp-dim), но не исчезают — по ним можно переключить выбор.
     Семантика клика — как в каталоге: переключает, Shift накапливает,
     повторный клик по единственной выбранной снимает. Ключи свернутого
     состояния префиксованы уровнем; WHO_TREE_KEYS собирает их для кнопок
     «свернуть/развернуть все».
     univ — люди области без людской шины (контекст дерева и счётчики),
     cnt — видимый список (шина + корзина частоты + поиск). */
  let WHO_TREE_KEYS = [];
  function peopleGroupedRows(univ, cnt, groupKey, closedMap) {
    const tot = univ.length || 1;
    const emp = S.filters.emp;
    const isSel = (cut, key) => (cut === 'heads'
      ? (key === 'Тим-лиды' && emp.heads)
      : (emp[cut] || []).indexOf(String(key)) >= 0);
    const byKey = (list, key) => {
      const m = {};
      (peopleGroups(list, key) || []).forEach((g) => { m[g.key] = g.people; });
      return m;
    };
    const cntFlat = byKey(cnt, groupKey);
    const cntBlk = byKey(cnt, 'lvl3');
    /* группы с людьми текущей выборки — вверх; пустые — вниз по контексту */
    const order = (groups, cOf) => groups.slice().sort((a, b) => {
      const ca = (cOf(a.key) || []).length, cb = (cOf(b.key) || []).length;
      return (cb > 0 ? 1 : 0) - (ca > 0 ? 1 : 0) || cb - ca || b.people.length - a.people.length;
    });
    const grpHtml = (key, cut, cls, stateKey, uN, cN) => {
      const sel = isSel(cut, key);
      const closed = !!closedMap[stateKey];
      const dim = !sel && !cN;
      WHO_TREE_KEYS.push(stateKey);
      return {
        closed, sel,
        html: '<tr class="grp-h ' + cls + (sel ? ' sel' : '') + (dim ? ' grp-dim' : '') + '"' +
          ' data-who="' + U.esc(key) + '" data-whocut="' + cut + '" tabindex="0" role="button" aria-pressed="' + sel + '"' +
          U.tip({
            title: key,
            rows: [{ label: 'Человек в области', value: U.nf(uN), color: CH.C.act },
              { label: 'Доля области', value: U.pct(uN / tot * 100) }]
              .concat(cN !== uN ? [{ label: 'В текущей выборке', value: U.nf(cN) }] : []),
            note: dim
              ? 'В текущей выборке никого — клик сделает группу условием: каталог и динамика сузятся ⟳'
              : 'Клик — людская шина: каталог и динамика сузятся до этой публики ⟳; Shift добавит к выбору, повторный клик по единственной — снимет',
          }) + '>' +
          '<td colspan="6">' +
          '<button class="gh-caret" data-whogrp="' + U.esc(stateKey) + '" aria-expanded="' + !closed + '"' +
            U.tip({ text: closed ? 'Раскрыть группу' : 'Свернуть группу' }) + ' aria-label="' + (closed ? 'Раскрыть' : 'Свернуть') + ' ' + U.esc(key) + '">' +
            (closed ? '▸' : '▾') + '</button>' +
          '<span class="gh-name">' + U.esc(key) + '</span>' +
          '<span class="gh-cnt">' + U.nf(uN) + ' ' + U.plural(uN, 'человек', 'человека', 'человек') +
            ' · ' + U.pct(uN / tot * 100, 0) + '</span></td></tr>',
      };
    };
    const people = (arr, deep) => (arr || []).map((p) => personRow(p, true, deep, true)).join('');
    WHO_TREE_KEYS = [];
    if (groupKey === 'lvl4') {
      const blocks = order(peopleGroups(univ, 'lvl3') || [], (k) => cntBlk[k]);
      return blocks.map((b) => {
        const bh = grpHtml(b.key, 'lvl3', 'blk', 'B:' + b.key, b.people.length, (cntBlk[b.key] || []).length);
        const deps = order(peopleGroups(b.people, 'lvl4') || [], (k) => cntFlat[k]);
        return bh.html + (bh.closed ? '' : deps.map((d) => {
          const dCnt = cntFlat[d.key] || [];
          const dh = grpHtml(d.key, 'lvl4', 'dep', 'D:' + d.key, d.people.length, dCnt.length);
          return dh.html + (dh.closed || (!dCnt.length && !dh.sel) ? '' : people(dCnt, true));
        }).join(''));
      }).join('');
    }
    return (order(peopleGroups(univ, groupKey) || [], (k) => cntFlat[k])).map((g) => {
      const gCnt = cntFlat[g.key] || [];
      const gh = grpHtml(g.key, groupKey, 'flat', 'G:' + g.key, g.people.length, gCnt.length);
      return gh.html + (gh.closed || (!gCnt.length && !gh.sel) ? '' : people(gCnt, false));
    }).join('');
  }

  /* «Сигаретка» частоты: та же полоса-пропорция, что у сегментов «Кто из
     ЦА», но корзины — по активным дням. Клик — фильтр списка и динамики.
     Проценты — прямо на корзине: пропорция читается без тултипа. */
  function freqStrip(people) {
    const tot = people.length || 1;
    const n = D.GRAINS[S.grain].n;
    return '<div class="segstrip freq" role="group" aria-label="Как часто заходят">' +
      FREQ_BINS.map((b, i) => {
        const cnt = people.filter((p) => freqBinOf(p.active_days || 0).k === b.k).length;
        const on = S.freqSel === b.k;
        const w = Math.max(7, cnt / tot * 100);
        return '<button class="seg-part' + (on ? ' on' : '') + (S.freqSel && !on ? ' off' : '') + '"' +
          ' data-freq="' + U.esc(b.k) + '" style="flex:' + w.toFixed(2) + ' 1 0"' +
          U.tip({
            title: b.k + ' из ' + n,
            text: 'Сколько РАЗНЫХ дней человек заходил за период. Клик оставит в списке и на динамике только эту корзину' +
              (on ? '; повторный клик снимет фильтр' : ''),
            rows: [{ label: 'Человек', value: U.nf(cnt), color: FREQ_COLORS[i] },
              { label: 'Доля зрителей', value: U.pct(cnt / tot * 100) }],
          }) + '>' +
          '<span class="sp-bar" style="background:' + FREQ_COLORS[i] + '"></span>' +
          '<span class="sp-v">' + U.nf(cnt) + '<i class="sp-p">· ' + U.pct(cnt / tot * 100, 0) + '</i></span>' +
          '<span class="sp-l">' + U.esc(b.k) + '</span>' +
          '</button>';
      }).join('') + '</div>';
  }

  /* «Кто смотрит» — поимённый список зрителей области: сверху сигаретка
     частоты (клик — фильтр списка и динамики ⟳), под ней тулбар:
     группировка СЛЕВА, счётчик и настройки — справа. Поиск живёт ПОД
     переключателем в шапке (rightUnder), ровно по ширине двух кнопок —
     прибит и не ездит ни от подзаголовка, ни от выбора группировки. */
  function whoShown(list) {
    return list.filter((p) =>
      (!S.whoHeads || p.is_head) && S.whoExcl.indexOf(p.login) < 0);
  }
  function whoPanel() {
    const sl = selection();
    const cut = S.whoCut;
    const grouped = cut !== 'none';

    const areaPeople = whoAreaPeople();
    const univ = whoShown(whoAreaPeopleNoBus());   // контекст дерева: область без людской шины
    const shown = whoShown(areaPeople);
    const plist = whoShown(whoPeople());
    const rowsHtml = grouped
      ? peopleGroupedRows(univ, plist, cut, S.whoGrpClosed)
      : (plist.length ? plist.map((p) => personRow(p, false, false, true)).join('') : '');

    const tabs = [{ key: 'dyn', label: 'Динамика', on: S.rightView === 'dyn' },
      { key: 'who', label: 'Кто смотрит', on: S.rightView === 'who' }];

    /* Настройки списка — локальные условия СПИСКА: «только руководители»
       и исключённые логины (чей трафик мешает смотреть аудиторию).
       На каталог и динамику не действуют; в бою это фильтр сессий в SQL. */
    const exq = (S.whoExQuery || '').toLowerCase();
    const exPool = areaPeople
      .filter((p) => !exq || (p.fio + ' ' + p.login).toLowerCase().indexOf(exq) >= 0)
      .slice(0, 60);
    const optsOpen = S._dd === 'whoOpts';
    const woDot = S.whoHeads || S.whoExcl.length;
    const opts = '<div class="dd sm who-opts' + (optsOpen ? ' open' : '') + '">' +
      '<button class="dd-trg" data-ddtoggle="whoOpts" aria-expanded="' + optsOpen + '"' +
        U.tip({ title: 'Настройки списка', text: 'Локальные условия этого списка: только руководители и исключённые логины. На каталог и динамику не действуют.' }) + '>' +
        (woDot ? '<i class="wo-dot" aria-hidden="true"></i>' : '') +
        '<span class="dd-txt">Настройки</span><span class="dd-c" aria-hidden="true">▾</span>' +
      '</button>' +
      (optsOpen
        ? '<div class="dd-body who-opts-pop">' +
            '<label class="swt"><input type="checkbox" data-wohead' + (S.whoHeads ? ' checked' : '') + '>' +
              '<span>Только руководители</span></label>' +
            '<div class="wo-h">Исключить логины' + (S.whoExcl.length ? ' · ' + S.whoExcl.length : '') + '</div>' +
            '<div class="psearch">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
              '<input type="search" id="woExQ" placeholder="Логин или ФИО" value="' + U.esc(S.whoExQuery) + '">' +
            '</div>' +
            '<div class="pickbox wo-ex">' +
              (exPool.length ? exPool.map((p) =>
                '<label class="pickrow"><input type="checkbox" data-woex="' + U.esc(p.login) + '"' +
                  (S.whoExcl.indexOf(p.login) >= 0 ? ' checked' : '') + '><span>' + U.esc(p.fio) +
                  ' <i class="wo-login">' + U.esc(p.login) + '</i></span></label>').join('')
                : '<div class="pickempty">Ничего не найдено</div>') +
            '</div>' +
            (S.whoExcl.length
              ? '<div class="scope-act"><button class="btn ghost xs" data-woexclear>Снять всё (' + S.whoExcl.length + ')</button></div>'
              : '') +
          '</div>'
        : '') +
      '</div>';

    const body = freqStrip(shown) +
      '<div class="who-bar">' +
        U.dropdown('whoCut', cut,
          WHO_GROUPS.map((g) => ({ key: g.key, label: g.label })),
          { open: S._dd === 'whoCut', cls: 'sm', label: 'Группировка списка' }) +
        opts +
        '<span class="who-cnt">' + U.nf(plist.length) + ' ' +
          U.plural(plist.length, 'человек', 'человека', 'человек') +
          (plist.length !== areaPeople.length ? ' из ' + U.nf(areaPeople.length) : '') +
          (empSelN() ? ' · <b class="who-sel"' +
            U.tip({ text: 'Активные условия людской шины: каталоги и динамика сужены; клик по выбранной строке снимает условие' }) +
            '>выбрано: ' + empSelN() + '</b>' : '') +
        '</span>' +
        (grouped
          ? '<button class="btn ghost xs" data-wofold="all"' +
              U.tip({ text: 'Свернуть все группы дерева до заголовков' }) + '>Свернуть все</button>' +
            '<button class="btn ghost xs" data-wofold="none"' +
              U.tip({ text: 'Развернуть все группы дерева' }) + '>Развернуть все</button>'
          : '') +
      '</div>' +
      '<div class="tbl-scroll">' +
      '<table class="ptable dense who-people"><thead><tr>' +
        '<th class="txt">Сотрудник</th><th class="txt">Подразделение</th><th class="txt">Стаж</th>' +
        '<th>Дней</th><th>Визит</th><th class="txt">Сегмент</th>' +
      '</tr></thead><tbody>' +
      (rowsHtml ||
        '<tr><td colspan="6" style="text-align:center;padding:var(--s9);color:var(--muted)">Никто не подходит под корзину частоты, поиск и настройки.</td></tr>') +
      '</tbody></table></div>' +
      '<div class="tbl-note">Сортировка — по убыванию активных дней' +
      (grouped
        ? '; группы — по числу людей: каретка сворачивает, клик по строке группы или человека — людская шина (каталог и динамика ' + SRV + '), Shift накапливает'
        : '; клик по человеку — людская шина: каталог и динамика сузятся до его отчётов ' + SRV + ', Shift накапливает') +
      '. Показаны первые 60 строк; в бою это серверная пагинация и выгрузка в файл.</div>';

    return U.panel({
      cls: 'split-r', title: 'Кто смотрит',
      subHtml: 'область: <b>' + U.esc(sl.title) + '</b>',
      tabKey: 'rightView',
      tabs,
      right: U.searchBox('whoQ', 'Имя или логин', S.whoQuery),
      bodyCls: 'tbl-wrap',
      body,
    });
  }

  /* ======================================================================
     ВКЛАДКА «ОТЧЁТЫ»
     ==================================================================== */
  function renderReports() {
    const sl = selection();
    const fr = freqRows();
    const frTot = fr.reduce((a, b) => a + b.users, 0);
    const ts0 = series();
    const kBase = kpiRow();
    const slice = freqSlice(ts0, kBase);
    const ts = slice.ts;
    const k = slice.k;
    const fSel = slice.sliced;
    const dPct = (a, b) => (b ? (a / b - 1) * 100 : null);
    const vs = U.prevPeriodLabel(S.grain);
    const hasPrev = HAS_PREV[S.grain];
    const dlt = (v, o) => (fSel || !hasPrev
      ? U.delta(null, { why: fSel ? 'Состава корзин частоты за прошлый период в витрине нет.' : NO_PREV_WHY })
      : U.delta(v, o));
    const shReg = k && k.users ? k.regular_users / k.users * 100 : 0;
    const shRegPrev = k && k.users_prev ? k.regular_users_prev / k.users_prev * 100 : 0;
    const isRep = sl.kind === 'rep';

    const mau = mauRow();
    const mauM = U.monthName(D.MAU_BUCKET);
    const mauPrevM = U.monthName(D.MAU_PREV_BUCKET);
    const fifth = U.kpi({
      label: 'MAU · ' + mauM, value: mau ? U.nf(mau.users) : '—',
      hint: {
        title: 'Месячная аудитория за ' + mauM,
        text: 'Уникальные пользователи за последний ЗАКРЫТЫЙ месяц — это ровно тот столбик, ' +
          'что стоит на графике динамики, если переключить период на 12 месяцев.',
        rows: [
          { label: mauM, value: mau ? U.nf(mau.users) : '—', color: CH.C.ret },
          { label: mauPrevM, value: mau ? U.nf(mau.users_prev) : '—', dash: true, color: CH.C.bench },
        ],
        note: 'Текущий месяц не берём: он неполный. От периода на экране MAU не зависит.',
      },
      delta: mau ? U.delta(dPct(mau.users, mau.users_prev), { vs: 'к ' + mauPrevM }) : '',
      sub: mauPrevM + ': <b>' + (mau ? U.nf(mau.users_prev) : '—') + '</b>',
    });

    const table = S.mode === 'report' ? reportTable('rep') : groupTable('rep');

    const cohorts = cohortRows();
    const retTitle = isRep ? 'Закрепляемость отчёта' : 'Закрепляемость Proteus';
    const retSub = isRep
      ? 'когорта — месяц, в который человек открыл этот отчёт впервые'
      : 'когорта — месяц первого визита в Proteus; фильтр периода на этот блок не действует';

    /* Правая панель — переключаемая: динамика области или «кто смотрит».
       Лениво: chart() должен выполняться внутри zone('right'), иначе
       контейнер получит чужой префикс и изоляция зон сломается.
       Легенда стека — HTML-пилюльки над графиком (как в проде): клик
       гасит ступень, определения живут в подсказках пилюлек. */
    const newLbl = (sl.kind === 'rep' || sl.kind === 'grp') ? 'Новые в отчёте' : 'Новые';
    const LEG = [
      { k: 'new', l: newLbl, c: CH.C.new,
        d: (sl.kind === 'rep' || sl.kind === 'grp') ? 'Впервые открыли этот отчёт за период.' : 'Первый визит в Proteus пришёлся на этот период.' },
      { k: 'react', l: 'Вернувшиеся', c: CH.C.react, d: 'Заходили когда-то раньше, но в предыдущем периоде их не было.' },
      { k: 'ret', l: 'Продолжающие', c: CH.C.ret, d: 'Заходили и в предыдущем периоде.' },
    ];
    const dynHead = '<div class="dynhead"><span class="cap">Пользователи по периодам' +
      (fSel ? ' · ' + U.esc(S.freqSel) : '') + '</span>' +
      '<div class="legend pills" role="group" aria-label="Ступени стека">' +
      LEG.map((g) => '<button class="leg' + (S.legOff[g.k] ? ' off' : '') + '" data-leg="' + g.k + '" type="button"' +
        U.tip({
          title: g.l, text: g.d,
          note: S.legOff[g.k] ? 'Ступень скрыта — клик вернёт её на график' : 'Клик уберёт ступень с графика',
        }) + '><i style="background:' + g.c + '"></i>' + U.esc(g.l) + '</button>').join('') +
      '</div></div>';
    const rightPanel = () => (S.rightView === 'dyn'
      ? U.panel({
        cls: 'split-r', title: 'Динамика · ' + sl.title,
        sub: sl.sub + (fSel ? ' · только «' + S.freqSel + '»' : ''),
        tabKey: 'rightView',
        tabs: [{ key: 'dyn', label: 'Динамика', on: S.rightView === 'dyn' },
          { key: 'who', label: 'Кто смотрит', on: S.rightView === 'who' }],
        body: dynHead +
          chart('fill', (w) => CH.dynamics(ts, S.grain, {
            width: w,
            viewsMode: S.viewsMode,
            hidden: S.legOff,
            newLabel: newLbl,
          }), [ts, S.grain, S.freqSel, sl.kind, sl.title, S.viewsMode, S.legOff]) +
          (fSel
            ? '<div class="tbl-note">На графике только те, кто заходил <b>' + U.esc(S.freqSel) +
              '</b> за период: человеко-дни корзины разложены по бакетам в пропорции общей динамики ' + SRV +
              '. Сравнение с предыдущим периодом снято — состава корзин за прошлый период в витрине нет.</div>'
            : (sl.kind === 'grp'
              ? '<div class="tbl-note">Пользователи группы — уникальные по группе: один человек, открывший два отчёта, ' +
                'в столбце учтён один раз. Просмотры складываются точно.</div>'
              : '')),
      })
      : whoPanel());

    return [
      zone('strip', strip),

      zone('kpi', () => U.kpis([
        U.kpi({
          label: 'Пользователей за период', value: U.nf(k.users),
          tag: fSel ? S.freqSel : '',
          hint: { title: 'Пользователи', text: 'Уникальные логины за период.', note: 'Сумма по дням больше: один человек заходит в разные дни.' },
          delta: dlt(dPct(k.users, k.users_prev), {
            vs, tip: { title: 'Сравнение', rows: [{ label: 'Период', value: U.nf(k.users) }, { label: 'Предыдущий', value: U.nf(k.users_prev), dash: true, color: CH.C.bench }] },
          }),
          sub: fSel
            ? 'это <b>' + U.pct(k.freq_share) + '</b> всей аудитории'
            : (hasPrev
              ? 'предыдущий: <b>' + U.nf(k.users_prev) + '</b>'
              : 'период: <b>' + U.periodLabel(S.grain) + '</b>'),
        }),
        U.kpi({
          label: 'Просмотров', value: U.compact(k.views),
          hint: { title: 'Просмотры', text: 'Сумма открытий (action_count).' },
          delta: dlt(dPct(k.views, k.views_prev), { vs }),
          sub: 'на пользователя: <b>' + U.nf(k.users ? k.views / k.users : 0, 1) + '</b>',
        }),
        U.kpi({
          label: 'Новых пользователей', value: U.nf(k.new_users),
          hint: {
            title: 'Новые',
            text: sl.kind === 'all' || sl.kind === 'mix'
              ? 'Первый визит в Proteus пришёлся на этот период.'
              : 'Впервые открыли этот отчёт за период.',
          },
          delta: dlt(dPct(k.new_users, k.new_users_prev), { vs }),
          sub: 'доля аудитории: <b>' + U.pct(k.users ? k.new_users / k.users * 100 : 0) + '</b>',
        }),
        fSel
          ? U.kpi({
            label: 'Просмотров на человека',
            value: U.nf(k.users ? k.views / k.users : 0, 1),
            hint: { title: 'Интенсивность', text: 'Просмотры этой корзины, делённые на число людей в ней.', note: 'По всей аудитории — ' + U.nf(kBase.users ? kBase.views / kBase.users : 0, 1) + '.' },
            delta: '',
            sub: 'по всем: <b>' + U.nf(kBase.users ? kBase.views / kBase.users : 0, 1) + '</b>',
          })
          : U.kpi({
            label: 'Постоянных', value: U.pct(shReg),
            hint: { title: 'Постоянные', text: 'Заходили 8 и более разных дней за период.', note: 'Порог выбран как «примерно раз в неделю и чаще».' },
            delta: dlt(shReg - shRegPrev, { vs, unit: ' п.п.', dead: .3 }),
            sub: '<b>' + U.nf(k.regular_users) + '</b> ' + U.plural(k.regular_users, 'человек', 'человека', 'человек'),
          }),
        fifth,
      ], 5)),

      zone('obs', () => U.observations(obsMain(kBase), 'main', 'данные до вчера')),
      zone('ctx', ctxChips),

      group('split main', [
        zone('catalog', () => U.panel({
          cls: 'split-l', title: 'Каталог',
          sub: hasPeople()
            ? 'сужен аудиторией ⟳ · клик по строке задаёт область'
            : 'клик по строке задаёт область экрана',
          right: U.searchBox('repQ', S.mode === 'report' ? 'Найти в каталоге'
            : 'Найти: ' + MODE(S.mode).one.toLowerCase(), S.repQuery),
          under: cutBar('rep'), bodyCls: 'tbl-wrap', body: table,
        })),
        zone('right', rightPanel),
      ]),

      zone('ret', () => U.panel({
        title: retTitle, sub: retSub,
        tabKey: 'retView',
        tabs: [{ key: 'cohort', label: 'Когорты', on: S.retView === 'cohort' },
          { key: 'curve', label: 'Кривая', on: S.retView === 'curve' }],
        body: S.retView === 'cohort'
          ? U.cohortTable({
            rows: cohorts, maxAge: 11, uid: 'ret', base: S.ctBase,
            firstTip: isRep ? 'Месяц, в который человек открыл этот отчёт впервые'
              : 'Месяц первого визита в Proteus',
            sizeNote: isRep ? 'Столько человек открыли этот отчёт впервые в этом месяце'
              : 'Столько человек впервые зашли в Proteus в этом месяце',
            note: 'В ячейке — доля когорты, вернувшаяся через N месяцев. Чем меряет цвет — ' +
              'переключается в легенде над таблицей; наведите ступень шкалы, чтобы на таблице ' +
              'остались только её ячейки. Серый курсив — месяц ещё не закрыт.',
          })
          : chart('h-tall', (w) => CH.retentionCurve(retentionPoints(cohorts), {
            width: w,
            title: isRep ? 'Средняя кривая удержания отчёта' : 'Средняя кривая удержания по всем когортам',
          }), [retentionPoints(cohorts), isRep]),
      })),
    ];
  }

  /* ======================================================================
     ВКЛАДКА «АУДИТОРИЯ» — зеркало «Отчётов»: свой каталог слева, метрика
     adoption, воронка, динамика охвата и «Кто из ЦА» в форме «Кто смотрит».
     ==================================================================== */

  /* Область вкладки задаётся СВОИМ каталогом (левая панель); выбор
     независим от вкладки «Отчёты». Без выбора — весь Proteus. */
  function audArea() {
    const sl = selectionOf('aud');
    return sl.kind === 'all'
      ? { ids: sl.ids, title: 'Весь Proteus' }
      : { ids: sl.ids, title: sl.title };
  }

  /* Целевая аудитория: как роздан доступ или как собрано руками */
  function audienceDef(ids) {
    const metas = ids.map((id) => D.audienceMeta[id]).filter(Boolean);
    if (S.audDef.mode === 'custom') {
      const people = D.customAudience(S.audDef.filters);
      return { mode: 'custom', people, metas };
    }
    return { mode: 'access', people: D.accessAudience(ids), metas };
  }

  /* Какая структура стоит за нынешним доступом: конструктор открывается
     с осмысленного предложения, а не с пустого листа. */
  function suggestAudience(ids) {
    const acc = D.accessAudience(ids);
    if (!acc.length) return null;
    const by = {};
    acc.forEach((p) => { by[p.lvl3] = (by[p.lvl3] || 0) + 1; });
    const top = Object.keys(by).sort((a, b) => by[b] - by[a])[0];
    if (!top || by[top] / acc.length < .25) return null;
    return { lvl3: [top] };
  }

  function obsAudience(def, stats, wide) {
    const out = [];
    if (wide) {
      out.push({
        sev: 'mid',
        lead: 'Доступ открыт почти всей компании — проценты охвата скрыты',
        body: 'В целевой аудитории <b>' + U.nf(stats.audience) + '</b> человек — практически весь банк. ' +
          'Скрыты <b>только проценты</b>: карточка «Дошли», колонка «Охват» и её ИТОГО. ' +
          'Абсолютные числа, воронка, динамика, разрезы и поимённый список показываются как обычно. ' +
          '<b>Соберите целевую аудиторию по структуре</b> (кнопка выше) — и проценты вернутся.',
        rule: 'целевая аудитория ≥30% численности компании',
      });
    }
    if (!wide && stats.reachPct < 40) {
      out.push({
        sev: 'high',
        lead: 'До области дошли ' + U.pct(stats.reachPct) + ' целевой аудитории',
        body: 'Из <b>' + U.nf(stats.audience) + '</b> человек заходили <b>' + U.nf(stats.came) +
          '</b>. Не заходил ни разу <b>' + U.nf(stats.never) + '</b> человек — это и есть список, кому стоит напомнить.',
        rule: 'охват целевой аудитории <40%',
      });
    }
    if (stats.came && stats.once / stats.came >= .45) {
      out.push({
        sev: 'mid',
        lead: 'Почти половина зашедших не вернулась',
        body: '<b>' + U.nf(stats.once) + '</b> из <b>' + U.nf(stats.came) + '</b> открыли область ровно один раз. ' +
          'Разовый визит после рассылки — это не закрепление.',
        rule: 'доля разовых визитов среди зашедших ≥45%',
      });
    }
    if (stats.regular && stats.came && stats.regular / stats.came >= .3) {
      out.push({
        sev: 'good',
        lead: 'Сформировалось ядро из ' + U.nf(stats.regular) + ' постоянных пользователей',
        body: '<b>' + U.nf(stats.regular) + '</b> человек заходят регулярно (8+ дней за период) — отчёт встроился в их работу.',
        rule: 'доля постоянных среди зашедших ≥30%',
      });
    }
    if (def.mode === 'custom' && stats.noAccess > 0 && stats.accessPct < 85) {
      out.push({
        sev: 'mid',
        lead: U.nf(stats.noAccess) + ' ' + U.plural(stats.noAccess, 'человек', 'человека', 'человек') +
          ' целевой аудитории не имеют доступа',
        body: 'Права есть у <b>' + U.nf(stats.access) + '</b> из <b>' + U.nf(stats.audience) +
          '</b> — это <b>' + U.pct(stats.accessPct, 0) + '</b>. Для остальных низкий охват означает не «не ходят», ' +
          'а <b>«не роздали»</b>: сначала доступ, потом рассылка. Ступень «есть доступ» на воронке — про них.',
        rule: 'доступ есть менее чем у 85% настроенной целевой аудитории',
      });
    } else if (def.mode === 'custom') {
      out.push({
        sev: 'none',
        lead: 'Целевая аудитория задана структурой, а не доступом',
        body: 'Знаменатель — накликанные условия, а не AD-группы. Доступ при этом есть почти у всех ' +
          '(<b>' + U.pct(stats.accessPct, 0) + '</b>), так что охват честно читается как «дошли / могли дойти».',
        rule: 'целевая аудитория собрана в конструкторе',
      });
    }
    const ord = { high: 0, mid: 1, good: 2, none: 3 };
    return out.sort((a, b) => ord[a.sev] - ord[b.sev]);
  }

  function renderAudience() {
    const area = audArea();
    const ids = area.ids;
    if (!ids.length) {
      return [zone('strip', strip),
        zone('empty', () => '<div class="empty"><b>Нет отчётов под текущими условиями</b>Снимите часть условий в полоске сверху.</div>')];
    }
    const def = audienceDef(ids);
    /* Разрез из правой панели — кросс-фильтр: сужает ЦА и пересчитывает
       карточки, воронку и динамику. Сегмент на них не влияет. */
    const unit = S.audUnit;
    const basePeople = def.people;
    const people = unit ? basePeople.filter((p) => p[unit.key] === unit.val) : basePeople;

    const rowsAll = D.audienceRows(ids, basePeople, S.grain);
    const rows = unit ? rowsAll.filter((r) => r[unit.key] === unit.val) : rowsAll;
    const W = D.POP_W;
    const vis = D.visitorsOf(ids, S.grain);
    /* Зашедшие пересчитываются масштабом ds_reports: «Дошли» обязаны
       сойтись с «Пользователями за период» на вкладке «Отчёты». */
    const cnt = (f) => Math.round(rows.filter(f).length * W);
    const cntV = (f) => Math.round(rows.filter(f).length * vis.scale);

    const st = {
      audience: Math.round(rows.length * W),
      access: cnt((r) => r.has_access),
      noAccess: cnt((r) => !r.has_access),
      came: cntV((r) => r.came),
      once: cntV((r) => r.segment === 'Разовый'),
      episodic: cntV((r) => r.segment === 'Эпизодический'),
      regular: cntV((r) => r.segment === 'Постоянный'),
    };
    st.scopeUsers = unit ? null : D.scopeVisitors(ids, S.grain);
    st.outside = st.scopeUsers == null ? null : Math.max(0, st.scopeUsers - st.came);
    st.never = Math.max(0, st.audience - st.came);
    st.reachPct = st.audience ? st.came / st.audience * 100 : 0;
    st.accessPct = st.audience ? st.access / st.audience * 100 : 0;
    st.returned = st.came - st.once;
    const wide = def.mode === 'access' && st.audience >= D.HC_TOTAL * .3;

    const dyn = D.audienceDynamics(rows, S.grain, rows.length, vis.scale);
    const audTotal = Math.round(basePeople.length * W);

    /* ГОДОВОЕ окно для adoption: зашедшие в область хоть раз за 12 месяцев
       из той же выборки. В Proteus окно — с 1 января текущего года. */
    const visYear = D.visitorsOf(ids, 'm');
    const rowsYear = D.audienceRows(ids, people, 'm');
    st.cameYear = Math.round(rowsYear.filter((r) => r.came).length * visYear.scale);
    st.adoptPct = st.audience ? st.cameYear / st.audience * 100 : 0;

    const zHead = zone('head', () => {
      const chips = [];
      if (S.audDef.mode === 'custom') {
        const n = DIM_ORDER.reduce((a, k) => a + ((S.audDef.filters[k] || []).length), 0);
        chips.push(U.chip('ЦА настроена: ' + n + ' ' + U.plural(n, 'условие', 'условия', 'условий'), 'audDef'));
      }
      if (S.audUnit) chips.push(U.chip(D.CUTS[S.audUnit.key].label + ': ' + S.audUnit.val, 'audUnit'));
      if (S.audSeg) chips.push(U.chip('Сегмент: ' + S.audSeg, 'audSeg'));
      return '<div class="page-h"><div class="ph-row"><h2>' + U.esc('Аудитория: ' + area.title) + '</h2></div>' +
        '<p>Область задаётся <b>каталогом слева</b> — выбор здесь свой, независим от вкладки «Отчёты»: ' +
        'там смотрят, чем живут отчёты вообще, здесь настраивают adoption конкретной области. ' +
        'Кому область роздана, кто дошёл, кто закрепился и кто не заходил ни разу. ' +
        'Период — <b>' + U.periodLabel(S.grain) + '</b>' + (S.freqSel ? '. Фильтр частоты действует только на вкладке «Отчёты»' : '') + '.</p>' +
        (chips.length ? '<div class="chips">' + chips.join('') + '</div>' : '') + '</div>';
    });

    const zKpi = zone('kpi', () => U.kpis([
      U.kpi({
        label: 'Целевая аудитория', value: U.nf(st.audience),
        tag: def.mode === 'custom' ? 'настроена' : '',
        hint: {
          title: 'Откуда число',
          text: def.mode === 'custom'
            ? 'Сотрудники, попавшие под накликанные условия в конструкторе.'
            : 'Сотрудники, которым роздан доступ: состав AD-групп плюс поимённые права.',
        },
        delta: '', sub: wide ? '<b>почти весь банк</b>' : 'человек в знаменателе',
      }),
      U.kpi({
        label: 'Adoption за год', value: wide ? '<span class="mut">—</span>' : U.pct(st.adoptPct),
        hint: {
          title: 'Adoption',
          text: 'Доля целевой аудитории, открывавшая область хотя бы раз за год. Это накопленный охват: ' +
            'от периода и свитков полоски не зависит, растёт только вместе с охватом.',
          rows: [
            { label: 'Зашли за год', value: U.nf(st.cameYear), color: CH.C.act },
            { label: 'Целевая аудитория', value: U.nf(st.audience), dash: true, color: CH.C.bench },
          ],
          note: 'В Proteus окно — с 1 января текущего года.',
        },
        delta: '',
        sub: wide ? 'знаменатель не показательный' : 'за год зашли: <b>' + U.nf(st.cameYear) + '</b>',
      }),
      U.kpi({
        label: 'Дошли', value: U.nf(st.came),
        hint: { title: 'Дошли', text: 'Открывали хотя бы один отчёт области за период.' },
        delta: wide ? '' : U.delta(st.reachPct - 100, {
          neutral: true, vs: 'до полного охвата', unit: ' п.п.', dec: 0,
          tip: { title: 'Охват', rows: [{ label: 'Дошли', value: U.nf(st.came), color: CH.C.act }, { label: 'Целевая аудитория', value: U.nf(st.audience), dash: true, color: CH.C.bench }] },
        }),
        sub: wide ? 'доля по такому знаменателю не считается' : 'охват <b>' + U.pct(st.reachPct) + '</b>',
      }),
      U.kpi({
        label: 'Закрепились', value: U.nf(st.regular),
        hint: { title: 'Постоянные', text: 'Заходили 8 и более разных дней за период.' },
        delta: '', sub: 'от дошедших <b>' + U.pct(st.came ? st.regular / st.came * 100 : 0, 0) + '</b>',
      }),
      U.kpi({
        label: 'Зашли один раз', value: U.nf(st.once),
        hint: { title: 'Разовые', text: 'Ровно один активный день за период — типичная реакция на рассылку.' },
        delta: '', sub: 'от дошедших <b>' + U.pct(st.came ? st.once / st.came * 100 : 0, 0) + '</b>',
      }),
      st.outside
        ? U.kpi({
          label: 'Заходили вне ЦА', value: U.nf(st.outside),
          hint: {
            title: 'Не попали в целевую аудиторию',
            text: 'Всего в область заходило ' + U.nf(st.scopeUsers) + ' человек — это то же число, что на вкладке «Отчёты». Из них ' + U.nf(st.came) + ' попадают в заданную целевую аудиторию.',
            note: 'Доступ у них есть, но под условия ЦА они не подошли.',
          },
          delta: '',
          sub: 'всего заходило: <b>' + U.nf(st.scopeUsers) + '</b>',
        })
        : U.kpi({
        label: 'Ни разу не заходили', value: U.nf(st.never),
        hint: {
          title: 'Кому напомнить',
          text: 'Люди целевой аудитории без единого визита за период. Список — в таблице ниже, сегменты «Не заходили» и «Нет доступа».',
          note: st.noAccess ? 'Из них ' + U.nf(st.noAccess) + ' вообще не имеют прав на область — им нужен доступ, а не напоминание.' : null,
        },
        delta: '',
        sub: wide ? 'по такому знаменателю не показательно'
          : (st.noAccess
            ? 'из них <b>' + U.nf(st.noAccess) + '</b> без доступа'
            : '<b>' + U.pct(st.audience ? st.never / st.audience * 100 : 0, 0) + '</b> аудитории'),
      }),
    ], 6));

    const zObs = zone('obs', () => U.observations(obsAudience(def, st, wide), 'aud', 'данные до вчера'));

    /* ---- Каталог области (свой руль) + рядом ЦА с воронкой ---------------- */
    const one = ids.length === 1 ? reportById(ids[0]) : null;
    const bs = D.buckets(S.grain);
    const createdIdx = (one && one.created_dt > bs[0] && one.created_dt <= bs[bs.length - 1])
      ? bs.findIndex((b) => b >= one.created_dt) : -1;
    const createdBefore = !!one && one.created_dt <= bs[0];

    const funnelSteps = [
      { name: 'Целевая аудитория', value: st.audience, note: def.mode === 'custom' ? 'Собрана в конструкторе' : 'Как роздан доступ' },
      def.mode === 'custom'
        ? { name: 'Есть доступ к области', value: st.access, note: 'права выданы AD-группой или поимённо' }
        : null,
      { name: 'Открыли хотя бы раз', value: st.came },
      { name: 'Вернулись ещё раз', value: st.returned, note: 'заходили больше одного дня' },
      { name: 'Заходят регулярно', value: st.regular, note: '8+ активных дней за период' },
    ].filter(Boolean);

    function funnelPanel() {
      return U.panel({
        cls: 'split-l aud-fn', title: 'Путь целевой аудитории',
        sub: 'от выданного доступа до регулярного использования',
        bodyCls: 'flexcol',
        body: svgChart('fn-box', (w) => U.funnelSvg(funnelSteps, w, 0, { label: 'Путь целевой аудитории' }),
          [st.audience, st.access, st.came, st.returned, st.regular, def.mode]) +
          '<div class="tbl-note">Каждый следующий этап — подмножество предыдущего. ' +
          (def.mode === 'custom'
            ? 'Ступень <b>«есть доступ»</b> отделяет «не роздали права» от «роздали, но не ходят»: ' +
              'без неё низкий охват настроенной аудитории не читается. '
            : '') +
          '<b>Когда</b> этапы набирались — на графике динамики ниже: воронка отвечает, чем всё кончилось, ' +
          'динамика — как к этому шли.</div>',
      });
    }

    const audModeKey = catMode('aud');
    const gCat = group('split audcat', [
      zone('catalog', () => U.panel({
        cls: 'split-l', title: 'Каталог области',
        sub: hasPeople()
          ? 'сужен аудиторией ⟳ · клик по строке задаёт область'
          : 'клик по строке задаёт область вкладки',
        right: U.searchBox('audRepQ', audModeKey === 'report' ? 'Найти в каталоге'
          : 'Найти: ' + MODE(audModeKey).one.toLowerCase(), S.audRepQuery),
        under: cutBar('aud'), bodyCls: 'tbl-wrap',
        body: audModeKey === 'report' ? reportTable('aud') : groupTable('aud'),
      })),
      zone('aside', () => audScopeBar(ids, def, audTotal, st, wide) + funnelPanel()),
    ]);

    const zAts = zone('ats', () => U.panel({
      title: 'Что происходило по периодам',
      subHtml: one && createdIdx >= 0
        ? 'отчёт создан <b>' + U.fmtDate(one.created_dt) + '</b> — отмечено плашкой на графике'
        : (one && createdBefore
          ? 'отчёт создан <b>' + U.fmtDate(one.created_dt) + '</b>, раньше начала периода'
          : 'приход, просмотры и охват целевой аудитории'),
      body: chart('h-tall', (w) => CH.audienceTimeline(dyn, S.grain, {
        width: w,
        audience: st.audience,
        createdIdx,
        createdLabel: one ? 'создан ' + U.fmtDate(one.created_dt) : '',
        title: 'Заходили из целевой аудитории',
      }), [dyn, S.grain, st.audience, createdIdx]),
    }));

    /* ---- Люди: «Кто из ЦА» — та же форма, что «Кто смотрит» -------------- */
    const zPeople = zone('people', () => audWhoPanel(rowsAll, rows, st, wide, def));

    return [zHead, zone('strip', strip), zKpi, zObs, zone('ctx', ctxChips), gCat, zAts, zPeople];
  }

  /* «Кто из целевой аудитории»: сводная по людскому разрезу с охватом
     (клик по строке сужает вкладку) или поимённо с сегментами. Разрезы —
     те же, что в конструкторе ЦА. */
  function audWhoPanel(rowsAll, rows, st, wide, def) {
    const W = D.POP_W;
    let cut = S.audCut;
    if (cut !== 'people' && def.mode === 'custom' && (S.audDef.filters[cut] || []).length === 1) {
      cut = DIM_ORDER.find((k) => (S.audDef.filters[k] || []).length !== 1) || cut;
    }
    const people = cut === 'people';
    const right = U.dropdown('audCut', cut,
        DIM_ORDER.map((k) => ({ key: k, label: D.CUTS[k].label }))
          .concat([{ key: 'people', label: 'Поимённо' }]),
        { open: S._dd === 'audCut', cls: 'sm', label: 'Разрез целевой аудитории' }) +
      (people ? U.searchBox('audQ', 'Имя или логин', S.audQuery) : '');

    let body;
    if (people) {
      const segRows = SEGMENTS
        .filter((sg) => !sg.accessOnly || st.noAccess > 0)
        .map((sg) => ({ seg: sg, value: Math.round(rows.filter((r) => r.segment === sg.key).length * W) }));
      const plist = rows
        .filter((p) => !S.audSeg || p.segment === S.audSeg)
        .filter((p) => !S.audQuery || (p.fio + ' ' + p.login).toLowerCase().indexOf(S.audQuery.toLowerCase()) >= 0)
        .sort((a, b) => b.active_days - a.active_days)
        .slice(0, 40);
      body = segStrip(segRows, st.audience) +
        '<div class="tbl-scroll">' +
        '<table class="ptable dense"><thead><tr>' +
          '<th class="txt">Сотрудник</th><th class="txt">Подразделение</th>' +
          '<th>Дней</th><th>Визит</th><th class="txt">Сегмент</th>' +
        '</tr></thead><tbody>' +
        (plist.length ? plist.map((p) => personRow(p)).join('')
          : '<tr><td colspan="5" style="text-align:center;padding:var(--s9);color:var(--muted)">Никто не подходит под выбранный сегмент и поиск.</td></tr>') +
        '</tbody></table></div>' +
        '<div class="tbl-note">Показаны первые 40 строк; поиск и сегмент сужают список. ' +
        'В макете это выборка 1 к ' + U.nf(W, 0) + ' — числа домножены обратно. ' +
        'В Proteus это серверная пагинация и выгрузка в файл.</div>';
    } else {
      const byUnit = {};
      rowsAll.forEach((p) => {
        const key = p[cut] != null ? p[cut] : p.lvl3;
        const u = (byUnit[key] = byUnit[key] || { key, aud: 0, came: 0, reg: 0 });
        u.aud++; if (p.came) u.came++; if (p.segment === 'Постоянный') u.reg++;
      });
      const unitRows = Object.values(byUnit).map((u) => ({
        key: u.key, label: u.key,
        aud: Math.round(u.aud * W), came: Math.round(u.came * W), reg: Math.round(u.reg * W),
        cov: u.aud ? u.came / u.aud * 100 : 0,
      })).sort((a, b) => b.aud - a.aud);
      body = U.barTable({
        firstH: D.CUTS[cut].label, firstW: '36%', colW: '15%', barH: '',
        barClass: 'c-cov', dense: true,
        clickAttr: 'audunit', extraAttr: ' data-audkey="' + cut + '"',
        selected: S.audUnit ? S.audUnit.val : null,
        cols: [{ label: 'В ЦА' }, { label: 'Дошли' }, { label: 'Охват' }],
        total: {
          cells: [U.nf(Math.round(rowsAll.length * W)), U.nf(Math.round(rowsAll.filter((r) => r.came).length * W)),
            wide ? '<span class="mut">—</span>' : U.pct(rowsAll.length ? rowsAll.filter((r) => r.came).length / rowsAll.length * 100 : 0, 0)],
        },
        rows: unitRows.map((r) => ({
          key: r.key, label: r.label,
          cells: [U.nf(r.aud), U.nf(r.came), wide ? '<span class="mut">—</span>' : U.pct(r.cov, 0)],
          bar: r.cov,
          tip: {
            title: r.label,
            rows: [{ label: 'В целевой аудитории', value: U.nf(r.aud), dash: true, color: CH.C.bench },
              { label: 'Дошли', value: U.nf(r.came), color: CH.C.act },
              { label: 'Закрепились', value: U.nf(r.reg) },
              { label: 'Охват', value: U.pct(r.cov) }],
            note: S.audUnit && S.audUnit.val === r.key ? 'Клик снимет фильтр' : 'Клик сузит всю вкладку до этой строки',
          },
        })),
        note: wide
          ? 'Проценты охвата скрыты: в целевой аудитории почти весь банк, знаменатель ничего не измеряет. Абсолютные числа на месте. Настройте целевую аудиторию выше — проценты вернутся.'
          : 'Полоса — доля дошедших ВНУТРИ строки, а не вклад строки в общий охват. ИТОГО считается по всей целевой аудитории.',
      });
    }
    return U.panel({
      title: 'Кто из целевой аудитории',
      subHtml: people
        ? 'полоса сегментов — та же аудитория по поведению; клик по сегменту сужает список'
        : (S.audUnit
          ? 'фильтр: <b>' + U.esc(S.audUnit.val) + '</b> — клик по строке снимет'
          : 'клик по строке сужает всю вкладку до этой строки'),
      right, bodyCls: 'tbl-wrap', body,
    });
  }

  /* Панель «целевая аудитория» вкладки «Аудитория»: область подписана в
     шапке и рулится каталогом слева, здесь — только ЦА и её настройка. */
  function audScopeBar(ids, def, audTotal, st, wide) {
    const metas = def.metas;
    const groups = {};
    metas.forEach((m) => (m.ad_groups || []).forEach((g) => { groups[g] = 1; }));
    const gList = Object.keys(groups);
    const hasAcl = metas.some((m) => m.audience_type === 'acl');

    let audTitle, audText, audChip;
    if (def.mode === 'custom') {
      audTitle = 'Собрана в конструкторе';
      audChip = '<span class="sig-chip note">' + U.nf(audTotal) + ' ' + U.plural(audTotal, 'человек', 'человека', 'человек') + '</span>';
      audText = 'Условия: ' + DIM_ORDER.filter((k) => (S.audDef.filters[k] || []).length)
        .map((k) => '<b>' + U.esc(D.CUTS[k].label) + '</b>: ' + (S.audDef.filters[k].map(U.esc).join(', ')))
        .join(' <span class="mut">и</span> ') +
        '. Берём из управленческой структуры всех, кто под них попадает, и смотрим, сколько из них дошло до области.';
    } else if (wide) {
      audTitle = 'Доступ роздан почти всей компании';
      audChip = '<span class="sig-chip warn">покрытие не считаем</span>';
      audText = 'Права выданы через <b>' + (gList.map(U.esc).join('</b>, <b>') || 'широкую группу') +
        '</b> — это <b>' + U.nf(audTotal) + '</b> человек, практически весь банк. Такой знаменатель не описывает, ' +
        'для кого делали отчёт, поэтому долю покрытия по нему мы не показываем. ' +
        '<b>Соберите целевую аудиторию по структуре</b> — и доли вернутся.';
    } else if (hasAcl && !gList.length) {
      audTitle = 'Поимённый список доступа';
      audChip = '<span class="sig-chip note">' + U.nf(audTotal) + ' ' + U.plural(audTotal, 'человек', 'человека', 'человек') + '</span>';
      audText = 'Права выданы поимённо. Это самый точный вид целевой аудитории: покрытие и список «не заходил» считаются без допущений.';
    } else {
      audTitle = 'Доступ через AD-группы';
      audChip = '<span class="sig-chip note">' + U.nf(audTotal) + ' ' + U.plural(audTotal, 'человек', 'человека', 'человек') + '</span>';
      audText = 'Права выданы ' + U.plural(gList.length, 'группе', 'группам', 'группам') + ' <b>' +
        gList.map(U.esc).join('</b>, <b>') + '</b>' +
        (hasAcl ? ' плюс поимённые права' : '') + ' — всего <b>' + U.nf(audTotal) + '</b> ' +
        U.plural(audTotal, 'человек', 'человека', 'человек') + '. Считаем их целевой аудиторией, пока не задана своя.';
    }

    return '<div class="scopebar aud' + (wide ? ' wide' : '') + '">' +
      '<div class="sb-col sb-aud">' +
        '<div class="as-cap">Целевая аудитория — с чем сравниваем охват</div>' +
        '<div class="as-t">' + U.esc(audTitle) + audChip + '</div>' +
        '<div class="as-x">' + audText + '</div>' +
        (S.audUnit
          ? '<div class="as-x"><b>На экране срез: ' + U.esc(S.audUnit.val) + '</b> — ' + U.nf(st.audience) + ' ' +
            U.plural(st.audience, 'человек', 'человека', 'человек') + ' из них. Клик по строке среза или чип сверху снимет.</div>'
          : '') +
        (empOn()
          ? '<div class="as-x mut">В полоске набран фильтр по сотрудникам — он действует на вкладке «Отчёты», ' +
            'а здесь целевую аудиторию задаёт конструктор.</div>'
          : '') +
        '<div class="sb-act">' +
          '<button class="btn' + (def.mode === 'custom' ? '' : ' primary') + '" id="audCfgOpen">' +
            (def.mode === 'custom' ? 'Изменить условия' : 'Настроить целевую аудиторию') + '</button>' +
          (def.mode === 'custom'
            ? '<button class="btn ghost" id="audCfgReset">Вернуть «как роздан доступ»</button>'
            : '') +
        '</div>' +
      '</div>' +
      '</div>' + audienceModal(ids);
  }

  /* Полоса сегментов: вся ЦА, разложенная по поведению. Клик — фильтр
     поимённого списка; на карточки и воронку сегмент не влияет. */
  function segStrip(segRows, total) {
    const t = Math.max(1, total);
    return '<div class="segstrip" role="group" aria-label="Сегменты целевой аудитории">' +
      segRows.map((r) => {
        const on = S.audSeg === r.seg.key;
        const w = Math.max(2.5, r.value / t * 100);
        return '<button class="seg-part' + (on ? ' on' : '') + (S.audSeg && !on ? ' off' : '') + '"' +
          ' data-seg="' + U.esc(r.seg.key) + '" style="flex:' + w.toFixed(2) + ' 1 0"' +
          U.tip({
            title: r.seg.plural,
            rows: [{ label: 'Человек', value: U.nf(r.value), color: r.seg.color },
              { label: 'Доля ЦА', value: U.pct(r.value / t * 100) }],
            note: r.seg.note + (on ? ' · клик снимет фильтр' : ' · клик отфильтрует список'),
          }) + '>' +
          '<span class="sp-bar" style="background:' + r.seg.color + '"></span>' +
          '<span class="sp-v">' + U.nf(r.value) + '</span>' +
          '<span class="sp-l">' + U.esc(r.seg.plural) + '</span>' +
          '</button>';
      }).join('') + '</div>';
  }

  /* Конструктор целевой аудитории: те же поля, что в mdm-витрине. */
  function audienceModal(ids) {
    if (!S._audCfg) return '';
    const f = S.audDef.draft;
    const people = D.customAudience(f);
    const n = people.length;
    const withAcc = people.filter((p) => ids.some((id) => D.hasAccess(p, id))).length;
    const dim = DIM_ORDER.indexOf(S._audDim) >= 0 ? S._audDim : DIM_ORDER[0];
    const cntk = (k) => (f[k] || []).length;
    const total = DIM_ORDER.reduce((a, k) => a + cntk(k), 0);

    const dims = DIM_ORDER.map((k) => '<button class="cfg-dim' + (k === dim ? ' on' : '') + '"' +
      ' data-auddimsel="' + k + '"' + U.tip({ title: D.CUTS[k].label, text: DIM_HINT[k] }) + '>' +
      U.esc(D.CUTS[k].label) +
      (cntk(k) ? '<i class="pcount on">' + cntk(k) + '</i>' : '<i class="pcount">' + D.CUTS[k].vals.length + '</i>') +
      '</button>').join('');

    const dq = S._dimQuery.toLowerCase();
    const picked = (f[dim] || []);
    const allVals = D.CUTS[dim].vals;
    const shown = allVals.filter((v) => !dq || v.toLowerCase().indexOf(dq) >= 0)
      .sort((a, b) => (picked.indexOf(b) >= 0) - (picked.indexOf(a) >= 0));
    const vals =
      (picked.length
        ? '<div class="pickchips sel">' + picked.map((v) =>
          '<button class="pchip on sm" data-auddim="' + dim + '" data-audval="' + U.esc(v) + '"' +
          U.tip({ text: 'Убрать условие' }) + '>' + U.esc(v) + ' ×</button>').join('') + '</div>'
        : '') +
      U.searchBox('dimQ', 'Найти значение', S._dimQuery) +
      '<div class="dimbox">' + (shown.length
        ? shown.map((v) => '<label class="pickrow"><input type="checkbox" data-auddim="' + dim +
            '" data-audval="' + U.esc(v) + '"' + (picked.indexOf(v) >= 0 ? ' checked' : '') +
            '><span>' + U.esc(v) + '</span></label>').join('')
        : '<div class="pickempty">Ничего не найдено</div>') + '</div>' +
      '<div class="as-cap2">' + U.nf(allVals.length) + ' ' +
        U.plural(allVals.length, 'значение', 'значения', 'значений') + ' в разрезе' +
        (picked.length ? ' · выбрано ' + picked.length : '') + '</div>';

    const chosen = total
      ? DIM_ORDER.filter((k) => cntk(k)).map((k) =>
        '<span class="cfg-cond"><b>' + U.esc(D.CUTS[k].label) + ':</b> ' +
        U.esc((f[k] || []).slice(0, 3).join(', ')) +
        ((f[k] || []).length > 3 ? ' <i class="pcount on">+' + ((f[k] || []).length - 3) + '</i>' : '') +
        '</span>').join('')
      : '<span class="as-x">Условий нет — под целевую аудиторию попадает весь банк. Выберите разрез слева.</span>';

    return '<div class="ovl" id="audCfg">' +
      '<div class="modal wide" role="dialog" aria-modal="true" aria-labelledby="audCfgT">' +
        '<div class="modal-h"><h3 id="audCfgT">Целевая аудитория</h3>' +
        '<p>Накликайте структуру — возьмём оттуда всех сотрудников и посмотрим, сколько из них дошло до области. ' +
        'Внутри разреза условия складываются по <b>ИЛИ</b>, между разрезами — по <b>И</b>. ' +
        'Пустой разрез ничего не ограничивает.</p></div>' +
        '<div class="modal-b cfg-b">' +
          '<div class="cfg-sel">' + chosen + '</div>' +
          '<div class="cfg-grid">' +
            '<div class="cfg-dims" role="tablist" aria-label="Разрезы">' + dims + '</div>' +
            '<div class="cfg-vals">' +
              '<div class="cfg-vh">' + U.esc(D.CUTS[dim].label) +
                '<span class="cfg-vhx">' + U.esc(DIM_HINT[dim]) + '</span></div>' +
              vals +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="modal-f">' +
          '<span class="as-x">Под условия попадает <b>' + U.nf(Math.round(n * D.POP_W)) + '</b> ' +
          U.plural(Math.round(n * D.POP_W), 'сотрудник', 'сотрудника', 'сотрудников') +
          (n ? ', доступ к области есть у <b>' + U.nf(Math.round(withAcc * D.POP_W)) + '</b> (' +
            U.pct(withAcc / n * 100, 0) + ')' : '') + '</span>' +
          '<span class="sp"></span>' +
          '<button class="btn" id="audCfgClear">Очистить</button>' +
          '<button class="btn" id="audCfgCancel">Отмена</button>' +
          '<button class="btn primary" id="audCfgApply">Применить</button>' +
        '</div>' +
      '</div></div>';
  }

  /* ================================ Рендер =============================== */
  function render(keepScroll) {
    const y = keepScroll ? window.scrollY : 0;
    /* Верхние вкладки — статичный хост в index.html; подсвечиваем активную */
    document.querySelectorAll('#tabsHost .tab').forEach((b) => {
      const on = b.dataset.tab === S.tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    QUEUE = [];
    paint(TABS.find((t) => t.key === S.tab).fn());
    mountCharts();
    if (keepScroll) window.scrollTo(0, y);
  }

  /* Выбор строки НАКОПИТЕЛЬНЫЙ: клик добавляет условие в свой разрез,
     повторный клик по той же строке снимает. scope указывает каталог. */
  function pick(scope, mode, val, additive) {
    const store = picksOf(scope);
    const list = store[mode] || (store[mode] = []);
    const i = list.findIndex((x) => String(x) === String(val));
    if (additive) {
      if (i >= 0) list.splice(i, 1);
      else list.push(val);
      return;
    }
    /* Обычный клик ПЕРЕКЛЮЧАЕТ выбор: в списке остаётся только эта строка;
       клик по единственной уже выбранной строке снимает выбор — область
       возвращается ко всему Proteus. Накапливает только Shift. */
    const was = i >= 0 && list.length === 1;
    list.length = 0;
    if (!was) list.push(val);
  }
  /* Людская шина — СЕМАНТИКА КАК В КАТАЛОГЕ: обычный клик переключает
     условие разреза на это значение, Shift+клик накапливает/снимает
     порознь, повторный клик по единственному условию снимает его.
     Разрезы складываются по И (каталог ∩ публика), внутри разреза — ИЛИ. */
  function pickEmp(cut, val, additive) {
    const e = S.filters.emp;
    if (cut === 'heads') { e.heads = !e.heads; return; }
    const fld = cut === 'login' ? 'login' : (WHO_FLD[cut] || cut);
    const list = e[fld] || (e[fld] = []);
    const i = list.findIndex((x) => String(x) === String(val));
    if (additive) {
      if (i >= 0) list.splice(i, 1); else list.push(val);
      return;
    }
    const was = i >= 0 && list.length === 1;
    list.length = 0;
    if (!was) list.push(val);
  }
  /* Отчёт мог выпасть из суженного каталога — условие про него больше
     ничего не значит и должно уйти само. */
  function prunePicks() {
    S.picks.report = pickList('report').filter((id) => !!reportById(id));
    S.audPicks.report = pickList('report', 'aud').filter((id) => !!reportById(id));
  }

  /* Ключ фильтра может быть вложенным: emp.heads */
  function setFlt(key, val) {
    const p = key.split('.');
    if (p.length === 1) S.filters[p[0]] = val;
    else S.filters[p[0]][p[1]] = val;
  }

  /* ============================== События ================================ */
  document.addEventListener('click', (e) => {
    const t = e.target;
    const cl = (sel) => t.closest ? t.closest(sel) : null;

    /* Выпадающие списки: разрезы «Кто смотрит»/«Охват», опции полоски */
    const ddT = cl('[data-ddtoggle]');
    if (ddT) {
      const id = ddT.dataset.ddtoggle;
      S._dd = S._dd === id ? null : id;
      render(true); return;
    }
    const ddP = cl('[data-ddpick]');
    if (ddP) {
      const id = ddP.dataset.ddpick, v = ddP.dataset.ddval;
      S._dd = null;
      if (id === 'whoCut') { S.whoCut = v; S.whoQuery = ''; S.whoGrpClosed = {}; }
      if (id === 'audCut') { S.audCut = v; S.audUnit = null; }
      render(true); return;
    }

    /* Настройки «Кто смотрит»: руководители и исключённые логины. Чекбоксы
       внутри открытого dd — поповер не закрываем (cl('.dd') ниже это учитывает). */
    const woH = cl('[data-wohead]');
    if (woH) { S.whoHeads = woH.checked; render(true); return; }
    const woX = cl('[data-woex]');
    if (woX) {
      const lg = woX.dataset.woex;
      const ix = S.whoExcl.indexOf(lg);
      if (ix >= 0) S.whoExcl.splice(ix, 1); else S.whoExcl.push(lg);
      render(true); return;
    }
    if (cl('[data-woexclear]')) { S.whoExcl = []; render(true); return; }
    /* Распознанное действие закрывает раскрытый поповер и срабатывает само;
       закрытие «по клику мимо» — только для клика без действия. */
    const acted = ['[data-grain]', '[data-mode]', '[data-stab]', '[data-freq]', '[data-ctbase]',
      '[data-who]', '[data-whogrp]', '[data-wofold]', '[data-leg]', '[data-unchip]', '[data-slice]', '[data-rep]', '[data-seg]', '[data-audunit]',
      'th[data-sort]', '.obs-h', '[data-tab]']
      .some((sel) => cl(sel)) || /^(fltReset|ctxReset|audCfgOpen|audCfgReset|audCfgClear|audCfgCancel|audCfgApply)$/.test(t.id || '');
    if (S._dd && !acted && !cl('.dd') && !cl('.opts')) { S._dd = null; render(true); return; }
    if (S._dd && acted) S._dd = null;

    const tab = cl('[data-tab]');
    if (tab) { S.tab = tab.dataset.tab; render(); return; }

    const gr = cl('[data-grain]');
    if (gr) { S.grain = gr.dataset.grain; render(true); return; }

    const whg = cl('[data-whogrp]');
    if (whg) {
      const k = whg.dataset.whogrp;
      if (S.whoGrpClosed[k]) delete S.whoGrpClosed[k];
      else S.whoGrpClosed[k] = true;
      render(true); return;
    }

    /* Свернуть/развернуть ВСЁ дерево групп разом */
    const fo = cl('[data-wofold]');
    if (fo) {
      if (fo.dataset.wofold === 'all') {
        const m = {};
        (WHO_TREE_KEYS || []).forEach((k) => { m[k] = true; });
        S.whoGrpClosed = m;
      } else S.whoGrpClosed = {};
      render(true); return;
    }

    /* Пилюлька легенды динамики: гасит свою ступень стека; последнюю
       оставшуюся гасить нельзя — столбик обязан хоть что-то показывать. */
    const leg = cl('[data-leg]');
    if (leg) {
      const k = leg.dataset.leg;
      const on = ['new', 'react', 'ret'].filter((x) => !S.legOff[x]);
      if (!(on.length === 1 && !S.legOff[k])) S.legOff[k] = !S.legOff[k];
      render(true); return;
    }

    const md = cl('[data-mode]');
    if (md) {
      if (md.dataset.catscope === 'aud') S.audMode = md.dataset.mode;
      else S.mode = md.dataset.mode;
      render(true); return;
    }

    const stab = cl('[data-stab]');
    if (stab) { S[stab.dataset.stab] = stab.dataset.val; render(true); return; }

    /* Частота визитов — кросс-фильтр: повторный клик снимает */
    const fq = cl('[data-freq]');
    if (fq) { S.freqSel = S.freqSel === fq.dataset.freq ? null : fq.dataset.freq; render(true); return; }

    /* Легенда когорт */
    const ctb = cl('[data-ctbase]');
    if (ctb) { S.ctBase = ctb.dataset.ctbase; render(true); return; }

    /* ЛЮДСКАЯ ШИНА: клик по строке группы или человека «Кто смотрит».
       Сама панель остаётся на месте (контекст дерева не сужается),
       сужаются каталоги и динамика ⟳. */
    const wh = cl('[data-who]');
    if (wh) {
      pickEmp(wh.dataset.whocut || S.whoCut, wh.dataset.who, e.shiftKey);
      prunePicks();
      render(true); return;
    }

    /* Сегмент поимённого списка (вкладка «Аудитория») */
    const seg = cl('[data-seg]');
    if (seg) { S.audSeg = S.audSeg === (seg.dataset.seg || null) ? null : (seg.dataset.seg || null); render(true); return; }

    /* Кросс-фильтр разреза охвата */
    const au = cl('[data-audunit]');
    if (au) {
      const v = au.dataset.audunit;
      S.audUnit = (S.audUnit && S.audUnit.val === v) ? null : { key: au.dataset.audkey || S.audCut, val: v };
      render(true); return;
    }

    /* Конструктор ЦА */
    if (t.id === 'audCfgOpen') {
      S._audCfg = true;
      S.audDef.draft = JSON.parse(JSON.stringify(S.audDef.filters || {}));
      S._dimQuery = '';
      if (!DIM_ORDER.some((k) => (S.audDef.draft[k] || []).length)) {
        const sug = suggestAudience(audArea().ids);
        if (sug) S.audDef.draft = sug;
      }
      render(true); return;
    }
    const dsel = cl('[data-auddimsel]');
    if (dsel) { S._audDim = dsel.dataset.auddimsel; S._dimQuery = ''; render(true); return; }
    const pc = cl('button[data-auddim]');
    if (pc) {
      const k = pc.dataset.auddim, v = pc.dataset.audval;
      const arr = (S.audDef.draft[k] = S.audDef.draft[k] || []);
      const i = arr.indexOf(v);
      if (i >= 0) arr.splice(i, 1); else arr.push(v);
      render(true); return;
    }
    if (t.id === 'audCfgClear') { S.audDef.draft = {}; render(true); return; }
    if (t.id === 'audCfgCancel' || t.id === 'audCfg') { S._audCfg = false; render(true); return; }
    if (t.id === 'audCfgApply') {
      const d = S.audDef.draft || {};
      const any = DIM_ORDER.some((k) => (d[k] || []).length);
      S.audDef.filters = JSON.parse(JSON.stringify(d));
      S.audDef.mode = any ? 'custom' : 'access';
      S._audCfg = false; S.audUnit = null; render(true); return;
    }
    if (t.id === 'audCfgReset') {
      S.audDef.mode = 'access'; S.audDef.filters = {}; S.audUnit = null; render(true); return;
    }

    const un = cl('[data-unchip]');
    if (un) {
      const k = un.dataset.unchip;
      if (k.indexOf('pick:') === 0) {
        const parts = k.split(':'); const dim = parts[1]; const val = parts.slice(2).join(':');
        S.picks[dim] = pickList(dim).filter((x) => String(x) !== val);
      } else if (k.indexOf('audpick:') === 0) {
        const parts = k.split(':'); const dim = parts[1]; const val = parts.slice(2).join(':');
        S.audPicks[dim] = pickList(dim, 'aud').filter((x) => String(x) !== val);
      } else if (k.indexOf('flt:') === 0) {
        const fk = k.slice(4);
        const p2 = fk.split('.');
        const cur = p2.length === 1 ? S.filters[p2[0]] : S.filters[p2[0]][p2[1]];
        if (Array.isArray(cur)) cur.length = 0;
        else if (typeof cur === 'boolean') setFlt(fk, false);
        else setFlt(fk, '');
        prunePicks();
      }
      else if (k === 'freqSel') S.freqSel = null;
      else if (k === 'audSeg') S.audSeg = null;
      else if (k === 'audUnit') S.audUnit = null;
      else if (k === 'audDef') { S.audDef.mode = 'access'; S.audDef.filters = {}; }
      else S.filters[k] = (typeof S.filters[k] === 'boolean') ? false : '';
      render(true); return;
    }

    const srow = cl('[data-slice]');
    if (srow && srow.dataset.slice) {
      pick(srow.dataset.catscope === 'aud' ? 'aud' : 'rep', srow.dataset.slice, srow.dataset.val, e.shiftKey);
      render(true); return;
    }

    const rep = cl('[data-rep]');
    if (rep) { pick(rep.dataset.catscope === 'aud' ? 'aud' : 'rep', 'report', +rep.dataset.rep, e.shiftKey); render(true); return; }

    const sortTh = cl('th[data-sort]');
    if (sortTh) {
      const sort = catSort(sortTh.dataset.catscope === 'aud' ? 'aud' : 'rep');
      const c = sortTh.dataset.sort;
      if (sort.col === c) sort.dir *= -1; else { sort.col = c; sort.dir = -1; }
      render(true); return;
    }

    const obsH = cl('.obs-h');
    if (obsH) {
      const body = obsH.parentNode.querySelector('.obs-b');
      if (!body) return;                 // «в норме» — раскрывать нечего
      const open = !body.hidden;
      body.hidden = open;
      obsH.setAttribute('aria-expanded', String(!open));
      obsH.querySelector('.obs-caret').textContent = open ? '▸' : '▾';
      obsH.querySelector('.obs-tag').textContent = open ? 'подробнее' : 'свернуть';
      return;
    }

    if (t.id === 'fltReset' || t.id === 'ctxReset') {
      S.picks = { report: [], collection: [], owner: [] };
      S.audPicks = { report: [], collection: [], owner: [] };
      S.repQuery = ''; S.whoQuery = ''; S.audQuery = ''; S.audRepQuery = '';
      S.audSeg = null; S.freqSel = null; S._dd = null;
      S.whoCut = 'none'; S.whoGrpClosed = {};
      S.whoHeads = false; S.whoExcl = []; S.whoExQuery = '';
      S.audUnit = null; S.audDef = { mode: 'access', filters: {}, draft: {} };
      S._audCfg = false;
      S.filters = {
        published: true, actual: true, excludeOwners: true,
        emp: { lvl3: [], lvl4: [], stream: [], spec: [], adgroup: [], login: [], heads: false },
      };
      render(); return;
    }
    if (t.id === 'btnHow') { document.getElementById('howModal').hidden = false; return; }
    if (t.id === 'howClose' || t.id === 'howModal') { document.getElementById('howModal').hidden = true; return; }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset && t.dataset.auddim && t.type === 'checkbox') {
      const k = t.dataset.auddim, v = t.dataset.audval;
      const arr = (S.audDef.draft[k] = S.audDef.draft[k] || []);
      const i = arr.indexOf(v);
      if (t.checked && i < 0) arr.push(v);
      if (!t.checked && i >= 0) arr.splice(i, 1);
      render(true); return;
    }
    if (t.dataset && t.dataset.f) {
      setFlt(t.dataset.f, t.type === 'checkbox' ? t.checked : t.value);
      prunePicks();
      render(true); return;
    }
  });

  let qTimer = null;
  document.addEventListener('input', (e) => {
    const t = e.target;
    const v = t.value;
    const FIELDS = { repQ: 'repQuery', whoQ: 'whoQuery', audQ: 'audQuery', audRepQ: 'audRepQuery', dimQ: '_dimQuery', woExQ: 'whoExQuery' };
    const key = FIELDS[t.id];
    if (!key) return;
    clearTimeout(qTimer);
    const id = t.id;
    qTimer = setTimeout(() => {
      S[key] = v;
      render(true);
      const el = document.getElementById(id);
      if (el) { el.focus(); el.setSelectionRange(v.length, v.length); }
    }, 260);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (S._dd) { S._dd = null; render(true); return; }
      if (S._audCfg) { S._audCfg = false; render(true); return; }
      document.getElementById('howModal').hidden = true;
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role="button"]')) {
      e.preventDefault();
      e.target.click();
    }
  });

  /* --------- Легенда когорт: наведение на ступень гасит всё лишнее -------- */
  document.addEventListener('mouseover', (e) => {
    const st = e.target.closest ? e.target.closest('.ct-st') : null;
    if (!st) return;
    const wrap = document.querySelector('.ct-wrap[data-ctuid="' + st.dataset.ctuid + '"]');
    if (!wrap) return;
    const band = st.dataset.ctband;
    wrap.classList.add('band-on');
    wrap.querySelectorAll('td.ct-cell').forEach((td) => {
      td.classList.toggle('band-hit', td.dataset.band === band);
    });
  });
  document.addEventListener('mouseout', (e) => {
    const st = e.target.closest ? e.target.closest('.ct-st') : null;
    if (!st) return;
    const wrap = document.querySelector('.ct-wrap[data-ctuid="' + st.dataset.ctuid + '"]');
    if (!wrap) return;
    wrap.classList.remove('band-on');
    wrap.querySelectorAll('td.band-hit').forEach((td) => td.classList.remove('band-hit'));
  });

  /* Тень под закреплённой шапкой */
  document.addEventListener('scroll', (e) => {
    const t = e.target;
    if (!t || !t.classList || !(t.classList.contains('tbl-wrap') || t.classList.contains('tbl-scroll'))) return;
    t.classList.toggle('scrolled', t.scrollTop > 2);
  }, true);

  /* ================================ Старт ================================ */
  document.getElementById('freshDate').innerHTML = 'данные на <b>' + U.fmtDate(D.MAX_DATE) + '</b>';
  render();
})();
