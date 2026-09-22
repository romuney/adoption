// ============================================================================
// pa-shelf.chart.js — полка фильтров (2026-09-18)
// ============================================================================
// КОНТРАКТ PROTEUS: тот же, что у тела/когорт (Виджеты/pa-reports-body.chart.js):
//   ECharts = только холст. Вся визуализация - HTML/CSS/SVG в overlay.
//   Хост = ПОСЛЕДНИЙ [_echarts_instance_]. Canvas прячем. Overlay - appendChild.
//   В САМОМ КОНЦЕ ФАЙЛА, ГЛОБАЛЬНО: option = {...} с пустым scatter.
//
// ЧТО ЭТО. Порт сайдбара макета (renderFilters, Макет/assets/app.js) отдельным
// ECharts-чартом в слоте shelf борда 60260. Датасет pa_dicts (section/k/nm/
// parent, ~23К строк справочников); период 30д/20н/12м/8к — константы JS.
// Каждый контрол эмитит applyCrossFilter: маску читает джиня куба
// (.gen_cube5.py: attrs_f — люди, evd/cpl — отчётные) и когорт (.pa5_coh.sql).
// Дефолты свитков published/actual/excludeOwners=ВКЛ совпадают с дефолтами
// джини: свиток эмитится ТОЛЬКО при отличии от дефолта, «Сбросить» = [].
// Отступ от макета: поиски «логин/ФИО» нет (платформа умеет только IN),
// «название отчёта» — мультиселект по справочнику, а не свободный ввод.
// ============================================================================

// ---------- БЛОК 1: CFG ----------
var CFG = {
  ns: 'pas',                  // префикс классов; НЕ 'prb'/'pac' — чарты соседние
  fields: {
    section: 'section', k: 'k', nm: 'nm', parent: 'parent'
  },
  text: {
    noData: 'Справочник фильтров пуст',
    noDataSub: 'Датасет pa_dicts не отвечает (создайте его по SQL из поставки ' +
      'и поставьте чарт на него — разделы ниже появятся сами). Период работает и без справочника.'
  },
  mode: 'snapshot',
  // Порядок категорий — часть ТЗ (правило 15): для сортировки и автомока.
  order: {
    section: ['rep', 'coll', 'own', 'auth', 'lvl3', 'lvl4', 'stream', 'spec', 'adg'],
    grain: ['d', 'w', 'm', 'q']
  },
  // Период — константы (в data его нет): подписи из GRAINS макета.
  grains: [
    { key: 'd', label: '30 дней' },
    { key: 'w', label: '20 недель' },
    { key: 'm', label: '12 месяцев' },
    { key: 'q', label: '8 кварталов' }
  ],
  // Дефолты свитков — как в макете (published/actual/«искл. владельцев» ВКЛ).
  // КУБ читает те же дефолты в джине: эмитим колонку ТОЛЬКО при отличии.
  swDefaults: {
    published: true, actual: true, certified: false,
    heads: false, excludeOwners: true
  },
  // Секции справочника → конфиг мультиселектов. id — как в макете (f-*).
  // tree: секция значений становится детьми parent-секции (УС: блок→департамент).
  dicts: [
    { id: 'f-rep',       sec: 'rep',    label: 'Название отчёта', all: 'Все отчёты',
      search: 'Найти отчёт', srv: false, emit: 'rep_f' },
    { id: 'f-collection', sec: 'coll',  label: 'Коллекции', all: 'Все коллекции',
      search: 'Найти коллекцию', srv: true, emit: 'coll_f' },
    { id: 'f-owner',     sec: 'own',    label: 'Владельцы', all: 'Все владельцы',
      search: 'Найти владельца', srv: true, emit: 'own_f' },
    { id: 'f-author',    sec: 'auth',   label: 'Авторы', all: 'Все авторы',
      search: 'Найти автора', srv: true, emit: 'auth_f',
      hint: 'Кто отчёт собрал. С владельцем совпадает не всегда: автор ушёл — отчёт остался.' },
    { id: 'f-org',       sec: 'lvl4',   label: 'Управленческая структура', all: 'Вся компания',
      search: 'Найти блок или департамент', srv: true, tree: 'lvl3',
      emit: 'lvl4_f', emitGrp: 'lvl3_f' },
    { id: 'f-stream',    sec: 'stream', label: 'Стрим', all: 'Все стримы',
      search: 'Найти стрим', srv: true, emit: 'stream_f' },
    { id: 'f-spec',      sec: 'spec',   label: 'Специализация', all: 'Все специализации',
      search: 'Найти специализацию', srv: true, emit: 'spec_f' },
    { id: 'f-adgroup',   sec: 'adg',    label: 'AD-группа', all: 'Все группы',
      search: 'Найти группу', srv: true, emit: 'adg_f' }
  ],
  srvTip: {
    title: 'Пересчёт',
    text: 'Этот фильтр меняет SQL-запрос: комбинация атрибутов не помещается ' +
      'в предрасчёт. Остальные переключатели считаются в браузере мгновенно.'
  },
  colors: {
    // Раунд 6 (тело/когорты): канвас = цвет холста борда, панель белая.
    // Полка — сплошная белая колонка без рамки: шов с бордом невидим.
    bg: '#f6f6f6', panel: '#fff', act: '#0073A0'
  },
  fonts: {
    family: 'Inter,-apple-system,"Segoe UI",Roboto,Arial,sans-serif'
  },
  spacing: {}
};

// ---------- БЛОК 2: ВХОД + СОСТОЯНИЕ + ХЕЛПЕРЫ ----------
// ВСЕ строки data, не data[0].
var rawData = (typeof data !== 'undefined' && Array.isArray(data)) ? data : [];

// Состояние переживает перерисовку Proteus: скрипт перезапускается на каждый
// remount, а маска полки при этом НЕ меняется — UI обязан показывать то же.
if (!window.__pvtState) window.__pvtState = {};
var __S = window.__pvtState;
if (!__S[CFG.ns]) __S[CFG.ns] = {
  tip: null,
  grain: 'd',                 // d | w | m | q (дефолт джини куба — тот же)
  picks: {},                  // id мультиселекта → [ключи]; пусто = без фильтра
  grpPicks: {},               // id → [ключи групп] (блоки УС — самостоят. условия)
  sw: {                       // свитки; дефолты = CFG.swDefaults = джине куба
    published: true, actual: true, certified: false,
    heads: false, excludeOwners: true
  },
  open: null,                 // id раскрытого мультиселекта (один, как в макете)
  mq: {},                     // id → строка поиска внутри мультиселекта
  grp: { rep: true, emp: true, opt: true }   // развёрнутость групп полки
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
// rawData (строки pa_dicts) -> справочники по секциям + дерево УС.
// Сортировка по подписи — здесь: SQL отдаёт ORDER BY, но правило 15 требует
// явного порядка в JS (порядок строк ответа нам не подконтролен).
function buildModel() {
  var F = CFG.fields;
  var M = { empty: !rawData.length, dicts: {}, emptySecs: [] };
  var seen = {};
  for (var i = 0; i < rawData.length; i++) {
    var r = rawData[i] || {};
    var sec = String(r[F.section] == null ? '' : r[F.section]);
    if (CFG.order.section.indexOf(sec) < 0) continue;   // неизвестная секция — мимо
    var k = String(r[F.k] == null ? '' : r[F.k]);
    if (!k) continue;
    var nm = String(r[F.nm] == null || r[F.nm] === '' ? k : r[F.nm]);
    if (!M.dicts[sec]) M.dicts[sec] = [];
    var dkey = sec + '|' + k;
    if (seen[dkey]) continue;                           // дедуп по (секция, ключ)
    seen[dkey] = true;
    M.dicts[sec].push({ k: k, nm: nm, parent: String(r[F.parent] == null ? '' : r[F.parent]) });
  }
  for (var s in M.dicts) {
    if (!Object.prototype.hasOwnProperty.call(M.dicts, s)) continue;
    M.dicts[s].sort(function (a, b) { return a.nm < b.nm ? -1 : (a.nm > b.nm ? 1 : (a.k < b.k ? -1 : 1)); });
  }
  // Какие секции пусты — для ноты «настройте датасет» без молчаливых дыр.
  for (var d = 0; d < CFG.dicts.length; d++) {
    var cfgd = CFG.dicts[d];
    if (!M.dicts[cfgd.sec] || !M.dicts[cfgd.sec].length) M.emptySecs.push(cfgd.id);
  }
  M.empty = !rawData.length;
  return M;
}
var MODEL = buildModel();

// Дерево УС: группы = секция блоков, дети = секция значений с parent.
// Блок без детей — тоже группа (пустой список детей): «весь блок» —
// самостоятельное условие, оно переживает появление нового департамента.
function treeOf(groupsSec, childSec) {
  var out = [];
  var gs = MODEL.dicts[groupsSec] || [];
  var cs = MODEL.dicts[childSec] || [];
  for (var i = 0; i < gs.length; i++) {
    var kids = [];
    for (var j = 0; j < cs.length; j++) {
      if (cs[j].parent === gs[i].k) kids.push(cs[j]);
    }
    out.push({ k: gs[i].k, nm: gs[i].nm, kids: kids });
  }
  return out;
}
// items мультиселекта по конфигу: дерево или плоский список.
function itemsOf(cfgd) {
  if (cfgd.tree) {
    var tr = treeOf(cfgd.tree, cfgd.sec);
    if (!tr.length && (MODEL.dicts[cfgd.sec] || []).length) return null;  // есть дети, нет блоков
    return tr;
  }
  return MODEL.dicts[cfgd.sec] || [];
}

// ---------- БЛОК 3.5: МАСКА КРОСС-ФИЛЬТРА (чистые функции) ----------
// Вынесены на верхний уровень сознательно: vm-стенд (.render/vm_shelf.js)
// гоняет их на моках без DOM. emitFilters в БЛОКЕ 6 — только обёртка.
// Инвариант: НИ ОДИН фильтр не несёт value=[] (ронял запрос чарта, 783708);
// пустая маска = полный сброс applyCrossFilter([]) (прецедент 783469).
function applyPick(st, id, key, isGrp, checked) {
  var box = isGrp ? st.grpPicks : st.picks;
  var list = box[id] || [];
  var i = list.indexOf(key);
  if (checked && i < 0) list.push(key);
  if (!checked && i >= 0) list.splice(i, 1);
  box[id] = list;
  return st;
}
function resetState() {
  state.grain = 'd';
  state.picks = {};
  state.grpPicks = {};
  state.sw = {
    published: CFG.swDefaults.published, actual: CFG.swDefaults.actual,
    certified: CFG.swDefaults.certified, heads: CFG.swDefaults.heads,
    excludeOwners: CFG.swDefaults.excludeOwners
  };
  state.open = null;
  state.mq = {};
  state.grp = { rep: true, emp: true, opt: true };
}
function maskOf(st) {
  var mk = function (col, val) { return { column: col, operator: 'IN', value: val }; };
  var fl = [];
  if (st.grain !== 'd') fl.push(mk('period_param', [st.grain]));
  for (var i = 0; i < CFG.dicts.length; i++) {
    var cfgd = CFG.dicts[i];
    var sel = st.picks[cfgd.id] || [];
    var selG = st.grpPicks[cfgd.id] || [];
    if (cfgd.emitGrp && selG.length) fl.push(mk(cfgd.emitGrp, selG));   // блоки УС
    if (sel.length) fl.push(mk(cfgd.emit, sel));
  }
  if (!st.sw.published) fl.push(mk('pub_f', ['0']));
  if (!st.sw.actual) fl.push(mk('act_f', ['0']));
  if (st.sw.certified) fl.push(mk('cert_f', ['1']));
  if (!st.sw.excludeOwners) fl.push(mk('exc_f', ['0']));
  if (st.sw.heads) fl.push(mk('heads_f', ['1']));
  return fl;
}

// ---------- БЛОК 4: ФОРМАТИРОВАНИЕ И ЦВЕТ ----------
function plural(n, one, few, many) {
  var a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

// Тултип — та же плашка, что у тела/когорт (единый стиль проекта).
function tipHtml(o) {
  var s = '<div class="' + CFG.ns + '-tipbox">';
  if (o.title) s += '<span class="' + CFG.ns + '-t-h">' + esc(o.title) + '</span>';
  if (o.text) s += '<span class="' + CFG.ns + '-t-x">' + esc(o.text) + '</span>';
  return s + '</div>';
}
function tip(o) { return ' data-tip="' + esc(tipHtml(o)) + '"'; }
// Значок ⟳ «фильтр меняет SQL-запрос» (renderFilters, SRV).
function srvMark() {
  return ' <span class="' + CFG.ns + '-info"' + tip(CFG.srvTip) +
    ' aria-label="Требует пересчёта">⟳</span>';
}
// Значок i с подсказкой.
function infoMark(text) {
  return ' <span class="' + CFG.ns + '-info"' + tip({ text: text }) + '>i</span>';
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
    P + '-root{width:100%;height:100%;box-sizing:border-box;font-family:' + CFG.fonts.family + ';',
    '  --card:#fff;--line:#e7e9ee;--line2:#eef0f3;--ink:#1f1f1f;--ink2:#3a3f4a;',
    '  --muted:#8a909c;--muted2:#aab0bb;--act:#0073A0;--act-ink:#015A7D;',
    '  --blue-bg:#E8F4F9;--act-line:#C4E2ED;',
    '  --fs-micro:9.5px;--fs-cap:10.5px;--fs-note:11.5px;--fs-body:12.5px;',
    '  --fw-body:400;--fw-med:500;--fw-lead:600;',
    '  --r2:6px;--r3:9px;--r-pill:999px;',
    '  --shadow:0 1px 3px rgba(20,28,45,.06),0 4px 16px rgba(20,28,45,.04);',
    '  --shadow-lg:0 8px 28px rgba(20,28,45,.16);',
    '  color-scheme:light;}',
    P + '-root *{box-sizing:border-box;font-family:inherit;}',

    // Полка = белый блок на весь чарт (раунд 6: без границ и теней, шов
    // с бордом невидим). Колонка скроллится сама.
    P + '-panel{background:var(--card);border-radius:12px;overflow:hidden;height:100%;',
    '  display:flex;flex-direction:column;}',
    P + '-panel-b{padding:14px 12px;overflow:auto;flex:1;min-height:0;}',

    // Шапка «Фильтры + Сбросить» (app.css .flt-head)
    P + '-flt-head{display:flex;align-items:center;justify-content:space-between;',
    '  margin-bottom:10px;gap:8px;}',
    P + '-flt-head ' + P + '-t{font-size:var(--fs-cap);text-transform:uppercase;letter-spacing:.5px;',
    '  color:var(--muted);font-weight:var(--fw-lead);}',

    // Группы (app.css .fgroup/.gh/.cc/.cnt/.gb) — дефолт развёрнуты
    P + '-fgroup{border-top:1px solid var(--line2);padding:10px 0 6px;}',
    P + '-fgroup' + P + '-first{border-top:0;padding-top:0;}',
    P + '-gh{display:flex;align-items:center;gap:6px;width:100%;border:0;',
    '  background:transparent;padding:0 0 8px;cursor:pointer;font-family:inherit;',
    '  font-size:var(--fs-cap);text-transform:uppercase;letter-spacing:.5px;',
    '  color:var(--muted);font-weight:var(--fw-lead);text-align:left;}',
    P + '-gh:hover{color:var(--ink2);}',
    P + '-gh ' + P + '-cc{color:var(--muted2);font-size:9px;transition:transform .16s;}',
    P + '-gh[aria-expanded="false"] ' + P + '-cc{transform:rotate(-90deg);}',
    P + '-gh ' + P + '-cnt{margin-left:auto;background:var(--blue-bg);color:var(--act-ink);',
    '  border-radius:var(--r-pill);padding:1px 6px;font-size:var(--fs-micro);',
    '  font-weight:var(--fw-lead);letter-spacing:0;}',
    P + '-gb{display:flex;flex-direction:column;gap:10px;padding-bottom:8px;}',
    P + '-gb[hidden]{display:none;}',

    P + '-ctl{display:flex;flex-direction:column;gap:5px;}',
    P + '-ctl>label{font-size:var(--fs-cap);text-transform:uppercase;letter-spacing:.5px;',
    '  color:var(--muted);font-weight:var(--fw-lead);}',

    // Сегмент периода (app.css .seg): сетка 2×2
    P + '-seg{display:grid;grid-template-columns:1fr 1fr;gap:3px;background:#eef0f3;',
    '  border-radius:var(--r3);padding:3px;}',
    P + '-seg button{border:0;background:transparent;padding:7px 6px;border-radius:var(--r2);',
    '  font-weight:var(--fw-lead);font-size:var(--fs-note);color:var(--muted);cursor:pointer;',
    '  font-family:inherit;transition:background .15s,color .15s;white-space:nowrap;}',
    P + '-seg button:hover{color:var(--ink2);}',
    P + '-seg button' + P + '-on{background:var(--card);color:var(--ink);box-shadow:var(--shadow);}',

    // Свитки (app.css .swt)
    P + '-swt{display:flex;align-items:center;gap:8px;cursor:pointer;',
    '  font-size:var(--fs-note);color:var(--ink2);font-weight:var(--fw-med);line-height:1.35;}',
    P + '-swt input{appearance:none;width:32px;height:18px;border-radius:var(--r-pill);',
    '  background:#dfe3ea;position:relative;cursor:pointer;flex:0 0 auto;',
    '  transition:background .16s;margin:0;}',
    P + '-swt input:after{content:\'\';position:absolute;top:2px;left:2px;width:14px;height:14px;',
    '  border-radius:50%;background:var(--card);transition:transform .16s;',
    '  box-shadow:0 1px 2px rgba(20,28,45,.25);}',
    P + '-swt input:checked{background:var(--act);}',
    P + '-swt input:checked:after{transform:translateX(14px);}',

    // Значки i / ⟳ (app.css .info)
    P + '-info{display:inline-flex;align-items:center;justify-content:center;',
    '  width:17px;height:17px;border-radius:50%;border:1px solid var(--line);',
    '  background:var(--card);color:var(--muted);font-family:inherit;font-size:11px;',
    '  font-weight:var(--fw-lead);line-height:1;letter-spacing:.2px;cursor:help;flex:0 0 auto;',
    '  user-select:none;transition:border-color .12s,color .12s,background .12s;',
    '  vertical-align:middle;text-decoration:none;}',
    P + '-info:hover{border-color:var(--act);background:var(--blue-bg);color:var(--act);}',

    // Кнопки (app.css .btn.ghost.xs)
    P + '-btn{border:1px solid var(--line);background:var(--card);border-radius:var(--r3);',
    '  padding:4px 14px;font-weight:var(--fw-lead);color:var(--ink2);cursor:pointer;',
    '  font-size:13px;font-family:inherit;display:inline-flex;align-items:center;gap:7px;}',
    P + '-btn' + P + '-ghost{border-color:transparent;color:var(--act);}',
    P + '-btn.ghost:hover{background:var(--blue-bg);}',
    P + '-btn' + P + '-xs{padding:3px 6px;min-width:24px;font-size:11px;}',

    // Мультивыбор (app.css .scopepick.mini и семейство)
    P + '-scopepick{position:relative;min-width:0;}',
    P + '-scope-trg{display:flex;align-items:center;gap:10px;width:100%;',
    '  border:1px solid var(--line);background:var(--card);box-shadow:var(--shadow);',
    '  border-radius:var(--r3);padding:6px 10px;cursor:pointer;font-family:inherit;',
    '  font-size:12px;font-weight:var(--fw-med);color:var(--ink);text-align:left;}',
    P + '-scope-trg:hover{border-color:#d8dce4;}',
    P + '-scopepick' + P + '-open ' + P + '-scope-trg{border-color:var(--act);}',
    P + '-st-txt{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;}',
    P + '-st-n{flex:0 0 auto;font-size:var(--fs-cap);font-weight:var(--fw-med);color:var(--muted);',
    '  background:var(--blue-bg);color:var(--act-ink);border-radius:var(--r-pill);padding:1px 8px;}',
    P + '-st-c{flex:0 0 auto;color:var(--muted2);font-size:10px;transition:transform .16s;}',
    P + '-scopepick' + P + '-open ' + P + '-st-c{transform:rotate(180deg);}',
    P + '-scope-body{position:absolute;z-index:60;top:calc(100% + 4px);left:0;right:0;',
    '  border:1px solid var(--line);border-radius:var(--r3);background:var(--card);',
    '  padding:8px;display:flex;flex-direction:column;gap:8px;box-shadow:var(--shadow-lg);}',
    P + '-psearch{position:relative;flex:0 0 auto;color:var(--muted);}',
    P + '-psearch input{border:1px solid var(--line);background:var(--card);border-radius:var(--r3);',
    '  padding:7px 10px 7px 28px;font-size:12px;font-weight:var(--fw-med);color:var(--ink);',
    '  width:100%;font-family:inherit;}',
    P + '-psearch input::placeholder{color:var(--muted2);font-weight:var(--fw-body);}',
    P + '-psearch input:focus{outline:none;border-color:var(--act);}',
    P + '-psearch svg{position:absolute;left:9px;top:50%;transform:translateY(-50%);pointer-events:none;}',
    P + '-scope-act{display:flex;gap:10px;}',
    P + '-pickbox{max-height:196px;overflow:auto;border:1px solid var(--line);',
    '  border-radius:var(--r3);padding:6px 8px;background:var(--card);}',
    P + '-pickgrp+' + P + '-pickgrp{margin-top:8px;padding-top:8px;border-top:1px solid var(--line2);}',
    P + '-pickrow{display:flex;align-items:center;gap:8px;padding:3px 2px;',
    '  font-size:var(--fs-note);color:var(--ink2);cursor:pointer;line-height:1.3;}',
    P + '-pickrow:hover{color:var(--ink);}',
    P + '-pickrow' + P + '-head{font-weight:var(--fw-lead);color:var(--ink);font-size:var(--fs-body);}',
    P + '-pickrow:not(' + P + '-head){padding-left:14px;}',
    P + '-pickrow input{accent-color:var(--act);margin:0;flex:0 0 auto;}',
    P + '-pickrow span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    P + '-pickempty{font-size:var(--fs-note);color:var(--muted);padding:10px 2px;}',
    P + '-pcount{font-style:normal;margin-left:auto;font-size:var(--fs-micro);font-weight:var(--fw-lead);',
    '  color:var(--muted2);background:#f2f4f7;border-radius:var(--r-pill);padding:1px 6px;flex:0 0 auto;}',
    P + '-pcount' + P + '-on{background:var(--blue-bg);color:var(--act-ink);}',

    P + '-note{font-size:var(--fs-note);color:var(--muted);line-height:1.5;}',
    P + '-note b{color:var(--ink2);font-weight:600;}',

    // Тултип живёт В BODY — шрифт и position:fixed явно.
    P + '-tip{position:fixed;z-index:99999;pointer-events:none;opacity:0;display:none;'
           + 'font-family:' + CFG.fonts.family + ';box-sizing:border-box;background:#fff;',
    '  border:1px solid #e7e9ee;border-radius:9px;padding:7px 10px;max-width:260px;',
    '  box-shadow:0 10px 30px rgba(24,33,50,.18),0 2px 6px rgba(24,33,50,.08);',
    '  transition:opacity .08s;}',
    P + '-tip ' + P + '-t-h{display:block;font-size:10px;font-weight:600;letter-spacing:.3px;text-transform:uppercase;color:#8a909c;margin-bottom:5px;}',
    P + '-tip ' + P + '-t-x{display:block;font-size:11.5px;color:#3a3f4a;line-height:1.4;}',
    '</style>'
  ].join('\n');
}
// --- Мультиселект (порт U.multi, ui.js 622-684) -----------------------------
// Состояния триггера: «Все X» / одно значение / «N условий». Родитель дерева —
// самостоятельное условие, а не «отметить всех детей» (макет, комментарий
// U.multi): фильтр переживает появление нового департамента.
function labelOf(cfgd, key) {
  var items = itemsOf(cfgd);
  if (Object.prototype.toString.call(items) === '[object Array]') {
    for (var i = 0; i < items.length; i++) {
      if (items[i].k === key) return items[i].nm;
      var kids = items[i].kids;
      if (kids) {
        for (var j = 0; j < kids.length; j++) if (kids[j].k === key) return kids[j].nm;
      }
    }
  }
  return String(key);
}
function multiHtml(cfgd) {
  var sel = state.picks[cfgd.id] || [];
  var selG = state.grpPicks[cfgd.id] || [];
  var open = state.open === cfgd.id;
  var q = (state.mq[cfgd.id] || '').toLowerCase();
  var hit = function (lbl) { return !q || String(lbl).toLowerCase().indexOf(q) >= 0; };

  var n = sel.length + selG.length;
  var one = sel.length === 1 && !selG.length ? labelOf(cfgd, sel[0])
    : (selG.length === 1 && !sel.length ? labelOf(cfgd, selG[0]) : null);
  var txt = n === 0 ? cfgd.all
    : (one != null ? one : n + ' ' + plural(n, 'условие', 'условия', 'условий'));

  var body = '';
  if (open) {
    var list = '';
    var items = itemsOf(cfgd);
    var isTree = !!cfgd.tree && items && items.length && items[0].kids;
    if (isTree) {
      for (var g = 0; g < items.length; g++) {
        var gr = items[g];
        var kids = [];
        for (var kk = 0; kk < gr.kids.length; kk++) {
          if (hit(gr.kids[kk].nm) || hit(gr.nm)) kids.push(gr.kids[kk]);
        }
        if (!kids.length && !hit(gr.nm)) continue;
        var gon = selG.indexOf(gr.k) >= 0;
        var kn = 0;
        for (var k2 = 0; k2 < kids.length; k2++) if (sel.indexOf(kids[k2].k) >= 0) kn++;
        list += '<div class="' + CFG.ns + '-pickgrp">' +
          '<label class="' + CFG.ns + '-pickrow ' + CFG.ns + '-head"><input type="checkbox" data-mgrp="' + esc(cfgd.id) + '"' +
            ' data-mkey="' + esc(gr.k) + '"' + (gon ? ' checked' : '') + '>' +
            '<span>' + esc(gr.nm) + '</span>' +
            (kn ? '<i class="' + CFG.ns + '-pcount ' + CFG.ns + '-on">' + kn + '</i>' : '') + '</label>' +
          kids.map(function (it) {
            return '<label class="' + CFG.ns + '-pickrow"><input type="checkbox" data-mval="' + esc(cfgd.id) + '"' +
              ' data-mkey="' + esc(it.k) + '"' + (sel.indexOf(it.k) >= 0 ? ' checked' : '') + '>' +
              '<span>' + esc(it.nm) + '</span></label>';
          }).join('') +
          '</div>';
      }
    } else {
      var flat = Object.prototype.toString.call(items) === '[object Array]' ? items : [];
      list = flat.filter(function (it) { return hit(it.nm); }).map(function (it) {
        return '<label class="' + CFG.ns + '-pickrow"><input type="checkbox" data-mval="' + esc(cfgd.id) + '"' +
          ' data-mkey="' + esc(it.k) + '"' + (sel.indexOf(it.k) >= 0 ? ' checked' : '') + '>' +
          '<span>' + esc(it.nm) + '</span></label>';
      }).join('');
    }
    body = '<div class="' + CFG.ns + '-scope-body">' +
      '<div class="' + CFG.ns + '-psearch"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" ' +
        'stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7"/>' +
        '<path d="M20 20l-3.5-3.5"/></svg><input type="search" data-msearch="' + esc(cfgd.id) + '"' +
        ' placeholder="' + esc(cfgd.search || 'Найти') + '" value="' + esc(state.mq[cfgd.id] || '') + '"></div>' +
      '<div class="' + CFG.ns + '-pickbox" role="group" aria-label="' + esc(cfgd.label) + '">' +
        (list || '<div class="' + CFG.ns + '-pickempty">Ничего не найдено</div>') + '</div>' +
      (n ? '<div class="' + CFG.ns + '-scope-act"><button class="' + CFG.ns + '-btn ' + CFG.ns + '-ghost ' + CFG.ns + '-xs" type="button" data-mclear="' +
        esc(cfgd.id) + '">Снять всё</button></div>' : '') +
      '</div>';
  }

  return '<div class="' + CFG.ns + '-ctl"><label>' + esc(cfgd.label) + (cfgd.srv ? srvMark() : '') +
    (cfgd.hint ? infoMark(cfgd.hint) : '') + '</label>' +
    '<div class="' + CFG.ns + '-scopepick ' + CFG.ns + '-mini' + (open ? ' ' + CFG.ns + '-open' : '') +
      '" data-scope="' + esc(cfgd.id) + '">' +
    '<button class="' + CFG.ns + '-scope-trg" type="button" data-mtoggle="' + esc(cfgd.id) + '"' +
      ' aria-expanded="' + open + '" aria-haspopup="true" data-action="toggle"' +
      ' aria-label="' + esc(cfgd.label) + '">' +
      '<span class="' + CFG.ns + '-st-txt">' + esc(txt) + '</span>' +
      (n > 1 ? '<span class="' + CFG.ns + '-st-n">' + n + '</span>' : '') +
      '<span class="' + CFG.ns + '-st-c" aria-hidden="true">▾</span>' +
    '</button>' + body + '</div></div>';
}

// Свиток (app.js swt): key — data-f, дефолты в state.sw.
function swtHtml(key, label, on, hint) {
  return '<label class="' + CFG.ns + '-swt"><input type="checkbox" data-f="' + esc(key) + '"' +
    (on ? ' checked' : '') + '><span>' + esc(label) + (hint ? infoMark(hint) : '') + '</span></label>';
}

// Сворачиваемая группа полки (app.js grp): счётчик активных условий.
function grpHtml(id, title, cnt, bodyHtml, first) {
  var open = state.grp[id] !== false;
  return '<div class="' + CFG.ns + '-fgroup' + (first ? ' ' + CFG.ns + '-first' : '') + '">' +
    '<button class="' + CFG.ns + '-gh" type="button" data-grp="' + esc(id) + '" data-action="toggle"' +
      ' aria-expanded="' + open + '">' +
      '<span class="' + CFG.ns + '-cc" aria-hidden="true">▾</span>' + esc(title) +
      (cnt ? '<span class="' + CFG.ns + '-cnt">' + cnt + '</span>' : '') + '</button>' +
    '<div class="' + CFG.ns + '-gb"' + (open ? '' : ' hidden') + '>' + bodyHtml + '</div></div>';
}

function pickCnt(id) { return (state.picks[id] || []).length + (state.grpPicks[id] || []).length; }

// Контролы по конфигу: только те, чья секция есть в справочнике (или дерево
// по непустой паре секций). Отсутствующие секции молча не прячем: если
// справочника нет вовсе — модель пустая и групп не будет вообще (нота выше).
function ctlHtml(cfgd) {
  if (cfgd.tree) {
    var gs = MODEL.dicts[cfgd.tree] || [];
    var cs = MODEL.dicts[cfgd.sec] || [];
    if (!gs.length && !cs.length) return '';
  } else if (!(MODEL.dicts[cfgd.sec] || []).length) {
    return '';
  }
  return multiHtml(cfgd);
}

function buildHTML() {
  var h = [];
  h.push('<div class="' + CFG.ns + '-root"><div class="' + CFG.ns + '-panel"><div class="' + CFG.ns + '-panel-b">');

  // Шапка: «Фильтры» + Сбросить (возврат к дефолтам макета и маска []).
  h.push('<div class="' + CFG.ns + '-flt-head"><span class="' + CFG.ns + '-t">Фильтры</span>' +
    '<button class="' + CFG.ns + '-btn ' + CFG.ns + '-ghost ' + CFG.ns + '-xs" type="button" id="fltReset" data-action="reset">Сбросить</button></div>');

  // Период — константы, работает и без справочника.
  var seg = '<div class="' + CFG.ns + '-ctl"><label>Период, последние</label><div class="' + CFG.ns + '-seg">';
  for (var gi = 0; gi < CFG.grains.length; gi++) {
    var g = CFG.grains[gi];
    seg += '<button type="button" data-grain="' + g.key + '" data-action="grain"' +
      (state.grain === g.key ? ' class="' + CFG.ns + '-on"' : '') + '>' + esc(g.label) + '</button>';
  }
  seg += '</div></div>';
  h.push('<div class="' + CFG.ns + '-fgroup ' + CFG.ns + '-first"><div class="' + CFG.ns + '-gb">' + seg + '</div></div>');

  if (MODEL.empty) {
    // Справочника нет: период жив, остальное — нота (не молчаливая дыра).
    h.push('<div class="' + CFG.ns + '-fgroup"><div class="' + CFG.ns + '-note"><b>' +
      esc(CFG.text.noData) + '</b> ' + esc(CFG.text.noDataSub) + '</div></div>');
  } else {
    // «Отчёты»: поиск по названию (через справочник), коллекции, владельцы,
    // авторы, свитки опубликованных/актуальных/сертифицированных.
    var repBody = '';
    for (var d1 = 0; d1 < 4; d1++) repBody += ctlHtml(CFG.dicts[d1]);
    repBody += swtHtml('published', 'Только опубликованные', state.sw.published);
    repBody += swtHtml('actual', 'Только актуальные', state.sw.actual);
    repBody += swtHtml('certified', 'Только сертифицированные', state.sw.certified);
    var repCnt = pickCnt('f-rep') + pickCnt('f-collection') + pickCnt('f-owner') +
      pickCnt('f-author') + (state.sw.certified ? 1 : 0);
    h.push(grpHtml('rep', 'Отчёты', repCnt, repBody));

    // «Сотрудники»: дерево УС, стрим, специализация, AD-группа, тим-лиды.
    // Логин/ФИО из макета здесь НЕТ: платформа умеет только IN (NOTES §6).
    var empBody = '';
    for (var d2 = 4; d2 < CFG.dicts.length; d2++) empBody += ctlHtml(CFG.dicts[d2]);
    empBody += swtHtml('heads', 'Только тим-лиды', state.sw.heads,
      'Руководитель команды по управленческой структуре. Смотрят отчётность иначе: реже, но регулярнее.');
    var empCnt = pickCnt('f-org') + pickCnt('f-stream') + pickCnt('f-spec') +
      pickCnt('f-adgroup') + (state.sw.heads ? 1 : 0);
    h.push(grpHtml('emp', 'Сотрудники', empCnt, empBody));

    // «Опции»: счётчик 1 при включённом «исключить владельцев» — как в макете
    // (дефолт включён, поэтому на входе полка показывает cnt=1).
    var optBody = swtHtml('excludeOwners', 'Исключить владельцев из просмотров',
      state.sw.excludeOwners,
      'Владелец открывает свой отчёт при каждой правке — его визиты завышают аудиторию.');
    h.push(grpHtml('opt', 'Опции', state.sw.excludeOwners ? 1 : 0, optBody));
  }

  h.push('</div></div></div>');
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
      + 'z-index:10;overflow:auto;box-sizing:border-box;border-radius:4px;background:' + CFG.colors.bg + ';';
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(overlay);

    // ── КОМПЕНСАЦИЯ ХОСТ-ПАДДИНГА (как у тела/когорт, раунд 4) ──
    // Хост-карточка несёт padding:16px (emotion-правило форка) — снимаем,
    // иначе полка отступает от краёв ячейки и появляется рамка.
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
      // data-tip несёт ГОТОВЫЙ html плашки (tipHtml) — показываем как есть.
      showTip(state.tip.key || '', state.tip.rect);
    }

    // render ТОЛЬКО пересобирает разметку. Скролл колонки сохраняем:
    // overlay — скролл-контейнер, пересборка без сохранения прыгает наверх
    // (грабля раунда 7 тела).
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
      // Якорь — rect ЦЕЛИ как есть; содержимое плашки лежит готовым
      // html в самом data-tip (tipHtml при сборке разметки).
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

    // ── ЭМИССИЯ КРОСС-ФИЛЬТРА ──
    // Маску собирает чистая maskOf() (БЛОК 3.5, гоняется vm-стендом без DOM)
    // и задаётся ЦЕЛИКОМ каждым вызовом (как emitSel тела). Носители *_f
    // в SELECT датасетов-приёмников НЕ выводятся — фильтрацию делает джиня
    // куба (.gen_cube5.py).
    function emitFilters() {
      if (typeof applyCrossFilter !== 'function') return;
      applyCrossFilter(maskOf(state));
    }

    function onClick(e) {
      // Клик мимо открытого мультиселекта закрывает его (как в макете).
      // data-scope стоит на КОРНЕ scopepick: клик по списку/поиску — «внутри».
      var spNode = trigger(e.target, 'data-scope');
      if (state.open != null && (!spNode || spNode.getAttribute('data-scope') !== state.open)) {
        state.open = null;
        render();
      }

      // Кнопки периода: data-grain.
      var gb = trigger(e.target, 'data-grain');
      if (gb) {
        var gk = gb.getAttribute('data-grain');
        if (gk && gk !== state.grain) { state.grain = gk; render(); emitFilters(); }
        return;
      }

      // Раскрытие/закрытие мультиселекта.
      var mt = trigger(e.target, 'data-mtoggle');
      if (mt) {
        var mid = mt.getAttribute('data-mtoggle');
        state.open = (state.open === mid) ? null : mid;
        render();
        if (state.open != null) {
          var inp = overlay.querySelector('input[data-msearch="' + mid + '"]');
          if (inp) inp.focus();
        }
        return;
      }

      // «Снять всё» внутри мультиселекта.
      var mc = trigger(e.target, 'data-mclear');
      if (mc) {
        var cid = mc.getAttribute('data-mclear');
        state.picks[cid] = [];
        state.grpPicks[cid] = [];
        render();
        emitFilters();
        return;
      }

      // Сворачивание групп полки.
      var gr = trigger(e.target, 'data-grp');
      if (gr) {
        var gid = gr.getAttribute('data-grp');
        state.grp[gid] = state.grp[gid] === false;
        render();
        return;
      }

      // «Сбросить»: возврат к дефолтам макета; маска [] = полное очищение
      // (прецедент 783469: эмиттер так сбрасывает выбор, «график видит всё»).
      var rs = trigger(e.target, 'data-action');
      if (rs && rs.getAttribute('data-action') === 'reset') {
        resetState();
        render();
        emitFilters();
      }
    }

    // Чекбоксы мультиселекта: change, не click (label/input дают и то и то —
    // обработка в click дублировала бы). Один клик = один фильтр.
    function onChange(e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;

      var mv = t.getAttribute('data-mval');
      if (mv !== null && mv !== '') {
        applyPick(state, mv, t.getAttribute('data-mkey'), false, t.checked);
        render();
        emitFilters();
        return;
      }
      var mg = t.getAttribute('data-mgrp');
      if (mg !== null && mg !== '') {
        applyPick(state, mg, t.getAttribute('data-mkey'), true, t.checked);
        render();
        emitFilters();
        return;
      }
      var sf = t.getAttribute('data-f');
      if (sf !== null && sf !== '') {
        state.sw[sf] = t.checked;
        render();
        emitFilters();
      }
    }

    // Поиск внутри мультиселекта — живая фильтрация без эмиссии.
    function onInput(e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var ms = t.getAttribute('data-msearch');
      if (ms === null || ms === '') return;
      state.mq[ms] = t.value;
      // Пересобираем ТОЛЬКО список: полный render() уронит фокус и каретку.
      // Хак: пересобираем разметку всего overlay, но возвращаем фокус и
      // каретку в поле поиска — иначе «живая каретка» (E23b) пропадает.
      var st = overlay.scrollTop;
      overlay.innerHTML = buildHTML();
      overlay.scrollTop = st;
      var inp = overlay.querySelector('input[data-msearch="' + ms + '"]');
      if (inp) {
        inp.focus();
        if (inp.setSelectionRange) {
          try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (er) { /* type=search может отказать */ }
        }
      }
    }

    // Escape закрывает открытый мультиселект (smoke E24).
    function onKeydown(e) {
      if ((e.keyCode || e.which) !== 27) return;
      if (state.open != null) {
        state.open = null;
        render();
      }
    }

    overlay.addEventListener('mouseover', onOver);
    overlay.addEventListener('mouseout', onOut);
    overlay.addEventListener('click', onClick);
    overlay.addEventListener('change', onChange);
    overlay.addEventListener('input', onInput);
    overlay.addEventListener('keydown', onKeydown);

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
