(function () {
  var C = __CONFIG__, V = 1, ST = window.__paNext || (window.__paNext = {
    session: String(Date.now()) + '-' + String(Math.random()).slice(2), peers: {}, masks: { head: [], cat: [], one: [] },
    pending: {}, seq: 0, accepted: {}, serial: {}, instances: {}, retired: { cat: {}, one: {} }, error: {}, mounted: {}, started: Date.now()
  });
  if (ST.on) window.removeEventListener('message', ST.on);
  if (ST.timer) clearInterval(ST.timer);
  ST.apply = typeof applyCrossFilter === 'function' ? applyCrossFilter : null;
  var hosts = document.querySelectorAll('[_echarts_instance_]'), host = hosts.length ? hosts[hosts.length - 1] : null;
  if (!host) return;
  var shell = host.querySelector('.pa-next-shell');
  if (!shell) {
    Array.prototype.forEach.call(host.querySelectorAll('canvas'), function (c) { c.style.display = 'none'; });
    host.style.position = 'relative';
    shell = document.createElement('div'); shell.className = 'pa-next-shell';
    shell.innerHTML = '<style>__SHELL_CSS__</style>' +
      '<div class="pa-next-status" role="status" aria-live="polite"></div>' +
      '<div class="pa-next-head" data-pa-next-host="head" aria-label="Настройки отчёта"></div>' +
      '<div class="pa-next-content"><section class="pa-next-cat" data-pa-next-host="cat" aria-label="Каталог отчётов"></section>' +
      '<section class="pa-next-one" data-pa-next-host="one" aria-label="Показатели выбранной области"></section></div>';
    host.appendChild(shell); ST.mounted = {};
  }
  ST.shell = shell;
  ST.intent = ST.intent || {};
  ST.desired = ST.desired || { head: [], cat: [], one: [] };
  ST.queue = ST.queue || {}; ST.flight = ST.flight || {};
  ST.issued = ST.issued || { cat: {}, one: {} }; ST.received = ST.received || {};
  ST.cache = ST.cache || { cat: [], one: [] };
  ST.commandError = ST.commandError || {};
  if (ST.statusTick) cancelAnimationFrame(ST.statusTick);
  if (ST.interaction) ST.interaction.destroy();
  __INTERACTION__
  ST.interaction = installInteraction(shell, ST);
  if (ST.viewport) ST.viewport.destroy();
  __VIEWPORT__
  ST.viewport = installViewport(shell, ST);
  if (ST.keyboard) shell.removeEventListener('keydown', ST.keyboard);
  ST.keyboard = function (ev) {
    var node = ev.target;
    if (!node || node.getAttribute('role') !== 'button' || /^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(node.tagName) || (ev.keyCode !== 13 && ev.keyCode !== 32)) return;
    ev.preventDefault();
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: ev.shiftKey, ctrlKey: ev.ctrlKey, metaKey: ev.metaKey }));
  };
  shell.addEventListener('keydown', ST.keyboard);
  // A long chart iframe can extend below the visible browser viewport. Track the
  // visible band using cross-origin-safe IntersectionObserver, never parent DOM.
  if (ST.tipObserver) ST.tipObserver.disconnect();
  if (ST.viewportObserver) ST.viewportObserver.disconnect();
  (ST.viewportProbes || []).forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
  if (ST.viewportResize) window.removeEventListener('resize', ST.viewportResize);
  ST.visibleBand = { top: 0, bottom: Math.min(window.innerHeight, window.screen.availHeight || 700) };
  function clampTips() {
    var band = ST.visibleBand;
    Array.prototype.forEach.call(document.querySelectorAll('body > .phead-tip,body > .prb-tip,body > .pone-tip'), function (tip) {
      if (!tip.offsetWidth || !tip.offsetHeight) return;
      var maxHeight = Math.max(80, band.bottom - band.top - 16);
      var mh = maxHeight + 'px';
      if (tip.style.maxHeight !== mh) { tip.style.maxHeight = mh; tip.style.overflowY = 'auto'; }
      var rect = tip.getBoundingClientRect();
      var top = Math.max(band.top + 8, Math.min(rect.top, band.bottom - rect.height - 8));
      if (Math.abs(rect.top - top) > 0.5) tip.style.top = Math.round(top) + 'px';
    });
  }
  function watchViewport() {
    if (ST.viewportObserver) ST.viewportObserver.disconnect();
    (ST.viewportProbes || []).forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
    ST.viewportProbes = [];
    if (typeof IntersectionObserver === 'undefined') return;
    var visible = {};
    ST.viewportObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { visible[entry.target.getAttribute('data-pa-next-y')] = entry.isIntersecting && entry.intersectionRatio >= 0.99; });
      var ys = Object.keys(visible).filter(function (k) { return visible[k]; }).map(Number).sort(function (a,b) { return a-b; });
      if (ys.length) ST.visibleBand = { top: ys[0], bottom: Math.min(window.innerHeight, ys[ys.length-1]+16) };
      clampTips();
    }, { threshold: 0.99 });
    for (var y=0;y<window.innerHeight;y+=16) {
      var probe = document.createElement('i');probe.setAttribute('data-pa-next-y',String(y));
      probe.style.cssText='position:fixed;left:0;top:'+y+'px;width:1px;height:'+Math.min(16,window.innerHeight-y)+'px;pointer-events:none;opacity:0';
      document.body.appendChild(probe);ST.viewportProbes.push(probe);ST.viewportObserver.observe(probe);
    }
  }
  watchViewport();ST.viewportResize=watchViewport;window.addEventListener('resize',ST.viewportResize);
  if (typeof MutationObserver !== 'undefined') {
    ST.tipObserver = new MutationObserver(clampTips);
    ST.tipObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style','class'] });
  }
  function send(part, kind, extra) {
    var peer = ST.peers[part]; if (!peer) return;
    var d = { type: 'PA_NEXT_V1', v: V, channel: C.channel, kind: kind, chart: C.main, to: C[part], session: ST.session };
    Object.keys(extra || {}).forEach(function (k) { d[k] = extra[k]; });
    try { peer.postMessage(d, '*'); } catch (ignore) { /* peer remounting */ }
  }
  function broadcastAsk() {
    try { (function walk(w, depth) {
      if (depth > 5) return;
      for (var i = 0; i < w.frames.length; i++) {
        var f = w.frames[i];
        if (f !== window) ['cat', 'one'].forEach(function (part) {
          try { f.postMessage({ type: 'PA_NEXT_V1', v: V, channel: C.channel, kind: 'ASK', chart: C.main, to: C[part], session: ST.session }, '*'); } catch (ignore) { /* detached */ }
        });
        try { walk(f, depth + 1); } catch (ignore) { /* opaque frame */ }
      }
    })(window.top, 0); } catch (ignore) { /* detached */ }
  }
  function version(rows) {
    var found = rows.filter(function (r) { return r.section === 'pa_next_version'; });
    return found.length === 1 && +found[0].n === 1 && found[0].parent === 'ready' ? String(found[0].k) : '';
  }
  function echo(part, rows) {
    var key = part === 'cat' ? 'sj' : 'flt';
    var found = rows.filter(function (r) { return r.section === key; });
    if (found.length !== 1) return null;
    try { var x = JSON.parse(String(found[0].k)); return part === 'cat' ? x.flt : x; } catch (ignore) { return null; }
  }
  // Echoes are lossy legacy SQL metadata. Never use them as a business-cache key.
  function values(a) {
    return (a || []).map(function (x) { return String(x).replace(/["\\\n\r]/g, ''); }).sort();
  }
  function rawMap(mask) {
    var o = {}; (mask || []).forEach(function (f) { if (C.echoColumns.indexOf(f.column) >= 0) o[f.column] = f.value.slice(); }); return o;
  }
  function maskMap(mask) {
    var o = {}; (mask || []).forEach(function (f) { if (f.column !== 'pa_nonce') o[f.column] = values(f.value); }); return o;
  }
  function sources(part) { return ['head', part === 'cat' ? 'one' : 'cat']; }
  function combined(part, masks) {
    var o = {}; sources(part).forEach(function (src) {
      var m = rawMap(masks[src]); Object.keys(m).forEach(function (k) { o[k] = m[k]; });
    }); return o;
  }
  function canonical(o) {
    var out = {}; C.echoColumns.forEach(function (k) { out[k] = (o[k] || []).slice(); });
    ['period_param','pub_f','act_f','exc_f'].forEach(function (k) { if (!out[k].length) out[k] = [k === 'period_param' ? 'd' : '1']; });
    if (!out.mode_param.length && !out.sel_f.length) out.mode_param = ['report'];
    return out;
  }
  function businessKey(part, masks) {
    // Exact strings/array order retained: empty labels, separators, quotes and
    // scalar first-value semantics are meaningful in the production SQL.
    return JSON.stringify([1, ST.session, ST.generation, part, canonical(combined(part, masks))]);
  }
  function sourceKey(mask) { return JSON.stringify(canonical(rawMap(mask))); }
  function requestKey(part, masks) {
    return JSON.stringify(sources(part).map(function (src) {
      var m = maskMap(masks[src]); return (m['pa_next_' + src + '_req'] || [''])[0];
    }));
  }
  function responseKey(part, rows) {
    var reqs = {}; rows.forEach(function (r) { if (r.section === 'pa_next_request') reqs[r.g] = String(r.k || ''); });
    var src = sources(part);
    return src.every(function (s) { return Object.prototype.hasOwnProperty.call(reqs, s); }) ? JSON.stringify(src.map(function (s) { return reqs[s]; })) : null;
  }
  function echoMatches(part, rows, expected) {
    var e = echo(part, rows); if (!e) return false;
    return C.echoColumns.every(function (k) { return JSON.stringify(values(e[k])) === JSON.stringify(values(expected[k])); });
  }
  function selectionKey(cols, flt) {
    var o = canonical(flt);
    return JSON.stringify(cols.slice().sort().map(function (c) { return [c, values(o[c])]; }));
  }
  function uiKey(cols, get) {
    var o = {}; C.echoColumns.forEach(function (c) { o[c] = get(c) || []; });
    return selectionKey(cols, o);
  }
  function intentFits(part, rows) {
    var e = echo(part, rows); if (!e) return false;
    return Object.keys(ST.intent).every(function (src) {
      var t = ST.intent[src]; return t.part === part || selectionKey(t.cols, e) === t.key;
    });
  }
  function current(part) {
    var x = ST.accepted[part];
    return !!(!ST.error[part] && x && x.generation === ST.generation && x.key === businessKey(part, ST.desired) && intentFits(part, x.rows));
  }
  function remember(part, entry) {
    var list = ST.cache[part].filter(function (x) { return x.key !== entry.key && x.generation === ST.generation; });
    entry.bytes = JSON.stringify(entry.rows).length * 2;
    list.push(entry);
    // Bounded to the current iframe/user session; never persisted or shared.
    var bytes = list.reduce(function (n, x) { return n + x.bytes; }, 0);
    while (list.length > 16 || (bytes > 24 * 1024 * 1024 && list.length > 1)) {
      var i = list[0].baseline && list.length > 2 ? 1 : 0;
      bytes -= list[i].bytes; list.splice(i, 1);
    }
    ST.cache[part] = list;
  }
  function restore(part) {
    var key = businessKey(part, ST.desired), list = ST.cache[part], found = null;
    for (var i = list.length - 1; i >= 0; i--) if (list[i].key === key) { found = list[i]; break; }
    if (!found || !intentFits(part, found.rows)) return false;
    if (ST.accepted[part] !== found || !ST.mounted[part] || (part === 'one' && ST.preview)) {
      ST.accepted[part] = found; render(part, found.rows);
    }
    return true;
  }
  function register(part) {
    var key = requestKey(part, ST.masks);
    var record = { request: key, key: businessKey(part, ST.masks), expected: combined(part, ST.masks), generation: ST.generation, time: Date.now() };
    ST.issued[part][key] = record;
    var keys = Object.keys(ST.issued[part]);
    while (keys.length > 40) { delete ST.issued[part][keys.shift()]; }
    return record;
  }
  function flush() {
    // A platform request cannot be superseded while it runs. Coalesce choices
    // locally, then release them on the actual matching SQL completion, not ACK.
    ['head','cat','one'].forEach(function (src) {
      var mask = ST.queue[src]; if (!mask) return;
      var targets = src === 'head' ? ['cat','one'] : [src === 'cat' ? 'one' : 'cat'];
      if (targets.some(function (p) { return ST.flight[p] || !ST.received[p] || ST.error[p]; })) return;
      if (src !== 'head' && ST.queue.head) return;
      delete ST.queue[src];
      if (sourceKey(mask) === sourceKey(ST.masks[src])) return;
      var seq = ++ST.seq;
      mask = mask.filter(function (f) { return f.column !== 'pa_next_' + src + '_req'; }).concat([
        { column: 'pa_next_' + src + '_req', operator: 'IN', value: [ST.session + '-' + seq] }
      ]);
      ST.masks[src] = mask;
      targets.forEach(function (p) { ST.flight[p] = register(p); });
      if (src === 'head') {
        if (ST.apply) ST.apply(mask);
        else ST.error.cat = ST.error.one = 'Открой отчёт на дашборде: фильтры недоступны.';
      } else {
        ST.pending[src] = { seq: seq, mask: mask }; send(src, 'COMMAND', ST.pending[src]);
      }
    });
  }
  // A preview is a verbatim row from an accepted, current catalogue response.
  // Never derive cross-report unique counts by summing already aggregated rows.
  function previewAllowed(p) {
    var cat = ST.accepted.cat, one = ST.accepted.one, t = ST.intent.cat;
    if (!p || !t || t.part !== 'cat' || !current('cat') || !one || one.generation !== ST.generation || ST.error.one) return false;
    var label = ST.previewLabel;
    if (!label || label.key !== p.key || label.id !== String(p.id) || label.name !== String(p.name || '')) return false;
    var m = maskMap(t.mask), sel = m.sel_f || [];
    if ((m.mode_param || [])[0] !== 'report' || sel.length !== 1 || sel[0] !== String(p.id) || p.key !== t.key) return false;
    if (Object.keys(m).some(function (k) { return k.indexOf('aud_') === 0 && m[k].length; })) return false;
    var pv = cat.rows.filter(function (r) { return r.section === 'pv' && String(r.g) === String(p.id); });
    var h = cat.rows.filter(function (r) { return r.section === 'pvh'; });
    if (pv.length !== 1 || h.length !== 1 || String(pv[0].k) !== p.k || String(h[0].g) !== p.grain || +h[0].n - 1 !== +p.kt || String(h[0].k || '') !== String(p.cs || '')) return false;
    var e = echo('cat', cat.rows);
    return C.echoColumns.every(function (k) { return JSON.stringify(values(e[k])) === JSON.stringify(values((p.flt || {})[k])); });
  }
  function preview(p, applied) {
    var valid = previewAllowed(p);
    if (applied) ST.preview = valid ? p : null;
    return valid;
  }
  function loadingNode() {
    var node = document.createElement('div'); node.className = 'pa-next-wait'; node.setAttribute('role', 'status');
    node.innerHTML = '<div class="pa-next-loading"><i class="pa-next-spinner" aria-hidden="true"></i><span></span><div class="pa-next-skeleton" aria-hidden="true"><i></i><i></i><i></i></div></div>';
    return node;
  }
  function markWaiting(el, waiting, message) {
    el.classList.toggle('pa-next-pending-block', waiting);
    Array.prototype.forEach.call(el.children, function (child) {
      if (child.classList.contains('pa-next-wait')) return;
      child.inert = waiting; child.setAttribute('aria-hidden', waiting ? 'true' : 'false');
    });
    var cover = Array.prototype.filter.call(el.children, function (n) { return n.classList.contains('pa-next-wait'); })[0];
    if (waiting && !cover) { cover = loadingNode(); el.appendChild(cover); }
    if (!waiting && cover) cover.parentNode.removeChild(cover);
    if (waiting && cover.querySelector('span').textContent !== message) cover.querySelector('span').textContent = message;
  }
  function status() {
    var issues = [], now = Date.now();
    ['cat', 'one'].forEach(function (part) {
      var el = shell.querySelector('[data-pa-next-host="' + part + '"]');
      var ready = current(part) && (part !== 'one' || !ST.preview), partial = part === 'one' && !!ST.preview && previewAllowed(ST.preview);
      var usable = ready || partial;
      var message = ST.error[part] || (!ST.generation ? 'Витрины обновляются или не опубликованы.' : 'Загружаем данные для выбранных фильтров…');
      if (now - ST.started > 45000 && !ST.error[part]) message = 'Запрос ещё выполняется. Данные появятся здесь после его завершения.';
      el.setAttribute('aria-busy', ready ? 'false' : 'true');
      el.setAttribute('data-pa-next-state', ready ? 'ready' : (partial ? 'preview' : 'loading'));
      el.classList.toggle('pa-next-stale', !usable);
      el.classList.toggle('pa-next-has-error', !!ST.error[part]);
      el.classList.toggle('pa-next-quiet', !ST.error[part] && now - ST.started < 400);
      // Keep navigation available while an uncached selection loads; only hide
      // stale metric blocks. The native renderer handles partial preview tabs.
      var local = part === 'one' && ST.mounted.one && !!el.querySelector('.pone-topbar');
      markWaiting(el, !usable && !local, message);
      if (local) {
        Array.prototype.forEach.call(el.querySelectorAll('.pone-panel-b'), function (block) {
          markWaiting(block, !usable, message);
        });
        // Stale KPI values disappear without adding another spinner/placard.
        Array.prototype.forEach.call(el.querySelectorAll('.pone-h-ttl'), function (title) {
          if (!usable && title.hasAttribute('title')) { title.setAttribute('data-pa-next-title', title.getAttribute('title')); title.removeAttribute('title'); }
          else if (usable && title.hasAttribute('data-pa-next-title')) { title.setAttribute('title', title.getAttribute('data-pa-next-title')); title.removeAttribute('data-pa-next-title'); }
        });
        var kpis = el.querySelector('.pone-top');
        if (kpis) { kpis.style.visibility = usable ? '' : 'hidden'; kpis.inert = !usable; kpis.setAttribute('aria-hidden', usable ? 'false' : 'true'); }
      }
      var retrySource = part === 'cat' ? 'one' : 'cat';
      var cover = el.querySelector('.pa-next-wait'), retry = el.querySelector('[data-pa-next-retry]');
      if (ST.commandError[retrySource] && cover && !retry) {
        retry = document.createElement('button'); retry.type = 'button'; retry.setAttribute('data-pa-next-retry', retrySource);
        retry.textContent = 'Повторить запрос'; cover.appendChild(retry);
      }
      if (!ST.commandError[retrySource] && retry) retry.parentNode.removeChild(retry);
      if (!ready) issues.push(partial ? 'Доступные показатели готовы; остальные детали догружаются.' : (part === 'cat' ? 'Каталог: ' : 'Показатели: ') + message);
    });
    var node = shell.querySelector('.pa-next-status');
    var summary = issues.length ? issues.join(' ') : 'Отчёт загружен';
    if (node.textContent !== summary) node.textContent = summary;
    node.classList.toggle('pa-next-ready', !issues.length);
  }
  function deferStatus() {
    if (ST.statusTick) cancelAnimationFrame(ST.statusTick);
    ST.statusTick = requestAnimationFrame(function () { ST.statusTick = null; status(); });
    if (ST.quietTimer) clearTimeout(ST.quietTimer);
    ST.quietTimer = setTimeout(status, 410);
  }
  function emit(part, mask) {
    if (!Array.isArray(mask)) return;
    ST.desired[part] = mask; ST.queue[part] = mask;
    ['cat','one'].forEach(restore);
    flush(); deferStatus();
  }
  function help() { ST.interaction.help(); }
  function bus(part, msg) {
    if (msg.type === 'PA_NEXT_INTERNAL_TOUR_GO') { help(); return; }
    if (msg.type === 'PA_NEXT_INTERNAL_SEL' && Array.isArray(msg.nextMask)) {
      var allowed = { head: ['strip', 'ca'], cat: ['cat'], one: ['ppl'] };
      if (allowed[part].indexOf(msg.src) >= 0) {
        ST.intent[msg.src] = { part: part, cols: msg.cols, key: msg.key, mask: msg.nextMask };
        ST.desired[part] = ST.desired[part].filter(function (f) { return msg.cols.indexOf(f.column) < 0; }).concat(msg.nextMask.filter(function (f) { return msg.cols.indexOf(f.column) >= 0; }));
        ST.started = Date.now();
        // Synchronous selection/preview delivery gives the renderer one atomic
        // visual change. Query completion remains independent of this UI state.
        window.dispatchEvent(new window.MessageEvent('message', { data: msg }));
        ['cat','one'].forEach(restore); status(); deferStatus(); return;
      }
    }
    if (part === 'cat' && msg.type === 'PA_NEXT_INTERNAL_PREV') {
      ST.previewLabel = { key: msg.key, id: String(msg.id), name: String(msg.name || '') };
      if (current('one') && !ST.preview) return;
      window.dispatchEvent(new window.MessageEvent('message', { data: msg })); status(); deferStatus(); return;
    }
    // Only these local renderer callbacks establish intent/provenance.
    window.postMessage(msg, '*');
  }
  var renderers = __RENDERERS__;
  function render(part, rows) {
    if (part === 'one') ST.preview = null;
    renderers[part](rows, function (mask) { emit(part, mask); }, function (msg) { bus(part, msg); }, help, preview, deferStatus, uiKey);
    ST.mounted[part] = true;
  }
  function receive(part, rows, serial) {
    var request = responseKey(part, rows), record = request === null ? null : ST.issued[part][request];
    // Complete even an obsolete choice. It must never overwrite the current UI.
    var completed = ST.flight[part] && ST.flight[part].request === request;
    if (completed) delete ST.flight[part];
    var g = version(rows);
    if (!g) { ST.error[part] = 'Обновление витрин не завершено. Дождись публикации и принудительно обнови все чарты дашборда.'; status(); return; }
    if (g !== ST.generation) { ST.error[part] = 'Части отчёта относятся к разным загрузкам. После завершения ноутбука принудительно обнови все чарты дашборда: обычная перезагрузка страницы может сохранить кэш.'; status(); return; }
    if (!record || record.generation !== g || !echoMatches(part, rows, record.expected)) {
      if (!ST.mounted[part]) ST.error[part] = 'Фильтры сохранены от прежнего окна отчёта. Сбрось фильтры дашборда и обнови всю страницу.';
      flush(); deferStatus(); return;
    }
    ST.received[part] = true;
    var commandSource = part === 'cat' ? 'one' : 'cat';
    if (!ST.commandError[commandSource] || completed) delete ST.error[part];
    if (completed && ST.commandError[commandSource]) { delete ST.commandError[commandSource]; delete ST.pending[commandSource]; }
    var old = ST.cache[part].filter(function (x) { return x.key === record.key; })[0];
    // A duplicate ASK/ROWS does not rebuild an already visible renderer.
    if (!old || old.serial !== serial || old.instance !== ST.instances[part]) {
      remember(part, { rows: rows, generation: g, serial: serial, instance: ST.instances[part], key: record.key, baseline: request === '["",""]' });
    }
    restore(part); flush(); deferStatus();
  }
  ST.on = function (ev) {
    var d = ev.data;
    if (!d || d.type !== 'PA_NEXT_V1' || d.v !== V || d.channel !== C.channel || d.to !== C.main || ['cat', 'one'].indexOf(d.part) < 0 || d.chart !== C[d.part] || !ev.source) return;
    if (!d.instance || ST.retired[d.part][d.instance]) return;
    if (d.kind === 'HELLO') {
      if (ST.instances[d.part] !== d.instance) {
        if (ST.instances[d.part]) ST.retired[d.part][ST.instances[d.part]] = true;
        ST.instances[d.part] = d.instance; ST.serial[d.part] = 0;
      }
      ST.peers[d.part] = ev.source; send(d.part, 'ASK'); if (ST.pending[d.part] && !ST.commandError[d.part]) send(d.part, 'COMMAND', ST.pending[d.part]); return; }
    if (d.kind === 'ROWS' && d.session === ST.session) {
      if (ST.peers[d.part] && ST.peers[d.part] !== ev.source) return;
      if (ST.instances[d.part] && ST.instances[d.part] !== d.instance) return;
      ST.instances[d.part] = d.instance;
      ST.peers[d.part] = ev.source;
      if (d.serial < (ST.serial[d.part] || 0)) return;
      ST.serial[d.part] = d.serial; receive(d.part, d.rows || [], d.serial);
    } else if (d.kind === 'ACK' && d.session === ST.session && ev.source === ST.peers[d.part]) {
      if (ST.pending[d.part] && ST.pending[d.part].seq <= d.seq) delete ST.pending[d.part];
    } else if (d.kind === 'ERROR' && d.session === ST.session && ev.source === ST.peers[d.part]) {
      if (!ST.pending[d.part] || ST.pending[d.part].seq !== d.seq) return;
      ST.commandError[d.part] = true;
      ST.error[d.part === 'cat' ? 'one' : 'cat'] = d.message; status();
    }
  };
  window.addEventListener('message', ST.on);
  if (ST.retry) shell.removeEventListener('click', ST.retry);
  ST.retry = function (ev) {
    var button = ev.target.closest && ev.target.closest('[data-pa-next-retry]'); if (!button) return;
    var src = button.getAttribute('data-pa-next-retry');
    if (!ST.commandError[src] || !ST.pending[src]) return;
    delete ST.commandError[src]; delete ST.error[src === 'cat' ? 'one' : 'cat'];
    ST.started = Date.now(); send(src, 'COMMAND', ST.pending[src]); status();
  };
  shell.addEventListener('click', ST.retry);
  var head = typeof data !== 'undefined' && Array.isArray(data) ? data : [], gen = version(head);
  if (ST.generation !== gen) {
    ST.cache = { cat: [], one: [] }; ST.accepted = {}; ST.issued = { cat: {}, one: {} };
    ST.received = {}; ST.flight = {}; ST.preview = null;
  }
  ST.generation = gen;
  ['cat','one'].forEach(function (part) { if (!ST.issued[part][requestKey(part, ST.masks)]) register(part); });
  if (gen) render('head', head);
  else shell.querySelector('[data-pa-next-host="head"]').textContent = 'Витрины pa_next ещё не опубликованы. Заверши запуск ноутбука и принудительно обнови все чарты дашборда.';
  ['cat', 'one'].forEach(restore);
  status(); broadcastAsk();
  ST.timer = setInterval(function () {
    ['cat', 'one'].forEach(function (part) { if (ST.pending[part] && !ST.commandError[part]) send(part, 'COMMAND', ST.pending[part]); if (!ST.mounted[part] || (ST.error[part] && !ST.commandError[part === 'cat' ? 'one' : 'cat'])) send(part, 'ASK'); });
    status();
  }, 1500);
})();
option = { animation: false, xAxis: { show: false, type: 'value' }, yAxis: { show: false, type: 'value' }, series: [{ type: 'scatter', data: [] }] };
