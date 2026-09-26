---
name: proteus-adoption-html-embedding
description: "Как чарт встраивается в дашборд Proteus — цепочка контейнеров, гаттеры 16px, divider +33px, кто какими стилями управляет"
metadata: 
  node_type: memory
  type: project
  originSessionId: 043ed875-1095-4230-b6e2-b62173c420da
  modified: 2026-09-18T19:13:45.863Z
---

Изучена сохранёнка живого борда (файл `HTML` в корне проекта; СВЕЖЕЕ — от
2026-09-18 поздняя ночь, окно 1341: ячейки 1341×1088 и 1341×552) + чанки Proteus.

# Цепочка встраивания чарта (view mode)

```
.dashboard-grid
 └ .grid-content
    └ .dragdroppable-row          ← margin-bottom задаётся ТОЛЬКО нашим CSS (см. ниже)
       └ .with-popover-menu
          └ .grid-row
             └ .dragdroppable-column
                └ .resizable-container   ← inline width/height из layout (1341×1088 / 1341×552)
                   └ .dashboard-component-chart-holder   ← наш CSS: flex-колонка
                      └ .chart-slice > (.header-title скрыт :has) + .dashboard-chart
                         └ .chart-container > .slice_container > div
                            └ .react_sanbbox > iframe   ← ЗДЕСЬ живёт JS-виджет
```

# Ключевые факты форка (hotfix-260909)

- `.chart-slice` в этом форке — **display:block, НЕ flex**. У `.dragdroppable-row`
  и `.grid-content` в чанках правил НЕТ вообще — стили живут в рантаймовых
  emotion-классах (css-1rcppqb и т.п.), которых нет ни в сохранёнке, ни в чанках.
  → любые расчёты «как платформа разложит» без живой страницы — гипотезы.
- iframe платформа обмеряет при маунте и пишет в АТРИБУТЫ (1309×1052 и
  1309×516 = ячейка − 32/36: паддинг 16+16 + шапка 4). Атрибуты НЕ следят
  за CSS и НЕ обновляются после F5 — растягивать iframe можно только CSS-ом
  (`height:100%!important` перекрывает атрибуты).
- iframe по умолчанию `display:inline` — даёт строчную щель, нужен `display:block`.
- gridUnit=4, гаттеры 16px — верно для ВНУТРЕННИХ ритмов виджетов; для рядов
  борда гаттер теперь задаёт НАША вставка (16px явно).

# РАУНД 12 (ФИНАЛ, 2026-09-18/19 ночь) — вставка, которая РЕАЛЬНО работает
# ПОДТВЕРЖДЕНО ЖИВЫМ БОРДОМ 60260 (владелец: «УРА сработало», шов 16px)

Живые числа до: шов iframe 48 (16 паддинг-низ ячейки0 + 16 гаттер + 16
паддинг-верх ячейки1), iframes 1056×520 при ячейках 1088×552. Цепочка
родителей (сниппет в консоли) нашла виновника: **`.dashboard-component-chart-holder`
сам несёт padding:16px/16px** (emotion-правило форка — в чанках его нет,
у .chart-container при этом pad=0). Итоговая вставка = раунд 11 + ОДНА строка:

```css
.dashboard-grid .dashboard-component-chart-holder { padding: 0 !important; }
```

Полный текст — «0. Инструкция.md» папки «Обновление 2026-09-18 (v5 все
разрезы сразу)», разделы «Раунд 11» + «Раунд 12». Проверено на реплике
сохранёнки: шов 16.0, хвосты 0, iframe = ячейка.

Состав вставки (для справки):
1. `.chart-slice` — `display:flex;flex-direction:column` (раунд 10 это выбросил
   и сломал: flex:1 у .dashboard-chart без flex-родителя не работает).
2. `iframe` — `display:block` (строчная щель).
3. `.dashboard-grid .grid-content > :not(:last-child) { margin-bottom:16px !important }`
   — явный гаттер (живой замер показал margin-bottom:16px у ряда — возможно,
   родной emotion; строка безвредна и гарантирует 16).
4. `.dashboard-component-chart-holder { padding:0 !important }` — ГЛАВНЫЙ фикс
   раунда 12 (паддинг 16 холдера, emotion).
5. `.chart-container { padding:0 !important }` — паддинг платформы (раунд 9).

Диагностический сниппет для консоли живого борда (цепочка родителей iframe
с паддингами) — в конце раздела «Раунд 11» инструкции; сниппет-шов (cells/
iframes/швы) — тоже там. Живой обмер платформы iframe всегда с паддингами
(атрибуты 1309×1052) — неважно, CSS перекрывает.

# Почему стенд врали (урок методологии)

Стенд `.render/board-stand.html` строка 14 вписывал `.chart-slice{display:flex}`
как «платформенный» — это была моя выдумка, не факт форка. Стенд «проходил»,
живой борд — нет. **Эталон проверки теперь — реплика сохранёнки**, не стенд:
`.serve_saved.py` (8924: `/` → ./HTML, `/static/...` → .html_css/<basename>) +
`.render/measure-live.js [w] [h] [patch]` (CDP 9333, сам инжектит патч и мерит
шов). Для докачки чанков: хост https://proteus.tcsbank.ru/static/prod/…,
curl --cacert "$NODE_EXTRA_CA_CERTS". В .html_css недостающие фа-иконки неважны.

# Кто чем управляет

- **Мой chart.js**: всё внутри `.react_sanbbox` iframe. Канвас виджета = #f6f6f6
  (= --dashboard-background), блоки белые, разделение серыми желобами (раунд 6).
- **CSS-шаблон борда**: всё МЕЖДУ чартами и обвязка — вставка раунда 11.
- MCP `proteus_chart_logic` JS-код виджета НЕ отдаёт (viz_content пуст) —
  сверить версию в живом чарте нельзя, только первая строка кода в UI.

# Памятка по жертве раундов 8-10

Виджет тела: root flex-колонка на 100% высоты iframe, split.main flex:1 —
серого хвоста внутри виджета нет (JS свежий, файлы 2/3 в поставке == Виджеты).
Пользователь обновлял JS вовремя; проблема была в моей CSS-вставке.
