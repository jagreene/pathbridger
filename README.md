# Pathbridger

A dependency-free Firefox extension prototype for Paizo play-by-post, with Pathbuilder 2e JSON import.

## Try it

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Choose **Load Temporary Add-on**, then select `extension/manifest.json`.
3. Click the Pathbridger toolbar button to open character settings.
4. In Pathbuilder Web, use **Export → Export JSON**. Import the JSON file or paste its contents into settings.
5. Review and correct actions, bonuses, traits, and damage; save the character.
6. Open a Paizo post editor and click **Enable Pathbridger** above the text box.
7. Type `/` followed by part of an action name. Choose with arrows and complete with Tab or Enter. Escape dismisses.

Temporary Firefox add-ons are removed when Firefox restarts. This is a development build, not a signed distribution.

## Current behavior

- Highlights recognized Paizo bracket tags in an overlay on the original textarea. The original field remains the form's submitted input.
- Pairs square brackets and adds closing tags when you finish an opening tag with `]`.
- Completes explicitly configured attacks with Paizo dice markup, optional damage, and standard, agile, or custom MAP.
- Each message is one turn. MAP is derived from completed attack rolls before the cursor, so deleting or inserting earlier attacks updates subsequent completions. Existing dice formulas are not rewritten. Configured action labels and explicit manual labels (Strike, Attack, Trip, Grapple, Shove, Disarm, Reposition, Escape, Spell attack) count. Prose mentions, damage, and quoted rolls do not. `mapIncreases: 0` marks a non-attack check; positive integers specify how many attacks a configured action contributes. This does not implement special multi-roll action resolution.
- Stores one active character locally. Saving settings refreshes existing enhanced editors.
- Preserves Paizo's normal submission process. Never submits posts itself.

The importer accepts a `build` object or a top-level character object with `name` and `weapons`. It uses explicit numeric `attack` values, optional `traits`, and explicit `damage` strings. Exports may omit traits or damage; review is required. It does not infer feat effects, spell scaling, striking runes, conditional modifiers, or special action sequences. Additional actions can be entered in settings. The weapon export format is covered by a synthetic regression fixture. Hatchet traits have a small built-in fallback; other missing weapon traits require review. Damage can be assembled from die, striking tier, and damageBonus. Exported Empowerment becomes a separate conditional completion; it is never silently added to the base strike.

## Planned Pathbuilder Web integration

The intended everyday workflow is automatic refresh after character changes, rather than repeated JSON exports.

1. Inspect a real export and Pathbuilder Web's actual save/load behavior to establish a reliable adapter and stable character identity.
2. Investigate a companion content script on Pathbuilder Web that obtains an explicit character snapshot when the user saves or switches characters. Prefer a supported API or export interface; any page-specific adapter needs version checks and a visible stale-data indicator.
3. Keep snapshots per character and bind each Paizo campaign/editor to the right character. Display the source and last refreshed time. Handle edited local action overrides separately from upstream updates.
4. Investigate Drive access only after confirming how Pathbuilder stores its files and what access is available. Do not assume another app's private Drive storage is accessible or that exported JSON is a writable backup format.
5. Consumables require a verified inventory model and confirmed successful-post detection. Use a pending transaction keyed to the post, handle retries without double consumption, detect concurrent sheet changes, and offer recovery. A form submit event alone is not proof of a successful post.

No Pathbuilder tab integration, Drive sync, or inventory mutation is implemented in this prototype.

## Validation

Run `node --test tests/core.test.cjs` for MAP, import validation, and escaping checks. JavaScript syntax is checked with `node --check`.

Still needs live Firefox QA with a real Paizo post editor and your character export: wrapping and scrolling, Paizo toolbar insertion, autocomplete focus, normal post preview/submission, and keyboard undo behavior. Programmatic completions use `setRangeText`; native undo behavior is not guaranteed. Highlighting can be switched off without removing the other controls.

## References

- Pathbuilder Web export menu: https://www.pathbuilder2e.com/app.html?v=57e
- MAP rules: https://2e.aonprd.com/Rules.aspx?ID=2289
- Firefox content scripts: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts
- Extension storage: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage

## Private data

Keep real character exports and personal notes in `private/` (ignored by Git). Tests use invented data only. Browser character storage is separate from this repository. Do not add actual character exports to `fixtures/`.
