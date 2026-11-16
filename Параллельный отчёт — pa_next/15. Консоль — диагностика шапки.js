/* Запускать целиком в DevTools → Console → top на открытом дашборде.
   Затем нажать проблемные ссылки/верхний край и выполнить:
   __paHeaderDiag.save()                  — скачать JSON
   copy(__paHeaderDiag.finish())          — запасной вариант, скопировать JSON
   Не вставлять в JS чарта. Скрипт не меняет CSS, DOM, фильтры или URL,
   не делает запросов, не читает cookies/storage/данные таблиц/поля ввода.
   Слушатели останавливаются после finish/save или через 10 минут. */
(function () {
  'use strict';
  if (window.__paHeaderDiag && window.__paHeaderDiag.stop) window.__paHeaderDiag.stop();
  var started = performance.now(), events = [], samples = [], errors = [], timers = [];
  var stopped = false, finalText = null, expiry;
  var holder = '.dashboard-component-chart-holder.dashboard-chart-id-859562';
  var sameWindow = ':is(:not([target]),[target="_self"])';
  var legacy = 'a[href$="#chart-id-859562"]' + sameWindow;
  var modern = 'a[href$="#app"][title="Открыть шапку дашборда"]' + sameWindow;
  var opener = ':is(' + legacy + ',' + modern + ')';
  var closer = 'a[href$="#pa-next-header-closed-859562"]' + sameWindow;
  var installed = 'body:has(' + holder + '):has(' + opener + '):has(' + closer + '):not(.dashboard--editing):not(:has(.dashboard--editing))';
  var enabled = installed + ':is(:has(' + legacy + '):has(#chart-id-859562),:has(' + modern + '):has(#app))';
  var opened = enabled + ':is(:has(.dashboard-header-container:focus-within),:has(.dashboard-header-container .ant-dropdown-open),:has(.dashboard-header-container [aria-expanded="true"]),:has(#chart-id-859562:target),:has(' + modern + '):has(#app:target))';
  var checks = { holder: holder, legacyOpener: legacy, appOpener: modern, close: closer,
    installed: installed, enabled: enabled, opened: opened, nativeHeader: '.dashboard-header-container',
    app: '#app', legacyTarget: '#chart-id-859562', editMode: '.dashboard--editing' };
  var properties = ['display','visibility','opacity','position','top','right','bottom','left','width','min-width','max-width',
    'height','min-height','max-height','margin','padding','overflow','overflow-x','overflow-y','transform','clip-path',
    'z-index','pointer-events','font-size','line-height','contain','content-visibility','zoom','--pa-next-nav-height','--pa-next-board-header-height'];
  function ms() { return Math.round(performance.now() - started); }
  function limit(list, n) { return Array.prototype.slice.call(list || [], 0, n); }
  function label(node) {
    if (!node || node.nodeType !== 1) return null;
    var id = /^(app|root|main-menu|chart-id-\d+|pa-next-[\w-]+)$/.test(node.id) ? '#' + node.id : (node.id ? '#[other-id]' : '');
    return node.tagName.toLowerCase() + id + limit(node.classList, 12).map(function (c) { return '.' + c; }).join('');
  }
  function safeHash(hash) {
    return /^(#(?:app|chart-id-\d+|pa-next-header-closed-\d+))?$/.test(hash) ? hash : '[other fragment]';
  }
  function urlInfo(value) {
    try {
      var u = new URL(value, document.baseURI);
      return { hash: safeHash(u.hash), sameOrigin: u.origin === location.origin,
        sameDocument: u.origin === location.origin && u.pathname === location.pathname && u.search === location.search };
    } catch (e) { return { invalid: true }; }
  }
  function matches(node, selector) {
    try { return node ? node.matches(selector) : false; } catch (e) { return 'ERROR: ' + e.name; }
  }
  function count(selector) {
    try { return document.querySelectorAll(selector).length; } catch (e) { return 'ERROR: ' + e.name; }
  }
  function styles(style) {
    var out = {};
    properties.forEach(function (p) { var v = style.getPropertyValue(p), priority = style.getPropertyPriority(p); if (v) out[p] = v + (priority ? ' !' + priority : ''); });
    return out;
  }
  function box(node) {
    if (!node || node.nodeType !== 1) return null;
    var r = node.getBoundingClientRect(), s = getComputedStyle(node);
    return { node: label(node), rect: { x:r.x, y:r.y, width:r.width, height:r.height, bottom:r.bottom, right:r.right },
      scroll: { top:node.scrollTop, left:node.scrollLeft, width:node.scrollWidth, height:node.scrollHeight },
      style:styles(s), inline:styles(node.style), focused:node === document.activeElement,
      focusWithin:matches(node, ':focus-within'), target:matches(node, ':target'),
      inert:!!node.inert, children:node.children.length };
  }
  function ancestors(node) {
    var list = [];
    for (var i = 0; node && i < 16; i++, node = node.parentElement) list.push(box(node));
    return list;
  }
  function controlKind(node) {
    if (!node || !node.matches('a')) return null;
    var href = node.getAttribute('href') || '', text = (node.textContent || '').trim();
    if (/pa-next-header-closed-/.test(href) || /Закрыть шапку/.test(text)) return 'close';
    if (/#chart-id-859562$/.test(href) || (/#app$/.test(href) && /шапку/.test(text + node.title)) || /Открыть шапку/.test(text)) return 'open';
    return null;
  }
  function controls() { return limit(document.querySelectorAll('a'), 12000).filter(controlKind).slice(0, 20); }
  function linkInfo(node) {
    var raw = node.getAttribute('href') || '', out = box(node);
    out.kind = controlKind(node); out.destination = urlInfo(raw);
    out.rawHashOnly = raw.charAt(0) === '#';
    out.targetAttribute = node.getAttribute('target');
    out.expectedTitle = node.title === 'Открыть шапку дашборда';
    out.expectedLabel = /^(Открыть|Закрыть) шапку дашборда$/.test((node.textContent || '').trim());
    out.matchesLegacy = matches(node, legacy); out.matchesApp = matches(node, modern); out.matchesClose = matches(node, closer);
    var hash = out.destination.hash;
    out.targetExists = hash && hash.charAt(0) === '#' ? !!document.getElementById(hash.slice(1)) : false;
    out.ancestors = ancestors(node);
    return out;
  }
  function hits() {
    var result = [], nav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pa-next-nav-height')) || 48;
    [2, nav + 2, nav + 7, nav + 20, nav + 64].forEach(function (y) {
      [8, Math.round(innerWidth / 2), Math.max(0, innerWidth - 8)].forEach(function (x) {
        result.push({ x:x, y:y, stack:document.elementsFromPoint(x,y).slice(0,8).map(label) });
      });
    });
    return result;
  }
  function css(nodes) {
    var found = [], matchedRules = [], sheets = [], scanned = 0, truncated = false;
    var allSheets = Array.prototype.slice.call(document.styleSheets);
    var droppedHeaderRules = 0, droppedLayoutRules = 0;
    function walk(rules, context, sheetIndex) {
      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i]; scanned++;
        if (scanned > 200000) { truncated = true; return; }
        if (rule.selectorText) {
          var relevant = /pa-next-header-closed|Открыть шапку|#app.*:target|dashboard-header-container/.test(rule.selectorText);
          var matched = [];
          nodes.forEach(function (n) { if (matches(n,rule.selectorText) === true) matched.push(label(n)); });
          if (relevant || (matched.length && properties.some(function (p) { return !!rule.style.getPropertyValue(p); }))) {
            if (relevant ? found.length < 500 : matchedRules.length < 250) {
              (relevant ? found : matchedRules).push({ sheet:sheetIndex, selector:rule.selectorText, context:context, matches:matched, declarations:styles(rule.style) });
            } else if (relevant) droppedHeaderRules++; else droppedLayoutRules++;
          }
        }
        try {
          if (rule.cssRules) {
            var group = { kind:rule.constructor.name, condition:rule.conditionText || rule.media && rule.media.mediaText || '' };
            if (group.kind === 'CSSSupportsRule') { try { group.active = CSS.supports(group.condition); } catch (e) { group.active = 'unknown'; } }
            if (group.kind === 'CSSMediaRule') group.active = matchMedia(group.condition).matches;
            if (group.kind === 'CSSScopeRule') { group.start = rule.start || null; group.end = rule.end || null; }
            walk(rule.cssRules, context.concat([group]), sheetIndex);
          } else if (rule.styleSheet) { walk(rule.styleSheet.cssRules, context.concat([{kind:'import'}]),sheetIndex); }
        } catch (e) { errors.push({ kind:'css-group', name:e.name }); }
      }
    }
    // Emotion/the Proteus fork may insert the dashboard CSS after hundreds of
    // component styles. Never silently sample only the first N stylesheets.
    allSheets.forEach(function (sheet, i) {
      var entry = { index:i, disabled:sheet.disabled, media:sheet.media.mediaText, owner:label(sheet.ownerNode), external:!!sheet.href };
      if (sheet.ownerNode && sheet.ownerNode.tagName === 'STYLE') {
        var text = sheet.ownerNode.textContent || '';
        entry.bytes = text.length;
        entry.v2Marker = text.indexOf('Optional native-header control v2') >= 0;
        var version = /Optional native-header control v(\d+)/.exec(text);
        entry.headerControlVersion = version ? Number(version[1]) : null;
        entry.anyMarker = text.indexOf('Optional native-header control') >= 0;
        entry.hasCloseSelector = text.indexOf('pa-next-header-closed') >= 0;
      }
      try { entry.ruleCount = sheet.cssRules.length; walk(sheet.cssRules, [], i); }
      catch (e) { entry.inaccessible = e.name; }
      sheets.push(entry);
    });
    return { stylesheets:sheets, stylesheetsTotal:allSheets.length, stylesheetsProcessed:sheets.length,
      headerRules:found, matchedLayoutRules:matchedRules, scanned:scanned, truncated:truncated,
      matchesMeaning:'Element.matches only; does not evaluate @scope context or the CSS cascade. Use computed style and scope boundaries.',
      droppedHeaderRules:droppedHeaderRules, droppedLayoutRules:droppedLayoutRules };
  }
  function snapshot(reason, includeCSS) {
    var links = controls(), header = document.querySelector('.dashboard-header-container');
    var out = { reason:reason, t:ms(), hash:safeHash(location.hash), target:label(document.querySelector(':target')),
      active:label(document.activeElement), viewport:{ width:innerWidth, height:innerHeight, dpr:devicePixelRatio, x:scrollX, y:scrollY },
      selectorCounts:{}, links:links.map(linkInfo), headers:limit(document.querySelectorAll('.dashboard-header-container'),10).map(box),
      headerAncestors:ancestors(header), body:box(document.body), root:box(document.documentElement),
      grid:box(document.querySelector('.grid-container')), holder:box(document.querySelector(holder)),
      boardScroller:box(document.querySelector('.board-scroller')), navigation:limit(document.querySelectorAll('nav,[role="navigation"],#main-menu'),8).map(box),
      frames:limit(document.querySelectorAll('iframe'),30).map(function (frame) { return { node:label(frame), owner:label(frame.closest('.dashboard-component-chart-holder')), sandbox:frame.getAttribute('sandbox'), srcdoc:frame.hasAttribute('srcdoc') }; }),
      hitTests:hits(), base:{ present:!!document.querySelector('base'), target:document.querySelector('base') && document.querySelector('base').getAttribute('target'), resolved:urlInfo(document.baseURI) },
      headerCandidates:limit(document.querySelectorAll('header,[role="banner"],[class*="dashboard-header"],[class*="dashboardHeader"],[class*="DashboardHeader"]'),30).map(box),
      chartHolders:limit(document.querySelectorAll('.dashboard-component-chart-holder,[class*="dashboard-chart-id-"]'),30).map(label) };
    Object.keys(checks).forEach(function (k) { out.selectorCounts[k] = count(checks[k]); });
    if (includeCSS) {
      var nodes = [], seeds = links.concat(header ? [header] : []);
      seeds.forEach(function (n) { for (var i = 0; n && i < 12; i++, n = n.parentElement) if (nodes.indexOf(n) < 0) nodes.push(n); });
      out.css = css(nodes);
      out.controlsDOM = links.map(function (node) {
        var root = node.closest('.dragdroppable-row') || node.closest('.dashboard-component-chart-holder') || node.parentElement;
        var budget = 120;
        function tree(n, depth) {
          if (!n || budget-- <= 0 || depth > 10) return null;
          return { node:label(n), control:controlKind(n), children:limit(n.children,20).map(function (c) { return tree(c,depth+1); }) };
        }
        return tree(root,0);
      });
    }
    return out;
  }
  function eventData(e) {
    var n = e.target && e.target.nodeType === 1 ? e.target : e.target && e.target.parentElement;
    var a = n && n.closest('a');
    return { kind:e.type, t:ms(), target:label(n), control:controlKind(a), destination:a && controlKind(a) ? urlInfo(a.getAttribute('href')) : null,
      defaultPrevented:e.defaultPrevented, trusted:e.isTrusted, x:e.clientX, y:e.clientY, hash:safeHash(location.hash) };
  }
  function sample(reason) {
    if (stopped || samples.length >= 45) return;
    try { samples.push(snapshot(reason,false)); } catch (e) { errors.push({ kind:'snapshot', name:e.name }); }
  }
  function listener(e) {
    if (stopped || events.length >= 100) return;
    var n = e.target && e.target.nodeType === 1 ? e.target : null;
    var relevant = e.type === 'hashchange' || (n && (controlKind(n.closest('a')) || n.closest('.dashboard-header-container'))) || (e.type === 'click' && e.clientY < 130);
    if (!relevant) return;
    var record = eventData(e); events.push(record);
    if (e.type === 'click' || e.type === 'hashchange') {
      sample(e.type + '-capture');
      [0,350,1200].forEach(function (delay) { timers.push(setTimeout(function () { record.defaultPreventedAfterDispatch = e.defaultPrevented; sample(e.type + '+' + delay); },delay)); });
    }
  }
  var report = { version:'pa-next-header-diag-2', started:new Date().toISOString(),
    context:window === window.top ? 'top' : 'iframe-wrong-context', browser:navigator.userAgent,
    support:{ has:CSS.supports('selector(:has(*))'), focusWithin:CSS.supports('selector(:focus-within)'), clipPath:CSS.supports('clip-path','inset(100% 0 0 0)') },
    selectors:checks, events:events, samples:samples, errors:errors, initial:snapshot('initial',true) };
  ['click','pointerdown','pointerup','focusin'].forEach(function (type) { document.addEventListener(type,listener,true); });
  window.addEventListener('hashchange',listener,true);
  function stop() {
    stopped = true; clearTimeout(expiry); timers.forEach(clearTimeout);
    ['click','pointerdown','pointerup','focusin'].forEach(function (type) { document.removeEventListener(type,listener,true); });
    window.removeEventListener('hashchange',listener,true);
  }
  function finish() {
    if (!finalText) { report.final = snapshot('final',true); report.durationMs = ms(); stop(); finalText = JSON.stringify(report,null,2); }
    return finalText;
  }
  window.__paHeaderDiag = { stop:stop, finish:finish, sample:function () { sample('manual'); return samples.length; },
    save:function () {
      var text = finish(), blob = new Blob([text],{type:'application/json'}), url = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = url; a.download = 'pa-next-header-diagnostic.json'; a.click();
      setTimeout(function () { URL.revokeObjectURL(url); },1000);
      return 'Диагностика сохранена: pa-next-header-diagnostic.json';
    } };
  expiry = setTimeout(stop,10*60*1000);
  console.log(report.context === 'top'
    ? 'Запись шапки включена. Нажмите проблемные ссылки или верхний край 2–3 раза, затем __paHeaderDiag.save(). Не обновляйте страницу до сохранения.'
    : 'Выбран iframe. Переключите контекст консоли на top и запустите этот же скрипт там.');
  return { context:report.context, controls:report.initial.links.length, headers:report.initial.headers.length, save:'__paHeaderDiag.save()' };
})();
