{#- pa_one — панель ЕДИНОГО листа (объединение «Использование» + «Охват ЦА», 2026-09-30), v2 (2026-09-30).
    Всё, что считал pa_people (KPI области, корзины, группы, динамика, календарь, когорты), плюс целевая аудитория
    второго листа (охват, путь ЦА, кто из ЦА, не заходившие) — ОДНИМ запросом, одним списком людей.
    Слушает: шапку (period_param, pub_f/act_f/exc_f + ca_*_f строки «Целевая аудитория») и выбор каталога (mode_param + sel_f;
    группы вкладки «Аудитория» — aud_*_f: условие ЦА, как строка «Целевая аудитория»).
    Людскую шину (org_f … freq_f) НЕ читает — панель её источник.
    ЦА «по правам» (условий нет): зрители НЕ сужаются; у человека флаг «в ЦА» = действующий сотрудник (pa_staff)
      с правом хотя бы на один отчёт области. ЦА «по условиям»: ВСЕ числа панели — только по людям ЦА
      (как каталог): evd сужен до логинов ЦА, просмотры по периодам — по дневному факту этих людей.
    ОТВЕТ v2 — 5 колонок: section · g · k · parent · n (Superset повторяет имена колонок в КАЖДОЙ строке JSON: при 35
      колонках это было ~0,5 КБ на строку, половина ответа). Всё упаковано в k: строки через перевод строки, поля через «|».
      Кириллица в названиях/ФИО/путях — компактно (макрос cz; разбор — unz() в чарте): Superset пишет кириллицу \uXXXX, 6 байт на букву.
      area  — g = режим области, k = значения выбора через перевод строки, parent = грануляция, n = kt + 1 (надёжных периодов);
      md    — k = дата свежести, parent = начало истории событий; nm — k = имя одиночного отчёта; flt — k = эхо фильтров (JSON);
      sj    — k = штат, режим и условия ЦА (JSON);
      total — k = users|users_prev|views|views_prev|new_u|new_prev|react_u|regular|regular_prev|sleeping|mau|mau_prev|
                  ca_prev|ca_regprev|ca_yr|ca_out|f1|f2|f3|f4 (ЦА: заходили в пред. периоде / из них постоянные / в этом году /
                  зрители вне ЦА; f1…f4 — людей в корзинах частоты 1…4);
      ts    — «возраст|users|new_u|react_u|views»; cal — «день|users|new_u|views»;
      coh   — «месяц|людей|возрасты через ,|активных через ,»;
      ctx   — строка на разрез g (org / spec / stream / head): «ключ|родитель|users|users_prev|views|views_prev|new_u|regular|sleeping»;
      list  — ВСЕ зрители текущего периода, строка на подразделение (parent = путь «УС-3 › …»), поля (13):
              логин | ФИО | код спец. | код стрима | код стажа | маска текущего окна | маска предыдущего | возраст первого визита |
              просмотров | дней с визита (−1 — нет) | флаги (1 рук · 2 MAU · 4 MAU пред. · 8 в этом году · 16 сотрудник ·
              32 доступ · 64 в ЦА) | код HQ | код IT;
      h     — люди ЦА БЕЗ визитов в текущем периоде, свёрнуты по подразделению (parent): «код спец|код стрима|рук|код HQ|код IT|
              людей|с доступом|в ЦА|в ЦА и с доступом» (вне ЦА штат не нужен: «людей» = «в ЦА»);
      n     — поимённо люди ЦА без визитов (только если их ≤ NAMES_MAX): «логин|ФИО|спец|стрим|рук|HQ|IT|доступ|стаж» (коды);
      lo    — только при ЦА по условиям: зрители периода ВНЕ ЦА поимённо (≤ OUT_MAX самых активных), поля как у list;
      d     — словарь кодов: строка на g (spec | stream | exp | hq | it), значения по строкам, код = номер строки (1…);
      acl   — как роздан доступ: k = «группа|людей штата» по строкам, n = поимённых прав. -#}
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
{#- Поимённая строка зрителя (13 полей — см. шапку): p — зритель с штатом/доступом, a — атрибуты; spec, stream, is_head,
    m1, m2, yr — алиасы строки. Одна на список ЦА (pr) и на список «вне ЦА» (po). -#}
{% macro plnx(inca) -%}
concat({{ fx('p.login') }}, '|', {% if HAS_FIO %}{{ cz("toString(ifNull(a.fio, ''))") }}{% else %}''{% endif %}, '|', {{ cd('spec', 'spec') }}, '|', {{ cd('stream', 'stream') }}, '|',
        {% if HAS_FIO %}{{ cd('exp', "toString(ifNull(a.exp_nm, ''))") }}{% else %}{{ cd('exp', "''") }}{% endif %}, '|',
        toString(bitAnd(p.msk, {{ CUR }})), '|', toString(bitShiftRight(p.msk, {{ g.n }})), '|', toString(p.fd_k), '|', toString(p.v_cur), '|',
        toString(if(isNull(p.dmax), toInt64(-1), toInt64(dateDiff('day', toStartOfDay(p.dmax), toStartOfDay({{ MD }}))))), '|',
        toString(is_head + 2 * m1 + 4 * m2 + 8 * yr + 16 * p.stf + 32 * p.acc + 64 * {{ inca }}), '|', {{ cd('hq', 'p.hq') }}, '|', {{ cd('it', 'p.it') }})
{%- endmacro %}
{#- Путь оргструктуры зрителя «УС-3 › …» (алиасы lv, ol, opath) из атрибутов a. -#}
{% macro orgx() -%}
[{{ ou('lvl3_management_unit_nm') }}, {{ ou('lvl4_management_unit_nm') }}{% if HAS_ORG %}, {{ ou('lvl5_management_unit_nm') }}, {{ ou('lvl6_management_unit_nm') }}, {{ ou('lvl7_management_unit_nm') }}{% endif %}] AS lv,
      if(arrayFirstIndex(x -> x = '', lv) = 0, toUInt32(length(lv)), toUInt32(arrayFirstIndex(x -> x = '', lv) - 1)) AS ol,
      arrayStringConcat(arraySlice(lv, 1, ol), ' › ') AS opath
{%- endmacro %}
{% set NAMES_MAX = 20000 %}{#- больше не заходивших из ЦА — имён не отдаём, только числа -#}
{% set ACL_N = 40 %}
{% set WIDE = 0.3 %}
{#- Словарь: отсортированные массивы значений спец./стримов/стажа/HQ/IT (штат ⋃ атрибуты зрителей) — ОДИН скаляр
    на запрос; код значения = его номер в массиве (1…) — 1–3 цифры вместо названия (кириллица в JSON Superset — 6 байт на букву). -#}
{% set DZ = "(SELECT dz FROM dicts)" %}
{% set DI = {'spec': 1, 'stream': 2, 'exp': 3, 'hq': 4, 'it': 5} %}
{#- Код — transform по константным массивам (хеш-таблица строится один раз): indexOf по скаляру копировал массив
    словаря на КАЖДУЮ строку — на справочнике в 800 специализаций ×20 времени (0,16 с на столбец против 0,008). -#}
{% macro cd(gname, x) %}toString(transform({{ x }}, tupleElement({{ DZ }}, {{ DI[gname] }}), arrayEnumerate(tupleElement({{ DZ }}, {{ DI[gname] }})), toUInt32(0))){% endmacro %}
{#- Поле упаковки: разделитель полей «|» (не экранируется в JSON, в отличие от табуляции), строк — перевод строки. -#}
{% macro fx(x) %}translate({{ x }}, '|\t\n\r', '    '){% endmacro %}
{#- Компактная кириллица (та же таблица — в чарте, unz): отрезок из кириллицы и пробелов берётся в `…`, буквы внутри —
    однобайтные (CYR → TGT); служебные знаки вне отрезков экранируются: ~~ (тильда), ~p (|), ~c (^), ~b (`);
    табуляция и переводы строк — пробел. Буква кириллицы в JSON Superset: 6 байт → 1. -#}
{% set CYR = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя' %}
{% set TGT = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%' %}
{% macro cz(x) %}translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate({{ x }}, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), '([А-Яа-яЁё][А-Яа-яЁё ]*)', '`\\1`'), '{{ CYR }}', '{{ TGT }}'){% endmacro %}
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
{#- Группа людей из вкладки «Аудитория» каталога (aud_*_f): ИЛИ внутри разреза, И между разрезами и с условиями
    строки «Целевая аудитория». Действует как условие ЦА: вся панель — про людей группы (охват — доля группы). -#}
{% set auorg = [] %}{% for v in (filter_values('aud_org_f') or []) %}{% if v|string != '' and (v|string).split(' › ')|length <= 5 %}{% set _ = auorg.append(v|string) %}{% endif %}{% endfor %}
{% set auspec = [] %}{% for v in (filter_values('aud_spec_f') or []) %}{% set _ = auspec.append(v|string) %}{% endfor %}
{% set austrm = [] %}{% for v in (filter_values('aud_stream_f') or []) %}{% set _ = austrm.append(v|string) %}{% endfor %}
{% set auhq = [] %}{% for v in (filter_values('aud_hq_f') or []) %}{% set _ = auhq.append(v|string) %}{% endfor %}
{% set auit = [] %}{% for v in (filter_values('aud_it_f') or []) %}{% set _ = auit.append(v|string) %}{% endfor %}
{% set auhead = [] %}{% for v in (filter_values('aud_head_f') or []) %}{% if v|string in ['0', '1'] %}{% set _ = auhead.append(v|string) %}{% endif %}{% endfor %}
{% set auon = auorg or auspec or austrm or auhq or auit or auhead|length == 1 %}
{% set custom = caorg or caspec or castrm or cahq or cait or cahead != '' or caadg or auon %}
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
{%- if auorg %} AND arrayExists(pz -> op = pz OR startsWith(op, concat(pz, ' › ')), {{ qa(auorg) }}){% endif %}
{%- if auspec %} AND sp IN {{ q(auspec) }}{% endif %}{% if austrm %} AND st IN {{ q(austrm) }}{% endif %}
{%- if auhq %} AND hqc IN {{ q(auhq) }}{% endif %}{% if auit %} AND itc IN {{ q(auit) }}{% endif %}
{%- if auhead|length == 1 %} AND hdf = {{ auhead[0] }}{% endif %}
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
{% set FLT = [] %}{% for c in ['mode_param', 'sel_f', 'aud_org_f', 'aud_spec_f', 'aud_stream_f', 'aud_hq_f', 'aud_it_f', 'aud_head_f', 'period_param', 'pub_f', 'act_f', 'exc_f', 'org_f', 'spec_f', 'stream_f', 'adg_f', 'heads_f', 'login_f', 'exl_f', 'freq_f', 'ca_org_f', 'ca_spec_f', 'ca_stream_f', 'ca_hq_f', 'ca_it_f', 'ca_head_f', 'ca_adg_f'] %}{% set fv = [] %}{% for v in (filter_values(c) or []) %}{% if v|string|length < 2000 %}{% set _ = fv.append('"' ~ (v|string|replace('"', '')|replace('\\', '')|replace('\n', '')|replace('\r', '')|replace("'", "''")) ~ '"') %}{% endif %}{% endfor %}{% if fv %}{% set _ = FLT.append('"' ~ c ~ '":[' ~ fv|join(',') ~ ']') %}{% endif %}{% endfor %}
{% set CJ = [] %}
{% if caorg %}{% set _ = CJ.append('"org":' ~ jal(caorg)) %}{% endif %}
{% if caspec %}{% set _ = CJ.append('"spec":' ~ jal(caspec)) %}{% endif %}
{% if castrm %}{% set _ = CJ.append('"stream":' ~ jal(castrm)) %}{% endif %}
{% if cahq %}{% set _ = CJ.append('"hq":' ~ jal(cahq)) %}{% endif %}
{% if cait %}{% set _ = CJ.append('"it":' ~ jal(cait)) %}{% endif %}
{% if cahead %}{% set _ = CJ.append('"head":"' ~ cahead ~ '"') %}{% endif %}
{% if caadg %}{% set _ = CJ.append('"adg":' ~ jal(caadg)) %}{% endif %}
{#- группа из каталога — отдельно: чарт подписывает её «группа из каталога» -#}
{% set AJ = [] %}
{% if auorg %}{% set _ = AJ.append('"org":' ~ jal(auorg)) %}{% endif %}
{% if auspec %}{% set _ = AJ.append('"spec":' ~ jal(auspec)) %}{% endif %}
{% if austrm %}{% set _ = AJ.append('"stream":' ~ jal(austrm)) %}{% endif %}
{% if auhq %}{% set _ = AJ.append('"hq":' ~ jal(auhq)) %}{% endif %}
{% if auit %}{% set _ = AJ.append('"it":' ~ jal(auit)) %}{% endif %}
{% if auhead|length == 1 %}{% set _ = AJ.append('"head":"' ~ auhead[0] ~ '"') %}{% endif %}
{% set OWN = 'AND ifNull(own_flg, 0) = 0' if excv == '1' else '' %}
{#- Зрители текущего периода (те же пары и то же «без владельцев», что у evd) — логины в нижнем регистре. -#}
{% macro curset() -%}
SELECT lower(toString(login)) FROM prod_proteus.pa_pair
      WHERE dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(login)
        AND bitAnd(toUInt64(ifNull(msk_{{ grain }}, 0)), {{ CUR }}) != 0 {{ OWN }}
{%- endmacro %}
{% set OUT_MAX = NAMES_MAX %}{#- «вне ЦА» (при ЦА по условиям) поимённо — не больше стольких, самые активные -#}
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
    {#- Зритель + атрибуты + роли, в которые он попадает. Поимённая строка (роль list) собирается ЗДЕСЬ, до размножения
        по ролям: у остальных ролей строк-атрибутов нет (раньше каждая роль несла ФИО, путь, спец. — и ~20 any() в agg). -#}
    SELECT p.msk AS msk, p.v_cur AS v_cur, p.v_prev AS v_prev,
      p.fd_k AS fd_k, p.fd_d AS fd_d, toUInt8(bitTest(p.mon, 1)) AS m1, toUInt8(bitTest(p.mon, 2)) AS m2,
      {#- Месяцы активности из маски: возраст самого старого — месяц первого визита (когорта). -#}
      arrayMap(i -> toInt64(i), arrayFilter(i -> bitTest(p.mon, i), range(63))) AS bms,
      if(empty(bms), toInt64(0), arrayMax(bms)) AS gm,
      addMonths(toStartOfMonth({{ MD }}), -toInt32(gm)) AS c0,
      bitAnd(p.msk, {{ CUR }}) != 0 AS cur, bitAnd(p.msk, {{ PREV }}) != 0 AS prv,
      bitCount(bitAnd(p.msk, {{ CUR }})) AS nb_cur, bitCount(bitAnd(p.msk, {{ PREV }})) AS nb_prev,
      multiIf(nb_cur <= {{ FBIN[0] }}, 1, nb_cur <= {{ FBIN[1] }}, 2, nb_cur <= {{ FBIN[2] }}, 3, 4) AS bin,  {#- корзина — по АКТИВНЫМ ПЕРИОДАМ грануляции -#}
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
      arrayFilter(x -> x >= 1 AND x <= 11, arrayMap(y -> gm - y, bms)) AS ags,
      {#- ЦА: stf — действующий сотрудник (pa_staff), acc — право хотя бы на один отчёт области, inca — в ЦА
          (по условиям — все зрители уже люди ЦА; по правам — сотрудник с доступом). -#}
      toUInt8(p.stf = 1 AND {% if custom %}1{% else %}p.acc = 1{% endif %}) AS inca,
      toUInt8(bitAnd(p.mon, toUInt64(bitShiftLeft(toUInt64(1), toUInt8(toMonth({{ MD }})))) - 1) != 0) AS yr,
      {#- поимённая строка (13 полей — см. шапку файла); коды — номера в словаре d -#}
      {{ plnx('inca') }} AS pln,
      arrayJoin(arrayConcat(
        [('total', '', '', '', toInt64(-1))],
        if(cur OR prv, arrayMap(i -> ('ctx', 'org', arrayStringConcat(arraySlice(lv, 1, i), ' › '), arrayStringConcat(arraySlice(lv, 1, toUInt32(i - 1)), ' › '), toInt64(-1)), range(1, ol + 1)), []),
        if((cur OR prv) AND spec != '', [('ctx', 'spec', spec, '', toInt64(-1))], []),
        if((cur OR prv) AND stream != '', [('ctx', 'stream', stream, '', toInt64(-1))], []),
        if((cur OR prv) AND is_head = 1, [('ctx', 'head', '1', '', toInt64(-1))], []),
        {% if WITH_ADG %}if(cur OR prv, arrayMap(x -> ('ctx', 'adg', toString(ifNull(x, '')), '', toInt64(-1)), arrayFilter(x -> isNotNull(x) AND x != '', a.ad_groups)), []),{% endif %}
        if(cur, [('list', '', pln, opath, toInt64(-1))], []),
        if(gm < 12, [('coh', '', toString(c0), '', toInt64(-1))], [])
        {#- Динамика и календарь — НЕ ролями (было 3/4 строк разворота: 1,2 млн на весь Proteus), а массивами по людям (tc ниже). -#}
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
{% if custom %}
  evo AS (
    {#- ЦА по условиям: зрители текущего периода ВНЕ ЦА (те же пары, «без владельцев» и срез области, что у evd) —
        для списка «Вне ЦА» в «Кто смотрит» и их числа. -#}
    SELECT toString(ifNull(e.login, '')) AS login, lower(toString(ifNull(e.login, ''))) AS lg,
      groupBitOr(toUInt64(ifNull(e.msk_{{ grain }}, 0))) AS msk, sum(ifNull(e.v_{{ grain }}, 0)) AS v_cur,
      max(ifNull(e.kmax_{{ grain }}, 0)) AS fd_k, max(e.dmax) AS dmax, groupBitOr(toUInt64(ifNull(e.msk_mon, 0))) AS mon
    FROM prod_proteus.pa_pair e
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(e.login){% if excv == '1' %} AND ifNull(e.own_flg, 0) = 0{% endif %}
    {%- if have and pmode in CUTS %} AND e.login IN (SELECT login FROM prod_proteus.pa_emp_attrs WHERE {{ CUTS[pmode] }} IN {{ q(sel) }}){% endif %}
      AND lower(toString(e.login)) NOT IN ({{ caset() }})
    GROUP BY e.login
    HAVING bitAnd(msk, {{ CUR }}) != 0
  ),
  po AS (
    SELECT opath AS o_path, pln AS o_ln FROM (
      SELECT p.v_cur AS vv, {{ orgx() }},
        toString(ifNull(a.emp_specialization_desc, '')) AS spec, toString(ifNull(a.emp_stream_desc, '')) AS stream,
        toUInt8(ifNull(a.management_head_flg, 0) = 1) AS is_head, toUInt8(bitTest(p.mon, 1)) AS m1, toUInt8(bitTest(p.mon, 2)) AS m2,
        toUInt8(bitAnd(p.mon, toUInt64(bitShiftLeft(toUInt64(1), toUInt8(toMonth({{ MD }})))) - 1) != 0) AS yr,
        {{ plnx('0') }} AS pln
      FROM (
        SELECT e.*, toUInt8(ifNull(s.login, '') != '') AS stf, toUInt8(e.lg IN ({{ accset() }})) AS acc,
          toString(ifNull(s.hq_code, '')) AS hq, toString(ifNull(s.it_code, '')) AS it
        FROM evo e
        LEFT JOIN prod_proteus.pa_staff s ON s.login = e.lg
      ) p
      LEFT JOIN prod_proteus.pa_emp_attrs a ON a.login = p.login
      ORDER BY vv DESC, p.login
      LIMIT {{ OUT_MAX }}
    )
  ),
  {% endif %}
  agg AS (
    SELECT rk.1 AS role, rk.2 AS g, rk.3 AS k, rk.4 AS parent,
      countIf(cur) AS users, countIf(prv) AS users_prev,
      sum(v_cur) AS views, sum(v_prev) AS views_prev,
      countIf(cur AND fd_k < {{ g.n }} AND fd_k <= {{ KT }}) AS new_u,
      countIf(prv AND fd_k >= {{ g.n }} AND fd_k < {{ 2 * g.n }} AND fd_k <= {{ KT }}) AS new_prev,
      {#- корзины частоты (только у total): людей текущего периода в корзине 1…4 -#}
      countIf(cur AND bin = 1) AS f1, countIf(cur AND bin = 2) AS f2, countIf(cur AND bin = 3) AS f3, countIf(cur AND bin = 4) AS f4,
      countIf(nb_cur > {{ FBIN[1] }}) AS regular, countIf(nb_prev > {{ FBIN[1] }}) AS regular_prev,
      countIf(prv AND NOT cur) AS sleeping,
      countIf(m1 = 1) AS mau, countIf(m2 = 1) AS mau_prev,
      count() AS cnt,
      countIf(prv AND inca = 1) AS ca_prev, countIf(nb_prev > {{ FBIN[1] }} AND inca = 1) AS ca_regprev,
      countIf(yr = 1 AND inca = 1) AS ca_yr, countIf(cur AND inca = 0) AS ca_out,
      sumMap(if(rk.1 = 'coh', ags, CAST([], 'Array(Int64)')), if(rk.1 = 'coh', arrayMap(x -> toUInt64(1), ags), CAST([], 'Array(UInt64)'))) AS am
    FROM pr
    GROUP BY role, g, k, parent
  ),
  tc AS (
    {#- Динамика (бакеты периода k < n) и календарь (дни k < {{ CAL_N }}): суммы по зрителям одной строкой — sumMap по
        позициям единичных битов масок (только активные бакеты и дни человека). Раньше — строка на каждый активный бакет и
        день человека (3/4 разворота ролей, 1,2 млн строк на весь Proteus). -#}
    SELECT sumMap(tb, arrayWithConstant(length(tb), toUInt64(1))) AS tu,
      sumMap(tf, arrayWithConstant(length(tf), toUInt64(1))) AS tn,
      sumMap(tr0, arrayWithConstant(length(tr0), toUInt64(1))) AS tr,
      sumMap(cb, arrayWithConstant(length(cb), toUInt64(1))) AS cu,
      sumMap(cf, arrayWithConstant(length(cf), toUInt64(1))) AS cn
    FROM (
      SELECT arrayMap(x -> toUInt16(x), bitPositionsToArray(bitAnd(msk, {{ CUR }}))) AS tb,
        {#- новый в бакете первого визита (если он в окне и до него ≥ {{ HIST_DAYS }} дней истории) -#}
        if(fd_k < {{ g.n }} AND fd_k <= {{ KT }} AND bitTest(msk, toUInt8(least(fd_k, 63))), [toUInt16(fd_k)], CAST([], 'Array(UInt16)')) AS tf,
        {#- вернувшиеся: активен в бакете, не первый визит и ни одного визита в {{ g.gap }} бакетах перед ним -#}
        arrayFilter(t -> t != fd_k AND bitAnd(msk, toUInt64(bitShiftLeft(toUInt64({{ GAPM }}), toUInt8(t + 1)))) = 0, tb) AS tr0,
        arrayMap(x -> toUInt16(x), arrayFilter(t -> t < {{ CAL_N }}, bitPositionsToArray(mskd))) AS cb,
        if(fd_d < {{ CAL_N }} AND fd_d <= {{ KTD }} AND bitTest(mskd, toUInt8(least(fd_d, 63))), [toUInt16(fd_d)], CAST([], 'Array(UInt16)')) AS cf
      FROM evd
    )
  ),
  bv AS (
    {#- Просмотры по бакетам: gg = 'g' — окно периода (линия «Просмотры» динамики), gg = 'd' — дни календаря (30 дней).
        Людской срез области (cut:*) — только из факта (у pa_dash_bkt разбивки по людям нет), одним чтением на обе серии. -#}
    {%- if (have and pmode in CUTS) or custom %}
    SELECT x.1 AS gg, x.2 AS bk, sum(e.views) AS bviews
    FROM prod_proteus.pa_evd_day e
    ARRAY JOIN arrayFilter(y -> y.2 < if(y.1 = 'g', {{ g.n }}, 30), [('g', {{ kx('e.log_dttm') }}), ('d', {{ kd('e.log_dttm') }})]) AS x
    {# Нижняя граница даты — отдельным условием на саму колонку: по нему ClickHouse отбрасывает старые месяцы факта
       (партиции по месяцу); выражения dateDiff(…) < n для отсечения не годятся — факт читался целиком. #}
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM dash_ok)
      AND e.log_dttm >= least(toDateTime({{ g.sf }}({{ MD }}) - toInterval{{ {'d': 'Day', 'w': 'Week', 'm': 'Month', 'q': 'Quarter'}[grain] }}({{ g.n - 1 }})), toDateTime(toStartOfDay({{ MD }}) - toIntervalDay(29)))
      AND ({{ kx('e.log_dttm') }} < {{ g.n }} OR {{ kd('e.log_dttm') }} < 30)
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
    {#- Люди ЦА БЕЗ визитов в текущем периоде: вместе со зрителями списка (list) дают всю ЦА и её группы.
        Только ЦА (2026-09-30): чарт берёт из h лишь «в ЦА» и «в ЦА с доступом» — остальной штат (75 тыс. строк на
        любой клик, даже на один отчёт) не нужен. По правам ЦА = доступ (acc = 1 у всех строк). -#}
    SELECT {{ sattrs() }},
      {% if custom %}toUInt8(lg IN ({{ accset() }})){% else %}toUInt8(1){% endif %} AS acc,
      toUInt8(1) AS inca
    FROM prod_proteus.pa_staff s
    WHERE lg NOT IN ({{ curset() }})
      AND {% if custom %}({{ cond() }}){% else %}lg IN ({{ accset() }}){% endif %}
    {% if excv == '1' %}
      {# владельцы ВСЕХ отчётов области (у одного отчёта — его владельцы) — не аудитория: их визиты — свои #}
      AND lg NOT IN (SELECT o FROM (SELECT arrayJoin(owners_string) AS o FROM prod_proteus.pa_dash_meta WHERE dashboard_id IN (SELECT dashboard_id FROM dash_ok))
        GROUP BY o HAVING count() = (SELECT count() FROM dash_ok)){% endif %}
  ),
  s1 AS (
    {#- Роль строки ЦА без визитов: h — свёртка по ключу, n — поимённо. Один проход по sv. -#}
    SELECT rl, op,
      if(rl = 'h', concat({{ cd('spec', 'sp') }}, '|', {{ cd('stream', 'st') }}, '|', toString(hdf), '|', {{ cd('hq', 'hqc') }}, '|', {{ cd('it', 'itc') }}), '') AS hk,
      if(rl = 'n', concat({{ fx('lg') }}, '|', {{ cz('sfio') }}, '|', {{ cd('spec', 'sp') }}, '|', {{ cd('stream', 'st') }}, '|', toString(hdf), '|',
        {{ cd('hq', 'hqc') }}, '|', {{ cd('it', 'itc') }}, '|', toString(acc), '|', {{ cd('exp', 'sexp') }}), '') AS ln,
      count() AS c, countIf(acc = 1) AS ca, countIf(inca = 1) AS cn, countIf(inca = 1 AND acc = 1) AS cna
    FROM sv
    ARRAY JOIN ['h', 'n'] AS rl
    GROUP BY rl, op, hk, ln
  ),
  s2 AS (
    SELECT rl AS sec, op,
      arrayStringConcat(groupArray(if(rl = 'h', concat(hk, '|', toString(c), '|', toString(ca), '|', toString(cn), '|', toString(cna)), ln)), '\n') AS pk,
      sum(c) AS n, sumIf(c, rl = 'n') AS nn
    FROM s1 GROUP BY sec, op
  ),
  s3 AS (
    {#- имена не заходивших — только если их не больше NAMES_MAX (иначе ЦА надо сузить условиями) -#}
    SELECT sec, op, pk, n, sum(nn) OVER () AS nnever FROM s2
  ),
  rnk AS (
    SELECT *,
      {#- ранг нужен только топу AD-групп: без WITH_ADG окно не считаем -#}
      {% if WITH_ADG %}row_number() OVER (PARTITION BY role, g ORDER BY users DESC, views DESC, k){% else %}toUInt64(0){% endif %} AS rn
    FROM agg
  )
SELECT CAST(section AS String) AS section, CAST(g AS String) AS g, CAST(k AS String) AS k, CAST(parent AS String) AS parent, CAST(n AS Int64) AS n
FROM (
  {# Все секции людей — из ОДНОГО прохода по agg (вторая ссылка на CTE в CH 24 пересчитывает его целиком):
     строка agg → строка упаковки своей секции; list — по подразделениям, ctx — по разрезу, остальное — одной строкой. #}
  SELECT s_sec AS section, s_gg AS g, arrayStringConcat(groupArray(s_line), '\n') AS k,
    if(s_sec = 'list', {{ cz('s_par') }}, '') AS parent, toInt64(count()) AS n
  FROM (
    SELECT role AS s_sec, if(role = 'ctx', g, '') AS s_gg, if(role = 'list', parent, '') AS s_par,
      multiIf(
        role = 'list', k,
        role = 'ctx', concat({{ cz('k') }}, '|', {{ cz('parent') }}, '|', toString(users), '|', toString(users_prev), '|', toString(views), '|',
          toString(views_prev), '|', toString(new_u), '|', toString(regular), '|', toString(sleeping)),
        role = 'total', concat(toString(users), '|', toString(users_prev), '|', toString(views), '|', toString(views_prev), '|', toString(new_u), '|',
          toString(new_prev), '|', '0', '|', toString(regular), '|', toString(regular_prev), '|', toString(sleeping), '|',
          toString(mau), '|', toString(mau_prev), '|', toString(ca_prev), '|', toString(ca_regprev), '|', toString(ca_yr), '|',
          {#- вне ЦА заходили: по правам — зрители без права; по условиям (evd уже сужен до ЦА) — отдельным счётом по парам -#}
          {% if custom %}toString((SELECT count() FROM evo)){% else %}toString(ca_out){% endif %}, '|',
          toString(f1), '|', toString(f2), '|', toString(f3), '|', toString(f4)),
        role = 'coh', concat(k, '|', toString(cnt), '|', arrayStringConcat(arrayMap(x -> toString(x), am.1), ','), '|', arrayStringConcat(arrayMap(x -> toString(x), am.2), ',')),
        '') AS s_line
    FROM rnk
    {# группы — только с людьми ТЕКУЩЕГО периода (чарт строки «только прошлый период» не показывает) #}
    WHERE role != 'ctx' OR (users > 0{% if WITH_ADG %} AND (g != 'adg' OR rn <= {{ ADG_N }}){% endif %})
  )
  GROUP BY s_sec, s_gg, s_par

  UNION ALL
  {# Динамика (ts: «возраст|users|new_u|react_u|views») и календарь (cal: «день|users|new_u|views») — из массивов tc;
     просмотры — серии bv (g — бакеты периода, d — дни). Бакеты без зрителей не выводятся (чарт дорисует нулями). #}
  SELECT x_sec AS section, '' AS g, arrayStringConcat(groupArray(concat(toString(x_k), '|', toString(x_u), '|', toString(x_n), '|',
      if(x_sec = 'ts', concat(toString(x_r), '|'), ''), toString(toInt64(ifNull(b.bviews, 0))))), '\n') AS k, '' AS parent, toInt64(count()) AS n
  FROM (
    {#- sumMap → (ключи, суммы): значение бакета — по его ключу (indexOf по короткому массиву; нет ключа — 0) -#}
    SELECT x.1 AS x_sec, x.2 AS x_k, x.3 AS x_u, x.4 AS x_n, x.5 AS x_r, if(x.1 = 'ts', 'g', 'd') AS x_g
    FROM tc
    ARRAY JOIN arrayConcat(
      arrayMap((t, u) -> ('ts', toInt64(t), u, if(indexOf(tn.1, t) > 0, tn.2[indexOf(tn.1, t)], toUInt64(0)),
        if(indexOf(tr.1, t) > 0, tr.2[indexOf(tr.1, t)], toUInt64(0))), tu.1, tu.2),
      arrayMap((t, u) -> ('cal', toInt64(t), u, if(indexOf(cn.1, t) > 0, cn.2[indexOf(cn.1, t)], toUInt64(0)), toUInt64(0)), cu.1, cu.2)) AS x
    WHERE x.3 > 0
  ) z
  LEFT JOIN bv b ON b.gg = z.x_g AND b.bk = z.x_k
  GROUP BY x_sec

  UNION ALL
  {# Эхо области (плечи ниже не читают ни факт, ни пары, кроме одной строки меты по id). #}
  SELECT 'area' AS section, '{{ pmode if have else '' }}' AS g, {% if have %}{{ q([sel|join('\n')]) }}{% else %}''{% endif %} AS k, '{{ grain }}' AS parent, toInt64(greatest({{ KT }} + 1, 0)) AS n
  UNION ALL
  {# md — дата свежести (от неё чарт подписывает периоды, не от сегодняшнего дня браузера), parent — начало истории событий #}
  SELECT 'md' AS section, '' AS g, toString(toDate({{ MD }})) AS k, toString({{ DS }}) AS parent, toInt64(0) AS n
  UNION ALL
  SELECT 'nm' AS section, '' AS g, {% if have and pmode == 'report' and repids|length == 1 %}ifNull((SELECT any(dashboard_nm) FROM prod_proteus.pa_dash_meta WHERE dashboard_id = {{ repids[0] }}), ''){% else %}''{% endif %} AS k, '' AS parent, toInt64(0) AS n
  UNION ALL
  SELECT 'flt' AS section, '' AS g, '{{ '{' ~ FLT|join(',') ~ '}' }}' AS k, '' AS parent, toInt64(0) AS n
  UNION ALL
  {# штат, режим и условия ЦА #}
  SELECT 'sj' AS section, '' AS g, concat('{"staff":', toString((SELECT count() FROM prod_proteus.pa_staff)), ', "wide":{{ WIDE }}, "caMode":"{{ 'cond' if custom else 'acc' }}", "ca":{{ '{' ~ CJ|join(', ') ~ '}' }}, "aud":{{ '{' ~ AJ|join(', ') ~ '}' }}}') AS k, '' AS parent, toInt64(0) AS n

  UNION ALL
  {# Люди ЦА без визитов в периоде: h — свёртка, n — поимённо (если их ≤ NAMES_MAX). n = людей в строке. #}
  SELECT sec AS section, '' AS g, pk AS k, {{ cz('op') }} AS parent, toInt64(n) AS n
  FROM s3
  WHERE sec = 'h' OR nnever <= {{ NAMES_MAX }}

  {% if custom %}
  UNION ALL
  {# «Вне ЦА» поимённо (только при ЦА по условиям): строки как у list, флаг «в ЦА» = 0; n = людей в строке. #}
  SELECT 'lo' AS section, '' AS g, arrayStringConcat(groupArray(o_ln), '\n') AS k, {{ cz('o_path') }} AS parent, toInt64(count()) AS n
  FROM po
  GROUP BY o_path
  {% endif %}

  UNION ALL
  {# Словарь кодов: строка на g, значения по строкам (код = номер строки). #}
  SELECT 'd' AS section, x.1 AS g, arrayStringConcat(arrayMap(v -> {{ cz('v') }}, x.2), '\n') AS k, '' AS parent, toInt64(length(x.2)) AS n
  FROM (SELECT arrayJoin([('spec', dz.1), ('stream', dz.2), ('exp', dz.3), ('hq', dz.4), ('it', dz.5)]) AS x FROM dicts)

  UNION ALL
  {# Как роздан доступ к области: крупнейшие группы (людей штата в группе) и число поимённых прав. #}
  SELECT 'acl' AS section, '' AS g, arrayStringConcat(groupArray(concat({{ cz('ad_group') }}, '|', toString(cnt))), '\n') AS k, '' AS parent,
    toInt64((SELECT uniqExact(principal) FROM prod_proteus.pa_dash_acl WHERE kind = 'user' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok))) AS n
  FROM (
    SELECT toString(m.ad_group) AS ad_group, uniqExact(m.login) AS cnt
    FROM prod_proteus.pa_adg_member m
    WHERE m.ad_group IN (SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'group' AND dashboard_id IN (SELECT dashboard_id FROM dash_ok))
      AND m.login IN (SELECT login FROM prod_proteus.pa_staff)
    GROUP BY ad_group ORDER BY cnt DESC, ad_group LIMIT {{ ACL_N }}
  )
)
