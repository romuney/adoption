// ============================================================================
// <NAME>.chart.js - болванка каркаса
// ============================================================================
// КОНТРАКТ PROTEUS:
//   ECharts = только холст. Вся визуализация - HTML/CSS/SVG в overlay.
//   Хост = ПОСЛЕДНИЙ [_echarts_instance_]. Canvas прячем. Overlay - appendChild.
//   В САМОМ КОНЦЕ ФАЙЛА, ГЛОБАЛЬНО: option = {...} с пустым scatter.
//
// ЗАПРЕЩЕНО: backticks/template-literals, стрелочные функции, let/const,
//   document.getElementById (только overlay.querySelector), console.log в итоге,
//   addEventListener внутри тела render(), обращение к option из catch,
//   мутация option после присваивания, var P = '.' + CFG.ns в buildHTML
//   (точка только в buildCSS).
// ОБЯЗАТЕЛЬНО: все 7 блоков ниже, в таком порядке, без перенумерации.
// ОБЯЗАТЕЛЬНО: вызов render(); в теле mount() — без него overlay пустой.
//
// ВЫЧИСЛЕНИЯ ЖИВУТ ЗДЕСЬ, А НЕ В SQL. Проценты, дельты, ранги, накопительные
//   итоги, сортировка и форматирование считаются в buildModel() (БЛОК 3).
//   SQL отдаёт сырые строки — базу не нагружаем.
// ============================================================================

// ---------- БЛОК 1: CFG ----------
// Полоска настроек первого листа (макет 2.5): период + поповер «Опции»
// (3 свитка) + сброс. Данных НЕТ: data игнорируется, датасет-носитель
// Носитель — pa_strip (SELECT 1; до v7 им был тяжёлый pa_dicts): нужен только
// чтобы чарт существовал. Эмиты читает джиня куба v7 и pa_people (паттерн
// 59922, носители не в SELECT).
var CFG = {
  ns: 'past',
  fields: {},                 // полей SQL нет — только константы и эмит
  text: { noData: 'Нет данных' },
  mode: 'snapshot',
  grains: [
    { id: 'd', label: '30 дней' },
    { id: 'w', label: '20 недель' },
    { id: 'm', label: '12 месяцев' },
    { id: 'q', label: '8 кварталов' }
  ],
  // Свиток эмитит СВОЮ колонку ТОЛЬКО при отличии от дефолта (val при откл.).
  switches: [
    { key: 'published', label: 'Только опубликованные', def: true, emit: 'pub_f', val: '0', hint: '' },
    { key: 'actual', label: 'Только актуальные', def: true, emit: 'act_f', val: '0', hint: '' },
    { key: 'excludeOwners', label: 'Исключить владельцев из просмотров', def: true, emit: 'exc_f', val: '0',
      hint: 'Владелец открывает свой отчёт при каждой правке — его визиты завышают аудиторию.' }
  ],
  tips: {
    optsTrg: { title: 'Опции',
      text: 'Свитки качества отчётов. Период — слева; фильтры по людям — кликами по строкам панели «Аудитория области»; отчётные условия — выбором в каталоге.' }
  },
  colors: {
    bg: '#f6f6f6',            // канвас = фон борда (раунд 6 тела), полоска — белая плашка
    card: '#fff', act: '#0073A0', mut: '#5a6b7e', fg: '#1b2733',
    bgAlt: '#eef1f5', br: '#d7dde5', ink2: '#3a3f4a'
  },
  fonts: {
    family: 'Inter,-apple-system,"Segoe UI",Roboto,Arial,sans-serif'
  },
  spacing: { s2: 4, s4: 8, s5: 10, s6: 12 }
};

// ---------- БЛОК 2: ВХОД + СОСТОЯНИЕ + ХЕЛПЕРЫ ----------
var rawData = (typeof data !== 'undefined' && Array.isArray(data)) ? data : [];

if (!window.__pvtState) window.__pvtState = {};
var __S = window.__pvtState;
if (!__S[CFG.ns]) __S[CFG.ns] = { tip: null, grain: 'd', sw: {}, open: false };
var state = __S[CFG.ns];
if (!state.sw) state.sw = {};   // защита при обновлении структуры с прошлых сессий

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
// Числа из BI приходят и числом, и строкой с пробелами-разрядами или запятой.
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  var s = String(v).replace(/[\s ]/g, '');
  // '1,5' -> дробная запятая; '1,234.5' -> запятая это разряды.
  if (s.indexOf(',') > -1 && s.indexOf('.') === -1) s = s.replace(/,/g, '.');
  else s = s.replace(/,/g, '');
  var n = Number(s);
  return isNaN(n) ? null : n;
}
// Универсальный парсер даты: epoch-ms, epoch-s, 'YYYY-MM-DD', 'YYYY-MM'.
// Нужен всегда: DATETIME из Proteus приходит числом, а не строкой из UI.
function toDate(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  var s = String(raw).trim(), d = null;
  if (/^\d{11,}$/.test(s)) { var ms = Number(s); d = new Date(ms > 1e12 ? ms : ms * 1000); }
  else if (/^\d{10}$/.test(s)) d = new Date(Number(s) * 1000);
  else {
    var m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(s);
    if (m) return { y: +m[1], m: +m[2] - 1, d: m[3] ? +m[3] : 1 };
    d = new Date(s);
  }
  if (!d || isNaN(d.getTime())) return null;
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}

// ---------- БЛОК 3: ТРАНСФОРМАЦИЯ ДАННЫХ ----------
// rawData -> структура, удобная для рендера. Только чтение CFG.fields.
// ЗДЕСЬ считается ВСЁ производное: агрегация, доли, дельты, ранги,
// накопительные итоги, сортировка. В SQL этого быть не должно.
// Данных нет: модель = константы CFG, рендер всегда из state.
function swDefaults() {
  var d = {};
  for (var i = 0; i < CFG.switches.length; i++) d[CFG.switches[i].key] = CFG.switches[i].def;
  return d;
}
function resetState() {
  state.grain = 'd';
  state.sw = swDefaults();
  state.open = false;
  state.tip = null;
}
if (state.grain === undefined) state.grain = 'd';
(function initSw() {
  var d = swDefaults();
  for (var k in d) if (state.sw[k] === undefined) state.sw[k] = d[k];
})();
function buildModel() {
  return { grains: CFG.grains, switches: CFG.switches };
}
var MODEL = buildModel();

// МАСКА КРОСС-ФИЛЬТРА (чистая функция — гоняет vm-стенд .render/vm_strip.js).
// Инвариант полки: НИ ОДИН фильтр не несёт value=[] (ронял запрос, 783708);
// свитки/период эмитятся ТОЛЬКО при отличии от дефолта; пустая маска =
// полный сброс applyCrossFilter([]) (прецедент 783469).
function maskOf(st) {
  var mk = function (col, val) { return { column: col, operator: 'IN', value: val }; };
  var fl = [];
  if (st.grain && st.grain !== 'd') fl.push(mk('period_param', [st.grain]));
  for (var i = 0; i < CFG.switches.length; i++) {
    var s = CFG.switches[i];
    if (st.sw[s.key] !== s.def) fl.push(mk(s.emit, [s.val]));
  }
  return fl;
}

// ---------- БЛОК 4: ФОРМАТИРОВАНИЕ И ЦВЕТ ----------
// Форматтеров нет: виджет не показывает чисел (контролы и константы).
function cssColor(c) {
  if (!c) return '#000';
  if (typeof c === 'string') return c;
  var a = (c.length >= 4) ? c[3] : 1;
  return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')';
}

// ---------- БЛОК 5: РАЗМЕТКА (<style> + HTML) ----------
// КАЖДЫЙ селектор начинается с .<ns>- или с .<ns>-root - иначе стили
// протекут в интерфейс Proteus. НИКАКИХ голых div/table/th/button.
// Стили из макета переносятся СЮДА ЦЕЛИКОМ, а не выбрасываются.
// ЦЕЛИКОМ — кроме рамки самой демо-страницы: фон/отступы body, центрирование,
// фикс-ширина внешнего контейнера НЕ переносятся. Корень остаётся width:100% —
// виджет тянется за ячейкой дашборда (RETRO 48). Оконные @media и vw/vh
// в ячейке не работают: адаптив — от контейнера (RETRO 49, RECIPES.md
// «Рамка макета ≠ рамка виджета»).
function buildCSS() {
  var P = '.' + CFG.ns;
  var C = CFG.colors;
  return [
    '<style>',
    P + '-root{width:100%;height:100%;box-sizing:border-box;'
            + 'font-family:' + CFG.fonts.family + ';}',
    P + '-root *{box-sizing:border-box;font-family:inherit;}',
    // ТУЛТИП живёт В BODY, вне -root — шрифт ему НЕ наследуется.
    P + '-tip{position:fixed;z-index:99999;pointer-events:none;opacity:0;'
           + 'font-family:' + CFG.fonts.family + ';box-sizing:border-box;'
           + 'transition:opacity .08s;}',
    P + '-tipbox{background:#fff;border-radius:6px;padding:8px 10px;max-width:260px;'
           + 'box-shadow:0 4px 10px rgba(20,28,45,.1),0 14px 34px rgba(20,28,45,.14);'
           + 'display:flex;flex-direction:column;gap:3px;}',
    P + '-t-h{font-size:12px;font-weight:700;color:' + C.fg + ';}',
    P + '-t-x{font-size:12px;color:#5a6b7e;line-height:1.45;}',
    // Полоска = белая плашка на сером канвасе борда (раунд 6 тела).
    P + '-strip{display:flex;align-items:center;flex-wrap:wrap;gap:8px;'
           + 'padding:8px 12px;background:' + C.card + ';border-radius:8px;'
           + 'box-shadow:0 1px 3px rgba(20,28,45,.07),0 4px 14px rgba(20,28,45,.04);}',
    P + '-strip-seg{display:inline-flex;align-items:center;gap:2px;'
           + 'background:' + C.bgAlt + ';border-radius:7px;padding:2px;}',
    P + '-strip-seg button{border:0;background:transparent;border-radius:5px;'
           + 'padding:5px 12px;font:inherit;font-size:12px;font-weight:600;'
           + 'color:' + C.mut + ';cursor:pointer;white-space:nowrap;}',
    P + '-strip-seg button.on{background:#fff;color:' + C.fg + ';'
           + 'box-shadow:0 1px 2px rgba(20,28,45,.12);}',
    P + '-strip-hint{font-size:12px;color:' + C.mut + ';}',
    P + '-sp{flex:1;}',
    P + '-opts{position:relative;display:inline-flex;}',
    P + '-opts-trg{display:inline-flex;align-items:center;gap:6px;'
           + 'border:1px solid ' + C.br + ';background:#fff;border-radius:7px;'
           + 'padding:6px 12px;font:inherit;font-size:12px;font-weight:600;'
           + 'color:' + C.fg + ';cursor:pointer;white-space:nowrap;}',
    P + '-opts-trg:hover,' + P + '-opts.open ' + P + '-opts-trg{'
           + 'border-color:' + C.act + ';color:' + C.act + ';}',
    P + '-opts-pop{position:absolute;z-index:60;top:calc(100% + 6px);left:0;'
           + 'min-width:290px;background:#fff;border-radius:8px;padding:10px;'
           + 'box-shadow:0 4px 10px rgba(20,28,45,.1),0 14px 34px rgba(20,28,45,.14);'
           + 'display:flex;flex-direction:column;gap:2px;}',
    P + '-opts-pop ' + P + '-swt{padding:4px 2px;}',
    P + '-st-c{font-size:10px;color:inherit;}',
    P + '-swt{display:flex;align-items:center;gap:8px;cursor:pointer;'
           + 'font-size:11.5px;color:' + C.ink2 + ';font-weight:500;line-height:1.35;}',
    P + '-swt input{appearance:none;width:32px;height:18px;border-radius:999px;'
           + 'background:#dfe3ea;position:relative;cursor:pointer;flex:0 0 auto;'
           + 'transition:background .16s;margin:0;}',
    P + '-swt input:after{content:\'\';position:absolute;top:2px;left:2px;width:14px;height:14px;'
           + 'border-radius:50%;background:#fff;transition:transform .16s;'
           + 'box-shadow:0 1px 2px rgba(20,28,45,.25);}',
    P + '-swt input:checked{background:' + C.act + ';}',
    P + '-swt input:checked:after{transform:translateX(14px);}',
    P + '-info{display:inline-flex;align-items:center;justify-content:center;'
           + 'width:14px;height:14px;border-radius:50%;flex:0 0 auto;'
           + 'border:1px solid ' + C.br + ';color:' + C.mut + ';font-size:9px;'
           + 'font-style:normal;font-weight:700;cursor:help;vertical-align:middle;}',
    P + '-btn-ghost{border:1px solid transparent;color:' + C.act + ';'
           + 'background:transparent;border-radius:9px;padding:6px 14px;'
           + 'font:inherit;font-size:13px;font-weight:600;cursor:pointer;'
           + 'display:inline-flex;align-items:center;}',
    P + '-btn-ghost:hover{background:rgba(0,115,160,.08);}',
    '</style>'
  ].join('');
}
// Только конкатенация строк. Все данные через esc().
function buildHTML() {
  var h = [];
  h.push('<div class="' + CFG.ns + '-root">');
  h.push('<div class="' + CFG.ns + '-strip">');
  // Период: 4 взаимоисключающих кнопки.
  h.push('<div class="' + CFG.ns + '-strip-seg" role="group" aria-label="Период">');
  for (var i = 0; i < MODEL.grains.length; i++) {
    var g = MODEL.grains[i];
    h.push('<button data-grain="' + esc(g.id) + '"' +
           (g.id === state.grain ? ' class="on"' : '') + '>' + esc(g.label) + '</button>');
  }
  h.push('</div>');
  // Поповер «Опции» (3 свитка; содержимое — только в открытом состоянии).
  var open = !!state.open;
  h.push('<div class="' + CFG.ns + '-opts' + (open ? ' open' : '') + '">');
  h.push('<button class="' + CFG.ns + '-opts-trg" data-ddtoggle="opts"' +
         ' aria-expanded="' + open + '" data-tip="optsTrg">Опции' +
         ' <span class="' + CFG.ns + '-st-c" aria-hidden="true">▾</span></button>');
  if (open) {
    h.push('<div class="' + CFG.ns + '-opts-pop">');
    for (var j = 0; j < MODEL.switches.length; j++) {
      var s = MODEL.switches[j];
      var on = !!state.sw[s.key];
      h.push('<label class="' + CFG.ns + '-swt"><input type="checkbox" data-f="' +
             esc(s.key) + '"' + (on ? ' checked' : '') + '><span>' + esc(s.label) +
             (s.hint ? ' <span class="' + CFG.ns + '-info" data-tip="exc" role="button"' +
              ' tabindex="0">i</span>' : '') + '</span></label>');
    }
    h.push('</div>');
  }
  h.push('</div>');
  h.push('<span class="' + CFG.ns + '-strip-hint">активные условия — чипами над каталогом</span>');
  h.push('<span class="' + CFG.ns + '-sp"></span>');
  h.push('<button class="' + CFG.ns + '-btn-ghost" data-action="resetAll">Сбросить всё</button>');
  h.push('</div>');
  h.push('</div>');
  return buildCSS() + h.join('');
}

// ---------- БЛОК 6: МОНТАЖ + ИНТЕРАКТИВ ----------
(function mount() {
  try {
    var hosts = document.querySelectorAll('[_echarts_instance_]');
    if (!hosts || hosts.length === 0) return;
    var host = hosts[hosts.length - 1];
    var cvs = host.querySelectorAll('canvas');
    for (var i = 0; i < cvs.length; i++) cvs[i].style.display = 'none';
    var prev = host.querySelector('.' + CFG.ns + '-overlay');
    if (prev) prev.parentNode.removeChild(prev);

    var overlay = document.createElement('div');
    overlay.className = CFG.ns + '-overlay';
    overlay.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;'
      + 'z-index:10;overflow:auto;box-sizing:border-box;background:' + CFG.colors.bg + ';';
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(overlay);

    // ── ТУЛТИП ──
    // Создаётся РОВНО ОДИН РАЗ и кэшируется в tipEl.
    // НИКОГДА не создавай его внутри render() и НИКОГДА не клади
    // его разметку в buildHTML(): innerHTML убьёт узел, и тултип перестанет
    // работать после первого же перерисовывания.
    var tipEl = null;
    function getTip() {
      if (tipEl && tipEl.parentNode) return tipEl;
      var old = document.querySelector('body > .' + CFG.ns + '-tip');
      if (old) old.parentNode.removeChild(old);
      tipEl = document.createElement('div');
      tipEl.className = CFG.ns + '-tip';
      document.body.appendChild(tipEl);
      return tipEl;
    }
    getTip();

    // showTip/hideTip — СЛУЖЕБНЫЕ. Не переписывать, не переименовывать, не
    // копировать их логику в свой код. Здесь заперты два правила, на которых
    // ломались все предыдущие версии:
    //   1) тултип спрятан ДВУМЯ свойствами (display + opacity) — показ обязан
    //      снять ОБА. Снял одно — узел построится и останется невидимым,
    //      без ошибок и без единого следа в отладке (RETRO 44);
    //   2) тултип лежит в body с position:fixed, поэтому координаты
    //      getBoundingClientRect() берутся КАК ЕСТЬ, а клампинг идёт по
    //      window.innerWidth/innerHeight — не по размерам контейнера (RETRO 26).
    // Твоё дело — только содержимое и якорь. Видимость и позицию считает showTip.
    function showTip(html, rect) {
      var tip = getTip();
      tip.innerHTML = html;
      tip.style.display = 'block';
      tip.style.left = '0px';
      tip.style.top = '0px';
      var t = tip.getBoundingClientRect();
      var pad = 6, gap = 8;
      var left = rect.left + rect.width / 2 - t.width / 2;
      var top = rect.top + rect.height + gap;
      if (top + t.height > window.innerHeight - pad) top = rect.top - t.height - gap;
      left = Math.max(pad, Math.min(left, window.innerWidth - t.width - pad));
      top = Math.max(pad, Math.min(top, window.innerHeight - t.height - pad));
      tip.style.left = Math.round(left) + 'px';
      tip.style.top = Math.round(top) + 'px';
      tip.style.opacity = '1';
    }
    function hideTip() {
      var tip = getTip();
      tip.style.opacity = '0';
      tip.style.display = 'none';
    }

    // Показ/скрытие тултипа НЕ требует полного render(): hover меняет только
    // содержимое и позицию, полный render() — только на клик (RETRO 20).
    // Якорь (rect) клади в state.tip при наведении: getBoundingClientRect()
    // цели КАК ЕСТЬ, без вычитания rect корня.
    function renderTip() {
      if (!state.tip) { hideTip(); return; }
      var t = CFG.tips[state.tip.key];
      var html = '';
      if (t) {
        html = '<div class="' + CFG.ns + '-tipbox">';
        if (t.title) html += '<span class="' + CFG.ns + '-t-h">' + esc(t.title) + '</span>';
        if (t.text) html += '<span class="' + CFG.ns + '-t-x">' + esc(t.text) + '</span>';
        html += '</div>';
      }
      showTip(html, state.tip.rect);
    }

    // render ТОЛЬКО пересобирает разметку. Делегированные обработчики
    // навешиваются ОДИН РАЗ СНАРУЖИ render(): overlay не пересоздаётся.
    // Любой addEventListener внутри render() ЗАПРЕЩЁН — он создаёт дубли.
    function render() {
      overlay.innerHTML = buildHTML();
      renderTip();
    }

    // Имена атрибутов — ЧАСТЬ КОНТРАКТА, а не стиль: `data-tip`, `data-kind`,
    // `data-action`, `data-view` — ровно эти, ЦЕЛИКОМ. По ним smoke.mjs ищет,
    // что наводить и на что кликать. Своё имя (`data-tip-kind`) он не найдёт,
    // а склейка с префиксом (`CFG.ns + '-data-tip'`) в DOM даёт `pvt-data-tip`:
    // виджет при этом работает — свой же обработчик читает то же имя, — но
    // ВЕСЬ тултиповый слой уходит в N/A, и экрана не видит никто (RETRO 56, 59).
    // Префикс CFG.ns нужен КЛАССАМ, data-атрибутам — нет.
    function trigger(node, attr) {
      while (node && node !== overlay) {
        if (node.getAttribute && node.getAttribute(attr) !== null) return node;
        node = node.parentNode;
      }
      return null;
    }

    function onOver(e) {
      var el = trigger(e.target, 'data-tip');
      if (!el) return;
      // Якорь — rect ЦЕЛИ как есть. Ключ тултипа = значение data-tip
      // ('optsTrg' | 'exc'), содержимое собирает renderTip по CFG.tips.
      state.tip = {
        rect: el.getBoundingClientRect(),
        kind: el.getAttribute('data-kind') || '',
        key: el.getAttribute('data-tip') || ''
      };
      renderTip();
    }

    function onOut(e) {
      var el = trigger(e.target, 'data-tip');
      if (!el) return;
      // Переход курсора на ДОЧЕРНИЙ узел той же цели тултип не гасит,
      // иначе он мигает посреди наведения.
      var to = e.relatedTarget;
      while (to) {
        if (to === el) return;
        to = to.parentNode;
      }
      state.tip = null;
      hideTip();
    }

    function emitFilters() {
      if (typeof applyCrossFilter !== 'function') return;
      applyCrossFilter(maskOf(state));
    }

    function onClick(e) {
      // Период: взаимоисключающий выбор.
      var gr = trigger(e.target, 'data-grain');
      if (gr) {
        state.grain = gr.getAttribute('data-grain');
        render();
        emitFilters();
        return;
      }
      // Свиток: браузер уже тогглит input.checked до click-события.
      var sw = trigger(e.target, 'data-f');
      if (sw && sw.tagName === 'INPUT') {
        state.sw[sw.getAttribute('data-f')] = sw.checked;
        render();
        emitFilters();
        return;
      }
      // Поповер «Опции».
      var dd = trigger(e.target, 'data-ddtoggle');
      if (dd) {
        state.open = !state.open;
        render();
        return;
      }
      // Сброс: своя маска целиком (чужие условия снимают их писатели).
      var rs = trigger(e.target, 'data-action');
      if (rs && rs.getAttribute('data-action') === 'resetAll') {
        resetState();
        render();
        emitFilters();   // пустая маска = applyCrossFilter([])
      }
    }

    overlay.addEventListener('mouseover', onOver);
    overlay.addEventListener('mouseout', onOut);
    overlay.addEventListener('click', onClick);

    // Глобальные слушатели переживают перезапуск скрипта и накапливаются.
    // Старый снимаем ЯВНО, ссылку держим в state. Escape вешай здесь же,
    // тем же способом, и никогда не внутри render().
    if (state.onWinResize) window.removeEventListener('resize', state.onWinResize);
    state.onWinResize = function () { if (state.tip) renderTip(); };
    window.addEventListener('resize', state.onWinResize);

    // Клик-вне и Esc закрывают поповер опций.
    if (state.onDocClick) document.removeEventListener('click', state.onDocClick);
    state.onDocClick = function (ev) {
      if (!state.open) return;
      var n = ev.target;
      while (n && n !== document.body) {
        if (n.className === CFG.ns + '-opts' || (n.getAttribute && n.getAttribute('data-ddtoggle') === 'opts')) return;
        n = n.parentNode;
      }
      state.open = false;
      render();
    };
    document.addEventListener('click', state.onDocClick);
    if (state.onDocKey) document.removeEventListener('keydown', state.onDocKey);
    state.onDocKey = function (ev) {
      if ((ev.key === 'Escape' || ev.keyCode === 27) && state.open) {
        state.open = false;
        render();
      }
    };
    document.addEventListener('keydown', state.onDocKey);

    render();

    // ResizeObserver только правит габариты. НЕ вызывать render() — зациклит.
    // Старый observer отключаем: иначе он держит удалённый overlay.
    if (typeof ResizeObserver !== 'undefined') {
      if (state.ro && state.ro.disconnect) state.ro.disconnect();
      var ro = new ResizeObserver(function() {
        overlay.style.width = '100%'; overlay.style.height = '100%';
      });
      ro.observe(host);
      state.ro = ro;
    }
  } catch (e) {
    // option присваивается позже, в БЛОКЕ 7: из catch к нему не обращаться.
    // Ищем overlay внутри СВОЕГО хоста: на дашборде может быть второй виджет
    // с тем же ns, и сообщение об ошибке уедет не туда.
    var box = null;
    var hs = document.querySelectorAll('[_echarts_instance_]');
    if (hs && hs.length) box = hs[hs.length - 1].querySelector('.' + CFG.ns + '-overlay');
    if (!box) box = document.querySelector('.' + CFG.ns + '-overlay');
    if (box) {
      box.innerHTML = '<div style="padding:16px;font:13px -apple-system,Arial,sans-serif;color:#b00020;">'
        + 'Ошибка графика: ' + esc((e && e.message) || e) + '</div>';
    }
  }
})();

// ---------- БЛОК 7: ПУСТОЙ OPTION ----------
// ГЛОБАЛЬНО, В САМОМ КОНЦЕ, ВНЕ функций и IIFE.
// После этого присваивания option не трогать: любая мутация вернёт eCharts
// к отрисовке своего графика поверх overlay.
option = {
  animation: false,
  xAxis: { show: false, type: 'value' },
  yAxis: { show: false, type: 'value' },
  series: [{ type: 'scatter', data: [] }]
};
