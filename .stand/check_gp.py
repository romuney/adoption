"""Регресс витрин ускорения (часть 3 файла 1): каждая колонка, посчитанная в GP (PostgreSQL стенда), == тому, что
датасеты листа считают сами в ClickHouse (те же выражения: ou, cz, cd, accset, календарь из подневного факта).

    python3 .stand/check_gp.py [--build]     # --build — сначала прогнать параграфы (gp.py)
Плюс враждебные строки: компактная кириллица (cz) и правило «уровень из одних знаков — пусто» (ou) в PG == в CH.
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stand, gp

S = stand.S
FAIL = []


def ok(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg)
    if not cond:
        FAIL.append(msg)


def rows(sql):
    return json.loads(S.query(sql, 'JSONCompact').bytes())['data']


CYR = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя'
TGT = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%'
CZRX = "concat('(', char(91), 'А-Яа-яЁё', char(93), char(91), 'А-Яа-яЁё ', char(93), '*)')"


def cz(x):   # как макрос cz датасетов
    return (f"translateUTF8(replaceRegexpAll(replaceAll(replaceAll(replaceAll(replaceAll(translate({x}, '\\t\\n\\r', '   '), '~', '~~'), "
            f"'|', '~p'), '^', '~c'), '`', '~b'), {CZRX}, '`\\\\1`'), '{CYR}', '{TGT}')")


def fx(x):
    return f"translate({x}, '|\\t\\n\\r', '    ')"


def ou(x):
    return f"if(match(toString(ifNull({x}, '')), '^(?:\\\\s|\\\\p{{P}})*$'), '', toString(ifNull({x}, '')))"


DZ = """(SELECT tuple(arraySort(groupUniqArrayIf(dv, dg = 'spec')), arraySort(groupUniqArrayIf(dv, dg = 'stream')), arraySort(groupUniqArrayIf(dv, dg = 'exp')),
      arraySort(groupUniqArrayIf(dv, dg = 'hq')), arraySort(groupUniqArrayIf(dv, dg = 'it')))
    FROM (SELECT dd.1 AS dg, dd.2 AS dv FROM (
      SELECT arrayJoin(array(('spec', toString(ifNull(emp_specialization_desc, ''))), ('stream', toString(ifNull(emp_stream_desc, ''))),
        ('exp', toString(ifNull(exp_nm, ''))), ('hq', toString(ifNull(hq_code, ''))), ('it', toString(ifNull(it_code, ''))))) AS dd FROM prod_proteus.pa_staff
      UNION ALL
      SELECT arrayJoin(array(('spec', toString(ifNull(emp_specialization_desc, ''))), ('stream', toString(ifNull(emp_stream_desc, ''))),
        ('exp', toString(ifNull(exp_nm, ''))))) AS dd FROM prod_proteus.pa_emp_attrs
      UNION ALL
      SELECT arrayJoin(array(('spec', ''), ('stream', ''), ('exp', ''), ('hq', ''), ('it', ''))) AS dd)))"""
DI = {'spec': 1, 'stream': 2, 'exp': 3, 'hq': 4, 'it': 5}


def cd(g, x):
    return f"toString(transform({x}, tupleElement({DZ}, {DI[g]}), arrayEnumerate(tupleElement({DZ}, {DI[g]})), toUInt32(0)))"


def accset(pub, act):   # как accset панели при области «весь Proteus»
    dok = "SELECT dashboard_id FROM prod_proteus.pa_dash_meta WHERE 1=1" + (" AND published = 1" if pub else '') + (" AND actual_flg = 1" if act else '')
    return (f"SELECT principal FROM prod_proteus.pa_dash_acl WHERE kind = 'user' AND dashboard_id IN ({dok}) UNION ALL "
            f"SELECT m.login FROM prod_proteus.pa_adg_member m WHERE m.ad_group IN (SELECT principal FROM prod_proteus.pa_dash_acl "
            f"WHERE kind = 'group' AND dashboard_id IN ({dok}))")


def a4_expr(col):
    return ' + '.join(f"{b} * toUInt8({col} IN ({accset(p, a)}))" for b, p, a in [(1, 0, 0), (2, 1, 0), (4, 0, 1), (8, 1, 1)])


def same(name, a_sql, b_sql):
    a, b = rows(a_sql), rows(b_sql)
    sa, sb = set(map(lambda r: json.dumps(r, ensure_ascii=False), a)), set(map(lambda r: json.dumps(r, ensure_ascii=False), b))
    d1, d2 = list(sa - sb)[:3], list(sb - sa)[:3]
    ok(len(a) == len(b) and not d1, f'{name}: {len(a)} строк GP == {len(b)} строк расчёта ClickHouse' + ('' if not d1 else f'\n     GP: {d1}\n     CH: {d2}'))


def main():
    if '--build' in sys.argv:
        print(gp.run())
    # 1. дата свежести
    same('pa_md', "SELECT toString(assumeNotNull(md)), toString(assumeNotNull(ds)) FROM prod_proteus.pa_md",
         "SELECT toString(max(ifNull(md, dmax))), toString(min(dmin)) FROM prod_proteus.pa_pair")
    # 2. словарь: коды = номера в отсортированных массивах dicts панели
    same('pa_dict', "SELECT g, v, toInt64(code) FROM prod_proteus.pa_dict",
         f"SELECT x.1, arrayElement(x.2, i), toInt64(i) FROM (SELECT arrayJoin(array(('spec', z.1), ('stream', z.2), ('exp', z.3), ('hq', z.4), ('it', z.5))) AS x "
         f"FROM (SELECT {DZ} AS z)) ARRAY JOIN arrayEnumerate(x.2) AS i")
    # 3. зрители: всё, что pr панели берёт из штата, атрибутов и доступа
    lv = ', '.join(ou('a.' + c) for c in ['lvl3_management_unit_nm', 'lvl4_management_unit_nm', 'lvl5_management_unit_nm', 'lvl6_management_unit_nm', 'lvl7_management_unit_nm'])
    same('pa_viewer',
         "SELECT login, lg, toInt64(stf), toInt64(a4), lv, toInt64(ol), opath, spec, stream, toInt64(is_head), pl_a, pl_b FROM prod_proteus.pa_viewer",
         f"""SELECT login, lg, toInt64(stf), toInt64(a4), lv, toInt64(ol), arrayStringConcat(arraySlice(lv, 1, ol), ' › '), spec, stream, toInt64(is_head),
           concat({fx('login')}, '|', {cz("toString(ifNull(fio, ''))")}, '|', {cd('spec', 'spec')}, '|', {cd('stream', 'stream')}, '|', {cd('exp', "toString(ifNull(exp_nm, ''))")}),
           concat({cd('hq', 'hq')}, '|', {cd('it', 'it')})
         FROM (SELECT p.login AS login, lower(p.login) AS lg, toUInt8(ifNull(s.login, '') != '') AS stf, toString(ifNull(s.hq_code, '')) AS hq, toString(ifNull(s.it_code, '')) AS it,
             {a4_expr('lower(p.login)')} AS a4,
             array({lv}) AS lv, if(arrayFirstIndex(x -> x = '', lv) = 0, toUInt32(length(lv)), toUInt32(arrayFirstIndex(x -> x = '', lv) - 1)) AS ol,
             toString(ifNull(a.emp_specialization_desc, '')) AS spec, toString(ifNull(a.emp_stream_desc, '')) AS stream,
             toUInt8(ifNull(a.management_head_flg, 0) = 1) AS is_head, a.fio AS fio, a.exp_nm AS exp_nm
           FROM (SELECT DISTINCT login FROM prod_proteus.pa_pair WHERE isNotNull(login)) p
           LEFT JOIN prod_proteus.pa_staff s ON s.login = lower(p.login)
           LEFT JOIN prod_proteus.pa_emp_attrs a ON a.login = p.login)
         SETTINGS join_use_nulls = 1""")
    # 4. штат: sattrs панели + строки «не заходили» + доступ
    slv = ', '.join(ou('s.' + c) for c in ['lvl3_management_unit_nm', 'lvl4_management_unit_nm', 'lvl5_management_unit_nm', 'lvl6_management_unit_nm', 'lvl7_management_unit_nm'])
    same('pa_staffx',
         "SELECT login, toInt64(a4), slv, toInt64(sol), op, sp, st, hqc, itc, toInt64(hdf), n_a, toString(c_exp), hk FROM prod_proteus.pa_staffx",
         f"""SELECT lg, toInt64(a4), slv, toInt64(sol), arrayStringConcat(arraySlice(slv, 1, sol), ' › '), sp, st, hqc, itc, toInt64(hdf),
           concat({fx('lg')}, '|', {cz('sfio')}, '|', {cd('spec', 'sp')}, '|', {cd('stream', 'st')}, '|', toString(hdf), '|', {cd('hq', 'hqc')}, '|', {cd('it', 'itc')}),
           {cd('exp', 'sexp')}, concat({cd('spec', 'sp')}, '|', {cd('stream', 'st')}, '|', toString(hdf), '|', {cd('hq', 'hqc')}, '|', {cd('it', 'itc')})
         FROM (SELECT lower(toString(s.login)) AS lg, {a4_expr('lower(toString(s.login))')} AS a4,
             array({slv}) AS slv, if(arrayFirstIndex(x -> x = '', slv) = 0, toUInt32(5), toUInt32(arrayFirstIndex(x -> x = '', slv) - 1)) AS sol,
             toString(ifNull(s.emp_specialization_desc, '')) AS sp, toString(ifNull(s.emp_stream_desc, '')) AS st,
             toString(ifNull(s.hq_code, '')) AS hqc, toString(ifNull(s.it_code, '')) AS itc, toUInt8(ifNull(s.management_head_flg, 0) = 1) AS hdf,
             toString(ifNull(s.fio, '')) AS sfio, toString(ifNull(s.exp_nm, '')) AS sexp
           FROM prod_proteus.pa_staff s)""")
    # 5. календари по дням: как calf панели (uniqExact по логину, без пар владельцев)
    own = "(e.dashboard_id, e.login) NOT IN (SELECT dashboard_id, login FROM prod_proteus.pa_pair WHERE own_flg = 1)"
    same('pa_dash_day',
         "SELECT toInt64(dashboard_id), toString(toDate(dt)), toInt64(users), toInt64(users_nown), toInt64(views), toInt64(views_nown) FROM prod_proteus.pa_dash_day",
         f"""SELECT toInt64(e.dashboard_id), toString(toDate(e.log_dttm)), toInt64(uniqExact(e.login)), toInt64(uniqExactIf(e.login, {own})),
           toInt64(sum(e.views)), toInt64(sumIf(e.views, {own})) FROM prod_proteus.pa_evd_day e WHERE isNotNull(e.login) GROUP BY 1, 2""")
    same('pa_all_day',
         "SELECT toInt64(pub), toInt64(act), toString(toDate(dt)), toInt64(users), toInt64(users_nown), toInt64(views), toInt64(views_nown) FROM prod_proteus.pa_all_day",
         f"""SELECT toInt64(f.1), toInt64(f.2), toString(toDate(e.log_dttm)), toInt64(uniqExact(e.login)), toInt64(uniqExactIf(e.login, {own})),
           toInt64(sum(e.views)), toInt64(sumIf(e.views, {own}))
         FROM prod_proteus.pa_evd_day e INNER JOIN prod_proteus.pa_dash_meta m ON m.dashboard_id = e.dashboard_id
         ARRAY JOIN array((0, 0), (1, 0), (0, 1), (1, 1)) AS f
         WHERE isNotNull(e.login) AND (f.1 = 0 OR m.published = 1) AND (f.2 = 0 OR m.actual_flg = 1)
         GROUP BY 1, 2, 3""")
    # 6. враждебные строки: cz и правило «пусто» в PG == в CH
    H = ['', ' ', '-', '—', '–', '…', ' - ', '−', '-—…', '«»', '(—)', 'a', 'Иванов Иван', 'Ёлкин ёж', 'Отдел № 5', 'x|y', 'a~b', 'c^d', 'e`f',
         'таб\tперевод\nстрока\rконец', 'Smith Иван-Петров', "O'Brien Ольга", 'Ж|`~^', 'ЁёЁ', 'дом 5/7 кв. 3', '\\back\\slash', '§', '¶ ¶', '!!!', '+', '$',
         'Ж ж Ж', 'кириллица   с пробелами  ', '   ведущие', 'Ъ ъ Ь ь']
    pg_vals = ',\n'.join("(%d, E'%s')" % (i, h.replace('\\', '\\\\').replace("'", "\\'").replace('\t', '\\t').replace('\n', '\\n').replace('\r', '\\r')) for i, h in enumerate(H))
    par = gp.paragraphs()
    vw = par['pa_viewer']
    pu = vw[vw.index('pu as ('):vw.index('\n),', vw.index('pu as (')) + 2]
    czpg = vw[vw.index("|| '|' || translate(regexp_replace") + 10:vw.index(" || '|' || ds.code")]
    czpg = czpg.replace('o.fio', 'h.x')
    out = gp.psql(f"WITH {pu} SELECT h.i || chr(31) || {czpg} || chr(31) || (case when h.x ~ pu.re then 1 else 0 end) "
                  f"FROM (VALUES {pg_vals}) h(i, x) CROSS JOIN pu ORDER BY h.i")
    pgr = {int(l.split('\x1f')[0]): l.split('\x1f')[1:] for l in out.split('\n') if l}
    # байтами (unhex): chdb 2.1.1 на стенде меняет «—» в ТЕКСТЕ запроса на «--» ещё до ClickHouse
    ch_vals = ', '.join("(%d, unhex('%s'))" % (i, h.encode('utf-8').hex()) for i, h in enumerate(H))
    chr_ = rows(f"SELECT t.1, {cz('t.2')}, toString(toUInt8(match(t.2, '^(?:\\\\s|\\\\p{{P}})*$'))) FROM (SELECT arrayJoin(array({ch_vals})) AS t) ORDER BY t.1")
    bad = [(H[r[0]], r[1:], pgr.get(r[0])) for r in chr_ if [r[1], r[2]] != pgr.get(r[0])]
    ok(not bad and len(chr_) == len(H), f'враждебные строки ({len(H)}): cz и «пустой уровень» в PG == в CH' + ('' if not bad else f'\n     {bad[:4]}'))
    print('\nИТОГ:', 'всё сходится' if not FAIL else f'{len(FAIL)} расхождений')
    sys.exit(1 if FAIL else 0)


if __name__ == '__main__':
    main()
