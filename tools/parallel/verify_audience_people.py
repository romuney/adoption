#!/usr/bin/env python3
"""Local GP identity cases plus real CH24.8 person-CA equivalence checks.

Never connects to corporate services. Old SQL + an exact synthetic AD-group set
is an independent oracle for the new people condition; all business rows match.
"""
import argparse
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
import uuid

import psycopg2
from psycopg2.extras import execute_values
import yaml

from audience_people_data import PERSON_MAP_SQL
from verify_events import freeze_date, paragraph_creating
from verify_numbers import ROOT, DATASETS, PROD_MODE, load_stand, normalize

OUT = ROOT / 'Параллельный отчёт — pa_next'


def mapping_fixture():
    host = os.environ.get('PGHOST', '')
    assert host in ('127.0.0.1', 'localhost', '/workspace/.cache/pa-next-pgsocket'), 'Explicit local PGHOST required'
    admin = psycopg2.connect(dbname='postgres'); admin.autocommit = True
    with admin.cursor() as c:
        c.execute("SELECT 1 FROM pg_database WHERE datname='pa_next_people_test'")
        if not c.fetchone(): c.execute('CREATE DATABASE pa_next_people_test')
    admin.close()
    con = psycopg2.connect(dbname='pa_next_people_test'); con.autocommit = True
    with con.cursor() as c:
        c.execute('DROP SCHEMA IF EXISTS prod_v_emart CASCADE; CREATE SCHEMA prod_v_emart; DROP SCHEMA IF EXISTS people_work CASCADE; CREATE SCHEMA people_work; SET search_path TO people_work,public')
        c.execute('CREATE TABLE prod_v_emart.mdm_employee_structure_d (mdm_employee_rk bigint,ad_login text,business_dt date,last_state_flg int,company_fire_flg int)')
        c.execute('CREATE TABLE pa_next_source (mdm_employee_rk bigint,login text,log_dttm timestamp,company_fire_flg int); CREATE TABLE pa_next_login_map (login text,canon text); CREATE TABLE pa_next_staff (login text,src text); CREATE TABLE pa_next_run AS SELECT \'people-test\'::text AS run_id')
        mdm = [(1,'old','2026-09-01',0,0),(1,'new','2026-11-01',1,0),(2,'old','2026-11-01',1,0),
               (3,'reused','2026-10-01',1,1),(4,'reused','2026-11-01',1,0),
               (5,'shared','2026-11-01',1,0),(6,'shared','2026-11-01',1,0),
               (7,'conflict','2026-11-01',1,0),(7,'conflict','2026-11-01',1,1),
               (8,'nostate','2026-11-01',0,0),(9,'historical','2026-10-01',0,0),(9,'','2026-11-01',1,0),
               (10,'','2026-11-01',1,1),(9007199254740993,'longid','2026-11-01',1,0),
               (17,'bb','2026-11-01',1,0),(17,'aa','2026-11-01',0,0),
               (None,'null-id','2026-11-01',1,0)]
        execute_values(c,'INSERT INTO prod_v_emart.mdm_employee_structure_d VALUES %s',mdm)
        viewers=[(10,'old','2026-11-10',0),(11,'viewer.old','2026-11-10',0),
                 (12,'viewer.a','2026-11-10',0),(12,'viewer.b','2026-11-10',0),
                 (13,'old','2026-11-10',0),(14,'viewer.fired','2026-11-10',1),
                 (15,'missing','2026-11-10',0),(16,'viewer.dup','2026-11-10',0),(16,'viewer.dup','2026-11-10',0)]
        execute_values(c,'INSERT INTO pa_next_source VALUES %s',viewers)
        c.execute("INSERT INTO pa_next_login_map VALUES ('viewer.old','viewer.current')")
        staff=[(x,'mdm') for x in ['old','new','reused','shared','conflict','nostate','historical','longid','aa']]
        staff += [(x,'viewer') for x in ['viewer.current','viewer.a','viewer.b','viewer.fired','viewer.dup']]
        execute_values(c,'INSERT INTO pa_next_staff VALUES %s',staff)
        nb=yaml.safe_load((OUT/'1. Helicopter — pa_next.yaml').read_text())
        shipped=paragraph_creating(nb,'pa_next_person_id_map')['code']
        portable=re.sub(r'\bDISTRIBUTED\s+BY\s*\([^;]+\)', '', shipped, flags=re.I)
        c.execute(freeze_date(portable))
        c.execute('SELECT master_id,login,status,_pa_next_run FROM pa_next_person_id_map ORDER BY master_id')
        actual={r[0]:r[1:] for r in c.fetchall()}
        # Independent before/after proof for pruning known MDM events ahead of
        # dense_rank: only this predicate is removed, all source rows stay.
        before_pruning,count=re.subn(r'AND v\.mdm_employee_rk NOT IN \(\s*SELECT rk FROM cur WHERE rk IS NOT NULL UNION SELECT rk FROM states\s*\)', '', portable)
        assert count==1
        c.execute(freeze_date(before_pruning))
        c.execute('SELECT master_id,login,status,_pa_next_run FROM pa_next_person_id_map ORDER BY master_id')
        assert {r[0]:r[1:] for r in c.fetchall()}==actual,'Fallback scan pruning changed mapping'
        c.execute(freeze_date(portable))
        expected={str(k):(login,status,'people-test') for k,login,status in [
            (1,'new','ready'),(2,'old','ready'),(3,'','inactive'),(4,'reused','ready'),
            (5,'shared','ready'),(6,'shared','ready'),(7,'','ambiguous'),(8,'','unknown'),
            (9,'historical','ready'),(10,'','inactive'),(11,'viewer.current','ready'),
            (12,'','ambiguous'),(13,'','ambiguous'),(14,'','inactive'),(15,'','unknown'),
            (16,'viewer.dup','ready'),(17,'aa','ready'),(9007199254740993,'longid','ready')]}
        assert actual==expected,(actual,expected)
        c.execute('SELECT count(*)=count(DISTINCT master_id) FROM pa_next_person_id_map');assert c.fetchone()[0]
    con.close()
    print('PASS GP:',len(expected),'identities; reused/old login, fired, many IDs→one, ties, fallback, bigint',flush=True)
    return {'cases':len(expected),'status':'passed','fallback_pruning_exact':True,'null_mdm_id_does_not_block_fallback':True,'rows':actual}


def business(rows):
    cleaned=[]
    for original in rows:
        row=dict(original)
        if row['section'] in ('pa_next_request','pa_next_version','flt'):continue
        if row['section']=='sj':
            v=json.loads(row['k']);v.pop('flt',None)
            if isinstance(v.get('ca'),dict):v.pop('ca')
            row['k']=json.dumps(v,sort_keys=True,ensure_ascii=False)
        # PV newline positions are fields (total/users/new/returned/views), not
        # unordered records. Preserve that wire order exactly.
        if row['section']!='pv' and isinstance(row['k'],str) and '\n' in row['k']:row['k']='\n'.join(sorted(row['k'].split('\n')))
        cleaned.append(json.dumps(row,sort_keys=True,ensure_ascii=False))
    return Counter(cleaned)


def sql_checks(report, baseline_ref):
    assert os.environ.get('PA_DB'), 'Explicit local PA_DB required'
    stand=load_stand();import hidesql
    def raw(sql):return json.loads(stand.S.query(sql,'JSON').bytes())['data']
    version=str(stand.S.query('SELECT version()','CSV')).strip().strip('"');assert version.startswith('24.8.')
    templates={k:(OUT/name).read_text() for k,(_,name) in DATASETS.items()}
    old={k:subprocess.check_output(['git','show',baseline_ref+':'+str((OUT/name).relative_to(ROOT))],cwd=ROOT,text=True) for k,(_,name) in DATASETS.items()}
    assert all('ca_login_f' not in text and 'ca_master_f' not in text for text in old.values()), 'Baseline already contains new people filter'
    generation=raw('SELECT any(run_id) AS v FROM prod_proteus.pa_next_manifest')[0]['v']
    def literal(s):return "'"+str(s).replace('\\','\\\\').replace("'","''")+"'"
    staff=raw("SELECT s.login,s.op,s.sp FROM prod_proteus.pa_next_staffx s INNER JOIN (SELECT login,count() AS views FROM prod_proteus.pa_next_pair GROUP BY login) p ON p.login=s.login ORDER BY p.views DESC,s.login LIMIT 5")
    assert len(staff)>=3
    a,b,c=[x['login'] for x in staff[:3]]
    alias='pa_next_fixture_old'
    existing=raw('SELECT canon FROM prod_proteus.pa_next_login_map WHERE login='+literal(alias))
    if existing:assert {r['canon'] for r in existing}=={a}
    else:stand.S.query('INSERT INTO prod_proteus.pa_next_login_map(login,canon,_pa_next_run) VALUES ('+','.join(map(literal,[alias,a,generation]))+')')
    stand.S.query('DROP TABLE IF EXISTS prod_proteus.pa_next_person_id_map')
    stand.S.query('CREATE TABLE prod_proteus.pa_next_person_id_map(master_id String,login String,status String,_pa_next_run String) ENGINE=MergeTree ORDER BY(master_id,login)')
    mapping=[('9007199254740993',a,'ready'),('102',b,'ready'),('103',a,'ready'),('104','','inactive'),('105','','ambiguous')]
    stand.S.query('INSERT INTO prod_proteus.pa_next_person_id_map VALUES '+','.join('('+','.join(map(literal,[*row,generation]))+')' for row in mapping))
    def query(template,filters):
        sql=hidesql.render(template,filters)+'\nSETTINGS '+PROD_MODE+',max_threads=4,max_execution_time=45'
        rows=raw(sql);normalize(rows,candidate=True);return rows
    oracle_prefix='__pa_next_people_oracle_'+uuid.uuid4().hex+'_'
    report['sql']={'clickhouse':version,'baseline_ref':subprocess.check_output(['git','rev-parse',baseline_ref],cwd=ROOT,text=True).strip(),'oracle_group_prefix':oracle_prefix,'source_sha256':{k:hashlib.sha256(t.encode()).hexdigest() for k,t in templates.items()},'checks':[]}
    for grain in ('d','w','m','q'):
        for part in ('head','cat','one'):
            filters={} if grain=='d' else {'period_param':[grain]}
            aa=query(old[part],filters);bb=query(templates[part],filters)
            assert normalize(aa,True)[0]==normalize(bb,True)[0],('no-list',grain,part)
            assert business(aa)==business(bb),('no-list-PV-wire-order',grain,part)
            report['sql']['checks'].append({'case':'no-list-'+grain,'part':part,'status':'passed'})
        print('PASS exact unchanged no-list',grain,flush=True)
    cases=[
        ('current-logins',{'ca_login_f':[a,b]},[a,b]),
        ('old-case-dedup',{'ca_login_f':[' '+alias.upper()+' ',a,alias,b,b]},[a,b]),
        ('master-and-dedup',{'ca_master_f':['9007199254740993','102','103','103']},[a,b]),
        ('unknown-login',{'ca_login_f':['unknown.person']},[]),
        ('known-plus-unknown',{'ca_login_f':[a,'unknown.person']},[a]),
        ('inactive-master',{'ca_master_f':['104','105','999999']},[]),
        ('both-intersection',{'ca_login_f':[a,b],'ca_master_f':['102']},[b]),
        ('org-intersection',{'ca_login_f':[a,b],'ca_org_f':[staff[0]['op']]},[a,b]),
        ('spec-intersection',{'ca_master_f':['9007199254740993','102'],'ca_spec_f':[staff[0]['sp']]},[a,b]),
        ('catalogue-group-intersection',{'ca_login_f':[a,b],'aud_spec_f':[staff[0]['sp']]},[a,b]),
        ('people-bus-direction',{'ca_login_f':[a,b],'login_f':[a]},[a,b]),
        ('invalid-login',{'ca_login_f':[a,"x' OR 1=1 --"]},[]),
        ('invalid-master',{'ca_master_f':['102','1e3']},[]),
        ('over-limit',{'ca_login_f':['limit'+str(i) for i in range(5001)]},[]),
    ]
    never=raw('SELECT login FROM prod_proteus.pa_next_staffx WHERE login NOT IN (SELECT login FROM prod_proteus.pa_next_pair) ORDER BY login LIMIT 1')
    assert never,'Fixture needs a current employee without visits'
    cases.append(('never-visited',{'ca_login_f':[never[0]['login']]},[never[0]['login']]))
    # The fixture has a public report, so everyone has some global access. The
    # contract concerns access to the selected report: CA by conditions must
    # retain a current employee who has no direct/group grant to report2.
    access2="SELECT principal FROM prod_proteus.pa_next_dash_acl WHERE kind='user' AND dashboard_id=2 UNION ALL SELECT login FROM prod_proteus.pa_next_adg_member WHERE ad_group IN (SELECT principal FROM prod_proteus.pa_next_dash_acl WHERE kind='group' AND dashboard_id=2)"
    noaccess=raw('SELECT login FROM prod_proteus.pa_next_staffx WHERE login NOT IN ('+access2+') ORDER BY login LIMIT 1')
    assert noaccess,'Fixture needs a current employee without access to report2'
    cases.append(('without-access-selected-report',{'ca_login_f':[noaccess[0]['login']],'mode_param':['report'],'sel_f':['2']},[noaccess[0]['login']]))
    groups=raw('SELECT ad_group FROM prod_proteus.pa_next_adg_member WHERE login='+literal(a)+" AND NOT startsWith(ad_group,'__pa_next_people_oracle_') ORDER BY ad_group LIMIT 1")
    assert groups,'Fixture needs an actual AD membership'
    group=groups[0]['ad_group']
    members={r['login'] for r in raw('SELECT login FROM prod_proteus.pa_next_adg_member WHERE ad_group='+literal(group))}
    cases.append(('ad-group-intersection',{'ca_login_f':[a,b],'ca_adg_f':[group]},[lg for lg in [a,b] if lg in members]))
    for index,(label,filters,people) in enumerate(cases):
        group=oracle_prefix+str(index)
        if people:
            stand.S.query('INSERT INTO prod_proteus.pa_next_adg_member(ad_group,login,_pa_next_run) VALUES '+','.join('('+','.join(map(literal,[group,lg,generation]))+')' for lg in sorted(set(people))))
        oracle={k:v for k,v in filters.items() if k not in ('ca_login_f','ca_master_f')};oracle['ca_adg_f']=[group]
        # Include selected report and two periods; full panel output covers every
        # KPI, dynamics/calendar, people, path, cohort and CA section together.
        variants=[{}] if label not in ('current-logins','old-case-dedup','master-and-dedup','unknown-login','inactive-master','both-intersection') else [{},{'mode_param':['report'],'sel_f':['2'],'period_param':['w']}]
        if label=='current-logins':
            variants += [{'mode_param':['report'],'sel_f':['2'],'period_param':[grain]} for grain in ('m','q')]
        for variant in variants:
            for part in ('cat','one'):
                expected=query(old[part],dict(oracle,**variant));actual=query(templates[part],dict(filters,**variant))
                assert business(expected)==business(actual),(label,part,variant,list((business(expected)-business(actual)).elements())[:2],list((business(actual)-business(expected)).elements())[:2])
                report['sql']['checks'].append({'case':label,'part':part,'variant':variant,'status':'passed'})
        print('PASS exact person set',label,flush=True)
    # The new table participates in the publication guard even when empty.
    markers={part:"SELECT 'pa_next_version'"+templates[part].split("\nUNION ALL\nSELECT 'pa_next_version'",1)[1].split('\n{% set PA_REQ',1)[0] for part in ('cat','one')}
    stand.S.query("INSERT INTO prod_proteus.pa_next_person_id_map VALUES ('wrong','','unknown','wrong-generation')")
    for marker in markers.values():assert raw(marker)[0]['parent']=='loading'
    stand.S.query('TRUNCATE TABLE prod_proteus.pa_next_person_id_map')
    for marker in markers.values():assert raw(marker)[0]['parent']=='ready'
    stand.S.query('INSERT INTO prod_proteus.pa_next_person_id_map VALUES '+','.join('('+','.join(map(literal,[*row,generation]))+')' for row in mapping))
    report['sql']['generation_cases']=4
    print('PASS map generation mixed/empty; restored synthetic identities',flush=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline-ref',default='8acb2e26f3728e76d61b28713e61728b8706d24d',
                        help='Reviewed pre-person-CA shipment; never silently use a newer HEAD')
    parser.add_argument('--gp-only',action='store_true')
    parser.add_argument('--output',type=Path,default=Path('/tmp/pa-next-people-results.json'))
    args=parser.parse_args()
    report={'completed':False,'scope':'Local synthetic PostgreSQL + ClickHouse24.8; no corporate access',
            'extension_sha256':hashlib.sha256((ROOT/'tools/parallel/audience_people_data.py').read_bytes()).hexdigest(),
            'yaml_sha256':hashlib.sha256((OUT/'1. Helicopter — pa_next.yaml').read_bytes()).hexdigest()}
    try:
        report['mapping']=mapping_fixture()
        if not args.gp_only:sql_checks(report,args.baseline_ref)
        report.update(completed=True,status='passed')
    except Exception as error:
        report.update(status='failed',error=str(error));raise
    finally:
        args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print('PASS',args.output)


if __name__=='__main__':main()
