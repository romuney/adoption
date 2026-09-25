// Проба платформы: может ли виджет вывести выпадашку за границы своей ячейки.
// Временный чарт react_sanbbox на любом датасете (лимит строк 1). После пробы — удалить.
var option = { series: [{ type: 'scatter', data: [] }] };
(function () {
  var hs = document.querySelectorAll('[_echarts_instance_]');
  var host = hs[hs.length - 1];
  if (!host) return;
  var cv = host.querySelector('canvas'); if (cv) cv.style.display = 'none';
  var old = host.querySelector('.pa-probe'); if (old) old.parentNode.removeChild(old);
  host.style.position = 'relative';
  var box = document.createElement('div');
  box.className = 'pa-probe';
  box.style.cssText = 'position:absolute;left:0;right:0;top:0;min-height:100%;box-sizing:border-box;padding:10px 12px;font:12px/1.5 Inter,Arial,sans-serif;color:#1f2430;background:#fff;';
  host.appendChild(box);
  var rows = [];
  var add = function (k, v) { rows.push('<tr><td style="color:#6b7280;padding-right:12px;white-space:nowrap">' + k + '</td><td><b>' + String(v).replace(/</g, '&lt;') + '</b></td></tr>'); };
  var fe = null, feErr = '';
  try { fe = window.frameElement; } catch (e) { feErr = e.name; }
  add('1. внутри iframe', window.self !== window.top ? 'да' : 'нет');
  add('2. frameElement', fe ? 'доступен' : ('нет' + (feErr ? ' (' + feErr + ')' : '')));
  add('3. sandbox', fe ? (fe.getAttribute('sandbox') || '(атрибут пуст/нет)') : '—');
  var pd = null;
  try { pd = window.parent.document; add('4. parent.document', 'доступен'); } catch (e) { add('4. parent.document', 'нет (' + e.name + ')'); }
  add('5. размер iframe', window.innerWidth + '×' + window.innerHeight);
  var chain = [];
  if (fe) { var n = fe; for (var i = 0; i < 8 && n; i++) { chain.push(n.tagName.toLowerCase() + (n.className && typeof n.className === 'string' ? '.' + n.className.split(' ').slice(0, 2).join('.') : '') + (n.id ? '#' + n.id : '')); n = n.parentElement; } }
  add('6. родители iframe', chain.join(' ← ') || '—');
  var ids = [];
  if (fe) { var m = fe; for (var j = 0; j < 12 && m; j++) { var a = m.getAttribute && (m.getAttribute('data-test-chart-id') || m.getAttribute('data-chart-id') || (m.id && /chart/i.test(m.id) ? m.id : '')); if (a) ids.push(a); m = m.parentElement; } }
  add('7. id чарта у родителей', ids.join(', ') || '—');
  box.innerHTML = '<div style="font-weight:600;margin-bottom:6px">Проба: выпадашка за границы чарта</div>' +
    '<table style="border-collapse:collapse">' + rows.join('') + '</table>' +
    '<div style="margin-top:10px"><button id="pa-grow" type="button" style="height:30px;padding:0 12px;border:1px solid #0073A0;background:#0073A0;color:#fff;border-radius:8px;cursor:pointer">8. Растянуть на 420 px вниз</button> ' +
    '<span id="pa-res" style="color:#6b7280"></span></div>' +
    '<div id="pa-tail" style="display:none;margin-top:10px;height:300px;border:2px dashed #e0a100;border-radius:8px;background:#fffaf1;padding:8px">Если эта жёлтая область видна ПОВЕРХ чартов ниже и они не сдвинулись — костыль рабочий.</div>';
  var open = false;
  box.querySelector('#pa-grow').addEventListener('click', function () {
    var res = box.querySelector('#pa-res'), tail = box.querySelector('#pa-tail');
    open = !open;
    tail.style.display = open ? 'block' : 'none';
    host.style.overflow = open ? 'visible' : ''; document.body.style.overflow = open ? 'visible' : '';
    if (!fe) { res.textContent = 'нет frameElement — растянуть изнутри нельзя'; return; }
    try {
      var h = fe.getBoundingClientRect().height;
      fe.style.position = open ? 'relative' : '';
      fe.style.zIndex = open ? '1000' : '';
      fe.style.height = open ? (h + 420) + 'px' : '';
      var p = fe.parentElement;
      for (var k = 0; k < 6 && p; k++) { p.style.overflow = open ? 'visible' : ''; p.style.zIndex = open ? '1000' : ''; if (open && getComputedStyle(p).position === 'static') p.style.position = 'relative'; p = p.parentElement; }
      res.textContent = open ? 'сделано: iframe ' + Math.round(h) + ' → ' + Math.round(h + 420) + ' px' : 'вернул как было';
    } catch (e) { res.textContent = 'ошибка: ' + e.name + ' ' + e.message; }
  });
})();
