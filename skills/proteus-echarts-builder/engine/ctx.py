# -*- coding: utf-8 -*-
"""ctx — РАЗБОР чарта. Проверки не парсят исходник, они читают отсюда.

Инвариант лексера: scan() возвращает две проекции ТОЙ ЖЕ ДЛИНЫ, что и
оригинал, поэтому любую из них можно резать одними индексами, а номер строки
считать как raw.count('\\n', 0, i) + 1:
  code — комментарии затёрты пробелами, строковые литералы целы;
  bare — затёрты ещё и содержимое строк и регулярок.

Всё, что раньше вычислялось внутри main() по месту (тело buildHTML, склеенный
CSS, правила, тело render), считается здесь ОДИН раз и лениво. Проверка,
которая заново парсит исходник под себя, — это будущая ложная тревога
(RETRO 60).
"""

import datetime
import os
import re

# ── лексический разбор ───────────────────────────────────────────────────────

_RE_ALLOWED_PREV = set('(,=:[!&|?{};+-*%^~<>')


def scan(src):
    """(code, bare) — две проекции исходника той же длины, что и оригинал."""
    code, bare = [], []
    i, n = 0, len(src)
    state = None          # None | 'line' | 'block' | quote char | 'regex'
    in_class = False      # внутри [...] регулярки
    last = ''             # последний значимый символ до текущей позиции
    while i < n:
        ch = src[i]
        nxt = src[i + 1] if i + 1 < n else ''
        if state is None:
            if ch == '/' and nxt == '/':
                state = 'line'; code.append('  '); bare.append('  '); i += 2; continue
            if ch == '/' and nxt == '*':
                state = 'block'; code.append('  '); bare.append('  '); i += 2; continue
            if ch == '/' and (last == '' or last in _RE_ALLOWED_PREV):
                state = 'regex'; in_class = False
                code.append(ch); bare.append(' '); i += 1; continue
            if ch in ('"', "'", '`'):
                state = ch; code.append(ch); bare.append(ch); i += 1; continue
            code.append(ch); bare.append(ch)
            if not ch.isspace():
                last = ch
            i += 1; continue

        if state == 'line':
            if ch == '\n':
                state = None; code.append('\n'); bare.append('\n')
            else:
                code.append(' '); bare.append(' ')
            i += 1; continue

        if state == 'block':
            if ch == '*' and nxt == '/':
                state = None; code.append('  '); bare.append('  '); i += 2; continue
            c = '\n' if ch == '\n' else ' '
            code.append(c); bare.append(c); i += 1; continue

        if state == 'regex':
            if ch == '\\':
                code.append(src[i:i + 2]); bare.append('  '); i += 2; continue
            if ch == '[':
                in_class = True
            elif ch == ']':
                in_class = False
            elif ch == '/' and not in_class:
                state = None; last = '/'
                code.append(ch); bare.append(' '); i += 1; continue
            elif ch == '\n':      # незакрытая регулярка — значит это было деление
                state = None; code.append('\n'); bare.append('\n'); i += 1; continue
            code.append(ch); bare.append(' '); i += 1; continue

        # внутри строкового литерала
        if ch == '\\':
            code.append(src[i:i + 2]); bare.append('  '); i += 2; continue
        if ch == state:
            state = None; last = ch
            code.append(ch); bare.append(ch); i += 1; continue
        code.append(ch); bare.append('\n' if ch == '\n' else ' ')
        i += 1; continue
    return ''.join(code), ''.join(bare)


def line_of(src, idx):
    return src.count('\n', 0, idx) + 1


def string_spans(code, bare, start=0, end=None):
    """Границы строковых литералов: [(i_кавычка, i_кавычка, символ)].

    Парная кавычка ищется в bare, где содержимое и экранированные пары
    затёрты, — поэтому не ловится ни апостроф внутри строки, ни смешение
    ' и " в одной функции. Разбор регуляркой по коду на таком смешении
    разъезжается и выдаёт куски КОДА за содержимое строк (RETRO 60).
    """
    if end is None:
        end = len(bare)
    out = []
    i = start
    while i < end:
        ch = bare[i]
        if ch in ('"', "'", '`'):
            j = bare.find(ch, i + 1)
            if j == -1 or j >= end:
                break
            out.append((i, j, ch))
            i = j + 1
            continue
        i += 1
    return out


def comments_of(src, code):
    """Тексты комментариев целиком. `//` внутри строки сюда не попадает."""
    out = []
    for m in re.finditer(r'//|/\*', src):
        i = m.start()
        if code[i:i + 2] != '  ':
            continue
        if src[i + 1] == '/':
            j = src.find('\n', i)
        else:
            j = src.find('*/', i + 2)
            j = -1 if j == -1 else j + 2
        out.append(src[i:len(src) if j == -1 else j])
    return out


def match_braces(bare, start):
    """От индекса открывающей '{' в bare вернуть индекс парной '}' или -1."""
    depth = 0
    for i in range(start, len(bare)):
        if bare[i] == '{':
            depth += 1
        elif bare[i] == '}':
            depth -= 1
            if depth == 0:
                return i
    return -1


def match_parens(bare, start):
    """От индекса открывающей '(' в bare вернуть индекс парной ')' или -1."""
    depth = 0
    for i in range(start, len(bare)):
        if bare[i] == '(':
            depth += 1
        elif bare[i] == ')':
            depth -= 1
            if depth == 0:
                return i
    return -1


def flat(txt):
    """Тело функции без пробелов — для сравнения «то же самое или переписано»."""
    return re.sub(r'\s+', '', txt or '')


_FN_FORMS = [
    r'function\s+{n}\s*\(',
    r'var\s+{n}\s*=\s*function\s*\w*\s*\(',
    r'\b{n}\s*[:=]\s*function\s*\w*\s*\(',
]


def find_span(code, bare, name):
    """Границы тела функции (i_после_{, i_}) или None."""
    for form in _FN_FORMS:
        m = re.search(form.format(n=re.escape(name)), bare)
        if not m:
            continue
        br = bare.find('{', m.end())
        if br == -1:
            continue
        end = match_braces(bare, br)
        if end == -1:
            continue
        return (br + 1, end)
    return None


def find_function(code, bare, name):
    """Тело функции по любой из форм объявления. None — функция не найдена."""
    sp = find_span(code, bare, name)
    return None if sp is None else code[sp[0]:sp[1]]


def notes_section(txt, num):
    m = re.search(r'^##\s*§' + str(num) + r'\b.*?$(.*?)(?=^##\s*§|\Z)', txt, re.M | re.S)
    return m.group(1) if m else ''


# ── FACTS: машинная зона в NOTES §2 ──────────────────────────────────────────
# Машиночитаемое число M пишет машина, агент руками его не ведёт: транскрипция
# измеренного числа и была источником ложных FAIL.
FACTS_OPEN = '<!--FACTSLayout: начало — пишет check.py --sync, руками не менять-->'
FACTS_CLOSE = '<!--FACTSLayout: конец-->'
FACTS_RE = re.compile(
    re.escape(FACTS_OPEN) + r'.*?M\s*=\s*(\d+).*?' + re.escape(FACTS_CLOSE), re.S)


def facts_m(txt):
    """M из машинной зоны NOTES или None."""
    m = FACTS_RE.search(txt)
    return int(m.group(1)) if m else None


def count_lines(path):
    if not os.path.isfile(path):
        return None
    with open(path, encoding='utf-8', errors='replace') as fh:
        return sum(1 for _ in fh)


def sync_notes(notes_path, html_path):
    """Обновить/создать FACTS-зону в NOTES §2. True — файл изменился."""
    if not os.path.isfile(notes_path):
        return False
    txt = open(notes_path, encoding='utf-8', errors='replace').read()
    real = count_lines(html_path)
    if real is None:
        return False   # макета нет — синхронизировать нечего (K1 скажет сам)
    zone = (FACTS_OPEN + '\nM = ' + str(real) + ' · wc -l '
            + os.path.basename(html_path) + ' · sync '
            + datetime.datetime.now().strftime('%Y-%m-%dT%H:%M') + '\n'
            + FACTS_CLOSE)
    m = re.search(re.escape(FACTS_OPEN) + r'.*?' + re.escape(FACTS_CLOSE), txt, re.S)
    if m:
        if m.group(0) == zone:
            return False
        txt = txt[:m.start()] + zone + txt[m.end():]
    elif re.search(r'^##\s*§2\b', txt, re.M):
        m2 = re.search(r'^##\s*§2\b.*?$(.*?)(?=^##\s*§|\Z)', txt, re.M | re.S)
        txt = txt[:m2.end(1)] + '\n' + zone + '\n' + txt[m2.end(1):]
    else:
        return False
    open(notes_path, 'w', encoding='utf-8').write(txt)
    return True


def detect_mode(txt):
    """Режим работы из NOTES §0: строка «Режим: A|B …». Нет — None."""
    m = re.search(r'^\s*\**Режим:\**\s*\**\s*([AB])\b', notes_section(txt, 0), re.M)
    if not m:
        m = re.search(r'^\s*\**Режим:\**\s*\**\s*([AB])\b', txt, re.M)
    return m.group(1) if m else None


# ── контекст ─────────────────────────────────────────────────────────────────

class Ctx(object):
    """Разобранный чарт и его окружение. Строится один раз, читается всеми.

    Ленивые свойства считаются при первом обращении и кэшируются: проверке
    не нужно знать, кто ещё просил склеенный CSS.
    """

    def __init__(self, path, raw, is_tpl=False, skill_dir=None):
        self.path = path
        self.raw = raw
        self.is_tpl = is_tpl
        self.skill_dir = skill_dir or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.code, self.bare = scan(raw)
        assert len(self.code) == len(raw) == len(self.bare), \
            'проекции разъехались с оригиналом'
        self.lines = raw.splitlines()
        self.code_lines = self.code.splitlines()
        mns = re.search(r"\bns\s*:\s*['\"]([\w-]+)['\"]", self.code)
        self.ns = mns.group(1) if mns else 'pvt'
        self.base = re.sub(r'\.chart\.js$', '', path)
        self.folder = os.path.dirname(os.path.abspath(path))
        self.tpl_dir = os.path.join(self.skill_dir, 'templates')
        # Режим проставляет Engine.resolve_mode ДО первой проверки.
        self.mode = 'A'
        self.mode_declared = None
        self._cache = {}

    # -- общие помощники, чтобы проверки не звали модульные функции напрямую --
    def fn(self, name):
        return find_function(self.code, self.bare, name)

    def span(self, name):
        return find_span(self.code, self.bare, name)

    def line_at(self, idx):
        return line_of(self.raw, idx)

    def _memo(self, key, make):
        if key not in self._cache:
            self._cache[key] = make()
        return self._cache[key]

    # -- разобранные куски чарта ------------------------------------------------
    @property
    def html_body(self):
        return self._memo('html', lambda: self.fn('buildHTML'))

    @property
    def css_span(self):
        return self._memo('css_span', lambda: self.span('buildCSS'))

    @property
    def css_body(self):
        def make():
            sp = self.css_span
            return None if sp is None else self.code[sp[0]:sp[1]]
        return self._memo('css_body', make)

    @property
    def flat_css(self):
        from . import cssglue
        return self._memo('flat_css', lambda: cssglue.css_text(
            self.code, self.bare, self.css_span, self.ns))

    @property
    def rules(self):
        from . import cssglue
        return self._memo('rules', lambda: cssglue.css_rules(self.flat_css))

    @property
    def render_body(self):
        return self._memo('render', lambda: self.fn('render'))

    @property
    def has_tip(self):
        return self._memo('has_tip', lambda:
                          'tip' in self.bare.lower() or 'tooltip' in self.bare.lower())

    @property
    def tip_rule(self):
        """Тело CSS-правила тултипа в СКЛЕЕННОМ CSS ('' — правила нет)."""
        def make():
            for sel, rbody in self.rules:
                if re.search(r'-tip\s*$', sel) or re.search(r'-tip[.:\s,]', sel + ' '):
                    return rbody
            return ''
        return self._memo('tip_rule', make)

    @property
    def comments(self):
        return self._memo('comments', lambda: comments_of(self.raw, self.code))

    # -- соседние файлы проекта --------------------------------------------------
    def _read(self, path):
        try:
            return open(path, encoding='utf-8', errors='replace').read()
        except OSError:
            return None

    @property
    def notes_path(self):
        return self.base + '.NOTES.md'

    @property
    def html_path(self):
        return self.base + '.html'

    @property
    def notes(self):
        return self._memo('notes', lambda: self._read(self.notes_path))

    @property
    def fields_txt(self):
        return self._memo('fields', lambda:
                          self._read(os.path.join(self.folder, 'FIELDS.md')))

    @property
    def report_txt(self):
        return self._memo('report', lambda:
                          self._read(os.path.join(self.folder, 'SELF_CHECK.md')))

    @property
    def html_lines(self):
        return self._memo('html_lines', lambda: count_lines(self.html_path))

    def tpl(self, name):
        """Текст файла из templates/ или None."""
        return self._memo('tpl:' + name,
                          lambda: self._read(os.path.join(self.tpl_dir, name)))
