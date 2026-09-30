"""Регресс датасета панели ЕДИНОГО листа (pa_one) на стенде.

    python3 .stand/check_one.py <папка единого листа>      # берёт файлы «… pa_one …», «… pa_people …» не нужен:
    python3 .stand/check_one.py                              # по умолчанию — Виджеты/*.data.sql

1. Без условий ЦА — всё про зрителей == pa_people (секции total/freq/ctx/ts/cal/coh построчно; список —
   по людям: активных периодов, просмотры, последний визит, корзина, новый, MAU, уволен).
2. ЦА == pa_aud_v2 (без владельцев выкл. — у них разное правило владельцев): размер ЦА, с доступом, дошли,
   не заходили, вне ЦА, в этом году, дошли в пред. периоде — по правам и по условиям.
3. По условиям ЦА: итог панели == ИТОГО каталога с той же ЦА (каталог уже считает только людей ЦА).
4. Старый анализатор CH и prefer_column_name_to_alias = 1 дают те же строки.
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stand

W = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'Виджеты')
D = sys.argv[1] if len(sys.argv) > 1 else None
pick = lambda key, dflt: (os.path.join(D, [x for x in os.listdir(D) if key in x and x.endswith('.sql') and 'SQL Lab' not in x][0]) if D else dflt)
ONE = pick('pa_one', os.path.join(W, 'pa-one.data.sql'))
CAT = pick('pa_body', os.path.join(W, 'pa-reports-body.data.sql'))
PPL = os.path.join(W, 'pa-area.data.sql')
AUD = os.path.join(W, 'pa-audience.data.sql')
bad = 0


def ok(cond, msg):
    global bad
    print(('OK   ' if cond else 'FAIL ') + msg)
    bad += 0 if cond else 1


def run(p, c, **kw):
    if kw.get('with_ca') and '{% set WITH_CA = false %}' in open(p).read():
        tmp = os.path.join(os.path.dirname(os.path.abspath(__file__)), '__pycache__', '_cat_ca.sql')
        os.makedirs(os.path.dirname(tmp), exist_ok=True)
        open(tmp, 'w').write(open(p).read().replace('{% set WITH_CA = false %}', '{% set WITH_CA = true %}'))
        p = tmp
    return stand.stat(stand.render(p, c))[0]


FB = {'d': [1, 5, 15], 'w': [1, 5, 15], 'm': [1, 3, 6], 'q': [1, 2, 3]}
NG = {'d': 30, 'w': 20, 'm': 12, 'q': 8}


def dict_of(rows):
    d = {}
    for r in rows:
        if r['section'] == 'd':
            d.setdefault(r['g'], {})[r['k']] = r['parent']
    return d


def one_people(rows, grain):
    """Распаковка списка pa_one — как в чарте."""
    dz, area = dict_of(rows), [r for r in rows if r['section'] == 'area'][0]
    kt = int(area['days']) - 1
    out = {}
    for r in rows:
        if r['section'] != 'list':
            continue
        for ln in r['k'].split('\n'):
            f = ln.split('|')
            cur, fk, fl = int(f[5]), int(f[7]), int(f[10])
            days = bin(cur).count('1')
            fb = FB[grain]
            b = 1 if days <= fb[0] else 2 if days <= fb[1] else 3 if days <= fb[2] else 4
            out[f[0]] = dict(login=f[0], fio=f[1], spec=dz['spec'][f[2]], stream=dz['stream'][f[3]], exp=dz['exp'][f[4]],
                             head=fl & 1, days=days, views=int(f[8]), last=int(f[9]), bin=b,
                             new=int(fk < NG[grain] and fk <= kt), mau=(fl >> 1) & 1, maup=(fl >> 2) & 1, yr=(fl >> 3) & 1,
                             stf=(fl >> 4) & 1, acc=(fl >> 5) & 1, ca=(fl >> 6) & 1, prev=int(f[6]), cur=cur,
                             hq=dz['hq'][f[11]], it=dz['it'][f[12]], org=r['parent'])
    return out


def ppl_people(rows):
    out = {}
    md = [r for r in rows if r['section'] == 'area'][0]['lvl3']
    import datetime
    mdd = datetime.date.fromisoformat(md)
    for r in rows:
        if r['section'] != 'list':
            continue
        for ln in r['k'].split('\n'):
            f = ln.split('\t')
            last = (mdd - datetime.date.fromisoformat(f[8])).days if f[8] else -1
            out[f[0]] = dict(login=f[0], fio=f[1], spec=f[2], stream=f[3], exp=f[4], head=int(f[5] or 0), days=int(f[6]),
                             views=int(f[7]), last=last, bin=int(f[9]), new=int(f[10]), mau=int(f[11]), maup=int(f[12]),
                             stf=1 - int(f[13]), org=r['parent'])
    return out


# ---- 1. Без ЦА: pa_one == pa_people --------------------------------------------------------------------
SEC = ('total', 'freq', 'ctx', 'ts', 'cal', 'coh', 'area')
COLS = ('users', 'users_prev', 'views', 'views_prev', 'new_u', 'new_prev', 'react_u', 'regular', 'regular_prev',
        'sleeping', 'mau', 'mau_prev', 'cnt', 'ages', 'acts', 'days', 'last_dt', 'lvl3')
key = lambda r: (r['section'], r['g'], r['k'], r['parent'])
for c in [{}, {'period_param': 'w'}, {'period_param': 'm'}, {'period_param': 'q'},
          {'mode_param': 'report', 'sel_f': ['1', '2', '5']}, {'mode_param': 'owner', 'sel_f': ['own3']},
          {'pub_f': '0', 'act_f': '0', 'exc_f': '0', 'period_param': 'w'}]:
    g = c.get('period_param', 'd')
    a, b = run(ONE, c), run(PPL, c)
    A = {key(r): tuple(str(r[x]) for x in COLS) for r in a if r['section'] in SEC}
    B = {key(r): tuple(str(r[x]) for x in COLS) for r in b if r['section'] in SEC}
    diff = [k for k in A.keys() | B.keys() if A.get(k) != B.get(k)]
    ok(not diff, f'pa_one без ЦА == pa_people (секции) {c}' + (f'  расхождений {len(diff)}: {sorted(diff)[:2]}' if diff else ''))
    pa, pb = one_people(a, g), ppl_people(b)
    F = ('fio', 'spec', 'stream', 'exp', 'head', 'days', 'views', 'last', 'bin', 'new', 'mau', 'maup', 'stf', 'org')
    dp = [l for l in pa.keys() | pb.keys() if l not in pa or l not in pb or any(pa[l][x] != pb[l][x] for x in F)]
    ok(not dp and pa, f'список людей pa_one == pa_people ({len(pa)} чел.) {c}' + (f'  расхождений {len(dp)}: {dp[:2]}' if dp else ''))

# ---- 2. ЦА == pa_aud_v2 ---------------------------------------------------------------------------------
def aud_tot(rows, grain):
    """Итоги ЦА панели второго листа — как caState() в pa-audience.chart.js."""
    dz = {}
    for r in rows:
        if r['section'] == 'd':
            dz.setdefault(r['g'], {})[r['k']] = r['parent']
    t = dict(ca=0, acc=0, reach=0, out=0, yr=0, prev=0, regprev=0)
    fb = FB[grain]
    for r in rows:
        if r['section'] == 'v':
            for ln in r['k'].split('\n'):
                f = ln.split('\t')
                ca, acc, cur, prev = f[16] == '1', f[2] == '1', int(f[4]), int(f[5])
                if ca:
                    t['ca'] += 1; t['acc'] += acc; t['yr'] += f[7] == '1'
                    t['reach'] += cur != 0
                    if prev:
                        t['prev'] += 1
                        t['regprev'] += bin(prev).count('1') > fb[1]
                elif cur:
                    t['out'] += 1
        elif r['section'] == 'h':
            for ln in r['k'].split('\n'):
                f = ln.split('\t')
                t['ca'] += int(f[7]); t['acc'] += int(f[8])
    return t


def one_tot(rows, grain):
    ppl = one_people(rows, grain)
    tot = [r for r in rows if r['section'] == 'total'][0]
    t = dict(ca=0, acc=0, reach=0, out=int(tot['ca_out']), yr=int(tot['ca_yr']), prev=int(tot['ca_prev']), regprev=int(tot['ca_regprev']))
    for p in ppl.values():
        if p['ca']:
            t['ca'] += 1; t['acc'] += p['acc']; t['reach'] += 1
    for r in rows:
        if r['section'] == 'h':
            for ln in r['k'].split('\n'):
                f = ln.split('|')
                t['ca'] += int(f[7]); t['acc'] += int(f[8])
    return t


for c in [{'exc_f': '0'}, {'exc_f': '0', 'period_param': 'm'}, {'exc_f': '0', 'mode_param': 'report', 'sel_f': ['5', '9']},
          {'exc_f': '0', 'ca_spec_f': ['Спец 3'], 'ca_head_f': '1'}, {'exc_f': '0', 'ca_hq_f': ['HQ'], 'ca_it_f': ['IT']},
          {'exc_f': '0', 'ca_org_f': ['Блок 3'], 'mode_param': 'collection', 'sel_f': ['Колл 5']},
          {'exc_f': '0', 'ca_adg_f': ['ADG7']}]:
    g = c.get('period_param', 'd')
    A, B = one_tot(run(ONE, c), g), aud_tot(run(AUD, c), g)
    ok(A == B, f'ЦА pa_one == pa_aud_v2 {c}' + ('' if A == B else f'\n       one {A}\n       aud {B}'))

# ---- 3. По условиям ЦА: итог панели == ИТОГО каталога с той же ЦА ---------------------------------------------
for c in [{'ca_spec_f': ['Спец 3']}, {'ca_hq_f': ['HQ'], 'ca_it_f': ['IT'], 'ca_head_f': '1'}, {'ca_org_f': ['Блок 3'], 'period_param': 'w'}]:
    one = [r for r in run(ONE, c) if r['section'] == 'total'][0]
    cat = [r for r in run(CAT, c, with_ca=True) if r['section'] == 'total'][0]
    ok((one['users'], one['views'], one['regular']) == (cat['users'], cat['views'], cat['regular_users']),
       f'по условиям ЦА: панель == ИТОГО каталога {c}  ({one["users"]} / {cat["users"]})')

# ---- 4. Старый анализатор и prefer_column_name_to_alias -------------------------------------------------------
for c in [{}, {'ca_spec_f': ['Спец 3'], 'ca_head_f': '1'}]:
    sql = stand.render(ONE, c)
    a = stand.stat(sql)[0]
    b = stand.stat(sql + '\nSETTINGS enable_analyzer = 0')[0]
    d = stand.stat(sql + '\nSETTINGS prefer_column_name_to_alias = 1')[0]
    norm = lambda rows: sorted(json.dumps(r, sort_keys=True, default=str) for r in rows)
    ok(norm(a) == norm(b) == norm(d), f'старый анализатор и prefer_column_name_to_alias — те же строки {c}')

print('\nИТОГ: ' + ('всё сходится' if not bad else f'{bad} расхождений'))
sys.exit(1 if bad else 0)
