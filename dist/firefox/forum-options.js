(() => {
  const enabled = document.getElementById('forum-enabled');
  const desktop = document.getElementById('forum-desktop');
  const status = document.getElementById('forum-status');
  PathbridgerAPI.storage.local.get('forumNotifications').then(({forumNotifications}) => {
    enabled.checked = forumNotifications?.enabled !== false;
    desktop.checked = forumNotifications?.desktop !== false;
    enabled.disabled = false; desktop.disabled = !enabled.checked;
  }).catch(() => {status.textContent = 'Could not load forum notification settings.';});
  async function save() {
    try {
      await PathbridgerAPI.storage.local.set({forumNotifications:{enabled:enabled.checked,desktop:desktop.checked}});
      desktop.disabled = !enabled.checked;
      status.textContent = 'Forum notification settings saved.';
    } catch (_) {status.textContent = 'Could not save forum notification settings.';}
  }
  enabled.addEventListener('change',save); desktop.addEventListener('change',save);
})();
