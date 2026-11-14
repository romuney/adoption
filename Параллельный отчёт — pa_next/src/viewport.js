function installViewport(shell, ST) {
  var head = shell.querySelector('.pa-next-head');
  var content = shell.querySelector('.pa-next-content');
  var destroyed = false, tick = null, observer = null;
  var oldHeight = content.style.height;
  var height = -1;

  function fit() {
    tick = null;
    if (destroyed || !shell.isConnected) return;
    // Measure this sandbox's actual host, never the parent window. The platform
    // can mount the chart in a short cell or an iframe taller than the viewport.
    var available = shell.clientHeight;
    if (!available) return;
    var headStyle = window.getComputedStyle(head);
    var headHeight = head.getBoundingClientRect().height +
      (parseFloat(headStyle.marginTop) || 0) + (parseFloat(headStyle.marginBottom) || 0);
    // Like the production layout, retain a useful analytics surface on laptops:
    // the report's filters scroll away, while the dashboard header stays outside
    // this sandbox. On a tall screen the filters and analytics fit together.
    var remaining = Math.max(0, available - headHeight);
    var target = Math.min(800, available);
    // The 800px production target is a comfortable height, not a hard minimum.
    // A wrapped label or fractional line-height must not create a 1–16px scroll
    // on an otherwise fully fitting desktop. Keep the standard 16px tolerance.
    var next = Math.floor(remaining >= target - 16 ? remaining : target);
    if (next === height) return;
    height = next;
    content.style.height = next + 'px';
  }

  function refresh() {
    if (!destroyed && tick === null) tick = requestAnimationFrame(fit);
  }
  if (typeof ResizeObserver !== 'undefined') {
    // No layout writes in the observer: changing the content can resize its
    // renderers, which have their own observers in the original charts.
    observer = new ResizeObserver(refresh);
    observer.observe(shell);
    observer.observe(head);
  }
  window.addEventListener('resize', refresh);
  refresh();
  return {
    refresh: refresh,
    destroy: function () {
      destroyed = true;
      if (tick !== null) cancelAnimationFrame(tick);
      if (observer) observer.disconnect();
      window.removeEventListener('resize', refresh);
      content.style.height = oldHeight;
    }
  };
}
