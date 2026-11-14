#!/usr/bin/env python3
"""Real delivery inside a local Superset DOM model, with ordinary scrollbars.

This exercises sandbox geometry and browser interaction, not live Proteus or SQL.
Unlike a full-page chart mock, the ECharts host here is sized in pixels by the
platform's ResizeObserver and the iframe is sized by the delivered board CSS.
"""
import argparse
import hashlib
import json
from pathlib import Path

from playwright.sync_api import sync_playwright
from test_ui import OUT, doc, rows, scripts


def mount(page):
    config = json.loads((OUT / 'src/ui-build.json').read_text())['configuration']
    css = (OUT / '9. CSS — дашборд.css').read_text()

    def holder(part):
        chart = config['main' if part == 'head' else part]
        return f'''<div class="dragdroppable dragdroppable-column"><div class="resizable-container" style="height:600px">
<div class="dashboard-component dashboard-component-chart-holder dashboard-chart-id-{chart}">
<div class="chart-slice"><div data-test="slice-header"><span class="header-title">Chart {chart}</span><div class="header-controls"><button>Меню чарта</button></div></div>
<div class="dashboard-chart"><div class="chart-container" style="min-height:520px"><div class="slice_container" style="height:520px"><div>
<div id="chart-id-{chart}" class="react_sanbbox"><iframe name="{part}" sandbox="allow-scripts"></iframe></div>
</div></div></div></div></div></div></div></div>'''

    def row(parts):
        return '<div class="dragdroppable dragdroppable-row"><div class="with-popover-menu"><div class="grid-row">' + ''.join(holder(part) for part in parts) + '</div></div></div>'

    base = '''html,body{margin:0;height:100%;font:14px Arial,Helvetica,sans-serif;background:#f6f6f6}body{overflow:hidden}
#main-menu{height:48px;box-sizing:border-box;padding:14px 24px;background:#fff;border-bottom:1px solid #e7e9ee}
.board-scroller{height:calc(100vh - 48px);overflow:auto}
.dashboard-header-container{height:65px;box-sizing:border-box;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;background:#fff;position:sticky;top:0;z-index:100}
.dashboard-header-container h1{margin:0;font-size:20px}.dashboard-header-container button{padding:8px 12px}
[data-test="filter-bar"]{height:40px}[data-test="dashboard-filters-panel"]{position:absolute;width:200px;height:500px}
.dashboard-content{display:flow-root}.grid-container{margin:24px 32px}.grid-row{display:flex;gap:16px}.dragdroppable-row{margin-bottom:16px}
.dragdroppable-column{flex:1;min-width:0}.dashboard-component-chart-holder{box-sizing:border-box;height:100%;padding:16px;border:2px solid transparent;background:white}
[data-test="slice-header"]{height:32px;flex-shrink:0}.header-controls{display:inline-block}
.chart-slice,.dashboard-chart,.chart-container,.slice_container,.slice_container>div,.react_sanbbox{height:100%}iframe{width:100%;height:100%;border:0}'''
    page.set_content('<!doctype html><html><head><style>' + base + css + '</style></head><body>'
                     '<header id="main-menu">Proteus</header><div class="board-scroller"><div class="dashboard-header-container"><h1>Proteus Adoption · параллельный отчёт</h1>'
                     '<button data-test="edit-dashboard" onclick="window.editClicked=true">Редактировать</button></div>'
                     '<div data-test="dashboard-filters-panel">Native filters</div><div data-test="filter-bar">Native filters</div>'
                     '<div class="dashboard"><div class="dashboard-content"><div class="grid-container"><div class="dashboard-grid"><div class="grid-content">'
                     + row(['cat', 'one']) + row(['head']) + '</div></div></div></div></div></div>'
                     '<script>window.emits=[];addEventListener("message",function(e){if(e.data.type==="TEST_EMIT")emits.push(e.data)});</script></body></html>')
    for part in ['cat', 'one', 'head']:
        html = doc(part, scripts[part], rows[part])
        # Proteus gives the ECharts host a pixel size and updates it separately
        # from the chart script. Do not replace that behavior with height:100%.
        html = html.replace('div[_echarts_instance_]{height:100%;position:relative}',
                            'div[_echarts_instance_]{position:relative}')
        html = html.replace('<div _echarts_instance_="ec">',
                            '<div _echarts_instance_="ec" style="width:1280px;height:600px">')
        platform = '''<script>
var platformHost=document.querySelector('[_echarts_instance_]'),platformTick=null;
function sizePlatform(){platformTick=null;platformHost.style.width=document.body.clientWidth+'px';platformHost.style.height=document.body.clientHeight+'px';}
sizePlatform();new ResizeObserver(function(){if(platformTick===null)platformTick=requestAnimationFrame(sizePlatform)}).observe(document.body);
</script>'''
        html = html.replace('<script>var data=', platform + '<script>var data=')
        page.locator('iframe[name="' + part + '"]').evaluate('(el,html)=>el.srcdoc=html', html)
    frame = page.frame(name='head')
    frame.wait_for_selector('.pa-next-ready')
    page.wait_for_timeout(650)
    return frame


def geometry(frame):
    return frame.evaluate('''() => {
      function rect(selector){var n=document.querySelector(selector),r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height,client:n.clientHeight,scroll:n.scrollHeight,scrollTop:n.scrollTop};}
      return {shell:rect('.pa-next-shell'),head:rect('.pa-next-head'),content:rect('.pa-next-content'),body:rect('.pone-panel-b'),
        svgs:Array.from(document.querySelectorAll('svg[data-dyn-svg]'),n=>{var r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:r.width,height:r.height,viewWidth:n.viewBox.baseVal.width};}),
        iframe:{height:innerHeight,width:innerWidth,scrollY:scrollY,documentHeight:document.documentElement.scrollHeight,documentWidth:document.documentElement.scrollWidth},
        host:{height:document.querySelector('[_echarts_instance_]').style.height,width:document.querySelector('[_echarts_instance_]').style.width},band:window.__paNext.visibleBand};
    }''')


def assert_canvas_fits(frame, label):
    data = geometry(frame)
    assert data['iframe']['scrollY'] == 0, (label, 'iframe scrolled outside shell', data)
    assert data['iframe']['documentWidth'] <= data['iframe']['width'], (label, 'horizontal document overflow', data)
    assert data['iframe']['documentHeight'] <= data['iframe']['height'] + 1, (label, 'vertical document overflow', data)
    assert data['body']['scroll'] <= data['body']['client'] + 1, (label, 'Dynamics has a second vertical scrollbar', data)
    assert len(data['svgs']) == 2, (label, 'two Dynamics charts required', data)
    for svg in data['svgs']:
        assert svg['top'] >= max(data['body']['top'], data['shell']['top'], data['band']['top']) - 1, (label, 'SVG clipped above', data)
        assert svg['bottom'] <= min(data['body']['bottom'], data['shell']['bottom'], data['band']['bottom']) + 1, (label, 'SVG clipped below', data)
        assert abs(svg['width'] - svg['viewWidth']) <= 5, (label, 'SVG resize did not settle', data)
    return data


def wheel_over_chart(page, frame, dy):
    # Real wheel input, at the visible portion of a chart body. A nested overflow
    # container must not eat the scroll that reveals the analytics on a laptop.
    bounds = frame.locator('.pone-panel-b').bounding_box()
    outer = page.locator('iframe[name="head"]').bounding_box()
    assert bounds is not None, ('chart body has no visible box before wheel', geometry(frame), outer,
                                frame.locator('.pone-panel-b').evaluate('(n)=>({display:getComputedStyle(n).display,visibility:getComputedStyle(n).visibility,connected:n.isConnected})'))
    top = max(bounds['y'], outer['y'], 0)
    bottom = min(bounds['y'] + bounds['height'], outer['y'] + outer['height'], page.viewport_size['height'])
    if bottom <= top:
        # At 150% zoom the initial chart body can start below the visible band.
        # Scroll on the visible KPI surface first; subsequent input hits charts.
        bounds = frame.locator('.pa-next-one').bounding_box()
        top = max(bounds['y'], outer['y'], 0)
        bottom = min(bounds['y'] + bounds['height'], outer['y'] + outer['height'], page.viewport_size['height'])
    assert bottom > top, (bounds, outer)
    page.mouse.move(bounds['x'] + bounds['width'] / 2, (top + bottom) / 2)
    page.mouse.wheel(0, dy)
    page.wait_for_timeout(350)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--screenshots', type=Path, default=Path('/tmp/pa-next-viewport'))
    parser.add_argument('--periods', type=Path, help='Optional actual-SQL fixture directory containing head/cat/one.json')
    args = parser.parse_args()
    if args.periods:
        for part in ['head', 'cat', 'one']:
            rows[part] = json.loads((args.periods / (part + '.json')).read_text())
    args.screenshots.mkdir(parents=True, exist_ok=True)
    script_hashes = {part:hashlib.sha256(code.encode()).hexdigest() for part, code in scripts.items()}
    measurements = {'script_sha256':script_hashes}
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                    ignore_default_args=['--hide-scrollbars'])
        page = browser.new_page(viewport={'width':1366, 'height':768}, reduced_motion='reduce')
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        for width, height in [(1366, 768), (1440, 900), (1920, 1080)]:
            page.set_viewport_size({'width':width, 'height':height})
            frame = mount(page)
            label = str(width) + 'x' + str(height)
            initial = geometry(frame)
            assert initial['host']['height'].endswith('px'), initial
            assert initial['shell']['height'] == initial['iframe']['height'], initial
            assert abs(initial['content']['top'] - initial['head']['bottom'] - 12) <= 1, initial
            assert frame.locator('.pa-next-status').bounding_box()['height'] <= 1
            assert not page.locator('[data-test="filter-bar"]').is_visible()
            assert not page.locator('[data-test="slice-header"]').first.is_visible()
            page.screenshot(path=str(args.screenshots / (label + '-initial.png')))
            wheel_over_chart(page, frame, 1000)
            final = assert_canvas_fits(frame, label)
            if height < 1000:
                assert final['shell']['scrollTop'] > 100, (label, 'wheel did not reveal analytics', final)
                assert final['head']['bottom'] <= final['shell']['top'] + 1, (label, 'report filters remain onscreen', final)
            else:
                assert final['shell']['scrollTop'] == 0, (label, 'desktop must fit together', final)
            assert page.evaluate('scrollY') == 0
            assert page.locator('.board-scroller').evaluate('(n)=>n.scrollTop') == 0
            assert page.locator('.dashboard-header-container').bounding_box()['y'] == 48
            page.get_by_role('button', name='Редактировать', exact=True).click()
            assert page.evaluate('window.editClicked')
            page.mouse.move(12, 20)
            page.wait_for_timeout(100)
            page.screenshot(path=str(args.screenshots / (label + '-analytics.png')))
            measurements[label] = {'initial':initial, 'analytics':final}
            print('PASS:', label, 'wheel reveals both charts; dashboard Edit remains available')

        # Same mounted instance: browser resize must pass through platform pixel
        # sizing, shell sizing, and renderer SVG geometry without RO loop errors.
        for width, height in [(1366,768), (1920,1080), (1440,900)]:
            page.set_viewport_size({'width':width,'height':height})
            page.wait_for_timeout(650)
            wheel_over_chart(page, frame, 1000)
            assert_canvas_fits(frame, 'resize '+str(width))
        print('PASS: existing sandbox resizes across laptop/desktop without a clipped SVG')

        splitter = frame.get_by_role('separator', name='Ширина каталога')
        for key in ['Home', 'End', 'Home', 'ArrowRight']:
            splitter.press(key)
            page.wait_for_timeout(250)
            wheel_over_chart(page, frame, 1000)
            assert_canvas_fits(frame, 'splitter '+key)
        frame.locator('.pa-next-cat-toggle').click()
        page.wait_for_timeout(250)
        wheel_over_chart(page, frame, 1000)
        assert_canvas_fits(frame, 'catalogue collapsed')
        assert frame.locator('.pa-next-catalog-rail').is_visible()
        frame.locator('.pa-next-catalog-rail').click()
        print('PASS: splitter extremes and collapsed catalogue retain useful chart height')

        # Return to the header using the wheel, then test a real body-attached
        # dropdown and all guide steps in the actually visible iframe band.
        wheel_over_chart(page, frame, -1500)
        assert geometry(frame)['shell']['scrollTop'] == 0
        frame.locator('[data-pa-next-host="head"] [data-cadd="cal"]').click()
        dropdown = frame.locator('body>.phead-dd')
        drop = dropdown.evaluate('(n)=>{var r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height}}')
        band = frame.evaluate('window.__paNext.visibleBand')
        assert drop['height'] > 300 and drop['top'] >= band['top'] and drop['bottom'] <= band['bottom'] + 1, (drop, band)
        dropdown.locator('[data-cpcancel]').click()
        frame.get_by_text('Как работать', exact=False).first.click()
        count = 0
        while frame.locator('.pa-next-tour').count():
            count += 1
            assert count <= 20
            card = frame.locator('.pa-next-tour-card').evaluate('(n)=>{var r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom}}')
            band = frame.evaluate('window.__paNext.visibleBand')
            assert card['top'] >= band['top'] and card['bottom'] <= band['bottom'] + 1, (count, card, band)
            frame.locator('[data-tour-action="next"]').click()
        assert count >= 12, count
        assert geometry(frame)['shell']['scrollTop'] == 0
        # The header control normally scrolls into view before a click. Also
        # cover callers that open the guide while focused on analytics.
        wheel_over_chart(page, frame, 1000)
        prior_scroll = geometry(frame)['shell']['scrollTop']
        frame.evaluate('window.__paNext.interaction.help()')
        frame.locator('[data-tour-action="next"]').click()
        frame.locator('[data-tour-action="next"]').press('Escape')
        assert geometry(frame)['shell']['scrollTop'] == prior_scroll
        assert page.evaluate('scrollY') == 0

        # Regressions that a fixed 768px screenshot missed: browser chrome/zoom,
        # wrapped dashboard title, a different menu height, and stale pixel
        # height on a real sandbox. No programmatic scrollTo hides an unreachable
        # bottom; use wheel input over the report for each scenario.
        adversarial = [
            ('short-720', 1366, 720, None), ('short-600', 1366, 600, None),
            ('zoom125-equivalent', 1093, 614, None), ('zoom150-equivalent', 911, 512, None),
            ('dashboard-header130', 1366, 768, 'header'),
            ('navigation64', 1366, 768, 'nav'), ('tall-iframe1200', 1366, 768, 'iframe'),
        ]
        for label, width, height, variant in adversarial:
            page.set_viewport_size({'width':width, 'height':height})
            frame = mount(page)
            if variant == 'header':
                page.locator('.dashboard-header-container').evaluate('(n)=>n.style.height="130px"')
            elif variant == 'nav':
                page.locator('#main-menu').evaluate('(n)=>n.style.height="64px"')
                page.locator('.board-scroller').evaluate('(n)=>n.style.height="calc(100vh - 64px)"')
            elif variant == 'iframe':
                page.locator('iframe[name="head"]').evaluate('(n)=>n.closest(".resizable-container").style.setProperty("height","1200px","important")')
            page.wait_for_timeout(650)
            for _ in range(3):
                wheel_over_chart(page, frame, 1000)
            current = assert_canvas_fits(frame, label)
            assert current['body']['client'] >= 300, (label, 'minimum useful Dynamics height lost', current)
            assert current['shell']['height'] <= current['band']['bottom'] - current['band']['top'] + 1, (label, current)
            # Loading an unrelated tab must not reduce the measured minimum and
            # jump the catalogue/analytics grid vertically.
            size = current['content']['height']
            band_height = current['band']['bottom'] - current['band']['top']
            minimum = frame.evaluate('window.__paNext.viewportMinimum')
            for tab in ['who', 'cal', 'dyn']:
                frame.locator('[data-view="view:' + tab + '"]').click()
                page.wait_for_timeout(250)
                after_tab = geometry(frame)
                assert frame.evaluate('window.__paNext.viewportMinimum') == minimum, (label, tab, minimum, after_tab)
                # Clicking a previously offscreen tab can scroll the OUTER board
                # in the deliberately oversized-iframe case. Then visible-band
                # height changes and fitting to the new band is intentional.
                next_band_height = after_tab['band']['bottom'] - after_tab['band']['top']
                if abs(next_band_height - band_height) <= 1:
                    assert abs(after_tab['content']['height'] - size) <= 1, (label, tab, size, after_tab)
                size, band_height = after_tab['content']['height'], next_band_height
            for _ in range(2):
                wheel_over_chart(page, frame, 1000)
            measurements[label] = assert_canvas_fits(frame, label + ' after tabs')
            page.mouse.move(12, 20)
            page.screenshot(path=str(args.screenshots / (label + '-analytics.png')))
            assert page.get_by_role('button', name='Редактировать', exact=True).is_visible()
            print('PASS:', label, 'both charts reachable through one report scroll surface')
        page.wait_for_timeout(650)
        settled = frame.evaluate('''() => new Promise(resolve => {
          var shell=document.querySelector('.pa-next-shell'),content=document.querySelector('.pa-next-content');
          var changes=0,initial=[shell.style.height,shell.style.top,content.style.height,window.__paNext.viewportMinimum];
          var observer=new MutationObserver(function(records){changes+=records.length});
          observer.observe(shell,{attributes:true,attributeFilter:['style']});
          observer.observe(content,{attributes:true,attributeFilter:['style']});
          setTimeout(function(){observer.disconnect();resolve({changes:changes,initial:initial,final:[shell.style.height,shell.style.top,content.style.height,window.__paNext.viewportMinimum]})},1000);
        })''')
        assert settled['changes'] == 0 and settled['initial'] == settled['final'], settled
        print('PASS: viewport sizing settles without repeated style writes or ResizeObserver loops')
        assert not errors, errors
        measurements['errors'] = errors
        names = {'head':'4. JS — весь отчёт.js','cat':'6. JS — загрузчик каталога.js','one':'8. JS — загрузчик панели.js'}
        assert script_hashes == {part:hashlib.sha256((OUT / name).read_bytes()).hexdigest() for part, name in names.items()}, 'Delivery changed while viewport tests were running'
        (args.screenshots / 'metrics.json').write_text(json.dumps(measurements, ensure_ascii=False, indent=2))
        print('PASS: calendar and', count, 'guide steps fit visible band; zero page/ResizeObserver errors')
        print('Screenshots and measurements:', args.screenshots)
        browser.close()


if __name__ == '__main__':
    main()
