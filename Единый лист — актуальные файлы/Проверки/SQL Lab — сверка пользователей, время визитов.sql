-- Сверка «Пользователей за 30 дней», шаг 3: КОГДА заходили те, кто есть только в одном отчёте.
-- Один запрос, в SQL Lab как есть. Гипотеза: окна сдвинуты часовым поясом — старый (proteus_adoption) хранит время
-- визита, новый (pa_evd_day) — день, усечённый в Greenplum. Тогда расхождения — люди, заходившие только у краёв окна.
-- Первая строка — пояс сервера и типы времени; дальше по человеку: визиты в старом (ММ-ДД ЧЧ:ММ) и дни в новом
-- (ММ-ДД) за 32 дня до свежести и 1 день после.
WITH
  (SELECT max(z.max_date) FROM prod_proteus.proteus_adoption z) AS mx,
  old_lg AS (
    SELECT lower(trim(toString(ifNull(a.login, '')))) AS lg
    FROM prod_proteus.proteus_adoption a
    WHERE a.dashboard_id <> 13040 AND ifNull(a.login, '') != 'svc_mon_otpp' AND a.published = 1 AND a.actual_flg = 1
      AND hasAny(arrayMap(x -> replaceAll(replaceRegexpAll(x, '^"|"$', ''), '\\"', '"'), a.owners_string), [a.login]) = 0
      AND a.log_dttm BETWEEN date_add(DAY, -30, mx) AND mx
    GROUP BY lg
  ),
  new_lg AS (
    SELECT DISTINCT lower(trim(toString(p.login))) AS lg
    FROM prod_proteus.pa_pair p
    WHERE isNotNull(p.login) AND ifNull(p.own_flg, 0) = 0
      AND bitAnd(toUInt64(ifNull(p.msk_d, 0)), toUInt64(1073741823)) != 0
      AND p.dashboard_id IN (SELECT m.dashboard_id FROM prod_proteus.pa_dash_meta m WHERE m.published = 1 AND m.actual_flg = 1)
  ),
  diff AS (
    SELECT 'только в старом' AS side, o.lg AS lg FROM old_lg o WHERE o.lg != '' AND o.lg NOT IN (SELECT n.lg FROM new_lg n)
    UNION ALL
    SELECT 'только в новом' AS side, n.lg AS lg FROM new_lg n WHERE n.lg NOT IN (SELECT o.lg FROM old_lg o)
  ),
  old_ev AS (
    SELECT lower(trim(toString(a.login))) AS lg, arrayStringConcat(arraySort(groupUniqArray(formatDateTime(a.log_dttm, '%m-%d %H:%i'))), ' ') AS ev
    FROM prod_proteus.proteus_adoption a
    WHERE lower(trim(toString(a.login))) IN (SELECT d.lg FROM diff d)
      AND a.log_dttm BETWEEN date_add(DAY, -32, mx) AND date_add(DAY, 1, mx)
    GROUP BY lg
  ),
  new_ev AS (
    SELECT lower(trim(toString(e.login))) AS lg, arrayStringConcat(arraySort(groupUniqArray(formatDateTime(e.log_dttm, '%m-%d'))), ' ') AS ev
    FROM prod_proteus.pa_evd_day e
    WHERE lower(trim(toString(e.login))) IN (SELECT d.lg FROM diff d)
      AND toDate(e.log_dttm) BETWEEN toDate(mx) - 32 AND toDate(mx) + 1
    GROUP BY lg
  )
SELECT r.side AS side, r.lg AS lg, r.old_visits AS old_visits, r.new_days AS new_days FROM (
SELECT '0' AS side, concat('пояс сервера ', timezone()) AS lg,
  concat('старый log_dttm: ', (SELECT toTypeName(any(z.log_dttm)) FROM prod_proteus.proteus_adoption z), ', max_date ', toString(mx)) AS old_visits,
  concat('новый log_dttm: ', (SELECT toTypeName(any(z.log_dttm)) FROM prod_proteus.pa_evd_day z), ', md ', (SELECT toString(max(p.md)) FROM prod_proteus.pa_pair p)) AS new_days
UNION ALL
SELECT d.side AS side, d.lg AS lg, ifNull(o.ev, '') AS old_visits, ifNull(n.ev, '') AS new_days
FROM diff d LEFT JOIN old_ev o ON o.lg = d.lg LEFT JOIN new_ev n ON n.lg = d.lg
) r
ORDER BY r.side, r.lg
