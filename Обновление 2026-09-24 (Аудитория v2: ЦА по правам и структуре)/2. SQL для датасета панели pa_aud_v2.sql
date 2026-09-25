{#- pa_aud v3 — панель вкладки «Аудитория» (чарт «Аудитория: ЦА области»).
    Область — выбор СВОЕГО каталога вкладки (mode_param + sel_f: report/owner/collection,
    мультивыбор = объединение; без выбора — весь Proteus под опциями полоски).
    Слушает полоску (period_param, pub_f/act_f/exc_f) и СВОЙ эмит применённой ЦА (самовлияние ВКЛ):
      ca_org_f (пути «УС-3 › …», узел = всё поддерево) · ca_spec_f · ca_stream_f · ca_hq_f · ca_it_f ·
      ca_head_f ('1' — руководители, 'n' — не руководители). Есть хоть одно — ЦА «ПО УСЛОВИЯМ»
      (весь штат под условиями, одна на все отчёты области); нет — ЦА «ПО ПРАВАМ» (право хотя бы
      на один отчёт области). Людскую шину (org_f … freq_f) НЕ читает — она для каталога.
    Ответ — ЛЮДИ области (проценты считает чарт):
      section = 'v' — зрители, упаковка по пути оргструктуры (parent = путь; k — строки через \n, поля
                      через \t): логин · ФИО · доступ 1/0 · штат 1/0 · маска текущего окна · маска
                      предыдущего окна (по n ≤ 30 бит — JS точен до 2^53) · возраст первого визита ·
                      в этом году 1/0 · дней с визита · id спец. · id стрима · рук. 1/0 · просмотров ·
                      стаж · id HQ · id IT · в ЦА 1/0;
      section = 'n' — НЕ заходившие из ЦА поимённо (только если их ≤ NAMES_MAX): логин · ФИО · id спец. ·
                      id стрима · рук. · id HQ · id IT · доступ 1/0 · стаж;
      section = 'h' — штат без визитов, свёрнут: «id спец. · id стрима · рук. · id HQ · id IT · человек ·
                      с доступом · в ЦА · в ЦА и с доступом» (для счётчика настройки ЦА и итогов групп);
      section = 'd' — словарь: g = spec | stream | hq | it, k = id, parent = значение;
      section = 'acl' — как роздан доступ: g = group (k = группа, n = людей штата) | users (n = поимённых);
      section = 'total' — n = штат, k = названия до 3 отчётов области, state_j — эхо условий
                      (period, n, mode, sel, exc, caMode acc|cond, ca{…}, md, areaN). Нет строк 'n' при
                      «в ЦА не заходили» > 0 в 'h' — имён больше NAMES_MAX, чарт это видит сам.
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
{% set NAMES_MAX = 20000 %}{#- больше не заходивших из ЦА — имён не отдаём (ответ не раздувается), только числа -#}
{#- Применённая ЦА (эмит самой панели). Списки строятся циклом: при сохранении датасета filter_values = AlwaysTrueObject. -#}
{% set caorg = [] %}{% for v in (filter_values('ca_org_f') or []) %}{% if v|string != '' and (v|string).split(' › ')|length <= 5 %}{% set _ = caorg.append(v|string) %}{% endif %}{% endfor %}
{% set caspec = [] %}{% for v in (filter_values('ca_spec_f') or []) %}{% if v|string != '' %}{% set _ = caspec.append(v|string) %}{% endif %}{% endfor %}
{% set castrm = [] %}{% for v in (filter_values('ca_stream_f') or []) %}{% if v|string != '' %}{% set _ = castrm.append(v|string) %}{% endif %}{% endfor %}
{% set cahq = [] %}{% for v in (filter_values('ca_hq_f') or []) %}{% set _ = cahq.append(v|string) %}{% endfor %}
{% set cait = [] %}{% for v in (filter_values('ca_it_f') or []) %}{% set _ = cait.append(v|string) %}{% endfor %}
{% set cahead = filter_values('ca_head_f')|first|default('', true) %}{% set cahead = cahead if cahead in ['1', 'n'] else '' %}
{% set custom = caorg or caspec or castrm or cahq or cait or cahead != '' %}
{#- Условие ЦА над строкой штата; op — нормализованный путь «УС-3 › …» этой строки. -#}
{% macro cond() -%}
1{% if caorg %} AND arrayExists(pz -> op = pz OR startsWith(op, concat(pz, ' › ')), {{ qa(caorg) }}){% endif %}
{%- if caspec %} AND spec IN {{ q(caspec) }}{% endif %}{% if castrm %} AND stream IN {{ q(castrm) }}{% endif %}
{%- if cahq %} AND hq IN {{ q(cahq) }}{% endif %}{% if cait %} AND it IN {{ q(cait) }}{% endif %}
{%- if cahead == '1' %} AND hd = 1{% elif cahead == 'n' %} AND hd = 0{% endif %}
{%- endmacro %}
{% set SJ = ['"period":"' ~ grain ~ '"', '"n":' ~ g.n] %}
{% set CJ = [] %}
{% if caorg %}{% set _ = CJ.append('"org":' ~ jal(caorg)) %}{% endif %}
{% if caspec %}{% set _ = CJ.append('"spec":' ~ jal(caspec)) %}{% endif %}
{% if castrm %}{% set _ = CJ.append('"stream":' ~ jal(castrm)) %}{% endif %}
{% if cahq %}{% set _ = CJ.append('"hq":' ~ jal(cahq)) %}{% endif %}
{% if cait %}{% set _ = CJ.append('"it":' ~ jal(cait)) %}{% endif %}
{% if cahead %}{% set _ = CJ.append('"head":"' ~ cahead ~ '"') %}{% endif %}
{% set _ = SJ.append('"caMode":"' ~ ('cond' if custom else 'acc') ~ '"') %}
{% set _ = SJ.append('"ca":{' ~ CJ|join(', ') ~ '}') %}
{% if have %}{% set _ = SJ.append('"mode":"' ~ pmode ~ '"') %}{% set _ = SJ.append('"sel":' ~ jal(sel)) %}{% endif %}
{% if excv == '0' %}{% set _ = SJ.append('"exc":"0"') %}{% endif %}
WITH
  maxd AS (SELECT max(ifNull(md, dmax)) AS md FROM prod_proteus.pa_pair),
  area AS (
    SELECT dashboard_id, owners_string, dashboard_nm
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
      sum(ifNull(e.v_{{ grain }}, 0)) AS vc,
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
      arrayStringConcat(arraySlice(lv, 1, ol), ' › ') AS op,
      toUInt8(ifNull(s.management_head_flg, 0) = 1) AS hd, toString(ifNull(s.fio, '')) AS fio, toString(ifNull(s.exp_nm, '')) AS exn,
      toString(ifNull(s.hq_code, '')) AS hq, toString(ifNull(s.it_code, '')) AS it,
      toUInt8(lg IN (
        SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'user' AND dashboard_id IN (SELECT dashboard_id FROM area)
        UNION ALL
        SELECT m.login FROM prod_proteus.pa_adg_member m
        WHERE m.ad_group IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'group' AND dashboard_id IN (SELECT dashboard_id FROM area)))) AS acc,
      ifNull(v.msk, toUInt64(0)) AS msk, ifNull(v.fk, 0) AS fk, ifNull(v.mon, toUInt64(0)) AS mon, ifNull(v.vc, 0) AS vc, v.dmax AS dmax,
      {#- В ЦА: по условиям — штат под условиями; по правам — штат с правом на отчёт области. -#}
      toUInt8(stf = 1 AND {% if custom %}{{ cond() }}{% else %}acc = 1{% endif %}) AS inca
    FROM prod_proteus.pa_staff s
    FULL OUTER JOIN vw v ON v.login = s.login
    {%- if excv == '1' %}
    {# Выпадают только владельцы ВСЕХ отчётов области (у одного отчёта — его владельцы): их визиты — свои,
        остальные владельцы — обычные зрители чужих отчётов (как «Кто смотрит» первой вкладки: own_flg по паре). #}
    WHERE if(ifNull(s.login, '') != '', s.login, ifNull(v.login, '')) NOT IN (
      SELECT o FROM area ARRAY JOIN owners_string AS o GROUP BY o HAVING count() = (SELECT count() FROM area)){% endif %}
  ),
  k1 AS (
    {#- Роль строки: зритель — v (строкой на человека); штат без визитов — h (свёрнут по ключу) и, если
        в ЦА, ещё n (строкой на человека — список «не заходили»). Один проход по pp, без UNION-плеч. -#}
    SELECT rl, opath,
      if(rl = 'h', {{ hid('spec') }}, '') AS sid, if(rl = 'h', {{ hid('stream') }}, '') AS tid, if(rl = 'h', hd, 0) AS h0,
      if(rl = 'h', {{ hid('hq') }}, '') AS qid, if(rl = 'h', {{ hid('it') }}, '') AS iid,
      multiIf(rl = 'v', arrayStringConcat([lg, fio, toString(acc), toString(stf), toString(bitAnd(msk, {{ 2 ** g.n - 1 }})), toString(bitShiftRight(msk, {{ g.n }})), toString(fk),
          toString(toUInt8(bitAnd(mon, toUInt64(bitShiftLeft(toUInt64(1), toUInt8(toMonth((SELECT md FROM maxd))))) - 1) != 0)),
          toString(if(isNull(dmax), -1, dateDiff('day', toStartOfDay(dmax), toStartOfDay((SELECT md FROM maxd))))),
          {{ hid('spec') }}, {{ hid('stream') }}, toString(hd), toString(vc), exn, {{ hid('hq') }}, {{ hid('it') }}, toString(inca)], '\t'),
        rl = 'n', arrayStringConcat([lg, fio, {{ hid('spec') }}, {{ hid('stream') }}, toString(hd), {{ hid('hq') }}, {{ hid('it') }}, toString(acc), exn], '\t'),
        '') AS ln,
      count() AS c, countIf(acc = 1) AS ca, countIf(inca = 1) AS cn, countIf(inca = 1 AND acc = 1) AS cna
    FROM pp
    ARRAY JOIN if(isv = 1, ['v'], if(inca = 1, ['h', 'n'], ['h'])) AS rl
    GROUP BY rl, opath, sid, tid, h0, qid, iid, ln
  ),
  k2 AS (
    SELECT rl AS section, opath,
      arrayStringConcat(arraySort(groupArray(if(rl = 'h', arrayStringConcat([sid, tid, toString(h0), qid, iid, toString(c), toString(ca), toString(cn), toString(cna)], '\t'), ln))), '\n') AS pk,
      sum(c) AS n, sum(ca) AS na
    FROM k1 GROUP BY section, opath
  ),
  k3 AS (
    {#- Имена не заходивших — только если их не больше NAMES_MAX (иначе ЦА надо сузить условиями). -#}
    SELECT section, opath, pk, n, na, sumIf(n, section = 'n') OVER () AS nnever FROM k2
  )
SELECT CAST(section AS String) AS section, CAST('' AS String) AS g, CAST(pk AS String) AS k, CAST(opath AS String) AS parent,
  toInt64(n) AS n, toInt64(na) AS a, CAST(NULL AS Nullable(String)) AS state_j
FROM k3
WHERE section != 'n' OR nnever <= {{ NAMES_MAX }}
UNION ALL
{# Словарь специализаций, стримов, HQ и IT штата (id — тот же хеш, что в строках людей). #}
SELECT 'd', dg, {{ hid('dv') }}, dv, toInt64(0), toInt64(0), NULL
FROM (SELECT DISTINCT arrayJoin([('spec', toString(ifNull(emp_specialization_desc, ''))), ('stream', toString(ifNull(emp_stream_desc, ''))), ('hq', toString(ifNull(hq_code, ''))), ('it', toString(ifNull(it_code, '')))]) AS dd, dd.1 AS dg, dd.2 AS dv FROM prod_proteus.pa_staff)
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
SELECT 'total', '', arrayStringConcat((SELECT groupArray(nm) FROM (SELECT toString(dashboard_nm) AS nm FROM area ORDER BY dashboard_id LIMIT 3)), '\n'), '',
  toInt64((SELECT count() FROM prod_proteus.pa_staff)), toInt64(0),
  concat('{{ "{" ~ SJ|join(", ") }}', ', "md":"', toString(toDate((SELECT md FROM maxd))), '", "areaN":', toString((SELECT count() FROM area)), '}')
