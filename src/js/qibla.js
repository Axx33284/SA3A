// Qibla maths on the sphere. The direction of the Qibla is the initial bearing of the great circle
// (shortest path over the Earth) from the user to the Kaaba.

export const KAABA = { lat: 21.422487, lng: 39.826206 };
const R = 6371.0088; // mean Earth radius, km
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Bearing from true north, clockwise, 0–360°. */
export function qiblaBearing(lat, lng) {
  const p1 = rad(lat);
  const p2 = rad(KAABA.lat);
  const dl = rad(KAABA.lng - lng);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Great-circle distance in km. */
export function distanceKm(lat1, lng1, lat2 = KAABA.lat, lng2 = KAABA.lng) {
  const dp = rad(lat2 - lat1);
  const dl = rad(lng2 - lng1);
  const a = Math.sin(dp / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Point reached after travelling `km` from (lat,lng) on `bearing`. */
export function destination(lat, lng, bearing, km) {
  const d = km / R;
  const b = rad(bearing);
  const p1 = rad(lat);
  const l1 = rad(lng);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: deg(p2), lng: ((deg(l2) + 540) % 360) - 180 };
}

/** Points along the great circle to the Kaaba, for drawing the true path on a flat map. */
export function greatCirclePath(lat, lng, steps = 128) {
  const toVec = (la, lo) => [Math.cos(rad(la)) * Math.cos(rad(lo)), Math.cos(rad(la)) * Math.sin(rad(lo)), Math.sin(rad(la))];
  const a = toVec(lat, lng);
  const b = toVec(KAABA.lat, KAABA.lng);
  const omega = Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
  if (omega < 1e-9) return [[lat, lng]];
  const pts = [];
  let prevLng = null;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const s1 = Math.sin((1 - t) * omega) / Math.sin(omega);
    const s2 = Math.sin(t * omega) / Math.sin(omega);
    const v = [s1 * a[0] + s2 * b[0], s1 * a[1] + s2 * b[1], s1 * a[2] + s2 * b[2]];
    const la = deg(Math.atan2(v[2], Math.hypot(v[0], v[1])));
    let lo = deg(Math.atan2(v[1], v[0]));
    // Keep longitudes continuous so Leaflet doesn't draw a line across the whole map at ±180°.
    if (prevLng !== null) while (lo - prevLng > 180) lo -= 360;
    if (prevLng !== null) while (lo - prevLng < -180) lo += 360;
    prevLng = lo;
    pts.push([la, lo]);
  }
  return pts;
}

export function compassPoint(bearing) {
  const pts = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return pts[Math.round(bearing / 22.5) % 16];
}
