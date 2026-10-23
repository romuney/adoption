"""Время ClickHouse: прежняя версия SQL (коммит до GP, same.BASE) и текущая — на типичных кликах борда (медиана 5 прогонов по очереди).
    PA_DB=<большой стенд> python3 .stand/speed.py [one|cat|head]
"""
import os, sys, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stand, hidesql, same

N = 5


def tm(q):
    t0 = time.perf_counter(); r = stand.S.query(q, 'JSON'); dt = time.perf_counter() - t0
    return dt, len(r.bytes())


def main():
    kinds = [k for k in sys.argv[1:] if k in same.FILES] or ['head', 'cat', 'one']
    t1, t2, _ = same.top_ids()
    cases = {
        'one': [('весь Proteus, 30 дней', {}), ('весь Proteus, 12 месяцев', {'period_param': 'm'}), ('весь Proteus, 20 недель', {'period_param': 'w'}),
                ('клик по отчёту, 30 дней', {'mode_param': 'report', 'sel_f': [t1]}), ('клик по отчёту, 12 месяцев', {'period_param': 'm', 'mode_param': 'report', 'sel_f': [t1]}),
                ('ЦА IT-руководители', {'ca_it_f': ['IT'], 'ca_head_f': '1'}), ('два отчёта', {'mode_param': 'report', 'sel_f': [t1, t2]})],
        'cat': [('открытие, 30 дней', {}), ('20 недель', {'period_param': 'w'}), ('12 месяцев', {'period_param': 'm'}), ('8 кварталов', {'period_param': 'q'}),
                ('все отчёты (переключатели)', {'pub_f': ['0'], 'act_f': ['0']}), ('ЦА IT-руководители', {'ca_it_f': ['IT'], 'ca_head_f': '1'}),
                ('фильтр «Кто смотрит»: руководители', {'heads_f': ['1']})],
        'head': [('шапка', {})]}
    for kind in kinds:
        old, new = same.src_of(same.FILES[kind], same.BASE), same.src_of(same.FILES[kind])
        print(f'== {kind}')
        for name, f in cases[kind]:
            qa = hidesql.render(hidesql.hide_template(old)[0], dict(f)); qb = hidesql.render(hidesql.hide_template(new)[0], dict(f))
            ta, tb = [], []
            for _ in range(N):
                ta.append(tm(qa)[0]); tb.append(tm(qb)[0])
            a, b = sorted(ta)[N // 2], sorted(tb)[N // 2]
            print(f'  {name:36s} {a:5.2f} с → {b:5.2f} с  ({(b - a) / a * 100:+.0f} %)', flush=True)


if __name__ == '__main__':
    main()
