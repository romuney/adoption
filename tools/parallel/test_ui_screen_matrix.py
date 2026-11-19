#!/usr/bin/env python3
"""Typical 13–32 inch display layouts expressed as CSS viewports and DPR.

Physical inches cannot be inferred by a browser. These are explicit desktop
viewport models, with real generated delivery and SQL-result fixtures; this is
not a live Proteus, monitor readability, or operating-system zoom test.
"""
import argparse
import hashlib
import json
from pathlib import Path

from playwright.sync_api import sync_playwright
import test_ui_viewport as ui


CASES = [
    ('laptop13', 1366, 768, 1), ('retina13', 1280, 800, 2),
    ('laptop14', 1512, 982, 2), ('laptop16', 1536, 960, 1),
    ('desktop', 1920, 1080, 1), ('qhd', 2560, 1440, 1),
    ('scaled4k', 2560, 1440, 1.5), ('native4k', 3840, 2160, 1),
    ('ultrawide', 3440, 1440, 1), ('portrait1080', 1080, 1920, 1),
    ('portrait1440', 1440, 2560, 1),
]


PROBE = r'''() => {
  function rect(sel) {var n=document.querySelector(sel),r=n.getBoundingClientRect();
    return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,
      clientHeight:n.clientHeight,scrollHeight:n.scrollHeight,scrollTop:n.scrollTop,
      offsetWidth:n.offsetWidth,clientWidth:n.clientWidth,scrollWidth:n.scrollWidth};}
  var split=document.querySelector('.pa-next-splitter'),s=split.getBoundingClientRect(),
    css=getComputedStyle(split,'::before'),matrix=new DOMMatrixReadOnly(css.transform),
    cat=rect('.prb-panel'),panel=rect('.pone-panel'),shell=rect('.pa-next-shell'),
    kpis=document.querySelector('.pone-kpis')?rect('.pone-kpis'):panel;
  var fonts={};
  ['.pone-k-val','.pone-h-ttl','.pone-sub-tab','.prb-tab'].forEach(function(sel){
    var n=document.querySelector(sel);if(n){var c=getComputedStyle(n);fonts[sel]=[c.fontFamily,c.fontSize];}
  });
  var scales=Array.from(document.querySelectorAll('svg[data-dyn-svg] text'),function(n){
    var m=n.getScreenCTM();return {sx:Math.hypot(m.a,m.b),sy:Math.hypot(m.c,m.d),font:getComputedStyle(n).fontSize};
  });
  var numericGroups=[];
  document.querySelectorAll('.pone-k-sub').forEach(function(sub){
    var walker=document.createTreeWalker(sub,NodeFilter.SHOW_TEXT),text;
    while((text=walker.nextNode())) {
      // A numeric group can be plain text (the CA denominator), not just <b>.
      // Read its actual text range, including ordinary/nbsp/narrow/thin spaces.
      var re=/\d{1,3}(?:[ \u00a0\u202f\u2009]\d{3})+/g,match;
      while((match=re.exec(text.textContent))) {
        var range=document.createRange();range.setStart(text,match.index);
        range.setEnd(text,match.index+match[0].length);
        var rs=Array.from(range.getClientRects()),card=sub.closest('.pone-kpi').getBoundingClientRect();
        numericGroups.push({text:match[0],font:getComputedStyle(text.parentElement).fontSize,
          cardOverflow:Math.max(0,...rs.flatMap(function(r){return [card.left-r.left,r.right-card.right]})),
          rects:rs.map(function(r){return {left:r.left,top:r.top,width:r.width,height:r.height};})});
      }
    }
  });
  var barX=s.left+parseFloat(css.left)+matrix.e+parseFloat(css.width)/2,
    barY=s.top+parseFloat(css.top)+matrix.f+parseFloat(css.height)/2,
    cardCenterY=(Math.max(cat.top,kpis.top,shell.top)+Math.min(cat.bottom,panel.bottom,shell.bottom))/2;
  return {shell:rect('.pa-next-shell'),head:rect('.phead-overlay'),content:rect('.pa-next-content'),
    cat:cat,kpis:kpis,panel:panel,body:rect('.pone-panel-b'),
    dynamics:!!document.querySelector('.pone-panel-b.dyn-wrap'),
    alignment:{rightDelta:rect('.phead-overlay').right-panel.right,leftDelta:rect('.phead-overlay').left-cat.left},
    splitter:{barX:barX,barY:barY,gapCenterX:(cat.right+kpis.left)/2,
      horizontalError:barX-(cat.right+kpis.left)/2,rowCenterY:s.top+s.height/2,
      cardsCenterY:cardCenterY,verticalCardOffset:barY-cardCenterY,hitWidth:s.width},
    fonts:fonts,numericGroups:numericGroups,kpiPrevious:Array.from(document.querySelectorAll('.pone-k-sub b'),function(n){
      var box=n.closest('.pone-kpi').getBoundingClientRect(),rs=Array.from(n.getClientRects());
      return {text:n.textContent,font:getComputedStyle(n).fontSize,
        cardOverflow:Math.max(0,...rs.flatMap(function(r){return [box.left-r.left,r.right-box.right]})),
        rects:rs.map(function(r){return {left:r.left,top:r.top,width:r.width,height:r.height};})};
    }),svgScaleError:Math.max(0,...scales.flatMap(function(t){return [Math.abs(t.sx-1),Math.abs(t.sy-1)]})),
    svgTexts:scales.length,dpr:devicePixelRatio,
    band:window.__paNext.visibleBand,document:{width:document.documentElement.scrollWidth,
      height:document.documentElement.scrollHeight,innerWidth:innerWidth,innerHeight:innerHeight,scrollY:scrollY}};
}'''


def outside(frame, page, label):
    data = frame.evaluate(PROBE)
    doc = data['document']
    assert doc['width'] <= doc['innerWidth'] and doc['height'] <= doc['innerHeight'] + 1, (label, doc)
    assert doc['scrollY'] == 0, (label, doc)
    outer = page.evaluate('''() => {
      var n=document.querySelector('.board-scroller');return {x:scrollX,y:scrollY,
        width:document.documentElement.scrollWidth,innerWidth:innerWidth,
        top:n.scrollTop,height:n.clientHeight,scrollHeight:n.scrollHeight};
    }''')
    assert outer['x'] == outer['y'] == outer['top'] == 0, (label, outer)
    assert outer['width'] <= outer['innerWidth'] and outer['scrollHeight'] <= outer['height'] + 1, (label, outer)
    assert abs(data['alignment']['rightDelta']) <= 1 and abs(data['alignment']['leftDelta']) <= 1, (label, data['alignment'])
    assert abs(data['splitter']['horizontalError']) <= 1, (label, data['splitter'])
    assert abs(data['splitter']['verticalCardOffset']) <= 1, (label, data['splitter'])
    assert data['svgScaleError'] <= .002, (label, data['svgScaleError'])
    if data['dynamics']:
        data['dynamicsContent'] = dynamics_content(frame, label)
    assert all(len(value['rects']) <= 1 for value in data['kpiPrevious']), (label, 'numeric group wrapped',data['kpiPrevious'])
    assert all(value['cardOverflow'] <= .5 for value in data['kpiPrevious']), (label, 'numeric group exceeds its card',data['kpiPrevious'])
    for value in data['numericGroups']:
        tops = [rect['top'] for rect in value['rects']]
        assert tops and max(tops)-min(tops) <= .5, (label, 'plain numeric group wrapped',value)
        assert value['cardOverflow'] <= .5, (label, 'plain numeric group exceeds its card',value)
    assert page.get_by_role('button', name='Редактировать', exact=True).is_visible()
    return data


def dynamics_content(frame, label):
    """Single vertical scroll surface must not be achieved by clipping content."""
    data = frame.locator('.pone-panel-b.dyn-wrap').evaluate('''n=>{
      var r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,
        offsetWidth:n.offsetWidth,clientWidth:n.clientWidth,
        children:Array.from(n.children).filter(function(c){var s=getComputedStyle(c);
          return s.display!=='none'&&s.visibility!=='hidden'&&s.position!=='absolute';
        }).map(function(c){var q=c.getBoundingClientRect();return {
          element:c.tagName,cls:c.getAttribute('class'),top:q.top,bottom:q.bottom,height:q.height};})};
    }''')
    # Integer widths distinguish a real scrollbar from fractional CSS pixels;
    # this body has no border. Controls between the plots must fit too.
    assert data['offsetWidth'] == data['clientWidth'], (label,'unnecessary Dynamics scrollbar',data)
    assert len(data['children']) >= 3, (label,'Dynamics fixture lacks plots or controls',data)
    for child in data['children']:
        assert child['top'] >= data['top']-.5 and child['bottom'] <= data['bottom']+.5, (label,'Dynamics content clipped',child,data)
    return data


def wheel(page, frame, selector, delta):
    # Resolve each DOM rectangle atomically: source resize can replace a node.
    target = frame.locator(selector).evaluate('''n=>{var r=n.getBoundingClientRect();
      return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}''')
    iframe = page.locator('iframe[name="head"]').bounding_box()
    x = iframe['x'] + (target['left']+target['right'])/2
    top = max(iframe['y'], iframe['y']+target['top'])
    bottom = min(page.viewport_size['height'], iframe['y']+iframe['height'], iframe['y']+target['bottom'])
    assert bottom > top, (selector, target, iframe)
    page.mouse.move(x, (top+bottom)/2)
    page.mouse.wheel(0, delta)
    page.wait_for_timeout(220)


def visible_control(frame, selector):
    return frame.locator(selector).evaluate('''n=>{
      var r=n.getBoundingClientRect(),b=window.__paNext.visibleBand;
      var hit=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);
      return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height,
        visible:r.top>=b.top-1&&r.bottom<=b.bottom+1&&r.left>=0&&r.right<=innerWidth,
        hit:hit===n||n.contains(hit)};
    }''')


def clear_hover(page, frame):
    # Leaving an opaque iframe directly does not guarantee its delegated
    # mousemove listener sees a non-tooltip target. Cross the blank header
    # padding first, through real pointer input, then move off the report.
    rect = frame.locator('.pone-panel-h').evaluate('''n=>{var r=n.getBoundingClientRect();
      return {x:r.left+8,y:r.top+8};}''')
    outer = page.locator('iframe[name="head"]').bounding_box()
    page.mouse.move(outer['x']+rect['x'],outer['y']+rect['y'])
    page.wait_for_timeout(150)
    page.mouse.move(5,20)
    page.wait_for_timeout(250)


def overlays(page, frame, output, label):
    wheel(page, frame, '.pa-next-one', -10000)
    frame.locator('[data-pa-next-host="head"] [data-cadd="cal"]').click()
    dropdown = visible_control(frame, 'body>.phead-dd')
    assert dropdown['visible'] and dropdown['height'] > 300, (label, dropdown)
    page.screenshot(path=str(output/(label+'-date-dropdown.png')), scale='css')
    frame.locator('body>.phead-dd [data-cpcancel]').click()
    frame.locator('[data-pa-next-host="head"] [data-cadd="org"]').click()
    org = visible_control(frame, 'body>.phead-dd')
    assert org['visible'], (label, org)
    frame.locator('body').press('Escape')
    frame.locator('[data-tourstart]').click()
    frame.locator('[data-tour-route="overview"]').click()
    count = 0
    while frame.locator('.pa-next-tour').count():
        count += 1
        assert count <= 20
        card = visible_control(frame, '.pa-next-tour-card')
        button = visible_control(frame, '[data-tour-action="next"]')
        assert card['visible'] and button['visible'] and button['hit'], (label, count, card, button)
        if count == 5:
            page.screenshot(path=str(output/(label+'-guide.png')), scale='css')
        frame.locator('[data-tour-action="next"]').click()
    assert count >= 12, count
    return {'calendar':dropdown, 'organisation':org, 'guideSteps':count}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--periods', type=Path, default=Path('/tmp/pa-next-periods/d'))
    parser.add_argument('--output', type=Path, default=Path('/tmp/pa-next-screen-matrix'))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    for part in ['head', 'cat', 'one']:
        ui.rows[part] = json.loads((args.periods/(part+'.json')).read_text())
    files = {'main':'4. JS — весь отчёт.js', 'css':'9. CSS — дашборд.css',
             'cat':'6. JS — загрузчик каталога.js', 'one':'8. JS — загрузчик панели.js'}
    hashes = {key:hashlib.sha256((ui.OUT/name).read_bytes()).hexdigest() for key,name in files.items()}
    result = {'completed':False, 'sha256':hashes, 'screenshotScale':'css', 'cases':{},
              'scope':'Local opaque sandbox and real SQL-result fixtures; CSS viewport/DPR, not physical inches or live Proteus.'}
    baseline_fonts = None
    with sync_playwright() as p:
        browser = None
        current_dpr = None
        for model, width, height, dpr in CASES:
            if current_dpr != dpr:
                if browser:
                    browser.close()
                # Playwright context emulation does not propagate DPR into this
                # opaque OOPIF in system Chromium. Native process scale does;
                # assert both parent and iframe values instead of spoofing JS.
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                            args=['--force-device-scale-factor='+str(dpr)],
                                            ignore_default_args=['--hide-scrollbars'])
                current_dpr = dpr
            label = model+'-'+str(width)+'x'+str(height)
            page = browser.new_page(viewport={'width':width,'height':height},
                                    device_scale_factor=dpr, reduced_motion='reduce')
            errors = []
            page.on('pageerror', lambda error:errors.append(str(error)))
            frame = ui.mount(page)
            case = {'viewport':{'width':width,'height':height},'dpr':dpr, 'tabs':{}}
            result['cases'][label] = case
            try:
                initial = outside(frame, page, label+' initial')
                case['initial'] = initial
                assert initial['dpr'] == page.evaluate('devicePixelRatio') == dpr, (label,initial['dpr'])
                assert initial['numericGroups'], (label, 'SQL fixture did not exercise grouped KPI digits')
                if baseline_fonts is None:
                    baseline_fonts = initial['fonts']
                assert initial['fonts'] == baseline_fonts, (label, initial['fonts'], baseline_fonts)
                page.screenshot(path=str(args.output/(label+'-dyn-initial.png')), scale='css')
                wheel(page, frame, '.pone-panel-b', 10000)
                ui.assert_canvas_fits(frame, label)
                dyn = outside(frame, page, label+' dyn')
                if dyn['shell']['scrollHeight'] > dyn['shell']['clientHeight'] + 1:
                    assert abs(dyn['shell']['scrollHeight']-dyn['shell']['clientHeight']-dyn['shell']['scrollTop']) <= 1, (label, dyn['shell'])
                    assert dyn['head']['bottom'] <= dyn['shell']['top'] - 1, (label, 'header remnant', dyn['head'])
                case['tabs']['dyn'] = dyn
                clear_hover(page, frame)
                page.screenshot(path=str(args.output/(label+'-dyn-analytics.png')), scale='css')
                for tab in ['cal','who']:
                    frame.locator('[data-view="view:'+tab+'"]').click()
                    page.wait_for_timeout(250)
                    wheel(page, frame, '.pone-panel-b', 10000)
                    tab_data = outside(frame, page, label+' '+tab)
                    assert all(baseline_fonts.get(key) == value for key,value in tab_data['fonts'].items()), (label,tab,tab_data['fonts'])
                    assert frame.locator('[data-view="view:'+tab+'"]').get_attribute('aria-selected') == 'true'
                    if tab == 'cal':
                        assert frame.locator('.pone-cal-c,.pone-cal-mg .d').count() > 20
                        body = tab_data['body']
                        assert body['scrollTop'] >= body['scrollHeight']-body['clientHeight']-1, (label, 'calendar bottom unreachable',body)
                    else:
                        pager = visible_control(frame, '[data-pg="next"]')
                        assert pager['visible'] and pager['hit'], (label, pager)
                        first = frame.locator('.who-people tbody tr').first.inner_text()
                        frame.locator('[data-pg="next"]').click()
                        assert frame.locator('.who-people tbody tr').first.inner_text() != first
                        frame.locator('[data-pg="prev"]').click()
                    case['tabs'][tab] = tab_data
                    clear_hover(page, frame)
                    page.screenshot(path=str(args.output/(label+'-'+tab+'.png')), scale='css')
                if model in ['laptop13','retina13','portrait1080','portrait1440','ultrawide']:
                    # Guide targets depend on the active tab; Dynamics exposes
                    # KPI and observations, so this covers every available step.
                    frame.locator('[data-view="view:dyn"]').click()
                    page.wait_for_timeout(200)
                    case['overlays'] = overlays(page, frame, args.output, label)
                    frame.get_by_role('separator',name='Ширина каталога').press('Home')
                    assert frame.locator('.pa-next-cat').bounding_box()['width'] == 420
                    frame.locator('.pa-next-cat-toggle').click()
                    assert not frame.locator('.pa-next-cat').is_visible()
                    assert not frame.locator('.pa-next-splitter').is_visible()
                    wheel(page, frame, '.pone-panel-b', 10000)
                    ui.assert_canvas_fits(frame, label+' collapsed')
                    case['collapsedDynamics'] = dynamics_content(frame, label+' collapsed')
                    clear_hover(page, frame)
                    page.screenshot(path=str(args.output/(label+'-collapsed.png')), scale='css')
                    frame.locator('.pa-next-catalog-rail').click()
                    assert frame.locator('.pa-next-cat').bounding_box()['width'] == 420
                    case['minimumAndCollapse'] = True
                assert page.evaluate('emits') == [], (label, 'local layout emitted queries',page.evaluate('emits'))
                assert not errors, (label, errors)
                case['errors'] = errors
                case['completed'] = True
                print('PASS:', label, 'DPR',dpr,'dyn/cal/who; aligned edges; reachable controls',flush=True)
            except Exception as error:
                case['failure'] = str(error)
                page.screenshot(path=str(args.output/(label+'-failure.png')), scale='css')
                (args.output/'metrics.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
                raise
            page.close()
            (args.output/'metrics.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
        browser.close()
    assert hashes == {key:hashlib.sha256((ui.OUT/name).read_bytes()).hexdigest() for key,name in files.items()}, 'Delivery changed during screen matrix'
    result['completed'] = True
    (args.output/'metrics.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print('PASS: all',len(CASES),'screen models; delivery SHA unchanged; artifacts:',args.output,flush=True)


if __name__ == '__main__':
    main()
