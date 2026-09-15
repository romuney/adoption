/* Прогон всех вкладок макета в Node на заглушке DOM.
   Ловит исключения рендера, NaN в числах и нарушения правил графиков.
   В поставку не входит: node _test.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const els = {};
function mkEl(id) {
  const e = {
    id, innerHTML: '', textContent: '', hidden: false, style: {}, value: '',
    dataset: {}, children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, appendChild() {},
    querySelector() { return mkEl('q'); }, querySelectorAll() { return []; },
    closest() { return null; }, focus() {}, setSelectionRange() {},
    matches() { return false; },
    get parentNode() { return mkEl('p'); },
  };
  return e;
}
const clickHandlers = [];
const document = {
  getElementById(id) { return (els[id] = els[id] || mkEl(id)); },
  createElement(t) { return mkEl(t); },
  addEventListener(type, fn) { if (type === 'click') clickHandlers.push(fn); },
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
  const html = els.view ? els.view.innerHTML : '';
  console.log('· ' + t);
  ok(!err, 'исключение при рендере: ' + (err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err));
  if (err) return;
  ok(html.length > 3000, 'разметка подозрительно короткая: ' + html.length);
  ok(chartOptions.length > 0, 'ни один график не собран');
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
  const html = els.view.innerHTML;
  ok(html.indexOf('NaN') < 0 && html.indexOf('undefined') < 0, 'мусор в разметке, режим ' + mode);
  ok(chartOptions.length > 0, 'режим ' + mode + ': график динамики не собран');
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
  const html = els.view.innerHTML;
  ok(html.indexOf('Закрепляемость отчёта') >= 0, 'когорты не переключились на выбранный отчёт');
  ok(html.indexOf('NaN') < 0 && html.indexOf('undefined') < 0, 'мусор в разметке при выборе отчёта');
  console.log('· отчёт ' + id + ' → ' + (err ? 'ОШИБКА' : 'ок, графиков ' + chartOptions.length));
})();

/* Столбца «старт» в когортах быть не должно: он всегда 100% */
console.log('\nКогорты');
(function () {
  const html = els.view.innerHTML;
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
  const html = els.view.innerHTML;
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
  const html = els.view.innerHTML;
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
    const html = els.view.innerHTML;
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
  ['col', 'all', 'abs'].forEach((base) => {
    const err = fire('[data-ctbase]', { ctbase: base });
    ok(!err, 'база ' + base + ': ' + (err && err.message));
    const html = els.view.innerHTML;
    ok(html.indexOf('NaN') < 0 && html.indexOf('undefined') < 0, 'мусор в разметке, база ' + base);
    ok(/data-ctband="/.test(html), 'база ' + base + ': ступени шкалы не отрисованы');
    ok(base === 'abs' || /data-band="/.test(html), 'база ' + base + ': у ячеек нет номера ступени');
    console.log('· цвет ' + base + ' → ' + (err ? 'ОШИБКА' : 'ок'));
  });
  fire('[data-ctbase]', { ctbase: 'col' });
  ['', '5', '10', '30'].forEach((sp) => {
    const err = fire('[data-ctspan]', { ctspan: sp });
    ok(!err, 'размах ' + (sp || 'авто') + ': ' + (err && err.message));
    ok(els.view.innerHTML.indexOf('NaN') < 0, 'NaN при размахе ' + (sp || 'авто'));
  });
  console.log('· размах: авто/±5/±10/±30 → ок');
})();

/* Вкладка «Аудитория»: область, настройка ЦА, кросс-фильтры */
console.log('\nАудитория: область и целевая аудитория');
(function () {
  const D = ctx.PA_DATA;
  fireTab('audience');
  ['one', 'many', 'collection', 'one'].forEach((kind) => {
    chartOptions.length = 0;
    const err = fire('[data-audkind]', { audkind: kind });
    ok(!err, 'область ' + kind + ': ' + (err && err.stack && err.stack.split('\n').slice(0, 2).join(' | ')));
    const html = els.view.innerHTML;
    ok(html.indexOf('NaN') < 0 && html.indexOf('undefined') < 0, 'мусор в разметке, область ' + kind);
    ok(chartOptions.length > 0, 'область ' + kind + ': графики не собраны');
    const hits = [];
    chartOptions.forEach((o, i) => deepScanNaN(o, 'opt' + i, hits));
    ok(hits.length === 0, 'NaN в графиках, область ' + kind);
    console.log('· область ' + kind + ' → ' + (err ? 'ОШИБКА' : 'ок, графиков ' + chartOptions.length));
  });

  /* Конструктор ЦА: открыть, накликать условия, применить, вернуть */
  let err = fire('#audCfgOpen', {});
  els.__ = null;
  const openTarget = { closest() { return null; }, id: 'audCfgOpen', dataset: {}, matches() { return false; } };
  try { clickHandlers.forEach((h) => h({ target: openTarget })); } catch (e) { err = e; }
  ok(!err, 'открытие конструктора ЦА: ' + (err && err.message));
  ok(els.view.innerHTML.indexOf('data-auddim') >= 0, 'конструктор ЦА не отрисован');
  ok(els.view.innerHTML.indexOf('доступ к области есть у') >= 0, 'конструктор не показывает, у скольких есть доступ');

  err = fire('[data-auddim]', { auddim: 'spec', audval: 'Аналитик' });
  ok(!err, 'выбор условия ЦА: ' + (err && err.message));

  const applyTarget = { closest() { return null; }, id: 'audCfgApply', dataset: {}, matches() { return false; } };
  err = null;
  chartOptions.length = 0;
  try { clickHandlers.forEach((h) => h({ target: applyTarget })); } catch (e) { err = e; }
  ok(!err, 'применение настроенной ЦА: ' + (err && err.stack && err.stack.split('\n').slice(0, 2).join(' | ')));
  let html = els.view.innerHTML;
  ok(html.indexOf('Собрана в конструкторе') >= 0, 'ЦА не переключилась на настроенную');
  /* Ступень воронки живёт в option графика, а не в разметке */
  ok(JSON.stringify(chartOptions.map((o) => (o.series || []).map((x) => (x.data || []).map((d) => d && d.name))))
    .indexOf('Есть доступ к области') >= 0, 'в воронке нет ступени «есть доступ»');
  ok(html.indexOf('NaN') < 0 && html.indexOf('undefined') < 0, 'мусор в разметке настроенной ЦА');
  console.log('· конструктор ЦА → ок, ступень «есть доступ» на месте');

  const resetTarget = { closest() { return null; }, id: 'audCfgReset', dataset: {}, matches() { return false; } };
  err = null;
  try { clickHandlers.forEach((h) => h({ target: resetTarget })); } catch (e) { err = e; }
  ok(!err, 'возврат к доступу: ' + (err && err.message));
  ok(els.view.innerHTML.indexOf('Собрана в конструкторе') < 0, 'ЦА не вернулась к «как роздан доступ»');

  /* Кросс-фильтры: разрез структуры и сегмент поведения */
  chartOptions.length = 0;
  err = fire('[data-audunit]', { audunit: D.CUTS.lvl3.vals[0], audkey: 'lvl3' });
  ok(!err, 'кросс-фильтр по разрезу: ' + (err && err.message));
  html = els.view.innerHTML;
  ok(html.indexOf('На экране срез') >= 0, 'плашка ЦА не отметила срез');
  ok(html.indexOf('NaN') < 0 && html.indexOf('undefined') < 0, 'мусор в разметке при кросс-фильтре');
  fire('[data-audunit]', { audunit: D.CUTS.lvl3.vals[0], audkey: 'lvl3' });   // снять

  err = fire('[data-seg]', { seg: 'Постоянный' });
  ok(!err, 'фильтр по сегменту: ' + (err && err.message));
  ok(els.view.innerHTML.indexOf('Сегмент: Постоянный') >= 0, 'нет чипа снятия сегмента');
  fire('[data-seg]', { seg: 'Постоянный' });
  console.log('· кросс-фильтры разреза и сегмента → ок');
})();

console.log('\n' + (fails ? fails + ' проверок провалено' : 'Все проверки пройдены'));
process.exit(fails ? 1 : 0);
