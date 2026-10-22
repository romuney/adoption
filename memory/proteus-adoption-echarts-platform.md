---
name: proteus-adoption-echarts-platform
description: "API кастомных виджетов Proteus (react_sanbbox): applyCrossFilter → filter_values в SQL — подтверждено прецедентом 59922; грабли эмиттов"
metadata: 
  node_type: memory
  type: project
  originSessionId: 3e9bfab5-64af-4a8d-b317-6d8af46cd624
  modified: 2026-09-18T16:11:18.450Z
---

# Кастомные виджеты Proteus и кросс-фильтры — вердикт 2026-09-17

## Главный вердикт (пункт 1 дорожной карты — ЗАКРЫТ)
applyCrossFilter из JS кастомного виджета ДОЕЗЖАЕТ до jinja filter_values() в SQL
виртуального датасета. Архитектура «полка-ECharts эмитит параметры → jinja-куб
переключает ветки» подтверждена живым продовым прецедентом, а не теорией.

## Прецедент — борд 59922 «Тест фильтра» (proteus.tcsbank.ru/superset/dashboard/59922/drafts/1/)
Ссылку дал владелец. Состав:
- чарт 783469 «Иерархический фильтр» (viz_type **react_sanbbox**, датасет 168063 hier_unit_dict,
  59КБ JS) — эмиттер: дерево УС с чекбоксами, кнопка-триггер + попап поверх iframe-sandbox
  (CSS-хак с маркером в PNG dataUrl, см. css борда).
- чарт 783708 «График для проверки фильтрации» (react_sanbbox, датасет 168383
  hq_active_daily_group_v2, 53КБ JS) — приёмник И одновременно эмиттер самовлияния.

## Подтверждённая цепочка
JS виджета:
```
applyCrossFilter([{ column: 'grp', operator: 'IN', value: ['col_a','col_b'] }]);
```
SQL виртуального датасета 168383:
```
{% set dims = filter_values('grp') or [] %}
SELECT toStartOfMonth(business_dt) AS business_dt,
  {% if dims|length >= 1 %}{{ dims[0] }}{% else %}'Весь банк'{% endif %} AS grp1, ...
```
Причём прецедент подставляет джиней даже ИМЕНА КОЛОННОК ({{ dims[0] }}) — сильнее нашего
случая (мы подставляем значения в ветвление WHERE).

## Ключевой паттерн «колонка не выводится в SELECT»
Кросс-эмит по колонке, ЕСТЬ ли она в SELECT датасета: Superset применит авто-IN к внешнему
запросу (для ARRAY-колонок CH это несовместимо). Поэтому колонку-носитель НЕ выводят в SELECT —
«IN из applyCrossFilter не к чему применить в финальном SQL», фильтрацию делает подзапрос датасета
через hasAny(col, {{ filter_values('col') }}).
У pa_cube_v1 колонок period_param/mode_param в результате НЕТ → дизайн уже правильный,
джиня — единственный путь, авто-IN не случится.

## КОНФИГ СКОУПА — вот что решает, работает клик или нет (2026-09-18, замер конфигов)
`get_dashboard_by_id_or_slug` → json_metadata. Сравнение двух бордов объясняет ВСЁ:
- **59922 (работает)**: `chart_configuration: {783469: {crossFilters: {scope: {rootPath:[ROOT_ID],
  excluded:[783469]}, chartsInScope:[783708]}}, 783708: {crossFilters: {scope: {excluded:[783469]},
  chartsInScope:[783708]}}}` — у 783708 в excluded ЕГО САМОГО НЕТ, поэтому он получает свой же
  фильтр (самовлияние). Ключ `cross_filters_enabled` отсутствует = включено по умолчанию.
- **60260 (наш драфт, клик молчал)**: `cross_filters_enabled: FALSE` и
  `788805: {crossFilters: {scope: {excluded:[788805]}, chartsInScope: []}}`.
  ⇒ кросс-фильтры на борде ВЫКЛЮЧЕНЫ, а чарт вдобавок исключён из своего же фильтра.
  Любой applyCrossFilter из виджета уходил в пустоту. Это и была причина жалобы владельца
  «при клике ничего не меняется» — не JS и не джиня.
⇒ Самовлияние НЕ «дефолт платформы», а настройка: убрать себя из `excluded`.
Схема «чарт A эмитит → чарт B перезапрашивается» (excluded:[A], chartsInScope:[B]) —
штатная и на 59922 тоже используется. v4 строилась на ней: тело эмитит, когорты слушают.
**2026-09-18, раунд 3: владелец ОТКЛЮЧИЛ самовлияние тела в UI («тело не должно
влиять само на себя, только на закрепляемость») — это не поломка, а требование.**
Без самовлияния чарт не может перезапрашиваться от собственных эмиссов ⇒ смена
разреза/грануляции внутри чарта требует либо всех данных одним ответом (выбрано
в v5 куба, см. [[proteus-adoption-cube-dataset]]), либо эмиссии от ДРУГОГО чарта
(полка). Скоуп чарта — настройка на весь чарт, разделить «клик — без
самовлияния, смена разреза — с самовлиянием» платформа не даёт.

## set_cross: как включать (2026-09-18, прод)
`proteus_filters {action:'set_cross', dashboard:60260, enabled:true,
intents:[{source,targets}]}` — **dashboard обязателен**, source/target — ИМЕНА чартов
из describe_board (не slice_id! '788805' → unknown_chart, 'pa_cube' ок). Конверт
отвечает applied, но verification_state=unverified; проверять `proteus_filters
action='list'` (показал enabled:true, 788805 scope all:true — самовлияние).
`get_dashboard_by_id_or_slug` после этого всё ещё показывал старые json_metadata
(cross_filters_enabled:false) — похоже, читает опубликованные, а не драфт-метаданные.
Грабли создания чартов: `proteus_add_chart` viz_type БЕЛЫЙ СПИСОК без echarts/custom
(bar/big_number/…/table); `proteus_copy_chart` под живым frame_plan требует слот и
слот не умеет (борд 60260 объявляет слоты shelf/body). Кастомный чарт создаётся
руками в UI. Подмена датасета чарта — верб `proteus_set_dataset` (не proteus_chart!):
{board_id, chart: slice_id, dataset: имя}.

## Самовлияние чарта — КЛИЮЧ к пересчёту от клика (2026-09-17, вечер; правка неверного вердикта)
783708 не только приёмник: в его JS есть emitGroupby() (.ex_783708.jsx:280-288) —
applyCrossFilter([{column:'grp',operator:'IN',value:d}]) из кликов по СОБСТВЕННЫМ контролам
чарта (пресеты «3/4/3-4» + два select'а «Свой выбор», onDimChange → emitGroupby, стр. 290-299).
Его же датасет 168383 читает filter_values('grp') и перегруппирует (комментарий автора:
«Виртуальный датасет … через filter_values('grp') подставляет разрезы в grp1/grp2»).
⇒ КЛИК ВНУТРИ ЧАРТА МЕНЯЕТ ЗАПРОС ЕГО ЖЕ ДАТАСЕТА. Прежний вердикт «чарт не может
перезапустить сам себя» — НЕВЕРЕН; владелец подтвердил поведение живьём.
Резервный рычаг, если на нашем борде самовлияние не сработает из коробки:
proteus_filters(action='set_cross') — конфиг скоупа кросс-фильтров (легальный верб).
Дополнительно: на 59922 есть НАТИВНЫЙ фильтр «Разрез динамики» (select,
default_value: lvl3_mapped_management_unit_nm) — осмысленный начальный рендер без кликов;
нам аналог — джиня-дефолты (filter_values('x') or [...]), натив-фильтры не заводим.

## Грабли эмиттов (из комментариев кода 59922, проверено 2026-09-14)
1. operator ОБЯЗАТЕЛЕН: без него родитель собирает queries[].filters[] без op → data API
   отвечает 400 «Missing data for required field op» и валит ВСЕ чарты-получатели.
2. Пустой value НЕ эмитить: фильтр с value=[] ронял запрос чарта. Возврат к дефолту —
   кнопкой пресета в виджете, не очисткой. (applyCrossFilter([]) как ПОЛНАЯ очистка — работает:
   эмиттер 783469 так сбрасывает выбор, «график видит всё».)
3. render() объявлена внутри mount() и с верхнего уровня не видна — зовут через ссылку
   var rerender = null, которую mount заполняет. Прямой вызов падал ReferenceError и
   убивал чарт по window.onerror сандбокса (chart.clear + dispose).
4. Данные виджета: глобальный массив data (все строки, не data[0]):
   `var rawData = (typeof data !== 'undefined' && Array.isArray(data)) ? data : [];`
5. Виджет живёт в <iframe sandbox> размером с ячейку (hotfix-260909) — попапы не выходят
   за границы iframe без CSS-хака родителя (см. css борда 59922, токен-маркер в PNG).

## Грабли DOM/рендера оверлея (раунд 7, 2026-09-18 вечер — все проверены на стенде)
1. **overlay — скролл-контейнер виджета** (overflow:auto). Любой `overlay.innerHTML=…`
   в render() СБРАСЫВАЕТ scrollTop в 0 → клик внизу страницы «прыгает наверх». Лечится
   сохранением/восстановлением scrollTop+scrollLeft вокруг пересборки.
2. **`viewBox + width:100%` масштабирует ШРИФТЫ вместе с ячейкой** (11px → 20+px в широкой
   ячейке, «гигантская кривая»). Правильная резиновость: мерить ширину ПОСЛЕ монтажа
   (`svg.clientWidth`, svg с маркером вроде data-dyn-svg), пересобрать разметку с
   viewBox == clientWidth → масштаб 1:1, тянутся только координаты геометрии; на resize —
   перемер и пересборка при расхождении >2px.
3. **Аккордеон: раскрываемое тело — СЕСТРИНСКИЙ узел кликнутого заголовка** (data-action
   на шапке, тело рядом). `act.querySelector(body)` всегда null → «клик не работает»
   без единой ошибки. Искать от `act.parentNode`.
4. Стенд-грабли: eval.js с относительным путём строит `file://относительный` → браузер
   молча уходит в chrome-error://chromewebdata, все проверки нулями. Всегда
   `encodeURI(path.resolve())`. И: повторное чтение скриншотов через CDN иногда
   подсовывает предыдущий кадр — верить DOM-eval'ам и размерам файлов.

## Как вытащить код виджета через MCP
proteus_decompile(dashboard_id, full=true) → YAML; код = charts.<id>._floor.jsx
(YAML double-quoted scalar с фолдингом — распаковка .extract2.py в корне проекта).
echarts_code у react_sanbbox ПУСТ; params недоступен напрямую (columns — белый список).

## Скилл proteus-echarts-builder
Каркас кода на 59922 — ТОТ ЖЕ контракт, что у скилла (болванка «<NAME>.chart.js», запреты
backticks/стрелок/let/const, overlay поверх холста, data-массив). Скилл пригоден для адаптации
макета. Болванки тела «Отчётов»: Виджеты/pa-reports-body.* (bootstrap 2026-09-17, 56/56 PASS).
Playwright есть, но браузер в песочнице не стартует (smoke --env код 2) — сдача без браузерных
проверок (суждение B1) либо CDP-обход как в [[proteus-adoption-render-sandbox]].

Связано: [[proteus-adoption-cube-dataset]], [[proteus-adoption-sources-plan]], [[proteus-adoption-mockup]].
