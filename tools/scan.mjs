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

let acorn = null;
try { acorn = createRequire(join(ROOT, 'package.json'))('acorn'); } catch { acorn = null; }
export const usingParser = Boolean(acorn && acorn.parse);

const CTX_TEXT_RE = /ctx\.([A-Za-z_$][\w$]*)\s*=(?!=)/g;
const PROVIDE_TEXT_RE = /ctx\.provide\(\s*['"]([\w.-]+)['"]/g;

/**
 * Find what a module does to ctx: `ctx.<name> = ...` assignments and `ctx.provide('name')`.
 * AST path walks the syntax tree, so strings/comments cannot fake an assignment.
 * Returns { assigned: string[], provided: string[], evidence: 'ast' | 'text' }.
 */
export function ctxUsage(code) {
  if (acorn && acorn.parse) {
    try {
      const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true });
      const assigned = new Set();
      const provided = new Set();
      const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'AssignmentExpression' && node.left && node.left.type === 'MemberExpression') {
          const l = node.left;
          if (!l.computed && l.object && l.object.type === 'Identifier' && l.object.name === 'ctx' && l.property && l.property.name) {
            assigned.add(l.property.name);
          }
        }
        if (node.type === 'CallExpression' && node.callee && node.callee.type === 'MemberExpression') {
          const c = node.callee;
          if (!c.computed && c.object && c.object.type === 'Identifier' && c.object.name === 'ctx' && c.property && c.property.name === 'provide') {
            const a0 = node.arguments && node.arguments[0];
            if (a0 && a0.type === 'Literal' && typeof a0.value === 'string') provided.add(a0.value);
          }
        }
        for (const k of Object.keys(node)) {
          const v = node[k];
          if (Array.isArray(v)) { for (const x of v) visit(x); }
          else if (v && typeof v === 'object' && typeof v.type === 'string') visit(v);
        }
      };
      visit(ast);
      return { assigned: [...assigned].sort(), provided: [...provided].sort(), evidence: 'ast' };
    } catch { /* fall through to text */ }
  }
  const assigned = new Set();
  const provided = new Set();
  let m;
  CTX_TEXT_RE.lastIndex = 0;
  while ((m = CTX_TEXT_RE.exec(code))) assigned.add(m[1]);
  PROVIDE_TEXT_RE.lastIndex = 0;
  while ((m = PROVIDE_TEXT_RE.exec(code))) provided.add(m[1]);
  return { assigned: [...assigned].sort(), provided: [...provided].sort(), evidence: 'text' };
}
