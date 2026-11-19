#!/usr/bin/env python3
"""Regression for native target/focus controls across real Markdown variants.

Runs native anchor navigation/click/focus in Chromium with the generated report.
The legacy negative control demonstrates how anchor scrolling can look like a
hidden Markdown block while the old CSS never activates. No live Proteus access.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

from playwright.sync_api import sync_playwright

import test_ui_viewport as ui
from test_ui_header_reveal import DECORATE, PROBE, render_markdown
from header_reveal import header_control_markdown, header_reveal_css

LEGACY = '696213e7a86daf9504a87b44213c560f3b51ad64'
URL = 'http://pa-next.local.test/dashboard/parallel/?fixture=header'


def install(page, html, wrapper='dashboard-markdown', last=False, mixed=False):
    page.evaluate('''({html,wrapper,last,mixed})=>{
      var row=document.createElement('div');row.className='dragdroppable dragdroppable-row';row.dataset.test='header-control-row';
      row.innerHTML='<div class="with-popover-menu"><div class="grid-row"><div class="dragdroppable"><div class="with-popover-menu"><div class="'+wrapper+'"><div class="resizable-container" style="height:120px"><div class="dashboard-component dashboard-component-chart-holder">'+html+'</div></div></div></div></div></div></div>';
      if(mixed){var other=document.createElement('div');other.className='dragdroppable';other.innerHTML='<div class="dashboard-component-chart-holder" style="height:80px"><div class="dashboard-chart" style="height:80px">Other widget</div></div>';row.querySelector('.grid-row').appendChild(other);}
      var grid=document.querySelector('.grid-content');if(last)grid.appendChild(row);else grid.insertBefore(row,grid.firstChild);
    }''',dict(html=html,wrapper=wrapper,last=last,mixed=mixed))


def remove(page):
    page.locator('[data-test="header-control-row"]').evaluate('(node)=>node.remove()')
    page.locator('.board-scroller').evaluate('(node)=>{node.scrollTop=0;node.scrollLeft=0}')


def state(page):
    result=page.evaluate(PROBE)
    result.update(page.evaluate('''()=>{
      var row=document.querySelector('[data-test="header-control-row"]'),active=document.activeElement;
      return {hash:location.hash,target:document.querySelector(':target')&&document.querySelector(':target').id,focusHref:active&&active.getAttribute('href'),
        row:row?{height:row.getBoundingClientRect().height,top:row.getBoundingClientRect().top}:null,
        links:row?Array.from(row.querySelectorAll('a'),n=>{var r=n.getBoundingClientRect(),s=getComputedStyle(n),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {href:n.getAttribute('href'),focused:n===active,left:r.left,right:r.right,width:r.width,top:r.top,height:r.height,visibility:s.visibility,pointer:s.pointerEvents,color:s.color,font:s.fontSize,exposed:hit===n||n.contains(hit)}}):[]};
    }'''))
    return result


def stable(before,after,label):
    expected=dict(before['iframe'])
    if after['style']['position']=='relative':
        expected['y']+=65;expected['h']-=65;expected['bottom']=expected['y']+expected['h']
        assert after['headerReservation']=='65px',(label,'open header space not reserved',after)
    assert after['iframe']==expected,(label,'unexpected chart geometry',expected,after)
    assert after['nav']==before['nav'],(label,'global navigation moved',before,after)
    assert after['scroll']==before['scroll'],(label,'native anchor scrolled board',before,after)


def page_and_report(browser,width,height,portal=False,scope=None,css_override=None):
    page=browser.new_page(viewport={'width':width,'height':height},reduced_motion='reduce')
    page.route('http://pa-next.local.test/**',lambda route:route.fulfill(content_type='text/html',body='<!doctype html><html><body></body></html>'))
    page.goto(URL)
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    # Superset's server template supplies #app after the global navbar and its
    # SPA mounts inside it. Insert before iframe initialization, not afterwards:
    # moving an already mounted iframe would reload its document.
    set_content=page.set_content
    def app_content(html,**kwargs):
        if scope or css_override is not None:
            current=(ui.OUT/'9. CSS — дашборд.css').read_text()
            replacement=css_override if css_override is not None else current
            if scope:
                # Observed in production: top-level body selectors are changed
                # to :scope, while selectors nested in @supports retain body.
                prefix,helper=replacement.split('/* Optional native-header control',1)
                replacement='@scope ('+scope+') {'+prefix.replace('body:',':scope:')+'/* Optional native-header control'+helper+'}'
            assert current in html
            html=html.replace(current,replacement,1)
        html=html.replace('<div class="board-scroller">','<div id="app"><div class="board-scroller dashboard-container">',1)
        html=html.replace('</body>','</div></body>')
        return set_content(html,**kwargs)
    page.set_content=app_content
    try:frame=ui.mount(page)
    finally:page.set_content=set_content
    page.evaluate(DECORATE,dict(wrapper=True,noId=True,portal=portal))
    page.mouse.move(5,10)
    return page,frame,errors


def negative(browser,output,legacy_css,current_css,html):
    page,frame,errors=page_and_report(browser,1366,768)
    page.locator('head style').first.evaluate('''(node,x)=>{
      if(!node.textContent.includes(x.current))throw new Error('Delivery CSS changed during mount');
      node.textContent=node.textContent.replace(x.current,x.old);
    }''',{'current':current_css,'old':legacy_css})
    install(page,html,wrapper='fork-rich-text')
    opener=page.locator('[data-test="header-control-row"] a').first
    opener.scroll_into_view_if_needed();page.wait_for_timeout(100)
    before=state(page);page.screenshot(path=str(output/'legacy-before-click.png'))
    assert before['style']['position']!='fixed' and before['row']['height']>0,before
    opener.click();page.wait_for_timeout(150)
    after=state(page);page.screenshot(path=str(output/'legacy-after-click.png'))
    assert after['style']['position']!='fixed' and after['row']['height']>0,after
    assert before['scroll']!=after['scroll'],('legacy anchor did not exercise scroll negative control',before,after)
    assert all(link['top']+link['height']<=after['header']['bottom'] and not link['exposed'] for link in after['links']),('legacy links should scroll behind the fixed nav/sticky header, not be hidden by CSS',after)
    assert not errors,errors
    result={'revision':LEGACY,'before':before,'after':after,'finding':'Anchor scrolled the board; Markdown retained a nonzero box and native header stayed visible.'}
    page.close();print('PASS: legacy negative control reproduces visible links and anchor-scroll disappearance',flush=True)
    return result


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--output',type=Path,default=Path('/tmp/pa-next-header-focus'))
    ap.add_argument('--markdown-modules',type=Path,default=Path('/tmp/pa-next-markdown-render/node_modules'))
    ap.add_argument('--periods',type=Path,default=Path('/tmp/pa-next-people-periods/d'))
    ap.add_argument('--legacy-only',action='store_true')
    args=ap.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    for part in ['head','cat','one']:ui.rows[part]=json.loads((args.periods/(part+'.json')).read_text())
    main_id=json.loads((ui.OUT/'src/ui-build.json').read_text())['configuration']['main']
    current_css=(ui.OUT/'9. CSS — дашборд.css').read_text()
    legacy_css=subprocess.check_output(['git','show',LEGACY+':Параллельный отчёт — pa_next/9. CSS — дашборд.css'],text=True)
    old_source=f'[Открыть шапку дашборда](#chart-id-{main_id})\n\n[Закрыть шапку дашборда](#pa-next-header-closed-{main_id})\n'
    legacy_render=render_markdown(old_source,args.markdown_modules)
    rendered=render_markdown(header_control_markdown(main_id),args.markdown_modules)
    html=rendered['html']['plain'];old_html=legacy_render['html']['plain']
    if not args.legacy_only:
        assert header_reveal_css(main_id) in current_css,'Current focus module is absent from delivery'
    assert 'href="#app"' in html,'Expected permanent Superset root target'
    hashes={'main':hashlib.sha256((ui.OUT/'4. JS — весь отчёт.js').read_bytes()).hexdigest(),'css':hashlib.sha256(current_css.encode()).hexdigest(),'module':hashlib.sha256(header_reveal_css(main_id).encode()).hexdigest()}
    result={'sha256':hashes,'markdownRenderer':rendered,'legacyMarkdownRenderer':legacy_render,'scope':'Local Chromium stand; not live production verification; Safari/macOS not executed','completed':False,'cases':[]}
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,ignore_default_args=['--hide-scrollbars'])
        result['negative']=negative(browser,args.output,legacy_css,current_css,old_html)
        (args.output/'metrics.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
        if not args.legacy_only:
            cases=[
              ('app-one-p',1366,768,'dashboard-markdown',html,False,False),
              ('app-two-p-missing-id',1366,768,'dashboard-markdown',html.replace('</a>\n<a','</a></p><p><a'),True,False),
              ('app-unknown-wrapper-absolute',1920,1080,'fork-rich-text',html.replace('</a>\n<a','</a></p><p><a').replace('href="#','href="'+URL+'#'),True,True),
              ('legacy-two-p-unknown-wrapper',1366,768,'fork-rich-text',old_html,False,False),
              ('legacy-two-p-missing-id',1280,800,'fork-rich-text',old_html,True,True),
            ]
            for label,width,height,wrapper,markup,missing_id,portal in cases:
                page,frame,errors=page_and_report(browser,width,height,portal)
                if missing_id:page.locator(f'#chart-id-{main_id}').evaluate('(n)=>n.id="fork-chart-container"')
                page.wait_for_timeout(100)
                baseline=state(page);assert baseline['style']['position']!='fixed',(label,'missing control did not fail open',baseline)
                # An unusable control must never remove the native editing route.
                for bad in [markup.replace('<a href=','<a target="_blank" href='),markup[:markup.rfind('<a ')]+ '</p>']:
                    install(page,bad,wrapper);page.wait_for_timeout(40)
                    assert state(page)['style']['position']!='fixed',(label,'broken control hid native header')
                    remove(page)
                if label.startswith('app-'):
                    page.locator('#app').evaluate('(n)=>n.id="fork-app"')
                    install(page,markup,wrapper);page.wait_for_timeout(40)
                    assert state(page)['style']['position']!='fixed',(label,'missing SPA root hid native header')
                    assert state(page)['row']['height']==0,(label,'inactive control reserved layout space')
                    remove(page);page.locator('#fork-app').evaluate('(n)=>n.id="app"')
                install(page,markup,wrapper,mixed=True);page.wait_for_timeout(50)
                assert page.locator('[data-test="header-control-row"]').bounding_box()['height']>=80
                remove(page)
                install(page,markup,wrapper);page.wait_for_timeout(200)
                late_ready=None
                if label.startswith('legacy-') and missing_id:
                    late_ready=state(page)
                    assert late_ready['style']['position']!='fixed' and late_ready['row']['height']==0,(label,'missing target must preserve native header without reserving control-row height',late_ready)
                    assert page.locator('[data-test="edit-dashboard"]').is_visible()
                    page.mouse.click(width-80,52);page.wait_for_timeout(80)
                    assert state(page)['style']['position']!='fixed',(label,'anchor without target hid the native header')
                    page.evaluate('()=>{document.activeElement.blur();history.replaceState(null,"",location.pathname+location.search)}')
                    page.locator('#fork-chart-container').evaluate('(n,id)=>n.id=id',f'chart-id-{main_id}')
                    page.mouse.move(5,10);page.wait_for_timeout(200)
                closed=state(page)
                assert closed['header']['bottom']==48 and closed['row']['height']==0,(label,closed)
                assert closed['headerReservation']=='0px'
                assert abs(closed['iframe']['h']-baseline['iframe']['h']-65)<=1,(label,'header space not released',baseline,closed)
                assert closed['iframe']['y']==66 and closed['scroll']['board']==0,(label,closed)
                assert all(link['height']==8 and link['font']=='0px' for link in closed['links']),(label,closed)
                accepted=frame.evaluate('JSON.stringify(window.__paNext.accepted)');emits=page.evaluate('emits.length')
                # An unrelated fragment and pointer motion are not activation.
                page.evaluate('(hash)=>history.replaceState(null,"",hash)',f'#pa-next-header-open-{main_id}')
                page.mouse.move(width-80,52);page.wait_for_timeout(1000)
                assert state(page)['header']['bottom']==48,(label,'hash or hover opened the header')
                page.screenshot(path=str(args.output/(label+'-closed.png')))
                page.mouse.click(width-80,52);page.wait_for_timeout(100)
                opened=state(page)
                assert opened['header']['y']==48,(label,'native anchor click did not reveal',opened)
                if label.startswith('app-'):
                    assert opened['hash']=='#app' and opened['target']=='app',(label,'mousedown focus intercepted native anchor activation',opened)
                else:
                    assert opened['target']==f'chart-id-{main_id}',(label,'legacy native target was not activated',opened)
                assert opened['links'][0]['visibility']=='visible' and opened['links'][0]['pointer']=='none',(label,'opener must retain its focus',opened)
                stable(closed,opened,label)
                page.mouse.move(5,180)
                if label.startswith('app-'):
                    # Prove state does not rely on pointer-focus behavior. This
                    # models focus differences without claiming a Safari test.
                    page.evaluate('()=>document.activeElement.blur()')
                samples=page.evaluate('''()=>new Promise(resolve=>{var rows=[],i=0;function tick(){var h=document.querySelector('.dashboard-header-container');rows.push({y:h.getBoundingClientRect().top,focus:document.activeElement&&document.activeElement.getAttribute('href')});if(++i===30)resolve(rows);else requestAnimationFrame(tick)}requestAnimationFrame(tick)})''')
                assert all(s['y']==48 for s in samples),(label,'header was unstable across paints',samples)
                if label.startswith('app-'):assert all(s['focus'] is None for s in samples),(label,'blur probe retained link focus',samples)
                page.screenshot(path=str(args.output/(label+'-open.png')))
                page.mouse.click(width-80,52);page.wait_for_timeout(100)
                reclosed=state(page)
                assert reclosed['header']['bottom']==48,(label,'second click did not close',reclosed)
                stable(closed,reclosed,label)
                # Keyboard and menus remain available independently of chart ID.
                links=page.locator('[data-test="header-control-row"] a')
                links.first.focus();page.keyboard.press('Enter');page.wait_for_timeout(80)
                assert state(page)['header']['y']==48
                page.locator('[data-test="dashboard-menu"]').click()
                item=page.locator('[data-test="native-menu-item"]');item.focus();page.mouse.move(width-90,135);page.wait_for_timeout(50)
                assert state(page)['header']['y']==48,(label,'portal menu focus collapsed header')
                item.click();assert page.evaluate('window.menuClicks')==1
                links.last.focus();page.keyboard.press('Enter');page.wait_for_timeout(100)
                assert state(page)['header']['bottom']==48
                assert frame.evaluate('JSON.stringify(window.__paNext.accepted)')==accepted and page.evaluate('emits.length')==emits
                page.locator('#navigation-start').focus();page.mouse.move(5,10);page.keyboard.press('Tab')
                keyboard=state(page);assert keyboard['focused']=='edit-dashboard' and keyboard['header']['y']==48,(label,'native keyboard Edit route unavailable',keyboard)
                page.keyboard.press('Enter');page.wait_for_timeout(120)
                editing=state(page)
                assert page.evaluate('window.editClicks')==1 and editing['style']['position']!='fixed' and editing['style']['clip']=='none',(label,editing)
                assert editing['header']['y']==48 and editing['header']['h']==65
                assert not errors,(label,errors)
                result['cases'].append({'label':label,'viewport':[width,height],'missingChartId':missing_id,'lateTargetBeforeMount':late_ready,'wrapper':wrapper,'closed':closed,'opened':opened,'closedAgain':reclosed,'editing':editing,'stablePaints':len(samples),'queriesAdded':0})
                (args.output/'metrics.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
                page.close();print('PASS:',label,'native target activated; no scroll; toggle/Tab/menu/Edit accessible',flush=True)
        browser.close()
    assert hashes['main']==hashlib.sha256((ui.OUT/'4. JS — весь отчёт.js').read_bytes()).hexdigest(),'JS changed during test'
    assert hashes['css']==hashlib.sha256((ui.OUT/'9. CSS — дашборд.css').read_bytes()).hexdigest(),'CSS changed during test'
    result['completed']=True;(args.output/'metrics.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
