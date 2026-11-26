-- Журнал запросов кластера: сравнение замеров 43 (как сейчас) и 44 (окно один раз). SQL Lab, база CHaaS, только чтение.
-- Запускать после 43 и 44. Прислать CSV.
WITH lg AS (
  SELECT hostname AS host, query_id, initial_query_id, is_initial_query, event_time, query_duration_ms,
         read_rows, read_bytes, memory_usage, query, tables
  FROM clusterAllReplicas('{cluster}', `system`.query_log)
  WHERE event_date >= today() - 1 AND type = 'QueryFinish'
),
ab AS (
  SELECT query_id AS qid, extract(query, '''(ab_cat_[a-z]+)'' AS ab') AS variant, query_duration_ms AS total_ms,
         read_rows AS total_rows, memory_usage AS mem, event_time AS at
  FROM lg WHERE is_initial_query = 1 AND position(query, '''ab_cat_') > 0 AND position(query, 'groupArray') > 0
)
SELECT
  a.variant, a.at, a.total_ms, a.total_rows, formatReadableSize(a.mem) AS memory_initiator,
  countIf(arrayExists(t -> endsWith(t, 'pa_next_evd_day'), s.tables) AND position(s.query, '_pa_next_run') = 0) AS evd_subqueries,
  sumIf(s.read_rows, arrayExists(t -> endsWith(t, 'pa_next_evd_day'), s.tables) AND position(s.query, '_pa_next_run') = 0) AS evd_rows,
  maxIf(s.query_duration_ms, arrayExists(t -> endsWith(t, 'pa_next_evd_day'), s.tables)) AS evd_max_ms,
  count() AS shard_subqueries
FROM ab AS a
LEFT JOIN lg AS s ON s.initial_query_id = a.qid AND s.is_initial_query = 0
GROUP BY a.variant, a.at, a.total_ms, a.total_rows, a.mem
ORDER BY a.at DESC
LIMIT 10
