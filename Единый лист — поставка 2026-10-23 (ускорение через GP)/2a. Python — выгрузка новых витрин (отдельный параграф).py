# Helicopter-нода 844437 · НОВЫЙ python_condition-параграф «PA · ускорение — выгрузка» (2026-10-23).
# Вставить ЦЕЛИКОМ отдельным параграфом в САМЫЙ КОНЕЦ ноды — после трёх новых gp-параграфов 1a, 1b, 1c.
# Таблицы этих параграфов — без схемы (как period_agg / collection_array этой ноды), их и забираем по имени.
# pa_acc_any — temp-таблица параграфа 1a, сюда не едет. Существующий параграф выгрузки (файл 2) не трогать.
import sys
try:
    import proteus_py.database.clickhouse as ppy
    ppy.gp_to_click('pa_md', 'prod_proteus.pa_md',
                    order_by_columns='(md)')
    ppy.gp_to_click('pa_dict', 'prod_proteus.pa_dict',
                    order_by_columns='(g, code)')
    ppy.gp_to_click('pa_viewer', 'prod_proteus.pa_viewer',
                    order_by_columns='(login)', array_type_cast=True)
    ppy.gp_to_click('pa_staffx', 'prod_proteus.pa_staffx',
                    order_by_columns='(login)', array_type_cast=True)
    ppy.gp_to_click('pa_dash_day', 'prod_proteus.pa_dash_day',
                    order_by_columns='(dashboard_id, dt)')
    ppy.gp_to_click('pa_all_day', 'prod_proteus.pa_all_day',
                    order_by_columns='(pub, act, dt)')
    # готовые строки каталога без людских условий (открытие борда, период, переключатели)
    ppy.gp_to_click('pa_cat_rep', 'prod_proteus.pa_cat_rep',
                    order_by_columns='(exc, dashboard_id)')
    ppy.gp_to_click('pa_cat_grp', 'prod_proteus.pa_cat_grp',
                    order_by_columns='(pub, act, exc, kd, k0)')
    ppy.gp_to_click('pa_cat_aud', 'prod_proteus.pa_cat_aud',
                    order_by_columns='(pub, act, exc, ad, ak0)')
except Exception:
    sys.exit(100);
