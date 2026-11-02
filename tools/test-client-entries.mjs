import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const lib = join(dirname(dirname(fileURLToPath(import.meta.url))), 'plugins', 'turnstile-popup', 'lib');
const client = readFileSync(join(lib, 'client.js'), 'utf8');
const pkg = JSON.parse(readFileSync(join(lib, '..', 'package.json'), 'utf8'));
const patch = readFileSync(join(lib, '..', 'cordis.patch.yml'), 'utf8');
for (const slot of ['shell.overlay', 'settings.section', 'main', 'sidebar.panellist']) {
  assert.match(client, new RegExp('ctx\\.slots\\.inject\\("' + slot.replace('.', '\\.') + '"'), slot + ' 入口缺失');
}
assert.match(client, /ctx\.commandUi\.register\(/);
assert.match(client, /ctx\.layout\.selectPanel\("turnstile"\)/);
for (const dep of ['slots', 'layout', 'commands']) {
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-' + dep), dep + ' 注入声明缺失');
}
assert.match(patch, /profile: auto/);
console.log('CLIENT_ENTRIES_TEST_OK 9 checks');
