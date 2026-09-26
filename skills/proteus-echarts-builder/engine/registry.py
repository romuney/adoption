# -*- coding: utf-8 -*-
"""registry — реестр проверок и вердикт.

Проверка = функция над готовым Ctx, объявленная декоратором вместе с кодами,
которые она вправе печатать:

    @check('S5', 'S5b', 'S5c')
    def selectors(ctx, add):
        ...

Что это даёт против прежнего инлайна в main():
  - у проверки есть СВОЯ граница. Половина ложных тревог прошлых сессий росла
    из того, что проверка лезла в общий исходник и судила не тот кусок
    (RETRO 60: C6b брал первый catch в файле, S5 резала строки регуляркой);
  - коды объявлены явно, поэтому согласованность с checks.json сверяется
    точно, а не регуляркой по собственному тексту;
  - одну проверку можно прогнать на десятистрочном сниппете, а не заводить
    под неё фикстуру-виджет на 190 строк. Именно цена фикстуры и оставила
    восемь проверок с `cond: true` без покрытия.

РЕЖИМ определяется ДО запуска проверок. Раньше MODE читался из NOTES внутри
check_notes(), то есть ПОСЛЕ большинства add(): любая проверка с modes:"A"
вне этой функции молча фильтровалась по режиму A, каким бы ни был настоящий.
"""

import json
import os

from . import ctx as ctxmod

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL_DIR = os.path.dirname(HERE)

STATUSES = ('PASS', 'FAIL', 'WARN', 'ОСПОР')


def load_manifest(path=None):
    p = path or os.path.join(SKILL_DIR, 'checks.json')
    try:
        with open(p, encoding='utf-8') as fh:
            return json.load(fh).get('checks', {})
    except (OSError, ValueError) as err:
        raise RuntimeError('checks.json не читается: ' + str(err))


# ── реестр ───────────────────────────────────────────────────────────────────
# tpl: 'both'  — гоняется всегда
#      'only'  — только для болванки (--template)
#      'never' — только для боевого файла
REGISTRY = []


def check(*ids, **kw):
    tpl = kw.pop('tpl', 'both')
    order = kw.pop('order', 50)
    if kw:
        raise TypeError('неизвестные параметры check(): ' + ', '.join(kw))

    def deco(fn):
        REGISTRY.append({'ids': tuple(ids), 'fn': fn, 'tpl': tpl,
                         'order': order, 'name': fn.__name__})
        return fn
    return deco


def declared_ids():
    out = set()
    for c in REGISTRY:
        out.update(c['ids'])
    return out


class Engine(object):
    """Прогон реестра над одним чартом. Держит режим, оспаривания и результат."""

    def __init__(self, manifest=None, accepted=None):
        self.manifest = load_manifest() if manifest is None else manifest
        self.accepted = dict(accepted or {})
        self.mode = 'A'
        self.results = []          # [(cid, status, text)]
        self.unknown_ids = []
        self.mode_declared = None

    # -- добавление результата ------------------------------------------------
    def add(self, cid, ok, msg, warn=False, bad=None):
        meta = self.manifest.get(cid)
        if meta is None:
            self.unknown_ids.append(cid)
        else:
            # Проверка неприменима в текущем режиме — её в отчёте быть не должно.
            if self.mode not in (meta.get('modes') or 'AB'):
                return
            # База severity — из манифеста; warn= у вызова понижает
            # дополнительно (условные понижения: is_tpl, dyn). Обратно — никогда.
            if meta.get('sev') == 'warn':
                warn = True
        st = 'WARN' if (warn and not ok) else ('PASS' if ok else 'FAIL')
        text = msg if ok else (bad if bad is not None else msg)
        # Оспоренный FAIL не молчит и не зеленеет: он остаётся видимой строкой
        # вместе с причиной — иначе оспаривание становится способом закрыть
        # сдачу вместо способа сообщить о ложной тревоге (RETRO 66).
        if st == 'FAIL' and cid in self.accepted:
            st = 'ОСПОР'
            text = text + '  ||  ОСПОРЕНО: ' + self.accepted[cid]
        self.results.append((cid, st, text))

    # -- режим ----------------------------------------------------------------
    def resolve_mode(self, c):
        """Режим из NOTES §0 — ДО первой проверки.

        Раньше MODE читался внутри check_notes(), то есть ПОСЛЕ большинства
        add(): любая проверка с modes:"A" вне этой функции фильтровалась
        по режиму A независимо от настоящего. Сейчас режим стоит на Ctx
        до первого вызова, и проверки читают его оттуда.
        """
        txt = c.notes
        self.mode_declared = ctxmod.detect_mode(txt) if txt else None
        self.mode = self.mode_declared or 'A'
        c.mode = self.mode
        c.mode_declared = self.mode_declared
        return self.mode

    # -- прогон ---------------------------------------------------------------
    def run(self, c):
        self.resolve_mode(c)
        for entry in sorted(REGISTRY, key=lambda e: (e['order'], e['name'])):
            if entry['tpl'] == 'only' and not c.is_tpl:
                continue
            if entry['tpl'] == 'never' and c.is_tpl:
                continue
            entry['fn'](c, self.add)
        return self.results

    # -- сводка ---------------------------------------------------------------
    def by_status(self, st):
        return sorted(cid for cid, s, _ in self.results if s == st)

    def domain_of(self, cid):
        return (self.manifest.get(cid) or {}).get('domain', 'artifact')

    def blocking(self):
        """FAIL, которые РОНЯЮТ сдачу: всё, кроме канцелярии процесса.

        Домен в манифесте задуман как налоговая декларация вердикта, но до сих
        пор код возврата считал все FAIL одинаково. Из-за этого сдача падала
        на неотмеченном чекбоксе в NOTES так же, как на мёртвом виджете,
        и три прогона из шести уходили на канцелярию уже ПОСЛЕ зелёного кода.
        """
        return [cid for cid in self.by_status('FAIL')
                if self.domain_of(cid) != 'process']

    def paperwork(self):
        """FAIL канцелярии: чинить надо, сдачу не роняют."""
        return [cid for cid in self.by_status('FAIL')
                if self.domain_of(cid) == 'process']
