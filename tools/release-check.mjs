#!/usr/bin/env node
// 发布前一致性检查：入口文件、命令注册表、主文档链接/命令引用，以及可选 npm pack 内容。
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { COMMANDS } from './lib/commands.mjs';

const DOCS = ['README.md', 'README.en.md', 'INSTALL.md', 'docs/README.md', 'skills/turnstile/SKILL.md'];
const REQUIRED = [
  'tools/turnstile.mjs',
  'tools/host-observe.mjs',
  'tools/host-evidence.mjs',
  'tools/lib/host-collector.mjs',
  'tools/lib/check-manifest.mjs',
  'plugins/turnstile-popup/lib/console.html',
  'plugins/turnstile-popup/lib/builder.html',
  'plugins/turnstile-popup/lib/page-render.js',
  'skills/turnstile/SKILL.md',
  'docs/145-conversation-entry.md',
  'docs/146-host-evidence-contract.md',
  'docs/148-check-extension.md',
];

export function checkMarkdownFile(root, relativePath) {
  const file = join(root, relativePath);
  const problems = [];
  if (!existsSync(file)) return [{ id: 'doc-missing', title: '入口文档不存在：' + relativePath, evidence: [relativePath] }];
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].trim().split(/\s+/)[0];
    if (/^(?:https?:|mailto:|vscode:|#)/.test(target)) continue;
    const clean = decodeURIComponent(target.split('#')[0]);
    if (clean && !existsSync(resolve(dirname(file), clean))) problems.push({ id: 'doc-link', title: '失效的本地文档链接：' + target, evidence: [relativePath] });
  }
  for (const match of text.matchAll(/tools\/[A-Za-z0-9._/-]+\.mjs/g)) {
    if (!existsSync(join(root, match[0]))) problems.push({ id: 'doc-command', title: '文档引用了不存在的工具：' + match[0], evidence: [relativePath] });
  }
  for (const pattern of [/tools\/manage\.mjs[^\n]*--yes/, /tools\/profile-snapshot\.mjs[^\n]*--take/]) {
    if (pattern.test(text)) problems.push({ id: 'doc-write-bypass', title: '入口文档仍教用户绕过统一写入闸门', evidence: [relativePath] });
  }
  return problems;
}

export function checkRelease({ root, withPack = false } = {}) {
  const base = resolve(root || dirname(dirname(fileURLToPath(import.meta.url))));
  const findings = [];
  const add = (id, title, evidence = []) => findings.push({ id, severity: 'error', title, evidence, falsifier: '补齐对应文件或修正引用后，本条应消失' });
  const pkgPath = join(base, 'package.json');
  if (!existsSync(pkgPath)) add('package-missing', '缺少 package.json', ['package.json']);
  const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : {};
  for (const [name, file] of Object.entries(pkg.bin || {})) {
    if (!existsSync(join(base, file))) add('bin-missing', `bin ${name} 指向不存在的文件`, [file]);
  }
  for (const [name, line] of Object.entries(pkg.scripts || {})) {
    for (const match of String(line).matchAll(/node\s+([^\s]+\.mjs)/g)) {
      if (!existsSync(join(base, match[1]))) add('script-missing', `npm script ${name} 指向不存在的文件`, [match[1]]);
    }
  }
  for (const [name, spec] of Object.entries(COMMANDS)) {
    if (!existsSync(join(base, 'tools', spec.script))) add('command-missing', `命令 ${name} 的脚本不存在`, [spec.script]);
  }
  for (const file of REQUIRED) if (!existsSync(join(base, file))) add('required-missing', '关键发布文件缺失：' + file, [file]);
  for (const file of DOCS) findings.push(...checkMarkdownFile(base, file).map((p) => ({ severity: 'error', falsifier: '修正链接或命令后应消失', ...p })));

  let pack = null;
  if (withPack) {
    const windows = process.platform === 'win32';
    const executable = windows ? (process.env.ComSpec || 'cmd.exe') : 'npm';
    const args = windows ? ['/d', '/s', '/c', 'npm', 'pack', '--dry-run', '--json'] : ['pack', '--dry-run', '--json'];
    const result = spawnSync(executable, args, {
      cwd: base,
      encoding: 'utf8',
      timeout: 120000,
      windowsHide: true,
    });
    try {
      const data = JSON.parse(result.stdout)[0];
      const names = new Set(data.files.map((f) => f.path));
      for (const file of REQUIRED) if (!names.has(file)) add('pack-missing', 'npm 发布包缺少关键文件：' + file, [file]);
      pack = { entries: data.entryCount, size: data.size, unpackedSize: data.unpackedSize };
    } catch {
      add('pack-failed', 'npm pack --dry-run 失败或输出不可解析', [String(result.stderr || result.error || '').slice(0, 200)]);
    }
  }
  return {
    ok: findings.length === 0,
    verdict: findings.length ? 'fail' : 'ok',
    summary: findings.length ? `发布检查发现 ${findings.length} 个问题` : '入口、文档、命令与发布内容一致',
    findings,
    evidence: [{ root: base, documents: DOCS.length, commands: Object.keys(COMMANDS).length, packChecked: withPack }],
    pack,
    next: findings.length ? [{ label: '修复发布阻断项', mutating: false, reason: '逐项查看 findings；修复后重新运行 release-check' }] : [],
  };
}

if (process.argv[1] && process.argv[1].endsWith('release-check.mjs')) {
  const report = checkRelease({ withPack: process.argv.includes('--pack') });
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(report.summary);
    for (const f of report.findings) console.log('FAIL ' + f.title + (f.evidence?.length ? ' · ' + f.evidence.join(', ') : ''));
    if (report.pack) console.log(`pack: ${report.pack.entries} files · ${report.pack.size} bytes`);
  }
  process.exitCode = report.ok ? 0 : 1;
}
