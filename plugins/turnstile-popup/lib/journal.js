// Durable operation journal: every mutation is recorded before it starts and settled after,
// so a crash can be detected on the next start instead of leaving a silent half-write.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';

export function journalPath(stateDir) {
  return join(stateDir, 'turnstile-journal.json');
}

function readJournal(stateDir) {
  const p = journalPath(stateDir);
  if (!existsSync(p)) return [];
  try { const j = JSON.parse(readFileSync(p, 'utf8')); return Array.isArray(j.entries) ? j.entries : []; } catch { return []; }
}

function writeJournal(stateDir, entries) {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(journalPath(stateDir), JSON.stringify({ version: 1, entries: entries.slice(-200) }, null, 1));
}

/** Record the intent of an operation: this entry exists before any file is touched. */
export function beginOperation(stateDir, record) {
  const entries = readJournal(stateDir);
  const entry = Object.assign({ id: record.planId, at: new Date().toISOString(), status: 'started' }, record);
  entries.push(entry);
  writeJournal(stateDir, entries);
  return entry;
}

/** Settle an operation: applied | rolled-back | failed | recovery-required. */
export function settleOperation(stateDir, planId, status, detail) {
  const entries = readJournal(stateDir);
  const e = entries.find((x) => x.id === planId);
  if (e) { e.status = status; e.detail = detail || null; e.settledAt = new Date().toISOString(); }
  writeJournal(stateDir, entries);
  return e;
}

/**
 * On start: any operation still marked `started`, or any leftover .tmp-/.lock file next to a
 * patch, means the previous process died mid-write. Mark it `recovery-required` so a human
 * decides - never silently re-apply.
 */
export function recoverJournal(stateDir, watchDirs = []) {
  const entries = readJournal(stateDir);
  const unresolved = entries.filter((e) => e.status === 'started');
  const leftovers = [];
  for (const dir of watchDirs) {
    try {
      for (const f of readdirSync(dir)) {
        if (/\.tmp-\d+$/.test(f) || /\.patch\.yml\.lock$/.test(f)) leftovers.push(join(dir, f));
      }
    } catch { /* dir may not exist yet */ }
  }
  if (!unresolved.length && !leftovers.length) return { recoveryRequired: 0, leftovers };
  for (const e of unresolved) { e.status = 'recovery-required'; e.detail = 'process ended before the operation settled'; e.settledAt = new Date().toISOString(); }
  writeJournal(stateDir, entries);
  return { recoveryRequired: unresolved.length, leftovers };
}

/** Clear a leftover lock after a human acknowledged recovery. */
export function clearLeftover(file) {
  try { if (existsSync(file)) unlinkSync(file); return true; } catch { return false; }
}
