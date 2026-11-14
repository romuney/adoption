// pa_next loader: no calculation, no UI, only isolated board routing.
(function () {
  var C = __CONFIG__, V = 1, S = window.__paNextLoader || (window.__paNextLoader = { n: 0, instance: String(Date.now()) + '-' + String(Math.random()).slice(2) });
  var rows = typeof data !== 'undefined' && Array.isArray(data) ? data : [];
  S.n++;
  S.rows = rows;
  if (S.on) window.removeEventListener('message', S.on);
  (S.timers || []).forEach(clearTimeout);
  function send(target, kind, extra) {
    var d = { type: 'PA_NEXT_V1', channel: C.channel, v: V, kind: kind, part: C.part, chart: C.id, to: C.main, serial: S.n, instance: S.instance };
    Object.keys(extra || {}).forEach(function (k) { d[k] = extra[k]; });
    try { target.postMessage(d, '*'); } catch (ignore) { /* receiver unmounted */ }
  }
  function hello() {
    try { (function walk(w, depth) {
      if (depth > 5) return;
      for (var i = 0; i < w.frames.length; i++) {
        var f = w.frames[i]; if (f !== window) send(f, 'HELLO');
        try { walk(f, depth + 1); } catch (ignore) { /* opaque frame */ }
      }
    })(window.top, 0); } catch (ignore) { /* detached */ }
  }
  function validMask(mask) {
    if (!Array.isArray(mask)) return false;
    return mask.every(function (f) {
      return f && C.columns.indexOf(f.column) >= 0 && f.operator === 'IN' && Array.isArray(f.value) && f.value.length > 0 &&
        f.value.every(function (v) { return typeof v === 'string' && v.length < 2000; });
    });
  }
  S.on = function (ev) {
    var d = ev.data;
    if (!d || d.type !== 'PA_NEXT_V1' || d.v !== V || d.channel !== C.channel || d.chart !== C.main || d.to !== C.id || !ev.source) return;
    if (d.kind === 'ASK') {
      S.main = ev.source; S.session = d.session;
      send(ev.source, 'ROWS', { session: d.session, rows: S.rows });
      return;
    }
    if (d.kind !== 'COMMAND' || ev.source !== S.main || d.session !== S.session || !validMask(d.mask)) return;
    if (S.commandSession !== d.session) { S.commandSession = d.session; S.seq = 0; }
    if (d.seq > S.seq) {
      if (typeof applyCrossFilter !== 'function') { send(ev.source, 'ERROR', { session: d.session, seq: d.seq, message: 'Открой чарт на дашборде: applyCrossFilter недоступен.' }); return; }
      try { applyCrossFilter(d.mask); }
      catch (ignore) { send(ev.source, 'ERROR', { session: d.session, seq: d.seq, message: 'Не удалось отправить запрос. Попробуй ещё раз.' }); return; }
      S.seq = d.seq;
    }
    send(ev.source, 'ACK', { session: d.session, seq: d.seq });
  };
  window.addEventListener('message', S.on);
  hello(); S.timers = [setTimeout(hello, 600), setTimeout(hello, 2500)];
})();
option = { animation: false, xAxis: { show: false, type: 'value' }, yAxis: { show: false, type: 'value' }, series: [{ type: 'scatter', data: [] }] };
