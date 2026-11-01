// 单一入口：转发正确、未知子命令明确报错、旧行为兼容。
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, '..', 'tools', 'turnstile.mjs');
const fixture = join(here, '..', 'tests', 'console-fixture');
const state = mkdtempSync(join(tmpdir(), 'turnstile-entry-state-'));
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const run = (args) => {
  const options = { encoding: 'utf8', timeout: 120000, env: { ...process.env, DSH_TURNSTILE_STATE: state } };
  try { return { code: 0, out: execFileSync(process.execPath, [entry, ...args], options) }; }
  catch (e) { return { code: e.status == null ? 1 : e.status, out: String((e.stdout || '') + (e.stderr || '')) }; }
};

const help = run(['help']);
ok('help 列出四大分组', /查[\s\S]*验[\s\S]*改[\s\S]*推/.test(help.out));
ok('help 提到兼容行为', /等价于 gate/.test(help.out));

const unknown = run(['nope-nope']);
ok('未知子命令 exit 2', unknown.code === 2, String(unknown.code));
ok('未知子命令给出下一步', /turnstile\.mjs help/.test(unknown.out));

const insp = run(['inspect', fixture, 'plug-alpha', '--lines', '2']);
ok('inspect 转发生效', /plug-alpha @1\.4\.0/.test(insp.out), insp.out.split('\n')[0]);
const inspJson = run(['inspect', '--lines', '1', fixture, 'plug-alpha', '--json']);
ok('JSON inspect 的选项值不会冒充位置参数', inspJson.code === 0 && JSON.parse(inspJson.out).data?.pkg === 'plug-alpha', String(inspJson.code));

const map = join(state, 'slot-map.json');
writeFileSync(map, JSON.stringify({ slots: [{ slot: 'shell.overlay', count: 1, entries: ['plug-alpha:item'] }] }));
const slotReport = run(['slot-report', '--map', map, '--json']);
ok('slot-report 转发 map 并保留完整 JSON', slotReport.code === 0 && JSON.parse(slotReport.out).data?.plugins?.[0]?.total === 1, String(slotReport.code));

const preset = run(['snapshot', 'list', fixture]);
ok('组合命令 snapshot list 生效', /快照|还没有快照|\d{4}-\d{2}-\d{2}T/.test(preset.out), preset.out.trim().split('\n')[0]);

const check = run(['check', 'risk', fixture]);
ok('check risk 转发到 risk.mjs', /risk|summary/i.test(check.out), check.out.trim().split('\n')[0].slice(0, 40));

// 旧行为：裸 profile 路径 → gate（这里只验证它确实走到了 preflight，不追求跑完）
const legacy = run([fixture, '--only', 'risk']);
ok('裸 profile 路径仍可跑（转发 gate）', legacy.out.length > 0 && !/不认识的子命令/.test(legacy.out), legacy.out.trim().split('\n')[0].slice(0, 40));

console.log(fail ? 'ENTRY_TEST_FAILED ' + fail : 'ENTRY_TEST_OK');
process.exitCode = fail ? 1 : 0;
