function installTaskGuide(shell, ST, options) {
  // A working guide: the user chooses/applies filters. Only explicit step
  // navigation changes local views; no synthetic filter masks or clipboard writes.
  var originalFocus = document.activeElement, mode = 'choose', index = 0, entered = false, ended = false, minimized = false;
  var layer = document.createElement('div'), inert = [], timer = null, catalogHidden = false;
  layer.className = 'pa-next-help pa-next-tour pa-next-tour-intro pa-next-task-chooser';
  layer.innerHTML = '<style>' +
    '.pa-next-task-chooser .pa-next-tour-card{position:fixed}.pa-next-task-routes{display:grid;gap:10px}.pa-next-task-routes button{text-align:left;height:auto;padding:12px}.pa-next-task-routes b,.pa-next-task-routes span{display:block}.pa-next-task-routes span{font-size:11.5px;line-height:1.5;margin-top:4px}.pa-next-task-routes [data-tour-route="audience"]{border-color:#245fd4;background:#eaf0fc;color:#1b4aa8}' +
    '.pa-next-task-guide{pointer-events:none;background:transparent!important}.pa-next-task-guide .pa-next-tour-card{pointer-events:auto;width:336px;box-shadow:0 4px 20px rgba(35,39,46,.16);border:1px solid #dce2eb}.pa-next-task-guide .pa-next-tour-ring{box-shadow:none}.pa-next-task-guide .pa-next-tour-actions{flex-wrap:wrap}.pa-next-task-guide button:disabled{visibility:visible;opacity:.5;cursor:default}.pa-next-task-guide .pa-next-task-hint{font-size:11.5px;line-height:1.5;color:#8a909c;margin:8px 0}.pa-next-task-guide .pa-next-task-extra{display:flex;flex-wrap:wrap;gap:6px}.pa-next-task-guide [hidden]{display:none!important}.pa-next-task-guide .pa-next-task-top-actions{display:flex;gap:4px}.pa-next-task-guide .pa-next-task-top-actions button{min-width:28px;min-height:28px;padding:2px}.pa-next-task-guide.pa-next-task-mini .pa-next-tour-ring{display:none}.pa-next-task-guide.pa-next-task-mini .pa-next-tour-card{width:300px;padding:8px 12px}' +
    '</style><div class="pa-next-tour-ring" aria-hidden="true" style="display:none"></div>' +
    '<div class="pa-next-tour-card" role="dialog" aria-modal="true" aria-labelledby="pa-next-task-title">' +
    '<div class="pa-next-tour-top"><span data-task-count>Как работать</span><span class="pa-next-task-top-actions"><button type="button" data-task-action="minimize" aria-label="Свернуть подсказку" aria-expanded="true" hidden>−</button><button type="button" data-task-action="close" aria-label="Закрыть гид">×</button></span></div>' +
    '<div data-task-body><h2 id="pa-next-task-title">С чего начнём?</h2><p data-task-text>Выбери рабочую задачу или знакомство с интерфейсом.</p>' +
    '<div class="pa-next-task-routes"><button type="button" data-tour-route="audience"><b>Анализировать целевую аудиторию</b><span>Задать ЦА → выбрать отчёт → изучить динамику и путь → получить списки людей.</span></button><button type="button" data-tour-route="overview"><b>Обзор интерфейса</b><span>Где находятся фильтры, каталог, показатели и вкладки.</span></button></div>' +
    '<p class="pa-next-task-hint" data-task-hint role="status" hidden></p><div class="pa-next-task-extra"><button type="button" data-task-action="clear-people" hidden>Снять фильтры людей</button><button type="button" data-task-action="clear-search" hidden>Очистить поиск</button><button type="button" data-task-action="return" hidden>Показать этап</button></div>' +
    '<div class="pa-next-tour-actions" hidden><button type="button" data-task-action="back">Назад</button><button type="button" data-task-action="next">Далее</button></div></div></div>';
  var card = layer.querySelector('.pa-next-tour-card'), ring = layer.querySelector('.pa-next-tour-ring');
  function q(selector) { return shell.querySelector(selector); }
  function el(selector) { return layer.querySelector(selector); }
  function button(action) { return el('[data-task-action="' + action + '"]'); }
  function visible(node) { return !!(node && node.getBoundingClientRect().width && node.getBoundingClientRect().height && getComputedStyle(node).visibility !== 'hidden'); }
  function values(part, column) {
    var list = (ST.desired && ST.desired[part]) || [];
    for (var i = 0; i < list.length; i++) if (list[i].column === column) return list[i].value || [];
    return [];
  }
  function customAudience() {
    return ['ca_org_f','ca_spec_f','ca_stream_f','ca_hq_f','ca_it_f','ca_head_f','ca_adg_f'].some(function (key) { return values('head', key).length > 0; });
  }
  function oneReport() {
    var ids = values('cat', 'sel_f');
    return ids.length === 1 && /^[1-9]\d*$/.test(String(ids[0])) && values('cat', 'mode_param')[0] === 'report';
  }
  function peopleFilters() {
    return ['org_f','spec_f','stream_f','adg_f','heads_f','login_f','exl_f','freq_f'].some(function (key) { return values('one', key).length > 0; });
  }
  function catalogAudience() {
    return ['aud_org_f','aud_spec_f','aud_stream_f','aud_hq_f','aud_it_f','aud_head_f'].some(function (key) { return values('cat', key).length > 0; });
  }
  function ready(part) { var node = q('[data-pa-next-host="' + part + '"]'); return node && node.getAttribute('data-pa-next-state') === 'ready'; }
  function oneState() { return (window.__pvtState && window.__pvtState.pone) || {}; }
  function click(selector) { var node = q(selector); if (visible(node) && !node.disabled) node.click(); }
  function view(value) {
    var selector = '[data-pa-next-host="one"] [data-view="' + value + '"]', node = q(selector);
    if (node && node.getAttribute('aria-selected') !== 'true' && !node.classList.contains('active')) click(selector);
  }
  function showPeople(segment) {
    view('view:who'); view('whoMode:ca');
    if (oneState().whoCut !== 'none') {
      if (!visible(q('[data-ddopt="whoCut"][data-val="none"]'))) click('[data-ddtoggle="whoCut"]');
      click('[data-ddopt="whoCut"][data-val="none"]');
    }
    if (oneState().segSel !== segment) click('.pone-segstrip [data-seg="' + segment + '"]');
  }
  var steps = [
    { title: '1. Задай свою ЦА', selector: '.phead-bar', text: 'Выбери подразделение, специализацию, стрим или другие условия ЦА. Закрой список кнопкой «Готово» и нажми «Применить» в шапке. Уже применённые подходящие условия можно оставить. Фильтры выбираешь ты; гид их не подставляет.', next: 'К выбору отчёта' },
    { title: '2. Выбери один отчёт', selector: '.pa-next-cat .prb-panel', text: 'В каталоге открой «Отчёты», найди нужный отчёт по названию или ID и выбери одну строку. Условия ЦА из шапки сохранятся. Проверь период анализа в верхней строке.', next: 'Открыть динамику' },
    { title: '3. Изучи динамику своей ЦА', selector: '.pone-panel', tab: 'dyn', text: 'При заданных условиях ЦА динамика показывает эту группу сотрудников. Сравни пользователей и просмотры по периодам: интерес растёт, падает или держится? Переключатель «Охват ЦА» под верхним графиком покажет долю аудитории. MAU относится к последнему закрытому месяцу.', next: 'Открыть путь ЦА' },
    { title: '4. Сколько людей дошли?', selector: 'svg[data-fn]', fallback: '.pone-panel', tab: 'path', text: 'Сравни размер целевой аудитории со ступенью «Открыли хотя бы раз»: это люди с заходом в выбранном периоде. Затем посмотри, сколько вернулись и заходят регулярно. К поимённым спискам перейдём через «Кто смотрит».', next: 'Список заходивших' },
    { title: '5. Кто из ЦА заходил', selector: '.pone-panel', tab: 'who', segment: 'reach', text: 'Открыт режим «По целевой аудитории», сегмент «ЦА заходили», группировка «Люди». Это конкретные сотрудники ЦА, открывавшие отчёт за выбранный период. Сопоставь итог списка со ступенью «Открыли хотя бы раз».', next: 'Кто не заходил' },
    { title: '6. Кто из ЦА не заходил', selector: '.pone-panel', tab: 'who', segment: 'never', text: 'Сегмент «ЦА не заходили» показывает людей без визитов в выбранном периоде, в том числе заходивших раньше. Если имён слишком много и список не загружен, сузь условия ЦА и повтори шаги. Ноль строк сам по себе не доказывает, что все заходили.', next: 'Перейти к списку' },
    { title: '7. Подготовь результат', selector: '.pone-who-bar', fallback: '.pone-panel', tab: 'who', text: 'Используй поиск или группировку для следующего разбора. «Копировать» перенесёт все найденные строки, а не только страницу. Передавая список, добавь отчёт, период и условия ЦА. Кнопка «Готово» завершит гид и сохранит твой выбор.', next: 'Готово' }
  ];
  function commonIssue() {
    if (q('.phead-ttl .pend')) return 'Условия ЦА ещё не применены. Нажми «Применить» в шапке.';
    if (!customAudience()) return 'Задай хотя бы одно условие ЦА в шапке и нажми «Применить».';
    if (index > 0 && !oneReport()) return 'Выбери один отчёт во вкладке каталога «Отчёты».';
    if (index > 1 && catalogAudience()) return 'Сними дополнительные фильтры аудитории каталога: в этом сценарии ЦА задаётся в шапке.';
    if (index > 1 && peopleFilters()) return 'Выбраны люди, исключения или частота. Для разбора всей ЦА сними эти фильтры; условия ЦА и отчёт останутся.';
    if (!ready('cat') || !ready('one')) {
      if (q('.pa-next-wait button')) return 'Есть ошибка загрузки. Используй кнопку повтора в отчёте; гид продолжится после получения данных.';
      return 'Дождись данных для применённого выбора. Этап останется на месте.';
    }
    return '';
  }
  function expectedView() {
    var step = steps[index], state = oneState();
    return (!step.tab || state.view === step.tab) && (!step.segment || (state.whoMode === 'ca' && state.whoCut === 'none' && state.segSel === step.segment));
  }
  function enter() {
    var step = steps[index];
    if (step.segment) showPeople(step.segment);
    else if (step.tab) view('view:' + step.tab);
    entered = true;
    var target = q(step.selector) || (step.fallback && q(step.fallback));
    if (visible(target)) target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function update() {
    if (ended) return;
    if (mode === 'choose') { place(); return; }
    var hiddenNow = shell.classList.contains('pa-next-catalog-hidden');
    if (hiddenNow && !catalogHidden && !minimized) setMinimized(true);
    catalogHidden = hiddenNow;
    var issue = commonIssue(), state = oneState();
    if (!issue && !entered) { enter(); state = oneState(); }
    var wrongView = !issue && !expectedView();
    if (wrongView) issue = 'Ты переключил вид отчёта. Вернись к этому этапу или нажми «Назад».';
    var search = index >= 4 && index <= 5 && !!state.q;
    if (!issue && search) issue = 'Поиск сужает список людей. Очисти его, чтобы увидеть весь выбранный сегмент ЦА.';
    button('clear-people').hidden = !(index > 1 && peopleFilters() && visible(q('.pa-next-one [data-unpick="*"]')));
    button('clear-search').hidden = !search;
    button('return').hidden = !wrongView;
    button('next').disabled = !!issue;
    var hint = el('[data-task-hint]'), message = issue || (index < 2 ? 'Выбор применён, можно продолжить.' : 'Посмотри данные и переходи дальше, когда закончишь.');
    if (hint.textContent !== message) hint.textContent = message;
    place();
  }
  function place() {
    var band = ST.visibleBand || { top: 0, bottom: window.innerHeight }, top = Math.max(0, band.top), bottom = Math.min(window.innerHeight, band.bottom), w = window.innerWidth;
    card.style.maxHeight = Math.max(100, bottom - top - 24) + 'px';
    var cw = card.offsetWidth, ch = card.offsetHeight, left = (w - cw) / 2, y = top + (bottom - top - ch) / 2;
    if (mode === 'audience') {
      left = index < 2 ? w - cw - 12 : 12; y = bottom - ch - 12;
      var dropdown = document.querySelector('body > .phead-dd');
      if (visible(dropdown)) {
        var dr = dropdown.getBoundingClientRect();
        if (left < dr.right && left + cw > dr.left && y < dr.bottom && y + ch > dr.top) left = dr.left > cw + 24 ? 12 : w - cw - 12;
      }
      var step = steps[index], target = q(step.selector) || (step.fallback && q(step.fallback));
      if (visible(target) && !minimized) {
        var r = target.getBoundingClientRect(), rt = Math.max(top + 2, r.top - 2), rb = Math.min(bottom - 2, r.bottom + 2);
        ring.style.display = rb > rt ? 'block' : 'none'; ring.style.left = Math.max(2, r.left - 2) + 'px';
        ring.style.top = rt + 'px'; ring.style.width = Math.max(0, Math.min(w - 2, r.right + 2) - Math.max(2, r.left - 2)) + 'px'; ring.style.height = Math.max(0, rb - rt) + 'px';
      } else ring.style.display = 'none';
    }
    card.style.left = Math.max(12, Math.min(w - cw - 12, left)) + 'px'; card.style.top = Math.max(top + 12, Math.min(bottom - ch - 12, y)) + 'px';
  }
  function show(indexNext) {
    if (indexNext < 0) return;
    if (indexNext >= steps.length) { close(); return; }
    index = indexNext; entered = false;
    var step = steps[index];
    layer.setAttribute('data-task-step', String(index + 1));
    el('[data-task-count]').textContent = 'Анализ ЦА · ' + (index + 1) + ' из ' + steps.length;
    el('h2').textContent = step.title; el('[data-task-text]').textContent = step.text;
    button('back').disabled = index === 0; button('next').textContent = step.next;
    // Reading steps keep focus in the nonmodal guide; field editing is free.
    update(); card.focus({ preventScroll: true });
    var target = q(step.selector); if (index < 2 && visible(target)) target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function setMinimized(value) {
    minimized = value; el('[data-task-body]').hidden = minimized; layer.classList.toggle('pa-next-task-mini', minimized);
    var toggle = button('minimize');
    toggle.setAttribute('aria-expanded', String(!minimized)); toggle.setAttribute('aria-label', minimized ? 'Развернуть подсказку' : 'Свернуть подсказку'); toggle.textContent = minimized ? '+' : '−';
  }
  function restoreInert() { inert.forEach(function (item) { item.node.inert = item.value; }); inert = []; }
  function close() {
    if (ended) return;
    ended = true; clearInterval(timer); restoreInert(); window.removeEventListener('keydown', keydown);
    if (layer.parentNode) layer.parentNode.removeChild(layer);
    if (originalFocus && originalFocus.isConnected && originalFocus.focus) originalFocus.focus({ preventScroll: true });
    options.closed();
  }
  function keydown(ev) {
    if (ev.key === 'Escape') {
      if (mode === 'audience' && visible(document.querySelector('body > .phead-dd'))) return;
      ev.preventDefault(); close(); return;
    }
    if (mode !== 'choose' || ev.key !== 'Tab') return;
    var buttons = Array.prototype.filter.call(card.querySelectorAll('button'), function (node) { return visible(node) && !node.disabled; });
    var at = buttons.indexOf(document.activeElement), next = ev.shiftKey ? (at <= 0 ? buttons.length - 1 : at - 1) : (at + 1) % buttons.length;
    ev.preventDefault(); buttons[next].focus({ preventScroll: true });
  }
  layer.addEventListener('click', function (ev) {
    var node = ev.target.closest('button'); if (!node || node.disabled) return;
    var route = node.getAttribute('data-tour-route'), action = node.getAttribute('data-task-action');
    if (route === 'overview') { close(); options.overview(); return; }
    if (route === 'audience') {
      mode = route; restoreInert(); options.revealCatalog(); layer.className = 'pa-next-help pa-next-tour pa-next-task-guide';
      card.setAttribute('aria-modal', 'false'); card.tabIndex = -1;
      el('.pa-next-task-routes').hidden = true; el('.pa-next-tour-actions').hidden = false; el('[data-task-hint]').hidden = false; button('minimize').hidden = false;
      show(0); return;
    }
    if (action === 'close') close();
    else if (action === 'next') { update(); if (!button('next').disabled) show(index + 1); }
    else if (action === 'back') show(index - 1);
    else if (action === 'clear-people') click('.pa-next-one [data-unpick="*"]');
    else if (action === 'clear-search') {
      var input = q('[data-search="whoQ"]');
      if (input) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); }
    } else if (action === 'return') { if (!commonIssue()) enter(); }
    else if (action === 'minimize') {
      setMinimized(!minimized); place();
    }
    update();
  });
  Array.prototype.forEach.call(shell.children, function (node) { if (node.tagName !== 'STYLE') { inert.push({ node: node, value: node.inert }); node.inert = true; } });
  shell.appendChild(layer); window.addEventListener('keydown', keydown); timer = setInterval(update, 200); place();
  el('[data-tour-route="audience"]').focus({ preventScroll: true });
  return { destroy: close, focus: function () {
    if (minimized) button('minimize').click();
    if (mode === 'choose') el('[data-tour-route="audience"]').focus({ preventScroll: true });
    else card.focus({ preventScroll: true });
  } };
}
