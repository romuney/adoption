# %% [markdown]
# # ta_sync — утверждённые ЦА: DLH → ClickHouse
#
# Читает журнал `proteus_adoption.ta_event` (пишет n8n), собирает текущее
# состояние по каждому отчёту и **атомарно** перезаливает
# `adoption.ta_current` и зеркало `adoption.ta_event` в ClickHouse.
#
# Таблица маленькая (сотни строк), поэтому каждый запуск — полная пересборка:
# INSERT во временную таблицу → EXCHANGE TABLES. Читатель отчёта никогда не
# видит полупустую таблицу.
#
# Запуск: по расписанию раз в 15 минут + пинком из n8n после сохранения.
# Схемы и логика — docs/ta_saved/PLAN.md §2, §4.
#
# **ЗАПОЛНИТЬ**: блок «Конфиг» и функции `read_dlh` / `read_mdm` — под движок
# DLH (PLAN.md §7.4). Всё остальное от движка не зависит.

# %% Конфиг
import json
import os
from datetime import datetime, timezone

import pandas as pd

DLH_EVENTS = 'proteus_adoption.ta_event'
MDM_TABLE = 'mdm_employee_daily_proteus'   # последний report_dt
CH_DB = 'adoption'
CH = dict(
    host=os.environ.get('CH_HOST', 'clickhouse.local'),
    port=int(os.environ.get('CH_PORT', '8443')),
    username=os.environ.get('CH_USER', ''),
    password=os.environ.get('CH_PASSWORD', ''),
    secure=True,
)
DIMS = ['lvl3', 'lvl4', 'stream', 'spec', 'exp', 'it', 'hq', 'adgroup']
# Колонка mdm, с которой сравнивается каждый разрез. Проверить имена в mdm.
MDM_COL = {
    'lvl3': 'lvl3_code', 'lvl4': 'lvl4_code', 'stream': 'stream_code', 'spec': 'spec_code',
    'exp': 'exp_bucket', 'it': 'it_flg_code', 'hq': 'hq_flg_code', 'adgroup': 'ad_groups',
}
DRY_RUN = os.environ.get('TA_SYNC_DRY_RUN', '0') == '1'

# %% Чтение из DLH — ЗАПОЛНИТЬ под движок
def read_dlh() -> pd.DataFrame:
    """Все события ta_event. Вариант Spark (по умолчанию) или Trino — оставить один."""
    from pyspark.sql import SparkSession
    spark = SparkSession.builder.getOrCreate()
    return spark.table(DLH_EVENTS).toPandas()
    # Trino:
    # import trino; conn = trino.dbapi.connect(...)
    # return pd.read_sql(f'SELECT * FROM {DLH_EVENTS}', conn)


def read_mdm() -> pd.DataFrame:
    """Срез сотрудников на последнюю дату: user_id + колонки из MDM_COL.
    ad_groups — массив (list). Источник — тот же, из которого строится ds_audience."""
    from pyspark.sql import SparkSession
    spark = SparkSession.builder.getOrCreate()
    cols = ', '.join(['user_id'] + sorted(set(MDM_COL.values())))
    return spark.sql(
        f'SELECT {cols} FROM {MDM_TABLE} '
        f'WHERE report_dt = (SELECT max(report_dt) FROM {MDM_TABLE}) AND is_active = 1'
    ).toPandas()


# %% Текущее состояние: последнее событие на отчёт
events = read_dlh()
for k in DIMS:
    events['f_' + k] = events['f_' + k].apply(lambda v: sorted(list(v)) if v is not None else [])

assert events['event_id'].is_unique, 'дубли event_id в ta_event'
dup = events.groupby(['dashboard_id', 'version']).size()
assert (dup == 1).all(), f'две записи одной версии: {dup[dup > 1].index.tolist()}'

last = (events.sort_values(['dashboard_id', 'version'])
        .groupby('dashboard_id', as_index=False).tail(1))
current = last[last['action'] == 'save'].copy()
print(f'событий: {len(events)}, отчётов с историей: {last.shape[0]}, активных ЦА: {len(current)}')

# %% Сверка со свежим mdm: исчезнувшие коды и численность сегодня
mdm = read_mdm()
existing = {
    k: set(v for arr in mdm[MDM_COL[k]] for v in arr) if k == 'adgroup' else set(mdm[MDM_COL[k]].dropna())
    for k in DIMS
}


def stale_of(row):
    return [f'{k}:{v}' for k in DIMS for v in row['f_' + k] if v not in existing[k]]


def audience_now(row) -> int:
    """Те же предикаты, что в ds_audience (PLAN.md §5.1) и customAudience() в макете."""
    m = pd.Series(True, index=mdm.index)
    for k in DIMS:
        vals = row['f_' + k]
        if not vals:
            continue
        col = mdm[MDM_COL[k]]
        m &= col.apply(lambda gs: bool(set(gs) & set(vals))) if k == 'adgroup' else col.isin(vals)
    return int(m.sum())


current['stale_values'] = current.apply(stale_of, axis=1)
current['ta_status'] = current['stale_values'].apply(lambda s: 'stale' if s else 'active')
current['audience_cnt_now'] = current.apply(audience_now, axis=1)
current['loaded_at'] = datetime.now(timezone.utc).replace(tzinfo=None)

print(current[['dashboard_id', 'version', 'ta_status', 'audience_cnt', 'audience_cnt_now']].to_string(index=False))

# %% Колонки ровно как в ClickHouse
TA_CURRENT_COLS = (['dashboard_id', 'version', 'ta_status'] + ['f_' + k for k in DIMS] +
                   ['labels_json', 'stale_values', 'audience_cnt_save', 'audience_cnt_now',
                    'comment', 'saved_by', 'saved_at', 'loaded_at'])
current = current.rename(columns={'audience_cnt': 'audience_cnt_save'})
current['saved_at'] = pd.to_datetime(current['saved_at'], utc=True).dt.tz_localize(None)
current['comment'] = current['comment'].fillna('')
ta_current = current[TA_CURRENT_COLS]

TA_EVENT_COLS = (['event_id', 'request_id', 'dashboard_id', 'action', 'version'] +
                 ['f_' + k for k in DIMS] +
                 ['filters_json', 'labels_json', 'audience_cnt', 'access_cnt', 'comment',
                  'saved_by', 'saved_at', 'client'])
ta_event = events.copy()
ta_event['saved_at'] = pd.to_datetime(ta_event['saved_at'], utc=True).dt.tz_localize(None)
ta_event['comment'] = ta_event['comment'].fillna('')
ta_event = ta_event[TA_EVENT_COLS]

# %% DDL (идемпотентно)
DDL = {
    'ta_current': f'''
CREATE TABLE IF NOT EXISTS {CH_DB}.{{t}} (
  dashboard_id UInt64, version UInt32, ta_status LowCardinality(String),
  {', '.join(f'f_{k} Array(String)' for k in DIMS)},
  labels_json String, stale_values Array(String),
  audience_cnt_save UInt32, audience_cnt_now UInt32,
  comment String, saved_by String, saved_at DateTime, loaded_at DateTime
) ENGINE = MergeTree ORDER BY dashboard_id''',
    'ta_event': f'''
CREATE TABLE IF NOT EXISTS {CH_DB}.{{t}} (
  event_id String, request_id String, dashboard_id UInt64,
  action LowCardinality(String), version UInt32,
  {', '.join(f'f_{k} Array(String)' for k in DIMS)},
  filters_json String, labels_json String, audience_cnt UInt32, access_cnt UInt32,
  comment String, saved_by String, saved_at DateTime, client LowCardinality(String)
) ENGINE = MergeTree ORDER BY (dashboard_id, version)''',
}

# %% Атомарная перезаливка: tmp → EXCHANGE TABLES
def reload(client, name: str, df: pd.DataFrame):
    tmp = f'{name}__tmp'
    client.command(DDL[name].format(t=name))
    client.command(f'DROP TABLE IF EXISTS {CH_DB}.{tmp}')
    client.command(DDL[name].format(t=tmp))
    if len(df):
        client.insert_df(f'{CH_DB}.{tmp}', df)
    got = client.command(f'SELECT count() FROM {CH_DB}.{tmp}')
    assert int(got) == len(df), f'{name}: в tmp {got} строк, ожидали {len(df)}'
    client.command(f'EXCHANGE TABLES {CH_DB}.{tmp} AND {CH_DB}.{name}')
    client.command(f'DROP TABLE IF EXISTS {CH_DB}.{tmp}')
    print(f'{CH_DB}.{name}: {len(df)} строк')


if DRY_RUN:
    print('DRY_RUN: в ClickHouse не пишем')
else:
    import clickhouse_connect
    ch = clickhouse_connect.get_client(**CH)
    reload(ch, 'ta_event', ta_event)
    reload(ch, 'ta_current', ta_current)   # последней: отчёт читает её

    # Проверки после заливки
    n = int(ch.command(f'SELECT count() FROM {CH_DB}.ta_current'))
    u = int(ch.command(f'SELECT uniqExact(dashboard_id) FROM {CH_DB}.ta_current'))
    assert n == u == len(ta_current), f'ta_current: строк {n}, отчётов {u}, ожидали {len(ta_current)}'
    stale = ta_current[ta_current['ta_status'] == 'stale']
    if len(stale):
        print(f'ВНИМАНИЕ: {len(stale)} ЦА ссылаются на исчезнувшие значения:',
              stale[['dashboard_id', 'stale_values']].to_dict('records'))
