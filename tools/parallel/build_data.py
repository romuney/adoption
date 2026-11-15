#!/usr/bin/env python3
"""Build isolated data shipment. Business expressions remain in reviewed source files.

The source notebook and paragraph are explicit: never silently substitute an old
notebook for current production. This tool does not execute GP/ClickHouse SQL.
"""
from pathlib import Path
import argparse
import ast
import hashlib
import json
import re
import sys
import yaml
from unicode_empty import rewrite_acceleration
from audience_people_data import PERSON_MAP_SQL, rewrite_sql as people_sql

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'Единый лист — поставка 2026-10-23 (ускорение через GP)'
OUT = ROOT / 'Параллельный отчёт — pa_next'
NAMES = {3: ('head', '3. SQL — шапка.sql'), 5: ('cat', '5. SQL — каталог.sql'), 7: ('one', '7. SQL — панель.sql')}
CONTROL = 'pa_next_run'
WORKSPACE_SQL = """-- Keep all new GP tables in this notebook's current working schema.
-- Pin search_path so DROP cannot fall back to an older usr_cross_data table.
-- Empty search_path stops CREATE if a physical/source/session schema was selected.
SELECT set_config('search_path', CASE
    WHEN current_schema() IS NOT NULL
     AND current_schema() NOT IN ('usr_cross_data', 'pg_catalog', 'information_schema')
     AND current_schema() NOT LIKE 'pg_temp_%'
    THEN quote_ident(current_schema()) ELSE '' END, false);

"""
TITLES = {
    'instructions': 'Как запускать эту ноду',
    'wait': 'Дождаться обновления источника просмотров',
    'control': 'Создать номер загрузки и статусы публикации',
    'source': 'Собрать просмотры по действующей методологии',
    'pa_next_login_map': 'Объединить прежние и текущие логины сотрудников',
    'pa_next_evd_day': 'Собрать просмотры по дням, отчётам и людям',
    'pa_next_dash_meta': 'Определить последние атрибуты отчётов',
    'pa_next_emp_attrs': 'Определить последние атрибуты зрителей',
    'pa_next_pair': 'Подготовить историю посещений по людям и отчётам',
    'pa_next_dash_bkt': 'Разложить посещения по календарным периодам',
    'pa_next_staff': 'Собрать актуальный состав сотрудников',
    'pa_next_dash_acl': 'Собрать правила доступа к отчётам',
    'pa_next_adg_member': 'Раскрыть состав AD-групп с вложенными группами',
    'pa_next_adg_size': 'Подсчитать численность AD-групп',
    'pa_next_dash_ca': 'Определить целевую аудиторию отчётов',
    'pa_next_pair_acc': 'Проверить доступ зрителей к просмотренным отчётам',
    'pa_next_person_id_map': 'Связать Master ID с текущими сотрудниками для списка ЦА',
    '1a': 'Подготовить атрибуты людей, права и словари (ускорение 1a)',
    '1b': 'Рассчитать дневные показатели и календари (ускорение 1b)',
    '1c': 'Подготовить строки каталога и аудитории (ускорение 1c)',
    'export': 'Выгрузить витрины в ClickHouse и подтвердить готовность',
}


def working_gp(text):
    """Only new products move; shared input tables keep their explicit schemas."""
    return re.sub(r'\busr_cross_data\.(pa_next_\w+)\b', r'\1', text)


def first(prefix):
    found = list(BASE.glob(prefix + '*'))
    if len(found) != 1:
        raise ValueError(f'Expected one source for {prefix!r}: {found}')
    return found[0]


def rename_gp(text, raw_source):
    text = text.replace(raw_source, 'pa_next_source')
    return working_gp(re.sub(r'\bpa_(?!next_)(\w+)\b', r'pa_next_\1', text))


def remove_unused_max_date(text, consumers):
    """Only remove a proven dead projection; keep schema/grouping/multiplicity.

    max_date is not a GROUP BY key and never read by the final base GP or the
    accelerators. Remove two unused scalar MAX subqueries; physical scan counts need a GP plan.
    Fail the build if a future consumer starts using that field.
    """
    if re.search(r'\bmax_date\b', consumers, re.I):
        raise ValueError('max_date has a consumer: cannot prune its source subqueries')
    pattern = r'\(select\s+max\(event_dttm\)\s+from\s+prod_v_sse_crossdata\.event_physical_report\)\s+as\s+max_date'
    output, count = re.subn(pattern, 'cast(null as timestamp) as max_date', text, flags=re.I)
    if count != 2:
        raise ValueError('Expected exactly two unused max_date subqueries')
    return output


def stamped_ctas(text):
    """Wrap only final CTAS projection; original aggregation remains unchanged."""
    rx = re.compile(r'(create\s+(?:temp\s+)?table\s+([\w.]+)\s+as\s*\n)(.*?)(\ndistributed\s+(?:by\s*\([^;]+\)|randomly)\s*;)', re.I | re.S)
    def wrap(m):
        if m[2].endswith('pa_next_acc_any'):
            return m[0]  # paragraph-local helper; never exported
        return m[1] + 'SELECT payload.*, generation.run_id AS _pa_next_run\nFROM (\n' + m[3] + '\n) payload\nCROSS JOIN ' + CONTROL + ' generation' + m[4]
    text, count = rx.subn(wrap, text)
    if not count:
        raise ValueError('No CTAS statements stamped')
    return text


def export_calls(code):
    specs = []
    for node in ast.walk(ast.parse(code)):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == 'gp_to_click':
            args = [ast.literal_eval(x) for x in node.args]
            kw = {x.arg: ast.literal_eval(x.value) for x in node.keywords}
            if len(args) != 2:
                raise ValueError('Changed gp_to_click signature: review actual production export')
            specs.append({'gp': working_gp(re.sub(r'\bpa_', 'pa_next_', args[0])), 'ch': re.sub(r'\bpa_', 'pa_next_', args[1]), 'options': kw})
    return specs


def versioned_sql(text, part):
    text = people_sql(text, part)
    # The old delivery banner names its production packer; do not give an agent
    # an instruction to rebuild over that production shipment.
    text = re.sub(r'^\{# Proteus Adoption[^\n]*\n', '{# PA NEXT — generated by tools/parallel/build_data.py; physical tables isolated, business calculations inherited from the reviewed GP shipment. #}\n', text, count=1)
    text = re.sub(r'\bprod_proteus\.pa_(\w+)', r'prod_proteus.pa_next_\1', text)
    tables = sorted(set(re.findall(r'\bprod_proteus\.(pa_next_\w+)', text)))
    # The marker is an extra protocol row. Never alter business rows or tolerances.
    checks = []
    for table in tables:
        checks.append("(SELECT countIf(ifNull(_pa_next_run, '') != (SELECT any(run_id) FROM prod_proteus.pa_next_manifest)) FROM prod_proteus." + table + ") = 0")
    ready = "(SELECT count() = 1 AND countIf(state = 'ready') = 1 FROM prod_proteus.pa_next_manifest) AND " + ' AND '.join(checks)
    marker = "\nUNION ALL\nSELECT 'pa_next_version' AS section, '" + part + "' AS g,\n  (SELECT any(toString(run_id)) FROM prod_proteus.pa_next_manifest) AS k,\n  if(" + ready + ", 'ready', 'loading') AS parent,\n  toInt64(parent = 'ready') AS n\n"
    requests = ''
    if part in ('cat', 'one'):
        # Iterate filter_values: AlwaysTrueObject on Save supports iteration but
        # not indexing/list concatenation. Escape backslash BEFORE quote.
        for owner in ('head', 'cat', 'one'):
            requests += "\n{% set PA_REQ = namespace(value='', seen=false) %}\n"
            requests += "{% for item in filter_values('pa_next_" + owner + "_req') %}{% if not PA_REQ.seen %}{% set PA_REQ.value = item|string %}{% set PA_REQ.seen = true %}{% endif %}{% endfor %}\n"
            requests += "UNION ALL\nSELECT 'pa_next_request' AS section, '" + owner + "' AS g,\n"
            requests += r'''  '{{ PA_REQ.value.replace("\\", "\\\\").replace("'", "''") }}' AS k, '' AS parent, toInt64(0) AS n''' + '\n'
    return text.rstrip().rstrip(';') + marker + requests, tables


class LiteralDumper(yaml.SafeDumper):
    pass


def literal(dumper, value):
    return dumper.represent_scalar('tag:yaml.org,2002:str', value, style='|' if '\n' in value else None)


LiteralDumper.add_representer(str, literal)


def build(source_path, source_paragraph, raw_table, write=True):
    notebook = yaml.safe_load(source_path.read_text())
    paras = notebook['paragraphs']
    source = [p for p in paras if p.get('title') == source_paragraph]
    if len(source) != 1 or source[0].get('shebang') != 'gp':
        raise ValueError('Explicit source GP paragraph not found or ambiguous')
    src_sql = source[0]['code'].strip().rstrip(';') + ';'
    created = re.findall(r'(?i)create\s+table\s+([\w.]+)', src_sql)
    if created != [raw_table]:
        raise ValueError(f'Source paragraph must build exactly {raw_table}; got {created}')
    base_candidates = [p for p in paras if p.get('title') == 'Для единой вкладки' and p.get('shebang') == 'gp' and p.get('isEnabled')]
    if len(base_candidates) != 1:
        raise ValueError('Expected one active final production GP paragraph: Для единой вкладки')
    consumers = base_candidates[0]['code'] + '\n' + '\n'.join(first(p).read_text() for p in ['1a. GP', '1b. GP', '1c. GP'])
    source_sql = rename_gp(remove_unused_max_date(src_sql, consumers), raw_table)
    # Raw source is not exported; downstream fact generation uses the run marker.
    control = """-- Only this isolated experiment's control tables are changed.
DROP TABLE IF EXISTS pa_next_run;
CREATE TABLE pa_next_run AS
SELECT md5(current_timestamp::text || random()::text)::text AS run_id
DISTRIBUTED RANDOMLY;
DROP TABLE IF EXISTS pa_next_loading;
CREATE TABLE pa_next_loading AS
SELECT run_id, 'loading'::text AS state FROM pa_next_run
DISTRIBUTED RANDOMLY;
DROP TABLE IF EXISTS pa_next_ready;
CREATE TABLE pa_next_ready AS
SELECT run_id, 'ready'::text AS state FROM pa_next_run
DISTRIBUTED RANDOMLY;
"""
    paragraphs = [dict(title=TITLES['instructions'], shebang='md', code='Параллельный отчёт. Запускать весь ноут сверху вниз; одновременные запуски запрещены. Новые GP-таблицы pa_next_* создаются в рабочей схеме этой ноды; usr_cross_data используется только для чтения общих источников. При ошибке «no schema has been selected to create in» выбрать рабочую схему ноды вместо usr_cross_data. При неуспешной выгрузке исправить причину и перезапустить весь ноут. Старый manifest не подтверждает успех нового запуска.', isEnabled=True),
                  dict(title=TITLES['control'], shebang='gp', code=control, isEnabled=True),
                  dict(title=TITLES['source'], shebang='gp', code=source_sql, isEnabled=True)]
    # Use the FINAL active production GP paragraph, not superseded earlier builds.
    # Base file already contains paragraph boundaries. Splitting on DROP TABLE keeps
    # each table build within one GP session; acceleration 1a retains its temp table.
    base = rename_gp(base_candidates[0]['code'], raw_table)
    base = base.split('-- ЧАСТЬ 3.')[0]
    chunks = re.split(r'(?im)(?=^drop table if exists )', base)[1:]
    for chunk in chunks:
        name = re.search(r'(?i)create table ([\w.]+)', chunk)[1]
        paragraphs.append(dict(title=TITLES[name], shebang='gp', code=stamped_ctas(chunk) + '\nANALYZE ' + name + ';\n', isEnabled=True))
    paragraphs.append(dict(title=TITLES['pa_next_person_id_map'], shebang='gp',
                           code=stamped_ctas(PERSON_MAP_SQL) + '\nANALYZE pa_next_person_id_map;\n', isEnabled=True))
    for prefix in ['1a. GP', '1b. GP', '1c. GP']:
        acceleration = first(prefix).read_text()
        # Drop obsolete placement instructions for the old notebook, retain SQL
        # and its methodology comments below the first actual table description.
        acceleration = '-- ---- витрина' + acceleration.split('-- ---- витрина', 1)[1]
        if prefix == '1a. GP':
            acceleration = rewrite_acceleration(acceleration)
        code = stamped_ctas(rename_gp(acceleration, raw_table))
        paragraphs.append(dict(title=TITLES[prefix[:2]], shebang='gp', code=code, isEnabled=True))
    # Imported actual readiness check only; no obsolete outputs/cache warmup.
    waiters = [p for p in paras if p.get('isEnabled') and p.get('shebang') == 'python_condition' and '.tables_wait' in p.get('code', '')]
    for waiter in reversed(waiters):
        paragraphs.insert(1, dict(title=TITLES['wait'], shebang='python_condition', code=waiter['code'], isEnabled=True))
    actual_exports = [p for p in paras if p.get('title') == 'Для единой вкладки' and p.get('shebang') == 'python_condition' and p.get('isEnabled')]
    if len(actual_exports) != 1:
        raise ValueError('Expected one final active production export paragraph')
    base_exports = export_calls(actual_exports[0]['code'])
    if base_exports != export_calls(first('2. Python').read_text()):
        raise ValueError('Actual production base exports differ from prepared shipment: review transport/schema options before building')
    exports = base_exports + export_calls(first('2a. Python').read_text())
    exports.append({'gp': 'pa_next_person_id_map', 'ch': 'prod_proteus.pa_next_person_id_map',
                    'options': {'order_by_columns': '(master_id, login)'}})
    export = """# Uses the same supported gp_to_click API as the production notebook.
# No click_execute / views / unverified atomic RENAME API.
import proteus_py.database.clickhouse as ppy
# Invalidate publication BEFORE the first data table changes. If this fails,
# execution raises and no data export below runs.
ppy.gp_to_click('pa_next_loading', 'prod_proteus.pa_next_manifest',
                order_by_columns='(run_id)')
"""
    for item in exports:
        export += "ppy.gp_to_click(" + repr(item['gp']) + ', ' + repr(item['ch'])
        for name, value in item['options'].items():
            export += ', ' + name + '=' + repr(value)
        export += ')\n'
    export += """# Publish ready LAST; exceptions propagate and stop subsequent export calls.
ppy.gp_to_click('pa_next_ready', 'prod_proteus.pa_next_manifest',
                order_by_columns='(run_id)')
print('PA NEXT: all data tables uploaded; generation published ready')
"""
    paragraphs.append(dict(title=TITLES['export'], shebang='python_condition', code=export, isEnabled=True))
    for paragraph in paragraphs:
        if paragraph['shebang'] == 'gp':
            paragraph['code'] = WORKSPACE_SQL + paragraph['code']
    data = {'title': 'Proteus Adoption NEXT — отдельный отчёт', 'paragraphs': paragraphs}
    generated = {'1. Helicopter — pa_next.yaml': yaml.dump(data, Dumper=LiteralDumper, allow_unicode=True, sort_keys=False, width=120),
                 'src/export.py': export}
    patch = next(p['code'] for p in paragraphs if p['title'] == TITLES['1a'])
    generated['12. GP — замена ускорения 1a.sql'] = (
        '-- Код параграфа «' + TITLES['1a'] + '».\n'
        '-- Только для версии ноды, где ВСЕ pa_next_* находятся в рабочей схеме.\n'
        '-- Для перехода со старой версии usr_cross_data импортировать полный YAML.\n'
        '-- Затем выполнить всю PA NEXT ноду сверху вниз и проверку готовности из файла 11.\n'
        '-- Исправляет chr(894) и обработку ФИО в SQL_ASCII; правило расчёта сохраняется.\n'
        + patch)
    datasets = {}
    for num, (part, name) in NAMES.items():
        sql, tables = versioned_sql(first(str(num) + '. SQL').read_text(), part)
        generated[name] = sql
        datasets[part] = dict(path=name, tables=tables)
    source_files = {str(first(prefix).relative_to(ROOT)): hashlib.sha256(first(prefix).read_bytes()).hexdigest()
                    for prefix in ['1a. GP', '1b. GP', '1c. GP', '2. Python', '2a. Python', '3. SQL', '5. SQL', '7. SQL']}
    manifest = dict(source_notebook=str(source_path.relative_to(ROOT)), source_sha256=hashlib.sha256(source_path.read_bytes()).hexdigest(), source_paragraph=source_paragraph, source_table=raw_table,
                    accelerated_source_sha256=source_files, exports=exports, datasets=datasets,
                    gp_workspace={'mode': 'unqualified names in the Helicopter working schema',
                                  'search_path': 'pinned to current_schema() in every GP paragraph',
                                  'cross_connection': 'Data/control tables are regular working-schema tables; only pa_next_acc_any is TEMP',
                                  'source_schemas': 'Read-only; no pa_next writes in usr_cross_data'},
                    paragraph_titles=TITLES,
                    gp_text_compatibility={'paragraph': TITLES['1a'],
                                           'empty_levels': 'Exact inherited CH 24.8 Unicode set, matched on UTF8 hex',
                                           'fio_packing': 'Byte-delimited UTF8 hex; original compact alphabet and escaping',
                                           'patch': '12. GP — замена ускорения 1a.sql',
                                           'sql_ascii_limit': 'Text bytes must be valid UTF8; unknown legacy bytes are not guessed'},
                    source_optimization={'unused_column': 'max_date', 'replacement': 'cast(null as timestamp)', 'removed_scalar_max_subqueries': 2,
                                         'proof': 'No max_date identifier in final production base GP or accelerators; exact business-column event and 12-table GP regression'},
                    contract={'section': 'pa_next_version', 'k': 'run_id', 'parent': 'ready or loading', 'n': '1 only when ready', 'g': 'head, cat, one',
                              'request_section': 'pa_next_request', 'request_datasets': ['cat', 'one'], 'request_owners': ['head', 'cat', 'one'],
                              'request_carriers': ['pa_next_head_req', 'pa_next_cat_req', 'pa_next_one_req']})
    generated['src/data-manifest.json'] = json.dumps(manifest, ensure_ascii=False, indent=2) + '\n'
    for name, text in generated.items():
        target = OUT / name
        if write:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text)
        elif not target.exists() or target.read_text() != text:
            raise ValueError('Generated output differs: ' + str(target))
    print(('WROTE' if write else 'PASS'), len(paragraphs), 'paragraphs;', len(exports), 'exports; 3 datasets')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source-yaml', type=Path, required=True)
    p.add_argument('--source-paragraph', required=True)
    p.add_argument('--source-table', required=True)
    p.add_argument('--check', action='store_true')
    a = p.parse_args()
    build(a.source_yaml.resolve(), a.source_paragraph, a.source_table, write=not a.check)

if __name__ == '__main__':
    main()
