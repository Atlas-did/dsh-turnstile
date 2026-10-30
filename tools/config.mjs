// Path resolution for every tool. Everything configurable lives here.
// DSH_TURNSTILE_ROOT  → repository root (defaults to the folder containing tools/)
// DSH_HOME            → a DSH home directory that holds profiles/<name>/
// DSH_BIN             → path to @deepseek-ai/dsh/lib/bin.js (needed for --dump-config)
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
export const ROOT = process.env.DSH_TURNSTILE_ROOT || dirname(dirname(fileURLToPath(import.meta.url)));
export const DSH_HOME = process.env.DSH_HOME || join(ROOT, 'home');
export function resolveDshBin() {
  if (process.env.DSH_BIN) return process.env.DSH_BIN;
  const candidates = [
    join(ROOT, 'node_modules/@deepseek-ai/dsh/lib/bin.js'),
    join(ROOT, 'runtime/node_modules/@deepseek-ai/dsh/lib/bin.js'),
    join(process.env.APPDATA || '', 'npm/node_modules/@deepseek-ai/dsh/lib/bin.js'),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}
export const DSH_BIN = resolveDshBin();
export function profileDir(name, home = DSH_HOME) { return join(home, 'profiles', name); }

/**
 * Where tools write their own state (reports, history, maps).
 * A globally installed package lives in a read-only tree, so state belongs next to the user's
 * DSH home first; the package directory is only a fallback for a bare git clone.
 */
export function stateDir() {
  if (process.env.DSH_TURNSTILE_STATE) return process.env.DSH_TURNSTILE_STATE;
  const home = process.env.DSH_HOME;
  if (home) return join(home, 'turnstile-state');
  return join(ROOT, 'state');
}

/**
 * Resolve a dependency from the repo first, then from a nearby DSH install.
 * Lets the tools run straight after `git clone` without any install step.
 */
export function requireDep(name) {
  const bases = [join(ROOT, 'package.json')];
  if (DSH_BIN) bases.push(join(dirname(DSH_BIN), '..', '..', name, 'package.json'));
  bases.push(join(ROOT, 'runtime/node_modules', name, 'package.json'));
  let lastErr = null;
  for (const b of bases) {
    try { return createRequire(b)(name); } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('cannot resolve ' + name);
}

/** js-yaml with a schema that tolerates the harness's !!js expressions. */
export function loadYaml() {
  const yaml = requireDep('js-yaml');
  const jsType = new yaml.Type('tag:yaml.org,2002:js', { kind: 'scalar', construct: (d) => String(d) });
  const schema = yaml.DEFAULT_SCHEMA.extend([jsType]);
  return { yaml, schema };
}