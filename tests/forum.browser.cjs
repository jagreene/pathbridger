// Run with Playwright available: node tests/forum.browser.cjs
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname,'..');
const pageURL = 'https://paizo.com/threads/rzs123?Game';
const atom = ids => `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">${ids.map(id => `<entry><id>post-${id}</id><title>Post ${id}</title><link href="${pageURL}#${id}"/><published>2026-10-01T00:00:${String(id).padStart(2,'0')}Z</published><updated>2026-10-02T00:00:00Z</updated></entry>`).join('')}</feed>`;
(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.BROWSER_CHANNEL ? {channel:process.env.BROWSER_CHANNEL} : {})});
  try {
    const page = await browser.newPage();
    let body = atom([2,1]), requests = 0;
    await page.route('https://paizo.com/**',route => {
      if(route.request().url().includes('xml=atom')) {requests++; return route.fulfill({contentType:'application/atom+xml',body});}
      return route.fulfill({contentType:'text/html',body:`<!doctype html><head><title>Game</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"><link rel="alternate" type="application/atom+xml" href="https://paizo.com/threads/rzs123&amp;xml=atom?Game" title="Game posts"></head><body><textarea>Unfinished draft</textarea></body>`});
    });
    await page.goto(pageURL);
    await page.evaluate(() => {
      window.sent = []; window.delays = [];
      const nativeTimeout = window.setTimeout;
      window.setTimeout = (fn,delay,...args) => {
        if(delay >= 60000) {window.poll = fn; window.delays.push(delay); return 123456;}
        return nativeTimeout(fn,delay,...args);
      };
      window.browser = {runtime:{sendMessage:async message => {window.sent.push(message);}},storage:{local:{get:async () => ({})},onChanged:{addListener:fn => {window.settingsChanged = fn;}}}};
    });
    for(const script of ['api.js','forum.js','forum-content.js']) await page.addScriptTag({path:path.join(root,'extension',script)});
    await page.waitForFunction(() => window.delays.length === 1);
    assert.equal(await page.title(),'Game');
    assert.equal(await page.evaluate(() => sent.length),0);
    body = atom([3,2,1]); await page.evaluate(() => poll());
    assert.equal(await page.title(),'(1) Game');
    assert.equal(await page.locator('.pb-forum-alert').textContent(),'1 new post · Open latest ↗');
    assert.equal(await page.locator('.pb-forum-alert').getAttribute('target'),'_blank');
    assert.equal(await page.locator('.pb-forum-alert').getAttribute('href'),`${pageURL}#3`);
    assert.ok((await page.locator('link[rel="icon"]').last().getAttribute('href')).startsWith('data:image/png'));
    assert.equal(await page.evaluate(() => sent.length),1);
    body = atom([2,3,1]); await page.evaluate(() => poll());
    assert.equal(await page.title(),'(1) Game');
    assert.equal(await page.evaluate(() => sent.length),1);
    body = '<html>Sign in</html>'; await page.evaluate(() => poll());
    assert.equal(await page.evaluate(() => delays.at(-1)),120000);
    assert.equal(await page.title(),'(1) Game');
    body = atom([4,3,2]); await page.evaluate(() => poll());
    assert.equal(await page.title(),'(2) Game');
    assert.equal(await page.evaluate(() => delays.at(-1)),60000);
    assert.equal(await page.locator('textarea').inputValue(),'Unfinished draft');
    await page.evaluate(() => settingsChanged({forumNotifications:{newValue:{enabled:false}}},'local'));
    assert.equal(await page.title(),'Game');
    assert.equal(await page.locator('link[rel="icon"]').count(),1);
    assert.equal(await page.locator('.pb-forum-alert').isHidden(),true);
    const before = requests; await page.evaluate(() => poll()); assert.equal(requests,before);
    const parsed = await page.evaluate(() => {
      const rss = '<rss><channel><item><guid>x</guid><title>A &amp; B</title><link>https://paizo.com/threads/rzs123#5</link></item><item><guid>bad</guid><link>https://evil.test/</link></item></channel></rss>';
      const result = PathbridgerForum.parseFeed(rss,location.href);
      let malformed = false;
      try {PathbridgerForum.parseFeed('<feed><entry>',location.href);} catch (_) {malformed = true;}
      return {result,malformed};
    });
    assert.equal(parsed.result.length,1); assert.equal(parsed.result[0].title,'A & B'); assert.equal(parsed.malformed,true);
    console.log('PASS: browser RSS/Atom parsing, baseline, favicon/title badges, duplicate suppression, failure recovery, settings, and draft preservation');
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
