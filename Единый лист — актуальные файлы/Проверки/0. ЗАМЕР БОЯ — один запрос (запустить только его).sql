-- 1
-- ЗАМЕР БОЯ ОДНИМ ЗАПРОСОМ: как на самом деле работают запросы единого листа (шапка, каталог, панель).
-- Берёт журнал ClickHouse (system.query_log): каждый запрос, который дашборд отправил в наши датасеты, уже там записан.
-- Порядок: 1) 3–5 минут покликать тестовый дашборд как обычно — открыть, выбрать отчёт, коллекцию, 12 месяцев,
--    ЦА (IT + руководители → «Применить»), вкладку «Аудитория» каталога, «Кто смотрит»;
--    2) выполнить этот запрос в SQL Lab (база CROSS); 3) прислать таблицу целиком (скрин или копия).
-- Окно — последние 24 часа (поменяйте 24 ниже). Пусто — нет прав на system.query_log или запросы ушли на другую
-- реплику: тогда пришлите текст ошибки / пустой результат, я дам вариант.
-- Колонки: runs — запусков, errors — ошибок, sec_* — секунд (медиана / 95 % / максимум), read_rows/read_mb — прочитано
-- (медиана), mem_mb_p95 — память, result_rows — строк в ответе. src: дашборд — запросы чартов, SQL Lab — ручные прогоны.
-- Внизу (part = витрина) — размеры таблиц pa_* на бою: runs = строк в таблице, read_mb_p50 = МБ на диске.
SELECT part, item, src, runs, errors, sec_p50, sec_p95, sec_max, read_rows_p50, read_mb_p50, mem_mb_p95, result_rows_p50
FROM (
  SELECT
    'запросы' AS part,
    multiIf(
      position(query, 'pa_adg_size') > 0, '1 шапка (pa_head)',
      position(query, '''aud'' AS section') > 0 AND position(query, 'IN (SELECT lg FROM') > 0, '2 каталог · ЦА по условиям',
      position(query, '''aud'' AS section') > 0, '2 каталог',
      position(query, '''lo'' AS section') > 0, '3 панель · ЦА по условиям',
      position(query, '''aa'' AS section') > 0, '3 панель · выбран отчёт/коллекция/владелец',
      '3 панель · весь Proteus') AS item,
    if(position(query, 'virtual_table') > 0, 'дашборд', 'SQL Lab') AS src,
    toFloat64(count()) AS runs,
    toFloat64(countIf(type != 'QueryFinish')) AS errors,
    round(quantileIf(0.5)(query_duration_ms, type = 'QueryFinish') / 1000, 2) AS sec_p50,
    round(quantileIf(0.95)(query_duration_ms, type = 'QueryFinish') / 1000, 2) AS sec_p95,
    round(maxIf(query_duration_ms, type = 'QueryFinish') / 1000, 2) AS sec_max,
    round(quantileIf(0.5)(read_rows, type = 'QueryFinish')) AS read_rows_p50,
    round(quantileIf(0.5)(read_bytes, type = 'QueryFinish') / 1048576, 1) AS read_mb_p50,
    round(quantileIf(0.95)(memory_usage, type = 'QueryFinish') / 1048576, 1) AS mem_mb_p95,
    round(quantileIf(0.5)(result_rows, type = 'QueryFinish')) AS result_rows_p50
  FROM system.query_log
  WHERE event_date >= today() - 1 AND event_time >= now() - INTERVAL 24 HOUR
    AND type IN ('QueryFinish', 'ExceptionBeforeStart', 'ExceptionWhileProcessing')
    AND position(query, 'prod_proteus.pa_') > 0
    AND (position(query, 'pa_adg_size') > 0 OR position(query, '''aud'' AS section') > 0 OR position(query, '''acl'' AS section') > 0)
    AND position(query, 'system.query_log') = 0
  GROUP BY item, src

  UNION ALL

  SELECT
    'витрина' AS part, table AS item, '' AS src,
    toFloat64(sum(rows)) AS runs, toFloat64(0) AS errors,
    toFloat64(0) AS sec_p50, toFloat64(0) AS sec_p95, toFloat64(0) AS sec_max, toFloat64(0) AS read_rows_p50,
    round(sum(bytes_on_disk) / 1048576, 1) AS read_mb_p50, toFloat64(0) AS mem_mb_p95, toFloat64(0) AS result_rows_p50
  FROM system.parts
  WHERE database = 'prod_proteus' AND startsWith(table, 'pa_') AND active
  GROUP BY table
)
ORDER BY part, item, src
