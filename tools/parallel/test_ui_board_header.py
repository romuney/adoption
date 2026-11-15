#!/usr/bin/env python3
"""Real board CSS against Superset's collapsed-filter header compensation.

The negative control removes only the delivered header rule. This models the
upstream React inline margin; it does not claim access to live Proteus.
"""
import json,hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright
from test_ui import OUT
css=(OUT/'9. CSS — дашборд.css').read_text()
rules=[line for line in css.splitlines() if '.dragdroppable:has(.dashboard-header-container){margin-left:0!important}' in line]
assert len(rules)==1,'Expected one scoped header compensation rule'
fix=rules[0]
negative_css=css.replace(fix,'')
base='''html,body{margin:0;height:100%;font:14px Arial}nav{height:48px;padding:12px 24px;box-sizing:border-box;background:#fff;border-bottom:1px solid #ddd}.app{display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto 1fr}.platform-header{grid-column:2;grid-row:1;position:sticky;top:0;max-width:100vw}.platform-content{grid-column:2;grid-row:2;min-width:0}.dashboard-header-container{height:65px;border-bottom:1px solid #ddd;box-sizing:border-box;background:#fff}.header-with-actions{display:flex;align-items:center;gap:16px;height:100%;padding:0 24px;box-sizing:border-box}.dashboard-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1}.header-actions{flex:none;display:flex;gap:8px}.header-actions button{height:32px}.dashboard-content{display:flex}.grid-container{flex:1;width:0}.grid-row{display:flex}.dragdroppable-column{flex:1;min-width:0}.resizable-container{height:500px}.dashboard-chart-id-859562{width:100%;height:100%}.chart-slice,.dashboard-chart,.chart-container,.slice_container,.react_sanbbox{height:100%}iframe{border:0;width:100%;height:100%}'''
probe='''() => {function rect(s){var n=document.querySelector(s),r=n.getBoundingClientRect();return {x:r.left,right:r.right,width:r.width,scroll:n.scrollWidth,client:n.clientWidth}}return {window:innerWidth,header:rect('.dashboard-header-container'),title:rect('.dashboard-title'),nav:rect('nav'),edit:rect('[data-test=edit-dashboard]'),wrapper:rect('[data-test=top-level-tabs]'),scrollX:scrollX,html:rect('html')};}'''
result={'css_sha256':hashlib.sha256(css.encode()).hexdigest(),'scope':'Actual delivered CSS; modeled Superset 2.1 collapsed-native-filter inline margin; not live Proteus','cases':[]}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,ignore_default_args=['--hide-scrollbars'])
 for width,height,dpr in [(1658,963,1),(1366,768,1),(1138,640,1.2),(2560,1440,1)]:
  page=b.new_page(viewport={'width':width,'height':height},device_scale_factor=dpr)
  page.set_content('<!doctype html><html><head><style>'+base+negative_css+'</style></head><body><nav role="navigation">Proteus · Аналитика · Отчёты · Коллекции</nav><div class="app"><div class="platform-header"><div class="dragdroppable" data-test="top-level-tabs" style="margin-left:-32px"><div><div class="dashboard-header-container"><div class="header-with-actions"><h1 class="dashboard-title">Proteus Adoption — длинное название борда с каталогом отчётов, аналитикой и дополнительными словами для проверки обрезки</h1><div class="header-actions"><button>Настройки</button><button data-test="edit-dashboard">Редактировать</button></div></div></div></div></div></div><div class="platform-content"><div class="dashboard"><div class="dashboard-content"><div class="grid-container"><div class="grid-row"><div class="dragdroppable-column"><div class="resizable-container"><div class="dashboard-component-chart-holder dashboard-chart-id-859562"><div class="chart-slice"><div class="dashboard-chart"><div class="chart-container"><div class="slice_container"><div class="react_sanbbox"><iframe sandbox="allow-scripts"></iframe></div></div></div></div></div></div></div></div></div></div></div></div></div></div></body></html>')
  before=page.evaluate(probe);assert before['header']['x']==-32,before
  page.add_style_tag(content=fix);after=page.evaluate(probe)
  assert after['header']['x']==0 and after['header']['right']==width,after
  assert after['nav']==before['nav'],(before,after)
  assert after['edit']['x']>=0 and after['edit']['right']<=width,after
  assert after['scrollX']==0 and after['html']['scroll']<=width,after
  # React can apply the compensation again after mount; CSS remains scoped.
  page.locator('[data-test=top-level-tabs]').evaluate('(n)=>n.style.marginLeft="0px"')
  page.locator('[data-test=top-level-tabs]').evaluate('(n)=>n.style.marginLeft="-32px"')
  assert page.evaluate(probe)['header']['x']==0
  page.locator('.dashboard').evaluate('(n)=>n.classList.add("dashboard--editing")')
  editing=page.evaluate(probe);assert editing['header']['x']==-32,editing
  result['cases'].append({'viewport':[width,height],'dpr':dpr,'before':before,'after':after,'editingNativeMargin':editing['header']['x']})
  page.close()
 b.close()
Path('/tmp/pa-next-header-proof.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print('PASS: Superset -32px compensation, four viewports, no-id nav, long title, late inline update, editor exclusion')
