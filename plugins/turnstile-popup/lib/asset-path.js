'use strict';
// /turnstile/asset 的路径边界（C-08）：缺根即拒绝、解码失败即 400、真实路径再校验（防软链接跳出）。
import { existsSync, realpathSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';

export const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };

function inside(roots, target) {
  return roots.some((root) => target === root || target.startsWith(root + sep));
}

export function resolveAsset({ wanted, roots }) {
  const list = (Array.isArray(roots) ? roots : []).filter(Boolean).map((p) => resolve(p));
  if (!list.length) return { ok: false, status: 400, error: '没有配置允许的图片根目录（DSH_TURNSTILE_HOME / DSH_TURNSTILE_ASSETS）' };
  if (!wanted) return { ok: false, status: 400, error: '缺少 path' };
  const target = resolve(String(wanted));
  if (!inside(list, target)) return { ok: false, status: 403, error: '不在允许的图片目录里', target };
  if (!existsSync(target)) return { ok: false, status: 404, error: '文件不存在', target };
  // 软链接可以让字符串前缀检查通过、真实文件却在根外：解析真实路径后再比一次
  let real;
  try { real = realpathSync(target); } catch (e) { return { ok: false, status: 404, error: '路径解析失败：' + e.message, target }; }
  const realRoots = list.map((r) => { try { return realpathSync(r); } catch { return r; } });
  if (!inside(realRoots, real)) return { ok: false, status: 403, error: '解析真实路径后不在允许目录里（可能是软链接）', target };
  try { if (!statSync(real).isFile()) return { ok: false, status: 415, error: '不是普通文件' }; } catch { return { ok: false, status: 404, error: '文件读不到' }; }
  const ext = (real.split('.').pop() || '').toLowerCase();
  const type = IMAGE_TYPES[ext];
  if (!type) return { ok: false, status: 415, error: '不是图片：' + ext };
  return { ok: true, status: 200, file: real, type };
}
