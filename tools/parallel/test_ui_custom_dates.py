#!/usr/bin/env python3
"""Actionable date mode, draft safety and exact original custom-period masks."""
import hashlib
import json
import subprocess
from pathlib import Path

from playwright.sync_api import sync_playwright

import test_ui_viewport as ui
from ui_custom_dates import augment_custom_dates

ROOT=Path(__file__).resolve().parents[2]
OUT=Path('/tmp/pa-next-custom-dates')
PREVIOUS='c72ee62'


def mount(browser,width=1366,old=False):
    for part in ['head','cat','one']:
        ui.rows[part]=json.loads((Path('/tmp/pa-next-people-periods/d')/(part+'.json')).read_text())
    saved=ui.scripts['head']
    if old:ui.scripts['head']=subprocess.check_output(['git','show',PREVIOUS+':Параллельный отчёт — pa_next/4. JS — весь отчёт.js'],text=True)
    page=browser.new_page(viewport={'width':width,'height':768 if width==1366 else 1080},reduced_motion='reduce')
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    try:frame=ui.mount(page)
    finally:ui.scripts['head']=saved
    return page,frame,errors


def open_calendar(frame):
    frame.locator('[data-pa-next-host="head"] [data-cadd="cal"]').click()
    frame.locator('body>.phead-dd').wait_for(state='visible')


def state(frame):return frame.evaluate('window.__pvtState.phead')


def main():
    OUT.mkdir(exist_ok=True)
    source=(ROOT/'Виджеты/pa-head.chart.js').read_text()
    modified=augment_custom_dates(source)
    # These functions define methodology, boundaries and transport encoding.
    # The UI transform must preserve them exactly, including max-step handling.
    for name in ['stripMask','cpSnap','cpPrev','cpParam','cpFits','cpPreset','cpAutoStep','cpDraftNew']:
        def body(text):return text[text.index('function '+name+'('):].split('\nfunction ',1)[0].split('\n//',1)[0]
        assert body(source)==body(modified),('date math changed',name)
    report={'scope':'Local Chromium with actual delivery/fixture data; not live Proteus','completed':False,'cases':[]}
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
        page,frame,errors=mount(browser,old=True);open_calendar(frame)
        before=frame.evaluate('JSON.stringify(__pvtState.phead.cpd)')
        own=frame.get_by_role('button',name='Свои даты',exact=True);own.click()
        assert frame.evaluate('JSON.stringify(__pvtState.phead.cpd)')==before
        assert own.get_attribute('data-cppre') is None and own.get_attribute('tabindex')=='-1'
        report['negative']={'revision':PREVIOUS,'ownButtonHandler':False,'tabindex':-1,'draftUnchangedAfterClick':True}
        page.screenshot(path=str(OUT/'before-inactive-own.png'));assert not errors,errors;page.close()

        page,frame,errors=mount(browser);open_calendar(frame)
        accepted=frame.evaluate('JSON.stringify(__paNext.accepted)');masks=frame.evaluate('JSON.stringify(__paNext.masks)');emits=page.evaluate('emits.length')
        own=frame.locator('[data-cppre="own"]');own.focus();own.press('Enter')
        assert own.get_attribute('aria-pressed')=='true'
        assert frame.locator('#phead-custom-instruction').inner_text().startswith('1.')
        assert frame.locator('[data-cpapply]').is_disabled()
        assert frame.evaluate('document.activeElement.hasAttribute("data-cpday")')
        assert frame.locator('.phead-cal-d.s,.phead-cal-d.e,.phead-cal-d.in').count()==0
        frame.locator('[data-cpapply]').dispatch_event('click')
        assert page.evaluate('emits.length')==emits and frame.evaluate('JSON.stringify(__paNext.masks)')==masks
        page.screenshot(path=str(OUT/'own-choose-start.png'))
        first=int(frame.locator('[data-cpday]').first.get_attribute('data-cpday'))
        frame.locator('[data-cpday="'+str(first)+'"]').press('Enter')
        assert frame.locator('#phead-custom-instruction').inner_text().startswith('2.')
        assert frame.locator('[data-cpapply]').is_disabled()
        frame.locator('[data-cpapply]').dispatch_event('click');assert page.evaluate('emits.length')==emits
        frame.locator('[data-cpday="'+str(first+2)+'"]').press('Enter')
        assert 'Даты выбраны' in frame.locator('#phead-custom-instruction').inner_text()
        assert frame.locator('[data-cpapply]').is_enabled()
        assert frame.evaluate('document.activeElement.hasAttribute("data-cpapply")')
        dates=frame.evaluate('JSON.stringify(__pvtState.phead.cpd)')
        frame.locator('[data-cppre="own"]').click()
        assert frame.evaluate('JSON.stringify(__pvtState.phead.cpd)')==dates,'Clicking active own mode lost the selected dates'
        assert frame.evaluate('JSON.stringify(__paNext.accepted)')==accepted
        page.screenshot(path=str(OUT/'own-ready-apply.png'))
        frame.locator('[data-cpcancel]').click();assert page.evaluate('emits.length')==emits
        assert frame.evaluate('JSON.stringify(__paNext.masks)')==masks
        open_calendar(frame);frame.locator('[data-cppre="own"]').click();page.keyboard.press('Escape')
        assert not frame.locator('body>.phead-dd').is_visible() and page.evaluate('emits.length')==emits
        open_calendar(frame);frame.locator('[data-cppre="own"]').click();frame.locator('.pa-next-titlebar h1').click()
        assert not frame.locator('body>.phead-dd').is_visible() and page.evaluate('emits.length')==emits
        report['draft']={'keyboard':True,'hintSteps':3,'disabledUntilTwoEndpoints':True,'activeModeIdempotent':True,'cancelEscapeOutsideNoQueries':True}
        assert not errors,errors;page.close()

        for label,step,reverse,same,preset,width in [
            ('days','d',False,False,None,1366),('reverse-days','d',True,False,None,1366),
            ('single-day','d',False,True,None,1366),('weeks','w',False,False,None,1920),
            ('months','m',False,False,None,1920),('own-back-to-preset','d',False,False,'7',1366)]:
            page,frame,errors=mount(browser,width);open_calendar(frame)
            emits=page.evaluate('emits.length');frame.locator('[data-cppre="own"]').click()
            if preset:
                frame.locator('[data-cppre="'+preset+'"]').click()
                assert frame.locator('[data-cpapply]').is_enabled()
                assert frame.locator('[data-cppre="own"]').get_attribute('aria-pressed')=='false'
            else:
                a=int(frame.locator('[data-cpday]').first.get_attribute('data-cpday'));b=a if same else a+8
                for day in ([b,a] if reverse else [a,b]):frame.locator('[data-cpday="'+str(day)+'"]').click()
                frame.locator('[data-cpstep="'+step+'"]').click()
            draft=frame.evaluate('window.__pvtState.phead.cpd')
            assert page.evaluate('emits.length')==emits,'Draft emitted a query'
            # Evaluate the untouched production methods with the same original
            # data, independent of the transformed UI and its private closure.
            reference=browser.new_page()
            reference.evaluate('var data='+json.dumps(ui.rows['head'])+';var option;'+source)
            expected=reference.evaluate('d=>{var p=cpSnap(d.a,d.b,d.g);return {param:cpParam(p),period:p,previous:cpPrev(p)}}',draft)
            reference.close()
            frame.locator('[data-cpapply]').click()
            frame.wait_for_function('(value)=>__paNext.masks.head.some(x=>x.column==="period_param"&&x.value[0]===value)',arg=expected['param'])
            applied=frame.evaluate('window.__pvtState.phead.cp')
            assert {k:applied[k] for k in ['a','b','g','t','n']}==expected['period'],(label,applied,expected)
            page.wait_for_timeout(230)
            assert not frame.locator('body>.phead-dd').is_visible()
            if same:assert applied['n']==1
            if preset:assert applied['n']==7
            assert not errors,errors
            report['cases'].append({'label':label,'viewportWidth':width,'parameter':expected['param'],'period':expected['period'],'previous':expected['previous']})
            print('PASS:',label,expected['param'],'matches original date math',flush=True);page.close()
        browser.close()
    report['sha256']=hashlib.sha256((ui.OUT/'4. JS — весь отчёт.js').read_bytes()).hexdigest()
    report['completed']=True;(OUT/'metrics.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))


if __name__=='__main__':main()
