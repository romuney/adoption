// ============================================================================
// <NAME>.chart.js - болванка каркаса
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
// ВЫЧИСЛЕНИЯ ЖИВУТ ЗДЕСЬ, А НЕ В SQL. Проценты, дельты, ранги, накопительные
//   итоги, сортировка и форматирование считаются в buildModel() (БЛОК 3).
//   SQL отдаёт сырые строки — базу не нагружаем.
// ============================================================================

// ---------- БЛОК 1: CFG ----------
// fields - ТОЛЬКО реальные имена колонок из SQL пользователя.
// Нет поля в SQL - СПРОСИ, не выдумывай и не хардкодь значения.
// Все цвета/шрифты/отступы из макета — только здесь, не в разметке.
var CFG = {
  ns: 'paa',                  // ПРЕФИКС всех CSS-классов и класса overlay
  // 13 колонок датасета pa_aud (джиня-шаблон .pa_aud.sql / файл поставки).
  // Ответ: секция kpi (1 строка, nm = имя области) + cut-секции разрезов.
  fields: {
    section: 'section', cut_key: 'cut_key', cut_val: 'cut_val',
    parent: 'parent', nm: 'nm',
    users: 'users', users_prev: 'users_prev',
    views: 'views', views_prev: 'views_prev',
    new_users: 'new_users', regular_users: 'regular_users', once_users: 'once_users'
  },
  text: {
    noData: 'Аудитория без данных',
    noDataSub: 'Датасет pa_aud не отвечает (создайте его по SQL из поставки и ' +
      'поставьте чарт на него — карточки и разрезы появятся сами).'
  },
  mode: 'snapshot',
  // Порядок категорий — часть ТЗ (правило 15): разрезы «Кто смотрит»
  // идут в порядке полки/ов-вкладок, «Отчёты» — обратный ход, последняя.
  order: {
    section: ['kpi', 'cut'],
    cut_key: ['lvl3', 'lvl4', 'spec', 'stream', 'adg', 'heads', 'report']
  },
  grains: {
    d: { n: 30, unit: 'день', units: 'дней', label: 'за 30 дней', prev: true },
    w: { n: 20, unit: 'неделя', units: 'недель', label: 'за 20 недель', prev: true },
    m: { n: 12, unit: 'месяц', units: 'месяцев', label: 'за 12 месяцев', prev: false },
    q: { n: 8, unit: 'квартал', units: 'кварталов', label: 'за 8 кварталов', prev: false }
  },
  // Разрезы «Кто смотрит». emit — mode_param для эмиссии клика (когорты);
  // adg не эмитится: когортный словарь cut:adg не знает (NOTES §6).
  cuts: [
    { key: 'lvl3', label: 'УС-3', one: 'Подразделение' },
    { key: 'lvl4', label: 'УС-4', tree: true },
    { key: 'spec', label: 'Специализация' },
    { key: 'stream', label: 'Стрим' },
    { key: 'adg', label: 'AD-группа', noEmit: true },
    { key: 'heads', label: 'Тим-лиды', emit: 'cut:head' }
  ],
  repTab: { key: 'report', label: 'Отчёты', one: 'Отчёт' },
  areaAll: 'весь Proteus',
  prevWhy: 'В витрине 13 месяцев истории. Предыдущего периода такой же длины в ней нет, поэтому сравнивать не с чем.',
  colors: {
    // Раунд 6 (тело/когорты): канвас = цвет холста борда, блоки белые.
    bg: '#f6f6f6', card: '#fff', act: '#0073A0', actInk: '#015A7D',
    line: '#e7e9ee', muted: '#8a909c', ink: '#1f1f1f'
  },
  fonts: {
    family: 'Inter,-apple-system,"Segoe UI",Roboto,Arial,sans-serif'
  },
  spacing: {}
};

// ---------- БЛОК 2: ВХОД + СОСТОЯНИЕ + ХЕЛПЕРЫ ----------
// ВСЕ строки data, не data[0].
var rawData = (typeof data !== 'undefined' && Array.isArray(data)) ? data : [];

// Состояние переживает перерисовку Proteus.
// Область приходит в ОТВЕТЕ (kpi.nm), sel-маску виджет не читает —
// состояние только о том, что кликает пользователь здесь.
if (!window.__pvtState) window.__pvtState = {};
var __S = window.__pvtState;
if (!__S[CFG.ns]) __S[CFG.ns] = {
  tip: null, view: '',
  cut: 'lvl3',                 // открытый разрез «Кто смотрит»
  grain: 'd',                  // подпись периода (дефолт джини куба; маску чарт не читает)
  obsOpen: false               // раскрывашка «Что видно в данных»
};
var state = __S[CFG.ns];

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
// ЗДЕСЬ считается ВСЁ производное: доли, дельты, сортировка, дерево lvl4.
// SQL отдаёт сырые cut-строки и одну kpi-строку (nm = имя области).
function buildModel() {
  var F = CFG.fields;
  var kpi = null, byCut = {}, empty = !rawData.length;
  for (var i = 0; i < rawData.length; i++) {
    var r = rawData[i];
    var sec = String(r[F.section] || '');
    var key = String(r[F.cut_key] || '');
    if (sec === 'kpi' && !kpi) {
      kpi = {
        users: num(r[F.users]) || 0, users_prev: num(r[F.users_prev]) || 0,
        views: num(r[F.views]) || 0, views_prev: num(r[F.views_prev]) || 0,
        new_users: num(r[F.new_users]) || 0,
        regular_users: num(r[F.regular_users]) || 0,
        once_users: num(r[F.once_users]) || 0,
        area: String(r[F.nm] || '')
      };
      continue;
    }
    if (sec !== 'cut' || !key) continue;
    if (!byCut[key]) byCut[key] = [];
    byCut[key].push({
      val: String(r[F.cut_val] == null ? '' : r[F.cut_val]),
      parent: String(r[F.parent] == null ? '' : r[F.parent]),
      nm: String(r[F.nm] || r[F.cut_val] || ''),
      users: num(r[F.users]) || 0, users_prev: num(r[F.users_prev]) || 0,
      views: num(r[F.views]) || 0, views_prev: num(r[F.views_prev]) || 0,
      new_users: num(r[F.new_users]) || 0,
      regular_users: num(r[F.regular_users]) || 0,
      once_users: num(r[F.once_users]) || 0
    });
  }
  var total = kpi ? kpi.users : 0;
  // Сортировка строк — по зрителям (макет: unitRows.sort((a,b)=>b.aud-a.aud));
  // УС-4 дополнительно группируется в дерево по parent (блок → департаменты).
  for (var ck in byCut) {
    if (!Object.prototype.hasOwnProperty.call(byCut, ck)) continue;
    byCut[ck].sort(function (a, b) { return b.users - a.users || (a.val < b.val ? -1 : 1); });
    for (var j = 0; j < byCut[ck].length; j++) {
      byCut[ck][j].share = total ? byCut[ck][j].users / total * 100 : 0;
    }
  }
  // Дерево УС-4: blocks по parent, внутри — сортировка по users.
  var tree = null;
  if (byCut.lvl4) {
    tree = [];
    for (var t = 0; t < byCut.lvl4.length; t++) {
      var row = byCut.lvl4[t], blk = row.parent || row.val;
      var slot = null;
      for (var b = 0; b < tree.length; b++) if (tree[b].name === blk) { slot = tree[b]; break; }
      if (!slot) { slot = { name: blk, rows: [], users: 0 }; tree.push(slot); }
      slot.rows.push(row);
      slot.users += row.users;
    }
    tree.sort(function (a, b) { return b.users - a.users; });
  }
  // Обратный ход: топ-отчёты есть только при людской области (SQL-гейт).
  var hasReport = !!(byCut.report && byCut.report.length);
  return {
    empty: empty, kpi: kpi, cuts: byCut, tree: tree, hasReport: hasReport,
    area: kpi ? (kpi.area || CFG.areaAll) : CFG.areaAll
  };
}
var MODEL = buildModel();

// ---------- БЛОК 4: ФОРМАТИРОВАНИЕ И ЦВЕТ ----------
// Порт pa-reports-body (тот же типографский контракт: тонкий пробел,
// типографский минус, потолок веса 700).
var THIN = ' ';   // U+2009 thin space — разряды (типографика проекта)
var MINUS = '−';
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
// Подсказка: HTML-контракт макетного UI.tipHtml (ui.js 86–106).
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
  if (o.note) s += '<span class="' + CFG.ns + '-t-n">' + esc(o.note) + '</span>';
  return s;
}
function tip(o) { return ' data-tip="' + esc(tipHtml(o)) + '"'; }
// Пилюля изменения: знак — направление, класс — оценка (ui.js 149–163).
function delta(v, opts) {
  var o = opts || {};
  if (v == null || !isFinite(v)) {
    return '<span class="' + CFG.ns + '-nocmp"' + tip({ title: 'Сравнение', text: o.why || CFG.prevWhy }) + '>не сравнивается</span>';
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
    // Токены макета (app.css :root), scoped в корень; корень — flex-колонка
    // (раунд 6 тела): последний блок дотягивается до края ячейки, серого
    // хвоста нет, шов до соседнего чарта = гаттеру борда.
    P + '-root{width:100%;height:100%;box-sizing:border-box;display:flex;flex-direction:column;font-family:' + CFG.fonts.family + ';',
    '  --card:#fff;--line:#e7e9ee;--line2:#eef0f3;--bg:#f6f6f6;',
    '  --ink:#1f1f1f;--ink2:#3a3f4a;--muted:#8a909c;--muted2:#aab0bb;',
    '  --green:#12b048;--green-tx:#0a8f3c;--red:#f51f1f;--red-tx:#d11414;',
    '  --act:#0073A0;--act-ink:#015A7D;--blue-bg:#E8F4F9;--act-line:#C4E2ED;',
    '  --fs-micro:9.5px;--fs-cap:10.5px;--fs-note:11.5px;--fs-body:12.5px;',
    '  --fs-lead:13.5px;--fs-hero:24px;color-scheme:light;}',
    P + '-root *{box-sizing:border-box;font-family:inherit;}',

    // ── Шапка ──
    P + '-page-h{margin:0 0 14px;}',
    P + '-ph-row{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;}',
    P + '-page-h h2{margin:0;font-size:19px;font-weight:700;letter-spacing:-.3px;color:var(--ink);}',
    P + '-page-h p{margin:6px 0 0;font-size:var(--fs-body);color:var(--muted);line-height:1.5;max-width:920px;}',
    P + '-page-h p b{color:var(--ink2);font-weight:600;}',
    P + '-pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;background:var(--blue-bg);border:1px solid var(--act-line);padding:3px 11px;font-size:var(--fs-note);color:var(--act-ink);font-weight:600;max-width:520px;}',
    P + '-pill span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',

    // ── KPI-полоса (n5, как z-kpi эталона) ──
    P + '-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:14px;}',
    P + '-kpi{background:var(--card);border-radius:12px;padding:13px 15px;}',
    P + '-k-label{font-size:var(--fs-note);color:var(--muted);font-weight:600;display:flex;align-items:center;gap:6px;}',
    P + '-k-val{font-size:var(--fs-hero);font-weight:700;letter-spacing:-.5px;color:var(--ink);margin:3px 0 2px;font-variant-numeric:tabular-nums;}',
    P + '-k-row{display:flex;align-items:center;gap:6px;min-height:16px;}',
    P + '-k-sub{font-size:var(--fs-note);color:var(--muted);}',
    P + '-k-sub b{color:var(--ink2);font-weight:600;}',
    P + '-kpi-tag{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--act-ink);background:var(--blue-bg);border-radius:5px;padding:2px 6px;}',
    P + '-info{width:14px;height:14px;border-radius:50%;border:1px solid var(--line);display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;font-style:normal;color:var(--muted);cursor:help;flex:0 0 auto;}',

    // ── Дельты ──
    P + '-delta{display:inline-flex;align-items:center;gap:6px;font-size:var(--fs-note);font-weight:600;font-variant-numeric:tabular-nums;}',
    P + '-delta.' + CFG.ns + '-up{color:var(--green-tx);}​',
    P + '-delta.' + CFG.ns + '-down{color:var(--red-tx);}​',
    P + '-delta.' + CFG.ns + '-flat{color:var(--muted);}​',
    P + '-delta.' + CFG.ns + '-neu{color:var(--muted);}​',
    P + '-d-vs{font-weight:500;color:var(--muted2);}​',
    P + '-nocmp{font-size:10.5px;color:var(--muted2);}',

    // ── Наблюдения («Что видно в данных», свёртка z-obs эталона) ──
    P + '-obs{background:var(--card);border-radius:12px;margin-bottom:14px;overflow:hidden;}',
    P + '-obs-h{display:flex;align-items:center;gap:9px;padding:10px 14px;cursor:pointer;border:0;background:none;width:100%;text-align:left;}',
    P + '-obs-ico{width:17px;height:17px;border-radius:50%;background:var(--blue-bg);color:var(--act-ink);font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;}',
    P + '-obs-t{font-size:var(--fs-body);font-weight:600;color:var(--ink);}​',
    P + '-obs-lead{font-size:var(--fs-note);color:var(--muted);}​',
    P + '-obs-caret{margin-left:auto;color:var(--muted2);font-size:10px;}​',
    P + '-obs-b{padding:2px 14px 12px 40px;font-size:var(--fs-note);color:var(--ink2);line-height:1.55;}',
    P + '-obs-b b{font-weight:700;}​',
    P + '-obs-b ul{margin:0;padding:0;list-style:none;}',
    P + '-obs-b li{margin:2px 0;}',

    // ── Панель «Кто смотрит» ──
    P + '-panel{background:var(--card);border-radius:12px;display:flex;flex-direction:column;flex:1 1 auto;min-height:0;}',
    P + '-panel-h{display:flex;align-items:center;gap:10px;padding:11px 14px;flex-wrap:wrap;}',
    P + '-h-txt{display:flex;flex-direction:column;gap:1px;min-width:0;}',
    P + '-h-txt span{font-size:var(--fs-lead);font-weight:700;letter-spacing:-.2px;color:var(--ink);}',
    P + '-h-txt .sub{font-size:var(--fs-cap);font-weight:500;color:var(--muted);letter-spacing:0;}',
    P + '-sub-tabs{display:inline-flex;gap:3px;background:var(--line2);border-radius:12px;padding:3px;margin:0 0 0 auto;flex-wrap:wrap;}',
    P + '-sub-tab{border:0;background:none;border-radius:9px;padding:4px 11px;font-size:var(--fs-note);font-weight:600;color:var(--muted);cursor:pointer;font-family:inherit;}',
    P + '-sub-tab.active{background:var(--card);color:var(--act-ink);box-shadow:0 1px 2px rgba(20,28,45,.08);}',
    P + '-panel-b{padding:0 6px 6px;flex:1 1 auto;min-height:0;overflow:auto;}',
    P + '-tbl-wrap{padding:0 8px 8px;}',

    // ── Таблица разреза (btable эталона: 36/15/15/15/rest + cellbar) ──
    P + '-btable{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;}',
    P + '-btable th{font-size:var(--fs-cap);font-weight:600;color:var(--muted);text-align:right;padding:7px 8px;border-bottom:1px solid var(--line);white-space:nowrap;}',
    P + '-btable th:first-child{text-align:left;}',
    P + '-btable td{padding:6px 8px;border-bottom:1px solid var(--line2);text-align:right;font-size:var(--fs-body);color:var(--ink2);white-space:nowrap;}',
    P + '-btable td:first-child{text-align:left;color:var(--ink);max-width:0;width:36%;overflow:hidden;text-overflow:ellipsis;}',
    P + '-btable .lead{font-weight:700;color:var(--ink);}​',
    P + '-btable tr.' + CFG.ns + '-total td{border-bottom:1px solid var(--line);font-weight:600;color:var(--muted);padding-top:8px;}',
    P + '-urow{cursor:pointer;}',
    P + '-urow:hover td{background:#f7f9fb;}​',
    P + '-unit-sub{display:block;font-size:var(--fs-micro);color:var(--muted2);font-weight:500;line-height:1.3;}',
    P + '-barcell{width:22%;padding-left:12px!important;}',
    P + '-cellbar{display:block;height:12px;border-radius:4px;background:var(--line2);overflow:hidden;}',
    P + '-cellbar i{display:block;height:100%;border-radius:4px;background:var(--act);}',
    P + '-tbl-note{font-size:var(--fs-cap);color:var(--muted2);line-height:1.45;padding:8px 8px 2px;}',
    P + '-empty-cell{font-size:var(--fs-note);color:var(--muted);}​',

    // ── Тултип (живёт в body — шрифт и fixed явно) ──
    P + '-tip{position:fixed;z-index:99999;pointer-events:none;opacity:0;'
           + 'font-family:' + CFG.fonts.family + ';box-sizing:border-box;'
           + 'transition:opacity .08s;background:#fff;border:1px solid var(--line);'
           + 'border-radius:10px;box-shadow:0 4px 16px rgba(20,28,45,.12);'
           + 'padding:9px 12px;max-width:300px;display:flex;flex-direction:column;gap:4px;}',
    P + '-tip ' + P + '-t-h{font-size:12.5px;font-weight:700;color:#1f1f1f;line-height:1.3;}',
    P + '-tip ' + P + '-t-x{font-size:11px;font-weight:400;color:#3a3f4a;line-height:1.4;}',
    P + '-tip ' + P + '-t-r{display:flex;align-items:center;gap:7px;min-width:0;}',
    P + '-tip ' + P + '-t-m{display:inline-block;flex:0 0 auto;width:10px;height:9px;border-radius:3px;}',
    P + '-tip ' + P + '-t-m.' + CFG.ns + '-dash{height:0;width:14px;border-radius:0;border-top:2px dashed;background:none;}',
    P + '-tip ' + P + '-t-l{font-size:11px;font-weight:500;color:#8a909c;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    P + '-tip ' + P + '-t-v{margin:0 0 0 auto;font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums;color:#1f1f1f;}',
    P + '-tip ' + P + '-t-n{display:block;font-size:10.5px;line-height:1.35;font-weight:400;color:#8a909c;margin-top:6px;padding-top:5px;border-top:1px solid #eef0f3;}',
    '</style>'
  ].join('\n');
}
// Только конкатенация строк. Все данные через esc().
// ВНИМАНИЕ: здесь префикс БЕЗ точки. var P = '.' + CFG.ns дал бы class=".pvt-root".
function buildHTML() {
  if (MODEL.empty || !MODEL.kpi) {
    return buildCSS() + '<div class="' + CFG.ns + '-root"><div style="margin:24px">' +
      '<b>' + esc(CFG.text.noData) + '</b>' + esc(CFG.text.noDataSub) + '</div></div>';
  }
  var k = MODEL.kpi;
  var hp = CFG.grains[curGrain()].prev;
  var dPct = function (a, b) { return (hp && b) ? (a / b - 1) * 100 : null; };
  var dlt = function (v) { return hp ? delta(v, { vs: 'к предыдущему' }) : delta(null, {}); };
  var vpu = k.users ? k.views / k.users : 0;
  var h = [];
  h.push('<div class="' + CFG.ns + '-root">');

  // ── Шапка: заголовок + пилюля области + период ──
  h.push('<div class="' + CFG.ns + '-page-h"><div class="' + CFG.ns + '-ph-row">' +
    '<h2>Аудитория</h2>' +
    '<span class="' + CFG.ns + '-pill"' + tip({ title: 'Область', text: 'Чью аудиторию смотрим. Меняется кликом по строке каталога в «Отчётах и динамике» или по отчёту в таблице ниже.' }) +
    '><span>' + esc(MODEL.area) + '</span></span>' +
    '<span class="' + CFG.ns + '-pill" style="background:var(--line2);border-color:var(--line);color:var(--muted)">Период: <span>' + esc(CFG.grains[curGrain()].label) + '</span></span>' +
    '</div><p>Кто смотрит выбранную область: уникальные зрители за период, разложенные ' +
    'по управленческой структуре, специализации, стриму и AD-группам. Клик по строке — ' +
    'кросс-фильтр закрепляемости; вкладка <b>Отчёты</b> (у людского выбора) — какие отчёты ' +
    'смотрит эта аудитория.</p></div>');

  // ── KPI-полоса n5 ──
  h.push(kpisRow([
    kpiCard({
      label: 'Зрителей за период', value: nf(k.users),
      hint: { title: 'Зрители', text: 'Уникальные логины, открывавшие хотя бы один отчёт области за период.' },
      delta: dlt(dPct(k.users, k.users_prev)),
      sub: hp ? 'предыдущий: <b>' + nf(k.users_prev) + '</b>' : 'период: <b>' + esc(CFG.grains[curGrain()].label) + '</b>'
    }),
    kpiCard({
      label: 'Просмотров', value: compact(k.views),
      hint: { title: 'Просмотры', text: 'Сумма открытий отчётов области за период.' },
      delta: dlt(dPct(k.views, k.views_prev)),
      sub: 'на зрителя: <b>' + nf(vpu, 1) + '</b>'
    }),
    kpiCard({
      label: 'Новых зрителей', value: nf(k.new_users),
      hint: { title: 'Новые', text: 'Первое касание области пришлось на этот период (история витрины — 13 месяцев).' },
      delta: '',
      sub: 'доля аудитории: <b>' + pct(k.users ? k.new_users / k.users * 100 : 0, 0) + '</b>'
    }),
    kpiCard({
      label: 'Постоянных', value: nf(k.regular_users),
      hint: { title: 'Постоянные', text: 'Заходили 8 и более разных периодов (дней/недель/месяцев — по грануляции).' },
      delta: '',
      sub: 'от зрителей <b>' + pct(k.users ? k.regular_users / k.users * 100 : 0, 0) + '</b>'
    }),
    kpiCard({
      label: 'Зашли один раз', value: nf(k.once_users),
      hint: { title: 'Разовые', text: 'Ровно один активный период — типичная реакция на рассылку.' },
      delta: '',
      sub: 'от зрителей <b>' + pct(k.users ? k.once_users / k.users * 100 : 0, 0) + '</b>'
    })
  ]));

  // ── Наблюдения ──
  h.push(obsHtml());

  // ── Панель «Кто смотрит» ──
  h.push(whoHtml());

  h.push('</div>');
  return buildCSS() + h.join('');
}

// Период той же семантики, что у тела: полка/полоска эмитит period_param,
// джиня дефолтит в 'd'; сам ответ грануляции не несёт — берём состояние
// по умолчанию (маску виджет не читает, цифры приходят уже под период).
function curGrain() {
  return CFG.grains[state.grain] ? state.grain : 'd';
}

function kpiCard(o) {
  return '<div class="' + CFG.ns + '-kpi">' +
    '<div class="' + CFG.ns + '-k-label">' + esc(o.label) +
      (o.hint ? '<span class="' + CFG.ns + '-info"' + tip(o.hint) + ' aria-hidden="true">i</span>' : '') +
    '</div>' +
    '<div class="' + CFG.ns + '-k-val">' + o.value + '</div>' +
    '<div class="' + CFG.ns + '-k-row">' + (o.delta || '') + '</div>' +
    '<div class="' + CFG.ns + '-k-row">' + (o.sub ? '<span class="' + CFG.ns + '-k-sub">' + o.sub + '</span>' : '') + '</div>' +
    '</div>';
}
function kpisRow(arr) {
  var s = '<div class="' + CFG.ns + '-kpis">';
  for (var i = 0; i < arr.length; i++) s += arr[i];
  return s + '</div>';
}

// «Что видно в данных»: пара пороговых наблюдений (без ЯМ, как в теле).
function obsHtml() {
  var k = MODEL.kpi;
  var items = [];
  var newSh = k.users ? k.new_users / k.users * 100 : 0;
  var regSh = k.users ? k.regular_users / k.users * 100 : 0;
  if (newSh >= 25) {
    items.push('Новых зрителей непривычно много — <b>' + pct(newSh, 0) + '</b> аудитории: похоже на рассылку или выдачу доступа.');
  }
  if (regSh >= 30) {
    items.push('<b>' + nf(k.regular_users) + '</b> ' + plural(k.regular_users, 'человек заходит', 'человека заходят', 'человек заходят') + ' регулярно (8+ периодов) — область встроилась в их работу.');
  }
  if (!items.length) {
    items.push('Резких перекосов нет: новые зрители — <b>' + pct(newSh, 0) + '</b>, постоянные — <b>' + pct(regSh, 0) + '</b> аудитории.');
  }
  var lead = regSh >= 30
    ? 'Постоянная аудитория — ' + pct(regSh, 0)
    : 'Новые зрители — ' + pct(newSh, 0) + ' аудитории';
  return '<div class="' + CFG.ns + '-obs">' +
    '<button class="' + CFG.ns + '-obs-h" data-action="' + (state.obsOpen ? 'close' : 'open') + '" type="button" aria-expanded="' + (state.obsOpen ? 'true' : 'false') + '">' +
    '<span class="' + CFG.ns + '-obs-ico" aria-hidden="true">!</span>' +
    '<span class="' + CFG.ns + '-obs-t">Что видно в данных</span>' +
    '<span class="' + CFG.ns + '-obs-lead">' + esc(lead) + '</span>' +
    '<span class="' + CFG.ns + '-obs-caret" aria-hidden="true">' + (state.obsOpen ? '▾' : '▸') + '</span></button>' +
    (state.obsOpen ? '<div class="' + CFG.ns + '-obs-b"><ul><li>' + items.join('</li><li>') + '</li></ul>' +
      'Отбор по порогам: доля новых ≥25%; доля постоянных ≥30%.</div>' : '') +
    '</div>';
}

// Панель «Кто смотрит»: подшапка-разрезы + таблица с барами + ИТОГО.
function whoHtml() {
  var tabs = [];
  for (var i = 0; i < CFG.cuts.length; i++) {
    var c = CFG.cuts[i];
    if (!MODEL.cuts[c.key]) continue;
    tabs.push({ key: c.key, label: c.label, on: state.cut === c.key });
  }
  if (MODEL.hasReport) {
    tabs.push({ key: CFG.repTab.key, label: CFG.repTab.label, on: state.cut === CFG.repTab.key });
  }
  if (!tabs.length) {
    return '<div class="' + CFG.ns + '-panel"><div class="' + CFG.ns + '-panel-h">' +
      '<div class="' + CFG.ns + '-h-txt"><span>Кто смотрит</span><span class="sub">в этом ответе нет разрезов</span></div></div>' +
      '<div class="' + CFG.ns + '-panel-b ' + CFG.ns + '-tbl-wrap"><div class="' + CFG.ns + '-tbl-note">' +
      esc(CFG.text.noDataSub) + '</div></div></div>';
  }
  var known = false;
  for (var t = 0; t < tabs.length; t++) if (tabs[t].key === state.cut) { known = true; break; }
  if (!known) state.cut = tabs[0].key;

  var isRep = state.cut === CFG.repTab.key;
  var cutCfg = null;
  for (var cc = 0; cc < CFG.cuts.length; cc++) if (CFG.cuts[cc].key === state.cut) cutCfg = CFG.cuts[cc];
  var firstH = isRep ? 'Отчёт' : (cutCfg ? cutCfg.label : state.cut);
  var sub = isRep
    ? 'какие отчёты смотрит эта аудитория — топ-25'
    : 'клик по строке сужает закрепляемость до этого ' + (state.cut === 'heads' ? 'признака' : 'значения');

  var h = '<div class="' + CFG.ns + '-panel">' +
    '<div class="' + CFG.ns + '-panel-h">' +
    '<div class="' + CFG.ns + '-h-txt"><span>Кто смотрит</span><span class="sub">' + esc(sub) + '</span></div>' +
    '<div class="' + CFG.ns + '-sub-tabs" role="tablist">' + whoTabs(tabs) + '</div></div>' +
    '<div class="' + CFG.ns + '-panel-b ' + CFG.ns + '-tbl-wrap"><table class="' + CFG.ns + '-btable"><colgroup>' +
    '<col style="width:36%"><col style="width:13%"><col style="width:13%"><col style="width:13%"><col></colgroup>' +
    '<thead><tr><th class="txt">' + esc(firstH) + '</th><th>Зрителей</th><th>Новых</th><th>Доля</th><th class="txt"></th></tr></thead><tbody>';
  h += '<tr class="' + CFG.ns + '-total"><td class="txt">ИТОГО</td><td class="lead">' + nf(MODEL.kpi.users) + '</td>' +
    '<td>' + nf(MODEL.kpi.new_users) + '</td><td>100%</td><td class="' + CFG.ns + '-barcell"></td></tr>';
  h += isRep ? repRows() : (state.cut === 'lvl4' ? treeRows() : cutRows(state.cut, cutCfg));
  h += '</tbody></table><div class="' + CFG.ns + '-tbl-note">' + esc(tblNote(isRep)) + '</div></div></div>';
  return h;
}
function whoTabs(tabs) {
  var s = '';
  for (var i = 0; i < tabs.length; i++) {
    s += '<button class="' + CFG.ns + '-sub-tab' + (tabs[i].on ? ' active' : '') +
      '" role="tab" aria-selected="' + (tabs[i].on ? 'true' : 'false') +
      '" data-view="cut:' + esc(tabs[i].key) + '" type="button">' + esc(tabs[i].label) + '</button>';
  }
  return s;
}
function rowTip(r, note) {
  return tip({
    title: r.nm || r.val,
    rows: [
      { label: 'Зрителей', value: nf(r.users), color: CFG.colors.act },
      { label: 'Новых', value: nf(r.new_users) },
      { label: 'Постоянных', value: nf(r.regular_users) },
      { label: 'Доля аудитории', value: pct(r.share) }
    ],
    note: note
  });
}
function cutRows(key, cfg) {
  var rows = MODEL.cuts[key] || [];
  var s = '';
  var noEmit = cfg && cfg.noEmit;
  var note = noEmit
    ? 'Когорты по AD-группе пока не считаются — клик отключён'
    : 'Клик сузит закрепляемость до этого значения';
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    s += '<tr class="' + CFG.ns + '-urow"' + (noEmit ? '' : ' data-selrow="' + esc(emitOf(key)) + '|' + esc(r.val) + '" tabindex="0" role="button" aria-pressed="false"') + '>' +
      '<td class="txt">' + esc(r.nm || r.val) + '</td>' +
      '<td class="lead">' + nf(r.users) + '</td>' +
      '<td>' + nf(r.new_users) + '</td>' +
      '<td>' + pct(r.share, 0) + '</td>' +
      '<td class="' + CFG.ns + '-barcell"' + rowTip(r, noEmit ? note : (r.users ? 'Клик сузит закрепляемость' : '')) + '>' +
      '<span class="' + CFG.ns + '-cellbar"><i style="width:' + Math.min(100, r.share).toFixed(1) + '%"></i></span></td></tr>';
  }
  return s || '<tr><td colspan="5" style="text-align:center;padding:18px" class="' + CFG.ns + '-empty-cell">Нет значений</td></tr>';
}
function treeRows() {
  var s = '';
  var blocks = MODEL.tree || [];
  for (var b = 0; b < blocks.length; b++) {
    var blk = blocks[b];
    s += '<tr class="' + CFG.ns + '-total"><td class="txt">' + esc(blk.name) + '</td>' +
      '<td class="lead">' + nf(blk.users) + '</td><td></td><td>' +
      pct(MODEL.kpi.users ? blk.users / MODEL.kpi.users * 100 : 0, 0) + '</td>' +
      '<td class="' + CFG.ns + '-barcell"' + tip({
        title: blk.name,
        rows: [{ label: 'Зрителей в блоке', value: nf(blk.users), color: CFG.colors.act },
          { label: 'Департаментов', value: String(blk.rows.length) }],
        note: 'Кликните по департаменту ниже — закрепляемость по нему; блок целиком — на вкладке УС-3'
      }) + '><span class="' + CFG.ns + '-cellbar" style="opacity:.45"><i style="width:' +
      Math.min(100, MODEL.kpi.users ? blk.users / MODEL.kpi.users * 100 : 0).toFixed(1) + '%"></i></span></td></tr>';
    for (var i = 0; i < blk.rows.length; i++) {
      var r = blk.rows[i];
      r.share = MODEL.kpi.users ? r.users / MODEL.kpi.users * 100 : 0;
      s += '<tr class="' + CFG.ns + '-urow" data-selrow="' + esc(emitOf('lvl4')) + '|' + esc(r.val) + '" tabindex="0" role="button" aria-pressed="false">' +
        '<td class="txt" style="padding-left:22px">' + esc(r.val) + '</td>' +
        '<td class="lead">' + nf(r.users) + '</td>' +
        '<td>' + nf(r.new_users) + '</td>' +
        '<td>' + pct(r.share, 0) + '</td>' +
        '<td class="' + CFG.ns + '-barcell"' + rowTip(r, 'Клик сузит закрепляемость до департамента') + '>' +
        '<span class="' + CFG.ns + '-cellbar"><i style="width:' + Math.min(100, r.share).toFixed(1) + '%"></i></span></td></tr>';
    }
  }
  return s || '<tr><td colspan="5" style="text-align:center;padding:18px" class="' + CFG.ns + '-empty-cell">Нет значений</td></tr>';
}
function repRows() {
  var rows = MODEL.cuts.report || [];
  var s = '';
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    s += '<tr class="' + CFG.ns + '-urow" data-selrow="report|' + esc(r.val) + '" tabindex="0" role="button" aria-pressed="false">' +
      '<td class="txt">' + esc(r.nm || ('Отчёт ' + r.val)) + '<span class="' + CFG.ns + '-unit-sub">id ' + esc(r.val) + '</span></td>' +
      '<td class="lead">' + nf(r.users) + '</td>' +
      '<td>' + nf(r.new_users) + '</td>' +
      '<td>' + pct(r.share, 0) + '</td>' +
      '<td class="' + CFG.ns + '-barcell"' + rowTip(r, 'Клик покажет закрепляемость этого отчёта') + '>' +
      '<span class="' + CFG.ns + '-cellbar"><i style="width:' + Math.min(100, r.share).toFixed(1) + '%"></i></span></td></tr>';
  }
  return s || '<tr><td colspan="5" style="text-align:center;padding:18px" class="' + CFG.ns + '-empty-cell">Нет значений</td></tr>';
}
function tblNote(isRep) {
  return isRep
    ? 'Двадцать пять самых популярных у этой аудитории. Клик по строке — закрепляемость этого отчёта.'
    : 'Полоса — доля зрителей ОБЛАСТИ в этой строке, а не охват строки. ИТОГО считается по всей аудитории области.';
}
// mode_param эмиссии: как у тела (modeParamOf) — cut:* кроме людей-ключей.
function emitOf(key) {
  return (key === 'report' || key === 'collection' || key === 'owner') ? key : 'cut:' + key;
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
      + 'z-index:10;overflow:auto;box-sizing:border-box;border-radius:4px;background:' + CFG.colors.bg + ';';
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(overlay);

    // ── КОМПЕНСАЦИЯ ХОСТ-ПАДДИНГА (порт из тела, раунды 4–5) ──
    // Хост-карточка красит ячейку белым с паддингом ~16px — снимаем паддинг
    // БЛИЖАЙШЕГО предка (≥12px, не выше 5 прыжков), контент до краёв карточки.
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
    // Скролл сохраняем (порт из тела): клик внизу списка не прыгает наверх.
    function render() {
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

    function onOver(e) {
      var el = trigger(e.target, 'data-tip');
      if (!el) return;
      // Якорь — rect ЦЕЛИ как есть. Ключи, по которым renderTip соберёт
      // содержимое: kind — что за элемент, key — какой именно.
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

    // Эмиссия выбора — МЕХАНИКА ТЕЛА (проверена продом): пара mode_param+sel_f,
    // operator 'IN'; пустые списки НЕ эмитим. Скоуп этого чарта — закрепляемость
    // (себя исключил владелец): клики ниже меняют закрепляемость, не эту панель.
    function emitSel(mode, val) {
      if (typeof applyCrossFilter !== 'function') return;
      var fl = [{ column: 'mode_param', operator: 'IN', value: [mode] }];
      if (val != null) fl.push({ column: 'sel_f', operator: 'IN', value: [String(val)] });
      applyCrossFilter(fl);
    }

    function onClick(e) {
      // Переключалка разреза «Кто смотрит»: data-view="cut:<key>".
      var tab = trigger(e.target, 'data-view');
      if (tab) {
        var v = String(tab.getAttribute('data-view') || '');
        if (v.indexOf('cut:') === 0) {
          state.cut = v.slice(4);
          render();
        }
        return;
      }
      // Строка таблицы: data-selrow="<mode_param>|<val>" — эмит выбора
      // (закрепляемость сузится; эта панель область не меняет). Разделитель
      // '|' потому, что mode_param сам несёт двоеточие (cut:lvl3).
      var row = trigger(e.target, 'data-selrow');
      if (row) {
        var sr = String(row.getAttribute('data-selrow') || '');
        var bar = sr.indexOf('|');
        if (bar > 0) {
          emitSel(sr.slice(0, bar), sr.slice(bar + 1));
        }
        return;
      }
      // Раскрывашка наблюдений.
      var act = trigger(e.target, 'data-action');
      if (act) {
        state.obsOpen = String(act.getAttribute('data-action')) === 'open';
        render();
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
