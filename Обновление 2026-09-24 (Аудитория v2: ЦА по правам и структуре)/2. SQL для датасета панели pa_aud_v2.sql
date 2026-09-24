{#- pa_aud v2 — панель вкладки «Аудитория» (чарт «Аудитория: ЦА области»).
    Область — выбор СВОЕГО каталога вкладки (mode_param + sel_f: report/owner/collection,
    мультивыбор = объединение; без выбора — весь Proteus под опциями полоски).
    Слушает полоску (period_param, pub_f/act_f/exc_f). Людскую шину НЕ читает — источник.
    ЦА считает клиент: по ПРАВАМ (флаг acc у человека) или по СТРУКТУРЕ (узлы оргструктуры
    конструктора — по пути человека). Поэтому ответ несёт ЛЮДЕЙ области, а не готовые проценты:
      section = 'v'   — зрители области, упакованы по пути оргструктуры (parent = путь, k = строки
                        через \n, поля через \t): логин · ФИО · acc 1/0 · штат 1/0 · маска бакетов окна 2n
                        (bit k = активен в бакете возраста k) · возраст бакета первого визита ·
                        заходил в этом году 1/0 · дней с последнего визита · id спец. · id стрима · рук. 1/0;
      section = 'h'   — штат БЕЗ визитов в область, свёрнут: parent = путь, k = строки
                        «id спец. \t id стрима \t рук. \t человек \t из них с доступом»;
      section = 'd'   — словарь: g = 'spec' | 'stream', k = id, parent = название;
      section = 'acl' — как роздан доступ: g = 'group' (k = группа, n = человек штата в ней) | 'users'
                        (n = поимённых прав);
      section = 'total' — n = штат, state_j — эхо условий, дата свежести md, число отчётов области.
    Одна строка на человека из pa_staff ⋃ зрители pa_pair; дневной факт не читается. -#}
{% macro ou(col) %}if(match(toString(ifNull({{ col }}, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull({{ col }}, ''))){% endmacro %}
{% set GRAINS = {'d': {'n': 30}, 'w': {'n': 20}, 'm': {'n': 12}, 'q': {'n': 8}} %}
{% set grain = filter_values('period_param')|first|default('d', true) %}
{% set grain = grain if grain in GRAINS else 'd' %}
{% set g = GRAINS[grain] %}
{% macro q(values) -%}
{%- set out = [] -%}
{%- for v in values -%}{%- set _ = out.append(v|string|replace('\\', '\\\\')) -%}{%- endfor -%}
{{- out|where_in -}}
{%- endmacro %}
{% macro qa(values) -%}[{{ q(values)[1:-1] }}]{%- endmacro %}
{% macro jes(s) -%}{{ s|string|replace('\\', '\\\\')|replace('"', '\\"')|replace("'", "''") }}{%- endmacro %}
{% macro jal(a) -%}[{% for v in a %}{% if not loop.first %}, {% endif %}"{{ jes(v) }}"{% endfor %}]{%- endmacro %}
{#- id словаря: 32 бита хеша (коллизия на сотнях названий пренебрежима), в hex — короче названия. -#}
{% macro hid(x) %}lower(hex(toUInt32(cityHash64({{ x }}) % 4294967296))){% endmacro %}
{% set ACL_N = 40 %}
{% set pubv = filter_values('pub_f')|first|default('1', true) %}{% set pubv = pubv if pubv in ['0', '1'] else '1' %}
{% set actv = filter_values('act_f')|first|default('1', true) %}{% set actv = actv if actv in ['0', '1'] else '1' %}
{% set excv = filter_values('exc_f')|first|default('1', true) %}{% set excv = excv if excv in ['0', '1'] else '1' %}
{% set pmode = filter_values('mode_param')|first|default('', true) %}
{% set pmode = pmode if pmode in ['report', 'owner', 'collection'] else '' %}
{% set selr = filter_values('sel_f') or [] %}
{% set sel = [] %}{% for v in selr %}{% if v|string != '' %}{% set _ = sel.append(v|string) %}{% endif %}{% endfor %}
{% set have = pmode != '' and sel|length > 0 %}
{% set repids = [] %}{% if have and pmode == 'report' %}{% for v in sel %}{% if v|int > 0 %}{% set _ = repids.append(v|int) %}{% endif %}{% endfor %}{% endif %}
{% set SJ = ['"period":"' ~ grain ~ '"', '"n":' ~ g.n] %}
{% if have %}{% set _ = SJ.append('"mode":"' ~ pmode ~ '"') %}{% set _ = SJ.append('"sel":' ~ jal(sel)) %}{% endif %}
{% if excv == '0' %}{% set _ = SJ.append('"exc":"0"') %}{% endif %}
WITH
  maxd AS (SELECT max(ifNull(md, dmax)) AS md FROM prod_proteus.pa_pair),
  area AS (
    SELECT dashboard_id, owners_string
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1{% if pubv == '1' %} AND published = 1{% endif %}{% if actv == '1' %} AND actual_flg = 1{% endif %}
    {%- if have and pmode == 'report' %} AND dashboard_id IN ({{ repids|join(', ') if repids else '0' }}){% endif %}
    {%- if have and pmode == 'owner' %} AND owner_login IN {{ q(sel) }}{% endif %}
    {%- if have and pmode == 'collection' %} AND hasAny(collection_names, {{ qa(sel) }}){% endif %}
  ),
  vw AS (
    {#- Зрители области: одна строка на логин (OR масок пар). -#}
    SELECT lower(toString(e.login)) AS login,
      groupBitOr(toUInt64(ifNull(e.msk_{{ grain }}, 0))) AS msk,
      max(ifNull(e.kmax_{{ grain }}, 0)) AS fk,
      groupBitOr(toUInt64(ifNull(e.msk_mon, 0))) AS mon,
      max(e.dmax) AS dmax
    FROM prod_proteus.pa_pair e
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM area) AND isNotNull(e.login){% if excv == '1' %} AND ifNull(e.own_flg, 0) = 0{% endif %}
    GROUP BY login
  ),
  pp AS (
    {#- Штат ⋃ зрители. acc — есть право хотя бы на один отчёт области (поимённо или через группу). -#}
    SELECT if(ifNull(s.login, '') != '', s.login, ifNull(v.login, '')) AS lg, toUInt8(ifNull(s.login, '') != '') AS stf, toUInt8(ifNull(v.login, '') != '') AS isv,
      {{ ou('s.lvl3_management_unit_nm') }} AS l3, {{ ou('s.lvl4_management_unit_nm') }} AS l4,
      [l3, l4, {{ ou('s.lvl5_management_unit_nm') }}, {{ ou('s.lvl6_management_unit_nm') }}, {{ ou('s.lvl7_management_unit_nm') }}] AS lv,
      if(arrayFirstIndex(x -> x = '', lv) = 0, toUInt32(length(lv)), toUInt32(arrayFirstIndex(x -> x = '', lv) - 1)) AS ol,
      arrayStringConcat(arraySlice(lv, 1, ol), ' › ') AS opath,
      toString(ifNull(s.emp_specialization_desc, '')) AS spec, toString(ifNull(s.emp_stream_desc, '')) AS stream,
      toUInt8(ifNull(s.management_head_flg, 0) = 1) AS hd, toString(ifNull(s.fio, '')) AS fio,
      toUInt8(lg IN (
        SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'user' AND dashboard_id IN (SELECT dashboard_id FROM area)
        UNION ALL
        SELECT m.login FROM prod_proteus.pa_adg_member m
        WHERE m.ad_group IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'group' AND dashboard_id IN (SELECT dashboard_id FROM area)))) AS acc,
      ifNull(v.msk, toUInt64(0)) AS msk, ifNull(v.fk, 0) AS fk, ifNull(v.mon, toUInt64(0)) AS mon, v.dmax AS dmax
    FROM prod_proteus.pa_staff s
    FULL OUTER JOIN vw v ON v.login = s.login
    {%- if excv == '1' %}
    {# Выпадают только владельцы ВСЕХ отчётов области (у одного отчёта — его владельцы): их визиты — свои,
        остальные владельцы — обычные зрители чужих отчётов (как «Кто смотрит» первой вкладки: own_flg по паре). #}
    WHERE if(ifNull(s.login, '') != '', s.login, ifNull(v.login, '')) NOT IN (
      SELECT o FROM area ARRAY JOIN owners_string AS o GROUP BY o HAVING count() = (SELECT count() FROM area)){% endif %}
  ),
  k1 AS (
    {#- Зрители — строкой на человека, остальной штат — свёрнут до (путь, спец., стрим, рук.). -#}
    SELECT isv, opath, if(isv = 1, '', {{ hid('spec') }}) AS sid, if(isv = 1, '', {{ hid('stream') }}) AS tid, if(isv = 1, 0, hd) AS h0,
      if(isv = 1, arrayStringConcat([lg, fio, toString(acc), toString(stf), toString(msk), toString(fk),
          toString(toUInt8(bitAnd(mon, toUInt64(bitShiftLeft(toUInt64(1), toUInt8(toMonth((SELECT md FROM maxd))))) - 1) != 0)),
          toString(if(isNull(dmax), -1, dateDiff('day', toStartOfDay(dmax), toStartOfDay((SELECT md FROM maxd))))),
          {{ hid('spec') }}, {{ hid('stream') }}, toString(hd)], '\t'), '') AS ln,
      count() AS c, countIf(acc = 1) AS ca
    FROM pp
    GROUP BY isv, opath, sid, tid, h0, ln
  ),
  k2 AS (
    SELECT if(isv = 1, 'v', 'h') AS section, opath,
      arrayStringConcat(arraySort(groupArray(if(isv = 1, ln, arrayStringConcat([sid, tid, toString(h0), toString(c), toString(ca)], '\t')))), '\n') AS pk,
      sum(c) AS n, sum(ca) AS na
    FROM k1 GROUP BY section, opath
  )
SELECT CAST(section AS String) AS section, CAST('' AS String) AS g, CAST(pk AS String) AS k, CAST(opath AS String) AS parent,
  toInt64(n) AS n, toInt64(na) AS a, CAST(NULL AS Nullable(String)) AS state_j
FROM k2
UNION ALL
{# Словарь специализаций и стримов штата (id — тот же хеш, что в строках людей). #}
SELECT 'd', dg, {{ hid('dv') }}, dv, toInt64(0), toInt64(0), NULL
FROM (SELECT DISTINCT arrayJoin([('spec', toString(emp_specialization_desc)), ('stream', toString(emp_stream_desc))]) AS dd, dd.1 AS dg, dd.2 AS dv FROM prod_proteus.pa_staff)
UNION ALL
{# Как роздан доступ к области: крупнейшие группы (человек штата в группе) и число поимённых прав. #}
SELECT 'acl', 'group', ad_group, '', toInt64(cnt), toInt64(0), NULL
FROM (
  SELECT m.ad_group AS ad_group, uniqExact(m.login) AS cnt
  FROM prod_proteus.pa_adg_member m
  WHERE m.ad_group IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'group' AND dashboard_id IN (SELECT dashboard_id FROM area))
    AND m.login IN (SELECT login FROM prod_proteus.pa_staff)
  GROUP BY m.ad_group ORDER BY cnt DESC, ad_group LIMIT {{ ACL_N }}
)
UNION ALL
SELECT 'acl', 'users', '', '', toInt64(uniqExact(principal)), toInt64(0), NULL
FROM prod_proteus.pa_dash_acl WHERE kind = 'user' AND dashboard_id IN (SELECT dashboard_id FROM area)
UNION ALL
SELECT 'total', '', '', '', toInt64((SELECT count() FROM prod_proteus.pa_staff)), toInt64(0),
  concat('{{ "{" ~ SJ|join(", ") }}', ', "md":"', toString(toDate((SELECT md FROM maxd))), '", "areaN":', toString((SELECT count() FROM area)), '}')
