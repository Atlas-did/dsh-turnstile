// 隐私扫描：仓库里不该出现真实用户主目录路径（D-04：原来只扫 docs/）。
// 范围：docs/、tools/、plugins/、skills/、tests/ 与根 package.json；跳过 node_modules 与 .git。
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Windows 盘符路径与 MSYS 路径都要抓；占位符（带尖括号）不算
export const HOME_PATH = /(?:[A-Za-z]:[\\/]|\/)[Uu]sers[\\/](?![<`])[^\\/\s`'"]+[\\/][^\\/\s`'"]+/g;
export function findPaths(text) {
  const m = String(text || '').match(HOME_PATH);
  return m ? m.slice() : [];
}

const isMain = process.argv[1] && process.argv[1].endsWith('sanitize-docs.mjs');
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const apply = process.argv.includes('--apply');
  const onlyDocs = process.argv.includes('--docs-only');
  const SCAN_DIRS = onlyDocs ? ['docs'] : ['docs', 'tools', 'plugins', 'skills', 'tests'];
  const EXTS = new Set(['.md', '.mjs', '.js', '.json', '.yml', '.yaml', '.html', '.css', '.txt']);
  const SKIP = new Set(['node_modules', '.git', 'state', '.turnstile']);
  const walk = (dir, out) => {
    let rows = [];
    try { rows = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const row of rows) {
      if (SKIP.has(row.name)) continue;
      const p = join(dir, row.name);
      if (row.isDirectory()) walk(p, out);
      else if (EXTS.has(extname(row.name))) out.push(p);
    }
    return out;
  };
  const files = [];
  for (const d of SCAN_DIRS) walk(join(root, d), files);
  files.push(join(root, 'package.json'));
  let hits = 0; const touched = [];
  for (const p of files) {
    let t = '';
    try { t = readFileSync(p, 'utf8'); } catch { continue; }
    const found = findPaths(t);
    if (!found.length) continue;
    hits += found.length;
    touched.push(p.split(sep).join('/').replace(root.split(sep).join('/') + '/', ''));
    if (apply) writeFileSync(p, t.replace(HOME_PATH, '<home>'));
  }
  console.log(JSON.stringify({ hits, files: touched.length, apply, scope: onlyDocs ? 'docs' : 'repo', sample: touched.slice(0, 5) }, null, 2));
  if (!apply && hits) console.log('跑 node tools/sanitize-docs.mjs --apply 修掉');
  process.exitCode = hits ? 1 : 0;
}
