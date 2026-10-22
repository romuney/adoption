# Helicopter-нода 844437 · python_condition-параграф после GP-параграфов «PA · …».
# Выгрузка предагрегатов в ClickHouse (prod_proteus.*). ORDER BY подобран под
# фильтры датасетов: пары и факт режутся по dashboard_id (область, pub/act через
# IN dash_ok) и login (людская шина) — первичный ключ отбрасывает гранулы.
# Если pa_evd_day / pa_dash_meta / pa_emp_attrs у вас уже выгружаются своим
# параграфом — оставьте его; обязательно НОВОЕ здесь: pa_pair и пересборка
# pa_emp_attrs (колонки fio, exp_nm, lvl5…lvl7) и pa_dash_bkt (2026-09-23).
try:
    import proteus_py.database.clickhouse as ppy
    ppy.gp_to_click('usr_cross_data.pa_evd_day', 'prod_proteus.pa_evd_day',
                    partition_by_columns='toYYYYMM(log_dttm)',
                    order_by_columns='(dashboard_id, login, log_dttm)')
    ppy.gp_to_click('usr_cross_data.pa_dash_meta', 'prod_proteus.pa_dash_meta',
                    order_by_columns='(dashboard_id)', array_type_cast=True)
    ppy.gp_to_click('usr_cross_data.pa_emp_attrs', 'prod_proteus.pa_emp_attrs',
                    order_by_columns='(login)', array_type_cast=True)
    ppy.gp_to_click('usr_cross_data.pa_pair', 'prod_proteus.pa_pair',
                    order_by_columns='(dashboard_id, login)')
    # НОВОЕ 2026-09-23: просмотры отчёта по бакетам — линия «Просмотры» правой панели.
    ppy.gp_to_click('usr_cross_data.pa_dash_bkt', 'prod_proteus.pa_dash_bkt',
                    order_by_columns='(grain, dashboard_id, k)')
except Exception:
    sys.exit(100);
