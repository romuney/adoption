/* Прогон макета 2.3 в Node на заглушке DOM.
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
/* Разметка экрана = склейка всех зон */
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

function fire(sel, dataset, shift) {
  const target = { closest(s2) { return s2 === sel ? { dataset } : null; }, id: '', dataset: {}, matches() { return false; } };
  let err = null;
  try { clickHandlers.forEach((h) => h({ target, shiftKey: !!shift })); } catch (e) { err = e; }
  return err;
}
function fireTab(tab) { return fire('[data-tab]', { tab }); }
function fireChange(dataset, checked) {
  const target = { dataset, type: 'checkbox', checked: !!checked,
    closest() { return null; }, id: '', matches() { return false; } };
  let err = null;
  try { changeHandlers.forEach((h) => h({ target })); } catch (e) { err = e; }
  return err;
}
function resetPicks() {
  const target = { closest() { return null; }, id: 'fltReset', dataset: {}, matches() { return false; } };
  try { clickHandlers.forEach((h) => h({ target })); } catch (e) { /* фильтров нет — ок */ }
}
/* Строк в каталоге сейчас */
const repCount = () => (viewHtml().match(/data-rep="/g) || []).length;

/* --------------------------- Стартовый экран ---------------------------- */
console.log('Вкладка «Отчёты»: стартовый экран\n');
(function () {
  const html = viewHtml();
  ok(html.length > 5000, 'разметка подозрительно короткая: ' + html.length);
  ok(/class="chart /.test(html), 'на экране нет ни одного графика');
  ok(html.indexOf('undefined') < 0, 'в разметке встретилось "undefined"');
  ok(html.indexOf('NaN') < 0, 'в разметке встретилось "NaN"');
  ok(/data-grain="(d|w|m|q)"/.test(html), 'в полоске нет переключателя периода');
  ok(html.indexOf('Каталог') >= 0, 'нет панели «Каталог»');
  ok(html.indexOf('Динамика') >= 0, 'нет панели динамики');
  ok(html.indexOf('Кто смотрит') >= 0, 'нет вкладки «Кто смотрит» в правой панели');
  /* Правило без дублей: каталог — только отчётные разрезы */
  ok(html.indexOf('data-mode="lvl3"') < 0 && html.indexOf('data-mode="spec"') < 0,
    'в подшапке каталога остались людские разрезы');
  /* Частота живёт внутри «Кто смотрит», не отдельной панелью */
  ok(html.indexOf('data-freq=') < 0, 'полоса частоты видна без открытия «Кто смотрит»');
  ok(html.indexOf('data-leg=') >= 0, 'у динамики нет пилюлек легенды');

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
  console.log('· разметка ' + html.length + ' симв., графиков ' + chartOptions.length);
})();

/* Период */
console.log('\nПереключение периода');
['w', 'm', 'q', 'd'].forEach((g) => {
  const err = fire('[data-grain]', { grain: g });
  ok(!err, 'период ' + g + ': ' + (err && err.message));
  ok(viewHtml().indexOf('NaN') < 0 && viewHtml().indexOf('undefined') < 0, 'мусор в разметке, период ' + g);
  console.log('· ' + g + ' → ' + (err ? 'ОШИБКА' : 'ок'));
});
fire('[data-grain]', { grain: 'd' });

/* Подшапка «в разрезе чего»: каждый режим и выбор строки в нём */
console.log('\nВ разрезе чего смотрим');
resetPicks();
fire('[data-mode]', { mode: 'report' });
[['report', null], ['collection', 'Розница'], ['owner', 'a.petrova']].forEach(([mode, val]) => {
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
  resetPicks();
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

/* Переключатель правой панели: «Кто смотрит» со сводной таблицей,
   поимённым режимом и корзинами частоты внутри. */
console.log('\nПравая панель: Динамика ⇄ Кто смотрит');
(function () {
  resetPicks();
  let err = fire('[data-stab]', { stab: 'rightView', val: 'who' });
  ok(!err, 'переключение на «Кто смотрит»: ' + (err && err.message));
  let html = viewHtml();
  /* «Кто смотрит» — всегда поимённо: таблица сразу, без выбора режима */
  ok(html.indexOf('Сотрудник') >= 0, 'поимённая таблица не отрисована сразу');
  ok(html.indexOf('data-ddval="people"') < 0, 'в «Кто смотрит» остался режим-дропдаун «Поимённо»');
  ok(html.indexOf('Стаж') >= 0, 'в поимённом списке нет стажа');
  ok(/class="rflag head"/.test(html), 'у руководителей нет признака возле ФИО');
  ok(html.indexOf('data-freq=') >= 0, 'нет кликабельной полосы частоты (сигаретки)');
  ok(html.indexOf('data-stab="rightView"') >= 0, 'в «Кто смотрит» нет переключателя возврата к «Динамике»');
  ok(html.indexOf('NaN') < 0 && html.indexOf('undefined') < 0, 'мусор в разметке «Кто смотрит»');
  console.log('· поимённо сразу + сигаретка частоты, есть путь назад → ок');

  /* Группировка списка: дерево слева, каретка, клик по имени — людская шина */
  err = fire('[data-ddtoggle]', { ddtoggle: 'whoCut' });
  ok(!err, 'раскрытие группировки: ' + (err && err.message));
  ok(viewHtml().indexOf('data-ddval="lvl3"') >= 0, 'в группировке «Кто смотрит» нет УС-3');
  err = fire('[data-ddpick]', { ddpick: 'whoCut', ddval: 'lvl4' });
  ok(!err, 'группировка по департаменту: ' + (err && err.message));
  html = viewHtml();
  ok(/class="gh-caret/.test(html), 'у групп нет каретки слева');
  ok(/class="grp-h[^"]*" data-who=/.test(html), 'у групп нет кликабельной строки');
  ok(/человек · /.test(html), 'у групп нет счётчика с долей');
  /* Дерево по департаменту ДВУХУРОВНЕВОЕ: блок у левого края, департамент
     правее, люди — с глубоким отступом */
  ok(/class="grp-h blk/.test(html), 'нет строки БЛОКА у левого края');
  ok(/class="grp-h dep/.test(html), 'нет строки департамента вторым уровнем');
  ok(/class="grp-child deep/.test(html), 'люди под департаментами без глубокого отступа');
  ok(/data-wofold="all"/.test(html), 'нет кнопки «Свернуть все»');
  ok(/data-wofold="none"/.test(html), 'нет кнопки «Развернуть все»');
  const grpName = (html.match(/data-whogrp="([^"]+)"/) || [])[1];
  ok(!!grpName, 'нет сворачиваемой группы');
  err = fire('[data-whogrp]', { whogrp: grpName });
  ok(!err, 'сворачивание группы: ' + (err && err.message));
  ok(viewHtml().indexOf('aria-expanded="false"') >= 0, 'группа не свернулась кликом');
  /* Свернуть всё — дерево пустеет до заголовков; развернуть всё — вернулось */
  err = fire('[data-wofold]', { wofold: 'all' });
  ok(!err, 'свернуть все: ' + (err && err.message));
  ok(!/class="grp-child/.test(viewHtml()), '«свернуть все» оставило людей в дереве');
  const nHeads = (viewHtml().match(/class="grp-h /g) || []).length;
  err = fire('[data-wofold]', { wofold: 'none' });
  ok(!err, 'развернуть все: ' + (err && err.message));
  ok((viewHtml().match(/class="grp-h /g) || []).length > nHeads, '«развернуть все» не вернуло узлы департаментов');
  ok(/class="grp-child deep/.test(viewHtml()), '«развернуть все» не вернуло людей');
  fire('[data-ddpick]', { ddpick: 'whoCut', ddval: 'none' });
  console.log('· дерево блок→департамент→люди, свернуть/развернуть все → ок');

  err = fire('[data-stab]', { stab: 'rightView', val: 'dyn' });
  ok(!err, 'возврат к динамике: ' + (err && err.message));
  ok(/class="chart /.test(viewHtml()), 'после возврата нет графика динамики');
  console.log('· назад к динамике → ок');
})();

/* ЛЮДСКАЯ ШИНА: клик по строке «Кто смотрит» сужает каталог, подписывает
   это в его шапке и чипом; повторный клик снимает. */
console.log('\nЛюдская шина: публика сужает каталог');
(function () {
  resetPicks();
  fire('[data-mode]', { mode: 'report' });
  const base = repCount();
  ok(base > 0, 'в каталоге нет строк отчётов');

  const D = ctx.PA_DATA;
  const blocks = D.CUTS.lvl3.vals;
  ok(blocks.length > 0, 'в данных нет блоков УС-3');
  let narrowed = false;
  let chosen = null;
  blocks.slice(0, 3).forEach((b) => {
    const err = fire('[data-who]', { who: b, whocut: 'lvl3' });
    ok(!err, 'клик по блоку ' + b + ': ' + (err && err.message));
    const html = viewHtml();
    ok(html.indexOf('data-unchip="flt:emp.lvl3"') >= 0, 'нет чипа людского фильтра для ' + b);
    ok(html.indexOf('сужен аудиторией') >= 0, 'каталог не признался, что сужен аудиторией');
    ok(html.indexOf('NaN') < 0 && html.indexOf('undefined') < 0, 'мусор в разметке, фильтр ' + b);
    const cnt = repCount();
    if (cnt < base && !narrowed) { narrowed = true; chosen = b; }
    fire('[data-who]', { who: b, whocut: 'lvl3' });
    ok(repCount() === base, 'после снятия ' + b + ' каталог не вернулся к полному списку');
  });
  ok(narrowed, 'ни один блок не сузил каталог: людская шина не работает');
  console.log('· блок «' + chosen + '» сузил каталог → ок');
})();

/* Разрезы «Кто смотрит»: департамент, AD-группы, тим-лиды */
console.log('\nРазрезы «Кто смотрит»');
(function () {
  fire('[data-stab]', { stab: 'rightView', val: 'who' });
  const D = ctx.PA_DATA;
  let err = fire('[data-ddpick]', { ddpick: 'whoCut', ddval: 'adgroup' });
  ok(!err, 'переключение на AD-группы: ' + (err && err.message));
  let html = viewHtml();
  ok(html.indexOf('data-unchip="flt:emp.adgroup"') < 0, 'остаточный чип AD-группы');
  err = fire('[data-who]', { who: D.AD_GROUPS[0], whocut: 'adgroup' });
  ok(!err, 'клик по AD-группе: ' + (err && err.message));
  html = viewHtml();
  ok(html.indexOf('data-unchip="flt:emp.adgroup"') >= 0, 'нет чипа AD-группы');
  ok(html.indexOf('сужен аудиторией') >= 0, 'каталог не сузился по AD-группе');
  fire('[data-who]', { who: D.AD_GROUPS[0], whocut: 'adgroup' });

  err = fire('[data-ddpick]', { ddpick: 'whoCut', ddval: 'heads' });
  ok(!err, 'переключение на тим-лидов: ' + (err && err.message));
  ok(viewHtml().indexOf('Тим-лиды') >= 0, 'нет строки «Тим-лиды»');
  err = fire('[data-who]', { who: 'Тим-лиды', whocut: 'heads' });
  ok(!err, 'клик по тим-лидам: ' + (err && err.message));
  ok(viewHtml().indexOf('data-unchip="flt:emp.heads"') >= 0, 'нет чипа «Только тим-лиды»');
  fire('[data-who]', { who: 'Тим-лиды', whocut: 'heads' });
  fire('[data-ddpick]', { ddpick: 'whoCut', ddval: 'lvl3' });
  console.log('· AD-группы, тим-лиды → ок');
})();

/* Клик по человеку + контекст дерева: список НЕ сужает сам себя —
   выбранная строка подсвечивается, группы без людей выборки гаснут,
   но остаются; Shift накапливает, счётчик «выбрано» на месте */
console.log('\nКлик по человеку и контекст дерева');
(function () {
  resetPicks();
  fire('[data-stab]', { stab: 'rightView', val: 'who' });
  const base = repCount();

  /* Плоский список: строка человека кликабельна и подсвечивается */
  let html = viewHtml();
  const login = (html.match(/data-who="([^"]+)" data-whocut="login"/) || [])[1];
  ok(!!login, 'в списке нет кликабельных людей');
  if (login) {
    let err = fire('[data-who]', { who: login, whocut: 'login' });
    ok(!err, 'клик по человеку: ' + (err && err.message));
    html = viewHtml();
    ok(repCount() < base, 'клик по человеку не сузил каталог');
    ok(html.indexOf('data-unchip="flt:emp.login"') >= 0, 'нет чипа человека');
    ok(html.indexOf('выбрано: 1') >= 0, 'нет счётчика «выбрано»');
    ok(/class="plain pk sel"/.test(html), 'выбранный человек не подсвечен');
    err = fire('[data-who]', { who: login, whocut: 'login' });
    ok(!err, 'снятие человека: ' + (err && err.message));
    ok(repCount() === base, 'повторный клик по человеку не снял условие');
  }

  /* Дерево держит контекст: группы не исчезают от собственного клика */
  fire('[data-ddtoggle]', { ddtoggle: 'whoCut' });
  fire('[data-ddpick]', { ddpick: 'whoCut', ddval: 'lvl3' });
  const rowsBefore = (viewHtml().match(/class="grp-h /g) || []).length;
  ok(rowsBefore > 1, 'в дереве нет групп для проверки контекста');
  const D = ctx.PA_DATA;
  const b = D.CUTS.lvl3.vals[0];
  let err = fire('[data-who]', { who: b, whocut: 'lvl3' });
  ok(!err, 'клик по блоку: ' + (err && err.message));
  html = viewHtml();
  ok((html.match(/class="grp-h /g) || []).length === rowsBefore, 'дерево схлопнулось от собственного клика');
  ok(/aria-pressed="true"/.test(html), 'выбранная группа не подсвечена');
  ok(/class="grp-h[^"]*grp-dim/.test(html), 'пустые группы не погашены');
  ok(html.indexOf('выбрано: 1') >= 0, 'нет счётчика выбора группы');

  /* Shift накапливает условия внутри разреза */
  const b2 = D.CUTS.lvl3.vals[1];
  err = fire('[data-who]', { who: b2, whocut: 'lvl3' }, true);
  ok(!err, 'shift-клик по второму блоку: ' + (err && err.message));
  html = viewHtml();
  ok(html.indexOf('data-unchip="flt:emp.lvl3"') >= 0, 'нет чипа накопленного условия');
  ok(html.indexOf('выбрано: 2') >= 0, 'Shift не накопил условия (счётчик)');
  err = fire('[data-unchip]', { unchip: 'flt:emp.lvl3' });
  ok(!err, 'снятие чипа блоков: ' + (err && err.message));
  ok(repCount() === base, 'снятие чипа не вернуло каталог');
  fire('[data-ddpick]', { ddpick: 'whoCut', ddval: 'none' });
  console.log('· человек кликабелен, дерево держит контекст, Shift копит → ок');
})();

/* Кросс-фильтр корзины частоты (сигаретка в «Кто смотрит»): повторный
   клик снимает, список сужается, сравнение с предыдущим периодом гаснет. */
console.log('\nЧастота визитов как кросс-фильтр');
(function () {
  resetPicks();
  fire('[data-stab]', { stab: 'rightView', val: 'who' });
  ['1 день', '8–15 дней', '16+ дней'].forEach((fb) => {
    const err = fire('[data-freq]', { freq: fb });
    ok(!err, 'корзина ' + fb + ': ' + (err && err.stack && err.stack.split('\n').slice(0, 2).join(' | ')));
    let html = viewHtml();
    ok(html.indexOf('Частота: ' + fb) >= 0, 'нет чипа снятия фильтра для ' + fb);
    ok(/ из /.test(html), 'корзина ' + fb + ' не сузила поимённый список');
    ok(html.indexOf('NaN') < 0 && html.indexOf('undefined') < 0, 'мусор в разметке, корзина ' + fb);
    /* Переключаемся к динамике: там сравнение должно сняться */
    fire('[data-stab]', { stab: 'rightView', val: 'dyn' });
    html = viewHtml();
    ok(html.indexOf('к пред. 30 дням') < 0, 'при кросс-фильтре осталось сравнение с предыдущим периодом');
    chartOptions.length = 0;
    ok(/class="chart /.test(html), 'корзина ' + fb + ': нет контейнера графика');
    const hits = [];
    chartOptions.forEach((o, i) => deepScanNaN(o, 'opt' + i, hits));
    ok(hits.length === 0, 'NaN в графике при корзине ' + fb);
    fire('[data-stab]', { stab: 'rightView', val: 'who' });
    fire('[data-freq]', { freq: fb });            // снять
  });
  fire('[data-stab]', { stab: 'rightView', val: 'dyn' });
  console.log('· корзины фильтруют список и динамику, prev снят → ок');
})();

/* Пилюльки легенды динамики: клик гасит ступень, последнюю — нельзя.
   Погашенное ПЕРЕСЧИТЫВАЕТ график: потолок оси и подпись итога — от
   суммы оставшихся ступеней, в подсказке проценты у КАЖДОЙ ступени. */
console.log('\nПилюльки легенды динамики');
(function () {
  resetPicks();
  fire('[data-stab]', { stab: 'rightView', val: 'dyn' });
  const full = chartOptions[chartOptions.length - 1];
  const barsSum = (opt) => opt.series.slice(0, 3)
    .reduce((acc, s) => s.data.map((v, i) => v + (acc[i] || 0)), []);
  const fullSum = barsSum(full);
  const topOf = (opt) => opt.series.slice(0, 3).filter((s) => s.label)[0];
  const labFull = topOf(full).label.formatter({ dataIndex: 0, value: fullSum[0] });

  let err = fire('[data-leg]', { leg: 'new' });
  ok(!err, 'гашение ступени «Новые»: ' + (err && err.message));
  ok(/class="leg off"/.test(viewHtml()), 'пилюлька не погасла');
  const visOpt = chartOptions[chartOptions.length - 1];
  ok(!!visOpt && visOpt.series, 'после гашения нет свежих опций динамики');
  const visSum = barsSum(visOpt);
  ok(visSum[0] < fullSum[0], 'погашенная ступень не убавила итог (стек не пересчитан)');
  const labVis = topOf(visOpt).label.formatter({ dataIndex: 0, value: visSum[0] });
  ok(labVis !== labFull, 'подпись итога не пересчиталась от оставшихся');
  ok(visOpt.yAxis[0].max <= full.yAxis[0].max, 'потолок оси не пересчитался');
  const tip = visOpt.tooltip.formatter([{ dataIndex: 0, axisIndex: 0, seriesIndex: 0 }]);
  /* «Новые» погашены — проценты стоят у обеих оставшихся ступеней */
  ok((tip.match(/ · \d+\s?%/g) || []).length >= 2, 'проценты не у всех ступеней подсказки');
  ok(tip.indexOf('Всего на графике') >= 0, 'подсказка не считает «Всего» от оставшихся');

  fire('[data-leg]', { leg: 'react' });
  fire('[data-leg]', { leg: 'ret' });             // последнюю гасить нельзя
  let html = viewHtml();
  ok((html.match(/class="leg off"/g) || []).length === 2, 'последнюю ступень погасили — график опустел');
  const hits = [];
  chartOptions.forEach((o, i) => deepScanNaN(o, 'opt' + i, hits));
  ok(hits.length === 0, 'NaN в графике с погашенными ступенями');
  fire('[data-leg]', { leg: 'new' }); fire('[data-leg]', { leg: 'react' });
  console.log('· гасятся с пересчётом стека, последняя держится → ок');
})();

/* Ось периодов «как календарь»: вторая строка — метка смены, смена — жирная */
console.log('\nОсь периодов');
(function () {
  resetPicks();
  fire('[data-stab]', { stab: 'rightView', val: 'dyn' });
  const opt = chartOptions[chartOptions.length - 1];
  const lab = opt.xAxis[0].data;
  ok(lab.every((s) => s.indexOf('\n') >= 0), 'метки оси не двухстрочные (дни)');
  ok(lab.some((s) => s.indexOf('{A|') >= 0), 'нет жирной метки смены месяца (дни)');
  ok(lab.some((s) => /\{b\|(янв|фев|мар|апр|май|июн|июл|авг|сен|окт|ноя|дек)\}/.test(s)), 'нет подписи месяца (дни)');
  const okGrain = { w: 'месяца', m: 'года', q: 'года' };
  Object.keys(okGrain).forEach((g) => {
    fire('[data-grain]', { grain: g });
    const o2 = chartOptions[chartOptions.length - 1];
    ok(o2.xAxis[0].data.some((s) => s.indexOf('{b|') >= 0), 'нет метки смены ' + okGrain[g] + ' (' + g + ')');
    ok(o2.xAxis[0].data.some((s) => s.indexOf('{A|') >= 0), 'нет жирной смены (' + g + ')');
  });
  fire('[data-grain]', { grain: 'd' });
  console.log('· двухрядная ось на всех периодах → ок');
})();

/* Когорты: без «старта», возраст с +1, легенда-регулятор */
console.log('\nКогорты');
(function () {
  fire('[data-stab]', { stab: 'rightView', val: 'dyn' });
  const html = viewHtml();
  ok(html.indexOf('>старт<') < 0, 'в когортах остался столбец «старт»');
  ok(/<th class="ct-h"(?:\s[^>]*)?>\+1</.test(html), 'возраст когорт начинается не с +1');
  ok(html.indexOf('ct-bar') >= 0, 'нет полосы размера когорты');
  ['col', 'all'].forEach((base) => {
    const err = fire('[data-ctbase]', { ctbase: base });
    ok(!err, 'база ' + base + ': ' + (err && err.message));
    ok(/data-ctband="/.test(viewHtml()), 'база ' + base + ': ступени шкалы не отрисованы');
  });
  fire('[data-ctbase]', { ctbase: 'col' });
  console.log('· без «старта», возраст с +1, легенда живая');
})();

/* ЗОННЫЙ РЕНДЕР: действие не пересобирает чужие графики */
console.log('\nЗоны: лишних перерисовок нет');
(function () {
  resetPicks();
  chartOptions.length = 0;
  fire('[data-ctbase]', { ctbase: 'all' });
  ok(chartOptions.length === 0, 'смена базы раскраски когорт пересобрала ' + chartOptions.length + ' граф.');

  chartOptions.length = 0;
  fire('th[data-sort]', { sort: 'views' });
  ok(chartOptions.length === 0, 'сортировка каталога пересобрала ' + chartOptions.length + ' граф.');
  console.log('· легенда и сортировка графики не трогают');

  chartOptions.length = 0;
  fire('[data-rep]', { rep: String(ctx.PA_DATA.reportMeta[3].dashboard_id) });
  ok(chartOptions.length > 0, 'выбор отчёта НЕ пересобрал график динамики');
  console.log('· выбор отчёта пересобирает динамику, как должен');
})();

/* Выбор в каталоге: обычный клик ПЕРЕКЛЮЧАЕТ, Shift+клик накапливает */
console.log('\nВыбор в каталоге: клик переключает, Shift накапливает');
(function () {
  resetPicks();
  const D = ctx.PA_DATA;
  const id1 = D.reportMeta[0].dashboard_id, nm1 = D.reportMeta[0].dashboard_nm;
  /* имя без «&»: чип эскейпит амперсанд, indexOf по сырому имени не найдёт */
  const id2 = D.reportMeta[2].dashboard_id, nm2 = D.reportMeta[2].dashboard_nm;

  fire('[data-mode]', { mode: 'report' });
  let err = fire('[data-rep]', { rep: String(id1) });
  ok(!err, 'выбор отчёта: ' + (err && err.message));
  let html = viewHtml();
  ok(html.indexOf('Отчёт: ' + nm1) >= 0, 'нет чипа выбранного отчёта');

  /* Обычный клик по другой строке — выбор ЗАМЕНЯЕТСЯ */
  err = fire('[data-rep]', { rep: String(id2) });
  ok(!err, 'переключение отчёта: ' + (err && err.message));
  html = viewHtml();
  ok(html.indexOf('Отчёт: ' + nm1) < 0, 'обычный клик не снял прежний выбор');
  ok(html.indexOf('Отчёт: ' + nm2) >= 0, 'обычный клик не переключил выбор');

  /* Shift+клик накапливает; повторный Shift по той же строке снимает её */
  err = fire('[data-rep]', { rep: String(id1) }, true);
  ok(!err, 'shift-клик: ' + (err && err.message));
  html = viewHtml();
  ok(html.indexOf('Отчёт: ' + nm1) >= 0 && html.indexOf('Отчёт: ' + nm2) >= 0, 'shift не накопил выбор');
  err = fire('[data-rep]', { rep: String(id1) }, true);
  ok(!err, 'повторный shift: ' + (err && err.message));
  ok(viewHtml().indexOf('Отчёт: ' + nm1) < 0, 'повторный shift не снял строку из выбора');

  /* Клик по единственной выбранной строке снимает выбор */
  err = fire('[data-rep]', { rep: String(id2) });
  ok(!err, 'снятие кликом: ' + (err && err.message));
  ok(viewHtml().indexOf('Отчёт: ' + nm2) < 0, 'клик по единственной выбранной не снял выбор');

  /* Выбор переживает переключение разреза */
  fire('[data-rep]', { rep: String(id1) });
  err = fire('[data-mode]', { mode: 'collection' });
  ok(!err, 'переключение разреза: ' + (err && err.message));
  ok(viewHtml().indexOf('Отчёт: ' + nm1) >= 0, 'выбор отчёта потерян при переключении разреза');

  const coll = D.reportMeta[0].collection;
  err = fire('[data-slice]', { slice: 'collection', val: coll });
  ok(!err, 'выбор коллекции: ' + (err && err.message));
  html = viewHtml();
  ok(html.indexOf('Отчёт: ' + nm1) >= 0, 'отчёт пропал после выбора коллекции');
  ok(html.indexOf('Коллекция: ' + coll) >= 0, 'нет чипа выбранной коллекции');
  ok(html.indexOf('NaN') < 0 && html.indexOf('undefined') < 0, 'мусор в разметке при выборе');
  console.log('· клик переключает, Shift накапливает, разрезы → ок');
})();

/* Контекстные чипы: условия висят над каталогом и динамикой, не в полоске */
console.log('\nКонтекстные чипы у контента');
(function () {
  resetPicks();
  const D = ctx.PA_DATA;
  const id = D.reportMeta[0].dashboard_id, nm = D.reportMeta[0].dashboard_nm;
  fire('[data-rep]', { rep: String(id) });
  const html = viewHtml();
  ok(/class="ctx-row"/.test(html), 'нет строки контекстных условий');
  ok(html.indexOf('Отчёт: ' + nm) >= 0, 'чип выбора не появился у контента');
  ok(html.indexOf('ctx-hint') < 0, 'строка условий не заметила появившийся чип');
  ok(/id="ctxReset"/.test(html), 'нет кнопки «Сбросить» у строки условий');

  const target = { closest() { return null; }, id: 'ctxReset', dataset: {}, matches() { return false; } };
  let err = null;
  try { clickHandlers.forEach((h) => h({ target })); } catch (e) { err = e; }
  ok(!err, 'ctxReset: ' + (err && err.message));
  const h2 = viewHtml();
  ok(h2.indexOf('Отчёт: ' + nm) < 0, 'ctxReset не снял выбор');
  ok(h2.indexOf('ctx-hint') >= 0, 'строка условий не вернулась в пустое состояние');
  console.log('· чипы над контентом, сброс на месте → ок');
})();

/* Настройки «Кто смотрит»: только руководители + исключение логина */
console.log('\nНастройки «Кто смотрит»');
(function () {
  resetPicks();
  fire('[data-stab]', { stab: 'rightView', val: 'who' });
  let html = viewHtml();
  ok(/data-ddtoggle="whoOpts"/.test(html), 'нет кнопки настроек списка');
  ok(/class="sp-p"/.test(html), 'на корзинах частоты нет процентов');
  const cnt = () => {
    const m = viewHtml().match(/(\d[\d\s  ]*)\s*(?:человек|человека)/);
    return m ? +m[1].replace(/\D/g, '') : -1;
  };
  const base = cnt();

  let err = fire('[data-ddtoggle]', { ddtoggle: 'whoOpts' });
  ok(!err, 'открытие настроек: ' + (err && err.message));
  html = viewHtml();
  ok(html.indexOf('Только руководители') >= 0, 'в настройках нет галочки руководителей');
  const login = (html.match(/data-woex="([^"]+)"/) || [])[1];
  ok(!!login, 'в настройках нет списка логинов');

  err = null;
  /* чекбокс: обработчик читает .checked — эмулируем включённое состояние */
  const chk = { closest(s2) { return s2 === '[data-wohead]' ? { dataset: { wohead: '' }, checked: true } : null; },
    id: '', dataset: {}, matches() { return false; } };
  try { clickHandlers.forEach((h) => h({ target: chk })); } catch (e) { err = e; }
  ok(!err, 'галочка руководителей: ' + (err && err.message));
  const after = cnt();
  ok(after > 0 && after < base, '«только руководители» не сузила список (' + after + ' из ' + base + ')');

  let err2 = null;
  const chk2 = { closest(s2) { return s2 === '[data-woex]' ? { dataset: { woex: login }, checked: true } : null; },
    id: '', dataset: {}, matches() { return false; } };
  try { clickHandlers.forEach((h) => h({ target: chk2 })); } catch (e) { err2 = e; }
  ok(!err2, 'исключение логина: ' + (err2 && err2.message));
  ok(cnt() <= after, 'исключённый логин не сузил список');
  ok(viewHtml().indexOf('Снять всё') >= 0, 'нет кнопки снять все исключения');

  err = null;
  const clr = { closest(s2) { return s2 === '[data-woexclear]' ? { dataset: {} } : null; },
    id: '', dataset: {}, matches() { return false; } };
  try { clickHandlers.forEach((h) => h({ target: clr })); } catch (e) { err = e; }
  ok(!err, 'снять исключения: ' + (err && err.message));
  console.log('· руководители и исключения работают → ок');
})();

/* «Что видно в данных»: одна коробка всегда, свежесть — «до вчера» */
console.log('\n«Что видно в данных»');
(function () {
  resetPicks();
  const html = viewHtml();
  ok(/class="obs /.test(html), 'нет блока наблюдений на старте');
  ok(html.indexOf('obs-fresh') >= 0, 'нет метки свежести «данные до вчера»');
  ok(html.indexOf('сегодня') < 0, 'в разметке осталось «сегодня» — данных за сегодня не бывает');
  /* Пустое состояние — та же коробка (obs-h/obs-lead), не другая разметка */
  const D = ctx.PA_DATA;
  fire('[data-mode]', { mode: 'owner' });
  fire('[data-slice]', { slice: 'owner', val: D.reportMeta[0].owner_login });
  const h2 = viewHtml();
  ok(/class="obs /.test(h2), 'блок наблюдений пропал совсем');
  ok(h2.indexOf('obs-h') >= 0 && h2.indexOf('obs-lead') >= 0, 'состояние без фактов рисуется другой разметкой');
  ok(h2.indexOf('no-insight') < 0, 'вернулась старая «пустая» разметка no-insight');
  fire('[data-mode]', { mode: 'report' });
  console.log('· коробка стабильна, свежесть подписана → ок');
})();

/* Опции полоски: свиток сертифицированных убран, остальные на месте */
console.log('\nОпции полоски');
(function () {
  resetPicks();
  let err = fire('[data-ddtoggle]', { ddtoggle: 'opts' });
  ok(!err, 'открытие опций: ' + (err && err.message));
  const html = viewHtml();
  ok(html.indexOf('Только опубликованные') >= 0, 'поповер опций не отрисован');
  ok(html.indexOf('Только сертифицированные') < 0, 'свиток сертифицированных не убран из опций');
  fire('[data-ddtoggle]', { ddtoggle: 'opts' });
  console.log('· сертифицированные убраны, свитки качества на месте → ок');
})();

/* Вкладка «Аудитория»: свой каталог, adoption, конструктор ЦА, воронка */
console.log('\nВкладка «Аудитория»');
(function () {
  resetPicks();
  const D = ctx.PA_DATA;
  let err = fireTab('audience');
  ok(!err, 'открытие вкладки: ' + (err && err.stack && err.stack.split('\n').slice(0, 2).join(' | ')));
  let html = viewHtml();
  ok(html.indexOf('Каталог области') >= 0, 'нет своего каталога области');
  ok(html.indexOf('Adoption за год') >= 0, 'нет карточки Adoption');
  ok(html.indexOf('Целевая аудитория') >= 0, 'нет карточек аудитории');
  ok(html.indexOf('Путь целевой аудитории') >= 0, 'нет воронки');
  ok(html.indexOf('Кто из целевой аудитории') >= 0, 'нет блока «Кто из ЦА»');
  ok(html.indexOf('Аудитория: Весь Proteus') >= 0, 'без выбора область не «Весь Proteus»');
  ok(html.indexOf('NaN') < 0 && html.indexOf('undefined') < 0, 'мусор в разметке аудитории');
  ok(typeof ctx.UI.funnelSvg === 'function', 'сборщик воронки не экспортирован');
  console.log('· каркас аудитории → ок');

  /* СВОЙ каталог: выбор здесь задаёт область и не зависит от «Отчётов» */
  const nm = D.reportMeta[0].dashboard_nm;
  err = fire('[data-rep]', { rep: String(D.reportMeta[0].dashboard_id), catscope: 'aud' });
  ok(!err, 'выбор в каталоге области: ' + (err && err.message));
  html = viewHtml();
  ok(html.indexOf('Аудитория: ' + nm) >= 0, 'область аудитории не сменилась своим каталогом');
  ok(html.indexOf('data-unchip="audpick:report:' + D.reportMeta[0].dashboard_id + '"') >= 0,
    'нет чипа выбора каталога области');
  ok(html.indexOf('Adoption за год') >= 0 && html.indexOf('NaN') < 0, 'мусор после выбора области');
  console.log('· свой каталог задаёт область → ок');

  /* Выбор на вкладке «Отчёты» область «Аудитории» не перетирает */
  fireTab('reports');
  fire('[data-mode]', { mode: 'report' });
  fire('[data-rep]', { rep: String(D.reportMeta[3].dashboard_id) });
  fireTab('audience');
  ok(viewHtml().indexOf('Аудитория: ' + nm) >= 0, 'выбор «Отчётов» перетёр область аудитории');
  console.log('· выборы вкладок независимы → ок');

  /* «Кто из ЦА»: та же форма, что «Кто смотрит» — разрез ⇄ поимённо */
  err = fire('[data-ddtoggle]', { ddtoggle: 'audCut' });
  ok(!err, 'раскрытие разрезов «Кто из ЦА»: ' + (err && err.message));
  ok(viewHtml().indexOf('data-ddval="lvl3"') >= 0, 'в разрезах «Кто из ЦА» нет УС-3');
  err = fire('[data-ddpick]', { ddpick: 'audCut', ddval: 'people' });
  ok(!err, 'поимённый режим «Кто из ЦА»: ' + (err && err.message));
  html = viewHtml();
  ok(html.indexOf('Сотрудник') >= 0, 'поимённая таблица «Кто из ЦА» не отрисована');
  ok(/class="seg-part/.test(html), 'полоса сегментов пропала из поимённого режима');
  fire('[data-ddpick]', { ddpick: 'audCut', ddval: 'lvl3' });
  console.log('· «Кто из ЦА»: сводная ⇄ поимённо → ок');

  /* Конструктор ЦА */
  err = fire('#audCfgOpen', {});
  const openTarget = { closest() { return null; }, id: 'audCfgOpen', dataset: {}, matches() { return false; } };
  try { clickHandlers.forEach((h) => h({ target: openTarget })); } catch (e) { err = e; }
  ok(!err, 'открытие конструктора: ' + (err && err.message));
  ok(viewHtml().indexOf('data-auddimsel') >= 0, 'конструктор не отрисован');
  ok(viewHtml().indexOf('Под условия попадает') >= 0, 'конструктор не показывает размер ЦА');

  err = fireChange({ auddim: 'spec', audval: 'Аналитик' }, true);
  ok(!err, 'выбор условия ЦА: ' + (err && err.message));

  const applyTarget = { closest() { return null; }, id: 'audCfgApply', dataset: {}, matches() { return false; } };
  err = null;
  try { clickHandlers.forEach((h) => h({ target: applyTarget })); } catch (e) { err = e; }
  ok(!err, 'применение ЦА: ' + (err && err.stack && err.stack.split('\n').slice(0, 2).join(' | ')));
  html = viewHtml();
  ok(html.indexOf('Собрана в конструкторе') >= 0, 'ЦА не переключилась на настроенную');
  ok(/class="chart fn-box"/.test(html), 'у настроенной ЦА нет воронки');
  /* Ступень «есть доступ» появляется только у настроенной ЦА. В заглушке
     DOM ширины нет, SVG не строится — проверяем сборщик прямым вызовом. */
  ok(ctx.UI.funnelSvg([{ name: 'Есть доступ к области', value: 10 },
    { name: 'Открыли', value: 4 }], 600, 300, {}).indexOf('Есть доступ к области') >= 0,
    'сборщик воронки не рисует ступень «есть доступ»');
  ok(html.indexOf('data-unchip="audDef"') >= 0, 'нет чипа снятия настроенной ЦА');

  /* Кросс-фильтры аудитории: разрез «Кто из ЦА» и сегмент списка */
  err = fire('[data-audunit]', { audunit: D.CUTS.lvl3.vals[0], audkey: 'lvl3' });
  ok(!err, 'кросс-фильтр по разрезу: ' + (err && err.message));
  ok(viewHtml().indexOf('На экране срез') >= 0, 'панель ЦА не отметила срез');
  ok(viewHtml().indexOf('data-unchip="audUnit"') >= 0, 'нет чипа среза');
  fire('[data-unchip]', { unchip: 'audUnit' });

  err = fire('[data-ddpick]', { ddpick: 'audCut', ddval: 'people' });
  err = err || fire('[data-seg]', { seg: 'Постоянный' });
  ok(!err, 'фильтр по сегменту: ' + (err && err.message));
  ok(viewHtml().indexOf('Сегмент: Постоянный') >= 0, 'нет чипа сегмента');
  fire('[data-seg]', { seg: 'Постоянный' });
  fire('[data-ddpick]', { ddpick: 'audCut', ddval: 'lvl3' });

  /* Вернуть «как роздан доступ» */
  const resetTarget = { closest() { return null; }, id: 'audCfgReset', dataset: {}, matches() { return false; } };
  err = null;
  try { clickHandlers.forEach((h) => h({ target: resetTarget })); } catch (e) { err = e; }
  ok(!err, 'возврат к доступу: ' + (err && err.message));
  ok(viewHtml().indexOf('Собрана в конструкторе') < 0, 'ЦА не вернулась к «как роздан доступ»');
  ok(viewHtml().indexOf('NaN') < 0 && viewHtml().indexOf('undefined') < 0, 'мусор в разметке после возврата');
  console.log('· конструктор, срез, сегмент, возврат → ок');
})();

/* Полный сброс чистит обе шины и оба каталога */
console.log('\nСброс всего');
(function () {
  fire('[data-who]', { who: 'Тим-лиды', whocut: 'heads' });
  fireTab('audience');
  fire('[data-rep]', { rep: String(ctx.PA_DATA.reportMeta[1].dashboard_id), catscope: 'aud' });
  fireTab('reports');
  fire('[data-mode]', { mode: 'report' });
  fire('[data-rep]', { rep: String(ctx.PA_DATA.reportMeta[0].dashboard_id) });
  fire('[data-freq]', { freq: '1 день' });
  let html = viewHtml();
  ok(/data-unchip=/.test(html), 'для проверки сброса не набрано ни одного условия');
  resetPicks();
  html = viewHtml();
  ok(html.indexOf('data-unchip=') < 0, 'сброс оставил чипы: ' + (html.match(/data-unchip="[^"]*"/) || []).slice(0, 3).join(', '));
  ok(html.indexOf('сужен аудиторией') < 0, 'сброс не снял людской фильтр');
  ok(html.indexOf('Закрепляемость отчёта') < 0, 'сброс не снял выбор отчёта');
  fireTab('audience');
  ok(viewHtml().indexOf('Аудитория: Весь Proteus') >= 0, 'сброс не снял выбор каталога области');
  fireTab('reports');
  ok(viewHtml().indexOf('NaN') < 0 && viewHtml().indexOf('undefined') < 0, 'мусор в разметке после сброса');
  console.log('· обе шины и оба каталога чисты → ок');
})();

/* MAU — столбик месячной динамики за последний ЗАКРЫТЫЙ месяц */
console.log('\nMAU сходится с месячной динамикой');
(function () {
  const D = ctx.PA_DATA;
  const ms = D.buckets('m');
  ok(D.MAU_BUCKET === ms[ms.length - 2], 'MAU считается не за предпоследний месяц');
  ok(D.MAU_PREV_BUCKET === ms[ms.length - 3], 'предыдущий месяц MAU выбран неверно');
  ok(D.MAU_BUCKET !== ms[ms.length - 1], 'MAU берёт текущий, ещё не закрытый месяц');

  const at = (rows, pred, bucket) => {
    const r = rows.find((x) => pred(x) && x.bucket === bucket);
    return r ? r.users : null;
  };
  const mAll = D.ds_overview.find((r) => r.section === 'mau' && r.cut_key === 'all');
  ok(mAll, 'нет строки MAU по всему Proteus');
  ok(mAll.users === at(D.ds_overview, (r) => r.section === 'ts' && r.grain === 'm' && r.cut_key === 'all', D.MAU_BUCKET),
    'MAU всего Proteus не равен столбику месячной динамики');
  ok(mAll.users_prev === at(D.ds_overview, (r) => r.section === 'ts' && r.grain === 'm' && r.cut_key === 'all', D.MAU_PREV_BUCKET),
    'предыдущий MAU всего Proteus не равен своему столбику');

  let badRep = 0;
  D.reportMeta.forEach((m) => {
    const mr = D.ds_reports.find((r) => r.section === 'rmau' && r.dashboard_id === m.dashboard_id);
    const ts = at(D.ds_reports, (r) => r.section === 'rts' && r.grain === 'm' && r.dashboard_id === m.dashboard_id, D.MAU_BUCKET);
    if (!mr || mr.users !== ts) badRep++;
  });
  ok(badRep === 0, badRep + ' отчётов: MAU не равен столбику своей месячной динамики');

  let badGrp = 0;
  D.ds_reports.filter((r) => r.section === 'gmau').forEach((g) => {
    const ts = at(D.ds_reports, (r) => r.section === 'gts' && r.grain === 'm' &&
      r.group_key === g.group_key && r.group_val === g.group_val, D.MAU_BUCKET);
    if (g.users !== ts) badGrp++;
  });
  ok(badGrp === 0, badGrp + ' групп: MAU не равен столбику своей месячной динамики');

  const html = viewHtml();
  ok(html.indexOf('MAU · ') >= 0, 'карточка MAU не называет месяц');
  ok(html.indexOf(ctx.UI.nf(mAll.users)) >= 0, 'числа MAU нет на экране');
  console.log('· ' + new Date(D.MAU_BUCKET).toISOString().slice(0, 7) +
    ' → карточка и график дают одно число (' + ctx.UI.nf(mAll.users) + ')');
})();

console.log('\n' + (fails ? fails + ' проверок провалено' : 'Все проверки пройдены'));
process.exit(fails ? 1 : 0);
