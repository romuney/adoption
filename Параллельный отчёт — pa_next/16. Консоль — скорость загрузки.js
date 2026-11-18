/* Run in DevTools Console, context top, after opening the board.
   Keep the page open, force-refresh charts using the board menu, then interact.
   Export: copy(await __paNextPerf.finish())
   No SQL, response bodies, filter values, cookies or storage are exported.
   This observes existing requests; it never starts chart/data queries. */
(function () {
  'use strict';
  if (window.__paNextPerf && window.__paNextPerf.stop) window.__paNextPerf.stop();
  var started = new Date().toISOString(), token = 'perf-' + Date.now(), stopped = false;
  var requests = [], frames = [], tasks = [], replies = [], sequence = 0, observers = [], longTasksSupported = false;
  var originalFetch = window.fetch, xp = window.XMLHttpRequest && XMLHttpRequest.prototype;
  var originalOpen = xp && xp.open, originalSend = xp && xp.send, xhrMeta = new WeakMap();
  var ids = [859562, 859563, 859564], poll = null, expiry = null, finishTimer = null;
  function now() { return Math.round(performance.now() * 10) / 10; }
  function family(value) {
    var path;
    try { path = new URL(String(value), location.href).pathname; } catch (ignore) { return null; }
    if (/\/chart\/data(?:\/|$)/.test(path)) return /\/chart\/data\/?$/.test(path) ? 'chart-data' : 'chart-result';
    if (/async_event|async\/|\/events\/?$/.test(path)) return 'async-events';
    if (/\/superset\/explore_json/.test(path)) return 'explore-json';
    return null;
  }
  function chart(body, url) {
    var text = typeof body === 'string' ? body : '';
    var match = /"slice_id"\s*:\s*"?(\d+)/.exec(text) || /(?:slice_id|chart_id)=(\d+)/.exec(String(url));
    return match ? Number(match[1]) : null;
  }
  function begin(url, body, transport) {
    var type = family(url); if (!type) return null;
    var item = { id: ++sequence, family: type, chart: chart(body, url), transport: transport, start: now() };
    requests.push(item); if (requests.length > 400) requests.shift(); return item;
  }
  function resource(item) {
    return { family: family(item.name) || (item.initiatorType === 'script' ? 'script' : item.initiatorType === 'link' ? 'style-or-link' : null),
      start: Math.round(item.startTime * 10) / 10, duration: Math.round(item.duration * 10) / 10,
      requestStart: Math.round(item.requestStart * 10) / 10, responseStart: Math.round(item.responseStart * 10) / 10,
      responseEnd: Math.round(item.responseEnd * 10) / 10, transferBytes: item.transferSize,
      encodedBytes: item.encodedBodySize, decodedBytes: item.decodedBodySize };
  }
  var wrappedFetch = function (input, init) {
    var url = typeof input === 'string' || input instanceof URL ? String(input) : input && input.url;
    var item = begin(url, init && init.body, 'fetch'), promise;
    try { promise = originalFetch.apply(this, arguments); }
    catch (error) { if (item) item.failed = now(); throw error; }
    if (item) promise.then(function (response) { item.headersAt = now(); item.status = response.status; }, function () { item.failed = now(); });
    // Preserve the platform's original Promise and response consumption path.
    return promise;
  };
  var wrappedOpen = function (method, url) {
    xhrMeta.set(this, { url: String(url) }); return originalOpen.apply(this, arguments);
  };
  var wrappedSend = function (body) {
    var meta = xhrMeta.get(this), item = meta && begin(meta.url, body, 'xhr'), xhr = this;
    if (item) this.addEventListener('loadend', function () { item.end = now(); item.status = xhr.status; }, { once: true });
    try { return originalSend.apply(this, arguments); }
    catch (error) { if (item) item.failed = now(); throw error; }
  };
  if (originalFetch) window.fetch = wrappedFetch;
  if (xp) { xp.open = wrappedOpen; xp.send = wrappedSend; }
  function sample() {
    var state = ids.map(function (id) {
      var holder = document.querySelector('.dashboard-component-chart-holder.dashboard-chart-id-' + id);
      if (!holder) return { chart: id, present: false };
      var rect = holder.getBoundingClientRect(), iframe = holder.querySelector('iframe');
      return { chart: id, present: true, iframe: !!iframe, iframeLazy: iframe ? iframe.loading : null,
        top: Math.round(rect.top), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height),
        inViewport: rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth,
        loading: !!holder.querySelector('img.loading,[data-test="loading-indicator"],[aria-label="Loading"]'),
        error: !!holder.querySelector('[role="alert"],.alert,.error-container') };
    });
    if (!frames.length || JSON.stringify(frames[frames.length - 1].state) !== JSON.stringify(state)) {
      frames.push({ at: now(), state: state }); if (frames.length > 180) frames.shift();
    }
  }
  try {
    if (!window.PerformanceObserver || !PerformanceObserver.supportedEntryTypes || PerformanceObserver.supportedEntryTypes.indexOf('longtask') < 0) throw new Error('Long tasks unsupported');
    var po = new PerformanceObserver(function (list) { list.getEntries().forEach(function (e) {
      tasks.push({ start: Math.round(e.startTime), duration: Math.round(e.duration) }); if (tasks.length > 160) tasks.shift();
    }); });
    po.observe({ type: 'longtask', buffered: true }); observers.push(po); longTasksSupported = true;
  } catch (ignore) { /* Unsupported browser: absent is not zero. */ }
  function onMessage(event) {
    var data = event.data;
    if (!data || data.type !== 'PA_NEXT_PERF_REPLY_V1' || data.token !== token || data.chart !== ids[0]) return;
    // Main sends a bounded allowlist, never its raw state or masks.
    replies.push(data.snapshot); if (replies.length > 3) replies.shift();
  }
  window.addEventListener('message', onMessage);
  function ask() {
    try { (function walk(w, depth) {
      if (depth > 5) return;
      for (var i = 0; i < w.frames.length; i++) {
        var f = w.frames[i];
        try { f.postMessage({ type: 'PA_NEXT_PERF_REQUEST_V1', to: ids[0], token: token }, '*'); } catch (ignore) { /* Detached frame. */ }
        try { walk(f, depth + 1); } catch (ignore) { /* Opaque sandbox. */ }
      }
    })(window.top, 0); } catch (ignore) { /* Context unavailable. */ }
  }
  function snapshot() {
    var nav = performance.getEntriesByType('navigation')[0];
    return { format: 'pa-next-load-performance-v1', started: started, finished: new Date().toISOString(),
      browser: navigator.userAgent, longTasksSupported: longTasksSupported,
      scope: window === window.top ? 'board' : 'iframe', epoch: performance.timeOrigin || Date.now() - performance.now(), viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      privacy: 'No request/response bodies, SQL, filter values, URLs, cookies, storage or metric values.',
      limitations: 'Single session, not RUM. Historical resources may be evicted. Fetch headersAt is not body completion; use ResourceTiming responseEnd. Zero bytes can mean unavailable timing. Reinstall after page navigation.',
      navigation: nav ? { type: nav.type, responseStart: nav.responseStart, responseEnd: nav.responseEnd, domContentLoaded: nav.domContentLoadedEventEnd, load: nav.loadEventEnd } : null,
      resources: performance.getEntriesByType('resource').map(resource).filter(function (r) { return r.family; }).slice(-400),
      requests: requests, chartSlots: frames, longTasks: tasks, report: replies,
      localReport: window.__paNext && window.__paNext.performance || null };
  }
  function stop() {
    if (stopped) return; stopped = true;
    clearInterval(poll); clearTimeout(expiry);
    observers.forEach(function (o) { o.disconnect(); });
    if (window.fetch === wrappedFetch) window.fetch = originalFetch;
    if (xp && xp.open === wrappedOpen) xp.open = originalOpen;
    if (xp && xp.send === wrappedSend) xp.send = originalSend;
    window.removeEventListener('message', onMessage);
  }
  window.__paNextPerf = { stop: stop, snapshot: snapshot, finish: function () {
    if (finishTimer) return Promise.resolve(JSON.stringify(snapshot(), null, 2));
    sample(); ask();
    return new Promise(function (resolve) { finishTimer = setTimeout(function () { stop(); resolve(JSON.stringify(snapshot(), null, 2)); }, 350); });
  } };
  sample(); ask(); poll = setInterval(sample, 250); expiry = setTimeout(stop, 300000);
  console.info('PA NEXT: сбор времени включён на 5 минут. Не перезагружай страницу; обнови чарты штатным меню. Экспорт: copy(await __paNextPerf.finish())');
})();
