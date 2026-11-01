// 真实 mini 验收器：结构/纪律断言（真跑要 --mini，见 npm run acceptance）
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'tools', 'acceptance-mini.mjs'), 'utf8');
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

ok('四段都做：装/验/卸/回滚确认', ['create', 'install+verify', 'uninstall', 'rollback-verified'].every((s) => src.includes("'" + s + "'")));
ok('卸载是真删 node_modules（不是只回滚配置）', /rmSync\(nm/.test(src));
ok('回滚后要求路由 404', /after\.route === 404/.test(src));
ok('回滚后要求 dump-config 里没有它', /after\.inDump === false/.test(src));
ok('证据落盘为机器可读 JSON', /kind: 'mini-acceptance@1'/.test(src) && /writeFileSync\(outFile/.test(src));
ok('证据里写明不等同桌面端', /不等同桌面端/.test(src));
ok('没有 --mini 直接报错退出', /需要 --mini/.test(src));
ok('任一段失败则退出码非 0', /process\.exitCode = ok \? 0 : 1/.test(src));

console.log(fail ? 'ACCEPTANCE_TEST_FAILED ' + fail : 'ACCEPTANCE_TEST_OK');
process.exitCode = fail ? 1 : 0;