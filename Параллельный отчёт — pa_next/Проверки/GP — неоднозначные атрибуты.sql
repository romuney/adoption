-- GP: выполнить ПОСЛЕ полной новой ноды. Только чтение новых таблиц.
-- Ноль — у последнего дня нет различных исходных наборов значимых атрибутов.
-- Ненулевое значение — диагностика унаследованной неоднозначности: прежний
-- row_number() сортирует только по дню. Это НЕ команда исправлять/удалять данные.
-- Различие сырых логинов/порядка массивов может исчезнуть при нормализации;
-- счётчик консервативный и требует разбора, а не автоматической блокировки.
WITH
report_max AS (
  SELECT dashboard_id, max(log_dttm) AS md
  FROM usr_cross_data.pa_next_source
  WHERE dashboard_id IS NOT NULL AND dashboard_id <> 13040
  GROUP BY dashboard_id
),
report_variants AS (
  SELECT v.dashboard_id,
    count(DISTINCT ROW(
      coalesce(v.dashboard_nm, ''), coalesce(v.owner_login, ''),
      coalesce(v.owners_string, ARRAY[]::text[]), coalesce(v.collection_names, ARRAY[]::text[]),
      coalesce(v.published::integer, 0), coalesce(v.actual_flg::integer, 0),
      v.certified_by::text, v.created_dt
    )) AS variants
  FROM usr_cross_data.pa_next_source v
  JOIN report_max d ON d.dashboard_id = v.dashboard_id AND d.md = v.log_dttm
  GROUP BY v.dashboard_id
),
viewers AS (
  SELECT coalesce(mp.canon, v.login)::text AS canon, v.*
  FROM usr_cross_data.pa_next_source v
  LEFT JOIN usr_cross_data.pa_next_login_map mp ON mp.login = lower(trim(v.login))
  WHERE v.login IS NOT NULL AND v.login <> 'svc_mon_otpp'
),
viewer_max AS (
  SELECT canon, max(log_dttm) AS md FROM viewers GROUP BY canon
),
viewer_variants AS (
  SELECT v.canon,
    count(DISTINCT ROW(
      coalesce(v.lvl3_management_unit_nm, ''), coalesce(v.lvl4_management_unit_nm, ''),
      coalesce(v.lvl5_management_unit_nm, ''), coalesce(v.lvl6_management_unit_nm, ''),
      coalesce(v.lvl7_management_unit_nm, ''), coalesce(v.emp_specialization_desc, ''),
      coalesce(v.emp_stream_desc, ''), coalesce(v.management_head_flg::integer, 0),
      coalesce(v.ad_groups, ARRAY[]::text[]), v.mdm_employee_rk
    )) AS variants
  FROM viewers v JOIN viewer_max m ON m.canon = v.canon AND m.md = v.log_dttm
  GROUP BY v.canon
)
SELECT 'reports_with_ambiguous_latest_attributes'::text AS check_name,
       count(*)::bigint AS ambiguous_groups
FROM report_variants WHERE variants > 1
UNION ALL
SELECT 'viewers_with_ambiguous_latest_attributes'::text, count(*)::bigint
FROM viewer_variants WHERE variants > 1;
