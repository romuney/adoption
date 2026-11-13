#!/usr/bin/env python3
"""Build isolated pa_next UI: retain metric renderers; adapt only hosts and transport."""
import argparse, hashlib, json, re, subprocess, os
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'Параллельный отчёт — pa_next'
CAT = ['mode_param','sel_f','aud_org_f','aud_spec_f','aud_stream_f','aud_hq_f','aud_it_f','aud_head_f']
ONE = ['org_f','spec_f','stream_f','adg_f','heads_f','login_f','exl_f','freq_f']
HEAD = ['period_param','pub_f','act_f','exc_f','ca_org_f','ca_spec_f','ca_stream_f','ca_hq_f','ca_it_f','ca_head_f','ca_adg_f']
CSS = '''.pa-next-shell{position:absolute;inset:0;display:flex;flex-direction:column;background:#f6f6f6;color:#23272e;font:14px Arial,Helvetica,sans-serif;box-sizing:border-box;overflow:hidden}.pa-next-status{min-height:24px;padding:4px 12px;font-size:12px;background:#fff8e7;color:#785714;box-sizing:border-box}.pa-next-status.pa-next-ready{background:#edf7ed;color:#296a32}.pa-next-head{position:relative;flex:0 0 112px;min-width:0;z-index:30}.pa-next-content{display:grid;grid-template-columns:minmax(300px,38fr) minmax(450px,62fr);gap:12px;flex:1;min-height:0;padding:0 8px 8px}.pa-next-cat,.pa-next-one{position:relative;min-width:0;min-height:0;border-radius:10px;background:#fff}.pa-next-cat{container-type:inline-size;container-name:pa-next-cat}.pa-next-one{container-type:inline-size;container-name:pa-next-one}.pa-next-wait{position:absolute;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;background:rgba(246,246,246,.96);padding:24px;text-align:center;line-height:1.6;box-sizing:border-box}.pa-next-help{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:16px}.pa-next-help>div{background:white;border-radius:12px;max-width:600px;max-height:85vh;overflow:auto;padding:24px;font:14px/1.6 Arial,Helvetica,sans-serif}.pa-next-help h2{font-size:20px}.pa-next-help button{font:700 14px Arial;padding:10px 18px;border:0;border-radius:8px;background:#245fd4;color:white;cursor:pointer}.pa-next-shell button:focus-visible,.pa-next-shell [role=button]:focus-visible,.pa-next-shell input:focus-visible{outline:2px solid #245fd4;outline-offset:2px}@media(max-width:820px){.pa-next-content{grid-template-columns:minmax(280px,38fr) minmax(380px,62fr);overflow-x:auto}.pa-next-head{min-width:680px}.pa-next-shell{overflow-x:auto}}@media(prefers-reduced-motion:reduce){.pa-next-shell *{transition:none!important;animation:none!important}}'''

def renderer(part, name):
    p=ROOT/'Виджеты'/name
    s=p.read_text()
    # A scope bridge, not a rewrite of buildModel/metrics: exact source bodies retained.
    selector='[data-pa-next-host="'+part+'"]'
    s=s.replace("'[_echarts_instance_]'", "'"+selector+"'")
    start=s.index('function paBcast(msg) {')
    end=s.index('\nfunction paDiag(o) {', start)
    s=s[:start]+'function paBcast(msg) { PA_NEXT_BUS(msg); }\n'+s[end:]
    start=s.index('function paDiag(o) {')
    end=s.index('\n}',start)+2
    s=s[:start]+'function paDiag(o) {}'+s[end:]
    s=s.replace('window.parent.postMessage(', 'PA_NEXT_SIGNAL(')
    s=s.replace('function tourStart() {', 'function tourStart() { PA_NEXT_HELP(); return;')
    # Namespaced internal protocol: current report cannot affect embedded regions.
    s=s.replace('PA_', 'PA_NEXT_INTERNAL_')
    # Restore bridge identifiers after namespacing source message literals.
    for old,new in [('PA_NEXT_INTERNAL_NEXT_BUS','PA_NEXT_BUS'),('PA_NEXT_INTERNAL_NEXT_SIGNAL','PA_NEXT_SIGNAL'),('PA_NEXT_INTERNAL_NEXT_HELP','PA_NEXT_HELP')]: s=s.replace(old,new)
    s=s.replace('@media (max-width:', '@container pa-next-'+part+' (max-width:')
    # Source transforms are deliberately structural, never numeric/formula replacements.
    return 'function(data, applyCrossFilter, PA_NEXT_BUS, PA_NEXT_HELP) {\nvar option; function PA_NEXT_SIGNAL() {}\n'+s+'\n}'

def build(main,cat,one,channel,check=False):
    expected={}
    def write(name,text):
        expected[name]=text
        if not check: (OUT/name).write_text(text)
    if any(not isinstance(value,int) or not 0 < value < 2**53 for value in [main,cat,one]): raise ValueError('Chart IDs must be positive safe integers')
    if len({main,cat,one})!=3: raise ValueError('Chart IDs must be distinct')
    if not isinstance(channel,str) or not channel.strip(): raise ValueError('Channel must be nonempty')
    config=dict(main=main,cat=cat,one=one,channel=channel,echoColumns=HEAD+CAT+ONE)
    sources={'head':'pa-head.chart.js','cat':'pa-reports-body.chart.js','one':'pa-one.chart.js'}
    wrappers='{'+','.join(json.dumps(k)+':'+renderer(k,v) for k,v in sources.items())+'}'
    text=(OUT/'src/main.js').read_text().replace('__CONFIG__',json.dumps(config)).replace('__SHELL_CSS__',CSS.replace("'","\\'")).replace('__RENDERERS__',wrappers)
    text=text.replace("msg.type === 'PA_TOUR_GO'", "msg.type === 'PA_NEXT_INTERNAL_TOUR_GO'")
    outputs={'4. JS — весь отчёт.js':text}
    for part,name in [('cat','6. JS — загрузчик каталога.js'),('one','8. JS — загрузчик панели.js')]:
        c=dict(part=part,id=config[part],main=main,channel=channel,columns=(CAT if part=='cat' else ONE)+['pa_nonce','pa_next_'+part+'_req'])
        outputs[name]=(OUT/'src/loader.js').read_text().replace('__CONFIG__',json.dumps(c))
    env=dict(os.environ)
    env['NODE_PATH']=os.environ.get('PA_NEXT_NODE_PATH','/workspace/.deps/node/node_modules')+os.pathsep+env.get('NODE_PATH','')
    lint_summary={}
    lint=Path(env['NODE_PATH'].split(os.pathsep)[0])/'eslint/bin/eslint.js'
    if json.loads((lint.parent.parent/'package.json').read_text())['version'] != '10.1.0': raise SystemExit('ESLint 10.1.0 required')
    for name,txt in outputs.items():
        proc=subprocess.run(['node',str(ROOT/'docs/vendor/proteus-playbook/kit/min.cjs'), 'pa_next '+name,'--check','--budget','512'], input=txt,text=True,env=env,capture_output=True)
        if proc.returncode: raise SystemExit(proc.stderr+proc.stdout)
        print(proc.stderr.strip())
        for stage,content in [('source',txt),('delivery',proc.stdout)]:
            checked=subprocess.run(['node',str(lint),'-c',str(ROOT/'docs/vendor/proteus-playbook/kit/eslint.chart.cjs'),'--no-config-lookup','--stdin','--stdin-filename','pa-next-generated.chart.js','--format','json'],input=content,text=True,capture_output=True,cwd=ROOT,env=env)
            if checked.returncode: raise SystemExit(checked.stderr+checked.stdout)
            reports=json.loads(checked.stdout)
            rules={}
            for entry in reports:
                for message in entry['messages']:
                    rule=message['ruleId'] or 'parser';rules[rule]=rules.get(rule,0)+1
            lint_summary[name+' '+stage]=rules
            print('ESLint '+stage+': '+str(sum(x['errorCount'] for x in reports))+' errors, '+str(sum(x['warningCount'] for x in reports))+' warnings')
        write(name,proc.stdout)
        # Also syntax-check the unminified source without writing temporary tracked files.
        subprocess.run(['node','--check'],input=txt,text=True,check=True)
    helper=f'.dashboard-chart-id-{cat},.dashboard-chart-id-{one}'
    helperrow=f'.dragdroppable-row:not(.dashboard--editing *):has(.dashboard-component-chart-holder:is({helper})):not(:has(.dashboard-component-chart-holder:not(:is({helper}))))'
    css=f'''/* Generated IDs; helper charts stay mounted, including during initial loading. */
.dashboard-component-chart-holder.dashboard-chart-id-{main}{{padding:0!important;border:0!important;overflow:hidden!important}}
.dashboard-chart-id-{main} .chart-header{{display:none!important}}
.dashboard-chart-id-{main} iframe{{display:block!important;width:100%!important;height:100%!important;border:0!important}}
.dashboard-chart-id-{main} .chart-slice,.dashboard-chart-id-{main} .dashboard-chart,.dashboard-chart-id-{main} .chart-container,.dashboard-chart-id-{main} .slice_container,.dashboard-chart-id-{main} .slice_container>div,.dashboard-chart-id-{main} .react_sanbbox{{height:100%!important}}
.resizable-container:not(.dashboard--editing *):has(> .dashboard-component-chart-holder:is({helper})),
.dashboard-component-chart-holder:not(.dashboard--editing *):is({helper}){{height:2px!important;min-height:2px!important;max-height:2px!important;overflow:hidden!important;opacity:0!important;pointer-events:none!important;padding:0!important;border:0!important;margin:0!important}}
{helperrow},{helperrow}>.with-popover-menu>.grid-row{{height:2px!important;min-height:0!important;max-height:2px!important;margin:0!important;padding:0!important;gap:0!important;overflow:hidden!important}}
.dashboard-chart-id-{cat} iframe,.dashboard-chart-id-{one} iframe{{display:block!important;visibility:visible!important;min-width:2px!important;min-height:2px!important;width:2px!important;height:2px!important}}
'''
    write('9. CSS — дашборд.css',css)
    metadata={'cross_filters_enabled':True,'chart_configuration':{str(main):{'id':main,'crossFilters':{'scope':{'rootPath':['ROOT_ID'],'excluded':[main]},'chartsInScope':[cat,one]}},str(cat):{'id':cat,'crossFilters':{'scope':{'rootPath':['ROOT_ID'],'excluded':[main,cat]},'chartsInScope':[one]}},str(one):{'id':one,'crossFilters':{'scope':{'rootPath':['ROOT_ID'],'excluded':[main,one]},'chartsInScope':[cat]}}},'global_chart_configuration':{'scope':{'rootPath':['ROOT_ID'],'excluded':[]},'chartsInScope':[main,cat,one]}}
    write('10. JSON — области фильтров.json',json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
    report={'configuration':config,'source_sha256':{name:hashlib.sha256((ROOT/'Виджеты'/name).read_bytes()).hexdigest() for name in sources.values()},'transforms':['scope host selectors','replace global broadcast with local bus','namespace internal PA messages','suppress screenshot expansion (single iframe)','replace distributed tour with local accessible help','use container queries for embedded region width'], 'calculations':'Original buildModel and metric functions are preserved verbatim.'}
    report['minifier']='terser 5.51.2 via pinned playbook kit/min.cjs'
    report['linter']='eslint 10.1.0 via pinned playbook kit/eslint.chart.cjs (source and delivery)'
    report['lint_messages_by_rule']=lint_summary
    write('src/ui-build.json',json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    if check:
        for name,text in expected.items():
            if not (OUT/name).exists() or (OUT/name).read_text()!=text:
                raise SystemExit('STALE: '+name)
        print('PASS: UI delivery exactly matches source/configuration')

if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    cfg=json.loads((OUT/'src/ui-build.json').read_text())['configuration'] if (OUT/'src/ui-build.json').exists() else dict(main=910001,cat=910002,one=910003,channel='proteus-adoption-next-v1')
    ap.add_argument('--main',type=int,default=cfg['main']);ap.add_argument('--cat',type=int,default=cfg['cat']);ap.add_argument('--one',type=int,default=cfg['one'])
    ap.add_argument('--channel',default=cfg['channel']);ap.add_argument('--check',action='store_true')
    a=ap.parse_args();build(a.main,a.cat,a.one,a.channel,a.check)
