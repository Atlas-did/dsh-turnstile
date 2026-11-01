// 文档脱敏：docs 里不该出现作者机器的绝对路径（handoff 隐私项）
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const docs = join(here, '..', 'docs');
// 两种形态都要抓：Windows 盘符路径（C:/Users/...）与 MSYS 路径（/c/Users/...）
// 占位符（如 C:/Users/<user> 或 /home/<user>）不算泄漏：真正的路径不会带尖括号
const PATTERN = /(?:[A-Za-z]:[\\/]|\/)[Uu]sers[\\/](?![<`])[^\\/\s`'"]+[\\/][^\\/\s`'"]+/g;
const apply = process.argv.includes('--apply');
let hits = 0; const files = [];
for (const f of readdirSync(docs)) {
  if (!f.endsWith('.md')) continue;
  const p = join(docs, f);
  const t = readFileSync(p, 'utf8');
  const m = t.match(PATTERN);
  if (!m) continue;
  hits += m.length; files.push(f);
  if (apply) writeFileSync(p, t.replace(PATTERN, '<home>'));
}
console.log(JSON.stringify({ hits, files: files.length, apply }, null, 2));
if (!apply && hits) console.log('跑 node tools/sanitize-docs.mjs --apply 修掉');
process.exitCode = hits ? 1 : 0;