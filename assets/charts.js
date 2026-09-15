/* ============================================================================
   Рисовальный слой: сборщики option для ECharts.

   Эти функции переносятся в Proteus почти дословно — в react_sanbbox-чарт
   отдаётся `data` из датасета вкладки, наружу уходит `option`. Поэтому здесь
   нет обращений к DOM и к состоянию приложения: только данные → option.

   Правила, зашитые в сборщики:
     • ось значений всегда от нуля (min: 0), урезать нельзя;
     • оси Y нет там, где значения подписаны у марок;
     • двух баров рядом за один период не бывает — либо стек (часть целого),
       либо вторая панель под общей осью X;
     • подпись значения стоит у КАЖДОЙ марки. Когда бакетов много (>16),
       подписи разворачиваются вертикально и над марками резервируется
       место — иначе на 30 днях числа наезжают друг на друга;
     • зазор между панелями = STACK_GAP = --chart-gap = 26px.
   ========================================================================== */
(function (global) {
  'use strict';

  const U = global.UI;

  /* Палитра серий. Проверена scripts/validate_palette.js (dataviz):
     5/5 PASS, --pairs all, light. Зеркало --se-* в app.css. */
  const C = {
    new:   '#0f9d8f',
    ret:   '#4361ee',
    retLight: '#8aa4f2',        // светлая ступень того же тона — для «разовых»
    react: '#b5179e',
    views: '#5b6478',
    bench: '#c7c8cc',
    covered: '#0f9d8f',
    label: '#2b2b2b',
    axis:  '#808080',
    axisLine: 'rgb(155, 164, 181)',
    split: '#f0f1f3',
    seqLo: '#eef3fe',
    seqHi: '#4361ee',
  };

  const FONT = 'Inter, Helvetica, Arial, sans-serif';
  const VAL_SZ = 11;
  const STACK_GAP = 26;

  const TITLE_STYLE = { fontFamily: FONT, fontSize: 13, fontWeight: 600, color: '#3a3f4a' };
  const LEGEND_STYLE = { fontFamily: FONT, fontSize: 12, fontWeight: 500, color: '#3a3f4a' };

  /* Подпись стоит у каждой марки. Выше этого числа бакетов колонки уже
     уже подписи — разворачиваем текст вертикально. */
  const DENSE = 16;
  const isDense = (n) => n > DENSE;
  /* Место над марками под подписи: вертикальная занимает заметно больше. */
  const headroom = (max, n) => Math.max(1, Math.ceil(max * (isDense(n) ? 1.34 : 1.16)));

  /* Общая обёртка тултипа — тот же вид, что у HTML-подсказок отчёта */
  const TOOLTIP_BASE = {
    trigger: 'axis',
    axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(43,108,255,.05)' } },
    backgroundColor: '#fff',
    borderColor: '#e7e9ee',
    borderWidth: 1,
    padding: [9, 12],
    extraCssText: 'border-radius:9px;box-shadow:0 10px 30px rgba(24,33,50,.18),0 2px 6px rgba(24,33,50,.08);',
    textStyle: { fontFamily: FONT, fontSize: 12, color: '#3a3f4a', fontWeight: 500 },
  };
  function tipHead(txt) {
    return '<div style="font-family:' + FONT + ';min-width:170px">' +
      '<div style="font-size:10.5px;letter-spacing:.3px;text-transform:uppercase;color:#8a909c;font-weight:600;margin-bottom:6px">' +
      U.esc(txt) + '</div>';
  }
  function tipRow(color, label, value, muted) {
    const mk = color
      ? '<i style="display:inline-block;width:10px;height:9px;border-radius:3px;background:' + color + ';margin-right:8px;flex:0 0 auto"></i>'
      : '<i style="display:inline-block;width:10px;margin-right:8px;flex:0 0 auto"></i>';
    return '<div style="display:flex;align-items:center;gap:8px;margin-top:4px">' + mk +
      '<span style="font-size:11.5px;font-weight:500;color:#8a909c">' + U.esc(label) + '</span>' +
      '<b style="margin-left:auto;font-size:13.5px;font-weight:600;font-variant-numeric:tabular-nums;color:' +
      (muted ? '#8a909c' : '#1f1f1f') + '">' + U.esc(value) + '</b></div>';
  }
  const tipNote = (t) => '<div style="font-size:11.5px;color:#8a909c;margin-top:8px;padding-top:7px;border-top:1px solid #eef0f3;font-weight:400">' + U.esc(t) + '</div>';
  const tipEnd = '</div>';

  function catAxis(gridIndex, labels, opt) {
    const o = opt || {};
    return {
      type: 'category', gridIndex, data: labels,
      axisLine: { lineStyle: { color: C.axisLine } },
      axisTick: { show: false },
      axisLabel: o.hide ? { show: false } : {
        fontFamily: FONT, color: C.axis, fontSize: 11, hideOverlap: true,
        margin: 10,
      },
      boundaryGap: true,
    };
  }
  /* Ось значений: скрыта, но min ОБЯЗАТЕЛЬНО 0 — иначе колебание в пару
     процентов нарисуется обвалом. */
  function valAxis(gridIndex, opt) {
    const o = opt || {};
    return {
      type: 'value', gridIndex, min: 0, max: o.max,
      axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false },
      splitLine: { show: !!o.grid, lineStyle: { color: C.split, type: 'dashed' } },
    };
  }
  function valueLabel(fmt, n) {
    const d = n != null && isDense(n);
    return {
      show: true, position: 'top', distance: d ? 6 : 4,
      rotate: d ? 90 : 0, align: d ? 'left' : 'center', verticalAlign: 'middle',
      fontFamily: FONT, fontSize: d ? 10 : VAL_SZ,
      fontWeight: 400, color: C.label, formatter: fmt,
      textBorderColor: '#fff', textBorderWidth: 3,       // halo, чтобы читалось на марке
    };
  }

  /* ======================================================================
     1. Динамика пользователей: стек «новые / вернувшиеся / продолжающие»
        + отдельная панель просмотров под общей осью X.
        Вернувшиеся — были раньше, но не в предыдущем периоде (в данных
        react_users); продолжающие — были и в предыдущем (ret_users).
     ==================================================================== */
  function dynamics(rows, grain, opt) {
    const o = opt || {};
    const labels = rows.map((r) => U.axisLabel(r.bucket, grain));
    const n = rows.length;
    const totals = rows.map((r) => r.users);
    const mk = (name, key, color) => ({
      name, type: 'bar', stack: 'u', xAxisIndex: 0, yAxisIndex: 0,
      barMaxWidth: 34, barCategoryGap: '32%',
      itemStyle: { color, borderColor: '#fff', borderWidth: 1 },   // 2px-зазор между сегментами
      emphasis: { focus: 'series' },
      data: rows.map((r) => r[key]),
    });
    const sNew = mk('Новые', 'new_users', C.new);
    const sRe = mk('Вернувшиеся', 'react_users', C.react);
    const sRet = mk('Продолжающие', 'ret_users', C.ret);
    // подпись — над вершиной стека: это всего пользователей за бакет
    sNew.label = valueLabel((p) => U.compact(totals[p.dataIndex]), n);
    sNew.itemStyle.borderRadius = [3, 3, 0, 0];
    const newLabel = 'Новые';   // что значит «новый» — в подсказке и в подзаголовке панели

    return {
      textStyle: { fontFamily: FONT },
      animationDuration: 520,
      grid: [
        { left: 6, right: 26, top: 34, height: '46%' },
        { left: 6, right: 26, top: '70%', height: '19%' },
      ],
      /* «Просмотры» в легенду не берём: у нижней панели свой заголовок,
         а длинная легенда наезжает на заголовок верхней. */
      legend: {
        top: 2, right: 4, itemWidth: 11, itemHeight: 9, itemGap: 12,
        icon: 'roundRect', textStyle: LEGEND_STYLE,
        data: ['Продолжающие', 'Вернувшиеся', newLabel],
      },
      title: [
        { text: o.title || 'Пользователи по периодам', left: 0, top: 0, textStyle: TITLE_STYLE },
        { text: 'Просмотры', left: 0, top: '62%', textStyle: Object.assign({}, TITLE_STYLE, { fontSize: 12 }) },
      ],
      tooltip: Object.assign({}, TOOLTIP_BASE, {
        axisPointer: { type: 'shadow', link: [{ xAxisIndex: 'all' }] },
        formatter(ps) {
          if (!ps.length) return '';
          const i = ps[0].dataIndex, r = rows[i];
          const share = r.users ? (r.new_users / r.users) * 100 : 0;
          return tipHead(U.bucketTitle(r.bucket, grain)) +
            tipRow(null, 'Всего пользователей', U.nf(r.users)) +
            tipRow(C.new, newLabel, U.nf(r.new_users) + ' · ' + U.pct(share)) +
            tipRow(C.react, 'Вернувшиеся', U.nf(r.react_users)) +
            tipRow(C.ret, 'Продолжающие', U.nf(r.ret_users)) +
            tipRow(C.views, 'Просмотры', U.nf(r.views), true) +
            tipNote('Вернувшиеся — заходили раньше, но в предыдущ' +
              { d: 'ий день', w: 'ую неделю', m: 'ий месяц', q: 'ий квартал' }[grain] +
              ' не заходили. Продолжающие — заходили и в предыдущий.') +
            tipNote(o.newNote || ('Новый — первый визит в Proteus пришёлся на этот ' + PA_DATA.GRAINS[grain].unit)) +
            tipEnd;
        },
      }),
      xAxis: [catAxis(0, labels, { hide: true }), catAxis(1, labels)],
      yAxis: [
        valAxis(0, { max: headroom(Math.max.apply(null, totals), n) }),
        valAxis(1, { max: headroom(Math.max.apply(null, rows.map((r) => r.views)), n) }),
      ],
      series: [
        sRet, sRe, sNew,
        {
          name: 'Просмотры', type: 'line', xAxisIndex: 1, yAxisIndex: 1,
          smooth: false, symbol: 'circle', symbolSize: 5,
          lineStyle: { width: 2, color: C.views },
          itemStyle: { color: C.views, borderColor: '#fff', borderWidth: 2 },
          areaStyle: { color: 'rgba(91,100,120,.07)' },
          label: valueLabel((p) => U.compact(p.value), n),
          data: rows.map((r) => r.views),
        },
      ],
    };
  }

  /* ======================================================================
     2. Закрепляемость одной линией: средняя кривая удержания по когортам.
        Таблица когорт рисуется не здесь, а вёрсткой — см. UI.cohortTable.
     ==================================================================== */
  function retentionCurve(points, opt) {
    const o = opt || {};
    const n = points.length;
    return {
      textStyle: { fontFamily: FONT },
      grid: { left: 6, right: 18, top: 34, bottom: 30 },
      title: { text: o.title || 'Средняя кривая удержания по всем когортам', left: 0, top: 0, textStyle: TITLE_STYLE },
      tooltip: Object.assign({}, TOOLTIP_BASE, {
        formatter(ps) {
          const p = ps[0], d = points[p.dataIndex];
          return tipHead('Через ' + d.age + ' ' + U.plural(d.age, 'месяц', 'месяца', 'месяцев')) +
            tipRow(C.ret, 'Возвращаются', U.pct(d.pct)) +
            tipRow(null, 'Когорт в расчёте', U.nf(d.cohorts), true) +
            tipNote('Доля когорты, активной через N месяцев после первого визита') + tipEnd;
        },
      }),
      xAxis: catAxis(0, points.map((p) => '+' + p.age + ' мес')),
      yAxis: valAxis(0, { grid: true, max: 100 }),
      series: [{
        type: 'line', smooth: true, symbol: 'circle', symbolSize: 7,
        lineStyle: { width: 2, color: C.ret },
        itemStyle: { color: C.ret, borderColor: '#fff', borderWidth: 2 },
        areaStyle: { color: 'rgba(67,97,238,.08)' },
        label: valueLabel((p) => U.pct(p.value, 0), n),
        data: points.map((p) => +p.pct.toFixed(1)),
      }],
    };
  }

  /* ======================================================================
     3. Приход аудитории отчёта: «сколько пришло впервые» + накопленный охват.
        Это ответ на «я пропушил отчёт — сколько людей зашло».
     ==================================================================== */
  function reach(rows, grain, opt) {
    const o = opt || {};
    const labels = rows.map((r) => U.axisLabel(r.bucket, grain));
    const n = rows.length;
    const marks = [];
    if (o.createdIdx != null && o.createdIdx >= 0) {
      marks.push({ xAxis: o.createdIdx, label: { formatter: 'создан', fontFamily: FONT, fontSize: 10, color: '#8a909c', position: 'insideEndTop' } });
    }
    return {
      textStyle: { fontFamily: FONT },
      animationDuration: 520,
      grid: [
        { left: 6, right: 12, top: 34, height: '42%' },
        { left: 6, right: 12, top: '68%', height: '21%' },
      ],
      legend: { top: 2, right: 4, itemWidth: 11, itemHeight: 9, itemGap: 14, icon: 'roundRect', textStyle: LEGEND_STYLE, data: ['Пришли впервые', 'Накопленный охват'] },
      title: [
        { text: 'Первые визиты в отчёт', left: 0, top: 0, textStyle: TITLE_STYLE },
        { text: 'Накопленный охват, человек', left: 0, top: '60%', textStyle: Object.assign({}, TITLE_STYLE, { fontSize: 12 }) },
      ],
      tooltip: Object.assign({}, TOOLTIP_BASE, {
        axisPointer: { type: 'shadow', link: [{ xAxisIndex: 'all' }] },
        formatter(ps) {
          const r = rows[ps[0].dataIndex];
          return tipHead(U.bucketTitle(r.bucket, grain)) +
            tipRow(C.new, 'Пришли впервые', U.nf(r.first_time)) +
            tipRow(C.ret, 'Всего охвачено к дате', U.nf(r.cum_reach)) +
            (o.audience ? tipRow(null, 'Целевая аудитория', U.nf(o.audience), true) : '') + tipEnd;
        },
      }),
      xAxis: [catAxis(0, labels, { hide: true }), catAxis(1, labels)],
      yAxis: [valAxis(0), valAxis(1)],
      series: [
        {
          name: 'Пришли впервые', type: 'bar', xAxisIndex: 0, yAxisIndex: 0, barMaxWidth: 30,
          itemStyle: { color: C.new, borderRadius: [3, 3, 0, 0] },
          label: valueLabel((p) => p.value ? U.nf(p.value) : '', n),
          markLine: marks.length ? { silent: true, symbol: 'none', lineStyle: { type: 'dashed', color: '#c7c8cc', width: 1 }, data: marks } : undefined,
          data: rows.map((r) => r.first_time),
        },
        {
          name: 'Накопленный охват', type: 'line', xAxisIndex: 1, yAxisIndex: 1,
          symbol: 'circle', symbolSize: 5, smooth: false,
          lineStyle: { width: 2, color: C.ret },
          itemStyle: { color: C.ret, borderColor: '#fff', borderWidth: 2 },
          areaStyle: { color: 'rgba(67,97,238,.08)' },
          label: valueLabel((p) => U.compact(p.value), n),
          markLine: o.audience ? {
            silent: true, symbol: 'none',
            lineStyle: { type: 'dashed', color: C.bench, width: 1.5 },
            label: { formatter: 'вся ЦА', fontFamily: FONT, fontSize: 10, color: '#8a909c', position: 'insideEndTop' },
            data: [{ yAxis: o.audience }],
          } : undefined,
          data: rows.map((r) => r.cum_reach),
        },
      ],
    };
  }

  /* ======================================================================
     4. Воронка ЦА: целевая аудитория → зашли → вернулись → закрепились
     ==================================================================== */
  function funnel(steps) {
    const max = steps[0].value || 1;
    return {
      textStyle: { fontFamily: FONT },
      grid: { left: 0, right: 0, top: 0, bottom: 0 },
      tooltip: Object.assign({}, TOOLTIP_BASE, {
        trigger: 'item',
        formatter(p) {
          const s = steps[p.dataIndex];
          return tipHead(s.name) +
            tipRow(p.color, 'Человек', U.nf(s.value)) +
            tipRow(null, 'От целевой аудитории', U.pct(s.value / max * 100)) +
            (s.note ? tipNote(s.note) : '') + tipEnd;
        },
      }),
      series: [{
        type: 'funnel', left: 8, right: 8, top: 8, bottom: 8,
        minSize: '32%', maxSize: '100%', sort: 'descending', gap: 3,
        label: {
          show: true, position: 'inside', fontFamily: FONT, fontSize: 12, fontWeight: 500,
          color: '#fff',
          formatter: (p) => steps[p.dataIndex].name + '   ' + U.nf(p.value) + '  ·  ' + U.pct(p.value / max * 100, 0),
        },
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        emphasis: { label: { fontWeight: 600 } },
        data: steps.map((s, i) => ({
          name: s.name, value: s.value,
          itemStyle: { color: ['#4361ee', '#4f78e8', '#3f9bc4', '#0f9d8f'][i] || C.ret },
        })),
      }],
    };
  }

  /* ======================================================================
     5. Сегменты пользователей отчёта — горизонтальный стек одной полосой.
        Это состав одного целого (вся ЦА), а не сравнение категорий.
     ==================================================================== */
  function segmentBar(segs) {
    const total = segs.reduce((a, b) => a + b.value, 0) || 1;
    return {
      textStyle: { fontFamily: FONT },
      grid: { left: 2, right: 2, top: 36, bottom: 8, height: 46 },
      legend: { top: 0, left: 0, itemWidth: 11, itemHeight: 9, itemGap: 14, icon: 'roundRect', textStyle: LEGEND_STYLE },
      tooltip: Object.assign({}, TOOLTIP_BASE, {
        trigger: 'item',
        formatter(p) {
          const s = segs[p.seriesIndex];
          return tipHead(s.name) +
            tipRow(p.color, 'Человек', U.nf(s.value)) +
            tipRow(null, 'Доля ЦА', U.pct(s.value / total * 100)) +
            (s.note ? tipNote(s.note) : '') + tipEnd;
        },
      }),
      xAxis: { type: 'value', min: 0, max: total, show: false },
      yAxis: { type: 'category', data: [''], show: false },
      series: segs.map((s) => ({
        name: s.name, type: 'bar', stack: 'seg', barWidth: 34,
        itemStyle: { color: s.color, borderColor: '#fff', borderWidth: 2, borderRadius: 3 },
        label: {
          show: true, fontFamily: FONT, fontSize: 11, fontWeight: 500, color: '#fff',
          formatter: (p) => (p.value / total > .07 ? U.nf(p.value) : ''),
        },
        emphasis: { focus: 'series' },
        data: [s.value],
      })),
    };
  }

  global.CHARTS = { C, FONT, STACK_GAP, dynamics, retentionCurve, reach, funnel, segmentBar };
})(window);
