-- Проверка витрин ускорения (GP, параграфы 1a, 1b, 1c + выгрузка 2a) на боевых данных — ПОСЛЕ прогона ноды и выгрузки, ДО замены SQL датасетов.
-- Вставить целиком в SQL Lab (база ClickHouse, где prod_proteus.pa_*), «Run». Каждая строка — одно сравнение: витрина ==
-- тому, что датасеты раньше считали сами. Ждём ok = 1 во ВСЕХ строках. Хоть один 0 — не заменять SQL, прислать таблицу целиком.
-- Цифру в первой строке меняйте для повторного прогона: SQL Lab кэширует результат.  1
SELECT check_name, toString(value_vitrina) AS vitrina, toString(value_live) AS live, toUInt8(value_vitrina = value_live) AS ok
FROM (
  SELECT '01. дата свежести pa_md' AS check_name,
    toString((SELECT max(assumeNotNull(md)) FROM prod_proteus.pa_md)) AS value_vitrina,
    toString((SELECT max(ifNull(md, dmax)) FROM prod_proteus.pa_pair)) AS value_live
  UNION ALL
  SELECT '02. начало истории pa_md', toString((SELECT min(assumeNotNull(ds)) FROM prod_proteus.pa_md)), toString((SELECT min(dmin) FROM prod_proteus.pa_pair))
  UNION ALL
  SELECT '03. зрителей pa_viewer = логинов пар', toString((SELECT count() FROM prod_proteus.pa_viewer)),
    toString((SELECT uniqExact(login) FROM prod_proteus.pa_pair WHERE isNotNull(login)))
  UNION ALL
  SELECT '04. сотрудников pa_staffx = штат', toString((SELECT count() FROM prod_proteus.pa_staffx)), toString((SELECT count() FROM prod_proteus.pa_staff))
  UNION ALL
  SELECT '05. словарь pa_dict: значений специализации', toString((SELECT count() FROM prod_proteus.pa_dict WHERE g = 'spec')),
    toString((SELECT uniqExact(v) FROM (SELECT toString(ifNull(emp_specialization_desc, '')) AS v FROM prod_proteus.pa_staff
      UNION ALL SELECT toString(ifNull(emp_specialization_desc, '')) FROM prod_proteus.pa_emp_attrs UNION ALL SELECT '')))
  UNION ALL
  SELECT '06. ИТОГО каталога, 30 дней (pa_cat_grp)', toString((SELECT any(u_d) FROM prod_proteus.pa_cat_grp WHERE kd = 0 AND pub = 1 AND act = 1 AND exc = 1)),
    toString((SELECT countIf(bitAnd(m, 1073741823) != 0) FROM (SELECT login, groupBitOr(toUInt64(ifNull(msk_d, 0))) AS m FROM prod_proteus.pa_pair
      WHERE isNotNull(login) AND ifNull(own_flg, 0) = 0
        AND dashboard_id IN (SELECT dashboard_id FROM prod_proteus.pa_dash_meta WHERE published = 1 AND actual_flg = 1) GROUP BY login)))
  UNION ALL
  SELECT '07. ИТОГО каталога, 12 месяцев, все отчёты (pa_cat_grp)', toString((SELECT any(u_m) FROM prod_proteus.pa_cat_grp WHERE kd = 0 AND pub = 0 AND act = 0 AND exc = 0)),
    toString((SELECT countIf(bitAnd(m, 4095) != 0) FROM (SELECT login, groupBitOr(toUInt64(ifNull(msk_m, 0))) AS m FROM prod_proteus.pa_pair
      WHERE isNotNull(login) AND dashboard_id IN (SELECT dashboard_id FROM prod_proteus.pa_dash_meta) GROUP BY login)))
  UNION ALL
  SELECT '08. отчёты каталога: Σ пользователей, 20 недель (pa_cat_rep)', toString((SELECT sum(u_w) FROM prod_proteus.pa_cat_rep WHERE exc = 1)),
    toString((SELECT countIf(bitAnd(toUInt64(ifNull(msk_w, 0)), 1048575) != 0) FROM prod_proteus.pa_pair WHERE isNotNull(login) AND ifNull(own_flg, 0) = 0))
  UNION ALL
  SELECT '09. отчёты каталога: Σ просмотров, 8 кварталов (pa_cat_rep)', toString((SELECT sum(v_q) FROM prod_proteus.pa_cat_rep WHERE exc = 0)),
    toString((SELECT sum(ifNull(v_q, 0)) FROM prod_proteus.pa_pair WHERE isNotNull(login)))
  UNION ALL
  SELECT '10. «Аудитория» каталога: все зрители, 30 дней (pa_cat_aud)', toString((SELECT any(u_d) FROM prod_proteus.pa_cat_aud WHERE ad = 'all' AND pub = 1 AND act = 1 AND exc = 1)),
    toString((SELECT countIf(bitAnd(m, 1073741823) != 0) FROM (SELECT lower(toString(login)) AS vl, groupBitOr(toUInt64(ifNull(msk_d, 0))) AS m FROM prod_proteus.pa_pair
      WHERE isNotNull(login) AND ifNull(own_flg, 0) = 0
        AND dashboard_id IN (SELECT dashboard_id FROM prod_proteus.pa_dash_meta WHERE published = 1 AND actual_flg = 1) GROUP BY vl)))
  UNION ALL
  SELECT '11. календарь Proteus: зрителей в последний день (pa_all_day)',
    toString((SELECT ifNull(any(users_nown), 0) FROM prod_proteus.pa_all_day WHERE pub = 1 AND act = 1 AND toDate(dt) = (SELECT toDate(max(assumeNotNull(md))) FROM prod_proteus.pa_md))),
    toString((SELECT uniqExact(e.login) FROM prod_proteus.pa_evd_day e
      WHERE toDate(e.log_dttm) = (SELECT toDate(max(ifNull(md, dmax))) FROM prod_proteus.pa_pair) AND isNotNull(e.login)
        AND e.dashboard_id IN (SELECT dashboard_id FROM prod_proteus.pa_dash_meta WHERE published = 1 AND actual_flg = 1)
        AND (e.dashboard_id, e.login) NOT IN (SELECT dashboard_id, login FROM prod_proteus.pa_pair WHERE own_flg = 1)))
  UNION ALL
  SELECT '12. календарь отчётов: дней с визитами (pa_dash_day)', toString((SELECT count() FROM prod_proteus.pa_dash_day)),
    toString((SELECT uniqExact(dashboard_id, toDate(log_dttm)) FROM prod_proteus.pa_evd_day WHERE isNotNull(login)))
)
ORDER BY check_name
