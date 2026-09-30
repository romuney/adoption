-- 1
-- Панель с ЦА по условиям: IT + руководители (как кейс «динамика по IT-тимлидам»).
-- Если в бою код IT называется иначе — замените 'IT' (поиском) на значение из выпадашки «IT» строки ЦА.
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
    WHERE 1=1 AND published = 1 AND actual_flg = 1
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
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(e.login) AND ifNull(e.own_flg, 0) = 0 AND lower(toString(e.login)) IN (SELECT lg FROM (SELECT lower(toString(s.login)) AS lg,
      [if(match(toString(ifNull(s.lvl3_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl3_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl4_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl4_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl5_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl5_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl6_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl6_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl7_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl7_management_unit_nm, '')))] AS slv,
      arrayStringConcat(arraySlice(slv, 1, if(arrayFirstIndex(x -> x = '', slv) = 0, toUInt32(5), toUInt32(arrayFirstIndex(x -> x = '', slv) - 1))), ' › ') AS op,
      toString(ifNull(s.emp_specialization_desc, '')) AS sp, toString(ifNull(s.emp_stream_desc, '')) AS st,
      toString(ifNull(s.hq_code, '')) AS hqc, toString(ifNull(s.it_code, '')) AS itc, toUInt8(ifNull(s.management_head_flg, 0) = 1) AS hdf,
      toString(ifNull(s.fio, '')) AS sfio, toString(ifNull(s.exp_nm, '')) AS sexp FROM prod_proteus.pa_staff s) WHERE 1 AND itc IN ('IT') AND hdf = 1)
    GROUP BY e.login
  ),
  pr AS (SELECT p.msk AS msk, p.v_cur AS v_cur, p.v_prev AS v_prev,
      p.fd_k AS fd_k, p.fd_d AS fd_d, toUInt8(bitTest(p.mon, 1)) AS m1, toUInt8(bitTest(p.mon, 2)) AS m2,arrayMap(i -> toInt64(i), arrayFilter(i -> bitTest(p.mon, i), range(63))) AS bms,
      if(empty(bms), toInt64(0), arrayMax(bms)) AS gm,
      addMonths(toStartOfMonth(tupleElement((SELECT h FROM maxd), 1)), -toInt32(gm)) AS c0,
      bitAnd(p.msk, 1073741823) != 0 AS cur, bitAnd(p.msk, 1152921503533105152) != 0 AS prv,
      bitCount(bitAnd(p.msk, 1073741823)) AS nb_cur, bitCount(bitAnd(p.msk, 1152921503533105152)) AS nb_prev,
      multiIf(nb_cur <= 1, 1, nb_cur <= 5, 2, nb_cur <= 15, 3, 4) AS bin,
      if(match(toString(ifNull(a.lvl3_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(a.lvl3_management_unit_nm, ''))) AS lvl3, if(match(toString(ifNull(a.lvl4_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(a.lvl4_management_unit_nm, ''))) AS lvl4,[lvl3, lvl4, if(match(toString(ifNull(a.lvl5_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(a.lvl5_management_unit_nm, ''))), if(match(toString(ifNull(a.lvl6_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(a.lvl6_management_unit_nm, ''))), if(match(toString(ifNull(a.lvl7_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(a.lvl7_management_unit_nm, '')))] AS lv,if(arrayFirstIndex(x -> x = '', lv) = 0, toUInt32(length(lv)), toUInt32(arrayFirstIndex(x -> x = '', lv) - 1)) AS ol,
      arrayStringConcat(arraySlice(lv, 1, ol), ' › ') AS opath,
      toString(ifNull(a.emp_specialization_desc, '')) AS spec, toString(ifNull(a.emp_stream_desc, '')) AS stream,
      toUInt8(ifNull(a.management_head_flg, 0) = 1) AS is_head,
      arrayFilter(x -> x >= 1 AND x <= 11, arrayMap(y -> gm - y, bms)) AS ags,toUInt8(p.stf = 1 AND 1) AS inca,
      toUInt8(bitAnd(p.mon, toUInt64(bitShiftLeft(toUInt64(1), toUInt8(toMonth(tupleElement((SELECT h FROM maxd), 1))))) - 1) != 0) AS yr,concat(translate(p.login, '|\t\n\r', '    '), '|', translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(toString(ifNull(a.fio, '')), '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), '([А-Яа-яЁё][А-Яа-яЁё ]*)', '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', toString(transform(spec, tupleElement((SELECT dz FROM dicts), 1), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 1)), toUInt32(0))), '|', toString(transform(stream, tupleElement((SELECT dz FROM dicts), 2), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 2)), toUInt32(0))), '|',
        toString(transform(toString(ifNull(a.exp_nm, '')), tupleElement((SELECT dz FROM dicts), 3), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 3)), toUInt32(0))), '|',
        toString(bitAnd(p.msk, 1073741823)), '|', toString(bitShiftRight(p.msk, 30)), '|', toString(p.fd_k), '|', toString(p.v_cur), '|',
        toString(if(isNull(p.dmax), toInt64(-1), toInt64(dateDiff('day', toStartOfDay(p.dmax), toStartOfDay(tupleElement((SELECT h FROM maxd), 1)))))), '|',
        toString(is_head + 2 * m1 + 4 * m2 + 8 * yr + 16 * p.stf + 32 * p.acc + 64 * inca), '|', toString(transform(p.hq, tupleElement((SELECT dz FROM dicts), 4), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 4)), toUInt32(0))), '|', toString(transform(p.it, tupleElement((SELECT dz FROM dicts), 5), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 5)), toUInt32(0)))) AS pln,
      arrayJoin(arrayConcat(
        [('total', '', '', '', toInt64(-1))],
        if(cur OR prv, arrayMap(i -> ('ctx', 'org', arrayStringConcat(arraySlice(lv, 1, i), ' › '), arrayStringConcat(arraySlice(lv, 1, toUInt32(i - 1)), ' › '), toInt64(-1)), range(1, ol + 1)), []),
        if((cur OR prv) AND spec != '', [('ctx', 'spec', spec, '', toInt64(-1))], []),
        if((cur OR prv) AND stream != '', [('ctx', 'stream', stream, '', toInt64(-1))], []),
        if((cur OR prv) AND is_head = 1, [('ctx', 'head', '1', '', toInt64(-1))], []),
        if(cur, [('list', '', pln, opath, toInt64(-1))], []),
        if(gm < 12, [('coh', '', toString(c0), '', toInt64(-1))], []))) AS rk
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
      countIf(cur) AS users, countIf(prv) AS users_prev,
      sum(v_cur) AS views, sum(v_prev) AS views_prev,
      countIf(cur AND fd_k < 30 AND fd_k <= tupleElement((SELECT h FROM maxd), 3)) AS new_u,
      countIf(prv AND fd_k >= 30 AND fd_k < 60 AND fd_k <= tupleElement((SELECT h FROM maxd), 3)) AS new_prev,countIf(cur AND bin = 1) AS f1, countIf(cur AND bin = 2) AS f2, countIf(cur AND bin = 3) AS f3, countIf(cur AND bin = 4) AS f4,
      countIf(nb_cur > 5) AS regular, countIf(nb_prev > 5) AS regular_prev,
      countIf(prv AND NOT cur) AS sleeping,
      countIf(m1 = 1) AS mau, countIf(m2 = 1) AS mau_prev,
      count() AS cnt,
      countIf(prv AND inca = 1) AS ca_prev, countIf(nb_prev > 5 AND inca = 1) AS ca_regprev,
      countIf(yr = 1 AND inca = 1) AS ca_yr, countIf(cur AND inca = 0) AS ca_out,
      sumMap(if(rk.1 = 'coh', ags, CAST([], 'Array(Int64)')), if(rk.1 = 'coh', arrayMap(x -> toUInt64(1), ags), CAST([], 'Array(UInt64)'))) AS am
    FROM pr
    GROUP BY role, g, k, parent
  ),
  tc AS (SELECT sumMap(tb, arrayWithConstant(length(tb), toUInt64(1))) AS tu,
      sumMap(tf, arrayWithConstant(length(tf), toUInt64(1))) AS tn,
      sumMap(tr0, arrayWithConstant(length(tr0), toUInt64(1))) AS tr,
      sumMap(cb, arrayWithConstant(length(cb), toUInt64(1))) AS cu,
      sumMap(cf, arrayWithConstant(length(cf), toUInt64(1))) AS cn
    FROM (
      SELECT arrayMap(x -> toUInt16(x), bitPositionsToArray(bitAnd(msk, 1073741823))) AS tb,if(fd_k < 30 AND fd_k <= tupleElement((SELECT h FROM maxd), 3) AND bitTest(msk, toUInt8(least(fd_k, 63))), [toUInt16(fd_k)], CAST([], 'Array(UInt16)')) AS tf,arrayFilter(t -> t != fd_k AND bitAnd(msk, toUInt64(bitShiftLeft(toUInt64(127), toUInt8(t + 1)))) = 0, tb) AS tr0,
        arrayMap(x -> toUInt16(x), arrayFilter(t -> t < 60, bitPositionsToArray(mskd))) AS cb,
        if(fd_d < 60 AND fd_d <= tupleElement((SELECT h FROM maxd), 4) AND bitTest(mskd, toUInt8(least(fd_d, 63))), [toUInt16(fd_d)], CAST([], 'Array(UInt16)')) AS cf
      FROM evd
    )
  ),
  bv AS (
    SELECT x.1 AS gg, x.2 AS bk, sum(e.views) AS bviews
    FROM prod_proteus.pa_evd_day e
    ARRAY JOIN arrayFilter(y -> y.2 < if(y.1 = 'g', 30, 30), [('g', toInt64(dateDiff('day', toStartOfDay(e.log_dttm), toStartOfDay(tupleElement((SELECT h FROM maxd), 1))))), ('d', toInt64(dateDiff('day', toStartOfDay(e.log_dttm), toStartOfDay(tupleElement((SELECT h FROM maxd), 1)))))]) AS x
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM dash_ok)
      AND e.log_dttm >= least(toDateTime(toStartOfDay(tupleElement((SELECT h FROM maxd), 1)) - toIntervalDay(29)), toDateTime(toStartOfDay(tupleElement((SELECT h FROM maxd), 1)) - toIntervalDay(29)))
      AND (toInt64(dateDiff('day', toStartOfDay(e.log_dttm), toStartOfDay(tupleElement((SELECT h FROM maxd), 1)))) < 30 OR toInt64(dateDiff('day', toStartOfDay(e.log_dttm), toStartOfDay(tupleElement((SELECT h FROM maxd), 1)))) < 30) AND lower(toString(e.login)) IN (SELECT lg FROM (SELECT lower(toString(s.login)) AS lg,
      [if(match(toString(ifNull(s.lvl3_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl3_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl4_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl4_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl5_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl5_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl6_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl6_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl7_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl7_management_unit_nm, '')))] AS slv,
      arrayStringConcat(arraySlice(slv, 1, if(arrayFirstIndex(x -> x = '', slv) = 0, toUInt32(5), toUInt32(arrayFirstIndex(x -> x = '', slv) - 1))), ' › ') AS op,
      toString(ifNull(s.emp_specialization_desc, '')) AS sp, toString(ifNull(s.emp_stream_desc, '')) AS st,
      toString(ifNull(s.hq_code, '')) AS hqc, toString(ifNull(s.it_code, '')) AS itc, toUInt8(ifNull(s.management_head_flg, 0) = 1) AS hdf,
      toString(ifNull(s.fio, '')) AS sfio, toString(ifNull(s.exp_nm, '')) AS sexp FROM prod_proteus.pa_staff s) WHERE 1 AND itc IN ('IT') AND hdf = 1) AND (e.dashboard_id, e.login) NOT IN (SELECT dashboard_id, login FROM prod_proteus.pa_pair WHERE own_flg = 1)
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
      toUInt8(1) AS inca
    FROM prod_proteus.pa_staff s
    WHERE lg NOT IN (SELECT lower(toString(login)) FROM prod_proteus.pa_pair
      WHERE dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(login)
        AND bitAnd(toUInt64(ifNull(msk_d, 0)), 1073741823) != 0 AND ifNull(own_flg, 0) = 0)
      AND (1 AND itc IN ('IT') AND hdf = 1)
      AND lg NOT IN (SELECT o FROM (SELECT arrayJoin(owners_string) AS o FROM prod_proteus.pa_dash_meta WHERE dashboard_id IN (SELECT dashboard_id FROM dash_ok))
        GROUP BY o HAVING count() = (SELECT count() FROM dash_ok))
  ),
  s1 AS (SELECT rl, op,
      if(rl = 'h', concat(toString(transform(sp, tupleElement((SELECT dz FROM dicts), 1), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 1)), toUInt32(0))), '|', toString(transform(st, tupleElement((SELECT dz FROM dicts), 2), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 2)), toUInt32(0))), '|', toString(hdf), '|', toString(transform(hqc, tupleElement((SELECT dz FROM dicts), 4), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 4)), toUInt32(0))), '|', toString(transform(itc, tupleElement((SELECT dz FROM dicts), 5), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 5)), toUInt32(0)))), '') AS hk,
      if(rl = 'n', concat(translate(lg, '|\t\n\r', '    '), '|', translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(sfio, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), '([А-Яа-яЁё][А-Яа-яЁё ]*)', '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', toString(transform(sp, tupleElement((SELECT dz FROM dicts), 1), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 1)), toUInt32(0))), '|', toString(transform(st, tupleElement((SELECT dz FROM dicts), 2), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 2)), toUInt32(0))), '|', toString(hdf), '|',
        toString(transform(hqc, tupleElement((SELECT dz FROM dicts), 4), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 4)), toUInt32(0))), '|', toString(transform(itc, tupleElement((SELECT dz FROM dicts), 5), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 5)), toUInt32(0))), '|', toString(acc), '|', toString(transform(sexp, tupleElement((SELECT dz FROM dicts), 3), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 3)), toUInt32(0)))), '') AS ln,
      count() AS c, countIf(acc = 1) AS ca, countIf(inca = 1) AS cn, countIf(inca = 1 AND acc = 1) AS cna
    FROM sv
    ARRAY JOIN ['h', 'n'] AS rl
    GROUP BY rl, op, hk, ln
  ),
  s2 AS (
    SELECT rl AS sec, op,
      arrayStringConcat(groupArray(if(rl = 'h', concat(hk, '|', toString(c), '|', toString(ca), '|', toString(cn), '|', toString(cna)), ln)), '\n') AS pk,
      sum(c) AS n, sumIf(c, rl = 'n') AS nn
    FROM s1 GROUP BY sec, op
  ),
  s3 AS (SELECT sec, op, pk, n, sum(nn) OVER () AS nnever FROM s2
  ),
  rnk AS (
    SELECT *,toUInt64(0) AS rn
    FROM agg
  )
SELECT CAST(section AS String) AS section, CAST(g AS String) AS g, CAST(k AS String) AS k, CAST(parent AS String) AS parent, CAST(n AS Int64) AS n
FROM (
  SELECT s_sec AS section, s_gg AS g, arrayStringConcat(groupArray(s_line), '\n') AS k,
    if(s_sec = 'list', translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(s_par, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), '([А-Яа-яЁё][А-Яа-яЁё ]*)', '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '') AS parent, toInt64(count()) AS n
  FROM (
    SELECT role AS s_sec, if(role = 'ctx', g, '') AS s_gg, if(role = 'list', parent, '') AS s_par,
      multiIf(
        role = 'list', k,
        role = 'ctx', concat(translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(k, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), '([А-Яа-яЁё][А-Яа-яЁё ]*)', '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(parent, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), '([А-Яа-яЁё][А-Яа-яЁё ]*)', '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', toString(users), '|', toString(users_prev), '|', toString(views), '|',
          toString(views_prev), '|', toString(new_u), '|', toString(regular), '|', toString(sleeping)),
        role = 'total', concat(toString(users), '|', toString(users_prev), '|', toString(views), '|', toString(views_prev), '|', toString(new_u), '|',
          toString(new_prev), '|', '0', '|', toString(regular), '|', toString(regular_prev), '|', toString(sleeping), '|',
          toString(mau), '|', toString(mau_prev), '|', toString(ca_prev), '|', toString(ca_regprev), '|', toString(ca_yr), '|',toString(toUInt64((SELECT uniqExact(lg0) FROM (SELECT lower(toString(login)) AS lg0 FROM prod_proteus.pa_pair
            WHERE dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(login) AND bitAnd(toUInt64(ifNull(msk_d, 0)), 1073741823) != 0 AND ifNull(own_flg, 0) = 0)
            WHERE lg0 NOT IN (SELECT lg FROM (SELECT lower(toString(s.login)) AS lg,
      [if(match(toString(ifNull(s.lvl3_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl3_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl4_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl4_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl5_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl5_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl6_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl6_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl7_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl7_management_unit_nm, '')))] AS slv,
      arrayStringConcat(arraySlice(slv, 1, if(arrayFirstIndex(x -> x = '', slv) = 0, toUInt32(5), toUInt32(arrayFirstIndex(x -> x = '', slv) - 1))), ' › ') AS op,
      toString(ifNull(s.emp_specialization_desc, '')) AS sp, toString(ifNull(s.emp_stream_desc, '')) AS st,
      toString(ifNull(s.hq_code, '')) AS hqc, toString(ifNull(s.it_code, '')) AS itc, toUInt8(ifNull(s.management_head_flg, 0) = 1) AS hdf,
      toString(ifNull(s.fio, '')) AS sfio, toString(ifNull(s.exp_nm, '')) AS sexp FROM prod_proteus.pa_staff s) WHERE 1 AND itc IN ('IT') AND hdf = 1)))), '|',
          toString(f1), '|', toString(f2), '|', toString(f3), '|', toString(f4)),
        role = 'coh', concat(k, '|', toString(cnt), '|', arrayStringConcat(arrayMap(x -> toString(x), am.1), ','), '|', arrayStringConcat(arrayMap(x -> toString(x), am.2), ',')),
        '') AS s_line
    FROM rnk
    WHERE role != 'ctx' OR (users > 0)
  )
  GROUP BY s_sec, s_gg, s_par
  UNION ALL
  SELECT x_sec AS section, '' AS g, arrayStringConcat(groupArray(concat(toString(x_k), '|', toString(x_u), '|', toString(x_n), '|',
      if(x_sec = 'ts', concat(toString(x_r), '|'), ''), toString(toInt64(ifNull(b.bviews, 0))))), '\n') AS k, '' AS parent, toInt64(count()) AS n
  FROM (SELECT x.1 AS x_sec, x.2 AS x_k, x.3 AS x_u, x.4 AS x_n, x.5 AS x_r, if(x.1 = 'ts', 'g', 'd') AS x_g
    FROM tc
    ARRAY JOIN arrayConcat(
      arrayMap((t, u) -> ('ts', toInt64(t), u, if(indexOf(tn.1, t) > 0, tn.2[indexOf(tn.1, t)], toUInt64(0)),
        if(indexOf(tr.1, t) > 0, tr.2[indexOf(tr.1, t)], toUInt64(0))), tu.1, tu.2),
      arrayMap((t, u) -> ('cal', toInt64(t), u, if(indexOf(cn.1, t) > 0, cn.2[indexOf(cn.1, t)], toUInt64(0)), toUInt64(0)), cu.1, cu.2)) AS x
    WHERE x.3 > 0
  ) z
  LEFT JOIN bv b ON b.gg = z.x_g AND b.bk = z.x_k
  GROUP BY x_sec
  UNION ALL
  SELECT 'area' AS section, '' AS g, '' AS k, 'd' AS parent, toInt64(greatest(tupleElement((SELECT h FROM maxd), 3) + 1, 0)) AS n
  UNION ALL
  SELECT 'md' AS section, '' AS g, toString(toDate(tupleElement((SELECT h FROM maxd), 1))) AS k, toString(tupleElement((SELECT h FROM maxd), 2)) AS parent, toInt64(0) AS n
  UNION ALL
  SELECT 'nm' AS section, '' AS g, '' AS k, '' AS parent, toInt64(0) AS n
  UNION ALL
  SELECT 'flt' AS section, '' AS g, '{"ca_it_f":["IT"],"ca_head_f":["1"]}' AS k, '' AS parent, toInt64(0) AS n
  UNION ALL
  SELECT 'sj' AS section, '' AS g, concat('{"staff":', toString((SELECT count() FROM prod_proteus.pa_staff)), ', "wide":0.3, "caMode":"cond", "ca":{"it":["IT"], "head":"1"}, "aud":{}}') AS k, '' AS parent, toInt64(0) AS n
  UNION ALL
  SELECT sec AS section, '' AS g, pk AS k, translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(op, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), '([А-Яа-яЁё][А-Яа-яЁё ]*)', '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%') AS parent, toInt64(n) AS n
  FROM s3
  WHERE sec = 'h' OR nnever <= 20000
  UNION ALL
  SELECT 'd' AS section, x.1 AS g, arrayStringConcat(arrayMap(v -> translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(v, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), '([А-Яа-яЁё][А-Яа-яЁё ]*)', '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), x.2), '\n') AS k, '' AS parent, toInt64(length(x.2)) AS n
  FROM (SELECT arrayJoin([('spec', dz.1), ('stream', dz.2), ('exp', dz.3), ('hq', dz.4), ('it', dz.5)]) AS x FROM dicts)
  UNION ALL
  SELECT 'acl' AS section, '' AS g, arrayStringConcat(groupArray(concat(translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(ad_group, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), '([А-Яа-яЁё][А-Яа-яЁё ]*)', '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', toString(cnt))), '\n') AS k, '' AS parent,
    toInt64((SELECT uniqExact(principal) FROM prod_proteus.pa_dash_acl WHERE kind = 'user' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok))) AS n
  FROM (
    SELECT toString(m.ad_group) AS ad_group, uniqExact(m.login) AS cnt
    FROM prod_proteus.pa_adg_member m
    WHERE m.ad_group IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'group' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok))
      AND m.login IN (SELECT login FROM prod_proteus.pa_staff)
    GROUP BY ad_group ORDER BY cnt DESC, ad_group LIMIT 40
  )
)
