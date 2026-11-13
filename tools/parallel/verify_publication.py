#!/usr/bin/env python3
"""Exercise generation guard SQL on real ClickHouse 24.8 with tiny isolated tables."""
import json
from pathlib import Path
import tempfile
from chdb.session import Session
from jinja2.sandbox import SandboxedEnvironment

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'Параллельный отчёт — pa_next'
manifest = json.loads((OUT / 'src/data-manifest.json').read_text())
with tempfile.TemporaryDirectory(prefix='pa-next-publication-') as tmp:
    s = Session(tmp)
    version = str(s.query('SELECT version()', 'CSV')).strip().strip('"')
    assert version.startswith('24.8.'), version
    s.query('CREATE DATABASE prod_proteus')
    tables = sorted({t for item in manifest['datasets'].values() for t in item['tables']})
    for table in tables:
        s.query(f'CREATE TABLE prod_proteus.{table} (_pa_next_run Nullable(String)) ENGINE=MergeTree ORDER BY tuple()')
        s.query(f"INSERT INTO prod_proteus.{table} VALUES ('run-A')")
    s.query('CREATE TABLE prod_proteus.pa_next_manifest (run_id Nullable(String), state Nullable(String)) ENGINE=MergeTree ORDER BY tuple()')
    markers = {part: "SELECT 'pa_next_version'" + (OUT / item['path']).read_text().split("\nUNION ALL\nSELECT 'pa_next_version'", 1)[1].split('\n{% set PA_REQ', 1)[0] for part, item in manifest['datasets'].items()}
    for rows, expected, label in [
        ("('run-A','ready')", 1, 'complete ready generation'),
        ("('run-A','loading')", 0, 'export in progress'),
        ("('run-B','ready')", 0, 'wrong generation'),
        ("('run-A','ready'),('run-A','ready')", 0, 'duplicate manifest'),
        ('', 0, 'empty manifest'),
    ]:
        s.query('TRUNCATE TABLE prod_proteus.pa_next_manifest')
        if rows:
            s.query('INSERT INTO prod_proteus.pa_next_manifest VALUES ' + rows)
        for part, sql in markers.items():
            result = json.loads(s.query(sql, 'JSON').bytes())['data']
            assert len(result) == 1 and result[0]['section'] == 'pa_next_version'
            assert result[0]['n'] == expected, (part, label, result)
        print('PASS:', label, '(all three datasets)')
    s.query('TRUNCATE TABLE prod_proteus.pa_next_manifest')
    s.query("INSERT INTO prod_proteus.pa_next_manifest VALUES ('run-A','ready')")
    for part, item in manifest['datasets'].items():
        table = item['tables'][0]
        s.query(f"INSERT INTO prod_proteus.{table} VALUES ('run-B')")
        result = json.loads(s.query(markers[part], 'JSON').bytes())['data']
        assert result[0]['n'] == 0, (part, result)
        s.query(f'TRUNCATE TABLE prod_proteus.{table}')
        s.query(f"INSERT INTO prod_proteus.{table} VALUES ('run-A')")
    print('PASS: mixed rows within a physical table; ClickHouse', version)
    for part in ('cat', 'one'):
        sql = (OUT / manifest['datasets'][part]['path']).read_text()
        request_template = '{% set PA_REQ' + sql.split('{% set PA_REQ', 1)[1]
        for value in ['', '1731510000-3', "x' OR 1=1 --\\n\\path", 'a\nb\t]']:
            rendered = SandboxedEnvironment().from_string(request_template).render(filter_values=lambda _: [value])
            rendered = rendered.strip().removeprefix('UNION ALL').strip()
            rows = json.loads(s.query(rendered, 'JSON').bytes())['data']
            assert len(rows) == 3 and {r['g'] for r in rows} == {'head', 'cat', 'one'}
            assert all(r['section'] == 'pa_next_request' and r['k'] == value for r in rows), rows
    print('PASS: nonce echo with quotes, backslashes, SQL-shaped input and control characters')
