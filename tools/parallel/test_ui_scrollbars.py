#!/usr/bin/env python3
"""Thin native scrolling without reserved lanes; header and divider alignment."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
import test_ui_viewport as ui
from test_ui import OUT


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--main', type=Path, help='Previous JS delivery for a negative regression check')
    ap.add_argument('--periods', type=Path, default=Path('/tmp/pa-next-periods/d'))
    ap.add_argument('--output', type=Path, default=Path('/tmp/pa-next-scrollbar-results.json'))
    args = ap.parse_args()
    if args.main:
        ui.scripts['head'] = args.main.read_text()
    original = {part: json.loads((args.periods / (part + '.json')).read_text())
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
              function inspect(selector){var n=document.querySelector(selector),s=getComputedStyle(n);
                return {rightPadding:parseFloat(s.paddingRight),bottomPadding:parseFloat(s.paddingBottom),
                  gutterStyle:s.scrollbarGutter,gutter:n.offsetWidth-n.clientWidth,
                  horizontalOverflow:n.scrollWidth>n.clientWidth+1,verticalOverflow:n.scrollHeight>n.clientHeight+1};}
              var out={};
              for(var selector of ['.pa-next-shell','.pa-next-content','.prb-overlay','.pone-overlay','.prb-tscroll','.pone-tbl-scroll'])out[selector]=inspect(selector);
              return out;
            }''')
            for selector, box in geometry.items():
                assert box['rightPadding']==(6 if selector in ('.prb-tscroll','.pone-tbl-scroll') else 0) and box['bottomPadding']==0, (gutter,selector,'reserved padding',box)
                assert box['gutterStyle']=='auto', (gutter,selector,'permanent scrollbar gutter',box)
                assert box['gutter'] <= 4, (gutter,selector,'scrollbar wider than4px',box)
                if not box['verticalOverflow'] or gutter=='zero-width':
                    assert box['gutter']==0, (gutter,selector,'empty scroll space',box)
            # Existing cell padding should still keep text clear of the4px
            # overlay thumb, without a new blank lane around the whole table.
            for selector in ['.prb-tscroll','.pone-tbl-scroll']:
                edge = frame.locator(selector).evaluate('''n=>{
                  var cell=n.querySelector('tbody tr:first-child td:last-child'),range=document.createRange();
                  range.selectNodeContents(cell);return n.getBoundingClientRect().right-range.getBoundingClientRect().right;
                }''')
                assert edge>=4, (gutter,selector,'last-column text overlaps the thin thumb',edge)
            alignment = []
            def aligned(label, hidden=False):
                sample = frame.evaluate('''() => {
                  function box(s){return document.querySelector(s).getBoundingClientRect()}
                  var head=box('.phead-root'),body=box('.pone-panel'),bar=box('.pone-topbar'),
                    cat=box('.pa-next-cat .prb-panel'),split=document.querySelector('.pa-next-splitter'),r=split.getBoundingClientRect(),
                    style=getComputedStyle(split,'::before'),matrix=new DOMMatrixReadOnly(style.transform);
                  return {headRight:head.right,bodyRight:body.right,tabsRight:bar.right,
                    headLeft:head.left,catLeft:cat.left,gapLeft:cat.right,gapRight:body.left,
                    handleCenter:r.left+parseFloat(style.left)+matrix.m41+parseFloat(style.width)/2,
                    gapCenter:(cat.right+body.left)/2};
                }''')
                assert abs(sample['headRight']-sample['bodyRight'])<=1, (gutter,label,'header wider than body',sample)
                assert abs(sample['tabsRight']-sample['bodyRight'])<=1, (gutter,label,'tabs wider than body',sample)
                if not hidden:
                    assert abs(sample['headLeft']-sample['catLeft'])<=1, (gutter,label,'left inset differs',sample)
                    assert abs(sample['handleCenter']-sample['gapCenter'])<=1, (gutter,label,'divider off centre',sample)
                    assert abs(sample['gapRight']-sample['gapLeft']-12)<=1, (gutter,label,'extra space between cards',sample)
                alignment.append(dict(label=label,**sample))
            for tab in ['dyn','cal','path','who','coh']:
                frame.locator('[data-view="view:'+tab+'"]').evaluate('(n)=>n.click()')
                page.wait_for_timeout(180)
                aligned(tab)
            splitter=frame.get_by_role('separator',name='Ширина каталога')
            start=splitter.bounding_box();x=start['x']+start['width']/2;y=start['y']+60
            page.mouse.move(x,y);page.mouse.down()
            for delta in [24,80,160,80,0]:
                page.mouse.move(x+delta,y);aligned('drag '+str(delta))
            page.mouse.up()
            frame.locator('.pa-next-cat-toggle').click()
            page.wait_for_timeout(200);aligned('collapsed',hidden=True)
            frame.locator('.pa-next-catalog-rail').click()
            page.wait_for_timeout(200);aligned('restored')
            if not args.main:
                frame.locator('[data-view="view:dyn"]').evaluate('(n)=>n.click()')
                page.wait_for_timeout(200)
                page.mouse.move(5,5)
                page.screenshot(path='/tmp/pa-next-alignment-'+gutter+'.png')
            assert not errors, errors
            results.append({'gutter':gutter,'title':after,'scrollbars':geometry,'alignment':alignment,'errors':errors})
            print('PASS:',gutter,'4px scrollbars without reserved lanes; headers and divider align',flush=True)
            page.close()
        browser.close()
    if not args.main:
        assert hashlib.sha256((OUT/'4. JS — весь отчёт.js').read_bytes()).hexdigest() == script_hash
    args.output.write_text(json.dumps(
        {'completed':True,'main_sha256':script_hash,'cases':results},ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()
