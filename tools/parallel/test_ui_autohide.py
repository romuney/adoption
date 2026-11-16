#!/usr/bin/env python3
"""Delivered native scrollbar paint lifecycle; fixed geometry on classic/overlay models."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
import test_ui_viewport as ui


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
            page.mouse.move(5,5);page.wait_for_timeout(1250)
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
            page.wait_for_timeout(1250)
            assert transparent(color(table)),('Still visible at rest under a stationary central pointer',color(table),table.get_attribute('data-pa-next-scroll-active'),table.evaluate('n=>({focus:n.matches(":focus-visible"),active:document.activeElement.className})'))
            assert geometry()==before
            # Edge discovery remains usable for mouse/drag without making the
            # entire hovered table display its scrollbar indefinitely.
            page.mouse.move(r['x']+r['width']-2,r['y']+45);page.wait_for_timeout(50)
            assert table.get_attribute('data-pa-next-scroll-active') is not None
            assert not transparent(color(table))
            if not overlay:
                thumb=table.evaluate('n=>({top:n.scrollTop,h:n.clientHeight,total:n.scrollHeight})')
                ty=r['y']+(thumb['top']+thumb['h']/2)*thumb['h']/thumb['total']
                page.mouse.move(r['x']+r['width']-2,ty);page.mouse.down()
                page.mouse.move(r['x']+r['width']-2,min(ty+55,r['y']+r['height']-8),steps=8)
                page.mouse.up()
                assert table.evaluate('n=>n.scrollTop')>thumb['top'],'Native thumb drag did not scroll'
            page.mouse.move(5,5);page.wait_for_timeout(1250)
            assert transparent(color(table)),('Edge leave',color(table),table.get_attribute('data-pa-next-scroll-active'))
            # General report scroll and right-hand people table use the same policy.
            shell=f.locator('.pa-next-shell');shell.evaluate('n=>n.scrollTop=40')
            f.wait_for_function("()=>document.querySelector('.pa-next-shell').hasAttribute('data-pa-next-scroll-active')")
            assert not transparent(color(shell));page.wait_for_timeout(1250);assert transparent(color(shell))
            f.locator('[data-view="view:who"]').click();page.wait_for_timeout(250)
            people=f.locator('.pone-tbl-scroll');people.evaluate('n=>n.scrollTop=80')
            f.wait_for_function("()=>document.querySelector('.pone-tbl-scroll').hasAttribute('data-pa-next-scroll-active')")
            assert not transparent(color(people));page.mouse.move(5,5);page.wait_for_timeout(1250);assert transparent(color(people))
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
