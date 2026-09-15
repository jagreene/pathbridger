const $ = id => document.getElementById(id);
async function load() {
  const {character} = await browser.storage.local.get('character');
  $('name').value = character?.name || '';
  $('actions').value = JSON.stringify(character?.actions || [{name:'Example strike — replace me',attack:0,agile:false,damage:'',map:null}], null, 2);
}
load().catch(e => $('status').textContent = e.message);
$('file').addEventListener('change', async () => {
  try { const file = $('file').files[0]; if (file) { if(file.size > 5000000) throw Error('Please use an export smaller than 5 MB.'); $('source').value = await file.text(); } }
  catch(e) { $('status').textContent = e.message; }
});
$('import').onclick = () => {
  try { const c = Pathbridger.normalize(JSON.parse($('source').value)); $('name').value = c.name; $('actions').value = JSON.stringify(c.actions, null, 2); $('warnings').textContent = c.warnings.join('\n'); $('status').textContent = 'Imported for review. Save when ready.'; }
  catch(e) { $('status').textContent = e.message; }
};
$('save').onclick = async () => {
  try { const actions = Pathbridger.validateActions(JSON.parse($('actions').value)); const name = $('name').value.trim(); if(!name) throw Error('Enter a character name.'); await browser.storage.local.set({character:{name,actions}}); $('status').textContent = 'Saved. Open Paizo editors will update automatically.'; }
  catch(e) { $('status').textContent = e.message; }
};
$('clear').onclick = async () => { await browser.storage.local.remove('character'); await load(); $('status').textContent = 'Saved character cleared.'; };
