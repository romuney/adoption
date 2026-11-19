#!/usr/bin/env python3
"""Check pa_next CSS against the documented Superset holder/row structure.

This is a local DOM model (playbook 10-board-css, B1), not a live Proteus test.
Native filter/header selectors also match the Apache Superset 2.1.0 sources.
"""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'Параллельный отчёт — pa_next'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--css', type=Path, default=OUT / '9. CSS — дашборд.css')
    parser.add_argument('--metadata', type=Path, default=OUT / '10. JSON — области фильтров.json')
    args = parser.parse_args()
    config = json.loads((OUT / 'src/ui-build.json').read_text())['configuration']
    css = args.css.read_text()
    metadata = json.loads(args.metadata.read_text())
    assert metadata['show_native_filters'] is False
    assert metadata['native_filter_configuration'] == []
    main_id, helpers = config['main'], [config['cat'], config['one']]
    unrelated = max([main_id, *helpers]) + 100
    chart_selector = '.dashboard-chart-id-' + str(main_id)

    def holder(chart):
        # Superset 2.1.0 has data-test=slice-header without the legacy chart-header class.
        return f'''<div class="dragdroppable dragdroppable-column"><div class="resizable-container" style="height:600px">
<div class="dashboard-component dashboard-component-chart-holder dashboard-chart-id-{chart}">
<div class="chart-slice"><div data-test="slice-header"><span class="header-title">Chart {chart}</span><div class="header-controls"><button>Menu {chart}</button></div></div>
<div class="dashboard-chart"><div class="chart-container" style="min-height:520px"><div class="slice_container" style="height:520px"><div>
<div id="chart-id-{chart}" class="react_sanbbox"></div></div></div></div></div></div></div></div></div>'''

    def row(charts, name):
        return f'<div id="{name}" class="dragdroppable dragdroppable-row"><div class="with-popover-menu"><div class="grid-row">'+''.join(map(holder, charts))+'</div></div></div>'

    skeleton = '''body{margin:0}#main-menu{height:48px}.dashboard-header-container{height:65px;display:flex;align-items:center;gap:16px}.dashboard-header-container h1{margin:0}
[data-test="filter-bar"]{height:40px}[data-test="dashboard-filters-panel"]{position:absolute;width:200px;height:500px}
.dashboard-content{display:flow-root}.grid-container{margin:24px 32px}.grid-row{display:flex;gap:16px}.dragdroppable-row{margin-bottom:16px}
.dragdroppable-column{flex:1}.dashboard-component-chart-holder{box-sizing:border-box;height:100%;padding:16px;border:2px solid transparent;background:white}
[data-test="slice-header"]{height:32px;flex-shrink:0}.header-controls{display:inline-block}
.chart-slice,.dashboard-chart,.chart-container,.slice_container,.slice_container>div,.react_sanbbox{height:100%}iframe{width:100%;height:100%;border:0}'''

    def markup(rows):
        return ('<style>'+skeleton+css+'</style><header id="main-menu">Proteus</header>'
                '<div class="dashboard-header-container"><h1 class="header-title">Dashboard title</h1><div class="header-controls"><button data-test="edit-dashboard" onclick="window.editClicked=true">Редактировать</button></div></div>'
                '<div data-test="dashboard-filters-panel">Vertical filters</div><div data-test="filter-bar">Horizontal filters</div>'
                '<div class="dashboard"><div class="dashboard-content" style="margin-left:200px"><div class="grid-container">'
                '<div class="dashboard-grid"><div class="grid-content">'+rows+'</div></div></div></div></div>')

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
        page = browser.new_page(viewport={'width':1440,'height':1000})
        page.set_content(markup(row(helpers,'loaders')+row([main_id],'main')+row([unrelated],'other')))
        for chart in helpers:
            selector = '.dashboard-chart-id-'+str(chart)
            assert page.locator(selector).evaluate('(el)=>el.classList.contains("dashboard-component-chart-holder")')
            rect = page.locator(selector).bounding_box()
            assert 0 < rect['height'] <= 4, ('pre-iframe helper height',chart,rect)
            outer = page.locator(selector).evaluate('(el)=>el.parentElement.getBoundingClientRect().height')
            assert 0 < outer <= 4, ('resizable wrapper height',chart,outer)
            assert page.locator(selector).evaluate('(el)=>getComputedStyle(el).opacity') == '0'
        assert page.locator('#other .resizable-container').bounding_box()['height'] == 600
        assert page.locator('.dashboard-chart-id-'+str(unrelated)).evaluate('(el)=>getComputedStyle(el).opacity') == '1'
        assert page.locator('#other [data-test="slice-header"]').is_visible()
        assert page.locator('#loaders').bounding_box()['height'] <= 4
        assert page.locator('#loaders').evaluate('(el)=>getComputedStyle(el).marginBottom') == '0px'
        for selector in ['[data-test="dashboard-filters-panel"]','[data-test="filter-bar"]',chart_selector+' [data-test="slice-header"]']:
            assert not page.locator(selector).is_visible(), ('view-mode service chrome visible',selector)
        assert page.locator('#main-menu').is_visible()
        assert page.locator('.dashboard-header-container').is_visible()
        assert page.locator('.dashboard-header-container .header-title').is_visible()
        page.get_by_role('button', name='Редактировать', exact=True).click()
        assert page.evaluate('window.editClicked') is True
        assert page.locator('.dashboard-content').evaluate('(el)=>getComputedStyle(el).marginLeft') == '0px'
        print('PASS: dashboard header/title/edit button visible and clickable; chart headers/native filters hidden; unrelated chart unchanged')

        # First load: stale platform pixel heights must not keep any layer at 520px.
        for height in [760,1080]:
            page.set_viewport_size({'width':1440,'height':height})
            host = page.locator(chart_selector).bounding_box()
            assert abs(host['y']+host['height']-(height-16)) <= 1, ('viewport fit before iframe',height,host)
            for selector in ['.chart-slice','.dashboard-chart','.chart-container','.slice_container','.react_sanbbox']:
                rect = page.locator(chart_selector+' '+selector).bounding_box()
                assert abs(rect['height']-host['height']) <= 1, ('pre-iframe height chain',selector,rect,host)
        print('PASS: first-load chart follows two viewport heights and overrides stale platform pixel heights')

        page.evaluate('window.ready=[];addEventListener("message",e=>{if(e.data.kind==="CSS_READY")ready.push(e.data.id)})')
        for chart in [main_id,*helpers]:
            page.locator('#chart-id-'+str(chart)).evaluate(r'''(el,id)=>{const f=document.createElement('iframe');f.sandbox='allow-scripts';f.height='400';f.srcdoc='<script>parent.postMessage({kind:"CSS_READY",id:'+id+'},"*")<\/script>';el.appendChild(f)}''',chart)
        page.wait_for_function('ready.length===3')
        for chart in helpers:
            selector = '#chart-id-'+str(chart)+' iframe'
            size = page.locator(selector).bounding_box()
            assert size['width'] > 0 and size['height'] > 0, (chart,size)
            assert page.locator(selector).evaluate('''(el)=>{for(let n=el;n;n=n.parentElement)if(getComputedStyle(n).display==='none')return false;return true}''')
        for height in [760,1080]:
            page.set_viewport_size({'width':1440,'height':height})
            host = page.locator(chart_selector).bounding_box()
            frame = page.locator(chart_selector+' iframe').bounding_box()
            assert abs(host['y']+host['height']-(height-16)) <= 1, ('viewport fit after iframe',height,host)
            assert abs(frame['height']-host['height']) <= 1 and abs(frame['y']-host['y']) <= 1, ('iframe full cell',frame,host)
        print('PASS: iframe fills chart across resize; helper scripts run with positive dimensions and no display:none ancestors')

        # Production diagnostic (2026-11-14): the 48px navigation exists without
        # #main-menu. Its missing ID must not reclaim the menu's actual height.
        page.locator('#main-menu').evaluate('(el)=>{el.style.height="48px";el.id="corporate-navigation"}')
        for height in [760, 963, 1080]:
            page.set_viewport_size({'width':1658,'height':height})
            host = page.locator(chart_selector).bounding_box()
            assert page.locator('.dashboard-header-container').bounding_box()['y'] == 48
            assert page.locator('.grid-container').evaluate('(el)=>getComputedStyle(el).getPropertyValue("--pa-next-nav-height")') == '48px', ('missing menu ID incorrectly reclaimed navigation height', host)
            assert abs(host['y']+host['height']-(height-16)) <= 1, ('corporate navigation viewport fit',height,host)
            assert page.get_by_role('button', name='Редактировать', exact=True).is_visible()
        print('PASS: corporate navigation without #main-menu keeps its 48px reserve across resize')

        # Updating a mounted chart must not let the platform's loading layer capture clicks.
        page.locator(chart_selector+' .chart-container').evaluate('''el=>{
            el.style.pointerEvents='none';
            el.insertAdjacentHTML('beforeend','<div data-test="loading-indicator">Loading</div><div id="platform-overlay" style="pointer-events:auto">Overlay</div>');
        }''')
        assert not page.locator('[data-test="loading-indicator"]').is_visible()
        assert page.locator('#platform-overlay').evaluate('(el)=>getComputedStyle(el).pointerEvents') == 'none'
        assert page.locator(chart_selector+' iframe').evaluate('(el)=>getComputedStyle(el).pointerEvents') == 'auto'
        print('PASS: platform loading overlay no longer blocks the mounted interactive chart')

        # A genuinely embedded page can explicitly release the navigation
        # reserve. The absence of an implementation-specific ID is not proof.
        page.locator('#corporate-navigation').evaluate('(el)=>el.remove()')
        page.locator('.grid-container').evaluate('(el)=>el.style.setProperty("--pa-next-nav-height","0px")')
        host = page.locator(chart_selector).bounding_box()
        assert abs(host['y']+host['height']-(1080-16)) <= 1, ('standalone viewport fit',host)
        page.locator('.dashboard-header-container').evaluate('(el)=>el.remove()')
        host = page.locator(chart_selector).bounding_box()
        assert abs(host['y']+host['height']-(1080-16)) <= 1, ('standalone without dashboard header',host)
        # Restore the ordinary visible header before checking the editor.
        page.locator('.dashboard').evaluate('''el=>{
          const header=document.createElement('div');header.className='dashboard-header-container';
          header.textContent='Dashboard title';el.before(header);
        }''')
        page.locator('.dashboard-chart-id-'+str(helpers[0])).evaluate(
            '(el)=>document.querySelector("#other .grid-row").appendChild(el.closest(".dragdroppable-column"))')
        assert page.locator('#other').bounding_box()['height'] >= 600
        assert page.locator('#other').evaluate('(el)=>getComputedStyle(el).opacity') == '1'
        print('PASS: standalone height adapts; mixed row containing an unrelated chart is not collapsed')

        page.locator('.dashboard').evaluate('(el)=>el.classList.add("dashboard--editing")')
        for chart in [main_id,*helpers]:
            selector='.dashboard-chart-id-'+str(chart)
            assert page.locator(selector).evaluate('(el)=>getComputedStyle(el).opacity') == '1'
            assert page.locator(selector).evaluate('(el)=>el.parentElement.getBoundingClientRect().height') == 600
            assert page.locator(selector+' [data-test="slice-header"]').is_visible()
        assert page.locator('.dashboard-header-container').is_visible()
        assert page.locator('[data-test="dashboard-filters-panel"]').is_visible()
        assert page.locator('[data-test="filter-bar"]').is_visible()
        assert page.locator('[data-test="loading-indicator"]').is_visible()
        assert page.locator('#platform-overlay').evaluate('(el)=>getComputedStyle(el).pointerEvents') == 'auto'
        print('PASS: editing restores service chrome, chart menus and manual dimensions')

        page.set_content(markup(row([unrelated],'other')))
        assert page.locator('.dashboard-header-container').is_visible()
        assert page.locator('[data-test="dashboard-filters-panel"]').is_visible()
        assert page.locator('[data-test="filter-bar"]').is_visible()
        assert page.locator('#other .resizable-container').bounding_box()['height'] == 600
        print('PASS: a board without pa_next main is unaffected; live Proteus mounting remains a manual acceptance check')
        browser.close()

if __name__ == '__main__':
    main()
