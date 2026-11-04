import { state, save, on } from '../store.js';
import { t } from '../i18n.js';
import { h, esc, fmtTime, fmtDate, modal } from '../util.js';
import { icon } from '../icons.js';

const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const cityOf = (tz) => tz.split('/').pop().replace(/_/g, ' ');
const ALL_TZ = (Intl.supportedValuesOf?.('timeZone') || []).filter((z) => z.includes('/'));

function offsetMinutes(tz, at = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

function analog() {
  const marks = Array.from({ length: 12 }, (_, i) => `<line x1="50" y1="6" x2="50" y2="${i % 3 ? 10 : 13}" transform="rotate(${i * 30} 50 50)"/>`).join('');
  return `<svg class="analog" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" class="face"/><g class="marks">${marks}</g>
    <line class="hh" x1="50" y1="50" x2="50" y2="27"/><line class="mm" x1="50" y1="50" x2="50" y2="15"/><line class="ss" x1="50" y1="56" x2="50" y2="12"/><circle cx="50" cy="50" r="3" class="hub"/></svg>`;
}

function openAddCity(onAdd) {
  const body = h(`<div class="editor">
    <h2>${icon('globe')} ${esc(t('worldclock.addCity'))}</h2>
    <div class="search-box">${icon('search')}<input type="search" placeholder="${esc(t('worldclock.searchTz'))}"></div>
    <div class="tz-list"></div>
  </div>`);
  const dlg = modal(body, { wide: true });
  const input = body.querySelector('input');
  const list = body.querySelector('.tz-list');
  function render() {
    const q = input.value.trim().toLowerCase();
    list.innerHTML = '';
    ALL_TZ.filter((z) => !state.clocks.includes(z) && (!q || z.toLowerCase().replace(/_/g, ' ').includes(q))).slice(0, 60).forEach((z) => {
      const b = h(`<button class="loc-item"><strong>${esc(cityOf(z))}</strong><span class="muted small">${esc(z.replace(/_/g, ' '))} · ${esc(fmtTime(new Date(), { tz: z }))}</span></button>`);
      b.onclick = () => { onAdd(z); dlg.close(); };
      list.append(b);
    });
  }
  input.oninput = render;
  render();
}

export function worldclockView(root) {
  const el = h(`<div class="list-page">
    <section class="card local-clock">
      ${analog()}
      <div><div class="muted small">${esc(t('worldclock.local'))} · ${esc(cityOf(LOCAL_TZ))}</div><div class="lc-time"></div><div class="lc-date muted"></div></div>
    </section>
    <div class="page-actions"><button class="btn primary" data-act="add">${icon('plus')} ${esc(t('worldclock.addCity'))}</button></div>
    <div class="grid cards clocks"></div>
  </div>`);
  root.append(el);
  const grid = el.querySelector('.clocks');
  el.querySelector('[data-act=add]').onclick = () => openAddCity((z) => { state.clocks.push(z); save('clocks'); render(); });

  function render() {
    grid.innerHTML = '';
    state.clocks.forEach((z, i) => {
      const card = h(`<article class="card wclock" style="--i:${i}" data-tz="${esc(z)}">${analog()}
        <div class="wc-info"><strong>${esc(cityOf(z))}</strong><div class="wc-time"></div><div class="muted small wc-diff"></div></div>
        <button class="icon-btn" data-act="remove" title="${esc(t('common.delete'))}">${icon('x')}</button></article>`);
      card.querySelector('[data-act=remove]').onclick = () => { state.clocks = state.clocks.filter((x) => x !== z); save('clocks'); render(); };
      grid.append(card);
    });
    tick();
  }
  function setHands(svg, tz, now) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(now).map((x) => [x.type, +x.value]));
    svg.querySelector('.hh').setAttribute('transform', `rotate(${(p.hour % 12) * 30 + p.minute * 0.5} 50 50)`);
    svg.querySelector('.mm').setAttribute('transform', `rotate(${p.minute * 6 + p.second * 0.1} 50 50)`);
    svg.querySelector('.ss').setAttribute('transform', `rotate(${p.second * 6} 50 50)`);
    const hour = p.hour;
    svg.classList.toggle('night', hour < 6 || hour >= 19);
  }
  function tick() {
    const now = new Date();
    setHands(el.querySelector('.local-clock .analog'), LOCAL_TZ, now);
    el.querySelector('.lc-time').textContent = fmtTime(now, { seconds: true });
    el.querySelector('.lc-date').textContent = fmtDate(now, 'long');
    const localOff = offsetMinutes(LOCAL_TZ, now);
    grid.querySelectorAll('.wclock').forEach((c) => {
      const z = c.dataset.tz;
      setHands(c.querySelector('.analog'), z, now);
      c.querySelector('.wc-time').textContent = fmtTime(now, { tz: z });
      const diff = (offsetMinutes(z, now) - localOff) / 60;
      const n = Number.isInteger(diff) ? Math.abs(diff) : Math.abs(diff).toFixed(1);
      c.querySelector('.wc-diff').textContent = `${fmtDate(now, 'medium', z)} · ${diff === 0 ? t('worldclock.same') : diff > 0 ? t('worldclock.ahead', { n }) : t('worldclock.behind', { n })}`;
    });
  }
  render();
  const offs = [on('tick', tick), on('settings', render)];
  return { destroy: () => offs.forEach((f) => f()) };
}
