-- Проверка шапки PA NEXT одним запросом (SQL Lab, только чтение).
-- Это SQL датасета «3. SQL — шапка.sql», отрендеренный для обычного состояния: без выбора, без условий ЦА, «30 дней».
-- Запустить на НОВОЙ базе (CHaaS, 25.8) и на СТАРОЙ (24.8) — прислать время и число строк с обеих.
SELECT section, g, k, parent, n FROM (
WITH
  st AS (SELECT [toString(ifNull(login, ''))][1] AS lg, [toString(ifNull(op, ''))][1] AS opath,
      [toString(ifNull(sp, ''))][1] AS spec, [toString(ifNull(st, ''))][1] AS stream,
      [toUInt8(ifNull(hdf, 0) = 1)][1] AS hd, [toString(ifNull(hqc, ''))][1] AS hq, [toString(ifNull(itc, ''))][1] AS it
    FROM prod_proteus.pa_next_staffx
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
SELECT 'adg' AS section, '' AS g, toString(z.ad_group) AS k, '' AS parent, toInt64(0) AS n FROM prod_proteus.pa_next_adg_size z
WHERE ifNull(z.n, 0) > 0 AND NOT match(toString(ifNull(z.ad_group, '')), '^(?:\\s|\\p{P})*$')
UNION ALL
SELECT 'total' AS section, '' AS g, '' AS k, '' AS parent, toInt64(count()) AS n FROM prod_proteus.pa_next_staff
UNION ALL
SELECT 'md' AS section, '' AS g, [ifNull(toString(toDate(md)), '')][1] AS k, [ifNull(toString(toDate(ds)), '')][1] AS parent, toInt64(0) AS n
FROM prod_proteus.pa_next_md
UNION ALL
SELECT 'pa_next_version' AS section, 'head' AS g,
  (SELECT any(toString(run_id)) FROM prod_proteus.pa_next_manifest) AS k,
  if((SELECT count() = 1 AND countIf(state = 'ready') = 1 FROM prod_proteus.pa_next_manifest) AND (SELECT countIf(ifNull(_pa_next_run, '') != (SELECT any(run_id) FROM prod_proteus.pa_next_manifest)) FROM prod_proteus.pa_next_adg_size) = 0 AND (SELECT countIf(ifNull(_pa_next_run, '') != (SELECT any(run_id) FROM prod_proteus.pa_next_manifest)) FROM prod_proteus.pa_next_md) = 0 AND (SELECT countIf(ifNull(_pa_next_run, '') != (SELECT any(run_id) FROM prod_proteus.pa_next_manifest)) FROM prod_proteus.pa_next_staff) = 0 AND (SELECT countIf(ifNull(_pa_next_run, '') != (SELECT any(run_id) FROM prod_proteus.pa_next_manifest)) FROM prod_proteus.pa_next_staffx) = 0, 'ready', 'loading') AS parent,
  toInt64(parent = 'ready') AS n
)
