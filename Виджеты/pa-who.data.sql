-- ============================================================================
-- DATA-БОЛВАНКА — SQL под графиком
-- ============================================================================
-- СУБД: ClickHouse 24.8.15.1. Диалект узкий — ПЕРЕД правкой прочитай SQL.md.
-- В частности: lag()/lead() НЕ существует, только lagInFrame()/leadInFrame()
-- и обязательно с ЯВНОЙ рамкой окна.
--
-- Каждая выходная колонка этого запроса = ключ в объектах массива `data`.
-- Других данных в JS не существует.
--
-- ПРАВИЛА:
--   1. Не выдумывай колонки. Не хватает данных для макета — СПРОСИ.
--   2. Имя колонки здесь обязана побуквенно совпадать с `CFG.fields` в JS,
--      с таблицей в `FIELDS.md` и с именем в панели «Измерения» Proteus.
--   3. Колонка не попадёт в `data`, пока пользователь ВРУЧНУЮ не добавит
--      её в «Измерения». Поэтому любое предложение добавить или переименовать
--      колонку сопровождай предупреждением об этом — и правь файл только
--      после явного «да». Выпиши такие колонки в блок --FIELDS-- ниже.
--   4. Этот запрос Proteus ОБОРАЧИВАЕТ В ПОДЗАПРОС и строит поверх свой SELECT
--      по выбранным «Измерениям». Отсюда: никакой `;` в конце, никакого FORMAT,
--      никакого хвостового SETTINGS. `ORDER BY` НЕ гарантирован — серверная
--      пагинация его перебивает, поэтому в JS всё равно делай явный `sort`.
--      Лимит строк применяется СНАРУЖИ и обрезает выборку молча.
--   5. Тип значения ≠ то, что видно в UI-таблице: `DATE`/`DATETIME` часто
--      приходят epoch-числом. Отметь тип каждой колонки-даты.
--   6. ВЫЧИСЛЕНИЯ — В JS, НЕ В БАЗЕ. SQL отдаёт СЫРЫЕ строки нужной
--      гранулярности. Проценты, дельты, ранги, накопительные итоги,
--      сортировка и форматирование считаются в `buildModel()`: ClickHouse —
--      общая база, её не нагружаем ради одного виджета.
--      В SQL остаётся только то, чего в JS не сделать или что реально
--      уменьшает число строк: фильтрация по периоду и скоупу, джойны,
--      схлопывание гранулярности.
--      Проверка: «строк в браузере от этого станет меньше?» Нет — считай в JS.
--   7. Доли и проценты в SQL не считаются ВООБЩЕ: отдай числитель и знаменатель
--      отдельными колонками, JS поделит сам. Это снимает деление на ноль
--      (в ClickHouse оно даёт inf/nan, а не ошибку) и защищает от повторной
--      агрегации внешним запросом Proteus.
--   8. Если строк столько, что срабатывает лимит Proteus, — сначала предложи
--      пользователю схлопнуть гранулярность и дождись ответа (см. п.3),
--      а не делай молча. Отдельной колонкой отдай честный итог до лимита,
--      чтобы виджет показал «Показано X из Y».
--   9. У КАЖДОЙ колонки явный алиас: латиница, snake_case, без пробелов,
--      скобок и кириллицы. Без алиаса имя станет `sum(amount)` — в JS
--      к такому полю не обратиться точечной нотацией.
-- ============================================================================
-- Датасет pa_who (генератор .gen_who.py -> .pa_who.sql, ревизия 2026-09-21:
-- 20 колонок, +react_u). Джиня читает period_param + pub_f/act_f/exc_f +
-- mode_param/sel_f (выбор каталога). Людскую шину НЕ читает — самовлияние
-- чарта отключено (решение NOTES §0).
-- ============================================================================
{% set GRAINS = {'d': {'n': 30, 'u': 'day', 'sf': 'toStartOfDay', 'gap': 7}, 'w': {'n': 20, 'u': 'week', 'sf': 'toMonday', 'gap': 1}, 'm': {'n': 12, 'u': 'month', 'sf': 'toStartOfMonth', 'gap': 1}, 'q': {'n': 8, 'u': 'quarter', 'sf': 'toStartOfQuarter', 'gap': 1}} %}
{% set grain = filter_values('period_param')|first|default('d', true) %}
{% set grain = grain if grain in GRAINS else 'd' %}
{% set g = GRAINS[grain] %}
{% macro q(values) -%}
{%- set out = [] -%}
{%- for v in values -%}{%- set _ = out.append(v|string|replace('\\', '\\\\')) -%}{%- endfor -%}
{{- out|where_in -}}
{%- endmacro %}
{% set pubv = filter_values('pub_f')|first|default('1', true) %}{% set pubv = pubv if pubv in ['0', '1'] else '1' %}
{% set actv = filter_values('act_f')|first|default('1', true) %}{% set actv = actv if actv in ['0', '1'] else '1' %}
{% set excv = filter_values('exc_f')|first|default('1', true) %}{% set excv = excv if excv in ['0', '1'] else '1' %}
{% set pmode = filter_values('mode_param')|first|default('', true) %}
{% set sel = filter_values('sel_f') or [] %}
{% set isrep = pmode == 'report' %}
{% set isown = pmode == 'owner' %}
{% set iscoll = pmode == 'collection' %}
{% set selhave = sel|length > 0 %}
WITH
  maxd AS (SELECT max(log_dttm) AS md FROM prod_proteus.pa_evd_day),
  dash_ok AS (
    SELECT dashboard_id, owner_login, owners_string, collection_names
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1{% if pubv == '1' %} AND published = 1{% endif %}{% if actv == '1' %} AND actual_flg = 1{% endif %}{% if selhave and isrep %} AND dashboard_id IN ({{ sel|map('int')|join(', ') }}){% endif %}{% if selhave and isown %} AND owner_login IN {{ q(sel) }}{% endif %}{% if selhave and iscoll %} AND hasAny(collection_names, {{ q(sel) }}){% endif %}
  ),
  evd AS (
    SELECT m.dashboard_id AS did, e.login AS login, toStartOfDay(e.log_dttm) AS dte, sum(e.views) AS v
    FROM prod_proteus.pa_evd_day e
    INNER JOIN dash_ok m ON m.dashboard_id = e.dashboard_id
    WHERE 1=1{% if excv == '1' %} AND NOT has(m.owners_string, e.login){% endif %}
    GROUP BY m.dashboard_id, e.login, toStartOfDay(e.log_dttm)
  ),
  b AS (
    SELECT login,
      uniqExactIf(dte, toInt64(dateDiff('{{ g.u }}', {{ g.sf }}(dte), {{ g.sf }}((SELECT md FROM maxd)))) < {{ g.n }}) AS days,
      sumIf(v, toInt64(dateDiff('{{ g.u }}', {{ g.sf }}(dte), {{ g.sf }}((SELECT md FROM maxd)))) < {{ g.n }}) AS views,
      maxIf(dte, toInt64(dateDiff('{{ g.u }}', {{ g.sf }}(dte), {{ g.sf }}((SELECT md FROM maxd)))) < {{ g.n }}) AS last_dte,
      max(toInt64(dateDiff('{{ g.u }}', {{ g.sf }}(dte), {{ g.sf }}((SELECT md FROM maxd))))) AS fd_k,
      groupArray(toInt64(dateDiff('{{ g.u }}', {{ g.sf }}(dte), {{ g.sf }}((SELECT md FROM maxd))))) AS ks_all
    FROM evd GROUP BY login
  ),
  t1 AS (
    SELECT login, toInt64(dateDiff('{{ g.u }}', {{ g.sf }}(dte), {{ g.sf }}((SELECT md FROM maxd)))) AS k, sum(v) AS v
    FROM evd WHERE toInt64(dateDiff('{{ g.u }}', {{ g.sf }}(dte), {{ g.sf }}((SELECT md FROM maxd)))) < {{ g.n }} GROUP BY login, toInt64(dateDiff('{{ g.u }}', {{ g.sf }}(dte), {{ g.sf }}((SELECT md FROM maxd))))
  )
SELECT
  CAST(section AS String) AS section,
  CAST(g AS Nullable(String)) AS g,
  CAST(k AS Nullable(String)) AS k,
  CAST(parent AS Nullable(String)) AS parent,
  CAST(login AS Nullable(String)) AS login,
  CAST(fio AS Nullable(String)) AS fio,
  CAST(lvl3 AS Nullable(String)) AS lvl3,
  CAST(lvl4 AS Nullable(String)) AS lvl4,
  CAST(spec AS Nullable(String)) AS spec,
  CAST(stream AS Nullable(String)) AS stream,
  CAST(exp AS Nullable(String)) AS exp,
  CAST(is_head AS Nullable(UInt8)) AS is_head,
  CAST(days AS Nullable(UInt32)) AS days,
  CAST(views AS Nullable(Int64)) AS views,
  CAST(last_dt AS Nullable(Date)) AS last_dt,
  CAST(bin AS Nullable(UInt8)) AS bin,
  CAST(users AS Nullable(UInt64)) AS users,
  CAST(new_u AS Nullable(UInt64)) AS new_u,
  CAST(react_u AS Nullable(UInt64)) AS react_u,
  CAST(cnt AS Nullable(UInt64)) AS cnt
FROM (


SELECT 'total' AS section, NULL AS g, NULL AS k, NULL AS parent, NULL AS login, NULL AS fio, NULL AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, NULL AS exp, NULL AS is_head, NULL AS days, NULL AS views, NULL AS last_dt, NULL AS bin, NULL AS users, NULL AS new_u, NULL AS react_u, count() AS cnt
FROM b WHERE days > 0

UNION ALL

SELECT 'freq' AS section, NULL AS g, toString(fb) AS k, NULL AS parent, NULL AS login, NULL AS fio, NULL AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, NULL AS exp, NULL AS is_head, NULL AS days, NULL AS views, NULL AS last_dt, NULL AS bin, NULL AS users, NULL AS new_u, NULL AS react_u, count() AS cnt
FROM (SELECT multiIf(days = 1, toUInt8(1), days <= 3, toUInt8(2), days <= 7, toUInt8(3), days <= 15, toUInt8(4), toUInt8(5)) AS fb FROM b WHERE days > 0) GROUP BY fb

UNION ALL

SELECT 'ts' AS section, NULL AS g, toString(t1.k) AS bk, NULL AS parent, NULL AS login, NULL AS fio, NULL AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, NULL AS exp, NULL AS is_head, NULL AS days,
  sum(t1.v) AS views, NULL AS last_dt, NULL AS bin,
  count() AS users, countIf(b.fd_k = t1.k) AS new_u,
  countIf(t1.k != b.fd_k AND
    arrayCount(j -> j > t1.k AND j <= t1.k + {{ g.gap }}, b.ks_all) = 0) AS react_u, NULL AS cnt
FROM t1 INNER JOIN b USING (login)
GROUP BY bk

UNION ALL

SELECT 'ctx' AS section, 'lvl3' AS g, a.lvl3_management_unit_nm AS k, NULL AS parent, NULL AS login, NULL AS fio, NULL AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, NULL AS exp, NULL AS is_head, NULL AS days, NULL AS views, NULL AS last_dt, NULL AS bin, NULL AS users, NULL AS new_u, NULL AS react_u, count() AS cnt
FROM b INNER JOIN prod_proteus.pa_emp_attrs a USING (login)
WHERE b.days > 0 AND a.lvl3_management_unit_nm != '' GROUP BY k

UNION ALL

SELECT 'ctx' AS section, 'lvl4' AS g, a.lvl4_management_unit_nm AS k, NULL AS parent, NULL AS login, NULL AS fio, NULL AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, NULL AS exp, NULL AS is_head, NULL AS days, NULL AS views, NULL AS last_dt, NULL AS bin, NULL AS users, NULL AS new_u, NULL AS react_u, count() AS cnt
FROM b INNER JOIN prod_proteus.pa_emp_attrs a USING (login)
WHERE b.days > 0 AND a.lvl4_management_unit_nm != '' GROUP BY k

UNION ALL

SELECT 'ctx' AS section, 'spec' AS g, a.emp_specialization_desc AS k, NULL AS parent, NULL AS login, NULL AS fio, NULL AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, NULL AS exp, NULL AS is_head, NULL AS days, NULL AS views, NULL AS last_dt, NULL AS bin, NULL AS users, NULL AS new_u, NULL AS react_u, count() AS cnt
FROM b INNER JOIN prod_proteus.pa_emp_attrs a USING (login)
WHERE b.days > 0 AND a.emp_specialization_desc != '' GROUP BY k

UNION ALL

SELECT 'ctx' AS section, 'stream' AS g, a.emp_stream_desc AS k, NULL AS parent, NULL AS login, NULL AS fio, NULL AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, NULL AS exp, NULL AS is_head, NULL AS days, NULL AS views, NULL AS last_dt, NULL AS bin, NULL AS users, NULL AS new_u, NULL AS react_u, count() AS cnt
FROM b INNER JOIN prod_proteus.pa_emp_attrs a USING (login)
WHERE b.days > 0 AND a.emp_stream_desc != '' GROUP BY k

UNION ALL

SELECT 'ctx' AS section, 'head' AS g, '1' AS k, NULL AS parent, NULL AS login, NULL AS fio, NULL AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, NULL AS exp, NULL AS is_head, NULL AS days, NULL AS views, NULL AS last_dt, NULL AS bin, NULL AS users, NULL AS new_u, NULL AS react_u, count() AS cnt
FROM b INNER JOIN prod_proteus.pa_emp_attrs a USING (login)
WHERE b.days > 0 AND a.management_head_flg = 1

UNION ALL

SELECT 'ctx' AS section, 'dep' AS g, a.lvl4_management_unit_nm AS k, a.lvl3_management_unit_nm AS parent, NULL AS login, NULL AS fio, NULL AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, NULL AS exp, NULL AS is_head, NULL AS days, NULL AS views, NULL AS last_dt, NULL AS bin, NULL AS users, NULL AS new_u, NULL AS react_u, count() AS cnt
FROM b INNER JOIN prod_proteus.pa_emp_attrs a USING (login)
WHERE b.days > 0 AND a.lvl4_management_unit_nm != '' AND a.lvl3_management_unit_nm != ''
GROUP BY k, parent

UNION ALL

SELECT * FROM (
  SELECT 'ctx' AS section, 'adg' AS g, ad AS k, NULL AS parent, NULL AS login, NULL AS fio, NULL AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, NULL AS exp, NULL AS is_head, NULL AS days, NULL AS views, NULL AS last_dt, NULL AS bin, NULL AS users, NULL AS new_u, NULL AS react_u, count() AS cnt
  FROM b INNER JOIN prod_proteus.pa_emp_attrs a USING (login)
  ARRAY JOIN a.ad_groups AS ad
  WHERE b.days > 0 AND ad != ''
  GROUP BY k ORDER BY cnt DESC LIMIT 100
)

UNION ALL

SELECT * FROM (
  SELECT 'list' AS section, NULL AS g, NULL AS k, NULL AS parent, b.login AS login, '' AS fio,
    a.lvl3_management_unit_nm AS lvl3, a.lvl4_management_unit_nm AS lvl4,
    a.emp_specialization_desc AS spec, a.emp_stream_desc AS stream,
    '' AS exp,
    toUInt8(a.management_head_flg) AS is_head,
    b.days AS days, b.views AS views, toDate(b.last_dte) AS last_dt,
    multiIf(days = 1, toUInt8(1), days <= 3, toUInt8(2), days <= 7, toUInt8(3), days <= 15, toUInt8(4), toUInt8(5)) AS bin, NULL AS users, NULL AS new_u, NULL AS react_u, NULL AS cnt
  FROM b INNER JOIN prod_proteus.pa_emp_attrs a USING (login)
  WHERE b.days > 0
  ORDER BY b.days DESC, b.views DESC, b.login LIMIT 2000
)

)

-- ============================================================================
-- --FIELDS-- КОЛОНКИ ДЛЯ РУЧНОГО ДОБАВЛЕНИЯ В «ИЗМЕРЕНИЯ»
-- Синхронно с `FIELDS.md` и `CFG.fields`. Тип: # число / abc строка / f(x) вычисляемое.
-- ----------------------------------------------------------------------------
-- имя_колонки        тип     назначение
-- section            abc     секция ответа: list | ctx | freq | total | ts
-- g                  abc     разрез ctx-строки: lvl3|lvl4|spec|stream|head|dep|adg
-- k                  abc     ключ строки: имя группы / номер корзины 1-5 / возраст ts-бакета
-- parent             abc     lvl3-родитель dep-строки (двухуровневое дерево)
-- login              abc     логин человека (list)
-- fio                abc     ФИО (пусто до колонки attrs, хвост NOTES §6)
-- lvl3               abc     УС-3 человека
-- lvl4               abc     департамент человека
-- spec               abc     специализация человека
-- stream             abc     стрим человека
-- exp                abc     стаж (пусто до колонки attrs, хвост NOTES §6)
-- is_head            #       руководитель: 1/0
-- days               #       активных периодов грануляции у человека
-- views              #       просмотров у человека (list) / в бакете (ts)
-- last_dt            #       DATE -> epoch: последний визит человека
-- bin                #       корзина частоты 1..5
-- users              #       ts: активных в бакете
-- new_u              #       ts: новых в бакете
-- react_u            #       ts: вернувшихся в бакете
-- cnt                #       счётчик секции (freq/ctx/total)
-- ============================================================================
