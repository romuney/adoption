-- ============================================================================
-- Helicopter-нода 844437 · параграфы вкладки «Аудитория» (GP)
-- Порядок: после параграфов «PA · …» поставки 2026-09-22 (нужна pa_dash_meta).
-- Каждый блок ниже — отдельный параграф gp. Выгрузка в ClickHouse — файл 1b.
--
-- Целевая аудитория (ЦА) отчёта по правам = поимённые права ∪ члены AD-групп прав,
-- только действующий штат. Состав групп — прямое членство (как в существующем
-- параграфе «Витрина ad_login и ad_group»), вложенные группы не разворачиваются.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Параграф «PA · штат» → usr_cross_data.pa_staff
-- Весь действующий штат (не только зрители): знаменатель охвата и ЦА «по структуре».
-- Оргструктура и атрибуты — как у зрителей в pa_emp_attrs (mapped-уровни УС).
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
    coalesce(t.experience_group_nm, '')::text                as exp_nm
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
