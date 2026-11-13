{#- ============================================================================
    <ОТЧЁТ> — виртуальный датасет <имя> (Proteus: Superset 2.0.1 + ClickHouse 24.8).
    Шаблон playbook: templates/dataset.template.sql. Скопируй в proteus/<x>.data.sql, замени всё, что помечено xx_
    и <…>, правь шапку вместе с ответом (DS-26): по ней пишутся чарт, FIELDS.md и регресс.

    ПРОВЕРЕНО (09.10) на стенде-заглушке: chdb 2.1.1 = ClickHouse 24.8.4.1, 3 000 строк факта, всё Nullable, NULL в
    массиве, значения с «'», «]», «--», «//», «;», «\» в конце; логины a.user, b.kotov, hr.super, o'neil, nobody.
      kit/superset201.py --run --matrix --hostile --hostile-set full в моделях лексера 0.3.0 + патч 2.0.1
        и М2 (0.4.4 + патч 2.1.3); М1 — модель боя 0.4.3 + патч 2.1.0 — путь с --hostile-set full без --run (09.10): 0 ошибок — сохранение (AlwaysTrue + LIMIT 1000), открытие, 15 враждебных хвостов,
        новый и старый анализатор, все *_use_nulls + prefer_column_name_to_alias; ответ после пути = прямому запуску;
        ключ: main — ЛИЧНЫЙ, shared — ОБЩИЙ; nobody — только meta (ok = 0) и end; WITH_F = false — тоже 0 ошибок.
      kit/sqlgate.py, sqlglot 23.17 / 25.34 / 26.33 / 28.10 / 30.0, sqlparse 0.5.5 / 0.6.0 — 0 ошибок (main, shared,
        WITH_F = false; обычный и худший набор носителей).
      Цена: открытие — 3,9 КБ → 6,7 КБ после reindent, 1 633 токена, reindent 0,19 с, разбор ради ключа 0,24 с;
        худший набор (50 юнитов, 2 × 200 значений) — 27,7 КБ; с враждебными хвостами — до 39,1 КБ и 2 781 токена,
        reindent ≤ 0,26 с, ключ ≤ 0,41 с. Значения с длинным и коротким тире chdb не проверить (ST-21).
    Перепроверяй после каждой правки: checklists/before-delivery.md, раздел «Датасет».

    ВИДЫ (один исходник, DV-04; сборщик kit/pack_template.py меняет ровно одну строку на вариант):
      main    личный: зависит от логина (зона доступа). Роли: meta, f, r, end. Логин — в ключе кэша.
      shared  общий: от пользователя не зависит (значения фильтров на всю компанию, без людей). Роли: meta, D, end.
              Собирается подстановками в COPIES: строка VIEW → 'shared' и строка макроса login_q (единственная с
              вызовом логина) → заглушка, у которой тело — пустой литерал ''. В тексте общего датасета не должно
              остаться ни одного вызова логина, параметра адреса и обёртки ключа кэша — ни в коде, ни в комментариях
              (AC-09): иначе Superset будет рендерить его ради ключа на каждом запросе, а кэш станет личным.

    СТРОКИ ОТВЕТА (5 колонок: role k v n j — все String, n — Int64; новые данные — новой ролью, не колонкой, DS-01):
      meta  всегда 1 строка: k — вид, v — метка запроса rq, n — записей под фильтрами в зоне, j — JSON
            {"ver","rows","build","view","ok","data_dt","rq",…}: эхо того, что датасет ВЗЯЛ после проверок (DS-03);
            rows — число строк всего ответа (окно над всеми ролями): чарт сверяет его с data.length (DS-25);
            ok = 0 — у логина нет строки доступа: ответ — только meta и end (AC-02, DS-08)
      f     main: значения фильтров — k атрибут, v значение, n записей при ОСТАЛЬНЫХ фильтрах (DS-12)
      r     main: первые LIM записей по сортировке, пачками по CHUNK: k — номер пачки (с 0), n — записей в пачке,
            j — строки через перевод строки, поля через табуляцию: id, имя, юнит, атрибуты ATTRS, дата найма
      D     shared: значения фильтров на всю компанию — k атрибут, v значение, n записей
      end   всегда 1 строка — страховка «ответ целиком» (DS-25)
    Порядок строк — ORDER BY по ROLES, но обёртка Superset (GROUP BY по «Измерениям», SP-13) его не держит: чарт
    ищет строки по role и восстанавливает порядок сам. Строки уникальны по всем пяти колонкам — GROUP BY их не склеит.

    НОСИТЕЛИ кросс-фильтра (основа + CF; в SELECT не выводятся, SP-14; значения — строки):
      rq   метка запроса чарта, ≤ 40 знаков, первая                     → эхо meta.rq (MC-06)
      unit id юнитов: буквы и цифры, ≤ 64 знаков, ≤ 50 штук              → запись в поддереве (путь p)
      flt  'атрибут=значение': атрибут из ATTRS, ≤ 200 знаков, ≤ 200 значений у атрибута, ≤ 500 всего
      sort 'ключ:asc|desc', ключ из SORT_KEYS; иначе — 'id:asc'
      lim  число из LIM_ALLOWED; иначе LIM_DEFAULT
    Всё прочее отбрасывается молча (AC-14). Значения — только через макросы qs / qa.
    Значение с переводом строки (\n, \r) — отброс: фильтр replace вокруг SQL и построчный разбор в чарте его исказят.
    Неразрывные и тонкие пробелы не трогать: isprintable() их отбросил бы, и фильтр молча не применился бы.

    ДОСТУП (main): строка таблицы доступа по логину сессии — агрегатом без GROUP BY (одна строка и при пустом входе,
    CH-09); роль super — вся компания, hrbp — поддеревья корней. Вне зоны не уходит ничего: ни строк, ни значений
    фильтров, ни эха юнитов (meta.units_hit — только найденные в зоне). Откат «чужой юнит → своя зона» с пометкой — AC-01.

    КЛИКХАУС 24.8 (CH): без SETTINGS / FORMAT / «;» (CH-04); без алиасов в GROUP BY — номер пачки колонкой подзапроса
    (SP-04); без \x-экранов — разделители char(9) / char(10) (SP-09); ifNull на каждом входе и выходе (CH-14);
    контекст запроса — один скаляр-кортеж ctx0 → проекция ctx (CH-06); списки — константами WITH и x IN dl_… (CH-20);
    вычисляемых WITH-алиасов в подзапросах нет (CH-08).

    БЮДЖЕТ (SP-15…SP-17): отступы снимает фильтр replace вокруг SQL (SP-18), пояснения — только в комментариях
    Jinja (в шапке и в них нельзя писать знак конца комментария: он закроет комментарий раньше). Худший набор
    носителей обязан дать < 256 КиБ после обёртки и reindent и < 10 000 токенов; разбор ради ключа (личный) ≤ 0,5 с.
============================================================================ -#}
{#- ---- варианты (DV-04): сборщик заменяет эти строки целиком, по одной на вариант ---- -#}
{% set VIEW = 'main' %}
{#- BUILD ставит сборщик (kit/pack_template.py, вид dataset): штамп поставки уходит эхом в meta.build (DV-09) -#}
{% set BUILD = '' %}
{#- ---- источники: xx_ — заменить. Массив читать как массив можно, только если выгрузка с array_type_cast=True (GP-20) ---- -#}
{% set T_FACT = 'prod_proteus.xx_fact' %}
{% set T_ACC = 'prod_proteus.xx_access' %}
{#- ---- рубильники (DS-14): дорогая ветка выключается одной строкой; регресс гоняет обе позиции ---- -#}
{% set WITH_F = true %}{#- false — значения фильтров f не считать (тяжело на боевой кардинальности): чарт поймёт по meta.f -#}
{#- ---- носители, пределы, сортировка ---- -#}
{% set CF = '_f' %}{#- суффикс носителей чарта или вкладки (MC-05): '_f', '_kf' … -#}
{% set ATTRS = ['city', 'grade'] %}{#- атрибуты фильтров = имена колонок факта (выход — a_<атрибут>) -#}
{% set SORT_KEYS = {'id': 'id', 'nm': 'nm', 'hire': 'hd', 'city': 'a_city'} %}
{% set LIM_ALLOWED = [1000, 5000, 10000] %}
{% set LIM_DEFAULT = 1000 %}
{% set CHUNK = 500 %}
{% set ROLES = ['meta', 'D', 'f', 'r', 'end'] %}
{% set SHARED = VIEW == 'shared' %}

{#- ---- экранирование (SP-06…SP-08) ----
    qs — строковый литерал: сначала обратный слэш удваивается, потом кавычка УДВАИВАЕТСЯ (''), а не \' — под патчем
    лексера Superset \' строку не продолжает, и строки с кодом меняются местами. Слэши в конце значения — через
    repeat(char(92), N): литерал, кончающийся слэшем, sqlparse ≥ 0.4.4 без патча считает незакрытым. -#}
{% macro qs(v) -%}
{%- set s = v|string -%}{%- set t = s.rstrip('\\') -%}
{%- if t|length < s|length -%}concat('{{ t|replace('\\', '\\\\')|replace("'", "''") }}', repeat(char(92), {{ s|length - t|length }}))
{%- else -%}'{{ s|replace('\\', '\\\\')|replace("'", "''") }}'{%- endif -%}
{%- endmacro %}
{#- qa — массив строк. Литерал […] sqlparse читает одним именем до первой «]» (один токен — дёшево), поэтому со «]»
    в значениях — функцией array(…) (SP-07). Пустой — типизированный. Кортеж для IN не нужен: x IN dl_… по константе-
    массиву WITH так же быстр и после reindent компактнее (CH-20, CH-28). -#}
{% macro qa(values) -%}
{%- if values|length == 0 -%}CAST([], 'Array(String)')
{%- else -%}{%- set br = [] -%}{%- for v in values if ']' in v|string -%}{%- set _ = br.append(1) -%}{%- endfor -%}
{{ 'array(' if br else '[' }}{% for v in values %}{{ qs(v) }}{% if not loop.last %}, {% endif %}{% endfor %}{{ ')' if br else ']' }}
{%- endif -%}
{%- endmacro %}
{#- Логин сессии — ТОЛЬКО здесь: тело макроса — одна строка с вызовом внутри двойных фигурных скобок. Так его видит
    регулярка ключа кэша Superset 2.0–4.0 (ExtraCache.regex), и логин попадает в ключ (AC-07). Не переносить в set и не
    разбивать на строки: ответ одного пользователя уйдёт из кэша другому на 12 ч (три отчёта, 07.10). В виде shared
    сборщик заменяет эту строку заглушкой (см. шапку). -#}
{% macro login_q() -%}{{ qs((current_username() or '')|string|trim|lower) }}{%- endmacro %}

{#- ---- носители: только циклом с пределами — при сохранении датасета filter_values отдаёт AlwaysTrueObject
    (истинный, итерация пустая; «+», |length и индекс по нему падают), и остаются умолчания (SP-05, AC-14) ---- -#}
{% set RQ_L = [] %}{% for v in (filter_values('rq' ~ CF) or []) %}{% set s = v|string %}{% if not RQ_L and s|length <= 40 and '\n' not in s and '\r' not in s %}{% set _ = RQ_L.append(s) %}{% endif %}{% endfor %}
{% set RQ = RQ_L|first if RQ_L else '' %}
{% set UNITS = [] %}{% for v in (filter_values('unit' ~ CF) or []) %}{% set s = v|string|trim %}{% if s and s|length <= 64 and s.isalnum() and UNITS|length < 50 and s not in UNITS %}{% set _ = UNITS.append(s) %}{% endif %}{% endfor %}
{% set F = {} %}{% for a in ATTRS %}{% set _ = F.update({a: []}) %}{% endfor %}{% set FLT_N = [] %}
{% for v in (filter_values('flt' ~ CF) or []) %}{% set s = v|string %}{% if '=' in s and s|length <= 200 and '\n' not in s and '\r' not in s %}{% set a = s.split('=', 1)[0] %}{% set x = s.split('=', 1)[1] %}{% if a in F and x not in F[a] and F[a]|length < 200 and FLT_N|length < 500 %}{% set _ = F[a].append(x) %}{% set _ = FLT_N.append(1) %}{% endif %}{% endif %}{% endfor %}
{% set SORT_L = [] %}{% for v in (filter_values('sort' ~ CF) or []) %}{% set s = v|string %}{% if not SORT_L and ':' in s and s.split(':', 1)[0] in SORT_KEYS and s.split(':', 1)[1] in ['asc', 'desc'] %}{% set _ = SORT_L.append(s) %}{% endif %}{% endfor %}
{% set SORT = SORT_L|first if SORT_L else 'id:asc' %}
{% set SK = SORT.split(':', 1)[0] %}{% set SDIR = 'DESC' if SORT.split(':', 1)[1] == 'desc' else 'ASC' %}
{% set LIM_L = [] %}{% for v in (filter_values('lim' ~ CF) or []) %}{% set s = v|string|trim %}{% if not LIM_L and s.isdigit() and s|int in LIM_ALLOWED %}{% set _ = LIM_L.append(s|int) %}{% endif %}{% endfor %}
{% set LIM = LIM_L|first if LIM_L else LIM_DEFAULT %}
{#- Общий вид фильтров не применяет: его ответ один на всех и от выбора не зависит (DS-10). -#}
{% if SHARED %}{% set UNITS = [] %}{% for a in ATTRS %}{% set _ = F.update({a: []}) %}{% endfor %}{% endif %}

{#- ---- куски SQL ---- -#}
{#- Дата свежести — одной строкой витрины, не max() по всей таблице и не today() (DS-07, CH-30). -#}
{% macro data_dt() -%}ifNull(toString((SELECT data_dt FROM {{ T_FACT }} WHERE isNotNull(data_dt) LIMIT 1)), ''){%- endmacro %}
{#- Источник одной строкой на запись, Nullable снят на входе; контекст — CROSS JOIN ctx (проекция скаляра, CH-05). -#}
{% macro src() -%}
(SELECT ifNull(emp_id, '') AS id, ifNull(emp_nm, '') AS nm, ifNull(unit_id, '') AS unit,
        arrayMap(x -> ifNull(x, ''), path) AS p, {% for a in ATTRS %}ifNull(toString({{ a }}), '-') AS a_{{ a }}, {% endfor %}ifNull(toString(hire_dt), '') AS hd
 FROM {{ T_FACT }}) AS s CROSS JOIN ctx
{%- endmacro %}
{#- Зона доступа: ok и (вся компания или путь записи проходит через корень зоны). -#}
{% macro zone() -%}c_ok = 1 AND (c_all = 1 OR hasAny(p, c_roots)){%- endmacro %}
{#- Условие фильтров, кроме атрибута skip (для чисел «при остальных», DS-12); юниты — всегда. -#}
{% macro cond(skip) -%}
{%- set parts = [] -%}
{%- for a in ATTRS if a != skip and F[a] -%}{%- set _ = parts.append('a_' ~ a ~ ' IN dl_f_' ~ a) -%}{%- endfor -%}
{%- if UNITS -%}{%- set _ = parts.append('arrayExists(x -> x IN dl_units, p)') -%}{%- endif -%}
{{- parts|join(' AND ') if parts else '1' -}}
{%- endmacro %}
{#- Эхо применённого — из тех же констант, что в условиях (текст не дублируется, эхо = условие). -#}
{% macro echo_flt() -%}
map({% for a in ATTRS %}'{{ a }}', {% if F[a] %}dl_f_{{ a }}{% else %}CAST([], 'Array(String)'){% endif %}{% if not loop.last %}, {% endif %}{% endfor %})
{%- endmacro %}

{% filter replace('\n                ', '\n')|replace('\n        ', '\n')|replace('\n    ', '\n')|replace('\n  ', '\n') %}
WITH
  {# списки фильтров — один раз константами (CH-20); без значений — константы нет, условия тоже #}
  {% if not SHARED %}{% for a in ATTRS if F[a] %}{{ qa(F[a]) }} AS dl_f_{{ a }},
  {% endfor %}{% if UNITS %}{{ qa(UNITS) }} AS dl_units,
  {% endif %}{% endif %}
  {% if SHARED %}
  {# общий вид: ни логина, ни таблицы доступа — ключ кэша без рендера, один на всех (AC-09) #}
  ctx0 AS (
    SELECT (CAST([], 'Array(String)'), toUInt8(1), toUInt8(1), {{ data_dt() }}) AS ctxt
  ),
  {% else %}
  {# доступ: агрегат без GROUP BY — ровно одна строка и у логина без доступа (CH-09, AC-02) #}
  acc AS (
    SELECT groupArrayIf(ifNull(root_id, ''), ifNull(role, '') = 'hrbp') AS r_zone,
           toUInt8(countIf(ifNull(role, '') = 'super') > 0) AS a_all,
           count() AS a_n
    FROM {{ T_ACC }}
    WHERE ifNull(login, '') = {{ login_q() }}
  ),
  {# контекст запроса — ОДИН скаляр-кортеж: одинаковый текст ClickHouse считает один раз (CH-06) #}
  ctx0 AS (
    SELECT (roots, all_f, ok_f, dd) AS ctxt
    FROM (
      SELECT arrayDistinct(arrayFilter(x -> x != '', acc.r_zone)) AS roots, acc.a_all AS all_f,
             toUInt8(acc.a_n > 0) AS ok_f, {{ data_dt() }} AS dd
      FROM acc
    )
  ),
  {% endif %}
  ctx AS (
    SELECT c.1 AS c_roots, c.2 AS c_all, c.3 AS c_ok, c.4 AS c_dd
    FROM (SELECT (SELECT ctxt FROM ctx0) AS c)
  )
{# Выход: тип и ifNull — в одном месте; rows — окном уровнем ниже: окно рядом с ORDER BY старый анализатор не
   принимает (Code 47); имена внутренних колонок не совпадают с выходными (CH-11) #}
SELECT role, k, v, n, if(role = 'meta', replaceOne(jj, '"rows":0', concat('"rows":', toString(rows_n))), jj) AS j
FROM (
SELECT ifNull(r0, '') AS role, ifNull(k0, '') AS k, ifNull(v0, '') AS v, toInt64(ifNull(n0, 0)) AS n,
       ifNull(j0, '') AS jj, count() OVER () AS rows_n
FROM (
  {# ---------- meta: эхо и итоги; всегда одна строка (агрегат без GROUP BY) ---------- #}
  SELECT 'meta' AS r0, {{ qs(VIEW) }} AS k0, {{ qs(RQ) }} AS v0, toInt64(m.n_all) AS n0,
         concat('{"ver":"1","rows":0,"build":', toJSONString({{ qs(BUILD) }}), ',"view":', toJSONString({{ qs(VIEW) }}),
                ',"ok":', toString(ctx.c_ok), ',"data_dt":', toJSONString(ctx.c_dd), ',"rq":', toJSONString({{ qs(RQ) }}),
                {% if not SHARED %}',"f":', toString({{ 1 if WITH_F else 0 }}), ',"sort":', toJSONString({{ qs(SORT) }}),
                ',"lim":', toString({{ LIM }}), ',"chunk":', toString({{ CHUNK }}),
                ',"units":', toJSONString({{ 'dl_units' if UNITS else "CAST([], 'Array(String)')" }}),
                ',"units_hit":', toJSONString(m.u_hit), ',"flt":', toJSONString({{ echo_flt() }}),
                {% endif %}'}') AS j0
  FROM ctx CROSS JOIN (
    SELECT countIf({{ cond('') }}) AS n_all,
           {% if UNITS and not SHARED %}arraySort(groupUniqArrayArray(arrayFilter(x -> x IN dl_units, p))){% else %}CAST([], 'Array(String)'){% endif %} AS u_hit
    FROM {{ src() }}
    WHERE {{ zone() }}
  ) AS m
  {% if SHARED %}
  UNION ALL
  {# ---------- D: значения фильтров на всю компанию (общий вид; людей и скрываемых полей нет, AC-10) ---------- #}
  SELECT 'D' AS r0, fk AS k0, fval AS v0, toInt64(count()) AS n0, '' AS j0
  FROM (
    SELECT fv.1 AS fk, fv.2 AS fval
    FROM (
      SELECT arrayJoin([{% for a in ATTRS %}('{{ a }}', a_{{ a }}){% if not loop.last %}, {% endif %}{% endfor %}]) AS fv
      FROM {{ src() }}
      WHERE {{ zone() }}
    )
  )
  GROUP BY fk, fval
  {% else %}
  {% if WITH_F %}
  UNION ALL
  {# ---------- f: значения фильтров зоны, n — при остальных фильтрах; один проход (CH-07) ---------- #}
  SELECT 'f' AS r0, fk AS k0, fval AS v0, toInt64(sum(fok)) AS n0, '' AS j0
  FROM (
    SELECT fv.1 AS fk, fv.2 AS fval, fv.3 AS fok
    FROM (
      SELECT arrayJoin([{% for a in ATTRS %}('{{ a }}', a_{{ a }}, toUInt8({{ cond(a) }})){% if not loop.last %}, {% endif %}{% endfor %}]) AS fv
      FROM {{ src() }}
      WHERE {{ zone() }}
    )
  )
  GROUP BY fk, fval
  {% endif %}
  UNION ALL
  {# ---------- r: сначала отобрать (ORDER BY … LIMIT, тай-брейкер id), потом упаковать — только отобранное (DS-15);
       пачки по CHUNK, номер пачки — колонкой подзапроса, не алиасом в GROUP BY (SP-04, DS-19) ---------- #}
  SELECT 'r' AS r0, toString(ck) AS k0, '' AS v0, toInt64(count()) AS n0,
         arrayStringConcat(arrayMap(t -> t.2, arraySort(t -> t.1, groupArray((rn, line)))), char(10)) AS j0
  FROM (
    SELECT rn, intDiv(rn - 1, {{ CHUNK }}) AS ck, line
    FROM (
      SELECT row_number() OVER (ORDER BY sk {{ SDIR }} NULLS LAST, id) AS rn,
             arrayStringConcat(arrayMap(x -> replaceRegexpAll(x, '[[:cntrl:]]', ' '), [id, nm, unit, {% for a in ATTRS %}a_{{ a }}, {% endfor %}hd]), char(9)) AS line
      FROM (
        SELECT {{ SORT_KEYS[SK] }} AS sk, id, nm, unit, {% for a in ATTRS %}a_{{ a }}, {% endfor %}hd
        FROM {{ src() }}
        WHERE {{ zone() }} AND {{ cond('') }}
        ORDER BY sk {{ SDIR }} NULLS LAST, id
        LIMIT {{ LIM }}
      )
    )
  )
  GROUP BY ck
  {% endif %}
  UNION ALL
  {# ---------- end: маркер «ответ целиком» ---------- #}
  SELECT 'end' AS r0, '' AS k0, '' AS v0, toInt64(0) AS n0, '' AS j0
)
)
ORDER BY indexOf([{% for r in ROLES %}'{{ r }}'{% if not loop.last %}, {% endif %}{% endfor %}], role), k
{% endfilter %}
