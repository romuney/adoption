#!/usr/bin/env python3
"""Read-only header console collector: DOM/CSS evidence and real click history."""
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

from header_reveal import header_reveal_css

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'Параллельный отчёт — pa_next/15. Консоль — диагностика шапки.js'


def main():
    source = SOURCE.read_text()
    html = '''<!doctype html><html><head><meta charset="utf-8"><style>
      body{margin:0}.dashboard-header-container{height:65px;background:white}
      .grid-container{--pa-next-board-header-height:65px}
      </style><style>''' + header_reveal_css(859562) + '''</style></head><body>
      <nav style="height:48px">PRIVATE-NAV-TITLE</nav><div id="app">
      <div class="dashboard-header-container"><h1>PRIVATE-REPORT-TITLE</h1><button>Edit</button></div>
      <div class="grid-container"><div class="fork-rich-text">
      <p><a href="#app" title="Открыть шапку дашборда">Открыть шапку дашборда</a></p>
      <p><a href="#pa-next-header-closed-859562">Закрыть шапку дашборда</a></p>
      </div><div id="chart-id-859562" class="dashboard-component-chart-holder dashboard-chart-id-859562">
      <input value="PRIVATE-FILTER-VALUE"><table><tr><td>PRIVATE-LOGIN</td></tr></table>
      </div></div></div><iframe srcdoc="<p>opaque sandbox</p>" sandbox="allow-scripts"></iframe>
      </body></html>'''
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
        page = browser.new_page(viewport={'width': 1366, 'height': 768})
        page.route('http://pa-next.test/**', lambda route: route.fulfill(body=html, content_type='text/html'))
        page.goto('http://pa-next.test/dashboard/?token=PRIVATE-URL-TOKEN')
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        # Production has at least 150 sheets before the header rules. The first
        # collector silently omitted everything after sheet 149. Keep the real
        # helper at the end to verify complete stylesheet inventory.
        page.evaluate('''() => {
          var helper=document.querySelectorAll('style')[1];
          for(var i=0;i<175;i++){
            var s=document.createElement('style');s.textContent='.unrelated-sheet-'+i+'{color:black}';document.head.appendChild(s);
          }
          document.head.appendChild(helper);
        }''')
        before = page.locator('body').inner_html()
        rect_before = page.locator('.dashboard-header-container').bounding_box()
        result = page.evaluate(source)
        assert result == {'context': 'top', 'controls': 2, 'headers': 1, 'save': '__paHeaderDiag.save()'}, result
        assert page.locator('body').inner_html() == before
        assert page.locator('.dashboard-header-container').bounding_box() == rect_before
        # Real hit testing and anchor navigation, including the final event state.
        page.mouse.click(600, 50)
        page.wait_for_timeout(400)
        assert page.evaluate('location.hash') == '#app'
        page.mouse.click(600, 50)
        page.wait_for_timeout(400)
        assert page.evaluate('location.hash') == '#pa-next-header-closed-859562'
        page.evaluate('document.addEventListener("click",e=>e.preventDefault(),{once:true})')
        page.mouse.click(600, 50)
        page.wait_for_timeout(400)
        assert page.evaluate('location.hash') == '#pa-next-header-closed-859562'
        text = page.evaluate('__paHeaderDiag.finish()')
        data = json.loads(text)
        initial = data['initial']
        assert initial['selectorCounts']['enabled'] == 1
        assert initial['selectorCounts']['opened'] == 0
        assert initial['links'][0]['expectedTitle']
        assert initial['links'][0]['ancestors'][1]['node'] == 'p'
        assert any(s.get('v2Marker') for s in initial['css']['stylesheets'])
        assert initial['css']['stylesheetsTotal'] == initial['css']['stylesheetsProcessed'] == 177
        assert initial['css']['stylesheets'][-1]['v2Marker']
        assert not initial['css']['truncated']
        assert initial['css']['droppedHeaderRules'] == 0
        assert any(r['sheet'] == 176 and r['matches'] for r in initial['css']['headerRules'])
        assert any(r['matches'] for r in initial['css']['headerRules'])
        assert initial['controlsDOM'][0]['node'] == 'p'
        assert any(e['kind'] == 'hashchange' for e in data['events'])
        assert any(s['selectorCounts']['opened'] == 1 for s in data['samples'])
        assert any(e['kind'] == 'click' and e['defaultPreventedAfterDispatch'] is False for e in data['events'])
        assert any(e['kind'] == 'click' and e['defaultPreventedAfterDispatch'] is True for e in data['events'])
        for secret in ['PRIVATE-NAV-TITLE', 'PRIVATE-REPORT-TITLE', 'PRIVATE-FILTER-VALUE', 'PRIVATE-LOGIN', 'PRIVATE-URL-TOKEN']:
            assert secret not in text, secret
        page.mouse.click(600, 50)
        assert page.evaluate('__paHeaderDiag.finish()') == text, 'finish must stop recording'
        # A normal stylesheet applied late by a fork can override the header.
        page.add_style_tag(content='.dashboard-header-container{transform:none!important;clip-path:none!important}')
        page.evaluate(source)
        with page.expect_download() as download:
            page.evaluate('__paHeaderDiag.save()')
        assert download.value.suggested_filename == 'pa-next-header-diagnostic.json'
        saved = json.loads(Path(download.value.path()).read_text())
        assert any('transform' in r['declarations'] for r in saved['initial']['css']['headerRules'])
        assert page.locator('body').inner_html() == before, 'save must not insert DOM nodes'
        # Wrong console context is explicit rather than a misleading empty success.
        iframe = page.frames[1]
        wrong = iframe.evaluate(source)
        assert wrong['context'] == 'iframe-wrong-context'
        iframe.evaluate('__paHeaderDiag.stop()')
        assert not errors, errors
        browser.close()
        print('PASS: all 177 stylesheets including late helper; no DOM/layout writes; selectors, CSS, real open/close events; redaction; JSON download; stop/restart; opaque iframe warning')


if __name__ == '__main__':
    main()
