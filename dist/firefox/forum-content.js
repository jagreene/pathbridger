(() => {
  const feed = PathbridgerForum.discover(document, location.href);
  if(!feed) return;
  let state = null, unread = 0, busy = false, timer, failures = 0, enabled = true;
  let originalTitle = document.title, renderedTitle = '', latestURL = '';
  const originalIcons = [...document.querySelectorAll('link[rel~="icon"]')];
  const badgeIcon = document.createElement('link');
  badgeIcon.rel = 'icon'; badgeIcon.type = 'image/png'; badgeIcon.sizes = '32x32';
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
  let favicon = null;
  const iconURL = originalIcons[0]?.href;
  if(iconURL) {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {favicon = img; if(unread) render();};
    img.src = iconURL;
  }
  const banner = document.createElement('a');
  banner.className = 'pb-forum-alert'; banner.target = '_blank'; banner.rel = 'noopener noreferrer';
  banner.setAttribute('role','status'); banner.hidden = true;
  document.body.append(banner);
  function render() {
    if(document.title !== renderedTitle) originalTitle = document.title;
    renderedTitle = unread ? `(${unread}) ${originalTitle}` : originalTitle;
    document.title = renderedTitle;
    banner.hidden = !unread;
    if(!unread) {badgeIcon.remove(); return;}
    const noun = feed.key.startsWith('/community/forums') ? 'thread' : 'post';
    banner.textContent = `${unread} new ${noun}${unread === 1 ? '' : 's'} · Open latest ↗`;
    banner.href = latestURL;
    const ctx = canvas.getContext('2d');
    if(!ctx) return;
    ctx.clearRect(0,0,32,32);
    try {
      if(favicon) ctx.drawImage(favicon,0,0,32,32);
      else {ctx.fillStyle='#315449'; ctx.fillRect(0,0,32,32);}
      ctx.fillStyle='#c62828'; ctx.beginPath(); ctx.arc(22,22,10,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fff'; ctx.font='bold 14px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(unread > 9 ? '9+' : String(unread),22,23);
      badgeIcon.href = canvas.toDataURL();
      document.head.append(badgeIcon);
    } catch (_) {favicon = null; canvas.width = 32; /* Title and banner remain usable if favicon drawing is blocked. */}
  }
  async function poll() {
    if(busy || !enabled) return;
    clearTimeout(timer); busy = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(),15000);
    try {
      const response = await fetch(feed.url, {credentials:'same-origin', cache:'no-cache', signal:controller.signal});
      if(!response.ok || !PathbridgerForum.paizoURL(response.url || feed.url) || new URL(response.url || feed.url).origin !== location.origin) throw Error('Feed unavailable');
      const text = await response.text();
      if(text.length > 2000000) throw Error('Feed too large');
      const entries = PathbridgerForum.parseFeed(text,feed.url).filter(entry => feed.key.startsWith('/community/forums') || PathbridgerForum.scope(entry.url) === feed.key);
      if(!enabled) return;
      const next = PathbridgerForum.advance(state,entries); state = next.state; failures = 0;
      if(next.fresh.length) {
        unread += next.fresh.length;
        latestURL = [...next.fresh].sort((a,b) => b.published-a.published)[0].url;
        render();
        // Notification failure must never erase the badge or break polling.
        PathbridgerAPI.runtime.sendMessage({type:'forum-new-posts', feed:feed.url, title:feed.title, entries:next.fresh}).catch(() => {});
      }
    } catch (_) {failures++;}
    finally {
      clearTimeout(timeout); busy = false;
      if(enabled) timer = setTimeout(poll, Math.min(60000 * 2 ** Math.min(failures,4), 900000));
    }
  }
  function configure(settings) {
    enabled = settings?.enabled !== false;
    if(enabled) {if(!busy) poll();}
    else {clearTimeout(timer); state = null; unread = 0; render();}
  }
  PathbridgerAPI.storage.local.get('forumNotifications').then(result => configure(result.forumNotifications)).catch(() => configure());
  PathbridgerAPI.storage.onChanged.addListener((changes, area) => {
    if(area === 'local' && changes.forumNotifications) configure(changes.forumNotifications.newValue);
  });
  // Browsers may throttle hidden tabs; catch up when the tab becomes visible.
  document.addEventListener('visibilitychange', () => {if(!document.hidden) poll();});
  window.addEventListener('pagehide', () => {enabled = false; clearTimeout(timer);});
  window.addEventListener('pageshow', event => {
    if(event.persisted) PathbridgerAPI.storage.local.get('forumNotifications').then(result => configure(result.forumNotifications)).catch(() => {});
  });
})();
