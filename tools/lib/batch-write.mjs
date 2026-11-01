'use strict';
// 批量写的事务边界：先冻结，再逐项执行；任一步失败就把本批文件全部恢复。
// fuse 这类「多文件、多处写」的入口必须走这里（复审 P2-3）。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export function runBatch(files, steps) {
  const snapshot = new Map();
  for (const f of files) {
    if (existsSync(f)) snapshot.set(f, readFileSync(f));
  }
  const done = [];
  for (let i = 0; i < steps.length; i++) {
    try {
      steps[i]();
      done.push(i);
    } catch (e) {
      const problems = [];
      for (const [file, buf] of snapshot) {
        try { writeFileSync(file, buf); } catch (err) { problems.push(file + '：' + err.message); }
      }
      return { ok: false, failedAt: i, error: String(e && e.message || e), restored: problems.length === 0, problems, done };
    }
  }
  return { ok: true, done };
}
