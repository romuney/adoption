-- 1
-- Панель — клик по одному отчёту. Замените 12345 на id отчёта (поиском, все места).
-- Рендер без джини (для SQL Lab, база CROSS). Цифру в первой строке меняйте для повторного замера: SQL Lab кэширует результат.
WITH
  maxd AS (
    SELECT tuple(md, ds, toInt64(dateDiff('day', toStartOfDay(dt), toStartOfDay(md))) - if(toDate(toStartOfDay(dt)) = dt, 0, 1),
      toInt64(dateDiff('day', dt, toDate(md)))) AS h
    FROM (SELECT md, toDate(ds0) AS ds, addDays(toDate(ds0), 90) AS dt
          FROM (SELECT max(ifNull(md, dmax)) AS md, min(dmin) AS ds0 FROM prod_proteus.pa_pair))
  ),
  dicts AS (
    SELECT tuple(arraySort(groupUniqArrayIf(dv, dg = 'spec')), arraySort(groupUniqArrayIf(dv, dg = 'stream')), arraySort(groupUniqArrayIf(dv, dg = 'exp')),
      arraySort(groupUniqArrayIf(dv, dg = 'hq')), arraySort(groupUniqArrayIf(dv, dg = 'it'))) AS dz
    FROM (SELECT dd.1 AS dg, dd.2 AS dv FROM (
      SELECT arrayJoin([('spec', toString(ifNull(emp_specialization_desc, ''))), ('stream', toString(ifNull(emp_stream_desc, ''))),
        ('exp', toString(ifNull(exp_nm, ''))), ('hq', toString(ifNull(hq_code, ''))), ('it', toString(ifNull(it_code, '')))]) AS dd FROM prod_proteus.pa_staff
      UNION ALL
      SELECT arrayJoin([('spec', toString(ifNull(emp_specialization_desc, ''))), ('stream', toString(ifNull(emp_stream_desc, ''))),
        ('exp', toString(ifNull(exp_nm, '')))]) AS dd FROM prod_proteus.pa_emp_attrs
      UNION ALL
      SELECT arrayJoin([('spec', ''), ('stream', ''), ('exp', ''), ('hq', ''), ('it', '')]) AS dd))
  ),
  dash_ok AS (
    SELECT dashboard_id
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1 AND published = 1 AND actual_flg = 1 AND dashboard_id IN (12345)
  ),
  evd AS (SELECT toString(ifNull(e.login, '')) AS login, lower(toString(ifNull(e.login, ''))) AS lg,
      groupBitOr(toUInt64(ifNull(e.msk_d, 0))) AS msk,
      sum(ifNull(e.v_d, 0)) AS v_cur,
      sum(ifNull(e.vp_d, 0)) AS v_prev,
      max(ifNull(e.kmax_d, 0)) AS fd_k,
      max(e.dmax) AS dmax,
      groupBitOr(toUInt64(ifNull(e.msk_mon, 0))) AS mon,groupBitOr(toUInt64(ifNull(e.msk_d, 0))) AS mskd,
      max(ifNull(e.kmax_d, 0)) AS fd_d
    FROM prod_proteus.pa_pair e
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(e.login) AND ifNull(e.own_flg, 0) = 0
    GROUP BY e.login
  ),
  pr AS (SELECT p.login AS login, p.msk AS msk, bitCount(bitAnd(p.msk, 1073741823)) AS days, p.v_cur AS v_cur, p.v_prev AS v_prev,
      p.fd_k AS fd_k, p.fd_d AS fd_d, p.dmax AS dmax, toUInt8(bitTest(p.mon, 1)) AS m1, toUInt8(bitTest(p.mon, 2)) AS m2,arrayMap(i -> toInt64(i), arrayFilter(i -> bitTest(p.mon, i), range(63))) AS bms,
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
      arrayFilter(x -> x >= 1 AND x <= 11, arrayMap(y -> gm - y, bms)) AS ags,p.stf AS stf, p.acc AS acc, toUInt8(p.stf = 1 AND p.acc = 1) AS inca,
      p.hq AS hq, p.it AS it,
      toUInt8(bitAnd(p.mon, toUInt64(bitShiftLeft(toUInt64(1), toUInt8(toMonth(tupleElement((SELECT h FROM maxd), 1))))) - 1) != 0) AS yr,
      arrayJoin(arrayConcat(
        [('total', '', '', '', toInt64(-1))],
        if(cur, [('freq', '', toString(bin), '', toInt64(-1))], []),
        if(cur OR prv, arrayMap(i -> ('ctx', 'org', arrayStringConcat(arraySlice(lv, 1, i), ' › '), arrayStringConcat(arraySlice(lv, 1, toUInt32(i - 1)), ' › '), toInt64(-1)), range(1, ol + 1)), []),
        if((cur OR prv) AND spec != '', [('ctx', 'spec', spec, '', toInt64(-1))], []),
        if((cur OR prv) AND stream != '', [('ctx', 'stream', stream, '', toInt64(-1))], []),
        if((cur OR prv) AND is_head = 1, [('ctx', 'head', '1', '', toInt64(-1))], []),
        if(cur, [('list', '', toString(p.login), opath, toInt64(-1))], []),
        if(gm < 12, [('coh', '', toString(c0), '', toInt64(-1))], []),if(cur, arrayMap(t -> ('ts', '', toString(t), '', toInt64(t)), arrayFilter(t -> bitTest(p.msk, t), range(30))), []),arrayMap(t -> ('cal', '', toString(t), '', toInt64(t)), arrayFilter(t -> bitTest(p.mskd, t), range(60)))
      )) AS rk
    FROM (SELECT e.*, toUInt8(ifNull(s.login, '') != '') AS stf, toUInt8(e.lg IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'user' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)
        UNION ALL
        SELECT m.login FROM prod_proteus.pa_adg_member m
        WHERE m.ad_group IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'group' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)))) AS acc,
        toString(ifNull(s.hq_code, '')) AS hq, toString(ifNull(s.it_code, '')) AS it
      FROM evd e
      LEFT JOIN prod_proteus.pa_staff s ON s.login = e.lg
    ) p
    LEFT JOIN prod_proteus.pa_emp_attrs a ON a.login = p.login
  ),
  agg AS (
    SELECT rk.1 AS role, rk.2 AS g, rk.3 AS k, rk.4 AS parent,
      countIf(rk.1 = 'cal' OR cur) AS users, countIf(prv) AS users_prev,
      sum(if(rk.1 IN ('ts', 'cal'), 0, v_cur)) AS views, any(rk.5) AS tk,
      sum(v_prev) AS views_prev,
      countIf(if(rk.1 = 'cal', rk.5 = fd_d AND fd_d <= tupleElement((SELECT h FROM maxd), 4), if(rk.1 = 'ts', rk.5 = fd_k, cur AND fd_k < 30) AND fd_k <= tupleElement((SELECT h FROM maxd), 3))) AS new_u,
      countIf(prv AND fd_k >= 30 AND fd_k < 60 AND fd_k <= tupleElement((SELECT h FROM maxd), 3)) AS new_prev,
      countIf(rk.1 = 'ts' AND rk.5 != fd_k AND bitAnd(msk, toUInt64(bitShiftLeft(toUInt64(127), toUInt8(rk.5 + 1)))) = 0) AS react_u,
      countIf(nb_cur > 5) AS regular, countIf(nb_prev > 5) AS regular_prev,
      countIf(prv AND NOT cur) AS sleeping,
      countIf(m1 = 1) AS mau, countIf(m2 = 1) AS mau_prev,
      count() AS cnt,
      countIf(prv AND inca = 1) AS ca_prev, countIf(nb_prev > 5 AND inca = 1) AS ca_regprev,
      countIf(yr = 1 AND inca = 1) AS ca_yr, countIf(cur AND inca = 0) AS ca_out,
      sumMap(if(rk.1 = 'coh', ags, CAST([], 'Array(Int64)')), if(rk.1 = 'coh', arrayMap(x -> toUInt64(1), ags), CAST([], 'Array(UInt64)'))) AS am,
      any(login) AS login, any(fio) AS fio, any(lvl3) AS lvl3, any(lvl4) AS lvl4, any(spec) AS spec,
      any(stream) AS stream, any(exp) AS exp, any(is_head) AS is_head, any(days) AS days,
      any(toDate(dmax)) AS last_dt, any(bin) AS bin,
      any(msk) AS lmsk, any(fd_k) AS lfk, any(dmax) AS ldmax, any(m1) AS lm1, any(m2) AS lm2, any(yr) AS lyr,
      any(stf) AS lstf, any(acc) AS lacc, any(inca) AS lca, any(hq) AS lhq, any(it) AS lit
    FROM pr
    GROUP BY role, g, k, parent
  ),
  bv AS (
    SELECT gg, toInt64(k) AS bk, sum(views_nown) AS bviews
    FROM prod_proteus.pa_dash_bkt
    ARRAY JOIN arrayFilter(y -> (y = 'g' AND grain = 'd') OR (y = 'd' AND grain = 'd'), ['g', 'd']) AS gg
    WHERE grain IN ('d', 'd') AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)
    GROUP BY gg, bk
  ),
  sv AS (SELECT lower(toString(s.login)) AS lg,
      [if(match(toString(ifNull(s.lvl3_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl3_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl4_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl4_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl5_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl5_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl6_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl6_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl7_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl7_management_unit_nm, '')))] AS slv,
      arrayStringConcat(arraySlice(slv, 1, if(arrayFirstIndex(x -> x = '', slv) = 0, toUInt32(5), toUInt32(arrayFirstIndex(x -> x = '', slv) - 1))), ' › ') AS op,
      toString(ifNull(s.emp_specialization_desc, '')) AS sp, toString(ifNull(s.emp_stream_desc, '')) AS st,
      toString(ifNull(s.hq_code, '')) AS hqc, toString(ifNull(s.it_code, '')) AS itc, toUInt8(ifNull(s.management_head_flg, 0) = 1) AS hdf,
      toString(ifNull(s.fio, '')) AS sfio, toString(ifNull(s.exp_nm, '')) AS sexp,
      toUInt8(lg IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'user' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)
        UNION ALL
        SELECT m.login FROM prod_proteus.pa_adg_member m
        WHERE m.ad_group IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'group' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)))) AS acc,
      toUInt8(acc = 1) AS inca
    FROM prod_proteus.pa_staff s
    WHERE lg NOT IN (SELECT lower(toString(login)) FROM prod_proteus.pa_pair
      WHERE dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(login)
        AND bitAnd(toUInt64(ifNull(msk_d, 0)), 1073741823) != 0 AND ifNull(own_flg, 0) = 0)AND lg NOT IN (SELECT o FROM (SELECT arrayJoin(owners_string) AS o FROM prod_proteus.pa_dash_meta WHERE dashboard_id IN (SELECT dashboard_id FROM dash_ok))
        GROUP BY o HAVING count() = (SELECT count() FROM dash_ok))
  ),
  s1 AS (SELECT rl, op,
      if(rl = 'h', concat(toString(indexOf(tupleElement((SELECT dz FROM dicts), 1), sp)), '|', toString(indexOf(tupleElement((SELECT dz FROM dicts), 2), st)), '|', toString(hdf), '|', toString(indexOf(tupleElement((SELECT dz FROM dicts), 4), hqc)), '|', toString(indexOf(tupleElement((SELECT dz FROM dicts), 5), itc))), '') AS hk,
      if(rl = 'n', concat(replaceRegexpAll(lg, '[|\t\n\r]', ' '), '|', replaceRegexpAll(sfio, '[|\t\n\r]', ' '), '|', toString(indexOf(tupleElement((SELECT dz FROM dicts), 1), sp)), '|', toString(indexOf(tupleElement((SELECT dz FROM dicts), 2), st)), '|', toString(hdf), '|',
        toString(indexOf(tupleElement((SELECT dz FROM dicts), 4), hqc)), '|', toString(indexOf(tupleElement((SELECT dz FROM dicts), 5), itc)), '|', toString(acc), '|', toString(indexOf(tupleElement((SELECT dz FROM dicts), 3), sexp))), '') AS ln,
      count() AS c, countIf(acc = 1) AS ca, countIf(inca = 1) AS cn, countIf(inca = 1 AND acc = 1) AS cna
    FROM sv
    ARRAY JOIN if(inca = 1, ['h', 'n'], ['h']) AS rl
    GROUP BY rl, op, hk, ln
  ),
  s2 AS (
    SELECT rl AS sec, op,
      arrayStringConcat(arraySort(groupArray(if(rl = 'h', concat(hk, '|', toString(c), '|', toString(ca), '|', toString(cn), '|', toString(cna)), ln))), '\n') AS pk,
      sum(c) AS n, sumIf(c, rl = 'n') AS nn
    FROM s1 GROUP BY sec, op
  ),
  s3 AS (SELECT sec, op, pk, n, sum(nn) OVER () AS nnever FROM s2
  ),
  rnk AS (
    SELECT *,
      if(role = 'cal', 'd', 'g') AS bg,toUInt64(0) AS rn
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
  CAST(acts AS Array(UInt64)) AS acts,
  CAST(ifNull(ca_prev, 0) AS UInt64) AS ca_prev,
  CAST(ifNull(ca_regprev, 0) AS UInt64) AS ca_regprev,
  CAST(ifNull(ca_yr, 0) AS UInt64) AS ca_yr,
  CAST(ifNull(ca_out, 0) AS UInt64) AS ca_out,
  CAST(state_j AS Nullable(String)) AS state_j
FROM (
  SELECT s_role AS section, s_g AS g,
    if(s_role = 'list', arrayStringConcat(groupArrayIf(concat(
      replaceRegexpAll(ifNull(toString(s_login), ''), '[|\t\n\r]', ' '), '|', replaceRegexpAll(ifNull(toString(s_fio), ''), '[|\t\n\r]', ' '), '|',
      toString(indexOf(tupleElement((SELECT dz FROM dicts), 1), ifNull(toString(s_spec), ''))), '|', toString(indexOf(tupleElement((SELECT dz FROM dicts), 2), ifNull(toString(s_stream), ''))), '|', toString(indexOf(tupleElement((SELECT dz FROM dicts), 3), ifNull(toString(s_exp), ''))), '|',
      toString(bitAnd(s_lmsk, 1073741823)), '|', toString(bitShiftRight(s_lmsk, 30)), '|', toString(s_lfk), '|', toString(s_views), '|',
      toString(if(isNull(s_ldmax), toInt64(-1), toInt64(dateDiff('day', toStartOfDay(s_ldmax), toStartOfDay(tupleElement((SELECT h FROM maxd), 1)))))), '|',toString(toUInt8(ifNull(s_is_head, 0)) + 2 * s_lm1 + 4 * s_lm2 + 8 * s_lyr + 16 * s_lstf + 32 * s_lacc + 64 * s_lca), '|',
      toString(indexOf(tupleElement((SELECT dz FROM dicts), 4), s_lhq)), '|', toString(indexOf(tupleElement((SELECT dz FROM dicts), 5), s_lit))), s_role = 'list'), '\n'), any(s_k)) AS k,
    s_parent AS parent,
    NULL AS login, NULL AS fio, NULL AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, NULL AS exp, NULL AS is_head,
    NULL AS days, NULL AS last_dt, NULL AS bin,
    if(s_role = 'list', toUInt64(0), any(s_users)) AS users, if(s_role = 'list', toUInt64(0), any(s_users_prev)) AS users_prev,
    if(s_role = 'list', toInt64(0), any(if(s_role IN ('ts', 'cal'), toInt64(ifNull(s_bviews, 0)), toInt64(s_views)))) AS views,
    if(s_role = 'list', toInt64(0), any(toInt64(s_views_prev))) AS views_prev,
    if(s_role = 'list', toUInt64(0), any(s_new_u)) AS new_u, if(s_role = 'list', toUInt64(0), any(s_new_prev)) AS new_prev,
    if(s_role = 'list', toUInt64(0), any(s_react_u)) AS react_u, if(s_role = 'list', toUInt64(0), any(s_regular)) AS regular,
    if(s_role = 'list', toUInt64(0), any(s_regular_prev)) AS regular_prev, if(s_role = 'list', toUInt64(0), any(s_sleeping)) AS sleeping,
    if(s_role = 'list', toUInt64(0), any(s_mau)) AS mau, if(s_role = 'list', toUInt64(0), any(s_mau_prev)) AS mau_prev,
    if(s_role = 'list', count(), any(s_cnt)) AS cnt, any((s_am).1) AS ages, any((s_am).2) AS acts,
    if(s_role = 'total', any(s_ca_prev), toUInt64(0)) AS ca_prev, if(s_role = 'total', any(s_ca_regprev), toUInt64(0)) AS ca_regprev,
    if(s_role = 'total', any(s_ca_yr), toUInt64(0)) AS ca_yr,if(s_role = 'total', any(s_ca_out), toUInt64(0)) AS ca_out,
    CAST(NULL AS Nullable(String)) AS state_j
  FROM (SELECT role AS s_role, g AS s_g, k AS s_k, parent AS s_parent, login AS s_login, fio AS s_fio, spec AS s_spec,
      stream AS s_stream, exp AS s_exp, is_head AS s_is_head, days AS s_days, views AS s_views, last_dt AS s_last_dt, bin AS s_bin,
      new_u AS s_new_u, mau AS s_mau, mau_prev AS s_mau_prev, users AS s_users, users_prev AS s_users_prev, views_prev AS s_views_prev,
      new_prev AS s_new_prev, react_u AS s_react_u, regular AS s_regular, regular_prev AS s_regular_prev, sleeping AS s_sleeping,
      cnt AS s_cnt, am AS s_am, rn AS s_rn, b.bviews AS s_bviews,
      lmsk AS s_lmsk, lfk AS s_lfk, ldmax AS s_ldmax, lm1 AS s_lm1, lm2 AS s_lm2, lyr AS s_lyr, lstf AS s_lstf, lacc AS s_lacc, lca AS s_lca,
      lhq AS s_lhq, lit AS s_lit, ca_prev AS s_ca_prev, ca_regprev AS s_ca_regprev, ca_yr AS s_ca_yr, ca_out AS s_ca_out
    FROM rnk LEFT JOIN bv b ON b.bk = rnk.tk AND b.gg = rnk.bg)
  WHERE s_role = 'list' OR s_g != 'adg' OR s_rn <= 100
  GROUP BY s_role, s_g, if(s_role = 'list', '', s_k), s_parent
  UNION ALL
  SELECT 'area' AS section, 'report' AS g,
    ('12345') AS k, 'd' AS parent,
    NULL AS login,
    ifNull((SELECT any(dashboard_nm) FROM prod_proteus.pa_dash_meta WHERE dashboard_id = 12345), '') AS fio,toString(toDate(tupleElement((SELECT h FROM maxd), 1))) AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, '{"mode_param":["report"],"sel_f":["12345"]}' AS exp, NULL AS is_head,toUInt32(greatest(tupleElement((SELECT h FROM maxd), 3) + 1, 0)) AS days, tupleElement((SELECT h FROM maxd), 2) AS last_dt, NULL AS bin,
    toUInt64(0) AS users, toUInt64(0) AS users_prev, toInt64(0) AS views, toInt64(0) AS views_prev,
    toUInt64(0) AS new_u, toUInt64(0) AS new_prev, toUInt64(0) AS react_u, toUInt64(0) AS regular,
    toUInt64(0) AS regular_prev, toUInt64(0) AS sleeping, toUInt64(0) AS mau, toUInt64(0) AS mau_prev,
    toUInt64(0) AS cnt, CAST([], 'Array(Int64)') AS ages, CAST([], 'Array(UInt64)') AS acts,
    toUInt64(0) AS ca_prev, toUInt64(0) AS ca_regprev, toUInt64(0) AS ca_yr, toUInt64(0) AS ca_out,concat('{"staff":', toString((SELECT count() FROM prod_proteus.pa_staff)), ', "wide":0.3, "caMode":"acc", "ca":{}}') AS state_j
  UNION ALL
  SELECT sec AS section, '' AS g, pk AS k, op AS parent,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    toUInt64(n), toUInt64(0), toInt64(0), toInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0),
    toUInt64(n), CAST([], 'Array(Int64)'), CAST([], 'Array(UInt64)'), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), CAST(NULL AS Nullable(String))
  FROM s3
  WHERE sec = 'h' OR nnever <= 20000
  UNION ALL
  SELECT 'd', x.1, toString(x.2), x.3,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    toUInt64(0), toUInt64(0), toInt64(0), toInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0),
    toUInt64(0), CAST([], 'Array(Int64)'), CAST([], 'Array(UInt64)'), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), CAST(NULL AS Nullable(String))
  FROM (SELECT arrayJoin(arrayConcat(
    arrayMap((v, i) -> ('spec', i, v), dz.1, arrayEnumerate(dz.1)), arrayMap((v, i) -> ('stream', i, v), dz.2, arrayEnumerate(dz.2)),
    arrayMap((v, i) -> ('exp', i, v), dz.3, arrayEnumerate(dz.3)), arrayMap((v, i) -> ('hq', i, v), dz.4, arrayEnumerate(dz.4)),
    arrayMap((v, i) -> ('it', i, v), dz.5, arrayEnumerate(dz.5)))) AS x FROM dicts)
  UNION ALL
  SELECT 'acl', 'group', ad_group, '',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    toUInt64(cnt), toUInt64(0), toInt64(0), toInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0),
    toUInt64(0), CAST([], 'Array(Int64)'), CAST([], 'Array(UInt64)'), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), CAST(NULL AS Nullable(String))
  FROM (
    SELECT m.ad_group AS ad_group, uniqExact(m.login) AS cnt
    FROM prod_proteus.pa_adg_member m
    WHERE m.ad_group IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'group' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok))
      AND m.login IN (SELECT login FROM prod_proteus.pa_staff)
    GROUP BY m.ad_group ORDER BY cnt DESC, ad_group LIMIT 40
  )
  UNION ALL
  SELECT 'acl', 'users', '', '',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    toUInt64(uniqExact(principal)), toUInt64(0), toInt64(0), toInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0),
    toUInt64(0), CAST([], 'Array(Int64)'), CAST([], 'Array(UInt64)'), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), CAST(NULL AS Nullable(String))
  FROM prod_proteus.pa_dash_acl WHERE kind = 'user' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)
)
