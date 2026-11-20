#!/usr/bin/env node
/* Проверки флоу pa_next_ta_save без n8n и без Trino.
 *
 *   node "7. Проверки — симулятор флоу.js" "3. n8n — pa_next_ta_save (макет).json"
 *
 * Гоняет Code- и IF-ноды по связям, как n8n (поддерживает $input, $('Нода'), $execution).
 * Ноды «Trino: …» исполняются как есть — в макете это заглушки с мок-ответами.
 * Если в вашей версии они уже заменены на Execute Workflow, симулятор подставит мок-ответы
 * из MOCK ниже (по имени ноды), так что логика проверяется и на боевой версии.
 * Выход: таблица кейсов; код возврата 1, если хоть один ответ не совпал с ожиданием.
 */
const fs = require('fs');
const wf = JSON.parse(fs.readFileSync(process.argv[2] || '3. n8n — pa_next_ta_save (макет).json', 'utf8'));
const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));

/* Мир для проверок: отчёты 14000…15000 существуют, владельцы a.petrova и d.sokolov;
   у 14037 уже есть v2 от d.sokolov (request_id old-req-0002). */
const MOCK = {
  'Trino: владельцы': (sql) => {
    const id = Number((sql.match(/= (\d+)/) || [])[1]);
    return { rows: id >= 14000 && id <= 15000 ? [{ login: 'a.petrova' }, { login: 'd.sokolov' }] : [], update_count: null };
  },
  'Trino: текущая версия': (sql) => {
    const id = Number((sql.match(/dashboard_id = (\d+)/) || [])[1]);
    const rows = [];
    if (id === 14037 || sql.includes("'old-req-0002'")) {
      rows.push({ dashboard_id: 14037, version: 2, action: 'save', saved_by: 'd.sokolov', saved_at: '2026-10-12T09:14:00Z', request_id: 'old-req-0002' });
    }
    return { rows, update_count: null };
  },
  'Trino: запись события': () => ({ rows: [], update_count: 1 }),
};

let lastSql = {};
function run(body) {
  let name = Object.keys(byName).find((k) => byName[k].type.endsWith('.webhook'));
  let items = [{ json: { body, headers: {} } }];
  const outs = {};
  for (let guard = 0; guard < 80; guard++) {
    const n = byName[name];
    let outIdx = 0;
    if (n.type.endsWith('.webhook')) {
      // вход уже лежит в items
    } else if (MOCK[name] && !n.type.endsWith('.code')) {
      items = [{ json: MOCK[name](items[0].json.sql) }];
    } else if (n.type.endsWith('.code')) {
      const f = new Function('$input', '$execution', '$', n.parameters.jsCode);
      items = f({ first: () => items[0], all: () => items }, { id: 'sim' }, (nm) => ({ first: () => outs[nm][0] }));
      if (items[0].json.sql) lastSql[name] = items[0].json.sql;
    } else if (n.type.endsWith('.if')) {
      outIdx = items[0].json.ok === true ? 0 : 1;
    } else if (n.type.endsWith('respondToWebhook')) {
      return { status: Number(items[0].json.status), body: items[0].json.body };
    } else {
      throw new Error('нода без мока: ' + name + ' (' + n.type + ')');
    }
    outs[name] = items;
    const next = ((wf.connections[name] || { main: [] }).main[outIdx]) || [];
    if (!next.length) throw new Error('тупик после ноды ' + name);
    name = next[0].node;
  }
  throw new Error('цикл');
}

const base = {
  action: 'save', login: 'A.Petrova', request_id: 'req-12345678', dashboard_id: 14000, expected_version: 0,
  filters: { org: ['Блок «Розница» › Департамент аналитики'], spec: ['Аналитик', "O'Neil"], head: ['n'], adg: ['proteus_risk_all'] },
  ca_size: 1240, comment: 'для аналитиков розницы',
};
const CASES = [
  ['владелец, первая версия', base, 200, (b) => b.version === 1 && b.saved_by === 'a.petrova'],
  ['не владелец', { ...base, login: 'k.orlov' }, 403],
  ['нет логина', { ...base, login: '' }, 401],
  ['устаревшая версия', { ...base, dashboard_id: 14037, expected_version: 1 }, 409, (b) => b.detail.current_version === 2],
  ['новая версия поверх v2', { ...base, dashboard_id: 14037, expected_version: 2 }, 200, (b) => b.version === 3],
  ['повтор того же request_id', { ...base, dashboard_id: 14037, request_id: 'old-req-0002', expected_version: 2 }, 200, (b) => b.replay === true],
  ['список логинов', { ...base, filters: { login: ['a.b'] } }, 400, (b) => b.error === 'people_lists_not_allowed'],
  ['список Master ID', { ...base, filters: { org: ['Блок'], master: ['123'] } }, 400, (b) => b.error === 'people_lists_not_allowed'],
  ['чужой разрез', { ...base, filters: { exp: ['до 1 года'] } }, 400, (b) => b.error === 'unknown_dims'],
  ['без условий', { ...base, filters: {} }, 400, (b) => b.error === 'no_conditions'],
  ['путь глубже 5 уровней', { ...base, filters: { org: ['a › b › c › d › e › f'] } }, 400],
  ['руководители не 1|n', { ...base, filters: { head: ['0'] } }, 400],
  ['отчёта нет', { ...base, dashboard_id: 99 }, 404],
  ['снять ЦА', { action: 'deactivate', login: 'd.sokolov', request_id: 'req-87654321', dashboard_id: 14037, expected_version: 2 }, 200, (b) => b.version === 3],
  ['тело строкой (text/plain)', JSON.stringify(base), 200, (b) => b.version === 1],
  ['тело не JSON', 'не json', 400, (b) => b.error === 'bad_json'],
  ['снять, когда нечего', { action: 'deactivate', login: 'd.sokolov', request_id: 'req-87654321', dashboard_id: 14000, expected_version: 0 }, 409],
];

let bad = 0;
for (const [title, body, want, check] of CASES) {
  let r;
  try { r = run(body); } catch (e) { r = { status: 'ОШИБКА', body: { error: e.message } }; }
  const ok = r.status === want && (!check || check(r.body));
  if (!ok) bad++;
  console.log((ok ? 'ok   ' : 'FAIL ') + title.padEnd(28) + String(r.status).padEnd(5) + JSON.stringify(r.body));
}
if (process.argv.includes('--sql')) {
  lastSql = {}; run(base);
  for (const k of Object.keys(lastSql)) console.log('\n-- ' + k + '\n' + lastSql[k]);
}
console.log(bad ? `\n${bad} из ${CASES.length} не прошли` : `\nвсе ${CASES.length} кейсов прошли`);
process.exit(bad ? 1 : 0);
