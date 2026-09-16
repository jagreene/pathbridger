const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const core=require('../extension/core.js');
const sync=require('../extension/characters.js');
const action={name:'Custom strike',attack:12,damage:'2d6+4'};
const source=(saveId='file-A',mode='gdrive')=>({mode,scope:mode==='local'?'pathbuilder2e_db':'drive',saveId});
const snapshot=(name='Hero',saveId='file-A',startedAt=1,mode='gdrive')=>sync.snapshot({source:source(saveId,mode),startedAt,payload:JSON.stringify(mode==='gdrive'?{characterData:{characterName:name,listPlayerWeapons:[]}}:{characterName:name,listPlayerWeapons:[]})});
function linked() {
 const library=sync.migrate({character:{name:'Hero',actions:[action]}},()=> 'a');
 library.candidates.push({...snapshot(),seenAt:10});
 sync.mutate(library,{type:'link',id:'a',source:source()},core);
 return library;
}
test('migrate single character once without losing manual actions',()=>{
 const l=sync.migrate({character:{name:'Hero',actions:[action]}},()=> 'a');
 assert.equal(l.activeId,'a');assert.deepEqual(l.records[0].actions,[action]);
 assert.equal(sync.migrate({characterLibrary:l},()=>{throw Error('must not migrate again');}),l);
});
test('unknown saves automatically create distinct records even with duplicate names',()=>{
 const l=linked();sync.applySave(l,snapshot('Hero','file-B'),20);
 assert.equal(l.records[0].lastSave,undefined);assert.equal(l.records.length,2);assert.equal(l.records[1].source.saveId,'file-B');assert.equal(l.records[1].lastSave.startedAt,1);
 assert.equal(l.activeId,l.records[1].id);assert.equal(l.records[0].source.saveId,'file-A');
});
test('rename updates linked data; custom actions and active selection survive',()=>{
 const l=linked();sync.mutate(l,{type:'edit',name:'Other',actions:[],id:null},core,()=> 'b');
 sync.applySave(l,snapshot('Renamed','file-A',3),30);
 assert.equal(l.records[0].name,'Renamed');assert.deepEqual(l.records[0].actions,[action]);
 assert.equal(l.records[0].actionsNeedReview,true);assert.equal(l.activeId,'a');
 assert.equal(sync.projection(l).name,'Renamed');assert.equal(JSON.parse(l.records[0].lastSave.payload).characterData.characterName,'Renamed');
});
test('older saves cannot replace newer snapshots, including after serialization',()=>{
 let l=linked();sync.applySave(l,snapshot('New','file-A',30),30);
 l=JSON.parse(JSON.stringify(l));assert.equal(sync.applySave(l,snapshot('Old','file-A',10),40),'ignored');assert.equal(l.records[0].name,'New');
});
test('same local and cloud IDs are different sources',()=>{
 const l=linked();sync.applySave(l,snapshot('Local','file-A',5,'local'),50);
 assert.equal(l.records[0].lastSave,undefined);assert.equal(l.records[1].source.mode,'local');
});
test('invalid, oversized and unknown schema messages are rejected',()=>{
 const s=snapshot();
 for(const input of [{...s,payload:'{}'},{...s,payload:'{'},{...s,payload:' '.repeat(sync.MAX_BYTES+1)},{...s,source:source('__bad/id')},{...s,source:{...source(),scope:'other'}},{...s,startedAt:NaN}]) assert.throws(()=>sync.snapshot(input));
 assert.throws(()=>sync.snapshot({...s,payload:JSON.stringify({characterData:{characterName:'Star',isStarbuilderCharacter:true}})}));
});
test('linking requires a detected save, disallows duplicate ownership and unlink stops updates',()=>{
 const l=linked();sync.mutate(l,{type:'edit',name:'Other',actions:[],id:null},core,()=> 'b');
 assert.throws(()=>sync.mutate(l,{type:'link',id:'b',source:source()},core));
 sync.mutate(l,{type:'unlink',id:'a'},core);sync.applySave(l,snapshot('Renamed','file-A',5),50);
 assert.equal(l.records[0].name,'Hero');assert.equal(l.records[0].lastSave,undefined);
});
test('editing rejects a stale revision so a settings tab cannot erase a save',()=>{
 const l=linked(), revision=l.records[0].revision;
 sync.applySave(l,snapshot('Renamed','file-A',2),20);
 assert.throws(()=>sync.mutate(l,{type:'edit',id:'a',revision,name:'Old',actions:[]},core),/changed/);
 assert.equal(l.records[0].name,'Renamed');
});
test('manual edits retain review warning; reviewed JSON import clears it',()=>{
 const l=linked();sync.applySave(l,snapshot('Hero','file-A',2),20);
 sync.mutate(l,{type:'edit',id:'a',revision:l.records[0].revision,name:'Hero',actions:[action]},core);
 assert.equal(l.records[0].actionsNeedReview,true);
 sync.mutate(l,{type:'edit',id:'a',revision:l.records[0].revision,name:'Hero',actions:[action],importedBuild:{build:{name:'Hero',weapons:[]}}},core);
 assert.equal(l.records[0].actionsNeedReview,false);
 sync.applySave(l,snapshot('Hero','file-A',3),30);assert.equal(l.records[0].actionsNeedReview,false);
});
function observer() {
 const events=[];let tick=0;
 class Store {constructor(db='pathbuilder2e_db',name='saves'){this.name=name;this.transaction=new EventTarget();this.transaction.db={name:db};}put(...args){this.args=args;return this.result={};}}
 class XHR extends EventTarget {open(method,url){this.url=url;}send(body){this.body=body;if(this.fail)throw Error('send failed');}finish(status){this.status=status;this.dispatchEvent(new Event('load'));}}
 const context={IDBObjectStore:Store,XMLHttpRequest:XHR,URL,WeakMap,performance:{timeOrigin:1000,now:()=>++tick},location:{origin:'https://pathbuilder2e.com',href:'https://pathbuilder2e.com/app.html'},window:{postMessage:message=>{if(message.snapshot)events.push(message);}}};
 vm.runInNewContext(fs.readFileSync('extension/pathbuilder-observer.js','utf8'),context);
 return {Store,XHR,events};
}
test('local observer emits only after transaction commit and preserves put arguments and return value',()=>{
 const {Store,events}=observer(), store=new Store(),body=snapshot('Hero','local',1,'local').payload;
 const returned=store.put(body,'local');assert.equal(returned,store.result);assert.deepEqual(store.args,[body,'local']);assert.equal(events.length,0);
 store.transaction.dispatchEvent(new Event('abort'));assert.equal(events.length,0);
 const committed=new Store();committed.put(body,'local');committed.transaction.dispatchEvent(new Event('complete'));
 assert.equal(events.length,1);assert.equal(events[0].snapshot.source.saveId,'local');assert.equal(events[0].snapshot.payload,body);
 for(const store of [new Store('other'),new Store('pathbuilder2e_db','saveIDs')]) {store.put(body,'local');store.transaction.dispatchEvent(new Event('complete'));}
 assert.equal(events.length,1);
});
test('cloud observer filters uploads and snapshots the body at send time',()=>{
 const {XHR,events}=observer(),body=snapshot().payload;
 for(const [method,url,status] of [['PATCH','https://www.googleapis.com/upload/drive/v3/files/file-A?uploadType=media',500],['POST','https://www.googleapis.com/upload/drive/v3/files/file-A?uploadType=media',200],['PATCH','https://evil.test/upload/drive/v3/files/file-A?uploadType=media',200]]) {const x=new XHR();x.open(method,url);x.send(body);x.finish(status);}
 assert.equal(events.length,0);
 const x=new XHR();x.open('PATCH','https://www.googleapis.com/upload/drive/v3/files/file-A?uploadType=media');x.send(body);assert.equal(x.body,body);assert.equal(events.length,0);x.finish(200);
 assert.equal(events.length,1);assert.equal(events[0].snapshot.payload,body);assert.equal(events[0].snapshot.source.saveId,'file-A');
 x.open('GET','https://example.org');x.send(body);x.finish(200);assert.equal(events.length,1);
});
test('cloud observer preserves synchronous failure and does not report success',()=>{
 const {XHR,events}=observer(),x=new XHR();x.fail=true;x.open('PATCH','https://www.googleapis.com/upload/drive/v3/files/file-A?uploadType=media');assert.throws(()=>x.send(snapshot().payload),/send failed/);x.finish(200);assert.equal(events.length,0);
});
test('aborted and reused cloud requests do not replay an earlier save',()=>{
 const {XHR,events}=observer(),x=new XHR();
 x.open('PATCH','https://www.googleapis.com/upload/drive/v3/files/file-A?uploadType=media');x.send(snapshot('Old').payload);
 x.dispatchEvent(new Event('loadend'));
 x.open('PATCH','https://www.googleapis.com/upload/drive/v3/files/file-B?uploadType=media');x.send(snapshot('New').payload);x.finish(200);
 assert.equal(events.length,1);assert.equal(events[0].snapshot.source.saveId,'file-B');
});
function background(initial={}) {
 let listener,state=structuredClone(initial),fail=false;
 const api={action:{onClicked:{addListener(){}}},runtime:{id:'test',getURL:path=>'moz-extension://test/'+path,onMessage:{addListener:fn=>listener=fn}},storage:{local:{get:async()=>structuredClone(state),set:async value=>{await new Promise(r=>setTimeout(r,1));if(fail)throw Error('Storage quota exceeded');state={...state,...structuredClone(value)};}}}};
 const context=vm.createContext({browser:api,URL,TextEncoder,crypto:require('node:crypto').webcrypto,Date});
 for(const file of ['api.js','core.js','rules.js','export-data.js','characters.js','background.js'])vm.runInContext(fs.readFileSync('extension/'+file,'utf8'),context);
 const options={id:'test',url:'moz-extension://test/options.html'};
 const content={id:'test',url:'https://pathbuilder2e.com/app.html?v=109g',tab:{id:1},frameId:0};
 const paizo={id:'test',url:'https://paizo.com/community',tab:{id:2},frameId:0};
 return {get state(){return state;},set fail(value){fail=value;},options,content,paizo,request:(message,sender=options)=>new Promise(resolve=>{const handled=listener(message,sender,resolve);if(!handled)resolve(undefined);})};
}
test('background serializes simultaneous writes and never exposes the library to a page',async()=>{
 const b=background({character:{name:'Hero',actions:[action]},buffs:[{name:'untouched'}]});
 const first=await b.request({type:'library'}),id=first.library.activeId;
 b.state.characterLibrary.records.find(c=>c.id===id).source=source();
 const responses=await Promise.all([b.request({type:'pathbuilder-save',snapshot:snapshot('Renamed','file-A',20)},b.content),b.request({type:'edit',name:'Other',actions:[]})]);
 assert.equal(responses[0].library,undefined);assert.equal(b.state.characterLibrary.records.length,2);
 assert.equal(b.state.characterLibrary.records.find(c=>c.id===id).name,'Renamed');
 assert.equal(b.state.character.name,'Other');assert.deepEqual(b.state.buffs,[{name:'untouched'}]);
});
test('background rejects wrong origin, iframe and page attempts to edit/link or enumerate',async()=>{
 const b=background();
 for(const sender of [{...b.content,url:'https://evil.test/app.html'},{...b.content,frameId:1},{...b.content,id:'different'}])assert.equal(await b.request({type:'pathbuilder-save',snapshot:snapshot()},sender),undefined);
 for(const type of ['library','edit','link','delete'])assert.equal(await b.request({type},b.content),undefined);
 assert.equal(b.state.characterLibrary,undefined);
});
test('Paizo picker can list names and switch the active character without receiving actions',async()=>{
 const b=background({character:{name:'Hero',actions:[action]}}),first=await b.request({type:'library'}),id=first.library.activeId;
 await b.request({type:'edit',name:'Other',actions:[]});
 const listed=await b.request({type:'characters'},b.paizo);
 assert.deepEqual(listed.result.records.map(c=>c.name),['Hero','Other']);assert.equal(listed.result.records[0].id,id);assert.equal(listed.result.records[0].actions,undefined);
 await b.request({type:'select',id},b.paizo);assert.equal(b.state.characterLibrary.activeId,id);
});
test('storage failure reports an error, retains old data, and does not poison the queue',async()=>{
 const b=background();await b.request({type:'library'});b.fail=true;
 const result=await b.request({type:'edit',name:'Fail',actions:[]});assert.match(result.error,/quota/);assert.equal(b.state.characterLibrary.records.length,0);
 b.fail=false;await b.request({type:'edit',name:'Success',actions:[]});assert.equal(b.state.character.name,'Success');
});
test('options opened in a Firefox tab may read and write the character library',async()=>{
 const b=background(),sender={...b.options,tab:{id:7},frameId:0};
 const response=await b.request({type:'library'},sender);assert.equal(response.library.version,1);
 await b.request({type:'edit',name:'Firefox tab character',actions:[]},sender);assert.equal(b.state.character.name,'Firefox tab character');
 const withFragment={...sender,url:sender.url+'?section=characters#sync'};
 assert.equal((await b.request({type:'library'},withFragment)).library.records.length,1);
 assert.equal(await b.request({type:'library'},{...sender,url:'moz-extension://other/options.html'}),undefined);
});

test('first save creates an active character and immediately requests calculated export',async()=>{
 const b=background();
 const response=await b.request({type:'pathbuilder-save',snapshot:snapshot()},b.content);
 assert.equal(response.requestExport,true);assert.equal(response.library,undefined);
 const l=b.state.characterLibrary;assert.equal(l.records.length,1);assert.equal(l.activeId,l.records[0].id);
 assert.equal(l.records[0].lastSave.startedAt,1);
 await b.request({type:'pathbuilder-save',snapshot:snapshot('Renamed','file-A',2)},b.content);
 assert.equal(b.state.characterLibrary.records.length,1);assert.equal(b.state.character.name,'Renamed');
 await b.request({type:'pathbuilder-save',snapshot:snapshot('Renamed','file-B',3)},b.content);
 assert.equal(b.state.characterLibrary.records.length,2);assert.equal(b.state.characterLibrary.activeId,b.state.characterLibrary.records[1].id);
});
