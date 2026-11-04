// Prayer times, Hijri calendar and Islamic events. Pure functions; `adhan` is the global from vendor/adhan.umd.min.js
// (or injected by tests).

const A = () => globalThis.adhan;

export const PRAYERS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

// Calculation methods offered in settings. `id` maps to adhan.CalculationMethod[id].
export const METHODS = [
  { id: 'Turkey', label: 'Diyanet İşleri Başkanlığı (Türkiye)' },
  { id: 'UmmAlQura', label: 'Umm al-Qura (Makkah)' },
  { id: 'MuslimWorldLeague', label: 'Muslim World League' },
  { id: 'Egyptian', label: 'Egyptian General Authority of Survey' },
  { id: 'Karachi', label: 'University of Islamic Sciences, Karachi' },
  { id: 'Dubai', label: 'Dubai (UAE)' },
  { id: 'Qatar', label: 'Qatar' },
  { id: 'Kuwait', label: 'Kuwait' },
  { id: 'Singapore', label: 'Singapore / Malaysia / Indonesia' },
  { id: 'Tehran', label: 'Institute of Geophysics, Tehran' },
  { id: 'NorthAmerica', label: 'ISNA (North America)' },
  { id: 'MoonsightingCommittee', label: 'Moonsighting Committee Worldwide' },
];

// The official authority for each country. Anything not listed uses the Muslim World League.
const COUNTRY_METHOD = {
  TR: 'Turkey', CY: 'Turkey', AZ: 'Turkey',
  SA: 'UmmAlQura', YE: 'UmmAlQura', BH: 'UmmAlQura', OM: 'UmmAlQura',
  EG: 'Egyptian', SD: 'Egyptian', LY: 'Egyptian', SY: 'Egyptian', LB: 'Egyptian', IQ: 'MuslimWorldLeague',
  PK: 'Karachi', IN: 'Karachi', BD: 'Karachi', AF: 'Karachi',
  AE: 'Dubai', QA: 'Qatar', KW: 'Kuwait', IR: 'Tehran',
  SG: 'Singapore', MY: 'Singapore', ID: 'Singapore', BN: 'Singapore',
  US: 'NorthAmerica', CA: 'NorthAmerica',
  GB: 'MoonsightingCommittee', IE: 'MoonsightingCommittee',
};
const TZ_COUNTRY = {
  'Europe/Istanbul': 'TR', 'Asia/Istanbul': 'TR', 'Asia/Riyadh': 'SA', 'Africa/Cairo': 'EG', 'Asia/Karachi': 'PK',
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Dhaka': 'BD', 'Asia/Dubai': 'AE', 'Asia/Qatar': 'QA',
  'Asia/Kuwait': 'KW', 'Asia/Tehran': 'IR', 'Asia/Singapore': 'SG', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Jakarta': 'ID',
  'Asia/Baghdad': 'IQ', 'Asia/Damascus': 'SY', 'Asia/Beirut': 'LB', 'Asia/Bahrain': 'BH', 'Asia/Muscat': 'OM',
  'Asia/Aden': 'YE', 'Asia/Baku': 'AZ', 'Asia/Kabul': 'AF', 'Europe/London': 'GB', 'Europe/Dublin': 'IE',
};

export function countryFromTimeZone(tz = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  if (TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
  if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Detroit|Toronto|Vancouver|Edmonton|Winnipeg|Halifax)/.test(tz)) return 'US';
  return null;
}

export function autoMethod(country) {
  return COUNTRY_METHOD[(country || '').toUpperCase()] || 'MuslimWorldLeague';
}

export function resolveMethod(settings, location) {
  if (settings.method && settings.method !== 'auto') return settings.method;
  return autoMethod(location?.country || countryFromTimeZone());
}

function buildParams(settings, location) {
  const adhan = A();
  const methodId = resolveMethod(settings, location);
  const params = (adhan.CalculationMethod[methodId] || adhan.CalculationMethod.MuslimWorldLeague)();
  params.madhab = settings.madhab === 'hanafi' ? adhan.Madhab.Hanafi : adhan.Madhab.Shafi;
  const coords = new adhan.Coordinates(location.lat, location.lng);
  const hl = settings.highLatitude || 'auto';
  params.highLatitudeRule = hl === 'auto'
    ? adhan.HighLatitudeRule.recommended(coords)
    : { middle: 'middleofthenight', seventh: 'seventhofthenight', angle: 'twilightangle' }[hl] || adhan.HighLatitudeRule.recommended(coords);
  // Diyanet publishes times rounded up to the next minute; matching that keeps us aligned with mosque azan in Türkiye.
  params.rounding = methodId === 'Turkey' ? adhan.Rounding.Up : adhan.Rounding.Nearest;
  const adj = settings.adjust || {};
  params.adjustments = Object.fromEntries(PRAYERS.map((p) => [p, Number(adj[p]) || 0]));
  return { params, coords, methodId };
}

/** Prayer times for the calendar day `day` (a Date; only its local Y/M/D are used). */
export function prayerTimes(day, settings, location) {
  const adhan = A();
  const { params, coords, methodId } = buildParams(settings, location);
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const pt = new adhan.PrayerTimes(coords, d, params);
  const times = Object.fromEntries(PRAYERS.map((p) => [p, pt[p]]));
  return { times, methodId, isFriday: d.getDay() === 5 };
}

/** Next prayer (excluding sunrise) after `now`, looking into tomorrow when needed. */
export function nextPrayer(now, settings, location) {
  for (let i = 0; i < 2; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const { times } = prayerTimes(day, settings, location);
    for (const p of PRAYERS) {
      if (p === 'sunrise') continue;
      if (times[p] > now) return { prayer: p, time: times[p], day };
    }
  }
  return null;
}

// ---------- Hijri (Umm al-Qura) ----------
const hijriNumFmt = new Intl.DateTimeFormat('en', {
  calendar: 'islamic-umalqura', numberingSystem: 'latn', day: 'numeric', month: 'numeric', year: 'numeric',
});

function shift(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + (Number(days) || 0), 12);
}

export function hijriParts(date, offset = 0) {
  const parts = Object.fromEntries(hijriNumFmt.formatToParts(shift(date, offset)).map((p) => [p.type, p.value]));
  return { day: +parts.day, month: +parts.month, year: +(parts.year || parts.relatedYear) };
}

export function formatHijri(date, lang, offset = 0) {
  const fmt = new Intl.DateTimeFormat(lang, {
    calendar: 'islamic-umalqura', numberingSystem: 'latn', day: 'numeric', month: 'long', year: 'numeric',
  });
  return fmt.format(shift(date, offset)).replace(/^Hicri\s+/, '');
}

export const EVENTS = [
  { id: 'newYear', month: 1, day: 1 },
  { id: 'ashura', month: 1, day: 10 },
  { id: 'mawlid', month: 3, day: 12 },
  { id: 'israMiraj', month: 7, day: 27 },
  { id: 'midShaban', month: 8, day: 15 },
  { id: 'ramadan', month: 9, day: 1 },
  { id: 'qadr', month: 9, day: 27 },
  { id: 'eidFitr', month: 10, day: 1 },
  { id: 'arafah', month: 12, day: 9 },
  { id: 'eidAdha', month: 12, day: 10 },
];

/** Upcoming Islamic events within `days` days from `from`, in date order. */
export function upcomingEvents(from, offset = 0, days = 400) {
  const out = [];
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const h = hijriParts(d, offset);
    for (const ev of EVENTS) {
      if (ev.month === h.month && ev.day === h.day && !out.some((o) => o.id === ev.id)) {
        out.push({ ...ev, date: d, hijriYear: h.year, inDays: i });
      }
    }
  }
  return out;
}

export function isRamadan(date, offset = 0) {
  return hijriParts(date, offset).month === 9;
}
