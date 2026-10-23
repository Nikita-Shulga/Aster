'use strict';
// macOS repair tools: Disk Utility's First Aid check of the startup disk (diskutil verifyVolume). It runs on the
// live system and only reads; a disk that needs repair is fixed from macOS Recovery, which the result explains.
const {shStream} = require('./sh.cjs');
const {t} = require('../i18n.cjs');

class MacRepair {
  constructor({store, send}) { this.store = store; this.send = send; this.running = null; }

  status() { return {running: this.running}; }

  async run({id}) {
    if (this.running) throw new Error(t('repair.busy'));
    if (id !== 'verify') throw new Error('Unknown action');
    this.running = {id, drive: null, started: Date.now(), pct: null};
    try {
      const lines = [];
      const r = await shStream('/usr/sbin/diskutil', ['verifyVolume', '/'], {timeout: 3600e3, onLine: l => { lines.push(l); this.send({id, line: l.slice(0, 200)}); }});
      const text = lines.join('\n');
      this.store.log({kind: 'tool', key: 'activity.repair.verify', vars: {drive: ''}});
      if (r.code === 0 && !/error|corrupt|invalid/i.test(lines.slice(-3).join(' '))) return {id, state: 'ok'};
      if (/permission|not permitted|privilege/i.test(text)) return {id, state: 'unknown', code: r.code};
      return {id, state: 'problems', code: r.code};
    } finally { this.running = null; }
  }
}

module.exports = {MacRepair};
