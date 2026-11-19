-- Сверка «Пользователей за 30 дней», шаг 4: это ОДНИ И ТЕ ЖЕ люди под разными логинами?
-- Один запрос, в SQL Lab как есть. Для каждого логина «только в старом» ищем в новом факте (pa_evd_day) логин с теми же
-- визитами — тот же отчёт в тот же день — и наоборот. Совпали почти все визиты — один человек: в новом логин заменён
-- актуальным логином сотрудника из MDM (склейка pa_login_map), в событиях Proteus он под прежним.
-- Колонки: сторона, логин, лучший двойник, общих визитов (отчёт × день), визитов у логина, двойник есть и в другом отчёте.
WITH
  (SELECT max(z.max_date) FROM prod_proteus.proteus_adoption z) AS mx,
  old_v AS (
    SELECT DISTINCT lower(trim(toString(a.login))) AS lg, toInt64(a.dashboard_id) AS did, toDate(a.log_dttm) AS d
    FROM prod_proteus.proteus_adoption a
    WHERE isNotNull(a.login) AND a.dashboard_id <> 13040 AND a.log_dttm BETWEEN date_add(DAY, -30, mx) AND mx
  ),
  new_v AS (
    SELECT DISTINCT lower(trim(toString(e.login))) AS lg, toInt64(e.dashboard_id) AS did, toDate(e.log_dttm) AS d
    FROM prod_proteus.pa_evd_day e
    WHERE isNotNull(e.login) AND toDate(e.log_dttm) > toDate(mx) - 30 AND toDate(e.log_dttm) <= toDate(mx)
  ),
  old_set AS (
    SELECT lower(trim(toString(ifNull(a.login, '')))) AS lg
    FROM prod_proteus.proteus_adoption a
    WHERE a.dashboard_id <> 13040 AND ifNull(a.login, '') != 'svc_mon_otpp' AND a.published = 1 AND a.actual_flg = 1
      AND hasAny(arrayMap(x -> replaceAll(replaceRegexpAll(x, '^"|"$', ''), '\\"', '"'), a.owners_string), [a.login]) = 0
      AND a.log_dttm BETWEEN date_add(DAY, -30, mx) AND mx
    GROUP BY lg
  ),
  new_set AS (
    SELECT DISTINCT lower(trim(toString(p.login))) AS lg
    FROM prod_proteus.pa_pair p
    WHERE isNotNull(p.login) AND ifNull(p.own_flg, 0) = 0
      AND bitAnd(toUInt64(ifNull(p.msk_d, 0)), toUInt64(1073741823)) != 0
      AND p.dashboard_id IN (SELECT m.dashboard_id FROM prod_proteus.pa_dash_meta m WHERE m.published = 1 AND m.actual_flg = 1)
  ),
  only_old AS (SELECT o.lg AS lg FROM old_set o WHERE o.lg != '' AND o.lg NOT IN (SELECT n.lg FROM new_set n)),
  only_new AS (SELECT n.lg AS lg FROM new_set n WHERE n.lg NOT IN (SELECT o.lg FROM old_set o)),
  -- логин «только в старом» × любой логин нового факта: общих визитов
  m_old AS (
    SELECT a.lg AS lg, b.lg AS twin, count() AS common
    FROM (SELECT * FROM old_v WHERE lg IN (SELECT lg FROM only_old)) a
    INNER JOIN new_v b ON b.did = a.did AND b.d = a.d
    WHERE b.lg != a.lg
    GROUP BY a.lg, b.lg
  ),
  m_new AS (
    SELECT a.lg AS lg, b.lg AS twin, count() AS common
    FROM (SELECT * FROM new_v WHERE lg IN (SELECT lg FROM only_new)) a
    INNER JOIN old_v b ON b.did = a.did AND b.d = a.d
    WHERE b.lg != a.lg
    GROUP BY a.lg, b.lg
  ),
  tot_old AS (SELECT lg, count() AS n FROM old_v WHERE lg IN (SELECT lg FROM only_old) GROUP BY lg),
  tot_new AS (SELECT lg, count() AS n FROM new_v WHERE lg IN (SELECT lg FROM only_new) GROUP BY lg)
SELECT r.side AS side, r.lg AS lg, r.twin AS twin, r.common AS common, r.visits AS visits, r.twin_in_other AS twin_in_other FROM (
  SELECT 'только в старом' AS side, q.lg AS lg, ifNull(b.bt, '') AS twin, ifNull(b.bc, 0) AS common, ifNull(t.n, 0) AS visits,
    if(ifNull(b.bt, '') IN (SELECT lg FROM old_set), 'да: тоже в старом', if(ifNull(b.bt, '') IN (SELECT lg FROM only_new), 'только в новом', '')) AS twin_in_other
  FROM only_old q
  LEFT JOIN (SELECT x.lg AS lg, argMax(x.twin, x.common) AS bt, max(x.common) AS bc FROM m_old x GROUP BY x.lg) b ON b.lg = q.lg
  LEFT JOIN tot_old t ON t.lg = q.lg
  UNION ALL
  SELECT 'только в новом' AS side, q.lg AS lg, ifNull(b.bt, '') AS twin, ifNull(b.bc, 0) AS common, ifNull(t.n, 0) AS visits,
    if(ifNull(b.bt, '') IN (SELECT lg FROM new_set), 'да: тоже в новом', if(ifNull(b.bt, '') IN (SELECT lg FROM only_old), 'только в старом', '')) AS twin_in_other
  FROM only_new q
  LEFT JOIN (SELECT x.lg AS lg, argMax(x.twin, x.common) AS bt, max(x.common) AS bc FROM m_new x GROUP BY x.lg) b ON b.lg = q.lg
  LEFT JOIN tot_new t ON t.lg = q.lg
) r
ORDER BY r.side, r.common DESC
