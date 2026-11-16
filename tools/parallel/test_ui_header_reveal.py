#!/usr/bin/env python3
"""Native dashboard header remains reachable without parent-DOM iframe access.

Use the generated report in a local Superset wrapper. CSS additions can be
tested before rebuilding; --delivered requires the exact module in file 9.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

from playwright.sync_api import sync_playwright

import test_ui_viewport as ui
from header_reveal import header_control_markdown, header_reveal_css


DECORATE = r'''(options) => {
  var nav=document.querySelector('#main-menu');
  nav.style.cssText='height:48px;box-sizing:border-box;padding:8px 24px;background:white;border-bottom:1px solid #e7e9ee';
  nav.setAttribute('role','navigation');
  if(options.noId)nav.id='fork-navigation';
  nav.innerHTML='<button id="navigation-start" type="button">Proteus</button>';
  var header=document.querySelector('.dashboard-header-container');
  header.innerHTML='<div class="header-with-actions"><h1>Proteus Adoption · длинное название дашборда для проверки доступности действий</h1><div class="button-container"><button type="button" data-test="edit-dashboard">Редактировать</button><button type="button" data-test="dashboard-menu" aria-expanded="false">Меню</button></div></div>';
  var css=document.createElement('style');
  css.textContent='.header-with-actions{position:relative;display:flex;align-items:center;gap:16px;width:100%;min-width:0;height:100%}.header-with-actions h1{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.button-container{display:flex;gap:8px;flex:none}';
  if(options.wrapper){
    var platform=document.createElement('div'),drag=document.createElement('div'),content=document.createElement('div');
    platform.className='platform-header';drag.className='dragdroppable';drag.dataset.test='top-level-tabs';drag.style.marginLeft='-32px';
    header.parentNode.insertBefore(platform,header);platform.appendChild(drag);drag.appendChild(content);content.appendChild(header);
    css.textContent+='.board-scroller{display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}.platform-header{grid-column:2;grid-row:1;position:sticky;top:0;z-index:100;max-width:100vw}.dashboard{grid-column:2;grid-row:2;min-width:0}';
  }
  document.querySelector('head').appendChild(css);
  var edit=header.querySelector('[data-test="edit-dashboard"]'),menu=header.querySelector('[data-test="dashboard-menu"]');
  edit.onclick=function(){window.editClicks=(window.editClicks||0)+1;document.querySelector('.dashboard').classList.add('dashboard--editing');
    var drag=document.querySelector('[data-test="top-level-tabs"]');if(drag)drag.style.marginLeft='0px';};
  function closeMenu(){var popup=document.querySelector('.test-native-menu');if(popup)popup.remove();menu.classList.remove('ant-dropdown-open');menu.setAttribute('aria-expanded','false');menu.focus();}
  menu.onclick=function(){
    if(menu.getAttribute('aria-expanded')==='true'){closeMenu();return;}
    menu.setAttribute('aria-expanded','true');menu.classList.add('ant-dropdown-open');
    var popup=document.createElement('div');popup.className='test-native-menu ant-dropdown';popup.setAttribute('role','menu');
    popup.style.cssText='position:fixed;top:113px;right:24px;background:white;border:1px solid #aaa;padding:12px;z-index:1050';
    popup.innerHTML='<button data-test="native-menu-item" role="menuitem">Действие меню</button>';
    popup.querySelector('button').onclick=function(){window.menuClicks=(window.menuClicks||0)+1;closeMenu();};
    popup.onkeydown=function(e){if(e.key==='Escape')closeMenu();};
    (options.portal?document.body:header.querySelector('.header-with-actions')).appendChild(popup);
  };
}'''

PROBE = r'''() => {
  function rect(selector){var n=document.querySelector(selector),r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};}
  var header=document.querySelector('.dashboard-header-container'),s=getComputedStyle(header),after=getComputedStyle(header,'::after');
  return {header:rect('.dashboard-header-container'),iframe:rect('iframe[name="head"]'),nav:rect('[role="navigation"]'),
    style:{display:s.display,position:s.position,transform:s.transform,clip:s.clipPath,transition:s.transitionDuration},
    after:{content:after.content,height:after.height,background:after.backgroundColor},
    scroll:{x:scrollX,y:scrollY,board:document.querySelector('.board-scroller').scrollTop},
    headerReservation:getComputedStyle(document.querySelector('.grid-container')).getPropertyValue('--pa-next-board-header-height'),
    focused:document.activeElement&&document.activeElement.getAttribute('data-test')};
}'''


def unchanged_chart(before, after, label):
    assert before['iframe'] == after['iframe'], (label, 'reveal changed chart geometry', before, after)
    assert before['nav'] == after['nav'], (label, 'reveal changed global navigation', before, after)
    assert after['scroll']['x'] == 0 and after['scroll']['board'] == 0, (label, after)


def render_markdown(source, modules):
    """Exercise the real ReactMarkdown version used by Superset 2.1.

    Install isolated test dependencies once if missing:
    npm install --prefix /tmp/pa-next-markdown-render --no-audit --no-fund \
      react@18.2.0 react-dom@18.2.0 react-markdown@8.0.3 rehype-sanitize@5.0.1 rehype-raw@6.1.1
    """
    assert (modules/'react-markdown/index.js').exists(), 'Install the isolated Markdown test dependencies described in render_markdown()'
    js = r'''import fs from 'node:fs';import {pathToFileURL} from 'node:url';
const input=JSON.parse(fs.readFileSync(0,'utf8'));
async function take(file){return await import(pathToFileURL(input.modules+'/'+file).href)}
const React=(await take('react/index.js')).default;
const server=(await take('react-dom/server.node.js')).default;
const Markdown=(await take('react-markdown/index.js')).default;
const raw=(await take('rehype-raw/index.js')).default;
const sanitize=(await take('rehype-sanitize/index.js')).default;
const modes={plain:{skipHtml:true},raw:{rehypePlugins:[raw]},sanitized:{rehypePlugins:[raw,sanitize]}};
const html={};for(const [name,props] of Object.entries(modes))html[name]=server.renderToStaticMarkup(React.createElement(Markdown,props,input.source));
console.log(JSON.stringify({html,version:JSON.parse(fs.readFileSync(input.modules+'/react-markdown/package.json','utf8')).version}));'''
    rendered=json.loads(subprocess.check_output(['node','--input-type=module','-e',js],input=json.dumps({'modules':str(modules),'source':source}).encode()))
    assert rendered['version']=='8.0.3'
    assert len(set(rendered['html'].values()))==1,rendered
    assert 'target=' not in rendered['html']['plain'],rendered
    return rendered


def install_control(page, html, mixed=False):
    page.evaluate('''({html,mixed})=>{
      var row=document.createElement('div');row.className='dragdroppable dragdroppable-row';row.dataset.test='header-control-row';
      row.innerHTML='<div class="with-popover-menu"><div class="grid-row"><div class="dragdroppable"><div class="with-popover-menu"><div class="dashboard-markdown"><div class="resizable-container" style="height:120px"><div class="dashboard-component dashboard-component-chart-holder">'+html+'</div></div></div></div></div></div></div>';
      if(mixed){var other=document.createElement('div');other.className='dragdroppable';other.innerHTML='<div class="dashboard-component-chart-holder" style="height:80px">Ordinary chart fixture</div>';row.querySelector('.grid-row').appendChild(other);}
      var grid=document.querySelector('.grid-content');grid.insertBefore(row,grid.firstChild);
    }''',{'html':html,'mixed':mixed})


def remove_control(page):
    page.locator('[data-test="header-control-row"]').evaluate('(node)=>node.remove()')
    page.locator('.board-scroller').evaluate('(node)=>{node.scrollTop=0;node.scrollLeft=0}')


def main():
    # Keep the historical command usable; shared DOM/Markdown helpers above
    # are still imported by the expanded regression for both control versions.
    import sys
    from test_ui_header_focus import main as current_regression
    sys.argv = [arg for arg in sys.argv if arg != '--delivered']
    current_regression()


if __name__ == '__main__':
    main()
