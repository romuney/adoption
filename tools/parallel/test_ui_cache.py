#!/usr/bin/env python3
"""Adversarial business-key and cache lifecycle regression; no production I/O.

Key assertions execute the actual source functions, not a Python reimplementation.
Browser lifecycle cases execute the shipped JS with unchanged ClickHouse fixtures.
"""
import argparse
import copy
import hashlib
import json
import subprocess
from pathlib import Path

from playwright.sync_api import sync_playwright
from test_ui import OUT, doc
from test_ui_preview import FILES, SQL, ONE, Board


KEY_TESTS = r"""
var results = [];
function check(name, fn) {
  try { fn(); results.push({name:name,status:'pass'}); }
  catch (e) { results.push({name:name,status:'fail',error:String(e)}); }
}
function assert(value, message) { if (!value) throw Error(message); }
function masks(head, cat, one) {
  function pack(o) { return Object.keys(o||{}).map(function(k){return {column:k,operator:'IN',value:o[k]};}); }
  return {head:pack(head),cat:pack(cat),one:pack(one)};
}
function key(head,cat,one,part) { return businessKey(part||'one',masks(head,cat,one)); }
check('clear-report-mode-equals-unselected-baseline',function(){
  assert(key({}, {}) === key({}, {mode_param:['report']}),'empty report scope must equal all');
});
check('missing-mode-with-nonempty-selection-is-distinct',function(){
  assert(key({}, {sel_f:['2']}) !== key({}, {mode_param:['report'],sel_f:['2']}),'missing mode ignores selection in SQL');
});
check('scalar-valid-defaults-only',function(){
  assert(key({}, {}) === key({period_param:['d'],pub_f:['1'],act_f:['1'],exc_f:['1']},{}),'SQL defaults differ');
  ['pub_f','act_f','exc_f'].forEach(function(c){var h={};h[c]=['0'];assert(key(h,{})!==key({},{}),c+' zero collapsed');});
  ['w','m','q'].forEach(function(g){assert(key({period_param:[g]}, {})!==key({},{}),g+' collapsed');});
});
check('blank-audience-label-is-not-no-filter',function(){
  ['aud_spec_f','aud_stream_f','aud_hq_f','aud_it_f'].forEach(function(c){var m={};m[c]=[''];assert(key({},m)!==key({},{}),c);});
  ['ca_hq_f','ca_it_f'].forEach(function(c){var m={};m[c]=[''];assert(key(m,{})!==key({},{}),c);});
});
check('separators-and-lossy-echo-characters-do-not-collide',function(){
  var variants=[['a,b'],['a','b'],['A"B'],['AB'],['A\\B'],['A\nB'],['A\rB'],['a;b'],['a=b']];
  var seen={};variants.forEach(function(v){var k=key({}, {aud_spec_f:v});assert(!seen[k],'collision '+JSON.stringify(v));seen[k]=true;});
});
check('array-order-and-duplicates-are-preserved',function(){
  assert(key({period_param:['d','w']},{})!==key({period_param:['w','d']},{}),'SQL first scalar lost');
  assert(key({}, {aud_head_f:['1']})!==key({}, {aud_head_f:['1','1']}),'SQL length == 1 lost');
});
check('empty-intersection-is-not-all-reports',function(){
  assert(key({}, {mode_param:['report'],sel_f:['0']})!==key({}, {mode_param:['report']}),'empty intersection collapsed');
});
check('transport-nonces-do-not-change-business-key',function(){
  var a=masks({},{}),b=masks({pa_next_head_req:['h2']},{pa_next_cat_req:['c2'],pa_nonce:['retry']});
  assert(businessKey('one',a)===businessKey('one',b),'transport nonce included');
  assert(requestKey('one',a)!==requestKey('one',b),'transport request identity lost');
});
check('crossfilter-directions-are-preserved',function(){
  assert(key({}, {},{login_f:['alice']})===key({},{}),'panel must not self-filter');
  assert(key({}, {},{login_f:['alice']},'cat')!==key({}, {},{},'cat'),'people filter must affect catalogue');
  assert(key({}, {mode_param:['report'],sel_f:['2']},{},'cat')===key({}, {},{},'cat'),'catalogue must not self-filter');
});
check('session-generation-and-part-partition-cache',function(){
  var initial=key({},{});ST.generation='run-B';assert(key({},{})!==initial,'generation lost');
  ST.generation='run-A';ST.session='other-user-window';assert(key({},{})!==initial,'session lost');
  ST.session='test-window';assert(key({}, {},{},'cat')!==initial,'part lost');
});
check('memory-pressure-retains-latest-valid-answer',function(){
  ST.cache={cat:[],one:[]};ST.generation='run-A';
  var payload='x'.repeat(7*1024*1024);
  remember('one',{key:'baseline',generation:'run-A',baseline:true,rows:[{k:payload}]});
  remember('one',{key:'latest',generation:'run-A',baseline:false,rows:[{k:payload}]});
  assert(ST.cache.one.some(function(x){return x.key==='latest';}),'latest valid answer was evicted before it could render');
});
process.stdout.write(JSON.stringify(results));
"""


def key_checks(source, config):
    start = source.index('  function values(')
    end = source.index('  // A preview is a verbatim row', start)
    code = ('var C=' + json.dumps(config) + ';var ST={session:"test-window",generation:"run-A"};\n'
            + source[start:end] + '\n' + KEY_TESTS)
    done = subprocess.run(['node'], input=code, text=True, capture_output=True, check=True)
    return json.loads(done.stdout)


def run_browser_case(browser, scripts, rows, name, initially_ready):
    page = browser.new_page(viewport={'width':1600, 'height':1100}, reduced_motion='reduce')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_default_timeout(5000)
    page.set_content('<html><body style="margin:0"><iframe name="head" sandbox="allow-scripts" style="width:100%;height:1080px"></iframe><iframe name="cat" sandbox="allow-scripts"></iframe><iframe name="one" sandbox="allow-scripts"></iframe></body></html>')
    loading = copy.deepcopy(rows['head'])
    for row in loading:
        if row['section'] == 'pa_next_version':
            row.update(parent='loading', n=0)
    try:
        for part in ('cat','one','head'):
            initial = loading if part == 'head' and not initially_ready else rows[part]
            page.locator('iframe[name="'+part+'"]').evaluate('(el,html)=>el.srcdoc=html', doc(part,scripts[part],initial))
        frame = page.frame(name='head')
        frame.wait_for_function('()=>!!window.__paNext')
        if initially_ready:
            frame.wait_for_selector('.pa-next-ready')
            frame.evaluate('(rows)=>{data=rows;'+scripts['head']+'}', loading)
        frame.wait_for_function('()=>window.__paNext.generation === ""')
        frame.evaluate('(rows)=>{data=rows;'+scripts['head']+'}', rows['head'])
        for part in ('cat','one'):
            page.frame(name=part).evaluate('(rows)=>{data=rows;'+scripts[part]+'}', rows[part])
        frame.wait_for_selector('.pa-next-ready')
        assert not errors, errors
        accepted = frame.evaluate('window.__paNext.accepted.one.rows')
        assert accepted == rows['one'], 'Lifecycle restore changed business or metadata rows'
        assert frame.locator(ONE).get_attribute('data-pa-next-state') == 'ready'
        return {'name':name, 'status':'pass'}
    except Exception as error:
        state = frame.evaluate('({generation:__paNext.generation,error:__paNext.error,received:__paNext.received,issued:__paNext.issued})')
        return {'name':name, 'status':'fail', 'error':str(error), 'state':state, 'js_errors':errors}
    finally:
        page.close()


def run_command_error_case(browser, scripts, periods, selected_rows, selected_id):
    board = Board(browser,scripts,periods)
    board.page.set_default_timeout(5000)
    try:
        helper = board.page.frame(name='cat')
        helper.evaluate('''()=>{window.savedApply=window.applyCrossFilter;window.commandAttempts=0;
          window.applyCrossFilter=function(){window.commandAttempts++;throw Error('test send failure');};}''')
        board.select(selected_id)
        retry = board.frame.locator('[data-pa-next-retry="cat"]')
        retry.wait_for(state='visible')
        assert board.frame.evaluate('Boolean(window.__paNext.error.one)')
        assert not board.frame.evaluate('Boolean(window.__paNext.error.cat)'), 'Error attached to wrong receiving region'
        first_attempts = helper.evaluate('window.commandAttempts')
        assert first_attempts == 1, first_attempts
        # Includes both the periodic retry clock and the delayed HELLO handshake.
        board.page.wait_for_timeout(2800)
        assert helper.evaluate('window.commandAttempts') == first_attempts, 'Failed command retried without explicit user action'
        helper.evaluate('''()=>{window.applyCrossFilter=function(mask){window.commandAttempts++;return window.savedApply(mask);};}''')
        retry.click(timeout=5000)
        board.frame.wait_for_function('()=>!window.__paNext.pending.cat && !window.__paNext.commandError.cat')
        assert helper.evaluate('window.commandAttempts') == 2
        board.push('one', selected_rows)
        board.state('ready')
        assert not board.errors, board.errors
        return {'name':'command-error-explicit-retry-is-clickable-and-scoped','status':'pass'}
    except Exception as error:
        return {'name':'command-error-explicit-retry-is-clickable-and-scoped','status':'fail',
                'error':str(error),'js_errors':board.errors}
    finally:
        board.page.close()


def run_empty_transport_case(browser, scripts, periods, config):
    board = Board(browser,scripts,periods)
    try:
        mask = [{'column':'aud_hq_f','operator':'IN','value':['']},
                {'column':'aud_spec_f','operator':'IN','value':['A"B','A\\B','A\nB']}]
        board.frame.evaluate('''(p)=>{var s=window.__paNext;s.peers.cat.postMessage({
          type:'PA_NEXT_V1',v:1,channel:p.config.channel,kind:'COMMAND',
          chart:p.config.main,to:p.config.cat,session:s.session,seq:900,mask:p.mask},'*');}''',
                             {'config':config,'mask':mask})
        board.page.wait_for_function('()=>window.emits.some(e=>e.part==="cat")',timeout=5000)
        emitted = board.page.evaluate('window.emits.filter(e=>e.part==="cat")')
        assert len(emitted) == 1 and emitted[0]['mask'] == mask, emitted
        assert not board.errors, board.errors
        return {'name':'blank-and-special-attribute-values-survive-loader','status':'pass'}
    except Exception as error:
        return {'name':'blank-and-special-attribute-values-survive-loader','status':'fail','error':str(error)}
    finally:
        board.page.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--periods', type=Path, default=Path('/tmp/pa-next-periods'))
    parser.add_argument('--fixtures', type=Path, default=Path('/tmp/pa-next-preview'))
    parser.add_argument('--output', type=Path, default=Path('/tmp/pa-next-ui-cache-results.json'))
    args = parser.parse_args()
    args.output.write_text(json.dumps({'completed':False,'status':'running'})+'\n')
    hashes = {part:hashlib.sha256((OUT/name).read_bytes()).hexdigest() for part,name in SQL.items()}
    metadata = json.loads((args.periods/'metadata.json').read_text())
    assert metadata['source_sha256'] == hashes
    preview_meta = json.loads((args.fixtures/'metadata.json').read_text())
    assert preview_meta['completed'] and preview_meta['source_sha256'] == hashes
    scripts = {part:(OUT/name).read_text() for part,name in FILES.items()}
    source = (OUT/'src/main.js').read_text()
    config = json.loads((OUT/'src/ui-build.json').read_text())['configuration']
    rows = {part:json.loads((args.periods/'d'/(part+'.json')).read_text()) for part in FILES}
    selected_id = preview_meta['periods']['d']['ids'][0]
    selected_rows = json.loads((args.fixtures/'d'/(selected_id+'.json')).read_text())
    results = key_checks(source, config)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
        for name, initially_ready in [('initial-loading-to-ready',False),('ready-loading-ready-same-iframe',True)]:
            results.append(run_browser_case(browser,scripts,rows,name,initially_ready))
        results.append(run_command_error_case(browser,scripts,{'d':rows},selected_rows,selected_id))
        results.append(run_empty_transport_case(browser,scripts,{'d':rows},config))
        browser.close()
    assert (OUT/'src/main.js').read_text() == source, 'Main source changed during regression'
    assert all((OUT/FILES[part]).read_text() == script for part,script in scripts.items()), 'Delivery changed during regression'
    report = {'completed':True,'status':'pass' if all(x['status']=='pass' for x in results) else 'fail',
              'source_sha256':hashes,'main_source_sha256':hashlib.sha256(source.encode()).hexdigest(),
              'script_sha256':{part:hashlib.sha256(script.encode()).hexdigest() for part,script in scripts.items()},
              'cases':results}
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    for item in results:
        print(item['status'].upper()+': '+item['name'])
    raise SystemExit(0 if report['status']=='pass' else 1)


if __name__ == '__main__':
    main()
