// Node capabilities: every refusal must carry a usable reason.
import { pluginCapabilities, surfaceCapabilities, checkCapabilities, CAPABILITIES } from '../lib/capabilities.js';

let fail = 0;
const ok = (name, cond, detail) => { console.log((cond ? 'ok   ' : 'FAIL ') + name + (detail ? '   ' + detail : '')); if (!cond) fail++; };

const noseat = pluginCapabilities({ name: 'probe', rows: [], disabled: false });
ok('无配置行 -> toggle 被拒', noseat.capabilities.toggle.allowed === false);
ok('无配置行 -> 拒绝理由非空', noseat.capabilities.toggle.reason.length > 0, noseat.capabilities.toggle.reason);
ok('无配置行 -> 理由点明 profile 行', /profile 行|cordis\.patch\.yml/.test(noseat.capabilities.toggle.reason));
ok('无配置行 -> anchor 同样被拒', noseat.capabilities.anchor.allowed === false);
ok('无配置行 -> 仍可定位（只读）', noseat.capabilities.locate.allowed === true);
ok('无配置行 -> allowed 只含 locate', JSON.stringify(noseat.allowed) === '["locate"]', JSON.stringify(noseat.allowed));

const seated = pluginCapabilities({ name: 'dsh-context', rows: ['dsh-context'], disabled: true });
ok('有配置行 -> toggle 允许', seated.capabilities.toggle.allowed === true);
ok('有配置行 -> toggle 理由为空', seated.capabilities.toggle.reason === '');
ok('有配置行 -> anchor 允许', seated.capabilities.anchor.allowed === true);

const hard = pluginCapabilities({ name: 'x', rows: ['x'], hardcoded: true });
ok('硬编码位置 -> toggle 仍允许', hard.capabilities.toggle.allowed === true);
ok('硬编码位置 -> anchor 被拒', hard.capabilities.anchor.allowed === false);
ok('硬编码位置 -> 理由非空', hard.capabilities.anchor.reason.length > 0, hard.capabilities.anchor.reason);

const one = surfaceCapabilities({ surface: 'ui-settings', count: 1 });
const many = surfaceCapabilities({ surface: 'ui-settings', count: 3 });
ok('单占用面 -> fuse 被拒', one.capabilities.fuse.allowed === false);
ok('单占用面 -> 理由非空', one.capabilities.fuse.reason.length > 0);
ok('多占用面 -> fuse 允许', many.capabilities.fuse.allowed === true);

const chk = checkCapabilities({ name: 'risk', ok: true });
ok('检查行 -> export 允许', chk.capabilities.export.allowed === true);

const all = [noseat, seated, hard, one, many, chk];
let reasonsOk = true;
for (const set of all) for (const k of Object.keys(set.capabilities)) {
  const c = set.capabilities[k];
  if (!c.allowed && !(typeof c.reason === 'string' && c.reason.trim())) { reasonsOk = false; console.log('   缺理由:', k); }
}
ok('不变量：所有被拒能力都带非空理由', reasonsOk);

let threw = false;
try { pluginCapabilities(undefined); pluginCapabilities({}); surfaceCapabilities(null); checkCapabilities({}); } catch { threw = true; }
ok('空输入不抛异常', threw === false);
ok('能力 id 已声明', CAPABILITIES.includes('toggle') && CAPABILITIES.includes('anchor') && CAPABILITIES.includes('locate'));

console.log(fail === 0 ? 'CAPABILITIES_TEST_OK 20 checks' : 'CAPABILITIES_TEST_FAILED ' + fail);
process.exit(fail ? 1 : 0);
