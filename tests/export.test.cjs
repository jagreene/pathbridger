const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const sync=require('../extension/characters.js');
const proof=require('../extension/export-data.js');
const core=require('../extension/core.js');
const rules=require('../extension/rules.js');
const raw={characterName:'Synthetic Hero',characterLevel:5,webID:'local-A',googleFileID:'drive-A',folderID:'folder',firebaseID:'gm',listPlayerWeapons:[]};
const source={mode:'gdrive',scope:'drive',saveId:'drive-A'};
const snapshot={source,startedAt:1,payload:JSON.stringify({characterData:raw})};
const exported={build:{name:raw.characterName,level:5,weapons:[{name:'Hatchet',attack:14,damage:'2d6+4',traits:['agile']}],abilities:{con:14,dex:16,wis:12},proficiencies:{fortitude:4,reflex:2,will:4}}};
const envelope=(c=raw)=>JSON.stringify({build:JSON.stringify({characterData:{...c,folderID:null,firebaseID:null}}),version:121});
const result=()=>({source,startedAt:1,before:envelope(),after:envelope(),exported:JSON.stringify(exported)});
function library() {
 const old={build:{...exported.build,level:4,weapons:[{name:'Hatchet',attack:12,damage:'1d6+3',traits:['agile']}]}};
 return {version:1,activeId:'other',candidates:[],records:[{id:'hero',source,name:'Old',lastSave:snapshot,revision:1,pendingExportRevision:1,actions:core.normalize(old).actions,generatedActions:core.normalize(old).actions,useNethys:false,actionsNeedReview:true},{id:'other',name:'Other',actions:[],revision:0}]};
}
test('proof verifies persistent identity and exact build, ignores only save transport metadata',()=>{
 assert.deepEqual(proof.verify(snapshot,result()),exported);
 const local={...snapshot,source:{mode:'local',scope:'pathbuilder2e_db',saveId:'local-A'},payload:JSON.stringify(raw)};
 assert.deepEqual(proof.verify(local,result()),exported);
 assert.throws(()=>proof.verify(snapshot,{...result(),before:envelope({...raw,googleFileID:'another',characterName:raw.characterName})}),/differs/);
 assert.throws(()=>proof.verify(snapshot,{...result(),after:envelope({...raw,characterLevel:6})}),/differs/);
 assert.throws(()=>proof.verify(snapshot,{...result(),exported:JSON.stringify({build:{...exported.build,level:6}})}),/level/);
 assert.throws(()=>proof.verify(snapshot,{...result(),exported:'{}'}),/incomplete/);
});
test('calculated refresh updates weapon damage, attack, saves without changing active character',()=>{
 const l=library();assert.equal(sync.applyExport(l,result(),core,rules,proof,{},100),'refreshed');
 const c=l.records[0];assert.equal(c.actions[0].attack,14);assert.equal(c.actions[0].damage,'2d6+4');
 assert.equal(c.actions.find(a=>a.name==='Fortitude save').attack,11);assert.equal(l.activeId,'other');assert.equal(c.actionsNeedReview,false);assert.equal(c.calculatedAt,100);
});
test('field-level custom changes survive while unmodified generated fields recalculate',()=>{
 const l=library(),c=l.records[0];c.actions[0].map=[-3,-6];c.actions[0].damage='9d6+1';c.actions.push({name:'Custom',attack:42,mapIncreases:0});
 sync.applyExport(l,result(),core,rules,proof,{},100);
 assert.equal(c.actions[0].attack,14);assert.equal(c.actions[0].damage,'9d6+1');assert.deepEqual(c.actions[0].map,[-3,-6]);assert.equal(c.actions.at(-1).name,'Custom');
});
test('deleted generated actions stay deleted, removed weapons disappear, new weapons appear',()=>{
 const a={name:'A',attack:1},b={name:'B',attack:2},c={name:'C',attack:3};
 assert.deepEqual(sync.mergeActions([a,b],[a],[b,c]).actions,[c]);
});
test('old character without baseline preserves collisions for one-time review',()=>{
 const l=library(),c=l.records[0];delete c.generatedActions;
 assert.equal(sync.applyExport(l,result(),core,rules,proof,{},100),'review');
 assert.equal(c.actions[0].attack,12);assert.ok(c.syncWarnings.length);
});
test('old export completion and failed verification do not change actions',()=>{
 const l=library(),previous=structuredClone(l);assert.equal(sync.applyExport(l,{...result(),startedAt:0},core,rules,proof,{},100),'ignored');assert.deepEqual(l,previous);
 assert.throws(()=>sync.applyExport(l,{...result(),after:envelope({...raw,googleFileID:'wrong'})},core,rules,proof,{},100));assert.deepEqual(l,previous);
 assert.equal(sync.applyExport(l,{source,startedAt:1,error:'Timeout'},core,rules,proof,{},100),'review');assert.deepEqual(l.records[0].actions,previous.records[0].actions);assert.equal(l.records[0].syncError,'Timeout');
});
function exporter({version='109g',rawDelay=0,timeout=5000,secondRaw,interaction=false}={}) {
 const uploads=[],clicks=[],listeners={};let ring=false,rawCount=0,ids=0;
 class XHR extends EventTarget {
   open(method,url){this.url=url;this.method=method;}
   send(body){uploads.push({url:this.url,body});}
 }
 const document={scripts:[{src:`https://pathbuilder2e-data.b-cdn.net/Pathbuilder2eWebRemastered${version}.js`}],addEventListener:(name,fn)=>{(listeners[name]??=[]).push(fn);},getElementById:id=>{
   if(id==='ring-holder')return ring?{}:null;
   if(!['sidenav-share','sidenav-json'].includes(id))return null;
   return {click(){clicks.push(id);ring=true;const send=()=>{
     const x=new XHR();x.open('POST','https://pathbuilder2e.com/app/'+(id==='sidenav-share'?'post_emailed.php':'post_json.php'));
     x.onreadystatechange=()=>{if(x.readyState===4){ring=false;if(x.status===200)ids++;}};
     if(id==='sidenav-share') {rawCount++;x.send(rawCount===2&&secondRaw?envelope(secondRaw):envelope());if(interaction)for(const fn of listeners.input||[])fn({isTrusted:true});}
     else x.send(JSON.stringify(exported));
   };if(id==='sidenav-share'&&rawDelay)setTimeout(send,rawDelay);else send();}};
 }};
 const context=vm.createContext({document,XMLHttpRequest:XHR,URL,Event,TextEncoder,location:{origin:'https://pathbuilder2e.com',href:'https://pathbuilder2e.com/app.html'},setTimeout:(fn,ms)=>setTimeout(fn,ms===5000?timeout:ms),clearTimeout});
 for(const file of ['export-data.js','pathbuilder-export.js'])vm.runInContext(fs.readFileSync('extension/'+file,'utf8'),context);
 return {capture:context.PathbridgerLocalExport.capture,uploads,clicks,XHR,get ring(){return ring;},get ids(){return ids;}};
}
test('automatic raw/JSON/raw sequence captures calculated data with zero uploads or published IDs',async()=>{
 const e=exporter({rawDelay:1}),r=await e.capture(snapshot);
 assert.equal(JSON.parse(r.exported).build.weapons[0].attack,14);assert.deepEqual(e.clicks,['sidenav-share','sidenav-json','sidenav-share']);assert.equal(e.uploads.length,0);assert.equal(e.ids,0);assert.equal(e.ring,false);
 const manual=new e.XHR();manual.open('POST','https://pathbuilder2e.com/app/post_json.php');manual.send('manual');assert.equal(e.uploads.length,1);
});
test('unsupported version, changed character and user input fail closed',async()=>{
 const version=exporter({version:'110a'});await assert.rejects(version.capture(snapshot),/version/);assert.equal(version.clicks.length,0);
 for(const options of [{secondRaw:{...raw,googleFileID:'other'}},{interaction:true}]) {
  const e=exporter(options);await assert.rejects(e.capture(snapshot));assert.equal(e.uploads.length,0);
 }
});
test('late export after timeout is still intercepted, never accidentally published',async()=>{
 const e=exporter({rawDelay:30,timeout:5});await assert.rejects(e.capture(snapshot),/timed out/);
 await new Promise(r=>setTimeout(r,40));assert.equal(e.uploads.length,0);assert.equal(e.ids,0);assert.equal(e.ring,false);
 await assert.rejects(e.capture(snapshot),/reload/);
});
test('cached spell adapter recalculates spell bonus and cantrip rank without network',()=>{
 const build={name:'Synthetic caster',level:7,weapons:[],abilities:{cha:18},spellCasters:[{name:'Arcane',ability:'cha',proficiency:4,spells:[{spellLevel:0,list:['Test Ray']}]}]};
 const cache={'remaster:spell:test ray':{record:{name:'Test Ray',id:'spell-test',url:'Spells.aspx?ID=1',trait:['attack','cantrip'],text:'Make a ranged spell attack roll.'}}};
 const c=rules.enrichCached({build},core.normalize({build}),'remaster',cache);assert.equal(c.actions[0].attack,15);assert.match(c.actions[0].name,/rank 4/);
});

test('a settings edit made during export cannot be replaced by an older calculation',()=>{
 const l=library(),c=l.records[0];c.revision++;c.actions[0].attack=99;
 assert.equal(sync.applyExport(l,result(),core,rules,proof,{},100),'ignored');assert.equal(c.actions[0].attack,99);
});
test('missing cached spell rule preserves its last good roll while refreshing weapons',()=>{
 const l=library(),c=l.records[0];c.useNethys=true;
 const spell={name:'Test Ray (Arcane, rank 3)',attack:12,mapIncreases:1};c.actions.push(spell);c.generatedActions.push({...spell});
 const data=structuredClone(exported);data.build.spellCasters=[{name:'Arcane',ability:'cha',proficiency:2,spells:[{spellLevel:0,list:['Test Ray']}]}];
 assert.equal(sync.applyExport(l,{...result(),exported:JSON.stringify(data)},core,rules,proof,{},100),'review');
 assert.equal(c.actions[0].attack,14);assert.equal(c.actions.find(a=>a.name===spell.name).attack,12);
});
