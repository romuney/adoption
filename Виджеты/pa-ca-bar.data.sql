{#- pa_ca_dict — строка «Целевая аудитория» листа «Аудитория» (чарт «Аудитория: настройка ЦА»).
    Справочник для выпадашек условий ЦА: все действующие сотрудники с AD-логином (pa_staff), свёрнутые по
    значениям условий И набору AD-групп прав — так браузер считает ЦА точно и с условием «AD-группы».
    Фильтров не читает (от области и периода не зависит) — ответ одинаковый для всех, кэшируется.
    Значения условий — ровно те, с которыми сравнивают датасеты pa_aud_v2 и pa_body_aud (ca_*_f):
    путь оргструктуры тем же ou() и « › », специализация/стрим/HQ/IT — как есть.
      section = 's' — сотрудники, упаковка по пути оргструктуры (parent = путь «УС-3 › …»; k — строки через \n,
                      поля через \t): id спец. · id стрима · рук. 1/0 · id HQ · id IT · человек · номера AD-групп
                      через запятую (номер — parent строки 'adg'; люди с одинаковыми атрибутами и группами — одна строка);
      section = 'd' — словарь: g = spec | stream | hq | it, k = id, parent = значение;
      section = 'adg' — AD-группы прав Proteus: k = группа, parent = номер группы, n = сотрудников в группе (pa_adg_size);
      section = 'total' — n = сотрудников. -#}
{% macro ou(col) %}if(match(toString(ifNull({{ col }}, '')), '^[\\s\\p{P}]*$'), '', toString(ifNull({{ col }}, ''))){% endmacro %}
{% macro hid(x) %}lower(hex(toUInt32(cityHash64({{ x }}) % 4294967296))){% endmacro %}
WITH
  st AS (
    SELECT toString(login) AS lg, [{{ ou('lvl3_management_unit_nm') }}, {{ ou('lvl4_management_unit_nm') }}, {{ ou('lvl5_management_unit_nm') }},
        {{ ou('lvl6_management_unit_nm') }}, {{ ou('lvl7_management_unit_nm') }}] AS lv,
      if(arrayFirstIndex(x -> x = '', lv) = 0, toUInt32(length(lv)), toUInt32(arrayFirstIndex(x -> x = '', lv) - 1)) AS ol,
      arrayStringConcat(arraySlice(lv, 1, ol), ' › ') AS opath,
      toString(ifNull(emp_specialization_desc, '')) AS spec, toString(ifNull(emp_stream_desc, '')) AS stream,
      toUInt8(ifNull(management_head_flg, 0) = 1) AS hd, toString(ifNull(hq_code, '')) AS hq, toString(ifNull(it_code, '')) AS it
    FROM prod_proteus.pa_staff
  ),
  gix AS (
    {#- номер группы — порядковый по имени (тот же в строках 'adg' и в наборах групп людей) -#}
    SELECT toString(ad_group) AS agn, toUInt32(row_number() OVER (ORDER BY toString(ad_group))) AS gi
    FROM prod_proteus.pa_adg_size WHERE ifNull(n, 0) > 0
  ),
  mb AS (
    SELECT toString(m.login) AS ml, arrayStringConcat(arrayMap(y -> toString(y), arraySort(groupUniqArray(x.gi))), ',') AS gs
    FROM prod_proteus.pa_adg_member m INNER JOIN gix x ON x.agn = toString(m.ad_group)
    GROUP BY ml
  ),
  gg AS (
    SELECT opath, {{ hid('spec') }} AS sid, {{ hid('stream') }} AS tid, hd, {{ hid('hq') }} AS qid, {{ hid('it') }} AS iid,
      ifNull(b.gs, '') AS gset, count() AS c
    FROM st LEFT JOIN mb b ON b.ml = st.lg
    GROUP BY opath, sid, tid, hd, qid, iid, gset
  )
SELECT CAST('s' AS String) AS section, CAST('' AS String) AS g,
  arrayStringConcat(arraySort(groupArray(arrayStringConcat([sid, tid, toString(hd), qid, iid, toString(c), gset], '\t'))), '\n') AS k,
  CAST(opath AS String) AS parent, toInt64(sum(c)) AS n
FROM gg GROUP BY opath
UNION ALL
SELECT 'd', dg, {{ hid('dv') }}, dv, toInt64(0)
FROM (SELECT DISTINCT arrayJoin([('spec', spec), ('stream', stream), ('hq', hq), ('it', it)]) AS dd, dd.1 AS dg, dd.2 AS dv FROM st)
UNION ALL
SELECT 'adg', '', toString(s.ad_group), toString(x.gi), toInt64(s.n) FROM prod_proteus.pa_adg_size s INNER JOIN gix x ON x.agn = toString(s.ad_group)
UNION ALL
SELECT 'total', '', '', '', toInt64(count()) FROM prod_proteus.pa_staff
