const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const forum = require('../extension/forum.js');
const page = 'https://paizo.com/threads/rzs123?Game';
const feed = 'https://paizo.com/threads/rzs123&xml=atom?Game';
const entry = (id, published = 100) => ({id, published, url:`${page}#${id}`, title:'A post'});

test('scopes normalize Paizo pagination, hosts and feeds without mixing campaign tabs', () => {
  assert.equal(forum.scope('https://www.paizo.com/threads/rzs123&page=3?Game#100'), forum.scope(feed));
  assert.equal(forum.scope('https://paizo.com/community/forums/paizo/posts&xml=atom'), '/community/forums/paizo');
  assert.equal(forum.scope('https://paizo.com/campaigns/game/discussion&page=2'), '/campaigns/game/discussion');
  for(const url of ['http://paizo.com/threads/x','https://paizo.com.evil.test/threads/x','https://evil.test/threads/x','https://user@paizo.com/threads/x','https://paizo.com:9000/threads/x','https://paizo.com/store']) assert.equal(forum.scope(url),null);
});
test('first fetch is a quiet baseline; new posts notify once, edits and old items do not', () => {
  const first = forum.advance(null,[entry('1'),entry('2',200)]);
  assert.equal(first.fresh.length,0);
  const second = forum.advance(first.state,[entry('3',300),entry('2',400),entry('1'),entry('old',50)]);
  assert.deepEqual(second.fresh.map(e => e.id),['3']);
  assert.equal(forum.advance(second.state,[entry('3',300),entry('2',400)]).fresh.length,0);
});
test('empty baseline, equal timestamps and feeds without dates still detect additions', () => {
  const empty = forum.advance(null,[]);
  assert.equal(forum.advance(empty.state,[entry('1')]).fresh.length,1);
  const first = forum.advance(null,[entry('1')]);
  assert.deepEqual(forum.advance(first.state,[entry('2'),entry('3',0)]).fresh.map(e => e.id),['2','3']);
});
test('feed discovery chooses only the matching campaign tab and uses the loaded origin', () => {
  const links = ['gameplay','recruiting'].map(tab => ({type:'application/atom+xml',title:tab,getAttribute:() => `https://paizo.com/campaigns/game/${tab}&xml=atom`}));
  const document = {querySelectorAll:() => links};
  assert.equal(forum.discover(document,'https://www.paizo.com/campaigns/game/recruiting&page=3').url,'https://www.paizo.com/campaigns/game/recruiting&xml=atom');
  assert.equal(forum.discover(document,page),null);
});

function background(browser = 'firefox') {
  const listeners = {}; const alerts = [], opened = [];
  let session = {}, settings = {}, fail = false;
  const api = {
    runtime:{id:'extension',getURL:path => `extension://${path}`,onMessage:{addListener:fn => listeners.message = fn}},
    notifications:{
      onClicked:{addListener:fn => listeners.click = fn},
      create:async (...args) => {if(fail) throw Error('Notifications denied'); alerts.push(args.slice(0,2)); args[2]?.(args[0]); return args[0];},
      clear:async (id, callback) => {callback?.(true); return true;}
    },
    tabs:{create:async value => {opened.push(value);}},
    storage:{local:{get:async () => structuredClone(settings)}, session:{get:async () => structuredClone(session),set:async value => {session = structuredClone(value);}}}
  };
  function start() {
    const context = vm.createContext({[browser === 'firefox' ? 'browser' : 'chrome']:api,URL});
    for(const file of ['api.js','forum.js','forum-background.js']) vm.runInContext(fs.readFileSync(`extension/${file}`,'utf8'),context);
  }
  start();
  const sender = {id:'extension',frameId:0,tab:{id:1},url:page};
  const message = {type:'forum-new-posts',feed,title:'Game',entries:[entry('2')]};
  const send = (m = message, s = sender) => new Promise(resolve => {
    if(listeners.message(m,s,resolve) !== true) resolve(undefined);
  });
  return {send, sender, message, alerts, opened, listeners, restart:start,setSettings:value => {settings = {forumNotifications:value};},fail:() => {fail = true;}};
}
for(const browser of ['chrome','firefox']) {
  test(`${browser}: concurrent tabs notify once and deduplication survives worker restart`, async () => {
    const b = background(browser);
    await Promise.all([b.send(),b.send()]);
    assert.equal(b.alerts.length,1);
    b.restart(); await b.send(); assert.equal(b.alerts.length,1);
    b.listeners.click(b.alerts[0][0]);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(b.opened[0].url,entry('2').url);
  });
}
test('notification bridge rejects other sites, subframes, mismatched feeds and unsafe links', async () => {
  const b = background();
  for(const sender of [{...b.sender,url:'https://evil.test/threads/rzs123'}, {...b.sender,id:'other'}, {...b.sender,frameId:1}]) await b.send(b.message,sender);
  await b.send({...b.message,feed:'https://paizo.com/threads/other&xml=atom'});
  await b.send({...b.message,entries:[{...entry('2'),url:'javascript:alert(1)'}]});
  await b.send({...b.message,entries:[{...entry('2'),url:'https://paizo.com/threads/other#2'}]});
  assert.equal(b.alerts.length,0);
});
test('notification settings suppress alerts and denied notifications return a handled error', async () => {
  const b = background();
  b.setSettings({desktop:false}); await b.send(); assert.equal(b.alerts.length,0);
  b.setSettings({enabled:false}); await b.send(); assert.equal(b.alerts.length,0);
  b.setSettings({}); b.fail(); assert.match((await b.send()).error,/denied/);
});
