'use strict';
// B8: CLI 写 patch 之前必须确认「现文件能解析、写后也能解析」，否则就是在坏文件上叠改动。
// 三轮加固：①前置内容指纹（防止 plan 与 write 之间被别处改过）；②写后读回比对；
// ③读回不一致时用备份恢复并抛错，而不是留下半写状态。
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadYaml } from '../config.mjs';

export function patchParseError(text, where) {
  const { yaml, schema } = loadYaml();
  try { yaml.load(text, { schema }); return null; }
  catch (e) { return where + ' 无法解析：' + String((e && e.message) || e).split('\n')[0]; }
}

export function fingerprint(text) {
  return createHash('sha256').update(String(text || ''), 'utf8').digest('hex').slice(0, 16);
}

export function safeWritePatch(patchPath, next, { now = () => Date.now(), expected } = {}) {
  const currentText = readFileSync(patchPath, 'utf8');
  const before = patchParseError(currentText, '现有文件');
  if (before) throw new Error(before + '（拒绝在坏文件上写入）');

  // ① 前置指纹：调用方若给了 expected，说明它基于某个快照出计划；不一致就当并发冲突
  if (expected != null) {
    // expected 是「计划时算好的指纹」，不要再哈希一次
    const want = typeof expected === 'object' ? expected.fingerprint : String(expected);
    const got = fingerprint(currentText);
    if (want && want !== got) { const e = new Error('前置内容已变化（计划基于 ' + want + '，当前 ' + got + '），请重新生成计划'); e.code = 'STALE_PLAN'; throw e; }
  }

  const after = patchParseError(next, '写入内容');
  if (after) throw new Error(after + '（改动会让文件不可解析）');

  const bak = patchPath + '.bak-' + now();
  copyFileSync(patchPath, bak);
  writeFileSync(patchPath, next);

  // ② 写后读回：磁盘上的字节必须与准备写入的一致
  const readBack = readFileSync(patchPath, 'utf8');
  if (readBack !== next) {
    // ③ 不一致就恢复，不把半写状态留给下一次
    try { writeFileSync(patchPath, currentText); } catch (e) { throw new Error('写后读回不一致，且恢复失败：' + e.message + '（备份：' + bak + '）'); }
    throw new Error('写后读回不一致，已从内存快照恢复（备份：' + bak + '）');
  }
  return bak;
}
