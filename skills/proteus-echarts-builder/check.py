#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check.py — ОДНА команда сдачи: validate.py + smoke.mjs + отчёт + вердикт.

ЗАЧЕМ. Проверки две, и смотрят они на разное: validate.py на форму кода,
smoke.mjs на экран. Пока их гоняли по очереди, правка под вторую ломала
первую: в Test7 smoke стал зелёным на 10-й итерации, следующий прогон
validate упал с 58 до 56. Здесь оба гоняются подряд, выводы печатаются
ДОСЛОВНО, а внизу — один вердикт.

ВЕРДИКТ РАЗДЕЛЁН ПО ДОМЕНАМ. `artifact`/`browser` — про виджет, FAIL роняет
сдачу. `process` — канцелярия служебных файлов: печатается и чинится, но
кода возврата не меняет. Неотмеченный блок в NOTES §5 и мёртвый виджет —
разные новости, а раньше обе роняли сдачу одинаково, и в сессии
«иерархический-фильтр» три прогона из шести ушли на канцелярию УЖЕ ПОСЛЕ
того, как код стал зелёным.

ОТЧЁТ ГЕНЕРИРУЕТСЯ. Рядом с чартом пишется SELF_CHECK.md из двух частей:
машинная (все коды обоих чекеров со статусом этого прогона и отпечатком)
и суждения (то, что машина проверить не может). Агент заполняет ТОЛЬКО
суждения. Z6 сверяет свежесть отпечатка и заполненность суждений —
переписывать коды руками больше не нужно, значит и ошибиться не в чем.

ИНКРЕМЕНТАЛЬНОСТЬ. Браузерный вердикт мемоизируется по отпечатку входов
(чарт + мок + макет --vs + сам smoke.mjs + оспаривания). Входы не менялись —
печатается прошлый вывод с пометкой REPLAY, браузер не запускается.
В КЭШ КЛАДУТСЯ ТОЛЬКО КОДЫ SMOKE: прежняя версия сохраняла объединённый
вердикт и на REPLAY вливала в свежий прогон СТАРЫЕ статусы validate —
Z6 мог быть зелёным в этом прогоне и красным в вердикте, и вылечить это
удавалось только флагом --full.

ЗАПУСК:
    python3 <скилл>/check.py <name>.chart.js
    python3 <скилл>/check.py <name>.chart.js --vs <name>.html    # сверка с макетом
    python3 <скилл>/check.py <name>.chart.js --quiet             # только проблемы
    python3 <скилл>/check.py <name>.chart.js --full              # без мемо
    python3 <скилл>/check.py <name>.chart.js --static            # без браузера
    python3 <скилл>/check.py <name>.chart.js --accept 'T3=почему ложная тревога'
    python3 <скилл>/check.py --selftest                          # проверить связку

КОД ВОЗВРАТА: 0 — сдавать можно, 1 — есть FAIL по виджету, 2 — ошибка запуска.
Код 2 от smoke.mjs (нет playwright) вердикт НЕ роняет: это «не запускалась».
"""

import hashlib
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import selfcheck
from engine.registry import load_manifest

HERE = os.path.dirname(os.path.abspath(__file__))
JOURNAL = '.check-history.json'
KEEP_RUNS = 12

# Флаги, которые check.py разбирает сам и чекерам не передаёт.
# --quiet — из них: он режет ПОКАЗ чекеров, а не их данные, иначе отчёт
# собирался бы из вывода без строк PASS (regress: selftest_check, случай 2).
OWN_FLAGS = {'--full', '--static', '--no-report', '--quiet'}


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True)
    return p.returncode, (p.stdout or '') + (p.stderr or '')


def verdicts(out):
    """{ID: статус} из вывода любого из двух чекеров."""
    got = {}
    for m in re.finditer(r'^\s*[v!X?-]\s+(\S+)\s+(PASS|FAIL|WARN|N/A|ОСПОР)\s+(.*)$',
                         out, re.M):
        got[m.group(1)] = m.group(2)
    return got


def messages(out):
    """{ID: сообщение} из вывода чекера — для машинной части отчёта."""
    got = {}
    for m in re.finditer(r'^\s*[v!X?-]\s+(\S+)\s+(?:PASS|FAIL|WARN|N/A|ОСПОР)\s+(.*)$',
                         out, re.M):
        got[m.group(1)] = m.group(2).strip()
    return got


ROW = re.compile(r'^\s*[v!X?-]\s+(\S+)\s+(PASS|FAIL|WARN|N/A|ОСПОР)\s')


def quiet_view(out):
    """Тот же вывод, но без строк PASS.

    --quiet НЕ передаётся чекерам: отчёт собирается из ПОЛНОГО вердикта,
    иначе в машинную часть попали бы одни провалы, а зелёные коды выглядели
    бы непроверенными. Фильтрует показ, а не данные.
    """
    keep = []
    for ln in out.splitlines():
        m = ROW.match(ln)
        if m and m.group(2) == 'PASS':
            continue
        keep.append(ln)
    return '\n'.join(keep)


def load(path):
    try:
        with open(path, encoding='utf-8') as fh:
            data = json.load(fh)
        return data if isinstance(data, list) else []
    except (OSError, ValueError):
        return []


def sha_file(path):
    try:
        with open(path, 'rb') as fh:
            return hashlib.sha256(fh.read()).hexdigest()
    except OSError:
        return '?'


def inputs_fingerprint(chart, s_extra, accepts):
    """Отпечаток всего, от чего зависит БРАУЗЕРНЫЙ вердикт.

    Мемо имеет право подменить прогон только когда ни один вход не менялся.
    Правка NOTES/SELF_CHECK/FIELDS сюда не входит — на браузер она не влияет,
    и именно её цена раньше раздувала цикл.
    """
    base = re.sub(r'\.chart\.js$', '', chart)
    mock = vs = None
    it = iter(s_extra)
    for a in it:
        if a == '--mock':
            mock = next(it, '')
        elif a == '--vs':
            vs = next(it, '')
    parts = [sha_file(chart),
             sha_file(mock) if mock else sha_file(base + '.mock.json'),
             sha_file(vs) if vs else '-',
             sha_file(os.path.join(HERE, 'smoke.mjs')),
             'accept=' + '|'.join(sorted(accepts))]
    return hashlib.sha256('\n'.join(parts).encode('utf-8')).hexdigest()


def cycles(history, now):
    """Коды, которые падают ПОВТОРНО после того, как были починены.

    Именно это агент видит как «57 → 55 → 57» и принимает за прогресс. Один
    и тот же код, побывавший зелёным и снова красный, означает ровно два
    диагноза, и оба требуют остановки: либо проверка ложная, либо правка
    под неё ломает что-то ещё.
    """
    out = []
    for cid in sorted(k for k, v in now.items() if v == 'FAIL'):
        seen = [h.get(cid) for h in history if cid in h]
        if any(a == 'FAIL' and b != 'FAIL' for a, b in zip(seen, seen[1:])):
            out.append((cid, sum(1 for s in seen if s == 'FAIL') + 1))
    return out


def split_args(args):
    """Разложить флаги по чекерам. --accept идёт в оба; --quiet — только сюда."""
    v_extra, s_extra, accepts, i = [], [], [], 0
    while i < len(args):
        a = args[i]
        if a in ('--vs', '--mock', '--shots'):
            s_extra += [a, args[i + 1] if i + 1 < len(args) else '']
            i += 2
            continue
        if a == '--accept':
            val = args[i + 1] if i + 1 < len(args) else ''
            v_extra += ['--accept', val]
            s_extra += ['--accept', val]
            accepts.append(val)
            i += 2
            continue
        if a.startswith('--accept='):
            v_extra.append(a)
            s_extra.append(a)
            accepts.append(a)
        elif a == '--quiet':
            pass   # показ, не данные: фильтруется в main()
        elif a in ('--template', '--sync'):
            v_extra.append(a)
        elif a == '--keep':
            s_extra.append(a)
        elif a in OWN_FLAGS:
            pass
        elif a.startswith('--'):
            return None, None, None, a
        i += 1
    return v_extra, s_extra, accepts, None


def write_report(chart, mode, verdict, msgs):
    """Сгенерировать/обновить SELF_CHECK.md проекта. (всего, заполнено) или None.

    Вызывается всегда с ПОЛНЫМ вердиктом: --quiet режет показ в консоли,
    отчёт — это данные.
    """
    master_p = os.path.join(HERE, 'SELF_CHECK.md')
    if not os.path.isfile(master_p):
        return None
    folder = os.path.dirname(os.path.abspath(chart))
    target = os.path.join(folder, 'SELF_CHECK.md')
    if os.path.abspath(target) == os.path.abspath(master_p):
        return None          # чарт лежит в самой папке скилла — мастер не трогаем
    master = open(master_p, encoding='utf-8').read()
    name = os.path.basename(chart)[:-len('.chart.js')]
    order = list(load_manifest())
    return selfcheck.write(target, name, mode, verdict, msgs, master, order)


def main():
    args = sys.argv[1:]
    if '--selftest' in args:
        from engine import selftest_check
        return selftest_check.run()
    if not args or all(a.startswith('--') for a in args):
        print(__doc__)
        return 2
    chart = next(a for a in args if not a.startswith('--'))
    if not os.path.isfile(chart):
        print('Файл не найден: ' + chart)
        return 2

    v_extra, s_extra, accepts, badflag = split_args(args)
    if badflag:
        print('Неизвестный флаг: ' + badflag)
        return 2
    force_full = '--full' in args
    static = '--static' in args
    no_report = '--no-report' in args
    quiet = '--quiet' in args

    # ── 1/2: validate.py, с автосинхронизацией FACTS-зоны NOTES §2 ──────────
    print('=' * 72)
    print('1/2  validate.py — форма кода (FACTS NOTES §2 синхронизируется сам)')
    print('=' * 72)
    v_rc, v_out = run([sys.executable, os.path.join(HERE, 'validate.py'), chart]
                      + v_extra + (['--sync'] if '--template' not in v_extra else []))
    print((quiet_view(v_out) if quiet else v_out).rstrip())
    v_now = verdicts(v_out)
    v_msg = messages(v_out)
    mode = 'B' if re.search(r'^Режим:\s*B', v_out, re.M) else 'A'

    # ── 2/2: smoke.mjs — с мемоизацией по отпечатку входов ──────────────────
    jpath = os.path.join(os.path.dirname(os.path.abspath(chart)), JOURNAL)
    history = load(jpath)
    fp = inputs_fingerprint(chart, s_extra, accepts)

    s_now, s_msg, s_rc, s_out, replay = {}, {}, None, None, None
    if static:
        print('\n' + '=' * 72)
        print('2/2  smoke.mjs — ПРОПУЩЕН (--static): быстрый цикл, НЕ для сдачи')
        print('=' * 72)
    else:
        if not force_full:
            for e in reversed(history):
                if isinstance(e, dict) and e.get('_inputs') == fp and '_smoke_out' in e:
                    replay = e
                    break
        if replay is not None:
            s_rc = replay.get('_smoke_rc', 1)
            print('\n' + '=' * 72)
            print('2/2  smoke.mjs — REPLAY: чарт/мок/smoke не менялись с прогона '
                  + str(history.index(replay) + 1) + ', браузер не запускался')
            print('      (вывод того прогона ниже, дословно; свежий прогон — --full)')
            print('=' * 72)
            print((quiet_view(replay['_smoke_out']) if quiet
                   else replay['_smoke_out']).rstrip())
            # ТОЛЬКО браузерные коды. Прежняя версия вливала сюда ВЕСЬ
            # закэшированный вердикт вместе со статусами validate — свежий
            # PASS затирался прошлым FAIL, и вердикт врал до --full.
            s_now = dict(replay.get('_smoke_codes') or {})
            s_msg = dict(replay.get('_smoke_msgs') or {})
        else:
            print('\n' + '=' * 72)
            print('2/2  smoke.mjs — поведение в браузере')
            print('=' * 72)
            s_rc, s_out = run(['node', os.path.join(HERE, 'smoke.mjs'), chart] + s_extra)
            print((quiet_view(s_out) if quiet else s_out).rstrip())
            s_now = verdicts(s_out)
            s_msg = messages(s_out)
            # «Не запускалась» (код 2) — не вердикт, а его отсутствие: в кэш
            # не кладём, иначе после установки playwright кэш продолжал бы
            # говорить «не запускалась» до первой правки чарта.
            if s_rc == 2:
                s_out = None

    now = dict(v_now)
    now.update(s_now)
    msgs = dict(v_msg)
    msgs.update(s_msg)

    # ── отчёт: машинную часть пишет машина ──────────────────────────────────
    rep = None
    if not no_report and '--template' not in v_extra:
        # Браузерные коды, которых нет в вердикте (не запускался/--static),
        # в отчёте обязаны быть ВИДИМЫ строкой «—»: иначе раздел E просто
        # исчезает, и отличить «проверено и зелено» от «не проверялось»
        # по самому отчёту нельзя.
        report_v = dict(now)
        for cid, meta in load_manifest().items():
            if meta.get('owner') == 'smoke' and cid not in report_v:
                report_v[cid] = '—'
                msgs.setdefault(cid, 'браузерный прогон не выполнялся')
        rep = write_report(chart, mode, report_v, msgs)
        if rep is not None:
            total, filled = rep
            probs = selfcheck.audit(
                open(os.path.join(os.path.dirname(os.path.abspath(chart)),
                                  'SELF_CHECK.md'), encoding='utf-8').read(), report_v)
            now['Z6'] = 'PASS' if not probs else 'FAIL'
            msgs['Z6'] = ('отчёт заполнен: суждений ' + str(filled) + '/' + str(total)
                          if not probs else '; '.join(probs))

    fails = sorted(k for k, v in now.items() if v == 'FAIL')
    warns = sorted(k for k, v in now.items() if v == 'WARN')
    disp = sorted(k for k, v in now.items() if v == 'ОСПОР')
    manifest = load_manifest()
    dom = lambda cid: (manifest.get(cid) or {}).get('domain', 'artifact')
    blocking = [c for c in fails if dom(c) != 'process']
    paper = [c for c in fails if dom(c) == 'process']

    # ── журнал прогонов (он же кэш браузерного вердикта) ────────────────────
    entry = dict(now)
    entry['_inputs'] = fp
    entry['_smoke_rc'] = s_rc
    if not static and replay is None and s_out is not None:
        entry['_smoke_out'] = s_out
        entry['_smoke_codes'] = s_now
        entry['_smoke_msgs'] = s_msg
    elif replay is not None:
        entry['_smoke_out'] = replay['_smoke_out']
        entry['_smoke_codes'] = s_now
        entry['_smoke_msgs'] = s_msg
    history.append(entry)
    try:
        with open(jpath, 'w', encoding='utf-8') as fh:
            json.dump(history[-KEEP_RUNS:], fh, ensure_ascii=False)
    except OSError:
        pass

    loops = cycles(history[:-1], now)

    print('\n' + '=' * 72)
    print('ВЕРДИКТ (обе проверки, прогон ' + str(len(history)) + ')')
    print('=' * 72)
    print('validate.py: код ' + str(v_rc) + '    smoke.mjs: '
          + ('пропущен --static' if static
             else ('REPLAY (код ' + str(s_rc) + ')' if replay is not None
                   else 'код ' + str(s_rc)))
          + ('  (2 = не запускалась, сдачу не блокирует)'
             if s_rc == 2 and not static else ''))
    print('ВИДЖЕТ     (роняет сдачу): ' + (', '.join(blocking) if blocking else '—'))
    print('КАНЦЕЛЯРИЯ (не роняет):    ' + (', '.join(paper) if paper else '—'))
    print('WARN: ' + (', '.join(warns) if warns else '—'))
    if disp:
        print('ОСПОР: ' + ', '.join(disp) + ' — не «пройдено»: выпиши в NOTES §6'
              ' и скажи пользователю словами')
    if rep is not None:
        total, filled = rep
        print('Отчёт: SELF_CHECK.md рядом с чартом — машинная часть свежая, '
              'суждений заполнено ' + str(filled) + '/' + str(total))

    ghosts = sorted(set(a.split('=', 1)[0].strip() for a in
                        [x[len('--accept='):] if x.startswith('--accept=') else x
                         for x in v_extra] if '=' in a) - set(disp))
    ghosts = [g for g in ghosts if g]
    if ghosts:
        print('--accept на кодах, которые не падали: ' + ', '.join(ghosts)
              + ' — проверь ID, оспаривание к ним не применилось')

    if loops:
        print('\n' + '!' * 72)
        print('ХОЖДЕНИЕ ПО КРУГУ. Эти коды уже были починены и упали снова:')
        for cid, n in loops:
            print('    ' + cid + ' — падал ' + str(n) + '-й раз за сессию')
        print('Дальше по кругу идти НЕЛЬЗЯ. Диагнозов ровно два, и оба требуют')
        print('остановки:')
        print('  1) правка под одну проверку ломает другую — чини причину,')
        print('     а не строку отчёта: посмотри, что изменилось между прогонами;')
        print('  2) проверка ложная — ОСПОРЬ её (SKILL.md, «ОСПАРИВАНИЕ»):')
        print('     --accept ' + loops[0][0] + '=\'<почему это ложная тревога>\',')
        print('     строка в NOTES §6 и фраза пользователю.')
        print('!' * 72)

    if static:
        print('\n--static: браузерная проверка не выполнялась — СДАВАТЬ по этому'
              '\nпрогону нельзя. Финальный прогон — без --static.')
        return 1 if blocking else 0
    if blocking:
        print('\nСДАВАТЬ НЕЛЬЗЯ: ' + str(len(blocking)) + ' FAIL по виджету.')
        return 1
    if paper:
        print('\nВиджет проверки прошёл. Осталась канцелярия: ' + ', '.join(paper)
              + '.\nСдачу она не роняет, но чинится до сдачи.')
        return 0
    print('\nОбе проверки пройдены. Заполни СУЖДЕНИЯ в SELF_CHECK.md рядом'
          '\nс чартом (машинная часть уже там) и прогони check.py ещё раз —'
          '\nZ6 сверит, что ничего не осталось пустым.'
          '\n(Правки только в NOTES/SELF_CHECK браузер не будят: увидишь REPLAY.)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
