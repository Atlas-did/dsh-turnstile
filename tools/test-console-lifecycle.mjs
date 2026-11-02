// 声明版本 vs 磁盘版本：只有 profile 写死精确版本时才判断不一致，范围一律 unknown。
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { copyTreeSafe } from './safe-copy.mjs';
import { collectConsoleData } from './console-data.mjs';

let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const fixture = join(import.meta.dirname, '..', 'tests', 'console-fixture');
const tmp = mkdtempSync(join(tmpdir(), 'console-lifecycle-'));
const profile = join(tmp, 'p');
copyTreeSafe(fixture, profile);

const pkgPath = join(profile, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
ok('夹具里有可测的插件集', Array.isArray(pkg.dsh?.profile?.bundles) && pkg.dsh.profile.bundles.length > 0, JSON.stringify(pkg.dsh?.profile?.bundles));
// 造一个「声明精确版本 9.9.9，磁盘是别的版本」的插件
mkdirSync(join(profile, 'node_modules', 'plug-x'), { recursive: true });
writeFileSync(join(profile, 'node_modules', 'plug-x', 'package.json'), JSON.stringify({ name: 'plug-x', version: '1.0.0' }));
pkg.dependencies = { ...(pkg.dependencies || {}), 'plug-x': '9.9.9' };
pkg.dsh = pkg.dsh || { profile: { bundles: [] } };
pkg.dsh.profile = { ...(pkg.dsh.profile || {}), bundles: [...(pkg.dsh.profile?.bundles || []), 'plug-x'] };
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

const data = collectConsoleData(profile, { stateDir: join(tmp, 'state') });
const px = data.plugins.find((p) => p.name === 'plug-x');
ok('精确声明与磁盘不一致被标出', px && px.declaredVersion === '9.9.9' && px.installedVersion === '1.0.0' && px.versionMismatch === true, JSON.stringify(px && { d: px.declaredVersion, i: px.installedVersion, m: px.versionMismatch }));

const ranged = JSON.parse(readFileSync(pkgPath, 'utf8'));
ranged.dependencies['plug-x'] = '^1.0.0';
writeFileSync(pkgPath, JSON.stringify(ranged, null, 2));
const data2 = collectConsoleData(profile, { stateDir: join(tmp, 'state') });
const px2 = data2.plugins.find((p) => p.name === 'plug-x');
ok('范围声明不判断一致性（unknown 而不是猜测）', px2 && px2.declaredVersion === null && px2.versionMismatch === null, JSON.stringify(px2 && { d: px2.declaredVersion, m: px2.versionMismatch }));

rmSync(tmp, { recursive: true, force: true });
console.log(fail ? 'CONSOLE_LIFECYCLE_FAILED ' + fail : 'CONSOLE_LIFECYCLE_OK');
process.exitCode = fail ? 1 : 0;
