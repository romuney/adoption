// ЛЕНТА СОБЫТИЙ БОРДА (DevTools), версия 5 (2026-10-22): что на самом деле происходит при кликах — по секундам, в одной ленте.
//   v5: paTimes() — из чего сложилось время каждого запроса: отправка (код чарта едет в каждом запросе), расчёт на
//   сервере (очередь + разбор SQL + ClickHouse), забор ответа, размеры в КБ, «из кэша».
//   ФИЛЬТР   — чарт отдал Proteus кросс-фильтр (applyCrossFilter): какие столбцы и значения, метка повтора;
//   СВЕРКА   — служебные сообщения наших чартов (нужен JS 4, 6, 8 от 22.10 и позже): каталог «держу выбор / отправил /
//              повтор не дублирую», панель «пришли данные под …», «прошу повторить»;
//   ЗАДАНИЕ  — запрос данных чарта на сервер (ответ 202 — «принято», считается в фоне) и когда досчиталось;
//   ЗАГРУЗКА — Proteus показал / убрал крутилку загрузки на чарте.
// 1. Открыть борд на вкладке с нашими чартами. F12 → Console, слева вверху консоли — «top» (не iframe чарта).
//    Обновить страницу (если вставлялась прежняя версия), вставить всё, Enter (Chrome при первой вставке просит набрать
//    allow pasting — наберите, Enter, вставьте снова).
// 2. Сценарий: быстро кликнуть 3 разных отчёта в каталоге (по ~0,5 с) и дождаться, пока всё досчитается. Потом — применить
//    другую целевую аудиторию и сразу кликнуть отчёт; дождаться.
// 3. Набрать  paTimes()  и Enter — время по частям (главное);  paLog()  — лента;  paReqs()  — задания. Прислать скрином.
//    Кликать отчёты, которые сегодня ещё НЕ открывались: открытые раньше Proteus отдаёт из кэша («из кэша: да»).
// Только записывает события этой страницы: ничего не меняет и никуда не отправляет. Снять — обновить страницу.
//
// Proteus Adoption, единый лист. id чартов — тестовый борд; на другом — Ctrl+H id в NAMES.
(function () {
  var NAMES = { '803089': 'шапка', '803049': 'каталог', '803057': 'панель' };
  var NS = { phead: 'шапка', prb: 'каталог', pone: 'панель' };
  if (window.__paLog5) { console.log('Запись уже идёт — набери paTimes(), paLog() или paReqs()'); return; }
  window.__paLog5 = true;
  var t0 = performance.now(), ev = [], log = [], jobs = {}, byUrl = {}, nonces = {}, orig = window.fetch;
  var sec = function (t) { return Math.round((t - t0) / 100) / 10; };
  var dur = function (a, b) { return Math.round((b - a) / 100) / 10; };
  var short = function (s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '…' : s; };
  function add(kind, chart, text) {
    var e = { t: performance.now(), kind: kind, chart: chart, text: text };
    ev.push(e);
    console.log(sec(e.t).toFixed(1) + ' с  ' + kind + '  ' + chart + '  ' + text);
  }
  // iframe → id чарта (по классу ячейки dashboard-chart-id-N или контейнеру chart-id-N)
  function chartOfWin(w) {
    var fr = document.querySelectorAll('iframe');
    for (var i = 0; i < fr.length; i++) {
      if (fr[i].contentWindow !== w) continue;
      for (var n = fr[i]; n && n !== document; n = n.parentNode) {
        var c = (n.className && String(n.className)) || '', m = /dashboard-chart-id-(\d+)/.exec(c) || /^chart-id-(\d+)$/.exec(n.id || '');
        if (m) return NAMES[m[1]] || m[1];
      }
      return 'iframe ' + i;
    }
    return '?';
  }
  function fltText(fl) {
    var out = [], nonce = false;
    (fl || []).forEach(function (f) {
      if (f.column === 'pa_nonce') { nonce = true; return; }
      var v = [].concat(f.value == null ? [] : f.value);
      out.push(f.column + '=' + v.slice(0, 3).join(',') + (v.length > 3 ? '…+' + (v.length - 3) : ''));
    });
    return (nonce ? '[ПОВТОР] ' : '') + (out.join('; ') || '(пусто)');
  }
  var DIAG = {
    PA_SEL: function (o) { return 'сообщил соседям новый выбор (' + o.src + '): ' + short(o.key, 90); },
    PA_RESEND: function (o) { return 'ПРОСИТ ' + o.src + ' повторить фильтр'; },
    PA_AUD: function (o) { return 'сообщил каталогу: мой ответ под ' + (o.noflt ? '(нет эха)' : short(o.key, 90)); },
    PA_REP: function (o) { return 'сообщил каталогу: группа «Аудитории» в ответе ' + (o.noflt ? '(нет эха)' : short(o.key, 60)); },
    HOLD: function (o) { return 'ДЕРЖУ выбор ' + short(o.key, 60) + ' — панель ещё считает ' + short(o.busy, 60) + ' (у неё сейчас ' + short(o.panel, 50) + ')'; },
    SEND: function (o) { return 'отправил выбор в Proteus: ' + short(o.key, 80); },
    SEND_RESEND: function (o) { return 'отправил выбор с меткой повтора: ' + short(o.key, 80); },
    RESEND_SKIP: function (o) { return 'повтор не дублирую — этот выбор только что ушёл'; },
    DATA: function (o) { return 'пришли данные' + (o.key ? ' под ' + short(o.key, 90) : ''); },
    PA_PREV: function (o) { return 'отдал панели готовые KPI и «Динамику» по отчёту: ' + short(o.key, 60); },
    PREV: function (o) { return 'ПОКАЗАЛА СРАЗУ по блоку каталога: ' + short(o.key, 60) + ' (свой ответ догонит)'; }
  };
  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.type === 'ECHARTS_APPLY_CROSS_FILTER') add('ФИЛЬТР ', chartOfWin(e.source), fltText(d.filters || (d.payload && d.payload.filters)));
    else if (d.type === 'PA_DIAG' && d.o) add('СВЕРКА ', NS[d.from] || d.from, DIAG[d.o.t] ? DIAG[d.o.t](d.o) : JSON.stringify(d.o));
  });
  // крутилка загрузки Proteus на ячейке чарта
  var spin = {};
  setInterval(function () {
    Object.keys(NAMES).forEach(function (id) {
      var cell = document.querySelector('.dashboard-chart-id-' + id) || document.getElementById('chart-id-' + id);
      if (!cell) return;
      var on = !!cell.querySelector('.loading, [alt="Loading..."], [aria-label="Loading"], [data-test="loading-indicator"]');
      if (spin[id] !== undefined && spin[id] !== on) add('ЗАГРУЗКА', NAMES[id], on ? 'крутилка появилась' : 'крутилка исчезла');
      spin[id] = on;
    });
  }, 150);
  // задания сервера: POST /api/v1/chart/data → 202 (задание) → событие готовности / забор данных по ключу
  function chartOf(url, body) {
    var s = '';
    try { s = decodeURIComponent(String(url)); } catch (e) { s = String(url); }
    if (typeof body === 'string') s += ' ' + body;
    var m = /"slice_id"\s*:\s*"?(\d+)/.exec(s);
    return m ? m[1] : '?';
  }
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
    add('ЗАДАНИЕ', r.chart, '#' + r.n + ' досчитано (' + how + ') за ' + dur(r.start, r.done) + ' с');
  }
  function onEvents(list) {
    (list || []).forEach(function (x) {
      var r = jobs[x && x.job_id];
      if (!r) return;
      var rk = x.result_url ? /\/chart\/data\/([^/?#]+)/.exec(String(x.result_url)) : null;
      if (rk) byUrl[rk[1]] = r;
      if (x.status === 'done') { if (r.tev == null) r.tev = performance.now(); done(r, 'событие'); }
      else if (x.status === 'error') done(r, 'ошибка');
    });
  }
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '', method = ((init && init.method) || 'GET').toUpperCase();
    var p = orig.apply(this, arguments);
    if (url.indexOf('/api/v1/async_event') >= 0) {
      p.then(function (res) { res.clone().json().then(function (j) { onEvents(j && j.result); }, function () {}); }, function () {});
      return p;
    }
    if (url.indexOf('/api/v1/chart/data') < 0) return p;
    var km = /\/chart\/data\/([^/?#]+)/.exec(url), key = km ? km[1] : '';
    if (method === 'GET' && key) {
      var g = byUrl[key];
      if (!g) {   // событие готовности пришло мимо сниппета (веб-сокет открыт до вставки) — самое раннее незабранное задание
        g = log.filter(function (x) { return x.code === 202 && x.tg0 == null; })[0];
        if (g) byUrl[key] = g;
      }
      if (g && g.tg0 == null) {
        if (g.tev == null) g.tev = performance.now();
        g.tg0 = performance.now();
        done(g, 'забрали данные');
        p.then(function (res) { readBody(res, g); }, function () {});
      }
      return p;
    }
    if (method !== 'POST') return p;
    var body = init && typeof init.body === 'string' ? init.body : '', id = chartOf(url, body), now = performance.now(), f = parse(body);
    if (f.nonce && !nonces[f.nonce]) nonces[f.nonce] = now;
    var resend = !!f.nonce && now - nonces[f.nonce] < 1500;
    var same = log.filter(function (x) { return x.id === id && x.done == null; }).map(function (x) { return '#' + x.n; });
    var r = { n: log.length + 1, id: id, chart: NAMES[id] || id, start: now, done: null, how: '', filters: f.filters, resend: resend, same: same.join(' '),
      kb: body ? new Blob([body]).size / 1024 : 0 };
    log.push(r);
    add('ЗАДАНИЕ', r.chart, '#' + r.n + ' ушло' + (resend ? ' (ПОВТОР)' : '') + (same.length ? ', у чарта ещё считается ' + same.join(' ') : '') + ' · ' + short(f.filters, 90));
    p.then(function (res) {
      r.code = res.status;
      r.t202 = performance.now();
      if (res.status === 202) {
        res.clone().json().then(function (j) {
          if (j && j.job_id) jobs[j.job_id] = r;
          var rk = j && j.result_url ? /\/chart\/data\/([^/?#]+)/.exec(String(j.result_url)) : null;
          if (rk) byUrl[rk[1]] = r;
        }, function () {});
      } else {
        r.tev = r.tg0 = r.t202;
        readBody(res, r);
        done(r, res.ok ? 'сразу, ' + res.status : 'ошибка ' + res.status);
      }
    }, function (err) { done(r, err && err.name === 'AbortError' ? 'ОТМЕНЕНО' : 'сбой'); });
    return p;
  };
  if (window.WebSocket && !window.WebSocket.__pa) {
    var WS = window.WebSocket;
    var Wrap = function (u, pr) {
      var ws = pr === undefined ? new WS(u) : new WS(u, pr);
      ws.addEventListener('message', function (m) { try { var j = JSON.parse(m.data); onEvents(Array.isArray(j) ? j : [j]); } catch (e) { /* не JSON */ } });
      return ws;
    };
    Wrap.prototype = WS.prototype; Wrap.__pa = true;
    ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k) { Wrap[k] = WS[k]; });
    window.WebSocket = Wrap;
  }
  // ответ с данными: размер, «из кэша», когда дочитан
  function readBody(res, r) {
    res.clone().text().then(function (tx) {
      r.tg1 = performance.now();
      r.rkb = new Blob([tx]).size / 1024;
      try {
        var j = JSON.parse(tx), q = (j.result || [])[0] || {};
        r.cached = q.is_cached ? 'да' : 'нет';
        r.rows = q.rowcount;
      } catch (e) { r.cached = '?'; }
    }, function () {});
  }
  var s1 = function (a, b) { return a == null || b == null ? '—' : dur(a, b); };
  window.paTimes = function () {
    console.table(log.map(function (r) {
      return { '#': r.n, 'чарт': r.chart, 'клик → запрос ушёл, с': sec(r.start), 'отправка, КБ': Math.round(r.kb),
        'отправка и приём сервером, с': s1(r.start, r.t202), 'расчёт на сервере, с': s1(r.t202, r.tev),
        'забор ответа, с': s1(r.tg0, r.tg1), 'ответ, КБ': r.rkb == null ? '—' : Math.round(r.rkb), 'строк': r.rows == null ? '—' : r.rows,
        'из кэша': r.cached || '—', 'всего, с': s1(r.start, r.tg1) };
    }));
    return log.length + ' запросов';
  };
  window.paLog = function () {
    console.table(ev.map(function (e) { return { 'с': sec(e.t), 'что': e.kind, 'чарт': e.chart, 'подробно': e.text }; }));
    return ev.length + ' событий';
  };
  window.paReqs = function () {
    console.table(log.map(function (r) {
      return { '#': r.n, 'чарт': r.chart, 'повтор': r.resend ? 'да' : '', 'ушло, с': sec(r.start), 'ответ': r.code || '—',
        'досчитано, с': r.done == null ? '—' : sec(r.done), 'шло, с': r.done == null ? '—' : dur(r.start, r.done), 'как': r.how,
        'у чарта ещё считались': r.same, 'фильтры': r.filters };
    }));
    return log.length + ' заданий';
  };
  console.log('Лента событий включена (версия 5). Кликни 2–3 отчёта, которые сегодня не открывал, по одному, дожидаясь ответа; потом набери paTimes()');
})();
