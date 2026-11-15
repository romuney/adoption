#!/usr/bin/env python3
"""Targeted person-list parser and header interaction regression, no SQL mock claims."""
import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright
from ui_audience_people import augment_head
from test_ui import rows as transport_rows, scripts as transport_scripts, doc, response_for
from build_ui import renderer

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'Параллельный отчёт — pa_next'


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--delivery', action='store_true', help='Also run interactions on the generated minified main chart')
    ap.add_argument('--output', type=Path, default=Path('/tmp/pa-next-people-ui-results.json'))
    args = ap.parse_args()
    module = (OUT / 'src/audience-people.js').read_text()
    code = (OUT / '4. JS — весь отчёт.js').read_text() if args.delivery else augment_head((ROOT / 'Виджеты/pa-head.chart.js').read_text(), module)
    code_sha = hashlib.sha256(code.encode()).hexdigest()
    rows = json.loads((ROOT / '.stand/mocks_audbar/head.json').read_text())
    if args.delivery:
        rows = transport_rows['head']
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
        page = browser.new_page(viewport={'width': 1366, 'height': 768})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.set_content('<iframe name="report" sandbox="allow-scripts" style="width:1330px;height:1600px;border:0"></iframe>' + ('<iframe name="cat" sandbox="allow-scripts" style="height:2px;width:2px;opacity:0"></iframe><iframe name="one" sandbox="allow-scripts" style="height:2px;width:2px;opacity:0"></iframe>' if args.delivery else ''))
        if args.delivery:
            for part in ['cat', 'one']:
                page.locator('iframe[name="'+part+'"]').evaluate('(el,html)=>el.srcdoc=html', doc(part, transport_scripts[part], transport_rows[part]))
        shell_open, shell_close = ('','') if args.delivery else ('<div class="pa-next-shell">','</div>')
        viewport_stub = '' if args.delivery else 'window.__paNext={visibleBand:{top:0,bottom:744}};'
        html = '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}div[_echarts_instance_]{height:' + ('1600' if args.delivery else '112') + 'px;position:relative}</style></head><body>' + shell_open + '<div _echarts_instance_="x"></div>' + shell_close + '<script>var data=' + json.dumps(rows, ensure_ascii=False) + ';var emitted=[];var applyCrossFilter=function(mask){emitted.push(mask)};' + viewport_stub + '</script><script>' + code.replace('</script', '<\\/script') + '</script></body></html>'
        page.locator('iframe[name=report]').evaluate('(el,html)=>el.srcdoc=html', html)
        frame = page.frame(name='report')
        if args.delivery:
            frame.wait_for_selector('.pa-next-ready')
        opener = frame.locator('[data-ca-people]')
        opener.wait_for()
        parser = browser.new_page()
        parser.evaluate(module)
        parse = lambda raw, mode='login': parser.evaluate('p=>caPeopleParse(p[0],p[1])', [raw, mode])
        def state(expression):
            return frame.evaluate('window.__pvtState.phead.' + expression)
        def mask():
            frame.wait_for_function('emitted.length>0')
            actual = frame.evaluate('emitted[emitted.length-1].filter(f=>!f.column.startsWith("pa_next_")&&f.column!=="pa_nonce")')
            if args.delivery:
                masks = frame.evaluate('window.__paNext.masks')
                for part in ['cat', 'one']:
                    page.frame(name=part).evaluate('(payload)=>{data=payload;' + transport_scripts[part] + '}', response_for(part, masks, 'd'))
                frame.wait_for_selector('.pa-next-ready')
            return actual
        result = parse(' \u00a0ALICE\tbob\r\nalice;carol,bob d_e-x@example.com ')
        assert result['values'] == ['alice', 'bob', 'carol', 'd_e-x@example.com'] and result['duplicates'] == 2 and not result['errors'], result
        assert parse('["ALICE", "alice"]')['duplicates'] == 1
        assert parse('[12345678901234567890]', 'master')['errors']
        ids = ['000123', '90071992547409931234567890123456']
        assert parse('\n'.join(ids), 'master')['values'] == ids
        for value in ['1E+15', '12.34', '-12', '1' * 33]:
            assert parse(value, 'master')['errors'], value
        for value in ['иванов', 'domain\\user', 'a' * 129, '<script>']:
            assert parse(value)['errors'], value
        assert parse('\n'.join('u' + str(i) for i in range(5000)))['errors'] == []
        over = parse('\n'.join('u' + str(i) for i in range(5001)))
        assert over['errors'] and len(over['values']) == 5001
        assert parse('x' * 1000001)['errors']
        assert parse('\n'.join('a' * 124 + str(i).zfill(4) for i in range(5000)))['errors']
        maximum = ['u' + str(i).zfill(5) for i in range(5000)]
        assert not parse('\n'.join(maximum))['errors']
        edge = ['a' * 125 + str(i).zfill(3) for i in range(250)]
        assert parse('\n'.join(edge))['characters'] == 32000 and not parse('\n'.join(edge))['errors']
        assert parse('\n'.join(edge + ['b']))['errors']
        print('PASS parser: Excel/tab/CRLF/NBSP/manual separators, case/dedup, exact 32-digit/leading-zero IDs, invalid/JSON/5000+/32000char limits; 5000 short-login mask JSON bytes=' + str(len(json.dumps([{'column':'ca_login_f','operator':'IN','value':maximum}], separators=(',', ':')).encode())), flush=True)

        # Structural preview contract test, not fabricated numeric evidence:
        # use the same transformed source that the minifier consumes and prove
        # person-only CA is copied into preview flt/sj as conditional audience.
        one_source = renderer('one', 'pa-one.chart.js')
        preview_columns = re.search(r'var PV_COLS = \[[^;]+;', one_source).group(0)
        preview_rows = one_source[one_source.index('function pvRows(p) {'):one_source.index('// Мгновенная модель')]
        parser.evaluate('var CFG={fields:{section:"section",g:"g",k:"k",parent:"parent",n:"n"}};var rawData=[{section:"sj",g:"",k:"{}",parent:"",n:0}];function int(v){return parseInt(v,10)||0;}' + preview_columns + preview_rows)
        for column, ca_key, value in [('ca_login_f','login','alice'),('ca_master_f','master','000123')]:
            preview = parser.evaluate('p=>pvRows({id:2,name:"transport-only",grain:"d",kt:1,k:"",flt:p})', {column:[value]})
            echo = json.loads(next(row['k'] for row in preview if row['section']=='flt'))
            sj = json.loads(next(row['k'] for row in preview if row['section']=='sj'))
            assert echo[column] == [value] and sj['ca'][ca_key] == [value] and sj['caMode'] == 'cond', (column, echo, sj)
        print('PASS transformed preview contract: login/master survive flt and sj.ca; person-only audience remains conditional', flush=True)

        opener.click()
        dialog = frame.locator('.pa-next-people-dialog')
        box = dialog.bounding_box()
        assert box['y'] >= 0 and box['y'] + box['height'] <= 768, box
        assert page.evaluate('scrollY') == 0
        if args.delivery:
            page.evaluate('scrollTo(0,180)')
            page.wait_for_timeout(350)
            moved = dialog.bounding_box()
            assert moved['y'] >= 0 and moved['y'] + moved['height'] <= 768, moved
            page.evaluate('scrollTo(0,0)')
            page.wait_for_timeout(350)
        assert frame.locator('.pa-next-shell').evaluate('(el)=>el.inert')
        text = dialog.locator('textarea')
        text.fill(' ALICE\r\nbob\talice;carol ')
        assert 'Уникальных идентификаторов: 3' in dialog.locator('[role=status]').inner_text()
        dialog.get_by_role('button', name='Master ID', exact=True).click()
        assert text.input_value() == ''
        text.fill('000123\n90071992547409931234567890123456')
        dialog.get_by_role('button', name='Логины', exact=True).click()
        assert 'ALICE' in text.input_value()
        dialog.get_by_role('button', name='Убрать повторы и оформить').click()
        assert text.input_value() == 'alice\nbob\ncarol'
        dialog.get_by_role('button', name='Сохранить в условия').click()
        assert frame.evaluate('emitted.length') == 0
        assert state('draft.people') == ['alice', 'bob', 'carol']
        assert state('applied.people') == []
        assert 'ЦА — после «Применить»' in frame.locator('.phead-cnt').inner_text()
        assert frame.evaluate('document.activeElement.hasAttribute("data-ca-people")')
        frame.locator('[data-cadd="org"]').click()
        assert 'без учёта списка людей' in frame.locator('.phead-dd-h').inner_text()
        frame.locator('[data-caapply]').click()
        assert mask() == [{'column':'ca_login_f','operator':'IN','value':['alice','bob','carol']}]
        print('PASS draft/save/apply: only active mode emitted, global Apply required, no invented match count, facet counts qualified', flush=True)

        opener.click()
        text.fill('valid;невалидный')
        dialog.get_by_role('button', name='Сохранить в условия').press('Enter')
        assert dialog.is_visible() and text.get_attribute('aria-invalid') == 'true'
        assert state('draft.people') == ['alice', 'bob', 'carol']
        text.fill('\n'.join(edge + ['b']))
        assert '32 000' in dialog.locator('[role=alert]').inner_text()
        dialog.get_by_role('button', name='Сохранить в условия').press('Enter')
        assert state('draft.people') == ['alice', 'bob', 'carol']
        text.press('Escape')
        assert not dialog.count()
        assert state('draft.people') == ['alice', 'bob', 'carol']
        opener.click()
        dialog.get_by_role('button', name='Master ID', exact=True).click()
        text.fill('\n'.join(ids))
        dialog.get_by_role('button', name='Сохранить в условия').click()
        frame.evaluate('emitted=[]')
        frame.locator('[data-caapply]').click()
        assert mask() == [{'column':'ca_master_f','operator':'IN','value':ids}]
        opener.click()
        dialog.get_by_role('button', name='Очистить список').click()
        dialog.get_by_role('button', name='Отмена').click()
        assert state('draft.people') == ids
        opener.click()
        dialog.get_by_role('button', name='Очистить список').click()
        dialog.get_by_role('button', name='Сохранить в условия').click()
        frame.evaluate('emitted=[]')
        frame.locator('[data-caapply]').click()
        assert mask() == []
        print('PASS invalid input never partially saved; cancel/Escape preserve draft; master strings intact; empty list removes filter', flush=True)

        opener.click()
        first = dialog.get_by_role('button', name='Логины', exact=True)
        last = dialog.get_by_role('button', name='Сохранить в условия')
        last.focus(); last.press('Tab')
        assert first.evaluate('(el)=>document.activeElement===el')
        first.press('Shift+Tab')
        assert last.evaluate('(el)=>document.activeElement===el')
        text.fill('unsaved')
        page.screenshot(path='/tmp/pa-next-people' + ('-delivery' if args.delivery else '') + '.png')
        frame.evaluate(code)
        assert not frame.locator('.pa-next-people').count()
        assert not frame.locator('.pa-next-shell').evaluate('(el)=>el.inert')
        assert state('draft.people') == []
        assert not errors, errors
        print('PASS focus trap/return, visible modal in tall iframe, rerender cleanup, zero JS errors', flush=True)
        if args.delivery:
            assert hashlib.sha256((OUT / '4. JS — весь отчёт.js').read_bytes()).hexdigest() == code_sha, 'Delivery changed while testing'
        result = {
            'schema_version': 1,
            'completed': True,
            'mode': 'delivery' if args.delivery else 'source',
            'main_sha256': code_sha,
            'module_sha256': hashlib.sha256(module.encode()).hexdigest(),
            'finished_utc': datetime.now(timezone.utc).isoformat(),
            'scope': 'Parser, UI state, filter transport and transformed preview contract on synthetic mocks; no production or SQL metric equivalence claim.',
            'viewport': {'width':1366,'height':768,'iframe_height':1600},
            'javascript_errors': errors,
            'checks': [
                'Excel CRLF/tab/NBSP, manual delimiters, lowercase and duplicate removal',
                'JSON string arrays, numeric JSON rejected',
                '5000 unique and 32000 normalized characters accepted at boundary; overflow rejected without truncation',
                'Master ID leading zeros and 32 digits preserved as strings; exponent/fraction/negative rejected',
                'Preview flt and sj.ca retain login/master and conditional CA mode',
                'Editor Save changes draft only; global Apply emits exact selected-mode filter',
                'Invalid and oversized input cannot partially change draft',
                'Cancel and Escape preserve draft; empty list removes filter',
                'Unique ID count does not claim matched employee count; facets explicitly exclude person list',
                'Focus trap/return, visible footer, rerender cleanup and zero JavaScript errors',
            ] + (['Parent scroll keeps dialog within visible iframe band'] if args.delivery else []),
            'short_5000_login_mask_json_bytes': len(json.dumps([{'column':'ca_login_f','operator':'IN','value':maximum}],separators=(',', ':')).encode()),
            'screenshot': '/tmp/pa-next-people' + ('-delivery' if args.delivery else '') + '.png',
        }
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
        print('PASS: machine-readable result ' + str(args.output), flush=True)
        browser.close()


if __name__ == '__main__':
    main()
