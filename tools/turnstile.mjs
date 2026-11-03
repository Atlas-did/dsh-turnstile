#!/usr/bin/env node
// 单一入口：把 100+ 个平铺脚本收成一张会指路的子命令树。
//
// 设计原则：
//   1. 这里**不实现任何能力**，只做转发（能力仍在各自 .mjs 里，可单独 node 跑）；
//   2. 子命令 → 脚本 是显式表格，不猜；
//   3. 兼容旧行为：裸 profile 路径 / --only / --skip 自动转发给 gate（preflight）。
//
// usage: node tools/turnstile.mjs <子命令> [...]
import { spawnSync } from 'node:child_process';
import { COMMANDS, runCommand, argvFor, parseCommandArgs, validate } from './lib/commands.mjs';
import { shapeReport } from './lib/report.mjs';
import { issue, verify } from './lib/apply-token.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);

// 注册命令直接从 COMMANDS 生成；这里只保留没有统一契约的旧入口和组合别名。
const TABLE = {
  ...Object.fromEntries(Object.entries(COMMANDS).map(([name, spec]) => [name, spec.script])),
  preflight: 'preflight.mjs',
  selftest: 'selftest.mjs',
  'diff-plugins': 'diff-plugins.mjs',
  recommend: 'recommend.mjs',
  card: 'card.mjs',
  ask: 'ask.mjs',
  manage: 'manage.mjs',
  'host-observe': 'host-observe.mjs',
  atlas: 'ui-atlas.mjs',
  occupancy: 'occupancy.mjs',
  snapshot: 'profile-snapshot.mjs',
  mini: 'mini-ctl.mjs',
  trial: 'sandbox-trial.mjs',
  promote: 'sandbox-promote.mjs',
  archive: 'sandbox-snapshot.mjs',
  journal: 'lab-journal.mjs',
  sync: 'sync-live.mjs',
  arch: 'arch-graph.mjs',
  windows: 'windows-probe.mjs',
  launcher: 'launcher.mjs',
};

// 组合命令：一个名字带默认脚本和固定前缀参数（减少「我得记两个工具」的成本）
const PRESETS = {
  'check risk': ['risk.mjs'],
  'check conflict': ['conflict.mjs'],
  'check engines': ['engines.mjs'],
  'check port': ['port-scan.mjs'],
  'check css': ['css-scan.mjs'],
  'check file': ['file-scan.mjs'],
  'check shortcut': ['shortcut-scan.mjs'],
  'ui slots': ['slot-scan.mjs'],
  'snapshot take': ['profile-snapshot.mjs', '--take'],
  'snapshot diff': ['profile-snapshot.mjs', '--diff'],
  'snapshot list': ['profile-snapshot.mjs', '--list'],
  'lab status': ['mini-ctl.mjs', 'status'],
  'lab url': ['mini-ctl.mjs', 'url'],
  'lab start': ['mini-ctl.mjs', 'start'],
  'lab stop': ['mini-ctl.mjs', 'stop'],
};

function help() {
  console.log('用法: node tools/turnstile.mjs <子命令> [...]');
  console.log('');
  console.log('查');
  console.log('  inspect <profile> <pkg>        插件骨架');
  console.log('  surfaces|occupancy|atlas <profile>   UI 面占用 / 矩阵');
  console.log('  slot-report --map <f>          运行时每插件 × 每 slot');
  console.log('  diff-plugins <profile> a b     两插件差异');
  console.log('  recommend [profile]            推荐插件与接入方式');
  console.log('  card --kind health|slots       生成 genui 卡片');
  console.log('');
  console.log('验');
  console.log('  gate <profile>                 总闸门（12 项并行）');
  console.log('  check <risk|conflict|engines|port|css|file|shortcut> <profile>');
  console.log('  preinstall <profile> <pkg>     装前预检');
  console.log('  diagnose [--live]              日志/网络诊断');
  console.log('  doctor|selftest                全局视图 / 扫描器自检');
  console.log('  snapshot take|diff|list <profile>');
  console.log('');
  console.log('改');
  console.log('  ask <profile> "<一句话>" [--apply]');
  console.log('  anchor|manage|fix ...          改配置（默认干跑）');
  console.log('  sync <profile>                 把仓库插件文件同步进 profile');
  console.log('');
  console.log('推 / 实验场');
  console.log('  lab status|url|start|stop|cmd  操控 mini');
  console.log('  trial|promote|archive ...      试装 / 推主环境 / 沙盒快照');
  console.log('');
  console.log('兼容：直接给 profile 路径（如 turnstile <profile>）等价于 gate <profile>。');
}

if (!argv.length || ['help', '-h', '--help'].includes(argv[0])) { help(); process.exit(0); }
// help 教的是 `check risk <profile>`，但注册表里叫 check-risk：把组合写法在分发前归一，
// 否则同一个动作会有两种输出形状（原始 JSON vs 统一契约），智能体拿到哪一种全靠运气。
if (argv[0] === 'check' && argv[1] && !argv[1].startsWith('-')) {
  const combined = 'check-' + argv[1];
  if (COMMANDS[combined]) argv.splice(0, 2, combined);
}

// 步骤 3：写操作在 CLI 侧也要 token（把 skill 里的口头纪律变成代码约束）。
if (COMMANDS[argv[0]] && COMMANDS[argv[0]].mutating) {
  const spec = COMMANDS[argv[0]];
  const { args, positional } = parseCommandArgs(argv[0], argv.slice(1));
  const valid = validate(argv[0], args);
  if (!valid.ok) { console.error('拒绝：' + valid.error); process.exit(2); }
  const dryRun = argv.includes('--dry-run');
  const applyIdx = argv.indexOf('--apply');
  if (dryRun) {
    const issued = issue(argv[0], args);
    // 真正的结构化计划：直接跑底层脚本的 dry-run/--json（manage 支持；其它退化为一行命令）
    let plan = ['将执行：' + spec.script + ' ' + argvFor(argv[0], args).join(' ')];
    let diff = null;
    try {
      const diag = runCommandDry(argv[0], args);
      if (diag && Array.isArray(diag.plan)) plan = diag.plan;
      if (diag && diag.file) diff = { file: diag.file, action: diag.action || '', target: diag.target || '' };
    } catch { /* 底层不支持就保留一行说明 */ }
    console.log(JSON.stringify({
      ok: true, verdict: 'ok', dryRun: true, command: argv[0], args,
      plan, diff,
      applyToken: issued.token, expiresAt: issued.expiresAt,
      next: [{ label: '确认后带 token 重放', command: 'node tools/turnstile.mjs ' + argv[0] + ' ' + positional.join(' ') + ' --apply --token <token>', mutating: true, reason: '写操作两段式' }],
    }, null, 2));
    process.exit(0);
  }
  if (applyIdx >= 0) {
    const tokenIdx = argv.indexOf('--token');
    const token = tokenIdx >= 0 ? argv[tokenIdx + 1] : '';
    if (!token) {
      console.error('拒绝：写操作必须先生成计划。先跑 `node tools/turnstile.mjs ' + argv[0] + ' ' + positional.join(' ') + ' --dry-run` 拿 applyToken。');
      process.exit(2);
    }
    if (spec.danger) {
      const target = String(args.package || args.profile || '');
      const confirmIdx = argv.indexOf('--confirm');
      const confirm = confirmIdx >= 0 ? argv[confirmIdx + 1] : '';
      if (confirm !== target) {
        console.error('拒绝：高危操作必须带 --confirm ' + target + '，且与目标逐字一致。');
        process.exit(2);
      }
    }
    const v = verify(token, argv[0], args);
    if (!v.ok) { console.error('拒绝：' + v.reason); process.exit(2); }
    const r = runCommand(argv[0], args, { extraFlags: spec.applyFlag ? [spec.applyFlag] : [] });
    const out = shapeReport({ command: argv[0], exitCode: r.exitCode, parsed: r.data, stderr: (r.evidence || [])[0] || '', mutating: true, dryRun: false, durationMs: r.durationMs, profile: args.profile });
    console.log(JSON.stringify(out, null, 2));
    process.exit(r.exitCode);
  }
  // 没有显式选择计划或执行时，绝不能落入普通 JSON 分派而绕过写入闸门。
  console.error('拒绝：写操作必须显式使用 --dry-run，或确认后使用 --apply --token <token>。');
  process.exit(2);
}

// 底层脚本的 dry-run（写操作计划）：drySafe:false 时绝不能执行底层写入。
function runCommandDry(name, args) {
  const spec = COMMANDS[name];
  if (!spec || spec.drySafe === false) return null;
  const parts = [join(here, spec.script), ...argvFor(name, args)];
  try {
    const out = spawnSync(process.execPath, parts, { encoding: 'utf8', timeout: 30000 }).stdout || '';
    const start = out.indexOf('{');
    return start >= 0 ? JSON.parse(out.slice(start)) : null;
  } catch { return null; }
}

// 注册表里的命令 + --json → 统一参数解析、开关转发与报告契约。
if (COMMANDS[argv[0]] && argv.includes('--json')) {
  const spec = COMMANDS[argv[0]];
  const { args, extraFlags } = parseCommandArgs(argv[0], argv.slice(1));
  const r = runCommand(argv[0], args, { extraFlags });
  const out = shapeReport({
    command: argv[0], exitCode: r.exitCode, parsed: r.data,
    stderr: (r.evidence || [])[0] || '', mutating: Boolean(spec.mutating),
    dryRun: argv.includes('--dry-run'), profile: args.profile, durationMs: r.durationMs,
  });
  console.log(JSON.stringify(out, null, 2));
  process.exit(r.exitCode);
}

let script = '';
let rest = [];

const two = argv.slice(0, 2).join(' ');
if (PRESETS[two]) {
  script = PRESETS[two][0];
  rest = [...PRESETS[two].slice(1), ...argv.slice(2)];
} else if (TABLE[argv[0]]) {
  script = TABLE[argv[0]];
  rest = argv.slice(1);
} else if (argv[0].startsWith('--') || argv[0].includes('/') || argv[0].includes('\\')) {
  // 旧行为：裸 profile 路径或 --only 直接当 gate 的参数
  script = 'preflight.mjs';
  rest = argv;
} else {
  console.error('不认识的子命令：' + argv[0]);
  console.error('试试 node tools/turnstile.mjs help');
  process.exit(2);
}

const child = spawnSync(process.execPath, [join(here, script), ...rest], { stdio: 'inherit' });
if (child.error) { console.error('转发失败：' + child.error.message); process.exit(1); }
process.exit(child.status == null ? 1 : child.status);
