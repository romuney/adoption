# ЕДИНЫЙ ЛИСТ — выгрузка всех витрин в ClickHouse (prod_proteus.pa_*). Те же вызовы, что уже стоят в двух нодах
# боевого отчёта; если они работают — ничего не менять. Часть 2 — после части 1 (зависит от pa_pair).

# ---------------- ЧАСТЬ 1: витрины первого листа ----------------
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
    # НОВОЕ 2026-10-07: словарь «старый логин → текущий» — кнопка «Мои отчёты» каталога узнаёт текущего
    # пользователя по логину Proteus (может быть старым) и переводит его в актуальный, как у владельцев.
    ppy.gp_to_click('usr_cross_data.pa_login_map', 'prod_proteus.pa_login_map',
                    order_by_columns='(login)')
except Exception:
    sys.exit(100);


# ---------------- ЧАСТЬ 2: витрины целевой аудитории (нода 844437) ----------------
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

# ---------------- ЧАСТЬ 3: витрины ускорения (НОВОЕ 2026-10-23, после частей 1 и 2) ----------------
# Helicopter-нода 844437 · добавить в тот же python_condition-параграф выгрузки, ПОСЛЕ строк части 2.
# Готовые атрибуты людей, коды, дата свежести и календари по дням — их читают датасеты листа (файлы 3, 5, 7
# поставки 2026-10-23). pa_acc_any — служебная GP-таблица, в ClickHouse не выгружается.
try:
    import proteus_py.database.clickhouse as ppy
    ppy.gp_to_click('usr_cross_data.pa_md', 'prod_proteus.pa_md',
                    order_by_columns='(md)')
    ppy.gp_to_click('usr_cross_data.pa_dict', 'prod_proteus.pa_dict',
                    order_by_columns='(g, code)')
    ppy.gp_to_click('usr_cross_data.pa_viewer', 'prod_proteus.pa_viewer',
                    order_by_columns='(login)', array_type_cast=True)
    ppy.gp_to_click('usr_cross_data.pa_staffx', 'prod_proteus.pa_staffx',
                    order_by_columns='(login)', array_type_cast=True)
    ppy.gp_to_click('usr_cross_data.pa_dash_day', 'prod_proteus.pa_dash_day',
                    order_by_columns='(dashboard_id, dt)')
    ppy.gp_to_click('usr_cross_data.pa_all_day', 'prod_proteus.pa_all_day',
                    order_by_columns='(pub, act, dt)')
    # готовые строки каталога без людских условий (открытие борда, период, переключатели)
    ppy.gp_to_click('usr_cross_data.pa_cat_rep', 'prod_proteus.pa_cat_rep',
                    order_by_columns='(dashboard_id)')
    ppy.gp_to_click('usr_cross_data.pa_cat_grp', 'prod_proteus.pa_cat_grp',
                    order_by_columns='(kd, k0)')
    ppy.gp_to_click('usr_cross_data.pa_cat_aud', 'prod_proteus.pa_cat_aud',
                    order_by_columns='(ad, ak0)')
except Exception:
    sys.exit(100);
