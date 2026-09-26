# -*- coding: utf-8 -*-
"""checks_process — проверки СЛУЖЕБНЫХ ФАЙЛОВ (домен process).

Отличие от checks_code принципиальное, и оно закреплено в вердикте: это
канцелярия. Неотмеченный блок в NOTES §5 и мёртвый виджет — разные новости,
и ронять сдачу одинаково они не должны. В прогоне «иерархический-фильтр»
три прогона из шести ушли на канцелярию УЖЕ ПОСЛЕ того, как код стал зелёным.

Поэтому здесь нет ни одной проверки, которая роняет сдачу: они печатаются,
чинятся и видны в отчёте, но код возврата определяют artifact/browser
(registry.Engine.blocking).
"""

import os
import re

from .ctx import FACTS_CLOSE, FACTS_OPEN, facts_m, flat, notes_section, scan, find_function
from .registry import check

# Комплект болванки: файл рядом с <name>.chart.js -> шаблон, из которого он
# обязан быть СКОПИРОВАН. None — файл пользовательский (макет и SQL приносит
# пользователь, bootstrap кладёт лишь пустышку).
KIT = [
    ('{name}.html', None),
    ('{name}.data.sql', None),
    ('{name}.NOTES.md', 'TEMPLATE.NOTES.md'),
    ('FIELDS.md', 'TEMPLATE.FIELDS.md'),
]
KIT_CHART = 'TEMPLATE.chart.js'

# Служебные функции: копируются из шаблона ДОСЛОВНО (SKILL.md, правило 7).
# CORE — чистые хелперы БЛОКА 2: ни окружения, ни состояния, ни DOM. Случайно
# они не расходятся, значит блок сочинялся с нуля — а вместе с ним уезжают
# инварианты, которых по коду вокруг не видно (epoch-мс против epoch-с).
CORE_FNS = ('esc', 'num', 'toDate')
# TIP — машинерия тултипа из БЛОКА 6. Её могло не быть в задаче вовсе: WARN.
TIP_FNS = ('getTip', 'showTip', 'hideTip', 'trigger', 'onOut')


def _norm(txt):
    """Сравнение копии с шаблоном не падает из-за CRLF и хвостов пробелов."""
    return '\n'.join(l.rstrip() for l in txt.replace('\r\n', '\n').split('\n')).strip()


# ══ K1/K2. Комплект файлов проекта ══════════════════════════════════════════
@check('K1', 'K2', order=30)
def kit(c, add):
    """Болванка создана ЦЕЛИКОМ и СКОПИРОВАНА, а не написана по памяти.

    Реальный случай (RETRO 51): bootstrap.py заблокировала среда, агент собрал
    болванки вручную — недосчитался <name>.html, зато выдумал mock.json,
    а NOTES/FIELDS сочинил своими словами. validate.py при этом отчитался
    «46/49 PASS»: он смотрел только на .chart.js и пропажи не видел.
    """
    if not c.path.endswith('.chart.js'):
        return   # файл назван не по контракту — комплекта вокруг него нет
    name = os.path.basename(c.path)[:-len('.chart.js')]
    if not name:
        return

    missing_hard, missing_soft = [], []
    for pattern, _ in KIT:
        fname = pattern.format(name=name)
        if os.path.isfile(os.path.join(c.folder, fname)):
            continue
        # Макет — единственный файл, которого может не быть по делу: правка
        # чужого графика без исходного HTML это не поломка комплекта.
        (missing_soft if (fname.endswith('.html') and not c.is_tpl)
         else missing_hard).append(fname)

    if missing_hard:
        # «NOTES.md» вместо «<name>.NOTES.md» отключает все Z-проверки разом.
        renamed = [f for f in missing_hard
                   if os.path.isfile(os.path.join(c.folder, f.split('.', 1)[-1]))]
        add('K1', False, '',
            bad='комплект неполный, нет: ' + ', '.join(missing_hard)
                + ' — болванка создана не целиком (ШАГ 1)'
                + ('. Рядом лежит '
                   + ', '.join(f.split('.', 1)[-1] for f in renamed)
                   + ' — переименуй по имени чарта, иначе проверки его не видят'
                   if renamed else ''))
    elif missing_soft:
        add('K1', False, '', warn=True,
            bad='нет ' + ', '.join(missing_soft) + ' — перенос сверять не с чем')
    else:
        add('K1', True, 'комплект файлов проекта на месте')

    if not c.is_tpl or not os.path.isdir(c.tpl_dir):
        return
    diverged = []
    for pattern, tpl in [('{name}.chart.js', KIT_CHART)] + KIT:
        if not tpl:
            continue
        fname = pattern.format(name=name)
        dst = os.path.join(c.folder, fname)
        a = c._read(dst)
        b = c.tpl(tpl)
        if a is None or b is None:
            continue
        if _norm(a) != _norm(b):
            diverged.append(fname)
    add('K2', not diverged, 'болванка совпадает с templates/',
        bad='не копия шаблона: ' + ', '.join(diverged)
            + ' — болванка написана по памяти, инварианты каркаса потеряны'
            + ' (RETRO 51). Возьми файл из templates/ как есть; если он уже'
            + ' заполняется — гоняй validate.py БЕЗ --template')


# ══ K3/K3b. Служебный каркас ЗАПОЛНЕН, а не написан заново ══════════════════
@check('K3', 'K3b', order=31, tpl='never')
def service_code(c, add):
    """Свежая болванка проходит валидатор целиком, поэтому расхождение
    с шаблоном — это ранний вердикт, а не двадцать симптомов.

    В Test7 первый прогон дал 10 FAIL, и ВСЕ ДЕСЯТЬ — машинерия, которая
    в шаблоне уже была и работала: глобальный option, скрытие canvas, esc(),
    слушатели вне render(). Шесть циклов исправлений ушли на возврат к тому,
    что выдали на ШАГЕ 1 (RETRO 63).
    """
    traw = c.tpl(KIT_CHART)
    if traw is None:
        return
    tcode, tbare = scan(traw)

    def diff(names):
        changed, lost = [], []
        for nm in names:
            want = find_function(tcode, tbare, nm)
            if want is None or '[ЗАПОЛНИ]' in want:
                continue      # это место шаблон оставил под заполнение
            got = c.fn(nm)
            if got is None:
                lost.append(nm)
            elif flat(got) != flat(want):
                changed.append(nm)
        return changed, lost

    core_changed, core_lost = diff(CORE_FNS)
    add('K3', not core_changed and not core_lost, 'чистые хелперы БЛОКА 2 — из шаблона',
        bad='БЛОК 2 написан заново, а не заполнен: '
            + ', '.join(sorted(x + '()' for x in core_changed + core_lost))
            + (' — переписан' if core_changed else ' — потерян')
            + ' (RETRO 63). Это хелперы без окружения и состояния: случайно они'
              ' не расходятся, значит блок сочинялся с нуля. Вместе с ними'
              ' уезжают инварианты, которых по коду вокруг не видно: у toDate()'
              ' это разбор epoch-мс против epoch-с (RETRO 10), у esc() —'
              ' экранирование кавычки. Возьми тела из templates/' + KIT_CHART
            + ' как есть. И перечитай, что ещё в файле писалось заново:'
              ' FAIL ниже, скорее всего, следствия')

    tip_changed, _ = diff(TIP_FNS)
    if tip_changed:
        add('K3b', False, '', warn=True,
            bad='машинерия тултипа переписана: '
                + ', '.join(x + '()' for x in tip_changed)
                + ' — в шаблонных телах заперты клампинг по окну (RETRO 26)'
                  ' и снятие ОБОИХ скрывающих свойств (RETRO 44). Если тултип'
                  ' в задаче есть — верни тела из templates/' + KIT_CHART)


# ══ Z0-Z4, Z5b. NOTES ═══════════════════════════════════════════════════════
@check('Z0', 'Z1', 'Z1b', 'Z2', 'Z2b', 'Z3', 'Z4', 'Z5b', order=32, tpl='never')
def notes(c, add, engine=None):
    txt = c.notes
    if txt is None:
        return

    if c.mode_declared:
        add('Z0', True, 'режим ' + c.mode_declared + ' объявлен в NOTES §0')
    else:
        add('Z0', False, '',
            bad='в NOTES §0 нет строки «Режим: A» / «Режим: B» — добавь по шаблону'
                ' TEMPLATE.NOTES.md; пока проверяются пункты режима A')

    real = c.html_lines
    s2 = notes_section(txt, 2)
    # Диапазоны парсим вне машинной зоны: в ней даты sync выглядят как диапазон.
    s2_ranges = re.sub(re.escape(FACTS_OPEN) + r'.*?' + re.escape(FACTS_CLOSE),
                       '', s2, flags=re.S)
    zone_m = facts_m(txt)

    if zone_m is None:
        add('Z1', False, '',
            bad='в NOTES §2 нет машинной зоны FACTSLayout — запусти check.py'
                ' (он синхронизирует сам) либо validate.py --sync. Руками число'
                ' M не пишется и не правится')
    elif real is None:
        add('Z1', False, '', warn=True,
            bad='нет ' + os.path.basename(c.html_path) + ' — M=' + str(zone_m)
                + ' не с чем сверить')
    else:
        add('Z1', zone_m == real,
            'NOTES §2: M=' + str(zone_m) + ' синхронизирован с '
            + os.path.basename(c.html_path) + ' (зона FACTS)',
            bad='FACTS-зона устарела: M=' + str(zone_m) + ', а в '
                + os.path.basename(c.html_path) + ' реально ' + str(real)
                + ' строк. Зону пишет check.py перед каждым прогоном — расхождение'
                  ' означает, что макет менялся мимо процесса')

    # Диапазоны обязаны покрыть 1..M без дыр.
    target = real if real is not None else zone_m
    spans = []
    if target is not None:
        for mr in re.finditer(r'(\d+)\s*[-–—]\s*(\d+)', s2_ranges):
            a, b = int(mr.group(1)), int(mr.group(2))
            if a <= b:
                spans.append((a, b))
    if spans:
        covered, cur = [], None
        for a, b in sorted(spans):
            if cur and a <= cur[1] + 1:
                cur = (cur[0], max(cur[1], b))
            else:
                if cur:
                    covered.append(cur)
                cur = (a, b)
        covered.append(cur)
        gaps, pos = [], 1
        for a, b in covered:
            if a > pos:
                gaps.append(str(pos) + '-' + str(a - 1))
            pos = max(pos, b + 1)
        if pos <= target:
            gaps.append(str(pos) + '-' + str(target))
        add('Z1b', not gaps, 'диапазоны NOTES §2 покрывают 1..' + str(target) + ' без дыр',
            bad='непрочитанные строки макета: ' + ', '.join(gaps[:4]))

    # §1: реестр не должен содержать незакрытых строк.
    s1 = notes_section(txt, 1)
    open_rows = re.findall(r'^\|[^|]*\|[^|]*\|.*?\|\s*(TODO|ASK)\s*\|', s1, re.M)
    add('Z2', not open_rows, 'реестр NOTES §1 закрыт',
        bad='в реестре NOTES §1 осталось незакрытых строк: ' + str(len(open_rows))
            + ' (TODO/ASK) — элементы макета не перенесены')

    # §1 вообще не начат, а код уже пишется: память подменена контекстом чата.
    filled = [r for r in re.findall(r'^\|(?!\s*[-:# ]*\|)(.*)$', s1, re.M)
              if len([x for x in r.split('|')[1:3] if x.strip()]) == 2]
    body = len([l for l in c.lines if l.strip() and not l.strip().startswith('//')])
    add('Z2b', bool(filled) or body < 120, 'NOTES §1 начат до кода',
        bad='реестр NOTES §1 пуст, а в чарте уже ' + str(body) + ' строк кода — '
            'макет переносится по памяти чата, возобновление после обрыва'
            ' невозможно (RETRO 52)')

    # §5: все блоки DONE.
    s5 = notes_section(txt, 5)
    undone = re.findall(r'^\|\s*[1-7]\s*\|[^|]*\|\s*(TODO|DOING)\s*\|', s5, re.M)
    add('Z3', not undone, 'NOTES §5: все блоки DONE',
        bad='в NOTES §5 блоков не DONE: ' + str(len(undone)))

    # §4: вопрос задан, ответа нет, а сборка идёт дальше (RETRO 62).
    s4 = notes_section(txt, 4)
    dangling = []
    for row in re.findall(r'^\|(.+)\|\s*$', s4, re.M):
        cells = [x.strip() for x in row.split('|')]
        if len(cells) < 4 or not cells[1]:
            continue
        if re.match(r'^[-: ]+$', cells[1]) or cells[1].lower().startswith('дата'):
            continue
        answer = cells[2]
        if not answer or answer in ('—', '-', '–', '?', 'нет', 'н/д'):
            dangling.append(cells[1][:50])
    if re.search(r'без ответа|не дожид|ответа нет', s4, re.I):
        dangling.append('в §4 записано «решено без ответа»')
    add('Z5b', not dangling, 'вопросов без ответа пользователя нет',
        bad='в NOTES §4 вопрос без ответа: «' + '», «'.join(dangling[:2])
            + '» — решение за пользователя означает виджет, собранный не по ТЗ. '
              'Дождись ответа; если спрашивать было не нужно — напиши это '
              'в колонке ответа словами (RETRO 62)')

    # §6: открытые хвосты.
    tails = re.findall(r'^\s*-\s*\[ \]\s*\S', notes_section(txt, 6), re.M)
    if tails:
        add('Z4', False, '', warn=True,
            bad='в NOTES §6 незакрытых хвостов: ' + str(len(tails))
                + ' — закрой или проговори их пользователю в финальном ответе')


# ══ F1/F2. FIELDS.md ════════════════════════════════════════════════════════
@check('F1', 'F2', order=33, tpl='never')
def fields_doc(c, add):
    """Сдаточный документ по шаблону, а не файл своего сочинения.

    Реальный случай (RETRO 52): разделы свои, раздела «Настроить РУКАМИ
    в Proteus» нет вовсе, а две его галочки проставлены агентом за
    пользователя. По такому документу виджет НЕ настроить.
    """
    txt = c.fields_txt
    master = c.tpl('TEMPLATE.FIELDS.md')
    if txt is None or master is None:
        return   # отсутствие файла — забота K1
    need = re.findall(r'^##\s*(.+?)\s*$', master, re.M)
    if not need:
        return
    # Заголовок ищем по первым двум словам: хвост в скобках агент вправе убрать.
    missing = [h for h in need
               if not re.search(r'^##\s*' + re.escape(' '.join(h.split()[:2])),
                                txt, re.M | re.I)]
    add('F1', not missing, 'FIELDS.md по шаблону: все ' + str(len(need)) + ' раздела',
        bad='в FIELDS.md нет разделов: ' + '; '.join(missing)
            + ' — документ написан в своём формате, чек-лист ручных настроек'
            + ' Proteus до пользователя не дошёл (RETRO 52)')

    # Галочка означает «в Proteus реально настроено» — это отметка ПОЛЬЗОВАТЕЛЯ.
    ticked = re.findall(r'^\s*-\s*\[[xXvV]\]\s*(\S.*)$', txt, re.M)
    add('F2', not ticked, 'чек-лист ручных настроек не отмечен за пользователя',
        warn=True,
        bad='в FIELDS.md проставлено галочек: ' + str(len(ticked)) + ' («'
            + (ticked[0][:40] if ticked else '') + '...») — если это не отметил'
            + ' пользователь, ты расписался за него: настройки в Proteus'
            + ' никто не делал')
