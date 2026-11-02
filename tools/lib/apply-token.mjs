'use strict';
// 一次性 applyToken（CLI 与面板共用）：把「写操作必须先 dry-run」从口头纪律变成代码约束。
// CLI 每次调用都是新进程 → token 必须落盘（内存版跨进程永远验不过）。
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const TTL = 5 * 60 * 1000;
const DEDUPE = 2000;

// 目录解析与宿主插件保持一致（index.js 用 DSH_HOME/turnstile-state），不新增第四套推导：
//   DSH_TURNSTILE_STATE > DSH_HOME/turnstile-state > 用户主目录下的 .dsh/turnstile-state > 系统临时目录（仅兜底）
function storeDir() {
  const home = process.env.DSH_HOME || join(process.env.USERPROFILE || process.env.HOME || '', '.dsh');
  return process.env.DSH_TURNSTILE_STATE || (home ? join(home, 'turnstile-state') : join(tmpdir(), 'turnstile-state'));
}

function storePath() {
  const base = storeDir();
  try { mkdirSync(base, { recursive: true }); } catch {}
  return join(base, 'apply-tokens.json');
}

// 失败关闭（C-04）：读不出/结构不对时必须拒绝，不能当成「空集合」继续签发或校验。
function load() {
  const p = storePath();
  if (!existsSync(p)) return { ok: true, db: { tokens: {}, recent: {} } };
  let raw;
  try { raw = readFileSync(p, 'utf8'); } catch (e) { return { ok: false, reason: '令牌存储读不出：' + e.message }; }
  try {
    const db = JSON.parse(raw);
    if (!db || typeof db !== 'object' || !db.tokens || typeof db.tokens !== 'object') return { ok: false, reason: '令牌存储结构不对，拒绝按空集合处理' };
    if (!db.recent || typeof db.recent !== 'object') db.recent = {};
    return { ok: true, db };
  } catch { return { ok: false, reason: '令牌存储不是合法 JSON，拒绝按空集合处理' }; }
}

// 原子写：同目录临时文件 + rename，避免读到半截 JSON
function save(db) {
  const p = storePath();
  const tmp = p + '.tmp-' + process.pid;
  writeFileSync(tmp, JSON.stringify(db));
  renameSync(tmp, p);
}

// 跨进程互斥：用 O_EXCL 创建锁文件，拿不到就失败关闭（不排队、不重试）
function withLock(fn) {
  const lock = storePath() + '.lock';
  try { writeFileSync(lock, String(process.pid), { flag: 'wx' }); }
  catch { return { ok: false, reason: '另一个进程正在使用令牌存储，稍后重试' }; }
  try { return fn(); } finally { try { unlinkSync(lock); } catch { /* 锁已是别人的就留着 */ } }
}

function sweep(db, now) {
  for (const [k, v] of Object.entries(db.tokens)) if (v.expires < now || v.used) delete db.tokens[k];
}

export function hashOf(command, args) {
  return createHash('sha256').update(command + '|' + JSON.stringify(args || {})).digest('hex').slice(0, 32);
}

export function issue(command, args, now = Date.now()) {
  return withLock(() => {
    const got = load();
    if (!got.ok) return { ok: false, reason: got.reason };
    const db = got.db;
    sweep(db, now);
    const token = randomUUID();
    db.tokens[token] = { hash: hashOf(command, args), expires: now + TTL, used: false };
    save(db);
    return { token, expiresAt: now + TTL, ttlMs: TTL };
  });
}

export function verify(token, command, args, now = Date.now(), opts = {}) {
  return withLock(() => {
    const got = load();
    if (!got.ok) return { ok: false, reason: got.reason };
    const db = got.db;
    sweep(db, now);
    const rec = db.tokens[String(token || '')];
    if (!rec) { save(db); return { ok: false, reason: 'token 无效或已过期（先 --dry-run 拿一个新的）' }; }
    if (rec.hash !== hashOf(command, args)) { save(db); return { ok: false, reason: 'token 与本次参数不匹配（参数被改过？）' }; }
    if (opts.consume !== false) rec.used = true;
    save(db);
    return { ok: true };
  });
}

export function consume(token) {
  return withLock(() => {
    const got = load();
    if (!got.ok) return { ok: false, reason: got.reason };
    const rec = got.db.tokens[String(token || '')];
    if (rec) rec.used = true;
    save(got.db);
    return { ok: true };
  });
}

export function tooSoon(command, args, now = Date.now()) {
  return withLock(() => {
    const got = load();
    if (!got.ok) return true; // 存储不可用 → 按「太频繁」拒绝，失败关闭
    const db = got.db;
    const h = hashOf(command, args);
    const last = db.recent[h] || 0;
    const soon = now - last < DEDUPE;
    if (!soon) { db.recent[h] = now; save(db); }
    return soon;
  });
}

export function _resetForTests() {
  try { save({ tokens: {}, recent: {} }); } catch { /* 测试环境可能不可写 */ }
}
