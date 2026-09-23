"""Регресс SQL v7 на стенде: инварианты сходимости чисел между датасетами.

    python3 .stand/check_v7.py <папка поставки v7>

1. Тело на pa_pair (файл 2) == запасное тело на дневном факте (файл 2b) — все
   ячейки, все периоды и фильтры, включая корзины частоты и враждебный ввод.
2. ИТОГО тела == total pa_people (пользователи, просмотры, постоянные).
3. Строка отчёта каталога == KPI области pa_people при выборе этого отчёта.
4. Людская шина: корзина / группа из pa_people → ИТОГО тела совпадает с числом
   людей корзины / группы (клик в правой панели даёт ровно столько людей слева).
5. Каждый датасет читает дневной факт не больше одного раза (сканы ≤ 1,05).
6. Шапка pa_kpi (файл 4): без людской шины == total pa_people по всем KPI; без
   области == ИТОГО тела; «один отчёт» + шина == строка отчёта в каталоге.
7. Старый анализатор ClickHouse (enable_analyzer = 0, как может стоять на боевом 24)
   даёт те же строки, что новый.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stand

D = sys.argv[1]
f = lambda p: os.path.join(D, [x for x in os.listdir(D) if x.startswith(p)][0])
BODY, FALL, PPL, KPI = f('2. '), f('2b. '), f('3. '), f('4. ')
run = lambda p, c: stand.stat(stand.render(p, c))
key = lambda r: (r['section'], r['dashboard_id'], r['group_key'], r['group_val'])
bad = 0


def ok(cond, msg):
    global bad
    print(('OK   ' if cond else 'FAIL ') + msg)
    bad += 0 if cond else 1


CASES = [{}, {'period_param': 'w'}, {'period_param': 'm'}, {'period_param': 'q'},
         {'pub_f': '0', 'act_f': '0', 'exc_f': '0'}, {'lvl3_f': ['Блок 3'], 'lvl4_f': ['Деп 5.0']},
         {'adg_f': ['ADG7', 'ALL']}, {'login_f': ['u1', 'u2']}, {'exl_f': ['u1', 'u2', 'u5']}, {'freq_f': ['4', '5'], 'exl_f': ['u7']},
         {'heads_f': '1', 'freq_f': ['5']}, {'heads_f': 'n', 'exl_f': ['u2']}, {'freq_f': ['4', '5']},
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
KC = ['users', 'users_prev', 'views', 'views_prev', 'new_u', 'new_prev', 'regular', 'regular_prev', 'sleeping', 'mau', 'mau_prev']
for c in [{}, {'period_param': 'w'}, {'period_param': 'm'}, {'period_param': 'q'}, {'pub_f': '0', 'act_f': '0', 'exc_f': '0'},
          {'mode_param': 'collection', 'sel_f': ['Колл 5', 'Колл 7']}, {'mode_param': 'owner', 'sel_f': sorted({x['owner_login'] for x in cube if x['section'] == 'rep' and x['owner_login']})[:2]},
          {'mode_param': 'report', 'sel_f': [str(x['dashboard_id']) for x in cube if x['section'] == 'rep'][:3]}]:
    k, _, _, xk = run(KPI, c)
    pt = [x for x in run(PPL, c)[0] if x['section'] == 'total'][0]
    ok(len(k) == 1 and all(str(k[0][x]) == str(pt[x]) for x in KC), f'pa_kpi == total pa_people {c}  (сканы факта: {xk})')
    ok(xk == 0 or xk <= 1.05, f'pa_kpi не читает дневной факт {c}')
for c in [{'freq_f': ['4', '5']}, {'lvl3_f': ['Блок 3']}, {'adg_f': ['ADG7']}, {'login_f': ['u1', 'u2', 'u3']}, {'heads_f': '1'}, {'exl_f': ['u1', 'u2']}, {'heads_f': '1', 'exl_f': ['u3'], 'freq_f': ['3']}, {'heads_f': 'n'}]:
    k = run(KPI, c)[0][0]
    t = [x for x in run(BODY, c)[0] if x['section'] == 'total']
    tv = t[0] if t else {'users': 0, 'views': 0, 'regular_users': 0}
    ok((str(k['users']), str(k['views']), str(k['regular'])) == (str(tv['users']), str(tv['views']), str(tv['regular_users'])), f'pa_kpi с шиной == ИТОГО тела {c}')
for r in [x for x in run(BODY, {'lvl3_f': ['Блок 3']})[0] if x['section'] == 'rep'][:3]:
    k = run(KPI, {'lvl3_f': ['Блок 3'], 'mode_param': 'report', 'sel_f': [str(r['dashboard_id'])]})[0][0]
    ok((str(k['users']), str(k['views'])) == (str(r['users']), str(r['views'])), f'pa_kpi отчёт {r["dashboard_id"]} + шина == строка каталога')
# Исключение логинов: ИТОГО тела падает ровно на вклад исключённых (их строки list в pa_people).
ex = [x for x in run(PPL, {})[0] if x['section'] == 'list'][:3]
exl = [x['login'] for x in ex]
t0 = [x for x in run(BODY, {})[0] if x['section'] == 'total'][0]
t1 = [x for x in run(BODY, {'exl_f': exl})[0] if x['section'] == 'total'][0]
act = [x for x in ex if int(x['views'] or 0) > 0]
ok(int(t0['users']) - int(t1['users']) == len(act) and int(t0['views']) - int(t1['views']) == sum(int(x['views']) for x in ex),
   f'exl_f {exl}: ИТОГО тела −{len(act)} чел., −{sum(int(x["views"]) for x in ex)} просм.')
# Руководители и остальные делят людей без пересечения и не теряют никого с атрибутами.
k1, kn, kt = (run(KPI, c)[0][0] for c in [{'heads_f': '1'}, {'heads_f': 'n'}, {}])
na = int(str(stand.S.query("SELECT uniqExact(login) FROM prod_proteus.pa_pair WHERE bitAnd(msk_d, 1073741823) != 0 AND ifNull(own_flg, 0) = 0 AND dashboard_id IN (SELECT dashboard_id FROM prod_proteus.pa_dash_meta WHERE published = 1 AND actual_flg = 1) AND login NOT IN (SELECT login FROM prod_proteus.pa_emp_attrs)", 'CSV')).strip())
ok(int(k1['users']) + int(kn['users']) + na == int(kt['users']), f'руководители {k1["users"]} + остальные {kn["users"]} + без атрибутов {na} == все {kt["users"]}')
import json
norm = lambda rows: sorted(json.dumps(r, sort_keys=True, ensure_ascii=False) for r in rows)
for pth in [BODY, FALL, PPL, KPI]:
    for c in [{}, {'period_param': 'q'}, {'mode_param': 'collection', 'sel_f': ['Колл 5', 'Колл 7']}, {'freq_f': ['2'], 'login_f': ['u3']}, {'exl_f': ['u1'], 'heads_f': '1'}]:
        sql = stand.render(pth, c)
        a = json.loads(stand.S.query(sql, 'JSON').bytes())['data']
        b = json.loads(stand.S.query(sql + '\nSETTINGS enable_analyzer = 0', 'JSON').bytes())['data']
        ok(norm(a) == norm(b), f'старый анализатор == новый: {os.path.basename(pth)[:24]} {c}')
print('\nИТОГ:', 'всё сходится' if not bad else f'{bad} расхождений')
sys.exit(1 if bad else 0)
