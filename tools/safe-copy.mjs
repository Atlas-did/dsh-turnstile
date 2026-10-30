// Copy a directory tree without fs.cpSync.
//
// fs.cpSync from a path containing `node_modules` kills the Node process on this machine
// (silent exit, no stderr; reproduced with a three-file fixture). Reading and writing the bytes
// ourselves works, so every fixture copy in the test suites goes through here.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

export function copyTreeSafe(src, dst) {
  const st = statSync(src);
  if (st.isDirectory()) {
    mkdirSync(dst, { recursive: true });
    for (const name of readdirSync(src)) copyTreeSafe(join(src, name), join(dst, name));
    return;
  }
  mkdirSync(dirname(dst), { recursive: true });
  try { copyFileSync(src, dst); } catch { writeFileSync(dst, readFileSync(src)); }
}
