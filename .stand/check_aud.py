"""Регресс SQL вкладки «Аудитория» на стенде.

    python3 .stand/check_aud.py "Лист Аудитория — актуальные файлы" <папка поставки v7>

1. Панель (файл 2): зрители в упаковке 'v' == зрители области в pa_pair (без владельцев);
   зрители + свёрнутый штат 'h' == штат ⋃ зрители; у каждого человека одна строка.
2. ЦА по правам одного отчёта (поле acc, «Без владельцев» по умолчанию) == pa_dash_ca.ca_n этого отчёта.
3. Зрители периода (бит окна в маске) == KPI «Пользователей» правой панели первой вкладки
   (pa_people) на той же области — числа вкладок сходятся.
4. Каталог вкладки (файл 3, WITH_CA = true) == каталог «Отчётов» + 2 колонки; ca_n == pa_dash_ca.
5. Режимы боевого CH: prefer_column_name_to_alias = 1 и старый анализатор дают те же строки.
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stand

D, V7 = sys.argv[1], sys.argv[2]
f = lambda d, p: os.path.join(d, [x for x in os.listdir(d) if x.startswith(p)][0])
# D — папка «Лист Аудитория — актуальные файлы»: файлы ищутся по имени датасета.
g = lambda d, key: os.path.join(d, [x for x in os.listdir(d) if key in x and x.endswith('.sql')][0])
AUD, CAT, PPL = g(D, 'pa_aud_v2'), g(D, 'pa_body_aud'), f(V7, '3. ')
q = lambda sql: json.loads(stand.S.query(sql, 'JSON').bytes())['data']
run = lambda p, c: q(stand.render(p, c))
norm = lambda rows: sorted(json.dumps(r, sort_keys=True, ensure_ascii=False) for r in rows)
bad = 0


def ok(cond, msg):
    global bad
    print(('OK   ' if cond else 'FAIL ') + msg)
    bad += 0 if cond else 1


def people(rows):
    """Разворот упаковки: {логин: поля} зрителей и сумма свёрнутого штата."""
    vw, h, ha = {}, 0, 0
    for r in rows:
        if r['section'] == 'v':
            for ln in r['k'].split('\n'):
                x = ln.split('\t')
                vw[x[0]] = {'acc': x[2] == '1', 'stf': x[3] == '1', 'msk': int(x[4]), 'prev': int(x[5]), 'path': r['parent']}
        elif r['section'] == 'h':
            for ln in r['k'].split('\n'):
                x = ln.split('\t')
                h += int(x[5]); ha += int(x[6])   # sid · tid · рук · hq · it · человек · с доступом · в ЦА · в ЦА и с доступом
    return vw, h, ha


staff = int(q('SELECT count() c FROM prod_proteus.pa_staff')[0]['c'])
reps = [r['dashboard_id'] for r in q("""SELECT p.dashboard_id FROM prod_proteus.pa_pair p INNER JOIN prod_proteus.pa_dash_meta m USING dashboard_id
  WHERE m.published = 1 AND m.actual_flg = 1 GROUP BY p.dashboard_id ORDER BY count() DESC LIMIT 3""")]
for c in [{}, {'mode_param': 'report', 'sel_f': [str(reps[0])]}, {'mode_param': 'report', 'sel_f': [str(x) for x in reps]},
          {'mode_param': 'collection', 'sel_f': ['Колл 5']}, {'period_param': 'm', 'mode_param': 'report', 'sel_f': [str(reps[1])]}]:
    rows = run(AUD, c)
    vw, h, ha = people(rows)
    lines = sum(len(r['k'].split('\n')) for r in rows if r['section'] == 'v')
    ok(lines == len(vw), f'{c}: у зрителя одна строка ({lines})')
    # эталон зрителей: пары области без владельцев отчёта и без владельцев области
    ids = stand.render(AUD, c).split('area AS (')[1].split('),\n  vw AS')[0]
    ref = q(f"""WITH area AS ({ids}) SELECT uniqExact(lower(login)) u FROM prod_proteus.pa_pair
      WHERE dashboard_id IN (SELECT dashboard_id FROM area) AND own_flg = 0""")[0]['u']
    ok(len(vw) == int(ref), f'{c}: зрителей в упаковке {len(vw)} == по парам {ref}')
    nst = sum(1 for p in vw.values() if not p['stf'])
    own = 0 if c.get('exc_f') == '0' else int(q(f"""WITH area AS ({ids}) SELECT count() c FROM (SELECT o FROM area ARRAY JOIN owners_string AS o GROUP BY o
      HAVING count() = (SELECT count() FROM area)) WHERE o IN (SELECT login FROM prod_proteus.pa_staff)""")[0]['c'])
    ok(len(vw) + h == staff + nst - own, f'{c}: зрители {len(vw)} + штат без визитов {h} == штат {staff} + зрители вне штата {nst} − владельцы области {own}')
    # сходимость с первой вкладкой: зрители периода == KPI «Пользователей» pa_people
    n = int(json.loads([r for r in rows if r['section'] == 'total'][0]['state_j'])['n'])
    cur = sum(1 for p in vw.values() if p['msk'] & ((1 << n) - 1))
    kp = [r for r in run(PPL, c) if r['section'] == 'total']
    ok(kp and int(kp[0]['users']) == cur, f'{c}: зрителей периода {cur} == KPI первой вкладки {kp[0]["users"] if kp else "—"}')

# ЦА по правам одного отчёта == pa_dash_ca (владельцы отчёта не входят ни туда, ни туда — умолчание «Без владельцев»)
for did in reps:
    vw, h, ha = people(run(AUD, {'mode_param': 'report', 'sel_f': [str(did)]}))
    ca = sum(1 for p in vw.values() if p['acc'] and p['stf']) + ha
    ref = q(f'SELECT ca_n FROM prod_proteus.pa_dash_ca WHERE dashboard_id = {did}')
    ok(ref and int(ref[0]['ca_n']) == ca, f'отчёт {did}: ЦА по правам {ca} == pa_dash_ca {ref[0]["ca_n"] if ref else "—"}')

# Каталог вкладки: тот же ответ + ca_n / ca_wide
base = run(f(V7, '2. '), {})
cat = run(CAT, {})
ok(norm([{k: v for k, v in r.items() if k not in ('ca_n', 'ca_wide')} for r in cat]) == norm(base), 'каталог «Аудитории» == каталог «Отчётов» + 2 колонки')
mism = q('SELECT dashboard_id, ca_n FROM prod_proteus.pa_dash_ca')
mp = {int(r['dashboard_id']): int(r['ca_n']) for r in mism}
ok(all(r['ca_n'] is None or mp.get(int(r['dashboard_id']), 0) == int(r['ca_n']) for r in cat if r['section'] == 'rep'), 'ca_n каталога == pa_dash_ca (нет прав — 0)')

for pth in [AUD, CAT]:
    for c in [{}, {'mode_param': 'report', 'sel_f': [str(reps[0])]}, {'mode_param': 'owner', 'sel_f': ['own5'], 'exc_f': '0'}]:
        sql = stand.render(pth, c)
        a = q(sql)
        for st in ['prefer_column_name_to_alias = 1', 'enable_analyzer = 0']:
            try:
                ok(norm(a) == norm(q(sql + '\nSETTINGS ' + st)), f'{st}: {os.path.basename(pth)[:30]} {c}')
            except Exception as e:
                ok(False, f'{st}: {os.path.basename(pth)[:30]} {c} — {str(e)[:120]}')
# ЦА «по условиям» (эмит панели ca_*_f): каталог показывает только зрителей ЦА, знаменатель — размер ЦА;
# панель на той же области даёт те же числа; не заходившие из ЦА приходят поимённо (≤ NAMES_MAX).
def vl(rows, i):
    return [l.split('\t') for r in rows if r['section'] == 'v' for l in r['k'].split('\n')]
for cond in [{'ca_org_f': ['Блок 3'], 'ca_it_f': ['IT']}, {'ca_spec_f': ['Спец 3', 'Спец 5'], 'ca_head_f': 'n'},
             {'ca_org_f': ['Блок 2 › Деп 2.2'], 'ca_hq_f': ['HQ', 'HQ line support']}, {'ca_stream_f': ['Стрим 1'], 'period_param': 'm'},
             {'ca_adg_f': ['ADG3', 'ADG7']}, {'ca_adg_f': ['ADG5'], 'ca_head_f': '1', 'ca_it_f': ['nonIT']}]:
    cat = {int(r['dashboard_id']): r for r in run(CAT, cond) if r['section'] == 'rep'}
    for did in reps:
        pan = run(AUD, dict(cond, mode_param='report', sel_f=[str(did)]))
        n = int(json.loads([r for r in pan if r['section'] == 'total'][0]['state_j'])['n'])
        vv = vl(pan, 0)
        reach = sum(1 for x in vv if x[16] == '1' and int(x[4]) > 0)
        caV = sum(1 for x in vv if x[16] == '1')
        caH = sum(int(l.split('\t')[7]) for r in pan if r['section'] == 'h' for l in r['k'].split('\n'))
        names = sum(int(r['n']) for r in pan if r['section'] == 'n')
        c = cat.get(did)
        ok(c is not None and int(c['users']) == reach, f'ЦА {cond} · отчёт {did}: зрителей ЦА в каталоге {c["users"] if c else "—"} == дошли из ЦА в панели {reach}')
        ok(c is not None and int(c['ca_n']) == caV + caH, f'ЦА {cond} · отчёт {did}: ca_n {c["ca_n"] if c else "—"} == ЦА панели {caV + caH}')
        ok(names == caH, f'ЦА {cond} · отчёт {did}: имён не заходивших {names} == ЦА без визитов {caH}')
# Строка «Целевая аудитория» (pa_ca_dict): число «в ЦА» считается в браузере по справочнику штата —
# оно обязано совпасть с ЦА панели и ca_n каталога на сервере — в том числе с условием «AD-группы».
BAR = [x for x in os.listdir(D) if 'pa_ca_dict' in x and x.endswith('.sql')]
if BAR:
    brows = run(os.path.join(D, BAR[0]), {})
    dct, gnm = {}, {}
    for r in brows:
        if r['section'] == 'd': dct[(r['g'], r['k'])] = r['parent']
        if r['section'] == 'adg': gnm[r['parent']] = r['k']
    units = []
    for r in brows:
        if r['section'] != 's': continue
        for ln in r['k'].split('\n'):
            x = ln.split('\t')
            units.append({'org': r['parent'], 'spec': dct[('spec', x[0])], 'stream': dct[('stream', x[1])], 'hd': x[2] == '1',
                          'hq': dct[('hq', x[3])], 'it': dct[('it', x[4])], 'n': int(x[5]),
                          'g': {gnm[i] for i in x[6].split(',') if i} if len(x) > 6 else set()})
    tot = [r for r in brows if r['section'] == 'total'][0]
    ok(sum(u['n'] for u in units) == int(tot['n']) == staff, f'строка ЦА: справочник {sum(u["n"] for u in units)} == штат {staff}')
    def bar_n(c):
        def hit(u):
            if c.get('ca_org_f') and not any(u['org'] == z or u['org'].startswith(z + ' › ') for z in c['ca_org_f']): return False
            for k, f in [('spec', 'ca_spec_f'), ('stream', 'ca_stream_f'), ('hq', 'ca_hq_f'), ('it', 'ca_it_f')]:
                if c.get(f) and u[k] not in c[f]: return False
            if c.get('ca_head_f') == '1' and not u['hd']: return False
            if c.get('ca_head_f') == 'n' and u['hd']: return False
            if c.get('ca_adg_f') and not (u['g'] & set(c['ca_adg_f'])): return False
            return True
        return sum(u['n'] for u in units if hit(u))
    for cond in [{'ca_org_f': ['Блок 3'], 'ca_it_f': ['IT']}, {'ca_spec_f': ['Спец 3', 'Спец 5'], 'ca_head_f': 'n'},
                 {'ca_org_f': ['Блок 2 › Деп 2.2'], 'ca_hq_f': ['HQ', 'HQ line support']}, {'ca_stream_f': ['Стрим 1']}, {'ca_hq_f': ['nonHQ']},
                 {'ca_adg_f': ['ADG3', 'ADG7']}, {'ca_adg_f': ['ADG5'], 'ca_head_f': '1', 'ca_it_f': ['nonIT']}, {'ca_adg_f': ['ALL'], 'ca_org_f': ['Блок 2']}]:
        pan = run(AUD, dict(cond, mode_param='report', sel_f=[str(reps[0])]))
        vv = vl(pan, 0)
        caP = sum(1 for x in vv if x[16] == '1') + sum(int(l.split('\t')[7]) for r in pan if r['section'] == 'h' for l in r['k'].split('\n'))
        # владельцы отчёта выпадают из ЦА панели (excv=1) — строка их не знает; сравниваем с поправкой
        ids = stand.render(AUD, dict(cond, mode_param='report', sel_f=[str(reps[0])])).split('area AS (')[1].split('),\n  vw AS')[0]
        own = int(q(f"""WITH area AS ({ids}) SELECT count() c FROM (SELECT o FROM area ARRAY JOIN owners_string AS o GROUP BY o
          HAVING count() = (SELECT count() FROM area)) WHERE o IN (SELECT login FROM prod_proteus.pa_staff)""")[0]['c'])
        bn = bar_n(cond)
        ok(caP <= bn and bn - caP <= own, f'строка ЦА {cond}: «в ЦА» {bn} == ЦА панели {caP} (+ владельцы отчёта {bn - caP} ≤ {own})')
    for st in ['prefer_column_name_to_alias = 1', 'enable_analyzer = 0']:
        sql = stand.render(os.path.join(D, BAR[0]), {})
        ok(norm(q(sql)) == norm(q(sql + '\nSETTINGS ' + st)), f'{st}: строка ЦА')
# «Уволен» (нет среди действующих сотрудников с AD-логином): первый лист (pa_people, 14-е поле списка)
# и панель второго (зритель без флага «сотрудник») помечают одних и тех же людей периода.
for c in [{}, {'mode_param': 'report', 'sel_f': [str(reps[0])]}]:
    lst = [l.split('\t') for r in run(PPL, c) if r['section'] == 'list' for l in (r['k'] or '').split('\n') if l]
    f1 = {x[0].lower() for x in lst if len(x) > 13 and x[13] == '1'}
    pv = run(AUD, c)
    n = int(json.loads([r for r in pv if r['section'] == 'total'][0]['state_j'])['n'])
    f2 = {x[0] for x in vl(pv, 0) if x[3] == '0' and int(x[4]) & ((1 << n) - 1)}
    ok(f1 == f2 and len(lst[0]) == 14, f'{c}: уволенных за период на первом листе {len(f1)} == в панели {len(f2)}')
# Отсечка имён: при NAMES_MAX меньше числа не заходивших строк 'n' нет, а итоги 'h' на месте.
sql = stand.render(AUD, {}).replace('nnever <= 20000', 'nnever <= 100')
rows = q(sql)
ok(not any(r['section'] == 'n' for r in rows) and any(r['section'] == 'h' for r in rows), 'имён больше NAMES_MAX → строк n нет, свёрнутый штат h на месте')
# Сохранение датасета: filter_values = AlwaysTrueObject; враждебный ввод фильтров — без падений.
for pth in [AUD, CAT]:
    try:
        q(stand.render(pth, always_true=True)); err = ''
    except Exception as e:
        err = str(e)[:160]
    ok(not err, f'рендер при сохранении датасета (AlwaysTrueObject): {os.path.basename(pth)[:30]} {err}')
    for c in [{'mode_param': 'report', 'sel_f': ["1); DROP TABLE t;--", 'abc']}, {'mode_param': 'owner', 'sel_f': ["o'x", 'a\\b']},
              {'mode_param': 'collection', 'sel_f': ['"]); --']}, {'mode_param': 'xx', 'sel_f': ['1']}, {'period_param': 'zz'},
              {'pub_f': "1' OR 1=1", 'exc_f': '5'}, {'org_f': ["Блок 1 › '"], 'freq_f': ['9', "1'"]}]:
        try:
            rows = q(stand.render(pth, c)); err = ''
        except Exception as e:
            rows, err = [], str(e)[:160]
        ok(not err and (pth == CAT or any(r['section'] == 'total' for r in rows)), f'враждебный ввод {c}: {os.path.basename(pth)[:24]} {err}')
print('\nИТОГ:', 'всё сходится' if not bad else f'{bad} расхождений')
