#!/usr/bin/env node
// 自然语言只负责生成可解释的结构化动作；执行与写入确认统一走命令注册表。
// usage: node tools/ask.mjs <profileDir> "看看插件状态" --json
import { COMMANDS, runCommand } from './lib/commands.mjs';
import { shapeReport } from './lib/report.mjs';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join as joinPath } from 'node:path';

const ANCHORS = { 左上: 'top-left', 右上: 'top-right', 左下: 'bottom-left', 右下: 'bottom-right', 中间: 'center', 中央: 'center' };
const packageIn = (text) => (/[@a-zA-Z0-9][\w@./-]{2,}/g.exec(text.replace(/左下|左上|右下|右上|中间|中央/g, ' ')) || [])[0] || '';

export function parseIntent(text) {
  const t = String(text || '').trim();
  const lower = t.toLowerCase();
  const anchorWord = Object.keys(ANCHORS).find((k) => t.includes(k));
  if (/(挪|移|放|摆)/.test(t) && anchorWord) return { intent: 'anchor', pkg: packageIn(t), anchor: ANCHORS[anchorWord], reason: '看到移动动作与位置' };
  if (/(试装结果|上次试装|静态通过|加载未验证|trial)/i.test(t)) return { intent: 'trial-status', reason: '询问最近一次试装证据' };
  if (/(制作.*插件|制作.*页面|新建页面|页面搭建|搭建页面|导出插件|页面设计)/.test(t)) return { intent: 'builder', reason: '进入可视化页面创作' };
  if (/(插件状态|整体状态|环境状态|环境还能用|看看状态|状态怎么样)/.test(t)) return { intent: 'doctor', reason: '询问环境或插件整体状态' };
  const disable = /(停用|禁用|关掉|关闭)\s*([\w@./-]+)?/.exec(t);
  if (disable) return { intent: 'disable', pkg: disable[2] || '', reason: '看到停用动作' };
  const enable = /(启用|打开|开启)\s*([\w@./-]+)?/.exec(t);
  if (enable) return { intent: 'enable', pkg: enable[2] || '', reason: '看到启用动作' };
  if (/(快照|拍一张|基线)/.test(t)) return { intent: 'snapshot-take', reason: '看到快照动作' };
  if (/(对比|比较|变了什么|装完变)/.test(t)) return { intent: 'snapshot-diff', reason: '看到快照对比' };
  if (/(装.*前|安装.*前|装前|风险)/.test(t) && packageIn(t)) return { intent: 'preinstall', pkg: packageIn(t), reason: '安装前检查指定插件' };
  if (/(修|修复|治病|改好)/.test(t)) return { intent: 'fix', pkg: packageIn(t), reason: '看到修复请求' };
  if (/(谁占|占用|拥挤|ui 面)/.test(lower)) return { intent: 'surfaces', reason: '看到 UI 占用问题' };
  if (/(骨架|实现|源码|怎么插)/.test(t)) return { intent: 'inspect', pkg: packageIn(t), reason: '查看插件实现' };
  if (/(冲突|矛盾|重复)/.test(t)) return { intent: 'conflict', reason: '看到冲突检查' };
  if (/(体检|检查|诊断|哪里不对)/.test(t)) return { intent: 'diagnose', reason: '看到检查或诊断' };
  return { intent: 'help', reason: '没匹配到已知意图' };
}

const action = (command, profileDir, extra = {}) => ({
  command,
  args: { profile: profileDir, ...(extra.args || {}) },
  mutating: Boolean(COMMANDS[command]?.mutating),
  danger: Boolean(COMMANDS[command]?.danger),
  ...extra,
});

export function planFor(parsed, profileDir) {
  const actions = [];
  const missing = [];
  const needPkg = () => { if (!parsed.pkg) missing.push('请给出插件包名，例如 dsh-whale-widget'); return !parsed.pkg; };
  switch (parsed.intent) {
    case 'anchor': if (!needPkg()) actions.push(action('anchor', profileDir, { args: { package: parsed.pkg, anchor: parsed.anchor } })); break;
    case 'disable': if (!needPkg()) actions.push(action('manage-disable', profileDir, { args: { package: parsed.pkg } })); break;
    case 'enable': if (!needPkg()) actions.push(action('manage-enable', profileDir, { args: { package: parsed.pkg } })); break;
    case 'fix': actions.push(action('fix', profileDir)); break;
    case 'snapshot-take': actions.push(action('snapshot-take', profileDir)); break;
    case 'snapshot-diff': actions.push(action('snapshot-diff', profileDir)); break;
    case 'surfaces': actions.push(action('surfaces', profileDir)); break;
    case 'inspect': if (!needPkg()) actions.push(action('inspect', profileDir, { args: { pkg: parsed.pkg } })); break;
    case 'preinstall': if (!needPkg()) actions.push(action('preinstall', profileDir, { args: { pkg: parsed.pkg } })); break;
    case 'conflict': actions.push(action('check-conflict', profileDir)); break;
    case 'diagnose': actions.push(action('diagnose', profileDir, { args: {} })); break;
    case 'doctor': actions.push(action('doctor', profileDir)); break;
    case 'trial-status': actions.push(action('trial-status', profileDir)); break;
    case 'builder': actions.push({ command: 'open-builder', args: {}, url: '/turnstile/builder', mutating: false, danger: false }); break;
    default: missing.push('可以说：看看插件状态 / 上次试装结果 / 制作一个页面 / 装 dsh-x 前有哪风险 / 停用 dsh-x');
  }
  return { actions, missing };
}

function usage() {
  console.error('usage: node tools/ask.mjs <profileDir> "<一句话>" [--json] [--apply]');
  process.exit(2);
}

if (process.argv[1] && process.argv[1].endsWith('ask.mjs')) {
  const argv = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  // 两种顺序都接受：`ask <profile> "话"` 与 `ask "话" <profile>`。
  // 判断依据是「哪一个看起来像 profile」（带路径分隔符，或在 DSH_HOME 下存在）。
  const looksProfile = (s) => Boolean(s) && (/[\\/]/.test(s) || existsSync(joinPath(process.env.DSH_HOME || joinPath(homedir(), '.dsh'), 'profiles', s)));
  const first = argv[0] || '';
  const second = argv[1] || '';
  const profile = looksProfile(first) && !looksProfile(second) ? first : (looksProfile(second) ? second : first);
  const profileIdx = profile === first ? 0 : 1;
  const textParts = argv.filter((_, i) => i !== profileIdx);
  const text = textParts.join(' ');
  const allArgs = process.argv.slice(2);
  const asJson = allArgs.includes('--json');
  const apply = allArgs.includes('--apply');
  if (!profile || !text || profile.startsWith('--')) usage();
  const parsed = parseIntent(text);
  const plan = planFor(parsed, profile);
  const base = {
    ok: plan.missing.length === 0,
    verdict: plan.missing.length ? 'unknown' : 'ok',
    summary: plan.missing.length ? plan.missing.join('；') : parsed.reason,
    intent: parsed.intent,
    actions: plan.actions,
    next: plan.actions.some((a) => a.mutating)
      ? [{ label: '先查看写入计划', mutating: false, reason: '对动作先 dry-run，用户明确确认后才能 apply' }]
      : [],
  };
  if (!apply) {
    if (asJson) console.log(JSON.stringify(base, null, 2));
    else {
      console.log('理解：' + parsed.reason);
      if (plan.missing.length) for (const m of plan.missing) console.log('还需要：' + m);
      for (const a of plan.actions) console.log('动作：' + a.command + (a.mutating ? '（写操作，必须先 dry-run）' : '（只读）'));
      console.log('（只生成计划；不会直接修改配置）');
    }
    process.exitCode = plan.missing.length ? 3 : 0;
  } else if (plan.missing.length) {
    console.log(JSON.stringify(base, null, 2));
    process.exitCode = 3;
  } else if (plan.actions.some((a) => a.mutating)) {
    const refused = { ...base, ok: false, verdict: 'unknown', summary: 'ask 不直接执行写操作；请对每个动作先 dry-run，取得 applyToken 并在用户确认后重放。' };
    console.log(JSON.stringify(refused, null, 2));
    process.exitCode = 2;
  } else {
    let exitCode = 0;
    for (const a of plan.actions) {
      if (a.command === 'open-builder') {
        console.log(JSON.stringify({ ...base, summary: '打开页面搭建器', url: a.url }, null, 2));
        continue;
      }
      const result = runCommand(a.command, a.args);
      const report = shapeReport({ command: a.command, exitCode: result.exitCode, parsed: result.data, stderr: (result.evidence || [])[0] || '', mutating: false, dryRun: false, durationMs: result.durationMs });
      console.log(JSON.stringify({ ...report, data: result.data }, null, 2));
      if (result.exitCode) exitCode = result.exitCode;
    }
    process.exitCode = exitCode;
  }
}
