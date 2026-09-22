# -*- coding: utf-8 -*-
"""checks_code — проверки САМОГО ВИДЖЕТА (домен artifact).

Каждая функция объявляет коды, которые вправе напечатать, и получает готовый
Ctx. Ничего не парсит заново: тела функций, склеенный CSS и правила уже
разобраны в ctx.py. Проверка, которая режет исходник под себя, — это будущая
ложная тревога (RETRO 60).

Порядок печати задаётся order= и повторяет прежний вывод: агент читает отчёт
сверху вниз, и ранний вердикт о каркасе (H3/K3) обязан стоять раньше
двадцати симптомов.
"""

import os
import re
import subprocess
import sys

from . import cssglue
from .ctx import flat, line_of, match_braces, match_parens
from .registry import check

BLOCKS = 7


# ══ P5. Синтаксис ═══════════════════════════════════════════════════════════
@check('P5', order=1)
def syntax(c, add):
    try:
        p = subprocess.run(['node', '--check', c.path], capture_output=True, text=True)
        add('P5', p.returncode == 0, 'node --check' if p.returncode == 0
            else (p.stderr.strip().splitlines()[0] if p.stderr else 'syntax error'))
    except (FileNotFoundError, OSError):
        add('P5', False, 'node не найден — синтаксис НЕ проверен, проверь вручную',
            warn=True)


# ══ H3. Это вообще каркас скилла? ═══════════════════════════════════════════
# Двадцать разрозненных FAIL агент чинит по одному и жжёт на этом контекст,
# хотя чинить нечего: файл написан мимо шаблона (RETRO 52).
@check('H3', order=2)
def framework(c, add):
    marks = {
        'заголовков «// БЛОК N»': bool(re.search(r'^\s*//\s*-*\s*БЛОК\s+\d', c.raw, re.M)),
        'глобального option': bool(re.search(r'^option\s*=', c.code, re.M)),
        'window.__pvtState': '__pvtState' in c.bare,
        'CFG.ns': bool(re.search(r'\bns\s*:\s*[\'"]', c.bare)),
    }
    lost = [k for k, v in marks.items() if not v]
    add('H3', len(lost) < 2, 'каркас шаблона на месте',
        bad='нет ' + ', '.join(lost) + ' — файл собран мимо TEMPLATE.chart.js.'
            ' Остальные FAIL ниже — следствия: чинить их по одному бессмысленно,'
            ' пересобирай по шаблону блоками 1→7 (RETRO 52)')


# ══ C1. Блоки 1..7 по порядку ═══════════════════════════════════════════════
@check('C1', order=3)
def blocks(c, add):
    found = [int(m) for m in re.findall(r'^\s*//\s*-*\s*БЛОК\s+(\d)', c.raw, re.M)]
    seq, seen = [], set()
    for nb in found:
        if nb not in seen:
            seen.add(nb)
            seq.append(nb)
    add('C1', seq == list(range(1, BLOCKS + 1)), 'блоки 1-7 по порядку',
        bad='найдено ' + str(seq) + ', ожидалось [1..7]')


# ══ S1/D2. option глобально, в конце, пустой ════════════════════════════════
@check('S1', 'D2', order=4)
def option_literal(c, add):
    assigns = [i for i, l in enumerate(c.code_lines, 1)
               if re.match(r'^\s*(?:if\s*\(typeof\s+option|option\s*=)', l)]
    br, opt_end = -1, None
    if not assigns:
        add('S1', False, '', bad='option не присваивается')
    else:
        last = assigns[-1]
        at_col0 = bool(re.match(r'^option\s*=|^if\s*\(typeof\s+option',
                                c.code_lines[last - 1]))
        idx = sum(len(l) + 1 for l in c.code_lines[:last - 1])
        br = c.code.find('{', idx)
        opt_end = match_braces(c.bare, br) if br != -1 else -1
        tail = c.code[opt_end + 1:] if opt_end and opt_end != -1 else ''
        tail_ok = not re.search(r'[A-Za-z0-9_$]', tail.replace(';', ''))
        add('S1', at_col0 and tail_ok,
            'option глобально (RETRO 14), строка ' + str(last) + '/' + str(len(c.lines)),
            bad=('строка ' + str(last) + ': option внутри блока/функции (отступ)'
                 if not at_col0 else
                 'после литерала option есть код (строка '
                 + str(line_of(c.raw, opt_end)) + '+): мутация вернёт eCharts к отрисовке'))

    lit = c.code[br:opt_end + 1] if (assigns and br != -1 and opt_end and opt_end != -1) else ''
    empty_series = bool(re.search(r'series\s*:\s*\[\s*\{[^\]]*?data\s*:\s*\[\s*\]', lit, re.S))
    add('D2', 'scatter' in lit and empty_series, 'series — пустой scatter',
        bad='option не пуст: eCharts пытается рисовать свой график')


# ══ S2/C3/S2b. Монтаж ═══════════════════════════════════════════════════════
@check('S2', 'C3a', 'C3b', 'C3c', 'S2b', order=5)
def mount_shape(c, add):
    add('S2', '_echarts_instance_' in c.code and 'createElement' in c.bare,
        'хост через [_echarts_instance_], overlay создаётся',
        bad='нет поиска хоста или createElement')
    add('C3a', 'canvas' in c.code and 'display' in c.code, 'canvas скрывается',
        bad='canvas НЕ скрыт — будет виден под overlay')
    add('C3b', 'removeChild' in c.bare or '.remove()' in c.bare,
        'старый overlay удаляется',
        bad='старый overlay не удаляется — два графика друг на друге (RETRO 4)')
    add('C3c', bool(re.search(r'position\s*=\s*[\'"]relative|position:relative', c.code)),
        'host → position:relative',
        bad='host остался static — overlay уедет по странице')
    add('S2b', 'appendChild' in c.bare, 'overlay монтируется в host',
        bad='нет appendChild — overlay не попадёт в DOM')


# ══ S3. Монтаж РЕАЛЬНО вызван ═══════════════════════════════════════════════
@check('S3', order=6)
def mount_called(c, add):
    mounted = False
    for m in re.finditer(r'\(\s*function\s*\w*\s*\([^)]*\)\s*', c.bare):
        br2 = c.bare.find('{', m.end())
        if br2 == -1:
            continue
        end2 = match_braces(c.bare, br2)
        if end2 == -1:
            continue
        after = c.bare[end2 + 1:end2 + 12]
        body = c.code[br2:end2]
        if re.match(r'\s*\)\s*\(\s*\)', after) and '_echarts_instance_' in body:
            mounted = True
            break
    if not mounted:
        named = re.findall(r'function\s+(\w*[Oo]verlay\w*|mount\w*)\s*\(', c.bare)
        for nm in named:
            if re.search(r'(?<!function )\b' + re.escape(nm) + r'\s*\(\s*\)\s*;', c.bare):
                mounted = True
                break
    add('S3', mounted, 'монтаж вызван и содержит поиск хоста',
        bad='КРИТИЧНО: функция монтажа не вызвана либо самовызов не содержит монтаж — '
            'overlay останется null (RETRO 1)')


# ══ C6/C6b. Ошибка видна ════════════════════════════════════════════════════
# Смотрим на ВСЕ catch, а не на первый: свой try/catch вокруг JSON.parse стоит
# в файле раньше монтажного, и проверка «по первому» роняла правильный код —
# агент шёл чинить чарт и УДАЛЯЛ защитный catch, чтобы позеленело (RETRO 60).
@check('C6', 'C6b', order=7)
def error_visible(c, add):
    add('C6', 'try' in c.bare and 'catch' in c.bare, 'try/catch вокруг монтажа',
        bad='нет try/catch — любой сбой даст пустой виджет')
    catches = []
    for mc in re.finditer(r'catch\s*\([^)]*\)\s*', c.bare):
        br3 = c.bare.find('{', mc.end())
        if br3 == -1:
            continue
        end3 = match_braces(c.bare, br3)
        if end3 == -1:
            continue
        catches.append(c.bare[br3 + 1:end3])
    if not catches:
        add('C6b', False, '', bad='не найден блок catch — ошибка монтажа будет молчаливой')
        return
    ok = any('option' not in x and ('innerHTML' in x or 'textContent' in x)
             for x in catches)
    add('C6b', ok, 'catch выводит ошибку в overlay',
        bad='ни один catch не показывает ошибку в overlay (или обращается '
            'к option до БЛОКА 7) — сбой монтажа останется молчаливым (RETRO 16, 24)')


# ══ S14/S14b/S9/S17. render и слушатели ═════════════════════════════════════
@check('S14', 'S14b', 'S9', 'S17', order=8)
def render_shape(c, add):
    add('S14', bool(re.search(r'^\s*render\(\)\s*;', c.code, re.M)), 'render() вызывается',
        bad='render() объявлен, но не вызван — overlay останется пустым (RETRO 25)')
    rb = c.render_body
    if rb is None:
        add('S9', False, '', warn=True,
            bad='render() не найдена — проверки S9/S17/T2 пропущены, проверь вручную')
        return
    add('S9', 'addEventListener' not in rb, 'слушатели вне render()',
        bad='addEventListener внутри render() — дубли после каждого клика (RETRO 9)')
    add('S17', not re.search(r'(?:document|window)\.addEventListener', rb),
        'глобальных слушателей внутри render() нет',
        bad='document/window.addEventListener внутри render() течёт и дублируется')
    # S14 ловит только ФАКТ вызова. Пустой render(){} его проходит, поэтому
    # отдельно требуем, чтобы render действительно пересобирал разметку.
    add('S14b', 'buildHTML(' in rb.replace(' ', ''),
        'render() пересобирает разметку через buildHTML()',
        bad='render() не вызывает buildHTML() — это заглушка ради проверки, '
            'после клика на экране ничего не изменится (RETRO 45)')


# ══ S15. Префикс в разметке — без точки ═════════════════════════════════════
@check('S15', order=9)
def html_prefix(c, add):
    hb = c.html_body
    if hb is None:
        add('S15', c.is_tpl, 'buildHTML() не найдена', warn=c.is_tpl,
            bad='buildHTML() не найдена — проверка префикса невозможна')
        return
    dot_prefix = bool(re.search(r'var\s+P\s*=\s*[\'"]\.[\'"]\s*\+', hb))
    add('S15', not (dot_prefix or 'class=".' in hb or "class='." in hb),
        'HTML-классы без ведущей точки',
        bad='buildHTML строит class=".ns-*" — стили и querySelector мертвы (RETRO 23)')


# ══ S16. Координаты fixed-тултипа ═══════════════════════════════════════════
@check('S16', order=10)
def tip_coords(c, add):
    body = c.fn('positionTooltip') or c.fn('renderTip')
    if body is not None:
        add('S16', not ('hostRect' in body or 'clientWidth' in body),
            'fixed-тултип считает координаты от окна', warn=True,
            bad='fixed-тултип использует локальные координаты/clientWidth (RETRO 26, 31)')
    elif c.has_tip and not c.is_tpl:
        add('S16', False, '', warn=True,
            bad='функции renderTip()/positionTooltip() нет — проверка координат '
                'ПРОПУЩЕНА. Верни имя из шаблона (SKILL.md, правило 7)')


# ══ C4. ResizeObserver не вызывает render ═══════════════════════════════════
@check('C4', order=11)
def observer(c, add):
    ro_body = ''
    mro = re.search(r'new\s+ResizeObserver\s*\(\s*function\s*\w*\s*\([^)]*\)\s*', c.bare)
    if mro:
        br4 = c.bare.find('{', mro.end())
        if br4 != -1:
            end4 = match_braces(c.bare, br4)
            if end4 != -1:
                ro_body = c.bare[br4 + 1:end4]
    add('C4', not re.search(r'\brender\s*\(', ro_body), 'observer только правит габариты',
        bad='ResizeObserver вызывает render() — риск бесконечного цикла (RETRO 3)')


# ══ C7/S18. Состояние ═══════════════════════════════════════════════════════
@check('C7', 'S18', order=12)
def state(c, add):
    add('C7', '__pvtState' in c.bare, 'состояние в window.__pvtState',
        bad='нет __pvtState — состояние слетит на перерисовке (RETRO 2)')
    # Классика: buildHTML() смотрит в state.selectedKey, а обработчики пишут
    # в локальную переменную внутри mount(). Синтаксис чист, валидатор чист,
    # интерактив мёртв (RETRO 46).
    reads = set()
    for body in (c.html_body, c.fn('buildCSS')):
        if body:
            reads |= set(re.findall(r'\bstate\.(\w+)\b', body))
    if not reads:
        return
    unwritten = sorted(k for k in reads
                       if not re.search(r'\bstate\.' + k + r'\s*(?:=[^=]|\+\+|--)', c.code))
    dyn = bool(re.search(r'\bstate\s*\[', c.code))   # state[key]= доказать нечем
    add('S18', not unwritten, 'состояние, которое читает разметка, обновляется',
        warn=dyn,
        bad='buildHTML/buildCSS читают state.' + ', state.'.join(unwritten[:4])
            + ', но никто их не присваивает — интерактив не включится (RETRO 46)')


# ══ S5/S5b/S5c/S5d/S19/S19b/S20. buildCSS ═══════════════════════════════════
@check('S5', 'S5b', 'S5c', 'S5d', 'S19', 'S19b', 'S20', order=13)
def css(c, add):
    body = c.css_body
    if body is None:
        add('S5', c.is_tpl, 'buildCSS() не найдена', warn=c.is_tpl,
            bad='buildCSS() не найдена — стили макета не перенесены')
        return
    rules = c.rules
    bad_sel = [sel[:40] for sel, _ in rules if not re.match(r'^[.#]', sel)]
    has_prefix_var = bool(re.search(r"=\s*['\"]\.['\"]\s*\+\s*CFG\.ns", body)) \
        or bool(re.search(r"CFG\.ns\s*\+\s*['\"]-", body))
    add('S5', not bad_sel and has_prefix_var, 'все селекторы префиксованы',
        bad=('голые селекторы: ' + ', '.join(bad_sel[:5])
             + ' — правило без префикса утечёт в интерфейс Proteus. Холст '
               'eCharts прячется из JS (host.querySelector(\'canvas\')), '
               'а не правилом canvas{display:none} (RETRO 5, 63)' if bad_sel
             else 'нет префикса через CFG.ns — стили утекут в дашборд (RETRO 5)'))

    # ── S5b. Префикс вписан руками вместо P ──
    lit = '.' + c.ns + '-'
    n_hard = body.count(lit)
    add('S5b', n_hard == 0, 'префикс в buildCSS только через P/CFG.ns', warn=True,
        bad='(RETRO 47) литерал "' + lit + '" вписан в CSS ' + str(n_hard)
            + ' раз вместо P — смена CFG.ns сломает эти правила')

    # ── S5c. СИНТАКСИС собранного CSS (RETRO 67) ──
    # Склейка — это ручная сборка синтаксиса из кусков, и ломается она ТИХО:
    # браузер отбрасывает невалидный селектор целиком, без ошибки в консоли.
    # Сессия «иерархический-фильтр»: `P + '-flt.' + P + '-open'` при
    # P = '.' + CFG.ns даёт `.hier-flt..hier-open` — 31 мёртвое правило,
    # а симптомом был один FAIL «поповер не открывается» и 12 минут зондов.
    dead = cssglue.lint_selectors(c.flat_css)
    braces = cssglue.lint_braces(c.flat_css)
    problems = []
    if dead:
        problems.append('невалидные селекторы (браузер отбросит правило целиком): '
                        + '; '.join('«' + s + '» — ' + w for s, w in dead[:4])
                        + (' и ещё ' + str(len(dead) - 4) if len(dead) > 4 else ''))
    if braces:
        problems.append('скобки не сходятся: «{» ' + str(braces[0])
                        + ', «}» ' + str(braces[1]))
    add('S5c', not problems, 'собранный CSS синтаксически валиден',
        bad='; '.join(problems)
            + '. Частая причина двух точек: P уже НЕСЁТ точку (var P = \'.\' + CFG.ns),'
              ' поэтому составной селектор пишется P + \'-a\' + P + \'-b\','
              ' а не P + \'-a.\' + P + \'-b\'. Проверка читает ГОТОВЫЙ CSS —'
              ' тот, что приедет в <style>')

    # ── S5d. Потерянная «;» на стыке конкатенации ──
    glued = cssglue.lint_missing_semicolons(c.flat_css)
    if glued:
        add('S5d', False, '', warn=True,
            bad='объявления слиплись без «;» на стыке строк: '
                + '; '.join('«' + r + '»: ' + s for r, s in glued[:3])
                + ' — браузер потеряет ОБА свойства. Ставь «;» в конце каждого'
                  ' куска конкатенации')
    else:
        add('S5d', True, 'объявления CSS разделены «;»')

    # ── S19/S19b. Корень резиновый ──
    root_rule = ''
    for sel, rbody in rules:
        if re.search(r'-root\s*$', sel) or re.search(r'-root[.:\s]', sel + ' '):
            root_rule = rbody.replace(' ', '')
            break
    if root_rule:
        fixed = [m.group(0) for m in
                 re.finditer(r'(?<![a-z-])(?:max-)?width:\d+(?:\.\d+)?px', root_rule)]
        add('S19', not fixed, 'корень резиновый, без фиксированной ширины',
            bad='(RETRO 48) у .<ns>-root фиксированная ширина: '
                + ', '.join(fixed[:3]) + ' — виджет не растянется за ячейкой '
                'дашборда. Рамка макета не переносится: корень width:100%')
        if not fixed and 'width:100%' not in root_rule:
            add('S19b', False, '', warn=True,
                bad='(RETRO 48) в правиле .<ns>-root нет width:100% — сверь '
                    'с шаблоном: корень обязан тянуться за хостом')

    # ── S20. Оконные @media ──
    medias = re.findall(r'@media[^{]*\(\s*(?:max|min)-width', c.flat_css)
    if medias:
        add('S20', False, '', warn=True,
            bad='(RETRO 49) @media по ширине ОКНА в buildCSS (правил: '
                + str(len(medias)) + ') — в ячейке дашборда не сработает. '
                'Брейкпоинт делается классом на корне по ширине хоста '
                '(RECIPES.md, «Рамка макета ≠ рамка виджета»)')


# ══ S6/S6b/S6c. Классы разметки ↔ правила ═══════════════════════════════════
@check('S6', 'S6b', 'S6c', order=14)
def classes(c, add):
    hb, body = c.html_body, c.css_body
    if hb is None or body is None:
        return
    used = set(re.findall(r'class=\\?["\']([a-z0-9_ -]+)', hb))
    names = set()
    for grp in used:
        for cl in grp.split():
            if len(cl) > 2 and not cl.startswith('+'):
                names.add(cl)
    missing = [cl for cl in sorted(names)
               if cl not in body and cl.split('-')[-1] not in body]
    add('S6', not missing or c.is_tpl, 'все классы со стилями', warn=c.is_tpl,
        bad='классы без CSS: ' + ', '.join(missing[:6]) + ' (RETRO 6)')

    # ── S6b. Класс СКЛЕЕН из CFG.ns, а правило написано без префикса ──
    # S6 читает только литерал внутри class="…", а в этом каркасе классы почти
    # всегда собираются конкатенацией. В Test7 разметка ставила `pvt-active`,
    # а показывало панель правило `.active`: до первого клика не была видна
    # ни одна панель, и ни одна проверка этого не заметила — браузерные мерят
    # экран ПОСЛЕ клика, когда класс дописал обработчик (RETRO 64).
    pref_re = r"CFG\.ns"
    if re.search(r"\bP\s*=\s*CFG\.ns\b(?!\s*\+\s*['\"]\.)", hb):
        pref_re = r"(?:CFG\.ns|\bP)"
    used_ns = set(m.group(1) for m in re.finditer(
        pref_re + r"\s*\+\s*['\"]-([a-z0-9][\w-]*)", hb))
    used_ns = set(x for x in used_ns if not x.startswith(('data-', 'aria-', 'role')))
    known = set(re.findall(r'\.' + re.escape(c.ns) + r'-([a-z0-9][\w-]*)',
                           c.flat_css, re.I))
    mismatch = sorted(x for x in used_ns - known
                      if re.search(r'\.' + re.escape(x) + r'(?![\w-])', c.flat_css))
    add('S6b', not mismatch or c.is_tpl, 'префикс класса в разметке и в CSS совпадает',
        warn=c.is_tpl,
        bad='разметка ставит .' + c.ns + '-' + (', .' + c.ns + '-').join(mismatch[:5])
            + ', а правило в buildCSS написано БЕЗ префикса: .'
            + '  .'.join(mismatch[:5]) + '. В DOM эти два класса не встретятся'
            + ' никогда (RETRO 64). Выбери одну сторону: либо оба с префиксом,'
            + ' либо оба без')

    orphan = sorted(x for x in used_ns - known
                    if not re.search(r'\.' + re.escape(x) + r'(?![\w-])', c.flat_css))
    if orphan and not c.is_tpl:
        add('S6c', False, '', warn=True,
            bad='классы разметки без единого правила: .' + c.ns + '-'
                + (', .' + c.ns + '-').join(orphan[:5])
                + ' — если это зацепка для querySelector, так и должно быть;'
                  ' если элемент ждал стилей макета, они не перенесены (RETRO 6)')


# ══ S7/T1/T2/T3/T4. Тултип: узел и шрифт ════════════════════════════════════
@check('S7', 'T1', 'T2', 'T3', 'T4', order=15)
def tooltip_node(c, add):
    if c.has_tip:
        add('S7', 'document.body.appendChild' in c.bare.replace(' ', ''),
            'тултип монтируется в body', warn=True,
            bad='тултип не в body — будет обрезан overflow (RETRO 7)')
        hb = c.html_body
        if hb is not None:
            # Узел тултипа в разметке — это класс *-tip. Атрибуты data-tip
            # это делегирование событий, скилл сам его рекомендует: не путать.
            tip_nodes = []
            for mt in re.finditer(r'-tip\b', hb):
                pre = hb[max(0, mt.start() - 8):mt.start()]
                if re.search(r'(?:data|aria)$', pre):
                    continue
                tip_nodes.append(line_of(hb, mt.start()))
            add('T1', not tip_nodes, 'тултип вне пересобираемой разметки',
                bad='узел тултипа в buildHTML() — innerHTML убьёт его (RETRO 19)')
        rb = c.render_body
        if rb is not None:
            add('T2', 'createElement' not in rb, 'тултип не пересоздаётся в render()',
                bad='render() создаёт узлы заново — тултип будет моргать (RETRO 19)')
    if c.css_body is None:
        return
    n_ff = len(re.findall(r'font-family', c.flat_css))
    if c.has_tip:
        add('T3', n_ff >= 2 and 'font-family' in c.tip_rule,
            'font-family задан и в root, и в тултипе',
            bad='тултип без своего font-family — будет другой шрифт (RETRO 21). '
                'Ищется правило .' + c.ns + '-tip в СКЛЕЕННОМ CSS, так что форма '
                'записи префикса тут ни при чём: проверь, что font-family '
                'стоит именно в правиле тултипа, а не только у корня')
    add('T4', 'font-family:inherit' in c.flat_css.replace(' ', ''),
        'font-family:inherit для дочерних', warn=True,
        bad='нет font-family:inherit — button/input возьмут системный шрифт (RETRO 21)')


# ══ T5/T6. Симметрия скрытия и hover ════════════════════════════════════════
@check('T5', 'T6', order=16)
def tooltip_visibility(c, add):
    if not c.has_tip or c.css_body is None:
        return
    rule = c.tip_rule.replace(' ', '')
    props = [
        ('opacity', r'opacity:0(?![.\d])',
         r"\.style\.opacity\s*=\s*['\"]\s*(?!0\s*['\"])[^'\"]+['\"]", r'opacity:1'),
        ('visibility', r'visibility:hidden',
         r"\.style\.visibility\s*=\s*['\"]\s*visible", r'visibility:visible'),
        ('display', r'display:none',
         r"\.style\.display\s*=\s*['\"]\s*(?!none)[^'\"]+['\"]",
         r'display:(?:block|flex|inline-block|grid)'),
    ]
    unset = []
    tight = c.flat_css.replace(' ', '')
    for name, hide_pat, show_pat, cls_pat in props:
        if not re.search(hide_pat, rule):
            continue
        if re.search(show_pat, c.code):
            continue
        if re.search(r'classList\.(?:add|toggle|remove)\s*\(', c.code) \
                and re.search(cls_pat, tight):
            continue
        unset.append(name)

    # T6: полный render() на наведении пересоздаёт DOM под курсором (RETRO 20).
    # Ищем слушатель в CODE, а не в bare: содержимое литерала ('mouseover')
    # в bare затёрто, и прежний поиск не находил НИ ОДНОГО слушателя.
    hover = c.fn('onOver')
    if hover is None:
        mh = re.search(r"addEventListener\s*\(\s*['\"]mouse(?:over|move|enter)['\"]"
                       r"\s*,\s*function\s*\w*\s*\([^)]*\)\s*", c.code)
        if mh:
            brh = c.bare.find('{', mh.end())
            if brh != -1:
                endh = match_braces(c.bare, brh)
                if endh != -1:
                    hover = c.code[brh + 1:endh]
    if hover is not None:
        add('T6', not re.search(r'\brender\s*\(', hover), 'hover не вызывает полный render()',
            bad='обработчик наведения вызывает render(): разметка пересобирается '
                'под курсором, тултип будет мигать (RETRO 20)')

    add('T5', not unset, 'скрытие тултипа снимается при показе',
        bad='CSS прячет тултип через ' + ', '.join(unset)
            + ' — и ни одна строка JS это не снимает. Тултип отрисуется '
              'невидимым: события, координаты и текст будут верные (RETRO 44)')


# ══ T7/T7b. Имена триггерных атрибутов ══════════════════════════════════════
@check('T7', 'T7b', order=17)
def trigger_names(c, add):
    hb = c.html_body
    if hb is not None:
        found = sorted(set(re.findall(r'\bdata-[\w-]+', hb)))
        canon = [a for a in found if a in ('data-tip', 'data-kind', 'data-action')]
        add('T7', not found or bool(canon),
            'триггеры помечены именами, которые видит smoke.mjs', warn=True,
            bad='в разметке есть ' + ', '.join(found[:4])
                + ', но ни одного data-tip/data-kind/data-action — smoke.mjs ищет '
                  'ровно эти имена и интерактив не найдёт: проверки тултипа уйдут '
                  'в N/A вместо FAIL (RETRO 56)')
    # `' + CFG.ns + '-data-tip="…"` выглядит в исходнике как data-tip и проходит
    # T7, а в DOM приезжает `pvt-data-tip`. Виджет работает, а весь тултиповый
    # слой уходит в N/A и его не проверяет никто (RETRO 59).
    ns_attr = sorted(set(m.group(1) for m in re.finditer(
        r"""(?:CFG\.ns|\bP)\s*\+\s*['"]-(data-(?:tip|kind|action|view)[\w-]*)""", c.code)))
    add('T7b', not ns_attr, 'имена триггерных атрибутов не склеены с CFG.ns',
        bad='атрибут собран из CFG.ns: в DOM приедет "<ns>-'
            + (ns_attr[0] if ns_attr else '') + '" вместо "'
            + (ns_attr[0] if ns_attr else '') + '" — smoke.mjs ищет имя '
              'ЦЕЛИКОМ, тултипы и вкладки уйдут в N/A (RETRO 59). Префикс CFG.ns '
              'нужен КЛАССАМ, а не data-атрибутам')


# ══ S21. Слушатели под флагом, переживающим перезапуск ══════════════════════
@check('S21', order=18)
def listeners_unconditional(c, add):
    guarded = []
    for m in re.finditer(r'\bif\s*\(', c.bare):
        op = m.end() - 1
        cp = match_parens(c.bare, op)
        if cp == -1:
            continue
        if not re.search(r'\bstate\b', c.code[op:cp + 1]):
            continue
        br6 = c.bare.find('{', cp)
        if br6 == -1 or c.bare[cp + 1:br6].strip():
            continue
        end6 = match_braces(c.bare, br6)
        if end6 == -1:
            continue
        for ml in re.finditer(r'(\w+)\s*\.\s*addEventListener', c.code[br6:end6]):
            if ml.group(1) not in ('window', 'document'):
                guarded.append(ml.group(1) + ' (строка '
                               + str(line_of(c.raw, br6 + ml.start())) + ')')
    add('S21', not guarded, 'слушатели overlay навешиваются безусловно',
        bad='addEventListener на ' + ', '.join(sorted(set(guarded))[:3])
            + ' стоит под условием из state. Флаг переживает перезапуск скрипта,'
            ' а overlay пересоздаётся — после первой же перерисовки Proteus'
            ' новый overlay останется без обработчиков: тултипы и вкладки'
            ' умрут молча, без ошибок в консоли (RETRO 65). Старый overlay'
            ' удаляется вместе со слушателями, дублей не будет: вешай'
            ' безусловно, как в шаблоне. Флаг нужен ТОЛЬКО window/document')


# ══ S8/S10. Скрытие и даты ══════════════════════════════════════════════════
@check('S8', 'S10', order=19)
def hide_and_dates(c, add):
    hid = [i for i, l in enumerate(c.code_lines, 1) if re.search(r'\.hidden\s*=', l)]
    add('S8', not hid, 'скрытие через style',
        bad='строки ' + ','.join(map(str, hid[:5])) + ': .hidden ненадёжен (RETRO 8)')
    if re.search(r'_dt\b|date|month|period|\bdt\b', c.bare, re.I):
        add('S10', 'toDate' in c.bare or bool(re.search(r'1e12', c.bare)),
            'есть универсальный парсер даты', warn=True,
            bad='даты без toDate(): epoch придёт числом (RETRO 10)')


# ══ S11/S12/D1. Запреты синтаксиса ══════════════════════════════════════════
@check('S11a', 'S11b', 'S11c', 'S12', 'D1a', 'D1b', 'D1c', order=20)
def forbidden(c, add):
    for cid, pat, msg in [
        ('S11a', r'`', 'backticks / template-literals (RETRO 13)'),
        ('S11b', r'=>', 'стрелочные функции (RETRO 13)'),
        ('S11c', r'\b(?:let|const)\s+\w', 'let / const (RETRO 13)'),
        ('S12', r'document\.getElementById', 'document.getElementById (RETRO 15)'),
        ('D1a', r'\b(?:import|require)\s*[\(\'"]', 'import / require'),
        ('D1b', r'\bfetch\s*\(', 'fetch'),
    ]:
        hits = [i for i, l in enumerate(c.code_lines, 1) if re.search(pat, l)]
        add(cid, not hits, 'нет ' + msg, bad=msg + ' → строки ' + ','.join(map(str, hits[:5])))
    # Пространства имён SVG (w3.org) легальны, CDN — нет.
    cdn = [i for i, l in enumerate(c.code_lines, 1)
           if re.search(r'https?://', l) and not re.search(r'https?://(?:www\.)?w3\.org', l)]
    add('D1c', not cdn, 'нет внешних URL / CDN',
        bad='внешний URL / CDN → строки ' + ','.join(map(str, cdn[:5])))


# ══ H1/H2. Гигиена и подгонка под валидатор ═════════════════════════════════
@check('H1', 'H2', order=21)
def hygiene(c, add):
    cl = [i for i, l in enumerate(c.code_lines, 1) if re.search(r'\bconsole\s*\.\s*\w', l)]
    add('H1', not cl, 'нет console.*', warn=True,
        bad='console.* → строки ' + ','.join(map(str, cl[:5]))
            + ' — отладочный вывод в боевом файле; ошибку показывает overlay (C6b)')
    # Проверки описывают ПОВЕДЕНИЕ. Заглушка «чтобы позеленело» снимает симптом
    # и оставляет болезнь, а потом выглядит как доказательство (RETRO 45).
    gaming = [i for i, l in enumerate(c.lines, 1)
              if re.search(r'(?://|/\*|^\s*\*)\s*.*?(?:для\s+validate|ради\s+(?:валидатор|проверк)'
                           r'|чтобы\s+(?:валидатор|проверка|позелен)|фиктивн|обойти\s+проверк'
                           r'|заглушка\s+для)', l, re.I)]
    add('H2', not gaming, 'нет кода, написанного ради валидатора',
        bad='строки ' + ','.join(map(str, gaming[:5]))
            + ': код подогнан под validate.py. Проверка описывает поведение — '
              'заглушка гасит сигнал, а баг остаётся (RETRO 42, 45)')


# ══ M7/C8/C5. Чтение data и базовая защита ══════════════════════════════════
@check('M7', 'M7b', 'M7c', 'C8', 'C5', order=22)
def data_input(c, add):
    add('M7', not re.search(r'\bdata\s*\[\s*0\s*\]', c.bare), 'читается весь data',
        bad='data[0] — остальные строки потеряны (RETRO 11)')
    first_only = [i for i, l in enumerate(c.code_lines, 1)
                  if re.search(r'\brawData\s*\[\s*0\s*\]', l)]
    if first_only:
        add('M7c', False, '', warn=True,
            bad='rawData[0] → строки ' + ','.join(map(str, first_only[:5]))
                + ': если SQL отдаёт одну агрегатную строку — норма, объясни это; '
                  'иначе остальные строки молча потеряны (RETRO 11, 41)')
    add('M7b', 'Array.isArray' in c.bare, 'вход защищён Array.isArray',
        bad='нет Array.isArray — падёт на пустом data')
    add('C8', 'function esc' in c.bare or 'escapeHtml' in c.bare, 'есть экранирование',
        bad='нет esc() — данные вставляются в HTML сырыми')
    add('C5', 'noData' in c.bare, 'есть ветка CFG.text.noData',
        bad='нет ветки «Нет данных»')


# ══ V1-V4. Интерактивные таблицы ════════════════════════════════════════════
@check('V1', 'V2', 'V3', 'V4', order=23)
def tables(c, add):
    is_copy = bool(re.search(r'clipboard|writeText|execCommand\s*\(\s*[\'"]copy', c.bare))
    has_page = bool(re.search(r'\bpageRows\b|\bpageSize\b|state\.page\b', c.bare))
    has_sort_ui = bool(re.search(r'sortKey|sortDir', c.bare))

    if is_copy:
        dom_export = bool(re.search(
            r'querySelectorAll\s*\(\s*[\'"](?:tr|td|th|tbody|table)', c.code)) \
            or 'innerText' in c.bare
        add('V1', not dom_export, 'экспорт строится из модели',
            bad='copy/export обходит DOM (querySelectorAll(\'tr\')/innerText) — '
                'скопируется только текущая страница (RETRO 28, 33)')
        if has_page:
            exp = None
            for nm in ('buildExportRows', 'buildCopyText', 'onCopy', 'doCopy', 'copyRows'):
                exp = exp or c.fn(nm)
            probe = exp if exp is not None else c.code
            add('V2', 'pageRows' not in probe, 'экспорт не завязан на pageRows', warn=True,
                bad='экспорт использует pageRows — скопируется только текущая страница (RETRO 28)')

    if has_sort_ui:
        cmps = []
        for m in re.finditer(r'\.sort\s*\(\s*function\s*\w*\s*\([^)]*\)\s*', c.bare):
            brs = c.bare.find('{', m.end())
            if brs == -1:
                continue
            ends = match_braces(c.bare, brs)
            if ends != -1:
                cmps.append(c.code[brs + 1:ends])
        for m in re.finditer(r'\.sort\s*\(\s*(\w+)\s*\)', c.bare):   # .sort(cmpByName)
            body = c.fn(m.group(1))
            if body is not None:
                cmps.append(body)
        if cmps:
            guard = all(re.search(r'isNaN|isFinite|[!=]==?\s*null|[!=]==?\s*[\'"]{2}'
                                  r'|Infinity|undefined', b) for b in cmps)
            add('V3', guard, 'comparator обрабатывает пустые значения', warn=True,
                bad='comparator без обработки null/\'\'/NaN — '
                    'пустые всплывут наверх при DESC (RETRO 29)')

    if has_page and c.html_body is not None:
        hb = c.html_body
        full_scan = bool(re.search(r'MODEL\.rows\s*\.\s*(?:forEach|map)', hb)) \
            or bool(re.search(r'MODEL\.rows\.length', hb))
        add('V4', not full_scan or 'slice' in hb, 'в DOM идёт срез страницы', warn=True,
            bad='есть пагинация, но buildHTML итерирует всю MODEL.rows — '
                'в DOM создаются все строки (RETRO 30, 40)')


# ══ M4. CFG.fields ══════════════════════════════════════════════════════════
def _count_fields(c):
    """Число полей в CFG.fields и признак «задан массивом, а не объектом»."""
    mf = re.search(r'fields\s*:\s*', c.bare)
    if not mf:
        return 0, False
    # Форма важна: шаблон объявляет fields ОБЪЕКТОМ { alias: 'sql_column' }.
    # Массив имён — уже не он: по нему не построить ни автомок в smoke.mjs,
    # ни сверку alias'ов с FIELDS.md.
    as_array = c.bare[mf.end():mf.end() + 1] == '['
    if as_array:
        return 0, True
    br5 = c.bare.find('{', mf.end())
    if br5 == -1 or c.bare[mf.end():br5].strip():
        return 0, False
    end5 = match_braces(c.bare, br5)
    if end5 == -1:
        return 0, False
    inner = c.bare[br5 + 1:end5]
    depth, top = 0, []
    for chx in inner:
        if chx == '{':
            depth += 1
        elif chx == '}':
            depth -= 1
        elif depth == 0:
            top.append(chx)
    return len(re.findall(r'[\w\'"]+\s*:', ''.join(top))), False


@check('M4', order=24, tpl='only')
def fields_template(c, add):
    n, _ = _count_fields(c)
    add('M4', n == 0, 'болванка: CFG.fields пуст',
        bad='CFG.fields содержит ' + str(n) + ' выдуманных полей')


@check('M4', 'M4b', order=24, tpl='never')
def fields_live(c, add):
    n, as_array = _count_fields(c)
    add('M4', n > 0, 'CFG.fields: ' + str(n) + ' полей',
        bad='CFG.fields задан массивом имён, а шаблон ждёт объект'
            ' { alias: \'sql_column\' } — по массиву не работают ни автомок'
            ' smoke.mjs, ни сверка alias\'ов (RETRO 52)' if as_array else
            'CFG.fields пуст — данные не привязаны к SQL')
    todo = [i for i, l in enumerate(c.lines, 1) if '[ЗАПОЛНИ]' in l or '[ЗАМЕНИ]' in l]
    add('M4b', not todo, 'нет незакрытых TODO',
        bad='остались плейсхолдеры → строки ' + ','.join(map(str, todo[:6])))


# ══ H4. Тихое упрощение ═════════════════════════════════════════════════════
# Регулярка описывает УРЕЗАНИЕ ОБЪЁМА, а не отдельные слова: прежняя роняла
# сдачу на `// идём вверх, пока не упрёмся` и на `// Заглушка при пустых
# данных`, то есть на комментарии к ветке noData, которую сам скилл и требует.
@check('H4', order=25, tpl='never')
def silent_cuts(c, add):
    cut = []
    for cm in c.comments:
        low = cm.lower()
        if re.search(r'нет данных|пуст|no ?data|данных нет', low):
            continue
        if re.search(r'не реализован|нереализован|для простоты|упрощ[её]н'
                     r'|в этой версии|\btodo\b|\bfixme\b'
                     r'|пока (?:что )?(?:не|нет)\s*(?:реализ|сдела|поддерж'
                     r'|работ|подключ|перенес|считае|учитыва)'
                     r'|пока только|пока без'
                     r'|временно\s*(?:не|отключ|убра|захардкож|заглуш)'
                     r'|заглушк\w*\s+(?:вместо|для|на месте|под)', low):
            cut.append(cm.strip()[:60])
    add('H4', not cut, 'нет упрощений, спрятанных в комментарий',
        bad='код признаётся, что делает не то, что в макете: «' + '», «'.join(cut[:2])
            + '» — либо реализуй, либо СПРОСИ пользователя и запиши ответ '
              'в NOTES §4; комментарий в коде решением не является (RETRO 61)')
