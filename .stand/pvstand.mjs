// Стенд «мгновенной панели по клику» (2026-10-22): шапка · каталог · панель единого листа — соседние iframe, родитель
// играет Proteus (кросс-фильтры с задержкой ответа). Каталог по клику на отчёт из топа шлёт панели блок pv (PA_PREV) —
// панель обязана нарисовать KPI / «Динамику» сразу, до своего ответа; свой ответ — заменить, числа те же.
// NODE_PATH=$(npm root -g) [GRAIN=w|m|q] node .stand/pvstand.mjs <папка ответов> [скрин-префикс]
//   в папке: head.json, cat.json (каталог с WITH_CA), one.json (панель без выбора), one_<id>.json (панель по отчёту id)
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs';
const [,, dir, shot] = process.argv;
const W = decodeURIComponent(new URL('../Виджеты/', import.meta.url).pathname);
const SRC = { strip: W + 'pa-head.chart.js', cat: W + 'pa-reports-body.chart.js', pan: W + 'pa-one.chart.js' };
const J = (f) => JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8'));
const MOCK = { strip: J('head.json'), cat: J('cat.json'), pan: J('one.json') };
const inner = (k, rows) => '<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%}</style></head><body>'
  + '<div _echarts_instance_="ec" style="width:100%;height:100%;position:relative"></div>'
  + '<script>window.__SRC=' + JSON.stringify(fs.readFileSync(SRC[k], 'utf8')) + ';addEventListener("message",function(e){if(e.data&&e.data.type==="__RERUN"){data=JSON.parse(e.data.data);(0,eval)(window.__SRC);}});'
  + 'window.applyCrossFilter=function(f){parent.postMessage({type:"ECHARTS_APPLY_CROSS_FILTER",filters:f,who:"' + k + '"},"*");};var data=' + JSON.stringify(rows) + ';var option=null;<\/script>'
  + '<script>' + fs.readFileSync(SRC[k], 'utf8') + '<\/script></body></html>';
// ответ получателя с эхом фильтров: каталог — в sj, панель — по выбранному отчёту (one_<id>.json), эхо — в flt
function rowsFor(k, flt) {
  if (k === 'cat') return MOCK.cat.map(r => r.section === 'sj' ? { ...r, k: JSON.stringify({ ...JSON.parse(r.k || '{}'), flt }) } : r);
  if (k === 'pan') {
    const sel = flt.sel_f || [];
    const base = sel.length === 1 && fs.existsSync(dir + '/one_' + sel[0] + '.json') ? J('one_' + sel[0] + '.json') : MOCK.pan;
    return base.map(r => r.section === 'flt' ? { ...r, k: JSON.stringify(flt) } : r);
  }
  return MOCK[k];
}
const page = '<!DOCTYPE html><html><body style="margin:0;background:#f6f6f6;display:grid;grid-template-columns:560px 900px;grid-template-rows:460px 820px;gap:10px">'
  + '<iframe id="strip" sandbox="allow-scripts" style="grid-column:1/3;width:100%;height:460px;border:0"></iframe>'
  + '<iframe id="cat" sandbox="allow-scripts" style="width:560px;height:820px;border:0"></iframe>'
  + '<iframe id="pan" sandbox="allow-scripts" style="width:900px;height:820px;border:0"></iframe></body></html>';
const SCOPE = { strip: ['cat', 'pan'], cat: ['pan'], pan: ['cat'] };
const FEEDS = { cat: ['strip', 'pan'], pan: ['strip', 'cat'] };
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1480, height: 1300 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.setContent(page);
const masks = { strip: [], cat: [], pan: [] }, plan = { cat: [], pan: [] }, sent = [];
await p.exposeFunction('__emit', async (who, filters) => {
  masks[who] = filters.filter(f => f.column !== 'pa_nonce');
  for (const r of SCOPE[who] || []) {
    const pl = plan[r].shift() || { delay: 500 };
    const flt = {};
    for (const s of FEEDS[r]) for (const f of masks[s]) flt[f.column] = f.value;
    sent.push(who + '→' + r + ' ' + JSON.stringify(flt.sel_f || []) + (pl.drop ? ' ПОТЕРЯН' : '') + ' (' + pl.delay + ' мс)');
    if (pl.drop) continue;
    setTimeout(() => p.evaluate(([id, d]) => document.getElementById(id).contentWindow.postMessage({ type: '__RERUN', data: d }, '*'), [r, JSON.stringify(rowsFor(r, flt))]).catch(() => {}), pl.delay);
  }
});
await p.evaluate(() => window.addEventListener('message', (e) => { const d = e.data || {}; if (d.type === 'ECHARTS_APPLY_CROSS_FILTER') window.__emit(d.who, d.filters); }));
for (const k of ['strip', 'cat', 'pan']) await p.evaluate(([id, s]) => { document.getElementById(id).srcdoc = s; }, [k, inner(k, rowsFor(k, {}))]);
await p.waitForTimeout(1500);
const fr = async (id) => (await (await p.$('#' + id)).contentFrame());
// что видно на панели: KPI «Пользователей», заголовок области, плашка сверки, заглушка вкладки
const pan = async () => (await fr('pan')).evaluate(() => {
  const k = [...document.querySelectorAll('[class$="-kpi"]')].map(x => (x.querySelector('[class$="-k-lt"]') || {}).textContent + '=' + (x.querySelector('[class$="-k-val"]') || {}).textContent);
  const g = document.querySelector('[class$="-selg"],[class*="-selg "]');
  const pend = document.querySelector('[class$="-pend"]');
  const area = (document.querySelector('[class$="-h-area"]') || {}).textContent;
  const tabs = [...document.querySelectorAll('[data-view^="view:"]')].map(t => Math.round(t.getBoundingClientRect().width)).join(',');
  return { kpi: k.slice(0, 2).join(' · '), area, tabs, plaque: g && /\bon\b/.test(g.className) ? g.textContent.replace(/\s+/g, ' ').trim().slice(0, 50) : '', pend: pend ? pend.textContent.replace(/\s+/g, ' ').trim().slice(0, 60) : '' };
});
const out = [];
const log = async (step) => { out.push({ step, ...(await pan()), sent: sent.splice(0).join(', ') }); };
const click = async (id, sel, i) => (await fr(id)).locator(sel).nth(i || 0).click();
const pvUsers = (id) => { const r = MOCK.cat.find(x => x.section === 'pv' && x.g === String(id)); return r ? r.k.split('|')[0] : null; };
const repAt = async (i) => (await fr('cat')).evaluate((i) => document.querySelectorAll('[data-rep]')[i].getAttribute('data-rep'), i);
// GRAIN=m — сначала период в шапке (ответы в папке — под этот период)
if (process.env.GRAIN) { plan.cat = [{ delay: 300 }]; plan.pan = [{ delay: 300 }]; await click('strip', '[data-grain="' + process.env.GRAIN + '"]'); await p.waitForTimeout(1500); }
await log('0. весь Proteus');
// P1. Клик по отчёту из топа: ответ панели через 4 с — KPI и «Динамика» сразу, «Кто смотрит» — «догружается».
let id = await repAt(0);
plan.pan = [{ delay: 4000 }];
await click('cat', '[data-rep]', 0);
await p.waitForTimeout(350); await log('P1. 0,35 с после клика по отчёту ' + id + ' (в блоке pv: ' + pvUsers(id) + ' польз.)');
if (shot) await p.screenshot({ path: shot + '1-dyn.png' });
await click('pan', '[data-view="view:who"]'); await p.waitForTimeout(200);
await log('P1. вкладка «Кто смотрит» до ответа');
if (shot) await p.screenshot({ path: shot + '1-who.png' });
await click('pan', '[data-view="view:cal"]'); await p.waitForTimeout(200);
const calTxt = await (await fr('pan')).evaluate(() => (document.querySelector('[class*="-panel-b"]') || { textContent: '' }).textContent.replace(/\s+/g, ' ').slice(0, 120));
out.push({ step: 'P1. «Календарь» до ответа', cal: calTxt });
if (shot) await p.screenshot({ path: shot + '1-cal.png' });
await p.waitForTimeout(4000); await log('P1. ответ панели пришёл');
await click('pan', '[data-view="view:dyn"]'); await p.waitForTimeout(300);
// P2. Быстро: отчёт X (панель считает 3 с), через 0,7 с — Y: Y виден сразу и не сменяется ответом под X.
plan.pan = [{ delay: 3000 }, { delay: 3000 }];
const x = await repAt(1), y = await repAt(2);
await click('cat', '[data-rep]', 1); await p.waitForTimeout(700);
await click('cat', '[data-rep]', 2); await p.waitForTimeout(300);
await log('P2. клик X=' + x + ', через 0,7 с Y=' + y + ' (pv: ' + pvUsers(x) + ' / ' + pvUsers(y) + ')');
await p.waitForTimeout(2300); await log('P2. ответ под X пришёл — на экране всё ещё Y');
await p.waitForTimeout(3500); await log('P2. ответ под Y пришёл');
// P3. Снять выбор — весь Proteus (блока нет: обычное ожидание с плашкой).
plan.pan = [{ delay: 1500 }];
await click('cat', '[data-rep]', 2); await p.waitForTimeout(700);
await log('P3. снят выбор, 0,7 с');
await p.waitForTimeout(1200); await log('P3. ответ пришёл');
console.log(JSON.stringify({ errs, out }, null, 1));
await b.close();
