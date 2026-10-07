// ============================================================================
// pa-one.chart.js — панель ЕДИНОГО листа (2026-09-30): «Аудитория области» первого листа + целевая
//   аудитория второго («Охват ЦА»). Датасет pa_one (один запрос, один список людей).
//   KPI: 5 первого листа + «Охват ЦА». Вкладки: Динамика (+ охват ЦА) · Календарь · Путь ЦА ·
//   Кто смотрит (режим: частота | ЦА) · Закрепляемость. ЦА задаёт строка «Целевая аудитория» (ca_*_f):
//   по правам — зрители не сужаются, по условиям — вся панель про людей ЦА (SQL сужает сам).
// Основа — pa-area.chart.js (v7), ЦА — из pa-audience.chart.js (v3).
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
// ЧТО ЭТО. Один чарт вместо трёх (pa-who «Кто смотрит»⇄«Динамика», pa-cohorts
//   и карточки KPI тела): всё, что говорит про ЛЮДЕЙ выбранной области, на
//   одном датасете pa_people (один запрос, одно чтение факта).
//   Сверху — KPI области и «Что видно в данных»; ниже вкладки
//   «Кто смотрит» · «Динамика» · «Закрепляемость».
// ШИНЫ.
//   Слушает: полоску (period_param, pub_f/act_f/exc_f) и каталог слева
//     (mode_param + sel_f — ОБЛАСТЬ: отчёты/коллекции/владельцы, мультивыбор).
//   Пишет: людскую шину (lvl3_f/lvl4_f/spec_f/stream_f/adg_f/heads_f/login_f/exl_f/
//     freq_f) → каталог слева перезапрашивается и сужается. Себя панель НЕ
//     сужает (самовлияние выключено, BI-паттерн: источник держит контекст):
//     выбор подсвечивается, пустые группы гаснут, KPI и когорты — по области.
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
  ns: 'pone',                 // ПРЕФИКС всех CSS-классов и класса overlay
  sheet: 'aud',               // лист борда: каталог с колонкой ЦА шлёт sheet 'aud' (sheetOf по ca_n) — сверка с ним
  selShowAfter: 400,          // мс: плашку «Пересчитываем…» показываем, только если ждём дольше (без мигания)
  selStaleWait: 10000,        // мс: после ответа под ПРЕЖНИЙ выбор ждём правильный, потом — автоповтор
  selGiveUp: 60000,           // мс: ответа нет совсем — через столько кнопка «Повторить запрос» (сами не повторяем)
  selMaxTries: 2,             // автоповторов на один выбор; дальше — кнопка
  paCols: ['org_f', 'spec_f', 'stream_f', 'adg_f', 'heads_f', 'login_f', 'exl_f', 'freq_f'],  // колонки «Кто смотрит» в кросс-фильтре (ключ сверки)
  // 5 колонок датасета pa_one v2 (2026-09-30): всё упаковано в k (строки через перевод строки, поля через «|»),
  // кириллица — компактно (unz). Формат секций — в шапке SQL (Виджеты/pa-one.data.sql).
  fields: { section: 'section', g: 'g', k: 'k', parent: 'parent', n: 'n' },
  // ЦА: доступ почти у всех (ЦА ≥ wideShare сотрудников) — проценты охвата скрыты (знаменатель ничего не значит).
  wideShare: 0.3,
  text: { noData: 'Нет данных' },
  // Динамика живёт в ts-строках (бакет = возраст k от даты свежести).
  mode: 'snapshot',
  // Порядок категорий — часть ТЗ (правило 15): и для разметки, и для автомока.
  order: {
    section: ['area', 'total', 'freq', 'ctx', 'list', 'ts', 'cal', 'coh', 'h', 'n', 'd', 'acl'],
    g: ['org', 'spec', 'stream', 'head', 'adg'],
    bin: [1, 2, 3, 4, 5],
    is_head: [1, 0]
  },
  // Вкладки панели: люди → время → удержание.
  views: [
    { key: 'dyn', label: 'Динамика' },
    { key: 'cal', label: 'Календарь' },
    { key: 'path', label: 'Путь ЦА' },
    { key: 'who', label: 'Кто смотрит' },
    { key: 'coh', label: 'Закрепляемость' }
  ],
  // Группировки «Кто смотрит». none — поимённый список с пагинацией; любая
  // другая — сводная таблица групп с итогами, свёрнутая до верхнего уровня.
  // org — оргструктура одной опцией: УС-3 › УС-4 › … › УС-7, раскрытие вглубь
  // (правка владельца 2026-09-23: «уровни УС-3…УС-7 — в одну опцию»).
  groups: [
    { key: 'none', label: 'Люди' }, { key: 'org', label: 'Оргструктура (УС-3…УС-7)' },
    // Один уровень УС плоской таблицей — подпункты дерева (в меню с отступом).
    { key: 'org3', label: 'УС-3', trg: 'Оргструктура · УС-3', sub: true },
    { key: 'org4', label: 'УС-4', trg: 'Оргструктура · УС-4', sub: true },
    { key: 'org5', label: 'УС-5', trg: 'Оргструктура · УС-5', sub: true },
    { key: 'org6', label: 'УС-6', trg: 'Оргструктура · УС-6', sub: true },
    { key: 'org7', label: 'УС-7', trg: 'Оргструктура · УС-7', sub: true },
    { key: 'stream', label: 'Стрим' }, { key: 'spec', label: 'Специализация' },
    { key: 'adgroup', label: 'AD-группа' }, { key: 'heads', label: 'Тим-лиды' }
  ],
  // Разделитель звеньев пути оргструктуры — тот же, что в SQL (pa_people, org_f).
  orgSep: ' › ',
  // Колонки сводной таблицы групп: capability-метаданные (TABLES.md §3).
  // prevOnly — показывается, только если у периода есть полный предыдущий.
  gcols: [
    { key: 'users', label: 'Людей', hint: 'Сколько разных людей группы открывали отчёты за период' },
    { key: 'share', label: 'Доля', hint: 'Доля группы от всех пользователей отчётов' },
    { key: 'dUsers', label: 'Δ к пред.', hint: 'Изменение числа людей к предыдущему периоду той же длины', prevOnly: true },
    { key: 'views', label: 'Просмотров', short: 'Просм.', hint: 'Сколько раз люди группы открывали отчёты за период' },
    { key: 'vpu', label: 'На чел.', hint: 'Просмотров на одного человека группы' },
    { key: 'regShare', label: 'Постоянных', short: 'Пост.', hint: 'Доля постоянных — корзины частоты 3 и 4: 6+ дней или недель, 4+ месяца, 3+ квартала (число — во всплывашке)' },
    { key: 'new_u', label: 'Новых', hint: 'Впервые открыли отчёты в этом периоде' }
  ],
  // Колонки групп в режиме «по ЦА» (как «Кто из ЦА» второго листа).
  gcolsCa: [
    { key: 'ca', label: 'В ЦА', hint: 'Людей группы в целевой аудитории' },
    { key: 'cov', label: 'Охват', hint: 'Доля ЦА группы, открывавшая отчёты за период' },
    { key: 'reach', label: 'Дошли', hint: 'Люди ЦА группы, заходившие за период' },
    // «Δ к пред.» по группам нет: в ответе только зрители текущего периода (прошлый — общим числом у KPI).
    { key: 'regShare', label: 'Закрепились', short: 'Закреп.', hint: 'Доля постоянных среди дошедших: 6+ дней или недель, 4+ месяца, 3+ квартала' },
    { key: 'never', label: 'Не заходили', short: 'Не зах.', hint: 'Люди ЦА группы без визитов за период' },
    { key: 'out', label: 'Вне ЦА', hint: 'Заходили за период, но в целевую аудиторию не входят' }
  ],
  // Колонки поимённого списка (сортировка — по ключу).
  pcols: [
    { key: 'fio', label: 'Сотрудник', txt: true },
    { key: 'org', label: 'Подразделение', txt: true },
    { key: 'exp', label: 'Стаж', txt: true },
    { key: 'days', label: 'Дней', hint: 'Активных периодов в окне: дней, недель, месяцев или кварталов — по грануляции' },
    { key: 'views', label: 'Просм.' },
    { key: 'last', label: 'Визит' },
    { key: 'bin', label: 'Сегмент', txt: true }
  ],
  // Грануляция периода задаётся полоской (period_param); датасет возвращает
  // её в area-строке (parent). prev — есть ли в 13 месяцах истории полный
  // предыдущий период той же длины (m: 24 мес., q: 16 кв. — нет).
  // Корзины частоты: верхние границы корзин 1–4 по гранулярности (= FBIN в SQL
  // pa_people и каталога); fopen — пятая корзина подписывается «N+», иначе диапазоном до n.
  fbins: { d: [1, 5, 15], w: [1, 5, 15], m: [1, 3, 6], q: [1, 2, 3] },
  fopen: { d: true, w: true, q: true },
  grains: {
    d: { n: 30, reg: 6, unit: 'день',    units: 'дней',     us: 'дн',  label: 'за 30 дней',    vs: 'к пред. 30 дням',     prev: true },
    w: { n: 20, reg: 6, unit: 'неделя',  units: 'недель',   us: 'нед', label: 'за 20 недель',  vs: 'к пред. 20 неделям',  prev: true },
    m: { n: 12, reg: 4, unit: 'месяц',   units: 'месяцев',  us: 'мес', label: 'за 12 месяцев', vs: 'к пред. 12 месяцам',  prev: false },
    q: { n: 8, reg: 3,  unit: 'квартал', units: 'кварталов', us: 'кв', label: 'за 8 кварталов', vs: 'к пред. 8 кварталам', prev: false }
  },
  // Подписи режимов области (mode_param каталога и cut:* панели «Аудитория»).
  areaLabels: {
    report: ['Отчёт', 'Отчёты'], owner: ['Владелец', 'Владельцы'],
    collection: ['Коллекция', 'Коллекции'], 'cut:lvl3': ['УС-3', 'УС-3'],
    'cut:lvl4': ['Департамент', 'Департаменты'], 'cut:spec': ['Специализация', 'Специализации'],
    'cut:stream': ['Стрим', 'Стримы'], 'cut:head': ['Руководители', 'Руководители']
  },
  colors: {
    // Канвас = цвет холста борда (--dashboard-background), как у каталога.
    bg: '#f6f6f6',
    panel: '#fff',
    act: '#245FD4',            // активный тон интерфейса
    ret: '#7FA3EA',            // продолжающие — светлая ступень стека
    react: '#AA77FF',          // вернувшиеся
    new: '#245FD4',            // новые — основание стека
    nohist: '#D3D8E2',         // период в начале истории данных: новых не выделяем (одна серая ступень)
    views: '#5b6478',          // просмотры: вторая панель
    bench: '#c7c8cc',
    label: '#2b2b2b', axis: '#808080', axisLine: 'rgb(155, 164, 181)',
    split: '#f0f1f3', txt: '#3a3f4a', mut: '#8a909c',
    // Корзины частоты (макет FREQ_COLORS, app.js 71): светлая → тёмная.
    freq: ['#D3E0FA', '#8AAAEC', '#4A7BE0', '#245FD4'],
    cov: '#245FD4', covP: '#7FA3EA',                    // охват ЦА: накоплено / за период
    // Сегменты ЦА (полоса над списком в режиме «ЦА»): дошли → не заходили → вне ЦА.
    seg: ['#245FD4', '#4A7BE0', '#8AAAEC', '#dfe3e8'],
    // Ступени воронки «Путь ЦА»: ЦА → доступ → открыли → вернулись → регулярно.
    fun: ['#D3E0FA', '#A9C1F2', '#7FA3EA', '#4A7BE0', '#245FD4']
  },
  fonts: {
    // ЕДИНЫЙ стек для ВСЕГО виджета, включая тултип в body.
    family: 'Inter,-apple-system,"Segoe UI",Roboto,Arial,sans-serif',
    val: 11, dense: 10, title: 13, title2: 12, legend: 12
  },
  spacing: {
    stackGap: 26,             // зазор между панелями графика (STACK_GAP)
    barGap: 8, barMax: 72, barMin: 3,   // бар: зазор px и клампы ширины
    dense: 16,                // больше N бакетов — плотная сетка
    headroom: 1.3, headroomDense: 1.22   // воздух над марками под подписи
  },
  // Поимённый список: строк на странице; людей внутри раскрытой группы —
  // первые subShow, по «ещё» — до subMax. В ответе датасета — ВСЕ зрители области
  // (упакованы по подразделениям, см. parseListPack).
  pageSize: 50, subShow: 15, subMax: 300
};

// ---------- БЛОК 2: ВХОД + СОСТОЯНИЕ + ХЕЛПЕРЫ ----------
// ВСЕ строки data, не data[0].
var rawData = (typeof data !== 'undefined' && Array.isArray(data)) ? data : [];

// Состояние переживает перерисовку Proteus.
// Для таблиц с поиском/сортировкой/пагинацией имена ключей бери из TABLES.md,
// чтобы правки разных сессий не расходились.
if (!window.__pvtState) window.__pvtState = {};
var __S = window.__pvtState;
// Дефолты: первая вкладка — «Динамика» (правка владельца 2026-09-23).
if (!__S[CFG.ns]) __S[CFG.ns] = {
  tip: null,
  view: 'dyn',               // вкладка панели: dyn | who | coh (Динамика — первая)
  q: '',                     // поиск «Имя или логин»
  obsOpen: false,            // «Что видно в данных»: список фактов раскрыт вниз
  whoCut: 'none',            // группировка: none (люди) | org | spec | stream | adgroup | heads
  gOpen: {},                 // раскрытые группы сводной таблицы (cut:ключ → true)
  gMore: {},                 // группы, где людей показано больше subShow
  gSort: { key: 'users', dir: -1 },   // сортировка групп (у каждого уровня — своих соседей)
  pSort: { key: 'days', dir: -1 },    // сортировка поимённого списка
  page: 0,                   // страница поимённого списка (с 0)
  toast: '',                 // короткое сообщение после копирования/выгрузки
  freqSel: null,             // корзина частоты: '1'..'4' | null
  headsOnly: false,          // настройки: только руководители
  excl: [],                  // настройки: исключённые логины
  exQ: '',                   // поиск в настройках
  dd: null,                  // открытый дропдаун: 'whoCut' | 'whoOpts'
  legendOff: { new: false, react: false, ret: false },
  viewsMode: 'total',        // просмотры: total | per
  dynEl: null, dynI: -1,     // следящий тултип динамики
  calM: 'u',
  whoMode: 'freq',           // «Кто смотрит»: freq — по частоте (корзины) | ca — по ЦА (дошли / не заходили / вне ЦА)
  segSel: null,              // режим ЦА: выбранный сегмент полосы (reach | never | out)                 // календарь: u — пользователи | v — просмотры
  cohView: 'table',          // закрепляемость: table | curve
  ctBase: 'col',             // цвет когорт: медиана столбца | таблицы
  // Людская шина (→ каталог слева): выбор по разрезам, семантика как в
  // каталоге — клик переключает, Shift накапливает, повторный по единственной снимает.
  picks: { org: [], spec: [], stream: [], adgroup: [], heads: [], login: [] }
};
var state = __S[CFG.ns];
// Состояние из прошлой версии виджета (та же вкладка браузера): добиваем ключи.
(function () {
  var d = { gOpen: {}, gMore: {}, gSort: { key: 'users', dir: -1 }, pSort: { key: 'days', dir: -1 }, page: 0, toast: '', whoFull: false };
  for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k) && state[k] == null) state[k] = d[k];
  if (state.freqSel && !/^[1-4]$/.test(String(state.freqSel))) state.freqSel = null;   // было 5 корзин
  var pk = state.picks || (state.picks = {});
  var need = ['org', 'spec', 'stream', 'adgroup', 'heads', 'login'];
  for (var i = 0; i < need.length; i++) if (!pk[need[i]]) pk[need[i]] = [];
  var ok = false;
  for (var g = 0; g < CFG.groups.length; g++) if (CFG.groups[g].key === state.whoCut) ok = true;
  if (!ok) state.whoCut = 'none';
})();

// Массив из data приходит и массивом, и JSON-строкой '[1,2,3]'.
// Массив из ответа датасета. Proteus отдаёт Array-колонку по-разному: живым
// массивом, JSON-строкой ["a","b"] или Python-представлением ['a', 'b']
// (строковые массивы ClickHouse проходят через str() результата). JSON.parse
// на втором виде падал, и у отчётов «не было коллекций» — вкладки каталога
// переставали фильтровать друг друга. Разбираем все три вида.
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

// Хелперы форматирования — порт из тела 788805 (строки 675–756), синхрон
// типографики между чартами одного борда: тонкий пробел в разрядах,
// типографский минус, склонения.
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

// Дата бакета от клиента: k=0 — текущий период (та же оговорка, что в теле:
// колонки max_ts в ответе нет, витрина за вчера ⇒ сдвиг подписей ≤1 день).
// Дата свежести данных (md из датасета): от неё — подписи периодов, «закрытый месяц», когорты.
// Раньше якорем был сегодняшний день браузера — при витрине «за вчера» подписи съезжали на день вперёд.
var DATA_MD = null;
function refDay() {
  return DATA_MD ? new Date(Date.UTC(DATA_MD.y, DATA_MD.m, DATA_MD.d)) : new Date(Date.now() - 86400000);
}
function tsDate(k, grain) {
  var now = refDay();
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
// Ось периодов «как календарь» (макет charts.js periodAxisLabels): метка на
// КАЖДОЙ точке, без прореживания. Верхняя строка — сам период (день, номер
// недели, месяц, квартал), нижняя — метка СМЕНЫ: у дней и недель это месяц,
// у месяцев и кварталов — год. В точке смены верхняя метка жирная.
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

// Метки корзин частоты зависят от грануляции («1 день» / «1 неделя» / …):
// SQL отдаёт bin 1..5 по АКТИВНЫМ ПЕРИОДАМ текущей грануляции.
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

// Упакованный список (pa_one, секция list): строка на подразделение, parent — путь «УС-3 › … › УС-7»,
// в k — люди через \n, поля через «|» (13): логин | ФИО | код спец. | код стрима | код стажа |
// маска текущего окна | маска предыдущего | возраст первого визита | просмотров | дней с визита (−1 — нет) |
// флаги (1 рук · 2 MAU · 4 MAU пред. · 8 в этом году · 16 сотрудник · 32 доступ · 64 в ЦА) | код HQ | код IT.
// Коды — номера в словаре (секция d). Активных периодов, корзину и «новый» считаем из масок.
// Маски окна — до 30 бит (текущее и предыдущее окна приходят раздельно): подсчёт единиц — побитово (SWAR).
function bits(v) {
  v = +v || 0;
  if (v >= 0 && v < 4294967296) {
    v = v >>> 0;
    v = v - ((v >>> 1) & 0x55555555);
    v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
    return ((((v + (v >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24);
  }
  var c = 0; v = Math.floor(v); while (v > 0) { c += v % 2; v = Math.floor(v / 2); } return c;
}
// Компактная кириллица (макрос cz в SQL): Superset пишет кириллицу в JSON как \uXXXX — 6 байт на букву. SQL берёт
// отрезок из кириллицы и пробелов в `…` и заменяет буквы однобайтными по таблице (та же — здесь); вне отрезков
// ~~ — тильда, ~p — «|», ~c — «^», ~b — «`». Разбор обратный.
var CZ_T = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%';
var CZ_C = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя';
var CZ_M = null;
function unz(s) {
  s = s == null ? '' : String(s);
  if (s.indexOf('`') < 0 && s.indexOf('~') < 0) return s;
  if (!CZ_M) { CZ_M = {}; for (var q = 0; q < CZ_T.length; q++) CZ_M[CZ_T.charAt(q)] = CZ_C.charAt(q); }
  var out = '', i = 0, n = s.length, c, run = false, d;
  while (i < n) {
    c = s.charAt(i);
    if (run) {
      if (c === '`') run = false; else out += CZ_M[c] || c;
      i++;
    } else if (c === '`') { run = true; i++; }
    else if (c === '~' && i + 1 < n) { d = s.charAt(i + 1); out += d === 'p' ? '|' : (d === 'c' ? '^' : (d === 'b' ? '`' : d)); i += 2; }
    else { out += c; i++; }
  }
  return out;
}
// Целое поле упаковки (без разбора разрядов и запятых, как num()).
function int(v) { var x = +v; return isNaN(x) ? 0 : x; }
function bitAt(v, k) { return Math.floor((v || 0) / Math.pow(2, k)) % 2 === 1; }
function binOf(days, FB) { return !days ? 0 : (days <= FB[0] ? 1 : (days <= FB[1] ? 2 : (days <= FB[2] ? 3 : 4))); }
function parseListPack(txt, path, out, m) {
  var lines = txt.split('\n'), ps = path ? path.split(CFG.orgSep) : [], FB = CFG.fbins[m.grain] || CFG.fbins.d;
  var n = CFG.grains[m.grain].n, kt = m.hist.kt;
  var dv = function (g, id) { return m.dict[g] && m.dict[g][id] != null ? m.dict[g][id] : ''; };
  for (var i = 0; i < lines.length; i++) {
    var f = lines[i].split('|');
    if (f.length < 13 || !f[0]) continue;
    var cur = int(f[5]), prev = int(f[6]), fk = f[7] === '' ? null : int(f[7]), fl = int(f[10]), last = f[9] === '' ? null : int(f[9]);
    var days = bits(cur), bin = Math.max(1, binOf(days, FB)), seg = segOf(bin);
    out.push({
      login: f[0], fio: unz(f[1]), lvl3: ps[0] || '', lvl4: ps[1] || '', org: path,
      spec: dv('spec', f[2]), stream: dv('stream', f[3]), exp: dv('exp', f[4]), is_head: fl & 1,
      days: days, views: int(f[8]),
      last: last == null || last < 0 ? null : last,   // дней от последнего визита до даты свежести (дата — lastDate(p))
      bin: bin, seg: seg.key, segCls: seg.cls,
      nw: fk != null && fk < n && fk <= kt ? 1 : 0, m1: (fl >> 1) & 1, m2: (fl >> 2) & 1,
      // ЦА: yr — заходил в этом году, stf — действующий сотрудник, acc — доступ к области, ca — в ЦА
      yr: !!((fl >> 3) & 1), stf: !!((fl >> 4) & 1), fired: !((fl >> 4) & 1), acc: !!((fl >> 5) & 1), ca: !!((fl >> 6) & 1),
      cur: cur, prev: prev, fk: fk, daysPrev: bits(prev), binPrev: binOf(bits(prev), FB),
      hq: dv('hq', f[11]), it: dv('it', f[12])
    });
  }
}
// Штат без визитов в периоде (секция h): «код спец | код стрима | рук | код HQ | код IT | человек | с доступом |
// в ЦА | в ЦА и с доступом»; секция n — поимённо люди ЦА без визитов: «логин | ФИО | код спец | код стрима | рук |
// код HQ | код IT | доступ | код стажа».
function parseHold(txt, path, out, m) {
  var lines = txt.split('\n');
  var dv = function (g, id) { return m.dict[g] && m.dict[g][id] != null ? m.dict[g][id] : ''; };
  for (var i = 0; i < lines.length; i++) {
    var x = lines[i].split('|');
    if (x.length < 9) continue;
    out.push({ org: path, spec: dv('spec', x[0]), stream: dv('stream', x[1]), is_head: x[2] === '1' ? 1 : 0,
      hq: dv('hq', x[3]), it: dv('it', x[4]), n: int(x[5]), na: int(x[6]), cn: int(x[7]), cna: int(x[8]) });
  }
}
function parseNever(txt, path, out, m) {
  var lines = txt.split('\n'), ps = path ? path.split(CFG.orgSep) : [];
  var dv = function (g, id) { return m.dict[g] && m.dict[g][id] != null ? m.dict[g][id] : ''; };
  for (var i = 0; i < lines.length; i++) {
    var y = lines[i].split('|');
    if (y.length < 9 || !y[0]) continue;
    out.push({ login: y[0], fio: unz(y[1]), lvl3: ps[0] || '', lvl4: ps[1] || '', org: path, spec: dv('spec', y[2]), stream: dv('stream', y[3]),
      is_head: y[4] === '1' ? 1 : 0, hq: dv('hq', y[5]), it: dv('it', y[6]), acc: y[7] === '1', exp: dv('exp', y[8]),
      stf: true, fired: false, ca: true, nv: true, yr: false,
      cur: 0, prev: 0, fk: null, days: 0, daysPrev: 0, views: 0, bin: 0, binPrev: 0, nw: 0, m1: 0, m2: 0, last: null,
      seg: 'Ни разу', segCls: 'dead' });
  }
}
// Сегмент человека по корзине: 3–4 — Постоянный (от 6 дней/недель, 4 месяцев,
// 3 кварталов — та же мера, что KPI «Постоянных»), 2 — Эпизодический, 1 — Разовый.
function segOf(bin) {
  if (bin >= 3) return { key: 'Постоянный', cls: 'good' };
  if (bin >= 2) return { key: 'Эпизодический', cls: 'note' };
  return { key: 'Разовый', cls: 'neutral' };
}

// ---------- БЛОК 3: ТРАНСФОРМАЦИЯ ДАННЫХ ----------
// rawData -> структура, удобная для рендера. Только чтение CFG.fields.
// ЗДЕСЬ считается ВСЁ производное: агрегация, доли, дельты, ранги,
// накопительные итоги, сортировка. В SQL этого быть не должно.
//
// pa_people несёт секции одним ответом:
//   area  — эхо запроса: g = режим области, k = значения через \n,
//           fio = имя одиночного отчёта, parent = грануляция периода;
//   total — KPI области (текущий/предыдущий период, новые, постоянные,
//           ушедшие, MAU двух последних закрытых месяцев);
//   freq  — корзины частоты (k = 1..5, users) по всей области;
//   ctx   — группы людей области с полными метриками (g = org/spec/stream/head/adg;
//           org: k = путь «УС-3 › … › УС-7», parent = путь родителя);
//   list  — поимённый список: ВСЕ зрители, строка на подразделение (parent = путь),
//           в k — люди через \n, поля через \t (parseListPack);
//   ts    — динамика: k = возраст бакета, users / new_u / react_u / views;
//   coh   — когорты: k = месяц первого визита, cnt = размер, ages/acts.
function buildModel() {
  var F = CFG.fields, i, r;
  var m = {
    grain: 'd', area: { mode: '', sel: [], name: '' }, kpi: null,
    // Начало истории событий: kt — самый старый период, где новых можно отличить от давно не заходивших
    // (до него ≥90 дней истории, SQL hist); старше — «мало истории». Нет в ответе (старый SQL) — всё надёжно.
    hist: { kt: Infinity, ds: null },
    flt: null,                 // эхо применённых кросс-фильтров (area.exp) — сверка с источниками
    ts: [], total: 0, freqCtx: {}, labels: freqLabels('d'),
    // gm[разрез][ключ] — группа с полными метриками (серверные, точные по области);
    // orgKids[путь] — дочерние узлы оргструктуры (корни — под '').
    gm: { org: {}, spec: {}, stream: {}, adg: {}, head: {} }, orgKids: {},
    list: [], rows: [], coh: [], cal: {},
    // ЦА (второй лист): словарь кодов, штат без визитов (hold), не заходившие из ЦА поимённо (never),
    // как роздан доступ (acl), режим и условия ЦА, числа из SQL (пред. период, в этом году, вне ЦА).
    dict: { spec: {}, stream: {}, exp: {}, hq: {}, it: {} }, hold: [], never: [], outList: [], acl: { groups: [], users: 0 },
    staff: 0, caMode: 'acc', caApplied: caEmpty(), audApplied: caEmpty(), caScal: { prev: 0, regPrev: 0, yr: 0, out: 0 }, namesOmitted: false
  };
  var gotGrain = false, listRows = [], hRows = [], nRows = [], loRows = [];
  // Строки секции: k — текст через перевод строки (пустой — ни одной строки).
  var linesOf = function (r) { var t = String(r[F.k] == null ? '' : r[F.k]); return t ? t.split('\n') : []; };
  for (i = 0; i < rawData.length; i++) {
    r = rawData[i] || {};
    var sec = String(r[F.section] || ''), L, j, f;
    if (sec === 'area') {
      var gr = String(r[F.parent] || '');
      if (CFG.grains[gr]) { m.grain = gr; gotGrain = true; }
      m.area.mode = String(r[F.g] || '');
      var kv = String(r[F.k] == null ? '' : r[F.k]);
      m.area.sel = kv ? kv.split('\n') : [];
      // n — kt + 1: сколько свежих периодов «надёжны» для новых (0 — ни одного)
      if (r[F.n] != null && r[F.n] !== '') m.hist.kt = int(r[F.n]) - 1;
    } else if (sec === 'md') {
      if (r[F.k]) DATA_MD = toDate(r[F.k]);          // дата свежести (подписи периодов)
      m.hist.ds = toDate(r[F.parent]);                // начало истории событий
    } else if (sec === 'nm') {
      m.area.name = String(r[F.k] || '');
    } else if (sec === 'flt') {
      try { m.flt = r[F.k] ? JSON.parse(String(r[F.k])) : null; } catch (eF) { m.flt = null; }   // эхо фильтров (сверка)
    } else if (sec === 'sj') {
      var sj = {};
      try { sj = JSON.parse(String(r[F.k] || '{}')) || {}; } catch (eS) { sj = {}; }
      m.staff = num(sj.staff) || 0;
      if (sj.wide != null) CFG.wideShare = num(sj.wide) || CFG.wideShare;
      m.caMode = sj.caMode === 'cond' ? 'cond' : 'acc';
      var ca = sj.ca || {};
      m.caApplied = { org: ca.org || [], spec: ca.spec || [], stream: ca.stream || [], hq: ca.hq || [], it: ca.it || [], heads: ca.head || '', adg: ca.adg || [] };
      // группа людей из вкладки «Аудитория» каталога — тоже условие ЦА (И с условиями шапки)
      var au = sj.aud || {};
      m.audApplied = { org: au.org || [], spec: au.spec || [], stream: au.stream || [], hq: au.hq || [], it: au.it || [], heads: au.head || '', adg: [] };
    } else if (sec === 'total') {
      // users|users_prev|views|views_prev|new_u|new_prev|react_u|regular|regular_prev|sleeping|mau|mau_prev|
      // ca_prev|ca_regprev|ca_yr|ca_out|корзины 1…4
      f = String(r[F.k] || '').split('|');
      m.kpi = {
        users: int(f[0]), users_prev: int(f[1]), views: int(f[2]), views_prev: int(f[3]),
        new_u: int(f[4]), new_prev: int(f[5]), regular: int(f[7]), regular_prev: int(f[8]),
        sleeping: int(f[9]), mau: int(f[10]), mau_prev: int(f[11])
      };
      m.total = m.kpi.users;
      m.caScal = { prev: int(f[12]), regPrev: int(f[13]), yr: int(f[14]), out: int(f[15]) };
      for (j = 0; j < 4; j++) if (int(f[16 + j])) m.freqCtx[String(j + 1)] = int(f[16 + j]);
    } else if (sec === 'd') {
      // словарь: значения по строкам, код — номер строки (1…)
      var dg = String(r[F.g] || '');
      if (m.dict[dg]) { L = linesOf(r); for (j = 0; j < L.length; j++) m.dict[dg][String(j + 1)] = unz(L[j]); }
    } else if (sec === 'acl') {
      m.acl.users = int(r[F.n]);
      L = linesOf(r);
      for (j = 0; j < L.length; j++) { f = L[j].split('|'); m.acl.groups.push({ name: unz(f[0]), n: int(f[1]) }); }
    } else if (sec === 'h') {
      hRows.push(r);
    } else if (sec === 'n') {
      nRows.push(r);
    } else if (sec === 'cal') {
      // календарь: «день|users|new_u|views», день = возраст k (дней назад от даты свежести), последние 60 дней
      L = linesOf(r);
      for (j = 0; j < L.length; j++) { f = L[j].split('|'); m.cal[int(f[0])] = { users: int(f[1]), new_u: int(f[2]), views: int(f[3]) }; }
    } else if (sec === 'ts') {
      // динамика: «возраст|users|new_u|react_u|views»
      L = linesOf(r);
      for (j = 0; j < L.length; j++) { f = L[j].split('|'); m.ts.push({ k: int(f[0]), users: int(f[1]), new_u: int(f[2]), react_u: int(f[3]), views: int(f[4]) }); }
    } else if (sec === 'ctx') {
      // группы (строка на разрез g): «ключ|родитель|users|users_prev|views|views_prev|new_u|regular|sleeping»;
      // только группы с людьми ТЕКУЩЕГО периода
      var gg = String(r[F.g] || '');
      if (!m.gm[gg]) continue;
      L = linesOf(r);
      for (j = 0; j < L.length; j++) {
        f = L[j].split('|');
        var kk = unz(f[0]);
        if (!kk || !int(f[2])) continue;
        var grp = { k: kk, parent: unz(f[1]), users: int(f[2]), users_prev: int(f[3]), views: int(f[4]), views_prev: int(f[5]),
          new_u: int(f[6]), regular: int(f[7]), sleeping: int(f[8]) };
        m.gm[gg][kk] = grp;
        if (gg === 'org') (m.orgKids[grp.parent] = m.orgKids[grp.parent] || []).push(kk);
      }
    } else if (sec === 'aa') {
      // разрезы вкладки «Аудитория» каталога по выбранной области — только переслать каталогу (paAudSend)
      (m.aa = m.aa || []).push({ g: String(r[F.g] == null ? '' : r[F.g]), k: String(r[F.k] == null ? '' : r[F.k]) });
    } else if (sec === 'lo') {
      loRows.push(r);               // «вне ЦА» поимённо (ЦА по условиям) — распаковка после цикла, как list
    } else if (sec === 'list') {
      listRows.push(r);             // распаковка — после цикла: нужны словарь, грануляция и дата свежести
    } else if (sec === 'coh') {
      // когорты: «месяц|людей|возрасты через ,|активных через ,»
      L = linesOf(r);
      for (j = 0; j < L.length; j++) {
        f = L[j].split('|');
        var cm = toDate(f[0]);
        if (!cm) continue;
        var ages = f[2] ? f[2].split(',') : [], acts = f[3] ? f[3].split(',') : [], byAge = {};
        for (var ai = 0; ai < ages.length; ai++) byAge[int(ages[ai])] = int(acts[ai]);
        m.coh.push({ month: cm, size: int(f[1]), byAge: byAge });
      }
    }
  }
  // Грануляция без area-строки (старый ответ) — по числу бакетов.
  if (!gotGrain && m.ts.length) {
    var maxK = 0;
    for (i = 0; i < m.ts.length; i++) if (m.ts[i].k > maxK) maxK = m.ts[i].k;
    for (var gk in CFG.grains) {
      if (Object.prototype.hasOwnProperty.call(CFG.grains, gk) && CFG.grains[gk].n === maxK + 1) { m.grain = gk; break; }
    }
  }
  // Ось динамики — ВСЕ n бакетов периода: бакет без визитов приходит из SQL
  // пропуском и должен стать нулевым столбиком, а не выпасть из оси.
  var nB = CFG.grains[m.grain].n, byK = {};
  for (i = 0; i < m.ts.length; i++) byK[m.ts[i].k] = m.ts[i];
  var full = [];
  for (var kb = nB - 1; kb >= 0; kb--) {
    var p = byK[kb] || { k: kb, users: 0, new_u: 0, react_u: 0, views: 0 };
    // Продолжающих колонки нет: остаток стека, ниже нуля не бывает.
    p.ret = Math.max(0, p.users - p.new_u - p.react_u);
    p.nohist = p.k > m.hist.kt;  // начало истории: столбик одной серой ступенью, без деления на новых
    full.push(p);                // СТАРЫЕ бакеты (большой k) слева, свежий справа
  }
  m.ts = m.kpi || m.ts.length ? full : [];
  m.labels = freqLabels(m.grain);
  // Люди: зрители периода (list), штат без визитов (hold), не заходившие из ЦА (never). Узлы оргструктуры
  // штата без визитов — тоже в дерево (группы ЦА есть и там, где никто не заходил).
  var seenPath = {};
  for (var ok0 in m.orgKids) if (Object.prototype.hasOwnProperty.call(m.orgKids, ok0)) for (var oi = 0; oi < m.orgKids[ok0].length; oi++) seenPath[m.orgKids[ok0][oi]] = true;
  var addPath = function (path) {
    var ps = path ? path.split(CFG.orgSep) : [];
    for (var q = 1; q <= ps.length; q++) {
      var node = ps.slice(0, q).join(CFG.orgSep), par = ps.slice(0, q - 1).join(CFG.orgSep);
      if (seenPath[node]) continue;
      seenPath[node] = true;
      (m.orgKids[par] = m.orgKids[par] || []).push(node);
    }
  };
  for (i = 0; i < listRows.length; i++) parseListPack(String(listRows[i][F.k] || ''), unz(listRows[i][F.parent]), m.list, m);
  for (i = 0; i < hRows.length; i++) { var hp = unz(hRows[i][F.parent]); addPath(hp); parseHold(String(hRows[i][F.k] || ''), hp, m.hold, m); }
  for (i = 0; i < nRows.length; i++) parseNever(String(nRows[i][F.k] || ''), unz(nRows[i][F.parent]), m.never, m);
  // «Вне ЦА» при ЦА по условиям: зрители не из ЦА — только для режима «по ЦА» (KPI и частота — про людей ЦА).
  for (i = 0; i < loRows.length; i++) { var lp0 = unz(loRows[i][F.parent]); addPath(lp0); parseListPack(String(loRows[i][F.k] || ''), lp0, m.outList, m); }
  var holdCa = 0;
  for (i = 0; i < m.hold.length; i++) holdCa += m.hold[i].cn;
  m.namesOmitted = holdCa > 0 && !m.never.length;
  m.acl.groups.sort(function (a, b) { return b.n - a.n; });
  m.list.sort(function (a, b) {
    return (b.days - a.days) || (b.views - a.views) || (a.login < b.login ? -1 : (a.login > b.login ? 1 : 0));
  });
  m.coh.sort(function (a, b) { return (a.month.y - b.month.y) * 12 + (a.month.m - b.month.m); });
  m.rows = m.list;
  return m;
}
var MODEL = buildModel();
// Отпечаток ответа: меняется, когда пришли новые данные (область, период, опции).
MODEL.sig = [MODEL.grain, MODEL.total, MODEL.kpi ? MODEL.kpi.views : 0, MODEL.rows.length, MODEL.ts.length, MODEL.coh.length,
  MODEL.hold.length, MODEL.never.length, MODEL.outList.length, MODEL.caMode, JSON.stringify(MODEL.caApplied)].join('|');

// --- Целевая аудитория (из панели второго листа) -------------------------------------------------
// ЦА «по правам» (acc): действующие сотрудники с правом хотя бы на один отчёт области; «по условиям» (cond):
// штат под условиями строки «Целевая аудитория». Всё ЦА = зрители периода с флагом ca (list) + штат без визитов
// (hold: cn — в ЦА, cna — в ЦА и с доступом). Прошлый период, «в этом году» и «вне ЦА» при условиях — числа SQL.
function caEmpty() { return { org: [], spec: [], stream: [], hq: [], it: [], heads: '', adg: [] }; }
function caCfg() { return MODEL.caApplied; }
function caModeNow() { return MODEL.caMode; }
function caAttrsOn(c) { return !!(c.org.length || c.spec.length || c.stream.length || c.hq.length || c.it.length || c.heads || (c.adg && c.adg.length)); }
var CA_MEMO = { sig: null };
function emptyA() { return { ca: 0, acc: 0, reach: 0, reachPrev: 0, reg: 0, regPrev: 0, epi: 0, once: 0, ret: 0, yr: 0, out: 0, views: 0, first: 0 }; }
function addP(a, p) {
  if (p.ca) {
    a.ca++; if (p.acc) a.acc++;
    if (p.cur) {
      a.reach++; a.views += p.views;
      if (p.bin >= 3) a.reg++; else if (p.bin === 2) a.epi++; else a.once++;
      if (p.days >= 2) a.ret++;
      if (p.nw) a.first++;
    }
    if (p.prev) { a.reachPrev++; if (p.binPrev >= 3) a.regPrev++; }
  } else if (p.cur) a.out++;
}
function addH(a, h) { a.ca += h.cn; a.acc += h.cna; }
function caState() {
  var sig = MODEL.sig;
  if (CA_MEMO.sig === sig) return CA_MEMO;
  var tot = emptyA(), i;
  for (i = 0; i < MODEL.list.length; i++) addP(tot, MODEL.list[i]);
  for (i = 0; i < MODEL.hold.length; i++) addH(tot, MODEL.hold[i]);
  // Вне списка (зрители только прошлого периода, заходившие в этом году) — числами из SQL.
  tot.reachPrev = MODEL.caScal.prev; tot.regPrev = MODEL.caScal.regPrev; tot.yr = MODEL.caScal.yr;
  if (caModeNow() === 'cond') tot.out = MODEL.caScal.out;   // при условиях список — только люди ЦА
  CA_MEMO = { sig: sig, tot: tot, groups: {} };
  return CA_MEMO;
}
function caTotals() { return caState().tot; }
// Доступ почти у всех: ЦА по правам ≥ wideShare сотрудников — проценты охвата не показываем.
function wide() {
  var t = caTotals();
  return caModeNow() === 'acc' && MODEL.staff > 0 && t.ca >= CFG.wideShare * MODEL.staff;
}
function caCondText() {
  var parts = caCondParts(caCfg()), ap = caCondParts(MODEL.audApplied || caEmpty());
  // группа из каталога («Аудитория») — после условий шапки
  return parts.concat(ap).join(' · ');
}
function caCondParts(c) {
  var parts = [];
  if (c.org.length) parts.push(c.org.length === 1 ? c.org[0].split(CFG.orgSep).pop() : c.org.length + ' подразд.');
  if (c.spec.length) parts.push(c.spec.length === 1 ? c.spec[0] : c.spec.length + ' спец.');
  if (c.stream.length) parts.push(c.stream.length === 1 ? c.stream[0] : c.stream.length + ' стрим.');
  if (c.hq.length) parts.push(c.hq.join(', '));
  if (c.it.length) parts.push(c.it.join(', '));
  if (c.heads === '1') parts.push('руководители'); else if (c.heads === 'n' || c.heads === '0') parts.push('не руководители');
  if (c.adg && c.adg.length) parts.push(c.adg.length === 1 ? c.adg[0] : c.adg.length + ' AD-групп');
  return parts;
}

// ---------- БЛОК 4: ФОРМАТИРОВАНИЕ И ЦВЕТ ----------
// Подсказка: тот же HTML-контракт, что и у макетного UI.tipHtml (ui.js 86–106)
// и у тела 788805 — тултипы чартов одного борда неразличимы.
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

// Последний ЗАКРЫТЫЙ месяц от даты свежести (витрина за вчера).
function closedMonth(back) {
  var now = refDay();
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

// «Что видно в данных»: пороговый отбор фактов по KPI области.
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
  if (shNew >= 22 && MODEL.hist.kt >= (G.n || 0) - 1) {
    out.push({ sev: 'good',
      lead: 'Новые дают ' + pct(shNew) + ' аудитории',
      body: 'Из ' + nf(k.users) + ' пользователей ' + nf(k.new_u) + ' пришли впервые: рост идёт за счёт притока.',
      rule: 'доля новых ≥22%' });
  }
  if (shReg < 25) {
    out.push({ sev: 'mid',
      lead: 'Постоянных ' + pct(shReg) + ' — меньше четверти',
      body: 'Только ' + nf(k.regular) + ' человек заходили ' + G.reg + ' и более ' + G.units + ' за период.',
      rule: 'доля постоянных <25%' });
  }
  var ord = { high: 0, mid: 1, good: 2 };
  out.sort(function (a, b) { return ord[a.sev] - ord[b.sev]; });
  return out;
}



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
    P + '-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;}',
    P + '-kpi{background:var(--card);border-radius:12px;padding:12px 14px;min-width:0;}',
    P + '-k-label{font-size:var(--fs-note);color:var(--muted);font-weight:500;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    P + '-k-val{font-size:24px;font-weight:600;letter-spacing:-.4px;line-height:1.15;color:var(--ink);margin-top:4px;font-variant-numeric:tabular-nums;}',
    P + '-k-row{display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap;min-height:20px;}',
    P + '-k-sub{font-size:var(--fs-note);color:var(--muted);}',
    P + '-k-sub b{color:var(--ink2);font-weight:500;}',
    P + '-info{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;flex:0 0 auto;'
      + 'border:1px solid var(--muted2);color:var(--muted);font-size:9px;line-height:1;font-weight:600;font-style:normal;cursor:help;}',
    P + '-info:hover{border-color:var(--act);color:var(--act);}',
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
    P + '-panel-h{padding:14px 16px;font-weight:600;font-size:14.5px;display:flex;align-items:center;gap:10px;flex-wrap:nowrap;flex:0 0 auto;}',   // вкладки не уезжают от длины заголовка
    P + '-panel-h .sub{font-size:var(--fs-note);color:var(--muted);font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    P + '-h-txt{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 0;}',
    P + '-h-ttl{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
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
    // Тур «Как работать» (ведёт каталог): затемнение вокруг цели и рамка — в body, как подсказка.
    P + '-tour{display:none;}',
    P + '-tb{position:fixed;left:0;top:0;width:0;height:0;z-index:99990;background:rgba(17,24,39,.55);transition:left .2s,top .2s,width .2s,height .2s;}',
    P + '-tb[data-tb="h"]{background:transparent;cursor:default;}',
    P + '-tring{position:fixed;z-index:99991;border-radius:10px;box-shadow:0 0 0 2px #245FD4,0 0 0 6px rgba(43,108,255,.22);pointer-events:none;transition:left .2s,top .2s,width .2s,height .2s,opacity .2s;}',
    P + '-tnoa *{transition:none !important;}',
    P + '-who-opts-pop{min-width:256px;padding:10px;display:flex;flex-direction:column;gap:8px;}',
    P + '-who-opts-pop>*{flex-shrink:0;}',          // тело с прокруткой (fitDd) не сминает строки
    P + '-who-opts-pop ' + P + '-psearch input{width:100%;height:30px;}',
    P + '-wo-h{font-size:11px;font-weight:500;color:var(--muted);',
    '  text-transform:uppercase;letter-spacing:.4px;}',
    P + '-wo-ex{max-height:224px;overflow:auto;}',
    P + '-wo-note{font-size:11px;color:var(--muted);line-height:1.35;margin-top:-4px;}',
    P + '-wo-foot{font-size:11px;color:var(--muted);border-top:1px solid var(--line);padding-top:8px;}',
    P + '-dd-pre{flex:0 0 auto;color:var(--muted);font-weight:400;margin-right:4px;}',
    P + '-who-opts ' + P + '-dd-trg{gap:6px;}',
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
    // Шапка людей группы НЕ липкая (общее правило ptable th — sticky): иначе при прокрутке ложится на шапку таблицы.
    P + '-ptable.sub thead th{position:static;z-index:auto;padding:4px 8px 3px;font-size:10px;font-weight:500;color:var(--muted);text-transform:uppercase;letter-spacing:.3px;text-align:right;border-bottom:1px solid var(--line2);background:transparent;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:help;}',
    P + '-ptable.sub thead th.txt{text-align:left;}',
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
    P + '-rflag.fired{background:#f1f3f6;color:#6b7280;}',   // «увол.» — нейтрально: не говорим, сам ушёл или уволили
    P + '-sig-chip{display:inline-block;font-size:11px;font-weight:500;',
    '  border-radius:999px;padding:2px 9px;}',
    P + '-sig-chip.good{background:var(--green-bg);color:var(--green-tx);}',
    P + '-sig-chip.note{background:var(--blue-bg);color:var(--act-ink);}',
    P + '-sig-chip.neutral{background:#f3f4f6;color:var(--muted);}',
    // Плашка сверки фильтров — вне корня виджета: CSS-переменные корня до неё не доходят, цвета явные.
    P + '-selg{position:absolute;left:0;top:0;right:0;bottom:0;z-index:30;display:none;align-items:flex-start;justify-content:center;padding-top:96px;background:rgba(246,246,246,.6);}',
    P + '-selg.on{display:flex;}',
    P + '-selg-box{display:flex;align-items:center;gap:10px;max-width:380px;background:#fff;border:1px solid #e7e9ee;border-radius:10px;padding:10px 14px;box-shadow:0 10px 30px rgba(24,33,50,.12);font-family:' + CFG.fonts.family + ';font-size:12.5px;color:#454b55;}',
    P + '-selg.late ' + P + '-selg-box{flex-direction:column;align-items:flex-start;gap:6px;border-color:#f0c36d;}',
    P + '-selg-box b{font-weight:600;color:#23272e;}',
    P + '-selg-box span{color:#8a909c;line-height:1.4;}',
    P + '-selg-box button{border:0;border-radius:8px;background:#245FD4;color:#fff;font:inherit;font-weight:500;padding:6px 12px;cursor:pointer;}',
    P + '-selg-spin{width:14px;height:14px;border-radius:50%;border:2px solid #e7e9ee;border-top-color:#245FD4;animation:' + CFG.ns + '-spin .8s linear infinite;flex:0 0 auto;}',
    '@keyframes ' + CFG.ns + '-spin{to{transform:rotate(360deg)}}',
    P + '-tbl-note{margin-top:8px;font-size:var(--fs-note);color:var(--muted);line-height:1.5;flex:0 0 auto;}',
    P + '-leg-nh{cursor:help;}',
    P + '-ct-nh td{opacity:.55;}',

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
    P + '-panel-h > ' + P + '-sub-tabs{margin-left:auto;flex:0 0 auto;}',
    P + '-scopebar{display:grid;grid-template-columns:minmax(210px,.62fr) minmax(0,1.38fr);gap:16px;align-items:center;border:1px solid #f0dcb4;border-radius:10px;'
      + 'background:linear-gradient(100deg,#fffaf1 0,#fff 55%);padding:10px 14px;flex:0 0 auto;}',
    P + '-sb-col{min-width:0;display:flex;flex-direction:column;gap:4px;}',
    P + '-sb-set{border-left:1px solid #f3e6cc;padding-left:16px;}',
    P + '-as-t{font-size:var(--fs-body);font-weight:600;color:var(--ink);display:flex;align-items:center;gap:8px;flex-wrap:wrap;line-height:1.35;}',
    P + '-as-t ' + P + '-sig-chip{flex:0 0 auto;}',
    P + '-as-x{font-size:var(--fs-note);color:var(--muted);line-height:1.45;}',
    P + '-as-h{color:#a08556;}',
    P + '-as-x b{color:var(--ink2);font-weight:500;}',
    P + '-sig-chip.warn{background:#fff0d6;color:#8a5a00;}',
    P + '-fn-box{flex:0 0 auto;}',
    P + '-cap2{font-size:var(--fs-cap);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:500;}',
    P + '-warn{font-size:var(--fs-note);line-height:1.45;color:#7a5200;background:#fff6e6;border-radius:8px;padding:8px 10px;}',
    P + '-sig-chip.dead{background:#f0f1f3;color:var(--muted);}',
    P + '-segstrip.ca ' + P + '-seg-part.never .sp-bar{background:repeating-linear-gradient(135deg,#dfe3e8 0 4px,#eef0f3 4px 8px)!important;}',
    P + '-panel-b.path-wrap{overflow:auto;display:flex;flex-direction:column;gap:18px;}',
    P + '-aud-sum{display:flex;align-items:center;gap:18px;flex-wrap:wrap;font-size:var(--fs-note);color:var(--muted);margin:2px 0 8px;}',
    P + '-aud-sum b{color:var(--ink);font-weight:600;}',
    P + '-aud-sum button{margin-left:auto;}',
    P + '-who-mode{display:flex;align-items:center;gap:8px;margin:0 0 10px;}',
    P + '-who-mode-l{font-size:var(--fs-note);color:var(--muted);}',
    // Календарь посещений: месяцы — отдельными мини-календарями (Пн…Вс × недели), чтобы не слипались.
    P + '-panel-b.cal-wrap{overflow:auto;display:flex;flex-direction:column;gap:14px;}',
    P + '-cal-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}',
    P + '-cal-chips{display:flex;gap:8px;margin-left:auto;flex-wrap:wrap;}',
    P + '-cal-chip{border:1px solid var(--line2);border-radius:8px;padding:5px 10px;font-size:var(--fs-note);color:var(--muted);line-height:1.3;}',
    P + '-cal-chip b{display:block;color:var(--ink);font-size:var(--fs-lead);font-weight:600;font-variant-numeric:tabular-nums;}',
    // Месяцы — всегда ОДНИМ рядом (без переноса): на широкой панели свободное место делится поровну —
    // между месяцами и от краёв чарта (space-evenly), на узкой сжимаются до 130 px (отступ 20 px — и между, и у краёв: gap + padding); уже этого — горизонтальная прокрутка ряда.
    P + '-cal-months{display:flex;flex:0 0 auto;flex-wrap:nowrap;justify-content:space-evenly;gap:0 20px;padding:0 20px;box-sizing:border-box;overflow-x:auto;overflow-y:hidden;}',
    P + '-cal-mon{flex:1 1 0;min-width:130px;max-width:280px;}',
    P + '-cal-mt{font-size:var(--fs-body);font-weight:500;color:var(--ink2);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    P + '-cal-mt span{color:var(--muted);font-weight:400;}',
    P + '-cal-g{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px;}',
    P + '-cal-wd{font-size:var(--fs-cap);color:var(--muted);text-align:center;letter-spacing:.3px;padding-bottom:2px;}',
    P + '-cal-wd.we{color:var(--muted2);}',
    P + '-cal-c{height:24px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:10.5px;color:var(--ink2);font-variant-numeric:tabular-nums;cursor:help;}',
    P + '-cal-c.hi{color:#fff;}',
    P + '-cal-c.out{background:transparent;color:var(--muted2);cursor:default;}',
    P + '-cal-c.nd{background:transparent;border:1px dashed #dde0e6;color:var(--muted2);}',
    P + '-cal-c.last{box-shadow:0 0 0 2px var(--ink);}',
    P + '-cal-c:not(.out):hover{box-shadow:0 0 0 2px var(--ink2);}',
    P + '-cal-lg{display:flex;align-items:center;gap:4px;font-size:var(--fs-cap);color:var(--muted);flex-wrap:wrap;}',
    P + '-cal-lg i{width:11px;height:11px;border-radius:3px;display:inline-block;}',
    P + '-cal-lg .sp{width:12px;}',
    P + '-cal-low{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:20px;align-items:start;}',
    '@media (max-width:640px){' + P + '-cal-low{grid-template-columns:1fr;}}',
    P + '-cal-h{font-size:13px;font-weight:500;color:var(--ink2);margin-bottom:8px;}',
    P + '-cal-wr{display:grid;grid-template-columns:24px 1fr 76px;align-items:center;gap:8px;font-size:var(--fs-body);margin-bottom:6px;}',
    P + '-cal-wr .l{color:var(--ink2);font-weight:500;}',
    P + '-cal-wr.we .l{color:var(--muted);}',
    P + '-cal-tr{position:relative;height:16px;background:#f5f6f8;border-radius:4px;}',
    P + '-cal-tr i{position:absolute;left:0;top:0;bottom:0;border-radius:4px;}',
    P + '-cal-tr u{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--ink);opacity:.5;border-radius:1px;}',
    P + '-cal-wr .v{text-align:right;color:var(--ink);font-variant-numeric:tabular-nums;}',
    P + '-cal-wr .v s{text-decoration:none;color:var(--muted);font-size:var(--fs-cap);margin-left:3px;}',
    P + '-cal-split{display:flex;height:8px;border-radius:4px;overflow:hidden;margin:4px 0 6px;}',
    P + '-cal-note{font-size:var(--fs-note);color:var(--muted);line-height:1.45;}',
    P + '-cal-note b{color:var(--ink);font-weight:500;}',
    P + '-cal-see{background:#f8f9fb;border-radius:8px;padding:10px 12px;font-size:var(--fs-body);line-height:1.5;color:var(--ink2);}',
    P + '-cal-see b{font-weight:500;color:var(--ink);}',
    '</style>'
  ].join('\n');
}
// Только конкатенация строк. Все данные через esc().
// ВНИМАНИЕ: здесь префикс БЕЗ точки. var P = '.' + CFG.ns дал бы class=".pvt-root".

// ── Срезы списка (порядок макета: настройки → шина → корзина → поиск) ──
// adgroup-шина локально НЕ сужает: членства человек→AD-группа в ответе нет
// (хвост NOTES §6); каталог и динамику сужает сервер через adg_f.
// Узел оргструктуры — префикс пути: человек «А › Б › В» входит в «А» и «А › Б».
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
function isCa() { return state.whoMode === 'ca'; }
// Зрители периода с учётом «Фильтра людей» (руководители / исключения) — основа KPI при настройках и режима частоты.
function viewersKept() {
  return MODEL.list.filter(function (p) {
    return (!state.headsOnly || p.is_head) && state.excl.indexOf(p.login) < 0;
  });
}
// Список «Кто смотрит»: по частоте — зрители; по ЦА — ещё люди ЦА без визитов и (при ЦА по условиям) зрители вне ЦА.
function baseList() {
  if (!isCa()) return viewersKept();
  caSegs();
  var keep = function (p) { return (!state.headsOnly || p.is_head) && state.excl.indexOf(p.login) < 0; };
  return viewersKept().concat(MODEL.outList.filter(keep), MODEL.never.filter(keep));
}
// Сегмент человека в режиме ЦА: люди ЦА — по частоте, остальные зрители — «Вне ЦА», без визитов — «Ни разу».
function caSegs() {
  if (MODEL.__segCa) return;
  for (var i = 0; i < MODEL.list.length; i++) {
    var p = MODEL.list[i];
    if (p.ca) { p.segCa = p.seg; p.segClsCa = p.segCls; } else { p.segCa = 'Вне ЦА'; p.segClsCa = 'dead'; }
  }
  for (i = 0; i < MODEL.never.length; i++) { MODEL.never[i].segCa = 'Ни разу'; MODEL.never[i].segClsCa = 'dead'; }
  for (i = 0; i < MODEL.outList.length; i++) { MODEL.outList[i].segCa = 'Вне ЦА'; MODEL.outList[i].segClsCa = 'dead'; }
  MODEL.__segCa = true;
}
function segHit(p) {
  var s = state.segSel;
  if (!s) return true;
  if (s === 'reach') return p.ca && !!p.cur;
  if (s === 'never') return p.ca && !p.cur;
  if (s === 'out') return !p.ca && !!p.cur;
  return true;
}
function busList() { return baseList().filter(matchesPicks); }
function shownList() {
  var q = (state.q || '').toLowerCase();
  return busList().filter(function (p) {
    return (isCa() ? segHit(p) : (!state.freqSel || String(p.bin) === state.freqSel)) &&
      (!q || ((p.fio + ' ' + p.login).toLowerCase().indexOf(q) >= 0));
  });
}
function pickCount() {
  var n = 0;
  for (var k in state.picks) if (Object.prototype.hasOwnProperty.call(state.picks, k)) n += state.picks[k].length;
  return n;
}
// Локальные условия списка активны → в сводной таблице появляется колонка
// «В выборке» (серверные итоги групп — по всей области, выборка — по списку).
function localActive() {
  // Корзина частоты и настройки списка теперь пересчитывают сами итоги (localGM),
  // колонка «В выборке» — только для поиска и выбора групп.
  return !!(state.q || pickCount() - state.picks.login.length > 0);
}
// Фильтр людей панели: корзина частоты + «только руководители» + исключённые логины.
// Список — все зрители области, поэтому KPI и сводную по нему можно пересчитать в чарте.
function peopleFilterOn() { return !!(state.freqSel || state.headsOnly || state.excl.length); }
function filteredPeople() {
  return viewersKept().filter(function (p) { return !state.freqSel || String(p.bin) === state.freqSel; });
}
function addPerson(g, p) {
  g.users++; g.views += p.views || 0; g.new_u += p.nw || 0;
  if (p.bin >= 3) g.regular++;
  g.mau += p.m1 || 0; g.mau_prev += p.m2 || 0;
}
function emptyAgg() { return { users: 0, users_prev: 0, views: 0, views_prev: 0, new_u: 0, new_prev: 0, regular: 0, regular_prev: 0, sleeping: 0, mau: 0, mau_prev: 0 }; }
// KPI при фильтре людей: по отобранным (прошлого периода для них нет — дельты «не сравнивается»).
// Корзина частоты на KPI НЕ влияет (фидбек владельца: по одной корзине KPI бесполезны —
// «постоянных 100%» и т. п.); влияют только настройки списка (руководители, исключения).
function effKpi() {
  if (!(state.headsOnly || state.excl.length) || !MODEL.kpi) return MODEL.kpi;
  var ps = viewersKept(), k = emptyAgg();
  for (var i = 0; i < ps.length; i++) addPerson(k, ps[i]);
  k.local = true;
  return k;
}
// Итоги групп по отобранным людям: ключи — как у узлов текущего разреза.
var LOCAL_GM = null, LOCAL_TOT = 0;
function localGM(cut) {
  var ps = filteredPeople(), out = {}, L = orgLevelOf(cut), j;
  var add = function (key, p) { addPerson(out[key] || (out[key] = emptyAgg()), p); };
  for (var i = 0; i < ps.length; i++) {
    var p = ps[i], lp;
    if (L) { lp = orgParts(p.org); add(lp.length < L - 2 ? ORG_NONE : lp.slice(0, L - 2).join(CFG.orgSep), p); }
    else if (cut === 'org') { lp = orgParts(p.org); for (j = 1; j <= lp.length; j++) add(lp.slice(0, j).join(CFG.orgSep), p); }
    else if (cut === 'heads') add(p.is_head ? 'Тим-лиды' : 'Остальные', p);
    else if ((cut === 'spec' || cut === 'stream') && p[cut]) add(p[cut], p);
  }
  return out;
}

// Визит «вчера / N дн»: витрина за вчера, последняя возможная дата — вчера.
// Дата визита не хранится у человека (40+ тыс. объектов Date на весь Proteus): p.last — дней до даты свежести.
function daysAgo(p) {
  if (p.last == null) return null;
  var now = new Date(), md = refDay();
  return p.last + Math.round((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    - Date.UTC(md.getUTCFullYear(), md.getUTCMonth(), md.getUTCDate())) / 86400000);
}
function lastDate(p) {
  if (p.last == null) return null;
  var dt = new Date(refDay().getTime() - p.last * 86400000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
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
      (p.is_head ? ' <i class="' + CFG.ns + '-rflag head">рук.</i>' : '') + (p.fired ? ' <i class="' + CFG.ns + '-rflag fired" title="Нет среди действующих сотрудников (штатные и ГПХ с AD-логином): увольнение или служебная учётка">увол.</i>' : '') +
      '<span class="' + CFG.ns + '-unit-sub">' + esc(p.login) + '</span></td>' +
    '<td class="txt sec">' + esc(ps.length ? ps[ps.length - 1] : '—') +
      '<span class="' + CFG.ns + '-unit-sub">' + esc(ps.length > 1 ? 'УС-' + (ps.length + 2) + ' · ' + ps[0] : (p.spec || '—')) + '</span></td>' +
    '<td class="txt">' + esc(p.exp || '—') + '</td>' +
    '<td class="lead">' + (p.days || '<span class="mut">0</span>') + '</td>' +
    '<td>' + (p.views ? nf(p.views) : '<span class="mut">0</span>') + '</td>' +
    '<td>' + lastVisitHtml(p) + '</td>' +
    '<td class="txt"><span class="' + CFG.ns + '-sig-chip ' + (isCa() && p.segCa ? p.segClsCa : p.segCls) + '">' + esc(isCa() && p.segCa ? p.segCa : p.seg) + '</span></td>' +
    '</tr>';
}
function grainCfg() { return CFG.grains[MODEL.grain] || CFG.grains.d; }  // грануляция — из ответа (area.parent), не из state: раньше всегда «дн»
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
  if (isCa() && state.segSel === 'never' && MODEL.namesOmitted) {
    return 'Имена не загружены: не заходивших из ЦА больше 20 000. Сузьте ЦА условиями в строке «Целевая аудитория» — список появится; числа по группам — в группировке.';
  }
  return isCa() ? 'Никто не подходит под выбранный сегмент, поиск и выбор.' : 'Никто не подходит под корзину частоты, поиск и настройки.';
}
function peopleTableHtml(plist) {
  var sorted = sortPeople(plist);
  var PS = CFG.pageSize, pager = pagerHtml(sorted.length);
  var page = sorted.slice(state.page * PS, state.page * PS + PS);   // в DOM — только страница (RETRO 30)
  var th = '';
  for (var c = 0; c < CFG.pcols.length; c++) {
    var pc = CFG.pcols[c];
    // «Дней» — активные периоды текущей грануляции (Недель / Месяцев / Кварталов)
    if (pc.key === 'days') pc = { key: 'days', label: cap(grainCfg().units), hint: pc.hint };
    th += sortTh('data-psort', pc, state.pSort);
  }
  var rows = '';
  for (var i = 0; i < page.length; i++) rows += personRowHtml(page[i]);
  return '<div class="' + CFG.ns + '-tbl-scroll"><table class="' + CFG.ns + '-ptable dense who-people"><thead><tr>' + th + '</tr></thead><tbody>' +
    (rows || '<tr><td colspan="' + CFG.pcols.length + '" class="' + CFG.ns + '-empty-td">' + emptyPeopleText() + '</td></tr>') +
    '</tbody></table></div>' + pager;
}

// --- Сводная таблица групп ---------------------------------------------------
// Итоги групп — серверные (ctx pa_people): точные уникальные люди по области,
// не сумма строк списка. Людей внутри группы показывает список (все зрители).
var ZERO_M = { users: 0, users_prev: 0, views: 0, views_prev: 0, new_u: 0, regular: 0, sleeping: 0 };
function gMetricsFreq(g) {
  g = g || ZERO_M;
  var tot = (LOCAL_GM ? LOCAL_TOT : MODEL.total) || 1, G = CFG.grains[MODEL.grain] || CFG.grains.d;
  return {
    users: g.users, users_prev: g.users_prev, views: g.views, new_u: g.new_u, regular: g.regular, sleeping: g.sleeping,
    share: g.users / tot * 100,
    dUsers: G.prev && g.users_prev ? (g.users / g.users_prev - 1) * 100 : null,
    vpu: g.users ? g.views / g.users : 0,
    regShare: g.users ? g.regular / g.users * 100 : 0
  };
}
function minusM(a, b) {
  var o = {};
  for (var k in ZERO_M) if (Object.prototype.hasOwnProperty.call(ZERO_M, k)) o[k] = Math.max(0, (a[k] || 0) - (b[k] || 0));
  return o;
}
// Узел таблицы: id (ключ раскрытия), cut/k (людская шина), имя, глубина,
// метрики, дочерние узлы и люди, прикреплённые к узлу.
function makeNodeFreq(cut, k, name, depth, g, sub) {
  if (LOCAL_GM) g = LOCAL_GM[k] || ZERO_M;
  return { id: cut + ':' + k, cut: cut, k: k, name: name, depth: depth, m: gMetricsFreq(g), sub: sub || '' };
}
// Вид «один уровень УС»: whoCut = org3…org7 → номер уровня (0 — не он).
// ORG_NONE — ключ строки «—» (оргструктура не доходит до уровня); в шину не уходит.
var ORG_NONE = '\u2014none';
function orgLevelOf(cut) { var m = /^org([3-7])$/.exec(cut || ''); return m ? +m[1] : 0; }
function nodeKidsFreq(nd) {
  if (nd.cut !== 'org' || nd.flat) return [];
  var ks = MODEL.orgKids[nd.k] || [], out = [];
  for (var i = 0; i < ks.length; i++) out.push(orgNodeFreq(ks[i]));
  return out.filter(function (x) { return x.m.users > 0; });
}
function orgNodeFreq(path) {
  var ps = orgParts(path);
  return makeNodeFreq('org', path, ps[ps.length - 1], ps.length - 1, MODEL.gm.org[path], 'УС-' + (ps.length + 2));
}
function rootNodesFreq(cut) {
  var out = [], k, src, L = orgLevelOf(cut), sumL = {};
  LOCAL_GM = peopleFilterOn() ? localGM(cut) : null;
  LOCAL_TOT = LOCAL_GM ? filteredPeople().length : 0;
  if (L) {
    // Плоско: все узлы уровня УС-L; вторая строка — путь до него. Шина та же (org_f путём).
    for (k in MODEL.gm.org) {
      if (!Object.prototype.hasOwnProperty.call(MODEL.gm.org, k)) continue;
      var pp = orgParts(k);
      if (pp.length !== L - 2) continue;
      var fn = makeNodeFreq('org', k, pp[pp.length - 1], 0, MODEL.gm.org[k], 'УС-' + L + (pp.length > 1 ? ' · ' + pp.slice(0, -1).join(CFG.orgSep) : ''));
      fn.id = cut + ':' + k; fn.flat = true;
      out.push(fn);
      for (var zk in ZERO_M) if (Object.prototype.hasOwnProperty.call(ZERO_M, zk)) sumL[zk] = (sumL[zk] || 0) + ((MODEL.gm.org[k] || {})[zk] || 0);
    }
    // Строка «—»: кто не доходит до УС-L. Узлы одного уровня не пересекаются, поэтому
    // остаток = итог области − сумма узлов (точно); сумма строк таблицы = «Итого по области».
    var rest = minusM(MODEL.kpi || ZERO_M, sumL);
    if (rest.users > 0) {
      var rn = makeNodeFreq('org', ORG_NONE, '—', 0, rest, 'не доходят до УС-' + L);
      rn.id = cut + ':' + ORG_NONE; rn.flat = true; rn.noBus = true;
      out.push(rn);
    }
  } else if (cut === 'org') {
    var ks = MODEL.orgKids[''] || [];
    for (var i = 0; i < ks.length; i++) out.push(orgNodeFreq(ks[i]));
  } else if (cut === 'heads') {
    var hd = MODEL.gm.head['1'] || ZERO_M;
    out.push(makeNodeFreq('heads', 'Тим-лиды', 'Тим-лиды', 0, hd));
    out.push(makeNodeFreq('heads', 'Остальные', 'Остальные', 0, minusM(MODEL.kpi || ZERO_M, hd)));
  } else {
    src = MODEL.gm[cut === 'adgroup' ? 'adg' : cut] || {};
    for (k in src) if (Object.prototype.hasOwnProperty.call(src, k)) out.push(makeNodeFreq(cut, k, k, 0, src[k]));
  }
  // узлы только штата без визитов (дерево общее с ЦА) в режиме частоты не показываем
  return out.filter(function (x) { return x.m.users > 0; });
}
// Люди списка, прикреплённые к узлу (для оргструктуры — ровно этот путь;
// сотрудники нижних уровней живут в дочерних узлах).
function peopleIndex(plist, cut) {
  var ix = {}, key;
  var L = orgLevelOf(cut);
  for (var i = 0; i < plist.length; i++) {
    var p = plist[i];
    if (L) {                           // уровень УС-L: все сотрудники поддерева узла
      var lp = orgParts(p.org);
      key = lp.length < L - 2 ? ORG_NONE : lp.slice(0, L - 2).join(CFG.orgSep);
    } else if (cut === 'org') key = p.org;
    else if (cut === 'heads') key = p.is_head ? 'Тим-лиды' : 'Остальные';
    else if (cut === 'spec' || cut === 'stream') key = p[cut];
    else continue;                     // AD-группы: членств в ответе нет
    (ix[key] = ix[key] || []).push(p);
  }
  return ix;
}
// «В выборке»: люди текущего списка в группе (для узла — во всём поддереве).
function localCounts(plist, cut) {
  var c = {}, i, j;
  for (i = 0; i < plist.length; i++) {
    var p = plist[i];
    if (cut === 'org') {
      var ps = orgParts(p.org);
      for (j = 1; j <= ps.length; j++) { var pre = ps.slice(0, j).join(CFG.orgSep); c[pre] = (c[pre] || 0) + 1; }
    } else if (cut === 'heads') {
      var hk = p.is_head ? 'Тим-лиды' : 'Остальные'; c[hk] = (c[hk] || 0) + 1;
    } else if (cut === 'spec' || cut === 'stream') {
      c[p[cut]] = (c[p[cut]] || 0) + 1;
    }
  }
  return c;
}
function gColsNowFreq() {
  var G = CFG.grains[MODEL.grain] || CFG.grains.d, out = [];
  for (var i = 0; i < CFG.gcols.length; i++) if (!CFG.gcols[i].prevOnly || G.prev) out.push(CFG.gcols[i]);
  return out;
}

// --- Группы в режиме «по ЦА» (из панели второго листа): зрители периода + штат без визитов по ключу группы ---
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
  for (i = 0; i < MODEL.list.length; i++) {
    ks = keysOf(cut, MODEL.list[i]);
    for (j = 0; j < ks.length; j++) addP(out[ks[j]] || (out[ks[j]] = emptyA()), MODEL.list[i]);
  }
  for (i = 0; i < MODEL.outList.length; i++) {
    ks = keysOf(cut, MODEL.outList[i]);
    for (j = 0; j < ks.length; j++) addP(out[ks[j]] || (out[ks[j]] = emptyA()), MODEL.outList[i]);
  }
  for (i = 0; i < MODEL.hold.length; i++) {
    if (!MODEL.hold[i].cn) continue;
    ks = keysOf(cut, MODEL.hold[i]);
    for (j = 0; j < ks.length; j++) addH(out[ks[j]] || (out[ks[j]] = emptyA()), MODEL.hold[i]);
  }
  st.groups[cut] = out;
  return out;
}
function gMetricsCa(a) {
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
function makeNodeCa(cut, k, name, depth, a, sub) {
  return { id: cut + ':' + k, cut: cut, k: k, name: name, depth: depth, m: gMetricsCa(a), sub: sub || '' };
}
function orgNodeCa(path) {
  var ps = orgParts(path);
  return makeNodeCa('org', path, ps[ps.length - 1], ps.length - 1, groupAgg('org')[path], 'УС-' + (ps.length + 2));
}
function nodeKidsCa(nd) {
  if (nd.cut !== 'org' || nd.flat) return [];
  var ks = MODEL.orgKids[nd.k] || [], out = [];
  for (var i = 0; i < ks.length; i++) out.push(orgNodeCa(ks[i]));
  return out.filter(function (x) { return x.m.users > 0; });
}
function rootNodesCa(cut) {
  var out = [], k, L = orgLevelOf(cut), ag = groupAgg(cut);
  if (L) {
    for (k in ag) {
      if (!Object.prototype.hasOwnProperty.call(ag, k)) continue;
      if (k === ORG_NONE) {
        var rn = makeNodeCa('org', ORG_NONE, '—', 0, ag[k], 'не доходят до УС-' + L);
        rn.id = cut + ':' + ORG_NONE; rn.flat = true; rn.noBus = true; out.push(rn);
        continue;
      }
      var pp = orgParts(k);
      var fn2 = makeNodeCa('org', k, pp[pp.length - 1], 0, ag[k], 'УС-' + L + (pp.length > 1 ? ' · ' + pp.slice(0, -1).join(CFG.orgSep) : ''));
      fn2.id = cut + ':' + k; fn2.flat = true; out.push(fn2);
    }
  } else if (cut === 'org') {
    var ks = MODEL.orgKids[''] || [];
    for (var i = 0; i < ks.length; i++) out.push(orgNodeCa(ks[i]));
  } else if (cut === 'heads') {
    out.push(makeNodeCa('heads', 'Тим-лиды', 'Тим-лиды', 0, ag['Тим-лиды']));
    out.push(makeNodeCa('heads', 'Остальные', 'Остальные', 0, ag['Остальные']));
  } else {
    for (k in ag) {
      if (!Object.prototype.hasOwnProperty.call(ag, k)) continue;
      var nd = makeNodeCa(cut, k, k === ORG_NONE ? '—' : k, 0, ag[k], k === ORG_NONE ? 'не указано' : '');
      if (k === ORG_NONE) nd.noBus = true;
      out.push(nd);
    }
  }
  return out.filter(function (x) { return x.m.users > 0; });
}
function gMetrics(g) { return isCa() ? gMetricsCa(g) : gMetricsFreq(g); }
function makeNode(cut, k, name, depth, g, sub) { return isCa() ? makeNodeCa(cut, k, name, depth, g, sub) : makeNodeFreq(cut, k, name, depth, g, sub); }
function orgNode(path) { return isCa() ? orgNodeCa(path) : orgNodeFreq(path); }
function nodeKids(nd) { return isCa() ? nodeKidsCa(nd) : nodeKidsFreq(nd); }
function rootNodes(cut) { if (isCa()) { LOCAL_GM = null; return rootNodesCa(cut); } return rootNodesFreq(cut); }
function gColsNow() {
  if (!isCa()) return gColsNowFreq();
  var G = CFG.grains[MODEL.grain] || CFG.grains.d, out = [];
  for (var i = 0; i < CFG.gcolsCa.length; i++) if (!CFG.gcolsCa[i].prevOnly || G.prev) out.push(CFG.gcolsCa[i]);
  return out;
}
function sortNodes(nodes) {
  var sc = state.gSort;
  return nodes.slice().sort(function (a, b) {
    if (!!a.noBus !== !!b.noBus) return a.noBus ? 1 : -1;   // строка «—» — всегда внизу
    var va = sc.key === 'name' ? a.name.toLowerCase() : a.m[sc.key];
    var vb = sc.key === 'name' ? b.name.toLowerCase() : b.m[sc.key];
    var ea = va == null, eb = vb == null;
    if (ea !== eb) return ea ? 1 : -1;          // пустые — вниз (RETRO 29)
    var r = ea ? 0 : (va > vb ? 1 : (va < vb ? -1 : 0)) * sc.dir;
    return r || b.m.users - a.m.users || (a.name < b.name ? -1 : 1);
  });
}
// Ячейка «Доля»: полоса фиксированной ширины + число в поле фиксированной ширины
// (вправо) — полосы всех строк начинаются на одной вертикали, «8%» и «10,0%» не сдвигают их.
function shareCell(share, barPct) {
  return '<td class="shr"><span class="' + CFG.ns + '-shr">' +
    '<span class="' + CFG.ns + '-cellbar"' + (barPct == null ? ' style="visibility:hidden"' : '') + '><i style="width:' + (barPct || 0).toFixed(1) + '%"></i></span>' +
    '<span class="' + CFG.ns + '-shr-v">' + pct(share, share < 10 ? 1 : 0) + '</span></span></td>';
}
function gCellHtml(key, m) {
  if (key === 'users') return '<td class="lead">' + nf(m.users) + '</td>';
  if (key === 'share') {
    // Полоса — от крупнейшей группы верхнего уровня: доли 2–8% иначе не видны.
    return shareCell(m.share, Math.min(100, m.share / (MAX_SHARE || 100) * 100));
  }
  if (key === 'dUsers') {
    if (m.dUsers == null) return '<td><span class="mut">—</span></td>';
    var cls = Math.abs(m.dUsers) < 0.05 ? 'flat' : (m.dUsers > 0 ? 'up' : 'down');
    return '<td><span class="' + CFG.ns + '-dnum ' + cls + '">' + signed(m.dUsers, 1, '%') + '</span></td>';
  }
  if (key === 'views') return '<td>' + compact(m.views) + '</td>';
  if (key === 'vpu') return '<td>' + nf(m.vpu, 1) + '</td>';
  if (key === 'regShare') return '<td>' + (m.regShare == null ? '<span class="mut">—</span>' : pct(m.regShare, 0)) + '</td>';
  if (key === 'new_u') return '<td>' + (m.new_u ? nf(m.new_u) : '<span class="mut">0</span>') + '</td>';
  // режим «по ЦА»
  var z = function (v) { return v ? nf(v) : '<span class="mut">0</span>'; };
  if (key === 'ca') return '<td class="lead">' + nf(m.ca) + '</td>';
  if (key === 'cov') return wide() ? '<td><span class="mut">—</span></td>' : shareCell(m.cov, m.cov);
  if (key === 'reach') return '<td>' + z(m.reach) + '</td>';
  if (key === 'dReach') {
    if (m.dReach == null) return '<td><span class="mut">—</span></td>';
    var cr = Math.abs(m.dReach) < 0.05 ? 'flat' : (m.dReach > 0 ? 'up' : 'down');
    return '<td><span class="' + CFG.ns + '-dnum ' + cr + '">' + signed(m.dReach, 1, '%') + '</span></td>';
  }
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
// Люди внутри раскрытой группы — вложенная компактная таблица (свои колонки,
// не ломают выравнивание итогов групп). Первые subShow, по «ещё» — до subMax.
function nestPeopleHtml(nd, people, span) {
  var sorted = sortPeople(people);
  var lim = state.gMore[nd.id] ? CFG.subMax : CFG.subShow;
  // Сетка вложенной таблицы фиксирована (table-layout:fixed + colgroup) и одна на все группы:
  // колонки людей стоят на одной вертикали независимо от длины имён; глубина — отступом имени.
  var h = '<tr class="nest"><td colspan="' + span + '">' +
    '<table class="' + CFG.ns + '-ptable sub"><colgroup><col style="width:44%"><col style="width:12%"><col style="width:16%"><col style="width:12%"><col style="width:16%"></colgroup>' +
    // Своя шапка у людей группы: колонки другие, чем у строк групп выше (фидбек: «непонятно, что за значения»).
    '<thead><tr class="' + CFG.ns + '-sub-h"><th class="txt" style="padding-left:' + (30 + nd.depth * 18) + 'px">Сотрудник</th>' +
    '<th' + tip({ title: actLabel(), text: 'Сколько разных ' + grainCfg().units + ' человек открывал отчёты за период.' }) + '>Активность</th>' +
    '<th' + tip({ title: 'Просмотров', text: 'Сколько раз открывал отчёты за период.' }) + '>Просмотров</th>' +
    '<th' + tip({ title: 'Последний визит', text: 'Сколько дней назад был последний заход.' }) + '>Последний визит</th>' +
    '<th class="txt"' + tip({ title: 'Сегмент', text: 'Постоянный / эпизодический / разовый — по числу активных периодов.' }) + '>Сегмент</th></tr></thead><tbody>';
  for (var i = 0; i < sorted.length && i < lim; i++) {
    var p = sorted[i], on = state.picks.login.indexOf(p.login) >= 0;
    h += '<tr class="pk' + (on ? ' sel' : '') + '" data-who="' + esc(p.login) + '" data-whocut="login" tabindex="0" role="button" aria-pressed="' + on + '"' +
      '>' +
      '<td class="txt pn" style="padding-left:' + (30 + nd.depth * 18) + 'px">' + esc(p.fio || p.login) + (p.is_head ? ' <i class="' + CFG.ns + '-rflag head">рук.</i>' : '') + (p.fired ? ' <i class="' + CFG.ns + '-rflag fired" title="Нет среди действующих сотрудников (штатные и ГПХ с AD-логином): увольнение или служебная учётка">увол.</i>' : '') +
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
  var cols = gColsNow(), local = !isCa() && localActive();
  var span = cols.length + 1 + (local ? 1 : 0);
  var pix = peopleIndex(plist, cut), lc = local ? localCounts(plist, orgLevelOf(cut) ? 'org' : cut) : null;
  if (lc && orgLevelOf(cut)) lc[ORG_NONE] = (pix[ORG_NONE] || []).length;
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
  var tot = isCa() ? gMetricsCa(caTotals()) : gMetrics(effKpi() || ZERO_M), th = sortTh('data-gsort', { key: 'name', label: cut === 'org' || orgLevelOf(cut) ? 'Подразделение' : 'Группа', txt: true }, state.gSort);
  // В шапке — короткие подписи (колонки равной ширины), в выгрузке — полные.
  for (var c = 0; c < cols.length; c++) th += sortTh('data-gsort', cols[c].short ? { key: cols[c].key, label: cols[c].short, hint: cols[c].label + '. ' + cols[c].hint } : cols[c], state.gSort);
  if (local) th += '<th' + tip({ title: 'В выборке', text: 'Люди текущего списка в группе: корзина частоты, поиск и настройки. Итоги слева — по всем пользователям отчётов.' }) + '>В выборке</th>';
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
  var totRow = '<tr class="g-tot tot"><td class="txt gname" style="padding-left:6px">' + totCaret + (isCa() ? 'Итого по ЦА' : 'Итого') + '</td>';
  for (c = 0; c < cols.length; c++) totRow += cols[c].key === 'share' ? shareCell(100, null) : gCellHtml(cols[c].key, tot);
  // (строка итога строится ДО полос групп — MAX_SHARE к ней не применяется)
  if (local) totRow += '<td class="loc">' + nf(plist.length) + '</td>';
  totRow += '</tr>';
  // Ширины колонок фиксированы: имя 30%, «Доля» 15%, остальные числа — поровну;
  // длинное имя группы обрезается «…» по ширине колонки.
  var nNum = cols.length + (local ? 1 : 0), hasShare = false;
  for (c = 0; c < cols.length; c++) if (cols[c].key === 'share' || cols[c].key === 'cov') hasShare = true;
  var restW = (70 - (hasShare ? 15 : 0)) / Math.max(1, nNum - (hasShare ? 1 : 0));
  var cg = '<colgroup><col style="width:30%">';
  for (c = 0; c < cols.length; c++) cg += '<col style="width:' + (cols[c].key === 'share' || cols[c].key === 'cov' ? 15 : restW).toFixed(2) + '%">';
  if (local) cg += '<col style="width:' + restW.toFixed(2) + '%">';
  cg += '</colgroup>';
  return '<div class="' + CFG.ns + '-tbl-scroll"><table class="' + CFG.ns + '-ptable dense gt">' + cg + '<thead><tr>' + th + '</tr></thead><tbody>' + totRow +
    (out.length ? out.join('') : '<tr><td colspan="' + span + '" class="' + CFG.ns + '-empty-td">' + (isCa() ? 'В целевой аудитории нет групп по этому разрезу.' : 'Нет групп по этому разрезу.') + '</td></tr>') +
    '</tbody></table></div>';
}
var VISIBLE_NODES = [], MAX_SHARE = 100;

// --- Выгрузка: из МОДЕЛИ, все найденные строки, не страница (RETRO 28, 33) ---
function exportRows() {
  var cut = state.whoCut, head, rows = [], i, c;
  var num2 = function (v, d) { return v == null || !isFinite(v) ? '' : (d ? v.toFixed(d).replace('.', ',') : String(Math.round(v))); };
  if (cut === 'none') {
    head = ['ФИО', 'Логин', 'Руководитель', 'УС-3', 'УС-4', 'УС-5', 'УС-6', 'УС-7', 'Специализация', 'Стрим', 'Стаж',
      'HQ', 'IT', 'В ЦА', 'Доступ', actLabel(), 'Просмотров', 'Последний визит', 'Сегмент', 'Увол.'];
    var ps = sortPeople(shownList());
    for (i = 0; i < ps.length; i++) {
      var p = ps[i], op = orgParts(p.org);
      rows.push([p.fio, p.login, p.is_head ? 'да' : '', op[0] || '', op[1] || '', op[2] || '', op[3] || '', op[4] || '',
        p.spec, p.stream, p.exp, p.hq || '', p.it || '', p.ca ? 'да' : '', p.acc ? 'да' : '', String(p.days), String(p.views), isoDate(lastDate(p)),
        isCa() && p.segCa ? p.segCa : p.seg, p.fired ? 'да' : '']);
    }
    return { head: head, rows: rows };
  }
  var cols = gColsNow();
  var isOrg = cut === 'org' || orgLevelOf(cut) > 0;
  head = [isOrg ? 'Уровень' : 'Разрез', isOrg ? 'Путь' : 'Группа', 'Название'];
  var pctKey = function (k) { return k === 'share' || k === 'dUsers' || k === 'regShare' || k === 'cov' || k === 'dReach'; };
  for (c = 0; c < cols.length; c++) head.push(cols[c].label + (pctKey(cols[c].key) ? ', %' : ''));
  head.push(isCa() ? 'Постоянных из ЦА, чел.' : 'Постоянных, чел.');
  var cutLabel = '';
  for (c = 0; c < CFG.groups.length; c++) if (CFG.groups[c].key === cut) cutLabel = CFG.groups[c].label;
  function walk(nodes) {                 // все уровни, независимо от раскрытия
    var s = sortNodes(nodes);
    for (var j = 0; j < s.length; j++) {
      var nd = s[j], m = nd.m, row = [nd.sub || cutLabel, nd.noBus ? '' : nd.k, nd.name];
      for (var q = 0; q < cols.length; q++) {
        var key = cols[q].key;
        row.push(key === 'cov' && wide() ? '' : (pctKey(key) || key === 'vpu' ? num2(m[key], 1) : num2(m[key])));
      }
      row.push(num2(isCa() ? m.reg : m.regular));
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
// Буфер обмена: Clipboard API, при отказе (iframe без clipboard-write) —
// textarea + execCommand('copy') в том же пользовательском жесте.
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
// CSV для Excel: «;» и BOM (кириллица). Скачивание из песочницы Proteus может
// быть запрещено — тогда остаётся «Копировать» (вставка в Excel разложит по колонкам).
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

// Сигаретка частоты (порт freqStrip, app.js 1054–1076): числа — ПО СПИСКУ,
// клик и список всегда сходятся; контекст области живёт в тултипе.
function segStripHtml() {
  var t = caTotals(), W = wide(), never = Math.max(0, t.ca - t.reach), seen = t.reach + t.out;
  var parts = [
    { key: 'reach', label: 'ЦА заходили', n: t.reach, c: CFG.colors.seg[0], text: 'Люди ЦА, открывавшие отчёты за период.' },
    { key: 'never', label: 'ЦА не заходили', n: never, c: CFG.colors.seg[3], text: 'Люди ЦА без визитов за период' + (MODEL.namesOmitted ? ' (имена не загружены: их больше 20 000 — сузьте ЦА).' : ': и заходившие раньше, и ни разу.') },
    { key: 'out', label: 'Вне ЦА заходили', n: t.out, c: CFG.colors.seg[2], text: 'Заходили за период, но в ЦА не входят.' +
      (caModeNow() === 'cond' && MODEL.outList.length < t.out ? ' В списке — ' + nf(MODEL.outList.length) + ' самых активных.' : '') }
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
      tip({ title: pt.label, text: pt.text + ' Клик оставит в списке только их, каталог не меняется' + (on ? '; повторный клик снимет' : '') + '.',
        rows: [{ label: 'Человек', value: nf(pt.n), color: pt.c }] }) + '>' +
      '<span class="sp-bar" style="background:' + pt.c + '"></span>' +
      '<span class="sp-v">' + nf(pt.n) + '</span>' +
      '<span class="sp-l">' + esc(pt.label) + '</span>' +
      '</button>';
  }
  return h + '</div>';
}
function freqStripHtml(shown) {
  var tot = shown.length || 1;
  var n = CFG.grains[MODEL.grain] ? CFG.grains[MODEL.grain].n : 30;
  var h = '<div class="' + CFG.ns + '-segstrip freq" role="group" aria-label="Как часто заходят">';
  for (var i = 0; i < 4; i++) {
    var bk = String(i + 1);
    var cnt = 0;
    for (var j = 0; j < shown.length; j++) if (String(shown[j].bin) === bk) cnt++;
    var on = state.freqSel === bk;
    var w = Math.max(7, cnt / tot * 100);
    var areaCnt = MODEL.freqCtx[bk] || 0;
    h += '<button class="' + CFG.ns + '-seg-part' + (on ? ' on' : '') + (state.freqSel && !on ? ' off' : '') + '"' +
      ' data-freq="' + bk + '" style="flex:' + w.toFixed(2) + ' 1 0"' +
      tip({
        title: MODEL.labels[i] + ' из ' + n,
        text: 'Сколько РАЗНЫХ периодов человек заходил. Клик оставит в списке только эту корзину' +
          (on ? '; повторный клик снимет фильтр' : '') + '; каталог слева сузит сервер',
        rows: [{ label: 'В списке', value: nf(cnt), color: CFG.colors.freq[i] },
          { label: 'Доля списка', value: pct(cnt / tot * 100) },
          { label: 'Всего пользователей', value: nf(areaCnt) }]
      }) + '>' +
      '<span class="sp-bar" style="background:' + CFG.colors.freq[i] + '"></span>' +
      '<span class="sp-v">' + nf(cnt) + '<i class="sp-p">· ' + pct(cnt / tot * 100, cnt / tot < 0.1 ? 1 : 0) + '</i></span>' +
      '<span class="sp-l">' + esc(MODEL.labels[i]) + '</span>' +
      '</button>';
  }
  return h + '</div>';
}

// Дропдаун (порт U.dropdown/ui.js): триггер — data-action="toggle"
// для дым-проверки поповеров, опции — data-ddopt.
function dropdownHtml(id, curKey, opts, pre) {
  var cur = '';
  for (var i = 0; i < opts.length; i++) if (opts[i].key === curKey) cur = opts[i].trg || opts[i].label;
  var open = state.dd === id;
  var h = '<div class="' + CFG.ns + '-dd sm' + (open ? ' open' : '') + '">' +
    '<button class="' + CFG.ns + '-dd-trg" data-ddtoggle="' + esc(id) + '" data-action="toggle" aria-haspopup="true" aria-expanded="' + open + '" type="button"' +
      (pre ? tip({ title: pre.title, text: pre.text }) : '') + '>' +
      (pre ? '<span class="' + CFG.ns + '-dd-pre">' + esc(pre.label) + '</span>' : '') +
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

// Чекбоксы исключений: топ-60 пула по поиску — отдельной функцией,
// поиск в поповере пересобирает ТОЛЬКО этот список (RETRO 68).
function exPoolHtml(area) {
  var exq = (state.exQ || '').toLowerCase();
  var pool = [];
  for (var i = 0; i < area.length && pool.length < 60; i++) {
    var p = area[i];
    // «Только руководители» включено — остальные и так не в счёте: исключать есть смысл только руководителей
    // (исключённые раньше остаются в списке, чтобы их можно было вернуть).
    if (state.headsOnly && !p.is_head && state.excl.indexOf(p.login) < 0) continue;
    if (!exq || (p.fio + ' ' + p.login).toLowerCase().indexOf(exq) >= 0) pool.push(p);
  }
  if (!pool.length) return '<div class="' + CFG.ns + '-pickempty">Ничего не найдено</div>';
  var h = '';
  for (var j = 0; j < pool.length; j++) {
    h += '<label class="' + CFG.ns + '-pickrow"><input type="checkbox" data-woex="' + esc(pool[j].login) + '"' +
      (state.excl.indexOf(pool[j].login) >= 0 ? ' checked' : '') + '><span>' + esc(pool[j].fio || pool[j].login) +
      ' <i class="' + CFG.ns + '-wo-login">' + esc(pool[j].login) + '</i></span></label>';
  }
  return h;
}

// Поповер настроек списка (порт app.js 1103–1139): исключённые люди уходят в людскую
// шину (exl_f) — сужают каталог и KPI шапки; динамику панели не трогают.
// Переключателя «Только руководителей» больше нет (2026-09-30): руководителей отбирает
// условие «Руководители» в шапке (ЦА); state.headsOnly остаётся false.
function optsDropHtml(area) {
  var open = state.dd === 'whoOpts';
  var active = state.headsOnly || state.excl.length;
  var h = '<div class="' + CFG.ns + '-dd sm ' + CFG.ns + '-who-opts' + (open ? ' open' : '') + '">' +
    '<button class="' + CFG.ns + '-dd-trg" data-ddtoggle="whoOpts" data-action="toggle" aria-haspopup="true" aria-expanded="' + open + '" type="button"' +
      tip({ title: 'Фильтр людей', text: 'Кого не считать: выбранные люди выпадают из списка, каталога слева и KPI сверху. Руководителей оставляет условие «Руководители» в шапке.' }) + '>' +
      FILTER_SVG +
      '<span class="' + CFG.ns + '-dd-txt">Фильтр людей' + (active ? ' · ' + ((state.headsOnly ? 1 : 0) + (state.excl.length ? 1 : 0)) : '') + '</span>' +
      (active ? '<i class="' + CFG.ns + '-wo-dot" aria-hidden="true"></i>' : '') +
      '<span class="' + CFG.ns + '-dd-c" aria-hidden="true">▾</span>' +
    '</button>';
  if (open) {
    h += '<div class="' + CFG.ns + '-dd-body ' + CFG.ns + '-who-opts-pop">' +
      '<div class="' + CFG.ns + '-wo-h">Не считать этих людей' + (state.excl.length ? ' · ' + state.excl.length : '') + '</div>' +
      '<div class="' + CFG.ns + '-wo-note">Например, свои тестовые заходы или команду отчёта' + (state.headsOnly ? ' (в списке — только руководители)' : '') + '.</div>' +
      '<div class="' + CFG.ns + '-psearch">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
        '<input type="search" data-search="woExQ" placeholder="Логин или ФИО" value="' + esc(state.exQ) + '">' +
      '</div>' +
      '<div class="' + CFG.ns + '-pickbox ' + CFG.ns + '-wo-ex">' + exPoolHtml(area) + '</div>' +
      (state.excl.length
        ? '<div class="' + CFG.ns + '-scope-act"><button class="' + CFG.ns + '-btn ghost xs" data-woexclear type="button">Вернуть всех (' + state.excl.length + ')</button></div>'
        : '') +
      '<div class="' + CFG.ns + '-wo-foot">Действует на список, каталог слева и KPI сверху.</div>' +
      '</div>';
  }
  return h + '</div>';
}

// Тулбар + таблица + примечание. Отдельной функцией: поиск в шапке
// пересобирает ТОЛЬКО эту зону, не трогая поле ввода (RETRO 68).
// none — поимённый список с сортировкой и пагинацией; любая группировка —
// сводная таблица групп, свёрнутая до верхнего уровня (правка владельца 2026-09-23).
// Счётчик тулбара и таблица — отдельными функциями: поиск в тулбаре
// пересобирает только их, поле ввода не трогается (фокус, RETRO 68).
function whoCountHtml() {
  var cut = state.whoCut, cnt;
  if (cut !== 'none') {
    var nRoot = rootNodes(cut).length;
    cnt = orgLevelOf(cut)
      ? nf(nRoot) + ' ' + plural(nRoot, 'подразделение', 'подразделения', 'подразделений') + ' УС-' + orgLevelOf(cut)
      : nf(nRoot) + ' ' + plural(nRoot, 'группа', 'группы', 'групп') + (cut === 'org' ? ' верхнего уровня' : '');
  } else {
    var n = shownList().length;
    cnt = nf(n) + ' ' + plural(n, 'человек', 'человека', 'человек') + (!isCa() && MODEL.total > n ? ' из ' + nf(MODEL.total) : '');
  }
  return cnt + (pickCount() ? ' · <b class="who-sel"' +
    tip({ text: 'Активные условия людской шины: каталог слева сужен; клик по выбранной строке снимает условие' }) +
    '>выбрано: ' + pickCount() + '</b>' : '');
}
function whoTableHtml() {
  // Подсказки «клик по …» под таблицей нет: она есть в подзаголовке панели; низ
  // таблицы — только пагинатор, на одной линии с пагинатором каталога.
  var cut = state.whoCut, plist = shownList();
  return cut !== 'none' ? groupTableHtml(plist, cut) : peopleTableHtml(plist);
}
// Тулбар «Кто смотрит»: слева — ЧТО показать (вид, настройки, поиск),
// справа — счётчик и действия с результатом (раскрытие, копирование, CSV).
// none — поимённый список с сортировкой и пагинацией; любая группировка —
// сводная таблица групп, свёрнутая до верхнего уровня (правка владельца 2026-09-23).
// Вид «AD-группа» — только если датасет вернул группы: в pa_people они выключены
// по умолчанию (WITH_ADG = false — разворот сотен групп на человека стоил секунды).
function groupsNow() {
  var hasAdg = false;
  for (var k in (MODEL.gm.adg || {})) if (Object.prototype.hasOwnProperty.call(MODEL.gm.adg, k)) { hasAdg = true; break; }
  var lv = {};
  for (var pk in (MODEL.gm.org || {})) if (Object.prototype.hasOwnProperty.call(MODEL.gm.org, pk)) lv[orgParts(pk).length + 2] = true;
  return CFG.groups.filter(function (g) {
    if (g.key === 'adgroup') return hasAdg && !isCa();
    var L = orgLevelOf(g.key);
    return !L || !!lv[L];              // уровень УС без узлов в данных в меню не показываем
  });
}
var FILTER_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:0 0 auto"><path d="M3 5h18l-7 8v6l-4-2v-4z"/></svg>';
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
      dropdownHtml('whoCut', cut, views, { label: 'Группировка:', title: 'Группировка списка',
        text: 'Как показать зрителей: поимённо или сводной таблицей по оргструктуре, специализации, стриму. Людей не отбирает — для этого «Фильтр людей».' }) +
      '<span class="' + N + '-bar-sep" aria-hidden="true"></span>' +
      optsDropHtml(MODEL.list) +
      searchBoxHtml('whoQ', 'Имя или логин', state.q) +
    '</div>' +
    '<div class="' + N + '-bar-g r">' +
      '<span class="' + N + '-who-cnt">' + whoCountHtml() + '</span>' +
      '<span class="' + N + '-bar-sep" aria-hidden="true"></span>' +
      '<button class="' + N + '-btn ' + N + '-ibtn" data-wexp="copy" type="button" aria-label="Копировать"' + tip({ title: 'Копировать', text: grouped
        ? 'Все группы всех уровней с итогами — в буфер обмена; вставка в Excel разложит по колонкам.'
        : 'Все люди списка с учётом поиска, корзины и настроек (не только страница) — в буфер обмена; вставка в Excel разложит по колонкам.' }) + '>' + COPY_SVG + '</button>' +
            '<button class="' + N + '-btn ' + N + '-ibtn' + (state.whoFull ? ' on' : '') + '" data-wfull="1" type="button" aria-pressed="' + !!state.whoFull + '" aria-label="' + (state.whoFull ? 'Вернуть KPI' : 'Список на весь чарт') + '"' +
        tip({ title: state.whoFull ? 'Вернуть KPI и «Что видно»' : 'Список на весь чарт', text: state.whoFull ? 'Вернуть панель в обычный вид.' : 'Скрыть KPI и «Что видно в данных» — список с корзинами и настройками займёт весь правый чарт.' }) +
        '>' + (state.whoFull ? SHRINK_SVG : EXPAND_SVG) + '</button>' +
    '</div>' +
    '<span class="' + N + '-toast" role="status">' + esc(state.toast || '') + '</span>' +
    '</div>' +
    '<div class="' + N + '-who-tbl">' + whoTableHtml() + '</div>';
}

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
// Сколько условий ушло из «Кто смотрит» в каталог (как счётчик вкладок каталога):
// выбранные группы и люди + корзина частоты + «только руководители» + исключения.
function whoFilterCount() {
  return pickCount() + (state.freqSel ? 1 : 0) + (state.headsOnly ? 1 : 0) + (state.excl.length ? 1 : 0);
}
function searchBoxHtml(id, placeholder, value) {
  return '<div class="' + CFG.ns + '-psearch">' +
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
    '<input id="' + esc(id) + '" data-search="' + esc(id) + '" type="search" placeholder="' + esc(placeholder) + '" value="' + esc(value || '') + '">' +
    '</div>';
}

// ── Шапка: что за область на экране (эхо запроса датасета) ──
// Область задаёт каталог слева; панель её не выбирает, только показывает.
function areaInfo() {
  var a = MODEL.area, L = CFG.areaLabels[a.mode];
  if (!a.mode || !a.sel.length || !L) {
    return { pill: 'весь Proteus', mut: true, text: 'Выбора в каталоге нет — в панели все зрители Proteus.',
      what: 'В Proteus', first: 'Месяц первого визита в Proteus',
      size: 'Столько человек впервые зашли в Proteus в этом месяце' };
  }
  var one = a.sel.length === 1;
  var name = one ? (a.name || a.sel[0]) : '';
  if (a.mode === 'report' && one && a.sel[0] === '0') {
    return { pill: 'пустое пересечение', mut: true, text: 'Условия каталога не оставили ни одного отчёта.',
      what: 'Выбор', first: '', size: '' };
  }
  var pill = one ? L[0] + ': ' + name : L[1] + ': ' + a.sel.length;
  var repish = a.mode === 'report' || a.mode === 'owner' || a.mode === 'collection';
  return {
    pill: pill, mut: false,
    text: 'Отчёты выбраны в каталоге слева' + (one ? '' : ' (' + a.sel.length + ' значений, объединение)') +
      '. Пользователи — разные люди, открывавшие эти отчёты: человек считается один раз, а не по разу на каждую строку каталога.',
    what: one ? '«' + name + '»' : L[1] + ' (' + a.sel.length + ')',
    first: repish ? 'Месяц, в который человек впервые открыл один из этих отчётов' : 'Месяц первого визита в Proteus',
    size: repish ? 'Столько человек впервые открыли эти отчёты в этом месяце' : 'Столько людей среза впервые зашли в Proteus в этом месяце'
  };
}




// --- Закрепляемость: таблица когорт (порт pa-cohorts) -----------------------
// Ячейка берётся ПО ВОЗРАСТУ (byAge), а не по позиции в массиве: возраст, в
// котором никто не вернулся, SQL не отдаёт — позиционный доступ сдвигал все
// значения правее на столбец. Закрытый возраст без возвратов = 0%.
// Возраст незакрытого текущего месяца — серый курсив, в медиану не входит.
function cohortCells(row) {
  var now = refDay();
  var openAge = (now.getUTCFullYear() - row.month.y) * 12 + (now.getUTCMonth() - row.month.m);
  var cells = {};
  for (var a = 1; a <= Math.min(11, openAge); a++) {
    cells[a] = { age: a, active: row.byAge[a] || 0, partial: a === openAge };
  }
  return cells;
}
// Когорта в начале истории (месяц раньше, чем «начало истории + 90 дней»): среди «пришедших впервые»
// есть давно не заходившие — удержание завышено. В таблице помечена, в среднюю кривую не входит.
function cohNoHist(cm) {
  var ds = MODEL.hist.ds;
  if (!ds) return false;
  var t = new Date(Date.UTC(ds.y, ds.m, ds.d) + 90 * 86400000);
  return Date.UTC(cm.y, cm.m, 1) < t.getTime();
}
function retentionPoints(rows) {
  var byAge = {};
  for (var c = 0; c < rows.length; c++) {
    if (cohNoHist(rows[c].month)) continue;
    var cells = cohortCells(rows[c]);
    for (var a in cells) {
      if (!Object.prototype.hasOwnProperty.call(cells, a)) continue;
      var x = cells[a];
      if (x.partial) continue;
      if (!byAge[x.age]) byAge[x.age] = { age: x.age, num: 0, den: 0, cohorts: 0 };
      byAge[x.age].num += x.active;
      byAge[x.age].den += rows[c].size;
      byAge[x.age].cohorts++;
    }
  }
  var out = [];
  for (var b in byAge) {
    if (!Object.prototype.hasOwnProperty.call(byAge, b)) continue;
    var p = byAge[b];
    if (p.cohorts >= 2) out.push({ age: p.age, pct: p.den ? p.num / p.den * 100 : 0, cohorts: p.cohorts });
  }
  out.sort(function (x, y) { return x.age - y.age; });
  return out;
}
function cohortTableHtml(o) {
  var rows = o.rows || [];
  var maxAge = 11, maxSize = 1, i, a;
  var grid = [];
  for (i = 0; i < rows.length; i++) {
    if (rows[i].size > maxSize) maxSize = rows[i].size;
    grid.push(cohortCells(rows[i]));
  }
  var pctOf = function (r, c) { return r.size ? c.active / r.size * 100 : 0; };
  var base = state.ctBase === 'all' ? 'all' : 'col';
  var med = {}, closed = [];
  for (a = 1; a <= maxAge; a++) {
    var vals = [];
    for (i = 0; i < rows.length; i++) {
      var c0 = grid[i][a];
      if (c0 && !c0.partial) { vals.push(pctOf(rows[i], c0)); closed.push(pctOf(rows[i], c0)); }
    }
    med[a] = medianOf(vals);
  }
  var medAll = medianOf(closed);
  var refOf = function (ag) { return base === 'all' ? medAll : med[ag]; };
  // Края шкалы — максимальные отклонения ВВЕРХ и ВНИЗ отдельно: у каждого края есть
  // хотя бы одна ячейка, наведение на крайнюю ступень всегда что-то подсвечивает
  // (симметричная шкала по |макс| оставляла один край пустым).
  var maxUp = 0, maxDn = 0;
  for (i = 0; i < rows.length; i++) {
    for (a = 1; a <= maxAge; a++) {
      var cc = grid[i][a], rf = refOf(a);
      if (!cc || cc.partial || rf == null) continue;
      var dv = pctOf(rows[i], cc) - rf;
      if (dv > maxUp) maxUp = dv;
      if (-dv > maxDn) maxDn = -dv;
    }
  }
  var spanUp = maxUp > 0.001 ? maxUp : (maxDn > 0.001 ? maxDn : 20);
  var spanDn = maxDn > 0.001 ? maxDn : spanUp;
  var normOf = function (v, ag) {
    var ref = refOf(ag);
    if (ref == null || v == null) return null;
    var dd = v - ref;
    return Math.max(-1, Math.min(1, dd >= 0 ? dd / spanUp : dd / spanDn));
  };
  var what = base === 'all' ? 'медианы таблицы' : 'медианы своего столбца';
  var bandTip = function (bi) {
    var d = bi - BANDS, sp = d > 0 ? spanUp : spanDn;
    var lo = (d - 0.5) / BANDS * sp, hi = (d + 0.5) / BANDS * sp;
    if (d === 0) return { title: 'Около медианы', text: 'Отклонение от ' + what + ': от ' + MINUS + nf(spanDn / BANDS / 2, 1) + ' до +' + nf(spanUp / BANDS / 2, 1) + ' п.п.' };
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
    tip({ text: 'Края шкалы — максимальные отклонения в этой таблице: вниз ' + MINUS + nf(spanDn, 0) + ' п.п., вверх +' + nf(spanUp, 0) + ' п.п. Крайняя ступень всегда подсвечивает самую далёкую ячейку.' }) +
    '>края ' + MINUS + nf(spanDn, 0) + ' / +' + nf(spanUp, 0) + ' п.п.</span></div></div>';
  h += '<div class="' + CFG.ns + '-ct-wrap"><table class="' + CFG.ns + '-cttable"><colgroup>' +
    '<col style="width:64px"><col style="width:112px">';
  for (a = 0; a < maxAge; a++) h += '<col>';
  h += '</colgroup><thead><tr>' +
    '<th class="txt"' + tip({ text: o.firstTip || 'Месяц первого визита' }) + '>Когорта<span class="' + CFG.ns + '-ct-med">&nbsp;</span></th>' +
    '<th class="txt"' + tip({ text: o.sizeNote || 'Столько человек пришли впервые в этом месяце' }) + '>Пришло<span class="' + CFG.ns + '-ct-med">&nbsp;</span></th>';
  for (a = 1; a <= maxAge; a++) {
    var ref2 = refOf(a);
    var ttl = '+' + a + ' ' + plural(a, 'месяц', 'месяца', 'месяцев');
    h += '<th' + (ref2 != null
      ? tip({ title: ttl, rows: [{ label: base === 'all' ? 'Медиана таблицы' : 'Медиана столбца', value: pct(ref2) }] })
      : tip({ title: ttl, text: 'Доля когорты, активной через ' + a + ' мес. после первого визита' })) +
      // Строка медианы есть всегда (в режиме «от таблицы» — пустая): смена режима
      // не меняет высоту шапки, таблица не прыгает.
      '>+' + a + '<span class="' + CFG.ns + '-ct-med">' + ((base === 'col' && ref2 != null) ? 'м ' + pct(ref2, 0) : '&nbsp;') + '</span></th>';
  }
  h += '</tr></thead><tbody>';
  for (i = 0; i < rows.length; i++) {
    var row = rows[i], cm = row.month;
    var lbl = MONTHS[cm.m] + ' ' + String(cm.y).slice(2);
    var cnh = cohNoHist(cm);
    h += '<tr' + (cnh ? ' class="' + CFG.ns + '-ct-nh"' : '') + '><td class="txt"' + tip({ title: MONTHS_FULL[cm.m] + ' ' + cm.y, text: cnh ? histNote(false, true) + ' Удержание этой когорты завышено, в среднюю кривую она не входит.' : (o.firstTip || 'Месяц первого визита') }) + '>' + esc(lbl) + (cnh ? ' *' : '') + '</td>' +
      '<td' + tip({ title: MONTHS_FULL[cm.m] + ' ' + cm.y, rows: [{ label: 'Пришли впервые', value: nf(row.size), color: CFG.colors.act }] }) + '>' +
      '<div class="' + CFG.ns + '-ct-sz"><span class="' + CFG.ns + '-ct-bar"><i style="width:' +
      (100 * row.size / maxSize).toFixed(1) + '%"></i></span><b>' + nf(row.size) + '</b></div></td>';
    for (a = 1; a <= maxAge; a++) {
      var cell = grid[i][a];
      if (!cell) { h += '<td class="' + CFG.ns + '-ct-cell none"></td>'; continue; }
      var p2 = pctOf(row, cell), ref3 = refOf(a);
      var tipObj = {
        title: lbl + ' → +' + a + ' мес',
        rows: [{ label: 'Вернулись', value: nf(cell.active) + ' из ' + nf(row.size), color: CFG.colors.act },
          { label: 'Удержание', value: pct(p2) }],
        note: []
      };
      if (cell.partial) {
        tipObj.note.push('Месяц не закрыт — значение дорастёт, в раскраске не участвует');
      } else if (ref3 != null) {
        tipObj.rows.push({ label: base === 'all' ? 'Медиана таблицы' : 'Медиана столбца', value: pct(ref3, 0), dash: true, color: CFG.colors.bench });
        tipObj.rows.push({ label: 'Отклонение', value: signed(p2 - ref3, 0, ' п.п.') });
      }
      var nd = cell.partial ? null : normOf(p2, a);
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

// Кривая удержания (порт pa-cohorts): средняя по когортам — числители и
// знаменатели складываются, проценты не усредняются.
function retCurveSvg(points, opts) {
  var o = opts || {}, C = CFG.colors;
  if (!points.length) return '<div class="' + CFG.ns + '-tbl-note">Закрытых когорт для кривой мало.</div>';
  var n = points.length;
  // Поля по бокам — под подписи крайних точек («30%», «+1 мес» не режутся краем);
  // высота — остаток вкладки (COH_H); шкала от нуля до максимума с воздухом (не до 100%:
  // кривая 20–30% иначе прижималась к верху тонкой полоской).
  var padL = 28, padR = 28, top = 34, bottom = 30, H = COH_H || 280;
  var step = (SVG_W - padL - padR) / Math.max(1, n - 1);
  var mx = 0;
  for (var q = 0; q < n; q++) if (points[q].pct > mx) mx = points[q].pct;
  var yMax = Math.min(100, Math.max(10, Math.ceil(mx * 1.25 / 10) * 10));
  var yOf = function (v) { return top + (1 - v / yMax) * (H - top - bottom); };
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
  for (var gy = 0; gy <= yMax; gy += yMax / 4) {
    var yy = r1(yOf(gy));
    body += '<line x1="' + padL + '" y1="' + yy + '" x2="' + (SVG_W - padR) + '" y2="' + yy + '" stroke="' + C.split + '" stroke-dasharray="3 3"/>';
  }
  var cid = revealClip(H);
  body += cid.defs + '<path clip-path="url(#' + cid.id + ')" d="' + s + 'L' + r1(pts[n - 1][0]) + ' ' + r1(yOf(0)) + 'L' + r1(pts[0][0]) + ' ' + r1(yOf(0)) + 'Z" fill="rgba(36,95,212,.08)"/>';
  body += '<path class="ln" pathLength="1" stroke-dasharray="1" d="' + s + '" fill="none" stroke="' + C.act + '" stroke-width="2"/>';
  for (i = 0; i < n; i++) {
    body += '<circle class="fade" data-d="' + Math.round(150 + 600 * i / Math.max(1, n - 1)) + '\" cx="' + r1(pts[i][0]) + '" cy="' + r1(pts[i][1]) + '" r="3.5" fill="' + C.act + '" stroke="#fff" stroke-width="2"' +
      tip({
        title: 'Через ' + points[i].age + ' ' + plural(points[i].age, 'месяц', 'месяца', 'месяцев'),
        rows: [{ label: 'Возвращаются', value: pct(points[i].pct), color: C.act },
          { label: 'Когорт в расчёте', value: nf(points[i].cohorts), dash: true, color: C.bench }],
        note: 'Доля когорты, активной через N месяцев после первого визита'
      }) + '/>';
    if (i % ls === 0 || i === n - 1) {
      body += '<text class="fade" x="' + r1(pts[i][0]) + '" y="' + r1(pts[i][1] - 10) + '" font-size="' + CFG.fonts.val + '" text-anchor="middle" fill="' + C.label +
        '" style="paint-order:stroke;stroke:#fff;stroke-width:3px">' + esc(pct(points[i].pct, 0)) + '</text>';
      body += '<text x="' + r1(pts[i][0]) + '" y="' + (H - 12) + '" font-size="11" text-anchor="middle" fill="' + C.axis + '">+' + points[i].age + ' мес</text>';
    }
  }
  return '<svg viewBox="0 0 ' + SVG_W + ' ' + H + '" width="100%" data-dyn-svg="1" data-coh-curve="1" style="height:auto;display:block" font-family="' + CFG.fonts.family +
    '" role="img" aria-label="Кривая удержания">' + body + '</svg>';
}

function cohortZoneHtml(ai) {
  if (!MODEL.coh.length) {
    return '<div class="' + CFG.ns + '-tbl-note">Когорт за последние 12 месяцев нет.</div>';
  }
  var h = '<div class="' + CFG.ns + '-dynhead"><span class="' + CFG.ns + '-cap">Когорты первого визита</span>' +
    '<div class="' + CFG.ns + '-sub-tabs tiny" role="tablist" style="margin-left:auto">' +
    tabsHtml('cohView', [
      { key: 'table', label: 'Таблица', on: state.cohView !== 'curve' },
      { key: 'curve', label: 'Кривая', on: state.cohView === 'curve' }
    ]) + '</div></div>';
  if (state.cohView === 'curve') return h + retCurveSvg(retentionPoints(MODEL.coh), { title: 'Средняя кривая удержания' });
  return h + cohortTableHtml({
    rows: MODEL.coh, firstTip: ai.first, sizeNote: ai.size,
    note: 'В ячейке — доля когорты, вернувшаяся через N месяцев. Наведите ступень шкалы, чтобы на таблице остались только её ячейки. ' +
      'Серый курсив — месяц ещё не закрыт: значение дорастёт и в раскраске не участвует. Период полоски на когорты не действует.'
  });
}

// Строка «Выбранные фильтры» над карточкой — ОБЩИЙ хелпер (одинаков в каталоге
// и панели). own — своё выбранное (снимается × здесь же), ext — пришло из соседнего
// чарта (снимается там). Высота строки постоянна: вёрстка от клика не двигается.
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
// Пилюли панели: СВОЁ — людская шина, заданная кликами здесь (× снимает здесь же);
// ЧУЖОЕ — область каталога слева (снимается в каталоге).
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
  // словарь логин → ФИО — только когда он нужен (выбраны люди или исключения): на всём Proteus это 40+ тыс. людей
  if (pk.login.length || state.excl.length) for (i = 0; i < MODEL.list.length; i++) fioOf[MODEL.list[i].login] = MODEL.list[i].fio || MODEL.list[i].login;
  add('org', function (x) { return 'УС-' + (orgParts(x).length + 2); }, 'Подразделения', pk.org, orgShort, function (x) { return x; });
  add('spec', 'Специализация', 'Специализации', pk.spec);
  add('stream', 'Стрим', 'Стримы', pk.stream);
  add('adgroup', 'AD-группа', 'AD-группы', pk.adgroup);
  add('heads', '', 'Тим-лиды', pk.heads);
  add('login', 'Человек', 'Люди', pk.login, function (x) { return fioOf[x] || x; });
  if (state.freqSel) own.push({ id: 'freq|', k: 'Частота', v: MODEL.labels[parseInt(state.freqSel, 10) - 1] || state.freqSel });
  if (state.headsOnly) own.push({ id: 'headsOnly|', k: '', v: 'Только руководители' });
  if (state.excl.length) own.push({ id: 'excl|', k: 'Исключено', v: String(state.excl.length), full: state.excl.map(function (x) { return fioOf[x] || x; }).slice(0, 8).join(', ') });
  // Только то, что снимается здесь же (×): выбор каталога виден в заголовке панели.
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

// KPI «Новых» с учётом начала истории: весь период надёжен — как было; частично — новые только
// с первого надёжного периода (подпись «с …», без сравнения); ни одного — прочерк.
function newKpi(k, G, dl, dPct) {
  var kt = MODEL.hist.kt, n = G.n, ds = MODEL.hist.ds ? fmtDate(MODEL.hist.ds) : '';
  var hint = { title: 'Новые', text: 'Впервые открыли отчёты в этом периоде: раньше не открывали ни разу.' };
  if (kt >= n - 1) {
    return kpiCard({ label: 'Новых', value: nf(k.new_u), hint: hint,
      delta: kt >= 2 * n - 1 ? dl(dPct(k.new_u, k.new_prev), { vs: G.vs, unit: '%' }) : delta(null, { why: 'Предыдущий период — в начале истории данных' + (ds ? ' (с ' + ds + ')' : '') + ': новых там не отличить.' }),
      sub: 'доля аудитории: <b>' + pct(k.users ? k.new_u / k.users * 100 : 0) + '</b>' });
  }
  hint = { title: 'Новые', text: 'История событий начинается ' + (ds ? 'с ' + ds : 'недавно') + ': в первые 90 дней «впервые в данных» — это и давно не заходившие. ' +
    (kt >= 0 ? 'Поэтому новые считаются только за часть периода — с ' + bucketTitle(tsDate(kt, MODEL.grain), MODEL.grain) + '.' : 'Для этого периода новых не отличить — возьмите период короче.') };
  if (kt < 0) {
    return kpiCard({ label: 'Новых', value: '—', hint: hint, delta: delta(null, { why: hint.text }), sub: 'история данных с <b>' + esc(ds) + '</b>' });
  }
  var t0 = tsDate(kt, MODEL.grain);
  return kpiCard({ label: 'Новых', value: nf(k.new_u), hint: hint, delta: delta(null, { why: hint.text }),
    sub: 'с <b>' + esc(MODEL.grain === 'q' ? 'Q' + (Math.floor(t0.m / 3) + 1) + ' ' + t0.y : MONTHS[t0.m] + ' ' + t0.y) + '</b>, раньше — мало истории' });
}

// Пять карточек области (pa_people, секция total). Меняются от клика в
// каталоге слева и от периода/опций шапки. Предыдущий период сравнивается
// только там, где он целиком помещается в 13 месяцев истории (30 дней, 20 недель).
function kpisHtml() {
  var k = effKpi(), G = CFG.grains[MODEL.grain] || CFG.grains.d;
  if (!k) return '';
  var dPct = function (a, b) { return b ? (a / b - 1) * 100 : null; };
  // KPI по отобранным людям (корзина частоты / настройки списка): прошлого периода
  // для такой выборки нет — дельты «не сравнивается», в подписи — сколько во всей области.
  var loc = !!k.local, whyLoc = 'Включены настройки списка (руководители / исключения): KPI — по отобранным людям, сравнения с прошлым периодом для них нет.';
  var why = loc ? whyLoc : 'В витрине нет полной истории предыдущего периода (' + G.label + ').';
  var dl = function (v, o) { return G.prev && !loc ? delta(v, o) : delta(null, { why: why }); };
  var all = MODEL.kpi || k;
  var shReg = k.users ? k.regular / k.users * 100 : 0;
  var shRegPrev = k.users_prev ? k.regular_prev / k.users_prev * 100 : 0;
  var mM = closedMonth(1), mP = closedMonth(2);
  return '<div class="' + CFG.ns + '-kpis">' +
    kpiCard({ label: 'Пользователей', value: nf(k.users),
      hint: { title: 'Пользователи ' + G.label, text: 'Сколько разных людей открыли отчёты за период (при выборе в каталоге — выбранные отчёты). Пользователь — тот, кто хотя бы раз открыл отчёт; человек считается один раз, даже если открыл несколько отчётов.' },
      delta: dl(dPct(k.users, k.users_prev), { vs: G.vs, unit: '%' }),
      sub: loc ? 'из <b>' + nf(all.users) + '</b> всего' : (G.prev ? 'предыдущий: <b>' + nf(k.users_prev) + '</b>' : 'ушли из прошлого периода: <b>' + nf(k.sleeping) + '</b>') }) +
    kpiCard({ label: 'Просмотров', value: compact(k.views),
      hint: { title: 'Просмотры', text: 'Сколько раз за период открывали отчёты: каждое открытие отчёта — один просмотр.' },
      delta: dl(dPct(k.views, k.views_prev), { vs: G.vs, unit: '%' }),
      sub: 'на пользователя: <b>' + nf(k.users ? k.views / k.users : 0, 1) + '</b>' }) +
    newKpi(k, G, dl, dPct) +
    kpiCard({ label: 'Постоянных', value: pct(shReg),
      hint: { title: 'Постоянные', text: 'Заходили ' + G.reg + ' и более разных ' + G.units + ' за период — та же мера, что столбец «Пост.» каталога.' },
      delta: dl(shReg - shRegPrev, { vs: G.vs, unit: ' п.п.', dead: 0.3 }),
      sub: '<b>' + nf(k.regular) + '</b> ' + plural(k.regular, 'человек', 'человека', 'человек') }) +
    kpiCard({ label: 'MAU · ' + mM, value: nf(k.mau),
      hint: { title: 'Месячная аудитория', text: 'Сколько разных людей открывали отчёты в последнем закрытом календарном месяце. От периода в шапке не зависит.',
        rows: [{ label: mM, value: nf(k.mau), color: CFG.colors.ret }, { label: mP, value: nf(k.mau_prev), color: CFG.colors.bench }] },
      delta: loc ? delta(null, { why: whyLoc }) : delta(dPct(k.mau, k.mau_prev), { vs: 'к ' + mP.split(' ')[0], unit: '%' }),
      sub: loc ? 'среди отобранных людей' : mP + ': <b>' + nf(k.mau_prev) + '</b>' }) +
    caKpi(G, dl) +
    '</div>';
}
// «Охват ЦА»: доля целевой аудитории, заходившая за период. Доступ почти у всех — процент скрыт (знаменатель
// ничего не значит), видно только размер ЦА. Дельта — в п.п. к прошлому периоду (размер ЦА тот же).
function caKpi(G, dl) {
  var t = caTotals(), W = wide(), cond = caModeNow() === 'cond';
  var cov = t.ca ? t.reach / t.ca * 100 : null, covP = t.ca ? t.reachPrev / t.ca * 100 : null;
  var base = cond ? 'по условиям: ' + (caCondText() || 'заданы') : 'по правам доступа';
  var rows = [{ label: 'В целевой аудитории', value: nf(t.ca) }, { label: 'Дошли за период', value: nf(t.reach) },
    { label: 'Не заходили', value: nf(Math.max(0, t.ca - t.reach)) }, { label: 'Заходили вне ЦА', value: nf(t.out) }];
  if (cond) rows.splice(1, 0, { label: accGap(t) ? 'С доступом (в данных неполно)' : 'Из них с доступом', value: nf(t.acc) });
  return kpiCard({ label: 'Охват ЦА', value: W || cov == null ? '—' : pct(cov),
    hint: { title: 'Охват целевой аудитории', text: 'Доля ЦА, открывавшая отчёты за период. ЦА ' + base +
      '. Меняется в строке «Целевая аудитория» над листом. База — действующие сотрудники с AD-логином.' +
      (W ? ' Сейчас доступ открыт почти всей компании — процент не показываем: сузьте ЦА условиями.' : ''), rows: rows },
    delta: W ? '<span class="' + CFG.ns + '-nocmp">доступ почти у всех</span>' : dl(cov - covP, { vs: G.vs, unit: ' п.п.', dead: 0.3 }),
    sub: '<b>' + nf(t.reach) + '</b> из ' + nf(t.ca) + (cond ? ' · по условиям' : '') });
}

// Карусель наблюдений фиксированной высоты: один факт, листание ‹ ›,
// текст целиком — в подсказке. Высота не меняется — вкладки не прыгают.
// Откуда факты: правила в коде чарта по числам карточек выше, без ИИ (вопрос пользователей 2026-10-02).
var OBS_TIP = tip({ title: 'Как собраны эти факты', text: 'Без ИИ: правила в коде отчёта. Каждый факт посчитан из тех же чисел, что на карточках выше (текущий период против прошлого, доли постоянных и новых); в список попадает, только если изменение больше порога — порог указан в подсказке факта.' });
function obsHtml(what) {
  var list = obsList(MODEL.kpi, CFG.grains[MODEL.grain] || CFG.grains.d, what);
  var N = CFG.ns;
  if (!list.length) {
    return '<div class="' + N + '-obs"><div class="' + N + '-obs-h"><span class="' + N + '-obs-ico" aria-hidden="true">✓</span>' +
      '<span class="' + N + '-obs-t"' + OBS_TIP + '>Что видно в данных</span>' +
      '<span class="' + N + '-obs-lead">Отклонений выше порогов нет: показатели в пределах обычного разброса.</span></div></div>';
  }
  var o = list[0], open = !!state.obsOpen && list.length > 1;
  var h = '<div class="' + N + '-obs sev-' + o.sev + '"><div class="' + N + '-obs-h">' +
    '<span class="' + N + '-obs-ico" aria-hidden="true">!</span>' +
    '<span class="' + N + '-obs-t"' + OBS_TIP + '>Что видно в данных</span>' +
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

function buildHTML() {
  if (!MODEL.rows.length && !MODEL.ts.length && !MODEL.coh.length) {
    return buildCSS() + '<div class="' + CFG.ns + '-root"><div class="' + CFG.ns + '-empty"><b>' + esc(CFG.text.noData) + '</b>' +
      'Эти отчёты за период никто не открывал — снимите часть условий в каталоге или в шапке.</div></div>';
  }
  // v7.2: сверху — KPI области и «Что видно в данных» (меняются от клика в
  // каталоге), под ними карточка вкладок: заголовок с областью · поиск
  // (для «Кто смотрит») · вкладки справа. Период, опции и пилюли — в шапке листа.
  var N = CFG.ns, ai = areaInfo();
  var view = state.view === 'who' || state.view === 'coh' || state.view === 'cal' || state.view === 'path' ? state.view : 'dyn';
  var body, bodyCls, title;
  if (view === 'who') {
    // Разбивка полосы и таблицы: по частоте (корзины, как было) или по ЦА (дошли / не заходили / вне ЦА).
    body = '<div class="' + N + '-who-mode"><span class="' + N + '-who-mode-l">Разбивка:</span><div class="' + N + '-sub-tabs tiny" role="tablist">' +
      tabsHtml('whoMode', [{ key: 'freq', label: 'По частоте', on: !isCa() }, { key: 'ca', label: 'По целевой аудитории', on: isCa() }]) + '</div></div>' +
      (isCa() ? segStripHtml() : freqStripHtml(busList())) + '<div class="' + N + '-list-zone">' + listZoneHtml() + '</div>';
    bodyCls = 'tbl-wrap'; title = 'Кто смотрит';
  } else if (view === 'dyn') {
    body = dynamicsHtml(MODEL.ts, MODEL.grain, {});
    bodyCls = 'dyn-wrap'; title = 'Динамика';
  } else if (view === 'cal') {
    body = calendarHtml();
    bodyCls = 'cal-wrap'; title = 'Календарь посещений';
  } else if (view === 'path') {
    body = pathHtml();
    bodyCls = 'path-wrap'; title = 'Путь ЦА';
  } else {
    body = cohortZoneHtml(ai);
    bodyCls = 'coh-wrap'; title = 'Закрепляемость';
  }
  var tabs = [];
  for (var t = 0; t < CFG.views.length; t++) tabs.push({ key: CFG.views[t].key, label: CFG.views[t].label, on: view === CFG.views[t].key, cnt: CFG.views[t].key === 'who' ? whoFilterCount() : 0 });
  var h = [];
  h.push('<div class="' + N + '-root">');
  h.push(areaFilterRowHtml(ai));
  // «Кто смотрит» на весь чарт: KPI и «Что видно» скрыты, список с корзинами занимает всё.
  if (MODEL.kpi && !(view === 'who' && state.whoFull)) h.push('<div class="' + N + '-top">' + kpisHtml() + obsHtml(ai.mut ? 'Proteus' : ai.what) + '</div>');
  h.push('<div class="' + N + '-panel">');
  h.push('<div class="' + N + '-panel-h">' +
    '<div class="' + N + '-h-txt"><span class="' + N + '-h-ttl" title="' + esc(title + ' · ' + (ai.mut ? 'весь Proteus' : ai.pill) + (caModeNow() === 'cond' ? ' · ЦА: ' + caCondText() : '')) + '">' + esc(title) + ' · <span class="' + N + '-h-area"' + tip({ title: 'Область', text: ai.text }) + '>' +
      esc(ai.mut ? 'весь Proteus' : ai.pill) + '</span>' +
      (caModeNow() === 'cond' ? ' · <span class="' + N + '-h-area"' + tip({ title: 'Целевая аудитория по условиям', text: caCondParts(MODEL.audApplied || caEmpty()).length
        ? 'Все числа панели — только по людям ЦА: ' + caCondText() + '. Группа выбрана в каталоге (вкладка «Аудитория») — там и снимается; условия строки «Целевая аудитория» — в шапке.'
        : 'Все числа панели и каталога — только по людям ЦА: ' + caCondText() + '. Изменить или сбросить — в строке «Целевая аудитория».' }) + '>ЦА: ' + esc(caCondText()) + '</span>' : '') +
      '</span>' +
      '<span class="sub">' + (view === 'who'
        ? 'клик по группе или человеку сузит каталог слева · Shift — несколько'
        : (view === 'dyn' ? 'клик по строке каталога выбирает отчёты'
          : (view === 'cal' ? 'последние 60 дней по дням — при любом периоде в шапке'
            : (view === 'path' ? 'кого считаем аудиторией и как она доходит до отчётов' : 'когорты первого визита; период на них не действует')))) + '</span></div>' +
    '<div class="' + N + '-sub-tabs" role="tablist">' + tabsHtml('view', tabs) + '</div>' +
    '</div>');
  h.push('<div class="' + N + '-panel-b ' + bodyCls + '">' + body + '</div>');
  h.push('</div>');
  h.push('</div>');
  return buildCSS() + h.join('');
}

// --- ТАБ «ПУТЬ ЦА» (из панели второго листа): кого считаем ЦА и воронка до регулярного использования ---
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
    text = 'Все сотрудники с AD-логином, где ' + caCondText(c) + '. ' + (accGap(t)
      ? 'Права в данных неполные: с доступом поимённо или через AD-группу — <b>' + ppl(t.acc) + '</b>, а открывали отчёты <b>' +
        ppl(t.reach) + '</b> (доступ выдан и иначе — например, ролью Proteus), поэтому ступени «Есть доступ» в воронке нет. '
      : 'Доступ к отчётам есть у <b>' + ppl(t.acc) + '</b> — ступень «Есть доступ». ') +
      'Эта же ЦА — фильтр каталога слева.'
  } else if (W) {
    title = 'Доступ роздан почти всей компании';
    chip = '<span class="' + N + '-sig-chip warn">охват не считаем</span>';
    text = 'Права выданы через ' + (gTxt || 'широкую группу') + ' — это <b>' + ppl(t.ca) + '</b>, ' + pct(t.ca / (MODEL.staff || 1) * 100, 0) +
      ' сотрудников: такой знаменатель не описывает, для кого делали отчёт. Настройте ЦА условиями — и доли вернутся.';
  } else if (!gs.length && MODEL.acl.users) {
    title = 'Поимённый список доступа';
    chip = '<span class="' + N + '-sig-chip note">' + ppl(t.ca) + '</span>';
    text = 'Права выданы поимённо (' + nf(MODEL.acl.users) + '). Самый точный вид ЦА: охват и «не заходили» считаются без допущений.';
  } else if (!gs.length) {
    title = 'Прав на эти отчёты в данных нет';
    chip = '<span class="' + N + '-sig-chip warn">ЦА пуста</span>';
    text = 'Настройте ЦА условиями — она соберётся по структуре.';
  } else {
    title = 'Доступ через AD-группы';
    chip = '<span class="' + N + '-sig-chip note">' + ppl(t.ca) + '</span>';
    text = 'Права выданы ' + plural(gs.length, 'группе', 'группам', 'группам') + ' ' + gTxt +
      (MODEL.acl.users ? ' плюс ' + nf(MODEL.acl.users) + ' поимённо' : '') + '. Считаем их целевой аудиторией, пока не настроены условия.';
  }
  // Компактно (правка владельца: с ЦА по условиям не влезала воронка): слева — что за ЦА и сколько,
  // справа — пояснение и где её менять, одним абзацем.
  return '<div class="' + N + '-scopebar' + (W ? ' wide' : '') + '">' +
    '<div class="' + N + '-sb-col">' +
      '<div class="' + N + '-cap2">Целевая аудитория</div>' +
      '<div class="' + N + '-as-t">' + esc(title) + chip + '</div>' +
    '</div>' +
    '<div class="' + N + '-sb-col ' + N + '-sb-set">' +
      '<div class="' + N + '-as-x">' + text + ' <span class="' + N + '-as-h">' + (cond
        ? 'Изменить или сбросить — в строке «Целевая аудитория» над листом.'
        : 'Собрать ЦА по структуре — в строке «Целевая аудитория» над листом.') + '</span></div>' +
    '</div></div>';
}
// Воронка (порт U.funnelSvg макета): центрированные бары сверху вниз, ширина ровно
// пропорциональна значению (масштаб — по самому большому этапу), название НАД баром,
// число слева, конверсия с предыдущего этапа справа, между барами — диагонали.
// Высота ступени фиксирована: растянутая на всю панель воронка читается как фон.
var FN_ROW = 74, FN_MIN_H = 300, FN_MAX_BAR = 460;
// Права в данных неполные: людей ЦА, открывших отчёты, больше, чем людей ЦА с правом (поимённо / AD-группа) —
// значит, доступ выдан и иначе (роль Proteus и т. п.), ступень «Есть доступ» занижена (скрин владельца 2026-10-07).
function accGap(t) { return t.reach > t.acc; }
function funnelSteps() {
  var t = caTotals(), G = CFG.grains[MODEL.grain] || CFG.grains.d, cond = caModeNow() === 'cond';
  var st = [{ name: 'Целевая аудитория', value: t.ca, note: cond ? 'По условиям' : 'Как роздан доступ' }];
  // права в данных — только поимённые и через AD-группы; открывших больше, чем «с доступом», — ступень врёт, не рисуем
  if (cond && !accGap(t)) st.push({ name: 'Есть доступ к отчётам', value: t.acc, note: 'Права выданы AD-группой или поимённо' });
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
    (caModeNow() === 'cond' && !accGap(caTotals()) ? 'Ступень <b>«Есть доступ»</b> отделяет «не раздали права» от «раздали, но не ходят». ' : '') +
    'Ни разу за период: <b>' + nf(Math.max(0, t.ca - t.reach)) + '</b> · разовые: <b>' + nf(t.once) + '</b> · заходили вне ЦА: <b>' + nf(t.out) + '</b>. ' +
    '<b>Когда</b> этапы набирались — на вкладке «Динамика».</div>';
}
function pathHtml() {
  return caCardHtml() + '<div class="' + CFG.ns + '-fn-box">' + funnelHtml() + '</div>';
}

// --- ТАБ «КАЛЕНДАРЬ ПОСЕЩЕНИЙ» ------------------------------------------------
// Строки cal: день k (дней назад от даты свежести) → люди, новые, просмотры. 60 дней при любом
// периоде (маска дней пар pa_pair.msk_d); просмотры — только за 30 дней (pa_dash_bkt).
// Месяцы — отдельными мини-календарями «Пн…Вс × недели», у каждого свой заголовок: не слипаются.
var CAL_N = 60, CAL_V = 30;
var CAL_C = ['#f1f3f6', '#E4ECFB', '#C4D5F6', '#8AAAEC', '#4A7BE0', '#245FD4'];
var WD_S = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
var WD_N = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
var WD_O = ['обычного понедельника', 'обычного вторника', 'обычной среды', 'обычного четверга', 'обычной пятницы', 'обычной субботы', 'обычного воскресенья'];
function calDays() {
  var md = refDay().getTime(), out = [], hk = MODEL.hist ? MODEL.hist : null;
  // «новых» за день выделяем, только если до него ≥ 90 дней истории (как в динамике)
  var hd = hk && hk.ds ? Date.UTC(hk.ds.y, hk.ds.m, hk.ds.d) + 90 * 86400000 : null;
  for (var k = CAL_N - 1; k >= 0; k--) {
    var t = md - k * 86400000, d = new Date(t), c = MODEL.cal[k] || { users: 0, new_u: 0, views: 0 };
    out.push({ k: k, t: t, y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), w: (d.getUTCDay() + 6) % 7,
      users: c.users, new_u: c.new_u, views: k < CAL_V ? c.views : null, newOk: hd == null || t >= hd });
  }
  return out;
}
function calVal(x) { return state.calM === 'v' ? x.views : x.users; }
function calLvl(v, mx) {
  if (v == null) return -1;
  if (!v || !mx) return 0;
  var r = v / mx;
  return r < 0.12 ? 1 : r < 0.35 ? 2 : r < 0.6 ? 3 : r < 0.85 ? 4 : 5;
}
function calendarHtml() {
  var N = CFG.ns, days = calDays(), isV = state.calM === 'v', i, mx = 0;
  if (!MODEL.kpi) return '<div class="' + N + '-empty"><b>' + esc(CFG.text.noData) + '</b></div>';
  for (i = 0; i < days.length; i++) { var v0 = calVal(days[i]); if (v0 != null && v0 > mx) mx = v0; }
  var byKey = {};
  for (i = 0; i < days.length; i++) byKey[days[i].y + '-' + days[i].m + '-' + days[i].d] = days[i];
  // Месяцы окна: от месяца первого дня до месяца даты свежести
  var f = days[0], l = days[days.length - 1], months = [];
  for (var y = f.y, mm = f.m; y < l.y || (y === l.y && mm <= l.m); mm++) { if (mm > 11) { mm = 0; y++; } months.push({ y: y, m: mm }); if (y === l.y && mm === l.m) break; }
  var mh = '';
  for (var q = 0; q < months.length; q++) {
    var M = months[q], first = new Date(Date.UTC(M.y, M.m, 1)), nd = new Date(Date.UTC(M.y, M.m + 1, 0)).getUTCDate();
    var off = (first.getUTCDay() + 6) % 7, g = '', sum = 0, cnt = 0;
    for (i = 0; i < 7; i++) g += '<span class="' + N + '-cal-wd' + (i >= 5 ? ' we' : '') + '">' + WD_S[i] + '</span>';
    for (i = 0; i < off; i++) g += '<span></span>';
    for (var dd = 1; dd <= nd; dd++) {
      var x = byKey[M.y + '-' + M.m + '-' + dd];
      if (!x) { g += '<span class="' + N + '-cal-c out">' + dd + '</span>'; continue; }
      var val = calVal(x), L = calLvl(val, mx);
      if (val != null) { sum += val; cnt++; }
      var dt = WD_S[x.w].toLowerCase() + ', ' + dd + ' ' + MONTHS[M.m] + ' ' + M.y;
      var rows = [{ label: 'Пользователей', value: nf(x.users) }];
      if (x.newOk) rows.push({ label: 'из них впервые', value: nf(x.new_u) });
      rows.push({ label: 'Просмотров', value: x.views == null ? '—' : nf(x.views) });
      g += '<span class="' + N + '-cal-c' + (L < 0 ? ' nd' : '') + (L >= 4 ? ' hi' : '') + (x.k === 0 ? ' last' : '') + '"' +
        (L >= 0 ? ' style="background:' + CAL_C[L] + '"' : '') +
        tip({ title: dt, rows: rows, note: x.views == null ? 'Просмотры по дням есть только за последние 30 дней.' : (x.newOk ? '' : 'Начало истории данных: «впервые» не отличить от давно не заходивших.') }) + '>' + dd + '</span>';
    }
    mh += '<div class="' + N + '-cal-mon"><div class="' + N + '-cal-mt">' + esc(MONTHS_FULL[M.m].charAt(0).toUpperCase() + MONTHS_FULL[M.m].slice(1)) + ' ' + M.y +
      (cnt ? ' <span>· ' + compact(Math.round(sum / cnt)) + ' в день</span>' : '') + '</div><div class="' + N + '-cal-g">' + g + '</div></div>';
  }
  // Дни недели: среднее за день — последние 30 дней и предыдущие 30 (черта)
  var cur = [0, 0, 0, 0, 0, 0, 0], cn = [0, 0, 0, 0, 0, 0, 0], pr = [0, 0, 0, 0, 0, 0, 0], pn = [0, 0, 0, 0, 0, 0, 0];
  for (i = 0; i < days.length; i++) {
    var vv = calVal(days[i]);
    if (vv == null) continue;
    if (days[i].k < 30) { cur[days[i].w] += vv; cn[days[i].w]++; } else { pr[days[i].w] += vv; pn[days[i].w]++; }
  }
  var avg = [], pav = [], am = 0, pk = 0;
  for (i = 0; i < 7; i++) {
    avg[i] = cn[i] ? cur[i] / cn[i] : 0; pav[i] = pn[i] ? pr[i] / pn[i] : null;
    am = Math.max(am, avg[i], pav[i] || 0);
    if (avg[i] > avg[pk]) pk = i;
  }
  var wh = '';
  for (i = 0; i < 7; i++) {
    var dl = pav[i] ? (avg[i] / pav[i] - 1) * 100 : null;
    wh += '<div class="' + N + '-cal-wr' + (i >= 5 ? ' we' : '') + '"' + tip({ title: WD_S[i] + ' · в среднем за день', rows: [
        { label: 'Последние 30 дней', value: nf(Math.round(avg[i])) },
        pav[i] != null ? { label: 'Предыдущие 30 дней', value: nf(Math.round(pav[i])) } : null] }) + '>' +
      '<span class="l">' + WD_S[i] + '</span><span class="' + N + '-cal-tr"><i style="width:' + (am ? avg[i] / am * 100 : 0).toFixed(1) + '%;background:' + (i === pk ? CAL_C[5] : (i >= 5 ? CAL_C[3] : CAL_C[4])) + '"></i>' +
      (pav[i] != null && am ? '<u style="left:' + (pav[i] / am * 100).toFixed(1) + '%"></u>' : '') + '</span>' +
      '<span class="v">' + compact(Math.round(avg[i])) + (dl != null && isFinite(dl) ? '<s>' + (dl >= 0 ? '+' : MINUS) + nf(Math.abs(dl), 0) + '%</s>' : '') + '</span></div>';
  }
  var wdS = cur[0] + cur[1] + cur[2] + cur[3] + cur[4], all = wdS + cur[5] + cur[6], sh = all ? wdS / all * 100 : 0;
  // Лучший день и провал (будний день, сильнее всего ниже среднего своего дня недели, порог −25 %) — за последние 30
  var best = null, dip = null, dr = 1;
  for (i = 0; i < days.length; i++) {
    var z = days[i], zv = calVal(z);
    if (z.k >= 30 || zv == null) continue;
    if (!best || zv > calVal(best)) best = z;
    if (z.w < 5 && avg[z.w]) { var rr = zv / avg[z.w]; if (rr < 0.75 && rr < dr) { dr = rr; dip = z; } }
  }
  var lowWd = 0;
  for (i = 1; i < 5; i++) if (avg[i] < avg[lowWd]) lowWd = i;
  var what = isV ? 'Просмотров' : 'Человеко-дней';
  var h = '<div class="' + N + '-cal-bar">' +
    '<div class="' + N + '-sub-tabs tiny" role="tablist">' + tabsHtml('calM', [
      { key: 'u', label: 'Пользователи', on: !isV }, { key: 'v', label: 'Просмотры', on: isV }]) + '</div>' +
    '<div class="' + N + '-cal-chips">' +
      '<span class="' + N + '-cal-chip"' + tip({ title: 'Пик недели', text: 'День недели с наибольшим средним за день в последние 30 дней.' }) + '>Пик недели<b>' + WD_S[pk] + ' · ' + compact(Math.round(avg[pk])) + '</b></span>' +
      '<span class="' + N + '-cal-chip"' + tip({ title: 'В будни', text: 'Доля ' + (isV ? 'просмотров' : 'человеко-дней (сумма людей по дням)') + ' с понедельника по пятницу, последние 30 дней.' }) + '>В будни<b>' + nf(sh, 0) + '%</b></span>' +
      (best ? '<span class="' + N + '-cal-chip">Лучший день<b>' + best.d + ' ' + MONTHS[best.m] + ' · ' + compact(calVal(best)) + '</b></span>' : '') +
    '</div></div>';
  h += '<div class="' + N + '-cal-months">' + mh + '</div>';
  h += '<div class="' + N + '-cal-lg">меньше' + CAL_C.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') + 'больше' +
    '<span class="sp"></span><i style="box-shadow:0 0 0 2px #23272e;background:' + CAL_C[4] + '"></i>последний день данных' +
    (isV ? '<span class="sp"></span><i style="border:1px dashed #dde0e6"></i>просмотров по дням нет (старше 30 дней)' : '') + '</div>';
  h += '<div class="' + N + '-cal-low"><div><div class="' + N + '-cal-h">По дням недели · в среднем за день, последние 30 дней</div>' + wh +
    '<div class="' + N + '-cal-note">Черта — тот же день недели в предыдущие 30 дней' + (isV ? ' (просмотров за них нет — только люди)' : '') + '.</div></div>' +
    '<div><div class="' + N + '-cal-h">Будни и выходные</div>' +
    '<div class="' + N + '-cal-split"><span style="width:' + sh.toFixed(1) + '%;background:' + CAL_C[4] + '"></span><span style="flex:1;background:' + CAL_C[2] + '"></span></div>' +
    '<div class="' + N + '-cal-note">' + what + ' в будни — <b>' + nf(sh, 0) + '%</b>, в выходные — ' + nf(100 - sh, 0) + '%</div>' +
    '<div class="' + N + '-cal-see" style="margin-top:12px"><b>Что видно:</b> ' +
      (all ? 'пик — ' + WD_N[pk] : '') +
      (all ? ', меньше всего из будней — ' + WD_S[lowWd].toLowerCase() + ' (на ' + nf((1 - avg[lowWd] / (avg[pk] || 1)) * 100, 0) + '% ниже пика). ' : 'данных за последние 30 дней нет. ') +
      (dip ? 'Провал ' + dip.d + ' ' + MONTHS[dip.m] + ' (' + WD_S[dip.w].toLowerCase() + ') — на ' + nf((1 - dr) * 100, 0) + '% ниже ' + WD_O[dip.w] + '. ' : '') +
      (all ? 'В выходные — ' + compact(Math.round((avg[5] + avg[6]) / 2)) + ' в день.' : '') +
    '</div></div></div>';
  return h;
}

// --- ТАБ «ДИНАМИКА»: порт SVG-чартов из тела 788805 (строки 1336–1536) -----
// Правила из шапки charts.js: ось значений от нуля, урезать нельзя; оси Y нет,
// значения подписаны у марок; столкнувшиеся подписи скрываются (шаг показа);
// зазор между панелями = STACK_GAP. Резиновость через viewBox + width:100%.
// Размеры, измеренные после монтажа, живут в state: Proteus перезапускает скрипт на каждый новый ответ, и с
// дефолтных 760 / 0 каждый ответ рисовался ДВАЖДЫ (сборка → замер → пересборка).
var SVG_W = state.svgW || 760;
// Высота динамики под ячейку чарта: меряется ПОСЛЕ монтажа (как SVG_W) и
// делится между стеком пользователей (60%) и просмотрами (40%). 0 — дефолт.
var DYN_H = state.dynH || 0;
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
var COH_H = state.cohH || 0;
function r1(v) { return Math.round(v * 10) / 10; }
function svgHeadroom(max, n) {
  return Math.max(1, Math.ceil(max * (n > CFG.spacing.dense ? CFG.spacing.headroomDense : CFG.spacing.headroom)));
}
function svgBarWidth(n) {
  var inner = Math.max(40, SVG_W - 34);
  return Math.max(CFG.spacing.barMin, Math.min(CFG.spacing.barMax, inner / n - CFG.spacing.barGap));
}
function labelStep(n) { return n > 14 ? Math.ceil(n / 12) : 1; }

// Бар со скруглением ТОЛЬКО сверху (правка владельца 2026-09-18): скругляется
// верхняя видимая ступень стека, низ остаётся прямым — стык без «капсул».
function pathTop(x, y, w, h) {
  var r = Math.min(2.5, w / 2, h / 2);
  return 'M' + r1(x) + ' ' + r1(y + h) +
    'L' + r1(x) + ' ' + r1(y + r) + 'Q' + r1(x) + ' ' + r1(y) + ' ' + r1(x + r) + ' ' + r1(y) +
    'L' + r1(x + w - r) + ' ' + r1(y) + 'Q' + r1(x + w) + ' ' + r1(y) + ' ' + r1(x + w) + ' ' + r1(y + r) +
    'L' + r1(x + w) + ' ' + r1(y + h) + 'Z';
}

// Активные пользователи периода с учётом погашенных ступеней легенды.
function stackAct(p) {
  if (p.nohist) return p.users;
  var off = state.legendOff, s = 0;
  if (!off.new) s += p.new_u;
  if (!off.react) s += p.react_u;
  if (!off.ret) s += p.ret;
  return s;
}

// Верхняя панель: стек пользователей. Заголовок и легенда — HTML над svg
// (легенда кликом гасит свою ступень), тултип — «следящий»: ОДНА хитзона
// на всю панель с данными бакетов в data-bk, позиция на mousemove,
// содержимое — только при смене колонки.
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
    var segs = p.nohist ? [{ h: (p.users / topU) * pH, c: C.nohist }] : [
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
      '" style="paint-order:stroke;stroke:#fff;stroke-width:3px">' + esc(p.nohist && !p.users ? '—' : compact(aU)) + '</text>';
    bk.push({ k: p.k, u: p.users, nu: p.new_u, re: p.react_u, rt: p.ret, v: p.views, nh: p.nohist ? 1 : 0 });
  }
  body += calAxisSvg(ts, grain, function (j) { return padL + j * step + step / 2; }, top + pH);
  body += '<rect x="' + padL + '" y="' + top + '" width="' + r1(inner) + '" height="' + r1(pH) + '" fill="transparent" data-dyn="users" data-n="' + n +
    '" data-colw="' + r1(step) + '" data-grain="' + esc(grain) + '"' +
    '" data-bk="' + esc(JSON.stringify(bk)) + '"/>';
  return '<svg viewBox="0 0 ' + SVG_W + ' ' + r1(H) + '" width="100%" data-dyn-svg="1" style="height:auto;display:block" font-family="' + CFG.fonts.family +
    '" role="img" aria-label="Пользователи по периодам">' + body + '</svg>';
}

// Нижняя панель: просмотры линией, переключалка «всего / на пользователя».
function viewsChartSvg(ts, grain) {
  var C = CFG.colors, n = ts.length;
  var perUser = state.viewsMode === 'per';
  var viewsOf = function (p) { return perUser ? (p.users ? p.views / p.users : 0) : p.views; };
  var fmtV = function (p) { return perUser ? nf(viewsOf(p), 1) : compact(p.views); };
  var maxV = 0, i;
  for (i = 0; i < n; i++) if (viewsOf(ts[i]) > maxV) maxV = viewsOf(ts[i]);
  var topV = svgHeadroom(maxV, n);
  var padL = 6, padR = 26, inner = SVG_W - padL - padR;
  var step = inner / n;
  var top = 14, axH = 32;
  var pH = DYN_H ? Math.max(80, Math.round(DYN_H * 0.4) - top - axH) : 112;
  var H = top + pH + axH;
  var dense = n > CFG.spacing.dense;
  var fsVal = dense ? CFG.fonts.dense : CFG.fonts.val;
  var y2 = function (v) { return top + pH - (v / topV) * pH; };
  var labels = '', bk = [];
  var pts = [], cps = [];
  for (i = 0; i < n; i++) {
    var cx = padL + i * step + step / 2;
    var cy = y2(viewsOf(ts[i]));
    pts.push([cx, cy]);
    bk.push({ k: ts[i].k, u: ts[i].users, v: ts[i].views });
    labels += '<text class="fade" x="' + r1(cx) + '" y="' + r1(cy - 8) + '" font-size="' + fsVal + '" text-anchor="middle" fill="' + C.label +
      '" style="paint-order:stroke;stroke:#fff;stroke-width:3px">' + esc(fmtV(ts[i])) + '</text>';
  }
  labels += calAxisSvg(ts, grain, function (j) { return padL + j * step + step / 2; }, top + pH);
  for (i = 0; i < pts.length; i++) {
    if (!i) { cps.push([pts[0][0], pts[0][1]]); continue; }
    var dx = (pts[i][0] - pts[i - 1][0]) / 2;
    cps.push([pts[i - 1][0] + dx, pts[i - 1][1], pts[i][0] - dx, pts[i][1]]);
  }
  var s = 'M' + r1(pts[0][0]) + ' ' + r1(pts[0][1]);
  for (i = 1; i < pts.length; i++) s += 'C' + r1(cps[i][0]) + ' ' + r1(cps[i][1]) + ' ' + r1(cps[i][2]) + ' ' + r1(cps[i][3]) + ' ' + r1(pts[i][0]) + ' ' + r1(pts[i][1]);
  var cid = revealClip(H);
  var body = cid.defs + '<path clip-path="url(#' + cid.id + ')" d="' + s + 'L' + r1(pts[pts.length - 1][0]) + ' ' + (top + pH) + 'L' + r1(pts[0][0]) + ' ' + (top + pH) + 'Z" fill="rgba(91,100,120,.07)" stroke="none"/>' +
    '<path class="ln" pathLength="1" stroke-dasharray="1" d="' + s + '" fill="none" stroke="' + C.views + '" stroke-width="2"/>';
  for (i = 0; i < pts.length; i++) {
    body += '<circle class="fade" data-d="' + Math.round(150 + 600 * i / Math.max(1, pts.length - 1)) + '\" cx="' + r1(pts[i][0]) + '" cy="' + r1(pts[i][1]) + '" r="2.6" fill="' + C.views + '" stroke="#fff" stroke-width="1.6"/>';
  }
  body += labels;
  body += '<rect x="' + padL + '" y="' + top + '" width="' + r1(inner) + '" height="' + r1(pH) + '" fill="transparent" data-dyn="views" data-n="' + n +
    '" data-colw="' + r1(step) + '" data-grain="' + esc(grain) + '" data-pu="' + (perUser ? 1 : 0) +
    '" data-bk="' + esc(JSON.stringify(bk)) + '"/>';
  return '<svg viewBox="0 0 ' + SVG_W + ' ' + r1(H) + '" width="100%" data-dyn-svg="1" style="height:auto;display:block" font-family="' + CFG.fonts.family +
    '" role="img" aria-label="Просмотры по периодам">' + body + '</svg>';
}

// Подпись про начало истории событий: новых от давно не заходивших там не отличить.
function histNote(all, short) {
  var ds = MODEL.hist.ds ? fmtDate(MODEL.hist.ds) : '';
  var why = 'история событий начинается ' + (ds ? 'с ' + ds : 'недавно') + ', и «впервые в данных» здесь значит и «давно не заходил»';
  if (short) return 'Новых не выделяем: ' + why + '.';
  return (all ? 'Весь период — в начале истории данных' : 'Серые столбики — начало истории данных') +
    ': новых не выделяем, ' + why + '. Нужно хотя бы 90 дней истории до начала периода.';
}

// Динамика целиком: две панели, каждая со своим HTML-заголовком.
function dynamicsHtml(ts, grain, opts) {
  var o = opts || {};
  if (!ts.length) return '<div class="' + CFG.ns + '-tbl-note">Динамики за этот период в данных нет.</div>';
  var C = CFG.colors, off = state.legendOff;
  var newLabel = o.newLabel || 'Новые';
  var leg = [
    { k: 'new', l: newLabel, c: C.new },
    { k: 'react', l: 'Вернувшиеся', c: C.react },
    { k: 'ret', l: 'Продолжающие', c: C.ret }
  ];
  var h = '<div class="' + CFG.ns + '-dynhead"><span class="' + CFG.ns + '-cap">Пользователи по периодам</span>' +
    '<div class="' + CFG.ns + '-legend" role="group" aria-label="Ступени стека">';
  // Определения — как в SQL pa_people (new_u / react_u): новый — первый заход в историю
  // (≈ год), вернувшийся — был раньше, но пропустил паузу (7 дней на днях, период на прочих),
  // продолжающий — остальные активные периода.
  var P = { d: ['в этот день', 'все 7 дней до этого', 'и хотя бы раз за 7 дней до этого'],
    w: ['на этой неделе', 'всю предыдущую неделю', 'и на предыдущей неделе'],
    m: ['в этом месяце', 'весь предыдущий месяц', 'и в предыдущем месяце'],
    q: ['в этом квартале', 'весь предыдущий квартал', 'и в предыдущем квартале'] }[grain] || ['в этом периоде', 'весь предыдущий период', 'и в предыдущем периоде'];
  var legDef = {
    'new': 'Впервые открыли отчёты ' + P[0] + ': раньше не заходили ни разу' + (MODEL.hist.ds ? ' (история событий — с ' + fmtDate(MODEL.hist.ds) + ')' : '') + '.',
    react: 'Заходили когда-то раньше, но ' + P[1] + ' не открывали — вернулись ' + P[0] + ' после паузы.',
    ret: 'Заходили ' + P[0] + ' ' + P[2] + ' — ядро, смотрят без перерыва.'
  };
  for (var i = 0; i < leg.length; i++) {
    h += '<button class="' + CFG.ns + '-leg' + (off[leg[i].k] ? ' off' : '') + '" data-leg="' + leg[i].k + '" type="button"' +
      tip({ title: leg[i].l, text: legDef[leg[i].k], note: off[leg[i].k] ? 'Клик — вернуть ступень на график' : 'Клик — убрать ступень с графика' }) + '>' +
      '<i style="background:' + leg[i].c + '"></i>' + esc(leg[i].l) + '</button>';
  }
  // Начало истории — пунктом легенды с подсказкой (абзац под графиком добавлял высоту → скролл в динамике).
  var nh = 0;
  for (i = 0; i < ts.length; i++) if (ts[i].nohist) nh++;
  if (nh) h += '<span class="' + CFG.ns + '-leg ' + CFG.ns + '-leg-nh"' + tip({ title: 'Мало истории', text: histNote(nh === ts.length) }) + '>' +
    '<i style="background:' + CFG.colors.nohist + '"></i>Мало истории</span>';
  h += '</div></div>';
  h += usersChartSvg(ts, grain);
  // Охват ЦА: «% от ЦА N» — в заголовке, пояснение линий — в подсказке (отдельная строка делала вкладку выше → прокрутка)
  var tc0 = caTotals(), gu0 = CFG.grains[grain] ? CFG.grains[grain].unit : 'периоде';
  h += '<div class="' + CFG.ns + '-dynhead"><span class="' + CFG.ns + '-cap"' + (state.viewsMode === 'cov' ? tip({ title: 'Охват целевой аудитории',
      text: '% от ЦА ' + nf(tc0.ca) + (caModeNow() === 'cond' ? ' (по условиям)' : ' (по правам)') + '. Сплошная — накоплено за период к дате, пунктир — заходили в этом ' + gu0 + '.' }) : '') + '>' +
    (state.viewsMode === 'cov' ? 'Охват ЦА · % от ' + nf(tc0.ca) : 'Просмотры') + '</span>' +
    '<div class="' + CFG.ns + '-sub-tabs tiny" role="tablist">' +
    tabsHtml('viewsMode', [
      { key: 'total', label: 'Всего', on: state.viewsMode !== 'per' && state.viewsMode !== 'cov' },
      { key: 'per', label: 'На пользователя', on: state.viewsMode === 'per' },
      { key: 'cov', label: 'Охват ЦА', on: state.viewsMode === 'cov' }
    ]) + '</div></div>';
  if (state.viewsMode !== 'cov') { h += viewsChartSvg(ts, grain); return h; }
  // Охват ЦА (третий режим нижнего графика): сплошная — накоплено к дате, пунктир — заходили в этом периоде.
  var t = tc0;
  h += !t.ca ? '<div class="' + CFG.ns + '-tbl-note">В целевой аудитории никого нет — проверьте условия в строке «Целевая аудитория».</div>'
    : (wide() ? '<div class="' + CFG.ns + '-tbl-note">Доступ открыт почти всей компании — охват по такому знаменателю не показываем. Сузьте ЦА в строке «Целевая аудитория».</div>'
      : covChartSvg(caSeries(), grain));
  return h;
}

// Охват ЦА по периодам (из панели второго листа): для бакета k — сколько людей ЦА заходили в нём (act) и сколько
// набралось к нему с начала окна (cum). Считаем по маскам зрителей периода (у них бит k = активен k периодов назад).
function caSeries() {
  var n = CFG.grains[MODEL.grain].n, ps = MODEL.list, t = caTotals(), out = [], k, i;
  for (k = n - 1; k >= 0; k--) {
    var act = 0, cum = 0, pw = Math.pow(2, k);
    for (i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (!p.ca || !p.cur) continue;
      if (bitAt(p.cur, k)) act++;
      if (p.cur >= pw) cum++;            // был активен в бакете возраста ≥ k (раньше или в эту дату)
    }
    out.push({ k: k, users: act, cum: cum, covCum: t.ca ? cum / t.ca * 100 : 0, covAct: t.ca ? act / t.ca * 100 : 0 });
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
// Содержимое следящего тултипа динамики: бакет из data-bk по индексу колонки.
function dynTipHtml(el, i) {
  var bk = el.__bk ? el.__bk[i] : null;
  if (!bk) return '';
  var C = CFG.colors, off = state.legendOff;
  var grain = el.getAttribute('data-grain') || MODEL.grain;
  var bt = bucketTitle(tsDate(bk.k, grain), grain);
  if (el.getAttribute('data-dyn') === 'cov') {
    return tipHtml({ title: bt, rows: [
      { label: 'Накоплено к дате', value: pct(bk.pc) + ' · ' + nf(bk.c), color: C.cov },
      { label: 'Заходили в этот период', value: pct(bk.pa) + ' · ' + nf(bk.u), color: C.covP, dash: true }] });
  }
  if (el.getAttribute('data-dyn') === 'views') {
    var per = el.getAttribute('data-pu') === '1';
    var rowsV = [{ label: per ? 'На пользователя' : 'Просмотры', value: per ? nf(bk.u ? bk.v / bk.u : 0, 1) : compact(bk.v), color: C.views }];
    if (per) rowsV.push({ label: 'Просмотров всего', value: nf(bk.v), dash: true, color: C.bench });
    return tipHtml({ title: bt, rows: rowsV });
  }
  var rows = [{ label: 'Всего', value: nf(bk.u) }];
  if (bk.nh) return tipHtml({ title: bt, rows: rows, note: [histNote(false, true)] });
  if (!off.new) rows.push({ label: 'Новые', value: nf(bk.nu) + ' · ' + pct(bk.u ? bk.nu / bk.u * 100 : 0, 0), color: C.new });
  if (!off.react) rows.push({ label: 'Вернувшиеся', value: nf(bk.re), color: C.react });
  if (!off.ret) rows.push({ label: 'Продолжающие', value: nf(bk.rt), color: C.ret });
  return tipHtml({ title: bt, rows: rows });
}

// ---------- БЛОК 6: МОНТАЖ + ИНТЕРАКТИВ ----------
// ---------- СВЕРКА ФИЛЬТРОВ МЕЖДУ ЧАРТАМИ (2026-09-29) ----------
// Любой чарт-источник кросс-фильтра (шапка, каталог, «Кто смотрит», строка ЦА) при изменении сразу
// сообщает соседним iframe борда ключ своего фильтра (PA_SEL: src, sheet, cols, key) — напрямую, без
// Proteus. Чарт-получатель сверяет ключи своих источников с эхом фильтров в СВОЁМ ответе (flt): пока не
// совпало — приглушён; пришёл ответ под прежний выбор — сам просит источник переотправить (PA_RESEND, фильтр
// с меткой pa_nonce → Proteus перезапрашивает) — ТОЛЬКО если пришёл ответ под прежний выбор; долгий
// запрос не повторяем (ждём). Не больше CFG.selMaxTries раз; дальше — кнопка.
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
function paAudSend() {
  // отвечаем всегда (и без эха фильтров) — каталог по ответу отличает «панель старая» от «нет эха»
  var fl = MODEL.flt;
  paBcast({ type: 'PA_AUD', v: 2, noflt: !fl, key: fl ? paKey(['mode_param', 'sel_f'], function (c) { return fl[c] || []; }) : '', rows: MODEL.aa || null });
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
function paResendOn(src, sheetFn, cols, maskFn) {
  if (state.onResend) window.removeEventListener('message', state.onResend);
  state.onResend = function (e) {
    var d = e.data || {}, sh = sheetFn();
    if (d.type !== 'PA_RESEND' || d.src !== src || !(sh === '*' || d.sheet === sh) || typeof applyCrossFilter !== 'function') return;
    var fl = maskFn();
    paOut(src, sh, cols, fl);
    applyCrossFilter(fl.concat([{ column: 'pa_nonce', operator: 'IN', value: [String(Date.now())] }]));
  };
  window.addEventListener('message', state.onResend);
}

// Получатель: плашка сверки поверх чарта. echoFn — эхо фильтров ответа (flt) или null (ответ пуст —
// сверять не с чем); accept — какие источники фильтруют этот чарт (как в кросс-фильтрах Proteus).
function paGuardMount(host, echoFn, sheetFn, accept) {
  var oldG = host.querySelector('.' + CFG.ns + '-selg');
  if (oldG) oldG.parentNode.removeChild(oldG);
  var guard = document.createElement('div');
  guard.className = CFG.ns + '-selg';
  host.appendChild(guard);
  if (!state.wants) state.wants = {};
  function hide() { guard.className = CFG.ns + '-selg'; guard.innerHTML = ''; }
  // fromData — вызов при новом ответе датасета (перезапуск скрипта). Долгий запрос ошибкой НЕ считается:
  // пока ответа нет — просто ждём (запрос мог идти и 20 с; повтор оборвал бы его и заставил ждать дважды).
  // Повторяем только по факту: пришёл ответ НЕ под текущий выбор, а правильный за CFG.selStaleWait так и не пришёл.
  function sync(fromData) {
    clearTimeout(state.selT);
    var flt = echoFn(), bad = [], now = Date.now(), src;
    if (!flt) { hide(); return; }
    var get = function (c) { return flt[c] || []; };
    for (src in state.wants) {
      if (!Object.prototype.hasOwnProperty.call(state.wants, src)) continue;
      var w = state.wants[src];
      if (paKey(w.cols, get) === w.key) { w.t = 0; w.tries = 0; w.stale = 0; } else bad.push(w);
    }
    if (!bad.length) { hide(); return; }
    // Вкладка листа скрыта (iframe нулевого размера) — Proteus её не перезапрашивает: не ждём и не повторяем.
    if (!window.innerWidth || !window.innerHeight) { hide(); return; }
    var i, next = Infinity, giveUp = false, tried = 0, shown = false;
    for (i = 0; i < bad.length; i++) {
      var b = bad[i];
      if (!b.t) b.t = now;
      if (fromData) b.stale = now;              // ответ пришёл, но под прежний выбор
      if (b.stale && now - b.stale >= CFG.selStaleWait && b.tries < CFG.selMaxTries) {
        b.tries++; b.stale = 0; b.t = now;
        paBcast({ type: 'PA_RESEND', src: b.src, sheet: sheetFn() });
      }
      if (b.stale) next = Math.min(next, b.stale + CFG.selStaleWait - now);
      if (now - b.t >= CFG.selGiveUp || (b.tries >= CFG.selMaxTries && b.stale)) giveUp = true;
      else next = Math.min(next, b.t + CFG.selGiveUp - now);
      if (now - b.t >= CFG.selShowAfter || b.tries) shown = true;
      else next = Math.min(next, b.t + CFG.selShowAfter - now);
      if (b.tries > tried) tried = b.tries;
    }
    if (!shown && !giveUp) hide();
    else {
      guard.className = CFG.ns + '-selg on' + (giveUp ? ' late' : '');
      guard.innerHTML = giveUp
        ? '<div class="' + CFG.ns + '-selg-box"><b>Не удалось получить данные под выбранные фильтры</b>' +
          '<span>Числа здесь могут быть для прежнего выбора.</span>' +
          '<button type="button" data-selretry="1">Повторить запрос</button></div>'
        : '<div class="' + CFG.ns + '-selg-box"><i class="' + CFG.ns + '-selg-spin" aria-hidden="true"></i>' +
          (tried ? 'Пришли данные под прежний выбор — повторяю запрос (' + tried + ' из ' + CFG.selMaxTries + ')…' : 'Пересчитываем под новый выбор…') + '</div>';
    }
    if (!giveUp && next < Infinity) state.selT = setTimeout(function () { sync(false); }, Math.max(100, next + 60));
  }
  guard.addEventListener('click', function (e) {
    if (!e.target || !e.target.getAttribute || e.target.getAttribute('data-selretry') === null) return;
    var flt = echoFn() || {}, get = function (c) { return flt[c] || []; };
    for (var s in state.wants) {
      if (!Object.prototype.hasOwnProperty.call(state.wants, s)) continue;
      var w = state.wants[s];
      if (paKey(w.cols, get) === w.key) continue;   // повторяем только несовпавшие источники
      w.tries = 0; w.stale = 0; w.t = Date.now();
      paBcast({ type: 'PA_RESEND', src: s, sheet: sheetFn() });
    }
    sync(false);
  });
  if (state.onSelMsg) window.removeEventListener('message', state.onSelMsg);
  state.onSelMsg = function (e) {
    var d = e.data || {}, sh = sheetFn();
    if (d.type !== 'PA_SEL' || accept.indexOf(d.src) < 0 || !(d.sheet === '*' || d.sheet === sh)) return;
    var old = state.wants[d.src];
    state.wants[d.src] = { src: d.src, cols: d.cols || [], key: String(d.key || ''), t: old && old.key === d.key ? old.t : 0, tries: old && old.key === d.key ? old.tries : 0, stale: 0 };
    sync(false);
  };
  window.addEventListener('message', state.onSelMsg);
  return sync;
}

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
      avail = Math.max(300, Math.floor(avail));   // нижний порог высоты графиков (был 360 — на низкой панели давал прокрутку)
      // допуск 4 px — только на рост: не хватает хоть пикселя — ужимаем (иначе полоса прокрутки)
      if (avail >= DYN_H && avail - DYN_H <= 4) return false;
      DYN_H = avail; state.dynH = avail;
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
      COH_H = avail; state.cohH = avail;
      return true;
    }
    function syncSvgWidth() {
      var svgs = overlay.querySelectorAll('svg[data-dyn-svg]');
      if (!svgs.length) return false;
      var w = svgs[0].clientWidth || 0;
      if (!w || Math.abs(w - SVG_W) <= 2) return false;
      SVG_W = w; state.svgW = w;
      return true;
    }
    // Открытая выпадашка не должна обрезаться (скрин владельца 2026-09-30, «Фильтр людей»): absolute-тело
    // режет прокручиваемое тело панели. Поэтому тело выпадашки — fixed от кнопки в окне чарта: вниз, а если
    // снизу места меньше, чем сверху, — вверх; не влезает и так — сначала ужимается список людей, потом
    // тело получает прокрутку. Идемпотентна: зовётся после render() и при прокрутке панели.
    function fitDd() {
      var b = overlay.querySelector('.' + CFG.ns + '-dd.open > .' + CFG.ns + '-dd-body');
      if (!b) return;
      var ex = b.querySelector('.' + CFG.ns + '-wo-ex');
      b.style.cssText = ''; if (ex) ex.style.maxHeight = '';
      var H = window.innerHeight, W = window.innerWidth;
      if (!H || !W) return;
      var t = b.parentNode.getBoundingClientRect(), r = b.getBoundingClientRect();
      var need = r.height, below = H - t.bottom - 10, above = t.top - 10;
      var up = need > below && above > below, room = up ? above : below;
      b.style.position = 'fixed'; b.style.right = 'auto'; b.style.minWidth = r.width + 'px';
      b.style.left = Math.round(Math.max(6, Math.min(r.left, W - r.width - 6))) + 'px';
      if (up) { b.style.top = 'auto'; b.style.bottom = Math.round(H - t.top + 4) + 'px'; }
      else b.style.top = Math.round(t.bottom + 4) + 'px';
      if (need <= room) return;
      if (ex) { ex.style.maxHeight = Math.max(72, ex.offsetHeight - (need - room)) + 'px'; need = b.offsetHeight; }
      if (need > room) { b.style.maxHeight = Math.max(80, Math.floor(room)) + 'px'; b.style.overflowY = 'auto'; }
    }
    // Прокрутка переживает пересборку и перезапуск скрипта Proteus (кросс-фильтр перезапускает чарт в том же
    // окне): клик по человеку в таблице не должен уводить список наверх. Снимок — сама панель и внутренние
    // скролл-зоны (таблица, списки настроек) по классу и номеру; хранится в state, обновляется на scroll.
    var SCR_SEL = '.' + CFG.ns + '-tbl-scroll, .' + CFG.ns + '-wo-ex, .' + CFG.ns + '-pickbox';
    function listSig() {
      return JSON.stringify([state.page, state.whoCut, state.pSort, state.gSort, state.q, state.freqSel || null]);
    }
    function scrSnap() {
      var z = overlay.querySelectorAll(SCR_SEL), m = { ov: [overlay.scrollTop, overlay.scrollLeft], sig: state.scrSig }, i, k, n = {};
      for (i = 0; i < z.length; i++) {
        k = z[i].className; n[k] = (n[k] || 0) + 1;
        m[k + '#' + n[k]] = [z[i].scrollTop, z[i].scrollLeft];
      }
      return m;
    }
    function scrPut(m) {
      if (!m) return;
      if (m.ov) { overlay.scrollTop = m.ov[0]; overlay.scrollLeft = m.ov[1]; }
      if (m.sig !== listSig()) return;     // другая страница / сортировка / группировка / поиск — список сверху
      var z = overlay.querySelectorAll(SCR_SEL), i, k, n = {}, v;
      for (i = 0; i < z.length; i++) {
        k = z[i].className; n[k] = (n[k] || 0) + 1; v = m[k + '#' + n[k]];
        if (v) { z[i].scrollTop = v[0]; z[i].scrollLeft = v[1]; }
      }
    }
    overlay.addEventListener('scroll', function (e) {
      state.scr = scrSnap();
      // выпадашка fixed: прокрутили панель — догоняет кнопку (прокрутка внутри самой выпадашки — не повод)
      var n = e.target;
      while (n && n !== overlay && !(n.classList && n.classList.contains(CFG.ns + '-dd-body'))) n = n.parentNode;
      if (state.dd && (!n || n === overlay)) fitDd();
    }, { capture: true, passive: true });
    function render() {
      // overlay — скролл-контейнер: без сохранения позиции клик внизу прыгал наверх.
      // Первый рендер после перезапуска (панель ещё пуста) — позиция из state.
      var scr = overlay.firstChild ? scrSnap() : state.scr;
      ANIM = MODEL.sig !== state.animSig;     // новые данные → анимация только в этом рендере
      state.animSig = MODEL.sig;
      overlay.innerHTML = buildHTML();
      var ch1 = syncSvgWidth(), ch2 = syncDynH(), ch3 = syncCohH();
      if (ch1 || ch2 || ch3) overlay.innerHTML = buildHTML();
      if (ANIM) animateIn(overlay);
      ANIM = false;
      fitDd();
      scrPut(scr);
      state.scrSig = listSig();     // что сейчас на экране — с этим сравнит следующий снимок
      state.scr = scrSnap();
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
      // Курсор уже не над целью подсказки (mouseout потерялся) — гасим; следящую подсказку динамики ведёт onMove.
      if (state.tip && !trigger(e.target, 'data-tip')) { state.tip = null; if (!state.dynEl) hideTip(); return; }
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
      if (pk.org.length) fl.push({ column: 'org_f', operator: 'IN', value: pk.org.slice().sort() });
      if (pk.spec.length) fl.push({ column: 'spec_f', operator: 'IN', value: pk.spec.slice().sort() });
      if (pk.stream.length) fl.push({ column: 'stream_f', operator: 'IN', value: pk.stream.slice().sort() });
      if (pk.adgroup.length) fl.push({ column: 'adg_f', operator: 'IN', value: pk.adgroup.slice().sort() });
      // heads_f: '1' — только руководители (настройка или группа «Тим-лиды»),
      // 'n' — только группа «Остальные»; обе группы сразу = без условия.
      var hv = state.headsOnly ? '1' : (pk.heads.length === 1 ? (pk.heads[0] === 'Тим-лиды' ? '1' : 'n') : '');
      if (hv) fl.push({ column: 'heads_f', operator: 'IN', value: [hv] });
      if (pk.login.length) fl.push({ column: 'login_f', operator: 'IN', value: pk.login.slice().sort() });
      // Исключённые логины настроек списка — выпадают и из каталога, и из шапки.
      if (state.excl.length) fl.push({ column: 'exl_f', operator: 'IN', value: state.excl.slice().sort() });
      if (state.freqSel) fl.push({ column: 'freq_f', operator: 'IN', value: [state.freqSel] });
      return fl;
    }
    function emitBus() {
      if (typeof applyCrossFilter !== 'function') return;
      paOut('ppl', CFG.sheet, CFG.paCols, maskOf());
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
          state.freqSel = null; state.segSel = null; state.headsOnly = false; state.excl = [];
        } else if (ukey === 'freq') state.freqSel = null;
        else if (ukey === 'headsOnly') state.headsOnly = false;
        else if (ukey === 'excl') state.excl = [];
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
          var okD = downloadCsv(toDelim(tb, ';'), 'kto-smotrit-' + (state.whoCut === 'none' ? 'lyudi' : state.whoCut) + '-' + stamp + '.csv');
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
      var fb = trigger(e.target, 'data-freq');
      if (fb) {
        var bk = fb.getAttribute('data-freq');
        state.freqSel = state.freqSel === bk ? null : bk;
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
      // Полоса ЦА: клик по сегменту оставляет в списке только его (повторный — снимает). Каталог НЕ сужает
      // (владелец 2026-09-30: сегмент — чтобы увидеть людей, а не фильтр).
      var sgp = trigger(e.target, 'data-seg');
      if (sgp) {
        var sk0 = sgp.getAttribute('data-seg');
        state.segSel = state.segSel === sk0 ? null : sk0;
        state.page = 0;
        render();
        return;
      }
      var tab = trigger(e.target, 'data-view');
      if (tab && String(tab.getAttribute('data-view')).indexOf('whoMode:') === 0) {
        // Смена разбивки: корзина частоты — фильтр каталога (freq_f), в режиме ЦА её не видно — снимаем.
        var wm = String(tab.getAttribute('data-view')).split(':')[1] === 'ca' ? 'ca' : 'freq';
        if (wm !== state.whoMode) {
          // корзина частоты — фильтр каталога (freq_f): в режиме ЦА её не видно — снимаем; сегмент ЦА — только список
          var hadFreq = !!state.freqSel;
          state.whoMode = wm; state.segSel = null; state.page = 0;
          if (wm === 'ca' && hadFreq) state.freqSel = null;
          render();
          if (wm === 'ca' && hadFreq) emitBus();
        }
        return;
      }
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
        if (box) box.innerHTML = exPoolHtml(MODEL.list);
      }
    }

    overlay.addEventListener('mouseover', onOver);
    overlay.addEventListener('mouseout', onOut);
    overlay.addEventListener('mousemove', onTipMove);
    overlay.addEventListener('mousemove', onMove);
    // Подсказки не залипают (как в каталоге): курсор ушёл из чарта — mouseout на быстром выходе браузер не шлёт,
    // окно потеряло фокус, список прокрутили под курсором. Гасит и обычную, и следящую подсказку динамики.
    state.tipOff = function () { state.tip = null; state.dynEl = null; state.dynI = -1; hideTip(); };
    overlay.addEventListener('mouseleave', function () { state.tipOff(); });
    overlay.addEventListener('scroll', function () { state.tipOff(); }, { passive: true });
    if (!state.tipGuard) {
      state.tipGuard = true;
      document.addEventListener('mouseout', function (ev) { if (!ev.relatedTarget && state.tipOff) state.tipOff(); });
      window.addEventListener('blur', function () { if (state.tipOff) state.tipOff(); });
    }
    overlay.addEventListener('click', onClick);
    overlay.addEventListener('input', onInput);

    // Escape: закрыть открытый дропдаун. Глобальный слушатель живёт в state
    // и снимается явно — переживает перезапуск скрипта (шаблон, БЛОК 6).
    if (state.onEsc) window.removeEventListener('keydown', state.onEsc);
    state.onEsc = function (ev) {
      if ((ev.key || '') === 'Escape' && state.dd != null) {
        state.dd = null;
        render();
      }
    };
    window.addEventListener('keydown', state.onEsc);

    // Глобальные слушатели переживают перезапуск скрипта и накапливаются.
    // Старый снимаем ЯВНО, ссылку держим в state. Escape вешай здесь же,
    // тем же способом, и никогда не внутри render().
    if (state.onWinResize) window.removeEventListener('resize', state.onWinResize);
    // ── ТУР «КАК РАБОТАТЬ» (2026-10-07; движок — как в «Детальных списках») ── ведёт каталог, карточка — у него.
    // PA_TOUR {op}: dim — чарт затемнён целиком, show — затемнён вокруг цели key, off — слоя нет. Ответ PA_TOUR_AT
    // {from, key, ok, l, t, r, b}: где цель (колонки и ряд борда общие — стрелка карточки каталога смотрит туда же);
    // на dim — какие цели есть (keys). Клики под затемнением не проходят; Esc и стрелки уходят в каталог (PA_TOUR_KEY).
    var tourNode = null, TOUR_FROM = 'one', TOUR_T = { kpi: '.' + CFG.ns + '-kpis', obs: '.' + CFG.ns + '-obs', tabs: function () { var b = overlay.querySelector('[data-view^="view:"]'); return b ? b.parentNode : null; } };
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
      tourBox(Q('t'), 0, 0, W, h.t, '12px 12px 0 0');
      tourBox(Q('b'), 0, h.b, W, H - h.b, '0 0 12px 12px');
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
      if (d.op === 'off') { state.tour = null; tourPos(); return; }
      if (state.dd) { state.dd = null; render(); }
      if (state.tip) { state.tip = null; hideTip(); }
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
    state.onWinResize = function () { var w = syncSvgWidth(), hh = syncDynH(), ch = syncCohH(); if (w || hh || ch) render(); if (state.tip) renderTip(); };
    window.addEventListener('resize', state.onWinResize);

    // Сверка фильтров: плашка «Пересчитываем…/повторяю запрос», источник людской шины отвечает на «повтори».
    var paSync = paGuardMount(host, function () { return MODEL.flt; }, function () { return CFG.sheet; }, ['strip', 'cat', 'ca']);
    paResendOn('ppl', function () { return CFG.sheet; }, CFG.paCols, maskOf);
    render();
    paSync(true);   // новый ответ датасета
    // Вкладка «Аудитория» каталога: каталог свой выбор не видит (самовлияние выключено) — разрезы по выбранной
    // области считает этот датасет (секция aa) и шлёт их каталогу с ключом выбора (mode_param + sel_f из эха).
    paAudSend();
    if (state.onAudAsk) window.removeEventListener('message', state.onAudAsk);
    state.onAudAsk = function (e) { if ((e.data || {}).type === 'PA_AUD_ASK') paAudSend(); };
    window.addEventListener('message', state.onAudAsk);

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
