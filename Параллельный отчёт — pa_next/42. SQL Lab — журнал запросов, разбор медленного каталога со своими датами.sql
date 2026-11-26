-- Журнал запросов кластера: из чего сложился САМЫЙ МЕДЛЕННЫЙ за последние 3 часа запрос КАТАЛОГА PA NEXT со «Своими датами» (period_param = c|…).
-- SQL Lab, база CHaaS, только чтение. Один запрос. Прислать CSV.
-- Строки — подзапросы на шардах, сгруппированы по таблице и началу текста; больше всего прочитавшие сверху.
WITH lg AS (
  SELECT hostname AS host, query_id, initial_query_id, is_initial_query, event_time, query_duration_ms,
         read_rows, read_bytes, memory_usage, query, tables, ProfileEvents AS pe
  FROM clusterAllReplicas('{cluster}', `system`.query_log)
  WHERE event_date >= today() - 1 AND type = 'QueryFinish'
),
worst AS (
  SELECT query_id AS qid, query_duration_ms AS total_ms, event_time AS at, read_rows AS total_rows,
         multiIf(position(query, '''pa_next_version'' AS section, ''one''') > 0, 'панель',
                 position(query, '''pa_next_version'' AS section, ''cat''') > 0, 'каталог', 'другое') AS dataset
  FROM lg
  WHERE is_initial_query = 1 AND arrayExists(t -> startsWith(t, 'prod_proteus.pa_next_'), tables)
    AND position(query, '"period_param":["c|') > 0
    AND position(query, '''pa_next_version'' AS section, ''cat''') > 0 AND event_time >= now() - INTERVAL 3 HOUR
  ORDER BY query_duration_ms DESC LIMIT 1
)
SELECT
  (SELECT dataset FROM worst) AS dataset,
  (SELECT at FROM worst) AS at,
  (SELECT total_ms FROM worst) AS total_ms,
  (SELECT total_rows FROM worst) AS total_rows,
  arrayStringConcat(arraySort(arrayDistinct(arrayMap(t -> replaceRegexpOne(t, '^.*\\.', ''), tables))), ', ') AS shard_tables,
  replaceRegexpAll(replaceRegexpAll(substring(query, 1, 220), '`__table[0-9]+`\\.|`', ''), '\\s+', ' ') AS subquery_start,
  count() AS times,
  uniqExact(host) AS hosts,
  max(query_duration_ms) AS max_ms,
  sum(read_rows) AS rows_read,
  formatReadableSize(sum(read_bytes)) AS bytes_read,
  formatReadableSize(max(memory_usage)) AS max_memory,
  min(event_time) AS first_at
FROM lg
WHERE is_initial_query = 0 AND initial_query_id = (SELECT qid FROM worst)
GROUP BY shard_tables, subquery_start
ORDER BY rows_read DESC
LIMIT 40
