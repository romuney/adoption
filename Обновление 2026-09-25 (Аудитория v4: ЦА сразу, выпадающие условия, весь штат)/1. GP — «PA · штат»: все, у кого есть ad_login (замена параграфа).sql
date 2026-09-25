-- Helicopter-нода 844437 · ЗАМЕНА параграфа «PA · штат» (текст целиком; остальные параграфы не меняются).
-- Перед заменой запустите файл 2 (диагностика) — снимок «до».

-- ---------------------------------------------------------------------------
-- Параграф «PA · штат» → usr_cross_data.pa_staff          (ЗАМЕНА, поставка 2026-09-25 v4)
-- База ЦА — все, у кого есть ad_login и кто работает сейчас:
--  (1) MDM: логин берётся из ЛЮБОЙ строки записи за 13 мес. (в строке последнего состояния
--      ad_login бывает пуст — такие люди раньше выпадали), атрибуты — из последнего состояния
--      записи (как параграф mdm_employee_daily); логин с несколькими записями (повторный наём,
--      перевод) — действующая запись, затем самая свежая; уволенные не входят;
--  (2) зрители Proteus за 13 мес., которых нет в (1) (подрядчики, записи без MDM): атрибуты —
--      из их последнего события, уволенные по событию не входят.
-- Логины — lower(trim()), как в событиях. src: mdm | viewer — откуда человек в базе.
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_staff;
create table usr_cross_data.pa_staff as
with lg as (
    select lower(trim(m.ad_login)) as login, m.mdm_employee_rk, max(m.business_dt) as dt
    from prod_v_sse_crossdata.mdm_employee_d m
    where nullif(trim(m.ad_login), '') is not null
      and m.business_dt >= current_date - interval '13 months'
    group by 1, 2
),
mdm as (
    select lg.login as lg, l.*,
        row_number() over (partition by lg.login
                           order by coalesce(l.company_fire_flg::int, 0), lg.dt desc, lg.mdm_employee_rk desc) as rn
    from lg
    inner join prod_v_sse_crossdata.mdm_employee_d l
        on l.mdm_employee_rk = lg.mdm_employee_rk and l.last_state_flg = 1
),
vw as (
    select lower(trim(v.login)) as lg, v.*,
        row_number() over (partition by lower(trim(v.login)) order by v.log_dttm desc) as rn
    from usr_cross_data.proteus_views_1 v
    where nullif(trim(v.login), '') is not null and v.login <> 'svc_mon_otpp'
),
base as (
    select m.lg as login, 'mdm'::text as src,
        m.lvl3_mapped_management_unit_nm as l3, m.lvl4_mapped_management_unit_nm as l4, m.lvl5_mapped_management_unit_nm as l5,
        m.lvl6_mapped_management_unit_nm as l6, m.lvl7_mapped_management_unit_nm as l7,
        m.emp_specialization_desc as spec, m.emp_stream_desc as stream, m.management_head_flg::int as head,
        m.experience_group_nm as exp_nm, m.emp_specialization_oper_code as hq, m.emp_specialization_it_code as it
    from mdm m
    where m.rn = 1 and coalesce(m.company_fire_flg::int, 0) = 0
    union all
    select v.lg, 'viewer'::text,
        v.lvl3_management_unit_nm, v.lvl4_management_unit_nm, v.lvl5_management_unit_nm,
        v.lvl6_management_unit_nm, v.lvl7_management_unit_nm,
        v.emp_specialization_desc, v.emp_stream_desc, v.management_head_flg::int,
        null::text, v.emp_specialization_oper_code, v.emp_specialization_it_code
    from vw v
    where v.rn = 1 and coalesce(v.company_fire_flg::int, 0) = 0
      and not exists (select 1 from mdm m where m.rn = 1 and m.lg = v.lg)
)
select
    b.login::text                                            as login,
    coalesce(b.l3, '')::text                                 as lvl3_management_unit_nm,
    coalesce(b.l4, '')::text                                 as lvl4_management_unit_nm,
    coalesce(b.l5, '')::text                                 as lvl5_management_unit_nm,
    coalesce(b.l6, '')::text                                 as lvl6_management_unit_nm,
    coalesce(b.l7, '')::text                                 as lvl7_management_unit_nm,
    coalesce(b.spec, '')::text                               as emp_specialization_desc,
    coalesce(b.stream, '')::text                             as emp_stream_desc,
    coalesce(b.head, 0)                                      as management_head_flg,
    coalesce(nullif(trim(coalesce(u.last_name, '') || ' ' || coalesce(u.first_name, '')), ''), '')::text as fio,
    coalesce(b.exp_nm, '')::text                             as exp_nm,
    coalesce(b.hq, '')::text                                 as hq_code,   -- HQ | nonHQ | … (как фильтр «HQ|nonHQ» старого борда)
    coalesce(b.it, '')::text                                 as it_code,   -- IT | nonIT
    b.src                                                    as src
from base b
left join (
    select lower(trim(username)) as username, max(first_name) as first_name, max(last_name) as last_name
    from prod_v_sse.proteus_users
    group by 1
) u on u.username = b.login
distributed by (login);
