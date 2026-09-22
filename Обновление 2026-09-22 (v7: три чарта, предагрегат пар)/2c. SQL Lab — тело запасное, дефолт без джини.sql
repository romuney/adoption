-- SQL Lab: тело v7 запасное (файл 2b), 30 дней, свитки по умолчанию. Только для проверки — в датасет НЕ вставлять.
-- Замер — первый прогон уникального текста; повтор: поменяйте цифру в строке ниже.
-- 3
WITH
  maxd AS (SELECT max(log_dttm) AS md FROM prod_proteus.pa_evd_day),
  dash_ok AS (
    SELECT dashboard_id, owners_string
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1 AND published = 1 AND actual_flg = 1
  ),
  evd AS (SELECT e.dashboard_id AS did, e.login AS login,
      groupBitOr(if(toInt64(dateDiff('day', toStartOfDay(e.log_dttm), toStartOfDay((SELECT md FROM maxd)))) < 60, toUInt64(bitShiftLeft(toUInt64(1), toUInt8(toInt64(dateDiff('day', toStartOfDay(e.log_dttm), toStartOfDay((SELECT md FROM maxd))))))), toUInt64(0))) AS msk,
      sumIf(e.views, toInt64(dateDiff('day', toStartOfDay(e.log_dttm), toStartOfDay((SELECT md FROM maxd)))) < 30) AS v_cur,
      sum(e.views) AS v_life,
      max(e.log_dttm) AS dmax
    FROM prod_proteus.pa_evd_day e
    INNER JOIN dash_ok m ON m.dashboard_id = e.dashboard_id
    WHERE 1=1 AND NOT has(m.owners_string, e.login)
    GROUP BY e.dashboard_id, e.login
  ),
  kx AS (SELECT kd, k0, login,
      groupBitOr(msk) AS msk, sum(v_cur) AS v_cur, sum(v_life) AS v_life, max(dmax) AS dmax
    FROM (
      SELECT arrayJoin(arrayConcat(
          [(toUInt8(0), '')],
          [(toUInt8(1), toString(p.did))],
          arrayFilter(t -> t.2 != '', [(toUInt8(2), toString(ifNull(mm.owner_login, '')))]),
          arrayMap(c -> (toUInt8(3), toString(ifNull(c, ''))), arrayFilter(c -> isNotNull(c) AND c != '', mm.collection_names))
        )) AS kk, kk.1 AS kd, kk.2 AS k0,
        p.login AS login, p.msk AS msk, p.v_cur AS v_cur, p.v_life AS v_life, p.dmax AS dmax
      FROM evd p
      INNER JOIN prod_proteus.pa_dash_meta mm ON mm.dashboard_id = p.did
    )
    GROUP BY kd, k0, login
  ),
  agg AS (
    SELECT kd, k0,
      countIf(bitAnd(msk, 1073741823) != 0) AS users,
      sum(v_cur) AS views,
      countIf(bitCount(bitAnd(msk, 1073741823)) >= 8) AS regular_users,
      dateDiff('day', toStartOfDay(max(dmax)), toStartOfDay((SELECT md FROM maxd))) AS last_view_days,
      sum(v_life) AS v_tot
    FROM kx GROUP BY kd, k0
  )
SELECT
  CAST(CASE WHEN kd = 0 THEN 'total' WHEN kd = 1 THEN 'rep' ELSE 'grp' END AS String) AS section,
  CAST('d' AS String) AS grain,
  CAST(if(kd = 1, toInt32OrNull(k0), NULL) AS Nullable(Int32)) AS dashboard_id,
  CAST(CASE kd WHEN 2 THEN 'owner' WHEN 3 THEN 'collection' ELSE NULL END AS Nullable(String)) AS group_key,
  CAST(if(kd BETWEEN 2 AND 3, k0, NULL) AS Nullable(String)) AS group_val,
  CAST(if(kd = 1, m.dashboard_nm, NULL) AS Nullable(String)) AS dash_nm,
  CAST(if(kd = 1, m.owner_login, NULL) AS Nullable(String)) AS owner_login,
  CAST(if(kd = 1, m.collection_names, CAST([], 'Array(String)')) AS Array(String)) AS colls,
  CAST(if(kd = 1, m.published, NULL) AS Nullable(Int32)) AS published,
  CAST(if(kd = 1, m.certified_by, NULL) AS Nullable(String)) AS certified,
  CAST(if(kd = 1, m.created_dt, NULL) AS Nullable(DateTime)) AS created_dt,
  CAST(ifNull(users, 0) AS UInt64) AS users,
  CAST(ifNull(views, 0) AS Int64) AS views,
  CAST(ifNull(regular_users, 0) AS UInt64) AS regular_users,
  CAST(ifNull(last_view_days, 0) AS Int64) AS last_view_days,
  CAST(if(kd = 0, '{"period":"d"}', NULL) AS Nullable(String)) AS state_j
FROM agg
LEFT JOIN prod_proteus.pa_dash_meta m ON m.dashboard_id = ifNull(toInt32OrNull(k0), toInt32(0))
WHERE kd != 1 OR v_tot >= 500
