#!/usr/bin/env python3
"""Cold-start branding, loader retransmission A/B and privacy-safe timing export."""
import argparse
import json
import statistics
import time
from pathlib import Path
from playwright.sync_api import sync_playwright
import test_ui_viewport as ui
from test_ui import doc


def run(browser, scripts, rows):
    page = browser.new_page(viewport={'width':1366,'height':768}, reduced_motion='reduce')
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content('<iframe name="head" sandbox="allow-scripts" style="width:1330px;height:720px;border:0"></iframe><iframe name="cat" sandbox="allow-scripts"></iframe><iframe name="one" sandbox="allow-scripts"></iframe><script>window.emits=[];addEventListener("message",function(e){if(e.data.type==="TEST_EMIT")emits.push(e.data)})</script>')
    watch='''window.rowMessages={cat:0,one:0};addEventListener('message',function(e){var d=e.data||{};if(d.type==='PA_NEXT_V1'&&d.kind==='ROWS')rowMessages[d.part]++;});'''
    start=time.monotonic()
    for part in ['cat','one','head']:
        page.locator('iframe[name='+part+']').evaluate('(n,h)=>n.srcdoc=h',doc(part,(watch if part=='head' else '')+scripts[part],rows[part]))
    frame=page.frame(name='head');frame.wait_for_selector('.pa-next-ready')
    ready_ms=(time.monotonic()-start)*1000
    page.wait_for_timeout(2700)
    baseline=frame.evaluate('rowMessages')
    # Deliberately exercise discovery retries without changing data or SQL.
    for part,chart in [('cat',859563),('one',859564)]:
        page.frame(name=part).evaluate('''p=>{var s=window.__paNextLoader;for(var i=0;i<25;i++)s.main.postMessage({type:'PA_NEXT_V1',v:1,channel:'proteus-adoption-next-859562',kind:'HELLO',part:p.part,chart:p.chart,to:859562,serial:s.n,instance:s.instance},'*')}''',{'part':part,'chart':chart})
    page.wait_for_timeout(300)
    after=frame.evaluate('rowMessages')
    text={part:frame.locator('[data-pa-next-host='+part+']').inner_text() for part in ['head','cat','one']}
    assert page.evaluate('emits.length')==0
    assert not errors,errors
    return page,frame,{'initialReadyLabMs':round(ready_ms,1),'discoveryMessages':baseline,'after25RetryMessages':after,'javascriptErrors':errors},text


def cold_css(browser, out, baseline_css):
    css=(ui.OUT/'9. CSS — дашборд.css').read_text()
    base='body{margin:0;background:#f6f6f6;font:14px Arial,Helvetica,sans-serif}.dashboard-header-container{height:65px}nav{height:48px}.dashboard-grid{display:flex;flex-direction:column}.dragdroppable-row{display:flex}.with-popover-menu,.grid-row{width:100%;display:flex}.dragdroppable-column{flex:1}.resizable-container{height:600px}.dashboard-chart,.chart-container{height:100%}'
    def holder(id):
        return f'<div class="dragdroppable-column"><div class="resizable-container"><div class="dashboard-component-chart-holder dashboard-chart-id-{id}"><div class="chart-slice"><div class="dashboard-chart"><div class="chart-container"><div class="slice_container"><div><div class="react_sanbbox" id="chart-id-{id}"></div></div></div><img class="loading" alt="Loading"></div></div></div></div></div></div>'
    def row(ids):
        return '<div class="dragdroppable-row"><div class="with-popover-menu"><div class="grid-row">'+''.join(holder(i) for i in ids)+'</div></div></div>'
    page=browser.new_page(viewport={'width':1366,'height':768},reduced_motion='reduce')
    page.set_content('<style>'+base+css+'</style><nav>Proteus</nav><div class="dashboard-header-container">Proteus Adoption</div><div class="dashboard-content"><div class="grid-container"><div class="dashboard-grid">'+row([859562])+row([859563,859564])+'</div></div></div>')
    panel=page.locator('.dashboard-chart-id-859562 .dashboard-chart')
    page.locator('style').evaluate('(n,css)=>n.textContent=css',base+baseline_css)
    assert 'data:image/webp' not in panel.evaluate('(n)=>getComputedStyle(n).backgroundImage'), 'Negative control already has branding'
    page.screenshot(path=str(out/'startup-before.png'))
    page.locator('style').evaluate('(n,css)=>n.textContent=css',base+css)
    assert 'data:image/webp' in panel.evaluate('(n)=>getComputedStyle(n).backgroundImage')
    assert panel.evaluate('(n)=>getComputedStyle(n,"::after").animationName')=='none'
    assert panel.evaluate('(n)=>getComputedStyle(n,"::after").content')=='""'
    assert page.locator('.dashboard-chart-id-859562 img.loading').evaluate('(n)=>getComputedStyle(n).opacity')=='0'
    page.screenshot(path=str(out/'startup-brand.png'))
    for w,h in [(1280,720),(1366,768),(1920,1080),(3440,1440),(1440,2560)]:
        page.set_viewport_size({'width':w,'height':h})
        slots=page.evaluate('''async()=>{var nodes=[859563,859564].map(id=>document.querySelector('.dashboard-component-chart-holder.dashboard-chart-id-'+id));return await Promise.all(nodes.map(n=>new Promise(resolve=>{var o=new IntersectionObserver(e=>{resolve({ratio:e[0].intersectionRatio,top:e[0].boundingClientRect.top,bottom:e[0].boundingClientRect.bottom});o.disconnect()},{threshold:.99});o.observe(n)})))}''')
        assert all(s['ratio']>=.99 for s in slots),(w,h,slots)
    panel.locator('.react_sanbbox').evaluate("n=>{var f=document.createElement('iframe');f.style.cssText='height:100%;width:100%;border:0';f.srcdoc='<body style=background:white><button>Ready</button>';n.appendChild(f)}")
    # Creating an iframe is not completion; its actual opaque paint hides the line.
    assert panel.evaluate('(n)=>getComputedStyle(n,"::after").content')=='""'
    panel.locator('iframe').content_frame.get_by_role('button',name='Ready').click()
    panel.locator('iframe').evaluate('n=>n.remove()')
    panel.locator('.chart-container').evaluate('n=>n.insertAdjacentHTML("beforeend","<div role=alert>Query failed</div>")')
    assert panel.evaluate('(n)=>getComputedStyle(n).backgroundImage')=='none'
    assert panel.get_by_role('alert').is_visible()
    page.close()


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--baseline',type=Path,required=True)
    ap.add_argument('--data-dir',type=Path,default=Path('/tmp/pa-next-people-periods/d'))
    ap.add_argument('--output',type=Path,default=Path('/tmp/pa-next-startup'))
    args=ap.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    names={'head':'4. JS — весь отчёт.js','cat':'6. JS — загрузчик каталога.js','one':'8. JS — загрузчик панели.js'}
    old={p:(args.baseline/n).read_text() for p,n in names.items()}
    new={p:(ui.OUT/n).read_text() for p,n in names.items()}
    rows={p:json.loads((args.data_dir/(p+'.json')).read_text()) for p in names}
    result={'scope':'Local synthetic rows, sandbox Chromium, no network/CPU throttling. Not production SQL latency.','runs':{}}
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
        cold_css(browser,args.output,(args.baseline/'9. CSS — дашборд.css').read_text())
        for label,scripts in [('before',old),('after',new)]:
            runs=[]
            for i in range(3):
                page,frame,stats,text=run(browser,scripts,rows)
                runs.append(stats)
                if label=='before':
                    assert stats['after25RetryMessages']['cat']>=25
                else:
                    assert stats['after25RetryMessages']==stats['discoveryMessages'],stats
                    assert text==baseline_text,'Metric/interface text changed on identical rows'
                    assert frame.evaluate('window.__paNext.performance.events.some(e=>e.name==="initial-ready")')
                    # A real dataset execution still delivers new rows and serial.
                    helper=page.frame(name='cat')
                    prior=frame.evaluate('rowMessages.cat')
                    helper.evaluate(new['cat'])
                    page.wait_for_timeout(150)
                    assert frame.evaluate('rowMessages.cat')>prior
                    assert frame.evaluate('window.__paNext.lastRows.cat.serial')==helper.evaluate('window.__paNextLoader.n')
                    # Timing recorder works from the opaque parent, without raw state.
                    page.evaluate('()=>{window.__savedFetch=fetch}')
                    page.evaluate((ui.OUT/'16. Консоль — скорость загрузки.js').read_text())
                    exported=json.loads(page.evaluate('__paNextPerf.finish()'))
                    assert exported['report'] and exported['report'][0]['performance']['events']
                    serialized=json.dumps(exported)
                    for forbidden in ['ca_login_f','ca_master_f','pa_next_version','SELECT ','Authorization']:
                        assert forbidden not in serialized, forbidden
                    assert page.evaluate('fetch===window.__savedFetch'), 'Recorder failed to restore fetch'
                    (args.output/'diagnostic-sample.json').write_text(json.dumps(exported,ensure_ascii=False,indent=2)+'\n')
                baseline_text=text
                page.close()
            result['runs'][label]={'samples':runs,'medianInitialReadyLabMs':statistics.median(x['initialReadyLabMs'] for x in runs),'rangeInitialReadyLabMs':[min(x['initialReadyLabMs'] for x in runs),max(x['initialReadyLabMs'] for x in runs)]}
        for label, scripts in [('new-main-old-loaders',dict(old,head=new['head'])),('old-main-new-loaders',dict(new,head=old['head']))]:
            page,frame,stats,text=run(browser,scripts,rows)
            assert text==baseline_text, label
            result[label]=stats
            page.close()
        browser.close()
    (args.output/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print('PASS cold CSS before iframe, errors/edit access, visible helper IO, 3+3 baseline runs, identical rendered data, discovery payload suppression, fresh serial and diagnostic privacy')
    print(json.dumps(result,ensure_ascii=False))


if __name__=='__main__':main()
