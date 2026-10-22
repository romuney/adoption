"""Сборка SQL датасета под разбор Superset 2.1: выражения списка SELECT — в «[…][1]» (2026-10-22).

Зачем. Путь Superset над текстом датасета (format, parse, обёртка + reindent, parse_sql — .stand/superset_path.py)
на панели занимал 6–9 с: reindent sqlparse на каждой скобке и каждом списке через запятую пересобирает текст от начала
запроса (_get_offset → _flatten_up_to_token), то есть квадратично от числа токенов. Лексер sqlparse 0.4.3/0.4.4
читает «[…]» без «[» и «]» внутри ОДНИМ токеном-именем (keywords.py: (?<![\\w\\])])(\\[[^\\]\\[]+\\]) → Name): всё,
что внутри, для Superset — одно слово, скобок и запятых нет. ClickHouse читает «[x][1]» как x (массив из одного
элемента и его первый элемент) — ответ тот же, проверено регрессом.

Что делает. В тексте ШАБЛОНА (jinja остаётся как была) вызов функции f(…) в списке SELECT оборачивается
{% call H() %}f(…){% endcall %}; макрос H (вставляется в начало) при рендере:
  * без «[» и «]» в отрендеренном тексте → «[f(…)][1]»;
  * со скобками (массивы, значение пользователя «a]b») → f(…) как есть, а вложенные H прячут свои куски сами;
  * переменная PA_NOHIDE в контексте рендера → как есть (сверка: шаблон после сборки == исходник, verify()).
Не трогает: WHERE / PREWHERE / ON / GROUP BY / ORDER BY / LIMIT / FROM (ключ таблицы и табличные функции), вызовы с
{% … %} внутри (ветки if — границы не доказать), со ссылкой на таблицу prod_*, оконные (OVER), короче MIN_LEN.
Цена в ClickHouse — массив из одного элемента на строку: на большом стенде ±0,1–0,5 с (шум того же порядка).
"""
import re

MIN_LEN = 24          # короче — выигрыш меньше цены «[…][1]» (4 токена)
KEYWORDS = set('''IN NOT AND OR EXISTS USING VALUES OVER AS ON FROM JOIN SELECT WHERE PREWHERE THEN ELSE WHEN CASE END
INTERVAL ANY ALL LIKE ILIKE BETWEEN IS NULL DISTINCT LIMIT BY WITH ARRAY FILTER GROUP ORDER HAVING UNION
SETTINGS FORMAT INTO TABLE'''.split())
CLAUSE = {'SELECT': 'sel', 'FROM': 'from', 'JOIN': 'from', 'ARRAY': 'from', 'WHERE': 'where', 'PREWHERE': 'where',
          'ON': 'where', 'USING': 'where', 'HAVING': 'where', 'GROUP': 'grp', 'ORDER': 'grp', 'LIMIT': 'grp',
          'SETTINGS': 'grp', 'WITH': 'with', 'UNION': 'with'}

MACRO = ("{%- set PA_H = namespace(d=0) -%}"
         "{%- macro H() -%}{%- if PA_NOHIDE is defined -%}{{ caller() }}{%- else -%}"
         "{%- set PA_H.d = PA_H.d + 1 -%}{%- set x = caller() -%}{%- set PA_H.d = PA_H.d - 1 -%}"
         "{%- if PA_H.d > 0 -%}{{ x }}{%- elif '[' in x or ']' in x -%}{{ caller() }}"
         "{%- else -%}{%- if PA_MARK is defined -%}{{ PA_MARK[0] }}{%- endif -%}[{{ x }}][1]"
         "{%- if PA_MARK is defined -%}{{ PA_MARK[1] }}{%- endif -%}"
         "{%- endif -%}{%- endif -%}{%- endmacro -%}")
MACRO_NOTE = ("{#- H — сборка .stand/hidesql.py: «[выражение][1]» Superset разбирает одним словом (быстрее в разы), "
              "ClickHouse читает как само выражение. Исходник — без H, в Виджеты/. -#}")


def atoms(t):
    """Шаблон → [(вид, начало, конец)]: jc/js/je — теги jinja, s — строка SQL, c — комментарий SQL, w — слово, p — знак."""
    out, i, n = [], 0, len(t)
    while i < n:
        c = t[i]
        if t.startswith('{#', i) or t.startswith('{%', i) or t.startswith('{{', i):
            end = {'{#': '#}', '{%': '%}', '{{': '}}'}[t[i:i + 2]]
            j = t.find(end, i + 2)
            if j < 0:
                raise ValueError('тег jinja не закрыт с позиции %d' % i)
            out.append(({'{#': 'jc', '{%': 'js', '{{': 'je'}[t[i:i + 2]], i, j + 2))
            i = j + 2
        elif c == "'":
            j, tags = i + 1, False
            while j < n:
                if t.startswith('{{', j) or t.startswith('{%', j):
                    tags = True
                    j = t.find('}}' if t[j + 1] == '{' else '%}', j) + 2
                    continue
                if t[j] == '\\':
                    j += 2
                    continue
                if t[j] == "'":
                    if t.startswith("''", j):
                        j += 2
                        continue
                    break
                j += 1
            out.append(('sj' if tags else 's', i, j + 1))
            i = j + 1
        elif t.startswith('--', i):
            j = t.find('\n', i)
            j = n if j < 0 else j
            out.append(('c', i, j))
            i = j
        elif c.isalpha() or c == '_':
            m = re.compile(r'\w+').match(t, i)
            out.append(('w', i, m.end()))
            i = m.end()
        elif c.isspace():
            m = re.compile(r'\s+').match(t, i)
            i = m.end()
        else:
            out.append(('p', i, i + 1))
            i += 1
    return out


BLOCK_OPEN = {'if': 'endif', 'for': 'endfor', 'macro': 'endmacro', 'call': 'endcall', 'filter': 'endfilter'}
BLOCK_MID = {'else', 'elif'}


def tag_word(t, at):
    """Первое слово тега {% … %} («if», «endif», «set»…)."""
    m = re.match(r'\{%-?\s*(\w+)', t[at[1]:at[2]])
    return m.group(1) if m else ''


def regions(t, A):
    """Тела макросов и блоков {% set X %}…{% endset %}: [(имя, вид, первый атом тела, атом закрывающего тега)].
    Их SQL стоит не там, где написан: предложение (SELECT / WHERE …) берётся из мест вызова."""
    out, st = [], []
    for k, at in enumerate(A):
        if at[0] != 'js':
            continue
        w, body = tag_word(t, at), t[at[1]:at[2]]
        if w == 'macro':
            st.append((re.match(r'\{%-?\s*macro\s+(\w+)', body).group(1), 'macro', k + 1))
        elif w == 'set' and '=' not in body:
            st.append((re.match(r'\{%-?\s*set\s+(\w+)', body).group(1), 'set', k + 1))
        elif w in ('endmacro', 'endset') and st:
            name, kind, k0 = st.pop()
            out.append((name, kind, k0, k))
    return out


def scan(t, A, lo, hi, clause, skip, uses, names, cands):
    """Проход атомов [lo, hi) с предложением clause на входе: кандидаты на обёртку (только в SELECT) и места
    использования макросов / переменных names (их предложение). skip — тела регионов (пропускаются)."""
    stack = [clause]
    k = lo
    while k < hi:
        if k in skip:
            k = skip[k] + 1
            continue
        kind, a, b = A[k]
        v = t[a:b]
        if kind == 'w':
            u = v.upper()
            if u == 'ARRAY' and not (k + 1 < hi and t[A[k + 1][1]:A[k + 1][2]].upper() == 'JOIN'):
                u = 'array'                 # функция array(…), не ARRAY JOIN
            if u in CLAUSE:
                stack[-1] = CLAUSE[u]
            elif (stack[-1] == 'sel' and u not in KEYWORDS and k + 1 < hi and t[A[k + 1][1]:A[k + 1][2]] == '('
                  and A[k + 1][1] == b and not (k > 0 and A[k - 1][2] == a and (t[A[k - 1][1]:A[k - 1][2]] in ('.', ')', ']')
                                                                          or A[k - 1][0] in ('je', 'w', 's', 'sj')))):
                end = match(A, t, k + 1, hi)
                if end is not None and A[end][2] - a >= MIN_LEN:
                    cands.append((a, A[end][2]))
                    for j in range(k, end + 1):
                        if A[j][0] == 'je':
                            use(t, A[j], 'sel', uses, names)
                    k = end + 1
                    continue
        elif kind == 'je':
            use(t, A[k], stack[-1], uses, names)
        elif kind == 'p':
            if v == '(':
                stack.append(stack[-1])
            elif v == ')' and len(stack) > 1:
                stack.pop()
        k += 1


def use(t, at, clause, uses, names):
    for w in re.findall(r'\b(\w+)\b', t[at[1]:at[2]]):
        if w in names:
            uses.setdefault(w, set()).add(clause)


def hide_template(t, keep=None):
    """→ (шаблон с {% call H() %}…{% endcall %}, число обёрнутых вызовов, символов в них)."""
    A = atoms(t)
    R = regions(t, A)
    skip = {k0: k1 for _, _, k0, k1 in R}
    names = {r[0] for r in R}
    clause = {r[0]: None for r in R}
    for _ in range(6):                      # до неподвижной точки: макрос внутри макроса берёт предложение снаружи
        uses, cands = {}, []
        scan(t, A, 0, len(A), 'top', skip, uses, names, cands)
        for name, kind, k0, k1 in R:
            if clause[name] is not None:
                inner = {kk: vv for kk, vv in skip.items() if k0 < kk < k1}
                scan(t, A, k0, k1, clause[name], inner, uses, names, cands)
        new = {n: ('sel' if uses.get(n) == {'sel'} else ('mixed' if uses.get(n) else None)) for n in names}
        if new == clause:
            break
        clause = new
    cands = sorted(set(c for c in cands))
    wraps, end = [], -1
    for a, b in cands:                     # вложенные в уже обёрнутое — не нужны
        if a >= end:
            wraps.append((a, b))
            end = b
    if keep is not None:
        wraps = [w for i, w in enumerate(wraps) if keep(i, t[w[0]:w[1]])]
    out, pos, chars = [], 0, 0
    for a, b in wraps:
        out += [t[pos:a], '{% call H() %}', t[a:b], '{% endcall %}']
        pos = b
        chars += b - a
    out.append(t[pos:])
    return MACRO + MACRO_NOTE + ''.join(out), len(wraps), chars


def match(A, t, k, hi):
    """A[k] — «(» вызова. → индекс закрывающей «)» (с параметрическим «)(»), если вызов можно прятать, иначе None.
    Блоки {% if %} / {% for %} внутри — можно, если целиком внутри и каждая ветка не меняет глубину скобок."""
    depth, j, blocks = 0, k, []
    while j < hi:
        kind, a, b = A[j]
        v = t[a:b]
        if kind == 'js':
            w = tag_word(t, A[j])
            if w in BLOCK_OPEN and w != 'macro':
                blocks.append((w, depth))
            elif w in BLOCK_MID:
                if not blocks or blocks[-1][0] != 'if' or blocks[-1][1] != depth:
                    return None
            elif w.startswith('end'):
                if not blocks or BLOCK_OPEN.get(blocks[-1][0]) != w or blocks[-1][1] != depth:
                    return None
                blocks.pop()
            elif w != 'set' or '=' not in v:
                return None                 # set-блок, macro и прочее — не прячем
        elif kind == 'p':
            if v in '[]':
                return None
            if v == '(':
                depth += 1
            elif v == ')':
                depth -= 1
                if depth == 0:
                    if j + 1 < hi and t[A[j + 1][1]:A[j + 1][2]] == '(' and A[j + 1][1] == b:
                        j += 1              # quantile(0.5)(x)
                        continue
                    break
        elif kind == 'w' and v.upper() == 'OVER' and depth == 0:
            return None
        j += 1
    else:
        return None
    if blocks:
        return None
    body = t[A[k - 1][1]:A[j][2]]
    if re.search(r'\bprod_\w+\.', body):
        return None                         # ссылки на таблицы — на виду у Superset
    nxt = A[j + 1] if j + 1 < len(A) else None
    if nxt and nxt[0] == 'w' and t[nxt[1]:nxt[2]].upper() == 'OVER':
        return None
    return j


def render(text, flt=None, **ctx):
    """Рендер шаблона как Superset (песочница jinja, моки filter_values / current_username / cache_key_wrapper)."""
    from jinja2.sandbox import SandboxedEnvironment
    from jinja2 import DebugUndefined
    flt = flt or {}
    env = SandboxedEnvironment(extensions=['jinja2.ext.do'], undefined=DebugUndefined)   # как Superset 2.1

    def where_in(values, mark="'"):
        q = lambda v: mark + v.replace("'", "''") + mark if isinstance(v, str) else str(v)
        return '(' + ', '.join(q(v) for v in values) + ')'
    env.filters['where_in'] = where_in

    def filter_values(col, default=None, remove_filter=False):
        v = flt.get(col)
        if v is None:
            return [] if default is None else [default]
        return list(v) if isinstance(v, (list, tuple)) else [v]
    return env.from_string(text).render(filter_values=filter_values, current_username=lambda add_to_cache_keys=True: flt.get('__user') or '',
                                        cache_key_wrapper=lambda x: x, **ctx)


# Набор фильтров для сверки «после сборки == исходник»: режимы панели и каталога, свой период, ЦА, враждебные значения.
CASES = [{}, {'mode_param': 'report', 'sel_f': ['2']}, {'mode_param': 'report', 'sel_f': ['2', '5']},
         {'ca_spec_f': ['Спец 1']}, {'ca_spec_f': ["O'Brien; x", 'a]b', 'x -- y', '[a']},
         {'period_param': 'c|2026-08-01|d|60'}, {'period_param': 'c|2026-01-01|d|300'}, {'period_param': 'c|2025-01-01|m|20'},
         {'period_param': 'w'}, {'period_param': 'm'}, {'period_param': 'q'},
         {'cat_f': ['a]b'], 'sel_f': ['x -- y', "O'K"]}, {'tab_param': 'aud'}, {'__user': 'a]b'}]


def verify(src, built, extra=()):
    """Сборка не меняет текст запроса: render(built, PA_NOHIDE) == render(src) на CASES (+ extra). → число сверок."""
    n = 0
    for f in list(CASES) + list(extra):
        a = render(src, dict(f))
        b = render(built, dict(f), PA_NOHIDE=1)
        if a != b:
            i = next((i for i in range(min(len(a), len(b))) if a[i] != b[i]), min(len(a), len(b)))
            raise AssertionError('hidesql: текст разошёлся на %r у позиции %d: …%r… против …%r…' % (f, i, a[i - 60:i + 60], b[i - 60:i + 60]))
        m = render(built, dict(f), PA_MARK='\x01\x02')
        for i in [i for i, ch in enumerate(m) if ch == '\x01']:
            prev = m[i - 1] if i else ' '
            if prev.isalnum() or prev in '_.)]\x02':   # «x[…]» — индексация, а не слово для лексера: смысл меняется
                raise AssertionError('hidesql: перед «[» стоит %r на %r: …%r…' % (prev, f, m[max(0, i - 80):i + 40]))
        if m.replace('\x01', '').replace('\x02', '') != render(built, dict(f)):
            raise AssertionError('hidesql: метки меняют текст на %r' % (f,))
        n += 1
    return n


if __name__ == '__main__':
    import sys, time, os
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import superset_path
    for p in sys.argv[1:]:
        src = open(p).read()
        built, n, ch = hide_template(src)
        print('%s: обёрнуто %d вызовов, %d знаков; сверок текста %d' % (os.path.basename(p), n, ch, verify(src, built)))
        for f in [{}, {'mode_param': 'report', 'sel_f': ['2']}, {'ca_spec_f': ['Спец 1']}]:
            for name, t in [('исходник', src), ('сборка', built)]:
                sql = render(t, dict(f))
                t0 = time.perf_counter()
                superset_path.superset_steps(sql, ['section', 'g', 'k', 'parent', 'n'])
                print('   %-40s %-9s %5.1f КБ  путь Superset %.2f с' % (str(f)[:40], name, len(sql) / 1e3, time.perf_counter() - t0))
