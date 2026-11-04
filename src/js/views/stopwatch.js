// Stopwatch with no upper limit. Stores the start time, so it keeps running across restarts.
import { state, save } from '../store.js';
import { t } from '../i18n.js';
import { h, esc, fmtDuration } from '../util.js';
import { icon } from '../icons.js';

export function stopwatchView(root) {
  const sw = state.stopwatch;
  const el = h(`<div class="stopwatch-page">
    <section class="card sw-card">
      <div class="sw-display" aria-live="off"></div>
      <div class="row gap center sw-controls">
        <button class="btn round big" data-act="lap" title="${esc(t('common.lap'))}">${icon('flag')}</button>
        <button class="btn round big primary" data-act="toggle"></button>
        <button class="btn round big" data-act="reset" title="${esc(t('common.reset'))}">${icon('rotate-ccw')}</button>
      </div>
    </section>
    <section class="card laps-card">
      <table class="laps"><thead><tr><th>${esc(t('stopwatch.laps'))}</th><th>${esc(t('stopwatch.lapTime'))}</th><th>${esc(t('stopwatch.total'))}</th></tr></thead><tbody></tbody></table>
    </section>
  </div>`);
  root.append(el);
  const disp = el.querySelector('.sw-display');
  const elapsed = () => sw.elapsed + (sw.running ? Date.now() - sw.startedAt : 0);

  function renderButtons() {
    el.querySelector('[data-act=toggle]').innerHTML = icon(sw.running ? 'pause' : 'play');
    el.querySelector('[data-act=toggle]').title = sw.running ? t('common.pause') : t('common.start');
    el.querySelector('[data-act=lap]').disabled = !sw.running;
    el.querySelector('[data-act=reset]').disabled = sw.running || !elapsed();
  }
  function renderLaps() {
    const body = el.querySelector('tbody');
    body.innerHTML = '';
    el.querySelector('.laps-card').hidden = !sw.laps.length;
    const lapTimes = sw.laps.map((v, i) => v - (sw.laps[i - 1] || 0));
    const min = Math.min(...lapTimes);
    const max = Math.max(...lapTimes);
    for (let i = sw.laps.length - 1; i >= 0; i--) {
      const cls = sw.laps.length > 2 && lapTimes[i] === min ? 'best' : sw.laps.length > 2 && lapTimes[i] === max ? 'worst' : '';
      body.append(h(`<tr class="${cls}"><td>${esc(t('stopwatch.lap', { n: i + 1 }))}</td><td>${esc(fmtDuration(lapTimes[i], { cs: true }))}</td><td>${esc(fmtDuration(sw.laps[i], { cs: true }))}</td></tr>`));
    }
  }
  el.querySelector('[data-act=toggle]').onclick = () => {
    if (sw.running) { sw.elapsed = elapsed(); sw.running = false; } else { sw.startedAt = Date.now(); sw.running = true; }
    save('stopwatch'); renderButtons();
  };
  el.querySelector('[data-act=lap]').onclick = () => { sw.laps.push(elapsed()); save('stopwatch'); renderLaps(); };
  el.querySelector('[data-act=reset]').onclick = () => {
    Object.assign(sw, { running: false, startedAt: 0, elapsed: 0, laps: [] });
    save('stopwatch'); renderButtons(); renderLaps(); frame();
  };

  let raf = 0;
  function frame() {
    disp.textContent = fmtDuration(elapsed(), { cs: true });
    raf = requestAnimationFrame(frame);
  }
  renderButtons();
  renderLaps();
  frame();
  return { destroy: () => cancelAnimationFrame(raf) };
}
