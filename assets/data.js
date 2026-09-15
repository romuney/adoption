/* ============================================================================
   ДАННЫЕ МАКЕТА — СИНТЕТИЧЕСКИЕ.

   Числа придуманы. Но СТРУКТУРА строк — ровно та, что вернёт SQL из
   prod_proteus. Каждый датасет ниже соответствует одному запросу и одной
   вкладке: вкладка забирает свой датасет целиком, дальше все переключения
   разреза, периода и кросс-фильтры считаются в браузере, без похода в базу.

   Соответствие полей источнику (см. память проекта → proteus-adoption-datamodel):
     users        COUNT(DISTINCT user_id)
     views        SUM(action_count)
     new_users    юзеры, у кого first_action попал в этот бакет
     ret_users    были активны в предыдущем бакете
     react_users  не были в предыдущем, но были раньше   (new+ret+react = users)
     headcount    COUNT(DISTINCT ad_login) из mdm_employee_daily_proteus
   ========================================================================== */
(function (global) {
  'use strict';

  /* ---------- Детерминированный ГПСЧ: макет одинаков при каждом открытии --- */
  function rng(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  const R = rng(20260914);
  const jit = (a) => 1 + (R() - .5) * 2 * a;           // множитель-дрожь ±a
  const pick = (arr) => arr[Math.floor(R() * arr.length)];

  /* ---------- Раскладка целого по весам (метод наибольших остатков) -------
     Нужна, чтобы разбивки в таблицах сходились с ИТОГО до единицы.
     Для этих разрезов это корректно: у сотрудника ровно одно значение
     стрима / УС / специализации, поэтому уникальные пользователи суммируются. */
  function alloc(total, weights) {
    const s = weights.reduce((a, b) => a + b, 0) || 1;
    const raw = weights.map((w) => (total * w) / s);
    const out = raw.map(Math.floor);
    let left = total - out.reduce((a, b) => a + b, 0);
    raw.map((v, i) => [v - Math.floor(v), i])
      .sort((a, b) => b[0] - a[0])
      .forEach(([, i]) => { if (left > 0) { out[i]++; left--; } });
    return out;
  }

  /* ========================== Справочники разрезов ======================== */
  const CUTS = {
    all:    { label: 'Без разреза',        vals: ['Вся компания'],                            w: [1] },
    stream: { label: 'Стрим',              vals: ['Розничный бизнес', 'Кредитные продукты', 'Платежи и переводы', 'МСБ', 'Инвестиции', 'Технологии', 'Риски', 'Поддержка клиентов'], w: [19, 15, 12, 9, 8, 17, 10, 10] },
    spec:   { label: 'Специализация',      vals: ['Аналитик', 'Разработчик', 'Менеджер продукта', 'Руководитель', 'Специалист поддержки', 'Маркетинг', 'Финансы', 'HR', 'Операционист'], w: [21, 16, 12, 11, 9, 8, 8, 5, 10] },
    lvl3:   { label: 'Управл. структура, ур. 3', vals: ['Блок «Розница»', 'Блок «Технологии»', 'Блок «Корпоративный»', 'Блок «Риски»', 'Блок «Финансы»', 'Блок «Операции»', 'Блок «Люди»'], w: [24, 21, 14, 12, 10, 12, 7] },
    lvl4:   { label: 'Управл. структура, ур. 4', vals: ['Департамент продаж', 'Департамент разработки', 'Департамент данных', 'Департамент маркетинга', 'Департамент кредитов', 'Департамент казначейства', 'Департамент поддержки', 'Департамент HR', 'Департамент безопасности', 'Департамент логистики'], w: [16, 18, 13, 9, 11, 7, 10, 6, 5, 5] },
    it:     { label: 'IT | non-IT',        vals: ['IT', 'non-IT'],                            w: [38, 62] },
    hq:     { label: 'HQ | non-HQ',        vals: ['HQ', 'non-HQ'],                            w: [57, 43] },
    exp:    { label: 'Стаж в компании',    vals: ['до 1 года', '1–3 года', '3–5 лет', '5–10 лет', '10+ лет'], w: [18, 29, 22, 20, 11] },
  };
  const CUT_KEYS = Object.keys(CUTS);
  const HC_TOTAL_REF = 27400;                    // активная численность банка

  /* ============================ Ось времени ============================== */
  const MAX_DATE = Date.UTC(2026, 8, 13);          // свежесть витрины
  const DAY = 86400000;

  const GRAINS = {
    d: { label: '30 дней',     n: 30, unit: 'день'    },
    w: { label: '20 недель',   n: 20, unit: 'неделя'  },
    m: { label: '12 месяцев',  n: 12, unit: 'месяц'   },
    q: { label: '8 кварталов', n: 8,  unit: 'квартал' },
  };

  function buckets(grain) {
    const out = [];
    const n = GRAINS[grain].n;
    const d0 = new Date(MAX_DATE);
    for (let i = n - 1; i >= 0; i--) {
      let t;
      if (grain === 'd') t = MAX_DATE - i * DAY;
      else if (grain === 'w') {
        const monday = MAX_DATE - ((new Date(MAX_DATE).getUTCDay() + 6) % 7) * DAY;
        t = monday - i * 7 * DAY;
      } else if (grain === 'm') {
        t = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() - i, 1);
      } else {
        const q0 = Math.floor(d0.getUTCMonth() / 3);
        t = Date.UTC(d0.getUTCFullYear(), (q0 - i) * 3, 1);
      }
      out.push(t);
    }
    return out;
  }

  /* Базовый уровень активности: рост + сезонность + провалы на выходных */
  function baseUsers(grain, idx, n) {
    const g = { d: 1180, w: 2350, m: 3450, q: 4900 }[grain];
    const trend = 1 + (idx / Math.max(1, n - 1)) * { d: .11, w: .28, m: .52, q: .74 }[grain];
    let season = 1;
    if (grain === 'd') {
      const wd = new Date(buckets('d')[idx]).getUTCDay();
      season = (wd === 0 || wd === 6) ? .34 : 1;
    }
    return Math.round(g * trend * season * jit(.05));
  }

  /* ======================================================================
     ДАТАСЕТ 1 — ds_overview   (вкладка «Обзор»)
     Один запрос, три секции через UNION ALL, различаются полем section.
     Все четыре периода лежат внутри → переключение периода тоже клиентское.
     Оценка объёма на бою: (30+20+12+8) бакетов × 8 разрезов × ~8 значений
     ≈ 4,5 тыс. строк. Грузится один раз, дальше всё считается в браузере.
     ==================================================================== */
  const ds_overview = [];

  Object.keys(GRAINS).forEach((grain) => {
    const bs = buckets(grain);
    bs.forEach((bucket, i) => {
      const total = baseUsers(grain, i, bs.length);
      /* Доли новых и вернувшихся падают по мере зрелости продукта.
         Калибровка: сумма новых за период должна давать вменяемую долю
         от периодной аудитории (порядка 20%), а не половину её. */
      const shNew = ({ d: .016, w: .032, m: .062, q: .09 }[grain]) * (1.45 - i / bs.length) * jit(.18);
      const shRe  = ({ d: .045, w: .06, m: .07, q: .08 }[grain]) * jit(.2);
      const nNew = Math.round(total * shNew);
      const nRe  = Math.round(total * shRe);
      const nRet = total - nNew - nRe;
      const viewsPer = 3.1 * jit(.08) + (grain === 'q' ? 1.4 : grain === 'm' ? .9 : 0);
      const views = Math.round(total * viewsPer);

      CUT_KEYS.forEach((ck) => {
        const c = CUTS[ck];
        const w = c.w.map((x) => x * jit(.06));
        const aU = alloc(total, w), aN = alloc(nNew, w), aR = alloc(nRe, w), aV = alloc(views, w);
        c.vals.forEach((cv, j) => {
          ds_overview.push({
            section: 'ts', grain, bucket, cut_key: ck, cut_val: cv,
            users: aU[j], new_users: aN[j], react_users: aR[j],
            ret_users: aU[j] - aN[j] - aR[j], views: aV[j],
          });
        });
      });
      void nRet;
    });
  });

  /* Когорты закрепляемости: месяц первого визита × возраст в месяцах */
  (function () {
    const now = new Date(MAX_DATE);
    for (let c = 23; c >= 0; c--) {
      const cm = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - c, 1);
      const size = Math.round((220 + c * 9) * jit(.22));
      const maxAge = c;
      for (let age = 0; age <= maxAge; age++) {
        // кривая удержания: резкий спад на 1-м месяце, дальше плато
        const base = age === 0 ? 1 : .43 * Math.pow(age, -.26);
        const mature = 1 + (23 - c) * .006;          // поздние когорты чуть лучше
        const v = Math.max(0, Math.min(1, base * mature * jit(.09)));
        ds_overview.push({
          section: 'cohort', cohort_month: cm, age,
          active_users: Math.round(size * v), cohort_size: size,
        });
      }
    }
  })();

  /* Частота визитов: сколько активных дней у пользователя за период.
     Размер периодной аудитории берём не из одного бакета (последний день
     может оказаться воскресеньем), а из средней по бакетам, умноженной на
     коэффициент: уникальные за период НЕ равны уникальным за бакет —
     один человек заходит в разные дни. Это тот же смысл, что MAU/DAU. */
  const FREQ = ['1 день', '2–3 дня', '4–7 дней', '8–15 дней', '16+ дней'];
  const PERIOD_MULT = { d: 3.4, w: 2.6, m: 1.9, q: 1.45 };
  Object.keys(GRAINS).forEach((grain) => {
    const shape = { d: [34, 27, 20, 13, 6], w: [26, 25, 22, 17, 10], m: [19, 22, 24, 21, 14], q: [15, 20, 24, 23, 18] }[grain];
    const agg = {};
    ds_overview.forEach((r) => {
      if (r.section !== 'ts' || r.grain !== grain) return;
      const k = r.cut_key + '|' + r.cut_val;
      const a = (agg[k] = agg[k] || { sum: 0, n: 0 });
      a.sum += r.users; a.n++;
    });
    CUT_KEYS.forEach((ck) => {
      CUTS[ck].vals.forEach((cv) => {
        const a = agg[ck + '|' + cv];
        const total = Math.round((a.sum / a.n) * PERIOD_MULT[grain]);
        const arr = alloc(total, shape.map((x) => x * jit(.12)));
        FREQ.forEach((fb, k) => {
          ds_overview.push({ section: 'freq', grain, cut_key: ck, cut_val: cv, freq_bucket: fb, users: arr[k] });
        });
      });
    });
  });

  /* Периодные KPI. Отдельная секция, потому что уникальные пользователи
     за период НЕ равны сумме уникальных по бакетам: один человек заходит
     в разные дни. В SQL это два оконных фильтра (текущий период и
     предыдущий той же длины) — здесь та же пара значений. */
  Object.keys(GRAINS).forEach((grain) => {
    const freqRows = ds_overview.filter((r) => r.section === 'freq' && r.grain === grain);
    const growth = { d: .043, w: .092, m: .175, q: .26 }[grain];
    CUT_KEYS.forEach((ck) => {
      CUTS[ck].vals.forEach((cv) => {
        const my = freqRows.filter((r) => r.cut_key === ck && r.cut_val === cv);
        const users = my.reduce((a, b) => a + b.users, 0);
        const regular = my.filter((r) => r.freq_bucket === '8–15 дней' || r.freq_bucket === '16+ дней')
          .reduce((a, b) => a + b.users, 0);
        const tsMy = ds_overview.filter((r) => r.section === 'ts' && r.grain === grain && r.cut_key === ck && r.cut_val === cv);
        const views = tsMy.reduce((a, b) => a + b.views, 0);
        const newU = tsMy.reduce((a, b) => a + b.new_users, 0);
        const hcShare = CUTS[ck].w[CUTS[ck].vals.indexOf(cv)] / CUTS[ck].w.reduce((a, b) => a + b, 0);
        ds_overview.push({
          section: 'kpi', grain, cut_key: ck, cut_val: cv,
          users, users_prev: Math.round(users / (1 + growth * jit(.35))),
          views, views_prev: Math.round(views / (1 + growth * 1.2 * jit(.35))),
          new_users: newU, new_users_prev: Math.round(newU / (1 + growth * .6 * jit(.5))),
          regular_users: regular,
          regular_users_prev: Math.round(regular / (1 + growth * 1.4 * jit(.4))),
          sleeping_users: Math.round(users * (.17 + R() * .06)),
          headcount: Math.round(HC_TOTAL_REF * hcShare),
        });
      });
    });
  });

  /* ======================================================================
     ДАТАСЕТ 2 — ds_reports   (вкладка «Отчёты»)
     ==================================================================== */
  const OWNERS = ['a.petrova', 'd.sokolov', 'm.ivanova', 'k.orlov', 'n.lebedeva', 's.morozov', 'e.volkova', 'r.kazantsev', 'i.gusev', 'p.novikova'];
  const COLLECTIONS = ['Розница', 'Риски и капитал', 'Финансы', 'Технологии', 'Клиентский сервис', 'Продажи', 'HR и найм', 'Без коллекции'];
  const REPORT_NAMES = [
    'Воронка выдач кредитных карт', 'Ежедневный P&L розницы', 'NPS и клиентский опыт',
    'Просрочка и винтажи', 'Активность в мобильном банке', 'Конверсия заявок МСБ',
    'Платёжный трафик', 'Инвестиционные продукты: обзор', 'SLA поддержки клиентов',
    'Найм и текучесть', 'Нагрузка на колл-центр', 'Депозитный портфель',
    'Эквайринг: обороты', 'Маркетинговые кампании', 'Отток клиентов',
    'Кросс-продажи', 'Здоровье сервисов', 'Инциденты и доступность',
    'Скоринг: качество моделей', 'Комиссионный доход', 'Себестоимость операций',
    'Продуктивность разработки', 'Использование облака', 'Планирование мощностей',
    'Валютные операции', 'Зарплатные проекты', 'Партнёрские программы',
    'Кэшбэк и бонусы', 'Обращения в чат', 'Онбординг новых клиентов',
    'Пенсионные продукты', 'Автокредитование', 'Ипотека: пайплайн',
    'Страховые продукты', 'Финансовый мониторинг', 'Casa-баланс',
    'Розничные точки: трафик', 'Банкоматная сеть', 'Тарифы и ценообразование',
    'Регуляторная отчётность', 'Кадровый резерв', 'Обучение сотрудников',
    'Закупки и подрядчики', 'Юридические риски', 'ESG-метрики',
    'Портфель проектов', 'Бюджет IT', 'Техдолг и качество кода',
  ];

  const ds_reports = [];
  const reportMeta = [];

  REPORT_NAMES.forEach((nm, i) => {
    const id = 14000 + i * 37;
    const pop = Math.pow(1 - i / (REPORT_NAMES.length + 6), 2.3);   // парето-подобное
    const createdAgo = Math.round(40 + R() * 900);
    const created = MAX_DATE - createdAgo * DAY;
    const meta = {
      dashboard_id: id,
      dashboard_nm: nm,
      dashboard_url: 'https://proteus.tcsbank.ru/superset/dashboard/' + id,
      owner_login: OWNERS[i % OWNERS.length],
      collection: COLLECTIONS[i % COLLECTIONS.length],
      certified_by: R() < .34 ? 'Data Office' : null,
      published: R() < .93 ? 1 : 0,
      actual_flg: R() < .9 ? 1 : 0,
      created_dt: created,
      is_new: createdAgo <= 90,
    };
    reportMeta.push(meta);

    Object.keys(GRAINS).forEach((grain) => {
      const bs = buckets(grain);
      const scale = { d: 1, w: 1.9, m: 2.9, q: 4.2 }[grain];
      const users = Math.max(3, Math.round(1450 * pop * scale * jit(.1)));
      const views = Math.round(users * (2.4 + R() * 4.6));
      const newU = Math.round(users * (meta.is_new ? .21 : .07) * jit(.25));
      const audience = Math.round(users / (.24 + R() * .52));

      /* Частота визитов внутри отчёта: сколько разных дней человек его
         открывал. У популярных отчётов хвост «постоянных» толще.
         Считается ДО карточки, потому что «постоянные» — это две верхние
         корзины частоты: иначе карточка и таблица разойдутся. */
      const fshape = { d: [38, 27, 19, 11, 5], w: [30, 26, 21, 15, 8], m: [22, 24, 24, 19, 11], q: [17, 21, 25, 22, 15] }[grain]
        .map((x, k) => x * jit(.12) * (1 + pop * [-.5, -.2, .1, .5, .9][k]));
      const fa = alloc(users, fshape);
      FREQ.forEach((fb, k) => {
        ds_reports.push({ section: 'rfreq', grain, dashboard_id: id, freq_bucket: fb, users: fa[k] });
      });
      const regular = fa[3] + fa[4];                    // 8–15 дней и 16+
      // молодые отчёты растут быстрее зрелых — отсюда разные знаменатели дельт
      const growth = { d: .04, w: .085, m: .16, q: .24 }[grain] * (meta.is_new ? 2.4 : 1);
      ds_reports.push(Object.assign({ section: 'report', grain }, meta, {
        users, views, new_users: newU, regular_users: regular,
        users_prev: Math.round(users / (1 + growth * jit(.4))),
        views_prev: Math.round(views / (1 + growth * 1.15 * jit(.4))),
        new_users_prev: Math.round(newU / (1 + growth * .7 * jit(.5))),
        regular_users_prev: Math.round(regular / (1 + growth * 1.3 * jit(.45))),
        sleeping_users: Math.round(users * (.15 + R() * .07)),
        views_per_user: +(views / users).toFixed(1),
        audience_size: audience,
        reached_share: +(users / audience).toFixed(3),
        last_view_days: Math.round(R() * R() * 26),
      }));

      /* Динамика отчёта. Состав тот же, что в обзоре: новые + вернувшиеся
         + вернувшиеся = все пользователи бакета. Только «новый» здесь — это
         первый визит В ЭТОТ ОТЧЁТ, а не в Proteus вообще. */
      bs.forEach((bucket, k) => {
        const ramp = meta.is_new && grain === 'd'
          ? Math.min(1, Math.max(.05, (k - 8) / 9))            // всплеск после публикации
          : .75 + (k / bs.length) * .5;
        const u = Math.max(0, Math.round((users / bs.length) * ramp * 3.1 * jit(.22)));
        const nu = Math.min(u, Math.round(u * (meta.is_new ? .3 : .08) * jit(.3)));
        const ru = Math.min(u - nu, Math.round(u * .09 * jit(.4)));
        ds_reports.push({
          section: 'rts', grain, bucket, dashboard_id: id,
          users: u, new_users: nu, react_users: ru, ret_users: u - nu - ru,
          views: Math.round(u * (2.2 + R() * 2.4)),
        });
      });
    });
  });

  /* ----------------------------------------------------------------------
     Группы отчётов: коллекция и владелец («мои отчёты»).
     В бою это тот же запрос с GROUP BY collection | owner — уникальные
     пользователи считаются COUNT(DISTINCT user_id) по группе. Здесь сумма
     по отчётам умножается на коэффициент пересечения аудиторий: чем больше
     отчётов в группе, тем чаще один человек встречается в нескольких.
     Просмотры складываются точно — они аддитивны.
     -------------------------------------------------------------------- */
  const GROUP_KEYS = { collection: COLLECTIONS, owner: OWNERS };

  (function buildGroups() {
    const idxRts = {}, idxRep = {}, idxFrq = {};
    ds_reports.forEach((r) => {
      if (r.section === 'rts') (idxRts[r.grain + '|' + r.bucket] = idxRts[r.grain + '|' + r.bucket] || []).push(r);
      else if (r.section === 'report') (idxRep[r.grain] = idxRep[r.grain] || []).push(r);
      else if (r.section === 'rfreq') (idxFrq[r.grain] = idxFrq[r.grain] || []).push(r);
    });

    Object.keys(GROUP_KEYS).forEach((gk) => {
      GROUP_KEYS[gk].forEach((gv) => {
        const mine = reportMeta.filter((m) => (gk === 'collection' ? m.collection : m.owner_login) === gv);
        if (!mine.length) return;
        const ids = {};
        mine.forEach((m) => { ids[m.dashboard_id] = 1; });
        const dedup = 1 / (1 + .16 * Math.log(1 + mine.length));

        Object.keys(GRAINS).forEach((grain) => {
          const reps = (idxRep[grain] || []).filter((r) => ids[r.dashboard_id]);
          const S = (f) => reps.reduce((a, b) => a + b[f], 0);
          const gUsers = Math.round(S('users') * dedup);
          ds_reports.push({
            section: 'gkpi', grain, group_key: gk, group_val: gv, reports: reps.length,
            users: gUsers,
            users_prev: Math.round(S('users_prev') * dedup),
            views: S('views'), views_prev: S('views_prev'),
            new_users: Math.round(S('new_users') * dedup),
            new_users_prev: Math.round(S('new_users_prev') * dedup),
            regular_users: Math.round(S('regular_users') * dedup),
            regular_users_prev: Math.round(S('regular_users_prev') * dedup),
            sleeping_users: Math.round(gUsers * (.15 + R() * .06)),
            last_view_days: Math.min.apply(null, reps.map((r) => r.last_view_days)),
          });

          buckets(grain).forEach((bucket) => {
            const rows = (idxRts[grain + '|' + bucket] || []).filter((r) => ids[r.dashboard_id]);
            const s = (f) => Math.round(rows.reduce((a, b) => a + b[f], 0) * dedup);
            const u = s('users'), nu = Math.min(u, s('new_users'));
            const ru = Math.min(u - nu, s('react_users'));
            ds_reports.push({
              section: 'gts', grain, bucket, group_key: gk, group_val: gv,
              users: u, new_users: nu, react_users: ru, ret_users: u - nu - ru,
              views: rows.reduce((a, b) => a + b.views, 0),
            });
          });

          const fr = (idxFrq[grain] || []).filter((r) => ids[r.dashboard_id]);
          FREQ.forEach((fb) => {
            ds_reports.push({
              section: 'gfreq', grain, group_key: gk, group_val: gv, freq_bucket: fb,
              users: Math.round(fr.filter((r) => r.freq_bucket === fb).reduce((a, b) => a + b.users, 0) * dedup),
            });
          });
        });
      });
    });
  })();

  /* ----------------------------------------------------------------------
     Закрепляемость ОТЧЁТА: когорты по месяцу первого визита именно в него.
     Тянется отдельным запросом по выбранному отчёту (⟳): держать в браузере
     куб «отчёт × когорта × возраст» по всем отчётам нельзя — это миллионы
     строк. Возраст начинается с 1: столбец «старт» — это всегда 100% и та же
     самая когорта, смотреть в нём нечего.
     -------------------------------------------------------------------- */
  const _cohCache = {};
  function reportCohorts(dashId) {
    if (_cohCache[dashId]) return _cohCache[dashId];
    const rep = ds_reports.find((r) => r.section === 'report' && r.dashboard_id === dashId && r.grain === 'm');
    const r2 = rng(dashId + 4242);
    const now = new Date(MAX_DATE);
    const N = 12;
    const out = [];
    for (let c = N - 1; c >= 0; c--) {                      // c — сколько месяцев назад
      const cm = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - c, 1);
      /* Когорты за 12 месяцев в сумме должны давать порядок годовой
         аудитории отчёта, а не кратно её превышать. */
      const size = Math.max(4, Math.round(rep.users * (.055 + r2() * .055) * (1 + (N - c) * .03)));
      const cells = [];
      for (let age = 1; age <= c; age++) {
        const base = .47 * Math.pow(age, -.3) * (1 + (r2() - .5) * .26) * (1 + (N - c) * .004);
        cells.push({
          age,
          active: Math.round(size * Math.max(0, Math.min(1, base))),
          partial: age === c,                               // последний наблюдаемый месяц ещё не закрыт
        });
      }
      out.push({ cohort_month: cm, size, cells });
    }
    _cohCache[dashId] = out;
    return out;
  }

  /* Та же форма для Proteus целиком — когда отчёт не выбран */
  function globalCohorts() {
    const byM = {};
    ds_overview.forEach((r) => {
      if (r.section !== 'cohort' || r.age < 1) return;
      (byM[r.cohort_month] = byM[r.cohort_month] || { cohort_month: r.cohort_month, size: r.cohort_size, cells: [] })
        .cells.push({ age: r.age, active: r.active_users, partial: false });
    });
    const all = Object.values(byM).sort((a, b) => a.cohort_month - b.cohort_month);
    const last = all.slice(-12);
    const now = new Date(MAX_DATE);
    last.forEach((c) => {
      const d = new Date(c.cohort_month);
      // незакрыт ровно тот месяц, который совпадает с текущим: возраст = расстоянию до max_date
      const openAge = (now.getUTCFullYear() - d.getUTCFullYear()) * 12 + (now.getUTCMonth() - d.getUTCMonth());
      c.cells.sort((a, b) => a.age - b.age);
      c.cells = c.cells.filter((x) => x.age <= 11);
      c.cells.forEach((x) => { x.partial = x.age === openAge; });
    });
    return last;
  }

  /* ======================================================================
     ДАТАСЕТ 3 — ds_audience   (вкладка «Аудитория отчёта»)
     Единственное место, где отчёт — СЕРВЕРНЫЙ фильтр: тянуть пофамильные
     списки сразу по всем отчётам незачем. Внутри выбранного отчёта всё
     переключается клиентски.
     ==================================================================== */
  const AD_GROUPS = ['proteus_retail_analytics', 'proteus_risk_all', 'proteus_finance_core', 'tableau_all_employees', 'proteus_tech_dept', 'proteus_msb_sales', 'proteus_support_leads'];
  const WIDE_GROUPS = { tableau_all_employees: true };          // «широкая» — почти весь банк
  const NAMES_F = ['Анна', 'Дмитрий', 'Мария', 'Кирилл', 'Наталья', 'Сергей', 'Елена', 'Роман', 'Игорь', 'Полина', 'Артём', 'Ольга', 'Павел', 'Ирина', 'Максим'];
  const NAMES_L = ['Петрова', 'Соколов', 'Иванова', 'Орлов', 'Лебедева', 'Морозов', 'Волкова', 'Казанцев', 'Гусев', 'Новикова', 'Зайцев', 'Крылова', 'Ершов', 'Титова', 'Белов'];

  const audienceMeta = {};
  reportMeta.forEach((m, i) => {
    const mode = i % 5 === 0 ? 'acl' : (i % 7 === 3 ? 'wide' : 'ad');
    const groups = mode === 'wide'
      ? ['tableau_all_employees']
      : [AD_GROUPS[i % (AD_GROUPS.length - 1)], (i % 3 === 0 ? AD_GROUPS[(i + 2) % (AD_GROUPS.length - 1)] : null)].filter(Boolean);
    audienceMeta[m.dashboard_id] = {
      dashboard_id: m.dashboard_id,
      audience_type: mode === 'acl' ? 'acl' : 'ad',
      is_wide: mode === 'wide',
      ad_groups: mode === 'acl' ? [] : groups,
      acl_logins_cnt: mode === 'acl' ? Math.round(30 + R() * 260) : 0,
    };
  });

  /* Пофамильный список ЦА строится лениво и детерминированно по id отчёта */
  const _audCache = {};
  function audiencePersons(dashId) {
    if (_audCache[dashId]) return _audCache[dashId];
    const rep = ds_reports.find((r) => r.section === 'report' && r.dashboard_id === dashId && r.grain === 'd');
    const meta = audienceMeta[dashId];
    const r2 = rng(dashId);
    const size = meta.is_wide ? 9400 + Math.round(r2() * 2000)
      : (meta.audience_type === 'acl' ? meta.acl_logins_cnt : Math.round(rep.audience_size * (1 + r2() * .35)));
    const cap = Math.min(size, 900);                      // в макете рисуем выборку
    const reachTarget = meta.is_wide ? .07 : rep.reached_share;
    const out = [];
    for (let i = 0; i < cap; i++) {
      const fn = NAMES_F[Math.floor(r2() * NAMES_F.length)];
      const ln = NAMES_L[Math.floor(r2() * NAMES_L.length)];
      const came = r2() < reachTarget;
      const activeDays = came ? 1 + Math.floor(Math.pow(r2(), 1.9) * 21) : 0;
      let segment;
      if (!came) segment = 'Не заходил';
      else if (activeDays >= 8) segment = 'Постоянный';
      else if (activeDays >= 2) segment = 'Эпизодический';
      else segment = 'Разовый';
      const lastAgo = came ? Math.floor(Math.pow(r2(), 2) * 34) : null;
      out.push({
        section: 'person', dashboard_id: dashId,
        login: (fn[0] + '.' + ln).toLowerCase().replace('ё', 'e'),
        fio: fn + ' ' + ln,
        lvl3: CUTS.lvl3.vals[Math.floor(r2() * CUTS.lvl3.vals.length)],
        lvl4: CUTS.lvl4.vals[Math.floor(r2() * CUTS.lvl4.vals.length)],
        stream: CUTS.stream.vals[Math.floor(r2() * CUTS.stream.vals.length)],
        spec: CUTS.spec.vals[Math.floor(r2() * CUTS.spec.vals.length)],
        exp: CUTS.exp.vals[Math.floor(r2() * CUTS.exp.vals.length)],
        is_head: r2() < .14 ? 1 : 0,
        came: came ? 1 : 0,
        active_days: activeDays,
        views: came ? activeDays * (1 + Math.round(r2() * 3)) : 0,
        last_visit_days: lastAgo,
        segment,
        sample_of: size,
      });
    }
    _audCache[dashId] = out;
    return out;
  }

  /* Приход аудитории по бакетам: сколько человек пришло ВПЕРВЫЕ + накопленный
     охват. Накопленная кривая обязана сойтись с карточкой «Дошли»: это одни
     и те же люди, поэтому итог передаётся снаружи (opt.total). */
  function audienceReach(dashId, grain, opt) {
    const rep = ds_reports.find((r) => r.section === 'report' && r.dashboard_id === dashId && r.grain === grain);
    const bs = buckets(grain);
    const r2 = rng(dashId + 991);
    const isNew = rep.is_new;
    const total = Math.max(1, Math.round((opt && opt.total != null) ? opt.total : rep.users));
    const w = bs.map((b, i) => {
      if (isNew && grain === 'd') return Math.max(.02, Math.exp(-Math.pow(i - 12, 2) / 26)); // всплеск рассылки
      return .4 + r2() * .6 + (i / bs.length) * .4;
    });
    const a = alloc(total, w);
    let cum = 0;
    return bs.map((b, i) => { cum += a[i]; return { bucket: b, first_time: a[i], cum_reach: cum }; });
  }

  /* ============================== Экспорт ================================ */
  global.PA_DATA = {
    MAX_DATE, GRAINS, CUTS, CUT_KEYS, FREQ,
    ds_overview, ds_reports,
    reportMeta, audienceMeta, audiencePersons, audienceReach,
    reportCohorts, globalCohorts,
    buckets,
    WIDE_GROUPS,
    HC_TOTAL: HC_TOTAL_REF,
    OWNERS, COLLECTIONS, AD_GROUPS, GROUP_KEYS,
  };
})(window);
