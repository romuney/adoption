-- ============================================================================================================
-- ЕДИНЫЙ ЛИСТ — все витрины (GP-параграфы Helicopter) одним файлом, в порядке запуска.
-- Это ТЕ ЖЕ параграфы, что уже работают в двух нодах боевого отчёта (первый лист + нода 844437 второго).
-- Единый лист читает те же таблицы — если обе ноды у вас запускаются, в GP НИЧЕГО менять не нужно.
-- Файл — чтобы всё для листа было в одном месте (или собрать одну ноду с нуля: блоки по порядку, каждый — свой
-- параграф; затем выгрузка — файл 2).
-- Порядок важен: часть 2 читает pa_pair и pa_dash_meta из части 1.
-- ============================================================================================================

-- ############################################################################################################
-- ЧАСТЬ 1. Витрины первого листа: факт, мета отчётов, атрибуты зрителей, пары отчёт×логин, просмотры по периодам
-- ############################################################################################################
-- ============================================================================
-- Helicopter-нода 844437 · параграфы предагрегатов Proteus Adoption (GP)
-- Порядок: после параграфа «Финальная таблица из event_physical_report»
-- (usr_cross_data.proteus_views_1). Каждый блок ниже — отдельный параграф gp.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Параграф «PA · склейка логинов» → usr_cross_data.pa_login_map   (НОВЫЙ 2026-09-30, ПЕРВЫМ в ноде)
-- Человек сменил AD-логин (например, после свадьбы: a.pezikova → anas.e.petrova) — в MDM это одна запись
-- (mdm_employee_rk) с двумя логинами, а у нас выходило два человека. Словарь «старый логин → текущий»:
-- текущий — логин из самой свежей строки MDM записи, где он заполнен; старые — все прочие логины записи
-- из MDM за 13 мес. и из событий Proteus. Логин, который ведёт к двум разным текущим, не склеиваем.
-- Дальше факт, атрибуты зрителей и штат берут логин через этот словарь: визиты под старым логином
-- считаются визитами того же человека.
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_login_map;
create table usr_cross_data.pa_login_map as
with lr as (
    select lower(trim(m.ad_login)) as login, m.mdm_employee_rk as rk, max(m.business_dt) as dt
    from prod_v_emart.mdm_employee_structure_d m
    where nullif(trim(m.ad_login), '') is not null
      and m.business_dt >= current_date - interval '13 months'
    group by 1, 2
),
cur as (
    select rk, login as canon
    from (select rk, login, row_number() over (partition by rk order by dt desc, login) as rn from lr) x
    where rn = 1
),
al as (
    select login, rk from lr
    union
    select distinct lower(trim(v.login)), v.mdm_employee_rk
    from usr_cross_data.proteus_views_1 v
    where v.mdm_employee_rk is not null and nullif(trim(v.login), '') is not null
)
select a.login::text as login, min(c.canon)::text as canon
from al a
inner join cur c on c.rk = a.rk
group by a.login
having count(distinct c.canon) = 1 and min(c.canon) <> a.login
distributed by (login);

-- ---------------------------------------------------------------------------
-- Параграф «PA · факт отчёт×логин×день» → usr_cross_data.pa_evd_day
-- Вселенная куба: без самого борда (13040) и сервисного логина.
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_evd_day;
create table usr_cross_data.pa_evd_day as
select
    v.dashboard_id::int                  as dashboard_id,
    coalesce(mp.canon, v.login)::text    as login,   -- старый логин → текущий (pa_login_map)
    date_trunc('day', v.log_dttm)        as log_dttm,
    sum(v.action_count)::bigint          as views
from usr_cross_data.proteus_views_1 v
left join usr_cross_data.pa_login_map mp on mp.login = lower(trim(v.login))
where v.dashboard_id is not null
  and v.login is not null
  and v.dashboard_id <> 13040
  and v.login <> 'svc_mon_otpp'
group by 1, 2, 3
distributed by (dashboard_id);

-- ---------------------------------------------------------------------------
-- Параграф «PA · мета отчётов» → usr_cross_data.pa_dash_meta (1 строка на отчёт,
-- последнее известное состояние по log_dttm).
-- 2026-10-07: автор и владельцы — АКТУАЛЬНЫМИ логинами (pa_login_map, как зрители): у сменившего логин
-- старый аккаунт Proteus остаётся автором/владельцем его прежних отчётов — без склейки его отчёты «размазаны».
-- Логины владельцев — lower(trim()), без кавычек и повторов. Тот же канон берёт own_flg в «PA · пары».
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_dash_meta;
create table usr_cross_data.pa_dash_meta as
with t as (
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
),
m as (select * from t where rn = 1),
ow as (    -- владельцы → актуальные логины
    select u.dashboard_id, array_agg(distinct coalesce(mp.canon, u.o)) as owners
    from (
        select z.dashboard_id, btrim(lower(trim(z.x)), '"') as o
        from (select dashboard_id, unnest(owners_string) as x from m) z
    ) u
    left join usr_cross_data.pa_login_map mp on mp.login = u.o
    where u.o <> ''
    group by u.dashboard_id
)
select m.dashboard_id, m.dashboard_nm,
       coalesce(ma.canon, btrim(lower(trim(m.owner_login)), '"'))::text  as owner_login,
       coalesce(ow.owners, array[]::text[])                                as owners_string,
       m.collection_names, m.published, m.actual_flg, m.certified_by, m.created_dt
from m
left join ow on ow.dashboard_id = m.dashboard_id
left join usr_cross_data.pa_login_map ma on ma.login = btrim(lower(trim(m.owner_login)), '"')
distributed by (dashboard_id);

-- ---------------------------------------------------------------------------
-- Параграф «PA · атрибуты зрителей» → usr_cross_data.pa_emp_attrs
-- (1 строка на логин: последнее состояние по log_dttm + ФИО и стаж).
-- НОВОЕ 2026-09-22: fio (Фамилия Имя из proteus_users), exp_nm (группа стажа
-- из prod_v_emart.mdm_employee_structure_d, last_state_flg = 1) — закрывают хвост «ФИО/стаж — заглушки».
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
    -- ФИО: из MDM (по-русски, единообразно; 2026-09-30), нет в MDM — из профиля Proteus
    coalesce(nullif(trim(coalesce(m.last_nm, '') || ' ' || coalesce(m.first_nm, '')), ''),
             nullif(trim(coalesce(u.last_name, '') || ' ' || coalesce(u.first_name, '')), ''), '')::text as fio,
    coalesce(m.experience_group_nm, '')::text as exp_nm
from (
    select
        coalesce(mp.canon, v.login)::text                       as login,   -- старый логин → текущий
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
        row_number() over (partition by coalesce(mp.canon, v.login) order by v.log_dttm desc) as rn
    from usr_cross_data.proteus_views_1 v
    left join usr_cross_data.pa_login_map mp on mp.login = lower(trim(v.login))
    where v.login is not null and v.login <> 'svc_mon_otpp'
) t
left join (
    select username, max(first_name) as first_name, max(last_name) as last_name
    from prod_v_sse.proteus_users
    group by username
) u on u.username = t.login
left join (
    select mdm_employee_rk, max(experience_group_nm) as experience_group_nm, max(last_nm) as last_nm, max(first_nm) as first_nm
    from prod_v_emart.mdm_employee_structure_d
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

-- ---------------------------------------------------------------------------
-- Параграф «PA · просмотры по периодам» → usr_cross_data.pa_dash_bkt  (НОВЫЙ 2026-09-23)
-- Отчёт × грануляция × возраст бакета k (< n текущего окна): просмотры всех и без
-- владельцев отчёта. Нужен датасету pa_people (правая панель) для линии «Просмотры»
-- динамики: остальное он теперь считает по pa_pair и дневной факт не читает — так
-- правая панель стала такой же быстрой, как каталог. Возраст k — как в «PA · пары».
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_dash_bkt;
create table usr_cross_data.pa_dash_bkt as
with mx as (
    select max(log_dttm) as md from usr_cross_data.pa_evd_day
),
ev as (
    select
        e.dashboard_id, e.views,
        case when e.login = any(m.owners_string) then 1 else 0 end                         as own,
        (x.md::date - e.log_dttm::date)                                                    as kd,
        ((date_trunc('week', x.md)::date - date_trunc('week', e.log_dttm)::date) / 7)      as kw,
        ((extract(year from x.md) * 12 + extract(month from x.md))
          - (extract(year from e.log_dttm) * 12 + extract(month from e.log_dttm)))::int    as km,
        ((extract(year from x.md) * 4 + extract(quarter from x.md))
          - (extract(year from e.log_dttm) * 4 + extract(quarter from e.log_dttm)))::int   as kq
    from usr_cross_data.pa_evd_day e
    cross join mx x
    left join usr_cross_data.pa_dash_meta m on m.dashboard_id = e.dashboard_id
)
select dashboard_id, 'd'::text as grain, kd::bigint as k, sum(views)::bigint as views,
       sum(case when own = 0 then views else 0 end)::bigint as views_nown
from ev where kd < 30 group by dashboard_id, kd
union all
select dashboard_id, 'w', kw::bigint, sum(views)::bigint, sum(case when own = 0 then views else 0 end)::bigint
from ev where kw < 20 group by dashboard_id, kw
union all
select dashboard_id, 'm', km::bigint, sum(views)::bigint, sum(case when own = 0 then views else 0 end)::bigint
from ev where km < 12 group by dashboard_id, km
union all
select dashboard_id, 'q', kq::bigint, sum(views)::bigint, sum(case when own = 0 then views else 0 end)::bigint
from ev where kq < 8 group by dashboard_id, kq
distributed by (dashboard_id);


-- ############################################################################################################
-- ЧАСТЬ 2. Витрины целевой аудитории (нода 844437): штат, права, состав групп, размер групп, ЦА отчёта, доступ пар
-- ############################################################################################################
-- ============================================================================
-- Helicopter-нода 844437 · параграфы вкладки «Аудитория» (GP)
-- Порядок: после параграфов «PA · …» поставки 2026-09-22 (нужна pa_dash_meta).
-- Каждый блок ниже — отдельный параграф gp. Выгрузка в ClickHouse — файл 2.
--
-- Целевая аудитория (ЦА) отчёта по правам = поимённые права ∪ члены AD-групп прав,
-- только действующий штат. Состав групп — с вложенными группами (до 6 уровней), имена групп
-- сравниваются без учёта регистра (2026-09-26: раньше считалось только прямое членство и точный
-- регистр — у групп из подгрупп ЦА выходила в разы меньше).
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
    -- логин записи — текущий (pa_login_map): старый и новый логины одного человека — одна строка
    select coalesce(mp.canon, lower(trim(m.ad_login))) as login, m.mdm_employee_rk, max(m.business_dt) as dt
    from prod_v_emart.mdm_employee_structure_d m
    left join usr_cross_data.pa_login_map mp on mp.login = lower(trim(m.ad_login))
    where nullif(trim(m.ad_login), '') is not null
      and m.business_dt >= current_date - interval '13 months'
    group by 1, 2
),
mdm as (
    select lg.login as lg, l.*,
        row_number() over (partition by lg.login
                           order by coalesce(l.company_fire_flg::int, 0), lg.dt desc, lg.mdm_employee_rk desc) as rn
    from lg
    inner join prod_v_emart.mdm_employee_structure_d l
        on l.mdm_employee_rk = lg.mdm_employee_rk and l.last_state_flg = 1
),
vw as (
    select coalesce(mp.canon, lower(trim(v.login))) as lg, v.*,
        row_number() over (partition by coalesce(mp.canon, lower(trim(v.login))) order by v.log_dttm desc) as rn
    from usr_cross_data.proteus_views_1 v
    left join usr_cross_data.pa_login_map mp on mp.login = lower(trim(v.login))
    where nullif(trim(v.login), '') is not null and v.login <> 'svc_mon_otpp'
),
base as (
    select m.lg as login, 'mdm'::text as src,
        m.lvl3_mapped_management_unit_nm as l3, m.lvl4_mapped_management_unit_nm as l4, m.lvl5_mapped_management_unit_nm as l5,
        m.lvl6_mapped_management_unit_nm as l6, m.lvl7_mapped_management_unit_nm as l7,
        m.emp_specialization_desc as spec, m.emp_stream_desc as stream, m.management_head_flg::int as head,
        m.experience_group_nm as exp_nm, m.emp_specialization_oper_code as hq, m.emp_specialization_it_code as it,
        m.last_nm as ln, m.first_nm as fn
    from mdm m
    where m.rn = 1 and coalesce(m.company_fire_flg::int, 0) = 0
    union all
    select v.lg, 'viewer'::text,
        v.lvl3_management_unit_nm, v.lvl4_management_unit_nm, v.lvl5_management_unit_nm,
        v.lvl6_management_unit_nm, v.lvl7_management_unit_nm,
        v.emp_specialization_desc, v.emp_stream_desc, v.management_head_flg::int,
        null::text, v.emp_specialization_oper_code, v.emp_specialization_it_code,
        null::text, null::text
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
    -- ФИО: из MDM (по-русски), нет в MDM (подрядчики) — из профиля Proteus
    coalesce(nullif(trim(coalesce(b.ln, '') || ' ' || coalesce(b.fn, '')), ''),
             nullif(trim(coalesce(u.last_name, '') || ' ' || coalesce(u.first_name, '')), ''), '')::text as fio,
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
-- Принципал — lower(trim()): и логин, и имя группы (с ним же сверяется состав групп).
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_dash_acl;
create table usr_cross_data.pa_dash_acl as
select distinct
    a.dashboard_id::int                                                     as dashboard_id,
    lower(trim(a.user_or_group_name))::text                                 as principal,
    case when a.access_type = 'user' then 'user' else 'group' end::text     as kind
from prod_v_sse.proteus_dashboard_access a
where a.access_type in ('user', 'group')
  and a.user_or_group_name is not null and a.user_or_group_name <> ''
  and a.dashboard_id in (select dashboard_id from usr_cross_data.pa_dash_meta)
distributed by (dashboard_id);

-- ---------------------------------------------------------------------------
-- Параграф «PA · состав групп прав» → usr_cross_data.pa_adg_member   (2026-09-26: вложенные группы)
-- AD-группа × логин — только группы, которые встречаются в правах отчётов. Человек входит в группу,
-- если он в ней напрямую ИЛИ в любой её подгруппе (подгруппы подгрупп — до 6 уровней вниз; циклы
-- не страшны: уровень ограничен, повторы убирает distinct). ad_group — lower(trim()) имени, как в pa_dash_acl.
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_adg_member;
create table usr_cross_data.pa_adg_member as
with used as (
    select distinct principal as ad_group from usr_cross_data.pa_dash_acl where kind = 'group'
),
items as (
    select guid, lower(trim(account_name))::text as nm, (item_type = 'Person') as is_person
    from prod_v_chrono_idm_tadam.ad_items_records_public
    where is_deleted = false
      and (item_type = 'Person' or item_type like 'Group%')
),
rel as (    -- ребро «родитель-группа → участник» (участник — человек или подгруппа)
    select r.parent, r.item, c.is_person
    from prod_v_chrono_idm_tadam.ad_item_parent_relations_public r
    inner join items p on p.guid = r.parent and not p.is_person
    inner join items c on c.guid = r.item
),
g0 as (select u.ad_group, i.guid from used u inner join items i on i.nm = u.ad_group and not i.is_person),
g1 as (select distinct g.ad_group, r.item as guid from g0 g inner join rel r on r.parent = g.guid and not r.is_person),
g2 as (select distinct g.ad_group, r.item as guid from g1 g inner join rel r on r.parent = g.guid and not r.is_person),
g3 as (select distinct g.ad_group, r.item as guid from g2 g inner join rel r on r.parent = g.guid and not r.is_person),
g4 as (select distinct g.ad_group, r.item as guid from g3 g inner join rel r on r.parent = g.guid and not r.is_person),
g5 as (select distinct g.ad_group, r.item as guid from g4 g inner join rel r on r.parent = g.guid and not r.is_person),
g6 as (select distinct g.ad_group, r.item as guid from g5 g inner join rel r on r.parent = g.guid and not r.is_person),
gall as (
    select ad_group, guid from g0 union select ad_group, guid from g1 union select ad_group, guid from g2
    union select ad_group, guid from g3 union select ad_group, guid from g4 union select ad_group, guid from g5
    union select ad_group, guid from g6
)
select distinct g.ad_group::text as ad_group, c.nm::text as login
from gall g
inner join rel r on r.parent = g.guid and r.is_person
inner join items c on c.guid = r.item
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
