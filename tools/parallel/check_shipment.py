#!/usr/bin/env python3
"""Independent static delivery gate. Does not execute SQL or connect to production."""
import ast
import hashlib
import json
from pathlib import Path
import re
import subprocess
import yaml

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'Параллельный отчёт — pa_next'

def clean_sql(text):
    return re.sub(r'/\*.*?\*/|--[^\n]*', '', text, flags=re.S)

def basename(name):
    return name.lower().split('.')[-1]

def main():
    notebook = yaml.safe_load((OUT/'1. Helicopter — pa_next.yaml').read_text())
    manifest = json.loads((OUT/'src/data-manifest.json').read_text())
    original = ROOT / manifest['source_notebook']
    assert hashlib.sha256(original.read_bytes()).hexdigest() == manifest['source_sha256'], 'Production source changed: review methodology before rebuilding'
    created, exported, referenced, dependencies = set(), set(), set(), {}
    export_calls = []
    for p in notebook['paragraphs']:
        assert p.get('isEnabled') is True, ('Disabled paragraph in standalone delivery', p['title'])
        code, lang = p.get('code', ''), p['shebang']
        assert lang in {'gp', 'md', 'python_condition', 'python'}, lang
        if lang == 'gp':
            sql = clean_sql(code)
            writes = re.findall(r'\b(?:create\s+(?:temp\s+)?table|drop\s+table\s+(?:if\s+exists\s+)?|truncate\s+(?:table\s+)?|insert\s+into|update|delete\s+from|analyze)\s*([\w.]+)', sql, re.I)
            assert writes, ('No GP writes found', p['title'])
            for name in writes:
                assert basename(name).startswith('pa_next_'), ('Non-isolated write', name)
            names = {basename(n) for n in re.findall(r'\bcreate\s+(?:temp\s+)?table\s+([\w.]+)',sql,re.I)}
            uses = {basename(n) for n in re.findall(r'\b(?:\w+\.)?(pa_next_\w+)\b',sql)}
            created.update(names)
            for name in names:
                dependencies[name] = uses - {name}
        elif lang.startswith('python'):
            tree = ast.parse(code)
            # No installer, dynamic exec, or old cache-warmup paragraph.
            for node in ast.walk(tree):
                if isinstance(node, ast.Call):
                    if isinstance(node.func, ast.Name):
                        assert node.func.id not in {'exec','eval','compile'}, 'Dynamic Python must be reviewed'
                    if isinstance(node.func, ast.Attribute) and node.func.attr == 'gp_to_click':
                        gp, ch = [ast.literal_eval(x) for x in node.args[:2]]
                        assert basename(gp).startswith('pa_next_') and ch.startswith('prod_proteus.pa_next_'), (gp,ch)
                        export_calls.append((basename(gp),basename(ch)))
                        exported.add(basename(ch))
            assert 'cache_warmup' not in code and 'refresh_cache' not in code
    assert export_calls and len(export_calls)==len(manifest['exports'])+2, 'Expected loading/data/ready publication'
    assert export_calls[0] == ('pa_next_loading','pa_next_manifest')
    assert export_calls[-1] == ('pa_next_ready','pa_next_manifest')
    for gp,ch in export_calls:
        assert gp in created, ('Export source not built in standalone notebook',gp)
    for item in manifest['datasets'].values():
        sql=clean_sql((OUT/item['path']).read_text())
        names={basename(n) for n in re.findall(r'\bprod_proteus\.(\w+)',sql)}
        assert names and all(n.startswith('pa_next_') for n in names), names
        referenced.update(names)
        assert "'pa_next_version'" in sql, 'Missing generation guard'
    assert referenced==exported, ('Missing or unnecessary exports', referenced-exported, exported-referenced)
    required={gp for gp,ch in export_calls}
    while True:
        expanded=required | set().union(*(dependencies.get(n,set()) for n in required))
        if expanded==required:break
        required=expanded
    assert created<=required, ('Unnecessary GP products',created-required)
    for file in OUT.glob('*.js'):
        subprocess.run(['node','--check',str(file)],check=True)
    print(f'PASS isolation: {len(created)} GP tables, {len(exported)} CH tables; complete export/dependency closure')
    print('PASS source provenance, loading/data/ready order, YAML Python parsing, SQL namespace, JS syntax')
    print('Static gate is not a guarantee of Greenplum/Helicopter compatibility or concurrent-run safety.')

if __name__=='__main__':main()
