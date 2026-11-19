#!/usr/bin/env python3
"""Query actual SQL7 report responses for preview browser regression on local CH24.8."""
import argparse
import hashlib
import json
import os
from pathlib import Path
from verify_numbers import ROOT, DATASETS, PROD_MODE, load_stand, normalize


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--periods', type=Path, default=Path('/tmp/pa-next-periods'))
    ap.add_argument('--output', type=Path, default=Path('/tmp/pa-next-preview'))
    args = ap.parse_args()
    assert os.environ.get('PA_DB'), 'Explicit local PA_DB required'
    meta = json.loads((args.periods / 'metadata.json').read_text())
    templates = {kind: (ROOT/'Параллельный отчёт — pa_next'/name).read_text() for kind, (_, name) in DATASETS.items()}
    hashes = {kind: hashlib.sha256(text.encode()).hexdigest() for kind, text in templates.items()}
    assert meta['source_sha256'] == hashes, 'Period fixtures do not match current SQL'
    stand = load_stand()
    import hidesql
    version = str(stand.S.query('SELECT version()', 'CSV')).strip().strip('"')
    assert version.startswith('24.8.'), version
    args.output.mkdir(parents=True, exist_ok=True)
    result = {'completed': False, 'clickhouse': version, 'source_sha256': hashes, 'periods': {},
              'scope': 'Actual local SQL7 output; no fabricated business metric rows'}
    (args.output/'metadata.json').write_text(json.dumps(result, indent=2)+'\n')
    def query(filters, target):
        sql = hidesql.render(templates['one'], filters)+'\nSETTINGS '+PROD_MODE+', max_threads=4, max_execution_time=30'
        rows = json.loads(stand.S.query(sql, 'JSON').bytes())['data']
        normalize(rows, candidate=True)
        target.write_text(json.dumps(rows, ensure_ascii=False)+'\n')
    for grain in ('d','w','m','q'):
        cat = json.loads((args.periods/grain/'cat.json').read_text())
        previews = {str(row['g']) for row in cat if row['section']=='pv'}
        reports = [line.split('|') for row in cat if row['section']=='rep' for line in row['k'].splitlines()]
        eligible = sorted([r for r in reports if r[0] in previews], key=lambda r: (-int(r[1] or 0), int(r[0])))
        ids = [r[0] for r in eligible[:2]]
        assert len(ids) == 2 and len(set(ids)) == 2
        target = args.output/grain
        target.mkdir(exist_ok=True)
        base = {} if grain=='d' else {'period_param':[grain]}
        for report_id in ids:
            query(dict(base, mode_param=['report'], sel_f=[report_id]), target/(report_id+'.json'))
        query(dict(base, mode_param=['report'], sel_f=ids), target/'multi.json')
        result['periods'][grain] = {'ids': ids, 'filters': base}
        print('EXPORTED', grain, ids, flush=True)
    result['completed'] = True
    (args.output/'metadata.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print('PASS:', args.output)


if __name__ == '__main__':
    main()
