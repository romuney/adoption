# Memory Index

- [Proteus Adoption — проект и дорожная карта](proteus-adoption-project.md) — цель, статус, журнал действий
- [Helicopter-нода: DAG и мёртвый код](proteus-adoption-pipeline.md) — таблицы GP, выгрузка в CH, legacy-ветка
- [Модель данных](proteus-adoption-datamodel.md) — proteus_adoption + 4 виртуальных датасета, семантика полей
- [Текущий дашборд 13896](proteus-adoption-dashboard-current.md) — вкладки, чарты, фильтры, слабые места
- [Аудит: что можно вытащить из данных](proteus-adoption-audit-opportunities.md) — вводная для макетирования
- [Требования владельца](proteus-adoption-requirements.md) — аудитория, флоу, вкладка ЦА, проблема AD-групп
- [HTML-макет нового дашборда](proteus-adoption-mockup.md) — 2.5: две вкладки со своими каталогами; людская шина = клик по группе/человеку, без самовлияния; решения
- [Headless-браузер падает в песочнице](proteus-adoption-render-sandbox.md) — расследование рендера макета, сидбелт vs Chromium
- [План реализации и сорсы](proteus-adoption-sources-plan.md) — вердикт: витрины почти достаточно, нужна dim отчётов; датасеты, этапы
- [Куб pa_reports_cube: статус](proteus-adoption-cube-dataset.md) — v5.1: pa_body_v42 (169602, тело 788805) + pa_coh_v4 (169589) + НОВЫЙ pa_dicts; полка pa-shelf — поставка 2026-09-19
- [ClickHouse 24 под Proteus: пределы и приёмы](clickhouse24-proteus-limits.md) — CTE переисполняется ×5,5, SETTINGS нельзя, измерение числом строк
- [ECharts-платформа: кросс-фильтры](proteus-adoption-echarts-platform.md) — applyCrossFilter→filter_values, САМОВЛИЯНИЕ чарта (клик меняет свой же запрос) — 59922; грабли эмиттов, react_sanbbox
- [Правило: всё логировать в память проекта](always-log-to-project-memory.md) — требование пользователя
- [Типографика: не всё жирным](feedback-typography-not-everything-bold.md) — потолок веса 700
- [Браузер не стартует — просить пользователя](feedback-browser-ask-user-to-start.md) — 2–3 попытки максимум, дальше команда start-browser.sh в Терминал
- [context7 MCP в проекте](mcp-context7-setup.md) — .mcp.json (HTTP), конфликт enabled/disabled в settings.local.json вылечен
- [Как чарт встраивается в борд](proteus-adoption-html-embedding.md) — цепочка контейнеров, гаттеры 16px, divider +33px, что править CSS-шаблоном
- [Правило: тестовые артефакты не храним](feedback-no-test-artifacts.md) — скратч удалять сразу, опыт — финальным правилом в CLAUDE.md
