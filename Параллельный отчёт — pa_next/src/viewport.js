function installViewport(shell, ST) {
  var head = shell.querySelector('.pa-next-head');
  var content = shell.querySelector('.pa-next-content');
  var panel = shell.querySelector('.pa-next-one');
  var host = shell.parentElement;
  var destroyed = false, tick = null, observer = null, mutations = null;
  var oldHeight = content.style.height;
  var oldShell = { height: shell.style.height, top: shell.style.top };

  function usefulHeight() {
    var body = panel.querySelector('.pone-panel-b.dyn-wrap');
    if (!body || !body.querySelector('svg[data-dyn-svg]')) return ST.viewportMinimum || 620;
    var bodyRect = body.getBoundingClientRect(), contentRect = content.getBoundingClientRect();
    var cs = window.getComputedStyle(body), extra = 0, count = 0, scroll = 0;
    // The renderer's minimum SVG budget is 200px. Its 60/40 split and
    // individual plot/axis minima can use up to 210px at that budget. A 16px
    // allowance prevents that rounding/minimum combination creating a second
    // vertical scrollbar. Never measure old SVG heights: a previous tall
    // viewport must not become the minimum height after a resize.
    var plots = 216;
    Array.prototype.forEach.call(body.children, function (child) {
      var style = window.getComputedStyle(child);
      if (style.display === 'none' || style.position === 'absolute' || style.position === 'fixed') return;
      count++;
      if (!child.matches('svg[data-dyn-svg]')) {
        extra += Math.max(child.getBoundingClientRect().height, child.scrollHeight);
        extra += (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
      }
    });
    for (var node = body.parentElement; node && node !== content; node = node.parentElement) scroll += node.scrollTop;
    var above = Math.max(0, bodyRect.top - contentRect.top + scroll);
    var below = Math.max(0, contentRect.bottom - bodyRect.bottom - scroll);
    var padding = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    var gaps = Math.max(0, count - 1) * (parseFloat(cs.rowGap) || 0);
    var measured = Math.ceil(above + below + plots + extra + padding + gaps);
    // Other tabs and their loading screens keep the last Dynamics minimum.
    // Switching tabs must not move the entire analytics/catalogue layout.
    ST.viewportMinimum = measured;
    return measured;
  }

  function fit() {
    tick = null;
    if (destroyed || !shell.isConnected) return;
    // The pixel-sized host can be taller than the part of the iframe actually
    // visible on the board. Restrict our scroll surface to the measured visible
    // band, without reading parent DOM or changing the platform's host/iframe.
    var hostRect = host.getBoundingClientRect();
    var band = ST.visibleBand || { top: 0, bottom: window.innerHeight };
    var top = Math.max(0, band.top - hostRect.top);
    var bottom = Math.min(host.clientHeight, band.bottom - hostRect.top);
    var available = Math.floor(bottom - top);
    if (available <= 0) return;
    var headStyle = window.getComputedStyle(head);
    var headHeight = head.getBoundingClientRect().height +
      (parseFloat(headStyle.marginTop) || 0) + (parseFloat(headStyle.marginBottom) || 0);
    // Like the production layout, retain a useful analytics surface on laptops:
    // the report's filters scroll away, while the dashboard header stays outside
    // this sandbox. On a tall screen the filters and analytics fit together.
    var shellStyle = window.getComputedStyle(shell);
    var layoutAvailable = Math.max(0, available - (parseFloat(shellStyle.paddingTop) || 0) - (parseFloat(shellStyle.paddingBottom) || 0));
    var remaining = Math.max(0, layoutAvailable - headHeight);
    var comfortable = Math.min(800, layoutAvailable);
    // The 800px production target is a comfortable height, not a hard minimum.
    // A wrapped label or fractional line-height must not create a 1–16px scroll
    // on an otherwise fully fitting desktop. Keep the standard 16px tolerance.
    // If scrolling is needed, analytics occupy the entire visible height.
    // Capping that surface at800px left the bottom edge of the header onscreen
    // in taller laptop windows even at the maximum scroll position.
    var target = remaining >= comfortable - 16 ? remaining : layoutAvailable;
    var next = Math.max(usefulHeight(), Math.floor(target));
    var nextHeight = next + 'px', surfaceHeight = available + 'px', surfaceTop = top + 'px';
    if (shell.style.height !== surfaceHeight) shell.style.height = surfaceHeight;
    if (shell.style.top !== surfaceTop) shell.style.top = surfaceTop;
    if (content.style.height !== nextHeight) content.style.height = nextHeight;
  }

  function refresh() {
    if (!destroyed && tick === null) tick = requestAnimationFrame(fit);
  }
  if (typeof ResizeObserver !== 'undefined') {
    // No layout writes in the observer: changing the content can resize its
    // renderers, which have their own observers in the original charts.
    observer = new ResizeObserver(refresh);
    observer.observe(host);
    observer.observe(head);
    observer.observe(panel);
  }
  if (typeof MutationObserver !== 'undefined') {
    mutations = new MutationObserver(refresh);
    mutations.observe(panel, { childList: true, subtree: true });
  }
  window.addEventListener('resize', refresh);
  refresh();
  return {
    shell: shell,
    refresh: refresh,
    destroy: function () {
      destroyed = true;
      if (tick !== null) cancelAnimationFrame(tick);
      if (observer) observer.disconnect();
      if (mutations) mutations.disconnect();
      window.removeEventListener('resize', refresh);
      content.style.height = oldHeight;
      shell.style.height = oldShell.height;
      shell.style.top = oldShell.top;
    }
  };
}
