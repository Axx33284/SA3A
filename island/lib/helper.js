// Starts IslandHelper.exe and turns its JSON-lines output into events.
'use strict';
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const readline = require('readline');

class Helper extends EventEmitter {
  constructor(exePath, log) {
    super();
    this.exePath = exePath;
    this.log = log || (() => {});
    this.proc = null;
    this.restarts = [];
    this.stopped = false;
  }

  available() { return process.platform === 'win32' && fs.existsSync(this.exePath); }

  start() {
    if (!this.available()) { this.emit('message', { type: 'helper-missing', path: this.exePath }); return; }
    this.stopped = false;
    const p = spawn(this.exePath, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc = p;
    readline.createInterface({ input: p.stdout }).on('line', line => {
      if (!line.trim()) return;
      let msg;
      try { msg = JSON.parse(line); } catch { this.log('helper: bad line ' + line.slice(0, 120)); return; }
      this.emit('message', msg);
    });
    readline.createInterface({ input: p.stderr }).on('line', line => this.log(line));
    p.on('error', err => this.log('helper error: ' + err.message));
    p.on('exit', code => {
      this.log('helper exited ' + code);
      if (this.proc === p) this.proc = null;
      if (this.stopped) return;
      const now = Date.now();
      this.restarts = this.restarts.filter(t => now - t < 60000);
      if (this.restarts.length >= 5) { this.emit('message', { type: 'helper-failed' }); return; }
      this.restarts.push(now);
      setTimeout(() => { if (!this.stopped) this.start(); }, 1000 * this.restarts.length);
    });
  }

  send(cmd) {
    if (!this.proc || !this.proc.stdin.writable) return false;
    try { this.proc.stdin.write(JSON.stringify(cmd) + '\n'); return true; } catch { return false; }
  }

  stop() {
    this.stopped = true;
    if (this.proc) {
      try { this.proc.stdin.end(); } catch { }
      const p = this.proc;
      setTimeout(() => { try { p.kill(); } catch { } }, 800);
      this.proc = null;
    }
  }
}

module.exports = { Helper };
