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

  /* Палитра. Стек — ОДИН тон разными ступенями светлоты. Части стека не
     соперничают друг с другом: это доли одного целого, и разный хуй на них
     означал бы «разные сущности», которых тут нет. Оранжевый остался только
     в дивергентной шкале когорт, где он противопоставлен голубому по
     смыслу — «хуже» против «лучше» медианы; теперь это жёлтый.
     Тона взяты из присланных палитр, часть ступеней притемлена: ниже 2:1
     к белой панели марка растворяется в фоне.
     Проверено scripts/validate_palette.js (dataviz) --ordinal: 4/4 PASS.
     Зеркало --se-* / --seg-* / --div-* в app.css. */
  const C = {
    act:   '#0073A0',           // активный тон интерфейса
    ret:   '#5CC0EE',           // продолжающие — самая светлая ступень
    react: '#AA77FF',           // вернувшиеся — фиолетовый: отдельная история
    new:   '#0073A0',           // новые — насыщенный голубой, в основании
    views: '#5b6478',           // просмотры: вторая панель, не серия
    bench: '#c7c8cc',
    /* Порядковая шкала вовлечённости (--ordinal PASS): темнее = глубже */
    seg3:  '#0073A0',           // постоянные
    seg2:  '#218DAE',           // эпизодические
    seg1:  '#5CC0EE',           // разовые
    seg0:  '#d9dce1',           // не заходили
    covered: '#0073A0',
    label: '#2b2b2b',
    axis:  '#808080',
    axisLine: 'rgb(155, 164, 181)',
    split: '#f0f1f3',
    divLo: '#FFD758',           // ниже медианы — жёлтый
    divHi: '#62CDFF',           // выше медианы — голубой
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

  /* ШИРИНА БАРА СЧИТАЕТСЯ, А НЕ ЗАДАЁТСЯ ПРОЦЕНТОМ.
     barCategoryGap в процентах означает «зазор — доля ширины категории», а
     ширина категории зависит от их числа: на 30 днях колонки лепились друг
     к другу, на 8 кварталах между ними зияло по полсотни пикселей. Здесь
     наоборот: ЗАЗОР постоянный в пикселях, а бар занимает всё остальное —
     на редкой сетке он просто становится толще. Потолок нужен, чтобы на
     четырёх бакетах бар не превратился в плиту. */
  const BAR_GAP = 8;             // постоянный зазор между барами, px
  const BAR_MAX = 72;            // толще — уже не барчарт, а плита
  const BAR_MIN = 3;
  function barWidth(width, n, pad) {
    if (!width || !n) return undefined;
    const inner = Math.max(40, width - (pad == null ? 34 : pad));
    return Math.max(BAR_MIN, Math.min(BAR_MAX, inner / n - BAR_GAP));
  }
  /* Воздух над марками под подписи. Раньше при малом числе бакетов его почти
     не было — на 8 кварталах и 12 месяцах столбики упирались в заголовок. */
  const headroom = (max, n) => Math.max(1, Math.ceil(max * (isDense(n) ? 1.22 : 1.3)));
  /* Прятать столкнувшиеся подписи, а не поворачивать их */
  const LABEL_LAYOUT = { hideOverlap: true };

  /* Общая обёртка тултипа — тот же вид, что у HTML-подсказок отчёта */
  const TOOLTIP_BASE = {
    trigger: 'axis',
    axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(0,115,160,.06)' } },
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
      show: true, position: 'top', distance: 7,
      rotate: 0, align: 'center', verticalAlign: 'middle',   // поворота нет и не будет
      fontFamily: FONT, fontSize: d ? 10 : VAL_SZ,
      fontWeight: 400, color: C.label, formatter: fmt,
      textBorderColor: '#fff', textBorderWidth: 3,       // halo, чтобы читалось на марке
    };
  }

  /* ======================================================================
     1. Динамика пользователей: стек «новые / вернувшиеся / продолжающие»
        + отдельная панель просмотров под общей осью X.
        Три части одного целого, и их определения держатся на ПРЕДЫДУЩЕМ
        бакете: новый — не заходил в отчёт никогда; вернувшийся — заходил
        когда-то раньше, но в предыдущем бакете его не было; продолжающий —
        был и в предыдущем. Сумма трёх равна всем пользователям бакета.
     ==================================================================== */
  function dynamics(rows, grain, opt) {
    const o = opt || {};
    const labels = rows.map((r) => U.axisLabel(r.bucket, grain));
    const n = rows.length;
    const totals = rows.map((r) => r.users);
    const bw = barWidth(o.width, n);
    /* Сегменты стека разделяет ступень светлоты, а не белая линия: обводка
       на узких колонках съедала саму марку и читалась как «уступ». */
    const mk = (name, key, color) => ({
      name, type: 'bar', stack: 'u', xAxisIndex: 0, yAxisIndex: 0,
      barWidth: bw, barMaxWidth: BAR_MAX,
      itemStyle: { color },
      emphasis: { focus: 'series' },
      labelLayout: LABEL_LAYOUT,
      data: rows.map((r) => r[key]),
    });
    const newLabel = o.newLabel || 'Новые';
    const sNew = mk(newLabel, 'new_users', C.new);
    const sRe = mk('Вернувшиеся', 'react_users', C.react);
    const sRet = mk('Продолжающие', 'ret_users', C.ret);
    /* Порядок в стеке снизу вверх: НОВЫЕ в основании, дальше вернувшиеся,
       сверху продолжающие. Приток стоит на земле и виден при любой высоте
       столбика; будь он наверху, он плавал бы на разной высоте от бакета
       к бакету, и сравнить приток между периодами стало бы нельзя. */
    sRet.label = valueLabel((p) => U.compact(totals[p.dataIndex]), n);
    sRet.itemStyle.borderRadius = [3, 3, 0, 0];

    /* Нижняя панель: просмотры всего или в пересчёте на пользователя.
       Две метрики разной размерности на одной оси не живут, поэтому не две
       линии, а переключатель — см. подшапку панели. */
    const perUser = o.viewsMode === 'per';
    const viewsData = rows.map((r) => (perUser
      ? +(r.users ? r.views / r.users : 0).toFixed(2)
      : r.views));
    const viewsTitle = perUser ? 'Просмотров на пользователя' : 'Просмотры';
    const viewsFmt = (v) => (perUser ? U.nf(v, 1) : U.compact(v));

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
      /* У ОБЕИХ панелей своя подписанная ось X. Раньше верхняя шла без
         оси, и столбики висели в воздухе: глазу не за что зацепиться,
         чтобы понять, какой это день. */
      grid: [
        { left: 6, right: 26, top: 46, bottom: '46%' },
        { left: 6, right: 26, top: '70%', bottom: 26 },
      ],
      /* «Просмотры» в легенду не берём: у нижней панели свой заголовок,
         а длинная легенда наезжает на заголовок верхней. */
      legend: {
        top: 2, right: 4, itemWidth: 11, itemHeight: 9, itemGap: 12,
        icon: 'roundRect', textStyle: LEGEND_STYLE,
        /* Порядок легенды повторяет порядок в стеке снизу вверх */
        data: [newLabel, 'Вернувшиеся', 'Продолжающие'],
      },
      title: [
        { text: o.title || 'Пользователи по периодам', left: 0, top: 0, textStyle: TITLE_STYLE },
        { text: viewsTitle, left: 0, top: '61%', textStyle: Object.assign({}, TITLE_STYLE, { fontSize: 12 }) },
      ],
      /* У каждой панели СВОЙ тултип. Панели связаны только осью X, а
         показывают разное: наверху состав пользователей, внизу просмотры.
         Сшитый тултип (axisPointer.link) вываливал всё сразу — читателю
         приходилось выбирать глазами нужные две строки из пяти. */
      tooltip: Object.assign({}, TOOLTIP_BASE, {
        axisPointer: { type: 'shadow' },
        formatter(ps) {
          if (!ps.length) return '';
          const i = ps[0].dataIndex, r = rows[i];
          const head = tipHead(U.bucketTitle(r.bucket, grain));
          /* Нижняя панель — просмотры и только они */
          if (ps[0].axisIndex === 1 || ps[0].seriesIndex === 3) {
            return head +
              tipRow(C.views, viewsTitle, perUser ? U.nf(r.users ? r.views / r.users : 0, 1) : U.nf(r.views)) +
              (perUser ? tipRow(null, 'Просмотров всего', U.nf(r.views), true) : '') +
              tipEnd;
          }
          const share = r.users ? (r.new_users / r.users) * 100 : 0;
          return head +
            tipRow(null, 'Всего', U.nf(r.users)) +
            tipRow(C.new, newLabel, U.nf(r.new_users) + ' · ' + U.pct(share, 0)) +
            tipRow(C.react, 'Вернувшиеся', U.nf(r.react_users)) +
            tipRow(C.ret, 'Продолжающие', U.nf(r.ret_users)) +
            tipEnd;
        },
      }),
      xAxis: [catAxis(0, labels), catAxis(1, labels)],
      yAxis: [
        valAxis(0, { max: headroom(Math.max.apply(null, totals), n) }),
        valAxis(1, { max: headroom(Math.max.apply(null, viewsData), n) }),
      ],
      series: [
        sNew, sRe, sRet,
        {
          name: viewsTitle, type: 'line', xAxisIndex: 1, yAxisIndex: 1,
          smooth: false, symbol: 'circle', symbolSize: 5,
          lineStyle: { width: 2, color: C.views },
          itemStyle: { color: C.views, borderColor: '#fff', borderWidth: 2 },
          areaStyle: { color: 'rgba(91,100,120,.07)' },
          label: valueLabel((p) => viewsFmt(p.value), n),
          labelLayout: LABEL_LAYOUT,
          data: viewsData,
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
        areaStyle: { color: 'rgba(0,115,160,.08)' },
        label: valueLabel((p) => U.pct(p.value, 0), n),
        labelLayout: LABEL_LAYOUT,
        data: points.map((p) => +p.pct.toFixed(1)),
      }],
    };
  }

  /* ======================================================================
     3. Охват целевой аудитории по периодам — две панели на общей оси X.

     Это расшифровка воронки: воронка говорит, ЧЕМ всё кончилось, здесь
     видно, КОГДА это набиралось и менялось ли.

       верх  — ЛЮДИ: сколько человек ЦА заходило в каждом периоде и сколько
               из них пришло впервые;
       низ   — ПРОЦЕНТЫ от той же ЦА: накопленный охват (сколько людей мы
               достали хотя бы раз к этой дате) и доля, заходившая ИМЕННО
               в этом периоде.

     Две нижние линии отвечают на разные вопросы и потому нужны обе.
     Накопленная только растёт — она про «скольких мы вообще достали».
     Помесячная колеблется — она про «сколько ими пользуются сейчас»: если
     накопленная ползёт вверх, а помесячная стоит, значит новых приводим,
     а старые отваливаются. Обе — доли одной и той же аудитории, поэтому
     живут на одной шкале; второй оси здесь быть не может.

     Просмотров тут нет намеренно: на этой вкладке считают ЛЮДЕЙ и их долю,
     а объём просмотров живёт на вкладке «Отчёты».

     Дата создания отчёта — подписанная плашка над графиком, а не
     вертикальная засечка у оси: засечку не видно.
     ==================================================================== */
  function audienceTimeline(rows, grain, opt) {
    const o = opt || {};
    const labels = rows.map((r) => U.axisLabel(r.bucket, grain));
    const n = rows.length;
    const users = rows.map((r) => r.users);
    const firsts = rows.map((r) => r.first_time);
    const rest = rows.map((r, i) => Math.max(0, users[i] - firsts[i]));
    const bw = barWidth(o.width, n);

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

    const pctMax = Math.min(100, Math.max(30, Math.ceil(
      Math.max.apply(null, rows.map((r) => Math.max(r.reach_pct, r.active_pct)).concat([1])) * 1.28 / 10) * 10));

    return {
      textStyle: { fontFamily: FONT },
      animationDuration: 520,
      /* У верхней панели своя подписанная ось X, поэтому её нижний край
         поднят: иначе заголовок нижней панели садился прямо на подписи
         дат верхней. */
      grid: [
        { left: 6, right: 30, top: 46, bottom: '57%' },
        { left: 6, right: 30, top: '67%', bottom: 26 },
      ],
      legend: {
        top: 2, right: 4, itemWidth: 11, itemHeight: 9, itemGap: 12,
        icon: 'roundRect', textStyle: LEGEND_STYLE,
        data: ['Пришли впервые', 'Заходили не впервые'],
      },
      title: [
        { text: o.title || 'Заходили из целевой аудитории, человек', left: 0, top: 0, textStyle: TITLE_STYLE },
        {
          text: 'Охват целевой аудитории, % от ' + U.nf(o.audience || 0),
          subtext: 'сплошная — накоплено к дате · пунктир — заходили в этом периоде',
          left: 0, top: '52%',
          textStyle: Object.assign({}, TITLE_STYLE, { fontSize: 12 }),
          subtextStyle: { fontFamily: FONT, fontSize: 10.5, color: '#8a909c', fontWeight: 400 },
        },
      ],
      /* Свой тултип у каждой панели: наверху люди, внизу проценты. */
      tooltip: Object.assign({}, TOOLTIP_BASE, {
        axisPointer: { type: 'shadow' },
        formatter(ps) {
          if (!ps.length) return '';
          const r = rows[ps[0].dataIndex];
          const head = tipHead(U.bucketTitle(r.bucket, grain));
          if (ps[0].axisIndex === 1 || ps[0].seriesIndex >= 2) {
            return head +
              tipRow(C.act, 'Накоплено охвачено', U.pct(r.reach_pct, 0) + ' · ' + U.nf(r.cum_reach)) +
              tipRow(C.seg1, 'Заходили в этом периоде', U.pct(r.active_pct, 0)) +
              tipEnd;
          }
          return head +
            tipRow(C.ret, 'Заходили', U.nf(r.users)) +
            tipRow(C.new, 'из них впервые', U.nf(r.first_time)) +
            tipEnd;
        },
      }),
      xAxis: [catAxis(0, labels), catAxis(1, labels)],
      yAxis: [
        valAxis(0, { max: headroom(Math.max.apply(null, users.concat([1])), n) }),
        valAxis(1, { max: pctMax, grid: true }),
      ],
      series: [
        /* Порядок тот же, что в динамике на вкладке «Отчёты»: приток стоит
           в основании столбика. Иначе две одинаковые по смыслу картинки
           читались бы по-разному. */
        {
          name: 'Пришли впервые', type: 'bar', stack: 'a', xAxisIndex: 0, yAxisIndex: 0,
          barWidth: bw, barMaxWidth: BAR_MAX, itemStyle: { color: C.new },
          data: firsts, markLine,
        },
        {
          name: 'Заходили не впервые', type: 'bar', stack: 'a', xAxisIndex: 0, yAxisIndex: 0,
          barWidth: bw, barMaxWidth: BAR_MAX,
          itemStyle: { color: C.ret, borderRadius: [2, 2, 0, 0] },
          label: valueLabel((p) => (users[p.dataIndex] ? U.compact(users[p.dataIndex]) : ''), n),
          labelLayout: LABEL_LAYOUT,
          data: rest,
        },
        {
          name: 'Накоплено к дате', type: 'line', xAxisIndex: 1, yAxisIndex: 1,
          symbol: 'circle', symbolSize: 5, smooth: false,
          lineStyle: { width: 2, color: C.act },
          itemStyle: { color: C.act, borderColor: '#fff', borderWidth: 2 },
          areaStyle: { color: 'rgba(0,115,160,.08)' },
          label: valueLabel((p) => (p.value ? U.pct(p.value, 0) : ''), n),
          labelLayout: LABEL_LAYOUT,
          data: rows.map((r) => +r.reach_pct.toFixed(1)),
        },
        {
          name: 'Заходили в периоде', type: 'line', xAxisIndex: 1, yAxisIndex: 1,
          symbol: 'circle', symbolSize: 4, smooth: false,
          lineStyle: { width: 2, color: C.seg1, type: 'dashed' },
          itemStyle: { color: C.seg1, borderColor: '#fff', borderWidth: 2 },
          data: rows.map((r) => +r.active_pct.toFixed(1)),
        },
      ],
    };
  }

  global.CHARTS = { C, FONT, STACK_GAP, dynamics, retentionCurve, audienceTimeline };
})(window);
