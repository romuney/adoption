/* Прогон всех вкладок макета в Node на заглушке DOM.
   Ловит исключения рендера, NaN в числах и нарушения правил графиков.
   В поставку не входит: node _test.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const els = {};
/* Заглушка моделирует главное свойство настоящего DOM, на котором держится
   зонный рендер: когда узлу переписали innerHTML, все узлы ВНУТРИ него —
   другие объекты. Без этого нельзя проверить ни что зона перерисовалась,
   ни что соседняя зона осталась нетронутой. */
function purge(prefix) {
  Object.keys(els).forEach((k) => { if (k.indexOf(prefix) === 0) delete els[k]; });
}
function mkEl(id) {
  const e = {
    id, textContent: '', hidden: false, style: {}, value: '',
    dataset: {}, children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, appendChild() {},
    querySelector() { return mkEl('q'); }, querySelectorAll() { return []; },
    closest() { return null; }, focus() {}, setSelectionRange() {},
    matches() { return false; },
    get parentNode() { return mkEl('p'); },
  };
  let html = '';
  Object.defineProperty(e, 'innerHTML', {
    get() { return html; },
    set(v) {
      html = v;
      if (id === 'view') { purge('z-'); purge('ch-'); }
      else if (id.indexOf('z-') === 0) purge('ch-' + id.slice(2) + '-');
    },
  });
  return e;
}
/* Разметка экрана = склейка всех зон текущей вкладки */
function viewHtml() {
  return Object.keys(els).filter((k) => k.indexOf('z-') === 0)
    .map((k) => els[k].innerHTML).join('');
}
const clickHandlers = [];
const changeHandlers = [];
/* Зонный рендер сравнивает УЗЛЫ, поэтому заглушка держит узлы по id и
   заводит новый, когда зону переписали (dataset.sig меняется). */
const document = {
  getElementById(id) { return (els[id] = els[id] || mkEl(id)); },
  createElement(t) { return mkEl(t); },
  addEventListener(type, fn) {
    if (type === 'click') clickHandlers.push(fn);
    if (type === 'change') changeHandlers.push(fn);
  },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  body: { appendChild() {} },
};

const chartOptions = [];
const echarts = {
  init() {
    return {
      setOption(o) { chartOptions.push(o); },
      dispose() {}, resize() {},
    };
  },
};

const win = { document, echarts, addEventListener() {}, innerWidth: 1600, scrollY: 0, scrollTo() {}, setTimeout, clearTimeout, console };
win.window = win;
const ctx = vm.createContext(win);
ctx.document = document;
ctx.echarts = echarts;

const base = __dirname;
['assets/ui.js', 'assets/data.js', 'assets/charts.js', 'assets/app.js'].forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(base, f), 'utf8'), ctx, { filename: f });
});

/* ------------------------------ Проверки ------------------------------- */
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('  FAIL ' + msg); } };

function deepScanNaN(o, p, hits) {
  if (o == null) return;
  if (typeof o === 'number') { if (!isFinite(o)) hits.push(p); return; }
  if (Array.isArray(o)) { o.forEach((v, i) => deepScanNaN(v, p + '[' + i + ']', hits)); return; }
  if (typeof o === 'object') {
    Object.keys(o).forEach((k) => {
      if (k === 'formatter' || typeof o[k] === 'function') return;
      deepScanNaN(o[k], p + '.' + k, hits);
    });
  }
}

function fireTab(tab) {
  const target = {
    closest(sel) { return sel === '[data-tab]' ? { dataset: { tab } } : null; },
    id: '', dataset: {}, matches() { return false; },
  };
  clickHandlers.forEach((h) => h({ target }));
}

const TABS = ['reports', 'audience'];
console.log('Прогон вкладок\n');

TABS.forEach((t) => {
  chartOptions.length = 0;
  let err = null;
  try { fireTab(t); } catch (e) { err = e; }
  const html = viewHtml();
  console.log('· ' + t);
  ok(!err, 'исключение при рендере: ' + (err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err));
  if (err) return;
  ok(html.length > 3000, 'разметка подозрительно короткая: ' + html.length);
  /* Проверяем наличие контейнера, а не факт пересборки: зона, которая не
     изменилась, графики намеренно не пересоздаёт — см. paint(). */
  ok(/class="chart /.test(html), 'на вкладке нет ни одного графика');
  ok(html.indexOf('undefined') < 0, 'в разметке встретилось "undefined"');
  ok(html.indexOf('NaN') < 0, 'в разметке встретилось "NaN"');
  ok(!/>\s*—\s*<\/div>\s*<div class="k-row">/.test(html), 'пустые значения в KPI');

  chartOptions.forEach((o, i) => {
    const hits = [];
    deepScanNaN(o, 'opt' + i, hits);
    ok(hits.length === 0, 'NaN/Infinity в графике ' + i + ': ' + hits.slice(0, 4).join(', '));
    const ys = [].concat(o.yAxis || []);
    ys.forEach((y, j) => {
      if (y && y.type === 'value') ok(y.min === 0, 'ось значений не от нуля: график ' + i + ', yAxis ' + j);
    });
    const ss = o.series || [];
    ok(ss.length > 0, 'график ' + i + ' без серий');
    ss.forEach((s) => {
      if (s && Array.isArray(s.data)) ok(s.data.length > 0, 'пустая серия "' + (s.name || s.type) + '" в графике ' + i);
    });
  });
  console.log('    разметка ' + html.length + ' симв., графиков ' + chartOptions.length);
});

/* Переключение периода на каждой вкладке */
console.log('\nПереключение периода');
['w', 'm', 'q', 'd'].forEach((g) => {
  const target = {
    closest(sel) { return sel === '[data-grain]' ? { dataset: { grain: g } } : null; },
    id: '', dataset: {}, matches() { return false; },
  };
  let err = null;
  try { clickHandlers.forEach((h) => h({ target })); } catch (e) { err = e; }
  ok(!err, 'период ' + g + ': ' + (err && err.message));
  console.log('· ' + g + ' → ' + (err ? 'ОШИБКА' : 'ок'));
});

/* Подшапка «в разрезе чего»: каждый режим и выбор строки в нём */
console.log('\nВ разрезе чего смотрим');
function fire(sel, dataset) {
  const target = { closest(s2) { return s2 === sel ? { dataset } : null; }, id: '', dataset: {}, matches() { return false; } };
  let err = null;
  try { clickHandlers.forEach((h) => h({ target })); } catch (e) { err = e; }
  return err;
}
fireTab('reports');
[['report', null], ['collection', 'Розница'], ['owner', 'a.petrova'],
 ['lvl3', 'Блок «Технологии»'], ['spec', 'Аналитик']].forEach(([mode, val]) => {
  chartOptions.length = 0;
  let err = fire('[data-mode]', { mode });
  ok(!err, 'режим ' + mode + ': ' + (err && err.stack && err.stack.split('\n').slice(0, 2).join(' | ')));
  if (val) { err = fire('[data-slice]', { slice: mode, val }); ok(!err, 'выбор ' + mode + '=' + val + ': ' + (err && err.message)); }
  const html = viewHtml();
  ok(html.indexOf('NaN') < 0 && html.indexOf('undefined') < 0, 'мусор в разметке, режим ' + mode);
  ok(/class="chart /.test(html), 'режим ' + mode + ': нет контейнера графика динамики');
  console.log('· ' + mode + (val ? ' → ' + val : '') + ' → ' + (err ? 'ОШИБКА' : 'ок, графиков ' + chartOptions.length));
});

/* Выбор конкретного отчёта */
console.log('\nВыбор отчёта');
(function () {
  fire('[data-mode]', { mode: 'report' });
  const id = ctx.PA_DATA.reportMeta[0].dashboard_id;
  chartOptions.length = 0;
  const err = fire('[data-rep]', { rep: String(id) });
  ok(!err, 'выбор отчёта: ' + (err && err.stack && err.stack.split('\n').slice(0, 2).join(' | ')));
  const html = viewHtml();
  ok(html.indexOf('Закрепляемость отчёта') >= 0, 'когорты не переключились на выбранный отчёт');
  ok(html.indexOf('NaN') < 0 && html.indexOf('undefined') < 0, 'мусор в разметке при выборе отчёта');
  console.log('· отчёт ' + id + ' → ' + (err ? 'ОШИБКА' : 'ок, графиков ' + chartOptions.length));
})();

/* Столбца «старт» в когортах быть не должно: он всегда 100% */
console.log('\nКогорты');
(function () {
  const html = viewHtml();
  ok(html.indexOf('>старт<') < 0, 'в когортах остался столбец «старт»');
  ok(/<th class="ct-h"(?:\s[^>]*)?>\+1</.test(html), 'возраст когорт начинается не с +1');
  ok(html.indexOf('ct-bar') >= 0, 'нет полосы размера когорты');
  console.log('· без «старта», возраст с +1, полоса размера на месте');
})();
/* Переключатели внутри панелей: кривая удержания, матрица покрытия */
console.log('\nПереключатели панелей');
[['reports', 'retView', 'curve'], ['reports', 'retView', 'cohort']].forEach(([tab, key, val]) => {
  fireTab(tab);
  chartOptions.length = 0;
  const target = {
    closest(sel) { return sel === '[data-stab]' ? { dataset: { stab: key, val } } : null; },
    id: '', dataset: {}, matches() { return false; },
  };
  let err = null;
  try { clickHandlers.forEach((h) => h({ target })); } catch (e) { err = e; }
  ok(!err, key + '=' + val + ': ' + (err && err.stack && err.stack.split('\n').slice(0, 2).join(' | ')));
  const html = viewHtml();
  ok(html.indexOf('NaN') < 0 && html.indexOf('undefined') < 0, key + '=' + val + ': мусор в разметке');
  console.log('· ' + key + ' = ' + val + ' → ' + (err ? 'ОШИБКА' : 'ок, графиков ' + chartOptions.length));
});

/* Отчёт с широкой AD-группой: покрытие показывать нельзя */
console.log('\nШирокая AD-группа');
(function () {
  const D = ctx.PA_DATA;
  const wide = Object.keys(D.audienceMeta).map(Number).filter((id) => D.audienceMeta[id].is_wide);
  ok(wide.length > 0, 'в данных нет ни одного отчёта с широкой группой');
  if (!wide.length) return;
  fireTab('reports');
  const target = {
    closest(sel) { return sel === '[data-goaud]' ? { dataset: { goaud: String(wide[0]) } } : null; },
    id: '', dataset: {}, matches() { return false; },
  };
  let err = null;
  try { clickHandlers.forEach((h) => h({ target })); } catch (e) { err = e; }
  ok(!err, 'переход к широкой аудитории: ' + (err && err.message));
  const html = viewHtml();
  ok(html.indexOf('покрытие не считаем') >= 0, 'нет предупреждения о широкой группе');
  console.log('· отчёт ' + wide[0] + ' → ' + (err ? 'ОШИБКА' : 'ок, предупреждение на месте'));
})();

/* Кросс-фильтр «как часто заходят»: корзина пересчитывает динамику и KPI,
   а сравнение с предыдущим периодом при этом честно снимается. */
console.log('\nЧастота визитов как кросс-фильтр');
(function () {
  fireTab('reports');
  fire('[data-mode]', { mode: 'report' });
  ['1 день', '8–15 дней', '16+ дней'].forEach((fb) => {
    chartOptions.length = 0;
    const err = fire('[data-freq]', { freq: fb });
    ok(!err, 'корзина ' + fb + ': ' + (err && err.stack && err.stack.split('\n').slice(0, 2).join(' | ')));
    const html = viewHtml();
    ok(html.indexOf('NaN') < 0 && html.indexOf('undefined') < 0, 'мусор в разметке, корзина ' + fb);
    ok(html.indexOf('Частота: ' + fb) >= 0, 'нет чипа снятия фильтра для ' + fb);
    ok(html.indexOf('к пред. 30 дням') < 0, 'при кросс-фильтре осталось сравнение с предыдущим периодом');
    ok(chartOptions.length > 0, 'корзина ' + fb + ': график не собран');
    const hits = [];
    chartOptions.forEach((o, i) => deepScanNaN(o, 'opt' + i, hits));
    ok(hits.length === 0, 'NaN в графике при корзине ' + fb);
    console.log('· ' + fb + ' → ' + (err ? 'ОШИБКА' : 'ок, графиков ' + chartOptions.length));
    fire('[data-freq]', { freq: fb });            // снять
  });
})();

/* Легенда когорт — орган управления: три базы раскраски и пять размахов */
console.log('\nНастройка шкалы когорт');
(function () {
  fireTab('reports');
  ['col', 'all'].forEach((base) => {
    const err = fire('[data-ctbase]', { ctbase: base });
    ok(!err, 'база ' + base + ': ' + (err && err.message));
    const html = viewHtml();
    ok(html.indexOf('NaN') < 0 && html.indexOf('undefined') < 0, 'мусор в разметке, база ' + base);
    ok(/data-ctband="/.test(html), 'база ' + base + ': ступени шкалы не отрисованы');
    ok(/data-band="/.test(html), 'база ' + base + ': у ячеек нет номера ступени');
    console.log('· цвет ' + base + ' → ' + (err ? 'ОШИБКА' : 'ок'));
  });
  ok(viewHtml().indexOf('data-ctspan') < 0, 'контрол размаха шкалы не убран');
  ok(viewHtml().indexOf('по абсолютной доле') < 0, 'база «по абсолютной доле» не убрана');
  fire('[data-ctbase]', { ctbase: 'col' });
})();

/* ЗОННЫЙ РЕНДЕР: действие не должно пересобирать графики, которые от него
   не зависят. Это ровно та жалоба, ради которой рендер разбит на зоны. */
console.log('\nЗоны: лишних перерисовок нет');
(function () {
  fireTab('reports');
  fire('[data-mode]', { mode: 'report' });
  fire('[data-ctbase]', { ctbase: 'col' });

  chartOptions.length = 0;
  fire('[data-ctbase]', { ctbase: 'all' });
  ok(chartOptions.length === 0, 'смена базы раскраски когорт пересобрала ' + chartOptions.length + ' граф.: она не влияет ни на один');
  console.log('· легенда когорт → графики не тронуты');

  chartOptions.length = 0;
  fire('th[data-sort]', { sort: 'views' });
  ok(chartOptions.length === 0, 'сортировка каталога пересобрала ' + chartOptions.length + ' граф.');
  console.log('· сортировка каталога → графики не тронуты');

  /* А вот выбор строки данные меняет — тут перерисовка обязана быть */
  chartOptions.length = 0;
  fire('[data-rep]', { rep: String(ctx.PA_DATA.reportMeta[3].dashboard_id) });
  ok(chartOptions.length > 0, 'выбор отчёта НЕ пересобрал график динамики');
  console.log('· выбор отчёта → динамика пересобрана, как и должна');
  fire('[data-rep]', { rep: String(ctx.PA_DATA.reportMeta[3].dashboard_id) });
})();

/* Вкладка «Аудитория»: область, настройка ЦА, кросс-фильтры */
console.log('\nАудитория: область и целевая аудитория');
(function () {
  const D = ctx.PA_DATA;
  fireTab('audience');
  /* Область теперь один список: выбор задаётся набором отчётов, а не
     режимом. Проверяем, что смена набора пересобирает графики. */
  const allIds = D.reportMeta.map((m) => m.dashboard_id);
  [[allIds[0]], [allIds[0], allIds[1], allIds[2]], [allIds[5]]].forEach((set, i) => {
    chartOptions.length = 0;
    let err = null;
    try {
      ctx.window.__setScope ? ctx.window.__setScope(set) : null;
    } catch (e) { err = e; }
    /* Набор меняем через чекбоксы, как это делает человек */
    /* Снимаем всё и набираем заново — как это делает человек мышью */
    const noneTarget = { closest() { return null; }, id: 'scopeNone', dataset: {}, matches() { return false; } };
    try { clickHandlers.forEach((h) => h({ target: noneTarget })); } catch (e) { err = e; }
    set.forEach((id) => {
      const target = { closest() { return null; }, id: '', dataset: { audrep: String(id) },
        checked: true, matches() { return false; } };
      try { changeHandlers.forEach((h) => h({ target })); } catch (e) { err = e; }
    });
    ok(!err, 'область #' + i + ': ' + (err && err.message));
    const html = viewHtml();
    ok(html.indexOf('NaN') < 0 && html.indexOf('undefined') < 0, 'мусор в разметке, область #' + i);
    ok(html.indexOf('Целевая аудитория') >= 0, 'область #' + i + ': карточки не отрисованы');
    const hits = [];
    chartOptions.forEach((o, j) => deepScanNaN(o, 'opt' + j, hits));
    ok(hits.length === 0, 'NaN в графиках, область #' + i);
    console.log('· область из ' + set.length + ' отч. → ' + (err ? 'ОШИБКА' : 'ок, графиков ' + chartOptions.length));
  });

  /* Конструктор ЦА: открыть, накликать условия, применить, вернуть */
  let err = fire('#audCfgOpen', {});
  els.__ = null;
  const openTarget = { closest() { return null; }, id: 'audCfgOpen', dataset: {}, matches() { return false; } };
  try { clickHandlers.forEach((h) => h({ target: openTarget })); } catch (e) { err = e; }
  ok(!err, 'открытие конструктора ЦА: ' + (err && err.message));
  ok(viewHtml().indexOf('data-auddim') >= 0, 'конструктор ЦА не отрисован');
  ok(viewHtml().indexOf('доступ к области есть у') >= 0, 'конструктор не показывает, у скольких есть доступ');

  err = fire('[data-auddim]', { auddim: 'spec', audval: 'Аналитик' });
  ok(!err, 'выбор условия ЦА: ' + (err && err.message));

  const applyTarget = { closest() { return null; }, id: 'audCfgApply', dataset: {}, matches() { return false; } };
  err = null;
  chartOptions.length = 0;
  try { clickHandlers.forEach((h) => h({ target: applyTarget })); } catch (e) { err = e; }
  ok(!err, 'применение настроенной ЦА: ' + (err && err.stack && err.stack.split('\n').slice(0, 2).join(' | ')));
  let html = viewHtml();
  ok(html.indexOf('Собрана в конструкторе') >= 0, 'ЦА не переключилась на настроенную');
  /* Воронка рисуется своим SVG, а не ECharts: ищем ступень в разметке.
     В заглушке DOM ширины нет, поэтому SVG не строится — проверяем, что
     ступень доехала до сборщика, по подписи данных контейнера. */
  ok(typeof ctx.UI.funnelSvg === 'function', 'сборщик воронки не экспортирован');
  ok(ctx.UI.funnelSvg([{ name: 'Есть доступ к области', value: 10 },
    { name: 'Открыли', value: 4 }], 600, 300).indexOf('Есть доступ к области') >= 0,
    'в воронке нет ступени «есть доступ»');
  ok(html.indexOf('NaN') < 0 && html.indexOf('undefined') < 0, 'мусор в разметке настроенной ЦА');
  console.log('· конструктор ЦА → ок, ступень «есть доступ» на месте');

  const resetTarget = { closest() { return null; }, id: 'audCfgReset', dataset: {}, matches() { return false; } };
  err = null;
  try { clickHandlers.forEach((h) => h({ target: resetTarget })); } catch (e) { err = e; }
  ok(!err, 'возврат к доступу: ' + (err && err.message));
  ok(viewHtml().indexOf('Собрана в конструкторе') < 0, 'ЦА не вернулась к «как роздан доступ»');

  /* Кросс-фильтры: разрез структуры и сегмент поведения */
  chartOptions.length = 0;
  err = fire('[data-audunit]', { audunit: D.CUTS.lvl3.vals[0], audkey: 'lvl3' });
  ok(!err, 'кросс-фильтр по разрезу: ' + (err && err.message));
  html = viewHtml();
  ok(html.indexOf('На экране срез') >= 0, 'плашка ЦА не отметила срез');
  ok(html.indexOf('NaN') < 0 && html.indexOf('undefined') < 0, 'мусор в разметке при кросс-фильтре');
  fire('[data-audunit]', { audunit: D.CUTS.lvl3.vals[0], audkey: 'lvl3' });   // снять

  err = fire('[data-seg]', { seg: 'Постоянный' });
  ok(!err, 'фильтр по сегменту: ' + (err && err.message));
  ok(viewHtml().indexOf('Сегмент: Постоянный') >= 0, 'нет чипа снятия сегмента');
  fire('[data-seg]', { seg: 'Постоянный' });
  console.log('· кросс-фильтры разреза и сегмента → ок');
})();

console.log('\n' + (fails ? fails + ' проверок провалено' : 'Все проверки пройдены'));
process.exit(fails ? 1 : 0);
