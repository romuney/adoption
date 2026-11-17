// Presentation-only controller shared by the three isolated renderers.
// Keep source tip HTML and metric formatting; never emit filters from hover.
if (state.paNextTipController) state.paNextTipController.destroy();
var paNextTip = (function () {
  var node = getTip(), visible = false, timer = null, paint = null;
  var surface = null, point = false, w = 0, h = 0, vw = 0, vh = 0;
  var left = null, top = null, dead = false;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  node.style.left = '0px'; node.style.top = '0px';
  node.style.width = 'max-content';
  node.style.maxWidth = 'min(260px, calc(100vw - 12px))';
  node.style.transition = 'none';
  function cancel() { if (timer !== null) clearTimeout(timer); timer = null; }
  function motion() { return reduced && reduced.matches ? 'none' : 'transform 80ms ease-out'; }
  function hide() {
    cancel();
    if (paint !== null) cancelAnimationFrame(paint);
    paint = null; visible = false; point = false; surface = null;
    node.style.opacity = '0'; node.style.display = 'none';
    node.style.transition = 'none';
  }
  function position(rect, changed) {
    var pad = 6, gap = 8, x, y;
    if (changed || vw !== window.innerWidth || vh !== window.innerHeight) {
      w = node.offsetWidth; h = node.offsetHeight;
      vw = window.innerWidth; vh = window.innerHeight;
    }
    if (rect.pt) {
      x = rect.left + 14; y = rect.top + 18;
      if (x + w > vw - pad) x = rect.left - w - 14;
      if (y + h > vh - pad) y = rect.top - h - 14;
    } else {
      x = rect.left + rect.width / 2 - w / 2;
      y = rect.top + rect.height + gap;
      if (y + h > vh - pad) y = rect.top - h - gap;
    }
    x = Math.round(Math.max(pad, Math.min(x, vw - w - pad)));
    y = Math.round(Math.max(pad, Math.min(y, vh - h - pad)));
    // Snap on first show or if new content would overflow at the old position.
    // Otherwise a short transform transition follows the cursor continuously.
    var snap = !visible || left === null || left + w > vw - pad || top + h > vh - pad;
    if (changed && visible) {
      var current = node.getBoundingClientRect();
      if (current.left < pad || current.top < pad || current.right > vw - pad || current.bottom > vh - pad) snap = true;
    }
    if (snap) {
      node.style.transition = 'none';
      if (paint !== null) cancelAnimationFrame(paint);
      paint = requestAnimationFrame(function () { paint = null; if (!dead && visible) node.style.transition = motion(); });
    } else if (paint === null) node.style.transition = motion();
    if (left !== x || top !== y) node.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    left = x; top = y;
  }
  function show(html, rect) {
    if (dead || !rect) return;
    cancel();
    var changed = node.__h !== html;
    if (changed) {
      // Dynamics may already have written the HTML for its newly hovered bin.
      if (node.innerHTML !== html) node.innerHTML = html;
      node.__h = html;
    }
    node.style.display = 'block';
    position(rect, changed || !visible);
    point = !!rect.pt; visible = true;
    node.style.opacity = '1';
  }
  function findSurface(target) {
    while (target && target !== overlay) {
      if (target.tagName === 'TABLE' || (target.classList && target.classList.contains(CFG.ns + '-cal-main'))) return target;
      target = target.parentNode;
    }
    return null;
  }
  function gap(target) {
    if (!surface || !target || !surface.contains(target)) return false;
    if (/^(TABLE|TBODY|THEAD|TFOOT|TR)$/.test(target.tagName)) return true;
    var classes = target.classList;
    return !!(classes && (classes.contains(CFG.ns + '-cal-main') || classes.contains(CFG.ns + '-cal-rib') ||
      classes.contains(CFG.ns + '-cal-mg') || classes.contains(CFG.ns + '-cal-mos') || classes.contains(CFG.ns + '-cal-mo') || classes.contains(CFG.ns + '-cal-gap')));
  }
  function defer(event) {
    var next = event.type === 'mouseout' ? event.relatedTarget : event.target;
    if (!next || !overlay.contains(next)) { hide(); return; }
    if (gap(next)) { cancel(); return; }
    // Empty/out-of-range cells must not keep another cell's numbers visible.
    if (!trigger(next, 'data-tip') && ((next.closest && next.closest('td,th,.d.out,.nd')) || next.tagName === 'TD' || next.tagName === 'TH')) { hide(); return; }
    if (timer === null) timer = setTimeout(hide, 90);
  }
  function track(event) {
    var target = trigger(event.target, 'data-tip');
    if (target) surface = findSurface(target);
  }
  function move(event) {
    var target = trigger(event.target, 'data-tip');
    if (target && !state.tip) onOver(event);
    if (visible && point && gap(event.target)) position({left:event.clientX,top:event.clientY,width:0,height:0,pt:true}, false);
    else if (visible && point && !target && !trigger(event.target, 'data-dyn')) defer(event);
  }
  function dismiss(event) {
    if (event && event.type === 'click' && trigger(event.target, 'data-replink')) return;
    state.tip = null; state.dynEl = null; state.dynI = -1; hide();
  }
  function visibility() { if (document.hidden) dismiss(); }
  function key(event) { if (event.key === 'Escape') dismiss(); }
  overlay.addEventListener('mouseover', track, true);
  overlay.addEventListener('mousemove', move, true);
  overlay.addEventListener('mouseleave', dismiss);
  overlay.addEventListener('scroll', dismiss, {capture:true,passive:true});
  overlay.addEventListener('click', dismiss, true);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('keydown', key);
  state.tip = null; state.dynEl = null; state.dynI = -1;
  return {show:show, hide:hide, defer:defer, destroy:function () {
    dead = true; hide();
    overlay.removeEventListener('mouseover', track, true);
    overlay.removeEventListener('mousemove', move, true);
    overlay.removeEventListener('mouseleave', dismiss);
    overlay.removeEventListener('scroll', dismiss, true);
    overlay.removeEventListener('click', dismiss, true);
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('keydown', key);
  }};
}());
state.paNextTipController = paNextTip;
