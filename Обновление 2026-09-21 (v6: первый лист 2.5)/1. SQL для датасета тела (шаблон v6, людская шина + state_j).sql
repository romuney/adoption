{% set GRAINS = {'d': {'n': 30, 'u': 'day', 'sf': 'toStartOfDay', 'gap': 7}, 'w': {'n': 20, 'u': 'week', 'sf': 'toMonday', 'gap': 1}, 'm': {'n': 12, 'u': 'month', 'sf': 'toStartOfMonth', 'gap': 1}, 'q': {'n': 8, 'u': 'quarter', 'sf': 'toStartOfQuarter', 'gap': 1}} %}
{% set grain = filter_values('period_param')|first|default('d', true) %}
{% set grain = grain if grain in GRAINS else 'd' %}
{% set g = GRAINS[grain] %}
{% macro q(values) -%}
{%- set out = [] -%}
{%- for v in values -%}{%- set _ = out.append(v|string|replace('\\', '\\\\')) -%}{%- endfor -%}
{{- out|where_in -}}
{%- endmacro %}
{% macro jes(s) -%}{{ s|string|replace('\\', '\\\\')|replace('"', '\\"')|replace("'", "''") }}{%- endmacro %}
{% macro jal(a) -%}[{% for v in a %}{% if not loop.first %}, {% endif %}"{{ jes(v) }}"{% endfor %}]{%- endmacro %}
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
{% set ppl = attrson or loginf or freqf %}
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
  maxd AS (SELECT max(log_dttm) AS md FROM prod_proteus.pa_evd_day),{% if ppl %}
  ppla AS (
    SELECT e.login AS login
    FROM prod_proteus.pa_evd_day e
    INNER JOIN prod_proteus.pa_dash_meta m ON m.dashboard_id = e.dashboard_id
    {% if attrson %}INNER JOIN prod_proteus.pa_emp_attrs a ON a.login = e.login{% endif %}
    WHERE 1=1{% if excv == '1' %} AND NOT has(m.owners_string, e.login){% endif %}
      AND dateDiff('{{ g.u }}', {{ g.sf }}(e.log_dttm), {{ g.sf }}((SELECT md FROM maxd))) < {{ g.n }}{% if loginf %} AND e.login IN {{ q(loginf) }}{% endif %}{% if attrson %}{% if lv3 and lv4 %} AND (a.lvl3_management_unit_nm IN {{ q(lv3) }} OR a.lvl4_management_unit_nm IN {{ q(lv4) }}){% elif lv3 %} AND a.lvl3_management_unit_nm IN {{ q(lv3) }}{% elif lv4 %} AND a.lvl4_management_unit_nm IN {{ q(lv4) }}{% endif %}{% if strm %} AND a.emp_stream_desc IN {{ q(strm) }}{% endif %}{% if spcf %} AND a.emp_specialization_desc IN {{ q(spcf) }}{% endif %}{% if adgf %} AND hasAny(a.ad_groups, {{ q(adgf) }}){% endif %}{% if headsv == '1' %} AND a.management_head_flg = 1{% endif %}{% endif %}
    GROUP BY e.login
    HAVING {% if freqf %}{% set FB = [] %}{% for v in freqf %}{% if v == '1' %}{% set _ = FB.append('count() = 1') %}{% elif v == '2' %}{% set _ = FB.append('count() BETWEEN 2 AND 3') %}{% elif v == '3' %}{% set _ = FB.append('count() BETWEEN 4 AND 7') %}{% elif v == '4' %}{% set _ = FB.append('count() BETWEEN 8 AND 15') %}{% elif v == '5' %}{% set _ = FB.append('count() >= 16') %}{% endif %}{% endfor %}{% if FB %}({{ FB|join(' OR ') }}){% else %}1{% endif %}{% else %}1{% endif %}
  ),
{% endif %}
  dash_ok AS (
    SELECT dashboard_id, owner_login, owners_string, collection_names
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1{% if pubv == '1' %} AND published = 1{% endif %}{% if actv == '1' %} AND actual_flg = 1{% endif %}
  ),
  evd AS (
    SELECT m.dashboard_id AS did, m.owner_login AS ow, m.collection_names AS cn,
      e.login AS login,
      if(toInt64(dateDiff('{{ g.u }}', {{ g.sf }}(e.log_dttm), {{ g.sf }}((SELECT md FROM maxd)))) < {{ g.n * 2 }}, toInt64(dateDiff('{{ g.u }}', {{ g.sf }}(e.log_dttm), {{ g.sf }}((SELECT md FROM maxd)))), toInt64(-1)) AS k,
      sum(e.views) AS v, max(toStartOfDay(e.log_dttm)) AS dmax,
      max(toInt64(dateDiff('{{ g.u }}', {{ g.sf }}(e.log_dttm), {{ g.sf }}((SELECT md FROM maxd))))) AS kmax
    FROM prod_proteus.pa_evd_day e
    INNER JOIN dash_ok m ON m.dashboard_id = e.dashboard_id
    WHERE 1=1{% if excv == '1' %} AND NOT has(m.owners_string, e.login){% endif %}{% if ppl %} AND e.login IN (SELECT login FROM ppla){% endif %}
    GROUP BY m.dashboard_id, m.owner_login, m.collection_names, e.login, k
  ),
  b1 AS (
    SELECT kd, k0, login, k, sum(v) AS v, max(dmax) AS dmax, max(kmax) AS kmax
    FROM (
      SELECT arrayJoin(arrayConcat(
      [(toUInt8(0), '')],
      [(toUInt8(1), toString(did))],
      arrayFilter(t -> t.2 != '', [(toUInt8(2), ow)]),
      arrayMap(c -> (toUInt8(3), c), cn)
    )) AS kk, kk.1 AS kd, kk.2 AS k0, login, k, v, dmax, kmax
      FROM evd
    )
    GROUP BY kd, k0, login, k
  ),
  pa AS (
    SELECT kd, k0, login,
      countIf(k >= 0 AND k < {{ g.n }}) AS days_cur,
      countIf(k >= {{ g.n }} AND k < {{ g.n * 2 }}) AS days_prev,
      sumIf(v, k >= 0 AND k < {{ g.n }}) AS v_cur,
      sumIf(v, k >= {{ g.n }} AND k < {{ g.n * 2 }}) AS v_prev,
      sum(v) AS v_life,
      max(kmax) AS fd_k,
      dateDiff('day', max(dmax), toStartOfDay((SELECT md FROM maxd))) AS gap,
      groupArrayIf(k, k >= 0) AS ks_all,
      arraySort(groupArrayIf((k, toInt64(v)), k >= 0 AND k < {{ g.n }})) AS kvw
    FROM b1 GROUP BY kd, k0, login
  ),
  agg AS (
    SELECT kd, k0,
      countIf(days_cur > 0) AS users, countIf(days_prev > 0) AS users_prev,
      sumIf(v_cur, days_cur > 0) AS views, sumIf(v_prev, days_prev > 0) AS views_prev,
      countIf(days_cur > 0 AND fd_k < {{ g.n }}) AS new_users,
      countIf(days_prev > 0 AND fd_k >= {{ g.n }} AND fd_k < {{ g.n * 2 }}) AS new_users_prev,
      countIf(days_prev >= 8) AS regular_users_prev,
      countIf(days_cur > 0 AND gap > 30) AS sleeping_users,
      min(gap) AS last_view_days,
      countIf(days_cur = 1) AS freq_1, countIf(days_cur BETWEEN 2 AND 3) AS freq_2,
      countIf(days_cur BETWEEN 4 AND 7) AS freq_3, countIf(days_cur BETWEEN 8 AND 15) AS freq_4,
      countIf(days_cur >= 16) AS freq_5,
      sum(v_life) AS v_tot,
      sumMap(arrayMap(x -> x.1, kvw), arrayMap(x -> toUInt64(1), kvw)) AS m_u,
      sumMap(arrayMap(x -> x.1, kvw), arrayMap(x -> x.2, kvw)) AS m_v,
      sumMap(arrayMap(x -> x.1, kvw), arrayMap(x -> toUInt64(x.1 = fd_k), kvw)) AS m_n,
      sumMap(arrayMap(x -> x.1, kvw),
        arrayMap(x -> toUInt64(x.1 != fd_k AND
          arrayCount(j -> j > x.1 AND j <= x.1 + {{ g.gap }}, ks_all) = 0), kvw)) AS m_r
    FROM pa GROUP BY kd, k0
  )
SELECT
  CAST(section AS String) AS section,
  CAST(grain AS String) AS grain,
  CAST(dashboard_id AS Nullable(Int32)) AS dashboard_id,
  CAST(group_key AS Nullable(String)) AS group_key,
  CAST(group_val AS Nullable(String)) AS group_val,
  CAST(cut_key AS Nullable(String)) AS cut_key,
  CAST(cut_val AS Nullable(String)) AS cut_val,
  CAST(cohort_month AS Nullable(Date)) AS cohort_month,
  CAST(ifNull(cohort_size, 0) AS UInt64) AS cohort_size,
  CAST(dash_nm AS Nullable(String)) AS dash_nm,
  CAST(owner_login AS Nullable(String)) AS owner_login,
  CAST(ifNull(colls, CAST([], 'Array(String)')) AS Array(String)) AS colls,
  CAST(published AS Nullable(Int32)) AS published,
  CAST(certified AS Nullable(String)) AS certified,
  CAST(created_dt AS Nullable(DateTime)) AS created_dt,
  CAST(ifNull(users, 0) AS UInt64) AS users,
  CAST(ifNull(users_prev, 0) AS UInt64) AS users_prev,
  CAST(ifNull(views, 0) AS Int64) AS views,
  CAST(ifNull(views_prev, 0) AS Int64) AS views_prev,
  CAST(ifNull(new_users, 0) AS UInt64) AS new_users,
  CAST(ifNull(new_users_prev, 0) AS UInt64) AS new_users_prev,
  CAST(ifNull(regular_users, 0) AS UInt64) AS regular_users,
  CAST(ifNull(regular_users_prev, 0) AS UInt64) AS regular_users_prev,
  CAST(ifNull(sleeping_users, 0) AS UInt64) AS sleeping_users,
  CAST(ifNull(views_per_user, 0) AS Float64) AS views_per_user,
  CAST(ifNull(last_view_days, 0) AS Int64) AS last_view_days,
  CAST(ifNull(freq_1, 0) AS UInt64) AS freq_1,
  CAST(ifNull(freq_2, 0) AS UInt64) AS freq_2,
  CAST(ifNull(freq_3, 0) AS UInt64) AS freq_3,
  CAST(ifNull(freq_4, 0) AS UInt64) AS freq_4,
  CAST(ifNull(freq_5, 0) AS UInt64) AS freq_5,
  CAST(ifNull(ts_k, CAST([], 'Array(Int64)')) AS Array(Int64)) AS ts_k,
  CAST(ifNull(ts_users, CAST([], 'Array(UInt64)')) AS Array(UInt64)) AS ts_users,
  CAST(ifNull(ts_new, CAST([], 'Array(UInt64)')) AS Array(UInt64)) AS ts_new,
  CAST(ifNull(ts_react, CAST([], 'Array(UInt64)')) AS Array(UInt64)) AS ts_react,
  CAST(ifNull(ts_views, CAST([], 'Array(Int64)')) AS Array(Int64)) AS ts_views,
  CAST(state_j AS Nullable(String)) AS state_j
FROM (

SELECT
  CASE WHEN kd = 0 THEN 'total' WHEN kd = 1 THEN 'rep' ELSE 'grp' END AS section,
  '{{ grain }}' AS grain,
  if(kd = 1, toInt32OrNull(k0), NULL) AS dashboard_id,
  CASE kd WHEN 2 THEN 'owner' WHEN 3 THEN 'collection' ELSE NULL END AS group_key,
  if(kd BETWEEN 2 AND 3, k0, NULL) AS group_val,
  CAST(NULL AS Nullable(String)) AS cut_key,
  CAST(NULL AS Nullable(String)) AS cut_val,
  CAST(NULL AS Nullable(Date)) AS cohort_month, toUInt64(0) AS cohort_size,
  if(kd = 1, m.dashboard_nm, NULL) AS dash_nm,
  if(kd = 1, m.owner_login, NULL) AS owner_login,
  if(kd = 1, m.collection_names, CAST([], 'Array(String)')) AS colls,
  if(kd = 1, m.published, NULL) AS published,
  if(kd = 1, m.certified_by, NULL) AS certified,
  if(kd = 1, m.created_dt, NULL) AS created_dt,
  users, users_prev, views, views_prev, new_users, new_users_prev,
  freq_4 + freq_5 AS regular_users, regular_users_prev, sleeping_users,
  if(users = 0, toFloat64(0), views / users) AS views_per_user, last_view_days,
  freq_1, freq_2, freq_3, freq_4, freq_5,
  (m_u).1 AS ts_k, (m_u).2 AS ts_users, (m_n).2 AS ts_new,
  (m_r).2 AS ts_react, (m_v).2 AS ts_views,
  if(kd = 0, '{{ "{" ~ SJ|join(", ") ~ "}" }}', NULL) AS state_j
FROM agg LEFT JOIN prod_proteus.pa_dash_meta m ON m.dashboard_id = ifNull(toInt32OrNull(k0), toInt32(0))
WHERE kd != 1 OR v_tot >= 500

)

