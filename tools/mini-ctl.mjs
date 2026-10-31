#!/usr/bin/env node
// 从主环境（或任意终端）一句话操控 mini：start / stop / status / url / cmd / test。
//
// usage:
//   node tools/mini-ctl.mjs status
//   node tools/mini-ctl.mjs url
//   node tools/mini-ctl.mjs start [--port 18770]
//   node tools/mini-ctl.mjs stop
//   node tools/mini-ctl.mjs cmd "node tools/ui-surfaces.mjs <profile>"
//
// 约定：mini 的根目录由 MINI_HOME 指定，默认 C:/Users/<you>/Desktop/mini-harness。
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const argv = process.argv.slice(2);
const cmd = argv[0] || 'status';
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const MINI = process.env.MINI_HOME || join(homedir(), 'Desktop', 'mini-harness');
const PORT = Number(val('--port') || process.env.MINI_PORT || 18770);
const LOG = join(MINI, 'logs', 'mini.log');
const REPO = join(MINI, 'oss', 'dsh-turnstile');

if (!existsSync(MINI)) { console.error('找不到 mini 目录：' + MINI + '（用 MINI_HOME 指定）'); process.exit(2); }

function logTail(n = 2000) {
  try { const t = readFileSync(LOG, 'utf8'); return t.slice(-n); } catch { return ''; }
}
function url() {
  const m = /http:\/\/127\.0\.0\.1:(\d+)\/\?token=([A-Za-z0-9_-]+)/.exec(logTail(200000));
  return m ? { port: Number(m[1]), token: m[2], url: m[0] } : null;
}
async function alive() {
  const u = url();
  if (!u) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch('http://127.0.0.1:' + u.port + '/', { signal: ctrl.signal });
    clearTimeout(t);
    return r.status < 500;
  } catch { return false; }
}

if (cmd === 'status') {
  const up = await alive();
  const u = url();
  console.log('mini ' + (up ? '运行中' : '未运行') + ' · ' + MINI);
  if (up && u) console.log('  url  ' + u.url.slice(0, 46) + '…');
  if (!up) console.log('  （日志里最后一条 url 可能已失效）');
  console.log('  port ' + PORT + '  日志 ' + LOG);
  process.exit(up ? 0 : 1);
}

if (cmd === 'url') {
  const u = url();
  if (!u) { console.error('日志里还没有带 token 的 URL（先 start）'); process.exit(1); }
  console.log(u.url);
  process.exit(0);
}

if (cmd === 'stop') {
  const ps = join(MINI, '..', '_sm17.ps1');
  try {
    if (existsSync(ps)) execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps], { encoding: 'utf8', timeout: 60000 });
    else execFileSync('powershell', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\'" | Where-Object { $_.CommandLine -like \'*mini*18770*\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }'], { encoding: 'utf8', timeout: 60000 });
    console.log('mini 已停止');
    process.exit(0);
  } catch (e) { console.error('停止失败：' + String(e.message).slice(0, 120)); process.exit(1); }
}

if (cmd === 'start') {
  if (await alive()) { console.log('mini 已在运行：' + url().url.slice(0, 46) + '…'); process.exit(0); }
  const env = {
    ...process.env,
    DSH_HOME: join(MINI, 'home'),
    DSH_TURNSTILE_STATE: join(MINI, 'state'),
    DSH_TURNSTILE_HOME: REPO,
    DSH_TURNSTILE_LOG: LOG,
  };
  mkdirSync(join(MINI, 'logs'), { recursive: true });
  const bin = join(MINI, 'runtime', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  if (!existsSync(bin)) { console.error('找不到 dsh 运行时：' + bin); process.exit(2); }
  const child = spawn(process.execPath, [bin, 'mini', '--no-open', '--port', String(PORT)], { cwd: MINI, env, detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  console.log('已启动（pid ' + child.pid + '），等它就绪…');
  for (let i = 0; i < 40; i += 1) {
    await new Promise((r) => setTimeout(r, 1500));
    if (await alive()) { console.log('就绪：' + url().url); process.exit(0); }
  }
  console.error('60 秒内没起来，看日志：' + LOG);
  process.exit(1);
}

if (cmd === 'cmd') {
  const line = argv.slice(1).join(' ');
  if (!line) { console.error('用法: node tools/mini-ctl.mjs cmd "<命令>"'); process.exit(2); }
  try {
    // 命令里的 tools/ 都在仓库里，所以默认在 oss/dsh-turnstile 下跑（可用 --cwd 覆盖）
    const where = val('--cwd') || (existsSync(REPO) ? REPO : MINI);
    const out = execFileSync(line, { shell: true, cwd: where, encoding: 'utf8', timeout: 300000, env: { ...process.env, DSH_HOME: join(MINI, 'home'), DSH_TURNSTILE_STATE: join(MINI, 'state'), DSH_TURNSTILE_HOME: REPO } });
    process.stdout.write(out);
    process.exit(0);
  } catch (e) {
    process.stdout.write(String(e.stdout || ''));
    process.stderr.write(String(e.stderr || e.message));
    process.exit(e.status || 1);
  }
}

console.error('usage: node tools/mini-ctl.mjs status|url|start|stop|cmd "<命令>"');
process.exit(2);
