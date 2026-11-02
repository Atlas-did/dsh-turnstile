// 发布包隐私规则：先证明「该红的会红」，再看真实 pack 清单。
import { scanPack } from './lib/pack-privacy.mjs';
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
// 样本字符串在这里拼出来：仓库自己的隐私扫描会（正确地）把字面量当成泄漏。
const SLASH = '/';
const PERSONAL = 'C:' + SLASH + 'Users' + SLASH + 'someone' + SLASH + 'private.txt';
const TOKEN = 'sk' + '-' + 'ABCDEFGHIJKLMNOP1234';
const KEY = '-----BEGIN ' + 'RSA PRIVATE KEY-----';
const files = {
  'lib/ok.js': 'export const a = 1;',
  'lib/person.js': 'const p = "' + PERSONAL + '";',
  'lib/token.js': 'const k = "' + TOKEN + '";',
  'state/cordis.patch.yml.bak-1699999999': 'x',
  'tools/_probe.mjs': 'console.log(1);',
  'lib/key.js': KEY,
};
const read = (f) => files[f];

const clean = scanPack({ files: ['lib/ok.js'], readText: read });
ok('干净清单通过', clean.ok === true && clean.scanned === 1);
const dirty = scanPack({ files: Object.keys(files), readText: read });
ok('个人绝对路径被抓', dirty.findings.some((f) => f.rule === 'personal-path' && f.file === 'lib/person.js'));
ok('长期令牌被抓', dirty.findings.some((f) => f.rule === 'secret-token'));
ok('私钥被抓', dirty.findings.some((f) => f.rule === 'private-key'));
ok('备份/临时/调试脚本按文件名被抓', ['backup-file', 'debug-script'].every((r) => dirty.findings.some((f) => f.rule === r)));
ok('有问题就不算通过', dirty.ok === false);
const unreadable = scanPack({ files: ['gone.js'], readText: () => { throw new Error('nope'); } });
ok('清单里有但读不到 → 也算问题（不静默跳过）', unreadable.ok === false && unreadable.findings[0].rule === 'unreadable');
console.log(fail ? 'PACK_PRIVACY_FAILED ' + fail : 'PACK_PRIVACY_RULES_OK');
process.exitCode = fail ? 1 : 0;
