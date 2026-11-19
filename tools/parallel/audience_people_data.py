"""Isolated person-list CA extension; existing metric expressions stay intact."""
import re

PERSON_MAP_SQL = """-- Master ID is mdm_employee_rk, kept as text (never JavaScript Number).
-- MDM current login uses the SAME lr/cur rule as the existing login map.
-- A fired/ambiguous record cannot inherit another employee's reused login.
DROP TABLE IF EXISTS pa_next_person_id_map;
CREATE TABLE pa_next_person_id_map AS
WITH lr AS (
    SELECT lower(trim(m.ad_login)) AS login, m.mdm_employee_rk AS rk, max(m.business_dt) AS dt
    FROM prod_v_emart.mdm_employee_structure_d m
    WHERE nullif(trim(m.ad_login), '') IS NOT NULL
      AND m.business_dt >= current_date - interval '13 months'
    GROUP BY 1, 2
), cur AS (
    SELECT rk, login FROM (
        SELECT rk, login, row_number() OVER (PARTITION BY rk ORDER BY dt DESC, login) AS rn FROM lr
    ) x WHERE rn = 1
), ids AS (
    SELECT rk FROM cur WHERE rk IS NOT NULL
    UNION SELECT mdm_employee_rk FROM pa_next_source WHERE mdm_employee_rk IS NOT NULL
), states AS (
    SELECT m.mdm_employee_rk AS rk,
           count(DISTINCT coalesce(m.company_fire_flg::int, 0)) AS variants,
           min(coalesce(m.company_fire_flg::int, 0)) AS fired
    FROM prod_v_emart.mdm_employee_structure_d m
    WHERE m.last_state_flg = 1 AND m.mdm_employee_rk IN (SELECT rk FROM ids)
    GROUP BY 1
), mc AS (
    SELECT c.rk, coalesce(mp.canon, c.login) AS login, s.variants, s.fired
    FROM cur c LEFT JOIN pa_next_login_map mp ON mp.login = c.login
    LEFT JOIN states s ON s.rk = c.rk
), vr AS (
    SELECT v.mdm_employee_rk AS rk,
           coalesce(mp.canon, lower(trim(v.login))) AS login,
           coalesce(v.company_fire_flg::int, 0) AS fired,
           dense_rank() OVER (PARTITION BY v.mdm_employee_rk ORDER BY v.log_dttm DESC) AS rn
    FROM pa_next_source v LEFT JOIN pa_next_login_map mp ON mp.login = lower(trim(v.login))
    WHERE v.mdm_employee_rk IS NOT NULL AND nullif(trim(v.login), '') IS NOT NULL
      -- MDM branches never consume the event fallback. Exclude them before
      -- ranking; remove NULL IDs explicitly so NOT IN cannot reject all rows.
      AND v.mdm_employee_rk NOT IN (
          SELECT rk FROM cur WHERE rk IS NOT NULL UNION SELECT rk FROM states
      )
), vs AS (
    SELECT rk, min(login) AS login, count(DISTINCT login) AS logins,
           min(fired) AS fired, count(DISTINCT fired) AS variants
    FROM vr WHERE rn = 1 GROUP BY rk
), decision AS (
    SELECT i.rk::text AS master_id,
      coalesce(mc.login, vs.login, '')::text AS candidate,
      CASE
        WHEN mc.rk IS NOT NULL OR st.rk IS NOT NULL THEN
          CASE WHEN st.variants > 1 THEN 'ambiguous'
               WHEN st.fired <> 0 THEN 'inactive'
               WHEN st.variants IS NULL OR mc.login IS NULL THEN 'unknown'
               WHEN sm.login IS NULL OR sm.src <> 'mdm' THEN 'unknown'
               ELSE 'ready' END
        WHEN vs.logins > 1 OR vs.variants > 1 THEN 'ambiguous'
        WHEN vs.fired <> 0 THEN 'inactive'
        WHEN sv.src = 'mdm' THEN 'ambiguous'
        WHEN vs.login IS NULL OR sv.login IS NULL THEN 'unknown'
        ELSE 'ready'
      END::text AS status
    FROM ids i
    LEFT JOIN mc ON mc.rk = i.rk
    LEFT JOIN states st ON st.rk = i.rk
    LEFT JOIN vs ON vs.rk = i.rk
    LEFT JOIN pa_next_staff sm ON sm.login = mc.login
    LEFT JOIN pa_next_staff sv ON sv.login = vs.login
)
SELECT master_id, CASE WHEN status = 'ready' THEN candidate ELSE '' END::text AS login, status
FROM decision
DISTRIBUTED BY (master_id);
"""

JINJA = r"""
{# Explicit people are an additional CA intersection, never the people-panel bus.
   Nonempty malformed/oversized input fails closed; it cannot fall back to all staff. #}
{% set cap = namespace(on=false, bad=false, count=0, chars=0) %}
{% set calogin = [] %}{% set camaster = [] %}
{% for col, dest, allowed, maxlen in [('ca_login_f', calogin, 'abcdefghijklmnopqrstuvwxyz0123456789._@-', 128), ('ca_master_f', camaster, '0123456789', 32)] %}
{% for raw in filter_values(col) %}
{% set value = raw|string|trim %}{% if col == 'ca_login_f' %}{% set value = value|lower %}{% endif %}
{% if value %}{% set cap.on = true %}{% set cap.count = cap.count + 1 %}
{% if value|length > maxlen or cap.count > 10000 %}{% set cap.bad = true %}
{% else %}{% for ch in value %}{% if ch not in allowed %}{% set cap.bad = true %}{% endif %}{% endfor %}
{% if value not in dest %}{% set _ = dest.append(value) %}{% set cap.chars = cap.chars + value|length %}{% endif %}{% endif %}
{% endif %}{% endfor %}
{% if dest|length > 5000 %}{% set cap.bad = true %}{% endif %}
{% endfor %}
{% if cap.chars > 32000 %}{% set cap.bad = true %}{% endif %}
{% macro capcond() -%}
{% if cap.bad %} AND 0
{% else %}
{% if calogin %} AND lg IN (SELECT login FROM cap_logins){% endif %}
{% if camaster %} AND lg IN (SELECT login FROM cap_masters){% endif %}
{% endif %}
{%- endmacro %}
"""

PEOPLE_CTES = r"""
{% if not cap.bad %}
{% if calogin %}
cap_input AS (SELECT {% call H() %}arrayJoin({{ qa(calogin) }}){% endcall %} AS login),
cap_logins AS (
  SELECT toString(lm.canon) AS login FROM prod_proteus.pa_login_map lm WHERE lm.login IN (SELECT login FROM cap_input)
  UNION ALL SELECT login FROM cap_input WHERE login NOT IN (SELECT login FROM prod_proteus.pa_login_map)
),
{% endif %}
{% if camaster %}
cap_master_input AS (SELECT {% call H() %}arrayJoin({{ qa(camaster) }}){% endcall %} AS master_id),
cap_masters AS (SELECT login FROM prod_proteus.pa_person_id_map WHERE status = 'ready' AND master_id IN (SELECT master_id FROM cap_master_input)),
{% endif %}
{% endif %}
"""


def rewrite_sql(text, part):
    """Apply only the new CA set condition; no list preserves every old row."""
    if part == 'head':
        # HEAD intentionally has no incoming filters and no per-person payload.
        # Draft list counts are unknown until Apply, just like AD intersections.
        return text
    marker = '{% set custom = '
    if text.count(marker) != 1:
        raise ValueError('Expected one custom CA switch')
    text = text.replace(marker, JINJA + '\n' + marker, 1)
    if len(re.findall(r'^WITH\n', text, re.M)) != 1:
        raise ValueError('Expected one top-level CTE block')
    text = re.sub(r'^WITH\n', 'WITH\n' + PEOPLE_CTES, text, count=1, flags=re.M)
    text = re.sub(r'(\{% set custom = [^\n]*?) %\}', r'\1 or cap.on %}', text, count=1)
    # Both catalogue caset and its staff denominator have the exact AD clause;
    # ONE has it once, in condca used by every CA-dependent section.
    ad = "{%- if caadg %} AND lg IN (SELECT login FROM prod_proteus.pa_adg_member WHERE ad_group IN {{ q(caadg) }}){% endif %}"
    expected = 2 if part == 'cat' else 1
    if text.count(ad) != expected:
        raise ValueError(('CA predicate changed', part, text.count(ad)))
    text = text.replace(ad, ad + '\n{{ capcond() }}')
    # Extend the existing echo only; HEAD is deliberately independent of filters.
    echo = "'ca_head_f', 'ca_adg_f'] %}"
    if text.count(echo) != 1:
        raise ValueError('Expected one complete filter echo')
    text = text.replace(echo, "'ca_head_f', 'ca_adg_f', 'ca_login_f', 'ca_master_f'] %}")
    if part == 'one':
        # This audience total intentionally ignores aud_* (the catalogue's own
        # group), so it has a separate CA-only switch instead of `custom`.
        audience = "{%- if caorg or caspec or castrm or cahq or cait or cahead != '' or caadg %}"
        if text.count(audience) != 1:
            raise ValueError('Expected one CA-only catalogue audience total')
        text = text.replace(audience, audience.replace(' %}', ' or cap.on %}'))
        label = "{% if caadg %}{% set _ = CJ.append('\"adg\":' ~ jal(caadg)) %}{% endif %}"
        if text.count(label) != 1:
            raise ValueError('Expected one CA summary')
        text = text.replace(label, label + '\n' + "{% if calogin %}{% set _ = CJ.append('\"login\":' ~ jal(calogin)) %}{% endif %}\n{% if camaster %}{% set _ = CJ.append('\"master\":' ~ jal(camaster)) %}{% endif %}")
    return text
