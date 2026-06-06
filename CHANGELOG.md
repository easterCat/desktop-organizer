# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
