"""Генератор ЧАСТИ 3 файла 1 поставки (витрины ускорения): пишет её в файл 1 вместо прежней. Выражения, повторяющие
макросы датасетов (cz — компактная кириллица, fx, правило «пустого» уровня УС ou), собираются здесь в одном месте.
    python3 .stand/gp_part3.py && python3 .stand/check_gp.py --build
"""
import json, os, re
D = os.path.dirname(os.path.abspath(__file__))
F = os.path.join(os.path.dirname(D), 'Единый лист — поставка 2026-10-23 (ускорение через GP)', '1. GP — все витрины листа (параграфы Helicopter по порядку).sql')
cs = json.load(open(os.path.join(D, 'punct_ch248.json')))
PSET = ',\n        '.join(','.join(map(str, cs[i:i + 24])) for i in range(0, len(cs), 24))
CYR = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя'
TGT = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'
def cz(x):
    return ("translate(regexp_replace(replace(replace(replace(replace(translate(" + x + r", E'\t\n\r', '   '), '~', '~~'), '|', '~p'), "
            r"'^', '~c'), '`', '~b'), '([А-Яа-яЁё][А-Яа-яЁё ]*)', E'`\\1`', 'g'), '" + CYR + "', '" + TGT + "')")
def alow(x):   # lower() ClickHouse — только латиница (кириллицу не трогает); PG lower — весь Юникод
    return f"translate({x}, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')"
def fx(x):
    return "translate(" + x + r", E'|\t\n\r', '    ')"
def nz(c):   # уровень УС: из одних «пустых» знаков — пусто (класс символов pu.re: регулярка компилируется один раз;
    # translate с набором из 850 знаков перебирал набор на каждый символ — минуты на штат)
    return f"case when {c} ~ pu.re then ''::text else {c} end"
def olx(p):
    return (f"case when {p}3 = '' then 0 when {p}4 = '' then 1 when {p}5 = '' then 2 when {p}6 = '' then 3 "
            f"when {p}7 = '' then 4 else 5 end")
PU = f"""pu as (    -- «пустые» знаки уровня УС: ровно те, что ClickHouse 24.8 считает пустыми в '^(?:\\s|\\p{{P}})*$'
    -- (пробел, \\t \\n \\f \\r и знаки препинания Юникода; список снят с ClickHouse, коды символов)
    -- «^[…]*$»: знаки «-», «[», «\\», «]», «^» внутри класса — через обратную косую (chr(92))
    select '^[' || string_agg(case when c in (45, 91, 92, 93, 94) then chr(92) || chr(c) else chr(c) end, '') || ']*$' as re from unnest(array[
        {PSET}]) c
)"""
part = f"""

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

-- ---------------------------------------------------------------------------
-- Параграф «PA · словарь кодов» → usr_cross_data.pa_dict   (НОВЫЙ 2026-10-23)
-- Коды значений специализации / стрима / стажа / HQ / IT (штат ∪ атрибуты зрителей): код = номер значения
-- по порядку байтов (как сортирует ClickHouse), с 1. В ответе панели вместо названий — коды (3 цифры вместо
-- «Специализации» в \\uXXXX), раньше словарь собирался на каждый клик.
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
with {PU},
l as (select distinct login from usr_cross_data.pa_pair where login is not null),
x as (
    select l.login::text as login, {alow('l.login')}::text as lg,
        case when s.login is null then 0 else 1 end as stf,
        coalesce(s.hq_code, '')::text as hq, coalesce(s.it_code, '')::text as it,
        coalesce(a.lvl3_management_unit_nm, '')::text as a3, coalesce(a.lvl4_management_unit_nm, '')::text as a4_,
        coalesce(a.lvl5_management_unit_nm, '')::text as a5, coalesce(a.lvl6_management_unit_nm, '')::text as a6,
        coalesce(a.lvl7_management_unit_nm, '')::text as a7,
        coalesce(a.emp_specialization_desc, '')::text as spec, coalesce(a.emp_stream_desc, '')::text as stream,
        case when coalesce(a.management_head_flg, 0) = 1 then 1 else 0 end as is_head,
        coalesce(a.fio, '')::text as fio, coalesce(a.exp_nm, '')::text as exp_nm
    from l
    left join usr_cross_data.pa_staff s on s.login = {alow('l.login')}
    left join usr_cross_data.pa_emp_attrs a on a.login = l.login
),
n as (
    select x.*, {nz('a3')} as n3, {nz('a4_')} as n4, {nz('a5')} as n5,
        {nz('a6')} as n6, {nz('a7')} as n7
    from x cross join pu
),
o as (select n.*, {olx('n')} as ol from n)
select o.login, o.lg, o.stf, coalesce(c.a4, 0) as a4,
    array[o.n3, o.n4, o.n5, o.n6, o.n7] as lv, o.ol,
    array_to_string((array[o.n3, o.n4, o.n5, o.n6, o.n7])[1:o.ol], ' › ') as opath,
    o.spec, o.stream, o.is_head,
    {fx('o.login')} || '|' || {cz('o.fio')} || '|' || ds.code || '|' || dt.code || '|' || de.code as pl_a,
    dq.code || '|' || di.code as pl_b
from o
left join usr_cross_data.pa_acc_any c on c.lg = o.lg
inner join usr_cross_data.pa_dict ds on ds.g = 'spec' and ds.v = o.spec
inner join usr_cross_data.pa_dict dt on dt.g = 'stream' and dt.v = o.stream
inner join usr_cross_data.pa_dict de on de.g = 'exp' and de.v = o.exp_nm
inner join usr_cross_data.pa_dict dq on dq.g = 'hq' and dq.v = o.hq
inner join usr_cross_data.pa_dict di on di.g = 'it' and di.v = o.it
distributed by (login);

-- ---------------------------------------------------------------------------
-- Параграф «PA · штат — готовые атрибуты» → usr_cross_data.pa_staffx   (НОВЫЙ 2026-10-23)
-- Строка на сотрудника pa_staff: атрибуты для условий ЦА и разрезов «Аудитории» (путь оргструктуры — по тому же
-- правилу, что у зрителей), флаги доступа a4 и готовые куски строк «не заходили из ЦА» (поимённо и свёрткой).
-- Раньше каталог, панель и шапка нормализовали оргструктуру всего штата регуляркой на каждый запрос.
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_staffx;
create table usr_cross_data.pa_staffx as
with {PU},
x as (
    select {alow('s.login')}::text as login,
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
    select x.*, {nz('a3')} as n3, {nz('a4_')} as n4, {nz('a5')} as n5,
        {nz('a6')} as n6, {nz('a7')} as n7
    from x cross join pu
),
o as (select n.*, {olx('n')} as ol from n)
select o.login, coalesce(c.a4, 0) as a4,
    array[o.n3, o.n4, o.n5, o.n6, o.n7] as slv, o.ol as sol,
    array_to_string((array[o.n3, o.n4, o.n5, o.n6, o.n7])[1:o.ol], ' › ') as op,
    o.sp, o.st, o.hqc, o.itc, o.hdf,
    {fx('o.login')} || '|' || {cz('o.fio')} || '|' || ds.code || '|' || dt.code || '|' || o.hdf || '|' || dq.code || '|' || di.code as n_a,
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
"""
GR = [('d', 30, 6), ('w', 20, 6), ('m', 12, 4), ('q', 8, 3)]     # период, шагов n, «постоянный» — от REG активных шагов
CUR = {g: 2 ** n - 1 for g, n, _ in GR}
REG = {g: r for g, _, r in GR}
def pc(x):   # число единичных битов (bit_count в GP6 нет)
    return f"length(replace(({x})::bit(64)::text, '0', ''))"
def join_(items, sep=',\n        '):
    return sep.join(items)
G = [g for g, _, _ in GR]
# Сочетания переключателей шапки — СТРОКИ (pub, act, exc = 0/1: «только опубликованные», «только актуальные», «без
# владельцев»), а не номера в именах колонок; периоды — колонки _d / _w / _m / _q. Пара входит в сочетание по CB_ON.
CB = """cb as (    -- 8 сочетаний переключателей «Считать» шапки
    select a.pub, b.act, c.exc
    from (select 0 as pub union all select 1) a cross join (select 0 as act union all select 1) b
    cross join (select 0 as exc union all select 1) c
)"""
CB_ON = "(c.pub = 0 or m.published = 1) and (c.act = 0 or m.actual_flg = 1) and (c.exc = 0 or coalesce(p.own_flg, 0) = 0)"
def cur(x, g):   # заходил в периоде g (маска текущего окна не пуста)
    return f"({x} & {CUR[g]}) <> 0"
def reg(x, g):   # «постоянный»: активных шагов в окне ≥ REG
    return f"{pc(f'{x} & {CUR[g]}')} >= {REG[g]}"
masks = join_([f"bit_or(coalesce(p.msk_{g}, 0)) as m_{g}, sum(coalesce(p.v_{g}, 0)) as v_{g}" for g in G])
mets = join_([f"sum(case when {cur('m_' + g, g)} then 1 else 0 end) as u_{g}, sum(v_{g}) as v_{g}, "
              f"sum(case when {reg('m_' + g, g)} then 1 else 0 end) as r_{g}" for g in G])
OWN = f"""ox as (select dashboard_id, unnest(owners_string) as x from usr_cross_data.pa_dash_meta),
oz as (select dashboard_id, bool_or(coalesce(x, '') <> '') as ne from ox group by dashboard_id),
own as (    -- владельцы отчёта: все из owners_string (без пустых, латиница — строчными, без повторов), пусто — автор owner_login
    select o.dashboard_id, {alow("trim(coalesce(o.x, ''))")} as o from ox o inner join oz z on z.dashboard_id = o.dashboard_id where z.ne
    union
    select m.dashboard_id, {alow("trim(coalesce(m.owner_login, ''))")} from usr_cross_data.pa_dash_meta m
    left join oz z on z.dashboard_id = m.dashboard_id where coalesce(z.ne, false) = false
)"""
part += f"""
-- ---------------------------------------------------------------------------
-- Параграф «PA · каталог — строки отчётов» → usr_cross_data.pa_cat_rep   (НОВЫЙ 2026-10-23)
-- Строки вкладки «Отчёты» каталога, когда людских условий нет (ни фильтра «Кто смотрит», ни ЦА по условиям, ни своего
-- периода) — так открывается борд и так он пересчитывается на период и переключатели. Строка — отчёт × exc (1 — без
-- владельцев отчёта). n — зрителей, l — дней с последнего визита, h4…h1 — ритм (Daily / Weekly / Monthly / Rare);
-- по периодам (_d / _w / _m / _q): u — пользователей, v — просмотров, r — постоянных, a — из них в ЦА по правам.
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_cat_rep;
create table usr_cross_data.pa_cat_rep as
with p as (
    select p.dashboard_id, coalesce(p.own_flg, 0) as own, p.dmax,
        {join_([f"coalesce(p.msk_{g}, 0) as m_{g}, coalesce(p.v_{g}, 0) as v_{g}" for g in G])},
        case when {pc('coalesce(p.msk_d, 0) & 1073741823')} >= 12 then 4 when {pc('coalesce(p.msk_w, 0) & 255')} >= 6 then 3
             when {pc('coalesce(p.msk_m, 0) & 7')} >= 2 then 2 when (coalesce(p.msk_m, 0) & 7) <> 0 then 1 else 0 end as rc,
        case when a.login is null then 0 else 1 end as acc
    from usr_cross_data.pa_pair p
    left join usr_cross_data.pa_pair_acc a on a.dashboard_id = p.dashboard_id and a.login = {alow('p.login')}
    where p.login is not null
),
ex as (select 0 as exc union all select 1)
select e.exc, p.dashboard_id, count(*) as n, (max(x.md)::date - max(p.dmax)::date) as l,
        {', '.join(f"sum(case when p.rc = {r} then 1 else 0 end) as h{r}" for r in (4, 3, 2, 1))},
        {join_([f"sum(case when {cur('p.m_' + g, g)} then 1 else 0 end) as u_{g}, sum(p.v_{g}) as v_{g}, "
                f"sum(case when {reg('p.m_' + g, g)} then 1 else 0 end) as r_{g}, "
                f"sum(case when {cur('p.m_' + g, g)} and p.acc = 1 then 1 else 0 end) as a_{g}" for g in G])}
from p cross join ex e cross join usr_cross_data.pa_md x
where e.exc = 0 or p.own = 0
group by e.exc, p.dashboard_id
distributed by (dashboard_id);

-- ---------------------------------------------------------------------------
-- Параграф «PA · каталог — владельцы, коллекции, ИТОГО» → usr_cross_data.pa_cat_grp   (НОВЫЙ 2026-10-23)
-- Строки вкладок «Владельцы», «Коллекции» и ИТОГО каталога без людских условий: kd = 0 — ИТОГО, 2 — владелец (каждый
-- из владельцев отчёта), 3 — коллекция; строка — ключ × сочетание переключателей шапки (pub, act, exc). n — людей,
-- l — дней с последнего визита, по периодам u / v / r — пользователи / просмотры / постоянные. Человек строки —
-- логин с объединёнными визитами во все её отчёты (как в SQL каталога).
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_cat_grp;
create table usr_cross_data.pa_cat_grp as
with {OWN},
{CB},
k as (
    select dashboard_id, 0 as kd, ''::text as k0 from usr_cross_data.pa_dash_meta
    union all
    select dashboard_id, 2, o from own where o <> ''
    union all
    select dashboard_id, 3, c from (select dashboard_id, unnest(collection_names)::text as c from usr_cross_data.pa_dash_meta) z where coalesce(c, '') <> ''
),
lk as (    -- человек × строка × сочетание: маски и просмотры по всем его отчётам строки
    select c.pub, c.act, c.exc, k.kd, k.k0, p.login, max(p.dmax) as dmax,
        {masks}
    from usr_cross_data.pa_pair p
    inner join usr_cross_data.pa_dash_meta m on m.dashboard_id = p.dashboard_id
    inner join k on k.dashboard_id = p.dashboard_id
    inner join cb c on {CB_ON}
    where p.login is not null
    group by c.pub, c.act, c.exc, k.kd, k.k0, p.login
)
select pub, act, exc, kd, k0, count(*) as n, (max(x.md)::date - max(dmax)::date) as l,
        {mets}
from lk cross join usr_cross_data.pa_md x
group by pub, act, exc, kd, k0
distributed by (k0);

-- ---------------------------------------------------------------------------
-- Параграф «PA · каталог — аудитория» → usr_cross_data.pa_cat_aud   (НОВЫЙ 2026-10-23)
-- Вкладка «Аудитория» каталога без людских условий: разрез ad (o — оргструктура, s — специализация, t — стрим, q — HQ,
-- i — IT, h — руководители) × значение ak0 (у o — путь, ap — путь уровнем выше) × сочетание (pub, act, exc):
-- staff — людей штата, по периодам u / v / r — заходило / их просмотров / постоянных. Строка ad = 'all' — все зрители
-- периода (и не сотрудники).
-- ---------------------------------------------------------------------------
drop table if exists usr_cross_data.pa_cat_aud;
create table usr_cross_data.pa_cat_aud as
with {CB},
vz as (    -- зритель (логин строчными, как vz каталога) × сочетание: маски и просмотры по всем отчётам
    select c.pub, c.act, c.exc, {alow('p.login')} as vl,
        {masks}
    from usr_cross_data.pa_pair p
    inner join usr_cross_data.pa_dash_meta m on m.dashboard_id = p.dashboard_id
    inner join cb c on {CB_ON}
    where p.login is not null
    group by c.pub, c.act, c.exc, {alow('p.login')}
),
sx as (    -- сотрудник × сочетание: заходил ли в периоде (u), его просмотры (w), постоянный ли (r)
    select c.pub, c.act, c.exc, s.slv, s.sol, s.sp, s.st, s.hqc, s.itc, s.hdf,
        {join_([f"case when {cur('z.m_' + g, g)} then 1 else 0 end as u_{g}, case when {cur('z.m_' + g, g)} then z.v_{g} else 0 end as w_{g}, "
                f"case when {reg('z.m_' + g, g)} then 1 else 0 end as r_{g}" for g in G])}
    from usr_cross_data.pa_staffx s
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
        {join_([f"sum(u_{g}) as u_{g}, sum(w_{g}) as v_{g}, sum(r_{g}) as r_{g}" for g in G])}
from ky
group by pub, act, exc, ad, ak0, ap
union all
select pub, act, exc, 'all', '*', '', 0,
        {join_([f"sum(case when {cur('m_' + g, g)} then 1 else 0 end) as u_{g}, sum(case when {cur('m_' + g, g)} then v_{g} else 0 end) as v_{g}, "
                f"sum(case when {reg('m_' + g, g)} then 1 else 0 end) as r_{g}" for g in G])}
from vz
group by pub, act, exc
distributed by (ak0);
"""
# статистика сразу после создания: без неё планировщик видит в новой таблице 0 строк и выбирает перебор (стенд PG:
# зрители 15 мин → 2,4 с). В Greenplum CTAS обычно собирает её сам (gp_autostats_mode), analyze — на случай, если нет.
def _an(m):
    return m.group(0) + f"\nanalyze usr_cross_data.{m.group(1)};"
part = re.sub(r'create table usr_cross_data\.(\w+) as(?:.|\n)*?\ndistributed[^;]*;', _an, part)
# ---- раскладка на параграфы Helicopter (владелец 26.10: таблицы без схемы, как collection_array / period_agg этой ноды;
#      не один огромный параграф и не десять мелких — три gp-параграфа и отдельная выгрузка) ----
NEW = ['pa_md', 'pa_dict', 'pa_acc_any', 'pa_viewer', 'pa_staffx', 'pa_dash_day', 'pa_all_day', 'pa_cat_rep', 'pa_cat_grp', 'pa_cat_aud']
TEMP = {'pa_acc_any'}   # служебная: нужна только внутри параграфа 1 — temp-таблица сессии, в ClickHouse не едет
blocks = {}
for m in re.finditer(r'-- -{20,}\n-- Параграф «([^»]*)» → usr_cross_data\.(\w+)[^\n]*\n((?:--[^\n]*\n)*?)-- -{20,}\n(.*?)(?=\n-- -{20,}\n-- Параграф|\Z)', part, re.S):
    title, name, doc, body = m.group(1), m.group(2), m.group(3), m.group(4).strip('\n')
    for n in NEW:
        body = re.sub(r'usr_cross_data\.' + n + r'\b', n, body)
    if name in TEMP:
        body = body.replace(f'create table {name} as', f'create temp table {name} as')
        doc = doc.replace('; в ClickHouse НЕ выгружается)', '; temp-таблица параграфа, в ClickHouse не выгружается)')
    blocks[name] = f"-- ---- витрина «{title}» → {name}{' (temp)' if name in TEMP else ''}\n{doc}{body}\n"
assert list(blocks) == NEW, list(blocks)
GROUPS = [('1a', '1 из 3', 'люди, коды, дата свежести', ['pa_md', 'pa_dict', 'pa_acc_any', 'pa_viewer', 'pa_staffx'],
           'usr_cross_data.pa_pair, pa_staff, pa_emp_attrs, pa_dash_meta, pa_dash_acl, pa_adg_member'),
          ('1b', '2 из 3', 'календари по дням', ['pa_dash_day', 'pa_all_day'],
           'usr_cross_data.pa_evd_day, pa_pair, pa_dash_meta'),
          ('1c', '3 из 3', 'каталог — готовые строки', ['pa_cat_rep', 'pa_cat_grp', 'pa_cat_aud'],
           'usr_cross_data.pa_pair, pa_pair_acc, pa_dash_meta и pa_md, pa_staffx из параграфа 1')]
FILES = {}
for code, num, what, names, reads in GROUPS:
    head = f"""-- ==============================================================================================================
-- Helicopter-нода 844437 · НОВЫЙ gp-параграф {num}: «PA · ускорение {num.split()[0]}/3 — {what}» (2026-10-23)
-- Вставить ЦЕЛИКОМ одним gp-параграфом в КОНЕЦ ноды — после всех существующих параграфов, включая выгрузку.
-- Порядок новых параграфов: 1a → 1b → 1c → 2a (python, выгрузка). Таблицы — без схемы, как collection_array /
-- period_agg этой ноды: их забирает выгрузка 2a, борды GP не читают. Сбой здесь не мешает старым витринам — они уже
-- выгружены выше по ноде.
-- Читает: {reads}.
-- ==============================================================================================================

"""
    FILES[f"{code}. GP — новый параграф {num} ({what}).sql"] = head + '\n'.join(blocks[n] for n in names)
DIRN = os.path.dirname(F)
for old in os.listdir(DIRN):
    if re.match(r'1[abc]\. GP — новый параграф', old) and old not in FILES:
        os.remove(os.path.join(DIRN, old))
for fn, txt in FILES.items():
    open(os.path.join(DIRN, fn), 'w', encoding='utf-8').write(txt)
# файл 1: части 1–2 как были + указатель на новые параграфы
src = open(F, encoding='utf-8').read()
i = src.find('\n\n-- ############################################################################################################\n-- ЧАСТЬ 3.')
if i >= 0:
    src = src[:i]
src = src.rstrip('\n') + """


-- ############################################################################################################
-- ЧАСТЬ 3. Витрины ускорения (2026-10-23) — ОТДЕЛЬНЫМИ ФАЙЛАМИ этой папки, по файлу на gp-параграф:
--   1a. GP — новый параграф 1 из 3 (люди, коды, дата свежести)
--   1b. GP — новый параграф 2 из 3 (календари по дням)
--   1c. GP — новый параграф 3 из 3 (каталог — готовые строки)
--   2a. Python — выгрузка новых витрин (отдельный параграф)
-- В конец ноды, после существующей выгрузки, в этом порядке. Части 1–2 выше не меняются.
-- ############################################################################################################
"""
open(F, 'w', encoding='utf-8').write(src)
print('параграфы:', ', '.join(f'{k} — {len(v) // 1024} КБ' for k, v in FILES.items()))
