#!/usr/bin/env python3
"""Exercise observation disclosure in the delivered, styled opaque sandbox.

Actual local SQL response fixtures supply the metrics. Mouse/keyboard input,
viewport changes, a report response and same-version reruns exercise the real
delivery. This does not access corporate services or validate a screen reader.
"""
import argparse
import hashlib
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

import test_ui_viewport as ui
from test_ui_preview import SQL
from test_ui_queue import PLATFORM, QueueBoard


OBS = '.pone-obs[data-obs]'
SNAPSHOT = r'''() => {
  var s=window.__paNext;
  return JSON.stringify({desired:s.desired,accepted:s.accepted,generation:s.generation,
    state:document.querySelector('.pa-next-one').dataset.paNextState,
    kpi:Array.from(document.querySelectorAll('.pone-k-val'),n=>n.textContent),
    series:Array.from(document.querySelectorAll('[data-bk]'),n=>n.getAttribute('data-bk'))});
}'''


class ObservationBoard(QueueBoard):
    def __init__(self, browser, periods, reports, width, height):
        self.scripts, self.periods, self.reports = ui.scripts, periods, reports
        self.trace, self.printed, self.errors = False, 0, []
        self.page = browser.new_page(
            viewport={'width': width, 'height': height}, reduced_motion='reduce')
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.frame = ui.mount(self.page)
        self.page.evaluate(PLATFORM)


def assert_disclosure(frame, opened, manual=None):
    frame.wait_for_function('''x => {
      var n=document.querySelector(x.selector);
      return n && n.getAttribute('aria-expanded')===String(x.opened);
    }''', arg={'selector': OBS, 'opened': opened}, timeout=4000)
    node = frame.locator(OBS)
    assert node.count() == 1, 'The observations must have one disclosure control'
    assert node.get_attribute('role') == 'button'
    assert node.get_attribute('tabindex') == '0'
    assert node.get_attribute('aria-label'), 'Disclosure needs an accessible name'
    assert node.locator('button,[role="button"],a,input,select').count() == 0, (
        'Interactive descendants would compete with the full-area control')
    assert node.locator('.pone-obs-list').count() == int(opened)
    if opened:
        assert node.locator('.pone-obs-li').count() > 1, (
            'Fixture must exercise a real multi-observation disclosure')
        accessible = node.aria_snapshot()
        for text in node.locator('.pone-obs-li b').all_text_contents():
            assert text in accessible, ('Expanded observation absent from the accessibility tree', text)
    if manual is not None:
        assert frame.evaluate('!!window.__pvtState.pone.obsManual') == manual
    return node


def assert_focus(frame):
    focus = frame.locator(OBS).evaluate('''n => {
      var c=getComputedStyle(n);return {active:document.activeElement===n,
        visible:n.matches(':focus-visible'),style:c.outlineStyle,width:parseFloat(c.outlineWidth)};
    }''')
    assert focus['active'], ('Disclosure lost focus when rebuilt', focus)
    assert focus['visible'] and focus['style'] != 'none' and focus['width'] >= 1, (
        'Keyboard focus must remain visible after disclosure', focus)


def local_action(board, action, label):
    before = board.frame.evaluate(SNAPSHOT)
    jobs, emits = len(board.jobs()), board.page.evaluate('emits.length')
    action()
    board.wait(250)
    assert board.frame.evaluate(SNAPSHOT) == before, (
        label, 'Disclosure changed filters, accepted data, KPI or time series')
    assert len(board.jobs()) == jobs and board.page.evaluate('emits.length') == emits, (
        label, 'Local UI action issued a query')


def charts_fit(board, label):
    ui.wheel_over_chart(board.page, board.frame, 1200)
    return ui.assert_canvas_fits(board.frame, label)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--periods', type=Path, default=Path('/tmp/pa-next-periods'))
    parser.add_argument('--reports', type=Path, default=Path('/tmp/pa-next-preview'))
    parser.add_argument('--output', type=Path, default=Path('/tmp/pa-next-observations'))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    meta = json.loads((args.periods / 'metadata.json').read_text())
    sql_hashes = {part: hashlib.sha256((ui.OUT / filename).read_bytes()).hexdigest()
                  for part, filename in SQL.items()}
    # This is a renderer/state regression, not a new SQL-equivalence check.
    # Keep provenance explicit if SQL has evolved since these real responses
    # were exported; never rewrite fixture values to suit the UI expectation.
    fixture_hashes = meta['source_sha256']
    periods = {'d': {part: json.loads((args.periods / 'd' / (part + '.json')).read_text())
                     for part in ['head', 'cat', 'one']}}
    reports = {'d': {'2': json.loads((args.reports / 'd/2.json').read_text())}}
    ui.rows.update(periods['d'])
    main_file = ui.OUT / '4. JS — весь отчёт.js'
    sha = hashlib.sha256(main_file.read_bytes()).hexdigest()
    result = {'completed': False, 'main_sha256': sha, 'cases': [],
              'fixture_sql_sha256': fixture_hashes, 'current_sql_sha256': sql_hashes,
              'fixture_matches_current_sql': fixture_hashes == sql_hashes,
              'scope': 'Local Chromium, recorded SQL responses, opaque styled sandbox; no live Proteus or current-SQL equivalence claim'}
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                    ignore_default_args=['--hide-scrollbars'])
        for width, height, default_open in [(1366, 768, False), (1920, 1080, True)]:
            board = ObservationBoard(browser, periods, reports, width, height)
            frame, page = board.frame, board.page
            label = f'{width}x{height}'
            try:
                assert_disclosure(frame, default_open, manual=False)
                initial_geometry = charts_fit(board, label + ' default')
                page.mouse.move(5, 20)
                page.screenshot(path=str(args.output / (label + '-default.png')))

                # A fresh preference follows the available screen, in both
                # directions; resizing itself must not change data or filters.
                alternate = {'width': 1920, 'height': 1080} if width == 1366 else {'width': 1366, 'height': 768}
                local_action(board, lambda: page.set_viewport_size(alternate), label + ' automatic resize')
                assert_disclosure(frame, not default_open, manual=False)
                local_action(board, lambda: page.set_viewport_size({'width': width, 'height': height}), label + ' automatic restore')
                assert_disclosure(frame, default_open, manual=False)
                if width == 1920:
                    local_action(board, lambda: page.set_viewport_size({'width': 1920, 'height': 768}), label + ' wide short screen')
                    assert_disclosure(frame, False, manual=False)
                    local_action(board, lambda: page.set_viewport_size({'width': width, 'height': height}), label + ' tall screen restore')
                    assert_disclosure(frame, True, manual=False)
                    splitter = frame.get_by_role('separator', name='Ширина каталога')
                    local_action(board, lambda: splitter.press('End'), label + ' narrow analytics')
                    assert frame.locator('.pa-next-one').evaluate('(n)=>n.clientWidth') < 900
                    assert_disclosure(frame, False, manual=False)
                    local_action(board, lambda: splitter.press('Home'), label + ' wide analytics restore')
                    assert_disclosure(frame, True, manual=False)

                # Click the full observation surface, far from the small
                # trailing caret. This fails if only the old button works.
                manual_open = not default_open
                local_action(board, lambda: frame.locator(OBS).click(position={'x': 18, 'y': 16}), label + ' body click')
                assert_disclosure(frame, manual_open, manual=True)
                charts_fit(board, label + ' body toggled')
                if manual_open:
                    # The expanded list itself is also an activation surface,
                    # not just its header or the trailing caret.
                    local_action(board, lambda: frame.locator('.pone-obs-li').last.click(), label + ' expanded list click')
                    assert_disclosure(frame, False, manual=True)
                    local_action(board, lambda: frame.locator(OBS).click(position={'x': 18, 'y': 16}), label + ' reopen')
                    assert_disclosure(frame, True, manual=True)
                    charts_fit(board, label + ' expanded list restored')
                page.mouse.move(5, 20)
                page.screenshot(path=str(args.output / (label + '-manual.png')))

                # Use actual keyboard input, then check the replaced DOM node
                # retained focus and a visible outline (not only state flags).
                page.keyboard.press('Tab')
                frame.locator(OBS).focus()
                local_action(board, lambda: page.keyboard.press('Enter'), label + ' Enter')
                assert_disclosure(frame, not manual_open, manual=True)
                assert_focus(frame)
                local_action(board, lambda: page.keyboard.press('Space'), label + ' Space')
                assert_disclosure(frame, manual_open, manual=True)
                assert_focus(frame)

                for viewport in [alternate, {'width': width, 'height': height}]:
                    local_action(board, lambda viewport=viewport: page.set_viewport_size(viewport), label + ' manual resize')
                    assert_disclosure(frame, manual_open, manual=True)
                    charts_fit(board, label + ' manual resize charts')

                # A genuine report response rebuilds the renderer. Selection
                # may issue its one expected query; the disclosure must survive
                # both immediate preview and completed data unchanged.
                jobs = len(board.jobs())
                board.select('2')
                job = board.wait_job('one')
                frame.wait_for_selector('.pa-next-one[data-pa-next-state="preview"]')
                assert frame.evaluate('!!window.__pvtState.pone.obsManual')
                assert frame.evaluate('!!window.__pvtState.pone.obsOpen') == manual_open
                board.complete(job)
                frame.wait_for_selector('.pa-next-one[data-pa-next-state="ready"]')
                assert_disclosure(frame, manual_open, manual=True)
                assert len(board.jobs()) == jobs + 1, ('Report selection should issue one request', board.events())
                charts_fit(board, label + ' report completed')

                for repeat in range(2):
                    local_action(board, lambda: frame.evaluate(
                        '(rows)=>{data=rows;' + ui.scripts['head'] + '}', ui.rows['head']),
                        label + ' same-sandbox rerun ' + str(repeat))
                    assert_disclosure(frame, manual_open, manual=True)
                # Exactly one toggle after two reruns detects duplicate
                # delegated handlers, which a same-state rerun check misses.
                frame.locator(OBS).focus()
                local_action(board, lambda: page.keyboard.press('Enter'), label + ' post-rerun Enter')
                assert_disclosure(frame, not manual_open, manual=True)
                assert_focus(frame)
                final_geometry = charts_fit(board, label + ' final charts')
                page.mouse.move(5, 20)
                page.screenshot(path=str(args.output / (label + '-final.png')))
                assert not board.errors, board.errors
                result['cases'].append({'viewport': [width, height], 'default_open': default_open,
                    'body_click': True, 'keyboard': ['Enter', 'Space'], 'focus_retained': True,
                    'manual_resize_report_rerun': True, 'report_queries': len(board.jobs()),
                    'initial_geometry': initial_geometry, 'final_geometry': final_geometry,
                    'errors': board.errors})
                print('PASS:', label, 'default/body/keyboard/focus; manual choice survives resize, report and reruns; no local queries; charts fit', flush=True)
            except Exception:
                page.screenshot(path=str(args.output / (label + '-failure.png')))
                raise
            finally:
                page.close()
        browser.close()
    assert hashlib.sha256(main_file.read_bytes()).hexdigest() == sha, 'Delivery changed during the check'
    result['completed'] = True
    (args.output / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
