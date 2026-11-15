#!/usr/bin/env python3
"""Verify exact/accessible KPI motion and profile actual-SQL preview/full paint."""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import sync_playwright
from test_ui_preview import Board, FILES, OUT


INSTALL = """({values,key})=>{
  document.querySelector('.pa-next-one').innerHTML='<div class="pone-kpis"></div>';
  var grid=document.querySelector('.pone-kpis');
  values.forEach(function(value){var n=document.createElement('div');n.className='pone-k-val';
    n.setAttribute('data-pa-next-motion-key',key);n.innerHTML=value;grid.appendChild(n)});
}"""
TRACE = """()=>{
  window.__motionTrace={writes:[],animations:[],frames:[],kpi:[]};
  var desc=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
  Object.defineProperty(Element.prototype,'innerHTML',{get:desc.get,set:function(value){
    if(this.classList&&this.classList.contains('pone-overlay'))__motionTrace.writes.push(performance.now());
    return desc.set.call(this,value);
  }});
  var animate=Element.prototype.animate;
  Element.prototype.animate=function(frames,options){
    if(this.closest&&this.closest('.pone-overlay'))__motionTrace.animations.push({t:performance.now(),
      cls:this.getAttribute('class'),duration:options.duration,delay:options.delay||0});
    return animate.call(this,frames,options);
  };
  var end=performance.now()+2400;
  function tick(t){__motionTrace.frames.push(t);var n=document.querySelector('.pa-next-kpi-motion');
    if(n)__motionTrace.kpi.push({t:t,text:n.textContent});if(t<end)requestAnimationFrame(tick)}
  requestAnimationFrame(tick);
}"""


def isolated(browser):
    page = browser.new_page(viewport={'width': 1200, 'height': 700}, reduced_motion='no-preference')
    # Deterministic animation clock for exact DOM/AX assertions. The profile
    # below uses the real clock and real SQL fixtures independently.
    page.clock.install(time=datetime(2026,11,15,12,0,0,tzinfo=timezone.utc))
    page.clock.pause_at(datetime(2026,11,15,12,0,1,tzinfo=timezone.utc))
    page.set_content('''<style>.pone-kpis{display:grid;grid-template-columns:repeat(6,160px);gap:10px}
      .pone-k-val{font:24px/32px Arial}</style><div class="pa-next-shell">
      <section class="pa-next-one" data-pa-next-host="one" data-pa-next-state="ready"></section></div>''')
    page.add_script_tag(content=(OUT/'src/motion.js').read_text())
    page.evaluate("window.ST={generation:'g1'};window.motion=installMotion(document.querySelector('.pa-next-shell'),ST)")
    values = ['12 345', '12\u00a0345', '3,4M', '121K', '50,0%', '−12,3%',
              '9 007 199 254 740 993', '—', '…', '0', '<span>5 811</span>']
    page.evaluate(INSTALL, {'values': values, 'key': 'report:A'})
    final = page.locator('.pone-k-val').all_text_contents()
    original = page.locator('.pone-k-val').evaluate_all('(ns)=>ns.map(n=>n.innerHTML)')
    before = page.locator('.pone-k-val').evaluate_all('(ns)=>ns.map(n=>n.getBoundingClientRect().width)')
    page.evaluate('motion.rendered()')
    assert page.locator('.pa-next-kpi-motion').count() == 7
    assert page.locator('.pa-next-kpi-motion[aria-hidden=true]').count() == 7
    assert '12 345' in page.locator('.pone-k-val').first.aria_snapshot()
    assert '0' not in page.locator('.pone-k-val').first.aria_snapshot()
    assert before == page.locator('.pone-k-val').evaluate_all('(ns)=>ns.map(n=>n.getBoundingClientRect().width)')
    # Number-only no-op repeated notifications must not restart or replace spans.
    page.evaluate("window.animNode=document.querySelector('.pa-next-kpi-motion');motion.rendered()")
    assert page.evaluate("animNode===document.querySelector('.pa-next-kpi-motion')")
    page.evaluate("window.tickMutations=0;window.tickObserver=new MutationObserver(function(records){tickMutations+=records.length});tickObserver.observe(animNode,{childList:true})")
    page.clock.run_for(260)
    assert page.evaluate('tickMutations') == 0, 'counter frames must not trigger viewport childList observation'
    page.evaluate('tickObserver.disconnect()')
    assert page.locator('.pa-next-kpi-motion').count() == 0
    assert page.locator('.pone-k-val').all_text_contents() == final
    assert page.locator('.pone-k-val').evaluate_all('(ns)=>ns.map(n=>n.innerHTML)') == original
    # Full response after preview, resize, same-key DOM replacement, tab return.
    for _ in range(2):
        page.evaluate(INSTALL, {'values': values, 'key': 'report:A'})
        page.evaluate('motion.rendered()')
        assert page.locator('.pa-next-kpi-motion').count() == 0
    page.evaluate(INSTALL, {'values': values, 'key': 'report:B'})
    page.evaluate('motion.rendered();window.dispatchEvent(new Event("resize"))')
    assert page.locator('.pone-k-val').all_text_contents() == final
    assert page.locator('.pa-next-kpi-motion').count() == 0
    page.evaluate(INSTALL, {'values': values, 'key': 'report:C'})
    page.evaluate('motion.rendered();document.querySelector(".pa-next-one").setAttribute("data-pa-next-state","loading");motion.cancel()')
    assert page.locator('.pone-k-val').all_text_contents() == final
    page.evaluate('motion.rendered()')
    assert page.locator('.pa-next-kpi-motion').count() == 0
    page.evaluate('document.querySelector(".pa-next-one").setAttribute("data-pa-next-state","preview");document.querySelector(".pa-next-shell").classList.add("pa-next-resizing")')
    page.evaluate(INSTALL, {'values': values, 'key': 'report:D'})
    page.evaluate('motion.rendered()')
    assert page.locator('.pa-next-kpi-motion').count() == 0
    page.evaluate('document.querySelector(".pa-next-shell").classList.remove("pa-next-resizing");motion.rendered()')
    assert page.locator('.pa-next-kpi-motion').count() == 0
    page.evaluate("document.querySelector('.pone-kpis').remove();motion.rendered()")
    page.evaluate(INSTALL, {'values': values, 'key': 'report:D'})
    page.evaluate('motion.rendered()')
    assert page.locator('.pa-next-kpi-motion').count() == 0
    page.evaluate("ST.generation='g2';motion.rendered()")
    assert page.locator('.pa-next-kpi-motion').count() == 7
    page.emulate_media(reduced_motion='reduce')
    page.clock.run_for(60)
    assert page.locator('.pone-k-val').all_text_contents() == final
    page.evaluate(INSTALL, {'values': values, 'key': 'report:E'})
    page.evaluate('motion.rendered()')
    assert page.locator('.pa-next-kpi-motion').count() == 0
    page.evaluate('motion.destroy()')
    page.close()
    return {'formatting': 'exact', 'accessible_final': True, 'large_values': 'not coerced',
            'resize_loading_reduced_unchanged': 'no animation'}


def profile(browser, scripts, periods, fixtures, reduced=False):
    board = Board(browser, scripts, periods)
    board.page.emulate_media(reduced_motion='reduce' if reduced else 'no-preference')
    board.frame.evaluate(TRACE)
    board.select('2')
    board.wait_mask('cat', 'sel_f', ['2'])
    board.page.wait_for_timeout(360)
    preview = board.frame.locator('.pone-k-val').all_text_contents()
    assert board.frame.locator('.pa-next-kpi-motion').count() == 0
    if reduced:
        assert board.frame.locator('svg animate').count() == 0, 'preview SMIL must respect reduced motion'
    board.push('one', json.loads((fixtures/'d/2.json').read_text()))
    board.state('ready')
    board.page.wait_for_timeout(320)
    full = board.frame.locator('.pone-k-val').all_text_contents()
    assert full[:5] == preview[:5], (preview, full)
    assert board.frame.locator('.pa-next-kpi-motion').count() == 0
    trace = board.frame.evaluate('window.__motionTrace')
    trace['final_values'] = full
    trace['errors'] = board.errors
    trace['max_duration_delay_ms'] = max((a['duration']+a['delay'] for a in trace['animations']), default=0)
    intervals = [b-a for a,b in zip(trace['frames'], trace['frames'][1:])]
    trace['max_frame_gap_ms'] = max(intervals, default=0)
    trace['frame_gaps_over32ms'] = sum(value > 32 for value in intervals)
    # A preview and its full response are the expected two paints, not a
    # resize loop. The helper changes KPI children, never the overlay markup.
    assert 1 <= len(trace['writes']) <= 3, trace['writes']
    assert trace['max_duration_delay_ms'] <= 220, trace['max_duration_delay_ms']
    if reduced:
        assert not trace['animations'] and not trace['kpi']
        assert board.frame.locator('svg animate').count() == 0
    else:
        assert trace['animations'] and trace['kpi'], trace
    # Local tab switches and a window resize cannot start a new animation.
    board.frame.evaluate('__motionTrace.animations=[];__motionTrace.kpi=[]')
    board.tab('who'); board.tab('dyn')
    board.frame.evaluate('window.dispatchEvent(new Event("resize"))')
    board.page.wait_for_timeout(50)
    assert board.frame.evaluate('__motionTrace.animations.length') == 0
    assert board.frame.locator('.pa-next-kpi-motion').count() == 0
    assert board.frame.locator('.pone-k-val').all_text_contents() == full
    board.close()
    return trace


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--periods', type=Path, default=Path('/tmp/pa-next-periods'))
    ap.add_argument('--fixtures', type=Path, default=Path('/tmp/pa-next-preview'))
    ap.add_argument('--output', type=Path, default=Path('/tmp/pa-next-ui-motion.json'))
    ap.add_argument('--isolated-only', action='store_true')
    args = ap.parse_args()
    scripts = {part:(OUT/name).read_text() for part,name in FILES.items()}
    sha = hashlib.sha256(scripts['head'].encode()).hexdigest()
    result = {'completed': False, 'main_sha256': sha}
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
        result['isolated'] = isolated(browser)
        if not args.isolated_only:
            periods = {g:{part:json.loads((args.periods/g/(part+'.json')).read_text()) for part in FILES}
                       for g in ['d','w','m','q']}
            result['motion'] = profile(browser,scripts,periods,args.fixtures)
            result['reduced'] = profile(browser,scripts,periods,args.fixtures,reduced=True)
        browser.close()
    assert hashlib.sha256((OUT/FILES['head']).read_bytes()).hexdigest() == sha, 'delivery changed during test'
    result['completed'] = True
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print('PASS: exact KPI values, accessible final text, reduced/resize/loading guards, bounded chart motion')


if __name__ == '__main__':
    main()
