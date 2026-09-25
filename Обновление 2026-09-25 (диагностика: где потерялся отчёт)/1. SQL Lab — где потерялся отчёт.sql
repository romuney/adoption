-- 1
-- Где каталог «потерял» отчёт: одна строка по шагам конвейера (SQL Lab, база CROSS).
-- Замените 12345 на id отчёта (одно место, первая строка WITH) и запустите.
-- Шаги повторяют фильтры каталога по умолчанию: опубликованные · актуальные · без владельцев ·
-- порог вселенной «≥ 500 просмотров за историю (13 месяцев)».
WITH 12345 AS id
SELECT
  id AS dashboard_id,
  (SELECT any(toString(dashboard_nm)) FROM prod_proteus.pa_dash_meta WHERE dashboard_id = id) AS name,
  (SELECT count() FROM prod_proteus.pa_evd_day WHERE dashboard_id = id) AS s1_fact_days,              -- 1: дней с просмотрами в факте
  (SELECT count() FROM prod_proteus.pa_dash_meta WHERE dashboard_id = id) AS s2_in_meta,              -- 2: есть в справочнике отчётов
  (SELECT any(published) FROM prod_proteus.pa_dash_meta WHERE dashboard_id = id) AS s3_published,     -- 3: опубликован (1)
  (SELECT any(actual_flg) FROM prod_proteus.pa_dash_meta WHERE dashboard_id = id) AS s4_actual,       -- 4: актуален (1)
  (SELECT count() FROM prod_proteus.pa_pair WHERE dashboard_id = id) AS s5_viewers_all,               -- 5: зрителей за историю
  (SELECT countIf(ifNull(own_flg, 0) = 0) FROM prod_proteus.pa_pair WHERE dashboard_id = id) AS s6_viewers_not_owners,
  (SELECT toInt64(sumIf(ifNull(v_life, 0), ifNull(own_flg, 0) = 0)) FROM prod_proteus.pa_pair WHERE dashboard_id = id) AS s7_views_not_owners,  -- порог 500
  (SELECT countIf(ifNull(own_flg, 0) = 0 AND bitAnd(toUInt64(ifNull(msk_d, 0)), 1073741823) != 0) FROM prod_proteus.pa_pair WHERE dashboard_id = id) AS s8_users_30d,
  (SELECT max(dmax) FROM prod_proteus.pa_pair WHERE dashboard_id = id) AS last_view,
  (SELECT max(ifNull(md, dmax)) FROM prod_proteus.pa_pair) AS data_date,
  multiIf(
    s1_fact_days = 0, '1. Нет ни одного просмотра за 13 месяцев в факте (или отчёт вне Proteus / сервисный). В каталог не может попасть',
    s2_in_meta = 0, '2. Есть просмотры, но нет в справочнике pa_dash_meta — пришлите id разработчику',
    s3_published != 1, '3. Не опубликован: в шапке выключите «Опубликованные» — появится',
    s4_actual != 1, '4. Помечен неактуальным: в шапке выключите «Актуальные» — появится',
    s6_viewers_not_owners = 0, '5. Смотрят только владельцы: в шапке выключите «Без владельцев» — появится',
    s7_views_not_owners < 500, concat('6. Меньше 500 просмотров за историю (', toString(s7_views_not_owners), ') — порог вселенной каталога, отчёт скрыт'),
    s8_users_30d = 0, '7. В каталоге ЕСТЬ, но за 30 дней 0 пользователей — внизу списка по сортировке «Польз.»; ищите поиском по названию или выберите 12 месяцев',
    '8. В каталоге ЕСТЬ: найдите поиском по названию или владельцу (регистр не важен)') AS verdict
