# Security policy

Aster deletes files, edits the registry, changes startup items and system settings, and runs uninstallers and package managers. Security reports matter.

## Supported versions

Only the [latest release](https://github.com/Nikita-Shulga/Aster/releases/latest) gets fixes.

## Reporting a vulnerability

Please report it **privately**:

- through GitHub: **[Security → Report a vulnerability](https://github.com/Nikita-Shulga/Aster/security/advisories/new)**, or
- through the contact details at [nikitashulga.com](https://nikitashulga.com).

Don't open a public issue. Please include:

- what an attacker could do, and what they'd need first (local access, a crafted file or folder name, a malicious registry value…);
- steps to reproduce, and the Aster version and OS;
- whether it's already public anywhere.

You'll get an acknowledgement within a week. Once a fix is released, you'll be credited in the changelog if you'd like.

## Things that are in scope

- Anything that makes Aster delete, move or change something the user didn't confirm, or outside the locations it shows.
- Path handling in the cleaner, disk analyzer and leftover scanners (links, junctions, crafted names).
- Command execution: PowerShell scripts, `reg.exe`, WinGet, `launchctl`, `defaults`, the macOS administrator prompt.
- The renderer sandbox and the main-process IPC handling.
- Registry backups and restore.
