// Reusable sound chooser: chime, azan voices, a local audio file, or a YouTube link — with preview.
import { t } from '../i18n.js';
import { AZAN_VOICES, FAJR_VOICES, play, youtubeId } from '../sound.js';
import { h, esc } from '../util.js';
import { icon } from '../icons.js';

export function soundPicker(initial, { fajr = false, allowTone = true, onChange } = {}) {
  let spec = { ...(initial || { kind: 'tone' }) };
  let preview = null;
  const voices = fajr ? FAJR_VOICES : AZAN_VOICES;
  const opts = [
    ...(allowTone ? [['tone', t('sound.tone')]] : []),
    ...voices.map((v) => [`azan:${v}`, `${t('sound.azan')} · ${t(`sound.voices.${v}`)}`]),
    ['file', t('sound.file')],
    ['youtube', t('sound.youtube')],
  ];
  const el = h(`<div class="sound-picker">
    <div class="row gap">
      <select class="sp-kind">${opts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select>
      <button type="button" class="icon-btn sp-preview" title="${esc(t('common.preview'))}">${icon('play')}</button>
    </div>
    <div class="sp-file row gap" hidden><button type="button" class="btn small sp-choose">${icon('file-audio')} ${esc(t('sound.chooseFile'))}</button><span class="muted small sp-name"></span></div>
    <div class="sp-yt" hidden><div class="input-icon">${icon('link')}<input type="url" class="sp-url" placeholder="${esc(t('sound.youtubeUrl'))}" spellcheck="false"></div><span class="error small sp-err" hidden>${esc(t('sound.invalidYoutube'))}</span></div>
  </div>`);
  const kind = el.querySelector('.sp-kind');
  const url = el.querySelector('.sp-url');
  const err = el.querySelector('.sp-err');
  const pv = el.querySelector('.sp-preview');

  kind.value = spec.kind === 'azan' ? `azan:${spec.id}` : spec.kind;
  if (![...kind.options].some((o) => o.value === kind.value)) kind.value = opts[0][0];
  url.value = spec.url || '';
  el.querySelector('.sp-name').textContent = spec.name || t('sound.noFile');

  function sync() {
    const v = kind.value;
    el.querySelector('.sp-file').hidden = v !== 'file';
    el.querySelector('.sp-yt').hidden = v !== 'youtube';
    if (v.startsWith('azan:')) spec = { kind: 'azan', id: v.slice(5) };
    else if (v === 'file') spec = { kind: 'file', path: spec.path, name: spec.name };
    else if (v === 'youtube') spec = { kind: 'youtube', url: url.value.trim() };
    else spec = { kind: 'tone' };
    err.hidden = v !== 'youtube' || !url.value.trim() || !!youtubeId(url.value);
  }
  const changed = () => { if (onChange && (spec.kind !== 'youtube' || youtubeId(spec.url)) && (spec.kind !== 'file' || spec.path)) onChange({ ...spec }); };
  kind.onchange = () => { stopPreview(); sync(); changed(); };
  url.oninput = () => { sync(); changed(); };
  el.querySelector('.sp-choose').onclick = async () => {
    const f = await window.sa3a.pickAudioFile();
    if (f) {
      spec = { kind: 'file', path: f.path, name: f.name };
      el.querySelector('.sp-name').textContent = f.name;
      changed();
    }
  };
  function stopPreview() {
    preview?.stop();
    preview = null;
    pv.innerHTML = icon('play');
  }
  pv.onclick = () => {
    if (preview) return stopPreview();
    sync();
    preview = play(spec, { loop: false });
    pv.innerHTML = icon('square');
    preview.done.then(() => { if (preview) stopPreview(); });
  };
  sync();
  return {
    el,
    get value() { sync(); return { ...spec }; },
    get valid() { sync(); return spec.kind !== 'youtube' || !!youtubeId(spec.url); },
    stopPreview,
  };
}
