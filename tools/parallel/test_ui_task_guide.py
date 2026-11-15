#!/usr/bin/env python3
"""Complete the audience job on actual SQL fixtures in a styled opaque board."""
import argparse
import copy
import hashlib
import json
from pathlib import Path

from playwright.sync_api import sync_playwright
import test_ui_viewport as ui
from verify_numbers import DATASETS
from test_ui_queue import QueueBoard, PLATFORM, semantic, mask_map, payload_body


class AudienceBoard(QueueBoard):
    def __init__(self, browser, fixture, width, height):
        self.fixture = fixture
        self.meta = json.loads((fixture/'metadata.json').read_text())
        self.scripts = ui.scripts
        self.trace, self.printed, self.errors = False, 0, []
        self.page = browser.new_page(viewport={'width': width, 'height': height}, reduced_motion='reduce')
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.frame = ui.mount(self.page)
        self.page.evaluate(PLATFORM)

    def rows_for(self, job):
        masks = job['snapshot']; head = semantic(masks['head'])
        assert head.get('ca_spec_f') == [self.meta['ca']['value']], head
        assert not semantic(masks['one']), 'A people-filter scenario needs its own SQL fixture'
        selected = semantic(masks['cat']).get('sel_f', [])
        name = 'cat.json' if job['target'] == 'cat' else 'one-all.json' if not selected else 'one-report-'+selected[0]+'.json'
        source = json.loads((self.fixture/name).read_text())
        rows = copy.deepcopy(source)
        echo = dict(head); echo.update(semantic(masks['cat' if job['target'] == 'one' else 'one']))
        for row in rows:
            if row['section'] == 'pa_next_request':
                row['k'] = mask_map(masks[row['g']]).get('pa_next_'+row['g']+'_req', [''])[0]
            elif row['section'] == 'flt':
                row['k'] = json.dumps(echo, ensure_ascii=False)
            elif row['section'] == 'sj' and job['target'] == 'cat':
                value = json.loads(row['k']); value['flt'] = echo
                row['k'] = json.dumps(value, ensure_ascii=False)
        assert payload_body(source) == payload_body(rows), 'Business values changed in browser transport'
        return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fixtures', type=Path, default=Path('/tmp/pa-next-audience-task'))
    parser.add_argument('--output', type=Path, default=Path('/tmp/pa-next-task-guide'))
    args = parser.parse_args(); args.output.mkdir(parents=True, exist_ok=True)
    meta = json.loads((args.fixtures/'metadata.json').read_text()); assert meta['completed']
    for filename, info in meta['files'].items():
        assert hashlib.sha256((args.fixtures/filename).read_bytes()).hexdigest() == info['sha256'], filename
    for kind, (_, filename) in DATASETS.items():
        assert hashlib.sha256((ui.OUT/filename).read_bytes()).hexdigest() == meta['source_sha256'][kind], filename
    report = meta['report_id']; facts = meta['reports'][report]['facts']
    assert 0 < facts['ca_reach'] <= 20, 'This check compares every reached login on one page'
    assert facts['ca_never'] > 0
    for part in ['head', 'cat', 'one']:
        ui.rows[part] = json.loads(Path('/tmp/pa-next-periods/d', part+'.json').read_text())
    ui.rows['head'] = json.loads((args.fixtures/'head.json').read_text())
    sha = hashlib.sha256((ui.OUT/'4. JS — весь отчёт.js').read_bytes()).hexdigest()
    results = {'completed': False, 'main_sha256': sha, 'scope': 'Local Chromium, actual SQL fixtures, user-driven CA/report choice; no corporate service access', 'cases': []}
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, ignore_default_args=['--hide-scrollbars'])
        for width, height in [(1366, 768), (1920, 1080)]:
            board = AudienceBoard(browser, args.fixtures, width, height); f = board.frame; page = board.page
            def next_step(number):
                button = f.locator('[data-task-action="next"]')
                button.wait_for(); f.wait_for_function('()=>!document.querySelector("[data-task-action=next]").disabled')
                button.click()
                if number: assert f.locator('.pa-next-task-guide').get_attribute('data-task-step') == str(number)
            def card_fits():
                data = f.locator('.pa-next-task-guide .pa-next-tour-card').evaluate('''n=>{
                  var r=n.getBoundingClientRect(),b=window.__paNext.visibleBand;return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,band:b,w:innerWidth};}''')
                assert data['top'] >= data['band']['top'] and data['bottom'] <= data['band']['bottom'], data
                assert data['left'] >= 0 and data['right'] <= data['w'], data
            f.locator('[data-tourstart]').click()
            assert f.locator('[data-tour-route="audience"]').is_visible()
            f.locator('[data-tour-route="audience"]').click()
            assert not f.locator('.pa-next-content').evaluate('(n)=>n.inert')
            assert f.locator('[data-task-action="next"]').is_disabled()
            assert not board.jobs(), 'Starting the job applied a filter'
            card_fits()
            f.locator('[data-cadd="spec"]').click()
            f.locator('body>.phead-dd input[data-cack='+json.dumps('spec|'+meta['ca']['value'], ensure_ascii=False)+']').check()
            assert f.locator('[data-task-action="next"]').is_disabled(), 'Draft CA must not unlock the guide'
            f.locator('body>.phead-dd [data-cadd="spec"]').click()
            f.locator('[data-caapply]').click()
            one = board.wait_job('one'); cat = board.wait_job('cat')
            assert f.locator('[data-task-action="next"]').is_disabled(), 'Loading CA must not unlock the guide'
            board.complete(cat); board.complete(one)
            next_step(2)
            assert f.locator('[data-task-action="next"]').is_disabled(), 'The whole portfolio is not one report'
            f.locator('[data-search="repQ"]').fill('Отчёт '+report)
            f.locator('tr[data-rep='+json.dumps(report)+']').click()
            detail = board.wait_job('one', after=one['id'])
            assert f.locator('[data-task-action="next"]').is_disabled(), 'A preview is not complete CA data'
            board.complete(detail)
            next_step(3); card_fits()
            assert f.evaluate('window.__pvtState.pone.view') == 'dyn'
            assert f.locator('.pone-k-val').first.inner_text() == str(facts['users'])
            baseline_masks = f.evaluate('JSON.stringify(window.__paNext.desired)')
            queries = len(board.jobs())
            f.locator('[data-task-action="minimize"]').click()
            assert not f.locator('[data-task-body]').is_visible()
            f.locator('[data-task-action="minimize"]').click()
            f.locator('.pa-next-cat-toggle').click()
            f.wait_for_function('()=>document.querySelector(".pa-next-task-guide").classList.contains("pa-next-task-mini")')
            assert not f.locator('[data-task-body]').is_visible()
            assert f.locator('.pa-next-catalog-rail').is_visible()
            f.locator('.pa-next-catalog-rail').click()
            f.locator('[data-task-action="minimize"]').click()
            next_step(4); card_fits()
            assert f.locator('svg[data-fn]').count() == 1
            assert 'Открыли хотя бы раз' in f.locator('svg[data-fn]').text_content()
            page.screenshot(path=str(args.output/f'{width}-path.png'))
            next_step(5); card_fits()
            assert f.evaluate('window.__pvtState.pone.segSel') == 'reach'
            assert f.locator('.who-people tbody tr').count() == facts['ca_reach']
            logins = f.locator('.who-people tbody tr[data-who]').evaluate_all('(nodes)=>nodes.map(n=>n.getAttribute("data-who")).sort()')
            expected = facts['reached_logins']
            assert logins == sorted(expected), (logins, expected)
            f.locator('[data-search="whoQ"]').fill('no such login')
            f.wait_for_function('()=>document.querySelector("[data-task-action=next]").disabled')
            f.locator('[data-task-action="clear-search"]').click()
            next_step(6); card_fits()
            assert f.evaluate('window.__pvtState.pone.segSel') == 'never'
            assert str(facts['ca_never']) in f.locator('.pone-who-cnt').inner_text()
            page.screenshot(path=str(args.output/f'{width}-people.png'))
            next_step(7)
            assert f.locator('[data-wexp="copy"]').is_visible()
            assert f.evaluate('JSON.stringify(window.__paNext.desired)') == baseline_masks
            assert len(board.jobs()) == queries, 'Reading steps emitted a new data query'
            next_step(None)
            assert not f.locator('.pa-next-task-guide').count()
            assert f.evaluate('window.__pvtState.pone.segSel') == 'never'
            assert f.evaluate('JSON.stringify(window.__paNext.desired)') == baseline_masks
            # Closing/reopening uses the current applied choice, without another query.
            f.locator('[data-tourstart]').click(); f.locator('[data-tour-route="audience"]').click()
            f.locator('[data-task-action="close"]').click()
            assert not f.locator('.pa-next-help').count()
            assert not board.errors, board.errors
            results['cases'].append({'viewport':[width,height],'steps':7,'reached':facts['ca_reach'],'never':facts['ca_never'],'queries':queries,'local_navigation_queries':0,'errors':board.errors})
            print('PASS:',width,height,'applied CA → report → dynamics → path → exact audience lists; no automatic filter or copy',flush=True)
            page.close()
        browser.close()
    assert hashlib.sha256((ui.OUT/'4. JS — весь отчёт.js').read_bytes()).hexdigest() == sha
    results['completed'] = True
    (args.output/'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2)+'\n')


if __name__ == '__main__':
    main()
