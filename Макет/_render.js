/* Рендер макета в удалённой песочнице code-interpreter (локально браузера нет).
   Транспорт MCP обрезает вывод на ~10.4 КБ символов, поэтому картинки
   доставляются по-кусково: страница режется на полосы по границам блоков,
   каждый вызов рендерит её заново (данные детерминированы) и печатает один
   слайс base64 + SHA-256 для контроля целостности.

   Режимы:
     node _render.js thumb <tab>            — маленький скриншот всей вкладки (1 вызов)
     node _render.js crop  <tab> <i> [from] — слайс base64 полосы i (с позиции from)
     node _render.js diag  <tab>            — только диагностика вёрстки
   Служебный файл, в поставку макета не входит. */
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MODE = process.argv[2] || 'diag';
const TAB = process.argv[3] || 'overview';
const CROP = process.argv[4] || '0';
const FROM = process.argv[5] || '0';

/* Пакуем исходники макета (vendor не нужен: ECharts качается там). */
const tgz = execSync('tar -czf - index.html assets',
  { cwd: __dirname, maxBuffer: 64 * 1024 * 1024 }).toString('base64');

/* Удалённый скрипт. «Телефоноподобные» числа собираем конкатенацией,
   чтобы транспортный редактор не искажал их при записи файла. */
const qThumb = '2' + '5';
const wThumb = '4' + '60';
const sliceLen = '9' + '000';
const bandMax = '4' + '60';   // потолок высоты полосы, px
const byteMax = '1' + '9500'; // потолок размера полосы: 3 слайса максимум

const remote = `
import base64, io, os, subprocess, sys, tarfile, urllib.request, json, hashlib

MODE, TAB, CROP, FROM = ${JSON.stringify([MODE, TAB, CROP, FROM])}

os.makedirs('/work', exist_ok=True)
with tarfile.open(fileobj=io.BytesIO(base64.b64decode(PAYLOAD)), mode='r:gz') as tf:
    tf.extractall('/work')
os.makedirs('/work/vendor', exist_ok=True)
urllib.request.urlretrieve(
    'https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js',
    '/work/vendor/echarts.min.js')

subprocess.run(['pip', 'install', '--quiet', 'playwright', 'pillow'], capture_output=True, text=True)
show = subprocess.run(['pip', 'show', 'playwright'], capture_output=True, text=True).stdout
for line in show.splitlines():
    if line.startswith('Location:'):
        loc = line.split(':', 1)[1].strip()
        if loc not in sys.path: sys.path.insert(0, loc)
subprocess.run(['playwright', 'install', 'chromium'], capture_output=True, text=True)
subprocess.run(['playwright', 'install-deps', 'chromium'], capture_output=True, text=True)

from playwright.sync_api import sync_playwright
from PIL import Image

DIAG_JS = """
() => {
  const out = {};
  const se = document.scrollingElement;
  out.pageScrollX = se.scrollWidth > window.innerWidth + 1;
  out.docH = se.scrollHeight;
  out.canvas = document.querySelectorAll('canvas').length;
  out.emptyCharts = [...document.querySelectorAll('.chart')].filter(c => !c.querySelector('canvas')).length;
  out.badText = (document.body.innerText.match(/NaN|undefined/g) || []).length;
  const over = [];
  document.querySelectorAll('.panel, .kpi, .obs, .aud-src').forEach(el => {
    if (el.scrollWidth > el.clientWidth + 2)
      over.push((el.className || '').slice(0, 40) + ' +' + (el.scrollWidth - el.clientWidth));
  });
  out.overflow = over.slice(0, 12);
  const rows = [...document.querySelectorAll('.kpis')].map(k => {
    const hs = [...k.querySelectorAll('.kpi')].map(c => Math.round(c.getBoundingClientRect().height));
    return hs.length ? (Math.max(...hs) - Math.min(...hs)) : 0;
  });
  out.kpiHeightSpread = rows;
  const cut = [];
  document.querySelectorAll('td, th, .k-label').forEach(el => {
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0)
      cut.push(el.textContent.trim().slice(0, 34) + ' [' + el.clientWidth + '/' + el.scrollWidth + ']');
  });
  out.clipped = cut.slice(0, 14);
  return out;
}
"""

with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox', '--font-render-hinting=none'])
    pg = b.new_page(viewport={'width': 1600, 'height': 1000}, device_scale_factor=1)
    # детерминизм: гасим анимацию ECharts до загрузки библиотеки,
    # иначе каждый рендер ловит свой кадр ease-кривой и webp байтово расходится
    pg.add_init_script(\"\"\"
      let mod;
      Object.defineProperty(window, 'echarts', {
        configurable: true,
        get() { return mod; },
        set(v) {
          mod = v;
          const origInit = mod.init;
          mod.init = function (el, t, opts) {
            const inst = origInit.call(this, el, t, opts);
            const origSet = inst.setOption;
            inst.setOption = function (o, ...rest) {
              return origSet.call(this, Object.assign({}, o, { animation: false }), ...rest);
            };
            return inst;
          };
        },
      });
    \"\"\")
    pg.goto('file:///work/index.html', wait_until='networkidle')
    pg.wait_for_function('document.fonts.status === "loaded"')
    pg.wait_for_timeout(1500)
    pg.click('[data-tab="' + TAB + '"]')
    pg.wait_for_timeout(1700)

    if MODE == 'diag':
        print('DIAG_JSON:' + json.dumps(pg.evaluate(DIAG_JS), ensure_ascii=False))
        b.close(); raise SystemExit(0)

    pg.screenshot(path='/work/p.png', full_page=True)
    im = Image.open('/work/p.png').convert('RGB')

    if MODE == 'thumb':
        w = int('${wThumb}')
        im2 = im.resize((w, int(im.height * w / im.width)), Image.LANCZOS)
        q = int('${qThumb}')
        while q >= 8:
            im2.save('/work/t.webp', 'WEBP', quality=q, method=6)
            if os.path.getsize('/work/t.webp') <= 6800: break
            q -= 3
    else:
        # полосы по границам блоков + принудительная резка до bandMax:
        # текст должен оставаться читаемым, поэтому ширина натуральная
        edges = pg.evaluate(\"\"\"() => {
          const y = [];
          const add = el => { if (el) y.push(Math.round(el.getBoundingClientRect().top + window.scrollY)); };
          add(document.querySelector('.kpis'));
          add(document.querySelector('.split'));
          document.querySelectorAll('.grid2 > .panel, .content > .panel, .split > .panel').forEach(add);
          const se = document.scrollingElement;
          return [...new Set(y)].sort((a, b) => a - b).filter(v => v > 40 && v < se.scrollHeight - 40);
        }\"\"\")
        H = im.height
        cap = int('${bandMax}')
        cuts = [0] + [e for e in edges if 0 < e < H] + [H]
        cuts = sorted(set(cuts))
        bands = []
        for i in range(len(cuts) - 1):
            a2, c2 = cuts[i], cuts[i + 1]
            if c2 - a2 < 60: continue
            while c2 - a2 > cap:  # длинный блок режем равномерно
                a3 = a2 + cap
                bands.append([a2, a3]); a2 = a3
            bands.append([a2, c2])
        bands = bands[:9]
        if not bands:
            bands = [[0, min(H, cap)], [min(H, cap), H]] if H > cap else [[0, H]]
        a, c = bands[min(int(CROP), len(bands) - 1)]
        a = max(0, a - 12); c = min(H, c + 12)
        crop = im.crop((0, a, im.width, c))
        print('PIXELSHA:' + hashlib.sha256(crop.tobytes()).hexdigest()[:16])
        crop.save('/work/t.webp', 'WEBP', quality=30, method=6)
        q = 30
        while os.path.getsize('/work/t.webp') > int('${byteMax}') and q > 10:
            q -= 4
            crop.save('/work/t.webp', 'WEBP', quality=q, method=6)
        print('CROP_META:' + json.dumps({'band': [a, c], 'bands': bands, 'bytes': os.path.getsize('/work/t.webp')}))
    b.close()

data = open('/work/t.webp', 'rb').read()
b64 = base64.b64encode(data).decode()
print('SHA:' + hashlib.sha256(b64.encode()).hexdigest()[:16])
if MODE == 'thumb':
    print('IMG:' + b64)
else:
    i0 = int(FROM)
    print('CHUNK:' + b64[i0:i0 + int('${sliceLen}')])
    print('TOTAL:' + str(len(b64)))
`.trim();

const code = 'PAYLOAD = "' + tgz + '"\n' + remote;

/* stdio-клиент к code-interpreter */
function runRemote(codeToSend, cb) {
  const child = spawn('dp', ['ai', 'mcp', 'code-interpreter'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '';
  const pending = new Map();
  let nextId = 1;
  const send = (method, params, wantId) => {
    const m = { jsonrpc: '2.0', method };
    if (params !== undefined) m.params = params;
    if (wantId) m.id = nextId++;
    child.stdin.write(JSON.stringify(m) + '\n');
    return m.id;
  };
  const call = (method, params, ms) => new Promise((res, rej) => {
    const id = send(method, params, true);
    pending.set(id, { res, rej });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('таймаут ' + method)); } }, ms || 600000);
  });
  child.stdout.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let m; try { m = JSON.parse(line); } catch (e) { continue; }
      if (m.id != null && pending.has(m.id)) {
        const p = pending.get(m.id); pending.delete(m.id);
        m.error ? p.rej(new Error(JSON.stringify(m.error).slice(0, 300))) : p.res(m.result);
      }
    }
  });
  child.stderr.on('data', (d) => {
    const s = d.toString().trim();
    if (s && /error|fail/i.test(s) && !/login/i.test(s)) console.error('[mcp] ' + s.slice(0, 160));
  });
  (async () => {
    try {
      await call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'r', version: '1' } });
      send('notifications/initialized');
      const r = await call('tools/call', {
        name: 'dp_code-interpreter_execute-code',
        arguments: { language: 'python', code: codeToSend },
      });
      const text = (r.content || []).map((c) => c.text || '').join('\n');
      let out = '';
      // путь 1: последняя однострочная `stdout: {...}` разворачивается как JSON
      const sm = text.match(/stdout: (\{[^\n]*\})\nstderr: ?\n/g);
      const last = sm && sm.length ? sm[sm.length - 1] : null;
      if (last) {
        const obj = last.replace(/^stdout: /, '').replace(/\nstderr: ?\n$/, '');
        try { out = JSON.parse(obj).output || ''; } catch (e) { console.error('JSON вывода не читается: ' + e.message); }
      } else console.error('stdout-JSON не найден, text=' + text.length + ' — пробую маркеры в сыром виде');
      // путь 2 (fallback): маркеры и base64 чисты даже внутри JSON-строки
      out = out || text;
      cb(null, out);
    } catch (e) { cb(e); }
    finally { try { child.kill(); } catch (e) { /* сигналы наружу не ходят */ } setTimeout(() => process.exit(0), 50); }
  })();
}

/* Локальный разбор ответа */
const outDir = path.join(__dirname, '_shots');
fs.mkdirSync(outDir, { recursive: true });

runRemote(code, (err, out) => {
  if (err) { console.error('ОШИБКА: ' + err.message); process.exit(1); }
  const lines = out.split('\n').filter((l) => l && !/^(pip |site-packages|playwright install|install-deps)/.test(l));
  const meta = {}; const chunks = [];
  let img = null; let sha = null;
  lines.forEach((l) => {
    if (l.startsWith('CROP_META:')) meta.v = JSON.parse(l.slice(10));
    else if (l.startsWith('SHA:')) sha = l.slice(4);
    else if (l.startsWith('PIXELSHA:')) meta.pixelsha = l.slice(9);
    else if (l.startsWith('IMG:')) img = l.slice(4);
    else if (l.startsWith('CHUNK:')) chunks.push(l.slice(6));
    else if (l.startsWith('TOTAL:')) meta.total = +l.slice(6);
    else if (l.startsWith('DIAG_JSON:')) meta.diag = JSON.parse(l.slice(9));
    else if (!/^(The following|----|stdout:|stderr:|$)/.test(l)) console.error('[remote] ' + l.slice(0, 200));
  });
  // fallback: маркеры могли остаться внутри неразвёрнутой JSON-строки
  if (!img && !chunks.length && !meta.diag) {
    const mImg = out.match(/IMG:([A-Za-z0-9+/=]{500,})/);
    const mSha = out.match(/SHA:([0-9a-f]{16})/);
    const mTot = out.match(/TOTAL:(\d+)/);
    const mCrop = out.match(/CROP_META:(\{.*?\})/);
    const mChunk = out.match(/CHUNK:([A-Za-z0-9+/=]+)/);
    if (mImg) img = mImg[1];
    if (mSha) sha = mSha[1];
    if (mTot) meta.total = +mTot[1];
    if (mCrop) { try { meta.v = JSON.parse(mCrop[1].replace(/\\"/g, '"')); } catch (e) { /* сырой текст */ } }
    if (mChunk) chunks.push(mChunk[1]);
  }
  if (meta.diag) { console.log(JSON.stringify(meta.diag, null, 1)); return; }
  if (img) {
    fs.writeFileSync(path.join(outDir, TAB + '_thumb.webp'), Buffer.from(img, 'base64'));
    console.log('thumb: _shots/' + TAB + '_thumb.webp (' + img.length + ' b64) sha=' + sha);
    return;
  }
  if (chunks.length) {
    const joined = chunks.join('');
    fs.writeFileSync(path.join(outDir, TAB + '_c' + CROP + '_' + FROM + '.b64'), joined);
    fs.appendFileSync(path.join(outDir, TAB + '_c' + CROP + '_sha.txt'), sha + '\t' + FROM + '\t' + joined.length + '\n');
    console.log('слайс полосы ' + CROP + ' [' + Number(FROM) + '..' + (Number(FROM) + joined.length) + '] из ' + meta.total + ', sha=' + sha + ', пиксели=' + meta.pixelsha);
    console.log('полоса px: ' + JSON.stringify(meta.v && meta.v.band) + ' | все полосы: ' + JSON.stringify(meta.v && meta.v.bands));
    return;
  }
  console.error('ничего не распознано');
});
