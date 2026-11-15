#!/usr/bin/env python3
"""Browser transport/UX test on synthetic repository mocks; never claims SQL equivalence."""
import copy,json,re,time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'Параллельный отчёт — pa_next'
VERSION={'section':'pa_next_version','g':'','k':'synthetic-run-A','parent':'ready','n':1}
paths={'head':'.stand/mocks_audbar/head.json','cat':'.stand/mocks_audbar/cat_ca.json','one':'.stand/mocks_audbar/one.json'}
rows={k:json.loads((ROOT/v).read_text())+[dict(VERSION,g=k)]+[{'section':'pa_next_request','g':s,'k':'','parent':'','n':0} for s in ['head','cat','one']] for k,v in paths.items()}
scripts={'head':(OUT/'4. JS — весь отчёт.js').read_text(),'cat':(OUT/'6. JS — загрузчик каталога.js').read_text(),'one':(OUT/'8. JS — загрузчик панели.js').read_text()}

def doc(key,code,data):
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="connect-src \'none\'; img-src data:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'"><style>html,body{height:100%;margin:0}div[_echarts_instance_]{height:100%;position:relative}</style></head><body><div _echarts_instance_="ec"><canvas></canvas></div><script>var data='+json.dumps(data,ensure_ascii=False)+'; var option; window.applyCrossFilter=function(mask){parent.postMessage({type:"TEST_EMIT",part:'+json.dumps(key)+',mask:mask},"*");};</script><script>'+code.replace('</script','<\\/script')+'</script></body></html>'

def response_for(part, masks, grain):
    """Transport-only mock tied to a captured request, never current delivery time."""
    updated=copy.deepcopy(rows[part])
    sources=['head','cat' if part=='one' else 'one']
    echo={item['column']:item['value'] for source in sources for item in masks[source]
          if not item['column'].startswith('pa_next_') and item['column']!='pa_nonce'}
    for row in updated:
        if part=='cat' and row['section']=='sj':
            value=json.loads(row['k']);value['flt']=echo;value['period']=grain;row['k']=json.dumps(value)
        if part=='one' and row['section']=='flt':row['k']=json.dumps(echo)
        if row['section']=='pa_next_request':
            row['k']=next((item['value'][0] for item in masks[row['g']] if item['column']=='pa_next_'+row['g']+'_req'),'')
    return updated

def main():
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
        page=browser.new_page(viewport={'width':1600,'height':1100})
        errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
        page.set_content('<html><body style="margin:0"><iframe name="head" sandbox="allow-scripts" style="width:100%;height:1080px;border:0"></iframe><iframe name="cat" sandbox="allow-scripts" style="height:2px;width:2px;opacity:0"></iframe><iframe name="one" sandbox="allow-scripts" style="height:2px;width:2px;opacity:0"></iframe><script>window.emits=[];addEventListener("message",function(e){if(e.data.type==="TEST_EMIT")emits.push(e.data)});</script></body></html>')
        for key in ['cat','one','head']:
            page.locator('iframe[name="'+key+'"]').evaluate('(el,html)=>el.srcdoc=html',doc(key,scripts[key],rows[key]))
        frame=page.frame(name='head')
        frame.wait_for_selector('.pa-next-ready',timeout=30000)
        assert not errors,errors
        for part in ['head','cat','one']:
            text=frame.locator('[data-pa-next-host="'+part+'"]').inner_text()
            assert len(text)>50,(part,text)
            assert 'Ошибка графика' not in text and 'undefined' not in text and 'NaN' not in text, (part,text[:1200])
        print('PASS: all three source renderers mounted in one sandbox, no runtime errors')
        for width in [1280,1440,1600,1920]:
            page.set_viewport_size({'width':width,'height':1100});page.wait_for_timeout(200)
            assert frame.evaluate('document.documentElement.scrollWidth <= innerWidth'),width
        print('PASS: report has no horizontal page overflow at 1280/1440/1600/1920')
        screenshot='/tmp/pa-next-ui-default.png';page.screenshot(path=screenshot)
        # Help via the public internal command that the header sends.
        # The main bus intercepts this command; directly invoke header control instead below.
        candidates=frame.locator('button').all_text_contents()
        help_buttons=frame.get_by_text('Как работать',exact=False)
        assert help_buttons.count()>0, 'help control missing'
        if help_buttons.count():
            help_buttons.first.click()
            frame.locator('.pa-next-help').wait_for(state='visible')
            frame.locator('.pa-next-help [data-tour-route=audience]').press('Escape')
            assert frame.locator('.pa-next-help').count()==0
        print('PASS: accessible help opens and closes with Escape')
        # Old production messages must not mutate wrapped renderer states.
        before=frame.evaluate('JSON.stringify(window.__pvtState)') if False else frame.locator('[data-pa-next-host="cat"]').inner_text()
        frame.evaluate("window.dispatchEvent(new MessageEvent('message',{data:{type:'PA_SEL',src:'strip',sheet:'*',cols:['period_param'],key:'period_param=m'}}))")
        assert frame.locator('[data-pa-next-host="cat"]').inner_text()==before
        print('PASS: original PA_* channel cannot alter pa_next UI')
        # Malformed and foreign-generation responses do not replace accepted data.
        helper=page.frame(name='cat')
        foreign=[dict(r) for r in rows['cat']]
        next(r for r in foreign if r['section']=='pa_next_version')['k']='synthetic-run-B'
        helper.evaluate('(payload)=>{data=payload.rows;'+scripts['cat']+'}',{'rows':foreign})
        page.wait_for_timeout(150)
        assert frame.evaluate('window.__paNext.accepted.cat.generation')=='synthetic-run-A'
        assert 'разным загрузкам' in frame.locator('.pa-next-status').inner_text()
        assert 'принудительно обнови все чарты' in frame.locator('.pa-next-status').inner_text()
        assert 'обычная перезагрузка страницы может сохранить кэш' in frame.locator('.pa-next-status').inner_text()
        assert frame.locator('[data-pa-next-host="cat"]').get_attribute('aria-busy')=='true'
        assert frame.locator('.prb-overlay').evaluate('(el)=>el.inert && el.getAttribute("aria-hidden")=="true"')
        print('PASS: cached old HEAD + fresh helper generation is blocked with forced-refresh guidance')
        helper.evaluate('(payload)=>{data=payload.rows;'+scripts['cat']+'}',{'rows':rows['cat']})
        frame.wait_for_selector('.pa-next-ready')
        # Header period change must emit only from main. Real results arrive later; do not show stale numbers.
        period=frame.locator('[data-pa-next-host="head"] [data-grain="m"]')
        if not period.count(): period=frame.get_by_text('12 месяцев',exact=True)
        assert period.count(), 'period button missing'
        page.evaluate('emits=[]')
        period.first.click();page.wait_for_timeout(300)
        emitted=page.evaluate('emits')
        assert emitted and {x['part'] for x in emitted}=={'head'},emitted
        assert frame.locator('[data-pa-next-host="cat"]').get_attribute('aria-busy')=='true'
        assert frame.locator('[data-pa-next-host="one"]').get_attribute('aria-busy')=='true'
        assert not frame.locator('.pone-overlay').evaluate('(el)=>el.inert')
        assert frame.locator('.pone-panel-b').evaluate('(el)=>!!el.closest("[inert][aria-hidden=true]") && getComputedStyle(el).visibility==="hidden"')
        assert frame.locator('.pone-vtabs').is_visible()
        # One visible loader covers KPI, observations and the chart immediately.
        # There is no blank KPI region during the old400ms spinner grace period.
        assert frame.locator('.pone-root > .pa-next-analysis-wait .pa-next-progress').is_visible()
        helper.evaluate('(payload)=>{data=payload.rows;'+scripts['cat']+'}',{'rows':rows['cat']})
        page.wait_for_timeout(100)
        assert frame.locator('[data-pa-next-host="cat"]').get_attribute('aria-busy')=='true'
        print('PASS: header emits through main only; stale metrics hidden while tabs remain available')
        # Recover by returning current echo; no numerical calculation is simulated here.
        masks=frame.evaluate('window.__paNext.masks')
        valid_by_part={}
        for part in ['cat','one']:
            updated=response_for(part,masks,'m')
            valid_by_part[part]=updated
            page.frame(name=part).evaluate('(payload)=>{data=payload.rows;'+scripts[part]+'}',{'rows':updated})
        frame.wait_for_selector('.pa-next-ready')
        print('PASS: matching full filter echoes and request nonce unlock both regions')
        # A -> B -> A: exact cached A can display while B remains outstanding.
        # A's old response must never complete B or the subsequent A request.
        cached_text=frame.locator('.pone-kpis').inner_text()
        frame.locator('[data-pa-next-host="head"] [data-grain="w"]').click()
        w_masks=frame.evaluate('window.__paNext.masks')
        w_rows={part:response_for(part,w_masks,'w') for part in ['cat','one']}
        w_flights=frame.evaluate('JSON.stringify(window.__paNext.flight)')
        frame.locator('[data-pa-next-host="head"] [data-grain="m"]').click()
        for part in ['cat','one']:
            page.frame(name=part).evaluate('(payload)=>{data=payload.rows;'+scripts[part]+'}',{'rows':valid_by_part[part]})
        page.wait_for_timeout(150)
        frame.wait_for_selector('.pa-next-ready')
        assert frame.locator('.pone-kpis').inner_text()==cached_text
        assert frame.evaluate('JSON.stringify(window.__paNext.flight)')==w_flights
        for part in ['cat','one']:
            page.frame(name=part).evaluate('(payload)=>{data=payload.rows;'+scripts[part]+'}',{'rows':w_rows[part]})
        frame.wait_for_function('()=>window.__paNext.masks.head.some(f=>f.column==="period_param"&&f.value[0]==="m")')
        masks=frame.evaluate('window.__paNext.masks')
        m_flights=frame.evaluate('JSON.stringify(window.__paNext.flight)')
        for part in ['cat','one']:
            page.frame(name=part).evaluate('(payload)=>{data=payload.rows;'+scripts[part]+'}',{'rows':valid_by_part[part]})
        page.wait_for_timeout(100)
        assert frame.evaluate('JSON.stringify(window.__paNext.flight)')==m_flights
        assert frame.locator('.pone-kpis').inner_text()==cached_text
        for part in ['cat','one']:
            valid_by_part[part]=response_for(part,masks,'m')
            page.frame(name=part).evaluate('(payload)=>{data=payload.rows;'+scripts[part]+'}',{'rows':valid_by_part[part]})
        frame.wait_for_selector('.pa-next-ready')
        frame.wait_for_function('()=>Object.keys(window.__paNext.flight).length===0')
        print('PASS: A-B-A restores exact cached A; obsolete nonces cannot complete either live request')
        old_instance=frame.evaluate('window.__paNext.instances.cat')
        updated_cat=valid_by_part['cat']
        page.locator('iframe[name="cat"]').evaluate('(el,html)=>el.srcdoc=html',doc('cat',scripts['cat'],updated_cat))
        page.wait_for_timeout(300)
        assert frame.evaluate('window.__paNext.instances.cat')!=old_instance
        assert frame.evaluate('window.__paNext.serial.cat')==1
        assert frame.locator('[data-pa-next-host="cat"]').get_attribute('aria-busy')=='false'
        print('PASS: real helper iframe remount resets serial without accepting retired instance')
        assert not errors,errors
        # A genuinely new main window must not show helper responses from retained filters.
        page.locator('iframe[name="head"]').evaluate('(el,html)=>el.srcdoc=html',doc('head',scripts['head'],rows['head']))
        page.wait_for_timeout(400)
        frame=page.frame(name='head')
        assert frame.locator('[data-pa-next-host="cat"]').get_attribute('aria-busy')=='true'
        assert 'Сбрось фильтры' in frame.locator('.pa-next-status').inner_text()
        print('PASS: new main iframe rejects retained nondefault helper filters with explicit recovery instructions')
        print('PASS: zero JavaScript errors; screenshot '+screenshot)
        # Fresh board: actual keyboard catalogue selection and people-frequency click.
        page.goto('about:blank')
        page.set_content('<html><body><iframe name="head" sandbox="allow-scripts" style="width:1600px;height:1080px"></iframe><iframe name="cat" sandbox="allow-scripts"></iframe><iframe name="one" sandbox="allow-scripts"></iframe><script>window.emits=[];addEventListener("message",function(e){if(e.data.type==="TEST_EMIT")emits.push(e.data)});</script></body></html>')
        for key in ['cat','one','head']:
            page.locator('iframe[name="'+key+'"]').evaluate('(el,html)=>el.srcdoc=html',doc(key,scripts[key],rows[key]))
        frame=page.frame(name='head');frame.wait_for_selector('.pa-next-ready')
        page.evaluate('emits=[]')
        row=frame.locator('[data-pa-next-host="cat"] tr[data-rep]').first
        row.focus();row.press('Enter');page.wait_for_timeout(450)
        emitted=page.evaluate('emits')
        assert len(emitted)==1 and emitted[0]['part']=='cat',emitted
        assert any(f['column']=='sel_f' for f in emitted[0]['mask'])
        assert frame.locator('[data-pa-next-host="cat"]').get_attribute('aria-busy')=='false'
        assert frame.locator('[data-pa-next-host="one"]').get_attribute('aria-busy')=='true'
        print('PASS: Enter on catalogue row emits exactly once through catalogue helper; only panel waits')
        masks=frame.evaluate('window.__paNext.masks')
        panel_rows=[dict(r) for r in rows['one']]
        echo={x['column']:x['value'] for x in masks['head']+masks['cat']}
        for r in panel_rows:
            if r['section']=='flt':r['k']=json.dumps(echo)
            if r['section']=='pa_next_request':r['k']=echo.get('pa_next_'+r['g']+'_req',[''])[0]
        page.frame(name='one').evaluate('(payload)=>{data=payload.rows;'+scripts['one']+'}',{'rows':panel_rows})
        frame.wait_for_selector('.pa-next-ready')
        page.evaluate('emits=[]')
        frame.locator('[data-pa-next-host="one"] [data-view="view:who"]').click()
        freq=frame.locator('[data-pa-next-host="one"] [data-freq]').first
        assert freq.count()==1
        freq.click();page.wait_for_timeout(350)
        emitted=page.evaluate('emits')
        assert len(emitted)==1 and emitted[0]['part']=='one',emitted
        assert any(f['column']=='freq_f' for f in emitted[0]['mask'])
        assert frame.locator('[data-pa-next-host="cat"]').get_attribute('aria-busy')=='true'
        assert frame.locator('[data-pa-next-host="one"]').get_attribute('aria-busy')=='false'
        print('PASS: people frequency emits once through panel helper; only catalogue waits')
        assert not errors,errors
        browser.close()
if __name__=='__main__':main()
