-- SQL Lab: pa_people (файл 3), 30 дней, без выбора в каталоге. Только для проверки — в датасет НЕ вставлять.
-- Замер — первый прогон уникального текста; повтор: поменяйте цифру в строке ниже.
-- 6
WITH
  maxd AS (SELECT max(ifNull(md, dmax)) AS md FROM prod_proteus.pa_pair),
  dash_ok AS (
    SELECT dashboard_id
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1 AND published = 1 AND actual_flg = 1
  ),
  evd AS (SELECT toString(ifNull(e.login, '')) AS login,
      groupBitOr(toUInt64(ifNull(e.msk_d, 0))) AS msk,
      sum(ifNull(e.v_d, 0)) AS v_cur,
      sum(ifNull(e.vp_d, 0)) AS v_prev,
      max(ifNull(e.kmax_d, 0)) AS fd_k,
      max(e.dmax) AS dmax,
      groupBitOr(toUInt64(ifNull(e.msk_mon, 0))) AS mon
    FROM prod_proteus.pa_pair e
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(e.login) AND ifNull(e.own_flg, 0) = 0
    GROUP BY e.login
  ),
  pr AS (SELECT p.login AS login, p.msk AS msk, bitCount(bitAnd(p.msk, 1073741823)) AS days, p.v_cur AS v_cur, p.v_prev AS v_prev,
      p.fd_k AS fd_k, p.dmax AS dmax, toUInt8(bitTest(p.mon, 1)) AS m1, toUInt8(bitTest(p.mon, 2)) AS m2,arrayMap(i -> toInt64(i), arrayFilter(i -> bitTest(p.mon, i), range(63))) AS bms,
      if(empty(bms), toInt64(0), arrayMax(bms)) AS gm,
      addMonths(toStartOfMonth((SELECT md FROM maxd)), -toInt32(gm)) AS c0,
      bitAnd(p.msk, 1073741823) != 0 AS cur, bitAnd(p.msk, 1152921503533105152) != 0 AS prv,
      bitCount(bitAnd(p.msk, 1073741823)) AS nb_cur, bitCount(bitAnd(p.msk, 1152921503533105152)) AS nb_prev,
      multiIf(nb_cur <= 1, 1, nb_cur <= 3, 2, nb_cur <= 7, 3, nb_cur <= 15, 4, 5) AS bin,
      toString(ifNull(a.lvl3_management_unit_nm, '')) AS lvl3, toString(ifNull(a.lvl4_management_unit_nm, '')) AS lvl4,[lvl3, lvl4, toString(ifNull(a.lvl5_management_unit_nm, '')), toString(ifNull(a.lvl6_management_unit_nm, '')), toString(ifNull(a.lvl7_management_unit_nm, ''))] AS lv,if(arrayFirstIndex(x -> x = '', lv) = 0, toUInt32(length(lv)), toUInt32(arrayFirstIndex(x -> x = '', lv) - 1)) AS ol,
      arrayStringConcat(arraySlice(lv, 1, ol), ' › ') AS opath,
      toString(ifNull(a.emp_specialization_desc, '')) AS spec, toString(ifNull(a.emp_stream_desc, '')) AS stream,
      toUInt8(ifNull(a.management_head_flg, 0) = 1) AS is_head,
      toString(ifNull(a.fio, '')) AS fio, toString(ifNull(a.exp_nm, '')) AS exp,
      arrayFilter(x -> x >= 1 AND x <= 11, arrayMap(y -> gm - y, bms)) AS ags,
      arrayJoin(arrayConcat(
        [('total', '', '', '', toInt64(-1))],
        if(cur, [('freq', '', toString(bin), '', toInt64(-1))], []),
        if(cur OR prv, arrayMap(i -> ('ctx', 'org', arrayStringConcat(arraySlice(lv, 1, i), ' › '), arrayStringConcat(arraySlice(lv, 1, toUInt32(i - 1)), ' › '), toInt64(-1)), range(1, ol + 1)), []),
        if((cur OR prv) AND spec != '', [('ctx', 'spec', spec, '', toInt64(-1))], []),
        if((cur OR prv) AND stream != '', [('ctx', 'stream', stream, '', toInt64(-1))], []),
        if((cur OR prv) AND is_head = 1, [('ctx', 'head', '1', '', toInt64(-1))], []),
        if(cur, [('list', '', toString(p.login), opath, toInt64(-1))], []),
        if(gm < 12, [('coh', '', toString(c0), '', toInt64(-1))], []),if(cur, arrayMap(t -> ('ts', '', toString(t), '', toInt64(t)), arrayFilter(t -> bitTest(p.msk, t), range(30))), [])
      )) AS rk
    FROM evd p
    LEFT JOIN prod_proteus.pa_emp_attrs a ON a.login = p.login
  ),
  agg AS (
    SELECT rk.1 AS role, rk.2 AS g, rk.3 AS k, rk.4 AS parent,
      countIf(cur) AS users, countIf(prv) AS users_prev,
      sum(if(rk.1 = 'ts', 0, v_cur)) AS views, any(rk.5) AS tk,
      sum(v_prev) AS views_prev,
      countIf(if(rk.1 = 'ts', rk.5 = fd_k, cur AND fd_k < 30)) AS new_u,
      countIf(prv AND fd_k >= 30 AND fd_k < 60) AS new_prev,
      countIf(rk.1 = 'ts' AND rk.5 != fd_k AND bitAnd(msk, toUInt64(bitShiftLeft(toUInt64(127), toUInt8(rk.5 + 1)))) = 0) AS react_u,
      countIf(nb_cur >= 8) AS regular, countIf(nb_prev >= 8) AS regular_prev,
      countIf(prv AND NOT cur) AS sleeping,
      countIf(m1 = 1) AS mau, countIf(m2 = 1) AS mau_prev,
      count() AS cnt,
      sumMap(if(rk.1 = 'coh', ags, CAST([], 'Array(Int64)')), if(rk.1 = 'coh', arrayMap(x -> toUInt64(1), ags), CAST([], 'Array(UInt64)'))) AS am,
      any(login) AS login, any(fio) AS fio, any(lvl3) AS lvl3, any(lvl4) AS lvl4, any(spec) AS spec,
      any(stream) AS stream, any(exp) AS exp, any(is_head) AS is_head, any(days) AS days,
      any(toDate(dmax)) AS last_dt, any(bin) AS bin
    FROM pr
    GROUP BY role, g, k, parent
  ),
  bv AS (
    SELECT toInt64(k) AS bk, sum(views_nown) AS bviews
    FROM prod_proteus.pa_dash_bkt
    WHERE grain = 'd' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)
    GROUP BY bk
  ),
  rnk AS (
    SELECT *,
      row_number() OVER (PARTITION BY role, g ORDER BY if(role = 'list', days, users) DESC, views DESC, k) AS rn
    FROM agg
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
  CAST(last_dt AS Nullable(Date)) AS last_dt,
  CAST(bin AS Nullable(UInt8)) AS bin,
  CAST(ifNull(users, 0) AS UInt64) AS users,
  CAST(ifNull(users_prev, 0) AS UInt64) AS users_prev,
  CAST(ifNull(views, 0) AS Int64) AS views,
  CAST(ifNull(views_prev, 0) AS Int64) AS views_prev,
  CAST(ifNull(new_u, 0) AS UInt64) AS new_u,
  CAST(ifNull(new_prev, 0) AS UInt64) AS new_prev,
  CAST(ifNull(react_u, 0) AS UInt64) AS react_u,
  CAST(ifNull(regular, 0) AS UInt64) AS regular,
  CAST(ifNull(regular_prev, 0) AS UInt64) AS regular_prev,
  CAST(ifNull(sleeping, 0) AS UInt64) AS sleeping,
  CAST(ifNull(mau, 0) AS UInt64) AS mau,
  CAST(ifNull(mau_prev, 0) AS UInt64) AS mau_prev,
  CAST(ifNull(cnt, 0) AS UInt64) AS cnt,
  CAST(ages AS Array(Int64)) AS ages,
  CAST(acts AS Array(UInt64)) AS acts
FROM (
  SELECT role AS section, g, k, parent,
    if(role = 'list', login, NULL) AS login, if(role = 'list', fio, NULL) AS fio,
    if(role = 'list', lvl3, NULL) AS lvl3, if(role = 'list', lvl4, NULL) AS lvl4,
    if(role = 'list', spec, NULL) AS spec, if(role = 'list', stream, NULL) AS stream,
    if(role = 'list', exp, NULL) AS exp, if(role = 'list', is_head, NULL) AS is_head,
    if(role = 'list', days, NULL) AS days, if(role = 'list', last_dt, NULL) AS last_dt,
    if(role = 'list', bin, NULL) AS bin,
    users, users_prev, if(role = 'ts', toInt64(ifNull(b.bviews, 0)), toInt64(views)) AS views, views_prev, new_u, new_prev, react_u, regular, regular_prev,
    sleeping, mau, mau_prev, cnt, (am).1 AS ages, (am).2 AS acts
  FROM rnk
  LEFT JOIN bv b ON b.bk = rnk.tk
  WHERE (role != 'list' OR rn <= 3000) AND (g != 'adg' OR rn <= 100)
  UNION ALL
  SELECT 'area' AS section, '' AS g,
    '' AS k, 'd' AS parent,
    NULL AS login,
    NULL AS fio,
    NULL AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, NULL AS exp, NULL AS is_head,
    NULL AS days, NULL AS last_dt, NULL AS bin,
    toUInt64(0) AS users, toUInt64(0) AS users_prev, toInt64(0) AS views, toInt64(0) AS views_prev,
    toUInt64(0) AS new_u, toUInt64(0) AS new_prev, toUInt64(0) AS react_u, toUInt64(0) AS regular,
    toUInt64(0) AS regular_prev, toUInt64(0) AS sleeping, toUInt64(0) AS mau, toUInt64(0) AS mau_prev,
    toUInt64(0) AS cnt, CAST([], 'Array(Int64)') AS ages, CAST([], 'Array(UInt64)') AS acts
)
