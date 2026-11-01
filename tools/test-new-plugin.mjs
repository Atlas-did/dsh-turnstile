// 新建插件骨架：生成的包必须能被宿主真的加载（两个曾把 trial 卡在 L2 的坑）。
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tool = join(here, '..', 'tools', 'new-plugin.mjs');
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const run = (args) => { try { return { code: 0, out: execFileSync(process.execPath, [tool, ...args], { encoding: 'utf8' }) }; } catch (e) { return { code: e.status, out: String((e.stdout || '') + (e.stderr || '')) }; } };

const parent = mkdtempSync(join(tmpdir(), 'newplug-'));
const dry = JSON.parse(run(['demo-one', '--dir', parent, '--dry-run', '--json']).out);
ok('dry-run 不写盘', dry.dryRun === true && !existsSync(join(parent, 'demo-one')));
ok('dry-run 列出 4 个文件', dry.files.length === 4, dry.files.join(','));

const made = run(['demo-one', '--dir', parent, '--json']);
ok('创建成功', made.code === 0, String(made.code));
const pkg = JSON.parse(readFileSync(join(parent, 'demo-one', 'package.json'), 'utf8'));
ok('带 dsh.bundle.patch', pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch === './cordis.patch.yml');
ok('不带 dsh.client（缺 platform 会让 profile 起不来）', pkg.dsh.client === undefined);
const patch = readFileSync(join(parent, 'demo-one', 'cordis.patch.yml'), 'utf8');
ok('bundle patch 用 insert 包一层', /^- insert:/m.test(patch) && patch.includes('id: demo-one'), patch.trim().split('\n')[0]);
ok('index.js 注入 webServer', readFileSync(join(parent, 'demo-one', 'lib', 'index.js'), 'utf8').includes("inject = ['webServer']"));
ok('页面含可断言的 brand 文本', readFileSync(join(parent, 'demo-one', 'lib', 'page.html'), 'utf8').includes('demo-one'));

ok('已存在时拒绝覆盖', run(['demo-one', '--dir', parent]).code === 3);
ok('非法包名拒绝', run(['Demo_Bad', '--dir', parent]).code === 2);
ok('未知模板拒绝', run(['ok-name', '--dir', parent, '--template', 'nope']).code === 2);

rmSync(parent, { recursive: true, force: true });
console.log(fail ? 'NEW_PLUGIN_FAILED ' + fail : 'NEW_PLUGIN_OK');
process.exitCode = fail ? 1 : 0;