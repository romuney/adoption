-- ==============================================================================================================
-- Helicopter-нода 844437 · НОВЫЙ gp-параграф 3 из 3: «PA · ускорение 3/3 — каталог — готовые строки» (2026-10-23)
-- Вставить ЦЕЛИКОМ одним gp-параграфом в КОНЕЦ ноды — после всех существующих параграфов, включая выгрузку.
-- Порядок новых параграфов: 1a → 1b → 1c → 2a (python, выгрузка). Таблицы — без схемы, как collection_array /
-- period_agg этой ноды: их забирает выгрузка 2a, борды GP не читают. Сбой здесь не мешает старым витринам — они уже
-- выгружены выше по ноде.
-- Читает: usr_cross_data.pa_pair, pa_pair_acc, pa_dash_meta и pa_md, pa_staffx из параграфа 1.
-- ==============================================================================================================

-- ---- витрина «PA · каталог — строки отчётов» → pa_cat_rep
-- Строки вкладки «Отчёты» каталога, когда людских условий нет (ни фильтра «Кто смотрит», ни ЦА по условиям, ни своего
-- периода) — так открывается борд и так он пересчитывается на период и переключатели. Строка — отчёт × exc (1 — без
-- владельцев отчёта). n — зрителей, l — дней с последнего визита, h4…h1 — ритм (Daily / Weekly / Monthly / Rare);
-- по периодам (_d / _w / _m / _q): u — пользователей, v — просмотров, r — постоянных, a — из них в ЦА по правам.
drop table if exists pa_cat_rep;
create table pa_cat_rep as
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
),
ex as (select 0 as exc union all select 1)
select e.exc, p.dashboard_id, count(*) as n, (max(x.md)::date - max(p.dmax)::date) as l,
        sum(case when p.rc = 4 then 1 else 0 end) as h4, sum(case when p.rc = 3 then 1 else 0 end) as h3, sum(case when p.rc = 2 then 1 else 0 end) as h2, sum(case when p.rc = 1 then 1 else 0 end) as h1,
        sum(case when (p.m_d & 1073741823) <> 0 then 1 else 0 end) as u_d, sum(p.v_d) as v_d, sum(case when length(replace((p.m_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_d, sum(case when (p.m_d & 1073741823) <> 0 and p.acc = 1 then 1 else 0 end) as a_d,
        sum(case when (p.m_w & 1048575) <> 0 then 1 else 0 end) as u_w, sum(p.v_w) as v_w, sum(case when length(replace((p.m_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_w, sum(case when (p.m_w & 1048575) <> 0 and p.acc = 1 then 1 else 0 end) as a_w,
        sum(case when (p.m_m & 4095) <> 0 then 1 else 0 end) as u_m, sum(p.v_m) as v_m, sum(case when length(replace((p.m_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end) as r_m, sum(case when (p.m_m & 4095) <> 0 and p.acc = 1 then 1 else 0 end) as a_m,
        sum(case when (p.m_q & 255) <> 0 then 1 else 0 end) as u_q, sum(p.v_q) as v_q, sum(case when length(replace((p.m_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end) as r_q, sum(case when (p.m_q & 255) <> 0 and p.acc = 1 then 1 else 0 end) as a_q
from p cross join ex e cross join pa_md x
where e.exc = 0 or p.own = 0
group by e.exc, p.dashboard_id
distributed by (dashboard_id);
analyze pa_cat_rep;

-- ---- витрина «PA · каталог — владельцы, коллекции, ИТОГО» → pa_cat_grp
-- Строки вкладок «Владельцы», «Коллекции» и ИТОГО каталога без людских условий: kd = 0 — ИТОГО, 2 — владелец (каждый
-- из владельцев отчёта), 3 — коллекция; строка — ключ × сочетание переключателей шапки (pub, act, exc). n — людей,
-- l — дней с последнего визита, по периодам u / v / r — пользователи / просмотры / постоянные. Человек строки —
-- логин с объединёнными визитами во все её отчёты (как в SQL каталога).
drop table if exists pa_cat_grp;
create table pa_cat_grp as
with ox as (select dashboard_id, unnest(owners_string) as x from usr_cross_data.pa_dash_meta),
oz as (select dashboard_id, bool_or(coalesce(x, '') <> '') as ne from ox group by dashboard_id),
own as (    -- владельцы отчёта: все из owners_string (без пустых, латиница — строчными, без повторов), пусто — автор owner_login
    select o.dashboard_id, translate(trim(coalesce(o.x, '')), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') as o from ox o inner join oz z on z.dashboard_id = o.dashboard_id where z.ne
    union
    select m.dashboard_id, translate(trim(coalesce(m.owner_login, '')), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') from usr_cross_data.pa_dash_meta m
    left join oz z on z.dashboard_id = m.dashboard_id where coalesce(z.ne, false) = false
),
cb as (    -- 8 сочетаний переключателей «Считать» шапки
    select a.pub, b.act, c.exc
    from (select 0 as pub union all select 1) a cross join (select 0 as act union all select 1) b
    cross join (select 0 as exc union all select 1) c
),
k as (
    select dashboard_id, 0 as kd, ''::text as k0 from usr_cross_data.pa_dash_meta
    union all
    select dashboard_id, 2, o from own where o <> ''
    union all
    select dashboard_id, 3, c from (select dashboard_id, unnest(collection_names)::text as c from usr_cross_data.pa_dash_meta) z where coalesce(c, '') <> ''
),
lk as (    -- человек × строка × сочетание: маски и просмотры по всем его отчётам строки
    select c.pub, c.act, c.exc, k.kd, k.k0, p.login, max(p.dmax) as dmax,
        bit_or(coalesce(p.msk_d, 0)) as m_d, sum(coalesce(p.v_d, 0)) as v_d,
        bit_or(coalesce(p.msk_w, 0)) as m_w, sum(coalesce(p.v_w, 0)) as v_w,
        bit_or(coalesce(p.msk_m, 0)) as m_m, sum(coalesce(p.v_m, 0)) as v_m,
        bit_or(coalesce(p.msk_q, 0)) as m_q, sum(coalesce(p.v_q, 0)) as v_q
    from usr_cross_data.pa_pair p
    inner join usr_cross_data.pa_dash_meta m on m.dashboard_id = p.dashboard_id
    inner join k on k.dashboard_id = p.dashboard_id
    inner join cb c on (c.pub = 0 or m.published = 1) and (c.act = 0 or m.actual_flg = 1) and (c.exc = 0 or coalesce(p.own_flg, 0) = 0)
    where p.login is not null
    group by c.pub, c.act, c.exc, k.kd, k.k0, p.login
)
select pub, act, exc, kd, k0, count(*) as n, (max(x.md)::date - max(dmax)::date) as l,
        sum(case when (m_d & 1073741823) <> 0 then 1 else 0 end) as u_d, sum(v_d) as v_d, sum(case when length(replace((m_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_d,
        sum(case when (m_w & 1048575) <> 0 then 1 else 0 end) as u_w, sum(v_w) as v_w, sum(case when length(replace((m_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_w,
        sum(case when (m_m & 4095) <> 0 then 1 else 0 end) as u_m, sum(v_m) as v_m, sum(case when length(replace((m_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end) as r_m,
        sum(case when (m_q & 255) <> 0 then 1 else 0 end) as u_q, sum(v_q) as v_q, sum(case when length(replace((m_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end) as r_q
from lk cross join pa_md x
group by pub, act, exc, kd, k0
distributed by (k0);
analyze pa_cat_grp;

-- ---- витрина «PA · каталог — аудитория» → pa_cat_aud
-- Вкладка «Аудитория» каталога без людских условий: разрез ad (o — оргструктура, s — специализация, t — стрим, q — HQ,
-- i — IT, h — руководители) × значение ak0 (у o — путь, ap — путь уровнем выше) × сочетание (pub, act, exc):
-- staff — людей штата, по периодам u / v / r — заходило / их просмотров / постоянных. Строка ad = 'all' — все зрители
-- периода (и не сотрудники).
drop table if exists pa_cat_aud;
create table pa_cat_aud as
with cb as (    -- 8 сочетаний переключателей «Считать» шапки
    select a.pub, b.act, c.exc
    from (select 0 as pub union all select 1) a cross join (select 0 as act union all select 1) b
    cross join (select 0 as exc union all select 1) c
),
vz as (    -- зритель (логин строчными, как vz каталога) × сочетание: маски и просмотры по всем отчётам
    select c.pub, c.act, c.exc, translate(p.login, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') as vl,
        bit_or(coalesce(p.msk_d, 0)) as m_d, sum(coalesce(p.v_d, 0)) as v_d,
        bit_or(coalesce(p.msk_w, 0)) as m_w, sum(coalesce(p.v_w, 0)) as v_w,
        bit_or(coalesce(p.msk_m, 0)) as m_m, sum(coalesce(p.v_m, 0)) as v_m,
        bit_or(coalesce(p.msk_q, 0)) as m_q, sum(coalesce(p.v_q, 0)) as v_q
    from usr_cross_data.pa_pair p
    inner join usr_cross_data.pa_dash_meta m on m.dashboard_id = p.dashboard_id
    inner join cb c on (c.pub = 0 or m.published = 1) and (c.act = 0 or m.actual_flg = 1) and (c.exc = 0 or coalesce(p.own_flg, 0) = 0)
    where p.login is not null
    group by c.pub, c.act, c.exc, translate(p.login, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')
),
sx as (    -- сотрудник × сочетание: заходил ли в периоде (u), его просмотры (w), постоянный ли (r)
    select c.pub, c.act, c.exc, s.slv, s.sol, s.sp, s.st, s.hqc, s.itc, s.hdf,
        case when (z.m_d & 1073741823) <> 0 then 1 else 0 end as u_d, case when (z.m_d & 1073741823) <> 0 then z.v_d else 0 end as w_d, case when length(replace((z.m_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end as r_d,
        case when (z.m_w & 1048575) <> 0 then 1 else 0 end as u_w, case when (z.m_w & 1048575) <> 0 then z.v_w else 0 end as w_w, case when length(replace((z.m_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end as r_w,
        case when (z.m_m & 4095) <> 0 then 1 else 0 end as u_m, case when (z.m_m & 4095) <> 0 then z.v_m else 0 end as w_m, case when length(replace((z.m_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end as r_m,
        case when (z.m_q & 255) <> 0 then 1 else 0 end as u_q, case when (z.m_q & 255) <> 0 then z.v_q else 0 end as w_q, case when length(replace((z.m_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end as r_q
    from pa_staffx s
    cross join cb c
    left join vz z on z.vl = s.login and z.pub = c.pub and z.act = c.act and z.exc = c.exc
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
select pub, act, exc, ad, ak0, ap, count(*)::bigint as staff,
        sum(u_d) as u_d, sum(w_d) as v_d, sum(r_d) as r_d,
        sum(u_w) as u_w, sum(w_w) as v_w, sum(r_w) as r_w,
        sum(u_m) as u_m, sum(w_m) as v_m, sum(r_m) as r_m,
        sum(u_q) as u_q, sum(w_q) as v_q, sum(r_q) as r_q
from ky
group by pub, act, exc, ad, ak0, ap
union all
select pub, act, exc, 'all', '*', '', 0,
        sum(case when (m_d & 1073741823) <> 0 then 1 else 0 end) as u_d, sum(case when (m_d & 1073741823) <> 0 then v_d else 0 end) as v_d, sum(case when length(replace((m_d & 1073741823)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_d,
        sum(case when (m_w & 1048575) <> 0 then 1 else 0 end) as u_w, sum(case when (m_w & 1048575) <> 0 then v_w else 0 end) as v_w, sum(case when length(replace((m_w & 1048575)::bit(64)::text, '0', '')) >= 6 then 1 else 0 end) as r_w,
        sum(case when (m_m & 4095) <> 0 then 1 else 0 end) as u_m, sum(case when (m_m & 4095) <> 0 then v_m else 0 end) as v_m, sum(case when length(replace((m_m & 4095)::bit(64)::text, '0', '')) >= 4 then 1 else 0 end) as r_m,
        sum(case when (m_q & 255) <> 0 then 1 else 0 end) as u_q, sum(case when (m_q & 255) <> 0 then v_q else 0 end) as v_q, sum(case when length(replace((m_q & 255)::bit(64)::text, '0', '')) >= 3 then 1 else 0 end) as r_q
from vz
group by pub, act, exc
distributed by (ak0);
analyze pa_cat_aud;
