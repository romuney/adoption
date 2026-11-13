// kit/sbx/run.cjs — прогон JS чарта Proteus в модели песочницы: борд Superset 2.0.1 → ячейка → iframe sandbox="allow-scripts".
// Печатает ошибки окна (и погас ли чарт), эмиты applyCrossFilter, сообщения канала скриншотов (маркер и размер iframe
// после него), прочие сообщения родителю; по желанию — сценарий кликов, скриншот, сниппет kit/board-check.js на этой странице.
//
//   NODE_PATH=$(npm root -g) node kit/sbx/run.cjs <chart.js> <mock.json> [флаги]
//     --css board.css         CSS борда из папки поставки (как в «CSS» борда); id в нём — те, что у --id / --also
//     --id N                  id чарта — число (класс .dashboard-chart-id-N, #chart-id-N); по умолчанию 000000 — заглушка исходников
//     --w 1200 --h 900        окно браузера; --ch 735 — высота ячейки (по умолчанию — окно минус меню, шапка и поля)
//     --cols 12               ширина ячейки в колонках сетки (12 — весь ряд)
//     --also <js> <mock> <id> [cols]   соседний чарт в том же ряду (своя песочница), можно несколько раз
//     --clicks clicks.json    сценарий (формат — kit/sbx/clicks.example.json)
//     --shot out.png          скриншот страницы в конце
//     --exec fn|script        как запускать код: new Function('data','applyCrossFilter', код) (fn, как стенды проектов)
//                             или глобальным <script> (script, как хост smoke скилла)
//     --catch onerror|listener  чем песочница ловит ошибки окна (S8 — не известно): window.onerror до кода чарта
//                             (по умолчанию; обёртка SB-03 его пропускает) или слушатель error (обёртка бессильна)
//     --echarts <путь>        настоящий echarts (например adoption:vendor/echarts.min.js); без флага — заглушка хоста
//     --rerun self|all|none   после эмита перезапустить тем же ответом: себя (по умолчанию), все чарты, никого
//     --emit-delay 300        через сколько мс после эмита перезапуск (Proteus отвечает не сразу)
//     --no-header             шапка чарта спрятана (display:none), как её прячет CSS борда; у 2.0.1 она в DOM всегда
//     --frame srcdoc|src      документ iframe — srcdoc (по умолчанию, как стенды DL / HRBP) или src с того же сервера: от этого
//                             зависит document.referrer чарта (srcdoc — только origin, src — полный адрес борда; Chromium 141)
//     --iframe-attrs mount|follow  атрибуты размера iframe: только при монтаже (по умолчанию, S2) или по каждой смене окна
//     --no-scrollbars         полосы прокрутки как на Mac (по умолчанию — как в Windows: занимают место, SB-03)
//     --board-check           выполнить kit/board-check.js на странице (CHART_IDS = id чартов прогона) и напечатать вывод
//     --board N               номер борда в адресе родителя /superset/dashboard/N/ (что чарт увидит в document.referrer)
//     --json                  вывод — JSON (для скриптов)
// Код выхода: 0 — ошибок окна нет; 1 — были (чарт в бою погас бы); 2 — неверный вызов или не запустилось
// (нет файла, id не число или повторяется, frame шага — не id прогона).
// Нужно: npm i -g playwright@1.56.1 (браузер — PLAYWRIGHT_BROWSERS_PATH, например /opt/pw-browsers).
// Правила playbook: SB-20 (08-sandbox.md), ST-22 (13-stand.md); прогоны на чартах четырёх проектов — kit/RESULTS.js.md, раздел 5.
// Модель — не бой: чем форк запускает код, ловит ошибки и грузит iframe, не известно — гоняйте оба варианта флагов.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const HERE = __dirname;
// ── правила Superset 2.0.1 (DashboardBuilder, DashboardContainer.*.chunk.css; см. detail_list:stand/skeleton.css, слой 1) ──
const BASE_CSS = [
  'html,body{margin:0}body{font-family:Inter,"Helvetica Neue",Arial,sans-serif;font-size:14px;color:#333;line-height:1.42857;background:#f7f7f7}',
  '*,*::before,*::after{box-sizing:border-box}',
  '.sbx-menu{height:53px;background:#141414;color:#d9d9d9;display:flex;align-items:center;gap:28px;padding:0 24px;font-size:15px}',
  '.dashboard-header-container{position:sticky;top:0;z-index:100}',
  '.header-with-actions{display:flex;align-items:center;justify-content:space-between;background:#fff;height:64px;padding:0 16px}',
  '.dynamic-title{font-size:21px;font-weight:600;color:#323232}',
  '.dashboard-content{display:flex;flex-direction:row;flex-wrap:nowrap;height:auto;flex:1}',
  '.dashboard-content .grid-container{width:0;flex:1;position:relative;margin:24px 32px 24px 32px}',
  '.dragdroppable{position:relative}.dragdroppable-row{width:100%}',
  '.grid-content{display:flex;flex-direction:column}',
  '.grid-content>div:not(:only-child):not(:last-child):not(.empty-droptarget){margin-bottom:16px}',
  '.resizable-container{background-color:initial;position:relative}',
  '.dashboard-component-chart-holder{background-color:#fff;border:2px solid #0000;color:#333;height:100%;overflow-y:visible;padding:16px;position:relative;width:100%}',
  '.dashboard-component-chart-holder.fade-out{border-radius:4px;box-shadow:none}',
  '.dashboard-chart{overflow:hidden;position:relative}',
  '.grid-row{align-items:flex-start;display:flex;flex-direction:row;flex-wrap:nowrap;height:fit-content;position:relative;width:100%}',
  '.grid-row>:not(:only-child):not(:last-child):not(.hover-menu){margin-right:16px}',
  '.dashboard .chart-header{align-items:flex-start;display:flex;font-size:16px;font-weight:600;margin-bottom:4px;max-width:100%;min-height:0}',
  '.dashboard .chart-header>.header-title{flex-grow:1;overflow:hidden}',
  'img.echarts-plugin{display:none}',
].join('\n');

function usage(msg) {
  if (msg) process.stderr.write(msg + '\n');
  process.stderr.write('node kit/sbx/run.cjs <chart.js> <mock.json> [--css f] [--id N] [--w W --h H] [--ch H] [--clicks f] [--shot f] …\n');
  process.exit(2);
}

function parseArgs(argv) {
  const o = { charts: [], css: null, w: 1200, h: 900, ch: 0, clicks: null, shot: null, exec: 'fn', echarts: null, rerun: 'self',
    emitDelay: 300, header: true, follow: false, frame: 'srcdoc', scrollbars: true, boardCheck: false, board: '1', json: false, id: '000000', cols: 12,
    catch: 'onerror' };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) usage('нет значения у ' + a); return argv[++i]; };
    if (a === '--css') o.css = val();
    else if (a === '--id') o.id = val();
    else if (a === '--w') o.w = +val();
    else if (a === '--h') o.h = +val();
    else if (a === '--ch') o.ch = +val();
    else if (a === '--cols') { o.cols = +val(); o.colsSet = true; }
    else if (a === '--clicks') o.clicks = val();
    else if (a === '--shot') o.shot = val();
    else if (a === '--exec') o.exec = val();
    else if (a === '--catch') o.catch = val();
    else if (a === '--echarts') o.echarts = val();
    else if (a === '--rerun') o.rerun = val();
    else if (a === '--emit-delay') o.emitDelay = +val();
    else if (a === '--no-header') o.header = false;
    else if (a === '--iframe-attrs') o.follow = val() === 'follow';
    else if (a === '--frame') o.frame = val();
    else if (a === '--no-scrollbars') o.scrollbars = false;
    else if (a === '--board-check') o.boardCheck = true;
    else if (a === '--board') o.board = val();
    else if (a === '--json') o.json = true;
    else if (a === '--also') {
      const js = val(), mock = val(), id = val();
      const cols = argv[i + 1] && /^\d+$/.test(argv[i + 1]) ? +argv[++i] : 0;
      o.charts.push({ js, mock, id, cols });
    } else if (a.startsWith('--')) usage('неизвестный флаг ' + a);
    else pos.push(a);
  }
  if (pos.length !== 2) usage('нужны два пути: чарт и мок');
  o.charts.unshift({ js: pos[0], mock: pos[1], id: o.id, cols: o.cols });
  // id — числа, как у Superset (dashboard-chart-id-N; заглушки поставки 000000…); разные: иначе две ячейки с одним id
  const ids = o.charts.map((c) => String(c.id));
  ids.forEach((id) => { if (!/^\d+$/.test(id)) usage('id чарта — число (как у Superset и заглушек 000000…): «' + id + '»'); });
  if (new Set(ids).size !== ids.length) usage('id чартов повторяются: ' + ids.join(', ') + ' — у соседа (--also) свой id');
  [['--w', o.w], ['--h', o.h], ['--cols', o.cols], ['--emit-delay', o.emitDelay]].forEach(([k, v]) => {
    if (!(v >= 0) || v !== Math.floor(v)) usage(k + ' — целое число ≥ 0: ' + v);
  });
  if (!(o.ch >= 0)) usage('--ch — число px: ' + o.ch);
  if (!(o.w > 0 && o.h > 0)) usage('--w и --h — больше 0');
  if (['fn', 'script'].indexOf(o.exec) < 0) usage('--exec fn|script');
  if (['onerror', 'listener'].indexOf(o.catch) < 0) usage('--catch onerror|listener');
  if (['self', 'all', 'none'].indexOf(o.rerun) < 0) usage('--rerun self|all|none');
  if (['srcdoc', 'src'].indexOf(o.frame) < 0) usage('--frame srcdoc|src');
  // ширины (колонки сетки из 12): у первого — --cols; с соседями без --cols — поровну из того, что не занято
  if (o.charts.length > 1 && !o.colsSet) o.charts[0].cols = 0;
  const fixed = o.charts.reduce((a, c) => a + (c.cols || 0), 0), nfree = o.charts.filter((c) => !c.cols).length;
  o.charts.forEach((c) => { if (!c.cols) c.cols = Math.max(1, Math.floor(Math.max(1, 12 - fixed) / nfree)); });
  return o;
}

// Маркер канала: PNG 1×1, после IEND — ASCII-маркер (так шлют чарты DL и adoption); вернуть его текст или «чистый PNG»
function marker(dataUrl) {
  const m = /^data:image\/png;base64,(.*)$/.exec(dataUrl || '');
  if (!m) return dataUrl ? 'не PNG: ' + dataUrl.slice(0, 40) : 'пусто';
  const raw = Buffer.from(m[1], 'base64'), i = raw.indexOf('IEND');
  if (i < 0) return 'PNG без IEND';
  const tail = raw.slice(i + 8).toString('latin1').replace(/^\0+|\0+$/g, '');   // нули — выравнивание base64
  return tail ? '«' + tail.replace(/[^\x20-\x7e]/g, '?') + '»' : 'чистый PNG (маркера нет)';
}

function readJSON(p, what) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { usage(what + ' ' + p + ': ' + e.message); return null; }
}

function readText(p, what) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { usage(what + ' ' + p + ': ' + (e.code || e.message)); return ''; }
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  let chromium;
  try { chromium = require('playwright').chromium; } catch (e) { usage('нет playwright: npm i -g playwright, NODE_PATH=$(npm root -g)'); }
  const charts = o.charts.map((c) => ({ id: String(c.id), cols: c.cols, title: path.basename(c.js).replace(/\.js$/, ''),
    src: readText(c.js, 'чарт'), rows: readJSON(c.mock, 'мок'), js: c.js, mock: c.mock }));
  // BOM в начале файла (сохранил редактор Windows) владелец в «CSS» борда не вставит, а в <style> он стал бы частью
  // первого селектора — и браузер отбросил бы первое правило: срезаем
  const boardCss = o.css ? readText(o.css, 'CSS борда').replace(/^\uFEFF/, '') : '';
  let ech = '';
  if (o.echarts) ech = readText(o.echarts, 'echarts').replace(/<\/script/gi, '<\\/script');
  // сценарий — до браузера: формат и id чартов в шагах (опечатка в frame иначе роняла прогон посреди сценария)
  const steps = o.clicks ? readJSON(o.clicks, 'сценарий') : [];
  if (!Array.isArray(steps)) usage('сценарий ' + o.clicks + ': нужен массив шагов (формат — kit/sbx/clicks.example.json)');
  steps.forEach((s, k) => {
    if (!s || typeof s !== 'object') usage('сценарий, шаг ' + (k + 1) + ': нужен объект');
    if (s.frame != null && !charts.some((c) => c.id === String(s.frame))) {
      usage('сценарий, шаг ' + (k + 1) + ': frame «' + s.frame + '» — такого чарта нет (есть: ' + charts.map((c) => c.id).join(', ') + ')');
    }
  });
  // снимки — в существующие каталоги: иначе playwright падает в конце прогона, и вывод теряется
  [o.shot].concat(steps.map((s) => s.shot)).filter(Boolean).forEach((f) => {
    if (!fs.existsSync(path.dirname(path.resolve(String(f))))) usage('снимок ' + f + ': нет каталога ' + path.dirname(path.resolve(String(f))));
  });
  const inner = fs.readFileSync(path.join(HERE, 'inner.html'), 'utf8').replace('<script>/*__ECHARTS__*/</script>', () => '<script>' + ech + '</script>').replace("var MODE = '__MODE__', CATCH = '__CATCH__'", "var MODE = '" + o.exec + "', CATCH = '" + o.catch + "'");
  const cellH = o.ch || Math.max(320, o.h - 53 - 64 - 48);
  const cfg = { charts: charts.map((c) => ({ id: c.id, cols: c.cols, title: c.title })), cellH, header: o.header,
    inner: o.frame === 'src' ? '' : inner, innerUrl: o.frame === 'src' ? '/sbx-inner.html' : '',
    title: 'Модель песочницы · ' + charts.map((c) => c.title).join(' + '), rerun: o.rerun, emitDelay: o.emitDelay, follow: o.follow };
  const page0 = fs.readFileSync(path.join(HERE, 'parent.html'), 'utf8')
    .replace('<style id="sbx-base">/*__BASE_CSS__*/</style>', () => '<style id="sbx-base">' + BASE_CSS + '</style>')
    .replace('<style class="CssEditor-css" id="sbx-board">/*__BOARD_CSS__*/</style>', () => '<style class="CssEditor-css" id="sbx-board">' + boardCss.replace(/<\/style/gi, '<\\/style') + '</style>')
    .replace('var SBX = __CFG__;', () => 'var SBX = ' + JSON.stringify(cfg).replace(/<\//g, '<\\/').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + ';');
  // шаблоны поменялись — падать, а не тихо гонять без кода чарта
  if (/var SBX = __CFG__;|\/\*__BASE_CSS__\*\/<\/style>|\/\*__BOARD_CSS__\*\/<\/style>/.test(page0) || /MODE = '__MODE__'|CATCH = '__CATCH__'/.test(inner)) usage('шаблон kit/sbx/*.html не совпал с run.cjs');
  // родитель — по адресу борда: чарт видит его в document.referrer (адрес борда для «ссылки на вид», SB-17)
  const route = '/superset/dashboard/' + o.board + '/';
  const srv = http.createServer((q, r) => {
    let pth = q.url.split('?')[0];
    try { pth = decodeURIComponent(pth); } catch (e) { /* как есть */ }
    if (pth === route) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(page0); }
    else if (q.url === '/sbx-inner.html') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(inner); }
    else { r.writeHead(404); r.end(); }
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const url = 'http://127.0.0.1:' + srv.address().port + encodeURI(route);              // --board 'мой борд' — тоже адрес

  const browser = await chromium.launch(o.scrollbars ? { ignoreDefaultArgs: ['--hide-scrollbars'] } : {});
  const page = await browser.newPage({ viewport: { width: o.w, height: o.h } });
  const pageErrs = [], consoleErrs = [], boardLog = [];
  page.on('pageerror', (e) => pageErrs.push(String(e).slice(0, 400)));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 300));
    if (m.type() === 'log' && /^окно /.test(m.text())) boardLog.push(m.text());
  });
  await page.goto(url);
  const S = (fn, arg) => page.evaluate(fn, arg);
  // дождаться SBX_READY от каждого iframe
  const t0 = Date.now();
  for (;;) {
    const ready = await S(() => window.__sbx.msgs.filter((m) => m.type === 'SBX_READY').map((m) => m.chart));
    if (charts.every((c) => ready.indexOf(c.id) > -1)) break;
    if (Date.now() - t0 > 15000) { process.stderr.write('песочница не ответила за 15 с\n'); process.exit(2); }
    await page.waitForTimeout(50);
  }
  // перезапуск после эмита: родитель держит последний ответ каждого чарта
  await S((c) => {
    window.__sbxRows = {};
    window.__sbxRun = function (id, rows) {
      if (rows) window.__sbxRows[id] = rows;
      window.__sbxSend(id, { type: 'SBX_RUN', rows: window.__sbxRows[id] });
    };
    window.addEventListener('message', function (e) {
      var d = e.data || {};
      if (d.type !== 'ECHARTS_APPLY_CROSS_FILTER' || c.rerun === 'none') return;
      var from = '';
      for (var id in window.__sbx.frames) if (window.__sbx.frames[id].contentWindow === e.source) from = id;
      var who = c.rerun === 'all' ? Object.keys(window.__sbx.frames) : [from];
      setTimeout(function () { who.forEach(function (id) { if (id) window.__sbxRun(id); }); }, c.emitDelay);
    });
  }, { rerun: o.rerun, emitDelay: o.emitDelay });
  for (const c of charts) {
    await S((a) => { window.__sbxSend(a.id, { type: 'SBX_SRC', src: a.src }); window.__sbxRun(a.id, a.rows); }, { id: c.id, src: c.src, rows: c.rows });
  }
  for (const c of charts) {
    const t1 = Date.now();
    while (!(await S((id) => window.__sbx.runs[id] > 0 || window.__sbx.errs.some((e) => e.chart === id), c.id))) {
      if (Date.now() - t1 > 20000) break;
      await page.waitForTimeout(50);
    }
  }
  await page.waitForTimeout(600);

  async function frameOf(id) {
    for (const f of page.frames()) {
      if (f === page.mainFrame()) continue;
      const el = await f.frameElement().catch(() => null);
      if (el && (await el.getAttribute('data-chart')) === String(id)) return f;
    }
    return null;
  }
  async function frameBox(id) {
    return S((cid) => {
      var f = window.__sbx.frames[cid], r = f.getBoundingClientRect();
      return Math.round(r.width) + '×' + Math.round(r.height) + (Math.round(r.left) || Math.round(r.top) ? ' @' + Math.round(r.left) + ',' + Math.round(r.top + window.scrollY) : '');
    }, String(id));
  }
  async function state(id) {
    const f = await frameOf(id);
    const inside = f ? await f.evaluate(() => {
      var h = document.querySelectorAll('[_echarts_instance_]'), host = h[h.length - 1] || document.querySelector('.sbx-host');
      var de = document.documentElement, cs = getComputedStyle(de), bs = getComputedStyle(document.body);
      return { kids: host ? host.children.length : -1, w: innerWidth, h: innerHeight,
        scrollY: de.scrollHeight > de.clientHeight + 1, scrollX: de.scrollWidth > de.clientWidth + 1,
        ov: cs.overflow + '/' + bs.overflow, bodyKids: document.body.children.length };
    }).catch((e) => ({ err: String(e) })) : { err: 'iframe не найден' };
    const geo = await S((cid) => {
      var f = window.__sbx.frames[cid], fb = f.getBoundingClientRect(), h = f.closest('.dashboard-component-chart-holder'), hb = h.getBoundingClientRect(), cs = getComputedStyle(h);
      // область чарта — холдер без рамки и полей (после CSS борда); «+» — iframe вылез за неё, «−» — не дотянут
      var r = hb.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight), b = hb.bottom - parseFloat(cs.borderBottomWidth) - parseFloat(cs.paddingBottom);
      var w = r - (hb.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft)), hh = b - (hb.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop));
      return { attrs: f.getAttribute('width') + '×' + f.getAttribute('height'),
        miss: [Math.round(fb.right - r), Math.round(fb.bottom - b)], area: Math.round(w) + '×' + Math.round(hh) };
    }, String(id));
    return Object.assign(inside, { box: await frameBox(id) }, geo);
  }
  const snap = () => S(() => ({ e: window.__sbx.emits.length, c: window.__sbx.channel.length, r: window.__sbx.errs.length, m: window.__sbx.msgs.length }));
  const since = (n) => S((x) => ({ emits: window.__sbx.emits.slice(x.e), channel: window.__sbx.channel.slice(x.c), errs: window.__sbx.errs.slice(x.r),
    msgs: window.__sbx.msgs.slice(x.m).filter((m) => m.type !== 'SBX_RUN' && m.type !== 'SBX_READY') }), n);

  const report = { url, window: o.w + '×' + o.h, cellH, exec: o.exec, catch: o.catch, echarts: o.echarts ? 'настоящий' : 'заглушка', css: o.css || '',
    charts: [], steps: [], errors: [], emits: 0, channel: 0, other: {}, boardCheck: '' };
  for (const c of charts) {
    const ready = await S((id) => window.__sbx.msgs.filter((m) => m.chart === id && m.type === 'SBX_READY')[0] || null, c.id);
    const run1 = await S((id) => window.__sbx.msgs.filter((m) => m.chart === id && m.type === 'SBX_RUN')[0] || null, c.id);
    report.charts.push(Object.assign({ id: c.id, file: c.js, mock: c.mock, rows: Array.isArray(c.rows) ? c.rows.length : '?', firstRun: run1,
      ready }, await state(c.id)));
  }

  // ── сценарий (прочитан и проверен до браузера) ──
  for (let k = 0; k < steps.length; k++) {
    const s = steps[k], id = String(s.frame || charts[0].id), n0 = await snap(), box0 = await frameBox(id);
    const st = { n: k + 1, name: s.name || '', act: '', ok: true };
    try {
      const f = await frameOf(id);
      const el = async (sel) => { const all = await f.$$(sel); const e = all[s.i || 0]; if (!e) throw new Error('нет элемента ' + sel + (s.i ? ' [' + s.i + ']' : '')); return e; };
      if (s.click) { st.act = 'click ' + s.click; await (await el(s.click)).click(); }
      else if (s.dblclick) { st.act = 'dblclick ' + s.dblclick; await (await el(s.dblclick)).dblclick(); }
      else if (s.hover) { st.act = 'hover ' + s.hover; await (await el(s.hover)).hover(); }
      else if (s.fill) { st.act = 'fill ' + s.fill; await (await el(s.fill)).fill(String(s.value || '')); }
      else if (s.press) { st.act = 'press ' + s.press; await page.keyboard.press(s.press); }
      else if (s.rerun) { st.act = 'перезапуск тем же ответом'; await S((cid) => window.__sbxRun(cid), id); }
      else if (s.data) { st.act = 'новый ответ ' + s.data; await S((a) => window.__sbxRun(a.id, a.rows), { id, rows: readJSON(s.data, 'ответ') }); }
      else if (s.resize) { st.act = 'окно ' + s.resize.join('×'); await page.setViewportSize({ width: s.resize[0], height: s.resize[1] }); }
      else if (s.parentClick) { st.act = 'клик по борду ' + s.parentClick.join(','); await page.mouse.click(s.parentClick[0], s.parentClick[1]); }
      else if (s.parentMove) { st.act = 'курсор по борду ' + s.parentMove.join(','); await page.mouse.move(s.parentMove[0], s.parentMove[1], { steps: 4 }); }
      else if (s.scroll != null) { st.act = 'прокрутка борда ' + s.scroll; await S((y) => window.scrollTo(0, y), s.scroll); }
      else if (s.eval) { st.act = 'eval'; st.value = await f.evaluate(s.eval); }
      else if (s.wait) st.act = 'пауза ' + s.wait;
      await page.waitForTimeout(s.wait || 300);
    } catch (e) { st.ok = false; st.err = String(e.message || e).split('\n')[0]; }
    const d = await since(n0);
    st.emits = d.emits.map((x) => JSON.stringify(x.filters).slice(0, 240));
    st.channel = d.channel.map((x) => marker(x.dataUrl));
    st.errs = d.errs.map((x) => x.msg + (x.killed ? ' → ЧАРТ ПОГАС' : ''));
    st.msgs = d.msgs.map((x) => x.type);
    st.iframe = box0 === (await frameBox(id)) ? box0 : box0 + ' → ' + (await frameBox(id));
    if (s.shot) { await page.screenshot({ path: s.shot }); st.shot = s.shot; }
    report.steps.push(st);
  }

  // ── итог ──
  const all = await S(() => ({ emits: window.__sbx.emits, channel: window.__sbx.channel, errs: window.__sbx.errs, msgs: window.__sbx.msgs, runs: window.__sbx.runs }));
  report.emits = all.emits.length;
  report.channel = all.channel.length;
  report.errors = all.errs.map((x) => ({ chart: x.chart, msg: x.msg, where: x.where, killed: x.killed, stack: (x.stack || '').split('\n').slice(0, 3).join(' | ') }));
  all.msgs.forEach((m) => { if (m.type !== 'SBX_RUN' && m.type !== 'SBX_READY') report.other[m.type] = (report.other[m.type] || 0) + 1; });
  report.runs = all.runs;
  report.final = {};
  for (const c of charts) report.final[c.id] = await state(c.id);
  report.pageErrors = pageErrs;
  report.consoleErrors = consoleErrs.filter((t) => !/Failed to load resource/.test(t));
  if (o.boardCheck) {
    const snip = fs.readFileSync(path.join(HERE, '..', 'board-check.js'), 'utf8')
      .replace(/CHART_IDS = \[[^\]]*\]/, () => 'CHART_IDS = ' + JSON.stringify(charts.map((c) => c.id)).replace(/"/g, "'"));
    if (snip.indexOf("CHART_IDS = ['" + charts[0].id + "'") < 0) usage('kit/board-check.js: строка CHART_IDS = […] не найдена');
    await page.evaluate(snip);
    await page.waitForTimeout(100);
    report.boardCheck = boardLog.pop() || '(сниппет ничего не напечатал)';
  }
  if (o.shot) await page.screenshot({ path: o.shot });
  report.browser = browser.version();
  await browser.close();
  srv.close();

  const bad = report.errors.length > 0 || report.pageErrors.length > 0;
  if (o.json) { process.stdout.write(JSON.stringify(report, null, 1) + '\n'); process.exit(bad ? 1 : 0); }
  const L = [];
  L.push('модель песочницы Proteus · Chromium ' + report.browser + ' · окно ' + report.window + ' · ячейка ' + cellH + ' px · код: ' + o.exec
    + ' · ошибки ловит: ' + (o.catch === 'listener' ? 'слушатель error' : 'window.onerror')
    + ' · echarts: ' + report.echarts + ' · iframe: ' + o.frame + (o.css ? ' · CSS борда: ' + path.basename(o.css) : ' · без CSS борда'));
  for (const c of report.charts) {
    const fr = report.final[c.id];
    L.push('чарт ' + c.id + ' (' + path.basename(c.file) + ', ' + c.rows + ' строк): '
      + (c.firstRun ? 'первый прогон ' + c.firstRun.ms + ' мс, option ' + (c.firstRun.option ? 'есть' : 'НЕТ') : 'прогона НЕТ')
      + ' · прогонов ' + report.runs[c.id]
      + ' · узлов в хосте: после прогона ' + (c.firstRun ? c.firstRun.kids : '—') + ', в конце ' + (fr.kids > 0 ? fr.kids : '0 — ХОСТ ПУСТ (чарт погас или ничего не смонтировал)')
      + ' · iframe ' + fr.box + ' (атрибуты ' + fr.attrs + ')'
      + ' · документ iframe: ' + (fr.scrollY || fr.scrollX ? 'ЕСТЬ прокрутка' + (fr.scrollY ? ' по вертикали' : '') + (fr.scrollX ? ' по горизонтали' : '') : 'без прокрутки')
      + ', overflow html/body ' + fr.ov
      + (Math.abs(fr.miss[0]) > 1 || Math.abs(fr.miss[1]) > 1 ? '\n  ! iframe не совпадает с областью ячейки ' + fr.area + ': по ширине ' + (fr.miss[0] > 0 ? '+' : '') + fr.miss[0]
        + ', по высоте ' + (fr.miss[1] > 0 ? '+' : '') + fr.miss[1] + ' px («+» — вылез за область, «−» — щель; без CSS борда у 2.0.1 «+4»: чарт = ячейка − 32, а поле с рамкой — 36): CSS борда не растягивает iframe (width / height 100 % !important)' : ''));
    if (c.ready) L.push('  чарт видит: origin ' + c.ready.origin + ', referrer «' + c.ready.referrer + '»');
  }
  for (const st of report.steps) {
    L.push('шаг ' + st.n + (st.name ? ' «' + st.name + '»' : '') + ': ' + st.act + (st.ok ? '' : ' — НЕ ВЫПОЛНЕН: ' + st.err)
      + (st.value !== undefined ? ' → ' + JSON.stringify(st.value).slice(0, 200) : '')
      + ' · iframe ' + st.iframe
      + (st.emits.length ? ' · эмиты: ' + st.emits.join(' | ') : '')
      + (st.channel.length ? ' · канал: ' + st.channel.join(', ') : '')
      + (st.msgs.length ? ' · сообщения: ' + st.msgs.join(', ') : '')
      + (st.errs.length ? ' · ОШИБКИ: ' + st.errs.join(' | ') : '')
      + (st.shot ? ' · снимок ' + st.shot : ''));
  }
  L.push('ошибки окна: ' + (report.errors.length ? '' : 'нет'));
  report.errors.forEach((e) => L.push('  ' + e.chart + ': ' + e.msg + (e.where ? ' (' + e.where + ')' : '') + (e.killed ? ' → ЧАРТ ПОГАС (песочница: clear + dispose)' : /^unhandledrejection/.test(e.msg) ? ' (обработчик ошибок окна не зовётся — чарт жив; в бою — не известно)' : '') + (e.stack ? '\n    ' + e.stack : '')));
  if (report.pageErrors.length) L.push('pageerror Playwright (все фреймы, дубли строк выше): ' + report.pageErrors.join(' | '));
  if (report.consoleErrors.length) L.push('консоль (error): ' + report.consoleErrors.slice(0, 8).join(' | ') + (report.consoleErrors.length > 8 ? ' …' : ''));
  L.push('эмитов applyCrossFilter: ' + report.emits + (all.emits.length ? ' — последний: ' + JSON.stringify(all.emits[all.emits.length - 1].filters).slice(0, 300) : ''));
  L.push('канал скриншотов: ' + report.channel + (all.channel.length ? ' — ' + all.channel.map((x) => marker(x.dataUrl)).slice(-6).join(', ') : ''));
  if (Object.keys(report.other).length) L.push('прочие сообщения родителю: ' + Object.keys(report.other).map((k) => k + '×' + report.other[k]).join(', '));
  if (report.boardCheck) L.push('— kit/board-check.js на этой странице:\n' + report.boardCheck);
  if (o.shot) L.push('снимок: ' + o.shot);
  process.stdout.write(L.join('\n') + '\n');
  process.exit(bad ? 1 : 0);
}

main().catch((e) => { process.stderr.write('run.cjs: ' + (e.stack || e) + '\n'); process.exit(2); });
