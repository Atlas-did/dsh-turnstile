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
  'doctor': { script: 'doctor.mjs', mutating: false, json: true, timeout: 60000, positional: ['profile'] },
  'gate': { script: 'preflight.mjs', mutating: false, json: true, timeout: 180000, positional: ['profile'], valueFlags: ['--checks', '--only', '--skip'], booleanFlags: ['--no-record', '--no-report'] },
  'surfaces': { script: 'ui-surfaces.mjs', mutating: false, json: true, timeout: 60000, positional: ['profile'] },
  'slot-report': { script: 'slot-map-report.mjs', mutating: false, json: true, timeout: 60000, flags: ['--map', '--plugin', '--against'] },
  'snapshot-list': { script: 'profile-snapshot.mjs', mutating: false, json: false, timeout: 60000, positional: ['profile'], fixed: ['--list'] },
  'snapshot-diff': { script: 'profile-snapshot.mjs', mutating: false, json: true, timeout: 60000, positional: ['profile'], fixed: ['--diff'] },
  'inspect': { script: 'inspect-plugin.mjs', mutating: false, json: true, timeout: 60000, positional: ['profile', 'pkg'], valueFlags: ['--lines'] },
  'diagnose': { script: 'diagnose.mjs', mutating: false, json: true, timeout: 90000, fixed: ['--live'] },
  // 真实 mini 端到端验收：装 → 六级 → 卸 → 回滚证据（handoff P0-1）
  'acceptance': { script: 'acceptance-mini.mjs', mutating: true, drySafe: false, json: true, timeout: 900000, positional: ['name'], flagMap: { dir: '--dir', mini: '--mini', out: '--out' } },
  // 创作闭环：新建/导出 → 试装 → 六级验证（任一段失败就停）
  'create': { script: 'create-loop.mjs', mutating: true, drySafe: true, json: true, timeout: 900000, positional: ['name'], flagMap: { dir: '--dir', template: '--template', mini: '--mini' } },
  // 重启 mini 并取新 token（写操作：会中断正在跑的会话）
  'lab-reload': { script: 'lab-reload.mjs', mutating: true, drySafe: true, json: true, timeout: 240000 },
  // 把搭建器产物导出成插件（写文件）
  'export-page': { script: 'builder-export.mjs', mutating: true, json: false, timeout: 60000 },
  // 创作闭环第 1 步：生成一个「能被宿主真的加载」的最小插件
  'new-plugin': { script: 'new-plugin.mjs', mutating: true, drySafe: true, json: true, timeout: 60000, positional: ['name'], flagMap: { dir: '--dir', template: '--template' } },
  'preinstall': { script: 'preinstall.mjs', mutating: false, json: true, timeout: 90000, positional: ['profile', 'pkg'] },
  'trial-status': { script: 'trial-status.mjs', mutating: false, json: true, timeout: 60000, positional: ['profile'] },
  'host-evidence': { script: 'host-evidence.mjs', mutating: false, json: true, timeout: 60000, positional: ['input'] },
  // mini 实验场：status/url 只读；start/stop 是没有 dry-run 的写操作，stop 还要求逐字确认 target
  'mini-status': { script: 'mini-ctl.mjs', mutating: false, json: true, timeout: 10000, fixed: ['status'], flags: ['--mini'] },
  'mini-url': { script: 'mini-ctl.mjs', mutating: false, json: true, timeout: 10000, fixed: ['url'], flags: ['--mini'] },
  'mini-start': { script: 'mini-ctl.mjs', mutating: true, drySafe: false, json: true, timeout: 90000, fixed: ['start'], flags: ['--mini'] },
  'mini-stop': { script: 'mini-ctl.mjs', mutating: true, drySafe: false, danger: true, dangerTarget: 'mini', json: true, timeout: 70000, fixed: ['stop'], flags: ['--mini'] },
  // 三查也进注册表（以前完全不在表里，面板/智能体只能自己拼命令）
  'check-risk': { script: 'risk.mjs', mutating: false, json: true, timeout: 60000, positional: ['profile'] },
  'check-conflict': { script: 'conflict.mjs', mutating: false, json: true, timeout: 60000, positional: ['profile'] },
  'check-engines': { script: 'engines.mjs', mutating: false, json: true, timeout: 60000, positional: ['profile'] },
  // 写操作：必须先 dryRun，拿到 applyToken 才能 apply
  // drySafe:false = 底层没有「只读 dry-run」模式，计划阶段绝不能真跑（否则 dry-run 就写了）
  'snapshot-take': { script: 'profile-snapshot.mjs', mutating: true, drySafe: false, json: true, timeout: 60000, positional: ['profile'], fixed: ['--take'] },
  'anchor': { script: 'anchor.mjs', mutating: true, json: false, timeout: 60000, positional: ['profile'], flagMap: { package: '--package', anchor: '--anchor' }, applyFlag: '--apply' },
  'fix': { script: 'fix.mjs', mutating: true, json: true, timeout: 180000, positional: ['profile'], applyFlag: '--apply' },
  'manage-enable': { script: 'manage.mjs', mutating: true, json: true, timeout: 60000, positional: ['profile'], flagMap: { package: '--enable' }, applyFlag: '--yes' },
  // 高危：禁用插件会让界面少一块，apply 时必须逐字确认目标包名（设计 §4.4-3）
  'manage-disable': { script: 'manage.mjs', mutating: true, danger: true, json: true, timeout: 60000, positional: ['profile'], flagMap: { package: '--disable' }, applyFlag: '--yes' },
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

/** 单一 CLI 参数解析器：flag 的值不能再被误当成位置参数。 */
export function parseCommandArgs(command, argv = []) {
  const spec = COMMANDS[command];
  if (!spec) return { args: {}, positional: [], extraFlags: [] };
  const flagMap = spec.flagMap || {};
  const valued = new Set([...Object.values(flagMap), ...(spec.flags || []), ...(spec.valueFlags || []), '--token', '--confirm']);
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i]);
    if (arg.startsWith('--')) {
      if (valued.has(arg) && i + 1 < argv.length) i++;
      continue;
    }
    positional.push(arg);
  }
  const args = {};
  (spec.positional || []).forEach((key, index) => { if (positional[index] != null) args[key] = positional[index]; });
  Object.entries(flagMap).forEach(([key, flag], index) => {
    const at = (spec.positional || []).length + index;
    if (positional[at] != null) args[key] = positional[at];
    const flagIndex = argv.indexOf(flag);
    if (flagIndex >= 0 && argv[flagIndex + 1] != null) args[key] = String(argv[flagIndex + 1]);
  });
  for (const flag of spec.flags || []) {
    const index = argv.indexOf(flag);
    if (index >= 0 && argv[index + 1] != null) args[flag.replace(/^--/, '')] = String(argv[index + 1]);
  }
  const extraFlags = [];
  for (const flag of spec.valueFlags || []) {
    const index = argv.indexOf(flag);
    if (index < 0) continue;
    extraFlags.push(flag);
    if (argv[index + 1] != null) extraFlags.push(String(argv[index + 1]));
  }
  for (const flag of spec.booleanFlags || []) if (argv.includes(flag)) extraFlags.push(flag);
  return { args, positional, extraFlags };
}

/** 把 {profile, pkg, ...} 变成 argv。 */
export function argvFor(command, args) {
  const spec = COMMANDS[command];
  const out = [];
  for (const k of spec.positional || []) out.push(String(args[k]));
  for (const f of spec.fixed || []) out.push(f);
  // 只传真的给了值的 flag：否则会产出 --template undefined
  for (const [k, flag] of Object.entries(spec.flagMap || {})) if (args[k] != null && args[k] !== '') out.push(flag, String(args[k]));
  for (const flag of spec.flags || []) if (args[flag.replace(/^--/, '')] != null) out.push(flag, String(args[flag.replace(/^--/, '')]));
  if (spec.json) out.push('--json');
  return out;
}

/** 执行一个命令，返回统一契约。 */
export function runCommand(command, args, { toolsRoot, extraFlags } = {}) {
  const v = validate(command, args);
  if (!v.ok) return { ok: false, verdict: 'unknown', exitCode: v.code, summary: v.error, findings: [], evidence: [], next: [] };
  const spec = v.spec;
  // toolsRoot 可能被传成「仓库根」也可能是「tools 目录」：按是否存在脚本判断，别猜。
  let base = toolsDir;
  if (toolsRoot) {
    base = existsSync(join(toolsRoot, spec.script)) ? toolsRoot : join(toolsRoot, 'tools');
  }
  const started = Date.now();
  const extra = Array.isArray(extraFlags) ? extraFlags : [];
  const res = spawnSync(process.execPath, [join(base, spec.script), ...argvFor(command, args), ...extra], { encoding: 'utf8', timeout: spec.timeout });
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
    summary: parsed ? (parsed.result || parsed.summary || parsed.verdict || '') : (stdout.trim().split('\n').slice(0, 3).join(' / ') || stderr.trim().slice(0, 160)),
    data: parsed,
    findings: parsed && Array.isArray(parsed.findings) ? parsed.findings : [],
    evidence: stderr ? [stderr.trim().split('\n')[0].slice(0, 200)] : [],
    next: [],
  };
}
