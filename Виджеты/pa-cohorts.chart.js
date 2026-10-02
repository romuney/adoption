// ============================================================================
// pa-cohorts.chart.js — «Закрепляемость» отдельным чартом (2026-09-18)
// ============================================================================
// КОНТРАКТ PROTEUS: тот же, что у тела (Виджеты/pa-reports-body.chart.js):
//   ECharts = только холст. Вся визуализация - HTML/CSS/SVG в overlay.
//   Хост = ПОСЛЕДНИЙ [_echarts_instance_]. Canvas прячем. Overlay - appendChild.
//   В САМОМ КОНЦЕ ФАЙЛА, ГЛОБАЛЬНО: option = {...} с пустым scatter.
// ЗАПРЕЩЕНО: backticks/стрелки/let/const, document.getElementById,
//   addEventListener внутри render(), мутация option после присваивания.
//
// ЧТО ЭТО. Когортная таблица и кривая удержания, вынесенные из тела по
// решению владельца. Датасет pa_coh_v4 (id 169589), 8 колонок:
//   section (coh|rcoh|gcoh|ocoh), sel_key, sel_val, sel_nm,
//   cohort_month, cohort_size, ages (Array Int64), acts (Array UInt64).
// СЕЛЕКЦИЮ ВИДЖЕТ НЕ ЭМИТИТ: под что считать когорты, решает чарт тела
// (кросс-фильтр mode_param + sel_f), этот чарт — только приёмник. Заголовок
// выводится из САМОГО ответа (section + sel_key/sel_val/sel_nm), общего
// состояния с телом нет.
// МЕХАНИКА БЕЗ ИЗМЕНЕНИЙ перенесена из тела (макет «Закрепляемость»):
// раскраска от МЕДИАНЫ СТОЛБЦА (переключается на медиану таблицы),
// незакрытый месяц — серый курсив и в медиану не входит, столбца «старт»
// нет, легенда-регулятор гасит ячейки своей ступени по hover.
// ============================================================================

// ---------- БЛОК 1: CFG ----------
var CFG = {
  ns: 'pac',                  // префикс классов; НЕ 'prb' — чарты соседние
  fields: {
    section: 'section', sel_key: 'sel_key', sel_val: 'sel_val', sel_nm: 'sel_nm',
    cohort_month: 'cohort_month', cohort_size: 'cohort_size',
    ages: 'ages', acts: 'acts'
  },
  text: { noData: 'Когорт в этом ответе нет' },
  mode: 'snapshot',
  // Подписи людских разрезов — sel_key из куба (режимы cut:*).
  cutLabels: {
    lvl3: 'подразделение', lvl4: 'управл. структура 4', stream: 'стрим',
    spec: 'специализация', it: 'IT-код', hq: 'операц. код',
    head: 'руководители', seg: 'сегмент'
  },
  colors: {
    // Раунд 6: канвас = цвет холста борда (#f6f6f6), заливает ячейку целиком.
    // Белая панель закрепляемости растянута на весь чарт (100%×100%) —
    // серого внутри не видно; паддинг хоста снят в mount().
    bg: '#f6f6f6', panel: '#fff',
    act: '#0073A0', ret: '#5CC0EE', views: '#5b6478', bench: '#c7c8cc',
    divLo: '#FFD758', divHi: '#62CDFF',
    label: '#2b2b2b', axis: '#808080', split: '#f0f1f3',
    txt: '#3a3f4a', mut: '#8a909c'
  },
  fonts: {
    family: 'Inter,-apple-system,"Segoe UI",Roboto,Arial,sans-serif',
    val: 11, dense: 10, title: 13, title2: 12, legend: 12
  },
  spacing: { dense: 16 }
};

// ---------- БЛОК 2: ВХОД + СОСТОЯНИЕ + ХЕЛПЕРЫ ----------
var rawData = (typeof data !== 'undefined' && Array.isArray(data)) ? data : [];

if (!window.__pvtState) window.__pvtState = {};
var __S = window.__pvtState;
if (!__S[CFG.ns]) __S[CFG.ns] = {
  tip: null,
  view: 'cohort',          // cohort | curve
  ctBase: 'col',           // чем меряет цвет: медиана столбца | таблицы
  ctBand: null             // hover по ступени легенды (сейчас не читается,
                           // оставлен для будущих состояний)
};
var state = __S[CFG.ns];

function arr(v) {
  if (v == null) return [];
  if (Object.prototype.toString.call(v) === '[object Array]') return v;
  var s = String(v).trim();
  if (!s || s === '[]') return [];
  try { var p = JSON.parse(s); return Object.prototype.toString.call(p) === '[object Array]' ? p : []; }
  catch (e) { return []; }
}
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  var s = String(v).replace(/[\s ]/g, '');
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

// ---------- БЛОК 3: ТРАНСФОРМАЦИЯ ДАННЫХ ----------
// rawData -> rows когорт + мета выбора. Сортировка по месяцу своя: порядок
// groupArray в ClickHouse не гарантирован.
var MODEL = (function () {
  var F = CFG.fields;
  var M = { empty: !rawData.length, rows: [], meta: null };
  var now = new Date();
  for (var ri = 0; ri < rawData.length; ri++) {
    var r = rawData[ri] || {};
    var cm = toDate(r[F.cohort_month]);
    if (!cm) continue;
    var size = num(r[F.cohort_size]) || 0;
    var ages = arr(r[F.ages]), acts = arr(r[F.acts]);
    // Частичность = возраст незакрытого текущего месяца (клиентское «сейчас»).
    var openAge = (now.getUTCFullYear() - cm.y) * 12 + (now.getUTCMonth() - cm.m);
    var cells = [];
    for (var ai = 0; ai < ages.length; ai++) {
      var ag = num(ages[ai]);
      if (ag == null) continue;
      cells.push({ age: ag, active: num(acts[ai]) || 0, partial: ag === openAge });
    }
    cells.sort(function (a, b) { return a.age - b.age; });
    M.rows.push({ month: cm, size: size, cells: cells });
    if (!M.meta) {
      M.meta = {
        section: String(r[F.section] == null ? '' : r[F.section]),
        sel_key: String(r[F.sel_key] == null ? '' : r[F.sel_key]),
        sel_val: String(r[F.sel_val] == null ? '' : r[F.sel_val]),
        sel_nm: String(r[F.sel_nm] == null ? '' : r[F.sel_nm])
      };
    }
  }
  M.rows.sort(function (a, b) {
    return (a.month.y - b.month.y) * 12 + (a.month.m - b.month.m);
  });
  M.empty = !M.rows.length;
  return M;
})();

// Заголовок панели выводится из формы ответа: что выбрано, то и написано.
// p — подпись ПИЛЮЛЬКИ выбора (правка владельца 2026-09-18: «фильтр
// закрепляемости должен быть заметнее, как пилюлька сверху» — тот же стиль,
// что у чипов тела): «Отчёт: …» / «Владелец: …» / серое «весь Proteus».
function titles() {
  var m = MODEL.meta || {};
  var cutLbl = CFG.cutLabels[m.sel_key] || m.sel_key;
  if (m.section === 'rcoh')
    return { t: 'Закрепляемость отчёта', sub: m.sel_nm || m.sel_val, p: 'Отчёт: ' + (m.sel_nm || m.sel_val),
      first: 'Месяц, в который человек открыл этот отчёт впервые',
      size: 'Столько человек открыли этот отчёт впервые в этом месяце' };
  if (m.section === 'gcoh' && m.sel_key === 'owner')
    return { t: 'Закрепляемость: владелец', sub: m.sel_val, p: 'Владелец: ' + m.sel_val,
      first: 'Месяц, когда человек впервые открыл любой отчёт владельца',
      size: 'Столько человек впервые открыли отчёт владельца в этом месяце' };
  if (m.section === 'gcoh')
    return { t: 'Закрепляемость: коллекция', sub: m.sel_val, p: 'Коллекция: ' + m.sel_val,
      first: 'Месяц, когда человек впервые открыл любой отчёт коллекции',
      size: 'Столько человек впервые открыли отчёт коллекции в этом месяце' };
  if (m.section === 'ocoh')
    return { t: 'Закрепляемость: ' + cutLbl, sub: m.sel_val, p: cutLbl.charAt(0).toUpperCase() + cutLbl.slice(1) + ': ' + m.sel_val,
      first: 'Месяц первого визита в Proteus',
      size: 'Столько людей разреза впервые зашли в Proteus в этом месяце' };
  return { t: 'Закрепляемость Proteus', sub: '', p: '',
    first: 'Месяц первого визита в Proteus',
    size: 'Столько человек впервые зашли в Proteus в этом месяце' };
}

// Средняя кривая: складываем числители и знаменатели, не проценты.
function retentionPoints(rows) {
  var byAge = {};
  for (var c = 0; c < rows.length; c++) {
    var cells = rows[c].cells;
    for (var i = 0; i < cells.length; i++) {
      var x = cells[i];
      if (x.partial) continue;
      if (!byAge[x.age]) byAge[x.age] = { age: x.age, num: 0, den: 0, cohorts: 0 };
      byAge[x.age].num += x.active;
      byAge[x.age].den += rows[c].size;
      byAge[x.age].cohorts++;
    }
  }
  var out = [];
  for (var a in byAge) {
    if (!Object.prototype.hasOwnProperty.call(byAge, a)) continue;
    var p = byAge[a];
    if (p.cohorts >= 2) out.push({ age: p.age, pct: p.den ? p.num / p.den * 100 : 0, cohorts: p.cohorts });
  }
  out.sort(function (x, y) { return x.age - y.age; });
  return out;
}

// ---------- БЛОК 4: ФОРМАТИРОВАНИЕ И ЦВЕТ ----------
function nf(v, dec) {
  if (v == null || !isFinite(v)) return '—';
  var d = dec == null ? 0 : dec, neg = v < 0;
  var s = Math.abs(v).toFixed(d).split('.');
  var ii = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
  return (neg ? MINUS : '') + ii + (s.length > 1 ? ',' + s[1] : '');
}
function pct(v, dec) { return (v == null || !isFinite(v)) ? '—' : nf(v, dec == null ? 1 : dec) + '%'; }
function plural(n, one, few, many) {
  var a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
function signed(v, dec, unit) {
  if (v == null || !isFinite(v)) return '—';
  var sign = v > 0 ? '+' : (v < 0 ? MINUS : '');
  return sign + nf(Math.abs(v), dec == null ? 1 : dec) + (unit || '');
}

function tipHtml(o) {
  var s = '<div class="' + CFG.ns + '-tipbox">';
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
  return s + '</div>';
}
function tip(o) { return ' data-tip="' + esc(tipHtml(o)) + '"'; }

// Дивергентная шкала когорт (ui.js 259–289): жёлтый — ниже медианы,
// голубой — выше, белый — медиана. 3 ступени в каждую сторону.
var DIV_LOW = [255, 215, 88], DIV_MID = [255, 255, 255], DIV_HIGH = [98, 205, 255], BANDS = 3;
function medianOf(vals) {
  if (!vals.length) return null;
  var s = vals.slice().sort(function (a, b) { return a - b; });
  var m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function mixRgb(c1, c2, t) {
  return 'rgb(' + Math.round(c1[0] + (c2[0] - c1[0]) * t) + ',' +
    Math.round(c1[1] + (c2[1] - c1[1]) * t) + ',' + Math.round(c1[2] + (c2[2] - c1[2]) * t) + ')';
}
function divColorAt(d) {
  var t = Math.max(-1, Math.min(1, d));
  return t >= 0 ? mixRgb(DIV_MID, DIV_HIGH, t) : mixRgb(DIV_MID, DIV_LOW, -t);
}
function bandOf(d) { return Math.max(-BANDS, Math.min(BANDS, Math.round(d * BANDS))); }
var CT_BASES = [
  { key: 'col', label: 'от медианы столбца', hint: 'Цвет — насколько когорта держится лучше или хуже других когорт В ТОМ ЖЕ ВОЗРАСТЕ.' },
  { key: 'all', label: 'от медианы таблицы', hint: 'Цвет — отклонение от медианы всех закрытых ячеек сразу. Видно общий наклон: свежие когорты против старых.' }
];

// ---------- БЛОК 5: РАЗМЕТКА ----------
function buildCSS() {
  var P = '.' + CFG.ns;
  return [
    '<style>',
    P + '-root{width:100%;height:100%;box-sizing:border-box;font-family:' + CFG.fonts.family + ';',
    '  --card:#fff;--line:#e7e9ee;--line2:#eef0f3;--ink:#1f1f1f;--ink2:#3a3f4a;',
    '  --muted:#8a909c;--muted2:#aab0bb;--act:#0073A0;--act-ink:#015A7D;',
    '  --blue-bg:#E8F4F9;--act-line:#C4E2ED;',
    '  --fs-micro:9.5px;--fs-cap:10.5px;--fs-note:11.5px;--fs-body:12.5px;',
    '  --shadow:0 1px 3px rgba(20,28,45,.06),0 4px 16px rgba(20,28,45,.04);',
    '  color-scheme:light;}',
    P + '-root *{box-sizing:border-box;font-family:inherit;}',

    // Раунд 6: белый блок на сером канвасе борда — без границы и тени.
    P + '-panel{background:var(--card);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;height:100%;}',
    P + '-panel-h{padding:14px 16px;font-weight:700;font-size:14.5px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:0 0 auto;}',
    P + '-h-txt{display:flex;flex-direction:column;gap:2px;min-width:0;}',
    // Пилюлька выбора — единый стиль с чипами тела (те же blue-bg/act-line).
    P + '-pill{display:inline-flex;align-items:center;gap:7px;align-self:flex-start;border-radius:999px;background:var(--blue-bg);',
    '  border:1px solid var(--act-line);padding:3px 11px;font-size:var(--fs-note);color:var(--act-ink);font-weight:600;',
    '  max-width:480px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    P + '-pill.mut{background:#f0f1f3;border-color:var(--line2);color:var(--muted);font-weight:500;}',
    P + '-h-txt .sub{font-size:var(--fs-note);color:var(--muted);font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:420px;}',
    P + '-panel-h .sub-tabs{margin:0 0 0 auto;flex:0 0 auto;}',
    P + '-panel-b{padding:14px 16px;flex:1;min-height:0;overflow:auto;}',
    P + '-sub-tabs{display:inline-flex;gap:3px;background:#eef0f3;border-radius:12px;padding:3px;margin:0;}',
    P + '-sub-tab{border:0;background:transparent;padding:6px 12px;border-radius:9px;font-size:var(--fs-note);color:var(--muted);cursor:pointer;font-weight:500;font-family:inherit;}',
    P + '-sub-tab:hover{color:var(--ink2);}',
    P + '-sub-tab.active{background:var(--card);color:var(--ink);}',
    P + '-sub-tabs.tiny{border-radius:9px;padding:2px;}',
    P + '-sub-tabs.tiny ' + P + '-sub-tab{padding:2px 8px;font-size:var(--fs-note);border-radius:6px;}',

    // ── Когорты ──
    P + '-ct-legend{display:flex;align-items:center;gap:14px;flex-wrap:wrap;row-gap:8px;padding-bottom:12px;}',
    P + '-ct-scale-wrap{display:flex;align-items:center;gap:8px;flex:0 0 auto;}',
    P + '-ct-end{font-size:var(--fs-cap);color:var(--muted2);font-weight:500;}',
    P + '-ct-scale{display:inline-flex;gap:2px;flex:0 0 auto;}',
    P + '-ct-st{width:26px;height:14px;border:0;padding:0;cursor:pointer;border-radius:2px;transition:transform .1s;}',
    P + '-ct-st:hover,' + P + '-ct-st:focus-visible{transform:scaleY(1.45);}',
    P + '-ct-cfg{display:flex;align-items:center;gap:8px;flex-wrap:wrap;row-gap:3px;}',
    P + '-ct-cfg-l{font-size:var(--fs-cap);text-transform:uppercase;letter-spacing:.4px;color:var(--muted);font-weight:600;}',
    P + '-ct-cfg-n{font-size:var(--fs-cap);color:var(--muted2);font-weight:500;cursor:help;}',
    P + '-ct-wrap{overflow-x:auto;}',
    P + '-ct-wrap.band-on td' + P + '-ct-cell{opacity:.2;transition:opacity .1s;}',
    P + '-ct-wrap.band-on td' + P + '-ct-cell.band-hit{opacity:1;box-shadow:inset 0 0 0 1px rgba(31,31,31,.35);}',
    P + '-cttable{border-collapse:separate;border-spacing:2px;width:100%;font-size:var(--fs-body);}',
    P + '-cttable th,' + P + '-cttable td{border:0;white-space:nowrap;}',
    P + '-cttable th{font-size:var(--fs-cap);text-transform:uppercase;letter-spacing:.3px;color:var(--muted);font-weight:600;text-align:center;padding:4px 2px;}',
    P + '-cttable th.txt{text-align:left;padding-left:4px;}',
    P + '-ct-med{display:block;font-size:var(--fs-micro);font-weight:500;color:var(--muted2);margin-top:1px;}',
    P + '-cttable td.txt{font-weight:600;color:var(--ink);padding-left:4px;}',
    P + '-ct-sz{display:flex;align-items:center;gap:8px;}',
    P + '-ct-bar{flex:1;height:12px;background:#f1f3f6;border-radius:2px;overflow:hidden;}',
    // Полоса «Пришло» — светлая ступень --se-ret макета (app.css:
    // .cttable .ct-bar i{background:var(--se-ret)}); тёмный act перетягивал
    // взгляд и спорил с дивергентной раскраской ячеек (правка 2026-09-18).
    P + '-ct-bar i{display:block;height:100%;border-radius:2px;background:' + CFG.colors.ret + ';min-width:2px;}',
    P + '-ct-sz b{font-weight:600;color:var(--ink2);font-variant-numeric:tabular-nums;}',
    P + '-ct-cell{text-align:center;padding:7px 3px;border-radius:6px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums;cursor:help;}',
    P + '-ct-cell.none{background:transparent !important;cursor:default;}',
    P + '-ct-cell.part{background:#f1f3f6 !important;font-style:italic;color:var(--muted);}',

    P + '-tbl-note{margin-top:8px;font-size:var(--fs-note);color:var(--muted);line-height:1.5;}',
    P + '-tbl-note b{color:var(--ink2);font-weight:600;}',
    P + '-note-inline{font-size:12px;color:var(--muted);background:var(--card);border:1px solid var(--line2);border-radius:9px;padding:8px 12px;}',
    P + '-empty{background:var(--card);border-radius:12px;padding:28px;text-align:center;color:var(--muted);font-size:var(--fs-body);}',
    P + '-empty b{display:block;color:var(--ink);font-size:15px;margin-bottom:8px;}',

    // Тултип живёт В BODY — шрифт и position:fixed явно.
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

// --- Когортная таблица (перенос из тела без изменения механики) -------------
function cohortTableHtml(o) {
  var rows = o.rows || [];
  var maxAge = 11;
  var maxSize = 1;
  for (var i = 0; i < rows.length; i++) if (rows[i].size > maxSize) maxSize = rows[i].size;
  var pctOf = function (r, c) { return r.size ? c.active / r.size * 100 : 0; };
  var base = state.ctBase === 'all' ? 'all' : 'col';

  var med = {}, closed = [];
  for (var a = 1; a <= maxAge; a++) {
    var vals = [];
    for (var r0 = 0; r0 < rows.length; r0++) {
      var c0 = rows[r0].cells[a - 1];
      if (c0 && !c0.partial) { vals.push(pctOf(rows[r0], c0)); closed.push(pctOf(rows[r0], c0)); }
    }
    med[a] = medianOf(vals);
  }
  var medAll = medianOf(closed);
  var refOf = function (a) { return base === 'all' ? medAll : med[a]; };

  var maxDev = 0;
  for (var r1 = 0; r1 < rows.length; r1++) {
    for (var i1 = 0; i1 < rows[r1].cells.length; i1++) {
      var ref1 = refOf(i1 + 1);
      if (rows[r1].cells[i1].partial || ref1 == null) continue;
      var dev1 = Math.abs(pctOf(rows[r1], rows[r1].cells[i1]) - ref1);
      if (dev1 > maxDev) maxDev = dev1;
    }
  }
  var span = maxDev > 0.001 ? maxDev : 20;
  var normOf = function (v, a) {
    var ref = refOf(a);
    if (ref == null || v == null) return null;
    return Math.max(-1, Math.min(1, (v - ref) / span));
  };

  var what = base === 'all' ? 'медианы таблицы' : 'медианы своего столбца';
  var bandTip = function (bi) {
    var d = bi - BANDS;
    var lo = (d - 0.5) / BANDS * span, hi = (d + 0.5) / BANDS * span;
    if (d === 0) return { title: 'Около медианы', text: 'Отклонение от ' + what + ' меньше ' + nf(span / BANDS / 2, 1) + ' п.п.' };
    return {
      title: d > 0 ? 'Выше медианы' : 'Ниже медианы',
      text: (d > 0 ? '+' : MINUS) + nf(Math.abs(d > 0 ? lo : hi), 0) + '…' +
        (Math.abs(d) === BANDS ? 'и дальше' : (d > 0 ? '+' : MINUS) + nf(Math.abs(d > 0 ? hi : lo), 0)) +
        ' п.п. к ' + what + '. Наведите, чтобы увидеть только эти когорты.'
    };
  };
  var stops = '';
  for (var st = 0; st <= BANDS * 2; st++) {
    stops += '<button class="' + CFG.ns + '-ct-st" data-ctband="' + st + '" type="button"' +
      ' style="background:' + divColorAt((st - BANDS) / BANDS) + '"' + tip(bandTip(st)) +
      ' aria-label="Ступень шкалы ' + (st + 1) + ' из ' + (BANDS * 2 + 1) + '"></button>';
  }
  var h = '<div class="' + CFG.ns + '-ct-legend">' +
    '<div class="' + CFG.ns + '-ct-scale-wrap"><span class="' + CFG.ns + '-ct-end">ниже</span>' +
    '<div class="' + CFG.ns + '-ct-scale" role="group" aria-label="Шкала раскраски">' + stops + '</div>' +
    '<span class="' + CFG.ns + '-ct-end">выше</span></div>' +
    '<div class="' + CFG.ns + '-ct-cfg"><span class="' + CFG.ns + '-ct-cfg-l">Цвет</span>' +
    '<div class="' + CFG.ns + '-sub-tabs tiny">';
  for (var b = 0; b < CT_BASES.length; b++) {
    h += '<button class="' + CFG.ns + '-sub-tab' + (CT_BASES[b].key === base ? ' active' : '') +
      '" data-ctbase="' + CT_BASES[b].key + '"' + tip({ title: CT_BASES[b].label, text: CT_BASES[b].hint }) +
      ' type="button">' + esc(CT_BASES[b].label) + '</button>';
  }
  h += '</div><span class="' + CFG.ns + '-ct-cfg-n"' +
    tip({ text: 'Край шкалы равен максимальному отклонению в этой таблице (' + pct(span, 0) + '), поэтому шкала всегда использована целиком.' }) +
    '>край шкалы ' + pct(span, 0) + '</span></div></div>';

  h += '<div class="' + CFG.ns + '-ct-wrap"><table class="' + CFG.ns + '-cttable"><colgroup>' +
    '<col style="width:64px"><col style="width:112px">';
  for (var ca = 0; ca < maxAge; ca++) h += '<col>';
  h += '</colgroup><thead><tr>' +
    '<th class="txt"' + tip({ text: o.firstTip || 'Месяц первого визита' }) + '>Когорта</th>' +
    '<th class="txt"' + tip({ text: o.sizeNote || 'Столько человек открыли отчёт впервые в этом месяце' }) + '>Пришло</th>';
  for (var aa = 1; aa <= maxAge; aa++) {
    var ref2 = refOf(aa);
    var medTip = ref2 != null
      ? tip({ title: '+' + aa + ' ' + plural(aa, 'месяц', 'месяца', 'месяцев'), rows: [{ label: base === 'all' ? 'Медиана таблицы' : 'Медиана столбца', value: pct(ref2) }] })
      : tip({ title: '+' + aa + ' ' + plural(aa, 'месяц', 'месяца', 'месяцев'), text: 'Доля когорты, активной через ' + aa + ' мес. после первого визита' });
    h += '<th' + medTip + '>+' + aa + ((base === 'col' && ref2 != null) ? '<span class="' + CFG.ns + '-ct-med">м ' + pct(ref2, 0) + '</span>' : '') + '</th>';
  }
  h += '</tr></thead><tbody>';

  for (var rr = 0; rr < rows.length; rr++) {
    var row = rows[rr], cm = row.month;
    var lbl = MONTHS[cm.m] + ' ' + String(cm.y).slice(2);
    h += '<tr><td class="txt"' + tip({ title: MONTHS_FULL[cm.m] + ' ' + cm.y, text: o.firstTip || 'Месяц первого визита' }) + '>' + esc(lbl) + '</td>' +
      '<td' + tip({ title: MONTHS_FULL[cm.m] + ' ' + cm.y, rows: [{ label: 'Пришли впервые', value: nf(row.size), color: CFG.colors.act }] }) + '>' +
      '<div class="' + CFG.ns + '-ct-sz"><span class="' + CFG.ns + '-ct-bar"><i style="width:' +
      (100 * row.size / maxSize).toFixed(1) + '%"></i></span><b>' + nf(row.size) + '</b></div></td>';
    for (var a2 = 1; a2 <= maxAge; a2++) {
      var cell = row.cells[a2 - 1];
      if (!cell) { h += '<td class="' + CFG.ns + '-ct-cell none"></td>'; continue; }
      var p2 = pctOf(row, cell);
      var ref3 = refOf(a2);
      var tipObj = {
        title: lbl + ' → +' + a2 + ' мес',
        rows: [
          { label: 'Вернулись', value: nf(cell.active) + ' из ' + nf(row.size), color: CFG.colors.act },
          { label: 'Удержание', value: pct(p2) }
        ],
        note: []
      };
      if (cell.partial) {
        tipObj.note.push('Месяц не закрыт — значение дорастёт, в раскраске не участвует');
      } else if (ref3 != null) {
        tipObj.rows.push({ label: base === 'all' ? 'Медиана таблицы' : 'Медиана столбца', value: pct(ref3, 0), dash: true, color: CFG.colors.bench });
        tipObj.rows.push({ label: 'Отклонение', value: signed(p2 - ref3, 0, ' п.п.') });
      }
      var nd = cell.partial ? null : normOf(p2, a2);
      h += '<td class="' + CFG.ns + '-ct-cell' + (cell.partial ? ' part' : '') + '"' +
        (nd == null ? '' : ' data-band="' + (bandOf(nd) + BANDS) + '" style="background:' + divColorAt(nd) + '"') +
        tip(tipObj) + '>' + pct(p2, 0) + '</td>';
    }
    h += '</tr>';
  }
  h += '</tbody></table></div>';
  if (o.note) h += '<div class="' + CFG.ns + '-tbl-note">' + o.note + '</div>';
  return h;
}

// --- Кривая удержания (перенос из тела) -------------------------------------
var SVG_W = 760;
function r1(v) { return Math.round(v * 10) / 10; }
function labelStep(n) { return n > 14 ? Math.ceil(n / 12) : 1; }

function retCurveSvg(points, opts) {
  var o = opts || {};
  var C = CFG.colors;
  if (!points.length) return '<div class="' + CFG.ns + '-tbl-note">Закрытых когорт для кривой мало.</div>';
  var n = points.length;
  var padL = 6, padR = 18, top = 34, bottom = 30;
  var H = 280;
  var step = (SVG_W - padL - padR) / Math.max(1, n - 1);
  var yOf = function (pct2) { return top + (1 - pct2 / 100) * (H - top - bottom); };
  var xOf = function (i2) { return padL + i2 * step; };
  var ls = labelStep(n);

  var pts = [], i;
  for (i = 0; i < n; i++) pts.push([xOf(i), yOf(points[i].pct)]);
  var s = 'M' + r1(pts[0][0]) + ' ' + r1(pts[0][1]);
  for (i = 1; i < n; i++) {
    var dx = (pts[i][0] - pts[i - 1][0]) / 2;
    s += 'C' + r1(pts[i - 1][0] + dx) + ' ' + r1(pts[i - 1][1]) + ' ' + r1(pts[i][0] - dx) + ' ' + r1(pts[i][1]) + ' ' + r1(pts[i][0]) + ' ' + r1(pts[i][1]);
  }
  var body = '<text x="' + padL + '" y="16" font-size="' + CFG.fonts.title + '" font-weight="600" fill="' + C.txt + '">' +
    esc(o.title || 'Средняя кривая удержания по всем когортам') + '</text>';
  for (var gy = 0; gy <= 100; gy += 25) {
    var yy = r1(yOf(gy));
    body += '<line x1="' + padL + '" y1="' + yy + '" x2="' + (SVG_W - padR) + '" y2="' + yy +
      '" stroke="' + C.split + '" stroke-dasharray="3 3"/>';
  }
  body += '<path d="' + s + 'L' + r1(pts[n - 1][0]) + ' ' + r1(yOf(0)) + 'L' + r1(pts[0][0]) + ' ' + r1(yOf(0)) + 'Z" fill="rgba(0,115,160,.08)"/>';
  body += '<path d="' + s + '" fill="none" stroke="' + C.act + '" stroke-width="2"/>';
  for (i = 0; i < n; i++) {
    body += '<circle cx="' + r1(pts[i][0]) + '" cy="' + r1(pts[i][1]) + '" r="3.5" fill="' + C.act + '" stroke="#fff" stroke-width="2"' +
      tip({
        title: 'Через ' + points[i].age + ' ' + plural(points[i].age, 'месяц', 'месяца', 'месяцев'),
        rows: [
          { label: 'Возвращаются', value: pct(points[i].pct), color: C.act },
          { label: 'Когорт в расчёте', value: nf(points[i].cohorts), dash: true, color: C.bench }
        ],
        note: 'Доля когорты, активной через N месяцев после первого визита'
      }) + '/>';
    if (i % ls === 0 || i === n - 1) {
      body += '<text x="' + r1(pts[i][0]) + '" y="' + r1(pts[i][1] - 10) + '" font-size="' + CFG.fonts.val + '" text-anchor="middle" fill="' + C.label +
        '" style="paint-order:stroke;stroke:#fff;stroke-width:3px">' + esc(pct(points[i].pct, 0)) + '</text>';
      body += '<text x="' + r1(pts[i][0]) + '" y="' + (H - 12) + '" font-size="11" text-anchor="middle" fill="' + C.axis + '">+' + points[i].age + ' мес</text>';
    }
  }
  return '<svg viewBox="0 0 ' + SVG_W + ' ' + H + '" width="100%" data-dyn-svg="1" style="height:auto;display:block" font-family="' + CFG.fonts.family +
    '" role="img" aria-label="Кривая удержания">' + body + '</svg>';
}

function tabsHtml(tabKey, tabs) {
  var h = '';
  for (var i = 0; i < tabs.length; i++) {
    h += '<button class="' + CFG.ns + '-sub-tab' + (tabs[i].on ? ' active' : '') +
      '" role="tab" aria-selected="' + (tabs[i].on ? 'true' : 'false') +
      '" data-view="' + esc(tabKey) + ':' + esc(tabs[i].key) + '" type="button">' + esc(tabs[i].label) + '</button>';
  }
  return h;
}

function buildHTML() {
  if (MODEL.empty) {
    return buildCSS() + '<div class="' + CFG.ns + '-root"><div class="' + CFG.ns + '-empty" style="margin:16px">' +
      '<b>' + esc(CFG.text.noData) + '</b>Закрепляемость считается по выбору на панели «Отчёты и динамика» — ' +
      'кликните строку каталога или смените разрез.</div></div>';
  }
  var T = titles();
  var body;
  if (state.view === 'curve') {
    body = retCurveSvg(retentionPoints(MODEL.rows), { title: 'Средняя кривая удержания' });
  } else {
    body = cohortTableHtml({
      rows: MODEL.rows,
      firstTip: T.first,
      sizeNote: T.size,
      note: 'В ячейке — доля когорты, вернувшаяся через N месяцев. Чем меряет цвет — переключается в легенде над таблицей; ' +
        'наведите ступень шкалы, чтобы на таблице остались только её ячейки. Серый курсив — месяц ещё не закрыт: значение дорастёт ' +
        'и в раскраске не участвует. Столбца «старт» нет: в нём всегда 100%. Фильтр периода на этот блок не действует.'
    });
  }
  return buildCSS() + '<div class="' + CFG.ns + '-root">' +
    '<div class="' + CFG.ns + '-panel">' +
    '<div class="' + CFG.ns + '-panel-h">' +
    '<div class="' + CFG.ns + '-h-txt"><span>' + esc(T.t) + '</span>' +
    (T.p
      ? '<span class="' + CFG.ns + '-pill"' + tip({ title: 'Выбор закрепляемости', text: 'Задаётся кликом по строке каталога в панели «Отчёты и динамика» выше: ' + T.sub }) + '>' + esc(T.p) + '</span>'
      : '<span class="' + CFG.ns + '-pill mut">весь Proteus</span>') + '</div>' +
    '<div class="' + CFG.ns + '-sub-tabs" role="tablist">' +
    tabsHtml('view', [
      { key: 'cohort', label: 'Когорты', on: state.view !== 'curve' },
      { key: 'curve', label: 'Кривая', on: state.view === 'curve' }
    ]) + '</div></div>' +
    '<div class="' + CFG.ns + '-panel-b">' + body + '</div>' +
    '</div></div>';
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

    // ── КОМПЕНСАЦИЯ ХОСТ-ПАДДИНГА (раунд 4; раунд 5: отступ НЕ возвращаем) ──
    // Хост-карточка красит ячейку белым с паддингом 16px. Снимаем паддинг
    // БЛИЖАЙШЕГО предка (≥12px, ≤5 прыжков) — контент до краёв карточки.
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
    // Раунд 6: канвас = цвет борда, без своих отступов.
    overlay.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;'
      + 'z-index:10;overflow:auto;box-sizing:border-box;border-radius:4px;background:' + CFG.colors.bg + ';';
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(overlay);

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
      var t = getTip();
      t.innerHTML = html;
      t.style.display = 'block';
      t.style.left = '0px';
      t.style.top = '0px';
      var box = t.getBoundingClientRect();
      var pad = 6, gap = 8;
      var left = rect.left + rect.width / 2 - box.width / 2;
      var top = rect.top + rect.height + gap;
      if (top + box.height > window.innerHeight - pad) top = rect.top - box.height - gap;
      left = Math.max(pad, Math.min(left, window.innerWidth - box.width - pad));
      top = Math.max(pad, Math.min(top, window.innerHeight - box.height - pad));
      t.style.left = Math.round(left) + 'px';
      t.style.top = Math.round(top) + 'px';
      t.style.opacity = '1';
    }
    function hideTip() {
      var t = getTip();
      t.style.opacity = '0';
      t.style.display = 'none';
    }
    function renderTip() {
      if (!state.tip) { hideTip(); return; }
      showTip(state.tip.key || '', state.tip.rect);
    }
    // Ширина кривой меряется ПОСЛЕ монтажа (svg width:100%) и уходит в SVG_W;
    // пересборка с новой шириной даёт масштаб 1:1 — подписи не растягиваются
    // вместе с ячейкой, «кривая гигантская» уходит (правка владельца
    // 2026-09-18). Прогон максимум двойной.
    function syncSvgWidth() {
      var svgs = overlay.querySelectorAll('svg[data-dyn-svg]');
      if (!svgs.length) return false;
      var w = svgs[0].clientWidth || 0;
      if (!w || Math.abs(w - SVG_W) <= 2) return false;
      SVG_W = w;
      return true;
    }
    function render() {
      // overlay — скролл-контейнер (overflow:auto): без сохранения позиции
      // клик внизу прыгал наверх (правка владельца 2026-09-18).
      var st = overlay.scrollTop, sl = overlay.scrollLeft;
      overlay.innerHTML = buildHTML();
      if (syncSvgWidth()) overlay.innerHTML = buildHTML();
      overlay.scrollTop = st;
      overlay.scrollLeft = sl;
      renderTip();
    }
    function trigger(node, attr) {
      while (node && node !== overlay) {
        if (node.getAttribute && node.getAttribute(attr) !== null) return node;
        node = node.parentNode;
      }
      return null;
    }

    // Легенда — орган управления: наведение на ступень гасит все ячейки,
    // кроме попавших в неё. Точечная правка классов, БЕЗ render().
    function bandHighlight(el) {
      var wrap = overlay.querySelector('.' + CFG.ns + '-ct-wrap');
      if (!wrap) return;
      var cells = wrap.querySelectorAll('td[data-band]');
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

    function onOver(e) {
      var st = trigger(e.target, 'data-ctband');
      if (st) bandHighlight(st);
      var el = trigger(e.target, 'data-tip');
      if (!el) return;
      state.tip = { rect: el.getBoundingClientRect(), kind: '', key: el.getAttribute('data-tip') || '' };
      renderTip();
    }
    function onOut(e) {
      var st = trigger(e.target, 'data-ctband');
      if (st) bandClear();
      var el = trigger(e.target, 'data-tip');
      if (!el) return;
      var to = e.relatedTarget;
      while (to) {
        if (to === el) return;
        to = to.parentNode;
      }
      state.tip = null;
      hideTip();
    }
    function onClick(e) {
      var tab = trigger(e.target, 'data-view');
      if (tab) {
        var parts = String(tab.getAttribute('data-view')).split(':');
        if (parts.length === 2 && parts[0] === 'view') { state.view = parts[1]; render(); }
        return;
      }
      var ctb = trigger(e.target, 'data-ctbase');
      if (ctb) {
        state.ctBase = ctb.getAttribute('data-ctbase');
        render();
      }
    }

    overlay.addEventListener('mouseover', onOver);
    overlay.addEventListener('mouseout', onOut);
    overlay.addEventListener('click', onClick);

    if (state.onWinResize) window.removeEventListener('resize', state.onWinResize);
    state.onWinResize = function () { if (syncSvgWidth()) render(); if (state.tip) renderTip(); };
    window.addEventListener('resize', state.onWinResize);

    render();

    if (typeof ResizeObserver !== 'undefined') {
      if (state.ro && state.ro.disconnect) state.ro.disconnect();
      var ro = new ResizeObserver(function () {
        overlay.style.width = '100%';
        overlay.style.height = '100%';
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
option = {
  animation: false,
  xAxis: { show: false, type: 'value' },
  yAxis: { show: false, type: 'value' },
  series: [{ type: 'scatter', data: [] }]
};
