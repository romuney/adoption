-- Сверка «Пользователей за 30 дней», шаг 2: ПОЧЕМУ человек есть только в старом или только в новом отчёте.
-- Один запрос, в SQL Lab как есть. Множества — как в «сверка пользователей со старым отчётом» (строки 7 и 8).
-- Причины (у каждого логина — первая подходящая):
--   смена логина      — тот же mdm_employee_rk есть в другом множестве под другим логином (в новом логины склеены);
--   нет в факте       — в окне у другого отчёта этого логина нет вовсе (разные источники событий);
--   владелец          — все его просмотры в окне — свои отчёты по владельцам другого отчёта;
--   статус отчёта     — смотрел только отчёты, которые другой отчёт считает неопубликованными/неактуальными
--                       (старый — флаги в строке события, новый — текущее состояние отчёта в pa_dash_meta);
--   прочее            — остальное (присылайте логин — разберу).
WITH
  old_rows AS (
    SELECT lower(trim(toString(ifNull(a.login, '')))) AS lg, toString(a.mdm_employee_rk) AS rk,
      hasAny(arrayMap(x -> replaceAll(replaceRegexpAll(x, '^"|"$', ''), '\\"', '"'), a.owners_string), [a.login]) AS own,
      a.published = 1 AND a.actual_flg = 1 AS st
    FROM prod_proteus.proteus_adoption a
    WHERE a.dashboard_id <> 13040 AND ifNull(a.login, '') != 'svc_mon_otpp'
      AND a.log_dttm BETWEEN date_add(DAY, -30, (SELECT max(z.max_date) FROM prod_proteus.proteus_adoption z))
                         AND (SELECT max(z.max_date) FROM prod_proteus.proteus_adoption z)
  ),
  old_lg AS (
    SELECT o.lg AS lg, countIf(NOT o.own AND o.st) AS ok, countIf(NOT o.own) AS nown, countIf(o.st) AS nst
    FROM old_rows o WHERE o.lg != '' GROUP BY o.lg
  ),
  new_pairs AS (
    SELECT lower(trim(toString(p.login))) AS lg, ifNull(p.own_flg, 0) = 1 AS own,
      p.dashboard_id IN (SELECT m.dashboard_id FROM prod_proteus.pa_dash_meta m WHERE m.published = 1 AND m.actual_flg = 1) AS st
    FROM prod_proteus.pa_pair p
    WHERE isNotNull(p.login) AND bitAnd(toUInt64(ifNull(p.msk_d, 0)), toUInt64(1073741823)) != 0
  ),
  new_lg AS (
    SELECT n.lg AS lg, countIf(NOT n.own AND n.st) AS ok, countIf(NOT n.own) AS nown, countIf(n.st) AS nst
    FROM new_pairs n GROUP BY n.lg
  ),
  rkmap AS (
    SELECT lower(trim(toString(a.login))) AS lg, any(toString(a.mdm_employee_rk)) AS rk
    FROM prod_proteus.proteus_adoption a WHERE isNotNull(a.login) AND isNotNull(a.mdm_employee_rk) GROUP BY lg
  ),
  only_old AS (SELECT l.lg AS lg FROM old_lg l WHERE l.ok > 0 AND l.lg NOT IN (SELECT x.lg FROM new_lg x WHERE x.ok > 0)),
  only_new AS (SELECT l.lg AS lg FROM new_lg l WHERE l.ok > 0 AND l.lg NOT IN (SELECT x.lg FROM old_lg x WHERE x.ok > 0)),
  rk_old AS (SELECT r.rk AS rk FROM rkmap r WHERE r.lg IN (SELECT o.lg FROM only_old o) AND r.rk != ''),
  rk_new AS (SELECT r.rk AS rk FROM rkmap r WHERE r.lg IN (SELECT o.lg FROM only_new o) AND r.rk != ''),
  cls AS (
    SELECT 'только в старом' AS side, multiIf(
        ifNull(r.rk, '') != '' AND r.rk IN (SELECT k.rk FROM rk_new k), 'смена логина',
        q.lg NOT IN (SELECT a.lg FROM new_lg a), 'нет в факте нового',
        q.lg IN (SELECT a.lg FROM new_lg a WHERE a.nown = 0), 'владелец (по новому)',
        q.lg IN (SELECT a.lg FROM new_lg a WHERE a.nst = 0 OR a.ok = 0), 'статус отчёта (по новому)',
        'прочее') AS why, q.lg AS lg
    FROM only_old q LEFT JOIN rkmap r ON r.lg = q.lg
    UNION ALL
    SELECT 'только в новом' AS side, multiIf(
        ifNull(r.rk, '') != '' AND r.rk IN (SELECT k.rk FROM rk_old k), 'смена логина',
        q.lg NOT IN (SELECT a.lg FROM old_lg a), 'нет в факте старого',
        q.lg IN (SELECT a.lg FROM old_lg a WHERE a.nown = 0), 'владелец (по старому)',
        q.lg IN (SELECT a.lg FROM old_lg a WHERE a.nst = 0 OR a.ok = 0), 'статус отчёта (по старому)',
        'прочее') AS why, q.lg AS lg
    FROM only_new q LEFT JOIN rkmap r ON r.lg = q.lg
  )
SELECT c.side AS side, c.why AS why, count() AS n, arrayStringConcat(groupArray(40)(c.lg), ', ') AS sample
FROM cls c
GROUP BY c.side, c.why
ORDER BY c.side, n DESC
