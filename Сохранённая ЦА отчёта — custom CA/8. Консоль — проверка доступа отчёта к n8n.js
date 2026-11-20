/* Проверка: может ли отчёт из своей iframe-песочницы достучаться до webhook n8n.
 * ЭТО ПЕРВЫЙ ШАГ: если запрос из чарта не проходит, сохранение ЦА из отчёта невозможно
 * в задуманном виде, и строить остальное рано.
 *
 * Как запустить:
 *   1. Открыть борд PA NEXT, DevTools → Console.
 *   2. В выпадашке контекста консоли (вверху, обычно «top») выбрать iframe основного чарта 859562.
 *   3. Вписать URL ниже и вставить весь файл в консоль.
 *
 * Отправляет action=deactivate с заведомо несуществующим dashboard_id: при живом флоу
 * ответ 404 report_not_found, в DLH ничего не пишется.
 * Прислать мне вывод целиком (две строки «PA TA probe»).
 */
(async () => {
  const URL = 'https://<n8n-host>/webhook/proteus/ta';   // ← вписать
  const body = JSON.stringify({
    action: 'deactivate', login: 'probe.only', request_id: 'probe-' + Date.now(),
    dashboard_id: 1, expected_version: 0,
  });
  const info = {
    origin: String(window.origin), secure: window.isSecureContext,
    uuid: typeof (window.crypto && crypto.randomUUID) === 'function',
  };
  console.log('PA TA probe · контекст', JSON.stringify(info));
  try {
    // text/plain — «простой» запрос: браузер не шлёт preflight OPTIONS, которого песочница не переживает.
    const r = await fetch(URL, { method: 'POST', mode: 'cors', credentials: 'omit',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body });
    const text = await r.text();
    console.log('PA TA probe · ответ', r.status, text.slice(0, 300),
      r.status === 404 ? '→ OK: отчёт достаёт до n8n, флоу отвечает' : '→ запрос дошёл, но ответ неожиданный');
  } catch (e) {
    console.log('PA TA probe · ответ', 'ОШИБКА', String(e),
      '→ запрос заблокирован: смотри в Console/Network причину (CORS, CSP connect-src, mixed content)');
  }
})();
