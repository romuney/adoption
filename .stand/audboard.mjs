// Рендер листа «Аудитория» как в Proteus: шапка периода · строка «Целевая аудитория» · каталог | панель.
// Каждый чарт — в своём <iframe sandbox="allow-scripts">; строка ЦА обёрнута в разметку ячейки Proteus
// (.dashboard-chart-id-N › … › #chart-id-N › iframe + img.echarts-plugin), родитель кладёт dataUrl из
// ECHARTS_UPDATE_DATA_URL в img, CSS борда — из файла поставки. Так видно раскрытие поверх листа.
// node audboard.mjs <папка моков> <board.css> <сценарий.json> <папка скринов> [ширина]
// Моки: strip.json, bar.json, cat.json, aud.json (+ любые для шага reload).
// Сценарий: [{frame:'bar'|'cat'|'pan'|'strip', click:sel, i?, type?:текст, reload?:{cat:'x.json',pan:'y.json'}, shot?:'имя'}]
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright'); // NODE_PATH=$(npm root -g)
import fs from 'fs';
import path from 'path';
const [,, dir, cssFile, scen, outDir, width] = process.argv;
const W = +(width || 1600), GAP = 16, HEAD = 64, BAR = 64, ROW = 980, CID = '000000';
const WD = decodeURIComponent(new URL('../Виджеты/', import.meta.url).pathname);
const inner = (js, mock) => '<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#f6f6f6}</style></head><body>'
  + '<div _echarts_instance_="ec" style="width:100%;height:100%;position:relative"><canvas></canvas></div>'
  + '<script>window.applyCrossFilter=function(f){parent.postMessage({type:"ECHARTS_APPLY_CROSS_FILTER",filters:f},"*");};var data='
  + fs.readFileSync(path.join(dir, mock), 'utf8') + ';var option=null;<\/script><script>' + fs.readFileSync(WD + js, 'utf8') + '<\/script></body></html>';
const cw = Math.round((W - GAP * 3) * 0.38), pw = W - GAP * 3 - cw;
const page = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;background:#f6f6f6;font-family:Inter,Arial}'
  + '.g{display:grid;gap:' + GAP + 'px;padding:' + GAP + 'px;grid-template-columns:' + cw + 'px ' + pw + 'px}'
  + (process.env.TABS ? '.ant-tabs-nav{display:flex;position:relative}.ant-tabs-nav::before{content:"";position:absolute;left:0;right:0;bottom:0;border-bottom:1px solid #f0f0f0}.ant-tabs-nav-wrap{display:flex;flex:auto}.ant-tabs-nav-list{display:flex;position:relative}.ant-tabs-tab{position:relative;display:inline-flex;align-items:center;cursor:pointer}.ant-tabs-ink-bar{position:absolute;bottom:0;display:none}' : '') + (process.env.TABS_OLD ? ':root{--dashboard-background:#e9ebef}.ant-tabs-nav-wrap,div[role="tabpanel"]{background:var(--dashboard-background)}.css-5smd5r .ant-tabs .ant-tabs-nav-wrap{min-height:50px}.ant-tabs-nav-wrap{height:68px;padding-top:20px;padding-bottom:16px}.dashboard-component-tabs{background:#eceef1 !important}.dashboard-component-tabs .ant-tabs-card>.ant-tabs-nav .ant-tabs-nav-list{display:flex;gap:10px}.dashboard-component-tabs .ant-tabs .ant-tabs-nav .ant-tabs-tab .ant-tabs-tab-btn{background:#e3e5e9 !important;border-radius:8px !important;padding:6px 12px !important;font:14px Inter,Arial;color:#6b7280 !important}.dashboard-component-tabs .ant-tabs .ant-tabs-nav .ant-tabs-tab.ant-tabs-tab-active .ant-tabs-tab-btn{background:#5f6673 !important;color:#fff !important}' : '') + '.full{grid-column:1/3}.cell{border-radius:12px;background:#fff}iframe{border:0;display:block;width:100%;height:100%;background:transparent}'
  + '.dashboard-chart,.chart-container,.slice_container,.react_sanbbox{width:100%;height:100%}img.echarts-plugin{display:none}'
  + fs.readFileSync(cssFile, 'utf8').split('000000').join(CID) + '</style></head><body>'
  + '<div class="g">'
  + '<div class="full cell" style="height:' + HEAD + 'px"><iframe sandbox="allow-scripts" data-f="strip"></iframe></div>'
  // Нативные вкладки дашборда (разметка Superset/antd) — если задан TABS="Имя1|Имя2", активна вторая.
  + (process.env.TABS ? '<div class="full dashboard-component dashboard-component-tabs css-5smd5r"><div id="TABS-0_qu3WRrvg" class="ant-tabs ant-tabs-top ant-tabs-card css-blq4an"><div class="ant-tabs-nav" role="tablist"><div class="ant-tabs-nav-wrap"><div class="ant-tabs-nav-list">'
    + process.env.TABS.split('|').map((t, i) => '<div class="ant-tabs-tab' + (i === 1 ? ' ant-tabs-tab-active' : '') + '"><div class="ant-tabs-tab-btn" role="tab"><span class="editable-title">' + t + '</span><span class="anchor-link-container"><span role="img" class="anticon"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></span></span></div></div>').join('')
    + '<div class="ant-tabs-ink-bar"></div></div></div></div></div></div>' : '')
  + '<div class="full cell dashboard-component-chart-holder" style="height:' + BAR + 'px"><div class="dashboard-chart dashboard-chart-id-' + CID + '">'
  + '<div class="chart-container"><div class="slice_container"><div id="chart-id-' + CID + '" style="width:100%;height:100%"><div class="react_sanbbox">'
  + '<iframe sandbox="allow-scripts" data-f="bar"></iframe></div></div><img class="echarts-plugin"></div></div></div></div>'
  + '<div class="cell" style="height:' + ROW + 'px"><iframe sandbox="allow-scripts" data-f="cat"></iframe></div>'
  + '<div class="cell" style="height:' + ROW + 'px"><iframe sandbox="allow-scripts" data-f="pan"></iframe></div>'
  + '</div><script>window.__emits=[];window.addEventListener("message",function(e){var d=e.data||{};'
  + 'if(d.type==="ECHARTS_UPDATE_DATA_URL")document.querySelector("img.echarts-plugin").src=d.dataUrl;'
  + 'if(d.type==="ECHARTS_APPLY_CROSS_FILTER")window.__emits.push(JSON.stringify(d.filters));});<\/script></body></html>';
const SRC = { strip: ['pa-strip.chart.js', 'strip.json'], bar: ['pa-ca-bar.chart.js', 'bar.json'], cat: ['pa-reports-body.chart.js', 'cat.json'], pan: ['pa-audience.chart.js', 'aud.json'] };
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: W, height: HEAD + BAR + ROW + GAP * 4 + (process.env.TABS ? 60 : 0) } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.setContent(page);
const load = async (k, mock) => { await p.evaluate(([k, s]) => { document.querySelector('iframe[data-f="' + k + '"]').srcdoc = s; }, [k, inner(SRC[k][0], mock || SRC[k][1])]); };
for (const k of Object.keys(SRC)) await load(k);
await p.waitForTimeout(1200);
const frameOf = async (k) => (await (await p.$('iframe[data-f="' + k + '"]')).contentFrame());
fs.mkdirSync(outDir, { recursive: true });
const log = [];
for (const s of JSON.parse(fs.readFileSync(scen, 'utf8'))) {
  if (s.reload) { for (const k of Object.keys(s.reload)) await load(k, s.reload[k]); await p.waitForTimeout(900); }
  if (s.click) {
    const f = await frameOf(s.frame || 'bar');
    const el = (await f.$$(s.click))[s.i || 0];
    if (!el) { log.push({ s: s.click, err: 'нет элемента' }); continue; }
    await el.click();
    await p.waitForTimeout(250);
  }
  if (s.type) { await p.keyboard.type(s.type, { delay: 20 }); await p.waitForTimeout(200); }
  if (s.shot) await p.screenshot({ path: path.join(outDir, s.shot + '.png') });
  const txt = s.text ? await (await frameOf(s.frame || 'bar')).evaluate((q) => Array.prototype.map.call(document.querySelectorAll(q), (e) => e.textContent.replace(/\s+/g, ' ').trim()).slice(0, 14), s.text) : undefined;
  const ifr = await p.evaluate(() => { const r = document.querySelector('iframe[data-f="bar"]').getBoundingClientRect(); return Math.round(r.height); });
  log.push({ step: s.shot || s.click || 'reload', barIframe: ifr, emits: await p.evaluate(() => window.__emits.splice(0)), txt });
}
console.log(JSON.stringify({ errs, log }, null, 1));
await b.close();
