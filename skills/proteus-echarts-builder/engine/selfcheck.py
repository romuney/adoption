# -*- coding: utf-8 -*-
"""selfcheck — отчёт о сдаче: машина пишет факты, агент пишет суждения.

ПОЧЕМУ ЭТО ПЕРЕПИСАНО. Прежний Z6 требовал, чтобы агент перечислил в отчёте
все 78 ID чек-листа дословно. Около шестидесяти из них помечены в мастере
`(auto)` — их вердикт validate.py к этому моменту уже посчитал. То есть агент
переписывал руками то, что машина знает, а проверка сверяла, что он ничего
не пропустил при переписывании.

Цена известна: в прогоне «иерархический-фильтр» ТРИ прогона из шести ушли
на канцелярию уже ПОСЛЕ того, как код стал зелёным. Сначала схлопнутые
диапазоны ID («S1–S20» вместо двадцати строк) — Z6 не досчитался 18 пунктов.
Потом формулировка N/A прозой. Ни одна из этих итераций не касалась виджета.

Это ровно тот класс, который v9 уже снял для числа M: «машиночитаемое пишет
машина, агент транскрибирует только то, что машина знать не может». Здесь
тот же принцип доведён до отчёта.

КАК УСТРОЕНО. Файл проекта SELF_CHECK.md генерируется:

  - МАШИННАЯ ЧАСТЬ — таблица всех авто-пунктов со статусом текущего прогона
    и отпечатком. Агент её не трогает; устаревшую видно по отпечатку.
  - СУЖДЕНИЯ — пункты, которые машина проверить не может (соответствие
    макету, смысл данных, диалог с пользователем). Их заполняет агент,
    и только их.

Перегенерация СОХРАНЯЕТ заполненные суждения: иначе второй прогон стирал бы
работу агента, и файл нельзя было бы обновлять.
"""

import datetime
import hashlib
import os
import re

AUTO_BEGIN = '<!--AUTO:begin'
AUTO_END = '<!--AUTO:end-->'
HUMAN_BEGIN = '<!--HUMAN:begin-->'
HUMAN_END = '<!--HUMAN:end-->'

_FP_RE = re.compile(re.escape(AUTO_BEGIN) + r'\s+fp=([0-9a-f]+)')


def points(master_txt, mode):
    """СУЖДЕНИЯ для режима: [(id, текст)].

    Договор о составе отчёта живёт в САМОМ мастер-файле: маркеры
    `<!--mode:AB-->` у секций читают и человек, и эта функция. Документ
    и его проверка разъехаться структурно не могут.

    Машинных пунктов здесь нет ВООБЩЕ — они берутся из вердикта прогона.
    Раньше мастер дублировал коды проверок списком `(auto)`, и список
    успел разъехаться с checks.json: пункты `C3`, `D1`, `S11`, `Z7`
    ссылались на коды, которых не существует. Дублировать источник истины
    и потом сверять копии — это и есть та работа, которую здесь убирают.
    """
    out, cur = [], 'AB'
    for ln in master_txt.splitlines():
        if re.search(r'^##\s+([A-Z])[.\s]', ln):
            mm = re.search(r'<!--\s*mode:\s*([AB]+)\s*-->', ln)
            cur = mm.group(1) if mm else 'AB'
        pm = re.match(r'^- \[ \] ([A-Z]\d+[a-z]?)\.\s*(.*)$', ln)
        if pm and mode in (cur or 'AB'):
            title = re.sub(r'\s+', ' ', pm.group(2)).strip()
            out.append((pm.group(1), title))
    return out


def fingerprint(verdict):
    """Отпечаток машинной части: {ID: статус} → sha1.

    Он и есть защита от устаревшего отчёта. Правка кода меняет статусы,
    значит меняет отпечаток, значит сгенерированный блок обязан быть
    переписан — «зелено, но по прошлому прогону» становится видно.
    """
    body = ';'.join(k + '=' + verdict[k] for k in sorted(verdict))
    return hashlib.sha1(body.encode('utf-8')).hexdigest()[:12]


def _parse_human(txt):
    """Уже заполненные суждения из существующего файла: {id: (статус, док)}.

    Последняя ячейка строки — «Что требуется», её пишет рендер из мастера
    и при переносе она НЕ является доказательством. Забирать хвост целиком
    нельзя: рендер допишет требование снова, и каждая перегенерация будет
    приписывать ещё одну копию (в реальном прогоне — пять копий подряд).
    Хвост перед ней оставляем склеенным: доказательство с «|» внутри
    легитимно и не должно обрезаться.
    """
    out = {}
    if not txt:
        return out
    m = re.search(re.escape(HUMAN_BEGIN) + r'(.*?)' + re.escape(HUMAN_END), txt, re.S)
    zone = m.group(1) if m else txt
    for row in re.findall(r'^\|(.+)\|\s*$', zone, re.M):
        cells = [x.strip() for x in row.split('|')]
        if len(cells) < 3:
            continue
        cid = cells[0].strip('` ')
        if not re.fullmatch(r'[A-Z]\d+[a-z]?', cid):
            continue
        proof = cells[2] if len(cells) == 3 else ' | '.join(cells[2:-1]).strip()
        out[cid] = (cells[1], proof)
    return out


def render(name, mode, verdict, messages, master_txt, previous=None, order=None):
    """Текст SELF_CHECK.md проекта.

    previous — прежний файл: из него переносятся уже заполненные суждения,
    иначе второй прогон стирал бы работу агента.
    order — порядок кодов из checks.json, чтобы машинная часть читалась
    в том же порядке, что и вывод чекеров.
    """
    human = points(master_txt, mode)
    seq = [cid for cid in (order or []) if cid in verdict]
    seq += [cid for cid in verdict if cid not in seq]
    auto = [(cid, messages.get(cid, '')) for cid in seq]
    kept = _parse_human(previous)
    fp = fingerprint(verdict)
    ts = datetime.datetime.now().strftime('%Y-%m-%dT%H:%M')

    L = []
    L.append('# SELF_CHECK — ' + name)
    L.append('')
    L.append('Машинную часть пишет `check.py`. Руками правится ТОЛЬКО колонка')
    L.append('«Доказательство» в разделе «Суждения» — там, где машина судить не может.')
    L.append('')
    L.append('| | |')
    L.append('|---|---|')
    L.append('| Режим | ' + mode + (' — новая визуализация' if mode == 'A'
                                    else ' — точечная правка') + ' |')
    L.append('| Прогон | ' + ts + ' |')
    L.append('')
    L.append('## Машинная часть — вердикт прогона')
    L.append('')
    L.append(AUTO_BEGIN + ' fp=' + fp + ' at=' + ts + ' -->')
    L.append('| ID | Статус | Что проверено |')
    L.append('|---|---|---|')
    for cid, msg in auto:
        st = verdict.get(cid, '—')
        L.append('| ' + cid + ' | ' + st + ' | '
                 + re.sub(r'\s*\|\s*', ' / ', msg or '')[:150] + ' |')
    L.append(AUTO_END)
    L.append('')
    L.append('## Суждения — заполняет агент')
    L.append('')
    L.append('Статус: `PASS` / `FAIL` / `N/A`. Доказательство: `файл:строка`')
    L.append('или одна фраза. Пустая строка = пункт не пройден (ловит Z6).')
    L.append('')
    L.append(HUMAN_BEGIN)
    L.append('| ID | Статус | Доказательство | Что требуется |')
    L.append('|---|---|---|---|')
    for cid, title in human:
        st, proof = kept.get(cid, ('', ''))
        L.append('| ' + cid + ' | ' + st + ' | ' + proof + ' | '
                 + re.sub(r'\s*\|\s*', ' / ', title)[:110] + ' |')
    L.append(HUMAN_END)
    L.append('')
    return '\n'.join(L) + '\n'


def write(path, name, mode, verdict, messages, master_txt, order=None):
    """Сгенерировать/обновить отчёт проекта. Возвращает (всего, заполнено)."""
    prev = None
    if os.path.isfile(path):
        prev = open(path, encoding='utf-8', errors='replace').read()
    txt = render(name, mode, verdict, messages, master_txt, prev, order)
    if prev != txt:
        open(path, 'w', encoding='utf-8').write(txt)
    return audit_counts(txt)


def audit_counts(txt):
    rows = _parse_human(txt)
    total = len(rows)
    filled = sum(1 for st, pr in rows.values() if st and pr)
    return total, filled


def audit(txt, verdict):
    """Проблемы отчёта для Z6. [] — отчёт в порядке.

    Проверяется ровно две вещи, и обе машиночитаемы:
      1. машинная часть не устарела (отпечаток совпадает с этим прогоном);
      2. каждое СУЖДЕНИЕ заполнено — статус и доказательство.
    Переписывать ID руками больше не нужно, значит и не с чем ошибиться.
    """
    if not txt:
        return ['файла нет']
    problems = []
    m = _FP_RE.search(txt)
    if not m:
        problems.append('нет машинной части — отчёт написан в своём формате.'
                        ' Его генерирует check.py, сочинять свои разделы не нужно'
                        ' (RETRO 43)')
        return problems
    want = fingerprint(verdict)
    if m.group(1) != want:
        problems.append('машинная часть от ПРОШЛОГО прогона (отпечаток '
                        + m.group(1) + ', сейчас ' + want + ') — код менялся'
                        ' после генерации отчёта. Перезапусти check.py')
    rows = _parse_human(txt)
    if not rows:
        problems.append('раздел «Суждения» пуст')
        return problems
    empty = sorted(cid for cid, (st, pr) in rows.items() if not st or not pr)
    if empty:
        problems.append('не заполнены суждения (' + str(len(empty)) + ' из '
                        + str(len(rows)) + '): ' + ', '.join(empty[:8])
                        + ('…' if len(empty) > 8 else '')
                        + ' — это пункты, которые машина проверить не может:'
                          ' соответствие макету, смысл данных, диалог')
    return problems
