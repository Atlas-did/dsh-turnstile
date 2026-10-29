// engines.dsh coverage for a profile: which bundled plugins will be skipped?
// A plugin loads only if its engines.dsh accepts the running DSH version, or if
// the profile's compatibility.json grants an exact-version exemption.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || (process.env.DSH_HOME || '') + '/profiles/desktop';
const runtime = process.argv[3] || '0.2.1-rc.3';
const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
const bundles = (pkg.dsh?.profile?.bundles || []).filter((b) => !b.startsWith('@deepseek-ai/'));
const nm = join(dir, 'node_modules');
const compatPath = join(dir, 'compatibility.json');
const compat = existsSync(compatPath) ? JSON.parse(readFileSync(compatPath, 'utf8')) : {};

// semver-lite: handles ^, tilde-free ranges, || groups, comparators.
const parse = (v) => {
  const m = String(v).match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] || '' };
};
const cmp = (a, b) => {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (!a.pre && b.pre) return 1;
  if (a.pre && !b.pre) return -1;
  return a.pre < b.pre ? -1 : a.pre > b.pre ? 1 : 0;
};
const satisfiesComparator = (v, comp) => {
  const m = comp.match(/^(>=|<=|>|<|=)?\s*(.+)$/);
  const op = m[1] || '=';
  const target = parse(m[2]);
  if (!target) return false;
  const c = cmp(v, target);
  return op === '>=' ? c >= 0 : op === '<=' ? c <= 0 : op === '>' ? c > 0 : op === '<' ? c < 0 : c === 0;
};
const satisfies = (version, range) => {
  const v = parse(version);
  if (!v) return false;
  return String(range).split('||').some((group) => {
    const parts = group.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return false;
    return parts.every((p) => {
      if (p.startsWith('^')) {
        const t = parse(p.slice(1));
        if (!t) return false;
        if (cmp(v, t) < 0) return false;
        if (t.major > 0) return v.major === t.major;
        if (t.minor > 0) return v.major === 0 && v.minor === t.minor;
        return v.major === 0 && v.minor === 0 && v.patch === t.patch;
      }
      return satisfiesComparator(v, p);
    });
  });
};

const rows = [];
for (const b of bundles) {
  const pj = join(nm, b, 'package.json');
  if (!existsSync(pj)) { rows.push({ name: b, engine: '-', verdict: 'NOT INSTALLED' }); continue; }
  const j = JSON.parse(readFileSync(pj, 'utf8'));
  const engine = j.engines?.dsh || '';
  if (!engine) { rows.push({ name: b, version: j.version, engine: '(none)', verdict: 'loads' }); continue; }
  const ok = satisfies(runtime, engine);
  const exempt = (compat[b + '@' + j.version] || []).includes(runtime);
  rows.push({
    name: b, version: j.version, engine,
    verdict: ok ? 'loads' : exempt ? 'loads (exempted)' : 'SKIPPED',
  });
}

const skipped = rows.filter((r) => r.verdict === 'SKIPPED');
const exempted = rows.filter((r) => r.verdict === 'loads (exempted)');
console.log(JSON.stringify({
  profile: dir, runtime, bundles: bundles.length,
  skipped: skipped.map((r) => r.name + '@' + r.version + '  engines=' + r.engine),
  exempted: exempted.map((r) => r.name + '@' + r.version),
  ok: skipped.length === 0,
}, null, 2));
process.exitCode = skipped.length ? 5 : 0;
