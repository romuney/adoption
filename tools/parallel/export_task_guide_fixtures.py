#!/usr/bin/env python3
"""Read-only SQL fixtures for the user-driven audience task."""
import hashlib
import json
import os
from pathlib import Path
import argparse
import time

from verify_numbers import ROOT, DATASETS, PROD_MODE, load_stand, normalize

parser = argparse.ArgumentParser(description='Export actual audience-task SQL responses from an existing local synthetic database; never rebuilds it.')
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
OUT = args.output
assert os.environ.get('PA_DB'), 'Set PA_DB to an existing local synthetic database'
assert Path(os.environ['PA_DB']).is_dir()
assert not OUT.exists(), 'Never overwrite an existing fixture set'
OUT.mkdir()
metadata = {'completed':False, 'scope':'Actual read-only SQL responses on existing local synthetic ClickHouse; no fabricated business rows',
            'database':os.environ['PA_DB'], 'files':{}, 'queries':[]}
def save_meta():
    (OUT/'metadata.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
save_meta()
templates = {kind:(ROOT/'Параллельный отчёт — pa_next'/name).read_text() for kind,(_,name) in DATASETS.items()}
metadata['source_sha256'] = {kind:hashlib.sha256(text.encode()).hexdigest() for kind,text in templates.items()}
stand = load_stand()
import hidesql
metadata['clickhouse'] = str(stand.S.query('SELECT version()', 'CSV')).strip().strip('"')
assert metadata['clickhouse'].startswith('24.8.'), metadata['clickhouse']
generations = set()

def query(kind, filters, filename):
    sql = hidesql.render(templates[kind],filters)+'\nSETTINGS '+PROD_MODE+', max_threads=2, max_execution_time=30'
    assert sql.lstrip().startswith(('SELECT','WITH')), 'Only SELECT statements are allowed'
    started = time.monotonic()
    rows = json.loads(stand.S.query(sql,'JSON').bytes())['data']
    elapsed = time.monotonic()-started
    _, generation = normalize(rows,candidate=True)
    generations.add(generation)
    content = json.dumps(rows,ensure_ascii=False)+'\n'
    (OUT/filename).write_text(content)
    metadata['files'][filename] = {'dataset':kind,'filters':filters,'rows':len(rows),
                                 'sha256':hashlib.sha256(content.encode()).hexdigest(),'generation':generation}
    metadata['queries'].append({'dataset':kind,'filename':filename,'elapsed_s':round(elapsed,4)})
    save_meta()
    print('EXPORTED',filename,len(rows),round(elapsed,2),flush=True)
    return rows

head = query('head',{},'head.json')
specs = {row['parent'] for row in head if row['section']=='d' and row['g']=='spec' and row['parent']}
assert specs
choice_sql = '''SELECT s.sp AS spec, uniqExact(p.login) AS viewers
FROM prod_proteus.pa_next_pair p
INNER JOIN prod_proteus.pa_next_staffx s ON lower(toString(p.login)) = s.login
WHERE p.dashboard_id IN (2,3) AND bitAnd(toUInt64(p.msk_d),toUInt64(1073741823)) != 0
  AND ifNull(p.own_flg,0)=0 AND s.sp != ''
GROUP BY s.sp ORDER BY viewers DESC,spec LIMIT 20
SETTINGS max_threads=2,max_execution_time=15'''
choices = json.loads(stand.S.query(choice_sql,'JSON').bytes())['data']
spec = next(row['spec'] for row in choices if row['spec'] in specs)
ca = {'ca_spec_f':[spec]}
metadata['ca'] = {'kind':'spec','value':spec,'filters':ca,
                  'selection_rule':'Nonempty specialization present in actual head; largest current audience on reports 2 and 3, excluding owners'}
query('cat',ca,'cat.json')
all_rows = query('one',ca,'one-all.json')

def facts(rows):
    total = next(r['k'].split('|') for r in rows if r['section']=='total')
    people = [line.split('|') for r in rows if r['section']=='list' for line in r['k'].splitlines() if line]
    reached = [p for p in people if int(p[10])&64 and int(p[5])]
    holds = [line.split('|') for r in rows if r['section']=='h' for line in r['k'].splitlines() if line]
    never = sum(int(p[7]) for p in holds)
    never_names = [line.split('|')[0] for r in rows if r['section']=='n' for line in r['k'].splitlines() if line]
    return {'users':int(total[0]),'views':int(total[2]),'ca_reach':len(reached),'ca_never':never,
            'ca_total':len(reached)+never,'outside_ca_viewers':int(total[15]),
            'reached_logins':sorted(p[0] for p in reached),'never_logins':sorted(never_names),
            'ca_returned':sum(int(p[5]).bit_count()>=2 for p in reached),
            'ca_regular':sum(int(p[5]).bit_count()>=6 for p in reached)}

metadata['all_scope_facts'] = facts(all_rows)
reports = {}
for report in ['2','3']:
    filters = dict(ca,mode_param=['report'],sel_f=[report])
    filename = 'one-report-'+report+'.json'
    rows = query('one',filters,filename)
    reports[report] = {'file':filename,'filters':filters,'facts':facts(rows)}
    assert next(json.loads(r['k']) for r in rows if r['section']=='sj')['caMode']=='cond'
selected = max(reports,key=lambda rid:(reports[rid]['facts']['ca_reach']>0 and reports[rid]['facts']['ca_never']>0,
                                     reports[rid]['facts']['ca_reach']))
assert reports[selected]['facts']['ca_reach']>0 and reports[selected]['facts']['ca_never']>0
assert len(reports[selected]['facts']['never_logins'])==reports[selected]['facts']['ca_never']
metadata['reports'] = reports
metadata['report_id'] = selected
metadata['selected_one_file'] = reports[selected]['file']
metadata['selected_filters'] = reports[selected]['filters']
assert len(generations)==1,generations
metadata['generation'] = next(iter(generations))
assert all((ROOT/'Параллельный отчёт — pa_next'/DATASETS[k][1]).read_text()==t for k,t in templates.items())
metadata['completed'] = True
save_meta()
print('PASS',OUT,'spec='+spec,'report='+selected,'facts='+json.dumps({k:v for k,v in reports[selected]['facts'].items() if not k.endswith('logins')}),flush=True)
