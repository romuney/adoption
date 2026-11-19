// Injected into the isolated header renderer only. No employee dictionary or
// numeric audience estimate is derived from the submitted identifiers.
function caPeopleOn(c) { return !!(c.people && c.people.length); }
function caPeopleParse(raw, mode) {
  var text = String(raw || ''), tokens, values = [], seen = {}, errors = [], duplicates = 0, count = 0, characters = 0;
  if (text.length > 1000000) return { values: [], errors: ['Текст больше 1 000 000 символов. Сократи список до 5 000 уникальных идентификаторов.'], duplicates: 0, count: 0 };
  if (/^\s*\[/.test(text)) {
    try { tokens = JSON.parse(text); } catch (ignore) { tokens = null; }
    if (!Array.isArray(tokens) || !tokens.every(function (v) { return typeof v === 'string'; })) {
      return { values: [], errors: ['JSON должен быть массивом строк: ["id1", "id2"]. Числа без кавычек не принимаются, чтобы не потерять точность.'], duplicates: 0, count: 0 };
    }
  } else tokens = text.split(/[\s,;]+/);
  tokens.forEach(function (token) {
    var value = String(token).trim();
    if (!value) return;
    count++;
    if (mode === 'login') value = value.toLowerCase();
    var valid = mode === 'master' ? /^[0-9]{1,32}$/.test(value) : /^[a-z0-9._@-]{1,128}$/.test(value);
    if (!valid) {
      if (errors.length < 4) errors.push('Значение ' + count + ': «' + value.slice(0, 64) + (value.length > 64 ? '…' : '') + '». ' + (mode === 'master' ? 'Master ID — от 1 до 32 цифр, без дробей и экспоненты. В Excel используй текстовый формат.' : 'Логин — до 128 латинских букв, цифр или символов . _ @ -. Вставь логины без заголовка и ФИО.'));
      return;
    }
    var key = ':' + value;
    if (seen[key]) { duplicates++; return; }
    seen[key] = true; values.push(value); characters += value.length;
  });
  if (values.length > 5000) errors.push('Уникальных идентификаторов: ' + values.length + '. Допустимо не больше 5 000. Сократи список; он не будет обрезан автоматически.');
  if (characters > 32000) errors.push('Список слишком длинный: ' + characters + ' символов в уникальных значениях. Максимум — 32 000. Сократи список; он не будет обрезан автоматически.');
  return { values: values, errors: errors, duplicates: duplicates, count: count, characters: characters };
}
function caPeopleButton(c) {
  var on = caPeopleOn(c), label = on ? (c.peopleMode === 'master' ? 'Master ID' : 'Логины') : 'Список людей';
  return '<button type="button" class="' + CFG.ns + '-cf' + (on ? ' on' : '') + '" data-ca-people="open" aria-haspopup="dialog" aria-label="Список людей' + (on ? ': ' + c.people.length + ' идентификаторов' : '') + '"><span class="' + CFG.ns + '-cf-l">' + label + '</span>' + (on ? '<span class="' + CFG.ns + '-cf-n">' + c.people.length + '</span>' : '') + '<span class="' + CFG.ns + '-cf-car">▾</span></button>';
}
function caPeopleOpen(overlay, render, openDd) {
  if (state.peopleClose) state.peopleClose(false);
  if (state.dd) openDd(null);
  var draft = state.draft, mode = draft.peopleMode === 'master' ? 'master' : 'login', texts = { login: '', master: '' };
  texts[mode] = (draft.people || []).join('\n');
  var layer = document.createElement('div'), block = overlay.closest('.pa-next-shell') || overlay;
  var oldInert = block.inert, oldHidden = block.getAttribute('aria-hidden');
  layer.className = 'pa-next-people';
  // Reuse the report's header controls and tokens, including outside its inert shell.
  var C = CFG.colors, N = CFG.ns, F = CFG.fonts.family;
  layer.innerHTML = '<style>' + [
    '.pa-next-people{position:fixed;inset:0;z-index:100200;background:rgba(35,39,46,.16);font:400 12.5px/1.4 ' + F + ';color:' + C.ink2 + '}',
    '.pa-next-people *{box-sizing:border-box}',
    '.pa-next-people-dialog{position:absolute;left:50%;transform:translateX(-50%);width:min(480px,calc(100% - 24px));display:flex;flex-direction:column;background:' + C.card + ';border:1px solid ' + C.line + ';border-radius:10px;box-shadow:0 10px 28px rgba(20,30,50,.18);overflow:hidden}',
    '.pa-next-people-head{padding:14px 16px 10px;flex-shrink:0}',
    '.pa-next-people h2{font:700 14.5px/1.4 ' + F + ';color:' + C.ink + ';margin:0 0 2px}',
    '.pa-next-people p{margin:6px 0 0;font-size:11.5px;line-height:1.4}',
    '.pa-next-people-head p{margin-top:2px}',
    '.pa-next-people-body{padding:0 16px 12px;overflow:auto;overscroll-behavior:contain;min-height:0}',
    '.pa-next-people-mode{margin:0 0 12px}',
    '.pa-next-people button{touch-action:manipulation}',
    '.pa-next-people label{display:block;font-size:10.5px;font-weight:400;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}',
    '.pa-next-people textarea{display:block;width:100%;height:120px;min-height:88px;max-height:260px;resize:vertical;border:1px solid ' + C.line + ';border-radius:9px;padding:8px 10px;font:400 12.5px/1.4 ' + F + ';color:' + C.ink + ';background:' + C.card + ';overflow-wrap:anywhere}',
    '.pa-next-people textarea::placeholder{color:' + C.mut + ';opacity:1}',
    '.pa-next-people textarea[aria-invalid=true]{border-color:#c43b3b}',
    '.pa-next-people-status{min-height:32px;margin-top:8px;font-size:11.5px}',
    '.pa-next-people-errors{color:#a12c2c;overflow-wrap:anywhere;white-space:pre-line;font-size:11.5px}',
    '.pa-next-people-tools{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 8px}',
    '.pa-next-people-tools button:first-child{margin-left:-8px}',
    '.pa-next-people details{font-size:11.5px}',
    '.pa-next-people summary{cursor:pointer;color:' + C.act + ';width:fit-content;border-radius:4px}',
    '.pa-next-people-foot{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:10px 16px;border-top:1px solid ' + C.line + ';flex-shrink:0}',
    '.pa-next-people :is(button,textarea,summary):focus-visible{outline:2px solid ' + C.act + ';outline-offset:2px}',
    '.pa-next-people button[aria-disabled=true]{opacity:.45;cursor:default}',
    '.pa-next-people-count{font-variant-numeric:tabular-nums}'
  ].join('') + '</style>' +
    '<div class="pa-next-people-dialog" role="dialog" aria-modal="true" aria-labelledby="pa-next-people-title" aria-describedby="pa-next-people-purpose">' +
      '<div class="pa-next-people-head"><h2 id="pa-next-people-title">Список людей</h2><p id="pa-next-people-purpose">Кого учитывать в целевой аудитории</p></div>' +
      '<div class="pa-next-people-body">' +
        '<div class="pa-next-people-mode ' + N + '-strip-seg" role="group" aria-label="Тип идентификатора"><button type="button" data-person-mode="login">Логины</button><button type="button" data-person-mode="master">Master ID</button></div>' +
        '<label for="pa-next-people-input">Идентификаторы</label><textarea id="pa-next-people-input" name="audience_people" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="pa-next-people-paste pa-next-people-hint pa-next-people-status pa-next-people-errors"></textarea>' +
        '<p id="pa-next-people-paste">Скопируй столбец из Excel без заголовка и вставь сюда.<br>Вручную — по одному значению на строку или через ;</p>' +
        '<div id="pa-next-people-status" class="pa-next-people-status pa-next-people-count" role="status" aria-live="polite"></div>' +
        '<div id="pa-next-people-errors" class="pa-next-people-errors" role="alert"></div>' +
        '<div class="pa-next-people-tools"><button type="button" class="' + N + '-btn sm" data-person-action="clean">Убрать повторы и оформить</button><button type="button" class="' + N + '-btn sm" data-person-action="clear">Очистить список</button></div>' +
        '<details><summary>Формат и ограничения</summary><p id="pa-next-people-hint"></p>' +
          '<p>До 5 000 уникальных значений и 32 000 символов в них. Разделители: новая строка, табуляция, пробел, запятая и ;. Можно вставить JSON-массив строк. Поиск по ФИО не выполняется.</p>' +
          '<p>При смене типа текст сохраняется отдельно до закрытия редактора. Сохраняется только выбранный тип.</p></details>' +
        '<p>Список пересекается с остальными условиями ЦА. Найденных сотрудников увидишь после общего «Применить».</p>' +
      '</div><div class="pa-next-people-foot"><button type="button" class="' + N + '-btn" data-person-action="cancel">Отмена</button><button type="button" class="' + N + '-btn primary" data-person-action="save">Сохранить в условия</button></div></div>';
  document.body.appendChild(layer);
  var dialog = layer.querySelector('[role=dialog]'), input = layer.querySelector('textarea'), statusNode = layer.querySelector('[role=status]'), errorsNode = layer.querySelector('[role=alert]'), lastBand = '', positionTimer, sizeObserver;
  block.inert = true; block.setAttribute('aria-hidden', 'true');
  function place() {
    var band = window.__paNext && window.__paNext.visibleBand || { top: 0, bottom: Math.min(window.innerHeight, window.screen.availHeight || 700) };
    var top = Math.max(0, band.top), bottom = Math.min(window.innerHeight, band.bottom);
    var bandKey = top + '|' + bottom + '|' + window.innerWidth, recenter = lastBand !== bandKey;
    lastBand = bandKey;
    dialog.style.maxHeight = Math.max(160, bottom - top - 24) + 'px';
    var y = recenter ? top + (bottom - top - dialog.offsetHeight) / 2 : parseFloat(dialog.style.top);
    dialog.style.top = Math.max(top + 12, Math.min(y, bottom - dialog.offsetHeight - 12)) + 'px';
  }
  function update() {
    texts[mode] = input.value;
    var parsed = caPeopleParse(input.value, mode), statusText = 'Уникальных идентификаторов: ' + nf(parsed.values.length) + '. Повторов: ' + nf(parsed.duplicates) + '.';
    if (!parsed.count && !parsed.errors.length) statusText = 'Пустой список снимает это условие ЦА после сохранения и общего «Применить».';
    if (statusNode.textContent !== statusText) statusNode.textContent = statusText;
    var message = parsed.errors.join('\n');
    if (errorsNode.textContent !== message) errorsNode.textContent = message;
    input.setAttribute('aria-invalid', parsed.errors.length ? 'true' : 'false');
    layer.querySelector('[data-person-action=save]').setAttribute('aria-disabled', parsed.errors.length ? 'true' : 'false');
    place(); return parsed;
  }
  function showMode() {
    Array.prototype.forEach.call(layer.querySelectorAll('[data-person-mode]'), function (b) { var selected = b.getAttribute('data-person-mode') === mode; b.setAttribute('aria-pressed', selected ? 'true' : 'false'); b.classList.toggle('on', selected); });
    input.value = texts[mode];
    input.placeholder = mode === 'master' ? '123456\n987654…' : 'ivanov\npetrova…';
    layer.querySelector('#pa-next-people-hint').textContent = mode === 'master' ? 'Master ID — mdm_employee_rk: 1–32 цифры. Используй текстовый формат Excel; ведущие нули сохраняются, дроби и экспонента не принимаются.' : 'Логины приводятся к нижнему регистру; пробелы по краям и повторы убираются. Допустимы латинские буквы, цифры и . _ @ - (до 128 символов).';
    update();
  }
  function close(focusBack) {
    clearInterval(positionTimer);
    if (sizeObserver) sizeObserver.disconnect();
    window.removeEventListener('resize', place);
    if (layer.parentNode) layer.parentNode.removeChild(layer);
    block.inert = oldInert;
    if (oldHidden === null) block.removeAttribute('aria-hidden'); else block.setAttribute('aria-hidden', oldHidden);
    state.peopleClose = null;
    if (focusBack) { var button = overlay.querySelector('[data-ca-people]'); if (button) button.focus({ preventScroll: true }); }
  }
  state.peopleClose = close;
  input.addEventListener('input', update);
  layer.querySelector('details').addEventListener('toggle', place);
  layer.addEventListener('click', function (ev) {
    var button = ev.target.closest('button'); if (!button || !layer.contains(button)) return;
    var nextMode = button.getAttribute('data-person-mode'), action = button.getAttribute('data-person-action');
    if (nextMode) { texts[mode] = input.value; mode = nextMode; showMode(); return; }
    if (action === 'cancel') { close(true); return; }
    if (action === 'clear') { input.value = ''; update(); input.focus({ preventScroll: true }); return; }
    var parsed = update();
    if (parsed.errors.length) { input.focus({ preventScroll: true }); return; }
    if (action === 'clean') { input.value = parsed.values.join('\n'); update(); input.focus({ preventScroll: true }); return; }
    if (action === 'save') {
      state.draft.peopleMode = parsed.values.length ? mode : 'login'; state.draft.people = parsed.values.slice().sort();
      close(false); render();
      var opener = overlay.querySelector('[data-ca-people]'); if (opener) opener.focus({ preventScroll: true });
    }
  });
  layer.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' || ev.keyCode === 27) { ev.preventDefault(); ev.stopPropagation(); close(true); return; }
    if (ev.key !== 'Tab' && ev.keyCode !== 9) return;
    var focusable = layer.querySelectorAll('button,textarea'), first = focusable[0], last = focusable[focusable.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus({ preventScroll: true }); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus({ preventScroll: true }); }
  });
  // Parent scrolling changes the cross-origin visible band without dispatching
  // a scroll event inside this iframe. Read only the existing shared numbers;
  // perform layout only when the band changed, and stop when the dialog closes.
  positionTimer = setInterval(function () {
    var b = window.__paNext && window.__paNext.visibleBand;
    if (b && lastBand !== Math.max(0, b.top) + '|' + Math.min(window.innerHeight, b.bottom) + '|' + window.innerWidth) place();
  }, 150);
  // Textarea dragging and expanded help can change height without a window resize.
  if (window.ResizeObserver) { sizeObserver = new ResizeObserver(place); sizeObserver.observe(dialog); }
  window.addEventListener('resize', place); showMode(); input.focus({ preventScroll: true });
}
