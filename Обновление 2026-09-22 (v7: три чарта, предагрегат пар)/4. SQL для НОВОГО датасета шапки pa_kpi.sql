{#- pa_kpi — шапка листа «Отчёты» (чарт полоски pa-strip): KPI ВСЕГО экрана + эхо активных условий.
    Одна строка: итоги по области каталога (mode_param + sel_f) ∩ людской шине панели
    (lvl3_f/lvl4_f/stream_f/spec_f/adg_f/heads_f/login_f/freq_f) под свитками и периодом полоски.
    Источник — только предагрегат пар prod_proteus.pa_pair: дневной факт не читается.
    Числа сходятся: без людской шины == total pa_people (правая панель); без области ==
    total куба каталога; область «один отчёт» + шина == строка этого отчёта в каталоге.
    Линейная цепочка maxd → dash_ok → pl → выход; каждый CTE — одна ссылка. -#}
{% set GRAINS = {'d': 30, 'w': 20, 'm': 12, 'q': 8} %}
{% set grain = filter_values('period_param')|first|default('d', true) %}
{% set grain = grain if grain in GRAINS else 'd' %}
{% set n = GRAINS[grain] %}
{% set CUR = 2 ** n - 1 %}
{% set PREV = 2 ** (2 * n) - 1 - CUR %}
{% macro q(values) -%}
{%- set out = [] -%}
{%- for v in values -%}{%- set _ = out.append(v|string|replace('\\', '\\\\')) -%}{%- endfor -%}
{{- out|where_in -}}
{%- endmacro %}
{#- Массив-литерал для has/hasAny: where_in даёт кортеж ('a', 'b') или скаляр ('a'), а hasAny ждёт массив. -#}
{% macro qa(values) -%}[{{ q(values)[1:-1] }}]{%- endmacro %}
{% macro jes(s) -%}{{ s|string|replace('\\', '\\\\')|replace('"', '\\"')|replace("'", "''") }}{%- endmacro %}
{% macro jal(a) -%}[{% for v in a %}{% if not loop.first %}, {% endif %}"{{ jes(v) }}"{% endfor %}]{%- endmacro %}
{% set pubv = filter_values('pub_f')|first|default('1', true) %}{% set pubv = pubv if pubv in ['0', '1'] else '1' %}
{% set actv = filter_values('act_f')|first|default('1', true) %}{% set actv = actv if actv in ['0', '1'] else '1' %}
{% set excv = filter_values('exc_f')|first|default('1', true) %}{% set excv = excv if excv in ['0', '1'] else '1' %}
{#- Область (каталог) -#}
{% set CUTS = {'cut:lvl3': 'lvl3_management_unit_nm', 'cut:lvl4': 'lvl4_management_unit_nm', 'cut:spec': 'emp_specialization_desc', 'cut:stream': 'emp_stream_desc', 'cut:head': 'toString(management_head_flg)'} %}
{% set pmode = filter_values('mode_param')|first|default('', true) %}
{% set pmode = pmode if pmode in ['report', 'owner', 'collection'] or pmode in CUTS else '' %}
{% set selr = filter_values('sel_f') or [] %}
{% set sel = [] %}{% for v in selr %}{% if v|string != '' %}{% set _ = sel.append(v|string) %}{% endif %}{% endfor %}
{% set have = pmode != '' and sel|length > 0 %}
{% set repids = [] %}{% if have and pmode == 'report' %}{% for v in sel %}{% if v|int > 0 %}{% set _ = repids.append(v|int) %}{% endif %}{% endfor %}{% endif %}
{#- Людская шина (правая панель) -#}
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
{% if have %}{% set _ = SJ.append('"area_mode":"' ~ pmode ~ '"') %}{% set _ = SJ.append('"area":' ~ jal(sel)) %}{% endif %}
WITH
  {# Дата свежести: md пары; запасной источник — последний визит. #}
  maxd AS (SELECT max(ifNull(md, dmax)) AS md FROM prod_proteus.pa_pair),
  dash_ok AS (
    SELECT dashboard_id
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1{% if pubv == '1' %} AND published = 1{% endif %}{% if actv == '1' %} AND actual_flg = 1{% endif %}
    {%- if have and pmode == 'report' %} AND dashboard_id IN ({{ repids|join(', ') if repids else '0' }}){% endif %}
    {%- if have and pmode == 'owner' %} AND owner_login IN {{ q(sel) }}{% endif %}
    {%- if have and pmode == 'collection' %} AND hasAny(collection_names, {{ qa(sel) }}){% endif %}
  ),
  pl AS (
    {#- Один зритель области: OR масок его пар, суммы, первый визит, месяцы активности. -#}
    SELECT toString(ifNull(e.login, '')) AS login,
      groupBitOr(toUInt64(ifNull(e.msk_{{ grain }}, 0))) AS msk,
      sum(ifNull(e.v_{{ grain }}, 0)) AS v_cur,
      sum(ifNull(e.vp_{{ grain }}, 0)) AS v_prev,
      max(ifNull(e.kmax_{{ grain }}, 0)) AS fd_k,
      groupBitOr(toUInt64(ifNull(e.msk_mon, 0))) AS mon
    FROM prod_proteus.pa_pair e
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(e.login){% if excv == '1' %} AND ifNull(e.own_flg, 0) = 0{% endif %}
    {%- if have and pmode in CUTS %} AND e.login IN (SELECT login FROM prod_proteus.pa_emp_attrs WHERE {{ CUTS[pmode] }} IN {{ q(sel) }}){% endif %}
    {%- if loginf %} AND e.login IN {{ q(loginf) }}{% endif %}
    {%- if attrson %} AND e.login IN (SELECT login FROM prod_proteus.pa_emp_attrs WHERE 1=1{% if lv3 and lv4 %} AND (lvl3_management_unit_nm IN {{ q(lv3) }} OR lvl4_management_unit_nm IN {{ q(lv4) }}){% elif lv3 %} AND lvl3_management_unit_nm IN {{ q(lv3) }}{% elif lv4 %} AND lvl4_management_unit_nm IN {{ q(lv4) }}{% endif %}{% if strm %} AND emp_stream_desc IN {{ q(strm) }}{% endif %}{% if spcf %} AND emp_specialization_desc IN {{ q(spcf) }}{% endif %}{% if adgf %} AND hasAny(ad_groups, {{ qa(adgf) }}){% endif %}{% if headsv == '1' %} AND management_head_flg = 1{% endif %}){% endif %}
    {%- if freqf %}
      {#- Корзина частоты — активные периоды зрителя по ВСЕМ отчётам (как в каталоге). -#}
      {%- set FB = [] -%}
      {%- for v in freqf -%}
        {%- if v == '1' %}{% set _ = FB.append('nb = 1') %}{% elif v == '2' %}{% set _ = FB.append('nb BETWEEN 2 AND 3') %}{% elif v == '3' %}{% set _ = FB.append('nb BETWEEN 4 AND 7') %}{% elif v == '4' %}{% set _ = FB.append('nb BETWEEN 8 AND 15') %}{% elif v == '5' %}{% set _ = FB.append('nb >= 16') %}{% endif -%}
      {%- endfor %} AND e.login IN (
        SELECT login FROM (
          SELECT f.login AS login, bitCount(bitAnd(groupBitOr(toUInt64(ifNull(f.msk_{{ grain }}, 0))), {{ CUR }})) AS nb
          FROM prod_proteus.pa_pair f
          WHERE f.dashboard_id IN (SELECT dashboard_id FROM prod_proteus.pa_dash_meta WHERE 1=1{% if pubv == '1' %} AND published = 1{% endif %}{% if actv == '1' %} AND actual_flg = 1{% endif %}){% if excv == '1' %} AND ifNull(f.own_flg, 0) = 0{% endif %}
          GROUP BY f.login
        ) WHERE {{ FB|join(' OR ') }})
    {%- endif %}
    GROUP BY e.login
  )
SELECT
  CAST('{{ grain }}' AS String) AS grain,
  CAST(countIf(bitAnd(msk, {{ CUR }}) != 0) AS UInt64) AS users,
  CAST(countIf(bitAnd(msk, {{ PREV }}) != 0) AS UInt64) AS users_prev,
  CAST(ifNull(sum(v_cur), 0) AS Int64) AS views,
  CAST(ifNull(sum(v_prev), 0) AS Int64) AS views_prev,
  CAST(countIf(bitAnd(msk, {{ CUR }}) != 0 AND fd_k < {{ n }}) AS UInt64) AS new_u,
  CAST(countIf(bitAnd(msk, {{ PREV }}) != 0 AND fd_k >= {{ n }} AND fd_k < {{ 2 * n }}) AS UInt64) AS new_prev,
  CAST(countIf(bitCount(bitAnd(msk, {{ CUR }})) >= 8) AS UInt64) AS regular,
  CAST(countIf(bitCount(bitAnd(msk, {{ PREV }})) >= 8) AS UInt64) AS regular_prev,
  CAST(countIf(bitAnd(msk, {{ PREV }}) != 0 AND bitAnd(msk, {{ CUR }}) = 0) AS UInt64) AS sleeping,
  CAST(countIf(bitTest(mon, 1)) AS UInt64) AS mau,
  CAST(countIf(bitTest(mon, 2)) AS UInt64) AS mau_prev,
  {#- Подписи для пилюль: имена отчётов области и ФИО выбранных людей (перевод строки — разделитель). #}
  CAST({% if have and pmode == 'report' and repids %}ifNull((SELECT arrayStringConcat(groupArray(20)(toString(ifNull(dashboard_nm, ''))), '\n') FROM prod_proteus.pa_dash_meta WHERE dashboard_id IN ({{ repids|join(', ') }})), ''){% else %}''{% endif %} AS String) AS area_nm,
  CAST({% if loginf %}ifNull((SELECT arrayStringConcat(groupArray(concat(toString(login), '\t', toString(ifNull(fio, '')))), '\n') FROM prod_proteus.pa_emp_attrs WHERE login IN {{ q(loginf) }}), ''){% else %}''{% endif %} AS String) AS ppl_nm,
  CAST('{{ "{" ~ SJ|join(", ") ~ "}" }}' AS String) AS state_j
FROM pl
