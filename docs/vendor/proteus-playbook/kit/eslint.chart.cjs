// kit/eslint.chart.cjs — ESLint для JS кастомного чарта Proteus (react_sanbbox): вызов несуществующего имени (no-undef),
// синтаксис ES5, код из строки и то, чего в песочнице нет. Общий для всех проектов: объединение HRBP_HUB:stand/eslint.chart.cjs
// и detail_list:stand/eslint.chart.cjs плюс глобалы, которые на деле берут чарты adoption и TeamPulse (kit/RESULTS.js.md,
// раздел 3). Правила playbook: CJ-20 (07-chart.md), ST-24 (13-stand.md).
//
// Зачем. node --check ловит только синтаксис, smoke скилла — только то, до чего дошёл клик. HRBP 29.09: сводная
// трансформеров упала в бою на «hDelta is not defined» (удалённая функция), и ни одна проверка этого не видела. В песочнице
// любая ошибка окна гасит чарт целиком (S7, SB-03 в 08-sandbox.md): ReferenceError на редкой ветке = пустая ячейка у коллег.
//
// Запуск — ИЗ КОРНЯ ПРОЕКТА. ESLint 9+ с -c молча пропускает два вида явно названных файлов: вне текущего каталога
// («File ignored because outside of base path» — база с -c это текущий каталог) и не *.js («No matching configuration»).
// Итог — одно предупреждение, 0 ошибок, код 0 при НЕпроверенном файле. Конфиг ловит оба случая сам (страж ниже, 09.10):
// файл вне каталога — ESLint падает с подсказкой (код 2), файл с другим расширением проверяется как *.js.
//   cd <проект> && node $(npm root -g)/eslint/bin/eslint.js -c <playbook>/kit/eslint.chart.cjs --no-config-lookup proteus/*.chart.js
// Нет ESLint — npm i -g eslint@10.1.0 (проверено на 10.1.0). Цель: 0 ошибок. Предупреждения читать: неиспользованное и API,
// которых в песочнице нет (работают только внутри try/catch и ничего не дают).
//
// Сборку из поставки (сжатую kit/min.cjs) гонять тоже можно: имена верхнего уровня те же, ошибок должно быть столько же.
// Новый нужный глобал — в SANDBOX ниже, с причиной; ES5-встроенные (JSON, Math, Date, parseInt…) ESLint даёт сам по ecmaVersion.
'use strict';

// Что даёт браузер внутри iframe sandbox="allow-scripts" (Chromium) и что чарты на деле берут.
// data / applyCrossFilter / option — контракт чарта (option чарт присваивает сам — writable).
const SANDBOX = {
  // контракт Proteus
  data: 'readonly', applyCrossFilter: 'readonly', option: 'writable',
  // окно, документ, таймеры. Голые parent, top, self, frames, screen, open, name, status, event НЕ объявлены нарочно: это
  // частые имена локальных переменных (top / left у геометрии), и забытый var с ними в браузере не падает, а тихо берёт
  // свойство окна. Пишите window.parent.postMessage(…), window.top, window.screen — голое имя no-undef поймает.
  window: 'readonly', document: 'readonly', navigator: 'readonly', console: 'readonly', performance: 'readonly',
  getComputedStyle: 'readonly', matchMedia: 'readonly', innerWidth: 'readonly', innerHeight: 'readonly', devicePixelRatio: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
  // наблюдатели и DOM-классы (instanceof, проверки наличия)
  ResizeObserver: 'readonly', IntersectionObserver: 'readonly', MutationObserver: 'readonly',
  Element: 'readonly', HTMLElement: 'readonly', Node: 'readonly', Event: 'readonly', CustomEvent: 'readonly',
  KeyboardEvent: 'readonly', MouseEvent: 'readonly', Image: 'readonly', DOMParser: 'readonly', XMLSerializer: 'readonly',
  // строки, base64, бинарные данные (ответ датасета сжат: atob + TextDecoder — detail_list, CJ-18)
  atob: 'readonly', btoa: 'readonly', TextDecoder: 'readonly', TextEncoder: 'readonly', escape: 'readonly', unescape: 'readonly',
  ArrayBuffer: 'readonly', DataView: 'readonly', Uint8Array: 'readonly', Uint8ClampedArray: 'readonly', Uint16Array: 'readonly',
  Int8Array: 'readonly', Int16Array: 'readonly', Int32Array: 'readonly', Uint32Array: 'readonly', Float32Array: 'readonly',
  Float64Array: 'readonly', Blob: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', Intl: 'readonly',
  // встроенные ES2015+: синтаксис ES5, но объекты в Chromium есть (их берут помощники Babel — TeamPulse, CJ-23)
  Map: 'readonly', Set: 'readonly', WeakMap: 'readonly', WeakSet: 'readonly', Symbol: 'readonly', Promise: 'readonly',
  Reflect: 'readonly',
  // есть, но в песочнице не работают — объявлены, чтобы no-undef не путал; предупреждает no-restricted-globals ниже
  localStorage: 'readonly', sessionStorage: 'readonly', indexedDB: 'readonly', fetch: 'readonly', XMLHttpRequest: 'readonly',
  WebSocket: 'readonly', EventSource: 'readonly', location: 'readonly', history: 'readonly',
  alert: 'readonly', confirm: 'readonly', prompt: 'readonly',
};

// В песочнице без allow-same-origin / allow-modals / allow-popups и с CSP connect-src 'none' (08-sandbox.md, факты S4–S6, S15):
const NOT_IN_SANDBOX = [
  ['localStorage', 'SecurityError в песочнице (нет allow-same-origin): ничего не сохранится, вне try/catch чарт погаснет (SB-02)'],
  ['sessionStorage', 'SecurityError в песочнице (нет allow-same-origin) — только в try/catch (SB-02)'],
  ['indexedDB', 'SecurityError в песочнице (нет allow-same-origin) — только в try/catch (SB-02)'],
  ['fetch', 'сети у чарта нет: CSP connect-src \'none\' (SB-01) — данные только из датасета'],
  ['XMLHttpRequest', 'сети у чарта нет: CSP connect-src \'none\' (SB-01)'],
  ['WebSocket', 'сети у чарта нет (SB-01)'],
  ['EventSource', 'сети у чарта нет (SB-01)'],
  ['location', 'в песочнице это адрес документа iframe, не адрес борда: адрес борда — document.referrer или meta датасета (SB-17)'],
  ['history', 'навигации у чарта нет: адрес борда не поменять (SB-01)'],
  ['alert', 'без allow-modals вызов молча игнорируется (SB-01)'],
  ['confirm', 'без allow-modals вызов молча игнорируется и вернёт false (SB-01)'],
  ['prompt', 'без allow-modals вызов молча игнорируется (SB-01)'],
  ['open', 'без allow-popups окно не откроется (SB-01); голое open к тому же не объявлено — no-undef'],
].map(([name, message]) => ({ name, message }));

// ── страж от ложного «0 ошибок» (ESLint 10.1.0, 09.10) ─────────────────────────────────────────────────────────────
// Конфиг исполняется в процессе CLI и видит его аргументы. Существующий файл или каталог из аргументов вне текущего
// каталога — ESLint пропустил бы его молча: падаем (ESLint печатает текст ошибки, код 2). Явно названный файл не *.js
// (сборка .min, файл без расширения) — добавляем в files: иначе «No matching configuration», 0 ошибок, код 0. Заведомо
// не JS (md, json, sql, css… — NOT_JS) не добавляем: `proteus/*` не должен падать на соседних файлах.
// Вне CLI (редактор, API) и для шаблонов glob страж молчит: их разворачивает сам ESLint.
const fs = require('fs');
const path = require('path');
const WITH_VALUE = ['-c', '--config', '--ext', '--global', '--parser', '--parser-options', '--plugin', '--rule', '--fix-type',
  '--ignore-pattern', '--stdin-filename', '--max-warnings', '-o', '--output-file', '-f', '--format',
  '--report-unused-disable-directives-severity', '--report-unused-inline-configs', '--cache-file', '--cache-location',
  '--cache-strategy', '--suppress-rule', '--suppressions-location', '--print-config', '--flag', '--concurrency'];
const EXTRA_FILES = [];
// заведомо не JS (proteus/* с md, json, sql, css рядом): их ESLint пропускает как раньше — с предупреждением, без ошибки
const NOT_JS = /\.(md|markdown|json|sql|css|less|html?|svg|py|ya?ml|csv|tsv|txt|log|sh|ts|tsx|jsx|png|jpe?g|gif|webp|ico|pdf|zip|gz|xlsx?|docx?|pptx?)$/i;
(function guard() {
  const argv = process.argv;
  if (!/^eslint(\.js)?$/.test(path.basename(String(argv[1] || '')))) return;      // не CLI ESLint — не вмешиваемся
  const cwd = process.cwd(), outside = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') continue;
    if (a.charAt(0) === '-') { if (WITH_VALUE.indexOf(a) > -1) i++; continue; }  // --opt=значение — одним аргументом
    let st = null;
    try { st = fs.statSync(a); } catch (e) { continue; }                           // шаблон glob или нет такого — решает ESLint
    const abs = path.resolve(a), rel = path.relative(cwd, abs);
    if (rel === '..' || rel.indexOf('..' + path.sep) === 0 || path.isAbsolute(rel)) outside.push(a);
    else if (st.isFile() && !/\.js$/i.test(a) && !NOT_JS.test(a)) EXTRA_FILES.push(abs);
  }
  if (outside.length) {
    throw new Error('kit/eslint.chart.cjs: вне текущего каталога ' + cwd + ': ' + outside.join(', ') + ' — ESLint 9+ с -c такой файл '
      + 'НЕ проверит (одно предупреждение «outside of base path», 0 ошибок, код 0). Запустите из каталога, где лежат файлы: '
      + 'cd <корень проекта> && node $(npm root -g)/eslint/bin/eslint.js -c <playbook>/kit/eslint.chart.cjs --no-config-lookup <файлы>');
  }
})();

module.exports = [{
  files: ['**/*.js'].concat(EXTRA_FILES.length ? [(p) => EXTRA_FILES.indexOf(p) > -1] : []),
  languageOptions: { ecmaVersion: 5, sourceType: 'script', globals: SANDBOX },
  rules: {
    'no-undef': 'error',                                   // главное: имя, которого нет, — ReferenceError в бою
    'no-eval': 'error', 'no-new-func': 'error', 'no-implied-eval': 'error',   // код из строки — не проверен (CJ-22, DV-07)
    'no-restricted-globals': ['warn'].concat(NOT_IN_SANDBOX),
    'no-console': 'warn',                                  // договор скилла и CJ-02: console.* в итоговом файле нет
    'no-unused-vars': ['warn', { vars: 'local', args: 'none', caughtErrors: 'none' }],
  },
}];
