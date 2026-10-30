// Transaction discipline for profile mutations.
// plan -> exact confirm -> precondition hash -> lock + atomic write -> health check -> rollback.
// Every step returns evidence; nothing here trusts the caller.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, copyFileSync, renameSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const sha = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const PLAN_TTL_MS = 10 * 60 * 1000;

/** Build a single-use plan describing one file edit. Does not touch the file. */
export function makePlan({ file, next, reason }) {
  if (!file || typeof next !== 'string') throw new Error('plan needs file and next content');
  const exists = existsSync(file);
  const before = exists ? readFileSync(file, 'utf8') : null;
  const beforeSha = before === null ? null : sha(before);
  const afterSha = sha(next);
  return {
    id: randomUUID(),
    file,
    reason: String(reason || '').slice(0, 200),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + PLAN_TTL_MS).toISOString(),
    beforeSha,
    afterSha,
    creates: !exists,
    bytesBefore: before === null ? 0 : Buffer.byteLength(before, 'utf8'),
    bytesAfter: Buffer.byteLength(next, 'utf8'),
    // The exact string a caller must echo back; short enough to retype, long enough to be deliberate.
    confirm: 'apply ' + afterSha.slice(0, 12),
    next,
  };
}

/** Public shape of a plan: everything except the payload, safe to serialise to a UI. */
export function describePlan(plan) {
  const { next, ...rest } = plan;
  return rest;
}

function lockPath(file) {
  return file + '.lock';
}

/** Apply a plan. Refuses on: expired plan, wrong confirmation, stale precondition, existing lock. */
export function applyPlan(plan, { confirm, healthCheck } = {}) {
  const evidence = {
    planId: plan && plan.id,
    file: plan && plan.file,
    applied: false,
    steps: [],
    problems: [],
  };
  const fail = (reason) => { evidence.problems.push(reason); evidence.applied = false; return evidence; };

  if (!plan || !plan.file || typeof plan.next !== 'string') return fail('invalid plan');
  if (Date.now() > Date.parse(plan.expiresAt)) return fail('plan expired');
  if (confirm !== plan.confirm) return fail('confirmation mismatch');

  const exists = existsSync(plan.file);
  const current = exists ? readFileSync(plan.file, 'utf8') : null;
  const currentSha = current === null ? null : sha(current);
  if (currentSha !== plan.beforeSha) return fail('precondition hash changed');
  evidence.steps.push({ step: 'precondition', ok: true, beforeSha: plan.beforeSha });

  const lock = lockPath(plan.file);
  if (existsSync(lock)) return fail('another mutation holds the lock');
  try { writeFileSync(lock, String(process.pid)); } catch (e) { return fail('cannot take lock: ' + e.message); }
  evidence.steps.push({ step: 'lock', ok: true, lock });

  const backup = plan.file + '.bak-' + Date.now();
  const tmp = plan.file + '.tmp-' + process.pid;
  evidence.backup = null;
  try {
    if (exists) { copyFileSync(plan.file, backup); evidence.backup = backup; evidence.steps.push({ step: 'backup', ok: true, backup }); }
    writeFileSync(tmp, plan.next, 'utf8');
    renameSync(tmp, plan.file);
    evidence.steps.push({ step: 'commit', ok: true, atomic: true });
  } catch (e) {
    try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* ignore */ }
    releaseLock(plan.file);
    return fail('write failed: ' + e.message);
  }

  const written = existsSync(plan.file) ? readFileSync(plan.file, 'utf8') : null;
  if (written === null || sha(written) !== plan.afterSha) {
    // Roll back immediately: this is exactly the case a backup exists for.
    try {
      if (exists) { copyFileSync(backup, plan.file); } else if (existsSync(plan.file)) { unlinkSync(plan.file); }
      evidence.steps.push({ step: 'rollback', ok: true, reason: 'post-write hash mismatch' });
    } catch (e) {
      evidence.steps.push({ step: 'rollback', ok: false, reason: e.message });
    }
    releaseLock(plan.file);
    return fail('post-write hash mismatch');
  }
  evidence.steps.push({ step: 'verify', ok: true, afterSha: plan.afterSha });

  if (typeof healthCheck === 'function') {
    let verdict;
    try { verdict = healthCheck(plan.file); } catch (e) { verdict = { ok: false, detail: e.message }; }
    evidence.steps.push({ step: 'health', ok: !!(verdict && verdict.ok), detail: verdict && verdict.detail });
    if (!verdict || !verdict.ok) {
      evidence.rolledBack = rollback(evidence);
      releaseLock(plan.file);
      return fail('health check failed');
    }
  } else {
    evidence.steps.push({ step: 'health', ok: true, detail: 'no health check supplied' });
  }

  evidence.applied = true;
  evidence.afterSha = plan.afterSha;
  releaseLock(plan.file);
  return evidence;
}

/** Restore the file from the backup recorded in an apply receipt. */
export function rollback(evidence) {
  if (!evidence || !evidence.backup) return false;
  try { copyFileSync(evidence.backup, evidence.file); evidence.rolledBack = true; } catch { evidence.rolledBack = false; }
  return evidence.rolledBack;
}

/** Release the lock recorded for a file (called by the caller when it is done, success or not). */
export function releaseLock(file) {
  const lock = lockPath(file);
  try { if (existsSync(lock)) unlinkSync(lock); return true; } catch { return false; }
}
