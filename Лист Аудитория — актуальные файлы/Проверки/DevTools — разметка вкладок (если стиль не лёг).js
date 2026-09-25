// Если вкладки листов после CSS не стали «подчёркнутыми»: открой борд, F12 → Console, вставь всё ниже,
// Enter — и пришли вывод целиком (текстом или скрином). Покажет классы и фоны вкладок и их родителей.
(function () {
  var t = [].slice.call(document.querySelectorAll('[role="tab"], .ant-tabs-tab, [class*="tab"]'))
    .filter(function (e) { return /Использование|Охват|Посещения|Анализ/.test(e.textContent || '') && e.children.length < 6; })[0];
  if (!t) { console.log('вкладку не нашёл — пришли скрин вкладок'); return; }
  var out = [], n = t;
  for (var i = 0; i < 9 && n; i++, n = n.parentElement) {
    var cs = getComputedStyle(n);
    out.push(i + ': <' + n.tagName.toLowerCase() + '> class="' + (n.className && n.className.baseVal == null ? n.className : '') + '"'
      + ' bg=' + cs.backgroundColor + ' radius=' + cs.borderRadius);
  }
  var inner = [].slice.call(t.querySelectorAll('*')).map(function (e) {
    var cs = getComputedStyle(e); return '  └ <' + e.tagName.toLowerCase() + '> class="' + e.className + '" bg=' + cs.backgroundColor;
  });
  console.log(out.concat(inner).join('\n'));
})();
