#!/usr/bin/env node
// 用一句话驱动工具链：解析意图 → 生成命令 → 默认干跑，--apply 才执行。
//
// usage:
//   node tools/ask.mjs <profileDir> "把鲸鱼娘挪到左下角"
//   node tools/ask.mjs <profileDir> "停用 dsh-talk" --apply
//   node tools/ask.mjs <profileDir> "装插件前拍个快照" --apply
//
// 为什么是规则而不是模型：这些动作都是**写**操作，误判一次就改坏配置。
// 规则能解释（会打印「我是怎么理解的」），模型不能。
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ANCHORS = { 左上: 'top-left', 右上: 'top-right', 左下: 'bottom-left', 右下: 'bottom-right', 中间: 'center', 中央: 'center' };

export function parseIntent(text) {
  const t = String(text || '').trim();
  const lower = t.toLowerCase();

  const anchorWord = Object.keys(ANCHORS).find((k) => t.includes(k));
  if (/(挪|移|放|摆).*(到)?/.test(t) && anchorWord) {
    const pkg = (/[\w@./-]{3,}/g.exec(t.replace(/左下|左上|右下|右上|中间|中央/g, ' ')) || [])[0] || '';
    return { intent: 'anchor', pkg, anchor: ANCHORS[anchorWord], reason: '看到「挪到' + anchorWord + '」' };
  }
  const disable = /(停用|禁用|关掉|关闭)\s*([\w@./-]+)?/.exec(t);
  if (disable) return { intent: 'disable', pkg: disable[2] || '', reason: '看到「停用/禁用」' };
  const enable = /(启用|打开|开启)\s*([\w@./-]+)?/.exec(t);
  if (enable) return { intent: 'enable', pkg: enable[2] || '', reason: '看到「启用」' };
  if (/(修|修复|治病|改好)/.test(t)) {
    const pkg = (/[\w@./-]{3,}/g.exec(t) || [])[0] || '';
    return { intent: 'fix', pkg, reason: '看到「修」' };
  }
  if (/(快照|拍一张|基线)/.test(t)) return { intent: 'snapshot-take', reason: '看到「快照」' };
  if (/(对比|比较|变了什么|装完变)/.test(t)) return { intent: 'snapshot-diff', reason: '看到「对比」' };
  if (/(谁占|占用|拥挤|ui 面)/.test(lower)) return { intent: 'surfaces', reason: '看到「占用」' };
  if (/(骨架|实现|源码|怎么插)/.test(t)) {
    const pkg = (/[\w@./-]{3,}/g.exec(t) || [])[0] || '';
    return { intent: 'inspect', pkg, reason: '看到「骨架/实现」' };
  }
  if (/(冲突|矛盾|重复)/.test(t)) return { intent: 'conflict', reason: '看到「冲突」' };
  if (/(体检|检查|诊断|哪里不对)/.test(t)) return { intent: 'diagnose', reason: '看到「检查/诊断」' };
  return { intent: 'help', reason: '没匹配到已知意图' };
}

export function planFor(parsed, profileDir) {
  const p = profileDir;
  const cmds = [];
  const missing = [];
  switch (parsed.intent) {
    case 'anchor':
      if (!parsed.pkg) missing.push('要挪哪个插件？给个包名，例如 dsh-whale-widget');
      else cmds.push(['anchor.mjs', p, '--package', parsed.pkg, '--anchor', parsed.anchor]);
      break;
    case 'disable':
      if (!parsed.pkg) missing.push('要停用哪个插件？');
      else cmds.push(['manage.mjs', p, '--disable', parsed.pkg]);
      break;
    case 'enable':
      if (!parsed.pkg) missing.push('要启用哪个插件？');
      else cmds.push(['manage.mjs', p, '--enable', parsed.pkg]);
      break;
    case 'fix':
      cmds.push(['fix.mjs', p]);
      break;
    case 'snapshot-take':
      cmds.push(['profile-snapshot.mjs', p, '--take']);
      break;
    case 'snapshot-diff':
      cmds.push(['profile-snapshot.mjs', p, '--diff']);
      break;
    case 'surfaces':
      cmds.push(['ui-surfaces.mjs', p]);
      break;
    case 'inspect':
      if (!parsed.pkg) missing.push('看哪个插件？给个包名');
      else cmds.push(['inspect-plugin.mjs', p, parsed.pkg]);
      break;
    case 'conflict':
      cmds.push(['conflict.mjs', p]);
      break;
    case 'diagnose':
      cmds.push(['diagnose.mjs', '--live']);
      break;
    default:
      missing.push('可以这样说：把 <插件> 挪到左下角 / 停用 <插件> / 修一下 / 拍个快照 / 和上次对比 / 谁占着 ui-settings / 看看 <插件> 怎么插的');
  }
  return { cmds, missing };
}

if (process.argv[1] && process.argv[1].endsWith('ask.mjs')) {
  const argv = process.argv.slice(2);
  const profile = argv.find((a) => !a.startsWith('--') && !/[一-龥]/.test(a));
  const text = argv.filter((a) => !a.startsWith('--') && a !== profile).join(' ');
  const apply = argv.includes('--apply');
  if (!profile || !text) { console.error('usage: node tools/ask.mjs <profileDir> "<一句话>" [--apply]'); process.exit(2); }
  const parsed = parseIntent(text);
  const { cmds, missing } = planFor(parsed, profile);
  console.log('理解：' + parsed.reason + (parsed.pkg ? ' · 插件 ' + parsed.pkg : ''));
  if (missing.length) {
    for (const m of missing) console.log('还需要：' + m);
    try {
      const pkg = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'));
      const list = ((pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || []).slice(0, 12);
      if (list.length) console.log('已装插件：' + list.join(', '));
    } catch (e) {}
    process.exit(3);
  }
  for (const c of cmds) console.log('将执行：node tools/' + c.join(' '));
  if (!apply) { console.log('（干跑：加 --apply 才真的执行）'); process.exit(0); }
  let code = 0;
  // 只有写工具才追加开关；查询类工具不认 --apply，加了两边都错
  const WRITE = new Set(['anchor.mjs', 'manage.mjs', 'fix.mjs']);
  for (const c of cmds) {
    const extra = c[0] === 'manage.mjs' ? ['--yes'] : WRITE.has(c[0]) ? ['--apply'] : [];
    try {
      const out = execFileSync(process.execPath, [join(here, c[0]), ...c.slice(1), ...extra], { encoding: 'utf8', timeout: 300000 });
      process.stdout.write(out);
    } catch (e) {
      const out = String((e.stdout || '') + (e.stderr || ''));
      process.stdout.write(out);
      code = e.status || 1;
    }
  }
  if (parsed.intent === 'fix' && apply) {
    console.log('');
    console.log('（fix 之后再跑一次检查）');
    try { process.stdout.write(execFileSync(process.execPath, [join(here, 'conflict.mjs'), profile], { encoding: 'utf8', timeout: 120000 })); } catch (e) { process.stdout.write(String(e.stdout || '')); }
  }
  process.exit(code);
}
