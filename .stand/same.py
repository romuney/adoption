"""Ответ в ответ: прежняя версия SQL датасета (git, по умолчанию HEAD) и текущая — на одной базе стенда, по матрице
фильтров борда (период × переключатели × выбор каталога × ЦА × группа «Аудитории» × людская шина × сегмент × свой период).
Переписал SQL (витрины GP вместо расчёта на клике) — ответ не должен измениться ни в одной строке.

    python3 .stand/same.py [one|cat|head ...] [--rev <git-ревизия>] [--quick] [--modes]
--modes — новый SQL ещё и в режимах ClickHouse боя (старый анализатор, prefer_column_name_to_alias, join_use_nulls).
Строки внутри k сравниваются без учёта порядка (groupArray у ClickHouse порядка не держит), остальное — точно.
"""
import os, sys, json, subprocess, itertools, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stand, hidesql

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = {'one': 'Виджеты/pa-one.data.sql', 'cat': 'Виджеты/pa-reports-body.data.sql', 'head': 'Виджеты/pa-head.data.sql'}


BASE = '167c2ed'   # последний коммит ДО витрин GP (рабочая версия у владельца) — с ним сравнивается текущий SQL


def src_of(rel, rev=None):
    t = subprocess.run(['git', '-C', ROOT, 'show', f'{rev}:{rel}'], capture_output=True, text=True, check=True).stdout if rev else open(os.path.join(ROOT, rel), encoding='utf-8').read()
    if 'reports-body' in rel:   # в поставку каталог едет с вкладкой «Аудитория»
        t = t.replace('{% set WITH_CA = false %}', '{% set WITH_CA = true %}')
    return t


def norm(rows):
    out = []
    for r in rows:
        k = r['k']
        out.append((r['section'], r['g'], '\n'.join(sorted(k.split('\n'))) if '\n' in k else k, r['parent'], int(r['n'])))
    return sorted(out)


# режимы ClickHouse боя: новый ответ обязан совпасть с прежним в каждом (старый анализатор — на нём падали лямбды над
# Nullable-колонками после LEFT JOIN; prefer_column_name_to_alias = 1 — так стоит на бою; join_use_nulls = 1)
MODES = {'': '', 'старый анализатор': 'allow_experimental_analyzer = 0', 'prefer_column_name_to_alias': 'prefer_column_name_to_alias = 1',
         'join_use_nulls': 'join_use_nulls = 1'}


def run(t, f, mode=''):
    q = hidesql.render(hidesql.hide_template(t)[0], dict(f))
    if MODES.get(mode):
        q += '\nSETTINGS ' + MODES[mode]
    t0 = time.perf_counter()
    d = json.loads(stand.S.query(q, 'JSON').bytes())['data']
    return norm(d), time.perf_counter() - t0


def top_ids(n=3):
    d = json.loads(stand.S.query("SELECT dashboard_id FROM prod_proteus.pa_pair p WHERE dashboard_id IN (SELECT dashboard_id FROM prod_proteus.pa_dash_meta "
                                 "WHERE published = 1 AND actual_flg = 1) GROUP BY dashboard_id ORDER BY count() DESC LIMIT %d" % n, 'JSON').bytes())['data']
    return [str(r['dashboard_id']) for r in d]


def one_of(sql):
    d = json.loads(stand.S.query(sql, 'JSONCompact').bytes())['data']
    return d[0][0] if d else ''


def matrix(kind, quick=False):
    t1, t2, t3 = top_ids()
    owner = one_of("SELECT owner_login FROM prod_proteus.pa_dash_meta WHERE dashboard_id = %s" % t1)
    coll = one_of("SELECT arrayJoin(collection_names) FROM prod_proteus.pa_dash_meta WHERE notEmpty(collection_names) LIMIT 1")
    spec = one_of("SELECT emp_specialization_desc FROM prod_proteus.pa_staff GROUP BY 1 ORDER BY count() DESC LIMIT 1")
    org = one_of("SELECT lvl3_management_unit_nm FROM prod_proteus.pa_staff WHERE lvl3_management_unit_nm != '' GROUP BY 1 ORDER BY count() DESC LIMIT 1")
    org2 = one_of("SELECT concat(lvl3_management_unit_nm, ' › ', lvl4_management_unit_nm) FROM prod_proteus.pa_staff WHERE lvl4_management_unit_nm != '' GROUP BY 1 ORDER BY count() DESC LIMIT 1")
    adg = one_of("SELECT ad_group FROM prod_proteus.pa_adg_size ORDER BY n LIMIT 1")
    lg = one_of("SELECT login FROM prod_proteus.pa_pair WHERE dashboard_id = %s ORDER BY v_life DESC LIMIT 1" % t1)
    md = one_of("SELECT toString(toDate(max(dmax))) FROM prod_proteus.pa_pair")
    periods = [{}, {'period_param': 'w'}, {'period_param': 'm'}, {'period_param': 'q'},
               {'period_param': f'c|{md}|w|10'}, {'period_param': f'c|{md}|d|45'}, {'period_param': f'c|{md}|d|120'}]
    # все 8 сочетаний «Опубликованные × Актуальные × Без владельцев» (у витрин каталога — свои колонки на каждое)
    toggles = [{k: ['0'] for k, on in zip(['pub_f', 'act_f', 'exc_f'], (c & 1, c & 2, c & 4)) if on} for c in range(8)]
    if quick:
        toggles = [toggles[i] for i in (0, 1, 6, 7)]
    cas = [{}, {'ca_it_f': ['IT'], 'ca_head_f': '1'}, {'ca_spec_f': [spec]}, {'ca_org_f': [org]}, {'ca_adg_f': [adg]}, {'ca_head_f': 'n', 'ca_hq_f': ['HQ']}]
    out = []
    if kind == 'head':
        return [('шапка', {})]
    if kind == 'one':
        sels = [{}, {'mode_param': 'report', 'sel_f': [t1]}, {'mode_param': 'report', 'sel_f': [t1, t2]}, {'mode_param': 'report', 'sel_f': ['999999']},
                {'mode_param': 'owner', 'sel_f': [owner]}, {'mode_param': 'collection', 'sel_f': [coll]},
                {'mode_param': 'cut:spec', 'sel_f': [spec]}, {'mode_param': 'cut:lvl3', 'sel_f': [org]}]
        auds = [{'aud_spec_f': [spec]}, {'aud_org_f': [org2], 'aud_head_f': ['1']}]
        for s_ in sels:
            for c in (cas[:2] if quick else cas):
                out.append(('выбор×ЦА', {**s_, **c}))
        for a in auds:
            for s_ in sels[:3]:
                out.append(('группа «Аудитории»', {**s_, **a}))
        for p in (periods[:3] if quick else periods):
            for tg in toggles:
                out.append(('период×переключатели', {**p, **tg}))
            for x in [sels[1], cas[1], sels[2]]:
                out.append(('период×выбор', {**p, **x}))
        for tg in toggles[1:]:
            for x in [sels[1], sels[4], cas[1], {**sels[1], **cas[2]}]:
                out.append(('переключатели×выбор', {**tg, **x}))
    if kind == 'cat':
        bus = [{}, {'lvl3_f': [org]}, {'spec_f': [spec], 'heads_f': ['1']}, {'org_f': [org2]}, {'login_f': [lg]}, {'exl_f': [lg]},
               {'freq_f': ['1', '4']}, {'seg_f': ['reach']}, {'seg_f': ['out']}, {'seg_f': ['never']}, {'adg_f': ['ADG1']}]
        for b in bus:
            for c in (cas[:2] if quick else cas):
                out.append(('шина×ЦА', {**b, **c}))
        for p in (periods[:3] if quick else periods):
            for tg in toggles:
                out.append(('период×переключатели', {**p, **tg}))
            for x in [cas[1], bus[2], bus[7]]:
                out.append(('период×шина/ЦА', {**p, **x}))
        out.append(('мой логин', {'cat_sync_f': ['r=1']}))
    return out


def main():
    a = sys.argv[1:]
    rev = a[a.index('--rev') + 1] if '--rev' in a else BASE
    quick = '--quick' in a
    kinds = [k for k in a if k in FILES] or ['head', 'cat', 'one']
    bad = 0
    total = 0
    for kind in kinds:
        old, new = src_of(FILES[kind], rev), src_of(FILES[kind])
        to = tn = 0
        cases = matrix(kind, quick)
        for name, f in cases:
            total += 1
            try:
                ra, ta = run(old, f)
            except Exception as e:
                ra, ta = 'ERR ' + str(e)[:200], 0
            try:
                rb, tb = run(new, f)
            except Exception as e:
                rb, tb = 'ERR ' + str(e)[:300], 0
            to += ta; tn += tb
            if ra == rb and '--modes' in a and not isinstance(ra, str):
                for m in list(MODES)[1:]:
                    try:
                        rm, _ = run(new, f, m)
                    except Exception as e:
                        rm = 'ERR ' + str(e)[:300]
                    if rm != ra:
                        bad += 1
                        print(f'FAIL {kind} {name} [{m}] {json.dumps(f, ensure_ascii=False)}: ' + (rm if isinstance(rm, str) else 'другой ответ'))
            if ra != rb:
                bad += 1
                print(f'FAIL {kind} {name} {json.dumps(f, ensure_ascii=False)}')
                if isinstance(ra, str) or isinstance(rb, str):
                    print('     было:', ra if isinstance(ra, str) else 'ok', '\n     стало:', rb if isinstance(rb, str) else 'ok')
                else:
                    sa, sb = set(ra), set(rb)
                    for x in sorted(sa - sb)[:2]:
                        print('     было :', str(x)[:300])
                    for x in sorted(sb - sa)[:2]:
                        print('     стало:', str(x)[:300])
        print(f'{kind}: {len(cases)} наборов, ClickHouse {to:.1f} с → {tn:.1f} с')
    print('ИТОГ:', f'{total} наборов, все ответы совпали' if not bad else f'{bad} расхождений из {total}')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
