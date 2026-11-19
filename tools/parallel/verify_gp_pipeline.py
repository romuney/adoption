#!/usr/bin/env python3
"""Execute every GP paragraph on small corporate-schema fixtures in local PostgreSQL.

PostgreSQL models the portable GP SQL subset; only DISTRIBUTED clauses are removed.
It does not prove deployment permissions or GP-specific query plans.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import psycopg2
from psycopg2.extras import execute_values
import yaml
from verify_events import WORKSPACE, created_tables, freeze_date, paragraph_creating

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'Параллельный отчёт — pa_next'
ROLE = 'pa_next_fixture_reader'


def shared_snapshot(cursor, schemas):
    cursor.execute("SELECT n.nspname,c.relname,c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY(%s) AND c.relkind='r' ORDER BY 1,2", (schemas,))
    tables = cursor.fetchall()
    snapshot = {}
    for schema, name, oid in tables:
        cursor.execute('SELECT row_to_json(t)::text FROM '+schema+'.'+name+' t ORDER BY 1')
        rows = [r[0] for r in cursor.fetchall()]
        snapshot[schema+'.'+name] = {'oid': oid, 'rows': rows}
    return snapshot

def portable(sql):
    return re.sub(r'(?im)^distributed\s+(?:by\s*\([^;]+\)|randomly)\s*;', ';', freeze_date(sql))


def main():
    host = os.environ.get('PGHOST', '')
    if host not in ('127.0.0.1', 'localhost') and not host.startswith(('/workspace/', '/tmp/')):
        raise RuntimeError('Explicit LOCAL PGHOST required')
    # This establishes boundary events and exact original/current source outputs.
    subprocess.run([sys.executable, str(ROOT / 'tools/parallel/verify_events.py')], check=True)
    admin = psycopg2.connect(dbname='postgres'); admin.autocommit = True
    with admin.cursor() as c:
        c.execute("SELECT 1 FROM pg_database WHERE datname='pa_next_full_test'")
        if not c.fetchone():
            c.execute('CREATE DATABASE pa_next_full_test')
        c.execute('SELECT 1 FROM pg_roles WHERE rolname=%s', (ROLE,))
        if not c.fetchone():
            c.execute('CREATE ROLE '+ROLE+' NOLOGIN')
    admin.close()
    source = psycopg2.connect(dbname='pa_next_event_test')
    db = psycopg2.connect(dbname='pa_next_full_test'); db.autocommit = True
    schemas = ['usr_cross_data', 'prod_v_sse_crossdata', 'prod_v_emart', 'prod_v_sse', 'prod_v_chrono_idm_tadam']
    with db.cursor() as c, source.cursor() as old:
        c.execute('DROP SCHEMA IF EXISTS '+WORKSPACE+' CASCADE; CREATE SCHEMA '+WORKSPACE+' AUTHORIZATION '+ROLE)
        for schema in schemas:
            c.execute('DROP SCHEMA IF EXISTS '+schema+' CASCADE; CREATE SCHEMA '+schema)
        c.execute('SET search_path TO usr_cross_data, public')
        for table in ['prod_v_sse_crossdata.event_physical_report', 'usr_cross_data.bl_talent_management']:
            old.execute('SELECT attname, format_type(atttypid, atttypmod) FROM pg_attribute WHERE attrelid=%s::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum', (table,))
            columns = old.fetchall()
            c.execute('CREATE TABLE '+table+' ('+', '.join(n+' '+t for n,t in columns)+')')
            old.execute('SELECT * FROM '+table)
            execute_values(c, 'INSERT INTO '+table+' VALUES %s', old.fetchall())
        c.execute(freeze_date('''CREATE TABLE prod_v_emart.mdm_employee_structure_d (
          mdm_employee_rk bigint, ad_login text, business_dt date, last_state_flg integer,
          company_fire_flg integer, management_head_flg integer,
          lvl3_mapped_management_unit_nm text, lvl4_mapped_management_unit_nm text,
          lvl5_mapped_management_unit_nm text, lvl6_mapped_management_unit_nm text,
          lvl7_mapped_management_unit_nm text, emp_specialization_desc text,
          emp_stream_desc text, experience_group_nm text, emp_specialization_oper_code text,
          emp_specialization_it_code text, last_nm text, first_nm text);
          INSERT INTO prod_v_emart.mdm_employee_structure_d VALUES
          (99,'fixture_user',current_date-100,0,0,0,'Блок','Отдел','','','','Аналитик','Стрим','3 года','HQ','IT','Тест','Человек'),
          (99,'fixture_new',current_date-1,1,0,0,'Блок','Отдел','','','','Аналитик','Стрим','3 года','HQ','IT','Тест','Человек'),
          (100,'fixture_never',current_date-1,1,0,1,'Блок','Отдел','','','','Руководитель','Стрим','5 лет','HQ','IT','Тест','Не заходил');
          CREATE TABLE prod_v_sse.proteus_users (username text, first_name text, last_name text);
          INSERT INTO prod_v_sse.proteus_users VALUES ('fixture_user','Имя','Старый'),('fixture_new','Имя','Новый');
          CREATE TABLE prod_v_sse.proteus_dashboard_access (dashboard_id bigint, user_or_group_name text, access_type text);
          INSERT INTO prod_v_sse.proteus_dashboard_access VALUES
          (900001,'fixture_new','user'),(900001,'fixture_group','group');
          CREATE TABLE prod_v_chrono_idm_tadam.ad_items_records_public
          (guid text, account_name text, item_type text, is_deleted boolean);
          INSERT INTO prod_v_chrono_idm_tadam.ad_items_records_public VALUES
          ('g1','fixture_group','GroupSecurity',false), ('g2','fixture_nested','GroupSecurity',false),
          ('p1','fixture_new','Person',false),('p2','fixture_never','Person',false);
          CREATE TABLE prod_v_chrono_idm_tadam.ad_item_parent_relations_public (parent text, item text);
          INSERT INTO prod_v_chrono_idm_tadam.ad_item_parent_relations_public VALUES ('g1','p1'),('g1','g2'),('g2','p2');'''))
        actual = yaml.safe_load((ROOT / 'Proteus Adoption (4).yaml').read_text())
        baseline = next(p['code'] for p in actual['paragraphs'] if p['shebang']=='gp' and p['title']=='Для единой вкладки')
        event = next(p['code'] for p in actual['paragraphs'] if p['shebang']=='gp' and p['title']=='Финальная таблица из event_physical_report')
        c.execute(portable(event)); c.execute(portable(baseline))
        candidate = yaml.safe_load((OUT / '1. Helicopter — pa_next.yaml').read_text())
        candidate_sha = hashlib.sha256((OUT / '1. Helicopter — pa_next.yaml').read_bytes()).hexdigest()
        made = {table for paragraph in candidate['paragraphs'] if paragraph['shebang'] == 'gp'
                for table in created_tables(paragraph['code'])}
        assert made and all(re.fullmatch(r'pa_next_\w+', name) for name in made), made
        for name in sorted(made):
            c.execute('CREATE TABLE usr_cross_data.'+name+" (protected_marker text); INSERT INTO usr_cross_data."+name+" VALUES ('keep-shared-object')")
        for schema in schemas:
            c.execute('GRANT USAGE ON SCHEMA '+schema+' TO '+ROLE)
            c.execute('GRANT SELECT ON ALL TABLES IN SCHEMA '+schema+' TO '+ROLE)
            c.execute("SELECT has_schema_privilege(%s,%s,'CREATE')", (ROLE, schema))
            assert c.fetchone()[0] is False, schema
        before_shared = shared_snapshot(c, schemas)
        for name in before_shared:
            c.execute("SELECT has_table_privilege(%s,%s,'INSERT,UPDATE,DELETE,TRUNCATE')", (ROLE, name))
            assert c.fetchone()[0] is False, name
        c.execute('SET ROLE '+ROLE)
        executed = []
        for paragraph in candidate['paragraphs']:
            if paragraph['shebang'] == 'gp':
                # A fresh notebook paragraph may start with shared fallback schemas.
                # The shipped guard must remove them before any unqualified DROP.
                c.execute('SET search_path TO '+WORKSPACE+', usr_cross_data, public')
                c.execute(portable(paragraph['code']))
                executed.append(paragraph['title'])
                c.execute('SELECT current_schema()')
                assert c.fetchone()[0] == WORKSPACE
        comparisons = []
        for table in re.findall(r'(?i)create\s+table\s+usr_cross_data\.(pa_\w+)', baseline):
            c.execute('SELECT * FROM usr_cross_data.'+table)
            cols = [d.name for d in c.description]
            before = sorted(json.dumps(row, default=str, ensure_ascii=False) for row in c.fetchall())
            nxt = table.replace('pa_', 'pa_next_', 1)
            c.execute('SELECT '+', '.join(cols)+' FROM '+WORKSPACE+'.'+nxt)
            after = sorted(json.dumps(row, default=str, ensure_ascii=False) for row in c.fetchall())
            assert before == after, table
            comparisons.append({'table':table, 'rows':len(before), 'equal':True})
        assert len(comparisons)==12
        manifest = json.loads((OUT/'src/data-manifest.json').read_text())
        for export in manifest['exports']:
            assert re.fullmatch(r'pa_next_\w+', export['gp']), export['gp']
            c.execute('SELECT count(*) FROM '+export['gp']+" WHERE _pa_next_run IS DISTINCT FROM (SELECT run_id FROM pa_next_run)")
            assert c.fetchone()[0]==0, export['gp']
        c.execute("SELECT login FROM pa_next_pair")
        assert set(r[0] for r in c.fetchall())=={'fixture_new'}
        c.execute("SELECT count(*) FROM pa_next_adg_member WHERE ad_group='fixture_group'")
        assert c.fetchone()[0]==2
        c.execute('SELECT sum(views) FROM pa_next_evd_day')
        assert int(c.fetchone()[0])==12
        c.execute("SELECT c.relpersistence,n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid='pa_next_acc_any'::regclass")
        persistence, helper_schema = c.fetchone()
        assert persistence == 't' and helper_schema.startswith('pg_temp_')
        # New connections can export every regular table without sharing a SQL
        # TEMP session; the paragraph-local acceleration helper stays temporary.
        reader = psycopg2.connect(dbname='pa_next_full_test'); reader.autocommit = True
        export_checks = []
        with reader.cursor() as second:
            second.execute('SET ROLE '+ROLE)
            second.execute('SET search_path TO '+WORKSPACE+', usr_cross_data, public')
            for export in manifest['exports']:
                name = export['gp']
                second.execute("SELECT n.nspname,c.relpersistence FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid=%s::regclass", (name,))
                assert second.fetchone() == (WORKSPACE, 'p'), name
                second.execute('SELECT count(*) FROM '+name)
                export_checks.append({'table': name, 'rows': second.fetchone()[0], 'permanent': True})
        reader.close()
        assert len(export_checks) == len(manifest['exports'])
        assert 'pa_next_person_id_map' in {item['table'] for item in export_checks}
        c.execute('SELECT master_id,login,status FROM pa_next_person_id_map ORDER BY master_id')
        assert c.fetchall() == [('100','fixture_never','ready'),('99','fixture_new','ready')]
        control = paragraph_creating(candidate, 'pa_next_run')['code']
        rejected_paths = []
        rejection_details = []
        for unsafe_path in ('usr_cross_data, public', ''):
            c.execute('SELECT set_config(\'search_path\',%s,false)', (unsafe_path,))
            c.execute('SELECT current_schema()')
            initial_schema = c.fetchone()[0]
            assert initial_schema == ('usr_cross_data' if unsafe_path else None)
            try:
                c.execute(portable(control))
            except psycopg2.Error as error:
                assert error.pgcode == '3F000', (unsafe_path, error.pgcode)
                rejected_paths.append(unsafe_path)
                rejection_details.append({'search_path':unsafe_path,'current_schema':initial_schema,'sqlstate':error.pgcode})
            else:
                raise AssertionError('Unsafe workspace did not stop before creating output: '+unsafe_path)
        c.execute('RESET ROLE')
        after_shared = shared_snapshot(c, schemas)
        assert before_shared == after_shared, 'Shared source/decoy objects changed'
        assert hashlib.sha256((OUT / '1. Helicopter — pa_next.yaml').read_bytes()).hexdigest() == candidate_sha
    db.close(); source.close()
    result={'status':'passed','gp_paragraphs':len(executed),'base_table_comparisons':comparisons,
            'candidate_yaml_sha256':candidate_sha,'workspace_schema':WORKSPACE,
            'namespace_checks':{'read_only_source_role':ROLE,'shared_tables_unchanged':len(before_shared),
                                'shared_decoys_unchanged':len(made),'unsafe_search_paths_rejected':rejected_paths,
                                'unsafe_workspace_details':rejection_details,
                                'second_connection_exports':export_checks,'paragraph_helper_is_temp':True},
            'source_views':12,'checks':['canonical login merge','nested AD membership','current Master ID mapping','all export run stamps'],
            'limitation':'PostgreSQL local model; DISTRIBUTED clauses removed; no corporate services invoked'}
    path=Path('/tmp/pa-next-gp-pipeline-results.json')
    path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print('PASS:',len(executed),'GP paragraphs executed; all 12 base tables exact;',len(export_checks),'stamped exports; canonical login/nested group/Master ID checks')

if __name__=='__main__':
    main()
