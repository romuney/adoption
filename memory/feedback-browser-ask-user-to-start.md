---
name: feedback-browser-ask-user-to-start
description: "Браузер не стартует из песочницы — не перебирать варианты, сразу просить пользователя запустить start-browser.sh в Терминале"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 793255d6-35d7-44d6-abd5-f4b518a1d3b0
  modified: 2026-09-17T14:35:36.210Z
---

Если headless-браузер не поднимается из песочницы tclaude (SIGSEGV у chrome-headless-shell, exit 21 у system Chrome, порт 9333 молчит) — НЕ перебирать флаги и профили до посинения. Максимум 2–3 быстрые проверки, дальше сразу просить пользователя.

**Why:** пользователь дал прямое указание 2026-09-17 после того, как я потратил несколько попыток на запуск Chrome из песочницы. Из песочницы браузер на этой машине не стартует в принципе ([[proteus-adoption-render-sandbox]]: ProcessSingleton/temp через confstr закрыт сидбелтом, headless-shell SIGSEGV) — повторные попытки предсказуемо бесплодны.

**How to apply:** дать пользователю одну команду для обычного Терминала:
`"/Users/r.kazantsev/Documents/Проекты Nessy/Проекты боевые/Proteus Adoption/.render/start-browser.sh"`
(headless-shell, CDP 127.0.0.1:9333). После его «DevTools listening…» — коннект из песочницы разрешён (localhost ≥1024), работать через `.render/screenshot.js` / `shots.js` / `eval.js`. Пока пользователь не перезапустил скрипт после Ctrl+C — браузера нет, опять не запускать самому, а просить.
