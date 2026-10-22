{% set pmode = filter_values('mode_param')|first|default('report', true) %}
{% set CUTS = {
  'cut:head': 'toString(argMax(management_head_flg, log_dttm))',
  'cut:hq': 'argMax(emp_specialization_oper_code, log_dttm)',
  'cut:it': 'argMax(emp_specialization_it_code, log_dttm)',
  'cut:lvl3': 'argMax(lvl3_management_unit_nm, log_dttm)',
  'cut:lvl4': 'argMax(lvl4_management_unit_nm, log_dttm)',
  'cut:seg': 'argMax(current_head_lvl_segment, log_dttm)',
  'cut:spec': 'argMax(emp_specialization_desc, log_dttm)',
  'cut:stream': 'argMax(emp_stream_desc, log_dttm)'} %}
{% set cutx = CUTS.get(pmode, '') %}
{% set cutn = pmode[4:] if cutx else '' %}
{% set sel = filter_values('sel_f') or [] %}
{% set sel0 = sel[0] if sel|length == 1 else '' %}
{% set selq = [sel0|string|replace('\\', '\\\\')]|where_in %}
{% set isgrp = pmode in ['owner', 'collection'] %}
{% set isrep = pmode == 'report' %}
{% set known = isrep or isgrp or cutx %}
{% set selhave = sel0 != '' %}
{% macro q(values) -%}
{%- set out = [] -%}
{%- for v in values -%}{%- set _ = out.append(v|string|replace('\\', '\\\\')) -%}{%- endfor -%}
{{- out|where_in -}}
{%- endmacro %}
{% set repf = filter_values('rep_f') or [] %}
{% set collf = filter_values('coll_f') or [] %}
{% set ownf = filter_values('own_f') or [] %}
{% set authf = filter_values('auth_f') or [] %}
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
WITH
  maxd AS (SELECT max(log_dttm) AS md FROM prod_proteus.proteus_adoption){% if ppl %},
  attrs AS (
    SELECT login,
      argMax(lvl3_management_unit_nm, log_dttm) AS k4,
      argMax(emp_specialization_desc, log_dttm) AS k5,
      argMax(lvl4_management_unit_nm, log_dttm) AS k40,
      argMax(emp_stream_desc, log_dttm) AS k41,
      argMax(ad_groups, log_dttm) AS k42,
      argMax(management_head_flg, log_dttm) AS k43
    FROM prod_proteus.proteus_adoption WHERE dashboard_id != 13040 AND login != 'svc_mon_otpp' GROUP BY login
  ){% endif %},
  cpl AS (
    SELECT login,
      toStartOfMonth(min(log_dttm)) AS c0,
      toInt64(dateDiff('month', toStartOfMonth(min(log_dttm)), toStartOfMonth((SELECT md FROM maxd)))) AS gm,
      groupUniqArray(toInt64(dateDiff('month', toStartOfMonth(log_dttm), toStartOfMonth((SELECT md FROM maxd))))) AS bms
    FROM prod_proteus.proteus_adoption
    WHERE dashboard_id != 13040 AND login != 'svc_mon_otpp'{% if repf %} AND dashboard_id IN ({{ repf|map('int')|join(', ') }}){% endif %}{% if collf %} AND hasAny(collection_names, {{ q(collf) }}){% endif %}{% if ownf %} AND hasAny(owners_string, {{ q(ownf) }}){% endif %}{% if authf %} AND owner_login IN {{ q(authf) }}{% endif %}{% if pubv == '1' %} AND published = 1{% endif %}{% if actv == '1' %} AND actual_flg = 1{% endif %}{% if certv == '1' %} AND ifNull(certified_by, '') != ''{% endif %}{% if excv == '1' %} AND NOT has(owners_string, login){% endif %}{% if ppl %} AND login IN (SELECT login FROM attrs WHERE 1=1{% if lv3 and lv4 %} AND (k4 IN {{ q(lv3) }} OR k40 IN {{ q(lv4) }}){% elif lv3 %} AND k4 IN {{ q(lv3) }}{% elif lv4 %} AND k40 IN {{ q(lv4) }}{% endif %}{% if strm %} AND k41 IN {{ q(strm) }}{% endif %}{% if spcf %} AND k5 IN {{ q(spcf) }}{% endif %}{% if adgf %} AND hasAny(k42, {{ q(adgf) }}){% endif %}{% if headsv == '1' %} AND k43 = 1{% endif %}){% endif %} {% if not selhave or not known %}{% elif isrep %}AND dashboard_id = {{ sel0|int }}{% elif pmode == 'owner' %}AND owner_login = {{ selq }}{% elif pmode == 'collection' %}AND has(collection_names, {{ selq }}){% else %}AND login IN (SELECT login FROM prod_proteus.proteus_adoption WHERE dashboard_id != 13040 AND login != 'svc_mon_otpp' GROUP BY login HAVING {{ cutx }} = {{ selq }}){% endif %}
    GROUP BY login
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
      {% if not selhave or not known %}'Proteus'{% elif isrep %}ifNull((SELECT dashboard_nm FROM prod_proteus.proteus_adoption WHERE dashboard_id = {{ sel0|int }} LIMIT 1), ''){% else %}{{ selq }}{% endif %} AS sel_nm,
      c0 AS cohort_month, count() AS cohort_size,
      sumMap(ags, arrayMap(x -> toUInt64(1), ags)) AS m
    FROM ca GROUP BY c0
  )
)

