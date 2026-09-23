-- SQL Lab: pa_kpi (файл 4), 30 дней, без выбора. Только для проверки — в датасет НЕ вставлять.
-- Замер — первый прогон уникального текста; повтор: поменяйте цифру в строке ниже.
-- 3
WITH
  
  maxd AS (SELECT max(ifNull(md, dmax)) AS md FROM prod_proteus.pa_pair),
  dash_ok AS (
    SELECT dashboard_id
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1 AND published = 1 AND actual_flg = 1
  ),
  pl AS (SELECT toString(ifNull(e.login, '')) AS login,
      groupBitOr(toUInt64(ifNull(e.msk_d, 0))) AS msk,
      sum(ifNull(e.v_d, 0)) AS v_cur,
      sum(ifNull(e.vp_d, 0)) AS v_prev,
      max(ifNull(e.kmax_d, 0)) AS fd_k,
      groupBitOr(toUInt64(ifNull(e.msk_mon, 0))) AS mon
    FROM prod_proteus.pa_pair e
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(e.login) AND ifNull(e.own_flg, 0) = 0
    GROUP BY e.login
  )
SELECT
  CAST('d' AS String) AS grain,
  CAST(countIf(bitAnd(msk, 1073741823) != 0) AS UInt64) AS users,
  CAST(countIf(bitAnd(msk, 1152921503533105152) != 0) AS UInt64) AS users_prev,
  CAST(ifNull(sum(v_cur), 0) AS Int64) AS views,
  CAST(ifNull(sum(v_prev), 0) AS Int64) AS views_prev,
  CAST(countIf(bitAnd(msk, 1073741823) != 0 AND fd_k < 30) AS UInt64) AS new_u,
  CAST(countIf(bitAnd(msk, 1152921503533105152) != 0 AND fd_k >= 30 AND fd_k < 60) AS UInt64) AS new_prev,
  CAST(countIf(bitCount(bitAnd(msk, 1073741823)) >= 8) AS UInt64) AS regular,
  CAST(countIf(bitCount(bitAnd(msk, 1152921503533105152)) >= 8) AS UInt64) AS regular_prev,
  CAST(countIf(bitAnd(msk, 1152921503533105152) != 0 AND bitAnd(msk, 1073741823) = 0) AS UInt64) AS sleeping,
  CAST(countIf(bitTest(mon, 1)) AS UInt64) AS mau,
  CAST(countIf(bitTest(mon, 2)) AS UInt64) AS mau_prev,
  CAST('' AS String) AS area_nm,
  CAST('' AS String) AS ppl_nm,
  CAST('{"period":"d"}' AS String) AS state_j
FROM pl
