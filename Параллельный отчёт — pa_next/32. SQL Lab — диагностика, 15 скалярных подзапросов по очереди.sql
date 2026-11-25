-- ДИАГНОСТИКА (SQL Lab, база CHaaS, только чтение): сколько стоят 15 скалярных подзапросов ПО ОЧЕРЕДИ.
-- Каждый — отдельный поход на все шарды (как множества в SQL панели). Запустить 2 раза, прислать оба времени.
SELECT
  (SELECT count() + 0 FROM prod_proteus.pa_next_dash_meta) AS s0,
  (SELECT count() + 1 FROM prod_proteus.pa_next_dash_meta) AS s1,
  (SELECT count() + 2 FROM prod_proteus.pa_next_dash_meta) AS s2,
  (SELECT count() + 3 FROM prod_proteus.pa_next_dash_meta) AS s3,
  (SELECT count() + 4 FROM prod_proteus.pa_next_dash_meta) AS s4,
  (SELECT count() + 5 FROM prod_proteus.pa_next_dash_meta) AS s5,
  (SELECT count() + 6 FROM prod_proteus.pa_next_dash_meta) AS s6,
  (SELECT count() + 7 FROM prod_proteus.pa_next_dash_meta) AS s7,
  (SELECT count() + 8 FROM prod_proteus.pa_next_dash_meta) AS s8,
  (SELECT count() + 9 FROM prod_proteus.pa_next_dash_meta) AS s9,
  (SELECT count() + 10 FROM prod_proteus.pa_next_dash_meta) AS s10,
  (SELECT count() + 11 FROM prod_proteus.pa_next_dash_meta) AS s11,
  (SELECT count() + 12 FROM prod_proteus.pa_next_dash_meta) AS s12,
  (SELECT count() + 13 FROM prod_proteus.pa_next_dash_meta) AS s13,
  (SELECT count() + 14 FROM prod_proteus.pa_next_dash_meta) AS s14
