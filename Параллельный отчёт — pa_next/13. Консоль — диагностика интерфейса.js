/* Диагностика pa_next. Запустить в DevTools Console сначала в top, затем в
   контексте основного iframe, где Boolean(window.__paNext) === true.
   После воспроизведения: copy(__paNextDebug.finish()) — в каждом контексте.
   Не вставлять в JS чарта. Никаких applyCrossFilter/fetch/чтения cookies/storage. */
(function () {
  'use strict';
  if (window.__paNextDebug && window.__paNextDebug.stop) window.__paNextDebug.stop();
  var clock = performance.now(), started = new Date().toISOString();
  var scope = window.__paNext ? 'report' : (window === window.top ? 'board' : 'wrong-context');
  var stopped = false, frameId = null, burst = 0, timer = null, expiry = null, observer = null;
  var samples = [], events = [], lastSignature = '', lastTime = -10000, final = null;
  // Opaque, per-recording labels allow equality comparisons without disclosing
  // login/name/filter values. The private dictionary is never exported.
  var tokens = new Map(), nextToken = 0;
  function token(value) {
    var key = typeof value + ':' + String(value);
    if (!tokens.has(key)) tokens.set(key, 'v' + (++nextToken));
    return tokens.get(key);
  }
  function ms() { return Math.round(performance.now() - clock); }
  function round(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function limit(list, max) { return Array.prototype.slice.call(list || [], 0, max); }
  function label(node) {
    if (!node || node.nodeType !== 1) return null;
    var id = /^(chart-id-\d+|main-menu|app|root|pa-next-[\w-]+)$/.test(node.id || '') ? '#' + node.id : '';
    return node.tagName.toLowerCase() + id + limit(node.classList, 8).map(function (c) { return '.' + c; }).join('');
  }
  function rect(node) {
    if (!node || !node.getBoundingClientRect) return null;
    var r = node.getBoundingClientRect();
    return { node: label(node), x: round(r.left), y: round(r.top), width: round(r.width), height: round(r.height),
      right: round(r.right), bottom: round(r.bottom), clientWidth: node.clientWidth, clientHeight: node.clientHeight,
      scrollWidth: node.scrollWidth, scrollHeight: node.scrollHeight, scrollTop: round(node.scrollTop), scrollLeft: round(node.scrollLeft) };
  }
  var properties = ['display','position','top','right','bottom','left','height','min-height','max-height','width','min-width','max-width',
    'box-sizing','overflow','overflow-x','overflow-y','overscroll-behavior-y','overflow-anchor','scrollbar-gutter',
    'flex','flex-direction','flex-wrap','flex-shrink','flex-grow','flex-basis','order','grid-template-columns','grid-template-rows',
    'grid-auto-rows','grid-column','grid-row','align-items','align-self','justify-content','row-gap','column-gap',
    'margin-top','margin-right','margin-bottom','margin-left','padding-top','padding-right','padding-bottom','padding-left',
    'border-top-width','border-right-width','border-bottom-width','border-left-width','transform','transform-origin','zoom',
    'contain','container-type','container-name','content-visibility','visibility','opacity','pointer-events','z-index',
    'font-family','font-size','line-height','--pa-next-nav-height','--pa-next-board-header-height','--ovr'];
  function styles(style) {
    var out = {}; properties.forEach(function (key) { var value = style.getPropertyValue(key); if (value) out[key] = value; }); return out;
  }
  function element(node) {
    var out = rect(node); if (!out) return null;
    out.style = styles(getComputedStyle(node)); out.inline = styles(node.style);
    out.childCount = node.children.length; out.inert = !!node.inert;
    out.ariaBusy = node.getAttribute('aria-busy'); out.state = node.getAttribute('data-pa-next-state');
    return out;
  }
  var boardSelectors = {
    html:'html', body:'body', nav:'#main-menu,nav,[role="navigation"],.navbar', header:'.dashboard-header-container',
    headerTitle:'.dashboard-header-container .dashboard-title,.dashboard-header-container .editable-title,.dashboard-header-container h1',
    headerActions:'.dashboard-header-container .dashboard-actions,.dashboard-header-container .header-actions,.dashboard-header-container [data-test="edit-dashboard"]',
    app:'#app,#root,.superset-app',
    boardScroller:'.board-scroller', dashboard:'.dashboard', dashboardContent:'.dashboard-content', grid:'.grid-container',
    holder:'.dashboard-component-chart-holder.dashboard-chart-id-859562',
    main:'.dashboard-chart-id-859562 .react_sanbbox', iframe:'.dashboard-chart-id-859562 iframe',
    catHolder:'.dashboard-component-chart-holder.dashboard-chart-id-859563', oneHolder:'.dashboard-component-chart-holder.dashboard-chart-id-859564',
    native:'[data-test="filter-bar"]', loading:'.dashboard-chart-id-859562 img.loading'
  };
  var reportSelectors = {
    html:'html', body:'body', host:'[_echarts_instance_]', shell:'.pa-next-shell', head:'.pa-next-head', headRoot:'.phead-root', strip:'.phead-strip',
    content:'.pa-next-content', cat:'.pa-next-cat', splitter:'.pa-next-splitter', rail:'.pa-next-catalog-rail', one:'.pa-next-one',
    overlay:'.pone-overlay', root:'.pone-root', topbar:'.pone-topbar', top:'.pone-top', kpis:'.pone-kpis', obs:'.pone-obs',
    filterRow:'.pone-frow', panel:'.pone-panel', panelHead:'.pone-panel-h', panelBody:'.pone-panel-b',
    pending:'.pone-pend', wait:'.pa-next-one .pa-next-wait', loading:'.pa-next-one .pa-next-loading'
  };
  var selectors = scope === 'report' ? reportSelectors : boardSelectors;
  function viewport() {
    var v = window.visualViewport;
    return { innerWidth: innerWidth, innerHeight: innerHeight, outerWidth: outerWidth, outerHeight: outerHeight,
      devicePixelRatio: devicePixelRatio, scrollX: round(scrollX), scrollY: round(scrollY),
      documentClientWidth: document.documentElement.clientWidth, documentClientHeight: document.documentElement.clientHeight,
      screen: { width: screen.width, height: screen.height, availWidth: screen.availWidth, availHeight: screen.availHeight },
      visualViewport: v ? { width: round(v.width), height: round(v.height), scale: v.scale, offsetTop: round(v.offsetTop),
        offsetLeft: round(v.offsetLeft), pageTop: round(v.pageTop), pageLeft: round(v.pageLeft) } : null };
  }
  function valueList(values) {
    return { count: (values || []).length, items: limit(values, 30).map(function (value) {
      return { token: token(value), empty: value === '', type: typeof value };
    }) };
  }
  function masks(mask) {
    return limit(mask, 40).map(function (f) { return { column: f.column, operator: f.operator, values: valueList(f.value) }; });
  }
  function maskSources(obj) {
    var out = {}; Object.keys(obj || {}).forEach(function (k) { out[k] = masks(obj[k]); }); return out;
  }
  function record(x) {
    return x ? { key: token(x.key), generation: token(x.generation), request: token(x.request), serial: x.serial,
      instance: token(x.instance), ageMs: x.time ? Date.now() - x.time : null, bytes: x.bytes } : null;
  }
  function rowSummary(rows) {
    var counts = {}, requests = {}, version = [];
    (rows || []).forEach(function (r) {
      var section = String(r.section || ''); counts[section] = (counts[section] || 0) + 1;
      if (section === 'pa_next_request') requests[r.g] = token(r.k);
      if (section === 'pa_next_version') version.push({ generation: token(r.k), state: r.parent, ready: r.n });
    });
    return { length: (rows || []).length, sections: counts, requests: requests, version: version };
  }
  function state() {
    var s = window.__paNext; if (!s) return null;
    var out = { generation: token(s.generation), seq: s.seq, ageMs: Date.now() - s.started,
      visibleBand: s.visibleBand, viewportMinimum: s.viewportMinimum, panelMinimum: s.panelMinimum, layout: s.layout,
      received: s.received, mounted: s.mounted, serial: s.serial,
      errors: Object.keys(s.error || {}), commandErrors: Object.keys(s.commandError || {}),
      masks: maskSources(s.masks), desired: maskSources(s.desired), queue: maskSources(s.queue),
      pending: {}, flight: {}, accepted: {}, cache: {}, issuedCounts: {}, intents: {} };
    ['head','cat','one'].forEach(function (part) {
      if (s.pending && s.pending[part]) out.pending[part] = { seq: s.pending[part].seq, mask: masks(s.pending[part].mask) };
      if (s.flight && s.flight[part]) out.flight[part] = record(s.flight[part]);
      if (s.accepted && s.accepted[part]) out.accepted[part] = { record: record(s.accepted[part]), rows: rowSummary(s.accepted[part].rows) };
      out.cache[part] = (s.cache && s.cache[part] || []).map(record);
      out.issuedCounts[part] = Object.keys(s.issued && s.issued[part] || {}).length;
    });
    Object.keys(s.intent || {}).forEach(function (k) { var x = s.intent[k]; out.intents[k] = { part:x.part, columns:x.cols, key:token(x.key), mask:masks(x.mask) }; });
    out.preview = s.preview ? { id: token(s.preview.id), key: token(s.preview.key), grain: s.preview.grain } : null;
    return out;
  }
  function ancestors(node) {
    var out = []; for (var i = 0; node && i < 18; i++, node = node.parentElement) out.push(element(node)); return out;
  }
  function frames() {
    return limit(document.querySelectorAll('iframe'), 30).map(function (node) {
      var owner = node.closest('.dashboard-component-chart-holder'), out = element(node);
      out.owner = label(owner); out.sandbox = node.getAttribute('sandbox'); out.hasSrcdoc = node.hasAttribute('srcdoc');
      out.sourceKind = node.hasAttribute('srcdoc') ? 'srcdoc' : (/^about:/.test(node.src) ? 'about' : 'url');
      try { out.sameOriginDOM = !!node.contentDocument; out.containsReport = !!(node.contentWindow && node.contentWindow.__paNext); }
      catch (ignore) { out.sameOriginDOM = false; out.containsReport = 'opaque'; }
      return out;
    });
  }
  function cssRules() {
    var found = [], external = [], inaccessible = 0, externalNodes = [];
    if (scope === 'board') {
      ['header','nav','app'].forEach(function (key) {
        var node = document.querySelector(boardSelectors[key]);
        for (var i = 0; node && i < 24; i++, node = node.parentElement) {
          if (externalNodes.indexOf(node) < 0) externalNodes.push(node);
        }
      });
    }
    function walk(rules) {
      limit(rules, 10000).forEach(function (rule) {
        if (found.length >= 180 && external.length >= 120) return;
        if (rule.selectorText && external.length < 120) {
          var matched = [];
          externalNodes.forEach(function (node) {
            try { if (node.matches(rule.selectorText)) matched.push(label(node)); } catch (ignore) { /* pseudo-element or browser-specific selector */ }
          });
          if (matched.length) external.push({ selector: rule.selectorText.slice(0,700), matches: matched, declarations: styles(rule.style) });
        }
        if (rule.selectorText && found.length < 180 && /pa-next|pone-(?:root|top|panel|dyn|pend)|phead-(?:root|strip)|dashboard-chart-id-85956[234]/.test(rule.selectorText)) {
          found.push({ selector: rule.selectorText.slice(0,700), declarations: styles(rule.style) });
        } else if (rule.cssRules) walk(rule.cssRules);
      });
    }
    limit(document.styleSheets, 100).forEach(function (sheet) { try { walk(sheet.cssRules); } catch (ignore) { inaccessible++; } });
    return { layoutRules: found, externalLayoutRules: external, inaccessibleStylesheets: inaccessible };
  }
  function resources() {
    return performance.getEntriesByType('resource').filter(function (r) { return /chart\/data|explore_json|query|react_sanbbox|echartsSandbox/i.test(r.name); }).slice(-40).map(function (r) {
      return { category: /chart\/data/.test(r.name) ? 'chart/data' : (/explore_json/.test(r.name) ? 'explore_json' : 'chart-resource'),
        initiator: r.initiatorType, startMs: round(r.startTime), durationMs: round(r.duration), transferSize: r.transferSize,
        encodedBodySize: r.encodedBodySize, responseStatus: r.responseStatus };
    });
  }
  function snapshot() {
    var out = { t: ms(), viewport: viewport(), elements: {}, state: state(), iframes: frames() };
    Object.keys(selectors).forEach(function (k) { out.elements[k] = element(document.querySelector(selectors[k])); });
    out.mainAncestors = ancestors(document.querySelector(scope === 'report' ? '.pa-next-shell' : '.dashboard-chart-id-859562 iframe'));
    if (scope === 'board') {
      var header = document.querySelector(boardSelectors.header), nav = document.querySelector(boardSelectors.nav);
      out.headerAncestors = ancestors(header);
      out.navAncestors = ancestors(nav);
      out.headerWrapper = element(header && header.parentElement);
      out.appAncestors = ancestors(document.querySelector(boardSelectors.app));
    }
    out.gridChildren = limit(document.querySelectorAll('.pa-next-content > *'), 12).map(element);
    out.dynamicHeaders = limit(document.querySelectorAll('.pone-dynhead,.pone-dynov,.pone-tbl-note'), 12).map(element);
    out.svgs = limit(document.querySelectorAll('svg[data-dyn-svg]'), 4).map(function (svg) {
      var r = element(svg); r.viewBox = svg.getAttribute('viewBox'); return r;
    });
    out.css = cssRules(); out.completedResources = resources(); return out;
  }
  function sample(reason, force) {
    if (stopped) return;
    var s = window.__paNext, item = { viewport: { w:innerWidth, h:innerHeight, x:round(scrollX), y:round(scrollY) }, nodes: {} };
    Object.keys(selectors).forEach(function (k) { if (!/^(html|body|headRoot|strip|kpis|filterRow)$/.test(k)) item.nodes[k] = rect(document.querySelector(selectors[k])); });
    item.svgs = limit(document.querySelectorAll('svg[data-dyn-svg]'), 2).map(rect);
    if (s) item.flow = { seq:s.seq, preview:!!s.preview, flight:Object.keys(s.flight || {}), queued:Object.keys(s.queue || {}),
      serial:s.serial, band:s.visibleBand, cat:document.querySelector('.pa-next-cat') && document.querySelector('.pa-next-cat').getAttribute('data-pa-next-state'),
      one:document.querySelector('.pa-next-one') && document.querySelector('.pa-next-one').getAttribute('data-pa-next-state') };
    var signature = JSON.stringify(item), now = ms();
    if (!force && signature === lastSignature && now - lastTime < 1000) return;
    lastSignature = signature; lastTime = now; item.t = now; item.reason = reason;
    // JSON roundtrip prevents later app mutations changing historical samples.
    samples.push(JSON.parse(JSON.stringify(item))); if (samples.length > 650) samples.shift();
  }
  function event(kind, data) {
    events.push({ t:ms(), kind:kind, data:data }); if (events.length > 400) events.shift();
  }
  function raf() { frameId = null; sample('animation-frame'); if (--burst > 0 && !stopped) frameId = requestAnimationFrame(raf); }
  function wake() { burst = 24; if (frameId === null && !stopped) frameId = requestAnimationFrame(raf); }
  function onClick(e) { event('click', { target:label(e.target), shift:e.shiftKey, ctrl:e.ctrlKey }); sample('click-before', true); wake(); }
  function onResize() { event('resize', viewport()); sample('resize', true); wake(); }
  function onScroll(e) { sample('scroll'); }
  function onError(e) { event('javascript-error', { type:e.type, line:e.lineno, column:e.colno, name:e.error && e.error.name }); }
  function onMessage(e) {
    var d = e.data; if (!d || typeof d !== 'object' || typeof d.type !== 'string' || !/^PA_NEXT_/.test(d.type)) return;
    var item = { type:d.type, kind:d.kind, part:d.part, source:d.src, seq:d.seq, serial:d.serial, instance:token(d.instance) };
    if (Array.isArray(d.mask)) item.mask = masks(d.mask);
    if (Array.isArray(d.nextMask)) item.mask = masks(d.nextMask);
    if (Array.isArray(d.rows)) item.rows = rowSummary(d.rows);
    if (d.key) item.key = token(d.key);
    event('protocol', item); wake();
  }
  var listeners = [['click',onClick],['resize',onResize],['scroll',onScroll],['error',onError],['message',onMessage]];
  listeners.forEach(function (x) { window.addEventListener(x[0],x[1],true); });
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(function () { sample('resize-observer'); wake(); });
    var observe = scope === 'report' ? '.pa-next-shell,.pa-next-content,.pa-next-one,.pone-panel-b' : '.dashboard-header-container,.dashboard-chart-id-859562,iframe';
    limit(document.querySelectorAll(observe), 12).forEach(function (node) { observer.observe(node); });
  }
  var initial = JSON.parse(JSON.stringify(snapshot())); sample('start', true);
  function stop() {
    if (stopped) return;
    sample('finish', true); final = snapshot(); stopped = true;
    clearInterval(timer); clearTimeout(expiry); if (frameId !== null) cancelAnimationFrame(frameId);
    if (observer) observer.disconnect(); listeners.forEach(function (x) { window.removeEventListener(x[0],x[1],true); });
  }
  function finish() {
    stop();
    return JSON.stringify({ format:'pa-next-browser-diagnostics-v1', scope:scope, started:started,
      durationMs:ms(), browser:navigator.userAgent, language:navigator.language,
      privacy:'No cookies, storage, DOM text, input values, SQL, metric rows or network bodies. Filter values replaced by local opaque labels.',
      initial:initial, final:final, samples:samples, events:events }, null, 2);
  }
  window.__paNextDebug = { scope:scope, stop:stop, finish:finish };
  timer = setInterval(function () { sample('poll'); }, 150);
  expiry = setTimeout(function () { stop(); console.info('pa_next: запись завершена. copy(__paNextDebug.finish())'); }, 90000);
  console.info('pa_next: диагностика запущена; контекст=' + scope + '. Закрой DevTools, воспроизведи ошибку; затем copy(__paNextDebug.finish()). Автостоп через 90 секунд.');
  if (scope === 'wrong-context') console.warn('Это не основной чарт. Выбери iframe, где Boolean(window.__paNext) === true.');
  return { scope:scope, recording:true, exportCommand:'copy(__paNextDebug.finish())' };
})();
