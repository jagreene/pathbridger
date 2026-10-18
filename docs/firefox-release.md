# Firefox signing and permanent installation

Standard Firefox requires a Mozilla signature for permanent extension installs.
Use **unlisted / On your own** distribution to obtain a signed file for yourself
and your group. This does not publish a searchable Firefox Add-ons listing.

## Current repair submission

Version **0.2.6** was submitted October 18, 2026 at 1:39 PM Pacific, with zero
errors and two existing warnings. Status: **Approved; installed and enabled in Zen**
on October 18. Release/reviewer
notes are saved. [Version 6592832](https://addons.mozilla.org/en-US/developers/addon/8e08b49848124031a99c/versions/6592832), file **5136960**.
Do not resubmit. The user approved signing and installing over the existing Zen
copy. The signed replacement was installed without uninstalling. Nixoret and its
buff controls remain available in the live Paizo editor; no character or draft
values were changed. Short idle profiling found no sustained high CPU or memory
growth. The completed signing/install follow-up is paused.

Signed XPI: `artifacts/firefox/pathbridger-0.2.6-firefox-signed.xpi`.
SHA-256: `fb276143c5cce163aaeffa38ad8ced71602b892b6440d49c92aa5b9f2ccf2ea0`.
Verified version 0.2.6, existing ID `pathbridger@local.invalid`, Mozilla signature
files, byte-identical code/assets, and semantically identical manifest to the
tested build. Add-ons Manager confirmed version 0.2.6 and the enabled toggle.

Unsigned ZIP: `artifacts/firefox/pathbridger-0.2.6-firefox-unsigned.zip`.
SHA-256: `58a13d29ec86090c69ac93ac8594d08e837df2eaaacba9327fcbfa9a70c60f07`.

## Previous JSON-import repair

Version **0.2.5** was submitted for unlisted desktop Firefox signing on
**October 16, 2026 (Pacific time)**. Mozilla accepted it with zero errors and
two existing warnings. Status: **Approved**, confirmed October 16, 2026 (Pacific time).
Release and reviewer notes were saved. Do not resubmit this version.

- [Version details and signed download when ready](https://addons.mozilla.org/en-US/developers/addon/8e08b49848124031a99c/versions/6586861)
- Mozilla file ID: `5130991`.
- Unsigned archive SHA-256: `ede8f7bf6cbc481d73ec626e5e6054a5e9fddffe04b20c7ed058db028a4386bc`.

The signed file is saved as `artifacts/firefox/pathbridger-0.2.5-firefox-signed.xpi`.
Its version and existing add-on ID are verified; all code/assets match the tested
build, and the manifest is semantically identical (Mozilla reformatted it).
Signed SHA-256: `28eafd485c6572f01d825ad3392c0cae0b23a21f4ff1d098410985b31eec8769`.

Installation verified in Zen on October 16, 2026 (Pacific time): the existing
`pathbridger@local.invalid` add-on is enabled at **0.2.5**. It was already updated
when native UI access recovered; no reinstall or uninstall was needed.
Live pasted-JSON and file-import checks both passed using unsaved synthetic
characters. Inputs survived background library changes. Reload discarded the
test edits and restored Nixoret's original actions; saved buffs were retained.
The workshop reports a completed 6:58:47 PM Pathbuilder sync with calculated
rolls available. Electric Arc remains flagged for optional Nethys resolution;
custom overrides were kept. No new live save was forced and no Paizo draft was
touched. The installation follow-up is complete.


## Previous submission

Version **0.2.4** (forum notification badges and desktop alerts) was submitted
for unlisted, desktop-only signing on **October 1, 2026 (Pacific time)**.
Mozilla accepted the upload with zero errors and two documented warnings; its
status at submission was **Awaiting Review / Version Signature Pending**.
Its status was confirmed **Approved** in the dashboard on October 14, 2026.

- [Version details and eventual signed download](https://addons.mozilla.org/en-US/developers/addon/8e08b49848124031a99c/versions/6533425)
- [All versions and signing status](https://addons.mozilla.org/en-US/developers/addon/8e08b49848124031a99c/versions)
- Mozilla file ID: `5077568`.
- Unsigned archive SHA-256: `99ae053bf97d5f993070b6964fc166412fe2c4c9d1d443d9837b876c5f796984`.

Do not resubmit 0.2.4 or create another add-on. Future
releases belong to this same add-on and require a higher manifest version.
Version 0.2.3 was confirmed **Approved** on October 1, 2026.

## Prepare the upload

With Node.js 22 or newer, run from the repository root:

```sh
npm ci
npm test
npm run package:firefox
```

The package command rebuilds `dist/`, validates `dist/firefox` with Mozilla's
`web-ext lint`, and creates
`artifacts/firefox/pathbridger-0.2.5-firefox-unsigned.zip`. It packages only the
Firefox extension folder, with `manifest.json` at the archive root. Tooling,
repository history, tests, recordings, and private character exports are excluded.
Fix validation errors before submitting; review any warnings.

The current validator reports `UNSAFE_VAR_ASSIGNMENT` for the existing
highlight overlay in `content.js`. `Pathbridger.highlight()` escapes every piece
of input before adding fixed `<span>` markup; the core escaping regression test
covers this path. Include this explanation if Mozilla asks about the warning.
The validator also checks Android's older data-consent support even when Android
is not selected for distribution. This release targets desktop Firefox only;
leave Android unchecked on the upload form.

This ZIP is an **unsigned upload**, not an installable release. Do not rename it
to `.xpi` and distribute it as signed. Generated archives are ignored by Git.

## Sign using the Mozilla website

1. Sign in to the [Mozilla Add-ons Developer Hub](https://addons.mozilla.org/developers/).
   A Mozilla account and acceptance of Mozilla's developer agreement are required.
2. Open the [existing add-on's versions](https://addons.mozilla.org/en-US/developers/addon/8e08b49848124031a99c/versions)
   and choose **Upload a New Version**. Keep unlisted / **On your own**
   distribution. Version 0.2.4 has already been submitted; increase the manifest
   version and rebuild for an update instead of creating another add-on.
3. Upload `artifacts/firefox/pathbridger-<version>-firefox-unsigned.zip` and select
   Firefox desktop. The supported minimum is Firefox 140.
   Leave Firefox for Android unchecked: this release is for desktop only.
4. Complete validation and the submission. The package contains readable source
   with no bundling, minification, dependencies, or generated executable code.
   Use the review notes below if requested, and [Privacy](privacy.md) for the
   data-use explanation.
5. Wait for Mozilla approval/signing, then download the **signed `.xpi`** from the
   version's developer page. Manual review can delay signing.

## Sign using the command line

Get a JWT issuer and JWT secret from
[Mozilla's API credentials page](https://addons.mozilla.org/developers/addon/api/key/).
Provide them locally as `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` environment
variables using your shell or secret manager, then run:

```sh
npm run sign:firefox
```

Never commit credentials or paste them into chat. The command reads them from the
environment; it does not load `.env` files. It rebuilds and validates before
submitting to Mozilla with `--channel unlisted`, then downloads the signed file
into `artifacts/firefox/` after approval. Keep that `.xpi` unchanged.

If signing times out, check the existing submission in the Developer Hub before
retrying. A timeout can leave a valid pending submission; download its signed XPI
when ready rather than attempting to submit the same version again.

## Install, share, and update

In Firefox, open `about:addons`, choose the gear menu → **Install Add-on From
File…**, select the signed `.xpi`, and accept the installation prompt. It stays
installed after restarting Firefox. Share that same signed file with other users.

Keep original character exports and record manual settings before replacing a
temporary install. Firefox may remove temporary-extension data. For subsequent
signed updates, install over the existing extension so its local data is retained.

Every release needs a new version in `extension/manifest.json` and a new Mozilla
signature. Keep `browser_specific_settings.gecko.id` as
`pathbridger@local.invalid`: it is the extension's stable identity, not a network
address. Changing it would create a separate extension with separate storage.
Rebuild, sign, and share the new `.xpi`. This workflow does not configure an update
server, so users install updates from file; signing alone does not deliver updates.

## Reviewer notes

- Version 0.2.4 monitors matching RSS/Atom feeds in open Paizo thread and campaign
  tabs, using same-origin requests with the existing Paizo session. The first
  fetch establishes a quiet baseline; subsequent new entries produce tab badges
  and optional desktop notifications. Forum indexes report new threads only.
  Monitoring and desktop alerts can be disabled separately in settings.
- `notifications` displays forum activity. Session storage retains bounded post
  identifiers and destinations to suppress duplicate alerts. Notification links
  open in a new tab to preserve drafts. No new external service is contacted.

- Pathbridger enhances Paizo post textareas and imports/synchronizes Pathfinder
  characters from Pathbuilder Web. Open its toolbar settings to import JSON or
  save a character on Pathbuilder, then use `[dice=` in a Paizo editor.
- `storage` holds settings, characters, saved buffs, and a seven-day rules cache
  locally in the browser profile. The extension does not submit Paizo posts.
- `https://elasticsearch.aonprd.com/*` provides user-requested rules searches.
  Requests contain ability/item names or a rule ID, with credentials omitted.
  Search terms are declared in `gecko.data_collection_permissions.required` and
  disclosed during installation. Disabling Nethys on manual import avoids those
  lookups; automatic save refresh only reuses cached rules. Reading a buff from a
  link is a separate user-triggered lookup.
- Pathbuilder host access and packaged MAIN-world scripts observe successful
  saves and run the site's existing exporters locally. Automatic export uploads
  are intercepted. No remote scripts are downloaded or evaluated, and the
  extension does not independently authenticate to Google Drive.
- All executable code is readable in the submitted archive. `scripts/build.cjs`
  copies source and adjusts browser manifests; `web-ext` only validates, packages,
  and submits the Firefox folder. There is no separate compiled source bundle.

Mozilla references: [signing and distribution](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/),
[web-ext commands](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/),
and [built-in data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).
