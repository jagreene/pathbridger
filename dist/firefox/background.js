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
  // Extension options may be a normal tab (and may have a query/hash).
  // Authorize the extension URL, not the absence of sender.tab.
  let options=false;
  try {
    const actual=new URL(sender.url),expected=new URL(PathbridgerAPI.runtime.getURL('options.html'));
    options=sender.id===PathbridgerAPI.runtime.id && actual.protocol===expected.protocol && actual.host===expected.host && actual.pathname===expected.pathname;
  }catch(_){}
  let pathbuilder = false;
  let paizo = false;
  try {
    const url = new URL(sender.url);
    pathbuilder = sender.id === PathbridgerAPI.runtime.id && sender.tab && sender.frameId === 0 && url.origin === 'https://pathbuilder2e.com' && url.pathname === '/app.html';
    paizo = sender.id === PathbridgerAPI.runtime.id && sender.tab && sender.frameId === 0 && ['https://paizo.com','https://www.paizo.com'].includes(url.origin);
  } catch (_) {}
  const characterPicker = paizo && ['characters','select'].includes(message?.type);
  if (!(options && ['library','select','edit','delete','link','unlink'].includes(message?.type)) && !characterPicker && !(pathbuilder && ['pathbuilder-save','pathbuilder-export','pathbuilder-status'].includes(message?.type))) return;
  enqueue(async () => {
    if(message.type==='pathbuilder-status') {
      await PathbridgerAPI.storage.local.set({pathbuilderConnection:{observerReady:message.observerReady===true,seenAt:Date.now()}});
      return {ok:true};
    }
    const state = await PathbridgerAPI.storage.local.get(['characterLibrary','character','rulesCache','pathbuilderConnection']);
    const library = PathbridgerCharacters.migrate(state, () => crypto.randomUUID());
    let result;
    if (message.type === 'pathbuilder-save') result = PathbridgerCharacters.applySave(library, PathbridgerCharacters.snapshot(message.snapshot), Date.now());
    else if(message.type==='pathbuilder-export') result=PathbridgerCharacters.applyExport(library,message,Pathbridger,PathbridgerRules,PathbridgerExportData,state.rulesCache||{},Date.now());
    else if(message.type==='characters') result={activeId:library.activeId,records:library.records.map(({id,name})=>({id,name}))};
    else if (message.type !== 'library') result = PathbridgerCharacters.mutate(library, message, Pathbridger, () => crypto.randomUUID());
    if(message.type !== 'library' || !state.characterLibrary) await PathbridgerAPI.storage.local.set({characterLibrary:library, character:PathbridgerCharacters.projection(library)});
    // Page content scripts never receive the library or unrelated characters.
    return options ? {library,result,connection:state.pathbuilderConnection} : {result,requestExport:message.type==='pathbuilder-save' && result==='saved'};
  }).then(respond, error => respond({error:error.message}));
  return true;
});
