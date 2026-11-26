-- Журнал запросов кластера: из чего сложилось время САМОГО СВЕЖЕГО запроса панели PA NEXT.
-- SQL Lab, база CHaaS, только чтение. Один запрос. Прислать результат целиком (скрин или CSV).
-- Строки — подзапросы на шардах, сгруппированы по началу текста, самые долгие сверху.
WITH lg AS (
  SELECT hostname AS host, query_id, initial_query_id, is_initial_query, event_time, query_duration_ms,
         read_rows, read_bytes, memory_usage, query, ProfileEvents AS pe, tables
  FROM clusterAllReplicas('{cluster}', `system`.query_log)
  WHERE event_date >= today() - 1 AND type = 'QueryFinish'
),
-- исходные запросы отчёта — по таблицам; подзапросы на шардах — по номеру исходного (их таблицы могут называться иначе)
ini AS (SELECT * FROM lg WHERE is_initial_query = 1 AND arrayExists(t -> startsWith(t, 'prod_proteus.pa_next_'), tables)),
last_panel AS (
  SELECT query_id AS qid, query_duration_ms AS total_ms, event_time AS at
  FROM ini
  WHERE position(query, '''pa_next_version'' AS section, ''one''') > 0
  ORDER BY event_time DESC LIMIT 1
)
SELECT
  (SELECT at FROM last_panel) AS panel_at,
  (SELECT total_ms FROM last_panel) AS panel_total_ms,
  replaceRegexpAll(substring(query, 1, 160), '\\s+', ' ') AS subquery_start,
  count() AS times,
  uniqExact(host) AS hosts,
  max(query_duration_ms) AS max_ms,
  sum(query_duration_ms) AS sum_ms,
  min(event_time) AS first_at,
  sum(read_rows) AS rows_read,
  formatReadableSize(sum(read_bytes)) AS bytes_read,
  formatReadableSize(max(memory_usage)) AS max_memory,
  round(sum(pe['NetworkSendElapsedMicroseconds']) / 1000) AS net_send_ms
FROM lg
WHERE is_initial_query = 0 AND initial_query_id = (SELECT qid FROM last_panel)
GROUP BY subquery_start
ORDER BY max_ms DESC
LIMIT 40
