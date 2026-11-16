function installScrollbars(shell) {
  // Keep native scrolling and its dimensions. Only the thumb's paint changes.
  var active = [], edge = null, held = null, timer = null, edgeTimer = null, stopped = false;
  function inside(node) {
    return node && node.nodeType === 1 && (node === shell || shell.contains(node) || node.matches('body .phead-list,body .phead-sel'));
  }
  function scrollable(node) { return node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1; }
  function paint(node) {
    if (active.indexOf(node) >= 0 || node === edge || node === held) {
      if (!node.hasAttribute('data-pa-next-scroll-active')) node.setAttribute('data-pa-next-scroll-active', '');
    } else if (node.hasAttribute('data-pa-next-scroll-active')) node.removeAttribute('data-pa-next-scroll-active');
  }
  function clearActive() {
    var previous = active; active = []; timer = null;
    previous.forEach(function (node) { paint(node); });
  }
  function scrolling(ev) {
    var node = ev.target;
    if (stopped || !inside(node) || !scrollable(node)) return;
    if (active.indexOf(node) < 0) active.push(node);
    paint(node); clearTimeout(timer); timer = setTimeout(clearActive, 1000);
  }
  function atEdge(ev) {
    var node = ev.target && ev.target.nodeType === 1 ? ev.target : null;
    while (node && node !== document.body) {
      if (inside(node) && scrollable(node)) {
        var r = node.getBoundingClientRect();
        var vertical = node.scrollHeight > node.clientHeight + 1 && ev.clientX >= r.right - 10 && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
        var horizontal = node.scrollWidth > node.clientWidth + 1 && ev.clientY >= r.bottom - 10 && ev.clientY <= r.bottom && ev.clientX >= r.left && ev.clientX <= r.right;
        if (vertical || horizontal) return node;
      }
      node = node.parentElement;
    }
    return null;
  }
  function pointer(ev) {
    var next = atEdge(ev), previous = edge;
    edge = next; if (previous) paint(previous); if (edge) paint(edge);
    // Some native scrollbar implementations swallow iframe leave events and
    // retain :hover. Bound edge discovery by activity too: it cannot stick.
    clearTimeout(edgeTimer); edgeTimer = edge ? setTimeout(leave, 1000) : null;
  }
  function down(ev) { pointer(ev); held = edge; if (held) paint(held); }
  function up() { var previous = held; held = null; if (previous) paint(previous); }
  function leave() { clearTimeout(edgeTimer); edgeTimer = null; var previous = edge; edge = null; if (previous) paint(previous); }
  function out(ev) { if (!ev.relatedTarget) leave(); }
  function blur() { leave(); up(); clearTimeout(timer); clearActive(); }
  document.addEventListener('scroll', scrolling, true);
  document.addEventListener('pointermove', pointer, { passive: true });
  document.addEventListener('pointerdown', down, { passive: true });
  document.addEventListener('pointerup', up, { passive: true });
  document.addEventListener('pointercancel', up, { passive: true });
  document.documentElement.addEventListener('pointerleave', leave);
  document.addEventListener('pointerout', out);
  document.addEventListener('mouseout', out);
  window.addEventListener('blur', blur);
  return { destroy: function () {
    stopped = true; blur();
    document.removeEventListener('scroll', scrolling, true);
    document.removeEventListener('pointermove', pointer);
    document.removeEventListener('pointerdown', down);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
    document.documentElement.removeEventListener('pointerleave', leave);
    document.removeEventListener('pointerout', out);
    document.removeEventListener('mouseout', out);
    window.removeEventListener('blur', blur);
  } };
}
