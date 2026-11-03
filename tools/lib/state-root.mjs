'use strict';
// 状态根的唯一解析器（评审/讲解：仓库里有 6 套推导，gate 报告因此在某些组合下读不到）。
// 优先级（与宿主插件 index.js 现有约定一致，不新增第五套）：
//   1. 显式参数（--state / options.stateDir）
//   2. DSH_TURNSTILE_STATE
//   3. DSH_HOME/turnstile-state
//   4. <profileDir>/../../turnstile-state（历史布局：profile 位于 <home>/profiles/<name>）
//   5. 系统临时目录（仅兜底，且调用方应视为不可靠）
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

export function resolveStateDir({ explicit, env = process.env, profileDir } = {}) {
  if (explicit) return resolve(explicit);
  if (env.DSH_TURNSTILE_STATE) return resolve(env.DSH_TURNSTILE_STATE);
  if (env.DSH_HOME) return join(resolve(env.DSH_HOME), 'turnstile-state');
  if (profileDir) return resolve(join(profileDir, '..', '..', 'turnstile-state'));
  return join(tmpdir(), 'turnstile-state');
}

// 给报告/CLI 打印用：说清这份状态是哪一条规则算出来的，避免「读不到」时只能靠猜
export function describeStateDir(chosen, { explicit, env = process.env, profileDir } = {}) {
  const source = explicit ? 'explicit' : env.DSH_TURNSTILE_STATE ? 'DSH_TURNSTILE_STATE'
    : env.DSH_HOME ? 'DSH_HOME' : profileDir ? 'profile-relative' : 'tmp-fallback';
  return { dir: chosen, source, reliable: source !== 'tmp-fallback' };
}
