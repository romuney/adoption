/* ============================================================================
   UI-слой: форматтеры чисел, единый конструктор подсказок, сборщики
   компонентов. Экраны разметку сами не пишут — только зовут эти функции.
   ========================================================================== */
(function (global) {
  'use strict';

  const THIN = ' ';          // тонкий пробел — разряды
  const MINUS = '−';         // типографский минус

  /* ------------------------------ Числа --------------------------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function nf(v, dec) {
    if (v == null || !isFinite(v)) return '—';
    const d = dec == null ? 0 : dec;
    const neg = v < 0;
    const s = Math.abs(v).toFixed(d);
    const [i, f] = s.split('.');
    const ii = i.replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
    return (neg ? MINUS : '') + ii + (f ? ',' + f : '');
  }
  const pct = (v, dec) => (v == null || !isFinite(v)) ? '—' : nf(v, dec == null ? 1 : dec) + '%';
  // Русское склонение: plural(81, 'пользователь', 'пользователя', 'пользователей')
  function plural(n, one, few, many) {
    n = Math.abs(Math.round(n));
    const d10 = n % 10, d100 = n % 100;
    if (d10 === 1 && d100 !== 11) return one;
    if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return few;
    return many;
  }
  const compact = (v) => {
    if (v == null) return '—';
    const a = Math.abs(v);
    if (a >= 1e6) return nf(v / 1e6, 1) + 'M';
    if (a >= 1e4) return nf(v / 1e3, 0) + 'K';
    if (a >= 1e3) return nf(v / 1e3, 1) + 'K';
    return nf(v, 0);
  };
  function signed(v, dec, unit) {
    if (v == null || !isFinite(v)) return '—';
    const d = dec == null ? 0 : dec;
    const s = nf(Math.abs(v), d);
    const sign = v > 0 ? '+' : (v < 0 ? MINUS : '');
    return sign + s + (unit || '');
  }
  const days = (v) => v == null ? '—' : nf(v, 0) + THIN + 'дн';

  const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const MONTHS_FULL = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const p2 = (n) => (n < 10 ? '0' : '') + n;

  function fmtDate(ts) {
    const d = new Date(ts);
    return p2(d.getUTCDate()) + '.' + p2(d.getUTCMonth() + 1) + '.' + d.getUTCFullYear();
  }
  function isoWeek(ts) {
    const d = new Date(ts);
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return { week: Math.ceil((((t - y0) / 86400000) + 1) / 7), year: t.getUTCFullYear() };
  }
  /* Подпись бакета на оси X — одинакова во всех графиках отчёта */
  function axisLabel(ts, grain) {
    const d = new Date(ts);
    if (grain === 'd') return p2(d.getUTCDate()) + '.' + p2(d.getUTCMonth() + 1);
    if (grain === 'w') return 'W' + p2(isoWeek(ts).week);
    if (grain === 'm') return MONTHS[d.getUTCMonth()];
    return 'Q' + (Math.floor(d.getUTCMonth() / 3) + 1) + ' ' + String(d.getUTCFullYear()).slice(2);
  }
  function bucketTitle(ts, grain) {
    const d = new Date(ts);
    if (grain === 'd') return fmtDate(ts);
    if (grain === 'w') { const w = isoWeek(ts); return 'Неделя ' + w.week + ', ' + w.year + ' — с ' + fmtDate(ts); }
    if (grain === 'm') return MONTHS_FULL[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
    return (Math.floor(d.getUTCMonth() / 3) + 1) + '-й квартал ' + d.getUTCFullYear();
  }
  const prevLabel = (grain) => ({ d: 'к пред. дню', w: 'к пред. неделе', m: 'к пред. месяцу', q: 'к пред. кварталу' }[grain]);
  const periodLabel = (grain) => ({ d: 'за 30 дней', w: 'за 20 недель', m: 'за 12 месяцев', q: 'за 8 кварталов' }[grain]);
  const prevPeriodLabel = (grain) => ({ d: 'к пред. 30 дням', w: 'к пред. 20 неделям', m: 'к пред. 12 месяцам', q: 'к пред. 8 кварталам' }[grain]);

  /* --------------------------- Подсказки -------------------------------- */
  function tipHtml(o) {
    if (o == null) return '';
    if (typeof o === 'string') return o;
    let s = '';
    if (o.title) s += '<span class="t-h">' + esc(o.title) + '</span>';
    if (o.text) s += '<span class="t-x">' + esc(o.text) + '</span>';
    (o.rows || []).forEach((r) => {
      if (!r) return;
      const mk = r.color
        ? '<i class="t-m' + (r.dash ? ' dash' : '') + '" style="' +
          (r.dash ? 'border-top-color:' : 'background:') + r.color + '"></i>'
        : '';
      s += '<span class="t-r' + (r.dash ? ' bench' : '') + '">' + mk +
        '<span class="t-l">' + esc(r.label) + '</span>' +
        '<b class="t-v">' + esc(r.value) + '</b></span>';
    });
    const ns = o.note == null ? [] : (Array.isArray(o.note) ? o.note : [o.note]);
    ns.forEach((n) => { if (n) s += '<span class="t-n">' + esc(n) + '</span>'; });
    return s;
  }
  const tip = (o) => ' data-tip="' + esc(tipHtml(o)) + '"';

  (function () {
    let el = null, cur = null;
    function node() {
      if (!el) {
        el = document.createElement('div');
        el.className = 'tip';
        el.setAttribute('role', 'tooltip');
        document.body.appendChild(el);
      }
      return el;
    }
    function place(n, x, y) {
      const w = n.offsetWidth || 220, h = n.offsetHeight || 60;
      let l = x + 16, t = y - h - 14;
      if (l + w > innerWidth - 10) l = x - w - 16;
      if (l < 10) l = 10;
      if (t < 10) t = y + 20;
      n.style.left = Math.round(l) + 'px';
      n.style.top = Math.round(t) + 'px';
    }
    function hide() { if (el) el.classList.remove('on'); cur = null; }
    document.addEventListener('mousemove', (e) => {
      const t = e.target.closest ? e.target.closest('[data-tip]') : null;
      if (!t) { if (cur) hide(); return; }
      const n = node();
      if (cur !== t) { cur = t; n.innerHTML = t.getAttribute('data-tip') || ''; }
      n.classList.add('on');
      place(n, e.clientX, e.clientY);
    }, { passive: true });
    document.addEventListener('mouseleave', hide, true);
    document.addEventListener('click', hide, true);
    addEventListener('scroll', hide, true);
  })();

  /* ------------------------- Пилюля изменения ---------------------------- */
  /* Знак отвечает за направление, класс — за оценку.
     invert:true — метрика, где рост это плохо. neutral:true — «больше не
     значит лучше», не красим вообще. */
  function delta(v, opts) {
    const o = opts || {};
    if (v == null || !isFinite(v)) {
      return '<span class="nocmp"' + tip({ title: 'Сравнение', text: o.why || 'Не с чем сравнивать: нет предыдущего периода.' }) + '>не сравнивается</span>';
    }
    const dec = o.dec == null ? 1 : o.dec;
    const unit = o.unit || '';
    let cls;
    if (o.neutral) cls = 'neu';
    else if (Math.abs(v) < (o.dead == null ? 0.05 : o.dead)) cls = 'flat';
    else cls = (v > 0) === !o.invert ? 'up' : 'down';
    const vs = o.vs ? '<span class="d-vs">' + esc(o.vs) + '</span>' : '';
    const t = o.tip ? tip(o.tip) : '';
    return '<span class="delta ' + cls + '"' + t + '>' + signed(v, dec, unit) + vs + '</span>';
  }

  /* ---------------------------- KPI-карточка -----------------------------
     Всегда ровно четыре строки: подпись, значение, дельта, база. Пустая
     строка воздуха не занимает, но держит выравнивание всей полосы. */
  function kpi(o) {
    return '<div class="kpi">' +
      '<div class="k-label">' + esc(o.label) +
        (o.hint ? '<span class="info"' + tip(o.hint) + ' aria-label="Пояснение">i</span>' : '') +
        (o.tag ? '<span class="kpi-tag">' + esc(o.tag) + '</span>' : '') +
      '</div>' +
      '<div class="k-val">' + o.value + '</div>' +
      '<div class="k-row">' + (o.delta || '') + '</div>' +
      '<div class="k-row">' + (o.sub ? '<span class="k-sub">' + o.sub + '</span>' : '') + '</div>' +
      '</div>';
  }
  const kpis = (arr, n) => '<div class="kpis compact n' + (n || arr.length) + '">' + arr.join('') + '</div>';

  /* -------------------- Разбивка: таблица с полосой ----------------------
     Полоса растёт от левого края, масштаб от нуля до максимума по столбцу,
     цвет внутри таблицы один. ИТОГО — первой строкой. */
  function barTable(o) {
    const rows = o.rows || [];
    const max = Math.max(1, ...rows.map((r) => r.bar));
    const cols = o.cols || [];
    let h = '<table class="ptable btable' + (o.dense ? ' dense' : '') + '">';
    h += '<colgroup><col style="width:' + (o.firstW || '38%') + '">' +
      cols.map(() => '<col style="width:' + (o.colW || '13%') + '">').join('') +
      '<col></colgroup>';
    h += '<thead><tr><th class="txt">' + esc(o.firstH || '') + '</th>' +
      cols.map((c) => '<th' + (c.hint ? tip(c.hint) : '') + '>' + esc(c.label) + '</th>').join('') +
      '<th class="txt bar-th">' + esc(o.barH || 'Распределение') + '</th></tr></thead><tbody>';

    if (o.total) {
      h += '<tr class="total"' + (o.total.tip ? tip(o.total.tip) : '') + '><td class="txt">ИТОГО</td>' +
        o.total.cells.map((c, i) => '<td class="' + (i === 0 ? 'lead' : '') + '">' + c + '</td>').join('') +
        '<td class="barcell"></td></tr>';
    }
    rows.forEach((r) => {
      const sel = o.selected === r.key ? ' sel' : '';
      // строки кликабельны только там, где клик что-то делает: есть cutKey
      const act = o.cutKey
        ? ' data-slice="' + esc(o.cutKey) + '" data-val="' + esc(r.key) + '"' +
          ' tabindex="0" role="button" aria-pressed="' + (sel ? 'true' : 'false') + '"'
        : '';
      h += '<tr class="' + (o.cutKey ? 'urow' : 'row') + sel + '"' + act + '>' +
        '<td class="txt">' + esc(r.label) +
          (r.sub ? '<span class="unit-sub">' + esc(r.sub) + '</span>' : '') + '</td>' +
        r.cells.map((c, i) => '<td class="' + (i === 0 ? 'lead' : '') + '">' + c + '</td>').join('') +
        '<td class="barcell"' + (r.tip ? tip(r.tip) : '') + '>' +
          '<span class="cellbar ' + (o.barClass || '') + '"><i style="width:' +
          (100 * r.bar / max).toFixed(1) + '%"></i></span></td></tr>';
    });
    h += '</tbody></table>';
    if (o.note) h += '<div class="tbl-note">' + o.note + '</div>';
    return h;
  }

  /* ------------------------------ Матрица --------------------------------
     Заливка однотонная: «много» не значит «плохо». (Компонент вне active-
     экранов; оставлен как строительный блок.) */
  function matrix(o) {
    const max = Math.max(1, ...o.rows.map((r) => Math.max(...r.cells.map((c) => c.v == null ? 0 : c.v))));
    let h = '<div class="mx-wrap"><table class="mxtable"><thead><tr><th class="mx-corner"></th>' +
      o.cols.map((c) => '<th class="mx-h">' + esc(c) + '</th>').join('') + '</tr></thead><tbody>';
    o.rows.forEach((r) => {
      h += '<tr><td class="txt">' + esc(r.label) + '</td>' + r.cells.map((c) => {
        if (c.v == null) return '<td class="mx-cell zero">—</td>';
        const a = Math.max(.06, Math.min(1, c.v / max));
        return '<td class="mx-cell" style="background:rgba(15,157,143,' + (a * .42).toFixed(3) + ')"' +
          (c.tip ? tip(c.tip) : '') + '>' + c.txt + '</td>';
      }).join('') + '</tr>';
    });
    h += '</tbody></table></div>';
    if (o.note) h += '<div class="tbl-note">' + o.note + '</div>';
    return h;
  }

  /* --------------------------- Когорты -----------------------------------
     Устройство взято из «Закрепляемости 2.0» действующего борда: строка —
     месяц первого визита, рядом размер когорты полосой, дальше возраст.

     Раскраска — тоже из борда, один в один: цвет ячейки это ОТКЛОНЕНИЕ
     ОТ МЕДИАНЫ СВОЕГО СТОЛБЦА. Медиана считается только по закрытым
     месяцам; масштаб шкалы — максимальное отклонение в данных; голубой —
     выше медианы, жёлтый — ниже, белый — медиана. Незакрытый месяц —
     серый курсив: его значение ещё дорастёт.

     Столбца «старт» нет: в нём по построению всегда 100% и та же самая
     когорта — смотреть не на что. */
  const DIV_LOW = [255, 218, 122];   // жёлтый: ниже медианы
  const DIV_MID = [255, 255, 255];   // белый: медиана
  const DIV_HIGH = [160, 222, 255];  // голубой: выше медианы
  function medianOf(vals) {
    if (!vals.length) return null;
    const s = vals.slice().sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function mixRgb(c1, c2, t) {
    return 'rgb(' + Math.round(c1[0] + (c2[0] - c1[0]) * t) + ',' +
      Math.round(c1[1] + (c2[1] - c1[1]) * t) + ',' +
      Math.round(c1[2] + (c2[2] - c1[2]) * t) + ')';
  }
  function divColor(v, med, span) {
    if (v == null || med == null || !isFinite(v) || !isFinite(med)) return 'rgb(255,255,255)';
    let d = (v - med) / (span || 20);
    d = Math.max(-1, Math.min(1, d));
    return d >= 0 ? mixRgb(DIV_MID, DIV_HIGH, d) : mixRgb(DIV_MID, DIV_LOW, -d);
  }
  function cohortTable(o) {
    const rows = o.rows || [];
    const maxAge = o.maxAge || Math.max(1, ...rows.map((r) => r.cells.length));
    const maxSize = Math.max(1, ...rows.map((r) => r.size));
    const pctOf = (r, c) => (r.size ? c.active / r.size * 100 : 0);

    /* Медианы столбцов и размах шкалы — только по ЗАКРЫТЫМ месяцам:
       незакрытый месяц занизил бы и медиану, и край палитры. */
    const med = {}; let maxDev = 0;
    for (let a = 1; a <= maxAge; a++) {
      const vals = [];
      rows.forEach((r) => {
        const c = r.cells[a - 1];
        if (c && !c.partial) vals.push(pctOf(r, c));
      });
      med[a] = medianOf(vals);
    }
    rows.forEach((r) => r.cells.forEach((c, i) => {
      if (c.partial || med[i + 1] == null) return;
      const dev = Math.abs(pctOf(r, c) - med[i + 1]);
      if (dev > maxDev) maxDev = dev;
    }));
    const span = maxDev > 0.001 ? maxDev : 20;

    /* Легенда — один короткий спан: на панели ~700px длинная легенда
       переносилась и её вторая строка висела вплотную к шапке таблицы,
       читалось как наложение. Остальные договорённости — в примечании
       под таблицей и в подсказках шапки. */
    let h = '<div class="ct-legend">' +
      '<span class="sw" aria-hidden="true"></span>' +
      '<span>жёлтый — ниже медианы столбца · голубой — выше</span></div>';

    h += '<div class="ct-wrap"><table class="cttable"><colgroup>' +
      '<col class="ct-c1"><col class="ct-c2">' +
      new Array(maxAge).fill('<col class="ct-c3">').join('') +
      '</colgroup><thead><tr>' +
      /* Шапки однострочные: «Месяц первого визита» в три строки переносилось
         и отдаляло значения от заголовка. Полная формулировка — в подсказке. */
      '<th class="txt"' + tip({ text: o.firstTip || 'Месяц первого визита' }) + '>Когорта</th>' +
      '<th class="ct-size-h"' + tip({ text: o.sizeNote || 'Столько человек открыли отчёт впервые в этом месяце' }) + '>Пришло</th>';
    for (let a = 1; a <= maxAge; a++) {
      const medTip = med[a] != null
        ? tip({
          title: '+' + a + ' ' + plural(a, 'месяц', 'месяца', 'месяцев'),
          rows: [{ label: 'Медиана столбца', value: pct(med[a]) }],
          note: '«м» в шапке — медиана закрытых ячеек этого столбца; цвет ячейки — отклонение от неё',
        })
        : '';
      h += '<th class="ct-h"' + medTip + '>+' + a +
        (med[a] != null ? '<span class="ct-med">м ' + pct(med[a], 0) + '</span>' : '') + '</th>';
    }
    h += '</tr></thead><tbody>';

    rows.forEach((r) => {
      const d = new Date(r.cohort_month);
      const lbl = MONTHS[d.getUTCMonth()] + ' ' + String(d.getUTCFullYear()).slice(2);
      h += '<tr><td class="txt"' + tip({ title: MONTHS_FULL[d.getUTCMonth()] + ' ' + d.getUTCFullYear(), text: o.firstTip || 'Месяц первого визита' }) + '>' + esc(lbl) + '</td>' +
        '<td class="ct-size"' + tip({
          title: MONTHS_FULL[d.getUTCMonth()] + ' ' + d.getUTCFullYear(),
          rows: [{ label: 'Пришли впервые', value: nf(r.size), color: '#4361ee' }],
          note: o.sizeNote || 'Столько человек открыли отчёт впервые в этом месяце',
        }) + '><div class="ct-sz">' +
          '<span class="ct-bar"><i style="width:' + (100 * r.size / maxSize).toFixed(1) + '%"></i></span>' +
          '<b>' + nf(r.size) + '</b></div></td>';
      for (let a = 1; a <= maxAge; a++) {
        const c = r.cells[a - 1];
        if (!c) { h += '<td class="ct-cell none"></td>'; continue; }
        const p = pctOf(r, c);
        const tipObj = {
          title: lbl + ' → +' + a + ' ' + plural(a, 'месяц', 'месяца', 'месяцев'),
          rows: [
            { label: 'Вернулись', value: nf(c.active), color: '#4361ee' },
            { label: 'Из когорты', value: nf(r.size), dash: true, color: '#c7c8cc' },
            { label: 'Удержание', value: pct(p) },
          ],
          note: [],
        };
        if (c.partial) {
          tipObj.note.push('Месяц ещё не закрыт — значение будет расти, в раскраске не участвует');
        } else if (med[a] != null) {
          tipObj.rows.push({ label: 'Медиана столбца', value: pct(med[a], 0) });
          tipObj.note.push(p >= med[a]
            ? 'Выше медианы столбца на ' + pct(p - med[a], 0)
            : 'Ниже медианы столбца на ' + pct(med[a] - p, 0));
        }
        const bg = c.partial ? '' : divColor(p, med[a], span);
        h += '<td class="ct-cell' + (c.partial ? ' part' : '') + '"' +
          (bg ? ' style="background:' + bg + '"' : '') +
          tip(tipObj) + '>' + pct(p, 0) + '</td>';
      }
      h += '</tr>';
    });
    h += '</tbody></table></div>';
    if (o.note) h += '<div class="tbl-note">' + o.note + '</div>';
    return h;
  }

  /* --------------------------- Наблюдения --------------------------------
     Не LLM: это отбор фактов по фиксированным порогам. Порог всегда назван
     в теле — чтобы читатель видел, почему факт сюда попал. */
  function observations(list, id) {
    if (!list.length) {
      return '<div class="no-insight"><span class="ok-dot"></span>' +
        'Отклонений выше порогов нет: показатели в пределах обычного разброса.</div>';
    }
    const top = list[0];
    return '<div class="obs sev-' + (top.sev || 'none') + '" data-obs="' + id + '">' +
      '<div class="obs-h" role="button" tabindex="0" aria-expanded="false" aria-controls="obsb-' + id + '">' +
        '<span class="obs-ico" aria-hidden="true">!</span>' +
        '<span class="obs-t">Что видно в данных</span>' +
        '<span class="obs-lead">' + top.lead + '</span>' +
        '<span class="obs-tag">подробнее</span>' +
        '<span class="obs-caret" aria-hidden="true">▸</span>' +
      '</div>' +
      '<div class="obs-b" id="obsb-' + id + '" hidden><ul>' +
        list.map((o) => '<li>' + o.body + '</li>').join('') +
      '</ul><span class="rule">Отбор по порогам, без языковой модели: ' + esc(list.map((o) => o.rule).join('; ')) + '.</span></div>' +
      '</div>';
  }

  /* ------------------------------ Панель --------------------------------- */
  function panel(o) {
    return '<div class="panel' + (o.cls ? ' ' + o.cls : '') + '">' +
      '<div class="panel-h' + (o.tabs ? ' with-tabs' : '') + '">' +
        '<div class="h-txt"><span>' + esc(o.title) + '</span>' +
          (o.sub ? '<span class="sub">' + esc(o.sub) + '</span>' : '') + '</div>' +
        (o.right || '') +
        (o.tabs ? '<div class="sub-tabs">' + o.tabs.map((t) =>
          '<button class="sub-tab' + (t.on ? ' active' : '') + '" data-stab="' + esc(o.tabKey) +
          '" data-val="' + esc(t.key) + '">' + esc(t.label) + '</button>').join('') + '</div>' : '') +
      '</div>' +
      (o.under || '') +
      '<div class="panel-b' + (o.bodyCls ? ' ' + o.bodyCls : '') + '">' + o.body + '</div>' +
      '</div>';
  }

  const chip = (label, key) => '<span class="chip">' + esc(label) +
    '<button class="x" data-unchip="' + esc(key) + '" aria-label="Снять фильтр">×</button></span>';
  const benchChip = (html) => '<span class="chip bench">' + html + '</span>';

  /* Поле поиска в шапке панели. Иконка — инлайн-SVG (иконочных шрифтов в
     системе нет), цвет берётся от currentColor, а не хардкодом. */
  function searchBox(id, placeholder, value) {
    return '<div class="psearch">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
      '<input id="' + esc(id) + '" type="search" placeholder="' + esc(placeholder) + '" value="' + esc(value || '') + '">' +
      '</div>';
  }

  global.UI = {
    THIN, MINUS, esc, nf, pct, plural, compact, signed, days,
    fmtDate, axisLabel, bucketTitle, isoWeek, MONTHS, MONTHS_FULL,
    prevLabel, periodLabel, prevPeriodLabel,
    tip, tipHtml, delta, kpi, kpis, barTable, matrix, cohortTable, observations, panel,
    chip, benchChip, searchBox,
  };
})(window);
