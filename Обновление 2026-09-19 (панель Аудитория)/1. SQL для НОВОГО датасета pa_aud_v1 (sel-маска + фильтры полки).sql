{% set GRAINS = {'d': {'n': 30, 'u': 'day', 'sf': 'toStartOfDay', 'gap': 7}, 'w': {'n': 20, 'u': 'week', 'sf': 'toMonday', 'gap': 1}, 'm': {'n': 12, 'u': 'month', 'sf': 'toStartOfMonth', 'gap': 1}, 'q': {'n': 8, 'u': 'quarter', 'sf': 'toStartOfQuarter', 'gap': 1}} %}
{% set grain = filter_values('period_param')|first|default('d', true) %}
{% set grain = grain if grain in GRAINS else 'd' %}
{% set g = GRAINS[grain] %}
{% macro q(values) -%}
{%- set out = [] -%}
{%- for v in values -%}{%- set _ = out.append(v|string|replace('\\', '\\\\')) -%}{%- endfor -%}
{{- out|where_in -}}
{%- endmacro %}
{#- Область = sel-маска тела (mode_param + sel_f), как у когорт #}
{% set pmode = filter_values('mode_param')|first|default('', true) %}
{% set sel = filter_values('sel_f') or [] %}
{% set sel0 = sel[0] if sel|length == 1 else '' %}
{% set selq = [sel0|string|replace('\\', '\\\\')]|where_in %}
{% set isrep = pmode == 'report' %}
{% set isgrp = pmode in ['owner', 'collection'] %}
{% set CUTS = {
  'cut:lvl3': 'lvl3_management_unit_nm',
  'cut:lvl4': 'lvl4_management_unit_nm',
  'cut:spec': 'emp_specialization_desc',
  'cut:stream': 'emp_stream_desc',
  'cut:head': "if(management_head_flg = 1, '1', '0')"} %}
{% set cutx = CUTS.get(pmode, '') %}
{% set iscut = cutx != '' %}
{% set have = sel0 != '' and (isrep or isgrp or iscut) %}
{#- Настройки полки — те же, что у куба тела: цифры обязаны сходиться #}
{% set pubv = filter_values('pub_f')|first|default('1', true) %}{% set pubv = pubv if pubv in ['0', '1'] else '1' %}
{% set actv = filter_values('act_f')|first|default('1', true) %}{% set actv = actv if actv in ['0', '1'] else '1' %}
{% set certv = filter_values('cert_f')|first|default('0', true) %}{% set certv = certv if certv in ['0', '1'] else '0' %}
{% set excv = filter_values('exc_f')|first|default('1', true) %}{% set excv = excv if excv in ['0', '1'] else '1' %}
{% set lv3 = filter_values('lvl3_f') or [] %}
{% set lv4 = filter_values('lvl4_f') or [] %}
{% set strm = filter_values('stream_f') or [] %}
{% set spcf = filter_values('spec_f') or [] %}
{% set adgf = filter_values('adg_f') or [] %}
{% set headsv = filter_values('heads_f')|first|default('0', true) %}{% set headsv = headsv if headsv in ['0', '1'] else '0' %}
{% set ppl = lv3 or lv4 or strm or spcf or adgf or headsv == '1' %}
-- pa_aud — аудитория области для чарта pa_audience (виджет Виджеты/pa-audience.chart.js).
-- Лёгкий запрос поверх предагрегатов pa_evd_day / pa_emp_attrs / pa_dash_meta:
-- зрители области (sel-маска тела: report | owner | collection | cut:lvl3/lvl4/spec/stream/head),
-- разложенные по людям-разрезам; при людской области — топ-отчёты аудитории.
-- Ответ: секция kpi (1 строка) + cut-секции lvl3/lvl4/spec/stream/adg(топ-40)/heads/report(топ-25, только cut-область).
WITH
  maxd AS (SELECT max(log_dttm) AS md FROM prod_proteus.pa_evd_day),{% if ppl %}
  ppla AS (
    SELECT login FROM prod_proteus.pa_emp_attrs WHERE 1=1{% if lv3 and lv4 %} AND (lvl3_management_unit_nm IN {{ q(lv3) }} OR lvl4_management_unit_nm IN {{ q(lv4) }}){% elif lv3 %} AND lvl3_management_unit_nm IN {{ q(lv3) }}{% elif lv4 %} AND lvl4_management_unit_nm IN {{ q(lv4) }}{% endif %}{% if strm %} AND emp_stream_desc IN {{ q(strm) }}{% endif %}{% if spcf %} AND emp_specialization_desc IN {{ q(spcf) }}{% endif %}{% if adgf %} AND hasAny(ad_groups, {{ q(adgf) }}){% endif %}{% if headsv == '1' %} AND management_head_flg = 1{% endif %}
  ),{% endif %}
  dash_ok AS (
    SELECT dashboard_id, owner_login, owners_string, collection_names
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1{% if pubv == '1' %} AND published = 1{% endif %}{% if actv == '1' %} AND actual_flg = 1{% endif %}{% if certv == '1' %} AND ifNull(certified_by, '') != ''{% endif %}{% if have and isrep %} AND dashboard_id = {{ sel0|int }}{% endif %}{% if have and pmode == 'owner' %} AND owner_login = {{ selq }}{% endif %}{% if have and pmode == 'collection' %} AND has(collection_names, {{ selq }}){% endif %}
  ),
  aud AS (
    SELECT e.dashboard_id AS did, e.login AS login, e.views AS v,
      toInt64(dateDiff('{{ g.u }}', {{ g.sf }}(toStartOfDay(e.log_dttm)), {{ g.sf }}((SELECT md FROM maxd)))) AS k
    FROM prod_proteus.pa_evd_day e
    INNER JOIN dash_ok m ON m.dashboard_id = e.dashboard_id
    WHERE 1=1{% if excv == '1' %} AND NOT has(m.owners_string, e.login){% endif %}{% if have and iscut %} AND e.login IN (SELECT login FROM prod_proteus.pa_emp_attrs WHERE {{ cutx }} = {{ selq }}){% endif %}{% if ppl %} AND e.login IN (SELECT login FROM ppla){% endif %}
  ),
  ppl AS (
    SELECT login,
      countIf(k < {{ g.n }}) AS days_cur,
      countIf(k >= {{ g.n }} AND k < {{ g.n * 2 }}) AS days_prev,
      sumIf(v, k < {{ g.n }}) AS v_cur,
      sumIf(v, k >= {{ g.n }} AND k < {{ g.n * 2 }}) AS v_prev,
      min(k) AS fd_k
    FROM aud GROUP BY login
  )
SELECT
  CAST(section AS String) AS section,
  CAST(cut_key AS Nullable(String)) AS cut_key,
  CAST(cut_val AS Nullable(String)) AS cut_val,
  CAST(parent AS Nullable(String)) AS parent,
  CAST(nm AS Nullable(String)) AS nm,
  CAST(ifNull(users, 0) AS UInt64) AS users,
  CAST(ifNull(users_prev, 0) AS UInt64) AS users_prev,
  CAST(ifNull(views, 0) AS Int64) AS views,
  CAST(ifNull(views_prev, 0) AS Int64) AS views_prev,
  CAST(ifNull(new_users, 0) AS UInt64) AS new_users,
  CAST(ifNull(regular_users, 0) AS UInt64) AS regular_users,
  CAST(ifNull(once_users, 0) AS UInt64) AS once_users
FROM (
  {% set AGG = "countIf(days_cur > 0) AS users, countIf(days_prev > 0) AS users_prev, sumIf(v_cur, days_cur > 0) AS views, sumIf(v_prev, days_prev > 0) AS views_prev, countIf(days_cur > 0 AND fd_k < " ~ g.n ~ ") AS new_users, countIf(days_cur >= 8) AS regular_users, countIf(days_cur = 1) AS once_users" %}
  {#- nm kpi-строки = имя области для пилюли виджета -#}
  SELECT 'kpi' AS section, '' AS cut_key, '' AS cut_val, '' AS parent,
    {% if not have %}''{% elif isrep %}ifNull((SELECT dashboard_nm FROM prod_proteus.pa_dash_meta WHERE dashboard_id = {{ sel0|int }} LIMIT 1), ''){% else %}{{ selq }}{% endif %} AS nm,
    {{ AGG }}
  FROM ppl

  UNION ALL

  SELECT 'cut' AS section, 'lvl3' AS cut_key, a.lvl3_management_unit_nm AS cut_val,
    '' AS parent, a.lvl3_management_unit_nm AS nm, {{ AGG }}
  FROM ppl p INNER JOIN prod_proteus.pa_emp_attrs a ON a.login = p.login
  WHERE a.lvl3_management_unit_nm != ''
  GROUP BY a.lvl3_management_unit_nm

  UNION ALL

  SELECT 'cut', 'lvl4', a.lvl4_management_unit_nm, a.lvl3_management_unit_nm, a.lvl4_management_unit_nm, {{ AGG }}
  FROM ppl p INNER JOIN prod_proteus.pa_emp_attrs a ON a.login = p.login
  WHERE a.lvl4_management_unit_nm != ''
  GROUP BY a.lvl3_management_unit_nm, a.lvl4_management_unit_nm

  UNION ALL

  SELECT 'cut', 'spec', a.emp_specialization_desc, '', a.emp_specialization_desc, {{ AGG }}
  FROM ppl p INNER JOIN prod_proteus.pa_emp_attrs a ON a.login = p.login
  WHERE a.emp_specialization_desc != ''
  GROUP BY a.emp_specialization_desc

  UNION ALL

  SELECT 'cut', 'stream', a.emp_stream_desc, '', a.emp_stream_desc, {{ AGG }}
  FROM ppl p INNER JOIN prod_proteus.pa_emp_attrs a ON a.login = p.login
  WHERE a.emp_stream_desc != ''
  GROUP BY a.emp_stream_desc

  UNION ALL

  SELECT * FROM (
    SELECT 'cut' AS section, 'adg' AS cut_key, t.ad_group AS cut_val,
      '' AS parent, t.ad_group AS nm,
      countIf(t.days_cur > 0) AS users, countIf(t.days_prev > 0) AS users_prev,
      sumIf(t.v_cur, t.days_cur > 0) AS views, sumIf(t.v_prev, t.days_prev > 0) AS views_prev,
      countIf(t.days_cur > 0 AND t.fd_k < {{ g.n }}) AS new_users,
      countIf(t.days_cur >= 8) AS regular_users, countIf(t.days_cur = 1) AS once_users
    FROM (
      SELECT arrayJoin(a.ad_groups) AS ad_group,
        p.days_cur AS days_cur, p.days_prev AS days_prev,
        p.v_cur AS v_cur, p.v_prev AS v_prev, p.fd_k AS fd_k
      FROM ppl p INNER JOIN prod_proteus.pa_emp_attrs a ON a.login = p.login
    ) t
    GROUP BY t.ad_group
    HAVING users > 0
    ORDER BY users DESC
    LIMIT 40
  )

  UNION ALL

  SELECT 'cut', 'heads', if(a.management_head_flg = 1, 'Тим-лиды', 'Остальные'), '', if(a.management_head_flg = 1, 'Тим-лиды', 'Остальные'), {{ AGG }}
  FROM ppl p INNER JOIN prod_proteus.pa_emp_attrs a ON a.login = p.login
  GROUP BY if(a.management_head_flg = 1, 'Тим-лиды', 'Остальные')
{% if have and iscut %}

  UNION ALL

  SELECT * FROM (
    SELECT 'cut' AS section, 'report' AS cut_key, toString(r.did) AS cut_val,
      '' AS parent, ifNull(m2.dashboard_nm, toString(r.did)) AS nm, {{ AGG }}
    FROM (
      SELECT did, login,
        countIf(k < {{ g.n }}) AS days_cur,
        countIf(k >= {{ g.n }} AND k < {{ g.n * 2 }}) AS days_prev,
        sumIf(v, k < {{ g.n }}) AS v_cur,
        sumIf(v, k >= {{ g.n }} AND k < {{ g.n * 2 }}) AS v_prev,
        min(k) AS fd_k
      FROM aud GROUP BY did, login
    ) r
    LEFT JOIN prod_proteus.pa_dash_meta m2 ON m2.dashboard_id = r.did
    GROUP BY r.did, ifNull(m2.dashboard_nm, toString(r.did))
    ORDER BY users DESC
    LIMIT 25
  )
{% endif %}
)
