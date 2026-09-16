const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {build} = require('../scripts/build.cjs');
const source = path.join(__dirname, '..', 'extension');
const read = name => fs.readFileSync(path.join(source, name), 'utf8');

for (const browser of ['chrome', 'firefox']) {
  test(`${browser}: background loads adapter and opens options on click`, async () => {
    let onClick;
    let opened = 0;
    const api = {
      action: {onClicked: {addListener: fn => {onClick = fn;}}},
      runtime: {openOptionsPage: async () => {opened++;}, onMessage: {addListener: () => {}}},
      storage: {local: {get: async () => ({character: {name: 'Test'}})}}
    };
    const context = vm.createContext({[browser === 'firefox' ? 'browser' : 'chrome']: api});
    if (browser === 'chrome') context.importScripts = (...names) => names.forEach(name => vm.runInContext(read(name), context));
    else vm.runInContext(read('api.js'), context);
    vm.runInContext(read('background.js'), context);
    assert.equal(opened, 0);
    await onClick();
    assert.equal(opened, 1);
    assert.equal(await vm.runInContext("PathbridgerAPI.storage.local.get('character').then(x => x.character.name)", context), 'Test');
  });
}

test('both packages have complete assets, correct manifests and adapter load order', t => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'pathbridger-build-'));
  t.after(() => fs.rmSync(output, {recursive: true, force: true}));
  build(output);
  for (const browser of ['chrome', 'firefox']) {
    const root = path.join(output, browser);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
    assert.equal(manifest.manifest_version, 3);
    assert.deepEqual(manifest.permissions, ['storage']);
    assert.deepEqual(manifest.host_permissions, ['https://elasticsearch.aonprd.com/*', 'https://pathbuilder2e.com/*']);
    assert.ok(manifest.action);
    assert.equal(manifest.browser_action, undefined);
    if (browser === 'chrome') {
      assert.deepEqual(manifest.background, {service_worker: 'background.js'});
      assert.equal(manifest.browser_specific_settings, undefined);
    } else {
      assert.deepEqual(manifest.background.scripts, ['api.js', 'core.js', 'rules.js', 'export-data.js', 'characters.js', 'background.js']);
      assert.equal(manifest.browser_specific_settings.gecko.id, 'pathbridger@local.invalid');
    }
    for (const entry of manifest.content_scripts) {
      if (entry.world === 'MAIN') assert.deepEqual(entry.js, ['export-data.js', 'pathbuilder-export.js', 'pathbuilder-observer.js']);
      else assert.equal(entry.js[0], 'api.js');
      for (const file of [...entry.js, ...entry.css]) assert.ok(fs.existsSync(path.join(root, file)), file);
    }
    const html = fs.readFileSync(path.join(root, manifest.options_ui.page), 'utf8');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);
    assert.equal(scripts[0], 'api.js');
    for (const file of scripts) assert.ok(fs.existsSync(path.join(root, file)), file);
    assert.equal(fs.existsSync(path.join(root, 'tests')), false);
    assert.equal(fs.existsSync(path.join(root, 'private')), false);
  }
  fs.writeFileSync(path.join(output, 'chrome', 'stale.js'), 'stale');
  build(output);
  assert.equal(fs.existsSync(path.join(output, 'chrome', 'stale.js')), false);
});
