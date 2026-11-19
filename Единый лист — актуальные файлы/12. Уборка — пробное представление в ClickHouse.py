# ИТОГ ПРОБЫ (2026-10-22) и УБОРКА.
# Проба показала: CREATE VIEW через click_execute проходит, запрос к представлению с параметрами работает, DROP — запрещён.
# Вики trueBI «EOL click_execute»: 09.11.2026 click_execute отключают совсем, DROP VIEW «не будет предоставлена —
# View не поддерживаются в Proteus». Значит, представления для скорости не подходят: обновить или убрать их потом
# будет нечем. Скорость берём другим путём (сборка SQL, файлы 3, 5, 7 от 22.10).
#
# После пробы в ClickHouse осталось пустое пробное представление prod_proteus.pa_view_probe (данных в нём нет,
# нагрузки не даёт). Параграф ниже пробует убрать его разрешёнными функциями удаления (в ClickHouse DROP TABLE
# удаляет и представление). Временный python-параграф в Helicopter, после запуска — удалить параграф.
# Прислать вывод целиком. Если все попытки «не вышло» — не страшно: можно оставить или попросить команду Proteus.
import inspect
import traceback

print('=== УБОРКА: prod_proteus.pa_view_probe ===')
import proteus_py.database.clickhouse as ppy

for n in ['click_drop_table', 'drop_ch_table']:
    f = getattr(ppy, n, None)
    try:
        print(n, inspect.signature(f) if f else '— нет в модуле')
    except Exception:
        print(n, traceback.format_exc()[-300:])

done = False
for n, args in [('click_drop_table', ('pa_view_probe',)), ('click_drop_table', ('prod_proteus.pa_view_probe',)),
                ('click_drop_table', ('prod_proteus', 'pa_view_probe')),
                ('drop_ch_table', ('pa_view_probe',)), ('drop_ch_table', ('prod_proteus.pa_view_probe',)),
                ('drop_ch_table', ('prod_proteus', 'pa_view_probe'))]:
    f = getattr(ppy, n, None)
    if done or f is None:
        continue
    try:
        r = f(*args)
        print('УДАЛЕНО:', n, args, '→', str(r)[:200])
        done = True
    except Exception:
        print('не вышло', n, args, traceback.format_exc()[-300:])
print('=== конец; проверка в SQL Lab: SELECT * FROM prod_proteus.pa_view_probe(x = \'проба\') — после удаления ошибка «не существует» ===')
