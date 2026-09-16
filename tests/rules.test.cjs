const {test} = require('node:test');
const assert = require('node:assert/strict');
const P = require('../extension/core.js');
const R = require('../extension/rules.js');
const build = {name:'Synthetic mage',level:5,abilities:{cha:18},spellCasters:[{name:'Test caster',ability:'cha',proficiency:2,spells:[{spellLevel:0,list:['Electric Arc']}]}]};
const request = R.requests(build)[0];
const record = {id:'spell-test',name:'Electric Arc',category:'spell',url:'/Spells.aspx?ID=1509',trait:['Cantrip'],saving_throw:'basic Reflex',text:'Each target takes 2d4 electricity damage. Heightened (+1) The damage increases by 1d4.'};
test('collect and deduplicate exported abilities, feats, weapons, and prepared spells',()=>{
 const b = {...build,specials:['Test action','Test action'],feats:[['Test feat']],weapons:[{name:'Sword'}]};
 assert.deepEqual(R.requests(b).map(r=>r.name),['Sword','Test action','Test feat','Electric Arc']);
});
test('exact name and edition matching rejects ambiguity and approximate names',()=>{
 const old = {...record,remaster_id:['new']}, modern = {...record,legacy_id:['old']};
 assert.equal(R.choose([{_source:old},{_source:modern}],request,'remaster'),modern);
 assert.equal(R.choose([{_source:old},{_source:modern}],request,'legacy'),old);
 assert.throws(()=>R.choose([{_source:modern},{_source:modern}],request,'remaster'));
 assert.throws(()=>R.choose([{_source:{...record,name:'Greater Electric Arc'}}],request,'remaster'));
});
test('cantrip rank and edition damage are parsed from rules, with no MAP',()=>{
 const a=R.compile(record,request,build);
 assert.equal(a.damage,'4d4'); assert.equal(a.dc,21); assert.equal(a.mapIncreases,0);
 P.validateActions([a]); assert.equal(P.attackCount(P.roll(a,2),[a]),0);
 assert.match(P.roll(a,2),/DC 21 basic Reflex/);
 const old = {...record,text:'damage equal to 1d4 plus your spellcasting ability modifier. Heightened (+1) The damage increases by 1d4.'};
 assert.equal(R.compile(old,request,build).damage,'3d4+4');
 assert.equal(R.compile({...record,text:'Changed rules'},request,build).kind,'reference');
});
test('reference actions do not invent rolls from incidental Strike mentions',()=>{
 const a=R.compile({...record,name:'Test Reflection',category:'action',trait:['Manipulate'],text:'You can Strike from another position.'},{name:'Test Reflection',kind:'ability'},build);
 assert.equal(a.kind,'reference'); P.validateActions([a]); assert.doesNotMatch(P.roll(a,0),/1d20/);
});
test('spell attacks use caster proficiency but do not invent damage',()=>{
 const a=R.compile({...record,name:'Test Ray',trait:['Attack'],text:'Make a spell attack roll against AC.'},{...request,name:'Test Ray'},build);
 assert.equal(a.attack,11); assert.equal(a.mapIncreases,1); assert.equal(a.damage,undefined);
 assert.match(P.roll(a,1),/1d20\+6/);
});
test('external links and incomplete spellcasting data fail safely',()=>{
 assert.throws(()=>R.sourceURL('https://evil.invalid/x'));
 assert.throws(()=>P.validateActions([{name:'x',kind:'reference',source:'https://evil.invalid',mapIncreases:0}]));
 assert.equal(R.compile(record,request,{level:5}).kind,'reference');
});
test('lookup sends only the requested rules name and uses cache without network',async()=>{
 let count=0;
 const fetcher=async(url,options)=>{count++; const u=new URL(url); assert.equal(u.hostname,'elasticsearch.aonprd.com'); assert.equal(options.credentials,'omit'); assert.deepEqual(JSON.parse(u.searchParams.get('source')),{size:100,query:{match_phrase:{name:'Electric Arc'}}}); return {ok:true,json:async()=>({hits:{hits:[{_source:record}]}})};};
 const cache={}; await R.lookup(request,'remaster',cache,fetcher); await R.lookup(request,'remaster',cache,fetcher); assert.equal(count,1);
 await assert.rejects(()=>R.lookup(request,'legacy',{},async()=>({ok:false,status:429})),/429/);
});
test('failed lookups retain existing imported actions and report failure',async()=>{
 const c={name:'Synthetic mage',actions:[{name:'Test weapon',attack:7}],warnings:[]};
 const result=await R.enrich(build,c,'remaster',{},()=>{},async()=>{throw Error('Offline');});
 assert.deepEqual(result.actions,c.actions); assert.match(result.reports[0],/Offline/);
});
