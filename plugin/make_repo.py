"""Generate a Dalamud repository feed from the actual packaged plugin manifest."""
import argparse
import json
from pathlib import Path
import re
import time
from urllib.parse import urlsplit
import zipfile


def https_url(value):
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        raise ValueError("Repository and download URLs must be public HTTPS URLs.")
    return value


def make_feed(manifest, archive, repository_url, download_url, tag, timestamp):
    for key in ("Author", "Name", "InternalName", "AssemblyVersion", "Description"):
        if not isinstance(manifest.get(key), str) or not manifest[key].strip():
            raise ValueError(f"Manifest is missing {key}.")
    if manifest["InternalName"] != "Chatpendium":
        raise ValueError("This release must contain Chatpendium.")
    api = manifest.get("DalamudApiLevel")
    if not isinstance(api, int) or isinstance(api, bool) or api < 1:
        raise ValueError("Manifest needs a positive DalamudApiLevel from the build.")
    version = manifest["AssemblyVersion"]
    if not re.fullmatch(r"\d+\.\d+\.\d+\.\d+", version):
        raise ValueError("Manifest AssemblyVersion must have four numeric components.")
    match = re.fullmatch(r"chatpendium-v(\d+\.\d+\.\d+(?:\.\d+)?)", tag)
    if not match:
        raise ValueError("Tag must be chatpendium-vMAJOR.MINOR.PATCH[.REVISION].")
    tag_parts = [int(p) for p in match[1].split(".")]
    if tuple(tag_parts + [0] * (4 - len(tag_parts))) != tuple(int(p) for p in version.split(".")):
        raise ValueError("Release tag and packaged assembly version do not match.")
    with zipfile.ZipFile(archive) as package:
        names = package.namelist()
        for required in ("Chatpendium.dll", "Chatpendium.json", "chatpendium_native.dll"):
            if names.count(required) != 1:
                raise ValueError(f"Archive must contain exactly one {required} at its root.")
        if json.loads(package.read("Chatpendium.json")) != manifest:
            raise ValueError("The archive manifest differs from the feed input.")
        for binary in ("Chatpendium.dll", "chatpendium_native.dll"):
            with package.open(binary) as stream:
                if stream.read(2) != b"MZ":
                    raise ValueError(f"{binary} is not a Windows binary.")
    if timestamp <= 0:
        raise ValueError("Release timestamp must be positive.")
    entry = dict(manifest)
    entry.update({
        "RepoUrl": https_url(repository_url),
        "DownloadLinkInstall": https_url(download_url),
        "DownloadLinkUpdate": https_url(download_url),
        "ApplicableVersion": manifest.get("ApplicableVersion") or "any",
        "IsHide": False,
        "IsTestingExclusive": False,
        "LastUpdate": timestamp,
    })
    return [entry]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--repository-url", required=True)
    parser.add_argument("--download-url", required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--timestamp", type=int, default=int(time.time()))
    args = parser.parse_args()
    try:
        result = make_feed(json.loads(args.manifest.read_text(encoding="utf-8-sig")), args.archive,
                           args.repository_url, args.download_url, args.tag, args.timestamp)
    except (ValueError, OSError, zipfile.BadZipFile, KeyError) as error:
        parser.exit(1, f"Cannot generate repository feed: {error}\n")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Generated {args.output} for Chatpendium {result[0]['AssemblyVersion']}")


if __name__ == "__main__":
    main()
