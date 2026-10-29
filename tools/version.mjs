// One place for version compatibility, so the gate never invents its own semver rules.
// Preference: the host's own evaluator (authoritative, includes its prerelease + exemption rules),
// falling back to semver with includePrerelease:true when the host package is unreachable.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, DSH_BIN } from './config.mjs';

function hostModulePath() {
  const c = [];
  if (DSH_BIN) c.push(join(dirname(DSH_BIN), '..', '..', 'dsh-app-boot', 'lib', 'index.js'));
  c.push(join(ROOT, 'node_modules/@deepseek-ai/dsh-app-boot/lib/index.js'));
  c.push(join(ROOT, 'runtime/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js'));
  return c.find((p) => existsSync(p)) || null;
}

const hostPath = hostModulePath();
let host = null;
if (hostPath) { try { host = await import('file://' + hostPath.split(String.fromCharCode(92)).join('/')); } catch { host = null; } }

export const runtimeVersion = (() => {
  try { if (host && host.getDshRuntimeVersion) return host.getDshRuntimeVersion(); } catch { /* fall through */ }
  if (process.env.DSH_VERSION) return process.env.DSH_VERSION;
  try { return createRequire(join(ROOT, 'package.json'))('@deepseek-ai/dsh/package.json').version; } catch { return ''; }
})();

export function checkCompatibility(manifest) {
  if (!runtimeVersion) {
    // No runtime to judge against: an unknown answer must never be reported as a skip.
    if (!globalThis.__turnstileVerWarned) {
      globalThis.__turnstileVerWarned = true;
      console.error('WARNING: runtime version unknown (set DSH_BIN or DSH_VERSION); version checks report nothing.');
    }
    return null;
  }
  if (host && host.evaluatePluginCompatibility) {
    try {
      const issue = host.evaluatePluginCompatibility(manifest);
      return issue ? Object.assign({}, issue, { source: 'host' }) : null;
    } catch { /* fall back */ }
  }
  const range = manifest && manifest.engines ? manifest.engines.dsh : '';
  if (!range) return null;
  try {
    const semver = createRequire(join(ROOT, 'package.json'))('semver');
    const ok = semver.satisfies(runtimeVersion, range, { includePrerelease: true });
    return ok ? null : { name: manifest.name, version: manifest.version, runtimeVersion, requirements: { 'engines.dsh': range }, exempted: false, source: 'semver' };
  } catch {
    // Neither the host evaluator nor semver is available. Do NOT claim incompatibility:
    // an unknown answer must never be reported as a skip.
    if (!globalThis.__turnstileWarned) {
      globalThis.__turnstileWarned = true;
      console.error('WARNING: no host evaluator and no semver — version checks are unavailable (results will not claim skips).');
    }
    return null;
  }
}

export const usingHostEvaluator = Boolean(host && host.evaluatePluginCompatibility);