'use strict';
// 发布包隐私扫描（C-11）：扫的是 npm pack 的实际清单与内容，而不是「仓库里固定几个目录」。
// 纯函数：文件清单与读取函数由调用方给，便于用合成夹具验证规则会不会红。
export const PACK_RULES = [
  { id: 'personal-path', re: /[A-Za-z]:[\\/]Users[\\/][^\\/\s"']+/g, why: '含个人绝对路径' },
  { id: 'nul-bytes', re: /\u0000/g, why: '含二进制/NUL，可能是误打包的产物' },
  { id: 'secret-token', re: /\b(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|xox[bap]-[A-Za-z0-9-]{10,})\b/g, why: '疑似长期令牌' },
  { id: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, why: '含私钥' },
];

export const PACK_NAME_RULES = [
  { id: 'backup-file', re: /\.bak-[^/]*$|~$/, why: '备份残留文件' },
  { id: 'temp-file', re: /\.tmp-\d+$|\.lock$/, why: '临时/锁文件残留' },
  { id: 'debug-script', re: /(^|\/)_[a-z0-9]+\.mjs$/, why: '根目录调试脚本' },
];

export function scanPack({ files, readText = () => '' }) {
  const findings = [];
  for (const file of files || []) {
    for (const rule of PACK_NAME_RULES) if (rule.re.test(file)) findings.push({ file, rule: rule.id, why: rule.why });
    let text = '';
    try { text = String(readText(file) || ''); } catch { findings.push({ file, rule: 'unreadable', why: '清单里有但读不到' }); continue; }
    for (const rule of PACK_RULES) {
      const m = text.match(rule.re);
      if (m) findings.push({ file, rule: rule.id, why: rule.why, excerpt: String(m[0]).slice(0, 60) });
    }
  }
  return { ok: findings.length === 0, findings, scanned: (files || []).length };
}
