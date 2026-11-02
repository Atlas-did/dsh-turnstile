'use strict';
// 把 finding 的 locator 变成可点击的编辑器链接（方案 03：finding 可定位）。
// 纯函数：不碰文件系统，只做路径规范化与协议拼接，便于测试。
export function editorLink(locator) {
  const loc = locator && typeof locator === 'object' ? locator : {};
  const file = String(loc.file || '').trim();
  if (!file) return null;
  // 只接受仓库相对路径或绝对路径；协议头/URL 一律拒绝，避免把奇怪的东西塞进 vscode://
  if (/^[a-z][a-z0-9+.-]*:/i.test(file)) return null;
  const norm = file.replace(/\\/g, '/').replace(/^\.\//, '');
  const line = Number.isInteger(loc.line) && loc.line > 0 ? loc.line : null;
  const query = line ? ':' + line : '';
  return { href: 'vscode://file/' + norm + query, file: norm, line };
}

export function linkLabel(link) {
  if (!link) return '';
  return link.line ? link.file + ':' + link.line : link.file;
}
