const fs = require('node:fs');
const path = require('node:path');

function build(outputRoot = path.join(__dirname, '..', 'dist')) {
  const source = path.join(__dirname, '..', 'extension');
  const base = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
  for (const browser of ['chrome', 'firefox']) {
    const manifest = structuredClone(base);
    if (browser === 'chrome') {
      delete manifest.browser_specific_settings;
      manifest.minimum_chrome_version = '111';
      manifest.background = {service_worker: 'background.js'};
    }
    const destination = path.join(outputRoot, browser);
    fs.rmSync(destination, {recursive: true, force: true});
    fs.mkdirSync(destination, {recursive: true});
    fs.cpSync(source, destination, {recursive: true});
    fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  }
}

if (require.main === module) {
  build();
  console.log('Built dist/chrome and dist/firefox');
}
module.exports = {build};
