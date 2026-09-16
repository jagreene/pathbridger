(() => {
 const $=id=>document.getElementById(id);
 let library=[], editing=null;
 const message=text=>$('buff-status').textContent=text;
 function fill(buff) {
   editing=buff.id; $('buff-name').value=buff.name; $('buff-url').value=buff.source||''; $('buff-type').value=buff.type;
   for(const k of ['attack','damage','checks']) $('buff-'+k).value=buff[k];
 }
 function render() {
   $('buff-list').replaceChildren();
   for(const buff of library) {
     const row=document.createElement('p'),label=document.createElement('span');
     label.textContent=`${buff.name}: +${buff.attack} attacks, +${buff.damage} damage, +${buff.checks} checks (${buff.type}) `;
     const edit=document.createElement('button');edit.textContent='Edit';edit.type='button';edit.onclick=()=>fill(buff);
     const remove=document.createElement('button');remove.textContent='Remove';remove.type='button';remove.onclick=async()=>{
       try {const next=library.filter(b=>b.id!==buff.id);await PathbridgerAPI.storage.local.set({buffs:next});library=next;render();message('Removed.');}catch(e){message(e.message);}
     };
     row.append(label,edit,remove);$('buff-list').append(row);
   }
 }
 PathbridgerAPI.storage.local.get('buffs').then(({buffs})=>{library=buffs ?? PathbridgerBuffs.defaults.map(b=>({...b}));render();}).catch(e=>message(e.message));
 $('buff-fetch').onclick=async()=>{
   $('buff-fetch').disabled=true;
   try {const buff=await PathbridgerBuffs.fromURL($('buff-url').value.trim());fill(buff);message(buff.note+' Choose Save buff when ready.');}
   catch(e){message(e.message);}finally{$('buff-fetch').disabled=false;}
 };
 $('buff-new').onclick=()=>{fill({id:crypto.randomUUID(),name:'',source:'',type:'status',attack:0,damage:0,checks:0});message('Enter a custom buff or paste a Nethys link.');};
 $('buff-save').onclick=async()=>{
   try {
     const buff=PathbridgerBuffs.validate({id:editing||crypto.randomUUID(),name:$('buff-name').value.trim(),source:$('buff-url').value.trim(),type:$('buff-type').value,attack:Number($('buff-attack').value),damage:Number($('buff-damage').value),checks:Number($('buff-checks').value)});
     const next=library.filter(b=>b.id!==buff.id);next.push(buff);await PathbridgerAPI.storage.local.set({buffs:next});library=next;editing=buff.id;render();message('Saved. Available in open editors under Buffs.');
   }catch(e){message(e.message);}
 };
})();
