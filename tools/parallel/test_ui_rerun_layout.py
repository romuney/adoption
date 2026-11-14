#!/usr/bin/env python3
"""Keep geometry, scroll and data when Proteus reruns main JS in its iframe.

Uses actual local SQL responses and the pixel-sized Superset host model. DOM
clicks avoid Playwright scrollIntoView hiding the platform-rerun regression.
"""
import argparse
import hashlib
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

import test_ui_viewport as viewport
from test_ui import OUT
from test_ui_preview import FILES, SQL


MEASURE = r"""() => {
  var out={};
  for(var selector of ['.pa-next-shell','.pa-next-head','.pa-next-content',
      '.pa-next-cat','.pa-next-one','.pone-overlay','.pone-topbar',
      '.pone-panel-h','.pone-panel-b']) {
    var n=document.querySelector(selector),r=n.getBoundingClientRect();
    out[selector]={x:r.x,y:r.y,w:r.width,h:r.height,scroll:n.scrollTop,left:n.scrollLeft};
  }
  out.grid=getComputedStyle(document.querySelector('.pa-next-content')).gridTemplateRows;
  out.state=document.querySelector('.pa-next-one').getAttribute('data-pa-next-state');
  out.tab=document.querySelector('.pone-vtabs [data-view].active').getAttribute('data-view');
  out.rails=document.querySelectorAll('.pa-next-catalog-rail').length;
  out.splitters=document.querySelectorAll('[role="separator"]').length;
  return out;
}"""

DATA = r"""() => {
  var st=window.__paNext;
  return JSON.stringify({data:data,accepted:st.accepted,cache:st.cache,
    desired:st.desired,masks:st.masks,session:st.session,generation:st.generation});
}"""


def assert_same(before, after, label):
    for selector in [key for key in before if key.startswith('.')]:
        for field in ['x','y','w','h','scroll','left']:
            assert abs(before[selector][field]-after[selector][field]) <= 1, (
                label, selector, field, before[selector], after[selector])
    for field in ['grid','state','tab','rails','splitters']:
        assert before[field] == after[field], (label,field,before[field],after[field])
    assert after['rails'] == after['splitters'] == 1, (label,'duplicate layout controls',after)


def rerun(page, frame, script, rows, label):
    before=frame.evaluate(MEASURE)
    data_before=frame.evaluate(DATA)
    frame.evaluate('() => {window.__rerunMeasure='+MEASURE+';window.__rerunFrames=[];window.__rerunProbe=true;'
                   'function tick(){if(!window.__rerunProbe)return;window.__rerunFrames.push(window.__rerunMeasure());requestAnimationFrame(tick)}requestAnimationFrame(tick)}')
    immediate=[]
    for repeat in range(2):
        sample=frame.evaluate('(rows)=>{data=rows;'+script+';return window.__rerunMeasure();}',rows)
        immediate.append(sample)
        assert_same(before,sample,label+' immediate '+str(repeat))
        page.wait_for_timeout(250)
    settled=frame.evaluate(MEASURE)
    frames=frame.evaluate('window.__rerunProbe=false;window.__rerunFrames')
    assert len(frames)>=2, (label,'rAF probe did not observe the transition')
    for index,sample in enumerate(frames):
        assert_same(before,sample,label+' frame '+str(index))
    assert_same(before,settled,label+' settled')
    assert frame.evaluate(DATA)==data_before, (label,'rerun changed accepted data, cache or requested filters')
    return {'before':before,'immediate':immediate,'settled':settled,'frames':len(frames)}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--periods',type=Path,default=Path('/tmp/pa-next-periods'))
    parser.add_argument('--output',type=Path,default=Path('/tmp/pa-next-rerun-layout-results.json'))
    parser.add_argument('--screenshots',type=Path,default=Path('/tmp/pa-next-rerun-layout'))
    args=parser.parse_args()
    hashes={part:hashlib.sha256((OUT/name).read_bytes()).hexdigest() for part,name in SQL.items()}
    meta=json.loads((args.periods/'metadata.json').read_text())
    assert meta['source_sha256']==hashes
    viewport.rows={part:json.loads((args.periods/'d'/(part+'.json')).read_text()) for part in FILES}
    viewport.scripts={part:(OUT/name).read_text() for part,name in FILES.items()}
    result={'completed':False,'main_sha256':hashlib.sha256(viewport.scripts['head'].encode()).hexdigest(),'cases':[]}
    args.output.write_text(json.dumps(result)+'\n')
    args.screenshots.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,ignore_default_args=['--hide-scrollbars'])
        for tab in ['dyn','cal','who','path','coh']:
            for scroll in ['max','top']:
                label=tab+'-'+scroll
                page=browser.new_page(viewport={'width':1658,'height':963},reduced_motion='reduce')
                errors=[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                frame=viewport.mount(page)
                frame.locator('[data-view="view:'+tab+'"]').evaluate('(n)=>n.click()')
                page.wait_for_timeout(250)
                frame.locator('.pa-next-shell').evaluate('(n,atEnd)=>n.scrollTop=atEnd?n.scrollHeight:0',scroll=='max')
                page.wait_for_timeout(150)
                position=frame.locator('.pa-next-shell').evaluate('(n)=>n.scrollTop')
                assert (position>100 if scroll=='max' else position==0), (label,position)
                ready=rerun(page,frame,viewport.scripts['head'],viewport.rows['head'],label+' ready')
                # A genuine pending filter intent, with no replacement SQL data:
                # Proteus may still execute the main script on changed props.
                frame.locator('[data-grain="w"]').evaluate('(n)=>n.click()')
                frame.wait_for_selector('.pa-next-one[data-pa-next-state="loading"]')
                frame.wait_for_function('()=>window.__paNext.masks.head.some(f=>f.column==="period_param"&&f.value[0]==="w")')
                page.wait_for_timeout(450)
                loading=rerun(page,frame,viewport.scripts['head'],viewport.rows['head'],label+' loading')
                # Repeated installs must not leave duplicate delegated handlers.
                # One keyboard step is exactly one 24px change, followed by one
                # collapse and one expansion through the surviving controls.
                splitter=frame.locator('[role="separator"]')
                width_before=float(splitter.get_attribute('aria-valuenow'))
                splitter.evaluate('(n)=>n.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowLeft",keyCode:37,bubbles:true}))')
                width_after=float(splitter.get_attribute('aria-valuenow'))
                assert abs(width_before-width_after-24)<=1, (label,'duplicate splitter handler',width_before,width_after)
                frame.locator('.pa-next-cat-toggle').evaluate('(n)=>n.click()')
                assert frame.locator('.pa-next-catalog-rail').is_visible(), (label,'collapse handler')
                frame.locator('.pa-next-catalog-rail').evaluate('(n)=>n.click()')
                assert not frame.locator('.pa-next-catalog-rail').is_visible(), (label,'expand handler')
                assert frame.locator('.pa-next-cat-toggle').count()==1
                assert frame.locator('[role="separator"]').count()==1
                if tab=='who' and scroll=='max':
                    page.mouse.move(10,20)
                    page.screenshot(path=str(args.screenshots/'who-loading-after-reruns.png'))
                assert not errors, (label,errors)
                result['cases'].append({'case':label,'ready':ready,'loading':loading,'interaction':'passed'})
                args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
                print('PASS:',label,'ready + loading, four main reruns, data and scroll unchanged',flush=True)
                page.close()
        browser.close()
    assert hashlib.sha256((OUT/FILES['head']).read_bytes()).hexdigest()==result['main_sha256'], 'Generated main JS changed during the test'
    result['completed']=True
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')


if __name__=='__main__':
    main()
