// Conflict scan for a DSH profile.
// Scope discipline: an assignment to `ctx.<name>` only counts when <name> is a
// service this profile actually knows (from ctx.provide() or the core list).
// That filters out canvas/DOM look-alikes such as ctx.fillStyle.
// usage: node tools/conflict.mjs <profileDir>
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './config.mjs';
import { ctxUsage } from './scan.mjs';
import { runtimeVersion } from './version.mjs';
import { emitJson, wantsJson, silenceWhenJson } from './json-out.mjs';
import { requireProfile } from './config.mjs';
silenceWhenJson();

const arg = process.argv[2] || '';
const resolved = arg && !/[\\/]/.test(arg) && !existsSync(join(arg, 'package.json'))
  ? join(process.env.DSH_HOME || '', 'profiles', arg)
  : (process.argv[2] || (process.env.DSH_HOME || '') + '/profiles/desktop');
const dir = requireProfile(resolved, 'node tools/conflict.mjs <profileDir|profileName>');
const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
const deps = Object.keys(pkg.dependencies || {});
const nm = join(dir, 'node_modules');

// The ctx service set comes from the installed runtime when a knowledge file exists
// (tools/knowledge-gen.mjs). The literal list below is only a fallback, and a version
// mismatch is reported instead of silently trusting stale names.
const LEGACY_CORE_SERVICES = ['fs', 'tools', 'session', 'agent', 'llm', 'webServer', 'webRuntime',
  'subprocess', 'settings', 'commands', 'workspace', 'inspector', 'connection', 'agentPresets',
  'sessionProjections', 'skills', 'jobs', 'http', 'storageDomain', 'homePaths'];

// 允许用环境变量指向另一份知识文件（测试与多运行时对比用）
const knowledgePath = process.env.DSH_TURNSTILE_KNOWLEDGE || join(ROOT, 'knowledge', 'ctx-services.json');
let CORE_SERVICES = LEGACY_CORE_SERVICES;
let STALE_HINTS = new Set();
let knowledgeState = 'absent';
let knowledgeSource = 'built-in fallback list (stale by construction)';
if (existsSync(knowledgePath)) {
  try {
    const k = JSON.parse(readFileSync(knowledgePath, 'utf8'));
    if (k.dshVersion === runtimeVersion) {
      const generated = k.services.map((s) => s.name);
      // The extractor only sees literal ctx.provide("name") plus the cordis Context members;
      // Service subclasses register under names it cannot read. Union with the curated list so
      // version-awareness never *removes* coverage, and say so when the extractor looks thin.
      knowledgeState = 'current';
      CORE_SERVICES = [...new Set([...generated, ...LEGACY_CORE_SERVICES])];
      knowledgeSource = 'knowledge (dsh ' + k.dshVersion + ': ' + generated.length + ' generated + ' +
        (CORE_SERVICES.length - generated.length) + ' curated = ' + CORE_SERVICES.length + ')';
      if (generated.length < LEGACY_CORE_SERVICES.length / 2) {
        console.log('NOTE: the runtime extractor only found ' + generated.length + ' services by literal ctx.provide();');
        console.log('      Service-subclass registrations are invisible to it, so the curated list still contributes.');
      }
    } else {
      const shown = runtimeVersion || 'unknown (set DSH_BIN or DSH_VERSION)';
      console.log('WARNING: knowledge is for dsh ' + k.dshVersion + ' but the runtime is ' + shown);
      console.log('         regenerate: node tools/knowledge-gen.mjs');
      knowledgeState = 'stale';
      // stale 只当线索：能提示「旧版本曾有此服务」，不能断言当前宿主仍有
      STALE_HINTS = new Set(k.services.map((s) => s.name).filter((n) => !CORE_SERVICES.includes(n)));
      knowledgeSource = 'knowledge (STALE: built for ' + k.dshVersion + '; hints only)';
    }
  } catch (e) {
    console.log('WARNING: cannot read ' + knowledgePath + ': ' + String(e.message).slice(0, 80));
  }
}

function jsFiles(d) {
  const out = [];
  const walk = (p, depth) => {
    if (depth > 2 || out.length > 40) return;
    let st; try { st = statSync(p); } catch { return; }
    if (st.isDirectory()) { for (const e of readdirSync(p)) walk(join(p, e), depth + 1); }
    else if (p.endsWith('.js') && st.size > 40) out.push(p);
  };
  walk(d, 0);
  return out;
}

const texts = [];
for (const name of deps) {
  const d = join(nm, name);
  if (!existsSync(join(d, 'package.json'))) continue;
  for (const f of [...jsFiles(join(d, 'lib')), ...jsFiles(d)].slice(0, 12)) {
    try { texts.push({ plugin: name, file: f.slice(d.length + 1).replace(/\\/g, '/'), text: readFileSync(f, 'utf8') }); } catch {}
  }
}

// ctx usage comes from an AST walk (tools/scan.mjs); comments and string literals cannot
// fake an assignment, and `evidence` records which path produced the finding.
const provided = new Map();
let ctxEvidence = 'text';
for (const t of texts) {
  const u = ctxUsage(t.text);
  ctxEvidence = u.evidence;
  for (const name of u.provided) {
    const list = provided.get(name) || [];
    if (!list.includes(t.plugin)) list.push(t.plugin);
    provided.set(name, list);
  }
}
const known = new Set([...CORE_SERVICES, ...provided.keys()]);

const rows = [];
for (const t of texts) {
  const usage = ctxUsage(t.text);
  for (const name of usage.assigned) {
    if (!known.has(name)) {
      // 只在过期知识里出现的服务：给线索，不当已确认冲突
      if (STALE_HINTS.has(name)) rows.push({ kind: 'ctx-assign-stale', plugin: t.plugin, detail: 'ctx.' + name + ' =', contagious: 'unknown', hint: '旧版本知识里存在此服务，请重新探测后再判断' });
      continue;
    }
    const m = [null, name];
    rows.push({ kind: 'ctx-assign', plugin: t.plugin, detail: 'ctx.' + m[1] + ' =', contagious: 'yes' });
  }
  for (const m of t.text.matchAll(/\.listen\(\s*(?:[^,]+,\s*)?(\d{4,5})/g)) {
    rows.push({ kind: 'fixed-port', plugin: t.plugin, detail: 'listen(' + m[1] + ')', contagious: 'no' });
  }
  for (const m of t.text.matchAll(/writeFileSync\(\s*['"]([^'"]+\.(?:json|db|lock))['"]/g)) {
    rows.push({ kind: 'state-file', plugin: t.plugin, detail: m[1], contagious: 'yes' });
  }
}
for (const [svc, list] of provided) {
  if (list.length > 1) rows.push({ kind: 'service-dup', plugin: list.join(','), detail: 'ctx.provide("' + svc + '")', contagious: 'yes' });
}

// installed-version divergence: compare what is actually on disk, not the ranges.
const installed = new Map();  // pkg -> Set(version)
for (const name of deps) {
  for (const base of [join(nm, name, 'node_modules'), nm]) {
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base)) {
      if (!entry.startsWith('@')) continue;
      const scopeDir = join(base, entry);
      let subs = [];
      try { subs = readdirSync(scopeDir); } catch { continue; }
      for (const sub of subs) {
        const pj = join(scopeDir, sub, 'package.json');
        if (!existsSync(pj)) continue;
        try {
          const j = JSON.parse(readFileSync(pj, 'utf8'));
          if (!j.name || !j.version) continue;
          const set = installed.get(j.name) || new Set();
          set.add(j.version);
          installed.set(j.name, set);
        } catch {}
      }
    }
  }
}
for (const [dep, set] of installed) {
  if (set.size > 1 && dep.startsWith('@deepseek-ai/')) {
    rows.push({ kind: 'dep-divergence', plugin: '-', detail: dep + ' :: ' + [...set].join(' | '), contagious: 'yes' });
  }
}
const seen = new Set();
const uniq = rows.filter(r => { const k = r.kind + '|' + r.plugin + '|' + r.detail; if (seen.has(k)) return false; seen.add(k); return true; });
const order = { 'ctx-assign': 0, 'ctx-assign-stale': 1, 'service-dup': 2, 'dep-divergence': 2, 'fixed-port': 3, 'state-file': 4 };
uniq.sort((a, b) => (order[a.kind] - order[b.kind]) || String(a.plugin).localeCompare(String(b.plugin)));
console.log('profile: ' + dir + '  (known services: ' + known.size + ' via ' + knowledgeSource + '; ctx evidence: ' + ctxEvidence + ')');
if (wantsJson()) {
  // 让消费者知道这份结论建立在哪种知识上（current 可断言、stale 只提示、absent 是内置兜底）
  const knowledge = { state: knowledgeState, source: knowledgeSource, hints: STALE_HINTS.size };
  const findings = uniq.map((r) => ({
    severity: (r.kind === 'dep-divergence' || r.kind === 'ctx-assign-stale') ? 'warning' : 'error',
    plugin: r.plugin,
    resource: r.detail,
    message: r.kind,
    evidence: { file: 'profile' },
  }));
  // 只有真实冲突才非零；stale 线索不阻断（它没有当前证据）
  const code = uniq.some((r) => r.kind !== 'dep-divergence' && r.kind !== 'ctx-assign-stale') ? 6 : 0;
  emitJson('conflict', findings, code, { knowledge });
  process.exit(code);
}
if (!uniq.length) { console.log('no conflict patterns found'); process.exit(0); }
console.log('KIND'.padEnd(16) + 'PLUGIN'.padEnd(30) + 'DETAIL'.padEnd(46) + 'SPREAD');
for (const r of uniq) console.log(String(r.kind).padEnd(16) + String(r.plugin).slice(0, 29).padEnd(30) + String(r.detail).slice(0, 45).padEnd(46) + r.contagious);
const byKind = uniq.reduce((a, r) => (a[r.kind] = (a[r.kind] || 0) + 1, a), {});
console.log('');
console.log('summary: ' + JSON.stringify(byKind));