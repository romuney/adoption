// ЗАПРОСЫ ЧАРТОВ (DevTools): что Proteus делает с запросом чарта, когда фильтр поменялся, а прежний запрос ещё считается.
// Отвечает на три вопроса: (1) новый запрос уходит сразу по клику или после старого; (2) старый отменяется или
// досчитывается; (3) сколько секунд идёт каждый — и не ждёт ли новый, пока сервер досчитает старый.
// 1. Открыть борд на вкладке с нашими чартами. F12 → Console, слева вверху консоли — «top» (не iframe чарта).
//    Вставить всё, Enter (Chrome при первой вставке просит набрать allow pasting — наберите, Enter, вставьте снова).
// 2. Повторить сценарий: применить целевую аудиторию → НЕ дожидаясь панели справа — клик по отчёту в каталоге.
// 3. Когда всё досчитается — набрать в консоли  paReqs()  и Enter. Прислать таблицу целиком (текстом или скрином).
// Только записывает время запросов данных чартов этой страницы: ничего не меняет и никуда не отправляет.
// Снять — обновить страницу.
//
// Proteus Adoption, единый лист (2026-10-22). id чартов — тестовый борд; на другом — Ctrl+H id в NAMES.
(function () {
  var NAMES = { '803089': 'шапка', '803049': 'каталог', '803057': 'панель' };
  if (window.__paReq) { console.log('Запись уже идёт — набери paReqs()'); return; }
  var t0 = performance.now(), log = [], orig = window.fetch;
  var sec = function (t) { return Math.round((t - t0) / 100) / 10; };
  function chartOf(url, body) {
    var s = '';
    try { s = decodeURIComponent(String(url)); } catch (e) { s = String(url); }
    if (typeof body === 'string') s += ' ' + body;
    var m = /"slice_id"\s*:\s*"?(\d+)/.exec(s);
    return m ? m[1] : '?';
  }
  // какие фильтры ушли (столбцы и значения кросс-фильтров) — чтобы видеть «под какой клик» запрос
  function filtersOf(body) {
    try {
      var q = JSON.parse(body).queries[0], out = [];
      (q.filters || []).forEach(function (f) {
        var v = [].concat(f.val == null ? [] : f.val);
        out.push(f.col + '=' + v.slice(0, 3).join(',') + (v.length > 3 ? '…+' + (v.length - 3) : ''));
      });
      return out.join('; ').slice(0, 160);
    } catch (e) { return ''; }
  }
  window.__paReq = orig;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('/api/v1/chart/data') < 0) return orig.apply(this, arguments);
    var body = init && typeof init.body === 'string' ? init.body : '';
    var id = chartOf(url, body), name = NAMES[id] || id, now = performance.now();
    var busy = log.filter(function (r) { return r.id === id && r.end == null; }).map(function (r) { return '#' + r.n; });
    var r = { n: log.length + 1, id: id, chart: name, start: now, end: null, status: 'идёт', filters: filtersOf(body),
      nonce: body.indexOf('pa_nonce') >= 0, busy: busy.join(' ') };
    log.push(r);
    console.log('▶ ' + sec(now) + ' с  ' + name + ' #' + r.n + (r.nonce ? ' (повтор нашего чарта)' : '') +
      (busy.length ? '  — ещё считается ' + busy.join(' ') + ' этого чарта' : ''));
    return orig.apply(this, arguments).then(function (res) {
      r.end = performance.now(); r.status = res.ok ? 'ответ ' + res.status : 'ошибка ' + res.status;
      console.log('■ ' + sec(r.end) + ' с  ' + name + ' #' + r.n + ' — ' + r.status + ' за ' + sec(r.end - r.start + t0) + ' с');
      return res;
    }, function (err) {
      r.end = performance.now(); r.status = err && err.name === 'AbortError' ? 'ОТМЕНЁН' : 'сбой: ' + (err && err.message);
      console.log('✕ ' + sec(r.end) + ' с  ' + name + ' #' + r.n + ' — ' + r.status);
      throw err;
    });
  };
  window.paReqs = function () {
    console.table(log.map(function (r) {
      return { '#': r.n, 'чарт': r.chart, 'ушёл, с': sec(r.start), 'пришёл, с': r.end == null ? '—' : sec(r.end),
        'шёл, с': r.end == null ? '—' : sec(r.end - r.start + t0), 'итог': r.status, 'в это время считался': r.busy || '',
        'наш повтор': r.nonce ? 'да' : '', 'фильтры': r.filters };
    }));
    return log.length + ' запросов';
  };
  console.log('Запись запросов чартов включена. Повтори сценарий, потом набери paReqs()');
})();
