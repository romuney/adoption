-- 1
-- Шапка единого листа (pa_head) — справочник строки ЦА + дата данных (строка section = 'md').
-- Рендер без джини (для SQL Lab, база CROSS). Цифру в первой строке меняйте для повторного замера: SQL Lab кэширует результат.
-- Ждём: ~460 строк на синтетике (на бою — по числу сочетаний атрибутов штата), одна строка md с датой вчера.
WITH
  st AS (SELECT [toString(ifNull(login, ''))][1] AS lg, [toString(ifNull(op, ''))][1] AS opath,
      [toString(ifNull(sp, ''))][1] AS spec, [toString(ifNull(st, ''))][1] AS stream,
      [toUInt8(ifNull(hdf, 0) = 1)][1] AS hd, [toString(ifNull(hqc, ''))][1] AS hq, [toString(ifNull(itc, ''))][1] AS it
    FROM prod_proteus.pa_staffx
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
SELECT 'md' AS section, '' AS g, [ifNull(toString(toDate(md)), '')][1] AS k, [ifNull(toString(toDate(ds)), '')][1] AS parent, toInt64(0) AS n
FROM prod_proteus.pa_md
