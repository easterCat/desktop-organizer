---
name: electron-troubleshooting
description: "Troubleshoot and fix Electron desktop app startup failures, dependency installation issues, and build problems. Use this skill whenever: Electron fails to start with 'failed to install correctly' errors, node_modules/electron/dist/ is missing, pnpm blocks build scripts with 'Ignored build scripts' warnings, npm/pnpm shows wrong project scripts (working directory drift), Electron binary downloads are slow or timeout in China/Asia, you need to set up ELECTRON_MIRROR for faster downloads, or when diagnosing any Electron postinstall script failures. Also applies to general Node.js dependency issues involving native modules or platform-specific binaries."
---

# Electron Desktop App Troubleshooting

This skill helps diagnose and fix common issues when working with Electron desktop applications, particularly on Windows with pnpm/npm dependency management.

## Quick Diagnostic Flow

When an Electron app fails to start, run through these checks in order:

```bash
# 1. Check if Electron binary exists
ls node_modules/electron/dist/electron.exe 2>/dev/null && echo "OK" || echo "MISSING"

# 2. Check current working directory (pnpm can drift into nested dirs)
pwd

# 3. Check which package manager's lock file exists
ls -la package-lock.json pnpm-lock.yaml 2>/dev/null

# 4. Check for pnpm build script warnings
npm run 2>&1 | head -5
```

## Problem 1: Electron Binary Missing

### Symptom
```
Error: Electron failed to install correctly, please delete node_modules/electron and try installing again
```

The `node_modules/electron/dist/` directory doesn't exist, meaning the postinstall script that downloads the platform-specific binary never ran or failed silently.

### Root Cause

pnpm v9+ blocks third-party package build scripts by default for security. Electron's `postinstall` script downloads `electron.exe` (Windows) or the equivalent binary, but pnpm prevents it from running. The install appears to succeed, but the binary is never downloaded.

Look for this warning during `pnpm install`:
```
╭ Warning ─────────────────────────────────────────╮
│ Ignored build scripts: electron@28.3.3.          │
│ Run "pnpm approve-builds" to pick which deps...  │
╰──────────────────────────────────────────────────╯
```

### Fix

**Option A: Switch to npm (simplest, recommended for Electron projects)**
```bash
rm -rf node_modules package-lock.json pnpm-lock.yaml
npm install
```

npm doesn't block build scripts, so Electron's postinstall runs automatically.

**Option B: Configure pnpm to allow Electron's build scripts**

Add to `package.json`:
```json
{
  "pnpm": {
    "onlyBuiltDependencies": ["electron"]
  }
}
```

Then reinstall:
```bash
pnpm install
```

**Option C: Interactive approval**
```bash
pnpm approve-builds
# Select electron with spacebar, press Enter to confirm
```

### Verify
```bash
ls node_modules/electron/dist/electron.exe  # Should exist
cat node_modules/electron/path.txt           # Should show path to electron.exe
```

## Problem 2: Working Directory Drift

### Symptom
```bash
npm run
# Shows: "Lifecycle scripts included in electron@28.3.3"
# Instead of: "Lifecycle scripts included in your-project@1.0.0"
```

Running `npm` or `pnpm` commands operates on a dependency package instead of your project.

### Root Cause

The shell's working directory has shifted into a nested `node_modules` path, often `node_modules/.pnpm/electron@28.3.3/node_modules/electron/...`. This can happen when `npm install` changes directories during execution, or when navigating the filesystem carelessly.

### Fix
```bash
# Verify the issue
pwd
# If it shows a node_modules path, go back to project root:
cd /path/to/your/project

# Verify fix
npm run
# Should show your project name
```

### Prevention
- Always run `pwd` before `npm install` to confirm you're in the project root
- Use absolute paths in scripts: `npm --prefix /path/to/project install`

## Problem 3: Slow/Failed Electron Downloads

### Symptom

Electron postinstall hangs or times out. The `node_modules/electron/dist/` directory is empty or missing after a seemingly successful install.

### Root Cause

Electron binaries are hosted on GitHub Releases, which can be extremely slow or blocked in certain regions (especially China).

### Fix

Use the npmmirror CDN for Electron binaries:

```bash
# One-time install with mirror
ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/ npm install

# Permanent setup (add to shell profile)
# Windows PowerShell ($PROFILE):
$env:ELECTRON_MIRROR="https://registry.npmmirror.com/-/binary/electron/"

# Windows CMD:
set ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/

# Linux/Mac (~/.bashrc or ~/.zshrc):
export ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/
```

## Problem 4: Mixed Package Manager Lock Files

### Symptom

Dependency resolution errors, inconsistent behavior between installs, or "missing peer dependency" warnings that don't make sense.

### Root Cause

Both `pnpm-lock.yaml` and `package-lock.json` exist in the project. Different team members or CI systems may use different package managers, leading to dependency version conflicts.

### Fix
```bash
# 1. Determine which package manager the project uses
cat package.json | grep -E "packageManager|engines"

# 2. Clean everything
rm -rf node_modules pnpm-lock.yaml package-lock.json

# 3. Reinstall with the correct package manager
# For npm (recommended for Electron):
npm install

# For pnpm (requires build script approval):
pnpm install
```

## Problem 5: Electron Postinstall Runs But Binary Still Missing

### Symptom

The postinstall script appears to run (no error, exit code 0) but `electron.exe` is still not present.

### Root Cause

The download succeeded but extracted to the wrong location, or the script silently failed due to network issues without proper error propagation.

### Debug Steps
```bash
# Check if the install script exists
ls node_modules/electron/install.js

# Run it manually with verbose output
cd node_modules/electron && node install.js

# Check the Electron package version
cat node_modules/electron/package.json | grep version

# Try with explicit mirror
ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/ node node_modules/electron/install.js
```

## Standard Startup Verification

Use this checklist to verify an Electron app is ready to run:

```bash
# 1. Enter project directory
cd /path/to/project

# 2. Verify dependency health
ls node_modules/electron/dist/electron.exe 2>/dev/null && echo "Electron: OK" || echo "Electron: MISSING"

# 3. Install if needed (npm avoids pnpm build script issues)
npm install

# 4. Start the application
npm start

# 5. Check runtime logs (Windows)
cat "$APPDATA/your-app-name/app.log" | tail -10
```

Success indicators:
- Console output matching your app's startup message
- `[INFO]` level log entries (no `[ERROR]`)
- Application window or tray icon appears

## Command Reference

| Task | Command |
|------|---------|
| Clean reinstall | `rm -rf node_modules package-lock.json && npm install` |
| Start dev mode | `npm start` |
| Build installer | `npm run build` |
| Package without installer | `npm run pack` |
| Check Electron binary | `ls node_modules/electron/dist/electron.exe` |
| View app logs (Windows) | `cat "$APPDATA/your-app/app.log"` |
| Approve pnpm builds | `pnpm approve-builds` |
