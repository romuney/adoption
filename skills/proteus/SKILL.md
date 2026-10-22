---
name: proteus
description: Proteus BI через MCP-прокси dp ai mcp remote — поиск и просмотр дашбордов, состав борда, логика запросов и SQL графиков, датасеты, база знаний Proteus, изменение графиков и скиллов дашборда. Использовать при любых просьбах про Proteus, дашборды, графики, BI.
---

# Proteus BI через MCP-прокси

Proteus не подключён как нативный MCP (политика tclaude не пускает шлюз хаба),
но полностью доступен через прокси `dp ai mcp remote` из bash. Авторизация —
dp-токен от имени пользователя, права Proteus соблюдаются автоматически.

## Шаблон вызова

```bash
(printf '%s\n' \
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"cc","version":"1"}}}' \
'{"jsonrpc":"2.0","method":"notifications/initialized"}' \
'{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"ИНСТРУМЕНТ","arguments":АРГУМЕНТЫ_JSON}}' \
; sleep 15) | dp ai mcp remote --url "https://mcp-gw.ai-tools-hub.t-tech.team/v1/proteus/proteus-team-ai/proteus-agent-mcp/mcp" 2>/dev/null | tail -1
```

Ответ — строка JSON-RPC; данные лежат в result.content[0].text, внутри text
часто ещё одна JSON-строка — парсить дважды (python3). Для тяжёлых запросов
увеличить sleep до 30.

## Инструменты

Проверено 2026-09-14, Unified Proteus MCP 3.4.2.

Чтение:
- proteus_whoami {} — кто я, мои права
- get_dashboards_list_by_filters {} — все доступные дашборды
- proteus_describe_board {"board_id":N} — состав борда: графики, viz_type, фильтры, CSS
- get_dashboard_by_id_or_slug {"id_or_slug":"N"} — метаданные: права, вкладки, position_json
- proteus_chart_logic {"chart_id":N,"full":true} — логика запроса: датасет, метрики, groupby, фильтры
- get_dashboard_datasets_by_id_or_slug {"id_or_slug":"N"} — датасеты борда; params != null у виртуальных — там SQL
- proteus_find_charts {"board_id":N,"where":"..."} — поиск графиков
- query_rag_knowledge — вопросы по базе знаний Proteus
- proteus_explore, proteus_describe {"entity_type":"..."} — исследование объектов

Изменение — ТОЛЬКО по явной команде пользователя с конкретным объектом:
- proteus_fork_chart, proteus_copy_chart, proteus_add_chart
- proteus_add_grouping, proteus_add_parameter_filter
- proteus_story_apply, put_dashboard_skill

## Правила

- Изменяющие вызовы не делать без явной команды — графики и борды настоящие.
- Чувствительные датасеты отдают только структуру, без строк данных (ограничение сервера).
- ID борда берётся из URL: /superset/dashboard/<ID>/.
