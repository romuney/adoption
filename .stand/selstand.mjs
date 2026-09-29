// Стенд сверки выбора каталога (2026-09-29): каталог и панель — соседние iframe, родитель играет Proteus.
// Кросс-фильтр каталога → через delay мс панель перезагружается с ответом, где эхо области = маска фильтра.
// Родитель умеет терять запрос (drop) и отвечать не по порядку (slow) — ловим «справа не тот выбор».
// NODE_PATH=$(npm root -g) node .stand/selstand.mjs <catalog.js> <cat.json> <panel.js> <panel.json> [shot-prefix]
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs';
const [,, catJs, catMock, panJs, panMock, shot] = process.argv;
const inner = (js, mock) => '<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%}</style></head><body>'
  + '<div _echarts_instance_="ec" style="width:100%;height:100%;position:relative"></div>'
  + '<script>window.__SRC=' + JSON.stringify(fs.readFileSync(js, 'utf8')) + ';addEventListener("message",function(e){if(e.data&&e.data.type==="__RERUN"){data=JSON.parse(e.data.data);(0,eval)(window.__SRC);}});<\/script>'
  + '<script>window.applyCrossFilter=function(f){parent.postMessage({type:"ECHARTS_APPLY_CROSS_FILTER",filters:f},"*");};var data=' + mock
  + ';var option=null;<\/script><script>' + fs.readFileSync(js, 'utf8') + '<\/script></body></html>';
const panRows = JSON.parse(fs.readFileSync(panMock, 'utf8'));
const page = '<!DOCTYPE html><html><body style="margin:0;display:flex;gap:12px;background:#f6f6f6">'
  + '<iframe id="cat" sandbox="allow-scripts" style="width:560px;height:860px;border:0"></iframe>'
  + '<iframe id="pan" sandbox="allow-scripts" style="width:900px;height:860px;border:0"></iframe>'
  + '<script>window.__emits=[];window.__plan=[];'
  + 'window.addEventListener("message",function(e){var d=e.data||{};if(d.type!=="ECHARTS_APPLY_CROSS_FILTER")return;'
  + 'if(e.source!==document.getElementById("cat").contentWindow)return;'
  + 'var p=window.__plan.shift()||{delay:600};window.__emits.push({f:d.filters,p:p});if(p.drop)return;'
  + 'setTimeout(function(){window.__respond(d.filters);},p.delay);});<\/script></body></html>';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1480, height: 880 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.setContent(page);
// «Ответ Proteus»: панель перезагружается с эхом области под присланную маску.
await p.exposeFunction('__panelFor', (filters) => {
  let mode = '', sel = [];
  for (const f of filters) { if (f.column === 'mode_param') mode = f.value[0]; if (f.column === 'sel_f') sel = f.value; }
  const rows = panRows.map(r => r.section === 'area' ? { ...r, g: sel.length ? mode : '', k: sel.join('\n') } : r);
  return inner(panJs, JSON.stringify(rows));
});
// Как в Proteus: новый ответ — перезапуск скрипта чарта в ТОМ ЖЕ окне iframe (состояние виджета живёт).
await p.exposeFunction('__panelData', (filters) => {
  let mode = '', sel = [];
  for (const f of filters) { if (f.column === 'mode_param') mode = f.value[0]; if (f.column === 'sel_f') sel = f.value; }
  return JSON.stringify(panRows.map(r => r.section === 'area' ? { ...r, g: sel.length ? mode : '', k: sel.join('\n') } : r));
});
await p.evaluate(() => { window.__respond = async (f) => {
  const w = document.getElementById('pan').contentWindow; w.postMessage({ type: '__RERUN', data: await window.__panelData(f) }, '*'); }; });
await p.evaluate(([c, s]) => { document.getElementById('cat').srcdoc = c; document.getElementById('pan').srcdoc = s; },
  [inner(catJs, fs.readFileSync(catMock, 'utf8')), inner(panJs, JSON.stringify(panRows))]);
await p.waitForTimeout(1200);
const cat = () => p.frames().find(f => f.parentFrame() === p.mainFrame() && f.name() === '' && f.url() === 'about:srcdoc');
const frameOf = async (id) => (await (await p.$('#' + id)).contentFrame());
const guard = async () => (await frameOf('pan')).evaluate(() => { const g = document.querySelector('[class$="-selg"], [class*="-selg "]'); return g ? g.className.replace(/^\S+-selg\s?/, '') || 'off' : 'нет'; });
const echo = async () => (await frameOf('pan')).evaluate(() => { const t = document.body.innerText.match(/Отчёт[^\n]*|Отчёты[^\n]*/); return t ? t[0].slice(0, 60) : ''; });
const emits = async () => p.evaluate(() => window.__emits.map(x => { const s = x.f.find(f => f.column === 'sel_f'); const n = x.f.find(f => f.column === 'pa_nonce'); return (s ? s.value.join(',') : '—') + (n ? ' +nonce' : '') + (x.p.drop ? ' (потерян)' : ''); }));
const plan = async (arr) => p.evaluate((a) => { window.__plan = a; }, arr);
const out = [];
const log = async (step) => out.push({ step, guard: await guard(), emits: await emits() });
const cf = await frameOf('cat');
const rows = [0, 1, 2, 3, 4, 5].map(i => ({ click: (o) => cf.locator('[data-rep]').nth(i).click(o) }));
// 1. Быстрые Shift-клики по трём отчётам — должен уйти ОДИН фильтр, панель приглушена до ответа.
await plan([{ delay: 800 }]);
await rows[0].click(); await rows[1].click({ modifiers: ['Shift'] }); await rows[2].click({ modifiers: ['Shift'] });
await p.waitForTimeout(150); await log('1. сразу после 3 кликов');
await p.waitForTimeout(1500); await log('1. после ответа');
if (shot) await p.screenshot({ path: shot + '1.png' });
// 2. Запрос потерялся: панель ждёт, через 12 с — «не совпали» + «Повторить».
await plan([{ drop: true }, { delay: 600 }]);
await rows[3].click({ modifiers: ['Shift'] });
await p.waitForTimeout(1000); await log('2. запрос потерян, 1 с');
await p.waitForTimeout(12500); await log('2. через 13 с');
if (shot) await p.screenshot({ path: shot + '2.png' });
try { await (await frameOf('pan')).click('[data-selretry]', { timeout: 2000 }); } catch (e) { out.push({ step: '2. кнопки «Повторить» нет', guard: await guard(), emits: await emits() }); }
await p.waitForTimeout(1500); await log('2. после «Повторить»');
// 3. Ответы не по порядку: A отвечает медленно, B быстро — последним приходит старый A.
await plan([{ delay: 2500 }, { delay: 300 }]);
await rows[4].click({ modifiers: ['Shift'] }); await p.waitForTimeout(500);
await rows[5].click({ modifiers: ['Shift'] }); await p.waitForTimeout(1200); await log('3. пришёл свежий B');
await p.waitForTimeout(2000); await log('3. следом пришёл старый A');
if (shot) await p.screenshot({ path: shot + '3.png' });
console.log(JSON.stringify({ errs, out }, null, 1));
await b.close();
