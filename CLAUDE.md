# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Desktop Organizer (桌面图标收纳盒) is a Windows Electron app that organizes desktop shortcuts (.lnk/.url files) into categorized "boxes" with a glassmorphism UI. It features a main management panel and floating desktop widget windows.

## Commands

```bash
# Development (with file watching + auto-restart)
npm run dev

# Production build (creates installer)
npm run build

# Package without installer
npm run pack

# Start (one-shot launch, detached)
npm start

# Debug mode (enables remote debugging on port 9222)
npm run dev -- --debug
```

## Architecture

### Process Model
- **Main Process** ([src/main.js](src/main.js)): Core Electron process handling file system operations, window management, config persistence, and Windows system integration (PowerShell, .lnk parsing, icon extraction)
- **Main Renderer** ([src/renderer/](src/renderer/)): Management panel UI with box/shortcut management, drag-drop, settings
- **Desktop Box Renderers** ([src/desktop-box/](src/desktop-box/)): Independent BrowserWindow instances for each floating desktop widget (frameless, transparent, always-on-top)

### IPC Bridge
- [src/preload.js](src/preload.js): Main window preload exposing `window.api` via contextBridge
- [src/desktop-box/preload.js](src/desktop-box/preload.js): Desktop box preload with similar API
- All IPC uses `ipcRenderer.invoke()` (async) with handlers defined in main.js

### Data Flow
- Config stored at `{APP_ROOT}/datas/config.json` (version 2 schema)
- Desktop shortcuts are backed up to `{APP_ROOT}/icons/shortcuts/` when "collected" into boxes
- Icon extraction uses PowerShell scripts in [src/ps/](src/ps/) (extract-icon.ps1, parse-lnk.ps1)
- Icons cached in memory (Map) + disk (`{APP_ROOT}/icons/*.png`)

### Key Concepts
- **Boxes**: Categorized containers for shortcuts. Each box has `id`, `name`, `items[]`, `desktopPos`, `desktopSize`, `onDesktop`, `collapsed`, `displayMode`, `sortMode`
- **Unassigned**: Shortcut items not yet in any box
- **Hidden Items**: Desktop shortcuts moved to backup directory (tracked in `config.hiddenItems[]`)
- **Quick Organize**: Auto-categorizes unassigned items using 4-level scoring (PRD §5.5): exact match (3) > box-contains-name (2) > name-contains-box (1) > no match (0)

### Window Types
- **Main Window**: Frameless (custom titlebar), 960×700 default, min 720×500
- **Desktop Boxes**: Transparent, frameless, resizable, skip taskbar, default 260×320

## UI Design System

The app uses a glassmorphism design with CSS variables defined in [docs/DESIGN.md](docs/DESIGN.md):
- Main window: [src/renderer/styles.css](src/renderer/styles.css) (`:root` with `--glass-*`, `--text-*`, `--radius-*`, `--space-*`)
- Floating boxes: [src/desktop-box/style.css](src/desktop-box/style.css) (`:root` with `--glass-bg`, `--glass-light-*`)

Key design tokens:
- Background: Dark gradients with `backdrop-filter: blur()`
- Text: White at varying opacity levels (primary 0.88, secondary 0.50, tertiary 0.22)
- Accent: Green batch color `rgba(62,218,170, 0.65)`
- Danger: Red `#e05555`

## File Structure

```
src/
├── main.js              # Main process (all IPC handlers, config, file ops)
├── preload.js           # Main window preload (contextBridge API)
├── renderer/            # Management panel UI
│   ├── index.html
│   ├── app.js           # Main renderer logic
│   └── styles.css       # Design tokens + component styles
├── desktop-box/         # Floating desktop widget
│   ├── index.html
│   ├── app.js           # Widget logic
│   ├── preload.js       # Widget preload
│   └── style.css        # Widget styles
└── ps/                  # PowerShell scripts (asar-unpacked)
    ├── extract-icon.ps1
    └── parse-lnk.ps1
```

## Development Notes

- Electron version: 28.3.3
- Single instance lock enforced (second instance focuses existing window)
- Close window hides to system tray (UX-01), not quit
- Config version migration handled in `loadConfig()` with dirty flag
- PowerShell path detected at startup from `%SystemRoot%\System32\WindowsPowerShell\v1.0\`
- Icons extracted synchronously during shortcut scanning (blocks main thread briefly)
- Position/size saves use 300ms debounce (PERF-03)
- Desktop box position validated against display bounds on restore (F-16b)
