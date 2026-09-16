// Chrome loads a classic service worker; Firefox loads the same files in order.
if (typeof importScripts === 'function') importScripts('api.js', 'core.js', 'rules.js', 'export-data.js', 'characters.js');
PathbridgerAPI.action.onClicked.addListener(() => PathbridgerAPI.runtime.openOptionsPage());
let characterQueue = Promise.resolve();
function enqueue(work) {
  const result = characterQueue.then(work);
  characterQueue = result.catch(() => {});
  return result;
}
PathbridgerAPI.runtime.onMessage.addListener((message, sender, respond) => {
  const options = sender.id === PathbridgerAPI.runtime.id && sender.url === PathbridgerAPI.runtime.getURL('options.html') && !sender.tab;
  let pathbuilder = false;
  try {
    const url = new URL(sender.url);
    pathbuilder = sender.id === PathbridgerAPI.runtime.id && sender.tab && sender.frameId === 0 && url.origin === 'https://pathbuilder2e.com' && url.pathname === '/app.html';
  } catch (_) {}
  if (!(options && ['library','select','edit','delete','link','unlink'].includes(message?.type)) && !(pathbuilder && ['pathbuilder-save','pathbuilder-export'].includes(message?.type))) return;
  enqueue(async () => {
    const state = await PathbridgerAPI.storage.local.get(['characterLibrary','character','rulesCache']);
    const library = PathbridgerCharacters.migrate(state, () => crypto.randomUUID());
    let result;
    if (message.type === 'pathbuilder-save') result = PathbridgerCharacters.applySave(library, PathbridgerCharacters.snapshot(message.snapshot), Date.now());
    else if(message.type==='pathbuilder-export') result=PathbridgerCharacters.applyExport(library,message,Pathbridger,PathbridgerRules,PathbridgerExportData,state.rulesCache||{},Date.now());
    else if (message.type !== 'library') result = PathbridgerCharacters.mutate(library, message, Pathbridger, () => crypto.randomUUID());
    await PathbridgerAPI.storage.local.set({characterLibrary:library, character:PathbridgerCharacters.projection(library)});
    // Page content scripts never receive the library or unrelated characters.
    return options ? {library,result} : {result,requestExport:message.type==='pathbuilder-save' && result==='saved'};
  }).then(respond, error => respond({error:error.message}));
  return true;
});
