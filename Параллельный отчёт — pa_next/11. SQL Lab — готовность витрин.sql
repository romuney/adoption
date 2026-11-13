-- PA NEXT: read-only check after the entire notebook completes.
-- Expected: 21 rows; each ready=1, publication_state=ready, same published_run.
-- Empty business tables are allowed. Any query error or ready=0: stop installation.
SELECT t.*, m.run_id AS published_run, m.state AS publication_state,
       toUInt8(m.records = 1 AND m.state = 'ready' AND
         (t.rows = 0 OR (t.min_run = m.run_id AND t.max_run = m.run_id))) AS ready
FROM (
SELECT 'prod_proteus.pa_next_evd_day' AS table_name, count() AS rows, min(_pa_next_run) AS min_run, max(_pa_next_run) AS max_run FROM prod_proteus.pa_next_evd_day
UNION ALL
SELECT 'prod_proteus.pa_next_dash_meta' AS table_name, count() AS rows, min(_pa_next_run) AS min_run, max(_pa_next_run) AS max_run FROM prod_proteus.pa_next_dash_meta
UNION ALL
SELECT 'prod_proteus.pa_next_emp_attrs' AS table_name, count() AS rows, min(_pa_next_run) AS min_run, max(_pa_next_run) AS max_run FROM prod_proteus.pa_next_emp_attrs
UNION ALL
SELECT 'prod_proteus.pa_next_pair' AS table_name, count() AS rows, min(_pa_next_run) AS min_run, max(_pa_next_run) AS max_run FROM prod_proteus.pa_next_pair
UNION ALL
SELECT 'prod_proteus.pa_next_dash_bkt' AS table_name, count() AS rows, min(_pa_next_run) AS min_run, max(_pa_next_run) AS max_run FROM prod_proteus.pa_next_dash_bkt
UNION ALL
SELECT 'prod_proteus.pa_next_login_map' AS table_name, count() AS rows, min(_pa_next_run) AS min_run, max(_pa_next_run) AS max_run FROM prod_proteus.pa_next_login_map
UNION ALL
SELECT 'prod_proteus.pa_next_staff' AS table_name, count() AS rows, min(_pa_next_run) AS min_run, max(_pa_next_run) AS max_run FROM prod_proteus.pa_next_staff
UNION ALL
SELECT 'prod_proteus.pa_next_dash_acl' AS table_name, count() AS rows, min(_pa_next_run) AS min_run, max(_pa_next_run) AS max_run FROM prod_proteus.pa_next_dash_acl
UNION ALL
SELECT 'prod_proteus.pa_next_adg_member' AS table_name, count() AS rows, min(_pa_next_run) AS min_run, max(_pa_next_run) AS max_run FROM prod_proteus.pa_next_adg_member
UNION ALL
SELECT 'prod_proteus.pa_next_dash_ca' AS table_name, count() AS rows, min(_pa_next_run) AS min_run, max(_pa_next_run) AS max_run FROM prod_proteus.pa_next_dash_ca
UNION ALL
SELECT 'prod_proteus.pa_next_adg_size' AS table_name, count() AS rows, min(_pa_next_run) AS min_run, max(_pa_next_run) AS max_run FROM prod_proteus.pa_next_adg_size
UNION ALL
SELECT 'prod_proteus.pa_next_pair_acc' AS table_name, count() AS rows, min(_pa_next_run) AS min_run, max(_pa_next_run) AS max_run FROM prod_proteus.pa_next_pair_acc
UNION ALL
SELECT 'prod_proteus.pa_next_md' AS table_name, count() AS rows, min(_pa_next_run) AS min_run, max(_pa_next_run) AS max_run FROM prod_proteus.pa_next_md
UNION ALL
SELECT 'prod_proteus.pa_next_dict' AS table_name, count() AS rows, min(_pa_next_run) AS min_run, max(_pa_next_run) AS max_run FROM prod_proteus.pa_next_dict
UNION ALL
SELECT 'prod_proteus.pa_next_viewer' AS table_name, count() AS rows, min(_pa_next_run) AS min_run, max(_pa_next_run) AS max_run FROM prod_proteus.pa_next_viewer
UNION ALL
SELECT 'prod_proteus.pa_next_staffx' AS table_name, count() AS rows, min(_pa_next_run) AS min_run, max(_pa_next_run) AS max_run FROM prod_proteus.pa_next_staffx
UNION ALL
SELECT 'prod_proteus.pa_next_dash_day' AS table_name, count() AS rows, min(_pa_next_run) AS min_run, max(_pa_next_run) AS max_run FROM prod_proteus.pa_next_dash_day
UNION ALL
SELECT 'prod_proteus.pa_next_all_day' AS table_name, count() AS rows, min(_pa_next_run) AS min_run, max(_pa_next_run) AS max_run FROM prod_proteus.pa_next_all_day
UNION ALL
SELECT 'prod_proteus.pa_next_cat_rep' AS table_name, count() AS rows, min(_pa_next_run) AS min_run, max(_pa_next_run) AS max_run FROM prod_proteus.pa_next_cat_rep
UNION ALL
SELECT 'prod_proteus.pa_next_cat_grp' AS table_name, count() AS rows, min(_pa_next_run) AS min_run, max(_pa_next_run) AS max_run FROM prod_proteus.pa_next_cat_grp
UNION ALL
SELECT 'prod_proteus.pa_next_cat_aud' AS table_name, count() AS rows, min(_pa_next_run) AS min_run, max(_pa_next_run) AS max_run FROM prod_proteus.pa_next_cat_aud
) AS t
CROSS JOIN (
  SELECT count() AS records, any(run_id) AS run_id, any(state) AS state
  FROM prod_proteus.pa_next_manifest
) AS m
ORDER BY table_name
