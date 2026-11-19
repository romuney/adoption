WITH
  maxd AS (SELECT max(log_dttm) AS md FROM prod_proteus.proteus_adoption),
  cpl AS (
    SELECT login,
      toStartOfMonth(min(log_dttm)) AS c0,
      toInt64(dateDiff('month', toStartOfMonth(min(log_dttm)), toStartOfMonth((SELECT md FROM maxd)))) AS gm,
      groupUniqArray(toInt64(dateDiff('month', toStartOfMonth(log_dttm), toStartOfMonth((SELECT md FROM maxd))))) AS bms
    FROM prod_proteus.proteus_adoption
    WHERE dashboard_id != 13040 AND login != 'svc_mon_otpp' AND published = 1 AND actual_flg = 1 AND NOT has(owners_string, login) 
    GROUP BY login
  ),
  ca AS (
    SELECT c0,
      arrayFilter(x -> x >= 1 AND x <= 11, arrayMap(y -> gm - y, bms)) AS ags
    FROM cpl WHERE gm < 12
  )
SELECT
  CAST(section AS String) AS section,
  CAST(sel_key AS String) AS sel_key,
  CAST(sel_val AS String) AS sel_val,
  CAST(sel_nm AS String) AS sel_nm,
  CAST(cohort_month AS Date) AS cohort_month,
  CAST(cohort_size AS UInt64) AS cohort_size,
  CAST(ages AS Array(Int64)) AS ages,
  CAST(acts AS Array(UInt64)) AS acts
FROM (
  SELECT section, sel_key, sel_val, sel_nm, cohort_month, cohort_size,
    (m).1 AS ages, (m).2 AS acts
  FROM (
    SELECT 'coh' AS section, '' AS sel_key, '' AS sel_val,
      'Proteus' AS sel_nm,
      c0 AS cohort_month, count() AS cohort_size,
      sumMap(ags, arrayMap(x -> toUInt64(1), ags)) AS m
    FROM ca GROUP BY c0
  )
)
