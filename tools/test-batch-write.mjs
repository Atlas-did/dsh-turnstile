// 批量写事务：中途失败必须把本批文件全部恢复（复审 P2-3）。
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runBatch } from './lib/batch-write.mjs';

let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const tmp = mkdtempSync(join(tmpdir(), 'bw-'));
const a = join(tmp, 'a.yml');
const b = join(tmp, 'b.json');
writeFileSync(a, 'original-a');
writeFileSync(b, 'original-b');

let r = runBatch([a, b], [() => writeFileSync(a, 'new-a'), () => writeFileSync(b, 'new-b')]);
ok('全部成功时都写入', r.ok && readFileSync(a, 'utf8') === 'new-a' && readFileSync(b, 'utf8') === 'new-b');

writeFileSync(a, 'original-a');
writeFileSync(b, 'original-b');
r = runBatch([a, b], [() => writeFileSync(a, 'partial'), () => { throw new Error('第 2 步炸了'); }]);
ok('中途失败时整批恢复', !r.ok && r.restored === true && readFileSync(a, 'utf8') === 'original-a', readFileSync(a, 'utf8'));
ok('失败点被记录', r.failedAt === 1 && /炸了/.test(r.error), String(r.failedAt));
ok('已完成的步骤被记录', Array.isArray(r.done) && r.done.length === 1);

rmSync(tmp, { recursive: true, force: true });
console.log(fail ? 'BATCH_WRITE_FAILED ' + fail : 'BATCH_WRITE_OK');
process.exitCode = fail ? 1 : 0;