# -*- coding: utf-8 -*-
"""report — печать отчёта и ВЕРДИКТ с разделением доменов.

Домен в checks.json (`artifact` / `process` / `browser`) заведён давно
и назван в ARCHITECTURE.md «налоговой декларацией вердикта». Но код возврата
до сих пор считал все FAIL одинаково: сдача падала на неотмеченном блоке
в NOTES §5 ровно так же, как на мёртвом виджете.

Здесь домен наконец работает:
  artifact / browser — про сдаваемый виджет. FAIL роняет сдачу.
  process            — канцелярия служебных файлов. Печатается, чинится,
                       видна в отчёте, но код возврата не меняет.

Это не послабление. Канцелярия нужна: без заполненного NOTES не возобновить
работу после обрыва, без FIELDS.md пользователь не настроит Proteus. Но она
не может быть основанием сказать «виджет не готов», и именно в этом качестве
она съела три прогона из шести в сессии «иерархический-фильтр».
"""

MARK = {'PASS': 'v', 'FAIL': 'X', 'WARN': '!', 'ОСПОР': '?', 'N/A': '-'}


def print_results(results, manifest, quiet=False, header=None):
    if header:
        print('\n' + header)
    print('-' * 72)
    w = max([len(c) for c, _, _ in results] or [4])
    shown = 0
    for cid, st, msg in results:
        if quiet and st == 'PASS':
            continue
        shown += 1
        print(' ' + MARK.get(st, '?') + '  ' + cid.ljust(w) + '  '
              + st.ljust(5) + '  ' + msg)
    if quiet and shown == 0:
        print(' всё чисто')
    print('-' * 72)


def print_verdict(engine, quiet=False):
    """Итоговые строки validate.py. Возвращает код возврата."""
    res = engine.results
    total = len(res)
    fails = engine.by_status('FAIL')
    warns = engine.by_status('WARN')
    disp = engine.by_status('ОСПОР')
    blocking = engine.blocking()
    paper = engine.paperwork()

    print('Режим: ' + engine.mode
          + (' (точечная правка — обязательный набор SELF_CHECK сокращён)'
             if engine.mode == 'B' else ' (новая визуализация)'))
    print('Итог: ' + str(total - len(fails) - len(warns) - len(disp)) + '/' + str(total)
          + ' PASS, ' + str(len(warns)) + ' WARN, ' + str(len(disp)) + ' ОСПОР, '
          + str(len(fails)) + ' FAIL')
    if blocking:
        print('  виджет   (роняет сдачу): ' + ', '.join(blocking))
    if paper:
        print('  канцелярия (не роняет):  ' + ', '.join(paper)
              + ' — служебные файлы, почини до сдачи')

    if engine.unknown_ids:
        print('\nВНИМАНИЕ: коды без записи в checks.json: '
              + ', '.join(sorted(set(engine.unknown_ids)))
              + ' — дополни манифест (домен/severity/режимы).')
    # Про чужие коды не ворчим: check.py передаёт --accept обоим чекерам.
    unused = sorted(set(k for k in engine.accepted if not k.startswith('E'))
                    - set(disp))
    if unused:
        print('\n--accept на кодах, которые НЕ падали: ' + ', '.join(unused)
              + ' — проверь ID, оспаривание к ним не применилось.')
    if disp:
        print('\nОСПОРЕНО проверок: ' + str(len(disp)) + '. Это не «пройдено»: каждую'
              '\nстроку выпиши в NOTES §6 и назови пользователю словами.')
        if len(disp) > 2:
            print('Оспорено больше двух проверок разом — так выглядит не серия ложных'
                  '\nтревог, а подгонка сдачи. Перечитай SKILL.md, «ОСПАРИВАНИЕ».')
    if blocking:
        print('\nСДАВАТЬ НЕЛЬЗЯ: ' + str(len(blocking)) + ' FAIL по виджету.')
    elif paper:
        print('\nВиджет проверки прошёл. Осталась канцелярия: ' + ', '.join(paper)
              + '.\nСдачу она не роняет, но чинится до сдачи.')
    return 1 if blocking else 0
