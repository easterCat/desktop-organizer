#!/usr/bin/env node
/**
 * Desktop Organizer — Playwright + CDP driver
 *
 * Launches the Electron app, connects via Chrome DevTools Protocol,
 * and exposes a REPL for screenshots, clicks, evaluations, and more.
 *
 * Usage (from project root):
 *   node .claude/skills/run-desktop-organizer/driver.mjs launch
 *   node .claude/skills/run-desktop-organizer/driver.mjs ss
 *   node .claude/skills/run-desktop-organizer/driver.mjs click "button#new-box"
 *   node .claude/skills/run-desktop-organizer/driver.mjs eval "document.title"
 *   node .claude/skills/run-desktop-organizer/driver.mjs quit
 *
 * Or pipe commands from stdin (one per line):
 *   printf "launch\nss\nquit" | node .claude/skills/run-desktop-organizer/driver.mjs
 */

import { spawn } from 'child_process';
import { createRequire } from 'module';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { cwd } from 'process';
import * as readline from 'readline';

// --- Project root resolution ---
const __file = fileURLToPath(import.meta.url);
const __fileDir = dirname(__file);
// driver.mjs lives at .claude/skills/run-desktop-organizer/
// so 3 levels up is the project root
let PROJECT_ROOT = join(__fileDir, '..', '..', '..', '..');
if (!existsSync(join(PROJECT_ROOT, 'package.json'))) {
  PROJECT_ROOT = cwd();
}

// Ensure screenshots dir exists
const SCREENSHOT_DIR = join(PROJECT_ROOT, 'screenshots');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

// --- State ---
let child = null;
let browser = null;
let page = null;
let screenshotIdx = 0;

// --- Resolve electron binary ---
function getElectronPath() {
  const localPath = join(PROJECT_ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
  if (existsSync(localPath)) return localPath;
  try {
    const req = createRequire(join(PROJECT_ROOT, 'package.json'));
    return req('electron');
  } catch (_) {}
  throw new Error('Cannot find electron binary. Run: pnpm install');
}

// --- Launch ---
async function launch() {
  const electronPath = getElectronPath();
  const port = 9222 + Math.floor(Math.random() * 1000);

  console.log(`[driver] Launching Electron on port ${port}...`);
  const env = Object.assign({}, process.env);
  delete env.ELECTRON_RUN_AS_NODE;

  child = spawn(electronPath, [`--remote-debugging-port=${port}`, '.'], {
    cwd: PROJECT_ROOT,
    env,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Wait for DevTools line on stderr
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for DevTools')), 15000);
    child.stderr.on('data', (d) => {
      if (d.toString().includes('DevTools listening')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.on('error', (e) => { clearTimeout(timeout); reject(e); });
    child.on('exit', (code) => { clearTimeout(timeout); reject(new Error(`Electron exited with code ${code}`)); });
  });

  console.log(`[driver] Electron running (PID ${child.pid}), connecting via CDP...`);

  // Connect via CDP using Playwright
  const pw = await import('playwright');
  browser = await pw.chromium.connectOverCDP(`http://127.0.0.1:${port}`);

  const contexts = browser.contexts();
  if (!contexts.length) throw new Error('No browser contexts found');

  // Find the main management window (renderer/index.html), not floating desktop-box windows
  const pages = contexts[0].pages();
  page = pages.find(p => p.url().includes('renderer/index.html')) || pages[0];

  await page.waitForLoadState('domcontentloaded');
  const title = await page.title();
  console.log(`[driver] Connected. Title: "${title}"`);

  return { title };
}

// --- Screenshot ---
async function ss(label) {
  if (!page) throw new Error('Not connected. Run: launch');
  const name = label || `ss-${String(screenshotIdx++).padStart(3, '0')}`;
  const filePath = join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`[driver] Screenshot saved: ${filePath}`);
  return filePath;
}

// --- Click ---
async function click(selector) {
  if (!page) throw new Error('Not connected. Run: launch');
  await page.click(selector);
  console.log(`[driver] Clicked: ${selector}`);
}

// --- Type ---
async function typeText(selector, text) {
  if (!page) throw new Error('Not connected. Run: launch');
  await page.fill(selector, text);
  console.log(`[driver] Typed "${text}" into: ${selector}`);
}

// --- Evaluate ---
async function evaluate(expression) {
  if (!page) throw new Error('Not connected. Run: launch');
  const result = await page.evaluate(expression);
  console.log(`[driver] Result: ${JSON.stringify(result)}`);
  return result;
}

// --- Body text ---
async function bodyText(maxLen = 2000) {
  if (!page) throw new Error('Not connected. Run: launch');
  const text = await page.evaluate((len) => document.body.innerText.substring(0, len), maxLen);
  console.log(text);
  return text;
}

// --- Wait ---
async function wait(ms = 2000) {
  if (!page) throw new Error('Not connected. Run: launch');
  await page.waitForTimeout(Number(ms));
  console.log(`[driver] Waited ${ms}ms`);
}

// --- Quit ---
async function quit() {
  if (browser) { try { await browser.close(); } catch (_) {} }
  if (child) { child.kill(); }
  console.log('[driver] Quit');
  process.exit(0);
}

// --- Command map ---
const cmdMap = {
  launch, ss, click, type: typeText, eval: evaluate, bodyText, wait, quit,
  screenshot: ss, text: bodyText, q: quit, exit: quit,
};

async function handleLine(line) {
  const parts = line.trim().split(/\s+/);
  if (!parts[0]) return;
  const cmd = parts[0];
  const args = parts.slice(1).map(a => a.replace(/^["']|["']$/g, ''));

  if (cmdMap[cmd]) {
    try { await cmdMap[cmd](...args); }
    catch (e) { console.error(`[driver] Error: ${e.message}`); }
  } else {
    console.log(`[driver] Unknown command: ${cmd}`);
    console.log(`[driver] Available: ${Object.keys(cmdMap).join(', ')}`);
  }
}

// --- Entry point ---
if (process.stdin.isTTY) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'driver> ' });
  rl.on('line', async (line) => { await handleLine(line); rl.prompt(); });
  rl.on('close', () => quit());
  rl.prompt();
} else {
  let data = '';
  process.stdin.setEncoding('utf-8');
  for await (const chunk of process.stdin) data += chunk;
  const lines = data.split('\n').filter(l => l.trim());
  for (const line of lines) await handleLine(line);
  await quit();
}
