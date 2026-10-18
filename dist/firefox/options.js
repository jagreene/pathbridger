const $ = id => document.getElementById(id);
let library=null, currentId = null, currentRevision = 0, importedBuild = null, generatedActions = null, adoptCalculated = false, dirty = false;
let importing=false, importController=null;
let editVersion=0, loadVersion=0;
function markEdited() { dirty=true; editVersion++; }
function importStatus(text) { $('import-status').textContent=text; $('status').textContent=text; }
async function command(message) {
  const response = await PathbridgerAPI.runtime.sendMessage(message);
  if (!response || response.error) throw Error(response?.error || 'Extension background is unavailable. Reload the extension.');
  if(response.library?.version!==1 || !Array.isArray(response.library.records) || !Array.isArray(response.library.candidates))throw Error('Character library was not returned by the extension. Reload Pathbridger, then reopen its settings.');
  const wasReady=!!library;
  library = response.library;
  if(!wasReady)setReady(true);
  renderConnection(response.connection);
  await checkAccess();
  return response;
}
function setReady(ready) {
  for(const id of ['import','save','characters','clear','link-save','unlink-save','download-save','use-calculated'])$(id).disabled=!ready;
}
setReady(false);
function renderConnection(connection) {
  $('sync-connection').textContent=connection?.observerReady ? `Pathbuilder save detection started${connection.seenAt ? ' at '+new Date(connection.seenAt).toLocaleString() : ''}. Save in that browser to sync automatically.` : connection ? 'Pathbuilder is open, but save detection did not start. Reload the Pathbuilder tab after reloading the extension.' : 'No Pathbuilder connection yet. Open or reload Pathbuilder in the same browser as this extension.';
}
async function checkAccess() {
  if(!PathbridgerAPI.permissions?.contains)return;
  const allowed=await PathbridgerAPI.permissions.contains({origins:['https://pathbuilder2e.com/*']});
  $('enable-pathbuilder').hidden=allowed;
  if(!allowed)$('sync-connection').textContent='Pathbridger needs site access to detect Pathbuilder saves. Enable access, then reload your Pathbuilder tab.';
}
$('enable-pathbuilder').onclick=async()=>{
  try {
    const granted=await PathbridgerAPI.permissions.request({origins:['https://pathbuilder2e.com/*']});
    await checkAccess();
    $('status').textContent=granted?'Pathbuilder access enabled. Reload Pathbuilder, save a character, and it will appear here.':'Pathbuilder access was not enabled.';
  }catch(error){report(error);}
};
checkAccess().catch(()=>{});
function renderList() {
  $('characters').replaceChildren(new Option('New manual character', ''));
  for (const c of library.records) $('characters').add(new Option(c.name, c.id));
  $('characters').value = currentId || '';
  $('save-sources').replaceChildren(new Option('Choose a detected Pathbuilder save', ''));
  for (const [index,c] of library.candidates.entries()) $('save-sources').add(new Option(`${c.name} — ${c.source.mode} — ${c.source.saveId}`, String(index)));
}
function showCharacter(id) {
  editVersion++;
  currentId = id || null;
  const c = library.records.find(c => c.id === currentId);
  currentRevision = c?.revision || 0; importedBuild = null; generatedActions = null; adoptCalculated = false; dirty = false;
  $('name').value = c?.name || '';
  $('actions').value = JSON.stringify(c?.actions || [],null,2);
  $('source').value = ''; $('file').value = ''; $('warnings').textContent = ''; $('import-status').textContent='';
  $('sync-status').textContent = c?.source ? `Linked to ${c.source.mode} save ${c.source.saveId}. ${c.lastSave ? 'Last synced: '+new Date(c.lastSave.savedAt).toLocaleString()+'.' : 'Save again in Pathbuilder to sync its data.'} ${c.actionsNeedReview ? [c.syncError,...(c.syncWarnings||[]),'Actions need review; custom edits have been kept.'].filter(Boolean).join(' ') : ''}` : 'Manual character. Saving in Pathbuilder automatically adds a separate synced character; existing manual actions are kept.';
  $('use-calculated').disabled=!c?.lastSave || c.calculatedFor!==c.lastSave.startedAt || !c.generatedActions;
  $('clear').disabled = !c; $('link-save').disabled = !c; $('unlink-save').disabled = !c?.source; $('download-save').disabled = !c?.lastSave;
  renderList();
}
async function load(id, discard=false) {
  const edits=editVersion, request=++loadVersion;
  await command({type:'library'});
  // A storage refresh may have started before the user pasted JSON or chose a
  // file. Check again after the await; the event-time dirty check is not enough.
  if(request!==loadVersion || edits!==editVersion || (dirty&&!discard) || importing)return false;
  showCharacter(id === undefined ? library.activeId : id);
  return true;
}
const report = error => $('status').textContent = error.message;
load().catch(error=>{setReady(false);report(error);});
for (const id of ['name','actions','source']) {
  $(id).addEventListener('input',markEdited);
  $(id).addEventListener('paste',markEdited);
}
$('characters').onchange = async () => {
  if (dirty) { $('characters').value=currentId || ''; $('status').textContent='Save your edits or click Reload before switching characters.'; return; }
  try {
    const id=$('characters').value || null;
    await command({type:'select',id});
    showCharacter(id);
    $('status').textContent=id ? 'Active character updated in Paizo editors.' : 'No character is active on Paizo.';
  } catch(e) { report(e); }
};
$('refresh-library').onclick = async () => {
  try { await command({type:'library'}); await checkAccess(); renderList(); $('status').textContent='Detected saves refreshed. Your edits are unchanged.'; } catch(e) { report(e); }
};
$('reload-character').onclick = () => load(currentId,true).then(loaded=>{$('status').textContent=loaded?'Reloaded.':'New edits were preserved. Click Reload again to discard them.';}).catch(report);
$('link-save').onclick = async () => {
  try {
    if(dirty) throw Error('Save or reload your edits before linking.');
    const c=library.candidates[Number($('save-sources').value)];
    if($('save-sources').value === '' || !c) throw Error('Choose the matching detected save.');
    await command({type:'link',id:currentId,source:c.source});showCharacter(currentId);
    $('status').textContent='Linked. Save again in Pathbuilder to sync this character.';
  }catch(e){report(e);}
};
$('unlink-save').onclick = async () => {try {if(dirty) throw Error('Save or reload edits first.');await command({type:'unlink',id:currentId});showCharacter(currentId);}catch(e){report(e);}};
$('use-calculated').onclick = () => {
  const c=library.records.find(c=>c.id===currentId);if(!c?.generatedActions)return;
  const fresh=new Set(c.generatedActions.map(a=>a.name));
  try {
    const current=Pathbridger.validateActions(JSON.parse($('actions').value));
    $('actions').value=JSON.stringify([...c.generatedActions,...current.filter(a=>!fresh.has(a.name))],null,2);
    markEdited();adoptCalculated=true;
    $('status').textContent='Calculated actions loaded; matching custom overrides were replaced. Review and save. Other custom actions were kept.';
  }catch(e){report(e);}
};
$('download-save').onclick = () => {
  const c=library.records.find(c=>c.id===currentId); if(!c?.lastSave)return;
  const url=URL.createObjectURL(new Blob([c.lastSave.payload],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='pathbuilder-saved-data.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('file').addEventListener('change', async () => {
  const file = $('file').files[0]; if(!file)return;
  markEdited();
  $('source').value=''; $('source').disabled=true; $('import').disabled=true;
  try {
    if(file.size > 1500000) throw Error('Please use an export smaller than 1.5 MB.');
    $('source').value = await file.text();
    importStatus('File loaded. Click Read character to review its rolls.');
  } catch(e) { importStatus(e.message); }
  finally { $('source').disabled=false; $('import').disabled=!library; }
});
$('skip-lookups').onclick=()=>importController?.abort();
$('import').onclick = async () => {
  if(importing)return;
  const selectedId=currentId;
  if(!library){report(Error('Character library is unavailable. Click Reload before importing.'));return;}
  importing=true;markEdited();
  const locked=['import','save','clear','characters','reload-character','link-save','unlink-save','use-calculated','source','file','name','actions','edition','nethys'];
  const previousDisabled=new Map(locked.map(id=>[id,$(id).disabled]));
  for(const id of locked) $(id).disabled=true;
  $('manual-import').setAttribute('aria-busy','true');
  importStatus('Reading character…');
  let deadline;
  try {
    const text=$('source').value.trim().replace(/^\uFEFF/,'');
    if(!text)throw Error('Choose a Pathbuilder Export JSON file or paste its JSON contents first.');
    if(/^https?:\/\//i.test(text))throw Error('This is an export link. Open it, copy the JSON contents, and paste them here (or save the JSON as a file).');
    if(new TextEncoder().encode(text).length>1500000)throw Error('Please use an export smaller than 1.5 MB.');
    let data;
    try { data=JSON.parse(text); }catch(_){throw Error('Invalid JSON. Copy the complete contents from Pathbuilder’s Export JSON page, or choose its downloaded JSON file.');}
    if(data?.characterData || data?.characterName || typeof data?.build==='string')throw Error('This is internal save/share data. Use Pathbuilder’s Export → Export JSON for calculated rolls.');
    let c = Pathbridger.normalize(data);
    // Fail before costly lookups if initialization or background messaging failed.
    await command({type:'library'});
    if ($('nethys').checked) {
      importController=new AbortController();
      deadline=setTimeout(()=>importController?.abort(),20000);
      $('skip-lookups').hidden=false;
      try {
        const {rulesCache = {}} = await PathbridgerAPI.storage.local.get('rulesCache');
        c = await PathbridgerRules.enrich(data,c,$('edition').value,rulesCache,progress => importStatus(`JSON read. Looking up ${progress}. You can skip the remaining lookups.`),fetch,importController.signal);
        await PathbridgerAPI.storage.local.set({rulesCache});
      }catch(error){c.warnings.push(`Optional Nethys lookup/cache unavailable: ${error.message}. Exported rolls were kept.`);}
    }
    if(currentId!==selectedId) throw Error('Character changed during import. Try again.');
    generatedActions=structuredClone(c.actions);
    // Preserve custom and enriched actions that the basic importer did not create.
    const previous=library.records.find(c=>c.id===currentId);
    if(previous?.importedBuild) {
      const old=previous.generatedActions || Pathbridger.normalize(previous.importedBuild).actions;
      c.actions=PathbridgerCharacters.mergeActions(old,previous.actions,c.actions).actions;
    }
    $('name').value = c.name; $('actions').value = JSON.stringify(c.actions, null, 2);
    importedBuild=data;adoptCalculated=false;dirty=true;
    $('warnings').textContent = [...c.warnings,...(c.reports || [])].join('\n');
    importStatus('Imported for review. Review the actions below, then click Save manual changes.');
  } catch(e) { importStatus(e.message); }
  finally {
    clearTimeout(deadline);importController=null;importing=false;
    $('skip-lookups').hidden=true;$('manual-import').removeAttribute('aria-busy');
    for(const [id,disabled] of previousDisabled) $(id).disabled=disabled;
    $('clear').disabled=!currentId;$('link-save').disabled=!currentId;
    $('unlink-save').disabled=!library?.records.find(c=>c.id===currentId)?.source;
    if(!library)setReady(false);
  }
};
$('save').onclick = async () => {
  try {
    const actions = Pathbridger.validateActions(JSON.parse($('actions').value));
    const result=await command({type:'edit',id:currentId,revision:currentRevision,name:$('name').value,actions,importedBuild,generatedActions,adoptCalculated,rulesEdition:$('edition').value,useNethys:$('nethys').checked});
    showCharacter(result.result);$('status').textContent='Saved. Open Paizo editors update automatically.';
  }catch(e){report(e);}
};
$('clear').onclick = async () => {try {await command({type:'delete',id:currentId});showCharacter(library.activeId);$('status').textContent='Character removed from Pathbridger.';}catch(e){report(e);}};
PathbridgerAPI.storage.onChanged.addListener((changes,area)=>{
  if(area==='local' && changes.pathbuilderConnection){renderConnection(changes.pathbuilderConnection.newValue);checkAccess().catch(report);}
  if(area==='local' && changes.characterLibrary) {
    if(dirty || $('import').disabled) $('status').textContent='Saved character data changed. Reload to view it; unsaved edits are preserved.';
    else load(currentId || undefined).catch(report);
  }
});
