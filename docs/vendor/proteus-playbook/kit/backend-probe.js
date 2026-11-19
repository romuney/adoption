// Proteus: что знает о себе бэкенд — сниппет DevTools. Только читает страницу, ничего не меняет и никуда не отправляет.
// Где запускать: открыть любой борд → F12 → Console (контекст top) → вставить целиком → Enter.
// Результат печатается и копируется в буфер — пришлите его целиком. Логин, почту, адреса серверов сниппет не печатает.
(function () {
  var out = [], app = document.getElementById('app'), b = null;
  function line(k, v) { out.push(k + ': ' + (v === undefined ? '—' : (typeof v === 'string' ? v : JSON.stringify(v)))); }
  try { b = JSON.parse(app && app.getAttribute('data-bootstrap') || 'null'); } catch (e) { line('bootstrap', 'не разобран: ' + e.message); }
  line('адрес', location.pathname.replace(/\/\d+\/?$/, '/<id>/'));
  if (!b) { line('bootstrap', app ? 'пусто' : 'нет #app'); }
  var c = (b && b.common) || {}, nav = ((c.menu_data || {}).navbar_right) || {}, conf = c.conf || {};
  line('версия', nav.version_string); line('SHA', nav.version_sha); line('сборка', nav.build_number);
  line('язык', c.locale);
  var ff = c.feature_flags || {}, on = [], off = [];
  Object.keys(ff).sort().forEach(function (k) { (ff[k] === true ? on : off).push(k + (ff[k] === true || ff[k] === false ? '' : '=' + JSON.stringify(ff[k]))); });
  line('флаги вкл', on.join(', ')); line('флаги выкл', off.join(', '));
  ['SQL_MAX_ROW', 'DISPLAY_MAX_ROW', 'DEFAULT_SQLLAB_LIMIT', 'SUPERSET_WEBSERVER_TIMEOUT', 'GLOBAL_ASYNC_QUERIES_TRANSPORT',
   'GLOBAL_ASYNC_QUERIES_POLLING_DELAY', 'SQL_VALIDATORS_BY_ENGINE', 'DASHBOARD_AUTO_REFRESH_MODE',
   'ENABLE_JAVASCRIPT_CONTROLS', 'HTML_SANITIZATION', 'SUPERSET_DASHBOARD_POSITION_DATA_LIMIT'].forEach(function (k) { line(k, conf[k]); });
  line('прочие ключи conf (только имена)', Object.keys(conf).sort().join(', '));
  line('прочие ключи common (только имена)', Object.keys(c).sort().join(', '));
  var fr = Array.prototype.slice.call(document.querySelectorAll('iframe'));
  line('iframe на странице', fr.length + (fr.length ? ' · sandbox: ' + fr.map(function (f) { return f.getAttribute('sandbox'); })
    .filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' | ') + ' · ' + (fr.some(function (f) { return f.hasAttribute('srcdoc'); }) ? 'srcdoc' : 'src') : ''));
  var text = '— Proteus, бэкенд (' + new Date().toISOString().slice(0, 16) + ') —\n' + out.join('\n');
  console.log(text);
  try { copy(text); console.log('(скопировано в буфер обмена)'); } catch (e) { console.log('(выделите текст выше и скопируйте)'); }
})();
