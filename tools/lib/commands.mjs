'use strict';
// 命令注册表（L2）：面板与 CLI 共用同一份声明，避免「面板能点、CLI 没有」。
// 每个命令声明：脚本、是否写操作、参数 schema（极简）、超时。
// handler 只做「spawn 既有 CLI + 解析 JSON」，不在这里重写业务逻辑。
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const toolsDir = dirname(fileURLToPath(import.meta.url)).replace(/[\\/]lib$/, '');

export const COMMANDS = {
  // doctor 接受 profile 路径（B9 起支持位置参数传目录），所以传 profile
  'doctor': { script: 'doctor.mjs', mutating: false, json: false, timeout: 60000, positional: ['profile'] },
  'gate': { script: 'preflight.mjs', mutating: false, json: true, timeout: 180000, positional: ['profile'] },
  'surfaces': { script: 'ui-surfaces.mjs', mutating: false, json: false, timeout: 60000, positional: ['profile'] },
  'slot-report': { script: 'slot-map-report.mjs', mutating: false, json: true, timeout: 60000, flags: ['--map'] },
  'snapshot-list': { script: 'profile-snapshot.mjs', mutating: false, json: false, timeout: 60000, positional: ['profile'], fixed: ['--list'] },
  'snapshot-diff': { script: 'profile-snapshot.mjs', mutating: false, json: true, timeout: 60000, positional: ['profile'], fixed: ['--diff'] },
  'inspect': { script: 'inspect-plugin.mjs', mutating: false, json: true, timeout: 60000, positional: ['profile', 'pkg'] },
  'diagnose': { script: 'diagnose.mjs', mutating: false, json: true, timeout: 90000, fixed: ['--live'] },
  'preinstall': { script: 'preinstall.mjs', mutating: false, json: false, timeout: 90000, positional: ['profile', 'pkg'] },
  // 写操作：必须先 dryRun，拿到 applyToken 才能 apply
  'snapshot-take': { script: 'profile-snapshot.mjs', mutating: true, json: false, timeout: 60000, positional: ['profile'], fixed: ['--take'] },
  'manage-enable': { script: 'manage.mjs', mutating: true, json: false, timeout: 60000, positional: ['profile'], flagMap: { package: '--enable' } },
  // 高危：禁用插件会让界面少一块，apply 时必须逐字确认目标包名（设计 §4.4-3）
  'manage-disable': { script: 'manage.mjs', mutating: true, danger: true, json: false, timeout: 60000, positional: ['profile'], flagMap: { package: '--disable' } },
};

/** 极简参数校验：缺必填位置参数就报错（不做类型推断，避免假安全）。 */
export function validate(command, args) {
  const spec = COMMANDS[command];
  if (!spec) return { ok: false, code: 404, error: '未知命令：' + command + '（白名单里没有）' };
  const a = args || {};
  const need = spec.positional || [];
  for (const k of need) {
    if (a[k] == null || a[k] === '') return { ok: false, code: 400, error: '缺少参数：' + k };
  }
  if (spec.flagMap) {
    for (const k of Object.keys(spec.flagMap)) {
      if (a[k] == null || a[k] === '') return { ok: false, code: 400, error: '缺少参数：' + k };
    }
  }
  return { ok: true, spec };
}

/** 把 {profile, pkg, ...} 变成 argv。 */
export function argvFor(command, args) {
  const spec = COMMANDS[command];
  const out = [];
  for (const k of spec.positional || []) out.push(String(args[k]));
  for (const f of spec.fixed || []) out.push(f);
  for (const [k, flag] of Object.entries(spec.flagMap || {})) out.push(flag, String(args[k]));
  for (const flag of spec.flags || []) if (args[flag.replace(/^--/, '')] != null) out.push(flag, String(args[flag.replace(/^--/, '')]));
  if (spec.json) out.push('--json');
  return out;
}

/** 执行一个命令，返回统一契约。 */
export function runCommand(command, args, { toolsRoot } = {}) {
  const v = validate(command, args);
  if (!v.ok) return { ok: false, verdict: 'unknown', exitCode: v.code, summary: v.error, findings: [], evidence: [], next: [] };
  const spec = v.spec;
  // toolsRoot 可能被传成「仓库根」也可能是「tools 目录」：按是否存在脚本判断，别猜。
  let base = toolsDir;
  if (toolsRoot) {
    base = existsSync(join(toolsRoot, spec.script)) ? toolsRoot : join(toolsRoot, 'tools');
  }
  const started = Date.now();
  const res = spawnSync(process.execPath, [join(base, spec.script), ...argvFor(command, args)], { encoding: 'utf8', timeout: spec.timeout });
  const durationMs = Date.now() - started;
  const stdout = String(res.stdout || '');
  const stderr = String(res.stderr || '');
  let parsed = null;
  if (spec.json) { try { parsed = JSON.parse(stdout); } catch (e) { parsed = null; } }
  const exitCode = res.status == null ? 1 : res.status;
  const verdict = exitCode === 0 ? 'ok' : exitCode === 3 ? 'unknown' : 'fail';
  return {
    ok: exitCode === 0,
    verdict,
    command,
    exitCode,
    durationMs,
    summary: parsed ? (parsed.result || parsed.verdict || parsed.summary || '') : (stdout.trim().split('\n').slice(0, 3).join(' / ') || stderr.trim().slice(0, 160)),
    data: parsed,
    findings: parsed && Array.isArray(parsed.findings) ? parsed.findings : [],
    evidence: stderr ? [stderr.trim().split('\n')[0].slice(0, 200)] : [],
    next: [],
  };
}
