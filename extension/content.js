(() => {
  let character = null;
  const editors = new Set();
  browser.storage.local.get('character').then(result => {character = result.character; editors.forEach(fn => fn());});
  browser.storage.onChanged.addListener((changes, area) => {
    if(area === 'local' && changes.character) { character = changes.character.newValue; editors.forEach(fn => fn()); }
  });
  function offer(textarea) {
    if(textarea.dataset.pathbridger || textarea.readOnly || textarea.disabled) return;
    textarea.dataset.pathbridger = 'off';
    const enable = document.createElement('button');
    enable.type = 'button'; enable.className = 'pb-enable'; enable.textContent = 'Enable Pathbridger';
    textarea.before(enable);
    enable.onclick = () => {enable.remove(); enhance(textarea);};
  }
  function enhance(t) {
    const panel = document.createElement('div'); panel.className = 'pb-panel';
    const title = document.createElement('span');
    const stage = document.createElement('span'); stage.setAttribute('aria-live','polite');
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.textContent = 'Highlighting off';
    panel.append(title,stage,toggle); t.before(panel);
    const shell = document.createElement('div'); shell.className = 'pb-shell'; t.before(shell);
    const pre = document.createElement('pre'); pre.className = 'pb-highlight'; pre.setAttribute('aria-hidden','true');
    shell.append(pre,t); t.classList.add('pb-input');
    const menu = document.createElement('div'); menu.className = 'pb-menu'; menu.setAttribute('role','listbox'); menu.id = `pb-menu-${Math.random().toString(36).slice(2)}`; shell.after(menu);
    t.setAttribute('aria-controls',menu.id); t.setAttribute('aria-autocomplete','list');
    const help = document.createElement('small'); help.className = 'pb-help'; help.textContent = 'Type /action · Tab completes · ↑↓ select · Esc dismisses. MAP follows earlier attack rolls in this message.'; menu.after(help);
    let matches = [], selected = 0, token = null, dismissed = false;
    function replace(start,end,text,caret = start + text.length) {
      t.setRangeText(text,start,end,'end'); t.setSelectionRange(caret,caret);
      t.dispatchEvent(new Event('input',{bubbles:true}));
    }
    function accept(index) {
      if(!token || !matches[index]) return;
      const output = Pathbridger.roll(matches[index],Pathbridger.attackCount(t.value, character?.actions || [], t.selectionStart));
      const start = token.index, end = t.selectionStart;
      replace(start,end,output); t.focus();
    }
    function update() {
      if(!t.isConnected) {editors.delete(update); observer.disconnect(); return;}
      title.textContent = character?.name || 'Import a character in extension settings';
      pre.innerHTML = Pathbridger.highlight(t.value) + '\n';
      pre.scrollTop = t.scrollTop; pre.scrollLeft = t.scrollLeft;
      const count = Pathbridger.attackCount(t.value, character?.actions || [], t.selectionStart);
      stage.textContent = `${count} earlier attacks · next attack ${Math.min(count + 1, 3)}${count >= 2 ? '+' : ''}`;
      const before = t.value.slice(0,t.selectionStart);
      token = t.selectionStart === t.selectionEnd ? /\/[\w '\-]*$/.exec(before) : null;
      if(token && token.index > 0 && !/\s/.test(before[token.index-1])) token = null;
      matches = !dismissed && token ? (character?.actions || []).filter(a => a.name.toLowerCase().includes(token[0].slice(1).toLowerCase())).slice(0,8) : [];
      selected = Math.min(selected,Math.max(0,matches.length-1)); menu.replaceChildren(); menu.hidden = !matches.length;
      t.removeAttribute('aria-activedescendant');
      matches.forEach((a,i) => {
        const button = document.createElement('button'); button.type = 'button'; button.id = `${menu.id}-${i}`; button.setAttribute('role','option'); button.setAttribute('aria-selected',String(i===selected));
        button.className = i===selected ? 'pb-selected' : ''; button.textContent = `${a.name} — ${Pathbridger.roll(a,Pathbridger.attackCount(t.value, character?.actions || [], t.selectionStart))}`;
        button.onmousedown = e => e.preventDefault(); button.onclick = () => accept(i); menu.append(button);
        if(i===selected) t.setAttribute('aria-activedescendant',button.id);
      });
    }
    const observer = new ResizeObserver(() => { pre.style.height = `${t.getBoundingClientRect().height}px`; }); observer.observe(t);
    toggle.onclick = () => {const plain = t.classList.toggle('pb-plain'); pre.hidden = plain; toggle.textContent = plain ? 'Highlighting on' : 'Highlighting off';};
    document.addEventListener('selectionchange', () => { if(document.activeElement === t) update(); });
    t.addEventListener('input', () => {dismissed = false; selected = 0; update();});
    t.addEventListener('click', () => {dismissed = false; update();});
    t.addEventListener('scroll', () => {pre.scrollTop = t.scrollTop; pre.scrollLeft = t.scrollLeft;});
    t.addEventListener('keydown', e => {
      if(e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if(matches.length && !e.shiftKey && ['Tab','Enter','ArrowDown','ArrowUp','Escape'].includes(e.key)) {
        e.preventDefault();
        if(e.key === 'Tab' || e.key === 'Enter') accept(selected);
        else if(e.key === 'Escape') {dismissed = true; update();}
        else {selected = (selected + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length; update();}
        return;
      }
      const start = t.selectionStart, end = t.selectionEnd;
      if(e.key === '[') {e.preventDefault(); replace(start,end,`[${t.value.slice(start,end)}]`,start+1);}
      if(e.key === ']' && start === end) {
        const match = /\[([a-z]+)(?:=[^\]\n]*)?$/i.exec(t.value.slice(0,start));
        const skip = t.value[start] === ']';
        if(match && Pathbridger.tags.includes(match[1].toLowerCase())) {
          e.preventDefault(); const closing = `[/${match[1]}]`;
          replace(start,start+(skip?1:0),']'+(t.value.slice(start+(skip?1:0)).startsWith(closing)?'':closing),start+1);
        } else if(skip) {e.preventDefault(); t.setSelectionRange(start+1,start+1);}
      }
      if(e.key === 'Backspace' && start === end && t.value.slice(start-1,start+1) === '[]') {e.preventDefault(); replace(start-1,start+1,'');}
    });
    editors.add(update); update();
  }
  function scan(root) {if(root.matches?.('textarea')) offer(root); root.querySelectorAll?.('textarea').forEach(offer);}
  scan(document);
  new MutationObserver(records => records.forEach(r => r.addedNodes.forEach(n => {if(n.nodeType===1) scan(n);}))).observe(document.documentElement,{childList:true,subtree:true});
})();
