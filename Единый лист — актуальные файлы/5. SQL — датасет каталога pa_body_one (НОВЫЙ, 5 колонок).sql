{#- pa_cube v7 — каталог (левый чарт): отчёты / коллекции / владельцы + ИТОГО + аудитория (разрезы людей).
    Источник — предагрегат пар prod_proteus.pa_pair (GP-параграф «PA · пары отчёт×логин»):
    у пары «отчёт × логин» уже лежат 64-битная маска активных бакетов, суммы окна и v_life
    для всех 4 грануляций; дневной факт каталог не читает вовсе.
    Слушает: шапку (period_param, pub_f/act_f/exc_f + ca_*_f строки «Целевая аудитория») и людскую шину правой панели
    (lvl3_f/lvl4_f/stream_f/spec_f/adg_f/heads_f/org_f/login_f/exl_f/freq_f + seg_f — сегмент ЦА «Кто смотрит»).
    Выбор каталога (mode_param/sel_f, aud_*_f) НЕ читает — самовлияние выключено.
    Цепочка maxd → dash_ok → evd → (kx | строки отчётов) → agg → выход; evd читается ещё раз для аудитории (ak).
    ОТВЕТ v2 (2026-09-30) — 5 колонок: section · g · k · parent · n. Superset пишет имена колонок в КАЖДУЮ строку JSON
      (у 13 тыс. отчётов × 20 колонок это было 3,3 МБ из 5,8), а кириллицу — \uXXXX (6 байт на букву): строки
      упакованы в k (строки через перевод строки, поля через «|»), кириллица — компактно (макрос cz, разбор — unz в чарте).
      sj    — k = состояние запроса (JSON: период, эхо фильтров flt, опции, людская шина, ca, seg), parent = грануляция;
      total — k = users|views|regular_users|last_view_days (ИТОГО: уникальные люди всей выборки);
      rep   — отчёты порциями (g = номер порции): «id|users|views|regular|last|ритм d,w,m,o|ЦА|ЦА≈все|ЦА заходили|
              название|владелец|коллекции через ^|опубликован|сертифицирован|создан ГГГГ-ММ-ДД»;
      grp   — g = owner | collection: «значение|users|views|regular|last»;
      aud   — g = разрез аудитории (o — оргструктура, s — специализация, t — стрим, q — HQ, i — IT, h — руководители):
              «значение|родитель (у o — путь уровнем выше)|людей заходило|просмотров|постоянных|людей в штате». -#}
{% set GRAINS = {'d': {'n': 30, 'u': 'day', 'sf': 'toStartOfDay'}, 'w': {'n': 20, 'u': 'week', 'sf': 'toMonday'}, 'm': {'n': 12, 'u': 'month', 'sf': 'toStartOfMonth'}, 'q': {'n': 8, 'u': 'quarter', 'sf': 'toStartOfQuarter'}} %}
{% set grain = filter_values('period_param')|first|default('d', true) %}
{% set grain = grain if grain in GRAINS else 'd' %}
{% set g = GRAINS[grain] %}
{% set CUR = 2 ** g.n - 1 %}
{% set WITH_CA = true %}{#- true — у датасета каталога вкладки «Аудитория»: +2 колонки ca_n / ca_wide (ЦА отчёта по правам
    из pa_dash_ca, поставка 2026-09-24). У каталога «Отчётов» — false: ответ прежний, pa_dash_ca не нужна. -#}
{% set REG = {'d': 6, 'w': 6, 'm': 4, 'q': 3}[grain] %}{#- «постоянный» = корзины частоты 3–4 (≥ FBIN[1]+1 активных периодов): 6 дней/недель, 4 месяца, 3 квартала — как сегмент «Постоянный» в «Кто смотрит» -#}
{% set PREV = 2 ** (2 * g.n) - 1 - CUR %}
{% macro q(values) -%}
{%- set out = [] -%}
{%- for v in values -%}{%- set _ = out.append(v|string|replace('\\', '\\\\')) -%}{%- endfor -%}
{{- out|where_in -}}
{%- endmacro %}
{#- Массив-литерал для has/hasAny: where_in даёт кортеж ('a', 'b') или скаляр ('a'), а hasAny ждёт массив. -#}
{% macro qa(values) -%}[{{ q(values)[1:-1] }}]{%- endmacro %}
{#- Компактная кириллица (та же таблица — в чарте, unz): отрезок из кириллицы и пробелов берётся в `…`, буквы внутри —
    однобайтные (CYR → TGT); служебные знаки вне отрезков экранируются: ~~ (тильда), ~p (|), ~c (^), ~b (`);
    табуляция и переводы строк — пробел. Буква кириллицы в JSON Superset: 6 байт → 1. -#}
{% set CYR = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя' %}
{% set TGT = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%' %}
{% macro cz(x) %}translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate({{ x }}, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), '([А-Яа-яЁё][А-Яа-яЁё ]*)', '`\\1`'), '{{ CYR }}', '{{ TGT }}'){% endmacro %}
{% macro fx(x) %}translate({{ x }}, '|\t\n\r', '    '){% endmacro %}
{% macro jes(s) -%}{{ s|string|replace('\\', '\\\\')|replace('"', '\\"')|replace("'", "''") }}{%- endmacro %}
{% macro jal(a) -%}[{% for v in a %}{% if not loop.first %}, {% endif %}"{{ jes(v) }}"{% endfor %}]{%- endmacro %}
{% macro kx(col) -%}toInt64(dateDiff('{{ g.u }}', {{ g.sf }}({{ col }}), {{ g.sf }}((SELECT md FROM maxd)))){%- endmacro %}
{% set pubv = filter_values('pub_f')|first|default('1', true) %}{% set pubv = pubv if pubv in ['0', '1'] else '1' %}
{% set actv = filter_values('act_f')|first|default('1', true) %}{% set actv = actv if actv in ['0', '1'] else '1' %}
{% set excv = filter_values('exc_f')|first|default('1', true) %}{% set excv = excv if excv in ['0', '1'] else '1' %}
{% set lv3 = [] %}{% for v in (filter_values('lvl3_f') or []) %}{% if v|string != '' %}{% set _ = lv3.append(v|string) %}{% endif %}{% endfor %}
{% set lv4 = [] %}{% for v in (filter_values('lvl4_f') or []) %}{% if v|string != '' %}{% set _ = lv4.append(v|string) %}{% endif %}{% endfor %}
{% set strm = [] %}{% for v in (filter_values('stream_f') or []) %}{% if v|string != '' %}{% set _ = strm.append(v|string) %}{% endif %}{% endfor %}
{% set spcf = [] %}{% for v in (filter_values('spec_f') or []) %}{% if v|string != '' %}{% set _ = spcf.append(v|string) %}{% endif %}{% endfor %}
{% set adgf = [] %}{% for v in (filter_values('adg_f') or []) %}{% if v|string != '' %}{% set _ = adgf.append(v|string) %}{% endif %}{% endfor %}
{% set headsv = filter_values('heads_f')|first|default('0', true) %}{% set headsv = headsv if headsv in ['0', '1', 'n'] else '0' %}
{% set loginf = [] %}{% for v in (filter_values('login_f') or []) %}{% if v|string != '' %}{% set _ = loginf.append(v|string) %}{% endif %}{% endfor %}
{#- Узлы оргструктуры (группировка «Оргструктура» панели): путь «УС-3 › УС-4 › …», глубина = число звеньев. -#}
{% set orgf = [] %}{% for v in (filter_values('org_f') or []) %}{% if v|string != '' and (v|string).split(' › ')|length <= 5 %}{% set _ = orgf.append(v|string) %}{% endif %}{% endfor %}
{#- Исключённые логины (настройки «Кто смотрит»): люди выпадают из всех чисел. -#}
{% set exlf = [] %}{% for v in (filter_values('exl_f') or []) %}{% if v|string != '' %}{% set _ = exlf.append(v|string) %}{% endif %}{% endfor %}
{% set freqr = filter_values('freq_f') or [] %}
{% set freqf = [] %}{% for v in freqr %}{% if v|string in ['1', '2', '3', '4'] %}{% set _ = freqf.append(v|string) %}{% endif %}{% endfor %}
{% set attrson = lv3 or lv4 or strm or spcf or adgf or headsv != '0' or orgf %}
{#- Людской фильтр (шина правой панели): при нём v_tot считается лишь по отобранным людям, и порог
    вселенной «≥500 просмотров за жизнь» ронял отчёты (корзина «2–5 дней» на отчёте → «Ничего не найдено»).
    Порог тогда берётся по ВСЕМ зрителям отчёта (как без фильтра) — отдельным подзапросом. -#}
{#- Применённая ЦА вкладки «Аудитория» (эмит панели «Аудитория: ЦА области»; только при WITH_CA):
    ЦА «по условиям» — фиксированный набор людей штата; каталог показывает только их визиты,
    «Охват ЦА» = зрители из ЦА / размер ЦА. Нет условий — ЦА «по правам» отчёта (pa_dash_ca). -#}
{% set caorg = [] %}{% set caspec = [] %}{% set castrm = [] %}{% set cahq = [] %}{% set cait = [] %}{% set cahead = '' %}{% set caadg = [] %}
{% if WITH_CA %}
{% for v in (filter_values('ca_org_f') or []) %}{% if v|string != '' and (v|string).split(' › ')|length <= 5 %}{% set _ = caorg.append(v|string) %}{% endif %}{% endfor %}
{% for v in (filter_values('ca_spec_f') or []) %}{% if v|string != '' %}{% set _ = caspec.append(v|string) %}{% endif %}{% endfor %}
{% for v in (filter_values('ca_stream_f') or []) %}{% if v|string != '' %}{% set _ = castrm.append(v|string) %}{% endif %}{% endfor %}
{% for v in (filter_values('ca_hq_f') or []) %}{% set _ = cahq.append(v|string) %}{% endfor %}
{% for v in (filter_values('ca_it_f') or []) %}{% set _ = cait.append(v|string) %}{% endfor %}
{% set cahead = filter_values('ca_head_f')|first|default('', true) %}{% set cahead = cahead if cahead in ['1', 'n'] else '' %}
{% for v in (filter_values('ca_adg_f') or []) %}{% if v|string != '' %}{% set _ = caadg.append(v|string) %}{% endif %}{% endfor %}
{% endif %}
{% set custom = caorg or caspec or castrm or cahq or cait or cahead != '' or caadg %}
{#- Сегмент ЦА из «Кто смотрит» панели (seg_f): reach — только зрители из ЦА (пара с доступом / люди условий),
    out — только зрители вне ЦА; never — людей не сужает (каталог показывает «не заходили из ЦА» по отчётам). -#}
{% set segv = filter_values('seg_f')|first|default('', true) %}{% set segv = segv if WITH_CA and segv in ['reach', 'never', 'out'] else '' %}
{#- Нормализация уровня УС — как в панели (заглушки «-», «…» = пусто, путь обрывается на них). -#}
{% macro ou(col) %}if(match(toString(ifNull({{ col }}, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull({{ col }}, ''))){% endmacro %}
{#- Логины ЦА «по условиям»: те же условия и тот же нормализованный путь, что в SQL панели. -#}
{% macro caset() -%}
SELECT lg FROM (
      SELECT lower(toString(s.login)) AS lg,
        [{{ ou('s.lvl3_management_unit_nm') }}, {{ ou('s.lvl4_management_unit_nm') }}, {{ ou('s.lvl5_management_unit_nm') }}, {{ ou('s.lvl6_management_unit_nm') }}, {{ ou('s.lvl7_management_unit_nm') }}] AS lvz,
        arrayStringConcat(arraySlice(lvz, 1, if(arrayFirstIndex(x -> x = '', lvz) = 0, toUInt32(5), toUInt32(arrayFirstIndex(x -> x = '', lvz) - 1))), ' › ') AS op,
        toString(ifNull(s.emp_specialization_desc, '')) AS sp, toString(ifNull(s.emp_stream_desc, '')) AS st,
        toString(ifNull(s.hq_code, '')) AS hqc, toString(ifNull(s.it_code, '')) AS itc, toUInt8(ifNull(s.management_head_flg, 0) = 1) AS hdf
      FROM prod_proteus.pa_staff s) WHERE 1
      {%- if caorg %} AND arrayExists(pz -> op = pz OR startsWith(op, concat(pz, ' › ')), {{ qa(caorg) }}){% endif %}
      {%- if caspec %} AND sp IN {{ q(caspec) }}{% endif %}{% if castrm %} AND st IN {{ q(castrm) }}{% endif %}
      {%- if cahq %} AND hqc IN {{ q(cahq) }}{% endif %}{% if cait %} AND itc IN {{ q(cait) }}{% endif %}
      {%- if cahead == '1' %} AND hdf = 1{% elif cahead == 'n' %} AND hdf = 0{% endif %}
      {%- if caadg %} AND lg IN (SELECT login FROM prod_proteus.pa_adg_member WHERE ad_group IN {{ q(caadg) }}){% endif %}
{%- endmacro %}
{% set pplf = loginf or exlf or attrson or freqf or custom or segv %}
{#- Корзина частоты — число АКТИВНЫХ ПЕРИОДОВ грануляции в окне n В ОТЧЁТАХ СТРОКИ каталога:
    у строки отчёта — заходы в этот отчёт, у коллекции / владельца — в их отчёты, у ИТОГО — во все
    (= корзина правой панели без выбора). Фильтр — HAVING по маске человека внутри строки (kx; маска пары внутри — m0, не msk: боевой CH 24.8 в HAVING берёт msk как колонку — Code 215). -#}
{%- set FB = [] -%}
{%- set FBIN = {'d': [1, 5, 15], 'w': [1, 5, 15], 'm': [1, 3, 6], 'q': [1, 2, 3]}[grain] -%}
{%- for v in freqf -%}{%- set bi = v|int -%}{%- if bi == 1 %}{% set _ = FB.append('nb BETWEEN 1 AND ' ~ FBIN[0]) %}{% elif bi == 4 %}{% set _ = FB.append('nb > ' ~ FBIN[2]) %}{% elif bi in [2, 3] %}{% set _ = FB.append('nb BETWEEN ' ~ (FBIN[bi - 2] + 1) ~ ' AND ' ~ FBIN[bi - 1]) %}{% endif -%}{%- endfor %}
{%- set OCOL = ['lvl3_management_unit_nm', 'lvl4_management_unit_nm', 'lvl5_management_unit_nm', 'lvl6_management_unit_nm', 'lvl7_management_unit_nm'] -%}
{%- set OC = [] -%}
{%- for L in [1, 2, 3, 4, 5] -%}{%- set vs = [] -%}{%- for v in orgf -%}{%- if v.split(' › ')|length == L -%}{%- set _ = vs.append(v) -%}{%- endif -%}{%- endfor -%}
{%- if vs -%}{%- set _ = OC.append('arrayStringConcat([' ~ OCOL[:L]|join(', ') ~ "], ' › ') IN " ~ q(vs)) -%}{%- endif -%}{%- endfor -%}
{#- Эхо применённых кросс-фильтров (сверка выбора в чартах, 2026-09-29): сырые filter_values колонок,
    которые шлют чарты борда; «"», «\» и переводы строк выкинуты — в ключе сверки чарта их тоже нет. -#}
{% set FLT = [] %}{% for c in ['mode_param', 'sel_f', 'period_param', 'pub_f', 'act_f', 'exc_f', 'org_f', 'spec_f', 'stream_f', 'adg_f', 'heads_f', 'login_f', 'exl_f', 'freq_f', 'seg_f', 'ca_org_f', 'ca_spec_f', 'ca_stream_f', 'ca_hq_f', 'ca_it_f', 'ca_head_f', 'ca_adg_f'] %}{% set fv = [] %}{% for v in (filter_values(c) or []) %}{% if v|string|length < 2000 %}{% set _ = fv.append('"' ~ (v|string|replace('"', '')|replace('\\', '')|replace('\n', '')|replace('\r', '')|replace("'", "''")) ~ '"') %}{% endif %}{% endfor %}{% if fv %}{% set _ = FLT.append('"' ~ c ~ '":[' ~ fv|join(',') ~ ']') %}{% endif %}{% endfor %}
{% set SJ = ['"period":"' ~ grain ~ '"'] %}
{% set _ = SJ.append('"flt":{' ~ FLT|join(',') ~ '}') %}
{% if pubv == '0' %}{% set _ = SJ.append('"pub":"0"') %}{% endif %}
{% if actv == '0' %}{% set _ = SJ.append('"act":"0"') %}{% endif %}
{% if excv == '0' %}{% set _ = SJ.append('"exc":"0"') %}{% endif %}
{% if headsv != '0' %}{% set _ = SJ.append('"heads":"' ~ headsv ~ '"') %}{% endif %}
{% if lv3 %}{% set _ = SJ.append('"lvl3":' ~ jal(lv3)) %}{% endif %}
{% if lv4 %}{% set _ = SJ.append('"lvl4":' ~ jal(lv4)) %}{% endif %}
{% if strm %}{% set _ = SJ.append('"stream":' ~ jal(strm)) %}{% endif %}
{% if spcf %}{% set _ = SJ.append('"spec":' ~ jal(spcf)) %}{% endif %}
{% if adgf %}{% set _ = SJ.append('"adg":' ~ jal(adgf)) %}{% endif %}
{% if orgf %}{% set _ = SJ.append('"org":' ~ jal(orgf)) %}{% endif %}
{% if loginf %}{% set _ = SJ.append('"login":' ~ jal(loginf)) %}{% endif %}
{% if exlf %}{% set _ = SJ.append('"exl":' ~ jal(exlf)) %}{% endif %}
{% if freqf %}{% set _ = SJ.append('"freq":' ~ jal(freqf)) %}{% endif %}
{% if WITH_CA %}{% set _ = SJ.append('"ca":1') %}{% endif %}
{% if segv %}{% set _ = SJ.append('"seg":"' ~ segv ~ '"') %}{% endif %}
{#- Синхронизация выбора между каталогами листов «Использование» и «Охват ЦА»: каталог эмитит свой выбор
    служебной колонкой cat_sync_f (строка «r=id,id;c=…;o=…», значения — encodeURIComponent: без кавычек
    и обратных слэшей), другой каталог получает её эхом в state_j.sync и принимает выбор. Датасеты её
    не читают — только эхо. Список строится циклом: при сохранении датасета filter_values = AlwaysTrueObject. -#}
{% set syncv = [] %}{% for v in (filter_values('cat_sync_f') or []) %}{% if v|string != '' and v|string|length < 20000 %}{% set _ = syncv.append(v|string) %}{% endif %}{% endfor %}
{% if syncv %}{% set _ = SJ.append('"sync":"' ~ jes(syncv[0]|replace('"', '')|replace('\\', '')) ~ '"') %}{% endif %}
{#- Ритм пользователя отчёта (не зависит от периода полоски): 4 — Daily (12+ активных дней
    из последних 30), 3 — Weekly (6+ недель из 8), 2 — Monthly (2+ из последних 3 месяцев),
    1 — Rare (заходил за 3 месяца реже), 0 — не заходил 3 месяца (в ритм не входит; все 0 — Dead). -#}
{#- Общие метрики строки каталога (по людям строки: у kx — логин с OR масок его пар, у отчёта — пара). -#}
{% macro mets() -%}
countIf(bitAnd(msk, {{ CUR }}) != 0) AS users, sum(v_cur) AS views,
      countIf(bitCount(bitAnd(msk, {{ CUR }})) >= {{ REG }}) AS regular_users,
      dateDiff('day', toStartOfDay(max(dmax)), toStartOfDay((SELECT md FROM maxd))) AS last_view_days
{%- endmacro %}
{% set RC = "multiIf(bitCount(bitAnd(pd, 1073741823)) >= 12, 4, bitCount(bitAnd(pw, 255)) >= 6, 3, bitCount(bitAnd(pm, 7)) >= 2, 2, bitAnd(pm, 7) != 0, 1, 0)" %}
WITH
  {# Дата свежести: md пары; запасной источник — последний визит (при пустом md gp_to_click). #}
  maxd AS (SELECT max(ifNull(md, dmax)) AS md FROM prod_proteus.pa_pair),
  dash_ok AS (
    SELECT dashboard_id
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1{% if pubv == '1' %} AND published = 1{% endif %}{% if actv == '1' %} AND actual_flg = 1{% endif %}
  ),
  evd AS (
    {#- Пары области: маска бакетов msk_<g>, просмотры окна v_<g>, последний визит dmax.
        own_flg = 1 — зритель среди владельцев отчёта (свиток «без просмотров владельцев»). -#}
    SELECT toInt32(ifNull(e.dashboard_id, 0)) AS did, toString(ifNull(e.login, '')) AS login,
      {#- ifNull: gp_to_click создаёт колонки Nullable; NULL в сумме доехал бы до CAST и уронил запрос (Code 349). -#}
      toUInt64(ifNull(e.msk_{{ grain }}, 0)) AS msk, ifNull(e.v_{{ grain }}, 0) AS v_cur, e.dmax AS dmax,
      {#- маски дней/недель/месяцев — для ритма отчёта (не зависят от грануляции) -#}
      toUInt64(ifNull(e.msk_d, 0)) AS pd, toUInt64(ifNull(e.msk_w, 0)) AS pw, toUInt64(ifNull(e.msk_m, 0)) AS pm
    FROM prod_proteus.pa_pair e
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(e.login){% if excv == '1' %} AND ifNull(e.own_flg, 0) = 0{% endif %}
    {%- if loginf %} AND e.login IN {{ q(loginf) }}{% endif %}
    {%- if exlf %} AND e.login NOT IN {{ q(exlf) }}{% endif %}
    {%- if custom %} AND lower(toString(e.login)) {% if segv == 'out' %}NOT {% endif %}IN ({{ caset() }}){% endif %}
    {%- if segv in ['reach', 'out'] and not custom %} AND (toInt32(ifNull(e.dashboard_id, 0)), lower(toString(e.login))) {% if segv == 'out' %}NOT {% endif %}IN (SELECT toInt32(ifNull(dashboard_id, 0)), toString(ifNull(login, '')) FROM prod_proteus.pa_pair_acc){% endif %}
    {%- if attrson %} AND e.login IN (SELECT login FROM prod_proteus.pa_emp_attrs WHERE 1=1{% if lv3 and lv4 %} AND (lvl3_management_unit_nm IN {{ q(lv3) }} OR lvl4_management_unit_nm IN {{ q(lv4) }}){% elif lv3 %} AND lvl3_management_unit_nm IN {{ q(lv3) }}{% elif lv4 %} AND lvl4_management_unit_nm IN {{ q(lv4) }}{% endif %}{% if strm %} AND emp_stream_desc IN {{ q(strm) }}{% endif %}{% if spcf %} AND emp_specialization_desc IN {{ q(spcf) }}{% endif %}{% if adgf %} AND hasAny(ad_groups, {{ qa(adgf) }}){% endif %}{% if headsv == '1' %} AND management_head_flg = 1{% elif headsv == 'n' %} AND management_head_flg = 0{% endif %}{% if OC %} AND ({{ OC|join(' OR ') }}){% endif %}){% endif %}
  ),
  kx AS (
    {#- Ключ строки размножается: 0 = ИТОГО, 2 = владелец, 3 = коллекция (1 = отчёт — ниже, прямо по парам).
        Мета (владелец, коллекции) подтягивается ПОСЛЕ сжатия факта до пар. -#}
    SELECT kd, k0, login,
      groupBitOr(m0) AS msk, sum(v_cur) AS v_cur, max(dmax) AS dmax
    FROM (
      SELECT arrayJoin(arrayConcat(
          {# Все элементы — строго Tuple(UInt8, String): arrayConcat в CH 24 приводит массивы к типу
             первого, и Nullable-значение с NULL (owner_login меты) роняло запрос — Code 349. #}
          [(toUInt8(0), '')],
          arrayFilter(t -> t.2 != '', [(toUInt8(2), toString(ifNull(mm.owner_login, '')))]),
          arrayMap(c -> (toUInt8(3), toString(ifNull(c, ''))), arrayFilter(c -> isNotNull(c) AND c != '', mm.collection_names))
        )) AS kk, kk.1 AS kd, kk.2 AS k0,
        p.login AS login, p.msk AS m0, p.v_cur AS v_cur, p.dmax AS dmax
      FROM evd p
      INNER JOIN prod_proteus.pa_dash_meta mm ON mm.dashboard_id = p.did
    )
    GROUP BY kd, k0, login
    {%- if FB %}
    HAVING {{ FB|join(' OR ')|replace('nb', 'bitCount(bitAnd(groupBitOr(m0), ' ~ CUR ~ '))') }}
    {%- endif %}
  ),
  agg AS (
    SELECT kd, k0, {{ mets() }}, '' AS rhythm{% if WITH_CA %}, toUInt64(0) AS ca_u{% endif %}
    FROM kx GROUP BY kd, k0
    UNION ALL
    {# Строки отчётов — прямо по парам: пара «отчёт × логин» в pa_pair уникальна, свёртка по логину не нужна;
       корзина частоты (freq_f) — фильтр по маске пары, как HAVING у kx. #}
    SELECT toUInt8(1) AS kd, toString(did) AS k0, {{ mets() }},
      {#- Ритм отчёта: людей каждого ритма «Daily, Weekly, Monthly, Rare»; «0,0,0,0» — Dead. -#}
      arrayStringConcat([toString(countIf({{ RC }} = 4)), toString(countIf({{ RC }} = 3)), toString(countIf({{ RC }} = 2)), toString(countIf({{ RC }} = 1))], ',') AS rhythm
      {%- if WITH_CA %},
      {#- зрители за период, входящие в ЦА отчёта — числитель «Охвата ЦА» (посторонние зрители не в счёт) -#}
      countIf(bitAnd(msk, {{ CUR }}) != 0 AND acc = 1) AS ca_u{% endif %}
    FROM (
      SELECT did, msk, v_cur, dmax, pd, pw, pm
      {%- if WITH_CA %},
      {#- acc = 1 — зритель входит в ЦА отчёта: по правам — пара есть в pa_pair_acc (право на отчёт поимённо или
          через AD-группу, действующий сотрудник); по условиям — все пары уже отобраны по ЦА выше.
          Только здесь: у ИТОГО / владельцев / коллекций «Охват ЦА» не выводится, множество строится один раз. -#}
      {% if custom %}toUInt8(1){% else %}toUInt8((did, lower(login)) IN (SELECT toInt32(ifNull(dashboard_id, 0)), toString(ifNull(login, '')) FROM prod_proteus.pa_pair_acc)){% endif %} AS acc
      {%- endif %}
      FROM evd
      {%- if FB %}
      WHERE {{ FB|join(' OR ')|replace('nb', 'bitCount(bitAnd(msk, ' ~ CUR ~ '))') }}
      {%- endif %}
    )
    GROUP BY did
  ),
  {#- Аудитория (вкладка каталога «Аудитория»): зрители периода среди действующих сотрудников (pa_staff) и сам штат —
      по разрезам. Штат — знаменатель «охвата» группы; сужается теми же условиями, что зрители (ЦА по условиям,
      людская шина панели), иначе охват группы смешивал бы разные множества. Кто не в штате — в разрезы не входит. -#}
  vz AS (
    SELECT lower(toString(login)) AS vl, groupBitOr(msk) AS vm, sum(v_cur) AS vv
    FROM evd
    GROUP BY vl
    HAVING bitAnd(vm, {{ CUR }}) != 0{% if FB %} AND ({{ FB|join(' OR ')|replace('nb', 'bitCount(bitAnd(vm, ' ~ CUR ~ '))') }}){% endif %}
  ),
  va AS (
    {#- штат × зрители — свёртка по набору атрибутов (дальше разворот по разрезам — на свёрнутых строках, не на людях) -#}
    SELECT lv, ol, sp, st, hqc, itc, hdf, count() AS sn,
      countIf(ifNull(x.vl, '') != '') AS u, sum(ifNull(x.vv, 0)) AS vw,
      countIf(ifNull(x.vl, '') != '' AND bitCount(bitAnd(ifNull(x.vm, toUInt64(0)), {{ CUR }})) >= {{ REG }}) AS rg
    FROM (
      SELECT lower(toString(s.login)) AS lg,
        [{{ ou('s.lvl3_management_unit_nm') }}, {{ ou('s.lvl4_management_unit_nm') }}, {{ ou('s.lvl5_management_unit_nm') }}, {{ ou('s.lvl6_management_unit_nm') }}, {{ ou('s.lvl7_management_unit_nm') }}] AS lv,
        if(arrayFirstIndex(z -> z = '', lv) = 0, toUInt32(5), toUInt32(arrayFirstIndex(z -> z = '', lv) - 1)) AS ol,
        arrayStringConcat(arraySlice(lv, 1, ol), ' › ') AS op,
        toString(ifNull(s.emp_specialization_desc, '')) AS sp, toString(ifNull(s.emp_stream_desc, '')) AS st,
        toString(ifNull(s.hq_code, '')) AS hqc, toString(ifNull(s.it_code, '')) AS itc, toUInt8(ifNull(s.management_head_flg, 0) = 1) AS hdf
      FROM prod_proteus.pa_staff s
    ) t
    LEFT JOIN vz x ON x.vl = t.lg
    WHERE 1
    {%- if caorg %} AND arrayExists(pz -> op = pz OR startsWith(op, concat(pz, ' › ')), {{ qa(caorg) }}){% endif %}
    {%- if caspec %} AND sp IN {{ q(caspec) }}{% endif %}{% if castrm %} AND st IN {{ q(castrm) }}{% endif %}
    {%- if cahq %} AND hqc IN {{ q(cahq) }}{% endif %}{% if cait %} AND itc IN {{ q(cait) }}{% endif %}
    {%- if cahead == '1' %} AND hdf = 1{% elif cahead == 'n' %} AND hdf = 0{% endif %}
    {%- if caadg %} AND lg IN (SELECT login FROM prod_proteus.pa_adg_member WHERE ad_group IN {{ q(caadg) }}){% endif %}
    {%- if loginf %} AND lg IN (SELECT lower(x0) FROM (SELECT arrayJoin({{ qa(loginf) }}) AS x0)){% endif %}
    {%- if exlf %} AND lg NOT IN (SELECT lower(x0) FROM (SELECT arrayJoin({{ qa(exlf) }}) AS x0)){% endif %}
    {%- if spcf %} AND sp IN {{ q(spcf) }}{% endif %}{% if strm %} AND st IN {{ q(strm) }}{% endif %}
    {%- if headsv == '1' %} AND hdf = 1{% elif headsv == 'n' %} AND hdf = 0{% endif %}
    {%- if lv3 %} AND lv[1] IN {{ q(lv3) }}{% endif %}{% if lv4 %} AND lv[2] IN {{ q(lv4) }}{% endif %}
    {%- if orgf %} AND arrayExists(pz -> op = pz OR startsWith(op, concat(pz, ' › ')), {{ qa(orgf) }}){% endif %}
    {%- if adgf %} AND lg IN (SELECT lower(toString(login)) FROM prod_proteus.pa_emp_attrs WHERE hasAny(ad_groups, {{ qa(adgf) }})){% endif %}
    GROUP BY lv, ol, sp, st, hqc, itc, hdf
  ),
  ak AS (
    SELECT kk.1 AS ad, kk.2 AS ak0, kk.3 AS ap, sum(u) AS users, sum(vw) AS views, sum(rg) AS regular, sum(sn) AS staff
    FROM va
    ARRAY JOIN arrayConcat(
      arrayMap(i -> ('o', arrayStringConcat(arraySlice(lv, 1, i), ' › '), arrayStringConcat(arraySlice(lv, 1, toUInt32(i - 1)), ' › ')), range(1, ol + 1)),
      [('s', sp, ''), ('t', st, ''), ('q', hqc, ''), ('i', itc, ''), ('h', toString(hdf), '')]) AS kk
    GROUP BY ad, ak0, ap
  )
SELECT CAST(section AS String) AS section, CAST(g AS String) AS g, CAST(k AS String) AS k, CAST(parent AS String) AS parent, CAST(n AS Int64) AS n
FROM (
  {# Строки agg — упаковкой: отчёты порциями по 1000 (по id), группы — строкой на разрез, ИТОГО — отдельно. #}
  SELECT s_sec AS section, s_g AS g, arrayStringConcat(groupArray(s_line), '\n') AS k, '{{ grain }}' AS parent, toInt64(count()) AS n
  FROM (
    SELECT CAST(CASE WHEN kd = 0 THEN 'total' WHEN kd = 1 THEN 'rep' ELSE 'grp' END AS String) AS s_sec,
      multiIf(kd = 1, toString(intDiv(ifNull(toInt32OrNull(k0), toInt32(0)), 1000)), kd = 2, 'owner', kd = 3, 'collection', '') AS s_g,
      multiIf(
        kd = 1, concat(k0, '|', toString(users), '|', toString(views), '|', toString(regular_users), '|', toString(last_view_days), '|', rhythm, '|',
          {% if WITH_CA %}toString({% if custom %}(SELECT count() FROM ({{ caset() }})){% if excv == '1' %} - ifNull(oc.n_own, 0){% endif %}{% else %}ifNull(c.ca_n, 0){% endif %}), '|',
          toString({% if custom %}toUInt8(0){% else %}ifNull(c.ca_wide, 0){% endif %}), '|', toString(ca_u){% else %}'||'{% endif %}, '|',
          {{ cz("toString(ifNull(m.dashboard_nm, ''))") }}, '|', {{ fx("toString(ifNull(m.owner_login, ''))") }}, '|',
          arrayStringConcat(arrayMap(cc -> {{ cz('cc') }}, arrayFilter(cc -> cc != '', arrayMap(cc -> toString(ifNull(cc, '')), m.collection_names))), '^'), '|',
          toString(ifNull(m.published, 0)), '|', {{ cz("toString(ifNull(m.certified_by, ''))") }}, '|', if(isNull(m.created_dt), '', toString(toDate(m.created_dt)))),
        kd = 0, concat(toString(users), '|', toString(views), '|', toString(regular_users), '|', toString(last_view_days)),
        concat({{ cz('k0') }}, '|', toString(users), '|', toString(views), '|', toString(regular_users), '|', toString(last_view_days))) AS s_line
    FROM agg
    LEFT JOIN prod_proteus.pa_dash_meta m ON m.dashboard_id = if(kd = 1, ifNull(toInt32OrNull(k0), toInt32(0)), toInt32(0))
    {%- if WITH_CA %}
    LEFT JOIN prod_proteus.pa_dash_ca c ON c.dashboard_id = if(kd = 1, ifNull(toInt32OrNull(k0), toInt32(0)), toInt32(0))
    {%- if custom and excv == '1' %}
    {#- ЦА по условиям без владельцев отчёта (как панель при «Без владельцев»): их визиты — свои. #}
    LEFT JOIN (SELECT dashboard_id, toInt64(count()) AS n_own FROM (SELECT dashboard_id, lower(toString(arrayJoin(owners_string))) AS ow FROM prod_proteus.pa_dash_meta)
      WHERE ow IN ({{ caset() }}) GROUP BY dashboard_id) oc ON oc.dashboard_id = if(kd = 1, ifNull(toInt32OrNull(k0), toInt32(0)), toInt32(0)){% endif %}{% endif %}
  )
  GROUP BY s_sec, s_g

  UNION ALL
  {# Состояние запроса: эхо фильтров (сверка выбора в чартах), опции, людская шина, режим ЦА. #}
  SELECT 'sj' AS section, '' AS g, '{{ "{" ~ SJ|join(", ") ~ "}" }}' AS k, '{{ grain }}' AS parent, toInt64(0) AS n

  UNION ALL
  {# Аудитория: строка на разрез. #}
  SELECT 'aud' AS section, ad AS g,
    arrayStringConcat(groupArray(concat({{ cz('ak0') }}, '|', {{ cz('ap') }}, '|', toString(users), '|', toString(views), '|', toString(regular), '|', toString(staff))), '\n') AS k,
    '' AS parent, toInt64(count()) AS n
  FROM ak
  GROUP BY ad
)
