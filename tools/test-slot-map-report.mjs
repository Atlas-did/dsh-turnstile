// slot 分布报表：归属规则 + 过滤 + 空表
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

const dir = mkdtempSync(join(tmpdir(), 'slot-')) ;
const map = join(dir, 'slot-map-x.json');
writeFileSync(map, JSON.stringify({ at: 'T', slots: [
  { slot: 'sidebar.right.pane.tab', count: 2, entries: ['dsh-better-sidebar:editor', 'dsh-better-sidebar:git'] },
  { slot: 'shell.overlay', count: 2, entries: ['dsh-better-sidebar:ctx', 'turnstile.plugin-list'] },
  { slot: 'tool.call.toolview', count: 4, entries: ['bash', 'read', 'write', 'grep'] },
] }));

const run = (...a) => execFileSync(process.execPath, [join(here, 'slot-map-report.mjs'), '--map', map, ...a], { encoding: 'utf8' });

const all = JSON.parse(run('--json'));
const byName = Object.fromEntries(all.plugins.map((p) => [p.plugin, p]));
ok('按冒号前缀归到插件', byName['dsh-better-sidebar'] && byName['dsh-better-sidebar'].total === 3);
ok('点号前缀也能归', byName['turnstile'] && byName['turnstile'].total === 1, JSON.stringify(Object.keys(byName)));
ok('核心条目不归任何插件', byName['(核心/未归属)'] && byName['(核心/未归属)'].total === 4);
ok('插件下按 slot 分组', byName['dsh-better-sidebar'].slots.length === 2);
ok('slot 内条目数正确', byName['dsh-better-sidebar'].slots.find((s) => s.slot === 'sidebar.right.pane.tab').count === 2);

const one = JSON.parse(run('--plugin', 'dsh-better-sidebar', '--json'));
ok('--plugin 只留一个', one.plugins.length === 1 && one.plugins[0].plugin === 'dsh-better-sidebar');

const text = run('--plugin', 'dsh-better-sidebar');
ok('人读版带位置与样例', /15|3 条/.test(text) && text.includes('sidebar.right.pane.tab'), text.split('\n')[3]);

let refused = '';
try { execFileSync(process.execPath, [join(here, 'slot-map-report.mjs'), '--map', join(dir, 'nope.json')], { stdio: 'pipe' }); }
catch (e) { refused = String(e.stderr || ''); }
ok('文件不存在时明确报错', /找不到 slot-map/.test(refused), refused.trim().slice(0, 40));

console.log(fail ? 'SLOTREPORT_TEST_FAILED ' + fail : 'SLOT_MAP_REPORT_TEST_OK');
process.exitCode = fail ? 1 : 0;
