#!/usr/bin/env python3
"""Build isolated pa_next UI: retain metric renderers; adapt only hosts and transport."""
import argparse, hashlib, json, re, subprocess, os, base64
from pathlib import Path
from ui_audience_people import augment_head
from ui_observations import augment_observations
from ui_motion import apply_motion
from ui_report_header import augment_report_header
from header_reveal import header_reveal_css, header_control_markdown
from ui_tooltips import augment_tooltips
from ui_custom_dates import augment_custom_dates
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'Параллельный отчёт — pa_next'
CAT = ['mode_param','sel_f','aud_org_f','aud_spec_f','aud_stream_f','aud_hq_f','aud_it_f','aud_head_f']
ONE = ['org_f','spec_f','stream_f','adg_f','heads_f','login_f','exl_f','freq_f']
HEAD = ['period_param','pub_f','act_f','exc_f','ca_org_f','ca_spec_f','ca_stream_f','ca_hq_f','ca_it_f','ca_head_f','ca_adg_f','ca_login_f','ca_master_f']
CSS = '''.pa-next-shell{position:absolute;inset:0;display:flex;flex-direction:column;background:#f6f6f6;color:#23272e;font:14px Arial,Helvetica,sans-serif;box-sizing:border-box;overflow-x:hidden;overflow-y:auto;overscroll-behavior-y:auto}.pa-next-status{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}.pa-next-head{position:relative;flex:0 0 112px;min-width:0;z-index:30;margin-bottom:12px}.pa-next-content{display:grid;grid-template-columns:minmax(300px,38fr) minmax(450px,62fr);gap:12px;flex:0 0 auto;min-height:0;box-sizing:border-box;padding:0}.pa-next-cat,.pa-next-one{position:relative;min-width:0;min-height:0;border-radius:10px;background:#fff}.pa-next-cat{container-type:inline-size;container-name:pa-next-cat}.pa-next-one{container-type:inline-size;container-name:pa-next-one}.pa-next-wait{position:absolute;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;background:rgba(246,246,246,.96);padding:24px;text-align:center;line-height:1.6;box-sizing:border-box}.pa-next-help{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:16px}.pa-next-help>div{background:white;border-radius:12px;max-width:600px;max-height:85vh;overflow:auto;padding:24px;font:14px/1.6 Arial,Helvetica,sans-serif}.pa-next-help h2{font-size:20px}.pa-next-help button{font:700 14px Arial;padding:10px 18px;border:0;border-radius:8px;background:#245fd4;color:white;cursor:pointer}.pa-next-shell button:focus-visible,.pa-next-shell [role=button]:focus-visible,.pa-next-shell input:focus-visible{outline:2px solid #245fd4;outline-offset:2px}@media(max-width:820px){.pa-next-content{grid-template-columns:minmax(280px,38fr) minmax(380px,62fr);overflow-x:auto}.pa-next-head{min-width:680px}.pa-next-shell{overflow-x:auto}}@media(prefers-reduced-motion:reduce){.pa-next-shell *{transition:none!important;animation:none!important}}'''

CSS += '''.pa-next-head{flex:0 0 auto}.pa-next-head .phead-overlay{position:relative!important;height:auto!important}.pa-next-head .phead-root{height:auto!important;min-height:112px}.pa-next-head .phead-strip,.pa-next-head .phead-bar{flex-wrap:wrap}.pa-next-head .phead-togs{flex-shrink:0}.pa-next-pending-block{position:relative!important}.pa-next-pending-block>:not(.pa-next-wait){visibility:hidden!important}.pa-next-wait{background:#f6f6f6;border-radius:12px;flex-direction:column;overflow:hidden;pointer-events:none}.pa-next-one.pa-next-stale .pone-selg,.pa-next-one[data-pa-next-state=preview] .pone-selg{display:none!important}'''

CSS += '.pa-next-wait button{pointer-events:auto;border:1px solid #dce2eb;border-radius:8px;padding:8px 12px;background:white;color:#245fd4;font:700 12px Arial;cursor:pointer}.pa-next-quiet .pa-next-loading{visibility:hidden}.pa-next-one.pa-next-stale .pone-frow{visibility:hidden}.pa-next-one.pa-next-stale .pone-h-area{visibility:hidden}'

# Source resize may rebuild its DOM before the deferred status callback runs.
# Keep stale numbers hidden in that interval as well.
CSS += '.pa-next-one.pa-next-stale .pone-top,.pa-next-one.pa-next-stale .pone-panel{visibility:hidden!important}'
CSS += '.pa-next-analysis-pending>.pone-topbar{visibility:visible!important}.pa-next-one.pa-next-quiet .pa-next-analysis-wait .pa-next-loading{visibility:visible}'

# Selecting a report must not expand its name beyond the same three lines.
# The source row tooltip already contains the complete report name.
CSS += '.pa-next-cat .prb-ptable tbody tr.sel .prb-rname-n{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}'
CSS += '.pa-next-one .pone-k-sub b{white-space:nowrap}'
# The unified shell owns vertical scrolling for Dynamics. usefulHeight keeps
# both plots and controls visible, including in short windows. Retain the
# body's horizontal scroll for narrow panels; avoid a second native Y bar.
CSS += '.pa-next-one .pone-panel-b.dyn-wrap{overflow-y:hidden}'
# A shrinking control row feeds its reduced height back into SVG allocation.
CSS += '.pa-next-one .pone-panel-b.dyn-wrap>.pone-dynhead{flex-shrink:0}'

# User preference: narrow native scrollbars, no reserved gutters or extra
# content padding. Chromium/Safari use4px; standards-only engines use thin.
SCROLL = ['.pa-next-shell', '.pa-next-shell *', 'body .phead-list', 'body .phead-sel', 'body .pa-next-people-body', 'body .pa-next-people textarea']
SCROLL_ALL = ','.join(SCROLL)
CSS += SCROLL_ALL + '{scrollbar-width:thin;scrollbar-color:#b9c1ce transparent;scrollbar-gutter:auto}'
# Non-auto CSS Scrollbars values override WebKit pseudo-element sizing in
# Chromium. Reset those values only when the precise4px path is supported.
CSS += '@supports selector(::-webkit-scrollbar){' + SCROLL_ALL + '{scrollbar-width:auto;scrollbar-color:auto}}'
for pseudo, rules in [
    ('', 'width:4px;height:4px'),
    ('-track', 'background:transparent'),
    ('-thumb', 'background:#b9c1ce;border-radius:4px'),
    ('-thumb:hover', 'background-color:#8a96a8'),
    ('-corner', 'background:transparent')
]:
    CSS += ','.join(selector + '::-webkit-scrollbar' + pseudo for selector in SCROLL) + '{' + rules + '}'
# Opacity/color changes never add/remove native scrollbar space.
CSS += SCROLL_ALL + '{scrollbar-color:transparent transparent!important}'
CSS += ','.join(x+'::-webkit-scrollbar-thumb' for x in SCROLL) + '{background-color:transparent!important}'
SHOW = ['.pa-next-shell[data-pa-next-scroll-active]', '.pa-next-shell [data-pa-next-scroll-active]', 'body .phead-list[data-pa-next-scroll-active]', 'body .phead-sel[data-pa-next-scroll-active]', 'body .pa-next-people-body[data-pa-next-scroll-active]', 'body .pa-next-people textarea[data-pa-next-scroll-active]']
CSS += ','.join(SHOW) + '{scrollbar-color:rgba(185,193,206,var(--pa-next-scroll-opacity,1)) transparent!important}'
CSS += '@supports selector(::-webkit-scrollbar){' + ','.join(SCROLL + SHOW) + '{scrollbar-color:auto!important}}'
CSS += ','.join(x+'::-webkit-scrollbar-thumb' for x in SHOW) + '{background-color:rgba(185,193,206,var(--pa-next-scroll-opacity,1))!important}'
CSS += ','.join(x+'::-webkit-scrollbar-thumb:hover' for x in SHOW) + '{background-color:rgba(138,150,168,var(--pa-next-scroll-opacity,1))!important}'
CSS += '.pa-next-shell .prb-tscroll,.pa-next-shell .pone-tbl-scroll{margin-right:-6px;padding-right:6px;box-sizing:border-box}'
CSS += '@media(prefers-reduced-motion:reduce){' + ','.join(x+'::-webkit-scrollbar-thumb' for x in SCROLL) + '{transition:none}}'
CSS += '@media(forced-colors:active){' + ','.join(SCROLL + SHOW) + '{scrollbar-color:auto!important}' + ','.join(x+'::-webkit-scrollbar-thumb'+state for x in SCROLL + SHOW for state in ['', ':hover']) + '{background-color:ButtonText!important}}'

CSS += '.pa-next-one [data-obs]{cursor:pointer}.pa-next-one [data-obs]:focus-visible{outline:2px solid #245fd4;outline-offset:2px}.pa-next-one .pone-obs-tog{display:inline-flex;align-items:center}'
CSS += '.pa-next-one .pone-cov-help{flex-shrink:0;color:#737d90;font:11px/1.45 Arial;margin:0 0 4px}.pa-next-one .pone-cov-legend{display:flex;flex-wrap:wrap;gap:6px 18px;margin-bottom:3px;color:#555f70}.pone-cov-legend>span{display:inline-flex;align-items:center;gap:6px}.pone-cov-line{display:inline-block;width:25px;border-top:2px solid #245fd4}.pone-cov-line.pone-cov-dash{border-top:2px dashed #7fa3ea}'

CSS += '.pa-next-titlebar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;min-height:34px;margin-bottom:10px}.pa-next-titlebar h1{margin:0;font:700 18px/1.35 Arial,Helvetica,sans-serif;color:#23272e}.pa-next-title-actions{display:flex;align-items:center;gap:12px}.pa-next-title-actions .phead-help{margin-left:0}'

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
        s=augment_head(s, (OUT/'src/audience-people.js').read_text())
        s=augment_report_header(s)
        s=augment_custom_dates(s)
    if part == 'one':
        s=apply_motion(augment_observations(s))
        hook="'ca_it_f', 'ca_head_f', 'ca_adg_f'];"
        assert s.count(hook)==1, 'person CA preview columns hook changed'
        s=s.replace(hook, "'ca_it_f', 'ca_head_f', 'ca_adg_f', 'ca_login_f', 'ca_master_f'];")
        hook="ca_it_f: 'it', ca_adg_f: 'adg' }, on = false;"
        assert s.count(hook)==1, 'person CA preview mode hook changed'
        s=s.replace(hook, "ca_it_f: 'it', ca_adg_f: 'adg', ca_login_f: 'login', ca_master_f: 'master' }, on = false;")
        hook="heads: ca.head || '', adg: ca.adg || [] };"
        assert s.count(hook)==1, 'person CA model summary hook changed'
        s=s.replace(hook, "heads: ca.head || '', adg: ca.adg || [], login: ca.login || [], master: ca.master || [] };")
        hook="  return parts;\n}\n\n// ---------- БЛОК 4:"
        assert s.count(hook)==1, 'person CA label hook changed'
        s=s.replace(hook, "  if (c.login && c.login.length) parts.push('Список логинов: ' + c.login.length);\n  if (c.master && c.master.length) parts.push('Master ID: ' + c.master.length);\n"+hook)
        s=s.replace("пунктир — заходили в этом ' + gu0 + '.'", "пунктир — заходили за ' + ({d:'день',w:'неделю',m:'месяц',q:'квартал'}[grain] || gu0) + '.'")
        hook="  var t = tc0;\n  h += !t.ca ?"
        assert s.count(hook)==1, 'coverage legend hook changed'
        legend = """  if (tc0.ca && !wide()) h += '<div class="pone-cov-help"><div class="pone-cov-legend" aria-label="Легенда охвата ЦА"><span><i class="pone-cov-line"></i>С начала периода</span><span><i class="pone-cov-line pone-cov-dash"></i>За ' + ({d:'день',w:'неделю',m:'месяц',q:'квартал'}[grain] || 'шаг') + '</span></div><div>Обе линии — % от одной ЦА. С начала периода каждый человек учитывается один раз.</div></div>';
"""
        s=s.replace(hook, legend+hook)
        hook="body.querySelectorAll('.' + CFG.ns + '-tbl-note, .' + CFG.ns + '-dynov')"
        assert s.count(hook)==1, 'coverage legend height hook changed'
        s=s.replace(hook, "body.querySelectorAll('.' + CFG.ns + '-tbl-note, .' + CFG.ns + '-dynov, .pone-cov-help')")
        # Keep the formatted audience denominator together on narrow cards.
        # The numerator is already in a no-wrap element; this is plain text.
        hook="sub: '<b>' + nf(t.reach) + '</b> из ' + nf(t.ca)"
        assert s.count(hook)==1, 'audience KPI formatting hook changed'
        s=s.replace(hook, hook+".replace(/ /g, '\\u00a0')")
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
        # Leave one rounding pixel inside the existing chart body. Fractional
        # flex heights can otherwise produce a native scrollbar with no scroll
        # range, even when rounded scrollHeight equals clientHeight.
        hook='avail = Math.max(200, Math.floor(avail));'
        assert s.count(hook)==1, 'Dynamics height rounding hook changed'
        s=s.replace(hook, 'avail = Math.max(200, Math.floor(avail) - 1);')
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
        hook='  var tMax = Math.round(460 + sumM * kM + 40);'
        assert s.count(hook)==1, 'catalogue table width hook changed'
        s=s.replace(hook, '')
        hook=' style="max-width:\' + tMax + \'px"'
        assert s.count(hook)==1, 'catalogue table max-width hook changed'
        s=s.replace(hook, '')
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
    s=augment_tooltips(s, (OUT/'src/tooltips.js').read_text(), part)
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
    brand_url='data:image/webp;base64,'+base64.b64encode((OUT/'src/assets/cross-data-accent.webp').read_bytes()).decode('ascii')
    brand=(OUT/'src/brand.js').read_text().replace('__BRAND_DATA__',json.dumps(brand_url))
    wrappers='{'+','.join(json.dumps(k)+':'+renderer(k,v) for k,v in sources.items())+'}'
    interaction=(OUT/'src/task-guide.js').read_text()+'\n'+(OUT/'src/scrollbars.js').read_text()+'\n'+(OUT/'src/interaction.js').read_text()
    viewport=(OUT/'src/viewport.js').read_text()
    motion=(OUT/'src/motion.js').read_text()
    text=(OUT/'src/main.js').read_text().replace('__CONFIG__',json.dumps(config)).replace('__SHELL_CSS__',CSS.replace("'","\\'")).replace('__RENDERERS__',wrappers).replace('__INTERACTION__',interaction).replace('__VIEWPORT__',viewport).replace('__MOTION__',motion).replace('__BRAND__',brand)
    text=text.replace('__INTERACTION_REVISION__',hashlib.sha256(interaction.encode()).hexdigest()).replace('__VIEWPORT_REVISION__',hashlib.sha256(viewport.encode()).hexdigest())
    text=text.replace('__MOTION_REVISION__',hashlib.sha256(motion.encode()).hexdigest())
    text=text.replace('__RENDERERS_REVISION__',hashlib.sha256(wrappers.encode()).hexdigest())
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
   поля борда сверху/снизу: 16/16px, один ряд загрузчиков: 2px.
   Внутренние поля под скролл не резервируются; полосы прокрутки тонкие.
   Высота = окно - 147px. Отсутствие #main-menu не означает отсутствие меню:
   диагностика Proteus 14.11.2026 подтвердила 48px над шапкой без этого ID.
   Для встраивания без меню задайте --pa-next-nav-height:0px явно на grid-container.
   Резерв отсутствующей шапки борда снимается автоматически.
   Селекторы dashboard-header-container, dashboard-filters-panel и filter-bar
   сверены с исходником Superset 2.1.0; форк Proteus локально не подключён. */
{board} [data-test="dashboard-filters-panel"],
{board} [data-test="filter-bar"],
{board} .sidebar-resizer{{display:none!important}}
/* Superset native-filter closed state adds -32px on the draggable ancestor
   of the board header. Override only that ancestor in this report's viewer. */
{board} .dragdroppable:has(.dashboard-header-container){{margin-left:0!important}}
{board} .dashboard-content:has({mainholder}){{margin-left:0!important}}
{grid}{{--pa-next-nav-height:48px;--pa-next-board-header-height:65px;margin:16px 24px!important;padding:0!important}}
body:not(:has(.dashboard-header-container)) {grid}{{--pa-next-board-header-height:0px}}
{mainrow}{{margin:0!important;padding:0!important}}
.resizable-container:not(.dashboard--editing *):has({mainholder}):not(:has(.resizable-container {mainholder})){{height:max(320px,calc(100vh - var(--pa-next-nav-height,48px) - var(--pa-next-board-header-height,65px) - 34px))!important;height:max(320px,calc(100dvh - var(--pa-next-nav-height,48px) - var(--pa-next-board-header-height,65px) - 34px))!important;min-height:0!important}}
{mainholder}{{padding:0!important;border:0!important;box-shadow:none!important;background:transparent!important;overflow:hidden!important;display:flex!important;flex-direction:column!important;height:100%!important;min-height:0!important}}
.dashboard-component-chart-holder:not(.dashboard--editing *):is(.dashboard-chart-id-{main},{helper}) :is(.chart-header,[data-test="slice-header"],.header-title,.header-controls){{display:none!important}}
.dashboard-chart-id-{main} :is(.chart-slice,.dashboard-chart,.chart-container,.slice_container,.slice_container>div,.react_sanbbox){{display:flex!important;flex-direction:column!important;flex:1 1 auto!important;height:100%!important;min-height:0!important;padding:0!important}}
.dashboard-chart-id-{main} iframe{{display:block!important;flex:1 1 auto!important;width:100%!important;height:100%!important;min-height:0!important;border:0!important}}
.dashboard-chart-id-{main} .dashboard-chart>div:not(.chart-container){{height:100%!important;width:100%!important}}
/* One cold-start signature in viewport coordinates. The transparent sandbox
   continues showing it until the report actually paints over the background.
   Creating an iframe or replacing native loading markers is not completion. */
{mainholder}:not(.dashboard--editing *){{isolation:isolate}}
{mainholder}:not(.dashboard--editing *) .dashboard-chart:not(:has([role="alert"],.alert,.error-container)){{background-color:#fff;background-image:linear-gradient(rgba(255,255,255,.35),rgba(255,255,255,.35)),url("{brand_url}");background-attachment:fixed,fixed;background-position:0 0,calc(50vw - 110px) calc(50vh - 12.666667px);background-size:100vw 100vh,220px auto;background-repeat:no-repeat;position:relative}}
{mainholder}:not(.dashboard--editing *) .dashboard-chart>.chart-container{{position:relative;z-index:1}}
{mainholder}:not(.dashboard--editing *) :is(img.loading,[data-test="loading-indicator"],[aria-label="Loading"]){{opacity:0!important}}
{mainholder}:not(.dashboard--editing *) .dashboard-chart:not(:has([role="alert"],.alert,.error-container))::after{{content:"";position:fixed;pointer-events:none;z-index:0;left:50vw;top:calc(50vh + 68px);margin-left:-56px;width:112px;height:2px;border-radius:2px;background:linear-gradient(90deg,#e9edf4 0%,#e9edf4 30%,#245fd4 50%,#e9edf4 70%,#e9edf4 100%);animation:pa-next-boot-progress 2s ease-in-out infinite}}
@keyframes pa-next-boot-progress{{0%,100%{{opacity:.35}}50%{{opacity:1}}}}
@media(prefers-reduced-motion:reduce){{{mainholder} .dashboard-chart::after{{animation:none!important;opacity:1}}}}
/* При обновлении сохраняем интерактивный iframe и его собственную загрузку. */
{mainholder}:not(.dashboard--editing *):has(.react_sanbbox iframe) :is(img.loading,[data-test="loading-indicator"],[aria-label="Loading"]){{display:none!important}}
{mainholder}:not(.dashboard--editing *):has(.react_sanbbox iframe):has(img.loading,[data-test="loading-indicator"],[aria-label="Loading"]) *:not(iframe):not(:has(iframe)){{pointer-events:none!important}}
{mainholder}:not(.dashboard--editing *):has(.react_sanbbox iframe) iframe{{pointer-events:auto!important}}
/* Загрузчики не display:none: скрипты и обмен сообщениями должны продолжать работать. */
.resizable-container:not(.dashboard--editing *):has(> .dashboard-component-chart-holder:is({helper})),
.dashboard-component-chart-holder:not(.dashboard--editing *):is({helper}){{height:2px!important;min-height:2px!important;max-height:2px!important;overflow:hidden!important;opacity:0!important;pointer-events:none!important;padding:0!important;border:0!important;margin:0!important}}
{helperrow},{helperrow}>.with-popover-menu>.grid-row{{height:2px!important;min-height:0!important;max-height:2px!important;margin:0!important;padding:0!important;gap:0!important;overflow:hidden!important}}
.dashboard-component-chart-holder:not(.dashboard--editing *):is({helper}) iframe{{display:block!important;visibility:visible!important;min-width:2px!important;min-height:2px!important;width:2px!important;height:2px!important}}
'''
    css += header_reveal_css(main)
    write('9. CSS — дашборд.css',css)
    write('14. Markdown — управление шапкой.md', header_control_markdown(main))
    metadata={'cross_filters_enabled':True,'chart_configuration':{str(main):{'id':main,'crossFilters':{'scope':{'rootPath':['ROOT_ID'],'excluded':[main]},'chartsInScope':[cat,one]}},str(cat):{'id':cat,'crossFilters':{'scope':{'rootPath':['ROOT_ID'],'excluded':[main,cat]},'chartsInScope':[one]}},str(one):{'id':one,'crossFilters':{'scope':{'rootPath':['ROOT_ID'],'excluded':[main,one]},'chartsInScope':[cat]}}},'global_chart_configuration':{'scope':{'rootPath':['ROOT_ID'],'excluded':[]},'chartsInScope':[main,cat,one]}}
    metadata.update(show_native_filters=False,native_filter_configuration=[])
    write('10. JSON — области фильтров.json',json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
    report={'configuration':config,'source_sha256':{name:hashlib.sha256((ROOT/'Виджеты'/name).read_bytes()).hexdigest() for name in sources.values()},'transforms':['scope host selectors','replace global broadcast with local bus','namespace internal PA messages','suppress screenshot expansion (single iframe)','replace distributed tour with local interactive guide','use container queries for embedded region width','validate catalogue preview before render','keep tabs active while metric blocks load','resizable catalogue with inline collapse caret and left rail','viewport board height; visible dashboard header; hidden chart headers','scroll report filters away on laptop; preserve useful analytics height','single-flight query queue with exact request completion','bounded session cache keyed by exact business masks and generation','atomic selection and preview; one local delayed loader','preserve empty filter values; explicit retry for command errors','calendar width follows embedded panel','approved CROSS DATA soft accent and local animated loading signature','stable detail-tab layout during loading; shared scroll for short viewports','preserve geometry and scroll across same-sandbox reruns','fixed SVG type during splitter drag; 420px catalogue minimum; selected names limited to three lines','styled native scrollbars','activity-only scrollbar thumbs with fixed dimensions','report title and help/brand above filters','optional click-only native-header control with fail-open Markdown links'], 'brand_sha256':{n:hashlib.sha256((OUT/'src/assets'/n).read_bytes()).hexdigest() for n in ['cross-data-accent-source.png','cross-data-accent.webp']},'calculations':'Original metric formulas are retained; model changes are limited to the documented filter/transport bridges.'}
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
