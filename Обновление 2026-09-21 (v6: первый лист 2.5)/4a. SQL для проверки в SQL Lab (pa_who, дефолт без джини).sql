WITH
  maxd AS (SELECT max(log_dttm) AS md FROM prod_proteus.pa_evd_day),
  dash_ok AS (
    SELECT dashboard_id, owner_login, owners_string, collection_names
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1 AND published = 1 AND actual_flg = 1
  ),
  evd AS (
    SELECT m.dashboard_id AS did, e.login AS login, toStartOfDay(e.log_dttm) AS dte, sum(e.views) AS v
    FROM prod_proteus.pa_evd_day e
    INNER JOIN dash_ok m ON m.dashboard_id = e.dashboard_id
    WHERE 1=1 AND NOT has(m.owners_string, e.login)
    GROUP BY m.dashboard_id, e.login, toStartOfDay(e.log_dttm)
  ),
  b AS (
    SELECT login,
      uniqExactIf(dte, toInt64(dateDiff('day', toStartOfDay(dte), toStartOfDay((SELECT md FROM maxd)))) < 30) AS days,
      sumIf(v, toInt64(dateDiff('day', toStartOfDay(dte), toStartOfDay((SELECT md FROM maxd)))) < 30) AS views,
      maxIf(dte, toInt64(dateDiff('day', toStartOfDay(dte), toStartOfDay((SELECT md FROM maxd)))) < 30) AS last_dte,
      max(toInt64(dateDiff('day', toStartOfDay(dte), toStartOfDay((SELECT md FROM maxd))))) AS fd_k,
      groupArray(toInt64(dateDiff('day', toStartOfDay(dte), toStartOfDay((SELECT md FROM maxd))))) AS ks_all
    FROM evd GROUP BY login
  ),
  t1 AS (
    SELECT login, toInt64(dateDiff('day', toStartOfDay(dte), toStartOfDay((SELECT md FROM maxd)))) AS k, sum(v) AS v
    FROM evd WHERE toInt64(dateDiff('day', toStartOfDay(dte), toStartOfDay((SELECT md FROM maxd)))) < 30 GROUP BY login, toInt64(dateDiff('day', toStartOfDay(dte), toStartOfDay((SELECT md FROM maxd))))
  )
SELECT
  CAST(section AS String) AS section,
  CAST(g AS Nullable(String)) AS g,
  CAST(k AS Nullable(String)) AS k,
  CAST(parent AS Nullable(String)) AS parent,
  CAST(login AS Nullable(String)) AS login,
  CAST(fio AS Nullable(String)) AS fio,
  CAST(lvl3 AS Nullable(String)) AS lvl3,
  CAST(lvl4 AS Nullable(String)) AS lvl4,
  CAST(spec AS Nullable(String)) AS spec,
  CAST(stream AS Nullable(String)) AS stream,
  CAST(exp AS Nullable(String)) AS exp,
  CAST(is_head AS Nullable(UInt8)) AS is_head,
  CAST(days AS Nullable(UInt32)) AS days,
  CAST(views AS Nullable(Int64)) AS views,
  CAST(last_dt AS Nullable(Date)) AS last_dt,
  CAST(bin AS Nullable(UInt8)) AS bin,
  CAST(users AS Nullable(UInt64)) AS users,
  CAST(new_u AS Nullable(UInt64)) AS new_u,
  CAST(react_u AS Nullable(UInt64)) AS react_u,
  CAST(cnt AS Nullable(UInt64)) AS cnt
FROM (


SELECT 'total' AS section, NULL AS g, NULL AS k, NULL AS parent, NULL AS login, NULL AS fio, NULL AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, NULL AS exp, NULL AS is_head, NULL AS days, NULL AS views, NULL AS last_dt, NULL AS bin, NULL AS users, NULL AS new_u, NULL AS react_u, count() AS cnt
FROM b WHERE days > 0

UNION ALL

SELECT 'freq' AS section, NULL AS g, toString(fb) AS k, NULL AS parent, NULL AS login, NULL AS fio, NULL AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, NULL AS exp, NULL AS is_head, NULL AS days, NULL AS views, NULL AS last_dt, NULL AS bin, NULL AS users, NULL AS new_u, NULL AS react_u, count() AS cnt
FROM (SELECT multiIf(days = 1, toUInt8(1), days <= 3, toUInt8(2), days <= 7, toUInt8(3), days <= 15, toUInt8(4), toUInt8(5)) AS fb FROM b WHERE days > 0) GROUP BY fb

UNION ALL

SELECT 'ts' AS section, NULL AS g, toString(t1.k) AS bk, NULL AS parent, NULL AS login, NULL AS fio, NULL AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, NULL AS exp, NULL AS is_head, NULL AS days,
  sum(t1.v) AS views, NULL AS last_dt, NULL AS bin,
  count() AS users, countIf(b.fd_k = t1.k) AS new_u,
  countIf(t1.k != b.fd_k AND
    arrayCount(j -> j > t1.k AND j <= t1.k + 7, b.ks_all) = 0) AS react_u, NULL AS cnt
FROM t1 INNER JOIN b USING (login)
GROUP BY bk

UNION ALL

SELECT 'ctx' AS section, 'lvl3' AS g, a.lvl3_management_unit_nm AS k, NULL AS parent, NULL AS login, NULL AS fio, NULL AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, NULL AS exp, NULL AS is_head, NULL AS days, NULL AS views, NULL AS last_dt, NULL AS bin, NULL AS users, NULL AS new_u, NULL AS react_u, count() AS cnt
FROM b INNER JOIN prod_proteus.pa_emp_attrs a USING (login)
WHERE b.days > 0 AND a.lvl3_management_unit_nm != '' GROUP BY k

UNION ALL

SELECT 'ctx' AS section, 'lvl4' AS g, a.lvl4_management_unit_nm AS k, NULL AS parent, NULL AS login, NULL AS fio, NULL AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, NULL AS exp, NULL AS is_head, NULL AS days, NULL AS views, NULL AS last_dt, NULL AS bin, NULL AS users, NULL AS new_u, NULL AS react_u, count() AS cnt
FROM b INNER JOIN prod_proteus.pa_emp_attrs a USING (login)
WHERE b.days > 0 AND a.lvl4_management_unit_nm != '' GROUP BY k

UNION ALL

SELECT 'ctx' AS section, 'spec' AS g, a.emp_specialization_desc AS k, NULL AS parent, NULL AS login, NULL AS fio, NULL AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, NULL AS exp, NULL AS is_head, NULL AS days, NULL AS views, NULL AS last_dt, NULL AS bin, NULL AS users, NULL AS new_u, NULL AS react_u, count() AS cnt
FROM b INNER JOIN prod_proteus.pa_emp_attrs a USING (login)
WHERE b.days > 0 AND a.emp_specialization_desc != '' GROUP BY k

UNION ALL

SELECT 'ctx' AS section, 'stream' AS g, a.emp_stream_desc AS k, NULL AS parent, NULL AS login, NULL AS fio, NULL AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, NULL AS exp, NULL AS is_head, NULL AS days, NULL AS views, NULL AS last_dt, NULL AS bin, NULL AS users, NULL AS new_u, NULL AS react_u, count() AS cnt
FROM b INNER JOIN prod_proteus.pa_emp_attrs a USING (login)
WHERE b.days > 0 AND a.emp_stream_desc != '' GROUP BY k

UNION ALL

SELECT 'ctx' AS section, 'head' AS g, '1' AS k, NULL AS parent, NULL AS login, NULL AS fio, NULL AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, NULL AS exp, NULL AS is_head, NULL AS days, NULL AS views, NULL AS last_dt, NULL AS bin, NULL AS users, NULL AS new_u, NULL AS react_u, count() AS cnt
FROM b INNER JOIN prod_proteus.pa_emp_attrs a USING (login)
WHERE b.days > 0 AND a.management_head_flg = 1

UNION ALL

SELECT 'ctx' AS section, 'dep' AS g, a.lvl4_management_unit_nm AS k, a.lvl3_management_unit_nm AS parent, NULL AS login, NULL AS fio, NULL AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, NULL AS exp, NULL AS is_head, NULL AS days, NULL AS views, NULL AS last_dt, NULL AS bin, NULL AS users, NULL AS new_u, NULL AS react_u, count() AS cnt
FROM b INNER JOIN prod_proteus.pa_emp_attrs a USING (login)
WHERE b.days > 0 AND a.lvl4_management_unit_nm != '' AND a.lvl3_management_unit_nm != ''
GROUP BY k, parent

UNION ALL

SELECT * FROM (
  SELECT 'ctx' AS section, 'adg' AS g, ad AS k, NULL AS parent, NULL AS login, NULL AS fio, NULL AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, NULL AS exp, NULL AS is_head, NULL AS days, NULL AS views, NULL AS last_dt, NULL AS bin, NULL AS users, NULL AS new_u, NULL AS react_u, count() AS cnt
  FROM b INNER JOIN prod_proteus.pa_emp_attrs a USING (login)
  ARRAY JOIN a.ad_groups AS ad
  WHERE b.days > 0 AND ad != ''
  GROUP BY k ORDER BY cnt DESC LIMIT 100
)

UNION ALL

SELECT * FROM (
  SELECT 'list' AS section, NULL AS g, NULL AS k, NULL AS parent, b.login AS login, '' AS fio,
    a.lvl3_management_unit_nm AS lvl3, a.lvl4_management_unit_nm AS lvl4,
    a.emp_specialization_desc AS spec, a.emp_stream_desc AS stream,
    '' AS exp,
    toUInt8(a.management_head_flg) AS is_head,
    b.days AS days, b.views AS views, toDate(b.last_dte) AS last_dt,
    multiIf(days = 1, toUInt8(1), days <= 3, toUInt8(2), days <= 7, toUInt8(3), days <= 15, toUInt8(4), toUInt8(5)) AS bin, NULL AS users, NULL AS new_u, NULL AS react_u, NULL AS cnt
  FROM b INNER JOIN prod_proteus.pa_emp_attrs a USING (login)
  WHERE b.days > 0
  ORDER BY b.days DESC, b.views DESC, b.login LIMIT 2000
)

)
