function installInteraction(shell, ST) {
  // One sandbox owns the layout and the tour. Neither action emits a data filter.
  var content = shell.querySelector('.pa-next-content');
  var catalog = shell.querySelector('[data-pa-next-host="cat"]');
  var panel = shell.querySelector('[data-pa-next-host="one"]');
  var storageKey = 'proteus-adoption-next-layout-v1', saved = ST.layout;
  if (!saved) {
    try { saved = JSON.parse(window.localStorage.getItem(storageKey) || 'null'); } catch (ignore) { /* opaque sandbox */ }
  }
  var layout = ST.layout = {
    ratio: saved && isFinite(+saved.ratio) && +saved.ratio >= 0.1 && +saved.ratio <= 0.9 ? +saved.ratio : 0.38,
    hidden: !!(saved && saved.hidden)
  };
  var style = document.createElement('style');
  style.textContent = '.pa-next-cat-toggle{display:inline-flex;align-items:center;justify-content:center;flex:0 0 28px;width:28px;height:28px;padding:0;border:0;border-radius:8px;background:transparent;color:#8a909c;cursor:pointer;touch-action:manipulation}' +
    '.pa-next-cat-toggle:hover{background:#eef0f3;color:#245fd4}.pa-next-cat-toggle:focus-visible,.pa-next-catalog-rail:focus-visible{outline:2px solid #245fd4;outline-offset:-2px}.pa-next-cat-toggle svg,.pa-next-catalog-rail svg{flex:none;pointer-events:none}' +
    '.pa-next-cat .prb-panel-h{position:relative;padding-right:54px}.pa-next-cat .prb-panel-h>.pa-next-cat-toggle{position:absolute;right:14px;top:14px}.pa-next-cat .prb-panel-h .prb-psearch{min-width:90px}' +
    '.pa-next-cat .prb-h-txt>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}@container pa-next-cat (max-width:400px){.pa-next-cat .prb-panel-h{flex-wrap:wrap}.pa-next-cat .prb-h-txt{flex:1;min-width:0}.pa-next-cat .prb-panel-h .prb-psearch{flex:1 0 100%;margin-left:0}}' +
    '.pa-next-catalog-rail{display:none;grid-column:1;grid-row:1;align-items:center;gap:14px;flex-direction:column;box-sizing:border-box;width:34px;min-height:0;height:100%;padding:14px 4px;border:0;border-radius:12px;background:#fff;color:#8a909c;font:12px Arial,Helvetica,sans-serif;cursor:pointer;touch-action:manipulation}' +
    '.pa-next-catalog-rail:hover{background:#f0f4fc;color:#245fd4}.pa-next-catalog-rail span{writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;letter-spacing:.3px}.pa-next-cat{grid-column:1;grid-row:1}.pa-next-one{grid-column:3;grid-row:1}' +
    '.pa-next-splitter{grid-column:2;grid-row:1;position:relative;min-width:12px;cursor:col-resize;touch-action:none;align-self:stretch;z-index:35}' +
    '.pa-next-splitter:before{content:"";position:absolute;width:2px;height:44px;left:5px;top:calc(50% - 22px);border-radius:4px;background:#d8dde4}' +
    '.pa-next-splitter:hover:before,.pa-next-splitter:focus-visible:before{background:#245fd4}.pa-next-splitter:focus-visible{outline:2px solid #245fd4;outline-offset:-2px}' +
    '.pa-next-shell.pa-next-resizing,.pa-next-shell.pa-next-resizing *{cursor:col-resize!important;user-select:none!important}.pa-next-shell.pa-next-catalog-hidden .pa-next-cat,.pa-next-shell.pa-next-catalog-hidden .pa-next-splitter{display:none!important}.pa-next-shell.pa-next-catalog-hidden .pa-next-catalog-rail{display:flex}' +
    '.pa-next-tour{display:block;padding:0;background:transparent;font:12.5px/1.55 Arial,Helvetica,sans-serif;color:#23272e;overflow:hidden}' +
    '.pa-next-tour .pa-next-tour-ring{position:fixed;box-sizing:border-box;border:2px solid #245fd4;border-radius:10px;padding:0;max-width:none;max-height:none;overflow:visible;background:transparent;box-shadow:0 0 0 9999px rgba(35,39,46,.57);pointer-events:none}' +
    '.pa-next-tour.pa-next-tour-intro{background:rgba(35,39,46,.57)}.pa-next-tour.pa-next-tour-intro .pa-next-tour-ring{display:none}' +
    '.pa-next-tour .pa-next-tour-card{position:fixed;box-sizing:border-box;margin:0;padding:16px;border-radius:12px;background:#fff;width:360px;max-width:calc(100vw - 24px);overflow:auto;overscroll-behavior:contain;box-shadow:0 8px 32px rgba(0,0,0,.2);font:12.5px/1.55 Arial,Helvetica,sans-serif}' +
    '.pa-next-tour .pa-next-tour-top{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#8a909c;font-size:11.5px}.pa-next-tour h2{font-size:14.5px;line-height:1.4;margin:8px 0;color:#23272e}.pa-next-tour p{margin:0 0 12px}' +
    '.pa-next-tour .pa-next-tour-actions{display:flex;justify-content:space-between;gap:8px;margin-top:16px}.pa-next-tour button{font:12px Arial,Helvetica,sans-serif;min-height:34px;padding:6px 12px;border:1px solid #e7e9ee;background:#fff;color:#454b55;border-radius:8px;cursor:pointer;touch-action:manipulation}' +
    '.pa-next-tour button:hover{border-color:#245fd4;color:#245fd4}.pa-next-tour button:focus-visible{outline:2px solid #245fd4;outline-offset:2px}.pa-next-tour button[data-tour-action="next"]{background:#245fd4;color:white;border-color:#245fd4}.pa-next-tour button[data-tour-action="close"]{min-width:34px;padding:4px}.pa-next-tour button:disabled{visibility:hidden}';
  shell.appendChild(style);
  var rail = document.createElement('button'); rail.type = 'button'; rail.className = 'pa-next-catalog-rail';
  rail.setAttribute('data-layout', 'expand'); rail.setAttribute('aria-label', 'Развернуть каталог');
  rail.setAttribute('title', 'Развернуть каталог'); rail.setAttribute('aria-expanded', 'false');
  rail.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg><span aria-hidden="true">Каталог</span>';
  content.insertBefore(rail, catalog);
  var splitter = document.createElement('div'); splitter.className = 'pa-next-splitter';
  splitter.tabIndex = 0; splitter.setAttribute('role', 'separator'); splitter.setAttribute('aria-orientation', 'vertical');
  splitter.setAttribute('aria-label', 'Ширина каталога');
  splitter.setAttribute('title', 'Потяни для изменения ширины. Стрелки ← → — изменить, Home — сузить, End — расширить.');
  catalog.id = catalog.id || 'pa-next-catalog';
  splitter.setAttribute('aria-controls', catalog.id);
  rail.setAttribute('aria-controls', catalog.id);
  content.insertBefore(splitter, panel);
  var destroyed = false, drag = null, tour = null, resizeObserver = null, resizeTick = null;
  var oldGrid = content.style.gridTemplateColumns, oldGap = content.style.gap;
  content.style.gap = '0';
  function persist() {
    try { window.localStorage.setItem(storageKey, JSON.stringify(layout)); } catch (ignore) { /* session state still persists */ }
  }
  function size() {
    var css = window.getComputedStyle(content);
    var width = Math.max(0, content.clientWidth - (parseFloat(css.paddingLeft) || 0) - (parseFloat(css.paddingRight) || 0));
    return { width: width, min: 280, max: Math.max(280, width - 392) };
  }
  function paint() {
    if (destroyed) return;
    var s = size(), width = Math.round(Math.max(s.min, Math.min(s.max, s.width * layout.ratio)));
    shell.classList.toggle('pa-next-catalog-hidden', layout.hidden);
    content.style.gridTemplateColumns = layout.hidden ? '34px 12px minmax(380px,1fr)' : width + 'px 12px minmax(380px,1fr)';
    splitter.setAttribute('aria-valuemin', String(s.min)); splitter.setAttribute('aria-valuemax', String(s.max));
    splitter.setAttribute('aria-valuenow', String(width)); splitter.setAttribute('aria-valuetext', width + ' пикселей');
    if (tour) placeTour();
  }
  function setWidth(width) {
    var s = size();
    layout.ratio = Math.max(s.min, Math.min(s.max, width)) / Math.max(1, s.width);
    paint();
  }
  function settleResize() {
    // The existing renderers synchronously fit their SVG viewBox on window resize.
    // Use this only after a discrete layout action, never from paint/ResizeObserver.
    // Pointer moves retain the renderer's debounced path until the drag ends.
    if (!destroyed) window.dispatchEvent(new Event('resize'));
  }
  function adjust(amount) { setWidth(catalog.getBoundingClientRect().width + amount); settleResize(); persist(); }
  function toggleCatalog() {
    layout.hidden = !layout.hidden;
    paint(); settleResize(); persist();
    var target = layout.hidden ? rail : catalog.querySelector('.pa-next-cat-toggle');
    if (target) target.focus({ preventScroll: true });
  }
  function catalogToggle(ev) {
    var node = ev.target;
    while (node && node !== shell && (!node.getAttribute || !node.getAttribute('data-layout'))) node = node.parentNode;
    if (!node || node === shell) return;
    var action = node.getAttribute('data-layout');
    if (action === 'collapse' || action === 'expand') {
      ev.preventDefault(); ev.stopPropagation(); toggleCatalog();
    }
  }
  shell.addEventListener('click', catalogToggle, true);
  function splitterKey(ev) {
    var s = size(), key = ev.key || '', amount = ev.shiftKey ? 80 : 24;
    if (key === 'ArrowLeft') adjust(-amount);
    else if (key === 'ArrowRight') adjust(amount);
    else if (key === 'Home') { setWidth(s.min); settleResize(); persist(); }
    else if (key === 'End') { setWidth(s.max); settleResize(); persist(); }
    else if (key === 'Enter') toggleCatalog();
    else return;
    ev.preventDefault(); ev.stopPropagation();
  }
  splitter.addEventListener('keydown', splitterKey);
  function dragStart(ev) {
    if (ev.button !== undefined && ev.button !== 0) return;
    ev.preventDefault();
    drag = { id: ev.pointerId, x: ev.clientX, width: catalog.getBoundingClientRect().width };
    splitter.focus({ preventScroll: true });
    shell.classList.add('pa-next-resizing');
    if (splitter.setPointerCapture) { try { splitter.setPointerCapture(ev.pointerId); } catch (ignore) { /* detached pointer */ } }
  }
  function dragMove(ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    ev.preventDefault(); setWidth(drag.width + ev.clientX - drag.x);
  }
  function dragEnd(ev) {
    if (!drag || (ev && ev.pointerId !== undefined && ev.pointerId !== drag.id)) return;
    drag = null; shell.classList.remove('pa-next-resizing'); settleResize(); persist();
  }
  splitter.addEventListener('pointerdown', dragStart);
  window.addEventListener('pointermove', dragMove);
  window.addEventListener('pointerup', dragEnd);
  window.addEventListener('pointercancel', dragEnd);
  splitter.addEventListener('lostpointercapture', dragEnd);
  window.addEventListener('blur', dragEnd);
  function refresh() {
    if (resizeTick !== null) return;
    resizeTick = requestAnimationFrame(function () { resizeTick = null; paint(); });
  }
  window.addEventListener('resize', refresh);
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(refresh); resizeObserver.observe(content);
  }
  function visibleTarget(selector) {
    var nodes = shell.querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getBoundingClientRect().width && nodes[i].getBoundingClientRect().height && window.getComputedStyle(nodes[i]).visibility !== 'hidden') return nodes[i];
    }
    return null;
  }
  function tourSteps() {
    return [
      { title: 'Proteus Adoption за минуту', text: 'Сверху — период и условия расчёта. Слева выбирай отчёты, коллекции или владельцев, справа исследуй их аудиторию. Этот гид покажет элементы текущего экрана.' },
      { selector: '.phead-strip-seg', title: 'Период анализа', text: 'Выбери дни, недели, месяцы или кварталы. Для собственного диапазона открой календарь. Период применяется к каталогу и аналитике.' },
      { selector: '.phead-togs', title: 'Что считать', text: 'Условия публикации, активности и исключения уточняют расчёт. Выбор сверху применяется к обеим частям отчёта.' },
      { selector: '.phead-bar', title: 'Целевая аудитория', text: 'Выбери условия целевой аудитории. Сначала собери нужные значения, затем нажми «Применить». Кнопка сброса снимает эти условия.' },
      { selector: '[data-pa-next-host="cat"] [data-mode]', parent: true, title: 'Разрезы каталога', text: 'Переключай отчёты, коллекции, владельцев и аудиторию. Действующие фильтры сохраняются, поэтому разрезы показывают связанные с твоим выбором данные.' },
      { selector: '[data-pa-next-host="cat"] input[data-search]', title: 'Найти в каталоге', text: 'Введи часть названия, чтобы найти нужную строку в выбранном разрезе. Поиск не меняет фильтры аналитики.' },
      { selector: '[data-pa-next-host="cat"] tr[data-rep], [data-pa-next-host="cat"] tr[data-sel]', title: 'Выбор области', text: 'Нажми строку, чтобы посмотреть её аналитику справа. Повторный клик снимает выбор. Выбор людей в аналитике, в свою очередь, уточняет каталог.' },
      { selector: '.pa-next-splitter', title: 'Ширина каталога', text: 'Потяни разделитель влево или вправо. Когда разделитель в фокусе, его можно двигать стрелками на клавиатуре; Home и End задают крайние положения.' },
      { selector: '.pa-next-cat-toggle', title: 'Только аналитика', text: 'Каретка в шапке каталога сворачивает его в узкую полосу слева. Нажми эту полосу, чтобы вернуть каталог с прежним выбором и шириной.' },
      { selector: '.pone-kpis', title: 'Показатели', text: 'Эти показатели относятся к текущему периоду, выбранной области и условиям аудитории. Подсказки рядом с названиями объясняют расчёт.' },
      { selector: '.pone-obs', title: 'Что видно в данных', text: 'Наблюдения помогают прочитать показатели: где вырос интерес и как меняется использование. Они рассчитываются по тем же данным отчёта.' },
      { selector: '[data-pa-next-host="one"] [data-view^="view:"]', parent: true, title: 'Вкладки аналитики', text: 'Динамика показывает изменение по периодам, календарь — посещения по дням. Путь ЦА, «Кто смотрит» и закрепляемость раскрывают детали. Ещё не полученные детали догружаются в своей вкладке.' },
      { selector: '[data-tourstart]', title: 'Гид всегда под рукой', text: 'Нажми «Как работать», чтобы пройти гид снова. Escape закрывает его, стрелки ← → переключают шаги.' }
    ].filter(function (step) { return !step.selector || visibleTarget(step.selector); });
  }
  function band() {
    var b = ST.visibleBand || { top: 0, bottom: window.innerHeight };
    var top = Math.max(0, b.top), bottom = Math.min(window.innerHeight, b.bottom);
    return bottom > top + 100 ? { top: top, bottom: bottom } : { top: 0, bottom: window.innerHeight };
  }
  function placeTour() {
    if (!tour) return;
    var step = tour.steps[tour.index], target = step.selector ? visibleTarget(step.selector) : null;
    if (target && step.parent) target = target.parentNode;
    var b = band(), w = window.innerWidth, targetRect = target ? target.getBoundingClientRect() : null;
    var r = targetRect ? {
      left: Math.max(4, targetRect.left - 4), right: Math.min(w - 4, targetRect.right + 4),
      top: Math.max(b.top + 4, targetRect.top - 4), bottom: Math.min(b.bottom - 4, targetRect.bottom + 4)
    } : null;
    if (r && (r.bottom <= r.top || r.right <= r.left)) r = null;
    tour.layer.classList.toggle('pa-next-tour-intro', !r);
    if (r) {
      tour.ring.style.left = r.left + 'px'; tour.ring.style.top = r.top + 'px';
      tour.ring.style.width = (r.right - r.left) + 'px'; tour.ring.style.height = (r.bottom - r.top) + 'px';
    }
    var card = tour.card;
    card.style.maxHeight = Math.max(100, b.bottom - b.top - 24) + 'px';
    var cw = card.offsetWidth, ch = card.offsetHeight;
    var left = (w - cw) / 2, top = b.top + (b.bottom - b.top - ch) / 2;
    if (r) {
      left = Math.max(12, Math.min(w - cw - 12, r.left + (r.right - r.left - cw) / 2));
      if (r.bottom + 12 + ch <= b.bottom - 12) top = r.bottom + 12;
      else if (r.top - 12 - ch >= b.top + 12) top = r.top - 12 - ch;
      else if (r.right + 12 + cw <= w - 12) { left = r.right + 12; top = r.top; }
      else if (r.left - 12 - cw >= 12) { left = r.left - 12 - cw; top = r.top; }
    }
    card.style.left = Math.max(12, Math.min(w - cw - 12, left)) + 'px';
    card.style.top = Math.max(b.top + 12, Math.min(b.bottom - ch - 12, top)) + 'px';
  }
  function showStep(index) {
    if (!tour) return;
    if (index < 0) return;
    if (index >= tour.steps.length) { closeTour(); return; }
    tour.index = index;
    var step = tour.steps[index], target = step.selector ? visibleTarget(step.selector) : null;
    if (step.selector && !target) { showStep(index + (index < tour.previous ? -1 : 1)); return; }
    tour.previous = index;
    if (target) target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    tour.layer.setAttribute('data-tour-step', String(index + 1));
    tour.layer.querySelector('[data-tour-count]').textContent = 'Как работать · ' + (index + 1) + ' из ' + tour.steps.length;
    tour.layer.querySelector('h2').textContent = step.title;
    tour.layer.querySelector('[data-tour-text]').textContent = step.text;
    tour.layer.querySelector('[data-tour-action="back"]').disabled = index === 0;
    var next = tour.layer.querySelector('[data-tour-action="next"]');
    next.textContent = index === tour.steps.length - 1 ? 'Готово' : index === 0 ? 'Начать' : 'Далее';
    placeTour();
    next.focus({ preventScroll: true });
  }
  function closeTour() {
    if (!tour) return;
    var previous = tour; tour = null;
    clearInterval(previous.timer);
    previous.layer.parentNode.removeChild(previous.layer);
    previous.inert.forEach(function (item) { item.node.inert = item.value; });
    layout.hidden = previous.hidden; paint(); settleResize();
    content.scrollLeft = previous.scrollLeft;
    if (previous.focus && previous.focus.isConnected && previous.focus.focus) previous.focus.focus({ preventScroll: true });
  }
  function tourKey(ev) {
    if (!tour) return;
    var key = ev.key || '';
    if (key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closeTour(); }
    else if (key === 'ArrowRight') { ev.preventDefault(); ev.stopPropagation(); showStep(tour.index + 1); }
    else if (key === 'ArrowLeft') { ev.preventDefault(); ev.stopPropagation(); showStep(tour.index - 1); }
    else if (key === 'Tab') {
      var buttons = Array.prototype.filter.call(tour.card.querySelectorAll('button'), function (button) { return !button.disabled; });
      var i = buttons.indexOf(document.activeElement), next = ev.shiftKey ? (i <= 0 ? buttons.length - 1 : i - 1) : (i + 1) % buttons.length;
      ev.preventDefault(); buttons[next].focus({ preventScroll: true });
    }
  }
  function help() {
    if (tour || destroyed) return;
    var focus = document.activeElement, hidden = layout.hidden, scrollLeft = content.scrollLeft;
    layout.hidden = false; paint(); settleResize();
    var layer = document.createElement('div'); layer.className = 'pa-next-help pa-next-tour pa-next-tour-intro';
    layer.innerHTML = '<div class="pa-next-tour-ring" aria-hidden="true"></div>' +
      '<div class="pa-next-tour-card" role="dialog" aria-modal="true" aria-labelledby="pa-next-tour-title" aria-describedby="pa-next-tour-text">' +
      '<div class="pa-next-tour-top"><span data-tour-count></span><button type="button" data-tour-action="close" aria-label="Закрыть гид">×</button></div>' +
      '<div aria-live="polite" aria-atomic="true"><h2 id="pa-next-tour-title"></h2><p id="pa-next-tour-text" data-tour-text></p></div>' +
      '<div class="pa-next-tour-actions"><button type="button" data-tour-action="back">Назад</button><button type="button" data-tour-action="next">Начать</button></div></div>';
    var inert = [];
    Array.prototype.forEach.call(shell.children, function (node) {
      if (node.tagName !== 'STYLE') { inert.push({ node: node, value: node.inert }); node.inert = true; }
    });
    shell.appendChild(layer);
    tour = { layer: layer, card: layer.querySelector('.pa-next-tour-card'), ring: layer.querySelector('.pa-next-tour-ring'),
      steps: tourSteps(), index: 0, previous: 0, focus: focus, hidden: hidden, scrollLeft: scrollLeft, inert: inert };
    layer.addEventListener('click', function (ev) {
      var action = ev.target.getAttribute('data-tour-action');
      if (action === 'close') closeTour();
      else if (action === 'back') showStep(tour.index - 1);
      else if (action === 'next') showStep(tour.index + 1);
    });
    tour.timer = setInterval(placeTour, 200);
    showStep(0);
  }
  window.addEventListener('keydown', tourKey, true);
  window.addEventListener('scroll', refresh, true);
  paint();
  return { help: help, refresh: refresh, destroy: function () {
    closeTour(); destroyed = true; dragEnd();
    if (resizeObserver) resizeObserver.disconnect();
    if (resizeTick !== null) cancelAnimationFrame(resizeTick);
    window.removeEventListener('resize', refresh);
    window.removeEventListener('scroll', refresh, true);
    window.removeEventListener('keydown', tourKey, true);
    window.removeEventListener('pointermove', dragMove);
    window.removeEventListener('pointerup', dragEnd);
    window.removeEventListener('pointercancel', dragEnd);
    window.removeEventListener('blur', dragEnd);
    shell.removeEventListener('click', catalogToggle, true);
    [rail, splitter, style].forEach(function (node) { if (node.parentNode) node.parentNode.removeChild(node); });
    content.style.gridTemplateColumns = oldGrid; content.style.gap = oldGap;
  } };
}
