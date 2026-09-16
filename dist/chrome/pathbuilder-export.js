/* v109g local-only export: run the site's exporter, suppress its upload.
   No minified runtime functions or private character globals are accessed. */
(() => {
  const endpoints=new Set(['/app/post_emailed.php','/app/post_json.php']);
  const open=XMLHttpRequest.prototype.open,send=XMLHttpRequest.prototype.send;
  const destinations=new WeakMap();
  let pending=null, disabled=false, running=false, interactions=0;
  for(const name of ['pointerdown','keydown','input'])document.addEventListener(name,event=>{if(event.isTrusted)interactions++;},true);
  // Do not let a manual export race an automatic one and consume its capture.
  document.addEventListener('click',event=>{
    if(event.isTrusted && (running||pending) && event.target?.closest?.('#sidenav-share, #sidenav-json')) {
      event.preventDefault();event.stopImmediatePropagation();interactions++;
    }
  },true);
  XMLHttpRequest.prototype.open=function(method,url) {
    const result=Reflect.apply(open,this,arguments);
    destinations.delete(this);
    try {const parsed=new URL(url,location.href);
    if(String(method).toUpperCase()==='POST' && parsed.origin===location.origin && endpoints.has(parsed.pathname))destinations.set(this,parsed.pathname);}catch(_){}
    return result;
  };
  function completeLocally(xhr) {
    // v109g's completion handlers remove their spinner for every DONE response;
    // only 200 publishes an ID/dialog and 406 opens an account error. A local
    // 204 takes neither branch. Never run the native send() for automatic exports.
    Object.defineProperties(xhr,{readyState:{value:4,configurable:true},status:{value:204,configurable:true}});
    if(typeof xhr.onreadystatechange==='function')xhr.onreadystatechange(new Event('readystatechange'));
  }
  XMLHttpRequest.prototype.send=function(body) {
    const path=destinations.get(this);
    if(pending && path===pending.path) {
      const job=pending;pending=null;clearTimeout(job.timer);
      try {completeLocally(this);job.resolve(body);}catch(error){job.reject(error);}
      return;
    }
    return Reflect.apply(send,this,arguments);
  };
  function request(id,path) {
    if(pending)throw Error('An export is still pending. Reload Pathbuilder before retrying.');
    return new Promise((resolve,reject)=>{
      const element=document.getElementById(id);
      if(!element){reject(Error('Pathbuilder export menu is unavailable.'));return;}
      pending={path,resolve,reject,timer:null};
      const job=pending;
      job.timer=setTimeout(()=>{
        // Retain the interception until a late automatic export reaches send().
        // Otherwise a timeout could accidentally turn it into a public upload.
        disabled=true;reject(Error('Pathbuilder export timed out. Reload the page before retrying.'));
      },5000);
      try {element.click();}catch(error){disabled=true;reject(error);}
    });
  }
  async function capture(snapshot) {
    if(running||disabled)throw Error('Pathbuilder exporter is busy or needs a page reload.');
    if(!Array.from(document.scripts).some(s=>/^https:\/\/pathbuilder2e-data\.b-cdn\.net\/Pathbuilder2eWebRemastered109g\.js(?:\?|$)/.test(s.src)))throw Error('Automatic export is not verified for this Pathbuilder version. Import JSON manually.');
    if(document.getElementById('ring-holder'))throw Error('Pathbuilder is busy. Save again after it finishes.');
    running=true;
    const revision=interactions;
    try {
      const before=await request('sidenav-share','/app/post_emailed.php');
      PathbridgerExportData.verifyRaw(snapshot,before);
      if(revision!==interactions)throw Error('Character was edited during export. Save again.');
      const exported=await request('sidenav-json','/app/post_json.php');
      const after=await request('sidenav-share','/app/post_emailed.php');
      if(revision!==interactions)throw Error('Character was edited during export. Save again.');
      const result={before,exported,after};
      PathbridgerExportData.verify(snapshot,result);
      return result;
    }finally{running=false;}
  }
  globalThis.PathbridgerLocalExport={capture};
})();
