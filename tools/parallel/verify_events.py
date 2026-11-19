#!/usr/bin/env python3
"""Execute the actual production and isolated event paragraphs on boundary fixtures in local PostgreSQL."""
import argparse
from datetime import date, datetime, time, timedelta
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

ROOT = Path(__file__).resolve().parents[2]
AS_OF = '2026-11-13'
WORKSPACE = 'pa_next_workspace'


def created_tables(sql):
    code = re.sub(r'/\*.*?\*/|--[^\n]*', '', sql, flags=re.S)
    return re.findall(r'(?i)\bcreate\s+(?:temp(?:orary)?\s+)?table\s+([\w.]+)', code)


def paragraph_creating(notebook, table):
    found = [p for p in notebook['paragraphs']
             if p.get('shebang') == 'gp' and table in created_tables(p.get('code', ''))]
    if len(found) != 1:
        raise RuntimeError('Expected exactly one GP paragraph creating ' + table)
    return found[0]

def freeze_date(sql, as_of=AS_OF):
    date.fromisoformat(as_of)
    return re.sub(r'\bcurrent_date\b', "DATE '" + as_of + "'", sql, flags=re.I)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--production', type=Path, default=ROOT / 'Proteus Adoption (4).yaml')
    ap.add_argument('--candidate', type=Path, default=ROOT / 'Параллельный отчёт — pa_next/1. Helicopter — pa_next.yaml')
    ap.add_argument('--as-of', default=AS_OF, help='Freeze current_date in BOTH test SQL copies; shipment untouched')
    ap.add_argument('--output', type=Path, default=Path('/tmp/pa-next-events-results.json'))
    args = ap.parse_args()
    host = os.environ.get('PGHOST', '')
    if host not in ('127.0.0.1', 'localhost') and not host.startswith(('/workspace/', '/tmp/')):
        ap.error('PGHOST must select an explicit LOCAL test server')
    # Never reuse the production schemas on a remote server or an arbitrary database.
    db = 'pa_next_event_test'
    admin = psycopg2.connect(dbname='postgres'); admin.autocommit = True
    with admin.cursor() as cur:
        cur.execute('SELECT 1 FROM pg_database WHERE datname=%s', (db,))
        if not cur.fetchone():
            cur.execute('CREATE DATABASE pa_next_event_test')
    admin.close()
    connection = psycopg2.connect(dbname=db); connection.autocommit = True
    with connection.cursor() as cur:
        cur.execute('DROP SCHEMA IF EXISTS prod_v_sse_crossdata CASCADE; DROP SCHEMA IF EXISTS usr_cross_data CASCADE; CREATE SCHEMA prod_v_sse_crossdata; CREATE SCHEMA usr_cross_data; DROP SCHEMA IF EXISTS '+WORKSPACE+' CASCADE; CREATE SCHEMA '+WORKSPACE)
        cur.execute('SET search_path TO '+WORKSPACE+', usr_cross_data, public')
        cur.execute(freeze_date("SELECT current_date, (current_date - interval '15 months')::date", args.as_of))
        today, start = cur.fetchone()
        columns = {
            'event_dttm': 'timestamp', 'event_nm': 'text', 'proteus_user_id': 'bigint', 'user_ad_login': 'text',
            'physical_report_id': 'bigint', 'physical_report_nm': 'text', 'physical_report_slug': 'text',
            'certifier_nm': 'text', 'creator_id': 'bigint', 'creator_ad_login': 'text',
            'owner_ad_login_list': 'text[]', 'create_dttm': 'timestamp', 'proteus_ad_group_nm_list': 'text[]',
            'viewer_ad_login_list': 'text[]', 'publish_flg': 'integer', 'actual_flg': 'integer',
            'physical_report_link': 'text', 'user_mdm_employee_rk': 'bigint', 'user_specialization_it_code': 'text',
            'user_specialization_oper_code': 'text', 'user_specialization_desc': 'text', 'user_stream_desc': 'text',
            'user_company_fire_flg': 'integer', 'user_management_head_flg': 'integer',
            'user_lvl3_mapped_management_unit_nm': 'text', 'user_lvl4_mapped_management_unit_nm': 'text',
            'user_lvl5_mapped_management_unit_nm': 'text', 'user_lvl6_mapped_management_unit_nm': 'text',
            'user_lvl7_mapped_management_unit_nm': 'text', 'proteus_collection_nm_list': 'text[]',
            'user_ad_group_nm_list': 'text[]',
        }
        cur.execute('CREATE TABLE prod_v_sse_crossdata.event_physical_report (' + ','.join(k+' '+v for k,v in columns.items()) + ')')
        cur.execute('CREATE TABLE usr_cross_data.bl_talent_management (mdm_employee_rk bigint, current_head_lvl_segment text)')
        # A duplicate dimension match MUST remain a duplicate if production counts it.
        cur.execute("INSERT INTO usr_cross_data.bl_talent_management VALUES (99,'test-segment'),(99,'test-segment')")
        before = datetime(2026,10,5,23,59,59)
        split = datetime(2026,10,6)
        midnight = datetime.combine(today, time())
        if not datetime.combine(start,time()) < before < midnight:
            raise RuntimeError('This dated fixture requires current_date after 2026-10-06 and history covering the cutover')
        old, new = 'dashboard.rendered', 'proteus.dashboard.timeToFirstChartQuery'
        events = [(old,datetime.combine(start,time())-timedelta(seconds=1)),
                  (old,datetime.combine(start,time())), (old,before), (old,split), (new,before),
                  (new,split), (new,midnight-timedelta(hours=12)), (new,midnight),
                  (new,midnight+timedelta(hours=12)), ('ignored.event',midnight-timedelta(hours=12)),
                  (old,midnight-timedelta(hours=12)), (new,split)]
        rows=[]
        for event, timestamp in events:
            row={k: ([] if t=='text[]' else 1 if t in ('bigint','integer') else datetime(2024,1,1) if t=='timestamp' else 'fixture') for k,t in columns.items()}
            row.update(event_nm=event,event_dttm=timestamp,user_ad_login='fixture_user',user_mdm_employee_rk=99,
                       physical_report_id=900001,owner_ad_login_list=['fixture_owner'],proteus_collection_nm_list=['fixture_collection'])
            rows.append(tuple(row[k] for k in columns))
        execute_values(cur,'INSERT INTO prod_v_sse_crossdata.event_physical_report VALUES %s',rows)
        old_doc=yaml.safe_load(args.production.read_text()); new_doc=yaml.safe_load(args.candidate.read_text())
        baseline=[p['code'] for p in old_doc['paragraphs'] if p.get('title')=='Финальная таблица из event_physical_report']
        candidate=[paragraph_creating(new_doc, 'pa_next_source')['code']]
        if len(baseline)!=1 or len(candidate)!=1:
            raise RuntimeError('Source paragraph absent or ambiguous')
        for paragraph in new_doc['paragraphs']:
            if paragraph.get('shebang') == 'gp' and 'pa_next_source' not in created_tables(paragraph.get('code', '')):
                code = re.sub(r'/\*.*?\*/|--[^\n]*', '', paragraph.get('code',''), flags=re.S)
                if re.search(r'\bmax_date\b', code, flags=re.I):
                    raise AssertionError('max_date has a downstream GP consumer; removal is not allowed')
        outputs=[]
        for side, sql in enumerate([baseline[0],candidate[0]]):
            names=created_tables(sql)
            if names != [('usr_cross_data.proteus_views_1', 'pa_next_source')[side]]:
                raise RuntimeError('Unexpected output table in test paragraph')
            cur.execute(freeze_date(sql, args.as_of))
            cur.execute('SELECT * FROM '+names[0])
            fields=[d.name for d in cur.description]
            result=cur.fetchall()
            index = fields.index('max_date')
            if side == 1 and any(row[index] is not None for row in result):
                raise AssertionError('Optimized unused max_date must be NULL')
            projected = [row[:index] + row[index+1:] for row in result]
            outputs.append((fields,sorted(json.dumps(r,default=str,ensure_ascii=False) for r in projected)))
        if outputs[0]!=outputs[1]:
            raise AssertionError('Raw event business result differs from supplied production node')
        cur.execute('SELECT sum(action_count) FROM '+WORKSPACE+'.pa_next_source')
        views=int(cur.fetchone()[0])
        if views!=12:
            raise AssertionError(f'Independent expected 12 views after duplicate-dimension multiplicity, got {views}')
    connection.close()
    report=dict(status='passed',input_events=len(events),expected_views=12,actual_views=views,
                same_columns=True,same_business_rows=True,workspace_schema=WORKSPACE,excluded_unused_column='max_date',candidate_max_date_all_null=True,today=str(today),cutoff=str(start),time_mode='current_date frozen identically in both test copies; shipment unchanged',
                cases=['history cutoff before/exact','old/new event before/exact cutover','today midnight included; midday excluded',
                       'wrong event type ignored','duplicate source events preserved','duplicate dimension join multiplicity preserved'],
                production_sha256=hashlib.sha256(args.production.read_bytes()).hexdigest(),
                candidate_sha256=hashlib.sha256(args.candidate.read_bytes()).hexdigest(),
                limitation='PostgreSQL local semantic model; actual corporate source and GP engine not queried')
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print('PASS: event source business rows match (only unused max_date omitted); 12 input events / 12 expected views; 6 boundary cases')

if __name__=='__main__':
    main()
