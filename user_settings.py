"""User preferences stored independently of application releases and claim data."""
import json
import os
from pathlib import Path
import tempfile
import threading

SCHEMA = 1
DEFAULTS = {'ocr': True, 'highlightOriginal': True, 'searchMode': 'any'}


def settings_path():
    return Path(os.environ.get('LOCALAPPDATA', Path.home() / 'AppData' / 'Local')) / 'Claims Power Search' / 'settings.json'


class UserSettings:
    def __init__(self, path=None):
        self.path = Path(path) if path is not None else settings_path()
        self.lock = threading.RLock()

    def read_document(self):
        if not self.path.exists():
            return {'schemaVersion': SCHEMA, 'preferences': {}}
        data = json.loads(self.path.read_text(encoding='utf-8'))
        if not isinstance(data, dict) or data.get('schemaVersion') != SCHEMA or not isinstance(data.get('preferences'), dict):
            raise ValueError('Settings format is unsupported; the existing file has been preserved.')
        return data

    @staticmethod
    def validate(values):
        if not isinstance(values, dict):
            raise ValueError('Invalid preferences.')
        for key, value in values.items():
            if key not in DEFAULTS:
                raise ValueError('Unknown preference: ' + key)
            if key == 'searchMode':
                if value not in ('any', 'all', 'phrase'):
                    raise ValueError('Invalid search mode.')
            elif type(value) is not bool:
                raise ValueError('Invalid checkbox preference.')

    def load(self):
        with self.lock:
            try:
                data = self.read_document()
                known = {key: value for key, value in data['preferences'].items() if key in DEFAULTS}
                self.validate(known)
                return {**DEFAULTS, **known}, ''
            except (OSError, ValueError):
                return DEFAULTS.copy(), 'Saved settings could not be read. Defaults are in use; the existing settings file has been preserved.'

    def update(self, values):
        self.validate(values)
        with self.lock:
            # Re-read and merge so newer/unknown fields survive upgrades. Never
            # overwrite an unreadable file or one from a newer schema.
            data = self.read_document()
            data['preferences'].update(values)
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = None
            try:
                with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=self.path.parent, delete=False) as output:
                    temporary = Path(output.name)
                    json.dump(data, output, indent=2, ensure_ascii=False)
                    output.write('\n')
                    output.flush()
                    os.fsync(output.fileno())
                os.replace(temporary, self.path)
            finally:
                if temporary is not None and temporary.exists():
                    temporary.unlink()
            return self.load()[0]
