(() => {
  let observerReady=false;
  const reportConnection=()=>PathbridgerAPI.runtime.sendMessage({type:'pathbuilder-status',observerReady}).catch(()=>{});
  function show(text) {
    let status=document.getElementById('pathbridger-sync-status');
    if(!status) {
      status=document.createElement('div');status.id='pathbridger-sync-status';status.setAttribute('role','status');
      Object.assign(status.style,{position:'fixed',bottom:'8px',right:'8px',zIndex:'2147483647',background:'#172333',color:'#fff',padding:'10px',maxWidth:'360px',font:'14px sans-serif',borderRadius:'6px'});
      document.documentElement.append(status);
    }
    status.textContent=`Pathbridger: ${text}`;
  }
  window.addEventListener('message',async event=>{
    if(event.source!==window||event.origin!==location.origin)return;
    const channel=event.data?.channel;
    if(channel==='pathbridger-observer-ready-v1'){observerReady=true;reportConnection();return;}
    if(!['pathbridger-save-v1','pathbridger-export-result-v1'].includes(channel))return;
    try {
      const message=channel==='pathbridger-save-v1' ? {type:'pathbuilder-save',snapshot:PathbridgerCharacters.snapshot(event.data.snapshot)} : {...event.data,type:'pathbuilder-export'};
      const response=await PathbridgerAPI.runtime.sendMessage(message);
      if(!response||response.error)throw Error(response?.error||'Extension unavailable. Reload the page.');
      if(response.requestExport) {
        show('Save synced. Refreshing calculated rolls…');
        const {source,startedAt}=message.snapshot;
        window.postMessage({channel:'pathbridger-export-request-v1',source,startedAt},location.origin);
      }else if(response.result==='refreshed')show('Character and calculated rolls synced.');
      else if(response.result==='review')show(event.data.error||'Data synced. Some actions need review in settings.');
      else if(response.result==='unlinked')show('Save detected. Link it in extension settings to start syncing.');
      else if(response.result!=='ignored')show('Character data synced.');
    }catch(error){show(error.message);}
  });
  window.postMessage({channel:'pathbridger-observer-ping-v1'},location.origin);
  setTimeout(()=>{reportConnection();if(!observerReady)show('Save detection did not start. Reload the extension and this Pathbuilder tab.');},3000);
})();
