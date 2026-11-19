# Проверка бэкенда Proteus — точные версии одним заходом

Зачем: часть правил гайда стоит на выводах, а не на фактах боя — какая версия Superset и sqlparse у Proteus, есть ли
`GROUP BY` в обёртке кастомного чарта, какие режимы ClickHouse включены, кто проверяет SQL при сохранении. Ответы
закрывают OQ-01, OQ-02, OQ-03, OQ-05, OQ-08, OQ-09, OQ-12 (17-open-questions.md). Всё ниже только читает.

**Точно (без выводов)** — три шага: 0 (сервер), 2.3 (SQL Lab), 3 (запрос чарта). Номера пакетов Python (sqlparse,
sqlglot) из браузера и SQL Lab не видны — только на сервере. Нет доступа к серверу — шаги 1, 2.1, 2.2 проверяют то же
поведение из браузера.

## 0. Сервер Proteus — точные версии и код пути SQL (у кого есть доступ к контейнеру, поду или venv Superset)

Выполнить `kit/server-probe.sh` целиком (`bash server-probe.sh` или вставить в терминал контейнера). Печатает: версию
Python и Superset, версии пакетов (sqlparse, sqlglot, clickhouse-connect, jinja2, sqlalchemy, flask), стоит ли патч
лексера Superset (`sql_parse.py`), регулярку ключа кэша (`jinja_context.py`), откуда сообщение «Некорректный SQL
запрос», тип и срок кэша и лимиты строк из `superset_config`. Пароли, адреса и ключи не печатает: из конфига берутся только
эти значения (проверено на конфиге с паролем и адресом Redis в той же строке).

## 1. Консоль борда — версия, флаги, конфиг (1 минута)

Откройте любой борд → F12 → Console (контекст `top`) → вставьте `kit/backend-probe.js` целиком → Enter. Сниппет печатает
версию, SHA и сборку Proteus, флаги функций, лимиты строк, режим асинхронных запросов, валидаторы SQL и вид iframe чартов
и копирует это в буфер. Логин, почту и адреса серверов он не печатает (у адресов — только имена ключей).

**Без кода:** «Настройки» (справа вверху) → внизу раздел **About**: `Version`, `SHA`, `Build` — так в Superset 2.0.1, если
форк этот раздел не убрал.

**Короткий вариант — одна строка** (`kit/backend-probe.oneline.js`). Длинный сниппет 09.10 при переносе на рабочий
ноутбук испортился: в строке 7 25 знаков заменились куском строки 2 — «Unexpected token 'var'». Если переносите текст
через мессенджер, заметки или фото, берите эту строку или копируйте файл с GitHub (кнопка «Copy raw file»). Ответ печатается
одной строкой в консоли:

```js
(function(){var e=document.querySelector('[data-bootstrap]');if(!e)return 'нет data-bootstrap';var c=JSON.parse(e.getAttribute('data-bootstrap')).common||{},n=(c.menu_data||{}).navbar_right||{},f=c.feature_flags||{},k=c.conf||{};return ['версия '+n.version_string,'SHA '+n.version_sha,'сборка '+n.build_number,'флаги: '+Object.keys(f).filter(function(x){return f[x]===true}).sort().join(', '),'SQL_MAX_ROW '+k.SQL_MAX_ROW,'async '+k.GLOBAL_ASYNC_QUERIES_TRANSPORT,'валидаторы '+JSON.stringify(k.SQL_VALIDATORS_BY_ENGINE)].join(' | ')})()
```

## 2. SQL Lab — четыре запроса, каждый отдельно

**2.1. Версия лексера sqlparse (OQ-02):**
```sql
SELECT length(['x', '[y]']) AS n, 'a -- b' AS s
```
- ошибка «Single quoted string is not closed» (Code 62) — sqlparse 0.3.x, как в Superset 2.0.x (снятая модель М0 — противоречит F1);
- ответ `2`, `a -- b` — sqlparse ≥ 0.4.3, как в Superset 2.1–3.x (М1 0.4.3 или М2 0.4.4 — ждём этого; пин различит `kit/server-probe.sh`).

**2.2. Патч лексера Superset (OQ-02):**
```sql
SELECT 'O\'K; c' AS t
```
- ошибка (две инструкции, Code 62 «Single quoted string is not closed») — патч Superset стоит, `\'` в литералах опасен;
- ответ `O'K; c` — патча нет.

**2.3. Режимы и пределы ClickHouse (OQ-09)** — прислать строку ответа целиком:
```sql
SELECT version() AS v,
       getSetting('allow_experimental_analyzer') AS analyzer,
       getSetting('max_execution_time') AS max_exec_s,
       getSetting('max_threads') AS threads,
       getSetting('prefer_column_name_to_alias') AS prefer_alias,
       getSetting('join_use_nulls') AS join_nulls,
       getSetting('group_by_use_nulls') AS group_nulls,
       getSetting('max_query_size') AS max_query_size,
       getSetting('max_ast_elements') AS max_ast,
       getSetting('max_expanded_ast_elements') AS max_ast_exp,
       getSetting('max_parser_depth') AS max_depth,
       getSetting('use_query_cache') AS query_cache,
       2 AS run
```
На стенде (chdb 2.1.1): `24.8.4.1, true, 0, 4, false, false, false, 262144, 50000, 500000, 1000, false, 2`.

**2.4. Рендерит ли SQL Lab шаблоны (OQ-05):**
```sql
SELECT '{{ current_username() }}' AS who
```
Сам логин не присылайте — только «мой логин», «буквально скобки» или текст ошибки.

## 3. Обёртка кастомного чарта (OQ-01)

Любой кастомный чарт (например, HRBP HUB) → меню «⋯» чарта или Explore → «Скопировать запрос» (так «View query»
переведён в русской локали 2.0.1; у форка может быть «Показать запрос»). Найдите `virtual_table` (Ctrl+F) и пришлите текст от `) AS virtual_table`
до конца: есть ли там `GROUP BY` и какой `LIMIT`. Середину с SQL датасета присылать не нужно.

## 4. По желанию — с коллегой: логин в ключе кэша (OQ-12)

Вы и коллега открываете один борд HRBP HUB с одними фильтрами → F12 → Network → фильтр `chart/data` → ответ чарта →
Response → `result[0].cache_key`. Пришлите первые 8 знаков: «у меня …, у коллеги …». Ключи должны различаться: иначе
ответ с чужими данными может прийти из кэша.

## Бланк ответа

```
0. Сервер:      <вывод server-probe.sh целиком>
1. Консоль борда:  <вывод сниппета целиком>
2.1 length/--:     ошибка «…» / 2, a -- b
2.2 O\'K:          ошибка «…» / O'K; c
2.3 настройки:     <строка целиком>
2.4 who:           мой логин / скобки / ошибка «…»
3. Обёртка:        <от ") AS virtual_table" до конца>
4. cache_key:      у меня ……, у коллеги …… (по желанию)
```

## Что меняется от ответов

| Ответ | Что меняется |
|---|---|
| версии пакетов, патч, регулярка (п. 0); версия, SHA (п. 1) | какой исходник Superset модель стенда считает истиной (2.0.1 или 2.1.x) — PL-01 |
| 2.1 и 2.2 | подтверждают модель лексера стендов (0.4.x — М1 и М2 остаются; 0.3.x — вернуть М0); опасность `\'` и «]» в литералах — SP-02, SP-06, SP-07 |
| 2.3 | основной режим в матрице ClickHouse и бюджет текста запроса — CH-03, SP-16 |
| `SQL_VALIDATORS_BY_ENGINE` (п. 1) | кто выдаёт «Некорректный SQL запрос» при сохранении — SP-04, OQ-03 |
| флаги (п. 1) | асинхронные запросы, шаблоны, кросс-фильтры — F10, MC-09 |
| 3 | целостность ответа: `GROUP BY` есть — проверять число строк в `meta`, нет — достаточно порядка по роли — SP-13, DS-25 |
| 4 | безопасность кэша: одинаковые ключи — срочная поставка — AC-07…AC-12 |
