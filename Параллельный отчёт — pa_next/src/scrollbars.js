function installScrollbars(shell) {
  // Keep native scrolling and its dimensions. Only the thumb's paint changes.
  var active = [], entries = [], timer = null, frame = null, stopped = false, intentUntil = 0, held = false;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  function inside(node) {
    return node && node.nodeType === 1 && (node === shell || shell.contains(node) || node.matches('body .phead-list,body .phead-sel'));
  }
  function scrollable(node) { return node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1; }
  function intent() { intentUntil = performance.now() + 700; }
  function down(ev) {
    var node = ev.target && ev.target.nodeType === 1 ? ev.target : null;
    while (node && node !== document.body) {
      if (inside(node) && scrollable(node)) {
        var r = node.getBoundingClientRect();
        if (ev.button === 1 || (node.scrollHeight > node.clientHeight + 1 && ev.clientX >= r.right - 5 && ev.clientX <= r.right) ||
            (node.scrollWidth > node.clientWidth + 1 && ev.clientY >= r.bottom - 5 && ev.clientY <= r.bottom)) { held = true; intent(); return; }
      }
      node = node.parentElement;
    }
  }
  function up() { held = false; }
  function move() { if (held) intent(); }
  function key(ev) { if (/^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight|PageUp|PageDown|Home|End| |Spacebar)$/.test(ev.key || '')) intent(); }
  function opacity(item, value) {
    item.value = value;
    if (value > 0 || item.to === 1) {
      item.node.setAttribute('data-pa-next-scroll-active', '');
      item.node.style.setProperty('--pa-next-scroll-opacity', value.toFixed(3));
    } else {
      item.node.removeAttribute('data-pa-next-scroll-active');
      item.node.style.removeProperty('--pa-next-scroll-opacity');
    }
  }
  function tick(now) {
    frame = null;
    var moving = false;
    entries.forEach(function (item) {
      var progress = reduced && reduced.matches ? 1 : Math.min(1, Math.max(0, (now - item.started) / item.duration));
      var ease = progress * progress * (3 - 2 * progress);
      opacity(item, item.from + (item.to - item.from) * ease);
      if (progress < 1) moving = true;
    });
    entries = entries.filter(function (item) { return item.to !== 0 || item.value > 0; });
    if (moving && !stopped) frame = requestAnimationFrame(tick);
  }
  function paint(node, immediate) {
    var to = active.indexOf(node) >= 0 ? 1 : 0;
    var item = entries.filter(function (value) { return value.node === node; })[0];
    if (!item) { item = {node:node,value:0,to:0}; entries.push(item); }
    if (item.to === to && !immediate) return;
    item.from = item.value; item.to = to; item.started = performance.now();
    item.duration = (to ? 280 : 450) * Math.max(0.001, Math.abs(to - item.value));
    if (immediate || (reduced && reduced.matches)) {
      item.from = to; item.duration = 1; opacity(item, to);
    } else opacity(item, item.value);
    if (frame === null && !stopped) frame = requestAnimationFrame(tick);
  }
  function schedule() {
    clearTimeout(timer); timer = null;
    var next = Infinity;
    entries.forEach(function (item) { if (active.indexOf(item.node) >= 0) next = Math.min(next, item.until); });
    if (next < Infinity) timer = setTimeout(clearActive, Math.max(0, Math.ceil(next - performance.now())));
  }
  function clearActive() {
    var now = performance.now(), previous = active;
    active = previous.filter(function (node) {
      var item = entries.filter(function (value) { return value.node === node; })[0];
      return item && item.until > now;
    });
    previous.forEach(function (node) { if (active.indexOf(node) < 0) paint(node); });
    schedule();
  }
  function scrolling(ev) {
    var node = ev.target;
    if (stopped || !inside(node) || !scrollable(node) || (!held && performance.now() > intentUntil)) return;
    intentUntil = performance.now() + 300;
    if (active.indexOf(node) < 0) active.push(node);
    paint(node);
    entries.forEach(function (item) { if (item.node === node) item.until = performance.now() + 1400; });
    schedule();
  }
  function blur() {
    held = false; intentUntil = 0; clearTimeout(timer); timer = null; active = [];
    entries.forEach(function (item) { paint(item.node, true); });
    entries = []; if (frame !== null) cancelAnimationFrame(frame); frame = null;
  }
  document.addEventListener('scroll', scrolling, true);
  document.addEventListener('wheel', intent, {capture:true,passive:true});
  document.addEventListener('touchmove', intent, {capture:true,passive:true});
  document.addEventListener('keydown', key, true);
  document.addEventListener('pointerdown', down, {passive:true});
  document.addEventListener('pointermove', move, {passive:true});
  document.addEventListener('pointerup', up, {passive:true});
  document.addEventListener('pointercancel', up, {passive:true});
  window.addEventListener('blur', blur);
  return { destroy: function () {
    stopped = true; blur();
    document.removeEventListener('scroll', scrolling, true);
    document.removeEventListener('wheel', intent, true);
    document.removeEventListener('touchmove', intent, true);
    document.removeEventListener('keydown', key, true);
    document.removeEventListener('pointerdown', down);
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
    window.removeEventListener('blur', blur);
  } };
}
