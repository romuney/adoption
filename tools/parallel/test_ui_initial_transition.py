#!/usr/bin/env python3
"""Film cold loading stages, including missing holders and transparent iframes."""
import argparse
import hashlib
import io
import json
import subprocess
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright
from test_ui_header_reveal import render_markdown
from header_reveal import header_control_markdown

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'Параллельный отчёт — pa_next'
PREVIOUS='1c11f9c'
CONTROL=render_markdown(header_control_markdown(859562),Path('/tmp/pa-next-markdown-render/node_modules'))['html']['plain']
BASE='''html,body{margin:0;height:100%;overflow:hidden;font:14px Arial,Helvetica,sans-serif;background:#f6f6f6}.board-scroller{height:calc(100vh - 48px);overflow:auto}
#nav{height:48px;background:white}.dashboard-header-container{height:65px;background:white;display:flex;align-items:center;justify-content:space-between}
.grid-container{margin:16px 24px}.grid-row,.dragdroppable-row{display:flex;width:100%}.dragdroppable-column{width:100%}.with-popover-menu{width:100%}
.resizable-container{height:520px}.dashboard-chart,.chart-container,.chart-slice,.slice_container,.slice_container>div,.react_sanbbox{height:100%}iframe{width:100%;height:100%;border:0}
'''
HOLDER='''<div class="dragdroppable-row"><div class="with-popover-menu"><div class="grid-row"><div class="dragdroppable-column"><div class="resizable-container"><div class="dashboard-component-chart-holder dashboard-chart-id-859562"><div class="chart-slice"><div class="dashboard-chart"><div class="chart-container"><div class="slice_container"><div><div class="react_sanbbox" id="mount"></div></div></div></div></div></div></div></div></div></div></div></div>'''


def markup(css,scope,controls=True):
    if scope:
        prefix,helper=css.split('/* Optional native-header control',1)
        css='@scope ('+scope+') {'+prefix.replace('body:',':scope:')+'/* Optional native-header control'+helper+'}'
    control=CONTROL if controls else ''
    return '<!doctype html><style>'+BASE+'</style><style id="delivery">'+css+'</style><nav id="nav">Proteus</nav><div id="app"><div class="board-scroller dashboard-container"><div class="dashboard-header-container"><h1>Штатная шапка</h1><button data-edit>Редактировать</button></div><div class="dashboard-content"><div class="grid-container"><div class="dashboard-grid"><div id="control">'+control+'</div></div></div></div></div></div>'


def state(page):
    return page.evaluate('''()=>{var n=document.querySelector('.dashboard-chart'),h=document.querySelector('.dashboard-header-container'),r=h.getBoundingClientRect();var s=n&&getComputedStyle(n,'::after');return {headerBottom:r.bottom,headerPosition:getComputedStyle(h).position,bodyWidth:document.documentElement.clientWidth,boardWidth:document.querySelector('.board-scroller').clientWidth,bar:s?{content:s.content,x:s.left,y:s.top,width:s.width,height:s.height,animation:s.animationName,opacity:s.opacity}:null}}''')


def pixels(page):
    w,h=page.viewport_size.values()
    image=Image.open(io.BytesIO(page.screenshot())).convert('RGB')
    # Fixed viewport centre +24px below the top-level48px navigation midpoint.
    left,top=int(w/2-145),int(h/2+24-38)
    region=image.crop((left,top,left+290,top+76))
    points=[]
    for y in range(region.height):
        for x in range(region.width):
            r,g,b=region.getpixel((x,y))
            if max(r,g,b)-min(r,g,b)>18 or max(r,g,b)<215:points.append((left+x,top+y))
    logo=None if not points else [min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)]
    y=int(h/2+68)
    line=sum(1 for x in range(int(w/2-56),int(w/2+56)) if image.getpixel((x,y))[2]-image.getpixel((x,y))[0]>10)
    return {'logo':logo,'lineBluePixels':line}


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--output',type=Path,default=Path('/tmp/pa-next-initial-transition'))
    args=ap.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    css=(OUT/'9. CSS — дашборд.css').read_text()
    before=subprocess.check_output(['git','show',PREVIOUS+':Параллельный отчёт — pa_next/9. CSS — дашборд.css'],text=True)
    results={'scope':'Local Chromium staged DOM with real delivered CSS and actual Markdown; not a production recording','negative':[],'cases':[]}
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,ignore_default_args=['--hide-scrollbars'])
        for source,label in [(before,'before'),(css,'after')]:
            for scope in [None,'#app','.dashboard-container']:
                for width,height in ([(1366,768)] if label=='before' else [(1280,720),(1366,768),(1920,1080),(3440,1440),(1440,2560)]):
                    page=browser.new_page(viewport={'width':width,'height':height},reduced_motion='reduce')
                    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                    page.set_content(markup(source,scope))
                    early=state(page)
                    if label=='after':assert early['headerBottom']==48,('header flashed before holder',scope,early)
                    else:assert early['headerBottom']==113,early
                    page.locator('.dashboard-grid').evaluate('(n,h)=>n.insertAdjacentHTML("beforeend",h)',HOLDER)
                    page.wait_for_timeout(40)
                    page.locator('.chart-container').evaluate('n=>n.insertAdjacentHTML("beforeend","<div data-test=loading-indicator>Loading</div>")')
                    stages=[{'name':'native-loading','state':state(page),'pixels':pixels(page)}]
                    # Iframe exists well before its JS/data paint. Native markers disappear.
                    page.locator('#mount').evaluate("n=>{var f=document.createElement('iframe');f.sandbox='allow-scripts';f.srcdoc='<html style=height:100%><body style=margin:0;height:100%;background:transparent></body></html>';n.appendChild(f)}")
                    page.locator('[data-test=loading-indicator]').evaluate('n=>n.remove()')
                    page.wait_for_timeout(50)
                    stages.append({'name':'transparent-iframe','state':state(page),'pixels':pixels(page)})
                    # Match the horizontal shift seen when the scrollbar vanishes.
                    page.locator('.board-scroller').evaluate('n=>n.style.overflowY="scroll"')
                    page.locator('.grid-container').evaluate('n=>n.style.marginRight="40px"')
                    page.wait_for_timeout(50)
                    stages.append({'name':'narrow-container-and-scrollbar','state':state(page),'pixels':pixels(page)})
                    page.locator('.board-scroller').evaluate('n=>n.style.overflowY="auto"')
                    page.locator('.grid-container').evaluate('n=>n.style.marginRight="24px"')
                    page.wait_for_timeout(50)
                    stages.append({'name':'final-width','state':state(page),'pixels':pixels(page)})
                    if label=='after':
                        first=stages[0]['pixels']
                        assert first['logo'] and first['lineBluePixels']>20,stages
                        for stage in stages:
                            assert stage['state']['headerBottom']==48,stage
                            assert stage['pixels']['logo']==first['logo'],('logo moved',scope,width,stage,first)
                            assert stage['pixels']['lineBluePixels']>20,('line disappeared',stage)
                            assert stage['state']['bar']['animation']=='none'
                        # Native controls work even before any real chart JS exists.
                        page.mouse.click(width-80,52)
                        page.wait_for_function('location.hash==="#app"',timeout=2500)
                        assert state(page)['headerPosition']=='relative'
                        page.locator('[data-edit]').focus()
                        assert state(page)['headerPosition']=='relative'
                        page.mouse.click(width-80,80)
                        try:
                            page.wait_for_function('location.hash==="#pa-next-header-closed-859562"&&document.querySelector(".dashboard-header-container").getBoundingClientRect().bottom===48',timeout=2500)
                        except Exception:
                            print('CLOSE FAILURE',scope,width,height,state(page),page.evaluate('({hash:location.hash,active:document.activeElement.outerHTML,hit:document.elementFromPoint(innerWidth-80,80).outerHTML})'),flush=True)
                            page.screenshot(path=str(args.output/'close-failure.png'))
                            raise
                        assert state(page)['headerBottom']==48,(scope,width,state(page))
                        if width==1366 and scope is None:page.screenshot(path=str(args.output/'stable-before-paint.png'))
                        page.locator('iframe').evaluate("n=>n.srcdoc='<html style=height:100%><body style=margin:0;height:100%;background:white><button style=margin:20px>Report ready</button></body></html>'")
                        page.locator('iframe').content_frame.get_by_role('button',name='Report ready').click()
                        assert pixels(page)['lineBluePixels']==0,'Boot line painted over report'
                        assert pixels(page)['logo'] is None,'Boot logo painted over report'
                        page.locator('iframe').evaluate('n=>n.remove()')
                        page.locator('.chart-container').evaluate('n=>n.insertAdjacentHTML("beforeend","<div role=alert>Query failed</div>")')
                        assert page.locator('[role=alert]').is_visible()
                        assert state(page)['bar']['content']=='none'
                        assert not errors,errors
                        results['cases'].append({'scopeRoot':scope,'viewport':[width,height],'early':early,'stages':stages})
                    else:
                        assert stages[1]['state']['bar']['content']=='none','Negative failed: previous code kept line'
                        results['negative'].append({'scopeRoot':scope,'early':early,'stages':stages})
                    print('PASS',label,scope,width,height,flush=True)
                    page.close()
        # Normal motion: the line animates during the transparent-iframe phase.
        page=browser.new_page(viewport={'width':1366,'height':768},reduced_motion='no-preference')
        page.set_content(markup(css,None));page.locator('.dashboard-grid').evaluate('(n,h)=>n.insertAdjacentHTML("beforeend",h)',HOLDER)
        a=state(page)['bar'];page.wait_for_timeout(350);b=state(page)['bar']
        assert a['animation']=='pa-next-boot-progress' and a['opacity']!=b['opacity'],(a,b)
        assert {k:a[k] for k in ['x','y','width','height']}=={k:b[k] for k in ['x','y','width','height']}
        page.close()
        # Broken/no control never hides the native header.
        page=browser.new_page(viewport={'width':1366,'height':768})
        page.set_content(markup(css,None,controls=False));assert state(page)['headerBottom']==113
        page.close();browser.close()
    results['css_sha256']=hashlib.sha256(css.encode()).hexdigest()
    (args.output/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
    print('PASS native header before holder; actual logo pixels stable through scrollbar/width/iframe stages; persistent animated line, reduced motion, report/error/edit access; 15 desktop/scope cases + 3 negative controls')


if __name__=='__main__':main()
