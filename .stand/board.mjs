// Стенд-борд листа «Отчёты»: три чарта в сетке как в Proteus (шапка во всю
// ширину, каталог ~38% | панель ~62%), каждый — в своём iframe, как в бою.
// node board.mjs <папка моков> <out.png> [ширина] [clicks.json]
// В папке моков: strip.json, body.json, area.json (ответы датасетов со стенда).
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright'); // NODE_PATH=$(npm root -g)
import fs from 'fs';
import path from 'path';
const [,, dir, out, width, clicks] = process.argv;
const W = +(width || 1600), HEAD = 104, ROW = 1000, GAP = 16;
const W_ = decodeURIComponent(new URL('../Виджеты/', import.meta.url).pathname);
const frame = (js, mock) => '<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#f6f6f6;height:100%}</style></head><body>' +
  '<div _echarts_instance_="ec" style="width:100%;height:100%;position:relative"><canvas></canvas></div>' +
  '<script>window.applyCrossFilter=function(f){parent.__calls.push(JSON.parse(JSON.stringify(f)));};var data=' +
  fs.readFileSync(path.join(dir, mock), 'utf8') + ';var option=null;<\/script><script>' + fs.readFileSync(W_ + js, 'utf8') + '<\/script></body></html>';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const cw = Math.round((W - GAP * 3) * 0.38), pw = W - GAP * 3 - cw;
const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;background:#f6f6f6;font-family:Inter,Arial}' +
  'iframe{border:0;display:block;background:#f6f6f6}.g{display:grid;gap:' + GAP + 'px;padding:' + GAP + 'px;grid-template-columns:' + cw + 'px ' + pw + 'px}' +
  '.h{grid-column:1/3;height:' + HEAD + 'px}.r{height:' + ROW + 'px}</style></head><body><script>window.__calls=[];<\/script><div class="g">' +
  '<iframe class="h" style="width:100%" srcdoc="' + esc(frame('pa-strip.chart.js', 'strip.json')) + '"></iframe>' +
  '<iframe class="r" style="width:100%" srcdoc="' + esc(frame('pa-reports-body.chart.js', 'body.json')) + '"></iframe>' +
  '<iframe class="r" style="width:100%" srcdoc="' + esc(frame('pa-area.chart.js', 'area.json')) + '"></iframe>' +
  '</div></body></html>';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: W, height: HEAD + ROW + GAP * 3 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.setContent(html);
await p.waitForTimeout(900);
if (clicks) {
  for (const c of JSON.parse(fs.readFileSync(clicks, 'utf8'))) {
    const f = p.frames()[c.frame];
    const el = (await f.$$(c.click))[c.i || 0];
    if (el) { await el.click(); await p.waitForTimeout(300); } else errs.push('нет ' + c.click);
  }
}
await p.screenshot({ path: out });
const fe = [];
for (const f of p.frames().slice(1)) fe.push(await f.evaluate(() => (document.querySelector('[class$=-overlay]') || {}).innerText ? 'ok' : 'пусто'));
console.log(JSON.stringify({ errs, frames: fe }));
await b.close();
