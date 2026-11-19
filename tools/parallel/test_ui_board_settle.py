#!/usr/bin/env python3
"""Record board/opaque-sandbox settling frame by frame with the real delivery.

Platform disturbances are explicit test inputs, never claims about live Proteus.
The saved production dump documents the external wrapper only, not iframe DOM.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

from playwright.sync_api import sync_playwright
import test_ui_viewport as ui


RECORDER = r'''
window.__settle={frames:[],events:[],running:true};
function settleRect(sel){var n=document.querySelector(sel);if(!n)return null;
  var r=n.getBoundingClientRect(),s=getComputedStyle(n);return {
    x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,
    cw:n.clientWidth,ch:n.clientHeight,ow:n.offsetWidth,oh:n.offsetHeight,
    sw:n.scrollWidth,sh:n.scrollHeight,sx:n.scrollLeft,sy:n.scrollTop,
    overflowX:s.overflowX,overflowY:s.overflowY,pad:s.padding,
    widthStyle:n.style.width,heightStyle:n.style.height};}
function settleFrame(t){
  if(!window.__settle.running)return;
  var nodes={};['html','body','[_echarts_instance_]','.pa-next-shell','.pa-next-content',
    '.pa-next-cat','.pa-next-one','.prb-overlay','.prb-panel','.pone-overlay','.pone-root',
    '.pone-top','.pone-panel','.pa-next-splitter','.phead-overlay'].forEach(function(sel){nodes[sel]=settleRect(sel)});
  var split=document.querySelector('.pa-next-splitter'),a=nodes['.prb-panel'],b=nodes['.pone-top']||nodes['.pone-panel'];
  var grip=null;
  if(split&&a&&b){var r=split.getBoundingClientRect(),s=getComputedStyle(split,'::before'),m=new DOMMatrixReadOnly(s.transform);
    var x=r.left+parseFloat(s.left)+m.e+parseFloat(s.width)/2;
    grip={x:x,gapCenter:(a.right+b.x)/2,error:x-(a.right+b.x)/2};}
  window.__settle.frames.push({t:t,ready:!!document.querySelector('.pa-next-ready'),
    innerWidth:innerWidth,innerHeight:innerHeight,scrollX:scrollX,scrollY:scrollY,nodes:nodes,grip:grip});
  requestAnimationFrame(settleFrame);
}
requestAnimationFrame(settleFrame);
addEventListener('error',function(e){window.__settle.events.push({t:performance.now(),type:'error',message:e.message})});
'''


def upgrade_case(browser, label, output):
    """Import current JS into a live legacy sandbox, not a fresh preview."""
    current = ui.scripts['head']
    previous = subprocess.check_output(['git','show','891bc2a:Параллельный отчёт — pa_next/4. JS — весь отчёт.js'],text=True)
    ui.scripts['head'] = previous
    page = browser.new_page(viewport={'width':1366,'height':768},reduced_motion='reduce')
    try:
        frame = ui.mount(page)
    finally:
        ui.scripts['head'] = current
    if label == 'upgrade-preview':
        frame.locator('tr[data-rep="2"]').click()
        frame.wait_for_selector('.pa-next-one[data-pa-next-state="preview"]')
    else:
        frame.locator('[data-view="view:who"]').click()
        page.wait_for_timeout(150)
        if label == 'upgrade-pending':
            frame.locator('[data-grain="m"]').click()
            frame.wait_for_selector('.pa-next-one[data-pa-next-state="loading"]')
        elif label == 'upgrade-hidden':
            frame.locator('.pa-next-cat-toggle').click()
    page.wait_for_timeout(450)
    frame.evaluate('''() => {
      document.querySelector('.pa-next-shell').scrollTop=70;
      document.querySelectorAll('.prb-tscroll,.pone-tbl-scroll').forEach(function(n){n.scrollTop=120});
    }''')
    page.wait_for_timeout(150)
    snapshot = r'''() => {
      var s=window.__paNext;
      var selectors=['.pa-next-shell','.prb-tscroll','.pone-tbl-scroll'];
      var positions={};selectors.forEach(function(sel){positions[sel]=Array.from(document.querySelectorAll(sel),function(n){return [n.scrollTop,n.scrollLeft]})});
      return {desired:JSON.stringify(s.desired),pending:JSON.stringify(s.pending),flight:JSON.stringify(s.flight),
        accepted:JSON.stringify(s.accepted),preview:JSON.stringify(s.preview),layout:JSON.stringify(s.layout),
        view:window.__pvtState.pone.view,positions:positions,ready:document.querySelector('.pa-next-one').dataset.paNextState,
        values:Array.from(document.querySelectorAll('.pone-k-val'),function(n){return n.textContent}),
        grip:window.__settle.frames.slice(-1)[0].grip};
    }'''
    before = frame.evaluate(snapshot)
    frame.evaluate('''() => {window.__upgradeRefs={interaction:window.__paNext.interaction,viewport:window.__paNext.viewport,
      cat:document.querySelector('.prb-overlay'),one:document.querySelector('.pone-overlay'),css:document.querySelector('.pa-next-shell>style').textContent};}''')
    emits = page.evaluate('emits.length')
    page.mouse.move(5,20)
    page.wait_for_timeout(200)
    page.screenshot(path=str(output/(label+'-before.png')))
    frame.evaluate('(rows)=>{data=rows;'+current+'}',ui.rows['head'])
    page.wait_for_timeout(700)
    after = frame.evaluate(snapshot)
    refs = frame.evaluate('''() => {var s=window.__paNext,b=window.__upgradeRefs;return {
      interactionChanged:s.interaction!==b.interaction,viewportChanged:s.viewport!==b.viewport,
      catChanged:document.querySelector('.prb-overlay')!==b.cat,oneChanged:document.querySelector('.pone-overlay')!==b.one,
      cssChanged:document.querySelector('.pa-next-shell>style').textContent!==b.css,
      revisions:[s.interactionRevision,s.viewportRevision,s.renderersRevision]};}''')
    for key in ['desired','pending','flight','accepted','preview','layout','view','ready','values']:
        assert after[key] == before[key], (label,key,before[key],after[key])
    assert all(refs[k] for k in ['interactionChanged','viewportChanged','catChanged','oneChanged','cssChanged']), (label,refs)
    assert all(isinstance(value,str) and len(value)==64 for value in refs['revisions']),refs
    if label != 'upgrade-hidden':
        assert abs(after['grip']['error']) <= .5, (label,after['grip'])
        assert abs(before['grip']['error']) >= 8, (label,'legacy negative control not exercised',before['grip'])
    assert after['positions'] == before['positions'], (label,'upgrade moved scroll',before['positions'],after['positions'])
    assert page.evaluate('emits.length') == emits, (label,'upgrade issued a query')
    frame.evaluate('''() => {window.__upgradeRefs={interaction:window.__paNext.interaction,viewport:window.__paNext.viewport,
      cat:document.querySelector('.prb-overlay'),one:document.querySelector('.pone-overlay')};}''')
    frame.evaluate('(rows)=>{data=rows;'+current+'}',ui.rows['head'])
    page.wait_for_timeout(350)
    same = frame.evaluate(snapshot)
    stable = frame.evaluate('''() => {var s=window.__paNext,b=window.__upgradeRefs;return {
      interaction:s.interaction===b.interaction,viewport:s.viewport===b.viewport,
      cat:document.querySelector('.prb-overlay')===b.cat,one:document.querySelector('.pone-overlay')===b.one};}''')
    assert all(stable.values()), (label,'same version rebuilt live controls',stable)
    for key in ['desired','pending','flight','accepted','preview','layout','view','positions','ready','values']:
        assert same[key] == after[key], (label,'same version changed '+key)
    assert page.evaluate('emits.length') == emits, (label,'same version issued a query')
    frame.evaluate('window.__paNext.interaction.help()')
    frame.wait_for_selector('.pa-next-task-chooser')
    assert 'С чего начнём?' in frame.locator('.pa-next-task-chooser').inner_text()
    frame.locator('[data-task-action="close"]').click()
    assert frame.evaluate('window.__paNext.layout.hidden') == json.loads(before['layout'])['hidden']
    page.mouse.move(5,20)
    page.wait_for_timeout(200)
    page.screenshot(path=str(output/(label+'-after.png')))
    frame.evaluate('window.__settle.running=false')
    trace = frame.evaluate('window.__settle')
    assert not [e for e in trace['events'] if e['type']=='error'],trace['events']
    # Keep proof compact; exact accepted data/queue strings were compared above.
    for record in [before,after,same]:
        for key in ['desired','pending','flight','accepted','preview']:
            record[key+'Sha256']=hashlib.sha256(record.pop(key).encode()).hexdigest()
    result = {'before':before,'after':after,'sameVersion':same,'upgradeRefs':refs,'sameRefs':stable,'queriesAdded':0,
              'legacySha256':hashlib.sha256(previous.encode()).hexdigest(),'currentSha256':hashlib.sha256(current.encode()).hexdigest()}
    (output/(label+'.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2))
    (output/(label+'-frames.json')).write_text(json.dumps(trace,ensure_ascii=False,indent=2))
    page.close()
    print('PASS:',label,'legacy gap corrected; state/scroll/data retained; same version reuses DOM; new guide opens',flush=True)
    return {'passed':True,'queriesAdded':0,'beforeGrip':before['grip'],'afterGrip':after['grip']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path('/tmp/pa-next-board-settle'))
    parser.add_argument('--periods', type=Path, default=Path('/tmp/pa-next-periods/d'))
    parser.add_argument('--case', action='append', dest='cases')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    for part in ['head','cat','one']:
        ui.rows[part] = json.loads((args.periods/(part+'.json')).read_text())
    original_doc = ui.doc
    def instrumented(part, code, rows):
        html = original_doc(part, code, rows)
        if part == 'head':
            html = html.replace('<script>var data=', '<script>'+RECORDER+'</script><script>var data=')
        return html
    ui.doc = instrumented
    cases = args.cases or ['baseline','stale-host-width','stale-host-height','outer-scrollbar',
                           'late-board-css','iframe-font','fractional-height',
                           'upgrade-ready','upgrade-pending','upgrade-preview','upgrade-hidden']
    names = {'main':'4. JS — весь отчёт.js','css':'9. CSS — дашборд.css'}
    hashes = {key:hashlib.sha256((ui.OUT/name).read_bytes()).hexdigest() for key,name in names.items()}
    results = {'sha256':hashes,'cases':{},'scope':'Local board model with explicit platform disturbances; not live production proof.'}
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,
                                    ignore_default_args=['--hide-scrollbars'])
        for label in cases:
            if label.startswith('upgrade-'):
                results['cases'][label] = upgrade_case(browser,label,args.output)
                continue
            page = browser.new_page(viewport={'width':1658,'height':963},reduced_motion='reduce')
            frame = ui.mount(page)
            page.screenshot(path=str(args.output/(label+'-before.png')))
            # Reproduce changes after the initial report is already visible.
            if label == 'stale-host-width':
                frame.evaluate('''() => {var h=document.querySelector('[_echarts_instance_]');
                  setTimeout(function(){window.__settle.events.push({t:performance.now(),type:'platform-stale-width'});h.style.width=(innerWidth+1)+'px'},350)}''')
            elif label == 'stale-host-height':
                frame.evaluate('''() => {var h=document.querySelector('[_echarts_instance_]');
                  setTimeout(function(){window.__settle.events.push({t:performance.now(),type:'platform-stale-height'});h.style.height=(innerHeight+1)+'px'},350)}''')
            elif label == 'outer-scrollbar':
                page.evaluate('''() => setTimeout(function(){var n=document.createElement('div');n.style.height='30px';
                  document.querySelector('.board-scroller').appendChild(n)},350)''')
            elif label == 'late-board-css':
                # The actual CSS is already active; replay its late attachment
                # after an initial platform measurement with default margins.
                page.evaluate('''() => {var n=document.querySelector('head style'),old=n.textContent;
                  n.textContent=old.replace('margin:16px 24px!important','margin:16px 32px!important');
                  setTimeout(function(){n.textContent=old},350)}''')
            elif label == 'iframe-font':
                frame.evaluate('''() => setTimeout(function(){document.body.style.fontFamily='serif';
                  document.body.style.lineHeight='1.6'},350)''')
            elif label == 'fractional-height':
                frame.evaluate('''() => setTimeout(function(){var h=document.querySelector('[_echarts_instance_]');
                  h.style.height=(innerHeight+.4)+'px'},350)''')
            page.wait_for_timeout(2300)
            frame.evaluate('window.__settle.running=false')
            data = frame.evaluate('window.__settle')
            outer = page.locator('iframe[name="head"]').bounding_box()
            data['outerFinal'] = outer
            valid = [s for s in data['frames'] if s['ready'] and s['grip']]
            summary = {'frames':len(data['frames']),'readyFrames':len(valid),
                       'maxGripError':max([abs(s['grip']['error']) for s in valid] or [0]),
                       'catLeftRange':[min([s['nodes']['.prb-panel']['x'] for s in valid] or [0]),max([s['nodes']['.prb-panel']['x'] for s in valid] or [0])],
                       'panelLeftRange':[min([s['nodes']['.pone-root']['x'] for s in valid] or [0]),max([s['nodes']['.pone-root']['x'] for s in valid] or [0])],
                       'documentBars':sorted(set(s['innerWidth']-s['nodes']['html']['cw'] for s in valid)),
                       'errors':[e for e in data['events'] if e['type']=='error']}
            results['cases'][label] = summary
            assert not summary['errors'], (label,summary['errors'])
            if label in ['baseline','stale-host-width','stale-host-height','iframe-font','fractional-height']:
                assert summary['documentBars'] == [0], (label,'sandbox document scrollbar appeared',summary)
                assert summary['maxGripError'] <= .5, (label,summary)
                assert summary['panelLeftRange'][1]-summary['panelLeftRange'][0] <= 1, (label,'platform settling shifted the analytics',summary)
            (args.output/(label+'.json')).write_text(json.dumps(data,ensure_ascii=False,indent=2))
            page.screenshot(path=str(args.output/(label+'-after.png')))
            print(label,json.dumps(summary,ensure_ascii=False),flush=True)
            page.close()
        browser.close()
    assert hashes == {key:hashlib.sha256((ui.OUT/name).read_bytes()).hexdigest() for key,name in names.items()}, 'Delivery changed during settling diagnostic'
    (args.output/'summary.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()
