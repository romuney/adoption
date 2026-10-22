---
name: mcp-context7-setup
description: "context7 MCP подключён через проектный .mcp.json (HTTP), требовал рестарта tclaude"
metadata: 
  node_type: memory
  type: project
  originSessionId: d91484cc-a787-4f1c-9b43-47d31a1cc572
  modified: 2026-09-17T17:30:11.810Z
---

2026-09-17: подключён context7 MCP для проекта Proteus Adoption.

- Конфиг: `.mcp.json` в корне проекта — `{"type": "http", "url": "https://mcp.context7.com/mcp"}` (без API-ключа, анонимный доступ).
- `.claude/settings.local.json`: context7 был одновременно в `enabledMcpjsonServers` и `disabledMcpjsonServers` (наследие прошлой попытки, при этом самого `.mcp.json` не существовало) — убран из disabled.
- Endpoint проверен curl'ом из песочницы: 200 OK, TLS-инспектор не мешает.
- Серверы из `~/.claude.json` (dp/spirit: allure, finedog, gitlab, jira, sage, tracker, wixie) — это клиентский список, context7 туда не добавляется, только проектный `.mcp.json`.
- Если после рестарта context7 не появился в /mcp — значит, корпоративная политика tclaude режет серверы не из своего списка; тогда путь только через владельца политики.
