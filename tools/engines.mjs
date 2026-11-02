// engines.dsh coverage for a profile: which bundled plugins will be skipped?
// A plugin loads only if its engines.dsh accepts the running DSH version, or if
// the profile's compatibility.json grants an exact-version exemption.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Accept a path OR a profile name (preflight and doctor take names too; rejecting one was my bug).
const arg = process.argv[2] || '';
const resolved = arg && !/[\\/]/.test(arg) && !existsSync(join(arg, 'package.json'))
  ? join(process.env.DSH_HOME || '', 'profiles', arg)
  : (arg || (process.env.DSH_HOME || '') + '/profiles/desktop');
const dir = requireProfile(resolved, 'node tools/engines.mjs <profileDir|profileName>');
const runtime = process.argv[3] || runtimeVersion;
const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
const bundles = (pkg.dsh?.profile?.bundles || []).filter((b) => !b.startsWith('@deepseek-ai/'));
const nm = join(dir, 'node_modules');
const compatPath = join(dir, 'compatibility.json');
const compat = existsSync(compatPath) ? JSON.parse(readFileSync(compatPath, 'utf8')) : {};

import { checkCompatibility, runtimeVersion, usingHostEvaluator } from './version.mjs';
import { emitJson, wantsJson, silenceWhenJson } from './json-out.mjs';
import { requireProfile } from './config.mjs';
silenceWhenJson();
// Compatibility is decided by the host's own evaluator when it is reachable — we do not
// reimplement semver here. `checkCompatibility` returns null when the plugin loads.

const rows = [];
for (const b of bundles) {
  const pj = join(nm, b, 'package.json');
  if (!existsSync(pj)) { rows.push({ name: b, engine: '-', verdict: 'NOT INSTALLED' }); continue; }
  const j = JSON.parse(readFileSync(pj, 'utf8'));
  const engine = j.engines?.dsh || '';
  // 没有 engines.dsh 不等于「已验证兼容」：宿主确实不拦，但我们没有声明可依据。
  // 结论写 basis，让读者区分「声明了且通过」与「没有声明所以没人拦」。（C-12）
  if (!engine) { rows.push({ name: b, version: j.version, engine: '(none)', verdict: 'loads (no engines.dsh)', basis: 'undeclared' }); continue; }
  const issue = checkCompatibility({ name: j.name, version: j.version, engines: { dsh: engine } });
  const ok = issue === null;
  const exempt = (compat[b + '@' + j.version] || []).includes(runtime);
  rows.push({
    name: b, version: j.version, engine,
    verdict: ok ? 'loads' : exempt ? 'loads (exempted)' : 'SKIPPED',
    basis: ok ? 'declared-compatible' : exempt ? 'exempted' : 'declared-incompatible',
  });
}

const skipped = rows.filter((r) => r.verdict === 'SKIPPED');
const exempted = rows.filter((r) => r.verdict === 'loads (exempted)');
const engineFindings = skipped.map((r) => ({
  severity: 'error',
  plugin: r.name + '@' + r.version,
  resource: r.engine,
  message: 'engines.dsh excludes the running runtime: the loader will SKIP this plugin silently',
  evidence: { file: 'node_modules/' + r.name + '/package.json' },
  fix: { kind: 'engines-widen', snippet: 'widen engines.dsh locally via pnpm patch if the author has not caught up' },
}));
// 覆盖范围（C-14）：只有 bundles 被评估；未安装的没法判断；没有运行时版本时**一个都没评估**。
const coverage = coverageOf({ rows, runtime });
// 纯函数，便于直接测两个分支（有/没有运行时版本）
export function coverageOf({ rows, runtime }) {
  const list = Array.isArray(rows) ? rows : [];
  return {
    plugins: list.length,
    evaluated: list.filter((r) => r.verdict !== 'NOT INSTALLED').length,
    notInstalled: list.filter((r) => r.verdict === 'NOT INSTALLED').length,
    runtimeKnown: Boolean(runtime),
    note: !runtime
      ? '运行时版本未知：没有任何插件被 engines.dsh 评估过（不是通不过）'
      : list.some((r) => r.verdict === 'loads (no engines.dsh)')
        ? '有插件没有声明 engines.dsh：能加载但未经声明验证'
        : '全部插件都按声明评估过',
  };
}

if (wantsJson()) {
  emitJson('engines', engineFindings, skipped.length ? 5 : 0, { coverage });
} else {
  // B10: an empty runtime means the version gate could NOT run. Say so instead of printing ok:true.
  if (!runtime) console.error('NOTE: runtime version unknown (set DSH_BIN or DSH_VERSION) - no plugin was evaluated against engines.dsh.');
  console.log(JSON.stringify({
    profile: dir, runtime,
    skipped: skipped.map((r) => r.name + '@' + r.version + '  engines=' + r.engine),
  // 三种依据分开报：没人拦（undeclared）/ 声明通过 / 凭 exemptions 放行
  bases: rows.reduce((acc, r) => { const k = r.basis || 'unknown'; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
    coverage,
    exempted: exempted.map((r) => r.name + '@' + r.version),
    ok: skipped.length === 0,
    evaluated: Boolean(runtime),
  }, null, 2));
}
process.exitCode = skipped.length ? 5 : 0;