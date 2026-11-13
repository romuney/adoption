#!/usr/bin/env python3
"""Check the shipped Unicode normalizer and packed people fields in local PG encodings.

Actual corporate GP is not accessed. SQL_ASCII fixtures contain UTF8 bytes, as
sent by the client; arbitrary legacy byte strings are a separate diagnostic.
"""
import argparse
import ast
import hashlib
import json
import os
from pathlib import Path
import random
import re

import chdb
import psycopg2
from psycopg2.extras import execute_values
import yaml

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'Параллельный отчёт — pa_next'
BASE = ROOT / 'Единый лист — поставка 2026-10-23 (ускорение через GP)'
POINTS_SHA256 = '4cdce17d50c1b295773cb3e020a56a9941e4f0ab3af1bb9c4f18d47db1759060'
CH_PATTERN = r"'^(?:\\s|\\p{P})*$'"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def samples(points):
    singles = sorted({c + delta for c in points for delta in (-1, 0, 1)
                      if 0 < c + delta <= 0x10ffff and not 0xd800 <= c + delta <= 0xdfff})
    values = [''] + [chr(c) for c in singles]
    values += [' -' + chr(c) + '\n' for c in points]
    values += [chr(c) + 'A' for c in points]
    values += [''.join(map(chr, points)), '\t\n\r\f ', '\v', '\u00a0', '\u2003', '\u200b',
               'Отдел № 5', 'Направление — разработка', 'O\'Brien', '…— -', '−', '中文',
               'Δοκιμή', 'العربية', '😀', 'a|^`~', ' \nA\n ', '-\v😀']
    return list(dict.fromkeys(values)), len(singles)


def packing_samples():
    cyr = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя'
    values = ['', ' ', '  Иван Петров  ', 'Я', 'Ёё', 'Иванов Иван', 'Ёлкин ёж',
              'Smith Иван-Петров', "O'Brien Ольга", 'Ж|`~^', 'дом 5/7 кв. 3',
              'AЯA', 'Я A', 'Я  Я', 'Ж ж Ж', 'кириллица   с пробелами  ',
              'Ъ ъ Ь ь', 'таб\tперевод\nстрока\rконец', '~|^`', '😀Я😀', '中文Я中文',
              'éЯé', 'ΔЯΔ', 'العربيةЯ', '-\v😀', '\v', '\f', '2d0bf09f9880',
              '\\back\\slash', '«Я»', ':', 'Я:Я', 'Я\vЯ', 'Я\fЯ', 'Я\u00a0Я', 'Я\u2003Я',
              '😀' * 16, 'Я' * 64, cyr, 'ASCIIonly0123456789']
    values += list(cyr)
    rng = random.Random(894)
    alphabet = cyr + ' AZ09~|^`-—…\t\n\r\v\f😀éΔ中文'
    values += [''.join(rng.choice(alphabet) for _ in range(rng.randrange(1, 50))) for _ in range(180)]
    return list(dict.fromkeys(values))


def representable(value, encoding):
    if encoding != 'WIN1251':
        return True
    try:
        value.encode('cp1251')
        return True
    except UnicodeEncodeError:
        return False


def ch_rows(sql):
    return json.loads(chdb.query(sql, 'JSONCompact').bytes())['data']


def ch_empty(values):
    result = {}
    for start in range(0, len(values), 300):
        tuples = ','.join("(%d,unhex('%s'))" % (i, value.encode().hex())
                          for i, value in enumerate(values[start:start+300], start))
        rows = ch_rows('SELECT t.1, toUInt8(match(t.2, ' + CH_PATTERN + ')) '
                       'FROM (SELECT arrayJoin([' + tuples + ']) AS t) ORDER BY t.1')
        result.update((i, bool(flag)) for i, flag in rows)
    assert len(result) == len(values)
    return result


def ch_cz():
    # Read precisely the old stand's CH expression without importing its DB session.
    tree = ast.parse((ROOT / '.stand/check_gp.py').read_text())
    keep = [node for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name == 'cz'
            or isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id in {'CYR','TGT','CZRX'} for t in node.targets)]
    namespace = {}
    exec(compile(ast.Module(body=keep, type_ignores=[]), '<reviewed CH cz>', 'exec'), namespace)
    return namespace['cz']


def ch_packed(values):
    cz = ch_cz()
    tuples = ','.join("(%d,unhex('%s'))" % (i, value.encode().hex()) for i, value in enumerate(values))
    cleaned_login = "translate(unhex('" + 'login|x\t^`~'.encode().hex() + "'), '|\\t\\n\\r', '    ')"
    rows = ch_rows('SELECT t.1, lower(hex(concat(' + cleaned_login + ", '|', " + cz('t.2') + ", '|1|2|3'))), "
                   'lower(hex(concat(' + cleaned_login + ", '|', " + cz('t.2') + ", '|1|2|1|4|5'))) "
                   'FROM (SELECT arrayJoin([' + tuples + ']) AS t) ORDER BY t.1')
    return {i: {'pl_a': pl_a, 'n_a': n_a} for i, pl_a, n_a in rows}


def ctes(sql):
    # pu is followed by the next CTE. Its regexp literal can contain parentheses.
    result = re.findall(r'\bpu\s+as\s*\(.*?\n\)(?=,)', sql, flags=re.I | re.S)
    assert len(result) == 2, 'Expected both shipped viewer/staffx pu CTEs'
    return result


def packed_projection(sql, name):
    end = re.search(r'\s+as\s+' + re.escape(name) + r'\b', sql, re.I)
    assert end, name
    start = sql.rfind('translate(o.login,', 0, end.start())
    assert start >= 0 and end.start() - start < 100000, name
    return sql[start:end.start()]


def create_connections():
    host = os.environ.get('PGHOST', '')
    if host not in ('127.0.0.1', 'localhost') and not host.startswith(('/workspace/', '/tmp/')):
        raise RuntimeError('Explicit LOCAL PGHOST required')
    admin = psycopg2.connect(dbname='postgres')
    admin.autocommit = True
    result = {}
    with admin.cursor() as cur:
        for encoding in ('UTF8', 'SQL_ASCII', 'WIN1251'):
            name = 'pa_next_encoding_' + encoding.lower()
            cur.execute('SELECT 1 FROM pg_database WHERE datname=%s', (name,))
            if not cur.fetchone():
                cur.execute('CREATE DATABASE ' + name + " TEMPLATE template0 ENCODING '" + encoding + "' LC_COLLATE 'C' LC_CTYPE 'C'")
            connection = psycopg2.connect(dbname=name)
            connection.autocommit = True
            connection.set_client_encoding('UTF8')
            with connection.cursor() as check:
                check.execute('SHOW server_encoding')
                assert check.fetchone()[0] == encoding
            result[encoding] = connection
    admin.close()
    return result


def original_chr_error(connection):
    try:
        with connection.cursor() as cur:
            cur.execute('SELECT chr(894)')
            cur.fetchone()
        return None
    except psycopg2.Error as error:
        return {'sqlstate': error.pgcode, 'message': error.diag.message_primary}


def check_empty(connection, encoding, values, expected, pu_ctes, pattern):
    accepted = [(i, value) for i, value in enumerate(values) if representable(value, encoding)]
    with connection.cursor() as cur:
        cur.execute('CREATE TEMP TABLE encoding_inputs (id integer PRIMARY KEY, value text)')
        execute_values(cur, 'INSERT INTO encoding_inputs VALUES %s', accepted)
        for pu in pu_ctes:
            cur.execute('WITH ' + pu + ' SELECT re FROM pu')
            assert cur.fetchone()[0] == pattern, 'Shipped pu differs from generated frozen codepoint pattern'
            cur.execute('WITH ' + pu + " SELECT id, encode(convert_to(value, 'UTF8'),'hex') ~ pu.re, "
                        "encode(convert_to(CASE WHEN encode(convert_to(value, 'UTF8'),'hex') ~ pu.re THEN '' ELSE value END, 'UTF8'),'hex') "
                        'FROM encoding_inputs CROSS JOIN pu ORDER BY id')
            rows = cur.fetchall()
            assert len(rows) == len(accepted)
            for i, flag, normalized_hex in rows:
                assert flag == expected[i], (encoding, 'empty', i, repr(values[i]), flag, expected[i])
                assert normalized_hex == ('' if expected[i] else values[i].encode().hex()), (encoding, 'normalized', i)
        cur.execute('DROP TABLE encoding_inputs')
    return {'samples': len(accepted), 'pu_ctes': len(pu_ctes), 'comparisons': len(accepted) * len(pu_ctes)}


def packed_results(connection, encoding, values, sql):
    accepted = [(i, value) for i, value in enumerate(values) if representable(value, encoding)]
    with connection.cursor() as cur:
        cur.execute('CREATE TEMP TABLE encoding_inputs (id integer PRIMARY KEY, value text)')
        execute_values(cur, 'INSERT INTO encoding_inputs VALUES %s', accepted)
        projections = ', '.join("encode(convert_to((" + packed_projection(sql, name) + "), 'UTF8'), 'hex')" for name in ('pl_a','n_a'))
        cur.execute('SELECT h.id, ' + projections + " FROM encoding_inputs h CROSS JOIN LATERAL "
                    "(SELECT h.value AS fio, E'login|x\\t^`~'::text AS login, 1 AS hdf) o "
                    'CROSS JOIN (SELECT 1 AS code) ds CROSS JOIN (SELECT 2 AS code) dt '
                    'CROSS JOIN (SELECT 3 AS code) de CROSS JOIN (SELECT 4 AS code) dq '
                    'CROSS JOIN (SELECT 5 AS code) di ORDER BY h.id')
        rows = cur.fetchall()
        cur.execute('DROP TABLE encoding_inputs')
    assert len(rows) == len(accepted)
    return {i: {'pl_a': pl_a, 'n_a': n_a} for i, pl_a, n_a in rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate', type=Path, default=OUT / '1. Helicopter — pa_next.yaml')
    parser.add_argument('--output', type=Path, default=Path('/tmp/pa-next-encoding-results.json'))
    args = parser.parse_args()
    args.output.write_text(json.dumps({'status': 'running', 'completed': False}) + '\n')
    from unicode_empty import build_pattern
    points_file = ROOT / '.stand/punct_ch248.json'
    assert sha(points_file) == POINTS_SHA256, 'Frozen ClickHouse punctuation set changed'
    points = json.loads(points_file.read_text())
    assert len(points) == 847 and len(set(points)) == 847
    pattern = build_pattern(points)
    assert pattern.isascii()
    source = next(BASE.glob('1a. GP*.sql')).read_text()
    notebook = yaml.safe_load(args.candidate.read_text())
    candidate = next(p['code'] for p in notebook['paragraphs'] if p['title'] == 'PA NEXT · ускорение 1a')
    current_sha = sha(args.candidate)
    pu_ctes = ctes(candidate)
    values, neighbors = samples(points)
    expected = ch_empty(values)
    for index, value in enumerate(values):
        if len(value) == 1:
            assert expected[index] == (ord(value) in points), ('Frozen CH set mismatch', ord(value))
    packing = packing_samples()
    expected_packed = ch_packed(packing)
    version = ch_rows('SELECT version()')[0][0]
    assert version.startswith('24.8.'), version
    connections = create_connections()
    reports = []
    try:
        old_utf8 = packed_results(connections['UTF8'], 'UTF8', packing, source)
        assert old_utf8 == expected_packed, 'Original UTF8 packed fields differ from CH oracle'
        old_ascii = packed_results(connections['SQL_ASCII'], 'SQL_ASCII', ['Я'], source)[0]
        old_ascii_expected = ch_packed(['Я'])[0]
        assert old_ascii != old_ascii_expected, 'Expected inherited SQL_ASCII packing regression was not reproduced'
        for encoding, connection in connections.items():
            error = original_chr_error(connection)
            if encoding == 'UTF8':
                assert error is None
            else:
                assert error and error['sqlstate'] == '54000' and '894' in error['message'], error
            blank_report = check_empty(connection, encoding, values, expected, pu_ctes, pattern)
            actual = packed_results(connection, encoding, packing, candidate)
            for index, row in actual.items():
                assert row == expected_packed[index], (encoding, 'packed', repr(packing[index]), row, expected_packed[index])
            with connection.cursor() as cur:
                cur.execute('SHOW server_version')
                pg_version = cur.fetchone()[0]
            reports.append({'encoding': encoding, 'postgresql': pg_version, 'original_chr_894': error,
                            'empty_normalization': blank_report,
                            'full_packed_fields': {'samples': len(actual), 'fields': ['pl_a','n_a'], 'comparisons': 2 * len(actual)},
                            'status': 'passed'})
            print('PASS:', encoding, blank_report['comparisons'], 'empty comparisons;', 2 * len(actual), 'packed comparisons', flush=True)
        # Expose, rather than conceal, SQL_ASCII's lack of a declared byte encoding.
        with connections['SQL_ASCII'].cursor() as cur:
            try:
                cur.execute("SELECT encode(convert_to(convert_from(decode('97','hex'),'SQL_ASCII'),'UTF8'),'hex')")
                invalid = {'result': cur.fetchone()[0]}
            except psycopg2.Error as error:
                invalid = {'sqlstate': error.pgcode, 'message': error.diag.message_primary}
        assert sha(args.candidate) == current_sha, 'Candidate changed during validation'
        report = {'status': 'passed', 'completed': True, 'candidate_yaml_sha256': current_sha,
                  'frozen_codepoints_sha256': POINTS_SHA256, 'frozen_codepoints': len(points),
                  'codepoints_and_neighbors': neighbors, 'unique_empty_inputs': len(values),
                  'clickhouse': version, 'databases': reports,
                  'inherited_sql_ascii_fio_regression': {'input': 'Я', 'old': old_ascii,
                                                       'expected': old_ascii_expected, 'reproduced': True},
                  'sql_ascii_raw_non_utf8_diagnostic': invalid,
                  'scope': 'local PostgreSQL encoding model and ClickHouse 24.8 oracle; corporate GP not accessed',
                  'limitations': ['SQL_ASCII fixtures carry UTF8 bytes; arbitrary legacy-encoded byte strings need an explicit input encoding.',
                                  'WIN1251 corpus excludes Unicode characters that cannot be represented in WIN1251.',
                                  'Packed fields are extracted from shipped pl_a/n_a projections; full corporate ETL and transport are not executed.']}
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        print('PASS:', args.output)
    finally:
        for connection in connections.values():
            connection.close()


if __name__ == '__main__':
    main()
