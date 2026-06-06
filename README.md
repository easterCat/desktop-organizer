<p align="center">
  <img src="assets/icon.ico" width="96" alt="Desktop Organizer Icon">
</p>

<h1 align="center">Windows Desktop Organizer</h1>

<p align="center">
  <strong>Desktop Shortcut Manager & Floating Widget</strong><br>
  A Windows desktop organizer that categorizes, manages, and gives you instant access to shortcuts with style.
</p>

<p align="center">
  <a href="README_CN.md">🇨🇳 中文文档</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows%2010%2F11-blue?logo=windows" alt="Platform">
  <img src="https://img.shields.io/badge/electron-28.3.3-purple?logo=electron" alt="Electron">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/version-1.2.6-orange" alt="Version">
</p>

<p align="center">
  <a href="https://github.com/easterCat/desktop-organizer/releases/latest">
    <img src="https://img.shields.io/badge/⬇️_Download-latest_release-blue?style=for-the-badge" alt="Download">
  </a>
</p>

 ### Download

 | Version | File | Link |
 |---------|------|------|
 | v1.2.6 (Latest) | 桌面图标收纳盒 Setup 1.2.6.exe | [Direct Download](https://github.com/easterCat/desktop-organizer/releases/download/v1.2.6/Setup.1.2.6.exe) |

 [View all releases](https://github.com/easterCat/desktop-organizer/releases)

 ---

 ### 🎬 Demo

<p align="center">
  <img src="screenshots/demo.gif" width="800" alt="Desktop Organizer Demo">
</p>

<details>
<summary>📺 视频演示 (Video Demo)</summary>
<p align="center">
  <!-- 如有录制视频，替换为视频链接 -->
  <!-- <a href="https://youtu.be/your-video-id"><img src="screenshots/video-thumbnail.png" width="800" alt="Video Demo"></a> -->
</p>
</details>

A **Windows desktop organizer** built with Electron that turns your desktop into a clean, organized workspace. This **desktop shortcut manager** lets you sort `.lnk` / `.url` files into customizable "boxes" — with **floating desktop widget** panels, quick-organize, icon caching, and a glass-morphism dark UI.

## Screenshots

### Main Window

The primary management interface — create boxes, drag shortcuts between them, and quick-organize with one click.

<p align="center">
  <img src="screenshots/main-window.png" width="800" alt="Main Window">
</p>

### Create Box Dialog

Choose a name, icon, color, and display mode (panel or floating widget) for each box.

<p align="center">
  <img src="screenshots/after-click-create.png" width="800" alt="Create Box Dialog">
</p>

### Floating Desktop Widget

Pin any box to your desktop as a transparent, always-on-top widget for instant access.

<p align="center">
  <img src="screenshots/after-eval.png" width="400" alt="Floating Desktop Widget">
</p>

### Initial Launch

On first run, the settings panel helps you configure the desktop path and display preferences.

<p align="center">
  <img src="screenshots/initial-launch.png" width="800" alt="Initial Launch">
</p>

## Why Desktop Organizer?

Windows desktops inevitably become cluttered with shortcuts over time. **Desktop Organizer** lets you categorize everything into custom "boxes" — drag and drop shortcuts, pin frequently-used apps as floating widgets on your desktop, and keep your workspace clean with one-click quick organize. No more hunting through dozens of icons.

## Features

| Feature | Description |
|---------|-------------|
| **Shortcut Scanning** | Automatically scans user & public desktop folders for `.lnk` and `.url` files |
| **Smart Categorization** | Create named boxes and drag shortcuts between them |
| **Floating Widgets** | Display any box as a transparent, frameless, always-on-top desktop widget |
| **Quick Organize** | Auto-categorize unassigned shortcuts via keyword matching against box names |
| **Icon Extraction** | Extracts program icons from `.exe`, `.dll`, `.ico` via PowerShell with multi-level caching |
| **Activity Log** | Tracks all user actions (move, create, delete, rename) with timestamps |
| **System Tray** | Minimize to tray on close; quick-access tray menu with one-click organize |
| **Status Bar** | Real-time disk usage, memory usage, box/item counts |
| **Keyboard Shortcuts** | `Ctrl+F` search, `Ctrl+N` new box, `Ctrl+R` refresh, `Ctrl+Shift+O` quick organize |

## Prerequisites

- **Node.js** >= 18.0.0
- **pnpm** >= 8.0.0 (recommended; project uses pnpm as package manager)
- **Windows** 10/11 (depends on PowerShell and Windows Shell COM)

## Getting Started

### Install pnpm

```bash
npm install -g pnpm
```

### Install Dependencies

```bash
pnpm install
```

### Run in Development

```bash
pnpm start
```

### Build Installer

```bash
pnpm run build
```

Output: `dist/桌面图标收纳盒 Setup x.x.x.exe`

### Pack for Debugging

```bash
pnpm run pack
```

Output: `dist/win-unpacked/` (portable, no installer)

## Project Structure

```
desktop-organizer/
├── src/
│   ├── main.js                  # Electron main process (~1059 lines)
│   │   ├── Config management    #   loadConfig / saveConfig → %APPDATA%
│   │   ├── Shortcut scanning    #   readDesktopShortcuts / parseLnkFile
│   │   ├── Icon extraction      #   extractIconBase64 / concurrent workers
│   │   ├── Floating windows     #   createDesktopBox / desktopBoxes Map
│   │   ├── System tray          #   Tray / buildTrayMenu
│   │   └── IPC handlers         #   20+ ipcMain.handle() channels
│   │
│   ├── preload.js               # Main window preload (IPC bridge via contextBridge)
│   ├── utils.js                 # Shared utilities (escapeHtml, formatBytes, etc.)
│   │
│   ├── renderer/                # Main management window
│   │   ├── index.html           #   Layout with glass-morphism UI
│   │   ├── app.js               #   Window logic, drag-drop, modals (~1008 lines)
│   │   └── styles.css           #   Dark theme with backdrop-filter blur (~913 lines)
│   │
│   ├── desktop-box/             # Floating desktop widget
│   │   ├── index.html           #   Widget layout
│   │   ├── preload.js           #   Widget IPC bridge
│   │   ├── app.js               #   Widget logic (~231 lines)
│   │   └── style.css            #   Widget styling (~229 lines)
│   │
│   └── ps/                      # PowerShell scripts (Windows-only)
│       ├── parse-lnk.ps1        #   Parse .lnk via WScript.Shell COM
│       └── extract-icon.ps1     #   Extract icons via System.Drawing
│
├── scripts/
│   └── start.js                 # Dev startup (spawns Electron detached)
├── assets/
│   └── icon.ico                 # Application icon
├── screenshots/                 # App screenshots
├── package.json
└── pnpm-lock.yaml
```

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Electron Main Process                     │
│  ┌──────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │  Shortcut     │→│   PowerShell     │→│  Config Mgmt   │  │
│  │  Scan & Parse │  │   Icon Extract   │  │  config.json   │  │
│  └──────────────┘  └──────────────────┘  └────────────────┘  │
│       ↕ IPC               ↕ IPC               ↕ IPC          │
├──────────────────────────────────────────────────────────────┤
│                     Renderer Processes                        │
│  ┌───────────────────────┐      ┌─────────────────────────┐  │
│  │    Main Window         │      │  Floating Widgets (N)   │  │
│  │  ┌─────────────────┐  │      │  ┌───────────────────┐  │  │
│  │  │  Box List        │  │      │  │  Single Box        │  │  │
│  │  │  Unassigned Area │  │      │  │  Drag & Drop       │  │  │
│  │  │  Status Bar      │  │      │  │  Collapse/Expand   │  │  │
│  │  └─────────────────┘  │      │  └───────────────────┘  │  │
│  └───────────────────────┘      └─────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## Configuration

Application data is stored in `%APPDATA%/desktop-organizer/`:

| Path | Description |
|------|-------------|
| `data/config.json` | Box configurations and unassigned items |
| `data/activity-log.json` | Activity log (max 200 entries) |
| `icons/` | Icon cache directory (MD5-keyed, mtime-validated) |
| `app.log` | Application runtime log |

### config.json Schema

```json
{
  "boxes": [
    {
      "id": "box_xxx",
      "name": "Dev Tools",
      "items": [
        {
          "name": "VS Code",
          "path": "C:\\Users\\...\\Visual Studio Code.lnk",
          "type": "lnk",
          "iconPath": "C:\\...\\Code.exe",
          "iconData": "base64..."
        }
      ],
      "onDesktop": false,
      "collapsed": false,
      "desktopPos": { "x": 100, "y": 100 },
      "desktopSize": { "width": 260, "height": 320 }
    }
  ],
  "unassigned": [],
  "lastOrganizeTime": 1717500000000
}
```

## IPC Channels

| Channel | Direction | Description |
|---------|-----------|-------------|
| `get-shortcuts` | Renderer → Main | Fetch desktop shortcut list |
| `load-config` | Renderer → Main | Load box configuration |
| `save-config` | Renderer → Main | Save box configuration |
| `open-shortcut` | Renderer → Main | Launch a shortcut |
| `create-desktop-box` | Renderer → Main | Create a floating widget |
| `close-desktop-box` | Renderer → Main | Close a floating widget |
| `quick-organize` | Renderer → Main | Run quick organize |
| `box-updated` | Main → Renderer | Box data changed notification |
| `icon-updated` | Main → Renderer | Icon loaded notification |
| `activity-updated` | Main → Renderer | Activity log update notification |

## Troubleshooting

### App Won't Start

1. Check Node.js version: `node --version`
2. Reinstall dependencies: `pnpm install`
3. Check logs: `%APPDATA%/desktop-organizer/app.log`

### Icons Not Showing

- Icon extraction depends on PowerShell — ensure it's not disabled by group policy
- Clear icon cache: delete `%APPDATA%/desktop-organizer/icons/`
- Verify the target program path is valid

### Floating Widget Issues

- Window position is saved in `config.json` → `desktopPos`
- Reset position: delete `desktopPos` and `desktopSize` fields from the config
- Closing a widget does NOT delete the box — reopen from the main window

### Quick Organize Not Working

- Quick organize matches box names against shortcut names (case-insensitive substring)
- Ensure box names contain meaningful keywords (e.g. "Dev", "Games", "Office")
- Only affects shortcuts in the "Unassigned" area

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Electron 28.3.3 |
| Build Tool | electron-builder 24.9.0 |
| Package Manager | pnpm |
| Runtime Deps | fs-extra 11.2.0 |
| UI | Vanilla HTML/CSS/JS, glass-morphism dark theme |
| Windows Integration | PowerShell, WScript.Shell COM, System.Drawing |

## License

[MIT](LICENSE)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=easterCat/desktop-organizer&type=Date)](https://star-history.com/#easterCat/desktop-organizer&Date)
