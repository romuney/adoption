-- Диагностика ошибки каталога:
--   Code: 36. DB::Exception: Invalid local IN function name globalIn. (BAD_ARGUMENTS) (version 25.8.12.1)
--
-- Запускать в Proteus SQL Lab, подключение — то же, что у датасетов отчёта (proteus-ch-cross).
-- КАЖДЫЙ запрос ОТДЕЛЬНО (выделить от «-- Q…» до точки с запятой → Run). Все только читают.
-- Прислать по каждому: результат одной строкой или текст ошибки целиком.
--
-- Что проверяем. ClickHouse переписывает IN (подзапрос) в GLOBAL IN, когда таблицы распределённые
-- и включён distributed_product_mode = 'global'. В 25.x новый анализатор на этом спотыкается
-- в некоторых формах запроса. Q2–Q4 — по одной форме из SQL каталога, Q5–Q7 — варианты исправления.

-- Q1. Версия, настройки и движки таблиц
SELECT
  version() AS v,
  getSetting('allow_experimental_analyzer') AS analyzer,
  getSetting('distributed_product_mode') AS dpm,
  getSetting('prefer_global_in_and_join') AS prefer_global,
  (SELECT arrayStringConcat(groupArray(concat(name, ':', engine)), ', ')
     FROM system.tables
    WHERE database = 'prod_proteus'
      AND name IN ('pa_next_pair', 'pa_next_pair_acc', 'pa_next_login_map', 'pa_next_dash_meta', 'pa_next_evd_day')) AS engines;

-- Q2. IN (подзапрос) в списке SELECT — как колонка acc каталога (5. SQL, «зритель входит в ЦА по правам»)
SELECT count() AS n, countIf(acc = 1) AS n_acc
FROM (
  SELECT toUInt8((toInt32(ifNull(dashboard_id, 0)), lower(toString(login)))
                 IN (SELECT toInt32(ifNull(dashboard_id, 0)), toString(ifNull(login, '')) FROM prod_proteus.pa_next_pair_acc)) AS acc
  FROM prod_proteus.pa_next_pair
  WHERE dashboard_id IN (SELECT dashboard_id FROM prod_proteus.pa_next_dash_meta ORDER BY dashboard_id LIMIT 50)
);

-- Q3. То же, но через CTE, на который ссылаются дважды (как evd в каталоге)
WITH e AS (
  SELECT toInt32(ifNull(dashboard_id, 0)) AS did, lower(toString(login)) AS lg
  FROM prod_proteus.pa_next_pair
  WHERE dashboard_id IN (SELECT dashboard_id FROM prod_proteus.pa_next_dash_meta ORDER BY dashboard_id LIMIT 50)
)
SELECT
  (SELECT count() FROM e) AS n,
  (SELECT countIf((did, lg) IN (SELECT toInt32(ifNull(dashboard_id, 0)), toString(ifNull(login, '')) FROM prod_proteus.pa_next_pair_acc)) FROM e) AS n_acc;

-- Q4. Только IN в WHERE внутри CTE, на который ссылаются дважды (как dash_ok / cap_input)
WITH d AS (
  SELECT dashboard_id FROM prod_proteus.pa_next_dash_meta
  WHERE dashboard_id IN (SELECT dashboard_id FROM prod_proteus.pa_next_pair_acc)
)
SELECT (SELECT count() FROM d) AS a, (SELECT count() FROM d) AS b;

-- Q5. Исправление A: явный GLOBAL IN вместо IN (форма Q3)
WITH e AS (
  SELECT toInt32(ifNull(dashboard_id, 0)) AS did, lower(toString(login)) AS lg
  FROM prod_proteus.pa_next_pair
  WHERE dashboard_id GLOBAL IN (SELECT dashboard_id FROM prod_proteus.pa_next_dash_meta ORDER BY dashboard_id LIMIT 50)
)
SELECT
  (SELECT count() FROM e) AS n,
  (SELECT countIf((did, lg) GLOBAL IN (SELECT toInt32(ifNull(dashboard_id, 0)), toString(ifNull(login, '')) FROM prod_proteus.pa_next_pair_acc)) FROM e) AS n_acc;

-- Q6. Исправление B: прежний анализатор (форма Q3)
WITH e AS (
  SELECT toInt32(ifNull(dashboard_id, 0)) AS did, lower(toString(login)) AS lg
  FROM prod_proteus.pa_next_pair
  WHERE dashboard_id IN (SELECT dashboard_id FROM prod_proteus.pa_next_dash_meta ORDER BY dashboard_id LIMIT 50)
)
SELECT
  (SELECT count() FROM e) AS n,
  (SELECT countIf((did, lg) IN (SELECT toInt32(ifNull(dashboard_id, 0)), toString(ifNull(login, '')) FROM prod_proteus.pa_next_pair_acc)) FROM e) AS n_acc
SETTINGS allow_experimental_analyzer = 0;

-- Q7. Исправление C: без переписывания IN в GLOBAL IN (форма Q3)
WITH e AS (
  SELECT toInt32(ifNull(dashboard_id, 0)) AS did, lower(toString(login)) AS lg
  FROM prod_proteus.pa_next_pair
  WHERE dashboard_id IN (SELECT dashboard_id FROM prod_proteus.pa_next_dash_meta ORDER BY dashboard_id LIMIT 50)
)
SELECT
  (SELECT count() FROM e) AS n,
  (SELECT countIf((did, lg) IN (SELECT toInt32(ifNull(dashboard_id, 0)), toString(ifNull(login, '')) FROM prod_proteus.pa_next_pair_acc)) FROM e) AS n_acc
SETTINGS distributed_product_mode = 'allow';
