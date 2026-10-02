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
  evd AS (SELECT toInt32(ifNull(e.dashboard_id, 0)) AS did, toString(ifNull(e.login, '')) AS login,toUInt64(ifNull(e.msk_d, 0)) AS msk, ifNull(e.v_d, 0) AS v_cur, e.dmax AS dmax,toUInt64(ifNull(e.msk_d, 0)) AS pd, toUInt64(ifNull(e.msk_w, 0)) AS pw, toUInt64(ifNull(e.msk_m, 0)) AS pm
    FROM prod_proteus.pa_pair e
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(e.login) AND ifNull(e.own_flg, 0) = 0
  ),
  kx AS (SELECT kd, k0, login,
      groupBitOr(m0) AS msk, sum(v_cur) AS v_cur, max(dmax) AS dmax
    FROM (
      SELECT arrayJoin(arrayConcat(
          [(toUInt8(0), '')],
          arrayMap(o -> (toUInt8(2), o), arrayDistinct(arrayFilter(o -> o != '', if(notEmpty(arrayFilter(x -> ifNull(x, '') != '', mm.owners_string)),
  arrayMap(x -> lower(trim(toString(ifNull(x, '')))), mm.owners_string), [lower(trim(toString(ifNull(mm.owner_login, ''))))])))),
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
  ),vz AS (
    SELECT lower(toString(login)) AS vl, groupBitOr(msk) AS vm, sum(v_cur) AS vv
    FROM evd
    GROUP BY vl
    HAVING bitAnd(vm, 1073741823) != 0
  ),
  va AS (SELECT lv, ol, sp, st, hqc, itc, hdf, count() AS sn,
      countIf(ifNull(x.vl, '') != '') AS u, sum(ifNull(x.vv, 0)) AS vw,
      countIf(ifNull(x.vl, '') != '' AND bitCount(bitAnd(ifNull(x.vm, toUInt64(0)), 1073741823)) >= 6) AS rg
    FROM (
      SELECT lower(toString(s.login)) AS lg,
        [if(match(toString(ifNull(s.lvl3_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl3_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl4_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl4_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl5_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl5_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl6_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl6_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl7_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl7_management_unit_nm, '')))] AS lv,
        if(arrayFirstIndex(z -> z = '', lv) = 0, toUInt32(5), toUInt32(arrayFirstIndex(z -> z = '', lv) - 1)) AS ol,
        arrayStringConcat(arraySlice(lv, 1, ol), ' › ') AS op,
        toString(ifNull(s.emp_specialization_desc, '')) AS sp, toString(ifNull(s.emp_stream_desc, '')) AS st,
        toString(ifNull(s.hq_code, '')) AS hqc, toString(ifNull(s.it_code, '')) AS itc, toUInt8(ifNull(s.management_head_flg, 0) = 1) AS hdf
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
      [('s', sp, ''), ('t', st, ''), ('q', hqc, ''), ('i', itc, ''), ('h', toString(hdf), '')]) AS kk
    GROUP BY ad, ak0, ap
  )
SELECT CAST(section AS String) AS section, CAST(g AS String) AS g, CAST(k AS String) AS k, CAST(parent AS String) AS parent, CAST(n AS Int64) AS n
FROM (
  SELECT s_sec AS section, s_g AS g, arrayStringConcat(groupArray(s_line), '\n') AS k, 'd' AS parent, toInt64(count()) AS n
  FROM (
    SELECT CAST(CASE WHEN kd = 0 THEN 'total' WHEN kd = 1 THEN 'rep' ELSE 'grp' END AS String) AS s_sec,
      multiIf(kd = 1, toString(intDiv(ifNull(toInt32OrNull(k0), toInt32(0)), 1000)), kd = 2, 'owner', kd = 3, 'collection', '') AS s_g,
      multiIf(
        kd = 1, concat(k0, '|', toString(users), '|', toString(views), '|', toString(regular_users), '|', toString(last_view_days), '|', rhythm, '|',
          toString(ifNull(c.ca_n, 0)), '|',
          toString(ifNull(c.ca_wide, 0)), '|', toString(ca_u), '|',
          translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(toString(ifNull(m.dashboard_nm, '')), '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), '([А-Яа-яЁё][А-Яа-яЁё ]*)', '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', arrayStringConcat(arrayMap(o -> translate(o, '|\t\n\r', '    '), arrayDistinct(arrayFilter(o -> o != '', if(notEmpty(arrayFilter(x -> ifNull(x, '') != '', m.owners_string)),
  arrayMap(x -> lower(trim(toString(ifNull(x, '')))), m.owners_string), [lower(trim(toString(ifNull(m.owner_login, ''))))])))), '^'), '|',
          arrayStringConcat(arrayMap(cc -> translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(cc, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), '([А-Яа-яЁё][А-Яа-яЁё ]*)', '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), arrayFilter(cc -> cc != '', arrayMap(cc -> toString(ifNull(cc, '')), m.collection_names))), '^'), '|',
          toString(ifNull(m.published, 0)), '|', translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(toString(ifNull(m.certified_by, '')), '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), '([А-Яа-яЁё][А-Яа-яЁё ]*)', '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', if(isNull(m.created_dt), '', toString(toDate(m.created_dt))), '|',translate(lower(trim(toString(ifNull(m.owner_login, '')))), '|\t\n\r', '    ')),
        kd = 0, concat(toString(users), '|', toString(views), '|', toString(regular_users), '|', toString(last_view_days)),
        concat(translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(k0, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), '([А-Яа-яЁё][А-Яа-яЁё ]*)', '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', toString(users), '|', toString(views), '|', toString(regular_users), '|', toString(last_view_days))) AS s_line
    FROM agg
    LEFT JOIN prod_proteus.pa_dash_meta m ON m.dashboard_id = if(kd = 1, ifNull(toInt32OrNull(k0), toInt32(0)), toInt32(0))
    LEFT JOIN prod_proteus.pa_dash_ca c ON c.dashboard_id = if(kd = 1, ifNull(toInt32OrNull(k0), toInt32(0)), toInt32(0))
  )
  GROUP BY s_sec, s_g
  UNION ALL
  SELECT 'sj' AS section, '' AS g, '{"period":"d", "flt":{}, "ca":1}' AS k, 'd' AS parent, toInt64(0) AS n
  UNION ALL
  SELECT 'aud' AS section, ad AS g,
    arrayStringConcat(groupArray(concat(translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(ak0, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), '([А-Яа-яЁё][А-Яа-яЁё ]*)', '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(ap, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), '([А-Яа-яЁё][А-Яа-яЁё ]*)', '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', toString(users), '|', toString(views), '|', toString(regular), '|', toString(staff))), '\n') AS k,
    '' AS parent, toInt64(count()) AS n
  FROM ak
  GROUP BY ad
  UNION ALL
  SELECT 'aud' AS section, 'all' AS g, concat('*||', toString(count()), '|', toString(sum(vv)), '|',
    toString(countIf(bitCount(bitAnd(vm, 1073741823)) >= 6)), '|0') AS k, '' AS parent, toInt64(count()) AS n
  FROM vz
)
