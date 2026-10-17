# Dependency status

The application core, native collectors and renderer have no third-party runtime JavaScript dependencies. Electron provides the native shell and Chromium runtime. Electron 44.8.0 and electron-builder 26.15.3 were pinned from the npm registry during this build; package-lock.json records resolution.

The lockfile audit was run without installing or executing dependencies. Production-only npm audit reported zero advisories. **That is not a security certification and does not cover all native Electron/Chromium risks.**

The full development-tooling audit reported eight moderate dependency-path alerts rooted in `sprintf-js` (GHSA-hp3w-g68c-fv3c: unbounded precision denial of service), through the packaging/download logging chain. No high or critical alerts were reported. This is historical audit evidence; the machine-local raw report is not included in this private source upload. It has not been rerun as part of repository creation. The suggested automated remedy is a packaging-tool downgrade, not a confirmed compatible patch, so no blind forced downgrade or incompatible override was applied.

Before public release, review and resolve/accept these build-tool advisories with a documented threat assessment, update tooling where supported, run clean native builds and audit the exact distributed artifacts. Do not feed untrusted format strings to build tools. Native installer signing, notarization and third-party license/SBOM review remain separate release gates.
