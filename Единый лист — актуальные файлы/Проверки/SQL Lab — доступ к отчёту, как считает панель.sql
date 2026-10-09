-- «Есть доступ» в Пути ЦА: та же логика, что в датасете панели (макрос accset), по шагам (2026-10-07).
-- Один запрос, в SQL Lab как есть. Подставлены: отчёт 60260, ЦА — специализация «Бизнес-аналитик BI».
-- Если строки 3 и 4 расходятся, а 5 = 4 — множество IN на бою обрезается (строки 6–8: настройки сервера).
WITH
  dash_ok AS (SELECT m.dashboard_id AS dashboard_id FROM prod_proteus.pa_dash_meta m WHERE m.dashboard_id = 60260),
  ca AS (
    SELECT lower(toString(s.login)) AS lg FROM prod_proteus.pa_staff s
    WHERE toString(ifNull(s.emp_specialization_desc, '')) = 'Бизнес-аналитик BI'
  )
SELECT r.what AS what, r.n AS n FROM (
  SELECT '1. ЦА: людей' AS what, toString(count()) AS n FROM ca
  UNION ALL
  SELECT '2. Логинов в множестве прав (как в панели: поимённо + участники групп)' AS what, toString(count()) AS n FROM (
    SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'user' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)
    UNION ALL
    SELECT m.login FROM prod_proteus.pa_adg_member m
    WHERE m.ad_group IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'group' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)))
  UNION ALL
  SELECT '3. ЦА с доступом — как в панели (lg IN множество)' AS what, toString(count()) AS n FROM ca c
  WHERE c.lg IN (
    SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'user' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)
    UNION ALL
    SELECT m.login FROM prod_proteus.pa_adg_member m
    WHERE m.ad_group IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'group' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)))
  UNION ALL
  SELECT '4. ЦА с доступом — через JOIN (эталон)' AS what, toString(uniqExact(c.lg)) AS n
  FROM ca c
  INNER JOIN (
    SELECT toString(principal) AS lg FROM prod_proteus.pa_dash_acl WHERE kind = 'user' AND dashboard_id = 60260
    UNION ALL
    SELECT toString(m.login) AS lg FROM prod_proteus.pa_adg_member m
    INNER JOIN prod_proteus.pa_dash_acl a ON a.principal = m.ad_group AND a.kind = 'group' AND a.dashboard_id = 60260
  ) x ON x.lg = c.lg
  UNION ALL
  SELECT '5. ЦА с доступом — только через группы (lg IN участники)' AS what, toString(count()) AS n FROM ca c
  WHERE c.lg IN (SELECT toString(m.login) FROM prod_proteus.pa_adg_member m WHERE m.ad_group IN ('tableau-all', 'cross_analytics_dwh'))
  UNION ALL
  SELECT '6. max_rows_in_set' AS what, toString(getSetting('max_rows_in_set')) AS n
  UNION ALL
  SELECT '7. set_overflow_mode' AS what, toString(getSetting('set_overflow_mode')) AS n
  UNION ALL
  SELECT '8. max_bytes_in_set / transform_null_in' AS what,
    concat(toString(getSetting('max_bytes_in_set')), ' / ', toString(getSetting('transform_null_in'))) AS n
) r
ORDER BY toUInt32OrZero(splitByChar('.', r.what)[1])
