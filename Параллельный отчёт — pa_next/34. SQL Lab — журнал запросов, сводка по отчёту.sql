-- Журнал запросов кластера: последние запросы датасетов PA NEXT (шапка / каталог / панель) за сутки.
-- SQL Lab, база CHaaS, только чтение. Один запрос. Прислать результат (скрин или CSV).
-- Сначала открой отчёт и покликай (каталог, отчёт, условие ЦА), потом запускай.
WITH lg AS (
  SELECT hostname AS host, query_id, initial_query_id, is_initial_query, event_time, query_duration_ms,
         read_rows, read_bytes, memory_usage, result_rows, ProfileEvents AS pe, query, user, tables
  FROM clusterAllReplicas('{cluster}', `system`.query_log)
  WHERE event_date >= today() - 1 AND type = 'QueryFinish'
),
-- исходные запросы отчёта — по таблицам; подзапросы на шардах — по номеру исходного (их таблицы могут называться иначе)
ini AS (SELECT * FROM lg WHERE is_initial_query = 1 AND arrayExists(t -> startsWith(t, 'prod_proteus.pa_next_'), tables)),
sec AS (
  SELECT initial_query_id AS iq, count() AS n_sub, uniqExact(host) AS n_hosts,
         sum(query_duration_ms) AS sub_ms_sum, max(query_duration_ms) AS sub_ms_max,
         sum(read_rows) AS sub_rows, sum(read_bytes) AS sub_bytes
  FROM lg WHERE is_initial_query = 0 AND initial_query_id IN (SELECT query_id FROM ini) GROUP BY iq
)
SELECT
  i.event_time,
  multiIf(position(i.query, '''pa_next_version'' AS section, ''one''') > 0, 'панель',
          position(i.query, '''pa_next_version'' AS section, ''cat''') > 0, 'каталог',
          position(i.query, '''pa_next_version'' AS section, ''head''') > 0, 'шапка', 'другое') AS dataset,
  i.user,
  i.query_duration_ms AS total_ms,
  s.n_sub AS shard_subqueries, s.n_hosts AS hosts, s.sub_ms_sum, s.sub_ms_max,
  round(i.pe['NetworkReceiveElapsedMicroseconds'] / 1000) AS net_recv_ms,
  round(i.pe['NetworkSendElapsedMicroseconds'] / 1000) AS net_send_ms,
  i.pe['ScalarSubqueriesGlobalCacheMiss'] AS scalar_subqueries,
  i.pe['QueryConditionCacheHits'] AS cond_cache_hits,
  i.pe['QueryConditionCacheMisses'] AS cond_cache_misses,
  s.sub_rows AS rows_read_on_shards,
  formatReadableSize(s.sub_bytes) AS read_on_shards,
  formatReadableSize(i.memory_usage) AS memory_initiator,
  i.result_rows,
  i.query_id
FROM ini AS i
LEFT JOIN sec AS s ON s.iq = i.query_id
ORDER BY i.event_time DESC
LIMIT 40
