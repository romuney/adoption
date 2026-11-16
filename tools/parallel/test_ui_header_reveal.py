#!/usr/bin/env python3
"""Native dashboard header remains reachable without parent-DOM iframe access.

Use the generated report in a local Superset wrapper. CSS additions can be
tested before rebuilding; --delivered requires the exact module in file 9.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

from playwright.sync_api import sync_playwright

import test_ui_viewport as ui
from header_reveal import header_control_markdown, header_reveal_css


DECORATE = r'''(options) => {
  var nav=document.querySelector('#main-menu');
  nav.style.cssText='height:48px;box-sizing:border-box;padding:8px 24px;background:white;border-bottom:1px solid #e7e9ee';
  nav.setAttribute('role','navigation');
  if(options.noId)nav.id='fork-navigation';
  nav.innerHTML='<button id="navigation-start" type="button">Proteus</button>';
  var header=document.querySelector('.dashboard-header-container');
  header.innerHTML='<div class="header-with-actions"><h1>Proteus Adoption · длинное название дашборда для проверки доступности действий</h1><div class="button-container"><button type="button" data-test="edit-dashboard">Редактировать</button><button type="button" data-test="dashboard-menu" aria-expanded="false">Меню</button></div></div>';
  var css=document.createElement('style');
  css.textContent='.header-with-actions{position:relative;display:flex;align-items:center;gap:16px;width:100%;min-width:0;height:100%}.header-with-actions h1{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.button-container{display:flex;gap:8px;flex:none}';
  if(options.wrapper){
    var platform=document.createElement('div'),drag=document.createElement('div'),content=document.createElement('div');
    platform.className='platform-header';drag.className='dragdroppable';drag.dataset.test='top-level-tabs';drag.style.marginLeft='-32px';
    header.parentNode.insertBefore(platform,header);platform.appendChild(drag);drag.appendChild(content);content.appendChild(header);
    css.textContent+='.board-scroller{display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}.platform-header{grid-column:2;grid-row:1;position:sticky;top:0;z-index:100;max-width:100vw}.dashboard{grid-column:2;grid-row:2;min-width:0}';
  }
  document.querySelector('head').appendChild(css);
  var edit=header.querySelector('[data-test="edit-dashboard"]'),menu=header.querySelector('[data-test="dashboard-menu"]');
  edit.onclick=function(){window.editClicks=(window.editClicks||0)+1;document.querySelector('.dashboard').classList.add('dashboard--editing');
    var drag=document.querySelector('[data-test="top-level-tabs"]');if(drag)drag.style.marginLeft='0px';};
  function closeMenu(){var popup=document.querySelector('.test-native-menu');if(popup)popup.remove();menu.classList.remove('ant-dropdown-open');menu.setAttribute('aria-expanded','false');menu.focus();}
  menu.onclick=function(){
    if(menu.getAttribute('aria-expanded')==='true'){closeMenu();return;}
    menu.setAttribute('aria-expanded','true');menu.classList.add('ant-dropdown-open');
    var popup=document.createElement('div');popup.className='test-native-menu ant-dropdown';popup.setAttribute('role','menu');
    popup.style.cssText='position:fixed;top:113px;right:24px;background:white;border:1px solid #aaa;padding:12px;z-index:1050';
    popup.innerHTML='<button data-test="native-menu-item" role="menuitem">Действие меню</button>';
    popup.querySelector('button').onclick=function(){window.menuClicks=(window.menuClicks||0)+1;closeMenu();};
    popup.onkeydown=function(e){if(e.key==='Escape')closeMenu();};
    (options.portal?document.body:header.querySelector('.header-with-actions')).appendChild(popup);
  };
}'''

PROBE = r'''() => {
  function rect(selector){var n=document.querySelector(selector),r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};}
  var header=document.querySelector('.dashboard-header-container'),s=getComputedStyle(header),after=getComputedStyle(header,'::after');
  return {header:rect('.dashboard-header-container'),iframe:rect('iframe[name="head"]'),nav:rect('[role="navigation"]'),
    style:{display:s.display,position:s.position,transform:s.transform,clip:s.clipPath,transition:s.transitionDuration},
    after:{content:after.content,height:after.height,background:after.backgroundColor},
    scroll:{x:scrollX,y:scrollY,board:document.querySelector('.board-scroller').scrollTop},
    headerReservation:getComputedStyle(document.querySelector('.grid-container')).getPropertyValue('--pa-next-board-header-height'),
    focused:document.activeElement&&document.activeElement.getAttribute('data-test')};
}'''


def unchanged_chart(before, after, label):
    assert before['iframe'] == after['iframe'], (label, 'reveal changed chart geometry', before, after)
    assert before['nav'] == after['nav'], (label, 'reveal changed global navigation', before, after)
    assert after['scroll']['x'] == 0 and after['scroll']['board'] == 0, (label, after)


def render_markdown(source, modules):
    """Exercise the real ReactMarkdown version used by Superset 2.1.

    Install isolated test dependencies once if missing:
    npm install --prefix /tmp/pa-next-markdown-render --no-audit --no-fund \
      react@18.2.0 react-dom@18.2.0 react-markdown@8.0.3 rehype-sanitize@5.0.1 rehype-raw@6.1.1
    """
    assert (modules/'react-markdown/index.js').exists(), 'Install the isolated Markdown test dependencies described in render_markdown()'
    js = r'''import fs from 'node:fs';import {pathToFileURL} from 'node:url';
const input=JSON.parse(fs.readFileSync(0,'utf8'));
async function take(file){return await import(pathToFileURL(input.modules+'/'+file).href)}
const React=(await take('react/index.js')).default;
const server=(await take('react-dom/server.node.js')).default;
const Markdown=(await take('react-markdown/index.js')).default;
const raw=(await take('rehype-raw/index.js')).default;
const sanitize=(await take('rehype-sanitize/index.js')).default;
const modes={plain:{skipHtml:true},raw:{rehypePlugins:[raw]},sanitized:{rehypePlugins:[raw,sanitize]}};
const html={};for(const [name,props] of Object.entries(modes))html[name]=server.renderToStaticMarkup(React.createElement(Markdown,props,input.source));
console.log(JSON.stringify({html,version:JSON.parse(fs.readFileSync(input.modules+'/react-markdown/package.json','utf8')).version}));'''
    rendered=json.loads(subprocess.check_output(['node','--input-type=module','-e',js],input=json.dumps({'modules':str(modules),'source':source}).encode()))
    assert rendered['version']=='8.0.3'
    assert len(set(rendered['html'].values()))==1,rendered
    assert 'target=' not in rendered['html']['plain'],rendered
    return rendered


def install_control(page, html, mixed=False):
    page.evaluate('''({html,mixed})=>{
      var row=document.createElement('div');row.className='dragdroppable dragdroppable-row';row.dataset.test='header-control-row';
      row.innerHTML='<div class="with-popover-menu"><div class="grid-row"><div class="dragdroppable"><div class="with-popover-menu"><div class="dashboard-markdown"><div class="resizable-container" style="height:120px"><div class="dashboard-component dashboard-component-chart-holder">'+html+'</div></div></div></div></div></div></div>';
      if(mixed){var other=document.createElement('div');other.className='dragdroppable';other.innerHTML='<div class="dashboard-component-chart-holder" style="height:80px">Ordinary chart fixture</div>';row.querySelector('.grid-row').appendChild(other);}
      var grid=document.querySelector('.grid-content');grid.insertBefore(row,grid.firstChild);
    }''',{'html':html,'mixed':mixed})


def remove_control(page):
    page.locator('[data-test="header-control-row"]').evaluate('(node)=>node.remove()')
    page.locator('.board-scroller').evaluate('(node)=>{node.scrollTop=0;node.scrollLeft=0}')


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--delivered',action='store_true')
    ap.add_argument('--output',type=Path,default=Path('/tmp/pa-next-header-reveal'))
    ap.add_argument('--markdown-modules',type=Path,default=Path('/tmp/pa-next-markdown-render/node_modules'))
    args=ap.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    config=json.loads((ui.OUT/'src/ui-build.json').read_text())['configuration'];main_id=config['main']
    addition=header_reveal_css(main_id);source=header_control_markdown(main_id)
    assert (ui.OUT/'14. Markdown — управление шапкой.md').read_text()==source
    rendered=render_markdown(source,args.markdown_modules)
    control=rendered['html']['plain'];open_sel=f'.dashboard-markdown a[href="#chart-id-{main_id}"]';close_sel=f'.dashboard-markdown a[href="#pa-next-header-closed-{main_id}"]'
    delivered=(ui.OUT/'9. CSS — дашборд.css').read_text()
    if args.delivered:assert addition in delivered,'Header module is absent from delivered CSS'
    periods=Path('/tmp/pa-next-periods/d')
    if periods.exists():
        for part in ['head','cat','one']:ui.rows[part]=json.loads((periods/(part+'.json')).read_text())
    hashes={'main':hashlib.sha256((ui.OUT/'4. JS — весь отчёт.js').read_bytes()).hexdigest(),
            'css':hashlib.sha256(delivered.encode()).hexdigest(),'headerModule':hashlib.sha256(addition.encode()).hexdigest(),'markdown':hashlib.sha256(source.encode()).hexdigest()}
    result={'sha256':hashes,'markdownRenderer':rendered,'delivered':args.delivered,'scope':'Local browser stand with generated report and Superset 2.1 header wrapper; not live Proteus','cases':[]}
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,ignore_default_args=['--hide-scrollbars'])
        for label,width,height,wrapper,no_id,portal in [
            ('laptop-fork-local-menu',1366,768,True,True,False),
            ('desktop-portal-menu',1920,1080,True,False,True),
            ('laptop-direct-header',1280,800,False,True,True),
        ]:
            page=browser.new_page(viewport={'width':width,'height':height},reduced_motion='reduce');errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            frame=ui.mount(page)
            page.evaluate(DECORATE,{'wrapper':wrapper,'noId':no_id,'portal':portal})
            page.mouse.move(5,10)
            if not args.delivered:
                # A previous generated prototype must not keep an older,
                # weaker fail-open selector active beside the current module.
                page.locator('head style').first.evaluate("node=>node.textContent=node.textContent.split('/* Optional native-header control.')[0]")
                page.evaluate("css=>{var node=document.createElement('style');node.textContent=css;document.querySelector('head').appendChild(node)}",addition)
            page.wait_for_timeout(250)
            baseline=page.evaluate(PROBE)
            assert baseline['header']['y']==48 and baseline['style']['position']!='fixed',(label,'missing control hid native header',baseline)
            # Broken, split-paragraph and _blank controls must leave Edit visible.
            fallbacks={
                'missing-close':control[:control.index('<a href="#pa-next-header-closed')]+ '</p>',
                'new-window':control.replace('<a href=','<a target="_blank" href='),
                'separate-paragraphs':control.replace('</a>\n<a','</a></p><p><a'),
            }
            fallback=[]
            for name,html in fallbacks.items():
                install_control(page,html);page.wait_for_timeout(30)
                state=page.evaluate(PROBE)
                assert state['header']['y']==48 and state['style']['position']!='fixed',(label,name,'unusable trigger hid the header',state)
                fallback.append(name);remove_control(page)
            install_control(page,control)
            page.locator(f'#chart-id-{main_id}').evaluate('(node)=>node.id="test-missing-anchor"')
            assert page.evaluate(PROBE)['style']['position']!='fixed',(label,'missing parent anchor hid the header')
            page.locator('#test-missing-anchor').evaluate('(node,id)=>node.id=id',f'chart-id-{main_id}')
            fallback.append('missing-parent-anchor');remove_control(page)
            # A mixed row cannot collapse an unrelated widget.
            install_control(page,control,mixed=True);page.wait_for_timeout(50)
            assert page.locator('[data-test="header-control-row"]').bounding_box()['height']>=80
            remove_control(page);page.wait_for_timeout(80)
            baseline=page.evaluate(PROBE)
            install_control(page,control);page.wait_for_timeout(350)
            closed=page.evaluate(PROBE)
            assert closed['header']['bottom']==48 and closed['header']['h']==65,(label,closed)
            assert closed['style']['display']!='none' and closed['style']['position']=='fixed',(label,closed)
            assert closed['headerReservation']=='0px',(label,closed)
            assert abs(closed['iframe']['h']-baseline['iframe']['h']-65)<=1,(label,'collapsed header did not free 65px',baseline,closed)
            assert abs(closed['iframe']['y']-baseline['iframe']['y']+65)<=1,(label,'control row took layout space',baseline,closed)
            assert page.locator('[data-test="header-control-row"]').bounding_box()['height']==0
            assert closed['nav']==baseline['nav'] and closed['iframe']['y']>=closed['nav']['bottom']+8
            if height >= 1000:
                assert frame.evaluate('document.querySelector(".pa-next-shell").scrollHeight<=document.querySelector(".pa-next-shell").clientHeight+1'),(label,'desktop with collapsed native header should fit together')
            # The taller internal title must still leave both plots reachable
            # through actual wheel input when the external header is collapsed.
            ui.wheel_over_chart(page,frame,1000)
            analytics_at_bottom=ui.assert_canvas_fits(frame,label+' collapsed native header')
            ui.wheel_over_chart(page,frame,-1500)
            assert frame.evaluate('document.querySelector(".pa-next-shell").scrollTop')==0
            accepted=frame.evaluate('JSON.stringify(window.__paNext.accepted)');emits=page.evaluate('emits.length')
            # Native navigation menus/modals above z-index 1000 retain clicks
            # even where they overlap the otherwise invisible top-edge control.
            page.evaluate("()=>{var n=document.createElement('div');n.id='native-overlay-proof';n.style.cssText='position:fixed;left:0;right:0;top:48px;height:24px;z-index:1000;background:white';n.onclick=()=>window.nativeOverlayClicks=(window.nativeOverlayClicks||0)+1;document.body.appendChild(n)}")
            page.mouse.click(width/2,52)
            assert page.evaluate('window.nativeOverlayClicks')==1 and page.evaluate(PROBE)['header']['bottom']==48
            page.locator('#native-overlay-proof').evaluate('(node)=>node.remove()')
            # Accidental pointer motion, including a long hover, never opens it.
            page.mouse.move(width/2,52);page.wait_for_timeout(1000)
            assert page.evaluate(PROBE)['header']['bottom']==48,(label,'hover opened header')
            invisible=page.locator(open_sel).evaluate('(n)=>({height:n.getBoundingClientRect().height,color:getComputedStyle(n).color,font:getComputedStyle(n).fontSize,background:getComputedStyle(n).backgroundColor})')
            assert invisible=={'height':8,'color':'rgba(0, 0, 0, 0)','font':'0px','background':'rgba(0, 0, 0, 0)'},invisible
            page.screenshot(path=str(args.output/(label+'-closed.png')))
            page.mouse.click(width/2,52);page.wait_for_timeout(100)
            opened=page.evaluate(PROBE)
            assert page.evaluate('location.hash')==f'#chart-id-{main_id}'
            assert opened['header']['y']==48 and opened['style']['transform']=='none',(label,'click failed',opened)
            unchanged_chart(closed,opened,label)
            page.mouse.move(5,150);page.wait_for_timeout(100)
            assert page.evaluate(PROBE)['header']['y']==48,(label,'click state depended on hover')
            page.screenshot(path=str(args.output/(label+'-open.png')))
            page.mouse.click(width/2,52);page.wait_for_timeout(100)
            assert page.evaluate('location.hash')==f'#pa-next-header-closed-{main_id}'
            assert page.evaluate(PROBE)['header']['bottom']==48,(label,'second click did not close')
            unchanged_chart(closed,page.evaluate(PROBE),label)
            # Native Tab focus is a keyboard recovery path as well as the two
            # accessible Markdown links, which activate with Enter.
            page.locator('#navigation-start').focus();page.mouse.move(5,10);page.keyboard.press('Tab')
            focused=page.evaluate(PROBE)
            assert focused['focused']=='edit-dashboard' and focused['header']['y']==48,(label,'Tab cannot reach Edit',focused)
            unchanged_chart(closed,focused,label)
            page.locator(open_sel).focus();page.keyboard.press('Enter');page.wait_for_timeout(80)
            assert page.evaluate('location.hash')==f'#chart-id-{main_id}'
            page.locator('[data-test="dashboard-menu"]').click()
            item=page.locator('[data-test="native-menu-item"]');item.focus()
            page.mouse.move(width-90,135);page.wait_for_timeout(50)
            assert page.evaluate(PROBE)['header']['y']==48,(label,'menu closed the header')
            item.click();assert page.evaluate('window.menuClicks')==1
            page.locator(close_sel).focus();page.keyboard.press('Enter');page.wait_for_timeout(100)
            assert page.evaluate(PROBE)['header']['bottom']==48
            assert frame.evaluate('JSON.stringify(window.__paNext.accepted)')==accepted and page.evaluate('emits.length')==emits
            # Editing is entered through the real native action, not edit=true.
            page.locator('#navigation-start').focus();page.keyboard.press('Tab');page.keyboard.press('Enter');page.wait_for_timeout(150)
            editing=page.evaluate(PROBE)
            assert page.evaluate('window.editClicks')==1
            assert editing['style']['position']!='fixed' and editing['style']['transform']=='none' and editing['style']['clip']=='none',(label,'editing remains collapsed',editing)
            assert editing['header']['y']==48 and editing['header']['h']==65,(label,editing)
            page.mouse.move(5,150);page.locator('#navigation-start').focus();page.wait_for_timeout(60)
            assert page.evaluate(PROBE)['header']['y']==48,(label,'editing depends on hover/focus')
            assert not errors,(label,errors)
            result['cases'].append({'label':label,'viewport':[width,height],'fallbacks':fallback,'closed':closed,'opened':opened,'focused':focused,'editing':editing,'queriesAdded':0,'analyticsAtBottom':analytics_at_bottom})
            page.close();print('PASS:',label,'click toggle + keyboard + menu + Edit; fail-open; zero control row; stable chart',flush=True)
        browser.close()
    assert hashes['main']==hashlib.sha256((ui.OUT/'4. JS — весь отчёт.js').read_bytes()).hexdigest(),'JS changed during header test'
    assert hashes['css']==hashlib.sha256((ui.OUT/'9. CSS — дашборд.css').read_bytes()).hexdigest(),'CSS changed during header test'
    result['completed']=True
    (args.output/'metrics.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))


if __name__=='__main__':main()
