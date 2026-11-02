'use strict';
// 把 finding 的 locator 变成可点击的编辑器链接（方案 03：finding 可定位）。
// 纯函数：不碰文件系统，只做路径规范化与协议拼接。
// node 侧 tools/lib/locator.mjs 直接转出这一份，避免浏览器与工具链各写一套实现。
export function editorLink(locator) {
  const loc = locator && typeof locator === 'object' ? locator : {};
  const file = String(loc.file || '').trim();
  if (!file) return null;
  // 只接受仓库相对路径或绝对路径；协议头/URL 一律拒绝，避免把奇怪的东西塞进 vscode://
  // 单字母前缀是 Windows 盘符（C:/…），不是协议；协议名至少两个字符才拒绝
  if (/^[a-z][a-z0-9+.-]+:/i.test(file)) return null;
  const norm = file.replace(/\\/g, '/').replace(/^\.\//, '');
  const line = Number.isInteger(loc.line) && loc.line > 0 ? loc.line : null;
  return { href: 'vscode://file/' + norm + (line ? ':' + line : ''), file: norm, line: line };
}

export function linkLabel(link) {
  if (!link) return '';
  return link.line ? link.file + ':' + link.line : link.file;
}

if (typeof window !== 'undefined') window.TurnstileLocator = { editorLink: editorLink, linkLabel: linkLabel };
