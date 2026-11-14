#!/usr/bin/env python3
"""Build isolated pa_next UI: retain metric renderers; adapt only hosts and transport."""
import argparse, hashlib, json, re, subprocess, os, base64
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'Параллельный отчёт — pa_next'
CAT = ['mode_param','sel_f','aud_org_f','aud_spec_f','aud_stream_f','aud_hq_f','aud_it_f','aud_head_f']
ONE = ['org_f','spec_f','stream_f','adg_f','heads_f','login_f','exl_f','freq_f']
HEAD = ['period_param','pub_f','act_f','exc_f','ca_org_f','ca_spec_f','ca_stream_f','ca_hq_f','ca_it_f','ca_head_f','ca_adg_f']
CSS = '''.pa-next-shell{position:absolute;inset:0;display:flex;flex-direction:column;background:#f6f6f6;color:#23272e;font:14px Arial,Helvetica,sans-serif;box-sizing:border-box;overflow-x:hidden;overflow-y:auto;scrollbar-gutter:stable;overscroll-behavior-y:auto}.pa-next-status{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}.pa-next-head{position:relative;flex:0 0 112px;min-width:0;z-index:30;margin-bottom:12px}.pa-next-content{display:grid;grid-template-columns:minmax(300px,38fr) minmax(450px,62fr);gap:12px;flex:0 0 auto;min-height:0;box-sizing:border-box;padding:0 8px}.pa-next-cat,.pa-next-one{position:relative;min-width:0;min-height:0;border-radius:10px;background:#fff}.pa-next-cat{container-type:inline-size;container-name:pa-next-cat}.pa-next-one{container-type:inline-size;container-name:pa-next-one}.pa-next-wait{position:absolute;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;background:rgba(246,246,246,.96);padding:24px;text-align:center;line-height:1.6;box-sizing:border-box}.pa-next-help{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:16px}.pa-next-help>div{background:white;border-radius:12px;max-width:600px;max-height:85vh;overflow:auto;padding:24px;font:14px/1.6 Arial,Helvetica,sans-serif}.pa-next-help h2{font-size:20px}.pa-next-help button{font:700 14px Arial;padding:10px 18px;border:0;border-radius:8px;background:#245fd4;color:white;cursor:pointer}.pa-next-shell button:focus-visible,.pa-next-shell [role=button]:focus-visible,.pa-next-shell input:focus-visible{outline:2px solid #245fd4;outline-offset:2px}@media(max-width:820px){.pa-next-content{grid-template-columns:minmax(280px,38fr) minmax(380px,62fr);overflow-x:auto}.pa-next-head{min-width:680px}.pa-next-shell{overflow-x:auto}}@media(prefers-reduced-motion:reduce){.pa-next-shell *{transition:none!important;animation:none!important}}'''

CSS += '''.pa-next-head{flex:0 0 auto}.pa-next-head .phead-overlay{position:relative!important;height:auto!important}.pa-next-head .phead-root{height:auto!important;min-height:112px}.pa-next-head .phead-strip,.pa-next-head .phead-bar{flex-wrap:wrap}.pa-next-head .phead-togs{flex-shrink:0}.pa-next-pending-block{position:relative!important}.pa-next-pending-block>:not(.pa-next-wait){visibility:hidden!important}.pa-next-wait{background:#f6f6f6;border-radius:12px;flex-direction:column;overflow:hidden;pointer-events:none}.pa-next-one.pa-next-stale .pone-selg,.pa-next-one[data-pa-next-state=preview] .pone-selg{display:none!important}'''

CSS += '.pa-next-wait button{pointer-events:auto;border:1px solid #dce2eb;border-radius:8px;padding:8px 12px;background:white;color:#245fd4;font:700 12px Arial;cursor:pointer}.pa-next-quiet .pa-next-loading{visibility:hidden}.pa-next-one.pa-next-stale .pone-frow{visibility:hidden}.pa-next-one.pa-next-stale .pone-h-area{visibility:hidden}'

# Source resize may rebuild its DOM before the deferred status callback runs.
# Keep stale numbers hidden in that interval as well.
CSS += '.pa-next-one.pa-next-stale .pone-top,.pa-next-one.pa-next-stale .pone-panel{visibility:hidden!important}'
CSS += '.pa-next-analysis-pending>.pone-topbar{visibility:visible!important}.pa-next-one.pa-next-quiet .pa-next-analysis-wait .pa-next-loading{visibility:visible}'

# Selecting a report must not expand its name beyond the same three lines.
# The source row tooltip already contains the complete report name.
CSS += '.pa-next-cat .prb-ptable tbody tr.sel .prb-rname-n{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}'

# Keep native scrolling/keyboard behavior; OS overlay visibility remains native.
CSS += '''.pa-next-shell,.pa-next-shell *{scrollbar-width:thin;scrollbar-color:#b9c1ce transparent}.pa-next-shell::-webkit-scrollbar,.pa-next-shell *::-webkit-scrollbar{width:8px;height:8px}.pa-next-shell::-webkit-scrollbar-track,.pa-next-shell *::-webkit-scrollbar-track{background:transparent}.pa-next-shell::-webkit-scrollbar-thumb,.pa-next-shell *::-webkit-scrollbar-thumb{background:#b9c1ce;border-radius:8px;border:2px solid transparent;background-clip:padding-box}.pa-next-shell::-webkit-scrollbar-thumb:hover,.pa-next-shell *::-webkit-scrollbar-thumb:hover{background-color:#8a96a8}.pa-next-shell::-webkit-scrollbar-corner,.pa-next-shell *::-webkit-scrollbar-corner{background:transparent}@media(forced-colors:active){.pa-next-shell,.pa-next-shell *{scrollbar-color:auto}}'''

# Native overlay scrollbars ignore scrollbar-gutter. Leave an explicit clear
# lane at the content edge too, so macOS overlay thumbs cannot cover numbers.
CSS += '''.pa-next-shell{padding-inline-end:10px;padding-block-end:10px}.pa-next-shell .prb-overlay,.pa-next-shell .pone-overlay{padding-inline-end:10px;padding-block-end:10px;scrollbar-gutter:stable}.pa-next-shell .prb-tscroll,.pa-next-shell .pone-tbl-scroll{padding-inline-end:10px;padding-block-end:10px;scrollbar-gutter:stable;box-sizing:border-box}.pa-next-shell .pone-ct-wrap{padding-bottom:10px}.pa-next-shell .pone-panel-b,.pa-next-shell .pone-wo-ex,.pa-next-shell .pone-pickbox{scrollbar-gutter:stable}body .phead-list,body .phead-sel{scrollbar-width:thin;scrollbar-color:#b9c1ce transparent;scrollbar-gutter:stable;padding-inline-end:10px;box-sizing:border-box}'''

CSS += (OUT/'src/brand.css').read_text().replace('\n','')

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
    # Carry the full selection internally; debounced platform emission comes later.
    old='key: paKey(cols, paMaskGet(fl)) }); }'
    assert s.count(old)==1, (part, 'selection bridge changed')
    s=s.replace(old, 'key: paKey(cols, paMaskGet(fl)), nextMask: fl }); }')
    # Only the unified controller owns scheduling/retry and loading feedback.
    # Keep original intent bookkeeping used by preview and audience semantics.
    start=s.index('function paKey(cols, get) {')
    end=s.index('\n}',start)+2
    s=s[:start]+'function paKey(cols, get) { return PA_NEXT_KEY(cols, get); }'+s[end:]
    if part in ('cat','one'):
        start=s.index('function paGuardMount(host, echoFn, sheetFn, accept) {')
        end=s.index('\n}',start)+2
        s=s[:start]+'''function paGuardMount(host, echoFn, sheetFn, accept) {
  clearTimeout(state.selT);
  if (!state.wants) state.wants = {};
  if (state.onSelMsg) window.removeEventListener('message', state.onSelMsg);
  state.onSelMsg = function (e) {
    var d = e.data || {}, sh = sheetFn();
    if (d.type !== 'PA_SEL' || accept.indexOf(d.src) < 0 || !(d.sheet === '*' || d.sheet === sh)) return;
    state.wants[d.src] = { src: d.src, cols: d.cols || [], key: String(d.key || '') };
  };
  window.addEventListener('message', state.onSelMsg);
  return function () {};
}'''+s[end:]
    if part == 'head':
        hook="'><i aria-hidden=\"true\">?</i>Как работать</button></div>');"
        assert s.count(hook)==1, 'header branding hook changed'
        s=s.replace(hook, "'><i aria-hidden=\"true\">?</i>Как работать</button>' + PA_NEXT_BRAND(true) + '</div>');")
    if part == 'one':
        start=s.index('function pvPendHtml(what) {')
        end=s.index('\n}',start)+2
        s=s[:start]+'''function pvPendHtml(what) {
  return '<div class="' + CFG.ns + '-pend" role="status" aria-live="polite">' + PA_NEXT_LOADING('Загружаем детали', what + ' — догружается') + '</div>';
}'''+s[end:]
        hook="state.pendT = setInterval(function () { if (MODEL.preview && overlay.querySelector('.' + CFG.ns + '-pend')) render(); }, 5000);"
        assert s.count(hook)==1, 'preview timer hook changed'
        s=s.replace(hook, 'state.pendT = null;')
        hook='return window.innerWidth <= 760 ? w :'
        assert s.count(hook)==1, 'calendar width bridge changed'
        s=s.replace(hook, 'var panel = document.querySelector(\'[data-pa-next-host="one"]\'); return (panel ? panel.clientWidth : window.innerWidth) <= 760 ? w :')
        # The unified splitter changes a container, not the iframe window. Fit
        # synchronously through a scoped hook so no painted frame scales SVG
        # text while the original 150ms ResizeObserver timer is pending.
        hook='var w = svgs[0].clientWidth || 0;\n      if (!w || Math.abs(w - SVG_W) <= 2) return false;'
        assert s.count(hook)==1, 'SVG resize measurement hook changed'
        s=s.replace(hook, 'var w = svgs[0].getBoundingClientRect().width || 0;\n      if (!w || Math.abs(w - SVG_W) < 0.01) return false;')
        hook='Math.max(0, body.children.length - 1) * (parseFloat(cs.rowGap) || CFG.spacing.stackGap)'
        assert s.count(hook)==1, 'Dynamics flow-gap measurement hook changed'
        # The controller's absolute loading cover is not a flex item and must
        # not subtract another gap from the available plot height.
        s=s.replace(hook, "Math.max(0, Array.prototype.filter.call(body.children, function (child) { return !child.classList.contains('pa-next-wait'); }).length - 1) * (parseFloat(cs.rowGap) || CFG.spacing.stackGap)")
        hook='state.onWinResize = function () { syncOvr(); var w = syncSvgWidth(), hh = syncDynH(), fh = syncFnH(); if (w || hh || fh) render(); if (state.tip) renderTip(); };'
        assert s.count(hook)==1, 'scoped resize hook changed'
        s=s.replace(hook, '''state.onWinResize = function () {
      // A scrollbar/container breakpoint can change the width once more after
      // rendering. Bound settling to three passes in this same paint task.
      for (var pass = 0; pass < 3; pass++) {
        syncOvr();
        var w = syncSvgWidth(), hh = syncDynH(), fh = syncFnH(), ch = syncCalH();
        if (!(w || hh || fh || ch)) break;
        render();
      }
      if (state.tip) renderTip();
    };
    host.__paNextResize = state.onWinResize;''')
        # The wide Path layout follows its embedded panel, just like the narrow
        # layouts below; the enclosing unified iframe can remain much wider.
        s=s.replace('@media (min-width:', '@container pa-next-one (min-width:')
        for hook in ['function pvFits(p) {', "m.sig = 'pv|' + p.key + '|' + p.grain;", 'state.scr = scrSnap();\n      renderTip();']:
            assert s.count(hook)==1, ('preview bridge changed', hook)
        s=s.replace('function pvFits(p) {', 'function pvFits(p) { if (!PA_NEXT_PREVIEW(p, false)) return false;')
        s=s.replace("m.sig = 'pv|' + p.key + '|' + p.grain;", "m.sig = 'pv|' + p.key + '|' + p.grain; PA_NEXT_PREVIEW(p, true);")
        s=s.replace('state.scr = scrSnap();\n      renderTip();', 'state.scr = scrSnap();\n      renderTip(); PA_NEXT_RENDERED();')
    if part == 'cat':
        hook="window.addEventListener('resize', state.onCatRs);"
        assert s.count(hook)==1, 'catalogue resize hook changed'
        s=s.replace(hook, hook+'\n    host.__paNextResize = state.onCatRs;')
        start=s.index('    function catSend(fl) {')
        end=s.index('\n    }',start)+6
        s=s[:start]+'    function catSend(fl) { catSendNow(fl); }'+s[end:]
        # Place the collapse caret in the catalogue's own header on every render.
        # Delegation belongs to the shell, so rebuilding rows never adds handlers.
        hook="      (o.right || '') +"
        assert s.count(hook)==1, 'catalogue header changed'
        caret='<button type="button" class="pa-next-cat-toggle" data-layout="collapse" aria-label="Свернуть каталог" title="Свернуть каталог" aria-expanded="true" aria-controls="pa-next-catalog"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg></button>'
        s=s.replace(hook, hook+"\n      (o.cls === 'cat' ? "+json.dumps(caret,ensure_ascii=False)+" : '') +")
    s=s.replace('function tourStart() {', 'function tourStart() { PA_NEXT_HELP(); return;')
    # Namespaced internal protocol: current report cannot affect embedded regions.
    s=s.replace('PA_', 'PA_NEXT_INTERNAL_')
    # Restore bridge identifiers after namespacing source message literals.
    for old,new in [('PA_NEXT_INTERNAL_NEXT_BUS','PA_NEXT_BUS'),('PA_NEXT_INTERNAL_NEXT_SIGNAL','PA_NEXT_SIGNAL'),('PA_NEXT_INTERNAL_NEXT_HELP','PA_NEXT_HELP'),('PA_NEXT_INTERNAL_NEXT_PREVIEW','PA_NEXT_PREVIEW'),('PA_NEXT_INTERNAL_NEXT_RENDERED','PA_NEXT_RENDERED'),('PA_NEXT_INTERNAL_NEXT_KEY','PA_NEXT_KEY'),('PA_NEXT_INTERNAL_NEXT_BRAND','PA_NEXT_BRAND'),('PA_NEXT_INTERNAL_NEXT_LOADING','PA_NEXT_LOADING')]: s=s.replace(old,new)
    s=s.replace('@media (max-width:', '@container pa-next-'+part+' (max-width:')
    # Source transforms are deliberately structural, never numeric/formula replacements.
    return 'function(data, applyCrossFilter, PA_NEXT_BUS, PA_NEXT_HELP, PA_NEXT_PREVIEW, PA_NEXT_RENDERED, PA_NEXT_KEY, PA_NEXT_BRAND, PA_NEXT_LOADING) {\nvar option; function PA_NEXT_SIGNAL() {}\n'+s+'\n}'

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
    brand=(OUT/'src/brand.js').read_text().replace('__BRAND_DATA__',json.dumps('data:image/webp;base64,'+base64.b64encode((OUT/'src/assets/cross-data-accent.webp').read_bytes()).decode('ascii')))
    wrappers='{'+','.join(json.dumps(k)+':'+renderer(k,v) for k,v in sources.items())+'}'
    text=(OUT/'src/main.js').read_text().replace('__CONFIG__',json.dumps(config)).replace('__SHELL_CSS__',CSS.replace("'","\\'")).replace('__RENDERERS__',wrappers).replace('__INTERACTION__',(OUT/'src/interaction.js').read_text()).replace('__VIEWPORT__',(OUT/'src/viewport.js').read_text()).replace('__BRAND__',brand)
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
    mainholder=f'.dashboard-component-chart-holder.dashboard-chart-id-{main}'
    board=f'body:has({mainholder}):not(:has(.dashboard--editing))'
    grid=f'.grid-container:not(.dashboard--editing *):has({mainholder})'
    mainrow=f'.dragdroppable-row:not(.dashboard--editing *):has({mainholder}):not(:has(.dragdroppable-row {mainholder}))'
    helperrow=f'.dragdroppable-row:not(.dashboard--editing *):has(.dashboard-component-chart-holder:is({helper})):not(:has(.dashboard-component-chart-holder:not(:is({helper}))))'
    css=f'''/* Самостоятельный CSS pa_next. Вставить целиком в CSS нового борда.
   Просмотр: верхняя шапка борда и кнопка редактирования остаются видимыми.
   Скрыты только шапки чартов и native filters; единый чарт следует высоте окна.
   Редактор сохраняет штатные заголовки, меню и ручные размеры ячеек.
   Меню Proteus: 48px, шапка борда: 65px (из боевого профиля),
   поля сверху/снизу: 16/24px, один ряд загрузчиков: 2px.
   Высота = окно - 155px. Отсутствие #main-menu не означает отсутствие меню:
   диагностика Proteus 14.11.2026 подтвердила 48px над шапкой без этого ID.
   Для встраивания без меню задайте --pa-next-nav-height:0px явно на grid-container.
   Резерв отсутствующей шапки борда снимается автоматически.
   Селекторы dashboard-header-container, dashboard-filters-panel и filter-bar
   сверены с исходником Superset 2.1.0; форк Proteus локально не подключён. */
{board} [data-test="dashboard-filters-panel"],
{board} [data-test="filter-bar"],
{board} .sidebar-resizer{{display:none!important}}
{board} .dashboard-content:has({mainholder}){{margin-left:0!important}}
{grid}{{--pa-next-nav-height:48px;--pa-next-board-header-height:65px;margin:16px 24px 24px!important;padding:0!important}}
body:not(:has(.dashboard-header-container)) {grid}{{--pa-next-board-header-height:0px}}
{mainrow}{{margin:0!important;padding:0!important}}
.resizable-container:not(.dashboard--editing *):has({mainholder}):not(:has(.resizable-container {mainholder})){{height:max(320px,calc(100vh - var(--pa-next-nav-height,48px) - var(--pa-next-board-header-height,65px) - 42px))!important;height:max(320px,calc(100dvh - var(--pa-next-nav-height,48px) - var(--pa-next-board-header-height,65px) - 42px))!important;min-height:0!important}}
{mainholder}{{padding:0!important;border:0!important;box-shadow:none!important;background:transparent!important;overflow:hidden!important;display:flex!important;flex-direction:column!important;height:100%!important;min-height:0!important}}
.dashboard-component-chart-holder:not(.dashboard--editing *):is(.dashboard-chart-id-{main},{helper}) :is(.chart-header,[data-test="slice-header"],.header-title,.header-controls){{display:none!important}}
.dashboard-chart-id-{main} :is(.chart-slice,.dashboard-chart,.chart-container,.slice_container,.slice_container>div,.react_sanbbox){{display:flex!important;flex-direction:column!important;flex:1 1 auto!important;height:100%!important;min-height:0!important;padding:0!important}}
.dashboard-chart-id-{main} iframe{{display:block!important;flex:1 1 auto!important;width:100%!important;height:100%!important;min-height:0!important;border:0!important}}
.dashboard-chart-id-{main} .dashboard-chart>div:not(.chart-container){{height:100%!important;width:100%!important}}
/* При обновлении сохраняем интерактивный iframe. Начальную загрузку показывает Proteus. */
{mainholder}:not(.dashboard--editing *):has(.react_sanbbox iframe) :is(img.loading,[data-test="loading-indicator"],[aria-label="Loading"]){{display:none!important}}
{mainholder}:not(.dashboard--editing *):has(.react_sanbbox iframe):has(img.loading,[data-test="loading-indicator"],[aria-label="Loading"]) *:not(iframe):not(:has(iframe)){{pointer-events:none!important}}
{mainholder}:not(.dashboard--editing *):has(.react_sanbbox iframe) iframe{{pointer-events:auto!important}}
/* Загрузчики не display:none: скрипты и обмен сообщениями должны продолжать работать. */
.resizable-container:not(.dashboard--editing *):has(> .dashboard-component-chart-holder:is({helper})),
.dashboard-component-chart-holder:not(.dashboard--editing *):is({helper}){{height:2px!important;min-height:2px!important;max-height:2px!important;overflow:hidden!important;opacity:0!important;pointer-events:none!important;padding:0!important;border:0!important;margin:0!important}}
{helperrow},{helperrow}>.with-popover-menu>.grid-row{{height:2px!important;min-height:0!important;max-height:2px!important;margin:0!important;padding:0!important;gap:0!important;overflow:hidden!important}}
.dashboard-component-chart-holder:not(.dashboard--editing *):is({helper}) iframe{{display:block!important;visibility:visible!important;min-width:2px!important;min-height:2px!important;width:2px!important;height:2px!important}}
'''
    write('9. CSS — дашборд.css',css)
    metadata={'cross_filters_enabled':True,'chart_configuration':{str(main):{'id':main,'crossFilters':{'scope':{'rootPath':['ROOT_ID'],'excluded':[main]},'chartsInScope':[cat,one]}},str(cat):{'id':cat,'crossFilters':{'scope':{'rootPath':['ROOT_ID'],'excluded':[main,cat]},'chartsInScope':[one]}},str(one):{'id':one,'crossFilters':{'scope':{'rootPath':['ROOT_ID'],'excluded':[main,one]},'chartsInScope':[cat]}}},'global_chart_configuration':{'scope':{'rootPath':['ROOT_ID'],'excluded':[]},'chartsInScope':[main,cat,one]}}
    metadata.update(show_native_filters=False,native_filter_configuration=[])
    write('10. JSON — области фильтров.json',json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
    report={'configuration':config,'source_sha256':{name:hashlib.sha256((ROOT/'Виджеты'/name).read_bytes()).hexdigest() for name in sources.values()},'transforms':['scope host selectors','replace global broadcast with local bus','namespace internal PA messages','suppress screenshot expansion (single iframe)','replace distributed tour with local interactive guide','use container queries for embedded region width','validate catalogue preview before render','keep tabs active while metric blocks load','resizable catalogue with inline collapse caret and left rail','viewport board height; visible dashboard header; hidden chart headers','scroll report filters away on laptop; preserve useful analytics height','single-flight query queue with exact request completion','bounded session cache keyed by exact business masks and generation','atomic selection and preview; one local delayed loader','preserve empty filter values; explicit retry for command errors','calendar width follows embedded panel','approved CROSS DATA soft accent and local animated loading signature','stable detail-tab layout during loading; shared scroll for short viewports','preserve geometry and scroll across same-sandbox reruns','fixed SVG type during splitter drag; 420px catalogue minimum; selected names limited to three lines','styled native scrollbars'], 'brand_sha256':{n:hashlib.sha256((OUT/'src/assets'/n).read_bytes()).hexdigest() for n in ['cross-data-accent-source.png','cross-data-accent.webp']},'calculations':'Original buildModel and metric functions are preserved verbatim.'}
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
