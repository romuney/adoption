#!/usr/bin/env python3
"""Actual-SQL browser regression for the isolated report's progressive preview."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
from test_ui import ROOT, OUT, doc
from test_ui_periods import expected_series

FILES = {'head':'4. JS — весь отчёт.js','cat':'6. JS — загрузчик каталога.js','one':'8. JS — загрузчик панели.js'}
SQL = {'head':'3. SQL — шапка.sql','cat':'5. SQL — каталог.sql','one':'7. SQL — панель.sql'}
ONE = '[data-pa-next-host="one"]'
CAT = '[data-pa-next-host="cat"]'


class Board:
    def __init__(self, browser, scripts, periods, grain='d'):
        self.scripts, self.periods = scripts, periods
        self.page = browser.new_page(viewport={'width':1600,'height':1100}, reduced_motion='reduce')
        self.errors = []
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.page.set_content('<html><body style="margin:0"><iframe name="head" sandbox="allow-scripts" style="width:100%;height:1080px;border:0"></iframe><iframe name="cat" sandbox="allow-scripts" style="height:2px;width:2px;opacity:0"></iframe><iframe name="one" sandbox="allow-scripts" style="height:2px;width:2px;opacity:0"></iframe><script>window.emits=[];addEventListener("message",function(e){if(e.data.type==="TEST_EMIT")emits.push(e.data)});</script></body></html>')
        for part in ('cat','one','head'):
            self.page.locator('iframe[name="'+part+'"]').evaluate('(el,html)=>el.srcdoc=html', doc(part,scripts[part],periods['d'][part]))
        self.frame = self.page.frame(name='head')
        self.frame.wait_for_selector('.pa-next-ready')
        if grain != 'd':
            self.frame.locator('[data-grain="'+grain+'"]').click()
            self.wait_mask('head','period_param',[grain])
            for part in ('cat','one'):
                self.push(part, periods[grain][part])
            self.frame.wait_for_selector('.pa-next-ready')

    def wait_mask(self, part, column, values):
        self.frame.wait_for_function('(x)=>JSON.stringify((window.__paNext.masks[x.part].find(f=>f.column===x.column)||{}).value)===JSON.stringify(x.values)', arg=dict(part=part,column=column,values=values))

    def nonce_rows(self, rows):
        result = copy.deepcopy(rows)
        masks = self.frame.evaluate('window.__paNext.masks')
        for row in result:
            if row['section']=='pa_next_request':
                row['k'] = next((f['value'][0] for f in masks[row['g']] if f['column']=='pa_next_'+row['g']+'_req'), '')
        assert [r for r in result if r['section']!='pa_next_request']==[r for r in rows if r['section']!='pa_next_request']
        return result

    def push(self, part, rows, nonce=True):
        incoming = self.nonce_rows(rows) if nonce else copy.deepcopy(rows)
        self.page.frame(name=part).evaluate('(payload)=>{data=payload.rows;'+self.scripts[part]+'}', {'rows':incoming})
        return incoming

    def select(self, report_id, additive=False):
        self.frame.locator(CAT+' tr[data-rep="'+report_id+'"]').click(modifiers=['Shift'] if additive else [])

    def state(self, expected):
        self.frame.wait_for_function('(state)=>document.querySelector(\''+ONE+'\').getAttribute("data-pa-next-state")===state', arg=expected)
        assert not self.errors, self.errors

    def tab(self, tab):
        self.frame.locator(ONE+' [data-view="view:'+tab+'"]').click()

    def no_full_cover(self):
        assert self.frame.locator(ONE+' > .pa-next-wait').count()==0
        assert self.frame.locator(ONE+' .pone-overlay').evaluate('(el)=>!el.inert && el.getAttribute("aria-hidden")!=="true"')
        for node in self.frame.locator(ONE+' .pone-vtabs [data-view^="view:"]').all():
            assert node.evaluate('(el)=>!el.closest("[inert]")')

    def inject_preview(self, payload):
        self.frame.evaluate('(payload)=>window.postMessage(payload,"*")', payload)
        self.page.wait_for_timeout(60)

    def close(self):
        assert not self.errors, self.errors
        self.page.close()


def calendar_payload(frame):
    return frame.locator('.pone-cal-main [data-tip]').evaluate_all('(nodes)=>nodes.filter(n=>n.classList.contains("pone-cal-c")||n.classList.contains("d")).map(n=>n.getAttribute("data-tip")).sort()')


def kpi_text(frame):
    return frame.locator('.pone-kpis > *').all_text_contents()


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--periods',type=Path,default=Path('/tmp/pa-next-periods'))
    ap.add_argument('--fixtures',type=Path,default=Path('/tmp/pa-next-preview'))
    ap.add_argument('--output',type=Path,default=Path('/tmp/pa-next-ui-preview-results.json'))
    ap.add_argument('--section',choices=['all','adversarial'],default='all')
    args=ap.parse_args()
    hashes={part:hashlib.sha256((OUT/name).read_bytes()).hexdigest() for part,name in SQL.items()}
    meta=json.loads((args.fixtures/'metadata.json').read_text())
    assert meta['completed'] and meta['source_sha256']==hashes
    assert json.loads((args.periods/'metadata.json').read_text())['source_sha256']==hashes
    periods={g:{part:json.loads((args.periods/g/(part+'.json')).read_text()) for part in FILES} for g in ('d','w','m','q')}
    reports={g:{report:json.loads((args.fixtures/g/(report+'.json')).read_text()) for report in meta['periods'][g]['ids']+['multi']} for g in periods}
    scripts={part:(OUT/name).read_text() for part,name in FILES.items()}
    script_hashes={part:hashlib.sha256(text.encode()).hexdigest() for part,text in scripts.items()}
    args.output.write_text(json.dumps({'completed':False,'status':'running'})+'\n')
    results=[]
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
        for grain in periods if args.section=='all' else []:
            board=Board(browser,scripts,periods,grain)
            report=meta['periods'][grain]['ids'][0]
            board.select(report)
            board.state('preview')
            board.no_full_cover()
            assert board.frame.evaluate('window.__paNext.preview.id')==report
            assert board.frame.locator(ONE).get_attribute('aria-busy')=='true'
            graph=board.frame.locator(ONE+' [data-dyn="users"]')
            assert graph.get_attribute('data-grain')==grain
            buckets=json.loads(graph.get_attribute('data-bk'))
            assert [{k:row[k] for k in ('k','u','nu','re','v')} for row in buckets]==expected_series(reports[grain][report],grain)
            # Independent unchanged renderer on the actual selected-report SQL7 rows.
            reference=browser.new_page(viewport={'width':1600,'height':1100},reduced_motion='reduce')
            reference.on('pageerror',lambda error:board.errors.append(str(error)))
            reference.set_content('<iframe name="reference" sandbox="allow-scripts"></iframe>')
            size=board.frame.locator(ONE).bounding_box()
            reference.locator('iframe').evaluate('(el,s)=>{el.style.width=s.width+"px";el.style.height=s.height+"px";el.style.border="0"}',size)
            reference.locator('iframe').evaluate('(el,html)=>el.srcdoc=html',doc('reference',(ROOT/'Виджеты/pa-one.chart.js').read_text(),reports[grain][report]))
            ref=reference.frame(name='reference');ref.wait_for_selector('.pone-kpis')
            assert kpi_text(board.frame)[:5]==kpi_text(ref)[:5], (grain,'KPI',kpi_text(board.frame),kpi_text(ref))
            assert 'догружается' in kpi_text(board.frame)[5] and '…' in kpi_text(board.frame)[5]
            if grain=='d':
                board.page.screenshot(path='/tmp/pa-next-preview-dyn.png')
            board.tab('cal');ref.locator('[data-view="view:cal"]').click()
            board.frame.wait_for_selector('.pone-cal-main');ref.wait_for_selector('.pone-cal-main')
            assert calendar_payload(board.frame)==calendar_payload(ref), (grain,'calendar users')
            day_count=len(calendar_payload(ref));assert day_count>0
            board.frame.locator('[data-view="calM:v"]').click();ref.locator('[data-view="calM:v"]').click()
            assert calendar_payload(board.frame)==calendar_payload(ref), (grain,'calendar views')
            for tab in ('who','path','coh'):
                board.tab(tab)
                board.frame.wait_for_selector(ONE+' .pone-pend')
                assert 'догружается' in board.frame.locator(ONE+' .pone-pend').inner_text()
                board.no_full_cover()
                if grain=='d' and tab=='who':
                    board.page.screenshot(path='/tmp/pa-next-preview-who.png')
            board.wait_mask('cat','sel_f',[report])
            board.push('one',reports[grain][report]);board.state('ready')
            assert not board.frame.evaluate('!!window.__paNext.preview')
            assert kpi_text(board.frame)==kpi_text(ref), (grain,'full KPI')
            for tab in ('who','path','coh'):
                board.tab(tab)
                assert board.frame.locator(ONE+' .pone-pend').count()==0
                board.no_full_cover()
            assert not board.errors,board.errors
            results.append({'case':'exact-preview-'+grain,'status':'passed','report':report,'sql_series_buckets':len(buckets),'calendar_days':day_count})
            print('PASS:',grain,'exact five KPI,',len(buckets),'SQL buckets,',day_count,'calendar days, local pending tabs and full response',flush=True)
            board.close();reference.close()

        # Adversarial preview messages cannot alter accepted metric provenance.
        a,b=meta['periods']['d']['ids']
        board=Board(browser,scripts,periods);board.select(a);board.state('preview')
        saved=board.frame.evaluate('window.__paNext.preview')
        before=kpi_text(board.frame)
        for field,value in [('key','wrong-key'),('id',b),('k','NaN|garbage'),('grain','q'),('flt',{'freq_f':['1']}),('name','forged-report-name')]:
            malformed=copy.deepcopy(saved);malformed[field]=value
            board.inject_preview(malformed)
            assert board.frame.evaluate('window.__paNext.preview')==saved,field
            assert kpi_text(board.frame)==before,field
        results.append({'case':'malformed-preview-key-id-payload-grain-filter-name','status':'passed'})
        print('PASS: malformed preview key/id/payload/grain/filter/name ignored',flush=True)

        # Cached A stays visible; its older nonce must not complete the B/A
        # requests still outstanding. Snapshot metadata when each request starts.
        board.wait_mask('cat','sel_f',[a]);old_a=board.nonce_rows(reports['d'][a])
        board.push('one',reports['d'][a]);board.state('ready')
        full_a=kpi_text(board.frame)
        board.select(b);board.wait_mask('cat','sel_f',[b]);frozen_b=board.nonce_rows(reports['d'][b])
        board.select(a);board.state('ready')
        assert board.frame.evaluate('window.__paNext.preview') is None
        assert kpi_text(board.frame)==full_a
        flight_b=board.frame.evaluate('window.__paNext.flight.one.request')
        board.push('one',old_a,nonce=False);board.page.wait_for_timeout(80)
        assert board.frame.evaluate('window.__paNext.flight.one.request')==flight_b
        board.push('one',frozen_b,nonce=False);board.state('ready')
        board.wait_mask('cat','sel_f',[a])
        board.frame.wait_for_function('(old)=>window.__paNext.masks.cat.find(f=>f.column==="pa_next_cat_req").value[0]!==old',arg=next(r['k'] for r in old_a if r['section']=='pa_next_request' and r['g']=='cat'))
        flight_a=board.frame.evaluate('window.__paNext.flight.one.request')
        board.push('one',old_a,nonce=False)
        board.page.wait_for_timeout(100)
        board.state('ready')
        assert board.frame.evaluate('window.__paNext.flight.one.request')==flight_a
        assert kpi_text(board.frame)==full_a
        board.push('one',reports['d'][a]);board.state('ready')
        board.frame.wait_for_function('()=>!window.__paNext.flight.one')
        results.append({'case':'rapid-A-B-A-exact-cache-old-nonce-cannot-complete','status':'passed'})
        print('PASS: rapid A→B→A keeps exact cached A; obsolete responses cannot finish newer requests',flush=True)
        board.close()

        # A is already accepted in full. B previews immediately; A is restored
        # BEFORE the debounced B request, so no new full response is supplied.
        # Fresh board: B must not already be cached by the preceding scenario.
        board=Board(browser,scripts,periods);board.select(a)
        board.wait_mask('cat','sel_f',[a]);board.push('one',reports['d'][a]);board.state('ready')
        full_a=kpi_text(board.frame)
        board.frame.evaluate('''(ids)=>{
          const r=window.__testRapid={started:performance.now()};
          function observe(e){
            if(!e.data||e.data.type!=='PA_NEXT_INTERNAL_PREV'||String(e.data.id)!==ids.b)return;
            removeEventListener('message',observe);
            requestAnimationFrame(()=>{
              r.previewID=window.__paNext.preview&&window.__paNext.preview.id;
              r.state=document.querySelector('[data-pa-next-host="one"]').getAttribute('data-pa-next-state');
              r.users=document.querySelector('.pone-kpis .pone-k-val').textContent;
              r.elapsed=performance.now()-r.started;
              document.querySelector('tr[data-rep="'+ids.a+'"]').click();r.clicked=true;
            });
          }
          addEventListener('message',observe);
        }''',{'a':a,'b':b})
        board.frame.evaluate('(id)=>document.querySelector(\'tr[data-rep="\'+id+\'"]\').click()',b)
        board.frame.wait_for_function('()=>!!window.__testRapid.clicked')
        board.state('ready')
        rapid=board.frame.evaluate('window.__testRapid')
        assert rapid['previewID']==b and rapid['state']=='preview',rapid
        assert rapid['elapsed']<300,('Return did not precede debounce',rapid)
        assert int(rapid['users'].replace(' ','').replace('\u00a0',''))==int(next(r['k'] for r in reports['d'][b] if r['section']=='total').split('|')[0]),rapid
        assert board.frame.evaluate('window.__paNext.preview') is None
        assert kpi_text(board.frame)==full_a,('Accepted A restored stale B metrics',rapid,kpi_text(board.frame),full_a)
        results.append({'case':'FULL-A-preview-B-return-A-before-debounce','status':'passed','elapsed_ms':rapid['elapsed']})
        print('PASS: FULL A→preview B→A restores actual A metrics before debounce, no response injected',flush=True)

        # A two-report union must wait for its SQL response, never sum previews.
        board.select(b,additive=True);board.state('loading');board.no_full_cover()
        assert board.frame.locator(ONE+' .pone-top').evaluate('(el)=>el.inert && getComputedStyle(el).visibility==="hidden"')
        assert board.frame.locator(ONE+' .pone-kpis').evaluate('(el)=>!!el.closest("[inert]")')
        board.wait_mask('cat','sel_f',sorted([a,b]))
        board.push('one',reports['d']['multi']);board.state('ready')
        expected_total=next(r['k'] for r in reports['d']['multi'] if r['section']=='total').split('|')
        actual_users=board.frame.locator('.pone-kpis .pone-k-val').first.inner_text().replace('\u00a0','').replace(' ','')
        assert int(actual_users)==int(expected_total[0])
        results.append({'case':'multiple-reports-no-preview-summing','status':'passed','sql_users':int(expected_total[0])})
        print('PASS: multi-selection hides stale metrics and uses exact full SQL union',flush=True)
        board.close()

        board=Board(browser,scripts,periods);initial=kpi_text(board.frame)
        board.select(a);board.state('preview')
        board.select(a);board.state('ready');board.no_full_cover()
        assert board.frame.evaluate('window.__paNext.preview') is None
        assert kpi_text(board.frame)==initial
        results.append({'case':'initial-all-preview-A-clear-restores-exact-defaults','status':'passed'})
        print('PASS: clearing an initial preview restores exact cached all-report numbers',flush=True)
        board.close()

        board=Board(browser,scripts,periods);board.select(a);board.state('preview')
        old_preview=board.frame.evaluate('window.__paNext.preview')
        board.wait_mask('cat','sel_f',[a]);frozen_a=board.nonce_rows(reports['d'][a])
        old_cat=copy.deepcopy(periods['d']['cat'])
        board.frame.locator('[data-grain="w"]').click();board.state('loading')
        board.push('one',frozen_a,nonce=False)
        board.wait_mask('head','period_param',['w'])
        flight_w=board.frame.evaluate('window.__paNext.flight.cat.request')
        board.push('cat',old_cat,nonce=False)
        board.inject_preview(old_preview)
        board.state('loading');board.no_full_cover()
        assert board.frame.evaluate('window.__paNext.flight.cat.request')==flight_w
        results.append({'case':'period-change-rejects-old-catalogue-preview','status':'passed'})
        print('PASS: period change rejects old catalogue and preview',flush=True)
        board.close()

        board=Board(browser,scripts,periods);board.select(a);board.state('preview')
        old_preview=board.frame.evaluate('window.__paNext.preview')
        board.wait_mask('cat','sel_f',[a]);board.push('one',reports['d'][a]);board.state('ready')
        board.tab('who');board.frame.locator(ONE+' [data-freq]').first.click()
        board.frame.wait_for_function('()=>!!window.__paNext.intent.ppl')
        board.inject_preview(old_preview)
        assert not board.frame.evaluate('!!window.__paNext.preview')
        assert board.frame.locator(CAT).get_attribute('data-pa-next-state')=='loading'
        results.append({'case':'people-filter-invalidates-old-catalogue-preview','status':'passed'})
        print('PASS: actual people frequency filter invalidates catalogue preview',flush=True)
        board.close()

        for part in ('cat','one'):
            board=Board(browser,scripts,periods);board.select(a);board.state('preview')
            foreign=copy.deepcopy(periods['d'][part] if part=='cat' else reports['d'][a])
            next(r for r in foreign if r['section']=='pa_next_version')['k']='foreign-generation'
            board.wait_mask('cat','sel_f',[a]);board.push(part,foreign)
            board.state('loading');board.no_full_cover()
            assert 'разным загрузкам' in board.frame.locator('.pa-next-status').inner_text()
            results.append({'case':'foreign-'+part+'-generation-invalidates-preview','status':'passed'})
            board.close()
        print('PASS: mixed catalogue/panel generations invalidate preview',flush=True)
        browser.close()
    assert script_hashes=={part:hashlib.sha256((OUT/name).read_bytes()).hexdigest() for part,name in FILES.items()}, 'UI changed during regression'
    args.output.write_text(json.dumps({'completed':True,'status':'passed','section':args.section,'source_sql_sha256':hashes,'source_js_sha256':script_hashes,'cases':results,'scope':'Sandbox Chromium with actual local CH24.8 SQL fixtures; no corporate browser/backend accessed'},ensure_ascii=False,indent=2)+'\n')
    print('PASS:',len(results),'preview browser cases;',args.output)


if __name__=='__main__':main()
