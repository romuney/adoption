#!/usr/bin/env python3
"""Шаблон сборщика папки поставки. Скопируй в stand/pack.py проекта, заполни блок НАСТРОЙКИ и COPIES.

    python3 stand/pack.py            # собрать: пишет только изменившиеся файлы, печатает «файл → менялся ли»
    python3 stand/pack.py --check    # сверить папку с исходниками, ничего не писать (код 1 — разошлись)
    python3 stand/pack.py --gate     # после сборки прогнать kit/sqlgate.py по SQL поставки

Правила (playbook, 14-delivery.md):
  * исходники — источник правды; в папке поставки руками правят только файлы из KEEP («0. Инструкция.md»);
  * номер файла закреплён за объектом Proteus навсегда: «замени из файла N целиком»;
  * один исходник на варианты: вариант — подстановка ровно одной строки (one_line падает, если строк не одна);
  * JS чарта — сжатая сборка terser 5.51.2 (kit/min.cjs): код чарта едет в каждом POST chart/data;
  * id чартов борда — из BOARD_IDS вместо уникальных числовых заглушек (000000, 111111…), заглушек не остаётся;
  * штамп «отчёт · поставка N · дата · sha12 исходника» — в шапке каждого файла (у JSON и raw шапки нет: формат);
    дата — константа DATE, а не «сегодня», иначе --check расходится на следующий день;
  * SQL Lab-файлы: ни одного «system» и SHOW (SQL Lab Proteus: «Использование "system" запрещено») — сборка падает;
  * сборка в два прохода: сначала собираются все файлы, пишутся — только если собрались все (иначе папка
    наполовину новая, и «Заменить в «Что нового»» следующей сборки не назовёт уже переписанные файлы).
Нужны node и terser@5.51.2 глобально (kit/setup.sh); без них сборка JS падает, а не пропускается.
Код выхода: 0 — собрано / совпало; 1 — сборка упала или --check разошёлся; 2 — неверный вызов.
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import unicodedata

# ─────────────────────────────── НАСТРОЙКИ (заполнить) ───────────────────────────────
REPORT = 'Отчёт'                       # имя отчёта: в шапках и в имени папки
DELIVERY = '1'                         # номер поставки — поднимай при выпуске
DATE = '2026-10-08'                    # дата поставки — руками (штамп не зависит от дня сборки)
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))   # корень репозитория
OUT = os.path.join(ROOT, 'Поставка — %s' % REPORT)
KIT = os.environ.get('PLAYBOOK_KIT') or os.path.join(ROOT, 'kit')                         # где kit/min.cjs, sqlgate.py
KIT_PY = os.environ.get('PLAYBOOK_PY') or os.path.expanduser('~/.venvs/proteus-kit/bin/python')  # venv из kit/setup.sh
SEND_KBPS = 50                         # отправка у владельца ≈ 50 КБ/с (DevTools 07.10): код чарта — в каждом POST
JS_BUDGET_KB = 150                     # сжатая сборка больше — сборка падает (≈ 3 с на каждый запрос данных)
BUILD_CMD = 'python3 stand/pack.py'

# id чартов на борде: заглушка исходника → id (None — ещё не прислан: заглушка остаётся, шапка просит Ctrl+H)
BOARD_IDS = {
    '000000': None,                    # чарт «Отчёт»
}

# (исходник от ROOT, файл поставки, вид, подстановки [(строка исходника, замена)][, флаги kit/min.cjs])
# вид: dataset — SQL датасета; sqllab — SQL для SQL Lab; js — код чарта (сжатие); css — CSS борда (id чартов);
#      snippet — сниппет DevTools (id чартов, без сжатия); json — JSON-метаданные (проверка формата, без шапки);
#      py — параграф/ноутбук Python (шапка #); raw — байт в байт.
COPIES = [
    ('proteus/report.data.sql', '1. Датасет «Отчёт».sql', 'dataset', []),
    ('proteus/report.chart.js', '2. Чарт «Отчёт».js', 'js', []),
    ('proteus/report.board.css', '3. CSS борда.css', 'css', []),
    ('proteus/report.sqllab.sql', '4. SQL Lab — проверка на бою.sql', 'sqllab', []),
    ('proteus/report.board-check.js', '5. Проверка на бою — разметка борда (DevTools).js', 'snippet', []),
]
# файлы папки поставки, которые пишет человек (сборщик их не трогает и не считает лишними)
KEEP = ['0. Инструкция.md']
# ───────────────────────────────────────────────────────────────────────────────────────


class BuildError(Exception):
    """Файл не собрался: сообщение — что и где; сборка падает целиком, ничего не записав."""


def sha12(text):
    return hashlib.sha1(text.encode('utf-8')).hexdigest()[:12]


def stamp(src, text):
    """Одна строка штампа: что, откуда, где править."""
    return ('%s · поставка %s · %s · %s %s · СОБРАН АВТОМАТИЧЕСКИ: не правьте здесь — исходник %s, сборка — %s'
            % (REPORT, DELIVERY, DATE, os.path.basename(src), sha12(text), src, BUILD_CMD))


def one_line(text, old, new, where=''):
    """Подстановка варианта: строка должна встречаться в исходнике ровно один раз."""
    n = text.count(old)
    if n != 1:
        raise BuildError('%s: строка должна встречаться ровно один раз (найдено %d): %r' % (where, n, old.strip()[:80]))
    return text.replace(old, new)


def read_source(path, where):
    """Исходник как текст UTF-8 (\r\n → \n, как текстовый режим Python); BOM убирается. Нет файла, не UTF-8 —
    BuildError с понятным текстом, а не трассировка."""
    try:
        raw = open(path, 'rb').read()
    except OSError as ex:
        raise BuildError('%s: исходник не прочитан: %s' % (where, ex))
    if raw.startswith(b'\xef\xbb\xbf'):
        raw = raw[3:]
    try:
        text = raw.decode('utf-8')
    except UnicodeDecodeError as ex:
        raise BuildError('%s: исходник %s не в UTF-8 (байт 0x%02x, строка %d) — пересохраните или дайте вид raw'
                         % (where, path, raw[ex.start], raw.count(b'\n', 0, ex.start) + 1))
    return text.replace('\r\n', '\n').replace('\r', '\n')


REGEX_PREV = set('(,=:[!&|?{};+-*%<>~^')
REGEX_KW = {'return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'throw', 'else', 'do', 'instanceof'}


def js_code_only(text):
    """Текст JS с комментариями, заменёнными пробелами (строки '…', "…", `…` и литералы /…/ не трогаются): для поиска
    id в коде. Литерал регулярки отличается от деления по предыдущему значимому символу или слову (return, typeof…)."""
    out, i, n = [], 0, len(text)
    prev, word, gap = '', '', False  # последний значимый символ кода, слово, которым он кончается; был ли пробел
    while i < n:
        c = text[i]
        if c in '\'"`':
            j = i + 1
            while j < n and text[j] != c:
                j += 2 if text[j] == '\\' else 1
            j = min(j + 1, n)
            out.append(text[i:j])
            prev, word, i = c, '', j
            continue
        if text.startswith('//', i):
            j = text.find('\n', i)
            j = n if j < 0 else j
            out.append(' ' * (j - i))
            i = j
            continue
        if text.startswith('/*', i):
            j = text.find('*/', i + 2)
            j = n if j < 0 else j + 2
            out.append(re.sub(r'[^\n]', ' ', text[i:j]))
            i = j
            continue
        if c == '/' and (prev == '' or prev in REGEX_PREV or word in REGEX_KW):
            j, cls = i + 1, False        # литерал регулярки: до «/» вне класса […], с флагами
            while j < n and text[j] != '\n':
                ch = text[j]
                if ch == '\\':
                    j += 2
                    continue
                if ch == '[':
                    cls = True
                elif ch == ']':
                    cls = False
                elif ch == '/' and not cls:
                    break
                j += 1
            j += 1
            while j < n and text[j].isalpha():
                j += 1
            out.append(text[i:j])
            prev, word, i = '/', '', j
            continue
        out.append(c)
        if c.isspace():
            gap = True                   # пробел кончает слово, но «return /…/» слово помнит
        else:
            ident = c.isalnum() or c in '_$'
            if not ident:
                word = ''
            elif word and not gap and (prev.isalnum() or prev in '_$'):
                word += c
            else:
                word = c
            prev, gap = c, False
        i += 1
    return ''.join(out)


def board_ids(text, where, mode):
    """Заглушки id → id чартов борда (DV-05, DV-24).
    css: в коде — только в «chart-id-<заглушка>» (#chart-id-, .dashboard-chart-id-…); в комментариях /* … */ — целым
         словом (шапка «что заменить»). Заглушка в коде не на месте id (например, цвет #000000) — сборка падает:
         заглушка не уникальна, выберите другую.
    snippet: заглушка целым словом везде (сниппет DevTools, DV-30); цвет «#<заглушка>» в коде — сборка падает
         (иначе цвет молча станет id).
    Боевой id, уже стоящий в КОДЕ исходника (не в комментарии и не в цвете), — сборка падает: в исходнике только
    заглушки. Возвращает (текст, заглушки без id — их владелец заменит руками, использованные заглушки, заметки).
    Заметка — комментарий исходника с заглушкой и просьбой «замените / Ctrl+H»: после подстановки он просит владельца
    заменить уже боевой id (просьбу о Ctrl+H пишет сам сборщик, когда id нет)."""
    todo, used, hints = [], [], []
    if mode == 'css':
        comments = re.findall(r'/\*.*?\*/', text, flags=re.S)
    else:
        comments = re.findall(r'/\*.*?\*/', text, flags=re.S) + re.findall(r'(?:^[ \t]*//[^\n]*\n?)+', text, flags=re.M)
    ask = re.compile(r'(?i)замените|заменить|ctrl\s*\+\s*h')
    for ph, real in BOARD_IDS.items():
        word = re.compile(r'(?<![0-9A-Za-z_])%s(?![0-9A-Za-z_])' % re.escape(ph))
        if mode == 'css':
            parts = re.split(r'(/\*.*?\*/)', text, flags=re.S)       # нечётные — комментарии
            code = ''.join(parts[0::2])
        else:
            parts, code = None, js_code_only(text)
        if word.search(text):
            used.append(ph)
        if mode == 'css':
            in_id = len(re.findall(r'(?<=chart-id-)%s(?![0-9])' % re.escape(ph), code))
            stray = len(word.findall(re.sub(r'chart-id-%s(?![0-9])' % re.escape(ph), '', code)))
        else:
            in_id = len(word.findall(text))
            stray = len(re.findall(r'#%s(?![0-9A-Za-z_])' % re.escape(ph), code))
        if stray:
            raise BuildError('%s: заглушка %s есть в коде не на месте id чарта (%d раз; цвет #%s?) — выберите '
                             'уникальную заглушку (DV-05)' % (where, ph, stray, ph))
        if not real:
            if in_id:
                todo.append(ph)
            continue
        if re.search(r'(?<![0-9A-Za-z_#])%s(?![0-9A-Za-z_])' % re.escape(str(real)), code):
            raise BuildError('%s: id %s уже стоит в коде исходника — в исходнике должны быть только заглушки'
                             % (where, real))
        if any(word.search(cm) and ask.search(cm) for cm in comments):
            hints.append('комментарий исходника просит заменить %s (Ctrl+H), а сборщик уже подставил %s — перепишите '
                         'его («id подставлены сборщиком»)' % (ph, real))
        if mode == 'css':
            for i in range(len(parts)):
                if i % 2:
                    parts[i] = word.sub(str(real), parts[i])
                else:
                    parts[i] = re.sub(r'(?<=chart-id-)%s(?![0-9])' % re.escape(ph), str(real), parts[i])
            text = ''.join(parts)
        else:
            text = word.sub(str(real), text)
        if re.search(r'(?<![0-9])%s(?![0-9])' % re.escape(ph), text):
            raise BuildError('%s: заглушка %s осталась после подстановки (часть другого числа?) — выберите '
                             'уникальную заглушку (DV-05)' % (where, ph))
    return text, todo, used, hints


SQLLAB_FORBIDDEN = [(re.compile(r'(?i)system'), 'system'), (re.compile(r'(?i)\bshow\b'), 'SHOW')]


def sqllab_guard(text, where, notes):
    for rx, word in SQLLAB_FORBIDDEN:
        m = rx.search(text)
        if m:
            raise BuildError('%s: слово «%s» в строке %d — SQL Lab Proteus отвергнет файл («Использование "system" '
                             'запрещено»)' % (where, word, text.count('\n', 0, m.start()) + 1))
    if re.search(r'(?i)\breplace\b', text) and 'REPLACE' not in ' '.join(notes):
        notes.append('REPLACE в SQL Lab-файле — отказ не подтверждён боем, проверьте')


def npm_root():
    try:
        return subprocess.run(['npm', 'root', '-g'], capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return ''


def minify(text, head, where, extra=()):
    """kit/min.cjs: node min.cjs 'шапка' --check --budget КБ < in.js > out.js (terser 5.51.2, ES5, верхний уровень
    не трогается; --check: разбор как ES5, option на месте, имена верхнего уровня, без eval). extra — флаги min.cjs
    (например ['--css-var', 'TP_CSS'])."""
    mincjs = os.path.join(KIT, 'min.cjs')
    if not os.path.exists(mincjs):
        raise BuildError('нет %s — нужен kit/min.cjs из playbook (PLAYBOOK_KIT=<путь к kit>)' % mincjs)
    cmd = ['node', mincjs, head, '--check', '--budget', str(JS_BUDGET_KB), '--kbps', str(SEND_KBPS)] + list(extra)
    env = dict(os.environ, NODE_PATH=os.environ.get('NODE_PATH') or npm_root())
    try:
        r = subprocess.run(cmd, input=text, capture_output=True, text=True, encoding='utf-8', env=env)
    except OSError as ex:
        raise BuildError('%s: node не запустился (%s) — поставьте node и npm i -g terser@5.51.2 (kit/setup.sh)'
                         % (where, ex))
    if r.returncode:
        raise BuildError('%s: сборка не прошла (min.cjs, код %d; бюджет %d КБ): %s'
                         % (where, r.returncode, JS_BUDGET_KB, (r.stderr or r.stdout).strip()[-600:]))
    out = r.stdout
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as f:
        f.write(out)
        tmp = f.name
    try:
        chk = subprocess.run(['node', '--check', tmp], capture_output=True, text=True, encoding='utf-8')
    finally:
        os.unlink(tmp)
    if chk.returncode:
        raise BuildError('%s: сборка не проходит node --check: %s' % (where, chk.stderr[-300:]))
    return out


def build_one(src, name, kind, subs, extra=()):
    """→ (байты файла поставки, заметки, использованные заглушки id). extra — флаги kit/min.cjs для вида js."""
    path = os.path.join(ROOT, src)
    if kind == 'raw':                     # байт в байт: картинка, xlsx, файл человека — без шапки и без декодирования
        if subs:
            raise BuildError('%s: у вида raw подстановок не бывает' % name)
        try:
            return open(path, 'rb').read(), [], []
        except OSError as ex:
            raise BuildError('%s: исходник не прочитан: %s' % (name, ex))
    text = read_source(path, name)
    for old, new in subs:
        text = one_line(text, old, new, name)
    st = stamp(src, text)
    notes, used = [], []
    if kind == 'dataset':
        m = re.findall(r"\{% set BUILD = '[^']*' %\}", text)
        if len(m) == 1:   # штамп и в ответ (meta.build), если датасет его эхом отдаёт
            text = text.replace(m[0], "{% set BUILD = '" + '%s/%s/%s' % (DELIVERY, DATE, sha12(text)) + "' %}")
        out = '{# %s #}\n%s' % (st, text)
        if re.search(r'(?i)system', text):
            notes.append('слово «system» в датасете — в SQL Lab его не запустить')
    elif kind == 'sqllab':
        sqllab_guard(text, name, notes)
        out = '-- %s\n%s' % (st, text)
        sqllab_guard(out, name, notes)
    elif kind == 'js':
        out = minify(text, st, name, extra)
        kb = len(out.encode('utf-8')) / 1024
        notes.append('%.1f КБ (исходник %.1f КБ), ≈ %.1f с отправки при %d КБ/с' % (
            kb, len(text.encode('utf-8')) / 1024, kb / SEND_KBPS, SEND_KBPS))
    elif kind == 'css':
        body, todo, used, hints = board_ids(text, name, 'css')
        head = '/* %s */\n' % st
        if todo:
            head += '/* ЗАМЕНИТЕ во всех местах (Ctrl+H) заглушки id чартов: %s */\n' % ', '.join(todo)
            notes.append('не подставлены id: %s' % ', '.join(todo))
        notes.extend(hints)
        out = head + body
    elif kind == 'snippet':
        body, todo, used, hints = board_ids(text, name, 'snippet')
        out = '// %s\n%s' % (st, body)
        if todo:
            notes.append('не подставлены id: %s' % ', '.join(todo))
        notes.extend(hints)
    elif kind == 'json':
        try:
            json.loads(text)          # битый JSON — падение сборки, а не владельца
        except ValueError as ex:
            raise BuildError('%s: JSON не разбирается: %s' % (name, ex))
        out = text
    elif kind == 'py':
        out = '# %s\n%s' % (st, text)
    else:
        raise BuildError('%s: неизвестный вид %r' % (name, kind))
    return out.encode('utf-8'), notes, used


JUNK = {'.DS_Store', 'Thumbs.db', 'desktop.ini'}


def nfc(s):
    return unicodedata.normalize('NFC', s)


def extra_files(names):
    """Файлы папки, которых нет в COPIES и KEEP. Скрытые (.DS_Store Finder и т. п.) и Thumbs.db — не в счёт; имена
    сравниваются в NFC (macOS и архивы дают «й», «ё» разложенными — NFD). Имя в NFD рядом с тем же именем в NFC —
    лишний дубликат."""
    if not os.path.isdir(OUT):
        return []
    want = {nfc(n) for n in list(names) + list(KEEP)}
    listed = os.listdir(OUT)
    raw = set(listed)
    out = []
    for x in sorted(listed):
        if x.startswith('.') or x in JUNK:
            continue
        if nfc(x) in want:
            if x != nfc(x) and nfc(x) in raw:
                out.append((x, 'то же имя в форме Unicode NFD рядом с NFC — удалите этот дубликат'))
            continue
        out.append((x, 'нет в COPIES и KEEP: удалите или впишите (сборщик сам не удаляет)'))
    return out


def main(argv):
    ap = argparse.ArgumentParser(description='Сборщик папки поставки «%s» (шаблон kit/pack_template.py)' % REPORT)
    ap.add_argument('--check', action='store_true', help='сверить папку с исходниками, ничего не писать')
    ap.add_argument('--gate', action='store_true', help='прогнать kit/sqlgate.py по SQL поставки')
    a = ap.parse_args(argv)               # неизвестный флаг (опечатка «--chek») — код 2, а не сборка с записью
    if not COPIES:
        sys.exit('COPIES пуст — впишите файлы поставки')
    names = [c[1] for c in COPIES]
    nums = [n.split('.', 1)[0] for n in names]
    if len(set(nums)) != len(nums):
        sys.exit('номера файлов поставки повторяются: %s' % nums)
    # проход 1: собрать всё в память; ошибка любого файла — выход без записи
    built, used = [], set()
    try:
        for c in COPIES:
            src, name, kind, subs = c[:4]
            data, notes, u = build_one(src, name, kind, subs, c[4] if len(c) > 4 else ())
            built.append((name, src, kind, data, notes))
            used.update(u)
    except BuildError as ex:
        sys.exit('СБОРКА НЕ ПРОШЛА, ничего не записано: %s' % ex)
    # проход 2: сверить и записать
    rows, bad, changed = [], 0, []
    if not a.check:
        os.makedirs(OUT, exist_ok=True)
    for name, src, kind, data, notes in built:
        path = os.path.join(OUT, name)
        old = open(path, 'rb').read() if os.path.exists(path) else None
        same = old == data
        if a.check:
            status = 'ok' if same else ('НЕТ' if old is None else 'РАЗНЫЕ')
            bad += not same
        elif same:
            status = 'без изменений'
        else:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'wb') as f:
                f.write(data)
            status = 'записан' if old is not None else 'новый'
            changed.append(name.split('.', 1)[0])
        rows.append((name, src, kind, status, '; '.join(notes)))
    # лишние файлы: номер файла закреплён за объектом Proteus (DV-01) — старый файл с другим именем путает владельца
    for x, why in extra_files(names):
        rows.append((x, '—', '—', 'ЛИШНИЙ', why))
        if a.check:
            bad += 1
    w = max(len(r[0]) for r in rows)
    print('%s — поставка %s, %s → %s' % (REPORT, DELIVERY, DATE, os.path.relpath(OUT, ROOT)))
    for name, src, kind, status, note in rows:
        print('  %-*s  %-8s %-14s %s' % (w, name, kind, status, note))
    unused = [ph for ph in BOARD_IDS if ph not in used]
    if unused:
        print('  ! заглушки из BOARD_IDS не встретились ни в одном файле css / snippet: %s' % ', '.join(unused))
    if not a.check:
        # против прошлой СБОРКИ в папке, а не против прошлой поставки: между сборками копите список сами или
        # считайте от git-тега поставки (DV-34)
        print('Заменить в «Что нового»: %s' % (', '.join(changed) if changed else 'ничего — копии совпадают'))
    if a.gate:
        sql = [os.path.join(OUT, c[1]) for c in COPIES if c[2] == 'dataset']
        lab = [os.path.join(OUT, c[1]) for c in COPIES if c[2] == 'sqllab']
        gp = os.path.join(KIT, 'sqlgate.py')
        py = KIT_PY if os.path.exists(KIT_PY) else sys.executable
        rc = 0
        if sql:
            rc |= subprocess.run([py, gp] + sql).returncode
        if lab:
            rc |= subprocess.run([py, gp, '--sqllab'] + lab).returncode
        bad += rc
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
