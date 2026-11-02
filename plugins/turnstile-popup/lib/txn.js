// Transaction discipline for profile mutations.
// plan -> exact confirm -> precondition hash -> lock + atomic write -> health check -> rollback.
// Every step returns evidence; nothing here trusts the caller.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, copyFileSync, renameSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const sha = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const PLAN_TTL_MS = 10 * 60 * 1000;

/**
 * 收敛写入的最小可用件：锁 + 前置哈希（含锁后再验）+ 原子替换 + 写后校验 + 失败回滚。
 * 与 applyPlan 的区别只是不做「确认字符串」这一步——给已经过确认流（dry-run → apply）的调用方用，
 * 让它们不必再各写一套 copyFileSync + writeFileSync。
 */
export function atomicReplace(file, next, { expectBeforeSha } = {}) {
  const evidence = { steps: [], backup: null, existed: existsSync(file) };
  const before = evidence.existed ? readFileSync(file, 'utf8') : null;
  const beforeSha = before === null ? null : sha(before);
  if (expectBeforeSha !== undefined && expectBeforeSha !== beforeSha) return { ok: false, reason: 'precondition hash changed', evidence };
  const lock = file + '.lock';
  if (existsSync(lock)) return { ok: false, reason: 'another mutation holds the lock', evidence };
  try { writeFileSync(lock, String(process.pid)); } catch (e) { return { ok: false, reason: 'cannot take lock: ' + e.message, evidence }; }
  try {
    const locked = existsSync(file) ? readFileSync(file, 'utf8') : null;
    if ((locked === null ? null : sha(locked)) !== beforeSha) return { ok: false, reason: 'precondition changed while waiting for the lock', evidence };
    const backup = file + '.bak-' + Date.now();
    if (evidence.existed) { copyFileSync(file, backup); evidence.backup = backup; }
    const tmp = file + '.tmp-' + process.pid;
    writeFileSync(tmp, next, 'utf8');
    renameSync(tmp, file);
    const after = readFileSync(file, 'utf8');
    if (sha(after) !== sha(next)) {
      if (evidence.existed) copyFileSync(backup, file); else unlinkSync(file);
      return { ok: false, reason: 'post-write hash mismatch', evidence };
    }
    return { ok: true, evidence, beforeSha, afterSha: sha(next) };
  } finally {
    try { unlinkSync(lock); } catch { /* 锁不存在就算了 */ }
  }
}

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
  // 拿到锁之后再验一次：从上面那次读到拿锁之间有窗口，别人可能已经改过文件（C-03）
  const lockedText = existsSync(plan.file) ? readFileSync(plan.file, 'utf8') : null;
  const lockedSha = lockedText === null ? null : sha(lockedText);
  if (lockedSha !== plan.beforeSha) {
    releaseLock(plan.file);
    return fail('precondition changed while waiting for the lock');
  }
  evidence.steps.push({ step: 'precondition-after-lock', ok: true, beforeSha: plan.beforeSha });

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
    // 没有健康检查就是「没做」，不能记成通过（C-03）
    evidence.steps.push({ step: 'health', ok: null, detail: 'not-run: no health check supplied' });
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
