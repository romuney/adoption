-- ЗАМЕР «Своих дат» (SQL Lab, база CHaaS, только чтение): каталог, фильтр period_param = c|2026-10-30|d|303 (как в медленном запросе 12:43).
-- Вариант A: пары соединяются с окном один раз на инициаторе (без рассылки временной таблицы на все узлы). Ответ тот же.
-- Запускать парами: 38, 39 (панель), 40, 41 (каталог) — и ещё раз в том же порядке. Прислать восемь времён.
SELECT section, g, k, parent, n FROM (
WITH
  maxd AS (SELECT max(assumeNotNull(md)) AS md FROM prod_proteus.pa_next_md),
  dash_ok AS (
    SELECT dashboard_id
    FROM prod_proteus.pa_next_dash_meta
    WHERE 1=1 AND published = 1 AND actual_flg = 1
  ),
  evd AS (SELECT [toInt32(ifNull(e.dashboard_id, 0))][1] AS did, [toString(ifNull(e.login, ''))][1] AS login,e.msk_c AS msk, ifNull(e.v_c, 0) AS v_cur, e.dmax AS dmax,[toUInt64(ifNull(e.msk_d, 0))][1] AS pd, [toUInt64(ifNull(e.msk_w, 0))][1] AS pw, [toUInt64(ifNull(e.msk_m, 0))][1] AS pm
    FROM (SELECT p.*, c.m AS msk_c, toInt64(ifNull(c.v, 0)) AS v_c
    FROM (SELECT * FROM prod_proteus.pa_next_pair WHERE dashboard_id IN (SELECT arrayJoin((SELECT groupArray(*) FROM (SELECT dashboard_id FROM dash_ok))))) p
    LEFT JOIN (SELECT dashboard_id, login, [groupUniqArray(toUInt16(k))][1] AS m, [sumIf(views, k < 303)][1] AS v
      FROM (SELECT dashboard_id, login, views, [toInt64(dateDiff('day', toStartOfDay(log_dttm), toStartOfDay(toDate('2026-10-30'))))][1] AS k FROM prod_proteus.pa_next_evd_day
        WHERE dashboard_id IN (SELECT arrayJoin((SELECT groupArray(*) FROM (SELECT dashboard_id FROM dash_ok)))) AND log_dttm >= toDateTime(toStartOfDay(toDate('2026-10-30')) - toIntervalDay(605))
          AND log_dttm < toDateTime(toDate('2026-10-30')) + toIntervalDay(1))
      WHERE k >= 0 AND k < 606 GROUP BY dashboard_id, login) c ON c.dashboard_id = p.dashboard_id AND c.login = p.login
    WHERE 1) e
    WHERE e.dashboard_id IN (SELECT arrayJoin((SELECT groupArray(__x) FROM (SELECT dashboard_id AS __x FROM dash_ok)))) AND isNotNull(e.login) AND ifNull(e.own_flg, 0) = 0
  ),
  kx AS (SELECT kd, k0, login,
      groupUniqArrayArray(m0) AS msk, sum(v_cur) AS v_cur, max(dmax) AS dmax
    FROM (
      SELECT [arrayJoin(arrayConcat(
          array((toUInt8(0), '')),
          arrayMap(o -> (toUInt8(2), o), arrayDistinct(arrayFilter(o -> o != '', if(notEmpty(arrayFilter(x -> ifNull(x, '') != '', mm.owners_string)),
  arrayMap(x -> lower(trim(toString(ifNull(x, '')))), mm.owners_string), array(lower(trim(toString(ifNull(mm.owner_login, ''))))))))),
          arrayMap(c -> (toUInt8(3), toString(ifNull(c, ''))), arrayFilter(c -> isNotNull(c) AND c != '', mm.collection_names))
        ))][1] AS kk, kk.1 AS kd, kk.2 AS k0,
        p.login AS login, p.msk AS m0, p.v_cur AS v_cur, p.dmax AS dmax
      FROM evd p
      INNER JOIN prod_proteus.pa_next_dash_meta mm ON mm.dashboard_id = p.did
    )
    GROUP BY kd, k0, login
  ),
  agg AS (
    SELECT kd, k0, [countIf(arrayExists(kq -> kq < 303, msk))][1] AS users, sum(v_cur) AS views,
      [countIf(arrayCount(kq -> kq < 303, msk) >= 6)][1] AS regular_users,
      [dateDiff('day', toStartOfDay(max(dmax)), toStartOfDay((SELECT md FROM maxd)))][1] AS last_view_days, '' AS rhythm, toUInt64(0) AS ca_u
    FROM kx GROUP BY kd, k0
    UNION ALL
    SELECT toUInt8(1) AS kd, toString(did) AS k0, [countIf(arrayExists(kq -> kq < 303, msk))][1] AS users, sum(v_cur) AS views,
      [countIf(arrayCount(kq -> kq < 303, msk) >= 6)][1] AS regular_users,
      [dateDiff('day', toStartOfDay(max(dmax)), toStartOfDay((SELECT md FROM maxd)))][1] AS last_view_days,[arrayStringConcat(array(toString(countIf(multiIf(bitCount(bitAnd(pd, 1073741823)) >= 12, 4, bitCount(bitAnd(pw, 255)) >= 6, 3, bitCount(bitAnd(pm, 7)) >= 2, 2, bitAnd(pm, 7) != 0, 1, 0) = 4)), toString(countIf(multiIf(bitCount(bitAnd(pd, 1073741823)) >= 12, 4, bitCount(bitAnd(pw, 255)) >= 6, 3, bitCount(bitAnd(pm, 7)) >= 2, 2, bitAnd(pm, 7) != 0, 1, 0) = 3)), toString(countIf(multiIf(bitCount(bitAnd(pd, 1073741823)) >= 12, 4, bitCount(bitAnd(pw, 255)) >= 6, 3, bitCount(bitAnd(pm, 7)) >= 2, 2, bitAnd(pm, 7) != 0, 1, 0) = 2)), toString(countIf(multiIf(bitCount(bitAnd(pd, 1073741823)) >= 12, 4, bitCount(bitAnd(pw, 255)) >= 6, 3, bitCount(bitAnd(pm, 7)) >= 2, 2, bitAnd(pm, 7) != 0, 1, 0) = 1))), ',')][1] AS rhythm,[countIf(arrayExists(kq -> kq < 303, msk) AND acc = 1)][1] AS ca_u
    FROM (
      SELECT did, msk, v_cur, dmax, pd, pw, pm,toUInt8((did, lower(login)) IN (SELECT arrayJoin((SELECT groupArray(__x) FROM (SELECT tuple([toInt32(ifNull(dashboard_id, 0))][1], [toString(ifNull(login, ''))][1]) AS __x FROM prod_proteus.pa_next_pair_acc))))) AS acc
      FROM evd
    )
    GROUP BY did
  ),vz AS (
    SELECT lower(toString(login)) AS vl, groupUniqArrayArray(msk) AS vm, sum(v_cur) AS vv
    FROM evd
    GROUP BY vl
    HAVING arrayExists(kq -> kq < 303, vm)
  ),
  va AS (SELECT lv, ol, sp, st, hqc, itc, hdf, count() AS sn,
      [countIf(ifNull(x.vl, '') != '')][1] AS u, sum(ifNull(x.vv, 0)) AS vw,
      [countIf(ifNull(x.vl, '') != '' AND arrayCount(kq -> kq < 303, x.vm) >= 6)][1] AS rg
    FROM (
      SELECT [toString(ifNull(s.login, ''))][1] AS lg, [arrayMap(x -> toString(ifNull(x, '')), s.slv)][1] AS lv, [toUInt32(ifNull(s.sol, 0))][1] AS ol, [toString(ifNull(s.op, ''))][1] AS op,
        [toString(ifNull(s.sp, ''))][1] AS sp, [toString(ifNull(s.st, ''))][1] AS st,
        [toString(ifNull(s.hqc, ''))][1] AS hqc, [toString(ifNull(s.itc, ''))][1] AS itc, [toUInt8(ifNull(s.hdf, 0) = 1)][1] AS hdf
      FROM prod_proteus.pa_next_staffx s
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
    LEFT JOIN prod_proteus.pa_next_dash_meta m ON m.dashboard_id = if(kd = 1, ifNull(toInt32OrNull(k0), toInt32(0)), toInt32(0))
    LEFT JOIN prod_proteus.pa_next_dash_ca c ON c.dashboard_id = if(kd = 1, ifNull(toInt32OrNull(k0), toInt32(0)), toInt32(0))
  )
  GROUP BY s_sec, s_g
  UNION ALL
  SELECT 'sj' AS section, '' AS g, '{"period":"d", "flt":{"period_param":["c|2026-10-30|d|303"]}, "ca":1}' AS k, 'd' AS parent, toInt64(0) AS n
  UNION ALL
  SELECT 'aud' AS section, ad AS g,
    [arrayStringConcat(arraySort(groupArray(concat(translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(ak0, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate(ap, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)'), '`\\1`'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'), '|', toString(users), '|', toString(views), '|', toString(regular), '|', toString(staff)))), '\n')][1] AS k,
    '' AS parent, toInt64(count()) AS n
  FROM ak
  GROUP BY ad
  UNION ALL
  SELECT 'me' AS section, '' AS g,
    ifNull(nullIf((SELECT any(toString(lm.canon)) FROM prod_proteus.pa_next_login_map lm
      WHERE lm.login = lower(trim(''))), ''),
      [lower(trim(''))][1]) AS k,
    '' AS parent, toInt64(0) AS n
  UNION ALL
  SELECT 'aud' AS section, 'all' AS g, [concat('*||', toString(count()), '|', toString(sum(vv)), '|',
    toString(countIf(arrayCount(kq -> kq < 303, vm) >= 6)), '|0')][1] AS k, '' AS parent, toInt64(count()) AS n
  FROM vz
)
UNION ALL
SELECT 'pa_next_version' AS section, 'cat' AS g,
  (SELECT any(toString(run_id)) FROM prod_proteus.pa_next_manifest) AS k,
  if((SELECT count() = 1 AND countIf(state = 'ready') = 1 FROM prod_proteus.pa_next_manifest) AND (SELECT count() FROM (SELECT _pa_next_run AS r FROM prod_proteus.pa_next_adg_member UNION ALL SELECT _pa_next_run AS r FROM prod_proteus.pa_next_cat_aud UNION ALL SELECT _pa_next_run AS r FROM prod_proteus.pa_next_cat_grp UNION ALL SELECT _pa_next_run AS r FROM prod_proteus.pa_next_cat_rep UNION ALL SELECT _pa_next_run AS r FROM prod_proteus.pa_next_dash_bkt UNION ALL SELECT _pa_next_run AS r FROM prod_proteus.pa_next_dash_ca UNION ALL SELECT _pa_next_run AS r FROM prod_proteus.pa_next_dash_day UNION ALL SELECT _pa_next_run AS r FROM prod_proteus.pa_next_dash_meta UNION ALL SELECT _pa_next_run AS r FROM prod_proteus.pa_next_emp_attrs UNION ALL SELECT _pa_next_run AS r FROM prod_proteus.pa_next_evd_day UNION ALL SELECT _pa_next_run AS r FROM prod_proteus.pa_next_login_map UNION ALL SELECT _pa_next_run AS r FROM prod_proteus.pa_next_md UNION ALL SELECT _pa_next_run AS r FROM prod_proteus.pa_next_pair UNION ALL SELECT _pa_next_run AS r FROM prod_proteus.pa_next_pair_acc UNION ALL SELECT _pa_next_run AS r FROM prod_proteus.pa_next_person_id_map UNION ALL SELECT _pa_next_run AS r FROM prod_proteus.pa_next_staffx) WHERE ifNull(r, '') != (SELECT any(run_id) FROM prod_proteus.pa_next_manifest)) = 0, 'ready', 'loading') AS parent,
  toInt64(parent = 'ready') AS n
UNION ALL
SELECT 'pa_next_request' AS section, 'head' AS g,
  '' AS k, '' AS parent, toInt64(0) AS n
UNION ALL
SELECT 'pa_next_request' AS section, 'cat' AS g,
  '' AS k, '' AS parent, toInt64(0) AS n
UNION ALL
SELECT 'pa_next_request' AS section, 'one' AS g,
  '' AS k, '' AS parent, toInt64(0) AS n
)
