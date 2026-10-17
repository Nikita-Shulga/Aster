'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCollectors } = require('../../src/platform');
const { parseWindowsDiagnostics, parseMacBattery } = require('../../src/platform/diagnostics');
const { WINDOWS_DIAGNOSTICS, powershellArgs, isAllowedCommand, runCommand } = require('../../src/platform/commands');
const envelope = overrides => JSON.stringify({ volumesAvailable: true, batteryAvailable: true, volumes: [], batteries: [], ...overrides });

test('Windows diagnostics use only fixed read-only scoped queries and approved command paths', async () => {
  const args = powershellArgs(WINDOWS_DIAGNOSTICS);
  assert.ok(isAllowedCommand('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', args));
  assert.equal(isAllowedCommand('powershell.exe', args), false);
  assert.equal(isAllowedCommand('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', [...args, ';evil']), false);
  assert.doesNotMatch(WINDOWS_DIAGNOSTICS, /Win32_Product|SerialNumber|VolumeName|DeviceName|ComputerName|Set-Cim|Invoke-Cim|Remove-|Start-Process/i);
  assert.match(WINDOWS_DIAGNOSTICS, /DriveType = 3/);
  assert.equal(isAllowedCommand('/usr/bin/pmset', ['-g', 'batt']), true);
  assert.equal(isAllowedCommand('/usr/bin/pmset', ['sleepnow']), false);
  assert.equal(isAllowedCommand('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', '/tmp/../secret.plist']), false);
  await assert.rejects(runCommand('/bin/sh', ['-c', 'echo test']), { code: 'COMMAND_DENIED' });
});

test('Windows volumes validate capacity and omit private labels, identifiers and extra properties', () => {
  const result = parseWindowsDiagnostics(envelope({ volumes: [
    { drive: 'c:', total: 1000, free: 400, fileSystem: 'NTFS', VolumeName: 'Private', SerialNumber: 'secret' },
    { drive: 'C:', total: 2, free: 1 }, { drive: '\\\\private\\network', total: 100, free: 10 },
    { drive: 'D:', total: null, free: 0 }, { drive: 'E:', total: 100, free: 200 }, null
  ] }));
  assert.equal(result.volumes.items.length, 3);
  assert.deepEqual(result.volumes.items[0], { id: 'C:', label: 'C:', total: 1000, free: 400, used: 600, fileSystem: 'NTFS', scope: 'local-volume' });
  assert.equal(result.volumes.items[1].total, null);
  assert.equal(result.volumes.items[1].free, null);
  assert.equal(result.volumes.items[2].free, null);
  assert.doesNotMatch(JSON.stringify(result), /Private|secret|network/);
});

test('Windows batteries retain charge zero and avoid treating null or invalid values as zero', () => {
  let result = parseWindowsDiagnostics(envelope({ batteries: [{ chargePercent: 0, stateCode: 1, DeviceID: 'private' }] }));
  assert.equal(result.battery.chargePercent, 0);
  assert.equal(result.battery.state, 'discharging');
  assert.equal(result.battery.powerSource, 'battery');
  result = parseWindowsDiagnostics(envelope({ batteries: [{ chargePercent: null, stateCode: 2 }] }));
  assert.equal(result.battery.chargePercent, null);
  assert.equal(result.battery.state, 'not-discharging');
  result = parseWindowsDiagnostics(envelope({ batteries: [{ chargePercent: 101, stateCode: 99 }] }));
  assert.equal(result.battery.chargePercent, null);
  assert.equal(result.battery.state, 'unknown');
  assert.doesNotMatch(JSON.stringify(result), /DeviceID|private/);
});

test('Windows unavailable, empty and multiple batteries never fabricate one combined state', () => {
  assert.equal(parseWindowsDiagnostics(envelope({ batteryAvailable: false })).battery.present, null);
  assert.equal(parseWindowsDiagnostics(envelope()).battery.present, null);
  const result = parseWindowsDiagnostics(envelope({ batteries: [{ chargePercent: 20, stateCode: 1 }, { chargePercent: 90, stateCode: 6 }] }));
  assert.equal(result.battery.present, true);
  assert.equal(result.battery.chargePercent, null);
  assert.equal(result.battery.items.length, 2);
  assert.equal(result.battery.state, 'unknown');
});

test('malformed diagnostic envelopes are rejected', () => {
  for (const output of ['', 'not JSON', 'null', '[]', '{"volumes":{},"batteries":[]}', envelope({ batteryAvailable: 'true' })]) assert.throws(() => parseWindowsDiagnostics(output));
});

test('macOS battery parses only supported internal battery fields without identifiers', () => {
  const result = parseMacBattery("Now drawing from 'AC Power'\n -InternalBattery-0 (id=9999999)\t83%; charging; 0:22 remaining present: true\n");
  assert.equal(result.chargePercent, 83);
  assert.equal(result.state, 'charging');
  assert.equal(result.powerSource, 'ac');
  assert.doesNotMatch(JSON.stringify(result), /9999999|0:22|InternalBattery/);
  assert.equal(parseMacBattery("Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1) 0%; discharging; (no estimate)\n").chargePercent, 0);
});

test('macOS missing, malformed and UPS data remain unknown and never expose device labels', () => {
  for (const output of ['', 'permission denied', 'Now drawing from unrecognized', 'x'.repeat(65537)]) assert.throws(() => parseMacBattery(output));
  assert.equal(parseMacBattery("Now drawing from 'AC Power'\n").present, null);
  assert.equal(parseMacBattery("Now drawing from 'AC Power'\n -InternalBattery-0 (id=1) missing data\n").chargePercent, null);
  const ups = parseMacBattery("Now drawing from 'UPS Power'\n -Private UPS (id=123) 90%; charged;\n");
  assert.equal(ups.present, null);
  assert.equal(ups.powerSource, 'ups');
  assert.doesNotMatch(JSON.stringify(ups), /Private|123/);
});

test('diagnostic source failure is bounded and sanitized, with security and updates unassessed', async () => {
  let calls = 0;
  const result = await createCollectors({ platform: 'win32', env: { SystemRoot: 'C:\\Windows' }, runCommand: async (file, args, options) => {
    calls++; assert.ok(isAllowedCommand(file, args)); assert.equal(options.timeout, 15000); assert.equal(options.maxBuffer, 128 * 1024);
    throw new Error('private stderr and username');
  } }).getDiagnostics();
  assert.equal(calls, 1);
  assert.equal(result.volumes.status, 'unknown');
  assert.equal(result.battery.chargePercent, null);
  assert.equal(result.security.assessed, false);
  assert.equal(result.updates.assessed, false);
  assert.doesNotMatch(JSON.stringify(result), /private stderr|username/);
});

test('macOS diagnostics use home volume without paths and one bounded battery command', async () => {
  const os = require('node:os');
  const result = await createCollectors({ platform: 'darwin', os: { ...os, homedir: () => '/Users/private' }, fs: { statfs: async () => ({ blocks: 100, bsize: 10, bavail: 40 }) }, runCommand: async (file, args, options) => {
    assert.equal(file, '/usr/bin/pmset'); assert.deepEqual(args, ['-g', 'batt']); assert.equal(options.timeout, 5000); assert.equal(options.maxBuffer, 65536);
    return "Now drawing from 'AC Power'\n";
  } }).getDiagnostics();
  assert.equal(result.volumes.items[0].total, 1000);
  assert.doesNotMatch(JSON.stringify(result), /Users|private|hostname/);
});

test('unsupported hosts expose only portable real capacity and never run native diagnostics', async () => {
  const result = await createCollectors({ platform: 'linux', runCommand: async () => { throw new Error('Must not execute'); } }).getDiagnostics();
  assert.equal(result.status, 'unsupported');
  assert.equal(result.battery.status, 'unsupported');
});
