"""Release checks prevent an install feed advertising an incomplete/wrong build."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("make_repo", Path(__file__).resolve().parents[1] / "plugin/make_repo.py")
repo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repo)


class RepositoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.archive = Path(self.temp.name) / "Chatpendium.zip"
        self.manifest = {"Author": "yycholla", "Name": "Chatpendium", "InternalName": "Chatpendium",
                         "AssemblyVersion": "0.1.0.0", "Description": "Test fixture", "DalamudApiLevel": 15}
        self.package()

    def package(self, native=True):
        with zipfile.ZipFile(self.archive, "w") as package:
            package.writestr("Chatpendium.json", json.dumps(self.manifest))
            package.writestr("Chatpendium.dll", b"MZtest-fixture")
            if native:
                package.writestr("chatpendium_native.dll", b"MZtest-fixture")

    def feed(self, **overrides):
        values = dict(manifest=self.manifest, archive=self.archive,
                      repository_url="https://github.com/yycholla/studium",
                      download_url="https://github.com/yycholla/studium/releases/download/chatpendium-v0.1.0/Chatpendium.zip",
                      tag="chatpendium-v0.1.0", timestamp=1_800_000_000)
        values.update(overrides)
        return repo.make_feed(**values)

    def test_feed_uses_packaged_version_api_and_downloads(self):
        entry = self.feed()[0]
        self.assertEqual(entry["AssemblyVersion"], "0.1.0.0")
        self.assertEqual(entry["DalamudApiLevel"], self.manifest["DalamudApiLevel"])
        self.assertEqual(entry["DownloadLinkUpdate"], entry["DownloadLinkInstall"])
        self.assertFalse(entry["IsTestingExclusive"])

    def test_rejects_wrong_tag_or_missing_native_dll(self):
        with self.assertRaises(ValueError):
            self.feed(tag="chatpendium-v0.2.0")
        self.package(native=False)
        with self.assertRaises(ValueError):
            self.feed()

    def test_rejects_manifest_mismatch_invalid_api_and_private_url(self):
        with self.assertRaises(ValueError):
            self.feed(manifest={**self.manifest, "Description": "different"})
        with self.assertRaises(ValueError):
            self.feed(manifest={**self.manifest, "DalamudApiLevel": 0})
        with self.assertRaises(ValueError):
            self.feed(download_url="https://token@example.com/download.zip")


if __name__ == "__main__":
    unittest.main()
