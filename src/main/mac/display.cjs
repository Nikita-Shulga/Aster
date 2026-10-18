'use strict';
// macOS does not offer a public way for apps to change resolution or refresh rate,
// so displays are shown read-only with a shortcut to System Settings → Displays.
const {sh} = require('./sh.cjs');

class MacDisplay {
  constructor({store}) { this.store = store; }
  async list() {
    let data = [];
    try { data = JSON.parse(await sh('/usr/sbin/system_profiler', ['SPDisplaysDataType', '-json'], {timeout: 20000})).SPDisplaysDataType || []; } catch {}
    const items = [];
    for (const gpu of data) for (const d of gpu.spdisplays_ndrvs || []) {
      const res = String(d._spdisplays_resolution || d.spdisplays_resolution || '');
      const px = String(d._spdisplays_pixels || '').match(/(\d+)\s*x\s*(\d+)/);
      const m = res.match(/(\d+)\s*x\s*(\d+)(?:.*?@\s*([\d.]+)\s*Hz)?/i);
      items.push({
        device: d._name || 'Display', name: d._name || 'Display', primary: d.spdisplays_main === 'spdisplays_yes',
        width: m ? +m[1] : null, height: m ? +m[2] : null, freq: m?.[3] ? Math.round(+m[3]) : null,
        pixels: px ? `${px[1]} × ${px[2]}` : null, // Retina panels render at a lower "looks like" resolution than their physical pixels.
        retina: /retina/i.test(res) || d.spdisplays_pixelresolution === 'spdisplays_retina' || !!(px && m && +px[1] > +m[1]),
        modes: [], readOnly: true
      });
    }
    return {items};
  }
  async set() { throw new Error('macOS only allows changing resolution and refresh rate in System Settings → Displays.'); }
}

module.exports = {MacDisplay};
