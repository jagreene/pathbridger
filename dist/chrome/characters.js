/* Character storage is mutated only by the background queue. */
(function(root) {
  const MAX_BYTES = 1500000;
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  function sourceKey(source) {
    if (!object(source) || !['local','gdrive'].includes(source.mode) ||
        typeof source.saveId !== 'string' || !/^[\w-]{1,200}$/.test(source.saveId) ||
        source.scope !== (source.mode === 'local' ? 'pathbuilder2e_db' : 'drive')) throw Error('Invalid Pathbuilder save identity.');
    return JSON.stringify([source.mode, source.scope, source.saveId]);
  }
  function snapshot(input) {
    sourceKey(input.source);
    if (typeof input.payload !== 'string' || input.payload.length > MAX_BYTES || new TextEncoder().encode(input.payload).length > MAX_BYTES) throw Error('Save is too large to sync (limit 1.5 MB).');
    const data = JSON.parse(input.payload);
    // These are distinct, observed serializers in Pathbuilder web v109g.
    const character = input.source.mode === 'gdrive' ? data?.characterData : data;
    if (!object(character) || typeof character.characterName !== 'string' || !character.characterName.trim() || character.characterName.length > 200) throw Error('Unsupported Pathbuilder save format.');
    if ((character.isStarbuilderCharacter === true || character.starbuilderCharacter === true)) throw Error('Starbuilder saves are not supported.');
    if (!Number.isFinite(input.startedAt) || input.startedAt <= 0) throw Error('Invalid save timestamp.');
    return {source: {mode:input.source.mode, scope:input.source.scope, saveId:input.source.saveId}, name:character.characterName, payload:input.payload, startedAt:input.startedAt};
  }
  function migrate(state, uuid) {
    if (state.characterLibrary?.version === 1) return state.characterLibrary;
    const records = [];
    if (state.character?.name) records.push({id:uuid(), name:state.character.name, actions:state.character.actions || [], revision:0});
    return {version:1, records, activeId:records[0]?.id || null, candidates:[]};
  }
  function record(library, id) {
    const found = library.records.find(c => c.id === id);
    if (!found) throw Error('Character no longer exists. Reload settings.');
    return found;
  }
  function applySave(library, incoming, now, uuid = () => crypto.randomUUID()) {
    const key = sourceKey(incoming.source);
    let linked = library.records.find(c => c.source && sourceKey(c.source) === key);
    if (!linked) {
      if (library.records.length >= 50) throw Error('Maximum 50 saved characters.');
      linked = {id:uuid(), name:incoming.name, source:incoming.source, actions:[], generatedActions:[], revision:0};
      library.records.push(linked);
      if (!library.activeId) library.activeId = linked.id;
    }
    library.candidates = library.candidates.filter(c => sourceKey(c.source) !== key);
    if (linked.lastSave?.startedAt >= incoming.startedAt) return 'ignored';
    const changed = linked.lastSave?.payload !== incoming.payload;
    linked.lastSave = {...incoming, savedAt:now};
    linked.name = incoming.name;
    // A successful Pathbuilder save is the clearest signal of the character
    // the player is currently using, so make it immediately available on Paizo.
    library.activeId = linked.id;
    if (changed) linked.actionsNeedReview = true;
    linked.revision++;
    linked.pendingExportRevision=linked.revision;
    return 'saved';
  }
  // Three-way merge: refresh generated fields, retain explicit user changes and
  // deletions. Actions unknown to the importer remain custom actions.
  function mergeActions(previous, current, next) {
    const id=a=>a.name;
    const old=new Map(previous.map(a=>[id(a),a])), fresh=new Map(next.map(a=>[id(a),a]));
    if(old.size!==previous.length||fresh.size!==next.length||new Set(current.map(id)).size!==current.length)throw Error('Duplicate action names need manual review before automatic refresh.');
    const result=[];let conflicts=0;
    for(const action of current) {
      const key=id(action),base=old.get(key),updated=fresh.get(key);
      if(!base) {result.push(action);if(updated){fresh.delete(key);conflicts++;}continue;}
      if(!updated) {
        if(JSON.stringify(action)!==JSON.stringify(base)){result.push(action);conflicts++;}
        continue;
      }
      const merged={...updated};
      for(const field of new Set([...Object.keys(base),...Object.keys(action)])) {
        if(JSON.stringify(action[field])!==JSON.stringify(base[field])) {
          if(Object.hasOwn(action,field))merged[field]=action[field];else delete merged[field];
        }
      }
      result.push(merged);fresh.delete(key);
    }
    // A generated action missing from current was explicitly deleted by the user.
    for(const [key,action] of fresh)if(!old.has(key))result.push(action);
    return {actions:result,conflicts};
  }
  function applyExport(library,message,core,rules,proof,cache,now) {
    const key=sourceKey(message.source);
    const linked=library.records.find(c=>c.source&&sourceKey(c.source)===key);
    if(!linked?.lastSave || linked.lastSave.startedAt!==message.startedAt || linked.pendingExportRevision!==linked.revision)return 'ignored';
    if(message.error) {
      linked.syncError=String(message.error).slice(0,300);linked.actionsNeedReview=true;linked.revision++;return 'review';
    }
    const data=proof.verify(linked.lastSave,message);
    let generated=core.normalize(data);
    const edition=linked.rulesEdition||((JSON.parse(linked.lastSave.payload).characterData||JSON.parse(linked.lastSave.payload)).remastered===false?'legacy':'remaster');
    if(linked.useNethys!==false)generated=rules.enrichCached(data,generated,edition,cache);
    core.validateActions(generated.actions);
    let previous=linked.generatedActions;
    if(!previous&&linked.importedBuild) {
      let base=core.normalize(linked.importedBuild);
      if(linked.useNethys!==false)base=rules.enrichCached(linked.importedBuild,base,edition,cache);
      previous=base.actions;
    }
    // A missing cached spell rule cannot justify deleting its last good roll.
    // Keep it (with the review warning) if that spell is still in this build.
    if(generated.reports?.length && previous) {
      const spells=rules.requests(data.build).filter(r=>r.kind==='spell');
      for(const action of previous) {
        if(!generated.actions.some(a=>a.name===action.name) && spells.some(r=>action.name.startsWith(`${r.name} (${r.caster.name}, rank `)))generated.actions.push(action);
      }
    }
    const merged=mergeActions(previous||[],linked.actions,generated.actions);
    core.validateActions(merged.actions);
    linked.actions=merged.actions;linked.generatedActions=generated.actions;
    linked.importedBuild=data;linked.calculatedAt=now;linked.calculatedFor=message.startedAt;
    linked.syncError=null;
    linked.syncWarnings=[...(generated.reports||[])];
    if(merged.conflicts)linked.syncWarnings.push('Some custom or older actions overlap generated actions. Review them once in settings.');
    linked.actionsNeedReview=linked.syncWarnings.length>0;
    linked.revision++;
    return linked.actionsNeedReview?'review':'refreshed';
  }
  function mutate(library, message, core, uuid) {
    if (message.type === 'select') {
      if (message.id !== null) record(library,message.id);
      library.activeId = message.id;
      return;
    }
    if (message.type === 'edit') {
      if (typeof message.name !== 'string' || !message.name.trim() || message.name.length > 200) throw Error('Enter a character name (up to 200 characters).');
      const actions = core.validateActions(message.actions);
      let target;
      if (message.id) {
        target = record(library,message.id);
        if (target.revision !== message.revision) throw Error('This character changed while you were editing. Reload it before saving.');
      } else {
        if (library.records.length >= 50) throw Error('Maximum 50 saved characters.');
        target = {id:uuid(), revision:0}; library.records.push(target);
      }
      target.name = message.name.trim(); target.actions = actions; target.revision++;
      // A reviewed import is explicitly supplied; ordinary name/action edits do
      // not claim to recalculate a changed internal Pathbuilder save.
      if (message.importedBuild) {
        if (JSON.stringify(message.importedBuild).length > MAX_BYTES) throw Error('Import is too large.');
        core.normalize(message.importedBuild);
        target.importedBuild = message.importedBuild;
        target.generatedActions=message.generatedActions ? core.validateActions(message.generatedActions) : core.normalize(message.importedBuild).actions;
        target.rulesEdition=message.rulesEdition==='legacy'?'legacy':'remaster';
        target.useNethys=message.useNethys!==false;
        target.syncError=null;target.syncWarnings=[];
        target.actionsNeedReview = false;
      }
      if(message.adoptCalculated) {
        if(!target.lastSave || target.calculatedFor!==target.lastSave.startedAt)throw Error('Save again in Pathbuilder to obtain current calculated actions.');
        target.syncWarnings=(target.syncWarnings||[]).filter(w=>!w.startsWith('Some custom or older actions'));
        target.actionsNeedReview=target.syncWarnings.length>0;
      }
      library.activeId = target.id;
      return target.id;
    }
    const target = record(library,message.id);
    if (message.type === 'link') {
      const candidate = library.candidates.find(c => sourceKey(c.source) === sourceKey(message.source));
      if (!candidate) throw Error('Save this character in Pathbuilder first, then refresh the list.');
      if (library.records.some(c => c.id !== target.id && c.source && sourceKey(c.source) === sourceKey(message.source))) throw Error('That save is already linked to another character.');
      target.source = candidate.source; delete target.lastSave;
      target.actionsNeedReview = true;
      library.candidates = library.candidates.filter(c => c !== candidate);
      target.revision++;
    } else if (message.type === 'unlink') {
      delete target.source; delete target.lastSave; target.revision++;
    } else if (message.type === 'delete') {
      library.records = library.records.filter(c => c !== target);
      if (library.activeId === target.id) library.activeId = library.records[0]?.id || null;
    } else throw Error('Unknown character command.');
  }
  function projection(library) {
    const active = library.records.find(c => c.id === library.activeId);
    return active ? {id:active.id, name:active.name, actions:active.actions, actionsNeedReview:!!active.actionsNeedReview} : null;
  }
  const api = {MAX_BYTES, sourceKey, snapshot, migrate, applySave, applyExport, mergeActions, mutate, projection};
  if (typeof module !== 'undefined') module.exports = api;
  else root.PathbridgerCharacters = api;
})(globalThis);
