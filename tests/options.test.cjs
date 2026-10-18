const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function settings() {
  const elements=new Map(), pending=[];
  let storageChanged;
  function element(id) {
    if(!elements.has(id)) elements.set(id,{
      value:'',textContent:'',disabled:false,files:[],listeners:{},
      addEventListener(name,fn){this.listeners[name]=fn;},
      replaceChildren(){},add(){},setAttribute(){},removeAttribute(){},
      dispatch(name){return this.listeners[name]?.();}
    });
    return elements.get(id);
  }
  const library={version:1,activeId:'hero',records:[{id:'hero',name:'Saved Hero',actions:[],revision:1}],candidates:[]};
  const context=vm.createContext({
    document:{getElementById:element},Option:function(){},URL,TextEncoder,
    setTimeout,clearTimeout,AbortController,structuredClone,fetch,
    PathbridgerAPI:{runtime:{sendMessage:()=>new Promise(resolve=>pending.push(()=>resolve({library:structuredClone(library)})))},
      storage:{onChanged:{addListener:fn=>{storageChanged=fn;}}}}
  });
  vm.runInContext(fs.readFileSync('extension/options.js','utf8'),context);
  return {element,resolve:()=>pending.shift()(),refresh:()=>storageChanged({characterLibrary:{newValue:library}},'local')};
}
for(const mode of ['paste','file'])test(`pending storage refresh cannot erase ${mode} JSON`,async()=>{
  const ui=settings();ui.resolve();await tick();
  assert.equal(ui.element('name').value,'Saved Hero');
  ui.refresh();
  const json='{"build":{"name":"New Hero","weapons":[]}}';
  if(mode==='paste') {
    ui.element('source').value=json;ui.element('source').dispatch('input');
  }else {
    ui.element('file').files=[{size:json.length,text:async()=>json}];
    await ui.element('file').dispatch('change');
  }
  ui.resolve();await tick();
  assert.equal(ui.element('source').value,json);
  assert.equal(ui.element('import').disabled,false);
});
test('initial library load preserves JSON pasted before it finishes',async()=>{
  const ui=settings();ui.element('source').value='pasted JSON';ui.element('source').dispatch('input');
  ui.resolve();await tick();
  assert.equal(ui.element('source').value,'pasted JSON');
  assert.equal(ui.element('import').disabled,false);
});
test('explicit reload discards old edits but preserves edits made while loading',async()=>{
  const ui=settings();ui.resolve();await tick();
  ui.element('source').value='old';ui.element('source').dispatch('input');
  ui.element('reload-character').onclick();ui.resolve();await tick();
  assert.equal(ui.element('source').value,'');
  ui.element('reload-character').onclick();
  ui.element('source').value='new';ui.element('source').dispatch('input');
  ui.resolve();await tick();
  assert.equal(ui.element('source').value,'new');
});
