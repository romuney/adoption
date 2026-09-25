-- Helicopter-нода 844437 · 1) ЗАМЕНА параграфа «PA · штат» (поставка 2026-09-24): +2 колонки
-- hq_code (HQ | nonHQ | …) и it_code (IT | nonIT) — условия настройки ЦА.
-- 2) НОВЫЙ параграф «PA · размер групп» — после «PA · состав групп прав», до «PA · ЦА отчёта».

-- ---------------------------------------------------------------------------
-- Параграф «PA · штат» → usr_cross_data.pa_staff
-- Весь действующий штат (не только зрители): знаменатель охвата и ЦА «по структуре».
-- Оргструктура и атрибуты — как у зрителей в pa_emp_attrs (mapped-уровни УС); HQ и IT — условия ЦА.
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_staff;
create table usr_cross_data.pa_staff as
select
    lower(t.ad_login)::text                                  as login,
    coalesce(t.lvl3_mapped_management_unit_nm, '')::text     as lvl3_management_unit_nm,
    coalesce(t.lvl4_mapped_management_unit_nm, '')::text     as lvl4_management_unit_nm,
    coalesce(t.lvl5_mapped_management_unit_nm, '')::text     as lvl5_management_unit_nm,
    coalesce(t.lvl6_mapped_management_unit_nm, '')::text     as lvl6_management_unit_nm,
    coalesce(t.lvl7_mapped_management_unit_nm, '')::text     as lvl7_management_unit_nm,
    coalesce(t.emp_specialization_desc, '')::text            as emp_specialization_desc,
    coalesce(t.emp_stream_desc, '')::text                    as emp_stream_desc,
    coalesce(t.management_head_flg::int, 0)                  as management_head_flg,
    coalesce(nullif(trim(coalesce(u.last_name, '') || ' ' || coalesce(u.first_name, '')), ''), '')::text as fio,
    coalesce(t.experience_group_nm, '')::text                as exp_nm,
    coalesce(t.emp_specialization_oper_code, '')::text       as hq_code,   -- HQ | nonHQ | … (как фильтр «HQ|nonHQ» старого борда)
    coalesce(t.emp_specialization_it_code, '')::text         as it_code    -- IT | nonIT
from (
    select m.*,
        row_number() over (partition by lower(m.ad_login) order by m.mdm_employee_rk desc) as rn
    from prod_v_sse_crossdata.mdm_employee_d m
    where m.last_state_flg = 1
      and coalesce(m.company_fire_flg::int, 0) = 0
      and m.ad_login is not null and m.ad_login <> ''
) t
left join (
    select lower(username) as username, max(first_name) as first_name, max(last_name) as last_name
    from prod_v_sse.proteus_users
    group by lower(username)
) u on u.username = lower(t.ad_login)
where t.rn = 1
distributed by (login);

-- ---------------------------------------------------------------------------
-- Параграф «PA · размер групп» → usr_cross_data.pa_adg_size   (НОВЫЙ 2026-09-25)
-- Сколько людей действующего штата в каждой AD-группе прав — список «AD-группы»
-- в настройке ЦА (считается раз в сутки, а не на каждый клик).
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_adg_size;
create table usr_cross_data.pa_adg_size as
select m.ad_group::text as ad_group, count(distinct m.login)::bigint as n
from usr_cross_data.pa_adg_member m
inner join usr_cross_data.pa_staff s on s.login = m.login
group by m.ad_group
distributed by (ad_group);
