// Finding and naming the user's location. Online lookups use OpenStreetMap Nominatim (search / reverse) and an
// IP lookup as the last resort. Prayer times themselves never need the internet once the location is saved.
import { state, updateSettings, emit } from './store.js';
import { lang, t } from './i18n.js';
import { h, esc, modal, debounce } from './util.js';
import { icon } from './icons.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org';

function placeName(addr = {}, fallback = '') {
  // In Türkiye an ilçe (e.g. Beylikdüzü) is a "town" in OpenStreetMap; elsewhere the city is usually what people expect.
  return addr.town || addr.city_district || addr.city || addr.village || addr.suburb || addr.municipality
    || addr.county || addr.state || fallback.split(',')[0] || '';
}

export async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(`${NOMINATIM}/reverse?format=jsonv2&zoom=12&addressdetails=1&lat=${lat}&lon=${lng}&accept-language=${lang()}`);
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    return { name: placeName(j.address, j.display_name), country: (j.address?.country_code || '').toUpperCase() };
  } catch {
    return { name: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, country: state.settings.location?.country || '' };
  }
}

export async function searchPlaces(q) {
  const r = await fetch(`${NOMINATIM}/search?format=jsonv2&addressdetails=1&limit=8&q=${encodeURIComponent(q)}&accept-language=${lang()}`);
  if (!r.ok) throw new Error(r.status);
  return (await r.json()).map((p) => ({
    lat: +p.lat, lng: +p.lon, name: placeName(p.address, p.display_name), detail: p.display_name,
    country: (p.address?.country_code || '').toUpperCase(),
  }));
}

function browserPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no geolocation'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      reject,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}

async function ipPosition() {
  const r = await fetch('https://ipwho.is/');
  const j = await r.json();
  if (!j.success) throw new Error('ip lookup failed');
  return { lat: j.latitude, lng: j.longitude, accuracy: 5000 };
}

/** Windows Location first (precise if Wi-Fi positioning is on), then IP (city-level). */
export async function detectLocation() {
  let pos;
  try { pos = await browserPosition(); } catch { pos = await ipPosition(); }
  const place = await reverseGeocode(pos.lat, pos.lng);
  return { ...pos, ...place };
}

export async function setLocation(loc) {
  const place = loc.name ? loc : { ...loc, ...(await reverseGeocode(loc.lat, loc.lng)) };
  updateSettings({ location: { lat: +place.lat, lng: +place.lng, name: place.name, country: place.country || '' } });
  emit('location', state.settings.location);
}

/** Location dialog: search, detect, or jump to the map. */
export function openLocationDialog({ onPickOnMap } = {}) {
  const body = h(`<div class="loc-dialog">
    <h2>${icon('map-pin')} ${esc(t('location.title'))}</h2>
    <div class="search-box">${icon('search')}<input type="search" placeholder="${esc(t('prayer.search'))}" autocomplete="off"></div>
    <div class="loc-results" role="listbox"></div>
    <div class="loc-actions">
      <button class="btn" data-act="detect">${icon('locate-fixed')} ${esc(t('prayer.detect'))}</button>
      <button class="btn" data-act="map">${icon('map')} ${esc(t('prayer.pickOnMap'))}</button>
    </div>
    <p class="muted small loc-status"></p>
  </div>`);
  const dlg = modal(body, { wide: true });
  const input = body.querySelector('input');
  const results = body.querySelector('.loc-results');
  const status = body.querySelector('.loc-status');

  const run = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) { results.innerHTML = ''; return; }
    if (!navigator.onLine) { status.textContent = t('common.offline'); return; }
    status.textContent = t('location.searching');
    try {
      const list = await searchPlaces(q);
      status.textContent = list.length ? '' : t('location.noResults');
      results.innerHTML = '';
      list.forEach((p, i) => {
        const b = h(`<button class="loc-item" style="--i:${i}"><strong>${esc(p.name)}</strong><span class="muted small">${esc(p.detail)}</span></button>`);
        b.onclick = async () => { await setLocation(p); dlg.close(); };
        results.append(b);
      });
    } catch {
      status.textContent = t('location.failed');
    }
  }, 400);
  input.addEventListener('input', run);
  body.querySelector('[data-act=detect]').onclick = async () => {
    status.textContent = t('location.detecting');
    try {
      await setLocation(await detectLocation());
      dlg.close();
    } catch {
      status.textContent = t('location.failed');
    }
  };
  body.querySelector('[data-act=map]').onclick = () => { dlg.close(); onPickOnMap?.(); };
  return dlg;
}
