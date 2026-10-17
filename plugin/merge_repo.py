"""Merge independently published plugin entries without dropping existing plugins."""
import json
import sys
from pathlib import Path


def merge(base, additional):
    entries = {}
    for entry in [*base, *additional]:
        name = entry['InternalName']
        if name in entries:
            raise ValueError(f'Duplicate plugin: {name}')
        for key in ('DownloadLinkInstall', 'DownloadLinkUpdate'):
            if not entry[key].startswith('https://github.com/yycholla/studium/releases/download/'):
                raise ValueError('Expected a public Studium release URL')
        entries[name] = entry
    return list(entries.values())


if __name__ == '__main__':
    base, extra, output = map(Path, sys.argv[1:])
    result = merge(json.loads(base.read_text()), json.loads(extra.read_text()))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + '\n')
