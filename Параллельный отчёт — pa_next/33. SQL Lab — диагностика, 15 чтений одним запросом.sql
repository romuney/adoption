-- ДИАГНОСТИКА (SQL Lab, база CHaaS, только чтение): те же 15 чтений ОДНИМ запросом (UNION ALL — ветки параллельно).
-- Сравнить со временем файла 32. Запустить 2 раза, прислать оба времени.
SELECT groupArray(c) AS s FROM (
  SELECT count() + 0 AS c FROM prod_proteus.pa_next_dash_meta
  UNION ALL
  SELECT count() + 1 AS c FROM prod_proteus.pa_next_dash_meta
  UNION ALL
  SELECT count() + 2 AS c FROM prod_proteus.pa_next_dash_meta
  UNION ALL
  SELECT count() + 3 AS c FROM prod_proteus.pa_next_dash_meta
  UNION ALL
  SELECT count() + 4 AS c FROM prod_proteus.pa_next_dash_meta
  UNION ALL
  SELECT count() + 5 AS c FROM prod_proteus.pa_next_dash_meta
  UNION ALL
  SELECT count() + 6 AS c FROM prod_proteus.pa_next_dash_meta
  UNION ALL
  SELECT count() + 7 AS c FROM prod_proteus.pa_next_dash_meta
  UNION ALL
  SELECT count() + 8 AS c FROM prod_proteus.pa_next_dash_meta
  UNION ALL
  SELECT count() + 9 AS c FROM prod_proteus.pa_next_dash_meta
  UNION ALL
  SELECT count() + 10 AS c FROM prod_proteus.pa_next_dash_meta
  UNION ALL
  SELECT count() + 11 AS c FROM prod_proteus.pa_next_dash_meta
  UNION ALL
  SELECT count() + 12 AS c FROM prod_proteus.pa_next_dash_meta
  UNION ALL
  SELECT count() + 13 AS c FROM prod_proteus.pa_next_dash_meta
  UNION ALL
  SELECT count() + 14 AS c FROM prod_proteus.pa_next_dash_meta
)
