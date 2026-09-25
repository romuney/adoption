// ============================================================================
// pa-reports-body.chart.js — «Отчёты»: каталог-селектор области, v7 (2026-09-22)
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
// АРХИТЕКТУРА v7 (лист «Отчёты» = три чарта: полоска · каталог · «Аудитория
//   области»). Этот чарт — ЛЕВЫЙ: каталог отчётов / коллекций / владельцев.
//   Клик по строке задаёт ОБЛАСТЬ и эмитит её правой панели (mode_param +
//   sel_f); сам каталог себя не перечитывает (самовлияние выключено), смена
//   вкладки и кросс-фильтр вкладок — клиентские. KPI, наблюдения, динамика,
//   «кто смотрит» и когорты области — в правой панели (датасет pa_people):
//   там числа ТОЧНЫЕ при любом выборе, включая Shift-мультивыбор. Пилюли
//   активных условий — в шапке листа (датасет pa_strip).
//   Каталог слушает шапку и людскую шину правой панели (куб перезапрашивается).
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
  // Адрес отчёта для кнопки «ссылка» в строке каталога: <origin Proteus> +
  // dashPath + dashboard_id + '/'. Origin берётся со страницы борда (iframe
  // песочницы знает её через document.referrer); dashHost — запасной хост.
  dashHost: 'proteus.tcsbank.ru',
  dashPath: '/superset/dashboard/',
  // 16 колонок куба v7 (датасет pa_body_v42, SQL — поставка 2026-09-22, файл 2):
  // каталог rep/grp + total. colls приходит JSON-массивом, парсится в buildModel.
  // state_j — JSON активных условий запроса (только у total-строки).
  fields: {
    section: 'section', grain: 'grain', dashboard_id: 'dashboard_id',
    group_key: 'group_key', group_val: 'group_val',
    dash_nm: 'dash_nm', owner_login: 'owner_login', colls: 'colls',
    published: 'published', certified: 'certified', created_dt: 'created_dt',
    users: 'users', views: 'views', regular_users: 'regular_users',
    last_view_days: 'last_view_days', rhythm: 'rhythm',
    state_j: 'state_j',
    // Только у каталога вкладки «Аудитория» (датасет pa_body_aud, WITH_CA = true): ЦА отчёта по правам.
    ca_n: 'ca_n', ca_wide: 'ca_wide'
  },
  text: { noData: 'Нет данных' },
  // Каталог — снимок за период; ось времени живёт в правой панели.
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
  // Корзины частоты: верхние границы корзин 1–4 по гранулярности (= FBIN в SQL
  // pa_people и каталога); fopen — пятая корзина подписывается «N+», иначе диапазоном до n.
  fbins: { d: [1, 5, 15], w: [1, 5, 15], m: [1, 3, 6], q: [1, 2, 3] },
  fopen: { d: true, w: true, q: true },
  grains: {
    d: { n: 30, reg: 6, unit: 'день',    units: 'дней',     label: 'за 30 дней' },
    w: { n: 20, reg: 6, unit: 'неделя',  units: 'недель',   label: 'за 20 недель' },
    m: { n: 12, reg: 4, unit: 'месяц',   units: 'месяцев',  label: 'за 12 месяцев' },
    q: { n: 8, reg: 3,  unit: 'квартал', units: 'кварталов', label: 'за 8 кварталов' }
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
  lastEmit: '',               // последняя отправленная маска области (эмит только при смене)
  repSort: { col: 'users', dir: -1 },
  repQuery: '',               // поиск в каталоге
  page: 0,                    // текущая страница каталога, с 0 (TABLES.md)
  pageSize: 20                // строк на страницу: панель каталога 712px
};
var state = __S[CFG.ns];

// Массив из data приходит и массивом, и JSON-строкой '[1,2,3]'.
// Массив из ответа датасета. Proteus отдаёт Array-колонку по-разному: живым
// массивом, JSON-строкой ["a","b"] или Python-представлением ['a', 'b']
// (строковые массивы ClickHouse проходят через str() результата). JSON.parse
// на втором виде падал, и у отчётов «не было коллекций» — вкладки каталога
// переставали фильтровать друг друга. Разбираем все три вида.
function arr(v) {
  if (v == null) return [];
  if (Object.prototype.toString.call(v) === '[object Array]') return v;
  var s = String(v).trim();
  if (!s || s === '[]' || s === '()') return [];
  try { var p = JSON.parse(s); if (Object.prototype.toString.call(p) === '[object Array]') return p; }
  catch (e) { /* не JSON — разбираем как Python/ClickHouse-литерал ниже */ }
  var out = [], i = 0, n = s.length, ch, q, buf, tok;
  var ESC = { n: '\n', t: '\t', r: '\r', '0': '\0', b: '\b', f: '\f' };
  if (s.charAt(0) === '[' || s.charAt(0) === '(') { i = 1; n = s.length - 1; }
  while (i < n) {
    ch = s.charAt(i);
    if (ch === ',' || ch === ' ') { i++; continue; }
    if (ch === "'" || ch === '"') {
      q = ch; buf = ''; i++;
      while (i < n && s.charAt(i) !== q) {
        if (s.charAt(i) === '\\' && i + 1 < n) {
          var e2 = s.charAt(i + 1);
          if (e2 === 'x' || e2 === 'u') {
            var len = e2 === 'x' ? 2 : 4, hex = s.substr(i + 2, len);
            if (/^[0-9a-fA-F]+$/.test(hex) && hex.length === len) { buf += String.fromCharCode(parseInt(hex, 16)); i += 2 + len; continue; }
          }
          buf += ESC.hasOwnProperty(e2) ? ESC[e2] : e2;
          i += 2;
          continue;
        }
        buf += s.charAt(i); i++;
      }
      out.push(buf); i++;
      continue;
    }
    tok = '';
    while (i < n && s.charAt(i) !== ',') { tok += s.charAt(i); i++; }
    tok = tok.trim();
    if (tok && tok !== 'None' && tok !== 'NULL' && tok !== 'null') out.push(isFinite(+tok) ? +tok : tok);
  }
  return out;
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
// КУБ ТЕЛА v7 ОТДАЁТ РАЗРЕЗЫ ОДНИМ ОТВЕТОМ:
//   rep — каталог отчётов + мета (владелец/коллекции/даты)
//   grp — точные строки владельцев и коллекций (уникальные пользователи группы)
//   total — ИТОГО + state_j (JSON активных условий запроса: свитки полоски
//           и людская шина; держится в модели для отладки, чипов в каталоге нет —
//           условия показывает шапка листа пилюлями)
// Смена разреза подшапки и фильтрация вкладок друг по другу — клиентские,
// без похода в базу. Клик эмитит область (mode_param + sel_f) правой панели.
function buildModel() {
  var F = CFG.fields;
  var M = {
    empty: !rawData.length,
    grainsAvail: {},      // grain -> true (по rep/total-строкам)
    reps: {},             // grain -> { id -> {kpi} }
    meta: {},             // id -> мета отчёта
    totals: {},           // grain -> {kpi}
    grps: {},             // grain -> { group_key -> { val -> {kpi} } }
    ids: [],              // id отчётов в порядке data (стабильность сортировок)
    repMode: false,
    hasCa: false,         // каталог вкладки «Аудитория» (есть колонки ЦА)
    stateJ: null          // JSON активных условий из total-строки (или null)
  };

  // Метрики строки каталога: пользователи, просмотры, постоянные (корзины 3–4: 6/6/4/3 активных
  // периодов), дни с последнего просмотра. Остальные KPI — в правой панели.
  function kpiOf(r) {
    return {
      users: num(r[F.users]) || 0,
      views: num(r[F.views]) || 0,
      regular_users: num(r[F.regular_users]) || 0,
      last_view_days: num(r[F.last_view_days]) || 0,
      rh: rhythmOf(r[F.rhythm]),
      ca_n: num(r[F.ca_n]), ca_wide: num(r[F.ca_wide]) === 1
    };
  }

  for (var ri = 0; ri < rawData.length; ri++) {
    var r = rawData[ri] || {};
    var sec = String(r[F.section] == null ? '' : r[F.section]);
    var gr = String(r[F.grain] == null ? '' : r[F.grain]);
    var row = { kpi: kpiOf(r) };
    // Каталог вкладки «Аудитория»: в ответе есть колонки ЦА → вместо «Просм.» — «Охват ЦА».
    if (Object.prototype.hasOwnProperty.call(r, F.ca_n)) M.hasCa = true;

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
      for (var c = 0; c < (m.colls || []).length; c++) if (indexOfId(cols, m.colls[c]) >= 0) hitC = true;
      if (!hitC) ok = false;
    }
    if (ok && own.length && indexOfId(own, m.owner_login || '') < 0) ok = false;
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

// Карточки KPI, «Что видно в данных», MAU и когорты области живут в правой
// панели (Виджеты/pa-area.chart.js, датасет pa_people): там пользователи
// считаются по людям, поэтому точны при любом выборе. Прежняя поправка DEDUP
// (формула макета вместо дедупликации) из каталога удалена.

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

// Метки корзин частоты зависят от грануляции («1 день» / «1 неделя» / …).
function freqLabels(grain) {
  var u = CFG.grains[grain] ? CFG.grains[grain].unit : 'день';
  var f = { 'день': ['день', 'дня', 'дней'], 'неделя': ['неделя', 'недели', 'недель'],
    'месяц': ['месяц', 'месяца', 'месяцев'], 'квартал': ['квартал', 'квартала', 'кварталов'] }[u] || ['день', 'дня', 'дней'];
  // Четыре корзины (та же таблица FBIN, что в SQL): верхние границы корзин 1–3,
  // четвёртая — всё выше: 30 дней / 20 недель — 1 · 2–5 · 6–15 · 16+; 12 месяцев —
  // 1 · 2–3 · 4–6 · 7–12; 8 кварталов — 1 · 2 · 3 · 4+ (в витрине ~5 кварталов истории).
  var b = CFG.fbins[grain] || CFG.fbins.d, n = CFG.grains[grain] ? CFG.grains[grain].n : 30;
  var w = function (x) { return plural(x, f[0], f[1], f[2]); };
  var rg = function (a, c) { return a === c ? a + ' ' + w(a) : a + THIN + '–' + THIN + c + ' ' + w(c); };
  var top = b[2] + 1;
  return ['1 ' + f[0], rg(b[0] + 1, b[1]), rg(b[1] + 1, b[2]),
    CFG.fopen[grain] ? top + '+ ' + f[2] : rg(top, n)];
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
    '  --ink:#23272e;--ink2:#454b55;--muted:#8a909c;--muted2:#aab0bb;',
    '  --green:#12b048;--green-bg:#bff2cd;--green-tx:#0a8f3c;',
    '  --red:#f51f1f;--red-bg:#ffcccc;--red-tx:#d11414;',
    '  --act:#0073A0;--act-ink:#015A7D;--blue-bg:#E8F4F9;--act-line:#C4E2ED;',
    '  --new-bg:#F1E9FF;--new-tx:#6C36C9;',
    '  --fs-micro:9.5px;--fs-cap:10.5px;--fs-note:11.5px;--fs-body:12.5px;',
    '  --fs-lead:13.5px;--fs-hero:24px;',
    '  --shadow:0 1px 3px rgba(20,28,45,.06),0 4px 16px rgba(20,28,45,.04);',
    '  --chart-gap:' + CFG.spacing.stackGap + 'px;color-scheme:light;}',
    P + '-root *{box-sizing:border-box;font-family:inherit;}',

    // ── Область в заголовке панели ──
    P + '-area{font-size:var(--fs-note);color:var(--muted);font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:42%;}',
    P + '-area b{color:var(--ink2);font-weight:500;}',

    // ── Панели и сетки ──
    // Раунд 6: панель — белый блок на сером канвасе, без границы и тени.
    P + '-panel{background:var(--card);border-radius:12px;overflow:hidden;}',
    P + '-panel-h{padding:14px 16px;font-weight:600;font-size:14.5px;display:flex;align-items:center;gap:10px;}',
    // Подзаголовок панели — одна строка всегда: текст меняется от кликов
    // («· только «1 день»»), перенос не должен раздвигать шапку и сдвигать
    // панель по вертикали (правка владельца 2026-09-18).
    P + '-panel-h .sub{font-size:var(--fs-note);color:var(--muted);font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    P + '-h-txt{display:flex;flex-direction:column;gap:2px;min-width:0;}',
    P + '-h-txt .sub b{color:var(--ink2);font-weight:500;}',
    P + '-panel-h .sub-tabs{margin:0 0 0 auto;flex:0 0 auto;}',
    P + '-lnk{border:0;background:transparent;padding:0;font:inherit;color:var(--act);cursor:pointer;}',
    P + '-lnk:hover{text-decoration:underline;}',
    P + '-cat{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;}',
    P + '-panel-b{padding:14px 16px;}',
    // Каталог — единственная панель тела (v6/2.5): тянется на всю ячейку,
    // строки скроллятся внутри (-tscroll), пейджер прижат к низу.
    P + '-cat{flex:1;min-height:0;display:flex;flex-direction:column;}',
    P + '-cat ' + P + '-panel-h{flex:0 0 auto;}',
    P + '-cat ' + P + '-panel-b{flex:1;min-height:0;}',
    P + '-panel-b.tbl-wrap{padding-top:0;padding-bottom:0;display:flex;flex-direction:column;}',
    // Каталог: скроллится ТОЛЬКО зона строк, пейджер прижат к низу панели.
    P + '-tscroll{flex:1;min-height:0;overflow:auto;}',
    // ── ВЫБРАННЫЕ ФИЛЬТРЫ ЧАРТА: общий стиль (ДОСЛОВНО одинаков в pa-reports-body и
    //    pa-area). Строка на сером холсте над карточкой, высота ФИКСИРОВАНА: клик
    //    добавляет/снимает пилюлю, вёрстка не двигается (правка владельца 2026-09-23). ──
    P + '-frow{display:flex;align-items:center;gap:8px;height:34px;margin:0 0 8px;padding:0 4px;min-width:0;flex:0 0 auto;overflow:hidden;}',
    P + '-frow-l{font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:500;flex:0 0 auto;white-space:nowrap;}',
    P + '-frow-p{display:flex;align-items:center;gap:6px;min-width:0;flex:1 1 auto;overflow:hidden;white-space:nowrap;}',
    P + '-frow-h{font-size:var(--fs-note);color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    P + '-fpill{display:inline-flex;align-items:center;gap:6px;height:24px;border-radius:999px;border:1px solid var(--line);padding:0 10px;font-size:var(--fs-note);font-weight:500;flex:0 1 auto;min-width:0;max-width:100%;cursor:default;}',
    // Две пилюли делят строку поровну (длинное имя — «…»); три и больше — одна сводная.
    P + '-fpill.two{max-width:calc(50% - 3px);}',
    P + '-fpill .v{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:0 1 auto;}',
    P + '-fpill .k{opacity:.75;font-weight:400;}',
    P + '-fpill.own{background:var(--blue-bg);border-color:var(--act-line);color:var(--act-ink);padding-right:5px;}',
    P + '-fpill.ppl{background:#f3ecff;border-color:#e2d4ff;color:#5a2fc2;padding-right:5px;}',
    P + '-fpill.ext{background:var(--card);color:var(--ink2);}',
    P + '-fpill button{width:16px;height:16px;border-radius:50%;border:0;padding:0;cursor:pointer;background:rgba(23,103,127,.14);color:inherit;font:inherit;font-size:11px;line-height:1;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;}',
    P + '-fpill button:hover{background:rgba(23,103,127,.3);}',
    P + '-frow-x{border:0;background:transparent;color:var(--act);font:inherit;font-size:var(--fs-note);cursor:pointer;padding:4px 6px;border-radius:6px;flex:0 0 auto;white-space:nowrap;}',
    P + '-frow-x:hover{background:var(--blue-bg);}',
    // ── /ВЫБРАННЫЕ ФИЛЬТРЫ ──
    // ── ТАБЛИЦЫ: общий стиль каталога и «Кто смотрит» (держать ДОСЛОВНО одинаковым
    //    в pa-reports-body.chart.js и pa-area.chart.js — правка владельца 2026-09-23:
    //    «таблицы по-разному отформатированы») ──
    P + '-ptable{width:100%;border-collapse:collapse;font-size:var(--fs-body);font-variant-numeric:tabular-nums;}',
    P + '-ptable th{font-size:var(--fs-cap);text-transform:uppercase;letter-spacing:.3px;color:var(--muted);font-weight:500;text-align:right;padding:9px 8px;position:sticky;top:0;z-index:3;background:var(--card);border-bottom:1px solid var(--line);white-space:nowrap;}',
    P + '-ptable th.txt{text-align:left;padding-left:12px;}',
    P + '-ptable th[data-sort],' + P + '-ptable th.srt{cursor:pointer;user-select:none;}',
    P + '-ptable th[data-sort]:hover,' + P + '-ptable th.srt:hover,' + P + '-ptable th.on{color:var(--ink2);}',
    P + '-sa{display:inline-block;width:9px;margin-left:3px;font-style:normal;font-size:8px;color:var(--act);}',
    P + '-ptable td{text-align:right;padding:6px 8px;height:44px;box-sizing:border-box;font-weight:400;color:var(--ink2);border-bottom:1px solid var(--line2);white-space:nowrap;vertical-align:middle;}',
    P + '-ptable td.txt{text-align:left;padding-left:12px;font-weight:500;color:var(--ink);white-space:normal;min-width:0;}',
    P + '-ptable td.lead{font-weight:500;color:var(--ink);}',
    P + '-ptable td.txt:not(:first-child){font-weight:400;color:var(--ink2);}',
    P + '-ptable td .mut{color:var(--muted);font-weight:400;}',
    P + '-unit-sub{display:block;font-size:var(--fs-cap);color:var(--muted);font-weight:400;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    P + '-ptable tbody tr[role=button]{cursor:pointer;}',
    P + '-ptable tbody tr[role=button]:hover td{background:#fafbfc;}',
    P + '-ptable tbody tr.sel td{background:var(--blue-bg);}',
    P + '-ptable tbody tr.sel td:first-child{box-shadow:inset 3px 0 0 var(--act);}',
    P + '-ptable tr.tot td{font-weight:500;color:var(--ink);border-bottom:2px solid var(--line);}',
    P + '-pager{display:flex;align-items:center;gap:10px;padding:8px 10px;border-top:1px solid var(--line2);flex:0 0 auto;}',
    P + '-pager .spacer{flex:1;}',
    P + '-pginfo{font-size:var(--fs-note);color:var(--muted);}',
    P + '-pgnum{font-size:var(--fs-note);color:var(--ink2);font-weight:500;min-width:46px;text-align:center;font-variant-numeric:tabular-nums;}',
    P + '-pgbtn{border:1px solid var(--line);background:var(--card);border-radius:6px;min-width:26px;height:24px;font-size:13px;line-height:1;color:var(--ink2);cursor:pointer;padding:0 7px;font-family:inherit;}',
    P + '-pgbtn:hover:not([disabled]){background:#fafbfc;border-color:#d8dce4;}',
    P + '-pgbtn[disabled]{opacity:.4;cursor:default;}',
    P + '-cellbar{display:block;width:100%;height:13px;background:#f1f3f6;border-radius:2px;overflow:hidden;}',
    P + '-cellbar i{display:block;height:100%;border-radius:2px;background:' + CFG.colors.ret + ';min-width:2px;}',
    // ── /ТАБЛИЦЫ ──

    // ── Подшапка разрезов ──
    P + '-cutbar{display:flex;flex-direction:column;align-items:stretch;gap:6px;padding:0 16px 12px;}',
    P + '-sub-tabs{display:inline-flex;gap:3px;background:#eef0f3;border-radius:12px;padding:3px;margin:0;flex-wrap:wrap;}',
    P + '-sub-tab{box-sizing:border-box;height:28px;display:inline-flex;align-items:center;line-height:1;border:0;background:transparent;padding:0 12px;border-radius:9px;font-size:var(--fs-note);color:var(--muted);cursor:pointer;font-weight:500;font-family:inherit;}',
    P + '-sub-tab:hover{color:var(--ink2);}',
    P + '-sub-tab.active{background:var(--card);color:var(--ink);}',
    P + '-sub-tab.has{color:var(--act-ink);}',
    P + '-sub-cnt{display:inline-flex;align-items:center;justify-content:center;min-width:15px;height:15px;border-radius:999px;background:var(--blue-bg);color:var(--act-ink);font-size:9px;font-weight:500;margin-left:5px;padding:0 4px;}',
    P + '-sub-tabs.tiny{border-radius:9px;padding:2px;}',
    P + '-sub-tabs.tiny ' + P + '-sub-tab{height:22px;padding:0 8px;font-size:var(--fs-note);border-radius:6px;}',

    // ── Таблицы ──
    P + '-rname{display:flex;align-items:flex-start;gap:6px;min-width:0;}',
    P + '-rname-t{flex:1 1 auto;min-width:0;}',
    P + '-rname ' + P + '-lnkbtn{flex:0 0 auto;}',
    P + '-lnkbtn{display:inline-flex;align-items:center;justify-content:center;width:22px;height:20px;margin:-1px 0 0 -4px;padding:0;border:0;border-radius:6px;'
      + 'background:transparent;color:var(--muted);cursor:pointer;vertical-align:-4px;opacity:.55;font:inherit;font-size:12px;font-weight:600;}',
    P + '-urow:hover ' + P + '-lnkbtn{opacity:1;}',
    P + '-lnkbtn:hover,' + P + '-lnkbtn:focus-visible{opacity:1;background:#e9eef4;color:var(--act);outline:none;}',
    P + '-lnkbtn.ok{opacity:1;color:var(--green-tx, #0a8f3c);background:#e6f6ec;}',
    P + '-lnkbtn.err{opacity:1;color:#c8251f;background:#ffe9e9;}',
    P + '-sig-chip{display:inline-block;font-size:11px;font-weight:500;',
    '  border-radius:999px;padding:2px 9px;}',
    P + '-sig-chip.good{background:var(--green-bg);color:var(--green-tx);}',
    P + '-sig-chip.note{background:var(--blue-bg);color:var(--act-ink);}',
    P + '-sig-chip.neutral{background:#f3f4f6;color:var(--muted);}',
    // Ритм отчёта — те же пилюли, что сегменты людей в «Кто смотрит»:
    // Daily/Weekly — зелёная, Monthly — голубая, Rare — серая, Dead — красная.
    P + '-sig-chip.dead{background:var(--red-bg);color:var(--red-tx);}',
    P + '-rflag{display:inline-block;margin-right:5px;font-size:9px;font-weight:500;border-radius:4px;padding:1px 5px;vertical-align:1px;}',
    P + '-rflag.cert{background:var(--green-bg);color:var(--green-tx);}',
    P + '-rflag.new{background:var(--new-bg);color:var(--new-tx);}',
    P + '-barcell,' + P + '-bar-th{text-align:left !important;padding-left:10px !important;}',

    // ── Наблюдения ──
    P + '-obs-b{padding:0 15px 14px;font-size:13px;color:var(--ink2);line-height:1.55;}',
    P + '-obs-b ul{margin:8px 0 0;padding-left:20px;}',
    P + '-obs-b li{margin-bottom:5px;}',
    P + '-obs-b b{color:var(--ink);font-weight:500;}',


    // ── Прочее ──
    P + '-tbl-note{margin-top:8px;font-size:var(--fs-note);color:var(--muted);line-height:1.5;}',
    P + '-tbl-note b{color:var(--ink2);font-weight:500;}',
    P + '-empty{background:var(--card);border-radius:12px;padding:28px;text-align:center;color:var(--muted);font-size:var(--fs-body);}',
    P + '-empty b{display:block;color:var(--ink);font-size:15px;margin-bottom:8px;}',
    P + '-psearch{position:relative;flex:0 1 230px;min-width:150px;color:var(--muted);margin-left:auto;}',
    P + '-psearch input{box-sizing:border-box;height:34px;border:1px solid var(--line);background:var(--card);border-radius:999px;padding:0 14px 0 32px;font-size:13px;color:var(--ink);width:100%;font-family:inherit;}',
    P + '-psearch input:focus{outline:none;border-color:var(--act);}',
    P + '-psearch svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);pointer-events:none;}',

    // ТУЛТИП живёт В BODY, вне -root — шрифт ему НЕ наследуется.
    // Повторяем font-family и position:fixed явно, иначе будет другой шрифт.
    P + '-tip{position:fixed;z-index:99999;pointer-events:none;opacity:0;display:none;'
           + 'font-family:' + CFG.fonts.family + ';box-sizing:border-box;background:#fff;',
    '  border:1px solid #e7e9ee;border-radius:9px;padding:7px 10px;max-width:260px;',
    '  box-shadow:0 10px 30px rgba(24,33,50,.18),0 2px 6px rgba(24,33,50,.08);',
    '  transition:opacity .08s;}',
    P + '-tip ' + P + '-t-h{display:block;font-size:10px;font-weight:500;letter-spacing:.3px;text-transform:uppercase;color:#8a909c;margin-bottom:5px;}',
    P + '-tip ' + P + '-t-x{display:block;font-size:11.5px;color:#3a3f4a;line-height:1.4;}',
    P + '-tip ' + P + '-t-r{display:flex;align-items:center;gap:6px;margin-top:3px;min-width:118px;}',
    P + '-tip ' + P + '-t-m{display:inline-block;flex:0 0 auto;width:10px;height:9px;border-radius:3px;}',
    P + '-tip ' + P + '-t-m.' + CFG.ns + '-dash{height:0;width:14px;border-radius:0;border-top:2px dashed;background:none;}',
    P + '-tip ' + P + '-t-l{font-size:11px;font-weight:500;color:#8a909c;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    P + '-tip ' + P + '-t-v{margin:0 0 0 auto;font-size:12.5px;font-weight:500;font-variant-numeric:tabular-nums;color:#23272e;}',
    P + '-tip ' + P + '-t-r.' + CFG.ns + '-bench ' + P + '-t-v{color:#8a909c;font-weight:500;}',
    P + '-tip ' + P + '-t-n{display:block;font-size:10.5px;line-height:1.35;font-weight:400;color:#8a909c;margin-top:6px;padding-top:5px;border-top:1px solid #eef0f3;}',
    '</style>'
  ].join('\n');
}
// Строка «Выбранные фильтры» над карточкой — ОБЩИЙ хелпер (одинаков в каталоге
// и панели). own — своё выбранное (снимается × здесь же), ext — пришло из соседнего
// чарта (снимается там). Высота строки постоянна: вёрстка от клика не двигается.
function filterRowHtml(own, ext, hint, ownCls) {
  var N = CFG.ns, h = '';
  // 1 пилюля — во всю строку, 2 — поровну, обе с «…» у длинных имён; 3+ — одна сводная
  // «Применено N фильтров» (полный список во всплывашке, × снимает все).
  if (own.length > 2) {
    var all = [];
    for (var q = 0; q < own.length; q++) all.push({ label: own[q].k || '', value: own[q].v });
    h = '<span class="' + N + '-fpill ' + (ownCls || 'own') + '"' + tip({ title: 'Применённые фильтры', rows: all, note: 'Снять все — ×' }) + '>' +
      '<span class="v">Применено ' + own.length + ' ' + plural(own.length, 'фильтр', 'фильтра', 'фильтров') + '</span>' +
      '<button type="button" data-unpick="*" aria-label="Снять все фильтры">×</button></span>';
    own = [];
  }
  var two = own.length + ext.length === 2 ? ' two' : '';
  for (var i = 0; i < own.length; i++) {
    var o = own[i];
    h += '<span class="' + N + '-fpill ' + (ownCls || 'own') + two + '"' + tip({ title: o.title || o.k, text: o.full || o.v, note: 'Снять — ×' }) + '>' +
      '<span class="v">' + (o.k ? '<span class="k">' + esc(o.k) + ':</span> ' : '') + esc(o.v) + '</span>' +
      '<button type="button" data-unpick="' + esc(o.id) + '" aria-label="Снять фильтр «' + esc(o.v) + '»">×</button></span>';
  }
  for (var j = 0; j < ext.length; j++) {
    var x = ext[j];
    h += '<span class="' + N + '-fpill ext' + two + '"' + tip({ title: x.title || x.k, text: (x.full ? x.full + '. ' : '') + x.from }) + '>' +
      '<span class="v">' + (x.k ? '<span class="k">' + esc(x.k) + ':</span> ' : '') + esc(x.v) + '</span></span>';
  }
  // hint === null — строка без подписи и подсказки (подпись «Выбранные фильтры» одна на лист,
  // над каталогом); высота строки та же, пилюли появляются без сдвига вёрстки.
  return '<div class="' + N + '-frow">' + (hint === null ? '' : '<span class="' + N + '-frow-l">Выбранные фильтры</span>') +
    '<div class="' + N + '-frow-p">' + (h || (hint === null ? '' : '<span class="' + N + '-frow-h">' + esc(hint) + '</span>')) + '</div>' +
    (own.length === 2 ? '<button type="button" class="' + N + '-frow-x" data-unpick="*">Снять все</button>' : '') +
    '</div>';
}
// Пилюли каталога: СВОЁ — отчёты / коллекции / владельцы (× снимает здесь же);
// до двух значений разреза — по пилюле на значение, больше — одна «Отчёты: N».
// ЧУЖОЕ — людская шина из «Кто смотрит» (эхо state_j куба), снимается там.
function catFilterRowHtml() {
  var own = [], ext = [], i, j;
  for (i = 0; i < CFG.modes.length; i++) {
    var md = CFG.modes[i], lst = pickList(md.key);
    if (!lst.length) continue;
    var nm = function (v) { return md.key === 'report' ? ((MODEL.meta[v] || {}).dash_nm || String(v)) : String(v); };
    if (lst.length <= 2) {
      for (j = 0; j < lst.length; j++) own.push({ id: md.key + '|' + lst[j], k: md.one, v: nm(lst[j]) });
    } else {
      var names = [];
      for (j = 0; j < lst.length; j++) names.push(nm(lst[j]));
      own.push({ id: md.key + '|', k: md.label, v: String(lst.length), full: names.slice(0, 12).join(', ') + (names.length > 12 ? '…' : '') });
    }
  }
  var sj = MODEL.stateJ || {}, from = 'Задано в «Кто смотрит» справа — снимается там.';
  var lastOf = function (x) { var ps = String(x).split(' › '); return ps[ps.length - 1]; };
  var many = function (key, one, lots, arr, fmt) {
    if (!arr || !arr.length) return;
    ext.push(arr.length === 1
      ? { k: one, v: fmt ? fmt(arr[0]) : String(arr[0]), full: String(arr[0]), from: from }
      : { k: lots, v: String(arr.length), full: arr.slice(0, 8).join('; '), from: from });
  };
  many('org', 'УС-' + (sj.org && sj.org.length === 1 ? String(sj.org[0]).split(' › ').length + 2 : ''), 'Подразделения', sj.org, lastOf);
  many('lvl3', 'УС-3', 'УС-3', sj.lvl3);
  many('lvl4', 'УС-4', 'УС-4', sj.lvl4);
  many('spec', 'Специализация', 'Специализации', sj.spec);
  many('stream', 'Стрим', 'Стримы', sj.stream);
  many('adg', 'AD-группа', 'AD-группы', sj.adg);
  many('login', 'Человек', 'Люди', sj.login);
  if (sj.heads === '1' || sj.heads === 'n') ext.push({ k: '', v: sj.heads === '1' ? 'Только руководители' : 'Без руководителей', from: from });
  if (sj.exl && sj.exl.length) ext.push({ k: 'Исключено', v: String(sj.exl.length), full: sj.exl.slice(0, 8).join(', '), from: from });
  if (sj.freq && sj.freq.length) {
    var fl = freqLabels(curGrain()), fv = [];
    for (j = 0; j < sj.freq.length; j++) fv.push(fl[parseInt(sj.freq[j], 10) - 1] || sj.freq[j]);
    ext.push({ k: 'Частота', v: fv.join(', '), from: from });
  }
  // Справочные пилюли соседнего чарта не показываем (правка владельца 2026-09-23):
  // в строке — только то, что снимается здесь же ×. Людская шина видна по суженному каталогу.
  ext = [];
  return filterRowHtml(own, ext, 'кликните по строке каталога — выбор появится здесь');
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
    '<div class="' + CFG.ns + '-sub-tabs" role="tablist" aria-label="Разрез каталога">';
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
// Адрес отчёта: origin страницы борда (referrer iframe), иначе dashHost.
// Ритм отчёта (колонка rhythm: людей «daily,weekly,monthly,rare»; все нули — Dead).
// Считается по ЯДРУ — тем, кто возвращается (Daily + Weekly + Monthly): разовые визиты
// после массовой рассылки иначе топили популярные отчёты в Rare. Ритм = ритм хотя бы
// половины ядра; Rare — если ядро меньше RH_CORE_MIN всех, кто заходил за 3 месяца.
var RH_CORE_MIN = 0.1;
function rhythmOf(raw) {
  // Подписи — внутри: функция зовётся при сборке модели, раньше строки с var (подъём даст undefined).
  var RH_LABELS = ['Rare', 'Monthly', 'Weekly', 'Daily'];
  var a = String(raw == null ? '' : raw).split(','), d = num(a[0]) || 0, w = num(a[1]) || 0, m = num(a[2]) || 0, o = num(a[3]) || 0;
  var n = d + w + m + o, core = d + w + m, rank = 0, share = 0;
  if (n) {
    if (!core || core < n * 0.1) { rank = 1; share = n ? o / n : 0; }
    else {
      var half = core / 2;
      if (d >= half) { rank = 4; share = d / core; }
      else if (d + w >= half) { rank = 3; share = (d + w) / core; }
      else { rank = 2; share = 1; }
    }
  }
  // n = 0 — за 3 месяца в отчёт не заходил никто (в пределах фильтров): Dead.
  return { d: d, w: w, m: m, o: o, n: n, core: core, rank: rank, label: rank ? RH_LABELS[rank - 1] : 'Dead', share: share };
}
// Последний заход (last_view_days отсчитан от последнего дня данных — вчера): 0 — «вчера».
function lastSeen(v) { return v === 0 ? 'вчера' : days(v + 1); }
// Подсказка ячейки «Ритм»: ядро и последний заход. Расклад по Daily/Weekly/… не показываем:
// он за 3 месяца и не сходится с «Польз.» выбранного периода — путал бы.
function rhythmTip(k) {
  var r = k.rh;
  if (!r.n) return { title: 'Ритм · Dead', text: 'За последние 3 месяца в отчёт не заходил никто.', rows: [{ label: 'Последний заход', value: lastSeen(k.last_view_days) }] };
  return {
    title: 'Ритм · ' + r.label,
    rows: [{ label: 'Ядро (возвращаются)', value: pct(r.core / r.n * 100, 0) },
      { label: 'Последний заход', value: lastSeen(k.last_view_days) }],
    note: 'Ядро — доля тех, кто возвращается, среди заходивших за 3 месяца. Ритм — как пользуется хотя бы половина ядра; Rare — ядро меньше 10%.'
  };
}
// Подсказка скрепки: действие + ID отчёта (адрес целиком в подсказку не помещается).
function linkTip(id) { return { text: 'Скопировать ссылку на отчёт', rows: [{ label: 'ID отчёта', value: String(id) }] }; }
function dashUrl(id) {
  var origin = '';
  try {
    var m = /^(https?:\/\/[^\/?#]+)/.exec(document.referrer || '') || /^(https?:\/\/[^\/?#]+)/.exec(String(window.location.href || ''));
    origin = m ? m[1] : '';
  } catch (e) { origin = ''; }
  if (!origin) origin = 'https:' + '//' + CFG.dashHost;
  return origin + CFG.dashPath + id + '/';
}
// Иконка «ссылка» (две скобы цепи), рисуется currentColor.
var LINK_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/></svg>';
// Буфер обмена: Clipboard API, при отказе (iframe песочницы без clipboard-write) —
// textarea + execCommand('copy') в том же пользовательском жесте.
function copyText(text, done) {
  function fallback() {
    var ta = document.createElement('textarea'), ok = false;
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-2000px;left:0;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallback()); });
      return;
    }
  } catch (e) { /* Clipboard API недоступен — ниже fallback */ }
  done(fallback());
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
    var kp = byId[id].kpi;
    rows.push({ id: id, m: m, k: kp, vpu: kp.users ? kp.views / kp.users : 0, rs: kp.users ? kp.regular_users / kp.users * 100 : 0, cov: covOf(kp) });
  }
  var sc = state.repSort;
  rows.sort(function (a, b) {
    // «Пост.» в колонке — ДОЛЯ, сортируем по доле (по абсолюту порядок выглядел случайным).
    var val = function (x) {
      if (sc.col === 'dashboard_nm') return String(x.m.dash_nm || '');
      if (sc.col === 'vpu') return x.vpu;
      if (sc.col === 'cov') return x.cov == null || x.k.ca_wide ? -1 : x.cov;
      if (sc.col === 'regular_users') return x.rs;
      if (sc.col === 'rhythm') return x.k.rh.rank + x.k.rh.share;   // чаще → выше; при равном ритме — у кого он твёрже
      return x.k[sc.col] != null ? x.k[sc.col] : 0;
    };
    var va = val(a), vb = val(b);
    var r = va > vb ? 1 : (va < vb ? -1 : 0);
    return r * sc.dir || (b.k.users - a.k.users);
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
      '<span class="' + CFG.ns + '-sa">' + (sc.col === col ? (sc.dir < 0 ? '▼' : '▲') : '') + '</span></th>';
  };
  var h = '<table class="' + CFG.ns + '-ptable dense sortable"><thead><tr>' +
    '<th class="txt' + (sc.col === 'dashboard_nm' ? ' on' : '') + '" data-sort="dashboard_nm">Отчёт<span class="' + CFG.ns + '-sa">' +
      (sc.col === 'dashboard_nm' ? (sc.dir < 0 ? '▼' : '▲') : '') + '</span></th>' +
    th('users', 'Польз.') + (MODEL.hasCa
      ? th('cov', 'Охват ЦА', { title: 'Охват целевой аудитории', text: 'Пользователи за период от ЦА отчёта по правам (AD-группы + поимённо). «—» — доступ почти у всей компании (ЦА ≥ 30% сотрудников) или прав нет. Точный охват с настройкой ЦА — в панели справа.' })
      : th('views', 'Просм.')) +
    th('regular_users', 'Пост.', { text: 'Доля постоянных: заходили в отчёт ' + (CFG.grains[curGrain()] || CFG.grains.d).reg + '+ разных ' + (CFG.grains[curGrain()] || CFG.grains.d).units + ' за период (корзины частоты 3 и 4)' }) +
    th('rhythm', 'Ритм', { title: 'Ритм отчёта', text: 'Как пользуется отчётом его ядро — те, кто возвращается (разовые визиты не в счёт): Daily — хотя бы половина ядра заходит 12+ дней из последних 30, Weekly — 6+ недель из 8, Monthly — 2 из последних 3 месяцев. Rare — возвращающихся меньше 10% всех зрителей, Dead — за 3 месяца не заходил никто. Не зависит от периода полоски.' }) +
    '</tr></thead><tbody>';
  for (var r = 0; r < pageRows.length; r++) {
    var x = pageRows[r], sel = indexOfId(picked, x.id) >= 0;
    h += '<tr class="' + CFG.ns + '-urow' + (sel ? ' sel' : '') + '" data-rep="' + x.id +
      '" tabindex="0" role="button" aria-pressed="' + sel + '"' +
      tip({
        title: x.m.dash_nm,
        rows: [
          { label: 'Пользователи', value: nf(x.k.users), color: CFG.colors.ret },
          { label: 'Постоянные', value: nf(x.k.regular_users) + ' · ' + pct(x.rs, 0) },
          MODEL.hasCa ? { label: 'ЦА по правам', value: x.k.ca_n ? nf(x.k.ca_n) + (x.k.ca_wide ? ' · почти вся компания' : '') : 'прав нет' } : { label: 'Просмотров на пользователя', value: nf(x.vpu, 1) }
        ],
        note: x.m.created_dt ? 'создан ' + fmtDate(x.m.created_dt) : null
      }) + '>' +
      // Скрепка слева, текст — отдельным блоком справа: вторая строка длинного
      // названия и строка владельца выровнены по первой, а не уходят под иконку.
      '<td class="txt"><div class="' + CFG.ns + '-rname">' +
        '<button type="button" class="' + CFG.ns + '-lnkbtn" data-replink="' + x.id + '" aria-label="Скопировать ссылку на отчёт"' + tip(linkTip(x.id)) + '>' + LINK_SVG + '</button>' +
        '<div class="' + CFG.ns + '-rname-t">' + esc(x.m.dash_nm) +
        '<span class="' + CFG.ns + '-unit-sub">' +
          (isFresh(x.m.created_dt) ? '<i class="' + CFG.ns + '-rflag new"' + tip({ text: 'Создан меньше 90 дней назад' }) + '>новый</i>' : '') +
          esc(x.m.owner_login || '—') + '</span></div></div></td>' +
      '<td class="lead">' + nf(x.k.users) + '</td>' +
      (MODEL.hasCa ? covCellHtml(x) : '<td>' + compact(x.k.views) + '</td>') +
      '<td>' + pct(x.k.users ? x.k.regular_users / x.k.users * 100 : 0, 0) + '</td>' +
      // Ритм — пилюлей; своя подсказка — только о ритме (ядро и последний заход).
      '<td class="rh"' + tip(rhythmTip(x.k)) + '><span class="' + CFG.ns + '-sig-chip ' + (['dead', 'neutral', 'note', 'good', 'good'][x.k.rh.rank] || 'dead') + '">' + esc(x.k.rh.label) + '</span></td>' +
      '</tr>';
  }
  return { html: h + '</tbody></table>', total: total };
}
// Охват ЦА отчёта: пользователи за период / ЦА по правам (потолок 100%: в каталоге не видно,
// кто из зрителей входит в ЦА — зрители почти всегда с доступом; точно — в панели справа).
function covOf(k) { return k.ca_n ? Math.min(100, k.users / k.ca_n * 100) : null; }
function covCellHtml(x) {
  if (x.cov == null || x.k.ca_wide) return '<td><span class="mut">—</span></td>';
  return '<td>' + pct(x.cov, x.cov < 10 ? 1 : 0) + '</td>';
}
function collsMatch(m, q) {
  for (var i = 0; i < (m.colls || []).length; i++) if (String(m.colls[i]).toLowerCase().indexOf(q) >= 0) return true;
  return false;
}

// --- Каталог: группы (коллекция/владелец) ------------------------------------
// Строки групп приходят в том же ответе серверно-ТОЧНЫМИ (grp-секции куба):
// пользователь группы — уникальный человек, не сумма отчётов. Кросс-фильтрация
// вкладок: выбор отчётов сужает список коллекций/владельцев, выбор коллекции —
// отчёты и владельцев.
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
      if (!agg[val]) { agg[val] = { key: val, label: val, n: 0 }; order.push(val); }
      agg[val].n++;
    }
  }
  var rows2 = [], q2 = (state.repQuery || '').toLowerCase();
  for (var o = 0; o < order.length; o++) {
    var a = agg[order[o]];
    if (q2 && a.label.toLowerCase().indexOf(q2) < 0) continue;
    var ex = exactByVal[a.key];
    if (!ex) continue;               // группы без точной строки куба не выдумываем
    rows2.push({ key: a.key, label: a.label, k: ex.kpi, reports: a.n });
  }
  rows2.sort(function (x, y) { return y.k.users - x.k.users; });
  var tot2 = MODEL.totals[g] ? MODEL.totals[g].kpi : { users: 0, views: 0, regular_users: 0 };
  return { rows: rows2, total: tot2, axis: 'grp', filtered: rel != null };
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
    h += '<tr class="' + CFG.ns + '-total tot"' + (o.total.tip ? tip(o.total.tip) : '') + '><td class="txt">ИТОГО</td>';
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
    '<span class="' + CFG.ns + '-pginfo">Показано ' + nf(from) + '–' + nf(to) + ' из ' + nf(total) + '</span>' +
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
  var modeInfo = MODE(state.mode);
  if (!MODEL.totals[curGrain()]) {
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
    if (!MODEL.hasCa) cells.push(compact(cr.k.views));
    barRows.push({
      key: cr.key, label: cr.label, cells: cells, bar: cr.k.users,
      tip: {
        title: cr.label,
        rows: [{ label: 'Пользователи', value: nf(cr.k.users), color: CFG.colors.ret },
          { label: 'Постоянные', value: nf(cr.k.regular_users) + ' · ' + pct(cr.k.users ? cr.k.regular_users / cr.k.users * 100 : 0, 0) },
          { label: 'Просмотров на пользователя', value: nf(cr.k.users ? cr.k.views / cr.k.users : 0, 1) }]
      }
    });
  }
  var totCells = [];
  if (cat.axis === 'grp') totCells.push(nf(repRows().length));
  totCells.push(nf(cat.total.users));
  if (!MODEL.hasCa) totCells.push(compact(cat.total.views));
  var table2 = barTableHtml({
    cutKey: state.mode, selected: pickList(state.mode),
    firstH: modeInfo.one, firstW: '34%', colW: '15%', barH: 'Доля пользователей', dense: true,
    cols: [{ label: 'Отчётов' }, { label: 'Польз.', hint: { text: 'Уникальные пользователи группы за период' } }].concat(MODEL.hasCa ? [] : [{ label: 'Просм.' }]),
    total: {
      cells: totCells,
      tip: { title: 'ИТОГО', text: 'Пользователи в ИТОГО — уникальные по всей выборке, а не сумма строк: один человек, открывший отчёты двух групп, посчитан один раз.' }
    },
    rows: barRows,
    note: 'Пользователь группы — <b>уникальный</b> человек, не сумма отчётов; просмотры складываются.' +
      (cat.filtered ? ' Список сужен выбором в другой вкладке.' : '')
  });
  return '<div class="' + CFG.ns + '-tscroll">' + table2 + '</div>' + pagerHtml(total2);
}

// ВНИМАНИЕ: здесь префикс БЕЗ точки. var P = '.' + CFG.ns дал бы class=".pvt-root".
function buildHTML() {
  if (MODEL.empty || (!MODEL.repMode && !Object.keys(MODEL.grps).length)) {
    return buildCSS() + '<div class="' + CFG.ns + '-root"><div class="' + CFG.ns + '-empty" style="margin:24px">' +
      '<b>' + esc(CFG.text.noData) + '</b>Куб не вернул ни одной секции.</div></div>';
  }
  var modeInfo = MODE(state.mode);

  var h = [];
  h.push('<div class="' + CFG.ns + '-root">');
  h.push(catFilterRowHtml());

  // ── Каталог — единственная панель тела: KPI и аналитика области — в правой
  // панели. Панель тянется на всю ячейку; ячейка на борде узкая (~35–40%) —
  // таблица плотная, названия режутся ellipsis. ──
  var tableHtml = catalogTableHtml();
  h.push(panelHtml({
    // v7.1: шапка листа, KPI и общие пилюли фильтров — в чарте-шапке сверху;
    // здесь только карточка каталога. Выбор снимается тут же.
    cls: 'cat', title: 'Каталог',
    sub: 'клик — выбрать область · Shift — несколько',
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
      // За курсором showTip зовётся на каждом mousemove — HTML меняем, только если он другой.
      if (tip.__h !== html) { tip.innerHTML = html; tip.__h = html; }
      tip.style.display = 'block';
      tip.style.left = '0px';
      tip.style.top = '0px';
      var t = tip.getBoundingClientRect();
      var pad = 6, gap = 8, left, top;
      if (rect.pt) {
        // Якорь — курсор (как тултип eCharts): справа-снизу, у края окна — зеркально.
        left = rect.left + 14; top = rect.top + 18;
        if (left + t.width > window.innerWidth - pad) left = rect.left - t.width - 14;
        if (top + t.height > window.innerHeight - pad) top = rect.top - t.height - 14;
      } else {
        left = rect.left + rect.width / 2 - t.width / 2;
        top = rect.top + rect.height + gap;
        if (top + t.height > window.innerHeight - pad) top = rect.top - t.height - gap;
      }
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
      tip.__h = null;
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
      // Якорь — точка курсора: тултип идёт за мышью (onTipMove), как на диаграмме.
      state.tip = {
        rect: curPt(e),
        kind: el.getAttribute('data-kind') || '',
        key: el.getAttribute('data-tip') || ''
      };
      renderTip();
    }

    function curPt(e) { return { left: e.clientX, top: e.clientY, width: 0, height: 0, pt: true }; }
    // Тултип за курсором: на mousemove — только позиция, содержимое не пересобирается.
    function onTipMove(e) {
      if (!state.tip || !state.tip.rect || !state.tip.rect.pt) return;
      state.tip.rect = curPt(e);
      showTip(state.tip.html || state.tip.key || '', state.tip.rect);
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

    // ── Кросс-фильтр: каталог эмитит ОБЛАСТЬ, правая панель слушает ──
    // v7: область = весь выбор каталога, а не последний одиночный пик (v6
    // терял Shift-мультивыбор и смесь разрезов — панель откатывалась ко всему
    // Proteus). Правила маски (каждый вызов задаёт её ЦЕЛИКОМ):
    //   выбор в одном разрезе  → mode_param = разрез, sel_f = все его значения
    //                            (ИЛИ внутри разреза — так же считает куб);
    //   выбор в нескольких     → mode_param = 'report', sel_f = id отчётов
    //                            пересечения (pickedIds), пустое → ['0'];
    //   выбора нет             → mode_param = 'report' без sel_f = весь Proteus.
    // Пустой value=[] НЕ эмитим: пустой список ронял запрос чарта (783708).
    // Эмит только при СМЕНЕ области: смена вкладки каталога область не меняет
    // и правую панель не перезапрашивает.
    function areaMask() {
      var used = [], vals, i;
      for (i = 0; i < CFG.modes.length; i++) {
        if (pickList(CFG.modes[i].key).length) used.push(CFG.modes[i].key);
      }
      if (!used.length) return [{ column: 'mode_param', operator: 'IN', value: ['report'] }];
      vals = [];
      if (used.length === 1) {
        var one = pickList(used[0]);
        for (i = 0; i < one.length; i++) vals.push(String(one[i]));
        return [{ column: 'mode_param', operator: 'IN', value: [used[0]] },
                { column: 'sel_f', operator: 'IN', value: vals }];
      }
      var ids = pickedIds() || [];
      for (i = 0; i < ids.length; i++) vals.push(String(ids[i]));
      if (!vals.length) vals = ['0'];
      return [{ column: 'mode_param', operator: 'IN', value: ['report'] },
              { column: 'sel_f', operator: 'IN', value: vals }];
    }
    function emitSel() {
      if (typeof applyCrossFilter !== 'function') return;
      var fl = areaMask(), key = JSON.stringify(fl);
      if (state.lastEmit === key) return;
      state.lastEmit = key;
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
      // Группы — всегда строки: логин «12345» или коллекция «2024» числом
      // переставали совпадать с мета отчёта.
      if (key !== 'report') val = String(val);
      var idx = indexOfId(list, val);
      if (additive) {
        // Shift+клик — накопительное ИЛИ внутри разреза (прежняя семантика).
        if (idx >= 0) list.splice(idx, 1);
        else list.push(key === 'report' ? pickId(val) : val);
      } else {
        // Переклик: клик по другой строке просто меняет выбор; повторный
        // клик по единственной выбранной строке снимает её.
        if (idx >= 0 && list.length === 1) list = [];
        else list = [key === 'report' ? pickId(val) : val];
      }
      state.picks[key] = list;
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
      // Строка «Выбранные фильтры»: × снимает значение (или весь разрез), «Снять все».
      var up = trigger(e.target, 'data-unpick');
      if (up) {
        var uid = up.getAttribute('data-unpick');
        if (uid === '*') {
          state.picks = { report: [], collection: [], owner: [] };
        } else {
          var ukey = uid.split('|')[0], uval = uid.slice(ukey.length + 1);
          if (uval === '') state.picks[ukey] = [];
          else {
            var ul = state.picks[ukey] || [], ui = indexOfId(ul, uval);
            if (ui >= 0) ul.splice(ui, 1);
          }
        }
        state.page = 0;
        hideTip();
        emitSel();
        render();
        return;
      }
      // Кнопка «ссылка» в строке отчёта: копирует адрес, строку НЕ выбирает.
      var lnk = trigger(e.target, 'data-replink');
      if (lnk) {
        var url = dashUrl(lnk.getAttribute('data-replink'));
        copyText(url, function (ok) {
          lnk.className = CFG.ns + '-lnkbtn ' + (ok ? 'ok' : 'err');
          lnk.innerHTML = ok ? '✓' : '!';
          // Короткая подсказка без адреса: длинный URL в тултип не помещается.
          lnk.setAttribute('data-tip', tipHtml({ text: ok ? 'Ссылка скопирована' : 'Браузер запретил доступ к буферу обмена', rows: [{ label: 'ID отчёта', value: lnk.getAttribute('data-replink') }] }));
          if (state.tip) { state.tip.key = lnk.getAttribute('data-tip'); renderTip(); }
          setTimeout(function () {
            lnk.className = CFG.ns + '-lnkbtn';
            lnk.innerHTML = LINK_SVG;
            lnk.setAttribute('data-tip', tipHtml(linkTip(lnk.getAttribute('data-replink'))));
          }, ok ? 1800 : 6000);
        });
        return;
      }
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
        emitSel();
        render();
        return;
      }
      // Действия: раскрытие наблюдений, листание каталога.
      var act = trigger(e.target, 'data-action');
      if (act) {
        var a = act.getAttribute('data-action');
        if (a === 'clearPicks') {
          state.picks = { report: [], collection: [], owner: [] };
          state.page = 0;
          emitSel();
          render();
          return;
        }
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
    overlay.addEventListener('mousemove', onTipMove);
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
