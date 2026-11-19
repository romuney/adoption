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
        # The Proteus fork can use a different nav id and an offset app wrapper.
        # Record their geometry/rules, never title text or private input values.
        page.evaluate('''() => {
          document.querySelector('#main-menu').id='fork-navigation';
          document.querySelector('#fork-navigation').setAttribute('role','navigation');
          document.querySelector('#fork-navigation').style.height='48px';
          var header=document.querySelector('.dashboard-header-container'),wrapper=document.createElement('div');
          wrapper.id='app';wrapper.className='diagnostic-offset-wrapper';
          header.parentNode.insertBefore(wrapper,header);wrapper.appendChild(header);
          var style=document.createElement('style');style.textContent='.diagnostic-offset-wrapper{margin-left:-32px;width:calc(100% + 32px)}';document.querySelector('head').appendChild(style);
          header.querySelector('h1').textContent='PRIVATE-TITLE-DO-NOT-EXPORT';
          var input=document.createElement('input');input.value='PRIVATE-INPUT-DO-NOT-EXPORT';header.appendChild(input);
        }''')
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
        assert 'PRIVATE-TITLE-DO-NOT-EXPORT' not in board_text
        assert 'PRIVATE-INPUT-DO-NOT-EXPORT' not in board_text
        assert '987654321' not in report_text + board_text
        messages = [e for e in report['events'] if e['kind'] == 'protocol' and e['data']['type'] == payload['type']]
        assert len(messages) == 1, messages
        labels = messages[0]['data']['mask'][0]['values']['items']
        assert labels[0]['token'] == labels[1]['token'] != labels[2]['token'] and labels[2]['empty']
        assert report['initial']['elements']['shell']['scrollTop'] == 0
        assert report['final']['elements']['shell']['scrollTop'] > 0, 'Initial snapshot was rewritten'
        assert board['initial']['iframes'][2]['sameOriginDOM'] is False
        assert board['initial']['elements']['header']['height'] == 65
        assert board['initial']['elements']['nav']['height'] == 48
        assert board['initial']['elements']['headerTitle']['node'].startswith('h1')
        assert board['initial']['headerAncestors'][1]['x'] == -32
        assert board['initial']['headerWrapper']['style']['margin-left'] == '-32px'
        assert any(rule['selector']=='.diagnostic-offset-wrapper' for rule in board['initial']['css']['externalLayoutRules'])
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
