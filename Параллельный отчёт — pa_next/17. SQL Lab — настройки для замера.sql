-- Run as ONE read-only statement in Proteus SQL Lab, the report's ClickHouse connection.
-- Reads current configuration without changes.
-- Send its one-row result along with the browser timing exports.
SELECT
  version() AS clickhouse_version,
  getSetting('allow_experimental_analyzer') AS analyzer,
  getSetting('prefer_column_name_to_alias') AS prefer_column_name_to_alias,
  getSetting('join_use_nulls') AS join_use_nulls,
  getSetting('group_by_use_nulls') AS group_by_use_nulls,
  getSetting('max_execution_time') AS max_execution_seconds,
  getSetting('max_threads') AS max_threads,
  getSetting('max_memory_usage') AS max_memory_bytes,
  getSetting('use_query_cache') AS result_cache_enabled,
  getSetting('use_uncompressed_cache') AS uncompressed_cache_enabled
