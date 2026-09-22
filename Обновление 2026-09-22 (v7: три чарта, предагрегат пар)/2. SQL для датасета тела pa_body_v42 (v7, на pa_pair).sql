{#- pa_cube v7 — тело «Отчёты» (чарт 788805): каталог отчётов / коллекций / владельцев + ИТОГО.
    Источник — предагрегат пар prod_proteus.pa_pair (GP-параграф «PA · пары отчёт×логин»):
    у пары «отчёт × логин» уже лежат 64-битная маска активных бакетов, суммы окна и v_life
    для всех 4 грануляций; дневной факт куб не читает вовсе.
    Слушает: полоску (period_param, pub_f/act_f/exc_f) и людскую шину правой панели
    (lvl3_f/lvl4_f/stream_f/spec_f/adg_f/heads_f/login_f/freq_f). Выбор каталога
    (mode_param/sel_f) НЕ читает — самовлияние тела выключено.
    Линейная цепочка maxd → dash_ok → evd → kx → agg → выход; каждый CTE — одна ссылка
    (dash_ok — справочник 32 тыс. строк, при freq_f читается дважды, это дёшево).
    Ответ — 16 колонок; KPI области считает правая панель (pa_people). -#}
{% set GRAINS = {'d': {'n': 30, 'u': 'day', 'sf': 'toStartOfDay'}, 'w': {'n': 20, 'u': 'week', 'sf': 'toMonday'}, 'm': {'n': 12, 'u': 'month', 'sf': 'toStartOfMonth'}, 'q': {'n': 8, 'u': 'quarter', 'sf': 'toStartOfQuarter'}} %}
{% set grain = filter_values('period_param')|first|default('d', true) %}
{% set grain = grain if grain in GRAINS else 'd' %}
{% set g = GRAINS[grain] %}
{% set CUR = 2 ** g.n - 1 %}
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
{% set lv3 = filter_values('lvl3_f') or [] %}
{% set lv4 = filter_values('lvl4_f') or [] %}
{% set strm = filter_values('stream_f') or [] %}
{% set spcf = filter_values('spec_f') or [] %}
{% set adgf = filter_values('adg_f') or [] %}
{% set headsv = filter_values('heads_f')|first|default('0', true) %}{% set headsv = headsv if headsv in ['0', '1'] else '0' %}
{% set loginf = filter_values('login_f') or [] %}
{% set freqr = filter_values('freq_f') or [] %}
{% set freqf = [] %}{% for v in freqr %}{% if v|string in ['1', '2', '3', '4', '5'] %}{% set _ = freqf.append(v|string) %}{% endif %}{% endfor %}
{% set attrson = lv3 or lv4 or strm or spcf or adgf or headsv == '1' %}
{% set SJ = ['"period":"' ~ grain ~ '"'] %}
{% if pubv == '0' %}{% set _ = SJ.append('"pub":"0"') %}{% endif %}
{% if actv == '0' %}{% set _ = SJ.append('"act":"0"') %}{% endif %}
{% if excv == '0' %}{% set _ = SJ.append('"exc":"0"') %}{% endif %}
{% if headsv == '1' %}{% set _ = SJ.append('"heads":"1"') %}{% endif %}
{% if lv3 %}{% set _ = SJ.append('"lvl3":' ~ jal(lv3)) %}{% endif %}
{% if lv4 %}{% set _ = SJ.append('"lvl4":' ~ jal(lv4)) %}{% endif %}
{% if strm %}{% set _ = SJ.append('"stream":' ~ jal(strm)) %}{% endif %}
{% if spcf %}{% set _ = SJ.append('"spec":' ~ jal(spcf)) %}{% endif %}
{% if adgf %}{% set _ = SJ.append('"adg":' ~ jal(adgf)) %}{% endif %}
{% if loginf %}{% set _ = SJ.append('"login":' ~ jal(loginf)) %}{% endif %}
{% if freqf %}{% set _ = SJ.append('"freq":' ~ jal(freqf)) %}{% endif %}
WITH
  maxd AS (SELECT max(md) AS md FROM prod_proteus.pa_pair),
  dash_ok AS (
    SELECT dashboard_id
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1{% if pubv == '1' %} AND published = 1{% endif %}{% if actv == '1' %} AND actual_flg = 1{% endif %}
  ),
  evd AS (
    {#- Пары области: маска бакетов msk_<g>, просмотры окна v_<g>, за жизнь v_life, последний визит dmax.
        own_flg = 1 — зритель среди владельцев отчёта (свиток «без просмотров владельцев»). -#}
    SELECT e.dashboard_id AS did, e.login AS login,
      toUInt64(e.msk_{{ grain }}) AS msk, e.v_{{ grain }} AS v_cur, e.v_life AS v_life, e.dmax AS dmax
    FROM prod_proteus.pa_pair e
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM dash_ok){% if excv == '1' %} AND e.own_flg = 0{% endif %}
    {%- if loginf %} AND e.login IN {{ q(loginf) }}{% endif %}
    {%- if attrson %} AND e.login IN (SELECT login FROM prod_proteus.pa_emp_attrs WHERE 1=1{% if lv3 and lv4 %} AND (lvl3_management_unit_nm IN {{ q(lv3) }} OR lvl4_management_unit_nm IN {{ q(lv4) }}){% elif lv3 %} AND lvl3_management_unit_nm IN {{ q(lv3) }}{% elif lv4 %} AND lvl4_management_unit_nm IN {{ q(lv4) }}{% endif %}{% if strm %} AND emp_stream_desc IN {{ q(strm) }}{% endif %}{% if spcf %} AND emp_specialization_desc IN {{ q(spcf) }}{% endif %}{% if adgf %} AND hasAny(ad_groups, {{ qa(adgf) }}){% endif %}{% if headsv == '1' %} AND management_head_flg = 1{% endif %}){% endif %}
    {%- if freqf %}
      {#- Корзина частоты — число АКТИВНЫХ ПЕРИОДОВ грануляции в окне n (как в правой панели). -#}
      {%- set FB = [] -%}
      {%- for v in freqf -%}
        {%- if v == '1' %}{% set _ = FB.append('nb = 1') %}{% elif v == '2' %}{% set _ = FB.append('nb BETWEEN 2 AND 3') %}{% elif v == '3' %}{% set _ = FB.append('nb BETWEEN 4 AND 7') %}{% elif v == '4' %}{% set _ = FB.append('nb BETWEEN 8 AND 15') %}{% elif v == '5' %}{% set _ = FB.append('nb >= 16') %}{% endif -%}
      {%- endfor %} AND e.login IN (
        SELECT login FROM (
          SELECT f.login AS login, bitCount(bitAnd(groupBitOr(toUInt64(f.msk_{{ grain }})), {{ CUR }})) AS nb
          FROM prod_proteus.pa_pair f
          WHERE f.dashboard_id IN (SELECT dashboard_id FROM dash_ok){% if excv == '1' %} AND f.own_flg = 0{% endif %}
          GROUP BY f.login
        ) WHERE {{ FB|join(' OR ') }})
    {%- endif %}
  ),
  kx AS (
    {#- Ключ строки размножается: 0 = ИТОГО, 1 = отчёт, 2 = владелец, 3 = коллекция.
        Мета (владелец, коллекции) подтягивается ПОСЛЕ сжатия факта до пар. -#}
    SELECT kd, k0, login,
      groupBitOr(msk) AS msk, sum(v_cur) AS v_cur, sum(v_life) AS v_life, max(dmax) AS dmax
    FROM (
      SELECT arrayJoin(arrayConcat(
          [(toUInt8(0), '')],
          [(toUInt8(1), toString(p.did))],
          arrayFilter(t -> t.2 != '', [(toUInt8(2), mm.owner_login)]),
          arrayMap(c -> (toUInt8(3), c), mm.collection_names)
        )) AS kk, kk.1 AS kd, kk.2 AS k0,
        p.login AS login, p.msk AS msk, p.v_cur AS v_cur, p.v_life AS v_life, p.dmax AS dmax
      FROM evd p
      INNER JOIN prod_proteus.pa_dash_meta mm ON mm.dashboard_id = p.did
    )
    GROUP BY kd, k0, login
  ),
  agg AS (
    SELECT kd, k0,
      countIf(bitAnd(msk, {{ CUR }}) != 0) AS users,
      sum(v_cur) AS views,
      countIf(bitCount(bitAnd(msk, {{ CUR }})) >= 8) AS regular_users,
      dateDiff('day', toStartOfDay(max(dmax)), toStartOfDay((SELECT md FROM maxd))) AS last_view_days,
      sum(v_life) AS v_tot
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
  CAST(users AS UInt64) AS users,
  CAST(views AS Int64) AS views,
  CAST(regular_users AS UInt64) AS regular_users,
  CAST(last_view_days AS Int64) AS last_view_days,
  CAST(if(kd = 0, '{{ "{" ~ SJ|join(", ") ~ "}" }}', NULL) AS Nullable(String)) AS state_j
FROM agg
LEFT JOIN prod_proteus.pa_dash_meta m ON m.dashboard_id = ifNull(toInt32OrNull(k0), toInt32(0))
WHERE kd != 1 OR v_tot >= 500
