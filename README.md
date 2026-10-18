# Pathbridger

A dependency-free Chrome and Firefox extension for Paizo play-by-post, with
Pathbuilder 2e import and browser-side save sync.

## Current state

Pathbridger includes a Firefox packaging and unlisted signing workflow. A
Mozilla-signed `.xpi` is required for permanent installation in standard Firefox;
the unpacked folders and unsigned ZIP are development/signing inputs. Version
0.2.6 is available as ready-to-load, unpacked extension folders in `dist/`:

- `dist/chrome` for Chrome 111 and newer.
- `dist/firefox` for Firefox 140 and newer.

The committed `dist` folders are included for easy sharing and installation; no
Node.js build step is needed to use them. They are a snapshot of the source at
the commit that contains them. Rebuild after changing `extension/` so the
packages include those changes.

## October 18 idle-hang repair (0.2.6)

Fixes a character-list refresh loop that repeatedly wrote unchanged library
data to storage and could keep idle Paizo tabs and Firefox/Zen busy. Character
list reads now write only for initial migration. Regression tests cover multiple
idle tabs, Firefox storage events for unchanged data, and real edit refreshes.
All 82 tests pass. The signed 0.2.5 release should remain disabled until updated.

0.2.6 was approved and installed over the existing Zen extension on October 18,
2026 (Pacific time), and is enabled:
[Mozilla version page](https://addons.mozilla.org/en-US/developers/addon/8e08b49848124031a99c/versions/6592832).
The unsigned archive in `artifacts/firefox/` is a signing input, not a permanent
Firefox installation package. Existing character data is retained on update.
The signed XPI is `artifacts/firefox/pathbridger-0.2.6-firefox-signed.xpi`.
A one-minute check with Pathbridger active in the Paizo editor averaged 1.0%
main-process CPU, with a stable 352–353 MB footprint. See the QA notes for the
disabled baseline and measurement limits.

## October 14 repair (0.2.5)

- Supports Pathbuilder v111k and its new `pathbuilder-backend.com` export
  endpoints while retaining local interception and support for v109g.
- Prevents pending settings refreshes from clearing pasted JSON or selected files.
- Shows import errors/progress beside the JSON input. Optional Nethys lookups can
  be skipped, stop on network failure, and have a 20-second overall budget.
  Rules-cache failures preserve imported rolls for review and saving.

Both unpacked builds have been refreshed. The unsigned Firefox package is prepared
in `artifacts/firefox/`. **0.2.5 was submitted on October 16, 2026 (Pacific time)
and was approved the same day.** Its [version page](https://addons.mozilla.org/en-US/developers/addon/8e08b49848124031a99c/versions/6586861)
provides the signed download, also saved locally as
`artifacts/firefox/pathbridger-0.2.5-firefox-signed.xpi`. Updating source files does not update an
already installed signed add-on. See
[repair QA](docs/qa-2026-10-14.md) for checks and installation limits.

## Installation

Firefox users install a Mozilla-signed `.xpi`; cloning or building this repository
is not needed. Chrome and temporary Firefox development installs use the
committed `dist` folders.

### Chrome

Download or clone this repository and keep the entire `dist/chrome` folder together.

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select the `dist/chrome` directory.
4. Click the Pathbridger toolbar button to open character settings.

### Firefox — permanent installation

1. Obtain the **Mozilla-signed `.xpi`** from the maintainer. Maintainers download
   signed files from the [Mozilla version dashboard](https://addons.mozilla.org/en-US/developers/addon/8e08b49848124031a99c/versions).
   This is an unlisted extension, so there is no public Firefox Add-ons listing.
2. Open `about:addons` in Firefox 140 or newer.
3. Open the gear menu and choose **Install Add-on From File…**.
4. Select the signed `.xpi`, review the permissions, and click **Add**.
5. Click the Pathbridger toolbar button to open character settings. The extension
   now stays installed when Firefox restarts.

The signed file can be shared directly without a public Firefox Add-ons listing.
Version **0.2.4** was submitted on October 1, 2026 (Pacific time) and was
confirmed approved during the October 14 repair. Check its [version page](https://addons.mozilla.org/en-US/developers/addon/8e08b49848124031a99c/versions/6533425)
for its signed download.
Version 0.2.3 was confirmed approved on October 1, 2026.
An unsigned ZIP or a pending submission cannot be permanently installed.

**Updating:** obtain the newer signed `.xpi` and repeat the same install steps
over the existing extension; do not uninstall first. Updates are currently
manual, and signing a new version does not automatically update installed copies.
Before switching from a
temporary installation, keep your original character exports and record manual
settings; temporary-extension data may be removed by Firefox.

### Firefox — temporary development installation

Download or clone the repository and keep the entire `dist/firefox` folder together.

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on**.
3. Select `dist/firefox/manifest.json`.
4. Click the Pathbridger toolbar button to open character settings.

Firefox temporary add-ons are removed when Firefox restarts. Packaging a ZIP or
renaming it to `.xpi` does not sign it or make it permanently installable.

## First use

1. In Pathbuilder Web, use **Export → Export JSON**. Import the JSON file or paste its contents into settings.
2. Review and correct actions, bonuses, traits, and damage; save the character.
3. Open a Paizo post editor; Pathbridger activates automatically.
4. Start `[dice=` (any capitalization) and type part of an action name, such as `[dice=exploit`. The `/action` shortcut also works. Choose with arrows and complete with Tab or Enter. Escape dismisses.

Allow access to Paizo for editor features and to `elasticsearch.aonprd.com` for
Nethys lookups; denied or revoked permissions can prevent these features from
running. Character settings and buffs stay separate in each browser profile.

## New forum activity

Open Paizo threads and campaign gameplay/discussion/recruitment tabs are checked
using their advertised RSS/Atom feed about once a minute. The first successful
check establishes a baseline without alerting for existing posts. New entries add
a red count badge to the website favicon, a count to the tab title, and an
**Open latest** link on the page. Reloading clears that tab's count. Desktop
notifications are enabled by default; duplicate desktop alerts from multiple
tabs of the same feed are suppressed for the browser session. Alert links open
the post in a new tab so an unfinished draft is preserved.

The **Forum notifications** section in extension settings can disable monitoring
or just desktop notifications. The extension needs the browser's Notifications
permission; browser/OS notification settings can still silence desktop alerts.
Polling uses the signed-in Paizo session, stops when the tab closes, and backs off
when feeds fail. Hidden or suspended tabs and Paizo's feed caching can delay
alerts. Forum index feeds report new threads, not every reply; keep the individual
thread or campaign tab open to watch replies. Pages without a matching advertised
feed are not monitored. No posts are automatically loaded or submitted.

## Build from source

For development, use Node.js 18 or newer and run `node scripts/build.cjs`. This
recreates both `dist/chrome` and `dist/firefox` from `extension/`. Reload the
extension from its browser extension page and refresh open Paizo and Pathbuilder
tabs after rebuilding.

Both builds use Manifest V3 and shared source files. Firefox uses background scripts; Chrome uses a service worker. `api.js` selects the native browser API namespace. The build only copies `extension/`, keeping tests and private exports out of the packages.

To prepare a Firefox release, use Node.js 22 or newer:

```sh
npm ci
npm run package:firefox
```

This rebuilds the folders, runs Mozilla's validator, and creates
`artifacts/firefox/pathbridger-<version>-firefox-unsigned.zip` for signing.
The installed extension has no npm dependencies.

### Releasing a Firefox update

1. Increase `version` in `extension/manifest.json`. Keep the existing add-on ID;
   do not resubmit version 0.2.4 or create a second Mozilla add-on.
2. Run `npm test` and `npm run package:firefox`. Commit the source and refreshed
   `dist` folders together.
3. Upload the unsigned ZIP as a **new version** of the
   [existing unlisted add-on](https://addons.mozilla.org/en-US/developers/addon/8e08b49848124031a99c/versions).
   Select Firefox desktop only and include version/reviewer notes. Alternatively,
   configure `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` locally, then run
   `npm run sign:firefox` to submit through Mozilla's API.
4. Wait for approval/signing. The command downloads the signed `.xpi` into
   `artifacts/firefox/` when approved within its wait period. If it times out,
   check the existing submission and download from the dashboard when ready;
   do not blindly resubmit the same version.
5. Share the signed `.xpi` unchanged. Users install it over their existing copy
   using the Firefox instructions above.

See [Firefox signing](docs/firefox-release.md) for credentials, reviewer notes,
and recovery from delayed signing.

### Recommended automation

The npm build/package/sign commands above are available now. Git hooks and
GitHub Actions workflows are **not configured yet**. The recommended setup is:

- **Every push and pull request:** install locked dependencies with `npm ci`,
  run `npm test`, build and validate with `npm run package:firefox`, and check that
  rebuilding leaves committed `dist` files unchanged. Retain the unsigned ZIP as
  a CI artifact for development and manual submissions.
- **A release tag such as `v0.2.4`:** verify the tag matches the manifest version,
  run the same checks, and submit for unlisted signing. Keep the Mozilla API
  credentials in GitHub Actions secrets, available only to the release job.
  Retain the signed `.xpi` when Mozilla returns it. Delayed approvals need a
  download/recovery step, not another submission.
- **Distribution:** attach the signed file to a GitHub release if desired.
  Automatic updates inside Firefox would additionally require an update manifest
  and hosting, or migration to a public Mozilla listing.

A local pre-commit hook can optionally rebuild and check `dist`, but should not
contact Mozilla. Versioned release tags make signing deliberate and avoid
submitting every work-in-progress commit.

Firefox's installation disclosure includes search terms because user-triggered
Nethys lookups send rule names or rule IDs to its search service. Firefox 140+
provides the built-in disclosure. See [Privacy](docs/privacy.md).

## Current behavior

- Highlights recognized Paizo bracket tags in an overlay on the original textarea. The original field remains the form's submitted input.
- Pairs square brackets and adds closing tags when you finish an opening tag with `]`.
- Completes empty dice blocks without duplicating paired brackets or closing tags. Filled dice blocks are left alone.
- Imports Esoteric Lore and Exploit Vulnerability checks when the export supplies those abilities, level, Charisma score, and Esoteric Lore proficiency. These checks neither take nor increase MAP. Re-import and save older characters to get the new actions. Other class abilities still need manual configuration.
- Completes explicitly configured attacks with Paizo dice markup, optional damage, and standard, agile, or custom MAP.
- Each message is one turn. MAP is derived from completed attack rolls before the cursor, so deleting or inserting earlier attacks updates subsequent completions. Existing dice formulas retain their MAP when the draft is edited. Configured action labels and explicit manual labels (Strike, Attack, Trip, Grapple, Shove, Disarm, Reposition, Escape, Spell attack) count. Prose mentions, damage, and quoted rolls do not. `mapIncreases: 0` marks a non-attack check; positive integers specify how many attacks a configured action contributes. This does not implement special multi-roll action resolution.
- Toggling buffs updates matching attack, check, and damage rolls already in the draft. Bonuses appear separately (for example, `1d20+9 + 1`); disabling a buff removes its bonus. Quoted rolls and formulas that differ from configured actions are left alone.
- Stores a local character library and uses one selected character for Paizo
  completions. Saving settings refreshes existing enhanced editors.
- Preserves Paizo's normal submission process. Never submits posts itself.

The importer accepts a `build` object or a top-level character object with `name` and `weapons`. It uses explicit numeric `attack` values, optional `traits`, and explicit `damage` strings. Exports may omit traits or damage; review is required. It does not infer feat effects, spell scaling, striking runes, conditional modifiers, or special action sequences. Additional actions can be entered in settings. The weapon export format is covered by a synthetic regression fixture. Hatchet traits have a small built-in fallback; other missing weapon traits require review. Damage can be assembled from die, striking tier, and damageBonus. Exported Empowerment becomes a separate conditional completion; it is never silently added to the base strike.

## Pathbuilder integration limits

Pathbuilder save observation and calculated-roll refresh are implemented for
local and Google Drive saves made in the browser. The adapter is deliberately
version-gated, maintains a separate record for each persistent save ID, and
preserves manual action overrides where it can. JSON import remains available as
a fallback.

Inventory mutation, post-success detection, consumable tracking, and independent
Google Drive access are not implemented. This extension does not treat a form
submit event as proof that a Paizo post succeeded. See **Pathbuilder save sync**
below for version-specific behavior and recovery limits.

## Validation

Run `node --test tests/core.test.cjs` for MAP, import validation, and escaping checks. JavaScript syntax is checked with `node --check`.

Still needs live Chrome and Firefox QA with a real Paizo post editor and your character export: wrapping and scrolling, Paizo toolbar insertion, autocomplete focus, normal post preview/submission, and keyboard undo behavior. Programmatic completions use `setRangeText`; native undo behavior is not guaranteed. Highlighting can be switched off without removing the other controls.

## References

- Pathbuilder Web export menu: https://www.pathbuilder2e.com/app.html?v=57e
- MAP rules: https://2e.aonprd.com/Rules.aspx?ID=2289
- Firefox content scripts: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts
- Extension storage: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage

## Private data

Keep real character exports and personal notes in `private/` (ignored by Git). Tests use invented data only. Browser character storage is separate from this repository. Do not add actual character exports to `fixtures/`.

Esoteric Lore and Exploit Vulnerability rules: https://2e.aonprd.com/Classes.aspx?ID=69 (the importer uses exported ability scores and proficiency ranks).

## Nethys integration

On import, the enabled Nethys lookup queries exact names from weapons, specials,
feats, and spellcaster spell/prepared lists. Only rule names go to
`https://elasticsearch.aonprd.com`; neither the character name nor sheet is sent.
Choose Remaster or Legacy explicitly. Results are cached locally for seven days.
This is the search service used by Nethys, not a guaranteed stable public API.

Matched weapon traits update Agile. Existing supported checks gain source links.
Recognizable spell attacks get a base casting modifier. Electric Arc supports
legacy/remaster damage and automatic cantrip heightening. Other matched abilities
and spells appear as linked references marked for manual resolution. Such entries
insert OOC text, not a fabricated die roll. Ambiguous/missing records are reported.
Generic prose is not a complete rules engine: multi-attack abilities, arbitrary
heightening, conditional bonuses, focus-export variants, and nested granted
abilities still need adapters. Save after reviewing the import results.

Run `node --test tests/*.test.cjs`. Tests use synthetic characters and mocked
network responses. The integration was also checked against live-fetched Electric Arc
records, but has not been tested inside Firefox. Reload the extension and the
Paizo page, then re-import your character with Nethys lookup enabled and save.


## Pathbuilder save sync

1. Rebuild with `node scripts/build.cjs`, reload the extension, and reload any open
   Pathbuilder and Paizo tabs. Chrome 111+ or Firefox 140+ is required.
2. Save once in Pathbuilder. Pathbridger automatically creates a character linked
   by its persistent save ID and refreshes supported calculated rolls immediately.
3. Settings update automatically when there are no unsaved edits. The most
   recently saved Pathbuilder character is selected automatically on Paizo;
   choose another character in the **Use on Paizo** dropdown to switch
   immediately.
4. JSON import is a collapsed fallback for unavailable sync. Existing manual
   characters are preserved; names alone never cause an automatic merge.

The observer watches successful local IndexedDB commits and successful Drive
character uploads. It does not request Drive credentials, read authorization
headers, publish JSON exports, or alter Pathbuilder saves. Synced
records retain the latest complete internal save (up to 1.5 MB per save), available
with **Download synced data**. Storage quota failures are reported on the page and
leave the last good extension record intact.

**Automatic calculated rolls:** for Pathbuilder web v109g and v111k, linked saves now
trigger its existing raw and JSON exporters locally. The generated requests are
intercepted before upload: no export ID is published and no success dialog opens.
Raw exports on either side of the calculated JSON verify the persistent save ID
and unchanged character choices. Keep the character open until syncing finishes.

Supported weapon/check bonuses and damage refresh through the existing importer;
spell adapters reuse rules already cached by a prior Nethys import. Automatic
refresh does not add external rules queries. Manual field overrides, custom
actions, and deleted generated actions survive the merge. Newly unsupported
spells and conflicting older actions are flagged for review. Characters imported
before generated baselines were recorded may need a one-time **Use calculated
rolls**, review, and save; this explicitly replaces matching manual overrides.

The adapter is version-gated to the inspected v109g and v111k bundles. Unsupported versions,
character switches/edits during export, timeouts, and missing data retain the last
good action list and show a review/error message. A timeout requires reloading
Pathbuilder; a late automatic request is still blocked from uploading. Ordinary
manual exports outside automatic capture keep their normal behavior. Native
Pathbuilder export limits still apply; this does not implement every game rule.

All character-library writes are serialized in the background. Settings reject
stale edits instead of overwriting a newer sync. Buffs are kept separately and are
unaffected. Save schemas are checked against Pathbuilder web v109g and v111k; future site changes
may need an updated observer/adapter.

Validation: `node --test tests/*.test.cjs`. Serve this directory locally and open
`tests/options.browser.html` for the synthetic settings workflow test (no real
character data). `tests/export.browser.html` exercises the complete save/export/refresh flow with
real IndexedDB and native XHR using a synthetic site fixture. The observer/storage tests cover failed and aborted saves,
request reuse, renames, duplicate names, inactive characters, migration,
concurrent writes, stale revisions, and sender validation.

Browser injection uses the manifest's MAIN world, supported in
[Firefox 128](https://blog.mozilla.org/addons/2024/07/10/manifest-v3-updates-landed-in-firefox-128/).

### If saves or imports do not appear

Reload the rebuilt extension (version 0.2.5), then close and reopen its settings.
Settings now report a missing background/library before starting ability lookups.
If **Enable Pathbuilder access** appears, click it and allow the requested site
access. Reload Pathbuilder in the same browser/profile as the extension, save
a character. It appears in settings automatically. The connection status reports
whether the save observer started; **Refresh characters** is also available under
advanced controls.
