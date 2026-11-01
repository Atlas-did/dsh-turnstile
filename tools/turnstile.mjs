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
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);

// 子命令表：key 是给人用的名字，值是脚本名（tools/ 下）
const TABLE = {
  gate: 'preflight.mjs',
  preflight: 'preflight.mjs',
  diagnose: 'diagnose.mjs',
  doctor: 'doctor.mjs',
  selftest: 'selftest.mjs',
  inspect: 'inspect-plugin.mjs',
  'diff-plugins': 'diff-plugins.mjs',
  recommend: 'recommend.mjs',
  card: 'card.mjs',
  ask: 'ask.mjs',
  fix: 'fix.mjs',
  anchor: 'anchor.mjs',
  manage: 'manage.mjs',
  preinstall: 'preinstall.mjs',
  atlas: 'ui-atlas.mjs',
  surfaces: 'ui-surfaces.mjs',
  occupancy: 'occupancy.mjs',
  'slot-report': 'slot-map-report.mjs',
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
