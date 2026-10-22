# ПРОБА (2026-10-22): можно ли создать в ClickHouse (база prod_proteus) ПРЕДСТАВЛЕНИЕ С ПАРАМЕТРАМИ.
# Зачем: тело запроса панели переедет в ClickHouse, а датасет Proteus станет одной строкой вызова — Superset разбирает
# текст 0,02 с вместо 6–9 с (стенд). Системные таблицы для этого НЕ нужны — только право создать представление.
# Проба ничего не трогает в отчёте: создаёт пробное представление prod_proteus.pa_view_probe и сразу удаляет.
#
# ── СПОСОБ 1: SQL Lab (быстрее всего) ─────────────────────────────────────────────────────────────────────────────
# Выполнить по одной, в базе, где лежат prod_proteus.pa_*:
#
#   CREATE VIEW prod_proteus.pa_view_probe AS SELECT {x:String} AS v, 1 AS one
#
#   SELECT * FROM prod_proteus.pa_view_probe(x = 'проба')
#
#   DROP VIEW prod_proteus.pa_view_probe
#
# Прислать, что ответила каждая (текст ошибки целиком, если красное). Ответ «Only SELECT statements are allowed»
# или похожий — SQL Lab команды создания не пускает, тогда способ 2.
#
# ── СПОСОБ 2: Helicopter, python-параграф ────────────────────────────────────────────────────────────────────────
# Временный параграф в той же ноде, где выгрузка витрин (файл 2), ПОСЛЕ неё; после пробы — удалить. Узел не роняет
# (ошибки только печатает). Прислать вывод параграфа целиком.
import traceback

print('=== ПРОБА: представление в ClickHouse ===')
try:
    import proteus_py.database.clickhouse as ppy
except Exception:
    print('нет proteus_py.database.clickhouse:', traceback.format_exc()[-500:])
    ppy = None

if ppy is not None:
    # что умеет модуль: ищем вызов произвольного запроса
    names = [n for n in dir(ppy) if not n.startswith('_')]
    print('функции модуля:', ', '.join(names))
    run = None
    for n in ['execute', 'execute_query', 'run_query', 'query', 'command', 'click_execute', 'execute_sql', 'sql']:
        f = getattr(ppy, n, None)
        if callable(f):
            run = (n, f)
            break
    client = None
    if run is None:
        for n in ['get_client', 'client', 'get_connection', 'connection', 'connect', 'get_click_client', 'ch_client']:
            f = getattr(ppy, n, None)
            if f is None:
                continue
            try:
                client = f() if callable(f) else f
                print('клиент из', n, '→', type(client))
                break
            except Exception:
                print(n, '— не вышло:', traceback.format_exc()[-300:])

    def q(sql):
        if run is not None:
            return run[1](sql)
        if client is not None:
            for m in ['command', 'execute', 'query']:
                if hasattr(client, m):
                    return getattr(client, m)(sql)
        raise RuntimeError('не нашли, чем выполнить запрос')

    if run is None and client is None:
        print('Вызова произвольного запроса в модуле не видно — пришли список функций выше.')
    else:
        print('выполняем через', run[0] if run else type(client))
        for sql in ["CREATE VIEW prod_proteus.pa_view_probe AS SELECT {x:String} AS v, 1 AS one",
                    "SELECT * FROM prod_proteus.pa_view_probe(x = 'проба')",
                    "DROP VIEW prod_proteus.pa_view_probe"]:
            try:
                print('OK  ', sql[:70], '→', str(q(sql))[:200])
            except Exception:
                print('FAIL', sql[:70], '→', traceback.format_exc()[-600:])
print('=== конец пробы ===')
