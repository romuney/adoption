#!/usr/bin/env python3
"""Check pa_next CSS against the documented Superset holder/row structure.

This is a local DOM model (playbook 10-board-css, B1), not a live Proteus test.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'Параллельный отчёт — pa_next'


def main():
    config = json.loads((OUT / 'src/ui-build.json').read_text())['configuration']
    css = (OUT / '9. CSS — дашборд.css').read_text()
    main_id, helpers = config['main'], [config['cat'], config['one']]
    unrelated = max([main_id, *helpers]) + 100

    def holder(chart):
        return f'''<div class="dragdroppable dragdroppable-column"><div class="resizable-container" style="height:600px">
<div class="dashboard-component dashboard-component-chart-holder dashboard-chart-id-{chart}">
<div class="chart-slice"><div class="chart-header"><button>Menu {chart}</button></div>
<div class="dashboard-chart"><div class="chart-container"><div class="slice_container"><div>
<div id="chart-id-{chart}" class="react_sanbbox"></div></div></div></div></div></div></div></div></div>'''

    def row(charts, name):
        return f'<div id="{name}" class="dragdroppable dragdroppable-row"><div class="with-popover-menu"><div class="grid-row">'+''.join(map(holder, charts))+'</div></div></div>'

    skeleton = '''.grid-row{display:flex;gap:16px}.dragdroppable-row{margin-bottom:16px}
.dragdroppable-column{flex:1}.dashboard-component-chart-holder{box-sizing:border-box;height:100%;padding:16px;border:2px solid transparent;background:white}
.chart-header{height:32px}.chart-slice,.dashboard-chart,.chart-container,.slice_container,.slice_container>div,.react_sanbbox{height:100%}iframe{width:100%;height:100%;border:0}'''
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
        page = browser.new_page(viewport={'width':1440,'height':1000})
        page.set_content('<style>'+skeleton+css+'</style><div class="dashboard">'+row(helpers,'loaders')+row([main_id],'main')+row([unrelated],'other')+'</div>')
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
        assert page.locator('#loaders').bounding_box()['height'] <= 4
        assert page.locator('#loaders').evaluate('(el)=>getComputedStyle(el).marginBottom') == '0px'
        print('PASS: same-element holders and resizable wrappers collapse before iframe mount; unrelated chart unchanged')
        page.evaluate('window.ready=[];addEventListener("message",e=>{if(e.data.kind==="CSS_READY")ready.push(e.data.id)})')
        for chart in helpers:
            page.locator('#chart-id-'+str(chart)).evaluate('''(el,id)=>{const f=document.createElement('iframe');f.sandbox='allow-scripts';f.srcdoc='<script>parent.postMessage({kind:"CSS_READY",id:'+id+'},"*")<\\/script>';el.appendChild(f)}''',chart)
        page.wait_for_function('ready.length===2')
        for chart in helpers:
            selector = '#chart-id-'+str(chart)+' iframe'
            size = page.locator(selector).bounding_box()
            assert size['width'] > 0 and size['height'] > 0, (chart,size)
            assert page.locator(selector).evaluate('''(el)=>{for(let n=el;n;n=n.parentElement)if(getComputedStyle(n).display==='none')return false;return true}''')
        print('PASS: helper iframe scripts execute with positive dimensions and no display:none ancestors')
        page.locator('.dashboard-chart-id-'+str(helpers[0])).evaluate(
            '(el)=>document.querySelector("#other .grid-row").appendChild(el.closest(".dragdroppable-column"))')
        assert page.locator('#other').bounding_box()['height'] >= 600
        assert page.locator('#other').evaluate('(el)=>getComputedStyle(el).opacity') == '1'
        print('PASS: a mixed row containing an unrelated chart is not collapsed or hidden')
        page.locator('.dashboard').evaluate('(el)=>el.classList.add("dashboard--editing")')
        for chart in helpers:
            selector='.dashboard-chart-id-'+str(chart)
            assert page.locator(selector).evaluate('(el)=>getComputedStyle(el).opacity') == '1'
            assert page.locator(selector).evaluate('(el)=>el.parentElement.getBoundingClientRect().height') == 600
        print('PASS: editing mode restores helper holders; live Proteus mounting remains a manual acceptance check')
        browser.close()

if __name__ == '__main__':
    main()
