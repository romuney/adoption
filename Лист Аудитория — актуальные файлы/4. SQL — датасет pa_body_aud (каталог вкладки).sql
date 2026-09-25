{#- pa_cube v7 — тело «Отчёты» (чарт 788805): каталог отчётов / коллекций / владельцев + ИТОГО.
    Источник — предагрегат пар prod_proteus.pa_pair (GP-параграф «PA · пары отчёт×логин»):
    у пары «отчёт × логин» уже лежат 64-битная маска активных бакетов, суммы окна и v_life
    для всех 4 грануляций; дневной факт куб не читает вовсе.
    Слушает: полоску (period_param, pub_f/act_f/exc_f) и людскую шину правой панели
    (lvl3_f/lvl4_f/stream_f/spec_f/adg_f/heads_f/org_f/login_f/exl_f/freq_f). Выбор каталога
    (mode_param/sel_f) НЕ читает — самовлияние тела выключено.
    Линейная цепочка maxd → dash_ok → evd → kx → agg → выход; каждый CTE — одна ссылка
    (dash_ok — справочник 32 тыс. строк).
    Ответ — 17 колонок (+ ca_n, ca_wide, ca_users при WITH_CA); KPI области считает правая панель (pa_people). -#}
{% set GRAINS = {'d': {'n': 30, 'u': 'day', 'sf': 'toStartOfDay'}, 'w': {'n': 20, 'u': 'week', 'sf': 'toMonday'}, 'm': {'n': 12, 'u': 'month', 'sf': 'toStartOfMonth'}, 'q': {'n': 8, 'u': 'quarter', 'sf': 'toStartOfQuarter'}} %}
{% set grain = filter_values('period_param')|first|default('d', true) %}
{% set grain = grain if grain in GRAINS else 'd' %}
{% set g = GRAINS[grain] %}
{% set CUR = 2 ** g.n - 1 %}
{% set WITH_CA = true %}{#- true — у датасета каталога вкладки «Аудитория»: +2 колонки ca_n / ca_wide (ЦА отчёта по правам
    из pa_dash_ca, поставка 2026-09-24). У каталога «Отчётов» — false: ответ прежний, pa_dash_ca не нужна. -#}
{% set REG = {'d': 6, 'w': 6, 'm': 4, 'q': 3}[grain] %}{#- «постоянный» = корзины частоты 3–4 (≥ FBIN[1]+1 активных периодов): 6 дней/недель, 4 месяца, 3 квартала — как сегмент «Постоянный» в «Кто смотрит» -#}
{% set PREV = 2 ** (2 * g.n) - 1 - CUR %}
{% macro q(values) -%}
{%- set out = [] -%}
{%- for v in values -%}{%- set _ = out.append(v|string|replace('\\', '\\\\')) -%}{%- endfor -%}
{{- out|where_in -}}
{%- endmacro %}
{#- Массив-литерал для has/hasAny: where_in даёт кортеж ('a', 'b') или скаляр ('a'), а hasAny ждёт массив. -#}
{% macro qa(values) -%}[{{ q(values)[1:-1] }}]{%- endmacro %}
{% macro jes(s) -%}{{ s|string|replace('\\', '\\\\')|replace('"', '\\"')|replace("'", "''") }}{%- endmacro %}
{% macro jal(a) -%}[{% for v in a %}{% if not loop.first %}, {% endif %}"{{ jes(v) }}"{% endfor %}]{%- endmacro %}
{% macro kx(col) -%}toInt64(dateDiff('{{ g.u }}', {{ g.sf }}({{ col }}), {{ g.sf }}((SELECT md FROM maxd)))){%- endmacro %}
{% set pubv = filter_values('pub_f')|first|default('1', true) %}{% set pubv = pubv if pubv in ['0', '1'] else '1' %}
{% set actv = filter_values('act_f')|first|default('1', true) %}{% set actv = actv if actv in ['0', '1'] else '1' %}
{% set excv = filter_values('exc_f')|first|default('1', true) %}{% set excv = excv if excv in ['0', '1'] else '1' %}
{% set lv3 = [] %}{% for v in (filter_values('lvl3_f') or []) %}{% if v|string != '' %}{% set _ = lv3.append(v|string) %}{% endif %}{% endfor %}
{% set lv4 = [] %}{% for v in (filter_values('lvl4_f') or []) %}{% if v|string != '' %}{% set _ = lv4.append(v|string) %}{% endif %}{% endfor %}
{% set strm = [] %}{% for v in (filter_values('stream_f') or []) %}{% if v|string != '' %}{% set _ = strm.append(v|string) %}{% endif %}{% endfor %}
{% set spcf = [] %}{% for v in (filter_values('spec_f') or []) %}{% if v|string != '' %}{% set _ = spcf.append(v|string) %}{% endif %}{% endfor %}
{% set adgf = [] %}{% for v in (filter_values('adg_f') or []) %}{% if v|string != '' %}{% set _ = adgf.append(v|string) %}{% endif %}{% endfor %}
{% set headsv = filter_values('heads_f')|first|default('0', true) %}{% set headsv = headsv if headsv in ['0', '1', 'n'] else '0' %}
{% set loginf = [] %}{% for v in (filter_values('login_f') or []) %}{% if v|string != '' %}{% set _ = loginf.append(v|string) %}{% endif %}{% endfor %}
{#- Узлы оргструктуры (группировка «Оргструктура» панели): путь «УС-3 › УС-4 › …», глубина = число звеньев. -#}
{% set orgf = [] %}{% for v in (filter_values('org_f') or []) %}{% if v|string != '' and (v|string).split(' › ')|length <= 5 %}{% set _ = orgf.append(v|string) %}{% endif %}{% endfor %}
{#- Исключённые логины (настройки «Кто смотрит»): люди выпадают из всех чисел. -#}
{% set exlf = [] %}{% for v in (filter_values('exl_f') or []) %}{% if v|string != '' %}{% set _ = exlf.append(v|string) %}{% endif %}{% endfor %}
{% set freqr = filter_values('freq_f') or [] %}
{% set freqf = [] %}{% for v in freqr %}{% if v|string in ['1', '2', '3', '4'] %}{% set _ = freqf.append(v|string) %}{% endif %}{% endfor %}
{% set attrson = lv3 or lv4 or strm or spcf or adgf or headsv != '0' or orgf %}
{#- Людской фильтр (шина правой панели): при нём v_tot считается лишь по отобранным людям, и порог
    вселенной «≥500 просмотров за жизнь» ронял отчёты (корзина «2–5 дней» на отчёте → «Ничего не найдено»).
    Порог тогда берётся по ВСЕМ зрителям отчёта (как без фильтра) — отдельным подзапросом. -#}
{#- Применённая ЦА вкладки «Аудитория» (эмит панели «Аудитория: ЦА области»; только при WITH_CA):
    ЦА «по условиям» — фиксированный набор людей штата; каталог показывает только их визиты,
    «Охват ЦА» = зрители из ЦА / размер ЦА. Нет условий — ЦА «по правам» отчёта (pa_dash_ca). -#}
{% set caorg = [] %}{% set caspec = [] %}{% set castrm = [] %}{% set cahq = [] %}{% set cait = [] %}{% set cahead = '' %}{% set caadg = [] %}
{% if WITH_CA %}
{% for v in (filter_values('ca_org_f') or []) %}{% if v|string != '' and (v|string).split(' › ')|length <= 5 %}{% set _ = caorg.append(v|string) %}{% endif %}{% endfor %}
{% for v in (filter_values('ca_spec_f') or []) %}{% if v|string != '' %}{% set _ = caspec.append(v|string) %}{% endif %}{% endfor %}
{% for v in (filter_values('ca_stream_f') or []) %}{% if v|string != '' %}{% set _ = castrm.append(v|string) %}{% endif %}{% endfor %}
{% for v in (filter_values('ca_hq_f') or []) %}{% set _ = cahq.append(v|string) %}{% endfor %}
{% for v in (filter_values('ca_it_f') or []) %}{% set _ = cait.append(v|string) %}{% endfor %}
{% set cahead = filter_values('ca_head_f')|first|default('', true) %}{% set cahead = cahead if cahead in ['1', 'n'] else '' %}
{% for v in (filter_values('ca_adg_f') or []) %}{% if v|string != '' %}{% set _ = caadg.append(v|string) %}{% endif %}{% endfor %}
{% endif %}
{% set custom = caorg or caspec or castrm or cahq or cait or cahead != '' or caadg %}
{#- Нормализация уровня УС — как в панели (заглушки «-», «…» = пусто, путь обрывается на них). -#}
{% macro ou(col) %}if(match(toString(ifNull({{ col }}, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull({{ col }}, ''))){% endmacro %}
{#- Логины ЦА «по условиям»: те же условия и тот же нормализованный путь, что в SQL панели. -#}
{% macro caset() -%}
SELECT lg FROM (
      SELECT lower(toString(s.login)) AS lg,
        [{{ ou('s.lvl3_management_unit_nm') }}, {{ ou('s.lvl4_management_unit_nm') }}, {{ ou('s.lvl5_management_unit_nm') }}, {{ ou('s.lvl6_management_unit_nm') }}, {{ ou('s.lvl7_management_unit_nm') }}] AS lvz,
        arrayStringConcat(arraySlice(lvz, 1, if(arrayFirstIndex(x -> x = '', lvz) = 0, toUInt32(5), toUInt32(arrayFirstIndex(x -> x = '', lvz) - 1))), ' › ') AS op,
        toString(ifNull(s.emp_specialization_desc, '')) AS sp, toString(ifNull(s.emp_stream_desc, '')) AS st,
        toString(ifNull(s.hq_code, '')) AS hqc, toString(ifNull(s.it_code, '')) AS itc, toUInt8(ifNull(s.management_head_flg, 0) = 1) AS hdf
      FROM prod_proteus.pa_staff s) WHERE 1
      {%- if caorg %} AND arrayExists(pz -> op = pz OR startsWith(op, concat(pz, ' › ')), {{ qa(caorg) }}){% endif %}
      {%- if caspec %} AND sp IN {{ q(caspec) }}{% endif %}{% if castrm %} AND st IN {{ q(castrm) }}{% endif %}
      {%- if cahq %} AND hqc IN {{ q(cahq) }}{% endif %}{% if cait %} AND itc IN {{ q(cait) }}{% endif %}
      {%- if cahead == '1' %} AND hdf = 1{% elif cahead == 'n' %} AND hdf = 0{% endif %}
      {%- if caadg %} AND lg IN (SELECT login FROM prod_proteus.pa_adg_member WHERE ad_group IN {{ q(caadg) }}){% endif %}
{%- endmacro %}
{% set pplf = loginf or exlf or attrson or freqf or custom %}
{#- Корзина частоты — число АКТИВНЫХ ПЕРИОДОВ грануляции в окне n В ОТЧЁТАХ СТРОКИ каталога:
    у строки отчёта — заходы в этот отчёт, у коллекции / владельца — в их отчёты, у ИТОГО — во все
    (= корзина правой панели без выбора). Фильтр — HAVING по маске человека внутри строки (kx; маска пары внутри — m0, не msk: боевой CH 24.8 в HAVING берёт msk как колонку — Code 215). -#}
{%- set FB = [] -%}
{%- set FBIN = {'d': [1, 5, 15], 'w': [1, 5, 15], 'm': [1, 3, 6], 'q': [1, 2, 3]}[grain] -%}
{%- for v in freqf -%}{%- set bi = v|int -%}{%- if bi == 1 %}{% set _ = FB.append('nb BETWEEN 1 AND ' ~ FBIN[0]) %}{% elif bi == 4 %}{% set _ = FB.append('nb > ' ~ FBIN[2]) %}{% elif bi in [2, 3] %}{% set _ = FB.append('nb BETWEEN ' ~ (FBIN[bi - 2] + 1) ~ ' AND ' ~ FBIN[bi - 1]) %}{% endif -%}{%- endfor %}
{%- set OCOL = ['lvl3_management_unit_nm', 'lvl4_management_unit_nm', 'lvl5_management_unit_nm', 'lvl6_management_unit_nm', 'lvl7_management_unit_nm'] -%}
{%- set OC = [] -%}
{%- for L in [1, 2, 3, 4, 5] -%}{%- set vs = [] -%}{%- for v in orgf -%}{%- if v.split(' › ')|length == L -%}{%- set _ = vs.append(v) -%}{%- endif -%}{%- endfor -%}
{%- if vs -%}{%- set _ = OC.append('arrayStringConcat([' ~ OCOL[:L]|join(', ') ~ "], ' › ') IN " ~ q(vs)) -%}{%- endif -%}{%- endfor -%}
{% set SJ = ['"period":"' ~ grain ~ '"'] %}
{% if pubv == '0' %}{% set _ = SJ.append('"pub":"0"') %}{% endif %}
{% if actv == '0' %}{% set _ = SJ.append('"act":"0"') %}{% endif %}
{% if excv == '0' %}{% set _ = SJ.append('"exc":"0"') %}{% endif %}
{% if headsv != '0' %}{% set _ = SJ.append('"heads":"' ~ headsv ~ '"') %}{% endif %}
{% if lv3 %}{% set _ = SJ.append('"lvl3":' ~ jal(lv3)) %}{% endif %}
{% if lv4 %}{% set _ = SJ.append('"lvl4":' ~ jal(lv4)) %}{% endif %}
{% if strm %}{% set _ = SJ.append('"stream":' ~ jal(strm)) %}{% endif %}
{% if spcf %}{% set _ = SJ.append('"spec":' ~ jal(spcf)) %}{% endif %}
{% if adgf %}{% set _ = SJ.append('"adg":' ~ jal(adgf)) %}{% endif %}
{% if orgf %}{% set _ = SJ.append('"org":' ~ jal(orgf)) %}{% endif %}
{% if loginf %}{% set _ = SJ.append('"login":' ~ jal(loginf)) %}{% endif %}
{% if exlf %}{% set _ = SJ.append('"exl":' ~ jal(exlf)) %}{% endif %}
{% if freqf %}{% set _ = SJ.append('"freq":' ~ jal(freqf)) %}{% endif %}
{#- Ритм пользователя отчёта (не зависит от периода полоски): 4 — Daily (12+ активных дней
    из последних 30), 3 — Weekly (6+ недель из 8), 2 — Monthly (2+ из последних 3 месяцев),
    1 — Rare (заходил за 3 месяца реже), 0 — не заходил 3 месяца (в ритм не входит; все 0 — Dead). -#}
{% set RC = "multiIf(bitCount(bitAnd(pd, 1073741823)) >= 12, 4, bitCount(bitAnd(pw, 255)) >= 6, 3, bitCount(bitAnd(pm, 7)) >= 2, 2, bitAnd(pm, 7) != 0, 1, 0)" %}
WITH
  {# Дата свежести: md пары; запасной источник — последний визит (при пустом md gp_to_click). #}
  maxd AS (SELECT max(ifNull(md, dmax)) AS md FROM prod_proteus.pa_pair),
  dash_ok AS (
    SELECT dashboard_id
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1{% if pubv == '1' %} AND published = 1{% endif %}{% if actv == '1' %} AND actual_flg = 1{% endif %}
  ),
  evd AS (
    {#- Пары области: маска бакетов msk_<g>, просмотры окна v_<g>, за жизнь v_life, последний визит dmax.
        own_flg = 1 — зритель среди владельцев отчёта (свиток «без просмотров владельцев»). -#}
    SELECT toInt32(ifNull(e.dashboard_id, 0)) AS did, toString(ifNull(e.login, '')) AS login,
      {#- ifNull: gp_to_click создаёт колонки Nullable; NULL в сумме доехал бы до CAST и уронил запрос (Code 349). -#}
      toUInt64(ifNull(e.msk_{{ grain }}, 0)) AS msk, ifNull(e.v_{{ grain }}, 0) AS v_cur, ifNull(e.v_life, 0) AS v_life, e.dmax AS dmax,
      {#- маски дней/недель/месяцев — для ритма отчёта (не зависят от грануляции) -#}
      toUInt64(ifNull(e.msk_d, 0)) AS pd, toUInt64(ifNull(e.msk_w, 0)) AS pw, toUInt64(ifNull(e.msk_m, 0)) AS pm
      {%- if WITH_CA %},
      {#- a0 = 1 — зритель входит в ЦА отчёта: по правам — пара есть в pa_pair_acc (право на отчёт поимённо или
          через AD-группу, действующий сотрудник); по условиям — все пары уже отобраны по ЦА выше. -#}
      {% if custom %}toUInt8(1){% else %}toUInt8((toInt32(ifNull(e.dashboard_id, 0)), lower(toString(e.login))) IN (SELECT toInt32(ifNull(dashboard_id, 0)), toString(ifNull(login, '')) FROM prod_proteus.pa_pair_acc)){% endif %} AS a0
      {%- endif %}
    FROM prod_proteus.pa_pair e
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(e.login){% if excv == '1' %} AND ifNull(e.own_flg, 0) = 0{% endif %}
    {%- if loginf %} AND e.login IN {{ q(loginf) }}{% endif %}
    {%- if exlf %} AND e.login NOT IN {{ q(exlf) }}{% endif %}
    {%- if custom %} AND lower(toString(e.login)) IN ({{ caset() }}){% endif %}
    {%- if attrson %} AND e.login IN (SELECT login FROM prod_proteus.pa_emp_attrs WHERE 1=1{% if lv3 and lv4 %} AND (lvl3_management_unit_nm IN {{ q(lv3) }} OR lvl4_management_unit_nm IN {{ q(lv4) }}){% elif lv3 %} AND lvl3_management_unit_nm IN {{ q(lv3) }}{% elif lv4 %} AND lvl4_management_unit_nm IN {{ q(lv4) }}{% endif %}{% if strm %} AND emp_stream_desc IN {{ q(strm) }}{% endif %}{% if spcf %} AND emp_specialization_desc IN {{ q(spcf) }}{% endif %}{% if adgf %} AND hasAny(ad_groups, {{ qa(adgf) }}){% endif %}{% if headsv == '1' %} AND management_head_flg = 1{% elif headsv == 'n' %} AND management_head_flg = 0{% endif %}{% if OC %} AND ({{ OC|join(' OR ') }}){% endif %}){% endif %}
  ),
  kx AS (
    {#- Ключ строки размножается: 0 = ИТОГО, 1 = отчёт, 2 = владелец, 3 = коллекция.
        Мета (владелец, коллекции) подтягивается ПОСЛЕ сжатия факта до пар. -#}
    SELECT kd, k0, login,
      groupBitOr(m0) AS msk, sum(v_cur) AS v_cur, sum(v_life) AS v_life, max(dmax) AS dmax,
      groupBitOr(pd) AS pd, groupBitOr(pw) AS pw, groupBitOr(pm) AS pm{% if WITH_CA %}, max(a1) AS acc{% endif %}
    FROM (
      SELECT arrayJoin(arrayConcat(
          {# Все элементы — строго Tuple(UInt8, String): arrayConcat в CH 24 приводит массивы к типу
             первого, и Nullable-значение с NULL (owner_login меты) роняло запрос — Code 349. #}
          [(toUInt8(0), '')],
          [(toUInt8(1), toString(p.did))],
          arrayFilter(t -> t.2 != '', [(toUInt8(2), toString(ifNull(mm.owner_login, '')))]),
          arrayMap(c -> (toUInt8(3), toString(ifNull(c, ''))), arrayFilter(c -> isNotNull(c) AND c != '', mm.collection_names))
        )) AS kk, kk.1 AS kd, kk.2 AS k0,
        p.login AS login, p.msk AS m0, p.v_cur AS v_cur, p.v_life AS v_life, p.dmax AS dmax,
        p.pd AS pd, p.pw AS pw, p.pm AS pm{% if WITH_CA %}, p.a0 AS a1{% endif %}
      FROM evd p
      INNER JOIN prod_proteus.pa_dash_meta mm ON mm.dashboard_id = p.did
    )
    GROUP BY kd, k0, login
    {%- if FB %}
    HAVING {{ FB|join(' OR ')|replace('nb', 'bitCount(bitAnd(groupBitOr(m0), ' ~ CUR ~ '))') }}
    {%- endif %}
  ),
  agg AS (
    SELECT kd, k0,
      countIf(bitAnd(msk, {{ CUR }}) != 0) AS users,
      sum(v_cur) AS views,
      countIf(bitCount(bitAnd(msk, {{ CUR }})) >= {{ REG }}) AS regular_users,
      dateDiff('day', toStartOfDay(max(dmax)), toStartOfDay((SELECT md FROM maxd))) AS last_view_days,
      sum(v_life) AS v_tot,
      {#- Ритм отчёта: людей каждого ритма «Daily, Weekly, Monthly, Rare»; «0,0,0,0» — Dead. -#}
      arrayStringConcat([toString(countIf({{ RC }} = 4)), toString(countIf({{ RC }} = 3)), toString(countIf({{ RC }} = 2)), toString(countIf({{ RC }} = 1))], ',') AS rhythm
      {%- if WITH_CA %},
      {#- зрители за период, входящие в ЦА отчёта — числитель «Охвата ЦА» (посторонние зрители не в счёт) -#}
      countIf(bitAnd(msk, {{ CUR }}) != 0 AND acc = 1) AS ca_u{% endif %}
    FROM kx GROUP BY kd, k0
  )
SELECT
  CAST(CASE WHEN kd = 0 THEN 'total' WHEN kd = 1 THEN 'rep' ELSE 'grp' END AS String) AS section,
  CAST('{{ grain }}' AS String) AS grain,
  CAST(if(kd = 1, toInt32OrNull(k0), NULL) AS Nullable(Int32)) AS dashboard_id,
  CAST(CASE kd WHEN 2 THEN 'owner' WHEN 3 THEN 'collection' ELSE NULL END AS Nullable(String)) AS group_key,
  CAST(if(kd BETWEEN 2 AND 3, k0, NULL) AS Nullable(String)) AS group_val,
  CAST(if(kd = 1, m.dashboard_nm, NULL) AS Nullable(String)) AS dash_nm,
  CAST(if(kd = 1, m.owner_login, NULL) AS Nullable(String)) AS owner_login,
  CAST(if(kd = 1, m.collection_names, CAST([], 'Array(String)')) AS Array(String)) AS colls,
  CAST(if(kd = 1, m.published, NULL) AS Nullable(Int32)) AS published,
  CAST(if(kd = 1, m.certified_by, NULL) AS Nullable(String)) AS certified,
  CAST(if(kd = 1, m.created_dt, NULL) AS Nullable(DateTime)) AS created_dt,
  CAST(ifNull(users, 0) AS UInt64) AS users,
  CAST(ifNull(views, 0) AS Int64) AS views,
  CAST(ifNull(regular_users, 0) AS UInt64) AS regular_users,
  CAST(ifNull(last_view_days, 0) AS Int64) AS last_view_days,
  CAST(if(kd = 1, rhythm, NULL) AS Nullable(String)) AS rhythm,
  CAST(if(kd = 0, '{{ "{" ~ SJ|join(", ") ~ "}" }}', NULL) AS Nullable(String)) AS state_j
  {%- if WITH_CA %},
  {#- ЦА отчёта по правам (штат) и флаг «доступ почти у всех» — только у строк отчётов. -#}
  CAST(if(kd = 1, {% if custom %}(SELECT count() FROM ({{ caset() }})){% if excv == '1' %} - ifNull(oc.n_own, 0){% endif %}{% else %}c.ca_n{% endif %}, NULL) AS Nullable(Int64)) AS ca_n,
  CAST(if(kd = 1, {% if custom %}toUInt8(0){% else %}c.ca_wide{% endif %}, NULL) AS Nullable(UInt8)) AS ca_wide,
  CAST(if(kd = 1, ca_u, NULL) AS Nullable(UInt64)) AS ca_users{% endif %}
FROM agg
LEFT JOIN prod_proteus.pa_dash_meta m ON m.dashboard_id = ifNull(toInt32OrNull(k0), toInt32(0))
{%- if WITH_CA %}
LEFT JOIN prod_proteus.pa_dash_ca c ON c.dashboard_id = ifNull(toInt32OrNull(k0), toInt32(0))
{%- if custom and excv == '1' %}
{#- ЦА по условиям без владельцев отчёта (как панель при «Без владельцев»): их визиты — свои. #}
LEFT JOIN (SELECT dashboard_id, toInt64(count()) AS n_own FROM (SELECT dashboard_id, lower(toString(arrayJoin(owners_string))) AS ow FROM prod_proteus.pa_dash_meta)
  WHERE ow IN ({{ caset() }}) GROUP BY dashboard_id) oc ON oc.dashboard_id = ifNull(toInt32OrNull(k0), toInt32(0)){% endif %}{% endif %}
WHERE kd != 1 OR {% if pplf %}ifNull(toInt32OrNull(k0), 0) IN (SELECT u.dashboard_id FROM prod_proteus.pa_pair u WHERE u.dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(u.login){% if excv == '1' %} AND ifNull(u.own_flg, 0) = 0{% endif %} GROUP BY u.dashboard_id HAVING sum(ifNull(u.v_life, 0)) >= 500){% else %}v_tot >= 500{% endif %}
