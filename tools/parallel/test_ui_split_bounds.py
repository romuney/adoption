#!/usr/bin/env python3
"""Real board widths: stretch catalogue and protect fixed-size KPI/control text."""
import argparse, copy, hashlib, json
from pathlib import Path
from playwright.sync_api import sync_playwright
import test_ui_viewport as ui

PROBE = r'''() => {
 function box(n){var r=n.getBoundingClientRect();return {x:r.left,right:r.right,y:r.top,bottom:r.bottom,w:r.width,h:r.height,cw:n.clientWidth,sw:n.scrollWidth}}
 var panel=document.querySelector('.pa-next-one'),grid=panel.querySelector('.pone-kpis'),cards=[];
 if(grid) Array.from(grid.children).forEach(function(card){
   var r=box(card),texts=[];
   card.querySelectorAll('.pone-k-val,.pone-k-sub b,.pone-delta,.pone-nocmp').forEach(function(n){
     var range=document.createRange();range.selectNodeContents(n);
     texts.push({text:n.textContent,rects:Array.from(range.getClientRects(),boxRect),font:getComputedStyle(n).fontSize});
   });
   var walker=document.createTreeWalker(card.querySelector('.pone-k-sub')||card,NodeFilter.SHOW_TEXT),node;
   while((node=walker.nextNode())){var regex=/\d{1,3}(?:[ \u00a0\u202f]\d{3})+/g,m;while((m=regex.exec(node.textContent))){
     var range=document.createRange();range.setStart(node,m.index);range.setEnd(node,m.index+m[0].length);
     texts.push({text:m[0],number:true,rects:Array.from(range.getClientRects(),boxRect)});
   }}
   cards.push({rect:r,texts:texts});
 });
 function boxRect(r){return {x:r.left,right:r.right,y:r.top,bottom:r.bottom,w:r.width,h:r.height}}
 var table=document.querySelector('.prb-ptable'),scroll=table&&table.closest('.prb-tscroll');
 return {minimum:window.__paNext.panelMinimum||740,panel:box(panel),cat:box(document.querySelector('.pa-next-cat')),
   content:box(document.querySelector('.pa-next-content')),table:table?box(table):null,tableScroll:scroll?box(scroll):null,
   cards:cards,tabs:Array.from(panel.querySelectorAll('.pone-vtabs [data-view]'),box),
   controls:Array.from(panel.querySelectorAll('.pone-who-bar,.pone-scopebar,.pone-cal-bar'),box),
   htmlWidth:document.documentElement.scrollWidth,innerWidth:innerWidth};
}'''


def geometry(frame,label):
    g=frame.evaluate(PROBE)
    assert g['minimum']>=740 and g['panel']['w']>=g['minimum']-.1,(label,g)
    assert g['cat']['w']>=420,(label,g)
    assert g['htmlWidth']<=g['innerWidth'],(label,'iframe overflow',g)
    for n in g['tabs']+g['controls']:
        assert n['x']>=g['panel']['x']-1 and n['right']<=g['panel']['right']+1,(label,'control outside panel',n,g['panel'])
    for card in g['cards']:
        for text in card['texts']:
            for r in text['rects']:
                assert r['x']>=card['rect']['x']-1 and r['right']<=card['rect']['right']+1,(label,'KPI text outside its card',text,card['rect'])
            if text.get('number'):
                assert len(set(round(r['y'],1) for r in text['rects']))<=1,(label,'number wrapped',text)
    return g


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--output',type=Path,default=Path('/tmp/pa-next-split-bounds'))
    ap.add_argument('--periods',type=Path,default=Path('/tmp/pa-next-periods/d'))
    ap.add_argument('--preview',type=Path,default=Path('/tmp/pa-next-preview/d/2.json'))
    a=ap.parse_args();a.output.mkdir(parents=True,exist_ok=True)
    for part in ['head','cat','one']:ui.rows[part]=json.loads((a.periods/(part+'.json')).read_text())
    hashes={name:hashlib.sha256((ui.OUT/file).read_bytes()).hexdigest() for name,file in [('main','4. JS — весь отчёт.js'),('css','9. CSS — дашборд.css')]}
    result={'sha256':hashes,'source_sha256':{name:hashlib.sha256((ui.OUT/'src'/name).read_bytes()).hexdigest() for name in ['interaction.js','viewport.js']},'cases':[]}
    with sync_playwright() as p:
        b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,ignore_default_args=['--hide-scrollbars'])
        for width,height in [(1280,800),(1366,768),(1920,1080),(2560,1440),(3440,1440)]:
            page=b.new_page(viewport={'width':width,'height':height},reduced_motion='reduce');errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)));f=ui.mount(page)
            split=f.get_by_role('separator',name='Ширина каталога');accepted=f.evaluate('JSON.stringify(window.__paNext.accepted)')
            split.press('End');page.wait_for_timeout(250);g=geometry(f,str(width)+' maximum catalogue')
            assert abs(g['panel']['w']-g['minimum'])<=1,g
            assert g['table']['w']>=g['tableScroll']['cw']-1,(width,'catalogue table kept its old width cap',g)
            minimum=g['minimum'];tabs=[]
            for tab in (['dyn','cal','path','who','coh'] if width==1920 else ['dyn']):
                f.locator('[data-view="view:'+tab+'"]').click();page.wait_for_timeout(120)
                q=geometry(f,str(width)+' '+tab);assert q['minimum']==minimum,(tab,minimum,q['minimum']);tabs.append({'tab':tab,'panel':q['panel']['w']})
            split.press('Home');page.wait_for_timeout(150);home=geometry(f,str(width)+' catalogue minimum');assert home['cat']['w']==420,home
            assert f.evaluate('JSON.stringify(window.__paNext.accepted)')==accepted
            assert page.evaluate('emits.length')==0
            split.press('End');page.wait_for_timeout(100)
            f.locator('.pa-next-cat-toggle').click();page.wait_for_timeout(150)
            assert not f.locator('.pa-next-cat').is_visible();assert f.locator('.pa-next-one').bounding_box()['width']>=minimum
            f.locator('.pa-next-catalog-rail').click();page.wait_for_timeout(150)
            restored=geometry(f,str(width)+' restored');assert abs(restored['panel']['w']-minimum)<=1
            f.locator('[data-view="view:dyn"]').click();page.wait_for_timeout(120)
            f.locator('.pone-panel').hover(position={'x':5,'y':5});page.mouse.move(5,20);page.wait_for_timeout(150)
            page.screenshot(path=str(a.output/(str(width)+'-maximum-catalogue.png')))
            # Pending data must retain the same split bound, with no hidden KPI measure reset.
            f.locator('[data-grain="m"]').click();page.wait_for_timeout(250)
            assert f.evaluate('window.__paNext.panelMinimum')==minimum
            assert abs(f.locator('.pa-next-one').bounding_box()['width']-minimum)<=1
            assert not errors,errors
            result['cases'].append({'viewport':[width,height],'minimum':minimum,'maximumCatalogue':g['cat']['w'],'tableWidth':g['table']['w'],'tabs':tabs})
            page.close();print('PASS: width',width,'minimum',minimum,'table',g['table']['w'],flush=True)
        # Explicit synthetic typography boundary: billion-size counters, with
        # actual table/model shape, without changing production fixtures/data.
        original=ui.rows['one'];ui.rows['one']=copy.deepcopy(original)
        for row in ui.rows['one']:
            if row['section']=='total':
                fields=row['k'].split('|')
                for index in [0,1,10,11]:fields[index]='1234567890'
                row['k']='|'.join(fields)
        page=b.new_page(viewport={'width':1920,'height':1080},reduced_motion='reduce');f=ui.mount(page)
        f.get_by_role('separator',name='Ширина каталога').press('End');page.wait_for_timeout(250)
        g=geometry(f,'synthetic large counters');assert g['minimum']>900,g
        result['cases'].append({'syntheticLargeCounters':True,'minimum':g['minimum'],'panel':g['panel']['w']});page.close();ui.rows['one']=original
        # Actual selected-report response provides a meaningful, non-wide CA.
        page=b.new_page(viewport={'width':1366,'height':768},reduced_motion='reduce');f=ui.mount(page)
        f.locator('tr[data-rep="2"]').click()
        f.wait_for_function("() => JSON.stringify((window.__paNext.masks.cat.find(f=>f.column==='sel_f')||{}).value)==='[\"2\"]'")
        payload=json.loads(a.preview.read_text());masks=f.evaluate('window.__paNext.masks')
        for row in payload:
            if row['section']=='pa_next_request':row['k']=next((x['value'][0] for x in masks[row['g']] if x['column']=='pa_next_'+row['g']+'_req'),'')
        page.frame(name='one').evaluate('(rows)=>{data=rows;'+ui.scripts['one']+'}',payload)
        f.wait_for_selector('.pa-next-one[data-pa-next-state="ready"]')
        f.locator('[data-view="viewsMode:cov"]').click()
        f.wait_for_selector('.pone-cov-legend')
        coverage=[]
        for key in ['End','Home']:
            f.get_by_role('separator',name='Ширина каталога').press(key);page.wait_for_timeout(250)
            g=geometry(f,'coverage '+key)
            c=f.evaluate('''() => {var body=document.querySelector('.pone-panel-b'),r=body.getBoundingClientRect();
              return {body:{x:r.left,right:r.right,y:r.top,bottom:r.bottom},
                children:Array.from(body.children).filter(n=>getComputedStyle(n).display!=='none').map(n=>{var a=n.getBoundingClientRect();return {name:n.className.baseVal||n.className,x:a.left,right:a.right,y:a.top,bottom:a.bottom}}),
                styles:Array.from(document.querySelectorAll('.pone-cov-line'),n=>getComputedStyle(n).borderTopStyle)};}''')
            assert c['styles']==['solid','dashed'],c
            for child in c['children']:
                assert child['x']>=c['body']['x']-1 and child['right']<=c['body']['right']+1 and child['y']>=c['body']['y']-1 and child['bottom']<=c['body']['bottom']+1,('coverage content clipped',key,c)
            coverage.append({'key':key,'panelWidth':g['panel']['w'],'geometry':c})
        result['coverage']=coverage;page.close();b.close()
    assert hashes=={name:hashlib.sha256((ui.OUT/file).read_bytes()).hexdigest() for name,file in [('main','4. JS — весь отчёт.js'),('css','9. CSS — дашборд.css')]},'UI delivery changed during tests'
    result['completed']=True;(a.output/'metrics.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print('PASS: split bounds, catalogue width, KPI groups, all tabs, pending, large counters and coverage legend',flush=True)

if __name__=='__main__':main()
