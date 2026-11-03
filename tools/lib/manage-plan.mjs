'use strict';
// 启停计划（纯函数）：把「要改哪一行、怎么改、前置指纹是什么」组装成可断言的对象。
// 以前这段拼在 manage.mjs 的 CLI 分支里，dry-run 的形状只能靠跑一次命令来验证。
import { createHash } from 'node:crypto';

export function fingerprint(text) {
  return createHash('sha256').update(String(text || ''), 'utf8').digest('hex').slice(0, 16);
}

export function togglePlan({ patchText, rowId, disable, target, file, nextText, rowDisabled }) {
  if (disable && rowDisabled) {
    return { ok: true, noop: true, action: 'disable', target, row: rowId, file };
  }
  return {
    ok: true,
    dryRun: true,
    action: disable ? 'disable' : 'enable',
    target,
    row: rowId,
    file,
    plan: [disable ? '块内插入 disabled: true（保留其它键）' : '删除块内 disabled: true（保留其它键，空块才移除）'],
    expect: fingerprint(patchText),
    changed: nextText !== undefined && nextText !== patchText,
  };
}
