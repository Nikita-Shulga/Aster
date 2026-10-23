'use strict';
// Drive health on macOS: the S.M.A.R.T. status diskutil reports for every physical disk ("Verified", "Failing",
// or "Not Supported" for most USB drives), plus NVMe wear and temperature details when system_profiler has them.
const {sh} = require('./sh.cjs');

// diskutil prints property lists; this pulls simple <key>/<value> pairs out of one dictionary level.
function plistValue(xml, key) {
  const m = new RegExp(`<key>${key}</key>\\s*<(string|integer|true|false)\\s*/?>([^<]*)`).exec(xml);
  if (!m) return null;
  return m[1] === 'true' ? true : m[1] === 'false' ? false : m[1] === 'integer' ? Number(m[2]) : m[2];
}

function verdict(smart) {
  if (/fail/i.test(smart || '')) return 'failing';
  if (/verified/i.test(smart || '')) return 'good';
  return 'unknown';
}

async function disks() {
  const list = await sh('/usr/sbin/diskutil', ['list', '-plist', 'physical'], {timeout: 20000}).catch(() => '');
  const whole = /<key>WholeDisks<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(list);
  const ids = whole ? [...whole[1].matchAll(/<string>([^<]+)<\/string>/g)].map(m => m[1]).filter(id => /^disk\d+$/.test(id)) : [];
  const out = [];
  for (const id of ids) {
    const info = await sh('/usr/sbin/diskutil', ['info', '-plist', id], {timeout: 20000}).catch(() => '');
    if (!info) continue;
    const smart = plistValue(info, 'SMARTStatus');
    const ssd = plistValue(info, 'SolidState');
    const proto = plistValue(info, 'BusProtocol') || '';
    out.push({
      id, name: (plistValue(info, 'MediaName') || plistValue(info, 'IORegistryEntryName') || id).trim(), size: plistValue(info, 'TotalSize') || plistValue(info, 'Size') || 0,
      letters: [], kind: /usb|thunderbolt/i.test(proto) && !plistValue(info, 'Internal') ? 'usb' : ssd ? (/pci|nvme|apple fabric/i.test(proto) ? 'nvme' : 'ssd') : 'hdd',
      bus: proto || null, health: smart || null, verdict: verdict(smart), internal: !!plistValue(info, 'Internal'),
      temperature: null, wear: null, hours: null, readErrors: null
    });
  }
  return {admin: true, details: false, disks: out};
}

module.exports = {disks, verdict, plistValue};
