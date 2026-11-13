#!/usr/bin/env python3
"""Гейт сохранения: пройдёт ли SQL проверку Proteus при Save датасета (и в SQL Lab) — до вставки владельцем.

Форк при сохранении разбирает SQL своим парсером и отвечает «Некорректный SQL запрос: →…←» (строки нет в Superset
2.0.1, sqlglot в 2.0.x нет — это код форка; sqlglot 25–30 — модель (отказ — ошибка), 18–23 — только предупреждение: они
отвергают pa_one, а в бою он сохранён; все 10.6–30 воспроизводят отказ на алиасе в GROUP BY, а < 15 не годится:
не знает CAST(x, 'T') и роняет рабочие датасеты). chdb такие
ошибки не ловит: он выполняет всё. Здесь — все известные причины отказа и порчи текста:

  1. sqlglot (dialect clickhouse): ровно один оператор, только запрос (Select / Union / Subquery; в SQL Lab ещё
     Describe), без изменяющих узлов; ошибка — в формате форка «…→место←…»;
  2. алиас в GROUP BY (`GROUP BY intDiv(rn - 1, 500) AS ch` — отказ 29.09) — по токенам, даже если sqlglot молчит;
  3. `\\x..` в строковом литерале (sqlglot перепечатает '\\x1F' как '\\\\x1F' — значение меняется);
  4. кортежный тип строкой в CAST (`CAST([], 'Array(Tuple(UInt8, String))')` — отказ 18.09, sqlglot его пропускает);
  5. SETTINGS / FORMAT / `;` в середине / `AS MATERIALIZED` в теле датасета (Code 62 при сохранении: Superset
     дописывает "\\nLIMIT 1000" после текста);
  6. лексер sqlparse (М1 — 0.4.3 + патч 2.1.0, модель боя; М2 — 0.4.4 + патч 2.1.3/3.0 — какой стоит в venv; гоняйте оба) видит строки
     так же, как sqlglot, а strip_comments вырезает только комментарии (иначе запрос портится до ClickHouse —
     superset201.lexer_problems);
  7. остатки Jinja после рендера (DebugUndefined печатает неизвестную переменную текстом);
  8. --sqllab: слово `system` (SQL Lab Proteus: «Использование "system" запрещено» — даже в комментарии), SHOW,
     один запрос (сборник «по одному» — каждый отдельно; из .md — блоки ```sql), первым словом SELECT или DESCRIBE,
     «LIMIT N BY» на верхнем уровне (SQL Lab 2.0.1 примет его за лимит строк и покажет N строк всего ответа),
     REPLACE и WITH первой строкой — предупреждения (не проверено в бою).

Запуск:
    python kit/sqlgate.py proteus/report.data.sql [--user a.user] [--filters '{"unit_f": ["u1"]}'] [--cols auto]
    python kit/sqlgate.py --sqllab "Поставка/10. Проверка на бою.sql" "Поставка/0. Инструкция.md"
    python kit/sqlgate.py report.data.sql --sqlglot-dirs ~/sg/23.17.0,~/sg/30.0.0   # ещё версии sqlglot

Другие версии sqlglot ставятся рядом, не в venv:  pip install --target ~/sg/23.17.0 sqlglot==23.17.0
и подаются каталогами (--sqlglot-dirs) — гейт перезапустит себя с PYTHONPATH=<каталог> для каждого. Так же —
sqlparse 0.5.5 / 0.6 (--sqlparse-dirs ~/sp/0.5.5,~/sp/0.6.0): запас на обновление Proteus, где у разбора есть предел
10 000 токенов и глубина 100. Датасет сверх предела — ошибка (как бюджет superset201), текст после reindent и SQL Lab —
предупреждение: в 2.0.1 предела нет, а в Superset 4.1+ нет reindent.
Варианты датасета: сохранение (AlwaysTrue, текст + LIMIT 1000), открытие (--user, --filters, --url-params) и
обёртка чарта (SELECT … GROUP BY … LIMIT). Код выхода: 0 — чисто, 1 — есть ошибки, 2 — вызов.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True          # не оставлять kit/__pycache__ в репозитории playbook
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import superset201 as ss  # noqa: E402

MUTATING = ['Insert', 'Update', 'Delete', 'Merge', 'Create', 'Drop', 'TruncateTable', 'Alter', 'Command']
QUERY_NODES = ['Select', 'Union', 'Subquery', 'Except', 'Intersect']
GB_END = {'HAVING', 'ORDER_BY', 'LIMIT', 'UNION', 'EXCEPT', 'INTERSECT', 'SEMICOLON', 'WINDOW', 'QUALIFY',
          'SETTINGS', 'FORMAT'}
# Формат вывода ClickHouse после FORMAT (FORMAT — последнее предложение запроса). Колонка или алиас с именем
# format (SELECT format AS f) — не он: проверка смотрит, что за FORMAT идёт имя формата, а перед ним — не «,», «AS»,
# SELECT, «(» или «.».
CH_FORMAT = re.compile(r'(?i)^(JSON\w*|TSV\w*|TabSeparated\w*|CSV\w*|Pretty\w*|Native|RowBinary\w*|Values|Vertical|'
                       r'Null|Parquet\w*|Arrow\w*|ORC|XML|Markdown|TSKV|Template\w*|CustomSeparated\w*|LineAsString\w*|'
                       r'RawBLOB|MsgPack|Avro\w*|Protobuf\w*|CapnProto|Regexp|SQLInsert|BSONEachRow|Npy|One|Form|'
                       r'MySQLDump|MySQLWire|PostgreSQLWire|Prometheus|DWARF|Hash|Raw\w*)$')
FORMAT_NOT_AFTER = {'COMMA', 'ALIAS', 'SELECT', 'L_PAREN', 'DOT', 'DISTINCT'}


# ─────────────────────────────── sqlglot: разбор как при сохранении ───────────────────────────────
def sqlglot_problem(text, sqllab=False):
    """Как SQLScript / SQLStatement Superset 4.1+ и, вероятно, проверка форка: один оператор, запрос. '' — норма."""
    try:
        import sqlglot
        from sqlglot import exp
    except ImportError:
        return 'нет sqlglot'
    try:
        st = [x for x in sqlglot.parse(text, read='clickhouse') if x is not None]   # read= есть во всех версиях
    except Exception as ex:  # noqa: BLE001 — ParseError, TokenError и прочее: форк ответил бы отказом
        errs = getattr(ex, 'errors', None) or []
        e = errs[0] if errs else {}
        if e:
            return 'Некорректный SQL запрос: …%s→%s←%s… (%s)' % (
                (e.get('start_context') or '')[-60:].replace('\n', ' '), e.get('highlight', ''),
                (e.get('end_context') or '')[:40].replace('\n', ' '), e.get('description', '')[:80])
        return 'Некорректный SQL запрос: %s' % str(ex).splitlines()[0][:200]
    if len(st) != 1:
        return 'операторов: %d (нужен один)' % len(st)
    allowed = QUERY_NODES + (['Describe'] if sqllab else [])
    if not any(hasattr(exp, n) and isinstance(st[0], getattr(exp, n)) for n in allowed):
        return 'не запрос: %s' % type(st[0]).__name__
    for n in MUTATING:
        if hasattr(exp, n) and st[0].find(getattr(exp, n)):
            return 'изменяющий узел: ' + n
    return ''


# ─────────────────────────────── проверки по токенам ───────────────────────────────
def _toks(text):
    from sqlglot.dialects.clickhouse import ClickHouse
    return ClickHouse().tokenize(text)


def _ctx(text, at, w=60):
    return text[max(0, at - w):at + 30].replace('\n', ' ')


def token_problems(text, dataset=True):
    """Алиас в GROUP BY, \\x в литералах, кортежный CAST строкой, SETTINGS / FORMAT / ; / MATERIALIZED."""
    out = []
    try:
        t = _toks(text)
    except ImportError:
        return ['нет sqlglot: проверки по токенам пропущены']
    except Exception as ex:  # noqa: BLE001
        return ['sqlglot не токенизирует: %s' % str(ex).splitlines()[0][:160]]
    names = [x.token_type.name for x in t]
    up = [x.text.upper() for x in t]
    for i, n in enumerate(names):
        if n == 'GROUP_BY':
            depth = 0
            for j in range(i + 1, len(t)):
                m = names[j]
                if m in ('L_PAREN', 'L_BRACKET'):
                    depth += 1
                elif m in ('R_PAREN', 'R_BRACKET'):
                    if depth == 0:
                        break
                    depth -= 1
                elif depth == 0 and m in GB_END:
                    break
                elif depth == 0 and m == 'ALIAS':
                    out.append('алиас в GROUP BY (форк: «Некорректный SQL запрос», 29.09) — ключ колонкой '
                               'подзапроса: …%s…' % _ctx(text, t[j].start))
                    break
        if n in ('STRING', 'NATIONAL_STRING'):
            raw = text[t[i].start:t[i].end + 1]
            if re.search(r'(?<!\\)(?:\\\\)*\\x[0-9A-Fa-f]{2}', raw):
                out.append('\\x-экран в литерале (перепечатка sqlglot меняет значение) — char(N): …%s…'
                           % _ctx(text, t[i].start))
            if re.match(r'^\s*(?:[A-Za-z]+\(\s*)*Tuple\s*\(', t[i].text):
                out.append('кортежный тип строкой %r (форк отверг CAST с ним при сохранении, 18.09) — '
                           'arrayFilter(t -> …, [(toUInt8(N), x)]): …%s…' % (t[i].text[:40], _ctx(text, t[i].start)))
        if not dataset:
            continue
        if up[i] == 'SETTINGS' and i + 2 < len(t) and names[i + 2] == 'EQ':
            out.append('SETTINGS в теле датасета (сохранение допишет LIMIT после него — Code 62): …%s…'
                       % _ctx(text, t[i].start))
        if (up[i] == 'FORMAT' and i + 1 < len(t) and CH_FORMAT.match(t[i + 1].text)
                and (i == 0 or names[i - 1] not in FORMAT_NOT_AFTER)):
            out.append('FORMAT в теле датасета (подзапрос не принимает FORMAT): …%s…' % _ctx(text, t[i].start))
        if up[i] == 'MATERIALIZED' and i > 0 and names[i - 1] == 'ALIAS':
            out.append('AS MATERIALIZED (в ClickHouse 24.8 нет — Code 62): …%s…' % _ctx(text, t[i].start))
        if n == 'SEMICOLON' and any(x != 'SEMICOLON' for x in names[i + 1:]):
            out.append('«;» в середине текста («multiple statements»): …%s…' % _ctx(text, t[i].start))
    return out


# ─────────────────────────────── SQL Lab ───────────────────────────────
def sqllab_problems(text):
    """Правила SQL Lab Proteus (бой 08.10) + путь SQL Lab 2.0.1 (ParsedQuery(strip_comments=True), лимит)."""
    err, warn = [], []
    for m in re.finditer(r'(?i)system', text):
        line = text.count('\n', 0, m.start()) + 1
        err.append('слово «system» в строке %d (SQL Lab: «Использование "system" запрещено» — даже в комментарии)'
                   % line)
        if len(err) >= 5:
            break
    for m in re.finditer(r'(?i)\bshow\b', text):
        err.append('SHOW в строке %d (SQL Lab принимает только SELECT / DESCRIBE)' % (text.count('\n', 0, m.start()) + 1))
        break
    if re.search(r'(?i)\breplace\b', text):
        warn.append('REPLACE в тексте: отказ SQL Lab на нём не подтверждён боем (TP — осторожность); '
                    'функция replace( в датасетах работает')
    if '{{' in text or '{%' in text:
        warn.append('в SQL Lab-файле Jinja: SQL Lab 2.0.1 её рендерит и падает на неизвестной переменной — '
                    'давайте отрендеренный текст (DV-27, ST-32)')
    ss.lexer_patch()
    pq = ss.ParsedQuery(text, strip_comments=True)
    stm = pq.get_statements()
    if len(stm) != 1:
        err.append('запросов: %d — SQL Lab Proteus исполняет один' % len(stm))
    if stm:
        head = stm[0].lstrip('( \n\t').split(None, 1)[0].upper() if stm[0].strip() else ''
        if head == 'WITH':
            warn.append('первое слово WITH: SQL Lab Proteus пропускает «только select или describe» — CTE внутри '
                        'FROM (…) надёжнее (отказ на WITH не проверен)')
        elif head not in ('SELECT', 'DESCRIBE', 'DESC'):
            err.append('первое слово %s — SQL Lab Proteus пропускает только SELECT и DESCRIBE' % head)
        one = ss.ParsedQuery(stm[0])
        if one.limit:
            # SQL Lab 2.0.1: query.limit = min(LIMIT запроса, лимит окна), затем верхний LIMIT → limit + 1 (force),
            # лишняя строка отбрасывается. Обычный LIMIT N так и остаётся N, а «LIMIT N BY» на верхнем уровне
            # становится «LIMIT N+1 BY», и SQL Lab покажет всего N строк ответа.
            st0 = one._parsed[0]
            idx, _ = st0.token_next_by(m=(ss.Keyword, 'LIMIT'))
            nidx, _num = st0.token_next(idx) if idx is not None else (None, None)
            _, after = st0.token_next(nidx) if nidx is not None else (None, None)
            if after is not None and after.ttype in ss.Keyword and after.normalized == 'BY':
                err.append('«LIMIT %d BY» на верхнем уровне: SQL Lab примет его за лимит строк и покажет всего %d '
                           'строк ответа — оберните запрос в SELECT * FROM (…)' % (one.limit, one.limit))
    return err, warn


# ─────────────────────────────── варианты текста ───────────────────────────────
def dataset_texts(path, opts, tpl):
    """→ [(вариант, текст, проверять ли тело датасета)] + ошибки рендера. tpl — текст файла (ss.read_sql)."""
    out, errs = [], []
    if opts.get('rendered'):
        return [('как есть', tpl, True)], errs
    rs = ss.render(tpl, user=opts['user'], filters={}, url_params={}, save=True,
                   template_params=opts.get('template_params'))
    if rs.text is not None and not ss.sqlparse.format(rs.text.strip('\t\r\n; '), strip_comments=True).strip():
        errs.append('датасет пуст после рендера и strip_comments — Superset: «Virtual dataset query cannot be empty»')
        return out, errs
    if rs.error:
        errs.append('сохранение: ' + rs.error)
    else:
        sp = ss.save_path(rs.text)
        if sp['error']:
            errs.append('сохранение: ' + sp['error'])
        out.append(('сохранение (AlwaysTrue)', rs.text, True))
        if sp.get('executed'):
            out.append(('сохранение + LIMIT 1000', sp['executed'], False))
        if rs.leftovers:
            errs.append('сохранение: после рендера остался Jinja-текст: %s' % ', '.join(rs.leftovers[:4]))
    ro = ss.render(tpl, user=opts['user'], filters=opts['filters'], url_params=opts['url_params'],
                   template_params=opts.get('template_params'))
    if ro.error:
        errs.append('открытие: ' + ro.error)
        return out, errs
    if ro.leftovers:
        errs.append('открытие: после рендера остался Jinja-текст: %s' % ', '.join(ro.leftovers[:4]))
    out.append(('открытие', ro.text, True))
    cols = opts.get('cols')
    if cols in (None, 'auto'):
        try:
            import sqlglot
            ast = sqlglot.parse_one(ss.sqlparse.format(ro.text.strip('\t\r\n; '), strip_comments=True),
                                    read='clickhouse')
            cols = [c for c in ast.named_selects if c]
        except Exception:  # noqa: BLE001
            cols = None
    if cols:
        ds = ss.sqlparse.format(ro.text.strip('\t\r\n; '), strip_comments=True)
        out.append(('обёртка чарта', ss.wrap(ds, cols, opts.get('limit', 50000)), False))
    return out, errs


SQL_FENCE = re.compile(r'^[ \t]*(```|~~~)[ \t]*sql\b[^\n]*\n(.*?)^[ \t]*\1', re.S | re.M | re.I)


def gate_file(path, opts):
    rep = {'file': path, 'errors': [], 'warnings': [], 'variants': [], 'texts': {}}
    try:
        text, rep['warnings'] = ss.read_sql(path)
    except ValueError as ex:
        rep['errors'].append(str(ex))
        return rep
    if opts['sqllab']:
        if path.lower().endswith(('.md', '.markdown')):
            # инструкция: каждый блок ```sql (или ~~~sql, регистр не важен) — отдельный запрос для SQL Lab
            blocks = [('блок %d' % (i + 1), m.group(2)) for i, m in enumerate(SQL_FENCE.finditer(text))]
        else:
            blocks = [('', text)]
        if not blocks:
            rep['warnings'].append('в файле нет блоков ```sql — проверять нечего')
        variants, own = [], {}
        for label, b in blocks:
            ss.lexer_patch()
            stm = ss.ParsedQuery(b, strip_comments=True).get_statements()
            if len(stm) > 1:
                # сборник запросов «по одному»: каждый проверяется сам, файл целиком SQL Lab не исполнит
                rep['warnings'].append('%s%d запросов: SQL Lab Proteus исполняет один — владелец выделяет и запускает '
                                       'по одному (лучше — файл на запрос или один запрос UNION ALL)'
                                       % ((label + ': ') if label else '', len(stm)))
                parts = [('%s запрос %d' % (label, k + 1)).strip() for k in range(len(stm))]
                pieces = list(zip(parts, stm))
                for m in re.finditer(r'(?i)system', b):   # system — по сырому тексту, с комментариями
                    x = 'слово «system» в строке %d (даже в комментарии)' % (b.count('\n', 0, m.start()) + 1)
                    rep['errors'].append(((label + ': ') if label else '') + x)
                    own.setdefault('SQL Lab, ' + parts[0], []).append(x)
            else:
                pieces = [(label or 'SQL Lab', b)]
            for name, q in pieces:
                e, w = sqllab_problems(q)
                if len(stm) > 1:
                    e = [x for x in e if 'system' not in x]
                pre = '' if name == 'SQL Lab' else name + ': '
                rep['errors'] += [pre + x for x in e]
                rep['warnings'] += [pre + x for x in w]
                vname = 'SQL Lab' if name == 'SQL Lab' else 'SQL Lab, ' + name
                own.setdefault(vname, []).extend(e)
                variants.append((vname, q, False))
    else:
        variants, errs = dataset_texts(path, opts, text)
        own = {}
        rep['errors'] += errs
        if re.search(r'(?i)system', text):
            rep['warnings'].append('слово «system» в датасете: если владелец запустит его в SQL Lab — отказ')
    seen, first = {}, {}
    for name, text, body in variants:
        probs = []
        p = sqlglot_problem(text, opts['sqllab'])
        if p:
            probs.append(p)
        probs += token_problems(text, dataset=body)
        if name in ('открытие', 'сохранение (AlwaysTrue)', 'как есть') or name.startswith('SQL Lab'):
            probs += ['лексер: ' + x for x in ss.lexer_problems(text)]
        probs = list(dict.fromkeys(probs))
        # свои проблемы SQL Lab (system, SHOW, первое слово, LIMIT BY) уже в rep['errors'] — только в статус варианта
        rep['variants'].append({'name': name, 'problems': probs + own.get(name, [])})
        rep['texts'][name] = text
        for x in probs:
            key = _cause(x)
            first.setdefault(key, x)
            if name not in seen.setdefault(key, []):
                seen[key].append(name)
    # одна и та же причина в нескольких вариантах — одной строкой (место — из первого варианта)
    for key, names in seen.items():
        line = '%s  [%s]' % (first[key], ', '.join(names))
        # 20.10: без sqlglot гейт не проверяет главное — это ошибка, а не предупреждение (датасет 2а TeamPulse
        # прошёл «чисто» без sqlglot и не сохранился на `APPLY toString`, CH-32)
        rep['errors'].append(line)
    return rep


def _cause(msg):
    """Причина без места в тексте: «…→AS←…» и «: …контекст…» у разных вариантов отличаются, причина — одна."""
    m = re.match(r'(Некорректный SQL запрос: ).*?→(.*?)←.*?\((.*)\)$', msg)
    if m:
        return m.group(1) + m.group(2) + ' (' + m.group(3) + ')'
    return msg.split(': …', 1)[0]


# ─────────────────────────────── другие версии sqlglot ───────────────────────────────
def _child(d, flag, tmp, module):
    """Перезапуск себя с PYTHONPATH=<каталог>. → (результат dict, проблема или ''). Проблема — каталога нет, модуль
    взят не из него (пустой каталог: тогда молча работала бы версия из venv) или процесс упал."""
    d = os.path.expanduser(d)
    if not os.path.isdir(os.path.join(d, module)):
        return None, '%s: нет %s/%s — каталог версии пуст или указан неверно (pip install --target %s %s==…)' % (
            d, d, module, d, module)
    env = dict(os.environ, PYTHONPATH=d + os.pathsep + os.environ.get('PYTHONPATH', ''), PYTHONDONTWRITEBYTECODE='1',
               PYTHONIOENCODING='utf-8')
    r = subprocess.run([sys.executable, os.path.abspath(__file__), flag, tmp], env=env, capture_output=True,
                       text=True, encoding='utf-8')
    try:
        res = json.loads(r.stdout)
    except ValueError:
        return None, '%s: проверка упала: %s' % (d, (r.stderr or r.stdout).strip()[-300:])
    real = os.path.realpath(res.get('file') or '')
    if not real.startswith(os.path.realpath(d) + os.sep):
        return None, '%s: %s взят не отсюда, а из %s (версия %s)' % (d, module, res.get('file'), res.get('version'))
    return res, ''


def other_sqlglot(reports, dirs, sqllab):
    """Те же тексты под другими версиями sqlglot: ({каталог: {version, errors}}, [проблемы каталогов])."""
    payload = [{'key': '%s :: %s' % (r['file'], n), 'text': t} for r in reports for n, t in r['texts'].items()]
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as f:
        json.dump({'sqllab': sqllab, 'items': payload}, f, ensure_ascii=False)
        tmp = f.name
    out, bad = {}, []
    try:
        for d in dirs:
            res, problem = _child(d, '--_sqlglot-json', tmp, 'sqlglot')
            if problem:
                bad.append(problem)
            else:
                out[os.path.expanduser(d)] = res
    finally:
        os.unlink(tmp)
    return out, bad


# ─────────────────────────────── другие версии sqlparse (запас: 0.5.5 / 0.6) ───────────────────────────────
SP_STEPS_DATASET = ('format(strip_comments)', 'parse')
SP_STEPS_WRAP = ('format(reindent)', 'parse_sql после reindent')


def other_sqlparse(reports, dirs):
    """Те же тексты под другой версией sqlparse (PYTHONPATH=<каталог>): где упал бы путь Superset, если Proteus
    обновит sqlparse (с 0.5.5 — «Maximum number of tokens exceeded (10000).» / «Maximum grouping depth exceeded»).
    → {каталог: {version, patch, items: {ключ: {step, error, tokens}}}}"""
    payload = [{'key': '%s :: %s' % (r['file'], n), 'text': t, 'wrap': n == 'обёртка чарта'}
               for r in reports for n, t in r['texts'].items() if n != 'сохранение + LIMIT 1000']
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as f:
        json.dump({'items': payload}, f, ensure_ascii=False)
        tmp = f.name
    out, bad = {}, []
    try:
        for d in dirs:
            res, problem = _child(d, '--_sqlparse-json', tmp, 'sqlparse')
            if problem:
                bad.append(problem)
            else:
                out[os.path.expanduser(d)] = res
    finally:
        os.unlink(tmp)
    return out, bad


def _sqlparse_only(tmp):
    data = json.load(open(tmp, encoding='utf-8'))
    patch = ss.lexer_patch()
    res = {'version': ss.sqlparse.__version__, 'file': ss.sqlparse.__file__, 'patch': patch, 'items': {}}
    for it in data['items']:
        text = it['text'].strip('\t\r\n; ')
        steps = [('format(reindent)', lambda t: ss.sqlparse.format(t, reindent=True)),
                 ('parse_sql после reindent', lambda t: [str(x) for x in ss.sqlparse.parse(t)])] if it['wrap'] else \
                [('format(strip_comments)', lambda t: ss.sqlparse.format(t, strip_comments=True)),
                 ('parse', lambda t: [str(x) for x in ss.sqlparse.parse(t)])]
        cur = text
        for name, f in steps:
            try:
                r = f(cur)
            except Exception as ex:  # noqa: BLE001 — SQLParseError и прочее
                res['items'][it['key']] = {'step': name, 'error': '%s: %s' % (type(ex).__name__, str(ex)[:160]),
                                           'tokens': ss.tokens(cur)}
                break
            if isinstance(r, str):
                cur = r
    print(json.dumps(res, ensure_ascii=False))


def _major(ver):
    try:
        return int(str(ver).split('.')[0])
    except ValueError:
        return 0


def _sqlglot_only(tmp):
    data = json.load(open(tmp, encoding='utf-8'))
    try:
        import sqlglot
        ver, where = sqlglot.__version__, sqlglot.__file__
    except ImportError:
        ver, where = 'нет', ''
    errs = {}
    for it in data['items']:
        p = sqlglot_problem(it['text'], data['sqllab'])
        if p:
            errs[it['key']] = p
    print(json.dumps({'version': ver, 'file': where, 'errors': errs}, ensure_ascii=False))


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if argv[:1] == ['--_sqlglot-json']:
        _sqlglot_only(argv[1])
        return 0
    if argv[:1] == ['--_sqlparse-json']:
        _sqlparse_only(argv[1])
        return 0
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0], formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog=__doc__.split('\n\n', 1)[1])
    ap.add_argument('files', nargs='+')
    ap.add_argument('--sqllab', action='store_true', help='файлы для SQL Lab (а не датасеты)')
    ap.add_argument('--rendered', action='store_true', help='текст уже без Jinja — не рендерить')
    ap.add_argument('--user', default='stand.user')
    ap.add_argument('--filters', default='')
    ap.add_argument('--url-params', default='')
    ap.add_argument('--template-params', default='', help='JSON «Параметров шаблона» датасета или @файл.json')
    ap.add_argument('--cols', default='auto')
    ap.add_argument('--limit', type=int, default=50000)
    ap.add_argument('--sqlglot-dirs', default='', help='каталоги с другими версиями sqlglot через запятую')
    ap.add_argument('--sqlparse-dirs', default='',
                    help='каталоги с другими версиями sqlparse (0.5.5, 0.6 — запас на обновление) через запятую')
    ap.add_argument('--no-patch', action='store_true', help='лексер без патча Superset')
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args(argv)
    ss.lexer_patch(not a.no_patch)
    try:
        opts = {'sqllab': a.sqllab, 'rendered': a.rendered, 'user': a.user, 'filters': ss._json_arg(a.filters),
                'url_params': ss._json_arg(a.url_params), 'limit': a.limit,
                'template_params': ss._json_arg(a.template_params),
                'cols': 'auto' if a.cols == 'auto' else [c.strip() for c in a.cols.split(',') if c.strip()]}
    except (ValueError, OSError) as ex:
        print('--filters / --url-params / --template-params: %s' % ex, file=sys.stderr)
        return 2
    missing = [f for f in a.files if not os.path.isfile(f)]
    if missing:
        print('нет файла: %s' % ', '.join(missing), file=sys.stderr)
        return 2
    reports = [gate_file(f, opts) for f in a.files]
    dirs = [d for d in a.sqlglot_dirs.split(',') if d.strip()]
    others, bad_dirs = other_sqlglot(reports, dirs, a.sqllab) if dirs else ({}, [])
    spdirs = [d for d in a.sqlparse_dirs.split(',') if d.strip()]
    sp_others, bad_sp = other_sqlparse(reports, spdirs) if spdirs else ({}, [])
    if bad_dirs or bad_sp:
        # иначе проверка молча шла бы версией из venv, а шапка обещала бы 23.17 / 0.5.5
        for x in bad_dirs + bad_sp:
            print('✗ --sqlglot-dirs / --sqlparse-dirs: %s' % x, file=sys.stderr)
        return 2
    for d, res in others.items():
        agg = {}
        for key, p in res.get('errors', {}).items():
            f, _, n = key.partition(' :: ')
            agg.setdefault((f, p), []).append(n)
        old = _major(res.get('version')) < 25
        for (f, p), names in agg.items():
            for r in reports:
                if r['file'] != f:
                    continue
                if old:
                    # ST-15: отказ только в sqlglot < 25 — предупреждение: pa_one (CTE `pr AS (…)`) sqlglot 18–23
                    # отвергает, а в бою он сохранён 30.09 — проверка форка не sqlglot ≤ 23 [вывод]
                    r['warnings'].append('sqlglot %s (< 25, не модель форка — только предупреждение): %s  [%s]'
                                         % (res.get('version'), p, ', '.join(names)))
                else:
                    r['errors'].append('sqlglot %s: %s  [%s]' % (res.get('version'), p, ', '.join(names)))
    for d, res in sp_others.items():
        agg = {}
        for key, it in res.get('items', {}).items():
            f, _, n = key.partition(' :: ')
            agg.setdefault((f, it['step'], it['error']), []).append('%s, %s токенов' % (n, it.get('tokens', '?')))
        for (f, step, err), names in agg.items():
            for r in reports:
                if r['file'] != f:
                    continue
                line = 'sqlparse %s, шаг %s: %s  [%s]' % (res.get('version'), step, err, '; '.join(names))
                # датасет: тот же бюджет, что в superset201 (токенов < 10 000) — ошибка; обёртка после reindent и
                # SQL Lab — запас на обновление Proteus (в 2.0.1 этих шагов с пределом нет) — предупреждение
                (r['warnings'] if (step in SP_STEPS_WRAP or a.sqllab) else r['errors']).append(line)
    bad = sum(1 for r in reports if r['errors'])
    ver = ss.versions()
    if a.json:
        for r in reports:
            r.pop('texts', None)
        print(json.dumps({'versions': ver, 'other_sqlglot': {d: r.get('version') for d, r in others.items()},
                          'other_sqlparse': {d: r.get('version') for d, r in sp_others.items()},
                          'reports': reports}, ensure_ascii=False, indent=1))
        return 1 if bad else 0
    print('sqlglot %s · sqlparse %s (патч: %s)%s%s' % (ver['sqlglot'], ver['sqlparse'], ver['patch'],
          ''.join(' · sqlglot %s' % r.get('version') for r in others.values()),
          ''.join(' · sqlparse %s' % r.get('version') for r in sp_others.values())))
    for r in reports:
        print('=' * 100)
        print('%s — %s' % (r['file'], 'ЧИСТО' if not r['errors'] else 'ОШИБКИ: %d' % len(r['errors'])))
        for v in r['variants']:
            print('  [%s] %s' % ('ок' if not v['problems'] else '✗', v['name']))
        for e in r['errors']:
            print('  ✗ ' + e)
        for w in r['warnings']:
            print('  ! ' + w)
    if not dirs:
        print('-' * 100)
        print('Другие версии sqlglot (25–30 — модель, 23 — предупреждение; как Superset 4.0–5.0): pip install --target <каталог> sqlglot==25.34.0 '
              '→ --sqlglot-dirs <каталог>,…')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
