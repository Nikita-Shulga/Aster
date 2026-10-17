'use strict';

const { parseJson } = require('./parsers');

function number(value, maximum = Number.MAX_SAFE_INTEGER) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum ? value : null;
}

function unknownBattery(status = 'unknown') {
  return { status, present: null, chargePercent: null, powerSource: 'unknown', state: 'unknown', items: [], warnings: ['Battery state is a snapshot, not a battery-health or remaining-life assessment.'] };
}

function summarizeBattery(items, warnings = []) {
  const result = unknownBattery('partial');
  result.items = items;
  result.present = items.length ? true : null;
  if (items.length === 1) Object.assign(result, items[0]);
  result.warnings.push(...warnings);
  if (!items.length) result.warnings.push('No supported battery was reported; absence is not confirmed.');
  if (items.length > 1) result.warnings.push('Multiple batteries were reported. Charge percentages are not combined.');
  return result;
}

function parseWindowsDiagnostics(stdout) {
  const data = parseJson(stdout);
  if (!data || !Array.isArray(data.volumes) || !Array.isArray(data.batteries) || typeof data.volumesAvailable !== 'boolean' || typeof data.batteryAvailable !== 'boolean') throw new Error('Invalid diagnostic envelope');
  const volumes = { status: data.volumesAvailable ? 'partial' : 'unknown', items: [], warnings: ['Only local drive-letter volumes are listed. Values describe logical capacity, not physical disk health; do not sum shared or virtual storage.'] };
  const seen = new Set();
  if (data.volumesAvailable) for (const row of data.volumes.slice(0, 32)) {
    if (!row || typeof row.drive !== 'string' || !/^[A-Z]:$/i.test(row.drive)) continue;
    const drive = row.drive.toUpperCase();
    if (seen.has(drive)) continue;
    seen.add(drive);
    const total = number(row.total);
    const rawFree = number(row.free);
    const free = total !== null && rawFree !== null && rawFree <= total ? rawFree : null;
    volumes.items.push({ id: drive, label: drive, total, free, used: total !== null && free !== null ? total - free : null, fileSystem: ['NTFS', 'ReFS', 'FAT', 'FAT32', 'exFAT'].includes(row.fileSystem) ? row.fileSystem : null, scope: 'local-volume' });
  }
  if (!volumes.items.length) volumes.warnings.push('Local-volume capacity could not be established.');
  const items = [];
  if (data.batteryAvailable) for (const row of data.batteries.slice(0, 8)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const code = number(row.stateCode, 11);
    if (code === null && number(row.chargePercent, 100) === null) continue;
    const state = ({ 1: 'discharging', 2: 'not-discharging', 3: 'charged', 4: 'low', 5: 'critical', 6: 'charging', 7: 'charging', 8: 'charging', 9: 'charging', 11: 'partially-charged' })[code] || 'unknown';
    items.push({ chargePercent: number(row.chargePercent, 100), state, powerSource: code === 1 ? 'battery' : code === 2 ? 'ac' : 'unknown' });
  }
  const battery = data.batteryAvailable ? summarizeBattery(items) : unknownBattery();
  if (!data.batteryAvailable) battery.warnings.push('The Windows battery source is unavailable.');
  return { volumes, battery };
}

function parseMacBattery(stdout) {
  if (typeof stdout !== 'string' || stdout.length > 65536) throw new Error('Invalid power snapshot');
  const source = stdout.match(/^Now drawing from '(AC Power|Battery Power|UPS Power)'\s*$/m);
  if (!source) throw new Error('Unrecognized power source');
  const items = [];
  for (const line of stdout.split('\n').slice(0, 32)) {
    // Deliberately exclude UPS/peripheral names and identifiers. No raw output is retained.
    if (!/^\s*-InternalBattery-\d+\b/.test(line)) continue;
    const charge = line.match(/\)\s+(\d{1,3})%;\s*([^;\r\n]+);/);
    if (!charge) continue;
    const state = ['charging', 'discharging', 'charged', 'not charging', 'finishing charge', 'AC attached'].includes(charge[2].trim()) ? charge[2].trim().replaceAll(' ', '-') : 'unknown';
    items.push({ chargePercent: number(Number(charge[1]), 100), state, powerSource: source[1] === 'AC Power' ? 'ac' : source[1] === 'Battery Power' ? 'battery' : 'ups' });
  }
  const result = summarizeBattery(items);
  result.powerSource = source[1] === 'AC Power' ? 'ac' : source[1] === 'Battery Power' ? 'battery' : 'ups';
  return result;
}

module.exports = { number, unknownBattery, parseWindowsDiagnostics, parseMacBattery };
