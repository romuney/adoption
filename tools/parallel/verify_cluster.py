#!/usr/bin/env python3
"""Регресс PA NEXT для кластерного ClickHouse 25.8 (CHaaS: 6 шардов, Distributed, distributed_product_mode='global').

Доказывает две вещи на синтетике стенда:
  1. новый SQL (папка поставки) на модели кластера НЕ падает — в т. ч. «Invalid local IN function name globalIn»;
  2. его ответ строка в строку равен ответу эталона (SQL из Git-ревизии) на плоских таблицах — логика не изменилась.

Модель кластера: 6 шардов на localhost (chdb, config remote_servers), строки каждой pa_next_* случайно разложены по
шардам (как на бою: _shard_num почти поровну), шард читает свою часть через view «__s = shardNum() - 1».
Сетевых задержек модель не воспроизводит — скорость меряется на бою (файлы SQL Lab 22–26).

Нужен chdb ≥ 3.6 (ClickHouse 25.8) и стенд, собранный prepare_numeric_fixture.py (PA_DB). Три шага, три процесса
(один процесс — одна база chdb):

  PA_DB=<стенд> python3 verify_cluster.py render --rev <git-ревизия эталона> --out cases.json
  python3 verify_cluster.py build <копия стенда>          # копию! стенд превращается в модель кластера
  python3 verify_cluster.py run <копия стенда> cases.json
"""
import argparse, json, os, subprocess, sys, tempfile, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DIR = ROOT / 'Параллельный отчёт — pa_next'
NAMES = {'head': '3. SQL — шапка.sql', 'cat': '5. SQL — каталог.sql', 'one': '7. SQL — панель.sql'}
SET = 'allow_experimental_analyzer=1, prefer_column_name_to_alias=1, join_use_nulls=0, group_by_use_nulls=0, max_threads=4, max_execution_time=120'
SHARDS = 6


def config():
    sh = ''.join('<shard><replica><host>%s</host><port>9000</port></replica></shard>' % ('localhost' if i % 2 else '127.0.0.1') for i in range(SHARDS))
    p = Path(tempfile.gettempdir()) / 'pa_next_cluster6.xml'
    p.write_text('<clickhouse><tcp_port>9000</tcp_port><remote_servers><six>' + sh + '</six></remote_servers></clickhouse>')
    return p


def canon(rows):
    out = []
    for r in rows:
        r = list(r)
        if r and r[0] == 'pa_next_version':
            r[2] = ''                       # номер загрузки модели и эталона законно разный; parent/n сравниваются
        if len(r) > 2 and isinstance(r[2], str) and '\n' in r[2]:
            r[2] = '\n'.join(sorted(r[2].split('\n')))
        out.append(json.dumps(r, ensure_ascii=False, default=str))
    return sorted(out)


def render(rev, out):
    sys.path.insert(0, str(ROOT / 'tools/parallel')); sys.path.insert(0, str(ROOT / '.stand'))
    from verify_numbers import load_stand
    load_stand()
    import same, hidesql
    ids = same.top_ids()
    cases = []
    for kind, name in NAMES.items():
        base = subprocess.check_output(['git', '-C', str(ROOT), 'show', f'{rev}:{DIR.name}/{name}'], text=True)
        cand = (DIR / name).read_text()
        matrix = same.matrix(kind)
        if kind != 'head':
            matrix += [('люди: логины', {'ca_login_f': ['u131', 'own3']}), ('люди: master', {'ca_master_f': ['1001', '1002']}),
                       ('люди+условие', {'ca_login_f': ['u131'], 'ca_it_f': ['IT']}),
                       ('один отчёт', {'mode_param': 'report', 'sel_f': [ids[0]]}),
                       ('два отчёта+ЦА', {'mode_param': 'report', 'sel_f': [ids[0], ids[1]], 'ca_spec_f': ["O'Brien", 'Спец 0']})]
        for label, f in matrix:
            cases.append(dict(kind=kind, label=label, filters=f,
                              base=hidesql.render(base, dict(f)), cand=hidesql.render(cand, dict(f))))
    Path(out).write_text(json.dumps(cases, ensure_ascii=False))
    print('rendered', len(cases), 'cases')


def build(db):
    import chdb
    cur = chdb.connect(f'{db}?config-file={config()}').cursor()
    def q(s):
        cur.execute(s); return cur.fetchall()
    tabs = [r[0] for r in q("SELECT name FROM system.tables WHERE database='prod_proteus' AND startsWith(name,'pa_next_') AND engine != 'Distributed'")]
    q('CREATE DATABASE IF NOT EXISTS prod_local'); q('CREATE DATABASE IF NOT EXISTS prod_flat')
    for t in tabs:
        cols = [r[0] for r in q(f"SELECT name FROM system.columns WHERE database='prod_proteus' AND table='{t}' ORDER BY position")]
        q(f'RENAME TABLE prod_proteus.{t} TO prod_flat.{t}')
        q(f'CREATE TABLE prod_local.{t}_all ENGINE = MergeTree ORDER BY __s AS SELECT *, toUInt8(rand() % {SHARDS}) AS __s FROM prod_flat.{t}')
        q(f"CREATE VIEW prod_local.{t} AS SELECT {', '.join('`' + c + '`' for c in cols)} FROM prod_local.{t}_all WHERE __s = shardNum() - 1")
        q(f"CREATE TABLE prod_proteus.{t} AS prod_flat.{t} ENGINE = Distributed('six', 'prod_local', '{t}')")
    print('distributed:', len(tabs), 'tables over', SHARDS, 'shards')


def run(db, inp, out):
    import chdb
    cur = chdb.connect(f'{db}?config-file={config()}').cursor()
    def ex(sql):
        t = time.time()
        try:
            cur.execute(sql); return canon(cur.fetchall()), time.time() - t
        except Exception as e:
            return 'ERR ' + str(e).split('\n')[0][:200], time.time() - t
    cases = json.loads(Path(inp).read_text())
    stat, bad, tb, tc = {}, [], 0.0, 0.0
    for c in cases:
        st = stat.setdefault(c['kind'], dict(ok=0, base_err_cluster=0, cand_err_cluster=0, diff=0, base_err_flat=0))
        flat, _ = ex(c['base'].replace('prod_proteus.pa_next_', 'prod_flat.pa_next_') + f'\nSETTINGS {SET}')
        b, t1 = ex(c['base'] + f"\nSETTINGS {SET}, distributed_product_mode='global'")
        n, t2 = ex(c['cand'] + f"\nSETTINGS {SET}, distributed_product_mode='global'")
        tb += t1; tc += t2
        if isinstance(b, str): st['base_err_cluster'] += 1
        if isinstance(flat, str):
            st['base_err_flat'] += 1; bad.append((c, 'эталон на плоских: ' + flat))
        elif isinstance(n, str):
            st['cand_err_cluster'] += 1; bad.append((c, 'кластер: ' + n))
        elif n != flat:
            st['diff'] += 1; bad.append((c, f'ОТВЕТ ИЗМЕНИЛСЯ: строк {len(flat)} → {len(n)}'))
        else:
            st['ok'] += 1
    res = dict(stat=stat, failures=[dict(kind=c['kind'], label=c['label'], filters=c['filters'], error=e) for c, e in bad],
               cluster_seconds=dict(baseline=round(tb, 1), candidate=round(tc, 1)))
    Path(out).write_text(json.dumps(res, ensure_ascii=False, indent=1))
    print(json.dumps(stat, ensure_ascii=False))
    print('время на модели кластера, сумма по сценариям: эталон %.1f c, новый %.1f c (эталон местами падает)' % (tb, tc))
    for f in res['failures'][:20]:
        print(' ', f['kind'], f['label'], json.dumps(f['filters'], ensure_ascii=False)[:80], f['error'][:150])
    print('PASS' if not bad else f'FAIL: {len(bad)}')
    return not bad


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest='cmd', required=True)
    r = sp.add_parser('render'); r.add_argument('--rev', required=True); r.add_argument('--out', required=True)
    b = sp.add_parser('build'); b.add_argument('db')
    u = sp.add_parser('run'); u.add_argument('db'); u.add_argument('cases'); u.add_argument('--out', default=str(Path(tempfile.gettempdir()) / 'pa-next-cluster-results.json'))
    a = ap.parse_args()
    if a.cmd == 'render':
        assert os.environ.get('PA_DB'), 'PA_DB — стенд prepare_numeric_fixture.py'
        render(a.rev, a.out)
    elif a.cmd == 'build':
        build(a.db)
    else:
        sys.exit(0 if run(a.db, a.cases, a.out) else 1)
