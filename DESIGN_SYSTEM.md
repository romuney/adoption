# TeamPulse — дизайн-система отчётов

Один файл со всей дизайн-системой: токены, компоненты, правила визуализации,
подсказки, доступность, тон текста. Готов к подаче на вход нейросети как
системный промпт для генерации HTML-отчётов и дашбордов.

Проверено на живом макете: HR-борд из 8 экранов, 19 метрик, 13 видов графиков,
96 автоматических проверок правил. Всё, что здесь написано, там работает.

---

## 0. Как этим пользоваться

**Если вы LLM и вам дали этот файл — читайте так:**

> Ты генерируешь HTML-отчёт (дашборд, аналитическую страницу, one-pager).
> Ниже — дизайн-система, которой обязан соответствовать результат.
> Раскладка может быть любой: фильтры где угодно, вкладки где угодно, набор
> блоков любой. Неизменны токены, компоненты, механика подсказок, правила
> визуализации данных, доступность и тон текста.
>
> Работай так:
> 1. Скопируй блок `:root` из раздела 2 целиком, без правок значений.
> 2. Собирай интерфейс из компонентов раздела 4. Нужного компонента нет —
>    собери новый **из токенов**, а не из значений «на глаз».
> 3. Любые графики — по правилам раздела 6. Ось всегда от нуля.
> 4. Подсказки — только механизмом из раздела 5. Атрибут `title=` запрещён.
> 5. Числа форматируй по разделу 7, текст пиши по разделу 10.
> 6. Перед выдачей прогони себя по чек-листу раздела 12.
>
> Правила ниже помечены так:
> **[ЯДРО]** — нарушать нельзя, это и есть дизайн-система.
> **[ПРОДУКТ]** — решение конкретного отчёта, переносится по смыслу.

**Если вы человек** — раздел 13 даёт готовый скелет страницы: скопировали,
вставили своё содержимое, дизайн-система уже внутри.

---

## 1. Принципы

Восемь правил, из которых выведено всё остальное. Когда система молчит
о вашем случае — решайте по ним.

1. **Меньше решений — больше системы.** Семь кеглей вместо двадцати одного,
   пять радиусов вместо четырнадцати, две шкалы цвета вместо трёх. Разница
   в полпикселя не читается как иерархия — она читается как неаккуратность.
2. **Один смысл — один способ показать.** Если направление изменения кодирует
   знак, стрелка не нужна. Если значение подписано у точки — ось Y не нужна.
   Дублирование заставляет сверять две кодировки между собой.
3. **Цвет — это сигнал, а не украшение.** Цветов-сигналов ровно два: зелёный
   и красный. Всё остальное серое. Третий сигнальный цвет заставляет выбирать,
   к какому из них присматриваться.
4. **Данные не искажаются вёрсткой.** Ось от нуля, одна шкала на сравниваемые
   величины, полоса растёт от общего левого края.
5. **Значение читается без наведения.** Наведение добавляет контекст, а не
   раскрывает основное.
6. **Интерактивность видна до клика.** Каретка у раскрываемой строки,
   ховер у кликабельной. Курсор-указатель признаком не считается: его не видно,
   пока не наведёшь, а наводить незачем, если не ждёшь, что что-то откроется.
7. **Допущения помечены честно.** Данные придуманы — сноска. Метрика
   не сравнивается — так и написано, а не прочерк.
8. **Пустое состояние ничего не сообщает — его нет.** Плашка «ничего
   не выбрано» занимает строку и не несёт информации.

---

## 2. Токены

Копировать в `:root` целиком. Значения менять нельзя — на них завязаны
компоненты. Добавлять новые токены можно, брать «на глаз» — нет.

```css
:root{
  /* ---------- Поверхности и текст ---------- */
  --bg:#f4f5f7;        /* фон страницы */
  --card:#ffffff;      /* фон карточки, панели, таблицы */
  --line:#e7e9ee;      /* граница компонента */
  --line2:#eef0f3;     /* граница внутри компонента: строки таблиц, разделители */
  --ink:#1f1f1f;       /* основной текст, значения */
  --ink2:#3a3f4a;      /* вторичный текст, тело таблиц */
  --muted:#8a909c;     /* подписи, шапки колонок */
  --muted2:#aab0bb;    /* третьестепенное: сноски в шапках, разделители крошек */

  /* ---------- Светофор: ровно два сигнала ---------- */
  --green:#12b048; --green-bg:#bff2cd; --green-tx:#0a8f3c;
  --red:#f51f1f;   --red-bg:#ffcccc;   --red-tx:#d11414;
  /* Жёлтый в светофоре ЗАПРЕЩЁН. Он есть только для severity AI-плашек. */
  --warn:#f59300;  --warn-bg:#ffe6a0;  --warn-tx:#9a6500;

  /* ---------- Акцент и служебное ---------- */
  --blue:#3b6fe0;  --blue-bg:#eef3fe;  --act:#2b6cff;   /* --act: активное состояние */
  --ai:#6f4ed8;    --ai-bg:#f2eefc;    --ai-tx:#5334c4; /* только AI-подсказки */
  --bench:#9aa0ac;                                       /* база сравнения */

  /* ---------- Расстояния: десять ступеней ---------- */
  --s1:2px;  --s2:4px;  --s3:6px;  --s4:8px;  --s5:10px;
  --s6:12px; --s7:14px; --s8:16px; --s9:20px; --s10:24px;

  /* ---------- Типографика: семь ролей ---------- */
  --fs-micro:9.5px;  /* служебные подписи в плотных таблицах */
  --fs-cap:10.5px;   /* шапки колонок, подписи осей, надзаголовки */
  --fs-note:11.5px;  /* сноски, пояснения, подписи в карточках */
  --fs-body:12.5px;  /* основной текст таблиц */
  --fs-lead:13.5px;  /* имена строк и метрик, значения в подсказке */
  --fs-head:16px;    /* заголовки блоков */
  --fs-hero:24px;    /* главное число карточки */

  /* ---------- Радиусы: пять ступеней плюс пилюля ---------- */
  --r1:3px; --r2:6px; --r3:9px; --r4:12px; --r5:16px; --r-pill:999px;
  --radius:var(--r4);      /* радиус по умолчанию: карточки, панели */
  --pad-cell:var(--s5);    /* единый левый край текста в ячейках таблиц */

  /* ---------- Тени: ровно две ---------- */
  --shadow:0 1px 3px rgba(20,28,45,.06),0 4px 16px rgba(20,28,45,.04);
  --shadow-lg:0 8px 28px rgba(20,28,45,.16);   /* только модалки и всплывающие панели */

  /* ---------- Геометрия ---------- */
  --head-h:51px;       /* высота липкой шапки приложения */
  --chart-gap:26px;    /* расстояние между двумя графиками в стопке */
}
```

### Как пользоваться шкалами **[ЯДРО]**

- **Отступ, кегль, радиус берутся из шкалы.** Понадобилось 13px — это `--s6`
  (12px) или `--s7` (14px), а не новое значение. Отступы 7, 9, 13, 17 пикселей
  рядом читаются как одно и то же, но не совпадают: это шум, а не иерархия.
- **`--chart-gap` намеренно вне шкалы расстояний.** Это не отступ вёрстки,
  а зеркало константы геометрии графиков (`STACK_GAP` в рисовальном коде).
  Расстояние между панелями внутри одного SVG и между двумя соседними SVG
  обязано быть одинаковым — иначе на соседних вкладках одинаковый по смыслу
  зазор выглядит разным.
- **Цвета живут только в `:root` и в рисовальном слое.** Литеральный `#rrggbb`
  в разметке экрана — ошибка. Проверяется грепом.

### Четыре веса **[ЯДРО]**

```css
--fw-body:400;  /* данные: числа в ячейках, доли, пояснения, сноски */
--fw-med:500;   /* второй план: дочерние строки, подписи под значением */
--fw-lead:600;  /* по чему ведут взглядом: имя строки, шапка колонки, контролы */
--fw-bold:700;  /* на что нужно смотреть: заголовки, итоги, главное число */
```

**Жирным набрано не всё.** Самая частая ошибка в отчётных интерфейсах: имя
строки полужирное, число полужирное, подпись полужирная, итог ещё жирнее —
и выделять становится нечем, потому что выделено всё. Числа в таблице — это
данные, их много, и читаются они подряд: сравнивать помогает выравнивание по
разряду, а не насыщенность. Вес несёт иерархию, а не важность вообще.

Восьмисотого веса в системе нет. Рядом с 700 он даёт не ступень, а шум:
разницу видно, только если поставить образцы вплотную.

### Шрифт **[ЯДРО]**

```css
body{font-family:Inter,Helvetica,Arial,sans-serif;font-size:14px;
     background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased;margin:0}
*{box-sizing:border-box}
button{font-family:inherit}
```

Inter, начертания 400 / 600 / 700 / 800. Деградация до Helvetica/Arial заложена
в стек намеренно: автономный файл без интернета обязан выглядеть прилично.
Подключение (в автономной сборке эта ссылка вырезается):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
```

Иконочных шрифтов нет. Все иконки — инлайн-SVG или юникод-символы
(`▸ ▾ ▲ ▼ ↓ ↑ ×`). Символ `↗` запрещён: он берётся из шрифта и в разных
начертаниях выходит то мелким, то съехавшим по базовой линии — вместо него
инлайн-SVG.

---

## 3. Цвет: три независимые шкалы

Путать их нельзя. У каждой свой смысл и своя область применения.

### 3.1. Светофор — оценка **[ЯДРО]**

| Состояние | Фон | Текст | Значит |
|---|---|---|---|
| `good` | `--green-bg` | `--green-tx` | лучше базы / в цели |
| `bad` | `--red-bg` | `--red-tx` | хуже базы / за порогом |
| `warn` | `#f3f4f6` | `--muted` | на уровне ±5% / зона риска |
| `neutral` | `#f3f4f6` | `--muted` | оценки нет |

**Жёлтого в светофоре нет.** Состояние `warn` в логике остаётся — от него
зависят подписи «на уровне» и «зона риска», — но красится серым, тем же, что
`neutral`. Причина: жёлтая пилюля рядом с жёлтым баром заставляет присматриваться
туда, где повода вмешиваться нет. Три сигнальных цвета на экране заставляют
руководителя решать, к какому из них присматриваться, — и это работа,
которой у него быть не должно.

Серый читается однозначно: **повода вмешиваться нет.**

На графиках светофор берёт тона между фоном пилюли и её текстом — чтобы бар
на белом читался, но оставался в том же бледном семействе, что пилюля рядом:

```
good #80cf9a   bad #ef8c8c   flat/neutral #c7c8cc
```

### 3.2. Потоки — категории, а не оценка **[ПРОДУКТ]**

Гамма для потоков сущностей (пришло / ушло / перешло / всего). **Это не оценка:**
увольнение сиреневое, а не красное, именно чтобы не читаться как «плохо».

```
приход/найм      #97dece   (насыщенный #0ea293, внутренний #009dae)
уход/увольнение  #ac87c5
перевод внутрь   #85cdfd
перевод наружу   #3c84ab
итог/численность #c7c8cc
прочее           #686d76
```

**Одна гамма на весь отчёт.** Если приход зелёный в балансе, он зелёный
и в водопаде, и в воронке. Приглушённых дублей для «того же, но в другом месте»
не заводим: расхождение читается как разные сущности.

### 3.3. Служебные каналы

- **Акцент интерфейса** — сине-фиолетовый: `--act` для активного состояния,
  `--blue` / `--blue-bg` для ссылок, чипов, выделенной строки.
- **AI-подсказки** — фиолетовый `--ai` / `--ai-bg` / `--ai-tx`. Только там.
- **Severity плашки инсайта** — high / mid / good, и **вот здесь жёлтый
  разрешён** (`--warn-bg`): это другой канал, не светофор метрики.

**Тёплого пятна в интерфейсе не больше одного.** Если в системе есть маскот
или фирменный акцент другой температуры — он живёт в своих местах и в кнопки
не идёт.

---

## 4. Компоненты

Каждый компонент — готовый CSS плюс разметка. Собирайте страницу из них.

### 4.1. Кнопки **[ЯДРО]**

```css
.btn{border:1px solid var(--line);background:#fff;border-radius:var(--r3);
  padding:8px 14px;font-weight:600;color:var(--ink2);cursor:pointer;font-size:13px;
  display:inline-flex;align-items:center;gap:7px;transition:background .15s,border-color .15s}
.btn:hover{background:#fafbfc;border-color:#d8dce4}
.btn.primary{background:var(--act);border-color:var(--act);color:#fff}
.btn.primary:hover{background:#1b5cf0}
.btn.ghost{border-color:transparent;color:var(--blue)}
.btn.ghost:hover{background:var(--blue-bg)}
.btn.xs{padding:3px 6px;min-width:24px;font-size:11px}
```

Одна главная кнопка на экран или на модалку. Остальные — обычные и ghost.

### 4.2. Чипы фильтров **[ЯДРО]**

```css
.chips{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.chip{display:inline-flex;align-items:center;gap:7px;border-radius:var(--r-pill);
  padding:5px 12px;font-size:12px;font-weight:700;
  background:var(--blue-bg);color:#2b5fd0;border:1px solid #dbe6fd}
.chip .x{width:14px;height:14px;border-radius:50%;border:0;padding:0;cursor:pointer;
  background:rgba(43,95,208,.14);color:#2b5fd0;font-size:11px;line-height:1;
  display:inline-flex;align-items:center;justify-content:center}
.chip .x:hover{background:rgba(43,95,208,.28)}
.chip.bench{background:#f4f5f7;color:var(--ink2);border-color:var(--line)}
.chip.bench b{color:var(--ink)}
```

```html
<span class="chip">Покраска: HQ<button class="x" data-unchip="paint">×</button></span>
<span class="chip bench">Сравнение: <b>всё HQ IT</b></span>
```

Синий чип — активный фильтр, его можно снять. Серый — контекст (база сравнения,
размер выборки), снять нельзя. **Чипа «ничего не выбрано» не существует.**

### 4.3. KPI-карточка и выравнивание полосы **[ЯДРО]**

Самая частая ошибка генерации: карточки в полосе разной высоты, и значения
съезжают друг относительно друга. Решается subgrid'ом, а не подбором высот.

```css
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(176px,1fr));
  gap:14px;margin-bottom:18px}
.kpis.n1{grid-template-columns:minmax(0,260px)}
.kpis.n2{grid-template-columns:repeat(2,minmax(0,1fr))}
.kpis.n3{grid-template-columns:repeat(3,minmax(0,1fr))}
.kpis.n4{grid-template-columns:repeat(4,minmax(0,1fr))}
.kpis.n5{grid-template-columns:repeat(5,minmax(0,1fr))}
.kpis.compact{gap:12px;margin-bottom:16px}
.kpis.compact .kpi{padding:13px 15px}
.kpis.compact .k-val{font-size:var(--fs-hero)}

.kpi{background:#fff;border-radius:var(--radius);box-shadow:var(--shadow);padding:15px 17px}
.kpi .k-label{font-size:var(--fs-note);color:var(--muted);font-weight:700;
  margin-bottom:7px;display:flex;align-items:center;gap:6px}
.kpi .k-val{font-size:27px;font-weight:800;letter-spacing:-.6px;line-height:1.1}
.kpi .k-row{display:flex;align-items:center;gap:9px;margin-top:8px;flex-wrap:wrap}
.kpi .k-row:empty{margin:0}
.kpi .k-sub{font-size:var(--fs-note);color:var(--muted);font-weight:600}

/* Одна высота строк во всей полосе: карточка — subgrid на четыре строки родителя.
   Перенос заголовка в одной карточке добавляет строку ВСЕМ, зато значения,
   дельты и подписи базы остаются на одном уровне.
   @supports обязателен: без subgrid карточка должна остаться обычным блоком. */
@supports (grid-template-rows:subgrid){
  .kpi{display:grid;grid-template-rows:subgrid;grid-row:span 4;row-gap:0}
}
```

```html
<div class="kpis compact n4">
  <div class="kpi">
    <div class="k-label">Текучесть месячная<span class="info" data-tip="…">i</span></div>
    <div class="k-val">1,8%</div>
    <div class="k-row"><span class="delta up">−0,3 п.п.<span class="d-vs">к маю</span></span></div>
    <div class="k-row"><span class="k-sub">база 2,1%</span></div>
  </div>
  <!-- … -->
</div>
```

**Карточка рисует РОВНО ЧЕТЫРЕ строки всегда**, даже если четвёртая пустая:
`<div class="k-row"></div>`. Иначе выравнивать нечего. Пустая строка воздуха
не занимает — это делает `.k-row:empty{margin:0}`.

Размен выбран осознанно: лишняя строка воздуха приемлема, съехавшие цифры — нет.

### 4.4. Панель **[ЯДРО]**

```css
.panel{background:#fff;border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}
.panel-h{padding:var(--s7) var(--s8);font-weight:700;font-size:14.5px;
  border-bottom:1px solid var(--line2);display:flex;align-items:center;
  justify-content:space-between;gap:12px}
.panel-h .sub{font-size:var(--fs-note);color:var(--muted);font-weight:600}
.panel-h .h-txt{display:flex;flex-direction:column;gap:2px;min-width:0}
.panel-h.with-tabs{flex-wrap:wrap;row-gap:10px}
.panel-h .sub-tabs{margin:0 0 0 auto;flex:0 0 auto}
.panel-h .sub-tabs .sub-tab{padding:6px 12px;font-size:12px}
.panel-b{padding:var(--s7) var(--s8)}
```

Переключатели содержимого панели живут **в её шапке справа** — там, где
меняется то, что они переключают, а не в отдельной полосе над панелью.

### 4.5. Таблицы **[ЯДРО]**

Три разновидности с общей типографикой. **Тело — `--fs-body`, шапки — `--fs-cap`.**
Набирать тело кеглем сносок нельзя: это главное содержимое отчёта, а 9,5–11,5px
ниже нижней границы Material, Apple HIG и Fluent. **Все таблицы одного экрана —
одного кегля**: разные размеры в двух колонках читаются как ошибка.

```css
/* --- Сводная таблица --- */
.ptable{width:100%;border-collapse:collapse;font-size:var(--fs-body)}
.ptable th{font-size:var(--fs-cap);text-transform:uppercase;letter-spacing:.2px;
  color:var(--muted);font-weight:700;text-align:right;padding:var(--s5) var(--s4);
  border-bottom:1px solid var(--line2);white-space:nowrap}
.ptable th.txt{text-align:left;padding-left:var(--pad-cell)}
.ptable td{text-align:right;padding:var(--s4);font-weight:600;
  border-bottom:1px solid var(--line2);white-space:nowrap}
.ptable td.txt{text-align:left;font-weight:700;padding-left:var(--pad-cell)}
.ptable tr.urow{cursor:pointer}
.ptable tr.urow:hover{background:#fafbfc}
.ptable tr.urow.sel{background:#f5f8ff;box-shadow:inset 3px 0 0 var(--act)}
.ptable tr.total td{border-top:2px solid var(--line);border-bottom:0;
  font-weight:800;background:#fafbfc}
.unit-sub{display:block;font-size:var(--fs-cap);color:var(--muted);
  font-weight:600;margin-top:1px}

/* Плотный вариант для рабочей зоны */
.ptable.dense{font-size:var(--fs-body)}
.ptable.dense th{padding:8px 6px;font-size:var(--fs-cap)}
.ptable.dense td{padding:7px 6px}
.ptable.dense td.lead{font-weight:800;color:var(--ink)}
.ptable.dense .vs{border-left:1px solid var(--line2)}

/* ИТОГО первой строкой + липкая шапка: итог не уезжает под скролл */
.ptable.dense thead th{position:sticky;top:0;z-index:3;background:#fff}
.ptable tr.total.top td{position:sticky;top:29px;z-index:2;border-top:0;
  border-bottom:2px solid var(--line);background:#fafbfc}

/* Цветная ячейка сравнения */
.cell{margin:3px;border-radius:var(--r3);padding:7px 4px;font-weight:700;
  font-size:var(--fs-body);line-height:1.15}
.cell.good{background:var(--green-bg);color:var(--green-tx)}
.cell.bad{background:var(--red-bg);color:var(--red-tx)}
.cell.warn,.cell.neutral{background:#f3f4f6;color:var(--ink2)}
```

**Числовые колонки — по правому краю.** Числа сравниваются по разряду.
Колонки-«карточки» (спарклайн, пилюля сравнения) — по центру своей колонки,
а не по правому краю: иначе весь запас ширины собирается в один провал слева.

**Каретка раскрытия — своя колонка**, не приклеена к тексту:

```css
.caret-btn{display:inline-flex;align-items:center;justify-content:center;
  width:23px;height:23px;margin-right:7px;border:0;background:transparent;
  border-radius:var(--r2);color:var(--ink2);font-size:12px;cursor:pointer;
  transition:transform .16s,background .15s,color .15s;flex:0 0 auto}
.caret-btn:hover{background:#e7edf7;color:var(--act)}
.caret-btn[data-open]{color:var(--act)}
.caret-spacer{display:inline-block;width:23px;margin-right:7px;flex:0 0 auto}
.ptable td.txt .row-label{display:flex;align-items:flex-start}
.ptable td.txt .row-body{min-width:0}
```

Строки без детей получают `.caret-spacer` — тогда имена стоят на одной вертикали
с теми, у кого каретка есть. **У строки ИТОГО каретка раскрывает и сворачивает
всё дерево разом**: раскрывать десяток строк по одной — работа, которую итог
делает одним кликом.

### 4.6. Разбивка по атрибуту — таблица с полосой в ячейке **[ЯДРО]**

Кольцевые диаграммы и горизонтальные бар-чарты для разбивок **запрещены**.
Доля читается по числу точнее, чем по углу сектора, а таблица заодно даёт
абсолютное значение.

```css
.btable td.barcell,.btable th.bar-th{text-align:left;padding-left:var(--pad-cell)}
.cellbar{display:block;width:100%;height:13px;background:#f1f3f6;
  border-radius:var(--r1);overflow:hidden;cursor:help}
.cellbar i{display:block;height:100%;border-radius:var(--r1);
  background:var(--act);min-width:2px}
.btable tr.total td{border-bottom:0}
```

```html
<table class="ptable btable">
  <colgroup><col style="width:34%"><col style="width:14%"><col style="width:11%"><col></colgroup>
  <thead><tr><th class="txt">Причина</th><th>Человек</th><th>Доля</th>
    <th class="txt bar-th">Распределение</th></tr></thead>
  <tbody>
    <tr><td class="txt"><span class="row-body">Зарплата</span></td>
        <td class="lead">14</td><td>31%</td>
        <td class="barcell" data-tip="…"><span class="cellbar"><i style="width:100.0%"></i></span></td></tr>
    <tr class="total"><td class="txt">ИТОГО</td><td class="lead">45</td>
        <td>100%</td><td class="barcell"></td></tr>
  </tbody>
</table>
```

Правила полосы: **растёт от левого края** (общий старт у всех строк, длины
сравниваются глазом), масштаб **от нуля до максимума по столбцу**, сортировка
по убыванию. Колонка «Доля» и строка ИТОГО убираются, если метрика процентная:
доля одного процента в сумме процентов ничего не значит.

**ИТОГО — первая строка, во всех таблицах отчёта одинаково.** Не «сверху в
одной, снизу в другой»: пользователь не должен искать итог заново на каждом
экране. Сначала итог, потом из чего он сложился. Липкой строку итога делают
только там, где список длинный и прокручивается; в короткой таблице от неё
берут только вид — линия под итогом, а не над ним.

**Таблица не повторяет своё название в шапке первой колонки.** Если прямо над
таблицей стоит её имя (заголовок группы, заголовок панели), шапка первой
колонки пустая: «Грейд», а под ним сразу «ГРЕЙД» — одно и то же дважды подряд.
Подписывают только колонки, чьё имя добавляет смысл: что за число и в чём оно.

**Цвет полос внутри одной таблицы — ОДИН.** Величину несёт длина; раскрасить
строки в разные цвета — закодировать то же самое второй раз, и цвет начинает
выглядеть смыслом, которого в нём нет. Разными цветами различаются не строки,
а ТАБЛИЦЫ: своя гамма у каждой группы разбивок, и по цвету полос видно, на
какой вкладке стоишь, не читая заголовок. Исключение одно: если цвет несёт
собственный признак строки (нежелательный уход, выходной день), он остаётся —
но тогда этот признак обязан быть назван в легенде или пометкой в строке.

**Двухуровневая разбивка.** Когда у категории есть свои подкатегории, второй
уровень не выносится отдельной таблицей рядом, а раскрывается кареткой в той же
строке — разметкой и поведением сводной таблицы (`row-label` + `caret-btn`,
дочерние строки с классом `lvl2`). Два требования, без которых уровни разъедутся:

- **Сумма детей равна родителю.** Округлять уровни независимо нельзя: раскрытая
  каретка покажет строки, которые в сумме не дают строку над ними. Округление
  идёт сверху вниз — родители к итогу, дети к уже округлённому родителю.
- **ИТОГО считается по верхнему уровню.** Дети уже учтены в родительской
  строке; сложить всё подряд — удвоить итог.
- **Общая каретка обязательна** — см. правило ниже.

### 4.6a. Матрица: два разреза на одних осях **[ЯДРО]**

Когда одной разбивки мало («а по грейдам девушки и мальчики стоят одинаково?»),
две таблицы подряд не помогают — их приходится сличать глазами. Матрица ставит
разрезы на одни оси, и ответ читается строкой и столбцом.

Это **по-прежнему таблица**: число в клетке, заливка только помогает найти
взглядом, где густо. Шкала заливки — **монохромная, из одного тона, и это НЕ
светофор**: много в клетке не значит «плохо». Тот же приём, что у календарной
тепловой сетки; третьей цветовой шкалы в отчёте не заводится.

```css
.mx-wrap{overflow-x:auto}                       /* скролл ВНУТРИ, не у страницы */
.mxtable{border-collapse:separate;border-spacing:2px;width:100%}
.mxtable th,.mxtable td{border:0;white-space:nowrap}
.mxtable td.txt,.mxtable th.mx-corner{width:100%;position:sticky;left:0;background:#fff}
.mxtable td.mx-cell,.mxtable th.mx-h{width:94px}
.mxtable td.mx-cell{text-align:center;font-weight:700;font-size:var(--fs-body);
  background:#f7f8fa;border-radius:var(--r2);padding:7px 9px;cursor:pointer}
.mxtable td.mx-cell:hover{box-shadow:inset 0 0 0 2px var(--act)}
.mxtable td.mx-cell.zero{background:#fafbfc;color:var(--muted2);font-weight:600}
```

Правила:

- **Колонка названий забирает остаток ширины, клетки стоят своей.** Иначе на
  матрице из двух колонок клетка растягивается на 180px и двузначное число
  тонет в пустоте.
- **Первая колонка липкая**, горизонтальный скролл живёт внутри обёртки:
  страница вбок не едет никогда.
- **Края матрицы обязаны сходиться с одномерными разбивками до единицы.**
  Округлять клетки по отдельности нельзя: итог колонки разойдётся с той же
  категорией на соседней вкладке. Сначала округляются края (метод наибольших
  остатков), потом целые единицы раскладываются по клеткам в порядке убывания
  дробной части. Расхождение в одну единицу дороже, чем кажется: после него
  не верят обеим таблицам.
- **Проценты в строке (в колонке) дают ровно 100** — округляются группой.
- **Пустая клетка — прочерк без заливки**, а не ноль на цветном фоне.

### 4.6b. Срез по клику: перекрёстная фильтрация **[ЯДРО]**

Разбивка отвечает «сколько их», следующий вопрос всегда «а где они». Клик по
строке разбивки берёт **срез**: карточки KPI, сводная таблица и соседние
разбивки пересчитываются по этой категории.

Правила, без которых механика ломается:

- **Срез не действует на ту разбивку, из которой взят.** Иначе таблица
  схлопывается в одну строку и вернуться к другой категории нечем. То же
  и для матрицы: срез по её собственной оси эту ось не режет.
- **Один срез на разрез.** Клик по второй категории того же разреза заменяет
  первую, а не складывается с ней: пересечение двух категорий одного разреза
  пусто по определению. Сколько разных разрезов сложить — дело пользователя,
  искусственного потолка не ставим.
- **Уровни одного разреза считаются совместно, а не перемножаются.**
  «Разработка + Бэкенд» — это бэкендеры, а не пересечение независимых событий.
- **Взятый срез виден там, где меняет цифры** — плашкой рядом с карточками,
  а не только выделением строки, по которой кликнули. Без неё «191 → 59»
  читается как поломка отчёта.
- **Срез не должен протекать за пределы своего экрана.** Если та же величина
  подписана на других вкладках, гейт по экрану обязателен.
- Строка среза оформляется **как строка выбора в сводной таблице** (`.urow`,
  `cursor:pointer`, ховер, `.sel` с врезкой слева): одно состояние «выбрано»
  на весь отчёт, новых правил взаимодействия не заводится.

### 4.6c. Общая каретка «раскрыть / свернуть всё» **[ЯДРО]**

**Если в таблице есть каретки в строках, у неё обязана быть общая.** Раскрывать
десять строк по одной, чтобы увидеть, что внутри, — работа, которую одна кнопка
делает за один клик. Правило действует везде, где появились строчные каретки:
у сводной таблицы, у двухуровневой разбивки, у таблицы метрик с раскрывающимся
графиком. Исключений нет — общая каретка не украшение конкретного экрана.

Куда её ставить: в строку ИТОГО, если она есть (заодно ИТОГО встаёт на ту же
вертикаль, что и названия строк — без каретки оно сдвинуто влево на её ширину),
иначе в шапку над колонкой строчных кареток.

```html
<button class="caret-btn" data-open="1" data-expall="0"
        aria-label="Свернуть всё" data-tip="…">▾</button>
```

Состояние одно: пока раскрыто **не всё** — кнопка предлагает раскрыть (`▸`);
сворачивать (`▾`) — только когда раскрыты все раскрываемые строки. Собирается
одной функцией на все такие таблицы: у разных таблиц одного отчёта эта кнопка
не имеет права выглядеть или вести себя по-разному.

### 4.7. Пилюля изменения **[ЯДРО]**

```css
.delta{display:inline-flex;align-items:center;gap:5px;font-size:var(--fs-note);
  font-weight:700;padding:3px 7px;border-radius:var(--r2);white-space:nowrap;cursor:help}
.delta .d-vs{font-weight:600;font-size:var(--fs-cap);opacity:.72}
.delta.up{background:var(--green-bg);color:var(--green-tx)}
.delta.down{background:var(--red-bg);color:var(--red-tx)}
.delta.flat,.delta.neu{background:#f0f1f3}
.delta.flat{color:var(--muted)}
.delta.neu{color:var(--ink2)}
```

Три жёстких правила:

1. **Направление — знаком, а не стрелкой.** `+7`, `−4`, при нуле просто `0`
   без значка. Стрелка и цвет кодировали один факт дважды, и их приходилось
   сверять: `↓` у текучести — хорошо, `↓` у найма — никак.
2. **Знак отвечает за направление, класс — за оценку.** Рост текучести
   `+1,4 п.п.` получает класс `down` (красный). У метрик, где «больше» не значит
   «лучше», любой знак даёт `neu`.
3. **С чем сравнивается — написано внутри пилюли**: `+3` без подписи читается
   как отклонение от базы. Короткая форма в пилюле («к маю»), полная в шапке
   колонки («к маю 2026») — в строках таблицы месяц повторился бы девятнадцать раз.

Месяц выводится из данных, руками нигде не пишется: при сдвиге окна подписи
едут сами.

### 4.8. Сигнальные чипы и метки **[ЯДРО]**

```css
.sig-chip{display:inline-block;font-size:11px;font-weight:700;padding:3px 8px;
  border-radius:var(--r2);white-space:nowrap}
.sig-chip.good{background:var(--green-bg);color:var(--green-tx)}
.sig-chip.bad{background:var(--red-bg);color:var(--red-tx)}
.sig-chip.warn,.sig-chip.neutral{background:#f3f4f6;color:var(--muted)}

/* Тег «у метрики есть утверждённая цель» — метка, а не оценка. Только синий. */
.kpi-tag{display:inline-block;font-size:9px;font-weight:800;text-transform:uppercase;
  letter-spacing:.3px;padding:2px 6px;border-radius:var(--r2);
  background:var(--blue-bg);color:#2b5fd0}

/* Метрика, которую с базой сравнивать бессмысленно */
.nocmp{display:inline-block;font-size:11px;font-weight:700;color:var(--muted);
  border:1px dashed var(--line);border-radius:var(--r2);padding:2px 8px;
  white-space:nowrap;cursor:help}

/* Блок «ориентир»: база или цель */
.tgt{font-size:var(--fs-note);color:var(--muted);font-weight:600;
  line-height:1.4;white-space:nowrap;text-align:right}
.tgt b{color:var(--ink2);font-weight:700;display:block;font-size:var(--fs-body)}
```

**Метрика без сравнения помечается словами «не сравнивается», а не прочерком.**
Прочерк читается как «данных нет», хотя данные есть — их просто не с чем сравнивать.

### 4.9. Переключатели и элементы управления **[ЯДРО]**

```css
.sub-tabs{display:inline-flex;gap:3px;background:#eef0f3;border-radius:var(--r4);
  padding:3px;margin:0 0 14px}
.sub-tab{border:0;background:transparent;padding:8px 15px;border-radius:var(--r3);
  font-weight:700;font-size:var(--fs-body);color:var(--muted);cursor:pointer;
  display:inline-flex;align-items:center;gap:7px;transition:background .15s,color .15s}
.sub-tab:hover{color:var(--ink2)}
.sub-tab.active{background:#fff;color:var(--ink);box-shadow:var(--shadow)}

.ctl{display:flex;flex-direction:column;gap:5px}
.ctl label{font-size:var(--fs-cap);text-transform:uppercase;letter-spacing:.4px;
  color:var(--muted);font-weight:800}
.ctl select{appearance:none;border:1px solid var(--line);background:#fff;
  border-radius:var(--r3);padding:8px 30px 8px 12px;font-size:13px;color:var(--ink);
  font-weight:600;cursor:pointer;min-width:170px;max-width:100%;text-overflow:ellipsis;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a909c' stroke-width='2.5'><path d='M6 9l6 6 6-6'/></svg>");
  background-repeat:no-repeat;background-position:right 10px center}

.toolbar{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.toolbar .sp{flex:1}

/* Кнопка-опция (выбор одного из набора) */
.opt{border:1px solid var(--line);background:#fff;border-radius:var(--r3);
  padding:8px 14px;font-size:13px;font-weight:700;color:var(--ink2);
  cursor:pointer;transition:all .15s}
.opt:hover{border-color:#c9d3e6;background:#fafbfc}
.opt.on{background:var(--act);border-color:var(--act);color:#fff}
```

Сегментированный переключатель (`.sub-tabs`) — для 2–5 взаимоисключающих видов
одного экрана. Больше пяти — это `<select>`. Стрелка селекта — инлайн-SVG
в `background-image`, а не системная: системная выглядит по-разному в браузерах.

### 4.10. AI-подсказка / инсайт **[ПРОДУКТ]**

```css
.ai{border-radius:var(--radius);margin:14px 0 0;overflow:visible;
  box-shadow:0 1px 2px rgba(20,28,45,.05);
  background:linear-gradient(103deg,#f4efff 0%,#faf8ff 46%,#fcfcfe 100%)}
.ai.sev-high{background:linear-gradient(103deg,#ffeef0 0%,#fdf3f6 38%,#faf7ff 78%,#fcfcfe 100%)}
.ai.sev-mid {background:linear-gradient(103deg,#fff5e3 0%,#fdf6ef 38%,#faf7ff 78%,#fcfcfe 100%)}
.ai.sev-good{background:linear-gradient(103deg,#e9f9ef 0%,#f4f9f6 38%,#faf8ff 78%,#fcfcfe 100%)}
.ai.sev-none{background:linear-gradient(103deg,#f2f4fa 0%,#f8f9fd 46%,#fcfcfe 100%)}
.ai-h{display:flex;align-items:center;gap:10px;padding:12px 15px;cursor:pointer;user-select:none}
.ai-ico{width:22px;height:22px;border-radius:var(--r2);background:var(--ai-bg);
  color:var(--ai-tx);font-size:12px;font-weight:800;
  display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto}
.ai-t{font-size:13px;font-weight:700;color:var(--ai-tx)}
.ai-lead{font-size:var(--fs-body);color:var(--ink2);font-weight:600;flex:1;
  min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ai-tag{font-size:11px;font-weight:800;padding:3px 9px;border-radius:var(--r2);
  color:var(--ai-tx);background:rgba(255,255,255,.72);
  box-shadow:inset 0 0 0 1px rgba(111,78,216,.16);flex:0 0 auto;transition:background .15s}
.ai-h:hover .ai-tag{background:#fff}
.ai-caret{color:var(--ai);font-size:11px}
.ai-b{padding:0 15px 14px;font-size:13px;color:var(--ink2);line-height:1.55}
.ai-b ul{margin:8px 0 0;padding-left:20px}
.ai-b li{margin-bottom:5px}
.ai-b b{color:var(--ink)}

/* Состояние «отклонений нет» — одна строка вместо пустой плашки */
.no-insight{display:flex;align-items:center;gap:9px;font-size:var(--fs-body);
  color:var(--muted);background:#fff;border:1px solid var(--line2);
  border-radius:var(--r3);padding:11px 14px;margin:0 0 16px;font-weight:600}
.no-insight .ok-dot{width:8px;height:8px;border-radius:50%;background:var(--green);flex:0 0 auto}
```

**Мягкая заливка вместо обводки с цветной полосой слева**: обводка читается
как системное предупреждение, заливка тем же смыслом подсказывает тяжесть,
но не кричит.

Правила содержания:

- **Нет факта выше порога — нет плашки.** Вместо неё одна строка `.no-insight`.
  Воды в инсайтах не бывает.
- Инсайт — **отбор фактов по порогам**, а не текстовый шаблон. Типовые пороги:
  отклонение от ориентира ≥10%, направленный тренд ≥3 месяцев, концентрация
  отклонения в одном срезе ≥50%.
- Метка справа называет **действие** («подробнее» / «свернуть»), а не состояние.

### 4.11. Модалка **[ЯДРО]**

```css
.ovl{position:fixed;inset:0;background:rgba(20,28,45,.42);z-index:60;
  display:flex;align-items:flex-start;justify-content:center;padding:64px 18px;overflow:auto}
.modal{background:#fff;border-radius:var(--r5);box-shadow:var(--shadow-lg);
  width:100%;max-width:620px;overflow:hidden}
.modal.wide{max-width:1020px}
.modal-h{padding:18px 22px 14px;border-bottom:1px solid var(--line2)}
.modal-h h3{margin:0 0 5px;font-size:18px;font-weight:800;letter-spacing:-.3px}
.modal-h p{margin:0;font-size:var(--fs-body);color:var(--muted);line-height:1.45}
.modal-b{padding:18px 22px 8px}
.modal-f{padding:14px 22px 18px;border-top:1px solid var(--line2);
  display:flex;align-items:center;gap:10px;background:#fafbfc}
.modal-f .sp{flex:1}
.fgrp{margin-bottom:18px}
.fgrp>label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.4px;
  color:var(--muted);font-weight:800;margin-bottom:8px}
.fgrp .fhint{font-size:var(--fs-note);color:var(--muted2);font-weight:600;
  margin-top:7px;line-height:1.4}

/* Длинное окно: скроллится ТОЛЬКО тело, кнопки всегда достижимы */
.ovl.tall{padding:34px 18px;align-items:center}
.ovl.tall .modal{max-height:calc(100vh - 68px);display:flex;flex-direction:column}
.ovl.tall .modal-b{flex:1;min-height:0;overflow:auto}

/* Больше четырёх групп настроек — два столбца, иначе окно не влезает в ноутбук */
.setup-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);
  column-gap:26px;align-items:start}
.setup-cols .sc-col{min-width:0;display:flex;flex-direction:column}
.setup-cols .sc-col+.sc-col{border-left:1px solid var(--line2);padding-left:26px}
@media(max-width:900px){
  .setup-cols{grid-template-columns:1fr}
  .setup-cols .sc-col+.sc-col{border-left:0;padding-left:0;
    border-top:1px solid var(--line2);padding-top:16px}
}
```

Группы настроек нумеруются в подписи (`1 · Подразделение`, `2 · Покраска`) —
порядок шагов виден без чтения. Модалка закрывается кликом по фону и по `Escape`.
Кнопки: слева служебные, справа `Отмена` + главная, между ними распорка `.sp`.

### 4.12. Заметки, легенда, пустое состояние **[ЯДРО]**

```css
.note-inline{font-size:12px;color:var(--muted);background:#fff;
  border:1px dashed var(--line);border-radius:var(--r3);padding:11px 14px;
  margin-bottom:14px;line-height:1.5}
.tbl-note{margin-top:var(--s4);font-size:var(--fs-note);color:var(--muted);
  font-weight:600;line-height:1.45}
.legend{display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin:0 0 14px;
  font-size:12px;color:var(--ink2)}
.legend .sw{display:inline-flex;align-items:center;gap:6px;font-weight:600}
.legend .dot{width:11px;height:11px;border-radius:var(--r1);display:inline-block}
.empty{background:#fff;border-radius:var(--radius);box-shadow:var(--shadow);
  padding:38px 22px;text-align:center;color:var(--muted)}
.empty b{display:block;color:var(--ink);font-size:15px;margin-bottom:6px}
```

Пунктирная рамка `.note-inline` — для служебного состояния («временный корень»,
«режим сравнения»). `.tbl-note` — для честной сноски под таблицей или графиком:
что придумано, что не сходится, где инвариант работает не всегда.

Пустое состояние всегда говорит, **что сделать**: не «нет данных», а
«Нет данных по выбранным разрезам. Снимите один из разрезов в шапке отчёта».

### 4.13. Значок справки **[ЯДРО]**

```css
.info{display:inline-flex;align-items:center;justify-content:center;
  width:17px;height:17px;border-radius:50%;border:1px solid var(--line);
  background:#fff;color:var(--muted);font-family:inherit;font-size:11px;
  font-weight:700;line-height:1;letter-spacing:.2px;cursor:help;flex:0 0 auto;
  user-select:none;transition:border-color .12s,color .12s,background .12s}
.info:hover{border-color:var(--act);background:var(--blue-bg);color:var(--act)}
```

**Один значок справки на весь отчёт**: круг с «i», раскрывается наведением.
Двух видов быть не может — «?» с тултипом и «i» с попапом заставляют гадать,
что откроется. Начертание — шрифт интерфейса, засечка читалась бы как чужеродная.

Клик ради одной строки описания — лишнее действие. Если объяснение длиннее
трёх строк, это не тултип, а панель или модалка.

---

## 5. Подсказки: один механизм **[ЯДРО]**

**Атрибут `title=` запрещён по всему проекту.** Он появляется через секунду,
выглядит системным и не умеет в вёрстку.

Все подсказки — один кастомный тултип. Любой элемент (и в HTML, и внутри SVG)
объявляет её атрибутом `data-tip`, содержимое собирает **единый конструктор**.
Руками теги в подсказке не клеим: строки в разных местах расходятся по кеглю,
порядку и выравниванию.

```css
.tip{position:fixed;z-index:400;pointer-events:none;opacity:0;transform:translateY(3px);
  transition:opacity .11s ease-out,transform .11s ease-out;
  background:#fff;border:1px solid var(--line);border-radius:var(--r3);
  box-shadow:0 10px 30px rgba(24,33,50,.18),0 2px 6px rgba(24,33,50,.08);
  padding:9px 12px;font-size:12px;line-height:1.45;color:var(--ink2);font-weight:500;
  min-width:148px;max-width:300px;white-space:normal}
.tip.on{opacity:1;transform:none}
.tip .t-h{display:block;font-size:var(--fs-cap);font-weight:700;letter-spacing:.2px;
  color:var(--muted);margin-bottom:6px}
.tip .t-x{display:block;font-size:12px;font-weight:500;color:var(--ink2);line-height:1.45}
.tip .t-r{display:flex;align-items:center;gap:8px;margin-top:4px}
.tip .t-r:first-child{margin-top:0}
.tip .t-m{display:inline-block;flex:0 0 auto;width:10px;height:9px;border-radius:var(--r1)}
.tip .t-m.dash{height:0;width:14px;border-radius:0;border-top:2px dashed;background:none}
.tip .t-l{font-size:var(--fs-note);font-weight:600;color:var(--muted);min-width:0}
.tip .t-v{display:inline;margin:0 0 0 auto;font-size:var(--fs-lead);font-weight:700;
  color:var(--ink);white-space:nowrap;font-variant-numeric:tabular-nums}
.tip .t-r.bench .t-v{color:var(--muted);font-weight:600}
.tip .t-n{display:block;font-size:var(--fs-note);font-weight:500;color:var(--muted);margin-top:5px}
.tip .t-r+.t-n{margin-top:8px;padding-top:7px;border-top:1px solid var(--line2)}
.tip .t-n+.t-n{margin-top:2px;padding-top:0;border-top:0}
.nocmp,.rt-mark,.info,.cellbar,.delta{cursor:help}
```

```js
/* ---- Конструктор: {title, text, rows:[{label,value,color,dash}], note} ----
   Экранирует входы САМ. Снаружи esc() вызывать не надо — иначе амперсанды
   экранируются дважды. */
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,
  c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}

function tipHtml(o){
  if(o==null)return '';
  if(typeof o==='string')return o;
  let s='';
  if(o.title)s+='<span class="t-h">'+esc(o.title)+'</span>';
  if(o.text) s+='<span class="t-x">'+esc(o.text)+'</span>';
  (o.rows||[]).forEach(r=>{
    if(!r)return;
    const mk=r.color?'<i class="t-m'+(r.dash?' dash':'')+'" style="'+
      (r.dash?'border-top-color:':'background:')+r.color+'"></i>':'';
    s+='<span class="t-r'+(r.dash?' bench':'')+'">'+mk+
       '<span class="t-l">'+esc(r.label)+'</span>'+
       '<b class="t-v">'+esc(r.value)+'</b></span>';
  });
  const ns=o.note==null?[]:(Array.isArray(o.note)?o.note:[o.note]);
  ns.forEach(n=>{if(n)s+='<span class="t-n">'+esc(n)+'</span>'});
  return s;
}
/* Единственный способ поставить подсказку в разметке */
function tip(o){return ' data-tip="'+esc(tipHtml(o))+'"'}

/* ---- Один делегированный обработчик на документ ----
   Графики можно перерисовывать сколько угодно: подписываться заново не нужно. */
(function(){
  let el=null, cur=null;
  function node(){
    if(!el){
      el=document.createElement('div');
      el.className='tip';
      el.setAttribute('role','tooltip');
      document.body.appendChild(el);
    }
    return el;
  }
  function place(n,x,y){
    const w=n.offsetWidth||220,h=n.offsetHeight||60;
    let l=x+16,t=y-h-14;
    if(l+w>innerWidth-10)l=x-w-16;
    if(l<10)l=10;
    if(t<10)t=y+20;
    n.style.left=Math.round(l)+'px';n.style.top=Math.round(t)+'px';
  }
  function hide(){if(el)el.classList.remove('on');cur=null}
  document.addEventListener('mousemove',e=>{
    const t=e.target.closest?e.target.closest('[data-tip]'):null;
    if(!t){if(cur)hide();return}
    const n=node();
    if(cur!==t){cur=t;n.innerHTML=t.getAttribute('data-tip')||''}
    n.classList.add('on');place(n,e.clientX,e.clientY);
  },{passive:true});
  document.addEventListener('mouseleave',hide,true);
  document.addEventListener('click',hide,true);
  addEventListener('scroll',hide,true);
})();
```

### Правила содержания подсказки **[ЯДРО]**

- **Три уровня, а не «всё жирное»**: контекст сверху приглушён и мелок (`t-h`),
  значения — единственный акцент (`t-v`), служебное тише всего и отбито
  волосяной линией (`t-n`).
- **Все значения одного кегля.** Разный размер кодирует порядок строки в массиве,
  а не смысл: в графике «пришло / ушло» первая метрика выходила крупнее второй
  просто потому, что стоит первой в коде. Значимость несёт **цвет**: база
  сравнения серая (`.bench`), метрика чёрная. Признак базы надёжный — пунктирный
  маркер `dash:true`, тот же, что в легенде графика.
- Строк-значений **не больше трёх**, сносок — **не больше двух**. Подсказка
  объясняет точку, а не заменяет таблицу.
- Пары «подпись — значение» выровнены по правому краю значений: две строки
  читаются как таблица, а не как проза.
- Маркер серии в подсказке повторяет легенду графика: сплошной прямоугольник
  у значения, пунктирный штрих у базы.

---

## 6. Визуализация данных **[ЯДРО]**

Всё рисуется на голом SVG, без библиотек: конечный инструмент может их
не поддерживать, а отчёт обязан оставаться одним самодостаточным файлом.

### 6.1. Ось и шкала

1. **Ось значений ВСЕГДА от нуля.** Никогда не урезаем: диапазон 6,1–6,9%
   на урезанной оси выглядит обвалом, хотя колебание меньше процентного
   пункта. Это искажение данных, а не стиль. Технически: нижняя граница —
   константный ноль, функция масштаба считает только верх. Тогда урезанную ось
   нельзя получить даже случайно.
2. **Ось Y не рисуем вообще**, если значения подписаны у точек и баров
   (а это режим по умолчанию). Ни линии, ни засечек, ни сетки — подпись уже
   несёт всё число, остальное лишние чернила. Остаётся только базовая линия нуля.
3. **Верх шкалы — «круглое» число не ниже максимума**: 1 / 1,2 / 1,5 / 2 / 2,5 /
   3 / 4 / 5 / 6 / 8 / 10, умноженное на степень десяти.
4. **Одна шкала на сравниваемые плечи.** В диаграмме «вверх/вниз от нуля» оба
   плеча меряются одной шкалой, иначе бары визуально несравнимы. Разные
   метрики — отдельными панелями друг под другом с общей осью X и своей
   шкалой от нуля у каждой.

### 6.2. Что чем рисовать

| Задача | Вид | Почему не иначе |
|---|---|---|
| Динамика одной метрики | линия с подписями | — |
| Пара встречных потоков за период | диаграмма вверх/вниз от общего нуля | два бара рядом не читаются |
| Несколько метрик за один период | панели друг под другом | общая ось X, свои шкалы |
| Разбивка по атрибуту | **таблица с полосой в ячейке** | доля по числу точнее, чем по углу |
| Состав итога | водопад | — |
| Этапы отбора | воронка | — |
| Плотность по дням | календарь-хитмап | — |
| Тренд в строке таблицы | спарклайн | — |

5. **Два бара рядом за один период не рисуем.** Динамика не читается,
   сравнивать тяжело.
6. **Кольца и горизонтальные бар-чарты для разбивок не применяем** (см. 4.6).
7. **Подпись значения над каждой точкой и баром.** Борт бизнесовый: значение
   читается без наведения.
8. **Подписи значений рисуются с halo**: текст выводится дважды — сначала белой
   обводкой `stroke-width="3.2"`, потом заливкой поверх. `paint-order`
   не используем: в части браузеров он даёт двойной текст.
9. **Все подписи значений — одного цвета** (`#2b2b2b`). За смысл отвечает цвет
   бара или линии, а не цвет цифры.
10. **Кегль подписей на графике не масштабируется** — всегда 10–11px. При
    изменении ширины меняется геометрия, а не масштаб всего SVG: иначе
    на телефоне подписи станут нечитаемыми.
11. **Скругляется дальний от нуля край бара.** У бара вверх — верхний,
    у бара вниз — нижний. Край у нуля всегда ровный.
12. **Граница календарного года** — вертикальный пунктир ровно на высоту
    области построения. Не короче и не длиннее.
13. **Заголовок графика слева, легенда справа** — не накладываются.
14. **Ось X устроена одинаково во всех видах**: месяц, под первым месяцем
    и под каждым январём — ещё и год. Без исключений для панелей.

### 6.3. Единая геометрия

Все виды берут одни константы. Это единственный способ не получить
«на одной вкладке 25px, на другой 42px» между одинаковыми по смыслу зазорами.

```js
const AXIS_H   = 30;   // высота оси X (месяц + год под ним) — одна везде
const HEAD_GAP = 8;    // воздух под заголовком графика
const PAD_X    = 6;    // боковые поля области построения; ни один вид не липнет к краю
const VAL_SZ   = 11;   // ЕДИНСТВЕННЫЙ кегль подписи значения
const VAL_W    = 700;  // её начертание
const VAL_DY   = 9;    // отступ базовой линии подписи от марки
const VAL_ASC  = 8.5;  // высота цифры при VAL_SZ
const LBL_ROOM = Math.ceil(VAL_DY+VAL_ASC+HEAD_GAP);  // = 26, место под подписи сверху
const STACK_GAP= 26;   // зазор между панелями; ОБЯЗАН равняться --chart-gap
const DRAW_MS  = 760;  // длительность отрисовки линии; совпадает с CSS
```

Область построения всегда `x0 = PAD_X`, ширина `w − PAD_X*2`.

**`STACK_GAP` и `--chart-gap` обязаны совпадать.** Один зазор задаётся двумя
механизмами: внутри одного SVG — константой, между двумя соседними SVG — CSS.
Пока их не связали, на одной вкладке заголовок нижнего графика липнул к оси
верхнего, а на другой между ними был лишний воздух.

### 6.4. Интерактив графика

```css
/* Прозрачная ловушка на всю полосу периода: попасть мышью в тонкий бар тяжело,
   в полосу — легко. fill-opacity:0, а не fill:none — иначе нет hit-теста. */
.hit{fill:#2b6cff;fill-opacity:0;transition:fill-opacity .12s}
.barg:hover .hit,.ptg:hover .hit,.sbg:hover .hit{fill-opacity:.05}
.barg:hover .bar,.sbg:hover .sb{filter:brightness(1.1) saturate(1.3)}
.ptg:hover .dot{r:5.2;stroke-width:2.6}

/* Легенда как управление сериями: наведение гасит чужие, клик выключает */
.svgchart[data-hi] [data-s]{opacity:.18}
.svgchart[data-hi] [data-s].hi{opacity:1}
.svgchart [data-s]{transition:opacity .14s ease-out}
.lg{cursor:pointer}
.lg.lock{cursor:default}
.lg:hover .hit,.lg:focus-visible .hit{fill-opacity:.07}
.lg:focus{outline:none}
.lg:focus-visible .hit{fill-opacity:.12;stroke:var(--act);stroke-width:1.5}
```

- Каждая марка несёт **отдельный атрибут** `data-s="<серия>"`. Идентификатор
  серии в `class` не дописываем — классы проверяются посимвольно тестами.
- Выключенная серия уходит из шкалы и из подсказки. **Последнюю включённую
  серию выключить нельзя.** Композиционные виды (водопад) блокируются целиком:
  они держатся на всех типах столбцов.
- Легенда доступна с клавиатуры: `Enter` / `Space` переключают серию,
  фокус возвращается на тот же пункт после перерисовки.

### 6.5. Анимация появления

```css
@keyframes tp-grow {from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes tp-growx{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes tp-fade {from{opacity:0}to{opacity:1}}
@keyframes tp-draw {from{stroke-dashoffset:1}to{stroke-dashoffset:0}}

.svgchart.anim .bar{transform-box:fill-box;animation:tp-grow .48s cubic-bezier(.22,.61,.36,1) both}
.svgchart.anim .bar.up{transform-origin:50% 100%}
.svgchart.anim .bar.dn{transform-origin:50% 0}
.svgchart.anim .bar.fn{transform-origin:50% 50%;animation-name:tp-growx}
/* Линия РИСУЕТСЯ слева направо: у графика есть направление времени.
   Работает только вместе с pathLength="1" на пути — тогда dasharray константа. */
.svgchart.anim .ln{stroke-dasharray:1;stroke-dashoffset:1;
  animation:tp-draw .76s cubic-bezier(.4,0,.2,1) both}
.svgchart.anim .lnb{animation:tp-fade .5s ease-out both;animation-delay:.1s}
.svgchart.anim .dot,.svgchart.anim .fade{animation:tp-fade .3s ease-out both}
```

- Бар растёт **от нуля**, а не из центра: направление роста повторяет смысл шкалы.
- Линия рисуется по времени слева направо, точки вспыхивают по мере того,
  как до них доходит линия (задержка на элементе).
- Пунктирная линия базы не рисуется, а проявляется: `dasharray` у неё занят
  рисунком штриха.
- Анимация ставится **классом при рендере экрана и не ставится при resize**:
  дёргаться при каждом изменении ширины окна график не должен.

---

## 7. Числа и форматирование **[ЯДРО]**

| Что | Как | Пример |
|---|---|---|
| Разряды | тонкий пробел ` ` | `2 968` |
| Дробная часть | запятая, один знак | `1,8%` |
| Минус | типографский `−`, не дефис | `−0,3` |
| Плюс | обязателен у изменений | `+3` |
| Ноль изменения | без знака | `0` |
| Проценты | `1,8%` без пробела | `1,8%` |
| Пункты | `п.п.` с тонким пробелом | `+1,4 п.п.` |
| Дни | `дн` с тонким пробелом | `27 дн` |
| Нет данных | длинное тире | `—` |
| Тысячи в тесноте | `1,2K` | `1,2K` |

**Минус подставляет форматтер значения, а не компонент.** Пока типографский
минус ставился в пилюле, соседняя ячейка таблицы, зовущая форматтер напрямую,
оставалась с дефисом — два элемента одного экрана писали минус по-разному.

**Числа в подсказках и колонках — моноширинные цифры**: `font-variant-numeric:
tabular-nums`. Иначе значения в столбце «дышат» при обновлении.

---

## 8. Раскладка и адаптив **[ЯДРО]**

### 8.1. Каркас

```css
.apphead{background:#fff;border-bottom:1px solid var(--line);
  position:sticky;top:0;z-index:50}
.layout{display:flex;min-height:calc(100vh - var(--head-h));align-items:stretch}
.nav{width:236px;flex:0 0 236px;background:#fff;border-right:1px solid var(--line);
  padding:16px 12px;position:sticky;top:var(--head-h);
  height:calc(100vh - var(--head-h));display:flex;flex-direction:column;overflow-y:auto}
.main-col{flex:1;min-width:0;display:flex;flex-direction:column;background:var(--bg)}
.content{flex:1;padding:18px 26px 24px;min-width:0}
```

Над телом дашборда живёт **только одна полоса** — шапка приложения. Всё
остальное (контекст отчёта, фильтры, точки входа в настройку и справку) —
внутри тела: во встраиваемом инструменте выше тела ничего своего не сверстать.

### 8.2. Рабочая зона: таблица слева, визуализация справа

```css
.split{display:grid;grid-template-columns:minmax(500px,.95fr) minmax(440px,1.05fr);
  gap:16px;align-items:stretch}
.split>.panel{min-height:0;height:100%;display:flex;flex-direction:column}
.split .panel-h{flex:0 0 auto;min-height:54px}
.split .panel-b{flex:1;min-height:0}
.split-l .tbl-wrap{padding:0 0 4px;overflow:auto}
.split-r .panel-b{overflow:auto;display:flex;flex-direction:column;gap:var(--chart-gap)}
.split-r .panel-b>.svgchart.fill{flex:1;min-height:0}
.split-r .panel-b>.svgchart{flex:none}

/* Высота рабочей зоны — экран под шапкой, а не константа.
   Тогда в таблицу влезает столько строк, сколько позволяет монитор, а прокрутка
   доводит рабочую зону точно под шапку и не оставляет в кадре лишнего. */
@media(min-width:1121px){
  .split{height:clamp(520px,calc(100vh - var(--head-h) - 28px),1280px)}
}
@media(max-width:1240px){.split{grid-template-columns:minmax(440px,.95fr) minmax(400px,1.05fr)}}
@media(max-width:1120px){
  .split{grid-template-columns:1fr;height:auto}
  .split>.panel{height:auto}
  .split-l .tbl-wrap{max-height:430px}
  .split-r .panel-b{height:380px}
}
```

**`fill` — только когда высоту панели делят графики.** Как только рядом
с графиком стоит таблица или сноска, делить нечего: `flex:1` отдаёт графику
весь остаток, он тратит его на пустоту внутри себя, и расстояние до соседа
начинает зависеть от высоты монитора. Такой график стоит своей высотой
(`flex:none`), запас высоты копится внизу панели.

### 8.3. Брейкпоинты

`1240` · `1120` · `1100` · `900` · `780` · `480`

**Брейкпоинты ставятся по замерам, а не по круглым числам.** Порог включается
там, где минимумы колонок перестают помещаться в контент, — иначе на полосе
ширин между «уже не влезает» и «ещё не сработало» появляется горизонтальный
скролл всей страницы. Если у раскладки есть и порог колонок, и порог
фиксированной высоты — **они обязаны совпадать**: иначе высота задаётся тому,
чего на этой ширине уже нет.

```css
@media(max-width:1100px){
  .kpis,.kpis.n4,.kpis.n5{grid-template-columns:repeat(3,minmax(160px,1fr))}
  .content{padding:22px}
}
@media(max-width:780px){
  .layout{display:block}
  .nav{position:fixed;z-index:120;left:0;top:0;bottom:0;width:min(82vw,300px);
    height:auto;transform:translateX(-105%);transition:transform .22s ease;
    box-shadow:8px 0 28px rgba(20,28,45,.18)}
  .nav.open{transform:translateX(0)}
  .nav-scrim{position:fixed;z-index:110;inset:0;background:rgba(20,28,45,.38);display:none}
  .nav-scrim.open{display:block}
  .apphead{position:static}
  .content{padding:16px}
  .kpis,.kpis.n3,.kpis.n4,.kpis.n5{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .toolbar{align-items:stretch}
  .toolbar .ctl,.toolbar .ctl select{width:100%}
  .toolbar>.btn{flex:1;justify-content:center}
  /* Таблицы не ломаем переносом: даём горизонтальную прокрутку внутри панели */
  .panel{overflow-x:auto}
  .mtable,.ptable{min-width:760px}
  .modal{width:calc(100vw - 20px);max-height:92vh}
}
@media(max-width:480px){
  .kpis,.kpis.n2,.kpis.n3,.kpis.n4,.kpis.n5{grid-template-columns:1fr}
  .sub-tabs{display:flex;overflow-x:auto;width:100%;white-space:nowrap}
  .panel-h{padding:12px}.panel-b{padding:10px}
}
```

**На телефоне таблица прокручивается, а не переносится.** Ужать числовые
колонки нельзя: между значениями останется меньше воздуха, чем внутри них.

Ловушка: если `display:block` гасит flex-`gap` в мобильной раскладке, зазор
надо вернуть маргином — расстояние между графиком и соседом обязано быть
одинаковым на всех ширинах.

### 8.4. Печать

```css
@media print{
  body{background:#fff}
  .apphead,.nav,.toolbar,.sub-tabs,.btn,.nav-scrim,.tip{display:none!important}
  .layout,.main-col{display:block}
  .content{padding:0;max-width:none}
  .panel,.kpi,.ai{box-shadow:none;break-inside:avoid}
  .chips .x{display:none}
}
```

Печать — не отдельная вёрстка, а снятие интерактива: управление уходит,
содержимое остаётся, карточки и панели не рвутся между страницами.

---

## 9. Доступность **[ЯДРО]**

```css
:focus-visible{outline:3px solid rgba(43,108,255,.32);outline-offset:2px}
button:focus-visible,a:focus-visible,select:focus-visible{outline-color:var(--act)}
.skip-link{position:fixed;left:12px;top:-60px;z-index:9999;background:var(--ink);
  color:#fff;padding:10px 14px;border-radius:var(--r3);font-weight:700;
  text-decoration:none;transition:top .15s}
.skip-link:focus{top:12px}
.sr-only{position:absolute!important;width:1px!important;height:1px!important;
  padding:0!important;margin:-1px!important;overflow:hidden!important;
  clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
[aria-current="page"]{font-weight:800}
.mrow:focus,.urow:focus{outline:3px solid rgba(43,108,255,.25);outline-offset:-3px;
  background:#f5f8ff}
@media (prefers-reduced-motion:reduce){
  *,*:before,*:after{scroll-behavior:auto!important;animation-duration:.01ms!important;
    animation-iteration-count:1!important;transition-duration:.01ms!important}
}
```

Обязательный минимум на каждой странице:

- `<html lang="ru">`, `<meta name="viewport" content="width=device-width,initial-scale=1">`.
- Ссылка «Перейти к отчёту» первой в `<body>`, цель — контейнер контента
  с `tabindex="-1"`.
- Кликабельная строка таблицы получает `tabindex="0"` и `role="button"`,
  `Enter` и `Space` вызывают тот же обработчик, что клик.
- Раскрываемый элемент несёт `aria-expanded`, активный пункт навигации —
  `aria-current="page"`.
- `Escape` закрывает всё, что открыто: модалку, выезжающую панель, мобильную
  навигацию.
- Декоративные каретки и иконки — `aria-hidden="true"`; у кнопки без текста
  есть `aria-label`.
- У SVG-элемента может не быть метода `.click()` — обработчик для клавиатуры
  зовётся напрямую, а фокус после перерисовки возвращается вручную.

---

## 10. Тон и формулировки **[ЯДРО]**

**Как пишем**

- По-человечески и коротко: «Снимите один из разрезов в шапке отчёта»,
  а не «Отсутствуют данные для отображения».
- Подпись говорит, **что произойдёт**, а не как называется состояние:
  «подробнее» / «свернуть», а не «предрасчёт».
- Единица измерения и направление «хорошего» — в подсказке метрики,
  а не в заголовке колонки.
- Заголовок колонки — существительное, короткое, без точки. Пояснение
  к нему — второй строкой, мельче и не капсом: это пояснение, а не имя колонки.
- Числа в тексте пишем так же, как в таблицах (раздел 7).

**Что обязательно проговариваем**

- **С чем сравнивается число.** «+3» без подписи читается как отклонение
  от базы. Пишем «+3 к маю».
- **Что фильтр меняет, а что нет.** «Временный корень: Разработка.
  База сравнения не меняется».
- **Где данные придуманы или допущены.** Сноска под таблицей или графиком,
  честной формулировкой.
- **Почему метрика не окрашена.** «больше не значит лучше», «не сравнивается».

**Чего не пишем**

- «Ошибка», «внимание», «важно» без действия рядом.
- Аббревиатур, не раскрытых в подсказке.
- Пустых состояний ради симметрии («Разрезы не выбраны»).
- Одного и того же дважды: месяц сравнения стоит в шапке колонки **или**
  в каждой пилюле, а не там и там.

**Справка «Как читать отчёт»** — три-четыре правила, каждое одной фразой
и одним абзацем пояснения. Показывается при первом входе, дальше доступна
кнопкой. Это онбординг, а не документация.

---

## 11. Смысловые правила отчёта **[ПРОДУКТ]**

Это не CSS, но именно они делают отчёт понятным. Переносятся в любой
аналитический интерфейс по смыслу.

1. **База сравнения выводится из фильтров, а не из подразделения.** Выбрали
   HQ — сравнение со всем HQ; добавили IT — со всем HQ IT. Подпись базы
   собирается автоматически и всегда видна в шапке. Временный переход вглубь
   (drill) базу **не меняет**, и об этом сказано прямо в интерфейсе.
2. **Есть утверждённый KPI — сравниваемся только с ним, базы рядом нет.**
   Это не оговорка, а вторая половина правила: цель отменяет сравнение
   со средней, а не дополняет его. Два ориентира рядом заставляют выбирать,
   по какому судить. Развилка обязана быть **одинаковой во всех местах**, где
   метрика показывается: карточка, ячейка таблицы, шапка колонки, спарклайн,
   график. И обратный переход тоже: нет KPI — вернулись к базе.
3. **С базой сравниваются только относительные метрики.** 212 человек против
   2 968 по компании — это масштаб, а не оценка. У абсолютных величин вместо
   базы стоит «не сравнивается», линия базы на графике не рисуется, колонка
   сравнения не появляется.
4. **Изменение сравнивается с прошлым периодом, и период назван** (раздел 4.7).
5. **Состав метрик выбирает пользователь, а в состоянии хранятся СКРЫТЫЕ.**
   Инверсия намеренная: пустой список значит «показать всё», и новая метрика
   появляется у всех сама, вместо того чтобы потеряться у тех, кто уже настроил
   дашборд. Опорные метрики выключить нельзя. Набор едет в ссылке.
6. **Скрытие доходит до списков, но не до графиков.** Строки, столбцы,
   карточки, инсайты реагируют; графики правой панели — нет: они рисуют смысл
   блока (баланс, воронку, водопад), и «убрать серию» там означает сломать
   композицию, а не убрать строку.
7. **Ссылка сохраняет всё состояние** — фильтры, активный раздел, набор метрик.
   Отчёт, который нельзя переслать коллеге в том же виде, не дошёл.
8. **Мёртвая зона сравнения ±5%.** Отклонение внутри неё — серое.
9. **Одна вкладка = один вопрос целиком**, а не один график. Если на экран
   влезает пара «что получилось + из чего сложилось» — это одна вкладка,
   а не две. Заводить вкладку ради одинокого графика незачем.

---

## 12. Чек-лист приёмки

Прогоните сгенерированный HTML по списку. Любой «нет» — работа не сдана.

**Токены и типографика**
- [ ] Блок `:root` скопирован целиком, значения не правлены
- [ ] В разметке нет литеральных `#rrggbb` — только `var(--…)`
- [ ] Все кегли — из семи ролей; голых `px` в шрифтах компонентов нет
- [ ] Все веса — из четырёх ролей; жирным набрано не всё подряд, восьмисотого нет
- [ ] Числа в ячейках таблиц набраны обычным весом, а не полужирным
- [ ] Отступы и радиусы из шкал `--s*` / `--r*`
- [ ] Тело таблиц набрано `--fs-body`, шапки — `--fs-cap`
- [ ] Таблицы одного экрана — одного кегля

**Цвет**
- [ ] В светофоре только зелёный, красный и серый; жёлтого нет
- [ ] Метрики «больше не значит лучше» не окрашены вообще
- [ ] Гамма потоков одна на весь документ

**Компоненты**
- [ ] Все карточки полосы KPI рисуют одинаковое число строк, есть `@supports subgrid`
- [ ] У раскрываемых строк есть каретка; у нераскрываемых — распорка
- [ ] У КАЖДОЙ таблицы со строчными каретками есть общая «раскрыть / свернуть всё»
- [ ] Общая каретка предлагает свернуть только когда раскрыто всё
- [ ] Разбивки по атрибутам сделаны таблицей, не кольцом и не бар-чартом
- [ ] ИТОГО стоит первой строкой во ВСЕХ таблицах, а не по-разному
- [ ] Первая колонка не повторяет название, которое уже стоит над таблицей
- [ ] Полоса в ячейке растёт от левого края, масштаб от нуля до максимума столбца
- [ ] Пустых состояний «ничего не выбрано» нет

**Матрица и срез (если они есть)**
- [ ] Внутри одной разбивки полосы одного цвета; разными цветами различаются таблицы
- [ ] У двухуровневой разбивки сумма детей равна родителю, ИТОГО не удвоено
- [ ] Заливка клетки монохромная, светофора в матрице нет
- [ ] Итоги строк и колонок совпадают с одномерными разбивками до единицы
- [ ] Проценты в строке (в колонке) дают ровно 100
- [ ] Широкая таблица скроллится внутри обёртки, страница вбок не едет
- [ ] Срез не режет разбивку, из которой взят; в срезе не больше двух атрибутов
- [ ] Взятый срез подписан рядом с цифрами, которые он изменил
- [ ] Срез не действует на экраны, где его никто не брал

**Подсказки**
- [ ] Ни одного атрибута `title=`
- [ ] Все подсказки идут через `data-tip` и общий конструктор
- [ ] В подсказке все значения одного кегля, база серая с пунктирным маркером
- [ ] Строк-значений не больше трёх

**Графики**
- [ ] Ось значений начинается с нуля везде
- [ ] Оси Y нет там, где значения подписаны
- [ ] Значение подписано у каждой точки и бара, с белым halo
- [ ] Двух баров рядом за один период нет
- [ ] Зазор между графиками равен `--chart-gap` и совпадает с внутренним `STACK_GAP`
- [ ] Ось X одинакова во всех графиках

**Числа и текст**
- [ ] Минус типографский везде, включая ячейки таблиц
- [ ] Разряды тонким пробелом, дробная часть запятой
- [ ] У каждого изменения написано, с чем оно сравнивается
- [ ] Придуманные и допущенные данные помечены сноской

**Раскладка и доступность**
- [ ] Горизонтального скролла страницы нет ни на одной ширине 768–1440px
- [ ] Пороги колонок и пороги фиксированных высот совпадают
- [ ] Есть skip-link, `:focus-visible`, `Escape` закрывает всё
- [ ] Кликабельные строки доступны с клавиатуры (`tabindex`, `role`, `Enter`/`Space`)
- [ ] Есть `prefers-reduced-motion`
- [ ] Печатная версия убирает управление и не рвёт карточки

---

## 13. Скелет страницы

Минимальная заготовка: дизайн-система внутри, остаётся вставить содержимое.

```html
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Название отчёта</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  /* 1. Блок :root из раздела 2 — целиком */
  /* 2. База: *, body, button из раздела 2 */
  /* 3. Компоненты из раздела 4 — только те, что нужны */
  /* 4. Тултип из раздела 5 */
  /* 5. Раскладка и медиа-запросы из раздела 8 */
  /* 6. Доступность из раздела 9 */
</style>
</head>
<body>
<a class="skip-link" href="#view">Перейти к отчёту</a>
<div class="nav-scrim" id="navScrim"></div>

<header class="apphead">
  <div class="apphead-top">
    <button class="nav-toggle" id="navToggle" aria-label="Открыть навигацию" aria-expanded="false">☰</button>
    <div class="logo"><span class="mark"></span>Название</div>
    <div class="spacer"></div>
  </div>
</header>

<div class="layout">
  <nav class="nav" id="sideNav" aria-label="Разделы отчёта">
    <div class="nav-h">Сводка</div>
    <button class="nav-i active" data-tab="onepager"><span class="ico"></span>One-pager</button>
    <div class="nav-sep"></div>
    <div class="nav-h">Блоки</div>
    <div id="navBlocks"></div>
  </nav>

  <div class="main-col">
    <!-- Контекст отчёта: крошки, заголовок, чипы фильтров, точки входа.
         Раскладка этой полосы свободная — фильтры могут стоять где угодно. -->
    <section class="reporthead">
      <div class="rh-row">
        <div class="rh-main">
          <div class="rh-crumbs" id="crumbs"></div>
          <h1 class="rh-title" id="unitTitle"></h1>
          <div class="chips" id="chips"></div>
        </div>
        <div class="rh-side">
          <span class="period" id="periodBadge"></span>
          <button class="btn ghost" id="btnHelp">Как читать отчёт</button>
          <button class="btn primary" id="btnSetup">Настройки</button>
        </div>
      </div>
    </section>

    <main class="content" id="view" tabindex="-1">
      <div class="page-h">
        <div class="ph-row"><h2>Заголовок блока</h2></div>
        <p>Пояснение блока. Сравнение с базой <b>всё HQ IT</b>.</p>
      </div>

      <div class="kpis compact n4"><!-- карточки: ровно 4 строки каждая --></div>

      <div class="split">
        <div class="panel split-l">
          <div class="panel-h"><div class="h-txt"><span>Подразделения</span>
            <span class="sub">клик по строке фильтрует правую панель</span></div></div>
          <div class="panel-b tbl-wrap"><!-- .ptable.dense --></div>
        </div>
        <div class="panel split-r">
          <div class="panel-h with-tabs"><div class="h-txt"><span>Динамика</span></div>
            <div class="sub-tabs">
              <button class="sub-tab active" data-subtab="a">Вид А</button>
              <button class="sub-tab" data-subtab="b">Вид Б</button>
            </div></div>
          <div class="panel-b"><!-- .svgchart --></div>
        </div>
      </div>
    </main>
  </div>
</div>

<script>
  /* Тултип из раздела 5 — целиком, до остального кода */
  /* Дальше: состояние, рендер, обработчики */
</script>
</body>
</html>
```

### Архитектура кода, если отчёт больше одного экрана **[ПРОДУКТ]**

- Разбивка **по слоям, потом по экранам**: данные → рисование → общие
  UI-элементы → экраны → приложение. Порядок загрузки жёсткий, каждый
  следующий слой читает предыдущий.
- **Файл экрана не пишет разметку сам.** Ни SVG-строк, ни `<table>` — только
  сбор данных и вызовы общих элементов. Нужен новый визуальный элемент — он
  сначала появляется в общем слое. Иначе переиспользуемые элементы расходятся
  между экранами, а это ровно то, чего разбивка должна избегать.
- Экраны **возвращают строку разметки**, а не пишут в DOM. Весь рендер — одна
  вставка, после неё графики перемеряются под фактическую ширину контейнера.
  Тогда нет утечек инстансов и нет отдельного монтирования.
- **Один делегированный обработчик** на документ, порядок проверок от частного
  к общему: широкие селекторы (строка таблицы) проверяются последними.
- Всё состояние — в URL. Перерисовка внутри того же экрана сохраняет позицию
  прокрутки: прыгать наверх при клике по строке нельзя, пользователь теряет
  ту самую строку, которую только что открыл.
- Рисование строковое (функции возвращают разметку SVG и не трогают DOM) —
  тогда весь рисовальный код прогоняется тестами без браузера.

---

## 14. Антипаттерны

Что немедленно ломает дизайн-систему:

| Нельзя | Вместо этого |
|---|---|
| `title="…"` | `data-tip` + общий конструктор |
| Урезанная ось значений | ось от нуля всегда |
| Ось Y при подписанных значениях | подпись у точки, оси нет |
| Два бара рядом за один период | диаграмма вверх/вниз или панели |
| Кольцо или бар-чарт для разбивки | таблица с полосой в ячейке |
| Жёлтая пилюля в светофоре | серая |
| Стрелка `↑↓` в дельте | знак `+` / `−` |
| `↗` из шрифта | инлайн-SVG |
| Новый кегль «между 12 и 13» | одна из семи ролей |
| Полужирный по умолчанию во всей таблице | 400 на данных, 600–700 на главном |
| Вес 800 рядом с 700 | один сильный вес |
| ИТОГО сверху в одной таблице и снизу в другой | всегда первой строкой |
| Название таблицы, повторённое в шапке колонки | шапка пустая |
| Отступ 7 / 9 / 13 / 17px | ступень шкалы `--s*` |
| `#3b6fe0` в разметке экрана | `var(--blue)` |
| Разный кегль значений в подсказке | один кегль, разница цветом |
| Плашка «ничего не выбрано» | отсутствие плашки |
| Прочерк у несравнимой метрики | «не сравнивается» |
| Брейкпоинт «круглым числом» | брейкпоинт по замеру |
| Фиксированная высота рабочей зоны | высота от экрана |
| Дефис вместо минуса в одной из ячеек | минус ставит форматтер |
| Светофор в матрице состава | монохромная шкала одного тона |
| Клетки матрицы, округлённые по отдельности | края сводятся с разбивками |
| Таблица с каретками без общей каретки | общая обязательна, исключений нет |
| Своя кнопка «раскрыть всё» в каждой таблице | один общий компонент |
| Разные цвета строк внутри одной разбивки | один цвет на таблицу |
| Уровни разбивки, округлённые независимо | сверху вниз: дети к родителю |
| ИТОГО, сложенное по всем уровням сразу | итог по верхнему уровню |
| Срез режет ту же разбивку, из которой взят | свой разрез из среза исключается |
| Срез виден только выделением строки | плашка там, где меняются цифры |
| Девять разбивок на одной вкладке | группы по три плюс конструктор |
| Горизонтальный скролл страницы у широкой таблицы | скролл внутри обёртки |

---

## 15. Сводка ограничений

Чтобы отчёт оставался переносимым:

- **Внешних библиотек нет вообще.** Ни графических, ни UI. Всё рисуется
  на голом SVG, всё верстается на своём CSS.
- **Отчёт сдаётся одним самодостаточным HTML-файлом**: стили и скрипты
  встроены, внешних ссылок нет. Единственная внешняя ссылка в режиме
  разработки — шрифт; в автономном файле она вырезается, и шрифт корректно
  деградирует.
- **Иконочных шрифтов нет** — инлайн-SVG и юникод.
- **Правила проверяются автоматически.** Ось от нуля, отсутствие жёлтого,
  совпадение зазоров, кегли таблиц, подпись месяца сравнения, число строк
  в карточке — всё это проверки, а не договорённость. Хотя бы один провал —
  работа не сдана. Визуальную приёмку тест не заменяет.
