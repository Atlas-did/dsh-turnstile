#!/usr/bin/env node
// Count the per-port login records the desktop app leaves behind, because they are what makes
// "Web authentication failed" happen after enough restarts (a Bilibili walkthrough describes the same
// symptom: every launch opens a new port and stores a new record; around 70 the app stops opening).
//
// usage: node tools/auth-records.mjs [--json] [--prune] [--store <path>] [--limit 60]
// exit: 0 fine | 1 over the limit | 2 usage | 3 the store is locked (close DSH first)
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const has = (n) => argv.includes(n);

const home = homedir();
const base = join(home, 'AppData', 'Roaming', '@deepseek-ai', 'dsh-desktop');

function candidateStores() {
  if (flag('--store')) return [flag('--store')];
  const out = [];
  const direct = join(base, 'Network', 'Cookies');
  if (existsSync(direct)) out.push(direct);
  const parts = join(base, 'Partitions');
  if (existsSync(parts)) {
    for (const p of readdirSync(parts)) {
      const f = join(parts, p, 'Network', 'Cookies');
      if (existsSync(f)) out.push(f);
    }
  }
  return out;
}

/** Copy next to the original (a live WAL cannot be replayed from another volume) and open the copy. */
function openCopy(file) {
  const dir = mkdtempSync(join(tmpdir(), 'authrec-'));
  const dst = join(dir, 'Cookies');
  try {
    copyFileSync(file, dst);
    for (const extra of ['Cookies-wal', 'Cookies-shm']) {
      const src = file.replace(/Cookies$/, extra);
      if (existsSync(src)) { try { copyFileSync(src, join(dir, extra)); } catch {} }
    }
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    const err = new Error(String(e && e.code));
    err.code = e && e.code;
    throw err;
  }
  return { db: new DatabaseSync(dst, { readOnly: true }), dir };
}

const limit = Number(flag('--limit')) || 60;
const stores = candidateStores();
const report = { stores: [], total: 0, ports: {}, over: false, locked: [], limit };

if (!stores.length) {
  console.error('no cookie store found under ' + base);
  process.exit(2);
}

for (const file of stores) {
  let opened = null;
  try { opened = openCopy(file); }
  catch (e) {
    if (e.code === 'EBUSY' || e.code === 'EPERM') { report.locked.push(file); continue; }
    throw e;
  }
  try {
    const rows = opened.db.prepare(
      "select host_key, name, expires_utc from cookies where host_key like '%127.0.0.1%' or host_key like '%localhost%'",
    ).all();
    const entry = { file, count: rows.length, ports: {} };
    for (const r of rows) {
      const m = /:(\d+)$/.exec(r.host_key);
      const key = m ? m[1] : 'no-port';
      entry.ports[key] = (entry.ports[key] || 0) + 1;
      report.ports[key] = (report.ports[key] || 0) + 1;
    }
    report.total += rows.length;
    report.stores.push(entry);
  } finally {
    opened.db.close();
    rmSync(opened.dir, { recursive: true, force: true });
  }
}

report.over = report.total >= limit;
if (has('--prune') && !report.locked.length) { report.total = 0; report.ports = {}; report.over = false; }

if (has('--prune')) {
  if (report.locked.length) {
    console.error('无法清理：以 DSH 正在运行并锁住了 cookie 库，请先完全退出 DSH。');
    process.exit(3);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const entry of report.stores) {
    const backup = entry.file + '.bak-' + stamp;
    copyFileSync(entry.file, backup);
    const db = new DatabaseSync(entry.file);
    const n = db.prepare("delete from cookies where host_key like '%127.0.0.1%' or host_key like '%localhost%'").run();
    db.close();
    entry.pruned = Number(n.changes || 0);
    entry.count = 0;
    entry.ports = {};
    entry.backup = backup;
    entry.count = 0;
    entry.ports = {};
  }
}

if (has('--json')) {
  console.log(JSON.stringify(report, null, 1));
} else {
  console.log('login records for local hosts: ' + report.total + ' (limit ' + limit + ')');
  for (const s of report.stores) {
    const ports = Object.keys(s.ports).length;
    console.log('  ' + s.file.replace(home, '~') + '  ' + s.count + ' records across ' + ports + ' port(s)' + (s.pruned !== undefined ? '  pruned ' + s.pruned : ''));
  }
  for (const l of report.locked) console.log('  locked (DSH is running): ' + l.replace(home, '~'));
  if (report.over) console.log('OVER THE LIMIT: 删掉这些记录（--prune，会先备份），否则会出现 Web authentication failed');
  else console.log('within the limit');
}

process.exitCode = report.locked.length && !report.stores.length ? 3 : (report.over ? 1 : 0);
