(() => {
  let queue = Promise.resolve();
  // Chrome 111–115 supports callbacks, but not notification promises yet.
  function notification(method, ...args) {
    if(globalThis.browser) return PathbridgerAPI.notifications[method](...args);
    return new Promise((resolve,reject) => PathbridgerAPI.notifications[method](...args, value => {
      const error = PathbridgerAPI.runtime.lastError;
      if(error) reject(Error(error.message)); else resolve(value);
    }));
  }
  PathbridgerAPI.runtime.onMessage.addListener((message, sender, respond) => {
    if(message?.type !== 'forum-new-posts') return;
    const pageScope = PathbridgerForum.scope(sender.url);
    if(sender.id !== PathbridgerAPI.runtime.id || !sender.tab || sender.frameId !== 0 || !pageScope || PathbridgerForum.scope(message.feed) !== pageScope) return;
    if(!Array.isArray(message.entries) || !message.entries.length || message.entries.length > 500) return;
    const entries = message.entries.filter(entry => typeof entry?.id === 'string' && entry.id.length <= 2048 && PathbridgerForum.scope(entry.url) && (pageScope.startsWith('/community/forums') || PathbridgerForum.scope(entry.url) === pageScope));
    if(!entries.length) return;
    const work = async () => {
      const {forumNotifications} = await PathbridgerAPI.storage.local.get('forumNotifications');
      if(forumNotifications?.enabled === false || forumNotifications?.desktop === false) return {ok:true};
      const {forumAlerts = {}} = await PathbridgerAPI.storage.session.get('forumAlerts');
      const record = forumAlerts[pageScope] || {ids:[]};
      const seen = new Set(record.ids);
      const fresh = entries.filter(entry => {if(seen.has(entry.id)) return false; seen.add(entry.id); return true;});
      if(!fresh.length) return {ok:true};
      const id = `pathbridger-forum:${pageScope}`;
      const noun = pageScope.startsWith('/community/forums') ? 'thread' : 'post';
      await notification('create',id,{
        type:'basic', iconUrl:PathbridgerAPI.runtime.getURL('icons/pathbridger-128.png'),
        title:`${fresh.length} new Paizo ${noun}${fresh.length === 1 ? '' : 's'}`,
        message:String(message.title || fresh[0].title || 'New forum activity').slice(0,200)
      });
      const latest = [...fresh].sort((a,b) => (Number(b.published) || 0)-(Number(a.published) || 0))[0];
      forumAlerts[pageScope] = {ids:[...seen].slice(-1000), url:latest.url, at:Date.now()};
      const recent = Object.fromEntries(Object.entries(forumAlerts).sort((a,b) => b[1].at-a[1].at).slice(0,100));
      await PathbridgerAPI.storage.session.set({forumAlerts:recent});
      return {ok:true};
    };
    const result = queue.then(work); queue = result.catch(() => {});
    result.then(respond,error => respond({error:error.message}));
    return true;
  });
  PathbridgerAPI.notifications.onClicked.addListener(id => {
    if(!id.startsWith('pathbridger-forum:')) return;
    (async () => {
      const {forumAlerts = {}} = await PathbridgerAPI.storage.session.get('forumAlerts');
      const record = forumAlerts[id.slice('pathbridger-forum:'.length)];
      if(record && PathbridgerForum.scope(record.url)) {
        // A separate tab preserves any unfinished post in the original tab.
        await PathbridgerAPI.tabs.create({url:record.url});
      }
      await notification('clear',id);
    })().catch(() => {});
  });
})();
