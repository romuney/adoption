# Uses the same supported gp_to_click API as the production notebook.
# No click_execute / views / unverified atomic RENAME API.
import proteus_py.database.clickhouse as ppy
# Invalidate publication BEFORE the first data table changes. If this fails,
# execution raises and no data export below runs.
ppy.gp_to_click('pa_next_loading', 'prod_proteus.pa_next_manifest',
                order_by_columns='(run_id)')
ppy.gp_to_click('pa_next_evd_day', 'prod_proteus.pa_next_evd_day', partition_by_columns='toYYYYMM(log_dttm)', order_by_columns='(dashboard_id, login, log_dttm)')
ppy.gp_to_click('pa_next_dash_meta', 'prod_proteus.pa_next_dash_meta', order_by_columns='(dashboard_id)', array_type_cast=True)
ppy.gp_to_click('pa_next_emp_attrs', 'prod_proteus.pa_next_emp_attrs', order_by_columns='(login)', array_type_cast=True)
ppy.gp_to_click('pa_next_pair', 'prod_proteus.pa_next_pair', order_by_columns='(dashboard_id, login)')
ppy.gp_to_click('pa_next_dash_bkt', 'prod_proteus.pa_next_dash_bkt', order_by_columns='(grain, dashboard_id, k)')
ppy.gp_to_click('pa_next_login_map', 'prod_proteus.pa_next_login_map', order_by_columns='(login)')
ppy.gp_to_click('pa_next_staff', 'prod_proteus.pa_next_staff', order_by_columns='(login)')
ppy.gp_to_click('pa_next_dash_acl', 'prod_proteus.pa_next_dash_acl', order_by_columns='(dashboard_id, kind, principal)')
ppy.gp_to_click('pa_next_adg_member', 'prod_proteus.pa_next_adg_member', order_by_columns='(ad_group, login)')
ppy.gp_to_click('pa_next_dash_ca', 'prod_proteus.pa_next_dash_ca', order_by_columns='(dashboard_id)')
ppy.gp_to_click('pa_next_adg_size', 'prod_proteus.pa_next_adg_size', order_by_columns='(ad_group)')
ppy.gp_to_click('pa_next_pair_acc', 'prod_proteus.pa_next_pair_acc', order_by_columns='(dashboard_id, login)')
ppy.gp_to_click('pa_next_md', 'prod_proteus.pa_next_md', order_by_columns='(md)')
ppy.gp_to_click('pa_next_dict', 'prod_proteus.pa_next_dict', order_by_columns='(g, code)')
ppy.gp_to_click('pa_next_viewer', 'prod_proteus.pa_next_viewer', order_by_columns='(login)', array_type_cast=True)
ppy.gp_to_click('pa_next_staffx', 'prod_proteus.pa_next_staffx', order_by_columns='(login)', array_type_cast=True)
ppy.gp_to_click('pa_next_dash_day', 'prod_proteus.pa_next_dash_day', order_by_columns='(dashboard_id, dt)')
ppy.gp_to_click('pa_next_all_day', 'prod_proteus.pa_next_all_day', order_by_columns='(pub, act, dt)')
ppy.gp_to_click('pa_next_cat_rep', 'prod_proteus.pa_next_cat_rep', order_by_columns='(exc, dashboard_id)')
ppy.gp_to_click('pa_next_cat_grp', 'prod_proteus.pa_next_cat_grp', order_by_columns='(pub, act, exc, kd, k0)')
ppy.gp_to_click('pa_next_cat_aud', 'prod_proteus.pa_next_cat_aud', order_by_columns='(pub, act, exc, ad, ak0)')
ppy.gp_to_click('pa_next_person_id_map', 'prod_proteus.pa_next_person_id_map', order_by_columns='(master_id, login)')
# Publish ready LAST; exceptions propagate and stop subsequent export calls.
ppy.gp_to_click('pa_next_ready', 'prod_proteus.pa_next_manifest',
                order_by_columns='(run_id)')
print('PA NEXT: all data tables uploaded; generation published ready')
