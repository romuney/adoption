-- 1
-- Каталог единого листа (pa_body_one) — дефолт, ЦА по правам.
-- Рендер без джини (для SQL Lab, база CROSS). Цифру в первой строке меняйте для повторного замера: SQL Lab кэширует результат.
WITH
  maxd AS (SELECT max(ifNull(md, dmax)) AS md FROM prod_proteus.pa_pair),
  dash_ok AS (
    SELECT dashboard_id
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1 AND published = 1 AND actual_flg = 1
  ),
  evd AS (SELECT toInt32(ifNull(e.dashboard_id, 0)) AS did, toString(ifNull(e.login, '')) AS login,toUInt64(ifNull(e.msk_d, 0)) AS msk, ifNull(e.v_d, 0) AS v_cur, e.dmax AS dmax,toUInt64(ifNull(e.msk_d, 0)) AS pd, toUInt64(ifNull(e.msk_w, 0)) AS pw, toUInt64(ifNull(e.msk_m, 0)) AS pm
    FROM prod_proteus.pa_pair e
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(e.login) AND ifNull(e.own_flg, 0) = 0
  ),
  kx AS (SELECT kd, k0, login,
      groupBitOr(m0) AS msk, sum(v_cur) AS v_cur, max(dmax) AS dmax
    FROM (
      SELECT arrayJoin(arrayConcat(
          [(toUInt8(0), '')],
          arrayFilter(t -> t.2 != '', [(toUInt8(2), toString(ifNull(mm.owner_login, '')))]),
          arrayMap(c -> (toUInt8(3), toString(ifNull(c, ''))), arrayFilter(c -> isNotNull(c) AND c != '', mm.collection_names))
        )) AS kk, kk.1 AS kd, kk.2 AS k0,
        p.login AS login, p.msk AS m0, p.v_cur AS v_cur, p.dmax AS dmax
      FROM evd p
      INNER JOIN prod_proteus.pa_dash_meta mm ON mm.dashboard_id = p.did
    )
    GROUP BY kd, k0, login
  ),
  agg AS (
    SELECT kd, k0, countIf(bitAnd(msk, 1073741823) != 0) AS users, sum(v_cur) AS views,
      countIf(bitCount(bitAnd(msk, 1073741823)) >= 6) AS regular_users,
      dateDiff('day', toStartOfDay(max(dmax)), toStartOfDay((SELECT md FROM maxd))) AS last_view_days, '' AS rhythm, toUInt64(0) AS ca_u
    FROM kx GROUP BY kd, k0
    UNION ALL
    SELECT toUInt8(1) AS kd, toString(did) AS k0, countIf(bitAnd(msk, 1073741823) != 0) AS users, sum(v_cur) AS views,
      countIf(bitCount(bitAnd(msk, 1073741823)) >= 6) AS regular_users,
      dateDiff('day', toStartOfDay(max(dmax)), toStartOfDay((SELECT md FROM maxd))) AS last_view_days,arrayStringConcat([toString(countIf(multiIf(bitCount(bitAnd(pd, 1073741823)) >= 12, 4, bitCount(bitAnd(pw, 255)) >= 6, 3, bitCount(bitAnd(pm, 7)) >= 2, 2, bitAnd(pm, 7) != 0, 1, 0) = 4)), toString(countIf(multiIf(bitCount(bitAnd(pd, 1073741823)) >= 12, 4, bitCount(bitAnd(pw, 255)) >= 6, 3, bitCount(bitAnd(pm, 7)) >= 2, 2, bitAnd(pm, 7) != 0, 1, 0) = 3)), toString(countIf(multiIf(bitCount(bitAnd(pd, 1073741823)) >= 12, 4, bitCount(bitAnd(pw, 255)) >= 6, 3, bitCount(bitAnd(pm, 7)) >= 2, 2, bitAnd(pm, 7) != 0, 1, 0) = 2)), toString(countIf(multiIf(bitCount(bitAnd(pd, 1073741823)) >= 12, 4, bitCount(bitAnd(pw, 255)) >= 6, 3, bitCount(bitAnd(pm, 7)) >= 2, 2, bitAnd(pm, 7) != 0, 1, 0) = 1))], ',') AS rhythm,countIf(bitAnd(msk, 1073741823) != 0 AND acc = 1) AS ca_u
    FROM (
      SELECT did, msk, v_cur, dmax, pd, pw, pm,toUInt8((did, lower(login)) IN (SELECT toInt32(ifNull(dashboard_id, 0)), toString(ifNull(login, '')) FROM prod_proteus.pa_pair_acc)) AS acc
      FROM evd
    )
    GROUP BY did
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
  CAST(if(kd = 1, rhythm, NULL) AS Nullable(String)) AS rhythm,
  CAST(if(kd = 0, '{"period":"d", "flt":{}}', NULL) AS Nullable(String)) AS state_j,CAST(if(kd = 1, c.ca_n, NULL) AS Nullable(Int64)) AS ca_n,
  CAST(if(kd = 1, c.ca_wide, NULL) AS Nullable(UInt8)) AS ca_wide,
  CAST(if(kd = 1, ca_u, NULL) AS Nullable(UInt64)) AS ca_users
FROM agg
LEFT JOIN prod_proteus.pa_dash_meta m ON m.dashboard_id = ifNull(toInt32OrNull(k0), toInt32(0))
LEFT JOIN prod_proteus.pa_dash_ca c ON c.dashboard_id = ifNull(toInt32OrNull(k0), toInt32(0))
