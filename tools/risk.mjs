// Dependency-risk scan: will this plugin install and load for someone else?
// Idea: a plugin that imports a non-official scope (@someone/x) only works on
// the author's machine unless that package is a real dependency (not a peer).
// usage: node tools/risk.mjs <profileDir>
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { importsOf } from './scan.mjs';
import { emitJson, wantsJson, silenceWhenJson } from './json-out.mjs';
import { requireProfile } from './config.mjs';
silenceWhenJson();

const arg = process.argv[2] || '';
const resolved = arg && !/[\\/]/.test(arg) && !existsSync(join(arg, 'package.json'))
  ? join(process.env.DSH_HOME || '', 'profiles', arg)
  : (process.argv[2] || (process.env.DSH_HOME || '') + '/profiles/desktop');
const dir = requireProfile(resolved, 'node tools/risk.mjs <profileDir|profileName>');
const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
const deps = Object.keys(pkg.dependencies || {});
const nm = join(dir, 'node_modules');

const OFFICIAL = '@deepseek-ai/';
// Import discovery goes through tools/scan.mjs: a real tokenizer when es-module-lexer
// is installed, regex only as a fallback. The returned evidence tells the reader which
// one produced the finding ('ast' is stronger than 'text').
let lastEvidence = 'text';
function scopes(text) {
  const out = new Set();
  const { specifiers, evidence } = importsOf(text);
  lastEvidence = evidence;
  for (const spec of specifiers) {
    if (!spec.startsWith('@')) continue;
    const scope = spec.split('/').slice(0, 2).join('/');
    if (!scope.startsWith(OFFICIAL) && !scope.startsWith('@cordisjs/')) out.add(scope);
  }
  return out;
}
// 覆盖范围（C-14）：扫描有深度/文件数截断，必须如实报告，不能让「没报到」被当成「全量没有」。
let truncatedScan = false;
function jsText(d) {
  const out = [];
  const walk = (p, depth) => {
    if (depth > 2 || out.length > 8) { truncatedScan = true; return; }
    let st; try { st = statSync(p); } catch { return; }
    if (st.isDirectory()) { for (const e of readdirSync(p)) walk(join(p, e), depth + 1); }
    else if (p.endsWith('.js') && st.size > 40) out.push(readFileSync(p, 'utf8'));
  };
  walk(d, 0);
  return out.join('\n');
}

const rows = [];
for (const name of deps) {
  const d = join(nm, name);
  const pj = join(d, 'package.json');
  if (!existsSync(pj)) { rows.push({ name, level: '?', why: 'not installed' }); continue; }
  const j = JSON.parse(readFileSync(pj, 'utf8'));
  const declared = new Set(Object.keys(j.dependencies || {}).filter(x => x.startsWith('@')));
  const peers = new Set(Object.keys(j.peerDependencies || {}).filter(x => x.startsWith('@')));
  const imported = scopes((existsSync(join(d, 'lib')) ? jsText(join(d, 'lib')) : '') + jsText(d));
  // 每个插件的正文都过了同一个 jsText，truncatedScan 在超限时置位
  const missing = [...imported].filter(s => !declared.has(s));
  const peerOnly = [...imported].filter(s => peers.has(s) && !declared.has(s));
  let level = 'GREEN', why = 'only official/public packages';
  if (peerOnly.length) { level = 'RED'; why = 'imports peer-only scope: ' + peerOnly.join(', '); }
  else if (missing.length) { level = 'AMBER'; why = 'imports undeclared scope: ' + missing.join(', '); }
  rows.push({ name, version: j.version, level, why });
}

// For RED/AMBER, suggest the official package with the same basename when the
// runtime ships one — that is the pnpm-alias fix from docs/19.
const runtimeNm = process.env.DSH_RUNTIME_NODE_MODULES || join(process.cwd(), 'node_modules');
const officialRoots = [join(runtimeNm, '@deepseek-ai')];
function officialFor(scope) {
  const base = scope.split('/')[1];
  if (!base) return null;
  for (const root of officialRoots) {
    const pj = join(root, base, 'package.json');
    if (existsSync(pj)) {
      try { return '@deepseek-ai/' + base + '@' + JSON.parse(readFileSync(pj, 'utf8')).version; } catch {}
    }
  }
  return null;
}
for (const r of rows) {
  if (r.level !== 'RED' && r.level !== 'AMBER') continue;
  const m = String(r.why).match(/@[\w.-]+\/[\w.-]+/g);
  if (!m) continue;
  const hints = m.map(s => { const o = officialFor(s); return o ? (s + ' -> ' + o) : null; }).filter(Boolean);
  if (hints.length) r.alias = hints.join(' ; ');
}
const order = { RED: 0, AMBER: 1, GREEN: 2, '?': 3 };
rows.sort((a, b) => (order[a.level] - order[b.level]) || a.name.localeCompare(b.name));
console.log('profile: ' + dir);
console.log('NAME'.padEnd(32) + 'VER'.padEnd(10) + 'LEVEL'.padEnd(8) + 'WHY');
for (const r of rows) {
  console.log(String(r.name).padEnd(32) + String(r.version || '-').padEnd(10) + r.level.padEnd(8) + r.why);
  if (r.alias) console.log(' '.repeat(50) + 'alias hint: ' + r.alias);
}
const counts = rows.reduce((acc, r) => { acc[r.level] = (acc[r.level] || 0) + 1; return acc; }, {});
console.log('');
console.log('import evidence: ' + lastEvidence);
console.log('summary: ' + JSON.stringify(counts));
if (wantsJson()) {
  const findings = rows.filter((r) => r.level !== 'GREEN').map((r) => ({
    // 方案 03：每条 finding 带稳定规则、对象、位置、证据强度与推翻条件
    ruleId: r.level === 'RED' ? 'risk.peer-only-scope' : 'risk.undeclared-scope',
    subject: { kind: 'plugin', id: r.name },
    // 位置指向该插件的 manifest（能找到 import 声明的地方）；行号未知就写 null，不编造
    locator: { file: 'node_modules/' + r.name + '/package.json', line: null },
    strength: 'static-ast',
    falsifier: '在真实宿主里 import 成功且不触发解析错误，可推翻这条静态结论',
    severity: r.level === 'RED' ? 'error' : 'warning',
    plugin: r.name + '@' + (r.version || '?'),
    resource: r.why,
    // title 给人看，不能是 RED/AMBER 这种内部色阶
    message: r.level === 'RED' ? '装不活：import 了 peer-only 的官方 scope' : '可能装不活：import 了未声明的 scope',
    level: r.level,
    evidence: { file: 'node_modules/' + r.name + '/package.json', importEvidence: lastEvidence },
    ...(r.alias ? { fix: { kind: 'npm-alias', snippet: r.alias } } : {}),
  }));
  const baseFlag = (() => { const i = process.argv.indexOf('--baseline'); return i >= 0 ? process.argv[i + 1] : null; })();
  const saveFlag = (() => { const i = process.argv.indexOf('--save-baseline'); return i >= 0 ? process.argv[i + 1] : null; })();
  // 控制台读这份「上次扫描」：带时间戳与 delta，缺文件时控制台就诚实说没有记录
  const saveReport = (() => { const i = process.argv.indexOf('--save'); return i >= 0 ? process.argv[i + 1] : null; })();
  const keyOf = (f) => (f.ruleId || 'risk.unknown') + '|' + ((f.subject && f.subject.id) || f.plugin || '');
  let baseline = null;
  if (baseFlag) { try { baseline = JSON.parse(readFileSync(baseFlag, 'utf8')); } catch { console.log('WARNING: 读不出基线 ' + baseFlag + '，按首次运行处理'); } }
  let delta = null;
  if (baseline && Array.isArray(baseline.findings)) {
    const before = new Set(baseline.findings.map(keyOf));
    const after = new Set(findings.map(keyOf));
    delta = { added: [...after].filter((k) => !before.has(k)), resolved: [...before].filter((k) => !after.has(k)), still: [...after].filter((k) => before.has(k)) };
  }
  if (saveFlag) { try { writeFileSync(saveFlag, JSON.stringify({ at: new Date().toISOString(), findings: findings.map((f) => ({ ruleId: f.ruleId, subject: f.subject, plugin: f.plugin })) }, null, 2) + '\n'); console.log('基线已写 ' + saveFlag); } catch (e) { console.log('WARNING: 基线写不出：' + e.message); } }
  if (saveReport) { try { writeFileSync(saveReport, JSON.stringify({ at: new Date().toISOString(), profile: dir, counts, findings, delta }, null, 2) + '\n'); console.log('扫描结果已写 ' + saveReport); } catch (e) { console.log('WARNING: 结果写不出：' + e.message); } }
  const coverage = {
    plugins: deps.length,
    notInstalled: rows.filter((r) => r.level === '?').length,
    truncated: truncatedScan,
    note: truncatedScan ? '有插件目录超出深度/文件数上限，扫描不完整' : '全部插件的 lib 与顶层 js 都已读取',
  };
  emitJson('risk', findings, counts.RED ? 6 : 0, Object.assign({ coverage }, delta ? { delta } : {}));
  process.exit(counts.RED ? 6 : 0);
}
process.exitCode = counts.RED ? 6 : 0;