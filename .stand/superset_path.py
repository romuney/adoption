"""Путь Superset 2.1 (Proteus) над SQL датасета: сколько секунд уходит на разбор текста до ClickHouse (2026-10-22).

    <venv chdb 2.1.1 + sqlparse 0.4.4>/bin/python .stand/superset_path.py [шаблон.sql] ['{"mode_param": "report", "sel_f": ["2"]}']
    без аргументов — панель, каталог, шапка на типовых фильтрах

Шаги — как HRBP_HUB/stand/superset.py (superset/connectors/sqla/models.py 2.1): format(strip_comments), split, parse,
is_select (format + parse), обёртка SELECT … FROM (датасет) AS virtual_table и format(reindent=True), parse_sql (get_df).
reindent растёт КВАДРАТИЧНО от длины текста (панель, 22.10: ¼ текста — 0,31 с, весь 23 КБ — 3,7 с): сократить текст
вдвое — этот шаг вчетверо быстрее. Пробелы почти не влияют (−0…15 %), влияют токены и скобки.
POST /chart/data делает шаги до reindent (ключ кеша), воркер — всё; на бою 22.10 POST шёл 0,4–1,3 с (≈ как здесь).
"""
import sys, os, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import re, time, sqlparse
_PATCH_RX = r"'(''|\\\\|\\|[^'])*'"


def lexer_patch():
    kw = sqlparse.keywords
    if hasattr(kw, 'FLAGS'):
        first = kw.SQL_REGEX[0][0]
        if getattr(getattr(first, '__self__', None), 'pattern', None) != _PATCH_RX:
            kw.SQL_REGEX.insert(0, (re.compile(_PATCH_RX, kw.FLAGS).match, sqlparse.tokens.String.Single))
        return
    lex = sqlparse.lexer.Lexer
    rx = kw.SQL_REGEX
    if not any(isinstance(r, str) and r == _PATCH_RX for r, _ in rx[:40]):
        rx.insert(25, (_PATCH_RX, sqlparse.tokens.String.Single))
        lex.get_default_instance().set_SQL_REGEX(rx)


lexer_patch()

# Враждебные значения (набор SP-11 гайда, kit/superset201.py HOSTILE_FULL): апостроф, «]», комментарии,
# слэш в конце, «;», управляющие, 3000 знаков. Тире chdb портит в тексте запроса — его здесь нет.
HOSTILE = ["O'Brien; x", 'a]b', 'x -- y', 'x // y', '# x', 'a\\', 'a;b', 'Отдел «Альфа» 1',
           '[a', 'x /* y', 'y */ z', '`b`', "O\\'K", 'a\tb\x01c', 'Ж' * 3000]
CARRIERS = ['unit_f', 'paint_f', 'it_f', 'stream_f', 'spec_f', 'staff_f', 'hct_f', 'tr_f']


def tm(f, *a, **k):
    t = time.perf_counter()
    r = f(*a, **k)
    return r, time.perf_counter() - t


def superset_steps(rendered, cols, limit=50000):
    """→ (SQL, который уйдёт в ClickHouse; {шаг: секунды}) — как Superset 2.1."""
    st = {}
    sql, st['format(strip_comments)'] = tm(sqlparse.format, rendered.strip('\t\r\n; '), strip_comments=True)
    parts, st['split'] = tm(sqlparse.split, sql)
    assert len(parts) == 1, 'Superset: «Virtual dataset query cannot consist of multiple statements»'
    parsed, st['parse (ParsedQuery)'] = tm(sqlparse.parse, sql.strip(' \t\n;'))
    sc, st['format (is_select)'] = tm(sqlparse.format, sql.strip(' \t\n;'), strip_comments=True)
    p2, st['parse (is_select)'] = tm(sqlparse.parse, sc)
    assert p2[0].get_type() == 'SELECT', 'Superset: «Virtual dataset query must be read-only»'
    wrapped = 'SELECT %s \nFROM (%s) AS virtual_table \n LIMIT %d' % (', '.join(cols), sql, limit)
    final, st['format(reindent) обёртки'] = tm(sqlparse.format, wrapped, reindent=True)
    _, st['parse_sql (get_df)'] = tm(sqlparse.parse, final)
    return final, st




def main():
    import stand
    lexer_patch()
    W = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'Виджеты')
    if len(sys.argv) > 1:
        cases = [(sys.argv[1], json.loads(sys.argv[2]) if len(sys.argv) > 2 else {})]
    else:
        cases = [(os.path.join(W, 'pa-one.data.sql'), f) for f in [{}, {'mode_param': 'report', 'sel_f': ['2']}, {'ca_spec_f': ['Спец 1']}]] + \
                [(os.path.join(W, 'pa-reports-body.data.sql'), {}), (os.path.join(W, 'pa-head.data.sql'), {})]
    for tpl, f in cases:
        sql = stand.render(tpl, f)
        t = time.perf_counter(); _, st = superset_steps(sql, ['section', 'g', 'k', 'parent', 'n']); el = time.perf_counter() - t
        print('%-26s %-38s %5.1f КБ  скобок %4d  путь %.2f с (reindent %.2f, parse_sql %.2f)' % (
            os.path.basename(tpl), json.dumps(f, ensure_ascii=False)[:38], len(sql) / 1e3, sql.count('('), el,
            st['format(reindent) обёртки'], st['parse_sql (get_df)']))


if __name__ == '__main__':
    main()
