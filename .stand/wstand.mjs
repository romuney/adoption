// Стенд виджета: хост как в Proteus, spy applyCrossFilter, сценарий действий.
// node wstand.mjs <chart.js> <mock.json> <scenario.json> [shot.png] [width]
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright'); // NODE_PATH=$(npm root -g)
import fs from 'fs';
const [,, chart, mock, scen, shot, width] = process.argv;
const W = +(width || 1100);
const html = '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><style>html,body{margin:0;background:#f6f6f6}</style></head><body>'
  + '<div _echarts_instance_="ec" style="width:100%;height:900px;position:relative"><canvas width="10" height="10"></canvas></div>'
  + '<script>window.__calls=[];window.applyCrossFilter=function(f){window.__calls.push(JSON.parse(JSON.stringify(f)));};'
  + 'var data = ' + fs.readFileSync(mock, 'utf8') + '; var option = null;<\/script>'
  + '<script>' + fs.readFileSync(chart, 'utf8') + '<\/script></body></html>';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: W, height: 900 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.setContent(html);
await p.waitForTimeout(300);
const steps = JSON.parse(fs.readFileSync(scen, 'utf8'));
const log = [];
for (const s of steps) {
  const n0 = await p.evaluate(() => window.__calls.length);
  if (s.click) {
    const els = await p.$$(s.click);
    const el = els[s.i || 0];
    if (!el) { log.push({ step: s, err: 'нет элемента' }); continue; }
    await el.scrollIntoViewIfNeeded();
    await el.click({ modifiers: s.shift ? ['Shift'] : [] });
    await p.waitForTimeout(60);
  }
  if (s.rerun) {   // перезапуск скрипта (как Proteus после ответа датасета)
    await p.evaluate((src) => { data = window.__nextData || data; (0, eval)(src); }, fs.readFileSync(chart, 'utf8'));
    await p.waitForTimeout(60);
  }
  if (s.setData) await p.evaluate((d) => { window.__nextData = d; }, JSON.parse(fs.readFileSync(s.setData, 'utf8')));
  const calls = await p.evaluate((n) => window.__calls.slice(n), n0);
  const txt = s.text ? await p.evaluate((sel) => Array.prototype.map.call(document.querySelectorAll(sel), e => e.textContent.replace(/\s+/g, ' ').trim()).slice(0, 12), s.text) : undefined;
  log.push({ step: s.name || s.click || 'rerun', calls, txt });
}
if (shot) await p.screenshot({ path: shot, fullPage: true });
console.log(JSON.stringify({ errs, log }, null, 1));
await b.close();
