---
name: app-manager
description: Manage desktop-organizer app lifecycle — start, stop, restart, and run in dev mode with hot-reload. Use when asked to start/stop/restart the app, enable hot-reload, or run in development mode.
---

Desktop Shortcut Organizer (桌面图标收纳盒) — app lifecycle manager with hot-reload support.

## Prerequisites

- **Node.js** v20+ and **pnpm** (or npm)
- **Windows** — the app uses PowerShell for .lnk parsing

## Setup

```bash
pnpm install
```

If Electron binary is missing (pnpm v9+ blocks postinstall), run `pnpm approve-builds` or switch to `npm install`.

## Commands

### Start (production mode)

```bash
node .claude/skills/app-manager/driver.mjs start
```

### Start (dev mode with hot-reload)

```bash
node .claude/skills/app-manager/driver.mjs dev
```

Watches `src/` directory for changes and auto-restarts the app.

### Restart

```bash
node .claude/skills/app-manager/driver.mjs restart
```

Kills existing Electron processes and restarts the app.

### Stop

```bash
node .claude/skills/app-manager/driver.mjs stop
```

Kills all Electron processes without restarting.

## Pipe commands

```bash
printf "start\n" | node .claude/skills/app-manager/driver.mjs
printf "dev\n" | node .claude/skills/app-manager/driver.mjs
printf "restart\n" | node .claude/skills/app-manager/driver.mjs
printf "stop\n" | node .claude/skills/app-manager/driver.mjs
```

## Interactive REPL

```bash
node .claude/skills/app-manager/driver.mjs
```

Then type commands: `start`, `dev`, `restart`, `stop`, `quit`

## Notes

- Dev mode watches `src/` directory and auto-restarts on file changes
- Use `stop` to cleanly shut down and avoid orphan processes
- Debug mode available via `--debug` flag on `start`/`dev`
