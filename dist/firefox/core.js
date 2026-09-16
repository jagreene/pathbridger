/* Shared pure functions; also loaded by the dependency-free Node tests. */
(function (root) {
  const tags = ['b', 'i', 'u', 's', 'ooc', 'dice', 'spoiler', 'quote', 'url', 'bigger', 'smaller', 'list', '*'];
  const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const label = s => String(s).replace(/[\[\]\r\n]/g, ' ').slice(0, 120);
  const signed = n => n < 0 ? String(n) : `+${n}`;
  function highlight(s) {
    return s.split(/(\[\/?[a-z*]+(?:=[^\]\n]*)?\])/gi).map(part => {
      const match = part.match(/^\[\/?([a-z*]+)/i);
      return match && tags.includes(match[1].toLowerCase()) ? `<span class="pb-tag">${escape(part)}</span>` : escape(part);
    }).join('');
  }
  function normalize(data) {
    const b = data.build || data;
    if (!b || typeof b !== 'object' || typeof b.name !== 'string') throw Error('Expected a Pathbuilder JSON export with a character name.');
    const actions = [], warnings = [];
    for (const w of b.weapons || []) {
      const name = w.display || w.name;
      if (!name || !Number.isFinite(w.attack)) { warnings.push(`Skipped ${name || 'weapon'}: no numeric attack bonus.`); continue; }
      const knownTraits = {hatchet: 'agile sweep thrown'};
      const traits = Array.isArray(w.traits) ? w.traits.join(' ') : String(w.traits || knownTraits[String(w.name).toLowerCase()] || '');
      let damage = w.damage;
      const strikingDice = {'':1, striking:2, 'greater striking':3, 'major striking':4};
      const dice = strikingDice[String(w.str ?? '').toLowerCase()];
      if (!damage && /^d(4|6|8|10|12)$/.test(w.die) && Number.isFinite(w.damageBonus) && dice && !w.increasedDice) {
        damage = `${dice}${w.die}${signed(w.damageBonus)}`;
      }
      // Never infer striking runes, abilities, or proficiency from incomplete exports.
      actions.push({kind:'strike', name: String(name), attack: w.attack, agile: /\bagile\b/i.test(traits), damage: typeof damage === 'string' && /^[\ddD+\-\s]+$/.test(damage) ? damage : '', map: null});
      const base = actions[actions.length - 1];
      for (const extra of w.extraDamage || []) {
        const empowerment = /^\+(\d+) Empowerment$/.exec(extra);
        if (empowerment && base.damage) actions.push({...base, name: `${name} (Empowerment)`, damage: `${base.damage}+${empowerment[1]}`});
        else warnings.push(`${name}: additional damage needs manual review: ${extra}`);
      }
      if ((w.extraDamage || []).length) warnings.push(`${name}: Empowerment is a separate completion; use it only when its requirements are met. Other conditional effects remain manual.`);
      if (!traits) warnings.push(`${name}: verify Agile; this export has no traits.`);
    }
    if (!actions.length) warnings.push('No usable weapon attacks found. Add actions manually below.');
    for (const [name,stat,ability] of [['Fortitude','fortitude','con'],['Reflex','reflex','dex'],['Will','will','wis']]) {
      const rank=b.proficiencies?.[stat], score=b.abilities?.[ability];
      if(Number.isInteger(b.level) && b.level>0 && [0,2,4,6,8].includes(rank) && Number.isFinite(score)) {
        actions.push({name:`${name} save`,attack:(rank ? b.level+rank : 0)+Math.floor((score-10)/2)+Math.max(0,...(b.armor || []).filter(a=>a.worn).map(a=>({'resilient':1,'greater resilient':2,'major resilient':3}[String(a.res || '').toLowerCase()] || 0))),mapIncreases:0,checkType:'save'});
      }
    }
    if(actions.some(a=>a.checkType==='save')) warnings.push('Save bonuses use exported proficiency, level, and ability scores. Recognized worn resilient runes are included. Other item and conditional modifiers need review.');
    const hasSpecial = name => (b.specials || []).includes(name);
    const lore = (b.lores || []).find(entry => Array.isArray(entry) && /^esoteric$/i.test(entry[0]));
    if (hasSpecial('Esoteric Lore') || hasSpecial('Exploit Vulnerability')) {
      if (Number.isInteger(b.level) && b.level > 0 && Number.isFinite(b.abilities?.cha) && lore && [2,4,6,8].includes(lore[1])) {
        const bonus = b.level + lore[1] + Math.floor((b.abilities.cha - 10) / 2);
        actions.push({name:'Esoteric Lore', attack:bonus, mapIncreases:0});
        if (hasSpecial('Exploit Vulnerability')) actions.push({name:'Exploit Vulnerability', attack:bonus, mapIncreases:0});
        warnings.push('Esoteric Lore checks use level + exported proficiency + Charisma. Review item, temporary, and variant-rule modifiers.');
      } else warnings.push('Esoteric Lore / Exploit Vulnerability: missing level, Charisma score, or Lore proficiency; add the check manually.');
    }
    warnings.push('Verify attack bonuses and damage. Feats, spells, conditional bonuses, and special multi-attack actions are not inferred.');
    return {name: b.name, actions, warnings};
  }
  function validateActions(actions) {
    if (!Array.isArray(actions) || actions.length > 200) throw Error('Actions must be an array of at most 200 entries.');
    for (const a of actions) {
      if (!a || typeof a.name !== 'string' || !a.name.trim() || (!['reference','save'].includes(a.kind) && !Number.isFinite(a.attack))) throw Error('Each action needs a name and numeric attack bonus.');
      if (a.kind === 'reference' && (!/^https:\/\/2e\.aonprd\.com\/[A-Za-z]+\.aspx\?[^\s\[\]]+$/.test(a.source || '') || a.mapIncreases !== 0)) throw Error('References require a Nethys URL and no MAP.');
      if (a.kind === 'save' && (!Number.isFinite(a.dc) || !a.damage || !['basic Reflex','basic Fortitude','basic Will','Reflex','Fortitude','Will'].includes(a.save) || a.mapIncreases !== 0)) throw Error('Save spells require damage, DC, defense, and no MAP.');
      if (a.mapIncreases != null && (!Number.isInteger(a.mapIncreases) || a.mapIncreases < 0 || a.mapIncreases > 10)) throw Error('mapIncreases must be an integer from 0 to 10.');
      if (a.damage && (typeof a.damage !== 'string' || !/^(?:\d+[dD]\d+|\d+)(?:\s*[+\-]\s*(?:\d+[dD]\d+|\d+))*$/.test(a.damage))) throw Error(`Invalid damage formula for ${a.name}.`);
      if (a.map != null && (!Array.isArray(a.map) || a.map.length !== 2 || !a.map.every(n => Number.isFinite(n) && n <= 0))) throw Error('MAP override must be two non-positive numbers, for example [-3,-6].');
    }
    return actions;
  }
  // Read complete rolls before the insertion point. Never count prose mentions,
  // damage rolls, or quoted rolls as attacks.
  function attackCount(text, actions = [], cursor = text.length) {
    const names = new Map(actions.flatMap(a => [a.name, actionName(a)].map(name => [label(name).trim().toLowerCase(), a])));
    const tokens = /\[quote(?:=[^\]]*)?\]|\[\/quote\]|\[dice(?:=([^\]\n]*))?\]([^[]*)\[\/dice\]/gi;
    let depth = 0, count = 0;
    for (const m of text.slice(0, cursor).matchAll(tokens)) {
      if (/^\[quote/i.test(m[0])) { depth++; continue; }
      if (/^\[\/quote/i.test(m[0])) { depth = Math.max(0, depth - 1); continue; }
      if (depth || !/\b1d20\b/i.test(m[2] || '')) continue;
      const name = (m[1] || '').trim().toLowerCase();
      const action = names.get(name);
      if (action) { count += action.mapIncreases ?? 1; continue; }
      // Explicit attack labels support hand-written Paizo rolls too.
      if (!/\bdamage\b/.test(name) && /^(?:strike|attack|trip|grapple|shove|disarm|reposition|escape|spell attack)(?:$|\s|:)/.test(name)) count++;
    }
    return count;
  }
  // A completion owns only an unfinished/empty dice block, never a filled roll.
  function completionContext(text, cursor, end = cursor) {
    if (cursor !== end) return null;
    const before = text.slice(0, cursor);
    // The user can finish the label or move over the auto-paired bracket.
    // Keep suggestions available while the dice body is still empty.
    if (/\[dice=[^\[\]\r\n]*\]$/i.test(before)) {
      const tail = text.slice(cursor);
      if (tail.trim() && !/^\s*\[\/dice\]/i.test(tail)) return null;
      return completionContext(text, cursor - 1);
    }
    const dice = /\[dice=([^\[\]\r\n]*)$/i.exec(before);
    if (dice) {
      const tail = text.slice(cursor);
      const remaining = /^[^\[\]\r\n]*\]/.exec(tail);
      let finish = cursor;
      if (remaining) {
        finish += remaining[0].length;
        const body = text.slice(finish);
        const closing = /^\s*\[\/dice\]/i.exec(body);
        if (closing) finish += closing[0].length;
        else if (/^[^\[]*\[\/dice\]/i.test(body)) return null;
      }
      return {index:dice.index, end:finish, query:dice[1], kind:'dice'};
    }
    const slash = /\/[\w '\-]*$/.exec(before);
    if (!slash || (slash.index > 0 && !/\s/.test(before[slash.index-1]))) return null;
    return {index:slash.index, end:cursor, query:slash[0].slice(1), kind:'slash'};
  }
  function closeTagEdit(text,cursor) {
    const match=/\[([a-z]+)(?:=[^\]\n]*)?$/i.exec(text.slice(0,cursor));
    if(!match || !tags.includes(match[1].toLowerCase())) return null;
    const end=cursor+(text[cursor]===']' ? 1 : 0), closing=`[/${match[1]}]`;
    return {start:cursor,end,text:']'+(text.slice(end,end+closing.length).toLowerCase()===closing.toLowerCase()?'':closing),caret:cursor+1};
  }
  function actionName(a) {
    // Older imports predate kind:'strike'; they explicitly stored agile on weapons.
    const weapon = a.kind === 'strike' || (!a.kind && typeof a.agile === 'boolean' && a.mapIncreases !== 0);
    return weapon && !/^Strike \(/i.test(a.name) ? `Strike (${a.name})` : a.name;
  }
  function roll(a, stage) {
    if (a.kind === 'reference') return `[ooc][url=${a.source}]${label(actionName(a))}[/url] (resolve manually)[/ooc]`;
    if (a.kind === 'save') return `[ooc]${label(actionName(a))}: DC ${a.dc} ${a.save}[/ooc] [dice=${label(actionName(a))} damage]${a.damage}[/dice]`;
    const penalties = a.map || (a.agile ? [-4, -8] : [-5, -10]);
    const penalty = a.mapIncreases === 0 || stage <= 0 ? 0 : penalties[Math.min(2, stage) - 1];
    return `[dice=${label(actionName(a))}]1d20${signed(a.attack + penalty)}${a.buffBonus ? ` + ${a.buffBonus}` : ''}[/dice]` + (a.damage ? `\n[dice=${label(actionName(a))} damage]${a.damage}[/dice]` : '');
  }
  const api = {tags, escape, highlight, normalize, validateActions, attackCount, completionContext, closeTagEdit, actionName, roll};
  root.Pathbridger = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
