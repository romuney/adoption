-- 1
-- ЗАМЕР БОЯ ОДНИМ ЗАПРОСОМ: SQL Lab (база CROSS) → «Выполнить» → прислать таблицу и ВРЕМЯ выполнения (зелёная плашка).
-- Внутри — те же запросы, что шлют чарты единого листа: шапка, каталог (без ЦА и с ЦА «IT + руководители»),
-- панель (весь Proteus, самый популярный отчёт — подставляется сам, ЦА «IT + руководители»), и размеры витрин pa_*.
-- rows_or_n — строк ответа датасета (у витрин — строк в таблице), answer_kb — КБ ответа (как уйдёт в браузер, без JSON).
-- Если в бою код IT называется иначе — замените 'IT' (поиском) на значение из выпадашки «IT» строки ЦА.
-- Цифру в первой строке меняйте для повторного замера: SQL Lab кэширует результат.
SELECT item, rows_or_n, answer_kb FROM (
SELECT '1 шапка' AS item, toFloat64(count()) AS rows_or_n, round(sum(length(k)) / 1024) AS answer_kb FROM (
WITH
  st AS (
    SELECT toString(login) AS lg, [array(if(match(toString(ifNull(lvl3_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(lvl3_management_unit_nm, ''))), if(match(toString(ifNull(lvl4_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(lvl4_management_unit_nm, ''))), if(match(toString(ifNull(lvl5_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(lvl5_management_unit_nm, ''))),
        if(match(toString(ifNull(lvl6_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(lvl6_management_unit_nm, ''))), if(match(toString(ifNull(lvl7_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(lvl7_management_unit_nm, ''))))][1] AS lv,
      [if(arrayFirstIndex(x -> x = '', lv) = 0, toUInt32(length(lv)), toUInt32(arrayFirstIndex(x -> x = '', lv) - 1))][1] AS ol,
      [arrayStringConcat(arraySlice(lv, 1, ol), ' › ')][1] AS opath,
      [toString(ifNull(emp_specialization_desc, ''))][1] AS spec, [toString(ifNull(emp_stream_desc, ''))][1] AS stream,
      [toUInt8(ifNull(management_head_flg, 0) = 1)][1] AS hd, [toString(ifNull(hq_code, ''))][1] AS hq, [toString(ifNull(it_code, ''))][1] AS it
    FROM prod_proteus.pa_staff
  ),
  gg AS (SELECT opath, [lower(hex(toUInt32(cityHash64(spec) % 4294967296)))][1] AS sid, [lower(hex(toUInt32(cityHash64(stream) % 4294967296)))][1] AS tid, hd, [lower(hex(toUInt32(cityHash64(hq) % 4294967296)))][1] AS qid, [lower(hex(toUInt32(cityHash64(it) % 4294967296)))][1] AS iid, count() AS c
    FROM st
    GROUP BY opath, sid, tid, hd, qid, iid
  )
SELECT CAST('s' AS String) AS section, CAST('' AS String) AS g,
  [arrayStringConcat(arraySort(groupArray(arrayStringConcat(array(sid, tid, toString(hd), qid, iid, toString(c)), '\t'))), '\n')][1] AS k,
  CAST(opath AS String) AS parent, toInt64(sum(c)) AS n
FROM gg GROUP BY opath
UNION ALL
SELECT 'd' AS section, dg AS g, [lower(hex(toUInt32(cityHash64(dv) % 4294967296)))][1] AS k, dv AS parent, toInt64(0) AS n
FROM (SELECT DISTINCT [arrayJoin(array(('spec', spec), ('stream', stream), ('hq', hq), ('it', it)))][1] AS dd, dd.1 AS dg, dd.2 AS dv FROM st)
UNION ALL
SELECT 'adg' AS section, '' AS g, toString(z.ad_group) AS k, '' AS parent, toInt64(0) AS n FROM prod_proteus.pa_adg_size z
WHERE ifNull(z.n, 0) > 0 AND NOT match(toString(ifNull(z.ad_group, '')), '^(?:\\s|\\p{P})*$')
UNION ALL
SELECT 'total' AS section, '' AS g, '' AS k, '' AS parent, toInt64(count()) AS n FROM prod_proteus.pa_staff
UNION ALL
SELECT 'md' AS section, '' AS g, ifNull(toString(toDate((SELECT md FROM prod_proteus.pa_pair WHERE isNotNull(md) LIMIT 1))), '') AS k,ifNull(toString(toDate((SELECT min(dmin) FROM prod_proteus.pa_pair))), '') AS parent, toInt64(0) AS n
)
UNION ALL
SELECT '2 каталог' AS item, toFloat64(count()) AS rows_or_n, round(sum(length(k)) / 1024) AS answer_kb FROM (
WITH
  maxd AS (SELECT max(ifNull(md, dmax)) AS md FROM prod_proteus.pa_pair),
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
  ),pvd AS (SELECT [tuple(toInt64(dateDiff('day', toStartOfDay(dt), toStartOfDay(md))) - if(toDate(toStartOfDay(dt)) = dt, 0, 1),
      toInt64(dateDiff('day', dt, toDate(md))), cs, toInt64(dateDiff('day', cs, toDate(md)) + 1))][1] AS h
    FROM (SELECT md, [addDays(toDate(ds0), 90)][1] AS dt,
        [greatest(toDate(toStartOfDay(md) - toIntervalDay(29)), toDate(ds0))][1] AS cs
      FROM (SELECT max(ifNull(md, dmax)) AS md, min(dmin) AS ds0 FROM prod_proteus.pa_pair))
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
)
UNION ALL
SELECT '3 каталог · ЦА IT-руководители' AS item, toFloat64(count()) AS rows_or_n, round(sum(length(k)) / 1024) AS answer_kb FROM (
WITH
  maxd AS (SELECT max(ifNull(md, dmax)) AS md FROM prod_proteus.pa_pair),
  dash_ok AS (
    SELECT dashboard_id
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1 AND published = 1 AND actual_flg = 1
  ),
  evd AS (SELECT [toInt32(ifNull(e.dashboard_id, 0))][1] AS did, [toString(ifNull(e.login, ''))][1] AS login,[toUInt64(ifNull(e.msk_d, 0))][1] AS msk, ifNull(e.v_d, 0) AS v_cur, e.dmax AS dmax,[toUInt64(ifNull(e.msk_d, 0))][1] AS pd, [toUInt64(ifNull(e.msk_w, 0))][1] AS pw, [toUInt64(ifNull(e.msk_m, 0))][1] AS pm,[ifNull(e.vp_d, 0)][1] AS vp_cur, [ifNull(e.kmax_d, 0)][1] AS fk, [toUInt64(ifNull(e.msk_mon, 0))][1] AS mon, ifNull(e.kmax_d, 0) AS fdd
    FROM prod_proteus.pa_pair e
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(e.login) AND ifNull(e.own_flg, 0) = 0 AND lower(toString(e.login)) IN (SELECT lg FROM (
      SELECT [lower(toString(s.login))][1] AS lg,
        [array(if(match(toString(ifNull(s.lvl3_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl3_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl4_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl4_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl5_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl5_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl6_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl6_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl7_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl7_management_unit_nm, ''))))][1] AS lvz,
        [arrayStringConcat(arraySlice(lvz, 1, if(arrayFirstIndex(x -> x = '', lvz) = 0, toUInt32(5), toUInt32(arrayFirstIndex(x -> x = '', lvz) - 1))), ' › ')][1] AS op,
        [toString(ifNull(s.emp_specialization_desc, ''))][1] AS sp, [toString(ifNull(s.emp_stream_desc, ''))][1] AS st,
        [toString(ifNull(s.hq_code, ''))][1] AS hqc, [toString(ifNull(s.it_code, ''))][1] AS itc, [toUInt8(ifNull(s.management_head_flg, 0) = 1)][1] AS hdf
      FROM prod_proteus.pa_staff s) WHERE 1 AND itc IN ('IT') AND hdf = 1)
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
      SELECT did, msk, v_cur, dmax, pd, pw, pm,toUInt8(1) AS acc
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
    WHERE 1 AND itc IN ('IT') AND hdf = 1
    GROUP BY lv, ol, sp, st, hqc, itc, hdf
  ),
  ak AS (
    SELECT kk.1 AS ad, kk.2 AS ak0, kk.3 AS ap, sum(u) AS users, sum(vw) AS views, sum(rg) AS regular, sum(sn) AS staff
    FROM va
    ARRAY JOIN arrayConcat(
      arrayMap(i -> ('o', arrayStringConcat(arraySlice(lv, 1, i), ' › '), arrayStringConcat(arraySlice(lv, 1, toUInt32(i - 1)), ' › ')), range(1, ol + 1)),
      array(('s', sp, ''), ('t', st, ''), ('q', hqc, ''), ('i', itc, ''), ('h', toString(hdf), ''))) AS kk
    GROUP BY ad, ak0, ap
  ),pvd AS (SELECT [tuple(toInt64(dateDiff('day', toStartOfDay(dt), toStartOfDay(md))) - if(toDate(toStartOfDay(dt)) = dt, 0, 1),
      toInt64(dateDiff('day', dt, toDate(md))), cs, toInt64(dateDiff('day', cs, toDate(md)) + 1))][1] AS h
    FROM (SELECT md, [addDays(toDate(ds0), 90)][1] AS dt,
        [greatest(toDate(toStartOfDay(md) - toIntervalDay(29)), toDate(ds0))][1] AS cs
      FROM (SELECT max(ifNull(md, dmax)) AS md, min(dmin) AS ds0 FROM prod_proteus.pa_pair))
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
      [sumForEach(arrayMap(i -> toInt64(if(toInt64(k) = toInt64(i), vv, 0)), range(30)))][1] AS tv
    FROM (
      SELECT e.dashboard_id AS dashboard_id, [toInt64(dateDiff('day', toStartOfDay(e.log_dttm), toStartOfDay((SELECT md FROM maxd))))][1] AS k, toInt64(sum(e.views)) AS vv
      FROM prod_proteus.pa_evd_day e
      WHERE e.dashboard_id IN (SELECT did FROM pvt)
        AND e.log_dttm >= toDateTime(toStartOfDay((SELECT md FROM maxd)) - toIntervalDay(29))
        AND (toInt32(ifNull(e.dashboard_id, 0)), toString(ifNull(e.login, ''))) IN (SELECT did, login FROM evd WHERE did IN (SELECT did FROM pvt))
      GROUP BY dashboard_id, k
      HAVING k >= 0 AND k < 30
    )
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
          toString((SELECT count() FROM (SELECT lg FROM (
      SELECT lower(toString(s.login)) AS lg,
        array(if(match(toString(ifNull(s.lvl3_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl3_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl4_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl4_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl5_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl5_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl6_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl6_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl7_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl7_management_unit_nm, '')))) AS lvz,
        arrayStringConcat(arraySlice(lvz, 1, if(arrayFirstIndex(x -> x = '', lvz) = 0, toUInt32(5), toUInt32(arrayFirstIndex(x -> x = '', lvz) - 1))), ' › ') AS op,
        toString(ifNull(s.emp_specialization_desc, '')) AS sp, toString(ifNull(s.emp_stream_desc, '')) AS st,
        toString(ifNull(s.hq_code, '')) AS hqc, toString(ifNull(s.it_code, '')) AS itc, toUInt8(ifNull(s.management_head_flg, 0) = 1) AS hdf
      FROM prod_proteus.pa_staff s) WHERE 1 AND itc IN ('IT') AND hdf = 1)) - ifNull(oc.n_own, 0)), '|',
          toString(toUInt8(0)), '|', toString(ca_u), '|',
          translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(toString(ifNull(m.dashboard_nm, '')), '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', arrayStringConcat(arrayMap(o -> translate(o, '|\t\n\r', '    '), arrayDistinct(arrayFilter(o -> o != '', if(notEmpty(arrayFilter(x -> ifNull(x, '') != '', m.owners_string)),
  arrayMap(x -> lower(trim(toString(ifNull(x, '')))), m.owners_string), array(lower(trim(toString(ifNull(m.owner_login, ''))))))))), '^'), '|',
          arrayStringConcat(arrayMap(cc -> translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(cc, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), arrayFilter(cc -> cc != '', arrayMap(cc -> toString(ifNull(cc, '')), m.collection_names))), '^'), '|',
          toString(ifNull(m.published, 0)), '|', translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(toString(ifNull(m.certified_by, '')), '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', if(isNull(m.created_dt), '', toString(toDate(m.created_dt))), '|',translate(lower(trim(toString(ifNull(m.owner_login, '')))), '|\t\n\r', '    ')),
        kd = 0, concat(toString(users), '|', toString(views), '|', toString(regular_users), '|', toString(last_view_days)),
        concat(translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(k0, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', toString(users), '|', toString(views), '|', toString(regular_users), '|', toString(last_view_days)))][1] AS s_line
    FROM agg
    LEFT JOIN prod_proteus.pa_dash_meta m ON m.dashboard_id = if(kd = 1, ifNull(toInt32OrNull(k0), toInt32(0)), toInt32(0))
    LEFT JOIN prod_proteus.pa_dash_ca c ON c.dashboard_id = if(kd = 1, ifNull(toInt32OrNull(k0), toInt32(0)), toInt32(0))
    LEFT JOIN (SELECT dashboard_id, toInt64(count()) AS n_own FROM (SELECT dashboard_id, [lower(toString(arrayJoin(owners_string)))][1] AS ow FROM prod_proteus.pa_dash_meta)
      WHERE ow IN (SELECT lg FROM (
      SELECT [lower(toString(s.login))][1] AS lg,
        [array(if(match(toString(ifNull(s.lvl3_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl3_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl4_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl4_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl5_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl5_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl6_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl6_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl7_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl7_management_unit_nm, ''))))][1] AS lvz,
        [arrayStringConcat(arraySlice(lvz, 1, if(arrayFirstIndex(x -> x = '', lvz) = 0, toUInt32(5), toUInt32(arrayFirstIndex(x -> x = '', lvz) - 1))), ' › ')][1] AS op,
        [toString(ifNull(s.emp_specialization_desc, ''))][1] AS sp, [toString(ifNull(s.emp_stream_desc, ''))][1] AS st,
        [toString(ifNull(s.hq_code, ''))][1] AS hqc, [toString(ifNull(s.it_code, ''))][1] AS itc, [toUInt8(ifNull(s.management_head_flg, 0) = 1)][1] AS hdf
      FROM prod_proteus.pa_staff s) WHERE 1 AND itc IN ('IT') AND hdf = 1) GROUP BY dashboard_id) oc ON oc.dashboard_id = if(kd = 1, ifNull(toInt32OrNull(k0), toInt32(0)), toInt32(0))
  )
  GROUP BY s_sec, s_g
  UNION ALL
  SELECT 'sj' AS section, '' AS g, '{"period":"d", "flt":{"ca_it_f":["IT"],"ca_head_f":["1"]}, "ca":1}' AS k, 'd' AS parent, toInt64(0) AS n
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
)
UNION ALL
SELECT '4 панель · весь Proteus' AS item, toFloat64(count()) AS rows_or_n, round(sum(length(k)) / 1024) AS answer_kb FROM (
WITH
  maxd AS (
    SELECT [tuple(md, ds, toInt64(dateDiff('day', toStartOfDay(dt), toStartOfDay(md))) - if(toDate(toStartOfDay(dt)) = dt, 0, 1),
      toInt64(dateDiff('day', dt, toDate(md))))][1] AS h
    FROM (SELECT md, toDate(ds0) AS ds, [addDays(toDate(ds0), 90)][1] AS dt
          FROM (SELECT max(ifNull(md, dmax)) AS md, min(dmin) AS ds0 FROM prod_proteus.pa_pair))
  ),
  dicts AS (
    SELECT [tuple(arraySort(groupUniqArrayIf(dv, dg = 'spec')), arraySort(groupUniqArrayIf(dv, dg = 'stream')), arraySort(groupUniqArrayIf(dv, dg = 'exp')),
      arraySort(groupUniqArrayIf(dv, dg = 'hq')), arraySort(groupUniqArrayIf(dv, dg = 'it')))][1] AS dz
    FROM (SELECT dd.1 AS dg, dd.2 AS dv FROM (
      SELECT [arrayJoin(array(('spec', toString(ifNull(emp_specialization_desc, ''))), ('stream', toString(ifNull(emp_stream_desc, ''))),
        ('exp', toString(ifNull(exp_nm, ''))), ('hq', toString(ifNull(hq_code, ''))), ('it', toString(ifNull(it_code, '')))))][1] AS dd FROM prod_proteus.pa_staff
      UNION ALL
      SELECT [arrayJoin(array(('spec', toString(ifNull(emp_specialization_desc, ''))), ('stream', toString(ifNull(emp_stream_desc, ''))),
        ('exp', toString(ifNull(exp_nm, '')))))][1] AS dd FROM prod_proteus.pa_emp_attrs
      UNION ALL
      SELECT [arrayJoin(array(('spec', ''), ('stream', ''), ('exp', ''), ('hq', ''), ('it', '')))][1] AS dd))
  ),
  dash_ok AS (
    SELECT dashboard_id
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1 AND published = 1 AND actual_flg = 1
  ),
  evd AS (SELECT [toString(ifNull(e.login, ''))][1] AS login, [lower(toString(ifNull(e.login, '')))][1] AS lg,
      groupBitOr(toUInt64(ifNull(e.msk_d, 0))) AS msk,
      [sum(ifNull(e.v_d, 0))][1] AS v_cur,
      [sum(ifNull(e.vp_d, 0))][1] AS v_prev,
      [max(ifNull(e.kmax_d, 0))][1] AS fd_k,
      max(e.dmax) AS dmax,
      [groupBitOr(toUInt64(ifNull(e.msk_mon, 0)))][1] AS mon,[groupBitOr(toUInt64(ifNull(e.msk_d, 0)))][1] AS mskd,
      [max(ifNull(e.kmax_d, 0))][1] AS fd_d
    FROM prod_proteus.pa_pair e
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(e.login) AND ifNull(e.own_flg, 0) = 0
    GROUP BY e.login
  ),
  pr AS (SELECT p.msk AS msk, p.v_cur AS v_cur, p.v_prev AS v_prev,
      p.fd_k AS fd_k, p.fd_d AS fd_d, [toUInt8(bitTest(p.mon, 1))][1] AS m1, [toUInt8(bitTest(p.mon, 2))][1] AS m2,[arrayMap(i -> toInt64(i), arrayFilter(i -> bitTest(p.mon, i), range(63)))][1] AS bms,
      [if(empty(bms), toInt64(0), arrayMax(bms))][1] AS gm,
      [addMonths(toStartOfMonth(tupleElement((SELECT h FROM maxd), 1)), -toInt32(gm))][1] AS c0,
      bitAnd(p.msk, 1073741823) != 0 AS cur, [bitAnd(p.msk, 1152921503533105152)][1] != 0 AS prv,
      [bitCount(bitAnd(p.msk, 1073741823))][1] AS nb_cur, [bitCount(bitAnd(p.msk, 1152921503533105152))][1] AS nb_prev,
      [multiIf(nb_cur <= 1, 1, nb_cur <= 5, 2, nb_cur <= 15, 3, 4)][1] AS bin,
      [if(match(toString(ifNull(a.lvl3_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(a.lvl3_management_unit_nm, '')))][1] AS lvl3, [if(match(toString(ifNull(a.lvl4_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(a.lvl4_management_unit_nm, '')))][1] AS lvl4,[array(lvl3, lvl4, if(match(toString(ifNull(a.lvl5_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(a.lvl5_management_unit_nm, ''))), if(match(toString(ifNull(a.lvl6_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(a.lvl6_management_unit_nm, ''))), if(match(toString(ifNull(a.lvl7_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(a.lvl7_management_unit_nm, ''))))][1] AS lv,[if(arrayFirstIndex(x -> x = '', lv) = 0, toUInt32(length(lv)), toUInt32(arrayFirstIndex(x -> x = '', lv) - 1))][1] AS ol,
      [arrayStringConcat(arraySlice(lv, 1, ol), ' › ')][1] AS opath,
      [toString(ifNull(a.emp_specialization_desc, ''))][1] AS spec, [toString(ifNull(a.emp_stream_desc, ''))][1] AS stream,
      [toUInt8(ifNull(a.management_head_flg, 0) = 1)][1] AS is_head,
      [arrayFilter(x -> x >= 1 AND x <= 11, arrayMap(y -> gm - y, bms))][1] AS ags,[toUInt8(p.stf = 1 AND p.acc = 1)][1] AS inca,
      [toUInt8(bitAnd(p.mon, toUInt64(bitShiftLeft(toUInt64(1), toUInt8(toMonth(tupleElement((SELECT h FROM maxd), 1))))) - 1) != 0)][1] AS yr,[concat(translate(p.login, '|\t\n\r', '    '), '|', translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(toString(ifNull(a.fio, '')), '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', toString(transform(spec, tupleElement((SELECT dz FROM dicts), 1), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 1)), toUInt32(0))), '|', toString(transform(stream, tupleElement((SELECT dz FROM dicts), 2), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 2)), toUInt32(0))), '|',
        toString(transform(toString(ifNull(a.exp_nm, '')), tupleElement((SELECT dz FROM dicts), 3), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 3)), toUInt32(0))), '|',
        toString(bitAnd(p.msk, 1073741823)), '|', toString(bitShiftRight(p.msk, 30)), '|', toString(p.fd_k), '|', toString(p.v_cur), '|',
        toString(if(isNull(p.dmax), toInt64(-1), toInt64(dateDiff('day', toStartOfDay(p.dmax), toStartOfDay(tupleElement((SELECT h FROM maxd), 1)))))), '|',
        toString(is_head + 2 * m1 + 4 * m2 + 8 * yr + 16 * p.stf + 32 * p.acc + 64 * inca), '|', toString(transform(p.hq, tupleElement((SELECT dz FROM dicts), 4), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 4)), toUInt32(0))), '|', toString(transform(p.it, tupleElement((SELECT dz FROM dicts), 5), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 5)), toUInt32(0))))][1] AS pln,
      [arrayJoin(arrayConcat(
        array(('total', '', '', '', toInt64(-1))),
        if(cur OR prv, arrayMap(i -> ('ctx', 'org', arrayStringConcat(arraySlice(lv, 1, i), ' › '), arrayStringConcat(arraySlice(lv, 1, toUInt32(i - 1)), ' › '), toInt64(-1)), range(1, ol + 1)), array()),
        if((cur OR prv) AND spec != '', array(('ctx', 'spec', spec, '', toInt64(-1))), array()),
        if((cur OR prv) AND stream != '', array(('ctx', 'stream', stream, '', toInt64(-1))), array()),
        if((cur OR prv) AND is_head = 1, array(('ctx', 'head', '1', '', toInt64(-1))), array()),
        if(cur, array(('list', '', pln, opath, toInt64(-1))), array()),
        if(gm < 12, array(('coh', '', toString(c0), '', toInt64(-1))), array())))][1] AS rk
    FROM (SELECT e.*, [toUInt8(ifNull(s.login, '') != '')][1] AS stf, [toUInt8(e.lg IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'user' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)
        UNION ALL
        SELECT m.login FROM prod_proteus.pa_adg_member m
        WHERE m.ad_group IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'group' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok))))][1] AS acc,
        [toString(ifNull(s.hq_code, ''))][1] AS hq, [toString(ifNull(s.it_code, ''))][1] AS it
      FROM evd e
      LEFT JOIN prod_proteus.pa_staff s ON s.login = e.lg
    ) p
    LEFT JOIN prod_proteus.pa_emp_attrs a ON a.login = p.login
  ),
  agg AS (
    SELECT rk.1 AS role, rk.2 AS g, rk.3 AS k, rk.4 AS parent,
      countIf(cur) AS users, countIf(prv) AS users_prev,
      sum(v_cur) AS views, sum(v_prev) AS views_prev,
      [countIf(cur AND fd_k < 30 AND fd_k <= tupleElement((SELECT h FROM maxd), 3))][1] AS new_u,
      [countIf(prv AND fd_k >= 30 AND fd_k < 60 AND fd_k <= tupleElement((SELECT h FROM maxd), 3))][1] AS new_prev,[countIf(cur AND bin = 1)][1] AS f1, [countIf(cur AND bin = 2)][1] AS f2, [countIf(cur AND bin = 3)][1] AS f3, [countIf(cur AND bin = 4)][1] AS f4,
      [countIf(nb_cur > 5)][1] AS regular, [countIf(nb_prev > 5)][1] AS regular_prev,
      [countIf(prv AND NOT cur)][1] AS sleeping,
      countIf(m1 = 1) AS mau, countIf(m2 = 1) AS mau_prev,
      count() AS cnt,
      [countIf(prv AND inca = 1)][1] AS ca_prev, [countIf(nb_prev > 5 AND inca = 1)][1] AS ca_regprev,
      [countIf(yr = 1 AND inca = 1)][1] AS ca_yr, [countIf(cur AND inca = 0)][1] AS ca_out,
      [sumMap(if(rk.1 = 'coh', ags, CAST(array(), 'Array(Int64)')), if(rk.1 = 'coh', arrayMap(x -> toUInt64(1), ags), CAST(array(), 'Array(UInt64)')))][1] AS am
    FROM pr
    GROUP BY role, g, k, parent
  ),
  tc AS (SELECT [sumMap(tb, arrayWithConstant(length(tb), toUInt64(1)))][1] AS tu,
      [sumMap(tf, arrayWithConstant(length(tf), toUInt64(1)))][1] AS tn,
      [sumMap(tr0, arrayWithConstant(length(tr0), toUInt64(1)))][1] AS tr,
      [sumMap(cb, arrayWithConstant(length(cb), toUInt64(1)))][1] AS cu,
      [sumMap(cf, arrayWithConstant(length(cf), toUInt64(1)))][1] AS cn
    FROM (
      SELECT [arrayMap(x -> toUInt16(x), bitPositionsToArray(bitAnd(msk, 1073741823)))][1] AS tb,[if(fd_k < 30 AND fd_k <= tupleElement((SELECT h FROM maxd), 3) AND bitTest(msk, toUInt8(least(fd_k, 63))), array(toUInt16(fd_k)), CAST(array(), 'Array(UInt16)'))][1] AS tf,
        [arrayFilter(t -> t != fd_k AND bitAnd(msk, toUInt64(bitShiftLeft(toUInt64(127), toUInt8(t + 1)))) = 0, tb)][1] AS tr0,
        [arrayMap(x -> toUInt16(x), arrayFilter(t -> t < 60, bitPositionsToArray(mskd)))][1] AS cb,
        [if(fd_d < 60 AND fd_d <= tupleElement((SELECT h FROM maxd), 4) AND bitTest(mskd, toUInt8(least(fd_d, 63))), array(toUInt16(fd_d)), CAST(array(), 'Array(UInt16)'))][1] AS cf
      FROM evd
    )
  ),
  bv AS (
    SELECT gg, toInt64(k) AS bk, [sum(views_nown)][1] AS bviews
    FROM prod_proteus.pa_dash_bkt
    ARRAY JOIN arrayFilter(y -> (y = 'g' AND grain = 'd') OR (y = 'd' AND grain = 'd'), array('g', 'd')) AS gg
    WHERE grain IN ('d', 'd') AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)
    GROUP BY gg, bk
  ),
  sv AS (SELECT [lower(toString(s.login))][1] AS lg,
      [array(if(match(toString(ifNull(s.lvl3_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl3_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl4_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl4_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl5_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl5_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl6_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl6_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl7_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl7_management_unit_nm, ''))))][1] AS slv,
      [arrayStringConcat(arraySlice(slv, 1, if(arrayFirstIndex(x -> x = '', slv) = 0, toUInt32(5), toUInt32(arrayFirstIndex(x -> x = '', slv) - 1))), ' › ')][1] AS op,
      [toString(ifNull(s.emp_specialization_desc, ''))][1] AS sp, [toString(ifNull(s.emp_stream_desc, ''))][1] AS st,
      [toString(ifNull(s.hq_code, ''))][1] AS hqc, [toString(ifNull(s.it_code, ''))][1] AS itc, [toUInt8(ifNull(s.management_head_flg, 0) = 1)][1] AS hdf,
      [toString(ifNull(s.fio, ''))][1] AS sfio, [toString(ifNull(s.exp_nm, ''))][1] AS sexp,
      toUInt8(1) AS acc,
      toUInt8(1) AS inca
    FROM prod_proteus.pa_staff s
    WHERE lg NOT IN (SELECT lower(toString(login)) FROM prod_proteus.pa_pair
      WHERE dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(login)
        AND bitAnd(toUInt64(ifNull(msk_d, 0)), 1073741823) != 0 AND ifNull(own_flg, 0) = 0)
      AND lg IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'user' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)
        UNION ALL
        SELECT m.login FROM prod_proteus.pa_adg_member m
        WHERE m.ad_group IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'group' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)))
      AND lg NOT IN (SELECT o FROM (SELECT [arrayJoin(owners_string)][1] AS o FROM prod_proteus.pa_dash_meta WHERE dashboard_id IN (SELECT dashboard_id FROM dash_ok))
        GROUP BY o HAVING count() = (SELECT count() FROM dash_ok))
  ),
  s1 AS (SELECT rl, op,
      [if(rl = 'h', concat(toString(transform(sp, tupleElement((SELECT dz FROM dicts), 1), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 1)), toUInt32(0))), '|', toString(transform(st, tupleElement((SELECT dz FROM dicts), 2), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 2)), toUInt32(0))), '|', toString(hdf), '|', toString(transform(hqc, tupleElement((SELECT dz FROM dicts), 4), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 4)), toUInt32(0))), '|', toString(transform(itc, tupleElement((SELECT dz FROM dicts), 5), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 5)), toUInt32(0)))), '')][1] AS hk,
      [if(rl = 'n', concat(translate(lg, '|\t\n\r', '    '), '|', translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(sfio, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', toString(transform(sp, tupleElement((SELECT dz FROM dicts), 1), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 1)), toUInt32(0))), '|', toString(transform(st, tupleElement((SELECT dz FROM dicts), 2), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 2)), toUInt32(0))), '|', toString(hdf), '|',
        toString(transform(hqc, tupleElement((SELECT dz FROM dicts), 4), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 4)), toUInt32(0))), '|', toString(transform(itc, tupleElement((SELECT dz FROM dicts), 5), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 5)), toUInt32(0))), '|', toString(acc), '|', toString(transform(sexp, tupleElement((SELECT dz FROM dicts), 3), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 3)), toUInt32(0)))), '')][1] AS ln,
      count() AS c, countIf(acc = 1) AS ca, countIf(inca = 1) AS cn, [countIf(inca = 1 AND acc = 1)][1] AS cna
    FROM sv
    ARRAY JOIN ['h', 'n'] AS rl
    GROUP BY rl, op, hk, ln
  ),
  s2 AS (
    SELECT rl AS sec, op,
      [arrayStringConcat(groupArray(if(rl = 'h', concat(hk, '|', toString(c), '|', toString(ca), '|', toString(cn), '|', toString(cna)), ln)), '\n')][1] AS pk,
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
  SELECT s_sec AS section, s_gg AS g, [arrayStringConcat(groupArray(s_line), '\n')][1] AS k,
    [if(s_sec = 'list', translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(s_par, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '')][1] AS parent, toInt64(count()) AS n
  FROM (
    SELECT role AS s_sec, if(role = 'ctx', g, '') AS s_gg, [if(role = 'list', parent, '')][1] AS s_par,
      [multiIf(
        role = 'list', k,
        role = 'ctx', concat(translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(k, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(parent, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', toString(users), '|', toString(users_prev), '|', toString(views), '|',
          toString(views_prev), '|', toString(new_u), '|', toString(regular), '|', toString(sleeping)),
        role = 'total', concat(toString(users), '|', toString(users_prev), '|', toString(views), '|', toString(views_prev), '|', toString(new_u), '|',
          toString(new_prev), '|', '0', '|', toString(regular), '|', toString(regular_prev), '|', toString(sleeping), '|',
          toString(mau), '|', toString(mau_prev), '|', toString(ca_prev), '|', toString(ca_regprev), '|', toString(ca_yr), '|',toString(ca_out), '|',
          toString(f1), '|', toString(f2), '|', toString(f3), '|', toString(f4)),
        role = 'coh', concat(k, '|', toString(cnt), '|', arrayStringConcat(arrayMap(x -> toString(x), am.1), ','), '|', arrayStringConcat(arrayMap(x -> toString(x), am.2), ',')),
        '')][1] AS s_line
    FROM rnk
    WHERE role != 'ctx' OR (users > 0)
  )
  GROUP BY s_sec, s_gg, s_par
  UNION ALL
  SELECT x_sec AS section, '' AS g, [arrayStringConcat(groupArray(concat(toString(x_k), '|', toString(x_u), '|', toString(x_n), '|',
      if(x_sec = 'ts', concat(toString(x_r), '|'), ''), toString(toInt64(ifNull(b.bviews, 0))))), '\n')][1] AS k, '' AS parent, toInt64(count()) AS n
  FROM (SELECT x.1 AS x_sec, x.2 AS x_k, x.3 AS x_u, x.4 AS x_n, x.5 AS x_r, [if(x.1 = 'ts', 'g', 'd')][1] AS x_g
    FROM tc
    ARRAY JOIN arrayConcat(
      arrayMap((t, u) -> ('ts', toInt64(t), u, if(indexOf(tn.1, t) > 0, arrayElement(tn.2, indexOf(tn.1, t)), toUInt64(0)),
        if(indexOf(tr.1, t) > 0, arrayElement(tr.2, indexOf(tr.1, t)), toUInt64(0))), tu.1, tu.2),
      arrayMap((t, u) -> ('cal', toInt64(t), u, if(indexOf(cn.1, t) > 0, arrayElement(cn.2, indexOf(cn.1, t)), toUInt64(0)), toUInt64(0)), cu.1, cu.2)) AS x
    WHERE x.3 > 0
  ) z
  LEFT JOIN bv b ON b.gg = z.x_g AND b.bk = z.x_k
  GROUP BY x_sec
  UNION ALL
  SELECT 'area' AS section, '' AS g, '' AS k, 'd' AS parent, [toInt64(greatest(tupleElement((SELECT h FROM maxd), 3) + 1, 0))][1] AS n
  UNION ALL
  SELECT 'md' AS section, '' AS g, [toString(toDate(tupleElement((SELECT h FROM maxd), 1)))][1] AS k, toString(tupleElement((SELECT h FROM maxd), 2)) AS parent, toInt64(0) AS n
  UNION ALL
  SELECT 'nm' AS section, '' AS g, '' AS k, '' AS parent, toInt64(0) AS n
  UNION ALL
  SELECT 'flt' AS section, '' AS g, '{}' AS k, '' AS parent, toInt64(0) AS n
  UNION ALL
  SELECT 'sj' AS section, '' AS g, concat('{"staff":', toString((SELECT count() FROM prod_proteus.pa_staff)), ', "wide":0.3, "caMode":"acc", "ca":{}, "aud":{}}') AS k, '' AS parent, toInt64(0) AS n
  UNION ALL
  SELECT sec AS section, '' AS g, pk AS k, [translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(op, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%')][1] AS parent, toInt64(n) AS n
  FROM s3
  WHERE sec = 'h' OR nnever <= 20000
  UNION ALL
  SELECT 'd' AS section, x.1 AS g, [arrayStringConcat(arrayMap(v -> translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(v, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), x.2), '\n')][1] AS k, '' AS parent, toInt64(length(x.2)) AS n
  FROM (SELECT [arrayJoin(array(('spec', dz.1), ('stream', dz.2), ('exp', dz.3), ('hq', dz.4), ('it', dz.5)))][1] AS x FROM dicts)
  UNION ALL
  SELECT 'acl' AS section, '' AS g, [arrayStringConcat(groupArray(concat(translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(ad_group, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', toString(cnt))), '\n')][1] AS k, '' AS parent,
    toInt64((SELECT uniqExact(principal) FROM prod_proteus.pa_dash_acl WHERE kind = 'user' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok))) AS n
  FROM (
    SELECT toString(m.ad_group) AS ad_group, uniqExact(m.login) AS cnt
    FROM prod_proteus.pa_adg_member m
    WHERE m.ad_group IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'group' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok))
      AND m.login IN (SELECT login FROM prod_proteus.pa_staff)
    GROUP BY ad_group ORDER BY cnt DESC, ad_group LIMIT 40
  )
)
)
UNION ALL
SELECT '5 панель · самый популярный отчёт' AS item, toFloat64(count()) AS rows_or_n, round(sum(length(k)) / 1024) AS answer_kb FROM (
WITH
  maxd AS (
    SELECT [tuple(md, ds, toInt64(dateDiff('day', toStartOfDay(dt), toStartOfDay(md))) - if(toDate(toStartOfDay(dt)) = dt, 0, 1),
      toInt64(dateDiff('day', dt, toDate(md))))][1] AS h
    FROM (SELECT md, toDate(ds0) AS ds, [addDays(toDate(ds0), 90)][1] AS dt
          FROM (SELECT max(ifNull(md, dmax)) AS md, min(dmin) AS ds0 FROM prod_proteus.pa_pair))
  ),
  dicts AS (
    SELECT [tuple(arraySort(groupUniqArrayIf(dv, dg = 'spec')), arraySort(groupUniqArrayIf(dv, dg = 'stream')), arraySort(groupUniqArrayIf(dv, dg = 'exp')),
      arraySort(groupUniqArrayIf(dv, dg = 'hq')), arraySort(groupUniqArrayIf(dv, dg = 'it')))][1] AS dz
    FROM (SELECT dd.1 AS dg, dd.2 AS dv FROM (
      SELECT [arrayJoin(array(('spec', toString(ifNull(emp_specialization_desc, ''))), ('stream', toString(ifNull(emp_stream_desc, ''))),
        ('exp', toString(ifNull(exp_nm, ''))), ('hq', toString(ifNull(hq_code, ''))), ('it', toString(ifNull(it_code, '')))))][1] AS dd FROM prod_proteus.pa_staff
      UNION ALL
      SELECT [arrayJoin(array(('spec', toString(ifNull(emp_specialization_desc, ''))), ('stream', toString(ifNull(emp_stream_desc, ''))),
        ('exp', toString(ifNull(exp_nm, '')))))][1] AS dd FROM prod_proteus.pa_emp_attrs
      UNION ALL
      SELECT [arrayJoin(array(('spec', ''), ('stream', ''), ('exp', ''), ('hq', ''), ('it', '')))][1] AS dd))
  ),
  dash_ok AS (
    SELECT dashboard_id
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1 AND published = 1 AND actual_flg = 1 AND dashboard_id IN (SELECT p.dashboard_id FROM prod_proteus.pa_pair p WHERE p.dashboard_id IN (SELECT dashboard_id FROM prod_proteus.pa_dash_meta WHERE published = 1 AND actual_flg = 1) GROUP BY p.dashboard_id ORDER BY count() DESC LIMIT 1)
  ),
  evd AS (SELECT [toString(ifNull(e.login, ''))][1] AS login, [lower(toString(ifNull(e.login, '')))][1] AS lg,
      groupBitOr(toUInt64(ifNull(e.msk_d, 0))) AS msk,
      [sum(ifNull(e.v_d, 0))][1] AS v_cur,
      [sum(ifNull(e.vp_d, 0))][1] AS v_prev,
      [max(ifNull(e.kmax_d, 0))][1] AS fd_k,
      max(e.dmax) AS dmax,
      [groupBitOr(toUInt64(ifNull(e.msk_mon, 0)))][1] AS mon,[groupBitOr(toUInt64(ifNull(e.msk_d, 0)))][1] AS mskd,
      [max(ifNull(e.kmax_d, 0))][1] AS fd_d
    FROM prod_proteus.pa_pair e
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(e.login) AND ifNull(e.own_flg, 0) = 0
    GROUP BY e.login
  ),
  pr AS (SELECT p.msk AS msk, p.v_cur AS v_cur, p.v_prev AS v_prev,
      p.fd_k AS fd_k, p.fd_d AS fd_d, [toUInt8(bitTest(p.mon, 1))][1] AS m1, [toUInt8(bitTest(p.mon, 2))][1] AS m2,[arrayMap(i -> toInt64(i), arrayFilter(i -> bitTest(p.mon, i), range(63)))][1] AS bms,
      [if(empty(bms), toInt64(0), arrayMax(bms))][1] AS gm,
      [addMonths(toStartOfMonth(tupleElement((SELECT h FROM maxd), 1)), -toInt32(gm))][1] AS c0,
      bitAnd(p.msk, 1073741823) != 0 AS cur, [bitAnd(p.msk, 1152921503533105152)][1] != 0 AS prv,
      [bitCount(bitAnd(p.msk, 1073741823))][1] AS nb_cur, [bitCount(bitAnd(p.msk, 1152921503533105152))][1] AS nb_prev,
      [multiIf(nb_cur <= 1, 1, nb_cur <= 5, 2, nb_cur <= 15, 3, 4)][1] AS bin,
      [if(match(toString(ifNull(a.lvl3_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(a.lvl3_management_unit_nm, '')))][1] AS lvl3, [if(match(toString(ifNull(a.lvl4_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(a.lvl4_management_unit_nm, '')))][1] AS lvl4,[array(lvl3, lvl4, if(match(toString(ifNull(a.lvl5_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(a.lvl5_management_unit_nm, ''))), if(match(toString(ifNull(a.lvl6_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(a.lvl6_management_unit_nm, ''))), if(match(toString(ifNull(a.lvl7_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(a.lvl7_management_unit_nm, ''))))][1] AS lv,[if(arrayFirstIndex(x -> x = '', lv) = 0, toUInt32(length(lv)), toUInt32(arrayFirstIndex(x -> x = '', lv) - 1))][1] AS ol,
      [arrayStringConcat(arraySlice(lv, 1, ol), ' › ')][1] AS opath,
      [toString(ifNull(a.emp_specialization_desc, ''))][1] AS spec, [toString(ifNull(a.emp_stream_desc, ''))][1] AS stream,
      [toUInt8(ifNull(a.management_head_flg, 0) = 1)][1] AS is_head,
      [arrayFilter(x -> x >= 1 AND x <= 11, arrayMap(y -> gm - y, bms))][1] AS ags,[toUInt8(p.stf = 1 AND p.acc = 1)][1] AS inca,
      [toUInt8(bitAnd(p.mon, toUInt64(bitShiftLeft(toUInt64(1), toUInt8(toMonth(tupleElement((SELECT h FROM maxd), 1))))) - 1) != 0)][1] AS yr,[concat(translate(p.login, '|\t\n\r', '    '), '|', translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(toString(ifNull(a.fio, '')), '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', toString(transform(spec, tupleElement((SELECT dz FROM dicts), 1), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 1)), toUInt32(0))), '|', toString(transform(stream, tupleElement((SELECT dz FROM dicts), 2), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 2)), toUInt32(0))), '|',
        toString(transform(toString(ifNull(a.exp_nm, '')), tupleElement((SELECT dz FROM dicts), 3), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 3)), toUInt32(0))), '|',
        toString(bitAnd(p.msk, 1073741823)), '|', toString(bitShiftRight(p.msk, 30)), '|', toString(p.fd_k), '|', toString(p.v_cur), '|',
        toString(if(isNull(p.dmax), toInt64(-1), toInt64(dateDiff('day', toStartOfDay(p.dmax), toStartOfDay(tupleElement((SELECT h FROM maxd), 1)))))), '|',
        toString(is_head + 2 * m1 + 4 * m2 + 8 * yr + 16 * p.stf + 32 * p.acc + 64 * inca), '|', toString(transform(p.hq, tupleElement((SELECT dz FROM dicts), 4), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 4)), toUInt32(0))), '|', toString(transform(p.it, tupleElement((SELECT dz FROM dicts), 5), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 5)), toUInt32(0))))][1] AS pln,
      [arrayJoin(arrayConcat(
        array(('total', '', '', '', toInt64(-1))),
        if(cur OR prv, arrayMap(i -> ('ctx', 'org', arrayStringConcat(arraySlice(lv, 1, i), ' › '), arrayStringConcat(arraySlice(lv, 1, toUInt32(i - 1)), ' › '), toInt64(-1)), range(1, ol + 1)), array()),
        if((cur OR prv) AND spec != '', array(('ctx', 'spec', spec, '', toInt64(-1))), array()),
        if((cur OR prv) AND stream != '', array(('ctx', 'stream', stream, '', toInt64(-1))), array()),
        if((cur OR prv) AND is_head = 1, array(('ctx', 'head', '1', '', toInt64(-1))), array()),
        if(cur, array(('list', '', pln, opath, toInt64(-1))), array()),
        if(gm < 12, array(('coh', '', toString(c0), '', toInt64(-1))), array())))][1] AS rk
    FROM (SELECT e.*, [toUInt8(ifNull(s.login, '') != '')][1] AS stf, [toUInt8(e.lg IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'user' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)
        UNION ALL
        SELECT m.login FROM prod_proteus.pa_adg_member m
        WHERE m.ad_group IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'group' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok))))][1] AS acc,
        [toString(ifNull(s.hq_code, ''))][1] AS hq, [toString(ifNull(s.it_code, ''))][1] AS it
      FROM evd e
      LEFT JOIN prod_proteus.pa_staff s ON s.login = e.lg
    ) p
    LEFT JOIN prod_proteus.pa_emp_attrs a ON a.login = p.login
  ),
  aav AS (SELECT [lower(toString(e.login))][1] AS vl, groupBitOr(toUInt64(ifNull(e.msk_d, 0))) AS vm, [sum(ifNull(e.v_d, 0))][1] AS vv
    FROM prod_proteus.pa_pair e
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(e.login) AND ifNull(e.own_flg, 0) = 0
    GROUP BY vl
    HAVING bitAnd(vm, 1073741823) != 0
  ),
  aak AS (SELECT kk.1 AS ad, kk.2 AS ak0, count() AS users, sum(vv) AS views, [countIf(bitCount(bitAnd(vm, 1073741823)) > 5)][1] AS regular
    FROM (SELECT [lower(toString(s.login))][1] AS lg,
      [array(if(match(toString(ifNull(s.lvl3_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl3_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl4_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl4_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl5_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl5_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl6_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl6_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl7_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl7_management_unit_nm, ''))))][1] AS slv,
      [arrayStringConcat(arraySlice(slv, 1, if(arrayFirstIndex(x -> x = '', slv) = 0, toUInt32(5), toUInt32(arrayFirstIndex(x -> x = '', slv) - 1))), ' › ')][1] AS op,
      [toString(ifNull(s.emp_specialization_desc, ''))][1] AS sp, [toString(ifNull(s.emp_stream_desc, ''))][1] AS st,
      [toString(ifNull(s.hq_code, ''))][1] AS hqc, [toString(ifNull(s.it_code, ''))][1] AS itc, [toUInt8(ifNull(s.management_head_flg, 0) = 1)][1] AS hdf,
      [toString(ifNull(s.fio, ''))][1] AS sfio, [toString(ifNull(s.exp_nm, ''))][1] AS sexp FROM prod_proteus.pa_staff s) t
    INNER JOIN aav x ON x.vl = t.lg
    ARRAY JOIN arrayConcat(
      arrayMap(i -> ('o', arrayStringConcat(arraySlice(slv, 1, i), ' › ')), range(1, if(arrayFirstIndex(z -> z = '', slv) = 0, toUInt32(5), toUInt32(arrayFirstIndex(z -> z = '', slv) - 1)) + 1)),
      array(('s', sp), ('t', st), ('q', hqc), ('i', itc), ('h', toString(hdf)))) AS kk
    WHERE 1
    GROUP BY ad, ak0
  ),
  agg AS (
    SELECT rk.1 AS role, rk.2 AS g, rk.3 AS k, rk.4 AS parent,
      countIf(cur) AS users, countIf(prv) AS users_prev,
      sum(v_cur) AS views, sum(v_prev) AS views_prev,
      [countIf(cur AND fd_k < 30 AND fd_k <= tupleElement((SELECT h FROM maxd), 3))][1] AS new_u,
      [countIf(prv AND fd_k >= 30 AND fd_k < 60 AND fd_k <= tupleElement((SELECT h FROM maxd), 3))][1] AS new_prev,[countIf(cur AND bin = 1)][1] AS f1, [countIf(cur AND bin = 2)][1] AS f2, [countIf(cur AND bin = 3)][1] AS f3, [countIf(cur AND bin = 4)][1] AS f4,
      [countIf(nb_cur > 5)][1] AS regular, [countIf(nb_prev > 5)][1] AS regular_prev,
      [countIf(prv AND NOT cur)][1] AS sleeping,
      countIf(m1 = 1) AS mau, countIf(m2 = 1) AS mau_prev,
      count() AS cnt,
      [countIf(prv AND inca = 1)][1] AS ca_prev, [countIf(nb_prev > 5 AND inca = 1)][1] AS ca_regprev,
      [countIf(yr = 1 AND inca = 1)][1] AS ca_yr, [countIf(cur AND inca = 0)][1] AS ca_out,
      [sumMap(if(rk.1 = 'coh', ags, CAST(array(), 'Array(Int64)')), if(rk.1 = 'coh', arrayMap(x -> toUInt64(1), ags), CAST(array(), 'Array(UInt64)')))][1] AS am
    FROM pr
    GROUP BY role, g, k, parent
  ),
  tc AS (SELECT [sumMap(tb, arrayWithConstant(length(tb), toUInt64(1)))][1] AS tu,
      [sumMap(tf, arrayWithConstant(length(tf), toUInt64(1)))][1] AS tn,
      [sumMap(tr0, arrayWithConstant(length(tr0), toUInt64(1)))][1] AS tr,
      [sumMap(cb, arrayWithConstant(length(cb), toUInt64(1)))][1] AS cu,
      [sumMap(cf, arrayWithConstant(length(cf), toUInt64(1)))][1] AS cn
    FROM (
      SELECT [arrayMap(x -> toUInt16(x), bitPositionsToArray(bitAnd(msk, 1073741823)))][1] AS tb,[if(fd_k < 30 AND fd_k <= tupleElement((SELECT h FROM maxd), 3) AND bitTest(msk, toUInt8(least(fd_k, 63))), array(toUInt16(fd_k)), CAST(array(), 'Array(UInt16)'))][1] AS tf,
        [arrayFilter(t -> t != fd_k AND bitAnd(msk, toUInt64(bitShiftLeft(toUInt64(127), toUInt8(t + 1)))) = 0, tb)][1] AS tr0,
        [arrayMap(x -> toUInt16(x), arrayFilter(t -> t < 60, bitPositionsToArray(mskd)))][1] AS cb,
        [if(fd_d < 60 AND fd_d <= tupleElement((SELECT h FROM maxd), 4) AND bitTest(mskd, toUInt8(least(fd_d, 63))), array(toUInt16(fd_d)), CAST(array(), 'Array(UInt16)'))][1] AS cf
      FROM evd
    )
  ),
  bv AS (
    SELECT gg, toInt64(k) AS bk, [sum(views_nown)][1] AS bviews
    FROM prod_proteus.pa_dash_bkt
    ARRAY JOIN arrayFilter(y -> (y = 'g' AND grain = 'd') OR (y = 'd' AND grain = 'd'), array('g', 'd')) AS gg
    WHERE grain IN ('d', 'd') AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)
    GROUP BY gg, bk
  ),
  sv AS (SELECT [lower(toString(s.login))][1] AS lg,
      [array(if(match(toString(ifNull(s.lvl3_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl3_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl4_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl4_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl5_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl5_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl6_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl6_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl7_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl7_management_unit_nm, ''))))][1] AS slv,
      [arrayStringConcat(arraySlice(slv, 1, if(arrayFirstIndex(x -> x = '', slv) = 0, toUInt32(5), toUInt32(arrayFirstIndex(x -> x = '', slv) - 1))), ' › ')][1] AS op,
      [toString(ifNull(s.emp_specialization_desc, ''))][1] AS sp, [toString(ifNull(s.emp_stream_desc, ''))][1] AS st,
      [toString(ifNull(s.hq_code, ''))][1] AS hqc, [toString(ifNull(s.it_code, ''))][1] AS itc, [toUInt8(ifNull(s.management_head_flg, 0) = 1)][1] AS hdf,
      [toString(ifNull(s.fio, ''))][1] AS sfio, [toString(ifNull(s.exp_nm, ''))][1] AS sexp,
      toUInt8(1) AS acc,
      toUInt8(1) AS inca
    FROM prod_proteus.pa_staff s
    WHERE lg NOT IN (SELECT lower(toString(login)) FROM prod_proteus.pa_pair
      WHERE dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(login)
        AND bitAnd(toUInt64(ifNull(msk_d, 0)), 1073741823) != 0 AND ifNull(own_flg, 0) = 0)
      AND lg IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'user' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)
        UNION ALL
        SELECT m.login FROM prod_proteus.pa_adg_member m
        WHERE m.ad_group IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'group' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)))
      AND lg NOT IN (SELECT o FROM (SELECT [arrayJoin(owners_string)][1] AS o FROM prod_proteus.pa_dash_meta WHERE dashboard_id IN (SELECT dashboard_id FROM dash_ok))
        GROUP BY o HAVING count() = (SELECT count() FROM dash_ok))
  ),
  s1 AS (SELECT rl, op,
      [if(rl = 'h', concat(toString(transform(sp, tupleElement((SELECT dz FROM dicts), 1), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 1)), toUInt32(0))), '|', toString(transform(st, tupleElement((SELECT dz FROM dicts), 2), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 2)), toUInt32(0))), '|', toString(hdf), '|', toString(transform(hqc, tupleElement((SELECT dz FROM dicts), 4), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 4)), toUInt32(0))), '|', toString(transform(itc, tupleElement((SELECT dz FROM dicts), 5), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 5)), toUInt32(0)))), '')][1] AS hk,
      [if(rl = 'n', concat(translate(lg, '|\t\n\r', '    '), '|', translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(sfio, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', toString(transform(sp, tupleElement((SELECT dz FROM dicts), 1), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 1)), toUInt32(0))), '|', toString(transform(st, tupleElement((SELECT dz FROM dicts), 2), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 2)), toUInt32(0))), '|', toString(hdf), '|',
        toString(transform(hqc, tupleElement((SELECT dz FROM dicts), 4), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 4)), toUInt32(0))), '|', toString(transform(itc, tupleElement((SELECT dz FROM dicts), 5), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 5)), toUInt32(0))), '|', toString(acc), '|', toString(transform(sexp, tupleElement((SELECT dz FROM dicts), 3), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 3)), toUInt32(0)))), '')][1] AS ln,
      count() AS c, countIf(acc = 1) AS ca, countIf(inca = 1) AS cn, [countIf(inca = 1 AND acc = 1)][1] AS cna
    FROM sv
    ARRAY JOIN ['h', 'n'] AS rl
    GROUP BY rl, op, hk, ln
  ),
  s2 AS (
    SELECT rl AS sec, op,
      [arrayStringConcat(groupArray(if(rl = 'h', concat(hk, '|', toString(c), '|', toString(ca), '|', toString(cn), '|', toString(cna)), ln)), '\n')][1] AS pk,
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
  SELECT s_sec AS section, s_gg AS g, [arrayStringConcat(groupArray(s_line), '\n')][1] AS k,
    [if(s_sec = 'list', translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(s_par, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '')][1] AS parent, toInt64(count()) AS n
  FROM (
    SELECT role AS s_sec, if(role = 'ctx', g, '') AS s_gg, [if(role = 'list', parent, '')][1] AS s_par,
      [multiIf(
        role = 'list', k,
        role = 'ctx', concat(translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(k, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(parent, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', toString(users), '|', toString(users_prev), '|', toString(views), '|',
          toString(views_prev), '|', toString(new_u), '|', toString(regular), '|', toString(sleeping)),
        role = 'total', concat(toString(users), '|', toString(users_prev), '|', toString(views), '|', toString(views_prev), '|', toString(new_u), '|',
          toString(new_prev), '|', '0', '|', toString(regular), '|', toString(regular_prev), '|', toString(sleeping), '|',
          toString(mau), '|', toString(mau_prev), '|', toString(ca_prev), '|', toString(ca_regprev), '|', toString(ca_yr), '|',toString(ca_out), '|',
          toString(f1), '|', toString(f2), '|', toString(f3), '|', toString(f4)),
        role = 'coh', concat(k, '|', toString(cnt), '|', arrayStringConcat(arrayMap(x -> toString(x), am.1), ','), '|', arrayStringConcat(arrayMap(x -> toString(x), am.2), ',')),
        '')][1] AS s_line
    FROM rnk
    WHERE role != 'ctx' OR (users > 0)
  )
  GROUP BY s_sec, s_gg, s_par
  UNION ALL
  SELECT x_sec AS section, '' AS g, [arrayStringConcat(groupArray(concat(toString(x_k), '|', toString(x_u), '|', toString(x_n), '|',
      if(x_sec = 'ts', concat(toString(x_r), '|'), ''), toString(toInt64(ifNull(b.bviews, 0))))), '\n')][1] AS k, '' AS parent, toInt64(count()) AS n
  FROM (SELECT x.1 AS x_sec, x.2 AS x_k, x.3 AS x_u, x.4 AS x_n, x.5 AS x_r, [if(x.1 = 'ts', 'g', 'd')][1] AS x_g
    FROM tc
    ARRAY JOIN arrayConcat(
      arrayMap((t, u) -> ('ts', toInt64(t), u, if(indexOf(tn.1, t) > 0, arrayElement(tn.2, indexOf(tn.1, t)), toUInt64(0)),
        if(indexOf(tr.1, t) > 0, arrayElement(tr.2, indexOf(tr.1, t)), toUInt64(0))), tu.1, tu.2),
      arrayMap((t, u) -> ('cal', toInt64(t), u, if(indexOf(cn.1, t) > 0, arrayElement(cn.2, indexOf(cn.1, t)), toUInt64(0)), toUInt64(0)), cu.1, cu.2)) AS x
    WHERE x.3 > 0
  ) z
  LEFT JOIN bv b ON b.gg = z.x_g AND b.bk = z.x_k
  GROUP BY x_sec
  UNION ALL
  SELECT 'area' AS section, 'report' AS g, ('777777') AS k, 'd' AS parent, [toInt64(greatest(tupleElement((SELECT h FROM maxd), 3) + 1, 0))][1] AS n
  UNION ALL
  SELECT 'md' AS section, '' AS g, [toString(toDate(tupleElement((SELECT h FROM maxd), 1)))][1] AS k, toString(tupleElement((SELECT h FROM maxd), 2)) AS parent, toInt64(0) AS n
  UNION ALL
  SELECT 'nm' AS section, '' AS g, ifNull((SELECT any(dashboard_nm) FROM prod_proteus.pa_dash_meta WHERE dashboard_id = 777777), '') AS k, '' AS parent, toInt64(0) AS n
  UNION ALL
  SELECT 'flt' AS section, '' AS g, '{"mode_param":["report"],"sel_f":["777777"]}' AS k, '' AS parent, toInt64(0) AS n
  UNION ALL
  SELECT 'sj' AS section, '' AS g, concat('{"staff":', toString((SELECT count() FROM prod_proteus.pa_staff)), ', "wide":0.3, "caMode":"acc", "ca":{}, "aud":{}}') AS k, '' AS parent, toInt64(0) AS n
  UNION ALL
  SELECT sec AS section, '' AS g, pk AS k, [translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(op, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%')][1] AS parent, toInt64(n) AS n
  FROM s3
  WHERE sec = 'h' OR nnever <= 20000
  UNION ALL
  SELECT 'aa' AS section, ad AS g, [arrayStringConcat(groupArray(concat(translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(ak0, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', toString(users), '|', toString(views), '|', toString(regular))), '\n')][1] AS k,
    '' AS parent, toInt64(count()) AS n
  FROM aak
  GROUP BY ad
  UNION ALL
  SELECT 'aa' AS section, 'all' AS g, [concat('*|', toString(count()), '|', toString(sum(x.vv)), '|',
    toString(countIf(bitCount(bitAnd(x.vm, 1073741823)) > 5)))][1] AS k, '' AS parent, toInt64(count()) AS n
  FROM aav x
  UNION ALL
  SELECT 'd' AS section, x.1 AS g, [arrayStringConcat(arrayMap(v -> translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(v, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), x.2), '\n')][1] AS k, '' AS parent, toInt64(length(x.2)) AS n
  FROM (SELECT [arrayJoin(array(('spec', dz.1), ('stream', dz.2), ('exp', dz.3), ('hq', dz.4), ('it', dz.5)))][1] AS x FROM dicts)
  UNION ALL
  SELECT 'acl' AS section, '' AS g, [arrayStringConcat(groupArray(concat(translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(ad_group, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', toString(cnt))), '\n')][1] AS k, '' AS parent,
    toInt64((SELECT uniqExact(principal) FROM prod_proteus.pa_dash_acl WHERE kind = 'user' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok))) AS n
  FROM (
    SELECT toString(m.ad_group) AS ad_group, uniqExact(m.login) AS cnt
    FROM prod_proteus.pa_adg_member m
    WHERE m.ad_group IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'group' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok))
      AND m.login IN (SELECT login FROM prod_proteus.pa_staff)
    GROUP BY ad_group ORDER BY cnt DESC, ad_group LIMIT 40
  )
)
)
UNION ALL
SELECT '6 панель · ЦА IT-руководители' AS item, toFloat64(count()) AS rows_or_n, round(sum(length(k)) / 1024) AS answer_kb FROM (
WITH
  cset AS (SELECT lg FROM (SELECT [lower(toString(s.login))][1] AS lg,
      [array(if(match(toString(ifNull(s.lvl3_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl3_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl4_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl4_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl5_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl5_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl6_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl6_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl7_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl7_management_unit_nm, ''))))][1] AS slv,
      [arrayStringConcat(arraySlice(slv, 1, if(arrayFirstIndex(x -> x = '', slv) = 0, toUInt32(5), toUInt32(arrayFirstIndex(x -> x = '', slv) - 1))), ' › ')][1] AS op,
      [toString(ifNull(s.emp_specialization_desc, ''))][1] AS sp, [toString(ifNull(s.emp_stream_desc, ''))][1] AS st,
      [toString(ifNull(s.hq_code, ''))][1] AS hqc, [toString(ifNull(s.it_code, ''))][1] AS itc, [toUInt8(ifNull(s.management_head_flg, 0) = 1)][1] AS hdf,
      [toString(ifNull(s.fio, ''))][1] AS sfio, [toString(ifNull(s.exp_nm, ''))][1] AS sexp FROM prod_proteus.pa_staff s) WHERE 1 AND itc IN ('IT') AND hdf = 1),
  maxd AS (
    SELECT [tuple(md, ds, toInt64(dateDiff('day', toStartOfDay(dt), toStartOfDay(md))) - if(toDate(toStartOfDay(dt)) = dt, 0, 1),
      toInt64(dateDiff('day', dt, toDate(md))))][1] AS h
    FROM (SELECT md, toDate(ds0) AS ds, [addDays(toDate(ds0), 90)][1] AS dt
          FROM (SELECT max(ifNull(md, dmax)) AS md, min(dmin) AS ds0 FROM prod_proteus.pa_pair))
  ),
  dicts AS (
    SELECT [tuple(arraySort(groupUniqArrayIf(dv, dg = 'spec')), arraySort(groupUniqArrayIf(dv, dg = 'stream')), arraySort(groupUniqArrayIf(dv, dg = 'exp')),
      arraySort(groupUniqArrayIf(dv, dg = 'hq')), arraySort(groupUniqArrayIf(dv, dg = 'it')))][1] AS dz
    FROM (SELECT dd.1 AS dg, dd.2 AS dv FROM (
      SELECT [arrayJoin(array(('spec', toString(ifNull(emp_specialization_desc, ''))), ('stream', toString(ifNull(emp_stream_desc, ''))),
        ('exp', toString(ifNull(exp_nm, ''))), ('hq', toString(ifNull(hq_code, ''))), ('it', toString(ifNull(it_code, '')))))][1] AS dd FROM prod_proteus.pa_staff
      UNION ALL
      SELECT [arrayJoin(array(('spec', toString(ifNull(emp_specialization_desc, ''))), ('stream', toString(ifNull(emp_stream_desc, ''))),
        ('exp', toString(ifNull(exp_nm, '')))))][1] AS dd FROM prod_proteus.pa_emp_attrs
      UNION ALL
      SELECT [arrayJoin(array(('spec', ''), ('stream', ''), ('exp', ''), ('hq', ''), ('it', '')))][1] AS dd))
  ),
  dash_ok AS (
    SELECT dashboard_id
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1 AND published = 1 AND actual_flg = 1
  ),
  evd AS (SELECT [toString(ifNull(e.login, ''))][1] AS login, [lower(toString(ifNull(e.login, '')))][1] AS lg,
      groupBitOr(toUInt64(ifNull(e.msk_d, 0))) AS msk,
      [sum(ifNull(e.v_d, 0))][1] AS v_cur,
      [sum(ifNull(e.vp_d, 0))][1] AS v_prev,
      [max(ifNull(e.kmax_d, 0))][1] AS fd_k,
      max(e.dmax) AS dmax,
      [groupBitOr(toUInt64(ifNull(e.msk_mon, 0)))][1] AS mon,[groupBitOr(toUInt64(ifNull(e.msk_d, 0)))][1] AS mskd,
      [max(ifNull(e.kmax_d, 0))][1] AS fd_d
    FROM prod_proteus.pa_pair e
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(e.login) AND ifNull(e.own_flg, 0) = 0 AND lower(toString(e.login)) IN (SELECT lg FROM cset)
    GROUP BY e.login
  ),
  pr AS (SELECT p.msk AS msk, p.v_cur AS v_cur, p.v_prev AS v_prev,
      p.fd_k AS fd_k, p.fd_d AS fd_d, [toUInt8(bitTest(p.mon, 1))][1] AS m1, [toUInt8(bitTest(p.mon, 2))][1] AS m2,[arrayMap(i -> toInt64(i), arrayFilter(i -> bitTest(p.mon, i), range(63)))][1] AS bms,
      [if(empty(bms), toInt64(0), arrayMax(bms))][1] AS gm,
      [addMonths(toStartOfMonth(tupleElement((SELECT h FROM maxd), 1)), -toInt32(gm))][1] AS c0,
      bitAnd(p.msk, 1073741823) != 0 AS cur, [bitAnd(p.msk, 1152921503533105152)][1] != 0 AS prv,
      [bitCount(bitAnd(p.msk, 1073741823))][1] AS nb_cur, [bitCount(bitAnd(p.msk, 1152921503533105152))][1] AS nb_prev,
      [multiIf(nb_cur <= 1, 1, nb_cur <= 5, 2, nb_cur <= 15, 3, 4)][1] AS bin,
      [if(match(toString(ifNull(a.lvl3_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(a.lvl3_management_unit_nm, '')))][1] AS lvl3, [if(match(toString(ifNull(a.lvl4_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(a.lvl4_management_unit_nm, '')))][1] AS lvl4,[array(lvl3, lvl4, if(match(toString(ifNull(a.lvl5_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(a.lvl5_management_unit_nm, ''))), if(match(toString(ifNull(a.lvl6_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(a.lvl6_management_unit_nm, ''))), if(match(toString(ifNull(a.lvl7_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(a.lvl7_management_unit_nm, ''))))][1] AS lv,[if(arrayFirstIndex(x -> x = '', lv) = 0, toUInt32(length(lv)), toUInt32(arrayFirstIndex(x -> x = '', lv) - 1))][1] AS ol,
      [arrayStringConcat(arraySlice(lv, 1, ol), ' › ')][1] AS opath,
      [toString(ifNull(a.emp_specialization_desc, ''))][1] AS spec, [toString(ifNull(a.emp_stream_desc, ''))][1] AS stream,
      [toUInt8(ifNull(a.management_head_flg, 0) = 1)][1] AS is_head,
      [arrayFilter(x -> x >= 1 AND x <= 11, arrayMap(y -> gm - y, bms))][1] AS ags,[toUInt8(p.stf = 1 AND 1)][1] AS inca,
      [toUInt8(bitAnd(p.mon, toUInt64(bitShiftLeft(toUInt64(1), toUInt8(toMonth(tupleElement((SELECT h FROM maxd), 1))))) - 1) != 0)][1] AS yr,[concat(translate(p.login, '|\t\n\r', '    '), '|', translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(toString(ifNull(a.fio, '')), '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', toString(transform(spec, tupleElement((SELECT dz FROM dicts), 1), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 1)), toUInt32(0))), '|', toString(transform(stream, tupleElement((SELECT dz FROM dicts), 2), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 2)), toUInt32(0))), '|',
        toString(transform(toString(ifNull(a.exp_nm, '')), tupleElement((SELECT dz FROM dicts), 3), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 3)), toUInt32(0))), '|',
        toString(bitAnd(p.msk, 1073741823)), '|', toString(bitShiftRight(p.msk, 30)), '|', toString(p.fd_k), '|', toString(p.v_cur), '|',
        toString(if(isNull(p.dmax), toInt64(-1), toInt64(dateDiff('day', toStartOfDay(p.dmax), toStartOfDay(tupleElement((SELECT h FROM maxd), 1)))))), '|',
        toString(is_head + 2 * m1 + 4 * m2 + 8 * yr + 16 * p.stf + 32 * p.acc + 64 * inca), '|', toString(transform(p.hq, tupleElement((SELECT dz FROM dicts), 4), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 4)), toUInt32(0))), '|', toString(transform(p.it, tupleElement((SELECT dz FROM dicts), 5), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 5)), toUInt32(0))))][1] AS pln,
      [arrayJoin(arrayConcat(
        array(('total', '', '', '', toInt64(-1))),
        if(cur OR prv, arrayMap(i -> ('ctx', 'org', arrayStringConcat(arraySlice(lv, 1, i), ' › '), arrayStringConcat(arraySlice(lv, 1, toUInt32(i - 1)), ' › '), toInt64(-1)), range(1, ol + 1)), array()),
        if((cur OR prv) AND spec != '', array(('ctx', 'spec', spec, '', toInt64(-1))), array()),
        if((cur OR prv) AND stream != '', array(('ctx', 'stream', stream, '', toInt64(-1))), array()),
        if((cur OR prv) AND is_head = 1, array(('ctx', 'head', '1', '', toInt64(-1))), array()),
        if(cur, array(('list', '', pln, opath, toInt64(-1))), array()),
        if(gm < 12, array(('coh', '', toString(c0), '', toInt64(-1))), array())))][1] AS rk
    FROM (SELECT e.*, [toUInt8(ifNull(s.login, '') != '')][1] AS stf, [toUInt8(e.lg IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'user' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)
        UNION ALL
        SELECT m.login FROM prod_proteus.pa_adg_member m
        WHERE m.ad_group IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'group' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok))))][1] AS acc,
        [toString(ifNull(s.hq_code, ''))][1] AS hq, [toString(ifNull(s.it_code, ''))][1] AS it
      FROM evd e
      LEFT JOIN prod_proteus.pa_staff s ON s.login = e.lg
    ) p
    LEFT JOIN prod_proteus.pa_emp_attrs a ON a.login = p.login
  ),
  evo AS (SELECT [toString(ifNull(e.login, ''))][1] AS login, [lower(toString(ifNull(e.login, '')))][1] AS lg,
      groupBitOr(toUInt64(ifNull(e.msk_d, 0))) AS msk, [sum(ifNull(e.v_d, 0))][1] AS v_cur,
      [max(ifNull(e.kmax_d, 0))][1] AS fd_k, max(e.dmax) AS dmax, [groupBitOr(toUInt64(ifNull(e.msk_mon, 0)))][1] AS mon
    FROM prod_proteus.pa_pair e
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(e.login) AND ifNull(e.own_flg, 0) = 0
      AND lower(toString(e.login)) NOT IN (SELECT lg FROM cset)
    GROUP BY e.login
    HAVING bitAnd(msk, 1073741823) != 0
  ),
  po AS (
    SELECT opath AS o_path, pln AS o_ln FROM (
      SELECT p.v_cur AS vv, [array(if(match(toString(ifNull(a.lvl3_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(a.lvl3_management_unit_nm, ''))), if(match(toString(ifNull(a.lvl4_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(a.lvl4_management_unit_nm, ''))), if(match(toString(ifNull(a.lvl5_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(a.lvl5_management_unit_nm, ''))), if(match(toString(ifNull(a.lvl6_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(a.lvl6_management_unit_nm, ''))), if(match(toString(ifNull(a.lvl7_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(a.lvl7_management_unit_nm, ''))))][1] AS lv,
      [if(arrayFirstIndex(x -> x = '', lv) = 0, toUInt32(length(lv)), toUInt32(arrayFirstIndex(x -> x = '', lv) - 1))][1] AS ol,
      [arrayStringConcat(arraySlice(lv, 1, ol), ' › ')][1] AS opath,
        [toString(ifNull(a.emp_specialization_desc, ''))][1] AS spec, [toString(ifNull(a.emp_stream_desc, ''))][1] AS stream,
        [toUInt8(ifNull(a.management_head_flg, 0) = 1)][1] AS is_head, [toUInt8(bitTest(p.mon, 1))][1] AS m1, [toUInt8(bitTest(p.mon, 2))][1] AS m2,
        [toUInt8(bitAnd(p.mon, toUInt64(bitShiftLeft(toUInt64(1), toUInt8(toMonth(tupleElement((SELECT h FROM maxd), 1))))) - 1) != 0)][1] AS yr,
        [concat(translate(p.login, '|\t\n\r', '    '), '|', translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(toString(ifNull(a.fio, '')), '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', toString(transform(spec, tupleElement((SELECT dz FROM dicts), 1), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 1)), toUInt32(0))), '|', toString(transform(stream, tupleElement((SELECT dz FROM dicts), 2), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 2)), toUInt32(0))), '|',
        toString(transform(toString(ifNull(a.exp_nm, '')), tupleElement((SELECT dz FROM dicts), 3), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 3)), toUInt32(0))), '|',
        toString(bitAnd(p.msk, 1073741823)), '|', toString(bitShiftRight(p.msk, 30)), '|', toString(p.fd_k), '|', toString(p.v_cur), '|',
        toString(if(isNull(p.dmax), toInt64(-1), toInt64(dateDiff('day', toStartOfDay(p.dmax), toStartOfDay(tupleElement((SELECT h FROM maxd), 1)))))), '|',
        toString(is_head + 2 * m1 + 4 * m2 + 8 * yr + 16 * p.stf + 32 * p.acc + 64 * 0), '|', toString(transform(p.hq, tupleElement((SELECT dz FROM dicts), 4), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 4)), toUInt32(0))), '|', toString(transform(p.it, tupleElement((SELECT dz FROM dicts), 5), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 5)), toUInt32(0))))][1] AS pln
      FROM (
        SELECT e.*, [toUInt8(ifNull(s.login, '') != '')][1] AS stf, [toUInt8(e.lg IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'user' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)
        UNION ALL
        SELECT m.login FROM prod_proteus.pa_adg_member m
        WHERE m.ad_group IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'group' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok))))][1] AS acc,
          [toString(ifNull(s.hq_code, ''))][1] AS hq, [toString(ifNull(s.it_code, ''))][1] AS it
        FROM evo e
        LEFT JOIN prod_proteus.pa_staff s ON s.login = e.lg
      ) p
      LEFT JOIN prod_proteus.pa_emp_attrs a ON a.login = p.login
      ORDER BY vv DESC, p.login
      LIMIT 20000
    )
  ),
  agg AS (
    SELECT rk.1 AS role, rk.2 AS g, rk.3 AS k, rk.4 AS parent,
      countIf(cur) AS users, countIf(prv) AS users_prev,
      sum(v_cur) AS views, sum(v_prev) AS views_prev,
      [countIf(cur AND fd_k < 30 AND fd_k <= tupleElement((SELECT h FROM maxd), 3))][1] AS new_u,
      [countIf(prv AND fd_k >= 30 AND fd_k < 60 AND fd_k <= tupleElement((SELECT h FROM maxd), 3))][1] AS new_prev,[countIf(cur AND bin = 1)][1] AS f1, [countIf(cur AND bin = 2)][1] AS f2, [countIf(cur AND bin = 3)][1] AS f3, [countIf(cur AND bin = 4)][1] AS f4,
      [countIf(nb_cur > 5)][1] AS regular, [countIf(nb_prev > 5)][1] AS regular_prev,
      [countIf(prv AND NOT cur)][1] AS sleeping,
      countIf(m1 = 1) AS mau, countIf(m2 = 1) AS mau_prev,
      count() AS cnt,
      [countIf(prv AND inca = 1)][1] AS ca_prev, [countIf(nb_prev > 5 AND inca = 1)][1] AS ca_regprev,
      [countIf(yr = 1 AND inca = 1)][1] AS ca_yr, [countIf(cur AND inca = 0)][1] AS ca_out,
      [sumMap(if(rk.1 = 'coh', ags, CAST(array(), 'Array(Int64)')), if(rk.1 = 'coh', arrayMap(x -> toUInt64(1), ags), CAST(array(), 'Array(UInt64)')))][1] AS am
    FROM pr
    GROUP BY role, g, k, parent
  ),
  tc AS (SELECT [sumMap(tb, arrayWithConstant(length(tb), toUInt64(1)))][1] AS tu,
      [sumMap(tf, arrayWithConstant(length(tf), toUInt64(1)))][1] AS tn,
      [sumMap(tr0, arrayWithConstant(length(tr0), toUInt64(1)))][1] AS tr,
      [sumMap(cb, arrayWithConstant(length(cb), toUInt64(1)))][1] AS cu,
      [sumMap(cf, arrayWithConstant(length(cf), toUInt64(1)))][1] AS cn
    FROM (
      SELECT [arrayMap(x -> toUInt16(x), bitPositionsToArray(bitAnd(msk, 1073741823)))][1] AS tb,[if(fd_k < 30 AND fd_k <= tupleElement((SELECT h FROM maxd), 3) AND bitTest(msk, toUInt8(least(fd_k, 63))), array(toUInt16(fd_k)), CAST(array(), 'Array(UInt16)'))][1] AS tf,
        [arrayFilter(t -> t != fd_k AND bitAnd(msk, toUInt64(bitShiftLeft(toUInt64(127), toUInt8(t + 1)))) = 0, tb)][1] AS tr0,
        [arrayMap(x -> toUInt16(x), arrayFilter(t -> t < 60, bitPositionsToArray(mskd)))][1] AS cb,
        [if(fd_d < 60 AND fd_d <= tupleElement((SELECT h FROM maxd), 4) AND bitTest(mskd, toUInt8(least(fd_d, 63))), array(toUInt16(fd_d)), CAST(array(), 'Array(UInt16)'))][1] AS cf
      FROM evd
    )
  ),
  bv AS (
    SELECT x.1 AS gg, x.2 AS bk, sum(e.views) AS bviews
    FROM prod_proteus.pa_evd_day e
    ARRAY JOIN arrayFilter(y -> y.2 < if(y.1 = 'g', 30, 30), array(('g', toInt64(dateDiff('day', toStartOfDay(e.log_dttm), toStartOfDay(tupleElement((SELECT h FROM maxd), 1))))), ('d', toInt64(dateDiff('day', toStartOfDay(e.log_dttm), toStartOfDay(tupleElement((SELECT h FROM maxd), 1))))))) AS x
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM dash_ok)
      AND e.log_dttm >= least(toDateTime(toStartOfDay(tupleElement((SELECT h FROM maxd), 1)) - toIntervalDay(29)), toDateTime(toStartOfDay(tupleElement((SELECT h FROM maxd), 1)) - toIntervalDay(29)))
      AND (toInt64(dateDiff('day', toStartOfDay(e.log_dttm), toStartOfDay(tupleElement((SELECT h FROM maxd), 1)))) < 30 OR toInt64(dateDiff('day', toStartOfDay(e.log_dttm), toStartOfDay(tupleElement((SELECT h FROM maxd), 1)))) < 30) AND lower(toString(e.login)) IN (SELECT lg FROM cset) AND (e.dashboard_id, e.login) NOT IN (SELECT dashboard_id, login FROM prod_proteus.pa_pair WHERE own_flg = 1)
    GROUP BY gg, bk
  ),
  sv AS (SELECT [lower(toString(s.login))][1] AS lg,
      [array(if(match(toString(ifNull(s.lvl3_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl3_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl4_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl4_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl5_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl5_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl6_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl6_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl7_management_unit_nm, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull(s.lvl7_management_unit_nm, ''))))][1] AS slv,
      [arrayStringConcat(arraySlice(slv, 1, if(arrayFirstIndex(x -> x = '', slv) = 0, toUInt32(5), toUInt32(arrayFirstIndex(x -> x = '', slv) - 1))), ' › ')][1] AS op,
      [toString(ifNull(s.emp_specialization_desc, ''))][1] AS sp, [toString(ifNull(s.emp_stream_desc, ''))][1] AS st,
      [toString(ifNull(s.hq_code, ''))][1] AS hqc, [toString(ifNull(s.it_code, ''))][1] AS itc, [toUInt8(ifNull(s.management_head_flg, 0) = 1)][1] AS hdf,
      [toString(ifNull(s.fio, ''))][1] AS sfio, [toString(ifNull(s.exp_nm, ''))][1] AS sexp,
      [toUInt8(lg IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'user' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)
        UNION ALL
        SELECT m.login FROM prod_proteus.pa_adg_member m
        WHERE m.ad_group IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'group' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok))))][1] AS acc,
      toUInt8(1) AS inca
    FROM prod_proteus.pa_staff s
    WHERE lg NOT IN (SELECT lower(toString(login)) FROM prod_proteus.pa_pair
      WHERE dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(login)
        AND bitAnd(toUInt64(ifNull(msk_d, 0)), 1073741823) != 0 AND ifNull(own_flg, 0) = 0)
      AND (1 AND itc IN ('IT') AND hdf = 1)
      AND lg NOT IN (SELECT o FROM (SELECT [arrayJoin(owners_string)][1] AS o FROM prod_proteus.pa_dash_meta WHERE dashboard_id IN (SELECT dashboard_id FROM dash_ok))
        GROUP BY o HAVING count() = (SELECT count() FROM dash_ok))
  ),
  s1 AS (SELECT rl, op,
      [if(rl = 'h', concat(toString(transform(sp, tupleElement((SELECT dz FROM dicts), 1), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 1)), toUInt32(0))), '|', toString(transform(st, tupleElement((SELECT dz FROM dicts), 2), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 2)), toUInt32(0))), '|', toString(hdf), '|', toString(transform(hqc, tupleElement((SELECT dz FROM dicts), 4), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 4)), toUInt32(0))), '|', toString(transform(itc, tupleElement((SELECT dz FROM dicts), 5), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 5)), toUInt32(0)))), '')][1] AS hk,
      [if(rl = 'n', concat(translate(lg, '|\t\n\r', '    '), '|', translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(sfio, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', toString(transform(sp, tupleElement((SELECT dz FROM dicts), 1), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 1)), toUInt32(0))), '|', toString(transform(st, tupleElement((SELECT dz FROM dicts), 2), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 2)), toUInt32(0))), '|', toString(hdf), '|',
        toString(transform(hqc, tupleElement((SELECT dz FROM dicts), 4), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 4)), toUInt32(0))), '|', toString(transform(itc, tupleElement((SELECT dz FROM dicts), 5), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 5)), toUInt32(0))), '|', toString(acc), '|', toString(transform(sexp, tupleElement((SELECT dz FROM dicts), 3), arrayEnumerate(tupleElement((SELECT dz FROM dicts), 3)), toUInt32(0)))), '')][1] AS ln,
      count() AS c, countIf(acc = 1) AS ca, countIf(inca = 1) AS cn, [countIf(inca = 1 AND acc = 1)][1] AS cna
    FROM sv
    ARRAY JOIN ['h', 'n'] AS rl
    GROUP BY rl, op, hk, ln
  ),
  s2 AS (
    SELECT rl AS sec, op,
      [arrayStringConcat(groupArray(if(rl = 'h', concat(hk, '|', toString(c), '|', toString(ca), '|', toString(cn), '|', toString(cna)), ln)), '\n')][1] AS pk,
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
  SELECT s_sec AS section, s_gg AS g, [arrayStringConcat(groupArray(s_line), '\n')][1] AS k,
    [if(s_sec = 'list', translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(s_par, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '')][1] AS parent, toInt64(count()) AS n
  FROM (
    SELECT role AS s_sec, if(role = 'ctx', g, '') AS s_gg, [if(role = 'list', parent, '')][1] AS s_par,
      [multiIf(
        role = 'list', k,
        role = 'ctx', concat(translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(k, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(parent, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', toString(users), '|', toString(users_prev), '|', toString(views), '|',
          toString(views_prev), '|', toString(new_u), '|', toString(regular), '|', toString(sleeping)),
        role = 'total', concat(toString(users), '|', toString(users_prev), '|', toString(views), '|', toString(views_prev), '|', toString(new_u), '|',
          toString(new_prev), '|', '0', '|', toString(regular), '|', toString(regular_prev), '|', toString(sleeping), '|',
          toString(mau), '|', toString(mau_prev), '|', toString(ca_prev), '|', toString(ca_regprev), '|', toString(ca_yr), '|',toString((SELECT count() FROM evo)), '|',
          toString(f1), '|', toString(f2), '|', toString(f3), '|', toString(f4)),
        role = 'coh', concat(k, '|', toString(cnt), '|', arrayStringConcat(arrayMap(x -> toString(x), am.1), ','), '|', arrayStringConcat(arrayMap(x -> toString(x), am.2), ',')),
        '')][1] AS s_line
    FROM rnk
    WHERE role != 'ctx' OR (users > 0)
  )
  GROUP BY s_sec, s_gg, s_par
  UNION ALL
  SELECT x_sec AS section, '' AS g, [arrayStringConcat(groupArray(concat(toString(x_k), '|', toString(x_u), '|', toString(x_n), '|',
      if(x_sec = 'ts', concat(toString(x_r), '|'), ''), toString(toInt64(ifNull(b.bviews, 0))))), '\n')][1] AS k, '' AS parent, toInt64(count()) AS n
  FROM (SELECT x.1 AS x_sec, x.2 AS x_k, x.3 AS x_u, x.4 AS x_n, x.5 AS x_r, [if(x.1 = 'ts', 'g', 'd')][1] AS x_g
    FROM tc
    ARRAY JOIN arrayConcat(
      arrayMap((t, u) -> ('ts', toInt64(t), u, if(indexOf(tn.1, t) > 0, arrayElement(tn.2, indexOf(tn.1, t)), toUInt64(0)),
        if(indexOf(tr.1, t) > 0, arrayElement(tr.2, indexOf(tr.1, t)), toUInt64(0))), tu.1, tu.2),
      arrayMap((t, u) -> ('cal', toInt64(t), u, if(indexOf(cn.1, t) > 0, arrayElement(cn.2, indexOf(cn.1, t)), toUInt64(0)), toUInt64(0)), cu.1, cu.2)) AS x
    WHERE x.3 > 0
  ) z
  LEFT JOIN bv b ON b.gg = z.x_g AND b.bk = z.x_k
  GROUP BY x_sec
  UNION ALL
  SELECT 'area' AS section, '' AS g, '' AS k, 'd' AS parent, [toInt64(greatest(tupleElement((SELECT h FROM maxd), 3) + 1, 0))][1] AS n
  UNION ALL
  SELECT 'md' AS section, '' AS g, [toString(toDate(tupleElement((SELECT h FROM maxd), 1)))][1] AS k, toString(tupleElement((SELECT h FROM maxd), 2)) AS parent, toInt64(0) AS n
  UNION ALL
  SELECT 'nm' AS section, '' AS g, '' AS k, '' AS parent, toInt64(0) AS n
  UNION ALL
  SELECT 'flt' AS section, '' AS g, '{"ca_it_f":["IT"],"ca_head_f":["1"]}' AS k, '' AS parent, toInt64(0) AS n
  UNION ALL
  SELECT 'sj' AS section, '' AS g, concat('{"staff":', toString((SELECT count() FROM prod_proteus.pa_staff)), ', "wide":0.3, "caMode":"cond", "ca":{"it":["IT"], "head":"1"}, "aud":{}}') AS k, '' AS parent, toInt64(0) AS n
  UNION ALL
  SELECT sec AS section, '' AS g, pk AS k, [translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(op, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%')][1] AS parent, toInt64(n) AS n
  FROM s3
  WHERE sec = 'h' OR nnever <= 20000
  UNION ALL
  SELECT 'lo' AS section, '' AS g, [arrayStringConcat(groupArray(o_ln), '\n')][1] AS k, [translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(o_path, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%')][1] AS parent, toInt64(count()) AS n
  FROM po
  GROUP BY o_path
  UNION ALL
  SELECT 'd' AS section, x.1 AS g, [arrayStringConcat(arrayMap(v -> translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(v, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), x.2), '\n')][1] AS k, '' AS parent, toInt64(length(x.2)) AS n
  FROM (SELECT [arrayJoin(array(('spec', dz.1), ('stream', dz.2), ('exp', dz.3), ('hq', dz.4), ('it', dz.5)))][1] AS x FROM dicts)
  UNION ALL
  SELECT 'acl' AS section, '' AS g, [arrayStringConcat(groupArray(concat(translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(ad_group, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', toString(cnt))), '\n')][1] AS k, '' AS parent,
    toInt64((SELECT uniqExact(principal) FROM prod_proteus.pa_dash_acl WHERE kind = 'user' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok))) AS n
  FROM (
    SELECT toString(m.ad_group) AS ad_group, uniqExact(m.login) AS cnt
    FROM prod_proteus.pa_adg_member m
    WHERE m.ad_group IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'group' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok))
      AND m.login IN (SELECT login FROM prod_proteus.pa_staff)
    GROUP BY ad_group ORDER BY cnt DESC, ad_group LIMIT 40
  )
)
)
UNION ALL
SELECT '7 витрина pa_pair' AS item, toFloat64(count()) AS rows_or_n, toFloat64(0) AS answer_kb FROM prod_proteus.pa_pair
UNION ALL
SELECT '7 витрина pa_evd_day' AS item, toFloat64(count()) AS rows_or_n, toFloat64(0) AS answer_kb FROM prod_proteus.pa_evd_day
UNION ALL
SELECT '7 витрина pa_staff' AS item, toFloat64(count()) AS rows_or_n, toFloat64(0) AS answer_kb FROM prod_proteus.pa_staff
UNION ALL
SELECT '7 витрина pa_emp_attrs' AS item, toFloat64(count()) AS rows_or_n, toFloat64(0) AS answer_kb FROM prod_proteus.pa_emp_attrs
UNION ALL
SELECT '7 витрина pa_dash_meta' AS item, toFloat64(count()) AS rows_or_n, toFloat64(0) AS answer_kb FROM prod_proteus.pa_dash_meta
UNION ALL
SELECT '7 витрина pa_dash_acl' AS item, toFloat64(count()) AS rows_or_n, toFloat64(0) AS answer_kb FROM prod_proteus.pa_dash_acl
UNION ALL
SELECT '7 витрина pa_adg_member' AS item, toFloat64(count()) AS rows_or_n, toFloat64(0) AS answer_kb FROM prod_proteus.pa_adg_member
)
ORDER BY item
