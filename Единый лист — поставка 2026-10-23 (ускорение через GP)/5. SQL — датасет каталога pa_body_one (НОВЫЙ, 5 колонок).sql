{# Proteus Adoption — единый лист · поставка 22.10 · 2026-10-22 · pa-reports-body.data.sql ecf527df54b7 · СОБРАН АВТОМАТИЧЕСКИ: не правьте здесь — исходник Виджеты/pa-reports-body.data.sql, сборка — python3 .stand/pack.py #}
{%- set PA_H = namespace(d=0) -%}{%- macro H() -%}{%- if PA_NOHIDE is defined -%}{{ caller() }}{%- else -%}{%- set PA_H.d = PA_H.d + 1 -%}{%- set x = caller() -%}{%- set PA_H.d = PA_H.d - 1 -%}{%- if PA_H.d > 0 -%}{{ x }}{%- elif '[' in x or ']' in x -%}{{ caller() }}{%- else -%}{%- if PA_MARK is defined -%}{{ PA_MARK[0] }}{%- endif -%}[{{ x }}][1]{%- if PA_MARK is defined -%}{{ PA_MARK[1] }}{%- endif -%}{%- endif -%}{%- endif -%}{%- endmacro -%}{#- H — сборка .stand/hidesql.py: «[выражение][1]» Superset разбирает одним словом (быстрее в разы), ClickHouse читает как само выражение. Исходник — без H, в Виджеты/. -#}{#- pa_cube v7 — каталог (левый чарт): отчёты / коллекции / владельцы + ИТОГО + аудитория (разрезы людей).
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
              «значение|родитель (у o — путь уровнем выше)|людей заходило|просмотров|постоянных|людей в штате»;
      pv    — мгновенная панель по клику (2026-10-22): строка на отчёт топа, то, что панель покажет по клику на него
              (формат — у блока PV_N ниже); pvh — n = kt + 1 для этого блока. -#}
{% set GRAINS = {'d': {'n': 30, 'u': 'day', 'sf': 'toStartOfDay'}, 'w': {'n': 20, 'u': 'week', 'sf': 'toMonday'}, 'm': {'n': 12, 'u': 'month', 'sf': 'toStartOfMonth'}, 'q': {'n': 8, 'u': 'quarter', 'sf': 'toStartOfQuarter'}} %}
{#- Свой период (2026-10-21) — как в SQL панели: period_param = «c|ГГГГ-ММ-ДД|шаг|n», шаг d / w / m, n ≤ 400 шагов по этот день;
    дата пересобирается из чисел, неверное значение — как «30 дней». Маска и просмотры окна — из подневного факта (ppx). -#}
{% set pv = filter_values('period_param')|first|default('d', true)|string %}
{% set CP = {} %}
{% if pv[:2] == 'c|' %}{% set pz = pv.split('|') %}{% if pz|length == 4 and pz[1]|length == 10 and pz[2] in ['d', 'w', 'm'] %}
{% set cy, cmo, cdy, cn = pz[1][0:4]|int, pz[1][5:7]|int, pz[1][8:10]|int, pz[3]|int %}
{% set dim = [31, 29 if cy % 4 == 0 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] %}
{% if cy >= 2000 and cy <= 2100 and cmo >= 1 and cmo <= 12 and cdy >= 1 and cdy <= dim[cmo - 1] and cn >= 1 and cn <= 400 %}
{% set _ = CP.update({'t': cy|string ~ '-' ~ ('0' if cmo < 10 else '') ~ cmo ~ '-' ~ ('0' if cdy < 10 else '') ~ cdy, 'g': pz[2], 'n': cn}) %}
{% endif %}{% endif %}{% endif %}
{% set cper = CP|length > 0 %}
{% set grain = CP.g if cper else pv %}
{% set grain = grain if grain in GRAINS else 'd' %}
{% set g = {'n': CP.n, 'u': GRAINS[grain].u, 'sf': GRAINS[grain].sf} if cper else GRAINS[grain] %}
{% set GK = 'c' if cper else grain %}{#- суффикс колонок окна msk_/v_ — у своего периода их даёт ppx -#}
{% set CUR = 2 ** g.n - 1 %}
{% set WITH_CA = true %}{#- true — у датасета каталога вкладки «Аудитория»: +2 колонки ca_n / ca_wide (ЦА отчёта по правам
    из pa_dash_ca, поставка 2026-09-24). У каталога «Отчётов» — false: ответ прежний, pa_dash_ca не нужна. -#}
{% set REG = {'d': 6, 'w': 6, 'm': 4, 'q': 3}[grain] %}{#- «постоянный» = корзины частоты 3–4 (≥ FBIN[1]+1 активных периодов): 6 дней/недель, 4 месяца, 3 квартала — как сегмент «Постоянный» в «Кто смотрит» -#}
{% set PREV = 2 ** (2 * g.n) - 1 - CUR %}
{#- Длинный свой период (больше LONG_MAX шагов): маска не влезает в UInt64 — у пары массив номеров шагов (k < 2n).
    Правила — как макросы mcol / mor / mcur / mnb SQL панели; у готовых периодов и своего до LONG_MAX шагов текст SQL прежний. -#}
{% set LONG_MAX = 32 %}
{% set LONG = cper and g.n > LONG_MAX %}
{% macro mcol(p) %}{% if LONG %}{{ p }}msk_c{% else %}{% call H() %}toUInt64(ifNull({{ p }}msk_{{ GK }}, 0)){% endcall %}{% endif %}{% endmacro %}
{% macro mor(x) %}{% if LONG %}groupUniqArrayArray({{ x }}){% else %}groupBitOr({{ x }}){% endif %}{% endmacro %}
{% macro mcur(x) %}{% if LONG %}arrayExists(kq -> kq < {{ g.n }}, {{ x }}){% else %}bitAnd({{ x }}, {{ CUR }}) != 0{% endif %}{% endmacro %}
{% macro mnb(x) %}{% if LONG %}arrayCount(kq -> kq < {{ g.n }}, {{ x }}){% else %}bitCount(bitAnd({{ x }}, {{ CUR }})){% endif %}{% endmacro %}
{% macro q(values) -%}
{%- set out = [] -%}
{%- for v in values -%}{%- set _ = out.append(v|string|replace('\\', '\\\\')) -%}{%- endfor -%}
{{- out|where_in -}}
{%- endmacro %}
{#- Массив-литерал для has/hasAny: where_in даёт кортеж ('a', 'b') или скаляр ('a'), а hasAny ждёт массив. -#}
{#- Значение со «]» в литерале […] сбивает лексер sqlparse 0.4.3 (имя T-SQL до первой «]» — Code 36, 09.10): тогда array(…). -#}
{% macro qa(values) -%}{%- if ']' in values|map('string')|join('') -%}array({{ q(values)[1:-1] }}){%- else -%}[{{ q(values)[1:-1] }}]{%- endif -%}{%- endmacro %}
{#- Компактная кириллица (та же таблица — в чарте, unz): отрезок из кириллицы и пробелов берётся в `…`, буквы внутри —
    однобайтные (CYR → TGT); служебные знаки вне отрезков экранируются: ~~ (тильда), ~p (|), ~c (^), ~b (`);
    табуляция и переводы строк — пробел. Буква кириллицы в JSON Superset: 6 байт → 1. -#}
{% set CYR = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя' %}
{% set TGT = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%' %}
{#- Шаблон отрезка кириллицы «([А-Яа-яЁё][А-Яа-яЁё ]*)» — без квадратных скобок в тексте (char(91) = «[», char(93) = «]»):
    так выражения с cz Superset разбирает одним словом (сборка .stand/hidesql.py). -#}
{% set CZRX = "concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)')" %}
{% macro cz(x) %}{% call H() %}translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate({{ x }}, '\t\n\r', '   '), '~', '~~'), '|', '~p'), '^', '~c'), '`', '~b'), {{ CZRX }}, '`\\1`'), '{{ CYR }}', '{{ TGT }}'){% endcall %}{% endmacro %}
{#- Владельцы отчёта (все, а не автор, 2026-10-02): owners_string без пустых, в нижнем регистре, без повторов;
    пустой список — запасной owner_login. Одно выражение на датасет — для вкладки «Владельцы» и для выбора владельца. -#}
{% macro owns(p) -%}
{% call H() %}arrayDistinct(arrayFilter(o -> o != '', if(notEmpty(arrayFilter(x -> ifNull(x, '') != '', {{ p }}owners_string)),
  arrayMap(x -> lower(trim(toString(ifNull(x, '')))), {{ p }}owners_string), array(lower(trim(toString(ifNull({{ p }}owner_login, '')))))))){% endcall %}
{%- endmacro %}
{% macro fx(x) %}{% call H() %}translate({{ x }}, '|\t\n\r', '    '){% endcall %}{% endmacro %}
{% macro jes(s) -%}{{ s|string|replace('\\', '\\\\')|replace('"', '\\"')|replace("'", "''") }}{%- endmacro %}
{% macro jal(a) -%}[{% for v in a %}{% if not loop.first %}, {% endif %}"{{ jes(v) }}"{% endfor %}]{%- endmacro %}
{% set AN = "toDate('" ~ CP.t ~ "')" if cper else '(SELECT md FROM maxd)' %}{#- анкер шагов: последний день своего периода, у готовых — свежесть -#}
{% macro kx(col) -%}{% call H() %}toInt64(dateDiff('{{ g.u }}', {{ g.sf }}({{ col }}), {{ g.sf }}({{ AN }}))){% endcall %}{%- endmacro %}
{#- Пары с окном своего периода: pa_pair + маска msk_c и просмотры текущего окна v_c — из подневного факта (2n шагов по
    последний день, одно чтение дат окна). У готовых периодов — сама pa_pair. Те же правила — макрос ppx в SQL панели. -#}
{% macro ppx(dsub) -%}
{%- if cper -%}
(SELECT p.*, {% if LONG %}c.m{% else %}{% call H() %}toUInt64(ifNull(c.m, 0)){% endcall %}{% endif %} AS msk_c, toInt64(ifNull(c.v, 0)) AS v_c
    FROM prod_proteus.pa_pair p
    LEFT JOIN (SELECT dashboard_id, login, {% if LONG %}{% call H() %}groupUniqArray(toUInt16(k)){% endcall %}{% else %}{% call H() %}groupBitOr(bitShiftLeft(toUInt64(1), toUInt8(k))){% endcall %}{% endif %} AS m, {% call H() %}sumIf(views, k < {{ g.n }}){% endcall %} AS v
      FROM (SELECT dashboard_id, login, views, {{ kx('log_dttm') }} AS k FROM prod_proteus.pa_evd_day
        WHERE dashboard_id IN ({{ dsub }}) AND log_dttm >= toDateTime({{ g.sf }}({{ AN }}) - toInterval{{ {'d': 'Day', 'w': 'Week', 'm': 'Month'}[grain] }}({{ 2 * g.n - 1 }}))
          AND log_dttm < toDateTime({{ AN }}) + toIntervalDay(1))
      WHERE k >= 0 AND k < {{ 2 * g.n }} GROUP BY dashboard_id, login) c ON c.dashboard_id = p.dashboard_id AND c.login = p.login
    WHERE p.dashboard_id IN ({{ dsub }}))
{%- else -%}prod_proteus.pa_pair{%- endif -%}
{%- endmacro %}
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
{#- Кнопка «Мои» (2026-10-07): пользователь борда — ДОСЛОВНО как в боевом датасете proteus_adoption_virt (борд 13896):
    '{{ cache_key_wrapper(current_username()) }}' прямо в тексте SQL — логин подставляется И попадает в ключ кэша
    (у каждого пользователя свой ответ). Логин Proteus может быть прежним — в секции me он переводится в актуальный
    (pa_login_map), тем же каноном, что владельцы в pa_dash_meta. -#}
{#- Сегмент ЦА из «Кто смотрит» панели (seg_f): reach — только зрители из ЦА (пара с доступом / люди условий),
    out — только зрители вне ЦА; never — людей не сужает (каталог показывает «не заходили из ЦА» по отчётам). -#}
{% set segv = filter_values('seg_f')|first|default('', true) %}{% set segv = segv if WITH_CA and segv in ['reach', 'never', 'out'] else '' %}
{#- Нормализация уровня УС — как в панели (заглушки «-», «…» = пусто, путь обрывается на них). -#}
{% macro ou(col) %}if(match(toString(ifNull({{ col }}, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull({{ col }}, ''))){% endmacro %}
{#- Атрибуты штата — готовые (GP-витрина pa_staffx, поставка 2026-10-23; путь оргструктуры — по правилу ou, как в
    панели): lg, путь op и его уровни lv / ol, спец, стрим, HQ, IT, руководитель. Раньше — регулярка на каждого сотрудника
    в каждом запросе. -#}
{% macro sattrs() -%}
{% call H() %}toString(ifNull(s.login, '')){% endcall %} AS lg, {% call H() %}arrayMap(x -> toString(ifNull(x, '')), s.slv){% endcall %} AS lv, {% call H() %}toUInt32(ifNull(s.sol, 0)){% endcall %} AS ol, {% call H() %}toString(ifNull(s.op, '')){% endcall %} AS op,
        {% call H() %}toString(ifNull(s.sp, '')){% endcall %} AS sp, {% call H() %}toString(ifNull(s.st, '')){% endcall %} AS st,
        {% call H() %}toString(ifNull(s.hqc, '')){% endcall %} AS hqc, {% call H() %}toString(ifNull(s.itc, '')){% endcall %} AS itc, {% call H() %}toUInt8(ifNull(s.hdf, 0) = 1){% endcall %} AS hdf
{%- endmacro %}
{#- Логины ЦА «по условиям»: те же условия и тот же нормализованный путь, что в SQL панели. -#}
{% macro caset() -%}
SELECT lg FROM (
      SELECT {{ sattrs() }}
      FROM prod_proteus.pa_staffx s) WHERE 1
      {%- if caorg %} AND arrayExists(pz -> op = pz OR startsWith(op, concat(pz, ' › ')), {{ qa(caorg) }}){% endif %}
      {%- if caspec %} AND sp IN {{ q(caspec) }}{% endif %}{% if castrm %} AND st IN {{ q(castrm) }}{% endif %}
      {%- if cahq %} AND hqc IN {{ q(cahq) }}{% endif %}{% if cait %} AND itc IN {{ q(cait) }}{% endif %}
      {%- if cahead == '1' %} AND hdf = 1{% elif cahead == 'n' %} AND hdf = 0{% endif %}
      {%- if caadg %} AND lg IN (SELECT login FROM prod_proteus.pa_adg_member WHERE ad_group IN {{ q(caadg) }}){% endif %}
{%- endmacro %}
{% set pplf = loginf or exlf or attrson or freqf or custom or segv %}
{#- Готовые строки (GP-витрины pa_cat_rep / pa_cat_grp / pa_cat_aud, поставка 2026-10-23): без людских условий и своего
    периода (так борд открывается и пересчитывается на период и переключатели шапки) отчёты, владельцы, коллекции, ИТОГО и
    «Аудитория» не считаются по парам, а читаются: строка витрины — сочетание переключателей шапки (pub, act, exc = 0 / 1),
    колонки — период (_d / _w / _m / _q). С любым людским условием — расчёт ниже, как раньше (правила те же — стенд same:
    ответ из витрин == расчёту). -#}
{% set DEF = not (pplf or cper) %}
{% set CBW = 'ifNull(pub, -1) = ' ~ pubv ~ ' AND ifNull(act, -1) = ' ~ actv ~ ' AND ifNull(exc, -1) = ' ~ excv %}
{#- Корзина частоты — число АКТИВНЫХ ПЕРИОДОВ грануляции в окне n В ОТЧЁТАХ СТРОКИ каталога:
    у строки отчёта — заходы в этот отчёт, у коллекции / владельца — в их отчёты, у ИТОГО — во все
    (= корзина правой панели без выбора). Фильтр — HAVING по маске человека внутри строки (kx; маска пары внутри — m0, не msk: боевой CH 24.8 в HAVING берёт msk как колонку — Code 215). -#}
{%- set FB = [] -%}
{%- set FBIN = {'d': [1, 5, 15], 'w': [1, 5, 15], 'm': [1, 3, 6], 'q': [1, 2, 3]}[grain] -%}
{%- for v in freqf -%}{%- set bi = v|int -%}{%- if bi == 1 %}{% set _ = FB.append('nb BETWEEN 1 AND ' ~ FBIN[0]) %}{% elif bi == 4 %}{% set _ = FB.append('nb > ' ~ FBIN[2]) %}{% elif bi in [2, 3] %}{% set _ = FB.append('nb BETWEEN ' ~ (FBIN[bi - 2] + 1) ~ ' AND ' ~ FBIN[bi - 1]) %}{% endif -%}{%- endfor %}
{#- Мгновенная панель по клику (2026-10-22, «один запрос, два чарта»): для PV_N отчётов с наибольшим числом зрителей — то,
    что панель (SQL панели pa_one) покажет по клику на ОДИН отчёт: KPI (секция total), «Динамика» (ts) и у «30 дней» — хвост
    «Календаря» (дни ≥ n; дни < n у «30 дней» = ряд «Динамики»). Каталог и так пересчитывается на период и опции шапки; по клику
    он сразу отдаёт панели этот блок (PA_PREV), панель рисует его до своего ответа. Правила — как у панели (evd → agg / tc / bv,
    область из одного отчёта); равенство — check_one §14. С ЦА по условиям — тоже (только люди ЦА, как у панели). Без людской
    шины и своего периода: их панель не читает / считает из подневного факта. Числа «Охвата ЦА» здесь не считаются (у панели —
    по штату и доступам).
    Строка pv: g = id, k — строки: total (20 полей, поля ЦА — 0) | людей по шагам 0…n−1 | новых | вернувшихся | просмотров |
    у «30 дней»: людей по дням n…59 | новых по дням n…59, у остальных: календарь по дням; числа через запятую,
    0 — пусто; pvh: n = kt + 1 (надёжных шагов для новых), k — первый день окна календаря (у «30 дней» — пусто). -#}
{% set PV_N = 500 %}
{#- «Календарь» у 20 недель / 12 месяцев / 8 кварталов — весь период по дням из подневного факта (как calf панели): на день с
    визитами «[день:]людей|новых|просмотров» (день — только после пропуска, иначе предыдущий + 1; новых 0 — пусто), дни
    через «;» по возрастанию.
    У «30 дней» календарь — из маски дней (строки 5–6 блока). -#}
{% set PV_CAL = grain != 'd' %}
{#- Строки подневного факта блока — только пары отчётов топа из evd: в них уже «без владельцев» и, при ЦА по условиям, только
    люди ЦА (у каждой строки факта есть пара — pa_pair строится из него же). Одно множество вместо проверки каждой строки
    на ЦА и на пары владельцев (на 12 месяцах при ЦА каталог считался 4,4 с, так — 2,35 с, без блока — 1,0 с; большой стенд). -#}
{% set PVPAIR = "(toInt32(ifNull(e.dashboard_id, 0)), toString(ifNull(e.login, ''))) IN (SELECT did, login FROM evd WHERE did IN (SELECT did FROM pvt))" %}
{#- ЦА по условиям — можно (2026-10-22): пары блока — из evd, они уже только люди ЦА, как evd панели; просмотры по шагам
    тогда — из подневного факта по людям ЦА (как bv панели при ЦА). Людская шина, корзина частоты и сегмент ЦА — нет:
    панель их не читает, а каталог по ним сужен. -#}
{% set PVON = not cper and not (loginf or exlf or attrson or freqf or segv) %}
{% set CAL_N = 60 %}
{% set GAPM = 2 ** {'d': 7, 'w': 1, 'm': 1, 'q': 1}[grain] - 1 %}
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
{% call H() %}countIf({{ mcur('msk') }}){% endcall %} AS users, sum(v_cur) AS views,
      {% call H() %}countIf({{ mnb('msk') }} >= {{ REG }}){% endcall %} AS regular_users,
      {% call H() %}dateDiff('day', toStartOfDay(max(dmax)), toStartOfDay((SELECT md FROM maxd))){% endcall %} AS last_view_days
{%- endmacro %}
{% set RC = "multiIf(bitCount(bitAnd(pd, 1073741823)) >= 12, 4, bitCount(bitAnd(pw, 255)) >= 6, 3, bitCount(bitAnd(pm, 7)) >= 2, 2, bitAnd(pm, 7) != 0, 1, 0)" %}
WITH
  {# Дата свежести: md пары; запасной источник — последний визит (при пустом md gp_to_click). #}
  maxd AS (SELECT max(assumeNotNull(md)) AS md FROM prod_proteus.pa_md),
  dash_ok AS (
    SELECT dashboard_id
    FROM prod_proteus.pa_dash_meta
    WHERE 1=1{% if pubv == '1' %} AND published = 1{% endif %}{% if actv == '1' %} AND actual_flg = 1{% endif %}
  ),
  evd AS (
    {#- Пары области: маска бакетов msk_<g>, просмотры окна v_<g>, последний визит dmax.
        own_flg = 1 — зритель среди владельцев отчёта (свиток «без просмотров владельцев»). -#}
    SELECT {% call H() %}toInt32(ifNull(e.dashboard_id, 0)){% endcall %} AS did, {% call H() %}toString(ifNull(e.login, '')){% endcall %} AS login,
      {#- ifNull: gp_to_click создаёт колонки Nullable; NULL в сумме доехал бы до CAST и уронил запрос (Code 349). -#}
      {{ mcol('e.') }} AS msk, ifNull(e.v_{{ GK }}, 0) AS v_cur, e.dmax AS dmax,
      {#- маски дней/недель/месяцев — для ритма отчёта (не зависят от грануляции) -#}
      {% call H() %}toUInt64(ifNull(e.msk_d, 0)){% endcall %} AS pd, {% call H() %}toUInt64(ifNull(e.msk_w, 0)){% endcall %} AS pw, {% call H() %}toUInt64(ifNull(e.msk_m, 0)){% endcall %} AS pm
      {%- if PVON %},
      {#- мгновенная панель: прошлое окно, шаг и день первого визита, месяцы активности пары -#}
      {% call H() %}ifNull(e.vp_{{ GK }}, 0){% endcall %} AS vp_cur, {% call H() %}ifNull(e.kmax_{{ GK }}, 0){% endcall %} AS fk, {% call H() %}toUInt64(ifNull(e.msk_mon, 0)){% endcall %} AS mon, ifNull(e.kmax_d, 0) AS fdd{% endif %}
    FROM {{ ppx('SELECT dashboard_id FROM dash_ok') }} e
    WHERE e.dashboard_id IN (SELECT dashboard_id FROM dash_ok) AND isNotNull(e.login){% if excv == '1' %} AND ifNull(e.own_flg, 0) = 0{% endif %}
    {%- if loginf %} AND e.login IN {{ q(loginf) }}{% endif %}
    {%- if exlf %} AND e.login NOT IN {{ q(exlf) }}{% endif %}
    {%- if custom %} AND lower(toString(e.login)) {% if segv == 'out' %}NOT {% endif %}IN ({{ caset() }}){% endif %}
    {%- if segv in ['reach', 'out'] and not custom %} AND (toInt32(ifNull(e.dashboard_id, 0)), lower(toString(e.login))) {% if segv == 'out' %}NOT {% endif %}IN (SELECT {% call H() %}toInt32(ifNull(dashboard_id, 0)){% endcall %}, {% call H() %}toString(ifNull(login, '')){% endcall %} FROM prod_proteus.pa_pair_acc){% endif %}
    {%- if attrson %} AND e.login IN (SELECT login FROM prod_proteus.pa_emp_attrs WHERE 1=1{% if lv3 and lv4 %} AND (lvl3_management_unit_nm IN {{ q(lv3) }} OR lvl4_management_unit_nm IN {{ q(lv4) }}){% elif lv3 %} AND lvl3_management_unit_nm IN {{ q(lv3) }}{% elif lv4 %} AND lvl4_management_unit_nm IN {{ q(lv4) }}{% endif %}{% if strm %} AND emp_stream_desc IN {{ q(strm) }}{% endif %}{% if spcf %} AND emp_specialization_desc IN {{ q(spcf) }}{% endif %}{% if adgf %} AND hasAny(ad_groups, {{ qa(adgf) }}){% endif %}{% if headsv == '1' %} AND management_head_flg = 1{% elif headsv == 'n' %} AND management_head_flg = 0{% endif %}{% if OC %} AND ({{ OC|join(' OR ') }}){% endif %}){% endif %}
  ),
  kx AS (
    {#- Ключ строки размножается: 0 = ИТОГО, 2 = владелец, 3 = коллекция (1 = отчёт — ниже, прямо по парам).
        Мета (владелец, коллекции) подтягивается ПОСЛЕ сжатия факта до пар. -#}
    SELECT kd, k0, login,
      {{ mor('m0') }} AS msk, sum(v_cur) AS v_cur, max(dmax) AS dmax
    FROM (
      SELECT {% call H() %}arrayJoin(arrayConcat(
          {# Все элементы — строго Tuple(UInt8, String): arrayConcat в CH 24 приводит массивы к типу
             первого, и Nullable-значение с NULL (owner_login меты) роняло запрос — Code 349.
             Владелец — КАЖДЫЙ из владельцев отчёта: зритель отчёта с двумя владельцами считается у обоих. #}
          array((toUInt8(0), '')),
          arrayMap(o -> (toUInt8(2), o), {{ owns('mm.') }}),
          arrayMap(c -> (toUInt8(3), toString(ifNull(c, ''))), arrayFilter(c -> isNotNull(c) AND c != '', mm.collection_names))
        )){% endcall %} AS kk, kk.1 AS kd, kk.2 AS k0,
        p.login AS login, p.msk AS m0, p.v_cur AS v_cur, p.dmax AS dmax
      FROM evd p
      INNER JOIN prod_proteus.pa_dash_meta mm ON mm.dashboard_id = p.did
    )
    GROUP BY kd, k0, login
    {%- if FB %}
    HAVING {{ FB|join(' OR ')|replace('nb', mnb(mor('m0'))|string) }}
    {%- endif %}
  ),
  agg AS (
    {%- if DEF %}
    {#- готовые строки: владельцы / коллекции / ИТОГО — строка сочетания переключателей (CBW), отчёты — строка «без владельцев» -#}
    SELECT toUInt8(ifNull(kd, 0)) AS kd, {% call H() %}toString(ifNull(k0, '')){% endcall %} AS k0, {% call H() %}toUInt64(ifNull(u_{{ grain }}, 0)){% endcall %} AS users,
      {% call H() %}toInt64(ifNull(v_{{ grain }}, 0)){% endcall %} AS views, {% call H() %}toUInt64(ifNull(r_{{ grain }}, 0)){% endcall %} AS regular_users,
      toInt64(ifNull(l, 0)) AS last_view_days, '' AS rhythm{% if WITH_CA %}, toUInt64(0) AS ca_u{% endif %}
    FROM prod_proteus.pa_cat_grp
    WHERE {{ CBW }}
    UNION ALL
    SELECT toUInt8(1) AS kd, {% call H() %}toString(ifNull(dashboard_id, 0)){% endcall %} AS k0, {% call H() %}toUInt64(ifNull(u_{{ grain }}, 0)){% endcall %} AS users,
      {% call H() %}toInt64(ifNull(v_{{ grain }}, 0)){% endcall %} AS views, {% call H() %}toUInt64(ifNull(r_{{ grain }}, 0)){% endcall %} AS regular_users,
      toInt64(ifNull(l, 0)) AS last_view_days,
      {% call H() %}arrayStringConcat(array(toString(ifNull(h4, 0)), toString(ifNull(h3, 0)), toString(ifNull(h2, 0)), toString(ifNull(h1, 0))), ','){% endcall %} AS rhythm
      {%- if WITH_CA %}, {% call H() %}toUInt64(ifNull(a_{{ grain }}, 0)){% endcall %} AS ca_u{% endif %}
    FROM prod_proteus.pa_cat_rep
    WHERE ifNull(exc, -1) = {{ excv }} AND dashboard_id IN (SELECT dashboard_id FROM dash_ok)
    {%- else %}
    SELECT kd, k0, {{ mets() }}, '' AS rhythm{% if WITH_CA %}, toUInt64(0) AS ca_u{% endif %}
    FROM kx GROUP BY kd, k0
    UNION ALL
    {# Строки отчётов — прямо по парам: пара «отчёт × логин» в pa_pair уникальна, свёртка по логину не нужна;
       корзина частоты (freq_f) — фильтр по маске пары, как HAVING у kx. #}
    SELECT toUInt8(1) AS kd, toString(did) AS k0, {{ mets() }},
      {#- Ритм отчёта: людей каждого ритма «Daily, Weekly, Monthly, Rare»; «0,0,0,0» — Dead. -#}
      {% call H() %}arrayStringConcat(array(toString(countIf({{ RC }} = 4)), toString(countIf({{ RC }} = 3)), toString(countIf({{ RC }} = 2)), toString(countIf({{ RC }} = 1))), ','){% endcall %} AS rhythm
      {%- if WITH_CA %},
      {#- зрители за период, входящие в ЦА отчёта — числитель «Охвата ЦА» (посторонние зрители не в счёт) -#}
      {% call H() %}countIf({{ mcur('msk') }} AND acc = 1){% endcall %} AS ca_u{% endif %}
    FROM (
      SELECT did, msk, v_cur, dmax, pd, pw, pm
      {%- if WITH_CA %},
      {#- acc = 1 — зритель входит в ЦА отчёта: по правам — пара есть в pa_pair_acc (право на отчёт поимённо или
          через AD-группу, действующий сотрудник); по условиям — все пары уже отобраны по ЦА выше.
          Только здесь: у ИТОГО / владельцев / коллекций «Охват ЦА» не выводится, множество строится один раз. -#}
      {% if custom %}toUInt8(1){% else %}toUInt8((did, lower(login)) IN (SELECT {% call H() %}toInt32(ifNull(dashboard_id, 0)){% endcall %}, {% call H() %}toString(ifNull(login, '')){% endcall %} FROM prod_proteus.pa_pair_acc)){% endif %} AS acc
      {%- endif %}
      FROM evd
      {%- if FB %}
      WHERE {{ FB|join(' OR ')|replace('nb', mnb('msk')|string) }}
      {%- endif %}
    )
    GROUP BY did
    {%- endif %}
  ),
  {#- Аудитория (вкладка каталога «Аудитория»): зрители периода среди действующих сотрудников (pa_staff) и сам штат —
      по разрезам. Штат — знаменатель «охвата» группы; сужается теми же условиями, что зрители (ЦА по условиям,
      людская шина панели), иначе охват группы смешивал бы разные множества. Кто не в штате — в разрезы не входит. -#}
  vz AS (
    SELECT lower(toString(login)) AS vl, {{ mor('msk') }} AS vm, sum(v_cur) AS vv
    FROM evd
    GROUP BY vl
    HAVING {{ mcur('vm') }}{% if FB %} AND ({{ FB|join(' OR ')|replace('nb', mnb('vm')|string) }}){% endif %}
  ),
  va AS (
    {#- штат × зрители — свёртка по набору атрибутов (дальше разворот по разрезам — на свёрнутых строках, не на людях) -#}
    SELECT lv, ol, sp, st, hqc, itc, hdf, count() AS sn,
      {% call H() %}countIf(ifNull(x.vl, '') != ''){% endcall %} AS u, sum(ifNull(x.vv, 0)) AS vw,
      {% call H() %}countIf(ifNull(x.vl, '') != '' AND {% if LONG %}{{ mnb('x.vm') }}{% else %}bitCount(bitAnd(ifNull(x.vm, toUInt64(0)), {{ CUR }})){% endif %} >= {{ REG }}){% endcall %} AS rg
    FROM (
      SELECT {{ sattrs() }}
      FROM prod_proteus.pa_staffx s
    ) t
    LEFT JOIN vz x ON x.vl = t.lg
    WHERE 1
    {%- if caorg %} AND arrayExists(pz -> op = pz OR startsWith(op, concat(pz, ' › ')), {{ qa(caorg) }}){% endif %}
    {%- if caspec %} AND sp IN {{ q(caspec) }}{% endif %}{% if castrm %} AND st IN {{ q(castrm) }}{% endif %}
    {%- if cahq %} AND hqc IN {{ q(cahq) }}{% endif %}{% if cait %} AND itc IN {{ q(cait) }}{% endif %}
    {%- if cahead == '1' %} AND hdf = 1{% elif cahead == 'n' %} AND hdf = 0{% endif %}
    {%- if caadg %} AND lg IN (SELECT login FROM prod_proteus.pa_adg_member WHERE ad_group IN {{ q(caadg) }}){% endif %}
    {%- if loginf %} AND lg IN (SELECT lower(x0) FROM (SELECT {% call H() %}arrayJoin({{ qa(loginf) }}){% endcall %} AS x0)){% endif %}
    {%- if exlf %} AND lg NOT IN (SELECT lower(x0) FROM (SELECT {% call H() %}arrayJoin({{ qa(exlf) }}){% endcall %} AS x0)){% endif %}
    {%- if spcf %} AND sp IN {{ q(spcf) }}{% endif %}{% if strm %} AND st IN {{ q(strm) }}{% endif %}
    {%- if headsv == '1' %} AND hdf = 1{% elif headsv == 'n' %} AND hdf = 0{% endif %}
    {%- if lv3 %} AND lv[1] IN {{ q(lv3) }}{% endif %}{% if lv4 %} AND lv[2] IN {{ q(lv4) }}{% endif %}
    {%- if orgf %} AND arrayExists(pz -> op = pz OR startsWith(op, concat(pz, ' › ')), {{ qa(orgf) }}){% endif %}
    {%- if adgf %} AND lg IN (SELECT lower(toString(login)) FROM prod_proteus.pa_emp_attrs WHERE hasAny(ad_groups, {{ qa(adgf) }})){% endif %}
    GROUP BY lv, ol, sp, st, hqc, itc, hdf
  ),
  ak AS (
    {%- if DEF %}
    SELECT {% call H() %}toString(ifNull(ad, '')){% endcall %} AS ad, {% call H() %}toString(ifNull(ak0, '')){% endcall %} AS ak0, {% call H() %}toString(ifNull(ap, '')){% endcall %} AS ap, {% call H() %}toUInt64(ifNull(u_{{ grain }}, 0)){% endcall %} AS users,
      {% call H() %}toInt64(ifNull(v_{{ grain }}, 0)){% endcall %} AS views, {% call H() %}toUInt64(ifNull(r_{{ grain }}, 0)){% endcall %} AS regular, {% call H() %}toUInt64(ifNull(staff, 0)){% endcall %} AS staff
    FROM prod_proteus.pa_cat_aud
    WHERE {{ CBW }}
    {%- else %}
    SELECT kk.1 AS ad, kk.2 AS ak0, kk.3 AS ap, sum(u) AS users, sum(vw) AS views, sum(rg) AS regular, sum(sn) AS staff
    FROM va
    ARRAY JOIN arrayConcat(
      arrayMap(i -> ('o', arrayStringConcat(arraySlice(lv, 1, i), ' › '), arrayStringConcat(arraySlice(lv, 1, toUInt32(i - 1)), ' › ')), range(1, ol + 1)),
      array(('s', sp, ''), ('t', st, ''), ('q', hqc, ''), ('i', itc, ''), ('h', toString(hdf), ''))) AS kk
    GROUP BY ad, ak0, ap
    {%- endif %}
  ){% if PVON %},
  {#- даты начала истории — как maxd панели: kt — самый старый шаг, где новых можно отличить от давно не заходивших (≥ 90 дней истории) -#}
  pvd AS (
    {#- kt, ktd; у календаря по периоду — первый день окна cs (не раньше начала истории) и число дней cd — как CS / CD панели -#}
    SELECT {% call H() %}tuple(toInt64(dateDiff('{{ g.u }}', {{ g.sf }}(dt), {{ g.sf }}(md))) - if(toDate({{ g.sf }}(dt)) = dt, 0, 1),
      toInt64(dateDiff('day', dt, toDate(md))), cs, toInt64(dateDiff('day', cs, toDate(md)) + 1)){% endcall %} AS h
    FROM (SELECT md, {% call H() %}addDays(toDate(ds0), 90){% endcall %} AS dt,
        {% call H() %}greatest(toDate({{ g.sf }}(md) - toInterval{{ {'d': 'Day', 'w': 'Week', 'm': 'Month', 'q': 'Quarter'}[grain] }}({{ g.n - 1 }})), toDate(ds0)){% endcall %} AS cs
      FROM (SELECT max(assumeNotNull(md)) AS md, min(assumeNotNull(ds)) AS ds0 FROM prod_proteus.pa_md))
  ),
  pvt AS (
    {%- if DEF %}
    SELECT toInt32(k0) AS did FROM agg WHERE kd = 1 ORDER BY users DESC, did LIMIT {{ PV_N }}
    {%- else %}
    SELECT did FROM evd GROUP BY did ORDER BY countIf({{ mcur('msk') }}) DESC, did LIMIT {{ PV_N }}
    {%- endif %}
  ),
  pva AS (
    {#- пара отчёта = строка зрителя области панели (evd панели по одному отчёту) -#}
    SELECT did,
      countIf(cur) AS u, countIf(prv) AS up, sum(vc) AS v, sum(vpv) AS vp,
      {% call H() %}countIf(cur AND fk < {{ g.n }} AND fk <= kt){% endcall %} AS nu,
      {% call H() %}countIf(prv AND fk >= {{ g.n }} AND fk < {{ 2 * g.n }} AND fk <= kt){% endcall %} AS np,
      {% call H() %}countIf(nbc > {{ FBIN[1] }}){% endcall %} AS rg, {% call H() %}countIf(nbp > {{ FBIN[1] }}){% endcall %} AS rgp, {% call H() %}countIf(prv AND NOT cur){% endcall %} AS sl,
      {% call H() %}countIf(bitTest(mon, 1)){% endcall %} AS m1, {% call H() %}countIf(bitTest(mon, 2)){% endcall %} AS m2,
      {% call H() %}countIf(cur AND nbc <= {{ FBIN[0] }}){% endcall %} AS f1, {% call H() %}countIf(nbc > {{ FBIN[0] }} AND nbc <= {{ FBIN[1] }}){% endcall %} AS f2,
      {% call H() %}countIf(nbc > {{ FBIN[1] }} AND nbc <= {{ FBIN[2] }}){% endcall %} AS f3, {% call H() %}countIf(nbc > {{ FBIN[2] }}){% endcall %} AS f4,
      {% call H() %}sumForEach(arrayMap(i -> toUInt64(bitTest(msk, i)), range({{ g.n }}))){% endcall %} AS tu,
      {% call H() %}sumForEach(arrayMap(i -> toUInt64(i = fk AND fk <= kt AND bitTest(msk, i)), range({{ g.n }}))){% endcall %} AS tn,
      {#- вернувшиеся: активен в шаге, не первый визит и ни одного визита в шагах перерыва перед ним -#}
      {% call H() %}sumForEach(arrayMap(i -> toUInt64(bitTest(msk, i) AND i != fk AND bitAnd(msk, toUInt64(bitShiftLeft(toUInt64({{ GAPM }}), toUInt8(i + 1)))) = 0), range({{ g.n }}))){% endcall %} AS tr
      {%- if grain == 'd' %},
      {% call H() %}sumForEach(arrayMap(i -> toUInt64(bitTest(mskd, i)), range({{ g.n }}, {{ CAL_N }}))){% endcall %} AS cu,
      {% call H() %}sumForEach(arrayMap(i -> toUInt64(i = fdd AND fdd <= ktd AND bitTest(mskd, i)), range({{ g.n }}, {{ CAL_N }}))){% endcall %} AS cn{% endif %}
    FROM (
      {#- пары отчёта из evd: те же «без владельцев» и, при ЦА по условиям, только люди ЦА -#}
      SELECT did, msk, v_cur AS vc, vp_cur AS vpv, fk, mon, pd AS mskd, fdd,
        bitAnd(msk, {{ CUR }}) != 0 AS cur, bitAnd(msk, {{ PREV }}) != 0 AS prv,
        {% call H() %}bitCount(bitAnd(msk, {{ CUR }})){% endcall %} AS nbc, {% call H() %}bitCount(bitAnd(msk, {{ PREV }})){% endcall %} AS nbp,
        {% call H() %}tupleElement((SELECT h FROM pvd), 1){% endcall %} AS kt, {% call H() %}tupleElement((SELECT h FROM pvd), 2){% endcall %} AS ktd, {% call H() %}tupleElement((SELECT h FROM pvd), 4){% endcall %} AS cd
      FROM evd
      WHERE did IN (SELECT did FROM pvt)
    )
    GROUP BY did
  ),
  pvb AS (
    {#- просмотры по шагам — как bv панели: без ЦА — pa_dash_bkt (без владельцев — views_nown), при ЦА по условиям — подневный
        факт людей ЦА без пар владельцев (PVPAIR) -#}
    SELECT toInt32(dashboard_id) AS did,
      {% call H() %}sumForEach(arrayMap(i -> toInt64(if(toInt64(k) = toInt64(i), {% if custom %}vv{% else %}ifNull({{ 'views_nown' if excv == '1' else 'views' }}, 0){% endif %}, 0)), range({{ g.n }}))){% endcall %} AS tv
    {%- if custom %}
    FROM (
      SELECT e.dashboard_id AS dashboard_id, {{ kx('e.log_dttm') }} AS k, toInt64(sum(e.views)) AS vv
      FROM prod_proteus.pa_evd_day e
      WHERE e.dashboard_id IN (SELECT did FROM pvt)
        AND e.log_dttm >= toDateTime({{ g.sf }}((SELECT md FROM maxd)) - toInterval{{ {'d': 'Day', 'w': 'Week', 'm': 'Month', 'q': 'Quarter'}[grain] }}({{ g.n - 1 }}))
        AND {{ PVPAIR }}
      GROUP BY dashboard_id, k
      HAVING k >= 0 AND k < {{ g.n }}
    )
    {%- else %}
    FROM prod_proteus.pa_dash_bkt
    WHERE grain = '{{ grain }}' AND dashboard_id IN (SELECT did FROM pvt) AND k >= 0 AND k < {{ g.n }}
    {%- endif %}
    GROUP BY did
  ){% if PV_CAL %},
  pvc AS (
    {#- календарь по периоду — как calf панели: люди и просмотры дня; день — дней назад от даты свежести; новые дня — nfd в pva.
        Без ЦА по условиям — готовые дни отчёта (GP-витрина pa_dash_day: все зрители / без владельцев), с ЦА — подневный факт
        пар блока (PVPAIR: только люди ЦА). -#}
    {#- строка календаря — здесь, до соединения с pva (при join_use_nulls = 1 массив после LEFT JOIN — Nullable, и лямбда над
        ним на старом анализаторе расходилась по длине): дни по возрастанию; номер дня — только если он не следующий за
        предыдущим («k:»): у популярных отчётов визиты почти каждый день, номера почти не нужны. Предыдущий день — отдельным
        массивом-аргументом лямбды: обращение к t внутри неё ClickHouse копирует на каждый элемент (квадратично: 8 кварталов —
        4,5 с на блок). -#}
    SELECT did, {% call H() %}arrayStringConcat(arrayMap((x, pd) -> concat(if(x.1 = pd + 1, '', concat(toString(x.1), ':')),
        toString(x.2), '|', if(x.4 = 0, '', toString(x.4)), '|', toString(x.3)), t, arrayPushFront(arrayPopBack(arrayMap(y -> y.1, t)), toInt64(-2))), ';'){% endcall %} AS cal
    FROM (
    SELECT did, {% call H() %}arraySort(groupArray((ck, su, sv, sn))){% endcall %} AS t
    {# суммы — под другими именами: с prefer_column_name_to_alias = 1 (бой) «sum(cu) AS cu» в HAVING — колонка cu, Code 215 #}
    FROM (SELECT did, ck, sum(cu) AS su, sum(cv) AS sv, sum(cn) AS sn FROM (
      SELECT did, ck, cu, cv, toUInt64(0) AS cn FROM (
      {%- if not custom %}
      SELECT {% call H() %}toInt32(ifNull(dashboard_id, 0)){% endcall %} AS did, {% call H() %}toInt64(dateDiff('day', toDate(dt), toDate((SELECT md FROM maxd)))){% endcall %} AS ck,
        {% call H() %}toUInt64(ifNull(users{{ '_nown' if excv == '1' else '' }}, 0)){% endcall %} AS cu, {% call H() %}toUInt64(ifNull(views{{ '_nown' if excv == '1' else '' }}, 0)){% endcall %} AS cv
      FROM prod_proteus.pa_dash_day
      WHERE dashboard_id IN (SELECT did FROM pvt)
        AND toDate(dt) >= tupleElement((SELECT h FROM pvd), 3) AND toDate(dt) <= toDate((SELECT md FROM maxd))
        {#- день, когда заходили только владельцы, при «без владельцев» — не день календаря (как в факте: строк нет) -#}
        AND ifNull(users{{ '_nown' if excv == '1' else '' }}, 0) > 0
      {%- else %}
      SELECT {% call H() %}toInt32(ifNull(e.dashboard_id, 0)){% endcall %} AS did, {% call H() %}toInt64(dateDiff('day', toDate(e.log_dttm), toDate((SELECT md FROM maxd)))){% endcall %} AS ck,
        {% call H() %}toUInt64(uniqExact(e.login)){% endcall %} AS cu, toUInt64(sum(e.views)) AS cv
      FROM prod_proteus.pa_evd_day e
      WHERE e.dashboard_id IN (SELECT did FROM pvt)
        AND e.log_dttm >= toDateTime(tupleElement((SELECT h FROM pvd), 3))
        AND e.log_dttm < toDateTime((SELECT md FROM maxd)) + toIntervalDay(1)
        AND {{ PVPAIR }}
      GROUP BY did, ck
      {%- endif %}
      )
      UNION ALL
      {# новые дня: дни первого визита пар (в окне и не раньше 90 дней истории, как cf панели) — счётом по дню и сложением с днём
          календаря (раньше countEqual по списку всех новых на каждый день — квадратично: 8 кварталов, 4,5 с на блок) #}
      SELECT did, toInt64(fdd) AS ck, toUInt64(0) AS cu, toUInt64(0) AS cv, toUInt64(count()) AS cn
      FROM (SELECT did, fdd, {% call H() %}tupleElement((SELECT h FROM pvd), 2){% endcall %} AS ktd, {% call H() %}tupleElement((SELECT h FROM pvd), 4){% endcall %} AS cd FROM evd WHERE did IN (SELECT did FROM pvt))
      WHERE fdd < cd AND fdd <= ktd
      GROUP BY did, ck
    )
    GROUP BY did, ck
    {# только дни календаря (с зрителями) — как раньше #}
    HAVING su > 0)
    GROUP BY did)
  ){% endif %}{% endif %}
SELECT CAST(section AS String) AS section, CAST(g AS String) AS g, CAST(k AS String) AS k, CAST(parent AS String) AS parent, CAST(n AS Int64) AS n
FROM (
  {# Строки agg — упаковкой: отчёты порциями по 1000 (по id), группы — строкой на разрез, ИТОГО — отдельно. Строки в k — arraySort:
     порядок groupArray у ClickHouse не задан, без сортировки один и тот же ответ отличался бы от прогона к прогону (09.10). #}
  SELECT s_sec AS section, s_g AS g, {% call H() %}arrayStringConcat(arraySort(groupArray(s_line)), '\n'){% endcall %} AS k, '{{ grain }}' AS parent, toInt64(count()) AS n
  FROM (
    SELECT {% call H() %}CAST(CASE WHEN kd = 0 THEN 'total' WHEN kd = 1 THEN 'rep' ELSE 'grp' END AS String){% endcall %} AS s_sec,
      {% call H() %}multiIf(kd = 1, toString(intDiv(ifNull(toInt32OrNull(k0), toInt32(0)), 1000)), kd = 2, 'owner', kd = 3, 'collection', ''){% endcall %} AS s_g,
      {% call H() %}multiIf(
        kd = 1, concat(k0, '|', toString(users), '|', toString(views), '|', toString(regular_users), '|', toString(last_view_days), '|', rhythm, '|',
          {% if WITH_CA %}toString({% if custom %}(SELECT count() FROM ({{ caset() }})){% if excv == '1' %} - ifNull(oc.n_own, 0){% endif %}{% else %}ifNull(c.ca_n, 0){% endif %}), '|',
          toString({% if custom %}toUInt8(0){% else %}ifNull(c.ca_wide, 0){% endif %}), '|', toString(ca_u){% else %}'||'{% endif %}, '|',
          {{ cz("toString(ifNull(m.dashboard_nm, ''))") }}, '|', arrayStringConcat(arrayMap(o -> {{ fx('o') }}, {{ owns('m.') }}), '^'), '|',
          arrayStringConcat(arrayMap(cc -> {{ cz('cc') }}, arrayFilter(cc -> cc != '', arrayMap(cc -> toString(ifNull(cc, '')), m.collection_names))), '^'), '|',
          toString(ifNull(m.published, 0)), '|', {{ cz("toString(ifNull(m.certified_by, ''))") }}, '|', if(isNull(m.created_dt), '', toString(toDate(m.created_dt))), '|',
          {#- автор (owner_login) — для показа первым под названием; метрики «Владельцев» — по owners (поле 10) -#}
          {{ fx("lower(trim(toString(ifNull(m.owner_login, ''))))") }}),
        kd = 0, concat(toString(users), '|', toString(views), '|', toString(regular_users), '|', toString(last_view_days)),
        concat({{ cz('k0') }}, '|', toString(users), '|', toString(views), '|', toString(regular_users), '|', toString(last_view_days))){% endcall %} AS s_line
    FROM agg
    LEFT JOIN prod_proteus.pa_dash_meta m ON m.dashboard_id = if(kd = 1, ifNull(toInt32OrNull(k0), toInt32(0)), toInt32(0))
    {%- if WITH_CA %}
    LEFT JOIN prod_proteus.pa_dash_ca c ON c.dashboard_id = if(kd = 1, ifNull(toInt32OrNull(k0), toInt32(0)), toInt32(0))
    {%- if custom and excv == '1' %}
    {#- ЦА по условиям без владельцев отчёта (как панель при «Без владельцев»): их визиты — свои. #}
    LEFT JOIN (SELECT dashboard_id, toInt64(count()) AS n_own FROM (SELECT dashboard_id, {% call H() %}lower(toString(arrayJoin(owners_string))){% endcall %} AS ow FROM prod_proteus.pa_dash_meta)
      WHERE ow IN ({{ caset() }}) GROUP BY dashboard_id) oc ON oc.dashboard_id = if(kd = 1, ifNull(toInt32OrNull(k0), toInt32(0)), toInt32(0)){% endif %}{% endif %}
  )
  GROUP BY s_sec, s_g

  UNION ALL
  {# Состояние запроса: эхо фильтров (сверка выбора в чартах), опции, людская шина, режим ЦА. #}
  SELECT 'sj' AS section, '' AS g, '{{ "{" ~ SJ|join(", ") ~ "}" }}' AS k, '{{ grain }}' AS parent, toInt64(0) AS n

  UNION ALL
  {# Аудитория: строка на разрез. #}
  SELECT 'aud' AS section, ad AS g,
    {% call H() %}arrayStringConcat(arraySort(groupArray(concat({{ cz('ak0') }}, '|', {{ cz('ap') }}, '|', toString(users), '|', toString(views), '|', toString(regular), '|', toString(staff)))), '\n'){% endcall %} AS k,
    '' AS parent, toInt64(count()) AS n
  FROM ak
  {%- if DEF %}
  WHERE ad != 'all'
  {%- endif %}
  GROUP BY ad

  UNION ALL
  {# Текущий пользователь борда актуальным логином: k — логин (пусто — неизвестен). #}
  SELECT 'me' AS section, '' AS g,
    ifNull(nullIf((SELECT any(toString(lm.canon)) FROM prod_proteus.pa_login_map lm
      WHERE lm.login = lower(trim('{{ cache_key_wrapper(current_username())|string|replace('\\', '\\\\')|replace("'", "''") }}'))), ''),
      {% call H() %}lower(trim('{{ cache_key_wrapper(current_username())|string|replace('\\', '\\\\')|replace("'", "''") }}')){% endcall %}) AS k,
    '' AS parent, toInt64(0) AS n

  UNION ALL
  {# Все зрители периода (и не сотрудники: увол., служебные) — ИТОГО вкладки «Аудитория» = «Польз.» ИТОГО каталога.
     Строка разреза «*||людей|просмотров|постоянных|0». #}
  {%- if DEF %}
  SELECT 'aud' AS section, 'all' AS g, {% call H() %}concat('*||', toString(users), '|', toString(views), '|', toString(regular), '|0'){% endcall %} AS k, '' AS parent, toInt64(users) AS n
  FROM ak WHERE ad = 'all'
  {%- else %}
  SELECT 'aud' AS section, 'all' AS g, {% call H() %}concat('*||', toString(count()), '|', toString(sum(vv)), '|',
    toString(countIf({{ mnb('vm') }} >= {{ REG }})), '|0'){% endcall %} AS k, '' AS parent, toInt64(count()) AS n
  FROM vz
  {%- endif %}
  {% if PVON %}
  UNION ALL
  {# Мгновенная панель: строка на отчёт топа (формат — в шапке блока PV_N). #}
  SELECT 'pv' AS section, toString(a.did) AS g,
    {% call H() %}concat(toString(a.u), '|', toString(a.up), '|', toString(a.v), '|', toString(a.vp), '|', toString(a.nu), '|', toString(a.np), '|0|',
      toString(a.rg), '|', toString(a.rgp), '|', toString(a.sl), '|', toString(a.m1), '|', toString(a.m2), '|0|0|0|0|',
      toString(a.f1), '|', toString(a.f2), '|', toString(a.f3), '|', toString(a.f4), '\n',
      arrayStringConcat(arrayMap(x -> if(x = 0, '', toString(x)), a.tu), ','), '\n', arrayStringConcat(arrayMap(x -> if(x = 0, '', toString(x)), a.tn), ','), '\n',
      arrayStringConcat(arrayMap(x -> if(x = 0, '', toString(x)), a.tr), ','), '\n', arrayStringConcat(arrayMap(x -> if(x = 0, '', toString(x)), b.tv), ','){% if grain == 'd' %}, '\n',
      arrayStringConcat(arrayMap(x -> if(x = 0, '', toString(x)), a.cu), ','), '\n', arrayStringConcat(arrayMap(x -> if(x = 0, '', toString(x)), a.cn), ','){% elif PV_CAL %}, '\n',
      toString(ifNull(c.cal, '')){% endif %}){% endcall %} AS k,
    '' AS parent, toInt64(a.u) AS n
  FROM pva a
  LEFT JOIN pvb b ON b.did = a.did{% if PV_CAL %}
  LEFT JOIN pvc c ON c.did = a.did{% endif %}
  UNION ALL
  SELECT 'pvh' AS section, '{{ grain }}' AS g, {% if grain != 'd' %}{% call H() %}toString(tupleElement((SELECT h FROM pvd), 3)){% endcall %}{% else %}''{% endif %} AS k, '' AS parent, {% call H() %}toInt64(greatest(tupleElement((SELECT h FROM pvd), 1) + 1, 0)){% endcall %} AS n
  {% endif %}
)
