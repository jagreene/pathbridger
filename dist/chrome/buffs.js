(function(root) {
  const defaults = [
    {id:'courageous-anthem',name:'Courageous Anthem',source:'https://2e.aonprd.com/Spells.aspx?ID=1763',type:'status',attack:1,damage:1,checks:0},
    {id:'bless',name:'Bless',source:'https://2e.aonprd.com/Spells.aspx?ID=1451',type:'status',attack:1,damage:0,checks:0}
  ];
  function link(value) {
    const url = new URL(value);
    const category = {'/Spells.aspx':'spell','/Feats.aspx':'feat','/Actions.aspx':'action'}[url.pathname];
    const id = url.searchParams.get('ID');
    if(url.origin !== 'https://2e.aonprd.com' || !category || !/^\d+$/.test(id || '')) throw Error('Use a 2e.aonprd.com spell, feat, or action link.');
    return {url:`https://2e.aonprd.com${url.pathname}?ID=${id}&NoRedirect=1`,id:`${category}-${id}`};
  }
  function validate(buff) {
    if(!buff || typeof buff.id!=='string' || typeof buff.name!=='string' || !buff.name.trim()) throw Error('Give the buff a name.');
    if(!['status','circumstance'].includes(buff.type)) throw Error('Choose status or circumstance.');
    for(const field of ['attack','damage','checks']) if(!Number.isInteger(buff[field]) || buff[field]<0 || buff[field]>20) throw Error('Bonuses must be whole numbers from 0 to 20.');
    if(buff.source) link(buff.source);
    return buff;
  }
  function totals(buffs) {
    const result = {attack:0,damage:0,checks:0};
    for(const field of Object.keys(result)) for(const type of ['status','circumstance']) result[field] += Math.max(0,...buffs.filter(b=>b.type===type).map(b=>b[field] || 0));
    return result;
  }
  function apply(action,buffs) {
    if(action.kind==='reference') return {...action};
    const bonus=totals(buffs), result={...action};
    if(Number.isFinite(action.attack)) result.buffBonus = action.mapIncreases === 0 ? bonus.checks : bonus.attack;
    if(action.damage && bonus.damage) result.damage = `${action.damage} + ${bonus.damage}`;
    return result;
  }
  // Match known formulas, rather than guessing at arbitrary hand-edited rolls.
  // Keep the original MAP stage even if earlier attacks have since been removed.
  function edits(text, actions, previous, next, core=root.Pathbridger) {
    const normalize = value => value.replace(/\s+/g,'').toLowerCase();
    const dice = /\[dice=([^\]\n]*)\]([^[]*)\[\/dice\]/gi;
    const replacements = new Map();
    for(const action of actions) for(const stage of [0,1,2]) {
      const before = [...core.roll(apply(action,previous),stage).matchAll(dice)];
      const after = [...core.roll(apply(action,next),stage).matchAll(dice)];
      before.forEach((match,index) => {
        const key=normalize(match[1])+'|'+normalize(match[2]);
        const value=after[index][2];
        // Ambiguous duplicate action names must not silently choose a formula.
        if(replacements.has(key) && replacements.get(key)!==value) replacements.set(key,null);
        else if(!replacements.has(key)) replacements.set(key,value);
      });
    }
    const result=[];
    let depth=0;
    const tokens=/\[quote(?:=[^\]]*)?\]|\[\/quote\]|\[dice=([^\]\n]*)\]([^[]*)\[\/dice\]/gi;
    for(const match of text.matchAll(tokens)) {
      if(/^\[quote/i.test(match[0])) {depth++;continue;}
      if(/^\[\/quote/i.test(match[0])) {depth=Math.max(0,depth-1);continue;}
      if(depth) continue;
      const value=replacements.get(normalize(match[1])+'|'+normalize(match[2]));
      if(value==null || normalize(value)===normalize(match[2])) continue;
      const start=match.index+match[0].indexOf(']')+1;
      result.push({start,end:start+match[2].length,text:value});
    }
    return result;
  }
  async function fromURL(value,fetcher=fetch) {
    const source=link(value);
    const url=new URL('https://elasticsearch.aonprd.com/aon/_search');
    url.searchParams.set('source',JSON.stringify({size:1,query:{ids:{values:[source.id]}}}));
    url.searchParams.set('source_content_type','application/json');
    const response=await fetcher(url.href,{credentials:'omit',signal:AbortSignal.timeout(15000)});
    if(!response.ok) throw Error(`Nethys returned HTTP ${response.status}.`);
    const record=(await response.json()).hits?.hits?.[0]?._source;
    if(!record || record.id!==source.id || typeof record.name!=='string') throw Error('No matching Nethys record found.');
    const name=record.name.toLowerCase(),text=String(record.text || '');
    let attack=0,damage=0,checks=0;
    const courage=['courageous anthem','inspire courage'].includes(name) && /\+1 status bonus to attack rolls, damage rolls/i.test(text);
    const bless=name==='bless' && /\+1 status bonus to attack rolls/i.test(text);
    const heroism=name==='heroism' && /\+1 status bonus to attack rolls/i.test(text) && /skill checks/i.test(text);
    if(courage) {attack=1;damage=1;} else if(bless) attack=1; else if(heroism) {attack=1;checks=1;}
    return {id:source.id,name:record.name,source:source.url,type:'status',attack,damage,checks,
      note:courage||bless||heroism ? 'Base-rank bonuses filled. Adjust for heightened/fortissimo effects. Defensive and conditional effects remain manual.' : 'Review the linked rules and enter applicable bonuses. No effects were inferred.'};
  }
  const api={defaults,link,validate,totals,apply,edits,fromURL};root.PathbridgerBuffs=api;
  if(typeof module!=='undefined') module.exports=api;
})(globalThis);
