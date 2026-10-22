"""Регресс «Своего периода» (2026-10-21) на стенде: period_param = «c|ГГГГ-ММ-ДД|шаг|n».

    python3 .stand/check_period.py [<папка единого листа>]        # SQL панели / каталога (по умолчанию — Виджеты/)
    python3 .stand/check_period.py [<папка>] --mocks              # + ответы для стенда листа → .stand/mocks_cp/
                                                                    (копия mocks_audbar, панель/каталог/шапка — свой период)

1. Свой период, кончающийся датой свежести, на 30 дней / 20 недель / 12 месяцев == готовому «30 дней» / «20 недель» /
   «12 месяцев» — все секции, построчно (строки внутри k — без учёта порядка). Готовые периоды при этом не тронуты:
   их держит check_one.py (рендер == Проверки/, сходимость с прежними датасетами).
2. Свой период в прошлом (дни, недели, месяцы; 7…31 шаг): итог панели (пользователи, просмотры, прошлое окно) и
   динамика по шагам == прямой расчёт по pa_evd_day; каталог — пользователи и просмотры каждого отчёта == факт.
3. Неверные и враждебные значения (31 февраля, шаг x, n > 32, кавычки, «OR 1=1» …) — как «30 дней», запрос исполняется;
   песочница Jinja (SandboxedEnvironment, как в Superset) разбирает значение.
4. Старый анализатор, prefer_column_name_to_alias = 1, join_use_nulls = 1 — тот же ответ.
5. Длинный свой период (больше LONG_MAX = 32 шагов: у людей не маска, а массив шагов) — тот же путь, что маски: шаблон с
   LONG_MAX = 0 на периодах до 32 шагов == маски, все секции; у людей вместо масок — число активных шагов (== битам маски);
   ряд охвата ЦА в ts (люди ЦА в шаге, шаг самого раннего визита) == тому, что чарт считает по маскам (caSeries).
   Длинные периоды (до года по дням) — в разделе 2 против факта.
6. «Календарь посещений» по периоду (панель, секция cal): у «30 дней» — 60 дней из маски msk_d; любой другой период — весь
   период по дням из подневного факта (parent строки — первый день окна). Путь факта, включённый на «30 днях», == маски
   (люди, новые, просмотры за 30 дней); у 20 недель / 12 месяцев / 8 кварталов / своего — окно и люди / просмотры по дням == факт.
"""
import os, sys, re, json, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stand
import jinja2.sandbox

HERE = os.path.dirname(os.path.abspath(__file__))
W = os.path.join(os.path.dirname(HERE), 'Виджеты')
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
D = ARGS[0] if ARGS else None
pick = lambda key, dflt: (os.path.join(D, [x for x in os.listdir(D) if key in x and x.endswith('.sql') and 'SQL Lab' not in x][0]) if D else dflt)
ONE = pick('pa_one', os.path.join(W, 'pa-one.data.sql'))
CAT0 = pick('pa_body', os.path.join(W, 'pa-reports-body.data.sql'))
HEAD = pick('pa_head', os.path.join(W, 'pa-head.data.sql'))
CAT = os.path.join(HERE, '__pycache__', '_cat_ca_period.sql')   # каталог вкладки «Аудитория» (как в поставке)
os.makedirs(os.path.dirname(CAT), exist_ok=True)
open(CAT, 'w').write(open(CAT0).read().replace('{% set WITH_CA = false %}', '{% set WITH_CA = true %}'))
Q = lambda q: json.loads(stand.S.query(q, 'JSON').bytes())['data']
bad = 0


def ok(c, m):
    global bad
    bad += 0 if c else 1
    print(('OK   ' if c else 'FAIL ') + m)


def rows(tpl, f):
    return stand.stat(stand.render(tpl, dict(f)))[0]


def norm(d, skip=('flt', 'sj')):
    return sorted(json.dumps(dict(r, k='\n'.join(sorted(str(r.get('k') or '').split('\n')))), sort_keys=True, ensure_ascii=False)
                  for r in d if r.get('section') not in skip)


MD = str(stand.S.query("SELECT toDate(max(ifNull(md, dmax))) FROM prod_proteus.pa_pair", 'CSV')).strip().strip('"')
DOK = "SELECT dashboard_id FROM prod_proteus.pa_dash_meta WHERE published = 1 AND actual_flg = 1"

# ---- 1. Свой период по дату свежести == готовый --------------------------------------------------------------
EXTRA = [{}, {'mode_param': 'report', 'sel_f': ['1']}, {'ca_spec_f': ['Спец 1']}, {'exc_f': '0'}, {'aud_spec_f': ['Спец 1']},
         {'mode_param': 'cut:spec', 'sel_f': ['Спец 1']}]
for name, tpl in [('панель', ONE), ('каталог', CAT)]:
    for g, n in [('d', 30), ('w', 20), ('m', 12)]:
        for ex in EXTRA:
            a, b = dict(ex), dict(ex, period_param='c|%s|%s|%d' % (MD, g, n))
            if g != 'd':
                a['period_param'] = g
            ra, rb = rows(tpl, a), rows(tpl, b)
            if g == 'd':
                # календарь своего периода — из подневного факта (просмотры за все 60 дней, parent — первый день окна), у
                # готовых «30 дней» — из маски (просмотры за 30): сверяем люди и новые за 60 дней, просмотры — за 30
                for r in rb:
                    if r['section'] == 'cal':
                        r['parent'] = ''
                        r['k'] = '\n'.join((ln if int(ln.split('|')[0]) < 30 else '|'.join(ln.split('|')[:3] + ['0'])) for ln in str(r['k']).split('\n') if ln)
            # мгновенная панель (pv / pvh) — только у готовых периодов: у своего её нет по построению (check_one §14)
            ra, rb = norm(ra, ('flt', 'sj', 'pv', 'pvh')), norm(rb, ('flt', 'sj', 'pv', 'pvh'))
            ok(ra == rb, '1 %s · свой %s×%d по %s == готовый %s %s (%d строк)' % (name, g, n, MD, g, ex, len(ra)))

# ---- 2. Свой период в прошлом == прямой расчёт по факту --------------------------------------------------------
CASES = [('2026-07-15', 'd', 21), ('2026-06-30', 'd', 7), ('2026-08-09', 'w', 6), ('2026-05-31', 'm', 4), ('2026-03-10', 'd', 31),
         # длинные (LONG_MAX = 32): с начала года по дням и неделям, полгода по дням, год по дням, 3 года по месяцам
         (MD, 'd', 264), (MD, 'w', 38), ('2026-08-31', 'd', 120), (MD, 'd', 366), (MD, 'm', 36), ('2026-06-14', 'w', 33)]
for T, g, n in CASES:
    unit, sf = {'d': ('day', 'toStartOfDay'), 'w': ('week', 'toMonday'), 'm': ('month', 'toStartOfMonth')}[g]
    k = "toInt64(dateDiff('%s', %s(log_dttm), %s(toDate('%s'))))" % (unit, sf, sf, T)
    base = "FROM prod_proteus.pa_evd_day WHERE dashboard_id IN (%s) AND toDate(log_dttm) <= toDate('%s')" % (DOK, T)
    ref = Q("SELECT uniqExactIf(login, %s < %d) AS u, uniqExactIf(login, %s >= %d AND %s < %d) AS up, sumIf(views, %s < %d) AS v,"
            " sumIf(views, %s >= %d AND %s < %d) AS vp %s" % (k, n, k, n, k, 2 * n, k, n, k, n, k, 2 * n, base))[0]
    f = {'period_param': 'c|%s|%s|%d' % (T, g, n), 'exc_f': '0'}
    d = rows(ONE, f)
    t = [r for r in d if r['section'] == 'total'][0]['k'].split('|')
    ok([int(t[0]), int(t[1]), int(t[2]), int(t[3])] == [int(ref['u']), int(ref['up']), int(ref['v']), int(ref['vp'])],
       '2 панель · %s %s×%d: пользователи %s, прошлое окно %s, просмотры %s / %s == факт' % (T, g, n, t[0], t[1], t[2], t[3]))
    ts = {int(r['k']): (int(r['u']), int(r['v'])) for r in Q("SELECT %s AS k, uniqExact(login) AS u, sum(views) AS v %s GROUP BY k HAVING k >= 0 AND k < %d" % (k, base, n))}
    got = {}
    for r in d:
        if r['section'] == 'ts':
            for ln in str(r['k']).split('\n'):
                x = ln.split('|')
                if len(x) >= 5:
                    got[int(x[0])] = (int(x[1]), int(x[4]))
    ok(got == ts, '2 панель · %s %s×%d: динамика по шагам (%d) == факт' % (T, g, n, len(ts)))
    rf = {int(r['d']): (int(r['u']), int(r['v'])) for r in Q(
        "SELECT dashboard_id AS d, uniqExact(login) AS u, sum(views) AS v %s AND %s >= 0 AND %s < %d GROUP BY d" % (base, k, k, n))}
    gc = {}
    for r in rows(CAT, f):
        if r['section'] == 'rep':
            for ln in str(r['k']).split('\n'):
                x = ln.split('|')
                if len(x) > 3 and int(x[1]) > 0:
                    gc[int(x[0])] = (int(x[1]), int(x[2]))
    ok(gc == rf, '2 каталог · %s %s×%d: пользователи и просмотры %d отчётов == факт' % (T, g, n, len(rf)))

# ---- 3. Неверные значения — как «30 дней»; песочница Jinja ----------------------------------------------------
BAD = ["c|2026-02-31|d|5", "c|2026-09-01|x|5", "c|2026-09-01|d|401", "c|2026-09-01|d|0", "c|'; DROP TABLE x --|d|5", "c|2026-9-1|d|5",
       "c|2026-09-01|d|5|9", "c|2026-09-01|d|abc", "c|20a6-09-01|d|5", "c|", "c", "c|2026-09-01|d|-3", "c|1999-09-01|d|5",
       "c|2026-13-01|d|5", "c|2026-09-01|d|5 OR 1=1"]
sq = lambda s: re.sub(r'\s+', ' ', s).strip()
cut = lambda s: re.sub(r'"flt":\{[^{}]*\}', 'FLT', re.sub(r"SELECT 'flt' AS section, '' AS g, '.*?' AS k", 'FLT', s))   # эхо фильтров — сырое значение
for name, tpl in [('панель', ONE), ('каталог', CAT)]:
    base = cut(sq(stand.render(tpl, {})))
    for v in BAD:
        r = stand.render(tpl, {'period_param': v})
        same = cut(sq(r)) == base
        try:
            stand.stat(r)
            ex = True
        except Exception:
            ex = False
        ok(same and ex, '3 %s · %r → как «30 дней», исполняется' % (name, v))
    env = jinja2.sandbox.SandboxedEnvironment(extensions=['jinja2.ext.do'])
    env.filters['where_in'] = stand.where_in
    fv = lambda col, default=None, remove_filter=False: (['c|2026-07-15|d|21'] if col == 'period_param' else ([] if default is None else [default]))
    out = env.from_string(open(tpl).read()).render(filter_values=fv, current_username=lambda add_to_cache_keys=True: '', cache_key_wrapper=lambda x: x)
    ok("toDate('2026-07-15')" in out, '3 %s · песочница Jinja (Superset) разбирает свой период' % name)

# ---- 4. Настройки боевого ClickHouse -----------------------------------------------------------------------------
for name, tpl in [('панель', ONE), ('каталог', CAT)]:
    for f in [{'period_param': 'c|2026-07-15|d|21'}, {'period_param': 'c|2026-08-09|w|6', 'ca_spec_f': ['Спец 1']},
              {'period_param': 'c|2026-05-31|m|4', 'mode_param': 'report', 'sel_f': ['1']},
              {'period_param': 'c|%s|d|264' % MD}, {'period_param': 'c|%s|w|38' % MD, 'ca_spec_f': ['Спец 1']}]:
        sql = stand.render(tpl, dict(f))
        b0 = norm(stand.stat(sql)[0], ())
        for st, back in [('SET allow_experimental_analyzer = 0', 'SET allow_experimental_analyzer = 1'),
                         ('SET prefer_column_name_to_alias = 1', 'SET prefer_column_name_to_alias = 0'),
                         ('SET join_use_nulls = 1', 'SET join_use_nulls = 0')]:
            stand.S.query(st)
            g1 = norm(stand.stat(sql)[0], ())
            stand.S.query(back)
            ok(g1 == b0, '4 %s · %s · %s — тот же ответ' % (name, f['period_param'], st[4:]))

# ---- 5. Длинный путь == маски ------------------------------------------------------------------------------------
def forced(tpl):
    t = open(tpl).read()
    assert '{% set LONG_MAX = 32 %}' in t, tpl
    fp = os.path.join(HERE, '__pycache__', '_long_' + os.path.basename(tpl))
    open(fp, 'w').write(t.replace('{% set LONG_MAX = 32 %}', '{% set LONG_MAX = 0 %}'))
    return fp
def bitc(v):
    return bin(int(v)).count('1')
def masks_to_counts(d, n):
    # маски людей → число активных шагов (как у длинного пути); ряд охвата ЦА по маскам — как caSeries чарта
    act, first = {}, {}
    for r in d:
        if r['section'] in ('list', 'lo'):
            ls = []
            for ln in str(r['k']).split('\n'):
                x = ln.split('|')
                if len(x) >= 13:
                    cur, prv = int(x[5]), int(x[6])
                    if r['section'] == 'list' and int(x[10]) & 64 and cur:
                        ks = [k for k in range(n) if cur >> k & 1]
                        for k in ks: act[k] = act.get(k, 0) + 1
                        first[max(ks)] = first.get(max(ks), 0) + 1
                    x[5], x[6] = str(bitc(cur)), str(bitc(prv & ((1 << n) - 1)))
                ls.append('|'.join(x))
            r['k'] = '\n'.join(ls)
    return d, act, first
def ts_cut(d):
    ca, cf = {}, {}
    for r in d:
        if r['section'] == 'ts':
            ls = []
            for ln in str(r['k']).split('\n'):
                x = ln.split('|')
                if len(x) >= 7:
                    if int(x[5]): ca[int(x[0])] = int(x[5])
                    if int(x[6]): cf[int(x[0])] = int(x[6])
                ls.append('|'.join(x[:5]))
            r['k'] = '\n'.join(ls)
    return d, ca, cf
LONG_EX = [{}, {'mode_param': 'report', 'sel_f': ['1']}, {'ca_spec_f': ['Спец 1']}, {'exc_f': '0'}, {'aud_spec_f': ['Спец 1']},
           {'mode_param': 'cut:spec', 'sel_f': ['Спец 1']}, {'freq_f': ['2', '4']}]
for name, tpl in [('панель', ONE), ('каталог', CAT)]:
    ftpl = forced(tpl)
    for per, n in [('c|%s|d|30' % MD, 30), ('c|2026-07-15|d|21', 21), ('c|2026-08-09|w|6', 6), ('c|2026-05-31|m|4', 4)]:
        for ex in LONG_EX:
            f = dict(ex, period_param=per)
            a, act, first = masks_to_counts(rows(tpl, f), n)
            b, ca, cf = ts_cut(rows(ftpl, f))
            same = norm(a) == norm(b)
            ok(same and (name != 'панель' or (act == ca and first == cf)),
               '5 %s · %s %s: массив шагов == маски%s' % (name, per, ex, ', охват ЦА по шагам (%d) == по маскам' % len(act) if name == 'панель' else ''))

# ---- 6. Календарь по периоду ----------------------------------------------------------------------------------
def calsec(d):
    for r in d:
        if r['section'] == 'cal':
            return r['parent'], {int(x.split('|')[0]): tuple(int(v) for v in x.split('|')[1:4]) for x in str(r['k']).split('\n') if x}
    return None, {}
FC = "{% set FCAL = cper or grain != 'd' %}"
assert FC in open(ONE).read()
fct = os.path.join(HERE, '__pycache__', '_fcal_' + os.path.basename(ONE))
open(fct, 'w').write(open(ONE).read().replace(FC, '{% set FCAL = true %}'))
for ex in [{}, {'mode_param': 'report', 'sel_f': ['2']}, {'mode_param': 'report', 'sel_f': ['2', '3', '5']}, {'ca_spec_f': ['Спец 1']}, {'exc_f': '0'},
           {'mode_param': 'cut:spec', 'sel_f': ['Спец 1']}, {'aud_spec_f': ['Спец 1']}]:
    p0, a = calsec(rows(ONE, ex))
    p1, b = calsec(rows(fct, ex))
    ok({k: v for k, v in a.items() if k < 30} == b and p0 == '', '6 «30 дней» %s: календарь из факта (%d дн., с %s) == маски' % (ex, len(b), p1))
for per, start in [('w', "toMonday(toDate('%s')) - toIntervalWeek(19)" % MD), ('m', "toStartOfMonth(toDate('%s')) - toIntervalMonth(11)" % MD),
                   ('q', "toStartOfQuarter(toDate('%s')) - toIntervalQuarter(7)" % MD), ('c|2026-07-15|d|21', "toDate('2026-07-15') - 59"),
                   ('c|%s|d|264' % MD, "toDate('2026-01-01')"), ('c|2026-08-09|w|6', "toDate('2026-08-09') - 59"),
                   ('c|%s|m|36' % MD, "toStartOfMonth(toDate('%s')) - toIntervalMonth(35)" % MD)]:
    T = per.split('|')[1] if per.startswith('c|') else MD
    p, c = calsec(rows(ONE, {'period_param': per, 'exc_f': '0'}))
    hs = Q("SELECT toString(greatest(toDate(%s), toDate(min(dmin)))) AS s FROM prod_proteus.pa_pair" % start)[0]['s']
    ref = {int(r['k']): (int(r['u']), int(r['v'])) for r in Q(
        "SELECT dateDiff('day', toDate(log_dttm), toDate('%s')) AS k, uniqExact(login) AS u, sum(views) AS v FROM prod_proteus.pa_evd_day "
        "WHERE dashboard_id IN (%s) AND toDate(log_dttm) >= toDate('%s') AND toDate(log_dttm) <= toDate('%s') GROUP BY k" % (T, DOK, hs, T))}
    ok(p == hs and {k: (v[0], v[2]) for k, v in c.items()} == ref, '6 календарь %s: окно с %s (%d дн.), люди и просмотры по дням == факт' % (per, p, len(ref)))

# ---- ответы для стенда листа ------------------------------------------------------------------------------------
if '--mocks' in sys.argv:
    MO = os.path.join(HERE, 'mocks_cp')
    if os.path.isdir(MO):
        shutil.rmtree(MO)
    shutil.copytree(os.path.join(HERE, 'mocks_audbar'), MO)
    f = {'period_param': 'c|2026-09-14|d|21'}
    for fn, tpl in [('one.json', ONE), ('cat_ca.json', CAT), ('head.json', HEAD)]:
        json.dump(rows(tpl, f), open(os.path.join(MO, fn), 'w'), ensure_ascii=False)
    print('моки своего периода (25 авг – 14 сен по дням) → .stand/mocks_cp/')
    # длинный: с начала года по дням (264 шага) — mocks_cp/long/
    LO = os.path.join(MO, 'long')
    shutil.copytree(os.path.join(HERE, 'mocks_audbar'), LO)
    f = {'period_param': 'c|%s|d|264' % MD}
    for fn, tpl in [('one.json', ONE), ('cat_ca.json', CAT), ('head.json', HEAD)]:
        json.dump(rows(tpl, f), open(os.path.join(LO, fn), 'w'), ensure_ascii=False)
    print('моки длинного периода (с 1 янв по дням) → .stand/mocks_cp/long/')

print('\nИТОГ: ' + ('всё сходится' if not bad else 'расхождений %d' % bad))
sys.exit(1 if bad else 0)
