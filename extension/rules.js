/* Public AoN search adapter. Never executes remote markup or scripts. */
(function(root) {
  const P = root.Pathbridger || require('./core.js');
  const key = s => String(s).normalize('NFKC').replace(/[’‘]/g,"'").trim().toLowerCase();
  function requests(build) {
    const out = [];
    const add = (name,kind,extra={}) => {if(typeof name==='string' && name.trim()) out.push({name,kind,...extra});};
    for(const w of build.weapons || []) add(w.name,'weapon',{weapon:w});
    for(const name of build.specials || []) add(name,'ability');
    for(const feat of build.feats || []) add(feat[0],'ability');
    for(const caster of build.spellCasters || []) {
      for(const group of [...(caster.spells || []),...(caster.prepared || [])]) {
        for(const name of group.list || []) add(name,'spell',{caster,rank:group.spellLevel});
      }
    }
    const seen = new Set();
    return out.filter(r => {const id = `${r.kind}:${key(r.name)}:${r.caster?.name || ''}:${r.rank ?? ''}`; if(seen.has(id)) return false; seen.add(id); return true;});
  }
  function choose(hits, request, edition) {
    let candidates = hits.map(h=>h._source).filter(s=>s && key(s.name)===key(request.name) && !s.exclude_from_search);
    const categories = request.kind==='ability' ? ['action','feat','class-feature'] : [request.kind];
    candidates = candidates.filter(s=>categories.includes(s.category));
    candidates = candidates.filter(s=>edition==='legacy' ? !s.legacy_id?.length : !s.remaster_id?.length);
    if(candidates.length !== 1) throw Error(candidates.length ? 'Multiple exact matches; manual selection needed.' : 'No exact match for this rules edition.');
    return candidates[0];
  }
  function sourceURL(path) {
    const url = new URL(path,'https://2e.aonprd.com');
    if(url.origin!=='https://2e.aonprd.com' || !/^\/[A-Za-z]+\.aspx$/.test(url.pathname)) throw Error('Unexpected rules link.');
    url.searchParams.set('NoRedirect','1');
    return url.href;
  }
  async function lookup(request, edition, cache, fetcher=fetch) {
    const id = `${edition}:${request.kind}:${key(request.name)}`;
    if(cache[id] && Date.now()-cache[id].time < 7*86400000) return cache[id].record;
    const query = {size:100,query:{match_phrase:{name:request.name}}};
    const url = new URL('https://elasticsearch.aonprd.com/aon/_search');
    url.searchParams.set('source',JSON.stringify(query)); url.searchParams.set('source_content_type','application/json');
    const response = await fetcher(url.href,{credentials:'omit',signal:AbortSignal.timeout(15000)});
    if(!response.ok) throw Error(`Nethys returned HTTP ${response.status}.`);
    const result = await response.json();
    if(!Array.isArray(result.hits?.hits)) throw Error('Nethys search format changed.');
    const record = choose(result.hits.hits,request,edition);
    sourceURL(record.url);
    cache[id] = {time:Date.now(),record};
    return record;
  }
  function spellBonus(build,caster) {
    const score = build.abilities?.[caster?.ability];
    if(!Number.isInteger(build.level) || !Number.isFinite(score) || ![2,4,6,8].includes(caster?.proficiency)) return null;
    return build.level + caster.proficiency + Math.floor((score-10)/2);
  }
  function compile(record, request, build, existing) {
    const source = sourceURL(record.url), traits = (record.trait || []).map(key);
    const meta = {source, rulesId:record.id, actionCost:record.actions || '', traits};
    if(request.kind==='weapon') return {weapon:request.weapon, ...meta, agile:traits.includes('agile')};
    if(existing) return {...existing,...meta};
    const name = request.kind==='spell' ? `${request.name} (${request.caster.name}, rank ${traits.includes('cantrip') ? Math.ceil(build.level/2) : request.rank})` : request.name;
    const reference = {...meta,name,kind:'reference',mapIncreases:0,note:'Rules reference — resolve effects and any rolls manually.'};
    if(request.kind!=='spell') return reference;
    const bonus = spellBonus(build,request.caster);
    if(bonus===null) return {...reference,note:'Missing spellcasting statistics; resolve manually.'};
    // Simple attack spells can use the caster's bonus, but damage and special
    // sequences need a dedicated adapter. A mention of another attack is not enough.
    const text = String(record.text || '');
    if(traits.includes('attack') && /make a (?:ranged |melee )?spell attack roll/i.test(text) && !/multiple attack|two spell attack|three spell attack/i.test(text)) {
      return {...meta,name,attack:bonus,mapIncreases:1,note:'Base spell attack only. Resolve damage, heightening, and conditional modifiers from the rules.'};
    }
    // Electric Arc has different legacy/remaster base damage. Parse the live
    // rule wording and require the known heightening form instead of guessing.
    if(key(record.name)==='electric arc' && traits.includes('cantrip')) {
      const remaster = /Each target takes (\d+)d(\d+) electricity damage/i.exec(text);
      const legacy = /damage equal to (\d+)d(\d+) plus your spellcasting ability modifier/i.exec(text);
      const heighten = /Heightened \(\+1\) The damage increases by (\d+)d(\d+)/i.exec(text);
      const base = remaster || legacy;
      const rank = Math.ceil(build.level/2);
      if(base && heighten && base[2]===heighten[2] && key(record.saving_throw)==='basic reflex' && rank>=1) {
        const count = Number(base[1]) + (rank-1)*Number(heighten[1]);
        const modifier = legacy ? Math.floor((build.abilities[request.caster.ability]-10)/2) : 0;
        return {...meta,name,kind:'save',mapIncreases:0,damage:`${count}d${base[2]}${modifier ? (modifier>0?'+':'')+modifier : ''}`,dc:10+bonus,save:'basic Reflex',note:'Base DC; apply temporary/item modifiers as needed.'};
      }
    }
    return reference;
  }
  async function enrich(data, character, edition, cache, progress=()=>{}, fetcher=fetch) {
    const build = data.build || data;
    const list = requests(build);
    const actions = character.actions.map(a=>({...a})), reports=[];
    for(let i=0;i<Math.min(list.length,150);i++) {
      const request = list[i]; progress(`${i+1}/${list.length}: ${request.name}`);
      try {
        const record = await lookup(request,edition,cache,fetcher);
        const existing = actions.find(a=>key(a.name)===key(request.name));
        const action = compile(record,request,build,existing);
        if(request.kind==='weapon') {
          const display = request.weapon.display || request.weapon.name;
          for(const a of actions) if(a.name===display || a.name===`${display} (Empowerment)`) Object.assign(a,{kind:'strike',agile:action.agile,source:action.source,traits:action.traits,actionCost:'Single Action',note:'Strike; apply conditional weapon effects separately.'});
        } else if(existing) Object.assign(existing,action);
        else actions.push(action);
        reports.push(`${request.name}: ${action.kind==='reference' ? 'rules reference; manual resolution' : 'matched'} (${record.id}).`);
      } catch(error) { reports.push(`${request.name}: ${error.message}`); }
      // Keep import traffic modest; cached entries remain available offline.
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    if(list.length>150) reports.push('Lookup limit reached (150 entries). Remaining names need manual review.');
    return {...character,actions,reports};
  }
  // Save refreshes reuse previously downloaded rules without new network access.
  function enrichCached(data, character, edition, cache) {
    const actions=character.actions.map(a=>({...a})), reports=[];
    for(const request of requests(data.build || data).slice(0,150)) {
      const entry=cache[`${edition}:${request.kind}:${key(request.name)}`];
      if(!entry) {if(request.kind==='spell')reports.push(`Import with Nethys enabled to resolve ${request.name}.`);continue;}
      try {
        const existing=actions.find(a=>key(a.name)===key(request.name));
        const action=compile(entry.record,request,data.build||data,existing);
        if(request.kind==='weapon') {
          const display=request.weapon.display||request.weapon.name;
          for(const a of actions)if(a.name===display||a.name===`${display} (Empowerment)`)Object.assign(a,{kind:'strike',agile:action.agile,source:action.source,traits:action.traits,actionCost:'Single Action',note:'Strike; apply conditional weapon effects separately.'});
        } else if(existing)Object.assign(existing,action);else actions.push(action);
      }catch(error){reports.push(`${request.name}: ${error.message}`);}
    }
    return {...character,actions,reports};
  }
  const api={requests,choose,sourceURL,lookup,compile,enrich,enrichCached};
 root.PathbridgerRules=api;
  if(typeof module!=='undefined') module.exports=api;
})(globalThis);
