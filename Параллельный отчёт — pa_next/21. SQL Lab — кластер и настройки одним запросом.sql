-- Кластер ClickHouse 25.8 и настройки, от которых зависит скорость PA NEXT. Один запрос, только чтение.
-- Запускать в SQL Lab на базе датасетов отчёта (CHaaS, 25.8). Прислать строку результата целиком.
-- *_shards — сколько строк таблицы лежит на каждом шарде: [(номер шарда, строк), …].
SELECT
  version() AS v,
  getSetting('distributed_product_mode') AS dpm,
  getSetting('max_threads') AS max_threads,
  getSetting('use_query_condition_cache') AS condition_cache,
  getSetting('query_plan_optimize_lazy_materialization') AS lazy_mat,
  getSetting('use_query_cache') AS query_cache,
  toString(getSetting('join_algorithm')) AS join_alg,
  (SELECT groupArray((s, c)) FROM (SELECT _shard_num AS s, count() AS c FROM prod_proteus.pa_next_evd_day GROUP BY s ORDER BY s)) AS evd_day_shards,
  (SELECT groupArray((s, c)) FROM (SELECT _shard_num AS s, count() AS c FROM prod_proteus.pa_next_pair GROUP BY s ORDER BY s)) AS pair_shards,
  (SELECT groupArray((s, c)) FROM (SELECT _shard_num AS s, count() AS c FROM prod_proteus.pa_next_dash_meta GROUP BY s ORDER BY s)) AS dash_meta_shards,
  (SELECT groupArray((s, c)) FROM (SELECT _shard_num AS s, count() AS c FROM prod_proteus.pa_next_staffx GROUP BY s ORDER BY s)) AS staffx_shards,
  (SELECT groupArray((s, c)) FROM (SELECT _shard_num AS s, count() AS c FROM prod_proteus.pa_next_cat_rep GROUP BY s ORDER BY s)) AS cat_rep_shards
