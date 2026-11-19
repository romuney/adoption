#!/usr/bin/env python3
"""Fetch pinned knowledge; refuse to overwrite local edits. Python stdlib + Git."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
LOCK = ROOT / 'docs/knowledge/sources.lock.json'

def digest(data):
    return hashlib.sha256(data).hexdigest()

def local_path(name):
    """Only normal, non-symlink paths inside this checkout may be modified."""
    relative = Path(name)
    if relative.is_absolute() or '..' in relative.parts or not relative.parts:
        raise ValueError('Invalid import path: ' + name)
    path = ROOT / relative
    for part in [path, *path.parents]:
        if part == ROOT:
            break
        if part.is_symlink():
            raise ValueError('Symlink in import path: ' + str(part))
    return path

def generated_bytecode(path):
    # The imported playbook's .gitignore allows Python's own import cache.
    return path.suffix == '.pyc' and '__pycache__' in path.parts

def local_check(sources, missing_ok=False):
    for source in sources:
        for name, sha in source['files'].items():
            path = local_path(name)
            if missing_ok and not path.exists():
                continue
            if not path.is_file() or digest(path.read_bytes()) != sha:
                raise ValueError('Missing or modified upstream file: ' + name)
        for mapping in source['mappings']:
            target = local_path(mapping['target'])
            if target.is_dir():
                entries = list(target.rglob('*'))
                if any(p.is_symlink() for p in entries):
                    raise ValueError('Symlink in import: ' + str(target))
                extras = {str(p.relative_to(ROOT)) for p in entries
                          if p.is_file() and not generated_bytecode(p)} - set(source['files'])
                # A license may be a separate mapping of this same source.
                if extras:
                    raise ValueError('Unmanaged files in import: ' + ', '.join(sorted(extras)))

def fetch(source):
    if not re.fullmatch(r'[0-9a-f]{40}', source['commit']):
        raise ValueError('Use a full commit SHA')
    if not re.fullmatch(r'https://github.com/[\w.-]+/[\w.-]+\.git', source['repository']):
        raise ValueError('Expected GitHub HTTPS repository')
    with tempfile.TemporaryDirectory(prefix='adoption-knowledge-') as tmp:
        def git(*args):
            return subprocess.check_output(['git', '-C', tmp, *args])
        git('init', '-q')
        git('fetch', '-q', '--depth=1', source['repository'], source['commit'])
        if git('rev-parse', 'FETCH_HEAD').decode().strip() != source['commit']:
            raise ValueError('Fetched commit mismatch')
        result = {}
        for mapping in source['mappings']:
            entries = git('ls-tree', '-rz', 'FETCH_HEAD', '--', mapping['source']).split(b'\0')
            found = False
            for entry in filter(None, entries):
                meta, name = entry.split(b'\t', 1)
                mode, kind, oid = meta.split()
                if kind != b'blob' or mode not in (b'100644', b'100755'):
                    raise ValueError('Symlinks/submodules unsupported in knowledge import')
                name = name.decode()
                suffix = name[len(mapping['source']):].lstrip('/')
                dest = str(Path(mapping['target']) / suffix) if suffix else mapping['target']
                local_path(dest)
                result[dest] = git('cat-file', 'blob', oid.decode())
                found = True
            if not found:
                raise ValueError('Empty source: ' + mapping['source'])
        return result

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--check', action='store_true', help='Offline integrity check')
    ap.add_argument('--update', nargs=2, metavar=('SOURCE_ID', 'FULL_COMMIT'))
    args = ap.parse_args()
    if args.check and args.update:
        ap.error('--check and --update are mutually exclusive')
    lock = json.loads(LOCK.read_text())
    local_check(lock['sources'], missing_ok=not args.check and not args.update)
    if args.check:
        print('PASS: all pinned files match SHA-256')
        return
    selected = lock['sources']
    if args.update:
        selected = [s for s in selected if s['id'] == args.update[0]]
        if not selected:
            ap.error('Unknown source ID')
        selected[0]['commit'] = args.update[1]
    # Download and validate everything before changing any tracked file.
    fetched = [(s, fetch(s)) for s in selected]
    for source, files in fetched:
        hashes = {p: digest(data) for p, data in sorted(files.items())}
        if not args.update and hashes != source['files']:
            raise ValueError('Pinned source content differs from lock')
    # A fetch can take minutes; do not overwrite edits made while it was running.
    local_check(lock['sources'], missing_ok=not args.update)
    for source, files in fetched:
        for name in set(source['files']) - set(files):
            local_path(name).unlink()
        for name, data in files.items():
            target = local_path(name)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        source['files'] = {p: digest(data) for p, data in sorted(files.items())}
    if args.update:
        LOCK.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + '\n')
    print('PASS: imported pinned knowledge; review diff and run tools/knowledge/check.py')

if __name__ == '__main__':
    main()
