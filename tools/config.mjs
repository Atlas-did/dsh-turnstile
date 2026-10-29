// Path resolution for every tool. Everything configurable lives here.
// DSH_TURNSTILE_ROOT  → repository root (defaults to the folder containing tools/)
// DSH_HOME            → a DSH home directory that holds profiles/<name>/
// DSH_BIN             → path to @deepseek-ai/dsh/lib/bin.js (needed for --dump-config)
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
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
