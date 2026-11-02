// Discover only real DSH profiles. The browser selects an environment id; it never supplies a path.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const VALID_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;

export function validProfileName(name) {
  return VALID_NAME.test(String(name || '')) && name !== '.' && name !== '..';
}

export function detectProfileName({ configured, env = process.env, argv = process.argv, home, exists = existsSync } = {}) {
  const explicit = String(configured || '');
  if (explicit && explicit !== 'auto' && validProfileName(explicit)) return explicit;
  for (const key of ['DSH_PROFILE', 'DSH_PROFILE_NAME']) {
    if (validProfileName(env[key])) return env[key];
  }
  if (home) {
    for (const arg of (argv || []).slice(2)) {
      const name = String(arg || '');
      if (validProfileName(name) && exists(join(home, 'profiles', name, 'package.json'))) return name;
    }
    for (const name of ['desktop', 'mini']) {
      if (exists(join(home, 'profiles', name, 'package.json'))) return name;
    }
  }
  return explicit && explicit !== 'auto' ? explicit : 'desktop';
}

export function defaultMiniHome({ env = process.env, cwd = process.cwd(), homeDir } = {}) {
  if (env.MINI_HOME) return resolve(env.MINI_HOME);
  const candidates = [
    cwd && join(cwd, 'runtime') && cwd,
    homeDir && join(homeDir, 'Desktop', 'mini-harness'),
    homeDir && join(homeDir, 'mini-harness'),
  ].filter(Boolean);
  return candidates.find((dir) => existsSync(join(dir, 'runtime'))) || candidates[0] || '';
}

function profileRow(root, kind, name, currentDir) {
  if (!validProfileName(name)) return null;
  const dir = join(root, 'profiles', name);
  const manifest = join(dir, 'package.json');
  if (!existsSync(manifest)) return null;
  let bundles = 0;
  try { bundles = (JSON.parse(readFileSync(manifest, 'utf8')).dsh?.profile?.bundles || []).length; } catch { return null; }
  let rows = 0, disabled = 0;
  try {
    const patch = readFileSync(join(dir, 'cordis.patch.yml'), 'utf8');
    rows = (patch.match(/^\s*-\s*id:/gm) || []).length;
    disabled = (patch.match(/disabled:\s*true/g) || []).length;
  } catch {}
  return {
    id: kind + ':' + name,
    kind,
    name,
    label: (kind === 'mini' ? 'mini · ' : '主 DSH · ') + name,
    dir,
    bundles,
    rows,
    disabled,
    current: currentDir ? resolve(dir) === resolve(currentDir) : false,
  };
}

export function listEnvironments({ home, miniHome, currentDir } = {}) {
  const out = [];
  const seen = new Set();
  for (const [kind, root] of [['main', home], ['mini', miniHome && join(miniHome, 'home')]]) {
    if (!root || !existsSync(join(root, 'profiles'))) continue;
    let names = [];
    try { names = readdirSync(join(root, 'profiles')).sort(); } catch { continue; }
    for (const name of names) {
      const row = profileRow(root, kind, name, currentDir);
      if (row && !seen.has(row.id)) { seen.add(row.id); out.push(row); }
    }
  }
  return out;
}

export function resolveEnvironment(id, options = {}) {
  const environments = listEnvironments(options);
  if (!id) return environments.find((row) => row.current) || null;
  return environments.find((row) => row.id === String(id)) || null;
}

export function environmentForDir(dir, options = {}) {
  const wanted = resolve(dir);
  return listEnvironments(options).find((row) => resolve(row.dir) === wanted) || {
    id: 'main:' + basename(dir), kind: 'main', name: basename(dir), label: basename(dir), dir,
  };
}
