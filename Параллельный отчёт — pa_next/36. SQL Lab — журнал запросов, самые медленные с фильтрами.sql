-- Журнал запросов кластера: 25 самых медленных запросов отчёта PA NEXT за сутки и фильтры, с которыми они пришли.
-- SQL Lab, база CHaaS, только чтение. Один запрос. Прислать CSV.
SELECT
  event_time,
  multiIf(position(query, '''pa_next_version'' AS section, ''one''') > 0, 'панель',
          position(query, '''pa_next_version'' AS section, ''cat''') > 0, 'каталог',
          position(query, '''pa_next_version'' AS section, ''head''') > 0, 'шапка', 'другое') AS dataset,
  query_duration_ms AS total_ms,
  read_rows,
  formatReadableSize(read_bytes) AS read,
  formatReadableSize(memory_usage) AS memory_initiator,
  result_rows,
  coalesce(nullIf(extract(query, '''flt'' AS section, '''' AS g, ''([^'']*)'''), ''),
           nullIf(extract(query, '"flt":(\\{[^}]*\\})'), ''), '') AS filters,
  length(query) AS sql_chars,
  query_id
FROM clusterAllReplicas('{cluster}', `system`.query_log)
WHERE event_date >= today() - 1 AND type = 'QueryFinish' AND is_initial_query = 1
  AND arrayExists(t -> startsWith(t, 'prod_proteus.pa_next_'), tables)
ORDER BY query_duration_ms DESC
LIMIT 25
