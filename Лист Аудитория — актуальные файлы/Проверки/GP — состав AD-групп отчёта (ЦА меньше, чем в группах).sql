-- GP-консоль. ЦА отчёта меньше, чем людей в его AD-группах: по каждой группе прав отчёта показывает,
-- сколько людей даёт прежний способ (прямое членство, точный регистр имени) и новый (подгруппы до 6
-- уровней, регистр не важен), и сколько из них в базе ЦА (pa_staff).
-- Поставь ID отчёта в строке «params» (сейчас 0 — возьмёт отчёт по имени из той же строки) и пришли
-- таблицу целиком.
with params as (select 0::int as dash_id, '%Team Pulse: Управленческая структура HQ%'::text as dash_like),
d as (
    select m.dashboard_id::int as dashboard_id from usr_cross_data.pa_dash_meta m, params p
    where (p.dash_id > 0 and m.dashboard_id = p.dash_id) or (p.dash_id = 0 and m.dashboard_nm like p.dash_like)
    limit 1
),
grp as (    -- группы прав отчёта как есть в Proteus
    select distinct a.user_or_group_name as raw_nm, lower(trim(a.user_or_group_name)) as nm
    from prod_v_sse.proteus_dashboard_access a inner join d on d.dashboard_id = a.dashboard_id
    where a.access_type = 'group'
),
items as (
    select guid, account_name, lower(trim(account_name)) as nm, item_type
    from prod_v_chrono_idm_tadam.ad_items_records_public where is_deleted = false
),
rel as (select parent, item from prod_v_chrono_idm_tadam.ad_item_parent_relations_public),
-- прежний способ
old_m as (
    select g.raw_nm, lower(c.account_name) as login
    from grp g inner join items p on p.account_name = g.raw_nm and p.item_type in ('GroupUniversal', 'GroupMail', 'GroupSecurity')
    inner join rel r on r.parent = p.guid inner join items c on c.guid = r.item and c.item_type = 'Person'
),
-- новый способ
g0 as (select g.raw_nm, i.guid, 0 as lvl from grp g inner join items i on i.nm = g.nm and i.item_type like 'Group%'),
g1 as (select distinct g.raw_nm, c.guid from g0 g inner join rel r on r.parent = g.guid inner join items c on c.guid = r.item and c.item_type like 'Group%'),
g2 as (select distinct g.raw_nm, c.guid from g1 g inner join rel r on r.parent = g.guid inner join items c on c.guid = r.item and c.item_type like 'Group%'),
g3 as (select distinct g.raw_nm, c.guid from g2 g inner join rel r on r.parent = g.guid inner join items c on c.guid = r.item and c.item_type like 'Group%'),
g4 as (select distinct g.raw_nm, c.guid from g3 g inner join rel r on r.parent = g.guid inner join items c on c.guid = r.item and c.item_type like 'Group%'),
g5 as (select distinct g.raw_nm, c.guid from g4 g inner join rel r on r.parent = g.guid inner join items c on c.guid = r.item and c.item_type like 'Group%'),
g6 as (select distinct g.raw_nm, c.guid from g5 g inner join rel r on r.parent = g.guid inner join items c on c.guid = r.item and c.item_type like 'Group%'),
gall as (
    select raw_nm, guid from g0 union select raw_nm, guid from g1 union select raw_nm, guid from g2
    union select raw_nm, guid from g3 union select raw_nm, guid from g4 union select raw_nm, guid from g5
    union select raw_nm, guid from g6
),
new_m as (
    select distinct g.raw_nm, lower(trim(c.account_name)) as login
    from gall g inner join rel r on r.parent = g.guid inner join items c on c.guid = r.item and c.item_type = 'Person'
)
select g.raw_nm                                                                   as "группа (как в правах)",
       (select string_agg(distinct i.account_name || ' [' || i.item_type || ']', ', ') from items i where i.nm = g.nm) as "в AD (имя [тип])",
       (select count(*) - 1 from gall x where x.raw_nm = g.raw_nm)                as "подгрупп",
       (select count(distinct login) from old_m o where o.raw_nm = g.raw_nm)      as "людей было",
       (select count(distinct login) from new_m n where n.raw_nm = g.raw_nm)      as "людей станет",
       (select count(distinct n.login) from new_m n inner join usr_cross_data.pa_staff s on s.login = n.login
         where n.raw_nm = g.raw_nm)                                               as "из них в базе ЦА"
from grp g
order by 5 desc;
