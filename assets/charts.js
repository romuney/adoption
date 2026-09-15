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
     • подпись значения стоит у каждой марки, пока помещается ГОРИЗОНТАЛЬНО.
       Повернуть число на 90° нельзя ни при какой плотности: вертикальный
       текст не читается. Когда бакетов столько, что подписи наезжают,
       ECharts прячет столкнувшиеся (labelLayout.hideOverlap) — остаётся
       разреженная, но читаемая сетка чисел, а точные значения всегда
       лежат в подсказке;
     • зазор между панелями = STACK_GAP = --chart-gap = 26px.
   ========================================================================== */
(function (global) {
  'use strict';

  const U = global.UI;

  /* Палитра. Два полюса: ГОЛУБОЙ — то, что уже есть и держится; ОРАНЖЕВЫЙ —
     то, что пришло сейчас. Внутри голубого работает ступень светлоты, а не
     новый тон, поэтому «отдельного синего» в макете нет: барчарты нарисованы
     тем же цветом, которым интерфейс помечает активное.
     Проверено scripts/validate_palette.js (dataviz): adjacent, light,
     surface #fff — 5/5 PASS, худшая пара CVD ΔE 21.9.
     Зеркало --se-* / --seg-* / --div-* в app.css. */
  const C = {
    act:   '#0e7ab0',           // активный тон интерфейса
    ret:   '#36aede',           // продолжающие — голубой
    react: '#0a6791',           // вернувшиеся — тот же тон темнее
    new:   '#e8761f',           // новые — оранжевый
    views: '#5b6478',           // просмотры: вторая панель, не серия
    bench: '#c7c8cc',
    /* Порядковая шкала вовлечённости (--ordinal PASS): темнее = глубже */
    seg3:  '#0a6791',           // постоянные
    seg2:  '#1b93c9',           // эпизодические
    seg1:  '#64bde4',           // разовые
    seg0:  '#d9dce1',           // не заходили
    covered: '#0e7ab0',
    label: '#2b2b2b',
    axis:  '#808080',
    axisLine: 'rgb(155, 164, 181)',
    split: '#f0f1f3',
    divLo: '#f4b174',           // ниже медианы — оранжевый
    divHi: '#64bde4',           // выше медианы — голубой
  };

  const FONT = 'Inter, Helvetica, Arial, sans-serif';
  const VAL_SZ = 11;
  const STACK_GAP = 26;

  const TITLE_STYLE = { fontFamily: FONT, fontSize: 13, fontWeight: 600, color: '#3a3f4a' };
  const LEGEND_STYLE = { fontFamily: FONT, fontSize: 12, fontWeight: 500, color: '#3a3f4a' };

  /* Плотная сетка — это когда колонка уже подписи. Числа при этом НЕ
     поворачиваются (вертикальный текст нечитаем): они мельчают, а те, что
     всё равно сталкиваются, прячет labelLayout.hideOverlap. */
  const DENSE = 16;
  const isDense = (n) => n > DENSE;
  /* Воздух над марками под подписи. Раньше при малом числе бакетов его почти
     не было — на 8 кварталах и 12 месяцах столбики упирались в заголовок. */
  const headroom = (max, n) => Math.max(1, Math.ceil(max * (isDense(n) ? 1.22 : 1.3)));
  /* Прятать столкнувшиеся подписи, а не поворачивать их */
  const LABEL_LAYOUT = { hideOverlap: true };

  /* Общая обёртка тултипа — тот же вид, что у HTML-подсказок отчёта */
  const TOOLTIP_BASE = {
    trigger: 'axis',
    axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(14,122,176,.06)' } },
    backgroundColor: '#fff',
    borderColor: '#e7e9ee',
    borderWidth: 1,
    padding: [7, 10],
    extraCssText: 'border-radius:9px;box-shadow:0 10px 30px rgba(24,33,50,.18),0 2px 6px rgba(24,33,50,.08);',
    textStyle: { fontFamily: FONT, fontSize: 11.5, color: '#3a3f4a', fontWeight: 500 },
    confine: true,      // не вылезать за пределы канвы
  };
  function tipHead(txt) {
    return '<div style="font-family:' + FONT + ';min-width:118px;max-width:230px">' +
      '<div style="font-size:10px;letter-spacing:.3px;text-transform:uppercase;color:#8a909c;font-weight:600;margin-bottom:5px">' +
      U.esc(txt) + '</div>';
  }
  function tipRow(color, label, value, muted) {
    const mk = color
      ? '<i style="display:inline-block;width:10px;height:9px;border-radius:3px;background:' + color + ';margin-right:8px;flex:0 0 auto"></i>'
      : '<i style="display:inline-block;width:10px;margin-right:8px;flex:0 0 auto"></i>';
    return '<div style="display:flex;align-items:center;gap:7px;margin-top:3px">' + mk +
      '<span style="font-size:11px;font-weight:500;color:#8a909c">' + U.esc(label) + '</span>' +
      '<b style="margin-left:auto;font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums;color:' +
      (muted ? '#8a909c' : '#1f1f1f') + '">' + U.esc(value) + '</b></div>';
  }
  const tipNote = (t) => '<div style="font-size:10.5px;line-height:1.35;color:#8a909c;margin-top:6px;padding-top:5px;border-top:1px solid #eef0f3;font-weight:400">' + U.esc(t) + '</div>';
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
      show: true, position: 'top', distance: 5,
      rotate: 0, align: 'center', verticalAlign: 'middle',   // поворота нет и не будет
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
    /* Сегменты стека разделяет цвет, а не белая линия: тон соседей разведён
       (голубой / тёмно-голубой / оранжевый), а обводка на узких колонках
       съедала саму марку и читалась как «уступ категории». */
    const mk = (name, key, color) => ({
      name, type: 'bar', stack: 'u', xAxisIndex: 0, yAxisIndex: 0,
      barMaxWidth: 34, barCategoryGap: '30%',
      itemStyle: { color },
      emphasis: { focus: 'series' },
      labelLayout: LABEL_LAYOUT,
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
      /* Верхняя панель начинается ниже заголовка с легендой и не доходит
         до половины высоты: подпись самого высокого столбика должна стоять
         в воздухе, а не налезать на заголовок. */
      /* Панели заданы краями, а не высотой в процентах: панель динамики
         тянется вместе с колонкой, и при фиксированной высоте между
         столбиками и «Просмотрами» открывалась пустая полоса в сотню
         пикселей. Края держат пропорцию на любой высоте. */
      grid: [
        { left: 6, right: 26, top: 46, bottom: '44%' },
        { left: 6, right: 26, top: '68%', bottom: 26 },
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
        { text: 'Просмотры', left: 0, top: '59%', textStyle: Object.assign({}, TITLE_STYLE, { fontSize: 12 }) },
      ],
      tooltip: Object.assign({}, TOOLTIP_BASE, {
        axisPointer: { type: 'shadow', link: [{ xAxisIndex: 'all' }] },
        formatter(ps) {
          if (!ps.length) return '';
          const i = ps[0].dataIndex, r = rows[i];
          const share = r.users ? (r.new_users / r.users) * 100 : 0;
          /* Определения сегментов живут в легенде и в «Как это устроено»,
             а не в каждой подсказке: длинный тултип перекрывал каталог. */
          return tipHead(U.bucketTitle(r.bucket, grain)) +
            tipRow(null, 'Всего', U.nf(r.users)) +
            tipRow(C.new, newLabel, U.nf(r.new_users) + ' · ' + U.pct(share, 0)) +
            tipRow(C.react, 'Вернувшиеся', U.nf(r.react_users)) +
            tipRow(C.ret, 'Продолжающие', U.nf(r.ret_users)) +
            tipRow(C.views, 'Просмотры', U.nf(r.views), true) +
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
          labelLayout: LABEL_LAYOUT,
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
            tipRow(C.act, 'Возвращаются', U.pct(d.pct)) +
            tipRow(null, 'Когорт в расчёте', U.nf(d.cohorts), true) +
            tipNote('Доля когорты, активной через N месяцев после первого визита') + tipEnd;
        },
      }),
      xAxis: catAxis(0, points.map((p) => '+' + p.age + ' мес')),
      yAxis: valAxis(0, { grid: true, max: 100 }),
      series: [{
        type: 'line', smooth: true, symbol: 'circle', symbolSize: 7,
        lineStyle: { width: 2, color: C.act },
        itemStyle: { color: C.act, borderColor: '#fff', borderWidth: 2 },
        areaStyle: { color: 'rgba(14,122,176,.08)' },
        label: valueLabel((p) => U.pct(p.value, 0), n),
        labelLayout: LABEL_LAYOUT,
        data: points.map((p) => +p.pct.toFixed(1)),
      }],
    };
  }

  /* ======================================================================
     3. Воронка ЦА: целевая аудитория → зашли → вернулись → закрепились
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
          color: '#fff', textBorderColor: 'rgba(10,60,85,.45)', textBorderWidth: 2,
          formatter: (p) => steps[p.dataIndex].name + '   ' + U.nf(p.value) + '  ·  ' + U.pct(p.value / max * 100, 0),
        },
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        emphasis: { label: { fontWeight: 600 } },
        /* Ступени воронки — порядковая шкала одного тона: этап глубже,
           цвет темнее. Разными хуями красить нечего: это не категории. */
        data: steps.map((s, i) => ({
          name: s.name, value: s.value,
          itemStyle: { color: ['#9ad4ee', '#64bde4', '#1b93c9', '#0a6791'][i] || C.act },
        })),
      }],
    };
  }

  /* ======================================================================
     4. Что происходило с целевой аудиторией по бакетам — три панели на
        общей оси X. Это и есть расшифровка воронки: воронка говорит, ЧЕМ
        всё кончилось, а здесь видно, КОГДА это происходило и менялось ли.

          верх    — сколько человек ЦА заходило в бакете, из них впервые;
          середина— просмотры этих людей (та же метрика, что на вкладке
                    «Отчёты», которой здесь не хватало);
          низ     — охват ЦА в процентах: накопленный и активный в бакете.

        Две линии внизу живут на ОДНОЙ шкале 0–100%: это доли одной и той
        же целевой аудитории, второй оси здесь быть не может.

        Дата создания отчёта — не тонкая засечка внизу, а подписанная плашка
        над графиком: раньше слово «создан» стояло вертикально у самой оси
        и его не было видно.
     ==================================================================== */
  function audienceTimeline(rows, grain, opt) {
    const o = opt || {};
    const labels = rows.map((r) => U.axisLabel(r.bucket, grain));
    const n = rows.length;
    const users = rows.map((r) => r.users);
    const firsts = rows.map((r) => r.first_time);
    const rest = rows.map((r, i) => Math.max(0, users[i] - firsts[i]));

    const marks = [];
    if (o.createdIdx != null && o.createdIdx >= 0 && o.createdIdx < n) {
      marks.push({
        xAxis: o.createdIdx,
        label: {
          show: true, position: 'end', distance: 4, formatter: o.createdLabel || 'отчёт создан',
          fontFamily: FONT, fontSize: 10, fontWeight: 600, color: '#3a3f4a',
          backgroundColor: '#fff', borderColor: '#d4d7de', borderWidth: 1,
          borderRadius: 4, padding: [3, 6],
        },
      });
    }
    const markLine = marks.length
      ? { silent: true, symbol: 'none', lineStyle: { type: 'dashed', color: '#b9bec8', width: 1 }, data: marks }
      : undefined;

    return {
      textStyle: { fontFamily: FONT },
      animationDuration: 520,
      /* Три панели на общей оси. Края подобраны так, чтобы подзаголовок
         каждой панели стоял в зазоре МЕЖДУ панелями, а не поверх марок
         соседней: заголовок на графике — первое, что ломается, когда
         панели заданы высотой в процентах. */
      grid: [
        { left: 6, right: 30, top: 46, bottom: '60%' },
        { left: 6, right: 30, top: '48%', bottom: '36%' },
        { left: 6, right: 30, top: '71%', bottom: 26 },
      ],
      legend: {
        top: 2, right: 4, itemWidth: 11, itemHeight: 9, itemGap: 12,
        icon: 'roundRect', textStyle: LEGEND_STYLE,
        data: ['Заходили не впервые', 'Пришли впервые'],
      },
      title: [
        { text: o.title || 'Целевая аудитория по периодам', left: 0, top: 0, textStyle: TITLE_STYLE },
        { text: 'Просмотры этих людей', left: 0, top: '42%', textStyle: Object.assign({}, TITLE_STYLE, { fontSize: 12 }) },
        { text: 'Охват целевой аудитории, % от ' + U.nf(o.audience || 0), left: 0, top: '65%', textStyle: Object.assign({}, TITLE_STYLE, { fontSize: 12 }) },
      ],
      tooltip: Object.assign({}, TOOLTIP_BASE, {
        axisPointer: { type: 'shadow', link: [{ xAxisIndex: 'all' }] },
        formatter(ps) {
          if (!ps.length) return '';
          const r = rows[ps[0].dataIndex];
          return tipHead(U.bucketTitle(r.bucket, grain)) +
            tipRow(C.ret, 'Заходили', U.nf(r.users)) +
            tipRow(C.new, 'из них впервые', U.nf(r.first_time)) +
            tipRow(C.views, 'Просмотры', U.nf(r.views), true) +
            tipRow(C.act, 'Охват накопленный', U.pct(r.reach_pct, 0)) +
            tipRow(C.seg1, 'Активны в периоде', U.pct(r.active_pct, 0)) +
            tipEnd;
        },
      }),
      xAxis: [
        catAxis(0, labels, { hide: true }),
        catAxis(1, labels, { hide: true }),
        catAxis(2, labels),
      ],
      yAxis: [
        valAxis(0, { max: headroom(Math.max.apply(null, users.concat([1])), n) }),
        valAxis(1, { max: headroom(Math.max.apply(null, rows.map((r) => r.views).concat([1])), n) }),
        /* Ось процентов от нуля обязательно, но тянуть её до 100 незачем,
           когда охват 29%: три четверти панели уходили в пустоту. Потолок
           округляется до десятков и не опускается ниже 30%. */
        valAxis(2, {
          max: Math.min(100, Math.max(30, Math.ceil(
            Math.max.apply(null, rows.map((r) => Math.max(r.reach_pct, r.active_pct)).concat([1])) * 1.3 / 10) * 10)),
          grid: true,
        }),
      ],
      series: [
        {
          name: 'Заходили не впервые', type: 'bar', stack: 'a', xAxisIndex: 0, yAxisIndex: 0,
          barMaxWidth: 30, barCategoryGap: '30%', itemStyle: { color: C.ret },
          data: rest, markLine,
        },
        {
          name: 'Пришли впервые', type: 'bar', stack: 'a', xAxisIndex: 0, yAxisIndex: 0,
          barMaxWidth: 30, itemStyle: { color: C.new, borderRadius: [3, 3, 0, 0] },
          label: valueLabel((p) => (users[p.dataIndex] ? U.compact(users[p.dataIndex]) : ''), n),
          labelLayout: LABEL_LAYOUT,
          data: firsts,
        },
        {
          name: 'Просмотры', type: 'line', xAxisIndex: 1, yAxisIndex: 1,
          symbol: 'circle', symbolSize: 5, smooth: false,
          lineStyle: { width: 2, color: C.views },
          itemStyle: { color: C.views, borderColor: '#fff', borderWidth: 2 },
          areaStyle: { color: 'rgba(91,100,120,.07)' },
          label: valueLabel((p) => (p.value ? U.compact(p.value) : ''), n),
          labelLayout: LABEL_LAYOUT,
          data: rows.map((r) => r.views),
        },
        {
          name: 'Накопленный охват', type: 'line', xAxisIndex: 2, yAxisIndex: 2,
          symbol: 'circle', symbolSize: 5, smooth: false,
          lineStyle: { width: 2, color: C.act },
          itemStyle: { color: C.act, borderColor: '#fff', borderWidth: 2 },
          areaStyle: { color: 'rgba(14,122,176,.08)' },
          label: valueLabel((p) => (p.value ? U.pct(p.value, 0) : ''), n),
          labelLayout: LABEL_LAYOUT,
          data: rows.map((r) => +r.reach_pct.toFixed(1)),
        },
        {
          name: 'Активны в периоде', type: 'line', xAxisIndex: 2, yAxisIndex: 2,
          symbol: 'circle', symbolSize: 4, smooth: false,
          lineStyle: { width: 2, color: C.seg1, type: 'dashed' },
          itemStyle: { color: C.seg1, borderColor: '#fff', borderWidth: 2 },
          data: rows.map((r) => +r.active_pct.toFixed(1)),
        },
      ],
    };
  }

  global.CHARTS = { C, FONT, STACK_GAP, dynamics, retentionCurve, funnel, audienceTimeline };
})(window);
