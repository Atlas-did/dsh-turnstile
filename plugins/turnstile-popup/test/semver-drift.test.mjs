// semver 判断的漂移测试：registry 的手写规则 vs version.mjs 的宿主判定器。
// 不合并两者（registry 有 EXEMPTED/UNCERTIFIED 等额外语义），而是**证明它们不矛盾**。
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.DSH_VERSION = process.env.DSH_VERSION || '0.2.1-rc.3';
const { checkCompatibility } = await import('../../../tools/version.mjs');

// 默认使用自包含夹具：测试不能依赖或扫描开发者真实桌面 profile。
const fixture = mkdtempSync(join(tmpdir(), 'semver-profile-'));
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2));
writeJson(join(fixture, 'package.json'), { private: true, dependencies: { 'fixture-compatible': '1.0.0', 'fixture-incompatible': '1.0.0' } });
for (const [name, range] of [['fixture-compatible', '>=0.2.0'], ['fixture-incompatible', '<0.1.0']]) {
  const dir = join(fixture, 'node_modules', name);
  mkdirSync(dir, { recursive: true });
  writeJson(join(dir, 'package.json'), { name, version: '1.0.0', engines: { dsh: range } });
}
const profile = process.env.SEMVER_PROFILE || fixture;
const here = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

if (!existsSync(join(profile, 'package.json'))) {
  console.log('skip: 没有可用 profile（用 SEMVER_PROFILE 指定）');
  process.exit(0);
}

// registry 用退出码表达「有非 OK 项」，所以不能只看 exit code
const res = spawnSync(process.execPath, [join(here, '../../../tools/registry.mjs'), profile], { encoding: 'utf8', timeout: 120000 });
const out = String(res.stdout || '');
const rows = out.split('\n').slice(2).map((l) => l.trim().split(/\s{2,}/)).filter((c) => c.length >= 3 && /^(OK|SKIPPED|UNCERTIFIED|UNDECLARED|MISSING|EXEMPTED)$/.test(c[0]));
ok('registry 输出了状态表', rows.length > 0, String(rows.length) + ' 行');

// 逐插件对比：registry 说 SKIPPED 的，version 必须说「不兼容」；反之亦然
let disagree = [];
let compared = 0;
for (const [state, name, version] of rows) {
  if (!['OK', 'SKIPPED'].includes(state)) continue;
  const pj = join(profile, 'node_modules', name, 'package.json');
  if (!existsSync(pj)) continue;
  const manifest = JSON.parse(readFileSync(pj, 'utf8'));
  const issue = checkCompatibility(manifest);
  compared += 1;
  const versionSaysCompatible = issue === null;
  const registrySaysCompatible = state === 'OK';
  if (versionSaysCompatible !== registrySaysCompatible) disagree.push(name + ': registry=' + state + ' version=' + (issue ? 'incompatible' : 'compatible'));
}
ok('至少比较了一个插件', compared > 0, String(compared));
ok('两套 semver 判断不矛盾', disagree.length === 0, disagree.slice(0, 2).join(' | '));

console.log(fail ? 'SEMVER_DRIFT_TEST_FAILED ' + fail : 'SEMVER_DRIFT_TEST_OK (' + compared + ' 个插件一致)');
process.exitCode = fail ? 1 : 0;
