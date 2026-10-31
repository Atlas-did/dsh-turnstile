// S1 · 记录读取层：把日志文件变成 Record[]，并保证「同一份语料永远是同一批记录」。
//
// 这一层只做四件事，任何一条都不能省（都是 2026-10-31 踩出来的）：
//   1. 每行是 [{"source","record":{...},"seq"}] 或裸对象 —— 两种都要吃；
//   2. 跨文件按 seq 去重（healthy-window 是 runtime 块的逐字复制，不去重会 10239 ≠ 9225）；
//   3. 时间戳统一成 UTC ISO（dsh-bridge 用 Z，connector 用 +08:00，混着切窗差 8 小时）；
//   4. 与 manifest 的 sha256 比对，不匹配就报 drift 并拒绝出结论。
//
// 纯读取层：不判断健康与否，不打印结论（那是 S2/S3 的事）。
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';

/** 把 `+08:00` / `Z` 都归一成 UTC ISO；解析失败返回 null（由调用方决定是否算错）。 */
export function toUtcIso(value) {
  if (!value) return null;
  const s = String(value).trim();
  const withZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z';
  const t = Date.parse(withZone);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

export function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/** 读一个文件，返回 { records, unparsableLines }。file 只保留 basename 便于稳定比对。 */
export function readFileRecords(path) {
  const buf = readFileSync(path);
  const file = basename(path);
  const digest = sha256Hex(buf);
  const lines = buf.toString('utf8').split(/\r?\n/);
  const records = [];
  let unparsableLines = 0;
  lines.forEach((line, i) => {
    if (!line) return;
    let parsed;
    try { parsed = JSON.parse(line); } catch { unparsableLines++; return; }
    for (const entry of Array.isArray(parsed) ? parsed : [parsed]) {
      const rec = (entry && entry.record) || entry || {};
      records.push({
        file,
        line: i + 1,
        sha256: digest,
        seq: entry && entry.seq !== undefined ? entry.seq : (entry && entry.eventId) || null,
        source: entry && entry.source !== undefined ? entry.source : (rec.source || null),
        ts: toUtcIso(rec.time),
        level: rec.level ? String(rec.level).toLowerCase() : null,
        name: rec.name || null,
        eventCode: rec.errorCode || rec.bridgeCode || null,
        message: rec.message || '',
        exception: rec.exception || null,
      });
    }
  });
  return { file, sha256: digest, records, unparsableLines };
}

/**
 * 读一组文件并去重。返回 { records, files, duplicates, unparsableLines, drift }。
 * drift 非空时调用方**必须**拒绝出结论——语料被动过，结论不可信。
 */
export function readRecords(paths, { manifest } = {}) {
  const seen = new Set();
  const records = [];
  const files = [];
  let duplicates = 0;
  let unparsableLines = 0;
  const drift = [];
  for (const path of paths) {
    const got = readFileRecords(path);
    files.push({ file: got.file, sha256: got.sha256, records: got.records.length });
    unparsableLines += got.unparsableLines;
    if (manifest) {
      const entry = (manifest.files || []).find((f) => basename(f.path) === got.file);
      if (!entry) drift.push({ file: got.file, why: 'not in manifest' });
      else if (!entry.sha256.startsWith(got.sha256.slice(0, entry.sha256.length)) && !got.sha256.startsWith(entry.sha256)) {
        drift.push({ file: got.file, why: 'sha256 mismatch' });
      }
    }
    for (const r of got.records) {
      const key = r.seq === null ? got.file + ':' + r.line : 'seq:' + r.seq;
      if (seen.has(key)) { duplicates++; continue; }
      seen.add(key);
      records.push(r);
    }
  }
  return { records, files, duplicates, unparsableLines, drift };
}

/** 读 manifest.json（corpus 的完整 sha256 清单）。 */
export function readManifest(corpusDir) {
  const p = join(corpusDir, 'manifest.json');
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}
