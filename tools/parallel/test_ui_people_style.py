#!/usr/bin/env python3
"""Compare the people editor with actual report controls in the delivered iframe."""
import argparse
import hashlib
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
import test_ui_viewport as ui


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--data-dir', type=Path)
    ap.add_argument('--main', type=Path, help='Previous delivery for a negative regression check')
    ap.add_argument('--output', type=Path, default=Path('/tmp/pa-next-people-style'))
    args = ap.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    if args.data_dir:
        for part in ['head', 'cat', 'one']:
            ui.rows[part] = json.loads((args.data_dir / (part + '.json')).read_text())
    main_path = args.main or (ui.OUT / '4. JS — весь отчёт.js')
    if args.main:
        ui.scripts['head'] = args.main.read_text()
    sha = hashlib.sha256(main_path.read_bytes()).hexdigest()
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
        for w, h in [(1280,720),(1366,768),(1920,1080),(3440,1440),(1440,2560)]:
            page = browser.new_page(viewport={'width':w,'height':h}, reduced_motion='reduce')
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            frame = ui.mount(page)
            frame.locator('[data-ca-people]').click()
            dialog = frame.locator('.pa-next-people-dialog')
            styles = frame.evaluate('''() => {
              function style(s){var c=getComputedStyle(document.querySelector(s));return Object.fromEntries(['fontFamily','fontSize','fontWeight','height','borderRadius','paddingLeft','paddingRight','backgroundColor','color'].map(k=>[k,c[k]]))}
              return {save:style('[data-person-action=save]'),apply:style('[data-caapply]'),
                mode:style('[data-person-mode=login]'),period:style('.phead-strip-seg button.on'),
                title:style('#pa-next-people-title'),panel:style('.prb-h-txt>span'),input:style('#pa-next-people-input')};
            }''')
            assert styles['save'] == styles['apply'], styles
            assert styles['mode'] == styles['period'], styles
            for key in ['fontFamily','fontSize','fontWeight']:
                assert styles['title'][key] == styles['panel'][key], styles
            assert styles['input']['fontFamily'] == styles['apply']['fontFamily'], styles
            assert dialog.locator('textarea').get_attribute('aria-invalid') == 'false'
            box = dialog.bounding_box()
            assert box['width'] <= 480 and box['height'] < 500, box
            assert box['y'] >= 0 and box['y'] + box['height'] <= h, box
            assert not dialog.locator('details').get_attribute('open')
            assert frame.locator('.pa-next-shell').evaluate('(n)=>n.inert')
            if w in [1366,1920]:
                page.screenshot(path=str(args.output / f'{w}-default.png'))
            compact_height = box['height']
            before = box['y']
            text = dialog.locator('textarea')
            text.fill('alice\nbob\nalice')
            assert abs(dialog.bounding_box()['y'] - before) < 1, 'Typing moved dialog'
            dialog.locator('summary').click()
            assert dialog.locator('#pa-next-people-hint').is_visible()
            text.fill('bad\\login\nневалидно\nname!\n' + ('x'*129))
            assert text.get_attribute('aria-invalid') == 'true'
            assert dialog.locator('[role=alert]').inner_text()
            dialog.locator('[data-person-action=save]').press('Enter')
            assert dialog.is_visible(), 'Invalid input saved'
            # Maximum editor height and expanded errors must leave footer reachable.
            text.evaluate('(n)=>n.style.height="260px"')
            page.wait_for_timeout(200)
            box = dialog.bounding_box()
            save = dialog.locator('[data-person-action=save]').bounding_box()
            assert box['y'] >= 0 and box['y'] + box['height'] <= h, box
            assert save['y'] >= box['y'] and save['y'] + save['height'] <= box['y']+box['height'], save
            assert dialog.evaluate('(n)=>n.scrollHeight<=n.clientHeight+1')
            if w == 1366:
                page.screenshot(path=str(args.output / '1366-expanded-errors.png'))
                # Hidden scroll paint at rest, then actual wheel reveals only editor body.
                body = dialog.locator('.pa-next-people-body')
                assert body.evaluate('(n)=>n.scrollHeight>n.clientHeight+1')
                assert body.get_attribute('data-pa-next-scroll-active') is None
                body.hover()
                page.wait_for_timeout(100)
                assert body.get_attribute('data-pa-next-scroll-active') is None
                page.mouse.wheel(0,100)
                page.wait_for_timeout(120)
                assert body.get_attribute('data-pa-next-scroll-active') is not None
            dialog.locator('[data-person-action=cancel]').press('Escape')
            assert not dialog.count()
            assert not frame.locator('.pa-next-shell').evaluate('(n)=>n.inert')
            assert not errors, errors
            results.append({'viewport':[w,h], 'compact_height':round(compact_height,2), 'styles':styles, 'javascript_errors':errors})
            page.close()
        browser.close()
    assert hashlib.sha256(main_path.read_bytes()).hexdigest() == sha
    (args.output / 'results.json').write_text(json.dumps({'main_sha256':sha,'checks':results}, ensure_ascii=False, indent=2)+'\n')
    print('PASS native control typography/dimensions/colors, panel title, 5 desktop viewports, stable input layout, help/errors/footer, activity-only scroll, inert/escape and zero JS errors')


if __name__ == '__main__':
    main()
