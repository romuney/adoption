# -*- coding: utf-8 -*-
"""selftest_check — самопроверка СВЯЗКИ: кэш, отчёт, вердикт по доменам.

Всё здесь гоняется БЕЗ БРАУЗЕРА: связка check.py ↔ отчёт ↔ журнал не зависит
от playwright, и проверять её надо там, где она ломается, — в оркестрации.
Браузерную часть закрывает `node smoke.mjs --selftest`.

Каждый случай — регрессия реального прогона:

  1. КЭШ. На REPLAY прежняя версия вливала в свежий вердикт ВЕСЬ
     закэшированный прогон, включая статусы validate. Свежий PASS затирался
     прошлым FAIL: validate печатал «Z6 зелёный», вердикт печатал «FAIL: Z6»,
     и вылечить это удавалось только флагом --full. Два прогона из шести.
  2. ОТЧЁТ. Машинную часть пишет машина; перегенерация обязана СОХРАНИТЬ
     заполненные агентом суждения, иначе второй прогон стирает его работу.
  3. СВЕЖЕСТЬ. Отчёт от прошлого прогона обязан ловиться отпечатком,
     а не доверием.
  4. ДОМЕНЫ. Канцелярия не роняет сдачу, виджет — роняет.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)
FX = os.path.join(SKILL, 'fixtures')


def _say(ok, name, detail=''):
    print((' v  ' if ok else ' X  ') + name + (('\n      ' + detail) if detail and not ok else ''))
    return 0 if ok else 1


def _project(tmp, chart_src='tabs-ok.chart.js'):
    """Мини-проект: чарт + макет + NOTES + FIELDS, как после bootstrap."""
    lt, gt = chr(60), chr(62)
    d = os.path.join(tmp, 'proj')
    os.makedirs(d, exist_ok=True)
    shutil.copy(os.path.join(FX, chart_src), os.path.join(d, 'demo.chart.js'))
    html = lt + 'html' + gt + chr(10) + lt + 'body' + gt + chr(10)
    open(os.path.join(d, 'demo.html'), 'w', encoding='utf-8').write(html)
    open(os.path.join(d, 'demo.data.sql'), 'w', encoding='utf-8').write('select 1 as a\n')
    shutil.copy(os.path.join(SKILL, 'templates', 'TEMPLATE.NOTES.md'),
                os.path.join(d, 'demo.NOTES.md'))
    shutil.copy(os.path.join(SKILL, 'templates', 'TEMPLATE.FIELDS.md'),
                os.path.join(d, 'FIELDS.md'))
    return d


def _run_check(d, *extra):
    p = subprocess.run([sys.executable, os.path.join(SKILL, 'check.py'),
                        'demo.chart.js'] + list(extra),
                       cwd=d, capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr


def case_cache_isolation(tmp):
    """Кэш REPLAY не имеет права подменять свежий вердикт validate (RETRO 70)."""
    d = _project(tmp)
    sys.path.insert(0, SKILL)
    import check as chk
    cwd = os.getcwd()
    os.chdir(d)
    try:
        fp = chk.inputs_fingerprint('demo.chart.js', [], [])
    finally:
        os.chdir(cwd)
    # Подделываем прошлый прогон: smoke был зелёный, а validate тогда ронял S8.
    stale = {'S8': 'FAIL', 'E1': 'PASS', '_inputs': fp, '_smoke_rc': 0,
             '_smoke_out': ' v  E1   PASS  ошибок в консоли нет',
             '_smoke_codes': {'E1': 'PASS'},
             '_smoke_msgs': {'E1': 'ошибок в консоли нет'}}
    with open(os.path.join(d, '.check-history.json'), 'w', encoding='utf-8') as fh:
        json.dump([stale], fh, ensure_ascii=False)

    rc, out = _run_check(d, '--quiet')
    line = next((l for l in out.splitlines() if l.startswith('ВИДЖЕТ')), '')
    ok = 'S8' not in line and 'REPLAY' in out
    return _say(ok, 'кэш REPLAY не подмешивает старые коды validate в свежий вердикт',
                'в вердикте: ' + line)


def case_report_generated(tmp):
    """Машинная часть пишется, суждения перечислены, Z6 честно красный.

    Прогон идёт с --quiet: раньше флаг уходил в сами чекеры, те печатали
    только проблемы — и в машинную часть отчёта попадали одни FAIL/WARN,
    а зелёные коды выглядели непроверенными. Теперь --quiet режет показ
    в консоли, но отчёт собирается из полного вердикта. Архитектура
    «машинную часть пишет машина» — RETRO 69.
    """
    d = _project(tmp)
    rc, out = _run_check(d, '--static', '--quiet')
    p = os.path.join(d, 'SELF_CHECK.md')
    if not os.path.isfile(p):
        return _say(False, 'check.py генерирует SELF_CHECK.md', 'файла нет')
    txt = open(p, encoding='utf-8').read()
    auto = txt.split('<!--AUTO:begin', 1)[1].split('<!--AUTO:end-->', 1)[0]
    ok = ('<!--AUTO:begin' in txt and '<!--HUMAN:begin-->' in txt
          and '| P5h |' in txt and 'Z6' in out
          and '| PASS |' in auto and '| — |' in auto)
    return _say(ok, 'отчёт сгенерирован: полный, даже под --quiet',
                'AUTO-часть: ' + str(len([l for l in auto.splitlines()
                                          if l.startswith('| ')]) - 2) + ' строк'
                + (', нет PASS-строк' if '| PASS |' not in auto else '')
                + (', непроверенные браузерные коды невидимы'
                   if '| — |' not in auto else ''))


def case_report_keeps_judgements(tmp):
    """Перегенерация СОХРАНЯЕТ заполненное агентом — и не раздувает строку.

    Прежний парсер забирал в доказательство ВСЕ хвостовые ячейки, включая
    колонку «Что требуется»; рендер дописывал её снова — и каждая
    перегенерация приписывала ещё одну копию требования. Пять прогонов
    в реальной сессии — пять одинаковых колонок в строке B1.
    """
    d = _project(tmp)
    _run_check(d, '--static', '--quiet')
    p = os.path.join(d, 'SELF_CHECK.md')
    txt = open(p, encoding='utf-8').read()
    filled = txt.replace('| A1 |  |  |', '| A1 | PASS | ответ №1 |')
    if filled == txt:
        return _say(False, 'перегенерация сохраняет суждения агента',
                    'не нашлась пустая строка A1 для заполнения')
    open(p, 'w', encoding='utf-8').write(filled)
    _run_check(d, '--static', '--quiet')
    _run_check(d, '--static', '--quiet')          # вторая перегенерация
    again = open(p, encoding='utf-8').read()
    row = next((l for l in again.splitlines() if l.startswith('| A1 ')), '')
    title = 'Вывод `check.py` вставлен в ответ ДОСЛОВНО'
    ok = 'ответ №1' in row and row.count(title) == 1 and len(row) < 200
    return _say(ok, 'перегенерация сохраняет суждения и не раздувает строку',
                'строка A1 (' + str(len(row)) + ' зн., требование '
                + str(row.count(title)) + '×): ' + row[:150])


def case_report_staleness(tmp):
    """Отчёт от прошлого прогона ловится отпечатком, а не доверием."""
    from engine import selfcheck
    master = open(os.path.join(SKILL, 'SELF_CHECK.md'), encoding='utf-8').read()
    v1 = {'P5': 'PASS', 'S8': 'PASS'}
    txt = selfcheck.render('demo', 'A', v1, {'P5': 'ok', 'S8': 'ok'}, master)
    fresh = selfcheck.audit(txt, v1)
    v2 = {'P5': 'PASS', 'S8': 'FAIL'}          # код изменился после генерации
    stale = selfcheck.audit(txt, v2)
    ok = (not any('ПРОШЛОГО' in x for x in fresh)
          and any('ПРОШЛОГО' in x for x in stale))
    return _say(ok, 'устаревшая машинная часть отчёта ловится отпечатком',
                'fresh=' + str(fresh)[:60] + ' stale=' + str(stale)[:60])


def case_domains(tmp):
    """Канцелярия не роняет сдачу; FAIL по виджету — роняет."""
    d = _project(tmp)
    # NOTES не заполнены -> Z-проверки красные, но это канцелярия.
    rc_paper, out_paper = _run_check(d, '--static', '--quiet')
    paper_line = next((l for l in out_paper.splitlines()
                       if l.startswith('КАНЦЕЛЯРИЯ')), '')
    widget_line = next((l for l in out_paper.splitlines()
                        if l.startswith('ВИДЖЕТ')), '')
    ok1 = ('Z' in paper_line) and widget_line.endswith('—') and rc_paper == 0

    # Ломаем сам виджет: две точки в селекторе -> S5c, это уже сдачу роняет.
    src = open(os.path.join(d, 'demo.chart.js'), encoding='utf-8').read()
    src = src.replace("P + '-root{", "P + '-a.' + P + '-b{color:red;}',\n    P + '-root{", 1)
    open(os.path.join(d, 'demo.chart.js'), 'w', encoding='utf-8').write(src)
    rc_bad, out_bad = _run_check(d, '--static', '--quiet')
    ok2 = rc_bad == 1 and 'S5c' in out_bad
    return _say(ok1 and ok2,
                'вердикт разделён: канцелярия не роняет, виджет роняет',
                'канцелярия rc=' + str(rc_paper) + ' «' + paper_line + '»; '
                'виджет rc=' + str(rc_bad))


CASES = [case_cache_isolation, case_report_generated, case_report_keeps_judgements,
         case_report_staleness, case_domains]


def run():
    print('Самопроверка связки check.py (без браузера):')
    bad = 0
    for fn in CASES:
        tmp = tempfile.mkdtemp(prefix='pvt-chk-')
        try:
            bad += fn(tmp)
        except Exception as err:            # noqa: BLE001 — падение случая это тоже вердикт
            bad += _say(False, fn.__name__, repr(err)[:200])
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    print('Итог: ' + ('связка согласована (код 0).' if not bad
                      else 'расхождений: ' + str(bad) + ' (код 1).'))
    return 1 if bad else 0
