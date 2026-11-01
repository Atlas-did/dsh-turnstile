'use strict';
// 页面存储：版本比较 + 备份 + 原子写。真实宿主与控制台共用这一份（审查 P1-1）。
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * 版本号 = 内容 sha256 的前 16 位。
 * 不用 mtime+size：同一毫秒内写入且大小相同会得到同一版本，并发保护就失效了（审查实测）。
 */
export function pageVersion(file) {
  try {
    const buf = readFileSync(file);
    return createHash('sha256').update(buf).digest('hex').slice(0, 16);
  } catch { return '0'; }
}

export function readPage(file) {
  if (!existsSync(file)) return { exists: false, page: null, version: '0' };
  try { return { exists: true, page: JSON.parse(readFileSync(file, 'utf8')), version: pageVersion(file) }; }
  catch (e) { return { exists: true, page: null, version: pageVersion(file), error: String(e.message).slice(0, 120) }; }
}

/**
 * 写入页面。baseVersion 给定时必须与当前版本一致，否则返回 stale（不写）。
 * 返回 { ok, version } | { ok:false, stale:true, version }
 */
export function writePage(file, page, { baseVersion } = {}) {
  const current = pageVersion(file);
  // 版本是字符串哈希，必须按字符串比较（不能 Number()，否则 NaN 永不相等）
  if (baseVersion != null && String(baseVersion) !== String(current)) {
    return { ok: false, stale: true, version: current };
  }
  mkdirSync(dirname(file), { recursive: true });
  if (existsSync(file)) copyFileSync(file, file + '.bak-' + Date.now());
  const tmp = file + '.tmp-' + process.pid;
  writeFileSync(tmp, JSON.stringify(page, null, 2) + '\n');
  renameSync(tmp, file);
  return { ok: true, version: pageVersion(file) };
}
