"""Регресс датасета панели ЕДИНОГО листа (pa_one) на стенде.

    python3 .stand/check_one.py <папка единого листа>      # берёт файлы «… pa_one …», «… pa_people …» не нужен:
    python3 .stand/check_one.py                              # по умолчанию — Виджеты/*.data.sql
    python3 .stand/check_one.py <папка> --rebuild            # сначала пересобрать <папка>/Проверки (рендеры для SQL Lab)

1. Без условий ЦА — всё про зрителей == pa_people (секции total/freq/ctx/ts/cal/coh построчно; список —
   по людям: активных периодов, просмотры, последний визит, корзина, новый, MAU, увол.).
2. ЦА == pa_aud_v2 (без владельцев выкл. — у них разное правило владельцев): размер ЦА, с доступом, дошли,
   не заходили, вне ЦА, в этом году, дошли в пред. периоде — по правам и по условиям.
3. По условиям ЦА: итог панели == ИТОГО каталога с той же ЦА (каталог уже считает только людей ЦА).
4. Старый анализатор CH и prefer_column_name_to_alias = 1 дают те же строки (панель и каталог).
5. Шапка pa_head: сотрудники/словарь/итог == pa_ca_dict, AD-группы только именами (без составов и численности), md == панели, от фильтров не зависит.
6. Вкладка «Аудитория» каталога: у группы людей заходило / сотрудников == панель с этой группой (aud_*_f) — люди и ЦА;
   сотрудники всех групп разреза == все сотрудники (штатные и ГПХ).
7. Сегмент ЦА (seg_f) в SQL каталога: у каждого отчёта заходили == из ЦА + вне ЦА (панель seg_f больше не шлёт — запас).
9. ЦА по условиям: список ЦА + «вне ЦА» поимённо (lo) == все зрители периода, без пересечений, число == ca_out.
10. Выбрана область: разрезы aa (для вкладки «Аудитория» каталога) == панель после клика по этой группе (люди, просмотры, постоянные).
8. <папка>/Проверки: рендеры без джини == текущие шаблоны поставки (не устарели), исполняются; метка id отчёта
   не встречается в SQL сама по себе (цифры 12345 сидят в таблице перекодировки кириллицы — «заменить всё» её сломает).
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stand

W = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'Виджеты')
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
REBUILD = '--rebuild' in sys.argv
D = ARGS[0] if ARGS else None
pick = lambda key, dflt: (os.path.join(D, [x for x in os.listdir(D) if key in x and x.endswith('.sql') and 'SQL Lab' not in x][0]) if D else dflt)
ONE = pick('pa_one', os.path.join(W, 'pa-one.data.sql'))
CAT = pick('pa_body', os.path.join(W, 'pa-reports-body.data.sql'))
PPL = os.path.join(W, 'pa-area.data.sql')
AUD = os.path.join(W, 'pa-audience.data.sql')
HEAD = pick('pa_head', os.path.join(W, 'pa-head.data.sql'))
DICT = os.path.join(W, 'pa-ca-bar.data.sql')
bad = 0


def ok(cond, msg):
    global bad
    print(('OK   ' if cond else 'FAIL ') + msg)
    bad += 0 if cond else 1


def run(p, c, **kw):
    if p == ONE and not kw.get('raw'):
        return v2(run(p, c, raw=True))
    if kw.get('with_ca') and '{% set WITH_CA = false %}' in open(p).read():
        tmp = os.path.join(os.path.dirname(os.path.abspath(__file__)), '__pycache__', '_cat_ca.sql')
        os.makedirs(os.path.dirname(tmp), exist_ok=True)
        open(tmp, 'w').write(open(p).read().replace('{% set WITH_CA = false %}', '{% set WITH_CA = true %}'))
        p = tmp
    return stand.stat(stand.render(p, c))[0]


# ---- 8. Проверки для SQL Lab (папка поставки): рендеры == текущие шаблоны, исполняются ---------------------------
LAB_NOTE = ('-- Рендер без джини (для SQL Lab, база CROSS). Цифру в первой строке меняйте для повторного замера: '
            'SQL Lab кэширует результат.')
LAB_ID = '777777'   # метка id отчёта: в SQL сама по себе не встречается (см. п. 8)
LABS = [  # файл, шаблон, фильтры, строки шапки ({n} — сколько мест у метки)
    ('SQL Lab — панель, весь Proteus.sql', 'ONE', {},
     ['-- Панель единого листа (pa_one) — без выбора в каталоге, ЦА по правам. Засеките время первого прогона.', LAB_NOTE]),
    ('SQL Lab — панель, один отчёт.sql', 'ONE', {'mode_param': 'report', 'sel_f': [LAB_ID]},
     ['-- Панель — клик по одному отчёту. Замените ' + LAB_ID + ' на id отчёта из каталога (поиском, все {n} места).', LAB_NOTE]),
    ('SQL Lab — панель, ЦА IT-тимлиды.sql', 'ONE', {'ca_it_f': ['IT'], 'ca_head_f': '1'},
     ['-- Панель с ЦА по условиям: IT + руководители (как кейс «динамика по IT-тимлидам»).',
      "-- Если в бою код IT называется иначе — замените 'IT' (поиском) на значение из выпадашки «IT» строки ЦА.", LAB_NOTE]),
    ('SQL Lab — каталог.sql', 'CAT', {},
     ["-- Каталог единого листа (pa_body_one) — дефолт, ЦА по правам; строки section = 'aud' — вкладка «Аудитория».", LAB_NOTE]),
    ('SQL Lab — шапка.sql', 'HEAD', {},
     ["-- Шапка единого листа (pa_head) — справочник строки ЦА + дата данных (строка section = 'md').", LAB_NOTE,
      '-- Ждём: ~460 строк на синтетике (на бою — по числу сочетаний атрибутов штата), одна строка md с датой вчера.']),
]


def lab_body(src, flt):
    return [l.rstrip() for l in stand.render({'ONE': ONE, 'CAT': CAT, 'HEAD': HEAD}[src], flt).split('\n') if l.strip()]


# ОДИН запрос на всё (в SQL Lab можно запускать только один SELECT, system.* запрещены): главные сценарии —
# подзапросами (строк ответа, КБ упаковки), + размеры витрин; общее время показывает SQL Lab.
ALL_NAME = '0. ЗАМЕР БОЯ — один запрос (запустить только его).sql'
ALL_HEAD = ['-- ЗАМЕР БОЯ ОДНИМ ЗАПРОСОМ: SQL Lab (база CROSS) → «Выполнить» → прислать таблицу и ВРЕМЯ выполнения (зелёная плашка).',
            '-- Внутри — те же запросы, что шлют чарты единого листа: шапка, каталог (без ЦА и с ЦА «IT + руководители»),',
            '-- панель (весь Proteus, самый популярный отчёт — подставляется сам, ЦА «IT + руководители»), и размеры витрин pa_*.',
            '-- rows_or_n — строк ответа датасета (у витрин — строк в таблице), answer_kb — КБ ответа (как уйдёт в браузер, без JSON).',
            "-- Если в бою код IT называется иначе — замените 'IT' (поиском) на значение из выпадашки «IT» строки ЦА.",
            '-- Цифру в первой строке меняйте для повторного замера: SQL Lab кэширует результат.']
TOP_REP = ('SELECT p.dashboard_id FROM prod_proteus.pa_pair p WHERE p.dashboard_id IN (SELECT dashboard_id FROM prod_proteus.pa_dash_meta '
           'WHERE published = 1 AND actual_flg = 1) GROUP BY p.dashboard_id ORDER BY count() DESC LIMIT 1')
ALL_SCEN = [('1 шапка', 'HEAD', {}), ('2 каталог', 'CAT', {}), ('3 каталог · ЦА IT-руководители', 'CAT', {'ca_it_f': ['IT'], 'ca_head_f': '1'}),
            ('4 панель · весь Proteus', 'ONE', {}), ('5 панель · самый популярный отчёт', 'ONE', {'mode_param': 'report', 'sel_f': [LAB_ID]}),
            ('6 панель · ЦА IT-руководители', 'ONE', {'ca_it_f': ['IT'], 'ca_head_f': '1'})]


def lab_all():
    parts = []
    for name, src, flt in ALL_SCEN:
        body = '\n'.join(lab_body(src, flt)).replace('dashboard_id IN (' + LAB_ID + ')', 'dashboard_id IN (' + TOP_REP + ')')
        parts.append("SELECT '" + name + "' AS item, toFloat64(count()) AS rows_or_n, round(sum(length(k)) / 1024) AS answer_kb FROM (\n" + body + '\n)')
    for t in ['pa_pair', 'pa_evd_day', 'pa_staff', 'pa_emp_attrs', 'pa_dash_meta', 'pa_dash_acl', 'pa_adg_member']:
        parts.append("SELECT '7 витрина " + t + "' AS item, toFloat64(count()) AS rows_or_n, toFloat64(0) AS answer_kb FROM prod_proteus." + t)
    return ['SELECT item, rows_or_n, answer_kb FROM ('] + '\nUNION ALL\n'.join(parts).split('\n') + [')', 'ORDER BY item']


LAB_DIR = os.path.join(D, 'Проверки') if D else None
if LAB_DIR and REBUILD:
    open(os.path.join(LAB_DIR, ALL_NAME), 'w').write('\n'.join(['-- 1'] + ALL_HEAD + lab_all()) + '\n')
    print('пересобран Проверки/' + ALL_NAME)
    os.makedirs(LAB_DIR, exist_ok=True)
    for name, src, flt, head in LABS:
        body = lab_body(src, flt)
        n = sum(l.count(LAB_ID) for l in body)
        open(os.path.join(LAB_DIR, name), 'w').write('\n'.join(['-- 1'] + [h.replace('{n}', str(n)) for h in head] + body) + '\n')
        print('пересобран Проверки/' + name)

# Компактная кириллица (макрос cz в SQL, unz в чарте): `…` — отрезок кириллицы, ~ — экранирование.
CYR = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя'
TGT = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'
UNZ = dict(zip(TGT, CYR))


def unz(t):
    out, i, run = [], 0, False
    while i < len(t):
        c = t[i]
        if run:
            if c == '`': run = False
            else: out.append(UNZ.get(c, c))
            i += 1
        elif c == '`': run = True; i += 1
        elif c == '~' and i + 1 < len(t):
            out.append({'p': '|', 'c': '^', 'b': '`'}.get(t[i + 1], t[i + 1])); i += 2
        else: out.append(c); i += 1
    return ''.join(out)


TOT = ('users', 'users_prev', 'views', 'views_prev', 'new_u', 'new_prev', 'react_u', 'regular', 'regular_prev', 'sleeping',
       'mau', 'mau_prev', 'ca_prev', 'ca_regprev', 'ca_yr', 'ca_out')


def v2(rows):
    """Ответ pa_one v2 (5 колонок, упаковка) → прежние строки (section, g, k, parent, метрики) для сверки."""
    out, md = [], {}
    for r in rows:
        s, lines = r['section'], [x for x in (r['k'] or '').split('\n')] if r['section'] not in ('flt', 'sj', 'nm', 'md', 'area') else []
        if s == 'total':
            f = list(map(int, r['k'].split('|')))
            out.append(dict(section='total', g='', k='', parent='', **dict(zip(TOT, f))))
            # корзины частоты — поля 17–20 total (у pa_people — отдельные строки freq, только непустые)
            for i, u in enumerate(f[16:20]):
                if u: out.append(dict(section='freq', g='', k=str(i + 1), parent='', users=u))
        elif s == 'ctx':
            for x in lines:
                f = x.split('|')
                out.append(dict(section='ctx', g=r['g'], k=unz(f[0]), parent=unz(f[1]), **dict(zip(
                    ('users', 'users_prev', 'views', 'views_prev', 'new_u', 'regular', 'sleeping'), map(int, f[2:9])))))
        elif s == 'ts':
            for x in lines: f = x.split('|'); out.append(dict(section='ts', g='', k=f[0], parent='', users=int(f[1]), new_u=int(f[2]), react_u=int(f[3]), views=int(f[4])))
        elif s == 'cal':
            for x in lines: f = x.split('|'); out.append(dict(section='cal', g='', k=f[0], parent='', users=int(f[1]), new_u=int(f[2]), views=int(f[3])))
        elif s == 'coh':
            for x in lines:
                f = x.split('|')
                out.append(dict(section='coh', g='', k=f[0], parent='', cnt=int(f[1]), ages='[' + f[2] + ']', acts='[' + f[3] + ']'))
        elif s == 'md':
            md = dict(lvl3=r['k'], last_dt=r['parent'])
        elif s == 'area':
            out.append(dict(section='area', g=r['g'], k=r['k'], parent=r['parent'], days=r['n']))
        elif s == 'd':
            for i, x in enumerate(lines): out.append(dict(section='d', g=r['g'], k=str(i + 1), parent=unz(x)))
        elif s in ('list', 'h', 'n'):
            out.append(dict(section=s, g='', k=r['k'], parent=unz(r['parent']), users=r['n']))
        else:
            out.append(dict(section=s, g=r['g'], k=r['k'], parent=r['parent'], n=r['n']))
    for r in out:
        if r['section'] == 'area': r.update(md)
    return out


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
            out[f[0]] = dict(login=f[0], fio=unz(f[1]), spec=dz['spec'][f[2]], stream=dz['stream'][f[3]], exp=dz['exp'][f[4]],
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
    CC = {'total': ('users', 'users_prev', 'views', 'views_prev', 'new_u', 'new_prev', 'react_u', 'regular', 'regular_prev', 'sleeping', 'mau', 'mau_prev'),
          'freq': ('users',), 'ctx': ('users', 'users_prev', 'views', 'views_prev', 'new_u', 'regular', 'sleeping'),
          'ts': ('users', 'new_u', 'react_u', 'views'), 'cal': ('users', 'new_u', 'views'), 'coh': ('cnt', 'ages', 'acts'),
          'area': ('days', 'last_dt', 'lvl3')}
    norm = lambda v: str(v).replace(' ', '').replace("'", '')
    A = {key(r): tuple(norm(r.get(x)) for x in CC[r['section']]) for r in a if r['section'] in SEC}
    B = {key(r): tuple(norm(r.get(x)) for x in CC[r['section']]) for r in b if r['section'] in SEC and not (r['section'] == 'ctx' and not int(r['users']))}
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
def cat_v2(rows):
    """Каталог v2 → {total, rep: {id: поля}, aud: {разрез: {значение: (users, views, regular, staff)}}, sj}."""
    out = {'total': None, 'rep': {}, 'aud': {}, 'sj': {}}
    for r in rows:
        L = r['k'].split('\n') if r['k'] else []
        if r['section'] == 'total': out['total'] = tuple(int(x) for x in r['k'].split('|'))
        elif r['section'] == 'sj': out['sj'] = json.loads(r['k'])
        elif r['section'] == 'rep':
            for ln in L:
                f = ln.split('|')
                out['rep'][int(f[0])] = dict(users=int(f[1]), views=int(f[2]), regular=int(f[3]), ca_n=int(f[6]) if f[6] else None,
                                             ca_wide=int(f[7]) if f[7] else None, ca_users=int(f[8]) if f[8] else None)
        elif r['section'] == 'aud':
            for ln in L:
                f = ln.split('|')
                out['aud'].setdefault(r['g'], {})[unz(f[0])] = tuple(int(x) for x in f[2:6])
    return out


for c in [{'ca_spec_f': ['Спец 3']}, {'ca_hq_f': ['HQ'], 'ca_it_f': ['IT'], 'ca_head_f': '1'}, {'ca_org_f': ['Блок 3'], 'period_param': 'w'}]:
    one = [r for r in run(ONE, c) if r['section'] == 'total'][0]
    cat = cat_v2(run(CAT, c, with_ca=True))['total']
    ok((one['users'], one['views'], one['regular']) == cat[:3],
       f'по условиям ЦА: панель == ИТОГО каталога {c}  ({one["users"]} / {cat[0]})')

# ---- 4. Старый анализатор и prefer_column_name_to_alias -------------------------------------------------------
CATCA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '__pycache__', '_cat_ca.sql')
os.makedirs(os.path.dirname(CATCA), exist_ok=True)
open(CATCA, 'w').write(open(CAT).read().replace('{% set WITH_CA = false %}', '{% set WITH_CA = true %}'))
for p_, c in [(ONE, {}), (ONE, {'ca_spec_f': ['Спец 3'], 'ca_head_f': '1'}), (ONE, {'aud_org_f': ['Блок 3'], 'aud_head_f': ['1']}),
              (CATCA, {}), (CATCA, {'ca_it_f': ['IT'], 'seg_f': 'out', 'spec_f': ['Спец 3'], 'freq_f': ['2']}), (CATCA, {'seg_f': 'reach', 'org_f': ['Блок 3']})]:
    sql = stand.render(p_, c)
    a = stand.stat(sql)[0]
    b = stand.stat(sql + '\nSETTINGS enable_analyzer = 0')[0]
    d = stand.stat(sql + '\nSETTINGS prefer_column_name_to_alias = 1')[0]
    # порядок строк ВНУТРИ упакованной ячейки (groupArray) не гарантирован — сравниваем как множество строк
    norm = lambda rows: sorted(json.dumps(dict(r, k='\n'.join(sorted(str(r.get('k') or '').split('\n')))), sort_keys=True, default=str) for r in rows)
    ok(norm(a) == norm(b) == norm(d), f'старый анализатор и prefer_column_name_to_alias — те же строки {os.path.basename(p_)} {c}')

# ---- 5. Шапка ---------------------------------------------------------------------------------------------
h0, h1, dd = run(HEAD, {}), run(HEAD, {'period_param': 'm', 'ca_spec_f': ['Спец 3'], 'mode_param': 'report', 'sel_f': ['5']}), run(DICT, {})
norm = lambda rows: sorted(json.dumps(r, sort_keys=True, default=str) for r in rows)
# С 2026-09-30 в шапке нет наборов AD-групп и численности групп: сверяем с pa_ca_dict то, что осталось —
# сотрудники по пути × атрибутам (сумма людей), словарь, итог, имена групп (без пустых/«-»).
def head_units(rows):
    u = {}
    for r in rows:
        if r['section'] != 's': continue
        for x in (r['k'] or '').split('\n'):
            f = x.split('\t')
            if len(f) >= 6: u[(r['parent'],) + tuple(f[:5])] = u.get((r['parent'],) + tuple(f[:5]), 0) + int(f[5])
    return u
same = lambda sec: norm([r for r in h0 if r['section'] == sec]) == norm([r for r in dd if r['section'] == sec])
ok(head_units(h0) == head_units(dd) and same('d') and same('total'), 'pa_head: сотрудники по пути и атрибутам, словарь, итог == pa_ca_dict')
import re as _re
gn = lambda rows: sorted(r['k'] for r in rows if r['section'] == 'adg' and not _re.match(r'^[\s\W_]*$', r['k'] or '') )
ok(gn(h0) == gn(dd) and all(r['n'] == 0 and r['parent'] == '' for r in h0 if r['section'] == 'adg'),
   f'pa_head: AD-группы — только имена ({len(gn(h0))}), без численности и составов')
ok(not any(len(x.split('\t')) > 6 for r in h0 if r['section'] == 's' for x in (r['k'] or '').split('\n')), 'pa_head: у людей нет наборов AD-групп')
md = [r['k'] for r in h0 if r['section'] == 'md']
area = [r for r in run(ONE, {}) if r['section'] == 'area'][0]
ok(md == [str(area['lvl3'])], f'дата данных шапки == md панели ({md} / {area["lvl3"]})')
ok(norm(h0) == norm(h1), 'шапка не зависит от фильтров')

# ---- 6. «Аудитория» каталога == панель с этой группой -------------------------------------------------------
def ca_size(rows, grain='d'):
    t = one_tot(rows, grain)
    return t['ca']


base = cat_v2(run(CAT, {}, with_ca=True))
staff_all = int(str(stand.S.query('SELECT count() FROM prod_proteus.pa_staff', 'CSV')).strip())
for d in ('s', 't', 'q', 'i', 'h'):
    ok(sum(v[3] for v in base['aud'][d].values()) == staff_all, f'«Аудитория» каталога: сотрудники разреза {d} == все сотрудники ({staff_all})')
CASES = [('s', 'Спец 3', {'aud_spec_f': ['Спец 3']}), ('t', 'Стрим 4', {'aud_stream_f': ['Стрим 4']}), ('q', 'HQ', {'aud_hq_f': ['HQ']}),
         ('i', 'IT', {'aud_it_f': ['IT']}), ('h', '1', {'aud_head_f': ['1']}), ('o', 'Блок 3', {'aud_org_f': ['Блок 3']}),
         ('o', 'Блок 3 › Деп 3.3', {'aud_org_f': ['Блок 3 › Деп 3.3']})]
for extra in [{}, {'ca_it_f': ['IT']}, {'period_param': 'w', 'exc_f': '0'}]:
    cat = cat_v2(run(CAT, extra, with_ca=True))
    for d, v, f in CASES:
        rows = run(ONE, dict(extra, **f))
        one = [r for r in rows if r['section'] == 'total'][0]
        cu, cs = cat['aud'][d].get(v, (0, 0, 0, 0))[0], cat['aud'][d].get(v, (0, 0, 0, 0))[3]
        pc = ca_size(rows, extra.get('period_param', 'd'))
        ok((one['users'], pc) == (cu, cs), f'«Аудитория» {d}={v} {extra}: панель (люди {one["users"]}, ЦА {pc}) == каталог (заходили {cu}, сотрудников {cs})')
nof = lambda rows: norm([r for r in rows if r['section'] != 'flt'])   # эхо фильтров у запросов разное — не сравниваем
ok(nof(run(ONE, {'aud_head_f': ['0', '1']}, raw=True)) == nof(run(ONE, {}, raw=True)), 'обе группы «руководители» из каталога == без условия')

# ---- 7. Сегмент ЦА в каталоге: заходили == из ЦА + вне ЦА -------------------------------------------------------
for extra in [{}, {'ca_spec_f': ['Спец 3']}, {'period_param': 'm', 'freq_f': ['1', '2']}]:
    # без сегмента по условиям каталог уже только про ЦА: «все заходившие» — без условий ЦА
    allr = cat_v2(run(CAT, {k: v for k, v in extra.items() if not k.startswith('ca_')}, with_ca=True))['rep']
    reach = cat_v2(run(CAT, dict(extra, seg_f='reach'), with_ca=True))['rep']
    out = cat_v2(run(CAT, dict(extra, seg_f='out'), with_ca=True))['rep']
    bad_ = [i for i in allr if allr[i]['users'] != reach.get(i, {'users': 0})['users'] + out.get(i, {'users': 0})['users']]
    # по правам «из ЦА» у отчёта == ca_users без сегмента (зрители из ЦА отчёта)
    if not any(k.startswith('ca_') for k in extra):
        bad_ += [i for i in allr if reach.get(i, {'users': 0})['users'] != (allr[i]['ca_users'] or 0)]
    ok(not bad_ and allr, f'сегмент ЦА в каталоге {extra}: заходили == из ЦА + вне ЦА у {len(allr)} отчётов' + (f'  расхождений {len(bad_)}: {bad_[:3]}' if bad_ else ''))
never = cat_v2(run(CAT, {'seg_f': 'never'}, with_ca=True))
ok(never['sj'].get('seg') == 'never' and never['rep'] == cat_v2(run(CAT, {}, with_ca=True))['rep'], 'сегмент «не заходили»: каталог не сужается, в состоянии seg = never')

# ---- 9. ЦА по условиям: список ЦА + «вне ЦА» (секция lo) == все зрители периода --------------------------------
def logins(rows, sec):
    return [x.split('|')[0] for r in rows if r['section'] == sec for x in (r['k'] or '').split('\n') if x]


for extra, cond in [({}, {'ca_it_f': ['IT'], 'ca_head_f': '1'}), ({'period_param': 'w', 'exc_f': '0'}, {'ca_org_f': ['Блок 3']}),
                    ({'mode_param': 'report', 'sel_f': ['3']}, {'aud_spec_f': ['Спец 3']})]:
    allv = set(logins(run(ONE, extra, raw=True), 'list'))
    rows = run(ONE, dict(extra, **cond), raw=True)
    ca, lo = logins(rows, 'list'), logins(rows, 'lo')
    out_n = int([r for r in rows if r['section'] == 'total'][0]['k'].split('|')[15])
    ok(set(ca) | set(lo) == allv and not set(ca) & set(lo) and len(lo) == len(set(lo)) == out_n,
       f'ЦА по условиям {cond} {extra}: ЦА {len(ca)} + вне ЦА {len(lo)} == все зрители {len(allv)}, вне ЦА == ca_out {out_n}')
ok(not [r for r in run(ONE, {}, raw=True) if r['section'] == 'lo'], 'по правам секции lo нет (вне ЦА — уже в списке)')

# ---- 10. Вкладка «Аудитория» при выбранной области: секция aa панели == панель с этой группой -------------------
COLS = {'o': 'aud_org_f', 's': 'aud_spec_f', 't': 'aud_stream_f', 'q': 'aud_hq_f', 'i': 'aud_it_f', 'h': 'aud_head_f'}
for base in [{'mode_param': 'report', 'sel_f': ['2']}, {'mode_param': 'report', 'sel_f': ['3', '5'], 'period_param': 'w'},
             {'mode_param': 'report', 'sel_f': ['2'], 'ca_it_f': ['IT']}]:
    A = {}
    for r in run(ONE, base, raw=True):
        if r['section'] == 'aa':
            for x in r['k'].split('\n'):
                f = x.split('|'); A[(r['g'], unz(f[0]))] = tuple(map(int, f[1:4]))
    for key in [('o', 'Блок 3'), ('o', 'Блок 3 › Деп 3.3'), ('s', 'Спец 3'), ('t', 'Стрим 4'), ('q', 'HQ'), ('i', 'IT'), ('h', '1')]:
        t = [r for r in run(ONE, dict(base, **{COLS[key[0]]: [key[1]]}), raw=True) if r['section'] == 'total'][0]['k'].split('|')
        pn = (int(t[0]), int(t[2]), int(t[7]))
        ok(A.get(key, (0, 0, 0)) == pn, f'aa {key} {base}: {A.get(key)} == панель с группой {pn}')
    # «все зрители» области (строка all, с не сотрудниками) == итог панели == «Польз.» отчёта в каталоге (2026-10-02)
    t0 = [r for r in run(ONE, base, raw=True) if r['section'] == 'total'][0]['k'].split('|')
    p0 = (int(t0[0]), int(t0[2]), int(t0[7]))
    staff_u = sum(v[0] for k, v in A.items() if k[0] == 'h')
    ok(A.get(('all', '*')) == p0 and staff_u <= p0[0], f'aa all {base}: {A.get(("all", "*"))} == итог панели {p0}; сотрудников-зрителей {staff_u}')
    if len(base['sel_f']) == 1:
        cr = cat_v2(run(CAT, {k: v for k, v in base.items() if k not in ('mode_param', 'sel_f')}, with_ca=True))['rep'][int(base['sel_f'][0])]
        ok((cr['users'], cr['views'], cr['regular']) == p0, f'aa all {base}: == «Польз./Просм./Пост.» отчёта в каталоге {(cr["users"], cr["views"], cr["regular"])}')
ok(not [r for r in run(ONE, {}, raw=True) if r['section'] == 'aa'], 'без выбора области секции aa нет (каталог считает сам)')
for c in [{}, {'ca_spec_f': ['Спец 3']}, {'period_param': 'w', 'exc_f': '0'}, {'spec_f': ['Спец 3'], 'freq_f': ['2']}]:
    cv = cat_v2(run(CAT, c, with_ca=True))
    al = cv['aud'].get('all', {}).get('*')
    stf = sum(v[0] for v in cv['aud'].get('h', {}).values())
    ok(al is not None and al[:3] == cv['total'][:3] and stf <= al[0], f'каталог aud all {c}: {al and al[:3]} == ИТОГО каталога {cv["total"][:3]}; сотрудников-зрителей {stf}')

# ---- 8. Проверки для SQL Lab ------------------------------------------------------------------------------------
if LAB_DIR and os.path.isdir(LAB_DIR):
    fa = os.path.join(LAB_DIR, ALL_NAME)
    la = open(fa).read().rstrip('\n').split('\n') if os.path.exists(fa) else []
    ok(la[1 + len(ALL_HEAD):] == lab_all(), f'Проверки/{ALL_NAME}: == текущие шаблоны' + ('' if la[1 + len(ALL_HEAD):] == lab_all() else ' (пересобрать: --rebuild)'))
    ok('system.' not in '\n'.join(la), f'Проверки/{ALL_NAME}: без system.* (в SQL Lab запрещено)')
    ra = stand.stat('\n'.join(la))[0]
    ok(len(ra) == len(ALL_SCEN) + 7 and all(r['rows_or_n'] > 0 for r in ra), f'Проверки/{ALL_NAME}: исполняется, {len(ra)} строк, все сценарии непустые')
    for r in ra: print('     ', r['item'], int(r['rows_or_n']), int(r['answer_kb']), 'КБ')
    base_one = '\n'.join(lab_body('ONE', {}))
    ok(LAB_ID not in base_one and LAB_ID not in '\n'.join(lab_body('CAT', {})), f'метка {LAB_ID} в шаблонах сама по себе не встречается')
    for name, src, flt, head in LABS:
        f = os.path.join(LAB_DIR, name)
        if not os.path.exists(f):
            ok(False, f'Проверки/{name}: файла нет (пересобрать: --rebuild)'); continue
        lines = open(f).read().rstrip('\n').split('\n')
        i = 0
        while i < len(lines) and lines[i].startswith('--'):
            i += 1
        body = lab_body(src, flt)
        ok(lines[i:] == body, f'Проверки/{name}: рендер == текущий шаблон поставки' + ('' if lines[i:] == body else '  (устарел — пересобрать: --rebuild)'))
        m = LAB_ID in flt.get('sel_f', [])
        if m:
            n = sum(l.count(LAB_ID) for l in body)
            ok(f'все {n} места' in '\n'.join(lines[:i]), f'Проверки/{name}: в шапке верное число мест метки ({n})')
        try:
            ok(len(stand.stat('\n'.join(lines))[0]) > 0, f'Проверки/{name}: исполняется')
        except Exception as e:
            ok(False, f'Проверки/{name}: ошибка {str(e)[:300]}')

print('\nИТОГ: ' + ('всё сходится' if not bad else f'{bad} расхождений'))
sys.exit(1 if bad else 0)
