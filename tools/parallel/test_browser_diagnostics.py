#!/usr/bin/env python3
"""Console collector in a board and an opaque sandbox; no live Proteus access."""
import json
from playwright.sync_api import sync_playwright
from test_ui import OUT
from test_ui_viewport import mount


def main():
    collector = (OUT / '13. Консоль — диагностика интерфейса.js').read_text()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
        page = browser.new_page(viewport={'width': 1366, 'height': 768})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        frame = mount(page)
        before = frame.evaluate('''() => ({html:document.body.innerHTML, masks:JSON.stringify(__paNext.masks)})''')
        emissions = page.evaluate('emits.length')
        assert page.evaluate(collector)['scope'] == 'board'
        assert frame.evaluate(collector)['scope'] == 'report'
        page.wait_for_timeout(250)
        assert before == frame.evaluate('''() => ({html:document.body.innerHTML, masks:JSON.stringify(__paNext.masks)})'''), 'Collector changed DOM or masks'
        assert page.evaluate('emits.length') == emissions, 'Collector emitted a filter'
        assert page.frame(name='cat').evaluate(collector)['scope'] == 'wrong-context'
        page.frame(name='cat').evaluate('__paNextDebug.stop()')

        # A private filter value must be absent even when carried by protocol
        # messages. Equality labels must still let us relate repeated values.
        secret = 'PRIVATE-LOGIN-DO-NOT-EXPORT@example.test'
        payload = {'type': 'PA_NEXT_DIAGNOSTIC_TEST', 'part': 'cat',
                   'mask': [{'column': 'login_f', 'operator': 'IN', 'value': [secret, secret, '']}],
                   'rows': [{'section': 'kpi', 'k': secret, 'parent': secret, 'n': 987654321}]}
        frame.evaluate('(message)=>window.postMessage(message,"*")', payload)
        page.wait_for_timeout(100)
        frame.locator('.pa-next-shell').evaluate('(node)=>node.scrollTop=node.scrollHeight')
        page.wait_for_timeout(100)
        report_text = frame.evaluate('__paNextDebug.finish()')
        board_text = page.evaluate('__paNextDebug.finish()')
        report, board = json.loads(report_text), json.loads(board_text)
        assert secret not in report_text + board_text
        assert '987654321' not in report_text + board_text
        messages = [e for e in report['events'] if e['kind'] == 'protocol' and e['data']['type'] == payload['type']]
        assert len(messages) == 1, messages
        labels = messages[0]['data']['mask'][0]['values']['items']
        assert labels[0]['token'] == labels[1]['token'] != labels[2]['token'] and labels[2]['empty']
        assert report['initial']['elements']['shell']['scrollTop'] == 0
        assert report['final']['elements']['shell']['scrollTop'] > 0, 'Initial snapshot was rewritten'
        assert board['initial']['iframes'][2]['sameOriginDOM'] is False
        assert board['initial']['elements']['header']['height'] == 65
        assert report['initial']['state']['accepted']['one']['rows']['length'] > 0
        assert report['initial']['css']['layoutRules']
        count = len(report['samples']), len(report['events'])
        frame.evaluate('(message)=>window.postMessage(message,"*")', payload)
        page.wait_for_timeout(200)
        stopped = json.loads(frame.evaluate('__paNextDebug.finish()'))
        assert (len(stopped['samples']), len(stopped['events'])) == count, 'Collector kept recording after finish'
        assert frame.evaluate(collector)['scope'] == 'report', 'Repeated paste failed'
        frame.evaluate('__paNextDebug.stop()')
        assert not errors, errors
        print('PASS: top + opaque iframe, wrong context, no DOM/filter changes, redaction, immutable snapshots, cleanup and restart')
        print(json.dumps({'boardBytes': len(board_text.encode()), 'reportBytes': len(report_text.encode()),
                          'samples': len(report['samples']), 'events': len(report['events'])}))
        browser.close()


if __name__ == '__main__':
    main()
