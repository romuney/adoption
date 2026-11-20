-- Журнал утверждённых ЦА отчётов. Пишет ТОЛЬКО n8n-флоу pa_next_ta_save (файл 3).
-- Только дописываем: каждая строка — новая версия ЦА одного отчёта.
-- Текущая ЦА отчёта = строка с максимальной version; если это 'deactivate' — ЦА нет.
-- Подставить <catalog>.<schema> и прислать полное имя (см. «0. Начни здесь.md», что вернуть).

CREATE TABLE <catalog>.<schema>.pa_next_ta_event (
  event_id      VARCHAR,          -- '<request_id>-v<version>'
  request_id    VARCHAR,          -- генерирует отчёт; повтор запроса не создаёт новую версию
  dashboard_id  BIGINT,
  action        VARCHAR,          -- 'save' | 'deactivate'
  version       INTEGER,          -- 1, 2, 3… на отчёт; растёт и на deactivate
  -- Условия = значения фильтров строки «Целевая аудитория» ровно в том виде, что уходят в ca_<dim>_f:
  f_org         ARRAY(VARCHAR),   -- ca_org_f: пути «Блок › Департамент › …», до 5 уровней; путь берёт и всех ниже
  f_spec        ARRAY(VARCHAR),   -- ca_spec_f: специализации (названия)
  f_stream      ARRAY(VARCHAR),   -- ca_stream_f: стримы (названия)
  f_hq          ARRAY(VARCHAR),   -- ca_hq_f: коды HQ
  f_it          ARRAY(VARCHAR),   -- ca_it_f: коды IT
  f_head        ARRAY(VARCHAR),   -- ca_head_f: [] | ['1'] руководители | ['n'] не руководители
  f_adg         ARRAY(VARCHAR),   -- ca_adg_f: AD-группы
  ca_size       INTEGER,          -- размер ЦА, который отчёт показывал при сохранении (справочно); NULL у deactivate
  comment       VARCHAR,          -- «для кого отчёт», необязательно
  saved_by      VARCHAR,          -- логин (current_username Proteus), нижний регистр
  saved_at      TIMESTAMP(6) WITH TIME ZONE,
  client        VARCHAR           -- 'proteus_adoption_next'
)
WITH (format = 'PARQUET');

-- Права учётки n8n: SELECT + INSERT на эту таблицу, SELECT на таблицу владельцев дашбордов.
-- Права ноды pa_next_ta (файл 6): SELECT на эту таблицу.

-- Проверка после первых сохранений: текущая ЦА по отчётам
-- SELECT * FROM (
--   SELECT e.*, row_number() OVER (PARTITION BY dashboard_id ORDER BY version DESC, saved_at DESC) AS rn
--   FROM <catalog>.<schema>.pa_next_ta_event e
-- ) WHERE rn = 1 AND action = 'save';
