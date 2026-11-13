#!/usr/bin/env python3
"""Collect completed local numerical evidence; never convert partial/error runs to success."""
import hashlib
import json
from pathlib import Path
from verify_numbers import ROOT, DATASETS


def main():
    out=ROOT/'Параллельный отчёт — pa_next/Проверки/Численная сверка.json'
    def read(name):
        return json.loads(Path('/tmp/pa-next-'+name+'-results.json').read_text())
    main=read('numeric')
    assert main['completed'] and main['passed']==320 and main['failed']==0
    sources={kind:hashlib.sha256((ROOT/'Параллельный отчёт — pa_next'/filename).read_bytes()).hexdigest() for kind,(_,filename) in DATASETS.items()}
    assert main['candidate_sha256']==sources
    source_sha=hashlib.sha256((ROOT/'Proteus Adoption (4).yaml').read_bytes()).hexdigest()
    assert main['baseline_yaml_sha256']==source_sha
    suites=[]
    for name,expected,kinds in [('numeric',320,{'head','cat','one'}),('identity',5,{'cat'}),('profile',50,{'cat','one'}),('head',5,{'head'})]:
        data=read(name)
        assert data['completed'] is True, name
        assert data['passed']==expected and data['failed']==0, name
        assert len(data['cases'])==expected and all(c['status']=='passed' for c in data['cases']), name
        assert {c['kind'] for c in data['cases']}==kinds, name
        assert data['candidate_sha256']=={kind:sources[kind] for kind in kinds}, name
        assert data['baseline_yaml_sha256']==source_sha, name
        assert data['baseline_revision']==main['baseline_revision'], name
        suites.append({'name':name,'comparisons':expected,'failed':0,'profiles':sorted({c['mode'] for c in data['cases']})})
    events,gp,base,ready=map(read,['events','gp','gp-pipeline','readiness'])
    assert all(r['status']=='passed' for r in [events,gp,base,ready])
    assert events['production_sha256']==source_sha
    assert events['candidate_sha256']==hashlib.sha256((ROOT/'Параллельный отчёт — pa_next/1. Helicopter — pa_next.yaml').read_bytes()).hexdigest()
    assert len(gp['checks'])==9 and len(base['base_table_comparisons'])==12
    assert all(c['status']=='passed' for c in gp['checks'])
    assert all(c['equal'] is True for c in base['base_table_comparisons'])
    assert len(ready['rows'])==21 and all(r['ready']==1 for r in ready['rows'])
    report={'status':'passed','scope':'local synthetic models; no corporate deployment performed',
            'baseline_sql_commit':main['baseline_revision'],'production_yaml_sha256':source_sha,
            'candidate_sql_sha256':sources,'clickhouse':main['clickhouse'],'postgresql':'17.12',
            'fact_rows':int(next(r['rows'] for r in ready['rows'] if r['table_name'].endswith('evd_day'))),
            'exact_query_comparisons':suites,'total_comparisons':sum(s['comparisons'] for s in suites),
            'source_events':{'input':events['input_events'],'expected_views':events['expected_views'],'actual_views':events['actual_views'],
                             'cases':events['cases'],'as_of':events['today'],'excluded_unused_column':'max_date (NULL and no downstream consumers verified)'},
            'base_gp_tables':base['base_table_comparisons'],'accelerated_gp_tables':gp['checks'],
            'readiness_table_count':len(ready['rows']),
            'normalization':'exact multiset; only packed line order normalized; duplicates and all numeric/string fields preserved; validated generation/request metadata excluded',
            'limitations':['PostgreSQL models portable GP SQL; actual corporate Greenplum and gp_to_click not executed.',
                           'Numerical suite timings were observational under other checks; no universal speedup is claimed.',
                           'chdb reports rows_read=0 despite reads; not usable for I/O conclusions.',
                           'Current production dataset SQL must still be confirmed against the pinned repository oracle during paired acceptance.',
                           'Live Proteus permissions, cache, imports and non-atomic multi-table refresh require documented owner checks.']}
    out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print('PASS: collected380 exact comparisons,12 base/9 accelerated GP tables,21ready tables; '+str(out))

if __name__=='__main__':main()
