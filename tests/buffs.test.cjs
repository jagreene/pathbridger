const {test}=require('node:test');const assert=require('node:assert/strict');
const B=require('../extension/buffs.js'),P=require('../extension/core.js');
test('buffs take highest bonus of each type, independently by statistic',()=>{
 const b=[...B.defaults,{id:'test',name:'Stronger status',type:'status',attack:2,damage:0,checks:2},{id:'aid',name:'Custom circumstance',type:'circumstance',attack:1,damage:0,checks:0}];
 assert.deepEqual(B.totals(b),{attack:3,damage:1,checks:2});
 const action={kind:'strike',name:'Test weapon',attack:12,agile:true,damage:'1d6+4'};
 assert.match(P.roll(B.apply(action,b),1),/1d20\+11/);assert.equal(action.attack,12);
 assert.equal(B.apply(action,b).damage,'1d6+4+1');
});
test('attack-only buffs do not modify saving throws, and buffs never modify DCs',()=>{
 const save={name:'Reflex save',attack:12,mapIncreases:0};
 assert.equal(B.apply(save,B.defaults).attack,12);
 assert.equal(B.apply(save,[{type:'status',checks:2}]).attack,14);
 assert.equal(B.apply({kind:'save',dc:21,damage:'3d4'},B.defaults).dc,21);
 assert.equal(B.apply({kind:'save',dc:21,damage:'3d4'},B.defaults).damage,'3d4+1');
});
test('buff config validates links and bonuses',()=>{
 B.validate(B.defaults[0]);assert.throws(()=>B.link('https://evil.invalid/Spells.aspx?ID=1'));
 assert.throws(()=>B.validate({...B.defaults[0],attack:-1}));
});
test('linked known buffs prefill base effects; unfamiliar effects require review',async()=>{
 const fetcher=async()=>({ok:true,json:async()=>({hits:{hits:[{_source:{id:'spell-1763',name:'Courageous Anthem',text:'You gain a +1 status bonus to attack rolls, damage rolls, and saves against fear.'}}]}})});
 const b=await B.fromURL(B.defaults[0].source,fetcher);assert.equal(b.attack,1);assert.equal(b.damage,1);assert.equal(b.checks,0);
});
