# Helicopter-нода 844437 · добавить в python_condition-параграф выгрузки «PA · …»
# (после строк поставки 2026-09-22). ORDER BY — под фильтры датасета «Аудитории»:
# права режутся по dashboard_id (область), состав групп — по ad_group, штат — по login.
try:
    import proteus_py.database.clickhouse as ppy
    ppy.gp_to_click('usr_cross_data.pa_staff', 'prod_proteus.pa_staff',
                    order_by_columns='(login)')
    ppy.gp_to_click('usr_cross_data.pa_dash_acl', 'prod_proteus.pa_dash_acl',
                    order_by_columns='(dashboard_id, kind, principal)')
    ppy.gp_to_click('usr_cross_data.pa_adg_member', 'prod_proteus.pa_adg_member',
                    order_by_columns='(ad_group, login)')
    ppy.gp_to_click('usr_cross_data.pa_dash_ca', 'prod_proteus.pa_dash_ca',
                    order_by_columns='(dashboard_id)')
    # НОВОЕ 2026-09-25: размер AD-групп прав — список «AD-группы» в настройке ЦА.
    ppy.gp_to_click('usr_cross_data.pa_adg_size', 'prod_proteus.pa_adg_size',
                    order_by_columns='(ad_group)')
    # НОВОЕ 2026-09-25 (вечер): доступ зрителей — числитель «Охвата ЦА» каталога вкладки.
    ppy.gp_to_click('usr_cross_data.pa_pair_acc', 'prod_proteus.pa_pair_acc',
                    order_by_columns='(dashboard_id, login)')
except Exception:
    sys.exit(100);
