-- ============================================================================
-- Helicopter-нода 844437 · параграфы предагрегатов Proteus Adoption (GP)
-- Порядок: после параграфа «Финальная таблица из event_physical_report»
-- (usr_cross_data.proteus_views_1). Каждый блок ниже — отдельный параграф gp.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Параграф «PA · факт отчёт×логин×день» → usr_cross_data.pa_evd_day
-- Вселенная куба: без самого борда (13040) и сервисного логина.
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_evd_day;
create table usr_cross_data.pa_evd_day as
select
    v.dashboard_id::int                  as dashboard_id,
    v.login::text                        as login,
    date_trunc('day', v.log_dttm)        as log_dttm,
    sum(v.action_count)::bigint          as views
from usr_cross_data.proteus_views_1 v
where v.dashboard_id is not null
  and v.login is not null
  and v.dashboard_id <> 13040
  and v.login <> 'svc_mon_otpp'
group by 1, 2, 3
distributed by (dashboard_id);

-- ---------------------------------------------------------------------------
-- Параграф «PA · мета отчётов» → usr_cross_data.pa_dash_meta (1 строка на отчёт,
-- последнее известное состояние по log_dttm).
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_dash_meta;
create table usr_cross_data.pa_dash_meta as
select dashboard_id, dashboard_nm, owner_login, owners_string, collection_names,
       published, actual_flg, certified_by, created_dt
from (
    select
        v.dashboard_id::int                                   as dashboard_id,
        coalesce(v.dashboard_nm, '')::text                    as dashboard_nm,
        coalesce(v.owner_login, '')::text                     as owner_login,
        coalesce(v.owners_string, array[]::text[])            as owners_string,
        coalesce(v.collection_names, array[]::text[])         as collection_names,
        coalesce(v.published::int, 0)                         as published,
        coalesce(v.actual_flg::int, 0)                        as actual_flg,
        v.certified_by::text                                  as certified_by,
        v.created_dt                                          as created_dt,
        row_number() over (partition by v.dashboard_id order by v.log_dttm desc) as rn
    from usr_cross_data.proteus_views_1 v
    where v.dashboard_id is not null and v.dashboard_id <> 13040
) t
where rn = 1
distributed by (dashboard_id);

-- ---------------------------------------------------------------------------
-- Параграф «PA · атрибуты зрителей» → usr_cross_data.pa_emp_attrs
-- (1 строка на логин: последнее состояние по log_dttm + ФИО и стаж).
-- НОВОЕ 2026-09-22: fio (Фамилия Имя из proteus_users), exp_nm (группа стажа
-- из mdm_employee_d, last_state_flg = 1) — закрывают хвост «ФИО/стаж — заглушки».
-- НОВОЕ 2026-09-23: lvl5…lvl7_management_unit_nm — полная оргструктура УС-3…УС-7
-- для группировки «Оргструктура» в «Кто смотрит» (колонки есть в proteus_views_1).
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_emp_attrs;
create table usr_cross_data.pa_emp_attrs as
select
    t.login,
    t.lvl3_management_unit_nm,
    t.lvl4_management_unit_nm,
    t.lvl5_management_unit_nm,
    t.lvl6_management_unit_nm,
    t.lvl7_management_unit_nm,
    t.emp_specialization_desc,
    t.emp_stream_desc,
    t.management_head_flg,
    t.ad_groups,
    coalesce(nullif(trim(coalesce(u.last_name, '') || ' ' || coalesce(u.first_name, '')), ''), '')::text as fio,
    coalesce(m.experience_group_nm, '')::text as exp_nm
from (
    select
        v.login::text                                           as login,
        coalesce(v.lvl3_management_unit_nm, '')::text           as lvl3_management_unit_nm,
        coalesce(v.lvl4_management_unit_nm, '')::text           as lvl4_management_unit_nm,
        coalesce(v.lvl5_management_unit_nm, '')::text           as lvl5_management_unit_nm,
        coalesce(v.lvl6_management_unit_nm, '')::text           as lvl6_management_unit_nm,
        coalesce(v.lvl7_management_unit_nm, '')::text           as lvl7_management_unit_nm,
        coalesce(v.emp_specialization_desc, '')::text           as emp_specialization_desc,
        coalesce(v.emp_stream_desc, '')::text                   as emp_stream_desc,
        coalesce(v.management_head_flg::int, 0)                 as management_head_flg,
        coalesce(v.ad_groups, array[]::text[])                  as ad_groups,
        v.mdm_employee_rk                                       as mdm_employee_rk,
        row_number() over (partition by v.login order by v.log_dttm desc) as rn
    from usr_cross_data.proteus_views_1 v
    where v.login is not null and v.login <> 'svc_mon_otpp'
) t
left join (
    select username, max(first_name) as first_name, max(last_name) as last_name
    from prod_v_sse.proteus_users
    group by username
) u on u.username = t.login
left join (
    select mdm_employee_rk, max(experience_group_nm) as experience_group_nm
    from prod_v_sse_crossdata.mdm_employee_d
    where last_state_flg = 1
    group by mdm_employee_rk
) m on m.mdm_employee_rk = t.mdm_employee_rk
where t.rn = 1
distributed by (login);

-- ---------------------------------------------------------------------------
-- Параграф «PA · пары отчёт×логин» → usr_cross_data.pa_pair   (НОВЫЙ 2026-09-22)
-- Главный предагрегат куба тела: одна строка на пару, всё, что куб раньше
-- считал на лету из дневного факта, для всех 4 грануляций сразу.
--   k = возраст бакета от даты свежести md (0 = текущий бакет);
--   msk_<g> — битовая маска активных бакетов k < 2n (bit k), n = 30/20/12/8;
--   v_<g> / vp_<g> — просмотры текущего / предыдущего окна n;
--   kmax_<g> — возраст самого старого бакета (первый визит пары);
--   msk_mon — маска месяцев активности (bit = возраст месяца, до 62);
--   own_flg — зритель входит во владельцев отчёта (свиток «без владельцев»);
--   md — дата свежести, с которой считались возрасты (контроль синхронности).
-- Грануляции как у ClickHouse: день; неделя с понедельника (date_trunc('week'));
-- месяц; квартал.
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_pair;
create table usr_cross_data.pa_pair as
with mx as (
    select max(log_dttm) as md from usr_cross_data.pa_evd_day
),
ev as (
    select
        e.dashboard_id, e.login, e.log_dttm, e.views,
        (x.md::date - e.log_dttm::date)                                                    as kd,
        ((date_trunc('week', x.md)::date - date_trunc('week', e.log_dttm)::date) / 7)      as kw,
        ((extract(year from x.md) * 12 + extract(month from x.md))
          - (extract(year from e.log_dttm) * 12 + extract(month from e.log_dttm)))::int    as km,
        ((extract(year from x.md) * 4 + extract(quarter from x.md))
          - (extract(year from e.log_dttm) * 4 + extract(quarter from e.log_dttm)))::int   as kq,
        x.md
    from usr_cross_data.pa_evd_day e
    cross join mx x
)
select
    ev.dashboard_id,
    ev.login,
    bit_or(case when kd < 60 then (1::bigint << kd) else 0::bigint end)              as msk_d,
    sum(case when kd < 30 then views else 0 end)::bigint                             as v_d,
    sum(case when kd >= 30 and kd < 60 then views else 0 end)::bigint                as vp_d,
    max(kd)::bigint                                                                   as kmax_d,
    bit_or(case when kw < 40 then (1::bigint << kw) else 0::bigint end)              as msk_w,
    sum(case when kw < 20 then views else 0 end)::bigint                             as v_w,
    sum(case when kw >= 20 and kw < 40 then views else 0 end)::bigint               as vp_w,
    max(kw)::bigint                                                                   as kmax_w,
    bit_or(case when km < 24 then (1::bigint << km) else 0::bigint end)              as msk_m,
    sum(case when km < 12 then views else 0 end)::bigint                             as v_m,
    sum(case when km >= 12 and km < 24 then views else 0 end)::bigint                as vp_m,
    max(km)::bigint                                                                   as kmax_m,
    bit_or(case when kq < 16 then (1::bigint << kq) else 0::bigint end)              as msk_q,
    sum(case when kq < 8 then views else 0 end)::bigint                              as v_q,
    sum(case when kq >= 8 and kq < 16 then views else 0 end)::bigint                 as vp_q,
    max(kq)::bigint                                                                   as kmax_q,
    sum(views)::bigint                                                                as v_life,
    max(ev.log_dttm)                                                                  as dmax,
    min(ev.log_dttm)                                                                  as dmin,
    bit_or(1::bigint << least(km, 62))                                                as msk_mon,
    max(case when ev.login = any(m.owners_string) then 1 else 0 end)::smallint        as own_flg,
    max(ev.md)                                                                        as md
from ev
left join usr_cross_data.pa_dash_meta m on m.dashboard_id = ev.dashboard_id
group by ev.dashboard_id, ev.login
distributed by (dashboard_id);
