function installMotion(shell, ST) {
  // Animate presentation only. The renderer's final text remains the accessible
  // value and the layout reservation; arithmetic never feeds the data model.
  var panel = shell.querySelector('[data-pa-next-host="one"]');
  var reduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var active = null, frame = null, last = null, destroyed = false;
  var duration = 200;
  function allowed() {
    var state = panel && panel.getAttribute('data-pa-next-state');
    return !destroyed && (state === 'ready' || state === 'preview') &&
      !panel.classList.contains('pa-next-stale') && !shell.classList.contains('pa-next-resizing') &&
      !(reduced && reduced.matches);
  }
  function number(text) {
    // Parse only the already formatted display magnitude. K/M and percent
    // suffixes stay unchanged. Unrecognised/unsafe values appear immediately.
    var m = /^([+\-\u2212]?)(\d+(?:[ \u00a0\u202f]\d{3})*)(?:([,.])(\d+))?([KM%]?)$/.exec(text);
    if (!m || (m[4] && m[4].length > 3)) return null;
    var digits = m[2].replace(/[ \u00a0\u202f]/g, '');
    if (digits.length > 15) return null;
    var value = Number(digits + (m[4] ? '.' + m[4] : ''));
    if (!isFinite(value) || value === 0) return null;
    var group = /[ \u00a0\u202f]/.exec(m[2]);
    return { value: value, sign: m[1], group: group ? group[0] : '', decimal: m[3] || '',
      places: m[4] ? m[4].length : 0, suffix: m[5] };
  }
  function format(n, progress) {
    var parts = (n.value * progress).toFixed(n.places).split('.');
    if (n.group) parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, n.group);
    return n.sign + parts[0] + (n.places ? n.decimal + parts[1] : '') + n.suffix;
  }
  function finish(item) {
    if (item.exact.parentNode !== item.node) return;
    if (item.visual.parentNode === item.node) item.node.removeChild(item.visual);
    while (item.exact.firstChild) item.node.insertBefore(item.exact.firstChild, item.exact);
    item.node.removeChild(item.exact);
    item.node.style.position = item.position;
    item.node.removeAttribute('data-pa-next-animating');
  }
  function cancel() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    if (active) active.items.forEach(finish);
    active = null;
  }
  function tick(now) {
    frame = null;
    if (!active) return;
    if (!allowed() || !panel.contains(active.nodes[0])) { cancel(); return; }
    var elapsed = Math.max(0, now - active.started), progress = Math.min(1, elapsed / duration);
    if (progress >= 1) { cancel(); return; }
    var eased = 1 - Math.pow(1 - progress, 3);
    // The viewport watches childList mutations. Update the existing text node,
    // so each counter frame does not schedule another full geometry pass.
    active.items.forEach(function (item) { item.visual.firstChild.nodeValue = format(item.number, eased); });
    frame = requestAnimationFrame(tick);
  }
  function rendered() {
    if (!panel || destroyed) return;
    var nodes = Array.prototype.slice.call(panel.querySelectorAll('.pone-k-val[data-pa-next-motion-key]'));
    if (!nodes.length) { cancel(); return; }
    var key = String(ST.generation || '') + '|' + nodes[0].getAttribute('data-pa-next-motion-key');
    // Repeated status/layout notifications for this same DOM must not restart
    // or truncate an animation that is already running.
    if (active && allowed() && active.key === key && nodes.length === active.nodes.length &&
        nodes.every(function (node, index) { return node === active.nodes[index]; })) return;
    cancel();
    var values = nodes.map(function (node) { return node.textContent; });
    var previous = last;
    last = { key: key, values: values };
    if (!allowed()) return;
    var items = [];
    nodes.forEach(function (node, index) {
      if (previous && previous.key === key && previous.values[index] === values[index]) return;
      var parsed = number(values[index]);
      if (!parsed) return;
      var exact = document.createElement('span'), visual = document.createElement('span');
      // opacity preserves the exact final value in the accessibility tree;
      // aria-hidden prevents intermediate animation frames being announced.
      exact.style.opacity = '0';
      while (node.firstChild) exact.appendChild(node.firstChild);
      visual.setAttribute('aria-hidden', 'true');
      visual.className = 'pa-next-kpi-motion';
      visual.style.cssText = 'position:absolute;left:0;top:0;white-space:nowrap;pointer-events:none';
      visual.textContent = format(parsed, 0);
      var item = { node: node, exact: exact, visual: visual, number: parsed, position: node.style.position };
      node.style.position = 'relative';
      node.setAttribute('data-pa-next-animating', '');
      node.appendChild(exact); node.appendChild(visual); items.push(item);
    });
    if (!items.length) return;
    active = { key: key, nodes: nodes, items: items, started: performance.now() };
    frame = requestAnimationFrame(tick);
  }
  function onReduce() { if (reduced && reduced.matches) cancel(); }
  window.addEventListener('resize', cancel);
  if (reduced && reduced.addEventListener) reduced.addEventListener('change', onReduce);
  else if (reduced && reduced.addListener) reduced.addListener(onReduce);
  return { shell: shell, rendered: rendered, cancel: cancel, destroy: function () {
    cancel(); destroyed = true;
    window.removeEventListener('resize', cancel);
    if (reduced && reduced.removeEventListener) reduced.removeEventListener('change', onReduce);
    else if (reduced && reduced.removeListener) reduced.removeListener(onReduce);
  } };
}
