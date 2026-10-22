import json
from pathlib import Path
import tempfile
import unittest
from user_settings import DEFAULTS, UserSettings


class SettingsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'profile' / 'settings.json'

    def test_preferences_survive_reopening_and_partial_updates(self):
        store = UserSettings(self.path)
        self.assertEqual(store.load(), (DEFAULTS, ''))
        store.update({'ocr': False, 'searchMode': 'phrase'})
        reopened = UserSettings(self.path)
        reopened.update({'highlightOriginal': False})
        self.assertEqual(reopened.load(), ({'ocr': False, 'highlightOriginal': False, 'searchMode': 'phrase'}, ''))

    def test_unknown_fields_survive_upgrade(self):
        self.path.parent.mkdir()
        self.path.write_text(json.dumps({'schemaVersion': 1, 'futureMetadata': 'keep', 'preferences': {'futureOption': 7}}))
        UserSettings(self.path).update({'ocr': False})
        saved = json.loads(self.path.read_text())
        self.assertEqual(saved['futureMetadata'], 'keep')
        self.assertEqual(saved['preferences']['futureOption'], 7)

    def test_corrupt_or_future_settings_are_preserved(self):
        self.path.parent.mkdir()
        for original in ('broken json', '{"schemaVersion": 2, "preferences": {}}'):
            self.path.write_text(original)
            store = UserSettings(self.path)
            self.assertTrue(store.load()[1])
            with self.assertRaises(ValueError):
                store.update({'ocr': False})
            self.assertEqual(self.path.read_text(), original)

    def test_rejects_claim_data_and_invalid_preferences(self):
        for data in ({'query': 'prior claim'}, {'ocr': 'false'}, {'searchMode': 'bad'}, []):
            with self.assertRaises(ValueError):
                UserSettings(self.path).update(data)
        self.assertFalse(self.path.exists())
