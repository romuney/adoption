#!/usr/bin/env python3
"""Real delivery inside a local Superset DOM model, with ordinary scrollbars.

This exercises sandbox geometry and browser interaction, not live Proteus or SQL.
Unlike a full-page chart mock, the ECharts host here is sized in pixels by the
platform's ResizeObserver and the iframe is sized by the delivered board CSS.
"""
import argparse
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
        assert svg['top'] >= max(data['body']['top'], data['shell']['top']) - 1, (label, 'SVG clipped above', data)
        assert svg['bottom'] <= min(data['body']['bottom'], data['shell']['bottom']) + 1, (label, 'SVG clipped below', data)
        assert abs(svg['width'] - svg['viewWidth']) <= 5, (label, 'SVG resize did not settle', data)
    return data


def wheel_over_chart(page, frame, dy):
    # Real wheel input, at the visible portion of a chart body. A nested overflow
    # container must not eat the scroll that reveals the analytics on a laptop.
    bounds = frame.locator('.pone-panel-b').bounding_box()
    outer = page.locator('iframe[name="head"]').bounding_box()
    top, bottom = max(bounds['y'], outer['y']), min(bounds['y'] + bounds['height'], outer['y'] + outer['height'])
    assert bottom > top, (bounds, outer)
    page.mouse.move(bounds['x'] + bounds['width'] / 2, (top + bottom) / 2)
    page.mouse.wheel(0, dy)
    page.wait_for_timeout(350)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--screenshots', type=Path, default=Path('/tmp/pa-next-viewport'))
    args = parser.parse_args()
    args.screenshots.mkdir(parents=True, exist_ok=True)
    measurements = {}
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
        assert not errors, errors
        measurements['errors'] = errors
        (args.screenshots / 'metrics.json').write_text(json.dumps(measurements, ensure_ascii=False, indent=2))
        print('PASS: calendar and', count, 'guide steps fit visible band; zero page/ResizeObserver errors')
        print('Screenshots and measurements:', args.screenshots)
        browser.close()


if __name__ == '__main__':
    main()
