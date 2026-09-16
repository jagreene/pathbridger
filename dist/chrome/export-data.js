/* Shared verification for the local-only v109g export adapter. */
(function(root) {
  const limit=1500000;
  function parse(text) {
    if(typeof text!=='string' || text.length>limit || new TextEncoder().encode(text).length>limit) throw Error('Export exceeds the 1.5 MB limit.');
    return JSON.parse(text);
  }
  function raw(text) {
    const envelope=parse(text);
    if(typeof envelope.build!=='string') throw Error('Pathbuilder raw export format changed.');
    const character=parse(envelope.build)?.characterData;
    if(!character || typeof character.characterName!=='string') throw Error('Pathbuilder raw export has no character.');
    return character;
  }
  function stable(value) {
    if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
    if(value && typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
    return JSON.stringify(value);
  }
  function fingerprint(character) {
    const copy={...character};
    // Share temporarily removes folder/GM connection IDs; Drive assigns its
    // identity after serializing on the first save. These don't affect rolls.
    for(const key of ['folderID','firebaseID','webID','googleFileID','cloudStorage','emailedBuildID'])delete copy[key];
    return stable(copy);
  }
  function verifyRaw(snapshot,text) {
    const current=raw(text),saved=parse(snapshot.payload);
    const original=snapshot.source.mode==='gdrive'?saved.characterData:saved;
    const id=snapshot.source.mode==='gdrive'?current.googleFileID:current.webID;
    if(id!==snapshot.source.saveId || fingerprint(current)!==fingerprint(original))throw Error('The open character differs from this save. Open it and save again to refresh rolls.');
    return current;
  }
  function verify(snapshot, result) {
    const before=verifyRaw(snapshot,result.before),after=verifyRaw(snapshot,result.after);
    if(stable(before)!==stable(after))throw Error('Character changed during export. Save again to refresh rolls.');
    const data=parse(result.exported);
    if(!data?.build || data.build.name!==before.characterName || !Number.isInteger(data.build.level) || data.build.level<1 || !Array.isArray(data.build.weapons))throw Error('Calculated export is incomplete or belongs to another character.');
    // Default level is omitted by the internal serializer at level 1.
    if(data.build.level!==(before.characterLevel??1))throw Error('Calculated export level does not match the save.');
    return data;
  }
  const api={parse,raw,stable,fingerprint,verifyRaw,verify};
  root.PathbridgerExportData=api;
  if(typeof module!=='undefined')module.exports=api;
})(globalThis);
