'use strict';
// anchor 的文本变换（纯函数）：插入覆盖块 / 在已有块里改 anchor / 清除 anchor。
// 以前这三段各自内联在 CLI 分支里，只能靠真写文件验证。
export function anchorOverride({ text, rowId, anchor }) {
  return String(text || '').replace(/\s*$/, '') + '\n- id: ' + rowId + '\n  config:\n    anchor: ' + anchor + '\n';
}

export function anchorPreview({ rowId, anchor }) {
  return '- id: ' + rowId + '\n  config:\n    anchor: ' + anchor + '\n';
}
