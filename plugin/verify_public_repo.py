"""Verify anonymous plugin downloads and the reviewed Odd Realities DLL."""
import hashlib
import io
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

feed = json.loads(Path(sys.argv[1]).read_text())
assert len({e['InternalName'] for e in feed}) == len(feed)
assert {'Chatpendium', 'OddRealities.Source'} <= {e['InternalName'] for e in feed}
for entry in feed:
    with urllib.request.urlopen(entry['DownloadLinkInstall'], timeout=60) as response:
        payload = response.read()
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        assert archive.testzip() is None
        name = entry['InternalName']
        manifest = json.loads(archive.read(name + '.json').decode('utf-8-sig'))
        assert manifest['InternalName'] == name
        assert manifest['AssemblyVersion'] == entry['AssemblyVersion']
        assert manifest['DalamudApiLevel'] == entry['DalamudApiLevel']
        if name == 'OddRealities.Source':
            assert set(archive.namelist()) == {'OddRealities.Source.dll', 'OddRealities.Source.json', 'OddRealities.Source.deps.json'}
            assert hashlib.sha256(archive.read(name + '.dll')).hexdigest() == 'cd4ca49c92b007595296d017eac600d0c4de584188479fc9a1495c691a168a07'
    print(name, entry['AssemblyVersion'], 'anonymous download and package checks PASS')
