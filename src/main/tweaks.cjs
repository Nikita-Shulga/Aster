'use strict';
// Reversible Windows tweaks. Every tweak declares, in plain language, what it does, what you gain,
// what you give up, whether it needs admin rights or a restart, and Aster's recommendation.
// PowerShell snippets are fixed source; the only dynamic input is the desired value ($v) passed as JSON.
const fs = require('node:fs');
const {psJson, arr, run, sys32} = require('./ps.cjs');

const HELPERS = String.raw`
function RegGet($p, $n, $d = $null) { try { $x = (Get-ItemProperty -LiteralPath $p -Name $n -ErrorAction Stop).$n; if ($null -eq $x) { $d } else { $x } } catch { $d } }
function RegSet($p, $n, $val, $t = 'DWord') { if (-not (Test-Path -LiteralPath $p)) { New-Item -Path $p -Force | Out-Null }; New-ItemProperty -LiteralPath $p -Name $n -Value $val -PropertyType $t -Force | Out-Null }
function RegDel($p, $n) { Remove-ItemProperty -LiteralPath $p -Name $n -ErrorAction SilentlyContinue }
function Native {
  if (-not ('Aster.Native' -as [type])) {
    Add-Type -Namespace Aster -Name Native -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SystemParametersInfo(uint a, uint b, ref int c, uint d);
[DllImport("user32.dll", EntryPoint = "SystemParametersInfo")] public static extern bool SpiArray(uint a, uint b, int[] c, uint d);
[DllImport("user32.dll", EntryPoint = "SystemParametersInfo")] public static extern bool SpiSet(uint a, uint b, IntPtr c, uint d);
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessageTimeout(IntPtr h, uint m, UIntPtr w, string l, uint f, uint t, out UIntPtr r);
'@
  }
}
function Broadcast($what) { Native; $r = [UIntPtr]::Zero; [void][Aster.Native]::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, $what, 2, 3000, [ref]$r) }
function SpiGetBool($code) { Native; $x = 0; [void][Aster.Native]::SystemParametersInfo($code, 0, [ref]$x, 0); return [bool]$x }
$ADV = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced'
$CDM = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager'
function PowerCfg { & "$env:SystemRoot\System32\powercfg.exe" @args; if ($LASTEXITCODE -ne 0) { throw "powercfg failed ($LASTEXITCODE). Administrator rights may be required." } }
`;

// type: 'toggle' (value true/false) or 'choice' (value from options)
// recommended: value Aster suggests, or null when it depends on personal taste.
// verdict: 'recommended' | 'optional' | 'situational' | 'preference'
const T = [
  // ---------- Performance ----------
  {id: 'startupDelay', group: 'performance', title: 'Start apps right after sign-in', type: 'toggle', recommended: true, verdict: 'recommended',
    what: 'Windows waits about 10 seconds after you sign in before launching your startup apps. This removes that wait.',
    pro: 'Your startup apps are ready noticeably sooner after you log in.', con: 'On an old hard disk (HDD), everything starting at once can make the first minute feel busy.',
    on: 'No delay', off: 'Windows default delay',
    get: `(RegGet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize' 'StartupDelayInMSec' -1) -eq 0`,
    set: `if ($v) { RegSet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize' 'StartupDelayInMSec' 0 } else { RegDel 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize' 'StartupDelayInMSec' }`},
  {id: 'menuDelay', group: 'performance', title: 'Faster menus', type: 'toggle', recommended: true, verdict: 'recommended',
    what: 'Sub-menus (for example in right-click menus) open after 0.1 s instead of the default 0.4 s.',
    pro: 'Menus feel snappier.', con: 'None for most people. Sub-menus open more eagerly when you move the mouse across them.',
    on: '100 ms', off: '400 ms (default)',
    get: `[int](RegGet 'HKCU:\\Control Panel\\Desktop' 'MenuShowDelay' '400') -le 150`,
    set: `$ms = if ($v) { 100 } else { 400 }; RegSet 'HKCU:\\Control Panel\\Desktop' 'MenuShowDelay' ([string]$ms) 'String'; Native; [void][Aster.Native]::SpiSet(0x6B, [uint32]$ms, [IntPtr]::Zero, 3)`},
  {id: 'animations', group: 'performance', title: 'Turn off animation effects', type: 'toggle', recommended: null, verdict: 'situational',
    what: 'Disables window and menu animations — the same switch as Settings → Accessibility → Visual effects → Animation effects.',
    pro: 'Windows and menus appear instantly; helps on older or weaker PCs.', con: 'Windows feels less smooth. On a modern PC the speed difference is barely noticeable.',
    on: 'Animations off', off: 'Animations on',
    get: `-not (SpiGetBool 0x1042)`,
    set: `Native; [void][Aster.Native]::SpiSet(0x1043, 0, [IntPtr]([int](-not $v)), 3)`},
  {id: 'transparency', group: 'performance', title: 'Turn off transparency effects', type: 'toggle', recommended: null, verdict: 'situational',
    what: 'Makes the taskbar, Start menu and app backgrounds solid instead of see-through.',
    pro: 'Slightly less work for the graphics chip; can help on weak laptops and saves a little battery.', con: 'A flatter, less modern look.',
    on: 'Solid', off: 'Transparent',
    get: `(RegGet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize' 'EnableTransparency' 1) -eq 0`,
    set: `RegSet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize' 'EnableTransparency' ([int](-not $v))`},
  {id: 'hibernation', group: 'performance', title: 'Turn off hibernation', type: 'toggle', recommended: null, verdict: 'situational', admin: true,
    what: 'Disables Hibernate and deletes C:\\hiberfil.sys, a hidden file roughly 40% the size of your RAM.',
    pro: 'Frees several gigabytes on your system drive immediately.', con: 'The Hibernate option and Fast Startup stop working, so a cold boot can take a few seconds longer. Sleep still works.',
    on: 'Hibernation off', off: 'Hibernation on',
    get: `((RegGet 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power' 'HibernateEnabled' 1) -eq 0) -or -not (Test-Path -LiteralPath "$env:SystemDrive\\hiberfil.sys")`,
    set: `if ($v) { PowerCfg /hibernate off } else { PowerCfg /hibernate on }`},
  {id: 'storageSense', group: 'performance', title: 'Automatic cleanup (Storage Sense)', type: 'toggle', recommended: true, verdict: 'recommended',
    what: 'Lets Windows automatically delete temporary files and old Recycle Bin items when the drive is getting full.',
    pro: 'Your drive is less likely to fill up between cleanups.', con: 'Items older than 30 days in the Recycle Bin are removed automatically.',
    on: 'On', off: 'Off',
    get: `(RegGet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy' '01' 0) -eq 1`,
    set: `RegSet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy' '01' ([int][bool]$v)`},
  {id: 'searchIndex', group: 'performance', title: 'Turn off search indexing', type: 'toggle', recommended: false, verdict: 'situational', admin: true,
    what: 'Stops the Windows Search service, which constantly catalogues your files so searches are instant.',
    pro: 'Less background disk activity — mostly noticeable on old hard disks (HDDs).', con: 'Searching files in Start, Explorer and Outlook becomes much slower. Not worth it on an SSD.',
    on: 'Indexing off', off: 'Indexing on',
    get: `(Get-Service WSearch -ErrorAction SilentlyContinue).StartType -eq 'Disabled'`,
    set: `if ($v) { Stop-Service WSearch -Force -ErrorAction SilentlyContinue; Set-Service WSearch -StartupType Disabled } else { Set-Service WSearch -StartupType Automatic; Start-Service WSearch -ErrorAction SilentlyContinue }`},

  // ---------- Gaming ----------
  {id: 'gameMode', group: 'gaming', title: 'Game Mode', type: 'toggle', recommended: true, verdict: 'recommended',
    what: 'When a game is running, Windows gives it priority and pauses updates and notifications.',
    pro: 'Steadier frame rates and no update installs mid-game.', con: 'None for most people.',
    on: 'On', off: 'Off',
    get: `(RegGet 'HKCU:\\Software\\Microsoft\\GameBar' 'AutoGameModeEnabled' 1) -eq 1`,
    set: `RegSet 'HKCU:\\Software\\Microsoft\\GameBar' 'AutoGameModeEnabled' ([int][bool]$v)`},
  {id: 'gameDvr', group: 'gaming', title: 'Turn off background game recording', type: 'toggle', recommended: true, verdict: 'recommended',
    what: 'Stops Xbox Game Bar from continuously recording gameplay in the background ("Record what happened").',
    pro: 'Frees CPU and GPU time — often a few extra FPS.', con: 'You can no longer save the last 30 seconds of gameplay after the fact. Manual recording with Win+Alt+R still works.',
    on: 'Recording off', off: 'Recording on',
    get: `(RegGet 'HKCU:\\System\\GameConfigStore' 'GameDVR_Enabled' 1) -eq 0`,
    set: `RegSet 'HKCU:\\System\\GameConfigStore' 'GameDVR_Enabled' ([int](-not $v)); RegSet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR' 'AppCaptureEnabled' ([int](-not $v))`},
  {id: 'hags', group: 'gaming', title: 'Hardware-accelerated GPU scheduling', type: 'toggle', recommended: null, verdict: 'optional', admin: true, restart: 'reboot',
    what: 'Lets the graphics card manage its own memory instead of Windows doing it.',
    pro: 'Can reduce input lag and improve frame pacing; required for DLSS Frame Generation.', con: 'Needs a GPU from roughly 2018 or newer with a current driver. A few older games or apps can behave worse.',
    on: 'On', off: 'Off',
    get: `(RegGet 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' 'HwSchMode' 1) -eq 2`,
    set: `RegSet 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' 'HwSchMode' $(if ($v) { 2 } else { 1 })`},
  {id: 'mouseAccel', group: 'gaming', title: 'Turn off mouse acceleration', type: 'toggle', recommended: null, verdict: 'preference',
    what: 'Disables "Enhance pointer precision", so the pointer moves exactly as far as your hand does, regardless of speed.',
    pro: 'Consistent aim and muscle memory in games.', con: 'On a large screen with a slow mouse, you may need to move your hand further.',
    on: 'Acceleration off', off: 'Acceleration on',
    get: `(RegGet 'HKCU:\\Control Panel\\Mouse' 'MouseSpeed' '1') -eq '0'`,
    set: `$a = if ($v) { @(0,0,0) } else { @(6,10,1) }; RegSet 'HKCU:\\Control Panel\\Mouse' 'MouseThreshold1' ([string]$a[0]) 'String'; RegSet 'HKCU:\\Control Panel\\Mouse' 'MouseThreshold2' ([string]$a[1]) 'String'; RegSet 'HKCU:\\Control Panel\\Mouse' 'MouseSpeed' ([string]$a[2]) 'String'; Native; [void][Aster.Native]::SpiArray(0x0004, 0, [int[]]$a, 3)`},
  {id: 'stickyKeys', group: 'gaming', title: 'Stop the Sticky Keys pop-up', type: 'toggle', recommended: true, verdict: 'recommended', restart: 'signout',
    what: 'Pressing Shift five times no longer opens the "Turn on Sticky Keys?" dialog.',
    pro: 'No more interruptions when you tap Shift repeatedly in games.', con: 'If you rely on Sticky Keys as an accessibility feature, turn it on in Settings instead.',
    on: 'No pop-up', off: 'Pop-up on Shift ×5',
    get: `(RegGet 'HKCU:\\Control Panel\\Accessibility\\StickyKeys' 'Flags' '510') -eq '506'`,
    set: `RegSet 'HKCU:\\Control Panel\\Accessibility\\StickyKeys' 'Flags' $(if ($v) { '506' } else { '510' }) 'String'`},

  // ---------- Privacy & ads ----------
  {id: 'adId', group: 'privacy', title: 'Turn off advertising ID', type: 'toggle', recommended: true, verdict: 'recommended',
    what: 'Stops apps from using a unique advertising ID to show you personalised ads.',
    pro: 'Apps can’t track you across each other for advertising.', con: 'Ads in apps are less personalised (you still see ads).',
    on: 'Off', off: 'On',
    get: `(RegGet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo' 'Enabled' 1) -eq 0`,
    set: `RegSet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo' 'Enabled' ([int](-not $v))`},
  {id: 'tips', group: 'privacy', title: 'Turn off tips, suggestions and lock-screen ads', type: 'toggle', recommended: true, verdict: 'recommended',
    what: 'Removes "Get even more out of Windows" screens, app suggestions in Start, tips notifications and promotional content on the lock screen.',
    pro: 'Fewer pop-ups and ads, and Windows stops silently installing suggested apps.', con: 'You won’t see tips about new Windows features.',
    on: 'Off', off: 'On',
    get: `((RegGet $CDM 'SubscribedContent-338389Enabled' 1) -eq 0) -and ((RegGet $CDM 'SystemPaneSuggestionsEnabled' 1) -eq 0)`,
    set: `$x = [int](-not $v); foreach ($n in @('SubscribedContent-338389Enabled','SubscribedContent-338388Enabled','SubscribedContent-310093Enabled','SubscribedContent-338387Enabled','SubscribedContent-353694Enabled','SubscribedContent-353696Enabled','SystemPaneSuggestionsEnabled','SoftLandingEnabled','SilentInstalledAppsEnabled','RotatingLockScreenOverlayEnabled')) { RegSet $CDM $n $x }`},
  {id: 'webSearch', group: 'privacy', title: 'Search only this PC in Start', type: 'toggle', recommended: true, verdict: 'recommended', restart: 'explorer',
    what: 'Stops the Start menu search from sending what you type to Bing and showing web results.',
    pro: 'Faster, private search results — only your apps, files and settings.', con: 'No quick web answers in Start. Windows may say “Some settings are managed by your organization”.',
    on: 'This PC only', off: 'PC + web',
    get: `(RegGet 'HKCU:\\Software\\Policies\\Microsoft\\Windows\\Explorer' 'DisableSearchBoxSuggestions' 0) -eq 1`,
    set: `if ($v) { RegSet 'HKCU:\\Software\\Policies\\Microsoft\\Windows\\Explorer' 'DisableSearchBoxSuggestions' 1 } else { RegDel 'HKCU:\\Software\\Policies\\Microsoft\\Windows\\Explorer' 'DisableSearchBoxSuggestions' }`},
  {id: 'telemetry', group: 'privacy', title: 'Send only required diagnostic data', type: 'toggle', recommended: null, verdict: 'optional', admin: true,
    what: 'Limits the diagnostic data Windows sends to Microsoft to the required minimum.',
    pro: 'Less data about how you use your PC leaves your computer.', con: 'Windows shows “Some settings are managed by your organization” on the diagnostics page.',
    on: 'Required only', off: 'Windows default',
    get: `(RegGet 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection' 'AllowTelemetry' 3) -le 1`,
    set: `if ($v) { RegSet 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection' 'AllowTelemetry' 1 } else { RegDel 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection' 'AllowTelemetry' }`},

  // ---------- Windows settings: appearance ----------
  {id: 'appTheme', group: 'appearance', title: 'App colour mode', type: 'choice', recommended: null, verdict: 'preference',
    what: 'Whether apps (Settings, Explorer, Store and others) use a light or dark theme.',
    options: [{value: 'light', label: 'Light'}, {value: 'dark', label: 'Dark'}],
    get: `if ((RegGet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize' 'AppsUseLightTheme' 1) -eq 1) { 'light' } else { 'dark' }`,
    set: `RegSet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize' 'AppsUseLightTheme' $(if ($v -eq 'light') { 1 } else { 0 }); Broadcast 'ImmersiveColorSet'`},
  {id: 'systemTheme', group: 'appearance', title: 'Windows colour mode', type: 'choice', recommended: null, verdict: 'preference',
    what: 'Whether the taskbar, Start menu and notifications are light or dark.',
    options: [{value: 'light', label: 'Light'}, {value: 'dark', label: 'Dark'}],
    get: `if ((RegGet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize' 'SystemUsesLightTheme' 0) -eq 1) { 'light' } else { 'dark' }`,
    set: `RegSet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize' 'SystemUsesLightTheme' $(if ($v -eq 'light') { 1 } else { 0 }); Broadcast 'ImmersiveColorSet'`},

  // ---------- Windows settings: File Explorer ----------
  {id: 'showExt', group: 'explorer', title: 'Show file extensions', type: 'toggle', recommended: true, verdict: 'recommended', restart: 'explorer',
    what: 'Shows the end of file names, like ".pdf" or ".exe".',
    pro: 'You can see what a file really is — protects against fakes like "invoice.pdf.exe".', con: 'File names look a bit longer.',
    on: 'Shown', off: 'Hidden',
    get: `(RegGet $ADV 'HideFileExt' 1) -eq 0`, set: `RegSet $ADV 'HideFileExt' ([int](-not $v)); Broadcast 'ShellState'`},
  {id: 'showHidden', group: 'explorer', title: 'Show hidden files', type: 'toggle', recommended: null, verdict: 'preference', restart: 'explorer',
    what: 'Shows files and folders marked as hidden, such as AppData.',
    pro: 'Useful when you need to find app data or troubleshoot.', con: 'More clutter in folders, and it is easier to delete something important.',
    on: 'Shown', off: 'Hidden',
    get: `(RegGet $ADV 'Hidden' 2) -eq 1`, set: `RegSet $ADV 'Hidden' $(if ($v) { 1 } else { 2 }); Broadcast 'ShellState'`},
  {id: 'launchTo', group: 'explorer', title: 'File Explorer opens to', type: 'choice', recommended: null, verdict: 'preference', restart: 'explorer',
    what: 'The page you see when you open File Explorer.',
    options: [{value: 'home', label: 'Home'}, {value: 'pc', label: 'This PC'}],
    get: `if ((RegGet $ADV 'LaunchTo' 2) -eq 1) { 'pc' } else { 'home' }`, set: `RegSet $ADV 'LaunchTo' $(if ($v -eq 'pc') { 1 } else { 2 })`},
  {id: 'classicMenu', group: 'explorer', title: 'Classic right-click menu', type: 'toggle', recommended: null, verdict: 'preference', restart: 'explorer', win11: true,
    what: 'Brings back the full Windows 10 right-click menu instead of the short Windows 11 menu with “Show more options”.',
    pro: 'All options in one click — no more “Show more options”.', con: 'Loses the modern look of the Windows 11 menu.',
    on: 'Classic', off: 'Windows 11 style',
    get: `Test-Path 'HKCU:\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32'`,
    set: `$k = 'HKCU:\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}'; if ($v) { New-Item -Path ($k + '\\InprocServer32') -Force | Out-Null; Set-ItemProperty -LiteralPath ($k + '\\InprocServer32') -Name '(default)' -Value '' } else { Remove-Item -LiteralPath $k -Recurse -Force -ErrorAction SilentlyContinue }`},

  // ---------- Windows settings: taskbar & input ----------
  {id: 'taskbarAlign', group: 'taskbar', title: 'Taskbar alignment', type: 'choice', recommended: null, verdict: 'preference', win11: true,
    what: 'Whether taskbar icons and the Start button sit in the centre or on the left.',
    options: [{value: 'center', label: 'Center'}, {value: 'left', label: 'Left'}],
    get: `if ((RegGet $ADV 'TaskbarAl' 1) -eq 0) { 'left' } else { 'center' }`, set: `RegSet $ADV 'TaskbarAl' $(if ($v -eq 'left') { 0 } else { 1 }); Broadcast 'TraySettings'`},
  {id: 'searchBox', group: 'taskbar', title: 'Search on the taskbar', type: 'choice', recommended: null, verdict: 'preference',
    what: 'How search appears on the taskbar.',
    options: [{value: 0, label: 'Hidden'}, {value: 1, label: 'Icon'}, {value: 2, label: 'Search box'}],
    get: `[int](RegGet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Search' 'SearchboxTaskbarMode' 2)`, set: `RegSet 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Search' 'SearchboxTaskbarMode' ([int]$v); Broadcast 'TraySettings'`},
  {id: 'taskView', group: 'taskbar', title: 'Task view button', type: 'toggle', recommended: null, verdict: 'preference',
    what: 'The button that shows all open windows and virtual desktops (also Win+Tab).',
    pro: 'Quick access to virtual desktops.', con: 'Takes taskbar space; Win+Tab does the same.',
    on: 'Shown', off: 'Hidden',
    get: `(RegGet $ADV 'ShowTaskViewButton' 1) -eq 1`, set: `RegSet $ADV 'ShowTaskViewButton' ([int][bool]$v); Broadcast 'TraySettings'`},
  {id: 'endTask', group: 'taskbar', title: '“End task” in taskbar right-click menu', type: 'toggle', recommended: true, verdict: 'recommended', win11: true,
    what: 'Adds “End task” when you right-click an app on the taskbar, so you can close a frozen app without Task Manager.',
    pro: 'Close frozen apps in two clicks.', con: 'Unsaved work in that app is lost if you use it.',
    on: 'Shown', off: 'Hidden',
    get: `(RegGet ($ADV + '\\TaskbarDeveloperSettings') 'TaskbarEndTask' 0) -eq 1`, set: `RegSet ($ADV + '\\TaskbarDeveloperSettings') 'TaskbarEndTask' ([int][bool]$v)`},
  {id: 'clipboardHistory', group: 'taskbar', title: 'Clipboard history (Win+V)', type: 'toggle', recommended: true, verdict: 'recommended',
    what: 'Remembers the last things you copied; press Win+V to paste any of them.',
    pro: 'Paste something you copied earlier, not just the last item.', con: 'Copied passwords stay in the history until you clear it or restart.',
    on: 'On', off: 'Off',
    get: `(RegGet 'HKCU:\\Software\\Microsoft\\Clipboard' 'EnableClipboardHistory' 0) -eq 1`, set: `RegSet 'HKCU:\\Software\\Microsoft\\Clipboard' 'EnableClipboardHistory' ([int][bool]$v)`}
];

const GROUPS = {
  performance: 'Performance', gaming: 'Gaming', privacy: 'Privacy & ads',
  appearance: 'Appearance', explorer: 'File Explorer', taskbar: 'Taskbar & input'
};

function script(ids, action) {
  const pick = T.filter(t => ids.includes(t.id));
  const table = pick.map(t => `  '${t.id}' = { param($v) ${action === 'get' ? t.get : t.set} }`).join("\n");
  return HELPERS + `\n$ops = @{\n${table}\n}\n` + (action === 'get'
    ? `$out = @{}; foreach ($k in $ops.Keys) { try { $out[$k] = & $ops[$k] $null } catch { $out[$k] = $null } }; try { $out["__hiber"] = (Get-Item -LiteralPath "$env:SystemDrive\\hiberfil.sys" -Force -ErrorAction Stop).Length } catch {}; Out-Json ([pscustomobject]$out)`
    : `& $ops[$in.id] $in.value; Out-Json ([pscustomobject]@{ ok = $true })`);
}

const POWER_LIST = String.raw`
$plans = @(& "$env:SystemRoot\System32\powercfg.exe" /list | ForEach-Object {
  if ($_ -match '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s+\((.+?)\)(\s*\*)?') { [pscustomobject]@{ guid = $Matches[1]; name = $Matches[2]; active = [bool]$Matches[3] } }
})
function Idle($sub, $set) { $q = & "$env:SystemRoot\System32\powercfg.exe" /query SCHEME_CURRENT $sub $set; $hex = @($q | Select-String -Pattern '0x[0-9a-fA-F]{8}\s*$' | ForEach-Object { [Convert]::ToInt32(($_.Line -replace '.*(0x[0-9a-fA-F]{8})\s*$', '$1'), 16) }); return $hex }
$screen = Idle 'SUB_VIDEO' 'VIDEOIDLE'
$sleep = Idle 'SUB_SLEEP' 'STANDBYIDLE'
$battery = $false; try { $battery = @(Get-CimInstance Win32_Battery -OperationTimeoutSec 3).Count -gt 0 } catch {}
Out-Json ([pscustomobject]@{ plans = $plans; screenAc = $screen[-2]; screenDc = $screen[-1]; sleepAc = $sleep[-2]; sleepDc = $sleep[-1]; battery = $battery })
`;

const PROCESSES = String.raw`
$protected = @('System','Idle','Registry','smss','csrss','wininit','winlogon','services','lsass','svchost','fontdrvhost','dwm','Memory Compression','MsMpEng','SecurityHealthService','spoolsv','audiodg','sihost','ctfmon','RuntimeBroker','conhost','LsaIso','NisSrv','powershell')
$groups = Get-Process | Group-Object ProcessName | ForEach-Object {
  $first = $_.Group | Select-Object -First 1
  [pscustomobject]@{ name = $_.Name; count = $_.Count; memory = [int64](($_.Group | Measure-Object WorkingSet64 -Sum).Sum); cpu = [double](($_.Group | Measure-Object CPU -Sum).Sum); path = $first.Path; protected = ($protected -contains $_.Name) }
} | Sort-Object memory -Descending | Select-Object -First 18
$out = foreach ($g in $groups) {
  $desc = $null; $company = $null
  try { if ($g.path) { $vi = (Get-Item -LiteralPath $g.path -ErrorAction Stop).VersionInfo; $desc = $vi.FileDescription; $company = $vi.CompanyName } } catch {}
  $g | Add-Member -NotePropertyName description -NotePropertyValue $desc -PassThru | Add-Member -NotePropertyName company -NotePropertyValue $company -PassThru
}
Out-Json @($out)
`;

class Tweaks {
  constructor({store, isAdmin, buildNumber}) { this.store = store; this.isAdmin = isAdmin; this.buildNumber = buildNumber; }

  async list({groups}) {
    const build = await this.buildNumber();
    const defs = T.filter(t => groups.includes(t.group) && (!t.win11 || build >= 22000));
    const values = await psJson(script(defs.map(t => t.id), 'get'), null, {timeout: 60000});
    const hiberBytes = Number.isFinite(values?.__hiber) ? values.__hiber : null;
    return {groups: GROUPS, items: defs.map(t => ({
      id: t.id, group: t.group, title: t.title, type: t.type, what: t.what, pro: t.pro || null, con: t.con || null,
      on: t.on || null, off: t.off || null, options: t.options || null, recommended: t.recommended, verdict: t.verdict,
      admin: !!t.admin, restart: t.restart || null, value: values?.[t.id] ?? null,
      extra: t.id === 'hibernation' && hiberBytes ? {bytes: hiberBytes} : null
    }))};
  }

  async set({id, value}) {
    const t = T.find(x => x.id === id);
    if (!t) throw new Error('Unknown setting');
    if (t.type === 'toggle' && typeof value !== 'boolean') throw new Error('Invalid value');
    if (t.type === 'choice' && !t.options.some(o => o.value === value)) throw new Error('Invalid value');
    const before = (await psJson(script([id], 'get')))?.[id];
    try { await psJson(script([id], 'set'), {id, value}, {timeout: 120000}); }
    catch (e) { throw /access|denied|unauthori|administrator|privilege/i.test(e.message) ? new Error('This change needs administrator rights. Use "Restart as administrator".') : e; }
    const after = (await psJson(script([id], 'get')))?.[id];
    const label = v => t.type === 'toggle' ? (v ? t.on : t.off) : t.options.find(o => o.value === v)?.label ?? String(v);
    this.store.log({kind: 'tweak', title: `${t.title}: ${label(before)} → ${label(after)}`});
    return {ok: true, value: after};
  }

  async power() {
    const r = await psJson(POWER_LIST, null, {timeout: 30000});
    return {...r, plans: arr(r.plans)};
  }
  async setPower({guid, screen, sleep}) {
    const pc = (...a) => run(sys32('powercfg.exe'), a, {timeout: 20000});
    if (guid) {
      if (!/^[0-9a-f-]{36}$/i.test(guid)) throw new Error('Invalid plan');
      await pc('/setactive', guid);
      this.store.log({kind: 'tweak', title: 'Changed power plan'});
    }
    for (const [key, val] of [['monitor', screen], ['standby', sleep]]) {
      if (val == null) continue;
      const min = Math.max(0, Math.min(600, Math.round(Number(val))));
      await pc('/change', `${key}-timeout-ac`, String(min));
      await pc('/change', `${key}-timeout-dc`, String(min));
      this.store.log({kind: 'tweak', title: `${key === 'monitor' ? 'Turn off screen' : 'Sleep'} after: ${min ? min + ' min' : 'never'}`});
    }
    return this.power();
  }
  async addHighPerformance() {
    // The High performance scheme is hidden on many modern laptops; duplicating it makes it selectable.
    const out = await run(sys32('powercfg.exe'), ['-duplicatescheme', '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'], {timeout: 20000});
    const guid = (String(out).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) || [])[0];
    if (guid) await run(sys32('powercfg.exe'), ['/setactive', guid], {timeout: 20000});
    this.store.log({kind: 'tweak', title: 'Added and activated the High performance power plan'});
    return this.power();
  }

  async processes() { return {items: arr(await psJson(PROCESSES, null, {timeout: 30000}))}; }
  async endProcess({name}) {
    if (typeof name !== 'string' || !/^[\w .+-]{1,100}$/.test(name)) throw new Error('Invalid process');
    const list = arr(await psJson(PROCESSES, null, {timeout: 30000}));
    const p = list.find(x => x.name === name);
    if (!p || p.protected) throw new Error('This process is part of Windows and cannot be closed by Aster.');
    await run(sys32('taskkill.exe'), ['/IM', `${name}.exe`, '/T'], {timeout: 20000}).catch(() => run(sys32('taskkill.exe'), ['/IM', `${name}.exe`, '/T', '/F'], {timeout: 20000}));
    this.store.log({kind: 'tool', title: `Closed ${p.description || name}`});
    return {ok: true};
  }

  async restartExplorer() {
    await run(sys32('taskkill.exe'), ['/IM', 'explorer.exe', '/F'], {timeout: 15000}).catch(() => {});
    await new Promise(r => setTimeout(r, 1200));
    // Windows usually restarts Explorer by itself; start it if it did not.
    const tl = await run(sys32('tasklist.exe'), ['/FI', 'IMAGENAME eq explorer.exe', '/NH'], {timeout: 10000}).catch(() => '');
    if (!/explorer\.exe/i.test(tl)) require('node:child_process').spawn(require('node:path').join(process.env.SystemRoot || 'C:\\Windows', 'explorer.exe'), {detached: true, stdio: 'ignore'}).unref();
    return {ok: true};
  }
}

module.exports = {Tweaks, TWEAKS: T};
