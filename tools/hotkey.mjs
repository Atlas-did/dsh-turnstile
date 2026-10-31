#!/usr/bin/env node
// 全局热键宿主（AutoHotkey 的那一层），带能力闸门与自触发测试。
//
// usage:
//   node tools/hotkey.mjs --specs "Ctrl+Alt+F12" --seconds 15 [--run "node tools/launcher.mjs search --q dsh"]
//   node tools/hotkey.mjs --profile <dir> --plugin <pkg> --specs "Ctrl+Alt+K" --seconds 15
//   node tools/hotkey.mjs --specs "Ctrl+Alt+F12" --seconds 12 --self-test
//
// 规则：带 --profile/--plugin 时，插件必须在 package.json 里声明 dsh.windows.hotkeys 且包含该组合；
// 不带时按「未声明」处理——直接拒绝（退出码 3）。
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { auditLine } from '../plugins/turnstile-popup/lib/windows-gate.js';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const has = (n) => argv.includes(n);
const specs = val('--specs');
const seconds = Number(val('--seconds') || 15);
const profile = val('--profile');
const plugin = val('--plugin');
const run = val('--run');
if (!specs) { console.error('usage: node tools/hotkey.mjs --specs "Ctrl+Alt+F12" --seconds 15 [--profile d --plugin p] [--run cmd] [--self-test]'); process.exit(2); }

// 闸门
let caps = null;
if (profile && plugin) {
  const pj = join(profile, 'node_modules', plugin, 'package.json');
  if (!existsSync(pj)) { console.error('插件没装：' + plugin); process.exit(2); }
  caps = JSON.parse(readFileSync(pj, 'utf8'));
  const declared = (caps.dsh && caps.dsh.windows && caps.dsh.windows.hotkeys) || [];
  const wanted = specs.split(',').map((s) => s.trim());
  const missing = wanted.filter((w) => !declared.includes(w));
  if (missing.length) {
    console.error('DENY  插件没有声明热键 ' + missing.join(', ') + '（在 dsh.windows.hotkeys 里声明后才可用）');
    process.exit(3);
  }
} else {
  console.error('DENY  全局热键必须带 --profile 与 --plugin（未声明的一律拒绝）');
  process.exit(3);
}

const stateDir = process.env.DSH_TURNSTILE_STATE || join(profile, '..', '..', 'turnstile-state');
try {
  mkdirSync(stateDir, { recursive: true });
  appendFileSync(join(stateDir, 'windows-audit.jsonl'), auditLine({ plugin, action: 'hotkey.register', verdict: 'allow', reason: specs }));
} catch {}

const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(here, 'hotkey-host.ps1'), '-Specs', specs, '-Seconds', String(seconds)], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
const rl = createInterface({ input: child.stdout });
let fired = 0;
rl.on('line', (line) => {
  const t = line.replace(/\uFEFF/g, '').trim();
  if (!t.startsWith('{')) return;
  let msg; try { msg = JSON.parse(t); } catch { return; }
  if (msg.registered) console.log('已注册 ' + msg.registered + '（' + seconds + 's 内有效）');
  if (msg.failed) console.error('注册失败 ' + msg.failed + '（可能被别的程序占用）');
  if (msg.hotkey) {
    fired += 1;
    console.log('触发 ' + msg.hotkey + ' · ' + new Date().toISOString().slice(11, 19));
    if (run) {
      const r = spawnSync(run, { shell: true, encoding: 'utf8', timeout: 30000 });
      console.log('  执行：' + String((r.stdout || '') + (r.stderr || '')).trim().split('\n')[0].slice(0, 120));
    }
  }
});

if (has('--self-test')) {
  setTimeout(() => {
    // SendKeys 语法：修饰符 ^ % + ，功能键要加花括号（{F12}）
    const parts = specs.split(',')[0].trim().split('+');
    const key = parts[parts.length - 1];
    const mods = parts.slice(0, -1).map((m) => ({ Ctrl: '^', Alt: '%', Shift: '+' })[m] || '').join('');
    const send = mods + (key.length > 1 ? '{' + key + '}' : key);
    const ps = 'Add-Type -AssemblyName System.Windows.Forms; Start-Sleep -Milliseconds 300; [System.Windows.Forms.SendKeys]::SendWait(' + JSON.stringify(send) + ')' ;
    spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', timeout: 20000 });
  }, 2500);
}

child.once('exit', () => {
  console.log('宿主结束，共触发 ' + fired + ' 次');
  process.exit(0);
});
