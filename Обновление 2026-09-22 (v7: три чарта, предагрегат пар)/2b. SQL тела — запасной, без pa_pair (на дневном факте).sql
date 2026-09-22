{#- pa_cube v7 · ЗАПАСНОЙ — тот же ответ (16 колонок, те же числа), но на дневном факте
    prod_proteus.pa_evd_day: для борда, пока GP-параграф pa_pair ещё не применён.
    Приём: у пары «отчёт × логин» вместо измерения «бакет» — 64-битная маска активных бакетов
    (bit k = активен в бакете возраста k, k < 2n <= 60); ни один GROUP BY не несёт бакет.
    Слушает полоску и людскую шину, выбор каталога НЕ читает (самовлияние тела выключено).
    Линейная цепочка maxd → dash_ok → evd → kx → agg → выход; каждый CTE — одна ссылка. -#}
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
  maxd AS (SELECT max(log_dttm) AS md FROM prod_proteus.pa_evd_day),
  dash_ok AS (
    SELECT dashboard_id, owners_string
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1{% if pubv == '1' %} AND published = 1{% endif %}{% if actv == '1' %} AND actual_flg = 1{% endif %}
  ),
  evd AS (
    {#- Пара «отчёт × логин» за всю историю: маска бакетов окна 2n, просмотры окна, за жизнь, последний день. -#}
    SELECT e.dashboard_id AS did, e.login AS login,
      groupBitOr(if({{ kx('e.log_dttm') }} < {{ 2 * g.n }}, toUInt64(bitShiftLeft(toUInt64(1), toUInt8({{ kx('e.log_dttm') }}))), toUInt64(0))) AS msk,
      sumIf(e.views, {{ kx('e.log_dttm') }} < {{ g.n }}) AS v_cur,
      sum(e.views) AS v_life,
      max(e.log_dttm) AS dmax
    FROM prod_proteus.pa_evd_day e
    INNER JOIN dash_ok m ON m.dashboard_id = e.dashboard_id
    WHERE 1=1{% if excv == '1' %} AND NOT has(m.owners_string, e.login){% endif %}
    {%- if loginf %} AND e.login IN {{ q(loginf) }}{% endif %}
    {%- if attrson %} AND e.login IN (SELECT login FROM prod_proteus.pa_emp_attrs WHERE 1=1{% if lv3 and lv4 %} AND (lvl3_management_unit_nm IN {{ q(lv3) }} OR lvl4_management_unit_nm IN {{ q(lv4) }}){% elif lv3 %} AND lvl3_management_unit_nm IN {{ q(lv3) }}{% elif lv4 %} AND lvl4_management_unit_nm IN {{ q(lv4) }}{% endif %}{% if strm %} AND emp_stream_desc IN {{ q(strm) }}{% endif %}{% if spcf %} AND emp_specialization_desc IN {{ q(spcf) }}{% endif %}{% if adgf %} AND hasAny(ad_groups, {{ qa(adgf) }}){% endif %}{% if headsv == '1' %} AND management_head_flg = 1{% endif %}){% endif %}
    {%- if freqf %}
      {#- Корзина частоты — число АКТИВНЫХ ПЕРИОДОВ грануляции в окне n (как в правой панели). -#}
      {%- set FB = [] -%}
      {%- for v in freqf -%}
        {%- if v == '1' %}{% set _ = FB.append('nb = 1') %}{% elif v == '2' %}{% set _ = FB.append('nb BETWEEN 2 AND 3') %}{% elif v == '3' %}{% set _ = FB.append('nb BETWEEN 4 AND 7') %}{% elif v == '4' %}{% set _ = FB.append('nb BETWEEN 8 AND 15') %}{% elif v == '5' %}{% set _ = FB.append('nb >= 16') %}{% endif -%}
      {%- endfor %} AND e.login IN (
        SELECT login FROM (
          SELECT f.login AS login, uniqExact({{ kx('f.log_dttm') }}) AS nb
          FROM prod_proteus.pa_evd_day f
          INNER JOIN dash_ok fm ON fm.dashboard_id = f.dashboard_id
          WHERE {{ kx('f.log_dttm') }} < {{ g.n }}{% if excv == '1' %} AND NOT has(fm.owners_string, f.login){% endif %}
          GROUP BY f.login
        ) WHERE {{ FB|join(' OR ') }})
    {%- endif %}
    GROUP BY e.dashboard_id, e.login
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
          arrayFilter(t -> t.2 != '', [(toUInt8(2), toString(ifNull(mm.owner_login, '')))]),
          arrayMap(c -> (toUInt8(3), toString(ifNull(c, ''))), arrayFilter(c -> isNotNull(c) AND c != '', mm.collection_names))
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
  CAST(ifNull(users, 0) AS UInt64) AS users,
  CAST(ifNull(views, 0) AS Int64) AS views,
  CAST(ifNull(regular_users, 0) AS UInt64) AS regular_users,
  CAST(ifNull(last_view_days, 0) AS Int64) AS last_view_days,
  CAST(if(kd = 0, '{{ "{" ~ SJ|join(", ") ~ "}" }}', NULL) AS Nullable(String)) AS state_j
FROM agg
LEFT JOIN prod_proteus.pa_dash_meta m ON m.dashboard_id = ifNull(toInt32OrNull(k0), toInt32(0))
WHERE kd != 1 OR v_tot >= 500
