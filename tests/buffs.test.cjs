const {test}=require('node:test');const assert=require('node:assert/strict');
const B=require('../extension/buffs.js'),P=require('../extension/core.js');
test('buffs take highest bonus of each type, independently by statistic',()=>{
 const b=[...B.defaults,{id:'test',name:'Stronger status',type:'status',attack:2,damage:0,checks:2},{id:'aid',name:'Custom circumstance',type:'circumstance',attack:1,damage:0,checks:0}];
 assert.deepEqual(B.totals(b),{attack:3,damage:1,checks:2});
 const action={kind:'strike',name:'Test weapon',attack:12,agile:true,damage:'1d6+4'};
 assert.match(P.roll(B.apply(action,b),1),/1d20\+8 \+ 3/);assert.equal(action.attack,12);
 assert.equal(B.apply(action,b).damage,'1d6+4 + 1');
});
test('attack-only buffs do not modify saving throws, and buffs never modify DCs',()=>{
 const save={name:'Reflex save',attack:12,mapIncreases:0};
 assert.equal(B.apply(save,B.defaults).attack,12);
 assert.equal(B.apply(save,[{type:'status',checks:2}]).buffBonus,2);
 assert.equal(B.apply({kind:'save',dc:21,damage:'3d4'},B.defaults).dc,21);
 assert.equal(B.apply({kind:'save',dc:21,damage:'3d4'},B.defaults).damage,'3d4 + 1');
});
test('buff config validates links and bonuses',()=>{
 B.validate(B.defaults[0]);assert.throws(()=>B.link('https://evil.invalid/Spells.aspx?ID=1'));
 assert.throws(()=>B.validate({...B.defaults[0],attack:-1}));
});
test('linked known buffs prefill base effects; unfamiliar effects require review',async()=>{
 const fetcher=async()=>({ok:true,json:async()=>({hits:{hits:[{_source:{id:'spell-1763',name:'Courageous Anthem',text:'You gain a +1 status bonus to attack rolls, damage rolls, and saves against fear.'}}]}})});
 const b=await B.fromURL(B.defaults[0].source,fetcher);assert.equal(b.attack,1);assert.equal(b.damage,1);assert.equal(b.checks,0);
});
const axe={kind:'strike',name:'Axe',attack:9,damage:'1d6+4'};
function rewrite(text,actions,previous,next) {
 for(const edit of B.edits(text,actions,previous,next,P).reverse()) text=text.slice(0,edit.start)+edit.text+text.slice(edit.end);
 return text;
}
test('toggling buffs rewrites existing attacks and damage reversibly without accumulating bonuses',()=>{
 const original=[0,1,2].map(stage=>P.roll(axe,stage)).join('\n');
 const enabled=rewrite(original,[axe],[],B.defaults);
 assert.equal(enabled,[0,1,2].map(stage=>P.roll(B.apply(axe,B.defaults),stage)).join('\n'));
 assert.match(enabled,/1d20\+9 \+ 1/);
 assert.equal(rewrite(enabled,[axe],B.defaults,B.defaults.slice(0,1)),enabled);
 assert.equal(rewrite(enabled,[axe],B.defaults,[]),original);
});
test('rewrites checks and save-spell damage while preserving DC and existing MAP',()=>{
 const actions=[axe,{name:'Lore',attack:7,mapIncreases:0},{kind:'save',name:'Arc',dc:20,save:'Reflex',damage:'3d4',mapIncreases:0}];
 const buff=[{type:'status',attack:2,damage:1,checks:1}];
 const original=actions.map(a=>P.roll(a,2)).join('\n');
 assert.equal(rewrite(original,actions,[],buff),actions.map(a=>P.roll(B.apply(a,buff),2)).join('\n'));
});
test('preserves quoted rolls, unknown labels, prose and manually edited formulas',()=>{
 const roll=P.roll(axe,0);
 const untouched=`[quote=A][quote]${roll}[/quote]${roll}[/quote]\n[dice=Other]1d20+9[/dice]\n[dice=Strike (Axe)]1d20+9+4[/dice]\nMy attack is +9.`;
 assert.equal(rewrite(untouched+'\n'+roll,[axe],[],B.defaults),untouched+'\n'+P.roll(B.apply(axe,B.defaults),0));
 assert.equal(rewrite('[DICE=Strike (Axe)]1D20 + 9[/DICE]',[axe],[],B.defaults),'[DICE=Strike (Axe)]1d20+9 + 1[/DICE]');
});
test('ambiguous matching actions do not rewrite the roll',()=>{
 const actions=[{name:'Test',attack:9},{name:'Test',attack:9,mapIncreases:0}];
 const original=P.roll(actions[0],0);
 assert.equal(rewrite(original,actions,[],B.defaults),original);
});
