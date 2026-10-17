'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCollectors } = require('../../src/platform');
const { parseWindows, parseMacApplications, parseLaunchAgent } = require('../../src/platform/parsers');
const { WINDOWS_APPLICATIONS, WINDOWS_STARTUP, powershellArgs, windowsPowerShell } = require('../../src/platform/commands');

const fakeOs = {
  homedir: () => '/Users/tester', cpus: () => [{ model: 'Test CPU' }, { model: 'Test CPU' }],
  version: () => 'Test OS', release: () => '1', type: () => 'Linux', arch: () => 'x64',
  hostname: () => 'test-host', totalmem: () => 1024, freemem: () => 512, uptime: () => 60
};
const directory = { isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false };
const regularFile = { size: 100, isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false };

test('fixed PowerShell collector uses absolute System32 executable and encoded app-owned scripts', () => {
  assert.equal(windowsPowerShell({ SystemRoot: 'D:\\Windows' }), 'D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.throws(() => windowsPowerShell({ SystemRoot: '\\\\remote\\Windows' }));
  assert.throws(() => windowsPowerShell({ SystemRoot: 'C:\\Users\\attacker' }));
  for (const script of [WINDOWS_APPLICATIONS, WINDOWS_STARTUP]) {
    const args = powershellArgs(script);
    assert.ok(args.includes('-NoProfile')); assert.ok(args.includes('-NonInteractive'));
    assert.equal(Buffer.from(args.at(-1), 'base64').toString('utf16le'), script);
    assert.doesNotMatch(script, /Win32_Product|Win32_StartupCommand|UninstallString|Invoke-Expression|Start-Process|Remove-Item|Set-Item|AllUsers/i);
  }
  assert.throws(() => powershellArgs('arbitrary input'));
});

test('Windows empty and single-item arrays parse with unknown enabled state', () => {
  assert.deepEqual(parseWindows('{"items":[],"warnings":[]}', 'startup').items, []);
  const result = parseWindows('\uFEFF' + JSON.stringify({ items: [{ name: 'Utility\n', key: 'x', source: 'HKCU/Run', command: 'app.exe --something' }], warnings: [] }), 'startup');
  assert.equal(result.items[0].name, 'Utility');
  assert.equal(result.items[0].command, undefined);
  assert.equal(result.items[0].enabled, undefined);
  assert.equal(result.status, 'partial');
  assert.throws(() => parseWindows('{"items":{},"warnings":[]}', 'startup'));
});

test('Windows items deduplicate and control/bidi sequences are removed', () => {
  const row = { name: 'Safe\u202eName\u0000', source: 'registry', key: 'key' };
  const result = parseWindows(JSON.stringify({ items: [null, row, row, { name: 3 }], warnings: [] }), 'applications');
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].name, 'Safe Name');
});

test('macOS system_profiler parser accepts only application records and absolute paths', () => {
  const result = parseMacApplications(JSON.stringify({ SPApplicationsDataType: [{ _name: 'Demo', path: '/Applications/Demo.app', version: '1' }, { _name: 'Bad', path: 'relative' }, null] }));
  assert.equal(result.items.length, 1); assert.equal(result.items[0].version, '1');
  assert.equal(result.status, 'partial');
  assert.throws(() => parseMacApplications('{"SPHardwareDataType":[]}'));
});

test('launch plist parser never turns Disabled or ProgramArguments into executable action', () => {
  const item = parseLaunchAgent(JSON.stringify({ Label: 'com.demo.agent', Disabled: false, ProgramArguments: ['rm', '-rf', '/'] }), '/Library/LaunchAgents/demo.plist');
  assert.equal(item.enabled, undefined); assert.equal(item.command, undefined);
  assert.equal(item.name, 'com.demo.agent');
  assert.throws(() => parseLaunchAgent('{"Label":1}', '/tmp/test'));
});

test('Linux development fallback does not pretend native inventories or disk health are available', async () => {
  const collectors = createCollectors({ platform: 'linux', os: fakeOs, fs: { statfs: async () => ({ blocks: 100, bsize: 10, bavail: 50 }) }, runCommand: () => { throw new Error('Must not execute'); } });
  const system = await collectors.getSystemInfo();
  assert.deepEqual(system.storage, { total: 1000, free: 500, used: 500 });
  assert.equal(system.cpu.cores, 2); assert.equal(system.capabilities.diskHealth, false);
  assert.equal(system.capabilities.startupInventory, false);
  assert.equal((await collectors.listStartup()).status, 'unsupported');
  assert.equal((await collectors.listApplications()).status, 'unsupported');
});

test('failed storage read produces null values, never a healthy-looking zero', async () => {
  const system = await createCollectors({ platform: 'darwin', os: fakeOs, fs: { statfs: async () => { throw new Error('/secret/path'); } } }).getSystemInfo();
  assert.deepEqual(system.storage, { total: null, free: null, used: null });
  assert.equal(system.capabilities.storage, false);
  assert.doesNotMatch(JSON.stringify(system.warnings), /secret/);
});

test('low-space recommendation is evidence-based and says guidance threshold', async () => {
  const system = await createCollectors({ platform: 'win32', os: fakeOs, fs: { statfs: async () => ({ blocks: 1000, bsize: 10, bavail: 50 }) } }).getSystemInfo();
  assert.equal(system.recommendations[0].id, 'low-storage');
  assert.match(system.recommendations[0].detail, /guidance threshold/);
});

test('Windows invocation is bounded and returned execution errors are sanitized', async () => {
  let called = 0;
  const collectors = createCollectors({ platform: 'win32', env: { SystemRoot: 'C:\\Windows' }, runCommand: async (file, args, options) => {
    called++; assert.match(file, /System32/); assert.ok(args.includes('-EncodedCommand'));
    assert.equal(options.timeout, 15000); assert.ok(options.maxBuffer <= 6 * 1024 * 1024);
    throw Object.assign(new Error('private path and stderr'), { code: 'TIMEOUT' });
  } });
  const result = await collectors.listApplications();
  assert.equal(called, 1); assert.equal(result.status, 'partial');
  assert.match(result.warnings[0], /timed out/); assert.doesNotMatch(JSON.stringify(result), /private/);
});

test('macOS only asks system_profiler for applications with fixed bounded arguments', async () => {
  const collectors = createCollectors({ platform: 'darwin', runCommand: async (file, args, options) => {
    assert.equal(file, '/usr/sbin/system_profiler');
    assert.deepEqual(args, ['SPApplicationsDataType', '-json', '-detailLevel', 'mini']);
    assert.equal(options.timeout, 15000);
    return '{"SPApplicationsDataType":[]}';
  } });
  assert.equal((await collectors.listApplications()).status, 'partial');
});

test('macOS launch inventory skips symbolic links and uses plutil stdout conversion only', async () => {
  let calls = 0;
  const collectors = createCollectors({ platform: 'darwin', os: fakeOs,
    fs: {
      lstat: async location => location.endsWith('.plist') ? regularFile : directory,
      readdir: async location => location.startsWith('/Users/') ? [
        { name: 'safe.plist', isFile: () => true, isSymbolicLink: () => false },
        { name: 'redirect.plist', isFile: () => true, isSymbolicLink: () => true }
      ] : []
    },
    runCommand: async (file, args, options) => {
      calls++; assert.equal(file, '/usr/bin/plutil'); assert.deepEqual(args.slice(0, 6), ['-convert', 'json', '-o', '-', '--', '/Users/tester/Library/LaunchAgents/safe.plist']);
      assert.equal(options.timeout, 2000); return '{"Label":"com.demo"}';
    }
  });
  const result = await collectors.listStartup();
  assert.equal(calls, 1); assert.equal(result.items.length, 1); assert.equal(result.items[0].enabled, undefined);
});
