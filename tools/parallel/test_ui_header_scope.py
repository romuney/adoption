#!/usr/bin/env python3
"""Real report + actual production control structure inside CSS @scope.

The uploaded CSSOM proves the v2 helper was nested in @scope without changing
body to :scope. Root selectors were not recorded; app/dashboard roots below
are explicit stand variants, not a claim about the exact production boundary.
"""
import hashlib
import html
import json
import subprocess
from pathlib import Path

from playwright.sync_api import sync_playwright

import test_ui_viewport as ui
from test_ui_header_focus import page_and_report, stable, state
from header_reveal import header_control_markdown, header_reveal_css

ROOT = Path(__file__).resolve().parents[2]
OUT = Path('/tmp/pa-next-header-corner')
DIAG = ui.OUT / 'pa-next-header-diagnostic (1).json'
PREVIOUS = '315d5f5'


def production_control(page, tree, app=False):
    """Recreate only the diagnostic's structural nodes, never report text/data."""
    def render(item):
        tag = item['node'].split('.')[0].split('#')[0]
        classes = item['node'].split('.')[1:]
        attrs = ' class="' + html.escape(' '.join(classes), quote=True) + '"' if classes else ''
        if item.get('control'):
            if item['control'] == 'open':
                href = '#app' if app else '#chart-id-859562'
                attrs += ' href="' + href + '" title="Открыть шапку дашборда"'
            else:
                attrs += ' href="#pa-next-header-closed-859562"'
        if 'resizable-container' in classes:
            attrs += ' style="height:400px"'
        return '<' + tag + attrs + '>' + ''.join(render(c) for c in item['children'] if c) + '</' + tag + '>'
    page.evaluate('''markup=>{
      var grid=document.querySelector('.grid-content'),host=document.createElement('div');
      host.innerHTML=markup;var row=host.firstElementChild;row.dataset.test='header-control-row';grid.insertBefore(row,grid.firstChild);
      row.querySelectorAll('a').forEach(a=>a.textContent=a.getAttribute('href').includes('closed')?'Закрыть шапку дашборда':'Открыть шапку дашборда');
    }''', render(tree))


def main():
    OUT.mkdir(exist_ok=True)
    diag = json.loads(DIAG.read_text())
    css_evidence = diag['initial']['css']
    assert css_evidence['stylesheetsTotal'] == css_evidence['stylesheetsProcessed'] == 338
    assert not css_evidence['truncated'] and css_evidence['droppedHeaderRules'] == 0
    assert any(r['selector'].startswith('body:') and any(g['kind'] == 'CSSScopeRule' for g in r['context']) for r in css_evidence['headerRules'])
    tree = diag['initial']['controlsDOM'][0]
    for part in ['head','cat','one']:
        ui.rows[part] = json.loads((Path('/tmp/pa-next-people-periods/d')/(part+'.json')).read_text())
    css = (ui.OUT/'9. CSS — дашборд.css').read_text()
    assert header_reveal_css(859562) in css
    before_css = subprocess.check_output(['git','show',PREVIOUS+':Параллельный отчёт — pa_next/9. CSS — дашборд.css'],text=True)
    hashes = {f:hashlib.sha256((ui.OUT/f).read_bytes()).hexdigest() for f in ['9. CSS — дашборд.css','4. JS — весь отчёт.js','14. Markdown — управление шапкой.md']}
    result = {'scope':'Local Chromium: full report, production control tree and CSSScopeRule behavior; not live installation verification',
              'productionDiagnostic':str(DIAG.relative_to(ROOT)), 'sha256':hashes, 'negative':[], 'cases':[], 'completed':False}
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,ignore_default_args=['--hide-scrollbars'])
        for scope in ['#app','.dashboard-container']:
            page,frame,errors=page_and_report(browser,1366,768,scope=scope,css_override=before_css)
            production_control(page,tree)
            page.wait_for_timeout(100)
            broken=state(page)
            assert broken['style']['position']!='fixed' and broken['row']['height']==400,broken
            assert broken['links'][0]['font']=='14px',broken
            page.screenshot(path=str(OUT/('v2-'+scope.strip('#.')+'-broken.png')))
            result['negative'].append({'scope':scope,'state':broken})
            assert not errors,errors
            page.close()
        # Reproduce the next production complaint: v3 revealed its fixed header
        # over the report's own title instead of returning it to document flow.
        overlay_css=subprocess.check_output(['git','show','f77879c:Параллельный отчёт — pa_next/9. CSS — дашборд.css'],text=True)
        page,frame,errors=page_and_report(browser,1366,768,scope='.dashboard-container',css_override=overlay_css)
        production_control(page,tree);page.wait_for_timeout(100)
        closed_v3=state(page);page.mouse.click(683,52);page.wait_for_timeout(150)
        open_v3=state(page);title_v3=frame.locator('.pa-next-titlebar h1').bounding_box()
        assert open_v3['iframe']==closed_v3['iframe']
        assert title_v3['y'] < open_v3['header']['bottom'] and title_v3['y']+title_v3['height'] > open_v3['header']['y']
        result['overlayNegative']={'closed':closed_v3,'open':open_v3,'coveredTitle':title_v3}
        page.screenshot(path=str(OUT/'v3-covered-title.png'));page.close()
        # The previous cosmetic change whitened only the button. Reproduce the
        # fork's white inner header on a transparent outer header/padding, and
        # the old full-width hotspot opening from the left of the page.
        previous_css=subprocess.check_output(['git','show','f04b300:Параллельный отчёт — pa_next/9. CSS — дашборд.css'],text=True)
        page,frame,errors=page_and_report(browser,1366,768,scope='.dashboard-container',css_override=previous_css)
        page.locator('head').evaluate('(n)=>{var s=document.createElement("style");s.textContent=".dashboard-header-container{background:transparent}.header-with-actions{background:white}";n.appendChild(s)}')
        production_control(page,tree);page.wait_for_timeout(100)
        page.mouse.click(48,52);page.wait_for_timeout(100)
        assert state(page)['style']['position']=='relative','Old left-hand hotspot was not exercised'
        previous_bg=page.locator('.dashboard-header-container').evaluate('(n)=>getComputedStyle(n).backgroundColor')
        assert previous_bg=='rgba(0, 0, 0, 0)'
        result['cornerNegative']={'clicked':[48,52],'background':previous_bg,'state':state(page)}
        page.screenshot(path=str(OUT/'v4-grey-reserved-space.png'));page.close()
        for scope in [None,'#app','.dashboard-container']:
            for app in [False,True]:
                for width,height in [(1366,768),(1920,1080)]:
                    label=f'{scope or "global"}-{"app" if app else "legacy"}-{width}'.replace('#','').replace('.','')
                    page,frame,errors=page_and_report(browser,width,height,portal=True,scope=scope)
                    page.locator('head').evaluate('(n)=>{var s=document.createElement("style");s.textContent=".dashboard-header-container{background:transparent}.header-with-actions{background:white}";n.appendChild(s)}')
                    baseline=state(page)
                    assert baseline['style']['position']!='fixed'
                    production_control(page,tree,app)
                    page.wait_for_timeout(180)
                    closed=state(page)
                    assert closed['row']['height']==0 and closed['header']['bottom']==48,(label,closed)
                    assert closed['headerReservation']=='0px',(label,closed)
                    assert closed['iframe']['h']==baseline['iframe']['h']+65,(label,baseline,closed)
                    assert all(x['height']==8 and x['font']=='0px' for x in closed['links']),(label,closed)
                    assert all(x['width']==112 and x['left']==width-136 and x['right']==width-24 for x in closed['links']),(label,'hotspot not confined to right corner',closed)
                    outside=[8,width/2,width-137,width-23]
                    for x in outside:
                        page.mouse.click(x,52);page.wait_for_timeout(25)
                        assert state(page)['header']['bottom']==48,(label,'outside click opened the header',x)
                    title_before=frame.locator('.pa-next-titlebar h1').bounding_box()
                    title_font=frame.locator('.pa-next-titlebar h1').evaluate('(n)=>getComputedStyle(n).fontSize')
                    accepted=frame.evaluate('JSON.stringify(__paNext.accepted)');emits=page.evaluate('emits.length')
                    page.mouse.move(width-80,52);page.wait_for_timeout(150)
                    assert state(page)['header']['bottom']==48,'Hover must not open'
                    page.mouse.click(width-80,52);page.wait_for_timeout(120)
                    opened=state(page)
                    assert opened['header']['y']==48 and opened['target']==('app' if app else 'chart-id-859562'),(label,opened)
                    background=page.locator('.dashboard-header-container').evaluate('(n)=>getComputedStyle(n).backgroundColor')
                    assert background=='rgb(255, 255, 255)',(label,'reserved area behind collapse is not white',background)
                    for x in outside:
                        page.mouse.click(x,52);page.wait_for_timeout(25)
                        assert state(page)['header']['y']==48,(label,'outside click closed the header',x)
                    stable(closed,opened,label)
                    title_open=frame.locator('.pa-next-titlebar h1').bounding_box()
                    assert abs(title_open['y']-title_before['y']-65)<=1,(label,title_before,title_open)
                    assert title_open['y']>=opened['header']['bottom'],(label,'report title covered',title_open,opened)
                    assert frame.locator('.pa-next-titlebar h1').evaluate('(n)=>getComputedStyle(n).fontSize')==title_font
                    close=page.locator('[data-test="header-control-row"] a').last
                    hint=close.evaluate('(n)=>getComputedStyle(n,"::after").content')
                    assert 'Свернуть' in hint
                    edit_box=page.locator('[data-test="edit-dashboard"]').bounding_box()
                    assert edit_box['x']+edit_box['width']<=width-24-112-8,(label,'collapse overlaps edit',edit_box)
                    assert page.evaluate('([x,y])=>document.elementFromPoint(x,y)===document.querySelector("[data-test=header-control-row] a:last-child")',[width-80,80])
                    page.mouse.click(width-80,80);page.wait_for_timeout(120)
                    assert state(page)['header']['bottom']==48,'Visible collapse action did not work'
                    stable(closed,state(page),label)
                    page.mouse.click(width-80,52);page.wait_for_timeout(120)
                    stable(closed,state(page),label)
                    page.evaluate('document.activeElement.blur()');page.wait_for_timeout(100)
                    assert state(page)['header']['y']==48,'URL state must survive blur'
                    if width==1366:page.screenshot(path=str(OUT/(label+'-open.png')))
                    page.locator('[data-test="dashboard-menu"]').click()
                    page.locator('[data-test="native-menu-item"]').focus()
                    assert state(page)['header']['y']==48
                    page.locator('[data-test="native-menu-item"]').click()
                    page.mouse.click(width-80,52);page.wait_for_timeout(120)
                    reclosed=state(page);assert reclosed['header']['bottom']==48,(label,reclosed)
                    stable(closed,reclosed,label)
                    assert frame.evaluate('JSON.stringify(__paNext.accepted)')==accepted
                    assert page.evaluate('emits.length')==emits
                    page.locator('#navigation-start').focus();page.keyboard.press('Tab')
                    assert state(page)['focused']=='edit-dashboard' and state(page)['header']['y']==48
                    page.keyboard.press('Enter');page.wait_for_timeout(100)
                    assert state(page)['style']['position']!='fixed' and state(page)['style']['clip']=='none'
                    assert not errors,errors
                    result['cases'].append({'label':label,'scope':scope,'closed':closed,'open':opened,'closedAgain':reclosed,'titleClosed':title_before,'titleOpen':title_open,'collapseLabel':hint,'headerBackground':background,'outsideClicksIgnored':outside,'queriesAdded':0})
                    (OUT/'metrics.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
                    print('PASS:',label,flush=True);page.close()
        browser.close()
    assert hashes=={f:hashlib.sha256((ui.OUT/f).read_bytes()).hexdigest() for f in hashes}
    assert (ui.OUT/'14. Markdown — управление шапкой.md').read_text()==header_control_markdown(859562)
    result['completed']=True;(OUT/'metrics.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))


if __name__=='__main__':main()
