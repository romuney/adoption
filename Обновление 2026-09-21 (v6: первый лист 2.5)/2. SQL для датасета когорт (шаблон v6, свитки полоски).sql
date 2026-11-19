{% set pmode = filter_values('mode_param')|first|default('report', true) %}
{% set CUTS = {
  'cut:head': 'toString(management_head_flg)',
  'cut:lvl3': 'lvl3_management_unit_nm',
  'cut:lvl4': 'lvl4_management_unit_nm',
  'cut:spec': 'emp_specialization_desc',
  'cut:stream': 'emp_stream_desc'} %}
{% set cutx = CUTS.get(pmode, '') %}
{% set cutn = pmode[4:] if cutx else '' %}
{% set sel = filter_values('sel_f') or [] %}
{% set sel0 = sel[0] if sel|length == 1 else '' %}
{% set selq = [sel0|string|replace('\\', '\\\\')]|where_in %}
{% set isgrp = pmode in ['owner', 'collection'] %}
{% set isrep = pmode == 'report' %}
{% set known = isrep or isgrp or cutx %}
{% set selhave = sel0 != '' %}
{% set pubv = filter_values('pub_f')|first|default('1', true) %}{% set pubv = pubv if pubv in ['0', '1'] else '1' %}
{% set actv = filter_values('act_f')|first|default('1', true) %}{% set actv = actv if actv in ['0', '1'] else '1' %}
{% set excv = filter_values('exc_f')|first|default('1', true) %}{% set excv = excv if excv in ['0', '1'] else '1' %}
WITH
  maxd AS (SELECT max(log_dttm) AS md FROM prod_proteus.pa_evd_day),
  dash_ok AS (
    SELECT dashboard_id, owner_login, owners_string, collection_names
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1{% if pubv == '1' %} AND published = 1{% endif %}{% if actv == '1' %} AND actual_flg = 1{% endif %}
  ),
  cpl AS (
    SELECT e.login AS login,
      toStartOfMonth(min(e.log_dttm)) AS c0,
      toInt64(dateDiff('month', toStartOfMonth(min(e.log_dttm)), toStartOfMonth((SELECT md FROM maxd)))) AS gm,
      groupUniqArray(toInt64(dateDiff('month', toStartOfMonth(e.log_dttm), toStartOfMonth((SELECT md FROM maxd))))) AS bms
    FROM prod_proteus.pa_evd_day e
    INNER JOIN dash_ok m ON m.dashboard_id = e.dashboard_id
    WHERE 1=1{% if excv == '1' %} AND NOT has(m.owners_string, e.login){% endif %} {% if not selhave or not known %}{% elif isrep %}AND e.dashboard_id = {{ sel0|int }}{% elif pmode == 'owner' %}AND m.owner_login = {{ selq }}{% elif pmode == 'collection' %}AND has(m.collection_names, {{ selq }}){% else %}AND e.login IN (SELECT login FROM prod_proteus.pa_emp_attrs WHERE {{ cutx }} = {{ selq }}){% endif %}
    GROUP BY e.login
  ),
  ca AS (
    SELECT c0,
      arrayFilter(x -> x >= 1 AND x <= 11, arrayMap(y -> gm - y, bms)) AS ags
    FROM cpl WHERE gm < 12
  )
SELECT
  CAST(section AS String) AS section,
  CAST(sel_key AS String) AS sel_key,
  CAST(sel_val AS String) AS sel_val,
  CAST(sel_nm AS String) AS sel_nm,
  CAST(cohort_month AS Date) AS cohort_month,
  CAST(cohort_size AS UInt64) AS cohort_size,
  CAST(ages AS Array(Int64)) AS ages,
  CAST(acts AS Array(UInt64)) AS acts
FROM (
  SELECT section, sel_key, sel_val, sel_nm, cohort_month, cohort_size,
    (m).1 AS ages, (m).2 AS acts
  FROM (
    SELECT '{% if not selhave or not known %}coh{% elif isrep %}rcoh{% elif isgrp %}gcoh{% else %}ocoh{% endif %}' AS section, {% if not selhave or not known %}''{% elif cutx %}'{{ cutn }}'{% else %}'{{ pmode }}'{% endif %} AS sel_key, {% if not selhave or not known %}''{% elif isrep %}'{{ sel0|int }}'{% else %}{{ selq }}{% endif %} AS sel_val,
      {% if not selhave or not known %}'Proteus'{% elif isrep %}ifNull((SELECT dashboard_nm FROM prod_proteus.pa_dash_meta WHERE dashboard_id = {{ sel0|int }} LIMIT 1), ''){% else %}{{ selq }}{% endif %} AS sel_nm,
      c0 AS cohort_month, count() AS cohort_size,
      sumMap(ags, arrayMap(x -> toUInt64(1), ags)) AS m
    FROM ca GROUP BY c0
  )
)

