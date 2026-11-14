#!/usr/bin/env python3
"""Composed UI controls and geometry on fixed synthetic mocks; no SQL claims."""
import copy
import json
from playwright.sync_api import sync_playwright
from test_ui import doc, rows, scripts


def mount(page, height=980):
    page.goto('about:blank')
    page.set_content('<html><body style="margin:0"><iframe name="head" sandbox="allow-scripts" style="width:100%;height:'+str(height)+'px;border:0"></iframe><iframe name="cat" sandbox="allow-scripts" style="height:2px;width:2px;opacity:0"></iframe><iframe name="one" sandbox="allow-scripts" style="height:2px;width:2px;opacity:0"></iframe><script>window.emits=[];addEventListener("message",function(e){if(e.data.type==="TEST_EMIT")emits.push(e.data)});</script></body></html>')
    for key in ['cat','one','head']:
        page.locator('iframe[name="'+key+'"]').evaluate('(el,html)=>el.srcdoc=html',doc(key,scripts[key],rows[key]))
    frame=page.frame(name='head')
    frame.wait_for_selector('.pa-next-ready')
    return frame


def main():
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
        page=browser.new_page(viewport={'width':1440,'height':1000})
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        frame=mount(page)
        # Calendar is attached to body, so the 112px composed header must not clip it.
        frame.locator('[data-pa-next-host="head"] [data-cadd="cal"]').click()
        dropdown=frame.locator('body>.phead-dd')
        bounds=dropdown.bounding_box()
        assert bounds['height']>300 and bounds['y']+bounds['height']<980,bounds
        dropdown.locator('[data-cppre="7"]').click()
        dropdown.locator('[data-cpcancel]').click()
        assert not dropdown.is_visible()
        assert page.evaluate('emits')==[]
        print('PASS: custom calendar opens beyond header, cancellation emits nothing')

        for key in ['org','stream','spec','hq','it','heads','adg']:
            frame.locator('[data-pa-next-host="head"] [data-cadd="'+key+'"]').click()
            assert dropdown.is_visible(),key
            bounds=dropdown.bounding_box()
            assert bounds['height']>=150 and bounds['y']+bounds['height']<=980,(key,bounds)
            if key=='org':
                before=dropdown.locator('[data-cack]').count()
                dropdown.locator('[data-catog]').first.click()
                assert dropdown.locator('[data-cack]').count()>before
                # In a real tree checking a parent also checks disabled children.
                dropdown.locator('[data-cack]').first.check()
                assert dropdown.locator('[data-cack]:checked').count()>0
            frame.locator('body').press('Escape')
            assert not dropdown.is_visible(),key
        assert page.evaluate('emits')==[]
        print('PASS: all seven CA dropdowns fit, nested organisation choices remain a local draft')

        titles={'cal':'Календарь посещений','path':'Путь ЦА','who':'Кто смотрит','coh':'Закрепляемость','dyn':'Динамика'}
        for key,title in titles.items():
            tab=frame.locator('[data-pa-next-host="one"] [data-view="view:'+key+'"]')
            tab.click()
            assert tab.get_attribute('aria-selected')=='true'
            assert title in frame.locator('.pone-panel-h .pone-h-ttl').inner_text()
            text=frame.locator('[data-pa-next-host="one"]').inner_text()
            assert len(text)>500 and 'NaN' not in text and 'undefined' not in text
        assert page.evaluate('emits')==[]
        print('PASS: Calendar, Path, People, Retention and Dynamics tabs switch without a query')

        catalogue=frame.locator('[data-pa-next-host="cat"]')
        search=catalogue.locator('input[data-search]')
        search.fill('zzz-no-such-report-xx')
        assert catalogue.locator('tr[data-rep]').count()==0
        assert search.evaluate('(el)=>el===document.activeElement')
        search.fill('Отчёт 12')
        assert catalogue.locator('tr[data-rep]').count()>0
        assert all('Отчёт 12' in row.inner_text() for row in catalogue.locator('tr[data-rep]').all())
        search.fill('')
        original=catalogue.locator('tr[data-rep]').first.get_attribute('data-rep')
        catalogue.locator('[data-sort="dashboard_nm"]').click()
        first=catalogue.locator('tr[data-rep]').first.get_attribute('data-rep')
        assert first!=original
        catalogue.locator('[data-action="pg-next"]').click()
        assert catalogue.locator('tr[data-rep]').first.get_attribute('data-rep')!=first
        catalogue.locator('[data-action="pg-prev"]').click()
        assert catalogue.locator('tr[data-rep]').first.get_attribute('data-rep')==first
        assert page.evaluate('emits')==[]
        print('PASS: catalogue search keeps focus; empty results, sort and pagination work locally')

        # Apply the drafted CA only now, then verify Reset clears its outgoing mask.
        frame.locator('[data-caapply]').click()
        page.wait_for_timeout(200)
        emitted=page.evaluate('emits')
        assert len(emitted)==1 and emitted[0]['part']=='head',emitted
        assert any(f['column']=='ca_org_f' and f['value'] for f in emitted[0]['mask'])
        assert frame.locator('[data-pa-next-host="cat"]').get_attribute('aria-busy')=='true'
        snapshot=frame.evaluate('window.__paNext.masks')
        frame.locator('[data-careset]').click()
        page.wait_for_timeout(200)
        emitted=page.evaluate('emits')
        assert len(emitted)==1, 'Reset must wait for both active downstream queries'
        assert frame.locator('[data-pa-next-host="one"]').get_attribute('data-pa-next-state')=='ready', 'Reset should restore the cached baseline immediately'
        for part in ('cat','one'):
            incoming=copy.deepcopy(rows[part])
            # Transport-only mock: business values are irrelevant to this control test.
            echo={f['column']:f['value'] for f in snapshot['head']}
            for row in incoming:
                if row['section']=='sj' and part=='cat':
                    value=json.loads(row['k']);value['flt']=echo;row['k']=json.dumps(value)
                if row['section']=='flt':row['k']=json.dumps(echo)
                if row['section']=='pa_next_request':row['k']=echo.get('pa_next_'+row['g']+'_req',[''])[0]
            page.frame(name=part).evaluate('(payload)=>{data=payload.rows;'+scripts[part]+'}',{'rows':incoming})
        page.wait_for_function('()=>emits.length===2')
        emitted=page.evaluate('emits')
        assert emitted[1]['part']=='head',emitted
        assert not any(f['column'].startswith('ca_') for f in emitted[1]['mask'])
        print('PASS: CA Apply emits through main once; Reset removes CA conditions')

        frame=mount(page)
        frame.locator('[data-pa-next-host="head"] [data-cadd="cal"]').click()
        frame.locator('body>.phead-dd [data-cppre="7"]').click()
        frame.locator('body>.phead-dd [data-cpapply]').click()
        page.wait_for_timeout(200)
        emitted=page.evaluate('emits')
        assert len(emitted)==1 and emitted[0]['part']=='head',emitted
        period=next(f['value'][0] for f in emitted[0]['mask'] if f['column']=='period_param')
        assert period.startswith('c|') and period.endswith('|d|7'),period
        assert not frame.locator('body>.phead-dd').is_visible()
        assert frame.locator('[data-pa-next-host="cat"]').get_attribute('aria-busy')=='true'
        assert frame.locator('[data-pa-next-host="one"]').get_attribute('aria-busy')=='true'
        print('PASS: custom seven-day Apply emits its exact period and blocks outdated sections')

        page.set_viewport_size({'width':1440,'height':800})
        frame=mount(page,1600)
        targets=frame.locator('[data-pa-next-host="cat"] tr[data-rep]')
        # Read all row positions atomically; ResizeObserver can replace a row
        # between separate Playwright resolve/getBoxModel calls after mounting.
        near_bottom=targets.evaluate_all('nodes=>nodes.filter(n=>{const r=n.getBoundingClientRect();return r.height>0&&r.top>=680&&r.top<740}).map(n=>n.getAttribute("data-rep"))')
        assert near_bottom,'No visible row near bottom for tooltip fixture'
        frame.locator('[data-pa-next-host="cat"] tr[data-rep="'+near_bottom[-1]+'"]').hover()
        page.wait_for_timeout(350)
        tip=frame.locator('body>.prb-tip')
        assert tip.is_visible()
        bounds=tip.bounding_box()
        assert bounds['y']>=0 and bounds['y']+bounds['height']<=800,(bounds,'tooltip clipped by parent viewport')
        assert page.evaluate('scrollY')==0
        print('PASS: bottom tooltip stays in visible viewport inside a taller iframe')
        assert not errors,errors
        print('PASS: zero JavaScript page errors throughout composed-control scenarios')
        browser.close()

if __name__=='__main__':
    main()
