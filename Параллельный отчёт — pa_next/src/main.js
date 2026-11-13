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
      probe.style.cssText='position:fixed;left:0;top:'+y+'px;width:1px;height:16px;pointer-events:none;opacity:0';
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
  function values(a) {
    return (a || []).map(function (x) { return String(x).replace(/["\\\n\r]/g, ''); }).filter(function (x) { return x !== ''; }).sort();
  }
  function maskMap(mask) {
    var o = {}; mask.forEach(function (f) { if (f.column !== 'pa_nonce') o[f.column] = values(f.value); }); return o;
  }
  function wanted(part) {
    var o = maskMap(ST.masks.head), other = maskMap(ST.masks[part === 'cat' ? 'one' : 'cat']);
    Object.keys(other).forEach(function (k) { o[k] = other[k]; }); return o;
  }
  function matches(part, rows) {
    var e = echo(part, rows); if (!e) return false;
    var w = wanted(part), cols = C.echoColumns;
    var reqs = {}, needed = ['head', part === 'cat' ? 'one' : 'cat'];
    rows.forEach(function (r) { if (r.section === 'pa_next_request') reqs[r.g] = String(r.k || ''); });
    if (!needed.every(function (src) {
      var mask = maskMap(ST.masks[src]);
      return Object.prototype.hasOwnProperty.call(reqs, src) && reqs[src] === (mask['pa_next_' + src + '_req'] || [''])[0];
    })) return false;
    return cols.every(function (k) { return JSON.stringify(values(e[k])) === JSON.stringify(w[k] || []); });
  }
  function status() {
    var issues = [], now = Date.now();
    ['cat', 'one'].forEach(function (part) {
      var el = shell.querySelector('[data-pa-next-host="' + part + '"]');
      var x = ST.accepted[part], ready = !ST.error[part] && x && x.generation === ST.generation && matches(part, x.rows);
      el.setAttribute('aria-busy', ready ? 'false' : 'true');
      el.classList.toggle('pa-next-stale', !ready);
      Array.prototype.forEach.call(el.children, function (child) {
        if (child.className === 'pa-next-wait') return;
        child.inert = !ready;
        child.setAttribute('aria-hidden', ready ? 'false' : 'true');
      });
      var cover = el.querySelector('.pa-next-wait');
      if (!ready && !cover) { cover = document.createElement('div'); cover.className = 'pa-next-wait'; cover.setAttribute('role', 'status'); el.appendChild(cover); }
      if (ready && cover) cover.parentNode.removeChild(cover);
      if (!ready) {
        var name = part === 'cat' ? 'Каталог' : 'Показатели';
        var message = ST.error[part] || (!ST.generation ? 'Витрины обновляются или не опубликованы.' : 'Загружаем данные для твоего выбора…');
        if (now - ST.started > 45000 && !ST.error[part]) message = 'Ответ задерживается. Принудительно обнови все чарты дашборда; если это повторится, сообщи владельцу.';
        if (cover.textContent !== message) cover.textContent = message;
        issues.push(name + ': ' + message);
      }
    });
    var node = shell.querySelector('.pa-next-status');
    var summary = issues.length ? issues.join(' ') : 'Отчёт загружен';
    if (node.textContent !== summary) node.textContent = summary;
    node.classList.toggle('pa-next-ready', !issues.length);
  }
  function emit(part, mask) {
    if (!Array.isArray(mask)) return;
    var seq = ++ST.seq;
    mask = mask.filter(function (f) { return f.column !== 'pa_next_' + part + '_req'; }).concat([
      { column: 'pa_next_' + part + '_req', operator: 'IN', value: [ST.session + '-' + seq] }
    ]);
    ST.masks[part] = mask; ST.started = Date.now();
    ST.error = {};
    if (part === 'head') {
      if (ST.apply) ST.apply(mask);
      else ST.error.cat = ST.error.one = 'Открой отчёт на дашборде: фильтры недоступны.';
    } else {
      ST.pending[part] = { seq: seq, mask: mask };
      send(part, 'COMMAND', ST.pending[part]);
    }
    status();
  }
  function help() {
    var old = shell.querySelector('.pa-next-help'); if (old) return;
    var focus = document.activeElement, layer = document.createElement('div'); layer.className = 'pa-next-help';
    layer.innerHTML = '<div role="dialog" aria-modal="true" aria-label="Как работать с отчётом" tabindex="-1"><h2>Как работать с отчётом</h2>' +
      '<p>Выбери период и условия целевой аудитории сверху. Они применяются к каталогу и показателям.</p>' +
      '<p>Выбери отчёт, владельца или коллекцию в каталоге слева — справа появятся показатели этой области. Повторный клик снимает выбор.</p>' +
      '<p>Выбор людей справа уточняет каталог. Собственный выбор блока не меняет его исходные данные: направления фильтров сохранены.</p>' +
      '<p>Пока ответ загружается, блок закрыт плашкой. Во время запуска ноутбука отчётом не пользуйся; после его завершения принудительно обнови все чарты дашборда.</p>' +
      '<button type="button">Понятно</button></div>';
    var observer = null, probes = [], visible = {}, dialog;
    function close() {
      if (observer) observer.disconnect();
      probes.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
      layer.parentNode.removeChild(layer);
      if (focus && focus.focus) focus.focus({ preventScroll: true });
    }
    function place() {
      if (!dialog || !layer.parentNode) return;
      var ys = Object.keys(visible).filter(function (k) { return visible[k]; }).map(Number).sort(function (a,b) { return a-b; });
      var a = ys.length ? ys[0] : 0, b = ys.length ? Math.min(window.innerHeight, ys[ys.length-1]+24) : Math.min(window.innerHeight, window.screen.availHeight || 700);
      dialog.style.maxHeight = Math.max(120,b-a-32)+'px';
      dialog.style.top = Math.max(a+16,a+(b-a-dialog.offsetHeight)/2)+'px';
      dialog.style.visibility = 'visible';
    }
    layer.addEventListener('click', function (ev) { if (ev.target === layer || ev.target.tagName === 'BUTTON') close(); });
    layer.addEventListener('keydown', function (ev) { if (ev.keyCode === 27) { ev.preventDefault(); close(); } else if (ev.keyCode === 9) { ev.preventDefault(); layer.querySelector('button').focus(); } });
    shell.appendChild(layer); dialog = layer.querySelector('[role=dialog]');
    dialog.style.position = 'absolute'; dialog.style.visibility = 'hidden';
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) { visible[entry.target.getAttribute('data-y')] = entry.isIntersecting; });
        place();
      }, { threshold: 0.01 });
      for (var y = 0; y < window.innerHeight; y += 24) {
        var probe = document.createElement('i'); probe.setAttribute('data-y',String(y));
        probe.style.cssText = 'position:fixed;left:0;top:'+y+'px;width:1px;height:24px;pointer-events:none;opacity:0';
        document.body.appendChild(probe); probes.push(probe); observer.observe(probe);
      }
    }
    setTimeout(function () { place(); if (layer.parentNode) layer.querySelector('button').focus({ preventScroll: true }); },100);
  }
  function bus(msg) {
    if (msg.type === 'PA_TOUR_GO') { help(); return; }
    // Internal only: existing renderers share a window, original board messages never leave it.
    window.postMessage(msg, '*');
  }
  var renderers = __RENDERERS__;
  function render(part, rows) {
    renderers[part](rows, function (mask) { emit(part, mask); }, bus, help);
    ST.mounted[part] = true;
  }
  function receive(part, rows, serial) {
    var g = version(rows);
    if (!g) { ST.error[part] = 'Обновление витрин не завершено. Дождись публикации и принудительно обнови все чарты дашборда.'; status(); return; }
    if (g !== ST.generation) { ST.error[part] = 'Части отчёта относятся к разным загрузкам. После завершения ноутбука принудительно обнови все чарты дашборда: обычная перезагрузка страницы может сохранить кэш.'; status(); return; }
    if (!matches(part, rows)) {
      if (!ST.mounted[part]) ST.error[part] = 'Фильтры сохранены от прежнего окна отчёта. Сбрось фильтры дашборда и обнови всю страницу.';
      status(); return;
    }
    var prev = ST.accepted[part];
    delete ST.error[part];
    if (!prev || prev.serial !== serial || prev.instance !== ST.instances[part] || prev.generation !== g || !ST.mounted[part]) {
      ST.accepted[part] = { rows: rows, generation: g, serial: serial, instance: ST.instances[part] };
      render(part, rows);
    }
    status();
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
      ST.peers[d.part] = ev.source; send(d.part, 'ASK'); if (ST.pending[d.part]) send(d.part, 'COMMAND', ST.pending[d.part]); return; }
    if (d.kind === 'ROWS' && d.session === ST.session) {
      if (ST.peers[d.part] && ST.peers[d.part] !== ev.source) return;
      if (ST.instances[d.part] && ST.instances[d.part] !== d.instance) return;
      ST.instances[d.part] = d.instance;
      ST.peers[d.part] = ev.source;
      if (d.serial < (ST.serial[d.part] || 0)) return;
      ST.serial[d.part] = d.serial; receive(d.part, d.rows || [], d.serial);
    } else if (d.kind === 'ACK' && d.session === ST.session && ev.source === ST.peers[d.part]) {
      if (ST.pending[d.part] && ST.pending[d.part].seq <= d.seq) delete ST.pending[d.part];
    } else if (d.kind === 'ERROR' && d.session === ST.session && ev.source === ST.peers[d.part]) { ST.error[d.part] = d.message; status(); }
  };
  window.addEventListener('message', ST.on);
  var head = typeof data !== 'undefined' && Array.isArray(data) ? data : [], gen = version(head);
  ST.generation = gen;
  if (gen) render('head', head);
  else shell.querySelector('[data-pa-next-host="head"]').textContent = 'Витрины pa_next ещё не опубликованы. Заверши запуск ноутбука и принудительно обнови все чарты дашборда.';
  ['cat', 'one'].forEach(function (part) { var x = ST.accepted[part]; if (x && x.generation === gen && matches(part, x.rows) && !ST.mounted[part]) render(part, x.rows); });
  status(); broadcastAsk();
  ST.timer = setInterval(function () {
    ['cat', 'one'].forEach(function (part) { if (ST.pending[part]) send(part, 'COMMAND', ST.pending[part]); if (!ST.mounted[part] || ST.error[part]) send(part, 'ASK'); });
    status();
  }, 1500);
})();
option = { animation: false, xAxis: { show: false, type: 'value' }, yAxis: { show: false, type: 'value' }, series: [{ type: 'scatter', data: [] }] };
