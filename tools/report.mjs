// Generate the gate report: one Markdown page assembled from the live checks.
// usage: node tools/report.mjs <profileDir> [outFile]
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = process.argv[2] || (process.env.DSH_HOME || '') + '/profiles/desktop';
const out = process.argv[3] || join(root, 'docs/22-gate-report.md');

function run(script, ...args) {
  try {
    return execFileSync(process.execPath, [join(root, script), ...args], { encoding: 'utf8', timeout: 300000 });
  } catch (e) {
    return String(e.stdout || '') + String(e.stderr || '');
  }
}
const block = (s) => '```\n' + s.trim() + '\n```';

const risk = run('tools/risk.mjs', dir);
const conflict = run('tools/conflict.mjs', dir);
const matrix = run('tools/registry.mjs', dir);
const prompt = run('tools/prompt-vars.mjs', dir);

let decisions = [];
let runs = [];
const dbFile = join(root, 'state/gate-history.json');
if (existsSync(dbFile)) {
  const db = JSON.parse(readFileSync(dbFile, 'utf8'));
  decisions = db.decisions || [];
  runs = (db.runs || []).filter(r => r.profile === dir).slice(-5).reverse();
}

const lines = [];
lines.push('# 闸门报告（自动生成）');
lines.push('');
lines.push('> 由 `node tools/report.mjs <profileDir>` 生成，不要手改。');
lines.push('> profile: `' + dir + '`');
lines.push('> 生成时间: ' + new Date().toISOString());
lines.push('');
lines.push('## 1. 版本矩阵');
lines.push('');
lines.push(block(matrix.split('\n').slice(0, 40).join('\n')));
lines.push('');
lines.push('## 2. 冲突面');
lines.push('');
lines.push(block(conflict.split('\n').slice(0, 30).join('\n')));
lines.push('');
lines.push('## 3. 依赖风险');
lines.push('');
lines.push(block(risk.split('\n').slice(-6).join('\n')));
lines.push('');
lines.push('## 4. Prompt 变量');
lines.push('');
lines.push(block(prompt.split('\n').slice(0, 10).join('\n')));
lines.push('');
lines.push('## 5. 决策登记（key 带版本号，升级即失效）');
lines.push('');
if (!decisions.length) lines.push('(暂无)');
else {
  lines.push('| 决策 | key | 证据 |');
  lines.push('|---|---|---|');
  for (const d of decisions) lines.push('| ' + d.decision.toUpperCase() + ' | `' + d.key + '` | ' + String(d.evidence || '').slice(0, 60) + ' |');
}
lines.push('');
lines.push('## 6. 最近闸门运行');
lines.push('');
if (!runs.length) lines.push('(暂无)');
else for (const r of runs) lines.push('- ' + r.at.slice(0, 19).replace('T', ' ') + '  **' + r.result + '**  ' + (r.checks || []).filter(c => !c.ok).map(c => c.name).join(', '));
lines.push('');
lines.push('## 5.1 决策是否过期');
lines.push('');
const stale = run('tools/history.mjs', 'stale', dir);
lines.push(block(stale));
lines.push('');
lines.push('## 5.2 自上次闸门后的 bundle 变化');
lines.push('');
const drift = run('tools/history.mjs', 'new-since', dir);
lines.push(block(drift));
lines.push('');
lines.push('## 6.1 闸门统计');
lines.push('');
const stats = run('tools/history.mjs', 'stats');
lines.push(block(stats));
lines.push('');
lines.push('## 7. 怎么用');
lines.push('');
lines.push('```bash');
lines.push('node tools/preflight.mjs <profileDir>     # 装前闸门（五项阻塞）');
lines.push('node scripts/install-plugin.mjs <profileDir> <包@版本>   # 一条命令装完并过闸');
lines.push('node tools/report.mjs <profileDir>        # 重新生成本页');
lines.push('```');
lines.push('');
writeFileSync(out, lines.join('\n'), 'utf8');
console.log('wrote ' + out + ' (' + lines.length + ' lines)');