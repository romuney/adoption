#!/usr/bin/env python3
"""Generate one read-only SQL Lab probe from the shipped table manifest."""
import argparse
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'Параллельный отчёт — pa_next'
manifest=json.loads((OUT/'src/data-manifest.json').read_text())
parts=[]
for item in manifest['exports']:
    table=item['ch']
    if not table.startswith('prod_proteus.pa_next_') or not table.replace('.','').replace('_','').isalnum():
        raise ValueError(table)
    parts.append("SELECT '"+table+"' AS table_name, count() AS rows, min(_pa_next_run) AS min_run, max(_pa_next_run) AS max_run FROM "+table)
sql="""-- PA NEXT: read-only check after the entire notebook completes.
-- Expected: 21 rows; each ready=1, publication_state=ready, same published_run.
-- Empty business tables are allowed. Any query error or ready=0: stop installation.
SELECT t.*, m.run_id AS published_run, m.state AS publication_state,
       toUInt8(m.records = 1 AND m.state = 'ready' AND
         (t.rows = 0 OR (t.min_run = m.run_id AND t.max_run = m.run_id))) AS ready
FROM (
"""+'\nUNION ALL\n'.join(parts)+"""
) AS t
CROSS JOIN (
  SELECT count() AS records, any(run_id) AS run_id, any(state) AS state
  FROM prod_proteus.pa_next_manifest
) AS m
ORDER BY table_name
"""
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--check',action='store_true');a=p.parse_args()
target=OUT/'11. SQL Lab — готовность витрин.sql'
if a.check:
    assert target.read_text()==sql,'SQL Lab probe needs rebuild'
else:target.write_text(sql)
print('PASS SQL Lab probe: 21 data tables, one read-only statement')
