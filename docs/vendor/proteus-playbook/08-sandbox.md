# 08. Песочница iframe: чего у чарта нет и как выйти за ячейку (SB)

**Зачем глава.** Каждый кастомный чарт Proteus живёт в `<iframe sandbox="allow-scripts">` без `allow-same-origin`, размером
с ячейку борда. Отсюда следствия для кода: нет хранилища, сети и родителя; любая ошибка окна гасит чарт; `innerHeight` —
это ячейка, а не экран; выйти за ячейку можно только каналом скриншотов и CSS борда; ссылки и пресеты — только через адрес
страницы. Глава — о том, как жить в этих рамках. Каркас кода — 07-chart.md, CSS борда — 10-board-css.md, связь чартов между
собой — 09-multi-chart.md.

**Главное в 5 пунктах.**
1. **SB-03, SB-04.** Ни одной ошибки окна: в начале `mount()` — `overflow:hidden` у `html`, `body` и хоста и обёртка
   `window.onerror`, пропускающая мимо песочницы только «ResizeObserver loop»; каждый необязательный API — с проверкой.
   Растяжку iframe CSS борда и разворот по маркеру ставь только вместе с этим.
2. **SB-05.** `window.innerHeight` и `100vh` — высота ячейки. Всё «по экрану» (модалка, тултип, карточка тура, высота
   панелей) ставь по видимой части из линейки IntersectionObserver; высоту ряда по экрану даёт CSS борда (SB-06).
3. **SB-11, SB-13.** За ячейку выходи только каналом скриншотов: PNG 1×1 с маркером → CSS борда разворачивает iframe.
   Геометрию после сигнала применяй по факту `resize`, а не по отправке.
4. **SB-10.** Буфер обмена — `execCommand('copy')` из скрытой textarea в жесте клика; Clipboard API в песочнице запрещён.
5. **SB-17, SB-18.** Адресов в коде нет: адрес борда — из `document.referrer`, запасной — из meta датасета; ссылка на вид —
   параметр адреса и якорь вкладки, не длиннее 4 000 знаков, пока предел в бою не проверен.

Метки уверенности — как во всём гайде (01-platform.md). Опыты в браузере (Chromium 141, playwright, iframe
`sandbox="allow-scripts"`, по `src` и по `srcdoc`) подтверждают поведение браузера, но не песочницы форка: такие правила
помечены [вывод] с пометкой «опыт Chromium 141».

---

## Что известно о песочнице

| # | Факт | Значение | Уверенность | Источник |
|---|---|---|---|---|
| S1 | Атрибуты iframe | `sandbox="allow-scripts"`, без `allow-same-origin`; сборка форка `hotfix-260909` | [бой] | сохранённая страница живого борда 18.09 (adoption:memory/proteus-adoption-html-embedding.md) |
| S2 | Размер iframe | атрибуты `width`/`height` ставятся при монтаже (ячейка − 32/36 px: высота чарта 2.0.1 = единицы сетки × 8 − 32 − шапка) и потом не пересчитываются; по умолчанию iframe строчный (щель снизу). Растягивает только CSS борда | [бой] + [исходник 2.0.1] (`ChartHolder.jsx`) | там же; 10-board-css.md |
| S3 | Происхождение | `self.origin === "null"`, `frameElement === null`; `window.top.frames` доступен, `postMessage` родителю и соседним iframe работает | [вывод] опыт Chromium 141 | опыт 08.10: iframe по `src` и по `srcdoc` |
| S4 | Родитель | чтение `parent.document`, навигация `top.location` — SecurityError («Blocked a frame with origin "null"», «Unsafe attempt to initiate navigation») | [вывод] опыт Chromium 141 | там же |
| S5 | Хранилища | `localStorage`, `sessionStorage`, `indexedDB.open`, `document.cookie` — SecurityError: следствие `sandbox` без `allow-same-origin`. Необработанное исключение гасит чарт (S7) | [вывод] опыт Chromium 141 и модель kit (`localStorage` вне `try` — чарт погас); в бою видны только атрибуты (S1) | detail_list:docs/analysis.md (раздел 9.25); kit/RESULTS.js.md (раздел 5) |
| S6 | Сеть | CSP документа песочницы `connect-src 'none'`: `fetch` и XHR запрещены. Запрет даёт CSP, а не sandbox; без CSP запрос ушёл бы с `Origin: null` и без cookies — к API Proteus бесполезен. Отказ `fetch` — отклонённый промис (`unhandledrejection`), чарт не гаснет. Директива `connect-src` не режет `@font-face` и `<link rel=stylesheet>`, но остальные директивы CSP песочницы неизвестны — шрифтов и стилей не подключай (UI-04, 11-ui.md) | [бой] (консоль DL 06.10: CSP документа песочницы) + [вывод] опыт Chromium 141 | detail_list:docs/analysis.md (раздел 9.12); kit/RESULTS.js.md (раздел 5) |
| S7 | Ошибки окна | любая ошибка окна — `chart.clear + dispose`, чарт пропадает; и на безвредное «ResizeObserver loop completed with undelivered notifications» | [бой] (борд 59922, 17.09; видео коллег 06.10) | adoption:memory/proteus-adoption-echarts-platform.md; detail_list@2e05b5d |
| S8 | Чем песочница ловит ошибки | `window.onerror` или слушатель `error` — неизвестно (исходника `echartsSandbox…entry.js` нет) | открытый вопрос | 17-open-questions.md |
| S9 | Перезапуск | скрипт чарта целиком перезапускается в том же окне iframe на каждый ответ и перерисовку | [бой] | adoption:skills/proteus-echarts-builder/SKILL.md |
| S10 | Окно | `innerHeight` и `100vh` в CSS чарта = высота iframe (ячейки 1 100–1 400 px бывают выше экрана); `screen.availHeight` — настоящий экран; страница борда прокручивается снаружи | [бой] (фото владельца 07.10) + опыт | HRBP_HUB@7789aad |
| S11 | Канал к родителю | только `postMessage({type:'ECHARTS_UPDATE_DATA_URL', dataUrl, payload:{dataUrl}})` → родитель кладёт dataUrl в `img.echarts-plugin` рядом с iframe. Только форк, в 2.0.1 его нет | [бой] (борд 59922, тестовый борд adoption) | adoption:Виджеты/pa-head.chart.js |
| S12 | Буфер обмена | `clipboard-write` не разрешён: `navigator.clipboard.writeText` → NotAllowedError и ошибка в консоли; `execCommand('copy')` из textarea в жесте клика — работает | [вывод] опыт Chromium 141 [не проверено в бою] | опыт 08.10 |
| S13 | `document.referrer` | iframe по `src` с того же хоста — полный адрес борда с query, без якоря; iframe по `srcdoc` — только origin. Как грузит iframe форк — неизвестно | [вывод] опыт Chromium 141 [не проверено в бою] | там же |
| S14 | Первый вход | Proteus не помнит, заходил ли пользователь | [владелец 29.09] | HRBP_HUB@6a371ff |
| S15 | Диалоги и окна | без `allow-modals` `alert`, `confirm`, `prompt` не показываются; без `allow-popups` `window.open` и ссылки `target="_blank"` окна не откроют | [вывод] по атрибутам sandbox (S1) [не проверено в бою] | kit/eslint.chart.cjs (предупреждения `no-restricted-globals`) |

---

## A. Что даёт песочница

### SB-01. Считай, что у чарта нет родителя, хранилища, сети и навигации: связь наружу — только `postMessage`
- **Почему:** факты S1–S6, S11, S15. Попытка дойти до родителя или хранилища бросает исключение, а исключение гасит чарт
  (S7). API Proteus недоступен: CSP запрещает `fetch`, а без cookies запрос бесполезен. Диалоги браузера молча не работают.
- **Как:** заменяй недоступное так:

  | Нужно | Как в песочнице | Правило |
  |---|---|---|
  | помнить вид между ответами | `window.__pvtState[ns]` — живёт, пока жив iframe | CJ-05 (07-chart.md) |
  | данные, справочники, словари | только из ответа своего датасета | 05-dataset.md |
  | сказать родителю «разверни меня» | канал скриншотов с маркером + CSS борда | SB-11 |
  | связаться с соседним чартом | `postMessage` по `window.top.frames` | MC-12 (09-multi-chart.md) |
  | высота «по экрану» | CSS борда, внутри чарта — видимая часть | SB-05, SB-06 |
  | адрес борда для ссылки | `document.referrer`, запасной — meta датасета | SB-17 |
  | шрифт | `Arial, Helvetica, sans-serif` явно; Inter страницы Superset в iframe не виден | 11-ui.md |
  | сохранить пресет, «первый вход» | ссылка, закладка браузера, тур только кнопкой | SB-02, SB-19 |
  | спросить «Точно сбросить?», показать сообщение | своя модалка или плашка в overlay, не `confirm` / `alert` | S15 |
- **Проверка:** на стенде чарт в iframe `sandbox="allow-scripts"` без `allow-same-origin` (SB-20): ошибок консоли 0.
  `kit/eslint.chart.cjs` предупреждает о `localStorage`, `sessionStorage`, `indexedDB`, `fetch`, `XMLHttpRequest`, `location`,
  `history`, `alert`, `confirm`, `open` (CJ-20); grep на `document.cookie`, `parent.document`, `top.location` — 0 вхождений
  вне `try`.
- **Уверенность:** [бой] (S1, S7, S11) + [вывод] опыт Chromium 141 (S3–S6) и атрибуты sandbox (S15).
- **Образец:** detail_list:proteus/detail-list.chart.js (адрес борда — `boardUrl`, канал — `bcast`, состояние — `STATE0`).

### SB-02. Не строй ничего на хранилище и «первом входе»
- **Почему:** владелец 29.09 (HRBP) убрал приглашение «Впервые в HRBP HUB?»: «Proteus не запоминает, первый раз зашёл или
  не первый». В песочнице `localStorage` бросает SecurityError (S5). TeamPulse держит онбординг по `localStorage` (в `try`) и
  в Proteus выключает его флагом окружения — мёртвый код, который однажды включат.
- **Как:**
  - Вид держится в `window.__pvtState`, данные — в датасете.
  - Пресет — ссылка на вид и закладка браузера (SB-18, SB-19), а не список в чарте.
  - Тур и справка открываются только кнопкой «Как работать» (12-tour.md); логики «первого входа» нет.
  - Код, который в песочнице не работает, из сборки для Proteus выкидывай, а не выключай флагом.
- **Проверка:** grep на `localStorage`, `sessionStorage` в сборке поставки — 0; ESLint с `kit/eslint.chart.cjs` — без
  предупреждений о хранилищах.
- **Уверенность:** [владелец 29.09] + [вывод] (S5: опыт Chromium 141 и модель kit).
- **Образец:** HRBP_HUB:proteus/hrbp-hub.chart.js (тур только кнопкой). Нарушение — TeamPulse:Team Pulse/app.js (онбординг по
  `localStorage`).

---

## B. Ни одной ошибки окна

### SB-03. Закрой прокрутку документа и оберни `window.onerror`: пропускай мимо песочницы только «ResizeObserver loop»
- **Почему:** 06.10, видео коллег на Windows: панель фильтров и список DL отрисовывались и через долю секунды пропадали.
  Песочница гасит чарт на любую ошибку окна (S7), в том числе на безвредное «ResizeObserver loop completed with undelivered
  notifications». Его давал корневой div echarts: размер в пикселях, песочница подгоняет его по ResizeObserver. При сужении
  iframe div на миг шире окна, в документе появлялась полоса прокрутки Windows, хост менял размер во время раздачи
  уведомлений. На Mac полосы плавающие и места не занимают — у владельца не воспроизводилось. Опыт Chromium 141:
  - «ResizeObserver loop…» приходит в `window.onerror` и в слушатели `error`, в консоль не пишется;
  - с полосами, занимающими место (`ignoreDefaultArgs: ['--hide-scrollbars']`), — 4 события «ResizeObserver loop» за прогон
    «сузить-расширить»; с `overflow:hidden` у `html`, `body` и хоста — 0; с плавающими полосами — 0 и без правила;
  - обёртка `window.onerror` гасит только RO, настоящую ошибку передаёт песочнице;
  - слушатель `error` на `window`, даже с перехватом и `stopImmediatePropagation`, песочницу не опережает: обработчики окна
    зовутся строго в порядке регистрации, песочница регистрируется раньше;
  - если песочница слушает через `addEventListener('error')`, обёртка бессильна — тогда держит только `overflow:hidden`.

  Модель kit (`kit/sbx/run.cjs`, полосы как в Windows, 08.10): без этого правила гаснут все проверенные чарты, у которых
  iframe меняет размер: шапка и строка ЦА adoption — при сворачивании разворота по маркеру; каталог и панель adoption, HRBP и
  TeamPulse с растяжкой iframe CSS борда — на сужении окна на 17 px. Чарты без растяжки и разворота живы и без правила. С
  `overflow:hidden` у `html`, `body` и хоста живы все. Поэтому
  растяжку iframe (BC-04, 10-board-css.md) и разворот по маркеру (SB-11) ставь только вместе с этим правилом.
- **Как:** в начале `mount()` каждого чарта, до любой разметки:
  ```js
  host.style.overflow = 'hidden';                       // своя прокрутка — только внутри overlay
  document.documentElement.style.overflow = 'hidden';
  if (document.body) document.body.style.overflow = 'hidden';
  var onErr0 = window.onerror;
  if (!(onErr0 && onErr0.__roSkip)) {                   // перезапуск скрипта: второй раз не оборачивать
    var onErr = function (msg) {
      if (/ResizeObserver loop/i.test(String(msg))) return true;      // безвредно: уведомления дойдут кадром позже
      return typeof onErr0 === 'function' ? onErr0.apply(this, arguments) : false;
    };
    onErr.__roSkip = true;
    window.onerror = onErr;
  }
  ```
  Размеры наблюдаемых элементов в колбэке RO меняй только отложенно (CJ-07): синхронная правка — та самая петля.
- **Проверка:** стенд в режиме песочницы (`?sbx=1`: px-div echarts с подгонкой по RO и `window.onerror`, гасящий чарт) и с
  полосами как в Windows (Chromium с `ignoreDefaultArgs: ['--hide-scrollbars']`): окно уже на 17 px и обратно — чарт на месте,
  ошибок окна 0. Без правки на этом стенде пропадание воспроизводится (окна уже на 17 px достаточно). Для любого чарта —
  `node kit/sbx/run.cjs <чарт> <мок> --css <CSS борда>` со сценарием, который открывает выпадашки и сужает окно: код
  выхода 1 — были ошибки окна, в бою чарт погас бы.
- **Уверенность:** [бой] — инцидент DL 06.10; [вывод] — опыт Chromium 141, стенд DL и модель kit; [не проверено в бою] — чем
  ловит ошибки песочница форка (S8) и гибель чартов adoption, HRBP, TeamPulse (в бою подтверждена только у DL до правки).
- **Образец:** detail_list:proteus/detail-list.chart.js и detail_list:proteus/detail-list-filters.chart.js (начало `mount`,
  `__roSkip`). Нарушение: HRBP_HUB, adoption, TeamPulse и шаблон скилла — обёртки нет, документ прокручивается (прогон
  каждого — kit/RESULTS.js.md, раздел 5).

### SB-04. Проверяй наличие каждого необязательного API перед вызовом
- **Почему:** любое исключение гасит чарт (S7). Опыт Chromium 141: на небезопасной странице `navigator.clipboard` нет вовсе,
  вызов без проверки — TypeError → `window.onerror` → чарт погашен. Отказ промиса в `onerror` не попадает (только
  `unhandledrejection`), но без обработчика — шум в консоли и неверная подпись «Скопировано». Борд 59922: ReferenceError на
  вызове несуществующего имени погасил чарт (CJ-08, 07-chart.md).
- **Как:** проверка или `try` у всего, чего может не быть:
  ```js
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, fail);
  var UTF8 = (typeof TextDecoder !== 'undefined') ? new TextDecoder('utf-8') : null;
  if (typeof IntersectionObserver === 'undefined') return;          // линейка видимости — без неё всё окно
  if (typeof ResizeObserver !== 'undefined') { /* … */ }
  try { el.animate(frames, opts); } catch (e) { /* без анимации */ }
  try { inFrame = window.self !== window.top; } catch (e) { inFrame = true; }
  try { (function walk(w) { /* обход window.top.frames */ })(window.top); } catch (e) { /* стенд без родителя */ }
  ```
  - У каждого промиса — обработчик отказа.
  - `window.matchMedia`, `Element.prototype.animate`, `document.hasFocus` — тоже через проверку.
  - Хранилища не трогай вовсе (SB-02).
- **Проверка:** ESLint `no-undef` (CJ-20); на стенде — прогон с отключёнными API внутри iframe (`delete window.IntersectionObserver`,
  `Object.defineProperty(navigator, 'clipboard', {value: undefined})` до кода чарта): чарт работает, ошибок окна 0
  (предложение — ни один стенд так не гоняет).
- **Уверенность:** [бой] (59922); [вывод] — опыт Chromium 141.
- **Образец:** HRBP_HUB:proteus/hrbp-hub.chart.js (`copyText`, `canAnim`, `visBuild`, `placeDrawer`); detail_list:proteus/detail-list.chart.js
  (`bcast`, `b64utf8`).

---

## C. Экран, прокрутка, слои

### SB-05. Считай `innerHeight` и `100vh` высотой ячейки; всё «по экрану» ставь по видимой части из линейки IntersectionObserver
- **Почему:** 07.10, фото владельца (HRBP): окно фильтров, поставленное по центру iframe, уезжало низом — «Применить»
  оказывалась за краем экрана. Ячейка 1 100–1 400 px выше экрана, страница борда прокручивается снаружи, до родителя не
  достучаться (S10). Опыт Chromium 141 (iframe 1 300 px, окно 700): линейка из полос по 24 px видит видимую полосу с
  точностью ±2 px на каждом шаге прокрутки родителя; одна высокая цель молчит — пока ячейка выше окна, её видимая доля
  (0,538) при прокрутке не меняется, и колбэк не приходит. IntersectionObserver без `root` меряет пересечение с окном верхнего
  уровня и из cross-origin iframe.
- **Как:**
  - **Линейка.** В body — `position:fixed` контейнер (`pointer-events:none`, `opacity:0`) с прозрачными полосами по 24 px во
    всю высоту окна iframe; каждая полоса — под `IntersectionObserver` без `root` с порогами 0 / 0,25 / 0,5 / 0,75 / 1.
  - **Итог.** `state.vis {t, b}` — что видно сейчас, `state.vpH` — наибольшая видимая высота; оба переживают перезапуск
    скрипта (прошлые значения действуют до первого колбэка новой линейки).
  - **Липкая шапка.** Если верх ячейки ушёл за край экрана, сверху вычти `CFG.vis.cover`: 64 px — шапка дашборда 2.0.1 без
    вкладок верхнего уровня; с ними липкая часть включает полосу вкладок (на каркасе DL 50–68 px), cover = 64 + её высота.
  - **Пока не измерено.** Видно меньше 120 px — бери всё окно. До первого колбэка — оценка по `screen.availHeight` (минус
    140 px для панелей, минус 260 px для модалки).
  - **Что ставить по `visV()`:** модалку и её подложку, вертикаль тултипа (CJ-11), карточку тура (12-tour.md), высоту панелей
    «не выше экрана». Окно iframe поменяло высоту (`resize`) — линейку заново.
  - `vh` внутри CSS чарта — тоже ячейка: не используй его для «по экрану».
  ```js
  var VIS_STEP = 24, visParts = [];
  function visBuild() {
    if (state.visIO && state.visIO.disconnect) state.visIO.disconnect();
    var old = document.querySelector('body > .' + CFG.ns + '-vis');
    if (old) old.parentNode.removeChild(old);
    if (typeof IntersectionObserver === 'undefined') return;
    var H = window.innerHeight || 0, n = Math.max(1, Math.ceil(H / VIS_STEP)), box = document.createElement('div');
    box.className = CFG.ns + '-vis';
    box.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:' + H + 'px;pointer-events:none;opacity:0;z-index:-1;';
    visParts = [];
    for (var i = 0; i < n; i++) {
      var el = document.createElement('div');
      el.style.cssText = 'position:absolute;left:0;width:1px;top:' + (i * VIS_STEP) + 'px;height:'
        + Math.min(VIS_STEP, H - i * VIS_STEP) + 'px;';
      el.setAttribute('data-vi', String(i));
      box.appendChild(el); visParts.push(null);
    }
    document.body.appendChild(box);
    state.visIO = new IntersectionObserver(visTick, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    for (var k = 0; k < box.children.length; k++) state.visIO.observe(box.children[k]);
  }
  function visTick(entries) {
    for (var i = 0; i < entries.length; i++) {
      var en = entries[i], r = en.intersectionRect;
      visParts[+en.target.getAttribute('data-vi')] = en.isIntersecting && r && r.height > 0 ? { t: r.top, b: r.bottom } : null;
    }
    var t = Infinity, b = -Infinity;
    for (var j = 0; j < visParts.length; j++) if (visParts[j]) { t = Math.min(t, visParts[j].t); b = Math.max(b, visParts[j].b); }
    state.vis = b > t ? { t: Math.round(t), b: Math.round(b) } : { t: 0, b: 0, none: true };
    // пересчитать то, что стоит «по экрану»: модалку, карточку тура, высоту панелей
  }
  function visV() {                                  // видимая полоса окна iframe по вертикали
    var H = window.innerHeight || 0, v = state.vis;
    if (!v || v.none || v.b - v.t < 120) return { t: 0, b: H };
    var t = v.t > 1 ? Math.min(v.t + CFG.vis.cover, v.b - 120) : v.t;   // верх ячейки за краем — минус липкая шапка
    return { t: Math.max(0, t), b: Math.min(H, v.b) };
  }
  ```
- **Проверка:** модель борда на стенде: iframe 1 300 px в окне 1 512 × 860, страница прокручивается снаружи, шапка липкая
  (HRBP `live.py /board?ch=1300`). Прокрутить на 0 / 400 / 800 px: модалка и карточка тура целиком в видимой части,
  «Применить» видна. В бою — фото владельца с прокрученной страницей.
- **Уверенность:** [бой] (инцидент 07.10); [вывод] — опыт Chromium 141 и стенд HRBP; [не проверено в бою] — после правки
  жалоб нет, явного подтверждения нет; cover 64 px — оценка.
- **Образец:** HRBP_HUB:proteus/hrbp-hub.chart.js (`visBuild`, `visTick`, `visV`, `placeDrawer`, `fitSplit`). Нарушение: DL,
  adoption, TeamPulse и шаблон скилла — тур и тултип по `innerHeight`, у TeamPulse высоты на `100vh`.

### SB-06. Растягивай ячейку по экрану CSS борда, а не кодом чарта
- **Почему:** владелец 08.10 (DL): «чарты по экрану». Чарт свою высоту странице не сообщает: из песочницы к странице есть только
  канал скриншотов, а он включает заранее написанное правило, но числа не передаёт. В CSS борда `vh` — настоящий экран
  (там это страница, а не iframe).
- **Как:**
  - Высоту ряда задаёт правило CSS борда `height: max(560px, calc(100vh - 201px))` на самом внутреннем
    `.resizable-container` с ячейкой чарта, кроме режима правки; 201 — число владельца DL (08.10) для раскладки «шапка →
    вкладки → ряд». Готовый селектор, разбор числа и сниппет DevTools — BC-18 и BC-22 (10-board-css.md). Правило работает
    только вместе с растяжкой iframe на всю ячейку (BC-04): атрибут высоты iframe фиксирован при монтаже (S2). Растяжка,
    в свою очередь, — только вместе с SB-03.
  - Чарт высоту не считает и странице не сообщает: корень и overlay — `100%` ячейки, длинное прокручивается внутри панелей
    (UI-09, 11-ui.md), а не в документе iframe (SB-03).
  - Выбери модель вместе с владельцем: HRBP — ячейка выше экрана, прокручивается страница, внутри чарта — линейка (SB-05);
    DL — ряд = экран, длинное прокручивается внутри панелей. Линейку держи в обеих: страницу всё равно прокручивают, а не
    лёг CSS — ячейка снова выше экрана.
- **Проверка:** каркас дашборда Superset 2.0.1 на стенде (DL `live.py ?sk=1`, `click.cjs DL_ONLY=board`): окно 950 → ряд 749 px,
  820 → 619, 700 → 560, под чартами 24; в режиме правки высота не меняется; iframe равен ячейке. В бою — сниппет DevTools
  (файл 12 DL, `kit/board-check.js`) печатает фактическую высоту и число для правила.
- **Уверенность:** [владелец 08.10]; правило у форка действует и число 201 — [бой] (фото DL после 27-й, число владельца
  08.10; BC-18); [исходник 2.0.1] — классы `.resizable-container`, `.dashboard--editing`, `dashboard-chart-id-N`;
  [не проверено в бою] — режим правки у форка и число для других раскладок (на каркасе: 236 с рядом над вкладками, 189 со
  вкладками верхнего уровня).
- **Образец:** detail_list:proteus/detail-list.board.css (блоки 1 и 7) и detail_list:proteus/detail-list.board-check.js.

### SB-07. Не блокируй колесо мыши
- **Почему:** HRBP 06.10 добавил `preventDefault` колеса над подложкой окна фильтров — 07.10 в бою окно нельзя было долистать
  до «Применить»: страницу борда прокручивают колесом над iframe. Блокировку убрали.
- **Как:**
  - Над отчётом и подложкой модалки колесу `preventDefault` не делать.
  - При открытой модалке overlay получает `overflow:hidden`: колесо уходит странице, модалка едет за видимой частью (SB-05);
    у колонок модалки — `overscroll-behavior: contain`.
  - Над шторками тура колесо листает overlay; `preventDefault` — только если прокрутка реально сдвинулась, у края колесо
    отдаётся странице.
- **Проверка:** на модели борда (SB-05) при открытой модалке колесо над подложкой прокручивает страницу; над колонкой модалки —
  колонку.
- **Уверенность:** [бой] (06.10 → 07.10).
- **Образец:** HRBP_HUB:proteus/hrbp-hub.chart.js (модалка «Фильтры и настройки»: `placeDrawer`, `state.onAnyScroll`).

### SB-08. Ставь fixed-элемент через замер: под предком с `transform` он отсчитывается от предка
- **Почему:** у предка с `transform` (а также `filter`, `perspective`) элемент `position:fixed` отсчитывается от этого
  предка, а не от окна — так устроен CSS. Чарт не знает, что на него наложит Proteus или CSS борда, а модалка, поставленная
  «по окну», под таким предком съезжает. HRBP 06.10 заложил поправку в панель фильтров сразу при разработке.
- **Как:** поставить элемент в `left/top = 0`, замерить `getBoundingClientRect()`, сдвинуть на разницу с нужной точкой.
  ```js
  d.style.top = '0px'; d.style.left = '0px';
  var o = d.getBoundingClientRect();                       // где оказался «ноль»
  d.style.left = Math.round(left - o.left) + 'px';
  d.style.top = Math.round(top - o.top) + 'px';
  ```
- **Проверка:** на стенде задать `transform: translateZ(0)` предку overlay — модалка стоит там же, где без него.
- **Уверенность:** [вывод] — поведение CSS и стенд HRBP; в бою съезда не наблюдали.
- **Образец:** HRBP_HUB:proteus/hrbp-hub.chart.js (`placeDrawer`).

### SB-09. Держи тултип, тур и линейку слоями в body: создавай один раз и удаляй старые
- **Почему:** RETRO 7, 19, 26, 44 скилла: слой внутри пересобираемого overlay гибнет на каждом `render()` или режется его
  `overflow`. При перезапуске скрипта в том же окне старые слои в body остаются — без удаления копятся дубли.
- **Как:**
  - Тултип, слой тура (четыре шторки вокруг цели, пятая — поверх цели, если шаг «только смотреть», рамка, карточка), линейка
    видимости, выпадашка панели — в body, вне overlay.
  - На каждом запуске найди `body > .<ns>-…` и удали старый слой, затем создай новый.
  - У каждого слоя свой `font-family` (body его не наследует от корня чарта) и место в шкале z-index: модалка 60/61, тур
    99990–99993, тултип 99999.
- **Проверка:** на стенде три перезапуска: в body ровно один узел каждого слоя.
- **Уверенность:** [бой] (RETRO 7, 19, 44).
- **Образец:** HRBP_HUB:proteus/hrbp-hub.chart.js (`getTip`, `visBuild`, слой тура); detail_list:proteus/detail-list-filters.chart.js
  (`getDd` — выпадашка в body).

---

## D. Буфер обмена

### SB-10. Копируй через `execCommand('copy')` из скрытой textarea в жесте клика; Clipboard API — только запасной путь
- **Почему:** у iframe песочницы нет `clipboard-write` (S12). Опыт Chromium 141 в iframe `sandbox="allow-scripts"` (и по `src`,
  и по `srcdoc`): `textarea` + `select()` + `execCommand('copy')` в обработчике клика — `true`, текст в буфере;
  `navigator.clipboard.writeText` — отказ NotAllowedError и в консоли «Permissions policy violation: The Clipboard API has been
  blocked…» на каждом вызове, даже если отказ обработан. Запасной путь из обработчика отказа (через миллисекунды) в Chromium
  тоже копирует. DL и adoption зовут Clipboard API первым и падают на запасной путь — работает, но шумит в консоли и
  асинхронен. В бою ни один порядок не проверен.
- **Как:**
  ```js
  function copyText(text, done) {
    var ta = document.createElement('textarea'), ok = false;
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
    overlay.appendChild(ta);
    try { ta.select(); ok = document.execCommand('copy'); } catch (e) { ok = false; }
    overlay.removeChild(ta);
    if (ok) { done(true); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    } else done(false);
  }
  ```
  - Таблицы копируй в TSV — вставляется в Excel ячейками.
  - Рядом с кнопкой — подпись «Скопировано: N строк», сама гаснет через 2,6 с. Подпись ставь по результату, а не до него (у HRBP
    после вызова API `ok = true` ставится до ответа промиса — подпись может соврать).
  - Ошибку консоли «Clipboard API has been blocked» стенд за ошибку чарта не считает (фильтр).
- **Проверка:** на стенде клик «Копировать» → содержимое буфера (playwright с правом чтения буфера) равно ожидаемому TSV;
  ошибок консоли нет. В бою — владелец вставляет в Excel и присылает скриншот.
- **Уверенность:** [вывод] — опыт Chromium 141 и стенды HRBP, DL; [не проверено в бою].
- **Образец:** HRBP_HUB:proteus/hrbp-hub.chart.js (`copyText`, `copyNote` — execCommand первым); detail_list:proteus/detail-list.chart.js
  (`clip` — обратный порядок).

---

## E. Выход за ячейку

### SB-11. Выходи за ячейку только каналом скриншотов: PNG 1×1 с маркером, разворот делает CSS борда
- **Почему:** других каналов к родителю нет (S4, S11): выпадашка, поповер или подсказка, шире ячейки, режутся iframe. Приём —
  костыль владельца из заявки платформе 14.09 (прецедент — фильтр борда 59922): в бою работает на строке ЦА и шапке adoption
  (25.09, 30.09) и у панели фильтров DL (30.09: «тултипы дёргаются» — iframe разворачивался; 06.10: «микроскачок… прыгает
  вправо»). Опыт Chromium 141: PNG 1×1 (68 байт) + выравнивание `\0` + маркер грузится как картинка 1×1, маркер виден в
  `src`, правило `:has(img[src*="МАРКЕР"])` срабатывает; без выравнивания картинка тоже грузится, но маркера в base64 нет, и
  CSS не срабатывает.
- **Как:**
  1. **Маркер** — 12 байт ASCII = ровно 16 символов base64: `btoa('DL-FLT-DD-ON')` = `REwtRkxULURELU9O`. Байты PNG дополняй
     `\0` до кратности 3 — тогда маркер стоит в строке base64 как есть.
  2. **Чарт** шлёт сигнал:
     ```js
     function pngUrl(mark) {                       // CFG.overlay.png — base64 PNG 1×1
       var b = CFG.overlay.png;
       if (mark) { var raw = atob(b); while (raw.length % 3) raw += '\0'; b = btoa(raw + atob(mark)); }
       return 'data:image/png;base64,' + b;
     }
     function signal(mark) {                      // mark — base64-маркер или '' (чистый PNG)
       var url = pngUrl(mark);
       state.sig = mark || '';                      // последний отправленный маркер: его повторяют после перезапуска (SB-14)
       try {
         if (window.parent && window.parent !== window)
           window.parent.postMessage({ type: 'ECHARTS_UPDATE_DATA_URL', dataUrl: url, payload: { dataUrl: url } }, '*');
       } catch (e) { /* стенд без родителя: выпадашка остаётся в ячейке */ }
     }
     ```
  3. **Родитель** (форк) кладёт dataUrl в `img.echarts-plugin` рядом с iframe.
  4. **CSS борда** по `.dashboard-chart-id-N:has(img.echarts-plugin[src*="МАРКЕР"])` разворачивает iframe прозрачным слоем:
     `overflow: visible` у `.slice_container`, `.chart-container`, `.dashboard-chart`; якорь `#chart-id-N { position:
     relative }`; iframe — `position: absolute`, размер разворота, `z-index: 998` (выше сетки, ниже системных модалок), фон
     прозрачный. Якорь — `#chart-id-N` (обёртка iframe), а не ячейка с заголовком: иначе панель прыгает на высоту заголовка
     (урок 59922). `#chart-id-N` нужен и в селекторе слоя — иначе база растяжки iframe его перебьёт. Готовые правила — BC-08,
     вес селекторов — BC-09 (10-board-css.md).
  5. **Закрыли** — чистый PNG без маркера (`signal('')`).
  6. Выпадашка — слой в body iframe, `position:fixed` (SB-09).
- **Проверка:** стенд с родителем как в Proteus (канал → `img.echarts-plugin`, CSS из папки поставки): открыть выпадашку —
  iframe развёрнут, закрыть — вернулся; покадровая запись (SB-13). В бою — консоль страницы:
  `document.querySelector('.dashboard-chart-id-N img.echarts-plugin').src.includes('МАРКЕР')` при открытой выпадашке.
- **Уверенность:** [бой] (adoption 25.09, 30.09; DL 30.09, 06.10 — видео владельца) + [вывод] опыт Chromium 141 и модель kit
  (маркер DL разворачивает iframe 330 → 1 352 px, чистый PNG — обратно). Разворот DL после правок 06.10 — [не проверено в
  бою].
- **Образец:** detail_list:proteus/detail-list-filters.chart.js (`pngUrl`, `signal`, `CFG.overlay`); adoption:Виджеты/pa-head.chart.js
  (`pngUrl`, `signal`, шапка файла — описание костыля); detail_list:proteus/detail-list.board.css (блоки 2–3).

### SB-12. Давай каждому назначению разворота свой маркер; подсказке — малый разворот с немедленным возвратом
- **Почему:** DL 30.09, владелец: «тултипы дёргаются». Подсказка разворачивала iframe тем же маркером, что и выпадашка, — на всю
  ширину, и борд перестраивался прямо под курсором.
- **Как:**
  - Свой маркер на каждое назначение: DL — выпадашка `REwtRkxULURELU9O` («DL-FLT-DD-ON», вправо на `calc(100vw - 48px)`),
    подсказка `REwtRkxULVRJUC0x` («DL-FLT-TIP-1», `calc(100% + 360px)`); adoption — выпадашка вниз `min(640px, 85vh)`, подсказка
    260 px, тур — свой маркер без разворота.
  - Подсказка не перестраивает борд: малый разворот, ширина карточки чарта закреплена (SB-13).
  - Курсор ушёл с карточки на прозрачную развёрнутую часть — разворот под подсказку снять сразу (`document` `mousemove` вне
    overlay → чистый PNG).
  - Маркер уникален на борде: у двух отчётов на одном борде — разные префиксы (`DL-`, `PA-`). CSS-сторона и размеры
    разворотов — BC-10 (10-board-css.md).
- **Проверка:** на стенде навести на поле с подсказкой у правого края — iframe шире на 360 px, соседний чарт не сдвинулся;
  увести курсор — iframe вернулся в том же кадре.
- **Уверенность:** [бой] (30.09); [вывод] — стенд DL, малый разворот в бою отдельно не подтверждён.
- **Образец:** detail_list:proteus/detail-list-filters.chart.js (`CFG.overlay.mark`, `tipMark`, `state.onDocMove`);
  adoption:Виджеты/pa-head.chart.js (`mark`, `tipMark`, `tourMark`).

### SB-13. Показывай выпадашку, только когда iframe развернулся, а закреп отпускай по факту `resize`
- **Почему:**
  - DL 06.10, видео владельца: «микроскачок» — выпадашка мелькала узкой под полем и кадр-другой спустя прыгала вправо: её
    ставили в окно прежней ширины, а родитель разворачивает iframe не сразу (окно 340 → 1 452 px через кадр-другой).
  - adoption 25.09: строка ЦА дёргалась при закрытии (стенд с задержкой родителя 150 мс: y 16 → 304 → 16) — высоту отпускали
    сразу после сигнала «закрыть», а родитель сжимал iframe позже.
  - Развёрнутый iframe с белым фоном закрывает соседей белым.
  - adoption 30.09: выпадашки резались снизу на 22 px — высота считалась в content-box.
- **Как:**
  - Фон `html`, `body`, хоста и overlay — `transparent`: как минимум пока iframe развёрнут, а лучше всегда, с монтажа (DL с
    30-й поставки) — тогда за скруглёнными углами карточки видна страница, а не белый угол документа (BC-11, UI-08).
  - Карточка чарта закреплена в базовом размере: перед сигналом запомни `state.baseW` (или `baseH`) и поставь
    `overlay.style.width = baseW + 'px'` (`state.pin`).
  - Закреп отпускай только по факту: в `resize` окно вернулось (`innerWidth <= baseW + 4`).
  - Выпадашка невидима (`opacity: 0`, `pointer-events: none`), пока окно не развернулось полностью (`innerWidth > baseW + tipW +
    4`), но не дольше `waitMs` 600 мс (CSS не поставлен или окно узкое — показать, где есть место). Ждать — только если сигнал
    ушёл родителю (`window.parent !== window`). Фокус в поиск выпадашки ставь сразу.
  - Размер всплывающего окна — `box-sizing: border-box`, от границ окна.
  ```js
  // в mount(): документ, тело и хост прозрачные всегда (DL с 30-й поставки; раньше — только в signal() при развороте)
  document.documentElement.style.background = 'transparent'; document.body.style.background = 'transparent';
  host.style.background = 'transparent';
  // в signal(): при развороте — закреп
  if (mark && !state.pin) state.baseW = overlay.clientWidth || state.baseW;
  if (mark || (state.baseW && window.innerWidth > state.baseW + 4)) { overlay.style.width = state.baseW + 'px'; state.pin = true; }
  // в resize: отпустить по факту
  if (state.pin && !state.open && window.innerWidth <= state.baseW + 4) { overlay.style.width = '100%'; state.pin = false; }
  // в placeDd(): ждать разворота
  var full = window.innerWidth > state.baseW + CFG.overlay.tipW + 4;
  var wait = state.ddAt > 0 && !full && Date.now() - state.ddAt < CFG.overlay.waitMs;
  dd.style.opacity = wait ? '0' : ''; dd.style.pointerEvents = wait ? 'none' : '';
  ```
- **Проверка:** покадровая запись на стенде с задержкой родителя: около 900 мс через `requestAnimationFrame` внутри iframe
  пишутся положение и ширина выпадашки в каждом видимом кадре — все видимые кадры совпадают с итогом.
- **Уверенность:** [бой] (видео 06.10; adoption 25.09, 30.09); [вывод] — стенды DL и adoption.
- **Образец:** detail_list:proteus/detail-list-filters.chart.js (`signal`, `unpinIfShrunk`, `placeDd`); adoption:Виджеты/pa-head.chart.js
  (`signal`, `unpinIfShrunk` — то же по высоте).

### SB-14. Повторяй сигнал маркера после перезапуска скрипта: 0, 400 и 1 500 мс
- **Почему:** скрипт перезапускается на каждый ответ (S9) — в том числе при открытой выпадашке. Собственный скриншот
  платформы пишет в тот же `img.echarts-plugin` и, возможно, затирает маркер. Затирания в бою не видели: у DL с повтором 0 и
  400 мс разворот работает. Повтор дёшев — это страховка, а не факт.
- **Как:**
  - Перезапуск при открытой выпадашке: сигнал сразу, через 400 и через 1 500 мс, затем пересчёт места выпадашки и фокус в её
    поиск.
  - Перезапуск без выпадашки, а прошлый сигнал был с маркером — чистый PNG.
  - Тур, который держит маркер для CSS борда, повторяет его каждые 1,5 с до конца тура (12-tour.md).
  - Если `signal()` гасит повтор того же маркера (`if (mk === state.sig) return`, как у DL), перед повтором сбрасывай
    `state.sig = ''` — иначе повтор молча ничего не отправит.
  ```js
  // после render() в конце mount(); signal(mark) — из SB-11, mark — base64-маркер выпадашки
  if (state.dd) {
    var mk = CFG.overlay.mark;
    state.sig = ''; signal(mk);
    setTimeout(function () { if (state.dd) { state.sig = ''; signal(mk); placeDd(); } }, 400);
    setTimeout(function () { if (state.dd) { state.sig = ''; signal(mk); placeDd(); } }, 1500);
  } else if (state.sig) signal('');
  ```
- **Проверка:** стенд: родитель подменяет `img.echarts-plugin` чистым PNG через 200 мс после перезапуска — через 400 мс маркер
  на месте. В бою — проверка `src` в консоли при открытой выпадашке после ответа (стоп-точка adoption ещё без ответа).
- **Уверенность:** [вывод] [не проверено в бою] — затирание маркера гипотетично.
- **Образец:** adoption:Виджеты/pa-head.chart.js (конец `mount`: 0 / 400 / 1 500 мс; `tourSig` раз в 1,5 с). DL повторяет только
  0 и 400 мс — дотянуть до 1 500.

### SB-15. Закрывай выпадашку кликом мимо, потерей фокуса окна и Esc
- **Почему:** развёрнутый прозрачный iframe перекрывает соседний чарт: клик «мимо» попадает в свой же iframe, а не в соседа.
  Клик вне iframe до чарта не доходит вовсе.
- **Как:**
  - Клик по прозрачной части своего окна закрывает выпадашку. Клик внутри выпадашки или панели помечай флагом события
    (`e.__dd = true`) на самом overlay или слое: пересборка отрывает цель от DOM, и проверка «цель внутри?» по предкам ошибается.
  - Клик вне iframe: `blur` окна → через 150 мс `!document.hasFocus()` → закрыть.
  - Esc — на `document` в фазе перехвата.
  - Клик мимо не должен пройти в соседний чарт: он и не пройдёт — слой прозрачный, но это всё ещё iframe чарта.
  ```js
  overlay.addEventListener('click', function (e) { e.__dd = true; onClick(e); });
  state.onDocClick = function (ev) {
    if (!state.open || ev.__dd || !overlay.parentNode) return;
    for (var n = ev.target; n && n !== document.body; n = n.parentNode) if (n === ddEl || n === overlay) return;
    openDd('');                                            // закрыть
  };
  state.onBlur = function () { setTimeout(function () { if (state.open && !document.hasFocus()) openDd(''); }, 150); };
  ```
- **Проверка:** на стенде: клик по прозрачной части, клик в соседний iframe, Esc — каждый раз выпадашка закрыта, iframe
  вернулся (SB-13).
- **Уверенность:** [вывод] — стенды DL и adoption.
- **Образец:** detail_list:proteus/detail-list-filters.chart.js (`state.onDocClick`, `state.onBlur`, `state.onDocKey`);
  adoption:Виджеты/pa-head.chart.js (`e.__pacaDd`).

### SB-16. В тонком чарте не открывай поповер вниз
- **Почему:** adoption 23.09: поповер «Опции» в шапке высотой ≈100 px нельзя было открыть — его резала ячейка.
- **Как:** в чарте-строке (шапка, строка фильтров 64–100 px) — переключатели прямо в строке, без поповеров; если выбор длинный —
  выпадашка разворотом iframe по маркеру (SB-11). В панели обычной высоты — поповер `position:fixed` от кнопки вниз или вверх,
  по месту.
- **Проверка:** на стенде ячейка 100 px — каждый контрол открывается целиком.
- **Уверенность:** [бой] (23.09).
- **Образец:** adoption:Виджеты/pa-head.chart.js (выпадашки ЦА разворотом вниз).

---

## F. Ссылки и пресеты

### SB-17. Не пиши адресов в коде: адрес борда бери из `document.referrer`, запасной — из meta датасета
- **Почему:** правило D1c скилла — адресов в коде чарта нет: тестовый и боевой борды разные, а код один. Родителя песочница не
  читает (S4), `location` у iframe — свой документ (у `srcdoc` — `about:srcdoc`). Опыт Chromium 141 (S13): `document.referrer`
  даёт путь борда только iframe, загруженному по `src` с того же хоста; у `srcdoc` — только origin, путь виден, лишь если
  родитель задал `<meta name="referrer" content="unsafe-url">`. Как грузит iframe форк — неизвестно.
- **Как:**
  ```js
  function boardUrl() {
    var r = '';
    try { r = String(document.referrer || ''); } catch (e) { r = ''; }
    var m = /^(https?:\/\/[^\/?#]+\/superset\/dashboard\/[^\/?#]+)/.exec(r);
    if (m) return m[1] + '/';                                   // query из referrer отбрасываем
    var b = String((MODEL.m && MODEL.m.board) || '');           // запасной — адрес из датасета
    return b ? b.replace(/\/?$/, '/') : '';
  }
  ```
  - Запасной адрес в meta обязателен. Подставляет его сборщик поставки в датасет (таблица id бордов), а не владелец руками.
  - В датасете собирай адрес без `//` в литерале или отдавай только путь `/superset/dashboard/<id>/` — `//` для sqlparse 0.3.0
    (Superset 2.0.x; на случай, если бой окажется на нём, OQ-02) при сбое лексера становится комментарием (SP-10, 02-superset-path.md).
  - Нет ни referrer, ни meta — кнопка ссылки пишет причину («Адрес борда неизвестен: поставьте датасет этой поставки»).
  - Помни: на копии борда запасной адрес ведёт на боевой борд — скажи об этом в инструкции.
- **Проверка:** стенд, iframe по `src` и по `srcdoc` (`kit/sbx/run.cjs --frame src|srcdoc --board N`): в первом случае ссылка
  — на путь борда стенда, во втором — на адрес из meta. В бою — консоль iframe чарта (выбрать фрейм в DevTools):
  `document.referrer`.
- **Уверенность:** [вывод] — опыт Chromium 141; [не проверено в бою] — referrer в iframe форка.
- **Образец:** detail_list:proteus/detail-list.chart.js (`boardUrl`); adoption:Виджеты/pa-reports-body.chart.js (referrer для
  ссылки на отчёт и запасной адрес в `CFG`).

### SB-18. Отдавай вид ссылкой с параметром адреса и якорем вкладки, не длиннее 4 000 знаков
- **Почему:** владелец 08.10 (DL): «переслать борд с фильтрами и колонками, сохранить себе пресет». Хранилища у песочницы нет
  (SB-02), значит, вид живёт в адресе. Superset 2.0.1 кладёт параметры адреса дашборда (кроме `standalone` и `edit`) в
  `form_data.url_params` каждого чарта, `buildQueryObject` — в `queries[0].url_params`; датасет читает их `url_param()` (SP-23,
  02-superset-path.md). Предел длины: nginx по умолчанию — строка запроса ≤ 8 КБ, gunicorn по умолчанию — ≤ 4 094 байт
  (официальный скрипт запуска Superset снимает предел, что у Proteus — неизвестно; F24, 01-platform.md). DL держит 6 000
  знаков — не доказано.
- **Как:**
  - **Адрес:** `boardUrl() + '?dl_f=' + код + '#TAB-…'` — параметр с суффиксом вкладки (MC-05, 09-multi-chart.md) и якорь
    вкладки (id вкладки — из JSON-метаданных борда в `CFG`).
  - **Код:** пункты `ключ:значение` через символ 30 (RS): фильтры — как носители панели, сортировка и лимит — как носители
    списка, `v` — JSON вида таблицы (колонки, если не пресет; ширины; сортировка; группировка; сводная).
  - **Кодирование:** цифры, латиница и кириллица — как есть, остальное — процентами; `+` — только `%2B` (строка запроса читает
    `+` как пробел). Предел считай по полностью закодированному адресу — так он идёт по сети.
    ```js
    function linkEnc(s) {
      var out = '', i = 0;
      while (i < s.length) {
        var c = s.charCodeAt(i), n = (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) ? 2 : 1, ch = s.substr(i, n);
        if (/^[0-9A-Za-zЀ-ӿ\-._~:=]$/.test(ch)) out += ch;   // цифры, латиница, кириллица — как есть
        else { try { out += encodeURIComponent(ch); } catch (e) { out += '%EF%BF%BD'; } }
        i += n;
      }
      return out;
    }
    ```
  - **Предел:** ≤ 4 000 знаков, пока в бою не открыта ссылка 5–6 тыс. знаков. Не влезла — без списка сотрудников (с пометкой),
    затем без ширин колонок; не влезла и так — ссылки нет, и чарт говорит почему.
  - **Применение:** датасет берёт фильтры ссылки, пока панель ничего не применяла (нет её метки), а сортировку и лимит — пока
    не было своего запроса списка; значения проходят те же пределы, что носители (AC-14). Вид таблицы чарт применяет из
    `meta.link` один раз на код (`state.linkDone`), дальше не перетирает настройки пользователя. Эхо «что взято» — плашка
    «По ссылке».
  - Имя параметра — не `form_data`, `dashboard_id`, `force`, `standalone`, `edit` (SP-23).
- **Проверка:** стенд: `live.py` передаёт прочие параметры адреса в `url_params` каждого чарта; прогон «ссылка на вид» —
  открыть по ссылке и сравнить фильтры, лимит, колонки, ширины, группировку и сводную; 400 логинов — ссылка без списка; испорченная
  ссылка — умолчания. В бою: F12 → `chart/data` → Payload → `queries[0].url_params` (передаёт ли их `react_sanbbox`, не
  проверено); открывает ли 2.0 вкладку по якорю `#TAB-…`.
- **Уверенность:** [владелец 08.10]; [исходник 2.0.1] — путь `url_params`; [не проверено в бою] — `url_params` у кастомного
  чарта, предел длины, якорь вкладки.
- **Образец:** detail_list:proteus/detail-list.chart.js (`linkCode`, `linkEnc`, `linkUrl`, `makeLink`, `applyLinkView`);
  detail_list:proteus/detail-list.data.sql (блок «Ссылка на вид»). Предел `CFG.board.maxLen` 6 000 — снизить до 4 000 или
  проверить в бою.

### SB-19. Короткую ссылку и пресет оставь штатным средствам: permalink у вкладки и закладка браузера
- **Почему:** чарт сам короткую ссылку не получит: API с cookies и навигации родителя у песочницы нет (S4, S6). Permalink 2.0.1
  хранит параметры адреса (`urlParams` — все, кроме служебных) и якорь, а при открытии делает redirect на полный адрес с теми же
  параметрами — от предела длины он не спасает (SB-18). Значок ссылки у названия вкладки (`AnchorLink` в режиме просмотра)
  делает permalink с якорем этой вкладки; в форке он есть (борд 61354, 08.10: даёт `…/superset/dashboard/p/…`).
- **Как:**
  - Кнопка «Ссылка» в чарте копирует полный адрес вида (SB-18, SB-10).
  - Поповер кнопки и шаг тура объясняют: для короткой ссылки — открыть полученный адрес и нажать значок ссылки у названия
    вкладки.
  - Пресет «для себя» — закладка браузера на этот адрес. Списка пресетов в чарте нет (хранилища нет, SB-02).
- **Проверка:** в бою — открыть ссылку на вид, нажать значок у вкладки, открыть короткую ссылку в новом окне: тот же вид.
- **Уверенность:** [исходник 2.0.1] (`urlUtils.ts`, `views/core.py`); [бой] — значок у вкладки есть (08.10); [не проверено в
  бою] — что permalink форка сохраняет параметр вида.
- **Образец:** detail_list:proteus/detail-list.chart.js (поповер кнопки «Ссылка», шаг тура про короткую ссылку).

---

## G. Стенд

### SB-20. Проверяй чарт в модели песочницы, а не на голой странице
- **Почему:** ни один инцидент 06–07.10 (пропадание чартов от ошибки окна, окно фильтров за краем экрана, колесо, белая
  рамка, ложная плашка ожидания) не воспроизводился на голой странице. Хост smoke скилла — div 420 px без iframe, без
  `onerror`, без областей и канала. На стенде DL с `?sbx=1` пропадание из видео коллег воспроизвелось на коде до правки.
  adoption 18–19.09: стенд вписал платформе несуществующий `.chart-slice{display:flex}`, «проходил», а живой борд — нет: три
  раунда CSS впустую.
- **Как:** стенд отдаёт каждый чарт в `<iframe sandbox="allow-scripts">` (srcdoc, прозрачный фон) и повторяет родителя:
  - код запускается в ТОМ ЖЕ окне на каждый новый ответ, как в Proteus;
  - режим песочницы `?sbx=1`: px-div echarts с подгонкой по ResizeObserver и `window.onerror`, гасящий чарт на любую ошибку;
  - полосы прокрутки как в Windows (`ignoreDefaultArgs: ['--hide-scrollbars']`), окно уже на 17 px и обратно;
  - ячейка выше экрана, страница прокручивается снаружи, липкая шапка, холдер с полем 16 px;
  - канал `ECHARTS_UPDATE_DATA_URL` кладёт dataUrl в `img.echarts-plugin`; CSS борда — ровно файл из папки поставки;
  - задержка родителя и ответа (`?delay=мс`) и покадровая запись для миганий (SB-13);
  - `applyCrossFilter` превращает маски в фильтры по областям из JSON поставки; параметры адреса — в `url_params` (SB-18).

  Геометрию борда (швы, поля, классы) не придумывай: только каркас из исходников сборки 2.0.1 или реплика сохранённой живой
  страницы, а истина — сниппет DevTools в бою (10-board-css.md, 13-stand.md).

  Готовая модель для любого чарта — `kit/sbx/run.cjs`: борд 2.0.1 → ячейка → iframe `sandbox="allow-scripts"`, заглушка
  хоста echarts с подгонкой по RO, перезапуск тем же ответом после эмита, печать ошибок окна, эмитов и сигналов канала.
  Чего не знаем о форке, гоняй в обоих вариантах: `--exec fn|script` (как запускается код), `--frame srcdoc|src` (referrer),
  `--iframe-attrs mount|follow` (пересчитываются ли атрибуты iframe), `--no-scrollbars` (Mac против Windows). Соседний
  чарт — `--also`, сценарий кликов — `--clicks`, сниппет разметки — `--board-check`.
- **Проверка:** весь живой прогон чарта — в режиме песочницы; ошибка консоли — провал шага (кроме блокировки Clipboard API);
  `run.cjs` выходит с кодом 1, если были ошибки окна.
- **Уверенность:** [бой] — инциденты воспроизведены и после правок в бою не повторялись; модель kit — [вывод] (механизм
  песочницы форка не виден, S8).
- **Образец:** detail_list:stand/live.py (`?sbx=1`, `?first=`, `?sk=1`, канал, области) и detail_list:stand/click.cjs (полосы
  Windows, покадровая запись); HRBP_HUB:stand/live.py (`/board`: высокая ячейка, липкая шапка, `?css`, `?delay`);
  kit/sbx/run.cjs и прогоны четырёх проектов — kit/RESULTS.js.md, раздел 5.

---

## Симптом → правило

| Что видно | Вероятная причина | Правило |
|---|---|---|
| Чарт отрисовался и через долю секунды пропал (Windows) | «ResizeObserver loop» от полосы прокрутки документа iframe | SB-03 |
| Чарт пропал после закрытия выпадашки или после растяжки iframe CSS борда | iframe меняет размер, документ iframe прокручивается | SB-03 |
| «Точно сбросить?» не спрашивает, сообщение не показалось | `confirm` / `alert` в песочнице без `allow-modals` | SB-01 |
| Чарт пропал после действия, на стенде без песочницы — нет | исключение (нет API, ReferenceError) → `onerror` песочницы | SB-04, CJ-08 |
| SecurityError в консоли iframe | обращение к хранилищу, cookies или родителю | SB-01, SB-02 |
| Окно фильтров или карточка тура уезжает за край экрана | расчёт по `innerHeight` или `vh` (это ячейка) | SB-05 |
| Ряд чартов не по экрану | высоту пытаются задать из чарта | SB-06 |
| Окно фильтров не долистать до «Применить» | колесо заблокировано | SB-07 |
| Модалка съехала в сторону | `position:fixed` под предком с `transform` | SB-08 |
| Дубли тултипа или слоя тура после ответа | слой в body не удалён при перезапуске | SB-09 |
| «Скопировано», а буфер пуст; ошибка Clipboard API в консоли | Clipboard API первым, подпись до результата | SB-10 |
| Выпадашка обрезана ячейкой | нет канала скриншотов или CSS разворота | SB-11 |
| «Тултипы дёргаются», борд перестраивается под курсором | подсказка разворачивает iframe маркером выпадашки | SB-12 |
| Выпадашка мелькает узкой и прыгает вправо | показ до разворота iframe | SB-13 |
| Строка дёргается при закрытии | закреп отпущен до сжатия iframe родителем | SB-13 |
| Развёрнутый iframe закрывает соседей белым | фон документа не прозрачный | SB-13 |
| После ответа выпадашка открыта, а iframe свернулся | маркер затёрт, сигнал не повторён | SB-14 |
| Клик мимо выпадашки ничего не закрывает | нет обработки прозрачной части, `blur`, Esc | SB-15 |
| Поповер в шапке не открыть | поповер вниз в тонком чарте | SB-16 |
| «Ссылка» ведёт на чужой борд или пустая | адрес в коде; referrer пуст, нет meta | SB-17 |
| Ссылка на вид не открывается | длина больше предела прокси или сервера | SB-18 |

## Связанные главы

- 01-platform.md — факты: песочница (F23), код в каждом запросе (F11), длина адреса (F24).
- 02-superset-path.md — `url_param` и ключ кэша (SP-23), `//` и `;` в литералах (SP-10).
- 03-access-cache.md — пределы и белые списки для значений из адреса (AC-14).
- 07-chart.md — каркас монтажа, `render` и `relayout`, тултип в body, ESLint.
- 09-multi-chart.md — канал `postMessage` между чартами, носители с суффиксом, сверка по эху.
- 10-board-css.md — CSS вокруг iframe: флекс-цепочка, разворот по маркеру, высота ряда, вес селекторов, сниппет DevTools.
- 11-ui.md — тултип за курсором, шрифты (Inter страницы в iframe не виден), всплывающие окна.
- 12-tour.md — карточка тура по видимой части, маркер тура, слой тура в body.
- 13-stand.md — модель борда и песочницы на стенде, покадровая запись; kit/sbx/run.cjs и kit/RESULTS.js.md — модель
  песочницы и её прогоны на чартах четырёх проектов.
- 17-open-questions.md — чем песочница ловит ошибки, referrer, `url_params`, предел длины, затирание маркера.
