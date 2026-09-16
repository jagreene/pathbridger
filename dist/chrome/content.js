(() => {
  let character = null, characterChoices = [], activeCharacterId = null;
  let buffs = PathbridgerBuffs.defaults;
  const editors = new Set();
  PathbridgerAPI.storage.local.get(['character','buffs']).then(result => {character = result.character; buffs = result.buffs ?? PathbridgerBuffs.defaults; editors.forEach(fn => fn());});
  async function loadCharacterChoices() {
    if(!PathbridgerAPI.runtime?.sendMessage) return;
    try {
      const response=await PathbridgerAPI.runtime.sendMessage({type:'characters'});
      if(!response?.result || !Array.isArray(response.result.records)) return;
      characterChoices=response.result.records;activeCharacterId=response.result.activeId;editors.forEach(fn=>fn());
    } catch (_) {}
  }
  loadCharacterChoices();
  PathbridgerAPI.storage.onChanged.addListener((changes, area) => {
    if(area === 'local' && changes.buffs) {buffs = changes.buffs.newValue ?? PathbridgerBuffs.defaults; editors.forEach(fn=>fn());}
    if(area === 'local' && changes.character) { character = changes.character.newValue; editors.forEach(fn => fn()); }
    if(area === 'local' && changes.characterLibrary) loadCharacterChoices();
  });
  function offer(textarea) {
    if(textarea.dataset.pathbridger || textarea.readOnly || textarea.disabled) return;
    enhance(textarea);
  }
  function enhance(t) {
    if(t.dataset.pathbridger === 'active') return;
    t.dataset.pathbridger = 'active';
    const panel = document.createElement('div'); panel.className = 'pb-panel';
    const title = document.createElement('span');
    const stage = document.createElement('span'); stage.setAttribute('aria-live','polite');
    const characterPicker = document.createElement('select'); characterPicker.className='pb-character-picker'; characterPicker.setAttribute('aria-label','Use character on Paizo');
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.textContent = 'Enable highlighting';
    const buffMenu = document.createElement('details'); buffMenu.className='pb-buffs';
    const buffSummary = document.createElement('summary'); buffSummary.textContent='Buffs (0)';
    const buffChoices = document.createElement('div'); buffChoices.className='pb-buff-choices';
    buffMenu.append(buffSummary,buffChoices);
    const activeBuffs = new Set();
    let buffVersion = null;
    function selectedBuffs() {return buffs.filter(b=>activeBuffs.has(b.id));}
    function buffedRoll(action,stage) {return Pathbridger.roll(PathbridgerBuffs.apply(action,selectedBuffs()),stage);}
    function renderBuffs() {
      if(buffVersion !== buffs) {
        buffVersion=buffs; buffChoices.replaceChildren();
        for(const id of activeBuffs) if(!buffs.some(b=>b.id===id)) activeBuffs.delete(id);
        for(const buff of buffs) {
          const row=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=activeBuffs.has(buff.id);
          input.addEventListener('change',()=>{
            const previous=selectedBuffs();
            if(input.checked) activeBuffs.add(buff.id);else activeBuffs.delete(buff.id);
            const edits=PathbridgerBuffs.edits(t.value,character?.actions || [],previous,selectedBuffs());
            const mapPosition=position=>edits.reduce((mapped,edit)=>mapped+(position>=edit.end ? edit.text.length-(edit.end-edit.start) : position>edit.start ? Math.min(position-edit.start,edit.text.length)-(position-edit.start) : 0),position);
            const start=mapPosition(t.selectionStart),end=mapPosition(t.selectionEnd),direction=t.selectionDirection;
            const top=t.scrollTop,left=t.scrollLeft;
            for(const edit of edits.reverse()) t.setRangeText(edit.text,edit.start,edit.end,'preserve');
            t.setSelectionRange(start,end,direction);t.scrollTop=top;t.scrollLeft=left;
            if(edits.length) t.dispatchEvent(new Event('input',{bubbles:true}));
            else update();
          });
          row.append(input,document.createTextNode(`${buff.name} (+${buff.attack} attack, +${buff.damage} damage, +${buff.checks} checks; ${buff.type})`));buffChoices.append(row);
        }
        if(!buffs.length) buffChoices.textContent='Add buffs in extension settings.';
      }
      const totals=PathbridgerBuffs.totals(selectedBuffs());
      buffSummary.textContent=`Buffs (${selectedBuffs().length})`;
      buffSummary.title=`Effective bonuses: +${totals.attack} attack, +${totals.damage} damage, +${totals.checks} checks. Updates matching rolls in this draft.`;
    }
    panel.append(title,stage,characterPicker,buffMenu,toggle); t.before(panel);
    const shell = document.createElement('div'); shell.className = 'pb-shell'; t.before(shell);
    const pre = document.createElement('pre'); pre.className = 'pb-highlight'; pre.setAttribute('aria-hidden','true');
    shell.append(pre,t); t.classList.add('pb-input', 'pb-plain'); pre.hidden = true;
    const menu = document.createElement('div'); menu.className = 'pb-menu'; menu.setAttribute('role','listbox'); menu.id = `pb-menu-${Math.random().toString(36).slice(2)}`; document.body.append(menu); menu.hidden = true;
    t.setAttribute('aria-controls',menu.id); t.setAttribute('aria-autocomplete','list');
    const help = document.createElement('small'); help.className = 'pb-help'; help.textContent = 'Type [dice= · Tab completes · ↑↓ select · Esc dismisses. MAP follows earlier attack rolls in this message.'; shell.after(help);
    let matches = [], selected = 0, token = null, dismissed = false;
    let highlighting = true;
    function setHighlighting(enabled) {
      t.classList.toggle('pb-plain', !enabled);
      t.classList.toggle('pb-highlight-active', enabled);
      pre.hidden = !enabled;
      toggle.textContent = enabled ? 'Disable highlighting' : 'Enable highlighting';
      toggle.setAttribute('aria-pressed', String(enabled));
    }
    function renderHighlighting() {
      try {
        // Render first; never hide the original glyphs until the overlay is ready.
        pre.innerHTML = Pathbridger.highlight(t.value) + '\n';
        setHighlighting(highlighting);
      } catch (error) {
        highlighting = false;
        setHighlighting(false);
        help.textContent = 'Highlighting could not render. Plain text editing is available.';
      }
    }
    toggle.addEventListener('click', event => {
      event.preventDefault();
      highlighting = !highlighting;
      if (highlighting) renderHighlighting(); else setHighlighting(false);
    });
    function replace(start,end,text,caret = start + text.length) {
      t.setRangeText(text,start,end,'end'); t.setSelectionRange(caret,caret);
      t.dispatchEvent(new Event('input',{bubbles:true}));
    }
    function accept(index, snapshot) {
      if(!token || !matches[index]) return;
      if(snapshot && (snapshot.value !== t.value || snapshot.cursor !== t.selectionStart)) return;
      const current = Pathbridger.completionContext(t.value,t.selectionStart,t.selectionEnd);
      if(!current || current.index !== token.index || current.end !== token.end) return;
      const action = matches[index];
      const output = buffedRoll(action,Pathbridger.attackCount(t.value, character?.actions || [], current.index));
      // Consume this completion before dispatching input or focus events.
      token = null; matches = []; dismissed = true; menu.hidden = true;
      replace(current.index,current.end,output); t.focus();
    }
    const mirror = document.createElement('div');
    mirror.className = 'pb-caret-mirror'; mirror.setAttribute('aria-hidden','true'); document.body.append(mirror);
    function positionMenu() {
      if(menu.hidden) return;
      const rect = t.getBoundingClientRect(), style = getComputedStyle(t);
      for(const prop of ['fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','wordSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','textIndent','tabSize','direction']) mirror.style[prop] = style[prop];
      mirror.style.width = `${t.clientWidth + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)}px`;
      mirror.textContent = t.value.slice(0,t.selectionStart);
      const caret = document.createElement('span'); caret.textContent = '\u200b'; mirror.append(caret);
      const box = mirror.getBoundingClientRect(), mark = caret.getBoundingClientRect();
      const x = rect.left + mark.left - box.left - t.scrollLeft;
      const y = rect.top + mark.top - box.top - t.scrollTop;
      const line = parseFloat(style.lineHeight) || 22;
      if(y+line < Math.max(0,rect.top) || y > Math.min(innerHeight,rect.bottom)) {menu.hidden=true; return;}
      menu.style.width = `${Math.min(520,innerWidth-16)}px`;
      const height = Math.min(240, Math.max(80,innerHeight-16));
      menu.style.maxHeight = `${height}px`;
      const below = y+line+5, actual = Math.min(menu.scrollHeight,height);
      menu.style.left = `${Math.max(8,Math.min(x,innerWidth-menu.getBoundingClientRect().width-8))}px`;
      menu.style.top = `${Math.max(8,below+actual <= innerHeight-8 ? below : y-actual-5)}px`;
    }
    function update() {
      if(!t.isConnected) {editors.delete(update); observer.disconnect(); menu.remove(); mirror.remove(); window.removeEventListener('scroll', onViewport, true); window.removeEventListener('resize', onViewport); return;}
      renderBuffs();
      title.textContent = character?.name ? character.name + (character.actionsNeedReview ? ' — actions need review in settings' : '') : 'Import a character in extension settings';
      const selectedId=character?.id || activeCharacterId;
      const pickerVersion=JSON.stringify([selectedId,characterChoices]);
      if(characterPicker.dataset.version !== pickerVersion) {
        characterPicker.replaceChildren(new Option('No character selected', ''));
        for(const choice of characterChoices) characterPicker.add(new Option(choice.name,choice.id));
        characterPicker.value=selectedId || '';characterPicker.disabled=!characterChoices.length;characterPicker.dataset.version=pickerVersion;
      }
      renderHighlighting();
      pre.scrollTop = t.scrollTop; pre.scrollLeft = t.scrollLeft;
      const count = Pathbridger.attackCount(t.value, character?.actions || [], t.selectionStart);
      stage.textContent = `${count} earlier attacks · next attack ${Math.min(count + 1, 3)}${count >= 2 ? '+' : ''}`;
      token = Pathbridger.completionContext(t.value, t.selectionStart, t.selectionEnd);
      matches = !dismissed && token ? (character?.actions || []).filter(a => Pathbridger.actionName(a).toLowerCase().includes(token.query.toLowerCase())).slice(0,8) : [];
      selected = Math.min(selected,Math.max(0,matches.length-1)); menu.replaceChildren(); menu.hidden = !matches.length;
      t.removeAttribute('aria-activedescendant');
      const snapshot = {value:t.value,cursor:t.selectionStart};
      matches.forEach((a,i) => {
        const button = document.createElement('button'); button.type = 'button'; button.id = `${menu.id}-${i}`; button.setAttribute('role','option'); button.setAttribute('aria-selected',String(i===selected));
        button.className = i===selected ? 'pb-selected' : ''; button.textContent = `${Pathbridger.actionName(a)} — ${buffedRoll(a,Pathbridger.attackCount(t.value, character?.actions || [], t.selectionStart))}`;
        button.title = [a.actionCost, a.note, a.source].filter(Boolean).join(' · ');
        button.addEventListener('mousedown', e => e.preventDefault());
        button.addEventListener('click', e => {e.preventDefault(); e.stopPropagation(); accept(i,snapshot);}); menu.append(button);
        if(i===selected) t.setAttribute('aria-activedescendant',button.id);
      });
      positionMenu();
      const active = menu.children[selected];
      if(active && !menu.hidden) { if(active.offsetTop < menu.scrollTop) menu.scrollTop = active.offsetTop; else if(active.offsetTop+active.offsetHeight > menu.scrollTop+menu.clientHeight) menu.scrollTop = active.offsetTop+active.offsetHeight-menu.clientHeight; }
    }
    characterPicker.addEventListener('change', async () => {
      try {
        const id=characterPicker.value || null,response=await PathbridgerAPI.runtime.sendMessage({type:'select',id});
        if(!response || response.error) throw Error('Character selection could not be updated.');
        activeCharacterId=id;update();
      } catch (_) { characterPicker.value=character?.id || activeCharacterId || ''; }
    });
    function onViewport(event) { if(event && menu.contains(event.target)) return; if(document.activeElement === t) update(); else menu.hidden = true; }
    window.addEventListener('scroll', onViewport, true);
    window.addEventListener('resize', onViewport);
    t.addEventListener('blur', () => {menu.hidden = true;});
    const observer = new ResizeObserver(() => { pre.style.height = `${t.getBoundingClientRect().height}px`; }); observer.observe(t);
    document.addEventListener('selectionchange', () => { if(document.activeElement === t) update(); });
    t.addEventListener('input', () => {dismissed = false; selected = 0; update();});
    t.addEventListener('click', () => {dismissed = false; update();});
    t.addEventListener('scroll', () => {pre.scrollTop = t.scrollTop; pre.scrollLeft = t.scrollLeft;});
    t.addEventListener('keydown', e => {
      if(e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if(matches.length && !e.shiftKey && ['Tab','Enter','ArrowDown','ArrowUp','Escape'].includes(e.key)) {
        e.preventDefault(); e.stopImmediatePropagation();
        if(e.repeat && (e.key === 'Tab' || e.key === 'Enter')) return;
        if(e.key === 'Tab' || e.key === 'Enter') accept(selected);
        else if(e.key === 'Escape') {dismissed = true; update();}
        else {selected = (selected + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length; update();}
        return;
      }
      const start = t.selectionStart, end = t.selectionEnd;
      if(e.key === '[') {e.preventDefault(); replace(start,end,`[${t.value.slice(start,end)}]`,start+1);}
      if(e.key === ']' && start === end) {
        const edit=Pathbridger.closeTagEdit(t.value,start);
        if(edit) {e.preventDefault(); replace(edit.start,edit.end,edit.text,edit.caret);}
        else if(t.value[start]===']') {e.preventDefault(); t.setSelectionRange(start+1,start+1);}

      }
      if(e.key === 'Backspace' && start === end && t.value.slice(start-1,start+1) === '[]') {e.preventDefault(); replace(start-1,start+1,'');}
    });
    editors.add(update); update();
  }
  function scan(root) {if(root.matches?.('textarea')) offer(root); root.querySelectorAll?.('textarea').forEach(offer);}
  scan(document);
  new MutationObserver(records => records.forEach(r => r.addedNodes.forEach(n => {if(n.nodeType===1) scan(n);}))).observe(document.documentElement,{childList:true,subtree:true});
})();
