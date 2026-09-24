"""Регресс SQL вкладки «Аудитория» на стенде.

    python3 .stand/check_aud.py <папка поставки «Аудитория»> <папка поставки v7>

1. Панель (файл 2): зрители в упаковке 'v' == зрители области в pa_pair (без владельцев);
   зрители + свёрнутый штат 'h' == штат ⋃ зрители; у каждого человека одна строка.
2. ЦА по правам одного отчёта (поле acc, при exc_f = 0) == pa_dash_ca.ca_n этого отчёта.
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
AUD, CAT, PPL = f(D, '2. '), f(D, '3. '), f(V7, '3. ')
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
                h += int(x[3]); ha += int(x[4])
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
    ok(len(vw) + h == staff + nst, f'{c}: зрители {len(vw)} + штат без визитов {h} == штат {staff} + зрители вне штата {nst}')
    # сходимость с первой вкладкой: зрители периода == KPI «Пользователей» pa_people
    n = int(json.loads([r for r in rows if r['section'] == 'total'][0]['state_j'])['n'])
    cur = sum(1 for p in vw.values() if p['msk'] & ((1 << n) - 1))
    kp = [r for r in run(PPL, c) if r['section'] == 'total']
    ok(kp and int(kp[0]['users']) == cur, f'{c}: зрителей периода {cur} == KPI первой вкладки {kp[0]["users"] if kp else "—"}')

# ЦА по правам одного отчёта == pa_dash_ca (владельцев не вычитаем: exc_f = 0)
for did in reps:
    vw, h, ha = people(run(AUD, {'mode_param': 'report', 'sel_f': [str(did)], 'exc_f': '0'}))
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
print('\nИТОГ:', 'всё сходится' if not bad else f'{bad} расхождений')
