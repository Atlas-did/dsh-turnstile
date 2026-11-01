// 生成「历史实施记录」清单：不在当前索引里的文档都要在这份里出现，
// 这样新文档不会静默变成没人读的孤儿（handoff P5：历史不删除，但不能冒充当前说明）。
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const docsDir = join(here, '..', 'docs');
const index = readFileSync(join(docsDir, 'README.md'), 'utf8');
const all = readdirSync(docsDir).filter((f) => f.endsWith('.md') && f !== 'README.md' && f !== 'history.md').sort();
const rest = all.filter((f) => !index.includes(f));

const title = (f) => {
  try {
    const first = readFileSync(join(docsDir, f), 'utf8').split(/\r?\n/).find((l) => l.startsWith('# '));
    return first ? first.replace(/^#\s*/, '').slice(0, 80) : '';
  } catch { return ''; }
};

const out = [
  '# 历史实施记录',
  '',
  '> 这些文档是当时的过程记录，**不代表当前行为**。当前状态请看 [文档索引](README.md)。',
  '> 本文件由 `node tools/docs-index.mjs` 生成，新增文档请重新生成。',
  '',
  '| 文档 | 当时的标题 |',
  '|---|---|',
  ...rest.map((f) => '| [' + f + '](' + f + ') | ' + title(f) + ' |'),
  '',
].join('\n');

if (process.argv.includes('--check')) {
  const cur = readFileSync(join(docsDir, 'history.md'), 'utf8');
  if (cur !== out) { console.log('history.md 过期：跑 node tools/docs-index.mjs'); process.exit(1); }
  console.log('history.md 与当前文档一致（' + rest.length + ' 篇）');
  process.exit(0);
}
writeFileSync(join(docsDir, 'history.md'), out);
console.log('已生成 docs/history.md：' + rest.length + ' 篇历史文档，' + (all.length - rest.length) + ' 篇在索引里');