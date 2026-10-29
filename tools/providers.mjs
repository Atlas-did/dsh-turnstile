// tools/providers.mjs — list every LLM route (provider -> models) from a composed profile
// and flag model ids offered by more than one route (the ambiguity that broke agent-default-model).
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ROOT as root, DSH_BIN, DSH_HOME, loadYaml } from './config.mjs';
const { yaml, schema } = loadYaml();
// composed config embeds !!js expressions; keep them as opaque scalars
const jsType = new yaml.Type('tag:yaml.org,2002:js', { kind: 'scalar', construct: (d) => String(d) });

const profile = process.argv[2] || 'mini';
const home = (() => {
  const e = process.env.DSH_HOME;
  if (e && existsSync(join(e, 'profiles', profile))) return e;
  return join(root, 'home');
})();
const text = execFileSync(process.execPath, [DSH_BIN, profile, '--dump-config'],
  { env: { ...process.env, DSH_HOME: home }, maxBuffer: 64 * 1024 * 1024 }).toString();
let rows;
try { rows = yaml.load(text, { schema }); } catch (e) { console.error('yaml parse failed: ' + e.message); process.exit(2); }
const routes = [];
for (const r of rows) {
  const c = r.config || {};
  if (Array.isArray(c.models) && c.models.length) routes.push({ route: r.id, baseURL: c.baseURL || '(default)', models: c.models.map(m => m.id || m).filter(Boolean) });
  if (c.providers && typeof c.providers === 'object') {
    for (const [pid, pv] of Object.entries(c.providers)) {
      const ms = (pv && pv.models) || [];
      routes.push({ route: r.id + ':' + pid, baseURL: (pv && pv.baseURL) || '(builtin)', models: ms.map(m => m.id || m).filter(Boolean) });
    }
  }
}
// account-login routes (deepseek-official) list models from the live API, not from config;
// include them so a model id that also exists on a config row is reported as a collision.
const liveIds = (process.env.DSH_LIVE_MODELS || 'deepseek-flash,deepseek-v4-pro').split(',').map(s => s.trim()).filter(Boolean);
if (rows.some(r => /account/.test(String(r.id)) || /account/.test(String(r.name || '')))) {
  routes.push({ route: 'deepseek-official (live)', baseURL: 'https://api.deepseek.com', models: liveIds });
}
console.log('profile=' + profile + '  routes with explicit models: ' + routes.length);
for (const r of routes) console.log('  ' + r.route.padEnd(30) + String(r.models.length).padStart(3) + '  ' + r.baseURL);
const own = new Map();
for (const r of routes) for (const id of r.models) { if (!own.has(id)) own.set(id, new Set()); own.get(id).add(r.route); }
const dup = [...own.entries()].filter(([, s]) => s.size > 1);
console.log('\n模型 id 出现在多条路由上的: ' + dup.length);
for (const [id, s] of dup) console.log('  ' + id.padEnd(30) + ' -> ' + [...s].join(', '));