// Import scanning for plugin sources.
// Primary path is a real tokenizer (es-module-lexer) so multiline imports, `export * from`,
// and literal dynamic `import("x")` are all found without regex guesswork.
// If the lexer is unavailable or throws on odd input, we fall back to regex and say so.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ROOT } from './config.mjs';

let lexer = null;
try {
  const req = createRequire(join(ROOT, 'package.json'));
  lexer = req('es-module-lexer');
  if (lexer.init) await lexer.init;
} catch { lexer = null; }

export const usingLexer = Boolean(lexer && lexer.parse);

const RE = /(?:^|[\s;])(?:import|export)\s+(?:[^'";]*?from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * @returns {{ specifiers: string[], evidence: 'ast' | 'text' }}
 * Dynamic imports are only visible when the argument is a string literal — a computed
 * specifier is invisible to both paths, which is exactly the blind spot we document.
 */
export function importsOf(code) {
  if (lexer && lexer.parse) {
    try {
      const [imports] = lexer.parse(code);
      const specifiers = [];
      for (const imp of imports) {
        if (imp.n) { specifiers.push(imp.n); continue; }
        // imp.n is null for dynamic imports with a non-literal argument
        const src = code.slice(imp.ss, imp.se);
        const m = src.match(/^import\(\s*['"]([^'"]+)['"]\s*\)/);
        if (m) specifiers.push(m[1]);
      }
      return { specifiers: [...new Set(specifiers)], evidence: 'ast' };
    } catch { /* fall through to regex */ }
  }
  const specifiers = [];
  let m;
  RE.lastIndex = 0;
  while ((m = RE.exec(code))) specifiers.push(m[1] || m[2]);
  return { specifiers: [...new Set(specifiers.filter(Boolean))], evidence: 'text' };
}

const PKG_RE = /^((?:@[^/]+\/)?[^/]+)/;
export function packageOf(specifier) {
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) return null;
  const m = specifier.match(PKG_RE);
  return m ? m[1] : null;
}
