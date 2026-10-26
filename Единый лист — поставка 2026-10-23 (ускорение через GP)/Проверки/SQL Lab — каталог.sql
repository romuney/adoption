-- 1
-- Каталог единого листа (pa_body_one) — дефолт, ЦА по правам; строки section = 'aud' — вкладка «Аудитория».
-- Рендер без джини (для SQL Lab, база CROSS). Цифру в первой строке меняйте для повторного замера: SQL Lab кэширует результат.
WITH
  maxd AS (SELECT max(assumeNotNull(md)) AS md FROM prod_proteus.pa_md),
  dash_ok AS (
    SELECT dashboard_id
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1 AND published = 1 AND actual_flg = 1
  ),
  evd AS (SELECT [toInt32(ifNull(e.dashboard_id, 0))][1] AS did, [toString(ifNull(e.login, ''))][1] AS login,[toUInt64(ifNull(e.msk_d, 0))][1] AS msk, ifNull(e.v_d, 0) AS v_cur, e.dmax AS dmax,[toUInt64(ifNull(e.msk_d, 0))][1] AS pd, [toUInt64(ifNull(e.msk_w, 0))][1] AS pw, [toUInt64(ifNull(e.msk_m, 0))][1] AS pm,[ifNull(e.vp_d, 0)][1] AS vp_cur, [ifNull(e.kmax_d, 0)][1] AS fk, [toUInt64(ifNull(e.msk_mon, 0))][1] AS mon, ifNull(e.kmax_d, 0) AS fdd
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
  agg AS (SELECT toUInt8(ifNull(kd, 0)) AS kd, [toString(ifNull(k0, ''))][1] AS k0, [toUInt64(ifNull(u_d, 0))][1] AS users,
      [toInt64(ifNull(v_d, 0))][1] AS views, [toUInt64(ifNull(r_d, 0))][1] AS regular_users,
      toInt64(ifNull(l, 0)) AS last_view_days, '' AS rhythm, toUInt64(0) AS ca_u
    FROM prod_proteus.pa_cat_grp
    WHERE ifNull(pub, -1) = 1 AND ifNull(act, -1) = 1 AND ifNull(exc, -1) = 1
    UNION ALL
    SELECT toUInt8(1) AS kd, [toString(ifNull(dashboard_id, 0))][1] AS k0, [toUInt64(ifNull(u_d, 0))][1] AS users,
      [toInt64(ifNull(v_d, 0))][1] AS views, [toUInt64(ifNull(r_d, 0))][1] AS regular_users,
      toInt64(ifNull(l, 0)) AS last_view_days,
      [arrayStringConcat(array(toString(ifNull(h4, 0)), toString(ifNull(h3, 0)), toString(ifNull(h2, 0)), toString(ifNull(h1, 0))), ',')][1] AS rhythm, [toUInt64(ifNull(a_d, 0))][1] AS ca_u
    FROM prod_proteus.pa_cat_rep
    WHERE ifNull(exc, -1) = 1 AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)
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
      SELECT [toString(ifNull(s.login, ''))][1] AS lg, [arrayMap(x -> toString(ifNull(x, '')), s.slv)][1] AS lv, [toUInt32(ifNull(s.sol, 0))][1] AS ol, [toString(ifNull(s.op, ''))][1] AS op,
        [toString(ifNull(s.sp, ''))][1] AS sp, [toString(ifNull(s.st, ''))][1] AS st,
        [toString(ifNull(s.hqc, ''))][1] AS hqc, [toString(ifNull(s.itc, ''))][1] AS itc, [toUInt8(ifNull(s.hdf, 0) = 1)][1] AS hdf
      FROM prod_proteus.pa_staffx s
    ) t
    LEFT JOIN vz x ON x.vl = t.lg
    WHERE 1
    GROUP BY lv, ol, sp, st, hqc, itc, hdf
  ),
  ak AS (
    SELECT [toString(ifNull(ad, ''))][1] AS ad, [toString(ifNull(ak0, ''))][1] AS ak0, [toString(ifNull(ap, ''))][1] AS ap, [toUInt64(ifNull(u_d, 0))][1] AS users,
      [toInt64(ifNull(v_d, 0))][1] AS views, [toUInt64(ifNull(r_d, 0))][1] AS regular, [toUInt64(ifNull(staff, 0))][1] AS staff
    FROM prod_proteus.pa_cat_aud
    WHERE ifNull(pub, -1) = 1 AND ifNull(act, -1) = 1 AND ifNull(exc, -1) = 1
  ),pvd AS (SELECT [tuple(toInt64(dateDiff('day', toStartOfDay(dt), toStartOfDay(md))) - if(toDate(toStartOfDay(dt)) = dt, 0, 1),
      toInt64(dateDiff('day', dt, toDate(md))), cs, toInt64(dateDiff('day', cs, toDate(md)) + 1))][1] AS h
    FROM (SELECT md, [addDays(toDate(ds0), 90)][1] AS dt,
        [greatest(toDate(toStartOfDay(md) - toIntervalDay(29)), toDate(ds0))][1] AS cs
      FROM (SELECT max(assumeNotNull(md)) AS md, min(assumeNotNull(ds)) AS ds0 FROM prod_proteus.pa_md))
  ),
  pvt AS (
    SELECT toInt32(k0) AS did FROM agg WHERE kd = 1 ORDER BY users DESC, did LIMIT 500
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
    FROM (SELECT did, msk, v_cur AS vc, vp_cur AS vpv, fk, mon, pd AS mskd, fdd,
        bitAnd(msk, 1073741823) != 0 AS cur, bitAnd(msk, 1152921503533105152) != 0 AS prv,
        [bitCount(bitAnd(msk, 1073741823))][1] AS nbc, [bitCount(bitAnd(msk, 1152921503533105152))][1] AS nbp,
        [tupleElement((SELECT h FROM pvd), 1)][1] AS kt, [tupleElement((SELECT h FROM pvd), 2)][1] AS ktd, [tupleElement((SELECT h FROM pvd), 4)][1] AS cd
      FROM evd
      WHERE did IN (SELECT did FROM pvt)
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
  WHERE ad != 'all'
  GROUP BY ad
  UNION ALL
  SELECT 'me' AS section, '' AS g,
    ifNull(nullIf((SELECT any(toString(lm.canon)) FROM prod_proteus.pa_login_map lm
      WHERE lm.login = lower(trim(''))), ''),
      [lower(trim(''))][1]) AS k,
    '' AS parent, toInt64(0) AS n
  UNION ALL
  SELECT 'aud' AS section, 'all' AS g, [concat('*||', toString(users), '|', toString(views), '|', toString(regular), '|0')][1] AS k, '' AS parent, toInt64(users) AS n
  FROM ak WHERE ad = 'all'
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
