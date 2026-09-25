-- ============================================================================
-- Helicopter-нода 844437 · параграфы вкладки «Аудитория» (GP)
-- Порядок: после параграфов «PA · …» поставки 2026-09-22 (нужна pa_dash_meta).
-- Каждый блок ниже — отдельный параграф gp. Выгрузка в ClickHouse — файл 2.
--
-- Целевая аудитория (ЦА) отчёта по правам = поимённые права ∪ члены AD-групп прав,
-- только действующий штат. Состав групп — прямое членство (как в существующем
-- параграфе «Витрина ad_login и ad_group»), вложенные группы не разворачиваются.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Параграф «PA · штат» → usr_cross_data.pa_staff   (2026-09-25: все, у кого есть ad_login)
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

-- ---------------------------------------------------------------------------
-- Параграф «PA · права отчётов» → usr_cross_data.pa_dash_acl
-- Отчёт × принципал: kind = 'user' (поимённое право, principal = логин) |
-- 'group' (AD-группа, principal = имя группы). Только отчёты вселенной (pa_dash_meta).
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_dash_acl;
create table usr_cross_data.pa_dash_acl as
select distinct
    a.dashboard_id::int                                                     as dashboard_id,
    case when a.access_type = 'user' then lower(a.user_or_group_name)
         else a.user_or_group_name end::text                                as principal,
    case when a.access_type = 'user' then 'user' else 'group' end::text     as kind
from prod_v_sse.proteus_dashboard_access a
where a.access_type in ('user', 'group')
  and a.user_or_group_name is not null and a.user_or_group_name <> ''
  and a.dashboard_id in (select dashboard_id from usr_cross_data.pa_dash_meta)
distributed by (dashboard_id);

-- ---------------------------------------------------------------------------
-- Параграф «PA · состав групп прав» → usr_cross_data.pa_adg_member
-- AD-группа × логин — только группы, которые встречаются в правах отчётов.
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_adg_member;
create table usr_cross_data.pa_adg_member as
with used as (
    select distinct principal as ad_group from usr_cross_data.pa_dash_acl where kind = 'group'
),
items as (
    select guid, account_name, item_type
    from prod_v_chrono_idm_tadam.ad_items_records_public
    where is_deleted = false
      and item_type in ('GroupUniversal', 'GroupMail', 'GroupSecurity', 'Person')
)
select distinct parent.account_name::text as ad_group, lower(child.account_name)::text as login
from prod_v_chrono_idm_tadam.ad_item_parent_relations_public r
inner join items parent on r.parent = parent.guid
inner join items child  on r.item   = child.guid
inner join used u on u.ad_group = parent.account_name
where child.item_type = 'Person'
  and parent.item_type in ('GroupUniversal', 'GroupMail', 'GroupSecurity')
distributed by (ad_group);

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

-- ---------------------------------------------------------------------------
-- Параграф «PA · ЦА отчёта» → usr_cross_data.pa_dash_ca
-- Размер ЦА по правам на отчёт (для колонки «Охват ЦА» каталога) и флаг «широкий
-- доступ»: ЦА ≥ 30 % штата — проценты охвата по такому знаменателю не показываем.
-- Владельцы отчёта в ЦА не входят (как в панели при «Без владельцев» — умолчание).
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_dash_ca;
create table usr_cross_data.pa_dash_ca as
with ca as (
    select a.dashboard_id, a.principal as login
    from usr_cross_data.pa_dash_acl a
    where a.kind = 'user'
    union
    select a.dashboard_id, m.login
    from usr_cross_data.pa_dash_acl a
    inner join usr_cross_data.pa_adg_member m on m.ad_group = a.principal
    where a.kind = 'group'
),
hc as (select count(*) as n from usr_cross_data.pa_staff)
select c.dashboard_id::int as dashboard_id,
       count(*)::bigint as ca_n,
       (count(*) >= 0.3 * max(hc.n))::int as ca_wide
from ca c
inner join usr_cross_data.pa_staff s on s.login = c.login
left join (
    select dashboard_id, lower(unnest(owners_string)) as login from usr_cross_data.pa_dash_meta
) ow on ow.dashboard_id = c.dashboard_id and ow.login = c.login
cross join hc
where ow.login is null
group by c.dashboard_id
distributed by (dashboard_id);

-- ---------------------------------------------------------------------------
-- Параграф «PA · доступ зрителей» → usr_cross_data.pa_pair_acc   (НОВЫЙ 2026-09-25, после «PA · ЦА отчёта»)
-- Пары «отчёт × зритель» из pa_pair, где зритель — действующий сотрудник с AD-логином (pa_staff) с правом
-- на отчёт: поимённо или через AD-группу. Числитель «Охвата ЦА» каталога вкладки: зрители из ЦА, а не все.
-- Считается от пар к группам зрителя (не от групп ко всем их членам) — без взрыва на широких группах.
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_pair_acc;
create table usr_cross_data.pa_pair_acc as
with pr as (
    select distinct p.dashboard_id::int as dashboard_id, lower(p.login)::text as login
    from usr_cross_data.pa_pair p
    where p.login is not null and p.login <> ''
),
acc as (
    select pr.dashboard_id, pr.login
    from pr
    inner join usr_cross_data.pa_dash_acl a
        on a.kind = 'user' and a.dashboard_id = pr.dashboard_id and a.principal = pr.login
    union
    select pr.dashboard_id, pr.login
    from pr
    inner join usr_cross_data.pa_adg_member m on m.login = pr.login
    inner join usr_cross_data.pa_dash_acl a
        on a.kind = 'group' and a.dashboard_id = pr.dashboard_id and a.principal = m.ad_group
)
select acc.dashboard_id, acc.login
from acc
inner join usr_cross_data.pa_staff s on s.login = acc.login
distributed by (dashboard_id);
