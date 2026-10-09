// ============================================================================
// pa-head.chart.js — ШАПКА единого листа, v1 (2026-09-30): период · «Считать» · свежесть + «Целевая аудитория»
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
// ЧТО ЭТО. Одна плашка настроек над листом (прежние чарты «Шапка» pa-strip и «Целевая аудитория»
//   pa-ca-bar — одним чартом, просьба владельца 2026-09-30: борд = шапка · каталог · панель).
//   Ряд 1: период · «Считать»: переключатели опций · «данные на ДД.ММ».
//   Ряд 2: кнопки условий ЦА (УС · Стрим · Специализация · HQ · IT · Руководители · AD-группы) → по клику
//   выпадашка поверх каталога и панели (поиск, галочки, числа с учётом остальных условий) → «Применить».
// ДАННЫЕ. Датасет pa_head (Виджеты/pa-head.data.sql) = справочник pa_ca_dict + строка md (дата данных);
//   фильтров не читает — ответ один на всех, кэшируется. Черновик и применённая ЦА — в state.
// ШИНЫ. Одна маска: period_param / pub_f / act_f / exc_f + ca_*_f → каталог и панель (самовлияние выкл.).
//   Сверке фильтров шапка по-прежнему представляется двумя источниками — 'strip' (период, опции) и
//   'ca' (условия ЦА): получатели (каталог, панель) не меняются.
// ВЫПАДАШКА ПОВЕРХ ЛИСТА (костыль до нативного resize-канала платформы, заявка
//   2026-09-14, прецедент — фильтр борда 59922). Чарт живёт в <iframe sandbox> размером
//   с ячейку. Единственный канал к родителю — postMessage ECHARTS_UPDATE_DATA_URL
//   (канал скриншотов): родитель кладёт dataUrl в img.echarts-plugin рядом с iframe.
//   Открыли выпадашку → шлём PNG 1×1 с маркером CFG.overlay.mark в base64; CSS борда
//   (`:has(img.echarts-plugin[src*=маркер])`) разворачивает iframe вниз поверх сетки (640 px).
//   Подсказка переключателя — маркер CFG.overlay.tipMark (разворот ниже, 260 px).
//   Закрыли → чистый PNG без маркера. Панель выпадашки — в body iframe, position:fixed.
// ============================================================================

// ---------- БЛОК 1: CFG ----------
// fields - ТОЛЬКО реальные имена колонок из SQL пользователя.
// Нет поля в SQL - СПРОСИ, не выдумывай и не хардкодь значения.
// Все цвета/шрифты/отступы из макета — только здесь, не в разметке.
var CFG = {
  ns: 'phead',
  // 5 колонок датасета pa_head (как pa_ca_dict; строка md: k = дата данных).
  fields: { section: 'section', g: 'g', k: 'k', parent: 'parent', n: 'n' },
  text: { noData: 'Нет данных о сотрудниках (pa_staff)' },
  orgSep: ' › ',
  paCols: ['ca_org_f', 'ca_spec_f', 'ca_stream_f', 'ca_hq_f', 'ca_it_f', 'ca_head_f', 'ca_adg_f'],   // ключ сверки фильтров (src 'ca')
  paColsStrip: ['period_param', 'pub_f', 'act_f', 'exc_f'],                                          // ключ сверки фильтров (src 'strip')
  grains: [
    { id: 'd', label: '30 дней' }, { id: 'w', label: '20 недель' }, { id: 'm', label: '12 месяцев' }, { id: 'q', label: '8 кварталов' }
  ],
  // Опция эмитит СВОЮ колонку ТОЛЬКО при отличии от умолчания (val при откл.).
  switches: [
    { key: 'published', label: 'Только опубликованные', short: 'Опубликованные', def: true, emit: 'pub_f', val: '0', off: 'включая неопубликованные',
      hint: 'Считать только опубликованные отчёты. Выключи, чтобы видеть и черновики.' },
    { key: 'actual', label: 'Только актуальные', short: 'Актуальные', def: true, emit: 'act_f', val: '0', off: 'включая неактуальные',
      hint: 'Считать только отчёты, помеченные актуальными.' },
    { key: 'excludeOwners', label: 'Исключить владельцев из просмотров', short: 'Без владельцев', def: true, emit: 'exc_f', val: '0', off: 'с просмотрами владельцев',
      hint: 'Владелец открывает свой отчёт при каждой правке — его визиты завышают аудиторию.' }
  ],
  overlay: {
    // «PA-CA-DD-ON1» в base64: 12 байт = ровно 16 символов, стоит в строке PNG как есть. Выпадашка ЦА.
    mark: 'UEEtQ0EtREQtT04x',
    // «PA-ST-TIP-ON» — подсказка переключателя (разворот ниже).
    tipMark: 'UEEtU1QtVElQLU9O',
    // «PA-TOUR-ON-1» — идёт тур «Как работать»: CSS борда затемняет страницу между чартами (iframe не разворачивается).
    tourMark: 'UEEtVE9VUi1PTi0x',
    png: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
  },
  // Условия: порядок кнопок; q — ключ поиска; w — ширина выпадашки.
  kinds: [
    { k: 'org', l: 'Управленческая структура', q: true, ph: 'Поиск по всем уровням УС', w: 460 },
    { k: 'stream', l: 'Стрим', q: true, ph: 'Найти стрим', w: 340 },
    { k: 'spec', l: 'Специализация', q: true, ph: 'Найти специализацию', w: 360 },
    { k: 'hq', l: 'HQ', w: 280 },
    { k: 'it', l: 'IT', w: 260 },
    { k: 'heads', l: 'Руководители', w: 280 },
    { k: 'adg', l: 'AD-группы', q: true, ph: 'Имя группы', w: 400 }
  ],
  listMax: 200,
  colors: {
    bg: '#f6f6f6', card: '#fff', act: '#245FD4', actInk: '#1B4AA8', blueBg: '#EAF0FC', actLine: '#C3D4F5',
    ink: '#23272e', ink2: '#454b55', mut: '#8a909c', mut2: '#b4b9c2', line: '#e7e9ee', line2: '#eef0f3',
    warnBg: '#fffaf1', warnLine: '#f0dcb4', warnTx: '#8a5a00', bgAlt: '#eef0f3', green: '#12b048'
  },
  fonts: { family: 'Arial,Helvetica,sans-serif' }
};

// ---------- БЛОК 2: ВХОД + СОСТОЯНИЕ + ХЕЛПЕРЫ ----------
var rawData = (typeof data !== 'undefined' && Array.isArray(data)) ? data : [];

if (!window.__pvtState) window.__pvtState = {};
var __S = window.__pvtState;
if (!__S[CFG.ns]) __S[CFG.ns] = { tip: null };
var state = __S[CFG.ns];
(function () {
  var d0 = { draft: null, applied: null, dd: null, q: {}, openNodes: {}, baseH: 0, sig: false, grain: 'd', sw: null };
  for (var k in d0) if (Object.prototype.hasOwnProperty.call(d0, k) && state[k] === undefined) state[k] = d0[k];
  if (!state.sw) state.sw = {};
  var sd = swDefaults();
  for (var s in sd) if (state.sw[s] === undefined) state.sw[s] = sd[s];
  if (!state.draft) state.draft = caEmpty();
  if (!state.applied) state.applied = caEmpty();
})();

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
function caEmpty() { return { org: [], spec: [], stream: [], hq: [], it: [], heads: '', adg: [] }; }
function caCopy(c) { return { org: c.org.slice(), spec: c.spec.slice(), stream: c.stream.slice(), hq: c.hq.slice(), it: c.it.slice(), heads: c.heads || '', adg: c.adg.slice() }; }
function caSame(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function caAttrsOn(c) { return !!(c.org.length || c.spec.length || c.stream.length || c.hq.length || c.it.length || c.heads || c.adg.length); }
function orgUnder(path, node) { return path === node || path.indexOf(node + CFG.orgSep) === 0; }
function orgParts(path) { return path ? path.split(CFG.orgSep) : []; }
function orgShort(path) { var ps = orgParts(path); return ps.length ? ps[ps.length - 1] : ''; }
function dash(v) { return v === '' ? '— не указано' : v; }
function swDefaults() {
  var d = {};
  for (var i = 0; i < CFG.switches.length; i++) d[CFG.switches[i].key] = CFG.switches[i].def;
  return d;
}

// ---------- БЛОК 3: ТРАНСФОРМАЦИЯ ДАННЫХ ----------
// Сотрудники — «единицы» (путь, спец., стрим, рук., HQ, IT, человек, набор AD-групп): из них в браузере
// считаются все числа выпадашек, включая AD-группы. Словарь id → значение (как в pa_aud_v2).
function buildModel() {
  var F = CFG.fields, m = { units: [], orgKids: {}, staffBy: { org: {}, spec: {}, stream: {}, hq: {}, it: {} }, adg: [], staff: 0, adgExact: false, md: '' };
  var dict = { spec: {}, stream: {}, hq: {}, it: {} }, sRows = [], gName = {}, i, j;
  for (i = 0; i < rawData.length; i++) {
    var r = rawData[i] || {}, sec = String(r[F.section] || '');
    if (sec === 's') sRows.push(r);
    else if (sec === 'd') { var dg = String(r[F.g] || ''); if (dict[dg]) dict[dg][String(r[F.k] || '')] = String(r[F.parent] == null ? '' : r[F.parent]); }
    else if (sec === 'adg') { m.adg.push({ name: String(r[F.k] || ''), n: num(r[F.n]) || 0 }); gName[String(r[F.parent] == null ? '' : r[F.parent])] = String(r[F.k] || ''); }
    else if (sec === 'total') m.staff = num(r[F.n]) || 0;
    else if (sec === 'md') m.md = String(r[F.k] || '');
  }
  var dv = function (g, id) { return dict[g][id] == null ? '' : dict[g][id]; };
  for (i = 0; i < sRows.length; i++) {
    var path = String(sRows[i][F.parent] || ''), ps = orgParts(path), q;
    for (q = 1; q <= ps.length; q++) {
      var node = ps.slice(0, q).join(CFG.orgSep), par = ps.slice(0, q - 1).join(CFG.orgSep);
      var ks = m.orgKids[par] || (m.orgKids[par] = []);
      if (ks.indexOf(node) < 0) ks.push(node);
    }
    var lines = String(sRows[i][F.k] || '').split('\n');
    for (j = 0; j < lines.length; j++) {
      var x = lines[j].split('\t');
      if (x.length < 6) continue;
      var u = { org: path, spec: dv('spec', x[0]), stream: dv('stream', x[1]), is_head: x[2] === '1' ? 1 : 0, hq: dv('hq', x[3]), it: dv('it', x[4]), n: num(x[5]) || 0, g: [] };
      // 7-е поле — номера AD-групп (есть в датасете с 2026-09-25; нет — группы считает только сервер).
      if (x.length > 6) {
        m.adgExact = true;
        var gs = x[6] ? x[6].split(',') : [];
        for (q = 0; q < gs.length; q++) if (gName[gs[q]] != null) u.g.push(gName[gs[q]]);
      }
      m.units.push(u);
      for (q = 1; q <= ps.length; q++) { var nd = ps.slice(0, q).join(CFG.orgSep); m.staffBy.org[nd] = (m.staffBy.org[nd] || 0) + u.n; }
      var kk = ['spec', 'stream', 'hq', 'it'];
      for (q = 0; q < kk.length; q++) m.staffBy[kk[q]][u[kk[q]]] = (m.staffBy[kk[q]][u[kk[q]]] || 0) + u.n;
    }
  }
  m.adg.sort(function (a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });
  return m;
}
var MODEL = buildModel();

// Условия складываются через «и», внутри условия — «или». Число у значения — «фасет»:
// сколько сотрудников пройдут ВСЕ ОСТАЛЬНЫЕ выбранные условия и это значение. AD-группы — такое же
// условие («состоит хотя бы в одной из выбранных»), если датасет отдаёт наборы групп (MODEL.adgExact).
var CA_KINDS = ['org', 'spec', 'stream', 'hq', 'it', 'heads', 'adg'];
function caTest(c, x, k) {
  if (k === 'org') {
    if (!c.org.length) return true;
    for (var i = 0; i < c.org.length; i++) if (orgUnder(x.org, c.org[i])) return true;
    return false;
  }
  if (k === 'heads') return !c.heads || (c.heads === '1') === !!x.is_head;
  if (k === 'adg') {
    if (!c.adg.length || !MODEL.adgExact) return true;
    for (var a = 0; a < x.g.length; a++) if (c.adg.indexOf(x.g[a]) >= 0) return true;
    return false;
  }
  return !c[k].length || c[k].indexOf(x[k]) >= 0;
}
var FACET = { key: null };
function caFacet(d) {
  var key = JSON.stringify(d);
  if (FACET.key === key) return FACET;
  var f = { key: key, org: {}, spec: {}, stream: {}, hq: {}, it: {}, adg: {}, heads: { '1': 0, n: 0 }, n: 0 };
  for (var i = 0; i < MODEL.units.length; i++) {
    var x = MODEL.units[i], miss = null, k, K, bad = false;
    for (k = 0; k < CA_KINDS.length; k++) {
      if (caTest(d, x, CA_KINDS[k])) continue;
      if (miss) { bad = true; break; }
      miss = CA_KINDS[k];
    }
    if (bad) continue;
    for (k = 0; k < CA_KINDS.length; k++) {
      K = CA_KINDS[k];
      if (miss && miss !== K) continue;
      if (K === 'org') {
        var ps = orgParts(x.org);
        for (var q = 1; q <= ps.length; q++) { var nd = ps.slice(0, q).join(CFG.orgSep); f.org[nd] = (f.org[nd] || 0) + x.n; }
      } else if (K === 'heads') f.heads[x.is_head ? '1' : 'n'] += x.n;
      else if (K === 'adg') { for (var a = 0; a < x.g.length; a++) f.adg[x.g[a]] = (f.adg[x.g[a]] || 0) + x.n; }
      else f[K][x[K]] = (f[K][x[K]] || 0) + x.n;
    }
    if (!miss) f.n += x.n;
  }
  FACET = f;
  return f;
}
// Маска периода и опций (как у прежней шапки). Инвариант: ни один фильтр не несёт value=[];
// период и опции эмитятся ТОЛЬКО при отличии от умолчания.
function stripMask(st) {
  var fl = [];
  if (st.grain && st.grain !== 'd') fl.push({ column: 'period_param', operator: 'IN', value: [st.grain] });
  for (var i = 0; i < CFG.switches.length; i++) {
    var s = CFG.switches[i];
    if (st.sw[s.key] !== s.def) fl.push({ column: s.emit, operator: 'IN', value: [s.val] });
  }
  return fl;
}
// Эмит применённой ЦА: ca_*_f → каталог и панель (их джини читают те же колонки).
function maskOf(c) {
  var fl = [];
  if (c.org.length) fl.push({ column: 'ca_org_f', operator: 'IN', value: c.org.slice() });
  if (c.spec.length) fl.push({ column: 'ca_spec_f', operator: 'IN', value: c.spec.slice() });
  if (c.stream.length) fl.push({ column: 'ca_stream_f', operator: 'IN', value: c.stream.slice() });
  if (c.hq.length) fl.push({ column: 'ca_hq_f', operator: 'IN', value: c.hq.slice() });
  if (c.it.length) fl.push({ column: 'ca_it_f', operator: 'IN', value: c.it.slice() });
  if (c.heads) fl.push({ column: 'ca_head_f', operator: 'IN', value: [c.heads] });
  if (c.adg.length) fl.push({ column: 'ca_adg_f', operator: 'IN', value: c.adg.slice() });
  return fl;
}

// ---------- БЛОК 4: ФОРМАТИРОВАНИЕ И ЦВЕТ ----------
var THIN = ' ';
function nf(v) {
  if (v == null || !isFinite(v)) return '—';
  return (v < 0 ? '−' : '') + Math.abs(Math.round(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
}
function plural(n, one, few, many) {
  n = Math.abs(Math.round(n));
  var d10 = n % 10, d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return one;
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return few;
  return many;
}
function ppl(n) { return nf(n) + ' ' + plural(n, 'человек', 'человека', 'человек'); }
// Подсказка — тот же HTML-контракт, что у каталога и панели.
function tipHtml(o) {
  if (o == null) return '';
  var s = '<div class="' + CFG.ns + '-tipbox">';
  if (o.title) s += '<span class="' + CFG.ns + '-t-h">' + esc(o.title) + '</span>';
  if (o.text) s += '<span class="' + CFG.ns + '-t-x">' + esc(o.text) + '</span>';
  var rows = o.rows || [];
  for (var i = 0; i < rows.length; i++) {
    s += '<span class="' + CFG.ns + '-t-r"><span class="' + CFG.ns + '-t-l">' + esc(rows[i].label) + '</span><b class="' + CFG.ns + '-t-v">' + esc(rows[i].value) + '</b></span>';
  }
  if (o.note) s += '<span class="' + CFG.ns + '-t-n">' + esc(o.note) + '</span>';
  return s + '</div>';
}
function tip(o) { return ' data-tip="' + esc(tipHtml(o)) + '"'; }
// Свежесть: «данные на ДД.ММ» по последнему дню витрины (строка md). Зелёная точка — это вчера
// (витрина в срок), жёлтая — отстаёт (на сколько — текстом рядом), серая — дата не пришла.
function freshHtml(md, N) {
  var t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(md || ''));
  if (!t) return '<span class="' + N + '-fresh"><i class="na"></i>данные <b>—</b></span>';
  var now = new Date(), y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  var lag = Math.round((Date.UTC(y.getFullYear(), y.getMonth(), y.getDate()) - Date.UTC(+t[1], +t[2] - 1, +t[3])) / 86400000);
  var ok = lag <= 0;
  // без подсказки (фидбек 2026-10-09: и так понятно, а рядом с «Как работать» она дёргалась); отставание — текстом
  return '<span class="' + N + '-fresh">' +
    '<i class="' + (ok ? '' : 'late') + '"></i>данные на <b>' + t[3] + '.' + t[2] + '</b>' +
    (ok ? '' : ' · отстают на ' + lag + ' ' + plural(lag, 'день', 'дня', 'дней')) + '</span>';
}
// Что выбрано в условии: подпись кнопки.
function picked(c, k) {
  if (k === 'heads') return c.heads ? [c.heads === '1' ? 'Только руководители' : 'Без руководителей'] : [];
  return c[k].map(function (v) { return k === 'org' ? orgShort(v) : dash(v); });
}

// ---------- БЛОК 5: РАЗМЕТКА (<style> + HTML) ----------
// КАЖДЫЙ селектор начинается с .<ns>- или с .<ns>-root - иначе стили
// протекут в интерфейс Proteus. НИКАКИХ голых div/table/th/button.
function buildCSS() {
  var P = '.' + CFG.ns;
  var C = CFG.colors;
  return [
    '<style>',
    P + '-root{width:100%;height:100%;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;gap:8px;padding:10px 14px;background:' + C.card + ';border-radius:12px;'
      + 'font-family:' + CFG.fonts.family + ';color:' + C.ink2 + ';color-scheme:light;font-size:12.5px;}',
    P + '-root *, ' + P + '-dd *{box-sizing:border-box;font-family:inherit;}',
    P + '-tip{position:fixed;z-index:99999;pointer-events:none;opacity:0;display:none;font-family:' + CFG.fonts.family + ';box-sizing:border-box;}',
    P + '-tipbox{background:#fff;border:1px solid ' + C.line + ';border-radius:9px;padding:7px 10px;max-width:280px;box-shadow:0 10px 30px rgba(24,33,50,.16);display:flex;flex-direction:column;gap:3px;}',
    P + '-t-h{font-size:10px;font-weight:700;letter-spacing:.3px;text-transform:uppercase;color:' + C.mut + ';}',
    P + '-t-x{font-size:11.5px;color:' + C.ink2 + ';line-height:1.45;}',
    P + '-t-r{display:flex;align-items:center;gap:6px;min-width:130px;}',
    P + '-t-l{font-size:11px;color:' + C.mut + ';}',
    P + '-t-v{margin-left:auto;font-size:12px;font-weight:700;color:' + C.ink + ';}',
    P + '-t-n{font-size:10.5px;color:' + C.mut + ';margin-top:4px;padding-top:4px;border-top:1px solid ' + C.line2 + ';}',
    // ── Ряд 1: период · «Считать» · свежесть ──
    P + '-strip{display:flex;align-items:center;flex-wrap:nowrap;gap:8px;width:100%;min-width:0;}',
    P + '-strip-seg{display:inline-flex;align-items:center;gap:2px;background:' + C.bgAlt + ';border-radius:9px;padding:2px;flex:0 0 auto;}',
    P + '-strip-seg button{border:0;background:transparent;border-radius:7px;height:30px;padding:0 12px;font:inherit;font-size:12px;'
      + 'font-weight:400;color:' + C.mut + ';cursor:pointer;white-space:nowrap;}',
    P + '-strip-seg button.on{background:#fff;color:' + C.ink + ';box-shadow:0 1px 2px rgba(20,28,45,.12);font-weight:700;}',   // активное — жирным (09.10)
    P + '-sep{width:1px;height:20px;background:' + C.line + ';margin:0 4px;flex:0 0 auto;}',
    P + '-lbl{font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:' + C.mut + ';font-weight:400;flex:0 0 auto;}',
    P + '-togs{display:inline-flex;gap:6px;flex:0 1 auto;min-width:0;}',
    P + '-tog{position:relative;display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 11px 0 8px;border:1px solid ' + C.line + ';border-radius:9px;background:#fff;font-size:12px;color:' + C.ink2 + ';cursor:pointer;user-select:none;white-space:nowrap;}',
    P + '-tog:hover{border-color:#d3d8e0;}',
    P + '-tog input{position:absolute;opacity:0;width:0;height:0;margin:0;}',
    P + '-tog i{position:relative;width:26px;height:15px;border-radius:999px;background:#dfe3ea;flex:0 0 auto;transition:background .15s;}',
    P + '-tog i:after{content:\'\';position:absolute;top:2px;left:2px;width:11px;height:11px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(20,28,45,.2);transition:transform .15s;}',
    P + '-tog.on i{background:' + C.act + ';}',
    P + '-tog.on i:after{transform:translateX(11px);}',
    P + '-tog.dev{border-color:' + C.actLine + ';background:' + C.blueBg + ';}',
    P + '-tog:focus-within{outline:2px solid ' + C.actLine + ';outline-offset:1px;}',
    P + '-fresh{font-size:11.5px;color:' + C.mut + ';display:inline-flex;align-items:center;gap:7px;white-space:nowrap;flex:0 0 auto;}',
    P + '-fresh b{color:' + C.ink2 + ';font-weight:400;}',
    P + '-fresh i{width:7px;height:7px;border-radius:50%;background:' + C.green + ';display:inline-block;}',
    P + '-fresh i.late{background:#f0a020;}',
    P + '-fresh i.na{background:#c4c8d0;}',
    // ── Ряд 2: «Целевая аудитория» ──
    P + '-bar{display:flex;align-items:center;flex-wrap:nowrap;gap:6px;width:100%;min-width:0;border-top:1px solid ' + C.line2 + ';padding-top:8px;}',
    P + '-ttl{display:flex;flex-direction:column;gap:2px;margin-right:8px;flex:0 1 310px;min-width:170px;}',
    P + '-ttl b{display:flex;align-items:center;gap:7px;font-size:13px;color:' + C.ink + ';font-weight:700;white-space:nowrap;}',
    P + '-ttl b em{font-style:normal;font-size:10.5px;font-weight:400;color:' + C.mut + ';background:' + C.line2 + ';border-radius:999px;padding:1px 7px;}',
    P + '-ttl b em.cond{color:' + C.actInk + ';background:' + C.blueBg + ';}',
    P + '-ttl b em.pend{color:' + C.warnTx + ';background:' + C.warnBg + ';box-shadow:inset 0 0 0 1px ' + C.warnLine + ';}',
    P + '-ttl span{font-size:11px;color:' + C.mut + ';line-height:1.3;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}',
    P + '-cf{display:inline-flex;align-items:center;gap:5px;height:32px;flex:0 1 auto;min-width:0;max-width:220px;border:1px solid ' + C.line + ';background:#fff;border-radius:9px;padding:0 9px 0 11px;cursor:pointer;font:inherit;font-size:12.5px;color:' + C.ink2 + ';}',
    P + '-cf:hover{border-color:#d3d8e0;}',
    P + '-cf.open{border-color:' + C.act + ';}',
    P + '-cf.on{background:' + C.blueBg + ';border-color:' + C.actLine + ';}',
    P + '-cf-l{color:' + C.ink2 + ';flex:0 0 auto;white-space:nowrap;}',
    P + '-cf-v{color:' + C.ink + ';font-weight:400;min-width:0;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    P + '-cf.on ' + P + '-cf-v{color:' + C.actInk + ';font-weight:700;}',
    P + '-cf-car{color:' + C.mut + ';font-size:10px;flex:0 0 auto;}',
    P + '-cf.on{padding-right:4px;}',
    P + '-cf.on ' + P + '-cf-l{color:' + C.actInk + ';font-weight:400;}',
    P + '-cf-n{flex:0 0 auto;min-width:18px;height:18px;border-radius:999px;background:' + C.act + ';color:#fff;font-size:10.5px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;padding:0 5px;}',
    P + '-cf-x{flex:0 0 auto;width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:' + C.actInk + ';font-size:14px;line-height:1;}',
    P + '-cf-x:hover{background:rgba(36,95,212,.14);}',
    P + '-sel{display:flex;flex-wrap:wrap;gap:5px;max-height:64px;overflow:auto;flex:0 0 auto;}',
    P + '-chip{display:inline-flex;align-items:center;gap:3px;max-width:100%;height:24px;padding:0 3px 0 9px;border-radius:999px;background:' + C.blueBg + ';color:' + C.actInk + ';font-size:11.5px;font-weight:400;}',
    P + '-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    P + '-chip button{border:0;background:transparent;color:' + C.actInk + ';cursor:pointer;font:inherit;font-size:13px;width:18px;height:18px;border-radius:50%;padding:0;}',
    P + '-chip button:hover{background:rgba(36,95,212,.14);}',
    P + '-sp{flex:1 1 0;min-width:4px;}',
    P + '-cnt{font-size:12px;color:' + C.mut + ';white-space:nowrap;flex:0 0 auto;}',
    P + '-cnt b{color:' + C.ink + ';font-weight:700;font-variant-numeric:tabular-nums;}',
    P + '-btn{display:inline-flex;align-items:center;flex:0 0 auto;height:32px;border:1px solid transparent;background:transparent;border-radius:9px;padding:0 12px;cursor:pointer;font:inherit;font-size:12.5px;color:' + C.act + ';white-space:nowrap;}',
    P + '-btn:hover{background:' + C.blueBg + ';}',
    P + '-btn.primary{background:' + C.act + ';color:#fff;border-color:' + C.act + ';font-weight:400;}',
    P + '-btn.primary:hover{background:' + C.actInk + ';}',
    P + '-btn.sm{height:28px;padding:0 10px;font-size:12px;}',
    P + '-btn[disabled]{opacity:.45;cursor:default;}',
    // Тур «Как работать» (ведёт каталог): затемнение вокруг цели и рамка — в body, как подсказка.
    P + '-tour{display:none;}',
    P + '-tb{position:fixed;left:0;top:0;width:0;height:0;z-index:99990;background:rgba(17,24,39,.55);transition:left .2s,top .2s,width .2s,height .2s;}',
    P + '-tb[data-tb="h"]{background:transparent;cursor:default;}',
    P + '-tring{position:fixed;z-index:99991;border-radius:10px;box-shadow:0 0 0 2px #245FD4,0 0 0 6px rgba(43,108,255,.22);pointer-events:none;transition:left .2s,top .2s,width .2s,height .2s,opacity .2s;}',
    P + '-tnoa *{transition:none !important;}',
    P + '-help{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;height:28px;margin-left:12px;padding:0 11px;border:1px solid ' + C.line + ';border-radius:999px;background:#fff;color:' + C.ink2 + ';font:inherit;font-size:12px;font-weight:400;cursor:pointer;white-space:nowrap;}',
    P + '-help:hover{border-color:' + C.act + ';color:' + C.act + ';}',
    P + '-help i{font-style:normal;display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;border:1.5px solid currentColor;font-size:10px;font-weight:700;}',
    // ── Выпадашка (в body iframe, position:fixed) ──
    // border-box: maxHeight из placeDd — вся высота с отступами (иначе +22 px и низ резался краем iframe, 2026-09-30)
    P + '-dd{position:fixed;z-index:9000;box-sizing:border-box;background:#fff;border:1px solid ' + C.line + ';border-radius:10px;box-shadow:0 10px 28px rgba(20,30,50,.18);'
      + 'padding:10px;display:flex;flex-direction:column;gap:8px;font-family:' + CFG.fonts.family + ';font-size:12.5px;color:' + C.ink2 + ';}',
    P + '-dd-h{display:flex;align-items:baseline;gap:8px;flex:0 0 auto;}',
    P + '-dd-h b{font-size:12.5px;font-weight:700;color:' + C.ink + ';}',
    P + '-dd-h span{font-size:11px;color:' + C.mut + ';}',
    P + '-psearch{position:relative;color:' + C.mut + ';flex:0 0 auto;}',
    P + '-psearch input{width:100%;height:32px;border:1px solid ' + C.line + ';background:#fff;border-radius:999px;padding:0 12px 0 30px;font-size:12.5px;color:' + C.ink + ';font-family:inherit;}',
    P + '-psearch input:focus{outline:none;border-color:' + C.act + ';}',
    P + '-psearch svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);pointer-events:none;}',
    P + '-note{font-size:11px;color:' + C.mut + ';line-height:1.4;flex:0 0 auto;}',
    P + '-list{flex:1 1 auto;min-height:60px;overflow:auto;display:flex;flex-direction:column;}',
    P + '-row{display:flex;align-items:center;gap:8px;min-height:28px;padding:2px 4px;border-radius:6px;cursor:pointer;color:' + C.ink2 + ';}',
    P + '-row:hover{background:#f6f8fa;}',
    P + '-row input{accent-color:' + C.act + ';margin:0;flex:0 0 auto;}',
    P + '-row span{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    P + '-row span small{display:block;font-size:10.5px;color:' + C.mut + ';overflow:hidden;text-overflow:ellipsis;}',
    P + '-row i{font-style:normal;color:' + C.mut + ';font-size:11.5px;font-variant-numeric:tabular-nums;flex:0 0 auto;}',
    P + '-row.z{color:' + C.mut2 + ';}',
    P + '-row.z i{color:#c4c8cf;}',
    P + '-row.on{background:' + C.blueBg + ';font-weight:700;}',
    P + '-row.d1{padding-left:22px;}' + P + '-row.d2{padding-left:40px;}' + P + '-row.d3{padding-left:58px;}' + P + '-row.d4{padding-left:76px;}',
    P + '-car{flex:0 0 20px;height:22px;border:0;background:transparent;cursor:pointer;color:' + C.mut + ';font-size:11px;border-radius:5px;padding:0;}',
    P + '-car:hover{background:#eef1f5;color:' + C.ink + ';}',
    P + '-car.sp{cursor:default;background:transparent;}',
    // заглушка вместо каретки — тоже span: без этого правило «-row span {flex:1}» растягивало её на полстроки,
    // и в поиске (там у всех строк заглушка) список съезжал вправо
    P + '-row ' + P + '-car.sp{flex:0 0 20px;}',
    P + '-empty{font-size:11.5px;color:' + C.mut + ';padding:6px 4px;}',
    P + '-dd-f{display:flex;flex:0 0 auto;align-items:center;gap:6px;border-top:1px solid ' + C.line2 + ';padding-top:8px;}',
    P + '-dd-f em{font-style:normal;flex:1;font-size:11.5px;color:' + C.mut + ';}',
    P + '-dd-f em b{color:' + C.ink + ';font-weight:700;}',
    '</style>'
  ].join('');
}

function searchBoxHtml(k, ph) {
  return '<div class="' + CFG.ns + '-psearch">' +
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
    '<input type="search" data-search="' + esc(k) + '" placeholder="' + esc(ph) + '" value="' + esc(state.q[k] || '') + '"></div>';
}
function rowHtml(attr, val, checked, label, n, extra) {
  var N = CFG.ns;
  // n === null — без числа (AD-группы: численности групп не показываем)
  return '<label class="' + N + '-row' + (n || n === null ? '' : ' z') + (extra || '') + '"><input type="checkbox" ' + attr + '="' + esc(val) + '"' + (checked ? ' checked' : '') + '>' +
    '<span>' + label + '</span>' + (n === null ? '' : '<i>' + nf(n) + '</i>') + '</label>';
}
function orgRows() {
  var d = state.draft, f = caFacet(d), q = (state.q.org || '').toLowerCase(), out = [], N = CFG.ns;
  var chosen = function (path) { for (var i = 0; i < d.org.length; i++) if (orgUnder(path, d.org[i])) return d.org[i]; return null; };
  // Нули не показываем: узел, где под остальными условиями никого, скрыт — кроме выбранного
  // (и узлов на пути к выбранному), чтобы галочку можно было снять.
  var live = function (path) {
    if (f.org[path]) return true;
    for (var i = 0; i < d.org.length; i++) if (orgUnder(d.org[i], path)) return true;
    return false;
  };
  var byN = function (x, y) { return ((f.org[y] || 0) - (f.org[x] || 0)) || ((MODEL.staffBy.org[y] || 0) - (MODEL.staffBy.org[x] || 0)); };
  var row = function (path, depth, sub, kids) {
    var ch = chosen(path), self = ch === path, open = !!state.openNodes[path], n = f.org[path] || 0;
    return '<div class="' + N + '-row d' + Math.min(depth, 4) + (self ? ' on' : '') + (n ? '' : ' z') + '">' +
      (kids && !q ? '<button type="button" class="' + N + '-car" data-catog="' + esc(path) + '" aria-label="' + (open ? 'Свернуть' : 'Раскрыть') + '">' + (open ? '▾' : '▸') + '</button>' : '<span class="' + N + '-car sp"></span>') +
      '<input type="checkbox" data-cack="' + esc('org|' + path) + '"' + (ch ? ' checked' : '') + (ch && !self ? ' disabled' : '') + '>' +
      '<span data-cacklbl="' + esc('org|' + path) + '">' + esc(orgShort(path)) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span><i>' + nf(n) + '</i></div>';
  };
  if (q) {
    var all = [], walk = function (par) { var ks = MODEL.orgKids[par] || []; for (var i = 0; i < ks.length; i++) { all.push(ks[i]); walk(ks[i]); } };
    walk('');
    all = all.filter(function (x) { return live(x) && orgShort(x).toLowerCase().indexOf(q) >= 0; }).sort(byN);
    for (var a = 0; a < all.length && a < CFG.listMax; a++) {
      var nm = orgParts(all[a]);
      out.push(row(all[a], 0, 'УС-' + (nm.length + 2) + (nm.length > 1 ? ' · ' + nm.slice(0, -1).join(CFG.orgSep) : ''), false));
    }
    return out.length ? out.join('') : '<div class="' + N + '-empty">Ничего не найдено</div>';
  }
  var tree = function (par, depth) {
    var ks = (MODEL.orgKids[par] || []).filter(live).sort(byN);
    for (var i = 0; i < ks.length; i++) {
      var kids = (MODEL.orgKids[ks[i]] || []).filter(live).length > 0;
      out.push(row(ks[i], depth, '', kids));
      if (kids && state.openNodes[ks[i]]) tree(ks[i], depth + 1);
    }
  };
  tree('', 0);
  return out.join('') || '<div class="' + CFG.ns + '-empty">' + (MODEL.units.length ? 'Под выбранными условиями никого' : CFG.text.noData) + '</div>';
}
function valueRows(kind) {
  var d = state.draft, f = caFacet(d), q = (state.q[kind] || '').toLowerCase(), src = MODEL.staffBy[kind] || {}, opts = [], k, h = '';
  for (k in src) if (Object.prototype.hasOwnProperty.call(src, k) && (!q || dash(k).toLowerCase().indexOf(q) >= 0) && (f[kind][k] || d[kind].indexOf(k) >= 0)) opts.push({ v: k, n: f[kind][k] || 0, all: src[k] });
  opts.sort(function (a, b) { return (b.n - a.n) || (b.all - a.all); });
  for (var i = 0; i < opts.length && i < CFG.listMax; i++) h += rowHtml('data-cack', kind + '|' + opts[i].v, d[kind].indexOf(opts[i].v) >= 0, esc(dash(opts[i].v)), opts[i].n);
  if (opts.length > CFG.listMax) h += '<div class="' + CFG.ns + '-empty">и ещё ' + nf(opts.length - CFG.listMax) + ' — уточни поиск</div>';
  return h || '<div class="' + CFG.ns + '-empty">' + (q ? 'Ничего не найдено' : 'Под выбранными условиями никого') + '</div>';
}
function headRows() {
  var d = state.draft, f = caFacet(d), N = CFG.ns, h = '';
  var hs = [{ v: '', l: 'Все', n: f.heads['1'] + f.heads.n }, { v: '1', l: 'Только руководители', n: f.heads['1'] }, { v: 'n', l: 'Без руководителей', n: f.heads.n }];
  for (var i = 0; i < hs.length; i++) {
    if (!hs[i].n && d.heads !== hs[i].v) continue;           // нули не показываем
    h += '<label class="' + N + '-row' + (hs[i].n ? '' : ' z') + '"><input type="radio" name="' + N + '-head" data-cahead="' + hs[i].v + '"' + (d.heads === hs[i].v ? ' checked' : '') + '>' +
      '<span>' + hs[i].l + '</span><i>' + nf(hs[i].n) + '</i></label>';
  }
  return h;
}
function adgRows() {
  var d = state.draft, f = caFacet(d), q = (state.q.adg || '').toLowerCase(), out = [], i;
  // Числа у групп нет (владелец 2026-09-30: составов групп в шапке нет — сколько людей, считает сервер после «Применить»).
  // Старый датасет с наборами групп (adgExact) — число, как у прочих списков.
  var cnt = function (g) { return MODEL.adgExact ? (f.adg[g.name] || 0) : null; };
  var list = MODEL.adg.filter(function (g) {
    var sel = d.adg.indexOf(g.name) >= 0;
    return (sel || !MODEL.adgExact || cnt(g) > 0) && (!q || sel || g.name.toLowerCase().indexOf(q) >= 0);
  });
  list.sort(function (a, b) {
    var sa = d.adg.indexOf(a.name) >= 0, sb = d.adg.indexOf(b.name) >= 0;
    return sa !== sb ? (sa ? -1 : 1) : (MODEL.adgExact ? cnt(b) - cnt(a) : 0) || (a.name < b.name ? -1 : 1);
  });
  for (i = 0; i < list.length && i < CFG.listMax; i++) out.push(rowHtml('data-cack', 'adg|' + list[i].name, d.adg.indexOf(list[i].name) >= 0, esc(list[i].name), cnt(list[i])));
  if (!out.length) return '<div class="' + CFG.ns + '-empty">' + (MODEL.adg.length ? 'Ничего не найдено' : 'Список групп пуст — нет таблицы pa_adg_size') + '</div>';
  if (list.length > CFG.listMax) out.push('<div class="' + CFG.ns + '-empty">и ещё ' + nf(list.length - CFG.listMax) + ' — уточни поиск</div>');
  return out.join('');
}
// Выбранные значения условия — чипами с × над списком (видно всё выбранное, даже если в списке не найти).
function selChips(k) {
  var d = state.draft, N = CFG.ns, pk = picked(d, k), raw = k === 'heads' ? [d.heads] : d[k], h = '';
  for (var i = 0; i < pk.length; i++) {
    h += '<span class="' + N + '-chip"' + (k === 'org' ? ' title="' + esc(raw[i]) + '"' : '') + '><span>' + esc(pk[i]) + '</span>' +
      '<button type="button" data-caun1="' + esc(k + '|' + raw[i]) + '" aria-label="Убрать">×</button></span>';
  }
  return h;
}
function rowsOf(k) { return k === 'org' ? orgRows() : k === 'adg' ? adgRows() : k === 'heads' ? headRows() : valueRows(k); }
function kindCfg(k) { for (var i = 0; i < CFG.kinds.length; i++) if (CFG.kinds[i].k === k) return CFG.kinds[i]; return null; }
// Содержимое выпадашки открытого условия (узел — в body, см. БЛОК 6).
function ddHtml() {
  var o = kindCfg(state.dd), d = state.draft, N = CFG.ns, f = caFacet(d);
  if (!o) return '';
  var pk = picked(d, o.k);
  return '<div class="' + N + '-dd-h"><b>' + esc(o.l) + '</b><span>' + (o.k === 'adg' && !MODEL.adgExact
      ? 'по алфавиту · поиск по имени'
      : 'число — сколько сотрудников пройдут остальные условия') + '</span></div>' +
    (pk.length ? '<div class="' + N + '-sel">' + selChips(o.k) + '</div>' : '') +
    (o.q ? searchBoxHtml(o.k, o.ph) : '') +
    (o.k === 'adg' ? '<div class="' + N + '-note">' + (MODEL.adgExact
      ? 'Сотрудник в ЦА, если состоит хотя бы в одной из выбранных групп.'
      : 'Сотрудник в ЦА, если состоит хотя бы в одной из выбранных групп. Сколько таких людей — посчитается после «Применить» (панель, «Охват ЦА»).') + '</div>' : '') +
    '<div class="' + N + '-list" data-calist="' + o.k + '">' + rowsOf(o.k) + '</div>' +
    '<div class="' + N + '-dd-f"><em>' + (d.adg.length && !MODEL.adgExact ? 'В ЦА — после «Применить»' : 'В ЦА <b>' + ppl(f.n) + '</b>') + '</em>' +
      '<button type="button" class="' + N + '-btn sm" data-caun="' + o.k + '"' + (pk.length ? '' : ' disabled') + '>Сбросить</button>' +
      '<button type="button" class="' + N + '-btn primary sm" data-cadd="' + o.k + '">Готово</button></div>';
}
// Только конкатенация строк. Все данные через esc().
function buildHTML() {
  var N = CFG.ns, d = state.draft, a = state.applied, f = caFacet(d), h = [];
  var pend = !caSame(d, a), on = caAttrsOn(d);
  h.push('<div class="' + N + '-root">');
  // Ряд 1 — период и опции (как прежняя шапка).
  h.push('<div class="' + N + '-strip"><div class="' + N + '-strip-seg" role="group" aria-label="Период">');
  for (var gi = 0; gi < CFG.grains.length; gi++) {
    var gr = CFG.grains[gi];
    h.push('<button type="button" data-grain="' + esc(gr.id) + '"' + (gr.id === state.grain ? ' class="on"' : '') + '>' + esc(gr.label) + '</button>');
  }
  h.push('</div><span class="' + N + '-sep" aria-hidden="true"></span><span class="' + N + '-lbl"' +
    tip({ title: 'Что считать', text: 'Какие отчёты и просмотры попадают во все числа борда: каталог, KPI, динамику и списки людей.' }) + '>Считать</span>');
  h.push('<div class="' + N + '-togs" role="group" aria-label="Какие отчёты и просмотры считать">');
  for (var si = 0; si < CFG.switches.length; si++) {
    var sw = CFG.switches[si], son = !!state.sw[sw.key];
    h.push('<label class="' + N + '-tog' + (son ? ' on' : '') + (son !== sw.def ? ' dev' : '') + '" aria-label="' + esc(sw.label) + '"' +
      tip({ title: sw.label, text: sw.hint, rows: [{ label: 'Сейчас', value: son ? 'включено' : 'выключено — ' + sw.off }],
        note: son !== sw.def ? 'Отличается от умолчания' : '' }) + '>' +
      '<input type="checkbox" data-f="' + esc(sw.key) + '"' + (son ? ' checked' : '') + '><i aria-hidden="true"></i>' + esc(sw.short) + '</label>');
  }
  h.push('</div><span class="' + N + '-sp"></span>' + freshHtml(MODEL.md, N) +
    // «Как работать»: тур по листу ведёт каталог (PA_TOUR_GO) — шапка, каталог и панель по шагам
    '<button type="button" class="' + N + '-help" data-tourstart="1"' + tip({ title: 'Как работать', text: 'Короткий тур по листу: что где и как пользоваться — шапка, каталог и панель справа по шагам.' }) +
    '><i aria-hidden="true">?</i>Как работать</button></div>');
  // Ряд 2 — «Целевая аудитория».
  h.push('<div class="' + N + '-bar">');
  // Слева — что это за строка и в каком состоянии ЦА.
  var st = pend ? '<em class="pend">не применено</em>' : '<em' + (caAttrsOn(a) ? ' class="cond">по условиям' : '>по правам доступа') + '</em>';
  h.push('<div class="' + N + '-ttl"><b>Целевая аудитория' + st + '</b><span>настройка для углублённого анализа: кого из сотрудников с AD-логином считаем аудиторией отчётов</span></div>');
  // Пилюля условия: пусто — название; одно значение — само значение (без названия);
  // несколько — название и счётчик. × снимает условие, клик по пилюле открывает выпадашку.
  for (var i = 0; i < CFG.kinds.length; i++) {
    var o = CFG.kinds[i], pk = picked(d, o.k), op = state.dd === o.k;
    var body = !pk.length ? '<span class="' + N + '-cf-l">' + esc(o.l) + '</span>'
      : pk.length === 1 ? '<span class="' + N + '-cf-v">' + esc(pk[0]) + '</span>'
      : '<span class="' + N + '-cf-l">' + esc(o.l) + '</span><span class="' + N + '-cf-n">' + pk.length + '</span>';
    h.push('<button type="button" class="' + N + '-cf' + (op ? ' open' : '') + (pk.length ? ' on' : '') + '" data-cadd="' + o.k + '" aria-expanded="' + op + '"' +
      ' aria-label="' + esc(o.l + (pk.length ? ': ' + pk.join(', ') : '')) + '">' + body +
      (pk.length ? '<span class="' + N + '-cf-x" data-caclr="' + o.k + '" aria-label="Снять условие">×</span>' : '<span class="' + N + '-cf-car">▾</span>') + '</button>');
  }
  h.push('<span class="' + N + '-sp"></span>');
  h.push('<span class="' + N + '-cnt">' + (on ? (d.adg.length && !MODEL.adgExact ? 'в ЦА — после «Применить»' : 'в ЦА <b>' + nf(f.n) + '</b>') : 'сотрудников <b>' + nf(MODEL.staff) + '</b>') + '</span>');
  h.push('<button type="button" class="' + N + '-btn" data-careset="1"' + (on || caAttrsOn(a) ? '' : ' disabled') + ' aria-label="Сбросить условия: ЦА «как роздан доступ»">Сбросить</button>');
  h.push('<button type="button" class="' + N + '-btn primary" data-caapply="1"' + (!pend || (on && !f.n) ? ' disabled' : '') + '>Применить</button>');
  h.push('</div></div>');
  return buildCSS() + h.join('');
}

// ---------- БЛОК 6: МОНТАЖ + ИНТЕРАКТИВ ----------
// ---------- СВЕРКА ФИЛЬТРОВ МЕЖДУ ЧАРТАМИ (2026-09-29) ----------
// Любой чарт-источник кросс-фильтра (шапка, каталог, «Кто смотрит», строка ЦА) при изменении сразу
// сообщает соседним iframe борда ключ своего фильтра (PA_SEL: src, sheet, cols, key) — напрямую, без
// Proteus. Чарт-получатель сверяет ключи своих источников с эхом фильтров в СВОЁМ ответе (flt): пока не
// совпало — приглушён; не совпало после ответа — сам просит источник переотправить (PA_RESEND, фильтр
// с меткой pa_nonce → Proteus перезапрашивает), не больше CFG.selMaxTries раз; дальше — кнопка.
// Ключ: колонки по алфавиту, значения отсортированы, «"», «\» и переводы строк выкинуты (так же в SQL).
function paVals(a) {
  var o = [];
  for (var i = 0; i < (a || []).length; i++) { var v = String(a[i]).replace(/["\\\n\r]/g, ''); if (v !== '') o.push(v); }
  o.sort();
  return o;
}
function paKey(cols, get) {
  var c = cols.slice().sort(), out = [];
  for (var i = 0; i < c.length; i++) out.push(c[i] + '=' + paVals(get(c[i])).join(','));
  return out.join(';');
}
function paMaskGet(fl) {
  return function (c) { for (var i = 0; i < fl.length; i++) if (fl[i].column === c) return fl[i].value || []; return []; };
}
// Рассылка всем iframe борда (обход от window.top; свой iframe пропускаем).
function paBcast(msg) {
  try {
    (function walk(w, d) {
      if (d > 5) return;
      for (var i = 0; i < w.frames.length; i++) {
        var f = w.frames[i];
        if (f !== window) { try { f.postMessage(msg, '*'); } catch (e) { /* чужой фрейм */ } }
        try { walk(f, d + 1); } catch (e2) { /* нет доступа к вложенным */ }
      }
    })(window.top, 0);
  } catch (e) { /* нет window.top — стенд без родителя */ }
}

// Источник: сообщить новый ключ фильтра и отвечать на «повтори» (фильтр + метка pa_nonce: колонки нет
// ни в одном датасете, фильтр ей игнорируется, но маска другая — Proteus перезапрашивает чарты).
function paOut(src, sheet, cols, fl) { paBcast({ type: 'PA_SEL', src: src, sheet: sheet, cols: cols, key: paKey(cols, paMaskGet(fl)) }); }
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
      + 'z-index:10;overflow:hidden;box-sizing:border-box;background:' + CFG.colors.bg + ';';
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(overlay);

    // ── ТУЛТИП ── (создаётся один раз, живёт в body)
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
      // iframe ещё не развернулся под подсказку (маркер tipMark ушёл, родитель не успел): не ставить её сверху —
      // она прыгала вниз после разворота (фидбек 2026-10-09). Ждём resize невидимой; не дождались за 300 мс — как есть.
      if (top + t.height > window.innerHeight - pad && state.sig === 'tip' && !state.tipLate) {
        tip.style.opacity = '0';
        clearTimeout(state.tipW);
        state.tipW = setTimeout(function () { state.tipLate = true; renderTip(); state.tipLate = false; }, 300);
        return;
      }
      clearTimeout(state.tipW);
      if (top + t.height > window.innerHeight - pad) top = rect.top - t.height - gap;
      left = Math.max(pad, Math.min(left, window.innerWidth - t.width - pad));
      top = Math.max(pad, Math.min(top, window.innerHeight - t.height - pad));
      tip.style.left = Math.round(left) + 'px';
      tip.style.top = Math.round(top) + 'px';
      tip.style.opacity = '1';
    }
    function hideTip() {
      var tip = getTip();
      clearTimeout(state.tipW);
      tip.style.opacity = '0';
      tip.style.display = 'none';
    }
    function renderTip() {
      if (!state.tip || state.dd) { hideTip(); return; }
      showTip(state.tip.html || '', state.tip.rect);
    }

    // ── ВЫПАДАШКА ── один узел в body (position:fixed): overlay ограничен ячейкой,
    // а body iframe при открытии вырастает (CSS борда по маркеру) — места хватает.
    var ddEl = null;
    function getDd() {
      if (ddEl && ddEl.parentNode) return ddEl;
      var old = document.querySelector('body > .' + CFG.ns + '-dd');
      if (old) old.parentNode.removeChild(old);
      ddEl = document.createElement('div');
      ddEl.className = CFG.ns + '-dd';
      ddEl.style.display = 'none';
      document.body.appendChild(ddEl);
      // Клик внутри выпадашки помечается: пересборка отрывает цель от DOM, и проверка
      // «клик мимо» по предкам цели ошиблась бы.
      ddEl.addEventListener('click', function (e) { e.__pacaDd = true; onClick(e); });
      ddEl.addEventListener('input', onInput);
      return ddEl;
    }

    // Сигнал родителю через канал скриншотов: PNG 1×1, после IEND — маркер, выровненный
    // по 3-байтовой группе base64 (URL валиден, маркер виден в строке как есть).
    // kind: 'dd' — выпадашка ЦА (разворот 640 px), 'tip' — подсказка (260 px), false — свернуть.
    function pngUrl(kind) {
      var b = CFG.overlay.png;
      if (kind) {
        var raw = atob(b);
        while (raw.length % 3) raw += '\0';
        b = btoa(raw + atob(kind === 'tip' ? CFG.overlay.tipMark : kind === 'tour' ? CFG.overlay.tourMark : CFG.overlay.mark));
      }
      return 'data:image/png;base64,' + b;
    }
    function signal(kind) {
      var open = !!kind;
      if (open && !state.sig && !state.pin) state.baseH = overlay.clientHeight || state.baseH;
      state.sig = kind || false;
      var url = pngUrl(kind);
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'ECHARTS_UPDATE_DATA_URL', dataUrl: url, payload: { dataUrl: url } }, '*');
        }
      } catch (e) { /* нет родителя (стенд) — выпадашка просто остаётся в ячейке */ }
      // Прозрачность вне строки: развёрнутый iframe не должен закрывать чарты ниже белым.
      var tr = open ? 'transparent' : '';
      document.documentElement.style.background = tr;
      document.body.style.background = tr;
      host.style.background = tr;
      overlay.style.background = open ? 'transparent' : CFG.colors.bg;
      // Высота строки закреплена, пока iframe развёрнут. При закрытии родитель сжимает iframe не сразу
      // (новый маркер → CSS борда): если отпустить высоту сразу, строка на кадр центрируется по 640 px
      // и дёргается вниз-вверх. Отпускаем, когда окно iframe действительно вернулось к высоте строки.
      if (open || (state.baseH && window.innerHeight > state.baseH + 4)) {
        overlay.style.height = state.baseH ? state.baseH + 'px' : '100%';
        state.pin = !open && !!state.baseH;
      } else { overlay.style.height = '100%'; state.pin = false; }
    }
    // Тур: только маркер для CSS борда (затемнить швы и поля страницы между чартами) — без разворота iframe и смены фона.
    function tourSig(on) {
      var url = pngUrl(on ? 'tour' : false);
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'ECHARTS_UPDATE_DATA_URL', dataUrl: url, payload: { dataUrl: url } }, '*');
        }
      } catch (e) { /* нет родителя (стенд) */ }
    }
    function unpinIfShrunk() {
      if (state.pin && !state.sig && window.innerHeight <= state.baseH + 4) { overlay.style.height = '100%'; state.pin = false; }
    }

    function placeDd() {
      var dd = getDd();
      if (!state.dd) { dd.style.display = 'none'; return; }
      var o = kindCfg(state.dd), btn = overlay.querySelector('[data-cadd="' + state.dd + '"]');
      var r = btn ? btn.getBoundingClientRect() : { left: 8, bottom: 40 };
      var w = Math.min(o.w, window.innerWidth - 16);
      var top = Math.round(r.bottom + 6);
      var left = Math.max(8, Math.min(Math.round(r.left), window.innerWidth - w - 8));
      dd.style.display = 'flex';
      dd.style.width = w + 'px';
      dd.style.left = left + 'px';
      dd.style.top = top + 'px';
      dd.style.maxHeight = Math.max(160, Math.min(520, window.innerHeight - top - 12)) + 'px';
    }
    function renderDd() {
      var dd = getDd();
      if (!state.dd) { dd.style.display = 'none'; dd.innerHTML = ''; return; }
      var ls = dd.querySelector('[data-calist]'), keep = ls && ls.getAttribute('data-calist') === state.dd ? ls.scrollTop : 0;
      dd.innerHTML = ddHtml();
      placeDd();
      ls = dd.querySelector('[data-calist]');
      if (ls && keep) ls.scrollTop = keep;
    }

    // render ТОЛЬКО пересобирает разметку. Делегированные обработчики — ОДИН РАЗ снаружи.
    function render() {
      overlay.innerHTML = buildHTML();
      renderDd();
      renderTip();
    }
    function openDd(k) {
      clearTimeout(state.tipT);
      state.dd = k;
      state.tip = null;
      hideTip();
      render();
      signal(k ? 'dd' : false);
      if (k) { var inp = getDd().querySelector('[data-search]'); if (inp) inp.focus(); }
    }

    function trigger(node, attr) {
      while (node && node !== overlay && node !== ddEl) {
        if (node.getAttribute && node.getAttribute(attr) !== null) return node;
        node = node.parentNode;
      }
      if (node && node.getAttribute && node.getAttribute(attr) !== null) return node;
      return null;
    }
    // Подсказка не помещается в плашку: на время показа iframe разворачивается вниз (маркер tipMark).
    // Закрытие — с задержкой: переход курсора между соседними переключателями не дёргает iframe.
    function tipClose() {
      clearTimeout(state.tipT);
      state.tipT = setTimeout(function () { if (!state.tip && state.sig === 'tip') signal(false); }, 160);
    }
    function onOver(e) {
      var el = trigger(e.target, 'data-tip');
      if (!el || state.dd) return;
      clearTimeout(state.tipT);
      if (!state.sig) signal('tip');
      state.tip = { rect: el.getBoundingClientRect(), kind: el.getAttribute('data-kind') || '', key: el.getAttribute('data-tip') || '', html: el.getAttribute('data-tip') || '' };
      renderTip();
    }
    function onOut(e) {
      var el = trigger(e.target, 'data-tip');
      if (!el) return;
      var to = e.relatedTarget;
      while (to) { if (to === el) return; to = to.parentNode; }
      state.tip = null;
      hideTip();
      tipClose();
    }
    // Одна маска на всё: период и опции + применённая ЦА. Сверке — двумя ключами (strip · ca).
    function fullMask() { return stripMask(state).concat(maskOf(state.applied)); }
    function paOutAll() {
      paOut('strip', '*', CFG.paColsStrip, stripMask(state));
      paOut('ca', 'aud', CFG.paCols, maskOf(state.applied));
    }
    function emit() {
      if (typeof applyCrossFilter !== 'function') return;
      paOutAll();
      applyCrossFilter(fullMask());
    }

    function onClick(e) {
      var d = state.draft;
      if (trigger(e.target, 'data-tourstart')) { if (state.dd) openDd(null); paBcast({ type: 'PA_TOUR_GO' }); return; }
      // Ряд 1: период — взаимоисключающий выбор; опция — браузер уже переключил input.checked до click.
      var gb = trigger(e.target, 'data-grain');
      if (gb) { state.grain = gb.getAttribute('data-grain'); render(); emit(); return; }
      var sb = trigger(e.target, 'data-f');
      if (sb && sb.tagName === 'INPUT') { state.sw[sb.getAttribute('data-f')] = sb.checked; render(); emit(); return; }
      // × на пилюле снимает условие целиком (черновик), выпадашку не открывает.
      var clr = trigger(e.target, 'data-caclr');
      if (clr) { var ck0 = clr.getAttribute('data-caclr'); if (ck0 === 'heads') d.heads = ''; else d[ck0] = []; render(); return; }
      var un1 = trigger(e.target, 'data-caun1');
      if (un1) {
        var uv1 = un1.getAttribute('data-caun1'), uk1 = uv1.split('|')[0], uval1 = uv1.slice(uk1.length + 1);
        if (uk1 === 'heads') d.heads = ''; else { var ui1 = d[uk1].indexOf(uval1); if (ui1 >= 0) d[uk1].splice(ui1, 1); }
        render();
        return;
      }
      var cdd = trigger(e.target, 'data-cadd');
      if (cdd) { var k = cdd.getAttribute('data-cadd'); openDd(state.dd === k ? null : k); return; }
      var ctg = trigger(e.target, 'data-catog');
      if (ctg) { var tk = ctg.getAttribute('data-catog'); if (state.openNodes[tk]) delete state.openNodes[tk]; else state.openNodes[tk] = true; renderDd(); return; }
      // Клик по названию узла дерева — как по галочке.
      var lbl = trigger(e.target, 'data-cacklbl');
      if (lbl) { var cb = lbl.parentNode.querySelector('input'); if (cb && !cb.disabled) cb.click(); return; }
      var cck = trigger(e.target, 'data-cack');
      if (cck && cck.tagName === 'INPUT') {
        var cv = cck.getAttribute('data-cack'), ck = cv.split('|')[0], cval = cv.slice(ck.length + 1), carr = d[ck], ci = carr.indexOf(cval);
        if (cck.checked && ci < 0) {
          carr.push(cval);
          // Узел выбран — его потомки лишние (узел = всё поддерево).
          if (ck === 'org') d.org = d.org.filter(function (x) { return x === cval || !orgUnder(x, cval); });
        }
        if (!cck.checked && ci >= 0) carr.splice(ci, 1);
        render();
        return;
      }
      var chd = trigger(e.target, 'data-cahead');
      if (chd && chd.tagName === 'INPUT') { d.heads = chd.getAttribute('data-cahead') || ''; render(); return; }
      var cun = trigger(e.target, 'data-caun');
      if (cun) { var uk = cun.getAttribute('data-caun'); if (uk === 'heads') d.heads = ''; else d[uk] = []; render(); return; }
      if (trigger(e.target, 'data-caapply')) {
        state.applied = caCopy(d);
        if (state.dd) openDd(null); else render();
        emit();
        return;
      }
      if (trigger(e.target, 'data-careset')) {
        state.draft = caEmpty(); state.applied = caEmpty();
        if (state.dd) openDd(null); else render();
        emit();
      }
    }
    // Поиск: пересобирается только список — фокус и каретка на месте.
    function onInput(e) {
      var inp = trigger(e.target, 'data-search');
      if (!inp) return;
      var k = inp.getAttribute('data-search');
      state.q[k] = inp.value || '';
      var box = getDd().querySelector('[data-calist]');
      if (box) box.innerHTML = rowsOf(k);
    }

    overlay.addEventListener('mouseover', onOver);
    overlay.addEventListener('mouseout', onOut);
    // Подсказки не залипают: курсор ушёл из чарта (быстрый выход без mouseout) или окно потеряло фокус.
    state.tipOff = function () { if (state.tip) { state.tip = null; hideTip(); } tipClose(); };
    overlay.addEventListener('mouseleave', function () { state.tipOff(); });
    if (!state.tipGuard) {
      state.tipGuard = true;
      document.addEventListener('mouseout', function (ev) { if (!ev.relatedTarget && state.tipOff) state.tipOff(); });
      window.addEventListener('blur', function () { if (state.tipOff) state.tipOff(); });
    }
    overlay.addEventListener('click', onClick);
    // «Повтори» от получателя — по любому из двух ключей: переотправляем всю маску (+ метка pa_nonce).
    if (state.onResend) window.removeEventListener('message', state.onResend);
    state.onResend = function (ev) {
      var md = ev.data || {};
      if (md.type !== 'PA_RESEND' || (md.src !== 'strip' && md.src !== 'ca') || typeof applyCrossFilter !== 'function') return;
      paOutAll();
      applyCrossFilter(fullMask().concat([{ column: 'pa_nonce', operator: 'IN', value: [String(Date.now())] }]));
    };
    window.addEventListener('message', state.onResend);
    getDd();

    // Глобальные слушатели переживают перезапуск скрипта — старые снимаем явно.
    if (state.onWinResize) window.removeEventListener('resize', state.onWinResize);
    // ── ТУР «КАК РАБОТАТЬ» (2026-10-07; движок — как в «Детальных списках») ── ведёт каталог, карточка — у него.
    // PA_TOUR {op}: dim — чарт затемнён целиком, show — затемнён вокруг цели key, off — слоя нет. Ответ PA_TOUR_AT
    // {from, key, ok, l, t, r, b}: где цель (колонки и ряд борда общие — стрелка карточки каталога смотрит туда же);
    // на dim — какие цели есть (keys). Клики под затемнением не проходят; Esc и стрелки уходят в каталог (PA_TOUR_KEY).
    var tourNode = null, TOUR_FROM = 'head', TOUR_T = { period: '.' + CFG.ns + '-strip-seg', opts: '.' + CFG.ns + '-togs', ca: '.' + CFG.ns + '-bar', help: '[data-tourstart]' };
    function tourTarget(key) {
      var s = TOUR_T[key], el = !s ? null : (typeof s === 'function' ? s() : overlay.querySelector(s));
      var q = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      return q && q.width > 0 && q.height > 0 ? el : null;
    }
    function tourLayer() {
      if (tourNode && tourNode.parentNode) return tourNode;
      var old = document.querySelector('body > .' + CFG.ns + '-tour');
      if (old) old.parentNode.removeChild(old);
      var P = CFG.ns, sides = ['t', 'b', 'l', 'r', 'h'], h = '';
      for (var i = 0; i < sides.length; i++) h += '<div class="' + P + '-tb" data-tb="' + sides[i] + '"></div>';
      tourNode = document.createElement('div');
      tourNode.className = P + '-tour';
      tourNode.innerHTML = h + '<div class="' + P + '-tring"></div>';
      document.body.appendChild(tourNode);
      return tourNode;
    }
    function tourBox(el, l, t, w, h, rad) {
      el.style.left = Math.round(l) + 'px'; el.style.top = Math.round(t) + 'px';
      el.style.width = Math.max(0, Math.round(w)) + 'px'; el.style.height = Math.max(0, Math.round(h)) + 'px';
      el.style.borderRadius = rad || '0';
    }
    function tourPos(report) {
      var t = state.tour;
      if (!t) { if (tourNode) tourNode.style.display = 'none'; return; }
      var L = tourLayer(), Q = function (k) { return L.querySelector('[data-tb="' + k + '"]'); };
      var ring = L.querySelector('.' + CFG.ns + '-tring'), W = window.innerWidth, H = window.innerHeight;
      var el = t.key ? tourTarget(t.key) : null, r = null;
      var fresh = L.style.display !== 'block';
      if (fresh) L.classList.add(CFG.ns + '-tnoa');
      L.style.display = 'block';
      if (el) {
        var u = el.getBoundingClientRect(), pd = typeof t.pad === 'number' ? t.pad : 6;
        r = { l: Math.max(0, u.left - pd), t: Math.max(0, u.top - pd), r: Math.min(W, u.right + pd), b: Math.min(H, u.bottom + pd) };
      }
      // цели нет — «дырка» схлопывается в точку на месте прошлой цели (шторки не разъезжаются в угол)
      var c = state.tourC || { x: W / 2, y: H / 2 }, h = r || { l: c.x, t: c.y, r: c.x, b: c.y };
      if (r) state.tourC = { x: (r.l + r.r) / 2, y: (r.t + r.b) / 2 };
      tourBox(Q('t'), 0, 0, W, h.t, '0');
      tourBox(Q('b'), 0, h.b, W, H - h.b, '0');
      tourBox(Q('l'), 0, h.t, h.l, h.b - h.t);
      tourBox(Q('r'), h.r, h.t, W - h.r, h.b - h.t);
      tourBox(Q('h'), h.l, h.t, h.r - h.l, h.b - h.t);
      tourBox(ring, h.l, h.t, h.r - h.l, h.b - h.t, '10px');
      ring.style.opacity = r ? '1' : '0';
      if (fresh) { void L.offsetWidth; L.classList.remove(CFG.ns + '-tnoa'); }
      if (report && t.key) paBcast({ type: 'PA_TOUR_AT', from: TOUR_FROM, key: t.key, ok: !!el, l: r ? r.l : 0, t: r ? r.t : 0, r: r ? r.r : 0, b: r ? r.b : 0 });
    }
    if (state.onTour) window.removeEventListener('message', state.onTour);
    state.onTour = function (ev) {
      var d = ev.data || {};
      if (d.type !== 'PA_TOUR' || !overlay.parentNode) return;
      if (d.op === 'off') { clearInterval(state.tourIv); state.tour = null; tourPos(); if (!state.sig) tourSig(false); return; }
      if (state.dd) openDd(null);
      if (state.tip) { state.tip = null; hideTip(); }
      clearTimeout(state.tipT);
      if (state.sig) signal(false);
      // маркер — сразу и повтором, пока тур идёт: скриншот платформы может затереть его в img в любой момент
      if (!state.tour) {
        tourSig(true);
        clearInterval(state.tourIv);
        state.tourIv = setInterval(function () { if (state.tour) tourSig(true); else clearInterval(state.tourIv); }, 1500);
      }
      var key = d.op === 'show' && String(d.key || '').indexOf(TOUR_FROM + ':') === 0 ? String(d.key).slice(TOUR_FROM.length + 1) : '';
      var el = key ? tourTarget(key) : null;
      state.tour = { key: key, pad: d.pad };
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
      tourPos(true);
      if (d.op === 'dim' && d.ask) {
        var ks = [];
        for (var k in TOUR_T) if (Object.prototype.hasOwnProperty.call(TOUR_T, k) && tourTarget(k)) ks.push(k);
        paBcast({ type: 'PA_TOUR_AT', from: TOUR_FROM, key: '', keys: ks });
      }
    };
    window.addEventListener('message', state.onTour);
    if (state.onTourKey) document.removeEventListener('keydown', state.onTourKey, true);
    state.onTourKey = function (ev) {
      if (!state.tour) return;
      var k = ev.keyCode || ev.which, a = k === 27 ? 'close' : k === 39 ? 'next' : k === 37 ? 'back' : '';
      if (!a) return;
      ev.preventDefault();
      ev.stopPropagation();
      paBcast({ type: 'PA_TOUR_KEY', k: a });
    };
    document.addEventListener('keydown', state.onTourKey, true);
    if (state.onTourRs) window.removeEventListener('resize', state.onTourRs);
    state.onTourRs = function () { if (state.tour) tourPos(true); };
    window.addEventListener('resize', state.onTourRs);
    state.onWinResize = function () { unpinIfShrunk(); placeDd(); if (state.tip) renderTip(); };
    window.addEventListener('resize', state.onWinResize);
    // Клик мимо выпадашки: внутри развёрнутого iframe — это клик по прозрачной части;
    // за пределами iframe — окно iframe теряет фокус (blur).
    if (state.onDocClick) document.removeEventListener('click', state.onDocClick);
    state.onDocClick = function (ev) {
      if (!state.dd || ev.__pacaDd) return;
      var n = ev.target;
      while (n && n !== document.body) {
        if (n === ddEl || (n.getAttribute && n.getAttribute('data-cadd') !== null)) return;
        n = n.parentNode;
      }
      openDd(null);
    };
    document.addEventListener('click', state.onDocClick);
    if (state.onBlur) window.removeEventListener('blur', state.onBlur);
    state.onBlur = function () {
      setTimeout(function () { if (state.dd && !document.hasFocus()) openDd(null); }, 150);
    };
    window.addEventListener('blur', state.onBlur);
    if (state.onDocKey) document.removeEventListener('keydown', state.onDocKey);
    state.onDocKey = function (ev) { if ((ev.key === 'Escape' || ev.keyCode === 27) && state.dd) openDd(null); };
    document.addEventListener('keydown', state.onDocKey);

    render();
    // Перезапуск скрипта (новый ответ датасета) при открытой выпадашке: настоящий
    // скриншот платформы мог затереть маркер — повторяем сигнал.
    if (state.dd) { signal('dd'); setTimeout(function () { if (state.dd) signal('dd'); }, 400); setTimeout(function () { if (state.dd) signal('dd'); }, 1500); }
    else if (state.sig) { state.tip = null; signal(false); }
    else if (state.tour) tourSig(true);

    // ResizeObserver только правит габариты. НЕ вызывать render() — зациклит.
    if (typeof ResizeObserver !== 'undefined') {
      if (state.ro && state.ro.disconnect) state.ro.disconnect();
      var ro = new ResizeObserver(function () {
        overlay.style.width = '100%';
        overlay.style.height = (state.sig || state.pin) && state.baseH ? state.baseH + 'px' : '100%';
        placeDd();
      });
      ro.observe(host);
      state.ro = ro;
    }
  } catch (e) {
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
option = {
  animation: false,
  xAxis: { show: false, type: 'value' },
  yAxis: { show: false, type: 'value' },
  series: [{ type: 'scatter', data: [] }]
};
