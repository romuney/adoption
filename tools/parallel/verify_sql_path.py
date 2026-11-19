#!/usr/bin/env python3
"""Run Save/SQL gate and Superset path (including hostile inputs) on both lexer models."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'Параллельный отчёт — pa_next'
KIT=ROOT/'docs/vendor/proteus-playbook/kit'

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--sp044',type=Path,default=Path('/workspace/.cache/pa-next-sp044'))
    p.add_argument('--output',type=Path,default=Path('/tmp/pa-next-parser'))
    a=p.parse_args(); a.output.mkdir(parents=True,exist_ok=True)
    if not (a.sp044/'sqlparse').is_dir():
        p.error('Install isolated sqlparse==0.4.4 with uv pip install --target <path>; pass --sp044 <path>')
    manifest=json.loads((OUT/'src/data-manifest.json').read_text())
    files=[str(OUT/x['path']) for x in manifest['datasets'].values()]
    reports=[]
    for version in ('0.4.3','0.4.4'):
        env=os.environ.copy()
        if version=='0.4.4':env['PYTHONPATH']=str(a.sp044)+os.pathsep+env.get('PYTHONPATH','')
        found=subprocess.check_output([sys.executable,'-c','import sqlparse;print(sqlparse.__version__)'],env=env,text=True).strip()
        if found!=version:raise RuntimeError(f'Expected sqlparse {version}, got {found}')
        for tool in ('sqlgate.py','superset201.py'):
            path=a.output/(tool.removesuffix('.py')+'-'+version+'.json')
            args=[sys.executable,str(KIT/tool),*files,'--cols','section,g,k,parent,n','--json']
            if tool=='superset201.py':args+=['--hostile']
            with path.open('w') as stream:
                result=subprocess.run(args,env=env,stdout=stream,cwd=ROOT)
            data=json.loads(path.read_text())
            assert data['versions']['sqlparse']==version
            errors=[];warnings=[];variants=0
            for file in data['reports']:
                errors+=file.get('errors',[])
                warnings += [{'file': Path(file['file']).name, 'message': w} for w in file.get('warnings', [])]
                for item in file.get('variants',[]):
                    variants+=1
                    errors+=item.get('errors',[]);errors+=item.get('problems',[])
                    # superset201 already promotes variant warnings to the file
                    # report with variant names; do not count each one twice.
                    if 'warnings' not in file:
                        warnings += [{'file': Path(file['file']).name, 'message': w} for w in item.get('warnings', [])]
            if result.returncode or errors:raise AssertionError((tool,version,result.returncode,errors))
            reports.append(dict(tool=tool,sqlparse=version,variants=variants,errors=errors,warnings=warnings,warnings_count=len(warnings)))
            print('PASS:',tool,version,variants,'variants;',len(warnings),'warnings',flush=True)
    lab_file=OUT/'11. SQL Lab — готовность витрин.sql'
    with (a.output/'sql-lab.json').open('w') as stream:
        subprocess.run([sys.executable,str(KIT/'sqlgate.py'),'--sqllab',str(lab_file),'--json'],stdout=stream,cwd=ROOT,check=True)
    lab=json.loads((a.output/'sql-lab.json').read_text())
    lab_report={'files':len(lab['reports']),'errors':[e for f in lab['reports'] for e in f['errors']],'warnings':[w for f in lab['reports'] for w in f['warnings']]}
    assert not lab_report['errors']
    summary=dict(status='passed',files={Path(f).name:hashlib.sha256(Path(f).read_bytes()).hexdigest() for f in files},reports=reports,sql_lab=lab_report,
                 limitation='Model of documented Superset fork and Save parser; no request made to actual Proteus')
    (a.output/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')

if __name__=='__main__':main()
