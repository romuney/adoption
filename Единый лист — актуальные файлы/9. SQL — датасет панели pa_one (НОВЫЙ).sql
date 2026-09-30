{#- pa_one — панель ЕДИНОГО листа (объединение «Использование» + «Охват ЦА», 2026-09-30).
    Всё, что считал pa_people (KPI области, корзины, группы, динамика, календарь, когорты), плюс целевая аудитория
    второго листа (охват, путь ЦА, кто из ЦА, не заходившие) — ОДНИМ запросом, одним списком людей.
    Слушает: шапку (period_param, pub_f/act_f/exc_f), выбор каталога (mode_param + sel_f) и строку
    «Целевая аудитория» (ca_org_f · ca_spec_f · ca_stream_f · ca_hq_f · ca_it_f · ca_head_f · ca_adg_f).
    Людскую шину (org_f … freq_f) НЕ читает — панель её источник.
    ЦА «по правам» (условий нет): зрители НЕ сужаются; у человека флаг «в ЦА» = действующий сотрудник (pa_staff)
      с правом хотя бы на один отчёт области. ЦА «по условиям»: ВСЕ числа панели — только по людям ЦА
      (как каталог): evd сужен до логинов ЦА, просмотры по периодам — по дневному факту этих людей.
    Секции ответа: area / total / freq / ctx / ts / cal / coh — как в pa_people;
      list — ВСЕ зрители текущего периода, упакованные по пути оргструктуры (поля — у плеча list ниже),
             специализация/стрим/стаж/HQ/IT — кодами словаря d (ответ в JSON Superset в ~2 раза легче);
      h — штат БЕЗ визитов в текущем периоде, свёрнут: «код спец · код стрима · рук · код HQ · код IT · человек ·
          с доступом · в ЦА · в ЦА и с доступом» (итоги ЦА и групп считает чарт: зрители из list + h);
      n — поимённо люди ЦА без визитов в текущем периоде (только если их ≤ NAMES_MAX);
      d — словарь: g = spec | stream | exp | hq | it, k = код, parent = значение;
      acl — как роздан доступ: g = group (k = группа, users = людей штата) | users (users = поимённых прав).
    Колонки ca_prev / ca_regprev / ca_yr / ca_out (у total) — ЦА: заходили в пред. периоде / из них постоянные /
    заходили в этом году / зрители вне ЦА; state_j (у area) — штат, режим ЦА и применённые условия. -#}
{% set HAS_FIO = true %}{#- false — если в pa_emp_attrs ещё нет колонок fio / exp_nm (GP-параграф «PA · атрибуты зрителей» из поставки 2026-09-22) -#}
{% set HAS_ORG = true %}{#- false — если в pa_emp_attrs ещё нет lvl5…lvl7 (тот же параграф): оргструктура будет до УС-4 -#}
{#- Уровень УС: заглушки оргструктуры («-», «—», «…», пробелы — только знаки препинания) = пусто;
    путь «УС-3 › …» обрывается на них, как на пустом уровне (иначе «-» становится отдельным подразделением). -#}
{% macro ou(col) %}if(match(toString(ifNull(a.{{ col }}, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(a.{{ col }}, ''))){% endmacro %}
{% set GRAINS = {'d': {'n': 30, 'u': 'day', 'sf': 'toStartOfDay', 'gap': 7}, 'w': {'n': 20, 'u': 'week', 'sf': 'toMonday', 'gap': 1}, 'm': {'n': 12, 'u': 'month', 'sf': 'toStartOfMonth', 'gap': 1}, 'q': {'n': 8, 'u': 'quarter', 'sf': 'toStartOfQuarter', 'gap': 1}} %}
{% set grain = filter_values('period_param')|first|default('d', true) %}
{% set grain = grain if grain in GRAINS else 'd' %}
{% set g = GRAINS[grain] %}
{% set CUR = 2 ** g.n - 1 %}
{% set PREV = 2 ** (2 * g.n) - 1 - CUR %}
{% set GAPM = 2 ** g.gap - 1 %}
{#- Корзины частоты — верхние границы корзин 1–3 (четвёртая — открытая «N+») по АКТИВНЫМ периодам, своя шкала у каждой гранулярности
    (в 12 месяцах и 8 кварталах нет недостижимых «8–15» / «16+»). Та же таблица — в SQL каталога. -#}
{% set FBIN = {'d': [1, 5, 15], 'w': [1, 5, 15], 'm': [1, 3, 6], 'q': [1, 2, 3]}[grain] %}
{% set ADG_N = 100 %}
{% set HIST_DAYS = 90 %}{#- сколько истории нужно до начала периода, чтобы отличить нового от давно не заходившего -#}
{% set WITH_ADG = false %}{#- true — вид «AD-группа» в «Кто смотрит». На бою у человека сотни AD-групп: их разворот
    давал ~2 с на КАЖДЫЙ клик (стенд: 1 отчёт 0,16 → 1,2 с, весь Proteus 0,5 → 2,7 с). -#}
{% macro q(values) -%}
{%- set out = [] -%}
{%- for v in values -%}{%- set _ = out.append(v|string|replace('\\', '\\\\')) -%}{%- endfor -%}
{{- out|where_in -}}
{%- endmacro %}
{% macro qa(values) -%}[{{ q(values)[1:-1] }}]{%- endmacro %}
{#- Даты — ОДИН скалярный подзапрос на весь запрос: одинаковые скаляры ClickHouse считает один раз, а разные
    ((SELECT md …), (SELECT kt …), (SELECT ds …)) — каждый своим сканом pa_pair. -#}
{% set MD = "tupleElement((SELECT h FROM maxd), 1)" %}{% set DS = "tupleElement((SELECT h FROM maxd), 2)" %}{% set KT = "tupleElement((SELECT h FROM maxd), 3)" %}{% set KTD = "tupleElement((SELECT h FROM maxd), 4)" %}
{#- Календарь посещений (роль cal): дни за последние CAL_N дней по маске pa_pair.msk_d — при любой грануляции.
    Просмотры по дням — pa_dash_bkt (грануляция d), они есть только за 30 дней. -#}
{% set CAL_N = 60 %}
{% macro kd(col) -%}toInt64(dateDiff('day', toStartOfDay({{ col }}), toStartOfDay({{ MD }}))){%- endmacro %}
{% macro kx(col) -%}toInt64(dateDiff('{{ g.u }}', {{ g.sf }}({{ col }}), {{ g.sf }}({{ MD }}))){%- endmacro %}
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
{% set NAMES_MAX = 20000 %}{#- больше не заходивших из ЦА — имён не отдаём, только числа -#}
{% set ACL_N = 40 %}
{% set WIDE = 0.3 %}
{#- Словарь: отсортированные массивы значений спец./стримов/стажа/HQ/IT (штат ⋃ атрибуты зрителей) — ОДИН скаляр
    на запрос; код значения = его номер в массиве (1…) — 1–3 цифры вместо названия (кириллица в JSON Superset — 6 байт на букву). -#}
{% set DZ = "(SELECT dz FROM dicts)" %}
{% set DI = {'spec': 1, 'stream': 2, 'exp': 3, 'hq': 4, 'it': 5} %}
{% macro cd(gname, x) %}toString(indexOf(tupleElement({{ DZ }}, {{ DI[gname] }}), {{ x }})){% endmacro %}
{#- Поле упаковки: разделитель полей «|» (не экранируется в JSON, в отличие от табуляции), строк — перевод строки. -#}
{% macro fx(x) %}replaceRegexpAll({{ x }}, '[|\t\n\r]', ' '){% endmacro %}
{% macro jes(s) -%}{{ s|string|replace('\\', '\\\\')|replace('"', '\\"')|replace("'", "''") }}{%- endmacro %}
{% macro jal(a) -%}[{% for v in a %}{% if not loop.first %}, {% endif %}"{{ jes(v) }}"{% endfor %}]{%- endmacro %}
{#- Применённая ЦА (эмит строки «Целевая аудитория»). Списки — циклом: при сохранении датасета filter_values = AlwaysTrueObject. -#}
{% set caorg = [] %}{% for v in (filter_values('ca_org_f') or []) %}{% if v|string != '' and (v|string).split(' › ')|length <= 5 %}{% set _ = caorg.append(v|string) %}{% endif %}{% endfor %}
{% set caspec = [] %}{% for v in (filter_values('ca_spec_f') or []) %}{% if v|string != '' %}{% set _ = caspec.append(v|string) %}{% endif %}{% endfor %}
{% set castrm = [] %}{% for v in (filter_values('ca_stream_f') or []) %}{% if v|string != '' %}{% set _ = castrm.append(v|string) %}{% endif %}{% endfor %}
{% set cahq = [] %}{% for v in (filter_values('ca_hq_f') or []) %}{% set _ = cahq.append(v|string) %}{% endfor %}
{% set cait = [] %}{% for v in (filter_values('ca_it_f') or []) %}{% set _ = cait.append(v|string) %}{% endfor %}
{% set cahead = filter_values('ca_head_f')|first|default('', true) %}{% set cahead = cahead if cahead in ['1', 'n'] else '' %}
{% set caadg = [] %}{% for v in (filter_values('ca_adg_f') or []) %}{% if v|string != '' %}{% set _ = caadg.append(v|string) %}{% endif %}{% endfor %}
{% set custom = caorg or caspec or castrm or cahq or cait or cahead != '' or caadg %}
{#- Нормализованный уровень УС строки штата (заглушки «-», «…» = пусто). -#}
{% macro ous(col) %}if(match(toString(ifNull(s.{{ col }}, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull(s.{{ col }}, ''))){% endmacro %}
{#- Атрибуты строки штата pa_staff (алиас s): путь op, спец, стрим, рук, HQ, IT — для условий ЦА и свёртки h. -#}
{% macro sattrs() -%}
lower(toString(s.login)) AS lg,
      [{{ ous('lvl3_management_unit_nm') }}, {{ ous('lvl4_management_unit_nm') }}, {{ ous('lvl5_management_unit_nm') }}, {{ ous('lvl6_management_unit_nm') }}, {{ ous('lvl7_management_unit_nm') }}] AS slv,
      arrayStringConcat(arraySlice(slv, 1, if(arrayFirstIndex(x -> x = '', slv) = 0, toUInt32(5), toUInt32(arrayFirstIndex(x -> x = '', slv) - 1))), ' › ') AS op,
      toString(ifNull(s.emp_specialization_desc, '')) AS sp, toString(ifNull(s.emp_stream_desc, '')) AS st,
      toString(ifNull(s.hq_code, '')) AS hqc, toString(ifNull(s.it_code, '')) AS itc, toUInt8(ifNull(s.management_head_flg, 0) = 1) AS hdf,
      toString(ifNull(s.fio, '')) AS sfio, toString(ifNull(s.exp_nm, '')) AS sexp
{%- endmacro %}
{#- Условия ЦА над атрибутами штата (sattrs). -#}
{% macro cond() -%}
1{% if caorg %} AND arrayExists(pz -> op = pz OR startsWith(op, concat(pz, ' › ')), {{ qa(caorg) }}){% endif %}
{%- if caspec %} AND sp IN {{ q(caspec) }}{% endif %}{% if castrm %} AND st IN {{ q(castrm) }}{% endif %}
{%- if cahq %} AND hqc IN {{ q(cahq) }}{% endif %}{% if cait %} AND itc IN {{ q(cait) }}{% endif %}
{%- if cahead == '1' %} AND hdf = 1{% elif cahead == 'n' %} AND hdf = 0{% endif %}
{%- if caadg %} AND lg IN (SELECT login FROM prod_proteus.pa_adg_member WHERE ad_group IN {{ q(caadg) }}){% endif %}
{%- endmacro %}
{#- Логины ЦА по условиям (штат под условиями). -#}
{% macro caset() -%}SELECT lg FROM (SELECT {{ sattrs() }} FROM prod_proteus.pa_staff s) WHERE {{ cond() }}{%- endmacro %}
{#- Логины с правом хотя бы на один отчёт области: поимённо или через AD-группу. -#}
{% macro accset() -%}
SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'user' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)
        UNION ALL
        SELECT m.login FROM prod_proteus.pa_adg_member m
        WHERE m.ad_group IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'group' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok))
{%- endmacro %}
{#- Эхо применённых кросс-фильтров (сверка выбора в чартах, 2026-09-29): сырые filter_values колонок,
    которые шлют чарты борда; «"», «\» и переводы строк выкинуты — в ключе сверки чарта их тоже нет. -#}
{% set FLT = [] %}{% for c in ['mode_param', 'sel_f', 'period_param', 'pub_f', 'act_f', 'exc_f', 'org_f', 'spec_f', 'stream_f', 'adg_f', 'heads_f', 'login_f', 'exl_f', 'freq_f', 'ca_org_f', 'ca_spec_f', 'ca_stream_f', 'ca_hq_f', 'ca_it_f', 'ca_head_f', 'ca_adg_f'] %}{% set fv = [] %}{% for v in (filter_values(c) or []) %}{% if v|string|length < 2000 %}{% set _ = fv.append('"' ~ (v|string|replace('"', '')|replace('\\', '')|replace('\n', '')|replace('\r', '')|replace("'", "''")) ~ '"') %}{% endif %}{% endfor %}{% if fv %}{% set _ = FLT.append('"' ~ c ~ '":[' ~ fv|join(',') ~ ']') %}{% endif %}{% endfor %}
{% set CJ = [] %}
{% if caorg %}{% set _ = CJ.append('"org":' ~ jal(caorg)) %}{% endif %}
{% if caspec %}{% set _ = CJ.append('"spec":' ~ jal(caspec)) %}{% endif %}
{% if castrm %}{% set _ = CJ.append('"stream":' ~ jal(castrm)) %}{% endif %}
{% if cahq %}{% set _ = CJ.append('"hq":' ~ jal(cahq)) %}{% endif %}
{% if cait %}{% set _ = CJ.append('"it":' ~ jal(cait)) %}{% endif %}
{% if cahead %}{% set _ = CJ.append('"head":"' ~ cahead ~ '"') %}{% endif %}
{% if caadg %}{% set _ = CJ.append('"adg":' ~ jal(caadg)) %}{% endif %}
{% set OWN = 'AND ifNull(own_flg, 0) = 0' if excv == '1' else '' %}
{#- Зрители текущего периода (те же пары и то же «без владельцев», что у evd) — логины в нижнем регистре. -#}
{% macro curset() -%}
SELECT lower(toString(login)) FROM prod_proteus.pa_pair
      WHERE dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(login)
        AND bitAnd(toUInt64(ifNull(msk_{{ grain }}, 0)), {{ CUR }}) != 0 {{ OWN }}
{%- endmacro %}
WITH
  {# Дата свежести md — как у каталога: md пары, запасной источник — последний визит.
      Начало истории событий ds и «надёжные» периоды: новым человека можно назвать, только если до начала
      периода есть ≥ {{ HIST_DAYS }} дней истории — иначе «впервые в данных» = «давно не заходил». kt — самый
      старый такой период (возраст бакета); периоды старше kt новых не выделяют (в чарте — «мало истории»). #}
  maxd AS (
    SELECT tuple(md, ds, toInt64(dateDiff('{{ g.u }}', {{ g.sf }}(dt), {{ g.sf }}(md))) - if(toDate({{ g.sf }}(dt)) = dt, 0, 1),
      toInt64(dateDiff('day', dt, toDate(md)))) AS h
    FROM (SELECT md, toDate(ds0) AS ds, addDays(toDate(ds0), {{ HIST_DAYS }}) AS dt
          FROM (SELECT max(ifNull(md, dmax)) AS md, min(dmin) AS ds0 FROM prod_proteus.pa_pair))
  ),
  dicts AS (
    SELECT tuple(arraySort(groupUniqArrayIf(dv, dg = 'spec')), arraySort(groupUniqArrayIf(dv, dg = 'stream')), arraySort(groupUniqArrayIf(dv, dg = 'exp')),
      arraySort(groupUniqArrayIf(dv, dg = 'hq')), arraySort(groupUniqArrayIf(dv, dg = 'it'))) AS dz
    FROM (SELECT dd.1 AS dg, dd.2 AS dv FROM (
      SELECT arrayJoin([('spec', toString(ifNull(emp_specialization_desc, ''))), ('stream', toString(ifNull(emp_stream_desc, ''))),
        ('exp', toString(ifNull(exp_nm, ''))), ('hq', toString(ifNull(hq_code, ''))), ('it', toString(ifNull(it_code, '')))]) AS dd FROM prod_proteus.pa_staff
      UNION ALL
      SELECT arrayJoin([('spec', toString(ifNull(emp_specialization_desc, ''))), ('stream', toString(ifNull(emp_stream_desc, ''))),
        ('exp', {% if HAS_FIO %}toString(ifNull(exp_nm, '')){% else %}''{% endif %})]) AS dd FROM prod_proteus.pa_emp_attrs
      UNION ALL
      {# пустое значение — у зрителей без атрибутов #}
      SELECT arrayJoin([('spec', ''), ('stream', ''), ('exp', ''), ('hq', ''), ('it', '')]) AS dd))
  ),
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
    SELECT toString(ifNull(e.login, '')) AS login, lower(toString(ifNull(e.login, ''))) AS lg,
      groupBitOr(toUInt64(ifNull(e.msk_{{ grain }}, 0))) AS msk,
      sum(ifNull(e.v_{{ grain }}, 0)) AS v_cur,
      sum(ifNull(e.vp_{{ grain }}, 0)) AS v_prev,
      max(ifNull(e.kmax_{{ grain }}, 0)) AS fd_k,
      max(e.dmax) AS dmax,
      groupBitOr(toUInt64(ifNull(e.msk_mon, 0))) AS mon,
      {#- календарь: активные дни (bit k = заходил k дней назад, k < 60) и возраст первого визита в днях -#}
      groupBitOr(toUInt64(ifNull(e.msk_d, 0))) AS mskd,
      max(ifNull(e.kmax_d, 0)) AS fd_d
    FROM prod_proteus.pa_pair e
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(e.login){% if excv == '1' %} AND ifNull(e.own_flg, 0) = 0{% endif %}
    {%- if have and pmode in CUTS %} AND e.login IN (SELECT login FROM prod_proteus.pa_emp_attrs WHERE {{ CUTS[pmode] }} IN {{ q(sel) }}){% endif %}
    {%- if custom %} AND lower(toString(e.login)) IN ({{ caset() }}){% endif %}
    GROUP BY e.login
  ),
  pr AS (
    {#- Зритель + атрибуты + роли, в которые он попадает. -#}
    SELECT p.login AS login, p.msk AS msk, bitCount(bitAnd(p.msk, {{ CUR }})) AS days, p.v_cur AS v_cur, p.v_prev AS v_prev,
      p.fd_k AS fd_k, p.fd_d AS fd_d, p.dmax AS dmax, toUInt8(bitTest(p.mon, 1)) AS m1, toUInt8(bitTest(p.mon, 2)) AS m2,
      {#- Месяцы активности из маски: возраст самого старого — месяц первого визита (когорта). -#}
      arrayMap(i -> toInt64(i), arrayFilter(i -> bitTest(p.mon, i), range(63))) AS bms,
      if(empty(bms), toInt64(0), arrayMax(bms)) AS gm,
      addMonths(toStartOfMonth({{ MD }}), -toInt32(gm)) AS c0,
      bitAnd(p.msk, {{ CUR }}) != 0 AS cur, bitAnd(p.msk, {{ PREV }}) != 0 AS prv,
      bitCount(bitAnd(p.msk, {{ CUR }})) AS nb_cur, bitCount(bitAnd(p.msk, {{ PREV }})) AS nb_prev,
      multiIf(nb_cur <= {{ FBIN[0] }}, 1, nb_cur <= {{ FBIN[1] }}, 2, nb_cur <= {{ FBIN[2] }}, 3, 4) AS bin,  {#- корзина — по АКТИВНЫМ ПЕРИОДАМ грануляции (как «постоянные» 8+ в кубе) -#}
      {# Атрибуты — строго не-Nullable: при join_use_nulls = 1 LEFT JOIN даёт NULL у логинов без атрибутов,
         а arrayConcat ролей в CH 24 приводит массивы к типу первого — NULL ронял запрос (Code 349). #}
      {{ ou('lvl3_management_unit_nm') }} AS lvl3, {{ ou('lvl4_management_unit_nm') }} AS lvl4,
      {#- Оргструктура УС-3…УС-7: путь «УС-3 › УС-4 › …» до первого пустого уровня. Узел дерева = префикс пути,
          поэтому одноимённые отделы разных департаментов не склеиваются. -#}
      [lvl3, lvl4{% if HAS_ORG %}, {{ ou('lvl5_management_unit_nm') }}, {{ ou('lvl6_management_unit_nm') }}, {{ ou('lvl7_management_unit_nm') }}{% endif %}] AS lv,
      {#- Обе ветки if — одного типа (UInt32): в CH 24 if(UInt64, Int64) падает «no supertype». -#}
      if(arrayFirstIndex(x -> x = '', lv) = 0, toUInt32(length(lv)), toUInt32(arrayFirstIndex(x -> x = '', lv) - 1)) AS ol,
      arrayStringConcat(arraySlice(lv, 1, ol), ' › ') AS opath,
      toString(ifNull(a.emp_specialization_desc, '')) AS spec, toString(ifNull(a.emp_stream_desc, '')) AS stream,
      toUInt8(ifNull(a.management_head_flg, 0) = 1) AS is_head,
      {% if HAS_FIO %}toString(ifNull(a.fio, '')) AS fio, toString(ifNull(a.exp_nm, '')) AS exp{% else %}'' AS fio, '' AS exp{% endif %},
      arrayFilter(x -> x >= 1 AND x <= 11, arrayMap(y -> gm - y, bms)) AS ags,
      {#- ЦА: stf — действующий сотрудник (pa_staff), acc — право хотя бы на один отчёт области, inca — в ЦА
          (по условиям — все зрители уже люди ЦА; по правам — сотрудник с доступом). -#}
      p.stf AS stf, p.acc AS acc, toUInt8(p.stf = 1 AND {% if custom %}1{% else %}p.acc = 1{% endif %}) AS inca,
      p.hq AS hq, p.it AS it,
      toUInt8(bitAnd(p.mon, toUInt64(bitShiftLeft(toUInt64(1), toUInt8(toMonth({{ MD }})))) - 1) != 0) AS yr,
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
        if(cur, arrayMap(t -> ('ts', '', toString(t), '', toInt64(t)), arrayFilter(t -> bitTest(p.msk, t), range({{ g.n }}))), []),
        {#- Календарь: строка на каждый активный день из последних {{ CAL_N }} (любая грануляция). -#}
        arrayMap(t -> ('cal', '', toString(t), '', toInt64(t)), arrayFilter(t -> bitTest(p.mskd, t), range({{ CAL_N }})))
      )) AS rk
    FROM (
      {#- Штат и доступ — на строке человека (до размножения по ролям): соединение и множество прав на 47 тыс.
          строк, а не на сотнях тысяч ролей (иначе ×20 времени). -#}
      SELECT e.*, toUInt8(ifNull(s.login, '') != '') AS stf, toUInt8(e.lg IN ({{ accset() }})) AS acc,
        toString(ifNull(s.hq_code, '')) AS hq, toString(ifNull(s.it_code, '')) AS it
      FROM evd e
      LEFT JOIN prod_proteus.pa_staff s ON s.login = e.lg
    ) p
    LEFT JOIN prod_proteus.pa_emp_attrs a ON a.login = p.login
  ),
  agg AS (
    SELECT rk.1 AS role, rk.2 AS g, rk.3 AS k, rk.4 AS parent,
      countIf(rk.1 = 'cal' OR cur) AS users, countIf(prv) AS users_prev,
      sum(if(rk.1 IN ('ts', 'cal'), 0, v_cur)) AS views, any(rk.5) AS tk,
      sum(v_prev) AS views_prev,
      countIf(if(rk.1 = 'cal', rk.5 = fd_d AND fd_d <= {{ KTD }}, if(rk.1 = 'ts', rk.5 = fd_k, cur AND fd_k < {{ g.n }}) AND fd_k <= {{ KT }})) AS new_u,
      countIf(prv AND fd_k >= {{ g.n }} AND fd_k < {{ 2 * g.n }} AND fd_k <= {{ KT }}) AS new_prev,
      countIf(rk.1 = 'ts' AND rk.5 != fd_k AND bitAnd(msk, toUInt64(bitShiftLeft(toUInt64({{ GAPM }}), toUInt8(rk.5 + 1)))) = 0) AS react_u,
      countIf(nb_cur > {{ FBIN[1] }}) AS regular, countIf(nb_prev > {{ FBIN[1] }}) AS regular_prev,
      countIf(prv AND NOT cur) AS sleeping,
      countIf(m1 = 1) AS mau, countIf(m2 = 1) AS mau_prev,
      count() AS cnt,
      countIf(prv AND inca = 1) AS ca_prev, countIf(nb_prev > {{ FBIN[1] }} AND inca = 1) AS ca_regprev,
      countIf(yr = 1 AND inca = 1) AS ca_yr, countIf(cur AND inca = 0) AS ca_out,
      sumMap(if(rk.1 = 'coh', ags, CAST([], 'Array(Int64)')), if(rk.1 = 'coh', arrayMap(x -> toUInt64(1), ags), CAST([], 'Array(UInt64)'))) AS am,
      any(login) AS login, any(fio) AS fio, any(lvl3) AS lvl3, any(lvl4) AS lvl4, any(spec) AS spec,
      any(stream) AS stream, any(exp) AS exp, any(is_head) AS is_head, any(days) AS days,
      any(toDate(dmax)) AS last_dt, any(bin) AS bin,
      any(msk) AS lmsk, any(fd_k) AS lfk, any(dmax) AS ldmax, any(m1) AS lm1, any(m2) AS lm2, any(yr) AS lyr,
      any(stf) AS lstf, any(acc) AS lacc, any(inca) AS lca, any(hq) AS lhq, any(it) AS lit
    FROM pr
    GROUP BY role, g, k, parent
  ),
  bv AS (
    {#- Просмотры по бакетам: gg = 'g' — окно периода (линия «Просмотры» динамики), gg = 'd' — дни календаря (30 дней).
        Людской срез области (cut:*) — только из факта (у pa_dash_bkt разбивки по людям нет), одним чтением на обе серии. -#}
    {%- if (have and pmode in CUTS) or custom %}
    SELECT x.1 AS gg, x.2 AS bk, sum(e.views) AS bviews
    FROM prod_proteus.pa_evd_day e
    ARRAY JOIN arrayFilter(y -> y.2 < if(y.1 = 'g', {{ g.n }}, 30), [('g', {{ kx('e.log_dttm') }}), ('d', {{ kd('e.log_dttm') }})]) AS x
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND ({{ kx('e.log_dttm') }} < {{ g.n }} OR {{ kd('e.log_dttm') }} < 30)
      {%- if have and pmode in CUTS %} AND e.login IN (SELECT login FROM prod_proteus.pa_emp_attrs WHERE {{ CUTS[pmode] }} IN {{ q(sel) }}){% endif %}
      {%- if custom %} AND lower(toString(e.login)) IN ({{ caset() }}){% endif %}
      {%- if excv == '1' %} AND (e.dashboard_id, e.login) NOT IN (SELECT dashboard_id, login FROM prod_proteus.pa_pair WHERE own_flg = 1){% endif %}
    GROUP BY gg, bk
    {%- else %}
    SELECT gg, toInt64(k) AS bk, sum({{ 'views_nown' if excv == '1' else 'views' }}) AS bviews
    FROM prod_proteus.pa_dash_bkt
    ARRAY JOIN arrayFilter(y -> (y = 'g' AND grain = '{{ grain }}') OR (y = 'd' AND grain = 'd'), ['g', 'd']) AS gg
    WHERE grain IN ('{{ grain }}', 'd') AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)
    GROUP BY gg, bk
    {%- endif %}
  ),
  sv AS (
    {#- Штат БЕЗ визитов в текущем периоде: вместе со зрителями списка (list) даёт всю ЦА и её группы. -#}
    SELECT {{ sattrs() }},
      toUInt8(lg IN ({{ accset() }})) AS acc,
      toUInt8({% if custom %}{{ cond() }}{% else %}acc = 1{% endif %}) AS inca
    FROM prod_proteus.pa_staff s
    WHERE lg NOT IN ({{ curset() }})
    {%- if excv == '1' %}
      {#- владельцы ВСЕХ отчётов области (у одного отчёта — его владельцы) — не аудитория: их визиты — свои -#}
      AND lg NOT IN (SELECT o FROM (SELECT arrayJoin(owners_string) AS o FROM prod_proteus.pa_dash_meta WHERE dashboard_id IN (SELECT dashboard_id FROM dash_ok))
        GROUP BY o HAVING count() = (SELECT count() FROM dash_ok)){% endif %}
  ),
  s1 AS (
    {#- Роль строки штата: h — свёртка по ключу (все), n — поимённо (только ЦА). Один проход по sv. -#}
    SELECT rl, op,
      if(rl = 'h', concat({{ cd('spec', 'sp') }}, '|', {{ cd('stream', 'st') }}, '|', toString(hdf), '|', {{ cd('hq', 'hqc') }}, '|', {{ cd('it', 'itc') }}), '') AS hk,
      if(rl = 'n', concat({{ fx('lg') }}, '|', {{ fx('sfio') }}, '|', {{ cd('spec', 'sp') }}, '|', {{ cd('stream', 'st') }}, '|', toString(hdf), '|',
        {{ cd('hq', 'hqc') }}, '|', {{ cd('it', 'itc') }}, '|', toString(acc), '|', {{ cd('exp', 'sexp') }}), '') AS ln,
      count() AS c, countIf(acc = 1) AS ca, countIf(inca = 1) AS cn, countIf(inca = 1 AND acc = 1) AS cna
    FROM sv
    ARRAY JOIN if(inca = 1, ['h', 'n'], ['h']) AS rl
    GROUP BY rl, op, hk, ln
  ),
  s2 AS (
    SELECT rl AS sec, op,
      arrayStringConcat(arraySort(groupArray(if(rl = 'h', concat(hk, '|', toString(c), '|', toString(ca), '|', toString(cn), '|', toString(cna)), ln))), '\n') AS pk,
      sum(c) AS n, sumIf(c, rl = 'n') AS nn
    FROM s1 GROUP BY sec, op
  ),
  s3 AS (
    {#- имена не заходивших — только если их не больше NAMES_MAX (иначе ЦА надо сузить условиями) -#}
    SELECT sec, op, pk, n, sum(nn) OVER () AS nnever FROM s2
  ),
  rnk AS (
    SELECT *,
      if(role = 'cal', 'd', 'g') AS bg,     {#- серия просмотров bv: дни календаря или бакеты периода -#}
      {#- ранг нужен только топу AD-групп: без WITH_ADG окно не считаем -#}
      {% if WITH_ADG %}row_number() OVER (PARTITION BY role, g ORDER BY if(role = 'list', days, users) DESC, views DESC, k){% else %}toUInt64(0){% endif %} AS rn
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
  CAST(acts AS Array(UInt64)) AS acts,
  CAST(ifNull(ca_prev, 0) AS UInt64) AS ca_prev,
  CAST(ifNull(ca_regprev, 0) AS UInt64) AS ca_regprev,
  CAST(ifNull(ca_yr, 0) AS UInt64) AS ca_yr,
  CAST(ifNull(ca_out, 0) AS UInt64) AS ca_out,
  CAST(state_j AS Nullable(String)) AS state_j
FROM (
  {# Все строки из ОДНОГО прохода по agg (вторая ссылка на CTE в CH 24 пересчитывает его целиком).
     Поимённый список (list) — ВСЕ зрители текущего периода, упакованные: строка на подразделение
     (parent = путь «УС-3 › … › УС-7»), в k — люди через \n, поля через «|» (13):
     логин | ФИО | код спец. | код стрима | код стажа | маска текущего окна (bit k = активен k периодов назад) |
     маска предыдущего окна | возраст первого визита | просмотров | дней с последнего визита (−1 — нет) |
     флаги (1 рук · 2 MAU · 4 MAU пред. месяца · 8 в этом году · 16 действующий сотрудник · 32 доступ к области · 64 в ЦА) |
     код HQ | код IT. Коды — номера в словаре d (Superset пишет кириллицу \uXXXX, 6 байт на букву: повторяющиеся
     названия у каждого человека были половиной ответа). Активных периодов, корзину, «новый» — чарт считает из масок. #}
  SELECT s_role AS section, s_g AS g,
    if(s_role = 'list', arrayStringConcat(groupArrayIf(concat(
      {{ fx("ifNull(toString(s_login), '')") }}, '|', {{ fx("ifNull(toString(s_fio), '')") }}, '|',
      {{ cd('spec', "ifNull(toString(s_spec), '')") }}, '|', {{ cd('stream', "ifNull(toString(s_stream), '')") }}, '|', {{ cd('exp', "ifNull(toString(s_exp), '')") }}, '|',
      toString(bitAnd(s_lmsk, {{ CUR }})), '|', toString(bitShiftRight(s_lmsk, {{ g.n }})), '|', toString(s_lfk), '|', toString(s_views), '|',
      toString(if(isNull(s_ldmax), toInt64(-1), toInt64(dateDiff('day', toStartOfDay(s_ldmax), toStartOfDay({{ MD }}))))), '|',
      {#- флаги одним числом: 1 рук · 2 MAU · 4 MAU пред. месяца · 8 в этом году · 16 сотрудник · 32 доступ · 64 в ЦА -#}
      toString(toUInt8(ifNull(s_is_head, 0)) + 2 * s_lm1 + 4 * s_lm2 + 8 * s_lyr + 16 * s_lstf + 32 * s_lacc + 64 * s_lca), '|',
      {{ cd('hq', 's_lhq') }}, '|', {{ cd('it', 's_lit') }}), s_role = 'list'), '\n'), any(s_k)) AS k,
    s_parent AS parent,
    NULL AS login, NULL AS fio, NULL AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, NULL AS exp, NULL AS is_head,
    NULL AS days, NULL AS last_dt, NULL AS bin,
    if(s_role = 'list', toUInt64(0), any(s_users)) AS users, if(s_role = 'list', toUInt64(0), any(s_users_prev)) AS users_prev,
    if(s_role = 'list', toInt64(0), any(if(s_role IN ('ts', 'cal'), toInt64(ifNull(s_bviews, 0)), toInt64(s_views)))) AS views,
    if(s_role = 'list', toInt64(0), any(toInt64(s_views_prev))) AS views_prev,
    if(s_role = 'list', toUInt64(0), any(s_new_u)) AS new_u, if(s_role = 'list', toUInt64(0), any(s_new_prev)) AS new_prev,
    if(s_role = 'list', toUInt64(0), any(s_react_u)) AS react_u, if(s_role = 'list', toUInt64(0), any(s_regular)) AS regular,
    if(s_role = 'list', toUInt64(0), any(s_regular_prev)) AS regular_prev, if(s_role = 'list', toUInt64(0), any(s_sleeping)) AS sleeping,
    if(s_role = 'list', toUInt64(0), any(s_mau)) AS mau, if(s_role = 'list', toUInt64(0), any(s_mau_prev)) AS mau_prev,
    if(s_role = 'list', count(), any(s_cnt)) AS cnt, any((s_am).1) AS ages, any((s_am).2) AS acts,
    if(s_role = 'total', any(s_ca_prev), toUInt64(0)) AS ca_prev, if(s_role = 'total', any(s_ca_regprev), toUInt64(0)) AS ca_regprev,
    if(s_role = 'total', any(s_ca_yr), toUInt64(0)) AS ca_yr,
    {#- вне ЦА заходили: по правам — зрители без права; по условиям (evd уже сужен до ЦА) — отдельным счётом по парам -#}
    if(s_role = 'total', {% if custom %}toUInt64((SELECT uniqExact(lg0) FROM (SELECT lower(toString(login)) AS lg0 FROM prod_proteus.pa_pair
      WHERE dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(login) AND bitAnd(toUInt64(ifNull(msk_{{ grain }}, 0)), {{ CUR }}) != 0 {{ OWN }})
      WHERE lg0 NOT IN ({{ caset() }}))){% else %}any(s_ca_out){% endif %}, toUInt64(0)) AS ca_out,
    CAST(NULL AS Nullable(String)) AS state_j
  FROM (SELECT role AS s_role, g AS s_g, k AS s_k, parent AS s_parent, login AS s_login, fio AS s_fio, spec AS s_spec,
      stream AS s_stream, exp AS s_exp, is_head AS s_is_head, days AS s_days, views AS s_views, last_dt AS s_last_dt, bin AS s_bin,
      new_u AS s_new_u, mau AS s_mau, mau_prev AS s_mau_prev, users AS s_users, users_prev AS s_users_prev, views_prev AS s_views_prev,
      new_prev AS s_new_prev, react_u AS s_react_u, regular AS s_regular, regular_prev AS s_regular_prev, sleeping AS s_sleeping,
      cnt AS s_cnt, am AS s_am, rn AS s_rn, b.bviews AS s_bviews,
      lmsk AS s_lmsk, lfk AS s_lfk, ldmax AS s_ldmax, lm1 AS s_lm1, lm2 AS s_lm2, lyr AS s_lyr, lstf AS s_lstf, lacc AS s_lacc, lca AS s_lca,
      lhq AS s_lhq, lit AS s_lit, ca_prev AS s_ca_prev, ca_regprev AS s_ca_regprev, ca_yr AS s_ca_yr, ca_out AS s_ca_out
    FROM rnk LEFT JOIN bv b ON b.bk = rnk.tk AND b.gg = rnk.bg)
  WHERE s_role = 'list' OR s_g != 'adg' OR s_rn <= {{ ADG_N }}
  GROUP BY s_role, s_g, if(s_role = 'list', '', s_k), s_parent

  UNION ALL
  {# Эхо области: что выбрано (g = режим, k = значения через \n, fio = имя одиночного отчёта), parent = грануляция.
      Плечо не читает факт — только мету по id. #}
  SELECT 'area' AS section, '{{ pmode if have else '' }}' AS g,
    {% if have %}{{ q([sel|join('\n')]) }}{% else %}''{% endif %} AS k, '{{ grain }}' AS parent,
    NULL AS login,
    {% if have and pmode == 'report' and repids|length == 1 %}ifNull((SELECT any(dashboard_nm) FROM prod_proteus.pa_dash_meta WHERE dashboard_id = {{ repids[0] }}), ''){% else %}NULL{% endif %} AS fio,
    {#- lvl3 — дата свежести данных md: от неё чарт подписывает периоды (не от сегодняшнего дня браузера) -#}
    toString(toDate({{ MD }})) AS lvl3, NULL AS lvl4, NULL AS spec, NULL AS stream, '{{ '{' ~ FLT|join(',') ~ '}' }}' AS exp, NULL AS is_head,
    {#- days — kt + 1 (сколько свежих периодов «надёжны» для новых; 0 — ни одного), last_dt — начало истории событий -#}
    toUInt32(greatest({{ KT }} + 1, 0)) AS days, {{ DS }} AS last_dt, NULL AS bin,
    toUInt64(0) AS users, toUInt64(0) AS users_prev, toInt64(0) AS views, toInt64(0) AS views_prev,
    toUInt64(0) AS new_u, toUInt64(0) AS new_prev, toUInt64(0) AS react_u, toUInt64(0) AS regular,
    toUInt64(0) AS regular_prev, toUInt64(0) AS sleeping, toUInt64(0) AS mau, toUInt64(0) AS mau_prev,
    toUInt64(0) AS cnt, CAST([], 'Array(Int64)') AS ages, CAST([], 'Array(UInt64)') AS acts,
    toUInt64(0) AS ca_prev, toUInt64(0) AS ca_regprev, toUInt64(0) AS ca_yr, toUInt64(0) AS ca_out,
    {#- штат, режим и условия ЦА -#}
    concat('{"staff":', toString((SELECT count() FROM prod_proteus.pa_staff)), ', "wide":{{ WIDE }}, "caMode":"{{ 'cond' if custom else 'acc' }}", "ca":{{ '{' ~ CJ|join(', ') ~ '}' }}}') AS state_j

  UNION ALL
  {# Штат без визитов в периоде: h — свёртка, n — поимённо люди ЦА (если их ≤ NAMES_MAX). users = людей в строке. #}
  SELECT sec AS section, '' AS g, pk AS k, op AS parent,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    toUInt64(n), toUInt64(0), toInt64(0), toInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0),
    toUInt64(n), CAST([], 'Array(Int64)'), CAST([], 'Array(UInt64)'), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), CAST(NULL AS Nullable(String))
  FROM s3
  WHERE sec = 'h' OR nnever <= {{ NAMES_MAX }}

  UNION ALL
  {# Словарь кодов: g = spec | stream | exp | hq | it, k = код (номер), parent = значение. #}
  SELECT 'd', x.1, toString(x.2), x.3,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    toUInt64(0), toUInt64(0), toInt64(0), toInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0),
    toUInt64(0), CAST([], 'Array(Int64)'), CAST([], 'Array(UInt64)'), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), CAST(NULL AS Nullable(String))
  FROM (SELECT arrayJoin(arrayConcat(
    arrayMap((v, i) -> ('spec', i, v), dz.1, arrayEnumerate(dz.1)), arrayMap((v, i) -> ('stream', i, v), dz.2, arrayEnumerate(dz.2)),
    arrayMap((v, i) -> ('exp', i, v), dz.3, arrayEnumerate(dz.3)), arrayMap((v, i) -> ('hq', i, v), dz.4, arrayEnumerate(dz.4)),
    arrayMap((v, i) -> ('it', i, v), dz.5, arrayEnumerate(dz.5)))) AS x FROM dicts)

  UNION ALL
  {# Как роздан доступ к области: крупнейшие группы (людей штата в группе) и число поимённых прав. #}
  SELECT 'acl', 'group', ad_group, '',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    toUInt64(cnt), toUInt64(0), toInt64(0), toInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0),
    toUInt64(0), CAST([], 'Array(Int64)'), CAST([], 'Array(UInt64)'), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), CAST(NULL AS Nullable(String))
  FROM (
    SELECT m.ad_group AS ad_group, uniqExact(m.login) AS cnt
    FROM prod_proteus.pa_adg_member m
    WHERE m.ad_group IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'group' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok))
      AND m.login IN (SELECT login FROM prod_proteus.pa_staff)
    GROUP BY m.ad_group ORDER BY cnt DESC, ad_group LIMIT {{ ACL_N }}
  )

  UNION ALL
  SELECT 'acl', 'users', '', '',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    toUInt64(uniqExact(principal)), toUInt64(0), toInt64(0), toInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0),
    toUInt64(0), CAST([], 'Array(Int64)'), CAST([], 'Array(UInt64)'), toUInt64(0), toUInt64(0), toUInt64(0), toUInt64(0), CAST(NULL AS Nullable(String))
  FROM prod_proteus.pa_dash_acl WHERE kind = 'user' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)
)
