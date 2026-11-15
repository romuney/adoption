#!/usr/bin/env python3
"""Check text at each painted frame and pointer event during catalogue resizing.

Runs the generated delivery, not a mock renderer. A settled screenshot cannot
detect the old 150ms SVG/font scaling between a grid write and its redraw.
"""
import argparse
import hashlib
import json
from pathlib import Path

from playwright.sync_api import sync_playwright
from test_ui_viewport import mount, rows, scripts


PROBE = '''() => {
  var panel=document.querySelector('.pa-next-one');
  var selectors=['.pone-h-ttl','.pone-sub-tab','.pone-k-label','.pone-k-val','.pone-ptable th','.pone-ptable td',
    '.pone-cal-c b','.pone-cal-wd','.pone-cal-mg .d','.pone-ct-cell','.pone-cttable th','.pone-as-t'];
  var fonts={};
  selectors.forEach(function(selector){
    fonts[selector]=Array.from(new Set(Array.from(panel.querySelectorAll(selector),function(n){
      var s=getComputedStyle(n);return s.fontFamily+'|'+s.fontSize;
    }))).sort();
  });
  var texts=Array.from(panel.querySelectorAll('svg text')).map(function(n){
    var m=n.getScreenCTM(),s=getComputedStyle(n);
    return {text:n.textContent,font:s.fontFamily+'|'+s.fontSize,sx:m?Math.hypot(m.a,m.b):0,sy:m?Math.hypot(m.c,m.d):0};
  });
  return {width:panel.getBoundingClientRect().width,fonts:fonts,texts:texts,
    pathLayout:(panel.querySelector('.path-wrap')?getComputedStyle(panel.querySelector('.path-wrap')).flexDirection:null)};
}'''


def payload(frame):
    # Tooltip/bucket payloads carry exact values independently of labels being
    # formatted compactly at a narrower calendar width.
    return frame.evaluate('''() => Array.from(document.querySelectorAll('.pa-next-one [data-tip],.pa-next-one [data-bk]'),
      n=>[n.getAttribute('data-tip'),n.getAttribute('data-bk')]).map(JSON.stringify).sort()''')


def check_sample(sample, baseline, label):
    assert sample['fonts'] == baseline['fonts'], (label, 'HTML type changed during resize', sample['fonts'], baseline['fonts'])
    for text in sample['texts']:
        assert abs(text['sx'] - 1) <= .002 and abs(text['sy'] - 1) <= .002, (label, 'SVG glyph was scaled before settling', text, sample['width'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--periods', type=Path, help='Optional actual-SQL head/cat/one.json directory')
    parser.add_argument('--output', type=Path, default=Path('/tmp/pa-next-ui-resize-results.json'))
    args = parser.parse_args()
    if args.periods:
        for part in ['head', 'cat', 'one']:
            rows[part] = json.loads((args.periods / (part + '.json')).read_text())
    results = {'script_sha256':{part:hashlib.sha256(code.encode()).hexdigest() for part, code in scripts.items()},'cases':[]}
    args.output.write_text(json.dumps(dict(results, completed=False), ensure_ascii=False, indent=2))
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, ignore_default_args=['--hide-scrollbars'])
        page = browser.new_page(viewport={'width':1920, 'height':1080}, reduced_motion='reduce')
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        frame = mount(page)
        splitter = frame.get_by_role('separator', name='Ширина каталога')
        panel = frame.locator('.pa-next-one')
        frame.evaluate('window.__resizeProbe=' + PROBE)
        accepted = frame.evaluate('JSON.stringify(window.__paNext.accepted)')
        for tab in ['dyn', 'cal', 'path', 'who', 'coh']:
            frame.locator('[data-view="view:' + tab + '"]').click()
            splitter.press('Home')
            page.wait_for_timeout(250)
            baseline = frame.evaluate('window.__resizeProbe()')
            check_sample(baseline, baseline, tab + ' initial')
            data = payload(frame)
            # Subscribe before pointer input: every browser frame matters, not
            # only the post-drag geometry after the observer's 150ms timer.
            frame.evaluate('''() => {
              window.__resizeSamples=[];window.__resizeWatching=true;
              function tick(){if(!window.__resizeWatching)return;window.__resizeSamples.push(window.__resizeProbe());requestAnimationFrame(tick)}
              requestAnimationFrame(tick);
            }''')
            start = splitter.bounding_box()
            initial_width = panel.bounding_box()['width']
            x, y = start['x'] + start['width'] / 2, start['y'] + min(80, start['height'] / 2)
            page.mouse.move(x, y)
            page.mouse.down()
            widths = [1320,1281,1280,1279,1200,900,761,760,759,700,600,450,380,381,450,759,760,761,1000,1279,1280,1281,initial_width]
            immediate = []
            for width in widths:
                page.mouse.move(x + initial_width - width, y)
                sample = frame.evaluate('window.__resizeProbe()')
                immediate.append(sample)
                check_sample(sample, baseline, tab + ' pointer width ' + str(width))
            page.mouse.up()
            # Keep sampling the delayed source observers too: their resize must
            # not briefly undo the synchronous geometry.
            page.wait_for_timeout(200)
            samples = frame.evaluate('window.__resizeWatching=false;window.__resizeSamples')
            assert len(samples) >= 3, (tab, 'no meaningful painted-frame sample')
            for sample in samples:
                check_sample(sample, baseline, tab + ' rAF width ' + str(sample['width']))
            assert payload(frame) == data, (tab, 'metric/bucket/tooltip payload changed on resize')
            minimum = frame.evaluate('window.__paNext.panelMinimum || 740')
            assert minimum <= min(sample['width'] for sample in immediate) <= minimum + 1
            assert max(sample['width'] for sample in immediate) > 1280
            if tab == 'path':
                assert any(sample['width'] > 1280 and sample['pathLayout'] == 'row' for sample in immediate), 'wide Path must use its panel breakpoint'
                assert all(sample['pathLayout'] == 'column' for sample in immediate if sample['width'] < 1280), 'narrow Path must not inherit the outer iframe width'
            results['cases'].append({'tab':tab,'pointer_samples':len(immediate),'painted_frames':len(samples),
                                     'min_width':min(s['width'] for s in immediate),'max_width':max(s['width'] for s in immediate),
                                     'svg_text_samples':sum(len(s['texts']) for s in immediate + samples),
                                     'max_svg_scale_error':max([abs(t[axis]-1) for s in immediate+samples for t in s['texts'] for axis in ['sx','sy']] or [0])})
            print('PASS:', tab, 'fixed HTML and SVG type during', len(immediate), 'pointer moves and', len(samples), 'painted frames', flush=True)
        assert frame.evaluate('JSON.stringify(window.__paNext.accepted)') == accepted
        assert page.evaluate('emits') == []
        splitter.press('Home')
        assert frame.locator('.pa-next-cat').bounding_box()['width'] == 420
        assert splitter.get_attribute('aria-valuemin') == '420'
        # Deliberately narrow: the minimum catalogue remains readable; overflow
        # is scrollable and the explicit collapse still frees analytics space.
        page.set_viewport_size({'width':850, 'height':768})
        page.wait_for_timeout(250)
        assert frame.locator('.pa-next-cat').bounding_box()['width'] >= 420
        overflow = frame.locator('.pa-next-content').evaluate('(n)=>({width:n.clientWidth,scroll:n.scrollWidth,overflow:getComputedStyle(n).overflowX})')
        assert overflow['scroll'] > overflow['width'] and overflow['overflow'] == 'auto', overflow
        frame.locator('.pa-next-cat-toggle').click()
        assert frame.locator('.pa-next-catalog-rail').is_visible()
        assert not frame.locator('.pa-next-cat').is_visible()

        # A loading cover is absolute, not another flex child. A scroll-only
        # refresh must neither recalculate plot gaps nor expose stale metrics.
        page.set_viewport_size({'width':1920, 'height':1080})
        frame = mount(page)
        frame.locator('[data-grain="m"]').click()
        page.wait_for_timeout(500)
        frame.evaluate('''() => {
          window.__resizeRedraws=0;
          window.__resizeMutation=new MutationObserver(function(records){window.__resizeRedraws+=records.length});
          window.__resizeMutation.observe(document.querySelector('.pone-overlay'),{childList:true});
          window.__pendingGeometry=function(){
            return {state:document.querySelector('.pa-next-one').dataset.paNextState,
              visible:Array.from(document.querySelectorAll('.pone-k-val,svg[data-dyn-svg]')).filter(function(n){return getComputedStyle(n).visibility!=='hidden'}).length};
          };
        }''')
        for _ in range(8):
            pending = frame.evaluate('''() => new Promise(resolve => {
              dispatchEvent(new Event('scroll'));
              requestAnimationFrame(function(){setTimeout(function(){resolve(window.__pendingGeometry())},0)});
            })''')
            assert pending == {'state':'loading','visible':0}, pending
        redraws = frame.evaluate('window.__resizeMutation.disconnect();window.__resizeRedraws')
        assert redraws == 0, ('scrolling a fixed-size pending panel rebuilt its DOM', redraws)
        before_emits = page.evaluate('emits.length')
        frame.evaluate('window.__resizeProbe=' + PROBE)
        pending_fonts = frame.evaluate('window.__resizeProbe()')
        splitter = frame.get_by_role('separator', name='Ширина каталога')
        start = splitter.bounding_box()
        x, y = start['x'] + start['width'] / 2, start['y'] + 80
        page.mouse.move(x,y)
        page.mouse.down()
        for delta in [20,40,80,100,80,40,0]:
            page.mouse.move(x+delta,y)
            pending = frame.evaluate('window.__pendingGeometry()')
            assert pending == {'state':'loading','visible':0}, ('pending drag exposed stale data', pending)
            check_sample(frame.evaluate('window.__resizeProbe()'), pending_fonts, 'pending drag')
            after_paint = frame.evaluate('''() => new Promise(resolve => requestAnimationFrame(function(){
              setTimeout(function(){resolve(window.__pendingGeometry())},0);
            }))''')
            assert after_paint == {'state':'loading','visible':0}, ('pending frame exposed stale data', after_paint)
        page.mouse.up()
        assert page.evaluate('emits.length') == before_emits
        results['pending'] = {'scroll_events':8,'scroll_redraws':redraws,'drag_samples':7,'visible_stale_metrics':0}
        print('PASS: eight scroll refreshes cause no pending redraws; pending drag never exposes stale values', flush=True)
        assert not errors, errors
        results.update(completed=True,errors=errors)
        args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2))
        print('PASS: 420px catalogue minimum, narrow horizontal scroll, collapse, unchanged data and zero JS errors', flush=True)
        browser.close()


if __name__ == '__main__':
    main()
