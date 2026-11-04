/* global ICONS, IslandCore */
// The settings app. Every change is saved and applied to the island right away.
(function () {
  'use strict';
  const api = window.winisland;
  const Core = IslandCore;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let S = null, info = null, status = { mode: 'starting', detail: '' };

  $$('[data-icon]').forEach(el => { el.innerHTML = ICONS[el.dataset.icon] || ''; });

  // ---------- navigation ----------
  function go(sec) {
    $$('.sec').forEach(s => s.classList.toggle('on', s.dataset.sec === sec));
    $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.sec === sec));
    $('#main').scrollTop = 0;
  }
  $$('#nav button').forEach(b => b.addEventListener('click', () => go(b.dataset.sec)));

  // ---------- generic controls bound to settings keys ----------
  const get = key => key.split('.').reduce((o, k) => (o ? o[k] : undefined), S);
  function patchFor(key, value) {
    const parts = key.split('.');
    return parts.length === 2 ? { [parts[0]]: { [parts[1]]: value } } : { [key]: value };
  }
  async function set(key, value) {
    S = await api.invoke('settings:set', patchFor(key, value));
    paint();
  }
  function fmt(input, v) {
    const k = input.dataset.key;
    if (k === 'scale') return Math.round(v * 100) + '%';
    if (k === 'offsetX' || k === 'offsetY' || k === 'idleWidth') return v + ' px';
    return v + (input.dataset.unit || '');
  }

  $$('input[type=checkbox][data-key]').forEach(i => i.addEventListener('change', () => set(i.dataset.key, i.checked)));
  $$('input[type=range][data-key]').forEach(i => {
    i.addEventListener('input', () => { i.nextElementSibling.textContent = fmt(i, Number(i.value)); set(i.dataset.key, Number(i.value)); });
  });
  $$('.seg[data-key]').forEach(seg => {
    seg.innerHTML = seg.dataset.options.split(',').map(o => { const [v, l] = o.split(':'); return `<button data-v="${v}">${l}</button>`; }).join('');
    seg.addEventListener('click', e => { const b = e.target.closest('button'); if (b) set(seg.dataset.key, b.dataset.v); });
  });
  $('#displaySel').addEventListener('change', e => set('display', e.target.value));
  $$('[data-scale]').forEach(b => b.addEventListener('click', () => set('scale', Number(b.dataset.scale))));

  // themes
  const THEMES = [['black', 'Black', '#000'], ['graphite', 'Graphite', '#1c1c1e'], ['glass', 'Glass', 'rgba(18,18,20,.72)'], ['light', 'Light', '#f5f5f7']];
  $('#themes').innerHTML = THEMES.map(([k, l, c]) => `<button class="theme" data-theme="${k}"><div class="prev"><i style="background:${c}"></i></div><span>${l}</span></button>`).join('');
  $('#themes').addEventListener('click', e => { const b = e.target.closest('[data-theme]'); if (b) set('theme', b.dataset.theme); });

  const ACCENTS = ['#0a84ff', '#5e5ce6', '#bf5af2', '#ff375f', '#ff453a', '#ff9f0a', '#ffd60a', '#30d158', '#64d2ff', '#ac8e68'];
  $('#swatches').innerHTML = ACCENTS.map(c => `<button class="sw" data-c="${c}" style="background:${c}" title="${c}"></button>`).join('') + '<input type="color" id="customColor" title="Custom colour">';
  $('#swatches').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b) set('accent', b.dataset.c); });
  $('#customColor').addEventListener('input', e => set('accent', e.target.value));

  // position picker
  const SPOTS = { 'top-left': [8, 6], 'top-center': [95, 6], 'top-right': [182, 6], 'bottom-left': [8, 116], 'bottom-center': [95, 116], 'bottom-right': [182, 116] };
  $('#screen').insertAdjacentHTML('beforeend', Object.entries(SPOTS).map(([k, [x, y]]) => `<button class="spot" data-pos="${k}" title="${k.replace('-', ' ')}" style="left:${x}px;top:${y}px"></button>`).join(''));
  $('#screen').addEventListener('click', e => { const b = e.target.closest('[data-pos]'); if (b) set('position', b.dataset.pos); });

  // actions
  document.addEventListener('click', e => {
    const p = e.target.closest('[data-preview]');
    if (p) { api.send('settings:preview', p.dataset.preview); return; }
    const x = e.target.closest('[data-ext]');
    if (x) { api.send('settings:open-external', x.dataset.ext); return; }
    const a = e.target.closest('[data-action]');
    if (a) {
      if (a.dataset.action === 'test-notification') api.send('settings:test-notification');
      if (a.dataset.action === 'request-access') api.send('settings:request-access');
    }
    const m = e.target.closest('[data-mute]');
    if (m) {
      const id = m.dataset.mute;
      const muted = new Set(S.mutedApps);
      if (m.checked) muted.delete(id); else muted.add(id);
      set('mutedApps', [...muted]);
    }
  });
  $('#done').addEventListener('click', async () => { await set('onboarded', true); go('appearance'); });
  $('#reset').addEventListener('click', async () => { if (confirm('Reset all WinIsland settings?')) { S = await api.invoke('settings:reset'); paint(); } });

  // ---------- paint ----------
  function paint() {
    if (!S) return;
    document.documentElement.style.setProperty('--accent', S.accent);
    $$('input[type=checkbox][data-key]').forEach(i => { i.checked = !!get(i.dataset.key); });
    $$('input[type=range][data-key]').forEach(i => { i.value = get(i.dataset.key); i.nextElementSibling.textContent = fmt(i, get(i.dataset.key)); });
    $$('.seg[data-key]').forEach(seg => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === String(get(seg.dataset.key)))));
    $$('[data-theme]').forEach(b => b.classList.toggle('on', b.dataset.theme === S.theme));
    $$('[data-c]').forEach(b => b.classList.toggle('on', b.dataset.c === S.accent));
    $('#customColor').value = S.accent;
    $$('[data-pos]').forEach(b => b.classList.toggle('on', b.dataset.pos === S.position));
    $$('[data-scale]').forEach(b => b.classList.toggle('sel', Number(b.dataset.scale) === S.scale));
    if (info) {
      const opts = [['primary', 'Main display'], ['cursor', 'Follow the mouse']].concat(info.displays.map(d => [d.id, d.label]));
      $('#displaySel').innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}" ${String(S.display) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('');
    }
    paintApps();
    paintStatus();
  }

  function paintApps() {
    const apps = Object.entries(S.knownApps || {});
    if (!apps.length) { $('#apps').innerHTML = '<div class="empty">No apps yet. They show up here after their first notification.</div>'; return; }
    apps.sort((a, b) => a[1].localeCompare(b[1]));
    $('#apps').innerHTML = apps.map(([id, name]) => {
      const a = Core.appInfo(id, name);
      return `<div class="item app-row"><div class="n-icon" style="background:${a.color}">${ICONS[a.glyph] || ICONS.app}</div><div class="grow"><b>${esc(a.name)}</b><small>${esc(id)}</small></div>
        <label class="switch"><input type="checkbox" data-mute="${esc(id)}" ${S.mutedApps.includes(id) ? '' : 'checked'}><i></i></label></div>`;
    }).join('');
  }

  function paintStatus() {
    const m = status.mode;
    let cls = 'warn', title = 'Starting…', text = '', ic = 'info';
    if (m === 'listener') { cls = 'ok'; ic = 'check'; title = 'Notifications are connected'; text = 'WinIsland reads Windows notifications through the official notification access permission.'; }
    else if (m === 'database') { cls = 'ok'; ic = 'check'; title = 'Notifications are connected'; text = 'WinIsland reads your notifications from Windows’ notification history, so no special permission is needed.'; }
    else if (m === 'demo') { cls = 'warn'; title = 'Demo mode'; text = 'Not running on Windows, so the island shows sample media and notifications.'; }
    else if (m === 'unavailable') { cls = 'bad'; ic = 'close'; title = 'Notifications are not available'; text = status.detail || 'Allow notification access, then restart WinIsland.'; }
    const html = `<div class="ic">${ICONS[ic]}</div><div class="grow"><b>${esc(title)}</b><p>${esc(text)}</p></div>`;
    $('#statusCard').className = 'card status-card ' + cls; $('#statusCard').innerHTML = html;
    $('#statusCard2').className = 'card status-card ' + cls; $('#statusCard2').innerHTML = html;
    $('#aboutSource').textContent = { listener: 'Windows notification listener', database: 'Windows notification history (read-only)', demo: 'Demo data', unavailable: 'Not available', starting: 'Starting…' }[m] || m;
  }

  // ---------- boot ----------
  api.on('settings', s => { S = s; paint(); });
  api.on('status', st => { status = st; paintStatus(); });
  api.on('access', a => { if (a.status !== 'Allowed') alert('Windows did not grant notification access (' + a.status + ').\n\nWinIsland can still show notifications from the Windows notification history.'); });
  api.on('goto', go);

  api.invoke('settings:get').then(r => {
    info = r; S = r.settings; status = r.status || status;
    $('#ver').textContent = 'Version ' + r.version + (r.demo ? ' · demo' : '');
    $('#aboutVer').textContent = 'Version ' + r.version;
    paint();
    const q = new URLSearchParams(location.search).get('section');
    go(q || (S.onboarded ? 'appearance' : 'welcome'));
  });
})();
