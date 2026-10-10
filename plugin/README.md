# Chatpendium for Dalamud

An in-game picker for the same text faces and symbols as [The Studium](https://studium.yycholla.com/chatpendium). `/chatpendium` opens the picker; `/chatpendium cat` opens a search. Click **Copy**, then paste into your chat draft. Save favorites and filter by category or printable ASCII.

When Chat 2 is loaded, its message context menu offers **Open Chatpendium** and **Search message in Chatpendium**. The plugin also works without Chat 2. Message searches run locally and reset other filters; chat content never goes to the website. Search matches all words, so a whole sentence may have no matches.

**Status:** [Chatpendium 0.1.0](https://github.com/yycholla/studium/releases/tag/chatpendium-v0.1.0) is published, and the [release workflow](https://github.com/yycholla/studium/actions/runs/38091822836) successfully deployed the installer feed to GitHub Pages. The Windows build, Rust tests, native ABI checks, and package validation passed. In-game validation remains required.

## Why a C# adapter?

Dalamud's [loader](https://github.com/goatcorp/Dalamud/blob/master/Dalamud/Plugin/Internal/Types/LocalPlugin.cs) loads .NET plugin assemblies. The adapter implements that entry point and calls Rust through a C ABI.

| Directory | Responsibility |
| --- | --- |
| `crates/chatpendium-core` | Canonical catalog shared with the website; plugin search, filters, and catalog validation. Safe Rust. |
| `crates/chatpendium-native` | Versioned C exports, UTF-8 JSON, paired allocation/free, panic containment. Produces `chatpendium_native.dll`. |
| `plugin/Chatpendium` | Dalamud lifecycle, ImGui window, clipboard, local settings, Chat 2 IPC, HTTP/cache. |

The native DLL loads from the plugin's own folder. ABI version 1 is checked first. Rust frees its own responses. Network tasks only download data; native calls run on the UI thread. The DLL is released on plugin unload.

Integration uses Chat 2's [documented context-menu IPC](https://github.com/Infiziert90/ChatTwo/blob/main/ipc.md), with signatures checked against its [provider](https://github.com/Infiziert90/ChatTwo/blob/main/ChatTwo/IpcManager.cs). It re-registers when Chat 2 announces availability and unsubscribes on unload. Direct input insertion is not implemented because the documented API does not expose input mutation. Nothing automatically sends chat.

## Catalog and favorites

The DLL embeds the same catalog as the website. Startup loads a validated cache when available and checks `https://studium.yycholla.com/api/chatpendium/v1/catalog.json` once. **Refresh catalog** retries manually. Invalid or unavailable updates leave the current catalog usable. Successful updates replace the offline cache after Rust validates them.

Schema: `{ "schema_version": 1, "entries": [...] }`. Each entry has `id`, `name`, `text`, `category`, and `tags`. Validation rejects unknown schemas/categories, duplicate IDs, excessive sizes, controls/newlines, and unlisted chat glyphs. New symbols outside the compiled allowlist require a plugin update.

Favorites persist in Dalamud's local plugin configuration; they do not sync with the browser. Character compatibility is community documented, not a live-game guarantee, and ImGui's font may render differently. Deploy the updated website export to enable catalog downloads; the bundled catalog works before deployment.

## Build

On Windows x64, install Rust 1.95+ with the MSVC toolchain and Visual Studio C++ build tools, .NET 10 SDK, and Dalamud development assemblies through XIVLauncher. `Dalamud.NET.Sdk` is pinned to 15.0.0 following the [official sample](https://github.com/goatcorp/SamplePlugin); review the pin when upgrading API generations.

From the project root in PowerShell:

```powershell
rustup target add x86_64-pc-windows-msvc
./plugin/build.ps1
```

The SDK uses `%APPDATA%\XIVLauncher\addon\Hooks\dev` by default. Override it with `./plugin/build.ps1 -DalamudHome 'C:\path\to\Dalamud'`.

Output: `plugin/Chatpendium/bin/Release/Chatpendium.dll`, `Chatpendium.json`, and `chatpendium_native.dll`. Keep both DLLs together. The SDK packages them in `plugin/Chatpendium/bin/Release/Chatpendium/latest.zip`. For a local test, add the managed DLL under `/xlsettings` → Experimental → Dev Plugin Locations, then enable the plugin in `/xlplugins`. Wine/XIVLauncher also needs the Windows native DLL; the Linux `.so` is only for local core tests.

## GitHub custom repository

The source repository is `yycholla/studium`. GitHub Releases hosts plugin ZIPs and GitHub Pages hosts the installer feed; the Cloudflare website remains independent.

`.github/workflows/chatpendium.yml` builds on `main`, pull requests, and manual runs. It runs Rust tests, exercises the actual Windows native DLL, builds the adapter, and uploads an artifact. Ordinary commits do not publish a release.

Select **GitHub Actions** under the repository's **Settings → Pages** and allow deployments from `main`. To request a release, update `<Version>` in `Chatpendium.csproj` and change the tag in `plugin/release.json` to the matching `chatpendium-vMAJOR.MINOR.PATCH`. Commit both changes to `main`. The workflow tests and packages that exact commit, creates its version tag and GitHub Release, then deploys the feed. An unchanged release-request file does not publish again; pull requests and manual builds only produce test artifacts.

Alternatively, allow the `github-pages` environment to deploy from `chatpendium-v*` tags and push a matching version tag:

```sh
git tag chatpendium-v0.1.0
git push origin chatpendium-v0.1.0
```

After that workflow succeeds, players add this URL under `/xlsettings` → Experimental → Custom Plugin Repositories, enable the entry, save, and find Chatpendium in `/xlplugins`:

```text
https://yycholla.github.io/studium/repo.json
```

The generator uses the built manifest's version and API level, verifies tag agreement, and checks that the ZIP contains both Windows DLLs and the matching manifest. Downloads use versioned URLs. Increase the project version and update `plugin/release.json` (or push the matching tag) for subsequent updates. The same JSON format supports public GitLab Pages and release assets if hosting changes. See [Dalamud's custom-repository specification](https://dalamud.dev/plugin-publishing/custom-repositories/).

`plugin/make_repo.py --help` documents manual feed generation. No fake installer entry is committed before a real package exists.

## Verification

```sh
cargo test --workspace --locked
cargo build --locked -p chatpendium-native
python3 tests/native.py target/debug/libchatpendium_native.so
python3 -m unittest discover -s tests -p test_repo.py
```

On Windows, point the ABI test at `target/x86_64-pc-windows-msvc/release/chatpendium_native.dll`. Feed unit tests use explicitly synthetic binary fixtures; Windows CI compiles the actual distributable.

Before release, test command/search, combined filters, clipboard text, favorites across reload, offline startup/cache, and refresh after deployment. Load Chat 2 before and after Chatpendium and reload both; menu entries must appear once. Resize the window at the intended UI scale and confirm clean unload. After publication, install the packaged build from the feed with the development copy disabled.
