---
name: run-desktop-organizer
description: Build, run, and drive the desktop-organizer Electron app. Use when asked to start desktop-organizer, run its tests, build it, take a screenshot of its UI, or interact with the running app. Also use for "screenshot the app", "click a button in desktop-organizer", or "evaluate JS in the Electron window".
---

Desktop Shortcut Organizer (桌面图标收纳盒) — a Windows Electron app that scans desktop .lnk/.url shortcuts and organizes them into named "boxes" as floating desktop widgets. Drive it via `.claude/skills/run-desktop-organizer/driver.mjs` which launches Electron with `--remote-debugging-port` and connects via Playwright CDP.

All paths below are relative to the project root.

## Prerequisites

- **Node.js** v20+ and **pnpm** (or npm)
- **Playwright** (installed as dev dependency)
- **Windows** — the app uses PowerShell for .lnk parsing and icon extraction

## Setup

```bash
pnpm install
```

If Electron binary is missing (pnpm v9+ blocks postinstall), run `pnpm approve-builds` or switch to `npm install`.

## Build

```bash
pnpm run pack       # portable unpacked build → dist/win-unpacked/
pnpm run build      # NSIS installer → dist/桌面图标收纳盒 Setup x.x.x.exe
```

## Run (agent path)

The driver launches Electron, connects via CDP, and provides a command REPL.

**Single-command mode** (pipe commands):

```bash
printf "launch\nss\nbodyText\nquit" | node .claude/skills/run-desktop-organizer/driver.mjs
```

**Interactive REPL** (for tmux wrapping):

```bash
node .claude/skills/run-desktop-organizer/driver.mjs
```

Then send commands via stdin:

| command | what it does |
|---|---|
| `launch` | Launch Electron, connect via CDP. Must be called first. |
| `ss [label]` | Take a screenshot. Saves to `screenshots/<label>.png`. Default label: `ss-000`, `ss-001`, … |
| `click <selector>` | Click a CSS selector, e.g. `click .btn-create` |
| `type <selector> <text>` | Fill an input field, e.g. `type #box-name "Office"` |
| `eval <js>` | Evaluate JavaScript in the page, e.g. `eval document.title` |
| `bodyText [maxLen]` | Print visible page text (default 2000 chars) |
| `wait [ms]` | Wait N milliseconds (default 2000) |
| `quit` | Kill Electron and exit |

**Key CSS selectors** (verified against the running app):

| Selector | Element |
|---|---|
| `.btn-create` | "+ 新建" button in toolbar |
| `.titlebar` | Custom window titlebar |
| `.box-section` | Each named box card |
| `.shortcut-item` | Individual shortcut icon inside a box |
| `.unassigned-section` | "未分类" (unassigned) section |
| `.search-wrap` | Search input in toolbar |

**tmux wrapper** (for long-running sessions):

```bash
tmux new-session -d -s organizer -x 200 -y 50
tmux send-keys -t organizer 'node .claude/skills/run-desktop-organizer/driver.mjs' Enter
sleep 2
tmux send-keys -t organizer 'launch' Enter
timeout 15 bash -c 'until tmux capture-pane -t organizer -p | grep -q "Connected"; do sleep 0.5; done'
tmux send-keys -t organizer 'ss main-view' Enter
tmux capture-pane -t organizer -p
```

Screenshots → `screenshots/` directory at project root.

## Run (human path)

```bash
pnpm start    # → launches Electron window. Ctrl-C or close window to stop.
```

The app hides to system tray on close (double-click tray to restore). Use tray menu → "退出" to fully quit.

## Test

No test suite exists. Use the driver to manually verify UI behavior:

```bash
printf "launch\nss\nbodyText\nquit" | node .claude/skills/run-desktop-organizer/driver.mjs
```

## Gotchas

- **Playwright `_electron` API does not work** — Electron 28.3.3's stderr output (GPU cache errors, PowerShell errors) interferes with Playwright's launch detection. The driver uses `--remote-debugging-port` + `chromium.connectOverCDP()` instead, which is reliable.
- **Multiple windows on launch** — The app restores previously saved desktop floating boxes. The driver always selects the main management window (`renderer/index.html`), not the floating box windows (`desktop-box/index.html`).
- **PowerShell errors on stderr** — Non-fatal. The app falls back gracefully when `Get-PSDrive` fails (e.g. running in Git Bash where drive letter parsing differs).
- **GPU cache errors** — `Unable to move the cache` / `Gpu Cache Creation failed` on stderr are cosmetic Electron warnings, not app errors.
- **`ELECTRON_RUN_AS_NODE` must be unset** — The driver removes this env var before spawning. If you launch Electron manually, ensure it's not set.

## Troubleshooting

- **"Cannot find electron binary"**: Run `pnpm install`. If pnpm blocks the postinstall, run `pnpm approve-builds` and select `electron`.
- **"Process failed to launch!"**: The driver timed out waiting for DevTools. Check if another Electron instance is using the same debug port, or try `taskkill /f /im electron.exe` to clear stuck processes.
- **"Timeout waiting for DevTools"**: Electron crashed on startup. Check stderr output — usually a missing dependency or working directory issue.
- **App shows empty "未分类" with no shortcuts**: Normal on a fresh install. The app scans the user's Desktop folder for .lnk/.url files on launch.
