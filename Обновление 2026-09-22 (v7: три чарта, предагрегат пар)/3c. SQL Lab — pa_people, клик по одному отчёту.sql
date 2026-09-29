-- SQL Lab: pa_people ровно как при КЛИКЕ ПО ОДНОМУ ОТЧЁТУ (30 дней). Только для замера — в датасет НЕ вставлять.
-- 1) Замените 987654321 на id отчёта, по которому кликали на борде (число из адреса /superset/dashboard/<id>/).
-- 2) Засеките время ПЕРВОГО прогона. Повтор — поменяйте цифру в строке ниже (SQL Lab кэширует ответ).
-- 5
WITH
  maxd AS (
    SELECT tuple(md, ds, toInt64(dateDiff('day', toStartOfDay(dt), toStartOfDay(md))) - if(toDate(toStartOfDay(dt)) = dt, 0, 1)) AS h
    FROM (SELECT md, toDate(ds0) AS ds, addDays(toDate(ds0), 90) AS dt
          FROM (SELECT max(ifNull(md, dmax)) AS md, min(dmin) AS ds0 FROM prod_proteus.pa_pair))
  ),
  dash_ok AS (
    SELECT dashboard_id
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1 AND published = 1 AND actual_flg = 1 AND dashboard_id IN (987654321)
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
      addMonths(toStartOfMonth(tupleElement((SELECT h FROM maxd), 1)), -toInt32(gm)) AS c0,
      bitAnd(p.msk, 1073741823) != 0 AS cur, bitAnd(p.msk, 1152921503533105152) != 0 AS prv,
      bitCount(bitAnd(p.msk, 1073741823)) AS nb_cur, bitCount(bitAnd(p.msk, 1152921503533105152)) AS nb_prev,
      multiIf(nb_cur <= 1, 1, nb_cur <= 5, 2, nb_cur <= 15, 3, 4) AS bin,
      if(match(toString(ifNull(a.lvl3_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(a.lvl3_management_unit_nm, ''))) AS lvl3, if(match(toString(ifNull(a.lvl4_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(a.lvl4_management_unit_nm, ''))) AS lvl4,[lvl3, lvl4, if(match(toString(ifNull(a.lvl5_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(a.lvl5_management_unit_nm, ''))), if(match(toString(ifNull(a.lvl6_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(a.lvl6_management_unit_nm, ''))), if(match(toString(ifNull(a.lvl7_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(a.lvl7_management_unit_nm, '')))] AS lv,if(arrayFirstIndex(x -> x = '', lv) = 0, toUInt32(length(lv)), toUInt32(arrayFirstIndex(x -> x = '', lv) - 1)) AS ol,
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
      countIf(if(rk.1 = 'ts', rk.5 = fd_k, cur AND fd_k < 30) AND fd_k <= tupleElement((SELECT h FROM maxd), 3)) AS new_u,
      countIf(prv AND fd_k >= 30 AND fd_k < 60 AND fd_k <= tupleElement((SELECT h FROM maxd), 3)) AS new_prev,
      countIf(rk.1 = 'ts' AND rk.5 != fd_k AND bitAnd(msk, toUInt64(bitShiftLeft(toUInt64(127), toUInt8(rk.5 + 1)))) = 0) AS react_u,
      countIf(nb_cur > 5) AS regular, countIf(nb_prev > 5) AS regular_prev,
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
    SELECT *,toUInt64(0) AS rn
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
  SELECT s_role AS section, s_g AS g,
    if(s_role = 'list', arrayStringConcat(groupArrayIf(concat(
      replaceRegexpAll(ifNull(toString(s_login), ''), '[\t\n\r]', ' '), '\t', replaceRegexpAll(ifNull(toString(s_fio), ''), '[\t\n\r]', ' '), '\t',
      replaceRegexpAll(ifNull(toString(s_spec), ''), '[\t\n\r]', ' '), '\t', replaceRegexpAll(ifNull(toString(s_stream), ''), '[\t\n\r]', ' '), '\t',
      replaceRegexpAll(ifNull(toString(s_exp), ''), '[\t\n\r]', ' '), '\t', ifNull(toString(s_is_head), ''), '\t', ifNull(toString(s_days), ''), '\t',
      ifNull(toString(s_views), ''), '\t', ifNull(toString(s_last_dt), ''), '\t', ifNull(toString(s_bin), ''), '\t',
      toString(ifNull(s_new_u, 0)), '\t', toString(ifNull(s_mau, 0)), '\t', toString(ifNull(s_mau_prev, 0)), '\t',
      toString(toUInt8(lower(toString(ifNull(s_login, ''))) NOT IN (SELECT login FROM prod_proteus.pa_staff)))), s_role = 'list'), '\n'), any(s_k)) AS k,
    s_parent AS parent,
    NULL AS login, NULL AS fio, NULL AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, NULL AS exp, NULL AS is_head,
    NULL AS days, NULL AS last_dt, NULL AS bin,
    if(s_role = 'list', toUInt64(0), any(s_users)) AS users, if(s_role = 'list', toUInt64(0), any(s_users_prev)) AS users_prev,
    if(s_role = 'list', toInt64(0), any(if(s_role = 'ts', toInt64(ifNull(s_bviews, 0)), toInt64(s_views)))) AS views,
    if(s_role = 'list', toInt64(0), any(toInt64(s_views_prev))) AS views_prev,
    if(s_role = 'list', toUInt64(0), any(s_new_u)) AS new_u, if(s_role = 'list', toUInt64(0), any(s_new_prev)) AS new_prev,
    if(s_role = 'list', toUInt64(0), any(s_react_u)) AS react_u, if(s_role = 'list', toUInt64(0), any(s_regular)) AS regular,
    if(s_role = 'list', toUInt64(0), any(s_regular_prev)) AS regular_prev, if(s_role = 'list', toUInt64(0), any(s_sleeping)) AS sleeping,
    if(s_role = 'list', toUInt64(0), any(s_mau)) AS mau, if(s_role = 'list', toUInt64(0), any(s_mau_prev)) AS mau_prev,
    if(s_role = 'list', count(), any(s_cnt)) AS cnt, any((s_am).1) AS ages, any((s_am).2) AS acts
  FROM (SELECT role AS s_role, g AS s_g, k AS s_k, parent AS s_parent, login AS s_login, fio AS s_fio, spec AS s_spec,
      stream AS s_stream, exp AS s_exp, is_head AS s_is_head, days AS s_days, views AS s_views, last_dt AS s_last_dt, bin AS s_bin,
      new_u AS s_new_u, mau AS s_mau, mau_prev AS s_mau_prev, users AS s_users, users_prev AS s_users_prev, views_prev AS s_views_prev,
      new_prev AS s_new_prev, react_u AS s_react_u, regular AS s_regular, regular_prev AS s_regular_prev, sleeping AS s_sleeping,
      cnt AS s_cnt, am AS s_am, rn AS s_rn, b.bviews AS s_bviews
    FROM rnk LEFT JOIN bv b ON b.bk = rnk.tk)
  WHERE s_role = 'list' OR s_g != 'adg' OR s_rn <= 100
  GROUP BY s_role, s_g, if(s_role = 'list', '', s_k), s_parent
  UNION ALL
  SELECT 'area' AS section, 'report' AS g,
    ('987654321') AS k, 'd' AS parent,
    NULL AS login,
    ifNull((SELECT any(dashboard_nm) FROM prod_proteus.pa_dash_meta WHERE dashboard_id = 987654321), '') AS fio,
    NULL AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, '{"mode_param":["report"],"sel_f":["987654321"]}' AS exp, NULL AS is_head,toUInt32(greatest(tupleElement((SELECT h FROM maxd), 3) + 1, 0)) AS days, tupleElement((SELECT h FROM maxd), 2) AS last_dt, NULL AS bin,
    toUInt64(0) AS users, toUInt64(0) AS users_prev, toInt64(0) AS views, toInt64(0) AS views_prev,
    toUInt64(0) AS new_u, toUInt64(0) AS new_prev, toUInt64(0) AS react_u, toUInt64(0) AS regular,
    toUInt64(0) AS regular_prev, toUInt64(0) AS sleeping, toUInt64(0) AS mau, toUInt64(0) AS mau_prev,
    toUInt64(0) AS cnt, CAST([], 'Array(Int64)') AS ages, CAST([], 'Array(UInt64)') AS acts
)
