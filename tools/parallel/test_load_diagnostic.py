#!/usr/bin/env python3
"""Ensure the console recorder observes requests without reading or replacing bodies."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
CODE=(ROOT/'Параллельный отчёт — pa_next/16. Консоль — скорость загрузки.js').read_text()


def main():
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
        page=browser.new_page()
        page.set_content('<div>Diagnostic test</div>')
        page.evaluate('''()=>{
          window.responsesRead=0;window.requestsMade=0;
          window.testResponse={status:202,clone(){responsesRead++;throw Error('Body read')},json(){responsesRead++;throw Error('Body read')}};
          window.savedFetch=window.fetch=function(){requestsMade++;return window.lastPromise=Promise.resolve(testResponse)};
          class X extends EventTarget{open(method,url){this.url=url}send(body){this.body=body;this.status=200;this.dispatchEvent(new Event('loadend'))}}
          window.XMLHttpRequest=X;window.savedOpen=X.prototype.open;window.savedSend=X.prototype.send;
        }''')
        page.evaluate(CODE)
        assert page.evaluate('requestsMade')==0,'Recorder started network requests'
        page.evaluate('''async()=>{
          var body=JSON.stringify({form_data:{slice_id:859563},filters:[{col:'ca_login_f',val:['private-user']}]});
          var result=fetch('https://proteus.example/api/v1/chart/data/?token=private-token',{method:'POST',body:body});
          if(result!==lastPromise)throw Error('Promise was replaced');
          if(await result!==testResponse)throw Error('Response was replaced');
          var xhr=new XMLHttpRequest();xhr.open('POST','https://proteus.example/api/v1/chart/data/');xhr.send(body);
          if(xhr.body!==body)throw Error('XHR body was replaced');
        }''')
        output=json.loads(page.evaluate('__paNextPerf.finish()'))
        assert len(output['requests'])==2,output
        assert all(r['chart']==859563 and r['status'] in [200,202] for r in output['requests'])
        assert page.evaluate('responsesRead')==0
        assert page.evaluate('fetch===savedFetch&&XMLHttpRequest.prototype.open===savedOpen&&XMLHttpRequest.prototype.send===savedSend')
        text=json.dumps(output)
        for value in ['private-user','private-token','ca_login_f','proteus.example']:
            assert value not in text,value
        # Reinstall is idempotent; manual stop preserves a later unrelated wrapper.
        page.evaluate(CODE)
        page.evaluate('()=>{window.laterFetch=window.fetch=function(){return Promise.resolve(testResponse)}}')
        page.evaluate('__paNextPerf.stop()')
        assert page.evaluate('fetch===laterFetch')
        browser.close()
    print('PASS recorder: no extra requests/body reads; same Promise/response/XHR body; chart/timing capture; privacy, restore, reinstall and later-wrapper preservation')


if __name__=='__main__':main()
