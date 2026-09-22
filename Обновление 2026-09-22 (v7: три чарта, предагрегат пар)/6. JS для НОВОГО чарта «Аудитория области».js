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
//   Пишет: людскую шину (lvl3_f/lvl4_f/spec_f/stream_f/adg_f/heads_f/login_f/
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
    g: ['lvl3', 'lvl4', 'spec', 'stream', 'head', 'dep', 'adg'],
    bin: [1, 2, 3, 4, 5],
    is_head: [1, 0]
  },
  // Вкладки панели: люди → время → удержание.
  views: [
    { key: 'who', label: 'Кто смотрит' },
    { key: 'dyn', label: 'Динамика' },
    { key: 'coh', label: 'Закрепляемость' }
  ],
  // Группировки поимённого списка (макет app.js WHO_GROUPS, дословно).
  groups: [
    { key: 'none', label: 'Без группировки' }, { key: 'lvl3', label: 'УС-3' },
    { key: 'lvl4', label: 'Департамент' }, { key: 'spec', label: 'Специализация' },
    { key: 'stream', label: 'Стрим' }, { key: 'adgroup', label: 'AD-группа' },
    { key: 'heads', label: 'Тим-лиды' }
  ],
  // Грануляция периода задаётся полоской (period_param); датасет возвращает
  // её в area-строке (parent). prev — есть ли в 13 месяцах истории полный
  // предыдущий период той же длины (m: 24 мес., q: 16 кв. — нет).
  grains: {
    d: { n: 30, unit: 'день',    units: 'дней',     label: 'за 30 дней',    vs: 'к пред. 30 дням',     prev: true },
    w: { n: 20, unit: 'неделя',  units: 'недель',   label: 'за 20 недель',  vs: 'к пред. 20 неделям',  prev: true },
    m: { n: 12, unit: 'месяц',   units: 'месяцев',  label: 'за 12 месяцев', vs: 'к пред. 12 месяцам',  prev: false },
    q: { n: 8,  unit: 'квартал', units: 'кварталов', label: 'за 8 кварталов', vs: 'к пред. 8 кварталам', prev: false }
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
    act: '#0073A0',            // активный тон интерфейса
    ret: '#5CC0EE',            // продолжающие — светлая ступень стека
    react: '#AA77FF',          // вернувшиеся
    new: '#0073A0',            // новые — основание стека
    views: '#5b6478',          // просмотры: вторая панель
    bench: '#c7c8cc',
    label: '#2b2b2b', axis: '#808080', axisLine: 'rgb(155, 164, 181)',
    split: '#f0f1f3', txt: '#3a3f4a', mut: '#8a909c',
    // Корзины частоты (макет FREQ_COLORS, app.js 71): светлая → тёмная.
    freq: ['#c3e6f7', '#8fd0ea', '#5cc0ee', '#2ba8c6', '#0073a0']
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
  // Показ поимённого списка: первые N строк области (в ответе — топ-2000).
  listShow: 60
};

// ---------- БЛОК 2: ВХОД + СОСТОЯНИЕ + ХЕЛПЕРЫ ----------
// ВСЕ строки data, не data[0].
var rawData = (typeof data !== 'undefined' && Array.isArray(data)) ? data : [];

// Состояние переживает перерисовку Proteus.
// Для таблиц с поиском/сортировкой/пагинацией имена ключей бери из TABLES.md,
// чтобы правки разных сессий не расходились.
if (!window.__pvtState) window.__pvtState = {};
var __S = window.__pvtState;
// Дефолты: вкладка «Кто смотрит» — главный вход в людскую шину.
if (!__S[CFG.ns]) __S[CFG.ns] = {
  tip: null,
  view: 'who',               // вкладка панели: who | dyn | coh
  q: '',                     // поиск «Имя или логин»
  whoCut: 'none',            // группировка поимённого списка
  grpClosed: {},             // свёрнутые группы дерева (ключ → true)
  freqSel: null,             // корзина частоты: '1'..'5' | null
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
  picks: { lvl3: [], lvl4: [], spec: [], stream: [], adgroup: [], heads: [], login: [] }
};
var state = __S[CFG.ns];

// Массив из data приходит и массивом, и JSON-строкой '[1,2,3]'.
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
  var out = '';
  for (var i = 0; i < ts.length; i++) {
    var L = calLabel(ts, i, grain), x = r1(xOf(i));
    out += '<text x="' + x + '" y="' + (y0 + 12) + '" font-size="10.5" text-anchor="middle" font-weight="' + (L.bold ? 700 : 400) +
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
  // Склонение по ВЕРХНЕЙ границе диапазона: «2–3 дня», «8–15 дней», «16+ дней».
  var rg = function (a, b) { return a + THIN + '–' + THIN + b + ' ' + plural(b, f[0], f[1], f[2]); };
  return ['1 ' + f[0], rg(2, 3), rg(4, 7), rg(8, 15), '16+ ' + f[2]];
}

// Сегмент человека по корзине (макет data.js SEG_OF: ≥8 Постоянный, ≥2
// Эпизодический, иначе Разовый; в чарт приходит уже готовый bin).
function segOf(bin) {
  if (bin >= 4) return { key: 'Постоянный', cls: 'good' };
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
//   ctx   — группы людей области (g = lvl3/lvl4/dep/spec/stream/head/adg);
//   list  — поимённый список (топ-2000 по активным дням);
//   ts    — динамика: k = возраст бакета, users / new_u / react_u / views;
//   coh   — когорты: k = месяц первого визита, cnt = размер, ages/acts.
function buildModel() {
  var F = CFG.fields, i, r;
  var m = {
    grain: 'd', area: { mode: '', sel: [], name: '' }, kpi: null,
    ts: [], total: 0, freqCtx: {}, labels: freqLabels('d'),
    ctx: { lvl3: {}, lvl4: {}, spec: {}, stream: {}, head: {} },
    dep: [], adg: [], list: [], rows: [], coh: []
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
      // Счётчик группы — люди, активные в ТЕКУЩЕМ периоде (users); строки
      // «только предыдущий период» (users = 0) в дерево не попадают.
      var gg = String(r[F.g] || ''), kk = String(r[F.k] || ''), cc = num(r[F.users]) || 0;
      if (!cc) continue;
      if (gg === 'dep') {
        m.dep.push({ k: kk, parent: String(r[F.parent] || ''), cnt: cc });
      } else if (gg === 'adg') {
        m.adg.push({ k: kk, cnt: cc });
      } else if (m.ctx[gg]) {
        m.ctx[gg][kk] = cc;
      }
    } else if (sec === 'list') {
      var bin = num(r[F.bin]) || 1;
      var seg = segOf(bin);
      m.list.push({
        login: String(r[F.login] || ''),
        fio: String(r[F.fio] || ''),
        lvl3: String(r[F.lvl3] || ''),
        lvl4: String(r[F.lvl4] || ''),
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
  m.dep.sort(function (a, b) { return b.cnt - a.cnt; });
  m.adg.sort(function (a, b) { return b.cnt - a.cnt; });
  m.coh.sort(function (a, b) { return (a.month.y - b.month.y) * 12 + (a.month.m - b.month.m); });
  m.rows = m.list;
  return m;
}
var MODEL = buildModel();

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
function monthName(t) { return t ? MONTHS_FULL[t.m] + ' ' + t.y : '—'; }
// Последний ЗАКРЫТЫЙ месяц относительно даты свежести (витрина за вчера):
// back = 1 — прошлый месяц, 2 — позапрошлый.
function closedMonth(back) {
  var now = new Date(Date.now() - 86400000);
  var dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: 1 };
}

// Дельта-бейдж KPI (порт из тела v6): зелёный рост / красное падение /
// серая мёртвая зона; без предыдущего периода — «не сравнивается».
function delta(v, opts) {
  var o = opts || {};
  if (v == null || !isFinite(v)) {
    return '<span class="' + CFG.ns + '-nocmp"' + tip({ title: 'Сравнение', text: o.why || 'Не с чем сравнивать: нет предыдущего периода.' }) + '>не сравнивается</span>';
  }
  var cls;
  if (Math.abs(v) < (o.dead == null ? 0.05 : o.dead)) cls = 'flat';
  else cls = (v > 0) === !o.invert ? 'up' : 'down';
  var vs = o.vs ? '<span class="' + CFG.ns + '-d-vs">' + esc(o.vs) + '</span>' : '';
  return '<span class="' + CFG.ns + '-delta ' + CFG.ns + '-' + cls + '"' + (o.tip ? tip(o.tip) : '') + '>' +
    signed(v, o.dec == null ? 1 : o.dec, o.unit || '') + vs + '</span>';
}

// «Что видно в данных»: пороговый отбор фактов по KPI области; каждый факт
// называет свой порог. Числа — точные (люди области, не сумма отчётов).
function obsArea(k, what, grain) {
  var out = [];
  if (!k || !k.users) return out;
  var G = CFG.grains[grain];
  var dU = G.prev && k.users_prev ? (k.users / k.users_prev - 1) * 100 : null;
  var shNew = k.new_u / k.users * 100;
  var shReg = k.regular / k.users * 100;
  var shGone = k.users_prev ? k.sleeping / k.users_prev * 100 : null;
  if (dU != null && Math.abs(dU) >= 10) {
    out.push({ sev: dU > 0 ? 'good' : 'high',
      lead: 'Пользователей ' + (dU > 0 ? 'больше' : 'меньше') + ' на ' + pct(Math.abs(dU)) + ' ' + G.vs,
      body: esc(what) + ': за период <b>' + nf(k.users) + '</b> пользователей против <b>' + nf(k.users_prev) +
        '</b> в предыдущем — изменение <b>' + signed(dU, 1, '%') + '</b>.',
      rule: 'изменение к предыдущему периоду ≥10%' });
  }
  if (shNew >= 22) {
    out.push({ sev: 'good',
      lead: 'Новые дают ' + pct(shNew) + ' аудитории',
      body: 'Из <b>' + nf(k.users) + '</b> пользователей <b>' + nf(k.new_u) + '</b> пришли впервые. ' +
        'Рост идёт за счёт притока, а не за счёт того, что прежние стали ходить чаще.',
      rule: 'доля новых ≥22%' });
  }
  if (G.prev && shGone != null && shGone >= 15) {
    out.push({ sev: 'mid',
      lead: nf(k.sleeping) + ' ' + plural(k.sleeping, 'человек', 'человека', 'человек') + ' прошлого периода не вернулись',
      body: '<b>' + nf(k.sleeping) + '</b> из <b>' + nf(k.users_prev) + '</b> зрителей предыдущего периода (<b>' + pct(shGone) +
        '</b>) в текущем не заходили. Это те, кого уже привели — и потеряли.',
      rule: 'доля ушедших ≥15% аудитории прошлого периода' });
  }
  if (shReg < 25) {
    out.push({ sev: 'mid',
      lead: 'Постоянных пользователей ' + pct(shReg) + ' — меньше четверти',
      body: 'Только <b>' + nf(k.regular) + '</b> человек заходили 8 и более ' + G.units + ' за период. Остальные — эпизодически.',
      rule: 'доля постоянных <25%' });
  }
  var ord = { high: 0, mid: 1, good: 2, none: 3 };
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
    '  --ink:#1f1f1f;--ink2:#3a3f4a;--muted:#8a909c;--muted2:#aab0bb;',
    '  --green:#12b048;--green-bg:#bff2cd;--green-tx:#0a8f3c;',
    '  --red:#f51f1f;--red-bg:#ffcccc;--red-tx:#d11414;',
    '  --blue:#0b57d0;--act:#0073A0;--act-ink:#015A7D;--blue-bg:#E8F4F9;--act-line:#C4E2ED;',
    '  --fs-cap:10.5px;--fs-note:11.5px;--fs-body:12.5px;--fs-lead:13.5px;',
    '  --chart-gap:' + CFG.spacing.stackGap + 'px;color-scheme:light;}',
    P + '-root *{box-sizing:border-box;font-family:inherit;}',

    // ── Панель ──
    P + '-panel{background:var(--card);border-radius:12px;overflow:hidden;flex:1;min-height:0;display:flex;flex-direction:column;}',
    P + '-panel-h{padding:14px 16px;font-weight:700;font-size:14.5px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:0 0 auto;}',
    P + '-panel-h .sub{font-size:var(--fs-note);color:var(--muted);font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    P + '-h-txt{display:flex;flex-direction:column;gap:2px;min-width:0;}',
    P + '-h-txt .sub b{color:var(--ink2);font-weight:600;}',
    P + '-panel-h .sub-tabs{margin:0 0 0 auto;flex:0 0 auto;}',
    P + '-panel-b{padding:14px 16px;flex:1;min-height:0;}',
    P + '-panel-b.tbl-wrap{padding-top:0;padding-bottom:0;display:flex;flex-direction:column;}',
    P + '-panel-b.dyn-wrap{overflow:auto;display:flex;flex-direction:column;gap:var(--chart-gap);}',
    P + '-panel-b.dyn-wrap > svg{flex:0 0 auto;}',
    // Поиск живёт ПОД переключателем (макет rightUnder): прибит вправо,
    // не ездит от подзаголовка и группировки.
    P + '-under{display:flex;justify-content:flex-end;padding:0 16px 10px;flex:0 0 auto;}',

    // ── Вкладки панели ──
    P + '-sub-tabs{display:inline-flex;gap:3px;background:#eef0f3;border-radius:12px;padding:3px;margin:0;flex-wrap:wrap;}',
    P + '-sub-tab{border:0;background:transparent;padding:6px 12px;border-radius:9px;font-size:var(--fs-note);color:var(--muted);cursor:pointer;font-weight:500;font-family:inherit;}',
    P + '-sub-tab:hover{color:var(--ink2);}',
    P + '-sub-tab.active{background:var(--card);color:var(--ink);}',
    P + '-sub-tabs.tiny{border-radius:9px;padding:2px;}',
    P + '-sub-tabs.tiny ' + P + '-sub-tab{padding:2px 8px;font-size:var(--fs-note);border-radius:6px;}',

    // ── Поиск ──
    P + '-psearch{position:relative;flex:0 0 auto;color:var(--muted);}',
    P + '-psearch input{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:5px 12px 5px 28px;font-size:12px;color:var(--ink);width:190px;font-family:inherit;}',
    P + '-psearch input:focus{outline:none;border-color:var(--act);}',
    P + '-psearch svg{position:absolute;left:9px;top:50%;transform:translateY(-50%);pointer-events:none;}',

    // ── Сигаретка частоты (app.css .segstrip.freq) ──
    P + '-segstrip{display:flex;gap:6px;margin-bottom:10px;min-width:0;}',
    P + '-seg-part{flex:1 1 0;min-width:66px;border:0;background:transparent;padding:0;',
    '  cursor:pointer;font-family:inherit;text-align:left;display:flex;',
    '  flex-direction:column;gap:3px;transition:opacity .15s;}',
    P + '-seg-part .sp-bar{display:block;height:10px;border-radius:2px;}',
    P + '-seg-part .sp-v{font-size:var(--fs-body);font-weight:700;color:var(--ink);',
    '  font-variant-numeric:tabular-nums;line-height:1.1;}',
    P + '-seg-part .sp-p{font-style:normal;font-weight:400;color:var(--muted);}',
    P + '-seg-part .sp-l{font-size:var(--fs-cap);color:var(--muted);font-weight:500;',
    '  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    P + '-seg-part:hover .sp-l{color:var(--ink2);}',
    P + '-seg-part.off{opacity:.42;}',
    P + '-seg-part.on .sp-l{color:var(--ink);font-weight:600;}',
    P + '-seg-part.on .sp-bar{box-shadow:0 0 0 2px var(--card),0 0 0 3px var(--ink2);}',

    // ── Тулбар «Кто смотрит» ──
    P + '-who-bar{display:flex;align-items:center;gap:8px;flex:0 0 auto;flex-wrap:wrap;',
    '  margin-bottom:8px;}',
    P + '-who-cnt{font-size:var(--fs-note);color:var(--muted);font-weight:400;margin-left:auto;}',
    P + '-who-cnt b{color:var(--ink2);font-weight:600;}',
    P + '-who-cnt .who-sel{color:var(--act-ink);font-weight:600;cursor:help;}',

    // ── Дропдауны (app.css .dd) ──
    P + '-dd{position:relative;min-width:0;}',
    P + '-dd-trg{display:flex;align-items:center;gap:6px;width:100%;border:1px solid var(--line);',
    '  background:var(--card);border-radius:9px;padding:6px 10px;font-size:12px;font-weight:500;',
    '  color:var(--ink2);cursor:pointer;font-family:inherit;}',
    P + '-dd-trg:hover{border-color:#d8dce4;}',
    P + '-dd.open ' + P + '-dd-trg{border-color:var(--act);}',
    P + '-dd-txt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    P + '-dd-c{flex:0 0 auto;color:var(--muted2);font-size:10px;transition:transform .16s;}',
    P + '-dd.open ' + P + '-dd-c{transform:rotate(180deg);}',
    P + '-dd-body{position:absolute;z-index:40;top:calc(100% + 4px);left:0;min-width:100%;',
    '  background:var(--card);border:1px solid var(--line);border-radius:9px;padding:4px;',
    '  box-shadow:0 10px 30px rgba(24,33,50,.14),0 2px 6px rgba(24,33,50,.06);}',
    P + '-dd.sm ' + P + '-dd-trg{padding:5px 9px;font-size:12px;}',
    P + '-dd.sm ' + P + '-dd-body{right:0;left:auto;}',
    P + '-who-bar ' + P + '-dd ' + P + '-dd-body{left:0;right:auto;}',
    P + '-dd-opt{border:0;background:transparent;border-radius:7px;display:flex;width:100%;',
    '  text-align:left;padding:6px 9px;font-size:12px;font-weight:400;color:var(--ink2);',
    '  cursor:pointer;font-family:inherit;white-space:nowrap;}',
    P + '-dd-opt:hover{background:#f4f6f9;color:var(--ink);}',
    P + '-dd-opt.on{background:var(--blue-bg);color:var(--act-ink);font-weight:600;}',

    // ── Настройки списка (поповер) ──
    P + '-who-opts ' + P + '-dd-trg{width:auto;}',
    P + '-who-opts-pop{min-width:256px;padding:10px;display:flex;flex-direction:column;gap:8px;}',
    P + '-who-opts-pop ' + P + '-psearch input{width:100%;}',
    P + '-wo-h{font-size:11px;font-weight:600;color:var(--muted);',
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
    P + '-btn{border:1px solid var(--line);background:var(--card);border-radius:9px;padding:6px 12px;',
    '  font-size:12px;font-weight:500;color:var(--ink2);cursor:pointer;font-family:inherit;}',
    P + '-btn:hover{background:#fafbfc;border-color:#d8dce4;}',
    P + '-btn.ghost{border-color:transparent;color:var(--blue);}',
    P + '-btn.ghost:hover{background:var(--blue-bg);}',
    P + '-btn.xs{padding:3px 8px;font-size:11px;}',

    // ── Таблица людей ──
    P + '-tbl-scroll{flex:1 1 auto;min-height:0;overflow:auto;}',
    P + '-ptable{width:100%;border-collapse:collapse;font-size:var(--fs-body);}',
    P + '-ptable th{font-size:var(--fs-cap);text-transform:uppercase;letter-spacing:.3px;color:var(--muted);font-weight:600;text-align:right;padding:8px;position:sticky;top:0;z-index:3;background:var(--card);border-bottom:1px solid var(--line2);}',
    P + '-ptable th.txt{text-align:left;padding-left:10px;}',
    P + '-ptable td{text-align:right;padding:8px;font-weight:400;color:var(--ink2);border-bottom:1px solid var(--line2);white-space:nowrap;}',
    P + '-ptable td.txt{text-align:left;font-weight:600;color:var(--ink);padding-left:10px;white-space:normal;min-width:0;}',
    P + '-ptable td.lead{font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums;}',
    P + '-ptable td .mut{color:var(--muted);font-weight:400;}',
    P + '-ptable.dense th{padding:8px 6px;font-size:var(--fs-cap);}',
    P + '-ptable.dense td{padding:7px 6px;}',
    P + '-ptable tr.grp-h td{padding:6px 10px;font-weight:600;color:var(--ink);',
    '  background:#f4f6f9;text-align:left;}',
    P + '-ptable tr.grp-h:hover td{background:#eef2f7;}',
    P + '-ptable tr.grp-h.blk td,' + P + '-ptable tr.grp-h.flat td{padding-left:6px;}',
    P + '-ptable tr.grp-h.blk td{font-weight:700;}',
    P + '-ptable tr.grp-h.dep td{padding-left:30px;}',
    P + '-ptable tr.grp-child>td:first-child{padding-left:30px;}',
    P + '-ptable tr.grp-child.deep>td:first-child{padding-left:54px;}',
    P + '-ptable tr.grp-h{cursor:pointer;}',
    P + '-ptable tr.grp-h.sel td{background:var(--blue-bg);}',
    P + '-ptable tr.grp-h.sel .gh-name{color:var(--act-ink);}',
    P + '-ptable tr.grp-h.grp-dim .gh-name{color:var(--muted);font-weight:400;}',
    P + '-ptable tr.grp-h.grp-dim .gh-cnt{opacity:.75;}',
    P + '-ptable tr.pk{cursor:pointer;}',
    P + '-ptable tr.pk:hover{background:#fafbfc;}',
    P + '-ptable tr.pk.sel td{background:var(--blue-bg);}',
    P + '-ptable tr.pk.sel td:first-child{box-shadow:inset 3px 0 0 var(--act);}',
    P + '-gh-caret{border:0;background:transparent;color:var(--muted);cursor:pointer;',
    '  font-size:10px;width:18px;padding:0;font-family:inherit;line-height:1;}',
    P + '-gh-caret:hover{color:var(--ink);}',
    P + '-gh-name{font:inherit;font-weight:600;color:var(--ink);}',
    P + '-gh-cnt{margin-left:8px;color:var(--muted);font-weight:400;font-size:var(--fs-note);}',
    P + '-unit-sub{display:block;font-size:var(--fs-cap);color:var(--muted);font-weight:400;margin-top:2px;overflow:hidden;text-overflow:ellipsis;}',
    P + '-rflag{display:inline-block;margin-right:5px;font-size:9px;font-weight:600;border-radius:4px;padding:1px 5px;vertical-align:1px;}',
    P + '-rflag.head{background:#f3ecff;color:#6b3fd4;}',
    P + '-sig-chip{display:inline-block;font-size:11px;font-weight:600;',
    '  border-radius:999px;padding:2px 9px;}',
    P + '-sig-chip.good{background:var(--green-bg);color:var(--green-tx);}',
    P + '-sig-chip.note{background:var(--blue-bg);color:var(--act-ink);}',
    P + '-sig-chip.neutral{background:#f3f4f6;color:var(--muted);}',
    P + '-tbl-note{margin-top:8px;font-size:var(--fs-note);color:var(--muted);line-height:1.5;flex:0 0 auto;}',

    // ── Динамика: каптионы и легенда стека ──
    P + '-dynhead{display:flex;align-items:center;gap:12px;min-height:24px;flex-wrap:wrap;row-gap:4px;}',
    P + '-cap{font-size:var(--fs-cap);text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:600;}',
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
    P + '-tip ' + P + '-t-h{display:block;font-size:10px;font-weight:600;letter-spacing:.3px;text-transform:uppercase;color:#8a909c;margin-bottom:5px;}',
    P + '-tip ' + P + '-t-x{display:block;font-size:11.5px;color:#3a3f4a;line-height:1.4;}',
    P + '-tip ' + P + '-t-r{display:flex;align-items:center;gap:6px;margin-top:3px;min-width:118px;}',
    P + '-tip ' + P + '-t-m{display:inline-block;flex:0 0 auto;width:10px;height:9px;border-radius:3px;}',
    P + '-tip ' + P + '-t-m.' + CFG.ns + '-dash{height:0;width:14px;border-radius:0;border-top:2px dashed;background:none;}',
    P + '-tip ' + P + '-t-l{font-size:11px;font-weight:500;color:#8a909c;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    P + '-tip ' + P + '-t-v{margin:0 0 0 auto;font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums;color:#1f1f1f;}',
    P + '-tip ' + P + '-t-r.' + CFG.ns + '-bench ' + P + '-t-v{color:#8a909c;font-weight:500;}',
    P + '-tip ' + P + '-t-n{display:block;font-size:10.5px;line-height:1.35;font-weight:400;color:#8a909c;margin-top:6px;padding-top:5px;border-top:1px solid #eef0f3;}',

    // ── Шапка панели: заголовок, область, свежесть ──
    P + '-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:0 0 12px;flex:0 0 auto;}',
    P + '-head h2{margin:0;font-size:19px;font-weight:700;letter-spacing:-.3px;color:var(--ink);}',
    P + '-pill{display:inline-flex;align-items:center;gap:7px;border-radius:999px;background:var(--blue-bg);',
    '  border:1px solid var(--act-line);padding:3px 11px;font-size:var(--fs-note);color:var(--act-ink);font-weight:600;',
    '  max-width:420px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:help;}',
    P + '-pill.mut{background:#f0f1f3;border-color:var(--line2);color:var(--muted);font-weight:500;}',
    P + '-pill.ppl{background:#f3ecff;border-color:#e2d4ff;color:#5a2fc2;}',
    P + '-fresh{font-size:var(--fs-note);color:var(--muted);font-weight:500;display:inline-flex;align-items:center;gap:7px;margin-left:auto;}',
    P + '-fresh b{color:var(--ink2);font-weight:600;}',
    P + '-fresh i{width:7px;height:7px;border-radius:50%;background:var(--green);display:inline-block;}',

    // ── KPI области (порт из тела v6) ──
    P + '-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:12px;flex:0 0 auto;}',
    P + '-kpi{background:var(--card);border-radius:12px;padding:13px 15px;}',
    P + '-k-label{font-size:var(--fs-note);color:var(--muted);font-weight:600;display:flex;align-items:center;gap:6px;}',
    P + '-k-val{font-size:24px;font-weight:700;letter-spacing:-.5px;line-height:1.1;color:var(--ink);margin-top:4px;font-variant-numeric:tabular-nums;}',
    P + '-k-row{display:flex;align-items:center;gap:9px;margin-top:8px;flex-wrap:wrap;}',
    P + '-k-row:empty{margin:0;}',
    P + '-k-sub{font-size:var(--fs-note);color:var(--muted);font-weight:500;}',
    P + '-k-sub b{color:var(--ink2);font-weight:600;}',
    P + '-info{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;border:1px solid var(--line);color:var(--muted);font-size:9px;font-weight:600;cursor:help;flex:0 0 auto;}',
    P + '-delta{display:inline-flex;align-items:center;gap:5px;font-size:var(--fs-note);font-weight:600;border-radius:999px;padding:3px 9px;}',
    P + '-d-vs{font-weight:500;font-size:var(--fs-cap);opacity:.75;}',
    P + '-up{background:var(--green-bg);color:var(--green-tx);}',
    P + '-down{background:var(--red-bg);color:var(--red-tx);}',
    P + '-flat{background:#f0f1f3;color:var(--muted);}',
    P + '-nocmp{display:inline-block;font-size:11px;font-weight:500;color:var(--muted);cursor:help;border-bottom:1px dotted var(--muted2);}',

    // ── «Что видно в данных» ──
    P + '-obs{border-radius:12px;margin:0 0 12px;overflow:visible;border:1px solid var(--line2);flex:0 0 auto;}',
    P + '-obs.sev-high{background:linear-gradient(103deg,#ffeef0 0%,#fdf3f6 38%,#faf7ff 78%,#fcfcfe 100%);}',
    P + '-obs.sev-mid{background:linear-gradient(103deg,#fff5e3 0%,#fdf6ef 38%,#faf7ff 78%,#fcfcfe 100%);}',
    P + '-obs.sev-good{background:linear-gradient(103deg,#e9f9ef 0%,#f4f9f6 38%,#faf8ff 78%,#fcfcfe 100%);}',
    P + '-obs-h{display:flex;align-items:center;gap:10px;padding:10px 15px;cursor:pointer;user-select:none;}',
    P + '-obs-ico{width:22px;height:22px;border-radius:6px;background:rgba(255,255,255,.75);display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex:0 0 auto;}',
    P + '-obs.sev-high ' + P + '-obs-ico{color:var(--red-tx);}',
    P + '-obs.sev-mid ' + P + '-obs-ico{color:#9a6500;}',
    P + '-obs.sev-good ' + P + '-obs-ico{color:var(--green-tx);}',
    P + '-obs-t{font-size:13px;font-weight:600;color:var(--ink2);flex:0 0 auto;}',
    P + '-obs-lead{font-size:var(--fs-body);color:var(--ink2);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    P + '-obs-tag{font-size:11px;font-weight:600;padding:3px 9px;border-radius:6px;background:rgba(255,255,255,.55);flex:0 0 auto;}',
    P + '-obs-b{padding:0 15px 14px;font-size:13px;color:var(--ink2);line-height:1.55;}',
    P + '-obs-b ul{margin:8px 0 0;padding-left:20px;}',
    P + '-obs-b li{margin-bottom:5px;}',
    P + '-obs-b b{color:var(--ink);font-weight:600;}',
    P + '-obs-rule{display:block;font-size:var(--fs-note);color:var(--muted);margin-top:8px;padding-top:6px;border-top:1px solid var(--line2);}',
    P + '-no-insight{display:flex;align-items:center;gap:9px;font-size:var(--fs-body);color:var(--muted);background:var(--card);border:1px solid var(--line2);border-radius:12px;padding:10px 15px;margin-bottom:12px;flex:0 0 auto;}',
    P + '-ok-dot{width:8px;height:8px;border-radius:50%;background:var(--green);flex:0 0 auto;}',
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
    P + '-ct-cfg-l{font-size:var(--fs-cap);text-transform:uppercase;letter-spacing:.4px;color:var(--muted);font-weight:600;}',
    P + '-ct-cfg-n{font-size:var(--fs-cap);color:var(--muted2);font-weight:500;cursor:help;}',
    P + '-ct-wrap{overflow-x:auto;}',
    P + '-ct-wrap.band-on td' + P + '-ct-cell{opacity:.2;transition:opacity .1s;}',
    P + '-ct-wrap.band-on td' + P + '-ct-cell.band-hit{opacity:1;box-shadow:inset 0 0 0 1px rgba(31,31,31,.35);}',
    P + '-cttable{border-collapse:separate;border-spacing:2px;width:100%;font-size:var(--fs-body);}',
    P + '-cttable th,' + P + '-cttable td{border:0;white-space:nowrap;}',
    P + '-cttable th{font-size:var(--fs-cap);text-transform:uppercase;letter-spacing:.3px;color:var(--muted);font-weight:600;text-align:center;padding:4px 2px;}',
    P + '-cttable th.txt{text-align:left;padding-left:4px;}',
    P + '-ct-med{display:block;font-size:9.5px;font-weight:500;color:var(--muted2);margin-top:1px;}',
    P + '-cttable td.txt{font-weight:600;color:var(--ink);padding-left:4px;}',
    P + '-ct-sz{display:flex;align-items:center;gap:8px;}',
    P + '-ct-bar{flex:1;height:12px;background:#f1f3f6;border-radius:2px;overflow:hidden;}',
    P + '-ct-bar i{display:block;height:100%;border-radius:2px;background:' + CFG.colors.ret + ';min-width:2px;}',
    P + '-ct-sz b{font-weight:600;color:var(--ink2);font-variant-numeric:tabular-nums;}',
    P + '-ct-cell{text-align:center;padding:7px 3px;border-radius:6px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums;cursor:help;}',
    P + '-ct-cell.none{background:transparent !important;cursor:default;}',
    P + '-ct-cell.part{background:#f1f3f6 !important;font-style:italic;color:var(--muted);}',
    P + '-panel-h ' + P + '-under{padding:0;margin-left:auto;}',
    '</style>'
  ].join('\n');
}
// Только конкатенация строк. Все данные через esc().
// ВНИМАНИЕ: здесь префикс БЕЗ точки. var P = '.' + CFG.ns дал бы class=".pvt-root".

// ── Срезы списка (порядок макета: настройки → шина → корзина → поиск) ──
// adgroup-шина локально НЕ сужает: членства человек→AD-группа в ответе нет
// (хвост NOTES §6); каталог и динамику сужает сервер через adg_f.
function matchesPicks(p) {
  var pk = state.picks;
  if (pk.lvl3.length && pk.lvl3.indexOf(p.lvl3) < 0) return false;
  if (pk.lvl4.length && pk.lvl4.indexOf(p.lvl4) < 0) return false;
  if (pk.spec.length && pk.spec.indexOf(p.spec) < 0) return false;
  if (pk.stream.length && pk.stream.indexOf(p.stream) < 0) return false;
  if (pk.heads.length && !p.is_head) return false;
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

// Визит «вчера / N дн»: витрина за вчера, последняя возможная дата — вчера.
function lastVisitHtml(p) {
  if (!p.last_dt) return '<span class="mut">нет</span>';
  var now = new Date();
  var delta = Math.round((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    - Date.UTC(p.last_dt.y, p.last_dt.m, p.last_dt.d)) / 86400000);
  if (delta <= 1) return 'вчера';
  return daysFmt(delta);
}

// Строка человека (порт personRow, app.js 924–947).
function personRowHtml(p, indented, deep) {
  var on = state.picks.login.indexOf(p.login) >= 0;
  return '<tr class="' + (indented ? 'grp-child' + (deep ? ' deep' : '') : 'plain') + ' pk' + (on ? ' sel' : '') + '"' +
    ' data-who="' + esc(p.login) + '" data-whocut="login" tabindex="0" role="button" aria-pressed="' + on + '"' +
    tip({
      title: p.fio || p.login,
      rows: [
        { label: 'Активных дней', value: nf(p.days), color: CFG.colors.act },
        { label: 'Просмотров', value: p.views ? nf(p.views) : '—' },
        { label: 'Стаж в компании', value: p.exp || '—' }
      ],
      note: 'Клик сузит каталог слева до отчётов этого человека; Shift — добавить к выбору'
    }) + '>' +
    '<td class="txt">' + esc(p.fio || p.login) +
      (p.is_head ? ' <i class="' + CFG.ns + '-rflag head"' + tip({ text: 'Руководитель' }) + '>рук.</i>' : '') +
      '<span class="' + CFG.ns + '-unit-sub">' + esc(p.login) + '</span></td>' +
    '<td class="txt sec">' + esc(p.lvl3 || '—') + '<span class="' + CFG.ns + '-unit-sub">' + esc(p.spec || '—') + '</span></td>' +
    '<td class="txt">' + esc(p.exp || '—') + '</td>' +
    '<td class="lead">' + (p.days || '<span class="mut">0</span>') + '</td>' +
    '<td>' + lastVisitHtml(p) + '</td>' +
    '<td class="txt"><span class="' + CFG.ns + '-sig-chip ' + p.segCls + '">' + esc(p.seg) + '</span></td>' +
    '</tr>';
}

// Группировка видимого списка по разрезу (для «В текущей выборке»).
function byKeyLocal(list, cut) {
  var m = {};
  for (var i = 0; i < list.length; i++) {
    var kk = cut === 'heads' ? (list[i].is_head ? 'Тим-лиды' : 'Остальные') : String(list[i][cut] || '—');
    (m[kk] = m[kk] || []).push(list[i]);
  }
  return m;
}

// Контекст дерева (uN — счётчики ОБЛАСТИ с сервера; people не нужны).
function ctxGroups(cut) {
  var out = [], k;
  if (cut === 'adgroup') {
    for (var i = 0; i < MODEL.adg.length; i++) out.push({ key: MODEL.adg[i].k, uN: MODEL.adg[i].cnt });
  } else if (cut === 'heads') {
    var hd = MODEL.ctx.head['1'] || 0;
    out.push({ key: 'Тим-лиды', uN: hd });
    out.push({ key: 'Остальные', uN: Math.max(0, MODEL.total - hd) });
  } else {
    for (k in MODEL.ctx[cut]) {
      if (Object.prototype.hasOwnProperty.call(MODEL.ctx[cut], k)) out.push({ key: k, uN: MODEL.ctx[cut][k] });
    }
  }
  return out;
}

// Дерево групп (порт peopleGroupedRows, app.js 985–1049): контекстные
// счётчики — с сервера, «текущая выборка» — локальный список; группы
// с людьми наверх, пустые гаснут (grp-dim), но остаются кликабельными.
var WHO_TREE_KEYS = [];
function peopleRows(arr, deep, cap) {
  var out = '', n = Math.min(arr.length, cap.left);
  for (var i = 0; i < n; i++) out += personRowHtml(arr[i], true, deep);
  cap.left -= n;
  return out;
}
function grpRowHtml(key, cut, cls, stateKey, uN, cN, cap) {
  var sel = (state.picks[cut] || []).indexOf(String(key)) >= 0;
  var closed = !!state.grpClosed[stateKey];
  var dim = !sel && !cN;
  cap.keys.push(stateKey);
  return {
    closed: closed,
    html: '<tr class="grp-h ' + cls + (sel ? ' sel' : '') + (dim ? ' grp-dim' : '') + '"' +
      ' data-who="' + esc(key) + '" data-whocut="' + esc(cut) + '" tabindex="0" role="button" aria-pressed="' + sel + '"' +
      tip({
        title: key,
        rows: [{ label: 'Человек в области', value: nf(uN), color: CFG.colors.act },
          { label: 'Доля области', value: pct(uN / (MODEL.total || 1) * 100) }]
          .concat(cN !== uN ? [{ label: 'В текущей выборке', value: nf(cN) }] : []),
        note: dim
          ? 'В текущей выборке никого — клик сделает группу условием: каталог слева сузится'
          : 'Клик — людская шина: каталог слева сузится до отчётов этой публики; Shift добавит к выбору, повторный клик по единственной — снимет'
      }) + '>' +
      '<td colspan="6">' +
      '<button class="' + CFG.ns + '-gh-caret" data-whogrp="' + esc(stateKey) + '" aria-expanded="' + !closed + '"' +
        tip({ text: closed ? 'Раскрыть группу' : 'Свернуть группу' }) + ' aria-label="' + (closed ? 'Раскрыть' : 'Свернуть') + ' ' + esc(key) + '">' +
        (closed ? '▸' : '▾') + '</button>' +
      '<span class="' + CFG.ns + '-gh-name">' + esc(key) + '</span>' +
      '<span class="' + CFG.ns + '-gh-cnt">' + nf(uN) + ' ' + plural(uN, 'человек', 'человека', 'человек') +
        ' · ' + pct(uN / (MODEL.total || 1) * 100, 0) + '</span></td></tr>'
  };
}
function orderGroups(groups, cOf) {
  return groups.slice().sort(function (a, b) {
    var ca = (cOf(a.key) || []).length, cb = (cOf(b.key) || []).length;
    return (cb > 0 ? 1 : 0) - (ca > 0 ? 1 : 0) || cb - ca || b.uN - a.uN;
  });
}
function groupedRowsHtml(plist, cut) {
  var cap = { left: CFG.listShow, keys: [] };
  WHO_TREE_KEYS = cap.keys;
  var cFlat = byKeyLocal(plist, cut);
  var cN = function (key) { return (cFlat[key] || []).length; };
  var html = '';
  if (cut === 'lvl4') {
    // Двухуровневое дерево: lvl3-блок → lvl4-департамент → люди.
    var cBlk = byKeyLocal(plist, 'lvl3');
    var blocks = ctxGroups('lvl3');
    // Сортировка блоков — по людям текущей выборки, департаменты внутри.
    blocks.sort(function (a, b) { return (cBlk[b.key] || []).length - (cBlk[a.key] || []).length || b.uN - a.uN; });
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      var bh = grpRowHtml(b.key, 'lvl3', 'blk', 'B:' + b.key, b.uN, (cBlk[b.key] || []).length, cap);
      html += bh.html;
      if (bh.closed) continue;
      var deps = [];
      for (var j = 0; j < MODEL.dep.length; j++) {
        if (MODEL.dep[j].parent === b.key) deps.push({ key: MODEL.dep[j].k, uN: MODEL.dep[j].cnt });
      }
      deps = orderGroups(deps, function (key) { return cFlat[key] || []; });
      for (var d = 0; d < deps.length; d++) {
        var dh = grpRowHtml(deps[d].key, 'lvl4', 'dep', 'D:' + deps[d].key, deps[d].uN, cN(deps[d].key), cap);
        html += dh.html;
        if (!dh.closed && cN(deps[d].key) > 0) html += peopleRows(cFlat[deps[d].key] || [], true, cap);
      }
    }
    return html;
  }
  var groups = orderGroups(ctxGroups(cut), function (key) { return cFlat[key] || []; });
  for (var g = 0; g < groups.length; g++) {
    var gh = grpRowHtml(groups[g].key, cut, 'flat', 'G:' + groups[g].key, groups[g].uN, cN(groups[g].key), cap);
    html += gh.html;
    if (!gh.closed && cN(groups[g].key) > 0) html += peopleRows(cFlat[groups[g].key] || [], false, cap);
  }
  return html;
}

// Сигаретка частоты (порт freqStrip, app.js 1054–1076): числа — ПО СПИСКУ,
// клик и список всегда сходятся; контекст области живёт в тултипе.
function freqStripHtml(shown) {
  var tot = shown.length || 1;
  var n = CFG.grains[MODEL.grain] ? CFG.grains[MODEL.grain].n : 30;
  var h = '<div class="' + CFG.ns + '-segstrip freq" role="group" aria-label="Как часто заходят">';
  for (var i = 0; i < 5; i++) {
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
      '<span class="sp-v">' + nf(cnt) + '<i class="sp-p">· ' + pct(cnt / tot * 100, 0) + '</i></span>' +
      '<span class="sp-l">' + esc(MODEL.labels[i]) + '</span>' +
      '</button>';
  }
  return h + '</div>';
}

// Дропдаун (порт U.dropdown/ui.js): триггер — data-action="toggle"
// для дым-проверки поповеров, опции — data-ddopt.
function dropdownHtml(id, curKey, opts) {
  var cur = '';
  for (var i = 0; i < opts.length; i++) if (opts[i].key === curKey) cur = opts[i].label;
  var open = state.dd === id;
  var h = '<div class="' + CFG.ns + '-dd sm' + (open ? ' open' : '') + '">' +
    '<button class="' + CFG.ns + '-dd-trg" data-ddtoggle="' + esc(id) + '" data-action="toggle" aria-haspopup="true" aria-expanded="' + open + '" type="button">' +
      '<span class="' + CFG.ns + '-dd-txt">' + esc(cur) + '</span><span class="' + CFG.ns + '-dd-c" aria-hidden="true">▾</span>' +
    '</button>';
  if (open) {
    h += '<div class="' + CFG.ns + '-dd-body">';
    for (var o = 0; o < opts.length; o++) {
      h += '<button class="' + CFG.ns + '-dd-opt' + (opts[o].key === curKey ? ' on' : '') + '" data-ddopt="' + esc(id) +
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

// Поповер настроек списка (порт app.js 1103–1139): локальные условия,
// на каталог и динамику не действуют.
function optsDropHtml(area) {
  var open = state.dd === 'whoOpts';
  var active = state.headsOnly || state.excl.length;
  var h = '<div class="' + CFG.ns + '-dd sm ' + CFG.ns + '-who-opts' + (open ? ' open' : '') + '">' +
    '<button class="' + CFG.ns + '-dd-trg" data-ddtoggle="whoOpts" data-action="toggle" aria-haspopup="true" aria-expanded="' + open + '" type="button"' +
      tip({ title: 'Настройки списка', text: 'Локальные условия этого списка: только руководители и исключённые логины. На каталог не действуют.' }) + '>' +
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
function listZoneHtml() {
  var cut = state.whoCut;
  var grouped = cut !== 'none';
  var area = busList();
  var plist = shownList();
  var rows = '';
  if (grouped) {
    rows = groupedRowsHtml(plist, cut);
  } else {
    var cap = Math.min(plist.length, CFG.listShow);
    for (var i = 0; i < cap; i++) rows += personRowHtml(plist[i], false, false);
  }
  var shown = plist.length;
  // Счётчик как в макете: «60 человек из 1 768» — ПОКАЗАНО строк (listShow)
  // из области. Живой борд 2026-09-22 печатал весь серверный срез (2 000) —
  // поправлено по скрину владельца.
  var nShown = Math.min(plist.length, CFG.listShow);
  var h = '<div class="' + CFG.ns + '-who-bar">' +
    dropdownHtml('whoCut', cut, CFG.groups) +
    optsDropHtml(MODEL.list) +
    '<span class="' + CFG.ns + '-who-cnt">' + nf(nShown) + ' ' + plural(nShown, 'человек', 'человека', 'человек') +
      (area.length > nShown ? ' из ' + nf(area.length) : '') +
      (pickCount() ? ' · <b class="who-sel"' +
        tip({ text: 'Активные условия людской шины: каталог слева сужен; клик по выбранной строке снимает условие' }) +
        '>выбрано: ' + pickCount() + '</b>' : '') +
    '</span>' +
    (grouped
      ? '<button class="' + CFG.ns + '-btn ghost xs" data-wofold="all"' + tip({ text: 'Свернуть все группы дерева до заголовков' }) + ' type="button">Свернуть все</button>' +
        '<button class="' + CFG.ns + '-btn ghost xs" data-wofold="none"' + tip({ text: 'Развернуть все группы дерева' }) + ' type="button">Развернуть все</button>'
      : '') +
    '</div>' +
    '<div class="' + CFG.ns + '-tbl-scroll">' +
    '<table class="' + CFG.ns + '-ptable dense who-people"><thead><tr>' +
      '<th class="txt">Сотрудник</th><th class="txt">Подразделение</th><th class="txt">Стаж</th>' +
      '<th>Дней</th><th>Визит</th><th class="txt">Сегмент</th>' +
    '</tr></thead><tbody>' +
    (rows ||
      '<tr><td colspan="6" style="text-align:center;padding:14px;color:var(--muted)">Никто не подходит под корзину частоты, поиск и настройки.</td></tr>') +
    '</tbody></table></div>' +
    '<div class="' + CFG.ns + '-tbl-note">Сортировка — по убыванию активных дней' +
    (grouped
      ? '; группы — по числу людей: каретка сворачивает, клик по строке группы или человека — людская шина (каталог слева сузится), Shift накапливает'
      : '; клик по человеку — людская шина: каталог слева сузится до его отчётов, Shift накапливает') +
    '. ' + (shown > CFG.listShow
      ? 'Показаны первые ' + CFG.listShow + ' из ' + nf(shown) + ' — уточните поиском или группировкой.'
      : 'В ответе — топ-2 000 зрителей области по активным дням.') + '</div>';
  return h;
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

// Пять карточек области. Предыдущий период сравнивается только там, где он
// целиком помещается в 13 месяцев истории витрины (30 дней, 20 недель).
function kpisHtml() {
  var k = MODEL.kpi, G = CFG.grains[MODEL.grain];
  if (!k) return '';
  var dPct = function (a, b) { return b ? (a / b - 1) * 100 : null; };
  var why = 'В витрине 13 месяцев истории: предыдущего периода такой же длины (' + G.label.replace('за ', '') + ') в ней нет.';
  var dl = function (v, o) { return G.prev ? delta(v, o) : delta(null, { why: why }); };
  var shReg = k.users ? k.regular / k.users * 100 : 0;
  var shRegPrev = k.users_prev ? k.regular_prev / k.users_prev * 100 : 0;
  var mM = monthName(closedMonth(1)), mP = monthName(closedMonth(2));
  return '<div class="' + CFG.ns + '-kpis">' +
    kpiCard({
      label: 'Пользователей ' + G.label, value: nf(k.users),
      hint: { title: 'Пользователи', text: 'Уникальные люди области за период. Один человек, открывший несколько отчётов области, посчитан один раз.' },
      delta: dl(dPct(k.users, k.users_prev), { vs: G.vs, unit: '%',
        tip: { title: 'Сравнение', rows: [{ label: 'Период', value: nf(k.users) }, { label: 'Предыдущий', value: nf(k.users_prev), dash: true, color: CFG.colors.bench }] } }),
      sub: G.prev ? 'предыдущий: <b>' + nf(k.users_prev) + '</b>' : 'ушли из прошлого периода: <b>' + nf(k.sleeping) + '</b>'
    }) +
    kpiCard({
      label: 'Просмотров', value: compact(k.views),
      hint: { title: 'Просмотры', text: 'Сумма открытий отчётов области за период.' },
      delta: dl(dPct(k.views, k.views_prev), { vs: G.vs, unit: '%' }),
      sub: 'на пользователя: <b>' + nf(k.users ? k.views / k.users : 0, 1) + '</b>'
    }) +
    kpiCard({
      label: 'Новых', value: nf(k.new_u),
      hint: { title: 'Новые', text: MODEL.area.sel.length ? 'Впервые открыли отчёт области в этом периоде.' : 'Первый визит в Proteus пришёлся на этот период.' },
      delta: dl(dPct(k.new_u, k.new_prev), { vs: G.vs, unit: '%' }),
      sub: 'доля аудитории: <b>' + pct(k.users ? k.new_u / k.users * 100 : 0) + '</b>'
    }) +
    kpiCard({
      label: 'Постоянных', value: pct(shReg),
      hint: { title: 'Постоянные', text: 'Заходили 8 и более разных ' + G.units + ' за период.', note: 'Та же мера, что столбец «Пост.» каталога и корзины «8–15» и «16+» частоты.' },
      delta: dl(shReg - shRegPrev, { vs: G.vs, unit: ' п.п.', dead: 0.3 }),
      sub: '<b>' + nf(k.regular) + '</b> ' + plural(k.regular, 'человек', 'человека', 'человек')
    }) +
    kpiCard({
      label: 'MAU · ' + mM, value: nf(k.mau),
      hint: { title: 'Месячная аудитория за ' + mM,
        text: 'Уникальные люди области за последний ЗАКРЫТЫЙ календарный месяц. От периода полоски не зависит.',
        rows: [{ label: mM, value: nf(k.mau), color: CFG.colors.ret }, { label: mP, value: nf(k.mau_prev), dash: true, color: CFG.colors.bench }],
        note: 'Текущий месяц не берём: он неполный.' },
      delta: delta(dPct(k.mau, k.mau_prev), { vs: 'к ' + mP, unit: '%' }),
      sub: mP + ': <b>' + nf(k.mau_prev) + '</b>'
    }) +
    '</div>';
}

// Наблюдения (U.observations): заголовок с главным фактом, остальное — по клику.
function observationsHtml(list) {
  if (!list.length) {
    return '<div class="' + CFG.ns + '-no-insight"><span class="' + CFG.ns + '-ok-dot"></span>' +
      'Отклонений выше порогов нет: показатели в пределах обычного разброса.</div>';
  }
  var top = list[0];
  var h = '<div class="' + CFG.ns + '-obs sev-' + (top.sev || 'none') + '">' +
    '<div class="' + CFG.ns + '-obs-h" data-action="obs" role="button" tabindex="0" aria-expanded="false">' +
      '<span class="' + CFG.ns + '-obs-ico" aria-hidden="true">!</span>' +
      '<span class="' + CFG.ns + '-obs-t">Что видно в данных</span>' +
      '<span class="' + CFG.ns + '-obs-lead">' + top.lead + '</span>' +
      '<span class="' + CFG.ns + '-obs-tag">подробнее</span>' +
    '</div>' +
    '<div class="' + CFG.ns + '-obs-b" style="display:none"><ul>';
  for (var i = 0; i < list.length; i++) h += '<li>' + list[i].body + '</li>';
  h += '</ul><span class="' + CFG.ns + '-obs-rule">Отбор по порогам, без языковой модели: ' +
    esc(list.map(function (x) { return x.rule; }).join('; ')) + '.</span></div></div>';
  return h;
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
  var maxDev = 0;
  for (i = 0; i < rows.length; i++) {
    for (a = 1; a <= maxAge; a++) {
      var cc = grid[i][a], rf = refOf(a);
      if (!cc || cc.partial || rf == null) continue;
      var dv = Math.abs(pctOf(rows[i], cc) - rf);
      if (dv > maxDev) maxDev = dv;
    }
  }
  var span = maxDev > 0.001 ? maxDev : 20;
  var normOf = function (v, ag) {
    var ref = refOf(ag);
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
  for (a = 0; a < maxAge; a++) h += '<col>';
  h += '</colgroup><thead><tr>' +
    '<th class="txt"' + tip({ text: o.firstTip || 'Месяц первого визита' }) + '>Когорта</th>' +
    '<th class="txt"' + tip({ text: o.sizeNote || 'Столько человек пришли впервые в этом месяце' }) + '>Пришло</th>';
  for (a = 1; a <= maxAge; a++) {
    var ref2 = refOf(a);
    var ttl = '+' + a + ' ' + plural(a, 'месяц', 'месяца', 'месяцев');
    h += '<th' + (ref2 != null
      ? tip({ title: ttl, rows: [{ label: base === 'all' ? 'Медиана таблицы' : 'Медиана столбца', value: pct(ref2) }] })
      : tip({ title: ttl, text: 'Доля когорты, активной через ' + a + ' мес. после первого визита' })) +
      '>+' + a + ((base === 'col' && ref2 != null) ? '<span class="' + CFG.ns + '-ct-med">м ' + pct(ref2, 0) + '</span>' : '') + '</th>';
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
  var padL = 6, padR = 18, top = 34, bottom = 30, H = 280;
  var step = (SVG_W - padL - padR) / Math.max(1, n - 1);
  var yOf = function (v) { return top + (1 - v / 100) * (H - top - bottom); };
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
    body += '<line x1="' + padL + '" y1="' + yy + '" x2="' + (SVG_W - padR) + '" y2="' + yy + '" stroke="' + C.split + '" stroke-dasharray="3 3"/>';
  }
  body += '<path d="' + s + 'L' + r1(pts[n - 1][0]) + ' ' + r1(yOf(0)) + 'L' + r1(pts[0][0]) + ' ' + r1(yOf(0)) + 'Z" fill="rgba(0,115,160,.08)"/>';
  body += '<path d="' + s + '" fill="none" stroke="' + C.act + '" stroke-width="2"/>';
  for (i = 0; i < n; i++) {
    body += '<circle cx="' + r1(pts[i][0]) + '" cy="' + r1(pts[i][1]) + '" r="3.5" fill="' + C.act + '" stroke="#fff" stroke-width="2"' +
      tip({
        title: 'Через ' + points[i].age + ' ' + plural(points[i].age, 'месяц', 'месяца', 'месяцев'),
        rows: [{ label: 'Возвращаются', value: pct(points[i].pct), color: C.act },
          { label: 'Когорт в расчёте', value: nf(points[i].cohorts), dash: true, color: C.bench }],
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

function buildHTML() {
  if (!MODEL.kpi && !MODEL.rows.length && !MODEL.ts.length && !MODEL.coh.length) {
    return buildCSS() + '<div class="' + CFG.ns + '-root"><div class="' + CFG.ns + '-empty"><b>' + esc(CFG.text.noData) + '</b>' +
      'В области нет зрителей за период — снимите часть условий в каталоге или в полоске.</div></div>';
  }
  var N = CFG.ns, ai = areaInfo(), G = CFG.grains[MODEL.grain];
  var view = state.view === 'dyn' || state.view === 'coh' ? state.view : 'who';
  var body, bodyCls;
  if (view === 'who') {
    body = freqStripHtml(busList()) + '<div class="' + N + '-list-zone">' + listZoneHtml() + '</div>';
    bodyCls = 'tbl-wrap';
  } else if (view === 'dyn') {
    body = dynamicsHtml(MODEL.ts, MODEL.grain, {});
    bodyCls = 'dyn-wrap';
  } else {
    body = cohortZoneHtml(ai);
    bodyCls = 'coh-wrap';
  }
  var nP = pickCount();
  var h = [];
  h.push('<div class="' + N + '-root">');
  h.push('<div class="' + N + '-head"><h2>Аудитория области</h2>' +
    '<span class="' + N + '-pill' + (ai.mut ? ' mut' : '') + '"' + tip({ title: 'Область', text: ai.text }) + '>' + esc(ai.pill) + '</span>' +
    (nP ? '<span class="' + N + '-pill ppl"' + tip({ title: 'Людская шина', text: 'Выбрано условий по людям: ' + nP +
      '. Каталог слева сужен до отчётов этих людей; карточки и вкладки здесь — по всей области, выбор подсвечен в «Кто смотрит».' }) +
      '>люди: ' + nP + '</span>' : '') +
    '<span class="' + N + '-fresh"' + tip({ title: 'Свежесть данных', text: 'Витрина обновляется ежедневно, данные — по вчерашний день включительно.' }) +
      '><i></i>' + esc(G.label) + ' · данные <b>за вчера</b></span></div>');
  h.push(kpisHtml());
  h.push(observationsHtml(obsArea(MODEL.kpi, ai.what, MODEL.grain)));
  var tabs = [];
  for (var t = 0; t < CFG.views.length; t++) tabs.push({ key: CFG.views[t].key, label: CFG.views[t].label, on: view === CFG.views[t].key });
  h.push('<div class="' + N + '-panel">');
  h.push('<div class="' + N + '-panel-h">' +
    '<div class="' + N + '-sub-tabs" role="tablist">' + tabsHtml('view', tabs) + '</div>' +
    (view === 'who' ? '<div class="' + N + '-under">' + searchBoxHtml('whoQ', 'Имя или логин', state.q) + '</div>' : '') +
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
  var top = 14, pH = 164, axH = 32;
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
    for (var sj = 0; sj < segs.length; sj++) {
      if (segs[sj].h <= 0.5) continue;    // пустых ступеней не рисуем вовсе
      var sy = yy - segs[sj].h;
      body += sj === topmost
        ? '<path d="' + pathTop(x, sy, bw, segs[sj].h) + '" fill="' + segs[sj].c + '"/>'
        : '<rect x="' + r1(x) + '" y="' + r1(sy) + '" width="' + r1(bw) + '" height="' + r1(segs[sj].h) + '" fill="' + segs[sj].c + '"/>';
      yy = sy;
    }
    // Подпись значения — у КАЖДОГО столбика (макет: valueLabel без пропусков).
    body += '<text x="' + r1(x + bw / 2) + '" y="' + r1(yTop - 7) + '" font-size="' + fsVal + '" text-anchor="middle" fill="' + C.label +
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
  var top = 14, pH = 112, axH = 32;
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
    labels += '<text x="' + r1(cx) + '" y="' + r1(cy - 8) + '" font-size="' + fsVal + '" text-anchor="middle" fill="' + C.label +
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
  var body = '<path d="' + s + 'L' + r1(pts[pts.length - 1][0]) + ' ' + (top + pH) + 'L' + r1(pts[0][0]) + ' ' + (top + pH) + 'Z" fill="rgba(91,100,120,.07)" stroke="none"/>' +
    '<path d="' + s + '" fill="none" stroke="' + C.views + '" stroke-width="2"/>';
  for (i = 0; i < pts.length; i++) {
    body += '<circle cx="' + r1(pts[i][0]) + '" cy="' + r1(pts[i][1]) + '" r="2.6" fill="' + C.views + '" stroke="#fff" stroke-width="1.6"/>';
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
  for (var i = 0; i < leg.length; i++) {
    h += '<button class="' + CFG.ns + '-leg' + (off[leg[i].k] ? ' off' : '') + '" data-leg="' + leg[i].k + '" type="button"' +
      tip({ text: off[leg[i].k] ? 'Вернуть ступень на график' : 'Убрать ступень с графика' }) + '>' +
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
      overlay.innerHTML = buildHTML();
      if (syncSvgWidth()) overlay.innerHTML = buildHTML();
      overlay.scrollTop = st;
      overlay.scrollLeft = sl;
      renderTip();
    }
    // Легенда когорт — орган управления: наведение на ступень гасит все
    // ячейки, кроме попавших в неё. Точечная правка классов, БЕЗ render().
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
        getTip().innerHTML = dynTipHtml(el, i);
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
      if (pk.lvl3.length) fl.push({ column: 'lvl3_f', operator: 'IN', value: pk.lvl3.slice() });
      if (pk.lvl4.length) fl.push({ column: 'lvl4_f', operator: 'IN', value: pk.lvl4.slice() });
      if (pk.spec.length) fl.push({ column: 'spec_f', operator: 'IN', value: pk.spec.slice() });
      if (pk.stream.length) fl.push({ column: 'stream_f', operator: 'IN', value: pk.stream.slice() });
      if (pk.adgroup.length) fl.push({ column: 'adg_f', operator: 'IN', value: pk.adgroup.slice() });
      if (pk.heads.length) fl.push({ column: 'heads_f', operator: 'IN', value: ['1'] });
      if (pk.login.length) fl.push({ column: 'login_f', operator: 'IN', value: pk.login.slice() });
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
        render();
        return;
      }
      // Каретка дерева: свернуть/раскрыть группу.
      var caret = trigger(e.target, 'data-whogrp');
      if (caret) {
        var gk = caret.getAttribute('data-whogrp');
        if (state.grpClosed[gk]) delete state.grpClosed[gk];
        else state.grpClosed[gk] = true;
        render();
        return;
      }
      // Свернуть/развернуть все группы.
      var fold = trigger(e.target, 'data-wofold');
      if (fold) {
        var all = fold.getAttribute('data-wofold') === 'all';
        if (all) {
          for (var fk = 0; fk < WHO_TREE_KEYS.length; fk++) state.grpClosed[WHO_TREE_KEYS[fk]] = true;
        } else {
          state.grpClosed = {};
        }
        render();
        return;
      }
      // Корзина частоты: локальный фильтр списка + шина freq_f.
      var fb = trigger(e.target, 'data-freq');
      if (fb) {
        var bk = fb.getAttribute('data-freq');
        state.freqSel = state.freqSel === bk ? null : bk;
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
        render();
        return;
      }
      var exCb = trigger(e.target, 'data-woex');
      if (exCb) {
        var exl = exCb.getAttribute('data-woex');
        var xi = state.excl.indexOf(exl);
        if (exCb.checked && xi < 0) state.excl.push(exl);
        if (!exCb.checked && xi >= 0) state.excl.splice(xi, 1);
        render();
        return;
      }
      var exClear = trigger(e.target, 'data-woexclear');
      if (exClear) {
        state.excl = [];
        render();
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
        var zone = overlay.querySelector('.' + CFG.ns + '-list-zone');
        if (zone) zone.innerHTML = listZoneHtml();
      } else if (id === 'woExQ') {
        state.exQ = inp.value || '';
        var box = overlay.querySelector('.' + CFG.ns + '-wo-ex');
        if (box) box.innerHTML = exPoolHtml(MODEL.list);
      }
    }

    overlay.addEventListener('mouseover', onOver);
    overlay.addEventListener('mouseout', onOut);
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
    state.onWinResize = function () { if (syncSvgWidth()) render(); if (state.tip) renderTip(); };
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
