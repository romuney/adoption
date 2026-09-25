-- 1
-- Панель «Аудитория: ЦА области» — без выбора в каталоге (весь Proteus под опциями по умолчанию), ЦА по правам.
-- Рендер без джини (для SQL Lab, база CROSS). Цифру в первой строке меняйте для повторного замера: SQL Lab кэширует результат.
WITH
  maxd AS (SELECT max(ifNull(md, dmax)) AS md FROM prod_proteus.pa_pair),
  area AS (
    SELECT dashboard_id, owners_string, dashboard_nm
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1 AND published = 1 AND actual_flg = 1
  ),
  vw AS (SELECT lower(toString(e.login)) AS login,
      groupBitOr(toUInt64(ifNull(e.msk_d, 0))) AS msk,
      max(ifNull(e.kmax_d, 0)) AS fk,
      groupBitOr(toUInt64(ifNull(e.msk_mon, 0))) AS mon,
      sum(ifNull(e.v_d, 0)) AS vc,
      max(e.dmax) AS dmax
    FROM prod_proteus.pa_pair e
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM area) AND isNotNull(e.login) AND ifNull(e.own_flg, 0) = 0
    GROUP BY login
  ),
  pp AS (SELECT if(ifNull(s.login, '') != '', s.login, ifNull(v.login, '')) AS lg, toUInt8(ifNull(s.login, '') != '') AS stf, toUInt8(ifNull(v.login, '') != '') AS isv,
      if(match(toString(ifNull(s.lvl3_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl3_management_unit_nm, ''))) AS l3, if(match(toString(ifNull(s.lvl4_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl4_management_unit_nm, ''))) AS l4,
      [l3, l4, if(match(toString(ifNull(s.lvl5_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl5_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl6_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl6_management_unit_nm, ''))), if(match(toString(ifNull(s.lvl7_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.lvl7_management_unit_nm, '')))] AS lv,
      if(arrayFirstIndex(x -> x = '', lv) = 0, toUInt32(length(lv)), toUInt32(arrayFirstIndex(x -> x = '', lv) - 1)) AS ol,
      arrayStringConcat(arraySlice(lv, 1, ol), ' › ') AS opath,
      toString(ifNull(s.emp_specialization_desc, '')) AS spec, toString(ifNull(s.emp_stream_desc, '')) AS stream,
      arrayStringConcat(arraySlice(lv, 1, ol), ' › ') AS op,
      toUInt8(ifNull(s.management_head_flg, 0) = 1) AS hd, toString(ifNull(s.fio, '')) AS fio, toString(ifNull(s.exp_nm, '')) AS exn,
      toString(ifNull(s.hq_code, '')) AS hq, toString(ifNull(s.it_code, '')) AS it,
      toUInt8(lg IN (
        SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'user' AND dashboard_id IN (SELECT dashboard_id FROM area)
        UNION ALL
        SELECT m.login FROM prod_proteus.pa_adg_member m
        WHERE m.ad_group IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'group' AND dashboard_id IN (SELECT dashboard_id FROM area)))) AS acc,
      ifNull(v.msk, toUInt64(0)) AS msk, ifNull(v.fk, 0) AS fk, ifNull(v.mon, toUInt64(0)) AS mon, ifNull(v.vc, 0) AS vc, v.dmax AS dmax,toUInt8(stf = 1 AND acc = 1) AS inca
    FROM prod_proteus.pa_staff s
    FULL OUTER JOIN vw v ON v.login = s.login
    WHERE if(ifNull(s.login, '') != '', s.login, ifNull(v.login, '')) NOT IN (
      SELECT o FROM area ARRAY JOIN owners_string AS o GROUP BY o HAVING count() = (SELECT count() FROM area))
  ),
  k1 AS (SELECT rl, opath,
      if(rl = 'h', lower(hex(toUInt32(cityHash64(spec) % 4294967296))), '') AS sid, if(rl = 'h', lower(hex(toUInt32(cityHash64(stream) % 4294967296))), '') AS tid, if(rl = 'h', hd, 0) AS h0,
      if(rl = 'h', lower(hex(toUInt32(cityHash64(hq) % 4294967296))), '') AS qid, if(rl = 'h', lower(hex(toUInt32(cityHash64(it) % 4294967296))), '') AS iid,
      multiIf(rl = 'v', arrayStringConcat([lg, fio, toString(acc), toString(stf), toString(bitAnd(msk, 1073741823)), toString(bitShiftRight(msk, 30)), toString(fk),
          toString(toUInt8(bitAnd(mon, toUInt64(bitShiftLeft(toUInt64(1), toUInt8(toMonth((SELECT md FROM maxd))))) - 1) != 0)),
          toString(if(isNull(dmax), -1, dateDiff('day', toStartOfDay(dmax), toStartOfDay((SELECT md FROM maxd))))),
          lower(hex(toUInt32(cityHash64(spec) % 4294967296))), lower(hex(toUInt32(cityHash64(stream) % 4294967296))), toString(hd), toString(vc), exn, lower(hex(toUInt32(cityHash64(hq) % 4294967296))), lower(hex(toUInt32(cityHash64(it) % 4294967296))), toString(inca)], '\t'),
        rl = 'n', arrayStringConcat([lg, fio, lower(hex(toUInt32(cityHash64(spec) % 4294967296))), lower(hex(toUInt32(cityHash64(stream) % 4294967296))), toString(hd), lower(hex(toUInt32(cityHash64(hq) % 4294967296))), lower(hex(toUInt32(cityHash64(it) % 4294967296))), toString(acc), exn], '\t'),
        '') AS ln,
      count() AS c, countIf(acc = 1) AS ca, countIf(inca = 1) AS cn, countIf(inca = 1 AND acc = 1) AS cna
    FROM pp
    ARRAY JOIN if(isv = 1, ['v'], if(inca = 1, ['h', 'n'], ['h'])) AS rl
    GROUP BY rl, opath, sid, tid, h0, qid, iid, ln
  ),
  k2 AS (
    SELECT rl AS section, opath,
      arrayStringConcat(arraySort(groupArray(if(rl = 'h', arrayStringConcat([sid, tid, toString(h0), qid, iid, toString(c), toString(ca), toString(cn), toString(cna)], '\t'), ln))), '\n') AS pk,
      sum(c) AS n, sum(ca) AS na
    FROM k1 GROUP BY section, opath
  ),
  k3 AS (SELECT section, opath, pk, n, na, sumIf(n, section = 'n') OVER () AS nnever FROM k2
  )
SELECT CAST(section AS String) AS section, CAST('' AS String) AS g, CAST(pk AS String) AS k, CAST(opath AS String) AS parent,
  toInt64(n) AS n, toInt64(na) AS a, CAST(NULL AS Nullable(String)) AS state_j
FROM k3
WHERE section != 'n' OR nnever <= 20000
UNION ALL
SELECT 'd', dg, lower(hex(toUInt32(cityHash64(dv) % 4294967296))), dv, toInt64(0), toInt64(0), NULL
FROM (SELECT DISTINCT arrayJoin([('spec', toString(ifNull(emp_specialization_desc, ''))), ('stream', toString(ifNull(emp_stream_desc, ''))), ('hq', toString(ifNull(hq_code, ''))), ('it', toString(ifNull(it_code, '')))]) AS dd, dd.1 AS dg, dd.2 AS dv FROM prod_proteus.pa_staff)
UNION ALL
SELECT 'acl', 'group', ad_group, '', toInt64(cnt), toInt64(0), NULL
FROM (
  SELECT m.ad_group AS ad_group, uniqExact(m.login) AS cnt
  FROM prod_proteus.pa_adg_member m
  WHERE m.ad_group IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'group' AND dashboard_id IN (SELECT dashboard_id FROM area))
    AND m.login IN (SELECT login FROM prod_proteus.pa_staff)
  GROUP BY m.ad_group ORDER BY cnt DESC, ad_group LIMIT 40
)
UNION ALL
SELECT 'acl', 'users', '', '', toInt64(uniqExact(principal)), toInt64(0), NULL
FROM prod_proteus.pa_dash_acl WHERE kind = 'user' AND dashboard_id IN (SELECT dashboard_id FROM area)
UNION ALL
SELECT 'total', '', arrayStringConcat((SELECT groupArray(nm) FROM (SELECT toString(dashboard_nm) AS nm FROM area ORDER BY dashboard_id LIMIT 3)), '\n'), '',
  toInt64((SELECT count() FROM prod_proteus.pa_staff)), toInt64(0),
  concat('{"period":"d", "n":30, "caMode":"acc", "ca":{}', ', "md":"', toString(toDate((SELECT md FROM maxd))), '", "areaN":', toString((SELECT count() FROM area)), '}')
