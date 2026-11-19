#!/usr/bin/env python3
"""Real pointer regression: continuity, exact tooltip HTML, bounds and cleanup."""
import hashlib
import copy
import json
import subprocess
from pathlib import Path

from playwright.sync_api import sync_playwright

import test_ui_viewport as ui

OUT = Path('/tmp/pa-next-tooltip-results')
OLD = 'f04b300'
CASES = [('catalog-report','cat','report'), ('catalog-collection','cat','collection'),
         ('catalog-owner','cat','owner'), ('catalog-audience','cat','aud'),
         ('calendar','one','cal'), ('retention','one','coh'), ('people','one','who')]


def choose(frame, part):
    selector = '[data-pa-next-host="'+part+'"] table tbody [data-tip]'
    if part=='one':selector+=', [data-pa-next-host="one"] .pone-cal-main [data-tip]'
    all_nodes=frame.locator(selector)
    if all_nodes.count()<2:
        selector='[data-pa-next-host="'+part+'"] table [data-tip]'
        all_nodes=frame.locator(selector)
    if all_nodes.count():
        all_nodes.first.scroll_into_view_if_needed()
    points=all_nodes.evaluate_all('''nodes=>nodes.map((n,i)=>{
      var r=n.getBoundingClientRect(),x=r.left+Math.min(r.width/2,110),y=r.top+r.height/2;
      var hit=document.elementFromPoint(x,y),t=hit&&hit.closest('[data-tip]');
      return {i:i,x:x,y:y,html:n.getAttribute('data-tip'),visible:t===n&&x>=0&&y>=0&&y<innerHeight&&r.width>2&&r.height>2};
    }).filter(n=>n.visible)''')
    assert len(points)>=2,('No pair of visible tooltip targets',part,points,selector,all_nodes.count())
    first=points[0];second=next((n for n in points[1:] if n['html']!=first['html'] and abs(n['y']-first['y'])>8),points[1])
    return all_nodes,first,second


def activate(frame,part,tab):
    selector='[data-mode="'+tab+'"]' if part=='cat' else '[data-view="view:'+tab+'"]'
    frame.locator('[data-pa-next-host="'+part+'"] '+selector).click()


def pointer(page,frame,p):
    origin=frame.locator('html').bounding_box()
    page.mouse.move(origin['x']+p['x'],origin['y']+p['y'])


def record(frame,ns):
    frame.evaluate('''ns=>{
      var tip=document.querySelector('body>.'+ns+'-tip');window.__tipRecord={node:tip,hidden:0,styles:0};
      window.__tipObserver=new MutationObserver(records=>{
        for(var i=0;i<records.length;i++){
          var after=i+1<records.length?records[i+1].oldValue:tip.getAttribute('style');
          if(/display:\\s*none|opacity:\\s*0(?:;|$)/.test(after||''))window.__tipRecord.hidden++;
          window.__tipRecord.styles++;
        }
      });window.__tipObserver.observe(tip,{attributes:true,attributeFilter:['style'],attributeOldValue:true});
    }''',ns)


def check_case(page,frame,label,part,tab,baseline=False):
    activate(frame,part,tab);page.wait_for_timeout(120)
    nodes,a,b=choose(frame,part);ns='prb' if part=='cat' else 'pone'
    payload=frame.locator('[data-pa-next-host="'+part+'"] [data-tip]').evaluate_all('(ns)=>ns.map(n=>n.getAttribute("data-tip"))')
    pointer(page,frame,a);page.wait_for_timeout(130)
    tip=frame.locator('body>.'+ns+'-tip');assert tip.is_visible(),label
    record(frame,ns)
    emits=page.evaluate('emits.length');accepted=frame.evaluate('JSON.stringify(__paNext.accepted)')
    pointer(page,frame,b);page.wait_for_timeout(110)
    result=frame.evaluate('''ns=>{
      __tipObserver.disconnect();var n=document.querySelector('body>.'+ns+'-tip'),s=getComputedStyle(n),r=n.getBoundingClientRect();
      return {hidden:__tipRecord.hidden,sameNode:n===__tipRecord.node,opacity:s.opacity,display:s.display,
        x:r.x,y:r.y,right:r.right,bottom:r.bottom,transition:s.transitionProperty,duration:s.transitionDuration};
    }''',ns)
    if not baseline:
        assert result['hidden']==0,(label,'Tooltip hidden between rows/cells',result)
        assert result['sameNode'] and result['opacity']=='1' and result['display']!='none',(label,result)
        expected=nodes.nth(b['i']).evaluate('(n)=>{var d=document.createElement("div");d.innerHTML=n.getAttribute("data-tip");return d.innerHTML}')
        assert tip.inner_html()==expected,(label,'Changed tooltip numbers/HTML')
        assert result['x']>=5 and result['y']>=5 and result['right']<=frame.evaluate('innerWidth')-5 and result['bottom']<=frame.evaluate('innerHeight')-5,(label,result)
        assert frame.evaluate('JSON.stringify(__paNext.accepted)')==accepted and page.evaluate('emits.length')==emits
        # Exit to a non-tooltip area: no ghost tooltip after the short grace.
        frame.locator('.pa-next-titlebar h1').hover();page.wait_for_timeout(130)
        assert not tip.is_visible(),(label,'Tooltip stuck after exit')
        pointer(page,frame,a);page.wait_for_timeout(90)
        assert tip.is_visible(),label
        page.keyboard.press('Escape');assert not tip.is_visible(),(label,'Escape did not dismiss')
    return {'label':label,'payload':payload,'hover':result}


def mount(browser,old=False,grain='d',reduced=False):
    saved=ui.scripts['head']
    if old:ui.scripts['head']=subprocess.check_output(['git','show',OLD+':Параллельный отчёт — pa_next/4. JS — весь отчёт.js'],text=True)
    for part in ['head','cat','one']:ui.rows[part]=json.loads((Path('/tmp/pa-next-people-periods/d')/(part+'.json')).read_text())
    page=browser.new_page(viewport={'width':1600,'height':1100},reduced_motion='reduce' if reduced else 'no-preference')
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    try:frame=ui.mount(page)
    finally:ui.scripts['head']=saved
    if grain!='d':
        frame.locator('[data-grain="'+grain+'"]').click()
        for part in ['cat','one']:
            incoming=copy.deepcopy(json.loads((Path('/tmp/pa-next-people-periods')/grain/(part+'.json')).read_text()))
            masks=frame.evaluate('window.__paNext.masks')
            for row in incoming:
                if row['section']=='pa_next_request':
                    row['k']=next((v['value'][0] for v in masks[row['g']] if v['column']=='pa_next_'+row['g']+'_req'),'')
            page.frame(name=part).evaluate('(rows)=>{data=rows;'+ui.scripts[part]+'}',incoming)
        frame.wait_for_selector('.pa-next-ready')
    assert not errors,errors
    return page,frame,errors


def main():
    OUT.mkdir(exist_ok=True)
    report={'scope':'Local Chromium, actual delivery + captured SQL fixture rows, not live Proteus','completed':False,'negative':[],'cases':[]}
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
        page,frame,errors=mount(browser,old=True)
        old_payload={}
        for label,part,tab in CASES:
            print('NEGATIVE:',label,flush=True)
            result=check_case(page,frame,label,part,tab,baseline=True);old_payload[label]=result.pop('payload')
            report['negative'].append(result)
        assert any(c['hover']['hidden']>0 for c in report['negative']),'Old flicker was not exercised'
        page.close()
        page,frame,errors=mount(browser)
        for label,part,tab in CASES:
            result=check_case(page,frame,label,part,tab)
            assert result.pop('payload')==old_payload[label],(label,'Source tooltip content changed')
            report['cases'].append(result);print('PASS:',label,'continuous tooltip, exact content, no queries',flush=True)
        # Explicitly slow movement through a real cell/row gap must not dismiss.
        activate(frame,'one','coh');page.wait_for_timeout(100)
        table=frame.locator('.pone-cttable');assert table.count()==1
        frame.evaluate('''()=>{var t=document.querySelector('.pone-cttable');t.style.borderCollapse='separate';t.style.borderSpacing='4px'}''')
        nodes,a,b=choose(frame,'one');pointer(page,frame,a);page.wait_for_timeout(100)
        tip=frame.locator('body>.pone-tip')
        frame.evaluate('''()=>{var t=document.querySelector('.pone-cttable'),e=new MouseEvent('mouseout',{bubbles:true,relatedTarget:t});
          document.elementFromPoint('''+str(a['x'])+','+str(a['y'])+''').dispatchEvent(e)}''')
        page.wait_for_timeout(160);assert tip.is_visible(),'Slow table gap hid tooltip'
        # A nested scroll dismisses immediately, without changing filters.
        frame.locator('.pone-ct-wrap').evaluate('(n)=>n.dispatchEvent(new Event("scroll"))')
        assert not tip.is_visible(),'Nested table scroll left a ghost tooltip'
        # Content can grow while a previous cursor-follow transition is still
        # running near the viewport edge. No intermediate paint may overflow.
        edge=frame.evaluate('''async()=>{
          var c=window.__pvtState.pone.paNextTipController,n=document.querySelector('body>.pone-tip');
          c.show('A',{left:innerWidth-20,top:innerHeight-20,width:0,height:0,pt:true});
          await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
          c.show('A',{left:10,top:10,width:0,height:0,pt:true});
          c.show('<div style="width:230px;height:160px">Wider data</div>',{left:10,top:10,width:0,height:0,pt:true});
          var samples=[];for(var i=0;i<8;i++){
            var b=n.getBoundingClientRect();samples.push({left:b.left,top:b.top,right:b.right,bottom:b.bottom});
            await new Promise(r=>requestAnimationFrame(r));
          }c.hide();return {samples:samples,width:innerWidth,height:innerHeight};
        }''')
        assert all(s['left']>=5 and s['top']>=5 and s['right']<=edge['width']-5 and s['bottom']<=edge['height']-5 for s in edge['samples']),edge
        report['edgeTransition']=edge
        assert not errors,errors
        page.screenshot(path=str(OUT/'retention.png'));page.close()
        # The multi-month calendar uses a different cell/grid structure.
        page,frame,errors=mount(browser,grain='m',reduced=True)
        result=check_case(page,frame,'calendar-month-grid-reduced','one','cal')
        assert result['hover']['duration']=='0s',result
        result.pop('payload');report['cases'].append(result)
        assert frame.locator('.pone-cal-mg .d').count()>0
        assert not errors,errors
        page.close();browser.close()
    report['sha256']={f:hashlib.sha256((ui.OUT/f).read_bytes()).hexdigest() for f in ['4. JS — весь отчёт.js','9. CSS — дашборд.css']}
    report['completed']=True;(OUT/'metrics.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))


if __name__=='__main__':main()
