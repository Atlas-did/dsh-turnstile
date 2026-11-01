#!/usr/bin/env node
// 在最小隔离宿主里加载两次生成插件；不代表已安装进真实 DSH/mini。
import { resolve } from 'node:path';
import { verifyExportedPlugin } from '../plugins/turnstile-popup/lib/export-verify.js';

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
if (!target) {
  console.error('usage: node tools/verify-export.mjs <exportedPluginDir> [--json]');
  process.exit(2);
}
const evidence = await verifyExportedPlugin(resolve(target));
if (args.includes('--json')) console.log(JSON.stringify(evidence, null, 2));
else {
  console.log('范围：隔离模块宿主（不是实际 DSH/mini 试装）');
  for (const c of evidence.checks) console.log((c.ok ? 'ok   ' : 'FAIL ') + c.name + (c.detail ? '   ' + c.detail : ''));
  for (const b of evidence.boots) console.log('boot ' + b.label + ': HTTP ' + b.status);
  console.log(evidence.ok ? '结论：生成模块通过隔离加载与重启自检；尚未试装真实 mini。' : '结论：隔离模块自检失败。');
}
process.exitCode = evidence.ok ? 0 : 1;
