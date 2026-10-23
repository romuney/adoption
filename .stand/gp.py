"""Мост стенда: ClickHouse (chdb) ↔ PostgreSQL (играет Greenplum) для GP-параграфов файла 1 поставки единого листа.

Базовые витрины pa_* стенд строит в chdb (stand.py); новые GP-параграфы исполняются в PostgreSQL ДОСЛОВНО из файла 1
поставки — так проверяется ровно тот SQL, что вставит владелец (подмножество GP6 ≈ PG 9.4: без FILTER, LATERAL,
GROUPING SETS). Результат заливается обратно в chdb так же, как его выгрузит gp_to_click: колонки Nullable, массивы
(array_type_cast=True) — Array(String), ORDER BY — из файла 2 поставки.

    python3 .stand/gp.py                    # все параграфы ЧАСТИ 3 файла 1 (новые витрины оптимизации)
    python3 .stand/gp.py pa_md pa_dict      # только эти витрины (и всё, что им нужно из chdb)
Нужен PostgreSQL (база pa, роль текущего пользователя): createuser -s root; createdb pa.
"""
import os, re, sys, subprocess, tempfile, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stand

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, 'Единый лист — актуальные файлы')
F1 = [f for f in os.listdir(DIR) if f.startswith('1. GP')][0]
F2 = [f for f in os.listdir(DIR) if f.startswith('2. Python')][0]
PGDB = os.environ.get('PA_PG', 'pa')
TMP = tempfile.mkdtemp(prefix='pa_gp_')


def psql(sql, quiet=True):
    p = subprocess.run(['psql', '-d', PGDB, '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-tA', '-f', '-'],
                       input=sql, capture_output=True, text=True)
    if p.returncode:
        raise RuntimeError('PostgreSQL: ' + p.stderr.strip()[:3000])
    return p.stdout


# ---- типы ----
def pg_type(ch):
    ch = re.sub(r'^Nullable\((.*)\)$', r'\1', ch)
    if ch.startswith('Array('): return 'text[]'
    if re.match(r'U?Int(8|16|32|64)$', ch): return 'bigint'
    if ch.startswith('Float'): return 'double precision'
    if ch.startswith('DateTime'): return 'timestamp'
    if ch == 'Date': return 'date'
    return 'text'


def ch_type(pg):
    return {'bigint': 'Int64', 'integer': 'Int32', 'smallint': 'Int16', 'boolean': 'UInt8', 'text': 'String',
            'character varying': 'String', 'timestamp without time zone': 'DateTime', 'date': 'Date',
            'double precision': 'Float64', 'numeric': 'Float64', 'ARRAY': 'Array(String)'}[pg]


def ch_cols(t):
    d = json.loads(stand.S.query(f"SELECT name, type FROM system.columns WHERE database = 'prod_proteus' AND table = '{t}' ORDER BY position", 'JSON').bytes())['data']
    return [(r['name'], r['type']) for r in d]


# ---- chdb → PostgreSQL ----
def ch_to_pg(t):
    cols = ch_cols(t)
    if not cols:
        raise RuntimeError('в chdb нет prod_proteus.' + t)
    sel = []
    for n, ty in cols:
        if 'Array(' in ty:
            sel.append(f"concat('{{', arrayStringConcat(arrayMap(x -> concat('\"', replaceAll(replaceAll(toString(ifNull(x, '')), '\\\\', '\\\\\\\\'), '\"', '\\\\\"'), '\"'), {n}), ','), '}}') AS {n}")
        else:
            sel.append(n)
    f = os.path.join(TMP, t + '.csv')
    open(f, 'wb').write(stand.S.query(f"SELECT {', '.join(sel)} FROM prod_proteus.{t}", 'CSVWithNames').bytes())
    ddl = ', '.join(f'{n} {pg_type(ty)}' for n, ty in cols)
    psql(f"CREATE SCHEMA IF NOT EXISTS usr_cross_data; DROP TABLE IF EXISTS usr_cross_data.{t} CASCADE;"
         f" CREATE TABLE usr_cross_data.{t} ({ddl});\n\\copy usr_cross_data.{t} FROM '{f}' WITH (FORMAT csv, HEADER true, NULL '\\N')\nANALYZE usr_cross_data.{t};")


# ---- файл 2: как gp_to_click выгружает витрину ----
def exports():
    src = open(os.path.join(DIR, F2), encoding='utf-8').read()
    out = {}
    for m in re.finditer(r"gp_to_click\('usr_cross_data\.(\w+)',\s*'prod_proteus\.(\w+)'(.*?)\)\n", src, re.S):
        o = re.search(r"order_by_columns='([^']*)'", m.group(3))
        out[m.group(1)] = {'order': o.group(1) if o else 'tuple()', 'arr': 'array_type_cast=True' in m.group(3)}
    return out


# ---- PostgreSQL → chdb (как gp_to_click: Nullable, массивы — Array(String)) ----
def pg_to_ch(t, ex):
    cols = [l.split('|') for l in psql(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'usr_cross_data' "
                                       f"AND table_name = '{t}' ORDER BY ordinal_position").split('\n') if l]
    if not cols:
        raise RuntimeError('в PostgreSQL нет usr_cross_data.' + t)
    if any(ty == 'ARRAY' for _, ty in cols) and not ex['arr']:
        raise RuntimeError(f'{t}: в таблице массив, а в файле 2 у выгрузки нет array_type_cast=True')
    f = os.path.join(TMP, t + '.out.csv')
    sel = ', '.join(f"array_to_json({n})::text AS {n}" if ty == 'ARRAY' else
                    (f"to_char({n}, 'YYYY-MM-DD HH24:MI:SS') AS {n}" if ty.startswith('timestamp') else n) for n, ty in cols)
    psql(f"\\copy (SELECT {sel} FROM usr_cross_data.{t}) TO '{f}' WITH (FORMAT csv, HEADER true, NULL '\\N')")
    ty = [(n, ch_type(p)) for n, p in cols]
    keys = set(re.findall(r'\w+', ex['order']))
    # массивы — с Nullable-элементами (строже, чем может прийти с боя: у owners_string датасеты уже делают ifNull по элементу)
    ddl = ', '.join(f'{n} Array(Nullable(String))' if c.startswith('Array') else f'{n} Nullable({c})' for n, c in ty)
    sch = ', '.join(f'{n} String' if c.startswith('Array') else f'{n} Nullable({c})' for n, c in ty)
    conv = ', '.join(f"JSONExtract(ifNull({n}, '[]'), 'Array(Nullable(String))')" if c.startswith('Array') else n for n, c in ty)
    S = stand.S
    S.query(f'DROP TABLE IF EXISTS prod_proteus.{t}')
    S.query(f"CREATE TABLE prod_proteus.{t} ({ddl}) ENGINE = MergeTree ORDER BY {ex['order']} SETTINGS allow_nullable_key = 1")
    S.query(f"INSERT INTO prod_proteus.{t} SELECT {conv} FROM file('{f}', 'CSVWithNames', '{sch}') SETTINGS format_csv_null_representation = '\\\\N', input_format_csv_empty_as_default = 0")
    return int(str(S.query(f'SELECT count() FROM prod_proteus.{t}', 'CSV')).strip())


# ---- файл 1: параграфы ----
def paragraphs(part='ЧАСТЬ 3'):
    """{витрина: SQL параграфа} — блоки «Параграф «…» → usr_cross_data.X» части part файла 1, в порядке файла."""
    src = open(os.path.join(DIR, F1), encoding='utf-8').read()
    i = src.find('-- ' + part + '.')
    if i < 0:
        return {}
    j = src.find('\n-- ЧАСТЬ ', i + 5)    # до заголовка следующей части (или до конца файла)
    body = src[i:] if j < 0 else src[i:j]
    out = {}
    for m in re.finditer(r'-- Параграф «[^»]*» → usr_cross_data\.(\w+).*?\n(.*?)(?=\n-- -{20,}\n-- Параграф|\Z)', body, re.S):
        out[m.group(1)] = m.group(2)
    return out


def pg_text(sql):
    """Текст параграфа для PostgreSQL: «distributed by (…) / randomly» — синтаксис Greenplum, в PG его нет."""
    return 'SET client_min_messages = warning;\n' + re.sub(r'\n\s*distributed\s+(by\s*\([^)]*\)|randomly)\s*;', ';', sql, flags=re.I)


def reads(sql):
    return set(re.findall(r'usr_cross_data\.(\w+)', sql))


def run(only=None):
    par = paragraphs()
    names = [n for n in par if not only or n in only]
    made = set(par)
    need = set()
    for n in names:
        need |= reads(par[n]) - made
    for t in sorted(need):
        ch_to_pg(t)
    ex = exports()
    res = {}
    for n in names:
        psql(pg_text(par[n]))
        if n in ex:
            res[n] = pg_to_ch(n, ex[n])
        else:   # служебная GP-таблица (в файле 2 её нет — в ClickHouse не выгружается)
            res[n] = 'только GP: ' + psql(f'SELECT count(*) FROM usr_cross_data.{n}').strip()
    return res


if __name__ == '__main__':
    for n, c in run(sys.argv[1:] or None).items():
        print(f'{n}: {c} строк')
