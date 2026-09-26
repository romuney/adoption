// Стенд «iframe как в Proteus»: чарт в <iframe sandbox="allow-scripts"> размером с ячейку,
// родитель кладёт dataUrl из ECHARTS_UPDATE_DATA_URL в img.echarts-plugin, CSS борда — из файла.
// node ifstand.mjs <chart.js> <mock.json> <board.css> <chartId> <сценарий.json> <shot-prefix>
// Сценарий: [{click: селектор ВНУТРИ iframe, i?, shot?: 'имя'}, {parentClick: [x, y]}, …]
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs';
const [,, chart, mock, css, cid, scen, shot] = process.argv;
const inner = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#fff}</style></head><body>'
  + '<div _echarts_instance_="ec" style="width:100%;height:100%;position:relative"><canvas width="10" height="10"></canvas></div>'
  + '<script>window.applyCrossFilter=function(f){parent.postMessage({type:"ECHARTS_APPLY_CROSS_FILTER",filters:f},"*");};'
  + 'var data = ' + fs.readFileSync(mock, 'utf8') + '; var option = null;<\/script>'
  + '<script>' + fs.readFileSync(chart, 'utf8') + '<\/script></body></html>';
const page = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;background:#f6f6f6;font:13px Arial}'
  + '.grid-row{display:flex;gap:16px;padding:8px 16px}.dashboard-component-chart-holder{flex:1;background:#fff;border-radius:12px}'
  + '.dashboard-chart,.chart-container,.slice_container,.react_sanbbox{width:100%;height:100%}.react_sanbbox iframe{border:0;width:100%;height:100%;display:block}'
  + 'img.echarts-plugin{display:none}.below{height:560px;background:repeating-linear-gradient(45deg,#dfe8f5 0 12px,#eef3fa 12px 24px);padding:16px}'
  + fs.readFileSync(css, 'utf8') + '</style></head><body>'
  + '<div class="grid-row" style="height:64px"><div class="dashboard-component-chart-holder"><div class="dashboard-chart dashboard-chart-id-' + cid + '">'
  + '<div class="slice-header" style="height:0"></div><div class="chart-container"><div class="slice_container"><div id="chart-id-' + cid + '" style="width:100%;height:100%"><div class="react_sanbbox"><iframe sandbox="allow-scripts" id="fr"></iframe></div></div>'
  + '<img class="echarts-plugin"></div></div></div></div></div>'
  + '<div class="grid-row"><div class="dashboard-component-chart-holder below"><button id="under">кнопка чарта ниже</button> Каталог и панель</div></div>'
  + '<script>window.__msgs=[];window.__clicks=0;document.getElementById("under").onclick=function(){window.__clicks++;};'
  + 'window.addEventListener("message",function(e){var d=e.data||{};window.__msgs.push(d.type+(d.filters?":"+JSON.stringify(d.filters):""));'
  + 'if(d.type==="ECHARTS_UPDATE_DATA_URL")document.querySelector("img.echarts-plugin").src=d.dataUrl;});<\/script></body></html>';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 820 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.setContent(page);
await p.evaluate((s) => { document.getElementById('fr').srcdoc = s; }, inner);
await p.waitForTimeout(500);
const fr = p.frames().find(f => f !== p.mainFrame());
const log = [];
for (const s of JSON.parse(fs.readFileSync(scen, 'utf8'))) {
  const m0 = await p.evaluate(() => window.__msgs.length);
  if (s.click) { const els = await fr.$$(s.click); if (!els[s.i || 0]) { log.push({ s, err: 'нет элемента' }); continue; } await els[s.i || 0].click(); }
  if (s.parentClick) await p.mouse.click(s.parentClick[0], s.parentClick[1]);
  await p.waitForTimeout(250);
  const st = await p.evaluate(() => { const f = document.getElementById('fr').getBoundingClientRect(); return { ifr: Math.round(f.width) + '×' + Math.round(f.height), marker: /UEEtQ0EtREQtT04x/.test(document.querySelector('img.echarts-plugin').src || ''), under: window.__clicks }; });
  const msgs = await p.evaluate((n) => window.__msgs.slice(n), m0);
  const dd = await fr.evaluate(() => { const d = document.querySelector('.paca-dd'); if (!d || d.style.display === 'none') return null; const r = d.getBoundingClientRect(); return Math.round(r.width) + '×' + Math.round(r.height) + ' @' + Math.round(r.top); });
  log.push({ step: s.name || s.click || String(s.parentClick), ...st, dd, msgs: msgs.map(x => x.slice(0, 120)) });
  if (s.shot) await p.screenshot({ path: shot + s.shot + '.png' });
}
console.log(JSON.stringify({ errs, log }, null, 1));
await b.close();
