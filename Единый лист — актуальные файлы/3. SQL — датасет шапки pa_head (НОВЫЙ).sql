{# Proteus Adoption — единый лист · поставка 22.10 · 2026-10-22 · pa-head.data.sql 9588b849223e · СОБРАН АВТОМАТИЧЕСКИ: не правьте здесь — исходник Виджеты/pa-head.data.sql, сборка — python3 .stand/pack.py #}
{%- set PA_H = namespace(d=0) -%}{%- macro H() -%}{%- if PA_NOHIDE is defined -%}{{ caller() }}{%- else -%}{%- set PA_H.d = PA_H.d + 1 -%}{%- set x = caller() -%}{%- set PA_H.d = PA_H.d - 1 -%}{%- if PA_H.d > 0 -%}{{ x }}{%- elif '[' in x or ']' in x -%}{{ caller() }}{%- else -%}{%- if PA_MARK is defined -%}{{ PA_MARK[0] }}{%- endif -%}[{{ x }}][1]{%- if PA_MARK is defined -%}{{ PA_MARK[1] }}{%- endif -%}{%- endif -%}{%- endif -%}{%- endmacro -%}{#- H — сборка .stand/hidesql.py: «[выражение][1]» Superset разбирает одним словом (быстрее в разы), ClickHouse читает как само выражение. Исходник — без H, в Виджеты/. -#}{#- pa_head — ШАПКА единого листа (2026-09-30): период и «Считать» + строка «Целевая аудитория» одним чартом.
    Фильтров НЕ читает (ни каталога, ни панели) — ответ одинаковый для всех, считается один раз при открытии и кэшируется.
    Секции — как у pa_ca_dict (s / d / adg / total — справочник для выпадашек условий ЦА) плюс
      section = 'md' — k = дата свежести данных (последний день витрины, YYYY-MM-DD): «данные на ДД.ММ» в шапке;
                       parent = начало истории событий (с 2026-10-21: нижняя граница календаря «Свой период»).
    Прежние pa_strip (эхо фильтров для пилюль шапки) и pa_ca_dict — не нужны: пилюли «Выбранные фильтры»
    рисует каталог, дата — здесь. -#}
{#- (справочник строки ЦА, как pa_ca_dict) pa_ca_dict — строка «Целевая аудитория» листа «Аудитория» (чарт «Аудитория: настройка ЦА»).
    Справочник для выпадашек условий ЦА: все действующие сотрудники с AD-логином (pa_staff), свёрнутые по
    значениям условий И набору AD-групп прав — так браузер считает ЦА точно и с условием «AD-группы».
    Фильтров не читает (от области и периода не зависит) — ответ одинаковый для всех, кэшируется.
    Значения условий — ровно те, с которыми сравнивают датасеты pa_aud_v2 и pa_body_aud (ca_*_f):
    путь оргструктуры тем же ou() и « › », специализация/стрим/HQ/IT — как есть.
      section = 's' — сотрудники, упаковка по пути оргструктуры (parent = путь «УС-3 › …»; k — строки через \n,
                      поля через \t): id спец. · id стрима · рук. 1/0 · id HQ · id IT · людей
                      (с 2026-09-30 без номеров AD-групп: люди с одинаковыми атрибутами — одна строка);
      section = 'd' — словарь: g = spec | stream | hq | it, k = id, parent = значение;
      section = 'adg' — AD-группы прав Proteus: k = группа (только имя: численности и составов нет — пересечение считает сервер после «Применить»);
      section = 'total' — n = сотрудников. -#}
{% macro ou(col) %}{% call H() %}if(match(toString(ifNull({{ col }}, '')), '^(?:\\s|\\p{P})*$'), '', toString(ifNull({{ col }}, ''))){% endcall %}{% endmacro %}
{% macro hid(x) %}{% call H() %}lower(hex(toUInt32(cityHash64({{ x }}) % 4294967296))){% endcall %}{% endmacro %}
WITH
  st AS (
    SELECT toString(login) AS lg, {% call H() %}array({{ ou('lvl3_management_unit_nm') }}, {{ ou('lvl4_management_unit_nm') }}, {{ ou('lvl5_management_unit_nm') }},
        {{ ou('lvl6_management_unit_nm') }}, {{ ou('lvl7_management_unit_nm') }}){% endcall %} AS lv,
      {% call H() %}if(arrayFirstIndex(x -> x = '', lv) = 0, toUInt32(length(lv)), toUInt32(arrayFirstIndex(x -> x = '', lv) - 1)){% endcall %} AS ol,
      {% call H() %}arrayStringConcat(arraySlice(lv, 1, ol), ' › '){% endcall %} AS opath,
      {% call H() %}toString(ifNull(emp_specialization_desc, '')){% endcall %} AS spec, {% call H() %}toString(ifNull(emp_stream_desc, '')){% endcall %} AS stream,
      {% call H() %}toUInt8(ifNull(management_head_flg, 0) = 1){% endcall %} AS hd, {% call H() %}toString(ifNull(hq_code, '')){% endcall %} AS hq, {% call H() %}toString(ifNull(it_code, '')){% endcall %} AS it
    FROM prod_proteus.pa_staff
  ),
  gg AS (
    {#- 2026-09-30: наборов AD-групп у людей больше нет (на бою 1,8 млн членств → ответ 7,9 МБ); пересечение групп
        с условиями считает сервер после «Применить» -#}
    SELECT opath, {{ hid('spec') }} AS sid, {{ hid('stream') }} AS tid, hd, {{ hid('hq') }} AS qid, {{ hid('it') }} AS iid, count() AS c
    FROM st
    GROUP BY opath, sid, tid, hd, qid, iid
  )
SELECT CAST('s' AS String) AS section, CAST('' AS String) AS g,
  {% call H() %}arrayStringConcat(arraySort(groupArray(arrayStringConcat(array(sid, tid, toString(hd), qid, iid, toString(c)), '\t'))), '\n'){% endcall %} AS k,
  CAST(opath AS String) AS parent, toInt64(sum(c)) AS n
FROM gg GROUP BY opath
UNION ALL
SELECT 'd' AS section, dg AS g, {{ hid('dv') }} AS k, dv AS parent, toInt64(0) AS n
FROM (SELECT DISTINCT {% call H() %}arrayJoin(array(('spec', spec), ('stream', stream), ('hq', hq), ('it', it))){% endcall %} AS dd, dd.1 AS dg, dd.2 AS dv FROM st)
UNION ALL
{# AD-группы — только имена для выбора (без численности: владелец 2026-09-30); пустые/«-» — выкинуты #}
{# алиас таблицы обязателен: «AS n» ниже иначе подменяет колонку n в WHERE (все группы отсеивались) #}
SELECT 'adg' AS section, '' AS g, toString(z.ad_group) AS k, '' AS parent, toInt64(0) AS n FROM prod_proteus.pa_adg_size z
WHERE ifNull(z.n, 0) > 0 AND NOT match(toString(ifNull(z.ad_group, '')), '^(?:\\s|\\p{P})*$')
UNION ALL
SELECT 'total' AS section, '' AS g, '' AS k, '' AS parent, toInt64(count()) AS n FROM prod_proteus.pa_staff
UNION ALL
{# Дата свежести: одна строка pa_pair (md одинаков у всех пар), а не скан таблицы. #}
SELECT 'md' AS section, '' AS g, ifNull(toString(toDate((SELECT md FROM prod_proteus.pa_pair WHERE isNotNull(md) LIMIT 1))), '') AS k,
  {#- начало истории событий — нижняя граница календаря «Свой период» (2026-10-21) -#}
  ifNull(toString(toDate((SELECT min(dmin) FROM prod_proteus.pa_pair))), '') AS parent, toInt64(0) AS n
