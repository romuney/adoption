// ============================================================================
// pa-reports-body.chart.js — «Отчёты и динамика» v5 (2026-09-18, поздний вечер)
// ============================================================================
// КОНТРАКТ PROTEUS:
//   ECharts = только холст. Вся визуализация - HTML/CSS/SVG в overlay.
//   Хост = ПОСЛЕДНИЙ [_echarts_instance_]. Canvas прячем. Overlay - appendChild.
//   В САМОМ КОНЦЕ ФАЙЛА, ГЛОБАЛЬНО: option = {...} с пустым scatter.
//
// ЗАПРЕЩЕНО: backticks/template-literals, стрелочные функции, let/const,
//   document.getElementById (только overlay.querySelector), console.log в итоге,
//   addEventListener внутри тела render(), обращение к option из catch,
//   мутация option после присваивания, var P = '.' + CFG.ns в buildHTML
//   (точка только в buildCSS).
// ОБЯЗАТЕЛЬНО: все 7 блоков ниже, в таком порядке, без перенумерации.
// ОБЯЗАТЕЛЬНО: вызов render(); в теле mount() — без него overlay пустой.
//
// АРХИТЕКТУРА v5 (правка владельца: «тело не должно влиять само на себя
//   кросс-фильтром, только на закрепляемость» — самовлияние отключено в UI).
//   Без самовлияния тело НЕ перезапрашивается от собственных кликов, поэтому
//   датасет pa_body_v5 отдаёт ВСЕ ПЯТЬ разрезов подшапки ОДНИМ ответом:
//   rep + grp(owner/collection) + ov(lvl3/spec) + total. Смена разреза —
//   мгновенный клиентский рендер; фильтрация вкладок друг по другу — тоже
//   клиентская (meta отчётов + точные grp/ov-строки). Эмиссия клика
//   (mode_param + sel_f) читается ТОЛЬКО чартом закрепляемости; телу она
//   безразлична — джиня тела реагирует лишь на period_param (будущая полка).
//
// ВЫЧИСЛЕНИЯ ЖИВУТ ЗДЕСЬ, А НЕ В SQL. Проценты, дельты, ранги, накопительные
//   итоги, сортировка и форматирование считаются в buildModel() (БЛОК 3).
//   SQL отдаёт сырые строки — базу не нагружаем.
// ============================================================================

// ---------- БЛОК 1: CFG ----------
// fields - ТОЛЬКО реальные имена колонок из SQL пользователя.
// Нет поля в SQL - СПРОСИ, не выдумывай и не хардкодь значения.
// Все цвета/шрифты/отступы из макета — только здесь, не в разметке.
var CFG = {
  ns: 'prb',                  // ПРЕФИКС всех CSS-классов и класса overlay
  // 37 колонок куба v6 (датасет 169602, шаблон .pa6_body.sql): 36 колонок
  // v5.1 + state_j (JSON активных условий, только у total-строки).
  // Массивы (colls, ts_*) приходят как JSON-массивы, парсятся в buildModel.
  // ov-секций (lvl3/spec) в v6 НЕТ: людские разрезы живут в чарте pa-who.
  fields: {
    section: 'section', grain: 'grain', dashboard_id: 'dashboard_id',
    group_key: 'group_key', group_val: 'group_val',
    cut_key: 'cut_key', cut_val: 'cut_val',
    cohort_month: 'cohort_month', cohort_size: 'cohort_size',
    dash_nm: 'dash_nm', owner_login: 'owner_login', colls: 'colls',
    published: 'published', certified: 'certified', created_dt: 'created_dt',
    users: 'users', users_prev: 'users_prev',
    views: 'views', views_prev: 'views_prev',
    new_users: 'new_users', new_users_prev: 'new_users_prev',
    regular_users: 'regular_users', regular_users_prev: 'regular_users_prev',
    sleeping_users: 'sleeping_users', views_per_user: 'views_per_user',
    last_view_days: 'last_view_days',
    freq_1: 'freq_1', freq_2: 'freq_2', freq_3: 'freq_3',
    freq_4: 'freq_4', freq_5: 'freq_5',
    ts_k: 'ts_k', ts_users: 'ts_users', ts_new: 'ts_new',
    ts_react: 'ts_react', ts_views: 'ts_views',
    state_j: 'state_j'
  },
  text: { noData: 'Нет данных' },
  // Динамика живёт в ts_* массивах строк (бакеты закодированы возрастом k),
  // отдельной колонки-периода в data нет.
  mode: 'snapshot',
  // Порядок категорий — часть ТЗ (правило 15): и для разметки, и для автомока.
  order: {
    // Когортных секций здесь больше нет: закрепляемость — отдельный чарт
    // на датасете pa_coh_v4 (виджет Виджеты/pa-cohorts.chart.js).
    // ov-секции убраны в v6 (макет 2.5: людские разрезы — в pa-who).
    section: ['rep', 'total', 'grp'],
    grain: ['d', 'w', 'm', 'q'],
    group_key: ['collection', 'owner'],
    published: [1, 0]
  },
  // Разрезы каталога (макет 2.5): только отчётные; key == group_key куба.
  modes: [
    { key: 'report',     label: 'Отчёты',    axis: 'rep', one: 'Отчёт' },
    { key: 'collection', label: 'Коллекции', axis: 'grp', one: 'Коллекция' },
    { key: 'owner',      label: 'Владельцы', axis: 'grp', one: 'Владелец' }
  ],
  grains: {
    d: { n: 30, unit: 'день',    units: 'дней',     label: 'за 30 дней' },
    w: { n: 20, unit: 'неделя',  units: 'недель',   label: 'за 20 недель' },
    m: { n: 12, unit: 'месяц',   units: 'месяцев',  label: 'за 12 месяцев' },
    q: { n: 8,  unit: 'квартал', units: 'кварталов', label: 'за 8 кварталов' }
  },
  prevLabel: { d: 'к пред. 30 дням', w: 'к пред. 20 неделям', m: 'к пред. 12 месяцам', q: 'к пред. 8 кварталам' },
  colors: {
    // Раунд 6 (правка владельца: «где серый цвет между блоками?»): канвас
    // виджета = РОВНО цвет холста борда (--dashboard-background:#f6f6f6) —
    // заливает ячейку целиком, шов с бордом невидим. Блоки (KPI/каталог/
    // динамика) — белые, без рамок и теней; разделение — серыми желобами,
    // как между чартами на борде. Своих паддингов нет, паддинг хоста
    // снимает clampHostPad в mount().
    bg: '#f6f6f6',
    panel: '#fff',
    act: '#0073A0',            // активный тон интерфейса
    ret: '#5CC0EE',            // продолжающие — светлая ступень стека
    react: '#AA77FF',          // вернувшиеся
    new: '#0073A0',            // новые — основание стека
    views: '#5b6478',          // просмотры: вторая панель
    bench: '#c7c8cc',
    seg2: '#218DAE', seg1: '#5CC0EE', seg0: '#d9dce1',
    label: '#2b2b2b', axis: '#808080', axisLine: 'rgb(155, 164, 181)',
    split: '#f0f1f3',
    divLo: '#FFD758',          // ниже медианы — жёлтый
    divHi: '#62CDFF',          // выше медианы — голубой
    txt: '#3a3f4a', mut: '#8a909c',
    up: '#1e8e5a', down: '#c2452d', flat: '#8a909c',
    good: '#1e8e5a', high: '#c2452d', mid: '#b8860b'
  },
  fonts: {
    // ЕДИНЫЙ стек для ВСЕГО виджета, включая тултип в body.
    family: 'Inter,-apple-system,"Segoe UI",Roboto,Arial,sans-serif',
    val: 11, dense: 10, title: 13, title2: 12, legend: 12
  },
  spacing: {
    stackGap: 26,             // зазор между панелями графика (STACK_GAP)
    barGap: 8, barMax: 72, barMin: 3,   // бар: зазор px и клампы ширины
    dense: 16,                // больше N бакетов — плотная сетка
    headroom: 1.3, headroomDense: 1.22   // воздух над марками под подписи
  }
};

// ---------- БЛОК 2: ВХОД + СОСТОЯНИЕ + ХЕЛПЕРЫ ----------
// ВСЕ строки data, не data[0].
var rawData = (typeof data !== 'undefined' && Array.isArray(data)) ? data : [];

// Состояние переживает перерисовку Proteus.
// Для таблиц с поиском/сортировкой/пагинацией имена ключей бери из TABLES.md,
// чтобы правки разных сессий не расходились.
if (!window.__pvtState) window.__pvtState = {};
var __S = window.__pvtState;
if (!__S[CFG.ns]) __S[CFG.ns] = {
  tip: null, view: '',
  // Экран «Отчёты» v6/2.5: правая панель (динамика⇄кто смотрит) и корзины
  // частоты живут в чарте pa-who; здесь только каталог + KPI + наблюдения.
  grain: 'd',                 // d | w | m | q
  mode: 'report',             // ключ из CFG.modes
  // Выбор в каталоге НАКОПИТЕЛЬНЫЙ: по каждому разрезу свой список,
  // ИЛИ внутри разреза, И между разрезами.
  picks: { report: [], collection: [], owner: [] },
  lastPick: null,             // разрез последнего одиночного выбора (для эмиссии)
  repSort: { col: 'users', dir: -1 },
  repQuery: '',               // поиск в каталоге
  page: 0,                    // текущая страница каталога, с 0 (TABLES.md)
  pageSize: 20                // строк на страницу: панель каталога 712px
};
var state = __S[CFG.ns];

// Массив из data приходит и массивом, и JSON-строкой '[1,2,3]'.
function arr(v) {
  if (v == null) return [];
  if (Object.prototype.toString.call(v) === '[object Array]') return v;
  var s = String(v).trim();
  if (!s || s === '[]') return [];
  try { var p = JSON.parse(s); return Object.prototype.toString.call(p) === '[object Array]' ? p : []; }
  catch (e) { return []; }
}
// Идентификатор значения выбора: dashboard_id числом, группы/срезы строкой.
function pickId(v) { var n = num(v); return (n == null || String(n) !== String(v)) ? String(v) : n; }

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
// Числа из BI приходят и числом, и строкой с пробелами-разрядами или запятой.
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  var s = String(v).replace(/[\s ]/g, '');
  // '1,5' -> дробная запятая; '1,234.5' -> запятая это разряды.
  if (s.indexOf(',') > -1 && s.indexOf('.') === -1) s = s.replace(/,/g, '.');
  else s = s.replace(/,/g, '');
  var n = Number(s);
  return isNaN(n) ? null : n;
}
// Универсальный парсер даты: epoch-ms, epoch-s, 'YYYY-MM-DD', 'YYYY-MM'.
// Нужен всегда: DATETIME из Proteus приходит числом, а не строкой из UI.
function toDate(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  var s = String(raw).trim(), d = null;
  if (/^\d{11,}$/.test(s)) { var ms = Number(s); d = new Date(ms > 1e12 ? ms : ms * 1000); }
  else if (/^\d{10}$/.test(s)) d = new Date(Number(s) * 1000);
  else {
    var m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(s);
    if (m) return { y: +m[1], m: +m[2] - 1, d: m[3] ? +m[3] : 1 };
    d = new Date(s);
  }
  if (!d || isNaN(d.getTime())) return null;
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}

// ---------- БЛОК 3: ТРАНСФОРМАЦИЯ ДАННЫХ ----------
// rawData -> структура, удобная для рендера. Только чтение CFG.fields.
// ЗДЕСЬ считается ВСЁ производное: агрегация, доли, дельты, ранги,
// накопительные итоги, сортировка. В SQL этого быть не должно.
//
// КУБ ТЕЛА v6 (pa_body_v6 = .pa6_body.sql) ОТДАЁТ РАЗРЕЗЫ ОДНИМ ОТВЕТОМ:
//   rep — каталог отчётов + мета (владелец/коллекции/даты)
//   grp — точные строки владельцев и коллекций (users/views/динамика)
//   total — ИТОГО + state_j (JSON активных условий запроса: свитки полоски
//           и людская шина pa-who; тело печатает по нему чипы условий)
// ov-секций в v6 нет: людские разрезы живут в чарте pa-who. Смена разреза
// подшапки и фильтрация вкладок друг по другу — клиентские, без похода
// в базу. Клик эмитит mode_param+sel_f для когорт и pa-who; самовлияния
// у тела нет и не нужно.
function buildModel() {
  var F = CFG.fields;
  var M = {
    empty: !rawData.length,
    grainsAvail: {},      // grain -> true (по rep/total-строкам)
    reps: {},             // grain -> { id -> {kpi, freq[5], ts[]} }
    meta: {},             // id -> мета отчёта
    totals: {},           // grain -> {kpi, freq[5], ts[]}
    grps: {},             // grain -> { group_key -> { val -> {kpi, freq, ts} } }
    ids: [],              // id отчётов в порядке data (стабильность сортировок)
    repMode: false,
    stateJ: null          // JSON активных условий из total-строки (или null)
  };

  // KPI-часть строки куба: пары текущий/предыдущий + одиночные.
  //
  // Куб v3 отдаёт 34 колонки вместо 36: regular_users и views_per_user с сервера
  // СНЯТЫ и считаются здесь — первое тождество (days_cur >= 8 = корзины 8-15
  // и 16+), второе деление. Колонку, если она пришла, уважаем: виджет работает
  // и со старым 36-колоночным кубом, и с новым.
  function kpiOf(r) {
    var users = num(r[F.users]) || 0, views = num(r[F.views]) || 0;
    var reg = r[F.regular_users] == null
      ? (num(r[F.freq_4]) || 0) + (num(r[F.freq_5]) || 0)
      : num(r[F.regular_users]) || 0;
    var vpu = r[F.views_per_user] == null
      ? (users ? +(views / users).toFixed(1) : 0)
      : num(r[F.views_per_user]) || 0;
    return {
      users: users, users_prev: num(r[F.users_prev]) || 0,
      views: views, views_prev: num(r[F.views_prev]) || 0,
      new_users: num(r[F.new_users]) || 0, new_users_prev: num(r[F.new_users_prev]) || 0,
      regular_users: reg, regular_users_prev: num(r[F.regular_users_prev]) || 0,
      sleeping_users: num(r[F.sleeping_users]) || 0,
      views_per_user: vpu,
      last_view_days: num(r[F.last_view_days]) || 0,
      reports: 0
    };
  }
  function freqOf(r) {
    return [num(r[F.freq_1]) || 0, num(r[F.freq_2]) || 0, num(r[F.freq_3]) || 0,
            num(r[F.freq_4]) || 0, num(r[F.freq_5]) || 0];
  }
  // ts_* массивы: пары (k, v) собираем и сортируем по k САМИ — порядок
  // groupArray в ClickHouse не гарантирован. Реверс: слева старые (большой
  // k = возраст от max_date), справа свежие (k=0).
  function tsOf(r) {
    var ks = arr(r[F.ts_k]), us = arr(r[F.ts_users]), ns = arr(r[F.ts_new]),
        rs = arr(r[F.ts_react]), vs = arr(r[F.ts_views]);
    var pts = [];
    for (var i = 0; i < ks.length; i++) {
      pts.push({
        k: num(ks[i]), users: num(us[i]) || 0, new_users: num(ns[i]) || 0,
        react_users: num(rs[i]) || 0, views: num(vs[i]) || 0
      });
    }
    pts.sort(function (a, b) { return a.k - b.k; });
    pts.reverse();
    for (var j = 0; j < pts.length; j++) {
      var p = pts[j];
      p.ret_users = Math.max(0, p.users - p.new_users - p.react_users);
    }
    return pts;
  }

  for (var ri = 0; ri < rawData.length; ri++) {
    var r = rawData[ri] || {};
    var sec = String(r[F.section] == null ? '' : r[F.section]);
    var gr = String(r[F.grain] == null ? '' : r[F.grain]);
    var row = { kpi: kpiOf(r), freq: freqOf(r), ts: tsOf(r) };

    if (sec === 'rep' || sec === 'total' || sec === 'grp') {
      M.grainsAvail[gr] = true;
    }
    if (sec === 'rep') {
      M.repMode = true;
      var id = num(r[F.dashboard_id]);
      if (id == null) continue;
      row.id = id;
      if (!M.reps[gr]) M.reps[gr] = {};
      M.reps[gr][id] = row;
      if (!M.meta[id]) {
        M.meta[id] = {
          id: id,
          dash_nm: String(r[F.dash_nm] == null ? '' : r[F.dash_nm]),
          owner_login: String(r[F.owner_login] == null ? '' : r[F.owner_login]),
          colls: arr(r[F.colls]),
          published: num(r[F.published]),
          certified: r[F.certified] == null || r[F.certified] === '' ? null : String(r[F.certified]),
          created_dt: toDate(r[F.created_dt])
        };
        M.ids.push(id);
      }
    } else if (sec === 'total') {
      M.totals[gr] = row;
      // state_j: JSON активных условий (джиня видит все фильтры запроса).
      // Приходит строкой; битую строку молча игнорируем — чипы не критичны.
      if (r[F.state_j] != null && String(r[F.state_j]) !== '') {
        try { M.stateJ = JSON.parse(String(r[F.state_j])); }
        catch (eJ) { M.stateJ = null; }
      }
    } else if (sec === 'grp') {
      var gk = String(r[F.group_key] == null ? '' : r[F.group_key]);
      var gv = String(r[F.group_val] == null ? '' : r[F.group_val]);
      if (!gk || !gv) continue;
      if (!M.grps[gr]) M.grps[gr] = {};
      if (!M.grps[gr][gk]) M.grps[gr][gk] = {};
      M.grps[gr][gk][gv] = row;
    }
  }
  return M;
}
// Модель пересобирается из пришедшего ответа; если ответ вдруг пришёл пустым
// или без каталога (стойкая чужая маска, сбой) — держим прежнюю модель в
// __S.MODEL, экран не опустошается. Полным ответом модель становится новой
// базой. В v5 тело самовлияние не использует, но защита остаётся.
var MODEL = (function () {
  var fresh = buildModel();
  var hasCat = fresh.repMode || Object.keys(fresh.grps).length;
  if (!hasCat && __S.MODEL) { __S.MODEL.empty = false; return __S.MODEL; }
  __S.MODEL = fresh;
  return fresh;
})();

// Выбор и разрез переживают перерисовку Proteus через window.__pvtState
// (живёт, пока жив ифрейм). v5 не восстанавливает разрез по форме ответа:
// ответ всегда несёт ВСЕ секции, state.mode — чистый UI-режим вкладки.

// --- Домен экрана: от state + MODEL к числам (трансляция app.js 104–564) ---
// Вызывается на каждом render, MODEL статичен.
function MODE(k) {
  for (var i = 0; i < CFG.modes.length; i++) if (CFG.modes[i].key === k) return CFG.modes[i];
  return CFG.modes[0];
}
function curGrain() {
  if (MODEL.grainsAvail[state.grain]) return state.grain;
  var order = CFG.order.grain;
  for (var i = 0; i < order.length; i++) if (MODEL.grainsAvail[order[i]]) { state.grain = order[i]; return order[i]; }
  return state.grain;
}
function repRows() {
  var g = curGrain(), byId = MODEL.reps[g] || {}, out = [];
  for (var i = 0; i < MODEL.ids.length; i++) if (byId[MODEL.ids[i]]) out.push(byId[MODEL.ids[i]]);
  return out;
}
function pickList(k) { return state.picks[k] || []; }
function pickCount() {
  var n = 0;
  for (var i = 0; i < CFG.modes.length; i++) n += pickList(CFG.modes[i].key).length;
  return n;
}
function hasRepPick() { return !!(pickList('report').length || pickList('collection').length || pickList('owner').length); }

// Множество отчётов под отчётными разрезами (пересечение непустых).
// excludeMode — разрез-вкладка, СВОИ пики которой не считаются фильтром:
// для вкладки «Отчёты» фильтр — коллекции и владельцы, для вкладки
// «Коллекции» — отчёты и владельцы, и т.д. null — все три действуют
// (это и есть множество «выбранных отчётов» для карточек).
function pickedIds(excludeMode) {
  var rows = repRows(), out = [];
  var reps = excludeMode === 'report' ? [] : pickList('report');
  var cols = excludeMode === 'collection' ? [] : pickList('collection');
  var own = excludeMode === 'owner' ? [] : pickList('owner');
  if (!reps.length && !cols.length && !own.length) return null;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i], m = MODEL.meta[r.id] || {}, ok = true;
    if (reps.length && indexOfId(reps, r.id) < 0) ok = false;
    if (ok && cols.length) {
      var hitC = false;
      for (var c = 0; c < (m.colls || []).length; c++) if (cols.indexOf(String(m.colls[c])) >= 0) hitC = true;
      if (!hitC) ok = false;
    }
    if (ok && own.length && own.indexOf(m.owner_login || '') < 0) ok = false;
    if (ok) out.push(r.id);
  }
  return out;
}
function indexOfId(list, id) {
  for (var i = 0; i < list.length; i++) if (String(list[i]) === String(id)) return i;
  return -1;
}

function selection() {
  var g = curGrain();
  var parts = [];
  for (var i = 0; i < CFG.modes.length; i++) {
    var m = CFG.modes[i], v = pickList(m.key);
    if (v.length) parts.push(v.length === 1 ? String(v[0]) : m.label.toLowerCase() + ': ' + v.length);
  }
  if (!pickCount()) {
    return { kind: 'all', ids: [], title: 'Все отчёты',
      sub: 'клик по строке слева задаёт условие; Shift+клик — несколько' };
  }
  // Ровно один отчёт — своя карточка, свои когорты.
  if (pickList('report').length === 1 && pickCount() === 1) {
    var row = (MODEL.reps[g] || {})[pickList('report')[0]];
    if (row) {
      var m1 = MODEL.meta[row.id] || {};
      return { kind: 'rep', id: row.id, ids: [row.id], title: m1.dash_nm || 'Отчёт',
        sub: 'владелец ' + (m1.owner_login || '—') };
    }
  }
  if (pickCount() === 1 && (pickList('collection').length === 1 || pickList('owner').length === 1)) {
    var gk = pickList('collection').length ? 'collection' : 'owner';
    var gv = pickList(gk)[0];
    var exact = ((MODEL.grps[g] || {})[gk] || {})[gv];
    var cnt = 0;
    if (MODEL.repMode) cnt = groupIds(gk, gv).length;
    return { kind: 'grp', gk: gk, gv: gv, ids: pickedIds(), title: gv, exact: !!exact,
      sub: MODE(gk).one.toLowerCase() + (cnt ? ' · ' + cnt + ' ' + plural(cnt, 'отчёт', 'отчёта', 'отчётов') : '') };
  }
  // Микс нескольких условий — пересечение множеств отчётов.
  var mixIds = pickedIds() || [];
  return { kind: 'mix', ids: mixIds, title: parts.join(' · '),
    sub: mixIds.length + ' ' + plural(mixIds.length, 'отчёт', 'отчёта', 'отчётов') + ' в выборе' };
}

// Отчёты одной группы (коллекция/владелец) — для счётчика в подзаголовке.
function groupIds(gk, gv) {
  var rows = repRows(), out = [];
  for (var i = 0; i < rows.length; i++) {
    var m = MODEL.meta[rows[i].id] || {};
    if (gk === 'collection') {
      for (var c = 0; c < (m.colls || []).length; c++) if (String(m.colls[c]) === String(gv)) out.push(rows[i].id);
    } else if (String(m.owner_login) === String(gv)) out.push(rows[i].id);
  }
  return out;
}

var DEDUP = function (n) { return 1 / (1 + 0.16 * Math.log(1 + n)); };

// Сумма строк с поправкой на пересечение аудиторий (mix-режим макета).
function aggRows(rows) {
  var d = DEDUP(rows.length || 1);
  var k = { users: 0, users_prev: 0, views: 0, views_prev: 0, new_users: 0, new_users_prev: 0,
    regular_users: 0, regular_users_prev: 0, sleeping_users: 0, views_per_user: 0,
    last_view_days: 0, reports: rows.length };
  var freq = [0, 0, 0, 0, 0];
  var byK = {}, order = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    k.users += r.kpi.users; k.users_prev += r.kpi.users_prev;
    k.views += r.kpi.views; k.views_prev += r.kpi.views_prev;
    k.new_users += r.kpi.new_users; k.new_users_prev += r.kpi.new_users_prev;
    k.regular_users += r.kpi.regular_users; k.regular_users_prev += r.kpi.regular_users_prev;
    k.sleeping_users += r.kpi.sleeping_users;
    k.last_view_days = Math.max(k.last_view_days, r.kpi.last_view_days);
    for (var f = 0; f < 5; f++) freq[f] += r.freq[f];
    for (var t = 0; t < r.ts.length; t++) {
      var p = r.ts[t];
      if (!byK[p.k]) { byK[p.k] = { k: p.k, users: 0, new_users: 0, react_users: 0, views: 0 }; order.push(p.k); }
      byK[p.k].users += p.users; byK[p.k].new_users += p.new_users;
      byK[p.k].react_users += p.react_users; byK[p.k].views += p.views;
    }
  }
  var scal = function (v) { return Math.round(v * d); };
  k.users = scal(k.users); k.users_prev = scal(k.users_prev);
  k.new_users = scal(k.new_users); k.new_users_prev = scal(k.new_users_prev);
  k.regular_users = scal(k.regular_users); k.regular_users_prev = scal(k.regular_users_prev);
  k.sleeping_users = scal(k.sleeping_users);
  k.views_per_user = k.users ? +(k.views / k.users).toFixed(1) : 0;
  for (var q = 0; q < 5; q++) freq[q] = Math.round(freq[q] * d);
  order.sort(function (a, b) { return b - a; });   // старые (большой k) слева
  var ts = [];
  for (var o = 0; o < order.length; o++) {
    var pt = byK[order[o]];
    ts.push({
      k: pt.k, users: scal(pt.users), new_users: scal(pt.new_users),
      react_users: scal(pt.react_users), views: Math.round(pt.views),
      ret_users: Math.max(0, scal(pt.users) - scal(pt.new_users) - scal(pt.react_users))
    });
  }
  return { kpi: k, freq: freq, ts: ts, approx: true };
}

// Источник чисел вкладки: { kpi, freq, ts, approx } по выбору и режиму данных.
function source() {
  var g = curGrain(), sl = selection();
  if (sl.kind === 'all') return MODEL.totals[g] || null;
  if (sl.kind === 'rep') return (MODEL.reps[g] || {})[sl.id] || null;
  if (sl.kind === 'grp') {
    var exact = ((MODEL.grps[g] || {})[sl.gk] || {})[sl.gv];
    if (exact) return exact;
    var ids = groupIds(sl.gk, sl.gv), rows2 = [];
    for (var j = 0; j < ids.length; j++) if ((MODEL.reps[g] || {})[ids[j]]) rows2.push(MODEL.reps[g][ids[j]]);
    return rows2.length ? aggRows(rows2) : null;
  }
  if (!sl.ids.length) return null;
  var rows3 = [];
  for (var q = 0; q < sl.ids.length; q++) if ((MODEL.reps[g] || {})[sl.ids[q]]) rows3.push(MODEL.reps[g][sl.ids[q]]);
  return rows3.length ? aggRows(rows3) : null;
}

// Предыдущий период есть в витрине? (12 месяцев истории: m/q — нет)
function hasPrev() {
  var t = MODEL.totals[curGrain()];
  return !!(t && t.kpi.users_prev > 0);
}

// MAU: месячная динамика НЕ зависит от выбранного периода; последний
// ЗАКРЫТЫЙ месяц — k=1 (k=0 — текущий, неполный).
function mauRow() {
  var byM = MODEL.grainsAvail.m ? { reps: MODEL.reps.m, grps: MODEL.grps.m, totals: MODEL.totals.m } : null;
  if (!byM) return null;
  var save = state.grain, res;
  state.grain = 'm';
  res = source();
  state.grain = save;
  if (!res || !res.ts.length) return null;
  var row = null, prev = null;
  for (var i = 0; i < res.ts.length; i++) {
    var p = res.ts[i];
    if (p.k === 1) row = p.users;
    if (p.k === 2) prev = p.users;
  }
  if (row == null) row = res.ts[0].users;   // fallback: крайний правый
  return { users: row, users_prev: prev };
}

// Когорты живут в отдельном чарте (pa_coh_v4): cohortRows/retentionPoints/
// cohortTableHtml/retCurveSvg и дивергентная шкала перенесены в
// Виджеты/pa-cohorts.chart.js целиком, без изменения механики.

// «Что видно в данных»: пороговый отбор фактов, каждый называет порог.
function obsMain(k, sl) {
  var out = [];
  if (!k) return out;
  var dU = k.users_prev ? (k.users / k.users_prev - 1) * 100 : null;
  var shNew = k.users ? k.new_users / k.users * 100 : 0;
  var shReg = k.users ? k.regular_users / k.users * 100 : 0;
  var shSleep = k.users && k.sleeping_users != null ? k.sleeping_users / k.users * 100 : 0;
  var what = sl.kind === 'all' ? 'В Proteus' : '«' + sl.title + '»';
  if (dU != null && Math.abs(dU) >= 10) {
    out.push({ sev: dU > 0 ? 'good' : 'high',
      lead: 'Пользователей ' + (dU > 0 ? 'больше' : 'меньше') + ' на ' + pct(Math.abs(dU)) + ' ' + CFG.prevLabel[curGrain()],
      body: esc(what) + ': за период <b>' + nf(k.users) + '</b> пользователей против <b>' + nf(k.users_prev) +
        '</b> в предыдущем — изменение <b>' + signed(dU, 1, '%') + '</b>.',
      rule: 'изменение к предыдущему периоду ≥10%' });
  }
  if (shNew >= 22) {
    out.push({ sev: 'good',
      lead: 'Новые дают ' + pct(shNew) + ' всей аудитории',
      body: 'Из <b>' + nf(k.users) + '</b> пользователей <b>' + nf(k.new_users) + '</b> пришли впервые. ' +
        'Рост идёт за счёт притока, а не за счёт того, что прежние стали ходить чаще.',
      rule: 'доля новых ≥22%' });
  }
  if (shSleep >= 15) {
    out.push({ sev: 'mid',
      lead: nf(k.sleeping_users) + ' ' + plural(k.sleeping_users, 'пользователь', 'пользователя', 'пользователей') +
        ' ' + plural(k.sleeping_users, 'не заходил', 'не заходили', 'не заходили') + ' больше 30 дней',
      body: '<b>' + nf(k.sleeping_users) + '</b> человек (<b>' + pct(shSleep) + '</b> аудитории) не открывали ничего ' +
        'более 30 дней. Это те, кого уже привели — и потеряли.',
      rule: 'доля не заходивших >30 дней ≥15%' });
  }
  if (shReg < 25) {
    out.push({ sev: 'mid',
      lead: 'Постоянных пользователей ' + pct(shReg) + ' — меньше четверти',
      body: 'Только <b>' + nf(k.regular_users) + '</b> человек заходили 8 и более дней за период. Остальные — эпизодически.',
      rule: 'доля постоянных <25%' });
  }
  if (sl.kind === 'rep') {
    var rep = (MODEL.reps[curGrain()] || {})[sl.id];
    if (rep && rep.kpi.last_view_days >= 14) {
      out.push({ sev: 'high',
        lead: 'Отчёт не открывали ' + days(rep.kpi.last_view_days),
        body: 'Последний просмотр «' + esc(sl.title) + '» был <b>' + days(rep.kpi.last_view_days) +
          '</b> назад, при том что отчёт опубликован.',
        rule: 'с последнего просмотра прошло ≥14 дней' });
    }
  }
  var ord = { high: 0, mid: 1, good: 2, none: 3 };
  out.sort(function (a, b) { return ord[a.sev] - ord[b.sev]; });
  return out;
}

// ---------- БЛОК 4: ФОРМАТИРОВАНИЕ И ЦВЕТ ----------
// Трансляция ui.js: тонкий пробел, типографский минус, русское склонение.
var THIN = ' ';
var MINUS = '−';
var MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
var MONTHS_FULL = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
function p2(n) { return (n < 10 ? '0' : '') + n; }

function nf(v, dec) {
  if (v == null || !isFinite(v)) return '—';
  var d = dec == null ? 0 : dec, neg = v < 0;
  var s = Math.abs(v).toFixed(d).split('.');
  var ii = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
  return (neg ? MINUS : '') + ii + (s[1] ? ',' + s[1] : '');
}
function pct(v, dec) { return (v == null || !isFinite(v)) ? '—' : nf(v, dec == null ? 1 : dec) + '%'; }
function plural(n, one, few, many) {
  n = Math.abs(Math.round(n));
  var d10 = n % 10, d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return one;
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return few;
  return many;
}
function compact(v) {
  if (v == null) return '—';
  var a = Math.abs(v);
  if (a >= 1e6) return nf(v / 1e6, 1) + 'M';
  if (a >= 1e4) return nf(v / 1e3, 0) + 'K';
  if (a >= 1e3) return nf(v / 1e3, 1) + 'K';
  return nf(v, 0);
}
function signed(v, dec, unit) {
  if (v == null || !isFinite(v)) return '—';
  var sign = v > 0 ? '+' : (v < 0 ? MINUS : '');
  return sign + nf(Math.abs(v), dec == null ? 0 : dec) + (unit || '');
}
function days(v) { return v == null ? '—' : nf(v, 0) + THIN + 'дн'; }
function fmtDate(t) {
  return t ? p2(t.d) + '.' + p2(t.m + 1) + '.' + t.y : '—';
}
function monthName(t) { return t ? MONTHS_FULL[t.m] + ' ' + t.y : '—'; }

// Дата бакета от клиента: k=0 — текущий период (решение NOTES §4 от СБОРКИ:
// колонки max_ts в кубе нет, витрина за вчера ⇒ сдвиг подписей ≤1 день).
function tsDate(k, grain) {
  var now = new Date();
  var y = now.getUTCFullYear(), m = now.getUTCMonth(), d = now.getUTCDate();
  if (grain === 'd') { d -= k; }
  else if (grain === 'w') { d -= k * 7; }
  else if (grain === 'm') { m -= k; }
  else { y -= Math.floor(k / 4); m -= (k % 4) * 3; }
  // Нормализация переполнения месяца/дня через UTC-эпоху.
  var dt = new Date(Date.UTC(y, m, d));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
}
// Метки корзин частоты зависят от грануляции («1 день» / «1 неделя» / …).
function freqLabels(grain) {
  var u = CFG.grains[grain] ? CFG.grains[grain].unit : 'день';
  var f = { 'день': ['день', 'дня', 'дней'], 'неделя': ['неделя', 'недели', 'недель'],
    'месяц': ['месяц', 'месяца', 'месяцев'], 'квартал': ['квартал', 'квартала', 'кварталов'] }[u] || ['день', 'дня', 'дней'];
  var lo = function (n) { return n + ' ' + plural(n, f[0], f[1], f[2]); };
  return ['1 ' + f[0], lo(2) + '–3', lo(4) + '–7', lo(8) + '–15', lo(16) + '+'];
}

// Подсказка: тот же HTML-контракт, что и у макетного UI.tipHtml (ui.js 86–106).
function tipHtml(o) {
  if (o == null) return '';
  if (typeof o === 'string') return o;
  var s = '';
  if (o.title) s += '<span class="' + CFG.ns + '-t-h">' + esc(o.title) + '</span>';
  if (o.text) s += '<span class="' + CFG.ns + '-t-x">' + esc(o.text) + '</span>';
  var rows = o.rows || [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!r) continue;
    var mk = r.color
      ? '<i class="' + CFG.ns + '-t-m' + (r.dash ? ' ' + CFG.ns + '-dash' : '') + '" style="' +
        (r.dash ? 'border-top-color:' : 'background:') + r.color + '"></i>'
      : '';
    s += '<span class="' + CFG.ns + '-t-r' + (r.dash ? ' ' + CFG.ns + '-bench' : '') + '">' + mk +
      '<span class="' + CFG.ns + '-t-l">' + esc(r.label) + '</span>' +
      '<b class="' + CFG.ns + '-t-v">' + esc(r.value) + '</b></span>';
  }
  var ns2 = o.note == null ? [] : (Object.prototype.toString.call(o.note) === '[object Array]' ? o.note : [o.note]);
  for (var j = 0; j < ns2.length; j++) {
    if (ns2[j]) s += '<span class="' + CFG.ns + '-t-n">' + esc(ns2[j]) + '</span>';
  }
  return s;
}
function tip(o) { return ' data-tip="' + esc(tipHtml(o)) + '"'; }

// Пилюля изменения: знак — направление, класс — оценка (ui.js 149–163).
function delta(v, opts) {
  var o = opts || {};
  if (v == null || !isFinite(v)) {
    return '<span class="' + CFG.ns + '-nocmp"' + tip({ title: 'Сравнение', text: o.why || 'Не с чем сравнивать: нет предыдущего периода.' }) + '>не сравнивается</span>';
  }
  var cls;
  if (o.neutral) cls = 'neu';
  else if (Math.abs(v) < (o.dead == null ? 0.05 : o.dead)) cls = 'flat';
  else cls = (v > 0) === !o.invert ? 'up' : 'down';
  var vs = o.vs ? '<span class="' + CFG.ns + '-d-vs">' + esc(o.vs) + '</span>' : '';
  var t = o.tip ? tip(o.tip) : '';
  return '<span class="' + CFG.ns + '-delta ' + CFG.ns + '-' + cls + '"' + t + '>' + signed(v, o.dec == null ? 1 : o.dec, o.unit || '') + vs + '</span>';
}

function cssColor(c) {
  if (!c) return '#000';
  if (typeof c === 'string') return c;
  var a = (c.length >= 4) ? c[3] : 1;
  return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')';
}

// ---------- БЛОК 5: РАЗМЕТКА (<style> + HTML) ----------
// КАЖДЫЙ селектор начинается с .<ns>- или с .<ns>-root - иначе стили
// протекут в интерфейс Proteus. НИКАКИХ голых div/table/th/button.
// Стили из макета переносятся СЮДА ЦЕЛИКОМ, а не выбрасываются.
// ЦЕЛИКОМ — кроме рамки самой демо-страницы: фон/отступы body, центрирование,
// фикс-ширина внешнего контейнера НЕ переносятся. Корень остаётся width:100% —
// виджет тянется за ячейкой дашборда (RETRO 48). Оконные @media и vw/vh
// в ячейке не работают: адаптив — от контейнера (RETRO 49, RECIPES.md
// «Рамка макета ≠ рамка виджета»).
function buildCSS() {
  var P = '.' + CFG.ns;
  return [
    '<style>',
    // Токены макета (app.css :root), scoped в корень виджета.
    // root — flex-колонка (2026-09-18): split.main забирает остаток высоты
    // ячейки, серого хвоста под контентом нет → шов до следующего чарта =
    // гаттеру борда (16px), как между панелями внутри чарта.
    P + '-root{width:100%;height:100%;box-sizing:border-box;display:flex;flex-direction:column;font-family:' + CFG.fonts.family + ';',
    '  --card:#fff;--line:#e7e9ee;--line2:#eef0f3;--bg:#f6f6f6;',
    '  --ink:#1f1f1f;--ink2:#3a3f4a;--muted:#8a909c;--muted2:#aab0bb;',
    '  --green:#12b048;--green-bg:#bff2cd;--green-tx:#0a8f3c;',
    '  --red:#f51f1f;--red-bg:#ffcccc;--red-tx:#d11414;',
    '  --act:#0073A0;--act-ink:#015A7D;--blue-bg:#E8F4F9;--act-line:#C4E2ED;',
    '  --new-bg:#F1E9FF;--new-tx:#6C36C9;',
    '  --fs-micro:9.5px;--fs-cap:10.5px;--fs-note:11.5px;--fs-body:12.5px;',
    '  --fs-lead:13.5px;--fs-hero:24px;',
    '  --shadow:0 1px 3px rgba(20,28,45,.06),0 4px 16px rgba(20,28,45,.04);',
    '  --chart-gap:' + CFG.spacing.stackGap + 'px;color-scheme:light;}',
    P + '-root *{box-sizing:border-box;font-family:inherit;}',

    // ── Заголовок страницы и чипы выбора ──
    P + '-page-h{margin:0 0 14px;}',
    P + '-ph-row{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;}',
    P + '-page-h h2{margin:0;font-size:19px;font-weight:700;letter-spacing:-.3px;color:var(--ink);}',
    P + '-page-h p{margin:6px 0 0;font-size:var(--fs-body);color:var(--muted);line-height:1.5;max-width:920px;}',
    P + '-page-h p b{color:var(--ink2);font-weight:600;}',
    P + '-area{font-size:var(--fs-note);color:var(--muted);font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:42%;}',
    P + '-area b{color:var(--ink2);font-weight:600;}',
    P + '-fresh{font-size:var(--fs-note);color:var(--muted);font-weight:500;display:inline-flex;align-items:center;gap:7px;margin-left:auto;}',
    P + '-fresh b{color:var(--ink2);font-weight:600;}',
    P + '-fresh i{width:7px;height:7px;border-radius:50%;background:var(--green);display:inline-block;}',
    P + '-chips{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px;}',
    P + '-chip{display:inline-flex;align-items:center;gap:7px;border-radius:999px;background:var(--blue-bg);border:1px solid var(--act-line);padding:4px 6px 4px 11px;font-size:var(--fs-note);color:var(--act-ink);font-weight:500;}',
    P + '-chip button{width:14px;height:14px;border-radius:50%;border:0;padding:0;cursor:pointer;background:rgba(23,103,127,.16);color:var(--act-ink);font-size:11px;line-height:1;display:inline-flex;align-items:center;justify-content:center;}',
    P + '-chip button:hover{background:rgba(23,103,127,.3);}',
    // Чип внешних условий (state_j: полка/шина «кто смотрит»): информационный,
    // без крестика — снятие живёт в своем чарте (полка/список людей).
    P + '-chip.ext{background:#f2f4f6;border-color:var(--line2);color:var(--ink2);padding-right:11px;cursor:default;}',

    // ── KPI-полоса ──
    // Ячейка тела на борде узкая (~30–40% листа): карточки сами находят
    // число колонок (auto-fit), а не рвутся по пять в ряд.
    P + '-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px;}',
    // Раунд 6: блоки — белые карточки на сером канвасе борда (#f6f6f6),
    // БЕЗ границ и теней — разделение серым желобом, как между чартами.
    // Радиус вернул 2026-09-18: раунд 6 снял у плитки и его вместе с тенью
    // («KPI потеряли скругления»). Тень/рамку не возвращаем — на сером канвасе
    // плитка читается и без них.
    P + '-kpi{background:var(--card);border-radius:12px;padding:13px 15px;}',
    P + '-k-label{font-size:var(--fs-note);color:var(--muted);font-weight:600;display:flex;align-items:center;gap:6px;}',
    P + '-k-val{font-size:var(--fs-hero);font-weight:700;letter-spacing:-.5px;line-height:1.1;color:var(--ink);margin-top:4px;font-variant-numeric:tabular-nums;}',
    P + '-k-row{display:flex;align-items:center;gap:9px;margin-top:8px;flex-wrap:wrap;}',
    P + '-k-row:empty{margin:0;}',
    P + '-k-sub{font-size:var(--fs-note);color:var(--muted);font-weight:500;}',
    P + '-k-sub b{color:var(--ink2);font-weight:600;}',
    P + '-kpi-tag{display:inline-block;font-size:9px;font-weight:600;border-radius:4px;background:var(--blue-bg);color:var(--act-ink);padding:2px 6px;}',
    P + '-delta{display:inline-flex;align-items:center;gap:5px;font-size:var(--fs-note);font-weight:600;border-radius:999px;padding:3px 9px;}',
    P + '-d-vs{font-weight:500;font-size:var(--fs-cap);opacity:.75;}',
    P + '-up{background:var(--green-bg);color:var(--green-tx);}',
    P + '-down{background:var(--red-bg);color:var(--red-tx);}',
    P + '-flat,' + P + '-neu{background:#f0f1f3;}',
    P + '-flat{color:var(--muted);}',
    P + '-neu{color:var(--ink2);}',
    P + '-nocmp{display:inline-block;font-size:11px;font-weight:500;color:var(--muted);cursor:help;border-bottom:1px dotted var(--muted2);}',

    // ── Панели и сетки ──
    P + '-rows{display:flex;flex-direction:column;gap:16px;}',
    // Раунд 6: панель — белый блок на сером канвасе, без границы и тени.
    P + '-panel{background:var(--card);border-radius:12px;overflow:hidden;}',
    P + '-panel-h{padding:14px 16px;font-weight:700;font-size:14.5px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;}',
    // Подзаголовок панели — одна строка всегда: текст меняется от кликов
    // («· только «1 день»»), перенос не должен раздвигать шапку и сдвигать
    // панель по вертикали (правка владельца 2026-09-18).
    P + '-panel-h .sub{font-size:var(--fs-note);color:var(--muted);font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    P + '-h-txt{display:flex;flex-direction:column;gap:2px;min-width:0;}',
    P + '-h-txt .sub b{color:var(--ink2);font-weight:600;}',
    P + '-panel-h .sub-tabs{margin:0 0 0 auto;flex:0 0 auto;}',
    P + '-panel-b{padding:14px 16px;}',
    // Каталог — единственная панель тела (v6/2.5): тянется на всю ячейку,
    // строки скроллятся внутри (-tscroll), пейджер прижат к низу.
    P + '-cat{flex:1;min-height:0;display:flex;flex-direction:column;}',
    P + '-cat ' + P + '-panel-h{flex:0 0 auto;}',
    P + '-cat ' + P + '-panel-b{flex:1;min-height:0;}',
    P + '-panel-b.tbl-wrap{padding-top:0;padding-bottom:0;display:flex;flex-direction:column;}',
    // Каталог: скроллится ТОЛЬКО зона строк, пейджер прижат к низу панели.
    P + '-tscroll{flex:1;min-height:0;overflow:auto;}',
    P + '-pager{display:flex;align-items:center;gap:10px;padding:8px 10px;border-top:1px solid var(--line2);flex:0 0 auto;}',
    P + '-pager .spacer{flex:1;}',
    P + '-pginfo{font-size:var(--fs-note);color:var(--muted);}',
    P + '-pgnum{font-size:var(--fs-note);color:var(--ink2);font-weight:600;min-width:46px;text-align:center;font-variant-numeric:tabular-nums;}',
    P + '-pgbtn{border:1px solid var(--line);background:var(--card);border-radius:6px;min-width:26px;height:24px;font-size:13px;line-height:1;color:var(--ink2);cursor:pointer;padding:0 7px;font-family:inherit;}',
    P + '-pgbtn:hover:not([disabled]){background:#fafbfc;border-color:#d8dce4;}',
    P + '-pgbtn[disabled]{opacity:.4;cursor:default;}',

    // ── Подшапка разрезов ──
    P + '-cutbar{display:flex;flex-direction:column;align-items:stretch;gap:6px;padding:0 16px 12px;}',
    P + '-cb-l{font-size:var(--fs-cap);text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:600;}',
    P + '-sub-tabs{display:inline-flex;gap:3px;background:#eef0f3;border-radius:12px;padding:3px;margin:0;flex-wrap:wrap;}',
    P + '-sub-tab{border:0;background:transparent;padding:6px 12px;border-radius:9px;font-size:var(--fs-note);color:var(--muted);cursor:pointer;font-weight:500;font-family:inherit;}',
    P + '-sub-tab:hover{color:var(--ink2);}',
    P + '-sub-tab.active{background:var(--card);color:var(--ink);}',
    P + '-sub-tab.has{color:var(--act-ink);}',
    P + '-sub-cnt{display:inline-flex;align-items:center;justify-content:center;min-width:15px;height:15px;border-radius:999px;background:var(--blue-bg);color:var(--act-ink);font-size:9px;font-weight:600;margin-left:5px;padding:0 4px;}',
    P + '-sub-tabs.tiny{border-radius:9px;padding:2px;}',
    P + '-sub-tabs.tiny ' + P + '-sub-tab{padding:2px 8px;font-size:var(--fs-note);border-radius:6px;}',

    // ── Таблицы ──
    P + '-ptable{width:100%;border-collapse:collapse;font-size:var(--fs-body);}',
    P + '-ptable th{font-size:var(--fs-cap);text-transform:uppercase;letter-spacing:.3px;color:var(--muted);font-weight:600;text-align:right;padding:8px;position:sticky;top:0;z-index:3;background:var(--card);border-bottom:1px solid var(--line2);}',
    P + '-ptable th.txt{text-align:left;padding-left:10px;}',
    P + '-ptable td{text-align:right;padding:8px;font-weight:400;color:var(--ink2);border-bottom:1px solid var(--line2);white-space:nowrap;}',
    P + '-ptable td.txt{text-align:left;font-weight:600;color:var(--ink);padding-left:10px;white-space:normal;min-width:0;}',
    P + '-ptable td.lead{font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums;}',
    P + '-ptable td .mut{color:var(--muted);font-weight:400;}',
    P + '-urow{cursor:pointer;}',
    P + '-urow:hover{background:#fafbfc;}',
    P + '-urow.sel{background:var(--blue-bg);box-shadow:inset 3px 0 0 var(--act);}',
    P + '-total td{border-top:0;border-bottom:2px solid var(--line);font-weight:600;color:var(--ink);}',
    P + '-ptable.dense th{padding:8px 6px;font-size:var(--fs-cap);}',
    P + '-ptable.dense td{padding:7px 6px;}',
    P + '-ptable.sortable th[data-sort]{cursor:pointer;user-select:none;}',
    P + '-ptable.sortable th[data-sort]:hover{color:var(--ink2);}',
    P + '-ptable .sa{opacity:0;font-size:9px;margin-left:3px;}',
    P + '-ptable th.on{color:var(--ink2);}',
    P + '-ptable th.on .sa{opacity:1;color:var(--act);}',
    P + '-unit-sub{display:block;font-size:var(--fs-cap);color:var(--muted);font-weight:400;margin-top:2px;overflow:hidden;text-overflow:ellipsis;}',
    P + '-rflag{display:inline-block;margin-right:5px;font-size:9px;font-weight:600;border-radius:4px;padding:1px 5px;vertical-align:1px;}',
    P + '-rflag.cert{background:var(--green-bg);color:var(--green-tx);}',
    P + '-rflag.new{background:var(--new-bg);color:var(--new-tx);}',
    P + '-barcell,' + P + '-bar-th{text-align:left !important;padding-left:10px !important;}',
    P + '-cellbar{display:block;width:100%;height:13px;background:#f1f3f6;border-radius:2px;overflow:hidden;}',
    P + '-cellbar i{display:block;height:100%;border-radius:2px;background:' + CFG.colors.ret + ';min-width:2px;}',

    // ── Наблюдения ──
    P + '-obs{border-radius:12px;margin:0 0 16px;overflow:visible;border:1px solid var(--line2);}',
    P + '-obs.sev-high{background:linear-gradient(103deg,#ffeef0 0%,#fdf3f6 38%,#faf7ff 78%,#fcfcfe 100%);}',
    P + '-obs.sev-mid{background:linear-gradient(103deg,#fff5e3 0%,#fdf6ef 38%,#faf7ff 78%,#fcfcfe 100%);}',
    P + '-obs.sev-good{background:linear-gradient(103deg,#e9f9ef 0%,#f4f9f6 38%,#faf8ff 78%,#fcfcfe 100%);}',
    P + '-obs-h{display:flex;align-items:center;gap:10px;padding:12px 15px;cursor:pointer;user-select:none;}',
    P + '-obs-ico{width:22px;height:22px;border-radius:6px;background:rgba(255,255,255,.75);display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex:0 0 auto;}',
    P + '-obs.sev-high ' + P + '-obs-ico{color:var(--red-tx);}',
    P + '-obs.sev-mid ' + P + '-obs-ico{color:#9a6500;}',
    P + '-obs.sev-good ' + P + '-obs-ico{color:var(--green-tx);}',
    P + '-obs-t{font-size:13px;font-weight:600;color:var(--ink2);flex:0 0 auto;}',
    P + '-obs-lead{font-size:var(--fs-body);color:var(--ink2);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    P + '-obs-lead b{font-weight:600;color:var(--ink);}',
    P + '-obs-tag{font-size:11px;font-weight:600;padding:3px 9px;border-radius:6px;background:rgba(255,255,255,.55);flex:0 0 auto;}',
    P + '-obs-b{padding:0 15px 14px;font-size:13px;color:var(--ink2);line-height:1.55;}',
    P + '-obs-b ul{margin:8px 0 0;padding-left:20px;}',
    P + '-obs-b li{margin-bottom:5px;}',
    P + '-obs-b b{color:var(--ink);font-weight:600;}',
    P + '-obs-rule{display:block;font-size:var(--fs-note);color:var(--muted);margin-top:8px;padding-top:6px;border-top:1px solid var(--line2);}',
    P + '-no-insight{display:flex;align-items:center;gap:9px;font-size:var(--fs-body);color:var(--muted);background:var(--card);border:1px solid var(--line2);border-radius:12px;padding:12px 15px;margin-bottom:16px;}',
    P + '-ok-dot{width:8px;height:8px;border-radius:50%;background:var(--green);flex:0 0 auto;}',


    // ── Прочее ──
    P + '-tbl-note{margin-top:8px;font-size:var(--fs-note);color:var(--muted);line-height:1.5;}',
    P + '-tbl-note b{color:var(--ink2);font-weight:600;}',
    P + '-note-inline{font-size:12px;color:var(--muted);background:var(--card);border:1px solid var(--line2);border-radius:9px;padding:8px 12px;}',
    P + '-note-inline b{color:var(--ink2);font-weight:600;}',
    P + '-empty{background:var(--card);border-radius:12px;padding:28px;text-align:center;color:var(--muted);font-size:var(--fs-body);}',
    P + '-empty b{display:block;color:var(--ink);font-size:15px;margin-bottom:8px;}',
    P + '-info{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;border:1px solid var(--line);color:var(--muted);font-size:9px;font-weight:600;cursor:help;flex:0 0 auto;}',
    P + '-info:hover{border-color:var(--act);background:var(--blue-bg);color:var(--act);}',
    P + '-btn{border:1px solid var(--line);background:var(--card);border-radius:9px;padding:6px 12px;font-size:12px;font-weight:500;color:var(--ink2);cursor:pointer;font-family:inherit;}',
    P + '-btn:hover{background:#fafbfc;border-color:#d8dce4;}',
    P + '-psearch{position:relative;flex:0 0 auto;color:var(--muted);margin-left:auto;}',
    P + '-psearch input{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:5px 12px 5px 28px;font-size:12px;color:var(--ink);width:190px;font-family:inherit;}',
    P + '-psearch input:focus{outline:none;border-color:var(--act);}',
    P + '-psearch svg{position:absolute;left:9px;top:50%;transform:translateY(-50%);pointer-events:none;}',
    P + '-chart{display:block;}',

    // ── Слот подшапки: чипы ЗАМЕНЯЮТ вводный абзац той же высоты ──
    P + '-ph-sub{min-height:36px;display:flex;align-items:flex-start;flex-direction:column;justify-content:center;}',
    P + '-ph-sub p{margin:4px 0 0;font-size:var(--fs-body);color:var(--muted);line-height:1.5;max-width:920px;}',
    P + '-ph-sub p b{color:var(--ink2);font-weight:600;}',
    P + '-ph-sub ' + P + '-chips{margin-top:4px;}',

    // ТУЛТИП живёт В BODY, вне -root — шрифт ему НЕ наследуется.
    // Повторяем font-family и position:fixed явно, иначе будет другой шрифт.
    P + '-tip{position:fixed;z-index:99999;pointer-events:none;opacity:0;display:none;'
           + 'font-family:' + CFG.fonts.family + ';box-sizing:border-box;background:#fff;',
    '  border:1px solid #e7e9ee;border-radius:9px;padding:7px 10px;max-width:260px;',
    '  box-shadow:0 10px 30px rgba(24,33,50,.18),0 2px 6px rgba(24,33,50,.08);',
    '  transition:opacity .08s;}',
    P + '-tip ' + P + '-t-h{display:block;font-size:10px;font-weight:600;letter-spacing:.3px;text-transform:uppercase;color:#8a909c;margin-bottom:5px;}',
    P + '-tip ' + P + '-t-x{display:block;font-size:11.5px;color:#3a3f4a;line-height:1.4;}',
    P + '-tip ' + P + '-t-r{display:flex;align-items:center;gap:6px;margin-top:3px;min-width:118px;}',
    P + '-tip ' + P + '-t-m{display:inline-block;flex:0 0 auto;width:10px;height:9px;border-radius:3px;}',
    P + '-tip ' + P + '-t-m.' + CFG.ns + '-dash{height:0;width:14px;border-radius:0;border-top:2px dashed;background:none;}',
    P + '-tip ' + P + '-t-l{font-size:11px;font-weight:500;color:#8a909c;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    P + '-tip ' + P + '-t-v{margin:0 0 0 auto;font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums;color:#1f1f1f;}',
    P + '-tip ' + P + '-t-r.' + CFG.ns + '-bench ' + P + '-t-v{color:#8a909c;font-weight:500;}',
    P + '-tip ' + P + '-t-n{display:block;font-size:10.5px;line-height:1.35;font-weight:400;color:#8a909c;margin-top:6px;padding-top:5px;border-top:1px solid #eef0f3;}',
    '</style>'
  ].join('\n');
}
// --- Сборщики компонентов (трансляция ui.js) ------------------------------
function kpiCard(o) {
  return '<div class="' + CFG.ns + '-kpi">' +
    '<div class="' + CFG.ns + '-k-label">' + esc(o.label) +
      (o.hint ? '<span class="' + CFG.ns + '-info"' + tip(o.hint) + ' aria-hidden="true">i</span>' : '') +
      (o.tag ? '<span class="' + CFG.ns + '-kpi-tag">' + esc(o.tag) + '</span>' : '') +
    '</div>' +
    '<div class="' + CFG.ns + '-k-val">' + o.value + '</div>' +
    '<div class="' + CFG.ns + '-k-row">' + (o.delta || '') + '</div>' +
    '<div class="' + CFG.ns + '-k-row">' + (o.sub ? '<span class="' + CFG.ns + '-k-sub">' + o.sub + '</span>' : '') + '</div>' +
    '</div>';
}
function kpisRow(arr) {
  var h = '<div class="' + CFG.ns + '-kpis">';
  for (var i = 0; i < arr.length; i++) h += arr[i];
  return h + '</div>';
}
function panelHtml(o) {
  return '<div class="' + CFG.ns + '-panel' + (o.cls ? ' ' + CFG.ns + '-' + o.cls : '') + '">' +
    '<div class="' + CFG.ns + '-panel-h">' +
      '<div class="' + CFG.ns + '-h-txt"><span>' + esc(o.title) + '</span>' +
        (o.subHtml ? '<span class="sub">' + o.subHtml + '</span>'
          : (o.sub ? '<span class="sub">' + esc(o.sub) + '</span>' : '')) + '</div>' +
      (o.right || '') +
    '</div>' +
    (o.under || '') +
    '<div class="' + CFG.ns + '-panel-b' + (o.bodyCls ? ' ' + o.bodyCls : '') + '">' + o.body + '</div>' +
    '</div>';
}
function searchBoxHtml(id, placeholder, value) {
  return '<div class="' + CFG.ns + '-psearch">' +
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
    '<input id="' + esc(id) + '" data-search="' + esc(id) + '" type="search" placeholder="' + esc(placeholder) + '" value="' + esc(value || '') + '">' +
    '</div>';
}

// Подшапка «В разрезе»: счётчики накопительного выбора.
function cutBarHtml() {
  var h = '<div class="' + CFG.ns + '-cutbar">' +
    '<span class="' + CFG.ns + '-cb-l">В разрезе</span><div class="' + CFG.ns + '-sub-tabs" role="tablist">';
  for (var i = 0; i < CFG.modes.length; i++) {
    var m = CFG.modes[i], n = pickList(m.key).length;
    h += '<button class="' + CFG.ns + '-sub-tab' + (m.key === state.mode ? ' active' : '') + (n ? ' has' : '') +
      '" role="tab" aria-selected="' + (m.key === state.mode ? 'true' : 'false') +
      '" data-mode="' + esc(m.key) + '" type="button"' +
      (n ? tip({ text: n + ' ' + plural(n, 'условие', 'условия', 'условий') + ' в этом разрезе' }) : '') + '>' +
      esc(m.label) + (n ? '<span class="' + CFG.ns + '-sub-cnt">' + n + '</span>' : '') + '</button>';
  }
  return h + '</div></div>';
}

// --- Каталог: отчёты --------------------------------------------------------
function isFresh(created) {
  if (!created) return false;
  var now = new Date();
  var days = Math.round((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
    Date.UTC(created.y, created.m, created.d)) / 86400000);
  return days <= 90;
}
function reportTableHtml() {
  var g = curGrain(), byId = MODEL.reps[g] || {};
  var rows = [];
  var q = (state.repQuery || '').toLowerCase();
  // Кросс-фильтр вкладок: во вкладке «Отчёты» список сужают пики коллекций
  // и владельцев (правка владельца 2026-09-18: «клик должен фильтровать
  // другие вкладки»). Пики самих отчётов список не сужают — они подсвечены.
  var rel = pickedIds('report');
  for (var i = 0; i < MODEL.ids.length; i++) {
    var id = MODEL.ids[i];
    if (!byId[id]) continue;
    if (rel != null && indexOfId(rel, id) < 0) continue;
    var m = MODEL.meta[id] || {};
    if (q && (String(m.dash_nm || '').toLowerCase().indexOf(q) < 0) &&
      !collsMatch(m, q) && String(m.owner_login || '').toLowerCase().indexOf(q) < 0) continue;
    rows.push({ id: id, m: m, k: byId[id].kpi, vpu: byId[id].kpi.users ? byId[id].kpi.views / byId[id].kpi.users : 0 });
  }
  var sc = state.repSort;
  rows.sort(function (a, b) {
    var va = sc.col === 'dashboard_nm' ? String(a.m.dash_nm || '') : (sc.col === 'vpu' ? a.vpu : (a.k[sc.col] != null ? a.k[sc.col] : 0));
    var vb = sc.col === 'dashboard_nm' ? String(b.m.dash_nm || '') : (sc.col === 'vpu' ? b.vpu : (b.k[sc.col] != null ? b.k[sc.col] : 0));
    var r = va > vb ? 1 : (va < vb ? -1 : 0);
    return r * sc.dir;
  });
  if (!rows.length) {
    return { html: '<div class="' + CFG.ns + '-empty"><b>Ничего не найдено</b>Снимите часть фильтров или очистите поиск.</div>', total: 0 };
  }
  // Пагинация применяется ПОСЛЕДНЕЙ — после поиска и сортировки (TABLES.md);
  // в DOM живёт только текущая страница.
  var PS = state.pageSize || 20;
  var total = rows.length;
  var pages = Math.max(1, Math.ceil(total / PS));
  if ((state.page || 0) > pages - 1) state.page = pages - 1;
  if (state.page < 0) state.page = 0;
  var pg = state.page || 0;
  var pageRows = rows.slice(pg * PS, pg * PS + PS);
  var picked = pickList('report');
  var th = function (col, label, hint) {
    return '<th' + (hint ? tip(hint) : '') + ' data-sort="' + col + '"' +
      (sc.col === col ? ' class="on"' : '') + '>' + esc(label) +
      '<span class="' + CFG.ns + '-sa">' + (sc.dir < 0 ? '▼' : '▲') + '</span></th>';
  };
  var h = '<table class="' + CFG.ns + '-ptable dense sortable"><thead><tr>' +
    '<th class="txt" data-sort="dashboard_nm">Отчёт<span class="' + CFG.ns + '-sa">▲</span></th>' +
    th('users', 'Польз.') + th('views', 'Просм.') +
    th('regular_users', 'Пост.', { text: 'Доля тех, кто заходил в отчёт 8+ раз за период' }) +
    th('last_view_days', 'Тишина', { text: 'Дней с последнего просмотра' }) +
    '</tr></thead><tbody>';
  for (var r = 0; r < pageRows.length; r++) {
    var x = pageRows[r], sel = indexOfId(picked, x.id) >= 0;
    h += '<tr class="' + CFG.ns + '-urow' + (sel ? ' sel' : '') + '" data-rep="' + x.id +
      '" tabindex="0" role="button" aria-pressed="' + sel + '"' +
      tip({
        title: x.m.dash_nm,
        rows: [
          { label: 'Пользователи', value: nf(x.k.users), color: CFG.colors.ret },
          { label: 'Просмотры', value: nf(x.k.views), dash: true, color: CFG.colors.bench },
          { label: 'На пользователя', value: nf(x.vpu, 1) }
        ],
        note: x.m.created_dt ? 'создан ' + fmtDate(x.m.created_dt) : null
      }) + '>' +
      '<td class="txt">' + esc(x.m.dash_nm) +
        '<span class="' + CFG.ns + '-unit-sub">' +
          (isFresh(x.m.created_dt) ? '<i class="' + CFG.ns + '-rflag new"' + tip({ text: 'Создан меньше 90 дней назад' }) + '>новый</i>' : '') +
          esc(x.m.owner_login || '—') + '</span></td>' +
      '<td class="lead">' + nf(x.k.users) + '</td>' +
      '<td>' + compact(x.k.views) + '</td>' +
      '<td>' + pct(x.k.users ? x.k.regular_users / x.k.users * 100 : 0, 0) + '</td>' +
      '<td>' + (x.k.last_view_days === 0 ? '<span class="mut">сегодня</span>' : days(x.k.last_view_days)) + '</td>' +
      '</tr>';
  }
  return { html: h + '</tbody></table>', total: total };
}
function collsMatch(m, q) {
  for (var i = 0; i < (m.colls || []).length; i++) if (String(m.colls[i]).toLowerCase().indexOf(q) >= 0) return true;
  return false;
}

// --- Каталог: группы (коллекция/владелец) ------------------------------------
// v6: строки групп приходят в том же ответе серверно-ТОЧНЫМИ (grp-секции).
// Приближение DEDUP осталось только как фолбэк на случай старого датасета
// без grp-секций. Кросс-фильтрация вкладок: выбор отчётов сужает список
// коллекций/владельцев, выбор коллекции — отчёты и владельцев.
function catalogRows() {
  var g = curGrain();
  var mode = MODE(state.mode);
  if (mode.axis === 'rep') return { rows: null, axis: 'rep' };
  var gk = state.mode;
  var exactByVal = (MODEL.grps[g] || {})[gk] || {};
  var agg = {}, order = [];
  // Кросс-фильтр: во вкладке групп действуют пики ДРУГИХ отчётных разрезов.
  var rel = pickedIds(gk);       // null = фильтра нет, сканируем всё
  var rowsRep = rel == null ? repRows() : [];
  if (rel != null) {
    var byId = MODEL.reps[g] || {};
    for (var ri = 0; ri < rel.length; ri++) if (byId[rel[ri]]) rowsRep.push(byId[rel[ri]]);
  }
  for (var i = 0; i < rowsRep.length; i++) {
    var m = MODEL.meta[rowsRep[i].id] || {};
    var vals = gk === 'collection' ? (m.colls || []) : [m.owner_login];
    for (var c = 0; c < vals.length; c++) {
      var val = String(vals[c]);
      if (!val) continue;
      if (!agg[val]) { agg[val] = { key: val, label: val, n: 0, users: 0, views: 0, regular: 0, users_prev: 0 }; order.push(val); }
      agg[val].n++;
    }
  }
  var hasExact = Object.keys(exactByVal).length > 0;
  var rows2 = [], q2 = (state.repQuery || '').toLowerCase();
  for (var o = 0; o < order.length; o++) {
    var a = agg[order[o]];
    if (q2 && a.label.toLowerCase().indexOf(q2) < 0) continue;
    var ex = exactByVal[a.key];
    rows2.push(ex ? {
      key: a.key, label: a.label, k: ex.kpi, reports: a.n
    } : (function (a2) {
      var d = DEDUP(a2.n);
      return {
        key: a2.key, label: a2.label, reports: a2.n,
        k: { users: Math.round(a2.users * d), views: a2.views, regular_users: Math.round(a2.regular * d),
          users_prev: Math.round(a2.users_prev * d), new_users: 0, reports: a2.n }
      };
    })(a));
  }
  rows2.sort(function (x, y) { return y.k.users - x.k.users; });
  var tot2 = { users: 0, views: 0, regular: 0 };
  if (hasExact && MODEL.totals[g]) tot2 = MODEL.totals[g].kpi;
  else {
    var dd = DEDUP((rel == null ? repRows() : rowsRep).length || 1);
    var scan = rel == null ? repRows() : rowsRep;
    for (var t = 0; t < scan.length; t++) {
      tot2.users += scan[t].kpi.users; tot2.views += scan[t].kpi.views; tot2.regular += scan[t].kpi.regular_users;
    }
    tot2.users = Math.round(tot2.users * dd); tot2.regular = Math.round(tot2.regular * dd);
    tot2.views = Math.round(tot2.views);
  }
  return { rows: rows2, total: tot2, exact: hasExact, axis: 'grp', filtered: rel != null, hasExact: hasExact };
}

// Таблица с полосой (U.barTable). selected — накопительный список ИЛИ одно значение.
function barTableHtml(o) {
  var rows = o.rows || [];
  var max = 1;
  for (var i = 0; i < rows.length; i++) if (rows[i].bar > max) max = rows[i].bar;
  var h = '<table class="' + CFG.ns + '-ptable' + (o.dense ? ' dense' : '') + '"><colgroup>' +
    '<col style="width:' + (o.firstW || '38%') + '">';
  for (var c = 0; c < (o.cols || []).length; c++) h += '<col style="width:' + (o.colW || '13%') + '">';
  h += '<col></colgroup><thead><tr><th class="txt">' + esc(o.firstH || '') + '</th>';
  var cols = o.cols || [];
  for (var k = 0; k < cols.length; k++) {
    h += '<th' + (cols[k].hint ? tip(cols[k].hint) : '') + '>' + esc(cols[k].label) + '</th>';
  }
  h += '<th class="txt ' + CFG.ns + '-bar-th">' + esc(o.barH == null ? 'Распределение' : o.barH) + '</th></tr></thead><tbody>';
  if (o.total) {
    h += '<tr class="' + CFG.ns + '-total"' + (o.total.tip ? tip(o.total.tip) : '') + '><td class="txt">ИТОГО</td>';
    for (var tc = 0; tc < o.total.cells.length; tc++) h += '<td class="' + (tc === 0 ? 'lead' : '') + '">' + o.total.cells[tc] + '</td>';
    h += '<td class="' + CFG.ns + '-barcell"></td></tr>';
  }
  var selv = o.selected == null ? [] : [].concat(o.selected);
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var sel = false;
    for (var sv = 0; sv < selv.length; sv++) if (String(selv[sv]) === String(row.key)) sel = true;
    var act = o.cutKey
      ? ' data-slice="' + esc(o.cutKey) + '" data-val="' + esc(row.key) + '"' +
        ' tabindex="0" role="button" aria-pressed="' + sel + '"'
      : (o.clickAttr
        ? ' data-' + esc(o.clickAttr) + '="' + esc(row.key) + '" tabindex="0" role="button" aria-pressed="' + sel + '"'
        : '');
    h += '<tr class="' + CFG.ns + '-urow' + (sel ? ' sel' : '') + '"' + act + '>' +
      '<td class="txt">' + esc(row.label) + (row.sub ? '<span class="' + CFG.ns + '-unit-sub">' + esc(row.sub) + '</span>' : '') + '</td>';
    for (var cc = 0; cc < row.cells.length; cc++) h += '<td class="' + (cc === 0 ? 'lead' : '') + '">' + row.cells[cc] + '</td>';
    h += '<td class="' + CFG.ns + '-barcell"' + (row.tip ? tip(row.tip) : '') + '>' +
      '<span class="' + CFG.ns + '-cellbar"><i style="width:' + (100 * row.bar / max).toFixed(1) + '%"></i></span></td></tr>';
  }
  h += '</tbody></table>';
  if (o.note) h += '<div class="' + CFG.ns + '-tbl-note">' + o.note + '</div>';
  return h;
}

// --- Наблюдения (U.observations) -------------------------------------------
function observationsHtml(list) {
  if (!list.length) {
    return '<div class="' + CFG.ns + '-no-insight"><span class="' + CFG.ns + '-ok-dot"></span>' +
      'Отклонений выше порогов нет: показатели в пределах обычного разброса.</div>';
  }
  var top = list[0];
  var h = '<div class="' + CFG.ns + '-obs sev-' + (top.sev || 'none') + '">' +
    '<div class="' + CFG.ns + '-obs-h" data-action="obs" role="button" tabindex="0" aria-expanded="false">' +
      '<span class="' + CFG.ns + '-obs-ico" aria-hidden="true">!</span>' +
      '<span class="' + CFG.ns + '-obs-t">Что видно в данных</span>' +
      '<span class="' + CFG.ns + '-obs-lead">' + top.lead + '</span>' +
      '<span class="' + CFG.ns + '-obs-tag">подробнее</span>' +
    '</div>' +
    '<div class="' + CFG.ns + '-obs-b" style="display:none"><ul>';
  for (var i = 0; i < list.length; i++) h += '<li>' + list[i].body + '</li>';
  h += '</ul><span class="' + CFG.ns + '-obs-rule">Отбор по порогам, без языковой модели: ' +
    esc(list.map(function (x) { return x.rule; }).join('; ')) + '.</span></div></div>';
  return h;
}


// Тело каталога — отдельно: поиск в шапке панели пересобирает ТОЛЬКО его,
// не трогая поле ввода (RETRO 68).
// Пейджер каталога: считаем по ПОЛНОМУ набору (после поиска/сортировки),
// в DOM — только текущая страница (TABLES.md, RETRO 30/40).
function pagerHtml(total) {
  var PS = state.pageSize || 20;
  var pages = Math.max(1, Math.ceil(total / PS));
  if ((state.page || 0) > pages - 1) state.page = pages - 1;
  if (state.page < 0) state.page = 0;
  var pg = state.page || 0;
  var from = total ? pg * PS + 1 : 0;
  var to = Math.min(total, (pg + 1) * PS);
  var h = '<div class="' + CFG.ns + '-pager">' +
    '<span class="' + CFG.ns + '-pginfo">Показано ' + nf(from) + THIN + '–' + nf(to) + ' из ' + nf(total) + '</span>' +
    '<span class="spacer"></span>';
  if (pages > 1) {
    h += '<button class="' + CFG.ns + '-pgbtn" data-action="pg-prev" data-pages="' + pages + '"' +
      (pg === 0 ? ' disabled' : '') + ' aria-label="Предыдущая страница" type="button">‹</button>' +
      '<span class="' + CFG.ns + '-pgnum">' + (pg + 1) + ' / ' + pages + '</span>' +
      '<button class="' + CFG.ns + '-pgbtn" data-action="pg-next" data-pages="' + pages + '"' +
      (pg === pages - 1 ? ' disabled' : '') + ' aria-label="Следующая страница" type="button">›</button>';
  }
  return h + '</div>';
}

function catalogTableHtml() {
  var src = source();
  var modeInfo = MODE(state.mode);
  if (!src) {
    return '<div class="' + CFG.ns + '-tbl-note">Каталог считается по секциям отчётов.</div>';
  }
  if (state.mode === 'report' && MODEL.repMode) {
    var rt = reportTableHtml();
    return '<div class="' + CFG.ns + '-tscroll">' + rt.html + '</div>' + pagerHtml(rt.total);
  }
  var cat = catalogRows();
  if (!cat.rows || !cat.rows.length) {
    return '<div class="' + CFG.ns + '-empty"><b>Ничего не найдено</b>' +
      (cat.filtered ? 'Выбор в другой вкладке не оставил здесь ни одной строки — снимите часть условий.' :
        'Очистите поиск или снимите часть условий.') + '</div>';
  }
  var PS = state.pageSize || 20;
  var total2 = cat.rows.length;
  var pages2 = Math.max(1, Math.ceil(total2 / PS));
  if ((state.page || 0) > pages2 - 1) state.page = pages2 - 1;
  if (state.page < 0) state.page = 0;
  var pageRows2 = cat.rows.slice((state.page || 0) * PS, (state.page || 0) * PS + PS);
  var barRows = [], kk;
  for (kk = 0; kk < pageRows2.length; kk++) {
    var cr = pageRows2[kk];
    var cells = [];
    if (cat.axis === 'grp') cells.push(nf(cr.reports));
    cells.push(nf(cr.k.users));
    cells.push(compact(cr.k.views));
    barRows.push({
      key: cr.key, label: cr.label, cells: cells, bar: cr.k.users,
      tip: {
        title: cr.label,
        rows: [{ label: 'Пользователи', value: nf(cr.k.users), color: CFG.colors.ret },
          { label: 'Просмотры', value: compact(cr.k.views), dash: true, color: CFG.colors.bench },
          { label: 'Постоянные', value: pct(cr.k.users ? cr.k.regular_users / cr.k.users * 100 : 0, 0) }]
      }
    });
  }
  var totCells = [];
  if (cat.axis === 'grp') totCells.push(nf(repRows().length));
  totCells.push(nf(cat.total.users));
  totCells.push(compact(cat.total.views));
  var table2 = barTableHtml({
    cutKey: state.mode, selected: pickList(state.mode),
    firstH: modeInfo.one, firstW: '34%', colW: '15%', barH: 'Доля пользователей', dense: true,
    cols: [{ label: 'Отчётов' }, { label: 'Польз.', hint: { text: 'Уникальные пользователи группы за период' } }, { label: 'Просм.' }],
    total: {
      cells: totCells,
      tip: { title: 'ИТОГО', text: 'Пользователи в ИТОГО — уникальные по всей выборке, а не сумма строк: один человек, открывший отчёты двух групп, посчитан один раз.' }
    },
    rows: barRows,
    note: cat.axis === 'grp'
      ? (cat.exact
        ? 'Строки — серверно-точные: пользователь группы — <b>уникальный</b> человек, не сумма отчётов. Просмотры складываются.' +
          (cat.filtered ? ' Список сужен выбором в другой вкладке.' : '')
        : 'Пользователи группы — <b>уникальные</b>; здесь ≈ приближение по отчётам с поправкой на пересечение аудиторий. Просмотры складываются точно.')
      : 'У сотрудника ровно одно значение разреза, строки складываются точно. Вкладки людей не сужаются выбором отчётов: ' +
        'подразделение и специализация — атрибуты людей, из меты отчёта их не вывести.'
  });
  return '<div class="' + CFG.ns + '-tscroll">' + table2 + '</div>' + pagerHtml(total2);
}

// ВНИМАНИЕ: здесь префикс БЕЗ точки. var P = '.' + CFG.ns дал бы class=".pvt-root".
// Чипы активных условий из state_j (куб v6: джиня собирает JSON всех
// фильтров запроса). Это ЧУЖИЕ шины — свитки полоски и людская шина pa-who:
// у тела нет владения их колонками эмита, крестика снятия здесь НЕТ,
// тултип отправляет туда, где условие снимается (решение §4 NOTES).
// Людские условия: одно — именованный чип, два и больше — «Люди: N»
// (макет 2.5); человек подписан логином — ФИО в предагрегате нет (хвост).
function stateChips() {
  var sj = MODEL.stateJ;
  if (!sj) return '';
  var extTip = tip({
    title: 'Активные условия',
    text: 'Пришли из полоски настроек и панели «Кто смотрит» — там же и снимаются. Уже сузили вселенную каталога и карточек.'
  });
  var pplRows = [], nPpl = 0;
  function ppl(label, vals) {
    for (var i = 0; i < vals.length; i++) { nPpl++; pplRows.push({ label: label, value: String(vals[i]) }); }
  }
  var own = [];
  if (sj.pub === '0') own.push('включая неопубликованные');
  if (sj.act === '0') own.push('включая неактуальные');
  if (sj.exc === '0') own.push('с просмотрами владельцев');
  if (sj.heads === '1') { nPpl++; pplRows.push({ label: 'Только руководители', value: 'да' }); }
  if (sj.lvl3) ppl('УС-3', sj.lvl3);
  if (sj.lvl4) ppl('Департамент', sj.lvl4);
  if (sj.stream) ppl('Стрим', sj.stream);
  if (sj.spec) ppl('Специализация', sj.spec);
  if (sj.adg) ppl('AD-группа', sj.adg);
  if (sj.login) ppl('Человек', sj.login);
  var out = '';
  for (var o = 0; o < own.length; o++) {
    out += '<span class="' + CFG.ns + '-chip ext"' + extTip + '>' + esc(own[o]) + '</span>';
  }
  if (nPpl === 1) {
    out += '<span class="' + CFG.ns + '-chip ext"' + extTip + '>' +
      esc(pplRows[0].label + ': ' + pplRows[0].value) + '</span>';
  } else if (nPpl > 1) {
    out += '<span class="' + CFG.ns + '-chip ext"' + tip({
      title: 'Люди: ' + nPpl,
      text: 'Условия по людям из панели «Кто смотрит» — снимаются там же.',
      rows: pplRows.slice(0, 12)
    }) + '>Люди: ' + nPpl + '</span>';
  }
  if (sj.freq && sj.freq.length) {
    var g = curGrain(), labels = freqLabels(g), parts2 = [];
    for (var f = 0; f < sj.freq.length; f++) {
      var ix = parseInt(sj.freq[f], 10) - 1;
      parts2.push(labels[ix] != null ? labels[ix] : String(sj.freq[f]));
    }
    out += '<span class="' + CFG.ns + '-chip ext"' + extTip + '>Частота: ' + esc(parts2.join(', ')) + '</span>';
  }
  return out;
}

function buildHTML() {
  if (MODEL.empty || (!MODEL.repMode && !Object.keys(MODEL.grps).length)) {
    return buildCSS() + '<div class="' + CFG.ns + '-root"><div class="' + CFG.ns + '-empty" style="margin:24px">' +
      '<b>' + esc(CFG.text.noData) + '</b>Куб не вернул ни одной секции.</div></div>';
  }
  var g = curGrain();
  var sl = selection();
  var src = source();
  var dPct = function (a, b) { return b ? (a / b - 1) * 100 : null; };
  var vs = CFG.prevLabel[g];
  var hp = hasPrev();
  var noPrevWhy = 'В витрине 12 месяцев истории. Предыдущего периода такой же длины в ней нет, поэтому сравнивать не с чем.';
  var dlt = function (v, o) {
    return !hp ? delta(null, { why: noPrevWhy }) : delta(v, o);
  };
  var mau = mauRow();
  var mauM = monthName(tsDate(1, 'm'));
  var mauPrevM = monthName(tsDate(2, 'm'));
  var isRep = sl.kind === 'rep';
  var modeInfo = MODE(state.mode);

  var h = [];
  h.push('<div class="' + CFG.ns + '-root">');

  // ── Шапка: заголовок, область, свежесть, чипы условий ──
  // Чип показывает НАЗВАНИЕ, не идентификатор (правка владельца 2026-09-18:
  // «должно показывать название, а не айдишник») и ЗАНИМАЕТ СЛОТ вводного
  // абзаца той же высоты — вёрстка не сдвигается вниз при появлении выбора.
  function chipName(modeKey, val) {
    if (modeKey === 'report') {
      var m = MODEL.meta[num(val)];
      if (m && m.dash_nm) return m.dash_nm;
    }
    return String(val);
  }
  var chips = '';
  var sc = stateChips();
  if (pickCount() || sc) {
    chips = '<div class="' + CFG.ns + '-chips">';
    for (var ci = 0; ci < CFG.modes.length; ci++) {
      var mk = CFG.modes[ci], pv = pickList(mk.key);
      for (var pj = 0; pj < pv.length; pj++) {
        var pl = pv.length === 1 ? MODE(mk.key).one : mk.label;
        chips += '<span class="' + CFG.ns + '-chip"' + tip({ title: pl, text: String(pv[pj]) }) + '>' +
          esc(pl + ': ' + chipName(mk.key, pv[pj])) +
          '<button data-unchip="' + esc(mk.key) + ':' + esc(pv[pj]) + '" aria-label="Снять условие" type="button">×</button></span>';
      }
    }
    chips += sc;
    chips += '</div>';
  }
  var intro = '<p>Клик по строке задаёт условие, Shift+клик накапливает — каталог и карточки ' +
    'пересчитаются под выбор. Период — <b>' + esc(CFG.grains[g].label) + '</b>; динамика и «кто смотрит» — в чарте справа.</p>';
  h.push('<div class="' + CFG.ns + '-page-h"><div class="' + CFG.ns + '-ph-row">' +
    '<h2>Отчёты</h2>' +
    '<span class="' + CFG.ns + '-area">область: <b>' + esc(sl.title) + '</b></span>' +
    '<span class="' + CFG.ns + '-fresh"' + tip({ title: 'Свежесть данных', text: 'Витрина обновляется за вчера. Отдельной колонки с датой среза в кубе нет — подпись отсчитывается от сегодняшней даты.' }) + '><i></i>данные: <b>за вчера</b></span>' +
    '</div><div class="' + CFG.ns + '-ph-sub">' + (chips || intro) + '</div></div>');

  // ── KPI-полоса ──
  if (!src) {
    h.push('<div class="' + CFG.ns + '-note-inline" style="margin-bottom:16px">Карточки и каталог считаются по секциям отчётов куба — ' +
      'в этом ответе куба их нет. Снимите выбор (чипы в шапке) или обновите борд.</div>');
  } else {
    var k = src.kpi;
    var shReg = k.users ? k.regular_users / k.users * 100 : 0;
    var shRegPrev = k.users_prev ? k.regular_users_prev / k.users_prev * 100 : 0;
    var k4 = kpiCard({
      label: 'Постоянных', value: pct(shReg),
      hint: { title: 'Постоянные', text: 'Заходили 8 и более раз за период.', note: 'Порог выбран как «примерно раз в неделю и чаще».' },
      delta: dlt(shReg - shRegPrev, { vs: vs, unit: ' п.п.', dead: 0.3 }),
      sub: '<b>' + nf(k.regular_users) + '</b> ' + plural(k.regular_users, 'человек', 'человека', 'человек')
    });
    h.push(kpisRow([
      kpiCard({
        label: 'Пользователей за период', value: nf(k.users),
        hint: { title: 'Пользователи', text: 'Уникальные логины за период.', note: 'Сумма по периодам больше: один человек заходит в разные дни.' },
        delta: dlt(dPct(k.users, k.users_prev), {
          vs: vs,
          tip: { title: 'Сравнение', rows: [{ label: 'Период', value: nf(k.users) }, { label: 'Предыдущий', value: nf(k.users_prev), dash: true, color: CFG.colors.bench }] }
        }),
        sub: hp ? 'предыдущий: <b>' + nf(k.users_prev) + '</b>' : 'период: <b>' + esc(CFG.grains[g].label) + '</b>'
      }),
      kpiCard({
        label: 'Просмотров', value: compact(k.views),
        hint: { title: 'Просмотры', text: 'Сумма открытий (action_count).' },
        delta: dlt(dPct(k.views, k.views_prev), { vs: vs }),
        sub: 'на пользователя: <b>' + nf(k.users ? k.views / k.users : 0, 1) + '</b>'
      }),
      kpiCard({
        label: 'Новых пользователей', value: nf(k.new_users),
        hint: { title: 'Новые', text: isRep || sl.kind === 'grp' ? 'Впервые открыли этот отчёт за период.' : 'Первый визит в Proteus пришёлся на этот период.' },
        delta: dlt(dPct(k.new_users, k.new_users_prev), { vs: vs }),
        sub: 'доля аудитории: <b>' + pct(k.users ? k.new_users / k.users * 100 : 0) + '</b>'
      }),
      k4,
      kpiCard({
        label: 'MAU · ' + mauM, value: mau ? nf(mau.users) : '—',
        hint: {
          title: 'Месячная аудитория за ' + mauM,
          text: 'Уникальные пользователи за последний ЗАКРЫТЫЙ месяц — это ровно тот столбик, что стоит на графике динамики, если переключить период на 12 месяцев.',
          rows: [
            { label: mauM, value: mau ? nf(mau.users) : '—', color: CFG.colors.ret },
            { label: mauPrevM, value: mau ? nf(mau.users_prev) : '—', dash: true, color: CFG.colors.bench }
          ],
          note: 'Текущий месяц не берём: он неполный. От периода на экране MAU не зависит.'
        },
        delta: mau && mau.users_prev != null ? delta(dPct(mau.users, mau.users_prev), { vs: 'к ' + mauPrevM }) : '',
        sub: mauPrevM + ': <b>' + (mau ? nf(mau.users_prev) : '—') + '</b>'
      })
    ]));
    h.push(observationsHtml(obsMain(src.kpi, sl)));
  }

  // ── Каталог — единственная панель тела (v6/2.5: правая часть ушла в
  // отдельный чарт pa-who). Панель тянется на всю ячейку; ячейка на борде
  // узкая (~30–40%) — таблица плотная, названия режутся ellipsis. ──
  var tableHtml = catalogTableHtml();
  h.push(panelHtml({
    cls: 'cat', title: 'Каталог', sub: 'клик — выбор · Shift+клик — несколько',
    right: searchBoxHtml('repQ', state.mode === 'report' ? 'Найти в каталоге' : 'Найти: ' + modeInfo.one.toLowerCase(), state.repQuery),
    under: cutBarHtml(), bodyCls: 'tbl-wrap', body: tableHtml
  }));

  h.push('</div>');
  return buildCSS() + h.join('');
}

// ---------- БЛОК 6: МОНТАЖ + ИНТЕРАКТИВ ----------
(function mount() {
  try {
    var hosts = document.querySelectorAll('[_echarts_instance_]');
    if (!hosts || hosts.length === 0) return;
    var host = hosts[hosts.length - 1];
    var cvs = host.querySelectorAll('canvas');
    for (var i = 0; i < cvs.length; i++) cvs[i].style.display = 'none';
    var prev = host.querySelector('.' + CFG.ns + '-overlay');
    if (prev) prev.parentNode.removeChild(prev);

    // ── КОМПЕНСАЦИЯ ХОСТ-ПАДДИНГА (правка раунда 4; раунд 5: отступ НЕ возвращаем) ──
    // Хост-карточка красит ячейку белым с паддингом ~16px. Снимаем паддинг
    // БЛИЖАЙШЕГО предка (≥12px, не выше 5 прыжков от эчартс-хоста) — контент
    // до краёв белой карточки, своих отступов виджет не добавляет.
    // Идемпотентно: повторный монтаж ставит те же значения.
    (function clampHostPad() {
      var el = host.parentElement, hops = 0;
      while (el && hops++ < 5) {
        var cs = getComputedStyle(el);
        if (parseFloat(cs.paddingLeft) >= 12 || parseFloat(cs.paddingTop) >= 12) {
          el.style.padding = '0px';
          return;
        }
        el = el.parentElement;
      }
    })();

    var overlay = document.createElement('div');
    overlay.className = CFG.ns + '-overlay';
    // Раунд 6: канвас = цвет борда, БЕЗ своих отступов — блоки от краёв.
    overlay.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;'
      + 'z-index:10;overflow:auto;box-sizing:border-box;border-radius:4px;background:' + CFG.colors.bg + ';';
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(overlay);

    // ── ТУЛТИП ──
    // Создаётся РОВНО ОДИН РАЗ и кэшируется в tipEl.
    // НИКОГДА не создавай его внутри render() и НИКОГДА не клади
    // его разметку в buildHTML(): innerHTML убьёт узел, и тултип перестанет
    // работать после первого же перерисовывания.
    var tipEl = null;
    function getTip() {
      if (tipEl && tipEl.parentNode) return tipEl;
      var old = document.querySelector('body > .' + CFG.ns + '-tip');
      if (old) old.parentNode.removeChild(old);
      tipEl = document.createElement('div');
      tipEl.className = CFG.ns + '-tip';
      document.body.appendChild(tipEl);
      return tipEl;
    }
    getTip();

    // showTip/hideTip — СЛУЖЕБНЫЕ. Не переписывать, не переименовывать, не
    // копировать их логику в свой код. Здесь заперты два правила, на которых
    // ломались все предыдущие версии:
    //   1) тултип спрятан ДВУМЯ свойствами (display + opacity) — показ обязан
    //      снять ОБА. Снял одно — узел построится и останется невидимым,
    //      без ошибок и без единого следа в отладке (RETRO 44);
    //   2) тултип лежит в body с position:fixed, поэтому координаты
    //      getBoundingClientRect() берутся КАК ЕСТЬ, а клампинг идёт по
    //      window.innerWidth/innerHeight — не по размерам контейнера (RETRO 26).
    // Твоё дело — только содержимое и якорь. Видимость и позицию считает showTip.
    function showTip(html, rect) {
      var tip = getTip();
      tip.innerHTML = html;
      tip.style.display = 'block';
      tip.style.left = '0px';
      tip.style.top = '0px';
      var t = tip.getBoundingClientRect();
      var pad = 6, gap = 8;
      var left = rect.left + rect.width / 2 - t.width / 2;
      var top = rect.top + rect.height + gap;
      if (top + t.height > window.innerHeight - pad) top = rect.top - t.height - gap;
      left = Math.max(pad, Math.min(left, window.innerWidth - t.width - pad));
      top = Math.max(pad, Math.min(top, window.innerHeight - t.height - pad));
      tip.style.left = Math.round(left) + 'px';
      tip.style.top = Math.round(top) + 'px';
      tip.style.opacity = '1';
    }
    function hideTip() {
      var tip = getTip();
      tip.style.opacity = '0';
      tip.style.display = 'none';
    }

    // Показ/скрытие тултипа НЕ требует полного render(): hover меняет только
    // содержимое и позицию, полный render() — только на клик (RETRO 20).
    // Якорь (rect) клади в state.tip при наведении: getBoundingClientRect()
    // цели КАК ЕСТЬ, без вычитания rect корня.
    function renderTip() {
      if (!state.tip) { hideTip(); return; }
      // Контент тултипа собран ещё в разметке: data-tip = esc(tipHtml(...)).
      showTip(state.tip.key || '', state.tip.rect);
    }

    // render ТОЛЬКО пересобирает разметку. Делегированные обработчики
    // навешиваются ОДИН РАЗ СНАРУЖИ render(): overlay не пересоздаётся.
    // Любой addEventListener внутри render() ЗАПРЕЩЁН — он создаёт дубли.
    function render() {
      // innerHTML пересобирает DOM, а overlay — скролл-контейнер виджета
      // (overflow:auto): без сохранения позиции любой клик внизу страницы
      // прыгал наверх (правка владельца 2026-09-18). Сохраняем обе оси.
      var st = overlay.scrollTop, sl = overlay.scrollLeft;
      overlay.innerHTML = buildHTML();
      overlay.scrollTop = st;
      overlay.scrollLeft = sl;
      renderTip();
    }

    // Имена атрибутов — ЧАСТЬ КОНТРАКТА, а не стиль: `data-tip`, `data-kind`,
    // `data-action`, `data-view` — ровно эти, ЦЕЛИКОМ. По ним smoke.mjs ищет,
    // что наводить и на что кликать. Своё имя (`data-tip-kind`) он не найдёт,
    // а склейка с префиксом (`CFG.ns + '-data-tip'`) в DOM даёт `pvt-data-tip`:
    // виджет при этом работает — свой же обработчик читает то же имя, — но
    // ВЕСЬ тултиповый слой уходит в N/A, и экрана не видит никто (RETRO 56, 59).
    // Префикс CFG.ns нужен КЛАССАМ, data-атрибутам — нет.
    function trigger(node, attr) {
      while (node && node !== overlay) {
        if (node.getAttribute && node.getAttribute(attr) !== null) return node;
        node = node.parentNode;
      }
      return null;
    }

    // Легенда когорт и её hover-подсветка уехали в чарт закрепляемости
    // (Виджеты/pa-cohorts.chart.js) вместе с когортной таблицей.

    function onOver(e) {
      var el = trigger(e.target, 'data-tip');
      if (!el) return;
      // Якорь — rect ЦЕЛИ как есть. key — готовый HTML контента из data-tip.
      state.tip = {
        rect: el.getBoundingClientRect(),
        kind: el.getAttribute('data-kind') || '',
        key: el.getAttribute('data-tip') || ''
      };
      renderTip();
    }

    function onOut(e) {
      var el = trigger(e.target, 'data-tip');
      if (!el) return;
      // Переход курсора на ДОЧЕРНИЙ узел той же цели тултип не гасит,
      // иначе он мигает посреди наведения.
      var to = e.relatedTarget;
      while (to) {
        if (to === el) return;
        to = to.parentNode;
      }
      state.tip = null;
      hideTip();
    }

    // ── Кросс-фильтр: тело эмитит, закрепляемость слушает ──
    // v5: маска = mode_param + sel_f одиночного выбора, БЕЗ scope_param.
    // Читает её ТОЛЬКО датасет когорт (pa_coh_v4/pa_coh_v5): тело самовлияние
    // отключило (правка владельца в UI) и самовлияние ему больше не нужно —
    // все разрезы приходят одним ответом. Каждый вызов задаёт маску ЦЕЛИКОМ;
    // без одиночного выбора sel_f не кладём = когорты возвращаются к общим.
    // Пустой список НЕ эмитим: applyCrossFilter([]) ронял запрос чарта (783708).
    function modeParamOf(key) {
      return (key === 'report' || key === 'collection' || key === 'owner') ? key : 'cut:' + key;
    }
    // Одиночный выбор разреза: ключи picks совпадают с ключами mode
    // (report/collection/owner/lvl3/spec) — людские разрезы выбираются так же.
    function singlePickOf(modeKey) {
      var l = state.picks[modeKey] || [];
      return l.length === 1 ? l[0] : null;
    }
    // Разрез эмиссии = последний одиночный выбор (когорты следуют за тем,
    // что выбрали последним, даже если открыта другая вкладка), иначе —
    // открытая вкладка без sel_f (общие когорты в её разрезе).
    function updateLastPick() {
      state.lastPick = null;
      for (var i = 0; i < CFG.modes.length; i++) {
        var k = CFG.modes[i].key;
        if ((state.picks[k] || []).length === 1) { state.lastPick = { mode: k }; return; }
      }
    }
    function emitSel() {
      if (typeof applyCrossFilter !== 'function') return;
      var m = (state.lastPick && singlePickOf(state.lastPick.mode) != null)
        ? state.lastPick.mode : state.mode;
      var fl = [{ column: 'mode_param', operator: 'IN', value: [modeParamOf(m)] }];
      var one = singlePickOf(m);
      if (one != null) fl.push({ column: 'sel_f', operator: 'IN', value: [String(one)] });
      applyCrossFilter(fl);
    }
    // Переключение разреза выбор НЕ трогает (правка владельца 2026-09-18:
    // «если я перехожу между вкладками, фильтр сбрасывается, а не должен»).
    // Прежний translatePicks стирал/переносил пики — семантика v3-эпохи.
    // Теперь выбор накопительный ПО ВСЕМ вкладкам сразу: каждая вкладка
    // печатает строки, суженные пиками ДРУГИХ вкладок (pickedIds(exclude)),
    // чипы в шапке показывают весь набор, карточки — по пересечению.

    function togglePick(key, val, additive) {
      var list = state.picks[key] || [];
      var idx = indexOfId(list, val);
      if (additive) {
        // Shift+клик — накопительное ИЛИ внутри разреза (прежняя семантика).
        if (idx >= 0) list.splice(idx, 1);
        else list.push(pickId(val));
      } else {
        // Переклик: клик по другой строке просто меняет выбор; повторный
        // клик по единственной выбранной строке снимает её.
        if (idx >= 0 && list.length === 1) list = [];
        else list = [pickId(val)];
      }
      state.picks[key] = list;
      updateLastPick();
    }

    function onClick(e) {
      // Подшапка «В разрезе»: смена разреза — чистый клиентский рендер,
      // все секции уже в ответе куба. ВЫБОР НЕ СБРАСЫВАЕТСЯ: строки новой
      // вкладки сужаются пиками остальных (pickedIds внутри catalogRows/
      // reportTableHtml). Когортам уходит mode_param последнего выбора.
      var modeBtn = trigger(e.target, 'data-mode');
      if (modeBtn) {
        var key = modeBtn.getAttribute('data-mode');
        state.mode = key;
        state.page = 0;              // другой разрез — другой набор строк
        updateLastPick();
        emitSel();
        render();
        return;
      }
      // Сортировка каталога отчётов.
      var th = trigger(e.target, 'data-sort');
      if (th) {
        var col = th.getAttribute('data-sort');
        if (state.repSort.col === col) state.repSort.dir *= -1;
        else state.repSort = { col: col, dir: col === 'dashboard_nm' ? 1 : -1 };
        state.page = 0;              // пересорт — назад на первую страницу
        var bodyCat = overlay.querySelector('.' + CFG.ns + '-cat .' + CFG.ns + '-panel-b');
        if (bodyCat) bodyCat.innerHTML = catalogTableHtml();
        return;
      }
      // Выбор строки каталога: отчёт / группа / срез — накопительно.
      // Кросс-фильтрация вкладок и карточки пересчитываются на клиенте,
      // серверу уходит только когортная маска.
      var rep = trigger(e.target, 'data-rep');
      if (rep) {
        togglePick('report', rep.getAttribute('data-rep'), e.shiftKey);
        emitSel();
        render();
        return;
      }
      var slice = trigger(e.target, 'data-slice');
      if (slice) {
        togglePick(slice.getAttribute('data-slice'), slice.getAttribute('data-val'), e.shiftKey);
        emitSel();
        render();
        return;
      }
      // Чипы выбора каталога: снять одно.
      var un = trigger(e.target, 'data-unchip');
      if (un) {
        var up = String(un.getAttribute('data-unchip')).split(':');
        var uk = up.shift();
        var uv = up.join(':');
        var pl = state.picks[uk] || [];
        var ix = indexOfId(pl, uv);
        if (ix >= 0) pl.splice(ix, 1);
        state.page = 0;              // состав строк изменился — к началу
        updateLastPick(); emitSel();
        render();
        return;
      }
      // Действия: раскрытие наблюдений, листание каталога.
      var act = trigger(e.target, 'data-action');
      if (act) {
        var a = act.getAttribute('data-action');
        if (a === 'obs') {
          // Тело (-obs-b) — СЕСТРИНСКИЙ узел заголовка с data-action: ищем
          // от родителя. querySelector от самого act искал бы ВНУТРИ
          // заголовка, всегда давал null, и «подробнее» не раскрывался
          // (правка владельца 2026-09-18: «кликаю на подробнее — не
          // раскрывается»).
          var box = act.parentNode ? act.parentNode.querySelector('.' + CFG.ns + '-obs-b') : null;
          if (box) {
            var open = box.style.display !== 'none';
            box.style.display = open ? 'none' : 'block';
            act.setAttribute('aria-expanded', open ? 'false' : 'true');
          }
        } else if (a === 'pg-prev' || a === 'pg-next') {
          // Листание каталога: точечная пересборка тела, как у сортировки —
          // поле поиска, шапка и правая панель не трогаются.
          var pgs = parseInt(act.getAttribute('data-pages'), 10) || 1;
          var npg = (state.page || 0) + (a === 'pg-next' ? 1 : -1);
          state.page = Math.min(pgs - 1, Math.max(0, npg));
          var bodyPg = overlay.querySelector('.' + CFG.ns + '-cat .' + CFG.ns + '-panel-b');
          if (bodyPg) {
            bodyPg.innerHTML = catalogTableHtml();
            // Кнопка пересоздана — вернём фокус, чтобы листать с клавиатуры.
            var fbtn = bodyPg.querySelector('[data-action="' + a + '"]');
            if (fbtn) fbtn.focus();
          }
        }
      }
    }

    // Поиск в каталоге: ТОЧЕЧНАЯ пересборка тела каталога, поле ввода
    // не трогаем — иначе теряются фокус и каретка (RETRO 68).
    function onInput(e) {
      var inp = trigger(e.target, 'data-search');
      if (!inp) return;
      state.repQuery = inp.value || '';
      state.page = 0;                // новый запрос — первая страница
      var bodyCat = overlay.querySelector('.' + CFG.ns + '-cat .' + CFG.ns + '-panel-b');
      if (bodyCat) bodyCat.innerHTML = catalogTableHtml();
    }

    overlay.addEventListener('mouseover', onOver);
    overlay.addEventListener('mouseout', onOut);
    overlay.addEventListener('click', onClick);
    overlay.addEventListener('input', onInput);

    render();

    // ResizeObserver только правит габариты. НЕ вызывать render() — зациклит.
    // Старый observer отключаем: иначе он держит удалённый overlay.
    if (typeof ResizeObserver !== 'undefined') {
      if (state.ro && state.ro.disconnect) state.ro.disconnect();
      var ro = new ResizeObserver(function() {
        overlay.style.width = '100%'; overlay.style.height = '100%';
      });
      ro.observe(host);
      state.ro = ro;
    }
  } catch (e) {
    // option присваивается позже, в БЛОКЕ 7: из catch к нему не обращаться.
    // Ищем overlay внутри СВОЕГО хоста: на дашборде может быть второй виджет
    // с тем же ns, и сообщение об ошибке уедет не туда.
    var box = null;
    var hs = document.querySelectorAll('[_echarts_instance_]');
    if (hs && hs.length) box = hs[hs.length - 1].querySelector('.' + CFG.ns + '-overlay');
    if (!box) box = document.querySelector('.' + CFG.ns + '-overlay');
    if (box) {
      box.innerHTML = '<div style="padding:16px;font:13px -apple-system,Arial,sans-serif;color:#b00020;">'
        + 'Ошибка графика: ' + esc((e && e.message) || e) + '</div>';
    }
  }
})();

// ---------- БЛОК 7: ПУСТОЙ OPTION ----------
// ГЛОБАЛЬНО, В САМОМ КОНЦЕ, ВНЕ функций и IIFE.
// После этого присваивания option не трогать: любая мутация вернёт eCharts
// к отрисовке своего графика поверх overlay.
option = {
  animation: false,
  xAxis: { show: false, type: 'value' },
  yAxis: { show: false, type: 'value' },
  series: [{ type: 'scatter', data: [] }]
};
