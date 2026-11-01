'use strict';
// 一次性 applyToken（CLI 与面板共用）：把「写操作必须先 dry-run」从口头纪律变成代码约束。
// CLI 每次调用都是新进程 → token 必须落盘（内存版跨进程永远验不过）。
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const TTL = 5 * 60 * 1000;
const DEDUPE = 2000;

function storePath() {
  const base = process.env.DSH_TURNSTILE_STATE || join(tmpdir(), 'turnstile-state');
  try { mkdirSync(base, { recursive: true }); } catch {}
  return join(base, 'apply-tokens.json');
}

function load() {
  const p = storePath();
  if (!existsSync(p)) return { tokens: {}, recent: {} };
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return { tokens: {}, recent: {} }; }
}

function save(db) {
  try { writeFileSync(storePath(), JSON.stringify(db)); } catch {}
}

function sweep(db, now) {
  for (const [k, v] of Object.entries(db.tokens)) if (v.expires < now || v.used) delete db.tokens[k];
}

export function hashOf(command, args) {
  return createHash('sha256').update(command + '|' + JSON.stringify(args || {})).digest('hex').slice(0, 32);
}

export function issue(command, args, now = Date.now()) {
  const db = load();
  sweep(db, now);
  const token = randomUUID();
  db.tokens[token] = { hash: hashOf(command, args), expires: now + TTL, used: false };
  save(db);
  return { token, expiresAt: now + TTL, ttlMs: TTL };
}

export function verify(token, command, args, now = Date.now(), opts = {}) {
  const db = load();
  sweep(db, now);
  const rec = db.tokens[String(token || '')];
  if (!rec) { save(db); return { ok: false, reason: 'token 无效或已过期（先 --dry-run 拿一个新的）' }; }
  if (rec.hash !== hashOf(command, args)) { save(db); return { ok: false, reason: 'token 与本次参数不匹配（参数被改过？）' }; }
  if (opts.consume !== false) rec.used = true;
  save(db);
  return { ok: true };
}

export function consume(token) {
  const db = load();
  const rec = db.tokens[String(token || '')];
  if (rec) rec.used = true;
  save(db);
}

export function tooSoon(command, args, now = Date.now()) {
  const db = load();
  const h = hashOf(command, args);
  const last = db.recent[h] || 0;
  const soon = now - last < DEDUPE;
  if (!soon) { db.recent[h] = now; save(db); }
  return soon;
}

export function _resetForTests() {
  save({ tokens: {}, recent: {} });
}
