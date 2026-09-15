/* ============================================================================
   Приложение: состояние, фильтры, вкладки, рендер.

   ГЛАВНАЯ РАБОТА, ПОД КОТОРУЮ СОБРАН ЭКРАН
   ----------------------------------------
   Владелец отчёта приходит смотреть динамику просмотров и пользователей —
   по своему отчёту, по своей коллекции или по всем своим отчётам сразу.
   Поэтому «обзор» и «каталог отчётов» не разведены по разным вкладкам:
   это одна и та же картинка, просто без выбора она показывает весь Proteus.

   Левая таблица отвечает на вопрос «в разрезе чего смотрим» (подшапка над
   ней), правая панель — динамика того, что выбрано. Выбор один и тот же для
   всей вкладки: карточки, динамика, частота и закрепляемость пересчитываются
   под него.

   АРХИТЕКТУРА ДАННЫХ
   ------------------
   Одна вкладка — один датасет. Вкладка забирает его целиком и дальше
   пересчитывает всё в браузере. Мгновенно (без похода в базу) работают:
     • переключение периода     — все четыре грануляции лежат в датасете;
     • переключение разреза     — датасет в длинном формате: строка на
                                  (бакет × разрез × значение);
     • выбор отчёта, коллекции, владельца, подразделения;
     • переключение видов панели.

   Что честно остаётся серверным (⟳): комбинация фильтров по атрибутам
   сотрудников и отчётов, поимённые списки аудитории и когорты выбранного
   отчёта — куб «отчёт × когорта × возраст» по всем отчётам в браузер
   не поедет.
   ========================================================================== */
(function () {
  'use strict';

  const D = window.PA_DATA;
  const U = window.UI;
  const CH = window.CHARTS;

  /* ===================== В разрезе чего смотрим ===========================
     Три вида строк, но правило одно: строка выбрана — вся вкладка про неё.
       rep — отдельный отчёт          (динамика из секции rts)
       grp — группа отчётов           (gts: GROUP BY коллекция | владелец)
       cut — срез по людям            (ts из обзора: кто ходит, а не куда) */
  const MODES = [
    { key: 'report',     label: 'Отчёты',        axis: 'rep', one: 'Отчёт' },
    { key: 'collection', label: 'Коллекции',     axis: 'grp', one: 'Коллекция' },
    { key: 'owner',      label: 'Владельцы',     axis: 'grp', one: 'Владелец' },
    { key: 'lvl3',       label: 'Подразделения', axis: 'cut', one: 'Подразделение' },
    { key: 'spec',       label: 'Специализация', axis: 'cut', one: 'Специализация' },
  ];
  const MODE = (k) => MODES.find((m) => m.key === k) || MODES[0];

  /* ============================== Состояние ============================== */
  const S = {
    tab: 'reports',
    grain: 'd',
    mode: 'report',
    sel: null,                   // {mode, val} — что выбрано в левой таблице
    selectedReport: null,        // последний выбранный отчёт (нужен вкладке «Аудитория»)
    retView: 'cohort',
    audCut: 'lvl3',              // разрез разбивки аудитории отчёта
    audSeg: null,
    repSort: { col: 'users', dir: -1 },
    repQuery: '',
    audQuery: '',
    filters: { collection: '', owner: '', published: true, actual: true, certified: false, excludeOwners: true },
  };

  const OV = D.ds_overview;
  const RP = D.ds_reports;

  /* ========================= Выборки из датасетов ========================= */
  function reportRows() {
    const f = S.filters;
    return RP.filter((r) => r.section === 'report' && r.grain === S.grain)
      .filter((r) => (!f.published || r.published === 1))
      .filter((r) => (!f.actual || r.actual_flg === 1))
      .filter((r) => (!f.certified || !!r.certified_by))
      .filter((r) => (!f.collection || r.collection === f.collection))
      .filter((r) => (!f.owner || r.owner_login === f.owner));
  }
  function reportById(id) {
    return RP.find((r) => r.section === 'report' && r.grain === S.grain && r.dashboard_id === id);
  }
  function currentReport() {
    const all = reportRows();
    let r = all.find((x) => x.dashboard_id === S.selectedReport);
    if (!r) { r = all.find((x) => x.is_new) || all[0]; if (r) S.selectedReport = r.dashboard_id; }
    return r;
  }

  /* --- Что выбрано: заголовок, подпись, способ достать цифры -------------- */
  function selection() {
    const s = S.sel;
    if (!s) {
      return {
        kind: 'all', title: 'Все отчёты',
        sub: 'выберите строку слева, чтобы посмотреть динамику по ней',
      };
    }
    const m = MODE(s.mode);
    if (m.axis === 'rep') {
      const r = reportById(s.val);
      if (!r) return { kind: 'all', title: 'Все отчёты', sub: '' };
      return {
        kind: 'rep', report: r, title: r.dashboard_nm,
        sub: 'владелец ' + r.owner_login + ' · ' + r.collection,
      };
    }
    if (m.axis === 'grp') {
      const g = RP.find((r) => r.section === 'gkpi' && r.grain === S.grain && r.group_key === s.mode && r.group_val === s.val);
      return {
        kind: 'grp', group: g, title: s.val,
        sub: m.one.toLowerCase() + ' · ' + U.nf(g ? g.reports : 0) + ' ' +
          U.plural(g ? g.reports : 0, 'отчёт', 'отчёта', 'отчётов'),
      };
    }
    return {
      kind: 'cut', title: s.val,
      sub: D.CUTS[s.mode].label.toLowerCase() + ' · все отчёты Proteus',
    };
  }

  /* --- Динамика по бакетам ----------------------------------------------- */
  function series() {
    const s = S.sel;
    let rows;
    if (!s) {
      rows = OV.filter((r) => r.section === 'ts' && r.grain === S.grain && r.cut_key === 'all');
    } else if (MODE(s.mode).axis === 'rep') {
      rows = RP.filter((r) => r.section === 'rts' && r.grain === S.grain && r.dashboard_id === s.val);
    } else if (MODE(s.mode).axis === 'grp') {
      rows = RP.filter((r) => r.section === 'gts' && r.grain === S.grain && r.group_key === s.mode && r.group_val === s.val);
    } else {
      rows = OV.filter((r) => r.section === 'ts' && r.grain === S.grain && r.cut_key === s.mode && r.cut_val === s.val);
    }
    return rows.slice().sort((a, b) => a.bucket - b.bucket);
  }

  /* --- Итоги за период ---------------------------------------------------
     Отдельная секция, а не сумма по бакетам: уникальные пользователи за
     период НЕ складываются из уникальных по дням — один человек заходит
     в разные дни. В SQL это два оконных фильтра, текущий и предыдущий. */
  function kpiRow() {
    const s = S.sel;
    if (!s) return OV.find((r) => r.section === 'kpi' && r.grain === S.grain && r.cut_key === 'all');
    if (MODE(s.mode).axis === 'rep') return reportById(s.val);
    if (MODE(s.mode).axis === 'grp') {
      return RP.find((r) => r.section === 'gkpi' && r.grain === S.grain && r.group_key === s.mode && r.group_val === s.val);
    }
    return OV.find((r) => r.section === 'kpi' && r.grain === S.grain && r.cut_key === s.mode && r.cut_val === s.val);
  }

  /* --- Частота визитов ---------------------------------------------------- */
  function freqRows() {
    const s = S.sel;
    const pick = (rows) => D.FREQ.map((fb) => ({
      bucket: fb, users: rows.filter((r) => r.freq_bucket === fb).reduce((a, b) => a + b.users, 0),
    }));
    if (!s) return pick(OV.filter((r) => r.section === 'freq' && r.grain === S.grain && r.cut_key === 'all'));
    if (MODE(s.mode).axis === 'rep') return pick(RP.filter((r) => r.section === 'rfreq' && r.grain === S.grain && r.dashboard_id === s.val));
    if (MODE(s.mode).axis === 'grp') return pick(RP.filter((r) => r.section === 'gfreq' && r.grain === S.grain && r.group_key === s.mode && r.group_val === s.val));
    return pick(OV.filter((r) => r.section === 'freq' && r.grain === S.grain && r.cut_key === s.mode && r.cut_val === s.val));
  }

  /* --- Когорты ------------------------------------------------------------ */
  function cohortRows() {
    const s = S.sel;
    return (s && MODE(s.mode).axis === 'rep') ? D.reportCohorts(s.val) : D.globalCohorts();
  }
  /* Средняя кривая: складываем числители и знаменатели по всем когортам,
     а не усредняем проценты — иначе маленькая когорта весит как большая. */
  function retentionPoints(rows) {
    const byAge = {};
    rows.forEach((c) => c.cells.forEach((x) => {
      if (x.partial) return;                       // незакрытый месяц занизил бы кривую
      const a = (byAge[x.age] = byAge[x.age] || { age: x.age, num: 0, den: 0, cohorts: 0 });
      a.num += x.active; a.den += c.size; a.cohorts++;
    }));
    return Object.values(byAge).filter((a) => a.cohorts >= 2)
      .map((a) => ({ age: a.age, pct: a.den ? a.num / a.den * 100 : 0, cohorts: a.cohorts }))
      .sort((a, b) => a.age - b.age);
  }

  /* ========================== Правила наблюдений =========================
     Не языковая модель: пороговый отбор фактов. Каждый факт называет порог,
     по которому он сюда попал. Нет факта выше порога — нет плашки. */
  function obsMain() {
    const k = kpiRow(); const out = []; const sl = selection();
    if (!k) return out;
    const dU = k.users_prev ? (k.users / k.users_prev - 1) * 100 : null;
    const shNew = k.users ? k.new_users / k.users * 100 : 0;
    const shReg = k.users ? k.regular_users / k.users * 100 : 0;
    const shSleep = k.users && k.sleeping_users != null ? k.sleeping_users / k.users * 100 : 0;
    const what = sl.kind === 'all' ? 'В Proteus' : ('«' + sl.title + '»');

    if (dU != null && Math.abs(dU) >= 10) {
      out.push({
        sev: dU > 0 ? 'good' : 'high',
        lead: 'Пользователей ' + (dU > 0 ? 'больше' : 'меньше') + ' на ' + U.pct(Math.abs(dU)) + ' ' + U.prevPeriodLabel(S.grain),
        body: U.esc(what) + ': за период <b>' + U.nf(k.users) + '</b> пользователей против <b>' + U.nf(k.users_prev) +
          '</b> в предыдущем — изменение <b>' + U.signed(dU, 1, '%') + '</b>.',
        rule: 'изменение к предыдущему периоду ≥10%',
      });
    }
    if (shNew >= 22) {
      out.push({
        sev: 'good',
        lead: 'Новые дают ' + U.pct(shNew) + ' всей аудитории',
        body: 'Из <b>' + U.nf(k.users) + '</b> пользователей <b>' + U.nf(k.new_users) + '</b> пришли впервые. ' +
          'Рост идёт за счёт притока, а не за счёт того, что прежние стали ходить чаще.',
        rule: 'доля новых ≥22%',
      });
    }
    if (shSleep >= 15) {
      out.push({
        sev: 'mid',
        lead: U.nf(k.sleeping_users) + ' ' + U.plural(k.sleeping_users, 'пользователь', 'пользователя', 'пользователей') +
          ' ' + U.plural(k.sleeping_users, 'не заходил', 'не заходили', 'не заходили') + ' больше 30 дней',
        body: '<b>' + U.nf(k.sleeping_users) + '</b> человек (<b>' + U.pct(shSleep) + '</b> аудитории) не открывали ничего ' +
          'более 30 дней. Это те, кого уже привели — и потеряли.',
        rule: 'доля не заходивших >30 дней ≥15%',
      });
    }
    if (shReg < 25) {
      out.push({
        sev: 'mid',
        lead: 'Постоянных пользователей ' + U.pct(shReg) + ' — меньше четверти',
        body: 'Только <b>' + U.nf(k.regular_users) + '</b> человек заходили 8 и более дней за период. Остальные — эпизодически.',
        rule: 'доля постоянных <25%',
      });
    }
    if (sl.kind === 'rep' && sl.report.last_view_days >= 14) {
      out.push({
        sev: 'high',
        lead: 'Отчёт не открывали ' + U.days(sl.report.last_view_days),
        body: 'Последний просмотр «' + U.esc(sl.report.dashboard_nm) + '» был <b>' + U.days(sl.report.last_view_days) +
          '</b> назад, при том что отчёт опубликован и помечен актуальным.',
        rule: 'с последнего просмотра прошло ≥14 дней',
      });
    }
    const ord = { high: 0, mid: 1, good: 2, none: 3 };
    return out.sort((a, b) => ord[a.sev] - ord[b.sev]);
  }

  function obsAudience(meta, stats) {
    const out = [];
    if (meta.is_wide) {
      out.push({
        sev: 'mid',
        lead: 'Доступ открыт почти всей компании — покрытие по нему не показываем',
        body: 'Отчёт роздан через группу <b>' + U.esc(meta.ad_groups[0]) + '</b>, в которой <b>' + U.nf(stats.audience) +
          '</b> человек — практически весь банк. Считать «покрытие целевой аудитории» по такой группе бессмысленно: ' +
          'она не описывает, для кого отчёт делали. Разрезы ниже показывают, кто фактически ходит.',
        rule: 'группа доступа охватывает ≥30% численности',
      });
    }
    if (!meta.is_wide && stats.reachPct < 40) {
      out.push({
        sev: 'high',
        lead: 'До отчёта дошли ' + U.pct(stats.reachPct) + ' целевой аудитории',
        body: 'Из <b>' + U.nf(stats.audience) + '</b> человек с доступом заходили <b>' + U.nf(stats.came) +
          '</b>. Не заходил ни разу <b>' + U.nf(stats.never) + '</b> человек — это и есть список, кому стоит напомнить.',
        rule: 'охват целевой аудитории <40%',
      });
    }
    if (stats.came && stats.once / stats.came >= .45) {
      out.push({
        sev: 'mid',
        lead: 'Почти половина зашедших не вернулась',
        body: '<b>' + U.nf(stats.once) + '</b> из <b>' + U.nf(stats.came) + '</b> открыли отчёт ровно один раз. ' +
          'Разовый визит после рассылки — это не закрепление.',
        rule: 'доля разовых визитов среди зашедших ≥45%',
      });
    }
    if (stats.regular && stats.came && stats.regular / stats.came >= .3) {
      out.push({
        sev: 'good',
        lead: 'У отчёта сформировалось ядро из ' + U.nf(stats.regular) + ' постоянных пользователей',
        body: '<b>' + U.nf(stats.regular) + '</b> человек заходят регулярно (8+ дней за период) — отчёт встроился в их работу.',
        rule: 'доля постоянных среди зашедших ≥30%',
      });
    }
    return out;
  }

  /* ============================== Фильтры UI ============================= */
  const SRV = '<span class="info" data-tip="' + U.esc(U.tipHtml({
    title: 'Пересчёт', text: 'Этот фильтр меняет SQL-запрос: комбинация атрибутов не помещается в предрасчёт. Остальные переключатели считаются в браузере мгновенно.',
  })) + '" aria-label="Требует пересчёта">⟳</span>';

  function renderFilters() {
    const f = S.filters;
    const opt = (v, cur, lbl) => '<option value="' + U.esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + U.esc(lbl == null ? v : lbl) + '</option>';

    let h = '<div class="flt-head"><span class="t">Фильтры</span>' +
      '<button class="btn ghost xs" id="fltReset">Сбросить</button></div>';

    h += '<div class="fgroup"><div class="gb">' +
      '<div class="ctl"><label>Период, последние</label><div class="seg">' +
        Object.keys(D.GRAINS).map((g) =>
          '<button data-grain="' + g + '"' + (g === S.grain ? ' class="on"' : '') + '>' + D.GRAINS[g].label + '</button>').join('') +
      '</div></div></div></div>';

    h += grp('rep', 'Отчёты', (f.collection ? 1 : 0) + (f.owner ? 1 : 0) + (f.certified ? 1 : 0),
      '<div class="ctl"><label>Коллекция ' + SRV + '</label><select data-f="collection">' +
        opt('', f.collection, 'Все коллекции') + D.COLLECTIONS.map((c) => opt(c, f.collection)).join('') +
      '</select></div>' +
      '<div class="ctl"><label>Владелец ' + SRV + '</label><select data-f="owner">' +
        opt('', f.owner, 'Все владельцы') + D.OWNERS.map((c) => opt(c, f.owner)).join('') +
      '</select></div>' +
      swt('published', 'Только опубликованные', f.published) +
      swt('actual', 'Только актуальные', f.actual) +
      swt('certified', 'Только сертифицированные', f.certified));

    if (S.tab === 'audience') {
      h += grp('aud', 'Аудитория', 0,
        '<div class="ctl"><label>Разбивка аудитории</label><select id="audCutSel">' +
          ['lvl3', 'lvl4', 'stream', 'spec', 'exp'].map((k) => opt(k, S.audCut, D.CUTS[k].label)).join('') +
        '</select></div>');
    }

    h += grp('opt', 'Опции', f.excludeOwners ? 1 : 0,
      swt('excludeOwners', 'Исключить владельцев из просмотров', f.excludeOwners,
        'Владелец открывает свой отчёт при каждой правке — его визиты завышают аудиторию.'));

    document.getElementById('sideNav').innerHTML = h;

    function grp(id, title, cnt, body) {
      const open = S._grp !== undefined && S._grp[id] === false ? false : true;
      return '<div class="fgroup"><button class="gh" data-grp="' + id + '" aria-expanded="' + open + '">' +
        '<span class="cc" aria-hidden="true">▾</span>' + U.esc(title) +
        (cnt ? '<span class="cnt">' + cnt + '</span>' : '') + '</button>' +
        '<div class="gb"' + (open ? '' : ' hidden') + '>' + body + '</div></div>';
    }
    function swt(key, label, on, hint) {
      return '<label class="swt"><input type="checkbox" data-f="' + key + '"' + (on ? ' checked' : '') + '>' +
        '<span>' + U.esc(label) + (hint ? ' <span class="info" data-tip="' + U.esc(U.tipHtml({ text: hint })) + '">i</span>' : '') + '</span></label>';
    }
  }

  /* ========================== Очередь графиков =========================== */
  let QUEUE = [];
  const INSTANCES = [];
  function chart(cls, optFn) {
    const id = 'ch' + (QUEUE.length + 1) + '_' + Math.random().toString(36).slice(2, 7);
    QUEUE.push({ id, optFn });
    return '<div class="chart ' + cls + '" id="' + id + '"></div>';
  }
  function mountCharts() {
    while (INSTANCES.length) { try { INSTANCES.pop().dispose(); } catch (e) { /* уже снят */ } }
    QUEUE.forEach((q) => {
      const el = document.getElementById(q.id);
      if (!el) return;
      const inst = echarts.init(el, null, { renderer: 'canvas' });
      inst.setOption(q.optFn());
      INSTANCES.push(inst);
    });
    QUEUE = [];
  }
  addEventListener('resize', () => INSTANCES.forEach((i) => { try { i.resize(); } catch (e) { /* снят */ } }));

  /* ======================================================================
     ВКЛАДКА 1 — «Отчёты»: каталог и динамика в одном экране
     ==================================================================== */

  /* Подшапка над таблицей: в разрезе чего смотрим */
  function cutBar() {
    return '<div class="cutbar">' +
      '<span class="cb-l">В разрезе</span>' +
      '<div class="sub-tabs">' + MODES.map((m) =>
        '<button class="sub-tab' + (m.key === S.mode ? ' active' : '') + '" data-mode="' + m.key + '">' +
        U.esc(m.label) + '</button>').join('') + '</div>' +
      '</div>';
  }

  /* Таблица отчётов — сортируемая, клик выбирает отчёт */
  function reportTable() {
    const rows = reportRows()
      .filter((r) => (!S.repQuery || r.dashboard_nm.toLowerCase().indexOf(S.repQuery.toLowerCase()) >= 0));
    const sorted = rows.slice().sort((a, b) => (a[S.repSort.col] > b[S.repSort.col] ? 1 : -1) * S.repSort.dir);
    const curId = S.sel && MODE(S.sel.mode).axis === 'rep' ? S.sel.val : null;

    const th = (col, label, hint) => '<th data-sort="' + col + '"' + (S.repSort.col === col ? ' class="on"' : '') +
      (hint ? U.tip(hint) : '') + '>' + U.esc(label) + '<span class="sa">' + (S.repSort.dir < 0 ? '▼' : '▲') + '</span></th>';

    if (!sorted.length) {
      return '<div class="empty" style="box-shadow:none"><b>Ничего не найдено</b>Снимите часть фильтров слева или очистите поиск.</div>';
    }
    /* Колонок ровно столько, сколько влезает без горизонтальной прокрутки:
       «просмотров на пользователя» и «новые» ушли в подсказку строки —
       они читаются справа на графике, а сортировать по ним почти не просят. */
    return '<table class="ptable dense sortable reps"><thead><tr>' +
      '<th class="txt" data-sort="dashboard_nm">Отчёт<span class="sa">▲</span></th>' +
      th('users', 'Польз.') + th('views', 'Просм.') +
      th('regular_users', 'Пост.', { text: 'Доля тех, кто заходил в отчёт 8+ дней за период' }) +
      th('last_view_days', 'Тишина', { text: 'Дней с последнего просмотра' }) +
      '</tr></thead><tbody>' +
      sorted.map((r) => '<tr class="urow' + (r.dashboard_id === curId ? ' sel' : '') + '"' +
        ' data-rep="' + r.dashboard_id + '" tabindex="0" role="button" aria-pressed="' + (r.dashboard_id === curId) + '"' +
        U.tip({
          title: r.dashboard_nm,
          rows: [
            { label: 'Пользователи', value: U.nf(r.users), color: CH.C.ret },
            { label: 'Просмотры', value: U.nf(r.views), dash: true, color: CH.C.bench },
            { label: 'На пользователя', value: U.nf(r.views_per_user, 1) },
            { label: 'Новые в отчёте', value: U.nf(r.new_users) },
          ],
          note: 'Создан ' + U.fmtDate(r.created_dt) + (r.certified_by ? ' · сертифицирован ' + r.certified_by : ''),
        }) + '>' +
        '<td class="txt">' + U.esc(r.dashboard_nm) +
          '<span class="unit-sub">' + U.esc(r.owner_login) + ' · ' + U.esc(r.collection) +
          (r.certified_by ? ' · сертифицирован' : '') + (r.is_new ? ' · новый' : '') + '</span></td>' +
        '<td class="lead">' + U.nf(r.users) + '</td>' +
        '<td>' + U.compact(r.views) + '</td>' +
        '<td>' + U.pct(r.users ? r.regular_users / r.users * 100 : 0, 0) + '</td>' +
        '<td>' + (r.last_view_days === 0 ? '<span class="mut">сегодня</span>' : U.days(r.last_view_days)) + '</td>' +
        '</tr>').join('') +
      '</tbody></table>';
  }

  /* Таблица групп отчётов: коллекция или владелец */
  function groupTable() {
    const gk = S.mode;
    const ids = {};
    reportRows().forEach((r) => { ids[r.dashboard_id] = 1; });
    const rows = RP.filter((r) => r.section === 'gkpi' && r.grain === S.grain && r.group_key === gk)
      .map((r) => ({
        key: r.group_val, label: r.group_val,
        reports: r.reports, users: r.users, views: r.views, regular: r.regular_users,
      }))
      .sort((a, b) => b.users - a.users);
    /* ИТОГО не может быть суммой строк: пользователи в группах уникальны
       по группе, а не по всему набору. Считаем итог тем же способом, что
       и строки, — уникальные по всем отчётам выборки (в бою это один
       COUNT(DISTINCT) поверх тех же фильтров, отдельной строкой). */
    const reps = reportRows();
    const dedup = (n) => 1 / (1 + .16 * Math.log(1 + n));
    const d = dedup(reps.length || 1);
    const sum = (f) => Math.round(reps.reduce((a, b) => a + b[f], 0) * d);
    const totUsers = sum('users');
    return U.barTable({
      cutKey: gk, selected: S.sel && S.sel.mode === gk ? S.sel.val : null,
      firstH: MODE(gk).one, firstW: '34%', colW: '15%', barH: 'Доля пользователей',
      barClass: 'c-rep', dense: true,
      cols: [
        { label: 'Отчётов' },
        { label: 'Польз.', hint: { text: 'Уникальные пользователи группы за период' } },
        { label: 'Просм.' },
      ],
      total: {
        cells: [U.nf(reps.length), U.nf(totUsers),
          U.compact(reps.reduce((a, b) => a + b.views, 0))],
        tip: {
          title: 'ИТОГО',
          text: 'Пользователи в ИТОГО — уникальные по всей выборке, а не сумма строк: ' +
            'один человек, открывший отчёты двух коллекций, посчитан один раз.',
        },
      },
      rows: rows.map((r) => ({
        key: r.key, label: r.label,
        cells: [U.nf(r.reports), U.nf(r.users), U.compact(r.views)],
        bar: r.users,
        tip: {
          title: r.label,
          rows: [{ label: 'Пользователи', value: U.nf(r.users), color: CH.C.ret },
            { label: 'Просмотры', value: U.compact(r.views), dash: true, color: CH.C.bench },
            { label: 'Постоянные', value: U.pct(r.users ? r.regular / r.users * 100 : 0, 0) }],
        },
      })),
      note: 'Пользователи группы — <b>уникальные</b>: один человек, открывший три отчёта коллекции, ' +
        'считается один раз, поэтому строки в ИТОГО не складываются. Просмотры складываются.',
    });
  }

  /* Таблица срезов по людям */
  function cutTable() {
    const ck = S.mode;
    const rows = OV.filter((r) => r.section === 'kpi' && r.grain === S.grain && r.cut_key === ck)
      .map((r) => ({
        key: r.cut_val, label: r.cut_val,
        users: r.users, views: r.views, new_users: r.new_users, regular: r.regular_users,
      }))
      .sort((a, b) => b.users - a.users);
    const tot = rows.reduce((a, b) => a + b.users, 0);
    return U.barTable({
      cutKey: ck, selected: S.sel && S.sel.mode === ck ? S.sel.val : null,
      firstH: D.CUTS[ck].label, firstW: '38%', colW: '15%', barH: 'Доля пользователей',
      barClass: 'c-rep', dense: true,
      cols: [{ label: 'Польз.' }, { label: 'Просм.' }, { label: 'Постоян.' }],
      total: {
        cells: [U.nf(tot), U.compact(rows.reduce((a, b) => a + b.views, 0)),
          U.nf(rows.reduce((a, b) => a + b.regular, 0))],
      },
      rows: rows.map((r) => ({
        key: r.key, label: r.label,
        cells: [U.nf(r.users), U.compact(r.views), U.pct(r.users ? r.regular / r.users * 100 : 0, 0)],
        bar: r.users,
        tip: {
          title: r.label,
          rows: [{ label: 'Пользователи', value: U.nf(r.users), color: CH.C.ret },
            { label: 'Доля', value: U.pct(tot ? r.users / tot * 100 : 0) },
            { label: 'Новые', value: U.nf(r.new_users) },
            { label: 'Постоянные', value: U.nf(r.regular), dash: true, color: CH.C.bench }],
        },
      })),
      note: 'У сотрудника ровно одно значение разреза, поэтому строки складываются в ИТОГО. ' +
        'Показаны все отчёты Proteus, а не выбранный.',
    });
  }

  function renderReports() {
    const k = kpiRow();
    const ts = series();
    const sl = selection();
    const rows = reportRows();
    const dPct = (a, b) => (b ? (a / b - 1) * 100 : null);
    const vs = U.prevPeriodLabel(S.grain);
    const shReg = k && k.users ? k.regular_users / k.users * 100 : 0;
    const shRegPrev = k && k.users_prev ? k.regular_users_prev / k.users_prev * 100 : 0;

    let h = head('Отчёты и динамика просмотров',
      'Основной экран: слева — по чему смотрим, справа — что с этим происходит. ' +
      'Без выбора показан весь Proteus; выберите отчёт, коллекцию, себя как владельца или подразделение — ' +
      'карточки, динамика, частота и закрепляемость пересчитаются под выбор. ' +
      'Период — <b>' + U.periodLabel(S.grain) + '</b>.');

    /* Пятая карточка зависит от того, что выбрано: у отчёта осмысленна
       тишина, у группы и у всего Proteus — размер каталога. */
    const fifth = sl.kind === 'rep'
      ? U.kpi({
        label: 'Последний просмотр',
        value: sl.report.last_view_days === 0 ? 'сегодня' : U.days(sl.report.last_view_days),
        hint: { title: 'Тишина', text: 'Сколько дней прошло с последнего открытия отчёта кем угодно.' },
        delta: '', sub: 'создан <b>' + U.fmtDate(sl.report.created_dt) + '</b>',
      })
      : U.kpi({
        label: 'Отчётов в выборке',
        value: U.nf(sl.kind === 'grp' && sl.group ? sl.group.reports : rows.length),
        hint: { title: 'Каталог', text: 'Отчёты, попавшие под фильтры слева. Отчёты без единого просмотра в витрину не попадают.' },
        delta: '', sub: 'по текущим фильтрам',
      });

    h += U.kpis([
      U.kpi({
        label: 'Пользователей', value: U.nf(k.users),
        hint: { title: 'Пользователи', text: 'Уникальные логины за период.', note: 'Сумма по дням больше: один человек заходит в разные дни.' },
        delta: U.delta(dPct(k.users, k.users_prev), {
          vs, tip: { title: 'Сравнение', rows: [{ label: 'Период', value: U.nf(k.users) }, { label: 'Предыдущий', value: U.nf(k.users_prev), dash: true, color: CH.C.bench }] },
        }),
        sub: 'предыдущий: <b>' + U.nf(k.users_prev) + '</b>',
      }),
      U.kpi({
        label: 'Просмотров', value: U.compact(k.views),
        hint: { title: 'Просмотры', text: 'Сумма открытий (action_count).' },
        delta: U.delta(dPct(k.views, k.views_prev), { vs }),
        sub: 'на пользователя: <b>' + U.nf(k.users ? k.views / k.users : 0, 1) + '</b>',
      }),
      U.kpi({
        label: 'Новых пользователей', value: U.nf(k.new_users),
        hint: {
          title: 'Новые',
          text: sl.kind === 'all' || sl.kind === 'cut'
            ? 'Первый визит в Proteus пришёлся на этот период.'
            : 'Впервые открыли этот отчёт за период.',
        },
        delta: U.delta(dPct(k.new_users, k.new_users_prev), { vs }),
        sub: 'доля аудитории: <b>' + U.pct(k.users ? k.new_users / k.users * 100 : 0) + '</b>',
      }),
      U.kpi({
        label: 'Постоянных', value: U.pct(shReg),
        hint: { title: 'Постоянные', text: 'Заходили 8 и более разных дней за период.', note: 'Порог выбран как «примерно раз в неделю и чаще».' },
        delta: U.delta(shReg - shRegPrev, { vs, unit: ' п.п.', dead: .3 }),
        sub: '<b>' + U.nf(k.regular_users) + '</b> ' + U.plural(k.regular_users, 'человек', 'человека', 'человек'),
      }),
      fifth,
    ], 5);

    h += U.observations(obsMain(), 'main');

    /* ---- Ядро экрана: селектор слева, динамика справа ------------------- */
    const table = S.mode === 'report' ? reportTable()
      : (MODE(S.mode).axis === 'grp' ? groupTable() : cutTable());

    const isRep = sl.kind === 'rep';
    h += '<div class="split main">' +
      U.panel({
        cls: 'split-l', title: 'Каталог', sub: 'клик по строке задаёт контекст вкладки',
        right: S.mode === 'report' ? U.searchBox('repQ', 'Найти отчёт', S.repQuery) : '',
        under: cutBar(), bodyCls: 'tbl-wrap', body: table,
      }) +
      U.panel({
        cls: 'split-r', title: sl.title, sub: sl.sub,
        right: isRep ? '<button class="btn" data-goaud="' + sl.report.dashboard_id + '">Аудитория отчёта →</button>' : '',
        body: chart('fill', () => CH.dynamics(ts, S.grain, {
          title: 'Пользователи по периодам',
          newLabel: (sl.kind === 'rep' || sl.kind === 'grp') ? 'Новые в отчёте' : 'Новые',
          newNote: (sl.kind === 'rep' || sl.kind === 'grp')
            ? 'Новый — впервые открыл этот отчёт, а не Proteus вообще'
            : 'Новый — первый визит в Proteus пришёлся на этот ' + D.GRAINS[S.grain].unit,
        })) +
          (sl.kind === 'grp'
            ? '<div class="tbl-note">Пользователи группы — уникальные по группе: один человек, открывший два отчёта, ' +
              'в столбце учтён один раз. Просмотры складываются точно.</div>'
            : ''),
      }) +
      '</div>';

    /* ---- Закрепляемость и частота --------------------------------------- */
    const cohorts = cohortRows();
    const retTitle = isRep ? 'Закрепляемость отчёта' : 'Закрепляемость Proteus';
    const retSub = isRep
      ? 'когорта — месяц, в который человек открыл этот отчёт впервые ⟳'
      : 'когорта — месяц первого визита в Proteus; фильтр периода на этот блок не действует';
    const fr = freqRows();
    const frTot = fr.reduce((a, b) => a + b.users, 0);

    h += '<div class="split ret">' +
      U.panel({
        cls: 'split-l', title: retTitle, sub: retSub,
        tabKey: 'retView',
        tabs: [{ key: 'cohort', label: 'Когорты', on: S.retView === 'cohort' },
          { key: 'curve', label: 'Кривая', on: S.retView === 'curve' }],
        body: S.retView === 'cohort'
          ? U.cohortTable({
            rows: cohorts, maxAge: 11,
            firstTip: isRep ? 'Месяц, в который человек открыл этот отчёт впервые'
              : 'Месяц первого визита в Proteus',
            sizeNote: isRep ? 'Столько человек открыли этот отчёт впервые в этом месяце'
              : 'Столько человек впервые зашли в Proteus в этом месяце',
            note: 'В ячейке — доля когорты, вернувшаяся через N месяцев. Цвет — отклонение от медианы ' +
              'своего столбца: голубой — выше медианы, жёлтый — ниже. «м» в шапке — медиана закрытых ячеек ' +
              'столбца. Медиана — не норма и не цель, это середина других когорт в том же возрасте. ' +
              'Серый курсив — месяц ещё не закрыт, значение дорастёт и в медиану с раскраской не входит. ' +
              'Столбца «старт» нет: в нём всегда 100%.',
          })
          : chart('h-tall', () => CH.retentionCurve(retentionPoints(cohorts), {
            title: isRep ? 'Средняя кривая удержания отчёта' : 'Средняя кривая удержания по всем когортам',
          })),
      }) +
      U.panel({
        cls: 'split-r', title: 'Как часто заходят',
        sub: 'сколько разных дней заходили за период',
        body: U.barTable({
          firstH: 'Дней', firstW: '30%', colW: '24%', barH: 'Доля',
          dense: true,
          cols: [{ label: 'Человек' }],
          total: { cells: [U.nf(frTot)] },
          rows: fr.map((r) => ({
            key: r.bucket, label: r.bucket,
            cells: [U.nf(r.users)],
            bar: r.users,
            tip: {
              title: r.bucket,
              rows: [{ label: 'Человек', value: U.nf(r.users), color: CH.C.ret },
                { label: 'Доля аудитории', value: U.pct(frTot ? r.users / frTot * 100 : 0) }],
            },
          })),
          note: 'Разовые визиты — первая строка. Чем она толще, тем хуже удерживаются пришедшие.',
        }),
      }) +
      '</div>';

    return h;
  }

  /* ======================================================================
     ВКЛАДКА 2 — «Аудитория отчёта»
     ==================================================================== */
  function renderAudience() {
    const cur = currentReport();
    if (!cur) return head('Аудитория отчёта', '') + '<div class="empty"><b>Нет отчётов по текущим фильтрам</b>Снимите часть фильтров слева.</div>';

    const meta = D.audienceMeta[cur.dashboard_id];
    const persons = D.audiencePersons(cur.dashboard_id);
    const sampleOf = persons.length ? persons[0].sample_of : 0;
    const scale = sampleOf / Math.max(1, persons.length);
    const came = persons.filter((p) => p.came);
    const st = {
      audience: sampleOf,
      came: Math.round(came.length * scale),
      never: Math.round((persons.length - came.length) * scale),
      once: Math.round(persons.filter((p) => p.segment === 'Разовый').length * scale),
      episodic: Math.round(persons.filter((p) => p.segment === 'Эпизодический').length * scale),
      regular: Math.round(persons.filter((p) => p.segment === 'Постоянный').length * scale),
    };
    st.reachPct = st.audience ? st.came / st.audience * 100 : 0;
    st.returned = st.came - st.once;

    let h = head('Аудитория отчёта: ' + cur.dashboard_nm,
      'Кому отчёт был роздан, кто из них дошёл, кто закрепился и кто не заходил ни разу. ' +
      'Отчёт выбирается в каталоге на вкладке «Отчёты» или списком ниже.');

    /* Плашка источника ЦА — честно говорит, откуда взялась «целевая аудитория».
       Два ПОДПИСАННЫХ блока: слева источник доступа, справа выбор отчёта —
       голый выпадающий список без подписи читался как «выбор группы». */
    const srcTitle = meta.is_wide
      ? 'Доступ почти всей компании'
      : (meta.audience_type === 'acl' ? 'Поимённый список доступа' : 'Доступ через AD-группы');
    const srcText = meta.is_wide
      ? 'Группа <b>' + U.esc(meta.ad_groups[0]) + '</b> — в ней <b>' + U.nf(st.audience) + '</b> человек, практически весь банк. Такая группа не описывает, для кого делали отчёт, поэтому долю покрытия по ней мы не считаем: она всегда будет выглядеть провальной.'
      : (meta.audience_type === 'acl'
        ? 'Отчёт роздан <b>' + U.nf(st.audience) + '</b> сотрудникам поимённо. Это самый точный вид целевой аудитории: покрытие и список «не заходил» считаются без допущений.'
        : 'Права выданы группам: <b>' + meta.ad_groups.map(U.esc).join('</b>, <b>') + '</b> — всего <b>' + U.nf(st.audience) + '</b> человек. Считаем их целевой аудиторией.');

    h += '<div class="aud-src' + (meta.is_wide ? ' wide' : '') + '">' +
      '<span class="as-i" aria-hidden="true">' + (meta.is_wide ? '!' : 'i') + '</span>' +
      '<div class="as-b">' +
        '<div class="as-cap">Откуда целевая аудитория</div>' +
        '<div class="as-t">' + U.esc(srcTitle) +
          (meta.is_wide ? '<span class="sig-chip warn">покрытие не считаем</span>' : '<span class="sig-chip info">' + U.nf(st.audience) + ' человек</span>') +
        '</div>' +
        '<div class="as-x">' + srcText + '</div>' +
      '</div>' +
      '<div class="as-pick">' +
        '<label class="as-cap" for="audRep">Отчёт</label>' +
        '<select id="audRep" class="aud-pick" aria-label="Отчёт, чью аудиторию смотрим">' +
          reportRows().map((r) => '<option value="' + r.dashboard_id + '"' + (r.dashboard_id === cur.dashboard_id ? ' selected' : '') + '>' + U.esc(r.dashboard_nm) + '</option>').join('') +
        '</select>' +
        '<div class="as-cap2">аудитория показана для выбранного</div>' +
      '</div>' +
      '</div>';

    h += U.kpis([
      U.kpi({
        label: 'Целевая аудитория', value: U.nf(st.audience),
        hint: { title: 'Откуда число', text: meta.audience_type === 'acl' ? 'Поимённый список доступа к отчёту.' : 'Сотрудники, состоящие в AD-группах доступа отчёта.' },
        delta: '', sub: meta.is_wide ? '<b>широкая группа</b>' : 'человек с доступом',
      }),
      U.kpi({
        label: 'Дошли', value: U.nf(st.came),
        hint: { title: 'Дошли', text: 'Открывали отчёт хотя бы раз за период.' },
        delta: meta.is_wide ? '' : U.delta(st.reachPct - 100, { neutral: true, vs: 'до полного охвата', unit: ' п.п.', dec: 0, tip: { title: 'Охват', rows: [{ label: 'Дошли', value: U.nf(st.came), color: CH.C.new }, { label: 'Целевая аудитория', value: U.nf(st.audience), dash: true, color: CH.C.bench }] } }),
        sub: meta.is_wide ? 'доля по широкой группе не считается' : 'охват <b>' + U.pct(st.reachPct) + '</b>',
      }),
      U.kpi({
        label: 'Закрепились', value: U.nf(st.regular),
        hint: { title: 'Постоянные', text: 'Заходили в отчёт 8 и более разных дней за период.' },
        delta: '', sub: 'от дошедших <b>' + U.pct(st.came ? st.regular / st.came * 100 : 0, 0) + '</b>',
      }),
      U.kpi({
        label: 'Зашли один раз', value: U.nf(st.once),
        hint: { title: 'Разовые', text: 'Ровно один активный день за период — типичная реакция на рассылку.' },
        delta: '', sub: 'от дошедших <b>' + U.pct(st.came ? st.once / st.came * 100 : 0, 0) + '</b>',
      }),
      U.kpi({
        label: 'Ни разу не заходили', value: U.nf(st.never),
        hint: { title: 'Кому напомнить', text: 'Есть доступ, но за период не открывали. Список — в таблице ниже, сегмент «Не заходил».' },
        delta: '', sub: meta.is_wide ? 'по широкой группе не показательно' : '<b>' + U.pct(st.audience ? st.never / st.audience * 100 : 0, 0) + '</b> аудитории',
      }),
    ], 5);

    h += U.observations(obsAudience(meta, st), 'aud');

    /* Воронка + приход после публикации */
    h += '<div class="grid2">' +
      U.panel({
        title: 'Путь целевой аудитории',
        sub: 'от выданного доступа до регулярного использования',
        body: chart('h-mid', () => CH.funnel([
          { name: 'Есть доступ', value: st.audience, note: meta.audience_type === 'acl' ? 'Поимённый список' : 'Через AD-группы' },
          { name: 'Открыли хотя бы раз', value: st.came },
          { name: 'Вернулись ещё раз', value: st.returned },
          { name: 'Заходят регулярно', value: st.regular, note: '8+ активных дней за период' },
        ])) + '<div class="tbl-note">Каждый следующий этап — подмножество предыдущего.</div>',
      }) +
      U.panel({
        title: 'Когда приходили',
        sub: cur.is_new ? 'отчёт создан ' + U.fmtDate(cur.created_dt) + ' — виден всплеск после рассылки' : 'первые визиты и накопленный охват',
        body: chart('h-mid', () => {
          // накопленный охват должен прийти ровно к «Дошли» — это те же люди
          const rows = D.audienceReach(cur.dashboard_id, S.grain, { total: st.came });
          const bs = D.buckets(S.grain);
          const ci = bs.findIndex((b) => b >= cur.created_dt);
          return CH.reach(rows, S.grain, { createdIdx: ci, audience: meta.is_wide ? null : st.audience });
        }),
      }) +
      '</div>';

    /* Состав + таблица людей */
    const segs = [
      { name: 'Постоянные', value: st.regular, color: CH.C.new, note: '8+ активных дней' },
      { name: 'Эпизодические', value: st.episodic, color: CH.C.ret, note: '2–7 активных дней' },
      { name: 'Разовые', value: st.once, color: CH.C.retLight, note: 'ровно один день' },
      { name: 'Не заходили', value: st.never, color: CH.C.bench, note: 'доступ есть, визитов нет' },
    ];

    const plist = persons
      .filter((p) => !S.audSeg || p.segment === S.audSeg)
      .filter((p) => !S.audQuery || (p.fio + ' ' + p.login).toLowerCase().indexOf(S.audQuery.toLowerCase()) >= 0)
      .sort((a, b) => b.active_days - a.active_days)
      .slice(0, 40);

    const segChips = ['Постоянный', 'Эпизодический', 'Разовый', 'Не заходил'].map((s) =>
      '<button class="sub-tab' + (S.audSeg === s ? ' active' : '') + '" data-seg="' + s + '">' + s + '</button>').join('');

    /* Разбивка ЦА по подразделениям: сколько человек с доступом и сколько дошло */
    const byUnit = {};
    persons.forEach((p) => {
      const key = p[S.audCut] != null ? p[S.audCut] : p.lvl3;
      const a = (byUnit[key] = byUnit[key] || { key, label: key, aud: 0, came: 0 });
      a.aud++; if (p.came) a.came++;
    });
    const unitRows = Object.values(byUnit).map((a) => ({
      key: a.key, label: a.label,
      aud: Math.round(a.aud * scale), came: Math.round(a.came * scale),
      cov: a.aud ? a.came / a.aud * 100 : 0,
    })).sort((a, b) => b.aud - a.aud);

    h += '<div class="split aud">' +
      U.panel({
        cls: 'split-l', title: 'Кто из целевой аудитории',
        sub: 'сегмент выбирается кнопками над списком',
        right: U.searchBox('audQ', 'Имя или логин', S.audQuery),
        /* Обе панели сплита одной высоты, длинные списки крутятся внутри —
           страница не вытягивается на высину таблицы. */
        body: '<div class="sub-tabs">' +
            '<button class="sub-tab' + (!S.audSeg ? ' active' : '') + '" data-seg="">Все</button>' + segChips +
          '</div>' +
          /* Просмотры на человека убраны в подсказку: шести колонок панель
             не выдерживает, и чипы сегмента наезжали на даты. */
          '<div class="tbl-scroll">' +
          '<table class="ptable dense"><thead><tr>' +
            '<th class="txt">Сотрудник</th><th class="txt">Подразделение</th>' +
            '<th>Дней</th><th>Визит</th><th class="txt">Сегмент</th>' +
          '</tr></thead><tbody>' +
          (plist.length ? plist.map((p) => '<tr' + U.tip({
            title: p.fio,
            rows: [
              { label: 'Активных дней', value: U.nf(p.active_days), color: CH.C.new },
              { label: 'Просмотров', value: p.views ? U.nf(p.views) : '—' },
              { label: 'Специализация', value: p.spec, dash: true, color: CH.C.bench },
            ],
          }) + '>' +
            '<td class="txt">' + U.esc(p.fio) + '<span class="unit-sub">' + U.esc(p.login) + (p.is_head ? ' · руководитель' : '') + '</span></td>' +
            '<td class="txt sec">' + U.esc(p.lvl3) + '<span class="unit-sub">' + U.esc(p.spec) + '</span></td>' +
            '<td class="lead">' + (p.active_days || '<span class="mut">0</span>') + '</td>' +
            '<td>' + (p.last_visit_days == null ? '<span class="mut">нет</span>' : (p.last_visit_days === 0 ? 'сегодня' : U.days(p.last_visit_days))) + '</td>' +
            '<td class="txt"><span class="sig-chip ' + ({ 'Постоянный': 'good', 'Эпизодический': 'info', 'Разовый': 'neutral', 'Не заходил': 'bad' }[p.segment]) + '">' + p.segment + '</span></td>' +
            '</tr>').join('')
            : '<tr><td colspan="5" style="text-align:center;padding:var(--s9);color:var(--muted)">Никто не подходит под выбранный сегмент и поиск.</td></tr>') +
          '</tbody></table></div>' +
          '<div class="tbl-note">Показаны первые 40 строк; поиск и сегмент сужают список' + (scale > 1.05 ? '. В макете список — выборка из ' + U.nf(sampleOf) + ' человек' : '') + '. В Proteus это серверная пагинация и выгрузка в файл.</div>',
      }) +
      U.panel({
        cls: 'split-r', title: 'Состав и охват по подразделениям',
        sub: 'разбивка выбирается в фильтрах слева',
        body: chart('h-low', () => CH.segmentBar(segs)) +
          '<div class="tbl-scroll">' +
          U.barTable({
            firstH: D.CUTS[S.audCut].label, firstW: '34%', colW: '14%', barH: 'Охват',
            barClass: 'c-cov', dense: true,
            cols: [{ label: 'Доступ' }, { label: 'Дошли' }, { label: 'Охват' }],
            total: {
              cells: [U.nf(st.audience), U.nf(st.came), meta.is_wide ? '<span class="mut">—</span>' : U.pct(st.reachPct, 0)],
            },
            rows: unitRows.map((r) => ({
              key: r.key, label: r.label,
              cells: [U.nf(r.aud), U.nf(r.came), meta.is_wide ? '<span class="mut">—</span>' : U.pct(r.cov, 0)],
              bar: r.cov,
              tip: { title: r.label, rows: [{ label: 'С доступом', value: U.nf(r.aud), dash: true, color: CH.C.bench }, { label: 'Дошли', value: U.nf(r.came), color: CH.C.new }, { label: 'Охват', value: U.pct(r.cov) }] },
            })),
            note: meta.is_wide ? 'Доля охвата по широкой группе не показывается: знаменатель не отражает целевую аудиторию.' : 'Полоса — доля дошедших внутри подразделения, а не вклад в общий охват.',
          }) + '</div>',
      }) +
      '</div>';

    return h;
  }

  /* ============================ Общий заголовок ========================== */
  function head(title, text) {
    const chips = [];
    chips.push(U.benchChip('Период: <b>' + D.GRAINS[S.grain].label + '</b>'));
    if (S.sel) chips.push(U.chip(MODE(S.sel.mode).one + ': ' + selection().title, 'sel'));
    if (S.filters.collection) chips.push(U.chip('Коллекция: ' + S.filters.collection, 'collection'));
    if (S.filters.owner) chips.push(U.chip('Владелец: ' + S.filters.owner, 'owner'));
    if (S.filters.certified) chips.push(U.chip('Только сертифицированные', 'certified'));
    return '<div class="page-h"><div class="ph-row"><h2>' + U.esc(title) + '</h2></div>' +
      (text ? '<p>' + text + '</p>' : '') +
      '<div class="chips">' + chips.join('') + '</div></div>';
  }

  /* ================================ Рендер =============================== */
  const TABS = [
    { key: 'reports', label: 'Отчёты', fn: renderReports },
    { key: 'audience', label: 'Аудитория отчёта', fn: renderAudience },
  ];

  function render(keepScroll) {
    const y = keepScroll ? window.scrollY : 0;
    document.getElementById('tabsHost').innerHTML =
      '<div class="tabs" role="tablist">' + TABS.map((t) =>
        '<button class="tab' + (t.key === S.tab ? ' active' : '') + '" role="tab" data-tab="' + t.key + '"' +
        ' aria-selected="' + (t.key === S.tab) + '">' + t.label + '</button>').join('') + '</div>' +
      '<div style="flex:1"></div>' +
      '<button class="btn ghost" id="btnHow">Как это устроено</button>';

    QUEUE = [];
    document.getElementById('view').innerHTML = TABS.find((t) => t.key === S.tab).fn();
    renderFilters();
    mountCharts();
    if (keepScroll) window.scrollTo(0, y);
  }

  /* Выбор строки: повторный клик по выбранному снимает выбор */
  function pick(mode, val) {
    S.sel = (S.sel && S.sel.mode === mode && String(S.sel.val) === String(val)) ? null : { mode, val };
    if (S.sel && MODE(mode).axis === 'rep') S.selectedReport = val;
  }

  /* ============================== События ================================ */
  document.addEventListener('click', (e) => {
    const t = e.target;
    const cl = (sel) => t.closest ? t.closest(sel) : null;

    const tab = cl('[data-tab]');
    if (tab) { S.tab = tab.dataset.tab; render(); return; }

    const gr = cl('[data-grain]');
    if (gr) { S.grain = gr.dataset.grain; render(true); return; }

    const md = cl('[data-mode]');
    if (md) {
      if (S.mode !== md.dataset.mode) { S.mode = md.dataset.mode; S.sel = null; }
      render(true); return;
    }

    const stab = cl('[data-stab]');
    if (stab) { S[stab.dataset.stab] = stab.dataset.val; render(true); return; }

    const seg = cl('[data-seg]');
    if (seg) { S.audSeg = seg.dataset.seg || null; render(true); return; }

    const grp = cl('[data-grp]');
    if (grp) {
      S._grp = S._grp || {};
      const open = grp.getAttribute('aria-expanded') === 'true';
      S._grp[grp.dataset.grp] = !open;
      grp.setAttribute('aria-expanded', String(!open));
      grp.parentNode.querySelector('.gb').hidden = open;
      return;
    }

    const un = cl('[data-unchip]');
    if (un) {
      const k = un.dataset.unchip;
      if (k === 'sel') S.sel = null;
      else S.filters[k] = (typeof S.filters[k] === 'boolean') ? false : '';
      render(true); return;
    }

    const srow = cl('[data-slice]');
    if (srow && srow.dataset.slice) { pick(srow.dataset.slice, srow.dataset.val); render(true); return; }

    const rep = cl('[data-rep]');
    if (rep) { pick('report', +rep.dataset.rep); render(true); return; }

    const go = cl('[data-goaud]');
    if (go) { S.selectedReport = +go.dataset.goaud; S.tab = 'audience'; S.audSeg = null; render(); return; }

    const sortTh = cl('th[data-sort]');
    if (sortTh) {
      const c = sortTh.dataset.sort;
      if (S.repSort.col === c) S.repSort.dir *= -1; else { S.repSort.col = c; S.repSort.dir = -1; }
      render(true); return;
    }

    const obsH = cl('.obs-h');
    if (obsH) {
      const body = obsH.parentNode.querySelector('.obs-b');
      const open = !body.hidden;
      body.hidden = open;
      obsH.setAttribute('aria-expanded', String(!open));
      obsH.querySelector('.obs-caret').textContent = open ? '▸' : '▾';
      obsH.querySelector('.obs-tag').textContent = open ? 'подробнее' : 'свернуть';
      return;
    }

    if (t.id === 'fltReset') {
      S.sel = null; S.repQuery = ''; S.audQuery = ''; S.audSeg = null;
      S.filters = { collection: '', owner: '', published: true, actual: true, certified: false, excludeOwners: true };
      render(); return;
    }
    if (t.id === 'btnHow') { document.getElementById('howModal').hidden = false; return; }
    if (t.id === 'howClose' || t.id === 'howModal') { document.getElementById('howModal').hidden = true; return; }
    if (t.id === 'navToggle') {
      document.getElementById('sideNav').classList.toggle('open');
      document.getElementById('navScrim').classList.toggle('open');
      return;
    }
    if (t.id === 'navScrim') {
      document.getElementById('sideNav').classList.remove('open');
      t.classList.remove('open');
      return;
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'audCutSel') { S.audCut = t.value; render(true); return; }
    if (t.id === 'audRep') { S.selectedReport = +t.value; render(true); return; }
    if (t.dataset && t.dataset.f) {
      S.filters[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value;
      // выбранный отчёт мог выпасть из фильтра — тогда снимаем выбор
      if (S.sel && MODE(S.sel.mode).axis === 'rep' && !reportById(S.sel.val)) S.sel = null;
      render(true); return;
    }
  });

  let qTimer = null;
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id !== 'repQ' && t.id !== 'audQ') return;
    clearTimeout(qTimer);
    const isRep = t.id === 'repQ';
    const v = t.value;
    qTimer = setTimeout(() => {
      if (isRep) S.repQuery = v; else S.audQuery = v;
      render(true);
      const el = document.getElementById(isRep ? 'repQ' : 'audQ');
      if (el) { el.focus(); el.setSelectionRange(v.length, v.length); }
    }, 260);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.getElementById('howModal').hidden = true;
      document.getElementById('sideNav').classList.remove('open');
      document.getElementById('navScrim').classList.remove('open');
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role="button"]')) {
      e.preventDefault();
      e.target.click();
    }
  });

  /* ================================ Старт ================================ */
  document.getElementById('freshDate').innerHTML = 'данные на <b>' + U.fmtDate(D.MAX_DATE) + '</b>';
  render();
})();
