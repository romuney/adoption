# -*- coding: utf-8 -*-
"""cssglue — склейка buildCSS() в готовый <style> и ЛИНТ получившегося CSS.

ЗАЧЕМ СКЛЕЙКА. Одно правило пишут двумя равноправными способами:

    var P = '.' + CFG.ns;         s += P + '-tip{font-family:...}'
    var P = '.' + CFG.ns + '-';   s += P + 'tip{font-family:...}'

Проверка, ищущая в ИСХОДНИКЕ литерал '-tip{', вторую форму не находит и
говорит «тултип без font-family» там, где он есть. Лечением становится
дублирующее мёртвое правило (RETRO 63). Поэтому проверки читают ГОТОВЫЙ CSS.

ЗАЧЕМ ЛИНТ. Склейка — это ручная сборка синтаксиса из кусков, и она ломается
ТИХО. Реальный случай (сессия «иерархический-фильтр», 12 минут и три
playwright-зонда): составной селектор написан как

    P + '-flt.' + P + '-open ' + P + '-flt-pop{display:block}'

Точка есть в самом P, поэтому в DOM приезжает `.hier-flt..hier-open` — две
точки подряд. Браузер отбрасывает невалидный селектор целиком и МОЛЧИТ:
ни ошибки в консоли, ни следа в отладке, просто правило не применяется.
Так молча умерли 31 правило из одного файла, а симптомом был единственный
FAIL «поповер не открывается».

Ни одна проверка этого не видела: селектор начинается с точки, значит
префикс на месте (S5), класс в разметке есть (S6). Линт закрывает весь
класс разом — он читает то, что реально приедет в <style>.
"""

import re

VAL = '\x01'   # место значения, склеенного из выражения: CFG.colors.bg и т.п.


def css_text(code, bare, span, ns):
    """CSS из buildCSS() СКЛЕЕННЫЙ — таким, каким он приедет в <style>.

    `P` и `CFG.ns` подставляются реально, значения-выражения становятся VAL,
    границы инструкций — переводом строки.
    """
    if span is None:
        return ''
    from .ctx import string_spans
    a0, b0 = span
    body = code[a0:b0]

    pfx = '.' + ns
    mp = re.search(r"\bP\s*=\s*(['\"])\.\1\s*\+\s*CFG\.ns\s*(\+\s*(['\"])-\3)?", body)
    if mp:
        pfx = '.' + ns + ('-' if mp.group(2) else '')
    elif re.search(r"\bP\s*=\s*CFG\.ns\s*\+\s*(['\"])-\1", body):
        pfx = ns + '-'

    def head_token(g):
        """Что стоит слева от '+', открывающего новую склейку."""
        m = re.search(r'([\w.$]+)\s*\+\s*$', g)
        h = m.group(1) if m else ''
        return pfx if h == 'P' else (ns if h == 'CFG.ns' else '')

    out, prev = [], a0
    for (i, j, _q) in string_spans(code, bare, a0, b0):
        g = code[prev:i].strip()
        if g == '' or re.fullmatch(r'\++', g):
            pass                                   # чистая склейка строк
        elif g.startswith('+') and g.endswith('+'):
            inner = g[1:-1].strip()                # значение внутри склейки
            out.append(pfx if inner == 'P'
                       else ns if inner == 'CFG.ns' else VAL)
        else:
            # Инструкция кончилась: правила не должны слипаться в одно.
            out.append('\n' + head_token(g))
        out.append(code[i + 1:j])
        prev = j + 1
    return ''.join(out)


def css_rules(flat_css):
    """[(селектор, тело правила)] из склеенного CSS. @-правила и <style> мимо."""
    out = []
    for line in flat_css.splitlines():
        for m in re.finditer(r'([^{};]+)\{([^{}]*)\}?', line):
            sel = re.sub(r'^</?style>', '', m.group(1).strip()).strip()
            if not sel or sel.startswith('@') or sel.startswith('<'):
                continue
            out.append((sel, m.group(2)))
    return out


# ── линт ─────────────────────────────────────────────────────────────────────
# Правило линта: сообщать ТОЛЬКО о том, что браузер гарантированно отбросит.
# Ложная тревога здесь дороже пропуска — агент верит проверке и правит
# здоровый CSS, пока из файла не уедет что-нибудь нужное (RETRO 60).

# `..`  — склейка префикса, который уже несёт точку, с точкой из литерала.
# `.{`, `. `, `.,`, `.)` — класс без имени: тот же обрыв склейки.
# `##`  — то же самое для id-селекторов.
_DEAD_SEL = [
    (re.compile(r'\.\.'), 'две точки подряд'),
    (re.compile(r'##'), 'две решётки подряд'),
    (re.compile(r'\.(?=[\s,{)]|$)'), 'точка без имени класса'),
    (re.compile(r'\.(?=\d)'), 'класс, начинающийся с цифры'),
]


def lint_selectors(flat_css):
    """Селекторы, которые браузер отбросит целиком. [(селектор, почему)]."""
    bad = []
    for sel, _body in css_rules(flat_css):
        # Селектор, собранный из значения-выражения, разобрать нечем: там
        # может стоять что угодно, и судить о нём мы не вправе.
        if VAL in sel:
            continue
        for rx, why in _DEAD_SEL:
            if rx.search(sel):
                bad.append((sel.strip()[:60], why))
                break
    return bad


def lint_braces(flat_css):
    """Баланс фигурных скобок в склеенном CSS. None — всё сошлось."""
    opens = flat_css.count('{')
    closes = flat_css.count('}')
    if opens == closes:
        return None
    return (opens, closes)


# Свойство, приклеившееся к предыдущему значению: пропущена `;` на стыке двух
# строк конкатенации. `background:#fffcolor:red` браузер разбирает как одно
# сломанное объявление и молча теряет ОБА свойства.
#   Исключения, где двоеточие законно и внутри значения:
#   url(data:...), linear-gradient(...), 'font:12px/1.4' и т.п. — поэтому
#   сегмент со скобками или с VAL не рассматривается вовсе.
_PROP = r'[a-z][a-z-]{2,}'
_GLUED = re.compile(r'^\s*' + _PROP + r'\s*:[^;{}()]*?[a-z0-9%)\]]' + _PROP + r'\s*:', re.I)


def lint_missing_semicolons(flat_css):
    """Объявления, слипшиеся без `;`. [(правило, сегмент)]."""
    out = []
    for sel, body in css_rules(flat_css):
        if VAL in body or '(' in body:
            continue
        for seg in body.split(';'):
            if _GLUED.search(seg):
                out.append((sel.strip()[:40], seg.strip()[:60]))
                break
    return out
