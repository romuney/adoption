"""Каталог PA NEXT: строки ИТОГО / владельцев / коллекций и строки отчётов — одним проходом по парам.

Зачем. На кластере CHaaS промежуточный набор пар (CTE evd) подставляется заново на каждую ссылку, и при «Своих
датах» каждая подстановка заново читает и агрегирует подневной факт (журнал 26.11: каталог 19,7 c, 4 чтения факта,
до 6 c на шард). Строки «по группам» (kx) и строки отчётов были двумя отдельными свёртками evd — два чтения.

Как. kx получает ещё один ключ — (1, отчёт) — и несёт колонки, нужные строкам отчётов (маски ритма pd / pw / pm,
признак ЦА acc). Ветка строк отчётов в agg уходит: строки отчётов — это группы kx с kd = 1. Строка «все» вкладки «Аудитория»
(была отдельной свёрткой evd в vz) — группа kx с kd = 9 и выдаётся тем же итоговым запросом, что строки каталога;
vz остаётся только для разрезов «Аудитории». Итого evd читается два раза вместо четырёх.

Почему ответ тот же. Пара «отчёт × логин» в pa_pair уникальна, поэтому в группе (1, отчёт, логин) ровно одна пара:
OR масок, сумма, максимум и OR / максимум добавленных колонок возвращают значения этой пары, а HAVING по маске
группы — тот же фильтр частоты, что был WHERE по маске пары. Мета отчёта (pa_dash_meta) — одна строка на отчёт, а
evd берёт только отчёты из dash_ok (подмножество меты), так что INNER JOIN с метой строки отчётов не теряет и не
размножает. Доказательство — регресс по матрице фильтров (verify_cluster.py), а не этот комментарий.
"""

KX_KEYS_OLD = """          arrayMap(c -> (toUInt8(3), toString(ifNull(c, ''))), arrayFilter(c -> isNotNull(c) AND c != '', mm.collection_names))
        )){% endcall %} AS kk, kk.1 AS kd, kk.2 AS k0,
        p.login AS login, p.msk AS m0, p.v_cur AS v_cur, p.dmax AS dmax
      FROM evd p"""

KX_KEYS_NEW = """          arrayMap(c -> (toUInt8(3), toString(ifNull(c, ''))), arrayFilter(c -> isNotNull(c) AND c != '', mm.collection_names)),
          array((toUInt8(1), toString(p.did))),
          array((toUInt8(9), ''))
        )){% endcall %} AS kk, kk.1 AS kd, kk.2 AS k0,
        if(kk.1 = 9, lower(p.login), p.login) AS login, p.msk AS m0, p.v_cur AS v_cur, p.dmax AS dmax, p.pd AS pd0, p.pw AS pw0, p.pm AS pm0
        {%- if WITH_CA %},
        {% if custom %}toUInt8(1){% else %}toUInt8((p.did, lower(p.login)) IN (SELECT arrayJoin((SELECT groupArray(__x) FROM (SELECT tuple({% call H() %}toInt32(ifNull(dashboard_id, 0)){% endcall %}, {% call H() %}toString(ifNull(login, '')){% endcall %}) AS __x FROM prod_proteus.pa_next_pair_acc))))){% endif %} AS acc0
        {%- endif %}
      FROM evd p"""

KX_AGG_OLD = """      {{ mor('m0') }} AS msk, sum(v_cur) AS v_cur, max(dmax) AS dmax
    FROM ("""

KX_AGG_NEW = """      {{ mor('m0') }} AS msk, sum(v_cur) AS v_cur, max(dmax) AS dmax,
      groupBitOr(pd0) AS pd, groupBitOr(pw0) AS pw, groupBitOr(pm0) AS pm{% if WITH_CA %}, max(acc0) AS acc{% endif %}
    FROM ("""

KX_HAVING_OLD = """    GROUP BY kd, k0, login
    {%- if FB %}
    HAVING {{ FB|join(' OR ')|replace('nb', mnb(mor('m0'))|string) }}
    {%- endif %}
  ),"""

KX_HAVING_NEW = """    GROUP BY kd, k0, login
    {# kd = 9 — все зрители периода (строка «все» вкладки «Аудитория», бывший vz): логин в нижнем регистре, только
       заходившие в текущем периоде, та же корзина частоты. #}
    HAVING {% if FB %}({{ FB|join(' OR ')|replace('nb', mnb(mor('m0'))|string) }}) AND {% endif %}(kd != 9 OR {{ mcur(mor('m0')|string) }})
  ),"""

OUT_OLD = [
    ("""  SELECT s_sec AS section, s_g AS g, {% call H() %}arrayStringConcat(arraySort(groupArray(s_line)), '\\n'){% endcall %} AS k, '{{ grain }}' AS parent, toInt64(count()) AS n""",
     """  SELECT s_sec AS section, s_g AS g, {% call H() %}if(s_sec = 'aud', argMax(s_line, s_n), arrayStringConcat(arraySort(groupArray(s_line)), '\\n')){% endcall %} AS k, {% call H() %}if(s_sec = 'aud', '', '{{ grain }}'){% endcall %} AS parent, toInt64(sum(s_n)) AS n"""),
    # строка «все» вкладки «Аудитория» при пустом наборе зрителей: прежняя свёртка vz без GROUP BY давала её всегда
    # (нули); группа kd = 9 при пустом наборе не появляется — запасная строка с нулями, настоящая (s_n ≥ 1) её перебивает
    ("""\n  )\n  GROUP BY s_sec, s_g""",
     """\n    {%- if not DEF %}\n    UNION ALL\n    SELECT 'aud' AS s_sec, 'all' AS s_g, toInt64(0) AS s_n, '*||0|0|0|0' AS s_line\n    {%- endif %}\n  )\n  GROUP BY s_sec, s_g"""),
    ("""    SELECT {% call H() %}CAST(CASE WHEN kd = 0 THEN 'total' WHEN kd = 1 THEN 'rep' ELSE 'grp' END AS String){% endcall %} AS s_sec,
      {% call H() %}multiIf(kd = 1, toString(intDiv(ifNull(toInt32OrNull(k0), toInt32(0)), 1000)), kd = 2, 'owner', kd = 3, 'collection', ''){% endcall %} AS s_g,""",
     """    SELECT {% call H() %}CAST(CASE WHEN kd = 0 THEN 'total' WHEN kd = 1 THEN 'rep' WHEN kd = 9 THEN 'aud' ELSE 'grp' END AS String){% endcall %} AS s_sec,
      {% call H() %}multiIf(kd = 1, toString(intDiv(ifNull(toInt32OrNull(k0), toInt32(0)), 1000)), kd = 2, 'owner', kd = 3, 'collection', kd = 9, 'all', ''){% endcall %} AS s_g,
      {% call H() %}if(kd = 9, toInt64(users), toInt64(1)){% endcall %} AS s_n,"""),
    ("""        kd = 0, concat(toString(users), '|', toString(views), '|', toString(regular_users), '|', toString(last_view_days)),""",
     """        kd = 9, concat('*||', toString(users), '|', toString(views), '|', toString(regular_users), '|0'),
        kd = 0, concat(toString(users), '|', toString(views), '|', toString(regular_users), '|', toString(last_view_days)),"""),
    ("""  UNION ALL
  {# Все зрители периода (и не сотрудники: увол., служебные) — ИТОГО вкладки «Аудитория» = «Польз.» ИТОГО каталог""",
     """  {%- if DEF %}
  UNION ALL
  {%- endif %}
  {# Все зрители периода (и не сотрудники: увол., служебные) — ИТОГО вкладки «Аудитория» = «Польз.» ИТОГО каталог"""),
    ("""  FROM ak WHERE ad = 'all'
  {%- else %}
  SELECT 'aud' AS section, 'all' AS g, {% call H() %}concat('*||', toString(count()), '|', toString(sum(vv)), '|',
    toString(countIf({{ mnb('vm') }} >= {{ REG }})), '|0'){% endcall %} AS k, '' AS parent, toInt64(count()) AS n
  FROM vz
  {%- endif %}""",
     """  FROM ak WHERE ad = 'all'
  {%- endif %}"""),
]

AGG_START = """    {%- else %}
    SELECT kd, k0, {{ mets() }}, '' AS rhythm{% if WITH_CA %}, toUInt64(0) AS ca_u{% endif %}
    FROM kx GROUP BY kd, k0
    UNION ALL"""

AGG_END = """      FROM evd
      {%- if FB %}
      WHERE {{ FB|join(' OR ')|replace('nb', mnb('msk')|string) }}
      {%- endif %}
    )
    GROUP BY did
    {%- endif %}"""

AGG_NEW = """    {%- else %}
    {#- Один проход (catalog_pass.py): строки ИТОГО / владельцев / коллекций и строки отчётов (kd = 1) — группы kx.
        Ритм и «Охват ЦА» — только у строк отчётов, как было. -#}
    SELECT kd, k0, {{ mets() }},
      {% call H() %}if(kd = 1, arrayStringConcat(array(toString(countIf({{ RC }} = 4)), toString(countIf({{ RC }} = 3)), toString(countIf({{ RC }} = 2)), toString(countIf({{ RC }} = 1))), ','), ''){% endcall %} AS rhythm
      {%- if WITH_CA %}, {% call H() %}if(kd = 1, countIf({{ mcur('msk') }} AND acc = 1), toUInt64(0)){% endcall %} AS ca_u{% endif %}
    FROM kx GROUP BY kd, k0
    {%- endif %}"""


def single_pass(text):
    for old, new in [(KX_KEYS_OLD, KX_KEYS_NEW), (KX_AGG_OLD, KX_AGG_NEW), (KX_HAVING_OLD, KX_HAVING_NEW)] + OUT_OLD:
        if text.count(old) != 1:
            raise ValueError('catalog_pass: фрагмент kx не найден ровно один раз — пересмотреть')
        text = text.replace(old, new)
    i = text.index(AGG_START)
    j = text.index(AGG_END, i) + len(AGG_END)
    if text.count(AGG_START) != 1 or text.count(AGG_END) != 1:
        raise ValueError('catalog_pass: ветка строк отчётов не найдена ровно один раз — пересмотреть')
    return text[:i] + AGG_NEW + text[j:]
