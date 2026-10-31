// 对比两份 slot 快照：装插件前后「哪个位置多了谁」。
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { pluginOf, belongsTo, diffSlotMaps, groupByPlugin, CORE } from '../../../tools/lib/slot-attr.mjs';

const here = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

ok('冒号前缀', pluginOf('dsh-better-sidebar:editor') === 'dsh-better-sidebar');
ok('路径前缀', pluginOf('@s/p/guide') === '@s/p');
ok('点号前缀', pluginOf('turnstile.plugin-list') === 'turnstile');
ok('核心条目归不上', pluginOf('bash') === null && pluginOf('user') === null);
ok('过短的点号不认', pluginOf('a.b') === null);
ok('belongsTo 认冒号', belongsTo('dsh-x:y', 'dsh-x'));
ok('belongsTo 不误认', !belongsTo('dsh-other:y', 'dsh-x'));

const g = groupByPlugin([{ slot: 's1', entries: ['p:a', 'bash'] }, { slot: 's2', entries: ['p:b'] }]);
ok('分组把核心单独放', g.has(CORE));
ok('分组按插件聚合 slot', g.get('p').get('s1').length === 1 && g.get('p').get('s2').length === 1);

const diff = diffSlotMaps(
  { slots: [{ slot: 's1', entries: ['p:a', 'core1'] }, { slot: 's2', entries: ['p:b'] }] },
  { slots: [{ slot: 's1', entries: ['p:a', 'clone-plugin:new'] }, { slot: 's3', entries: ['p:c'] }] },
);
const bySlot = Object.fromEntries(diff.map((d) => [d.slot, d]));
ok('报出新增条目', bySlot.s1.added.includes('clone-plugin:new'));
ok('报出移除条目', bySlot.s1.removed.includes('core1'));
ok('报出新增 slot', Boolean(bySlot.s3) && bySlot.s3.added.includes('p:c'));
ok('整块消失的 slot 记为移除', Boolean(bySlot.s2) && bySlot.s2.removed.includes('p:b') && bySlot.s2.after === 0);
ok('没有任何变化的 slot 才不出现', !diffSlotMaps({ slots: [{ slot: 'x', entries: ['a'] }] }, { slots: [{ slot: 'x', entries: ['a'] }] }).length);

// CLI：--against 端到端
const dir = mkdtempSync(join(tmpdir(), 'against-'));
const before = join(dir, 'before.json');
const after = join(dir, 'after.json');
writeFileSync(before, JSON.stringify({ at: 'T1', slots: [{ slot: 'shell.overlay', entries: ['a'] }] }));
writeFileSync(after, JSON.stringify({ at: 'T2', slots: [{ slot: 'shell.overlay', entries: ['a', 'dsh-new:toast'] }] }));
const out = execFileSync(process.execPath, [join(here, '..', '..', '..', 'tools', 'slot-map-report.mjs'), '--map', after, '--against', before], { encoding: 'utf8' });
ok('CLI 打印变化与条目', /shell\.overlay/.test(out) && /\+ dsh-new:toast/.test(out), out.trim().split('\n')[1]);

console.log(fail ? 'SLOTATTR_TEST_FAILED ' + fail : 'SLOT_ATTR_TEST_OK');
process.exitCode = fail ? 1 : 0;
