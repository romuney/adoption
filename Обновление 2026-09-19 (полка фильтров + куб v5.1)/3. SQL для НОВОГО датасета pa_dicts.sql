-- pa_dicts — справочник полки фильтров (виджет pa-shelf).
-- Виртуальный датасет над prod_proteus.proteus_adoption: все секции одной
-- таблицей. Секции: rep (отчёты вселенной куба, >=500 просмотров за историю),
-- coll (коллекции), own (владельцы — элементы owners_string), auth (авторы —
-- owner_login), lvl3/lvl4 (управленческая структура, lvl4 несёт parent),
-- stream, spec, adg (AD-группы сотрудника).
-- Колонки: section, k (ключ; у rep = dashboard_id строкой), nm (подпись),
-- parent (блок lvl3 для lvl4, иначе '').
-- Джоиня против факта с условием вселенной куба (dashboard_id != 13040,
-- login != 'svc_mon_otpp'); массивы — GROUP BY по массиву + ARRAY JOIN,
-- чтобы не гнать arrayJoin по 8М строк факта.

SELECT DISTINCT 'coll' AS section, toString(c) AS k, toString(c) AS nm, '' AS parent
FROM (
  SELECT collection_names FROM prod_proteus.proteus_adoption
  WHERE dashboard_id != 13040 AND login != 'svc_mon_otpp'
  GROUP BY collection_names
) ARRAY JOIN collection_names AS c

UNION ALL

SELECT DISTINCT 'own' AS section, toString(o) AS k, toString(o) AS nm, '' AS parent
FROM (
  SELECT owners_string FROM prod_proteus.proteus_adoption
  WHERE dashboard_id != 13040 AND login != 'svc_mon_otpp'
  GROUP BY owners_string
) ARRAY JOIN owners_string AS o

UNION ALL

SELECT DISTINCT 'auth' AS section, toString(w) AS k, toString(w) AS nm, '' AS parent
FROM (
  SELECT DISTINCT owner_login AS w FROM prod_proteus.proteus_adoption
  WHERE dashboard_id != 13040 AND login != 'svc_mon_otpp'
) WHERE w != ''

UNION ALL

SELECT DISTINCT 'lvl3' AS section, toString(l3) AS k, toString(l3) AS nm, '' AS parent
FROM (
  SELECT DISTINCT lvl3_management_unit_nm AS l3 FROM prod_proteus.proteus_adoption
  WHERE dashboard_id != 13040 AND login != 'svc_mon_otpp'
) WHERE l3 != ''

UNION ALL

SELECT DISTINCT 'lvl4' AS section, toString(l4) AS k, toString(l4) AS nm, toString(l3) AS parent
FROM (
  SELECT lvl3_management_unit_nm AS l3, lvl4_management_unit_nm AS l4
  FROM prod_proteus.proteus_adoption
  WHERE dashboard_id != 13040 AND login != 'svc_mon_otpp'
  GROUP BY l3, l4
) WHERE l4 != ''

UNION ALL

SELECT DISTINCT 'stream' AS section, toString(s) AS k, toString(s) AS nm, '' AS parent
FROM (
  SELECT DISTINCT emp_stream_desc AS s FROM prod_proteus.proteus_adoption
  WHERE dashboard_id != 13040 AND login != 'svc_mon_otpp'
) WHERE s != ''

UNION ALL

SELECT DISTINCT 'spec' AS section, toString(p) AS k, toString(p) AS nm, '' AS parent
FROM (
  SELECT DISTINCT emp_specialization_desc AS p FROM prod_proteus.proteus_adoption
  WHERE dashboard_id != 13040 AND login != 'svc_mon_otpp'
) WHERE p != ''

UNION ALL

SELECT DISTINCT 'adg' AS section, toString(g) AS k, toString(g) AS nm, '' AS parent
FROM (
  SELECT ad_groups FROM prod_proteus.proteus_adoption
  WHERE dashboard_id != 13040 AND login != 'svc_mon_otpp'
  GROUP BY ad_groups
) ARRAY JOIN ad_groups AS g

UNION ALL

SELECT 'rep' AS section, toString(d) AS k, toString(nm) AS nm, '' AS parent
FROM (
  SELECT dashboard_id AS d, any(dashboard_nm) AS nm, sum(action_count) AS vv
  FROM prod_proteus.proteus_adoption
  WHERE dashboard_id != 13040 AND login != 'svc_mon_otpp'
  GROUP BY dashboard_id
  HAVING vv >= 500
)

ORDER BY section, nm
