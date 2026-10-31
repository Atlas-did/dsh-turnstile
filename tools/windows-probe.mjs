#!/usr/bin/env node
// 器材探测：做「深度集成插件」之前，先看这台机器上有哪些 Windows 能力可用。
// 只读：不装东西、不改注册表、不开会话。
//
// usage: node tools/windows-probe.mjs [--json]
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

const ps = (script) => {
  try {
    // PowerShell 默认按本地代码页输出，中文会乱码；先切 UTF-8 再执行
    const wrapped = "[Console]::OutputEncoding=[Text.Encoding]::UTF8; " + script;
    return String(execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', wrapped], { encoding: 'utf8', timeout: 30000 })).trim();
  } catch (e) { return 'ERR ' + String((e.stdout || e.stderr || e.message)).split('\n')[0].slice(0, 90); }
};

const out = [];
const add = (id, label, ok, detail, why) => out.push({ id, label, ok, detail, why });

// 1. 系统版本
const os = ps("(Get-CimInstance Win32_OperatingSystem).Caption + ' ' + (Get-CimInstance Win32_OperatingSystem).Version");
add('os', '系统版本', !os.startsWith('ERR'), os, '决定有哪些 API 可用（UIA3/WebView2/通知等）');

// 2. 是否管理员
const admin = ps("([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)");
add('admin', '当前是否管理员', admin === 'True', admin, 'ETW 会话、部分进程/窗口操作需要');

// 3. UI 自动化（探测别人的窗口）
const uia = ps("try { [void][System.Reflection.Assembly]::LoadWithPartialName('UIAutomationClient'); 'ok' } catch { 'fail' }");
add('uia', 'UI Automation 组件', uia === 'ok', uia, '读其它应用控件树（做深集成的核心器材）');

// 4. 能否编译并调用 Win32（Add-Type）
const pn = ps("try { Add-Type -Namespace N -Name P -MemberDefinition '[DllImport(\"user32.dll\")] public static extern int GetSystemMetrics(int i);' -ErrorAction Stop; [N.P]::GetSystemMetrics(0) } catch { 'fail' }");
add('pinvoke', 'P/Invoke 可用（Add-Type）', /^[0-9]+$/.test(pn), pn, '调 Win32 API 的门槛；不可用则只能走 COM/命令行');

// 5. 事件日志可读（ETW 的轻量替代）
const evt = ps("try { (Get-WinEvent -LogName Application -MaxEvents 1 -ErrorAction Stop).ProviderName } catch { 'fail' }");
add('eventlog', '事件日志可读', evt !== 'fail', evt, '插件故障定位可以挂到系统日志');

// 6. WebView2 运行时（深集成 UI 的常见底座）
const wv = ps("try { (Get-ItemProperty 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' -ErrorAction Stop).pv } catch { '' }");
add('webview2', 'WebView2 运行时', Boolean(wv) && wv !== '', wv || '未安装', '想在自己的窗口里嵌 Web UI 时用');

// 7. 长路径 / 开发者模式（影响装插件时的路径问题）
const longPath = ps("try { (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem' -ErrorAction Stop).LongPathsEnabled } catch { '' }");
add('longpath', '长路径已启用', longPath === '1', longPath || '未设置', '深层 node_modules 路径会撞 260 限制');

// 8. Sysinternals 常用工具是否在 PATH
const which = (exe) => ps("try { (Get-Command " + exe + " -ErrorAction Stop).Source } catch { '' }");
const sysTools = { handle: which('handle.exe'), procexp: which('procexp.exe'), pslist: which('pslist.exe') };
const present = Object.entries(sysTools).filter(([, v]) => v && !v.startsWith('ERR')).map(([k]) => k);
add('sysinternals', 'Sysinternals 工具', present.length > 0, present.join(', ') || '都没找到', '排查句柄/进程/占用时的标准器材');

// 9. 命名管道（Node 原生支持，直接测）
const pipeOk = await new Promise((resolve) => {
  // Windows 命名管道必须是 \\.\pipe\<name>，不是文件路径
  const dir = mkdtempSync(join(tmpdir(), 'pipe-'));
  const name = process.platform === 'win32' ? '\\\\.\\pipe\\dsh-probe-' + process.pid : join(dir, 'probe.pipe');
  const srv = createServer((sock) => { sock.end('pong'); });
  srv.once('error', () => { try { rmSync(dir, { recursive: true, force: true }); } catch {} resolve(false); });
  srv.listen(name, () => { srv.close(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} resolve(true); }); });
});
add('pipe', '命名管道（本进程）', pipeOk, pipeOk ? '可以 listen' : '不可用', '插件与外部进程通信的最稳通道');

// 10. Windows App SDK / WinUI 是否有（决定能不能做原生壳）
const wasd = ps("try { (Get-AppxPackage -Name 'Microsoft.WindowsAppRuntime*' -ErrorAction Stop | Select-Object -First 1).Name } catch { '' }");
add('winsdk', 'Windows App SDK 运行时', Boolean(wasd) && wasd !== '', wasd || '未安装', '要做原生窗口/托盘以外的高级集成才需要');

const json = { at: new Date().toISOString(), machine: process.env.COMPUTERNAME || '', probes: out };
if (process.argv.includes('--json')) { console.log(JSON.stringify(json, null, 1)); }
else {
  console.log('windows-probe · ' + json.machine + ' · ' + json.at.slice(0, 19).replace('T', ' '));
  for (const p of out) console.log('  ' + (p.ok ? '✓' : '✗') + ' ' + p.label.padEnd(22) + String(p.detail).slice(0, 46));
  const missing = out.filter((p) => !p.ok);
  console.log('');
  console.log(missing.length ? '缺的器材：' + missing.map((p) => p.label).join(', ') : '器材齐全（就这份清单而言）');
}
