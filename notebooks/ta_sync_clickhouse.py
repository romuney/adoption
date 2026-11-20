# %% [markdown]
# # ta_sync — утверждённые ЦА: DLH (Trino) → ClickHouse
#
# Читает журнал `ta_event` (пишет n8n), собирает текущее состояние по каждому
# отчёту, сверяет условия со свежим mdm и **атомарно** перезаливает
# `adoption.ta_current` и зеркало `adoption.ta_event` в ClickHouse.
#
# Таблица маленькая (сотни строк), поэтому каждый запуск — полная пересборка:
# INSERT во временную → EXCHANGE TABLES. Отчёт никогда не видит полупустую таблицу.
#
# Расписание: раз в 15–30 минут. Логика — docs/ta_saved/FLOW.md §5.
#
# **ЗАПОЛНИТЬ** только блок «Конфиг»: имена таблиц и колонок — те же, что
# в ноде «Конфиг и валидация» флоу n8n.

# %% Конфиг
import os
from datetime import datetime, timezone

import pandas as pd

T_EVENT = '<catalog>.<schema>.ta_event'
T_MDM = '<catalog>.<schema>.mdm_employee_daily_proteus'
T_ADGROUP = '<catalog>.<schema>.<ad_group_members>'      # login, group_nm
MDM_LOGIN, MDM_DT = 'login', 'report_dt'
# Те же выражения, что DIM_EXPR во флоу: должны возвращать ровно те названия,
# которые показывает конструктор.
DIM_EXPR = {
    'lvl3': 'e.<lvl3_nm>',
    'lvl4': 'e.<lvl4_nm>',
    'stream': 'e.<stream_nm>',
    'spec': 'e.<spec_nm>',
    'exp': ("CASE WHEN date_diff('year', e.<hire_dt>, current_date) < 1 THEN 'до 1 года' "
            "WHEN date_diff('year', e.<hire_dt>, current_date) < 3 THEN '1–3 года' "
            "WHEN date_diff('year', e.<hire_dt>, current_date) < 5 THEN '3–5 лет' "
            "WHEN date_diff('year', e.<hire_dt>, current_date) < 10 THEN '5–10 лет' ELSE '10+ лет' END"),
    'it': "CASE WHEN e.<it_flg> = 1 THEN 'IT' ELSE 'non-IT' END",
    'hq': "CASE WHEN e.<hq_flg> = 1 THEN 'HQ' ELSE 'non-HQ' END",
}
DIMS = ['lvl3', 'lvl4', 'stream', 'spec', 'exp', 'it', 'hq', 'adgroup']

TRINO = dict(
    host=os.environ.get('TRINO_HOST', 'trino.local'), port=int(os.environ.get('TRINO_PORT', '8443')),
    user=os.environ.get('TRINO_USER', ''), http_scheme='https',
)
TRINO_PASSWORD = os.environ.get('TRINO_PASSWORD', '')
CH_DB = 'adoption'
CH = dict(
    host=os.environ.get('CH_HOST', 'clickhouse.local'), port=int(os.environ.get('CH_PORT', '8443')),
    username=os.environ.get('CH_USER', ''), password=os.environ.get('CH_PASSWORD', ''), secure=True,
)
DRY_RUN = os.environ.get('TA_SYNC_DRY_RUN', '0') == '1'

# %% Чтение из Trino
def trino_df(sql: str) -> pd.DataFrame:
    import trino
    auth = trino.auth.BasicAuthentication(TRINO['user'], TRINO_PASSWORD) if TRINO_PASSWORD else None
    with trino.dbapi.connect(**TRINO, auth=auth) as conn:
        cur = conn.cursor()
        cur.execute(sql)
        cols = [d[0] for d in cur.description]
        return pd.DataFrame(cur.fetchall(), columns=cols)


def read_events() -> pd.DataFrame:
    return trino_df(f'SELECT * FROM {T_EVENT}')


def read_mdm() -> pd.DataFrame:
    """Сотрудники на последнюю дату: login + по колонке на разрез (названия) + ad_groups (list)."""
    sel = ', '.join(f'{ex} AS {k}' for k, ex in DIM_EXPR.items())
    return trino_df(f'''
        SELECT lower(e.{MDM_LOGIN}) AS login, {sel},
               coalesce(g.groups, ARRAY[]) AS ad_groups
        FROM {T_MDM} e
        LEFT JOIN (SELECT lower(login) AS login, array_agg(DISTINCT group_nm) AS groups
                   FROM {T_ADGROUP} GROUP BY 1) g ON g.login = lower(e.{MDM_LOGIN})
        WHERE e.{MDM_DT} = (SELECT max({MDM_DT}) FROM {T_MDM})''')


# %% Текущее состояние: последнее событие на отчёт
events = read_events()
for k in DIMS:
    events['f_' + k] = events['f_' + k].apply(lambda v: sorted(v) if v is not None else [])
events['saved_at'] = pd.to_datetime(events['saved_at'], utc=True)

# Две записи одной версии возможны только при одновременной записи двух владельцев
# (условная вставка в Iceberg не сериализуется). Побеждает более поздняя — и громко пишем.
dups = events[events.duplicated(['dashboard_id', 'version'], keep=False)]
if len(dups):
    print('ВНИМАНИЕ: конкурентная запись, оставляем позднюю:',
          dups[['dashboard_id', 'version', 'saved_by', 'saved_at']].to_dict('records'))

last = (events.sort_values(['dashboard_id', 'version', 'saved_at'])
        .groupby('dashboard_id', as_index=False).tail(1))
current = last[last['action'] == 'save'].copy()
print(f'событий: {len(events)}, отчётов с историей: {len(last)}, активных ЦА: {len(current)}')

# %% Сверка со свежим mdm: исчезнувшие значения и численность сегодня
mdm = read_mdm()
existing = {k: set(mdm[k].dropna()) for k in DIM_EXPR}
existing['adgroup'] = {g for gs in mdm['ad_groups'] for g in gs}


def stale_of(row):
    """Значения, которых больше нет в структуре (подразделение переименовали/расформировали)."""
    return [f'{k}: {v}' for k in DIMS for v in row['f_' + k] if v not in existing[k]]


def audience_now(row) -> int:
    """Те же предикаты, что во флоу и в ds_audience: внутри разреза ИЛИ, между — И."""
    m = pd.Series(True, index=mdm.index)
    for k in DIMS:
        vals = row['f_' + k]
        if not vals:
            continue
        if k == 'adgroup':
            m &= mdm['ad_groups'].apply(lambda gs, s=set(vals): bool(s.intersection(gs)))
        else:
            m &= mdm[k].isin(vals)
    return int(m.sum())


if len(current):
    current['stale_values'] = current.apply(stale_of, axis=1)
    current['audience_cnt_now'] = current.apply(audience_now, axis=1)
else:
    current['stale_values'] = pd.Series(dtype=object)
    current['audience_cnt_now'] = pd.Series(dtype=int)
current['ta_status'] = current['stale_values'].apply(lambda s: 'stale' if s else 'active')
current['loaded_at'] = datetime.now(timezone.utc).replace(tzinfo=None)

# %% Колонки ровно как в ClickHouse
F_COLS = ['f_' + k for k in DIMS]
current = current.rename(columns={'audience_cnt': 'audience_cnt_save'})
current['audience_cnt_save'] = current['audience_cnt_save'].fillna(0).astype(int)
current['saved_at'] = current['saved_at'].dt.tz_localize(None)
current['comment'] = current['comment'].fillna('')
ta_current = current[['dashboard_id', 'version', 'ta_status'] + F_COLS +
                     ['stale_values', 'audience_cnt_save', 'audience_cnt_now',
                      'comment', 'saved_by', 'saved_at', 'loaded_at']]

ta_event = events.copy()
ta_event['saved_at'] = ta_event['saved_at'].dt.tz_localize(None)
ta_event['comment'] = ta_event['comment'].fillna('')
ta_event['audience_cnt'] = ta_event['audience_cnt'].fillna(0).astype(int)
ta_event = ta_event[['event_id', 'request_id', 'dashboard_id', 'action', 'version'] + F_COLS +
                    ['audience_cnt', 'comment', 'saved_by', 'saved_at', 'client']]

print(ta_current[['dashboard_id', 'version', 'ta_status', 'audience_cnt_save', 'audience_cnt_now']].to_string(index=False))

# %% DDL ClickHouse (идемпотентно)
F_DDL = ', '.join(f'{c} Array(String)' for c in F_COLS)
DDL = {
    'ta_current': f'''CREATE TABLE IF NOT EXISTS {CH_DB}.{{t}} (
  dashboard_id UInt64, version UInt32, ta_status LowCardinality(String), {F_DDL},
  stale_values Array(String), audience_cnt_save UInt32, audience_cnt_now UInt32,
  comment String, saved_by String, saved_at DateTime, loaded_at DateTime
) ENGINE = MergeTree ORDER BY dashboard_id''',
    'ta_event': f'''CREATE TABLE IF NOT EXISTS {CH_DB}.{{t}} (
  event_id String, request_id String, dashboard_id UInt64,
  action LowCardinality(String), version UInt32, {F_DDL},
  audience_cnt UInt32, comment String, saved_by String, saved_at DateTime,
  client LowCardinality(String)
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
    got = int(client.command(f'SELECT count() FROM {CH_DB}.{tmp}'))
    assert got == len(df), f'{name}: в tmp {got} строк, ожидали {len(df)}'
    client.command(f'EXCHANGE TABLES {CH_DB}.{tmp} AND {CH_DB}.{name}')
    client.command(f'DROP TABLE IF EXISTS {CH_DB}.{tmp}')
    print(f'{CH_DB}.{name}: {len(df)} строк')


if DRY_RUN:
    print('DRY_RUN: в ClickHouse не пишем')
else:
    import clickhouse_connect
    ch = clickhouse_connect.get_client(**CH)
    reload(ch, 'ta_event', ta_event)
    reload(ch, 'ta_current', ta_current)   # последней: её читает отчёт
    n = int(ch.command(f'SELECT count() FROM {CH_DB}.ta_current'))
    u = int(ch.command(f'SELECT uniqExact(dashboard_id) FROM {CH_DB}.ta_current'))
    assert n == u == len(ta_current), f'ta_current: строк {n}, отчётов {u}, ожидали {len(ta_current)}'
    stale = ta_current[ta_current['ta_status'] == 'stale']
    if len(stale):
        print(f'ВНИМАНИЕ: {len(stale)} ЦА ссылаются на исчезнувшие значения:',
              stale[['dashboard_id', 'stale_values']].to_dict('records'))
