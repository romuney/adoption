#!/usr/bin/env python3
"""Static isolation/dependency checks and failure injection for notebook export."""
import ast
import importlib.util
import json
from pathlib import Path
import re
import sys
import types
import yaml

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'Параллельный отчёт — pa_next'

def main():
    spec = importlib.util.spec_from_file_location('build_data', ROOT / 'tools/parallel/build_data.py')
    build = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(build)
    manifest = json.loads((OUT / 'src/data-manifest.json').read_text())
    build.build(ROOT / manifest['source_notebook'], manifest['source_paragraph'], manifest['source_table'], write=False)
    nb = yaml.safe_load((OUT / '1. Helicopter — pa_next.yaml').read_text())
    gp = '\n'.join(p['code'] for p in nb['paragraphs'] if p['shebang'] == 'gp')
    gp = re.sub(r'--[^\n]*', '', gp)
    writes = re.findall(r'(?i)\b(?:create\s+(?:temp\s+)?table|drop\s+table\s+(?:if\s+exists\s+)?|analyze|update|insert\s+into|alter\s+table)\s+([\w.]+)', gp)
    assert writes and all(n.split('.')[-1].startswith('pa_next_') for n in writes), writes
    assert 'click_execute' not in (OUT / 'src/export.py').read_text().replace('# No click_execute / views / unverified atomic RENAME API.', '')
    creates = set(re.findall(r'(?i)\bcreate\s+(?:temp\s+)?table\s+([\w.]+)', gp))
    exports = manifest['exports']
    assert len(exports) == len({x['gp'] for x in exports}) == len({x['ch'] for x in exports})
    assert all(x['gp'] in creates for x in exports)
    used = set()
    for entry in manifest['datasets'].values():
        sql = (OUT / entry['path']).read_text()
        refs = set(re.findall(r'\bprod_proteus\.([a-z_0-9]+)', sql))
        assert all(n.startswith('pa_next_') for n in refs)
        assert refs - {'pa_next_manifest'} == set(entry['tables'])
        used.update(refs - {'pa_next_manifest'})
        assert "SELECT 'pa_next_version'" in sql
    assert used == {x['ch'].split('.')[-1] for x in exports}, 'Unneeded/missing exported table'
    # Source query may differ ONLY in target and the explicitly unused max_date
    # projection. Actual event predicates, grouping and join multiplicity stay exact.
    actual = yaml.safe_load((ROOT / manifest['source_notebook']).read_text())
    source = next(p['code'] for p in actual['paragraphs'] if p['title'] == manifest['source_paragraph'] and p['shebang'] == 'gp')
    generated = next(p['code'] for p in nb['paragraphs'] if p['title'] == 'PA NEXT · исходные события')
    consumers = next(p['code'] for p in actual['paragraphs'] if p['title']=='Для единой вкладки' and p['shebang']=='gp')
    consumers += '\n'.join(build.first(prefix).read_text() for prefix in ['1a. GP', '1b. GP', '1c. GP'])
    assert not re.search(r'\bmax_date\b', consumers, re.I), 'Pruned field acquired a downstream consumer'
    expected = re.sub(r'\(select\s+max\(event_dttm\)\s+from\s+prod_v_sse_crossdata\.event_physical_report\)\s+as\s+max_date',
                      'cast(null as timestamp) as max_date', source, flags=re.I)
    assert generated.strip().rstrip(';') == expected.strip().rstrip(';').replace(manifest['source_table'], 'usr_cross_data.pa_next_source')
    assert generated.lower().count('cast(null as timestamp) as max_date')==2
    assert not any('Обновить кеш' in p['title'] or p['shebang'] == 'python_magic' for p in nb['paragraphs'])
    export = (OUT / 'src/export.py').read_text()
    compile(export, 'export.py', 'exec')
    modules = {n: types.ModuleType(n) for n in ['proteus_py', 'proteus_py.database', 'proteus_py.database.clickhouse']}
    old = {n: sys.modules.get(n) for n in modules}
    calls = []
    failure = None
    def upload(source, target, **options):
        assert source.split('.')[-1].startswith('pa_next_')
        assert target.startswith('prod_proteus.pa_next_')
        calls.append((source, target, options))
        if failure is not None and len(calls) - 1 == failure:
            raise RuntimeError('injected export failure')
    modules['proteus_py.database.clickhouse'].gp_to_click = upload
    sys.modules.update(modules)
    total = len(exports) + 2
    try:
        for failure in range(total):
            calls.clear()
            try:
                exec(export, {})
            except RuntimeError as exc:
                assert str(exc) == 'injected export failure'
            else:
                raise AssertionError('Export swallowed a failure')
            assert len(calls) == failure + 1
            assert calls[0][0] == 'usr_cross_data.pa_next_loading'
            if failure < total - 1:
                assert not any(x[0] == 'usr_cross_data.pa_next_ready' for x in calls)
        failure = None
        calls.clear()
        exec(export, {})
        assert len(calls) == total
        assert calls[-1][0] == 'usr_cross_data.pa_next_ready'
    finally:
        for name, value in old.items():
            if value is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = value
    print(f'PASS: {len(creates)} GP creates isolated; {len(exports)} necessary CH exports; {total} failure points stop publication')
    print('PASS: actual event predicates/grouping/join unchanged; only unused max_date subqueries removed; outputs reproducible')

if __name__ == '__main__':
    main()
