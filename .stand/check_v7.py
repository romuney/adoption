"""Регресс SQL v7 на стенде: инварианты сходимости чисел между датасетами.

    python3 .stand/check_v7.py <папка поставки v7>

1. Тело на pa_pair (файл 2) == запасное тело на дневном факте (файл 2b) — все
   ячейки, все периоды и фильтры, включая корзины частоты и враждебный ввод.
2. ИТОГО тела == total pa_people (пользователи, просмотры, постоянные).
3. Строка отчёта каталога == KPI области pa_people при выборе этого отчёта.
4. Людская шина: корзина / группа из pa_people → ИТОГО тела совпадает с числом
   людей корзины / группы (клик в правой панели даёт ровно столько людей слева).
5. Каждый датасет читает дневной факт не больше одного раза (сканы ≤ 1,05).
6. Старый анализатор ClickHouse (enable_analyzer = 0, как может стоять на боевом 24)
   даёт те же строки, что новый.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stand

D = sys.argv[1]
f = lambda p: os.path.join(D, [x for x in os.listdir(D) if x.startswith(p)][0])
BODY, FALL, PPL = f('2. '), f('2b. '), f('3. ')
run = lambda p, c: stand.stat(stand.render(p, c))
key = lambda r: (r['section'], r['dashboard_id'], r['group_key'], r['group_val'])
bad = 0


def ok(cond, msg):
    global bad
    print(('OK   ' if cond else 'FAIL ') + msg)
    bad += 0 if cond else 1


CASES = [{}, {'period_param': 'w'}, {'period_param': 'm'}, {'period_param': 'q'},
         {'pub_f': '0', 'act_f': '0', 'exc_f': '0'}, {'lvl3_f': ['Блок 3'], 'lvl4_f': ['Деп 5.0']},
         {'adg_f': ['ADG7', 'ALL']}, {'login_f': ['u1', 'u2']}, {'freq_f': ['4', '5']},
         {'freq_f': ['1'], 'period_param': 'w', 'spec_f': ['Спец 3']},
         {'stream_f': ["x'); DROP TABLE t;--"]}, {'lvl3_f': ['a\\b']}]
for c in CASES:
    a, _, _, xa = run(BODY, c)
    b, _, _, xb = run(FALL, c)
    A = {key(r): r for r in a}; B = {key(r): r for r in b}
    ok(A.keys() == B.keys() and all(A[k] == B[k] for k in A), f'тело == запасное {c}  (сканы факта: {xb})')
for g in ['d', 'w', 'm', 'q']:
    t = [r for r in run(BODY, {'period_param': g})[0] if r['section'] == 'total'][0]
    p, _, _, xp = run(PPL, {'period_param': g})
    pt = [r for r in p if r['section'] == 'total'][0]
    ok((t['users'], t['views'], t['regular_users']) == (pt['users'], pt['views'], pt['regular']),
       f'ИТОГО тела == total pa_people [{g}]  (pa_people сканов: {xp})')
    ok(xp <= 1.05, f'pa_people читает факт один раз [{g}]')
cube = run(BODY, {})[0]
for r in [x for x in cube if x['section'] == 'rep'][:5]:
    pt = [x for x in run(PPL, {'mode_param': 'report', 'sel_f': [str(r['dashboard_id'])]})[0] if x['section'] == 'total'][0]
    ok((r['users'], r['views'], r['regular_users']) == (pt['users'], pt['views'], pt['regular']), f'отчёт {r["dashboard_id"]}: строка каталога == KPI области')
p = run(PPL, {})[0]
for r in [x for x in p if x['section'] == 'freq']:
    t = [x for x in run(BODY, {'freq_f': [r['k']]})[0] if x['section'] == 'total']
    ok(str(t[0]['users'] if t else 0) == str(r['users']), f'корзина {r["k"]}: людей {r["users"]} → ИТОГО тела')
for g, col in [('lvl3', 'lvl3_f'), ('spec', 'spec_f'), ('adg', 'adg_f'), ('stream', 'stream_f')]:
    for r in [x for x in p if x['section'] == 'ctx' and x['g'] == g][:3]:
        t = [x for x in run(BODY, {col: [r['k']]})[0] if x['section'] == 'total'][0]
        ok(str(t['users']) == str(r['users']), f'группа {g}={r["k"]}: людей {r["users"]} → ИТОГО тела {t["users"]}')
import json
norm = lambda rows: sorted(json.dumps(r, sort_keys=True, ensure_ascii=False) for r in rows)
for pth in [BODY, FALL, PPL]:
    for c in [{}, {'period_param': 'q'}, {'mode_param': 'collection', 'sel_f': ['Колл 5', 'Колл 7']}, {'freq_f': ['2'], 'login_f': ['u3']}]:
        sql = stand.render(pth, c)
        a = json.loads(stand.S.query(sql, 'JSON').bytes())['data']
        b = json.loads(stand.S.query(sql + '\nSETTINGS enable_analyzer = 0', 'JSON').bytes())['data']
        ok(norm(a) == norm(b), f'старый анализатор == новый: {os.path.basename(pth)[:24]} {c}')
print('\nИТОГ:', 'всё сходится' if not bad else f'{bad} расхождений')
sys.exit(1 if bad else 0)
