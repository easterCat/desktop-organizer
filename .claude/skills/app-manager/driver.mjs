#!/usr/bin/env node
/**
 * Desktop Organizer — App Manager Driver
 *
 * Manages app lifecycle: start, stop, restart, and dev mode with hot-reload.
 *
 * Usage (from project root):
 *   node .claude/skills/app-manager/driver.mjs start
 *   node .claude/skills/app-manager/driver.mjs dev
 *   node .claude/skills/app-manager/driver.mjs restart
 *   node .claude/skills/app-manager/driver.mjs stop
 *
 * Or pipe commands from stdin (one per line):
 *   printf "dev\n" | node .claude/skills/app-manager/driver.mjs
 */

import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { cwd } from 'process';
import * as readline from 'readline';
import { watch } from 'fs';

// --- Project root resolution ---
const __file = fileURLToPath(import.meta.url);
const __fileDir = dirname(__file);
// driver.mjs lives at .claude/skills/app-manager/
// so 3 levels up is the project root
let PROJECT_ROOT = join(__fileDir, '..', '..', '..', '..');
if (!existsSync(join(PROJECT_ROOT, 'package.json'))) {
  PROJECT_ROOT = cwd();
}

const SRC_DIR = join(PROJECT_ROOT, 'src');

// --- State ---
let child = null;
let watcher = null;

// --- Resolve electron binary ---
async function getElectronPath() {
  const localPath = join(PROJECT_ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
  if (existsSync(localPath)) return localPath;
  try {
    const { createRequire } = await import('module');
    const req = createRequire(join(PROJECT_ROOT, 'package.json'));
    return req('electron');
  } catch (_) {}
  throw new Error('Cannot find electron binary. Run: pnpm install');
}

// --- Kill existing Electron processes ---
function killElectron() {
  try {
    execSync('taskkill //F //IM electron.exe', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

// --- Start app ---
async function startApp(mode = 'production') {
  const electronPath = await getElectronPath();
  const args = mode === 'dev' ? ['--remote-debugging-port=9222', '.'] : ['.'];

  console.log(`[app-manager] Starting app (${mode} mode)...`);

  const env = Object.assign({}, process.env);
  delete env.ELECTRON_RUN_AS_NODE;

  child = spawn(electronPath, args, {
    cwd: PROJECT_ROOT,
    env,
    stdio: 'inherit'
  });

  child.on('exit', (code) => {
    if (code !== null) {
      console.log(`[app-manager] App exited with code ${code}`);
    }
  });

  console.log(`[app-manager] App started (PID: ${child.pid})`);
  return child;
}

// --- Restart app ---
async function restartApp() {
  console.log('[app-manager] Restarting app...');
  killElectron();
  child = null;

  setTimeout(async () => {
    await startApp('production');
  }, 1000);
}

// --- Stop app ---
function stopApp() {
  console.log('[app-manager] Stopping app...');
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  killElectron();
  child = null;
  console.log('[app-manager] App stopped');
}

// --- Dev mode with hot-reload ---
async function startDevMode() {
  console.log('[app-manager] Starting dev mode with hot-reload...');

  // Start the app
  await startApp('dev');

  // Watch src directory
  console.log(`[app-manager] Watching ${SRC_DIR} for changes...`);

  let restartTimeout = null;

  watcher = watch(SRC_DIR, { recursive: true }, (eventType, filename) => {
    if (filename && !filename.endsWith('.log')) {
      console.log(`[app-manager] File changed: ${filename}`);

      // Debounce restart
      if (restartTimeout) {
        clearTimeout(restartTimeout);
      }

      restartTimeout = setTimeout(async () => {
        console.log('[app-manager] Restarting due to file change...');
        killElectron();
        child = null;

        setTimeout(async () => {
          await startApp('dev');
        }, 1000);
      }, 500);
    }
  });

  console.log('[app-manager] Press Ctrl+C to stop');
}

// --- Command map ---
const cmdMap = {
  start: async () => await startApp('production'),
  dev: startDevMode,
  restart: restartApp,
  stop: stopApp,
  quit: stopApp,
  exit: stopApp,
  help: () => {
    console.log(`
Desktop Organizer - App Manager

Commands:
  start     Start app (production mode)
  dev       Start app (dev mode with hot-reload)
  restart   Restart app
  stop      Stop app
  quit      Stop app
  help      Show this help
    `);
  }
};

async function handleLine(line) {
  const parts = line.trim().split(/\s+/);
  if (!parts[0]) return;
  const cmd = parts[0];

  if (cmdMap[cmd]) {
    try {
      await cmdMap[cmd]();
    } catch (e) {
      console.error(`[app-manager] Error: ${e.message}`);
    }
  } else {
    console.log(`[app-manager] Unknown command: ${cmd}`);
    console.log(`[app-manager] Available: ${Object.keys(cmdMap).join(', ')}`);
  }
}

// --- Entry point ---
if (process.stdin.isTTY) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'app-manager> ' });
  rl.on('line', async (line) => { await handleLine(line); rl.prompt(); });
  rl.on('close', () => stopApp());
  rl.prompt();
} else {
  let data = '';
  process.stdin.setEncoding('utf-8');
  for await (const chunk of process.stdin) data += chunk;
  const lines = data.split('\n').filter(l => l.trim());
  for (const line of lines) await handleLine(line);
  // Keep process alive for dev mode watcher
  if (!lines.includes('dev')) {
    await stopApp();
  }
}
