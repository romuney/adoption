#!/usr/bin/env python3
"""One loading surface covers all unavailable analytics, including KPI/insights."""
import argparse
import copy
import hashlib
import json
from pathlib import Path

from playwright.sync_api import sync_playwright
import test_ui_viewport as ui
from test_ui_preview import FILES, SQL
from test_ui import OUT


MEASURE = r'''() => {
  function rect(n){if(!n)return null;var r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom,right:r.right};}
  var region=document.querySelector('.pa-next-one'),root=region.querySelector('.pone-root'),
    cover=root.querySelector(':scope > .pa-next-wait'),tabs=root.querySelector('.pone-topbar'),
    first=root.querySelector('.pone-top')||root.querySelector('.pone-panel');
  return {state:region.dataset.paNextState,cover:rect(cover),tabs:rect(tabs),first:rect(first),root:rect(root),
    shellScroll:document.querySelector('.pa-next-shell').scrollTop,
    panel:rect(root.querySelector('.pone-panel')),kpi:rect(root.querySelector('.pone-kpis')),obs:rect(root.querySelector('.pone-obs')),
    loaders:region.querySelectorAll('.pa-next-wait').length,
    loaderVisible:!!cover&&getComputedStyle(cover.querySelector('.pa-next-loading')).visibility==='visible',
    staleVisible:Array.from(root.querySelectorAll('.pone-k-val,.pone-obs-lead,svg[data-dyn-svg]')).filter(n=>getComputedStyle(n).visibility!=='hidden').length,
    staleAccessible:Array.from(root.querySelectorAll('.pone-top,.pone-panel')).some(n=>!n.inert||n.getAttribute('aria-hidden')!=='true'),
    tabsInert:!!tabs.closest('[inert]')};
}'''


def assert_cover(sample, label):
    assert sample['state'] == 'loading', (label, sample)
    assert sample['loaders'] == 1 and sample['cover'], (label, 'analytics have no single shared loading surface', sample)
    assert sample['loaderVisible'], (label, 'loading surface is empty', sample)
    assert not sample['staleVisible'] and not sample['staleAccessible'], (label, 'stale data exposed', sample)
    assert not sample['tabsInert'], (label, 'tabs blocked', sample)
    cover, first, tabs, panel = (sample[k] for k in ['cover','first','tabs','panel'])
    assert tabs['bottom'] <= cover['y'] <= first['y'] + 1, (label, 'gap above KPI or covered tabs', sample)
    assert cover['bottom'] >= panel['bottom'] - 1, (label, 'chart outside loading surface', sample)
    for key in ['kpi','obs','panel']:
        box = sample[key]
        if box:
            assert cover['x'] <= box['x'] + 1 and cover['right'] >= box['right'] - 1, (label, key, sample)
            assert cover['y'] <= box['y'] + 1 and cover['bottom'] >= box['bottom'] - 1, (label, key, sample)


def stable(before, after):
    for key in ['tabs','root','panel','kpi','obs']:
        if before[key] and after[key]:
            assert all(abs(before[key][axis] - after[key][axis]) <= 1 for axis in ['x','y','w','h']), (key,before,after)
    assert before['shellScroll'] == after['shellScroll'], (before, after)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--main',type=Path,help='Previous delivery for a negative regression check')
    ap.add_argument('--output',type=Path,default=Path('/tmp/pa-next-common-loading-results.json'))
    ap.add_argument('--screenshots',type=Path,default=Path('/tmp/pa-next-common-loading'))
    args = ap.parse_args()
    args.screenshots.mkdir(parents=True,exist_ok=True)
    meta = json.loads(Path('/tmp/pa-next-periods/metadata.json').read_text())
    assert meta['source_sha256'] == {p:hashlib.sha256((OUT/n).read_bytes()).hexdigest() for p,n in SQL.items()}
    periods = {g:{part:json.loads(Path('/tmp/pa-next-periods',g,part+'.json').read_text()) for part in FILES} for g in ['d','m']}
    ui.rows = periods['d']
    if args.main:
        ui.scripts['head'] = args.main.read_text()
    sha = hashlib.sha256(ui.scripts['head'].encode()).hexdigest()
    result = {'completed':False,'main_sha256':sha,'cases':[]}
    args.output.write_text(json.dumps(result)+'\n')
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,ignore_default_args=['--hide-scrollbars'])
        for width,height in [(1920,1080),(1366,768)]:
            page = browser.new_page(viewport={'width':width,'height':height},reduced_motion='reduce')
            errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            frame = ui.mount(page)
            frame.evaluate('window.__loadingMeasure='+MEASURE)
            before = frame.evaluate(MEASURE)
            frame.locator('[data-grain="m"]').evaluate('(n)=>n.click()')
            immediate = frame.evaluate(MEASURE)
            assert_cover(immediate,'immediate month selection')
            stable(before,immediate)
            frames = frame.evaluate('''() => new Promise(resolve=>{
              var samples=[],end=performance.now()+600;
              function tick(){samples.push(window.__loadingMeasure());if(performance.now()<end)requestAnimationFrame(tick);else resolve(samples)}
              requestAnimationFrame(tick);
            })''')
            for sample in frames:
                assert_cover(sample,'pending frame')
                stable(before,sample)
            page.screenshot(path=str(args.screenshots/(str(width)+'-period-loading.png')))
            # Rerunning the actual delivery and resizing must retain a complete
            # cover synchronously, rather than flashing an empty KPI region.
            frame.evaluate(ui.scripts['head'])
            assert_cover(frame.evaluate(MEASURE),'main rerun')
            stable(before,frame.evaluate(MEASURE))
            frame.get_by_role('separator',name='Ширина каталога').press('Home')
            assert_cover(frame.evaluate(MEASURE),'splitter resize')
            for tab in ['cal','who','path','coh','dyn']:
                frame.locator('[data-view="view:'+tab+'"]').click()
                assert_cover(frame.evaluate(MEASURE),'pending '+tab)
            frame.wait_for_function('()=>(window.__paNext.masks.head.find(f=>f.column==="period_param")||{value:[]}).value[0]==="m"')
            # Complete with genuine monthly SQL responses; only transport
            # nonces are replaced, never metric rows or filter echoes.
            masks = frame.evaluate('window.__paNext.masks')
            for part in ['cat','one']:
                incoming = copy.deepcopy(periods['m'][part])
                for row in incoming:
                    if row['section']=='pa_next_request':
                        row['k']=next((f['value'][0] for f in masks[row['g']] if f['column']=='pa_next_'+row['g']+'_req'),'')
                page.frame(name=part).evaluate('(payload)=>{data=payload.rows;'+ui.scripts[part]+'}',{'rows':incoming})
            frame.wait_for_selector('.pa-next-ready')
            assert frame.locator('.pa-next-one .pa-next-wait').count()==0
            assert frame.locator('.pone-k-val').first.is_visible()
            assert frame.locator('.pone-obs').is_visible()
            # Both completed periods restore ready KPI/insights immediately.
            # The normal header refresh/transport is independent of this cover.
            for grain in ['d','m','d']:
                frame.locator('[data-grain="'+grain+'"]').evaluate('(n)=>n.click()')
                assert frame.evaluate(MEASURE)['state'] == 'ready'
                frame.wait_for_selector('.pa-next-ready')
                assert frame.locator('.pa-next-one .pa-next-wait').count()==0
            # Actual calendar controls: two visible months, aggregated monthly.
            frame = ui.mount(page)
            frame.locator('[data-cadd="cal"]').click()
            days=frame.locator('[data-cpday]').evaluate_all('(nodes)=>nodes.map(n=>+n.dataset.cpday)')
            frame.locator('[data-cpday="'+str(min(days))+'"]').click()
            frame.locator('[data-cpday="'+str(max(days))+'"]').click()
            frame.locator('[data-cpstep="m"]').click()
            frame.locator('[data-cpapply]').click()
            assert_cover(frame.evaluate(MEASURE),'custom two months')
            frame.wait_for_function('()=>{var p=(window.__paNext.masks.head.find(f=>f.column==="period_param")||{value:[]}).value[0]||"";return p.startsWith("c|")&&p.endsWith("|m|2")}')
            page.wait_for_timeout(450)
            page.screenshot(path=str(args.screenshots/(str(width)+'-two-months-loading.png')))
            assert not errors,errors
            result['cases'].append({'viewport':[width,height],'frames':len(frames),'initial':before,'pending':immediate,
                                    'two_months':frame.evaluate(MEASURE),'cache_covers':0,'errors':errors})
            print('PASS:',width,height,'one cover including KPI/insights; two months, tabs, rerun, resize, SQL completion and cache',flush=True)
            page.close()
        browser.close()
    if not args.main:
        assert hashlib.sha256((OUT/FILES['head']).read_bytes()).hexdigest() == sha
    result['completed']=True
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')


if __name__=='__main__':
    main()
