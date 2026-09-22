{% set GRAINS = {'d': {'n': 30, 'u': 'day', 'sf': 'toStartOfDay', 'gap': 7}, 'w': {'n': 20, 'u': 'week', 'sf': 'toMonday', 'gap': 1}, 'm': {'n': 12, 'u': 'month', 'sf': 'toStartOfMonth', 'gap': 1}, 'q': {'n': 8, 'u': 'quarter', 'sf': 'toStartOfQuarter', 'gap': 1}} %}
{% set grain = filter_values('period_param')|first|default('d', true) %}
{% set grain = grain if grain in GRAINS else 'd' %}
{% set g = GRAINS[grain] %}
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
  maxd AS (SELECT max(log_dttm) AS md FROM prod_proteus.proteus_adoption),
  meta AS (
    SELECT dashboard_id AS mk, any(dashboard_nm) AS dash_nm, any(owner_login) AS owner_login,
      any(collection_names) AS colls, any(published) AS published,
      any(certified_by) AS certified, any(created_dt) AS created_dt
    FROM prod_proteus.proteus_adoption WHERE dashboard_id != 13040 AND login != 'svc_mon_otpp' GROUP BY dashboard_id
  ),
  attrs AS (
    SELECT login,
      argMax(lvl3_management_unit_nm, log_dttm) AS k4,
      argMax(emp_specialization_desc, log_dttm) AS k5,
      argMax(lvl4_management_unit_nm, log_dttm) AS k40,
      argMax(emp_stream_desc, log_dttm) AS k41,
      argMax(ad_groups, log_dttm) AS k42,
      argMax(management_head_flg, log_dttm) AS k43
    FROM prod_proteus.proteus_adoption WHERE dashboard_id != 13040 AND login != 'svc_mon_otpp' GROUP BY login
  ),
  attrs_f AS (SELECT * FROM attrs WHERE 1=1{% if lv3 and lv4 %} AND (k4 IN {{ q(lv3) }} OR k40 IN {{ q(lv4) }}){% elif lv3 %} AND k4 IN {{ q(lv3) }}{% elif lv4 %} AND k40 IN {{ q(lv4) }}{% endif %}{% if strm %} AND k41 IN {{ q(strm) }}{% endif %}{% if spcf %} AND k5 IN {{ q(spcf) }}{% endif %}{% if adgf %} AND hasAny(k42, {{ q(adgf) }}){% endif %}{% if headsv == '1' %} AND k43 = 1{% endif %}),
  evd AS (
    SELECT dashboard_id, login, toStartOfDay(log_dttm) AS dte, sum(action_count) AS v,
      any(owner_login) AS ow, any(collection_names) AS cn
    FROM prod_proteus.proteus_adoption WHERE dashboard_id != 13040 AND login != 'svc_mon_otpp'{% if repf %} AND dashboard_id IN ({{ repf|map('int')|join(', ') }}){% endif %}{% if collf %} AND hasAny(collection_names, {{ q(collf) }}){% endif %}{% if ownf %} AND hasAny(owners_string, {{ q(ownf) }}){% endif %}{% if authf %} AND owner_login IN {{ q(authf) }}{% endif %}{% if pubv == '1' %} AND published = 1{% endif %}{% if actv == '1' %} AND actual_flg = 1{% endif %}{% if certv == '1' %} AND ifNull(certified_by, '') != ''{% endif %}{% if excv == '1' %} AND NOT has(owners_string, login){% endif %} GROUP BY dashboard_id, login, toStartOfDay(log_dttm)
  ),
  b0 AS (
    SELECT e.dashboard_id AS did, e.ow AS ow, e.cn AS cn, a.k4 AS k4, a.k5 AS k5,
      e.login AS login,
      toInt64(dateDiff('{{ g.u }}', {{ g.sf }}(e.dte), {{ g.sf }}((SELECT md FROM maxd)))) AS k,
      sum(e.v) AS v, max(e.dte) AS dmax
    FROM evd e INNER JOIN attrs_f a ON a.login = e.login
    GROUP BY did, ow, cn, k4, k5, login, k
  ),
  b1 AS (
    SELECT kd, k0, login, k, sum(v) AS v, max(dmax) AS dmax
    FROM (
      SELECT arrayJoin(arrayConcat(
      [(toUInt8(0), '')],
      [(toUInt8(1), toString(did))],
      arrayFilter(t -> t.2 != '', [(toUInt8(2), ow)]),
      arrayMap(c -> (toUInt8(3), c), cn),
      arrayFilter(t -> t.2 != '', [(toUInt8(4), k4)]),
      arrayFilter(t -> t.2 != '', [(toUInt8(5), k5)])
    )) AS kk, kk.1 AS kd, kk.2 AS k0, login, k, v, dmax
      FROM b0
    )
    GROUP BY kd, k0, login, k
  ),
  pa AS (
    SELECT kd, k0, login,
      countIf(k < {{ g.n }}) AS days_cur,
      countIf(k >= {{ g.n }} AND k < {{ g.n * 2 }}) AS days_prev,
      sumIf(v, k < {{ g.n }}) AS v_cur,
      sumIf(v, k >= {{ g.n }} AND k < {{ g.n * 2 }}) AS v_prev,
      sum(v) AS v_life,
      max(k) AS fd_k,
      dateDiff('day', max(dmax), toStartOfDay((SELECT md FROM maxd))) AS gap,
      groupArray(k) AS ks_all,
      arraySort(groupArrayIf((k, toInt64(v)), k < {{ g.n }})) AS kvw
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
  CAST(ifNull(ts_views, CAST([], 'Array(Int64)')) AS Array(Int64)) AS ts_views
FROM (

SELECT
  CASE WHEN kd = 0 THEN 'total' WHEN kd = 1 THEN 'rep' WHEN kd <= 3 THEN 'grp' ELSE 'ov' END AS section,
  '{{ grain }}' AS grain,
  if(kd = 1, toInt32OrNull(k0), NULL) AS dashboard_id,
  CASE kd WHEN 2 THEN 'owner' WHEN 3 THEN 'collection' ELSE NULL END AS group_key,
  if(kd BETWEEN 2 AND 3, k0, NULL) AS group_val,
  CASE kd WHEN 4 THEN 'lvl3' WHEN 5 THEN 'spec' ELSE NULL END AS cut_key,
  if(kd BETWEEN 4 AND 5, k0, NULL) AS cut_val,
  CAST(NULL AS Nullable(Date)) AS cohort_month, toUInt64(0) AS cohort_size,
  if(kd = 1, m.dash_nm, NULL) AS dash_nm,
  if(kd = 1, m.owner_login, NULL) AS owner_login,
  if(kd = 1, m.colls, CAST([], 'Array(String)')) AS colls,
  if(kd = 1, m.published, NULL) AS published,
  if(kd = 1, m.certified, NULL) AS certified,
  if(kd = 1, m.created_dt, NULL) AS created_dt,
  users, users_prev, views, views_prev, new_users, new_users_prev,
  freq_4 + freq_5 AS regular_users, regular_users_prev, sleeping_users,
  if(users = 0, toFloat64(0), views / users) AS views_per_user, last_view_days,
  freq_1, freq_2, freq_3, freq_4, freq_5,
  (m_u).1 AS ts_k, (m_u).2 AS ts_users, (m_n).2 AS ts_new,
  (m_r).2 AS ts_react, (m_v).2 AS ts_views
FROM agg LEFT JOIN meta m ON m.mk = toInt32OrNull(k0)
WHERE kd != 1 OR v_tot >= 500

)

