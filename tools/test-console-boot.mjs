// journal 记 applyBootId + restartState 消费它：写入端与判定端在同一条链上。
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beginOperation, settleOperation, listOperations } from '../plugins/turnstile-popup/lib/journal.js';
import { restartState } from './lib/lifecycle.mjs';

let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const state = mkdtempSync(join(tmpdir(), 'boot-journal-'));

const id = 'plan-1';
beginOperation(state, { planId: id, kind: 'designer', dryRun: false, bootId: 'boot-b2', target: 'cordis.patch.yml' });
settleOperation(state, id, 'applied', { changed: 1 });
const entries = listOperations(state);
const entry = entries.find((e) => e.id === id);
ok('journal 保留了 applyBootId', entry && entry.bootId === 'boot-b2', JSON.stringify(entry && entry.bootId));
ok('同一宿主 → 待重启', restartState({ entries, currentBootId: 'boot-b2' }).pendingRestart === true);
ok('换了宿主（已重启）→ 不再待重启', restartState({ entries, currentBootId: 'boot-b3' }).pendingRestart === false);

const unknownId = 'plan-2';
beginOperation(state, { planId: unknownId, kind: 'designer', dryRun: false, target: 'cordis.patch.yml' });
settleOperation(state, unknownId, 'applied', { changed: 0 });
const entries2 = listOperations(state);
ok('没注入 bootId 的写入 → null（不猜）', restartState({ entries: entries2, currentBootId: 'boot-b2' }).pendingRestart === null);

rmSync(state, { recursive: true, force: true });
console.log(fail ? 'CONSOLE_BOOT_FAILED ' + fail : 'CONSOLE_BOOT_OK');
process.exitCode = fail ? 1 : 0;
