# 07. Код чарта: каркас, жизненный цикл, отрисовка, сборка (CJ)

**Зачем глава.** Кастомный чарт Proteus (`react_sanbbox`, тип ECHARTS) — это JS, который песочница исполняет в iframe на
каждый ответ датасета. ECharts в нём — пустой холст, вся визуализация — свой HTML, CSS и SVG в overlay поверх хоста. Глава
о том, как писать этот код: чтобы он переживал перезапуски, не мигал, быстро разбирал ответ, сам объяснял ошибки поставки и
уезжал к владельцу сжатым. Ограничения iframe — в 08-sandbox.md, связка чартов и кросс-фильтры — в 09-multi-chart.md,
внешний вид — в 11-ui.md, тур «Как работать» — в 12-tour.md.

**Главное в 5 пунктах.**
1. **CJ-01, CJ-02.** Чарт собирается скиллом proteus-echarts-builder: копия шаблона, БЛОКИ 1–7, только ES5. Где практика
   проектов ушла вперёд скилла, действует гайд (раздел «Где гайд уточняет скилл» в конце главы).
2. **CJ-03, CJ-04.** Контракт монтажа: последний хост `[_echarts_instance_]`, свой overlay, ровно один `render()`, ошибка —
   текстом в overlay, глобальный `option` — пустой scatter последним выражением файла.
3. **CJ-05…CJ-08.** Скрипт перезапускается в том же окне на каждый ответ: состояние — в `window.__pvtState[ns]`, за собой —
   убирать, `render()` и `relayout()` — раздельно, снаружи `mount()` — только `state.rerender`.
4. **CJ-19.** Чарт сам называет ошибку поставки: нет колонок в «Измерениях», нет meta, ответ обрезан лимитом строк, JS и
   датасет из разных поставок.
5. **CJ-21, CJ-22.** В поставке — сжатая сборка terser 5.51.2 целиком в поле JS: код едет в каждом POST `chart/data`, а
   отправка у владельца ≈50 КБ/с. Загрузчик кода из ответа датасета запрещён.

Метки уверенности — как во всём гайде (01-platform.md). Стенд чарта — браузер (Chromium 141, playwright) в модели песочницы;
такие подтверждения записаны словами рядом с меткой [вывод]: механизм песочницы форка в бою не виден.

---

## A. Скилл и каркас

### CJ-01. Собирай чарт скиллом proteus-echarts-builder: копия шаблона, БЛОКИ 1–7, правка только мест `[ЗАПОЛНИ]`
- **Почему:** RETRO 63 скилла: сборка Test7 заняла 4 ч, 13 прогонов и 10 FAIL — все от каркаса, переписанного «своими
  словами»: глобальный `option`, скрытие canvas, удаление старого overlay, `esc()`, слушатели. В трёх проектах, где каркас
  скопирован (HRBP, DL, adoption), поломки монтажа в бою не повторялись. TeamPulse собран мимо шаблона: validate скилла на
  его сборке — 36 из 48 PASS и 9 FAIL структуры (H3, C1, S14b, S15, S5, C5, M4, K1, K3).
- **Как:**
  - Скилл лежит в репозитории `romuney/adoption`, ветка `new`, папка `skills/proteus-echarts-builder/` (версия 9.0, коммит
    `e77d754` от 22.09). Ссылайся на коммит, а не на ветку. В облачную сессию скилл как плагин не ставится: клонируй
    репозиторий рядом и запускай скрипты по полному пути, а рабочей папкой держи проектную. Скрипты в проект не копируй.
  - Болванки создаёт `bootstrap.py` одним вызовом — шаблон не читай и не переписывай через Read+Write.
  - Шаблон скилла `<скилл>/templates/TEMPLATE.chart.js`: БЛОК 1 — `CFG`, 2 — вход, состояние и хелперы, 3 — `buildModel`, 4 —
    форматирование, 5 — разметка (`buildCSS`, `buildHTML`), 6 — монтаж и интерактив, 7 — пустой `option`. Свободны блоки 1, 3,
    4, 5. Блоки 2, 6, 7 копируются дословно, в них меняются только места `[ЗАПОЛНИ]`. Служебные `getTip`, `showTip`,
    `hideTip`, `render`, `trigger` не переписывай, не переименовывай и не дублируй своими версиями.
  - Пиши по одному блоку с чекпоинтом: `node --check` → строка в NOTES → короткий статус. Процесс скилла (ШАГ 1, ШАГ 2,
    СБОРКА, СДАЧА, ПЕРЕДАЧА, порядок из `BLOCKED.md`) соблюдай как есть.
  - Отклонение от шаблона, которого требует гайд (обёртка `onerror`, линейка видимости, отложенный `relayout`), записывай
    в NOTES с кодом правила.
  ```
  python3 <скилл>/bootstrap.py <папка>                         # болванки: chart.js, data.sql, NOTES, FIELDS, html
  python3 <скилл>/check.py <name>.chart.js                      # validate + smoke, один вердикт
  NODE_PATH=$(npm root -g) python3 <скилл>/check.py <name>.chart.js   # smoke не находит глобальный playwright
  ```
- **Проверка:** `python3 <скилл>/validate.py <name>.chart.js`: K3 сверяет `esc`, `num`, `toDate` с шаблоном и первым скажет,
  что блок переписан; K2 ловит шаблон, набранный по памяти. В NOTES есть путь до скилла и строка `Режим: A` или `Режим: B`.
- **Уверенность:** [бой] — поломки RETRO 1, 4, 14, 24, 25 у владельца; [вывод] — что дословный каркас их исключает.
- **Образец:** adoption:skills/proteus-echarts-builder/templates/TEMPLATE.chart.js; HRBP_HUB:proteus/hrbp-hub.chart.js (все
  семь блоков, самый полный БЛОК 6).

### CJ-02. Пиши только ES5 и без запрещённых API
- **Почему:** контракт скилла, RETRO 13: «SyntaxError при вставке в Proteus». Проверка 08.10: все 21 прод-файл и сборки
  поставок четырёх проектов разбираются acorn как ES5. Саму причину RETRO 13 воспроизвести не удалось: Chromium в iframe
  ES2015+ исполняет, ломать может только обработка кода в Proteus до запуска, а её никто не видел. Запрет держим как контракт:
  на ES5 опираются terser `ecma: 5`, ESLint `ecmaVersion: 5` и проверки скилла.
- **Как:**
  - Можно: `var`, `function`, конкатенация строк, `try/catch`, обычные циклы, `Array.prototype.forEach`.
  - Нельзя: `let`/`const`, стрелки, шаблонные строки и backtick, `class`, деструктуризация, spread, `import`/`require`,
    `fetch`, внешние URL и CDN, `console.*` в итоговом файле.
  - `document.getElementById` не используй: ищи узлы через `overlay.querySelector('.' + CFG.ns + '-…')`. Довод скилла «видит
    весь дашборд» устарел — у каждого чарта свой iframe. Но после перезапуска скрипта в том же окне глобальный поиск находит
    старые узлы, поэтому запрет остаётся.
  - Код из макета на современном JS переводи в ES5 только сборкой Babel (CJ-23), не руками.
- **Проверка:** ESLint с `ecmaVersion: 5` по исходнику (CJ-20) и `kit/min.cjs --check` / `--verify` по сборке (acorn
  `ecmaVersion: 5`). terser с `ecma: 5` синтаксис не понижает: на вход ему нужен уже ES5.
- **Уверенность:** [бой] — RETRO 13, как его записал скилл; [вывод] — сама причина не воспроизведена.
- **Образец:** TeamPulse:Team Pulse/proteus/build.js (после Babel — acorn ES5 и запреты); kit/eslint.chart.cjs; kit/min.cjs
  (`--check`).

### CJ-03. Монтируй overlay по контракту шаблона: последний хост, canvas скрыт, старый overlay удалён, ровно один `render()`, ошибка — текстом
- **Почему:** RETRO 1, 4, 16, 24, 25: пустой виджет без ошибок (монтаж не вызван), два графика друг на друге (старый overlay
  не удалён), белое пятно (canvas скрыт, `render()` не вызван), молчаливый `catch`. Консоль боя агенту не видна: пустая ячейка
  без текста — это потерянный раунд переписки с владельцем.
- **Как:** порядок монтажа, все шаги — внутри одного `try` самовызывающейся `mount()`:
  1. хост — ПОСЛЕДНИЙ `[_echarts_instance_]`;
  2. его canvas — `display:none`;
  3. прежний `.<ns>-overlay` удалить;
  4. хост `position:static` → `relative`;
  5. новый overlay — `appendChild`;
  6. в теле `mount()` ровно один вызов `render()`;
  7. `catch` пишет «Ошибка графика: …» в overlay своего хоста и к `option` не обращается.

  Обёртку `window.onerror` и `overflow:hidden` документа ставь в начале `mount()`, до любой разметки (SB-03).
  ```js
  (function mount() {
    try {
      var hosts = document.querySelectorAll('[_echarts_instance_]');
      if (!hosts || !hosts.length) return;
      var host = hosts[hosts.length - 1];
      var cvs = host.querySelectorAll('canvas');
      for (var i = 0; i < cvs.length; i++) cvs[i].style.display = 'none';
      var prev = host.querySelector('.' + CFG.ns + '-overlay');
      if (prev) prev.parentNode.removeChild(prev);
      var overlay = document.createElement('div');
      overlay.className = CFG.ns + '-overlay';
      overlay.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;z-index:10;overflow:auto;'
        + 'box-sizing:border-box;background:transparent;';
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      host.appendChild(overlay);
      // … тултип, render, слушатели …
      render();
    } catch (e) {
      var hs = document.querySelectorAll('[_echarts_instance_]');
      var box = hs.length ? hs[hs.length - 1].querySelector('.' + CFG.ns + '-overlay') : null;
      if (box) box.innerHTML = '<div style="padding:16px;font:13px Arial,sans-serif;color:#b00020;">Ошибка графика: '
        + esc((e && e.message) || e) + '</div>';
    }
  })();
  ```
- **Проверка:** validate скилла (C-коды монтажа); smoke E8 (перезапуск не плодит overlay); на стенде — три перезапуска
  подряд с тем же ответом: в хосте один overlay, canvas скрыт, ошибок консоли 0.
- **Уверенность:** [бой] (RETRO 1, 4, 16, 24, 25).
- **Образец:** adoption:skills/proteus-echarts-builder/templates/TEMPLATE.chart.js (БЛОК 6); detail_list:proteus/detail-list.chart.js
  (`mount`, `catch` с текстом).

### CJ-04. Присваивай глобальный `option` пустым scatter последним выражением файла, синхронно и без мутаций
- **Почему:** RETRO 14: `option` внутри IIFE или не в конце — «option is not defined», график не рендерится. Песочница читает
  глобальное имя `option` после выполнения кода. `option` с данными заставляет ECharts рисовать свой график поверх overlay.
  Синхронность — вывод: исходника песочницы (`echartsSandbox…entry.js`) нет ни в репозиториях, ни в апстриме Superset;
  RETRO 14 косвенно показывает, что `option` читается сразу после выполнения кода, и асинхронной подготовки он не дождётся.
- **Как:**
  ```js
  // ---------- БЛОК 7: ПУСТОЙ OPTION ----------  (вне функций и IIFE, последним)
  option = {
    animation: false,
    xAxis: { show: false, type: 'value' },
    yAxis: { show: false, type: 'value' },
    series: [{ type: 'scatter', data: [] }]
  };
  ```
  - До этого присваивания ничего не ждать: ни `Promise`, ни `setTimeout`, ни `DecompressionStream`.
  - После него `option` не трогать; из `catch` к нему не обращаться (RETRO 24: ветка ошибки не срабатывала никогда).
  - terser сливает конец сборки в одно выражение `…}(),option={…};`. Это нормально: присваивание остаётся глобальным. Но
    проверки, которые ищут строку `option = {`, на сборке ложно падают — гоняй их по исходнику (CJ-20).
- **Проверка:** validate скилла по исходнику; `node --check` по сборке; на стенде чарт рисуется и на сборке.
- **Уверенность:** [бой] (RETRO 14); [вывод] [не проверено в бою] — требование синхронности.
- **Образец:** adoption:skills/proteus-echarts-builder/templates/TEMPLATE.chart.js (БЛОК 7).

---

## B. Жизненный цикл скрипта

### CJ-05. Держи состояние в `window.__pvtState[ns]` и доливай новые ключи при каждом запуске
- **Почему:** Proteus перезапускает скрипт целиком в том же окне iframe на каждый ответ и на перерисовку дашборда. Локальные
  переменные гибнут: выбор вкладки сбрасывался после перерисовки (RETRO 2, 65, проверка smoke E18). После замены JS новый
  скрипт может запуститься в окне со старым состоянием: ключа, которого не было в прошлой версии, там нет, и `state.newKey`
  оказывается `undefined`. RETRO 46: два параллельных состояния (локальная `var selectedKey` в `mount()` и `state`) —
  подсветка не включалась, хотя обработчики срабатывали.
- **Как:**
  ```js
  if (!window.__pvtState) window.__pvtState = {};
  var STATE0 = { view: 'table', open: '', q: '', page: 0, pend: null, cache: null, tour: null /* … */ };
  if (!window.__pvtState[CFG.ns]) window.__pvtState[CFG.ns] = {};
  // ключи, которых нет в состоянии прошлой версии скрипта, — по умолчанию
  for (var k0 in STATE0) if (STATE0.hasOwnProperty(k0) && !window.__pvtState[CFG.ns].hasOwnProperty(k0))
    window.__pvtState[CFG.ns][k0] = STATE0[k0];
  var state = window.__pvtState[CFG.ns];
  ```
  - Обработчик пишет выбор в `state` и зовёт `render()`. `buildHTML()` читает `state` и сам ставит активный класс.
    `classList.add('active')` мимо `state` живёт только до первой перерисовки.
  - Локальных переменных под состояние в `mount()` не заводи: всё, что читает разметка, лежит в `state`.
  - Состояние живёт, пока жив iframe. Proteus может пересоздать iframe (перезагрузка борда, виртуализация вкладок) —
    применённое тогда берётся из эха ответа (MC-14), а не из `state`.
- **Проверка:** smoke E18 (выбор переживает перерисовку); на стенде — подать тот же ответ дважды (вид не сбрасывается) и
  запустить новую версию скрипта поверх состояния старой (новые ключи на месте).
- **Уверенность:** [бой] (RETRO 2, 46, 65).
- **Образец:** detail_list:proteus/detail-list.chart.js (БЛОК 2: `STATE0` и цикл долива).

### CJ-06. На перезапуске убирай за собой: наблюдатели, глобальные слушатели, таймеры; слушатели overlay вешай безусловно
- **Почему:** RETRO 9, 65 (validate S21, smoke E19): слушатели вешались под флагом `if (!state.listenersAttached)`, флаг жил в
  `window.__pvtState` и пережил перезапуск, а overlay был новым и остался без обработчиков. Со второй отрисовки — «картинка без
  интерактива», ошибок ноль. Без снятия глобальных слушателей они копятся: один клик срабатывает N раз, Escape —
  многократно (RETRO 9).
- **Как:**
  - overlay каждый раз новый, поэтому его слушатели вешай без флагов: делегированием от overlay (`trigger(e.target,
    'data-action')`), ровно один раз снаружи `render()`.
  - Глобальные слушатели (`window`, `document`: resize, message, keydown, blur, scroll, mousedown) снимай по ссылке из
    `state` перед тем, как повесить новый.
  - `ResizeObserver`, `IntersectionObserver` — `disconnect()` по ссылке (`state.ro`, `state.visIO`).
  - Интервалы и таймеры (`state.pendTick`, `state.roT`, ожидания тура) — `clearInterval` / `clearTimeout`.
  - Глобальный обработчик первым делом проверяет `overlay.parentNode`: он мог дожить до удаления overlay.
  - Флаг «уже навешено» допустим только для `window` и `document` (у adoption — `state.tipGuard`), но снятие по ссылке
    надёжнее: новый скрипт может принести новый обработчик.
  ```js
  if (state.onMsg) window.removeEventListener('message', state.onMsg);
  state.onMsg = function (ev) { if (!overlay.parentNode) return; /* … */ };
  window.addEventListener('message', state.onMsg);
  if (state.ro && state.ro.disconnect) state.ro.disconnect();
  if (state.pendTick) clearInterval(state.pendTick);
  ```
- **Проверка:** smoke E19 и validate S21; на стенде — три перезапуска подряд, затем клик: обработчик сработал один раз
  (счётчик вызовов на стенде).
- **Уверенность:** [бой] (RETRO 9, 65).
- **Образец:** detail_list:proteus/detail-list.chart.js (конец БЛОКА 6: `state.onWinResize`, `state.onDocDown`, `state.onFlt`,
  `state.onTourMsg`, `state.ro`); TeamPulse:Team Pulse/proteus/prelude.js (реестр слушателей) и TeamPulse:Team
  Pulse/stand/scenario.js (проверка, что слушатели не копятся).

### CJ-07. Разделяй `render()` и `relayout()`: наблюдатель размеров правит габариты и откладывает relayout
- **Почему:**
  - RETRO 3: `render()` из `ResizeObserver` зацикливается — график мигает.
  - Синхронная правка размера наблюдаемого элемента в колбэке RO даёт ошибку окна «ResizeObserver loop…», а песочница на неё
    гасит чарт (SB-03). Опыт в Chromium 141: синхронно — 126 ошибок за 4 смены ширины, через `setTimeout(150)` — 0.
  - RETRO 20: `render()` на наведении пересобирает DOM под курсором — тултип моргает, фокус теряется.
  - SVG в пикселях ячейки (CJ-09) после смены ширины нужно перерисовать, иначе плывут подписи.
- **Как:**
  - `render()` только пересобирает overlay: `overlay.innerHTML = buildHTML()`, возврат прокрутки и фокуса (CJ-13),
    `renderTip()`.
  - Наведение меняет только тултип.
  - RO на хосте: overlay `100%` и отложенный `relayout()` (150 мс; при перетаскивании разделителя у HRBP — 60 мс).
  - `relayout()`:
    - ставит класс узкой ячейки `<ns>-narrow` по `overlay.clientWidth`, а не `@media` (окно iframe = ячейка, но smoke
      скилла гоняет чарт без iframe, и класс работает в обоих случаях);
    - перерисовывает по месту только SVG `[data-cw]`, если ширина изменилась больше чем на 2 px;
    - `render()` не зовёт никогда.
  ```js
  if (typeof ResizeObserver !== 'undefined') {
    if (state.ro && state.ro.disconnect) state.ro.disconnect();
    state.ro = new ResizeObserver(function () {
      overlay.style.width = '100%'; overlay.style.height = '100%';
      if (state.roT) clearTimeout(state.roT);
      state.roT = setTimeout(relayout, 150);          // только отложенно: синхронно — петля RO
    });
    state.ro.observe(host);
  }
  ```
  - Проверка C4 скилла ложно роняет отложенный `relayout` — оспорь её (`--accept`), код не переписывай.
- **Проверка:** на стенде сузить и расширить ячейку 4 раза: ошибок окна 0, вызовов `render()` 0, SVG перерисован. Smoke без
  iframe: E10 (ресайз без ошибок), класс `<ns>-narrow` ставится.
- **Уверенность:** [бой] (RETRO 3, 20); [вывод] — опыт Chromium 141 с петлёй RO.
- **Образец:** HRBP_HUB:proteus/hrbp-hub.chart.js (`relayout`, `measureCharts`, `measureNarrow`, RO в конце БЛОКА 6).

### CJ-08. Вызывай перерисовку снаружи `mount()` только через ссылку `state.rerender`
- **Почему:** борд 59922, 17.09: `render()` вызывался с верхнего уровня, а объявлен внутри `mount()` → ReferenceError →
  `window.onerror` песочницы → `chart.clear + dispose`; чарт погибал после первого клика. HRBP 29.09: вызов удалённой функции
  `hDelta` упал у владельца — ни `node --check`, ни smoke его не увидели, клик до него не дошёл.
- **Как:** функции, объявленные внутри `mount()`, зови только изнутри `mount()`. Таймеры и код верхнего уровня зовут ссылку:
  ```js
  state.rerender = render;                               // в mount(), после объявления render
  // в таймере ожидания на верхнем уровне:
  if (state.rerender) state.rerender();
  ```
- **Проверка:** ESLint `no-undef` — 0 ошибок (CJ-20).
- **Уверенность:** [бой] (59922, 17.09; HRBP 29.09).
- **Образец:** HRBP_HUB:proteus/hrbp-hub.chart.js (`armPend` → `state.rerender`); detail_list:proteus/detail-list.chart.js (то же).

---

## C. Отрисовка

### CJ-09. Рисуй графики своим SVG в пикселях измеренной ширины; ECharts — только пустой холст
- **Почему:** adoption 18.09: `viewBox` + `width:100%` масштабировали SVG вместе с ячейкой — подписи 11 px становились 20+ px.
  `option` с данными заставляет ECharts рисовать поверх overlay. Во всех четырёх проектах графики — свой SVG, глобальный
  `echarts` и инстанс графика никто не использует.
- **Как:**
  - В разметке — плейсхолдер `<div data-cw="вид" data-ci="номер">`. После вставки разметки меряется его `clientWidth`, SVG
    строится с `width = W` и `viewBox="0 0 W H"` — масштаб 1:1.
  - Реестр графиков экрана `{kind, key, draw(width)}`: `relayout()` перерисовывает их по месту (CJ-07).
  - `viewBox` + `width:100%` допустим только у SVG без текста (спарклайн).
  - Визуальные правила графиков (линии, светофор, подписи, легенда) — 11-ui.md.
  ```js
  function chartSlot(kind, key, draw) {
    var ci = CHARTS.length, anim = !!key && !state.drawn[key] && canAnim();
    if (key) state.drawn[key] = true;
    CHARTS.push({ kind: kind, key: key, draw: draw, anim: anim });
    return '<div class="' + CFG.ns + '-chart" data-cw="' + kind + '" data-ci="' + ci + '">'
      + draw(cwOf(kind), { ci: ci, anim: anim }) + '</div>';
  }
  ```
- **Проверка:** smoke E14 (SVG не вылезает за `viewBox`); на стенде `?w=900` и `?w=1600` — кегли подписей в px одинаковы.
- **Уверенность:** [бой] (adoption 18.09).
- **Образец:** HRBP_HUB:proteus/hrbp-hub.chart.js (`chartSlot`, `cwOf`, `measureCharts`); TeamPulse:Team Pulse/draw.js
  (`remeasure` / `redraw` по `clientWidth`).

### CJ-10. Анимируй график только при первом показе с этими данными
- **Почему:** владелец 29.09 (HRBP): «анимация слева направо», но повтор на каждый клик мешает (ДС Adoption 6.5, 23.09).
  Скрипт перезапускается на ресайз и перерисовку — без ключа анимация шла бы каждый раз.
- **Как:**
  - Устойчивый ключ графика + `state.drawn[key]` и подпись данных `dataSig()`; новая подпись — сброс `state.drawn`.
  - Web Animations из JS (`el.animate(frames, {fill: 'backwards'})`) в `try`: после конца элемент живёт по своему CSS.
  - Не анимировать на ресайз, наведение, клик по легенде; при `prefers-reduced-motion` анимации нет.
  - Длительности и виды (линия 760 мс, столбики 480 мс волной) — 11-ui.md.
  ```js
  function canAnim() {
    if (typeof Element === 'undefined' || !Element.prototype.animate) return false;
    return !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  // в chartSlot: if (state.drawnSig !== dataSig()) { state.drawn = {}; state.drawnSig = dataSig(); }
  ```
- **Проверка:** на стенде ресайз и клик по легенде не запускают анимацию: `document.getAnimations().length === 0`.
- **Уверенность:** [владелец 29.09].
- **Образец:** HRBP_HUB:proteus/hrbp-hub.chart.js (`chartSlot`, `dataSig`, `animateCharts`, `canAnim`).

### CJ-11. Держи тултип одним узлом в body и показывай его только служебными `showTip/hideTip`
- **Почему:** RETRO 44: CSS прятал тултип двумя свойствами (`display` и `opacity`), а ручной показ снимал одно — 9 итераций
  отладки невидимого тултипа без единой ошибки. RETRO 7, 19, 21: тултип внутри разметки гибнет при `render()`; тултип в body
  не наследует шрифт корня.
- **Как:**
  - Узел создаётся один раз до первого `render()`; старый `body > .<ns>-tip` удаляется. В `buildHTML()` его нет.
  - `position:fixed`, свой `font-family` в правиле тултипа; место в шкале слоёв: модалка 60/61, тур 99990–99993, тултип 99999.
  - Показ и скрытие — только `showTip` / `hideTip`: они снимают и ставят оба свойства. Своих `style.display` и `opacity` для
    тултипа не пиши.
  - На `mousemove` меняется позиция; `innerHTML` — только если html другой.
  - По горизонтали ограничивай окном, по вертикали — видимой частью iframe (`visV()`, SB-05), а не `innerHeight`: в высокой
    ячейке подсказка у нижнего края экрана иначе уходит под него. Якорь у курсора, смещения и гашение — 11-ui.md.
  ```js
  function showTip(html, rect) {
    var tip = getTip();
    if (tip.__h !== html) { tip.innerHTML = html; tip.__h = html; }   // за курсором — без лишней пересборки
    tip.style.display = 'block'; tip.style.left = '0px'; tip.style.top = '0px';
    var t = tip.getBoundingClientRect(), vv = visV(), pad = 6;
    var left = rect.left + 14, top = rect.top + 18;
    if (left + t.width > window.innerWidth - pad) left = rect.left - t.width - 14;
    if (top + t.height > vv.b - pad) top = rect.top - t.height - 14;
    tip.style.left = Math.round(Math.max(pad, Math.min(left, window.innerWidth - t.width - pad))) + 'px';
    tip.style.top = Math.round(Math.max(vv.t + pad, Math.min(top, vv.b - t.height - pad))) + 'px';
    tip.style.opacity = '1';
  }
  ```
- **Проверка:** smoke ET1–ET4 (появляется, на всех триггерах, не выходит за окно, гаснет), E6 (тултип реально нарисован:
  пиксели центра и периметра плашки), E9 (не дублируется), E12 (наведение не пересобирает разметку); validate T3 (шрифт в
  правиле тултипа) и K3b (машинерия тултипа не переписана; на тултипе за курсором — ложное срабатывание, CJ-20).
- **Уверенность:** [бой] (RETRO 7, 19, 21, 44).
- **Образец:** HRBP_HUB:proteus/hrbp-hub.chart.js (`getTip`, `showTip`, `hideTip`, `renderTip`).

### CJ-12. Гаси тултип при уходе курсора из iframe, потере фокуса, прокрутке и в пустом месте
- **Почему:** adoption 25.09 и 29.09: подсказка залипала, когда курсор быстро уходил на соседний чарт. При быстром выходе из
  iframe браузер не шлёт `mouseout` цели — гасить было некому.
- **Как:**
  - `document` `mouseout` без `relatedTarget` (курсор покинул iframe) → скрыть;
  - `window` `blur` → скрыть;
  - `scroll` overlay и внутренних панелей (в фазе перехвата: `scroll` не всплывает) → скрыть;
  - `mousemove`, а под курсором уже нет `[data-tip]` → скрыть с задержкой 110 мс (между соседними целями тултип не мигает).
  ```js
  state.tipOff = function () { if (state.tip) { state.tip = null; hideTip(); } };
  overlay.addEventListener('scroll', function () { state.tipOff(); }, true);
  if (!state.tipGuard) {                       // document и window переживают перезапуск: вешаем один раз
    state.tipGuard = true;
    document.addEventListener('mouseout', function (e) { if (!e.relatedTarget && state.tipOff) state.tipOff(); });
    window.addEventListener('blur', function () { if (state.tipOff) state.tipOff(); });
  }
  ```
  Обработчик ссылается на `state.tipOff`, которую каждый запуск переписывает, — поэтому флаг здесь безопасен.
- **Проверка:** на стенде с двумя iframe: курсор с цели на соседний iframe одним движением — тултип скрыт; Alt+Tab — скрыт.
- **Уверенность:** [бой] (adoption 25.09, 29.09).
- **Образец:** adoption:Виджеты/pa-reports-body.chart.js (`state.tipOff`, `state.tipGuard`); HRBP_HUB:proteus/hrbp-hub.chart.js
  (`scheduleHide`, `TIP_HIDE = 110`).

### CJ-13. Обновляй по вводу точечно, а при полном `render()` возвращай прокрутку и фокус
- **Почему:** RETRO 68 (smoke E23b): `onInput` звал полный `render()` и пересоздавал поле ввода — каретка терялась после
  каждой буквы. adoption 18.09: `overlay.innerHTML` сбрасывал `scrollTop` в 0, и клик внизу длинного списка «прыгал наверх».
  Без возврата фокуса Esc перестаёт доходить до открытого поповера.
- **Как:**
  - По вводу обновляй только узлы результата: `[data-tbox]` (таблица или дерево), `[data-plist]` (список поповера),
    `[data-tcount]` (счётчик), страницы. Поле ввода не пересоздаётся. Дебаунс ввода — 120 мс.
  - Полный `render()`: до — запомнить `scrollTop` / `scrollLeft` overlay и внутренних списков (ключ — data-атрибут и
    значение), после — вернуть; прокрутку панелей возвращай, пока подпись данных и вкладка те же.
  - Фокус был внутри overlay и пропал — вернуть тому же контролу по набору data-атрибутов (`focus({preventScroll: true})`).
  - Перезапуск скрипта (ресайз, перерисовка ячейки — без нового ответа) ставит новый overlay со `scrollTop` 0. Прокрутку
    overlay и панелей держи в `window.__pvtState` (запись — по событию `scroll`, слушатель с `capture`, чтобы ловить и
    панели) с ключом вида (вкладка, глава, юнит) и возвращай на старте, если ключ тот же и это не ответ на свой запрос;
    рисуй тогда без анимации (CJ-10). TeamPulse 20.10, видео заказчика: вкладка блока каждые пару секунд «прыгала»
    наверх, модель песочницы (`rerun`) воспроизводит: 594 → 0, после правки 594 → 594.
  ```js
  function render() {
    var k = scrollOf(), had = overlay.contains(document.activeElement);
    overlay.innerHTML = buildHTML();
    scrollTo(k, true);
    if (had && state.open && !overlay.contains(document.activeElement)) focusPop();
    renderTip();
  }
  function onInput(e) {
    if (e.target.getAttribute('data-tsearch') === null) return;
    state.search = e.target.value; state.page = 0;
    clearTimeout(state.tsT);
    state.tsT = setTimeout(refreshTable, 120);   // только [data-tbox], страницы и [data-tcount]
  }
  ```
- **Проверка:** smoke E23 и E23b (фильтрация и живая каретка); на стенде — клик в конце длинного списка: `scrollTop` до и после
  равны.
- **Уверенность:** [бой] (RETRO 68, adoption 18.09).
- **Образец:** detail_list:proteus/detail-list.chart.js (`scrollOf`, `scrollTo`, `render`, `refreshTable`, `refreshList`, `onInput`).

### CJ-14. Строй каждый CSS-селектор от префикса `ns`, а триггерные data-атрибуты пиши без префикса
- **Почему:**
  - RETRO 67: составной селектор с двойной точкой `.hier-X..hier-Y` — браузер молча отбросил 31 селектор; снаружи это был
    один симптом «клик не изменил экран».
  - RETRO 64: в разметке класс `ns-active`, в CSS `.active` — правая половина виджета пустая до первого клика.
  - RETRO 56, 59: атрибут `data-tip-kind` или склейка `pvt-data-tip` — тултиповый слой smoke уходит в N/A, экрана не видит никто.
  - Каждый чарт живёт в своём iframe, коллизий классов между чартами нет. Префикс нужен слоям в body (тултип, тур, линейка)
    и проверкам скилла.
- **Как:**
  - В `buildCSS()`: `var P = '.' + CFG.ns;` каждое правило начинается с `P + '-…'`; составной — `P + '-x' + P + '-y'`.
  - В `buildHTML()`: `var P = CFG.ns;` без точки (RETRO 23: `class=".pvt-root"`).
  - Триггеры — ровно `data-tip`, `data-kind`, `data-action`, `data-view`; вкладки — `role="tab"` и `aria-selected`;
    кнопка поповера — `data-action="open"`. По этим именам smoke скилла ищет, что наводить и на что кликать (E15–E24).
- **Проверка:** validate S5, S5b, S5c (собранный CSS: двойная точка, скобки), S6b, T7, T7b. Предложение для стенда: сравнить
  число правил собранного `<style>` (`sheet.cssRules.length`) с числом правил в `buildCSS()` — браузер выбрасывает
  невалидные молча, а S5c ловит не всё.
- **Уверенность:** [бой] (RETRO 56, 59, 64, 67); [вывод] — проверка через `cssRules`.
- **Образец:** HRBP_HUB:proteus/hrbp-hub.chart.js (`buildCSS`, `buildHTML`). Нарушение — TeamPulse:Team Pulse/styles.css:
  582 правила, из них 3 с префиксом `tp-`.

### CJ-15. Держи в DOM только текущую страницу; порядок категорий и масштаб задавай явно
- **Почему:** TABLES.md скилла (RETRO 27, 28, 30, 40): тысячи строк в DOM — секунды на каждый `render()`, `display:none`
  лишних строк не спасает. RETRO 15, 18, 54, 55: стаж сортировался по величине вместо смыслового порядка; группа из 47 человек
  рисовалась вровень с группой из 797; шаг 26 px вместо 27 выкинул последний бар за `viewBox`. ORDER BY датасета порядок в JS не
  гарантирует: обёртка Proteus с GROUP BY его теряет (DS-25, 05-dataset.md).
- **Как:**
  - Сначала срез текущей страницы, потом сборка HTML. Поиск, сортировка, группировка и «Копировать» работают по полной
    JS-модели, а не по DOM.
  - Порядок категорий — из макета в `CFG.order` для каждого категориального поля; явный `sort` в `buildModel()`.
  - Масштаб — один на весь вид. Геометрию повторяющегося блока снимай с двух копий и проверяй на последней.
- **Проверка:** на стенде 25 000 строк: число `<tr>` в DOM = размер страницы (100); smoke строит автомок по `CFG.order`.
- **Уверенность:** [бой] (RETRO 15, 18, 54, 55; TABLES.md).
- **Образец:** detail_list:proteus/detail-list.chart.js (`viewRows`, `tableInnerHTML`, `pageSize` 100);
  adoption:skills/proteus-echarts-builder/RECIPES.md (раздел «Геометрия и порядок повторяющегося блока»).

### CJ-16. Не меняй тип входа общей функции форматирования
- **Почему:** HRBP 29.09: функция имени строки трансформера `trName` стала принимать объект, а фильтры разрезов звали её со
  строкой. Неделю в бою не было имён значений в фильтрах; нашли 06.10. ESLint и smoke такое не ловят: функция существует,
  ошибки нет, текст просто пустой.
- **Как:** одна функция — один тип входа (`cutName(строка)` для значений разрезов, `trName(объект)` для строк трансформера).
  Новый вход — новая функция. Перед правкой сигнатуры — `grep -n 'имя('` всех вызовов.
- **Проверка:** живой прогон стенда проверяет, что видимый текст значений каждого фильтра не пустой (13-stand.md).
- **Уверенность:** [бой] (29.09 → 06.10).
- **Образец:** HRBP_HUB:proteus/hrbp-hub.chart.js (`cutName`, `trName`).

---

## D. Данные в чарте

### CJ-17. Читай весь `data`, ищи строки по роли и разбирай ответ один раз — кэшем по отпечатку
- **Почему:** RETRO 11: чтение `data[0]` вместо массива — в графике одна строка. Порядок строк ответа не гарантирован
  (DS-25). Скрипт перезапускается с тем же `data` на каждый ресайз и перерисовку, а разбор тяжёлого ответа дорог: стенд DL —
  25 000 сотрудников УС 0,84 с, КП 1,2 с. Прежний чарт DL сортировал строки на каждой перерисовке.
- **Как:**
  - `var rawData = (typeof data !== 'undefined' && Array.isArray(data)) ? data : [];` — весь массив.
  - `meta` и остальные роли ищи по колонке `role`, не по индексу.
  - Отпечаток ответа: метки запроса из meta (`rq`, `frq`) + число строк + суммарная длина тяжёлой колонки + подпись
    применённого. Совпал — бери модель из `state.cache`. Сортировка — один раз при разборе.
  - Смена режима (вкладки, вида датасета) сбрасывает кэш.
  ```js
  var fpk = (M.m.rq || '') + '|' + (M.m.frq || '') + '|' + rawData.length + '|' + heavyLen + '|' + M.rsig;
  if (!(state.cache.rows && state.cache.rows.fp === fpk)) {
    state.cache.rows = { fp: fpk, rows: parseRows(), prep: {} };   // декод, разбор, сортировка — здесь и только здесь
  }
  ```
- **Проверка:** на стенде второй запуск скрипта с тем же ответом — разбор 0 мс (`performance.now()` вокруг `buildModel`).
- **Уверенность:** [бой] (RETRO 11); [вывод] — стенд чарта DL (замеры разбора).
- **Образец:** detail_list:proteus/detail-list.chart.js (`buildModel`: отпечаток `fpk`, `state.cache.rows`, `prepRows`).

### CJ-18. Декодируй base64 встроенными `atob` и `TextDecoder`
- **Почему:** прежний чарт DL (v19) тратил на свой посимвольный декодер base64 8,9 с из 9,4 с разбора ответа. Встроенные
  функции на 25 000 сотрудников: 8,9 → 0,8 с; ответ 5 000 строк × 14 колонок — 26 мс. Кириллицу в тяжёлых ответах датасет
  отдаёт base64 от UTF-8 (DS-17, 05-dataset.md).
- **Как:**
  ```js
  var UTF8 = (typeof TextDecoder !== 'undefined') ? new TextDecoder('utf-8') : null;
  function b64utf8(s) {
    if (!s) return '';
    var bin = atob(String(s));
    if (!UTF8) return decodeURIComponent(escape(bin));   // запасной путь без TextDecoder
    var n = bin.length, u = new Uint8Array(n);
    for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    return UTF8.decode(u);
  }
  ```
  Посимвольный декодер base64 не пиши. В конфиге ESLint `atob`, `TextDecoder`, `escape`, `Uint8Array` — глобалы песочницы.
- **Проверка:** на стенде замер разбора ответа худшего случая (25 000 записей): ≤ 1 с.
- **Уверенность:** [вывод] — стенд чарта DL (замер 8,9 → 0,8 с).
- **Образец:** detail_list:proteus/detail-list.chart.js (`b64utf8`, `colRows`).

### CJ-19. Называй ошибку поставки текстом в чарте
- **Почему:** владелец вставляет файлы руками, консоль боя агенту не видна. Поле из SQL не попадает в `data`, пока его не
  добавили в «Измерения» (RETRO 17), — без сообщения виджет просто пуст. Лимит строк режет ответ молча (DS-24, DS-25).
  Владелец ставит файлы не одновременно: adoption 30.09 — «никто не смотрел» при 2 134 пользователях, потому что в датасете
  стоял старый SQL, а чарт не отличал «нет данных» от «старый датасет».
- **Как:** каждой ситуации — видимый текст с номером пункта инструкции поставки:

  | Ситуация | Что показать |
  |---|---|
  | `data` пуст | «Датасет не вернул строк: проверьте, что чарт смотрит на датасет X, лимит строк 50 000 (п. N)» |
  | в `data[0]` нет колонок `CFG.fields` | список недостающих колонок и «добавьте в „Измерения“ чарта (п. N)» |
  | нет строки `meta` | «Ответ неполный: датасет не тот или лимит строк мал (п. N)» |
  | `data.length` ≠ `meta.rows` (или нет строки `end`) | жёлтая плашка «Ответ обрезан: пришло N строк из M, поставьте лимит 50 000 (п. N)» |
  | штамп сборки `meta.build` несовместим с `CFG.build` | «Датасет N-й поставки, чарт M-й — замените файл K» |
  | ответ старого формата | прочитать и старый формат; если нельзя — «обновите датасет (файл K)», а не пустота |
  | нет `applyCrossFilter` | «Откройте чарт на дашборде: фильтры работают только там» |
  | `ok = 0` в meta | штатная плашка доступа (AC-02, 03-access-cache.md) |
  | исключение при монтаже | «Ошибка графика: …» в своём overlay (CJ-03) |

  Совместимость форматов в обе стороны и штамп версии собирает сборщик поставки (14-delivery.md); число строк в `meta`
  считает датасет (DS-25).
  ```js
  if (MODEL.err) {
    var msg = MODEL.err === 'empty' ? ['Нет данных', 'Датасет не вернул строк. Проверьте датасет чарта и лимит строк 50 000.']
      : MODEL.err === 'columns' ? ['В данных нет колонок: ' + MODEL.missing.join(', '),
                                   'Добавьте их в «Измерения» чарта (инструкция поставки, п. 4).']
      : ['Нет служебной строки meta', 'Ответ неполный: увеличьте лимит строк чарта до 50 000.'];
    return buildCSS() + '<div class="' + CFG.ns + '-empty"><b>' + esc(msg[0]) + '</b>' + esc(msg[1]) + '</div>';
  }
  ```
- **Проверка:** на стенде подать ответ без колонки, без meta, урезанный лимитом строк и ответ прошлой поставки — каждый раз
  виден текст с пунктом инструкции, ошибок консоли нет.
- **Уверенность:** [бой] (RETRO 17, adoption 30.09); [вывод] — сверка `meta.rows` и штамп версии: в проектах их пока нет
  (обрезку HRBP ловит по строке `end`; штамп в датасет ставит kit/pack_template.py, DV-09).
- **Образец:** detail_list:proteus/detail-list.chart.js (`buildModel` → `M.err`, ветка `MODEL.err` в `buildHTML`);
  HRBP_HUB:proteus/hrbp-hub.chart.js (`CFG.text.truncated` по строке `end`, список колонок для «Измерений»).

---

## E. Проверка

### CJ-20. Проверяй чарт маршрутом `node --check` → ESLint no-undef → `check.py` скилла → живой стенд
- **Почему:** HRBP 29.09: сводная упала в бою на «hDelta is not defined» — вызов удалённой функции не ловят ни `node --check`,
  ни smoke, если клик до него не дошёл. Smoke скилла кликает 12 триггеров из 147 на хосте-div 420 px без iframe. RETRO 58: сдача
  «59/59 PASS» без браузерного прогона — пирамида уехала обрезанной на 18 px.
- **Как:**
  1. `node --check <чарт>`.
  2. ESLint `no-undef`, `ecmaVersion: 5`, `sourceType: 'script'`, 0 ошибок — общим конфигом `kit/eslint.chart.cjs`. Он
     объединяет конфиги HRBP и DL и добавляет то, что берут чарты adoption и TeamPulse: контракт `data`, `applyCrossFilter`
     (readonly), `option` (writable); окно, документ, таймеры, `requestAnimationFrame`, `ResizeObserver`,
     `IntersectionObserver`, `MutationObserver`; `atob`, `btoa`, `TextDecoder`, `escape`, `Blob`, `URL`, `URLSearchParams`,
     типизированные массивы; объекты `Map`, `Set`, `Symbol`, `Promise` (их берут помощники Babel). Конфиг HRBP на виджетах
     adoption давал 6 ложных ошибок (`atob`, `btoa`, `Blob`, `URL`); объединённый — 0 на 15 файлах. Сверх `no-undef` конфиг
     ловит `new Function` (`no-new-func`) и предупреждает о том, чего в песочнице нет: `localStorage`, `fetch`, `location`,
     `history`, `alert` (`no-restricted-globals`, SB-01). Запускай из корня репозитория: для файла вне base path ESLint 9+
     печатает «File ignored because outside of base path» и выходит с кодом 0 — считай это провалом.
  3. `python3 <скилл>/check.py <чарт>` по читаемому исходнику, мок — с ответа стенда (`stand/mock.py`), иначе заполни
     `CFG.order`. Скрипты скилла — по полному пути: «N/A, нет файла рядом» — это неверный вызов, а не результат. FAIL —
     гипотеза: открой место. Известные ложные срабатывания на рабочем коде — S11a (backtick внутри строкового литерала), C4
     (отложенный `relayout`), K3b (тултип за курсором), S20 (`@media`: в iframe окно = ячейка, но класс по `clientWidth`
     надёжнее, CJ-07), любые структурные проверки на сжатой сборке. Их оспаривай `--accept 'КОД=причина'`; больше двух
     оспоренных за сдачу — уже подгонка (15-process.md).
  4. Живой стенд борда в модели песочницы (свой стенд проекта или `kit/sbx/run.cjs`): каждый контрол каждой вкладки и
     режима, ошибка консоли — провал шага (13-stand.md, SB-20).
  5. Сжатую сборку проверяй `node kit/min.cjs --verify <сборка>` (ES5, глобальный `option`, нет `eval` и `new Function`) и
     поведением: smoke и модель песочницы на сборке дают тот же вердикт, что на исходнике (kit 08.10: 10 чартов из 10).
     validate по сборке не гоняй: 7–16 ложных FAIL по форме (C1, H3, S1, S3, S5, S14 — блоки ищутся по комментариям,
     локальные имена сжаты).
  ```
  node --check proteus/<name>.chart.js
  node $(npm root -g)/eslint/bin/eslint.js -c <playbook>/kit/eslint.chart.cjs --no-config-lookup proteus/<name>.chart.js
  NODE_PATH=$(npm root -g) python3 <скилл>/check.py proteus/<name>.chart.js
  NODE_PATH=$(npm root -g) node <playbook>/kit/sbx/run.cjs proteus/<name>.chart.js proteus/<name>.mock.json --css <CSS борда>
  ```
- **Проверка:** в SELF_CHECK.md и NOTES — пять итогов: синтаксис, ESLint 0 ошибок, вердикт `check.py` (с оспоренными
  кодами и причинами), прогон стенда с 0 провалов на файлах поставки, `min.cjs --verify` сборки.
- **Уверенность:** [бой] (HRBP 29.09; RETRO 58).
- **Образец:** kit/eslint.chart.cjs (общий конфиг; прогон на чартах четырёх проектов — kit/RESULTS.js.md, раздел 3);
  detail_list:stand/click.cjs (живой прогон, 233 шага в 31-й поставке); kit/sbx/run.cjs (модель песочницы для любого чарта).

---

## F. Поставка кода

### CJ-21. Поставляй сжатую сборку terser 5.51.2; исходник с комментариями держи в репозитории
- **Почему:** Proteus кладёт код чарта в `form_data.jsx` КАЖДОГО POST `chart/data`: при открытии, «Применить», каждом
  кросс-фильтре и даже при ответе из кэша (F11, 01-platform.md). DevTools владельца 07.10: отправка ≈50 КБ/с; список DL
  169 КБ уходил 5,8 с, панель 115 КБ — 2,6 с. Сжатие terser:

  | Проект | Чарт | Было | Стало |
  |---|---|---|---|
  | DL | список | 215 КБ (сейчас исходник 232) | 129 КБ (сейчас 139) |
  | DL | панель | 114 КБ | 65 КБ |
  | HRBP | чарт | 405,8 КБ | 236,7 КБ (−42 %, ≈ −3,4 с на запрос) |
  | adoption | шапка / каталог / панель | 75 / 187 / 307 КБ | 43 / 97 / 171 КБ (лист 568 → 311 КБ) |
  | TeamPulse | чарт | 536 КБ | 398 КБ, со сжатым CSS — 340 КБ |

  КБ здесь — 1 000 байт; kit/RESULTS.js.md считает в КиБ (HRBP 396,3 → 231,2 КиБ — те же байты). Сжатые сборки DL впервые
  ушли в 21-й поставке (07.10); в бою работают с 23-й (отзывы владельца по 24–27-й).
- **Как:**
  ```js
  // stand/min.cjs: исходник из stdin → сборка в stdout; npm i -g terser@5.51.2
  const { minify } = require('terser');
  const r = await minify(src, {
    ecma: 5,
    toplevel: false,                                     // option, data, applyCrossFilter — контракт песочницы
    compress: { toplevel: false, keep_fargs: true },
    mangle: { toplevel: false },
    format: { ascii_only: false, comments: false, preamble: '/* <отчёт>: сборка <исходник>, правки — в исходнике */' },
  });
  ```
  - Версию terser закрепи (`npm i -g terser@5.51.2`): другая версия даёт другой текст, и `pack.py --check` расходится.
  - `ascii_only: false`: кириллица уходит UTF-8, а не `\uXXXX` (6 байт на букву).
  - terser не трогает содержимое строк: CSS в строках и встроенные картинки сжимай отдельно (CJ-23).
  - После сборки — `node --check`; живой прогон и тур — на сборке и файлах поставки (DL: `DL_DIST=1`); validate скилла и
    ESLint — на исходнике.
  - Готовый сборщик — `kit/min.cjs`: без флагов выдаёт байт в байт то же, что detail_list:stand/min.cjs; `--check`
    проверяет сборку (ES5, глобальный `option`, все имена верхнего уровня на месте, нет `eval` и `new Function`), `--budget N`
    роняет сборку больше N КиБ, `--kbps 50` печатает «было → стало, ≈ с отправки» (DV-06, 14-delivery.md).
    ```
    NODE_PATH=$(npm root -g) node <playbook>/kit/min.cjs 'шапка' --check --budget 250 < proteus/<name>.chart.js > 'Поставка/5. Чарт.js'
    ```
  - Сборка — одна строка: номер строки из консоли боя ничего не скажет. Держи в репозитории исходник того же коммита и
    проси у владельца текст ошибки целиком.
- **Проверка:** на стенде — живой прогон на файлах поставки. В бою — DevTools → Network → `chart/data` → Payload: размер
  `form_data.jsx`; Timing: время отправки до и после поставки.
- **Уверенность:** [бой] (DevTools 07.10; сборки DL в бою с 23-й поставки) + [исходник 2.0.1] (`buildQueryContext.ts`
  отдаёт `form_data: formData`). Выигрыш у HRBP, adoption, TeamPulse — [вывод] [не проверено в бою]; что сборка ведёт себя
  как исходник — [вывод] (smoke 10 чартов из 10, модель песочницы строка в строку, kit 08.10).
- **Образец:** kit/min.cjs (сборка и проверка); detail_list:stand/min.cjs и detail_list:stand/pack.py (сборка файлов 5–8 с
  шапкой); kit/pack_template.py (вид `js` в сборщике поставки).

### CJ-22. Клади код чарта целиком в поле JS; не загружай код из ответа датасета
- **Почему:** 22-я поставка DL (07.10): в поле JS стоял загрузчик 5 КБ, а сам код — сжатой строкой `js` в ответе датасета
  (raw deflate + base64, запуск через `new Function` или `<script nonce>`). На бумаге — минус ≈4 с на запрос списка (отправка
  129,7 → 5,2 КБ) ценой +38 и +21 КБ ответа на проводе. У владельца сломались все четыре JS-чарта: «Зачем ты сломал js чарты». В 23-й
  поставке — откат. Причина не выяснена: что было на месте чарта и в консоли, владелец не прислал. В самом загрузчике есть
  противоречие: CSP без `unsafe-eval` запрещает и `new Function`.
- **Как:**
  - В поле JS — полный сжатый код (CJ-21). Ветку загрузчика держи выключенной (`LOADER_ON = False`), а лучше удали из сборщика,
    чтобы её нельзя было включить случайно.
  - Любой механизм, который нельзя проверить вне песочницы (загрузка кода, `eval`, `new Function`, новые API браузера, новые
    каналы к родителю, CSS «поверх страницы»), — только отдельной пробой: один чарт на копии борда, запасной файл и откат в той
    же поставке, не больше одной такой пробы за поставку. Заранее пиши, что прислать: текст на месте чарта, скриншот,
    консоль F12 (14-delivery.md).
- **Проверка:** grep сборки поставки на `new Function`, `eval(`, `<script` — 0 вхождений.
- **Уверенность:** [бой] (07.10, поломка всех чартов).
- **Образец:** detail_list:stand/pack.py (`LOADER_ON = False`, сборка без загрузчика); detail_list:docs/analysis.md (раздел 9.24
  «загрузчик»).

### CJ-23. Собирая чарт из макета на современном JS, прогоняй Babel → ES5 → terser и сжимай CSS и картинки
- **Почему:** TeamPulse собирает чарт из модулей макета — тех же файлов, что на GitHub Pages. Babel с `compact:false` даёт
  536 КБ — ≈10,7 с отправки на каждый запрос при 50 КБ/с. terser даёт 398 КБ, и из них: CSS-строка ≈119 КБ (≈55 КБ —
  комментарии), 10 картинок маскота WebP base64 ≈74 КБ (≈1,5 с на каждый запрос), разметка ≈7 КБ, код ≈199 КБ. Сжатие
  встроенного CSS (≈119 → 61 КБ, правила в CSSOM те же) даёт 340 КБ (≈6,8 с), без маскота — ≈267 КБ (≈5,3 с).
- **Как:**
  1. Каждый модуль макета — своей функцией, всё — в общем `try` с сообщением в хосте вместо пустой ячейки.
  2. Babel `preset-env`, `targets: {ie: '11'}`, `useBuiltIns: false`, `comments: false`.
  3. acorn `ecmaVersion: 5` и запреты вне строк: `getElementById`, `console.`, `eval(`, `=>`, backtick; `option` — последним.
  4. terser с параметрами CJ-21 и бюджетом (`kit/min.cjs --check --budget N`).
  5. CSS — без комментариев и лишних пробелов до вставки строкой: `kit/min.cjs --css-var ИМЯ` сжимает строку
     `var ИМЯ = "…"` верхнего уровня, не трогая строки, `url(…)` и `var(…)`.
  6. Картинки: только те, что показываются в Proteus; base64 стоит размер файла × 4/3 в КАЖДОМ запросе. Перекодируй в 2×
     показанного размера (WebP q80: маскот TeamPulse ≈74 → ≈50 КБ) или выкинь из Proteus-сборки. SVG — не замена растру:
     стикер SVG весит 450–570 КБ.
  7. Выкинуть из сборки всё, что в песочнице не работает: онбординг по `localStorage`, `location`, `history`,
     `navigator.clipboard` без запасного пути (SB-02, SB-10); их найдут предупреждения `kit/eslint.chart.cjs` (CJ-20).
  ```js
  const out = babel.transformSync(src, { sourceType: 'script', comments: false, babelrc: false, configFile: false,
    presets: [[require.resolve('@babel/preset-env'), { targets: { ie: '11' }, modules: false, useBuiltIns: false }]] }).code;
  acorn.parse(out, { ecmaVersion: 5, sourceType: 'script' });   // бросит, если остался не ES5
  // дальше — minify(out, параметры CJ-21)
  ```
- **Проверка:** сборщик печатает размер и «секунд отправки»; живой прогон — на сборке в модели песочницы; после сжатия CSS —
  скриншот исходника и сборки в модели песочницы совпадают пиксель в пиксель.
- **Уверенность:** [вывод] — расчёт по размерам файлов, сверка CSSOM и скриншоты в модели песочницы (kit 08.10);
  [не проверено в бою]; качество перекодированных картинок на глаз не сверяли.
- **Образец:** TeamPulse:Team Pulse/proteus/build.js (шаги 1–3 и проверки; terser и сжатие CSS — дописать); kit/min.cjs
  (`--css-var`); разбор сборки TeamPulse по частям — kit/RESULTS.js.md, раздел 6.

---

## Где гайд уточняет скилл

Скилл proteus-echarts-builder v9.0 (коммит `e77d754`, 22.09) с тех пор не менялся, а проекты ушли вперёд. Агент, который
идёт только по скиллу, соберёт чарт с белым фоном, тултипом под целью и клампингом по `innerHeight`, без обёртки `onerror`,
без сжатия и без ESLint. Пока скилл не обновлён, действует таблица.

| Что говорит скилл | Что говорит гайд | Правило |
|---|---|---|
| `showTip` клампит тултип по `window.innerHeight` (RETRO 26, шаблон) | в iframe `innerHeight` — высота ячейки; по горизонтали — окно, по вертикали — видимая часть из линейки IntersectionObserver | CJ-11, SB-05 |
| Шаблон монтажа без защиты от ошибок окна | в начале `mount()` — `overflow:hidden` документа и хоста и обёртка `window.onerror` для «ResizeObserver loop» | SB-03 |
| ResizeObserver «никогда не вызывает перерисовку» (RETRO 3, проверка C4) | `render()` — никогда; отложенный `relayout()` габаритов и SVG — можно и нужно; C4 оспаривать | CJ-07 |
| Тултип под целью, якорь — прямоугольник цели | тултип едет за курсором (профиль Adoption) | 11-ui.md |
| overlay с фоном `CFG.colors.bg = '#fff'` | фон overlay прозрачный, холст = фон борда `#f6f6f6` | 10-board-css.md, 11-ui.md |
| В маршруте сдачи нет ESLint | ESLint `no-undef` общим конфигом `kit/eslint.chart.cjs` обязателен, «File ignored» — провал | CJ-20 |
| Сборки поставки нет | terser 5.51.2 через `kit/min.cjs --check --budget`, живой прогон на сборке, validate — на исходнике | CJ-21 |
| validate и smoke гоняются по любому файлу | validate — только по исходнику; на сборке — `min.cjs --verify`, smoke и модель песочницы | CJ-20, CJ-21 |
| smoke: хост-div 420 px, первые 12 триггеров | живой стенд борда в модели песочницы (`kit/sbx/run.cjs` или стенд проекта) проходит каждый контрол | CJ-20, SB-20 |
| SQL.md и ШАГ 2: SQL снимается через MCP `proteus_chart_logic`, руками не пишется | для виртуального Jinja-датасета SQL — это API ответа (роли, компоненты, носители, логин в `{{ }}`), проверяемый стендом chdb 24.8; MCP из облачной сессии недоступен | 05-dataset.md, 02-superset-path.md |
| ЖЕЛЕЗНОЕ ПРАВИЛО 2: `data` несёт сырые строки, считает JS | «считает JS» верно для долей и рангов, но сырые строки упираются в лимит строк и вес: датасет отдаёт аддитивные компоненты, куб и колонки упакованными | DS-04, DS-18 (05-dataset.md) |
| `getElementById` запрещён, потому что «видит весь дашборд» | у чарта свой iframe; запрет оставить — после перезапуска в том же окне находит старые узлы | CJ-02 |
| `@media` и `vw`/`vh` меряют окно браузера, а не ячейку, — «узкая» ветка не включится (RETRO 49) | устарело: у чарта свой iframe, его окно = ячейка, и `@media`, `vw`/`vh` меряют ячейку. Узкий вид всё равно ставь классом по `clientWidth` (работает и в smoke без iframe); «по экрану» — не `vh` чарта, а видимая часть и CSS борда | CJ-07, SB-05, SB-06 |
| Нет ничего про кросс-фильтры, JSON областей, канал между чартами, разворот iframe, CSS борда, тур, поставку | см. главы гайда | 08, 09, 10, 12, 14 |
| «Вес» файлов в таблице чтения: SKILL.md 27К, PATTERNS.md 26К | по факту 45 и 48 КБ (таблица смешивает символы и байты); бюджет контекста считай по факту | — |

Что скилл говорит верно и гайд подтверждает: state в `window.__pvtState[ns]`; флаг «уже навешено» — только для `window` и
`document`; data-атрибуты триггеров без префикса; `showTip`/`hideTip` снимают оба свойства; порядок категорий — из макета;
FAIL — гипотеза, ложное оспаривается вслух; порядок `BLOCKED.md` при заблокированном скрипте; галочки «Измерений» в FIELDS.md
ставит владелец.

---

## Симптом → правило

| Что видно | Вероятная причина | Правило |
|---|---|---|
| Ячейка пустая, ошибок нет | монтаж не вызван, `render()` не вызван, молчаливый `catch` | CJ-03 |
| «option is not defined», ECharts рисует свой график | `option` не глобальный, не последний или с данными | CJ-04 |
| Выбор сбрасывается после перерисовки | выбор жил в DOM или в локальной переменной | CJ-05 |
| Со второй отрисовки «картинка без интерактива» | слушатели overlay под флагом из `state` | CJ-06 |
| Клик срабатывает дважды, Esc — многократно | глобальные слушатели не сняты при перезапуске | CJ-06 |
| Чарт мигает при ресайзе или гаснет на Windows | `render()` или синхронная правка размера в колбэке RO | CJ-07, SB-03 |
| Чарт пропал после клика | ReferenceError: функция из `mount()` вызвана снаружи | CJ-08 |
| Подписи графика растут вместе с ячейкой | `viewBox` + `width:100%` у SVG с текстом | CJ-09 |
| График анимируется на каждый клик и ресайз | нет ключа `state.drawn` | CJ-10 |
| Тултип не появляется, ошибок нет | показ снял одно из двух свойств | CJ-11 |
| Подсказка залипает после ухода курсора | нет гашения на `mouseout` документа и `blur` | CJ-12 |
| Каретка теряется после каждой буквы | `render()` на ввод | CJ-13 |
| Клик внизу списка «прыгает наверх» | `innerHTML` без возврата прокрутки | CJ-13 |
| Половина стилей не работает | двойная точка в селекторе, префикс только с одной стороны | CJ-14 |
| Таблица тормозит на тысячах строк | все строки в DOM | CJ-15 |
| Пустые подписи значений фильтров | общей функции сменили тип входа | CJ-16 |
| Ресайз подтормаживает на большом ответе | разбор ответа на каждом перезапуске | CJ-17 |
| Разбор ответа — секунды | свой декодер base64 | CJ-18 |
| Виджет пуст после поставки | колонок нет в «Измерениях», лимит строк, старый датасет | CJ-19 |
| В бою «X is not defined», на стенде всё зелёное | маршрут без ESLint и живого прогона | CJ-20 |
| Каждое действие — плюс секунды при быстром ClickHouse | несжатый код едет в каждом `chart/data` | CJ-21 |
| После поставки сломались все JS-чарты | непроверяемый механизм запуска кода | CJ-22 |

## Связанные главы

- 01-platform.md — факты платформы: код чарта в каждом запросе (F11), песочница (F23), сеть владельца (F21), слагаемые
  времени экрана (PL-03).
- 05-dataset.md — что чарт получает: контракт колонок, meta и число строк (DS-03, DS-25), base64 и колонки (DS-17, DS-18),
  компоненты вместо долей (DS-04).
- 08-sandbox.md — чего нет у песочницы, ошибки окна, видимая часть, канал скриншотов, буфер, ссылки.
- 09-multi-chart.md — эмит кросс-фильтра, сверка по эху, канал между чартами, разделение работы между чартами.
- 10-board-css.md — CSS борда вокруг iframe: холдер, флекс-цепочка, разворот по маркеру, высота ряда.
- 11-ui.md — профиль внешнего вида: кегли, веса, цвета, тултип за курсором, графики.
- 12-tour.md — тур «Как работать», в том числе через несколько чартов.
- 13-stand.md — живой стенд борда, мок для smoke, прогон на сборке.
- 14-delivery.md — сборщик поставки, штамп версии, совместимость форматов, пробы непроверяемого.
- 15-process.md — FAIL как гипотеза, заблокированные проверки, работа со скиллом.
