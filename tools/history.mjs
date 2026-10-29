// Machine-readable gate history: every preflight run is appended, keyed by
// plugin@version so a decision expires when someone upgrades the plugin.
// usage:
//   node tools/history.mjs record <profileDir> <result> <checksJsonFile>
//   node tools/history.mjs list [profile]
//   node tools/history.mjs decide <key> <allow|deny|patch> <evidence...>
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const FILE = join(root, 'state', 'gate-history.json');

function load() {
  if (!existsSync(FILE)) return { schema: 1, runs: [], decisions: [] };
  try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return { schema: 1, runs: [], decisions: [] }; }
}
function save(db) {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(db, null, 2) + '\n', 'utf8');
}

const [cmd, ...rest] = process.argv.slice(2);
const db = load();

if (cmd === 'record') {
  const [dir, result, checksFile] = rest;
  let checks = [], bundles = [];
  if (checksFile && existsSync(checksFile)) {
    try {
      const j = JSON.parse(readFileSync(checksFile, 'utf8'));
      if (Array.isArray(j)) checks = j; else { checks = j.checks || []; bundles = j.bundles || []; }
    } catch {}
  }
  db.runs.push({ at: new Date().toISOString(), profile: dir, result, checks, bundles });
  if (db.runs.length > 200) db.runs = db.runs.slice(-200);
  save(db);
  console.log('recorded run (' + db.runs.length + ' total)');
} else if (cmd === 'decide') {
  const pIdx = rest.indexOf('--profile');
  const decProfile = pIdx >= 0 ? rest[pIdx + 1] : null;
  const rest2 = pIdx >= 0 ? rest.filter((_, i) => i !== pIdx && i !== pIdx + 1) : rest;
  const [key, decision, ...evidence] = rest2;
  if (!key || !['allow', 'deny', 'patch'].includes(decision)) {
    console.error('usage: decide <plugin@version|check|resource> <allow|deny|patch> <evidence...>');
    process.exit(2);
  }
  const existing = db.decisions.find((d) => d.key === key);
  const entry = { key, decision, evidence: evidence.join(' '), at: new Date().toISOString() };
  if (decProfile) entry.profile = decProfile;
  if (existing) Object.assign(existing, entry); else db.decisions.push(entry);
  save(db);
  console.log((existing ? 'updated ' : 'added ') + key + ' -> ' + decision);
} else if (cmd === 'list') {
  const prof = rest[0];
  const runs = prof ? db.runs.filter((r) => r.profile === prof) : db.runs;
  console.log('runs: ' + runs.length);
  for (const r of runs.slice(-8)) {
    console.log('  ' + r.at.slice(0, 19).replace('T', ' ') + '  ' + r.result.padEnd(10) + ' ' + (r.checks || []).filter((c) => !c.ok).map((c) => c.name).join(',') || '(all pass)');
  }
  console.log('decisions: ' + db.decisions.length);
  for (const d of db.decisions) console.log('  ' + d.decision.toUpperCase().padEnd(6) + d.key + '   ' + (d.evidence || '').slice(0, 70));
} else if (cmd === 'stale') {
  const dir = rest[0];
  if (!dir) { console.error('usage: stale <profileDir>'); process.exit(2); }
  const { readFileSync: rd, existsSync: ex } = await import('node:fs');
  const { join: j } = await import('node:path');
  let deps = {};
  try { deps = JSON.parse(rd(j(dir, 'package.json'), 'utf8')).dependencies || {}; } catch {}
  const installed = (pkg) => {
    try { return JSON.parse(rd(j(dir, 'node_modules', pkg, 'package.json'), 'utf8')).version; } catch { return null; }
  };
  let stale = 0;
  for (const d of db.decisions) {
    if (d.profile && d.profile !== dir) continue;
    const [pv] = String(d.key).split('|');
    const at = pv.lastIndexOf('@');
    const pkg = pv.slice(0, at);
    const ver = pv.slice(at + 1);
    const now = installed(pkg);
    if (d.decision === 'deny') {
      // deny + absent = the decision still holds; deny + present = someone overrode it
      if (now) { console.log('STALE  ' + pkg + ' ' + now + ' is installed but a deny decision exists'); stale++; }
      continue;
    }
    if (!now) { console.log('DORMANT ' + pkg + ' not installed (' + d.decision + ' decision, nothing to review)'); continue; }
    if (now !== ver) { console.log('STALE  ' + pkg + ' ' + ver + ' -> ' + now + ' (' + d.decision + ' decision needs review)'); stale++; }
  }
  console.log(stale ? 'summary: ' + stale + ' decision(s) out of date' : 'summary: every decision matches an installed version');
  process.exit(stale ? 9 : 0);
} else if (cmd === 'new-since') {
  const dir = rest[0];
  if (!dir) { console.error('usage: new-since <profileDir>'); process.exit(2); }
  const { readFileSync: rd } = await import('node:fs');
  const { join: j } = await import('node:path');
  let now = [];
  try { now = JSON.parse(rd(j(dir, 'package.json'), 'utf8')).dsh?.profile?.bundles || []; } catch {}
  const runs = db.runs.filter(r => r.profile === dir && (r.bundles || []).length);
  const last = runs[runs.length - 1];
  if (!last) { console.log('no gate run with a bundle snapshot yet'); process.exit(0); }
  const before = new Set(last.bundles || []);
  const added = now.filter(b => !before.has(b));
  const removed = (last.bundles || []).filter(b => !now.includes(b));
  console.log('last gate run: ' + last.at.slice(0, 19).replace('T', ' ') + ' (' + last.result + ')');
  console.log(added.length ? 'UNVETTED  ' + added.join(', ') : 'no bundle added since the last gate run');
  if (removed.length) console.log('removed   ' + removed.join(', '));
  process.exit(added.length ? 10 : 0);
} else if (cmd === 'stats') {
  const byResult = {};
  const failedCheck = {};
  for (const r of db.runs) {
    byResult[r.result] = (byResult[r.result] || 0) + 1;
    for (const c of r.checks || []) if (!c.ok) failedCheck[c.name] = (failedCheck[c.name] || 0) + 1;
  }
  const byDecision = {};
  for (const d of db.decisions) byDecision[d.decision] = (byDecision[d.decision] || 0) + 1;
  console.log('runs: ' + db.runs.length);
  for (const [k, v] of Object.entries(byResult).sort((a, b) => b[1] - a[1])) console.log('  ' + k.padEnd(16) + v);
  console.log('blocked by check:');
  const fc = Object.entries(failedCheck).sort((a, b) => b[1] - a[1]);
  if (!fc.length) console.log('  (none)');
  for (const [k, v] of fc) console.log('  ' + k.padEnd(16) + v);
  console.log('decisions: ' + db.decisions.length);
  for (const [k, v] of Object.entries(byDecision)) console.log('  ' + k.padEnd(16) + v);
  const repeats = {};
  for (const d of db.decisions) {
    const pkg = String(d.key).split('|')[0];
    repeats[pkg] = (repeats[pkg] || 0) + 1;
  }
  const noisy = Object.entries(repeats).filter(([, n]) => n > 1);
  if (noisy.length) {
    console.log('repeated offenders:');
    for (const [k, n] of noisy) console.log('  ' + k.padEnd(30) + n + ' decision(s)');
  }
} else {
  console.log('usage: record|list|decide|stats');
  process.exit(2);
}