# -*- coding: utf-8 -*-
"""selftest — иммунитет чекера. Четыре слоя, от дешёвого к дорогому.

Проверка, которая ничего не проверяет, выглядит ровно как проверка, которая
всё прошла. E7 два релиза зеленел на сломанных вкладках. Поэтому чекер
проверяется сам, и раньше это стоило дорого: единственным способом проверить
одну проверку была фикстура-виджет на 190 строк. Отсюда восемь проверок
с `cond: true` без покрытия — на них просто не хватило фикстур.

Слои:
  1. СНИППЕТЫ — одна проверка на десяти строках. Дёшево настолько, что новую
     проверку без покрытия писать уже незачем. Ловит ОБА направления ошибки:
     «обязана упасть» и «обязана промолчать».
  2. ФИКСТУРЫ — целые виджеты с известным вердиктом: интеграция.
  3. ПРОЕКТЫ — мини-папки с NOTES/SELF_CHECK/FIELDS: Z-проверки и формат отчёта.
  4. МЕТА — согласованность: checks.json ↔ реестр ↔ SELF_CHECK ↔ покрытие.

Ложная тревога дороже пропуска: агент верит проверке и правит ЗДОРОВЫЙ код,
пока из чарта не уедет защитный try/catch (RETRO 60). Поэтому в снippet-наборе
у каждой проверки есть и отрицательный случай.
"""

import json
import os
import re
import subprocess
import sys
import tempfile

from . import checks_code, checks_process  # noqa: F401  (регистрируют проверки)
from .ctx import Ctx
from .registry import REGISTRY, Engine, declared_ids, load_manifest

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)
FX = os.path.join(SKILL, 'fixtures')

PRINTED_ID = re.compile(r'^\s*[v!X?-]\s+(\S+)\s+(?:PASS|FAIL|WARN|N/A|ОСПОР)\s', re.M)


# ── слой 1: сниппеты ─────────────────────────────────────────────────────────
# Каркас ровно такой, чтобы Ctx разобрал файл. Под каждую проверку подставляется
# только её кусок — остальное не мешает и не участвует.
SKELETON = """// ---------- БЛОК 1: CFG ----------
var CFG = { ns: 'pvt', fields: { a: 'col_a' }, text: { noData: 'Нет данных' },
  colors: { bg: '#fff' }, fonts: { family: 'Arial' } };
// ---------- БЛОК 2 ----------
var rawData = (typeof data !== 'undefined' && Array.isArray(data)) ? data : [];
if (!window.__pvtState) window.__pvtState = {};
var state = (window.__pvtState[CFG.ns] = window.__pvtState[CFG.ns] || { tip: null });
function esc(s) { return String(s == null ? '' : s); }
// ---------- БЛОК 3 ----------
function buildModel() { return { rows: [] }; }
var MODEL = buildModel();
// ---------- БЛОК 4 ----------
// ---------- БЛОК 5 ----------
function buildCSS() {
  var P = '.' + CFG.ns;
  return ['<style>', __CSS__, '</style>'].join('');
}
function buildHTML() {
  var h = [];
  h.push('<div class="' + CFG.ns + '-root">');
  __HTML__
  h.push('</div>');
  return buildCSS() + h.join('');
}
// ---------- БЛОК 6 ----------
(function mount() {
  try {
    var hosts = document.querySelectorAll('[_echarts_instance_]');
    var host = hosts[hosts.length - 1];
    host.querySelectorAll('canvas')[0].style.display = 'none';
    var prev = host.querySelector('.' + CFG.ns + '-overlay');
    if (prev) prev.parentNode.removeChild(prev);
    var overlay = document.createElement('div');
    host.style.position = 'relative';
    host.appendChild(overlay);
    function render() { overlay.innerHTML = buildHTML(); }
    __MOUNT__
    render();
  } catch (e) {
    var box = document.querySelector('.x');
    if (box) box.innerHTML = 'Ошибка графика: ' + esc(e.message);
  }
})();
// ---------- БЛОК 7 ----------
option = { animation: false, xAxis: { show: false }, yAxis: { show: false },
  series: [{ type: 'scatter', data: [] }] };
"""


def snippet(css='', html='', mount=''):
    return (SKELETON
            .replace('__CSS__', css or "P + '-root{width:100%;font-family:Arial;}'")
            .replace('__HTML__', html or '')
            .replace('__MOUNT__', mount or ''))


# (имя случая, исходник, {код: ожидаемый статус})
# Ожидание задаётся ТОЧЕЧНО: проверяются только перечисленные коды, остальное
# в сниппете может быть каким угодно.
SNIPPETS = [
    ('S5c: составной селектор через P даёт две точки',
     snippet(css="P + '-a.' + P + '-b{color:red;}'"), {'S5c': 'FAIL'}),
    ('S5c: правильный составной селектор молчит',
     snippet(css="P + '-a' + P + '-b{color:red;}' + P + '-root{width:100%;}'"),
     {'S5c': 'PASS'}),
    ('S5c: обычные правила молчат',
     snippet(css="P + '-root{width:100%;font-family:Arial;}' + P + '-row{color:red;}'"),
     {'S5c': 'PASS'}),
    ('S5c: несбалансированные скобки',
     snippet(css="P + '-a{color:red;'"), {'S5c': 'FAIL'}),
    ('S5d: потерянная точка с запятой на стыке',
     snippet(css="P + '-root{width:100%' + 'color:red;}'"), {'S5d': 'WARN'}),
    ('S5d: точки с запятой на месте',
     snippet(css="P + '-root{width:100%;' + 'color:red;}'"), {'S5d': 'PASS'}),
    ('S15: класс с ведущей точкой в разметке',
     snippet(html="h.push('<div class=\".' + CFG.ns + '-x\"></div>');"),
     {'S15': 'FAIL'}),
    ('S15: нормальная разметка молчит', snippet(), {'S15': 'PASS'}),
    ('S8: скрытие через .hidden',
     snippet(mount='overlay.hidden = true;'), {'S8': 'FAIL'}),
    ('S11b: стрелочная функция',
     snippet(mount='var f = function () { return 1; }; overlay.onclick = function(){};'),
     {'S11b': 'PASS'}),
    ('S11b: стрелочная функция ловится',
     snippet(mount='var f = () => 1;'), {'S11b': 'FAIL'}),
    ('S21: слушатель под флагом из state',
     snippet(mount='if (!state.bound) { overlay.addEventListener("click", render); }'),
     {'S21': 'FAIL'}),
    ('S21: безусловный слушатель молчит',
     snippet(mount='overlay.addEventListener("click", render);'), {'S21': 'PASS'}),
    ('T7b: имя атрибута склеено с CFG.ns',
     snippet(html="h.push('<i ' + CFG.ns + '-data-tip=\"1\"></i>');"),
     {'T7b': 'FAIL'}),
    ('T7b: обычный data-tip молчит',
     snippet(html="h.push('<i data-tip=\"1\"></i>');"), {'T7b': 'PASS'}),
    ('H4: упрощение спрятано в комментарий',
     snippet(mount='// группировка не реализована для простоты'), {'H4': 'FAIL'}),
    ('H4: комментарий про ветку noData молчит',
     snippet(mount='// Заглушка при пустых данных'), {'H4': 'PASS'}),
    ('H4: «идём вверх, пока не упрёмся» молчит',
     snippet(mount='// идём вверх, пока не упрёмся в overlay'), {'H4': 'PASS'}),
    ('S19: фиксированная ширина корня',
     snippet(css="P + '-root{width:820px;font-family:Arial;}'"), {'S19': 'FAIL'}),
    ('S19: резиновый корень молчит',
     snippet(css="P + '-root{width:100%;font-family:Arial;}'"), {'S19': 'PASS'}),
]


def run_snippets(verbose=True):
    bad = 0
    tmp = tempfile.mkdtemp(prefix='pvt-snip-')
    if verbose:
        print('Сниппеты: одна проверка на десяти строках')
    for name, src, want in SNIPPETS:
        path = os.path.join(tmp, 'snip.chart.js')
        with open(path, 'w', encoding='utf-8') as fh:
            fh.write(src)
        c = Ctx(path, src, is_tpl=False, skill_dir=SKILL)
        eng = Engine()
        eng.resolve_mode(c)
        got = {}
        for entry in REGISTRY:
            if entry['tpl'] == 'only':
                continue
            if not (set(entry['ids']) & set(want)):
                continue
            entry['fn'](c, eng.add)
        for cid, st, _ in eng.results:
            got.setdefault(cid, st)
        ok = all(got.get(k) == v for k, v in want.items())
        bad += 0 if ok else 1
        if verbose and not ok:
            print(' X  ' + name)
            for k, v in want.items():
                print('      ' + k + ': ждали ' + v + ', получили ' + str(got.get(k)))
        elif verbose:
            print(' v  ' + name)
    if verbose:
        print(('    все ' + str(len(SNIPPETS)) + ' сниппета сошлись')
              if not bad else ('    расхождений: ' + str(bad)))
    return bad


# ── слои 2-3: фикстуры и проекты ─────────────────────────────────────────────
def run_fixtures(exercised):
    exp_path = os.path.join(FX, 'EXPECT.validate.json')
    if not os.path.isfile(exp_path):
        print('Нет ' + exp_path)
        return 1
    expect = json.load(open(exp_path, encoding='utf-8'))
    bad = 0
    print('\nФикстуры: целые виджеты с известным вердиктом')

    def run_case(target, want, note, drop_k1):
        nonlocal bad
        p = subprocess.run([sys.executable, os.path.join(SKILL, 'validate.py'), target],
                           capture_output=True, text=True)
        got = set(re.findall(r'^\s*X\s+(\S+)\s+FAIL', p.stdout, re.M))
        if drop_k1:
            got.discard('K1')
        exercised.update(PRINTED_ID.findall(p.stdout))
        got = sorted(got)
        ok = got == sorted(want)
        bad += 0 if ok else 1
        print((' v  ' if ok else ' X  ') + os.path.basename(target).ljust(26)
              + 'ждали FAIL [' + (', '.join(sorted(want)) or '—')
              + '], получили [' + (', '.join(got) or '—') + ']')
        if not ok and note:
            print('      ' + note)

    for name in sorted(k for k in expect if not k.startswith('_') and '/' not in k):
        run_case(os.path.join(FX, name), expect[name]['fail'],
                 expect[name].get('note'), drop_k1=True)

    proj = os.path.join(FX, 'projects')
    if os.path.isdir(proj):
        for sub in sorted(os.listdir(proj)):
            chart = os.path.join(proj, sub, sub + '.chart.js')
            key = 'projects/' + sub
            if not os.path.isfile(chart) or key not in expect:
                print(' X  ' + key + ' — нет .chart.js или записи в EXPECT')
                bad += 1
                continue
            run_case(chart, expect[key]['fail'], expect[key].get('note'), drop_k1=False)
    return bad


# ── слой 4: мета ─────────────────────────────────────────────────────────────
def owner_of(cid, meta):
    """Кто печатает код. Явное поле owner; иначе — по форме кода."""
    if meta.get('owner'):
        return meta['owner']
    return 'smoke' if (cid.startswith('E') or cid == 'B0') else 'validate'


def run_meta(exercised):
    bad = 0
    print('\nМета: согласованность манифеста, реестра, документации и покрытия')
    manifest = load_manifest()
    mine = {cid for cid, m in manifest.items() if owner_of(cid, m) == 'validate'}
    declared = declared_ids()

    for label, items, why in [
        ('коды реестра без записи в checks.json', sorted(declared - set(manifest)),
         'дополни checks.json — иначе severity/режим кода не определены'),
        ('записи checks.json без проверки в реестре', sorted(mine - declared),
         'код не вызывается: удали запись, верни проверку или смени owner'),
    ]:
        if items:
            bad += 1
            print(' X  ' + label + ': ' + ', '.join(items) + ' — ' + why)
        else:
            print(' v  ' + label + ': —')

    master_p = os.path.join(SKILL, 'SELF_CHECK.md')
    if os.path.isfile(master_p):
        master = open(master_p, encoding='utf-8').read()
        sections = re.split(r'(?m)^##\s+', master)
        nomark = [s.split('.', 1)[0].split(' ', 1)[0] for s in sections[1:]
                  if re.match(r'^[A-Z][.\s]', s) and '- [ ]' in s
                  and not re.search(r'<!--\s*mode:\s*[AB]+\s*-->', s.splitlines()[0])]
        pts = re.findall(r'^- \[ \] ([A-Z]\d+[a-z]?)\.', master, re.M)
        if nomark:
            bad += 1
            print(' X  секции SELF_CHECK без маркера <!--mode:-->: ' + ', '.join(nomark))
        else:
            print(' v  секции SELF_CHECK размечены режимами: ' + str(len(pts)) + ' пунктов')
        # Суждение и код проверки не могут носить ОДНО имя: в генерируемом
        # отчёте это две разные таблицы, и одинаковый ID означает, что агент
        # заполняет клетку, которую машина считает своей. Именно так мастер
        # и разъехался в прошлой версии: пункты C3/D1/S11/Z7 выглядели
        # кодами проверок, не будучи ими.
        clash = sorted(set(pts) & set(manifest))
        if clash:
            bad += 1
            print(' X  ID суждений совпадают с кодами проверок: ' + ', '.join(clash)
                  + ' — переименуй пункт в SELF_CHECK.md (например P5 → P5h)')
        else:
            print(' v  суждения и коды проверок не пересекаются именами')

    uncovered = sorted(cid for cid in mine
                       if manifest[cid].get('sev') == 'block'
                       and not manifest[cid].get('cond') and cid not in exercised)
    if uncovered:
        bad += 1
        print(' X  блокирующие проверки без единой фикстуры/сниппета: '
              + ', '.join(uncovered)
              + ' — добавь случай, иначе ложную тревогу поймает пользователь')
    else:
        print(' v  каждая блокирующая проверка печатается хотя бы одним случаем')
    return bad


def run():
    exercised = set()
    bad = run_snippets()
    bad += run_fixtures(exercised)
    bad += run_meta(exercised)
    print('\nИтог: ' + ('валидатор и мета согласованы (код 0).' if not bad
                        else 'расхождений: ' + str(bad) + ' (код 1).'))
    return 1 if bad else 0
