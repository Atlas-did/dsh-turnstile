// 启动器：评分规则、跳过规则、增量索引的复用行为。
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { scoreMatch, searchIndex, shouldSkip } from '../lib/launcher-index.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..'); // test/ -> turnstile-popup/ -> plugins/ -> 仓库根
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

ok('完全匹配分最高', scoreMatch('/a/b/launcher.mjs', 'launcher.mjs') >= 1000);
ok('前缀次之', scoreMatch('/a/launcher-extra.mjs', 'launcher') > scoreMatch('/a/x-launcher.mjs', 'launcher'));
ok('路径包含也能命中', scoreMatch('/a/tools/launcher.mjs', 'tools') > 0);
ok('词首缩写能命中', scoreMatch('DeepSeek Harness.exe', 'dh') > 0);
ok('子序列兜底', scoreMatch('dsh-bridge-next', 'dshbr') > 0);
ok('不相关返回 0', scoreMatch('readme.md', 'zzzz') === 0);
ok('空查询返回 0', scoreMatch('readme.md', '') === 0);
ok('跳过 node_modules/.git', shouldSkip('node_modules') && shouldSkip('.git'));
ok('不跳普通目录', !shouldSkip('tools'));

const entries = [
  { path: 'C:/x/tools/launcher.mjs', name: 'launcher.mjs' },
  { path: 'C:/x/tools/other.mjs', name: 'other.mjs' },
  { path: 'C:/x/docs/launcher-guide.md', name: 'launcher-guide.md' },
];
const hits = searchIndex(entries, 'launcher');
ok('搜索结果按分数降序', hits.length === 2 && hits[0].score >= hits[1].score);
ok('limit 生效', searchIndex(entries, 'launcher', { limit: 1 }).length === 1);

// 增量：文件没动 -> 全部复用；改一个 -> 只有它算新增/改动
const dir = mkdtempSync(join(tmpdir(), 'lz-'));
const state = join(dir, 'state');
const src = join(dir, 'src');
mkdirSync(join(src, 'node_modules'), { recursive: true });
writeFileSync(join(src, 'a.txt'), 'a');
writeFileSync(join(src, 'b.txt'), 'b');
writeFileSync(join(src, 'node_modules', 'skip.txt'), 'x');
const run = (args) => execFileSync(process.execPath, [join(root, 'tools', 'launcher.mjs'), ...args], { encoding: 'utf8', env: { ...process.env, DSH_TURNSTILE_STATE: state } });
const first = run(['index', '--root', src]);
ok('首次索引跳过 node_modules', /2 条/.test(first) && /跳过 1/.test(first), first.trim());
const second = run(['index', '--root', src, '--incremental']);
ok('增量全复用', /复用 2/.test(second) && /新增\/改动 0/.test(second), second.trim());
utimesSync(join(src, 'b.txt'), new Date(), new Date(Date.now() + 5000));
writeFileSync(join(src, 'b.txt'), 'bb');
const third = run(['index', '--root', src, '--incremental']);
ok('改一个文件后只有 1 条算改动', /新增\/改动 1/.test(third) && /复用 1/.test(third), third.trim());
const idx = JSON.parse(readFileSync(join(state, 'launcher-index.json'), 'utf8'));
ok('索引持久化且条目正确', idx.count === 2 && idx.entries.every((e) => e.path && e.mtime));

console.log(fail ? 'LAUNCHER_TEST_FAILED ' + fail : 'LAUNCHER_TEST_OK');
process.exitCode = fail ? 1 : 0;
