import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectProfileName, defaultMiniHome, listEnvironments, resolveEnvironment, environmentForDir } from '../plugins/turnstile-popup/lib/environments.js';

const base = mkdtempSync(join(tmpdir(), 'turnstile-env-'));
const mainHome = join(base, 'main-home');
const miniHome = join(base, 'mini');
function profile(root, name) {
  const dir = join(root, 'profiles', name);
  mkdirSync(join(dir, 'node_modules'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: ['one'] } } }));
  writeFileSync(join(dir, 'cordis.patch.yml'), '- id: one\n  disabled: false\n');
  return dir;
}
const desktop = profile(mainHome, 'desktop');
profile(mainHome, 'web');
const mini = profile(join(miniHome, 'home'), 'mini');
profile(join(miniHome, 'home'), 'desktop');
mkdirSync(join(miniHome, 'runtime'), { recursive: true });
const options = { home: mainHome, miniHome, currentDir: desktop };

assert.equal(detectProfileName({ configured: 'auto', env: {}, argv: [], home: mainHome }), 'desktop');
assert.equal(detectProfileName({ configured: 'mini', env: {}, argv: [], home: mainHome }), 'mini');
assert.equal(detectProfileName({ configured: 'auto', env: { DSH_PROFILE: 'web' }, argv: [], home: mainHome }), 'web');
assert.equal(defaultMiniHome({ env: {}, cwd: miniHome, homeDir: base }), miniHome);

const all = listEnvironments(options);
assert.equal(all.length, 4);
assert.equal(resolveEnvironment('main:desktop', options).dir, desktop);
assert.equal(resolveEnvironment('mini:mini', options).dir, mini);
assert.notEqual(resolveEnvironment('mini:desktop', options).dir, desktop, '同名 profile 必须按环境区分');
assert.equal(resolveEnvironment('main:missing', options), null);
assert.equal(resolveEnvironment('../desktop', options), null);
assert.equal(resolveEnvironment('C:\\temp', options), null);
assert.equal(resolveEnvironment('', options).id, 'main:desktop');
assert.equal(environmentForDir(mini, options).id, 'mini:mini');
console.log('ENVIRONMENTS_TEST_OK 12 checks');
