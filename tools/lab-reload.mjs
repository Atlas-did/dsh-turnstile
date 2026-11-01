#!/usr/bin/env node
// 一条命令完成「重启 mini → 等就绪 → 取新 token」，供 sandbox-trial / verify-live 复用。
// 存在的理由：重启后 token 会变，之前每次都要人肉去日志里捞。
//
// usage: node tools/lab-reload.mjs [--mini <dir>] [--port 18770] [--json] [--no-restart]
// 输出：{ ok, restarted, port, token, url, readyMs, health }
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const has = (n) => argv.includes(n);
const mini = val('--mini') || process.env.MINI_HOME || '';
const ctl = join(here, 'mini-ctl.mjs');

function ctlRun(args) {
  try { return { code: 0, out: execFileSync(process.execPath, [ctl, ...args], { encoding: 'utf8', timeout: 180000 }) }; }
  catch (e) { return { code: e.status == null ? 1 : e.status, out: String((e.stdout || '') + (e.stderr || '')) }; }
}

function tokenFromLog() {
  const base = mini || (ctlRun(['status']).out.match(/mini .* · (\S.*)$/m) || [])[1] || '';
  const log = join(base.trim(), 'logs', 'mini.log');
  if (!existsSync(log)) return null;
  const all = [...readFileSync(log, 'utf8').slice(-200000).matchAll(/http:\/\/127\.0\.0\.1:(\d+)\/\?token=([A-Za-z0-9_-]+)/g)];
  const m = all[all.length - 1];
  return m ? { port: Number(m[1]), token: m[2], url: m[0] } : null;
}

async function health(port, token) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch('http://127.0.0.1:' + port + '/turnstile/health?token=' + encodeURIComponent(token), { signal: ctrl.signal });
    const j = await r.json();
    return { status: r.status, items: (j.items || []).map((i) => i.id + '=' + i.level) };
  } catch (e) { return { status: 0, error: String(e.message).slice(0, 60) }; }
  finally { clearTimeout(timer); }
}

const t0 = Date.now();
let restarted = false;
let bootNote = '';
if (!has('--no-restart')) {
  ctlRun(['stop']);
  const started = ctlRun(['start']);
  restarted = true;
  if (/没起来|找不到 dsh 运行时/.test(started.out)) bootNote = (started.out.trim().split('\n').pop() || '启动失败');
}

function finish(inf, h, ms) {
  const out = { ok: true, restarted, port: inf.port, token: inf.token, url: inf.url, readyMs: ms, health: h.items };
  if (has('--json')) console.log(JSON.stringify(out, null, 2));
  else console.log('mini 就绪（' + (restarted ? '已重启' : '未重启') + '，' + ms + 'ms）');
  return out;
}

let done = null;
for (let i = 0; i < 45 && !done; i += 1) {
  const info = tokenFromLog();
  if (info) {
    const h = await health(info.port, info.token);
    if (h.status === 200) done = finish(info, h, Date.now() - t0);
  }
  if (!done) await new Promise((r) => setTimeout(r, 2000));
}

if (!done) {
  const last = tokenFromLog();
  const out = { ok: false, restarted, bootNote: bootNote || '90 秒内没等到 /turnstile/health 200', port: last ? last.port : Number(val('--port') || 18770), token: last ? last.token : '', url: last ? last.url : '' };
  if (has('--json')) console.log(JSON.stringify(out, null, 2));
  else console.error('未就绪：' + out.bootNote);
  process.exitCode = 1;
}
