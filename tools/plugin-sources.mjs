// Shared: walk a profile's installed plugins and hand back their JS sources.
// Every static check (port/file/css/shortcut) uses this so scope rules stay identical.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function eachPluginSource(profileDir, cb, opts = {}) {
  const maxFiles = opts.maxFiles || 12;
  const maxBytes = opts.maxBytes || 4 * 1024 * 1024;
  const pkgPath = join(profileDir, 'package.json');
  if (!existsSync(pkgPath)) return [];
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const names = Object.keys(pkg.dependencies || {});
  const seen = new Set();
  for (const name of names) {
    const dir = join(profileDir, 'node_modules', name);
    if (!existsSync(dir)) continue;
    const files = [];
    const walk = (p, depth) => {
      if (depth > 2 || files.length >= maxFiles) return;
      let st; try { st = statSync(p); } catch { return; }
      if (st.isDirectory()) { let es; try { es = readdirSync(p); } catch { return; } for (const e of es) walk(join(p, e), depth + 1); }
      else if (p.endsWith('.js') && st.size < maxBytes) files.push(p);
    };
    walk(join(dir, 'lib'), 1);
    if (!files.length) walk(dir, 1);
    for (const f of files) {
      let text; try { text = readFileSync(f, 'utf8'); } catch { continue; }
      const rel = f.slice(dir.length + 1).split(String.fromCharCode(92)).join('/');
      const key = name + '/' + rel;
      if (seen.has(key)) continue;
      seen.add(key);
      cb({ plugin: name, file: rel, path: f, text });
    }
  }
  return [...seen];
}
