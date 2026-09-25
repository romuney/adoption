// ============================================================================
// pa-audience.chart.js — «Аудитория: ЦА области»: правая панель листа «Аудитория», v2 (2026-09-24)
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
// ЧТО ЭТО. Двойник панели «Аудитория области» первого листа (тот же каркас, размеры,
//   KPI, вкладки, таблицы, тултипы), но про ЦЕЛЕВУЮ АУДИТОРИЮ (ЦА) выбранной области:
//   KPI ЦА · «Что видно» · вкладки «Путь ЦА» (настройка ЦА + воронка) · «Динамика»
//   (приход и охват ЦА) · «Кто из ЦА» (люди и группы с охватом).
// ЦА считает ЧАРТ, а не SQL: датасет pa_aud_v2 отдаёт людей области (зрители — поимённо,
//   остальной штат — свёрнуто по подразделению/спец./стриму/рук.), поэтому смена ЦА
//   (по правам ⇄ весь штат, условия по подразделениям/специализациям/стримам/руководителям)
//   пересчитывает всё мгновенно, без запроса. Настройка ЦА хранится для области в браузере.
// ШИНЫ.
//   Слушает: полоску (period_param, pub_f/act_f/exc_f) и СВОЙ каталог вкладки слева
//     (mode_param + sel_f — область; каталог «Отчётов» сюда не пишет — скоуп в Proteus).
//   Пишет: людскую шину (org_f/spec_f/stream_f/heads_f/login_f/freq_f) → каталог вкладки
//     сужается. Себя не сужает (самовлияние выключено): выбор подсвечивается.
// ============================================================================

// ---------- БЛОК 1: CFG ----------
// fields - ТОЛЬКО реальные имена колонок из SQL пользователя.
// Нет поля в SQL - СПРОСИ, не выдумывай и не хардкодь значения.
// Все цвета/шрифты/отступы из макета — только здесь, не в разметке.

var CFG = {
  ns: 'paud',                 // ПРЕФИКС всех CSS-классов и класса overlay
  // 7 колонок датасета pa_aud_v2 (SQL — поставка 2026-09-24, файл 2); alias == имя колонки.
  // section: total / d (словарь) / acl (как роздан доступ) / v (зрители, упаковка) / h (штат без визитов).
  fields: { section: 'section', g: 'g', k: 'k', parent: 'parent', n: 'n', a: 'a', state_j: 'state_j' },
  text: { noData: 'Нет данных' },
  mode: 'snapshot',
  order: { section: ['total', 'd', 'acl', 'v', 'h'] },
  // Вкладки панели: кого считаем и как доходит → время → люди.
  views: [
    { key: 'path', label: 'Путь ЦА' },
    { key: 'dyn', label: 'Динамика' },
    { key: 'who', label: 'Кто из ЦА' }
  ],
  // Группировки «Кто из ЦА» — как «Кто смотрит» первого листа (без AD-групп: членств в ответе нет).
  groups: [
    { key: 'none', label: 'Люди' }, { key: 'org', label: 'Оргструктура (УС-3…УС-7)' },
    { key: 'org3', label: 'УС-3', trg: 'Оргструктура · УС-3', sub: true },
    { key: 'org4', label: 'УС-4', trg: 'Оргструктура · УС-4', sub: true },
    { key: 'org5', label: 'УС-5', trg: 'Оргструктура · УС-5', sub: true },
    { key: 'org6', label: 'УС-6', trg: 'Оргструктура · УС-6', sub: true },
    { key: 'org7', label: 'УС-7', trg: 'Оргструктура · УС-7', sub: true },
    { key: 'spec', label: 'Специализация' }, { key: 'stream', label: 'Стрим' },
    { key: 'heads', label: 'Тим-лиды' }
  ],
  orgSep: ' › ',
  // Колонки сводной таблицы групп ЦА (prevOnly — только если у периода есть полный предыдущий).
  gcols: [
    { key: 'ca', label: 'В ЦА', hint: 'Людей группы в целевой аудитории' },
    { key: 'cov', label: 'Охват', hint: 'Доля ЦА группы, заходившая в отчёты области за период' },
    { key: 'reach', label: 'Дошли', hint: 'Люди ЦА группы, заходившие за период' },
    { key: 'dReach', label: 'Δ к пред.', hint: 'Изменение числа дошедших к предыдущему периоду той же длины', prevOnly: true },
    { key: 'regShare', label: 'Закрепились', short: 'Закреп.', hint: 'Доля постоянных среди дошедших: 6+ дней или недель, 4+ месяца, 3+ квартала' },
    { key: 'never', label: 'Не заходили', short: 'Не зах.', hint: 'Люди ЦА группы без визитов за период' },
    { key: 'out', label: 'Вне ЦА', hint: 'Заходили за период, но в целевую аудиторию не входят' }
  ],
  pcols: [
    { key: 'fio', label: 'Сотрудник', txt: true },
    { key: 'org', label: 'Подразделение', txt: true },
    { key: 'exp', label: 'Стаж', txt: true },
    { key: 'days', label: 'Дней', hint: 'Активных периодов в окне: дней, недель, месяцев или кварталов — по грануляции' },
    { key: 'views', label: 'Просм.' },
    { key: 'last', label: 'Визит' },
    { key: 'bin', label: 'Сегмент', txt: true }
  ],
  fbins: { d: [1, 5, 15], w: [1, 5, 15], m: [1, 3, 6], q: [1, 2, 3] },
  fopen: { d: true, w: true, q: true },
  grains: {
    d: { n: 30, reg: 6, unit: 'день',    units: 'дней',     us: 'дн',  label: 'за 30 дней',    vs: 'к пред. 30 дням',     prev: true },
    w: { n: 20, reg: 6, unit: 'неделя',  units: 'недель',   us: 'нед', label: 'за 20 недель',  vs: 'к пред. 20 неделям',  prev: true },
    m: { n: 12, reg: 4, unit: 'месяц',   units: 'месяцев',  us: 'мес', label: 'за 12 месяцев', vs: 'к пред. 12 месяцам',  prev: false },
    q: { n: 8, reg: 3,  unit: 'квартал', units: 'кварталов', us: 'кв', label: 'за 8 кварталов', vs: 'к пред. 8 кварталам', prev: false }
  },
  // Пороги: «доступ почти у всей компании» (проценты охвата скрыты) и наблюдения.
  wideShare: 0.3, covLow: 40, accLow: 85, outHigh: 20,
  areaLabels: { report: ['Отчёт', 'Отчёты'], owner: ['Владелец', 'Владельцы'], collection: ['Коллекция', 'Коллекции'] },
  colors: {
    bg: '#f6f6f6', panel: '#fff', act: '#245FD4',
    ret: '#7FA3EA', react: '#AA77FF', new: '#245FD4',   // стек динамики: пришли впервые / не впервые
    cov: '#245FD4', covP: '#7FA3EA',                    // охват: накоплено / за период
    views: '#5b6478', bench: '#c7c8cc',
    label: '#2b2b2b', axis: '#808080', axisLine: 'rgb(155, 164, 181)',
    split: '#f0f1f3', txt: '#3a3f4a', mut: '#8a909c',
    // Сегменты ЦА (полоса над списком): постоянные → эпизодические → разовые → не заходили.
    seg: ['#245FD4', '#4A7BE0', '#8AAAEC', '#dfe3e8'],
    // Ступени воронки: ЦА → доступ → открыли → вернулись → регулярно.
    fun: ['#D3E0FA', '#A9C1F2', '#7FA3EA', '#4A7BE0', '#245FD4'],
    freq: ['#D3E0FA', '#8AAAEC', '#4A7BE0', '#245FD4']
  },
  fonts: { family: 'Inter,-apple-system,"Segoe UI",Roboto,Arial,sans-serif', val: 11, dense: 10, title: 13, title2: 12, legend: 12 },
  spacing: { stackGap: 26, barGap: 8, barMax: 72, barMin: 3, dense: 16, headroom: 1.3, headroomDense: 1.22 },
  pageSize: 50, subShow: 15, subMax: 300
};

// ---------- БЛОК 2: ВХОД + СОСТОЯНИЕ + ХЕЛПЕРЫ ----------
var rawData = (typeof data !== 'undefined' && Array.isArray(data)) ? data : [];
if (!window.__pvtState) window.__pvtState = {};
var __S = window.__pvtState;
if (!__S[CFG.ns]) __S[CFG.ns] = {
  tip: null,
  view: 'path',              // вкладка панели: path | dyn | who («Путь ЦА» — первая)
  q: '',                     // поиск «Имя или логин»
  obsOpen: false,
  whoCut: 'none',
  gOpen: {}, gMore: {},
  gSort: { key: 'ca', dir: -1 },
  pSort: { key: 'days', dir: -1 },
  page: 0, toast: '', whoFull: false,
  segSel: null,              // сегмент ЦА над списком: reg | epi | once | never
  dd: null,                  // открытый дропдаун: whoCut | caOrg | caSpec | caStream | caHeads
  legendOff: { new: false, react: false, ret: false },
  dynEl: null, dynI: -1,
  caCfg: {},                 // настройка ЦА по областям: ключ области → { base, org, spec, stream, heads }
  picks: { org: [], spec: [], stream: [], heads: [], login: [] }
};
var state = __S[CFG.ns];
(function () {
  var pk = state.picks || (state.picks = {});
  var need = ['org', 'spec', 'stream', 'heads', 'login'];
  for (var i = 0; i < need.length; i++) if (!pk[need[i]]) pk[need[i]] = [];
})();

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

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

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

var THIN = ' ';
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

function daysFmt(v) { return v == null ? '—' : nf(v, 0) + THIN + 'дн'; }

function fmtDate(t) {
  return t ? p2(t.d) + '.' + p2(t.m + 1) + '.' + t.y : '—';
}

function tsDate(k, grain) {
  var now = new Date();
  var y = now.getUTCFullYear(), m = now.getUTCMonth(), d = now.getUTCDate();
  if (grain === 'd') { d -= k; }
  else if (grain === 'w') { d -= k * 7; }
  else if (grain === 'm') { m -= k; }
  else { y -= Math.floor(k / 4); m -= (k % 4) * 3; }
  var dt = new Date(Date.UTC(y, m, d));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
}

function isoWeekOf(t) {
  var d = new Date(Date.UTC(t.y, t.m, t.d));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  var y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { week: Math.ceil((((d - y0) / 86400000) + 1) / 7), year: d.getUTCFullYear() };
}

function calLabel(ts, i, grain) {
  var t = tsDate(ts[i].k, grain), pv = i ? tsDate(ts[i - 1].k, grain) : null;
  if (grain === 'd') {
    var chD = t.d === 1 || (pv && pv.m !== t.m);
    return { main: String(t.d), bold: chD, sub: chD ? MONTHS[t.m] : '' };
  }
  if (grain === 'w') {
    var chW = !!pv && pv.m !== t.m;
    return { main: 'W' + isoWeekOf(t).week, bold: chW, sub: chW ? MONTHS[t.m] : '' };
  }
  var chY = !!pv && pv.y !== t.y;
  return { main: grain === 'm' ? MONTHS[t.m] : 'Q' + (Math.floor(t.m / 3) + 1), bold: chY, sub: chY ? String(t.y) : '' };
}

function calAxisSvg(ts, grain, xOf, y0) {
  // Линия оси X по ширине всех колонок — основание столбиков и линии.
  var hs = ts.length > 1 ? (xOf(1) - xOf(0)) / 2 : 12;
  var out = ts.length ? '<line x1="' + r1(xOf(0) - hs) + '" y1="' + (y0 + 0.5) + '" x2="' + r1(xOf(ts.length - 1) + hs) + '" y2="' + (y0 + 0.5) +
    '" stroke="' + CFG.colors.axisLine + '" stroke-width="1"/>' : '';
  for (var i = 0; i < ts.length; i++) {
    var L = calLabel(ts, i, grain), x = r1(xOf(i));
    out += '<text x="' + x + '" y="' + (y0 + 12) + '" font-size="10.5" text-anchor="middle" font-weight="' + (L.bold ? 600 : 400) +
      '" fill="' + (L.bold ? '#3a3f4a' : CFG.colors.axis) + '">' + esc(L.main) + '</text>';
    if (L.sub) {
      out += '<text x="' + x + '" y="' + (y0 + 25) + '" font-size="9.5" text-anchor="middle" font-weight="600" fill="#8a909c">' + esc(L.sub) + '</text>';
    }
  }
  return out;
}

function bucketTitle(t, grain) {
  if (!t) return '';
  if (grain === 'd') return fmtDate(t);
  if (grain === 'w') { var w = isoWeekOf(t); return 'Неделя ' + w.week + ', ' + w.year + ' — с ' + fmtDate(t); }
  if (grain === 'm') return MONTHS_FULL[t.m] + ' ' + t.y;
  return (Math.floor(t.m / 3) + 1) + '-й квартал ' + t.y;
}

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

// Сегмент по корзине частоты (та же мера, что «Постоянные» первого листа).
function segOf(bin) {
  if (bin >= 3) return { key: 'Постоянный', cls: 'good' };
  if (bin >= 2) return { key: 'Эпизодический', cls: 'note' };
  return { key: 'Разовый', cls: 'neutral' };
}
function bits(v) { var c = 0; v = Math.floor(v) || 0; while (v > 0) { c += v % 2; v = Math.floor(v / 2); } return c; }
function bitAt(v, k) { return Math.floor((v || 0) / Math.pow(2, k)) % 2 === 1; }
function binOf(days, FB) { return !days ? 0 : (days <= FB[0] ? 1 : (days <= FB[1] ? 2 : (days <= FB[2] ? 3 : 4))); }

// ---------- БЛОК 3: ТРАНСФОРМАЦИЯ ДАННЫХ ----------
// pa_aud_v2 (секции — шапка SQL): total — штат и эхо условий; d — словарь спец./стримов;
// acl — как роздан доступ; v — зрители области поимённо (упаковка по пути оргструктуры);
// h — штат без визитов, свёрнутый по (путь, спец., стрим, рук.). ЦА и все метрики — ниже, в JS.
function buildModel() {
  var F = CFG.fields, i, j, r;
  var m = { grain: 'd', n: 30, md: null, staff: 0,
    area: { mode: '', sel: [], names: [], n: 0 },
    dict: { spec: {}, stream: {}, hq: {}, it: {} }, acl: { groups: [], users: 0 },
    caMode: 'acc', caApplied: caEmpty(),
    people: [], never: [], hold: [], orgKids: {}, adg: [], namesOmitted: false };
  var vRows = [], hRows = [], nRows = [];
  for (i = 0; i < rawData.length; i++) {
    r = rawData[i] || {};
    var sec = String(r[F.section] || '');
    if (sec === 'total') {
      m.staff = num(r[F.n]) || 0;
      var nm = String(r[F.k] == null ? '' : r[F.k]);
      m.area.names = nm ? nm.split('\n') : [];
      var sj = {};
      try { sj = JSON.parse(String(r[F.state_j] || '{}')); } catch (e) { sj = {}; }
      if (CFG.grains[sj.period]) m.grain = sj.period;
      m.area.mode = sj.mode || ''; m.area.sel = sj.sel || []; m.area.n = num(sj.areaN) || 0;
      m.md = toDate(sj.md);
      m.caMode = sj.caMode === 'cond' ? 'cond' : 'acc';
      var ca = sj.ca || {};
      m.caApplied = { org: ca.org || [], spec: ca.spec || [], stream: ca.stream || [], hq: ca.hq || [], it: ca.it || [], heads: ca.head || '', adg: ca.adg || [] };
    } else if (sec === 'd') {
      var dg = String(r[F.g] || '');
      if (m.dict[dg]) m.dict[dg][String(r[F.k] || '')] = String(r[F.parent] == null ? '' : r[F.parent]);
    } else if (sec === 'acl') {
      if (String(r[F.g]) === 'users') m.acl.users = num(r[F.n]) || 0;
      else m.acl.groups.push({ name: String(r[F.k] || ''), n: num(r[F.n]) || 0 });
    } else if (sec === 'adg') {
      m.adg.push({ name: String(r[F.k] || ''), n: num(r[F.n]) || 0, acc: (num(r[F.a]) || 0) === 1 });
    } else if (sec === 'v') vRows.push(r);
    else if (sec === 'h') hRows.push(r);
    else if (sec === 'n') nRows.push(r);
  }
  var G = CFG.grains[m.grain], FB = CFG.fbins[m.grain];
  m.n = G.n;
  var mdMs = m.md ? Date.UTC(m.md.y, m.md.m, m.md.d) : Date.now() - 86400000;
  var seenPath = {};
  var addPath = function (path) {
    if (seenPath[path]) return;
    seenPath[path] = true;
    var ps = path ? path.split(CFG.orgSep) : [];
    for (var q = 1; q <= ps.length; q++) {
      var node = ps.slice(0, q).join(CFG.orgSep), par = ps.slice(0, q - 1).join(CFG.orgSep);
      var ks = m.orgKids[par] || (m.orgKids[par] = []);
      if (ks.indexOf(node) < 0) ks.push(node);
    }
  };
  var dv = function (g, id) { return m.dict[g][id] == null ? '' : m.dict[g][id]; };
  for (i = 0; i < vRows.length; i++) {
    var path = String(vRows[i][F.parent] || ''), lines = String(vRows[i][F.k] || '').split('\n');
    addPath(path);
    for (j = 0; j < lines.length; j++) {
      var f = lines[j].split('\t');
      if (f.length < 17 || !f[0]) continue;
      var cur = num(f[4]) || 0, prev = num(f[5]) || 0, days = bits(cur), last = num(f[8]);
      var dt = last == null || last < 0 ? null : new Date(mdMs - last * 86400000);
      var p = {
        login: f[0], fio: f[1], acc: f[2] === '1', stf: f[3] === '1', cur: cur, prev: prev,
        fk: num(f[6]), yr: f[7] === '1', org: path,
        spec: dv('spec', f[9]), stream: dv('stream', f[10]), is_head: f[11] === '1' ? 1 : 0,
        views: num(f[12]) || 0, exp: f[13] || '', hq: dv('hq', f[14]), it: dv('it', f[15]), ca: f[16] === '1',
        fired: f[3] !== '1',   // зритель не из базы сотрудников (действующие с AD-логином) — уволен
        days: days, daysPrev: bits(prev),
        last_dt: dt ? { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() } : null
      };
      p.bin = binOf(p.days, FB); p.binPrev = binOf(p.daysPrev, FB);
      m.people.push(p);
    }
  }
  for (i = 0; i < hRows.length; i++) {
    var hp = String(hRows[i][F.parent] || ''), hl = String(hRows[i][F.k] || '').split('\n');
    addPath(hp);
    for (j = 0; j < hl.length; j++) {
      var x = hl[j].split('\t');
      if (x.length < 9) continue;
      var h = { org: hp, spec: dv('spec', x[0]), stream: dv('stream', x[1]), is_head: x[2] === '1' ? 1 : 0,
        hq: dv('hq', x[3]), it: dv('it', x[4]), n: num(x[5]) || 0, na: num(x[6]) || 0, cn: num(x[7]) || 0, cna: num(x[8]) || 0 };
      m.hold.push(h);
    }
  }
  // Не заходившие из ЦА поимённо (приходят, только если их ≤ 20 тыс.).
  for (i = 0; i < nRows.length; i++) {
    var np = String(nRows[i][F.parent] || ''), nl = String(nRows[i][F.k] || '').split('\n');
    for (j = 0; j < nl.length; j++) {
      var y = nl[j].split('\t');
      if (y.length < 9 || !y[0]) continue;
      m.never.push({ login: y[0], fio: y[1], org: np, spec: dv('spec', y[2]), stream: dv('stream', y[3]), is_head: y[4] === '1' ? 1 : 0,
        hq: dv('hq', y[5]), it: dv('it', y[6]), acc: y[7] === '1', exp: y[8] || '', stf: true, ca: true, nv: true,
        cur: 0, prev: 0, days: 0, daysPrev: 0, views: 0, bin: 0, binPrev: 0, last_dt: null, fk: null, yr: false });
    }
  }
  var holdCa = 0;
  for (i = 0; i < m.hold.length; i++) holdCa += m.hold[i].cn;
  m.namesOmitted = holdCa > 0 && !m.never.length;
  m.people.sort(function (a, b) { return (b.days - a.days) || (b.views - a.views) || (a.login < b.login ? -1 : 1); });
  m.acl.groups.sort(function (a, b) { return b.n - a.n; });
  return m;
}
var MODEL = buildModel();
MODEL.sig = [MODEL.grain, MODEL.staff, MODEL.people.length, MODEL.hold.length, MODEL.never.length, MODEL.area.sel.join(','), JSON.stringify(MODEL.caApplied)].join('|');

// --- Целевая аудитория: настройка области и принадлежность ---------------------
// base: 'acc' — у кого есть право на отчёт области (поимённо или через AD-группу);
//       'all' — весь штат. Условия сужают базу: подразделения (узел УС и всё под ним),
//       специализации, стримы, руководители ('1' — только, 'n' — без).
function caEmpty() { return { org: [], spec: [], stream: [], hq: [], it: [], heads: '', adg: [] }; }
function caCopy(c) { return { org: c.org.slice(), spec: c.spec.slice(), stream: c.stream.slice(), hq: c.hq.slice(), it: c.it.slice(), heads: c.heads || '', adg: (c.adg || []).slice() }; }
// Применённая ЦА — эхо сервера: условия приходят кросс-фильтром от строки «Целевая аудитория»
// (чарт «Аудитория: настройка ЦА», ca_*_f) — единственный источник правды.
function caCfg() { return MODEL.caApplied; }
function caModeNow() { return MODEL.caMode; }
function caAttrsOn(c) { return !!(c.org.length || c.spec.length || c.stream.length || c.hq.length || c.it.length || c.heads || (c.adg && c.adg.length)); }
// Итоги ЦА пересчитываются только при смене настройки (мемо по её отпечатку).
var CA_MEMO = { sig: null };
function emptyA() { return { ca: 0, acc: 0, reach: 0, reachPrev: 0, reg: 0, regPrev: 0, epi: 0, once: 0, ret: 0, yr: 0, out: 0, views: 0, first: 0 }; }
function addP(a, p) {
  if (p.ca) {
    a.ca++; if (p.acc) a.acc++; if (p.yr) a.yr++;
    if (p.cur) {
      a.reach++; a.views += p.views;
      if (p.bin >= 3) a.reg++; else if (p.bin === 2) a.epi++; else a.once++;
      if (p.days >= 2) a.ret++;
      if (p.fk != null && p.fk < MODEL.n) a.first++;
    }
    if (p.prev) { a.reachPrev++; if (p.binPrev >= 3) a.regPrev++; }
  } else if (p.cur) a.out++;
}
function addH(a, h) { a.ca += h.cn; a.acc += h.cna; }
function caState() {
  var sig = MODEL.sig;
  if (CA_MEMO.sig === sig) return CA_MEMO;
  var tot = emptyA(), i;
  for (i = 0; i < MODEL.people.length; i++) {
    var p = MODEL.people[i];
    var sg = !p.ca ? { key: 'Вне ЦА', cls: 'dead' } : (p.cur ? segOf(p.bin) : { key: 'Не в период', cls: 'dead' });
    p.seg = sg.key; p.segCls = sg.cls;
    addP(tot, p);
  }
  for (i = 0; i < MODEL.hold.length; i++) addH(tot, MODEL.hold[i]);
  for (i = 0; i < MODEL.never.length; i++) { MODEL.never[i].seg = 'Ни разу'; MODEL.never[i].segCls = 'dead'; }
  CA_MEMO = { sig: sig, tot: tot, groups: {} };
  return CA_MEMO;
}
function caTotals() { return caState().tot; }
function wide() {
  var t = caTotals();
  return caModeNow() === 'acc' && MODEL.staff > 0 && t.ca >= CFG.wideShare * MODEL.staff;
}

// ---------- БЛОК 4: ФОРМАТИРОВАНИЕ И ЦВЕТ ----------

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

function signed(v, dec, unit) {
  if (v == null || !isFinite(v)) return '—';
  var sign = v > 0 ? '+' : (v < 0 ? MINUS : '');
  return sign + nf(Math.abs(v), dec == null ? 0 : dec) + (unit || '');
}

function closedMonth(back) {
  var now = new Date(Date.now() - 86400000);
  var dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
  return MONTHS_FULL[dt.getUTCMonth()] + ' ' + dt.getUTCFullYear();
}

function delta(v, o) {
  o = o || {};
  if (v == null || !isFinite(v)) {
    return '<span class="' + CFG.ns + '-nocmp"' + tip({ title: 'Сравнение', text: o.why || 'Нет предыдущего периода.' }) + '>не сравнивается</span>';
  }
  var cls = Math.abs(v) < (o.dead == null ? 0.05 : o.dead) ? 'flat' : (v > 0 ? 'up' : 'down');
  // «к пред. 30 дням» — во всплывашке: в плашке он переносился в две строки.
  return '<span class="' + CFG.ns + '-delta ' + CFG.ns + '-' + cls + '"' + (o.vs ? tip({ text: signed(v, 1, o.unit || '') + ' ' + o.vs }) : '') + '>' +
    signed(v, 1, o.unit || '') + '</span>';
}

// «Что видно в данных»: пороговый отбор фактов по ЦА области.
function obsList(k, G, what) {
  var t = caTotals(), out = [];
  if (!t.ca && !t.out) return out;
  var cov = t.ca ? t.reach / t.ca * 100 : 0;
  if (wide()) {
    out.push({ sev: 'mid', lead: 'Доступ открыт почти всей компании — проценты охвата скрыты',
      body: 'В ЦА по правам ' + nf(t.ca) + ' из ' + nf(MODEL.staff) + ' сотрудников: знаменатель не описывает, для кого делали отчёт. Настройте ЦА условиями — проценты вернутся.',
      rule: 'ЦА ≥ ' + Math.round(CFG.wideShare * 100) + '% сотрудников' });
  } else if (t.ca && cov < CFG.covLow) {
    out.push({ sev: 'high', lead: 'Охват ЦА ' + pct(cov) + ' — меньше ' + CFG.covLow + '%',
      body: 'Из ' + nf(t.ca) + ' человек ЦА за период заходили ' + nf(t.reach) + '.', rule: 'охват < ' + CFG.covLow + '%' });
  }
  if (caModeNow() === 'cond' && t.ca && t.acc / t.ca * 100 < CFG.accLow) {
    out.push({ sev: 'high', lead: nf(t.ca - t.acc) + ' человек ЦА не имеют доступа',
      body: 'Низкий охват здесь означает «не роздали», а не «не ходят»: сначала доступ, потом рассылка. Ступень «Есть доступ» на воронке — про них.',
      rule: 'доступ меньше чем у ' + CFG.accLow + '% ЦА' });
  }
  var seen = t.reach + t.out;
  if (seen && t.out / seen * 100 >= CFG.outHigh) {
    out.push({ sev: 'mid', lead: pct(t.out / seen * 100, 0) + ' зрителей — вне ЦА',
      body: nf(t.out) + ' из ' + nf(seen) + ' зрителей периода не входят в ЦА: возможно, ЦА задана слишком узко.',
      rule: 'доля зрителей вне ЦА ≥ ' + CFG.outHigh + '%' });
  }
  if (t.reach && t.reg / t.reach * 100 < 25) {
    out.push({ sev: 'mid', lead: 'Закрепились ' + pct(t.reg / t.reach * 100) + ' дошедших',
      body: 'Постоянно заходят ' + nf(t.reg) + ' из ' + nf(t.reach) + ' человек ЦА, дошедших за период.', rule: 'доля постоянных < 25%' });
  }
  var ord = { high: 0, mid: 1, good: 2 };
  out.sort(function (a, b) { return ord[a.sev] - ord[b.sev]; });
  return out;
}

// ---------- БЛОК 5: РАЗМЕТКА (<style> + HTML) ----------

function buildCSS() {
  var P = '.' + CFG.ns;
  return [
    '<style>',
    // Токены макета (app.css :root), scoped в корень виджета — синхрон
    // с телом 788805: канвас = холст борда, панель — белый блок.
    P + '-root{width:100%;height:100%;box-sizing:border-box;display:flex;flex-direction:column;font-family:' + CFG.fonts.family + ';',
    '  --card:#fff;--line:#e7e9ee;--line2:#eef0f3;--bg:#f6f6f6;',
    '  --ink:#23272e;--ink2:#454b55;--muted:#8a909c;--muted2:#aab0bb;',
    '  --green:#12b048;--green-bg:#bff2cd;--green-tx:#0a8f3c;',
    '  --red:#f51f1f;--red-bg:#ffcccc;--red-tx:#d11414;',
    '  --blue:#245FD4;--act:#245FD4;--act-ink:#1B4AA8;--blue-bg:#EAF0FC;--act-line:#C3D4F5;',
    '  --fs-cap:10.5px;--fs-note:11.5px;--fs-body:12.5px;--fs-lead:13.5px;',
    '  --chart-gap:' + CFG.spacing.stackGap + 'px;color-scheme:light;}',
    P + '-root *{box-sizing:border-box;font-family:inherit;}',
    // ── Анимация появления (ДС 6.5) — Web Animations в animateIn(); здесь только точки опоры ──
    P + '-root svg .bar{transform-box:fill-box;transform-origin:50% 100%;}',
    P + '-root ' + P + '-cellbar i,' + P + '-root .sp-bar{transform-origin:0 50%;}',

    // ── KPI области и «Что видно в данных» — над карточкой вкладок, на сером холсте ──
    P + '-top{display:flex;flex-direction:column;gap:10px;margin-bottom:12px;flex:0 0 auto;}',
    P + '-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;}',
    P + '-kpi{background:var(--card);border-radius:12px;padding:12px 14px;min-width:0;}',
    P + '-k-label{font-size:var(--fs-note);color:var(--muted);font-weight:500;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    P + '-k-val{font-size:24px;font-weight:600;letter-spacing:-.4px;line-height:1.15;color:var(--ink);margin-top:4px;font-variant-numeric:tabular-nums;}',
    P + '-k-row{display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap;min-height:20px;}',
    P + '-k-sub{font-size:var(--fs-note);color:var(--muted);}',
    P + '-k-sub b{color:var(--ink2);font-weight:500;}',
    P + '-info{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;flex:0 0 auto;'
      + 'border:1px solid var(--muted2);color:var(--muted);font-size:9px;font-weight:600;font-style:normal;cursor:help;}',
    P + '-delta{display:inline-flex;align-items:center;gap:4px;font-size:var(--fs-note);font-weight:500;border-radius:999px;padding:2px 8px;}',
    P + '-d-vs{font-weight:400;font-size:10.5px;opacity:.8;}',
    P + '-up{background:var(--green-bg);color:var(--green-tx);}',
    P + '-down{background:var(--red-bg);color:var(--red-tx);}',
    P + '-flat{background:#f0f1f3;color:var(--muted);}',
    P + '-nocmp{font-size:11px;color:var(--muted);cursor:help;border-bottom:1px dotted var(--muted2);}',
    P + '-obs{border-radius:12px;background:var(--card);min-width:0;}',
    P + '-obs-h{display:flex;align-items:center;gap:10px;height:42px;padding:0 8px 0 14px;min-width:0;}',
    P + '-obs.sev-high{background:linear-gradient(100deg,#fff0f1 0%,#fdf6f8 45%,#fff 100%);}',
    P + '-obs.sev-mid{background:linear-gradient(100deg,#fff6e6 0%,#fdf9f2 45%,#fff 100%);}',
    P + '-obs.sev-good{background:linear-gradient(100deg,#eaf8ef 0%,#f5faf7 45%,#fff 100%);}',
    P + '-obs-ico{width:20px;height:20px;border-radius:6px;background:rgba(255,255,255,.8);display:inline-flex;align-items:center;justify-content:center;'
      + 'font-size:12px;font-weight:600;color:var(--green-tx);flex:0 0 auto;}',
    P + '-obs.sev-high ' + P + '-obs-ico{color:var(--red-tx);}',
    P + '-obs.sev-mid ' + P + '-obs-ico{color:#9a6500;}',
    P + '-obs-t{font-size:var(--fs-body);font-weight:500;color:var(--ink2);flex:0 0 auto;}',
    P + '-obs-lead{font-size:var(--fs-body);color:var(--ink2);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:help;}',
    P + '-obs-tog{border:0;background:rgba(255,255,255,.75);height:26px;padding:0 10px;border-radius:8px;cursor:pointer;color:var(--act);font:inherit;font-size:var(--fs-note);font-weight:500;flex:0 0 auto;margin-left:auto;}',
    P + '-obs-tog:hover{background:#fff;}',
    // Раскрытый список фактов растёт ВНИЗ (не карусель вправо): каждый факт — строка
    // с меткой важности, заголовком и пояснением; графики под ним ужимаются по высоте.
    P + '-obs-list{list-style:none;margin:0;padding:0 14px 12px 44px;display:flex;flex-direction:column;gap:8px;}',
    P + '-obs-li{display:flex;gap:8px;align-items:baseline;font-size:var(--fs-body);color:var(--ink2);line-height:1.45;}',
    P + '-obs-dot{width:7px;height:7px;border-radius:50%;flex:0 0 auto;transform:translateY(-1px);background:var(--green-tx);}',
    P + '-obs-dot.sev-high{background:var(--red-tx);}',
    P + '-obs-dot.sev-mid{background:#d69a00;}',
    P + '-obs-li b{font-weight:500;color:var(--ink);}',
    P + '-obs-li span{color:var(--muted);}',

    // ── Панель ──
    P + '-panel{background:var(--card);border-radius:12px;overflow:hidden;flex:1;min-height:0;display:flex;flex-direction:column;}',
    P + '-panel-h{padding:14px 16px;font-weight:600;font-size:14.5px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:0 0 auto;}',
    P + '-panel-h .sub{font-size:var(--fs-note);color:var(--muted);font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    P + '-h-txt{display:flex;flex-direction:column;gap:2px;min-width:0;}',
    P + '-h-txt .sub b{color:var(--ink2);font-weight:500;}',
    P + '-panel-h .sub-tabs{margin:0 0 0 auto;flex:0 0 auto;}',
    P + '-panel-b{padding:14px 16px;flex:1;min-height:0;}',
    P + '-panel-b.tbl-wrap{padding-top:0;padding-bottom:0;display:flex;flex-direction:column;}',
    P + '-panel-b.dyn-wrap{overflow:auto;display:flex;flex-direction:column;gap:var(--chart-gap);}',
    P + '-panel-b.dyn-wrap > svg{flex:0 0 auto;}',
    // Поиск живёт ПОД переключателем (макет rightUnder): прибит вправо,
    // не ездит от подзаголовка и группировки.

    // ── Вкладки панели ──
    P + '-sub-tabs{display:inline-flex;gap:3px;background:#eef0f3;border-radius:12px;padding:3px;margin:0;flex-wrap:wrap;}',
    P + '-sub-tab{box-sizing:border-box;height:28px;display:inline-flex;align-items:center;line-height:1;border:0;background:transparent;padding:0 12px;border-radius:9px;font-size:var(--fs-note);color:var(--muted);cursor:pointer;font-weight:500;font-family:inherit;}',
    P + '-sub-tab:hover{color:var(--ink2);}',
    P + '-sub-cnt{display:inline-flex;align-items:center;justify-content:center;min-width:15px;height:15px;border-radius:999px;background:var(--blue-bg);color:var(--act-ink);font-size:9px;font-weight:500;margin-left:5px;padding:0 4px;}',
    P + '-sub-cnt.ppl{background:#f3ecff;color:#5a2fc2;}',
    P + '-sub-tab.active{background:var(--card);color:var(--ink);}',
    P + '-sub-tabs.tiny{border-radius:9px;padding:2px;}',
    P + '-sub-tabs.tiny ' + P + '-sub-tab{height:22px;padding:0 8px;font-size:var(--fs-note);border-radius:6px;}',

    // ── Поиск ──
    P + '-psearch{position:relative;flex:0 0 auto;color:var(--muted);}',
    P + '-psearch input{box-sizing:border-box;height:34px;border:1px solid var(--line);background:var(--card);border-radius:999px;padding:0 14px 0 32px;font-size:13px;color:var(--ink);width:230px;font-family:inherit;}',
    P + '-psearch input:focus{outline:none;border-color:var(--act);}',
    P + '-psearch svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);pointer-events:none;}',

    // ── Сигаретка частоты (app.css .segstrip.freq) ──
    // padding-top: кольцо выбранной корзины выступает на 3 px — без запаса его резал верх тела.
    P + '-segstrip{display:flex;gap:6px;margin-bottom:18px;padding-top:5px;min-width:0;flex:0 0 auto;}',
    P + '-seg-part{flex:1 1 0;min-width:66px;border:0;background:transparent;padding:0;',
    '  cursor:pointer;font-family:inherit;text-align:left;display:flex;',
    '  flex-direction:column;gap:3px;transition:opacity .15s;}',
    P + '-seg-part .sp-bar{display:block;height:10px;border-radius:2px;}',
    P + '-seg-part .sp-v{font-size:var(--fs-body);font-weight:600;color:var(--ink);',
    '  font-variant-numeric:tabular-nums;line-height:1.1;}',
    P + '-seg-part .sp-p{font-style:normal;font-weight:400;color:var(--muted);}',
    P + '-seg-part .sp-l{font-size:var(--fs-cap);color:var(--muted);font-weight:500;',
    '  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    P + '-seg-part:hover .sp-l{color:var(--ink2);}',
    P + '-seg-part.off{opacity:.42;}',
    P + '-seg-part.on .sp-l{color:var(--ink);font-weight:500;}',
    P + '-seg-part.on .sp-bar{box-shadow:0 0 0 2px var(--card),0 0 0 3px var(--ink2);}',

    // ── Тулбар «Кто смотрит» ──
    P + '-who-bar{position:relative;display:flex;align-items:center;gap:8px;flex:0 0 auto;flex-wrap:wrap;',
    '  margin-bottom:12px;}',
    P + '-who-cnt{font-size:var(--fs-note);color:var(--muted);font-weight:400;white-space:nowrap;}',
    P + '-bar-g{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;}',
    P + '-bar-g.r{margin-left:auto;gap:6px;}',
    P + '-bar-sep{width:1px;height:18px;background:var(--line);margin:0 2px;}',
    P + '-who-bar ' + P + '-psearch input{width:200px;height:34px;}',
    P + '-who-tbl{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;}',
    P + '-who-cnt b{color:var(--ink2);font-weight:500;}',
    P + '-who-cnt .who-sel{color:var(--act-ink);font-weight:500;cursor:help;}',

    // ── Дропдауны (app.css .dd) ──
    P + '-dd{position:relative;min-width:0;}',
    // Все контролы тулбаров — высота 34 px, как поиск (эталон — поиск каталога).
    P + '-dd-trg{display:flex;align-items:center;gap:6px;width:100%;height:34px;border:1px solid var(--line);',
    '  background:var(--card);border-radius:9px;padding:0 12px;font-size:12px;font-weight:500;',
    '  color:var(--ink2);cursor:pointer;font-family:inherit;}',
    P + '-dd-trg:hover{border-color:#d8dce4;}',
    P + '-dd.open ' + P + '-dd-trg{border-color:var(--act);}',
    P + '-dd-txt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    P + '-dd-c{flex:0 0 auto;color:var(--muted2);font-size:10px;transition:transform .16s;}',
    P + '-dd.open ' + P + '-dd-c{transform:rotate(180deg);}',
    P + '-dd-body{position:absolute;z-index:40;top:calc(100% + 4px);left:0;min-width:100%;',
    '  background:var(--card);border:1px solid var(--line);border-radius:9px;padding:4px;',
    '  box-shadow:0 10px 30px rgba(24,33,50,.14),0 2px 6px rgba(24,33,50,.06);}',
    P + '-dd.sm ' + P + '-dd-trg{padding:0 12px;font-size:12px;}',
    P + '-dd.sm ' + P + '-dd-body{right:0;left:auto;}',
    P + '-who-bar ' + P + '-dd ' + P + '-dd-body{left:0;right:auto;}',
    P + '-dd-opt{border:0;background:transparent;border-radius:7px;display:flex;width:100%;',
    '  text-align:left;padding:6px 9px;font-size:12px;font-weight:400;color:var(--ink2);',
    '  cursor:pointer;font-family:inherit;white-space:nowrap;}',
    P + '-dd-opt:hover{background:#f4f6f9;color:var(--ink);}',
    P + '-dd-opt.on{background:var(--blue-bg);color:var(--act-ink);font-weight:500;}',
    // Подпункт (уровень УС под «Оргструктурой»): отступ слева — видно, что это часть дерева.
    P + '-dd-opt.sub{padding-left:26px;}',

    // ── Настройки списка (поповер) ──
    P + '-who-opts ' + P + '-dd-trg{width:auto;}',
    P + '-who-opts-pop{min-width:256px;padding:10px;display:flex;flex-direction:column;gap:8px;}',
    P + '-who-opts-pop ' + P + '-psearch input{width:100%;height:30px;}',
    P + '-wo-h{font-size:11px;font-weight:500;color:var(--muted);',
    '  text-transform:uppercase;letter-spacing:.4px;}',
    P + '-wo-ex{max-height:224px;overflow:auto;}',
    P + '-wo-login{font-style:normal;color:var(--muted);font-size:11px;}',
    P + '-wo-dot{width:7px;height:7px;border-radius:50%;background:var(--act);display:inline-block;flex:0 0 auto;}',
    P + '-swt{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--ink2);}',
    P + '-swt input{appearance:none;width:32px;height:18px;border-radius:999px;background:#d8dce4;',
    '  position:relative;cursor:pointer;transition:background .15s;margin:0;flex:0 0 auto;}',
    P + '-swt input:after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;',
    '  border-radius:50%;background:#fff;transition:transform .15s;box-shadow:0 1px 2px rgba(0,0,0,.2);}',
    P + '-swt input:checked{background:var(--act);}',
    P + '-swt input:checked:after{transform:translateX(14px);}',
    P + '-pickbox{max-height:168px;overflow:auto;border:1px solid var(--line);',
    '  border-radius:8px;padding:4px 8px;}',
    P + '-pickrow{display:flex;align-items:center;gap:8px;padding:3px 2px;',
    '  font-size:12px;color:var(--ink2);cursor:pointer;min-width:0;}',
    P + '-pickrow:hover{color:var(--ink);}',
    P + '-pickrow input{accent-color:var(--act);margin:0;flex:0 0 auto;}',
    P + '-pickrow span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    P + '-pickempty{font-size:var(--fs-note);color:var(--muted);padding:6px 2px;}',
    P + '-scope-act{display:flex;gap:6px;}',

    // ── Кнопки ──
    P + '-btn{display:inline-flex;align-items:center;gap:6px;height:34px;border:1px solid var(--line);background:var(--card);border-radius:9px;padding:0 12px;',
    '  font-size:12px;font-weight:500;color:var(--ink2);cursor:pointer;font-family:inherit;}',
    P + '-btn:hover{background:#fafbfc;border-color:#d8dce4;}',
    P + '-btn.ghost{border-color:transparent;color:var(--blue);}',
    P + '-btn.ghost:hover{background:var(--blue-bg);}',
    P + '-btn.xs{padding:0 10px;font-size:12px;}',
    // Иконка-кнопка тулбара (копировать, на весь чарт): квадрат 34×34.
    P + '-ibtn{width:34px;padding:0;justify-content:center;color:var(--ink2);}',
    P + '-ibtn.on{background:var(--blue-bg);border-color:var(--act-line);color:var(--act-ink);}',

    // ── Таблица людей ──
    P + '-tbl-scroll{flex:1 1 auto;min-height:0;overflow:auto;}',
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
    P + '-fpill button{width:16px;height:16px;border-radius:50%;border:0;padding:0;cursor:pointer;background:rgba(27,74,168,.14);color:inherit;font:inherit;font-size:11px;line-height:1;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;}',
    P + '-fpill button:hover{background:rgba(27,74,168,.3);}',
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
    P + '-ptable tr.grp-h td{padding:7px 8px;font-weight:400;color:var(--ink2);background:var(--card);text-align:right;}',
    P + '-ptable tr.grp-h td.gname{text-align:left;color:var(--ink);}',
    P + '-ptable tr.grp-h:hover td{background:#eef2f7;}',
    P + '-ptable tr.grp-h{cursor:pointer;}',
    P + '-ptable tr.grp-h.sel td{background:var(--blue-bg);}',
    P + '-ptable tr.grp-h.sel .gh-name{color:var(--act-ink);}',
    P + '-ptable tr.grp-h.grp-dim .gh-name{color:var(--muted);font-weight:400;}',
    // ── Сводная таблица групп и поимённый список (v7.3) ──
    P + '-ptable.gt td{font-variant-numeric:tabular-nums;}',
    P + '-ptable.gt{table-layout:fixed;}',
    P + '-ptable.gt th{overflow:hidden;text-overflow:ellipsis;}',
    P + '-shr{display:inline-flex;align-items:center;justify-content:flex-end;gap:7px;}',
    P + '-shr-v{display:inline-block;min-width:42px;text-align:right;}',
    P + '-ptable.gt td.gname{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:0;}',
    P + '-gh-sp{display:inline-block;width:26px;}',
    // Запас под каретку 28 px (−6/+4 поля) с зазором: иначе длинное имя упирается в край, блок
    // не помещается в ячейку, и её text-overflow заменяет его ЦЕЛИКОМ на «…» (имя и «УС-N»).
    P + '-gtx{display:inline-block;vertical-align:middle;max-width:calc(100% - 34px);overflow:hidden;text-overflow:ellipsis;}',
    P + '-gtx .gh-name{display:block;overflow:hidden;text-overflow:ellipsis;}',
    P + '-ptable td.shr ' + P + '-cellbar{display:inline-block;width:40px;height:8px;vertical-align:middle;flex:0 0 40px;}',
    P + '-ptable.sub td{height:auto;}',
    // Скролл «Кто смотрит»: зона списка — flex-колонка, таблица скроллится внутри,
    // шапка таблицы закреплена (sticky), тулбар и пагинатор на месте.
    P + '-panel-b.tbl-wrap{overflow:hidden;}',
    P + '-list-zone{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;}',
    P + '-dnum{font-weight:500;}',
    P + '-dnum.up{color:var(--green-tx);}',
    P + '-dnum.down{color:var(--red-tx);}',
    P + '-dnum.flat{color:var(--muted);}',
    P + '-ptable td.loc{color:var(--act-ink);font-weight:500;}',
    P + '-ptable tr.nest>td{padding:2px 8px 10px;background:#fbfbfc;white-space:normal;text-align:left;}',
    P + '-ptable.sub{width:100%;table-layout:fixed;border-collapse:collapse;font-size:var(--fs-note);}',
    P + '-ptable.sub td.pn{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    P + '-ptable.sub td{padding:5px 8px;border-bottom:1px solid var(--line2);color:var(--ink2);}',
    P + '-ptable.sub td.txt{font-weight:400;}',
    P + '-ptable.sub tr:last-child td{border-bottom:0;}',
    P + '-empty-td{text-align:center !important;padding:14px !important;color:var(--muted) !important;}',
    P + '-bar-l{font-size:var(--fs-cap);text-transform:uppercase;letter-spacing:.4px;color:var(--muted);font-weight:500;}',
    P + '-exp{display:inline-flex;align-items:center;gap:6px;}',
    P + '-toast{position:absolute;right:2px;top:calc(100% - 4px);z-index:5;font-size:var(--fs-note);color:var(--green-tx);background:var(--card);padding:0 4px;max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    P + '-toast:empty{display:none;}',
    // Каретка — отдельная кнопка 28×28 с подложкой при наведении: в неё легко попасть,
    // промах не уходит в клик по строке (тот фильтрует каталог).
    P + '-gh-caret{border:0;background:transparent;color:var(--muted);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;',
    '  font-size:12px;width:28px;height:28px;margin:-6px 4px -6px -6px;padding:0;border-radius:7px;font-family:inherit;line-height:1;vertical-align:middle;}',
    P + '-gh-caret:hover{color:var(--ink);background:#eef1f5;}',
    P + '-gh-name{font:inherit;font-weight:500;color:var(--ink);}',
    P + '-rflag{display:inline-block;margin-right:5px;font-size:9px;font-weight:500;border-radius:4px;padding:1px 5px;vertical-align:1px;}',
    P + '-rflag.head{background:#f3ecff;color:#6b3fd4;}',
    P + '-rflag.fired{background:#fde8e8;color:#b42318;}',
    P + '-sig-chip{display:inline-block;font-size:11px;font-weight:500;',
    '  border-radius:999px;padding:2px 9px;}',
    P + '-sig-chip.good{background:var(--green-bg);color:var(--green-tx);}',
    P + '-sig-chip.note{background:var(--blue-bg);color:var(--act-ink);}',
    P + '-sig-chip.neutral{background:#f3f4f6;color:var(--muted);}',
    P + '-tbl-note{margin-top:8px;font-size:var(--fs-note);color:var(--muted);line-height:1.5;flex:0 0 auto;}',

    // ── Динамика: каптионы и легенда стека ──
    P + '-dynhead{display:flex;align-items:center;gap:12px;min-height:24px;flex-wrap:wrap;row-gap:4px;}',
    P + '-cap{font-size:var(--fs-cap);text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:500;}',
    P + '-legend{display:inline-flex;gap:4px;margin-left:auto;flex-wrap:wrap;}',
    P + '-leg{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line2);background:var(--card);border-radius:999px;',
    '  padding:3px 10px 3px 8px;font-size:var(--fs-note);color:var(--ink2);cursor:pointer;font-family:inherit;font-weight:500;}',
    P + '-leg i{width:10px;height:9px;border-radius:3px;display:inline-block;}',
    P + '-leg:hover{border-color:#d8dce4;background:#fafbfc;}',
    P + '-leg.off{opacity:.42;}',
    P + '-leg.off i{background:repeating-linear-gradient(45deg,#c7c8cc,#c7c8cc 2px,#eef0f3 2px,#eef0f3 4px) !important;}',

    // ── Тултип (живёт в body, шрифт не наследуется) ──
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

    // ── «Что видно в данных» ──
    P + '-obs-b{padding:0 15px 14px;font-size:13px;color:var(--ink2);line-height:1.55;}',
    P + '-obs-b ul{margin:8px 0 0;padding-left:20px;}',
    P + '-obs-b li{margin-bottom:5px;}',
    P + '-obs-b b{color:var(--ink);font-weight:500;}',
    P + '-empty{background:var(--card);border-radius:12px;padding:28px;text-align:center;color:var(--muted);font-size:var(--fs-body);}',
    P + '-empty b{display:block;color:var(--ink);font-size:15px;margin-bottom:8px;}',

    // ── Закрепляемость (порт pa-cohorts) ──
    P + '-panel-b.coh-wrap{overflow:auto;}',
    P + '-ct-legend{display:flex;align-items:center;gap:14px;flex-wrap:wrap;row-gap:8px;padding-bottom:12px;}',
    P + '-ct-scale-wrap{display:flex;align-items:center;gap:8px;flex:0 0 auto;}',
    P + '-ct-end{font-size:var(--fs-cap);color:var(--muted2);font-weight:500;}',
    P + '-ct-scale{display:inline-flex;gap:2px;flex:0 0 auto;}',
    P + '-ct-st{width:26px;height:14px;border:0;padding:0;cursor:pointer;border-radius:2px;transition:transform .1s;}',
    P + '-ct-st:hover,' + P + '-ct-st:focus-visible{transform:scaleY(1.45);}',
    P + '-ct-cfg{display:flex;align-items:center;gap:8px;flex-wrap:wrap;row-gap:3px;}',
    P + '-ct-cfg-l{font-size:var(--fs-cap);text-transform:uppercase;letter-spacing:.4px;color:var(--muted);font-weight:500;}',
    P + '-ct-cfg-n{font-size:var(--fs-cap);color:var(--muted2);font-weight:500;cursor:help;}',
    P + '-ct-wrap{overflow-x:auto;}',
    P + '-ct-wrap.band-on td' + P + '-ct-cell{opacity:.2;transition:opacity .1s;}',
    P + '-ct-wrap.band-on td' + P + '-ct-cell.band-hit{opacity:1;box-shadow:inset 0 0 0 1px rgba(31,31,31,.35);}',
    P + '-cttable{border-collapse:separate;border-spacing:2px;width:100%;font-size:var(--fs-body);}',
    P + '-cttable th,' + P + '-cttable td{border:0;white-space:nowrap;}',
    P + '-cttable th{font-size:var(--fs-cap);text-transform:uppercase;letter-spacing:.3px;color:var(--muted);font-weight:500;text-align:center;padding:4px 2px;}',
    P + '-cttable th.txt{text-align:left;padding-left:4px;}',
    P + '-ct-med{display:block;font-size:9.5px;font-weight:500;color:var(--muted2);margin-top:1px;}',
    P + '-cttable td.txt{font-weight:500;color:var(--ink);padding-left:4px;}',
    P + '-ct-sz{display:flex;align-items:center;gap:8px;padding-right:14px;}',
    P + '-ct-bar{flex:1;height:12px;background:#f1f3f6;border-radius:2px;overflow:hidden;}',
    P + '-ct-bar i{display:block;height:100%;border-radius:2px;background:' + CFG.colors.ret + ';min-width:2px;}',
    P + '-ct-sz b{font-weight:500;color:var(--ink2);font-variant-numeric:tabular-nums;}',
    P + '-ct-cell{text-align:center;padding:7px 3px;border-radius:6px;font-weight:500;color:var(--ink);font-variant-numeric:tabular-nums;cursor:help;}',
    P + '-ct-cell.none{background:transparent !important;cursor:default;}',
    P + '-ct-cell.part{background:#f1f3f6 !important;font-style:italic;color:var(--muted);}',
    P + '-panel-h ' + P + '-under{padding:0;margin-left:auto;}',
    P + '-h-area{color:var(--muted);font-weight:400;cursor:help;}',
    P + '-panel-h > ' + P + '-sub-tabs{margin-left:auto;}',
    '</style>'
  ].join('\n');
}

// Дополнение стилей вкладки «Аудитория»: карточка ЦА, условия, воронка.
function buildCSS2() {
  var P = '.' + CFG.ns;
  return [
    '<style>',
    P + '-panel-b.path-wrap{overflow:auto;display:flex;flex-direction:column;gap:18px;}',
    // Сводка «Кто из ЦА» над полосой.
    P + '-aud-sum{display:flex;align-items:center;gap:18px;flex-wrap:wrap;font-size:var(--fs-note);color:var(--muted);margin:2px 0 8px;}',
    P + '-aud-sum b{color:var(--ink);font-weight:600;}',
    P + '-aud-sum button{margin-left:auto;}',
    P + '-root{position:relative;}',
    P + '-btn.primary{background:var(--act);color:#fff;border-color:var(--act);}',
    P + '-btn.primary:hover{background:#1B4AA8;}',
    P + '-btn[disabled]{opacity:.45;cursor:default;}',
    // Настройки ЦА — жёлтая рамка (макет .scopebar.wide): слева «с чем сравниваем», справа база и условия.
    P + '-scopebar{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1fr);gap:20px;border:1px solid #f0dcb4;border-radius:10px;'
      + 'background:linear-gradient(100deg,#fffaf1 0,#fff 55%);padding:14px 16px;flex:0 0 auto;}',
    P + '-sb-col{min-width:0;display:flex;flex-direction:column;gap:8px;}',
    P + '-sb-set{border-left:1px solid #f3e6cc;padding-left:20px;}',
    P + '-as-t{font-size:var(--fs-body);font-weight:600;color:var(--ink);display:flex;align-items:center;gap:8px;flex-wrap:wrap;line-height:1.35;}',
    P + '-as-t ' + P + '-sig-chip{flex:0 0 auto;}',
    P + '-as-x{font-size:var(--fs-note);color:var(--muted);line-height:1.5;}',
    P + '-as-x b{color:var(--ink2);font-weight:500;}',
    P + '-sig-chip.warn{background:#fff0d6;color:#8a5a00;}',
    P + '-ca-row .' + CFG.ns + '-ca-l, ' + P + '-ca-row > ' + P + '-ca-l{flex:0 0 64px;}',
    P + '-ca-row.chips{padding-left:70px;}',
    P + '-fn-box{flex:0 0 auto;}',
    P + '-path{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:16px;align-items:start;}',
    P + '-card2{border:1px solid var(--line);border-radius:10px;padding:14px 16px;min-width:0;display:flex;flex-direction:column;gap:12px;}',
    P + '-cap2{font-size:var(--fs-cap);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:500;}',
    P + '-ca-n{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;}',
    P + '-ca-n b{font-size:22px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums;}',
    P + '-ca-n span{font-size:var(--fs-note);color:var(--muted);}',
    P + '-ca-sec{display:flex;flex-direction:column;gap:6px;}',
    P + '-ca-l{font-size:var(--fs-note);color:var(--muted);font-weight:500;}',
    P + '-ca-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}',
    P + '-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;height:26px;padding:0 4px 0 10px;border-radius:999px;background:var(--blue-bg);color:var(--act-ink);font-size:var(--fs-note);font-weight:500;}',
    P + '-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    P + '-chip button{border:0;background:transparent;color:var(--act-ink);cursor:pointer;font:inherit;font-size:13px;width:20px;height:20px;border-radius:50%;}',
    P + '-chip button:hover{background:rgba(36,95,212,.12);}',
    P + '-acl{display:flex;flex-direction:column;gap:4px;}',
    P + '-acl-r{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;font-size:var(--fs-note);color:var(--ink2);}',
    P + '-acl-r span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    P + '-acl-r b{font-weight:500;font-variant-numeric:tabular-nums;}',
    P + '-warn{font-size:var(--fs-note);line-height:1.45;color:#7a5200;background:#fff6e6;border-radius:8px;padding:8px 10px;}',
    P + '-note2{font-size:var(--fs-note);color:var(--muted);line-height:1.45;}',
    P + '-ca-pick{max-height:260px;overflow:auto;display:flex;flex-direction:column;}',
    // Выбор условий открывается ВПРАВО от кнопки (в тулбаре первого листа — влево от правого края).
    P + '-ca-row ' + P + '-dd.sm ' + P + '-dd-body{left:0;right:auto;width:340px;max-width:calc(100vw - 40px);}',
    P + '-pickrow.d1{padding-left:22px;}' + P + '-pickrow.d2{padding-left:36px;}' + P + '-pickrow.d3{padding-left:50px;}' + P + '-pickrow.d4{padding-left:64px;}',
    P + '-pickrow i{font-style:normal;color:var(--muted);margin-left:auto;font-variant-numeric:tabular-nums;}',
    // Воронка: строка = подпись · полоса (от ЦА) · число и переход от предыдущей ступени.
    P + '-fun{display:flex;flex-direction:column;gap:12px;}',
    P + '-fun-r{display:grid;grid-template-columns:150px minmax(0,1fr) 150px;align-items:center;gap:12px;}',
    P + '-fun-l{font-size:var(--fs-body);color:var(--ink2);}',
    P + '-fun-l small{display:block;font-size:var(--fs-note);color:var(--muted);}',
    P + '-fun-b{height:28px;background:#f3f5f8;border-radius:6px;overflow:hidden;}',
    P + '-fun-b i{display:block;height:100%;border-radius:6px;transform-origin:0 50%;}',
    P + '-fun-v{text-align:right;font-variant-numeric:tabular-nums;font-size:var(--fs-body);color:var(--ink);}',
    P + '-fun-v b{font-weight:600;}',
    P + '-fun-v small{display:block;font-size:var(--fs-note);color:var(--muted);}',
    P + '-fun-foot{display:flex;gap:18px;flex-wrap:wrap;border-top:1px solid var(--line2);padding-top:10px;font-size:var(--fs-note);color:var(--muted);}',
    P + '-fun-foot b{color:var(--ink2);font-weight:500;}',
    P + '-sig-chip.dead{background:#f0f1f3;color:var(--muted);}',
    P + '-segstrip.ca ' + P + '-seg-part.never .sp-bar{background:repeating-linear-gradient(135deg,#dfe3e8 0 4px,#eef0f3 4px 8px)!important;}',
    '</style>'
  ].join('');
}

function orgUnder(path, node) { return path === node || path.indexOf(node + CFG.orgSep) === 0; }

function orgParts(path) { return path ? path.split(CFG.orgSep) : []; }

function matchesPicks(p) {
  var pk = state.picks, i, hit;
  if (pk.org.length) {
    hit = false;
    for (i = 0; i < pk.org.length; i++) if (orgUnder(p.org, pk.org[i])) hit = true;
    if (!hit) return false;
  }
  if (pk.spec.length && pk.spec.indexOf(p.spec) < 0) return false;
  if (pk.stream.length && pk.stream.indexOf(p.stream) < 0) return false;
  if (pk.heads.length === 1 && (pk.heads[0] === 'Тим-лиды') !== !!p.is_head) return false;
  // Выбор ЛЮДЕЙ список не сужает: человек — строка самого списка, он
  // подсвечивается, остальные остаются — иначе Shift-добавить второго некуда.
  return true;
}

// Люди списка «Кто из ЦА»: ЦА-зрители (все, в т. ч. не заходившие в этот период) и
// зрители вне ЦА, заходившие за период. Не заходившие ни разу поимённо не приходят
// (в ответе они свёрнуты), их видно числами в группировках.
var SEG_FREQ = { reg: ['3', '4'], epi: ['2'], once: ['1'] };
var SEG_FREQ = {};
function baseList() {
  caState();
  var out = MODEL.people.filter(function (p) { return p.ca || p.cur; });
  return out.concat(MODEL.never);
}
function busList() { return baseList().filter(matchesPicks); }
function segHit(p) {
  var s = state.segSel;
  if (!s) return true;
  if (s === 'reach') return p.ca && !!p.cur;
  if (s === 'never') return p.ca && !p.cur;
  if (s === 'out') return !p.ca && !!p.cur;
  if (s === 'ca') return p.ca;
  return true;
}
function shownList() {
  var q = (state.q || '').toLowerCase();
  return busList().filter(function (p) {
    return segHit(p) && (!q || ((p.fio + ' ' + p.login).toLowerCase().indexOf(q) >= 0));
  });
}
function pickCount() {
  var n = 0;
  for (var k in state.picks) if (Object.prototype.hasOwnProperty.call(state.picks, k)) n += state.picks[k].length;
  return n;
}

function daysAgo(p) {
  if (!p.last_dt) return null;
  var now = new Date();
  return Math.round((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    - Date.UTC(p.last_dt.y, p.last_dt.m, p.last_dt.d)) / 86400000);
}

function lastVisitHtml(p) {
  var d = daysAgo(p);
  if (d == null) return '<span class="mut">нет</span>';
  return d <= 1 ? 'вчера' : daysFmt(d);
}

function isoDate(t) { return t ? p2(t.d) + '.' + p2(t.m + 1) + '.' + t.y : ''; }

// --- Поимённый список: сортировка → пагинация (TABLES.md §1) ----------------

function personKey(p, key) {
  if (key === 'fio') return (p.fio || p.login).toLowerCase();
  if (key === 'org') return p.org ? p.org.toLowerCase() : null;
  if (key === 'exp') return p.exp || null;
  if (key === 'last') { var d = daysAgo(p); return d == null ? null : -d; }
  return p[key];
}

function sortPeople(list) {
  var sc = state.pSort, out = list.slice();
  out.sort(function (a, b) {
    var va = personKey(a, sc.key), vb = personKey(b, sc.key);
    var ea = va == null || va === '', eb = vb == null || vb === '';
    if (ea !== eb) return ea ? 1 : -1;          // пустые — всегда вниз (RETRO 29)
    var r = ea ? 0 : (va > vb ? 1 : (va < vb ? -1 : 0)) * sc.dir;
    return r || (b.days - a.days) || (b.views - a.views) || (a.login < b.login ? -1 : (a.login > b.login ? 1 : 0));
  });
  return out;
}

function orgShort(path) {
  var ps = orgParts(path);
  return ps.length ? ps[ps.length - 1] : '';
}

function personRowHtml(p) {
  var on = state.picks.login.indexOf(p.login) >= 0;
  var ps = orgParts(p.org);
  return '<tr class="pk' + (on ? ' sel' : '') + '"' +
    ' data-who="' + esc(p.login) + '" data-whocut="login" tabindex="0" role="button" aria-pressed="' + on + '"' +
    '>' +
    '<td class="txt">' + esc(p.fio || p.login) +
      (p.is_head ? ' <i class="' + CFG.ns + '-rflag head">рук.</i>' : '') + (p.fired ? ' <i class="' + CFG.ns + '-rflag fired" title="Нет среди действующих сотрудников с AD-логином">уволен</i>' : '') +
      '<span class="' + CFG.ns + '-unit-sub">' + esc(p.login) + '</span></td>' +
    '<td class="txt sec">' + esc(ps.length ? ps[ps.length - 1] : '—') +
      '<span class="' + CFG.ns + '-unit-sub">' + esc(ps.length > 1 ? 'УС-' + (ps.length + 2) + ' · ' + ps[0] : (p.spec || '—')) + '</span></td>' +
    '<td class="txt">' + esc(p.exp || '—') + '</td>' +
    '<td class="lead">' + (p.days || '<span class="mut">0</span>') + '</td>' +
    '<td>' + (p.views ? nf(p.views) : '<span class="mut">0</span>') + '</td>' +
    '<td>' + lastVisitHtml(p) + '</td>' +
    '<td class="txt"><span class="' + CFG.ns + '-sig-chip ' + p.segCls + '">' + esc(p.seg) + '</span></td>' +
    '</tr>';
}

function grainCfg() { return CFG.grains[state.grain] || CFG.grains.d; }

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function actLabel() { return 'Активных ' + grainCfg().units; }

function sortTh(attr, col, sc, cls) {
  var on = sc.key === col.key;
  return '<th class="srt' + (col.txt ? ' txt' : '') + (on ? ' on' : '') + (cls ? ' ' + cls : '') + '" ' + attr + '="' + esc(col.key) + '"' +
    (col.hint ? tip({ title: col.label, text: col.hint + '. Клик — сортировка.' }) : '') + '>' +
    esc(col.label) + '<i class="' + CFG.ns + '-sa">' + (on ? (sc.dir < 0 ? '▼' : '▲') : '') + '</i></th>';
}

function pagerHtml(total) {
  var PS = CFG.pageSize, pages = Math.max(1, Math.ceil(total / PS));
  if (state.page > pages - 1) state.page = pages - 1;
  if (state.page < 0) state.page = 0;
  if (total <= PS) return '';
  var a = state.page * PS + 1, b = Math.min(total, a + PS - 1);
  // Разметка и классы — как у пагинатора каталога (общий стиль таблиц).
  return '<div class="' + CFG.ns + '-pager"><span class="' + CFG.ns + '-pginfo">Показано ' + nf(a) + '–' + nf(b) + ' из ' + nf(total) + '</span>' +
    '<span class="spacer"></span>' +
    '<button type="button" class="' + CFG.ns + '-pgbtn" data-pg="prev"' + (state.page === 0 ? ' disabled' : '') + ' aria-label="Предыдущая страница">‹</button>' +
    '<span class="' + CFG.ns + '-pgnum">' + (state.page + 1) + ' / ' + pages + '</span>' +
    '<button type="button" class="' + CFG.ns + '-pgbtn" data-pg="next"' + (state.page >= pages - 1 ? ' disabled' : '') + ' aria-label="Следующая страница">›</button></div>';
}

function emptyPeopleText() {
  if (state.segSel === 'never' && MODEL.namesOmitted) {
    return 'Имена не загружены: не заходивших из ЦА больше 20 000. Сузьте ЦА условиями («Настроить ЦА») — список появится; числа по группам — в группировке.';
  }
  return 'Никто не подходит под выбранный отбор, поиск и выбор.';
}
function peopleTableHtml(plist) {
  var sorted = sortPeople(plist);
  var PS = CFG.pageSize, pager = pagerHtml(sorted.length);
  var page = sorted.slice(state.page * PS, state.page * PS + PS);
  var th = '';
  for (var c = 0; c < CFG.pcols.length; c++) {
    var pc = CFG.pcols[c];
    if (pc.key === 'days') pc = { key: 'days', label: cap(grainCfg().units), hint: pc.hint };
    th += sortTh('data-psort', pc, state.pSort);
  }
  var rows = '';
  for (var i = 0; i < page.length; i++) rows += personRowHtml(page[i]);
  return '<div class="' + CFG.ns + '-tbl-scroll"><table class="' + CFG.ns + '-ptable dense who-people"><thead><tr>' + th + '</tr></thead><tbody>' +
    (rows || '<tr><td colspan="' + CFG.pcols.length + '" class="' + CFG.ns + '-empty-td">' + emptyPeopleText() + '</td></tr>') +
    '</tbody></table></div>' + pager;
}

// --- Сводная таблица групп ЦА ---------------------------------------------------
// Итоги групп считаются здесь из людей (зрители поимённо + свёрнутый штат), поэтому
// они всегда соответствуют текущей настройке ЦА.
var ORG_NONE = '—none';
var MAX_SHARE = 100, VISIBLE_NODES = [];
function orgLevelOf(cut) { var m = /^org([3-7])$/.exec(cut || ''); return m ? +m[1] : 0; }
function keysOf(cut, x) {
  var L = orgLevelOf(cut), lp, out = [], j;
  if (L) { lp = orgParts(x.org); return [lp.length < L - 2 ? ORG_NONE : lp.slice(0, L - 2).join(CFG.orgSep)]; }
  if (cut === 'org') { lp = orgParts(x.org); for (j = 1; j <= lp.length; j++) out.push(lp.slice(0, j).join(CFG.orgSep)); return out; }
  if (cut === 'heads') return [x.is_head ? 'Тим-лиды' : 'Остальные'];
  if (cut === 'spec' || cut === 'stream') return [x[cut] || ORG_NONE];
  return [];
}
function groupAgg(cut) {
  var st = caState();
  if (st.groups[cut]) return st.groups[cut];
  var out = {}, i, j, ks;
  for (i = 0; i < MODEL.people.length; i++) {
    ks = keysOf(cut, MODEL.people[i]);
    for (j = 0; j < ks.length; j++) addP(out[ks[j]] || (out[ks[j]] = emptyA()), MODEL.people[i]);
  }
  for (i = 0; i < MODEL.hold.length; i++) {
    if (!MODEL.hold[i].cn) continue;
    ks = keysOf(cut, MODEL.hold[i]);
    for (j = 0; j < ks.length; j++) addH(out[ks[j]] || (out[ks[j]] = emptyA()), MODEL.hold[i]);
  }
  st.groups[cut] = out;
  return out;
}
function gMetrics(a) {
  a = a || emptyA();
  var G = CFG.grains[MODEL.grain] || CFG.grains.d;
  return {
    ca: a.ca, reach: a.reach, never: Math.max(0, a.ca - a.reach), out: a.out, reg: a.reg,
    users: a.ca + a.out,
    cov: a.ca ? a.reach / a.ca * 100 : null,
    dReach: G.prev && a.reachPrev ? (a.reach / a.reachPrev - 1) * 100 : null,
    regShare: a.reach ? a.reg / a.reach * 100 : null
  };
}
function makeNode(cut, k, name, depth, a, sub) {
  return { id: cut + ':' + k, cut: cut, k: k, name: name, depth: depth, m: gMetrics(a), sub: sub || '' };
}
function orgNode(path) {
  var ps = orgParts(path);
  return makeNode('org', path, ps[ps.length - 1], ps.length - 1, groupAgg('org')[path], 'УС-' + (ps.length + 2));
}
function nodeKids(nd) {
  if (nd.cut !== 'org' || nd.flat) return [];
  var ks = MODEL.orgKids[nd.k] || [], out = [];
  for (var i = 0; i < ks.length; i++) out.push(orgNode(ks[i]));
  return out.filter(function (x) { return x.m.users > 0; });
}
function rootNodes(cut) {
  var out = [], k, L = orgLevelOf(cut), ag = groupAgg(cut);
  if (L) {
    for (k in ag) {
      if (!Object.prototype.hasOwnProperty.call(ag, k)) continue;
      if (k === ORG_NONE) {
        var rn = makeNode('org', ORG_NONE, '—', 0, ag[k], 'не доходят до УС-' + L);
        rn.id = cut + ':' + ORG_NONE; rn.flat = true; rn.noBus = true; out.push(rn);
        continue;
      }
      var pp = orgParts(k);
      var fn2 = makeNode('org', k, pp[pp.length - 1], 0, ag[k], 'УС-' + L + (pp.length > 1 ? ' · ' + pp.slice(0, -1).join(CFG.orgSep) : ''));
      fn2.id = cut + ':' + k; fn2.flat = true; out.push(fn2);
    }
  } else if (cut === 'org') {
    var ks = MODEL.orgKids[''] || [];
    for (var i = 0; i < ks.length; i++) out.push(orgNode(ks[i]));
  } else if (cut === 'heads') {
    out.push(makeNode('heads', 'Тим-лиды', 'Тим-лиды', 0, ag['Тим-лиды']));
    out.push(makeNode('heads', 'Остальные', 'Остальные', 0, ag['Остальные']));
  } else {
    for (k in ag) {
      if (!Object.prototype.hasOwnProperty.call(ag, k)) continue;
      var nd = makeNode(cut, k, k === ORG_NONE ? '—' : k, 0, ag[k], k === ORG_NONE ? 'не указано' : '');
      if (k === ORG_NONE) nd.noBus = true;
      out.push(nd);
    }
  }
  return out.filter(function (x) { return x.m.users > 0; });
}
function peopleIndex(plist, cut) {
  var ix = {};
  for (var i = 0; i < plist.length; i++) {
    var p = plist[i], key;
    if (cut === 'org') key = p.org;
    else { var ks = keysOf(cut, p); if (!ks.length) continue; key = ks[0]; }
    (ix[key] = ix[key] || []).push(p);
  }
  return ix;
}
function gColsNow() {
  var G = CFG.grains[MODEL.grain] || CFG.grains.d, out = [];
  for (var i = 0; i < CFG.gcols.length; i++) if (!CFG.gcols[i].prevOnly || G.prev) out.push(CFG.gcols[i]);
  return out;
}
function sortNodes(nodes) {
  var sc = state.gSort;
  return nodes.slice().sort(function (a, b) {
    if (!!a.noBus !== !!b.noBus) return a.noBus ? 1 : -1;
    var va = sc.key === 'name' ? a.name.toLowerCase() : a.m[sc.key];
    var vb = sc.key === 'name' ? b.name.toLowerCase() : b.m[sc.key];
    var ea = va == null, eb = vb == null;
    if (ea !== eb) return ea ? 1 : -1;
    var r = ea ? 0 : (va > vb ? 1 : (va < vb ? -1 : 0)) * sc.dir;
    return r || b.m.users - a.m.users || (a.name < b.name ? -1 : 1);
  });
}
// Ячейка «Охват»: полоса + число фиксированной ширины (как «Доля» первого листа);
// при доступе почти у всей компании процент скрыт.
function shareCell(share, barPct) {
  if (share == null || wide()) return '<td class="shr"><span class="mut">—</span></td>';
  return '<td class="shr"><span class="' + CFG.ns + '-shr">' +
    '<span class="' + CFG.ns + '-cellbar"' + (barPct == null ? ' style="visibility:hidden"' : '') + '><i style="width:' + Math.min(100, barPct || 0).toFixed(1) + '%"></i></span>' +
    '<span class="' + CFG.ns + '-shr-v">' + pct(share, share < 10 ? 1 : 0) + '</span></span></td>';
}
function gCellHtml(key, m) {
  var z = function (v) { return v ? nf(v) : '<span class="mut">0</span>'; };
  if (key === 'ca') return '<td class="lead">' + nf(m.ca) + '</td>';
  if (key === 'cov') return shareCell(m.cov, m.cov);
  if (key === 'reach') return '<td>' + z(m.reach) + '</td>';
  if (key === 'dReach') {
    if (m.dReach == null) return '<td><span class="mut">—</span></td>';
    var cls = Math.abs(m.dReach) < 0.05 ? 'flat' : (m.dReach > 0 ? 'up' : 'down');
    return '<td><span class="' + CFG.ns + '-dnum ' + cls + '">' + signed(m.dReach, 1, '%') + '</span></td>';
  }
  if (key === 'regShare') return '<td>' + (m.regShare == null ? '<span class="mut">—</span>' : pct(m.regShare, 0)) + '</td>';
  if (key === 'never') return '<td>' + z(m.never) + '</td>';
  if (key === 'out') return '<td>' + z(m.out) + '</td>';
  return '<td></td>';
}

function groupRowHtml(nd, cols, hasKids, open, lc) {
  var sel = (state.picks[nd.cut] || []).indexOf(String(nd.k)) >= 0;
  var local = lc != null;
  var cN = local ? (lc[nd.k] || 0) : null;
  var dim = local && !sel && !cN;
  var m = nd.m;
  // Вторая строка, как у отчёта (владелец) и человека (логин): уровень и состав.
  var nk = nd.cut === 'org' && !nd.flat ? (MODEL.orgKids[nd.k] || []).length : 0;
  var sub = nd.cut === 'org'
    ? nd.sub + (nk ? ' · ' + nk + ' ' + plural(nk, 'подразделение', 'подразделения', 'подразделений') : '')
    : '';
  var h = '<tr class="grp-h' + (sel ? ' sel' : '') + (dim ? ' grp-dim' : '') + ' d' + Math.min(nd.depth, 4) + '"' +
    (nd.noBus ? '' : ' data-who="' + esc(nd.k) + '" data-whocut="' + esc(nd.cut) + '" tabindex="0" role="button" aria-pressed="' + sel + '"') +
    '>' +
    '<td class="txt gname" style="padding-left:' + (6 + nd.depth * 18) + 'px">' +
    (hasKids
      ? '<button type="button" class="' + CFG.ns + '-gh-caret" data-gtog="' + esc(nd.id) + '" aria-expanded="' + open + '" aria-label="' + (open ? 'Свернуть ' : 'Раскрыть ') + esc(nd.name) + '">' + (open ? '▾' : '▸') + '</button>'
      : '<span class="' + CFG.ns + '-gh-sp"></span>') +
    '<span class="' + CFG.ns + '-gtx"><span class="' + CFG.ns + '-gh-name gh-name">' + esc(nd.name) + '</span>' +
    (sub ? '<span class="' + CFG.ns + '-unit-sub">' + esc(sub) + '</span>' : '') + '</span></td>';
  for (var c = 0; c < cols.length; c++) h += gCellHtml(cols[c].key, m);
  if (local) h += '<td class="loc">' + (cN ? nf(cN) : '<span class="mut">0</span>') + '</td>';
  return h + '</tr>';
}

function nestPeopleHtml(nd, people, span) {
  var sorted = sortPeople(people);
  var lim = state.gMore[nd.id] ? CFG.subMax : CFG.subShow;
  // Сетка вложенной таблицы фиксирована (table-layout:fixed + colgroup) и одна на все группы:
  // колонки людей стоят на одной вертикали независимо от длины имён; глубина — отступом имени.
  var h = '<tr class="nest"><td colspan="' + span + '">' +
    '<table class="' + CFG.ns + '-ptable sub"><colgroup><col style="width:44%"><col style="width:12%"><col style="width:16%"><col style="width:12%"><col style="width:16%"></colgroup><tbody>';
  for (var i = 0; i < sorted.length && i < lim; i++) {
    var p = sorted[i], on = state.picks.login.indexOf(p.login) >= 0;
    h += '<tr class="pk' + (on ? ' sel' : '') + '" data-who="' + esc(p.login) + '" data-whocut="login" tabindex="0" role="button" aria-pressed="' + on + '"' +
      '>' +
      '<td class="txt pn" style="padding-left:' + (30 + nd.depth * 18) + 'px">' + esc(p.fio || p.login) + (p.is_head ? ' <i class="' + CFG.ns + '-rflag head">рук.</i>' : '') + (p.fired ? ' <i class="' + CFG.ns + '-rflag fired" title="Нет среди действующих сотрудников с AD-логином">уволен</i>' : '') +
        ' <span class="' + CFG.ns + '-wo-login">' + esc(p.login) + '</span></td>' +
      '<td>' + nf(p.days) + THIN + grainCfg().us + '</td><td>' + (p.views ? nf(p.views) : '0') + ' просм.</td><td>' + lastVisitHtml(p) + '</td>' +
      '<td class="txt"><span class="' + CFG.ns + '-sig-chip ' + p.segCls + '">' + esc(p.seg) + '</span></td></tr>';
  }
  h += '</tbody></table>';
  var ind = ' style="margin-left:' + (22 + nd.depth * 18) + 'px"';
  if (sorted.length > lim) {
    h += '<button type="button" class="' + CFG.ns + '-btn ghost xs" data-gmore="' + esc(nd.id) + '"' + ind + '>ещё ' +
      nf(Math.min(sorted.length, CFG.subMax) - lim) + ' из ' + nf(sorted.length) + '</button>';
  } else if (state.gMore[nd.id] && sorted.length > CFG.subShow) {
    h += '<button type="button" class="' + CFG.ns + '-btn ghost xs" data-gmore="' + esc(nd.id) + '"' + ind + '>свернуть</button>';
  }
  return h + '</td></tr>';
}

function groupTableHtml(plist, cut) {
  var cols = gColsNow(), local = false;
  var span = cols.length + 1 + (local ? 1 : 0);
  var pix = peopleIndex(plist, cut), lc = null;
  var out = [], visible = [];
  function walk(nodes) {
    var s = sortNodes(nodes);
    for (var i = 0; i < s.length; i++) {
      var nd = s[i], kids = nodeKids(nd), people = pix[nd.k] || [];
      var hasKids = kids.length > 0 || people.length > 0;
      var open = !!state.gOpen[nd.id] && hasKids;
      visible.push({ nd: nd, hasKids: hasKids, open: open });
      out.push(groupRowHtml(nd, cols, hasKids, open, lc));
      if (!open) continue;
      if (kids.length) walk(kids);
      if (people.length) out.push(nestPeopleHtml(nd, people, span));
    }
  }
  var roots = rootNodes(cut);
  MAX_SHARE = 0;
  for (var ri = 0; ri < roots.length; ri++) if (roots[ri].m.share > MAX_SHARE) MAX_SHARE = roots[ri].m.share;
  walk(roots);
  VISIBLE_NODES = visible;
  var tot = gMetrics(caTotals()), th = sortTh('data-gsort', { key: 'name', label: cut === 'org' || orgLevelOf(cut) ? 'Подразделение' : 'Группа', txt: true }, state.gSort);
  // В шапке — короткие подписи (колонки равной ширины), в выгрузке — полные.
  for (var c = 0; c < cols.length; c++) th += sortTh('data-gsort', cols[c].short ? { key: cols[c].key, label: cols[c].short, hint: cols[c].label + '. ' + cols[c].hint } : cols[c], state.gSort);
  if (local) th += '<th' + tip({ title: 'В выборке', text: 'Люди текущего списка в группе: корзина частоты, поиск и настройки. Итоги слева — по всей области.' }) + '>В выборке</th>';
  // Общая каретка (ДС 4.6c) — в строке итога, на вертикали строчных кареток:
  // ничего не раскрыто — ▸ раскрывает группы на уровень вглубь; что-то раскрыто — ▾ сворачивает всё.
  var pre = cut + ':', anyOpen = false, canOpen = false;
  for (var ok in state.gOpen) if (Object.prototype.hasOwnProperty.call(state.gOpen, ok) && ok.indexOf(pre) === 0 && state.gOpen[ok]) { anyOpen = true; break; }
  for (var vn = 0; vn < visible.length; vn++) if (visible[vn].hasKids) { canOpen = true; break; }
  var totCaret = anyOpen
    ? '<button type="button" class="' + CFG.ns + '-gh-caret" data-wofold="all" aria-expanded="true" aria-label="Свернуть всё"' + tip({ text: 'Свернуть всё до верхнего уровня' }) + '>▾</button>'
    : (canOpen
      ? '<button type="button" class="' + CFG.ns + '-gh-caret" data-wofold="level" aria-expanded="false" aria-label="Раскрыть уровень"' + tip({ text: 'Раскрыть все группы на уровень вглубь; дальше — каретками строк' }) + '>▸</button>'
      : '<span class="' + CFG.ns + '-gh-sp"></span>');
  var totRow = '<tr class="g-tot tot"><td class="txt gname" style="padding-left:6px">' + totCaret + 'Итого по ЦА</td>';
  for (c = 0; c < cols.length; c++) totRow += cols[c].key === 'share' ? shareCell(100, null) : gCellHtml(cols[c].key, tot);
  // (строка итога строится ДО полос групп — MAX_SHARE к ней не применяется)
  if (local) totRow += '<td class="loc">' + nf(plist.length) + '</td>';
  totRow += '</tr>';
  // Ширины колонок фиксированы: имя 30%, «Доля» 15%, остальные числа — поровну;
  // длинное имя группы обрезается «…» по ширине колонки.
  var nNum = cols.length + (local ? 1 : 0), hasShare = false;
  for (c = 0; c < cols.length; c++) if (cols[c].key === 'cov') hasShare = true;
  var restW = (70 - (hasShare ? 15 : 0)) / Math.max(1, nNum - (hasShare ? 1 : 0));
  var cg = '<colgroup><col style="width:30%">';
  for (c = 0; c < cols.length; c++) cg += '<col style="width:' + (cols[c].key === 'cov' ? 15 : restW).toFixed(2) + '%">';
  if (local) cg += '<col style="width:' + restW.toFixed(2) + '%">';
  cg += '</colgroup>';
  return '<div class="' + CFG.ns + '-tbl-scroll"><table class="' + CFG.ns + '-ptable dense gt">' + cg + '<thead><tr>' + th + '</tr></thead><tbody>' + totRow +
    (out.length ? out.join('') : '<tr><td colspan="' + span + '" class="' + CFG.ns + '-empty-td">В целевой аудитории нет групп по этому разрезу.</td></tr>') +
    '</tbody></table></div>';
}

function exportRows() {
  var cut = state.whoCut, head, rows = [], i, c;
  var num2 = function (v, d) { return v == null || !isFinite(v) ? '' : (d ? v.toFixed(d).replace('.', ',') : String(Math.round(v))); };
  if (cut === 'none') {
    head = ['ФИО', 'Логин', 'Руководитель', 'УС-3', 'УС-4', 'УС-5', 'УС-6', 'УС-7', 'Специализация', 'Стрим', 'Стаж',
      'В ЦА', 'Доступ', actLabel(), 'Просмотров', 'Последний визит', 'Сегмент', 'Уволен'];
    var ps = sortPeople(shownList());
    for (i = 0; i < ps.length; i++) {
      var p = ps[i], op = orgParts(p.org);
      rows.push([p.fio, p.login, p.is_head ? 'да' : '', op[0] || '', op[1] || '', op[2] || '', op[3] || '', op[4] || '',
        p.spec, p.stream, p.exp, p.ca ? 'да' : '', p.acc ? 'да' : '', String(p.days), String(p.views), isoDate(p.last_dt), p.seg, p.fired ? 'да' : '']);
    }
    return { head: head, rows: rows };
  }
  var cols = gColsNow();
  var isOrg = cut === 'org' || orgLevelOf(cut) > 0;
  head = [isOrg ? 'Уровень' : 'Разрез', isOrg ? 'Путь' : 'Группа', 'Название'];
  for (c = 0; c < cols.length; c++) head.push(cols[c].label + (cols[c].key === 'cov' || cols[c].key === 'dReach' || cols[c].key === 'regShare' ? ', %' : ''));
  var cutLabel = '';
  for (c = 0; c < CFG.groups.length; c++) if (CFG.groups[c].key === cut) cutLabel = CFG.groups[c].label;
  function walk(nodes) {
    var s = sortNodes(nodes);
    for (var j = 0; j < s.length; j++) {
      var nd = s[j], m = nd.m, row = [nd.sub || cutLabel, nd.noBus ? '' : nd.k, nd.name];
      for (var q = 0; q < cols.length; q++) {
        var key = cols[q].key;
        row.push(key === 'cov' || key === 'dReach' || key === 'regShare' ? (key === 'cov' && wide() ? '' : num2(m[key], 1)) : num2(m[key]));
      }
      rows.push(row);
      walk(nodeKids(nd));
    }
  }
  walk(rootNodes(cut));
  return { head: head, rows: rows };
}

function toDelim(t, sep) {
  var cell = function (v) {
    v = v == null ? '' : String(v);
    if (sep === '\t') return v.replace(/[\t\r\n]+/g, ' ');
    var DQ = String.fromCharCode(34);
    return (v.indexOf(DQ) >= 0 || /[;\r\n]/.test(v)) ? DQ + v.split(DQ).join(DQ + DQ) + DQ : v;
  };
  var lines = [t.head.map(cell).join(sep)];
  for (var i = 0; i < t.rows.length; i++) lines.push(t.rows[i].map(cell).join(sep));
  return lines.join('\r\n');
}

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

function downloadCsv(text, name) {
  try {
    var blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    return true;
  } catch (e) { return false; }
}

// Полоса сегментов ЦА над списком (как корзины частоты первого листа): постоянные ·
// эпизодические · разовые · не заходили. Клик оставляет в списке сегмент; первые три
// уходят в людскую шину корзинами частоты (каталог слева сузится), «не заходили» — только здесь.
// Сводка «Кто из ЦА»: всего заходили · из них ЦА / вне ЦА · ЦА не заходили. Клик — отбор списка
// (только здесь: каталог слева сужает выбор групп и людей, не этот отбор).
function segStripHtml() {
  var t = caTotals(), W = wide(), never = Math.max(0, t.ca - t.reach), seen = t.reach + t.out;
  var parts = [
    { key: 'reach', label: 'ЦА заходили', n: t.reach, c: CFG.colors.seg[0], text: 'Люди ЦА, заходившие в отчёты области за период.' },
    { key: 'never', label: 'ЦА не заходили', n: never, c: CFG.colors.seg[3], text: 'Люди ЦА без визитов за период' + (MODEL.namesOmitted ? ' (имена не загружены: их больше 20 000 — сузьте ЦА).' : ': и заходившие раньше, и ни разу.') },
    { key: 'out', label: 'Вне ЦА заходили', n: t.out, c: CFG.colors.seg[2], text: 'Заходили за период, но в ЦА не входят.' }
  ];
  var tot = Math.max(1, t.reach + never + t.out);
  var h = '<div class="' + CFG.ns + '-aud-sum"><span>Заходили за период <b>' + nf(seen) + '</b>' +
    (seen ? ' · из ЦА <b>' + pct(t.reach / seen * 100, 0) + '</b>' : '') + '</span><span>ЦА <b>' + nf(t.ca) + '</b>' +
    (W ? '' : ' · охват <b>' + pct(t.ca ? t.reach / t.ca * 100 : 0, 0) + '</b>') + '</span>' +
    (state.segSel ? '<button type="button" class="' + CFG.ns + '-btn ghost xs" data-seg="' + state.segSel + '">Показать всех</button>' : '') + '</div>';
  h += '<div class="' + CFG.ns + '-segstrip freq ca" role="group" aria-label="Кто из ЦА">';
  for (var i = 0; i < parts.length; i++) {
    var pt = parts[i], on = state.segSel === pt.key, share = pt.n / tot * 100;
    h += '<button class="' + CFG.ns + '-seg-part ' + pt.key + (on ? ' on' : '') + (state.segSel && !on ? ' off' : '') + '"' +
      ' data-seg="' + pt.key + '" style="flex:' + Math.max(8, share).toFixed(2) + ' 1 0"' +
      tip({ title: pt.label, text: pt.text + ' Клик оставит в списке только их' + (on ? '; повторный клик снимет' : '') + '.',
        rows: [{ label: 'Человек', value: nf(pt.n), color: pt.c }] }) + '>' +
      '<span class="sp-bar" style="background:' + pt.c + '"></span>' +
      '<span class="sp-v">' + nf(pt.n) + '</span>' +
      '<span class="sp-l">' + esc(pt.label) + '</span>' +
      '</button>';
  }
  return h + '</div>';
}

function dropdownHtml(id, curKey, opts) {
  var cur = '';
  for (var i = 0; i < opts.length; i++) if (opts[i].key === curKey) cur = opts[i].trg || opts[i].label;
  var open = state.dd === id;
  var h = '<div class="' + CFG.ns + '-dd sm' + (open ? ' open' : '') + '">' +
    '<button class="' + CFG.ns + '-dd-trg" data-ddtoggle="' + esc(id) + '" data-action="toggle" aria-haspopup="true" aria-expanded="' + open + '" type="button">' +
      '<span class="' + CFG.ns + '-dd-txt">' + esc(cur) + '</span><span class="' + CFG.ns + '-dd-c" aria-hidden="true">▾</span>' +
    '</button>';
  if (open) {
    h += '<div class="' + CFG.ns + '-dd-body">';
    for (var o = 0; o < opts.length; o++) {
      h += '<button class="' + CFG.ns + '-dd-opt' + (opts[o].sub ? ' sub' : '') + (opts[o].key === curKey ? ' on' : '') + '" data-ddopt="' + esc(id) +
        '" data-val="' + esc(opts[o].key) + '" type="button">' + esc(opts[o].label) + '</button>';
    }
    h += '</div>';
  }
  return h + '</div>';
}

function whoCountHtml() {
  var cut = state.whoCut, cnt;
  if (cut !== 'none') {
    var nRoot = rootNodes(cut).length;
    cnt = orgLevelOf(cut)
      ? nf(nRoot) + ' ' + plural(nRoot, 'подразделение', 'подразделения', 'подразделений') + ' УС-' + orgLevelOf(cut)
      : nf(nRoot) + ' ' + plural(nRoot, 'группа', 'группы', 'групп') + (cut === 'org' ? ' верхнего уровня' : '');
  } else {
    var n = shownList().length;
    cnt = nf(n) + ' ' + plural(n, 'человек', 'человека', 'человек');
  }
  return cnt + (pickCount() ? ' · <b class="who-sel"' +
    tip({ text: 'Активные условия людской шины: каталог слева сужен; клик по выбранной строке снимает условие' }) +
    '>выбрано: ' + pickCount() + '</b>' : '');
}
function whoTableHtml() {
  var cut = state.whoCut, plist = shownList();
  return cut !== 'none' ? groupTableHtml(plist, cut) : peopleTableHtml(plist);
}
function groupsNow() {
  var lv = {};
  for (var pk in MODEL.orgKids) {
    if (!Object.prototype.hasOwnProperty.call(MODEL.orgKids, pk)) continue;
    var ks = MODEL.orgKids[pk];
    for (var i = 0; i < ks.length; i++) lv[orgParts(ks[i]).length + 2] = true;
  }
  return CFG.groups.filter(function (g) { var L = orgLevelOf(g.key); return !L || !!lv[L]; });
}
var COPY_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
var EXPAND_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>';
var SHRINK_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10h-6V4M4 14h6v6M14 10l7-7M10 14l-7 7"/></svg>';
function listZoneHtml() {
  var views = groupsNow(), known = false;
  for (var v = 0; v < views.length; v++) if (views[v].key === state.whoCut) known = true;
  if (!known) state.whoCut = 'none';
  var cut = state.whoCut, grouped = cut !== 'none', N = CFG.ns;
  return '<div class="' + N + '-who-bar">' +
    '<div class="' + N + '-bar-g">' +
      dropdownHtml('whoCut', cut, views) +
      searchBoxHtml('whoQ', 'Имя или логин', state.q) +
    '</div>' +
    '<div class="' + N + '-bar-g r">' +
      '<span class="' + N + '-who-cnt">' + whoCountHtml() + '</span>' +
      '<span class="' + N + '-bar-sep" aria-hidden="true"></span>' +
      '<button class="' + N + '-btn ' + N + '-ibtn" data-wexp="copy" type="button" aria-label="Копировать"' + tip({ title: 'Копировать', text: grouped
        ? 'Все группы всех уровней с итогами ЦА — в буфер обмена; вставка в Excel разложит по колонкам.'
        : 'Все люди списка с учётом сегмента, поиска и выбора (не только страница) — в буфер обмена.' }) + '>' + COPY_SVG + '</button>' +
      '<button class="' + N + '-btn ' + N + '-ibtn' + (state.whoFull ? ' on' : '') + '" data-wfull="1" type="button" aria-pressed="' + !!state.whoFull + '" aria-label="' + (state.whoFull ? 'Вернуть KPI' : 'Список на весь чарт') + '"' +
        tip({ title: state.whoFull ? 'Вернуть KPI и «Что видно»' : 'Список на весь чарт', text: state.whoFull ? 'Вернуть панель в обычный вид.' : 'Скрыть KPI и «Что видно в данных» — список займёт весь правый чарт.' }) +
        '>' + (state.whoFull ? SHRINK_SVG : EXPAND_SVG) + '</button>' +
    '</div>' +
    '<span class="' + N + '-toast" role="status">' + esc(state.toast || '') + '</span>' +
    '</div>' +
    '<div class="' + N + '-who-tbl">' + whoTableHtml() + '</div>';
}
function whoFilterCount() { return pickCount(); }

function tabsHtml(tabKey, tabs) {
  var h = '';
  for (var i = 0; i < tabs.length; i++) {
    h += '<button class="' + CFG.ns + '-sub-tab' + (tabs[i].on ? ' active' : '') +
      '" role="tab" aria-selected="' + (tabs[i].on ? 'true' : 'false') +
      '" data-view="' + esc(tabKey) + ':' + esc(tabs[i].key) + '" type="button">' + esc(tabs[i].label) +
      (tabs[i].cnt ? '<span class="' + CFG.ns + '-sub-cnt ppl"' + tip({ text: 'Условий людской шины из «Кто смотрит»: ' + tabs[i].cnt + ' — каталог слева сужен' }) + '>' + tabs[i].cnt + '</span>' : '') +
      '</button>';
  }
  return h;
}

function searchBoxHtml(id, placeholder, value) {
  return '<div class="' + CFG.ns + '-psearch">' +
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
    '<input id="' + esc(id) + '" data-search="' + esc(id) + '" type="search" placeholder="' + esc(placeholder) + '" value="' + esc(value || '') + '">' +
    '</div>';
}

// Шапка панели: что за область на экране (эхо запроса: выбор своего каталога вкладки).
function areaInfo() {
  var a = MODEL.area, L = CFG.areaLabels[a.mode];
  if (!a.mode || !a.sel.length || !L) {
    return { pill: 'весь Proteus', mut: true, text: 'Выбора в каталоге вкладки нет — ЦА и зрители по всему Proteus.', what: 'Proteus' };
  }
  var one = a.sel.length === 1;
  var name = one ? (a.mode === 'report' ? (a.names[0] || a.sel[0]) : a.sel[0]) : '';
  return {
    pill: one ? L[0] + ': ' + name : L[1] + ': ' + a.sel.length, mut: false,
    text: 'Область задана каталогом вкладки слева' + (one ? '' : ' (' + a.sel.length + ' значений, объединение)') +
      '. ЦА по правам — право хотя бы на один отчёт области.',
    what: one ? '«' + name + '»' : L[1] + ' (' + a.sel.length + ')'
  };
}

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

function areaFilterRowHtml(ai) {
  var own = [], pk = state.picks, i;
  var add = function (cut, key, lots, arr, fmt, fullF) {
    if (!arr.length) return;
    if (arr.length <= 2) {
      for (var j = 0; j < arr.length; j++) own.push({ id: cut + '|' + arr[j], k: typeof key === 'function' ? key(arr[j]) : key, v: fmt ? fmt(arr[j]) : arr[j], full: fullF ? fullF(arr[j]) : arr[j] });
    } else {
      own.push({ id: cut + '|', k: lots, v: String(arr.length), full: arr.slice(0, 8).map(fmt || function (x) { return x; }).join('; ') });
    }
  };
  var fioOf = {};
  for (i = 0; i < MODEL.people.length; i++) fioOf[MODEL.people[i].login] = MODEL.people[i].fio || MODEL.people[i].login;
  add('org', function (x) { return 'УС-' + (orgParts(x).length + 2); }, 'Подразделения', pk.org, orgShort, function (x) { return x; });
  add('spec', 'Специализация', 'Специализации', pk.spec);
  add('stream', 'Стрим', 'Стримы', pk.stream);
  add('heads', '', 'Тим-лиды', pk.heads);
  add('login', 'Человек', 'Люди', pk.login, function (x) { return fioOf[x] || x; });
  return filterRowHtml(own, [], null, 'ppl');
}

function kpiCard(o) {
  return '<div class="' + CFG.ns + '-kpi">' +
    '<div class="' + CFG.ns + '-k-label">' + esc(o.label) +
      (o.hint ? '<span class="' + CFG.ns + '-info"' + tip(o.hint) + ' aria-hidden="true">i</span>' : '') + '</div>' +
    '<div class="' + CFG.ns + '-k-val">' + o.value + '</div>' +
    '<div class="' + CFG.ns + '-k-row">' + (o.delta || '') + '</div>' +
    '<div class="' + CFG.ns + '-k-row">' + (o.sub ? '<span class="' + CFG.ns + '-k-sub">' + o.sub + '</span>' : '') + '</div>' +
    '</div>';
}

// Пять карточек ЦА области. Предыдущий период сравнивается только там, где он целиком
// помещается в 13 месяцев истории (30 дней, 20 недель).
function kpisHtml() {
  var t = caTotals(), c = caCfg(), G = CFG.grains[MODEL.grain] || CFG.grains.d, W = wide();
  var dPct = function (a, b) { return b ? (a / b - 1) * 100 : null; };
  var why = 'В витрине 13 месяцев истории: полного предыдущего периода (' + G.label + ') в ней нет.';
  var dl = function (v, o) { return G.prev ? delta(v, o) : delta(null, { why: why }); };
  var hidden = '<span class="' + CFG.ns + '-nocmp"' + tip({ title: 'Проценты скрыты', text: 'Доступ открыт почти всей компании: знаменатель не описывает, для кого делали отчёт. Сузьте ЦА на вкладке «Путь ЦА».' }) + '>доступ почти у всех</span>';
  var never = Math.max(0, t.ca - t.reach);
  var reg = t.reach ? t.reg / t.reach * 100 : 0, regP = t.reachPrev ? t.regPrev / t.reachPrev * 100 : 0;
  var baseTxt = caModeNow() === 'cond' ? 'по условиям' : 'по правам доступа';
  return '<div class="' + CFG.ns + '-kpis">' +
    kpiCard({ label: 'Целевая аудитория', value: nf(t.ca),
      hint: { title: 'Целевая аудитория (ЦА)', text: 'Кого считаем аудиторией области: ' + baseTxt + '. Меняется в строке «Целевая аудитория» над листом. База — действующие сотрудники с AD-логином (штатные и ГПХ).' },
      delta: W ? hidden : '<span class="' + CFG.ns + '-k-sub">' + esc(baseTxt) + '</span>',
      sub: W ? '<b>' + pct(t.ca / MODEL.staff * 100) + '</b> всех сотрудников' : (MODEL.staff ? '<b>' + pct(t.ca / MODEL.staff * 100, 1) + '</b> сотрудников' : '') }) +
    kpiCard({ label: 'Adoption за год', value: W || !t.ca ? '—' : pct(t.yr / t.ca * 100),
      hint: { title: 'Adoption за год', text: 'Доля ЦА, открывавшая отчёты области хотя бы раз с 1 января. Накопленный охват: от периода полоски не зависит.' },
      delta: W ? hidden : '',
      sub: '<b>' + nf(t.yr) + '</b> ' + plural(t.yr, 'человек', 'человека', 'человек') + ' с 1 января' }) +
    kpiCard({ label: 'Дошли', value: nf(t.reach),
      hint: { title: 'Дошли ' + G.label, text: 'Люди ЦА, заходившие в отчёты области за период.' },
      delta: dl(dPct(t.reach, t.reachPrev), { vs: G.vs, unit: '%' }),
      sub: W ? 'охват не считаем' : 'охват ЦА: <b>' + pct(t.ca ? t.reach / t.ca * 100 : 0) + '</b>' }) +
    kpiCard({ label: 'Закрепились', value: t.reach ? pct(reg) : '—',
      hint: { title: 'Закрепились', text: 'Доля постоянных среди дошедших: ' + G.reg + ' и более разных ' + G.units + ' за период — та же мера, что «Постоянные» первого листа.' },
      delta: dl(reg - regP, { vs: G.vs, unit: ' п.п.', dead: 0.3 }),
      sub: '<b>' + nf(t.reg) + '</b> ' + plural(t.reg, 'человек', 'человека', 'человек') }) +
    kpiCard({ label: 'Не заходили', value: nf(never),
      hint: { title: 'Не заходили', text: 'Люди ЦА без визитов в отчёты области за период.',
        rows: [{ label: 'Без доступа', value: nf(Math.max(0, t.ca - t.acc)) }, { label: 'Заходили вне ЦА', value: nf(t.out) }] },
      delta: '',
      sub: caModeNow() === 'cond' ? 'без доступа: <b>' + nf(Math.max(0, t.ca - t.acc)) + '</b>' : (W ? 'вне ЦА заходили: <b>' + nf(t.out) + '</b>' : '<b>' + pct(t.ca ? never / t.ca * 100 : 0) + '</b> ЦА') }) +
    '</div>';
}

function obsHtml(what) {
  var list = obsList(MODEL.kpi, CFG.grains[MODEL.grain] || CFG.grains.d, what);
  var N = CFG.ns;
  if (!list.length) {
    return '<div class="' + N + '-obs"><div class="' + N + '-obs-h"><span class="' + N + '-obs-ico" aria-hidden="true">✓</span>' +
      '<span class="' + N + '-obs-t">Что видно в данных</span>' +
      '<span class="' + N + '-obs-lead">Отклонений выше порогов нет: показатели в пределах обычного разброса.</span></div></div>';
  }
  var o = list[0], open = !!state.obsOpen && list.length > 1;
  var h = '<div class="' + N + '-obs sev-' + o.sev + '"><div class="' + N + '-obs-h">' +
    '<span class="' + N + '-obs-ico" aria-hidden="true">!</span>' +
    '<span class="' + N + '-obs-t">Что видно в данных</span>' +
    (open ? '' : '<span class="' + N + '-obs-lead"' + tip({ title: o.lead, text: o.body, note: 'Отбор по порогу: ' + o.rule }) + '>' + esc(o.lead) + '</span>') +
    (list.length > 1
      ? '<button type="button" class="' + N + '-obs-tog" data-obs="toggle" aria-expanded="' + open + '">' +
        (open ? 'Свернуть ▴' : 'Ещё ' + (list.length - 1) + ' ▾') + '</button>'
      : '') +
    '</div>';
  if (open) {
    h += '<ul class="' + N + '-obs-list">';
    for (var i = 0; i < list.length; i++) {
      h += '<li class="' + N + '-obs-li"' + tip({ title: list[i].lead, text: 'Отбор по порогу: ' + list[i].rule }) + '>' +
        '<i class="' + N + '-obs-dot sev-' + list[i].sev + '"></i>' +
        '<div><b>' + esc(list[i].lead) + '</b> <span>' + esc(list[i].body) + '</span></div></li>';
    }
    h += '</ul>';
  }
  return h + '</div>';
}

// --- Вкладка «Путь ЦА»: настройка ЦА (слева) и воронка (справа) -----------------
function caCondText(c) {
  var parts = [], i;
  var lst = function (a) { return a.length <= 2 ? a.join(', ') : a.slice(0, 2).join(', ') + ' и ещё ' + (a.length - 2); };
  if (c.org.length) { var o = []; for (i = 0; i < c.org.length; i++) o.push(orgShort(c.org[i])); parts.push('подразделения: <b>' + esc(lst(o)) + '</b>'); }
  if (c.spec.length) parts.push('специализации: <b>' + esc(lst(c.spec)) + '</b>');
  if (c.stream.length) parts.push('стримы: <b>' + esc(lst(c.stream)) + '</b>');
  if (c.hq.length) parts.push('HQ: <b>' + esc(lst(c.hq.map(dash))) + '</b>');
  if (c.it.length) parts.push('IT: <b>' + esc(lst(c.it.map(dash))) + '</b>');
  if (c.heads) parts.push('<b>' + (c.heads === '1' ? 'только руководители' : 'без руководителей') + '</b>');
  if (c.adg && c.adg.length) parts.push('AD-группы: <b>' + esc(lst(c.adg)) + '</b>');
  return parts.join(' <span class="mut">и</span> ');
}
function dash(v) { return v === '' ? '— не указано' : v; }
function caCardHtml() {
  var c = caCfg(), t = caTotals(), N = CFG.ns, W = wide(), gs = MODEL.acl.groups, i, cond = caModeNow() === 'cond';
  var ppl = function (n) { return nf(n) + ' ' + plural(n, 'человек', 'человека', 'человек'); };
  var gl = [];
  for (i = 0; i < gs.length && i < 4; i++) gl.push('<b>' + esc(gs[i].name) + '</b>');
  var gTxt = gl.join(', ') + (gs.length > 4 ? ' и ещё ' + nf(gs.length - 4) : '');
  var title, chip, text;
  if (cond) {
    title = 'Собрана по условиям';
    chip = '<span class="' + N + '-sig-chip note">' + ppl(t.ca) + '</span>';
    text = 'Все сотрудники с AD-логином, где ' + caCondText(c) + '. Эта ЦА — фильтр и для каталога слева: там отчёты, которыми она пользуется, и охват от неё.' +
      ' Доступ к области есть у <b>' + ppl(t.acc) + '</b> — ступень «Есть доступ» на воронке.'
  } else if (W) {
    title = 'Доступ роздан почти всей компании';
    chip = '<span class="' + N + '-sig-chip warn">охват не считаем</span>';
    text = 'Права выданы через ' + (gTxt || 'широкую группу') + ' — это <b>' + ppl(t.ca) + '</b>, ' + pct(t.ca / (MODEL.staff || 1) * 100, 0) +
      ' сотрудников. Такой знаменатель не описывает, для кого делали отчёт. <b>Настройте ЦА условиями</b> — и доли вернутся.';
  } else if (!gs.length && MODEL.acl.users) {
    title = 'Поимённый список доступа';
    chip = '<span class="' + N + '-sig-chip note">' + ppl(t.ca) + '</span>';
    text = 'Права выданы поимённо (' + nf(MODEL.acl.users) + '). Самый точный вид ЦА: охват и «не заходили» считаются без допущений.';
  } else if (!gs.length) {
    title = 'Прав на отчёты области в данных нет';
    chip = '<span class="' + N + '-sig-chip warn">ЦА пуста</span>';
    text = 'Настройте ЦА условиями — она соберётся по структуре.';
  } else {
    title = 'Доступ через AD-группы';
    chip = '<span class="' + N + '-sig-chip note">' + ppl(t.ca) + '</span>';
    text = 'Права выданы ' + plural(gs.length, 'группе', 'группам', 'группам') + ' ' + gTxt +
      (MODEL.acl.users ? ' плюс ' + nf(MODEL.acl.users) + ' поимённо' : '') + ' — всего <b>' + ppl(t.ca) + '</b>. Считаем их целевой аудиторией, пока не настроены условия.';
  }
  return '<div class="' + N + '-scopebar' + (W ? ' wide' : '') + '">' +
    '<div class="' + N + '-sb-col">' +
      '<div class="' + N + '-cap2">Целевая аудитория — с чем сравниваем охват</div>' +
      '<div class="' + N + '-as-t">' + esc(title) + chip + '</div>' +
      '<div class="' + N + '-as-x">' + text + '</div>' +
      '<div class="' + N + '-note2">' + (cond
        ? 'Условия меняются в строке <b>«Целевая аудитория»</b> над листом; «Сбросить» там вернёт ЦА «как роздан доступ».'
        : 'Собрать ЦА по структуре — в строке <b>«Целевая аудитория»</b> над листом: подразделения, специализация, стрим, HQ, IT, руководители, AD-группы.') + '</div>' +
    '</div></div>';
}
// Воронка (порт U.funnelSvg макета): центрированные бары сверху вниз, ширина ровно
// пропорциональна значению (масштаб — по самому большому этапу), название НАД баром,
// число слева, конверсия с предыдущего этапа справа, между барами — диагонали.
// Высота ступени фиксирована: растянутая на всю панель воронка читается как фон.
var FN_ROW = 74, FN_MIN_H = 300, FN_MAX_BAR = 460;
function funnelSteps() {
  var t = caTotals(), G = CFG.grains[MODEL.grain] || CFG.grains.d, cond = caModeNow() === 'cond';
  var st = [{ name: 'Целевая аудитория', value: t.ca, note: cond ? 'По условиям' : 'Как роздан доступ' }];
  if (cond) st.push({ name: 'Есть доступ к области', value: t.acc, note: 'Права выданы AD-группой или поимённо' });
  st.push({ name: 'Открыли хотя бы раз', value: t.reach, note: G.label });
  st.push({ name: 'Вернулись ещё раз', value: t.ret, note: 'Заходили в двух и более разных ' + G.units });
  st.push({ name: 'Заходят регулярно', value: t.reg, note: G.reg + '+ разных ' + G.units + ' за период' });
  return st;
}
function funnelSvg(steps, w) {
  var n = steps.length, i;
  if (!n || !w) return '';
  var H = Math.max(FN_MIN_H, n * FN_ROW), rowH = (H - 12) / n;
  var max = 1;
  for (i = 0; i < n; i++) if (steps[i].value > max) max = steps[i].value;
  var cx = w / 2, sideW = 64, maxBar = Math.max(60, Math.min(FN_MAX_BAR, w - sideW * 2 - 20));
  var W = wide(), body = '';
  for (i = 0; i < n; i++) {
    var st = steps[i], y = i * rowH + 16;
    var bh = Math.max(14, Math.min(FN_ROW - 26, rowH - 26));
    var bw = st.value / max * maxBar;
    var prev = i > 0 ? steps[i - 1].value : null;
    var conv = prev != null ? (prev ? st.value / prev * 100 : 0) : null;
    var color = CFG.colors.fun[Math.min(i, CFG.colors.fun.length - 1)];
    var rows = [{ label: 'Человек', value: nf(st.value), color: color }];
    if (conv != null) rows.push({ label: 'С предыдущего этапа', value: pct(conv, 0) });
    if (i > 0 && !W) rows.push({ label: 'От целевой аудитории', value: pct(steps[0].value ? st.value / steps[0].value * 100 : 0, 0), dash: true, color: CFG.colors.bench });
    body += '<text x="' + r1(cx) + '" y="' + r1(y - 5) + '" font-size="11" font-weight="600" text-anchor="middle" fill="#8a909c">' + esc(st.name) + '</text>';
    body += '<g' + tip({ title: st.name, rows: rows, note: st.note || null }) + '>' +
      '<rect x="0" y="' + r1(y - 14) + '" width="' + r1(w) + '" height="' + r1(bh + 18) + '" fill="transparent"/>' +
      (bw > 0.5
        ? '<g class="bar" data-d="' + (i * 45) + '"><rect x="' + r1(cx - bw / 2) + '" y="' + r1(y) + '" width="' + r1(bw) + '" height="' + r1(bh) + '" rx="2" fill="' + color + '"/></g>'
        : '<line x1="' + r1(cx - 9) + '" y1="' + r1(y + bh / 2) + '" x2="' + r1(cx + 9) + '" y2="' + r1(y + bh / 2) + '" stroke="#d4d7de" stroke-width="2"/>') +
      '</g>';
    body += '<text class="fade" x="' + r1(cx - bw / 2 - 8) + '" y="' + r1(y + bh * 0.68) + '" font-size="11.5" font-weight="600" text-anchor="end" fill="#1f1f1f">' + esc(nf(st.value)) + '</text>';
    if (conv != null) {
      body += '<text class="fade" x="' + r1(cx + bw / 2 + 8) + '" y="' + r1(y + bh * 0.68) + '" font-size="11.5" font-weight="500" text-anchor="start" fill="#8a909c">' + pct(conv, 0) + '</text>';
    }
    if (i < n - 1) {
      var nb = steps[i + 1].value / max * maxBar, ny = (i + 1) * rowH + 16;
      body += '<path d="M' + r1(cx - bw / 2) + ' ' + r1(y + bh) + 'L' + r1(cx - nb / 2) + ' ' + r1(ny) +
        'M' + r1(cx + bw / 2) + ' ' + r1(y + bh) + 'L' + r1(cx + nb / 2) + ' ' + r1(ny) + '" fill="none" stroke="#dfe3ea" stroke-width="1"/>';
    }
  }
  return '<svg viewBox="0 0 ' + r1(w) + ' ' + r1(H) + '" width="100%" data-dyn-svg="1" style="height:auto;display:block;overflow:visible" font-family="' + CFG.fonts.family +
    '" role="img" aria-label="Путь целевой аудитории">' + body + '</svg>';
}
function funnelHtml() {
  var t = caTotals(), N = CFG.ns;
  return '<div class="' + N + '-dynhead"><span class="' + N + '-cap">Путь целевой аудитории · от выданного доступа до регулярного использования</span></div>' +
    funnelSvg(funnelSteps(), SVG_W) +
    '<div class="' + N + '-tbl-note">Каждый следующий этап — подмножество предыдущего. ' +
    (caModeNow() === 'cond' ? 'Ступень <b>«Есть доступ»</b> отделяет «не роздали права» от «роздали, но не ходят». ' : '') +
    'Ни разу за период: <b>' + nf(Math.max(0, t.ca - t.reach)) + '</b> · разовые: <b>' + nf(t.once) + '</b> · заходили вне ЦА: <b>' + nf(t.out) + '</b>. ' +
    '<b>Когда</b> этапы набирались — на вкладке «Динамика».</div>';
}
function pathHtml() {
  return caCardHtml() + '<div class="' + CFG.ns + '-fn-box">' + funnelHtml() + '</div>';
}

function buildHTML() {
  if (!MODEL.people.length && !MODEL.hold.length) {
    return buildCSS() + buildCSS2() + '<div class="' + CFG.ns + '-root"><div class="' + CFG.ns + '-empty"><b>' + esc(CFG.text.noData) + '</b>' +
      'В области нет ни зрителей, ни сотрудников — снимите часть условий в каталоге или в полоске.</div></div>';
  }
  var N = CFG.ns, ai = areaInfo();
  var view = state.view === 'who' || state.view === 'dyn' ? state.view : 'path';
  var body, bodyCls, title, sub;
  if (view === 'who') {
    body = segStripHtml() + '<div class="' + N + '-list-zone">' + listZoneHtml() + '</div>';
    bodyCls = 'tbl-wrap'; title = 'Кто из ЦА'; sub = 'клик по группе или человеку сузит каталог слева · Shift — несколько';
  } else if (view === 'dyn') {
    body = dynamicsHtml(caSeries(), MODEL.grain);
    bodyCls = 'dyn-wrap'; title = 'Динамика'; sub = 'приход и охват целевой аудитории по периодам';
  } else {
    body = pathHtml();
    bodyCls = 'path-wrap'; title = 'Путь ЦА'; sub = 'кого считаем аудиторией и как она доходит до области';
  }
  var tabs = [];
  for (var t = 0; t < CFG.views.length; t++) tabs.push({ key: CFG.views[t].key, label: CFG.views[t].label, on: view === CFG.views[t].key, cnt: CFG.views[t].key === 'who' ? whoFilterCount() : 0 });
  var h = [];
  h.push('<div class="' + N + '-root">');
  h.push(areaFilterRowHtml(ai));
  if (!(view === 'who' && state.whoFull)) h.push('<div class="' + N + '-top">' + kpisHtml() + obsHtml(ai.mut ? 'Proteus' : ai.what) + '</div>');
  h.push('<div class="' + N + '-panel">');
  h.push('<div class="' + N + '-panel-h">' +
    '<div class="' + N + '-h-txt"><span>' + esc(title) + ' · <span class="' + N + '-h-area"' + tip({ title: 'Область', text: ai.text }) + '>' +
      esc(ai.mut ? 'весь Proteus' : ai.pill) + '</span></span>' +
      '<span class="sub">' + esc(sub) + '</span></div>' +
    '<div class="' + N + '-sub-tabs" role="tablist">' + tabsHtml('view', tabs) + '</div>' +
    '</div>');
  h.push('<div class="' + N + '-panel-b ' + bodyCls + '">' + body + '</div>');
  h.push('</div>');
  h.push('</div>');
  return buildCSS() + buildCSS2() + h.join('');
}

var SVG_W = 760;
// Высота динамики под ячейку чарта: меряется ПОСЛЕ монтажа (как SVG_W) и
// делится между стеком пользователей (60%) и просмотрами (40%). 0 — дефолт.
var DYN_H = 0;
// Анимация появления (ДС 6.5) — только в рендере с НОВЫМИ данными (клик по отчёту,
// смена периода): ресайз, наведение и клики внутри панели не анимируют.
var ANIM = false, CLIP_N = 0;
// Заливка под линией открывается слева направо: clipPath с растущей шириной (SMIL).
// Появление: столбики растут от оси, линия рисуется слева направо, точки и подписи
// проявляются, полосы долей и корзин растут слева. Web Animations — без @keyframes в CSS.
function animateIn(root) {
  if (!root || !root.querySelectorAll || typeof Element === 'undefined' || !Element.prototype.animate) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var run = function (sel, frames, o) {
    var els = root.querySelectorAll(sel);
    for (var i = 0; i < els.length; i++) {
      var d = +(els[i].getAttribute('data-d') || 0);
      try { els[i].animate(frames, { duration: o.dur, easing: o.ease || 'ease-out', delay: (o.delay || 0) + d, fill: 'both' }); } catch (e) { /* старый браузер — без анимации */ }
    }
  };
  var E1 = 'cubic-bezier(.22,.61,.36,1)', E2 = 'cubic-bezier(.4,0,.2,1)';
  run('svg .bar', [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { dur: 480, ease: E1 });
  run('svg .ln', [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { dur: 760, ease: E2 });
  run('svg .fade', [{ opacity: 0 }, { opacity: 1 }], { dur: 350, delay: 250 });
  run('.' + CFG.ns + '-cellbar i, .sp-bar', [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { dur: 480, ease: E1 });
}
function revealClip(h) {
  var id = CFG.ns + '-clip-' + (++CLIP_N);
  return { id: id, defs: '<defs><clipPath id="' + id + '"><rect x="0" y="0" height="' + r1(h) + '" width="' + (ANIM ? 0 : SVG_W) + '">' +
    (ANIM ? '<animate attributeName="width" from="0" to="' + SVG_W + '" dur="0.76s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".4 0 .2 1"/>' : '') +
    '</rect></clipPath></defs>' };
}
// Высота кривой удержания: остаток тела вкладки «Закрепляемость» (как у «Динамики»).
var COH_H = 0;
function r1(v) { return Math.round(v * 10) / 10; }
function svgHeadroom(max, n) {
  return Math.max(1, Math.ceil(max * (n > CFG.spacing.dense ? CFG.spacing.headroomDense : CFG.spacing.headroom)));
}
function svgBarWidth(n) {
  var inner = Math.max(40, SVG_W - 34);
  return Math.max(CFG.spacing.barMin, Math.min(CFG.spacing.barMax, inner / n - CFG.spacing.barGap));
}
function labelStep(n) { return n > 14 ? Math.ceil(n / 12) : 1; }



function pathTop(x, y, w, h) {
  var r = Math.min(2.5, w / 2, h / 2);
  return 'M' + r1(x) + ' ' + r1(y + h) +
    'L' + r1(x) + ' ' + r1(y + r) + 'Q' + r1(x) + ' ' + r1(y) + ' ' + r1(x + r) + ' ' + r1(y) +
    'L' + r1(x + w - r) + ' ' + r1(y) + 'Q' + r1(x + w) + ' ' + r1(y) + ' ' + r1(x + w) + ' ' + r1(y + r) +
    'L' + r1(x + w) + ' ' + r1(y + h) + 'Z';
}

function stackAct(p) {
  var off = state.legendOff, s = 0;
  if (!off.new) s += p.new_u;
  if (!off.react) s += p.react_u;
  if (!off.ret) s += p.ret;
  return s;
}

function usersChartSvg(ts, grain) {
  var C = CFG.colors, n = ts.length;
  var maxU = 0, i;
  for (i = 0; i < n; i++) if (stackAct(ts[i]) > maxU) maxU = stackAct(ts[i]);
  var topU = svgHeadroom(maxU, n);
  var padL = 6, padR = 26, inner = SVG_W - padL - padR;
  var step = inner / n;
  var bw = svgBarWidth(n);
  var top = 14, axH = 32;
  var pH = DYN_H ? Math.max(120, Math.round(DYN_H * 0.6) - top - axH) : 164;
  var H = top + pH + axH;
  var dense = n > CFG.spacing.dense;
  var fsVal = dense ? CFG.fonts.dense : CFG.fonts.val;
  var body = '', bk = [];
  for (i = 0; i < n; i++) {
    var p = ts[i];
    var x = padL + i * step + (step - bw) / 2;
    var aU = stackAct(p);
    var yTop = top + pH - (aU / topU) * pH;
    // Стек снизу вверх: новые → вернувшиеся → продолжающие.
    var segs = [
      { h: state.legendOff.new ? 0 : (p.new_u / topU) * pH, c: C.new },
      { h: state.legendOff.react ? 0 : (p.react_u / topU) * pH, c: C.react },
      { h: state.legendOff.ret ? 0 : (p.ret / topU) * pH, c: C.ret }
    ];
    var topmost = -1;
    for (var si = 0; si < segs.length; si++) if (segs[si].h > 0.5) topmost = si;
    var yy = top + pH;
    body += '<g class="bar" data-d="' + Math.round(i * 12) + '\">';   // колонка растёт от оси (анимация)
    for (var sj = 0; sj < segs.length; sj++) {
      if (segs[sj].h <= 0.5) continue;    // пустых ступеней не рисуем вовсе
      var sy = yy - segs[sj].h;
      body += sj === topmost
        ? '<path d="' + pathTop(x, sy, bw, segs[sj].h) + '" fill="' + segs[sj].c + '"/>'
        : '<rect x="' + r1(x) + '" y="' + r1(sy) + '" width="' + r1(bw) + '" height="' + r1(segs[sj].h) + '" fill="' + segs[sj].c + '"/>';
      yy = sy;
    }
    body += '</g>';
    // Подпись значения — у КАЖДОГО столбика (макет: valueLabel без пропусков).
    body += '<text class="fade" x="' + r1(x + bw / 2) + '" y="' + r1(yTop - 7) + '" font-size="' + fsVal + '" text-anchor="middle" fill="' + C.label +
      '" style="paint-order:stroke;stroke:#fff;stroke-width:3px">' + esc(compact(aU)) + '</text>';
    bk.push({ k: p.k, u: p.users, nu: p.new_u, re: p.react_u, rt: p.ret, v: p.views });
  }
  body += calAxisSvg(ts, grain, function (j) { return padL + j * step + step / 2; }, top + pH);
  body += '<rect x="' + padL + '" y="' + top + '" width="' + r1(inner) + '" height="' + r1(pH) + '" fill="transparent" data-dyn="users" data-n="' + n +
    '" data-colw="' + r1(step) + '" data-grain="' + esc(grain) + '"' +
    '" data-bk="' + esc(JSON.stringify(bk)) + '"/>';
  return '<svg viewBox="0 0 ' + SVG_W + ' ' + r1(H) + '" width="100%" data-dyn-svg="1" style="height:auto;display:block" font-family="' + CFG.fonts.family +
    '" role="img" aria-label="Пользователи по периодам">' + body + '</svg>';
}

// Ряды динамики ЦА: бакет k (0 — текущий): заходили из ЦА = пришли впервые (первый визит
// в историю — в этом бакете) + не впервые; охват — накоплено (заходили в окне к этой дате) и за период.
function caSeries() {
  var n = MODEL.n, ps = MODEL.people, t = caTotals(), out = [], k, i;
  for (k = n - 1; k >= 0; k--) {
    var act = 0, first = 0, cum = 0, pw = Math.pow(2, k);
    for (i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (!p.ca || !p.cur) continue;
      if (bitAt(p.cur, k)) { act++; if (p.fk === k) first++; }
      if (p.cur >= pw) cum++;            // был активен в бакете возраста ≥ k (раньше или в эту дату)
    }
    out.push({ k: k, users: act, new_u: first, react_u: 0, ret: act - first, views: 0, cum: cum,
      covCum: t.ca ? cum / t.ca * 100 : 0, covAct: t.ca ? act / t.ca * 100 : 0 });
  }
  return out;
}
// Охват ЦА линиями: сплошная — накоплено к дате, пунктир — заходили в этом периоде.
function covChartSvg(ts, grain) {
  var C = CFG.colors, n = ts.length, i;
  var maxV = 0;
  for (i = 0; i < n; i++) if (ts[i].covCum > maxV) maxV = ts[i].covCum;
  var topV = Math.max(5, maxV * 1.2);
  var padL = 6, padR = 26, inner = SVG_W - padL - padR, step = inner / n;
  var top = 14, axH = 32;
  var pH = DYN_H ? Math.max(80, Math.round(DYN_H * 0.4) - top - axH) : 112;
  var H = top + pH + axH;
  var fsVal = n > CFG.spacing.dense ? CFG.fonts.dense : CFG.fonts.val;
  var y2 = function (v) { return top + pH - (v / topV) * pH; };
  var line = function (key) {
    var s = '';
    for (var j = 0; j < n; j++) s += (j ? 'L' : 'M') + r1(padL + j * step + step / 2) + ' ' + r1(y2(ts[j][key]));
    return s;
  };
  var sC = line('covCum'), sA = line('covAct');
  var cid = revealClip(H);
  var body = cid.defs + '<path clip-path="url(#' + cid.id + ')" d="' + sC + 'L' + r1(padL + (n - 1) * step + step / 2) + ' ' + (top + pH) + 'L' + r1(padL + step / 2) + ' ' + (top + pH) + 'Z" fill="rgba(36,95,212,.07)" stroke="none"/>' +
    '<path class="ln" pathLength="1" stroke-dasharray="1" d="' + sC + '" fill="none" stroke="' + C.cov + '" stroke-width="2"/>' +
    '<path d="' + sA + '" fill="none" stroke="' + C.covP + '" stroke-width="1.6" stroke-dasharray="4 3" clip-path="url(#' + cid.id + ')"/>';
  var stepL = labelStep(n), bk = [];
  for (i = 0; i < n; i++) {
    var cx = padL + i * step + step / 2, cy = y2(ts[i].covCum);
    body += '<circle class="fade" data-d="' + Math.round(150 + 600 * i / Math.max(1, n - 1)) + '" cx="' + r1(cx) + '" cy="' + r1(cy) + '" r="2.6" fill="' + C.cov + '" stroke="#fff" stroke-width="1.6"/>';
    if (i % stepL === 0 || i === n - 1) {
      body += '<text class="fade" x="' + r1(cx) + '" y="' + r1(cy - 8) + '" font-size="' + fsVal + '" text-anchor="middle" fill="' + C.label +
        '" style="paint-order:stroke;stroke:#fff;stroke-width:3px">' + esc(pct(ts[i].covCum, 0)) + '</text>';
    }
    bk.push({ k: ts[i].k, u: ts[i].users, c: ts[i].cum, pc: ts[i].covCum, pa: ts[i].covAct });
  }
  body += calAxisSvg(ts, grain, function (j) { return padL + j * step + step / 2; }, top + pH);
  body += '<rect x="' + padL + '" y="' + top + '" width="' + r1(inner) + '" height="' + r1(pH) + '" fill="transparent" data-dyn="cov" data-n="' + n +
    '" data-colw="' + r1(step) + '" data-grain="' + esc(grain) + '" data-bk="' + esc(JSON.stringify(bk)) + '"/>';
  return '<svg viewBox="0 0 ' + SVG_W + ' ' + r1(H) + '" width="100%" data-dyn-svg="1" style="height:auto;display:block" font-family="' + CFG.fonts.family +
    '" role="img" aria-label="Охват целевой аудитории по периодам">' + body + '</svg>';
}
function dynamicsHtml(ts, grain) {
  var t = caTotals();
  if (!ts.length || !t.ca) return '<div class="' + CFG.ns + '-tbl-note">В целевой аудитории никого нет — настройте её на вкладке «Путь ЦА».</div>';
  var C = CFG.colors, off = state.legendOff, N = CFG.ns;
  var leg = [
    { k: 'new', l: 'Пришли впервые', c: C.new, d: 'Люди ЦА, чей первый визит в отчёты области (за всю историю, около года) пришёлся на этот период.' },
    { k: 'ret', l: 'Заходили не впервые', c: C.ret, d: 'Люди ЦА, заходившие в этот период и раньше.' }
  ];
  var h = '<div class="' + N + '-dynhead"><span class="' + N + '-cap">Заходили из целевой аудитории</span><div class="' + N + '-legend" role="group" aria-label="Ступени стека">';
  for (var i = 0; i < leg.length; i++) {
    h += '<button class="' + N + '-leg' + (off[leg[i].k] ? ' off' : '') + '" data-leg="' + leg[i].k + '" type="button"' +
      tip({ title: leg[i].l, text: leg[i].d, note: off[leg[i].k] ? 'Клик — вернуть ступень на график' : 'Клик — убрать ступень с графика' }) + '>' +
      '<i style="background:' + leg[i].c + '"></i>' + esc(leg[i].l) + '</button>';
  }
  h += '</div></div>';
  h += usersChartSvg(ts, grain);
  h += '<div class="' + N + '-dynhead"><span class="' + N + '-cap">Охват ЦА, % от ' + nf(t.ca) + '</span>' +
    '<span class="' + N + '-note2">сплошная — накоплено за период к дате · пунктир — заходили в этом ' + (CFG.grains[grain] ? CFG.grains[grain].unit : 'периоде') + '</span></div>';
  h += wide()
    ? '<div class="' + N + '-warn">Доступ открыт почти всей компании — охват по такому знаменателю не показываем. Сузьте ЦА на вкладке «Путь ЦА».</div>'
    : covChartSvg(ts, grain);
  return h;
}
function dynTipHtml(el, i) {
  var bk = el.__bk ? el.__bk[i] : null;
  if (!bk) return '';
  var C = CFG.colors, grain = el.getAttribute('data-grain') || MODEL.grain;
  var bt = bucketTitle(tsDate(bk.k, grain), grain);
  if (el.getAttribute('data-dyn') === 'cov') {
    return tipHtml({ title: bt, rows: [
      { label: 'Накоплено к дате', value: pct(bk.pc) + ' · ' + nf(bk.c), color: C.cov },
      { label: 'Заходили в этот период', value: pct(bk.pa) + ' · ' + nf(bk.u), color: C.covP, dash: true }] });
  }
  var rows = [{ label: 'Заходили из ЦА', value: nf(bk.u) }];
  if (!state.legendOff.new) rows.push({ label: 'Пришли впервые', value: nf(bk.nu), color: C.new });
  if (!state.legendOff.ret) rows.push({ label: 'Не впервые', value: nf(bk.rt), color: C.ret });
  return tipHtml({ title: bt, rows: rows });
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

    var overlay = document.createElement('div');
    overlay.className = CFG.ns + '-overlay';
    overlay.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;'
      + 'z-index:10;overflow:auto;box-sizing:border-box;background:' + CFG.colors.bg + ';';
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
      // Содержимое тултипа уже собрано в data-tip (контракт tipHtml): якорная
      // логика здесь только показывает его у цели.
      showTip(state.tip.html || '', state.tip.rect);
    }

    // render ТОЛЬКО пересобирает разметку. Делегированные обработчики
    // навешиваются ОДИН РАЗ СНАРУЖИ render(): overlay не пересоздаётся.
    // Любой addEventListener внутри render() ЗАПРЕЩЁН — он создаёт дубли.
    // Ширина SVG меряется ПОСЛЕ монтажа (width:100%) и уходит в SVG_W:
    // пересборка с новой шириной даёт масштаб 1:1 — подписи не растягиваются
    // вместе с ячейкой (правка владельца 2026-09-18). Прогон максимум двойной.
    // Высота вкладки «Динамика»: всё, что осталось в теле панели после
    // заголовков графиков и зазоров, делится между двумя SVG.
    function syncDynH() {
      var body = overlay.querySelector('.' + CFG.ns + '-panel-b.dyn-wrap');
      if (!body) return false;
      var cs = getComputedStyle(body);
      var avail = body.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      var heads = body.querySelectorAll('.' + CFG.ns + '-dynhead');
      for (var i = 0; i < heads.length; i++) avail -= heads[i].offsetHeight;
      avail -= CFG.spacing.stackGap * 3;
      avail = Math.max(360, Math.floor(avail));
      if (Math.abs(avail - DYN_H) <= 4) return false;
      DYN_H = avail;
      return true;
    }
    // Кривая удержания тянется на высоту тела вкладки (минус заголовок «Когорты…»).
    function syncCohH() {
      var body = overlay.querySelector('.' + CFG.ns + '-panel-b.coh-wrap');
      if (!body || !body.querySelector('svg[data-coh-curve]')) return false;
      var cs = getComputedStyle(body);
      var avail = body.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      var heads = body.querySelectorAll('.' + CFG.ns + '-dynhead');
      for (var i = 0; i < heads.length; i++) avail -= heads[i].offsetHeight;
      avail = Math.max(240, Math.floor(avail - 8));
      if (Math.abs(avail - COH_H) <= 4) return false;
      COH_H = avail;
      return true;
    }
    function syncSvgWidth() {
      var svgs = overlay.querySelectorAll('svg[data-dyn-svg]');
      if (!svgs.length) return false;
      var w = svgs[0].clientWidth || 0;
      if (!w || Math.abs(w - SVG_W) <= 2) return false;
      SVG_W = w;
      return true;
    }
    function render() {
      // overlay — скролл-контейнер: без сохранения позиции клик внизу прыгал наверх.
      var st = overlay.scrollTop, sl = overlay.scrollLeft, ls = {}, lb = overlay.querySelectorAll('[data-calist]'), li;
      // Прокрутка списков выпадашек ЦА переживает пересборку (галочка внизу длинного списка).
      for (li = 0; li < lb.length; li++) ls[lb[li].getAttribute('data-calist')] = lb[li].scrollTop;
      ANIM = MODEL.sig !== state.animSig;     // новые данные → анимация только в этом рендере
      state.animSig = MODEL.sig;
      overlay.innerHTML = buildHTML();
      var ch1 = syncSvgWidth(), ch2 = syncDynH(), ch3 = syncCohH();
      if (ch1 || ch2 || ch3) overlay.innerHTML = buildHTML();
      if (ANIM) animateIn(overlay);
      ANIM = false;
      overlay.scrollTop = st;
      overlay.scrollLeft = sl;
      lb = overlay.querySelectorAll('[data-calist]');
      for (li = 0; li < lb.length; li++) if (ls[lb[li].getAttribute('data-calist')]) lb[li].scrollTop = ls[lb[li].getAttribute('data-calist')];
      renderTip();
    }
    // Легенда когорт — орган управления: наведение на ступень гасит все
    // ячейки, кроме попавших в неё. Точечная правка классов, БЕЗ render().
    function bandHighlight(el) {
      var wrap = overlay.querySelector('.' + CFG.ns + '-ct-wrap');
      if (!wrap) return;
      var cells = wrap.querySelectorAll('[data-band]');
      var band = el.getAttribute('data-ctband');
      for (var i = 0; i < cells.length; i++) {
        if (cells[i].getAttribute('data-band') === band) cells[i].classList.add('band-hit');
      }
      wrap.classList.add('band-on');
    }
    function bandClear() {
      var wrap = overlay.querySelector('.' + CFG.ns + '-ct-wrap');
      if (!wrap) return;
      wrap.classList.remove('band-on');
      var hits = wrap.querySelectorAll('.band-hit');
      for (var i = 0; i < hits.length; i++) hits[i].classList.remove('band-hit');
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

    function onOver(e) {
      var stb = trigger(e.target, 'data-ctband');
      if (stb) bandHighlight(stb);
      var el = trigger(e.target, 'data-tip');
      if (!el) return;
      // Кнопка с раскрытым меню подсказку не показывает: меню и так перед глазами,
      // а всплывашка его закрывала (Chrome шлёт наведение после перерисовки).
      if (el.getAttribute('aria-expanded') === 'true') return;
      // Якорь — rect ЦЕЛИ как есть; содержимое — готовый HTML из data-tip.
      // Якорь — точка курсора: тултип идёт за мышью (onTipMove), как на диаграмме.
      state.tip = {
        rect: curPt(e),
        kind: el.getAttribute('data-kind') || '',
        key: el.getAttribute('data-tip') || '',
        html: el.getAttribute('data-tip') || ''
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
      var stb = trigger(e.target, 'data-ctband');
      if (stb) bandClear();
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

    // ── Следящий тултип динамики (порт из тела, строки 2006–2051) ──
    // Хитзона ОДНА на всю панель: колонка вычисляется из позиции курсора,
    // стыки баров не мигают. Содержимое — только при смене колонки,
    // позиция — на каждом mousemove.
    function placeTip(x, y) {
      var t = getTip();
      t.style.display = 'block';
      t.style.left = '0px';
      t.style.top = '0px';
      var box = t.getBoundingClientRect();
      var pad = 6;
      var left = x + 14, top = y + 18;
      if (left + box.width > window.innerWidth - pad) left = x - box.width - 14;
      if (top + box.height > window.innerHeight - pad) top = y - box.height - 14;
      left = Math.max(pad, Math.min(left, window.innerWidth - box.width - pad));
      top = Math.max(pad, Math.min(top, window.innerHeight - box.height - pad));
      t.style.left = Math.round(left) + 'px';
      t.style.top = Math.round(top) + 'px';
      t.style.opacity = '1';
    }
    function onMove(e) {
      var el = trigger(e.target, 'data-dyn');
      if (!el) {
        if (state.dynEl) { state.dynEl = null; state.dynI = -1; hideTip(); }
        return;
      }
      if (!el.__bk) {
        try { el.__bk = JSON.parse(el.getAttribute('data-bk') || '[]'); }
        catch (err) { el.__bk = []; }
      }
      var rect = el.getBoundingClientRect();
      var step = num(el.getAttribute('data-colw')) || 1;
      var n = parseInt(el.getAttribute('data-n'), 10) || 0;
      if (!n) return;
      var i = Math.floor((e.clientX - rect.left) / step);
      if (i < 0) i = 0;
      if (i > n - 1) i = n - 1;
      if (state.dynEl !== el || state.dynI !== i) {
        state.dynEl = el;
        state.dynI = i;
        var dt = getTip(); dt.innerHTML = dynTipHtml(el, i); dt.__h = null;
      }
      placeTip(e.clientX, e.clientY);
    }

    // ── Людская шина → тело 788805 ──
    // Кто эмитит маску ЦЕЛИКОМ: активные условия разрезов + корзина частоты.
    // Сброс — applyCrossFilter([]), паттерн полки (прецедент 783469); пустой
    // список здесь НЕ роняет запрос — джини датасетов читают маску через
    // filter_values()|default, а инцидент 783708 был про mode_param тела.
    function maskOf() {
      var fl = [], pk = state.picks;
      // Узлы оргструктуры УС-3…УС-7 — путями «А › Б › …» (org_f): одноимённые
      // отделы разных департаментов не склеиваются.
      if (pk.org.length) fl.push({ column: 'org_f', operator: 'IN', value: pk.org.slice() });
      if (pk.spec.length) fl.push({ column: 'spec_f', operator: 'IN', value: pk.spec.slice() });
      if (pk.stream.length) fl.push({ column: 'stream_f', operator: 'IN', value: pk.stream.slice() });
      // heads_f: '1' — только руководители (настройка или группа «Тим-лиды»),
      // 'n' — только группа «Остальные»; обе группы сразу = без условия.
      var hv = pk.heads.length === 1 ? (pk.heads[0] === 'Тим-лиды' ? '1' : 'n') : '';
      if (hv) fl.push({ column: 'heads_f', operator: 'IN', value: [hv] });
      if (pk.login.length) fl.push({ column: 'login_f', operator: 'IN', value: pk.login.slice() });
      // Исключённые логины настроек списка — выпадают и из каталога, и из шапки.
      return fl;
    }
    function emitBus() {
      if (typeof applyCrossFilter !== 'function') return;
      applyCrossFilter(maskOf());
    }

    // Семантика выбора — как в каталоге тела: клик переключает, Shift
    // накапливает, повторный по единственной выбранной снимает.
    function togglePick(cut, val, additive) {
      var list = state.picks[cut] || [];
      var idx = list.indexOf(String(val));
      if (additive) {
        if (idx >= 0) list.splice(idx, 1);
        else list.push(String(val));
      } else {
        if (idx >= 0 && list.length === 1) list = [];
        else list = [String(val)];
      }
      state.picks[cut] = list;
    }

    function onClick(e) {
      // Клик мимо открытого дропдауна закрывает его (паттерн полки):
      // всё внутри .dd считается «внутри».
      var ddNode = trigger(e.target, 'data-ddtoggle');
      var ddHost = e.target;
      while (ddHost && ddHost !== overlay) {
        if (ddHost.className && String(ddHost.className).indexOf(CFG.ns + '-dd') >= 0) break;
        ddHost = ddHost.parentNode;
      }
      if (state.dd != null && (!ddHost || ddHost === overlay) && !ddNode) {
        state.dd = null;
        render();
        return;
      }

      // Дропдауны: раскрытие/закрытие.
      if (ddNode) {
        // Подсказка кнопки не должна висеть поверх раскрытого меню.
        state.tip = null;
        hideTip();
        var dId = ddNode.getAttribute('data-ddtoggle');
        state.dd = state.dd === dId ? null : dId;
        render();
        return;
      }
      // Выбор опции дропдауна (группировка списка).
      var opt = trigger(e.target, 'data-ddopt');
      if (opt) {
        state.whoCut = opt.getAttribute('data-val') || 'none';
        state.dd = null;
        state.page = 0;
        render();
        return;
      }
      // Строка «Выбранные фильтры»: × снимает условие, «Снять все» — всю людскую шину.
      var up = trigger(e.target, 'data-unpick');
      if (up) {
        var uid = up.getAttribute('data-unpick');
        var ukey = uid === '*' ? '*' : uid.split('|')[0], uval = uid === '*' ? '' : uid.slice(ukey.length + 1);
        if (ukey === '*') {
          for (var pk0 in state.picks) if (Object.prototype.hasOwnProperty.call(state.picks, pk0)) state.picks[pk0] = [];
          state.segSel = null;
        } else if (ukey === 'seg') state.segSel = null;
        else if (uval === '') state.picks[ukey] = [];
        else {
          var ul = state.picks[ukey] || [], ui = ul.indexOf(uval);
          if (ui >= 0) ul.splice(ui, 1);
        }
        state.page = 0;
        state.tip = null;
        hideTip();
        render();
        emitBus();
        return;
      }
      // Каретка группы: раскрыть/свернуть (узел оргструктуры — на уровень вглубь).
      var gt = trigger(e.target, 'data-gtog');
      if (gt) {
        var gid = gt.getAttribute('data-gtog');
        if (state.gOpen[gid]) delete state.gOpen[gid];
        else state.gOpen[gid] = true;
        render();
        return;
      }
      // «Раскрыть уровень» — все видимые группы на уровень вглубь; «Свернуть все».
      var fold = trigger(e.target, 'data-wofold');
      if (fold) {
        if (fold.getAttribute('data-wofold') === 'level') {
          for (var vi = 0; vi < VISIBLE_NODES.length; vi++) {
            if (VISIBLE_NODES[vi].hasKids && !VISIBLE_NODES[vi].open) state.gOpen[VISIBLE_NODES[vi].nd.id] = true;
          }
        } else {
          var pre = state.whoCut + ':';
          for (var ok in state.gOpen) if (Object.prototype.hasOwnProperty.call(state.gOpen, ok) && ok.indexOf(pre) === 0) delete state.gOpen[ok];
        }
        state.tip = null; hideTip();   // подсказка каретки сменилась (▸ ↔ ▾)
        render();
        return;
      }
      // Люди внутри группы: «ещё N» / «свернуть».
      var more = trigger(e.target, 'data-gmore');
      if (more) {
        var mid = more.getAttribute('data-gmore');
        if (state.gMore[mid]) delete state.gMore[mid];
        else state.gMore[mid] = true;
        render();
        return;
      }
      // Сортировка: группы (data-gsort) и поимённый список (data-psort).
      var gs = trigger(e.target, 'data-gsort') || trigger(e.target, 'data-psort');
      if (gs) {
        var isG = gs.hasAttribute('data-gsort');
        var sk = gs.getAttribute(isG ? 'data-gsort' : 'data-psort');
        var sc = isG ? state.gSort : state.pSort;
        var txtKey = sk === 'name' || sk === 'fio' || sk === 'org' || sk === 'exp';
        if (sc.key === sk) sc.dir *= -1;
        else { sc.key = sk; sc.dir = txtKey ? 1 : -1; }
        state.page = 0;              // пересорт — на первую страницу
        render();
        return;
      }
      // Пагинация поимённого списка.
      var pg = trigger(e.target, 'data-pg');
      if (pg) {
        state.page += pg.getAttribute('data-pg') === 'next' ? 1 : -1;
        render();
        return;
      }
      // Выгрузка: копирование в буфер (TSV) / файл CSV — из модели, все строки.
      var wf = trigger(e.target, 'data-wfull');
      if (wf) { state.whoFull = !state.whoFull; state.tip = null; hideTip(); render(); return; }
      var wx = trigger(e.target, 'data-wexp');
      if (wx) {
        var kind = wx.getAttribute('data-wexp'), tb = exportRows(), nR = tb.rows.length;
        var say = function (msg) {
          state.toast = msg;
          var el = overlay.querySelector('.' + CFG.ns + '-toast');
          if (el) el.textContent = msg;
          setTimeout(function () {
            if (state.toast !== msg) return;
            state.toast = '';
            var el2 = overlay.querySelector('.' + CFG.ns + '-toast');
            if (el2) el2.textContent = '';
          }, 4000);
        };
        if (kind === 'copy') {
          copyText(toDelim(tb, '\t'), function (ok) {
            say(ok ? 'Скопировано: ' + nf(nR) + ' ' + plural(nR, 'строка', 'строки', 'строк') : 'Браузер запретил доступ к буферу — попробуйте CSV');
          });
        } else {
          var dt = new Date(), stamp = dt.getFullYear() + '-' + p2(dt.getMonth() + 1) + '-' + p2(dt.getDate());
          var okD = downloadCsv(toDelim(tb, ';'), 'kto-iz-ca-' + (state.whoCut === 'none' ? 'lyudi' : state.whoCut) + '-' + stamp + '.csv');
          say(okD ? 'CSV: ' + nf(nR) + ' ' + plural(nR, 'строка', 'строки', 'строк') + ' (не скачался — «Копировать»)' : 'Скачивание запрещено — используйте «Копировать»');
        }
        return;
      }
      // Корзина частоты: локальный фильтр списка + шина freq_f.
      // «Что видно в данных»: раскрыть / свернуть список фактов.
      var ob = trigger(e.target, 'data-obs');
      if (ob) {
        state.obsOpen = !state.obsOpen;   // раскрыть список фактов вниз / свернуть
        render();
        return;
      }
      var fb = trigger(e.target, 'data-seg');
      if (fb) {
        var bk = fb.getAttribute('data-seg');
        state.segSel = state.segSel === bk ? null : bk;
        state.page = 0;
        render();
        emitBus();
        return;
      }
      // Легенда стека: клик гасит/возвращает ступень (минимум одна включена).
      var legBtn = trigger(e.target, 'data-leg');
      if (legBtn) {
        var lk = legBtn.getAttribute('data-leg');
        if (state.legendOff.hasOwnProperty(lk)) {
          var onCount = 0;
          for (var lo in state.legendOff) if (Object.prototype.hasOwnProperty.call(state.legendOff, lo) && !state.legendOff[lo]) onCount++;
          if (onCount > 1 || state.legendOff[lk]) state.legendOff[lk] = !state.legendOff[lk];
        }
        render();
        return;
      }
      // Цвет когорт: медиана столбца / таблицы.
      var ctb = trigger(e.target, 'data-ctbase');
      if (ctb) {
        state.ctBase = ctb.getAttribute('data-ctbase');
        render();
        return;
      }
      // «Что видно в данных»: тело (-obs-b) — СЕСТРИНСКИЙ узел заголовка с
      // data-action, ищем от родителя (querySelector от самого act давал null).
      var act = trigger(e.target, 'data-action');
      if (act && act.getAttribute('data-action') === 'obs') {
        var box = act.parentNode ? act.parentNode.querySelector('.' + CFG.ns + '-obs-b') : null;
        if (box) {
          var open = box.style.display !== 'none';
          box.style.display = open ? 'none' : 'block';
          act.setAttribute('aria-expanded', open ? 'false' : 'true');
        }
        return;
      }
      // Вкладки панели и переключалки: data-view="view:who" | "cohView:curve" |
      // "viewsMode:per" — префикс = ключ состояния.
      var tab = trigger(e.target, 'data-view');
      if (tab) {
        var parts = String(tab.getAttribute('data-view')).split(':');
        if (parts.length === 2 && state.hasOwnProperty(parts[0])) {
          state[parts[0]] = parts[1];
          render();
        }
        return;
      }
      // Настройки: только руководители / исключения / снять всё.
      var headCb = trigger(e.target, 'data-wohead');
      if (headCb) {
        state.headsOnly = !!headCb.checked;
        state.page = 0;
        render();
        emitBus();
        return;
      }
      var exCb = trigger(e.target, 'data-woex');
      if (exCb) {
        var exl = exCb.getAttribute('data-woex');
        var xi = state.excl.indexOf(exl);
        if (exCb.checked && xi < 0) state.excl.push(exl);
        if (!exCb.checked && xi >= 0) state.excl.splice(xi, 1);
        render();
        emitBus();
        return;
      }
      var exClear = trigger(e.target, 'data-woexclear');
      if (exClear) {
        state.excl = [];
        render();
        emitBus();
        return;
      }
      // Строка группы или человека: людская шина (разрез = data-whocut).
      var row = trigger(e.target, 'data-whocut');
      if (row) {
        togglePick(row.getAttribute('data-whocut'), row.getAttribute('data-who'), e.shiftKey);
        render();
        emitBus();
        return;
      }
    }

    // Поиск: ТОЧЕЧНАЯ пересборка, поле ввода не трогаем — иначе теряются
    // фокус и каретка (RETRO 68). whoQ — зона списка; woExQ — чекбоксы
    // внутри поповера настроек.
    function onInput(e) {
      var inp = trigger(e.target, 'data-search');
      if (!inp) return;
      var id = inp.getAttribute('data-search');
      if (id === 'whoQ') {
        state.q = inp.value || '';
        state.page = 0;
        var tz = overlay.querySelector('.' + CFG.ns + '-who-tbl');
        if (tz) tz.innerHTML = whoTableHtml();
        var cz = overlay.querySelector('.' + CFG.ns + '-who-cnt');
        if (cz) cz.innerHTML = whoCountHtml();
      } else if (id === 'woExQ') {
        state.exQ = inp.value || '';
        var box = overlay.querySelector('.' + CFG.ns + '-wo-ex');
        if (box) box.innerHTML = '';
      }
    }

    overlay.addEventListener('mouseover', onOver);
    overlay.addEventListener('mouseout', onOut);
    overlay.addEventListener('mousemove', onTipMove);
    overlay.addEventListener('mousemove', onMove);
    overlay.addEventListener('click', onClick);
    overlay.addEventListener('input', onInput);

    // Escape: закрыть открытый дропдаун. Глобальный слушатель живёт в state
    // и снимается явно — переживает перезапуск скрипта (шаблон, БЛОК 6).
    if (state.onEsc) window.removeEventListener('keydown', state.onEsc);
    state.onEsc = function (ev) {
      if ((ev.key || '') !== 'Escape') return;
      if (state.dd != null) { state.dd = null; render(); }
    };
    window.addEventListener('keydown', state.onEsc);

    // Глобальные слушатели переживают перезапуск скрипта и накапливаются.
    // Старый снимаем ЯВНО, ссылку держим в state. Escape вешай здесь же,
    // тем же способом, и никогда не внутри render().
    if (state.onWinResize) window.removeEventListener('resize', state.onWinResize);
    state.onWinResize = function () { var w = syncSvgWidth(), hh = syncDynH(), ch = syncCohH(); if (w || hh || ch) render(); if (state.tip) renderTip(); };
    window.addEventListener('resize', state.onWinResize);

    render();

    // ResizeObserver только правит габариты. НЕ вызывать render() — зациклит.
    // Старый observer отключаем: иначе он держит удалённый overlay.
    if (typeof ResizeObserver !== 'undefined') {
      if (state.ro && state.ro.disconnect) state.ro.disconnect();
      var ro = new ResizeObserver(function() {
        overlay.style.width = '100%'; overlay.style.height = '100%';
        // Ячейку борда растянули/сжали: пересборка ОТЛОЖЕНА и только при
        // реальной смене размеров графиков — без цикла render ↔ observer.
        if (state.roT) clearTimeout(state.roT);
        state.roT = setTimeout(function () {
          var w = syncSvgWidth(), hh = syncDynH(), ch = syncCohH();
          if (w || hh) render();
        }, 150);
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
