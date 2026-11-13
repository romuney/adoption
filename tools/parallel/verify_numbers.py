#!/usr/bin/env python3
"""Strict row-for-row numeric regression. Run only against a local synthetic chdb DB."""
import argparse
from collections import Counter
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import types

ROOT = Path(__file__).resolve().parents[2]
DATASETS = {'head': ('Виджеты/pa-head.data.sql', '3. SQL — шапка.sql'),
            'cat': ('Виджеты/pa-reports-body.data.sql', '5. SQL — каталог.sql'),
            'one': ('Виджеты/pa-one.data.sql', '7. SQL — панель.sql')}
PROD_MODE = 'allow_experimental_analyzer=1, prefer_column_name_to_alias=1, join_use_nulls=0, group_by_use_nulls=0'
MODES = {
    'production-profile': PROD_MODE,
    'old-analyzer': 'allow_experimental_analyzer=0, prefer_column_name_to_alias=0, join_use_nulls=0, group_by_use_nulls=0',
    'nullable-join': PROD_MODE.replace('join_use_nulls=0', 'join_use_nulls=1'),
    'nullable-group': PROD_MODE.replace('group_by_use_nulls=0', 'group_by_use_nulls=1'),
    'all-nullable': PROD_MODE.replace('join_use_nulls=0', 'join_use_nulls=1').replace('group_by_use_nulls=0', 'group_by_use_nulls=1'),
}


def normalize(rows, candidate=False):
    """A multiset, not a set: duplicate result rows are a regression too."""
    if not isinstance(rows, list) or not rows:
        raise ValueError('Empty/non-array response is not evidence of equivalence')
    out = []
    versions = []
    requests = []
    for row in rows:
        if set(row) != {'section', 'g', 'k', 'parent', 'n'}:
            raise ValueError('Unexpected response columns: ' + repr(sorted(row)))
        if any(v is None or (isinstance(v, float) and not math.isfinite(v)) for v in row.values()):
            raise ValueError('NULL/NaN/infinite response value')
        if row['section'] == 'pa_next_request':
            requests.append(row)
            continue
        if row['section'] == 'pa_next_version':
            versions.append(row)
            continue
        normalized = dict(row)
        # Packed groupArray lines are unordered. Preserve duplicate lines and every field.
        if isinstance(row['k'], str) and '\n' in row['k']:
            normalized['k'] = '\n'.join(sorted(row['k'].split('\n')))
        out.append(json.dumps(normalized, ensure_ascii=False, sort_keys=True, allow_nan=False))
    if not out:
        raise ValueError('No metric rows')
    if candidate:
        if len(versions) != 1 or versions[0]['parent'] != 'ready' or versions[0]['n'] != 1 or not versions[0]['k']:
            raise ValueError('Candidate response has no single ready generation')
        if requests and (len(requests) != 3 or {r['g'] for r in requests} != {'head','cat','one'} or any(r['parent'] != '' or r['n'] != 0 for r in requests)):
            raise ValueError('Malformed request echo protocol rows')
    elif versions or requests:
        raise ValueError('Baseline unexpectedly contains new protocol rows')
    return Counter(out), versions[0]['k'] if versions else None


def load_stand():
    """Keep original stand untouched; its CH25-only setting is unnecessary on CH24."""
    source = ROOT / '.stand/stand.py'
    text = source.read_text()
    old = "S.query('SET use_variant_as_common_type = 0')"
    if text.count(old) != 1:
        raise ValueError('stand.py compatibility adapter needs review')
    text = text.replace(old, "\nif int(str(S.query('SELECT version()', 'CSV')).strip().strip(chr(34)).split('.')[0]) >= 25:\n    " + old)
    module = types.ModuleType('stand')
    module.__file__ = str(source)
    sys.modules['stand'] = module
    sys.path.insert(0, str(source.parent))
    exec(compile(text, str(source), 'exec'), module.__dict__)
    return module


def selftest():
    row = dict(section='total', g='', k='1|2|3', parent='', n=0)
    version = dict(section='pa_next_version', g='one', k='generation-test', parent='ready', n=1)
    assert normalize([row])[0] == normalize([row, version], True)[0]
    assert normalize([row])[0] != normalize([row, row])[0]
    a = dict(row, section='people', k='u2|2\nu1|1\nu1|1')
    b = dict(a, k='u1|1\nu2|2\nu1|1')
    assert normalize([a])[0] == normalize([b])[0]
    assert normalize([a])[0] != normalize([dict(a, k='u1|1\nu2|2')])[0]
    for bad, candidate in [([], False), ('ERR same on both', False), ([dict(row, n=float('nan'))], False),
                           ([row], True), ([row, dict(version, parent='loading', n=0)], True),
                           ([row, version, version], True), ([dict(row, k=None)], False)]:
        try:
            normalize(bad, candidate)
        except ValueError:
            pass
        else:
            raise AssertionError('False pass: ' + repr(bad))
    print('PASS: 11 strict-comparator checks (duplicates, packed order, errors, NULL, generation)')


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--selftest', action='store_true')
    ap.add_argument('--baseline-revision', help='Full immutable Git revision containing current production dataset sources')
    ap.add_argument('--baseline-yaml', type=Path, help='The actual production Helicopter node supplied by owner')
    ap.add_argument('--candidate-dir', type=Path, default=ROOT / 'Параллельный отчёт — pa_next')
    ap.add_argument('--quick', action='store_true')
    ap.add_argument('--modes', action='store_true')
    ap.add_argument('--identity-smoke', action='store_true', help='Old/current, case and whitespace logins')
    ap.add_argument('--mode-smoke', action='store_true', help='Five representative filter sets in all profiles')
    ap.add_argument('--kinds', nargs='+', choices=DATASETS, default=list(DATASETS))
    ap.add_argument('--output', type=Path, default=Path('/tmp/pa-next-numeric-results.json'))
    args = ap.parse_args()
    if args.selftest:
        selftest()
        return
    if not args.baseline_revision or not re.fullmatch('[0-9a-f]{40}', args.baseline_revision):
        ap.error('--baseline-revision must be a full reviewed production-source commit')
    if not args.baseline_yaml or not args.baseline_yaml.is_file():
        ap.error('--baseline-yaml must identify the actual current production node; no assumed baseline')
    if subprocess.run(['git', '-C', str(ROOT), 'cat-file', '-e', args.baseline_revision + '^{commit}'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
        ap.error('Baseline commit missing (shallow checkout). Fetch read-only first: git fetch --depth=1 origin ' + args.baseline_revision)
    manifest = json.loads((args.candidate_dir / 'src/data-manifest.json').read_text())
    yaml_sha = hashlib.sha256(args.baseline_yaml.read_bytes()).hexdigest()
    if manifest.get('source_sha256') != yaml_sha:
        ap.error('Baseline YAML does not match the candidate data-manifest source_sha256')
    if not os.environ.get('PA_DB'):
        ap.error('Set PA_DB to the LOCAL synthetic database built by the isolated delivery fixture')
    stand = load_stand()
    import same
    import hidesql
    version = str(stand.S.query('SELECT version()', 'CSV')).strip().strip('"')
    if not version.startswith('24.8.'):
        raise RuntimeError('Requires ClickHouse 24.8, found ' + version)
    results = {'schema': 1, 'clickhouse': version, 'baseline_revision': args.baseline_revision,
               'baseline_yaml': str(args.baseline_yaml),
               'baseline_yaml_sha256': hashlib.sha256(args.baseline_yaml.read_bytes()).hexdigest(),
               'scope': 'synthetic dataset equivalence; NOT corporate GP/Proteus acceptance',
               'cases': [], 'passed': 0, 'failed': 0, 'completed': False, 'candidate_sha256': {}}
    all_started = time.monotonic()
    for kind in args.kinds:
        path, candidate_name = DATASETS[kind]
        baseline = subprocess.check_output(['git', '-C', str(ROOT), 'show', args.baseline_revision + ':' + path], text=True)
        if kind == 'cat':
            baseline = baseline.replace('{% set WITH_CA = false %}', '{% set WITH_CA = true %}')
        candidate = (args.candidate_dir / candidate_name).read_text()
        results['candidate_sha256'][kind] = hashlib.sha256(candidate.encode()).hexdigest()
        cases = same.matrix(kind, args.quick)
        if args.mode_smoke:
            ids = same.top_ids()
            cases = [('default', {}), ('one-report', {'mode_param': 'report', 'sel_f': [ids[0]]}),
                     ('custom-long', {'period_param': 'c|2026-09-21|d|120'}),
                     ('audience', {'ca_it_f': ['IT'], 'ca_head_f': '1'}),
                     ('no-audience-match', {'ca_spec_f': ['__nonexistent__']})] if kind != 'head' else [('header', {})]
        if args.identity_smoke:
            cases = [('identity', {'__user': value}) for value in ['', 'OWN3_OLD', 'own3', 'own7', ' u131 ']]
        # Invalid custom periods and hostile text must behave exactly as the production oracle.
        if kind != 'head' and not args.mode_smoke and not args.identity_smoke:
            cases += [('request-echo', {'pa_next_head_req': ['test-head-1'], 'pa_next_cat_req': ['test-cat-2'], 'pa_next_one_req': ['test-one-3']})]
            cases += [('invalid-period', {'period_param': x}) for x in ['c|invalid|d|10', 'c|2026-09-21|d|0', 'unknown']]
            cases += [('hostile-filter', {'ca_spec_f': [x]}) for x in ["O'Brien", 'a]b', 'x -- y', 'Отдел | ^ ` ~']]
        for label, filters in cases:
            for mode, settings in (MODES.items() if args.modes or args.mode_smoke else [('production-profile', PROD_MODE)]):
                record = dict(kind=kind, label=label, filters=filters, mode=mode)
                try:
                    responses = {}
                    # Alternate to avoid always granting the new query a warmed cache.
                    order = [('baseline', baseline), ('candidate', candidate)]
                    if len(results['cases']) % 2:
                        order.reverse()
                    for side, template in order:
                        sql = hidesql.render(template, dict(filters))
                        sql += '\nSETTINGS ' + settings + ', max_threads=4, max_execution_time=30'
                        start = time.monotonic()
                        payload = json.loads(stand.S.query(sql, 'JSON').bytes())
                        if side == 'candidate' and kind != 'head':
                            request_rows = [r for r in payload['data'] if r.get('section') == 'pa_next_request']
                            expected = {owner: (filters.get('pa_next_' + owner + '_req') or [''])[0] for owner in ('head','cat','one')}
                            if len(request_rows) != 3 or {r['g']: r['k'] for r in request_rows} != expected:
                                raise ValueError('Request echo missing or inconsistent')
                        responses[side], generation = normalize(payload['data'], candidate=side == 'candidate')
                        record[side + '_seconds'] = round(time.monotonic() - start, 6)
                        record[side + '_rows_read'] = payload.get('statistics', {}).get('rows_read')
                        if generation:
                            record['generation'] = generation
                    if responses['baseline'] != responses['candidate']:
                        record['missing'] = list((responses['baseline'] - responses['candidate']).elements())[:3]
                        record['extra'] = list((responses['candidate'] - responses['baseline']).elements())[:3]
                        raise ValueError('Metric response differs')
                    record['status'] = 'passed'
                    results['passed'] += 1
                except Exception as exc:
                    # An error on either side is ALWAYS failure, even if both would have the same message.
                    record.update(status='failed', error=str(exc)[:3000])
                    results['failed'] += 1
                    print('FAIL', kind, label, mode, str(exc)[:180], flush=True)
                results['cases'].append(record)
                results['elapsed_seconds'] = round(time.monotonic() - all_started, 3)
                args.output.parent.mkdir(parents=True, exist_ok=True)
                args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
        print(kind, 'complete;', results['passed'], 'passed,', results['failed'], 'failed', flush=True)
    for kind, expected_sha in results['candidate_sha256'].items():
        current = args.candidate_dir / DATASETS[kind][1]
        if hashlib.sha256(current.read_bytes()).hexdigest() != expected_sha:
            results['failed'] += 1
            results['source_changed_during_run'] = True
    if hashlib.sha256(args.baseline_yaml.read_bytes()).hexdigest() != yaml_sha:
        results['failed'] += 1
        results['source_changed_during_run'] = True
    results['rows_read_note'] = 'chdb may report 0 although tables were read; do not interpret 0 as no I/O'
    results['completed'] = True
    args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
    if results['failed'] or not results['passed']:
        raise SystemExit(1)
    print('PASS:', results['passed'], 'exact comparisons;', args.output)

if __name__ == '__main__':
    main()
