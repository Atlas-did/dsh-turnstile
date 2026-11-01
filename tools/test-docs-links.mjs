// 文档链接检查：入口文档里的相对链接必须真实存在（handoff P5）。
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const entries = ['README.md', 'INSTALL.md', 'docs/README.md'].map((f) => join(root, f));
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;
let checked = 0;
const missing = [];
for (const file of entries) {
  if (!existsSync(file)) { missing.push(file + '（入口文件不存在）'); continue; }
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(LINK)) {
    const raw = m[1];
    if (/^(https?:|mailto:|#)/.test(raw)) continue;
    const target = raw.split('#')[0];
    if (!target) continue;
    checked += 1;
    const abs = isAbsolute(target) ? target : resolve(dirname(file), target);
    if (!existsSync(abs)) missing.push((file.replace(root, '') + ' → ' + raw));
  }
}
ok('入口文档相对链接都能解析', missing.length === 0, missing.slice(0, 4).join(' | '));
ok('至少检查了 10 条链接', checked >= 10, String(checked));

// 每篇 docs 是否被索引覆盖（未覆盖不失败，但要报出来，方便逐步收）
const docsDir = join(root, 'docs');
const all = readdirSync(docsDir).filter((f) => f.endsWith('.md') && f !== 'README.md');
const indexText = readFileSync(join(docsDir, 'README.md'), 'utf8');
const unindexed = all.filter((f) => !indexText.includes(f));
// 规则：每篇文档要么在「当前索引」里，要么在自动生成的「历史记录」里——不能两处都没有。
const historyPath = join(docsDir, 'history.md');
const historyText = existsSync(historyPath) ? readFileSync(historyPath, 'utf8') : '';
const orphans = unindexed.filter((f) => !historyText.includes('(' + f + ')'));
ok('没有孤儿文档（索引或历史里必须出现）', orphans.length === 0, orphans.slice(0, 3).join(','));
const stale = historyText && readdirSync(docsDir).some((f) => f.endsWith('.md') && !indexText.includes(f) && !historyText.includes('(' + f + ')'));
ok('history.md 不是过期快照', !stale);

console.log(JSON.stringify({ checked, missing: missing.length, docs: all.length, unindexed: unindexed.length }, null, 1));
console.log(fail ? 'DOCS_LINKS_FAILED ' + fail : 'DOCS_LINKS_OK');
process.exitCode = fail ? 1 : 0;