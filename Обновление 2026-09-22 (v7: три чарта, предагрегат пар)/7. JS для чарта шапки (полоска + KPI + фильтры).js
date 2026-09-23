// ============================================================================
// pa-strip.chart.js — шапка листа «Отчёты», v7.1 (2026-09-23)
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
// ЧТО ЭТО. Верхний чарт листа во всю ширину (макет 2.5): строка управления
//   (период · опции · сброс), пять KPI ВСЕГО экрана, «Что видно в данных» и
//   строка общих фильтров — пилюли всех активных условий листа.
// ДАННЫЕ. Датасет pa_kpi — ОДНА строка итогов по области каталога ∩ людской
//   шине панели «Кто смотрит» под периодом и свитками (+ эхо условий в state_j).
// ШИНЫ. Пишет period_param / pub_f / act_f / exc_f → каталог, панель и СЕБЯ
//   (самовлияние ВКЛЮЧЕНО: KPI зависят от периода). Слушает область каталога
//   (mode_param + sel_f) и людскую шину панели. Чужие условия шапка только
//   показывает: снимаются они там, где заданы (кликом по выделенной строке).
// «ЧТО ВИДНО В ДАННЫХ» — лента фиксированной высоты: факты листаются ‹ ›,
//   подробности — в подсказке. Раскрываться вниз шапка не может: чарты Proteus
//   не раздвигают соседей.
// ============================================================================

// ---------- БЛОК 1: CFG ----------
// fields - ТОЛЬКО реальные имена колонок из SQL пользователя.
// Нет поля в SQL - СПРОСИ, не выдумывай и не хардкодь значения.
// Все цвета/шрифты/отступы из макета — только здесь, не в разметке.
var CFG = {
  ns: 'past',
  // 17 колонок датасета pa_kpi (Виджеты/pa-strip.data.sql), одна строка.
  fields: {
    grain: 'grain', users: 'users', users_prev: 'users_prev', views: 'views', views_prev: 'views_prev',
    new_u: 'new_u', new_prev: 'new_prev', regular: 'regular', regular_prev: 'regular_prev',
    sleeping: 'sleeping', mau: 'mau', mau_prev: 'mau_prev',
    area_nm: 'area_nm', ppl_nm: 'ppl_nm', state_j: 'state_j'
  },
  text: { noData: 'Нет данных' },
  mode: 'snapshot',
  grains: [
    { id: 'd', label: '30 дней', n: 30, units: 'дней', vs: 'к пред. 30 дням', prev: true },
    { id: 'w', label: '20 недель', n: 20, units: 'недель', vs: 'к пред. 20 неделям', prev: true },
    { id: 'm', label: '12 месяцев', n: 12, units: 'месяцев', vs: 'к пред. 12 месяцам', prev: false },
    { id: 'q', label: '8 кварталов', n: 8, units: 'кварталов', vs: 'к пред. 8 кварталам', prev: false }
  ],
  // Свиток эмитит СВОЮ колонку ТОЛЬКО при отличии от дефолта (val при откл.).
  switches: [
    { key: 'published', label: 'Только опубликованные', def: true, emit: 'pub_f', val: '0', off: 'включая неопубликованные', hint: '' },
    { key: 'actual', label: 'Только актуальные', def: true, emit: 'act_f', val: '0', off: 'включая неактуальные', hint: '' },
    { key: 'excludeOwners', label: 'Исключить владельцев из просмотров', def: true, emit: 'exc_f', val: '0', off: 'с просмотрами владельцев',
      hint: 'Владелец открывает свой отчёт при каждой правке — его визиты завышают аудиторию.' }
  ],
  // Подписи условий в пилюлях.
  areaLabels: {
    report: ['Отчёт', 'Отчёты'], owner: ['Владелец', 'Владельцы'], collection: ['Коллекция', 'Коллекции'],
    'cut:lvl3': ['УС-3', 'УС-3'], 'cut:lvl4': ['Департамент', 'Департаменты'],
    'cut:spec': ['Специализация', 'Специализации'], 'cut:stream': ['Стрим', 'Стримы'], 'cut:head': ['Руководители', 'Руководители']
  },
  pplLabels: [
    { key: 'lvl3', one: 'УС-3', many: 'УС-3' }, { key: 'lvl4', one: 'Департамент', many: 'Департаменты' },
    { key: 'spec', one: 'Специализация', many: 'Специализации' }, { key: 'stream', one: 'Стрим', many: 'Стримы' },
    { key: 'adg', one: 'AD-группа', many: 'AD-группы' }
  ],
  colors: {
    bg: '#f6f6f6', card: '#fff', act: '#0073A0', actInk: '#015A7D', blueBg: '#E8F4F9', actLine: '#C4E2ED',
    ppl: '#5a2fc2', pplBg: '#f3ecff', pplLine: '#e2d4ff',
    ink: '#23272e', ink2: '#454b55', mut: '#8a909c', mut2: '#aab0bb', line: '#e7e9ee', line2: '#eef0f3',
    bgAlt: '#eef0f3', ret: '#5CC0EE', bench: '#c7c8cc',
    green: '#12b048', greenBg: '#d9f5e2', greenTx: '#0a8f3c', redBg: '#ffe0e0', redTx: '#c8251f'
  },
  fonts: {
    family: 'Inter,-apple-system,"Segoe UI",Roboto,Arial,sans-serif'
  },
  spacing: { s2: 4, s4: 8, s5: 10, s6: 12 }
};

// ---------- БЛОК 2: ВХОД + СОСТОЯНИЕ + ХЕЛПЕРЫ ----------
var rawData = (typeof data !== 'undefined' && Array.isArray(data)) ? data : [];

if (!window.__pvtState) window.__pvtState = {};
var __S = window.__pvtState;
if (!__S[CFG.ns]) __S[CFG.ns] = { tip: null, grain: 'd', sw: {}, open: false, obsI: 0 };
var state = __S[CFG.ns];
if (!state.sw) state.sw = {};   // защита при обновлении структуры с прошлых сессий
if (state.obsI == null) state.obsI = 0;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
// Числа из BI приходят и числом, и строкой с пробелами-разрядами или запятой.
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  var s = String(v).replace(/[\s ]/g, '');
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
function swDefaults() {
  var d = {};
  for (var i = 0; i < CFG.switches.length; i++) d[CFG.switches[i].key] = CFG.switches[i].def;
  return d;
}
function resetState() {
  state.grain = 'd';
  state.sw = swDefaults();
  state.open = false;
  state.tip = null;
  state.obsI = 0;
}
if (state.grain === undefined) state.grain = 'd';
(function initSw() {
  var d = swDefaults();
  for (var k in d) if (state.sw[k] === undefined) state.sw[k] = d[k];
})();
function grainOf(id) {
  for (var i = 0; i < CFG.grains.length; i++) if (CFG.grains[i].id === id) return CFG.grains[i];
  return CFG.grains[0];
}
function buildModel() {
  var F = CFG.fields, r = rawData[0] || null;
  var m = { kpi: null, grain: state.grain, sj: {}, areaNm: [], ppl: {} };
  if (!r) return m;
  m.kpi = {
    users: num(r[F.users]) || 0, users_prev: num(r[F.users_prev]) || 0,
    views: num(r[F.views]) || 0, views_prev: num(r[F.views_prev]) || 0,
    new_u: num(r[F.new_u]) || 0, new_prev: num(r[F.new_prev]) || 0,
    regular: num(r[F.regular]) || 0, regular_prev: num(r[F.regular_prev]) || 0,
    sleeping: num(r[F.sleeping]) || 0, mau: num(r[F.mau]) || 0, mau_prev: num(r[F.mau_prev]) || 0
  };
  var g = String(r[F.grain] || '');
  if (g) m.grain = grainOf(g).id;
  try { m.sj = JSON.parse(String(r[F.state_j] || '{}')) || {}; } catch (e) { m.sj = {}; }
  var an = String(r[F.area_nm] || '');
  m.areaNm = an ? an.split('\n') : [];
  var pn = String(r[F.ppl_nm] || '');
  if (pn) {
    var lines = pn.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var p = lines[i].split('\t');
      if (p[0]) m.ppl[p[0]] = p[1] || '';
    }
  }
  return m;
}
var MODEL = buildModel();

// МАСКА КРОСС-ФИЛЬТРА (чистая функция).
// Инвариант: НИ ОДИН фильтр не несёт value=[] (ронял запрос, 783708);
// свитки/период эмитятся ТОЛЬКО при отличии от дефолта; пустая маска =
// полный сброс applyCrossFilter([]) (прецедент 783469).
function maskOf(st) {
  var mk = function (col, val) { return { column: col, operator: 'IN', value: val }; };
  var fl = [];
  if (st.grain && st.grain !== 'd') fl.push(mk('period_param', [st.grain]));
  for (var i = 0; i < CFG.switches.length; i++) {
    var s = CFG.switches[i];
    if (st.sw[s.key] !== s.def) fl.push(mk(s.emit, [s.val]));
  }
  return fl;
}

// «Что видно в данных»: пороговый отбор фактов по KPI экрана.
function obsList(k, G, what) {
  var out = [];
  if (!k || !k.users) return out;
  var dU = G.prev && k.users_prev ? (k.users / k.users_prev - 1) * 100 : null;
  var shNew = k.new_u / k.users * 100;
  var shReg = k.regular / k.users * 100;
  var shGone = k.users_prev ? k.sleeping / k.users_prev * 100 : null;
  if (dU != null && Math.abs(dU) >= 10) {
    out.push({ sev: dU > 0 ? 'good' : 'high',
      lead: 'Пользователей ' + (dU > 0 ? 'больше' : 'меньше') + ' на ' + pct(Math.abs(dU)) + ' ' + G.vs,
      body: what + ': за период ' + nf(k.users) + ' пользователей против ' + nf(k.users_prev) + ' в предыдущем.',
      rule: 'изменение к предыдущему периоду ≥10%' });
  }
  if (G.prev && shGone != null && shGone >= 15) {
    out.push({ sev: 'mid',
      lead: nf(k.sleeping) + ' ' + plural(k.sleeping, 'человек', 'человека', 'человек') + ' прошлого периода не вернулись',
      body: nf(k.sleeping) + ' из ' + nf(k.users_prev) + ' зрителей предыдущего периода (' + pct(shGone) + ') в текущем не заходили.',
      rule: 'доля ушедших ≥15% аудитории прошлого периода' });
  }
  if (shNew >= 22) {
    out.push({ sev: 'good',
      lead: 'Новые дают ' + pct(shNew) + ' аудитории',
      body: 'Из ' + nf(k.users) + ' пользователей ' + nf(k.new_u) + ' пришли впервые: рост идёт за счёт притока.',
      rule: 'доля новых ≥22%' });
  }
  if (shReg < 25) {
    out.push({ sev: 'mid',
      lead: 'Постоянных ' + pct(shReg) + ' — меньше четверти',
      body: 'Только ' + nf(k.regular) + ' человек заходили 8 и более ' + G.units + ' за период.',
      rule: 'доля постоянных <25%' });
  }
  var ord = { high: 0, mid: 1, good: 2 };
  out.sort(function (a, b) { return ord[a.sev] - ord[b.sev]; });
  return out;
}

// ---------- БЛОК 4: ФОРМАТИРОВАНИЕ И ЦВЕТ ----------
// Тонкий пробел в разрядах, типографский минус, русское склонение.
var THIN = ' ';
var MINUS = '−';
var MONTHS_FULL = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
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
  return (v > 0 ? '+' : (v < 0 ? MINUS : '')) + nf(Math.abs(v), dec == null ? 0 : dec) + (unit || '');
}
// Последний ЗАКРЫТЫЙ месяц от даты свежести (витрина за вчера).
function closedMonth(back) {
  var now = new Date(Date.now() - 86400000);
  var dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
  return MONTHS_FULL[dt.getUTCMonth()] + ' ' + dt.getUTCFullYear();
}
function freqLabel(i, units) {
  var f = { 'дней': ['день', 'дня', 'дней'], 'недель': ['неделя', 'недели', 'недель'],
    'месяцев': ['месяц', 'месяца', 'месяцев'], 'кварталов': ['квартал', 'квартала', 'кварталов'] }[units] || ['день', 'дня', 'дней'];
  var rg = function (a, b) { return a + THIN + '–' + THIN + b + ' ' + plural(b, f[0], f[1], f[2]); };
  return ['1 ' + f[0], rg(2, 3), rg(4, 7), rg(8, 15), '16+ ' + f[2]][i] || '';
}
// Подсказка — тот же HTML-контракт, что у каталога и панели.
function tipHtml(o) {
  if (o == null) return '';
  var s = '<div class="' + CFG.ns + '-tipbox">';
  if (o.title) s += '<span class="' + CFG.ns + '-t-h">' + esc(o.title) + '</span>';
  if (o.text) s += '<span class="' + CFG.ns + '-t-x">' + esc(o.text) + '</span>';
  var rows = o.rows || [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    s += '<span class="' + CFG.ns + '-t-r">' +
      (r.color ? '<i class="' + CFG.ns + '-t-m" style="background:' + r.color + '"></i>' : '') +
      '<span class="' + CFG.ns + '-t-l">' + esc(r.label) + '</span><b class="' + CFG.ns + '-t-v">' + esc(r.value) + '</b></span>';
  }
  if (o.note) s += '<span class="' + CFG.ns + '-t-n">' + esc(o.note) + '</span>';
  return s + '</div>';
}
function tip(o) { return ' data-tip="' + esc(tipHtml(o)) + '"'; }
function delta(v, o) {
  o = o || {};
  if (v == null || !isFinite(v)) {
    return '<span class="' + CFG.ns + '-nocmp"' + tip({ title: 'Сравнение', text: o.why || 'Нет предыдущего периода.' }) + '>не сравнивается</span>';
  }
  var cls = Math.abs(v) < (o.dead == null ? 0.05 : o.dead) ? 'flat' : (v > 0 ? 'up' : 'down');
  return '<span class="' + CFG.ns + '-delta ' + CFG.ns + '-' + cls + '">' + signed(v, 1, o.unit || '') +
    (o.vs ? ' <span class="' + CFG.ns + '-d-vs">' + esc(o.vs) + '</span>' : '') + '</span>';
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
// Корень остаётся width:100% — виджет тянется за ячейкой дашборда (RETRO 48).
// Типографика листа (правка владельца 2026-09-23 «слишком жирно, много
// чёрного»): потолок веса 600, числа — 600, подписи — 500/400, основной
// текст — графит ink2, чёрный ink — только у ключевых чисел.
function buildCSS() {
  var P = '.' + CFG.ns;
  var C = CFG.colors;
  return [
    '<style>',
    P + '-root{width:100%;min-height:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:12px;'
            + 'font-family:' + CFG.fonts.family + ';color:' + C.ink2 + ';color-scheme:light;}',
    P + '-root *{box-sizing:border-box;font-family:inherit;}',
    // ТУЛТИП живёт В BODY, вне -root — шрифт ему НЕ наследуется.
    P + '-tip{position:fixed;z-index:99999;pointer-events:none;opacity:0;display:none;'
           + 'font-family:' + CFG.fonts.family + ';box-sizing:border-box;transition:opacity .08s;}',
    P + '-tipbox{background:#fff;border:1px solid ' + C.line + ';border-radius:9px;padding:7px 10px;max-width:280px;'
           + 'box-shadow:0 10px 30px rgba(24,33,50,.16),0 2px 6px rgba(24,33,50,.06);display:flex;flex-direction:column;gap:3px;}',
    P + '-t-h{font-size:10px;font-weight:600;letter-spacing:.3px;text-transform:uppercase;color:' + C.mut + ';margin-bottom:2px;}',
    P + '-t-x{font-size:11.5px;color:' + C.ink2 + ';line-height:1.45;}',
    P + '-t-r{display:flex;align-items:center;gap:6px;min-width:130px;}',
    P + '-t-m{width:10px;height:9px;border-radius:3px;display:inline-block;flex:0 0 auto;}',
    P + '-t-l{font-size:11px;color:' + C.mut + ';}',
    P + '-t-v{margin-left:auto;font-size:12px;font-weight:600;color:' + C.ink + ';font-variant-numeric:tabular-nums;}',
    P + '-t-n{font-size:10.5px;color:' + C.mut + ';margin-top:4px;padding-top:4px;border-top:1px solid ' + C.line2 + ';}',
    // ── Строка управления ──
    P + '-strip{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:8px 12px;background:' + C.card + ';border-radius:12px;}',
    P + '-strip-seg{display:inline-flex;align-items:center;gap:2px;background:' + C.bgAlt + ';border-radius:9px;padding:2px;}',
    P + '-strip-seg button{border:0;background:transparent;border-radius:7px;padding:5px 12px;font:inherit;font-size:12px;'
           + 'font-weight:500;color:' + C.mut + ';cursor:pointer;white-space:nowrap;}',
    P + '-strip-seg button.on{background:#fff;color:' + C.ink + ';box-shadow:0 1px 2px rgba(20,28,45,.12);}',
    P + '-sp{flex:1;}',
    P + '-opts{position:relative;display:inline-flex;}',
    P + '-opts-trg{display:inline-flex;align-items:center;gap:6px;border:1px solid ' + C.line + ';background:#fff;border-radius:9px;'
           + 'padding:5px 12px;font:inherit;font-size:12px;font-weight:500;color:' + C.ink2 + ';cursor:pointer;white-space:nowrap;}',
    P + '-opts-trg:hover,' + P + '-opts.open ' + P + '-opts-trg{border-color:' + C.act + ';color:' + C.act + ';}',
    P + '-opts-dot{width:7px;height:7px;border-radius:50%;background:' + C.act + ';display:inline-block;}',
    P + '-opts-pop{position:absolute;z-index:60;top:calc(100% + 6px);left:0;min-width:300px;background:#fff;border-radius:9px;padding:10px;'
           + 'border:1px solid ' + C.line + ';box-shadow:0 10px 30px rgba(24,33,50,.14);display:flex;flex-direction:column;gap:2px;}',
    P + '-st-c{font-size:10px;color:inherit;}',
    P + '-swt{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:' + C.ink2 + ';font-weight:400;line-height:1.35;padding:4px 2px;}',
    P + '-swt input{appearance:none;width:32px;height:18px;border-radius:999px;background:#dfe3ea;position:relative;cursor:pointer;flex:0 0 auto;'
           + 'transition:background .16s;margin:0;}',
    P + '-swt input:after{content:\'\';position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;'
           + 'transition:transform .16s;box-shadow:0 1px 2px rgba(20,28,45,.25);}',
    P + '-swt input:checked{background:' + C.act + ';}',
    P + '-swt input:checked:after{transform:translateX(14px);}',
    P + '-info{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;flex:0 0 auto;'
           + 'border:1px solid ' + C.line + ';color:' + C.mut + ';font-size:9px;font-style:normal;font-weight:600;cursor:help;vertical-align:middle;}',
    P + '-fresh{font-size:11.5px;color:' + C.mut + ';display:inline-flex;align-items:center;gap:7px;}',
    P + '-fresh b{color:' + C.ink2 + ';font-weight:500;}',
    P + '-fresh i{width:7px;height:7px;border-radius:50%;background:' + C.green + ';display:inline-block;}',
    P + '-btn-ghost{border:0;color:' + C.act + ';background:transparent;border-radius:9px;padding:5px 12px;'
           + 'font:inherit;font-size:12.5px;font-weight:500;cursor:pointer;}',
    P + '-btn-ghost:hover{background:rgba(0,115,160,.08);}',
    // ── KPI ──
    P + '-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;}',
    P + '-kpi{background:' + C.card + ';border-radius:12px;padding:12px 15px;min-width:0;}',
    P + '-k-label{font-size:11.5px;color:' + C.mut + ';font-weight:500;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    P + '-k-val{font-size:24px;font-weight:600;letter-spacing:-.4px;line-height:1.15;color:' + C.ink + ';margin-top:4px;font-variant-numeric:tabular-nums;}',
    P + '-k-row{display:flex;align-items:center;gap:8px;margin-top:7px;flex-wrap:wrap;min-height:20px;}',
    P + '-k-sub{font-size:11.5px;color:' + C.mut + ';}',
    P + '-k-sub b{color:' + C.ink2 + ';font-weight:500;}',
    P + '-delta{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:500;border-radius:999px;padding:2px 8px;}',
    P + '-d-vs{font-weight:400;font-size:10.5px;opacity:.8;}',
    P + '-up{background:' + C.greenBg + ';color:' + C.greenTx + ';}',
    P + '-down{background:' + C.redBg + ';color:' + C.redTx + ';}',
    P + '-flat{background:#f0f1f3;color:' + C.mut + ';}',
    P + '-nocmp{font-size:11px;color:' + C.mut + ';cursor:help;border-bottom:1px dotted ' + C.mut2 + ';}',
    // ── «Что видно в данных»: лента фиксированной высоты ──
    P + '-obs{display:flex;align-items:center;gap:10px;height:42px;padding:0 8px 0 14px;border-radius:12px;background:' + C.card + ';min-width:0;}',
    P + '-obs.sev-high{background:linear-gradient(100deg,#fff0f1 0%,#fdf6f8 45%,#fff 100%);}',
    P + '-obs.sev-mid{background:linear-gradient(100deg,#fff6e6 0%,#fdf9f2 45%,#fff 100%);}',
    P + '-obs.sev-good{background:linear-gradient(100deg,#eaf8ef 0%,#f5faf7 45%,#fff 100%);}',
    P + '-obs-ico{width:20px;height:20px;border-radius:6px;background:rgba(255,255,255,.8);display:inline-flex;align-items:center;justify-content:center;'
           + 'font-size:11px;font-weight:600;flex:0 0 auto;color:' + C.mut + ';}',
    P + '-obs.sev-high ' + P + '-obs-ico{color:' + C.redTx + ';}',
    P + '-obs.sev-mid ' + P + '-obs-ico{color:#9a6500;}',
    P + '-obs.sev-good ' + P + '-obs-ico{color:' + C.greenTx + ';}',
    P + '-obs-t{font-size:12.5px;font-weight:500;color:' + C.ink2 + ';flex:0 0 auto;}',
    P + '-obs-lead{font-size:12.5px;color:' + C.ink2 + ';flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:help;}',
    P + '-obs-nav{display:inline-flex;align-items:center;gap:2px;flex:0 0 auto;}',
    P + '-obs-nav button{border:0;background:rgba(255,255,255,.7);width:24px;height:24px;border-radius:7px;cursor:pointer;color:' + C.ink2 + ';font:inherit;font-size:13px;}',
    P + '-obs-nav button:hover{background:#fff;color:' + C.act + ';}',
    P + '-obs-nav button[disabled]{opacity:.35;cursor:default;}',
    P + '-obs-n{font-size:11px;color:' + C.mut + ';padding:0 4px;font-variant-numeric:tabular-nums;}',
    // ── Общие фильтры листа ──
    P + '-flt{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-height:26px;padding:0 4px;}',
    P + '-flt-l{font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:' + C.mut + ';font-weight:500;}',
    P + '-flt-hint{font-size:11.5px;color:' + C.mut + ';}',
    P + '-pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:3px 11px;font-size:11.5px;font-weight:500;'
           + 'max-width:360px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:help;border:1px solid transparent;}',
    P + '-pill.area{background:' + C.blueBg + ';border-color:' + C.actLine + ';color:' + C.actInk + ';}',
    P + '-pill.ppl{background:' + C.pplBg + ';border-color:' + C.pplLine + ';color:' + C.ppl + ';}',
    P + '-pill.opt{background:#f2f4f6;border-color:' + C.line2 + ';color:' + C.ink2 + ';cursor:default;padding-right:6px;}',
    P + '-pill.opt button{width:15px;height:15px;border-radius:50%;border:0;padding:0;cursor:pointer;background:rgba(58,63,74,.12);'
           + 'color:' + C.ink2 + ';font-size:11px;line-height:1;}',
    P + '-pill.opt button:hover{background:rgba(58,63,74,.24);}',
    P + '-pill-k{opacity:.75;font-weight:400;}',
    '</style>'
  ].join('');
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

// Пять карточек экрана. Предыдущий период сравнивается только там, где он
// целиком помещается в 13 месяцев истории витрины (30 дней, 20 недель).
function kpisHtml() {
  var k = MODEL.kpi, G = grainOf(MODEL.grain);
  if (!k) return '';
  var dPct = function (a, b) { return b ? (a / b - 1) * 100 : null; };
  var why = 'В витрине 13 месяцев истории: полного предыдущего периода (' + G.label + ') в ней нет.';
  var dl = function (v, o) { return G.prev ? delta(v, o) : delta(null, { why: why }); };
  var shReg = k.users ? k.regular / k.users * 100 : 0;
  var shRegPrev = k.users_prev ? k.regular_prev / k.users_prev * 100 : 0;
  var mM = closedMonth(1), mP = closedMonth(2);
  return '<div class="' + CFG.ns + '-kpis">' +
    kpiCard({ label: 'Пользователей за ' + G.label, value: nf(k.users),
      hint: { title: 'Пользователи', text: 'Уникальные люди экрана: область каталога и выбранные люди. Один человек — один раз.' },
      delta: dl(dPct(k.users, k.users_prev), { vs: G.vs, unit: '%' }),
      sub: G.prev ? 'предыдущий: <b>' + nf(k.users_prev) + '</b>' : 'ушли из прошлого периода: <b>' + nf(k.sleeping) + '</b>' }) +
    kpiCard({ label: 'Просмотров', value: compact(k.views),
      hint: { title: 'Просмотры', text: 'Сумма открытий отчётов области за период.' },
      delta: dl(dPct(k.views, k.views_prev), { vs: G.vs, unit: '%' }),
      sub: 'на пользователя: <b>' + nf(k.users ? k.views / k.users : 0, 1) + '</b>' }) +
    kpiCard({ label: 'Новых', value: nf(k.new_u),
      hint: { title: 'Новые', text: 'Первый визит в отчёты области пришёлся на этот период.' },
      delta: dl(dPct(k.new_u, k.new_prev), { vs: G.vs, unit: '%' }),
      sub: 'доля аудитории: <b>' + pct(k.users ? k.new_u / k.users * 100 : 0) + '</b>' }) +
    kpiCard({ label: 'Постоянных', value: pct(shReg),
      hint: { title: 'Постоянные', text: 'Заходили 8 и более разных ' + G.units + ' за период — та же мера, что столбец «Пост.» каталога.' },
      delta: dl(shReg - shRegPrev, { vs: G.vs, unit: ' п.п.', dead: 0.3 }),
      sub: '<b>' + nf(k.regular) + '</b> ' + plural(k.regular, 'человек', 'человека', 'человек') }) +
    kpiCard({ label: 'MAU · ' + mM, value: nf(k.mau),
      hint: { title: 'Месячная аудитория', text: 'Уникальные люди за последний закрытый календарный месяц. От периода полоски не зависит.',
        rows: [{ label: mM, value: nf(k.mau), color: CFG.colors.ret }, { label: mP, value: nf(k.mau_prev), color: CFG.colors.bench }] },
      delta: delta(dPct(k.mau, k.mau_prev), { vs: 'к ' + mP.split(' ')[0], unit: '%' }),
      sub: mP + ': <b>' + nf(k.mau_prev) + '</b>' }) +
    '</div>';
}

// Лента наблюдений: один факт на экране, листание ‹ ›, текст целиком — в подсказке.
function obsHtml(what) {
  var list = obsList(MODEL.kpi, grainOf(MODEL.grain), what);
  var N = CFG.ns;
  if (!list.length) {
    return '<div class="' + N + '-obs"><span class="' + N + '-obs-ico" aria-hidden="true">✓</span>' +
      '<span class="' + N + '-obs-t">Что видно в данных</span>' +
      '<span class="' + N + '-obs-lead">Отклонений выше порогов нет: показатели в пределах обычного разброса.</span></div>';
  }
  var i = Math.max(0, Math.min(state.obsI || 0, list.length - 1));
  state.obsI = i;
  var o = list[i];
  return '<div class="' + N + '-obs sev-' + o.sev + '">' +
    '<span class="' + N + '-obs-ico" aria-hidden="true">!</span>' +
    '<span class="' + N + '-obs-t">Что видно в данных</span>' +
    '<span class="' + N + '-obs-lead"' + tip({ title: o.lead, text: o.body, note: 'Отбор по порогу: ' + o.rule }) + '>' + esc(o.lead) + '</span>' +
    (list.length > 1
      ? '<span class="' + N + '-obs-nav"><button type="button" data-obs="prev" aria-label="Предыдущий факт"' + (i === 0 ? ' disabled' : '') + '>‹</button>' +
        '<span class="' + N + '-obs-n">' + (i + 1) + ' / ' + list.length + '</span>' +
        '<button type="button" data-obs="next" aria-label="Следующий факт"' + (i === list.length - 1 ? ' disabled' : '') + '>›</button></span>'
      : '') +
    '</div>';
}

// Общие фильтры листа: область каталога (синие), люди из «Кто смотрит»
// (фиолетовые), отклонённые свитки полоски (серые, снимаются здесь же ×).
function filtersHtml() {
  var N = CFG.ns, sj = MODEL.sj || {}, h = '', n = 0;
  var fromCat = 'Задано в каталоге слева — снимается кликом по выделенной строке.';
  var fromWho = 'Задано в «Кто смотрит» справа — снимается кликом по выделенной строке.';
  if (sj.area_mode && sj.area && sj.area.length) {
    var L = CFG.areaLabels[sj.area_mode] || ['Область', 'Область'];
    var names = sj.area_mode === 'report' ? (MODEL.areaNm.length ? MODEL.areaNm : sj.area) : sj.area;
    var one = sj.area.length === 1;
    if (sj.area_mode === 'report' && one && sj.area[0] === '0') {
      h += '<span class="' + N + '-pill area"' + tip({ title: 'Область', text: 'Условия каталога не оставили ни одного отчёта.' }) + '>Пустое пересечение</span>';
    } else {
      h += '<span class="' + N + '-pill area"' + tip({ title: L[one ? 0 : 1], text: fromCat,
        rows: one ? [] : names.slice(0, 12).map(function (x) { return { label: x, value: '' }; }) }) + '>' +
        '<span class="' + N + '-pill-k">' + esc(L[one ? 0 : 1]) + ':</span> ' + esc(one ? (names[0] || sj.area[0]) : String(sj.area.length)) + '</span>';
    }
    n++;
  }
  for (var c = 0; c < CFG.pplLabels.length; c++) {
    var pl = CFG.pplLabels[c], vals = sj[pl.key];
    if (!vals || !vals.length) continue;
    h += '<span class="' + N + '-pill ppl"' + tip({ title: vals.length === 1 ? pl.one : pl.many, text: fromWho,
      rows: vals.length === 1 ? [] : vals.slice(0, 12).map(function (x) { return { label: x, value: '' }; }) }) + '>' +
      '<span class="' + N + '-pill-k">' + esc(vals.length === 1 ? pl.one : pl.many) + ':</span> ' + esc(vals.length === 1 ? vals[0] : String(vals.length)) + '</span>';
    n++;
  }
  if (sj.login && sj.login.length) {
    var nm = function (l) { return MODEL.ppl[l] || l; };
    h += '<span class="' + N + '-pill ppl"' + tip({ title: sj.login.length === 1 ? 'Человек' : 'Люди', text: fromWho,
      rows: sj.login.slice(0, 12).map(function (x) { return { label: nm(x), value: x }; }) }) + '>' +
      '<span class="' + N + '-pill-k">' + (sj.login.length === 1 ? 'Человек:' : 'Люди:') + '</span> ' +
      esc(sj.login.length === 1 ? nm(sj.login[0]) : String(sj.login.length)) + '</span>';
    n++;
  }
  if (sj.heads === '1') { h += '<span class="' + N + '-pill ppl"' + tip({ title: 'Руководители', text: fromWho }) + '>Только руководители</span>'; n++; }
  if (sj.freq && sj.freq.length) {
    var G = grainOf(MODEL.grain), fl = [];
    for (var f = 0; f < sj.freq.length; f++) fl.push(freqLabel(parseInt(sj.freq[f], 10) - 1, G.units));
    h += '<span class="' + N + '-pill ppl"' + tip({ title: 'Частота', text: fromWho }) + '><span class="' + N + '-pill-k">Частота:</span> ' + esc(fl.join(', ')) + '</span>';
    n++;
  }
  for (var s = 0; s < CFG.switches.length; s++) {
    var sw = CFG.switches[s];
    if (state.sw[sw.key] === sw.def) continue;
    h += '<span class="' + N + '-pill opt">' + esc(sw.off) +
      '<button type="button" data-swreset="' + esc(sw.key) + '" aria-label="Вернуть «' + esc(sw.label) + '»">×</button></span>';
    n++;
  }
  return '<div class="' + N + '-flt"><span class="' + N + '-flt-l">Фильтры</span>' +
    (n ? h : '<span class="' + N + '-flt-hint">клик по строке каталога или «Кто смотрит» добавит условие сюда; Shift — несколько</span>') + '</div>';
}

// Только конкатенация строк. Все данные через esc().
function buildHTML() {
  var N = CFG.ns, h = [];
  var sj = MODEL.sj || {};
  var what = sj.area && sj.area.length ? 'Выбранная область' : 'Proteus';
  h.push('<div class="' + N + '-root">');
  h.push('<div class="' + N + '-strip">');
  h.push('<div class="' + N + '-strip-seg" role="group" aria-label="Период">');
  for (var i = 0; i < CFG.grains.length; i++) {
    var g = CFG.grains[i];
    h.push('<button type="button" data-grain="' + esc(g.id) + '"' + (g.id === state.grain ? ' class="on"' : '') + '>' + esc(g.label) + '</button>');
  }
  h.push('</div>');
  var open = !!state.open, dev = false;
  for (var d = 0; d < CFG.switches.length; d++) if (state.sw[CFG.switches[d].key] !== CFG.switches[d].def) dev = true;
  h.push('<div class="' + N + '-opts' + (open ? ' open' : '') + '">');
  h.push('<button type="button" class="' + N + '-opts-trg" data-ddtoggle="opts" data-action="toggle" aria-haspopup="true" aria-expanded="' + open + '"' +
    tip({ title: 'Опции', text: 'Какие отчёты и просмотры считать. Отличия от умолчания видны серыми пилюлями в строке фильтров.' }) + '>' +
    (dev ? '<i class="' + N + '-opts-dot" aria-hidden="true"></i>' : '') + 'Опции <span class="' + N + '-st-c" aria-hidden="true">▾</span></button>');
  if (open) {
    h.push('<div class="' + N + '-opts-pop">');
    for (var j = 0; j < CFG.switches.length; j++) {
      var s = CFG.switches[j];
      h.push('<label class="' + N + '-swt"><input type="checkbox" data-f="' + esc(s.key) + '"' + (state.sw[s.key] ? ' checked' : '') + '><span>' + esc(s.label) +
        (s.hint ? ' <span class="' + N + '-info"' + tip({ text: s.hint }) + '>i</span>' : '') + '</span></label>');
    }
    h.push('</div>');
  }
  h.push('</div>');
  h.push('<span class="' + N + '-sp"></span>');
  h.push('<span class="' + N + '-fresh"' + tip({ title: 'Свежесть данных', text: 'Витрина обновляется ежедневно, данные — по вчерашний день включительно.' }) +
    '><i></i>данные <b>за вчера</b></span>');
  h.push('<button type="button" class="' + N + '-btn-ghost" data-action="resetAll"' +
    tip({ text: 'Вернуть период и опции к умолчанию. Выбор в каталоге и в «Кто смотрит» снимается там же.' }) + '>Сбросить</button>');
  h.push('</div>');
  if (MODEL.kpi) {
    h.push(kpisHtml());
    h.push(obsHtml(what));
  }
  h.push(filtersHtml());
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

    var overlay = document.createElement('div');
    overlay.className = CFG.ns + '-overlay';
    overlay.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;'
      + 'z-index:10;overflow:auto;box-sizing:border-box;background:' + CFG.colors.bg + ';';
    // Свиток и опции внутри поповера не закрывают его (клик-вне — ниже).
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
      // Содержимое тултипа уже собрано в data-tip (контракт tipHtml).
      showTip(state.tip.html || '', state.tip.rect);
    }

    // render ТОЛЬКО пересобирает разметку. Делегированные обработчики
    // навешиваются ОДИН РАЗ СНАРУЖИ render(): overlay не пересоздаётся.
    // Любой addEventListener внутри render() ЗАПРЕЩЁН — он создаёт дубли.
    function render() {
      overlay.innerHTML = buildHTML();
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

    function onOver(e) {
      var el = trigger(e.target, 'data-tip');
      if (!el) return;
      // Якорь — rect ЦЕЛИ как есть; содержимое — готовый HTML из data-tip.
      state.tip = {
        rect: el.getBoundingClientRect(),
        kind: el.getAttribute('data-kind') || '',
        key: el.getAttribute('data-tip') || '',
        html: el.getAttribute('data-tip') || ''
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

    function emitFilters() {
      if (typeof applyCrossFilter !== 'function') return;
      applyCrossFilter(maskOf(state));
    }

    function onClick(e) {
      // Период: взаимоисключающий выбор.
      var gr = trigger(e.target, 'data-grain');
      if (gr) {
        state.grain = gr.getAttribute('data-grain');
        render();
        emitFilters();
        return;
      }
      // Свиток: браузер уже тогглит input.checked до click-события.
      var sw = trigger(e.target, 'data-f');
      if (sw && sw.tagName === 'INPUT') {
        state.sw[sw.getAttribute('data-f')] = sw.checked;
        render();
        emitFilters();
        return;
      }
      // Лента «Что видно в данных»: листание фактов на месте.
      var ob = trigger(e.target, 'data-obs');
      if (ob) {
        state.obsI = (state.obsI || 0) + (ob.getAttribute('data-obs') === 'next' ? 1 : -1);
        render();
        return;
      }
      // Серая пилюля отклонённого свитка: × возвращает свиток к умолчанию.
      var sr = trigger(e.target, 'data-swreset');
      if (sr) {
        var key = sr.getAttribute('data-swreset');
        for (var q = 0; q < CFG.switches.length; q++) if (CFG.switches[q].key === key) state.sw[key] = CFG.switches[q].def;
        render();
        emitFilters();
        return;
      }
      // Поповер «Опции».
      var dd = trigger(e.target, 'data-ddtoggle');
      if (dd) {
        state.open = !state.open;
        render();
        return;
      }
      // Сброс: своя маска целиком (чужие условия снимают их писатели).
      var rs = trigger(e.target, 'data-action');
      if (rs && rs.getAttribute('data-action') === 'resetAll') {
        resetState();
        render();
        emitFilters();   // пустая маска = applyCrossFilter([])
      }
    }

    overlay.addEventListener('mouseover', onOver);
    overlay.addEventListener('mouseout', onOut);
    overlay.addEventListener('click', onClick);

    // Глобальные слушатели переживают перезапуск скрипта и накапливаются.
    // Старый снимаем ЯВНО, ссылку держим в state. Escape вешай здесь же,
    // тем же способом, и никогда не внутри render().
    if (state.onWinResize) window.removeEventListener('resize', state.onWinResize);
    state.onWinResize = function () { if (state.tip) renderTip(); };
    window.addEventListener('resize', state.onWinResize);

    // Клик-вне и Esc закрывают поповер опций.
    if (state.onDocClick) document.removeEventListener('click', state.onDocClick);
    state.onDocClick = function (ev) {
      if (!state.open) return;
      var n = ev.target;
      while (n && n !== document.body) {
        // Класс открытого поповера — «past-opts open»: сравнение на вхождение.
        if ((typeof n.className === 'string' && (' ' + n.className + ' ').indexOf(' ' + CFG.ns + '-opts ') >= 0) ||
          (n.getAttribute && n.getAttribute('data-ddtoggle') === 'opts')) return;
        n = n.parentNode;
      }
      state.open = false;
      render();
    };
    document.addEventListener('click', state.onDocClick);
    if (state.onDocKey) document.removeEventListener('keydown', state.onDocKey);
    state.onDocKey = function (ev) {
      if ((ev.key === 'Escape' || ev.keyCode === 27) && state.open) {
        state.open = false;
        render();
      }
    };
    document.addEventListener('keydown', state.onDocKey);

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
