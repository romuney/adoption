# Helicopter-нода 844437 · дописать в python-параграф выгрузки «PA · …» (после pa_dash_ca).
try:
    import proteus_py.database.clickhouse as ppy
    ppy.gp_to_click('usr_cross_data.pa_adg_size', 'prod_proteus.pa_adg_size',
                    order_by_columns='(ad_group)')
except Exception:
    sys.exit(100);
