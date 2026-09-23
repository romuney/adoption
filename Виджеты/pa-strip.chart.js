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
// ЧТО ЭТО. Верхний чарт листа во всю ширину, v7.3: одна строка — период ·
//   «Считать»: переключатели опций · свежесть данных. Выбранные фильтры живут
//   НЕ здесь, а в строке «Выбранные фильтры» над каждым чартом, где их задали и
//   где снимают (правка владельца 2026-09-23: «фильтры — в самих чартах»).
// ДАННЫЕ. Датасет pa_strip — одна строка эха (grain); шапке он нужен только как
//   носитель чарта. Факт и pa_pair не читает.
// ШИНЫ. Пишет period_param / pub_f / act_f / exc_f → каталог и панель.
//   Самовлияние выключено: свои период и опции шапка держит в состоянии.
// ============================================================================

// ---------- БЛОК 1: CFG ----------
// fields - ТОЛЬКО реальные имена колонок из SQL пользователя.
// Нет поля в SQL - СПРОСИ, не выдумывай и не хардкодь значения.
// Все цвета/шрифты/отступы из макета — только здесь, не в разметке.
var CFG = {
  ns: 'past',
  // 4 колонки датасета pa_strip (Виджеты/pa-strip.data.sql), одна строка.
  fields: { grain: 'grain', area_nm: 'area_nm', ppl_nm: 'ppl_nm', state_j: 'state_j' },
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
    // short — подпись переключателя в строке шапки (без поповера: в шапке ~100 px
    // выпадающее меню обрезалось iframe-ом Proteus и опции нельзя было включить).
    { key: 'published', label: 'Только опубликованные', short: 'Опубликованные', def: true, emit: 'pub_f', val: '0', off: 'включая неопубликованные',
      hint: 'Считать только опубликованные отчёты. Выключите, чтобы видеть и черновики.' },
    { key: 'actual', label: 'Только актуальные', short: 'Актуальные', def: true, emit: 'act_f', val: '0', off: 'включая неактуальные',
      hint: 'Считать только отчёты, помеченные актуальными.' },
    { key: 'excludeOwners', label: 'Исключить владельцев из просмотров', short: 'Без владельцев', def: true, emit: 'exc_f', val: '0', off: 'с просмотрами владельцев',
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
if (!__S[CFG.ns]) __S[CFG.ns] = { tip: null, grain: 'd', sw: {}, open: false };
var state = __S[CFG.ns];
if (!state.sw) state.sw = {};   // защита при обновлении структуры с прошлых сессий

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
  var m = { grain: state.grain, sj: {}, areaNm: [], ppl: {} };
  if (!r) return m;
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
    P + '-root{width:100%;min-height:100%;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;gap:8px;padding:10px 14px;background:' + C.card + ';border-radius:12px;'
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
    P + '-strip{display:flex;align-items:center;flex-wrap:wrap;gap:8px;}',
    P + '-strip-seg{display:inline-flex;align-items:center;gap:2px;background:' + C.bgAlt + ';border-radius:9px;padding:2px;}',
    P + '-strip-seg button{border:0;background:transparent;border-radius:7px;padding:5px 12px;font:inherit;font-size:12px;'
           + 'font-weight:500;color:' + C.mut + ';cursor:pointer;white-space:nowrap;}',
    P + '-strip-seg button.on{background:#fff;color:' + C.ink + ';box-shadow:0 1px 2px rgba(20,28,45,.12);}',
    P + '-sp{flex:1;}',
    // Переключатели «Считать» прямо в строке шапки (поповер не помещался в ~100 px).
    P + '-sep{width:1px;height:20px;background:' + C.line + ';margin:0 4px;flex:0 0 auto;}',
    P + '-lbl{font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:' + C.mut + ';font-weight:500;}',
    P + '-togs{display:inline-flex;gap:6px;flex-wrap:wrap;}',
    P + '-tog{position:relative;display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 11px 0 8px;border:1px solid ' + C.line + ';border-radius:9px;background:#fff;font-size:12px;color:' + C.ink2 + ';cursor:pointer;user-select:none;white-space:nowrap;}',
    P + '-tog:hover{border-color:#d3d8e0;}',
    P + '-tog input{position:absolute;opacity:0;width:0;height:0;margin:0;}',
    P + '-tog i{position:relative;width:26px;height:15px;border-radius:999px;background:#dfe3ea;flex:0 0 auto;transition:background .15s;}',
    P + '-tog i:after{content:\'\';position:absolute;top:2px;left:2px;width:11px;height:11px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(20,28,45,.2);transition:transform .15s;}',
    P + '-tog.on i{background:' + C.act + ';}',
    P + '-tog.on i:after{transform:translateX(11px);}',
    P + '-tog.dev{border-color:' + C.actLine + ';background:' + C.blueBg + ';}',
    P + '-tog:focus-within{outline:2px solid ' + C.actLine + ';outline-offset:1px;}',
    P + '-fresh{font-size:11.5px;color:' + C.mut + ';display:inline-flex;align-items:center;gap:7px;}',
    P + '-fresh b{color:' + C.ink2 + ';font-weight:500;}',
    P + '-fresh i{width:7px;height:7px;border-radius:50%;background:' + C.green + ';display:inline-block;}',
    // ── KPI ──
    // ── «Что видно в данных»: лента фиксированной высоты ──
    // ── Общие фильтры листа ──
    '</style>'
  ].join('');
}

// Только конкатенация строк. Все данные через esc().
function buildHTML() {
  var N = CFG.ns, h = [];
  h.push('<div class="' + N + '-root">');
  h.push('<div class="' + N + '-strip">');
  h.push('<div class="' + N + '-strip-seg" role="group" aria-label="Период">');
  for (var i = 0; i < CFG.grains.length; i++) {
    var g = CFG.grains[i];
    h.push('<button type="button" data-grain="' + esc(g.id) + '"' + (g.id === state.grain ? ' class="on"' : '') + '>' + esc(g.label) + '</button>');
  }
  h.push('</div>');
  // Опции — переключатели прямо в строке (поповер в шапке высотой ~100 px не помещался).
  h.push('<span class="' + N + '-sep" aria-hidden="true"></span><span class="' + N + '-lbl">Считать</span>');
  h.push('<div class="' + N + '-togs" role="group" aria-label="Какие отчёты и просмотры считать">');
  for (var j = 0; j < CFG.switches.length; j++) {
    var s = CFG.switches[j], on = !!state.sw[s.key];
    h.push('<label class="' + N + '-tog' + (on ? ' on' : '') + (on !== s.def ? ' dev' : '') + '"' + tip({ title: s.label, text: s.hint }) + '>' +
      '<input type="checkbox" data-f="' + esc(s.key) + '"' + (on ? ' checked' : '') + '><i aria-hidden="true"></i>' + esc(s.short) + '</label>');
  }
  h.push('</div>');
  h.push('<span class="' + N + '-sp"></span>');
  h.push('<span class="' + N + '-fresh"' + tip({ title: 'Свежесть данных', text: 'Витрина обновляется ежедневно, данные — по вчерашний день включительно.' }) +
    '><i></i>данные <b>за вчера</b></span>');

  h.push('</div>');
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
