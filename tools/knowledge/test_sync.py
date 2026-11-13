#!/usr/bin/env python3
"""Regression tests for knowledge update safeguards; no network or checkout writes."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import sync


class SyncSafetyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.content = b'original upstream content\n'
        self.name = 'docs/vendor/example/file.md'
        self.path = self.root / self.name
        self.path.parent.mkdir(parents=True)
        self.path.write_bytes(self.content)
        self.source = {
            'id': 'example', 'repository': 'https://github.com/example/docs.git',
            'commit': 'a' * 40,
            'mappings': [{'source': 'docs', 'target': 'docs/vendor/example'}],
            'files': {self.name: sync.digest(self.content)},
        }
        self.lock = self.root / 'sources.lock.json'
        self.lock.write_text(json.dumps({'schema': 1, 'sources': [self.source]}))
        self.addCleanup(patch.stopall)
        patch.object(sync, 'ROOT', self.root).start()
        patch.object(sync, 'LOCK', self.lock).start()

    def test_clean_tree_and_python_cache(self):
        cache = self.path.parent / '__pycache__/module.cpython-312.pyc'
        cache.parent.mkdir()
        cache.write_bytes(b'generated')
        sync.local_check([self.source])

    def test_modified_upstream_file_is_rejected(self):
        self.path.write_text('local work')
        with self.assertRaisesRegex(ValueError, 'modified'):
            sync.local_check([self.source])
        self.assertEqual(self.path.read_text(), 'local work')

    def test_unmanaged_file_is_rejected(self):
        (self.path.parent / 'notes.md').write_text('local notes')
        with self.assertRaisesRegex(ValueError, 'Unmanaged'):
            sync.local_check([self.source])

    def test_missing_file_only_allowed_for_restore(self):
        self.path.unlink()
        sync.local_check([self.source], missing_ok=True)
        with self.assertRaisesRegex(ValueError, 'Missing'):
            sync.local_check([self.source])

    def test_symlink_with_identical_content_is_rejected(self):
        other = self.root / 'another-file.md'
        other.write_bytes(self.content)
        self.path.unlink()
        self.path.symlink_to(other)
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            sync.local_check([self.source])

    def test_path_escape_is_rejected(self):
        for name in ('../outside', '/absolute'):
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'Invalid'):
                sync.local_path(name)

    def test_changed_during_fetch_is_preserved(self):
        def fetch(_):
            self.path.write_text('edit while fetching')
            return {self.name: self.content}
        with patch.object(sync, 'fetch', side_effect=fetch), patch.object(sys, 'argv', ['sync.py']):
            with self.assertRaisesRegex(ValueError, 'modified'):
                sync.main()
        self.assertEqual(self.path.read_text(), 'edit while fetching')

    def test_update_replaces_owned_files_and_updates_lock(self):
        new_name = 'docs/vendor/example/new.md'
        new_data = b'new pinned content\n'
        with patch.object(sync, 'fetch', return_value={new_name: new_data}), patch.object(
                sys, 'argv', ['sync.py', '--update', 'example', 'b' * 40]):
            sync.main()
        self.assertFalse(self.path.exists())
        self.assertEqual((self.root / new_name).read_bytes(), new_data)
        source = json.loads(self.lock.read_text())['sources'][0]
        self.assertEqual(source['commit'], 'b' * 40)
        self.assertEqual(source['files'], {new_name: sync.digest(new_data)})


if __name__ == '__main__':
    unittest.main()
