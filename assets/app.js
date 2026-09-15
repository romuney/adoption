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
    viewsMode: 'total',          // нижняя панель динамики: всего | на пользователя
    ctBase: 'col',               // чем меряет цвет когорт: медиана столбца
    freqSel: null,               // кросс-фильтр «как часто заходят» ⟳
    audCut: 'lvl3',              // разрез разбивки аудитории
    audSeg: null,                // сегмент поведения — фильтр поимённого списка
    audUnit: null,               // {key,val} — кросс-фильтр по разрезу структуры
    audScope: { kind: 'one', ids: [], collection: 'Розница' },
    audDef: { mode: 'access', filters: {}, draft: {} },
    _audCfg: false,              // открыт ли конструктор целевой аудитории
    _audDim: 'lvl3',             // разрез, открытый в конструкторе
    scopeQuery: '',              // поиск в мультивыборе отчётов
    repSort: { col: 'users', dir: -1 },
    repQuery: '',
    audQuery: '',
    filters: { collection: '', owner: '', published: true, actual: true, certified: false, excludeOwners: true },
  };

  const OV = D.ds_overview;
  const RP = D.ds_reports;

  /* Витрина хранит 12 месяцев. Значит «за 12 месяцев к предыдущим 12» и
     «за 8 кварталов к предыдущим 8» сравнивать НЕ С ЧЕМ: предыдущего
     периода в данных просто нет. Раньше такая дельта всё равно рисовалась —
     это была выдумка. Теперь сравнение остаётся только там, где предыдущий
     период реально лежит в витрине. */
  const HAS_PREV = { d: true, w: true, m: false, q: false };
  const NO_PREV_WHY = 'В витрине 12 месяцев истории. Предыдущего периода такой же длины в ней нет, поэтому сравнивать не с чем.';

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

  /* --- MAU: месячная аудитория, не зависящая от выбранного периода ------- */
  function mauRow() {
    const sl = S.sel;
    if (!sl) return OV.find((r) => r.section === 'mau' && r.cut_key === 'all');
    if (MODE(sl.mode).axis === 'rep') return RP.find((r) => r.section === 'rmau' && r.dashboard_id === sl.val);
    if (MODE(sl.mode).axis === 'grp') {
      return RP.find((r) => r.section === 'gmau' && r.group_key === sl.mode && r.group_val === sl.val);
    }
    return OV.find((r) => r.section === 'mau' && r.cut_key === sl.mode && r.cut_val === sl.val);
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

  /* --- Кросс-фильтр «как часто заходят» ⟳ ---------------------------------
     Клик по корзине частоты оставляет на экране только этих людей: динамика,
     просмотры и карточки пересчитываются под них. В бою это серверный
     запрос — сначала набирается множество user_id с нужным числом активных
     дней, потом по нему строится динамика; в длинный формат такое
     пересечение не укладывается. Здесь то же самое приближается детерминированно
     из того, что уже лежит в браузере, чтобы можно было пощупать поведение.

     Арифметика: у корзины известно число людей и среднее число активных
     ДНЕЙ на человека. Значит известно и число человеко-дней — оно и
     раскладывается по бакетам в пропорции исходной динамики. Доля
     «продолжающих» падает вместе с частотой: кто заходит раз в месяц,
     физически не может быть в предыдущем дне. */
  const FREQ_DAYS = { '1 день': 1, '2–3 дня': 2.5, '4–7 дней': 5.5, '8–15 дней': 11.5, '16+ дней': 21 };
  const REGULAR_FREQ = { '8–15 дней': 1, '16+ дней': 1 };

  /* Доля бакетов, в которых человек этой корзины вообще появляется */
  function freqPresence(bucketName, nBuckets) {
    const days = FREQ_DAYS[bucketName] || 1;
    return Math.max(0.02, Math.min(1, days / Math.max(1, nBuckets)));
  }

  /* Срез по корзине частоты: и ряды, и карточки считаются в одном месте,
     иначе график и KPI разъезжаются. Сравнение с предыдущим периодом здесь
     НЕ строится: состав корзин за прошлый период в датасете не лежит, а
     подставлять туда общую динамику — значит нарисовать несуществующий рост.
     Поэтому дельты в этом режиме честно сняты. */
  function freqSlice(ts, k) {
    if (!S.freqSel || !k || !ts.length) return { ts, k, sliced: false };
    const fr = freqRows();
    const total = fr.reduce((a, b) => a + b.users, 0);
    const mine = fr.find((r) => r.bucket === S.freqSel);
    if (!mine || !total) return { ts, k, sliced: false };

    const n = ts.length;
    const share = mine.users / total;
    const pres = freqPresence(S.freqSel, n);
    const sumU = ts.reduce((a, b) => a + b.users, 0) || 1;
    const sumNew = ts.reduce((a, b) => a + b.new_users, 0) || 1;
    /* Человеко-дни корзины = люди × среднее число активных дней. Их и
       раскладываем по бакетам в пропорции исходной динамики. */
    const uScale = (mine.users * pres * n) / sumU;
    const newTarget = Math.round((k.new_users || 0) * share);
    const nScale = newTarget / sumNew;
    const vBoost = 1 + (FREQ_DAYS[S.freqSel] - 1) / 22;   // частый ходок и смотрит больше

    const rows = ts.map((r) => {
      const u = Math.max(0, Math.min(r.users, Math.round(r.users * uScale)));
      const nu = Math.min(u, Math.round(r.new_users * nScale));
      const ret = Math.min(u - nu, Math.round(u * pres));
      return Object.assign({}, r, {
        users: u, new_users: nu, ret_users: ret, react_users: Math.max(0, u - nu - ret),
        views: Math.round(u * (r.users ? r.views / r.users : 0) * vBoost),
      });
    });
    const k2 = Object.assign({}, k, {
      users: mine.users, users_prev: null,
      views: rows.reduce((a, b) => a + b.views, 0), views_prev: null,
      new_users: newTarget, new_users_prev: null,
      regular_users: REGULAR_FREQ[S.freqSel] ? mine.users : 0, regular_users_prev: null,
      sleeping_users: null,
      freq_share: share * 100,
    });
    return { ts: rows, k: k2, sliced: true };
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
  function obsMain(kIn) {
    const k = kIn || kpiRow(); const out = []; const sl = selection();
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

  function obsAudience(def, stats, wide) {
    const out = [];
    if (wide) {
      out.push({
        sev: 'mid',
        lead: 'Доступ открыт почти всей компании — проценты охвата скрыты',
        body: 'В целевой аудитории <b>' + U.nf(stats.audience) + '</b> человек — практически весь банк. ' +
          'Скрыты <b>только проценты</b>: карточка «Дошли», колонка «Охват» и её ИТОГО. ' +
          'Абсолютные числа, воронка, динамика, разрезы и поимённый список показываются как обычно — ' +
          'кто именно ходит, видно. <b>Соберите целевую аудиторию по структуре</b> ' +
          '(кнопка выше) — и проценты вернутся.',
        rule: 'целевая аудитория ≥30% численности компании',
      });
    }
    if (!wide && stats.reachPct < 40) {
      out.push({
        sev: 'high',
        lead: 'До области дошли ' + U.pct(stats.reachPct) + ' целевой аудитории',
        body: 'Из <b>' + U.nf(stats.audience) + '</b> человек заходили <b>' + U.nf(stats.came) +
          '</b>. Не заходил ни разу <b>' + U.nf(stats.never) + '</b> человек — это и есть список, кому стоит напомнить.',
        rule: 'охват целевой аудитории <40%',
      });
    }
    if (stats.came && stats.once / stats.came >= .45) {
      out.push({
        sev: 'mid',
        lead: 'Почти половина зашедших не вернулась',
        body: '<b>' + U.nf(stats.once) + '</b> из <b>' + U.nf(stats.came) + '</b> открыли область ровно один раз. ' +
          'Разовый визит после рассылки — это не закрепление.',
        rule: 'доля разовых визитов среди зашедших ≥45%',
      });
    }
    if (stats.regular && stats.came && stats.regular / stats.came >= .3) {
      out.push({
        sev: 'good',
        lead: 'Сформировалось ядро из ' + U.nf(stats.regular) + ' постоянных пользователей',
        body: '<b>' + U.nf(stats.regular) + '</b> человек заходят регулярно (8+ дней за период) — отчёт встроился в их работу.',
        rule: 'доля постоянных среди зашедших ≥30%',
      });
    }
    if (def.mode === 'custom' && stats.noAccess > 0 && stats.accessPct < 85) {
      out.push({
        sev: 'mid',
        lead: U.nf(stats.noAccess) + ' ' + U.plural(stats.noAccess, 'человек', 'человека', 'человек') +
          ' целевой аудитории не имеют доступа',
        body: 'Права есть у <b>' + U.nf(stats.access) + '</b> из <b>' + U.nf(stats.audience) +
          '</b> — это <b>' + U.pct(stats.accessPct, 0) + '</b>. Для остальных низкий охват означает не «не ходят», ' +
          'а <b>«не роздали»</b>: сначала доступ, потом рассылка. Ступень «есть доступ» на воронке — про них.',
        rule: 'доступ есть менее чем у 85% настроенной целевой аудитории',
      });
    } else if (def.mode === 'custom') {
      out.push({
        sev: 'none',
        lead: 'Целевая аудитория задана структурой, а не доступом',
        body: 'Знаменатель — накликанные условия, а не AD-группы. Доступ при этом есть почти у всех ' +
          '(<b>' + U.pct(stats.accessPct, 0) + '</b>), так что охват честно читается как «дошли / могли дойти».',
        rule: 'целевая аудитория собрана в конструкторе',
      });
    }
    const ord = { high: 0, mid: 1, good: 2, none: 3 };
    return out.sort((a, b) => ord[a.sev] - ord[b.sev]);
  }

  /* ============================== Фильтры UI ============================= */
  const SRV = '<span class="info" data-tip="' + U.esc(U.tipHtml({
    title: 'Пересчёт', text: 'Этот фильтр меняет SQL-запрос: комбинация атрибутов не помещается в предрасчёт. Остальные переключатели считаются в браузере мгновенно.',
  })) + '" aria-label="Требует пересчёта">⟳</span>';
  const SRV_TXT = SRV;         // тот же значок, но в подзаголовках панелей

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

    h += grp('opt', 'Опции', f.excludeOwners ? 1 : 0,
      swt('excludeOwners', 'Исключить владельцев из просмотров', f.excludeOwners,
        'Владелец открывает свой отчёт при каждой правке — его визиты завышают аудиторию.'));

    const nav = document.getElementById('sideNav');
    if (nav.innerHTML !== h) nav.innerHTML = h;   // не трогаем DOM без нужды

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

  /* ======================================================================
     ЗОНЫ И ГРАФИКИ

     Экран собран не одним куском разметки, а набором ЗОН. Зона — кусок
     страницы с собственным состоянием: каталог, панель динамики,
     закрепляемость, частота. Вкладка возвращает список зон, рендер
     сравнивает разметку каждой зоны с тем, что уже стоит в DOM, и
     переписывает ТОЛЬКО изменившиеся.

     Зачем: раньше любое действие перерисовывало экран целиком и все
     графики создавались заново — переключил разрез в каталоге, а барчарт
     динамики моргнул и проиграл анимацию, хотя его данные не менялись.
     Теперь неизменившаяся зона не трогается вовсе, и живущий в ней
     экземпляр ECharts продолжает жить.

     Чтобы это работало, id контейнеров графиков должны быть
     ДЕТЕРМИНИРОВАННЫМИ: id собирается из имени зоны и номера графика
     внутри неё. Случайный id менял бы разметку зоны на каждом рендере, и
     ни одна зона никогда не совпала бы сама с собой.
     ==================================================================== */
  let QUEUE = [];
  const INSTANCES = {};          // id контейнера → экземпляр ECharts
  let ZONE = 'z';                // зона, которая собирается прямо сейчас
  let ZN = 0;                    // номер графика внутри неё

  /* Короткая подпись строки — чтобы зона менялась вместе с данными */
  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  /* Контейнер графика несёт подпись своих ДАННЫХ. Без неё разметка зоны
     одинакова при любых данных (в ней только пустой div), и график не
     перерисовался бы, когда перерисоваться нужно: сменили область — а
     на экране остаются прежние столбики. Подпись замыкает круг: зона
     меняется ровно тогда, когда меняется то, что она показывает. */
  function chart(cls, optFn, sigData) {
    const id = 'ch-' + ZONE + '-' + (ZN++);
    QUEUE.push({ id, optFn });
    const sig = sigData == null ? '' : ' data-sig="' + hash(JSON.stringify(sigData)) + '"';
    return '<div class="chart ' + cls + '" id="' + id + '"' + sig + '></div>';
  }

  /* График, который рисуем сами, а не отдаём ECharts (воронка). Живёт в той
     же очереди и по тем же правилам зон: ширину узнаёт после вставки в DOM,
     перерисовывается при resize. Разница только в том, что вместо
     экземпляра библиотеки внутрь кладётся строка SVG. */
  function svgChart(cls, drawFn, sigData) {
    const id = 'ch-' + ZONE + '-' + (ZN++);
    QUEUE.push({ id, drawFn });
    const sig = sigData == null ? '' : ' data-sig="' + hash(JSON.stringify(sigData)) + '"';
    return '<div class="chart ' + cls + '" id="' + id + '"' + sig + '></div>';
  }

  /* Собрать разметку одной зоны */
  function zone(id, fn) {
    ZONE = id; ZN = 0;
    return { id, html: fn() };
  }
  /* Несколько зон в одном контейнере-сплите. Нужна, когда рядом стоят
     блоки с РАЗНОЙ судьбой: каталог перерисовывается от сортировки и
     поиска, панель динамики — нет, а лежат они в одной сетке.
     Обёртка зоны в сетке невидима (display:contents в app.css), поэтому
     панели остаются прямыми ячейками грида. */
  const group = (cls, zones) => ({ group: cls, zones });

  /* Разложить зоны по DOM, переписав только изменившиеся */
  function paint(items) {
    const view = document.getElementById('view');
    const flat = [];
    const skeleton = items.map((it) => {
      if (!it.group) { flat.push(it); return '<div class="zone" id="z-' + it.id + '"></div>'; }
      it.zones.forEach((z) => flat.push(z));
      return '<div class="' + it.group + '">' +
        it.zones.map((z) => '<div class="zone" id="z-' + z.id + '"></div>').join('') + '</div>';
    }).join('');
    const want = items.map((it) => (it.group ? it.group + '(' + it.zones.map((z) => z.id).join(',') + ')' : it.id)).join('|');

    if (view.dataset.zones !== want) {
      /* Набор зон сменился (другая вкладка) — пересобираем каркас целиком */
      view.innerHTML = skeleton;
      view.dataset.zones = want;
    }
    flat.forEach((z) => {
      const el = document.getElementById('z-' + z.id);
      if (!el) return;
      const sig = z.html.length + ':' + z.html;
      if (el.dataset.sig === sig) return;      // ничего не изменилось — не трогаем
      el.innerHTML = z.html;
      el.dataset.sig = sig;
    });
  }

  /* Снять экземпляры, чьи контейнеры уехали из DOM, и поднять новые */
  function mountCharts() {
    /* Узел, на котором поднят экземпляр, храним рядом с ним: если зону
       переписали, в DOM стоит уже ДРУГОЙ узел с тем же id, и старый
       экземпляр надо снять. Сравнение по ссылке на узел — единственный
       надёжный признак. */
    Object.keys(INSTANCES).forEach((id) => {
      const rec = INSTANCES[id];
      if (rec.el === document.getElementById(id)) return;   // жив и на месте
      try { rec.inst.dispose(); } catch (e) { /* уже снят */ }
      delete INSTANCES[id];
    });
    QUEUE.forEach((q) => {
      if (INSTANCES[q.id]) return;                          // зона не перерисовывалась
      const el = document.getElementById(q.id);
      if (!el) return;
      if (q.drawFn) {                                       // рисуем сами
        el.innerHTML = q.drawFn(el.clientWidth, el.clientHeight);
        INSTANCES[q.id] = { el, draw: q.drawFn };
        return;
      }
      const inst = echarts.init(el, null, { renderer: 'canvas' });
      inst.setOption(q.optFn(el.clientWidth, el.clientHeight));
      INSTANCES[q.id] = { inst, el };
    });
    QUEUE = [];
  }
  addEventListener('resize', () => Object.keys(INSTANCES).forEach((id) => {
    const rec = INSTANCES[id];
    try {
      if (rec.draw) rec.el.innerHTML = rec.draw(rec.el.clientWidth, rec.el.clientHeight);
      else rec.inst.resize();
    } catch (e) { /* снят */ }
  }));

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
    /* По отчёту ищем и в названии, и в коллекции, и во владельце: человек
       помнит «это был чей-то отчёт из рисков», а не точное имя. */
    const rows = reportRows()
      .filter((r) => matchQ(r.dashboard_nm) || matchQ(r.collection) || matchQ(r.owner_login));
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
        /* Подсказка строки — три числа и дата. Всё остальное про отчёт
           читается на самом экране, когда строка выбрана; раньше здесь
           стояло шесть строк, и подсказка накрывала полкаталога. */
        U.tip({
          title: r.dashboard_nm,
          rows: [
            { label: 'Пользователи', value: U.nf(r.users), color: CH.C.ret },
            { label: 'Просмотры', value: U.nf(r.views), dash: true, color: CH.C.bench },
            { label: 'На пользователя', value: U.nf(r.views_per_user, 1) },
          ],
          note: 'создан ' + U.fmtDate(r.created_dt),
        }) + '>' +
        /* Строка каталога — две строки текста максимум. Признаки «сертифицирован»
           и «новый» стали значками: словами они разгоняли строку до трёх
           строк, а в узкой колонке это стоило половины видимого списка. */
        '<td class="txt">' + U.esc(r.dashboard_nm) +
          '<span class="unit-sub">' +
            (r.certified_by ? '<i class="rflag cert"' + U.tip({ title: 'Сертифицирован', text: r.certified_by }) + '>✓</i>' : '') +
            (r.is_new ? '<i class="rflag new"' + U.tip({ text: 'Создан меньше 90 дней назад' }) + '>новый</i>' : '') +
            U.esc(r.owner_login) + ' · ' + U.esc(r.collection) + '</span></td>' +
        '<td class="lead">' + U.nf(r.users) + '</td>' +
        '<td>' + U.compact(r.views) + '</td>' +
        '<td>' + U.pct(r.users ? r.regular_users / r.users * 100 : 0, 0) + '</td>' +
        '<td>' + (r.last_view_days === 0 ? '<span class="mut">сегодня</span>' : U.days(r.last_view_days)) + '</td>' +
        '</tr>').join('') +
      '</tbody></table>';
  }

  /* Строка каталога проходит поиск. Ищут не только отчёты: «найти своё
     подразделение» — такой же частый запрос, как «найти свой отчёт». */
  const matchQ = (txt) => !S.repQuery || String(txt).toLowerCase().indexOf(S.repQuery.toLowerCase()) >= 0;

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
      .filter((r) => matchQ(r.label))
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
    if (!rows.length) return emptyRows();
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

  const emptyRows = () => '<div class="empty" style="box-shadow:none"><b>Ничего не найдено</b>' +
    'Очистите поиск или снимите часть фильтров слева.</div>';

  /* Таблица срезов по людям */
  function cutTable() {
    const ck = S.mode;
    const rows = OV.filter((r) => r.section === 'kpi' && r.grain === S.grain && r.cut_key === ck)
      .map((r) => ({
        key: r.cut_val, label: r.cut_val,
        users: r.users, views: r.views, new_users: r.new_users, regular: r.regular_users,
      }))
      .filter((r) => matchQ(r.label))
      .sort((a, b) => b.users - a.users);
    const tot = rows.reduce((a, b) => a + b.users, 0);
    if (!rows.length) return emptyRows();
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

  /* Что смотрит выбранный срез людей. Считается тем же множеством
     зашедших, что и вкладка аудитории, поэтому числа сходятся. */
  function cutReportsPanel(cutKey, cutVal) {
    const people = D.population.filter((p) => p[cutKey] === cutVal);
    const ids = reportRows().map((r) => r.dashboard_id);
    const list = D.reportsForPeople(people, S.grain, ids).slice(0, 12);
    const head = Math.round(people.length * D.POP_W);
    if (!list.length) {
      return U.panel({
        title: 'Что смотрит «' + cutVal + '»', sub: 'ни одного отчёта за период',
        body: '<div class="tbl-note">Никто из этого среза не открывал отчёты выборки за период.</div>',
      });
    }
    return U.panel({
      title: 'Что смотрит «' + cutVal + '»',
      subHtml: 'в срезе <b>' + U.nf(head) + '</b> ' + U.plural(head, 'сотрудник', 'сотрудника', 'сотрудников') +
        ' · клик по строке откроет аудиторию отчёта',
      bodyCls: 'tbl-wrap',
      body: U.barTable({
        firstH: 'Отчёт', firstW: '34%', colW: '13%', barH: '',
        dense: true, clickAttr: 'goaud',
        cols: [
          { label: 'Смотрят', hint: { text: 'Люди этого среза, открывавшие отчёт за период' } },
          { label: 'Есть доступ' },
          { label: 'Доля', hint: { text: 'Доля дошедших среди тех в срезе, у кого есть доступ к отчёту' } },
          { label: 'Всего у отчёта', hint: { text: 'Пользователи отчёта целиком, по всей компании' } },
        ],
        rows: list.map((r) => ({
          key: r.dashboard_id, label: r.dashboard_nm, sub: r.owner_login + ' · ' + r.collection,
          cells: [U.nf(r.users), U.nf(r.access), U.pct(r.share, 0), U.nf(r.total_users)],
          bar: r.users,
          tip: {
            title: r.dashboard_nm,
            rows: [{ label: 'Смотрят из среза', value: U.nf(r.users), color: CH.C.act },
              { label: 'Есть доступ в срезе', value: U.nf(r.access), dash: true, color: CH.C.bench },
              { label: 'Пользователей всего', value: U.nf(r.total_users) }],
            note: 'Клик откроет аудиторию этого отчёта',
          },
        })),
        note: 'Показаны 12 самых популярных у этого среза. «Доля» считается внутри среза: сколько из тех, ' +
          'у кого есть доступ, реально открывали отчёт.',
      }),
    });
  }

  /* Расшифровка корзин частоты: «1 день» — это один день ИЗ ПЕРИОДА, а не
     один день подряд. Без этой строки таблица читается как угодно. */
  function freqExplain() {
    const n = D.GRAINS[S.grain].n;
    const unit = { d: 'дней', w: 'недель', m: 'месяцев', q: 'кварталов' }[S.grain];
    return 'Сколько РАЗНЫХ дней человек заходил за период (последние ' + n + ' ' + unit + '). ' +
      '«1 день» — заходил ровно один раз за весь период, «16+ дней» — заходил в 16 и более разных дней.';
  }

  function renderReports() {
    const sl = selection();
    const rows = reportRows();
    const fr = freqRows();
    const frTot = fr.reduce((a, b) => a + b.users, 0);
    const ts0 = series();
    const kBase = kpiRow();
    const slice = freqSlice(ts0, kBase);
    const ts = slice.ts;
    const k = slice.k;
    const fSel = slice.sliced;      // корзина частоты действительно применена
    const dPct = (a, b) => (b ? (a / b - 1) * 100 : null);
    const vs = U.prevPeriodLabel(S.grain);
    const hasPrev = HAS_PREV[S.grain];
    /* Одно место, где решается, показывать ли сравнение: корзина частоты
       его снимает (состава корзин за прошлый период нет), а на длинных
       грануляциях его нет в самой витрине. */
    const dlt = (v, o) => (fSel || !hasPrev
      ? U.delta(null, { why: fSel ? 'Состава корзин частоты за прошлый период в витрине нет.' : NO_PREV_WHY })
      : U.delta(v, o));
    const shReg = k && k.users ? k.regular_users / k.users * 100 : 0;
    const shRegPrev = k && k.users_prev ? k.regular_users_prev / k.users_prev * 100 : 0;
    const isRep = sl.kind === 'rep';

    /* «Последний просмотр» убран: витрина обновляется за вчера, и у любого
       живого отчёта там стояло «1 дн» — карточка, которая всегда показывает
       одно и то же, места не стоит. Тишина осталась колонкой каталога, где
       разброс есть и по ней сортируют.

       На её месте — MAU: месячная аудитория, которая НЕ зависит от
       выбранного периода. Всё остальное на экране меняется вместе с
       периодом, и не за что зацепиться, когда период переключают. */
    const mau = mauRow();
    const fifth = U.kpi({
      label: 'MAU', value: mau ? U.nf(mau.users) : '—',
      hint: {
        title: 'Месячная аудитория',
        text: 'Уникальные пользователи за последний закрытый месяц.',
        note: 'Не зависит от периода на экране: её можно сравнивать между любыми состояниями отчёта.',
      },
      delta: mau ? U.delta(dPct(mau.users, mau.users_prev), { vs: 'к пред. месяцу' }) : '',
      sub: 'предыдущий месяц: <b>' + (mau ? U.nf(mau.users_prev) : '—') + '</b>',
    });

    const table = S.mode === 'report' ? reportTable()
      : (MODE(S.mode).axis === 'grp' ? groupTable() : cutTable());

    const cohorts = cohortRows();
    const retTitle = isRep ? 'Закрепляемость отчёта' : 'Закрепляемость Proteus';
    const retSub = isRep
      ? 'когорта — месяц, в который человек открыл этот отчёт впервые'
      : 'когорта — месяц первого визита в Proteus; фильтр периода на этот блок не действует';

    /* Экран собран зонами: переключение разреза не трогает панель динамики,
       настройка шкалы когорт не трогает ничего, кроме себя. См. paint(). */
    return [
      zone('head', () => head('Отчёты и динамика просмотров',
        'Основной экран: слева — по чему смотрим, справа — что с этим происходит. ' +
        'Без выбора показан весь Proteus; выберите отчёт, коллекцию, себя как владельца или подразделение — ' +
        'карточки, динамика, частота и закрепляемость пересчитаются под выбор. ' +
        'Период — <b>' + U.periodLabel(S.grain) + '</b>.')),

      zone('kpi', () => U.kpis([
        U.kpi({
          label: 'Пользователей за период', value: U.nf(k.users),
          tag: fSel ? S.freqSel : '',
          hint: { title: 'Пользователи', text: 'Уникальные логины за период.', note: 'Сумма по дням больше: один человек заходит в разные дни.' },
          delta: dlt(dPct(k.users, k.users_prev), {
            vs, tip: { title: 'Сравнение', rows: [{ label: 'Период', value: U.nf(k.users) }, { label: 'Предыдущий', value: U.nf(k.users_prev), dash: true, color: CH.C.bench }] },
          }),
          sub: fSel
            ? 'это <b>' + U.pct(k.freq_share) + '</b> всей аудитории'
            : (hasPrev
              ? 'предыдущий: <b>' + U.nf(k.users_prev) + '</b>'
              : 'период: <b>' + U.periodLabel(S.grain) + '</b>'),
        }),
        U.kpi({
          label: 'Просмотров', value: U.compact(k.views),
          hint: { title: 'Просмотры', text: 'Сумма открытий (action_count).' },
          delta: dlt(dPct(k.views, k.views_prev), { vs }),
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
          delta: dlt(dPct(k.new_users, k.new_users_prev), { vs }),
          sub: 'доля аудитории: <b>' + U.pct(k.users ? k.new_users / k.users * 100 : 0) + '</b>',
        }),
        fSel
          ? U.kpi({
            /* «Доля постоянных» внутри корзины — тавтология: в «16+ дней» она
               всегда 100%, в «1 день» всегда 0. Показываем то, ради чего
               корзину и открыли: сколько просмотров даёт один такой человек. */
            label: 'Просмотров на человека',
            value: U.nf(k.users ? k.views / k.users : 0, 1),
            hint: { title: 'Интенсивность', text: 'Просмотры этой корзины, делённые на число людей в ней.', note: 'По всей аудитории — ' + U.nf(kBase.users ? kBase.views / kBase.users : 0, 1) + '.' },
            delta: '',
            sub: 'по всем: <b>' + U.nf(kBase.users ? kBase.views / kBase.users : 0, 1) + '</b>',
          })
          : U.kpi({
            label: 'Постоянных', value: U.pct(shReg),
            hint: { title: 'Постоянные', text: 'Заходили 8 и более разных дней за период.', note: 'Порог выбран как «примерно раз в неделю и чаще».' },
            delta: dlt(shReg - shRegPrev, { vs, unit: ' п.п.', dead: .3 }),
            sub: '<b>' + U.nf(k.regular_users) + '</b> ' + U.plural(k.regular_users, 'человек', 'человека', 'человек'),
          }),
        fifth,
      ], 5)),

      zone('obs', () => U.observations(obsMain(kBase), 'main')),

      /* Ядро экрана. Левую колонку целиком занимает каталог: в него должно
         помещаться как можно больше строк — отчётов, коллекций,
         подразделений. Частота визитов делить эту высоту не может, она
         уехала вниз, к закрепляемости. */
      group('split main', [
        zone('catalog', () => U.panel({
          cls: 'split-l', title: 'Каталог', sub: 'клик по строке задаёт контекст вкладки',
          right: U.searchBox('repQ', S.mode === 'report' ? 'Отчёт, коллекция, владелец'
            : 'Найти: ' + MODE(S.mode).one.toLowerCase(), S.repQuery),
          under: cutBar(), bodyCls: 'tbl-wrap', body: table,
        })),
        zone('dyn', () => U.panel({
          cls: 'split-r', title: sl.title,
          sub: sl.sub + (fSel ? ' · только «' + S.freqSel + '»' : ''),
          right: isRep ? '<button class="btn" data-goaud="' + sl.report.dashboard_id + '">Аудитория отчёта →</button>' : '',
          tabKey: 'viewsMode',
          tabs: [{ key: 'total', label: 'Просмотры', on: S.viewsMode !== 'per' },
            { key: 'per', label: 'На пользователя', on: S.viewsMode === 'per' }],
          body: chart('fill', (w) => CH.dynamics(ts, S.grain, {
            width: w,
            viewsMode: S.viewsMode,
            title: fSel ? 'Пользователи по периодам · ' + S.freqSel : 'Пользователи по периодам',
            newLabel: (sl.kind === 'rep' || sl.kind === 'grp') ? 'Новые в отчёте' : 'Новые',
          }), [ts, S.grain, S.freqSel, sl.kind, sl.title, S.viewsMode]) +
            /* Постоянная расшифровка, а не только в подсказке: «вернувшиеся»
               ни из легенды, ни из цвета не выводятся. */
            '<div class="tbl-note seg-legend">Столбик — все пользователи периода, разложенные по тому, ' +
            'были ли они в <b>предыдущем</b> периоде. Снизу вверх: <b>' +
            ((sl.kind === 'rep' || sl.kind === 'grp') ? 'новые' : 'новые') + '</b> — ' +
            ((sl.kind === 'rep' || sl.kind === 'grp') ? 'открыли этот отчёт впервые' : 'первый визит в Proteus') +
            '; <b>вернувшиеся</b> — заходили когда-то раньше, но в предыдущем ' +
            D.GRAINS[S.grain].unit + ' их не было; <b>продолжающие</b> — были и в предыдущем.</div>' +
            (fSel
              ? '<div class="tbl-note">На графике только те, кто заходил <b>' + U.esc(S.freqSel) +
                '</b> за период: человеко-дни корзины разложены по бакетам в пропорции общей динамики ' + SRV_TXT +
                '. Сравнение с предыдущим периодом снято — состава корзин за прошлый период в витрине нет.</div>'
              : (sl.kind === 'grp'
                ? '<div class="tbl-note">Пользователи группы — уникальные по группе: один человек, открывший два отчёта, ' +
                  'в столбце учтён один раз. Просмотры складываются точно.</div>'
                : '')),
        })),
      ]),

      /* Закрепляемость и частота. Частота стоит здесь, а не у каталога:
         она тоже селектор, но выбирает НЕ строку, а людей, и место ей
         рядом с блоком про то же самое — как люди возвращаются. */
      /* Обратный ход: выбрали подразделение или специализацию — показываем,
         ЧТО эти люди смотрят. Приходят не только от отчёта: руководитель
         приходит от своего блока и хочет увидеть, чем блок пользуется.
         Зона существует всегда (пустая ничего не занимает), чтобы её
         появление не пересобирало соседние графики. */
      zone('cutreps', () => (sl.kind !== 'cut' || !S.sel ? '' : cutReportsPanel(S.sel.mode, S.sel.val))),

      group('split ret', [
        zone('ret', () => U.panel({
          cls: 'split-l', title: retTitle, sub: retSub,
          tabKey: 'retView',
          tabs: [{ key: 'cohort', label: 'Когорты', on: S.retView === 'cohort' },
            { key: 'curve', label: 'Кривая', on: S.retView === 'curve' }],
          body: S.retView === 'cohort'
            ? U.cohortTable({
              rows: cohorts, maxAge: 11, uid: 'ret', base: S.ctBase,
              firstTip: isRep ? 'Месяц, в который человек открыл этот отчёт впервые'
                : 'Месяц первого визита в Proteus',
              sizeNote: isRep ? 'Столько человек открыли этот отчёт впервые в этом месяце'
                : 'Столько человек впервые зашли в Proteus в этом месяце',
              note: 'В ячейке — доля когорты, вернувшаяся через N месяцев. Чем меряет цвет — ' +
                'переключается в легенде над таблицей; наведите ступень шкалы, чтобы на таблице ' +
                'остались только её ячейки. Серый курсив — месяц ещё не закрыт: значение дорастёт и в ' +
                'раскраске не участвует. Столбца «старт» нет: в нём всегда 100%.',
            })
            : chart('h-tall', (w) => CH.retentionCurve(retentionPoints(cohorts), {
              width: w,
              title: isRep ? 'Средняя кривая удержания отчёта' : 'Средняя кривая удержания по всем когортам',
            }), [retentionPoints(cohorts), isRep]),
        })),
        zone('freq', () => U.panel({
          cls: 'split-r', title: 'Как часто заходят',
          subHtml: S.freqSel
            ? 'фильтр: <b>' + U.esc(S.freqSel) + '</b> — клик по строке снимет'
            : 'клик по строке фильтрует динамику вверху ' + SRV_TXT,
          body: '<div class="note-inline tight">' + freqExplain() + '</div>' +
            U.barTable({
              firstH: 'Активных дней', firstW: '34%', colW: '19%', barH: '',
              dense: true, clickAttr: 'freq', selected: S.freqSel,
              cols: [{ label: 'Человек' }, { label: 'Доля' }],
              total: { cells: [U.nf(frTot), '100%'] },
              rows: fr.map((r) => ({
                key: r.bucket, label: r.bucket,
                cells: [U.nf(r.users), U.pct(frTot ? r.users / frTot * 100 : 0, 0)],
                bar: r.users,
                tip: {
                  title: r.bucket + ' из ' + D.GRAINS[S.grain].n,
                  rows: [{ label: 'Человек', value: U.nf(r.users), color: CH.C.act },
                    { label: 'Доля аудитории', value: U.pct(frTot ? r.users / frTot * 100 : 0) }],
                  note: S.freqSel === r.bucket ? 'Клик снимет фильтр' : 'Клик оставит на графике динамики только этих людей',
                },
              })),
              note: 'Строки складываются в ИТОГО: у человека ровно одно число активных дней за период.',
            }),
        })),
      ]),
    ];
  }

  /* ======================================================================
     ВКЛАДКА 2 — «Аудитория»

     Два независимых вопроса, которые раньше были склеены в один:

       ОБЛАСТЬ — чью аудиторию смотрим. Это не обязательно один отчёт:
       владельцу нужна и группа своих отчётов, и коллекция целиком.

       ЦЕЛЕВАЯ АУДИТОРИЯ — с чем сравниваем охват. По умолчанию берём то,
       как роздан доступ (AD-группы или поимённый список), но это лишь
       умолчание, а не закон: доступ часто раздан широкой группой, которая
       не описывает, для кого отчёт делали. Поэтому целевую аудиторию можно
       собрать руками по управленческой структуре, специализации, стриму и
       стажу — и настройка доступна ВСЕГДА, а не только когда группа широкая.
       В этом и был смысл исходного отчёта: накликать структуру, взять
       оттуда всех людей и посмотреть, сколько из них дошло.
     ==================================================================== */

  const DIM_ORDER = ['lvl3', 'lvl4', 'stream', 'spec', 'adgroup', 'exp', 'it', 'hq'];
  const SEGMENTS = [
    { key: 'Постоянный',    plural: 'Постоянные',    color: CH.C.seg3, note: '8+ активных дней' },
    { key: 'Эпизодический', plural: 'Эпизодические', color: CH.C.seg2, note: '2–7 активных дней' },
    { key: 'Разовый',       plural: 'Разовые',       color: CH.C.seg1, note: 'ровно один день' },
    { key: 'Не заходил',    plural: 'Не заходили',   color: CH.C.seg0, note: 'доступ есть, визитов нет' },
    /* Появляется только у настроенной ЦА: когда аудиторию задаёт структура,
       часть людей может вообще не иметь прав на отчёт. */
    { key: 'Нет доступа',   plural: 'Нет доступа',   color: '#eceef1', note: 'под условия попал, но прав на отчёт нет', accessOnly: true },
  ];

  /* --- Область: какие отчёты попали под выбор ---------------------------- */
  function scopeIds() {
    const sc = S.audScope;
    const all = reportRows();
    if (sc.kind === 'collection') {
      return all.filter((r) => r.collection === sc.collection).map((r) => r.dashboard_id);
    }
    if (sc.kind === 'many') {
      const set = {}; sc.ids.forEach((id) => { set[id] = 1; });
      const ids = all.filter((r) => set[r.dashboard_id]).map((r) => r.dashboard_id);
      return ids.length ? ids : (all[0] ? [all[0].dashboard_id] : []);
    }
    /* По умолчанию открываем не просто «свежий», а свежий с нормальной
       AD-группой: на отчёте с поимённым списком или с группой «весь банк»
       экран показывает краевой случай и читается как сломанный. */
    const normal = (r) => {
      const m = D.audienceMeta[r.dashboard_id];
      return m && !m.is_wide && m.audience_type === 'ad';
    };
    const one = all.find((r) => r.dashboard_id === S.selectedReport)
      || all.filter(normal).find((r) => r.is_new) || all.find(normal) || all[0];
    if (one) S.selectedReport = one.dashboard_id;
    return one ? [one.dashboard_id] : [];
  }
  function scopeTitle(ids) {
    const sc = S.audScope;
    if (sc.kind === 'collection') return 'Коллекция «' + sc.collection + '»';
    if (sc.kind === 'many') return U.nf(ids.length) + ' ' + U.plural(ids.length, 'отчёт', 'отчёта', 'отчётов');
    const r = reportById(ids[0]);
    return r ? r.dashboard_nm : 'Отчёт';
  }

  /* --- Целевая аудитория: как роздан доступ или как собрано руками ------- */
  function audienceDef(ids) {
    const metas = ids.map((id) => D.audienceMeta[id]).filter(Boolean);
    if (S.audDef.mode === 'custom') {
      const people = D.customAudience(S.audDef.filters);
      return { mode: 'custom', people, metas };
    }
    return { mode: 'access', people: D.accessAudience(ids), metas };
  }

  /* Какая структура стоит за нынешним доступом: самый крупный блок среди
     тех, кому права уже розданы. Нужен, чтобы конструктор открывался с
     осмысленного предложения, а не пустым. */
  function suggestAudience(ids) {
    const acc = D.accessAudience(ids);
    if (!acc.length) return null;
    const by = {};
    acc.forEach((p) => { by[p.lvl3] = (by[p.lvl3] || 0) + 1; });
    const top = Object.keys(by).sort((a, b) => by[b] - by[a])[0];
    if (!top || by[top] / acc.length < .25) return null;
    return { lvl3: [top] };
  }

  /* Сколько всего условий накликано в конструкторе */
  function audDefCount() {
    return DIM_ORDER.reduce((a, k) => a + ((S.audDef.filters[k] || []).length), 0);
  }

  function renderAudience() {
    const ids = scopeIds();
    if (!ids.length) {
      return [zone('head', () => head('Аудитория', '')),
        zone('empty', () => '<div class="empty"><b>Нет отчётов по текущим фильтрам</b>Снимите часть фильтров слева.</div>')];
    }
    const def = audienceDef(ids);
    /* Разрез из правой панели — настоящий кросс-фильтр: он СУЖАЕТ целевую
       аудиторию, поэтому пересчитывает и карточки, и воронку, и динамику.
       Сегмент устроен иначе (см. ниже) и на них не влияет. */
    const unit = S.audUnit;
    const basePeople = def.people;
    const people = unit ? basePeople.filter((p) => p[unit.key] === unit.val) : basePeople;

    const rowsAll = D.audienceRows(ids, basePeople, S.grain);
    const rows = unit ? rowsAll.filter((r) => r[unit.key] === unit.val) : rowsAll;
    const W = D.POP_W;
    const vis = D.visitorsOf(ids, S.grain);
    /* Зашедшие пересчитываются масштабом ds_reports, а не общим весом
       выборки: «Дошли» обязаны сойтись с «Пользователями за период» на
       вкладке «Отчёты» — это одни и те же люди. */
    const cnt = (f) => Math.round(rows.filter(f).length * W);
    const cntV = (f) => Math.round(rows.filter(f).length * vis.scale);

    const st = {
      audience: Math.round(rows.length * W),
      access: cnt((r) => r.has_access),
      noAccess: cnt((r) => !r.has_access),
      came: cntV((r) => r.came),
      once: cntV((r) => r.segment === 'Разовый'),
      episodic: cntV((r) => r.segment === 'Эпизодический'),
      regular: cntV((r) => r.segment === 'Постоянный'),
    };
    /* Всего заходило в область — цифра с первой вкладки. Разница с «дошли»
       и есть те, кто ходит, но в целевую аудиторию не попал. */
    st.scopeUsers = unit ? null : D.scopeVisitors(ids, S.grain);
    st.outside = st.scopeUsers == null ? null : Math.max(0, st.scopeUsers - st.came);
    st.never = Math.max(0, st.audience - st.came);
    st.reachPct = st.audience ? st.came / st.audience * 100 : 0;
    st.accessPct = st.audience ? st.access / st.audience * 100 : 0;
    st.returned = st.came - st.once;
    /* «Широкая» — не свойство группы, а свойство знаменателя: если в целевой
       аудитории почти весь банк, доля покрытия ничего не измеряет. Правило
       одно и то же и для одного отчёта, и для коллекции. */
    const wide = def.mode === 'access' && st.audience >= D.HC_TOTAL * .3;

    const dyn = D.audienceDynamics(rows, S.grain, rows.length, vis.scale);
    const scTitle = scopeTitle(ids);

    /* Плашка источника описывает ЦЕЛЕВУЮ АУДИТОРИЮ ЦЕЛИКОМ, а не срез: иначе
       чип показывал число после кросс-фильтра, а текст рядом — до него. */
    const audTotal = Math.round(basePeople.length * W);

    const zHead = zone('head', () => head('Аудитория: ' + scTitle,
      'Кому область была роздана, кто из них дошёл, кто закрепился и кто не заходил ни разу. ' +
      'Слева выбирается <b>область</b> — отчёт, набор отчётов или коллекция; справа — <b>целевая аудитория</b>, ' +
      'с которой сравниваем охват. Период — <b>' + U.periodLabel(S.grain) + '</b>.'));
    const zScope = zone('scope', () => scopeBar(ids, def, audTotal, st, wide));

    const zKpi = zone('kpi', () => U.kpis([
      U.kpi({
        label: 'Целевая аудитория', value: U.nf(st.audience),
        tag: def.mode === 'custom' ? 'настроена' : '',
        hint: {
          title: 'Откуда число',
          text: def.mode === 'custom'
            ? 'Сотрудники, попавшие под накликанные условия в конструкторе.'
            : 'Сотрудники, которым роздан доступ: состав AD-групп плюс поимённые права.',
        },
        delta: '', sub: wide ? '<b>почти весь банк</b>' : 'человек в знаменателе',
      }),
      U.kpi({
        label: 'Дошли', value: U.nf(st.came),
        hint: { title: 'Дошли', text: 'Открывали хотя бы один отчёт области за период.' },
        delta: wide ? '' : U.delta(st.reachPct - 100, {
          neutral: true, vs: 'до полного охвата', unit: ' п.п.', dec: 0,
          tip: { title: 'Охват', rows: [{ label: 'Дошли', value: U.nf(st.came), color: CH.C.act }, { label: 'Целевая аудитория', value: U.nf(st.audience), dash: true, color: CH.C.bench }] },
        }),
        sub: wide ? 'доля по такому знаменателю не считается' : 'охват <b>' + U.pct(st.reachPct) + '</b>',
      }),
      U.kpi({
        label: 'Закрепились', value: U.nf(st.regular),
        hint: { title: 'Постоянные', text: 'Заходили 8 и более разных дней за период.' },
        delta: '', sub: 'от дошедших <b>' + U.pct(st.came ? st.regular / st.came * 100 : 0, 0) + '</b>',
      }),
      U.kpi({
        label: 'Зашли один раз', value: U.nf(st.once),
        hint: { title: 'Разовые', text: 'Ровно один активный день за период — типичная реакция на рассылку.' },
        delta: '', sub: 'от дошедших <b>' + U.pct(st.came ? st.once / st.came * 100 : 0, 0) + '</b>',
      }),
      /* Появляется только когда есть о чём говорить: при ЦА «как роздан
         доступ» войти без прав нельзя, и посторонних там нет по построению.
         Они берутся, когда ЦА задали структурой: часть тех, кто ходит,
         под накликанные условия не попала — и мы их теряем из виду. */
      st.outside
        ? U.kpi({
          label: 'Заходили вне ЦА', value: U.nf(st.outside),
          hint: {
            title: 'Не попали в целевую аудиторию',
            text: 'Всего в область заходило ' + U.nf(st.scopeUsers) + ' человек — это то же число, что на вкладке «Отчёты». Из них ' + U.nf(st.came) + ' попадают в заданную целевую аудиторию.',
            note: 'Доступ у них есть, но под условия ЦА они не подошли.',
          },
          delta: '',
          sub: 'всего заходило: <b>' + U.nf(st.scopeUsers) + '</b>',
        })
        : U.kpi({
        label: 'Ни разу не заходили', value: U.nf(st.never),
        hint: {
          title: 'Кому напомнить',
          text: 'Люди целевой аудитории без единого визита за период. Список — в таблице ниже, сегменты «Не заходили» и «Нет доступа».',
          note: st.noAccess ? 'Из них ' + U.nf(st.noAccess) + ' вообще не имеют прав на область — им нужен доступ, а не напоминание.' : null,
        },
        delta: '',
        sub: wide ? 'по такому знаменателю не показательно'
          : (st.noAccess
            ? 'из них <b>' + U.nf(st.noAccess) + '</b> без доступа'
            : '<b>' + U.pct(st.audience ? st.never / st.audience * 100 : 0, 0) + '</b> аудитории'),
      }),
    ], 5));

    const zObs = zone('obs', () => U.observations(obsAudience(def, st, wide), 'aud'));

    /* ---- Воронка + её расшифровка по времени ---------------------------- */
    const one = ids.length === 1 ? reportById(ids[0]) : null;
    const bs = D.buckets(S.grain);
    /* Плашку «создан» рисуем, только если дата попала ВНУТРЬ периода. Если
       отчёт создан раньше — засечка вставала на нулевой бакет, подпись
       упиралась в край и обрезалась; такое лучше сказать словами в
       подзаголовке, чем нарисовать плохо. */
    const createdIdx = (one && one.created_dt > bs[0] && one.created_dt <= bs[bs.length - 1])
      ? bs.findIndex((b) => b >= one.created_dt) : -1;
    const createdBefore = !!one && one.created_dt <= bs[0];

    /* Ступени воронки. «Есть доступ» появляется только у настроенной ЦА:
       когда целевая аудитория и есть доступ — это одно множество, и
       рисовать стопроцентную ступень незачем. */
    const funnelSteps = [
      { name: 'Целевая аудитория', value: st.audience, note: def.mode === 'custom' ? 'Собрана в конструкторе' : 'Как роздан доступ' },
      def.mode === 'custom'
        ? { name: 'Есть доступ к области', value: st.access, note: 'права выданы AD-группой или поимённо' }
        : null,
      { name: 'Открыли хотя бы раз', value: st.came },
      { name: 'Вернулись ещё раз', value: st.returned, note: 'заходили больше одного дня' },
      { name: 'Заходят регулярно', value: st.regular, note: '8+ активных дней за период' },
    ].filter(Boolean);

    const gFlow = group('split wide-r', [
      zone('funnel', () => U.panel({
        cls: 'split-l', title: 'Путь целевой аудитории',
        sub: 'от выданного доступа до регулярного использования',
        bodyCls: 'flexcol',
        /* Без fill: высоту воронка задаёт себе сама, от числа этапов */
        body: svgChart('fn-box', (w) => U.funnelSvg(funnelSteps, w, 0, { label: 'Путь целевой аудитории' }),
          [st.audience, st.access, st.came, st.returned, st.regular, def.mode]) +
          '<div class="tbl-note">Каждый следующий этап — подмножество предыдущего. ' +
          (def.mode === 'custom'
            ? 'Ступень <b>«есть доступ»</b> отделяет «не роздали права» от «роздали, но не ходят»: ' +
              'без неё низкий охват настроенной аудитории не читается. '
            : '') +
          '<b>Когда</b> этапы набирались и менялась ли доля — справа: воронка отвечает, чем всё кончилось, ' +
          'динамика — как к этому шли.</div>',
      })),
      zone('ats', () => U.panel({
        cls: 'split-r', title: 'Что происходило по периодам',
        subHtml: one && createdIdx >= 0
          ? 'отчёт создан <b>' + U.fmtDate(one.created_dt) + '</b> — отмечено плашкой на графике'
          : (one && createdBefore
            ? 'отчёт создан <b>' + U.fmtDate(one.created_dt) + '</b>, раньше начала периода'
            : 'приход, просмотры и охват целевой аудитории'),
        body: chart('h-xtall', (w) => CH.audienceTimeline(dyn, S.grain, {
          width: w,
          audience: st.audience,
          createdIdx,
          createdLabel: one ? 'создан ' + U.fmtDate(one.created_dt) : '',
          title: 'Заходили из целевой аудитории',
        }), [dyn, S.grain, st.audience, createdIdx]),
      })),
    ]);

    /* ---- Люди и разрезы -------------------------------------------------
       Сегменты переехали к поимённому списку: это разбивка ровно той же
       целевой аудитории по поведению, и читать её осмысленно рядом с теми,
       из кого она состоит, а не отдельным барчартом в другой панели.
       Разрез структуры переехал в шапку своей панели: фильтр, который
       управляет одним блоком, не должен жить в общем меню слева. */
    const segRows = SEGMENTS
      .filter((sg) => !sg.accessOnly || st.noAccess > 0)
      .map((sg) => ({ seg: sg, value: cnt((r) => r.segment === sg.key) }));
    const plist = rows
      .filter((p) => !S.audSeg || p.segment === S.audSeg)
      .filter((p) => !S.audQuery || (p.fio + ' ' + p.login).toLowerCase().indexOf(S.audQuery.toLowerCase()) >= 0)
      .sort((a, b) => b.active_days - a.active_days)
      .slice(0, 40);

    /* Если разрез зафиксирован условиями ЦА (например, выбран ровно один
       блок), разбивка по нему выродится в одну строку — молча переключаемся
       на первый разрез, который ещё что-то различает. */
    let cut = S.audCut;
    if (def.mode === 'custom' && (S.audDef.filters[cut] || []).length === 1) {
      cut = DIM_ORDER.find((k) => (S.audDef.filters[k] || []).length !== 1) || cut;
    }
    const byUnit = {};
    rowsAll.forEach((p) => {
      const key = p[cut] != null ? p[cut] : p.lvl3;
      const u = (byUnit[key] = byUnit[key] || { key, aud: 0, came: 0, reg: 0 });
      u.aud++; if (p.came) u.came++; if (p.segment === 'Постоянный') u.reg++;
    });
    const unitRows = Object.values(byUnit).map((u) => ({
      key: u.key, label: u.key,
      aud: Math.round(u.aud * W), came: Math.round(u.came * W), reg: Math.round(u.reg * W),
      cov: u.aud ? u.came / u.aud * 100 : 0,
    })).sort((a, b) => b.aud - a.aud);

    const gPeople = group('split aud', [
      zone('list', () => U.panel({
        cls: 'split-l', title: 'Кто из целевой аудитории',
        subHtml: 'полоса сегментов — та же аудитория по поведению; клик по сегменту сужает список',
        right: U.searchBox('audQ', 'Имя или логин', S.audQuery),
        body: segStrip(segRows, st.audience) +
          '<div class="tbl-scroll">' +
          '<table class="ptable dense"><thead><tr>' +
            '<th class="txt">Сотрудник</th><th class="txt">Подразделение</th>' +
            '<th>Дней</th><th>Визит</th><th class="txt">Сегмент</th>' +
          '</tr></thead><tbody>' +
          (plist.length ? plist.map((p) => '<tr' + U.tip({
            title: p.fio,
            rows: [
              { label: 'Активных дней', value: U.nf(p.active_days), color: CH.C.act },
              { label: 'Просмотров', value: p.views ? U.nf(p.views) : '—' },
            ],
          }) + '>' +
            '<td class="txt">' + U.esc(p.fio) + '<span class="unit-sub">' + U.esc(p.login) + (p.is_head ? ' · руководитель' : '') + '</span></td>' +
            '<td class="txt sec">' + U.esc(p.lvl3) + '<span class="unit-sub">' + U.esc(p.spec) + '</span></td>' +
            '<td class="lead">' + (p.active_days || '<span class="mut">0</span>') + '</td>' +
            '<td>' + (p.last_visit_days == null ? '<span class="mut">нет</span>' : (p.last_visit_days === 0 ? 'сегодня' : U.days(p.last_visit_days))) + '</td>' +
            '<td class="txt"><span class="sig-chip ' + ({ 'Постоянный': 'good', 'Эпизодический': 'note', 'Разовый': 'neutral',
              'Не заходил': 'bad', 'Нет доступа': 'warn' }[p.segment]) + '">' + p.segment + '</span></td>' +
            '</tr>').join('')
            : '<tr><td colspan="5" style="text-align:center;padding:var(--s9);color:var(--muted)">Никто не подходит под выбранный сегмент и поиск.</td></tr>') +
          '</tbody></table></div>' +
          '<div class="tbl-note">Показаны первые 40 строк; поиск и сегмент сужают список. ' +
          'В макете это выборка 1 к ' + U.nf(W, 0) + ' — числа в карточках и таблицах домножены обратно. ' +
          'В Proteus это серверная пагинация и выгрузка в файл.</div>',
      })),
      zone('units', () => U.panel({
        cls: 'split-r', title: 'Охват по разрезу',
        subHtml: S.audUnit
          ? 'фильтр: <b>' + U.esc(S.audUnit.val) + '</b> — клик по строке снимет'
          : 'клик по строке сужает всю вкладку до этого подразделения',
        right: '<div class="ctl inline"><select id="audCutSel" aria-label="Разрез аудитории">' +
          DIM_ORDER.map((k) => '<option value="' + k + '"' + (k === cut ? ' selected' : '') + '>' +
            U.esc(D.CUTS[k].label) + '</option>').join('') + '</select></div>',
        bodyCls: 'tbl-wrap',
        body: U.barTable({
          firstH: D.CUTS[cut].label, firstW: '36%', colW: '15%', barH: '',
          barClass: 'c-cov', dense: true,
          clickAttr: 'audunit', extraAttr: ' data-audkey="' + cut + '"',
          selected: S.audUnit ? S.audUnit.val : null,
          cols: [{ label: 'В ЦА' }, { label: 'Дошли' }, { label: 'Охват' }],
          total: {
            cells: [U.nf(Math.round(rowsAll.length * W)), U.nf(Math.round(rowsAll.filter((r) => r.came).length * W)),
              wide ? '<span class="mut">—</span>' : U.pct(rowsAll.length ? rowsAll.filter((r) => r.came).length / rowsAll.length * 100 : 0, 0)],
          },
          rows: unitRows.map((r) => ({
            key: r.key, label: r.label,
            cells: [U.nf(r.aud), U.nf(r.came), wide ? '<span class="mut">—</span>' : U.pct(r.cov, 0)],
            bar: r.cov,
            tip: {
              title: r.label,
              rows: [{ label: 'В целевой аудитории', value: U.nf(r.aud), dash: true, color: CH.C.bench },
                { label: 'Дошли', value: U.nf(r.came), color: CH.C.act },
                { label: 'Закрепились', value: U.nf(r.reg) },
                { label: 'Охват', value: U.pct(r.cov) }],
              note: S.audUnit && S.audUnit.val === r.key ? 'Клик снимет фильтр' : 'Клик сузит всю вкладку до этой строки',
            },
          })),
          note: wide
            ? 'Долю охвата не показываем: в целевой аудитории почти весь банк, знаменатель ничего не измеряет. Настройте целевую аудиторию выше — доли вернутся.'
            : 'Полоса — доля дошедших ВНУТРИ строки, а не вклад строки в общий охват. ИТОГО считается по всей целевой аудитории.',
        }),
      })),
    ]);

    return [zHead, zScope, zKpi, zObs, gFlow, gPeople];
  }

  /* ---------------------- Полоса сегментов + фильтр -----------------------
     Одно целое (вся ЦА), разложенное по поведению. Стоит над поимённым
     списком, потому что это его же разбивка: клик по сегменту — фильтр
     списка. На карточки и воронку сегмент НЕ влияет: они описывают
     поведение, и фильтровать их поведением значило бы смотреть в зеркало. */
  function segStrip(segRows, total) {
    const t = Math.max(1, total);
    return '<div class="segstrip" role="group" aria-label="Сегменты целевой аудитории">' +
      segRows.map((r) => {
        const on = S.audSeg === r.seg.key;
        const w = Math.max(2.5, r.value / t * 100);
        return '<button class="seg-part' + (on ? ' on' : '') + (S.audSeg && !on ? ' off' : '') + '"' +
          ' data-seg="' + U.esc(r.seg.key) + '" style="flex:' + w.toFixed(2) + ' 1 0"' +
          U.tip({
            title: r.seg.plural,
            rows: [{ label: 'Человек', value: U.nf(r.value), color: r.seg.color },
              { label: 'Доля ЦА', value: U.pct(r.value / t * 100) }],
            note: r.seg.note + (on ? ' · клик снимет фильтр' : ' · клик отфильтрует список'),
          }) + '>' +
          '<span class="sp-bar" style="background:' + r.seg.color + '"></span>' +
          '<span class="sp-v">' + U.nf(r.value) + '</span>' +
          '<span class="sp-l">' + U.esc(r.seg.plural) + '</span>' +
          '</button>';
      }).join('') + '</div>';
  }

  /* -------------- Панель «область + целевая аудитория» --------------------
     Два подписанных блока в одной строке. Раньше здесь заголовок наезжал на
     чип с числом: заголовок и чип лежали в одном потоке без права на
     перенос. Теперь это grid из двух колонок, каждая со своим переносом. */
  function scopeBar(ids, def, audTotal, st, wide) {
    const sc = S.audScope;
    const all = reportRows();

    const kinds = [
      { key: 'one', label: 'Отчёт' },
      { key: 'many', label: 'Несколько' },
      { key: 'collection', label: 'Коллекция' },
    ];
    let picker;
    if (sc.kind === 'collection') {
      picker = '<select id="audColl" class="aud-pick" aria-label="Коллекция">' +
        D.COLLECTIONS.map((c) => '<option value="' + U.esc(c) + '"' + (c === sc.collection ? ' selected' : '') + '>' + U.esc(c) + '</option>').join('') +
        '</select>' +
        '<div class="as-cap2">' + U.nf(ids.length) + ' ' + U.plural(ids.length, 'отчёт', 'отчёта', 'отчётов') + ' в коллекции</div>';
    } else if (sc.kind === 'many') {
      /* Мультивыбор раскрывается ВНИЗ, в потоке страницы, а не всплывающим
         слоем: всплывашка накрывала бы и поиск, и переключатель области.
         Отчёты сгруппированы по коллекциям — так их и ищут глазами, а
         чекбокс на заголовке коллекции берёт её целиком. */
      const q = S.scopeQuery.toLowerCase();
      const hit = all.filter((r) => !q || r.dashboard_nm.toLowerCase().indexOf(q) >= 0 ||
        r.collection.toLowerCase().indexOf(q) >= 0);
      const byColl = {};
      hit.forEach((r) => { (byColl[r.collection] = byColl[r.collection] || []).push(r); });
      const sel = {}; sc.ids.forEach((id) => { sel[id] = 1; });

      /* Коллекции с уже выбранными отчётами — наверх: иначе при
         непустом выборе список открывается на чужой коллекции, и кажется,
         что выбор потерялся. */
      const collOrder = Object.keys(byColl).sort((a, b) => {
        const sa = byColl[a].some((r) => sel[r.dashboard_id]) ? 0 : 1;
        const sb = byColl[b].some((r) => sel[r.dashboard_id]) ? 0 : 1;
        return sa - sb || (a > b ? 1 : -1);
      });
      const body = collOrder.map((c) => {
        const list = byColl[c];
        const on = list.every((r) => sel[r.dashboard_id]);
        return '<div class="pickgrp">' +
          '<label class="pickrow head"><input type="checkbox" data-audcoll="' + U.esc(c) + '"' +
            (on ? ' checked' : '') + '><span>' + U.esc(c) + '</span>' +
            '<i class="pcount">' + list.length + '</i></label>' +
          list.map((r) => '<label class="pickrow"><input type="checkbox" data-audrep="' + r.dashboard_id + '"' +
            (sel[r.dashboard_id] ? ' checked' : '') + '><span>' + U.esc(r.dashboard_nm) + '</span></label>').join('') +
          '</div>';
      }).join('');
      picker = '<div class="pickwrap">' +
        U.searchBox('scopeQ', 'Найти отчёт или коллекцию', S.scopeQuery) +
        '<div class="pickbox" role="group" aria-label="Отчёты области">' +
          (body || '<div class="pickempty">Ничего не найдено</div>') + '</div></div>' +
        '<div class="as-cap2">выбрано ' + U.nf(sc.ids.length) + ' ' + U.plural(sc.ids.length, 'отчёт', 'отчёта', 'отчётов') + '</div>';
    } else {
      picker = '<select id="audRep" class="aud-pick" aria-label="Отчёт">' +
        all.map((r) => '<option value="' + r.dashboard_id + '"' + (r.dashboard_id === ids[0] ? ' selected' : '') + '>' + U.esc(r.dashboard_nm) + '</option>').join('') +
        '</select>' +
        '<div class="as-cap2">аудитория показана для выбранного</div>';
    }

    /* Правый блок: откуда взялась целевая аудитория и как её переопределить */
    const metas = def.metas;
    const groups = {};
    metas.forEach((m) => (m.ad_groups || []).forEach((g) => { groups[g] = 1; }));
    const gList = Object.keys(groups);
    const hasAcl = metas.some((m) => m.audience_type === 'acl');

    let audTitle, audText, audChip;
    if (def.mode === 'custom') {
      audTitle = 'Собрана в конструкторе';
      audChip = '<span class="sig-chip note">' + U.nf(audTotal) + ' ' + U.plural(audTotal, 'человек', 'человека', 'человек') + '</span>';
      audText = 'Условия: ' + DIM_ORDER.filter((k) => (S.audDef.filters[k] || []).length)
        .map((k) => '<b>' + U.esc(D.CUTS[k].label) + '</b>: ' + (S.audDef.filters[k].map(U.esc).join(', ')))
        .join(' <span class="mut">и</span> ') +
        '. Берём из управленческой структуры всех, кто под них попадает, и смотрим, сколько из них дошло до области.';
    } else if (wide) {
      audTitle = 'Доступ роздан почти всей компании';
      audChip = '<span class="sig-chip warn">покрытие не считаем</span>';
      audText = 'Права выданы через <b>' + (gList.map(U.esc).join('</b>, <b>') || 'широкую группу') +
        '</b> — это <b>' + U.nf(audTotal) + '</b> человек, практически весь банк. Такой знаменатель не описывает, ' +
        'для кого делали отчёт, поэтому долю покрытия по нему мы не показываем. ' +
        '<b>Соберите целевую аудиторию по структуре</b> — и доли вернутся.';
    } else if (hasAcl && !gList.length) {
      audTitle = 'Поимённый список доступа';
      audChip = '<span class="sig-chip note">' + U.nf(audTotal) + ' ' + U.plural(audTotal, 'человек', 'человека', 'человек') + '</span>';
      audText = 'Права выданы поимённо. Это самый точный вид целевой аудитории: покрытие и список «не заходил» считаются без допущений.';
    } else {
      audTitle = 'Доступ через AD-группы';
      audChip = '<span class="sig-chip note">' + U.nf(audTotal) + ' ' + U.plural(audTotal, 'человек', 'человека', 'человек') + '</span>';
      audText = 'Права выданы ' + U.plural(gList.length, 'группе', 'группам', 'группам') + ' <b>' +
        gList.map(U.esc).join('</b>, <b>') + '</b>' +
        (hasAcl ? ' плюс поимённые права' : '') + ' — всего <b>' + U.nf(audTotal) + '</b> ' +
        U.plural(audTotal, 'человек', 'человека', 'человек') + '. Считаем их целевой аудиторией, пока не задана своя.';
    }

    return '<div class="scopebar' + (wide ? ' wide' : '') + '">' +
      '<div class="sb-col">' +
        '<div class="as-cap">Область — чью аудиторию смотрим</div>' +
        '<div class="sub-tabs">' + kinds.map((kd) =>
          '<button class="sub-tab' + (kd.key === sc.kind ? ' active' : '') + '" data-audkind="' + kd.key + '">' +
          U.esc(kd.label) + '</button>').join('') + '</div>' +
        '<div class="sb-pick">' + picker + '</div>' +
      '</div>' +
      '<div class="sb-col sb-aud">' +
        '<div class="as-cap">Целевая аудитория — с чем сравниваем охват</div>' +
        '<div class="as-t">' + U.esc(audTitle) + audChip + '</div>' +
        '<div class="as-x">' + audText +
          (S.audUnit
            ? ' <b>На экране срез: ' + U.esc(S.audUnit.val) + '</b> — ' + U.nf(st.audience) + ' ' +
              U.plural(st.audience, 'человек', 'человека', 'человек') + ' из них.'
            : '') + '</div>' +
        '<div class="sb-act">' +
          '<button class="btn' + (def.mode === 'custom' ? '' : ' primary') + '" id="audCfgOpen">' +
            (def.mode === 'custom' ? 'Изменить условия' : 'Настроить целевую аудиторию') + '</button>' +
          (def.mode === 'custom'
            ? '<button class="btn ghost" id="audCfgReset">Вернуть «как роздан доступ»</button>'
            : '') +
        '</div>' +
      '</div>' +
      '</div>' + audienceModal();
  }

  /* Конструктор целевой аудитории. Те же поля, что в mdm_employee_daily_proteus:
     ничего сверх витрины накликать нельзя. */
  function audienceModal() {
    if (!S._audCfg) return '';
    const f = S.audDef.draft;
    const people = D.customAudience(f);
    const n = people.length;
    /* Главный вопрос конструктора не «сколько человек попало», а «сколько из
       них вообще могут открыть отчёт»: структура шире прав, и если условия
       захватывают людей без доступа, охват просядет не от того, что не ходят. */
    const ids = scopeIds();
    const withAcc = people.filter((p) => ids.some((id) => D.hasAccess(p, id))).length;
    const dim = DIM_ORDER.indexOf(S._audDim) >= 0 ? S._audDim : DIM_ORDER[0];
    const cnt = (k) => (f[k] || []).length;
    const total = DIM_ORDER.reduce((a, k) => a + cnt(k), 0);

    /* Разрезы списком слева, значения выбранного — справа. Все восемь
       разрезов простынёй чипов сразу — это триста кнопок на экране, по
       которым нельзя ни скользнуть взглядом, ни попасть. */
    const dims = DIM_ORDER.map((k) => '<button class="cfg-dim' + (k === dim ? ' on' : '') + '"' +
      ' data-auddimsel="' + k + '"' + U.tip({ title: D.CUTS[k].label, text: DIM_HINT[k] }) + '>' +
      U.esc(D.CUTS[k].label) +
      (cnt(k) ? '<i class="pcount on">' + cnt(k) + '</i>' : '<i class="pcount">' + D.CUTS[k].vals.length + '</i>') +
      '</button>').join('');

    const vals = '<div class="pickchips">' + D.CUTS[dim].vals.map((v) =>
      '<button class="pchip' + ((f[dim] || []).indexOf(v) >= 0 ? ' on' : '') + '"' +
      ' data-auddim="' + dim + '" data-audval="' + U.esc(v) + '">' + U.esc(v) + '</button>').join('') + '</div>';

    const chosen = total
      ? DIM_ORDER.filter((k) => cnt(k)).map((k) =>
        '<span class="cfg-cond"><b>' + U.esc(D.CUTS[k].label) + '</b>' +
        (f[k] || []).map((v) => '<button class="pchip on sm" data-auddim="' + k + '" data-audval="' + U.esc(v) + '"' +
          U.tip({ text: 'Убрать условие' }) + '>' + U.esc(v) + ' ×</button>').join('') + '</span>').join('')
      : '<span class="as-x">Условий нет — под целевую аудиторию попадает весь банк. Выберите разрез слева.</span>';

    return '<div class="ovl" id="audCfg">' +
      '<div class="modal wide" role="dialog" aria-modal="true" aria-labelledby="audCfgT">' +
        '<div class="modal-h"><h3 id="audCfgT">Целевая аудитория</h3>' +
        '<p>Накликайте структуру — возьмём оттуда всех сотрудников и посмотрим, сколько из них дошло до области. ' +
        'Внутри разреза условия складываются по <b>ИЛИ</b>, между разрезами — по <b>И</b>. ' +
        'Пустой разрез ничего не ограничивает.</p></div>' +
        '<div class="modal-b cfg-b">' +
          '<div class="cfg-sel">' + chosen + '</div>' +
          '<div class="cfg-grid">' +
            '<div class="cfg-dims" role="tablist" aria-label="Разрезы">' + dims + '</div>' +
            '<div class="cfg-vals">' +
              '<div class="cfg-vh">' + U.esc(D.CUTS[dim].label) +
                '<span class="cfg-vhx">' + U.esc(DIM_HINT[dim]) + '</span></div>' +
              vals +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="modal-f">' +
          '<span class="as-x">Под условия попадает <b>' + U.nf(Math.round(n * D.POP_W)) + '</b> ' +
          U.plural(Math.round(n * D.POP_W), 'сотрудник', 'сотрудника', 'сотрудников') +
          (n ? ', доступ к области есть у <b>' + U.nf(Math.round(withAcc * D.POP_W)) + '</b> (' +
            U.pct(withAcc / n * 100, 0) + ')' : '') + '</span>' +
          '<span class="sp"></span>' +
          '<button class="btn" id="audCfgClear">Очистить</button>' +
          '<button class="btn" id="audCfgCancel">Отмена</button>' +
          '<button class="btn primary" id="audCfgApply">Применить</button>' +
        '</div>' +
      '</div></div>';
  }

  /* Что означает разрез — в подсказке, а не в подписи: подписи должны быть
     короткими, иначе список разрезов превращается в текст. */
  const DIM_HINT = {
    lvl3: 'Блок — третий уровень управленческой структуры. Самый частый способ очертить аудиторию: «отчёт для розницы».',
    lvl4: 'Департамент — четвёртый уровень. Нужен, когда отчёт делали не для блока целиком.',
    stream: 'Стрим — продуктовое направление; с управленческой структурой совпадает не всегда.',
    spec: 'Кем человек работает: аналитик, разработчик, руководитель. Отчёт часто делают под роль, а не под подразделение.',
    adgroup: 'Членство в AD-группе. Годится, когда нужная аудитория уже описана группой — пусть даже не той, которой роздан доступ к этому отчёту.',
    exp: 'Стаж в компании. Новички и старожилы пользуются отчётностью по-разному.',
    it: 'IT или не IT.',
    hq: 'Головной офис или сеть.',
  };

  /* ============================ Общий заголовок ========================== */
  function head(title, text) {
    const chips = [];
    chips.push(U.benchChip('Период: <b>' + D.GRAINS[S.grain].label + '</b>'));
    if (S.sel) chips.push(U.chip(MODE(S.sel.mode).one + ': ' + selection().title, 'sel'));
    if (S.freqSel && S.tab === 'reports') chips.push(U.chip('Частота: ' + S.freqSel, 'freqSel'));
    if (S.tab === 'audience') {
      if (S.audDef.mode === 'custom') {
        const n = audDefCount();
        chips.push(U.chip('ЦА настроена: ' + n + ' ' + U.plural(n, 'условие', 'условия', 'условий'), 'audDef'));
      }
      if (S.audUnit) chips.push(U.chip(D.CUTS[S.audUnit.key].label + ': ' + S.audUnit.val, 'audUnit'));
      if (S.audSeg) chips.push(U.chip('Сегмент: ' + S.audSeg, 'audSeg'));
    }
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
    { key: 'audience', label: 'Аудитория', fn: renderAudience },
  ];

  function render(keepScroll) {
    const y = keepScroll ? window.scrollY : 0;
    const tabs = '<div class="tabs" role="tablist">' + TABS.map((t) =>
      '<button class="tab' + (t.key === S.tab ? ' active' : '') + '" role="tab" data-tab="' + t.key + '"' +
      ' aria-selected="' + (t.key === S.tab) + '">' + t.label + '</button>').join('') + '</div>' +
      '<div style="flex:1"></div>' +
      '<button class="btn ghost" id="btnHow">Как это устроено</button>';
    const host = document.getElementById('tabsHost');
    if (host.innerHTML !== tabs) host.innerHTML = tabs;

    QUEUE = [];
    paint(TABS.find((t) => t.key === S.tab).fn());
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
      if (S.mode !== md.dataset.mode) { S.mode = md.dataset.mode; S.sel = null; S.freqSel = null; }
      render(true); return;
    }

    const stab = cl('[data-stab]');
    if (stab) { S[stab.dataset.stab] = stab.dataset.val; render(true); return; }

    const seg = cl('[data-seg]');
    if (seg) { S.audSeg = S.audSeg === (seg.dataset.seg || null) ? null : (seg.dataset.seg || null); render(true); return; }

    /* --- Аудитория: область, кросс-фильтр разреза, конструктор ЦА --- */
    const ak = cl('[data-audkind]');
    if (ak) {
      const kind = ak.dataset.audkind;
      if (kind === 'many' && !S.audScope.ids.length) {
        S.audScope.ids = reportRows().slice(0, 3).map((r) => r.dashboard_id);
      }
      S.audScope.kind = kind; S.audUnit = null; S.audSeg = null; render(true); return;
    }
    const au = cl('[data-audunit]');
    if (au) {
      const v = au.dataset.audunit;
      S.audUnit = (S.audUnit && S.audUnit.val === v) ? null : { key: au.dataset.audkey || S.audCut, val: v };
      render(true); return;
    }
    if (t.id === 'audCfgOpen') {
      S._audCfg = true;
      S.audDef.draft = JSON.parse(JSON.stringify(S.audDef.filters || {}));
      /* Чистый лист — плохое начало: «настройте целевую аудиторию» без
         подсказки означает выбрать наугад из семи разрезов. Подставляем то
         подразделение, в котором уже сидит большинство обладателей доступа:
         это почти всегда и есть та структура, которую имели в виду. */
      if (!DIM_ORDER.some((k) => (S.audDef.draft[k] || []).length)) {
        const sug = suggestAudience(scopeIds());
        if (sug) S.audDef.draft = sug;
      }
      render(true); return;
    }
    const dsel = cl('[data-auddimsel]');
    if (dsel) { S._audDim = dsel.dataset.auddimsel; render(true); return; }

    const pc = cl('[data-auddim]');
    if (pc) {
      const k = pc.dataset.auddim, v = pc.dataset.audval;
      const arr = (S.audDef.draft[k] = S.audDef.draft[k] || []);
      const i = arr.indexOf(v);
      if (i >= 0) arr.splice(i, 1); else arr.push(v);
      render(true); return;
    }
    if (t.id === 'audCfgClear') { S.audDef.draft = {}; render(true); return; }
    if (t.id === 'audCfgCancel' || t.id === 'audCfg') { S._audCfg = false; render(true); return; }
    if (t.id === 'audCfgApply') {
      const d = S.audDef.draft || {};
      const any = DIM_ORDER.some((k) => (d[k] || []).length);
      S.audDef.filters = JSON.parse(JSON.stringify(d));
      S.audDef.mode = any ? 'custom' : 'access';
      S._audCfg = false; S.audUnit = null; render(true); return;
    }
    if (t.id === 'audCfgReset') {
      S.audDef.mode = 'access'; S.audDef.filters = {}; S.audUnit = null; render(true); return;
    }

    /* Частота визитов — кросс-фильтр: повторный клик снимает */
    const fq = cl('[data-freq]');
    if (fq) { S.freqSel = S.freqSel === fq.dataset.freq ? null : fq.dataset.freq; render(true); return; }

    /* Легенда когорт: чем меряем цвет и какой размах у шкалы */
    const ctb = cl('[data-ctbase]');
    if (ctb) { S.ctBase = ctb.dataset.ctbase; render(true); return; }


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
      else if (k === 'freqSel') S.freqSel = null;
      else if (k === 'audSeg') S.audSeg = null;
      else if (k === 'audUnit') S.audUnit = null;
      else if (k === 'audDef') { S.audDef.mode = 'access'; S.audDef.filters = {}; }
      else S.filters[k] = (typeof S.filters[k] === 'boolean') ? false : '';
      render(true); return;
    }

    const srow = cl('[data-slice]');
    if (srow && srow.dataset.slice) { pick(srow.dataset.slice, srow.dataset.val); render(true); return; }

    const rep = cl('[data-rep]');
    if (rep) { pick('report', +rep.dataset.rep); render(true); return; }

    const go = cl('[data-goaud]');
    if (go) {
      S.selectedReport = +go.dataset.goaud; S.tab = 'audience';
      S.audScope.kind = 'one'; S.audSeg = null; S.audUnit = null;
      render(); return;
    }

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
      S.sel = null; S.repQuery = ''; S.audQuery = ''; S.audSeg = null; S.freqSel = null;
      S.audUnit = null; S.audDef = { mode: 'access', filters: {}, draft: {} };
      S._audCfg = false; S.scopeQuery = '';
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
    if (t.id === 'audCutSel') { S.audCut = t.value; S.audUnit = null; render(true); return; }
    if (t.id === 'audRep') { S.selectedReport = +t.value; S.audUnit = null; render(true); return; }
    if (t.id === 'audColl') { S.audScope.collection = t.value; S.audUnit = null; render(true); return; }
    if (t.dataset && t.dataset.audcoll) {
      const ids = reportRows().filter((r) => r.collection === t.dataset.audcoll).map((r) => r.dashboard_id);
      const set = {}; S.audScope.ids.forEach((id) => { set[id] = 1; });
      ids.forEach((id) => { if (t.checked) set[id] = 1; else delete set[id]; });
      S.audScope.ids = Object.keys(set).map(Number);
      S.audUnit = null; render(true); return;
    }
    if (t.dataset && t.dataset.audrep) {
      const id = +t.dataset.audrep;
      const i = S.audScope.ids.indexOf(id);
      if (t.checked && i < 0) S.audScope.ids.push(id);
      if (!t.checked && i >= 0) S.audScope.ids.splice(i, 1);
      S.audUnit = null; render(true); return;
    }
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
    const FIELDS = { repQ: 'repQuery', audQ: 'audQuery', scopeQ: 'scopeQuery' };
    const key = FIELDS[t.id];
    if (!key) return;
    clearTimeout(qTimer);
    const id = t.id, v = t.value;
    qTimer = setTimeout(() => {
      S[key] = v;
      render(true);
      const el = document.getElementById(id);
      if (el) { el.focus(); el.setSelectionRange(v.length, v.length); }
    }, 260);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (S._audCfg) { S._audCfg = false; render(true); return; }
      document.getElementById('howModal').hidden = true;
      document.getElementById('sideNav').classList.remove('open');
      document.getElementById('navScrim').classList.remove('open');
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role="button"]')) {
      e.preventDefault();
      e.target.click();
    }
  });

  /* --------- Легенда когорт: наведение на ступень гасит всё лишнее --------
     Держим это на слушателях документа, а не на inline-обработчиках: таблица
     перерисовывается целиком при каждом действии, привязанные к узлам
     обработчики пришлось бы навешивать заново. */
  document.addEventListener('mouseover', (e) => {
    const st = e.target.closest ? e.target.closest('.ct-st') : null;
    if (!st) return;
    const wrap = document.querySelector('.ct-wrap[data-ctuid="' + st.dataset.ctuid + '"]');
    if (!wrap) return;
    const band = st.dataset.ctband;
    wrap.classList.add('band-on');
    wrap.querySelectorAll('td.ct-cell').forEach((td) => {
      td.classList.toggle('band-hit', td.dataset.band === band);
    });
  });
  document.addEventListener('mouseout', (e) => {
    const st = e.target.closest ? e.target.closest('.ct-st') : null;
    if (!st) return;
    const wrap = document.querySelector('.ct-wrap[data-ctuid="' + st.dataset.ctuid + '"]');
    if (!wrap) return;
    wrap.classList.remove('band-on');
    wrap.querySelectorAll('td.band-hit').forEach((td) => td.classList.remove('band-hit'));
  });

  /* Тень под закреплённой шапкой появляется, только когда под ней
     действительно что-то уехало: иначе она висит над неподвижной таблицей. */
  document.addEventListener('scroll', (e) => {
    const t = e.target;
    if (!t || !t.classList || !(t.classList.contains('tbl-wrap') || t.classList.contains('tbl-scroll'))) return;
    t.classList.toggle('scrolled', t.scrollTop > 2);
  }, true);

  /* ================================ Старт ================================ */
  document.getElementById('freshDate').innerHTML = 'данные на <b>' + U.fmtDate(D.MAX_DATE) + '</b>';
  render();
})();
