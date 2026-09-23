{#- pa_people v1 — правая панель «Аудитория области» (Кто смотрит · Динамика · Закрепляемость)
    и панель «Аудитория» второго листа. Заменяет pa_who + pa_coh_v4 + pa_aud_v1.
    Слушает: полоску (period_param, pub_f/act_f/exc_f) и выбор каталога
    (mode_param + sel_f; report/owner/collection — мультивыбор = объединение,
    cut:lvl3/lvl4/spec/stream/head — эмит панели Аудитории). Людскую шину НЕ читает:
    панель — её источник (BI-паттерн: источник себя не фильтрует).
    v2 (2026-09-23): дневной факт НЕ читается — evd сворачивает предагрегат пар pa_pair
    (как каталог) до ОДНОЙ строки на логин: OR масок бакетов окна 2n, суммы просмотров,
    первый визит (kmax), маска месяцев (msk_mon — когорты и MAU). Линия «Просмотры»
    динамики — из pa_dash_bkt (отчёт × бакет). «Дней» у человека = АКТИВНЫХ ПЕРИОДОВ
    грануляции (на 30 днях — активные дни, как раньше). Дальше строка логина
    размножается по РОЛЯМ (total/freq/ctx/list/ts/coh; ctx g='org' — узлы оргструктуры
    УС-3…УС-7, k = путь «А › Б › В», parent = путь родителя; у list parent = путь человека) одним arrayJoin и сворачивается
    одним GROUP BY. UNION-плеч поверх общего CTE нет. -#}
{% set HAS_FIO = true %}{#- false — если в pa_emp_attrs ещё нет колонок fio / exp_nm (GP-параграф «PA · атрибуты зрителей» из поставки 2026-09-22) -#}
{% set HAS_ORG = true %}{#- false — если в pa_emp_attrs ещё нет lvl5…lvl7 (тот же параграф): оргструктура будет до УС-4 -#}
{% set GRAINS = {'d': {'n': 30, 'u': 'day', 'sf': 'toStartOfDay', 'gap': 7}, 'w': {'n': 20, 'u': 'week', 'sf': 'toMonday', 'gap': 1}, 'm': {'n': 12, 'u': 'month', 'sf': 'toStartOfMonth', 'gap': 1}, 'q': {'n': 8, 'u': 'quarter', 'sf': 'toStartOfQuarter', 'gap': 1}} %}
{% set grain = filter_values('period_param')|first|default('d', true) %}
{% set grain = grain if grain in GRAINS else 'd' %}
{% set g = GRAINS[grain] %}
{% set CUR = 2 ** g.n - 1 %}
{% set PREV = 2 ** (2 * g.n) - 1 - CUR %}
{% set GAPM = 2 ** g.gap - 1 %}
{#- Корзины частоты — верхние границы корзин 1–4 по АКТИВНЫМ периодам, своя шкала у каждой гранулярности
    (в 12 месяцах и 8 кварталах нет недостижимых «8–15» / «16+»). Та же таблица — в SQL каталога. -#}
{% set FBIN = {'d': [1, 3, 7, 15], 'w': [1, 3, 7, 15], 'm': [1, 3, 6, 9], 'q': [1, 2, 3, 4]}[grain] %}
{% set ADG_N = 100 %}
{% set WITH_ADG = false %}{#- true — вид «AD-группа» в «Кто смотрит». На бою у человека сотни AD-групп: их разворот
    давал ~2 с на КАЖДЫЙ клик (стенд: 1 отчёт 0,16 → 1,2 с, весь Proteus 0,5 → 2,7 с). -#}
{% macro q(values) -%}
{%- set out = [] -%}
{%- for v in values -%}{%- set _ = out.append(v|string|replace('\\', '\\\\')) -%}{%- endfor -%}
{{- out|where_in -}}
{%- endmacro %}
{% macro qa(values) -%}[{{ q(values)[1:-1] }}]{%- endmacro %}
{% macro kx(col) -%}toInt64(dateDiff('{{ g.u }}', {{ g.sf }}({{ col }}), {{ g.sf }}((SELECT md FROM maxd)))){%- endmacro %}
{% set pubv = filter_values('pub_f')|first|default('1', true) %}{% set pubv = pubv if pubv in ['0', '1'] else '1' %}
{% set actv = filter_values('act_f')|first|default('1', true) %}{% set actv = actv if actv in ['0', '1'] else '1' %}
{% set excv = filter_values('exc_f')|first|default('1', true) %}{% set excv = excv if excv in ['0', '1'] else '1' %}
{% set CUTS = {'cut:lvl3': 'lvl3_management_unit_nm', 'cut:lvl4': 'lvl4_management_unit_nm', 'cut:spec': 'emp_specialization_desc', 'cut:stream': 'emp_stream_desc', 'cut:head': 'toString(management_head_flg)'} %}
{% set pmode = filter_values('mode_param')|first|default('', true) %}
{% set pmode = pmode if pmode in ['report', 'owner', 'collection'] or pmode in CUTS else '' %}
{% set selr = filter_values('sel_f') or [] %}
{% set sel = [] %}{% for v in selr %}{% if v|string != '' %}{% set _ = sel.append(v|string) %}{% endif %}{% endfor %}
{% set have = pmode != '' and sel|length > 0 %}
{% set repids = [] %}{% if have and pmode == 'report' %}{% for v in sel %}{% if v|int > 0 %}{% set _ = repids.append(v|int) %}{% endif %}{% endfor %}{% endif %}
WITH
  {# Дата свежести — как у каталога: md пары, запасной источник — последний визит. #}
  maxd AS (SELECT max(ifNull(md, dmax)) AS md FROM prod_proteus.pa_pair),
  dash_ok AS (
    SELECT dashboard_id
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1{% if pubv == '1' %} AND published = 1{% endif %}{% if actv == '1' %} AND actual_flg = 1{% endif %}
    {%- if have and pmode == 'report' %} AND dashboard_id IN ({{ repids|join(', ') if repids else '0' }}){#- мусор / пустое пересечение каталога → пустая область -#}{% endif %}
    {%- if have and pmode == 'owner' %} AND owner_login IN {{ q(sel) }}{% endif %}
    {%- if have and pmode == 'collection' %} AND hasAny(collection_names, {{ qa(sel) }}){% endif %}
  ),
  evd AS (
    {#- Одна строка на зрителя области из пар: msk — bit k = активен в бакете возраста k (k < 2n),
        fd_k — возраст бакета первого визита, mon — bit = возраст месяца активности. -#}
    SELECT toString(ifNull(e.login, '')) AS login,
      groupBitOr(toUInt64(ifNull(e.msk_{{ grain }}, 0))) AS msk,
      sum(ifNull(e.v_{{ grain }}, 0)) AS v_cur,
      sum(ifNull(e.vp_{{ grain }}, 0)) AS v_prev,
      max(ifNull(e.kmax_{{ grain }}, 0)) AS fd_k,
      max(e.dmax) AS dmax,
      groupBitOr(toUInt64(ifNull(e.msk_mon, 0))) AS mon
    FROM prod_proteus.pa_pair e
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(e.login){% if excv == '1' %} AND ifNull(e.own_flg, 0) = 0{% endif %}
    {%- if have and pmode in CUTS %} AND e.login IN (SELECT login FROM prod_proteus.pa_emp_attrs WHERE {{ CUTS[pmode] }} IN {{ q(sel) }}){% endif %}
    GROUP BY e.login
  ),
  pr AS (
    {#- Зритель + атрибуты + роли, в которые он попадает. -#}
    SELECT p.login AS login, p.msk AS msk, bitCount(bitAnd(p.msk, {{ CUR }})) AS days, p.v_cur AS v_cur, p.v_prev AS v_prev,
      p.fd_k AS fd_k, p.dmax AS dmax, toUInt8(bitTest(p.mon, 1)) AS m1, toUInt8(bitTest(p.mon, 2)) AS m2,
      {#- Месяцы активности из маски: возраст самого старого — месяц первого визита (когорта). -#}
      arrayMap(i -> toInt64(i), arrayFilter(i -> bitTest(p.mon, i), range(63))) AS bms,
      if(empty(bms), toInt64(0), arrayMax(bms)) AS gm,
      addMonths(toStartOfMonth((SELECT md FROM maxd)), -toInt32(gm)) AS c0,
      bitAnd(p.msk, {{ CUR }}) != 0 AS cur, bitAnd(p.msk, {{ PREV }}) != 0 AS prv,
      bitCount(bitAnd(p.msk, {{ CUR }})) AS nb_cur, bitCount(bitAnd(p.msk, {{ PREV }})) AS nb_prev,
      multiIf(nb_cur <= {{ FBIN[0] }}, 1, nb_cur <= {{ FBIN[1] }}, 2, nb_cur <= {{ FBIN[2] }}, 3, nb_cur <= {{ FBIN[3] }}, 4, 5) AS bin,  {#- корзина — по АКТИВНЫМ ПЕРИОДАМ грануляции (как «постоянные» 8+ в кубе) -#}
      {# Атрибуты — строго не-Nullable: при join_use_nulls = 1 LEFT JOIN даёт NULL у логинов без атрибутов,
         а arrayConcat ролей в CH 24 приводит массивы к типу первого — NULL ронял запрос (Code 349). #}
      toString(ifNull(a.lvl3_management_unit_nm, '')) AS lvl3, toString(ifNull(a.lvl4_management_unit_nm, '')) AS lvl4,
      {#- Оргструктура УС-3…УС-7: путь «УС-3 › УС-4 › …» до первого пустого уровня. Узел дерева = префикс пути,
          поэтому одноимённые отделы разных департаментов не склеиваются. -#}
      [lvl3, lvl4{% if HAS_ORG %}, toString(ifNull(a.lvl5_management_unit_nm, '')), toString(ifNull(a.lvl6_management_unit_nm, '')), toString(ifNull(a.lvl7_management_unit_nm, '')){% endif %}] AS lv,
      {#- Обе ветки if — одного типа (UInt32): в CH 24 if(UInt64, Int64) падает «no supertype». -#}
      if(arrayFirstIndex(x -> x = '', lv) = 0, toUInt32(length(lv)), toUInt32(arrayFirstIndex(x -> x = '', lv) - 1)) AS ol,
      arrayStringConcat(arraySlice(lv, 1, ol), ' › ') AS opath,
      toString(ifNull(a.emp_specialization_desc, '')) AS spec, toString(ifNull(a.emp_stream_desc, '')) AS stream,
      toUInt8(ifNull(a.management_head_flg, 0) = 1) AS is_head,
      {% if HAS_FIO %}toString(ifNull(a.fio, '')) AS fio, toString(ifNull(a.exp_nm, '')) AS exp{% else %}'' AS fio, '' AS exp{% endif %},
      arrayFilter(x -> x >= 1 AND x <= 11, arrayMap(y -> gm - y, bms)) AS ags,
      arrayJoin(arrayConcat(
        [('total', '', '', '', toInt64(-1))],
        if(cur, [('freq', '', toString(bin), '', toInt64(-1))], []),
        if(cur OR prv, arrayMap(i -> ('ctx', 'org', arrayStringConcat(arraySlice(lv, 1, i), ' › '), arrayStringConcat(arraySlice(lv, 1, toUInt32(i - 1)), ' › '), toInt64(-1)), range(1, ol + 1)), []),
        if((cur OR prv) AND spec != '', [('ctx', 'spec', spec, '', toInt64(-1))], []),
        if((cur OR prv) AND stream != '', [('ctx', 'stream', stream, '', toInt64(-1))], []),
        if((cur OR prv) AND is_head = 1, [('ctx', 'head', '1', '', toInt64(-1))], []),
        {% if WITH_ADG %}if(cur OR prv, arrayMap(x -> ('ctx', 'adg', toString(ifNull(x, '')), '', toInt64(-1)), arrayFilter(x -> isNotNull(x) AND x != '', a.ad_groups)), []),{% endif %}
        if(cur, [('list', '', toString(p.login), opath, toInt64(-1))], []),
        if(gm < 12, [('coh', '', toString(c0), '', toInt64(-1))], []),
        {#- Динамика: строка на каждый активный бакет текущего окна (просмотры — из pa_dash_bkt ниже). -#}
        if(cur, arrayMap(t -> ('ts', '', toString(t), '', toInt64(t)), arrayFilter(t -> bitTest(p.msk, t), range({{ g.n }}))), [])
      )) AS rk
    FROM evd p
    LEFT JOIN prod_proteus.pa_emp_attrs a ON a.login = p.login
  ),
  agg AS (
    SELECT rk.1 AS role, rk.2 AS g, rk.3 AS k, rk.4 AS parent,
      countIf(cur) AS users, countIf(prv) AS users_prev,
      sum(if(rk.1 = 'ts', 0, v_cur)) AS views, any(rk.5) AS tk,
      sum(v_prev) AS views_prev,
      countIf(if(rk.1 = 'ts', rk.5 = fd_k, cur AND fd_k < {{ g.n }})) AS new_u,
      countIf(prv AND fd_k >= {{ g.n }} AND fd_k < {{ 2 * g.n }}) AS new_prev,
      countIf(rk.1 = 'ts' AND rk.5 != fd_k AND bitAnd(msk, toUInt64(bitShiftLeft(toUInt64({{ GAPM }}), toUInt8(rk.5 + 1)))) = 0) AS react_u,
      countIf(nb_cur > {{ FBIN[2] }}) AS regular, countIf(nb_prev > {{ FBIN[2] }}) AS regular_prev,
      countIf(prv AND NOT cur) AS sleeping,
      countIf(m1 = 1) AS mau, countIf(m2 = 1) AS mau_prev,
      count() AS cnt,
      sumMap(if(rk.1 = 'coh', ags, CAST([], 'Array(Int64)')), if(rk.1 = 'coh', arrayMap(x -> toUInt64(1), ags), CAST([], 'Array(UInt64)'))) AS am,
      any(login) AS login, any(fio) AS fio, any(lvl3) AS lvl3, any(lvl4) AS lvl4, any(spec) AS spec,
      any(stream) AS stream, any(exp) AS exp, any(is_head) AS is_head, any(days) AS days,
      any(toDate(dmax)) AS last_dt, any(bin) AS bin
    FROM pr
    GROUP BY role, g, k, parent
  ),
  bv AS (
    {#- Просмотры по бакетам окна (линия «Просмотры» динамики). Людской срез области (cut:*) —
        только из факта: у pa_dash_bkt разбивки по людям нет. -#}
    {%- if have and pmode in CUTS %}
    SELECT {{ kx('e.log_dttm') }} AS bk, sum(e.views) AS bviews
    FROM prod_proteus.pa_evd_day e
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND {{ kx('e.log_dttm') }} < {{ g.n }}
      AND e.login IN (SELECT login FROM prod_proteus.pa_emp_attrs WHERE {{ CUTS[pmode] }} IN {{ q(sel) }})
      {%- if excv == '1' %} AND (e.dashboard_id, e.login) NOT IN (SELECT dashboard_id, login FROM prod_proteus.pa_pair WHERE own_flg = 1){% endif %}
    GROUP BY bk
    {%- else %}
    SELECT toInt64(k) AS bk, sum({{ 'views_nown' if excv == '1' else 'views' }}) AS bviews
    FROM prod_proteus.pa_dash_bkt
    WHERE grain = '{{ grain }}' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)
    GROUP BY bk
    {%- endif %}
  ),
  rnk AS (
    SELECT *,
      row_number() OVER (PARTITION BY role, g ORDER BY if(role = 'list', days, users) DESC, views DESC, k) AS rn
    FROM agg
  )
SELECT
  CAST(section AS String) AS section,
  CAST(g AS Nullable(String)) AS g,
  CAST(k AS Nullable(String)) AS k,
  CAST(parent AS Nullable(String)) AS parent,
  CAST(login AS Nullable(String)) AS login,
  CAST(fio AS Nullable(String)) AS fio,
  CAST(lvl3 AS Nullable(String)) AS lvl3,
  CAST(lvl4 AS Nullable(String)) AS lvl4,
  CAST(spec AS Nullable(String)) AS spec,
  CAST(stream AS Nullable(String)) AS stream,
  CAST(exp AS Nullable(String)) AS exp,
  CAST(is_head AS Nullable(UInt8)) AS is_head,
  CAST(days AS Nullable(UInt32)) AS days,
  CAST(last_dt AS Nullable(Date)) AS last_dt,
  CAST(bin AS Nullable(UInt8)) AS bin,
  CAST(ifNull(users, 0) AS UInt64) AS users,
  CAST(ifNull(users_prev, 0) AS UInt64) AS users_prev,
  CAST(ifNull(views, 0) AS Int64) AS views,
  CAST(ifNull(views_prev, 0) AS Int64) AS views_prev,
  CAST(ifNull(new_u, 0) AS UInt64) AS new_u,
  CAST(ifNull(new_prev, 0) AS UInt64) AS new_prev,
  CAST(ifNull(react_u, 0) AS UInt64) AS react_u,
  CAST(ifNull(regular, 0) AS UInt64) AS regular,
  CAST(ifNull(regular_prev, 0) AS UInt64) AS regular_prev,
  CAST(ifNull(sleeping, 0) AS UInt64) AS sleeping,
  CAST(ifNull(mau, 0) AS UInt64) AS mau,
  CAST(ifNull(mau_prev, 0) AS UInt64) AS mau_prev,
  CAST(ifNull(cnt, 0) AS UInt64) AS cnt,
  CAST(ages AS Array(Int64)) AS ages,
  CAST(acts AS Array(UInt64)) AS acts
FROM (
  SELECT role AS section, g, k, parent,
    if(role = 'list', login, NULL) AS login, if(role = 'list', fio, NULL) AS fio,
    if(role = 'list', lvl3, NULL) AS lvl3, if(role = 'list', lvl4, NULL) AS lvl4,
    if(role = 'list', spec, NULL) AS spec, if(role = 'list', stream, NULL) AS stream,
    if(role = 'list', exp, NULL) AS exp, if(role = 'list', is_head, NULL) AS is_head,
    if(role = 'list', days, NULL) AS days, if(role = 'list', last_dt, NULL) AS last_dt,
    if(role = 'list', bin, NULL) AS bin,
    users, users_prev, if(role = 'ts', toInt64(ifNull(b.bviews, 0)), toInt64(views)) AS views, views_prev, new_u, new_prev, react_u, regular, regular_prev,
    sleeping, mau, mau_prev, cnt, (am).1 AS ages, (am).2 AS acts
  FROM rnk
  LEFT JOIN bv b ON b.bk = rnk.tk
  WHERE role != 'list' AND (g != 'adg' OR rn <= {{ ADG_N }})

  UNION ALL
  {# Поимённый список — ВСЕ зрители области, упакованные: одна строка на подразделение
     (parent = путь «УС-3 › … › УС-7»), в k — сотрудники через \n, поля через \t:
     логин, ФИО, специализация, стрим, стаж, рук., активных периодов, просмотров, последний визит, корзина.
     Путь не повторяется у каждого человека, 30 пустых колонок на человека не едут —
     ответ в ~6 раз легче построчного (весь Proteus: 21 МБ → ~3 МБ). cnt — людей в строке. #}
  SELECT 'list' AS section, '' AS g,
    arrayStringConcat(groupArray(concat(
      replaceRegexpAll(ifNull(toString(lp.login), ''), '[\t\n\r]', ' '), '\t', replaceRegexpAll(ifNull(toString(lp.fio), ''), '[\t\n\r]', ' '), '\t',
      replaceRegexpAll(ifNull(toString(lp.spec), ''), '[\t\n\r]', ' '), '\t', replaceRegexpAll(ifNull(toString(lp.stream), ''), '[\t\n\r]', ' '), '\t',
      replaceRegexpAll(ifNull(toString(lp.exp), ''), '[\t\n\r]', ' '), '\t', ifNull(toString(lp.is_head), ''), '\t', ifNull(toString(lp.days), ''), '\t',
      ifNull(toString(lp.views), ''), '\t', ifNull(toString(lp.last_dt), ''), '\t', ifNull(toString(lp.bin), ''))), '\n') AS k,
    lp.parent AS parent,
    NULL AS login, NULL AS fio, NULL AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, NULL AS exp, NULL AS is_head,
    NULL AS days, NULL AS last_dt, NULL AS bin,
    toUInt64(0) AS users, toUInt64(0) AS users_prev, toInt64(0) AS views, toInt64(0) AS views_prev,
    toUInt64(0) AS new_u, toUInt64(0) AS new_prev, toUInt64(0) AS react_u, toUInt64(0) AS regular,
    toUInt64(0) AS regular_prev, toUInt64(0) AS sleeping, toUInt64(0) AS mau, toUInt64(0) AS mau_prev,
    count() AS cnt, CAST([], 'Array(Int64)') AS ages, CAST([], 'Array(UInt64)') AS acts
  FROM agg lp
  WHERE lp.role = 'list'
  GROUP BY lp.parent

  UNION ALL
  {# Эхо области: что выбрано (g = режим, k = значения через \n, fio = имя одиночного отчёта), parent = грануляция.
      Плечо не читает факт — только мету по id. #}
  SELECT 'area' AS section, '{{ pmode if have else '' }}' AS g,
    {% if have %}{{ q([sel|join('\n')]) }}{% else %}''{% endif %} AS k, '{{ grain }}' AS parent,
    NULL AS login,
    {% if have and pmode == 'report' and repids|length == 1 %}ifNull((SELECT any(dashboard_nm) FROM prod_proteus.pa_dash_meta WHERE dashboard_id = {{ repids[0] }}), ''){% else %}NULL{% endif %} AS fio,
    NULL AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, NULL AS exp, NULL AS is_head,
    NULL AS days, NULL AS last_dt, NULL AS bin,
    toUInt64(0) AS users, toUInt64(0) AS users_prev, toInt64(0) AS views, toInt64(0) AS views_prev,
    toUInt64(0) AS new_u, toUInt64(0) AS new_prev, toUInt64(0) AS react_u, toUInt64(0) AS regular,
    toUInt64(0) AS regular_prev, toUInt64(0) AS sleeping, toUInt64(0) AS mau, toUInt64(0) AS mau_prev,
    toUInt64(0) AS cnt, CAST([], 'Array(Int64)') AS ages, CAST([], 'Array(UInt64)') AS acts
)
