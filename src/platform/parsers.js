'use strict';

const { createHash } = require('node:crypto');
const MAX_ITEMS = 4000;

function text(value, limit = 2048) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').trim().slice(0, limit);
}

function stableId(...parts) {
  return createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 24);
}

function parseJson(stdout) {
  if (typeof stdout !== 'string' || stdout.length > 6 * 1024 * 1024) throw new Error('Invalid collector output');
  return JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
}

function parseWindows(stdout, kind) {
  const data = parseJson(stdout);
  if (!data || !Array.isArray(data.items) || !Array.isArray(data.warnings)) throw new Error('Invalid inventory envelope');
  const seen = new Set();
  const items = [];
  for (const row of data.items.slice(0, MAX_ITEMS)) {
    if (!row || typeof row !== 'object') continue;
    const name = text(row.name, 300);
    if (!name) continue;
    const item = { id: stableId(kind, text(row.source), text(row.key), name), name, source: text(row.source, 300) };
    for (const key of ['publisher', 'version', 'path', 'iconPath']) {
      const value = text(row[key], 2048);
      if (value) item[key] = value;
    }
    if(kind==='applications'){
      if(Number.isSafeInteger(row.estimatedSizeKB)&&row.estimatedSizeKB>=0&&row.estimatedSizeKB<=Number.MAX_SAFE_INTEGER/1024)item.size=row.estimatedSizeKB*1024;
      if(typeof row.installedOn==='string'&&/^\d{8}$/.test(row.installedOn)){const value=row.installedOn.slice(0,4)+'-'+row.installedOn.slice(4,6)+'-'+row.installedOn.slice(6);if(Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value)item.installedOn=value;}
    }
    // Registry presence is not an authoritative enabled/disabled signal.
    if (!seen.has(item.id)) { seen.add(item.id); items.push(item); }
  }
  const warnings = data.warnings.slice(0, 100).filter(x => typeof x === 'string').map(x => text(x, 300));
  if (data.items.length > MAX_ITEMS) warnings.push('Inventory limit reached.');
  return { items, status: 'partial', warnings: [...new Set(warnings)] };
}

function parseMacApplications(stdout) {
  const data = parseJson(stdout);
  if (!data || !Array.isArray(data.SPApplicationsDataType)) throw new Error('Invalid application inventory');
  const items = [];
  const seen = new Set();
  for (const row of data.SPApplicationsDataType.slice(0, MAX_ITEMS)) {
    if (!row || typeof row !== 'object') continue;
    const name = text(row._name, 300);
    const location = text(row.path);
    if (!name || !location.startsWith('/')) continue;
    const id = stableId('darwin-application', location);
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({ id, name, path: location, version: text(row.version, 100), source: 'System Information application inventory' });
  }
  return { items, status: 'partial', warnings: ['Application inventory may omit inaccessible apps or apps not indexed by macOS.', ...(data.SPApplicationsDataType.length > MAX_ITEMS ? ['Inventory limit reached.'] : [])] };
}

function parseLaunchAgent(stdout, location) {
  const data = parseJson(stdout);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid launch agent');
  const label = text(data.Label, 300);
  if (!label) throw new Error('Missing launch agent label');
  // Plist Disabled is not the live launchd/Background Task Management state.
  return { id: stableId('launch-agent', location), name: label, path: location, source: 'Launch agent definition (live state unknown)' };
}

module.exports = { text, stableId, parseJson, parseWindows, parseMacApplications, parseLaunchAgent };
