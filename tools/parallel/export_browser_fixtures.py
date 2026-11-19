#!/usr/bin/env python3
"""Export real local CH24 candidate responses for the four-period browser regression."""
import argparse
import hashlib
import json
import os
from pathlib import Path
from verify_numbers import DATASETS, ROOT, PROD_MODE, load_stand, normalize


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--output',type=Path,default=Path('/tmp/pa-next-periods'))
    a=ap.parse_args()
    if not os.environ.get('PA_DB'):
        ap.error('Explicit local PA_DB required')
    s=load_stand(); import hidesql
    version=str(s.S.query('SELECT version()','CSV')).strip().strip('"')
    assert version.startswith('24.8.'),version
    info={'clickhouse':version,'scope':'synthetic SQL output for browser; no fabricated metric rows','periods':{}}
    templates={k:(ROOT/'Параллельный отчёт — pa_next'/filename).read_text() for k,(_,filename) in DATASETS.items()}
    info['source_sha256']={k:hashlib.sha256(t.encode()).hexdigest() for k,t in templates.items()}
    for period in ('d','w','m','q'):
        target=a.output/period;target.mkdir(parents=True,exist_ok=True)
        filters={} if period == 'd' else {'period_param':[period]}
        info['periods'][period]={}
        for kind,template in templates.items():
            query=hidesql.render(template,filters)+'\nSETTINGS '+PROD_MODE+', max_threads=4, max_execution_time=30'
            rows=json.loads(s.S.query(query,'JSON').bytes())['data']
            _,generation=normalize(rows,candidate=True)
            (target/(kind+'.json')).write_text(json.dumps(rows,ensure_ascii=False)+'\n')
            info['periods'][period][kind]={'generation':generation,'rows':len(rows),'totals':[r for r in rows if r['section']=='total']}
        print('EXPORTED',period,flush=True)
    (a.output/'metadata.json').write_text(json.dumps(info,ensure_ascii=False,indent=2)+'\n')
    print('PASS: actual four-period SQL payloads exported to',a.output)

if __name__=='__main__':main()
