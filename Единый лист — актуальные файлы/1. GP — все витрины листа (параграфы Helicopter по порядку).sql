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


-- ############################################################################################################
-- ЧАСТЬ 3. Витрины ускорения (2026-10-23): то, что датасеты листа считали на КАЖДЫЙ клик, — раз в сутки здесь.
-- Параграфы — в КОНЕЦ той же ноды, после части 2, в порядке файла (читают pa_pair, pa_emp_attrs, pa_staff,
-- pa_dash_meta, pa_dash_acl, pa_adg_member, pa_evd_day). Выгрузка в ClickHouse — часть 3 файла 2.
-- Числа на борде не меняются: датасеты берут отсюда то же, что раньше считали сами (сверено на стенде ответ в ответ).
-- ############################################################################################################

-- ---------------------------------------------------------------------------
-- Параграф «PA · дата свежести» → usr_cross_data.pa_md   (НОВЫЙ 2026-10-23)
-- Одна строка: md — дата свежести (как max(md) пар), ds — начало истории событий (первый визит).
-- Раньше каждый запрос трёх датасетов сканировал ради этих двух чисел всю pa_pair.
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_md;
create table usr_cross_data.pa_md as
select max(coalesce(md, dmax)) as md, min(dmin) as ds
from usr_cross_data.pa_pair
distributed randomly;
analyze usr_cross_data.pa_md;

-- ---------------------------------------------------------------------------
-- Параграф «PA · словарь кодов» → usr_cross_data.pa_dict   (НОВЫЙ 2026-10-23)
-- Коды значений специализации / стрима / стажа / HQ / IT (штат ∪ атрибуты зрителей): код = номер значения
-- по порядку байтов (как сортирует ClickHouse), с 1. В ответе панели вместо названий — коды (3 цифры вместо
-- «Специализации» в \uXXXX), раньше словарь собирался на каждый клик.
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_dict;
create table usr_cross_data.pa_dict as
with v as (
    select 'spec'::text as g, coalesce(emp_specialization_desc, '')::text as v from usr_cross_data.pa_staff
    union select 'stream', coalesce(emp_stream_desc, '') from usr_cross_data.pa_staff
    union select 'exp', coalesce(exp_nm, '') from usr_cross_data.pa_staff
    union select 'hq', coalesce(hq_code, '') from usr_cross_data.pa_staff
    union select 'it', coalesce(it_code, '') from usr_cross_data.pa_staff
    union select 'spec', coalesce(emp_specialization_desc, '') from usr_cross_data.pa_emp_attrs
    union select 'stream', coalesce(emp_stream_desc, '') from usr_cross_data.pa_emp_attrs
    union select 'exp', coalesce(exp_nm, '') from usr_cross_data.pa_emp_attrs
    union select z.g, '' from (select 'spec'::text as g union all select 'stream' union all select 'exp'
                               union all select 'hq' union all select 'it') z
)
select g, v, (row_number() over (partition by g order by convert_to(v, 'UTF8')))::int as code
from v
distributed by (g);
analyze usr_cross_data.pa_dict;

-- ---------------------------------------------------------------------------
-- Параграф «PA · доступ к любому отчёту» → usr_cross_data.pa_acc_any   (НОВЫЙ 2026-10-23; в ClickHouse НЕ выгружается)
-- Логин × флаги «есть право хотя бы на один отчёт» (поимённо или через AD-группу) — для области «весь Proteus»
-- при каждом сочетании переключателей шапки: бит 1 — любой отчёт, 2 — опубликованный, 4 — актуальный,
-- 8 — опубликованный и актуальный. Служебная: её читают два параграфа ниже.
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_acc_any;
create table usr_cross_data.pa_acc_any as
with pf as (    -- принципал × флаги его отчётов (до разворота групп: группа × отчёты не размножается)
    select a.principal, a.kind,
        bit_or(1 | (case when m.published = 1 then 2 else 0 end) | (case when m.actual_flg = 1 then 4 else 0 end)
                 | (case when m.published = 1 and m.actual_flg = 1 then 8 else 0 end)) as b
    from usr_cross_data.pa_dash_acl a
    inner join usr_cross_data.pa_dash_meta m on m.dashboard_id = a.dashboard_id
    group by a.principal, a.kind
),
lb as (
    select principal as lg, b from pf where kind = 'user'
    union all
    select g.login, pf.b from pf inner join usr_cross_data.pa_adg_member g on g.ad_group = pf.principal where pf.kind = 'group'
)
select lg::text as lg, bit_or(b)::int as a4
from lb
group by lg
distributed by (lg);
analyze usr_cross_data.pa_acc_any;

-- ---------------------------------------------------------------------------
-- Параграф «PA · зрители — готовые атрибуты» → usr_cross_data.pa_viewer   (НОВЫЙ 2026-10-23)
-- Строка на логин зрителя (все логины pa_pair): его атрибуты так, как их показывает панель, — путь оргструктуры
-- «УС-3 › …» (уровень из одних знаков «-», «—», «…» и пробелов = пусто, путь на нём обрывается), специализация,
-- стрим, руководитель, сотрудник ли (pa_staff), флаги доступа (a4, как pa_acc_any) и готовые куски поимённой строки
-- «Кто смотрит» (логин|ФИО|коды спец., стрима, стажа и коды HQ|IT). ФИО — в компактной записи кириллицы ответа.
-- Раньше панель на каждый клик соединяла зрителей со штатом и атрибутами и собирала эти строки заново.
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_viewer;
create table usr_cross_data.pa_viewer as
with pu as (    -- «пустые» знаки уровня УС: ровно те, что ClickHouse 24.8 считает пустыми в '^(?:\s|\p{P})*$'
    -- (пробел, \t \n \f \r и знаки препинания Юникода; список снят с ClickHouse, коды символов)
    -- «^[…]*$»: знаки «-», «[», «\», «]», «^» внутри класса — через обратную косую (chr(92))
    select '^[' || string_agg(case when c in (45, 91, 92, 93, 94) then chr(92) || chr(c) else chr(c) end, '') || ']*$' as re from unnest(array[
        9,10,12,13,32,33,34,35,37,38,39,40,41,42,44,45,46,47,58,59,63,64,91,92,
        93,95,123,125,161,167,171,182,183,187,191,894,903,1370,1371,1372,1373,1374,1375,1417,1418,1470,1472,1475,
        1478,1523,1524,1545,1546,1548,1549,1563,1565,1566,1567,1642,1643,1644,1645,1748,1792,1793,1794,1795,1796,1797,1798,1799,
        1800,1801,1802,1803,1804,1805,2039,2040,2041,2096,2097,2098,2099,2100,2101,2102,2103,2104,2105,2106,2107,2108,2109,2110,
        2142,2404,2405,2416,2557,2678,2800,3191,3204,3572,3663,3674,3675,3844,3845,3846,3847,3848,3849,3850,3851,3852,3853,3854,
        3855,3856,3857,3858,3860,3898,3899,3900,3901,3973,4048,4049,4050,4051,4052,4057,4058,4170,4171,4172,4173,4174,4175,4347,
        4960,4961,4962,4963,4964,4965,4966,4967,4968,5120,5742,5787,5788,5867,5868,5869,5941,5942,6100,6101,6102,6104,6105,6106,
        6144,6145,6146,6147,6148,6149,6150,6151,6152,6153,6154,6468,6469,6686,6687,6816,6817,6818,6819,6820,6821,6822,6824,6825,
        6826,6827,6828,6829,7002,7003,7004,7005,7006,7007,7008,7037,7038,7164,7165,7166,7167,7227,7228,7229,7230,7231,7294,7295,
        7360,7361,7362,7363,7364,7365,7366,7367,7379,8208,8209,8210,8211,8212,8213,8214,8215,8216,8217,8218,8219,8220,8221,8222,
        8223,8224,8225,8226,8227,8228,8229,8230,8231,8240,8241,8242,8243,8244,8245,8246,8247,8248,8249,8250,8251,8252,8253,8254,
        8255,8256,8257,8258,8259,8261,8262,8263,8264,8265,8266,8267,8268,8269,8270,8271,8272,8273,8275,8276,8277,8278,8279,8280,
        8281,8282,8283,8284,8285,8286,8317,8318,8333,8334,8968,8969,8970,8971,9001,9002,10088,10089,10090,10091,10092,10093,10094,10095,
        10096,10097,10098,10099,10100,10101,10181,10182,10214,10215,10216,10217,10218,10219,10220,10221,10222,10223,10627,10628,10629,10630,10631,10632,
        10633,10634,10635,10636,10637,10638,10639,10640,10641,10642,10643,10644,10645,10646,10647,10648,10712,10713,10714,10715,10748,10749,11513,11514,
        11515,11516,11518,11519,11632,11776,11777,11778,11779,11780,11781,11782,11783,11784,11785,11786,11787,11788,11789,11790,11791,11792,11793,11794,
        11795,11796,11797,11798,11799,11800,11801,11802,11803,11804,11805,11806,11807,11808,11809,11810,11811,11812,11813,11814,11815,11816,11817,11818,
        11819,11820,11821,11822,11824,11825,11826,11827,11828,11829,11830,11831,11832,11833,11834,11835,11836,11837,11838,11839,11840,11841,11842,11843,
        11844,11845,11846,11847,11848,11849,11850,11851,11852,11853,11854,11855,11858,11859,11860,11861,11862,11863,11864,11865,11866,11867,11868,11869,
        12289,12290,12291,12296,12297,12298,12299,12300,12301,12302,12303,12304,12305,12308,12309,12310,12311,12312,12313,12314,12315,12316,12317,12318,
        12319,12336,12349,12448,12539,42238,42239,42509,42510,42511,42611,42622,42738,42739,42740,42741,42742,42743,43124,43125,43126,43127,43214,43215,
        43256,43257,43258,43260,43310,43311,43359,43457,43458,43459,43460,43461,43462,43463,43464,43465,43466,43467,43468,43469,43486,43487,43612,43613,
        43614,43615,43742,43743,43760,43761,44011,64830,64831,65040,65041,65042,65043,65044,65045,65046,65047,65048,65049,65072,65073,65074,65075,65076,
        65077,65078,65079,65080,65081,65082,65083,65084,65085,65086,65087,65088,65089,65090,65091,65092,65093,65094,65095,65096,65097,65098,65099,65100,
        65101,65102,65103,65104,65105,65106,65108,65109,65110,65111,65112,65113,65114,65115,65116,65117,65118,65119,65120,65121,65123,65128,65130,65131,
        65281,65282,65283,65285,65286,65287,65288,65289,65290,65292,65293,65294,65295,65306,65307,65311,65312,65339,65340,65341,65343,65371,65373,65375,
        65376,65377,65378,65379,65380,65381,65792,65793,65794,66463,66512,66927,67671,67871,67903,68176,68177,68178,68179,68180,68181,68182,68183,68184,
        68223,68336,68337,68338,68339,68340,68341,68342,68409,68410,68411,68412,68413,68414,68415,68505,68506,68507,68508,69293,69461,69462,69463,69464,
        69465,69510,69511,69512,69513,69703,69704,69705,69706,69707,69708,69709,69819,69820,69822,69823,69824,69825,69952,69953,69954,69955,70004,70005,
        70085,70086,70087,70088,70093,70107,70109,70110,70111,70200,70201,70202,70203,70204,70205,70313,70731,70732,70733,70734,70735,70746,70747,70749,
        70854,71105,71106,71107,71108,71109,71110,71111,71112,71113,71114,71115,71116,71117,71118,71119,71120,71121,71122,71123,71124,71125,71126,71127,
        71233,71234,71235,71264,71265,71266,71267,71268,71269,71270,71271,71272,71273,71274,71275,71276,71353,71484,71485,71486,71739,72004,72005,72006,
        72162,72255,72256,72257,72258,72259,72260,72261,72262,72346,72347,72348,72350,72351,72352,72353,72354,72448,72449,72450,72451,72452,72453,72454,
        72455,72456,72457,72769,72770,72771,72772,72773,72816,72817,73463,73464,73539,73540,73541,73542,73543,73544,73545,73546,73547,73548,73549,73550,
        73551,73727,74864,74865,74866,74867,74868,77809,77810,92782,92783,92917,92983,92984,92985,92986,92987,92996,93847,93848,93849,93850,94178,113823,
        121479,121480,121481,121482,121483,125278,125279]) c
),
l as (select distinct login from usr_cross_data.pa_pair where login is not null),
x as (
    select l.login::text as login, translate(l.login, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')::text as lg,
        case when s.login is null then 0 else 1 end as stf,
        coalesce(s.hq_code, '')::text as hq, coalesce(s.it_code, '')::text as it,
        coalesce(a.lvl3_management_unit_nm, '')::text as a3, coalesce(a.lvl4_management_unit_nm, '')::text as a4_,
        coalesce(a.lvl5_management_unit_nm, '')::text as a5, coalesce(a.lvl6_management_unit_nm, '')::text as a6,
        coalesce(a.lvl7_management_unit_nm, '')::text as a7,
        coalesce(a.emp_specialization_desc, '')::text as spec, coalesce(a.emp_stream_desc, '')::text as stream,
        case when coalesce(a.management_head_flg, 0) = 1 then 1 else 0 end as is_head,
        coalesce(a.fio, '')::text as fio, coalesce(a.exp_nm, '')::text as exp_nm
    from l
    left join usr_cross_data.pa_staff s on s.login = translate(l.login, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')
    left join usr_cross_data.pa_emp_attrs a on a.login = l.login
),
n as (
    select x.*, case when a3 ~ pu.re then ''::text else a3 end as n3, case when a4_ ~ pu.re then ''::text else a4_ end as n4, case when a5 ~ pu.re then ''::text else a5 end as n5,
        case when a6 ~ pu.re then ''::text else a6 end as n6, case when a7 ~ pu.re then ''::text else a7 end as n7
    from x cross join pu
),
o as (select n.*, case when n3 = '' then 0 when n4 = '' then 1 when n5 = '' then 2 when n6 = '' then 3 when n7 = '' then 4 else 5 end as ol from n)
select o.login, o.lg, o.stf, coalesce(c.a4, 0) as a4,
    array[o.n3, o.n4, o.n5, o.n6, o.n7] as lv, o.ol,
    array_to_string((array[o.n3, o.n4, o.n5, o.n6, o.n7])[1:o.ol], ' › ') as opath,
    o.spec, o.stream, o.is_head,
    translate(o.login, E'|\t\n\r', '    ') || '|' || translate(regexp_replace(replace(replace(replace(replace(translate(o.fio, E'\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), '([А-Яа-яЁё][А-Яа-яЁё ]*)', E'`\\1`', 'g'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%') || '|' || ds.code || '|' || dt.code || '|' || de.code as pl_a,
    dq.code || '|' || di.code as pl_b
from o
left join usr_cross_data.pa_acc_any c on c.lg = o.lg
inner join usr_cross_data.pa_dict ds on ds.g = 'spec' and ds.v = o.spec
inner join usr_cross_data.pa_dict dt on dt.g = 'stream' and dt.v = o.stream
inner join usr_cross_data.pa_dict de on de.g = 'exp' and de.v = o.exp_nm
inner join usr_cross_data.pa_dict dq on dq.g = 'hq' and dq.v = o.hq
inner join usr_cross_data.pa_dict di on di.g = 'it' and di.v = o.it
distributed by (login);
analyze usr_cross_data.pa_viewer;

-- ---------------------------------------------------------------------------
-- Параграф «PA · штат — готовые атрибуты» → usr_cross_data.pa_staffx   (НОВЫЙ 2026-10-23)
-- Строка на сотрудника pa_staff: атрибуты для условий ЦА и разрезов «Аудитории» (путь оргструктуры — по тому же
-- правилу, что у зрителей), флаги доступа a4 и готовые куски строк «не заходили из ЦА» (поимённо и свёрткой).
-- Раньше каталог, панель и шапка нормализовали оргструктуру всего штата регуляркой на каждый запрос.
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_staffx;
create table usr_cross_data.pa_staffx as
with pu as (    -- «пустые» знаки уровня УС: ровно те, что ClickHouse 24.8 считает пустыми в '^(?:\s|\p{P})*$'
    -- (пробел, \t \n \f \r и знаки препинания Юникода; список снят с ClickHouse, коды символов)
    -- «^[…]*$»: знаки «-», «[», «\», «]», «^» внутри класса — через обратную косую (chr(92))
    select '^[' || string_agg(case when c in (45, 91, 92, 93, 94) then chr(92) || chr(c) else chr(c) end, '') || ']*$' as re from unnest(array[
        9,10,12,13,32,33,34,35,37,38,39,40,41,42,44,45,46,47,58,59,63,64,91,92,
        93,95,123,125,161,167,171,182,183,187,191,894,903,1370,1371,1372,1373,1374,1375,1417,1418,1470,1472,1475,
        1478,1523,1524,1545,1546,1548,1549,1563,1565,1566,1567,1642,1643,1644,1645,1748,1792,1793,1794,1795,1796,1797,1798,1799,
        1800,1801,1802,1803,1804,1805,2039,2040,2041,2096,2097,2098,2099,2100,2101,2102,2103,2104,2105,2106,2107,2108,2109,2110,
        2142,2404,2405,2416,2557,2678,2800,3191,3204,3572,3663,3674,3675,3844,3845,3846,3847,3848,3849,3850,3851,3852,3853,3854,
        3855,3856,3857,3858,3860,3898,3899,3900,3901,3973,4048,4049,4050,4051,4052,4057,4058,4170,4171,4172,4173,4174,4175,4347,
        4960,4961,4962,4963,4964,4965,4966,4967,4968,5120,5742,5787,5788,5867,5868,5869,5941,5942,6100,6101,6102,6104,6105,6106,
        6144,6145,6146,6147,6148,6149,6150,6151,6152,6153,6154,6468,6469,6686,6687,6816,6817,6818,6819,6820,6821,6822,6824,6825,
        6826,6827,6828,6829,7002,7003,7004,7005,7006,7007,7008,7037,7038,7164,7165,7166,7167,7227,7228,7229,7230,7231,7294,7295,
        7360,7361,7362,7363,7364,7365,7366,7367,7379,8208,8209,8210,8211,8212,8213,8214,8215,8216,8217,8218,8219,8220,8221,8222,
        8223,8224,8225,8226,8227,8228,8229,8230,8231,8240,8241,8242,8243,8244,8245,8246,8247,8248,8249,8250,8251,8252,8253,8254,
        8255,8256,8257,8258,8259,8261,8262,8263,8264,8265,8266,8267,8268,8269,8270,8271,8272,8273,8275,8276,8277,8278,8279,8280,
        8281,8282,8283,8284,8285,8286,8317,8318,8333,8334,8968,8969,8970,8971,9001,9002,10088,10089,10090,10091,10092,10093,10094,10095,
        10096,10097,10098,10099,10100,10101,10181,10182,10214,10215,10216,10217,10218,10219,10220,10221,10222,10223,10627,10628,10629,10630,10631,10632,
        10633,10634,10635,10636,10637,10638,10639,10640,10641,10642,10643,10644,10645,10646,10647,10648,10712,10713,10714,10715,10748,10749,11513,11514,
        11515,11516,11518,11519,11632,11776,11777,11778,11779,11780,11781,11782,11783,11784,11785,11786,11787,11788,11789,11790,11791,11792,11793,11794,
        11795,11796,11797,11798,11799,11800,11801,11802,11803,11804,11805,11806,11807,11808,11809,11810,11811,11812,11813,11814,11815,11816,11817,11818,
        11819,11820,11821,11822,11824,11825,11826,11827,11828,11829,11830,11831,11832,11833,11834,11835,11836,11837,11838,11839,11840,11841,11842,11843,
        11844,11845,11846,11847,11848,11849,11850,11851,11852,11853,11854,11855,11858,11859,11860,11861,11862,11863,11864,11865,11866,11867,11868,11869,
        12289,12290,12291,12296,12297,12298,12299,12300,12301,12302,12303,12304,12305,12308,12309,12310,12311,12312,12313,12314,12315,12316,12317,12318,
        12319,12336,12349,12448,12539,42238,42239,42509,42510,42511,42611,42622,42738,42739,42740,42741,42742,42743,43124,43125,43126,43127,43214,43215,
        43256,43257,43258,43260,43310,43311,43359,43457,43458,43459,43460,43461,43462,43463,43464,43465,43466,43467,43468,43469,43486,43487,43612,43613,
        43614,43615,43742,43743,43760,43761,44011,64830,64831,65040,65041,65042,65043,65044,65045,65046,65047,65048,65049,65072,65073,65074,65075,65076,
        65077,65078,65079,65080,65081,65082,65083,65084,65085,65086,65087,65088,65089,65090,65091,65092,65093,65094,65095,65096,65097,65098,65099,65100,
        65101,65102,65103,65104,65105,65106,65108,65109,65110,65111,65112,65113,65114,65115,65116,65117,65118,65119,65120,65121,65123,65128,65130,65131,
        65281,65282,65283,65285,65286,65287,65288,65289,65290,65292,65293,65294,65295,65306,65307,65311,65312,65339,65340,65341,65343,65371,65373,65375,
        65376,65377,65378,65379,65380,65381,65792,65793,65794,66463,66512,66927,67671,67871,67903,68176,68177,68178,68179,68180,68181,68182,68183,68184,
        68223,68336,68337,68338,68339,68340,68341,68342,68409,68410,68411,68412,68413,68414,68415,68505,68506,68507,68508,69293,69461,69462,69463,69464,
        69465,69510,69511,69512,69513,69703,69704,69705,69706,69707,69708,69709,69819,69820,69822,69823,69824,69825,69952,69953,69954,69955,70004,70005,
        70085,70086,70087,70088,70093,70107,70109,70110,70111,70200,70201,70202,70203,70204,70205,70313,70731,70732,70733,70734,70735,70746,70747,70749,
        70854,71105,71106,71107,71108,71109,71110,71111,71112,71113,71114,71115,71116,71117,71118,71119,71120,71121,71122,71123,71124,71125,71126,71127,
        71233,71234,71235,71264,71265,71266,71267,71268,71269,71270,71271,71272,71273,71274,71275,71276,71353,71484,71485,71486,71739,72004,72005,72006,
        72162,72255,72256,72257,72258,72259,72260,72261,72262,72346,72347,72348,72350,72351,72352,72353,72354,72448,72449,72450,72451,72452,72453,72454,
        72455,72456,72457,72769,72770,72771,72772,72773,72816,72817,73463,73464,73539,73540,73541,73542,73543,73544,73545,73546,73547,73548,73549,73550,
        73551,73727,74864,74865,74866,74867,74868,77809,77810,92782,92783,92917,92983,92984,92985,92986,92987,92996,93847,93848,93849,93850,94178,113823,
        121479,121480,121481,121482,121483,125278,125279]) c
),
x as (
    select translate(s.login, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')::text as login,
        coalesce(s.lvl3_management_unit_nm, '')::text as a3, coalesce(s.lvl4_management_unit_nm, '')::text as a4_,
        coalesce(s.lvl5_management_unit_nm, '')::text as a5, coalesce(s.lvl6_management_unit_nm, '')::text as a6,
        coalesce(s.lvl7_management_unit_nm, '')::text as a7,
        coalesce(s.emp_specialization_desc, '')::text as sp, coalesce(s.emp_stream_desc, '')::text as st,
        coalesce(s.hq_code, '')::text as hqc, coalesce(s.it_code, '')::text as itc,
        case when coalesce(s.management_head_flg, 0) = 1 then 1 else 0 end as hdf,
        coalesce(s.fio, '')::text as fio, coalesce(s.exp_nm, '')::text as sexp
    from usr_cross_data.pa_staff s
),
n as (
    select x.*, case when a3 ~ pu.re then ''::text else a3 end as n3, case when a4_ ~ pu.re then ''::text else a4_ end as n4, case when a5 ~ pu.re then ''::text else a5 end as n5,
        case when a6 ~ pu.re then ''::text else a6 end as n6, case when a7 ~ pu.re then ''::text else a7 end as n7
    from x cross join pu
),
o as (select n.*, case when n3 = '' then 0 when n4 = '' then 1 when n5 = '' then 2 when n6 = '' then 3 when n7 = '' then 4 else 5 end as ol from n)
select o.login, coalesce(c.a4, 0) as a4,
    array[o.n3, o.n4, o.n5, o.n6, o.n7] as slv, o.ol as sol,
    array_to_string((array[o.n3, o.n4, o.n5, o.n6, o.n7])[1:o.ol], ' › ') as op,
    o.sp, o.st, o.hqc, o.itc, o.hdf,
    translate(o.login, E'|\t\n\r', '    ') || '|' || translate(regexp_replace(replace(replace(replace(replace(translate(o.fio, E'\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), '([А-Яа-яЁё][А-Яа-яЁё ]*)', E'`\\1`', 'g'), 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%') || '|' || ds.code || '|' || dt.code || '|' || o.hdf || '|' || dq.code || '|' || di.code as n_a,
    de.code as c_exp,
    ds.code || '|' || dt.code || '|' || o.hdf || '|' || dq.code || '|' || di.code as hk
from o
left join usr_cross_data.pa_acc_any c on c.lg = o.login
inner join usr_cross_data.pa_dict ds on ds.g = 'spec' and ds.v = o.sp
inner join usr_cross_data.pa_dict dt on dt.g = 'stream' and dt.v = o.st
inner join usr_cross_data.pa_dict de on de.g = 'exp' and de.v = o.sexp
inner join usr_cross_data.pa_dict dq on dq.g = 'hq' and dq.v = o.hqc
inner join usr_cross_data.pa_dict di on di.g = 'it' and di.v = o.itc
distributed by (login);
analyze usr_cross_data.pa_staffx;

-- ---------------------------------------------------------------------------
-- Параграф «PA · календарь отчёта по дням» → usr_cross_data.pa_dash_day   (НОВЫЙ 2026-10-23)
-- Отчёт × день: зрителей и просмотров — всех и без владельцев отчёта (пары own_flg = 1). «Календарь» панели
-- по одному отчёту и «Календарь» мгновенной панели каталога (20 недель / 12 месяцев / 8 кварталов) берут дни
-- отсюда, а не из подневного факта.
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_dash_day;
create table usr_cross_data.pa_dash_day as
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
analyze usr_cross_data.pa_dash_day;

-- ---------------------------------------------------------------------------
-- Параграф «PA · календарь всего Proteus по дням» → usr_cross_data.pa_all_day   (НОВЫЙ 2026-10-23)
-- День × переключатели шапки (pub = 1 — только опубликованные, act = 1 — только актуальные): уникальных зрителей
-- и просмотров — всех и без владельцев. «Календарь» панели без выбора в каталоге на 20 неделях / 12 месяцах /
-- 8 кварталах (весь период по дням) — отсюда: раньше это было чтение года подневного факта на каждый клик (1,5 с).
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_all_day;
create table usr_cross_data.pa_all_day as
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
analyze usr_cross_data.pa_all_day;

-- ---------------------------------------------------------------------------
-- Параграф «PA · каталог — строки отчётов» → usr_cross_data.pa_cat_rep   (НОВЫЙ 2026-10-23, после «PA · дата свежести»)
-- Отчёт × (все зрители | без владельцев) × период: строки вкладки «Отчёты» каталога, когда людских условий нет
-- (ни фильтра «Кто смотрит», ни ЦА по условиям, ни своего периода) — так открывается борд и так он пересчитывается
-- на период и переключатели. Колонки: n_e — зрителей-пар, l_e — дней с последнего визита, h4_e…h1_e — ритм
-- (Daily / Weekly / Monthly / Rare), u_e_g — пользователей, v_e_g — просмотров, r_e_g — постоянных, a_e_g — из них в ЦА
-- по правам (pa_pair_acc); e = 1 — без владельцев отчёта, g — d / w / m / q. Правила — как в SQL каталога.
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_cat_rep;
create table usr_cross_data.pa_cat_rep as
with p as (
    select p.dashboard_id, coalesce(p.own_flg, 0) as own, p.dmax,
        coalesce(p.msk_d, 0) as m_d, coalesce(p.v_d, 0) as v_d,
        coalesce(p.msk_w, 0) as m_w, coalesce(p.v_w, 0) as v_w,
        coalesce(p.msk_m, 0) as m_m, coalesce(p.v_m, 0) as v_m,
        coalesce(p.msk_q, 0) as m_q, coalesce(p.v_q, 0) as v_q,
        case when length(replace((coalesce(p.msk_d, 0) & 1073741823)::bit(64)::text, '0', '')) >= 12 then 4 when length(replace((coalesce(p.msk_w, 0) & 255)::bit(64)::text, '0', '')) >= 6 then 3
             when length(replace((coalesce(p.msk_m, 0) & 7)::bit(64)::text, '0', '')) >= 2 then 2 when (coalesce(p.msk_m, 0) & 7) <> 0 then 1 else 0 end as rc,
        case when a.login is null then 0 else 1 end as acc
    from usr_cross_data.pa_pair p
    left join usr_cross_data.pa_pair_acc a on a.dashboard_id = p.dashboard_id and a.login = translate(p.login, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')
    where p.login is not null
)
select p.dashboard_id,
        sum(case when true then 1 else 0 end) as n_0, (max(x.md)::date - max(case when true then p.dmax end)::date) as l_0, sum(case when true and p.rc = 4 then 1 else 0 end) as h4_0, sum(case when true and p.rc = 3 then 1 else 0 end) as h3_0, sum(case when true and p.rc = 2 then 1 else 0 end) as h2_0, sum(case when true and p.rc = 1 then 1 else 0 end) as h1_0,
        sum(case when p.own = 0 then 1 else 0 end) as n_1, (max(x.md)::date - max(case when p.own = 0 then p.dmax end)::date) as l_1, sum(case when p.own = 0 and p.rc = 4 then 1 else 0 end) as h4_1, sum(case when p.own = 0 and p.rc = 3 then 1 else 0 end) as h3_1, sum(case when p.own = 0 and p.rc = 2 then 1 else 0 end) as h2_1, sum(case when p.own = 0 and p.rc = 1 then 1 else 0 end) as h1_1,
        sum(case when true and (p.m_d & 1073741823) <> 0 then 1 else 0 end) as u_0_d, sum(case when true then p.v_d else 0 end) as v_0_d, sum(case when true and length(replace((p.m_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_0_d, sum(case when true and (p.m_d & 1073741823) <> 0 and p.acc = 1 then 1 else 0 end) as a_0_d,
        sum(case when true and (p.m_w & 1048575) <> 0 then 1 else 0 end) as u_0_w, sum(case when true then p.v_w else 0 end) as v_0_w, sum(case when true and length(replace((p.m_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_0_w, sum(case when true and (p.m_w & 1048575) <> 0 and p.acc = 1 then 1 else 0 end) as a_0_w,
        sum(case when true and (p.m_m & 4095) <> 0 then 1 else 0 end) as u_0_m, sum(case when true then p.v_m else 0 end) as v_0_m, sum(case when true and length(replace((p.m_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end) as r_0_m, sum(case when true and (p.m_m & 4095) <> 0 and p.acc = 1 then 1 else 0 end) as a_0_m,
        sum(case when true and (p.m_q & 255) <> 0 then 1 else 0 end) as u_0_q, sum(case when true then p.v_q else 0 end) as v_0_q, sum(case when true and length(replace((p.m_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end) as r_0_q, sum(case when true and (p.m_q & 255) <> 0 and p.acc = 1 then 1 else 0 end) as a_0_q,
        sum(case when p.own = 0 and (p.m_d & 1073741823) <> 0 then 1 else 0 end) as u_1_d, sum(case when p.own = 0 then p.v_d else 0 end) as v_1_d, sum(case when p.own = 0 and length(replace((p.m_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_1_d, sum(case when p.own = 0 and (p.m_d & 1073741823) <> 0 and p.acc = 1 then 1 else 0 end) as a_1_d,
        sum(case when p.own = 0 and (p.m_w & 1048575) <> 0 then 1 else 0 end) as u_1_w, sum(case when p.own = 0 then p.v_w else 0 end) as v_1_w, sum(case when p.own = 0 and length(replace((p.m_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_1_w, sum(case when p.own = 0 and (p.m_w & 1048575) <> 0 and p.acc = 1 then 1 else 0 end) as a_1_w,
        sum(case when p.own = 0 and (p.m_m & 4095) <> 0 then 1 else 0 end) as u_1_m, sum(case when p.own = 0 then p.v_m else 0 end) as v_1_m, sum(case when p.own = 0 and length(replace((p.m_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end) as r_1_m, sum(case when p.own = 0 and (p.m_m & 4095) <> 0 and p.acc = 1 then 1 else 0 end) as a_1_m,
        sum(case when p.own = 0 and (p.m_q & 255) <> 0 then 1 else 0 end) as u_1_q, sum(case when p.own = 0 then p.v_q else 0 end) as v_1_q, sum(case when p.own = 0 and length(replace((p.m_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end) as r_1_q, sum(case when p.own = 0 and (p.m_q & 255) <> 0 and p.acc = 1 then 1 else 0 end) as a_1_q
from p cross join usr_cross_data.pa_md x
group by p.dashboard_id
distributed by (dashboard_id);
analyze usr_cross_data.pa_cat_rep;

-- ---------------------------------------------------------------------------
-- Параграф «PA · каталог — владельцы, коллекции, ИТОГО» → usr_cross_data.pa_cat_grp   (НОВЫЙ 2026-10-23)
-- Строки вкладок «Владельцы», «Коллекции» и ИТОГО каталога без людских условий: kd = 0 — ИТОГО, 2 — владелец (каждый
-- из владельцев отчёта), 3 — коллекция; при каждом сочетании переключателей шапки c = опубл. + 2·актуал. + 4·без владельцев
-- (0…7) и периоде g: n_c — людей, l_c — дней с последнего визита, u_c_g / v_c_g / r_c_g — пользователи / просмотры /
-- постоянные. Человек строки — логин с объединёнными визитами во все её отчёты (как в SQL каталога).
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_cat_grp;
create table usr_cross_data.pa_cat_grp as
with ox as (select dashboard_id, unnest(owners_string) as x from usr_cross_data.pa_dash_meta),
oz as (select dashboard_id, bool_or(coalesce(x, '') <> '') as ne from ox group by dashboard_id),
own as (    -- владельцы отчёта: все из owners_string (без пустых, латиница — строчными, без повторов), пусто — автор owner_login
    select o.dashboard_id, translate(trim(coalesce(o.x, '')), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') as o from ox o inner join oz z on z.dashboard_id = o.dashboard_id where z.ne
    union
    select m.dashboard_id, translate(trim(coalesce(m.owner_login, '')), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') from usr_cross_data.pa_dash_meta m
    left join oz z on z.dashboard_id = m.dashboard_id where coalesce(z.ne, false) = false
),
k as (
    select dashboard_id, 0 as kd, ''::text as k0 from usr_cross_data.pa_dash_meta
    union all
    select dashboard_id, 2, o from own where o <> ''
    union all
    select dashboard_id, 3, c from (select dashboard_id, unnest(collection_names)::text as c from usr_cross_data.pa_dash_meta) z where coalesce(c, '') <> ''
),
lk as (
    select k.kd, k.k0, p.login,
        max(case when true then p.dmax end) as x_0,
        max(case when m.published = 1 then p.dmax end) as x_1,
        max(case when m.actual_flg = 1 then p.dmax end) as x_2,
        max(case when m.published = 1 and m.actual_flg = 1 then p.dmax end) as x_3,
        max(case when coalesce(p.own_flg, 0) = 0 then p.dmax end) as x_4,
        max(case when m.published = 1 and coalesce(p.own_flg, 0) = 0 then p.dmax end) as x_5,
        max(case when m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then p.dmax end) as x_6,
        max(case when m.published = 1 and m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then p.dmax end) as x_7,
        bit_or(case when true then coalesce(p.msk_d, 0) end) as m_0_d,
        bit_or(case when true then coalesce(p.msk_w, 0) end) as m_0_w,
        bit_or(case when true then coalesce(p.msk_m, 0) end) as m_0_m,
        bit_or(case when true then coalesce(p.msk_q, 0) end) as m_0_q,
        bit_or(case when m.published = 1 then coalesce(p.msk_d, 0) end) as m_1_d,
        bit_or(case when m.published = 1 then coalesce(p.msk_w, 0) end) as m_1_w,
        bit_or(case when m.published = 1 then coalesce(p.msk_m, 0) end) as m_1_m,
        bit_or(case when m.published = 1 then coalesce(p.msk_q, 0) end) as m_1_q,
        bit_or(case when m.actual_flg = 1 then coalesce(p.msk_d, 0) end) as m_2_d,
        bit_or(case when m.actual_flg = 1 then coalesce(p.msk_w, 0) end) as m_2_w,
        bit_or(case when m.actual_flg = 1 then coalesce(p.msk_m, 0) end) as m_2_m,
        bit_or(case when m.actual_flg = 1 then coalesce(p.msk_q, 0) end) as m_2_q,
        bit_or(case when m.published = 1 and m.actual_flg = 1 then coalesce(p.msk_d, 0) end) as m_3_d,
        bit_or(case when m.published = 1 and m.actual_flg = 1 then coalesce(p.msk_w, 0) end) as m_3_w,
        bit_or(case when m.published = 1 and m.actual_flg = 1 then coalesce(p.msk_m, 0) end) as m_3_m,
        bit_or(case when m.published = 1 and m.actual_flg = 1 then coalesce(p.msk_q, 0) end) as m_3_q,
        bit_or(case when coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_d, 0) end) as m_4_d,
        bit_or(case when coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_w, 0) end) as m_4_w,
        bit_or(case when coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_m, 0) end) as m_4_m,
        bit_or(case when coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_q, 0) end) as m_4_q,
        bit_or(case when m.published = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_d, 0) end) as m_5_d,
        bit_or(case when m.published = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_w, 0) end) as m_5_w,
        bit_or(case when m.published = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_m, 0) end) as m_5_m,
        bit_or(case when m.published = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_q, 0) end) as m_5_q,
        bit_or(case when m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_d, 0) end) as m_6_d,
        bit_or(case when m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_w, 0) end) as m_6_w,
        bit_or(case when m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_m, 0) end) as m_6_m,
        bit_or(case when m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_q, 0) end) as m_6_q,
        bit_or(case when m.published = 1 and m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_d, 0) end) as m_7_d,
        bit_or(case when m.published = 1 and m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_w, 0) end) as m_7_w,
        bit_or(case when m.published = 1 and m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_m, 0) end) as m_7_m,
        bit_or(case when m.published = 1 and m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_q, 0) end) as m_7_q,
        sum(case when true then coalesce(p.v_d, 0) end) as v_0_d,
        sum(case when true then coalesce(p.v_w, 0) end) as v_0_w,
        sum(case when true then coalesce(p.v_m, 0) end) as v_0_m,
        sum(case when true then coalesce(p.v_q, 0) end) as v_0_q,
        sum(case when m.published = 1 then coalesce(p.v_d, 0) end) as v_1_d,
        sum(case when m.published = 1 then coalesce(p.v_w, 0) end) as v_1_w,
        sum(case when m.published = 1 then coalesce(p.v_m, 0) end) as v_1_m,
        sum(case when m.published = 1 then coalesce(p.v_q, 0) end) as v_1_q,
        sum(case when m.actual_flg = 1 then coalesce(p.v_d, 0) end) as v_2_d,
        sum(case when m.actual_flg = 1 then coalesce(p.v_w, 0) end) as v_2_w,
        sum(case when m.actual_flg = 1 then coalesce(p.v_m, 0) end) as v_2_m,
        sum(case when m.actual_flg = 1 then coalesce(p.v_q, 0) end) as v_2_q,
        sum(case when m.published = 1 and m.actual_flg = 1 then coalesce(p.v_d, 0) end) as v_3_d,
        sum(case when m.published = 1 and m.actual_flg = 1 then coalesce(p.v_w, 0) end) as v_3_w,
        sum(case when m.published = 1 and m.actual_flg = 1 then coalesce(p.v_m, 0) end) as v_3_m,
        sum(case when m.published = 1 and m.actual_flg = 1 then coalesce(p.v_q, 0) end) as v_3_q,
        sum(case when coalesce(p.own_flg, 0) = 0 then coalesce(p.v_d, 0) end) as v_4_d,
        sum(case when coalesce(p.own_flg, 0) = 0 then coalesce(p.v_w, 0) end) as v_4_w,
        sum(case when coalesce(p.own_flg, 0) = 0 then coalesce(p.v_m, 0) end) as v_4_m,
        sum(case when coalesce(p.own_flg, 0) = 0 then coalesce(p.v_q, 0) end) as v_4_q,
        sum(case when m.published = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.v_d, 0) end) as v_5_d,
        sum(case when m.published = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.v_w, 0) end) as v_5_w,
        sum(case when m.published = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.v_m, 0) end) as v_5_m,
        sum(case when m.published = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.v_q, 0) end) as v_5_q,
        sum(case when m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.v_d, 0) end) as v_6_d,
        sum(case when m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.v_w, 0) end) as v_6_w,
        sum(case when m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.v_m, 0) end) as v_6_m,
        sum(case when m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.v_q, 0) end) as v_6_q,
        sum(case when m.published = 1 and m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.v_d, 0) end) as v_7_d,
        sum(case when m.published = 1 and m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.v_w, 0) end) as v_7_w,
        sum(case when m.published = 1 and m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.v_m, 0) end) as v_7_m,
        sum(case when m.published = 1 and m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.v_q, 0) end) as v_7_q
    from usr_cross_data.pa_pair p
    inner join usr_cross_data.pa_dash_meta m on m.dashboard_id = p.dashboard_id
    inner join k on k.dashboard_id = p.dashboard_id
    where p.login is not null
    group by k.kd, k.k0, p.login
)
select kd, k0,
        count(x_0) as n_0, (max(x.md)::date - max(x_0)::date) as l_0,
        count(x_1) as n_1, (max(x.md)::date - max(x_1)::date) as l_1,
        count(x_2) as n_2, (max(x.md)::date - max(x_2)::date) as l_2,
        count(x_3) as n_3, (max(x.md)::date - max(x_3)::date) as l_3,
        count(x_4) as n_4, (max(x.md)::date - max(x_4)::date) as l_4,
        count(x_5) as n_5, (max(x.md)::date - max(x_5)::date) as l_5,
        count(x_6) as n_6, (max(x.md)::date - max(x_6)::date) as l_6,
        count(x_7) as n_7, (max(x.md)::date - max(x_7)::date) as l_7,
        sum(case when (m_0_d & 1073741823) <> 0 then 1 else 0 end) as u_0_d, coalesce(sum(v_0_d), 0) as v_0_d, sum(case when length(replace((m_0_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_0_d,
        sum(case when (m_0_w & 1048575) <> 0 then 1 else 0 end) as u_0_w, coalesce(sum(v_0_w), 0) as v_0_w, sum(case when length(replace((m_0_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_0_w,
        sum(case when (m_0_m & 4095) <> 0 then 1 else 0 end) as u_0_m, coalesce(sum(v_0_m), 0) as v_0_m, sum(case when length(replace((m_0_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end) as r_0_m,
        sum(case when (m_0_q & 255) <> 0 then 1 else 0 end) as u_0_q, coalesce(sum(v_0_q), 0) as v_0_q, sum(case when length(replace((m_0_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end) as r_0_q,
        sum(case when (m_1_d & 1073741823) <> 0 then 1 else 0 end) as u_1_d, coalesce(sum(v_1_d), 0) as v_1_d, sum(case when length(replace((m_1_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_1_d,
        sum(case when (m_1_w & 1048575) <> 0 then 1 else 0 end) as u_1_w, coalesce(sum(v_1_w), 0) as v_1_w, sum(case when length(replace((m_1_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_1_w,
        sum(case when (m_1_m & 4095) <> 0 then 1 else 0 end) as u_1_m, coalesce(sum(v_1_m), 0) as v_1_m, sum(case when length(replace((m_1_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end) as r_1_m,
        sum(case when (m_1_q & 255) <> 0 then 1 else 0 end) as u_1_q, coalesce(sum(v_1_q), 0) as v_1_q, sum(case when length(replace((m_1_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end) as r_1_q,
        sum(case when (m_2_d & 1073741823) <> 0 then 1 else 0 end) as u_2_d, coalesce(sum(v_2_d), 0) as v_2_d, sum(case when length(replace((m_2_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_2_d,
        sum(case when (m_2_w & 1048575) <> 0 then 1 else 0 end) as u_2_w, coalesce(sum(v_2_w), 0) as v_2_w, sum(case when length(replace((m_2_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_2_w,
        sum(case when (m_2_m & 4095) <> 0 then 1 else 0 end) as u_2_m, coalesce(sum(v_2_m), 0) as v_2_m, sum(case when length(replace((m_2_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end) as r_2_m,
        sum(case when (m_2_q & 255) <> 0 then 1 else 0 end) as u_2_q, coalesce(sum(v_2_q), 0) as v_2_q, sum(case when length(replace((m_2_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end) as r_2_q,
        sum(case when (m_3_d & 1073741823) <> 0 then 1 else 0 end) as u_3_d, coalesce(sum(v_3_d), 0) as v_3_d, sum(case when length(replace((m_3_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_3_d,
        sum(case when (m_3_w & 1048575) <> 0 then 1 else 0 end) as u_3_w, coalesce(sum(v_3_w), 0) as v_3_w, sum(case when length(replace((m_3_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_3_w,
        sum(case when (m_3_m & 4095) <> 0 then 1 else 0 end) as u_3_m, coalesce(sum(v_3_m), 0) as v_3_m, sum(case when length(replace((m_3_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end) as r_3_m,
        sum(case when (m_3_q & 255) <> 0 then 1 else 0 end) as u_3_q, coalesce(sum(v_3_q), 0) as v_3_q, sum(case when length(replace((m_3_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end) as r_3_q,
        sum(case when (m_4_d & 1073741823) <> 0 then 1 else 0 end) as u_4_d, coalesce(sum(v_4_d), 0) as v_4_d, sum(case when length(replace((m_4_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_4_d,
        sum(case when (m_4_w & 1048575) <> 0 then 1 else 0 end) as u_4_w, coalesce(sum(v_4_w), 0) as v_4_w, sum(case when length(replace((m_4_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_4_w,
        sum(case when (m_4_m & 4095) <> 0 then 1 else 0 end) as u_4_m, coalesce(sum(v_4_m), 0) as v_4_m, sum(case when length(replace((m_4_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end) as r_4_m,
        sum(case when (m_4_q & 255) <> 0 then 1 else 0 end) as u_4_q, coalesce(sum(v_4_q), 0) as v_4_q, sum(case when length(replace((m_4_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end) as r_4_q,
        sum(case when (m_5_d & 1073741823) <> 0 then 1 else 0 end) as u_5_d, coalesce(sum(v_5_d), 0) as v_5_d, sum(case when length(replace((m_5_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_5_d,
        sum(case when (m_5_w & 1048575) <> 0 then 1 else 0 end) as u_5_w, coalesce(sum(v_5_w), 0) as v_5_w, sum(case when length(replace((m_5_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_5_w,
        sum(case when (m_5_m & 4095) <> 0 then 1 else 0 end) as u_5_m, coalesce(sum(v_5_m), 0) as v_5_m, sum(case when length(replace((m_5_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end) as r_5_m,
        sum(case when (m_5_q & 255) <> 0 then 1 else 0 end) as u_5_q, coalesce(sum(v_5_q), 0) as v_5_q, sum(case when length(replace((m_5_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end) as r_5_q,
        sum(case when (m_6_d & 1073741823) <> 0 then 1 else 0 end) as u_6_d, coalesce(sum(v_6_d), 0) as v_6_d, sum(case when length(replace((m_6_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_6_d,
        sum(case when (m_6_w & 1048575) <> 0 then 1 else 0 end) as u_6_w, coalesce(sum(v_6_w), 0) as v_6_w, sum(case when length(replace((m_6_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_6_w,
        sum(case when (m_6_m & 4095) <> 0 then 1 else 0 end) as u_6_m, coalesce(sum(v_6_m), 0) as v_6_m, sum(case when length(replace((m_6_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end) as r_6_m,
        sum(case when (m_6_q & 255) <> 0 then 1 else 0 end) as u_6_q, coalesce(sum(v_6_q), 0) as v_6_q, sum(case when length(replace((m_6_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end) as r_6_q,
        sum(case when (m_7_d & 1073741823) <> 0 then 1 else 0 end) as u_7_d, coalesce(sum(v_7_d), 0) as v_7_d, sum(case when length(replace((m_7_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_7_d,
        sum(case when (m_7_w & 1048575) <> 0 then 1 else 0 end) as u_7_w, coalesce(sum(v_7_w), 0) as v_7_w, sum(case when length(replace((m_7_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_7_w,
        sum(case when (m_7_m & 4095) <> 0 then 1 else 0 end) as u_7_m, coalesce(sum(v_7_m), 0) as v_7_m, sum(case when length(replace((m_7_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end) as r_7_m,
        sum(case when (m_7_q & 255) <> 0 then 1 else 0 end) as u_7_q, coalesce(sum(v_7_q), 0) as v_7_q, sum(case when length(replace((m_7_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end) as r_7_q
from lk cross join usr_cross_data.pa_md x
group by kd, k0
distributed by (k0);
analyze usr_cross_data.pa_cat_grp;

-- ---------------------------------------------------------------------------
-- Параграф «PA · каталог — аудитория» → usr_cross_data.pa_cat_aud   (НОВЫЙ 2026-10-23, после «PA · штат — готовые атрибуты»)
-- Вкладка «Аудитория» каталога без людских условий: разрез ad (o — оргструктура, s — специализация, t — стрим, q — HQ,
-- i — IT, h — руководители) × значение ak0 (у o — путь, ap — путь уровнем выше): staff — людей штата, u / v / r_c_g —
-- заходило / их просмотров / постоянных при сочетании c и периоде g. Строка ad = 'all' — все зрители периода (и не сотрудники).
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_cat_aud;
create table usr_cross_data.pa_cat_aud as
with vz as (
    select translate(p.login, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') as vl,
        bit_or(case when true then coalesce(p.msk_d, 0) end) as m_0_d,
        bit_or(case when true then coalesce(p.msk_w, 0) end) as m_0_w,
        bit_or(case when true then coalesce(p.msk_m, 0) end) as m_0_m,
        bit_or(case when true then coalesce(p.msk_q, 0) end) as m_0_q,
        bit_or(case when m.published = 1 then coalesce(p.msk_d, 0) end) as m_1_d,
        bit_or(case when m.published = 1 then coalesce(p.msk_w, 0) end) as m_1_w,
        bit_or(case when m.published = 1 then coalesce(p.msk_m, 0) end) as m_1_m,
        bit_or(case when m.published = 1 then coalesce(p.msk_q, 0) end) as m_1_q,
        bit_or(case when m.actual_flg = 1 then coalesce(p.msk_d, 0) end) as m_2_d,
        bit_or(case when m.actual_flg = 1 then coalesce(p.msk_w, 0) end) as m_2_w,
        bit_or(case when m.actual_flg = 1 then coalesce(p.msk_m, 0) end) as m_2_m,
        bit_or(case when m.actual_flg = 1 then coalesce(p.msk_q, 0) end) as m_2_q,
        bit_or(case when m.published = 1 and m.actual_flg = 1 then coalesce(p.msk_d, 0) end) as m_3_d,
        bit_or(case when m.published = 1 and m.actual_flg = 1 then coalesce(p.msk_w, 0) end) as m_3_w,
        bit_or(case when m.published = 1 and m.actual_flg = 1 then coalesce(p.msk_m, 0) end) as m_3_m,
        bit_or(case when m.published = 1 and m.actual_flg = 1 then coalesce(p.msk_q, 0) end) as m_3_q,
        bit_or(case when coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_d, 0) end) as m_4_d,
        bit_or(case when coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_w, 0) end) as m_4_w,
        bit_or(case when coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_m, 0) end) as m_4_m,
        bit_or(case when coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_q, 0) end) as m_4_q,
        bit_or(case when m.published = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_d, 0) end) as m_5_d,
        bit_or(case when m.published = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_w, 0) end) as m_5_w,
        bit_or(case when m.published = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_m, 0) end) as m_5_m,
        bit_or(case when m.published = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_q, 0) end) as m_5_q,
        bit_or(case when m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_d, 0) end) as m_6_d,
        bit_or(case when m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_w, 0) end) as m_6_w,
        bit_or(case when m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_m, 0) end) as m_6_m,
        bit_or(case when m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_q, 0) end) as m_6_q,
        bit_or(case when m.published = 1 and m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_d, 0) end) as m_7_d,
        bit_or(case when m.published = 1 and m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_w, 0) end) as m_7_w,
        bit_or(case when m.published = 1 and m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_m, 0) end) as m_7_m,
        bit_or(case when m.published = 1 and m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.msk_q, 0) end) as m_7_q,
        sum(case when true then coalesce(p.v_d, 0) end) as v_0_d,
        sum(case when true then coalesce(p.v_w, 0) end) as v_0_w,
        sum(case when true then coalesce(p.v_m, 0) end) as v_0_m,
        sum(case when true then coalesce(p.v_q, 0) end) as v_0_q,
        sum(case when m.published = 1 then coalesce(p.v_d, 0) end) as v_1_d,
        sum(case when m.published = 1 then coalesce(p.v_w, 0) end) as v_1_w,
        sum(case when m.published = 1 then coalesce(p.v_m, 0) end) as v_1_m,
        sum(case when m.published = 1 then coalesce(p.v_q, 0) end) as v_1_q,
        sum(case when m.actual_flg = 1 then coalesce(p.v_d, 0) end) as v_2_d,
        sum(case when m.actual_flg = 1 then coalesce(p.v_w, 0) end) as v_2_w,
        sum(case when m.actual_flg = 1 then coalesce(p.v_m, 0) end) as v_2_m,
        sum(case when m.actual_flg = 1 then coalesce(p.v_q, 0) end) as v_2_q,
        sum(case when m.published = 1 and m.actual_flg = 1 then coalesce(p.v_d, 0) end) as v_3_d,
        sum(case when m.published = 1 and m.actual_flg = 1 then coalesce(p.v_w, 0) end) as v_3_w,
        sum(case when m.published = 1 and m.actual_flg = 1 then coalesce(p.v_m, 0) end) as v_3_m,
        sum(case when m.published = 1 and m.actual_flg = 1 then coalesce(p.v_q, 0) end) as v_3_q,
        sum(case when coalesce(p.own_flg, 0) = 0 then coalesce(p.v_d, 0) end) as v_4_d,
        sum(case when coalesce(p.own_flg, 0) = 0 then coalesce(p.v_w, 0) end) as v_4_w,
        sum(case when coalesce(p.own_flg, 0) = 0 then coalesce(p.v_m, 0) end) as v_4_m,
        sum(case when coalesce(p.own_flg, 0) = 0 then coalesce(p.v_q, 0) end) as v_4_q,
        sum(case when m.published = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.v_d, 0) end) as v_5_d,
        sum(case when m.published = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.v_w, 0) end) as v_5_w,
        sum(case when m.published = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.v_m, 0) end) as v_5_m,
        sum(case when m.published = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.v_q, 0) end) as v_5_q,
        sum(case when m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.v_d, 0) end) as v_6_d,
        sum(case when m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.v_w, 0) end) as v_6_w,
        sum(case when m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.v_m, 0) end) as v_6_m,
        sum(case when m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.v_q, 0) end) as v_6_q,
        sum(case when m.published = 1 and m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.v_d, 0) end) as v_7_d,
        sum(case when m.published = 1 and m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.v_w, 0) end) as v_7_w,
        sum(case when m.published = 1 and m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.v_m, 0) end) as v_7_m,
        sum(case when m.published = 1 and m.actual_flg = 1 and coalesce(p.own_flg, 0) = 0 then coalesce(p.v_q, 0) end) as v_7_q
    from usr_cross_data.pa_pair p
    inner join usr_cross_data.pa_dash_meta m on m.dashboard_id = p.dashboard_id
    where p.login is not null
    group by 1
),
sx as (
    select s.slv, s.sol, s.sp, s.st, s.hqc, s.itc, s.hdf,
        case when (z.m_0_d & 1073741823) <> 0 then 1 else 0 end as u_0_d, case when (z.m_0_d & 1073741823) <> 0 then z.v_0_d else 0 end as w_0_d, case when length(replace((z.m_0_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end as r_0_d,
        case when (z.m_0_w & 1048575) <> 0 then 1 else 0 end as u_0_w, case when (z.m_0_w & 1048575) <> 0 then z.v_0_w else 0 end as w_0_w, case when length(replace((z.m_0_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end as r_0_w,
        case when (z.m_0_m & 4095) <> 0 then 1 else 0 end as u_0_m, case when (z.m_0_m & 4095) <> 0 then z.v_0_m else 0 end as w_0_m, case when length(replace((z.m_0_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end as r_0_m,
        case when (z.m_0_q & 255) <> 0 then 1 else 0 end as u_0_q, case when (z.m_0_q & 255) <> 0 then z.v_0_q else 0 end as w_0_q, case when length(replace((z.m_0_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end as r_0_q,
        case when (z.m_1_d & 1073741823) <> 0 then 1 else 0 end as u_1_d, case when (z.m_1_d & 1073741823) <> 0 then z.v_1_d else 0 end as w_1_d, case when length(replace((z.m_1_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end as r_1_d,
        case when (z.m_1_w & 1048575) <> 0 then 1 else 0 end as u_1_w, case when (z.m_1_w & 1048575) <> 0 then z.v_1_w else 0 end as w_1_w, case when length(replace((z.m_1_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end as r_1_w,
        case when (z.m_1_m & 4095) <> 0 then 1 else 0 end as u_1_m, case when (z.m_1_m & 4095) <> 0 then z.v_1_m else 0 end as w_1_m, case when length(replace((z.m_1_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end as r_1_m,
        case when (z.m_1_q & 255) <> 0 then 1 else 0 end as u_1_q, case when (z.m_1_q & 255) <> 0 then z.v_1_q else 0 end as w_1_q, case when length(replace((z.m_1_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end as r_1_q,
        case when (z.m_2_d & 1073741823) <> 0 then 1 else 0 end as u_2_d, case when (z.m_2_d & 1073741823) <> 0 then z.v_2_d else 0 end as w_2_d, case when length(replace((z.m_2_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end as r_2_d,
        case when (z.m_2_w & 1048575) <> 0 then 1 else 0 end as u_2_w, case when (z.m_2_w & 1048575) <> 0 then z.v_2_w else 0 end as w_2_w, case when length(replace((z.m_2_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end as r_2_w,
        case when (z.m_2_m & 4095) <> 0 then 1 else 0 end as u_2_m, case when (z.m_2_m & 4095) <> 0 then z.v_2_m else 0 end as w_2_m, case when length(replace((z.m_2_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end as r_2_m,
        case when (z.m_2_q & 255) <> 0 then 1 else 0 end as u_2_q, case when (z.m_2_q & 255) <> 0 then z.v_2_q else 0 end as w_2_q, case when length(replace((z.m_2_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end as r_2_q,
        case when (z.m_3_d & 1073741823) <> 0 then 1 else 0 end as u_3_d, case when (z.m_3_d & 1073741823) <> 0 then z.v_3_d else 0 end as w_3_d, case when length(replace((z.m_3_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end as r_3_d,
        case when (z.m_3_w & 1048575) <> 0 then 1 else 0 end as u_3_w, case when (z.m_3_w & 1048575) <> 0 then z.v_3_w else 0 end as w_3_w, case when length(replace((z.m_3_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end as r_3_w,
        case when (z.m_3_m & 4095) <> 0 then 1 else 0 end as u_3_m, case when (z.m_3_m & 4095) <> 0 then z.v_3_m else 0 end as w_3_m, case when length(replace((z.m_3_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end as r_3_m,
        case when (z.m_3_q & 255) <> 0 then 1 else 0 end as u_3_q, case when (z.m_3_q & 255) <> 0 then z.v_3_q else 0 end as w_3_q, case when length(replace((z.m_3_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end as r_3_q,
        case when (z.m_4_d & 1073741823) <> 0 then 1 else 0 end as u_4_d, case when (z.m_4_d & 1073741823) <> 0 then z.v_4_d else 0 end as w_4_d, case when length(replace((z.m_4_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end as r_4_d,
        case when (z.m_4_w & 1048575) <> 0 then 1 else 0 end as u_4_w, case when (z.m_4_w & 1048575) <> 0 then z.v_4_w else 0 end as w_4_w, case when length(replace((z.m_4_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end as r_4_w,
        case when (z.m_4_m & 4095) <> 0 then 1 else 0 end as u_4_m, case when (z.m_4_m & 4095) <> 0 then z.v_4_m else 0 end as w_4_m, case when length(replace((z.m_4_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end as r_4_m,
        case when (z.m_4_q & 255) <> 0 then 1 else 0 end as u_4_q, case when (z.m_4_q & 255) <> 0 then z.v_4_q else 0 end as w_4_q, case when length(replace((z.m_4_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end as r_4_q,
        case when (z.m_5_d & 1073741823) <> 0 then 1 else 0 end as u_5_d, case when (z.m_5_d & 1073741823) <> 0 then z.v_5_d else 0 end as w_5_d, case when length(replace((z.m_5_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end as r_5_d,
        case when (z.m_5_w & 1048575) <> 0 then 1 else 0 end as u_5_w, case when (z.m_5_w & 1048575) <> 0 then z.v_5_w else 0 end as w_5_w, case when length(replace((z.m_5_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end as r_5_w,
        case when (z.m_5_m & 4095) <> 0 then 1 else 0 end as u_5_m, case when (z.m_5_m & 4095) <> 0 then z.v_5_m else 0 end as w_5_m, case when length(replace((z.m_5_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end as r_5_m,
        case when (z.m_5_q & 255) <> 0 then 1 else 0 end as u_5_q, case when (z.m_5_q & 255) <> 0 then z.v_5_q else 0 end as w_5_q, case when length(replace((z.m_5_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end as r_5_q,
        case when (z.m_6_d & 1073741823) <> 0 then 1 else 0 end as u_6_d, case when (z.m_6_d & 1073741823) <> 0 then z.v_6_d else 0 end as w_6_d, case when length(replace((z.m_6_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end as r_6_d,
        case when (z.m_6_w & 1048575) <> 0 then 1 else 0 end as u_6_w, case when (z.m_6_w & 1048575) <> 0 then z.v_6_w else 0 end as w_6_w, case when length(replace((z.m_6_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end as r_6_w,
        case when (z.m_6_m & 4095) <> 0 then 1 else 0 end as u_6_m, case when (z.m_6_m & 4095) <> 0 then z.v_6_m else 0 end as w_6_m, case when length(replace((z.m_6_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end as r_6_m,
        case when (z.m_6_q & 255) <> 0 then 1 else 0 end as u_6_q, case when (z.m_6_q & 255) <> 0 then z.v_6_q else 0 end as w_6_q, case when length(replace((z.m_6_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end as r_6_q,
        case when (z.m_7_d & 1073741823) <> 0 then 1 else 0 end as u_7_d, case when (z.m_7_d & 1073741823) <> 0 then z.v_7_d else 0 end as w_7_d, case when length(replace((z.m_7_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end as r_7_d,
        case when (z.m_7_w & 1048575) <> 0 then 1 else 0 end as u_7_w, case when (z.m_7_w & 1048575) <> 0 then z.v_7_w else 0 end as w_7_w, case when length(replace((z.m_7_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end as r_7_w,
        case when (z.m_7_m & 4095) <> 0 then 1 else 0 end as u_7_m, case when (z.m_7_m & 4095) <> 0 then z.v_7_m else 0 end as w_7_m, case when length(replace((z.m_7_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end as r_7_m,
        case when (z.m_7_q & 255) <> 0 then 1 else 0 end as u_7_q, case when (z.m_7_q & 255) <> 0 then z.v_7_q else 0 end as w_7_q, case when length(replace((z.m_7_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end as r_7_q
    from usr_cross_data.pa_staffx s
    left join vz z on z.vl = s.login
),
kt as (
    select 'o'::text as ad, i from generate_series(1, 5) i
    union all select 's', 0 union all select 't', 0 union all select 'q', 0 union all select 'i', 0 union all select 'h', 0
),
ky as (
    select kt.ad,
        case kt.ad when 'o' then array_to_string(sx.slv[1:kt.i], ' › ') when 's' then sx.sp when 't' then sx.st
             when 'q' then sx.hqc when 'i' then sx.itc else sx.hdf::text end as ak0,
        case when kt.ad = 'o' then array_to_string(sx.slv[1:kt.i - 1], ' › ') else '' end as ap,
        sx.*
    from sx cross join kt
    where kt.ad <> 'o' or kt.i <= sx.sol
)
select ad, ak0, ap, count(*)::bigint as staff,
        sum(u_0_d) as u_0_d, sum(w_0_d) as v_0_d, sum(r_0_d) as r_0_d,
        sum(u_0_w) as u_0_w, sum(w_0_w) as v_0_w, sum(r_0_w) as r_0_w,
        sum(u_0_m) as u_0_m, sum(w_0_m) as v_0_m, sum(r_0_m) as r_0_m,
        sum(u_0_q) as u_0_q, sum(w_0_q) as v_0_q, sum(r_0_q) as r_0_q,
        sum(u_1_d) as u_1_d, sum(w_1_d) as v_1_d, sum(r_1_d) as r_1_d,
        sum(u_1_w) as u_1_w, sum(w_1_w) as v_1_w, sum(r_1_w) as r_1_w,
        sum(u_1_m) as u_1_m, sum(w_1_m) as v_1_m, sum(r_1_m) as r_1_m,
        sum(u_1_q) as u_1_q, sum(w_1_q) as v_1_q, sum(r_1_q) as r_1_q,
        sum(u_2_d) as u_2_d, sum(w_2_d) as v_2_d, sum(r_2_d) as r_2_d,
        sum(u_2_w) as u_2_w, sum(w_2_w) as v_2_w, sum(r_2_w) as r_2_w,
        sum(u_2_m) as u_2_m, sum(w_2_m) as v_2_m, sum(r_2_m) as r_2_m,
        sum(u_2_q) as u_2_q, sum(w_2_q) as v_2_q, sum(r_2_q) as r_2_q,
        sum(u_3_d) as u_3_d, sum(w_3_d) as v_3_d, sum(r_3_d) as r_3_d,
        sum(u_3_w) as u_3_w, sum(w_3_w) as v_3_w, sum(r_3_w) as r_3_w,
        sum(u_3_m) as u_3_m, sum(w_3_m) as v_3_m, sum(r_3_m) as r_3_m,
        sum(u_3_q) as u_3_q, sum(w_3_q) as v_3_q, sum(r_3_q) as r_3_q,
        sum(u_4_d) as u_4_d, sum(w_4_d) as v_4_d, sum(r_4_d) as r_4_d,
        sum(u_4_w) as u_4_w, sum(w_4_w) as v_4_w, sum(r_4_w) as r_4_w,
        sum(u_4_m) as u_4_m, sum(w_4_m) as v_4_m, sum(r_4_m) as r_4_m,
        sum(u_4_q) as u_4_q, sum(w_4_q) as v_4_q, sum(r_4_q) as r_4_q,
        sum(u_5_d) as u_5_d, sum(w_5_d) as v_5_d, sum(r_5_d) as r_5_d,
        sum(u_5_w) as u_5_w, sum(w_5_w) as v_5_w, sum(r_5_w) as r_5_w,
        sum(u_5_m) as u_5_m, sum(w_5_m) as v_5_m, sum(r_5_m) as r_5_m,
        sum(u_5_q) as u_5_q, sum(w_5_q) as v_5_q, sum(r_5_q) as r_5_q,
        sum(u_6_d) as u_6_d, sum(w_6_d) as v_6_d, sum(r_6_d) as r_6_d,
        sum(u_6_w) as u_6_w, sum(w_6_w) as v_6_w, sum(r_6_w) as r_6_w,
        sum(u_6_m) as u_6_m, sum(w_6_m) as v_6_m, sum(r_6_m) as r_6_m,
        sum(u_6_q) as u_6_q, sum(w_6_q) as v_6_q, sum(r_6_q) as r_6_q,
        sum(u_7_d) as u_7_d, sum(w_7_d) as v_7_d, sum(r_7_d) as r_7_d,
        sum(u_7_w) as u_7_w, sum(w_7_w) as v_7_w, sum(r_7_w) as r_7_w,
        sum(u_7_m) as u_7_m, sum(w_7_m) as v_7_m, sum(r_7_m) as r_7_m,
        sum(u_7_q) as u_7_q, sum(w_7_q) as v_7_q, sum(r_7_q) as r_7_q
from ky
group by ad, ak0, ap
union all
select 'all', '*', '', 0,
        sum(case when (m_0_d & 1073741823) <> 0 then 1 else 0 end) as u_0_d, sum(case when (m_0_d & 1073741823) <> 0 then v_0_d else 0 end) as v_0_d, sum(case when length(replace((m_0_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_0_d,
        sum(case when (m_0_w & 1048575) <> 0 then 1 else 0 end) as u_0_w, sum(case when (m_0_w & 1048575) <> 0 then v_0_w else 0 end) as v_0_w, sum(case when length(replace((m_0_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_0_w,
        sum(case when (m_0_m & 4095) <> 0 then 1 else 0 end) as u_0_m, sum(case when (m_0_m & 4095) <> 0 then v_0_m else 0 end) as v_0_m, sum(case when length(replace((m_0_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end) as r_0_m,
        sum(case when (m_0_q & 255) <> 0 then 1 else 0 end) as u_0_q, sum(case when (m_0_q & 255) <> 0 then v_0_q else 0 end) as v_0_q, sum(case when length(replace((m_0_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end) as r_0_q,
        sum(case when (m_1_d & 1073741823) <> 0 then 1 else 0 end) as u_1_d, sum(case when (m_1_d & 1073741823) <> 0 then v_1_d else 0 end) as v_1_d, sum(case when length(replace((m_1_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_1_d,
        sum(case when (m_1_w & 1048575) <> 0 then 1 else 0 end) as u_1_w, sum(case when (m_1_w & 1048575) <> 0 then v_1_w else 0 end) as v_1_w, sum(case when length(replace((m_1_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_1_w,
        sum(case when (m_1_m & 4095) <> 0 then 1 else 0 end) as u_1_m, sum(case when (m_1_m & 4095) <> 0 then v_1_m else 0 end) as v_1_m, sum(case when length(replace((m_1_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end) as r_1_m,
        sum(case when (m_1_q & 255) <> 0 then 1 else 0 end) as u_1_q, sum(case when (m_1_q & 255) <> 0 then v_1_q else 0 end) as v_1_q, sum(case when length(replace((m_1_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end) as r_1_q,
        sum(case when (m_2_d & 1073741823) <> 0 then 1 else 0 end) as u_2_d, sum(case when (m_2_d & 1073741823) <> 0 then v_2_d else 0 end) as v_2_d, sum(case when length(replace((m_2_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_2_d,
        sum(case when (m_2_w & 1048575) <> 0 then 1 else 0 end) as u_2_w, sum(case when (m_2_w & 1048575) <> 0 then v_2_w else 0 end) as v_2_w, sum(case when length(replace((m_2_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_2_w,
        sum(case when (m_2_m & 4095) <> 0 then 1 else 0 end) as u_2_m, sum(case when (m_2_m & 4095) <> 0 then v_2_m else 0 end) as v_2_m, sum(case when length(replace((m_2_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end) as r_2_m,
        sum(case when (m_2_q & 255) <> 0 then 1 else 0 end) as u_2_q, sum(case when (m_2_q & 255) <> 0 then v_2_q else 0 end) as v_2_q, sum(case when length(replace((m_2_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end) as r_2_q,
        sum(case when (m_3_d & 1073741823) <> 0 then 1 else 0 end) as u_3_d, sum(case when (m_3_d & 1073741823) <> 0 then v_3_d else 0 end) as v_3_d, sum(case when length(replace((m_3_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_3_d,
        sum(case when (m_3_w & 1048575) <> 0 then 1 else 0 end) as u_3_w, sum(case when (m_3_w & 1048575) <> 0 then v_3_w else 0 end) as v_3_w, sum(case when length(replace((m_3_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_3_w,
        sum(case when (m_3_m & 4095) <> 0 then 1 else 0 end) as u_3_m, sum(case when (m_3_m & 4095) <> 0 then v_3_m else 0 end) as v_3_m, sum(case when length(replace((m_3_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end) as r_3_m,
        sum(case when (m_3_q & 255) <> 0 then 1 else 0 end) as u_3_q, sum(case when (m_3_q & 255) <> 0 then v_3_q else 0 end) as v_3_q, sum(case when length(replace((m_3_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end) as r_3_q,
        sum(case when (m_4_d & 1073741823) <> 0 then 1 else 0 end) as u_4_d, sum(case when (m_4_d & 1073741823) <> 0 then v_4_d else 0 end) as v_4_d, sum(case when length(replace((m_4_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_4_d,
        sum(case when (m_4_w & 1048575) <> 0 then 1 else 0 end) as u_4_w, sum(case when (m_4_w & 1048575) <> 0 then v_4_w else 0 end) as v_4_w, sum(case when length(replace((m_4_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_4_w,
        sum(case when (m_4_m & 4095) <> 0 then 1 else 0 end) as u_4_m, sum(case when (m_4_m & 4095) <> 0 then v_4_m else 0 end) as v_4_m, sum(case when length(replace((m_4_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end) as r_4_m,
        sum(case when (m_4_q & 255) <> 0 then 1 else 0 end) as u_4_q, sum(case when (m_4_q & 255) <> 0 then v_4_q else 0 end) as v_4_q, sum(case when length(replace((m_4_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end) as r_4_q,
        sum(case when (m_5_d & 1073741823) <> 0 then 1 else 0 end) as u_5_d, sum(case when (m_5_d & 1073741823) <> 0 then v_5_d else 0 end) as v_5_d, sum(case when length(replace((m_5_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_5_d,
        sum(case when (m_5_w & 1048575) <> 0 then 1 else 0 end) as u_5_w, sum(case when (m_5_w & 1048575) <> 0 then v_5_w else 0 end) as v_5_w, sum(case when length(replace((m_5_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_5_w,
        sum(case when (m_5_m & 4095) <> 0 then 1 else 0 end) as u_5_m, sum(case when (m_5_m & 4095) <> 0 then v_5_m else 0 end) as v_5_m, sum(case when length(replace((m_5_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end) as r_5_m,
        sum(case when (m_5_q & 255) <> 0 then 1 else 0 end) as u_5_q, sum(case when (m_5_q & 255) <> 0 then v_5_q else 0 end) as v_5_q, sum(case when length(replace((m_5_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end) as r_5_q,
        sum(case when (m_6_d & 1073741823) <> 0 then 1 else 0 end) as u_6_d, sum(case when (m_6_d & 1073741823) <> 0 then v_6_d else 0 end) as v_6_d, sum(case when length(replace((m_6_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_6_d,
        sum(case when (m_6_w & 1048575) <> 0 then 1 else 0 end) as u_6_w, sum(case when (m_6_w & 1048575) <> 0 then v_6_w else 0 end) as v_6_w, sum(case when length(replace((m_6_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_6_w,
        sum(case when (m_6_m & 4095) <> 0 then 1 else 0 end) as u_6_m, sum(case when (m_6_m & 4095) <> 0 then v_6_m else 0 end) as v_6_m, sum(case when length(replace((m_6_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end) as r_6_m,
        sum(case when (m_6_q & 255) <> 0 then 1 else 0 end) as u_6_q, sum(case when (m_6_q & 255) <> 0 then v_6_q else 0 end) as v_6_q, sum(case when length(replace((m_6_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end) as r_6_q,
        sum(case when (m_7_d & 1073741823) <> 0 then 1 else 0 end) as u_7_d, sum(case when (m_7_d & 1073741823) <> 0 then v_7_d else 0 end) as v_7_d, sum(case when length(replace((m_7_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_7_d,
        sum(case when (m_7_w & 1048575) <> 0 then 1 else 0 end) as u_7_w, sum(case when (m_7_w & 1048575) <> 0 then v_7_w else 0 end) as v_7_w, sum(case when length(replace((m_7_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_7_w,
        sum(case when (m_7_m & 4095) <> 0 then 1 else 0 end) as u_7_m, sum(case when (m_7_m & 4095) <> 0 then v_7_m else 0 end) as v_7_m, sum(case when length(replace((m_7_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end) as r_7_m,
        sum(case when (m_7_q & 255) <> 0 then 1 else 0 end) as u_7_q, sum(case when (m_7_q & 255) <> 0 then v_7_q else 0 end) as v_7_q, sum(case when length(replace((m_7_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end) as r_7_q
from vz
distributed by (ak0);
analyze usr_cross_data.pa_cat_aud;
