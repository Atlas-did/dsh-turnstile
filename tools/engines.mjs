// engines.dsh coverage for a profile: which bundled plugins will be skipped?
// A plugin loads only if its engines.dsh accepts the running DSH version, or if
// the profile's compatibility.json grants an exact-version exemption.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || (process.env.DSH_HOME || '') + '/profiles/desktop';
const runtime = process.argv[3] || runtimeVersion;
const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
const bundles = (pkg.dsh?.profile?.bundles || []).filter((b) => !b.startsWith('@deepseek-ai/'));
const nm = join(dir, 'node_modules');
const compatPath = join(dir, 'compatibility.json');
const compat = existsSync(compatPath) ? JSON.parse(readFileSync(compatPath, 'utf8')) : {};

import { checkCompatibility, runtimeVersion, usingHostEvaluator } from './version.mjs';
import { emitJson, wantsJson, silenceWhenJson } from './json-out.mjs';
silenceWhenJson();
// Compatibility is decided by the host's own evaluator when it is reachable — we do not
// reimplement semver here. `checkCompatibility` returns null when the plugin loads.

const rows = [];
for (const b of bundles) {
  const pj = join(nm, b, 'package.json');
  if (!existsSync(pj)) { rows.push({ name: b, engine: '-', verdict: 'NOT INSTALLED' }); continue; }
  const j = JSON.parse(readFileSync(pj, 'utf8'));
  const engine = j.engines?.dsh || '';
  if (!engine) { rows.push({ name: b, version: j.version, engine: '(none)', verdict: 'loads' }); continue; }
  const issue = checkCompatibility({ name: j.name, version: j.version, engines: { dsh: engine } });
  const ok = issue === null;
  const exempt = (compat[b + '@' + j.version] || []).includes(runtime);
  rows.push({
    name: b, version: j.version, engine,
    verdict: ok ? 'loads' : exempt ? 'loads (exempted)' : 'SKIPPED',
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
if (wantsJson()) {
  emitJson('engines', engineFindings, skipped.length ? 5 : 0);
} else {
  console.log(JSON.stringify({
    profile: dir, runtime, bundles: bundles.length,
    skipped: skipped.map((r) => r.name + '@' + r.version + '  engines=' + r.engine),
    exempted: exempted.map((r) => r.name + '@' + r.version),
    ok: skipped.length === 0,
  }, null, 2));
}
process.exitCode = skipped.length ? 5 : 0;