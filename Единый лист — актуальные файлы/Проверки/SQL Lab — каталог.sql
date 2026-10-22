-- 1
-- Каталог единого листа (pa_body_one) — дефолт, ЦА по правам; строки section = 'aud' — вкладка «Аудитория».
-- Рендер без джини (для SQL Lab, база CROSS). Цифру в первой строке меняйте для повторного замера: SQL Lab кэширует результат.
WITH
  maxd AS (SELECT max(ifNull(md, dmax)) AS md FROM prod_proteus.pa_pair),
  dash_ok AS (
    SELECT dashboard_id
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1 AND published = 1 AND actual_flg = 1
  ),
  evd AS (SELECT [toInt32(ifNull(e.dashboard_id, 0))][1] AS did, [toString(ifNull(e.login, ''))][1] AS login,[toUInt64(ifNull(e.msk_d, 0))][1] AS msk, ifNull(e.v_d, 0) AS v_cur, e.dmax AS dmax,[toUInt64(ifNull(e.msk_d, 0))][1] AS pd, [toUInt64(ifNull(e.msk_w, 0))][1] AS pw, [toUInt64(ifNull(e.msk_m, 0))][1] AS pm
    FROM prod_proteus.pa_pair e
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(e.login) AND ifNull(e.own_flg, 0) = 0
  ),
  kx AS (SELECT kd, k0, login,
      groupBitOr(m0) AS msk, sum(v_cur) AS v_cur, max(dmax) AS dmax
    FROM (
      SELECT [arrayJoin(arrayConcat(
          array((toUInt8(0), '')),
          arrayMap(o -> (toUInt8(2), o), arrayDistinct(arrayFilter(o -> o != '', if(notEmpty(arrayFilter(x -> ifNull(x, '') != '', mm.owners_string)),
  arrayMap(x -> lower(trim(toString(ifNull(x, '')))), mm.owners_string), array(lower(trim(toString(ifNull(mm.owner_login, ''))))))))),
          arrayMap(c -> (toUInt8(3), toString(ifNull(c, ''))), arrayFilter(c -> isNotNull(c) AND c != '', mm.collection_names))
        ))][1] AS kk, kk.1 AS kd, kk.2 AS k0,
        p.login AS login, p.msk AS m0, p.v_cur AS v_cur, p.dmax AS dmax
      FROM evd p
      INNER JOIN prod_proteus.pa_dash_meta mm ON mm.dashboard_id = p.did
    )
    GROUP BY kd, k0, login
  ),
  agg AS (
    SELECT kd, k0, [countIf(bitAnd(msk, 1073741823) != 0)][1] AS users, sum(v_cur) AS views,
      [countIf(bitCount(bitAnd(msk, 1073741823)) >= 6)][1] AS regular_users,
      [dateDiff('day', toStartOfDay(max(dmax)), toStartOfDay((SELECT md FROM maxd)))][1] AS last_view_days, '' AS rhythm, toUInt64(0) AS ca_u
    FROM kx GROUP BY kd, k0
    UNION ALL
    SELECT toUInt8(1) AS kd, toString(did) AS k0, [countIf(bitAnd(msk, 1073741823) != 0)][1] AS users, sum(v_cur) AS views,
      [countIf(bitCount(bitAnd(msk, 1073741823)) >= 6)][1] AS regular_users,
      [dateDiff('day', toStartOfDay(max(dmax)), toStartOfDay((SELECT md FROM maxd)))][1] AS last_view_days,[arrayStringConcat(array(toString(countIf(multiIf(bitCount(bitAnd(pd, 1073741823)) >= 12, 4, bitCount(bitAnd(pw, 255)) >= 6, 3, bitCount(bitAnd(pm, 7)) >= 2, 2, bitAnd(pm, 7) != 0, 1, 0) = 4)), toString(countIf(multiIf(bitCount(bitAnd(pd, 1073741823)) >= 12, 4, bitCount(bitAnd(pw, 255)) >= 6, 3, bitCount(bitAnd(pm, 7)) >= 2, 2, bitAnd(pm, 7) != 0, 1, 0) = 3)), toString(countIf(multiIf(bitCount(bitAnd(pd, 1073741823)) >= 12, 4, bitCount(bitAnd(pw, 255)) >= 6, 3, bitCount(bitAnd(pm, 7)) >= 2, 2, bitAnd(pm, 7) != 0, 1, 0) = 2)), toString(countIf(multiIf(bitCount(bitAnd(pd, 1073741823)) >= 12, 4, bitCount(bitAnd(pw, 255)) >= 6, 3, bitCount(bitAnd(pm, 7)) >= 2, 2, bitAnd(pm, 7) != 0, 1, 0) = 1))), ',')][1] AS rhythm,[countIf(bitAnd(msk, 1073741823) != 0 AND acc = 1)][1] AS ca_u
    FROM (
      SELECT did, msk, v_cur, dmax, pd, pw, pm,toUInt8((did, lower(login)) IN (SELECT [toInt32(ifNull(dashboard_id, 0))][1], [toString(ifNull(login, ''))][1] FROM prod_proteus.pa_pair_acc)) AS acc
      FROM evd
    )
    GROUP BY did
  ),vz AS (
    SELECT lower(toString(login)) AS vl, groupBitOr(msk) AS vm, sum(v_cur) AS vv
    FROM evd
    GROUP BY vl
    HAVING bitAnd(vm, 1073741823) != 0
  ),
  va AS (SELECT lv, ol, sp, st, hqc, itc, hdf, count() AS sn,
      [countIf(ifNull(x.vl, '') != '')][1] AS u, sum(ifNull(x.vv, 0)) AS vw,
      [countIf(ifNull(x.vl, '') != '' AND bitCount(bitAnd(ifNull(x.vm, toUInt64(0)), 1073741823)) >= 6)][1] AS rg
    FROM (
      SELECT [lower(toString(s.login))][1] AS lg,
        [array(if(match(toString(ifNull(s.lvl3_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl3_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl4_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl4_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl5_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl5_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl6_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl6_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl7_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl7_management_unit_nm, ''))))][1] AS lv,
        [if(arrayFirstIndex(z -> z = '', lv) = 0, toUInt32(5), toUInt32(arrayFirstIndex(z -> z = '', lv) - 1))][1] AS ol,
        [arrayStringConcat(arraySlice(lv, 1, ol), ' › ')][1] AS op,
        [toString(ifNull(s.emp_specialization_desc, ''))][1] AS sp, [toString(ifNull(s.emp_stream_desc, ''))][1] AS st,
        [toString(ifNull(s.hq_code, ''))][1] AS hqc, [toString(ifNull(s.it_code, ''))][1] AS itc, [toUInt8(ifNull(s.management_head_flg, 0) = 1)][1] AS hdf
      FROM prod_proteus.pa_staff s
    ) t
    LEFT JOIN vz x ON x.vl = t.lg
    WHERE 1
    GROUP BY lv, ol, sp, st, hqc, itc, hdf
  ),
  ak AS (
    SELECT kk.1 AS ad, kk.2 AS ak0, kk.3 AS ap, sum(u) AS users, sum(vw) AS views, sum(rg) AS regular, sum(sn) AS staff
    FROM va
    ARRAY JOIN arrayConcat(
      arrayMap(i -> ('o', arrayStringConcat(arraySlice(lv, 1, i), ' › '), arrayStringConcat(arraySlice(lv, 1, toUInt32(i - 1)), ' › ')), range(1, ol + 1)),
      array(('s', sp, ''), ('t', st, ''), ('q', hqc, ''), ('i', itc, ''), ('h', toString(hdf), ''))) AS kk
    GROUP BY ad, ak0, ap
  ),pvd AS (
    SELECT [tuple(toInt64(dateDiff('day', toStartOfDay(dt), toStartOfDay(md))) - if(toDate(toStartOfDay(dt)) = dt, 0, 1),
      toInt64(dateDiff('day', dt, toDate(md))))][1] AS h
    FROM (SELECT md, [addDays(toDate(ds0), 90)][1] AS dt FROM (SELECT max(ifNull(md, dmax)) AS md, min(dmin) AS ds0 FROM prod_proteus.pa_pair))
  ),
  pvt AS (
    SELECT did FROM evd GROUP BY did ORDER BY countIf(bitAnd(msk, 1073741823) != 0) DESC, did LIMIT 500
  ),
  pva AS (SELECT did,
      countIf(cur) AS u, countIf(prv) AS up, sum(vc) AS v, sum(vpv) AS vp,
      [countIf(cur AND fk < 30 AND fk <= kt)][1] AS nu,
      [countIf(prv AND fk >= 30 AND fk < 60 AND fk <= kt)][1] AS np,
      [countIf(nbc > 5)][1] AS rg, [countIf(nbp > 5)][1] AS rgp, [countIf(prv AND NOT cur)][1] AS sl,
      [countIf(bitTest(mon, 1))][1] AS m1, [countIf(bitTest(mon, 2))][1] AS m2,
      [countIf(cur AND nbc <= 1)][1] AS f1, [countIf(nbc > 1 AND nbc <= 5)][1] AS f2,
      [countIf(nbc > 5 AND nbc <= 15)][1] AS f3, [countIf(nbc > 15)][1] AS f4,
      [sumForEach(arrayMap(i -> toUInt64(bitTest(msk, i)), range(30)))][1] AS tu,
      [sumForEach(arrayMap(i -> toUInt64(i = fk AND fk <= kt AND bitTest(msk, i)), range(30)))][1] AS tn,[sumForEach(arrayMap(i -> toUInt64(bitTest(msk, i) AND i != fk AND bitAnd(msk, toUInt64(bitShiftLeft(toUInt64(127), toUInt8(i + 1)))) = 0), range(30)))][1] AS tr,
      [sumForEach(arrayMap(i -> toUInt64(bitTest(mskd, i)), range(30, 60)))][1] AS cu,
      [sumForEach(arrayMap(i -> toUInt64(i = fdd AND fdd <= ktd AND bitTest(mskd, i)), range(30, 60)))][1] AS cn
    FROM (
      SELECT [toInt32(ifNull(e.dashboard_id, 0))][1] AS did, [toUInt64(ifNull(e.msk_d, 0))][1] AS msk, ifNull(e.v_d, 0) AS vc,
        [ifNull(e.vp_d, 0)][1] AS vpv, [ifNull(e.kmax_d, 0)][1] AS fk, [toUInt64(ifNull(e.msk_mon, 0))][1] AS mon,
        [toUInt64(ifNull(e.msk_d, 0))][1] AS mskd, ifNull(e.kmax_d, 0) AS fdd,
        bitAnd(msk, 1073741823) != 0 AS cur, bitAnd(msk, 1152921503533105152) != 0 AS prv,
        [bitCount(bitAnd(msk, 1073741823))][1] AS nbc, [bitCount(bitAnd(msk, 1152921503533105152))][1] AS nbp,
        [tupleElement((SELECT h FROM pvd), 1)][1] AS kt, [tupleElement((SELECT h FROM pvd), 2)][1] AS ktd
      FROM prod_proteus.pa_pair e
      WHERE e.dashboard_id IN (SELECT did FROM pvt) AND isNotNull(e.login) AND ifNull(e.own_flg, 0) = 0
    )
    GROUP BY did
  ),
  pvb AS (SELECT toInt32(dashboard_id) AS did,
      [sumForEach(arrayMap(i -> toInt64(if(toInt64(k) = toInt64(i), ifNull(views_nown, 0), 0)), range(30)))][1] AS tv
    FROM prod_proteus.pa_dash_bkt
    WHERE grain = 'd' AND dashboard_id IN (SELECT did FROM pvt) AND k >= 0 AND k < 30
    GROUP BY did
  )
SELECT CAST(section AS String) AS section, CAST(g AS String) AS g, CAST(k AS String) AS k, CAST(parent AS String) AS parent, CAST(n AS Int64) AS n
FROM (
  SELECT s_sec AS section, s_g AS g, [arrayStringConcat(arraySort(groupArray(s_line)), '\n')][1] AS k, 'd' AS parent, toInt64(count()) AS n
  FROM (
    SELECT [CAST(CASE WHEN kd = 0 THEN 'total' WHEN kd = 1 THEN 'rep' ELSE 'grp' END AS String)][1] AS s_sec,
      [multiIf(kd = 1, toString(intDiv(ifNull(toInt32OrNull(k0), toInt32(0)), 1000)), kd = 2, 'owner', kd = 3, 'collection', '')][1] AS s_g,
      [multiIf(
        kd = 1, concat(k0, '|', toString(users), '|', toString(views), '|', toString(regular_users), '|', toString(last_view_days), '|', rhythm, '|',
          toString(ifNull(c.ca_n, 0)), '|',
          toString(ifNull(c.ca_wide, 0)), '|', toString(ca_u), '|',
          translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(toString(ifNull(m.dashboard_nm, '')), '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', arrayStringConcat(arrayMap(o -> translate(o, '|\t\n\r', '    '), arrayDistinct(arrayFilter(o -> o != '', if(notEmpty(arrayFilter(x -> ifNull(x, '') != '', m.owners_string)),
  arrayMap(x -> lower(trim(toString(ifNull(x, '')))), m.owners_string), array(lower(trim(toString(ifNull(m.owner_login, ''))))))))), '^'), '|',
          arrayStringConcat(arrayMap(cc -> translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(cc, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), arrayFilter(cc -> cc != '', arrayMap(cc -> toString(ifNull(cc, '')), m.collection_names))), '^'), '|',
          toString(ifNull(m.published, 0)), '|', translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(toString(ifNull(m.certified_by, '')), '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', if(isNull(m.created_dt), '', toString(toDate(m.created_dt))), '|',translate(lower(trim(toString(ifNull(m.owner_login, '')))), '|\t\n\r', '    ')),
        kd = 0, concat(toString(users), '|', toString(views), '|', toString(regular_users), '|', toString(last_view_days)),
        concat(translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(k0, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', toString(users), '|', toString(views), '|', toString(regular_users), '|', toString(last_view_days)))][1] AS s_line
    FROM agg
    LEFT JOIN prod_proteus.pa_dash_meta m ON m.dashboard_id = if(kd = 1, ifNull(toInt32OrNull(k0), toInt32(0)), toInt32(0))
    LEFT JOIN prod_proteus.pa_dash_ca c ON c.dashboard_id = if(kd = 1, ifNull(toInt32OrNull(k0), toInt32(0)), toInt32(0))
  )
  GROUP BY s_sec, s_g
  UNION ALL
  SELECT 'sj' AS section, '' AS g, '{"period":"d", "flt":{}, "ca":1}' AS k, 'd' AS parent, toInt64(0) AS n
  UNION ALL
  SELECT 'aud' AS section, ad AS g,
    [arrayStringConcat(arraySort(groupArray(concat(translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(ak0, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(ap, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', toString(users), '|', toString(views), '|', toString(regular), '|', toString(staff)))), '\n')][1] AS k,
    '' AS parent, toInt64(count()) AS n
  FROM ak
  GROUP BY ad
  UNION ALL
  SELECT 'me' AS section, '' AS g,
    ifNull(nullIf((SELECT any(toString(lm.canon)) FROM prod_proteus.pa_login_map lm
      WHERE lm.login = lower(trim(''))), ''),
      [lower(trim(''))][1]) AS k,
    '' AS parent, toInt64(0) AS n
  UNION ALL
  SELECT 'aud' AS section, 'all' AS g, [concat('*||', toString(count()), '|', toString(sum(vv)), '|',
    toString(countIf(bitCount(bitAnd(vm, 1073741823)) >= 6)), '|0')][1] AS k, '' AS parent, toInt64(count()) AS n
  FROM vz
  UNION ALL
  SELECT 'pv' AS section, toString(a.did) AS g,
    [concat(toString(a.u), '|', toString(a.up), '|', toString(a.v), '|', toString(a.vp), '|', toString(a.nu), '|', toString(a.np), '|0|',
      toString(a.rg), '|', toString(a.rgp), '|', toString(a.sl), '|', toString(a.m1), '|', toString(a.m2), '|0|0|0|0|',
      toString(a.f1), '|', toString(a.f2), '|', toString(a.f3), '|', toString(a.f4), '\n',
      arrayStringConcat(arrayMap(x -> if(x = 0, '', toString(x)), a.tu), ','), '\n', arrayStringConcat(arrayMap(x -> if(x = 0, '', toString(x)), a.tn), ','), '\n',
      arrayStringConcat(arrayMap(x -> if(x = 0, '', toString(x)), a.tr), ','), '\n', arrayStringConcat(arrayMap(x -> if(x = 0, '', toString(x)), b.tv), ','), '\n',
      arrayStringConcat(arrayMap(x -> if(x = 0, '', toString(x)), a.cu), ','), '\n', arrayStringConcat(arrayMap(x -> if(x = 0, '', toString(x)), a.cn), ','))][1] AS k,
    '' AS parent, toInt64(a.u) AS n
  FROM pva a
  LEFT JOIN pvb b ON b.did = a.did
  UNION ALL
  SELECT 'pvh' AS section, 'd' AS g, '' AS k, '' AS parent, [toInt64(greatest(tupleElement((SELECT h FROM pvd), 1) + 1, 0))][1] AS n
)
