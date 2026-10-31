// B8: CLI 写 patch 之前必须确认「现文件能解析、写后也能解析」，否则就是在坏文件上叠改动。
// 抛错而不是 process.exit，方便测试与调用方决定退出码。
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { loadYaml } from '../config.mjs';

export function patchParseError(text, where) {
  const { yaml, schema } = loadYaml();
  try { yaml.load(text, { schema }); return null; }
  catch (e) { return where + ' 无法解析：' + String((e && e.message) || e).split('\n')[0]; }
}

export function safeWritePatch(patchPath, next, { now = () => Date.now() } = {}) {
  const before = patchParseError(readFileSync(patchPath, 'utf8'), '现有文件');
  if (before) throw new Error(before + '（拒绝在坏文件上写入）');
  const after = patchParseError(next, '写入内容');
  if (after) throw new Error(after + '（改动会让文件不可解析）');
  const bak = patchPath + '.bak-' + now();
  copyFileSync(patchPath, bak);
  writeFileSync(patchPath, next);
  return bak;
}
