#!/usr/bin/env node
// 用真实 npm pack 清单做隐私扫描：node tools/pack-privacy.mjs [--json]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanPack } from './lib/pack-privacy.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: root, encoding: 'utf8', shell: true, timeout: 180000 });
let files = [];
try { files = (JSON.parse(out)[0] || {}).files.map((f) => f.path); } catch { console.error('npm pack --dry-run --json 输出读不出'); process.exit(2); }
const result = scanPack({ files, readText: (f) => readFileSync(join(root, f), 'utf8') });
if (process.argv.includes('--json')) console.log(JSON.stringify({ ...result, files: files.length }, null, 2));
else {
  console.log('pack files: ' + files.length);
  if (result.ok) console.log('PACK_PRIVACY_OK');
  else for (const f of result.findings) console.log('FAIL ' + f.file + '  [' + f.rule + '] ' + f.why + (f.excerpt ? '  ' + f.excerpt : ''));
}
process.exitCode = result.ok ? 0 : 1;
