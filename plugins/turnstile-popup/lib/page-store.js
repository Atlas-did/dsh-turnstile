'use strict';
// 页面存储：版本比较 + 备份 + 原子写。真实宿主与控制台共用这一份（审查 P1-1）。
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** 版本号 = mtime + size；够用来发现「别处改过」，不需要额外存储。 */
export function pageVersion(file) {
  try { const st = statSync(file); return Number(st.mtimeMs) + Number(st.size); } catch { return 0; }
}

export function readPage(file) {
  if (!existsSync(file)) return { exists: false, page: null, version: 0 };
  try { return { exists: true, page: JSON.parse(readFileSync(file, 'utf8')), version: pageVersion(file) }; }
  catch (e) { return { exists: true, page: null, version: pageVersion(file), error: String(e.message).slice(0, 120) }; }
}

/**
 * 写入页面。baseVersion 给定时必须与当前版本一致，否则返回 stale（不写）。
 * 返回 { ok, version } | { ok:false, stale:true, version }
 */
export function writePage(file, page, { baseVersion } = {}) {
  const current = pageVersion(file);
  if (baseVersion != null && Number(baseVersion) !== current) {
    return { ok: false, stale: true, version: current };
  }
  mkdirSync(dirname(file), { recursive: true });
  if (existsSync(file)) copyFileSync(file, file + '.bak-' + Date.now());
  const tmp = file + '.tmp-' + process.pid;
  writeFileSync(tmp, JSON.stringify(page, null, 2) + '\n');
  renameSync(tmp, file);
  return { ok: true, version: pageVersion(file) };
}
