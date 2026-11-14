#!/usr/bin/env python3
"""Exercise local layout and interactive tour in the composed opaque iframe."""
import argparse
from playwright.sync_api import sync_playwright
from test_ui import ROOT, scripts
from test_ui_controls import mount


def assert_dynamic_geometry(frame):
    # Original renderers debounce ResizeObserver by 150 ms. Await their actual
    # layout instead of photographing the intermediate stretched SVG viewBox.
    frame.wait_for_function('''() => {
      var svgs = Array.from(document.querySelectorAll('.pone-overlay svg[data-dyn-svg]'));
      var panel = document.querySelector('[data-pa-next-host="one"]').getBoundingClientRect();
      return svgs.length === 2 && svgs.every(s => {
        var r = s.getBoundingClientRect(), box = s.viewBox.baseVal;
        return Math.abs(r.width - box.width) < 2 && Math.abs(r.height - box.height) < 2 && r.bottom <= panel.bottom;
      });
    }''', timeout=5000)
    sizes = frame.evaluate('''() => Array.from(document.querySelectorAll('.pone-overlay svg[data-dyn-svg]')).map(s => {
      var text = s.querySelector('text');
      return {width: s.clientWidth, viewBox: s.viewBox.baseVal.width,
        textHeight: text.getBoundingClientRect().height, fontSize: parseFloat(getComputedStyle(text).fontSize)};
    })''')
    assert all(s['textHeight'] <= s['fontSize'] * 1.4 for s in sizes), sizes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-only', action='store_true', help='Inject interaction source for development before the delivery is rebuilt')
    args = parser.parse_args()
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
        page = browser.new_page(viewport={'width':1440,'height':1000})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        frame = mount(page)
        if args.source_only:
            frame.evaluate('() => {' + (ROOT/'Параллельный отчёт — pa_next/src/interaction.js').read_text() + '''
              if (window.__paNext.interaction) window.__paNext.interaction.destroy();
              window.__paNext.interaction = installInteraction(document.querySelector('.pa-next-shell'), window.__paNext);
              document.querySelector('[data-tourstart]').addEventListener('click', function(ev) {
                ev.stopPropagation(); window.__paNext.interaction.help();
              });
            }''')
        splitter = frame.get_by_role('separator', name='Ширина каталога')
        splitter.wait_for()
        cat = frame.locator('[data-pa-next-host="cat"]')
        panel = frame.locator('[data-pa-next-host="one"]')
        toggle = frame.locator('[data-layout="toggle"]')
        header = frame.locator('.phead-overlay').bounding_box()
        layoutbar = frame.locator('.pa-next-layoutbar').bounding_box()
        assert layoutbar['y'] - header['y'] - header['height'] >= 11, (header, layoutbar)
        assert_dynamic_geometry(frame)
        page.screenshot(path='/tmp/pa-next-ui-layout-default.png')
        original = cat.bounding_box()['width']
        frame.get_by_role('button', name='Увеличить каталог', exact=True).click()
        assert cat.bounding_box()['width'] > original + 40
        splitter.focus()
        splitter.press('ArrowLeft')
        after_key = cat.bounding_box()['width']
        assert original + 20 <= after_key <= original + 28
        splitter.press('Home')
        assert cat.bounding_box()['width'] == 280
        assert frame.get_by_role('button', name='Уменьшить каталог', exact=True).is_disabled()
        splitter.press('End')
        assert panel.bounding_box()['width'] >= 380
        assert frame.get_by_role('button', name='Увеличить каталог', exact=True).is_disabled()
        splitter.press('ArrowLeft')
        before_drag = cat.bounding_box()['width']
        box = splitter.bounding_box()
        page.mouse.move(box['x']+box['width']/2, box['y']+60)
        page.mouse.down()
        page.mouse.move(box['x']-100, box['y']+60, steps=5)
        page.mouse.up()
        assert cat.bounding_box()['width'] < before_drag - 90
        assert not frame.locator('.pa-next-resizing').count()
        assert frame.evaluate('window.__paNext.layout.ratio > 0')
        assert page.evaluate('emits') == []
        print('PASS: buttons, separator arrows/Home/End and pointer drag resize within bounds without data queries')

        # Pointer Events cover touch as well: cancellation releases the drag lock.
        before_touch = cat.bounding_box()['width']
        splitter.evaluate('''el => {
          var x = el.getBoundingClientRect().left;
          el.dispatchEvent(new PointerEvent('pointerdown', {pointerId: 91, pointerType: 'touch', clientX: x, button: 0, bubbles: true}));
          window.dispatchEvent(new PointerEvent('pointermove', {pointerId: 91, pointerType: 'touch', clientX: x - 40, bubbles: true}));
          window.dispatchEvent(new PointerEvent('pointercancel', {pointerId: 91, pointerType: 'touch', bubbles: true}));
        }''')
        assert cat.bounding_box()['width'] < before_touch - 35
        assert not frame.locator('.pa-next-resizing').count()
        print('PASS: touch pointer movement resizes; cancellation releases selection lock')

        saved_width = cat.bounding_box()['width']
        old_panel_width = panel.bounding_box()['width']
        catalog_text = cat.inner_text()
        # Inspect in the very same JS stack as the click, before ResizeObserver
        # or its 150 ms timer can conceal a stretched first frame.
        immediate = toggle.evaluate('''el => {
          el.click();
          return Array.from(document.querySelectorAll('.pone-overlay svg[data-dyn-svg]')).map(s => ({
            width: s.getBoundingClientRect().width, viewBox: s.viewBox.baseVal.width,
            height: s.getBoundingClientRect().height, boxHeight: s.viewBox.baseVal.height
          }));
        }''')
        assert len(immediate) == 2 and all(abs(s['width']-s['viewBox'])<2 and abs(s['height']-s['boxHeight'])<2 for s in immediate), immediate
        assert not cat.is_visible()
        assert panel.bounding_box()['width'] > old_panel_width + 200
        assert toggle.inner_text() == 'Показать каталог'
        assert toggle.get_attribute('aria-expanded') == 'false'
        assert_dynamic_geometry(frame)
        page.screenshot(path='/tmp/pa-next-ui-layout-hidden.png')
        toggle.click()
        assert cat.is_visible() and abs(cat.bounding_box()['width']-saved_width)<2
        assert_dynamic_geometry(frame)
        assert cat.inner_text() == catalog_text
        assert page.evaluate('emits') == []
        print('PASS: hide/show retains catalogue state; both SVGs fit at scale 1:1 immediately and after ResizeObserver')
        if not args.source_only:
            frame.evaluate('() => {' + scripts['head'] + '}')
            assert frame.locator('.pa-next-layoutbar').count() == 1
            assert splitter.count() == 1
            assert abs(cat.bounding_box()['width']-saved_width)<2
            frame.get_by_role('button', name='Уменьшить каталог', exact=True).click()
            assert abs(cat.bounding_box()['width']-(saved_width-48))<2
            assert page.evaluate('emits') == []
            print('PASS: full chart rerun retains width, tears down old handlers and keeps one toolbar/separator')

        # Session fallback must work despite unavailable localStorage in allow-scripts sandbox.
        assert frame.evaluate('''(() => {try {localStorage.getItem('x');return false} catch(e) {return true}})()''')
        toggle.click()
        frame.locator('[data-tourstart]').click()
        layer = frame.locator('.pa-next-help.pa-next-tour')
        layer.wait_for()
        assert cat.is_visible(), 'tour reveals catalogue temporarily'
        assert layer.get_attribute('data-tour-step') == '1'
        assert 'за минуту' in layer.locator('h2').inner_text()
        assert frame.locator('.pa-next-content').evaluate('(el)=>el.inert')
        assert layer.get_by_role('button', name='Начать', exact=True).evaluate('(el)=>el===document.activeElement')
        layer.get_by_role('button', name='Начать', exact=True).press('Tab')
        assert layer.get_by_role('button', name='Закрыть гид').evaluate('(el)=>el===document.activeElement')
        layer.get_by_role('button', name='Закрыть гид').press('Shift+Tab')
        assert layer.get_by_role('button', name='Начать', exact=True).evaluate('(el)=>el===document.activeElement')
        layer.get_by_role('button', name='Начать', exact=True).press('ArrowRight')
        assert layer.get_attribute('data-tour-step') == '2'
        assert 'Период' in layer.locator('h2').inner_text()
        page.screenshot(path='/tmp/pa-next-ui-layout-guide.png')
        layer.locator('[data-tour-action="back"]').click()
        assert layer.get_attribute('data-tour-step') == '1'

        titles = []
        while layer.count():
            titles.append(layer.locator('h2').inner_text())
            card = layer.locator('[role="dialog"]').bounding_box()
            assert card['x']>=0 and card['y']>=0 and card['x']+card['width']<=1440 and card['y']+card['height']<=1000, card
            if layer.get_attribute('data-tour-step') != '1':
                ring = layer.locator('.pa-next-tour-ring')
                assert ring.is_visible()
                assert ring.evaluate('(el)=>getComputedStyle(el).backgroundColor') == 'rgba(0, 0, 0, 0)'
                assert ring.bounding_box()['width']>0
            layer.locator('[data-tour-action="next"]').click()
        assert len(titles)>=10, titles
        assert 'Ширина каталога' in titles and 'Только аналитика' in titles and 'Вкладки аналитики' in titles, titles
        assert not cat.is_visible(), 'tour restores hidden catalogue'
        assert frame.locator('[data-tourstart]').evaluate('(el)=>el===document.activeElement')
        assert not frame.locator('.pa-next-content').evaluate('(el)=>el.inert')
        assert page.evaluate('emits') == []
        print('PASS: complete interactive tour, targets, keyboard/focus trap and hidden catalogue restoration; no filters emitted')

        frame.locator('[data-tourstart]').click()
        frame.locator('.pa-next-tour [data-tour-action="next"]').press('Escape')
        assert not frame.locator('.pa-next-tour').count()
        assert not cat.is_visible()
        toggle.click()
        for width in [1280, 900, 700, 390]:
            page.set_viewport_size({'width':width,'height':650})
            page.wait_for_timeout(250)
            print('CHECK: interactive guide at viewport', width, flush=True)
            frame.locator('[data-tourstart]').click()
            for _ in range(4):
                layer = frame.locator('.pa-next-tour')
                card = layer.locator('[role="dialog"]').bounding_box()
                assert card['x']>=0 and card['x']+card['width']<=width+1 and card['y']>=0 and card['y']+card['height']<=650, (width,card)
                layer.locator('[data-tour-action="next"]').click()
            frame.locator('.pa-next-tour [data-tour-action="next"]').press('Escape')
        assert not errors, errors
        print('PASS: Escape, repeated tours, responsive visible-viewport placement at 1280/900/700/390; no browser errors')
        browser.close()


if __name__ == '__main__':
    main()
