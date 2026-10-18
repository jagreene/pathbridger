// Feed helpers shared by the content script, background, and regression tests.
(function(root) {
  function paizoURL(value, base) {
    try {
      const url = new URL(value, base);
      if(url.protocol === 'https:' && ['paizo.com','www.paizo.com'].includes(url.hostname) && !url.port && !url.username && !url.password) return url;
    } catch (_) {}
    return null;
  }
  function scope(value) {
    const url = paizoURL(value);
    if(!url) return null;
    const path = url.pathname.split('&')[0].replace(/\/$/, '');
    if(/^\/threads\/[^/]+$/.test(path)) return path;
    if(/^\/campaigns\/[^/]+\/(gameplay|discussion|recruiting)$/.test(path)) return path;
    if(/^\/community\/forums(?:\/|$)/.test(path)) return path.replace(/\/posts$/, '');
    return null;
  }
  function discover(document, page) {
    const current = scope(page);
    if(!current) return null;
    for(const link of document.querySelectorAll('link[rel~="alternate"][href]')) {
      if(!/application\/(atom|rss)\+xml/i.test(link.type)) continue;
      const url = paizoURL(link.getAttribute('href'), page);
      if(url && scope(url.href) === current) {
        // Paizo advertises its canonical host even on www pages. Keep fetch same-origin.
        url.hostname = new URL(page).hostname;
        url.hash = '';
        return {url:url.href, title:link.title || document.title, key:current};
      }
    }
    return null;
  }
  function parseFeed(text, base, Parser = DOMParser) {
    const doc = new Parser().parseFromString(text, 'application/xml');
    if(doc.querySelector('parsererror') || !['feed','rss','RDF'].includes(doc.documentElement.localName)) throw Error('Invalid RSS/Atom feed');
    const atom = doc.documentElement.localName === 'feed';
    const entries = [], ids = new Set();
    const children = (node, name) => [...node.children].filter(child => child.localName === name);
    const value = (node, name) => children(node, name)[0]?.textContent.trim() || '';
    for(const item of doc.getElementsByTagNameNS('*', atom ? 'entry' : 'item')) {
      const link = atom ? children(item, 'link').find(link => !link.getAttribute('rel') || link.getAttribute('rel') === 'alternate')?.getAttribute('href') : value(item, 'link');
      const url = paizoURL(link || '', base);
      const id = value(item, atom ? 'id' : 'guid') || url?.href;
      if(!link || !url || !scope(url.href) || !id || ids.has(id)) continue;
      ids.add(id);
      entries.push({id:id.slice(0,2048), url:url.href, title:value(item,'title').slice(0,200), published:Date.parse(value(item,atom ? 'published' : 'pubDate')) || 0});
    }
    return entries;
  }
  function advance(previous, entries) {
    const seen = new Set(previous?.seen || []);
    // Ignore edits, reordering and older items resurfacing as the feed window changes.
    const fresh = previous ? entries.filter(entry => !seen.has(entry.id) && (!entry.published || entry.published >= previous.latest)) : [];
    entries.forEach(entry => seen.add(entry.id));
    return {fresh, state:{seen:[...seen].slice(-1000), latest:Math.max(previous?.latest || 0, ...entries.map(entry => entry.published))}};
  }
  const api = {paizoURL, scope, discover, parseFeed, advance};
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PathbridgerForum = api;
})(globalThis);
