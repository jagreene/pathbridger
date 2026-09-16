/* MAIN world: observe successful persistence, never alter Pathbuilder's data. */
(() => {
  const channel = 'pathbridger-save-v1';
  const max = 1500000;
  const post = window.postMessage.bind(window);
  let sequence = 0;
  const startedAt = () => performance.timeOrigin + performance.now() + (++sequence / 1000000);
  const savedSnapshots=new Map();
  const key=s=>JSON.stringify([s.source.mode,s.source.scope,s.source.saveId,s.startedAt]);
  const emit = snapshot => {try {
    savedSnapshots.set(key(snapshot),snapshot);
    while(savedSnapshots.size>8)savedSnapshots.delete(savedSnapshots.keys().next().value);
    post({channel, snapshot}, location.origin);
  } catch (_) { /* Extension must not break a save. */ }};
  let exports=Promise.resolve();
  window.addEventListener?.('message',event=>{
    if(event.source!==window||event.origin!==location.origin||event.data?.channel!=='pathbridger-export-request-v1')return;
    const snapshot=savedSnapshots.get(key(event.data));
    if(!snapshot)return;
    savedSnapshots.delete(key(event.data));
    exports=exports.then(async()=>{
      try {
        const result=await PathbridgerLocalExport.capture(snapshot);
        post({channel:'pathbridger-export-result-v1',source:snapshot.source,startedAt:snapshot.startedAt,...result},location.origin);
      }catch(error){post({channel:'pathbridger-export-result-v1',source:snapshot.source,startedAt:snapshot.startedAt,error:String(error.message).slice(0,300)},location.origin);}
    }).catch(()=>{});
  });
  function capture(source, body) {
    if (typeof body !== 'string' || body.length > max) return null;
    try {
      const raw = JSON.parse(body), c = source.mode === 'gdrive' ? raw?.characterData : raw;
      if (!c || typeof c.characterName !== 'string' || (c.isStarbuilderCharacter === true || c.starbuilderCharacter === true)) return null;
      return {source, payload:body, startedAt:startedAt()};
    } catch (_) { return null; }
  }
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function(value, key) {
    const request = Reflect.apply(put, this, arguments);
    try {
      if (this.name === 'saves' && this.transaction.db.name === 'pathbuilder2e_db' && typeof key === 'string') {
        const saved = capture({mode:'local', scope:'pathbuilder2e_db', saveId:key}, value);
        if (saved) this.transaction.addEventListener('complete', () => emit(saved), {once:true});
      }
    } catch (_) { /* Preserve the site's original return value and exceptions. */ }
    return request;
  };
  const open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
  const requests = new WeakMap(), cleanup = new WeakMap();
  XMLHttpRequest.prototype.open = function(method, url) {
    const result = Reflect.apply(open, this, arguments);
    cleanup.get(this)?.();
    requests.delete(this);
    try {
      const parsed = new URL(url, location.href);
      const match = /^\/upload\/drive\/v3\/files\/([\w-]+)$/.exec(parsed.pathname);
      if (String(method).toUpperCase() === 'PATCH' && parsed.origin === 'https://www.googleapis.com' && parsed.searchParams.get('uploadType') === 'media' && match) requests.set(this, match[1]);
    } catch (_) { /* Ignore unrelated requests. */ }
    return result;
  };
  XMLHttpRequest.prototype.send = function(body) {
    const id = requests.get(this);
    const saved = id && capture({mode:'gdrive', scope:'drive', saveId:id}, body);
    const clear = () => {this.removeEventListener('load', done);this.removeEventListener('loadend', clear);cleanup.delete(this);};
    const done = () => {clear();if (this.status === 200) emit(saved);};
    if (saved) {cleanup.set(this,clear);this.addEventListener('load', done, {once:true});this.addEventListener('loadend',clear,{once:true});}
    try { return Reflect.apply(send, this, arguments); }
    catch (error) { if (saved) clear(); throw error; }
  };
})();
