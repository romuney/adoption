#!/usr/bin/env python3
"""Actual SQL detail tabs keep their layout through preview and full responses.

Use the local Superset DOM/pixel-host model and ordinary scrollbars. Select the
real catalogue row via DOM click so Playwright's automatic scrollIntoView cannot
be mistaken for a layout change caused by the incoming data.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

import test_ui_viewport as viewport
from test_ui import OUT
from test_ui_preview import FILES, SQL


MEASURE = r"""() => {
  var result = {t: performance.now()};
  for (var selector of ['.pa-next-shell','.pa-next-content','.pa-next-one','.pone-overlay',
      '.pone-topbar','.pone-panel','.pone-panel-h','.pone-panel-b']) {
    var n = document.querySelector(selector), r = n.getBoundingClientRect();
    result[selector] = {x:r.x,y:r.y,w:r.width,h:r.height,client:n.clientHeight,scroll:n.scrollHeight,top:n.scrollTop};
  }
  result.kpiRows = document.querySelectorAll('.pone-top').length;
  result.gridRows = getComputedStyle(document.querySelector('.pa-next-content')).gridTemplateRows;
  result.state = document.querySelector('.pa-next-one').getAttribute('data-pa-next-state');
  result.pending = document.querySelectorAll('.pone-pend').length;
  return result;
}"""


def push_full(page, frame, script, original):
    rows = copy.deepcopy(original)
    masks = frame.evaluate('window.__paNext.masks')
    for row in rows:
        if row['section'] == 'pa_next_request':
            row['k'] = next((f['value'][0] for f in masks[row['g']]
                             if f['column'] == 'pa_next_'+row['g']+'_req'), '')
    assert [r for r in rows if r['section'] != 'pa_next_request'] == [r for r in original if r['section'] != 'pa_next_request']
    page.frame(name='one').evaluate('(payload)=>{data=payload.rows;'+script+'}', {'rows':rows})


def assert_stable(before, after, label):
    for selector in ['.pa-next-content','.pa-next-one','.pone-overlay','.pone-topbar','.pone-panel-h','.pone-panel-b']:
        for coordinate in ['x','y','w','h']:
            assert abs(after[selector][coordinate]-before[selector][coordinate]) <= 1, (label, selector, coordinate, before, after)
    assert after['gridRows'] == before['gridRows'], (label, 'implicit grid row or row resize', before, after)
    assert abs(after['.pa-next-shell']['top']-before['.pa-next-shell']['top']) <= 1, (label, 'scroll anchoring', before, after)
    assert after['kpiRows'] == 0, (label, 'temporary KPI row on a detail tab', after)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--periods', type=Path, default=Path('/tmp/pa-next-periods'))
    parser.add_argument('--fixtures', type=Path, default=Path('/tmp/pa-next-preview'))
    parser.add_argument('--output', type=Path, default=Path('/tmp/pa-next-loading-layout-results.json'))
    parser.add_argument('--screenshots', type=Path, default=Path('/tmp/pa-next-loading-layout'))
    args = parser.parse_args()
    args.screenshots.mkdir(parents=True, exist_ok=True)
    hashes = {part:hashlib.sha256((OUT/name).read_bytes()).hexdigest() for part,name in SQL.items()}
    meta = json.loads((args.fixtures/'metadata.json').read_text())
    assert meta['completed'] and meta['source_sha256'] == hashes
    assert json.loads((args.periods/'metadata.json').read_text())['source_sha256'] == hashes
    viewport.rows = {part:json.loads((args.periods/'d'/(part+'.json')).read_text()) for part in FILES}
    viewport.scripts = {part:(OUT/name).read_text() for part,name in FILES.items()}
    report = meta['periods']['d']['ids'][0]
    selected = json.loads((args.fixtures/'d'/(report+'.json')).read_text())
    result = {'completed':False,'main_sha256':hashlib.sha256(viewport.scripts['head'].encode()).hexdigest(),'cases':[]}
    args.output.write_text(json.dumps(result)+'\n')
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                    ignore_default_args=['--hide-scrollbars'])
        for width, height in [(1366,768), (1440,605)]:
            for tab in ['who','path','coh']:
                label = str(width)+'x'+str(height)+'-'+tab
                page = browser.new_page(viewport={'width':width,'height':height}, reduced_motion='reduce')
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                frame = viewport.mount(page)
                assert frame.evaluate("document.querySelector('[_echarts_instance_]').style.height.endsWith('px')")
                frame.locator('.pa-next-shell').evaluate('(n)=>n.scrollTop=n.scrollHeight')
                page.wait_for_timeout(400)
                # The bottom graph must be reachable through the shell scrollbar,
                # without a second vertical scrollbar inside Dynamics.
                dynamics = viewport.geometry(frame)
                assert dynamics['body']['scroll'] <= dynamics['body']['client']+1, (label, 'nested Dynamics scroll', dynamics)
                assert dynamics['svgs'][-1]['bottom'] <= dynamics['shell']['bottom']+1, (label, 'bottom SVG clipped after full scroll', dynamics)
                if tab == 'who':
                    page.mouse.move(10,20)
                    page.screenshot(path=str(args.screenshots/(label+'-dynamics.png')))
                frame.locator('[data-view="view:'+tab+'"]').evaluate('(n)=>n.click()')
                page.wait_for_timeout(300)
                frame.locator('.pa-next-shell').evaluate('(n)=>n.scrollTop=n.scrollHeight')
                page.wait_for_timeout(150)
                before = frame.evaluate(MEASURE)
                assert before['state'] == 'ready' and before['kpiRows'] == 0, (label,before)
                frame.evaluate('''() => {
                  window.__layoutFrames=[];window.__layoutProbe=true;
                }''')
                # Definition is test code executed by Playwright, not page eval.
                frame.evaluate('() => {window.__layoutMeasure='+MEASURE+';function tick(){if(!window.__layoutProbe)return;window.__layoutFrames.push(window.__layoutMeasure());requestAnimationFrame(tick)}requestAnimationFrame(tick)}')
                frame.locator('tr[data-rep="'+report+'"]').evaluate('(n)=>n.click()')
                frame.wait_for_selector('.pa-next-one[data-pa-next-state="preview"]')
                frame.wait_for_selector('.pone-pend')
                page.wait_for_timeout(450)
                loader = frame.locator('.pone-pend .pa-next-loading')
                loader.wait_for(state='visible', timeout=2000)
                loader_rect = loader.evaluate('(n)=>{var r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height}}')
                pending = frame.evaluate(MEASURE)
                assert_stable(before,pending,label+' preview')
                assert loader_rect['top'] >= pending['.pa-next-shell']['y'] and loader_rect['bottom'] <= pending['.pa-next-shell']['y']+pending['.pa-next-shell']['h'], (label, 'loader outside visible shell', loader_rect, pending)
                if tab == 'who':
                    page.screenshot(path=str(args.screenshots/(label+'-pending.png')))
                frame.wait_for_function('(id)=>(window.__paNext.masks.cat.find(f=>f.column==="sel_f")||{value:[]}).value[0]===id',arg=report)
                push_full(page, frame, viewport.scripts['one'], selected)
                frame.wait_for_selector('.pa-next-one[data-pa-next-state="ready"]')
                frame.wait_for_selector('.pone-pend',state='detached')
                page.wait_for_timeout(450)
                complete = frame.evaluate(MEASURE)
                assert_stable(before,complete,label+' full')
                frames = frame.evaluate('window.__layoutProbe=false;window.__layoutFrames')
                for index, sample in enumerate(frames):
                    assert_stable(before,sample,label+' frame '+str(index))
                assert not errors, errors
                result['cases'].append({'case':label,'status':'passed','frames':len(frames),'before':before,'pending':pending,'complete':complete,'dynamics':dynamics,'visible_loader':loader_rect})
                args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
                print('PASS:',label,'ready → preview → full;',len(frames),'stable frames; full-scroll Dynamics fits',flush=True)
                page.close()
        browser.close()
    assert hashlib.sha256((OUT/FILES['head']).read_bytes()).hexdigest() == result['main_sha256'], 'Generated main JS changed during the test'
    result['completed'] = True
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')


if __name__ == '__main__':
    main()
