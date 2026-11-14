#!/usr/bin/env python3
"""Exercise shipped charts against a single-flight, lossy platform simulator.

No production timer is patched. Query latency belongs to the simulated platform;
each query captures the filter/nonces at START, never at response delivery.
Business rows come from actual local ClickHouse fixtures. Only filter echoes and
request metadata are adapted to the simulated browser session. No DB is opened.
"""
import argparse
import copy
import hashlib
import json
import time
from pathlib import Path

from playwright.sync_api import sync_playwright
from test_ui import OUT, doc
from test_ui_preview import FILES, SQL, ONE, CAT
from test_ui_periods import expected_series


PLATFORM = r"""
window.queuePlatform = {
  epoch: performance.now(), masks: {head: [], cat: [], one: []},
  active: {cat: null, one: null}, jobs: [], events: [], next: 0, policy: 'drop',
  queued: {cat: null, one: null}
};
window.queueEvent = function(kind, details) {
  var q=queuePlatform, e=Object.assign({t: Math.round(performance.now()-q.epoch), kind:kind},details||{});
  q.events.push(e); return e;
};
window.queueStart = function(target, snapshot, reason) {
  var q=queuePlatform;
  if(q.active[target]) {
    if(q.policy==='replace') q.queued[target]=snapshot;
    queueEvent('DROP_BUSY',{target:target, reason:reason, snapshot:snapshot, active:q.active[target]});
    return;
  }
  var j={id:++q.next,target:target,snapshot:snapshot,start:performance.now(),done:false};
  q.jobs.push(j);q.active[target]=j.id;queueEvent('START',{id:j.id,target:target,snapshot:snapshot,reason:reason});
};
addEventListener('message',function(e){
  var d=e.data||{}, q=queuePlatform;
  if(d.type==='TEST_EMIT') {
    q.masks[d.part]=JSON.parse(JSON.stringify(d.mask));
    queueEvent('EMIT',{source:d.part,mask:d.mask});
    var snapshot=JSON.parse(JSON.stringify(q.masks));
    (d.part==='head'?['cat','one']:[d.part==='cat'?'one':'cat']).forEach(function(target){queueStart(target,snapshot,d.part);});
  } else if(d.type==='QUEUE_OBSERVE') {
    queueEvent(d.kind,{part:d.part,payload:d.payload});
  }
});
"""


def mask_map(mask):
    return {item['column']: item['value'] for item in mask}


def semantic(mask):
    return {key: value for key, value in mask_map(mask).items()
            if not key.startswith('pa_next_') and key != 'pa_nonce'}


def payload_body(rows):
    """Compare every actual metric, including sj fields unrelated to its echo."""
    result = []
    for row in copy.deepcopy(rows):
        if row['section'] in ('flt', 'pa_next_request'):
            continue
        if row['section'] == 'sj':
            value = json.loads(row['k']); value.pop('flt', None)
            row['k'] = json.dumps(value, sort_keys=True)
        result.append(row)
    return result


class QueueBoard:
    def __init__(self, browser, scripts, periods, reports, policy='drop', trace=False):
        self.scripts, self.periods, self.reports = scripts, periods, reports
        self.trace, self.printed = trace, 0
        self.page = browser.new_page(viewport={'width':1600,'height':1100}, reduced_motion='reduce')
        self.errors = []
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.page.set_content('<html><body style="margin:0"><iframe name="head" sandbox="allow-scripts" style="width:100%;height:1080px;border:0"></iframe><iframe name="cat" sandbox="allow-scripts" style="height:2px;width:2px;opacity:0"></iframe><iframe name="one" sandbox="allow-scripts" style="height:2px;width:2px;opacity:0"></iframe><script>'+PLATFORM+'</script></body></html>')
        self.page.evaluate('(policy)=>queuePlatform.policy=policy', policy)
        for part in ('cat','one','head'):
            self.install(part, periods['d'][part])
        self.frame = self.page.frame(name='head')
        self.frame.wait_for_selector('.pa-next-ready')
        # Initial renderer PA_AUD must be delivered before testing in-flight state.
        self.wait(100)

    def install(self, part, rows):
        observe = """addEventListener('message',function(e){var d=e.data||{};
          if(d.type==='PA_NEXT_V1'&&['COMMAND','ACK'].indexOf(d.kind)>=0)
            parent.postMessage({type:'QUEUE_OBSERVE',part:%s,kind:d.kind,payload:d},'*');
          if(d.type==='PA_NEXT_INTERNAL_AUD')
            parent.postMessage({type:'QUEUE_OBSERVE',part:%s,kind:'AUD',payload:{key:d.key,noflt:d.noflt}},'*');
        });\n""" % (json.dumps(part),json.dumps(part))
        self.page.locator('iframe[name="'+part+'"]').evaluate('(el,html)=>el.srcdoc=html', doc(part, observe+self.scripts[part], rows))

    def events(self):
        events = self.page.evaluate('queuePlatform.events')
        if self.trace:
            for event in events[self.printed:]:
                small = {key:value for key,value in event.items() if key not in ('snapshot','payload')}
                if event.get('snapshot'):
                    small['filters'] = {key:semantic(value) for key,value in event['snapshot'].items()}
                print('TRACE', json.dumps(small,ensure_ascii=False), flush=True)
            self.printed = len(events)
        return events

    def wait(self, ms):
        self.page.wait_for_timeout(ms)
        self.events()
        assert not self.errors, self.errors

    def select(self, report, additive=False):
        self.page.evaluate('(r)=>queueEvent("CLICK",{report:r})', report)
        self.frame.locator(CAT+' tr[data-rep="'+report+'"]').click(modifiers=['Shift'] if additive else [])

    def period(self, grain):
        self.page.evaluate('(g)=>queueEvent("PERIOD",{grain:g})', grain)
        self.frame.locator('[data-pa-next-host="head"] [data-grain="'+grain+'"]').click()

    def jobs(self, target=None):
        return self.page.evaluate('(target)=>queuePlatform.jobs.filter(j=>!target||j.target===target)', target)

    def active(self, target):
        return self.page.evaluate('(target)=>queuePlatform.active[target]', target)

    def wait_job(self, target, after=0, timeout=4000):
        self.page.wait_for_function('(x)=>queuePlatform.jobs.some(j=>j.target===x.target&&j.id>x.after)',arg={'target':target,'after':after},timeout=timeout)
        self.events()
        return next(job for job in self.jobs(target) if job['id'] > after)

    def rows_for(self, job):
        masks = job['snapshot']; head = semantic(masks['head'])
        grain = head.get('period_param',['d'])[0]
        assert grain in self.periods, ('unsupported fixture grain',grain)
        if job['target']=='cat':
            assert not semantic(masks['one']), 'Add actual filtered CAT fixtures before simulating people filters'
            source = self.periods[grain]['cat']
        else:
            cat = semantic(masks['cat']); selected = cat.get('sel_f',[])
            assert cat.get('mode_param',['report'])[0] == 'report'
            if not selected:
                source = self.periods[grain]['one']
            elif len(selected)==1:
                source = self.reports[grain][selected[0]]
            else:
                assert set(selected)==set(key for key in self.reports[grain] if key!='multi')
                source = self.reports[grain]['multi']
        rows = copy.deepcopy(source)
        echo = dict(head)
        echo.update(semantic(masks['cat' if job['target']=='one' else 'one']))
        for row in rows:
            if row['section']=='pa_next_request':
                row['k'] = mask_map(masks[row['g']]).get('pa_next_'+row['g']+'_req',[''])[0]
            elif row['section']=='flt':
                row['k'] = json.dumps(echo,ensure_ascii=False)
            elif row['section']=='sj':
                value = json.loads(row['k'])
                if job['target']=='cat': value['flt'] = echo
                row['k'] = json.dumps(value,ensure_ascii=False)
        assert payload_body(rows)==payload_body(source), 'Simulator changed a business value'
        return rows

    def complete(self, job, replay=False):
        rows = self.rows_for(job)
        if not replay:
            self.page.evaluate('''(id)=>{var q=queuePlatform,j=q.jobs.find(x=>x.id===id);
              if(j.done)throw Error('Job completed twice');j.done=true;
              if(q.active[j.target]===id)q.active[j.target]=null;
              queueEvent('FINISH',{id:id,target:j.target});
              var s=q.queued[j.target];q.queued[j.target]=null;
              if(s)queueStart(j.target,s,'platform-replaced');
            }''', job['id'])
        else:
            self.page.evaluate('(j)=>queueEvent("REPLAY",{id:j.id,target:j.target})', job)
        self.page.frame(name=job['target']).evaluate('(payload)=>{data=payload.rows;'+self.scripts[job['target']]+'}',{'rows':rows})
        self.wait(40)
        return rows

    def state(self):
        return self.frame.locator(ONE).get_attribute('data-pa-next-state')

    def check_ready(self, rows):
        self.frame.wait_for_selector(ONE+'[data-pa-next-state="ready"]', timeout=5000)
        assert self.frame.evaluate('window.__paNext.preview') is None
        expected = next(row['k'] for row in rows if row['section']=='total').split('|')[0]
        self.frame.locator(ONE+' [data-view="view:dyn"]').click()
        actual = self.frame.locator('.pone-kpis .pone-k-val').first.inner_text().replace(' ','').replace('\u00a0','')
        assert int(actual)==int(expected),(actual,expected)
        grain=next(row['parent'] for row in rows if row['section']=='area')
        buckets=json.loads(self.frame.locator(ONE+' [data-dyn="users"]').get_attribute('data-bk'))
        assert [{key:row[key] for key in ('k','u','nu','re','v')} for row in buckets]==expected_series(rows,grain)
        assert not self.errors,self.errors

    def assert_exact_selection(self, job, selected, grain='d'):
        assert semantic(job['snapshot']['cat']).get('sel_f',[]) == selected, job
        assert semantic(job['snapshot']['head']).get('period_param',['d'])[0] == grain, job

    def no_new_queries(self, ms=2800):
        before=len(self.jobs())
        self.wait(ms)
        assert len(self.jobs())==before, ('Unsolicited/duplicate query loop',self.events())

    def replay_command(self):
        commands=[e['payload'] for e in self.events() if e['kind']=='COMMAND' and e.get('part')=='cat']
        assert commands
        before=len([e for e in self.events() if e['kind']=='EMIT'])
        self.frame.evaluate('(command)=>{for(let i=0;i<3;i++)window.__paNext.peers.cat.postMessage(command,"*");}',commands[-1])
        self.wait(120)
        assert len([e for e in self.events() if e['kind']=='EMIT'])==before, 'Duplicate COMMAND re-emitted its mask'

    def stale_instance(self, instance, job):
        # A retired frame response must not advance the accepted serial or finish
        # the current request, even when its synthetic serial is much larger.
        config=json.loads((OUT/'src/ui-build.json').read_text())['configuration']
        session=self.frame.evaluate('window.__paNext.session')
        message=dict(type='PA_NEXT_V1',v=1,channel=config['channel'],kind='ROWS',part='one',
                     chart=config['one'],to=config['main'],serial=999999,instance=instance,
                     session=session,rows=self.rows_for(job))
        self.page.frame(name='one').evaluate('(d)=>window.__paNextLoader.main.postMessage(d,"*")',message)
        self.wait(100)
        assert self.frame.evaluate('window.__paNext.serial.one') != 999999

    def close(self):
        events = self.events()
        assert not self.errors,self.errors
        self.page.close()
        return events


def repro_old_response_deadlock(board, report, observe_ms):
    """A starts; header invalidates A; latest B is held; stale A cannot release B."""
    board.select(report)
    first = board.wait_job('one')
    other = next(key for key in board.reports['d'] if key not in ('multi',report))
    board.select(other)
    board.wait(380)
    board.period('w')
    board.wait(80)
    # The corrected scheduler may hold HEAD until both downstream queries are
    # free. The old implementation emits it immediately and loses ONE's query.
    for cat in [job for job in board.jobs('cat') if not job['done']]:
        board.complete(cat)
    board.complete(first)
    finished = next(event['t'] for event in board.events() if event['kind']=='FINISH' and event['id']==first['id'])
    until = time.monotonic()+observe_ms/1000
    next_job = None
    while time.monotonic()<until:
        candidates=[job for job in board.jobs('one') if job['id']>first['id']]
        if candidates:
            next_job=candidates[0];break
        board.wait(min(200,max(1,int((until-time.monotonic())*1000))))
    started = next((event['t'] for event in board.events() if next_job and event['kind']=='START' and event['id']==next_job['id']),None)
    result={'case':'stale-completion-must-release-latest','first_job':first['id'],
            'latest_job':next_job['id'] if next_job else None,'completion_t_ms':finished,
            'next_start_t_ms':started,'release_delay_ms':started-finished if started is not None else None,
            'observed_ms':observe_ms,'ui_state':board.state()}
    if next_job:
        # Cross-filters from two source charts need not be applied atomically.
        # Drain legitimate intermediate snapshots; only the final (w,B) can pass.
        final_rows=None
        deadline=time.monotonic()+8
        completed=set()
        while time.monotonic()<deadline:
            active=[job for job in board.jobs() if not job['done'] and job['id'] not in completed]
            if not active:
                if final_rows is not None and board.state()=='ready':break
                board.wait(40);continue
            assert len(board.jobs())<=8, ('Query replay loop',board.events())
            for job in active:
                rows=board.complete(job);completed.add(job['id'])
                if job['target']=='one' and semantic(job['snapshot']['head']).get('period_param')==['w'] and semantic(job['snapshot']['cat']).get('sel_f')==[other]:
                    final_rows=rows
        assert final_rows is not None, ('No final (w,latest-report) response',board.events())
        board.check_ready(final_rows)
        result['final_query_count']=len(board.jobs())
    return result


def release_ms(board, completed, started):
    events=board.events()
    a=next(e['t'] for e in events if e['kind']=='FINISH' and e['id']==completed['id'])
    b=next(e['t'] for e in events if e['kind']=='START' and e['id']==started['id'])
    delay=b-a
    assert 0 <= delay < 1500, ('Latest selection did not start promptly',delay)
    return delay


def case_clear(board, a, b):
    board.select(a);first=board.wait_job('one')
    board.select(b);board.wait(350)
    board.select(b);board.wait(350)
    # Cached "all" may already be displayed, but A is still a real outstanding
    # platform query. A new clear query may not be considered completed by that.
    assert board.active('one')==first['id']
    board.complete(first)
    latest=board.wait_job('one',after=first['id'],timeout=1800)
    board.assert_exact_selection(latest,[])
    delay=release_ms(board,first,latest)
    rows=board.complete(latest);board.check_ready(rows)
    board.replay_command();board.no_new_queries()
    return {'case':'A-B-clear-single-flight','status':'passed','release_delay_ms':delay,'queries':len(board.jobs('one'))}


def case_rapid_union(board, a, b):
    board.select(a);first=board.wait_job('one')
    board.select(b);board.wait(350)
    # C is a third, distinct scope with an actual SQL fixture: union(A,B).
    # This avoids inventing metric rows for a third individual report.
    board.select(a,additive=True);board.wait(350)
    board.complete(first)
    latest=board.wait_job('one',after=first['id'],timeout=1800)
    board.assert_exact_selection(latest,sorted([a,b]))
    delay=release_ms(board,first,latest)
    board.complete(first,replay=True)
    assert board.active('one')==latest['id']
    assert board.state()!='ready', 'Stale full response unlocked a different union'
    before=len(board.jobs());board.wait(350)
    assert len(board.jobs())==before, 'Stale replay released the active query'
    rows=board.complete(latest);board.check_ready(rows)
    board.no_new_queries()
    return {'case':'A-B-C-union-old-replay','status':'passed','release_delay_ms':delay,'queries':len(board.jobs('one'))}


def case_cache_lifecycle(board, a, b):
    board.select(a);first=board.wait_job('one');rows_a=board.complete(first);board.check_ready(rows_a)
    board.select(b);inflight=board.wait_job('one',after=first['id'])
    board.select(a);board.wait(380)
    # Returning to a cached A must not tell the transport that B has completed.
    assert board.active('one')==inflight['id']
    assert board.state()=='ready', 'Exact cached A was not displayed while B remained in flight'
    board.check_ready(rows_a)
    board.select(b,additive=True);board.wait(350)
    board.complete(inflight)
    latest=board.wait_job('one',after=inflight['id'],timeout=1800)
    board.assert_exact_selection(latest,sorted([a,b]))
    delay=release_ms(board,inflight,latest)
    board.complete(first,replay=True)
    assert board.active('one')==latest['id']
    assert board.state()!='ready'
    rows=board.complete(latest);board.check_ready(rows)
    board.no_new_queries()
    return {'case':'ready-cache-does-not-complete-outstanding-query','status':'passed','release_delay_ms':delay}


def case_default_cache(board, a, b):
    board.select(a);first=board.wait_job('one')
    board.select(a);board.wait(80)
    assert board.state()=='ready', 'Clearing must reuse the exact initial all-reports result'
    board.check_ready(board.periods['d']['one'])
    assert board.active('one')==first['id'], 'Showing cached defaults completed a live request'
    board.wait(350)
    board.complete(first)
    latest=board.wait_job('one',after=first['id'],timeout=1800)
    board.assert_exact_selection(latest,[])
    delay=release_ms(board,first,latest)
    rows=board.complete(latest);board.check_ready(rows)
    board.no_new_queries()
    return {'case':'initial-default-cache-reset-preserves-flight','status':'passed','release_delay_ms':delay}


def case_remount(board, a, b):
    board.select(a);first=board.wait_job('one')
    previous=board.frame.evaluate('window.__paNext.instances.one')
    board.install('one',board.periods['d']['one'])
    board.frame.wait_for_function('(old)=>window.__paNext.instances.one!==old',arg=previous)
    board.select(b);board.wait(350)
    board.stale_instance(previous,first)
    assert board.active('one')==first['id']
    board.complete(first)
    latest=board.wait_job('one',after=first['id'],timeout=1800)
    board.assert_exact_selection(latest,[b])
    delay=release_ms(board,first,latest)
    rows=board.complete(latest);board.check_ready(rows)
    board.replay_command();board.no_new_queries()
    return {'case':'receiver-remount-retired-response','status':'passed','release_delay_ms':delay}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scripts',type=Path,default=OUT)
    parser.add_argument('--periods',type=Path,default=Path('/tmp/pa-next-periods'))
    parser.add_argument('--fixtures',type=Path,default=Path('/tmp/pa-next-preview'))
    parser.add_argument('--output',type=Path,default=Path('/tmp/pa-next-ui-queue-results.json'))
    parser.add_argument('--mode',choices=['reproduce','verify'],default='verify')
    parser.add_argument('--policy',choices=['drop','replace'],default='drop',help='Platform loses busy updates or retains only the last one')
    parser.add_argument('--case',choices=['all','stale','clear','rapid','cache','default-cache','remount'],default='all')
    parser.add_argument('--observe-ms',type=int,default=47000)
    parser.add_argument('--trace',action='store_true')
    args=parser.parse_args()
    sql_hashes={part:hashlib.sha256((OUT/name).read_bytes()).hexdigest() for part,name in SQL.items()}
    meta=json.loads((args.fixtures/'metadata.json').read_text())
    assert meta['completed'] and meta['source_sha256']==sql_hashes
    assert json.loads((args.periods/'metadata.json').read_text())['source_sha256']==sql_hashes
    periods={grain:{part:json.loads((args.periods/grain/(part+'.json')).read_text()) for part in FILES} for grain in ('d','w','m','q')}
    reports={grain:{report:json.loads((args.fixtures/grain/(report+'.json')).read_text()) for report in meta['periods'][grain]['ids']+['multi']} for grain in periods}
    scripts={part:(args.scripts/name).read_text() for part,name in FILES.items()}
    report={'completed':False,'status':'running','policy':args.policy,'harness_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'script_sha256':{key:hashlib.sha256(value.encode()).hexdigest() for key,value in scripts.items()},'source_sql_sha256':sql_hashes,'scope':'Actual shipped scripts and actual SQL fixtures; platform single-flight simulation, no corporate service access; runtime constants unchanged','cases':[]}
    args.output.write_text(json.dumps(report,indent=2)+'\n')
    failed=None
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
        board=None
        try:
            slow=False;report['events']=[]
            if args.mode=='reproduce' or args.case in ('all','stale'):
                board=QueueBoard(browser,scripts,periods,reports,policy=args.policy,trace=args.trace)
                result=repro_old_response_deadlock(board,meta['periods']['d']['ids'][0],args.observe_ms if args.mode=='reproduce' else 2500)
                report['cases'].append(result);report['events'].append(board.close());board=None
                slow=result['release_delay_ms'] is None or result['release_delay_ms']>1500
            if args.mode=='verify':
                assert not slow, ('Reproduced completion/held-request deadlock',result)
                for name,case in [('clear',case_clear),('rapid',case_rapid_union),('cache',case_cache_lifecycle),('default-cache',case_default_cache),('remount',case_remount)]:
                    if args.case not in ('all',name):continue
                    board=QueueBoard(browser,scripts,periods,reports,policy=args.policy,trace=args.trace)
                    value=case(board,*meta['periods']['d']['ids'])
                    report['cases'].append(value);report['events'].append(board.close());board=None
                    print('PASS',json.dumps(value,ensure_ascii=False),flush=True)
            report.update(completed=True,status=('reproduced' if slow else 'not-reproduced') if args.mode=='reproduce' else 'passed')
        except Exception as error:
            failed=error
            report.update(completed=False,status='failed',error=str(error))
            if board:
                report.setdefault('events',[]).append(board.events())
                report['browser_errors']=board.errors
        finally:
            browser.close()
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(report['status'].upper(),args.output,flush=True)
    if failed: raise failed


if __name__=='__main__':
    main()
