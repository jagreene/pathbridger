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
