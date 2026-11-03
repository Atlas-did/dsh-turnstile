// 启停计划：noop 时不带 plan；dry-run 带前置指纹；changed 反映是否真的会改文件。
import { togglePlan, fingerprint } from './lib/manage-plan.mjs';
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const noop = togglePlan({ patchText: 'a', rowId: 'r1', disable: true, target: 'pkg', file: 'f', rowDisabled: true });
ok('已停用再停用 → noop 且无 plan', noop.noop === true && noop.plan === undefined, JSON.stringify(noop));
const plan = togglePlan({ patchText: '- id: r1\n', rowId: 'r1', disable: true, target: 'pkg', file: 'f', nextText: '- id: r1\n  disabled: true\n' });
ok('需要改动 → dryRun 带行动说明', plan.dryRun === true && plan.action === 'disable' && plan.plan.length === 1, plan.plan[0]);
ok('前置指纹是 patchText 的短哈希', plan.expect === fingerprint('- id: r1\n') && plan.expect.length === 16);
ok('changed 反映是否真的会改文件', plan.changed === true);
const same = togglePlan({ patchText: 'x', rowId: 'r1', disable: false, target: 'pkg', file: 'f', nextText: 'x' });
ok('内容没变 → changed=false', same.changed === false && same.action === 'enable');
ok('指纹对不同输入不同', fingerprint('a') !== fingerprint('b'));
console.log(fail ? 'MANAGE_PLAN_FAILED ' + fail : 'MANAGE_PLAN_OK');
process.exitCode = fail ? 1 : 0;
