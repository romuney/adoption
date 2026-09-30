// Стенд сверки фильтров во ВСЕ стороны (2026-09-29): шапка · каталог · панель «Аудитория области» —
// соседние iframe, родитель играет Proteus по таблице кросс-фильтров листа «Использование»:
//   шапка → каталог + панель; каталог → панель; панель («Кто смотрит») → каталог.
// Эмит источника → каждому получателю через delay мс «новый ответ»: перезапуск скрипта В ТОМ ЖЕ окне
// (как в Proteus) с эхом фильтров flt = маски его источников. План ответов по получателю: delay / drop.
// NODE_PATH=$(npm root -g) node .stand/syncall.mjs <strip.json> <cat.json> <area.json> [shot-prefix]
// SHEET=aud [ONE=1] … <strip.json> <cat_ca.json> <aud.json | one.json> [shot] <bar.json> — лист «Охват ЦА»: каталог вкладки, панель ЦА
//   (pa-audience, эхо — state_j.flt) и строка ЦА (pa-ca-bar): строка → каталог + панель, панель → каталог.
// HEAD=1 (с SHEET=aud ONE=1) — единый лист из трёх чартов: шапка pa-head (период + строка ЦА одним чартом, мок —
//   аргумент <strip.json>, <bar.json> не нужен); её одна маска несёт и period/опции, и ca_*_f.
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs';
const [,, stripMock, catMock, areaMock, shot, barMock] = process.argv;
const AUD = process.env.SHEET === 'aud';
const W = decodeURIComponent(new URL('../Виджеты/', import.meta.url).pathname);
// ONE=1 (с SHEET=aud) — единый лист: панель pa-one (эхо фильтров — в exp строки area, как у pa-area).
const ONE = process.env.ONE === '1', HEAD = process.env.HEAD === '1';
const SRC = { strip: W + (HEAD ? 'pa-head.chart.js' : 'pa-strip.chart.js'), cat: W + 'pa-reports-body.chart.js', pan: W + (ONE ? 'pa-one.chart.js' : AUD ? 'pa-audience.chart.js' : 'pa-area.chart.js'), ca: W + 'pa-ca-bar.chart.js' };
const MOCK = { strip: JSON.parse(fs.readFileSync(stripMock, 'utf8')), cat: JSON.parse(fs.readFileSync(catMock, 'utf8')), pan: JSON.parse(fs.readFileSync(areaMock, 'utf8')), ca: AUD && !HEAD ? JSON.parse(fs.readFileSync(barMock, 'utf8')) : [] };
const inner = (k, rows) => '<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%}</style></head><body>'
  + '<div _echarts_instance_="ec" style="width:100%;height:100%;position:relative"></div>'
  + '<script>window.__SRC=' + JSON.stringify(fs.readFileSync(SRC[k], 'utf8')) + ';addEventListener("message",function(e){if(e.data&&e.data.type==="__RERUN"){data=JSON.parse(e.data.data);(0,eval)(window.__SRC);}});'
  + 'window.applyCrossFilter=function(f){parent.postMessage({type:"ECHARTS_APPLY_CROSS_FILTER",filters:f,who:"' + k + '"},"*");};var data=' + JSON.stringify(rows) + ';var option=null;<\/script>'
  + '<script>' + fs.readFileSync(SRC[k], 'utf8') + '<\/script></body></html>';
// Ответ получателя с эхом фильтров: каталог — state_j total-строки, панель — exp area-строки.
function rowsFor(k, flt) {
  if (k === 'cat') return MOCK.cat.map(r => r.section === 'total' ? { ...r, state_j: JSON.stringify({ ...(r.state_j ? JSON.parse(r.state_j) : {}), flt }) } : r);
  if (k === 'pan' && AUD && !ONE) return MOCK.pan.map(r => r.section === 'total' ? { ...r, state_j: JSON.stringify({ ...JSON.parse(r.state_j || '{}'), flt }) } : r);
  if (k === 'pan') {
    const sel = flt.sel_f || [], mode = (flt.mode_param || [''])[0];
    return MOCK.pan.map(r => r.section === 'area' ? { ...r, g: sel.length ? mode : '', k: sel.join('\n'), exp: JSON.stringify(flt) } : r);
  }
  return MOCK[k];
}
const page = '<!DOCTYPE html><html><body style="margin:0;background:#f6f6f6;display:grid;grid-template-columns:560px 900px;grid-template-rows:' + (HEAD ? 460 : 64) + 'px 820px;gap:10px">'
  + '<iframe id="strip" sandbox="allow-scripts" style="grid-column:1/3;width:100%;height:' + (HEAD ? 460 : 64) + 'px;border:0"></iframe>'
  + '<iframe id="cat" sandbox="allow-scripts" style="width:560px;height:820px;border:0"></iframe>'
  + '<iframe id="pan" sandbox="allow-scripts" style="width:900px;height:820px;border:0"></iframe>'
  + (AUD && !HEAD ? '<iframe id="ca" sandbox="allow-scripts" style="position:absolute;left:0;top:900px;width:1470px;height:460px;border:0"></iframe>' : '') + '</body></html>';
const SCOPE = { strip: ['cat', 'pan'], cat: ['pan'], pan: ['cat'], ca: ['cat', 'pan'] };   // кросс-фильтры Proteus
const FEEDS = AUD ? { cat: ['strip', 'pan', 'ca'], pan: ['strip', 'cat', 'ca'] } : { cat: ['strip', 'pan'], pan: ['strip', 'cat'] };
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1480, height: AUD ? 1380 : 900 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.setContent(page);
const masks = { strip: [], cat: [], pan: [], ca: [] }, plan = { cat: [], pan: [] }, sent = [];
await p.exposeFunction('__emit', async (who, filters) => {
  masks[who] = filters.filter(f => f.column !== 'pa_nonce');
  const nonce = filters.some(f => f.column === 'pa_nonce');
  for (const r of SCOPE[who] || []) {
    const pl = plan[r].shift() || { delay: 500 };
    sent.push(who + '→' + r + (nonce ? ' (повтор)' : '') + (pl.drop ? ' ПОТЕРЯН' : ''));
    if (pl.drop) continue;
    const flt = {};
    for (const s of FEEDS[r]) for (const f of masks[s]) flt[f.column] = f.value;
    setTimeout(() => p.evaluate(([id, d]) => document.getElementById(id).contentWindow.postMessage({ type: '__RERUN', data: d }, '*'), [r, JSON.stringify(rowsFor(r, flt))]).catch(() => {}), pl.delay);
  }
});
await p.evaluate(() => window.addEventListener('message', (e) => { const d = e.data || {}; if (d.type === 'ECHARTS_APPLY_CROSS_FILTER') window.__emit(d.who, d.filters); }));
for (const k of (AUD && !HEAD ? ['strip', 'cat', 'pan', 'ca'] : ['strip', 'cat', 'pan'])) await p.evaluate(([id, s]) => { document.getElementById(id).srcdoc = s; }, [k, inner(k, rowsFor(k, {}))]);
await p.waitForTimeout(1500);
const fr = async (id) => (await (await p.$('#' + id)).contentFrame());
const g = async (id) => (await fr(id)).evaluate(() => { const x = document.querySelector('[class$="-selg"],[class*="-selg "]'); if (!x || !/\bon\b/.test(x.className)) return 'нет'; return (x.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70); });
const out = [];
const log = async (step) => { out.push({ step, cat: await g('cat'), pan: await g('pan'), sent: sent.splice(0).join(', ') }); };
const click = async (id, sel, i, mod) => (await fr(HEAD && id === 'ca' ? 'strip' : id)).locator(sel).nth(i || 0).click(mod ? { modifiers: [mod] } : {});
if (AUD) {
  plan.cat = [{ delay: 900 }]; plan.pan = [{ delay: 1400 }];
  await click('strip', '[data-grain="m"]');
  await p.waitForTimeout(200); await log('A1. шапка — сразу');
  await p.waitForTimeout(1600); await log('A1. шапка — после ответов');
  plan.cat = [{ delay: 800 }]; plan.pan = [{ delay: 1200 }];
  await click('ca', '[data-cadd="spec"]'); await p.waitForTimeout(200);
  await click('ca', 'input[data-cack^="spec|"]', 0); await p.waitForTimeout(200);
  await click('ca', '[data-caapply]');
  await p.waitForTimeout(200); await log('A2. строка ЦА «Применить» — сразу');
  await p.waitForTimeout(1500); await log('A2. после ответов');
  plan.pan = [{ delay: 7000 }];
  await click('cat', '[data-rep]', 0);
  await p.waitForTimeout(1000); await log('A3. каталог вкладки → панель, медленный ответ (7 с)');
  await p.waitForTimeout(5000); await log('A3. 6 с — ждём, без повтора');
  await p.waitForTimeout(1600); await log('A3. после ответа');
  if (shot) await p.screenshot({ path: shot + 'aud.png' });
  console.log(JSON.stringify({ errs, out }, null, 1));
  await b.close();
  process.exit(0);
}
// 1. Шапка: период «12 месяцев» → каталог и панель приглушены до ответа.
plan.cat = [{ delay: 900 }]; plan.pan = [{ delay: 1400 }];
await click('strip', '[data-grain="m"]');
await p.waitForTimeout(200); await log('1. шапка: 12 месяцев — сразу');
await p.waitForTimeout(1600); await log('1. шапка: после ответов');
// 2. «Кто смотрит»: клик по человеку → каталог приглушён до ответа.
await click('pan', '[data-view="view:who"]'); await p.waitForTimeout(300);
plan.cat = [{ delay: 900 }];
await click('pan', '[data-whocut="login"]', 0);
await p.waitForTimeout(200); await log('2. клик по человеку — сразу');
await p.waitForTimeout(1300); await log('2. после ответа каталогу');
if (shot) await p.screenshot({ path: shot + '2.png' });
// 3. Медленный ответ (8 с) — НЕ повторяем, просто ждём; ни одного «(повтор)» в отправленных.
plan.cat = [{ delay: 8000 }];
await click('pan', '[data-whocut="login"]', 1, 'Shift');
await p.waitForTimeout(300); await log('3. медленный ответ каталогу — 0,3 с');
await p.waitForTimeout(7000); await log('3. 7,3 с — всё ещё ждём, без повтора');
await p.waitForTimeout(1500); await log('3. после ответа');
// 4. Каталог → панель: старый ответ пришёл после свежего → через 10 с автоповтор.
plan.pan = [{ delay: 2500 }, { delay: 300 }, { delay: 600 }];
await click('cat', '[data-rep]', 0); await p.waitForTimeout(450);
await click('cat', '[data-rep]', 1, 'Shift'); await p.waitForTimeout(1000); await log('4. свежий ответ панели');
await p.waitForTimeout(1600); await log('4. следом старый ответ');
await p.waitForTimeout(10200); await log('4. через 10 с — автоповтор');
if (shot) await p.screenshot({ path: shot + '4.png' });
await p.waitForTimeout(1200); await log('4. после повторного ответа');
// 5. Ответ потерян — сами не повторяем; через 60 с кнопка, ручной повтор.
plan.pan = [{ drop: true }, { delay: 500 }];
await click('cat', '[data-rep]', 2, 'Shift');
await p.waitForTimeout(8000); await log('5. потерян, 8 с — ждём, без повтора');
await p.waitForTimeout(53000); await log('5. 61 с — кнопка');
if (shot) await p.screenshot({ path: shot + '5.png' });
await (await fr('pan')).click('[data-selretry]');
await p.waitForTimeout(1200); await log('5. после ручного «Повторить»');
console.log(JSON.stringify({ errs, out }, null, 1));
await b.close();
