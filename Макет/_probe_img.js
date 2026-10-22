/* Проба: отдаёт ли code-interpreter картинку как image-блок без обрезки текста.
   Служебный файл, в поставку макета не входит. */
const { spawn } = require('child_process');

const code = [
  'import subprocess, sys, base64',
  'subprocess.run(["pip","install","--quiet","pillow"], capture_output=True)',
  'show = subprocess.run(["pip","show","pillow"], capture_output=True, text=True).stdout',
  'for line in show.splitlines():',
  '    if line.startswith("Location:"):',
  '        sys.path.insert(0, line.split(":",1)[1].strip())',
  'from PIL import Image',
  'img = Image.new("RGB", (1200, 800), (200, 30, 30))',
  'img.save("/work/t.png")',
  'print("B64LEN", len(base64.b64encode(open("/work/t.png","rb").read())))',
  'img',
].join('\n');

const child = spawn('dp', ['ai', 'mcp', 'code-interpreter'], { stdio: ['pipe', 'pipe', 'pipe'] });
let buf = '';
const pending = new Map();
let nextId = 1;
const send = (m, wantId) => {
  const msg = { jsonrpc: '2.0', method: m };
  if (wantId) msg.id = nextId++;
  child.stdin.write(JSON.stringify(msg) + '\n');
};
const call = (method, params) => new Promise((res, rej) => {
  const msg = { jsonrpc: '2.0', id: nextId++, method, params };
  child.stdin.write(JSON.stringify(msg) + '\n');
  pending.set(msg.id, { res, rej });
  setTimeout(() => rej(new Error('timeout')), 180000);
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
(async () => {
  try {
    await call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'p', version: '1' } });
    send('notifications/initialized');
    const r = await call('tools/call', { name: 'dp_code-interpreter_execute-code', arguments: { language: 'python', code } });
    console.log('content-блоки:', (r.content || []).map((c) => c.type + (c.text ? ' text=' + c.text.length : '') + (c.data ? ' data=' + c.data.length + ' b64' : '') + (c.mimeType ? ' mime=' + c.mimeType : '')));
    console.log('прочие ключи:', Object.keys(r).filter((k) => k !== 'content'));
  } catch (e) { console.error('ОШИБКА: ' + e.message); }
  finally { try { child.kill(); } catch (e) {} setTimeout(() => process.exit(0), 50); }
})();
