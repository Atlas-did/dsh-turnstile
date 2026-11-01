#!/usr/bin/env node
// 技能包（AgentSkills 形态）的查看与校验：借鉴 brooks-lint / distilly 的打包与安装约定，
// 只做「检查 + 报告」，不复制它们的实现。
//
// 约定（与 DSH 一致）：<DSH_HOME>/skills/<dir>/SKILL.md，frontmatter 里有 name/description。
//
// usage:
//   node tools/skill-pack.mjs list [--home <DSH_HOME>]
//   node tools/skill-pack.mjs lint <dir>
//   node tools/skill-pack.mjs doctor [--home <DSH_HOME>] [--json]
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const cmd = argv.find((a) => !a.startsWith('--')) || 'list';
const home = val('--home') || process.env.DSH_HOME || join(homedir(), '.dsh');
const skillsRoot = join(home, 'skills');

function readFront(text) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return null;
  const block = text.slice(3, end);
  const out = {};
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const key = m[1];
    const raw = m[2].trim();
    if (raw === '>' || raw === '|') {
      // YAML 块标量：收下后续缩进行（brooks-lint 的 description 就是这种）
      const parts = [];
      for (let k = i + 1; k < lines.length; k += 1) {
        if (/^\s+\S/.test(lines[k])) parts.push(lines[k].trim());
        else if (lines[k].trim() === '') parts.push('');
        else break;
      }
      out[key] = parts.join(' ').trim();
    } else out[key] = raw;
  }
  return out;
}

function inspectPack(dir) {
  const file = join(dir, 'SKILL.md');
  if (!existsSync(file)) return { dir, ok: false, problems: ['缺少 SKILL.md'] };
  const text = readFileSync(file, 'utf8');
  const fm = readFront(text);
  // 分两档：errors 是「读不了/没法用」，warnings 是「风格不合但能用」。
  // 第三方技能包（brooks-lint / sp-* 前缀）不该被我们的风格规则判死。
  const errors = [];
  const warnings = [];
  if (!fm) errors.push('frontmatter 缺失（必须以 --- 开头）');
  else {
    if (!fm.name) errors.push('frontmatter 缺 name');
    if (!fm.description) errors.push('frontmatter 缺 description');
    if (fm.name && fm.name !== basename(dir)) warnings.push('name(' + fm.name + ') 与目录名(' + basename(dir) + ') 不一致（前缀命名是允许的）');
    if (fm.description && fm.description.length > 1024) warnings.push('description 过长（' + fm.description.length + ' > 1024）');
  }
  const bytes = statSync(file).size;
  if (bytes > 64 * 1024) warnings.push('SKILL.md 过大（' + Math.round(bytes / 1024) + 'KB > 64KB）');
  const problems = errors.concat(warnings);
  let files = 0;
  try { files = readdirSync(dir).length; } catch (e) {}
  return { dir, ok: errors.length === 0, problems, errors, warnings, name: (fm && fm.name) || basename(dir), description: (fm && fm.description) || '', bytes, files };
}

function packs() {
  if (!existsSync(skillsRoot)) return [];
  return readdirSync(skillsRoot)
    .map((n) => join(skillsRoot, n))
    .filter((p) => { try { return statSync(p).isDirectory() && existsSync(join(p, 'SKILL.md')); } catch (e) { return false; } });
}

if (cmd === 'lint') {
  const target = val('--dir') || argv.filter((a) => !a.startsWith('--'))[1];
  if (!target) { console.error('usage: node tools/skill-pack.mjs lint <dir>'); process.exit(2); }
  const r = inspectPack(target);
  console.log((r.ok ? 'OK   ' : 'FAIL ') + r.name + '  (' + r.files + ' 文件, ' + Math.round(r.bytes / 1024) + 'KB)');
  for (const p of r.problems) console.log('  - ' + p);
  process.exit(r.ok ? 0 : 1);
}

if (cmd === 'doctor') {
  const list = packs();
  const results = list.map(inspectPack);
  const bad = results.filter((r) => !r.ok);
  if (argv.includes('--json')) { console.log(JSON.stringify({ home, root: skillsRoot, count: results.length, packs: results }, null, 1)); process.exit(bad.length ? 1 : 0); }
  console.log('技能包检查 · ' + skillsRoot);
  if (!list.length) { console.log('  （没有技能包）'); process.exit(0); }
  for (const r of results) console.log('  ' + (r.ok ? '✓' : '✗') + ' ' + r.name.padEnd(22) + (r.description || '').slice(0, 40));
  console.log('');
  console.log(bad.length ? '不合规 ' + bad.length + ' 个' : '全部合规（' + results.length + ' 个）');
  process.exit(bad.length ? 1 : 0);
}

// list（默认）
const list = packs();
console.log('技能包 · ' + skillsRoot);
for (const r of list.map(inspectPack)) {
  console.log('  ' + r.name.padEnd(22) + String(r.files).padStart(2) + ' 文件  ' + (r.description || '').slice(0, 48));
}
if (!list.length) console.log('  （没有技能包；第三方包用其它工具装进来，例如 npx brooks-lint install dsh）');
