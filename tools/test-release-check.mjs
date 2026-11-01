// release-check：真实仓库必须通过；反例证明坏链接、坏命令和写入绕过会被抓住。
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkMarkdownFile, checkRelease } from './release-check.mjs';

let failed = 0;
const ok = (name, condition, detail = '') => { console.log((condition ? 'ok   ' : 'FAIL ') + name + (detail ? '   ' + detail : '')); if (!condition) failed++; };
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const current = checkRelease({ root });
ok('当前仓库发布一致性通过', current.ok, current.findings.map((f) => f.title).join(' | '));
ok('覆盖五个入口文档', current.evidence[0].documents === 5);
ok('覆盖完整命令注册表', current.evidence[0].commands >= 19, String(current.evidence[0].commands));
const packed = checkRelease({ root, withPack: true });
ok('当前平台可执行 npm dry-run 打包', packed.ok, packed.findings.map((f) => f.title).join(' | '));
ok('发布包包含非空文件清单', packed.pack?.entries > 0, String(packed.pack?.entries || 0));

const bad = mkdtempSync(join(tmpdir(), 'release-doc-'));
writeFileSync(join(bad, 'README.md'), [
  '[missing](docs/not-there.md)',
  'node tools/not-there.mjs <profile>',
  'node tools/manage.mjs <profile> --disable x --yes',
  'node tools/profile-snapshot.mjs <profile> --take',
].join('\n'));
const problems = checkMarkdownFile(bad, 'README.md');
ok('抓住失效本地链接', problems.some((p) => p.id === 'doc-link'));
ok('抓住不存在的工具引用', problems.some((p) => p.id === 'doc-command'));
ok('抓住 manage 直接 --yes 绕过', problems.some((p) => p.id === 'doc-write-bypass'));
ok('抓住旧快照直接写入示例', problems.filter((p) => p.id === 'doc-write-bypass').length === 2);

console.log(failed ? 'RELEASE_CHECK_FAILED ' + failed : 'RELEASE_CHECK_OK 9 checks');
process.exitCode = failed ? 1 : 0;
