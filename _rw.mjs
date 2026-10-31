import { readFileSync, writeFileSync } from 'node:fs';

const F = 'C:/Users/finef/Desktop/mini-harness/oss/dsh-turnstile/tools/setup.mjs';
const src = readFileSync(F, 'utf8');
const start = src.indexOf('if (has(\'--panel\') && has(\'--yes\')) {');
const endMarker = 'console.log(\'panel installed into \' + target + \' (restart DSH to load it)\');';
const endIdx = src.indexOf(endMarker);
if (start < 0 || endIdx < 0) { console.log('markers not found', start, endIdx); process.exit(1); }
const tail = src.indexOf('}', src.indexOf('catch (e) {', endIdx));
const replacement = [
  "if (has('--panel') && has('--yes')) {",
  "  const srcDir = join(ROOT, 'plugins', 'turnstile-popup');",
  "  try {",
  "    // B13/B14: a dedicated installer merges the patch correctly (template `[]`) and writes a `file:` dep.",
    execFileSync(process.execPath, [join(ROOT, 'tools', 'install-panel.mjs'), target, srcDir], { stdio: 'inherit' });",
  "  } catch (e) {",
  "    console.error('panel install failed: ' + String(e.message).slice(0, 300));",
  "    process.exit(1);",
  "  }",
  "}",
].join('\n');
const out = src.slice(0, start) + replacement + src.slice(tail + 1);
writeFileSync(F, out);
console.log('rewritten, len', out.length);