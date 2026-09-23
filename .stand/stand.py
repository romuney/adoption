"""Стенд SQL на встроенном ClickHouse (chdb, `pip install chdb jinja2`).

Синтетические prod_proteus.pa_evd_day / pa_emp_attrs / pa_dash_meta / pa_pair
той же схемы, что в бою; рендер jinja-шаблонов датасетов с моком
filter_values и where_in как в Superset; исполнение с числом прочитанных строк.

    python3 .stand/stand.py            # создать/пересоздать малую базу (~0,7 млн строк)
    PA_DB=/tmp/pa_big python3 .stand/stand.py big   # ~13 млн строк, для замеров

ClickHouse здесь новее боевого 24-го: синтаксис 25+ стенд примет, бой — нет.
Держаться приёмов из CONTEXT.md §9. Стенд не заменяет прогон в SQL Lab.
"""
import os, sys, json, time
import chdb.session as cs
import jinja2

DB = os.environ.get('PA_DB') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '.db')
S = cs.Session(DB)
FACT_N = None


def where_in(values, mark="'"):
    def q(v):
        return mark + v.replace("'", "''") + mark if isinstance(v, str) else str(v)
    return '(' + ', '.join(q(v) for v in values) + ')'


def render(path, flt=None):
    """Рендер jinja-шаблона датасета: flt = {колонка: значение | [значения]}."""
    flt = flt or {}
    env = jinja2.Environment(extensions=['jinja2.ext.do'])
    env.filters['where_in'] = where_in

    def filter_values(col, default=None, remove_filter=False):
        v = flt.get(col)
        if v is None:
            return [] if default is None else [default]
        return list(v) if isinstance(v, (list, tuple)) else [v]
    return env.from_string(open(path).read()).render(filter_values=filter_values)


def stat(sql):
    """-> (строки, секунды, прочитано строк, прочитано/размер факта ≈ число сканов)."""
    global FACT_N
    if FACT_N is None:
        FACT_N = int(str(S.query('SELECT count() FROM prod_proteus.pa_evd_day', 'CSV')).strip())
    d = json.loads(S.query(sql, 'JSON').bytes())
    st = d.get('statistics', {})
    return d['data'], st.get('elapsed'), st.get('rows_read'), round(st.get('rows_read', 0) / FACT_N, 2)


def _pair():
    """Эмуляция GP-параграфа «PA · пары отчёт×логин» (сверена с GP-SQL в PostgreSQL байт в байт)."""
    S.query('DROP TABLE IF EXISTS prod_proteus.pa_pair')
    G = {'d': (30, 'day', 'toStartOfDay'), 'w': (20, 'week', 'toMonday'),
         'm': (12, 'month', 'toStartOfMonth'), 'q': (8, 'quarter', 'toStartOfQuarter')}
    cols = []
    for g, (n, u, sf) in G.items():
        k = f"toInt64(dateDiff('{u}', {sf}(e.log_dttm), {sf}(mdx)))"
        cols += [f"toInt64(groupBitOr(if({k} < {2*n}, bitShiftLeft(toUInt64(1), toUInt8({k})), toUInt64(0)))) AS msk_{g}",
                 f"sumIf(e.views, {k} < {n}) AS v_{g}", f"sumIf(e.views, {k} >= {n} AND {k} < {2*n}) AS vp_{g}",
                 f"max({k}) AS kmax_{g}"]
    S.query(f"""CREATE TABLE prod_proteus.pa_pair ENGINE=MergeTree ORDER BY (dashboard_id, login) AS
      WITH (SELECT max(log_dttm) FROM prod_proteus.pa_evd_day) AS mdx
      SELECT e.dashboard_id AS dashboard_id, e.login AS login, {', '.join(cols)},
        sum(e.views) AS v_life, max(e.log_dttm) AS dmax, min(e.log_dttm) AS dmin,
        toInt64(groupBitOr(bitShiftLeft(toUInt64(1), toUInt8(least(dateDiff('month', toStartOfMonth(e.log_dttm), toStartOfMonth(mdx)), 62))))) AS msk_mon,
        toUInt8(has(any(m.owners_string), e.login)) AS own_flg, any(mdx) AS md
      FROM prod_proteus.pa_evd_day e LEFT JOIN prod_proteus.pa_dash_meta m ON m.dashboard_id = e.dashboard_id
      GROUP BY e.dashboard_id, e.login""")


def gen(big=False):
    n_dash, n_login = (16000, 47000) if big else (3000, 6400)
    S.query('CREATE DATABASE IF NOT EXISTS prod_proteus')
    for t in ['pa_evd_day', 'pa_emp_attrs', 'pa_dash_meta', 'pa_pair']:
        S.query(f'DROP TABLE IF EXISTS prod_proteus.{t}')
    S.query("""CREATE TABLE prod_proteus.pa_dash_meta (dashboard_id Int32, dashboard_nm String, owner_login String,
      owners_string Array(String), collection_names Array(String), published Int32, actual_flg Int32,
      certified_by Nullable(String), created_dt DateTime) ENGINE=MergeTree ORDER BY dashboard_id""")
    S.query(f"""INSERT INTO prod_proteus.pa_dash_meta SELECT toInt32(number+1), concat('Отчёт ', toString(number+1)),
      concat('own', toString(number % 400)),
      arrayDistinct([concat('own', toString(number % 400)), concat('own', toString((number*7) % 400))]),
      arrayFilter(x -> x != '', [if(number % 3 = 0, '', concat('Колл ', toString(number % 60))), if(number % 5 = 0, concat('Род ', toString(number % 8)), '')]),
      toInt32(number % 10 != 0), toInt32(number % 13 != 0), if(number % 17 = 0, 'cert', NULL),
      toDateTime('2024-01-01') + toIntervalDay(number % 600) FROM numbers({n_dash})""")
    S.query("""CREATE TABLE prod_proteus.pa_emp_attrs (login String, lvl3_management_unit_nm String, lvl4_management_unit_nm String,
      lvl5_management_unit_nm String, lvl6_management_unit_nm String, lvl7_management_unit_nm String,
      emp_specialization_desc String, emp_stream_desc String, management_head_flg Int32, ad_groups Array(String),
      fio String, exp_nm String) ENGINE=MergeTree ORDER BY login""")
    S.query(f"""INSERT INTO prod_proteus.pa_emp_attrs SELECT concat('u', toString(number)),
      if(number % 50 = 0, '', concat('Блок ', toString(number % 12))), if(number % 40 = 0 OR number % 50 = 0, '', concat('Деп ', toString(number % 12), '.', toString(number % 5))),
      -- УС-5…7: иерархия (имя узла несёт путь родителя), пустой уровень обрывает цепочку ниже
      if(number % 40 = 0 OR number % 50 = 0 OR number % 9 = 0, '', concat('Упр ', toString(number % 12), '.', toString(number % 5), '.', toString(number % 3))),
      if(number % 40 = 0 OR number % 50 = 0 OR number % 9 = 0 OR number % 4 = 0, '', concat('Отдел ', toString(number % 7))),
      if(number % 40 = 0 OR number % 50 = 0 OR number % 9 = 0 OR number % 4 = 0 OR number % 6 = 0, '', concat('Команда ', toString(number % 2))),
      concat('Спец ', toString(number % 20)), concat('Стрим ', toString(number % 9)), toInt32(number % 11 = 0),
      arrayFilter(x -> x != '', [concat('ADG', toString(number % 30)), if(number % 4 = 0, 'ALL', '')]),
      concat('Фамилия ', toString(number)), ['до 1 года', '1–3 года', '3–5 лет'][1 + number % 3]
      FROM numbers({int(n_login*0.95)})""")
    S.query("""CREATE TABLE prod_proteus.pa_evd_day (dashboard_id Int32, login String, log_dttm DateTime, views Int64)
      ENGINE=MergeTree PARTITION BY toYYYYMM(log_dttm) ORDER BY (dashboard_id, login, log_dttm)""")
    # пары «отчёт×логин» с перекосом популярности, у пары — серия дней визитов
    S.query(f"""INSERT INTO prod_proteus.pa_evd_day
      SELECT did, lg, dt, sum(v) FROM (
        SELECT p.did AS did, p.lg AS lg,
          toDateTime(toDate('2026-09-21') - toIntervalDay(least(394, p.start + floor(pow((cityHash64(p.did, p.lg, i) % 1000000)/1000000.0, 2) * 200)))) AS dt,
          toInt64(1 + cityHash64(i, p.lg) % 4) AS v
        FROM (SELECT toInt32(1 + floor(pow(rand(1)/4294967295.0, 3) * {n_dash})) AS did,
            if(rand(5) % 97 = 0, concat('own', toString(rand(6) % 400)), concat('u', toString(floor(pow(rand(2)/4294967295.0, 1.5) * {n_login})))) AS lg,
            toUInt32(floor(pow(rand(3)/4294967295.0, 1.3) * 395)) AS start,
            1 + floor(pow(rand(4)/4294967295.0, 3) * 40) AS nd
          FROM numbers({1600000 if big else 150000})) p ARRAY JOIN range(toUInt64(nd)) AS i
      ) GROUP BY did, lg, dt""")
    _pair()
    print(S.query('SELECT count(), uniqExact(login), uniqExact(dashboard_id) FROM prod_proteus.pa_evd_day', 'CSV'))


if __name__ == '__main__':
    gen(big='big' in sys.argv[1:])
