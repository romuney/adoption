-- SQL Lab: pa_people (файл 3), 30 дней, без выбора в каталоге. Только для проверки — в датасет НЕ вставлять.
-- Замер — первый прогон уникального текста; повтор: поменяйте цифру в строке ниже.
-- 1
WITH
  maxd AS (SELECT max(log_dttm) AS md FROM prod_proteus.pa_evd_day),
  dash_ok AS (
    SELECT dashboard_id, owners_string
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1 AND published = 1 AND actual_flg = 1
  ),
  evd AS (SELECT e.login AS login,
      groupBitOr(if(toInt64(dateDiff('day', toStartOfDay(e.log_dttm), toStartOfDay((SELECT md FROM maxd)))) < 60, toUInt64(bitShiftLeft(toUInt64(1), toUInt8(toInt64(dateDiff('day', toStartOfDay(e.log_dttm), toStartOfDay((SELECT md FROM maxd))))))), toUInt64(0))) AS msk,
      uniqExactIf(toDate(e.log_dttm), toInt64(dateDiff('day', toStartOfDay(e.log_dttm), toStartOfDay((SELECT md FROM maxd)))) < 30) AS days,
      sumIf(e.views, toInt64(dateDiff('day', toStartOfDay(e.log_dttm), toStartOfDay((SELECT md FROM maxd)))) < 30) AS v_cur,
      sumIf(e.views, toInt64(dateDiff('day', toStartOfDay(e.log_dttm), toStartOfDay((SELECT md FROM maxd)))) >= 30 AND toInt64(dateDiff('day', toStartOfDay(e.log_dttm), toStartOfDay((SELECT md FROM maxd)))) < 60) AS v_prev,
      sumMapIf([toInt64(dateDiff('day', toStartOfDay(e.log_dttm), toStartOfDay((SELECT md FROM maxd))))], [toInt64(e.views)], toInt64(dateDiff('day', toStartOfDay(e.log_dttm), toStartOfDay((SELECT md FROM maxd)))) < 30) AS kv,
      max(toInt64(dateDiff('day', toStartOfDay(e.log_dttm), toStartOfDay((SELECT md FROM maxd))))) AS fd_k,
      max(e.log_dttm) AS dmax,
      toStartOfMonth(min(e.log_dttm)) AS c0,
      groupUniqArray(toInt64(dateDiff('month', toStartOfMonth(e.log_dttm), toStartOfMonth((SELECT md FROM maxd))))) AS bms,
      max(toStartOfMonth(e.log_dttm) = addMonths(toStartOfMonth((SELECT md FROM maxd)), -1)) AS m1,
      max(toStartOfMonth(e.log_dttm) = addMonths(toStartOfMonth((SELECT md FROM maxd)), -2)) AS m2
    FROM prod_proteus.pa_evd_day e
    INNER JOIN dash_ok m ON m.dashboard_id = e.dashboard_id
    WHERE 1=1 AND NOT has(m.owners_string, e.login)
    GROUP BY e.login
  ),
  pr AS (SELECT p.login AS login, p.msk AS msk, p.days AS days, p.v_cur AS v_cur, p.v_prev AS v_prev,
      p.kv AS kv, p.fd_k AS fd_k, p.dmax AS dmax, p.m1 AS m1, p.m2 AS m2,
      bitAnd(p.msk, 1073741823) != 0 AS cur, bitAnd(p.msk, 1152921503533105152) != 0 AS prv,
      bitCount(bitAnd(p.msk, 1073741823)) AS nb_cur, bitCount(bitAnd(p.msk, 1152921503533105152)) AS nb_prev,
      multiIf(nb_cur <= 1, 1, nb_cur <= 3, 2, nb_cur <= 7, 3, nb_cur <= 15, 4, 5) AS bin,a.lvl3_management_unit_nm AS lvl3, a.lvl4_management_unit_nm AS lvl4,
      a.emp_specialization_desc AS spec, a.emp_stream_desc AS stream,
      toUInt8(a.management_head_flg = 1) AS is_head,
      a.fio AS fio, a.exp_nm AS exp,
      toInt64(dateDiff('month', p.c0, toStartOfMonth((SELECT md FROM maxd)))) AS gm,
      p.c0 AS c0,
      arrayFilter(x -> x >= 1 AND x <= 11, arrayMap(y -> toInt64(dateDiff('month', p.c0, toStartOfMonth((SELECT md FROM maxd)))) - y, p.bms)) AS ags,
      arrayJoin(arrayConcat(
        [('total', '', '', '', toInt64(-1))],
        if(cur, [('freq', '', toString(bin), '', toInt64(-1))], []),
        if((cur OR prv) AND lvl3 != '', [('ctx', 'lvl3', lvl3, '', toInt64(-1))], []),
        if((cur OR prv) AND lvl4 != '', [('ctx', 'lvl4', lvl4, '', toInt64(-1))], []),
        if((cur OR prv) AND lvl4 != '' AND lvl3 != '', [('ctx', 'dep', lvl4, lvl3, toInt64(-1))], []),
        if((cur OR prv) AND spec != '', [('ctx', 'spec', spec, '', toInt64(-1))], []),
        if((cur OR prv) AND stream != '', [('ctx', 'stream', stream, '', toInt64(-1))], []),
        if((cur OR prv) AND is_head = 1, [('ctx', 'head', '1', '', toInt64(-1))], []),
        if(cur OR prv, arrayMap(x -> ('ctx', 'adg', x, '', toInt64(-1)), arrayFilter(x -> x != '', a.ad_groups)), []),
        if(cur, [('list', '', p.login, '', toInt64(-1))], []),
        if(gm < 12, [('coh', '', toString(p.c0), '', toInt64(-1))], []),
        if(cur, arrayMap(t -> ('ts', '', toString(t), '', t), (p.kv).1), [])
      )) AS rk
    FROM evd p
    LEFT JOIN prod_proteus.pa_emp_attrs a ON a.login = p.login
  ),
  agg AS (
    SELECT rk.1 AS role, rk.2 AS g, rk.3 AS k, rk.4 AS parent,
      countIf(cur) AS users, countIf(prv) AS users_prev,
      sum(if(rk.1 = 'ts', (kv).2[indexOf((kv).1, rk.5)], v_cur)) AS views,
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
  CAST(users AS UInt64) AS users,
  CAST(users_prev AS UInt64) AS users_prev,
  CAST(views AS Int64) AS views,
  CAST(views_prev AS Int64) AS views_prev,
  CAST(new_u AS UInt64) AS new_u,
  CAST(new_prev AS UInt64) AS new_prev,
  CAST(react_u AS UInt64) AS react_u,
  CAST(regular AS UInt64) AS regular,
  CAST(regular_prev AS UInt64) AS regular_prev,
  CAST(sleeping AS UInt64) AS sleeping,
  CAST(mau AS UInt64) AS mau,
  CAST(mau_prev AS UInt64) AS mau_prev,
  CAST(cnt AS UInt64) AS cnt,
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
    users, users_prev, views, views_prev, new_u, new_prev, react_u, regular, regular_prev,
    sleeping, mau, mau_prev, cnt, (am).1 AS ages, (am).2 AS acts
  FROM rnk
  WHERE (role != 'list' OR rn <= 2000) AND (g != 'adg' OR rn <= 100)
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
