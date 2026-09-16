# Pathbuilder save and calculated-action sync

Inspected public application bundle:
https://pathbuilder2e-data.b-cdn.net/Pathbuilder2eWebRemastered109g.js

## Persistence and identity

Local characters are serialized into `pathbuilder2e_db`, object store `saves`,
with an explicit UUID key. Only transaction completion counts as persistence.
Drive saves upload an internal `ExportBundle` with `characterData` via
`PATCH https://www.googleapis.com/upload/drive/v3/files/<fileId>?uploadType=media`.
Only HTTP 200 counts as success. Metadata writes and save-button clicks do not.

Each extension character has a UUID and an automatically linked source (mode,
scope, persistent save ID). Names and public JSON/share IDs are not identities.
Unknown save IDs create separate records and request calculation on that same save.
The first record becomes active; subsequent saves preserve the active selection.
Legacy manual records are never merged by name. Active Paizo character selection
is independent of which linked record is updated. Background writes are serialized;
older snapshots and export results superseded by saves/settings edits are rejected.

## Reusing the actual exporter without publication

No supported public export function was found on the page's global API. The
v109g UI exposes delegated menu targets `sidenav-share` and `sidenav-json`.

- Share produces a local JSON envelope whose `build` string contains an internal
  `characterData` object. It normally POSTs to `/app/post_emailed.php`.
- JSON export calculates public `{build, id}` JSON synchronously, then normally
  POSTs to `/app/post_json.php`.
- Automatic capture intercepts those specific POSTs at `XMLHttpRequest.send`
  without calling native send. The inspected completion handlers receive a local
  DONE/204 state: this clears their spinner without publishing an ID, changing
  export preferences, or opening an export-success dialog.
- Capture runs raw → calculated JSON → raw. Both raw exports must match the
  saved source (`webID` or `googleFileID`) and its serialized character choices.
  Only transport metadata temporarily removed/assigned by native saving/sharing
  is excluded from the fingerprint: folder/GM IDs and storage/share IDs.
- Before/after raw objects must also equal each other. Trusted edits interrupt
  capture. Manual export clicks are suppressed while capture is in progress to
  avoid consuming the wrong request. Outside capture, manual export is unchanged.
- The generated JSON must have matching name and level and a weapon array before
  it reaches the importer. Neither displayed name nor export ID is used alone.

The adapter checks for the exact inspected v109g script URL. Unknown versions
fail closed. If an asynchronous exporter times out, interception remains armed
for its late request so it cannot accidentally become a public upload; further
automatic capture requires a reload. No minified function hooks, credential reads,
remote-code evaluation, or additional Drive access are used.

## Actions and overrides

The existing normalizer converts public export values into actions. Cached Nethys
rules enrich supported spells/traits without making a new network request. A
stored generated baseline enables a three-way merge: unedited fields refresh,
manual changes and custom actions remain, and user deletions stay deleted.
Ambiguous duplicate names and unsupported data require review.

Older records without a baseline preserve overlapping actions until reviewed.
Settings provide **Use calculated rolls** to explicitly replace matching overrides
with the newest calculated values, retaining other custom actions. A stale settings
revision cannot overwrite an incoming save or completed calculation.

## Files and validation

- `pathbuilder-observer.js`: observes successful persistence and queues captures.
- `pathbuilder-export.js`: version-gated local-only native exporter flow.
- `export-data.js`: bounded JSON parsing, fingerprint and identity verification.
- `pathbuilder-content.js`: isolated bridge and user-visible status.
- `characters.js`, `background.js`: records, linking, generation/merge, serialized writes.
- `options.js`: import baselines, character selection, source linking, override review.

`node --test tests/*.test.cjs` covers identity, rename/copy cases, request failure,
transaction abort, overlapping saves, stale settings, late exports, custom fields,
generated deletion/addition, cached spells, and zero automatic uploads. Browser
fixtures exercise settings and the full local save/export/refresh flow with actual
IndexedDB transactions and native XMLHttpRequest objects.

The browser fixture is synthetic, not a test against the installed extension in a
logged-in Pathbuilder tab. Real user characters were not modified. Remaining limits
are the existing importer's coverage of game mechanics and the version-specific
export protocol; errors retain the last good rolls rather than guessing them.
