#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
validate.py — механическая проверка <name>.chart.js на контракт Proteus.

НАЗНАЧЕНИЕ: закрывает те пункты сдачи, которые проверяются формально.
НЕ заменяет суждения агента: соответствие макету и смысл данных — его дело.

ЗАПУСК:
    python3 validate.py <path>.chart.js
    python3 validate.py <path>.chart.js --template   # режим пустой болванки
    python3 validate.py <path>.chart.js --quiet      # только FAIL/WARN + итог
    python3 validate.py <path>.chart.js --sync       # обновить FACTS-зону NOTES §2
    python3 validate.py <path>.chart.js --json       # вердикт машиночитаемо
    python3 validate.py <path>.chart.js --accept 'T3=почему это ложная тревога'
    python3 validate.py --selftest                   # проверить сам чекер

Порядок аргументов любой.

КОД ВОЗВРАТА: 0 — сдавать можно, 1 — есть FAIL ПО ВИДЖЕТУ, 2 — ошибка запуска.
FAIL канцелярии (домен process: NOTES/FIELDS) печатается, но код возврата
не роняет: неотмеченный блок в NOTES и мёртвый виджет — разные новости.

--accept — это ОСПАРИВАНИЕ проверки, а не способ закрыть сдачу. Правила —
в SKILL.md, раздел «ОСПАРИВАНИЕ ПРОВЕРКИ».

АРХИТЕКТУРА (подробно — ARCHITECTURE.md): сам движок живёт в engine/.
Этот файл — только разбор аргументов и печать.
"""

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import checks_code, checks_process   # noqa: F401  (регистрируют проверки)
from engine import report
from engine.ctx import Ctx, sync_notes
from engine.registry import Engine

HERE = os.path.dirname(os.path.abspath(__file__))


def parse_accept(args):
    """--accept КОД=причина — и в форме '--accept X=y', и '--accept=X=y'.

    Причина обязательна и не короче 12 символов: «ложное» или «ок» это
    не оспаривание, а способ закрыть сдачу.
    """
    out, rest, i = {}, [], 0
    while i < len(args):
        a = args[i]
        val = None
        if a == '--accept':
            i += 1
            val = args[i] if i < len(args) else ''
        elif a.startswith('--accept='):
            val = a[len('--accept='):]
        else:
            rest.append(a)
            i += 1
            continue
        cid, _, why = (val or '').partition('=')
        cid, why = cid.strip(), why.strip()
        if not cid or len(why) < 12:
            print('--accept ' + (val or '') + ' — нужна форма КОД=причина,'
                  ' и причина словами, не короче 12 символов. Оспаривание'
                  ' не применено.')
        else:
            out[cid] = why
        i += 1
    return out, rest


FLAGS = {'--template', '--quiet', '--selftest', '--sync', '--json'}


def main():
    acc, args = parse_accept(sys.argv[1:])
    flags = set(a for a in args if a.startswith('--'))
    paths = [a for a in args if not a.startswith('--')]
    unknown = flags - FLAGS
    if unknown:
        print('Неизвестный флаг: ' + ', '.join(sorted(unknown)))
        return 2
    if '--selftest' in flags:
        from engine import selftest
        return selftest.run()
    if not paths:
        print(__doc__)
        return 2
    path = paths[0]
    is_tpl = '--template' in flags
    quiet = '--quiet' in flags
    as_json = '--json' in flags
    if not os.path.isfile(path):
        print('Файл не найден: ' + path)
        return 2

    # --sync: машинная зона NOTES §2 обновляется ДО проверок (check.py делает
    # это сам). Число M пишет машина, агент руками его не транскрибирует.
    if '--sync' in flags and not is_tpl:
        base = re.sub(r'\.chart\.js$', '', path)
        if sync_notes(base + '.NOTES.md', base + '.html') and not as_json:
            print('NOTES §2: FACTS-зона синхронизирована (M пересчитан по макету)')

    try:
        raw = open(path, encoding='utf-8').read()
    except (OSError, UnicodeDecodeError) as err:
        print('Не читается ' + path + ': ' + str(err))
        return 2

    c = Ctx(path, raw, is_tpl=is_tpl, skill_dir=HERE)
    eng = Engine(accepted=acc)
    eng.run(c)

    if as_json:
        print(json.dumps({
            'mode': eng.mode,
            'verdict': {cid: st for cid, st, _ in eng.results},
            'messages': {cid: msg for cid, _, msg in eng.results},
            'blocking': eng.blocking(),
            'paperwork': eng.paperwork(),
        }, ensure_ascii=False))
        return 1 if eng.blocking() else 0

    report.print_results(eng.results, eng.manifest, quiet=quiet, header=path)
    return report.print_verdict(eng, quiet=quiet)


if __name__ == '__main__':
    sys.exit(main())
