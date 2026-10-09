/* Минимальный MCP-клиент по stdio: handshake + произвольный вызов.
   Использование:
     node _mcp.js <server>                       -> список инструментов
     node _mcp.js <server> <tool> '<jsonArgs>'   -> вызов инструмента
   Служебный файл, в поставку макета не входит. */
const { spawn } = require('child_process');

const server = process.argv[2];
const toolName = process.argv[3];
const toolArgs = process.argv[4] ? JSON.parse(process.argv[4]) : {};
if (!server) { console.error('нужен аргумент: имя MCP-сервера'); process.exit(2); }

const child = spawn('dp', ['ai', 'mcp', server], { stdio: ['pipe', 'pipe', 'pipe'] });
let buf = '';
const pending = new Map();
let nextId = 1;

function send(method, params, wantId) {
  const msg = { jsonrpc: '2.0', method };
  if (params !== undefined) msg.params = params;
  if (wantId) msg.id = nextId++;
  child.stdin.write(JSON.stringify(msg) + '\n');
  return msg.id;
}
function call(method, params) {
  return new Promise((res, rej) => {
    const id = send(method, params, true);
    pending.set(id, { res, rej });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('таймаут ' + method)); } }, 120000);
  });
}

child.stdout.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let m; try { m = JSON.parse(line); } catch (e) { continue; }
    if (m.id != null && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    }
  }
});
child.stderr.on('data', (d) => {
  const s = d.toString().trim();
  if (s && !/login|auth|level=info/i.test(s)) console.error('[stderr] ' + s.slice(0, 300));
});

(async () => {
  try {
    await call('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'probe', version: '1.0' },
    });
    send('notifications/initialized');

    if (!toolName) {
      const list = await call('tools/list', {});
      console.log('Инструменты сервера "' + server + '":\n');
      (list.tools || []).forEach((t) => {
        const req = (t.inputSchema && t.inputSchema.required) || [];
        console.log('• ' + t.name + (req.length ? '  (обяз.: ' + req.join(', ') + ')' : ''));
        console.log('    ' + String(t.description || '').split('\n')[0].slice(0, 160));
      });
    } else {
      const r = await call('tools/call', { name: toolName, arguments: toolArgs });
      const out = (r.content || []).map((c) => c.text || ('[' + c.type + ' ' + (c.data ? c.data.length + ' b64' : '') + ']')).join('\n');
      console.log(out.slice(0, 6000));
      if (r.isError) process.exitCode = 1;
    }
  } catch (e) {
    console.error('ОШИБКА: ' + e.message);
    process.exitCode = 1;
  } finally {
    try { child.kill(); } catch (e) { /* сигналы за пределы своих процессов не ходят */ }
    process.exit(process.exitCode || 0);
  }
})();
