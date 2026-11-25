"""SQL датасетов PA NEXT для кластерного ClickHouse 25.8 (CHaaS: 6 шардов, Distributed, distributed_product_mode='global').

На кластере каждый «x IN (SELECT …)» по распределённой таблице сервер превращает в GLOBAL IN: подзапрос считается
отдельно и его множество рассылается на все шарды. В PA NEXT таких мест десятки (CTE подставляются заново на каждую
ссылку). Цена — секунды (панель: 16,75 c → 8,56 c на бою, замер 25.11), плюс ошибка «Invalid local IN function name
globalIn», если в одном IN-подзапросе две распределённые таблицы на одном уровне (UNION ALL; buildQueryTreeForShard.cpp).

Перепись (логика та же — принадлежность множеству):
    x IN (SELECT cols FROM rest)  →  x IN (SELECT arrayJoin((SELECT groupArray(__x) FROM (SELECT tuple(cols) AS __x FROM rest))))
Скалярный подзапрос считается один раз на инициаторе и уезжает на шарды значением; множество строится на шарде из
константы, IN-подзапрос без таблиц сервер не переписывает. Равенство ответов — регресс по матрице фильтров
(tools/parallel/verify_cluster.py), а не этот комментарий.
"""
import re, sys


def match_paren(s, i):
    d = 0; q = None
    j = i
    while j < len(s):
        ch = s[j]
        if q:
            if ch == q and s[j - 1] != '\\':
                if j + 1 < len(s) and s[j + 1] == q:
                    j += 2; continue
                q = None
        elif ch in "'`\"":
            q = ch
        elif ch == '(':
            d += 1
        elif ch == ')':
            d -= 1
            if d == 0:
                return j
        j += 1
    raise ValueError('unbalanced')


def split_top(s, sep_re):
    """позиции sep_re на верхнем уровне скобок"""
    d = 0; q = None; out = []
    for m in re.finditer(r"[()'`]|" + sep_re, s, re.I):
        t = m.group(0)
        if q:
            if t == q: q = None
            continue
        if t in "'`": q = t
        elif t == '(': d += 1
        elif t == ')': d -= 1
        elif d == 0: out.append(m)
    return out


def strip_alias(c):
    return re.sub(r'\s+AS\s+[A-Za-z_][A-Za-z0-9_]*\s*$', '', c.strip(), flags=re.I)


# IN-подзапросы, которые в шаблоне подставляются Jinja-выражением (текст SELECT появляется только при рендере).
# Все — одна колонка (проверено по определениям: CSET, DMETA, dsub, accset/curset/caset). Явный список + проверка,
# что других «IN ({{ … }})» в шаблоне нет: новое место должно попасть сюда осознанно.
JINJA_SETS = ['CSET', 'DMETA', 'dsub', 'accset()', 'curset()', 'caset()']
JINJA_LITERAL = ["repids|join(', ') if repids else '0'"]     # список чисел, не подзапрос


def rewrite_jinja_in(sql):
    n = 0
    for name in JINJA_SETS:
        pat = re.compile(r'(?<![A-Za-z_])((?:NOT\s+)?IN)\s*\(\{\{ ' + re.escape(name) + r' \}\}\)', re.I)
        sql, k = pat.subn(lambda m: m.group(1) + ' (SELECT arrayJoin((SELECT groupArray(*) FROM ({{ ' + name + ' }}))))', sql)
        n += k
    left = [m.group(1) for m in re.finditer(r'IN\s*\(\{\{ (.*?) \}\}\)', sql) if m.group(1) not in JINJA_LITERAL]
    if left:
        raise ValueError('IN ({{ … }}) без переписи: ' + ', '.join(sorted(set(left))) + ' — добавить в JINJA_SETS (если подзапрос из одной колонки)')
    return sql, n


def rewrite_in(sql):
    sql, nj = rewrite_jinja_in(sql)
    sql, ns = rewrite_select_in(sql)
    return sql, nj + ns


def rewrite_select_in(sql):
    n = 0
    pos = 0
    while True:
        m = re.compile(r'(?<!GLOBAL )(?<![A-Za-z_])((?:NOT\s+)?IN)\s*\(\s*SELECT\b', re.I).search(sql, pos)
        if not m:
            break
        op = sql.index('(', m.start(1))
        cl = match_paren(sql, op)
        inner = sql[op + 1:cl].strip()
        body = inner[len('SELECT'):]
        froms = split_top(body, r'\bFROM\b')
        if not froms or re.match(r'\s*arrayJoin\(\(SELECT groupArray', body):
            pos = cl; continue
        cols = body[:froms[0].start()]
        rest = body[froms[0].start():]
        parts = [strip_alias(cols[a:b]) for a, b in zip([0] + [x.end() for x in split_top(cols, ',')],
                                                          [x.start() for x in split_top(cols, ',')] + [len(cols)])]
        tup = parts[0] if len(parts) == 1 else 'tuple(' + ', '.join(parts) + ')'
        new = f'(SELECT arrayJoin((SELECT groupArray(__x) FROM (SELECT {tup} AS __x {rest}))))'
        sql = sql[:op] + new + sql[cl + 1:]
        n += 1
        pos = op + len('(SELECT arrayJoin((SELECT groupArray(__x) FROM (SELECT ')
    return sql, n


