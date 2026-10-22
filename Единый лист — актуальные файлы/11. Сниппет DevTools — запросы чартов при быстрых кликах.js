// ЗАПРОСЫ ЧАРТОВ (DevTools), версия 2 (2026-10-22): что Proteus делает с расчётом чарта, когда фильтр поменялся, а прежний
// расчёт ещё идёт. Proteus считает АСИНХРОННО: клик отправляет задание (ответ 202 — «принято»), расчёт идёт на сервере,
// готовность приходит отдельным событием, данные забираются по ссылке. Сниппет связывает задание, событие и ссылку и
// показывает по каждому заданию: когда ушло, когда досчиталось, сколько шло и сколько заданий считалось в это же время.
// По этому видно, считаются ли задания параллельно или новое ждёт, пока досчитается старое (очередь на сервере).
// 1. Открыть борд на вкладке с нашими чартами. F12 → Console, слева вверху консоли — «top» (не iframe чарта).
//    Вставить всё, Enter (Chrome при первой вставке просит набрать allow pasting — наберите, Enter, вставьте снова).
//    Если раньше вставлялась первая версия — сначала обновить страницу.
// 2. Сделать 2 прохода, между ними подождать, пока всё досчитается:
//    а) спокойно: применить целевую аудиторию → дождаться панели → клик по отчёту → дождаться;
//    б) быстро: применить другую целевую аудиторию → СРАЗУ, не дожидаясь панели, клик по другому отчёту.
// 3. Когда всё досчитается — набрать в консоли  paReqs()  и Enter. Прислать таблицу целиком (текстом или скрином).
// Только записывает время запросов данных чартов этой страницы: ничего не меняет и никуда не отправляет.
// Снять — обновить страницу.
//
// Proteus Adoption, единый лист. id чартов — тестовый борд; на другом — Ctrl+H id в NAMES.
(function () {
  var NAMES = { '803089': 'шапка', '803049': 'каталог', '803057': 'панель' };
  if (window.__paReq2) { console.log('Запись уже идёт — набери paReqs()'); return; }
  var t0 = performance.now(), log = [], jobs = {}, byUrl = {}, nonces = {}, orig = window.fetch;
  var sec = function (t) { return Math.round((t - t0) / 100) / 10; };
  var dur = function (a, b) { return Math.round((b - a) / 100) / 10; };
  function chartOf(url, body) {
    var s = '';
    try { s = decodeURIComponent(String(url)); } catch (e) { s = String(url); }
    if (typeof body === 'string') s += ' ' + body;
    var m = /"slice_id"\s*:\s*"?(\d+)/.exec(s);
    return m ? m[1] : '?';
  }
  // фильтры запроса (столбцы и значения кросс-фильтров) и метка повтора наших чартов pa_nonce
  function parse(body) {
    var out = [], nonce = '';
    try {
      (JSON.parse(body).queries[0].filters || []).forEach(function (f) {
        var v = [].concat(f.val == null ? [] : f.val);
        if (f.col === 'pa_nonce') { nonce = String(v[0] || ''); return; }
        out.push(f.col + '=' + v.slice(0, 3).join(',') + (v.length > 3 ? '…+' + (v.length - 3) : ''));
      });
    } catch (e) { /* не JSON */ }
    return { filters: out.join('; ').slice(0, 160), nonce: nonce };
  }
  function done(r, how) {
    if (!r || r.done != null) return;
    r.done = performance.now(); r.how = how;
    console.log('■ ' + sec(r.done) + ' с  ' + r.chart + ' #' + r.n + ' — досчитано (' + how + ') за ' + dur(r.start, r.done) + ' с');
  }
  // событие о готовности задания (опрос /api/v1/async_event или веб-сокет): job_id, status, result_url
  function onEvents(list) {
    (list || []).forEach(function (ev) {
      var r = jobs[ev && ev.job_id];
      if (!r) return;
      if (ev.status === 'done') done(r, 'событие');
      else if (ev.status === 'error') { r.err = 'ошибка'; done(r, 'ошибка'); }
      else if (ev.status === 'running' && r.run == null) r.run = performance.now();
    });
  }
  window.__paReq2 = orig;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '', method = ((init && init.method) || 'GET').toUpperCase();
    var p = orig.apply(this, arguments);
    if (url.indexOf('/api/v1/async_event') >= 0) {
      p.then(function (res) { res.clone().json().then(function (j) { onEvents(j && j.result); }, function () {}); }, function () {});
      return p;
    }
    if (url.indexOf('/api/v1/chart/data') < 0) return p;
    var key = url.split('?')[0];
    if (method === 'GET' && byUrl[key]) {   // забрали готовые данные задания
      var rr = byUrl[key];
      done(rr, 'забрали данные');
      p.then(function () { rr.fetched = performance.now(); }, function () {});
      return p;
    }
    if (method !== 'POST') return p;
    var body = init && typeof init.body === 'string' ? init.body : '', id = chartOf(url, body), now = performance.now(), f = parse(body);
    var resend = !!f.nonce && !nonces[f.nonce];   // новая метка — это повтор, который только что запросил наш чарт
    if (f.nonce && !nonces[f.nonce]) nonces[f.nonce] = now;
    if (f.nonce && now - nonces[f.nonce] < 1500) resend = true;
    var same = log.filter(function (x) { return x.id === id && x.done == null; }).map(function (x) { return '#' + x.n; });
    var all = log.filter(function (x) { return x.done == null; }).length;
    var r = { n: log.length + 1, id: id, chart: NAMES[id] || id, start: now, done: null, how: '', filters: f.filters, resend: resend,
      same: same.join(' '), all: all };
    log.push(r);
    console.log('▶ ' + sec(now) + ' с  ' + r.chart + ' #' + r.n + (resend ? ' (ПОВТОР нашего чарта)' : '') +
      (same.length ? '  — у этого чарта ещё считается ' + same.join(' ') : '') + (all ? '  · всего заданий в работе: ' + all : ''));
    p.then(function (res) {
      r.code = res.status;
      if (res.status === 202) {
        res.clone().json().then(function (j) {
          if (j && j.job_id) jobs[j.job_id] = r;
          if (j && j.result_url) byUrl[String(j.result_url).split('?')[0]] = r;
        }, function () {});
      } else done(r, res.ok ? 'сразу, ' + res.status : 'ошибка ' + res.status);
    }, function (err) { done(r, err && err.name === 'AbortError' ? 'ОТМЕНЁН' : 'сбой'); });
    return p;
  };
  // веб-сокет (если Proteus шлёт события о готовности так, а не опросом)
  if (window.WebSocket && !window.WebSocket.__pa) {
    var WS = window.WebSocket;
    var Wrap = function (u, pr) {
      var ws = pr === undefined ? new WS(u) : new WS(u, pr);
      ws.addEventListener('message', function (m) {
        try { var j = JSON.parse(m.data); onEvents(Array.isArray(j) ? j : [j]); } catch (e) { /* не JSON */ }
      });
      return ws;
    };
    Wrap.prototype = WS.prototype; Wrap.__pa = true;
    ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k) { Wrap[k] = WS[k]; });
    window.WebSocket = Wrap;
  }
  window.paReqs = function () {
    console.table(log.map(function (r) {
      return { '#': r.n, 'чарт': r.chart, 'повтор': r.resend ? 'да' : '', 'ушёл, с': sec(r.start), 'ответ': r.code || '—',
        'досчитано, с': r.done == null ? '—' : sec(r.done), 'шёл, с': r.done == null ? '—' : dur(r.start, r.done), 'как': r.how,
        'у чарта ещё считались': r.same, 'всего заданий в работе': r.all, 'фильтры': r.filters };
    }));
    return log.length + ' заданий';
  };
  console.log('Запись заданий чартов включена (версия 2). Сделай оба прохода, потом набери paReqs()');
})();
