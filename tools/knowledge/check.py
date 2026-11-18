#!/usr/bin/env python3
"""Offline checks for pinned knowledge, routing and local Markdown links."""
import json
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit
from sync import ROOT, LOCK, local_check

local_check(json.loads(LOCK.read_text())['sources'])
skills = sorted((ROOT / '.agents/skills').glob('*/SKILL.md'))
assert {p.parent.name for p in skills} == {'clickhouse-best-practices','web-design-guidelines','proteus-playbook','frontend-design','performance','core-web-vitals'}
for skill in skills:
    text = skill.read_text()
    front = text.split('---', 2)[1]
    for field in ('name', 'description'):
        assert re.search(r'^'+field+r':\s*\S', front, re.M), (skill,field)
    assert re.search(r'^name:\s*'+skill.parent.name+r'\s*$',front,re.M), skill

router_file = ROOT / '.agents/skills/proteus-playbook/SKILL.md'
router = router_file.read_text()
router_targets = {(router_file.parent / unquote(target)).resolve()
                  for target in re.findall(r'\]\(([^)\s]+)\)', router)
                  if not urlsplit(target).scheme and not target.startswith('#')}
for case in json.loads((ROOT/'docs/knowledge/scenarios.json').read_text()):
    for name in case['read']:
        assert (ROOT/name).is_file(),name
        assert (ROOT/name).resolve() in router_targets,(case['task'],name)
    print('PASS routing:',case['task'])

# Scan actual Markdown inline links, not code samples of hypothetical project paths.
# Fragment IDs are intentionally excluded: upstream has renderer-specific headings.
files=[ROOT/'AGENTS.md',ROOT/'README.md',ROOT/'CLAUDE.md',ROOT/'docs/knowledge/README.md']
for directory in ['.agents/skills','docs/vendor']:
    files.extend((ROOT/directory).rglob('*.md'))
count=0
for file in files:
    text=re.sub(r'^```.*?^```\s*$', '', file.read_text(), flags=re.M|re.S)
    for match in re.finditer(r'!?\[[^\]\n]*\]\((<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\)',text):
        target=match.group(1).strip('<>')
        if target == '…' and file.name == 'RESULTS.js.md':
            # Upstream historical example [text](…), not a dependency.
            continue
        if urlsplit(target).scheme or target.startswith('#'):
            continue
        target=unquote(target.split('#')[0])
        assert (file.parent/target).exists(), (str(file.relative_to(ROOT)),target)
        count+=1
for name in ['kit/sbx/run.cjs','kit/sbx/inner.html','kit/sbx/parent.html',
             'kit/sqlgate.py','kit/superset201.py','templates/instruction.template.md']:
    assert (ROOT/'docs/vendor/proteus-playbook'/name).is_file(),name
for name in ['engine/registry.py','fixtures/EXPECT.json','templates/TEMPLATE.chart.js',
             'check.py','smoke.mjs','validate.py']:
    assert (ROOT/'skills/proteus-echarts-builder'/name).is_file(),name
print(f'PASS: {len(skills)} skill entries, 5 routes, {count} local Markdown links, helper files and pinned hashes')
print('Not tested: automatic activation in a new chat, remote URLs, production systems')
