#!/usr/bin/env python3
"""Exercise the largest accepted person list through real Superset parser code."""
import hashlib
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'docs/vendor/proteus-playbook/kit'))
import superset201 as sp

OUT=ROOT/'Параллельный отчёт — pa_next'
cases={
    '5000-logins':{'ca_login_f':['u%05d'%n for n in range(5000)]},
    '5000-master-ids':{'ca_master_f':[str(100000+n) for n in range(5000)]},
    '32000-chars':{'ca_login_f':['u'+str(n).zfill(3)+'a'*124 for n in range(250)]},
    'both-lists':{'ca_login_f':['u%05d'%n for n in range(2500)],'ca_master_f':[str(100000+n) for n in range(2500)]},
}
report={'completed':False,'sqlparse':sp.sqlparse.__version__,'checks':[],'source_sha256':{}}
for part,name in [('cat','5. SQL — каталог.sql'),('one','7. SQL — панель.sql')]:
    template=(OUT/name).read_text();report['source_sha256'][part]=hashlib.sha256(template.encode()).hexdigest()
    for label,filters in cases.items():
        rendered=sp.render(template,filters=filters)
        assert rendered.error is None,(part,label,rendered.error)
        path=sp.chart_path(rendered.text,['section','g','k','parent','n'])
        assert path['error'] is None,(part,label,path['error'])
        size=len(path['texts']['executed'].encode())
        assert size<sp.MAX_QUERY_SIZE,(part,label,size)
        item={'part':part,'case':label,'bytes':size,'limit':sp.MAX_QUERY_SIZE,'status':'passed'}
        report['checks'].append(item);print('PASS',item,flush=True)
report.update(completed=True,status='passed')
Path('/tmp/pa-next-people-limits.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
