#!/usr/bin/env python3
"""Catalogue text and clear scrollbar lanes, including a zero-width gutter model."""
import copy
import hashlib
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
import test_ui_viewport as ui
from test_ui import OUT


def main():
    original = {part: json.loads(Path('/tmp/pa-next-periods/d', part + '.json').read_text())
                for part in ['head', 'cat', 'one']}
    title = 'Очень длинное название отчёта с показателями подразделений и динамикой использования ' * 6
    ui.rows = copy.deepcopy(original)
    for row in ui.rows['cat']:
        if row['section'] == 'rep':
            lines = []
            for line in row['k'].split('\n'):
                fields = line.split('|')
                if fields[0] == '2':
                    fields[9] = title
                lines.append('|'.join(fields))
            row['k'] = '\n'.join(lines)
    script_hash = hashlib.sha256(ui.scripts['head'].encode()).hexdigest()
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                    ignore_default_args=['--hide-scrollbars'])
        for gutter in ['classic', 'zero-width']:
            page = browser.new_page(viewport={'width':1658, 'height':963}, reduced_motion='reduce')
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            frame = ui.mount(page)
            if gutter == 'zero-width':
                # Overlay scrollbars reserve no layout width on macOS. This
                # simulates that geometry, not macOS's native visual rendering.
                frame.add_style_tag(content='.pa-next-shell,.pa-next-shell *{scrollbar-width:none!important}')
            frame.get_by_role('separator', name='Ширина каталога').press('Home')
            page.wait_for_timeout(250)
            assert frame.locator('.pa-next-cat').bounding_box()['width'] == 420
            row = frame.locator('tr[data-rep="2"]')
            def text_height():
                return row.locator('.prb-rname-n').evaluate('''n=>({height:n.getBoundingClientRect().height,
                  font:parseFloat(getComputedStyle(n).fontSize),clamp:getComputedStyle(n).webkitLineClamp})''')
            before = text_height()
            row.evaluate('(n)=>n.click()')
            frame.wait_for_selector('tr[data-rep="2"].sel')
            after = text_height()
            assert before == after, (gutter, 'Selecting a report expanded its long title', before, after)
            assert after['clamp'] == '3' and after['height'] <= after['font'] * 1.4 * 3
            assert title.strip() in row.get_attribute('data-tip'), 'Full title is unavailable in the tooltip'
            # Reset through the actual row; baseline cache restores panel data.
            row.evaluate('(n)=>n.click()')
            frame.wait_for_selector('.pa-next-ready')
            frame.locator('[data-view="view:who"]').click()
            page.wait_for_timeout(250)
            geometry = frame.evaluate('''() => {
              function lane(selector, child){var n=document.querySelector(selector),c=n.querySelector(child);
                var r=n.getBoundingClientRect(),q=c.getBoundingClientRect();
                n.scrollTop=n.scrollHeight;
                return {right:r.right-q.right,bottomPadding:parseFloat(getComputedStyle(n).paddingBottom),
                  rightPadding:parseFloat(getComputedStyle(n).paddingRight),gutter:n.offsetWidth-n.clientWidth};}
              var shell=document.querySelector('.pa-next-shell'),s=shell.getBoundingClientRect();
              return {cat:lane('.prb-tscroll','table'),people:lane('.pone-tbl-scroll','table'),
                outerLane:s.right-document.querySelector('.pa-next-content').getBoundingClientRect().right,
                shellBottomPadding:parseFloat(getComputedStyle(shell).paddingBottom),
                outerPanelPadding:parseFloat(getComputedStyle(document.querySelector('.pone-overlay')).paddingRight)};
            }''')
            assert geometry['outerLane'] >= 10 and geometry['shellBottomPadding'] >= 10, geometry
            assert geometry['outerPanelPadding'] >= 10, geometry
            for part in ['cat', 'people']:
                assert geometry[part]['right'] >= 10 and geometry[part]['bottomPadding'] >= 10, (gutter, part, geometry)
                if gutter == 'zero-width':
                    assert geometry[part]['gutter'] == 0, (gutter, 'Overlay geometry not exercised', geometry)
            assert not errors, errors
            results.append({'gutter':gutter,'title':after,'lanes':geometry,'errors':errors})
            print('PASS:',gutter,'selected title stays within three lines; scrollbar lanes stay clear',flush=True)
            page.close()
        browser.close()
    assert hashlib.sha256((OUT/'4. JS — весь отчёт.js').read_bytes()).hexdigest() == script_hash
    Path('/tmp/pa-next-scrollbar-results.json').write_text(json.dumps(
        {'completed':True,'main_sha256':script_hash,'cases':results},ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()
