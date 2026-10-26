-- ==============================================================================================================
-- Helicopter-нода 844437 · НОВЫЙ gp-параграф 2 из 3: «PA · ускорение 2/3 — календари по дням» (2026-10-23)
-- Вставить ЦЕЛИКОМ одним gp-параграфом в КОНЕЦ ноды — после всех существующих параграфов, включая выгрузку.
-- Порядок новых параграфов: 1a → 1b → 1c → 2a (python, выгрузка). Таблицы — без схемы, как collection_array /
-- period_agg этой ноды: их забирает выгрузка 2a, борды GP не читают. Сбой здесь не мешает старым витринам — они уже
-- выгружены выше по ноде.
-- Читает: usr_cross_data.pa_evd_day, pa_pair, pa_dash_meta.
-- ==============================================================================================================

-- ---- витрина «PA · календарь отчёта по дням» → pa_dash_day
-- Отчёт × день: зрителей и просмотров — всех и без владельцев отчёта (пары own_flg = 1). «Календарь» панели
-- по одному отчёту и «Календарь» мгновенной панели каталога (20 недель / 12 месяцев / 8 кварталов) берут дни
-- отсюда, а не из подневного факта.
drop table if exists pa_dash_day;
create table pa_dash_day as
select e.dashboard_id::int as dashboard_id, e.log_dttm::date as dt,
    count(distinct e.login)::bigint as users,
    count(distinct case when coalesce(p.own_flg, 0) = 0 then e.login end)::bigint as users_nown,
    sum(e.views)::bigint as views,
    sum(case when coalesce(p.own_flg, 0) = 0 then e.views else 0 end)::bigint as views_nown
from usr_cross_data.pa_evd_day e
left join usr_cross_data.pa_pair p on p.dashboard_id = e.dashboard_id and p.login = e.login
where e.login is not null
group by 1, 2
distributed by (dashboard_id);
analyze pa_dash_day;

-- ---- витрина «PA · календарь всего Proteus по дням» → pa_all_day
-- День × переключатели шапки (pub = 1 — только опубликованные, act = 1 — только актуальные): уникальных зрителей
-- и просмотров — всех и без владельцев. «Календарь» панели без выбора в каталоге на 20 неделях / 12 месяцах /
-- 8 кварталах (весь период по дням) — отсюда: раньше это было чтение года подневного факта на каждый клик (1,5 с).
drop table if exists pa_all_day;
create table pa_all_day as
select f.pub, f.act, e.log_dttm::date as dt,
    count(distinct e.login)::bigint as users,
    count(distinct case when coalesce(p.own_flg, 0) = 0 then e.login end)::bigint as users_nown,
    sum(e.views)::bigint as views,
    sum(case when coalesce(p.own_flg, 0) = 0 then e.views else 0 end)::bigint as views_nown
from usr_cross_data.pa_evd_day e
inner join usr_cross_data.pa_dash_meta m on m.dashboard_id = e.dashboard_id
left join usr_cross_data.pa_pair p on p.dashboard_id = e.dashboard_id and p.login = e.login
cross join (select 0 as pub, 0 as act union all select 1, 0 union all select 0, 1 union all select 1, 1) f
where e.login is not null
  and (f.pub = 0 or m.published = 1) and (f.act = 0 or m.actual_flg = 1)
group by 1, 2, 3
distributed by (dt);
analyze pa_all_day;
