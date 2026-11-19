-- Сверка «Пользователей за 30 дней»: старый отчёт Proteus Adoption (MAU last 30 days) против нового листа.
-- Один запрос, запускать в SQL Lab как есть (база Proteus CROSS). Фильтры — как по умолчанию в обоих отчётах:
-- опубликованные, актуальные, без просмотров владельцев своих отчётов.
--   Старый: prod_proteus.proteus_adoption, uniq(user_id), окно log_dttm между max_date − 30 дней и max_date,
--           без дашборда 13040 и svc_mon_otpp, владельцы — owners_string со снятыми кавычками.
--   Новый:  prod_proteus.pa_pair, разные логины (после склейки сменённых логинов), 30 календарных дней до md.
-- Строки 7 и 8 — сами расхождения поимённо (до 40 логинов): по ним видно, кто и почему.
-- Как читать: 1 − 5 = вся разница. 1 − 4 — лишний 31-й день в окне старого (BETWEEN max_date − 30 AND max_date
-- берёт обе границы). 4 (логинов) − 5 — остальное: склейка сменённых логинов (9), строки без логина (3), прочее (7/8).
WITH
  old_rows AS (
    SELECT a.user_id AS uid, lower(trim(toString(ifNull(a.login, '')))) AS lg, a.log_dttm AS dt,
      toDate(a.log_dttm) > toDate((SELECT max(z.max_date) FROM prod_proteus.proteus_adoption z)) - 30 AS in30
    FROM prod_proteus.proteus_adoption a
    WHERE a.dashboard_id <> 13040 AND ifNull(a.login, '') != 'svc_mon_otpp'
      AND a.published = 1 AND a.actual_flg = 1
      AND hasAny(arrayMap(x -> replaceAll(replaceRegexpAll(x, '^"|"$', ''), '\\"', '"'), a.owners_string), [a.login]) = 0
      AND a.log_dttm BETWEEN date_add(DAY, -30, (SELECT max(z.max_date) FROM prod_proteus.proteus_adoption z))
                         AND (SELECT max(z.max_date) FROM prod_proteus.proteus_adoption z)
  ),
  old_set AS (SELECT DISTINCT o.lg AS lg FROM old_rows o WHERE o.lg != ''),
  new_set AS (
    SELECT DISTINCT lower(trim(toString(p.login))) AS lg
    FROM prod_proteus.pa_pair p
    WHERE isNotNull(p.login) AND ifNull(p.own_flg, 0) = 0
      AND bitAnd(toUInt64(ifNull(p.msk_d, 0)), toUInt64(1073741823)) != 0
      AND p.dashboard_id IN (SELECT m.dashboard_id FROM prod_proteus.pa_dash_meta m WHERE m.published = 1 AND m.actual_flg = 1)
  )
SELECT r.what AS what, r.n AS n, r.sample AS sample FROM (
SELECT '1. Старый, как MAU: разных user_id' AS what, toString(uniqExact(o.uid)) AS n, '' AS sample FROM old_rows o
UNION ALL
SELECT '2. Старый: разных логинов' AS what, toString(count()) AS n, '' AS sample FROM old_set
UNION ALL
SELECT '3. Старый: user_id без логина' AS what, toString(uniqExactIf(o.uid, o.lg = '')) AS n, '' AS sample FROM old_rows o
UNION ALL
SELECT '4. Старый: только 30 календарных дней (без 31-го), user_id / логинов' AS what,
  concat(toString(uniqExactIf(o.uid, o.in30)), ' / ', toString(uniqExactIf(o.lg, o.in30 AND o.lg != ''))) AS n, '' AS sample FROM old_rows o
UNION ALL
SELECT '5. Новый: разных логинов за 30 дней' AS what, toString(count()) AS n, '' AS sample FROM new_set
UNION ALL
SELECT '6. Свежесть: старый max_date / новый md' AS what,
  concat(toString((SELECT max(z.max_date) FROM prod_proteus.proteus_adoption z)), ' / ', toString((SELECT max(p.md) FROM prod_proteus.pa_pair p))) AS n, '' AS sample
UNION ALL
SELECT '7. Есть в старом, нет в новом' AS what, toString(count()) AS n, arrayStringConcat(groupArray(40)(s.lg), ', ') AS sample
FROM old_set s WHERE s.lg NOT IN (SELECT ns.lg FROM new_set ns)
UNION ALL
SELECT '8. Есть в новом, нет в старом' AS what, toString(count()) AS n, arrayStringConcat(groupArray(40)(s.lg), ', ') AS sample
FROM new_set s WHERE s.lg NOT IN (SELECT os.lg FROM old_set os)
UNION ALL
SELECT '9. Один user_id — несколько логинов (смена логина)' AS what, toString(count()) AS n, arrayStringConcat(groupArray(40)(u.ls), '; ') AS sample
FROM (SELECT o.uid AS uid, arrayStringConcat(groupUniqArray(o.lg), ' = ') AS ls FROM old_rows o WHERE o.lg != '' GROUP BY o.uid HAVING uniqExact(o.lg) > 1) u
UNION ALL
SELECT '10. Один логин — несколько user_id' AS what, toString(count()) AS n, arrayStringConcat(groupArray(40)(l.lg), ', ') AS sample
FROM (SELECT o.lg AS lg FROM old_rows o WHERE o.lg != '' GROUP BY o.lg HAVING uniqExact(o.uid) > 1) l
) r
ORDER BY toUInt32OrZero(splitByChar('.', r.what)[1])
