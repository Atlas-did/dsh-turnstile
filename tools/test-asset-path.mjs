// 资产路由的路径边界（C-08）：缺根、越界、软链接、类型、解码失败各有一条。
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveAsset } from '../plugins/turnstile-popup/lib/asset-path.js';
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const tmp = mkdtempSync(join(tmpdir(), 'asset-'));
const root = join(tmp, 'img'); mkdirSync(root, { recursive: true });
writeFileSync(join(root, 'a.png'), 'x');
writeFileSync(join(tmp, 'outside.png'), 'x');

ok('缺根直接拒绝（不再退化成 cwd）', resolveAsset({ wanted: join(root, 'a.png'), roots: [] }).status === 400);
ok('根内图片通过', resolveAsset({ wanted: join(root, 'a.png'), roots: [root] }).ok === true);
ok('越界路径被拒', resolveAsset({ wanted: join(tmp, 'outside.png'), roots: [root] }).status === 403);
ok('不存在的文件 404', resolveAsset({ wanted: join(root, 'nope.png'), roots: [root] }).status === 404);
ok('非图片类型 415', (() => { writeFileSync(join(root, 'a.txt'), 'x'); return resolveAsset({ wanted: join(root, 'a.txt'), roots: [root] }).status === 415; })());
let linkMade = false;
try { symlinkSync(join(tmp, 'outside.png'), join(root, 'link.png')); linkMade = true; } catch { /* Windows 可能没权限 */ }
if (linkMade) ok('软链接跳出根被拒（真实路径校验）', resolveAsset({ wanted: join(root, 'link.png'), roots: [root] }).status === 403);
else console.log('SKIP 软链接（当前环境不允许创建符号链接）');
rmSync(tmp, { recursive: true, force: true });
console.log(fail ? 'ASSET_PATH_FAILED ' + fail : 'ASSET_PATH_OK');
process.exitCode = fail ? 1 : 0;
