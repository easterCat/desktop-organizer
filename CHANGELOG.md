# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.2] - 2026-06-07

### Fixed

- **Production Icon Extraction (PERF-02)** — PowerShell icon/lnk scripts were packed inside `app.asar` and inaccessible to external processes; added `asarUnpack` for `src/ps/**` and fixed `runPSScript` to resolve unpacked paths at runtime

## [1.5.1] - 2026-06-07

### Changed

- **Unified Storage Path (F-26)** — Storage paths now dynamically resolve based on the application install directory; development and production builds use identical path logic
- **Desktop Box Z-Order** — Desktop floating widgets no longer use `alwaysOnTop`, reducing overlay conflicts with other windows

## [1.5.0] - 2026-06-07

### Changed

- **Unified Storage Path (F-26)** — All data (config, icons, logs, cache) now stored in system Roaming directory (`AppData\Roaming\desktop-organizer\`) instead of installation directory; dev environment and production builds use identical paths
- **Portable to Roaming Migration** — Removed portable-mode path redirection for dev builds; production builds retain installation-directory caching for clean uninstalls

## [1.4.0] - 2026-06-06

### Added

- **Undo (F-06a)** — `Ctrl+Z` or toolbar ↩ button undoes the last quick-organize action within a 30-second window
- **Smart Quick Organize (F-06a)** — PRD §5.5 four-level scoring system: exact match (score 3) auto-assigns, substring matches (score 1–2) surface as candidate suggestions with confirm/dismiss badges
- **Batch Operations (F-31)** — Toolbar ☑ button enters batch mode; click to multi-select shortcuts, then batch-move to any box via dropdown menu
- **Config Import/Export (F-29)** — 📤 Export saves config as JSON (without icon data); 📥 Import merges new boxes from file, skipping duplicates by name
- **Invalid Shortcut Detection (F-34)** — Auto-detects broken shortcuts (target file missing) on startup; marks with ⚠ badge and strikethrough text; Settings → "清理无效快捷方式" removes them in bulk
- **CPU Usage Display** — Status bar shows real-time CPU usage percentage alongside memory usage
- **Desktop Box Position Reset (F-16b)** — Right-click menu on floating widget offers "重置位置" to re-center on primary display; auto-resets if saved position is off-screen (e.g. disconnected external monitor)

### Changed

- **Search Debounce (F-18)** — Search input debounced at 200ms to reduce render thrashing during fast typing
- **Quick Organize Candidates** — Substring matches no longer auto-move; instead shown as dashed-border cards with ✓/✕ buttons for user confirmation
- **Default Box Color** — New boxes default to `#4a90d9` (blue) instead of `#888` (grey)
- **Icon Picker Options** — Updated default icon set: 📁 📱 💻 🔧 🎮 🎬 🌐 📝
- **Desktop Widget Z-Order** — Floating widgets now always-on-top to stay visible over other windows
- **Config Schema v2** — Added `version` field; auto-migrates old configs with new box fields (`displayMode`, `sortMode`, `sortOrder`, `createdTime`) and renames `hiddenItems` fields (`path` → `originalPath`, `tempPath` → `backupPath`)
- **Portable Data Directory** — Simplified cache path redirection to use `userData` directly; removed redundant write-test in `app.whenReady()`

### Removed

- **Unused Async Helpers** — Removed `runPSScriptAsync` and `extractIconsConcurrently` (superseded by synchronous icon extraction with disk cache)

## [1.3.0] - 2026-06-06

### Changed

- **Icon Cache Overhaul** — Cache now stores PNG binary files instead of JSON, enabling direct backup and browsing; mtime-based validation replaced old hash-based approach
- **Icon Extraction Fallback** — PowerShell script now uses `SHGetFileInfo` Shell API for `.lnk`/`.cmd`/`.bat` files when `ExtractAssociatedIcon` fails
- **Graceful Icon Failure** — Renderer shows fallback emoji (🌐/📄) instead of permanent loading spinner when icon extraction fails
- **Icon Retry** — Memory cache allows retry for previously failed icon extractions

### Added

- **Storage Path Display** — Settings panel shows data directory and icon cache directory paths
- **Open Folder Buttons** — Quick access to open storage folders from settings
- **Window Control Hotarea** — Expanded click hotarea for minimize/maximize/close buttons
- **Portable Data Directory** — Electron internal cache paths redirected to app installation directory for cleaner uninstalls
- **Uninstall Cleanup** — NSIS uninstaller now removes all runtime data (cache, session-data, crash-dumps, logs, temp, datas, icons)
- **Dev Script** — Added `pnpm run dev` for development with auto-reload
- **App Manager** — Added `pnpm run app` script for application management

## [1.2.6] - 2026-06-06

### Changed

- Updated version badge and download link to v1.2.6
- Updated CHANGELOG with v1.2.x release history

## [1.2.5] - 2026-06-05

### Fixed

- Fixed pnpm hoisting configuration for electron-builder compatibility

## [1.2.4] - 2026-06-05

### Changed

- Bumped version to 1.2.4

## [1.2.3] - 2026-06-05

### Fixed

- Corrected release workflow artifact paths for GitHub Actions

## [1.2.2] - 2026-06-05

### Added

- Added direct download section to README with exe download link
- Updated demo image to main-window.png
- Included node_modules in package files for electron-builder

## [1.2.1] - 2026-06-05

### Added

- **GitHub Actions CI/CD** — Automated Windows build and release workflow via `softprops/action-gh-release`
- Optimized README with GIF demo, download button, motivation section, and star history

### Fixed

- Skipped electron-builder auto-publish, using `softprops/action-gh-release` instead
- Used corepack to install pnpm on Windows runner

## [1.1.0] - 2026-06-05

### Added

- **Floating Desktop Widgets** — Pin any box to the desktop as a transparent, always-on-top widget panel
- **Drag & Drop Reordering** — Reorder shortcuts within and across boxes via drag and drop
- **Box Collapse/Expand** — Toggle box content visibility to save screen space
- **System Tray Integration** — Minimize to tray on close; quick-access tray menu with one-click organize
- **Keyboard Shortcuts** — `Ctrl+F` search, `Ctrl+N` new box, `Ctrl+R` refresh, `Ctrl+Shift+O` quick organize
- **Quick Organize** — Auto-categorize unassigned shortcuts via keyword matching against box names
- **Icon Caching** — Multi-level icon cache (MD5-keyed, mtime-validated) for fast startup
- **Activity Log** — Track all user actions (move, create, delete, rename) with timestamps (max 200 entries)
- **Status Bar** — Real-time disk usage, memory usage, box/item counts
- **README screenshots and badges** — Added visual documentation and version badges

### Changed

- Updated version badges and screenshots to reflect v1.1.0

## [1.0.0] - 2026-06-05

### Added

- Initial release of Windows Desktop Organizer
- **Shortcut Scanning** — Automatically scan user & public desktop folders for `.lnk` and `.url` files
- **Smart Categorization** — Create named boxes and organize shortcuts into categories
- **Icon Extraction** — Extract program icons from `.exe`, `.dll`, `.ico` via PowerShell
- **Glass-morphism Dark UI** — Modern dark theme with backdrop-filter blur
- **Configuration Management** — Persistent box configurations stored in `%APPDATA%/desktop-organizer/`
- **Electron 28.3.3** based architecture with main/renderer/desktop-box processes
- **PowerShell Integration** — `.lnk` parsing via WScript.Shell COM and icon extraction via System.Drawing
