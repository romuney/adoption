-- Где терялись люди штата (GP, SQL-консоль). Запустить ДВАЖДЫ: до замены параграфа «PA · штат»
-- (строки 4, 6–8 — по старому pa_staff) и после прогона ноды (по новому). Ответ — таблицей, пришлите целиком.
with m13 as (
    select distinct lower(trim(ad_login)) as lg
    from prod_v_emart.mdm_employee_structure_d
    where nullif(trim(ad_login), '') is not null and business_dt >= current_date - interval '13 months'
),
ls as (
    select lower(trim(ad_login)) as lg, max(coalesce(company_fire_flg::int, 0)) as fired, min(coalesce(company_fire_flg::int, 0)) as fired_min
    from prod_v_emart.mdm_employee_structure_d
    where last_state_flg = 1 and nullif(trim(ad_login), '') is not null
    group by 1
),
vw as (
    select lower(trim(login)) as lg, max(log_dttm) as last_dt
    from usr_cross_data.proteus_views_1
    where nullif(trim(login), '') is not null and login <> 'svc_mon_otpp'
    group by 1
),
st as (select login as lg from usr_cross_data.pa_staff)
select '1. логинов в MDM за 13 мес. (любая строка записи)' as stage, count(*)::bigint as n from m13
union all select '2. логин в строке последнего состояния', count(*) from ls
union all select '3. … и действующая запись (старый расчёт штата)', count(*) from ls where fired_min = 0
union all select '4. в pa_staff сейчас', count(*) from st
union all select '5. зрители Proteus за 13 мес.', count(*) from vw
union all select '6. зрители вне pa_staff', count(*) from vw where lg not in (select lg from st)
union all select '7. … из них логин есть в истории MDM', count(*) from vw where lg not in (select lg from st) and lg in (select lg from m13)
union all select '8. … из них заходили за последние 30 дней', count(*) from vw where lg not in (select lg from st) and last_dt >= current_date - 30
union all select '9. логин в MDM за 13 мес., но не в pa_staff', count(*) from m13 where lg not in (select lg from st)
order by 1;
