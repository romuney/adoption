#!/usr/bin/env python3
"""Measure full generation-proof scans separately from business SQL.

Synthetic constant version columns only; records overhead, not whole-report speed.
Run without another benchmark competing for CPU/storage.
"""
import argparse
import json
from pathlib import Path
import tempfile
import time
from chdb.session import Session

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'Параллельный отчёт — pa_next'

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--fact-rows',type=int,default=13_000_000)
    ap.add_argument('--output',type=Path,default=Path('/tmp/pa-next-generation-benchmark.json'))
    a=ap.parse_args()
    assert a.fact_rows>0
    manifest=json.loads((OUT/'src/data-manifest.json').read_text())
    run='benchmark-fixed-generation-000001'
    with tempfile.TemporaryDirectory(prefix='pa-next-guard-bench-') as tmp:
        s=Session(tmp)
        version=str(s.query('SELECT version()','CSV')).strip().strip('"')
        assert version.startswith('24.8.'),version
        s.query('SET max_threads=2')
        s.query('CREATE DATABASE prod_proteus')
        tables=sorted({t for item in manifest['datasets'].values() for t in item['tables']})
        counts={t:1000 for t in tables}
        counts.update(pa_next_evd_day=a.fact_rows,pa_next_pair=500_000,pa_next_pair_acc=400_000,
                      pa_next_viewer=50_000,pa_next_staff=75_000,pa_next_staffx=75_000,
                      pa_next_emp_attrs=50_000,pa_next_adg_member=500_000,pa_next_dash_day=100_000)
        for table,rows in counts.items():
            s.query(f'CREATE TABLE prod_proteus.{table} (_pa_next_run Nullable(String)) ENGINE=MergeTree ORDER BY tuple()')
            s.query(f"INSERT INTO prod_proteus.{table} SELECT '{run}' FROM numbers({rows})")
        s.query('CREATE TABLE prod_proteus.pa_next_manifest (run_id Nullable(String), state Nullable(String)) ENGINE=MergeTree ORDER BY tuple()')
        s.query(f"INSERT INTO prod_proteus.pa_next_manifest VALUES ('{run}','ready')")
        results={}
        for part,item in manifest['datasets'].items():
            sql="SELECT 'pa_next_version'"+(OUT/item['path']).read_text().split("\nUNION ALL\nSELECT 'pa_next_version'",1)[1].split('\n{% set PA_REQ',1)[0]
            runs=[]
            for repeat in range(4):
                started=time.perf_counter()
                result=json.loads(s.query(sql,'JSON').bytes())
                elapsed=time.perf_counter()-started
                assert result['data'][0]['n']==1
                runs.append(dict(wall_seconds=elapsed,statistics=result.get('statistics',{})))
            results[part]=runs
            print(part,'first',round(runs[0]['wall_seconds'],4),'warm median',round(sorted(r['wall_seconds'] for r in runs[1:])[1],4),'seconds')
        report=dict(status='passed',clickhouse=version,max_threads=2,fact_rows=a.fact_rows,table_rows=counts,results=results,
                    statistics_note='Top-level JSON statistics can show zero rows_read/bytes_read for work done inside scalar subqueries; these are not total I/O counters for this guard.',
                    limitation='Synthetic run column scans only, same process first/warm runs; no OS-cache eviction and no claim about whole-report or production speed')
        a.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')

if __name__=='__main__':main()
