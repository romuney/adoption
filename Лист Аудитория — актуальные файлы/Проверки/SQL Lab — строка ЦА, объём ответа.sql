-- Строка ЦА (pa_ca_dict): сколько строк и мегабайт уходит в браузер. SQL Lab, база CROSS.
-- Ожидание: s — до ~80 тыс. «единиц» (units), всего до ~5 МБ. Больше — пришлите мне этот ответ.
SELECT section, count() AS rows_, sum(length(splitByChar('\n', k))) AS units, round(sum(length(k)) / 1048576, 2) AS mb
FROM (
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
  gix AS (SELECT toString(ad_group) AS agn, toUInt32(row_number() OVER (ORDER BY toString(ad_group))) AS gi
    FROM prod_proteus.pa_adg_size WHERE ifNull(n, 0) > 0
  ),
  mb AS (
    SELECT toString(m.login) AS ml, arrayStringConcat(arrayMap(y -> toString(y), arraySort(groupUniqArray(x.gi))), ',') AS gs
    FROM prod_proteus.pa_adg_member m INNER JOIN gix x ON x.agn = toString(m.ad_group)
    GROUP BY ml
  ),
  gg AS (
    SELECT opath, lower(hex(toUInt32(cityHash64(spec) % 4294967296))) AS sid, lower(hex(toUInt32(cityHash64(stream) % 4294967296))) AS tid, hd, lower(hex(toUInt32(cityHash64(hq) % 4294967296))) AS qid, lower(hex(toUInt32(cityHash64(it) % 4294967296))) AS iid,
      ifNull(b.gs, '') AS gset, count() AS c
    FROM st LEFT JOIN mb b ON b.ml = st.lg
    GROUP BY opath, sid, tid, hd, qid, iid, gset
  )
SELECT CAST('s' AS String) AS section, CAST('' AS String) AS g,
  arrayStringConcat(arraySort(groupArray(arrayStringConcat([sid, tid, toString(hd), qid, iid, toString(c), gset], '\t'))), '\n') AS k,
  CAST(opath AS String) AS parent, toInt64(sum(c)) AS n
FROM gg GROUP BY opath
UNION ALL
SELECT 'd', dg, lower(hex(toUInt32(cityHash64(dv) % 4294967296))), dv, toInt64(0)
FROM (SELECT DISTINCT arrayJoin([('spec', spec), ('stream', stream), ('hq', hq), ('it', it)]) AS dd, dd.1 AS dg, dd.2 AS dv FROM st)
UNION ALL
SELECT 'adg', '', toString(s.ad_group), toString(x.gi), toInt64(s.n) FROM prod_proteus.pa_adg_size s INNER JOIN gix x ON x.agn = toString(s.ad_group)
UNION ALL
SELECT 'total', '', '', '', toInt64(count()) FROM prod_proteus.pa_staff
)
GROUP BY section ORDER BY section
