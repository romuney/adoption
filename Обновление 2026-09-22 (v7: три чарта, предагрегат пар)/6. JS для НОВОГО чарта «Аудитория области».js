// ============================================================================
// pa-area.chart.js — «Аудитория области»: правая панель листа «Отчёты», v7 (2026-09-22)
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
  ns: 'parea',                // ПРЕФИКС всех CSS-классов и класса overlay
  // 30 колонок датасета pa_people (SQL — поставка 2026-09-22, файл 3);
  // alias == имя колонки 1:1. section: area/total/freq/ctx/list/ts/coh.
  fields: {
    section: 'section', g: 'g', k: 'k', parent: 'parent', login: 'login',
    fio: 'fio', lvl3: 'lvl3', lvl4: 'lvl4', spec: 'spec', stream: 'stream',
    exp: 'exp', is_head: 'is_head', days: 'days', last_dt: 'last_dt', bin: 'bin',
    users: 'users', users_prev: 'users_prev', views: 'views', views_prev: 'views_prev',
    new_u: 'new_u', new_prev: 'new_prev', react_u: 'react_u',
    regular: 'regular', regular_prev: 'regular_prev', sleeping: 'sleeping',
    mau: 'mau', mau_prev: 'mau_prev', cnt: 'cnt', ages: 'ages', acts: 'acts'
  },
  text: { noData: 'Нет данных' },
  // Динамика живёт в ts-строках (бакет = возраст k от даты свежести).
  mode: 'snapshot',
  // Порядок категорий — часть ТЗ (правило 15): и для разметки, и для автомока.
  order: {
    section: ['area', 'total', 'freq', 'ctx', 'list', 'ts', 'coh'],
    g: ['org', 'spec', 'stream', 'head', 'adg'],
    bin: [1, 2, 3, 4, 5],
    is_head: [1, 0]
  },
  // Вкладки панели: люди → время → удержание.
  views: [
    { key: 'dyn', label: 'Динамика' },
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
    { key: 'spec', label: 'Специализация' }, { key: 'stream', label: 'Стрим' },
    { key: 'adgroup', label: 'AD-группа' }, { key: 'heads', label: 'Тим-лиды' }
  ],
  // Разделитель звеньев пути оргструктуры — тот же, что в SQL (pa_people, org_f).
  orgSep: ' › ',
  // Колонки сводной таблицы групп: capability-метаданные (TABLES.md §3).
  // prevOnly — показывается, только если у периода есть полный предыдущий.
  gcols: [
    { key: 'users', label: 'Людей', hint: 'Уникальные люди группы в области за период' },
    { key: 'share', label: 'Доля', hint: 'Доля группы от всех людей области' },
    { key: 'dUsers', label: 'Δ к пред.', hint: 'Изменение числа людей к предыдущему периоду той же длины', prevOnly: true },
    { key: 'views', label: 'Просмотров', short: 'Просм.', hint: 'Открытия отчётов области за период' },
    { key: 'vpu', label: 'На чел.', hint: 'Просмотров на одного человека группы' },
    { key: 'regShare', label: 'Постоянных', short: 'Пост.', hint: 'Доля постоянных — корзины частоты 3 и 4: 6+ дней или недель, 4+ месяца, 3+ квартала (число — во всплывашке)' },
    { key: 'new_u', label: 'Новых', hint: 'Первый визит в отчёты области пришёлся на этот период' }
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
    views: '#5b6478',          // просмотры: вторая панель
    bench: '#c7c8cc',
    label: '#2b2b2b', axis: '#808080', axisLine: 'rgb(155, 164, 181)',
    split: '#f0f1f3', txt: '#3a3f4a', mut: '#8a909c',
    // Корзины частоты (макет FREQ_COLORS, app.js 71): светлая → тёмная.
    freq: ['#D3E0FA', '#8AAAEC', '#4A7BE0', '#245FD4']
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
function tsDate(k, grain) {
  var now = new Date();
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

// Упакованный список (pa_people, секция list): строка на подразделение, parent — его путь
// «УС-3 › … › УС-7», в k — сотрудники через \n, поля через \t: логин, ФИО, специализация,
// стрим, стаж, рук. 1/0, активных периодов, просмотров, последний визит, корзина 1–4,
// новый 1/0, MAU 1/0, MAU пред. месяца 1/0, уволен 1/0 (нет среди действующих сотрудников с AD-логином).
function parseListPack(txt, path, out) {
  var lines = txt.split('\n'), ps = path ? path.split(CFG.orgSep) : [];
  for (var i = 0; i < lines.length; i++) {
    var f = lines[i].split('\t');
    if (f.length < 10 || !f[0]) continue;
    var bin = num(f[9]) || 1, seg = segOf(bin);
    out.push({
      login: f[0], fio: f[1], lvl3: ps[0] || '', lvl4: ps[1] || '', org: path,
      spec: f[2], stream: f[3], exp: f[4], is_head: num(f[5]) || 0,
      days: num(f[6]) || 0, views: num(f[7]) || 0, last_dt: toDate(f[8]),
      bin: bin, seg: seg.key, segCls: seg.cls,
      nw: num(f[10]) || 0, m1: num(f[11]) || 0, m2: num(f[12]) || 0,  // новый · MAU · MAU пред. месяца
      fired: f[13] === '1'
    });
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
    ts: [], total: 0, freqCtx: {}, labels: freqLabels('d'),
    // gm[разрез][ключ] — группа с полными метриками (серверные, точные по области);
    // orgKids[путь] — дочерние узлы оргструктуры (корни — под '').
    gm: { org: {}, spec: {}, stream: {}, adg: {}, head: {} }, orgKids: {},
    list: [], rows: [], coh: []
  };
  var gotGrain = false;
  for (i = 0; i < rawData.length; i++) {
    r = rawData[i] || {};
    var sec = String(r[F.section] || '');
    if (sec === 'area') {
      var gr = String(r[F.parent] || '');
      if (CFG.grains[gr]) { m.grain = gr; gotGrain = true; }
      m.area.mode = String(r[F.g] || '');
      var kv = String(r[F.k] == null ? '' : r[F.k]);
      m.area.sel = kv ? kv.split('\n') : [];
      m.area.name = String(r[F.fio] || '');
    } else if (sec === 'total') {
      m.kpi = {
        users: num(r[F.users]) || 0, users_prev: num(r[F.users_prev]) || 0,
        views: num(r[F.views]) || 0, views_prev: num(r[F.views_prev]) || 0,
        new_u: num(r[F.new_u]) || 0, new_prev: num(r[F.new_prev]) || 0,
        regular: num(r[F.regular]) || 0, regular_prev: num(r[F.regular_prev]) || 0,
        sleeping: num(r[F.sleeping]) || 0,
        mau: num(r[F.mau]) || 0, mau_prev: num(r[F.mau_prev]) || 0
      };
      m.total = m.kpi.users;
    } else if (sec === 'freq') {
      m.freqCtx[String(r[F.k])] = num(r[F.users]) || 0;
    } else if (sec === 'ts') {
      m.ts.push({
        k: num(r[F.k]) || 0,
        users: num(r[F.users]) || 0,
        new_u: num(r[F.new_u]) || 0,
        react_u: num(r[F.react_u]) || 0,
        views: num(r[F.views]) || 0
      });
    } else if (sec === 'ctx') {
      // Группа — люди, активные в ТЕКУЩЕМ периоде (users); строки «только
      // предыдущий период» (users = 0) в таблицу не попадают.
      var gg = String(r[F.g] || ''), kk = String(r[F.k] || '');
      if (!m.gm[gg] || !kk || !(num(r[F.users]) || 0)) continue;
      var grp = {
        k: kk, parent: String(r[F.parent] || ''),
        users: num(r[F.users]) || 0, users_prev: num(r[F.users_prev]) || 0,
        views: num(r[F.views]) || 0, views_prev: num(r[F.views_prev]) || 0,
        new_u: num(r[F.new_u]) || 0, regular: num(r[F.regular]) || 0, sleeping: num(r[F.sleeping]) || 0
      };
      m.gm[gg][kk] = grp;
      if (gg === 'org') (m.orgKids[grp.parent] = m.orgKids[grp.parent] || []).push(kk);
    } else if (sec === 'list' && String(r[F.k] || '').indexOf('\t') >= 0) {
      parseListPack(String(r[F.k]), String(r[F.parent] || ''), m.list);
    } else if (sec === 'list') {
      var bin = num(r[F.bin]) || 1;
      var seg = segOf(bin);
      m.list.push({
        login: String(r[F.login] || ''),
        fio: String(r[F.fio] || ''),
        lvl3: String(r[F.lvl3] || ''),
        lvl4: String(r[F.lvl4] || ''),
        // Путь в оргструктуре «УС-3 › … › УС-7» (parent list-строки pa_people);
        // старый ответ без пути — собираем из УС-3/УС-4.
        org: String(r[F.parent] || '') || [String(r[F.lvl3] || ''), String(r[F.lvl4] || '')].filter(function (x) { return x; }).join(CFG.orgSep),
        spec: String(r[F.spec] || ''),
        stream: String(r[F.stream] || ''),
        exp: String(r[F.exp] || ''),
        is_head: num(r[F.is_head]) || 0,
        days: num(r[F.days]) || 0,
        views: num(r[F.views]) || 0,
        last_dt: toDate(r[F.last_dt]),
        bin: bin, seg: seg.key, segCls: seg.cls
      });
    } else if (sec === 'coh') {
      var cm = toDate(r[F.k]);
      if (!cm) continue;
      var ages = arr(r[F.ages]), acts = arr(r[F.acts]), byAge = {};
      for (var ai = 0; ai < ages.length; ai++) {
        var ag = num(ages[ai]);
        if (ag != null) byAge[ag] = num(acts[ai]) || 0;
      }
      m.coh.push({ month: cm, size: num(r[F.cnt]) || 0, byAge: byAge });
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
    full.push(p);                // СТАРЫЕ бакеты (большой k) слева, свежий справа
  }
  m.ts = m.kpi || m.ts.length ? full : [];
  m.labels = freqLabels(m.grain);
  m.list.sort(function (a, b) {
    return (b.days - a.days) || (b.views - a.views) || (a.login < b.login ? -1 : (a.login > b.login ? 1 : 0));
  });
  m.coh.sort(function (a, b) { return (a.month.y - b.month.y) * 12 + (a.month.m - b.month.m); });
  m.rows = m.list;
  return m;
}
var MODEL = buildModel();
// Отпечаток ответа: меняется, когда пришли новые данные (область, период, опции).
MODEL.sig = [MODEL.grain, MODEL.total, MODEL.kpi ? MODEL.kpi.views : 0, MODEL.rows.length, MODEL.ts.length, MODEL.coh.length].join('|');

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
  var now = new Date(Date.now() - 86400000);
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
  if (shNew >= 22) {
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
    P + '-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;}',
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
    P + '-panel-h{padding:14px 16px;font-weight:600;font-size:14.5px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:0 0 auto;}',
    P + '-panel-h .sub{font-size:var(--fs-note);color:var(--muted);font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    P + '-h-txt{display:flex;flex-direction:column;gap:2px;min-width:0;}',
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
    P + '-who-opts-pop{min-width:256px;padding:10px;display:flex;flex-direction:column;gap:8px;}',
    P + '-who-opts-pop ' + P + '-psearch input{width:100%;height:30px;}',
    P + '-wo-h{font-size:11px;font-weight:500;color:var(--muted);',
    '  text-transform:uppercase;letter-spacing:.4px;}',
    P + '-wo-ex{max-height:224px;overflow:auto;}',
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
    P + '-rflag.fired{background:#fde8e8;color:#b42318;}',
    P + '-sig-chip{display:inline-block;font-size:11px;font-weight:500;',
    '  border-radius:999px;padding:2px 9px;}',
    P + '-sig-chip.good{background:var(--green-bg);color:var(--green-tx);}',
    P + '-sig-chip.note{background:var(--blue-bg);color:var(--act-ink);}',
    P + '-sig-chip.neutral{background:#f3f4f6;color:var(--muted);}',
    P + '-tbl-note{margin-top:8px;font-size:var(--fs-note);color:var(--muted);line-height:1.5;flex:0 0 auto;}',

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
    P + '-panel-h > ' + P + '-sub-tabs{margin-left:auto;}',
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
function baseList() {
  return MODEL.list.filter(function (p) {
    return (!state.headsOnly || p.is_head) && state.excl.indexOf(p.login) < 0;
  });
}
function busList() { return baseList().filter(matchesPicks); }
function shownList() {
  var q = (state.q || '').toLowerCase();
  return busList().filter(function (p) {
    return (!state.freqSel || String(p.bin) === state.freqSel) &&
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
  return baseList().filter(function (p) { return !state.freqSel || String(p.bin) === state.freqSel; });
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
  var ps = baseList(), k = emptyAgg();
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
function daysAgo(p) {
  if (!p.last_dt) return null;
  var now = new Date();
  return Math.round((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    - Date.UTC(p.last_dt.y, p.last_dt.m, p.last_dt.d)) / 86400000);
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
      (p.is_head ? ' <i class="' + CFG.ns + '-rflag head">рук.</i>' : '') + (p.fired ? ' <i class="' + CFG.ns + '-rflag fired" title="Нет среди действующих сотрудников с AD-логином">уволен</i>' : '') +
      '<span class="' + CFG.ns + '-unit-sub">' + esc(p.login) + '</span></td>' +
    '<td class="txt sec">' + esc(ps.length ? ps[ps.length - 1] : '—') +
      '<span class="' + CFG.ns + '-unit-sub">' + esc(ps.length > 1 ? 'УС-' + (ps.length + 2) + ' · ' + ps[0] : (p.spec || '—')) + '</span></td>' +
    '<td class="txt">' + esc(p.exp || '—') + '</td>' +
    '<td class="lead">' + (p.days || '<span class="mut">0</span>') + '</td>' +
    '<td>' + (p.views ? nf(p.views) : '<span class="mut">0</span>') + '</td>' +
    '<td>' + lastVisitHtml(p) + '</td>' +
    '<td class="txt"><span class="' + CFG.ns + '-sig-chip ' + p.segCls + '">' + esc(p.seg) + '</span></td>' +
    '</tr>';
}
function grainCfg() { return CFG.grains[state.grain] || CFG.grains.d; }
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
  return 'Никто не подходит под корзину частоты, поиск и настройки.';
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
function gMetrics(g) {
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
function makeNode(cut, k, name, depth, g, sub) {
  if (LOCAL_GM) g = LOCAL_GM[k] || ZERO_M;
  return { id: cut + ':' + k, cut: cut, k: k, name: name, depth: depth, m: gMetrics(g), sub: sub || '' };
}
// Вид «один уровень УС»: whoCut = org3…org7 → номер уровня (0 — не он).
// ORG_NONE — ключ строки «—» (оргструктура не доходит до уровня); в шину не уходит.
var ORG_NONE = '\u2014none';
function orgLevelOf(cut) { var m = /^org([3-7])$/.exec(cut || ''); return m ? +m[1] : 0; }
function nodeKids(nd) {
  if (nd.cut !== 'org' || nd.flat) return [];
  var ks = MODEL.orgKids[nd.k] || [], out = [];
  for (var i = 0; i < ks.length; i++) out.push(orgNode(ks[i]));
  return LOCAL_GM ? out.filter(function (x) { return x.m.users > 0; }) : out;
}
function orgNode(path) {
  var ps = orgParts(path);
  return makeNode('org', path, ps[ps.length - 1], ps.length - 1, MODEL.gm.org[path], 'УС-' + (ps.length + 2));
}
function rootNodes(cut) {
  var out = [], k, src, L = orgLevelOf(cut), sumL = {};
  LOCAL_GM = peopleFilterOn() ? localGM(cut) : null;
  LOCAL_TOT = LOCAL_GM ? filteredPeople().length : 0;
  if (L) {
    // Плоско: все узлы уровня УС-L; вторая строка — путь до него. Шина та же (org_f путём).
    for (k in MODEL.gm.org) {
      if (!Object.prototype.hasOwnProperty.call(MODEL.gm.org, k)) continue;
      var pp = orgParts(k);
      if (pp.length !== L - 2) continue;
      var fn = makeNode('org', k, pp[pp.length - 1], 0, MODEL.gm.org[k], 'УС-' + L + (pp.length > 1 ? ' · ' + pp.slice(0, -1).join(CFG.orgSep) : ''));
      fn.id = cut + ':' + k; fn.flat = true;
      out.push(fn);
      for (var zk in ZERO_M) if (Object.prototype.hasOwnProperty.call(ZERO_M, zk)) sumL[zk] = (sumL[zk] || 0) + ((MODEL.gm.org[k] || {})[zk] || 0);
    }
    // Строка «—»: кто не доходит до УС-L. Узлы одного уровня не пересекаются, поэтому
    // остаток = итог области − сумма узлов (точно); сумма строк таблицы = «Итого по области».
    var rest = minusM(MODEL.kpi || ZERO_M, sumL);
    if (rest.users > 0) {
      var rn = makeNode('org', ORG_NONE, '—', 0, rest, 'не доходят до УС-' + L);
      rn.id = cut + ':' + ORG_NONE; rn.flat = true; rn.noBus = true;
      out.push(rn);
    }
  } else if (cut === 'org') {
    var ks = MODEL.orgKids[''] || [];
    for (var i = 0; i < ks.length; i++) out.push(orgNode(ks[i]));
  } else if (cut === 'heads') {
    var hd = MODEL.gm.head['1'] || ZERO_M;
    out.push(makeNode('heads', 'Тим-лиды', 'Тим-лиды', 0, hd));
    out.push(makeNode('heads', 'Остальные', 'Остальные', 0, minusM(MODEL.kpi || ZERO_M, hd)));
  } else {
    src = MODEL.gm[cut === 'adgroup' ? 'adg' : cut] || {};
    for (k in src) if (Object.prototype.hasOwnProperty.call(src, k)) out.push(makeNode(cut, k, k, 0, src[k]));
  }
  if (LOCAL_GM) out = out.filter(function (x) { return x.m.users > 0; });
  return out;
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
function gColsNow() {
  var G = CFG.grains[MODEL.grain] || CFG.grains.d, out = [];
  for (var i = 0; i < CFG.gcols.length; i++) if (!CFG.gcols[i].prevOnly || G.prev) out.push(CFG.gcols[i]);
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
  if (key === 'regShare') return '<td>' + pct(m.regShare, 0) + '</td>';
  if (key === 'new_u') return '<td>' + (m.new_u ? nf(m.new_u) : '<span class="mut">0</span>') + '</td>';
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
    '<table class="' + CFG.ns + '-ptable sub"><colgroup><col style="width:44%"><col style="width:12%"><col style="width:16%"><col style="width:12%"><col style="width:16%"></colgroup><tbody>';
  for (var i = 0; i < sorted.length && i < lim; i++) {
    var p = sorted[i], on = state.picks.login.indexOf(p.login) >= 0;
    h += '<tr class="pk' + (on ? ' sel' : '') + '" data-who="' + esc(p.login) + '" data-whocut="login" tabindex="0" role="button" aria-pressed="' + on + '"' +
      '>' +
      '<td class="txt pn" style="padding-left:' + (30 + nd.depth * 18) + 'px">' + esc(p.fio || p.login) + (p.is_head ? ' <i class="' + CFG.ns + '-rflag head">рук.</i>' : '') + (p.fired ? ' <i class="' + CFG.ns + '-rflag fired" title="Нет среди действующих сотрудников с AD-логином">уволен</i>' : '') +
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
  var cols = gColsNow(), local = localActive();
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
  var tot = gMetrics(effKpi() || ZERO_M), th = sortTh('data-gsort', { key: 'name', label: cut === 'org' || orgLevelOf(cut) ? 'Подразделение' : 'Группа', txt: true }, state.gSort);
  // В шапке — короткие подписи (колонки равной ширины), в выгрузке — полные.
  for (var c = 0; c < cols.length; c++) th += sortTh('data-gsort', cols[c].short ? { key: cols[c].key, label: cols[c].short, hint: cols[c].label + '. ' + cols[c].hint } : cols[c], state.gSort);
  if (local) th += '<th' + tip({ title: 'В выборке', text: 'Люди текущего списка в группе: корзина частоты, поиск и настройки. Итоги слева — по всей области.' }) + '>В выборке</th>';
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
  var totRow = '<tr class="g-tot tot"><td class="txt gname" style="padding-left:6px">' + totCaret + 'Итого по области</td>';
  for (c = 0; c < cols.length; c++) totRow += cols[c].key === 'share' ? shareCell(100, null) : gCellHtml(cols[c].key, tot);
  // (строка итога строится ДО полос групп — MAX_SHARE к ней не применяется)
  if (local) totRow += '<td class="loc">' + nf(plist.length) + '</td>';
  totRow += '</tr>';
  // Ширины колонок фиксированы: имя 30%, «Доля» 15%, остальные числа — поровну;
  // длинное имя группы обрезается «…» по ширине колонки.
  var nNum = cols.length + (local ? 1 : 0), hasShare = false;
  for (c = 0; c < cols.length; c++) if (cols[c].key === 'share') hasShare = true;
  var restW = (70 - (hasShare ? 15 : 0)) / Math.max(1, nNum - (hasShare ? 1 : 0));
  var cg = '<colgroup><col style="width:30%">';
  for (c = 0; c < cols.length; c++) cg += '<col style="width:' + (cols[c].key === 'share' ? 15 : restW).toFixed(2) + '%">';
  if (local) cg += '<col style="width:' + restW.toFixed(2) + '%">';
  cg += '</colgroup>';
  return '<div class="' + CFG.ns + '-tbl-scroll"><table class="' + CFG.ns + '-ptable dense gt">' + cg + '<thead><tr>' + th + '</tr></thead><tbody>' + totRow +
    (out.length ? out.join('') : '<tr><td colspan="' + span + '" class="' + CFG.ns + '-empty-td">В области нет групп по этому разрезу.</td></tr>') +
    '</tbody></table></div>';
}
var VISIBLE_NODES = [], MAX_SHARE = 100;

// --- Выгрузка: из МОДЕЛИ, все найденные строки, не страница (RETRO 28, 33) ---
function exportRows() {
  var cut = state.whoCut, head, rows = [], i, c;
  var num2 = function (v, d) { return v == null || !isFinite(v) ? '' : (d ? v.toFixed(d).replace('.', ',') : String(Math.round(v))); };
  if (cut === 'none') {
    head = ['ФИО', 'Логин', 'Руководитель', 'УС-3', 'УС-4', 'УС-5', 'УС-6', 'УС-7', 'Специализация', 'Стрим', 'Стаж',
      actLabel(), 'Просмотров', 'Последний визит', 'Сегмент', 'Уволен'];
    var ps = sortPeople(shownList());
    for (i = 0; i < ps.length; i++) {
      var p = ps[i], op = orgParts(p.org);
      rows.push([p.fio, p.login, p.is_head ? 'да' : '', op[0] || '', op[1] || '', op[2] || '', op[3] || '', op[4] || '',
        p.spec, p.stream, p.exp, String(p.days), String(p.views), isoDate(p.last_dt), p.seg, p.fired ? 'да' : '']);
    }
    return { head: head, rows: rows };
  }
  var cols = gColsNow();
  var isOrg = cut === 'org' || orgLevelOf(cut) > 0;
  head = [isOrg ? 'Уровень' : 'Разрез', isOrg ? 'Путь' : 'Группа', 'Название'];
  for (c = 0; c < cols.length; c++) head.push(cols[c].label + (cols[c].key === 'share' || cols[c].key === 'dUsers' || cols[c].key === 'regShare' ? ', %' : ''));
  head.push('Постоянных, чел.');
  var cutLabel = '';
  for (c = 0; c < CFG.groups.length; c++) if (CFG.groups[c].key === cut) cutLabel = CFG.groups[c].label;
  function walk(nodes) {                 // все уровни, независимо от раскрытия
    var s = sortNodes(nodes);
    for (var j = 0; j < s.length; j++) {
      var nd = s[j], m = nd.m, row = [nd.sub || cutLabel, nd.noBus ? '' : nd.k, nd.name];
      for (var q = 0; q < cols.length; q++) {
        var key = cols[q].key;
        row.push(key === 'share' || key === 'dUsers' || key === 'regShare' || key === 'vpu' ? num2(m[key], 1) : num2(m[key]));
      }
      row.push(num2(m.regular));
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
          { label: 'Во всей области', value: nf(areaCnt) }]
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
function dropdownHtml(id, curKey, opts) {
  var cur = '';
  for (var i = 0; i < opts.length; i++) if (opts[i].key === curKey) cur = opts[i].trg || opts[i].label;
  var open = state.dd === id;
  var h = '<div class="' + CFG.ns + '-dd sm' + (open ? ' open' : '') + '">' +
    '<button class="' + CFG.ns + '-dd-trg" data-ddtoggle="' + esc(id) + '" data-action="toggle" aria-haspopup="true" aria-expanded="' + open + '" type="button">' +
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

// Поповер настроек списка (порт app.js 1103–1139): условия уходят в людскую
// шину (heads_f, exl_f) — сужают каталог и KPI шапки; динамику панели не трогают.
function optsDropHtml(area) {
  var open = state.dd === 'whoOpts';
  var active = state.headsOnly || state.excl.length;
  var h = '<div class="' + CFG.ns + '-dd sm ' + CFG.ns + '-who-opts' + (open ? ' open' : '') + '">' +
    '<button class="' + CFG.ns + '-dd-trg" data-ddtoggle="whoOpts" data-action="toggle" aria-haspopup="true" aria-expanded="' + open + '" type="button"' +
      tip({ title: 'Настройки списка', text: 'Только руководители и исключённые логины. Действуют на список, каталог слева и KPI в шапке.' }) + '>' +
      (active ? '<i class="' + CFG.ns + '-wo-dot" aria-hidden="true"></i>' : '') +
      '<span class="' + CFG.ns + '-dd-txt">Настройки</span><span class="' + CFG.ns + '-dd-c" aria-hidden="true">▾</span>' +
    '</button>';
  if (open) {
    h += '<div class="' + CFG.ns + '-dd-body ' + CFG.ns + '-who-opts-pop">' +
      '<label class="' + CFG.ns + '-swt"><input type="checkbox" data-wohead' + (state.headsOnly ? ' checked' : '') + '>' +
        '<span>Только руководители</span></label>' +
      '<div class="' + CFG.ns + '-wo-h">Исключить логины' + (state.excl.length ? ' · ' + state.excl.length : '') + '</div>' +
      '<div class="' + CFG.ns + '-psearch">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
        '<input type="search" data-search="woExQ" placeholder="Логин или ФИО" value="' + esc(state.exQ) + '">' +
      '</div>' +
      '<div class="' + CFG.ns + '-pickbox ' + CFG.ns + '-wo-ex">' + exPoolHtml(area) + '</div>' +
      (state.excl.length
        ? '<div class="' + CFG.ns + '-scope-act"><button class="' + CFG.ns + '-btn ghost xs" data-woexclear type="button">Снять всё (' + state.excl.length + ')</button></div>'
        : '') +
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
    cnt = nf(n) + ' ' + plural(n, 'человек', 'человека', 'человек') + (MODEL.total > n ? ' из ' + nf(MODEL.total) : '');
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
    if (g.key === 'adgroup') return hasAdg;
    var L = orgLevelOf(g.key);
    return !L || !!lv[L];              // уровень УС без узлов в данных в меню не показываем
  });
}
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
      dropdownHtml('whoCut', cut, views) +
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
    text: 'Область задана каталогом слева' + (one ? '' : ' (' + a.sel.length + ' значений, объединение)') +
      '. Пользователи — уникальные люди области, не сумма строк каталога.',
    what: one ? '«' + name + '»' : L[1] + ' (' + a.sel.length + ')',
    first: repish ? 'Месяц, в который человек впервые открыл отчёт области' : 'Месяц первого визита в Proteus',
    size: repish ? 'Столько человек впервые открыли отчёт области в этом месяце' : 'Столько людей среза впервые зашли в Proteus в этом месяце'
  };
}




// --- Закрепляемость: таблица когорт (порт pa-cohorts) -----------------------
// Ячейка берётся ПО ВОЗРАСТУ (byAge), а не по позиции в массиве: возраст, в
// котором никто не вернулся, SQL не отдаёт — позиционный доступ сдвигал все
// значения правее на столбец. Закрытый возраст без возвратов = 0%.
// Возраст незакрытого текущего месяца — серый курсив, в медиану не входит.
function cohortCells(row) {
  var now = new Date(Date.now() - 86400000);
  var openAge = (now.getUTCFullYear() - row.month.y) * 12 + (now.getUTCMonth() - row.month.m);
  var cells = {};
  for (var a = 1; a <= Math.min(11, openAge); a++) {
    cells[a] = { age: a, active: row.byAge[a] || 0, partial: a === openAge };
  }
  return cells;
}
function retentionPoints(rows) {
  var byAge = {};
  for (var c = 0; c < rows.length; c++) {
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
    h += '<tr><td class="txt"' + tip({ title: MONTHS_FULL[cm.m] + ' ' + cm.y, text: o.firstTip || 'Месяц первого визита' }) + '>' + esc(lbl) + '</td>' +
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
    return '<div class="' + CFG.ns + '-tbl-note">Когорт за последние 12 месяцев в области нет.</div>';
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
  for (i = 0; i < MODEL.list.length; i++) fioOf[MODEL.list[i].login] = MODEL.list[i].fio || MODEL.list[i].login;
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
  var why = loc ? whyLoc : 'В витрине 13 месяцев истории: полного предыдущего периода (' + G.label + ') в ней нет.';
  var dl = function (v, o) { return G.prev && !loc ? delta(v, o) : delta(null, { why: why }); };
  var all = MODEL.kpi || k;
  var shReg = k.users ? k.regular / k.users * 100 : 0;
  var shRegPrev = k.users_prev ? k.regular_prev / k.users_prev * 100 : 0;
  var mM = closedMonth(1), mP = closedMonth(2);
  return '<div class="' + CFG.ns + '-kpis">' +
    kpiCard({ label: 'Пользователей', value: nf(k.users),
      hint: { title: 'Пользователи ' + G.label, text: 'Уникальные люди области каталога. Один человек — один раз, даже если открыл несколько отчётов.' },
      delta: dl(dPct(k.users, k.users_prev), { vs: G.vs, unit: '%' }),
      sub: loc ? 'из <b>' + nf(all.users) + '</b> в области' : (G.prev ? 'предыдущий: <b>' + nf(k.users_prev) + '</b>' : 'ушли из прошлого периода: <b>' + nf(k.sleeping) + '</b>') }) +
    kpiCard({ label: 'Просмотров', value: compact(k.views),
      hint: { title: 'Просмотры', text: 'Сумма открытий отчётов области за период.' },
      delta: dl(dPct(k.views, k.views_prev), { vs: G.vs, unit: '%' }),
      sub: 'на пользователя: <b>' + nf(k.users ? k.views / k.users : 0, 1) + '</b>' }) +
    kpiCard({ label: 'Новых', value: nf(k.new_u),
      hint: { title: 'Новые', text: 'Первый визит в отчёты области пришёлся на этот период.' },
      delta: dl(dPct(k.new_u, k.new_prev), { vs: G.vs, unit: '%' }),
      sub: 'доля аудитории: <b>' + pct(k.users ? k.new_u / k.users * 100 : 0) + '</b>' }) +
    kpiCard({ label: 'Постоянных', value: pct(shReg),
      hint: { title: 'Постоянные', text: 'Заходили ' + G.reg + ' и более разных ' + G.units + ' за период — та же мера, что столбец «Пост.» каталога.' },
      delta: dl(shReg - shRegPrev, { vs: G.vs, unit: ' п.п.', dead: 0.3 }),
      sub: '<b>' + nf(k.regular) + '</b> ' + plural(k.regular, 'человек', 'человека', 'человек') }) +
    kpiCard({ label: 'MAU · ' + mM, value: nf(k.mau),
      hint: { title: 'Месячная аудитория', text: 'Уникальные люди области за последний закрытый календарный месяц. От периода шапки не зависит.',
        rows: [{ label: mM, value: nf(k.mau), color: CFG.colors.ret }, { label: mP, value: nf(k.mau_prev), color: CFG.colors.bench }] },
      delta: loc ? delta(null, { why: whyLoc }) : delta(dPct(k.mau, k.mau_prev), { vs: 'к ' + mP.split(' ')[0], unit: '%' }),
      sub: loc ? 'среди отобранных людей' : mP + ': <b>' + nf(k.mau_prev) + '</b>' }) +
    '</div>';
}

// Карусель наблюдений фиксированной высоты: один факт, листание ‹ ›,
// текст целиком — в подсказке. Высота не меняется — вкладки не прыгают.
function obsHtml(what) {
  var list = obsList(MODEL.kpi, CFG.grains[MODEL.grain] || CFG.grains.d, what);
  var N = CFG.ns;
  if (!list.length) {
    return '<div class="' + N + '-obs"><div class="' + N + '-obs-h"><span class="' + N + '-obs-ico" aria-hidden="true">✓</span>' +
      '<span class="' + N + '-obs-t">Что видно в данных</span>' +
      '<span class="' + N + '-obs-lead">Отклонений выше порогов нет: показатели в пределах обычного разброса.</span></div></div>';
  }
  var o = list[0], open = !!state.obsOpen && list.length > 1;
  var h = '<div class="' + N + '-obs sev-' + o.sev + '"><div class="' + N + '-obs-h">' +
    '<span class="' + N + '-obs-ico" aria-hidden="true">!</span>' +
    '<span class="' + N + '-obs-t">Что видно в данных</span>' +
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
      'В области нет зрителей за период — снимите часть условий в каталоге или в полоске.</div></div>';
  }
  // v7.2: сверху — KPI области и «Что видно в данных» (меняются от клика в
  // каталоге), под ними карточка вкладок: заголовок с областью · поиск
  // (для «Кто смотрит») · вкладки справа. Период, опции и пилюли — в шапке листа.
  var N = CFG.ns, ai = areaInfo();
  var view = state.view === 'who' || state.view === 'coh' ? state.view : 'dyn';
  var body, bodyCls, title;
  if (view === 'who') {
    body = freqStripHtml(busList()) + '<div class="' + N + '-list-zone">' + listZoneHtml() + '</div>';
    bodyCls = 'tbl-wrap'; title = 'Кто смотрит';
  } else if (view === 'dyn') {
    body = dynamicsHtml(MODEL.ts, MODEL.grain, {});
    bodyCls = 'dyn-wrap'; title = 'Динамика';
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
    '<div class="' + N + '-h-txt"><span>' + esc(title) + ' · <span class="' + N + '-h-area"' + tip({ title: 'Область', text: ai.text }) + '>' +
      esc(ai.mut ? 'весь Proteus' : ai.pill) + '</span></span>' +
      '<span class="sub">' + (view === 'who'
        ? 'клик по группе или человеку сузит каталог слева · Shift — несколько'
        : (view === 'dyn' ? 'клик по строке каталога задаёт область' : 'когорты первого визита; период на них не действует')) + '</span></div>' +
    '<div class="' + N + '-sub-tabs" role="tablist">' + tabsHtml('view', tabs) + '</div>' +
    '</div>');
  h.push('<div class="' + N + '-panel-b ' + bodyCls + '">' + body + '</div>');
  h.push('</div>');
  h.push('</div>');
  return buildCSS() + h.join('');
}

// --- ТАБ «ДИНАМИКА»: порт SVG-чартов из тела 788805 (строки 1336–1536) -----
// Правила из шапки charts.js: ось значений от нуля, урезать нельзя; оси Y нет,
// значения подписаны у марок; столкнувшиеся подписи скрываются (шаг показа);
// зазор между панелями = STACK_GAP. Резиновость через viewBox + width:100%.
var SVG_W = 760;
// Высота динамики под ячейку чарта: меряется ПОСЛЕ монтажа (как SVG_W) и
// делится между стеком пользователей (60%) и просмотрами (40%). 0 — дефолт.
var DYN_H = 0;
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
var COH_H = 0;
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
    var segs = [
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
      '" style="paint-order:stroke;stroke:#fff;stroke-width:3px">' + esc(compact(aU)) + '</text>';
    bk.push({ k: p.k, u: p.users, nu: p.new_u, re: p.react_u, rt: p.ret, v: p.views });
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
    'new': 'Впервые открыли отчёты области ' + P[0] + ': раньше (за всю историю, около года) не заходили ни разу.',
    react: 'Заходили когда-то раньше, но ' + P[1] + ' не открывали — вернулись ' + P[0] + ' после паузы.',
    ret: 'Заходили ' + P[0] + ' ' + P[2] + ' — ядро, смотрят без перерыва.'
  };
  for (var i = 0; i < leg.length; i++) {
    h += '<button class="' + CFG.ns + '-leg' + (off[leg[i].k] ? ' off' : '') + '" data-leg="' + leg[i].k + '" type="button"' +
      tip({ title: leg[i].l, text: legDef[leg[i].k], note: off[leg[i].k] ? 'Клик — вернуть ступень на график' : 'Клик — убрать ступень с графика' }) + '>' +
      '<i style="background:' + leg[i].c + '"></i>' + esc(leg[i].l) + '</button>';
  }
  h += '</div></div>';
  h += usersChartSvg(ts, grain);
  h += '<div class="' + CFG.ns + '-dynhead"><span class="' + CFG.ns + '-cap">Просмотры</span>' +
    '<div class="' + CFG.ns + '-sub-tabs tiny" role="tablist">' +
    tabsHtml('viewsMode', [
      { key: 'total', label: 'Всего', on: state.viewsMode !== 'per' },
      { key: 'per', label: 'На пользователя', on: state.viewsMode === 'per' }
    ]) + '</div></div>';
  h += viewsChartSvg(ts, grain);
  return h;
}

// Содержимое следящего тултипа динамики: бакет из data-bk по индексу колонки.
function dynTipHtml(el, i) {
  var bk = el.__bk ? el.__bk[i] : null;
  if (!bk) return '';
  var C = CFG.colors, off = state.legendOff;
  var grain = el.getAttribute('data-grain') || MODEL.grain;
  var bt = bucketTitle(tsDate(bk.k, grain), grain);
  if (el.getAttribute('data-dyn') === 'views') {
    var per = el.getAttribute('data-pu') === '1';
    var rowsV = [{ label: per ? 'На пользователя' : 'Просмотры', value: per ? nf(bk.u ? bk.v / bk.u : 0, 1) : compact(bk.v), color: C.views }];
    if (per) rowsV.push({ label: 'Просмотров всего', value: nf(bk.v), dash: true, color: C.bench });
    return tipHtml({ title: bt, rows: rowsV });
  }
  var rows = [{ label: 'Всего', value: nf(bk.u) }];
  if (!off.new) rows.push({ label: 'Новые', value: nf(bk.nu) + ' · ' + pct(bk.u ? bk.nu / bk.u * 100 : 0, 0), color: C.new });
  if (!off.react) rows.push({ label: 'Вернувшиеся', value: nf(bk.re), color: C.react });
  if (!off.ret) rows.push({ label: 'Продолжающие', value: nf(bk.rt), color: C.ret });
  return tipHtml({ title: bt, rows: rows });
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
      avail = Math.max(360, Math.floor(avail));
      if (Math.abs(avail - DYN_H) <= 4) return false;
      DYN_H = avail;
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
      COH_H = avail;
      return true;
    }
    function syncSvgWidth() {
      var svgs = overlay.querySelectorAll('svg[data-dyn-svg]');
      if (!svgs.length) return false;
      var w = svgs[0].clientWidth || 0;
      if (!w || Math.abs(w - SVG_W) <= 2) return false;
      SVG_W = w;
      return true;
    }
    function render() {
      // overlay — скролл-контейнер: без сохранения позиции клик внизу прыгал наверх.
      var st = overlay.scrollTop, sl = overlay.scrollLeft;
      ANIM = MODEL.sig !== state.animSig;     // новые данные → анимация только в этом рендере
      state.animSig = MODEL.sig;
      overlay.innerHTML = buildHTML();
      var ch1 = syncSvgWidth(), ch2 = syncDynH(), ch3 = syncCohH();
      if (ch1 || ch2 || ch3) overlay.innerHTML = buildHTML();
      if (ANIM) animateIn(overlay);
      ANIM = false;
      overlay.scrollTop = st;
      overlay.scrollLeft = sl;
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
      if (pk.org.length) fl.push({ column: 'org_f', operator: 'IN', value: pk.org.slice() });
      if (pk.spec.length) fl.push({ column: 'spec_f', operator: 'IN', value: pk.spec.slice() });
      if (pk.stream.length) fl.push({ column: 'stream_f', operator: 'IN', value: pk.stream.slice() });
      if (pk.adgroup.length) fl.push({ column: 'adg_f', operator: 'IN', value: pk.adgroup.slice() });
      // heads_f: '1' — только руководители (настройка или группа «Тим-лиды»),
      // 'n' — только группа «Остальные»; обе группы сразу = без условия.
      var hv = state.headsOnly ? '1' : (pk.heads.length === 1 ? (pk.heads[0] === 'Тим-лиды' ? '1' : 'n') : '');
      if (hv) fl.push({ column: 'heads_f', operator: 'IN', value: [hv] });
      if (pk.login.length) fl.push({ column: 'login_f', operator: 'IN', value: pk.login.slice() });
      // Исключённые логины настроек списка — выпадают и из каталога, и из шапки.
      if (state.excl.length) fl.push({ column: 'exl_f', operator: 'IN', value: state.excl.slice() });
      if (state.freqSel) fl.push({ column: 'freq_f', operator: 'IN', value: [state.freqSel] });
      return fl;
    }
    function emitBus() {
      if (typeof applyCrossFilter !== 'function') return;
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
          state.freqSel = null; state.headsOnly = false; state.excl = [];
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
      var tab = trigger(e.target, 'data-view');
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
    state.onWinResize = function () { var w = syncSvgWidth(), hh = syncDynH(), ch = syncCohH(); if (w || hh || ch) render(); if (state.tip) renderTip(); };
    window.addEventListener('resize', state.onWinResize);

    render();

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
