const {test} = require('node:test');
const assert = require('node:assert/strict');
const p = require('../extension/core.js');
test('normal and agile MAP use current attack and cap at third', () => {
  const sword = {name:'Sword',attack:12,damage:'2d8+4'};
  assert.match(p.roll(sword,0),/1d20\+12/);
  assert.match(p.roll(sword,1),/1d20\+7/);
  assert.match(p.roll({...sword,agile:true},2),/1d20\+4/);
  assert.match(p.roll(sword,9),/1d20\+2/);
  assert.match(p.roll({...sword,map:[-3,-6]},1),/1d20\+9/);
});
test('negative modifiers and label injection are safe', () => {
 assert.equal(p.roll({name:'x[/dice]',attack:2},2),'[dice=x /dice ]1d20-8[/dice]');
 assert.equal(p.highlight('<img src=x onerror=alert(1)>[b]'), '&lt;img src=x onerror=alert(1)&gt;<span class="pb-tag">[b]</span>');
});
test('import only explicit bonuses, flags incomplete data', () => {
 const c = p.normalize({build:{name:'Hero',weapons:[{name:'Knife',attack:8,traits:['agile']},{name:'Unknown'}]}});
 assert.equal(c.actions.length,1); assert.equal(c.actions[0].agile,true); assert.equal(c.actions[0].damage,''); assert.ok(c.warnings.length);
 assert.throws(()=>p.normalize({}));
});
test('reject malformed action configuration', () => {
 assert.throws(()=>p.validateActions([{name:'Bad',attack:'12'}]));
 assert.throws(()=>p.validateActions([{name:'Bad',attack:12,damage:'[b]oops'}]));
 assert.throws(()=>p.validateActions([{name:'Bad',attack:12,map:[4,8]}]));
 assert.equal(p.validateActions([{name:'Sword',attack:12,damage:'2d8+4'}]).length,1);
});
test('message-derived MAP follows current weapon, edits, and cursor position', () => {
 const sword = {name:'Longsword',attack:12,damage:'1d8+4'};
 const knife = {name:'Knife',attack:12,agile:true};
 const actions = [sword,knife];
 const first = p.roll(sword,0);
 const second = p.roll(knife,p.attackCount(first,actions));
 assert.match(second,/1d20\+8/);
 const message = first + '\n' + second;
 assert.equal(p.attackCount(message,actions),2);
 assert.match(p.roll(sword,p.attackCount(message,actions)),/1d20\+2/);
 assert.equal(p.attackCount(message,actions,first.length),1);
 assert.equal(p.attackCount(message.slice(first.length),actions),1);
 assert.equal(p.attackCount('',actions),0);
});
test('manual attack actions count; prose, checks, damage, incomplete rolls and quotes do not', () => {
 const text = 'I might Strike, then Trip. [dice=Trip]1d20+8[/dice] [dice=Longsword damage]1d20[/dice] [dice=Perception]1d20+4[/dice] [quote=X][dice=Strike]1d20+9[/dice][/quote] [dice=Grapple]1d20+4[/dice] [dice=Strike]1d20';
 assert.equal(p.attackCount(text),2);
 assert.equal(p.attackCount('[quote][quote][dice=Strike]1d20[/dice][/quote][/quote][dice=Strike]1d20[/dice]'),1);
});
test('configured non-attacks and multiple MAP increases', () => {
 const actions = [{name:'Demoralize',attack:9,mapIncreases:0},{name:'Special attack',attack:12,mapIncreases:2}];
 assert.match(p.roll(actions[0],2),/1d20\+9/);
 assert.equal(p.attackCount(p.roll(actions[0],0)+p.roll(actions[1],0),actions),2);
 assert.throws(()=>p.validateActions([{name:'x',attack:1,mapIncreases:-1}]));
});
test('Synthetic export: agile hatchet and separate conditional Empowerment', () => {
 const c = p.normalize(require('../fixtures/synthetic-weapon.json'));
 p.validateActions(c.actions);
 assert.equal(c.name,'Test Adventurer');
 assert.equal(c.actions[0].damage,'1d6+4');
 assert.equal(c.actions[1].damage,'1d6+4+2');
 let message = '';
 for (const bonus of [13,9,5]) {
   const next = p.roll(c.actions[0],p.attackCount(message,c.actions));
   assert.ok(next.includes(`1d20+${bonus}`)); message += next + '\n';
 }
 assert.equal(p.attackCount(message,c.actions),3);
});
test('dice labels complete case-insensitively and consume empty paired tags', () => {
 const action = {name:'Exploit Vulnerability',attack:11,mapIncreases:0};
 for (const [text,cursor] of [['[Dice=',6],['[dice=]',6],['[DICE=ex][/DICE]',8],['[dice=ex]  [/dice]',8]]) {
   const context = p.completionContext(text,cursor);
   assert.ok(context);
   assert.equal(context.kind,'dice');
   const result = text.slice(0,context.index)+p.roll(action,2)+text.slice(context.end);
   assert.equal(result,'[dice=Exploit Vulnerability]1d20+11[/dice]');
 }
 assert.equal(p.completionContext('[dice=ex]1d20+5[/dice]',8),null);
 assert.equal(p.completionContext('[dice=ex]',6,8),null);
 assert.equal(p.completionContext('[dice=foo]1d20',14),null);
 assert.equal(p.completionContext('/exp',4).query,'exp');
 assert.equal(p.completionContext('https://exp',11),null);
});
test('dice completion preserves neighboring text and uses preceding strikes', () => {
 const sword = {name:'Sword',attack:14};
 const message = p.roll(sword,0)+'\n[dice=Sw][/dice]\nAfterward.';
 const cursor = message.indexOf('[dice=Sw]')+8;
 const context = p.completionContext(message,cursor);
 const output = message.slice(0,context.index)+p.roll(sword,p.attackCount(message,[sword],context.index))+message.slice(context.end);
 assert.ok(output.endsWith('[dice=Sword]1d20+9[/dice]\nAfterward.'));
});
test('class check import uses exported Charisma and rank, never MAP', () => {
 // Invented data, deliberately distinct from any real character export.
 const c = p.normalize({build:{name:'Synthetic scholar',level:5,abilities:{cha:18},lores:[['Esoteric',4]],specials:['Esoteric Lore','Exploit Vulnerability']}});
 p.validateActions(c.actions);
 const check = c.actions.find(a=>a.name==='Exploit Vulnerability');
 assert.equal(check.attack,13);
 assert.equal(check.mapIncreases,0);
 assert.equal(p.roll(check,2),'[dice=Exploit Vulnerability]1d20+13[/dice]');
 assert.equal(p.attackCount(p.roll(check,0),c.actions),0);
 assert.ok(c.actions.some(a=>a.name==='Esoteric Lore'));
 const incomplete = p.normalize({name:'Synthetic scholar',specials:['Exploit Vulnerability']});
 assert.equal(incomplete.actions.length,0);
 assert.ok(incomplete.warnings.some(w=>w.includes('missing level')));
 const unrelated = p.normalize({name:'Synthetic scholar',level:5,abilities:{cha:18},lores:[['Esoteric',4]]});
 assert.equal(unrelated.actions.length,0);
});

test('weapon completions label Strikes and recognize old labels for MAP', () => {
 const a={name:'+1 Test Axe (Empowerment)',agile:true,attack:13,damage:'1d6+6'};
 assert.equal(p.actionName(a),'Strike (+1 Test Axe (Empowerment))');
 const result=p.roll(a,0);
 assert.ok(result.startsWith('[dice=Strike (+1 Test Axe (Empowerment))]1d20+13[/dice]'));
 assert.equal(p.attackCount(result,[a]),1);
 assert.equal(p.attackCount('[dice=+1 Test Axe (Empowerment)]1d20+13[/dice]',[a]),1);
 assert.equal(p.actionName({...a,name:'Strike (Test Axe)'}),'Strike (Test Axe)');
 assert.equal(p.actionName({name:'Exploit Vulnerability',attack:13,mapIncreases:0}),'Exploit Vulnerability');
});

test('suggestions remain available just after an empty dice label', () => {
 const a={kind:'strike',name:'Test Hatchet',attack:13,agile:true};
 for(const text of ['[Dice=St]','[Dice=St][/dice]']) {
   const context=p.completionContext(text,9);
   assert.ok(context); assert.equal(context.query,'St');
   const result=text.slice(0,context.index)+p.roll(a,0)+text.slice(context.end);
   assert.equal(result,'[dice=Strike (Test Hatchet)]1d20+13[/dice]');
 }
 assert.equal(p.completionContext('[Dice=St]1d20+3[/dice]',9),null);
 assert.equal(p.completionContext('[Dice=St]1d20+3',9),null);
});

test('saving throw imports include attributes, proficiency, and worn resilient runes',()=>{
 const c=p.normalize({name:'Synthetic defender',level:6,abilities:{con:14,dex:18,wis:12},proficiencies:{fortitude:4,reflex:2,will:4},armor:[{worn:true,res:'resilient'},{worn:false,res:'major resilient'}]});
 assert.deepEqual(c.actions.filter(a=>a.checkType==='save').map(a=>a.attack),[13,13,12]);
 for(const a of c.actions) {assert.equal(a.mapIncreases,0);assert.equal(p.attackCount(p.roll(a,2),c.actions),0);}
});
test('prose tags close once with the caret inside, including paired brackets',()=>{
 for(const name of ['b','i','u','ooc','spoiler=Secret']) {
  const text='['+name+']',cursor=text.length-1,edit=p.closeTagEdit(text,cursor);
  const result=text.slice(0,edit.start)+edit.text+text.slice(edit.end);
  assert.equal(result,text+'[/'+name.split('=')[0]+']');assert.equal(edit.caret,text.length);
 }
 assert.equal(p.closeTagEdit('[b][/B]',2).text,']');
 assert.equal(p.closeTagEdit('[unknown]',8),null);
});
