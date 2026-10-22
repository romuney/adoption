-- SQL Lab: pa_strip (файл 4), без выбора. Только для проверки — в датасет НЕ вставлять.
-- 5
SELECT
  CAST('d' AS String) AS grain,
  CAST('' AS String) AS area_nm,
  CAST('' AS String) AS ppl_nm,CAST(concat('{"period":"d"', ', "md":"', ifNull(toString(toDate((SELECT md FROM prod_proteus.pa_pair WHERE isNotNull(md) LIMIT 1))), ''), '"}') AS String) AS state_j
