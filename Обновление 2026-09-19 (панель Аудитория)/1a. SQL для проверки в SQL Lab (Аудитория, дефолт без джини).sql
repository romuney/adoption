

























-- pa_aud — аудитория области для чарта pa_audience (виджет Виджеты/pa-audience.chart.js).
-- Лёгкий запрос поверх предагрегатов pa_evd_day / pa_emp_attrs / pa_dash_meta:
-- зрители области (sel-маска тела: report | owner | collection | cut:lvl3/lvl4/spec/stream/head),
-- разложенные по людям-разрезам; при людской области — топ-отчёты аудитории.
-- Ответ: секция kpi (1 строка) + cut-секции lvl3/lvl4/spec/stream/adg(топ-40)/heads/report(топ-25, только cut-область).
WITH
  maxd AS (SELECT max(log_dttm) AS md FROM prod_proteus.pa_evd_day),
  dash_ok AS (
    SELECT dashboard_id, owner_login, owners_string, collection_names
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1 AND published = 1 AND actual_flg = 1
  ),
  aud AS (
    SELECT e.dashboard_id AS did, e.login AS login, e.views AS v,
      toInt64(dateDiff('day', toStartOfDay(toStartOfDay(e.log_dttm)), toStartOfDay((SELECT md FROM maxd)))) AS k
    FROM prod_proteus.pa_evd_day e
    INNER JOIN dash_ok m ON m.dashboard_id = e.dashboard_id
    WHERE 1=1 AND NOT has(m.owners_string, e.login)
  ),
  ppl AS (
    SELECT login,
      countIf(k < 30) AS days_cur,
      countIf(k >= 30 AND k < 60) AS days_prev,
      sumIf(v, k < 30) AS v_cur,
      sumIf(v, k >= 30 AND k < 60) AS v_prev,
      min(k) AS fd_k
    FROM aud GROUP BY login
  )
SELECT
  CAST(section AS String) AS section,
  CAST(cut_key AS Nullable(String)) AS cut_key,
  CAST(cut_val AS Nullable(String)) AS cut_val,
  CAST(parent AS Nullable(String)) AS parent,
  CAST(nm AS Nullable(String)) AS nm,
  CAST(ifNull(users, 0) AS UInt64) AS users,
  CAST(ifNull(users_prev, 0) AS UInt64) AS users_prev,
  CAST(ifNull(views, 0) AS Int64) AS views,
  CAST(ifNull(views_prev, 0) AS Int64) AS views_prev,
  CAST(ifNull(new_users, 0) AS UInt64) AS new_users,
  CAST(ifNull(regular_users, 0) AS UInt64) AS regular_users,
  CAST(ifNull(once_users, 0) AS UInt64) AS once_users
FROM (
  SELECT 'kpi' AS section, '' AS cut_key, '' AS cut_val, '' AS parent,
    '' AS nm,
    countIf(days_cur > 0) AS users, countIf(days_prev > 0) AS users_prev, sumIf(v_cur, days_cur > 0) AS views, sumIf(v_prev, days_prev > 0) AS views_prev, countIf(days_cur > 0 AND fd_k < 30) AS new_users, countIf(days_cur >= 8) AS regular_users, countIf(days_cur = 1) AS once_users
  FROM ppl

  UNION ALL

  SELECT 'cut' AS section, 'lvl3' AS cut_key, a.lvl3_management_unit_nm AS cut_val,
    '' AS parent, a.lvl3_management_unit_nm AS nm, countIf(days_cur > 0) AS users, countIf(days_prev > 0) AS users_prev, sumIf(v_cur, days_cur > 0) AS views, sumIf(v_prev, days_prev > 0) AS views_prev, countIf(days_cur > 0 AND fd_k < 30) AS new_users, countIf(days_cur >= 8) AS regular_users, countIf(days_cur = 1) AS once_users
  FROM ppl p INNER JOIN prod_proteus.pa_emp_attrs a ON a.login = p.login
  WHERE a.lvl3_management_unit_nm != ''
  GROUP BY a.lvl3_management_unit_nm

  UNION ALL

  SELECT 'cut', 'lvl4', a.lvl4_management_unit_nm, a.lvl3_management_unit_nm, a.lvl4_management_unit_nm, countIf(days_cur > 0) AS users, countIf(days_prev > 0) AS users_prev, sumIf(v_cur, days_cur > 0) AS views, sumIf(v_prev, days_prev > 0) AS views_prev, countIf(days_cur > 0 AND fd_k < 30) AS new_users, countIf(days_cur >= 8) AS regular_users, countIf(days_cur = 1) AS once_users
  FROM ppl p INNER JOIN prod_proteus.pa_emp_attrs a ON a.login = p.login
  WHERE a.lvl4_management_unit_nm != ''
  GROUP BY a.lvl3_management_unit_nm, a.lvl4_management_unit_nm

  UNION ALL

  SELECT 'cut', 'spec', a.emp_specialization_desc, '', a.emp_specialization_desc, countIf(days_cur > 0) AS users, countIf(days_prev > 0) AS users_prev, sumIf(v_cur, days_cur > 0) AS views, sumIf(v_prev, days_prev > 0) AS views_prev, countIf(days_cur > 0 AND fd_k < 30) AS new_users, countIf(days_cur >= 8) AS regular_users, countIf(days_cur = 1) AS once_users
  FROM ppl p INNER JOIN prod_proteus.pa_emp_attrs a ON a.login = p.login
  WHERE a.emp_specialization_desc != ''
  GROUP BY a.emp_specialization_desc

  UNION ALL

  SELECT 'cut', 'stream', a.emp_stream_desc, '', a.emp_stream_desc, countIf(days_cur > 0) AS users, countIf(days_prev > 0) AS users_prev, sumIf(v_cur, days_cur > 0) AS views, sumIf(v_prev, days_prev > 0) AS views_prev, countIf(days_cur > 0 AND fd_k < 30) AS new_users, countIf(days_cur >= 8) AS regular_users, countIf(days_cur = 1) AS once_users
  FROM ppl p INNER JOIN prod_proteus.pa_emp_attrs a ON a.login = p.login
  WHERE a.emp_stream_desc != ''
  GROUP BY a.emp_stream_desc

  UNION ALL

  SELECT * FROM (
    SELECT 'cut' AS section, 'adg' AS cut_key, t.ad_group AS cut_val,
      '' AS parent, t.ad_group AS nm,
      countIf(t.days_cur > 0) AS users, countIf(t.days_prev > 0) AS users_prev,
      sumIf(t.v_cur, t.days_cur > 0) AS views, sumIf(t.v_prev, t.days_prev > 0) AS views_prev,
      countIf(t.days_cur > 0 AND t.fd_k < 30) AS new_users,
      countIf(t.days_cur >= 8) AS regular_users, countIf(t.days_cur = 1) AS once_users
    FROM (
      SELECT arrayJoin(a.ad_groups) AS ad_group,
        p.days_cur AS days_cur, p.days_prev AS days_prev,
        p.v_cur AS v_cur, p.v_prev AS v_prev, p.fd_k AS fd_k
      FROM ppl p INNER JOIN prod_proteus.pa_emp_attrs a ON a.login = p.login
    ) t
    GROUP BY t.ad_group
    HAVING users > 0
    ORDER BY users DESC
    LIMIT 40
  )

  UNION ALL

  SELECT 'cut', 'heads', if(a.management_head_flg = 1, 'Тим-лиды', 'Остальные'), '', if(a.management_head_flg = 1, 'Тим-лиды', 'Остальные'), countIf(days_cur > 0) AS users, countIf(days_prev > 0) AS users_prev, sumIf(v_cur, days_cur > 0) AS views, sumIf(v_prev, days_prev > 0) AS views_prev, countIf(days_cur > 0 AND fd_k < 30) AS new_users, countIf(days_cur >= 8) AS regular_users, countIf(days_cur = 1) AS once_users
  FROM ppl p INNER JOIN prod_proteus.pa_emp_attrs a ON a.login = p.login
  GROUP BY if(a.management_head_flg = 1, 'Тим-лиды', 'Остальные')

)