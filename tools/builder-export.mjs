#!/usr/bin/env node
// usage: node tools/builder-export.mjs <page.json> <outDir> --name my-page
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportPlugin } from '../plugins/turnstile-popup/lib/plugin-export.js';

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const val = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const [pageFile, outDir] = positional;
if (!pageFile || !outDir) {
  console.error('usage: node tools/builder-export.mjs <page.json> <outDir> --name my-page');
  process.exit(2);
}

try {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const page = JSON.parse(readFileSync(pageFile, 'utf8'));
  const renderer = readFileSync(join(root, 'plugins', 'turnstile-popup', 'lib', 'page-render.js'), 'utf8');
  const name = val('--name') || 'page-' + Date.now().toString(36);
  const result = exportPlugin(page, outDir, { name, renderer });
  console.log('已导出 ' + result.outDir);
  console.log('  name    ' + result.name);
  console.log('  route   ' + result.route);
  console.log('  文件    ' + result.files.join(' / '));
} catch (e) {
  console.error('导出失败：' + String(e.message || e));
  process.exit(2);
}
