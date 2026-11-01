// 缺依赖不该冒充 FAIL：preflight 必须报 skipped + 下一步（外部审查 #7 的根因）。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

// 1) requireDep 的错误必须能直接照做
const { requireDep } = await import(pathToFileURL(join(root, 'tools', 'config.mjs')).href);
let err = null;
try { requireDep('definitely-not-installed-xyz'); } catch (e) { err = e; }
ok('缺依赖抛 MISSING_DEPENDENCY', err && err.code === 'MISSING_DEPENDENCY', err && err.code);
ok('错误消息里给 npm install', err && /npm install/.test(err.message), err && err.message.slice(0, 40));

// 2) preflight 的 JSON 里每条 check 都要有 skipped 字段（哪怕是 false）
const out = execFileSync(process.execPath, [join(root, 'tools', 'preflight.mjs'), 'tests/console-fixture', '--only', 'risk', '--json', '--no-record'], { encoding: 'utf8', timeout: 180000 });
const j = JSON.parse(out);
ok('check 记录带 skipped 字段', j.checks.every((c) => 'skipped' in c), JSON.stringify(j.checks[0]).slice(0, 60));
ok('正常检查 skipped=false', j.checks.every((c) => c.skipped === false));

console.log(fail ? 'DEPENDENCY_DIAG_FAILED ' + fail : 'DEPENDENCY_DIAG_OK');
process.exitCode = fail ? 1 : 0;
