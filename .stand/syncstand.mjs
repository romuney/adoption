// Стенд синхронизации выбора двух каталогов (листы «Использование» и «Охват ЦА»).
// Два каталога в своих iframe; посредник вместо Proteus: эмит одного каталога (cat_sync_f) → перезапуск
// другого с этим значением в state_j.sync (так же, как вернул бы его датасет). Считает эмиты — ловит зацикливание.
// node syncstand.mjs <mock.json> <out-prefix>
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs';
const [,, mock, out] = process.argv;
const js = fs.readFileSync(decodeURIComponent(new URL('../Виджеты/pa-reports-body.chart.js', import.meta.url).pathname), 'utf8');
const base = JSON.parse(fs.readFileSync(mock, 'utf8'));
const frame = (name) => '<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#f6f6f6}</style></head><body>'
  + '<div _echarts_instance_="ec" style="width:100%;height:100%;position:relative"><canvas></canvas></div>'
  + '<script>window.applyCrossFilter=function(f){parent.__emit("' + name + '",JSON.parse(JSON.stringify(f)));};'
  + 'window.__run=function(d){data=d;(0,eval)(window.__src);};var data=[];var option=null;<\/script></body></html>';
const page = '<!DOCTYPE html><html><body style="margin:0;display:flex;gap:12px;background:#ddd">'
  + '<iframe id="A" style="border:0;width:620px;height:760px"></iframe><iframe id="B" style="border:0;width:620px;height:760px"></iframe>'
  + '<script>window.__log=[];window.__emit=function(n,f){window.__log.push([n,f]);};<\/script></body></html>';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1260, height: 770 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.setContent(page);
for (const n of ['A', 'B']) await p.evaluate(([n, h]) => { document.getElementById(n).srcdoc = h; }, [n, frame(n)]);
await p.waitForTimeout(300);
const fr = async (n) => (await (await p.$('#' + n)).contentFrame());
const withSync = (code) => base.map(r => {
  if (r.section !== 'total') return r;
  const sj = JSON.parse(r.state_j || '{}'); if (code == null) delete sj.sync; else sj.sync = code;
  return Object.assign({}, r, { state_j: JSON.stringify(sj) });
});
const run = async (n, code) => { const f = await fr(n); await f.evaluate(([src, d]) => { window.__src = src; window.__run(d); }, [js, withSync(code)]); await p.waitForTimeout(120); };
// Посредник: пока есть эмиты — отдаём последний cat_sync_f каталога-отправителя другому каталогу.
async function relay() {
  for (let guard = 0; guard < 10; guard++) {
    const log = await p.evaluate(() => window.__log.splice(0));
    if (!log.length) return guard;
    for (const [n, f] of log) {
      const s = f.find(x => x.column === 'cat_sync_f');
      emits.push(n + ': ' + JSON.stringify(f.filter(x => x.column !== 'cat_sync_f').map(x => x.column + '=' + x.value.join('|'))) + ' sync=' + (s ? s.value[0] : '—'));
      await run(n === 'A' ? 'B' : 'A', s ? s.value[0] : null);
    }
  }
  return 'ЗАЦИКЛИЛОСЬ';
}
const emits = [], res = [];
const state = async (n) => (await fr(n)).evaluate(() => ({ sel: document.querySelectorAll('.prb-urow.sel').length, chips: Array.prototype.map.call(document.querySelectorAll('[data-unpick]'), e => e.getAttribute('data-unpick')).join(' ') }));
await run('A', null); await run('B', null); await p.evaluate(() => window.__log.splice(0));
// 1) клик по строке в A (лист «Использование»)
await (await (await fr('A')).$$('.prb-urow'))[0].click(); await p.waitForTimeout(100);
res.push(['клик по отчёту в A', await relay(), await state('A'), await state('B')]);
await p.screenshot({ path: out + '_1_выбор_в_A.png' });
// 2) Shift+клик второй строки в B (лист «Охват ЦА») — накопление
await (await (await fr('B')).$$('.prb-urow'))[1].click({ modifiers: ['Shift'] }); await p.waitForTimeout(100);
res.push(['Shift+клик в B', await relay(), await state('A'), await state('B')]);
// 3) снять всё в B
const clr = await (await fr('B')).$('[data-unpick="*"]');
if (clr) { await clr.click(); await p.waitForTimeout(100); }
res.push(['«Снять все» в B', await relay(), await state('A'), await state('B')]);
await p.screenshot({ path: out + '_3_снято_в_B.png' });
console.log(JSON.stringify({ errs, res, emits }, null, 1));
await b.close();
