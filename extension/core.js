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
      actions.push({name: String(name), attack: w.attack, agile: /\bagile\b/i.test(traits), damage: typeof damage === 'string' && /^[\ddD+\-\s]+$/.test(damage) ? damage : '', map: null});
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
    warnings.push('Verify attack bonuses and damage. Feats, spells, conditional bonuses, and special multi-attack actions are not inferred.');
    return {name: b.name, actions, warnings};
  }
  function validateActions(actions) {
    if (!Array.isArray(actions) || actions.length > 200) throw Error('Actions must be an array of at most 200 entries.');
    for (const a of actions) {
      if (!a || typeof a.name !== 'string' || !a.name.trim() || !Number.isFinite(a.attack)) throw Error('Each action needs a name and numeric attack bonus.');
      if (a.mapIncreases != null && (!Number.isInteger(a.mapIncreases) || a.mapIncreases < 0 || a.mapIncreases > 10)) throw Error('mapIncreases must be an integer from 0 to 10.');
      if (a.damage && (typeof a.damage !== 'string' || !/^(?:\d+[dD]\d+|\d+)(?:\s*[+\-]\s*(?:\d+[dD]\d+|\d+))*$/.test(a.damage))) throw Error(`Invalid damage formula for ${a.name}.`);
      if (a.map != null && (!Array.isArray(a.map) || a.map.length !== 2 || !a.map.every(n => Number.isFinite(n) && n <= 0))) throw Error('MAP override must be two non-positive numbers, for example [-3,-6].');
    }
    return actions;
  }
  // Read complete rolls before the insertion point. Never count prose mentions,
  // damage rolls, or quoted rolls as attacks.
  function attackCount(text, actions = [], cursor = text.length) {
    const names = new Map(actions.map(a => [label(a.name).trim().toLowerCase(), a]));
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
  function roll(a, stage) {
    const penalties = a.map || (a.agile ? [-4, -8] : [-5, -10]);
    const penalty = a.mapIncreases === 0 || stage <= 0 ? 0 : penalties[Math.min(2, stage) - 1];
    return `[dice=${label(a.name)}]1d20${signed(a.attack + penalty)}[/dice]` + (a.damage ? ` [dice=${label(a.name)} damage]${a.damage}[/dice]` : '');
  }
  const api = {tags, escape, highlight, normalize, validateActions, attackCount, roll};
  root.Pathbridger = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
