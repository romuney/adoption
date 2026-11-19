#!/usr/bin/env python3
"""Delivered native scrollbar paint lifecycle; fixed geometry on classic/overlay models."""
import argparse
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright
import test_ui_viewport as ui


def fade_profile(browser):
    from build_ui import CSS
    page=browser.new_page(viewport={'width':600,'height':500},reduced_motion='no-preference')
    page.clock.install(time=datetime(2026,11,17,12,0,0,tzinfo=timezone.utc))
    page.clock.pause_at(datetime(2026,11,17,12,0,1,tzinfo=timezone.utc))
    page.set_content('<style>'+CSS+'</style><div class="pa-next-shell"><div class="scroll-test" tabindex="0" style="width:200px;height:100px;overflow:auto"><div style="height:900px">Rows</div></div><div class="scroll-second" style="width:200px;height:100px;overflow:auto"><div style="height:900px">Other rows</div></div></div>')
    old=subprocess.check_output(['git','show','c72ee62:Параллельный отчёт — pa_next/src/scrollbars.js'],cwd=ui.OUT.parent,text=True)
    page.add_script_tag(content=old)
    page.evaluate('var oldScroll=installScrollbars(document.querySelector(".pa-next-shell"));var oldBox=document.querySelector(".scroll-test");oldBox.dispatchEvent(new PointerEvent("pointermove",{bubbles:true,clientX:198,clientY:50}))')
    assert page.locator('.scroll-test').get_attribute('data-pa-next-scroll-active') is not None
    assert page.locator('.scroll-test').evaluate('(n)=>n.scrollTop')==0
    page.evaluate('oldScroll.destroy()')
    page.add_script_tag(content=(ui.OUT/'src/scrollbars.js').read_text())
    page.evaluate('window.sc=installScrollbars(document.querySelector(".pa-next-shell"));window.box=document.querySelector(".scroll-test")')
    alpha=lambda:page.evaluate('Number(box.style.getPropertyValue("--pa-next-scroll-opacity")||0)')
    page.evaluate('box.scrollTop=10;box.dispatchEvent(new Event("scroll"))');page.clock.run_for(40)
    assert not page.locator('.scroll-test').get_attribute('data-pa-next-scroll-active'),'Programmatic restore revealed the bar'
    page.evaluate('box.dispatchEvent(new WheelEvent("wheel",{bubbles:true}))');page.clock.run_for(40)
    assert alpha()==0,'Intent without actual scrolling revealed the bar'
    page.evaluate('box.scrollTop=30;box.dispatchEvent(new Event("scroll"))');page.clock.run_for(100)
    beginning=alpha();assert 0<beginning<1,beginning
    page.clock.run_for(230);assert alpha()==1
    page.evaluate('var other=document.querySelector(".scroll-second");other.dispatchEvent(new WheelEvent("wheel",{bubbles:true}));other.scrollTop=20;other.dispatchEvent(new Event("scroll"))')
    page.clock.run_for(1180);fading=alpha();assert 0<fading<1,fading
    assert page.locator('.scroll-second').get_attribute('data-pa-next-scroll-active') is not None,'Active second surface disappeared with the first'
    page.clock.run_for(500);assert alpha()==0
    assert page.locator('.scroll-test').get_attribute('data-pa-next-scroll-active') is None
    page.evaluate('box.dispatchEvent(new WheelEvent("wheel",{bubbles:true}));box.scrollTop=50;box.dispatchEvent(new Event("scroll"))')
    page.clock.run_for(90);page.emulate_media(reduced_motion='reduce');page.clock.run_for(40)
    assert alpha()==1,'Reduced motion did not stop the fade'
    page.evaluate('sc.destroy()');assert alpha()==0
    page.evaluate('box.dispatchEvent(new WheelEvent("wheel",{bubbles:true}));box.scrollTop=70;box.dispatchEvent(new Event("scroll"))');page.clock.run_for(400)
    assert alpha()==0,'Destroyed controller kept handling scroll'
    page.close();return {'old_hover_reveals_without_scroll':True,'fade_in_100ms_alpha':beginning,'fade_out_mid_alpha':fading,'independent_idle_timers':True,'intent_alone_hidden':True,'programmatic_hidden':True,'reduced_and_destroy':True}


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--baseline-ref',default='ccc074e',help='Fixed pre-autohide delivery for unchanged data-width proof')
    ap.add_argument('--output',type=Path,default=Path('/tmp/pa-next-autohide-results.json'))
    a=ap.parse_args()
    for part in ['head','cat','one']:
        ui.rows[part]=json.loads(Path('/tmp/pa-next-people-periods/d',part+'.json').read_text())
    current=ui.scripts['head']
    baseline=subprocess.check_output(['git','show',a.baseline_ref+':Параллельный отчёт — pa_next/4. JS — весь отчёт.js'],cwd=ui.OUT.parent,text=True)
    sha=hashlib.sha256(current.encode()).hexdigest()
    result={'completed':False,'main_sha256':sha,'scope':'Local Chromium, native classic scrolling and zero-width geometry simulation; not a macOS/Safari run','cases':[]}
    with sync_playwright() as p:
        b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,ignore_default_args=['--hide-scrollbars'])
        result['fade_profile']=fade_profile(b)
        for overlay in [False,True]:
            page=b.new_page(viewport={'width':1366,'height':768},reduced_motion='reduce')
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            ui.scripts['head']=baseline
            old_frame=ui.mount(page)
            if overlay:old_frame.add_style_tag(content='.pa-next-shell,.pa-next-shell *{scrollbar-width:none!important}')
            old=old_frame.locator('.prb-tscroll').evaluate('n=>({right:n.getBoundingClientRect().right,dataWidth:n.querySelector("table").getBoundingClientRect().width})')
            ui.scripts['head']=current
            f=ui.mount(page)
            if overlay:f.add_style_tag(content='.pa-next-shell,.pa-next-shell *{scrollbar-width:none!important}')
            page.mouse.move(5,5);page.wait_for_timeout(2000)
            table=f.locator('.prb-tscroll')
            def color(node):return node.evaluate("n=>getComputedStyle(n,'::-webkit-scrollbar-thumb').backgroundColor")
            def transparent(value):return value in ['rgba(0, 0, 0, 0)','transparent']
            def geometry():return f.evaluate('''()=>{
              function rect(s){var n=document.querySelector(s),r=n.getBoundingClientRect();return [r.x,s==='.prb-ptable'?0:r.y,r.width,r.height,n.clientWidth];}
              return {table:rect('.prb-tscroll'),data:rect('.prb-ptable'),cat:rect('.prb-panel'),one:rect('.pone-panel'),
                font:Array.from(document.querySelectorAll('.pone-k-val'),n=>getComputedStyle(n).fontSize)};}''')
            assert transparent(color(table)),color(table)
            title=f.locator('.pa-next-titlebar').bounding_box();strip=f.locator('.phead-strip').bounding_box()
            assert f.locator('.pa-next-titlebar h1').inner_text()=='Proteus Adoption'
            assert title['y']+title['height']<=strip['y']
            assert f.locator('.pa-next-titlebar [data-tourstart]').is_visible()
            assert f.locator('.pa-next-titlebar .pa-next-brand').count()==1
            before=geometry();r=table.bounding_box()
            assert abs(before['data'][2]-old['dataWidth'])<.1,'Moving the thumb squeezed data columns'
            assert abs(table.evaluate('n=>n.getBoundingClientRect().right')-old['right']-6)<.1,('Thumb did not move right by6px',overlay,old,r,before)
            assert r and table.evaluate('n=>n.scrollHeight>n.clientHeight')
            # Actual wheel over the table, not a synthetic scroll event.
            page.mouse.move(r['x']+r['width']/2,r['y']+45);page.mouse.wheel(0,100)
            f.wait_for_function("()=>document.querySelector('.prb-tscroll').scrollTop>0")
            table.wait_for(state='visible');page.wait_for_timeout(50)
            assert table.get_attribute('data-pa-next-scroll-active') is not None
            assert not transparent(color(table)),color(table)
            assert geometry()==before,'Thumb visibility changed layout'
            page.wait_for_timeout(2000)
            assert transparent(color(table)),('Still visible at rest under a stationary central pointer',color(table),table.get_attribute('data-pa-next-scroll-active'),table.evaluate('n=>({focus:n.matches(":focus-visible"),active:document.activeElement.className})'))
            assert geometry()==before
            # Edge hover alone stays hidden. A real wheel/drag still works.
            page.mouse.move(r['x']+r['width']-2,r['y']+45);page.wait_for_timeout(50)
            assert table.get_attribute('data-pa-next-scroll-active') is None
            assert transparent(color(table))
            page.mouse.wheel(0,40);page.wait_for_timeout(80)
            assert table.get_attribute('data-pa-next-scroll-active') is not None
            if not overlay:
                thumb=table.evaluate('n=>({top:n.scrollTop,h:n.clientHeight,total:n.scrollHeight})')
                ty=r['y']+(thumb['top']+thumb['h']/2)*thumb['h']/thumb['total']
                page.mouse.move(r['x']+r['width']-2,ty);page.mouse.down()
                page.mouse.move(r['x']+r['width']-2,min(ty+55,r['y']+r['height']-8),steps=8)
                page.mouse.up()
                assert table.evaluate('n=>n.scrollTop')>thumb['top'],'Native thumb drag did not scroll'
            page.mouse.move(5,5);page.wait_for_timeout(2000)
            assert transparent(color(table)),('Edge leave',color(table),table.get_attribute('data-pa-next-scroll-active'))
            # General report scroll and right-hand people table use the same policy.
            shell=f.locator('.pa-next-shell');ui.wheel_over_chart(page,f,80)
            f.wait_for_function("()=>document.querySelector('.pa-next-shell').hasAttribute('data-pa-next-scroll-active')")
            assert not transparent(color(shell));page.wait_for_timeout(2000);assert transparent(color(shell))
            f.locator('[data-view="view:who"]').click();page.wait_for_timeout(250)
            people=f.locator('.pone-tbl-scroll');people.hover(position={'x':30,'y':40});page.mouse.wheel(0,80)
            f.wait_for_function("()=>document.querySelector('.pone-tbl-scroll').hasAttribute('data-pa-next-scroll-active')")
            assert not transparent(color(people));page.mouse.move(5,5);page.wait_for_timeout(2000);assert transparent(color(people))
            # Only native paint changes; the existing controller/selection stays.
            f.evaluate('window.__autoOldInteraction=window.__paNext.interaction')
            emits=page.evaluate('emits.length')
            f.evaluate('()=>{'+ui.scripts['head']+'}')
            assert f.evaluate('window.__autoOldInteraction===window.__paNext.interaction')
            assert page.evaluate('emits.length')==emits
            # Reuse six pixels of existing card padding, preserving data width.
            spacing=f.locator('.pone-tbl-scroll').evaluate('''n=>{var r=n.getBoundingClientRect(),card=n.closest('.pone-panel').getBoundingClientRect();return {gap:card.right-r.right,padding:parseFloat(getComputedStyle(n).paddingRight)};}''')
            assert spacing['gap']==10 and spacing['padding']==6,spacing
            page.emulate_media(forced_colors='active');page.wait_for_timeout(50)
            assert not transparent(color(f.locator('.pone-tbl-scroll'))),'High-contrast mode lost its native thumb'
            assert not errors,errors
            result['cases'].append({'overlay_geometry':overlay,'geometry_stable':True,'scroll_idle_edge_report_people':True,'same_controller_no_queries':True,'spacing':spacing,'errors':errors})
            print('PASS autohide',overlay,'wheel, idle, edge, report/people, stable geometry and high contrast',flush=True)
            page.close()
        b.close()
    assert hashlib.sha256((ui.OUT/'4. JS — весь отчёт.js').read_bytes()).hexdigest()==sha
    result['completed']=True;a.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')

if __name__=='__main__':main()
