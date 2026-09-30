-- 1
-- Шапка единого листа (pa_head) — справочник строки ЦА + дата данных (строка section = 'md').
-- Рендер без джини (для SQL Lab, база CROSS). Цифру в первой строке меняйте для повторного замера: SQL Lab кэширует результат.
-- Ждём: ~460 строк на синтетике (на бою — по числу сочетаний атрибутов штата), одна строка md с датой вчера.
WITH
  st AS (
    SELECT toString(login) AS lg, [if(match(toString(ifNull(lvl3_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(lvl3_management_unit_nm, ''))), if(match(toString(ifNull(lvl4_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(lvl4_management_unit_nm, ''))), if(match(toString(ifNull(lvl5_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(lvl5_management_unit_nm, ''))),
        if(match(toString(ifNull(lvl6_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(lvl6_management_unit_nm, ''))), if(match(toString(ifNull(lvl7_management_unit_nm, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(lvl7_management_unit_nm, '')))] AS lv,
      if(arrayFirstIndex(x -> x = '', lv) = 0, toUInt32(length(lv)), toUInt32(arrayFirstIndex(x -> x = '', lv) - 1)) AS ol,
      arrayStringConcat(arraySlice(lv, 1, ol), ' › ') AS opath,
      toString(ifNull(emp_specialization_desc, '')) AS spec, toString(ifNull(emp_stream_desc, '')) AS stream,
      toUInt8(ifNull(management_head_flg, 0) = 1) AS hd, toString(ifNull(hq_code, '')) AS hq, toString(ifNull(it_code, '')) AS it
    FROM prod_proteus.pa_staff
  ),
  gg AS (SELECT opath, lower(hex(toUInt32(cityHash64(spec) % 4294967296))) AS sid, lower(hex(toUInt32(cityHash64(stream) % 4294967296))) AS tid, hd, lower(hex(toUInt32(cityHash64(hq) % 4294967296))) AS qid, lower(hex(toUInt32(cityHash64(it) % 4294967296))) AS iid, count() AS c
    FROM st
    GROUP BY opath, sid, tid, hd, qid, iid
  )
SELECT CAST('s' AS String) AS section, CAST('' AS String) AS g,
  arrayStringConcat(arraySort(groupArray(arrayStringConcat([sid, tid, toString(hd), qid, iid, toString(c)], '\t'))), '\n') AS k,
  CAST(opath AS String) AS parent, toInt64(sum(c)) AS n
FROM gg GROUP BY opath
UNION ALL
SELECT 'd' AS section, dg AS g, lower(hex(toUInt32(cityHash64(dv) % 4294967296))) AS k, dv AS parent, toInt64(0) AS n
FROM (SELECT DISTINCT arrayJoin([('spec', spec), ('stream', stream), ('hq', hq), ('it', it)]) AS dd, dd.1 AS dg, dd.2 AS dv FROM st)
UNION ALL
SELECT 'adg' AS section, '' AS g, toString(z.ad_group) AS k, '' AS parent, toInt64(0) AS n FROM prod_proteus.pa_adg_size z
WHERE ifNull(z.n, 0) > 0 AND NOT match(toString(ifNull(z.ad_group, '')), '^[\\s\\p{P}]*$')
UNION ALL
SELECT 'total' AS section, '' AS g, '' AS k, '' AS parent, toInt64(count()) AS n FROM prod_proteus.pa_staff
UNION ALL
SELECT 'md' AS section, '' AS g, ifNull(toString(toDate((SELECT md FROM prod_proteus.pa_pair WHERE isNotNull(md) LIMIT 1))), '') AS k, '' AS parent, toInt64(0) AS n
