/* global L */
import { state, on } from '../store.js';
import { t } from '../i18n.js';
import { KAABA, qiblaBearing, distanceKm, destination, greatCirclePath } from '../qibla.js';
import { h, esc, toast } from '../util.js';
import { icon } from '../icons.js';
import { setLocation, openLocationDialog } from '../location.js';

const IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const ATTRIBUTION = 'Imagery © Esri, Maxar, Earthstar Geographics · Labels © Esri';

function compassSvg() {
  const c = t('qibla.cardinals');
  const ticks = Array.from({ length: 72 }, (_, i) => {
    const major = i % 9 === 0;
    return `<line x1="100" y1="${major ? 12 : 16}" x2="100" y2="22" transform="rotate(${i * 5} 100 100)" class="${major ? 'major' : ''}"/>`;
  }).join('');
  return `<svg class="compass" viewBox="0 0 200 200" aria-hidden="true">
    <circle cx="100" cy="100" r="94" class="dial"/>
    <g class="ticks">${ticks}</g>
    <text x="100" y="40" class="cardinal n">${c[0]}</text><text x="165" y="102" class="cardinal">${c[1]}</text>
    <text x="100" y="164" class="cardinal">${c[2]}</text><text x="35" y="102" class="cardinal">${c[3]}</text>
    <g class="needle"><path d="M100 30 L110 100 L100 92 L90 100 Z" class="tip"/><path d="M100 170 L110 100 L100 108 L90 100 Z" class="tail"/>
      <rect x="92" y="22" width="16" height="16" rx="2" class="kaaba-mini"/></g>
    <circle cx="100" cy="100" r="6" class="hub"/>
  </svg>`;
}

export function qiblaView(root) {
  const loc = state.settings.location;
  const el = h(`<div class="qibla-layout">
    <div id="qmap" class="qmap"></div>
    <aside class="card qpanel">
      <div class="compass-wrap">${compassSvg()}</div>
      <div class="q-bearing"></div>
      <div class="q-dist muted"></div>
      <p class="small q-how">${esc(t('qibla.howTo'))}</p>
      <p class="small muted">${icon('info')} ${esc(t('qibla.clickToSet'))}</p>
      <div class="row gap wrap">
        <button class="btn small" data-act="home">${icon('locate-fixed')} ${esc(t('qibla.zoomHome'))}</button>
        <button class="btn small" data-act="route">${icon('navigation')} ${esc(t('qibla.showRoute'))}</button>
        <button class="btn small" data-act="search">${icon('search')} ${esc(t('common.search'))}</button>
      </div>
      <p class="small muted q-offline" hidden>${icon('circle-alert')} ${esc(t('qibla.offlineMap'))}</p>
      <p class="tiny muted">${esc(t('qibla.trueNorth'))}</p>
    </aside>
  </div>`);
  root.append(el);
  const q = (s) => el.querySelector(s);

  if (!window.L) {
    q('.qmap').innerHTML = `<div class="map-missing">${esc(t('qibla.offlineMap'))}</div>`;
    return {};
  }

  const start = loc ? [loc.lat, loc.lng] : [KAABA.lat, KAABA.lng];
  const map = L.map(q('.qmap'), { zoomControl: false, attributionControl: true, worldCopyJump: true, maxZoom: 20 })
    .setView(start, loc ? 18 : 3);
  // The info panel sits on the reading-start side; keep the zoom buttons on the other side.
  L.control.zoom({ position: document.documentElement.dir === 'rtl' ? 'topleft' : 'topright' }).addTo(map);
  const imagery = L.tileLayer(IMAGERY, { maxZoom: 20, maxNativeZoom: 19, attribution: ATTRIBUTION }).addTo(map);
  L.tileLayer(LABELS, { maxZoom: 20, maxNativeZoom: 19, opacity: 0.85 }).addTo(map);
  let tileErrors = 0;
  imagery.on('tileerror', () => { if (++tileErrors > 3) q('.q-offline').hidden = false; });
  imagery.on('tileload', () => { tileErrors = 0; q('.q-offline').hidden = true; });

  const kaabaIcon = L.divIcon({ className: 'kaaba-marker', html: '<div class="kaaba-box"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
  L.marker([KAABA.lat, KAABA.lng], { icon: kaabaIcon, keyboard: false }).addTo(map).bindTooltip(t('qibla.kaaba'));

  const youIcon = L.divIcon({ className: 'you-marker', html: `<div class="you-dot">${icon('map-pin')}</div>`, iconSize: [36, 36], iconAnchor: [18, 34] });
  let you = null;
  let route = null;
  let arrow = null;
  let head = null;

  function draw() {
    const l = state.settings.location;
    if (!l) return;
    const b = qiblaBearing(l.lat, l.lng);
    q('.q-bearing').innerHTML = `<strong>${b.toFixed(1)}°</strong> <span class="muted">${esc(t('qibla.bearing', { deg: b.toFixed(1) }).replace(/^.*?°\s*/, ''))}</span>`;
    q('.q-dist').textContent = t('qibla.distance', { km: Math.round(distanceKm(l.lat, l.lng)).toLocaleString('en') });
    q('.needle').style.transform = `rotate(${b}deg)`;

    if (!you) {
      you = L.marker([l.lat, l.lng], { icon: youIcon, draggable: true, autoPan: true }).addTo(map).bindTooltip(t('qibla.you'));
      you.on('dragend', async () => { const p = you.getLatLng(); await setLocation({ lat: p.lat, lng: p.lng }); });
    } else you.setLatLng([l.lat, l.lng]);

    // True great-circle route (curved on the flat map) …
    const pts = greatCirclePath(l.lat, l.lng);
    if (route) route.setLatLngs(pts);
    else route = L.polyline(pts, { color: '#f2c14e', weight: 2, opacity: 0.75, dashArray: '6 8', interactive: false }).addTo(map);
    drawArrow();
  }

  // … and a bold local arrow from the house, scaled to the zoom so it's always readable.
  function drawArrow() {
    const l = state.settings.location;
    if (!l) return;
    const b = qiblaBearing(l.lat, l.lng);
    const metersPerPx = (40075016.686 * Math.cos((l.lat * Math.PI) / 180)) / 2 ** (map.getZoom() + 8);
    const km = (metersPerPx * 160) / 1000;
    const tip = destination(l.lat, l.lng, b, km);
    const line = [[l.lat, l.lng], [tip.lat, tip.lng]];
    if (arrow) arrow.setLatLngs(line);
    else arrow = L.polyline(line, { color: '#f2c14e', weight: 6, opacity: 0.95, lineCap: 'round', interactive: false }).addTo(map);
    const headIcon = L.divIcon({ className: 'arrow-head', html: `<div style="transform:rotate(${b}deg)">${icon('navigation')}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
    if (head) { head.setLatLng([tip.lat, tip.lng]); head.setIcon(headIcon); } else head = L.marker([tip.lat, tip.lng], { icon: headIcon, interactive: false, keyboard: false }).addTo(map);
  }
  map.on('zoomend', drawArrow);

  map.on('click', (e) => {
    const btn = h(`<button class="btn primary small">${icon('map-pin')} ${esc(t('qibla.setHere'))}</button>`);
    const pop = L.popup({ closeButton: false }).setLatLng(e.latlng).setContent(btn).openOn(map);
    btn.onclick = async () => {
      map.closePopup(pop);
      await setLocation({ lat: e.latlng.lat, lng: e.latlng.lng });
      toast(state.settings.location.name);
    };
  });

  q('[data-act=home]').onclick = () => { const l = state.settings.location; if (l) map.flyTo([l.lat, l.lng], 18, { duration: anim() ? 1.2 : 0 }); };
  q('[data-act=route]').onclick = () => { if (route) map.flyToBounds(route.getBounds().pad(0.15), { duration: anim() ? 1.2 : 0 }); };
  q('[data-act=search]').onclick = () => openLocationDialog();
  const anim = () => document.documentElement.dataset.motion !== 'off';

  draw();
  if (!loc) {
    q('.q-bearing').innerHTML = `<strong>—</strong>`;
    q('.q-dist').textContent = t('qibla.clickToSet');
  }
  // Leaflet needs a size recalculation once the view's enter animation has finished.
  setTimeout(() => map.invalidateSize(), 350);
  const ro = new ResizeObserver(() => map.invalidateSize());
  ro.observe(q('.qmap'));

  const off = on('location', (l) => { draw(); map.flyTo([l.lat, l.lng], Math.max(map.getZoom(), 17), { duration: anim() ? 1 : 0 }); });
  return { destroy: () => { off(); ro.disconnect(); map.remove(); } };
}
