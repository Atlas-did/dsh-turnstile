// 控制台读到的「安装后状态」：只由 journal 最后一次已应用写操作 + 注入的宿主身份决定。
import { mkdtempSync, rmSync, copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { copyTreeSafe } from './safe-copy.mjs';
import { collectConsoleData } from './console-data.mjs';
import { beginOperation, settleOperation } from '../plugins/turnstile-popup/lib/journal.js';

let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const tmp = mkdtempSync(join(tmpdir(), 'console-install-'));
const profile = join(tmp, 'p');
const state = join(tmp, 'state');
copyTreeSafe(join(import.meta.dirname, '..', 'tests', 'console-fixture'), profile);
mkdirSync(state, { recursive: true });

const empty = collectConsoleData(profile, { stateDir: state, bootId: 'boot-b2' });
ok('没有写操作记录 → unknown', empty.install.pendingRestart === null && /没有/.test(empty.install.reason), empty.install.reason);

beginOperation(state, { planId: 'p1', kind: 'designer', dryRun: false, bootId: 'boot-b2', target: 'cordis.patch.yml' });
settleOperation(state, 'p1', 'applied', { changed: 1 });

const sameBoot = collectConsoleData(profile, { stateDir: state, bootId: 'boot-b2' });
ok('同一宿主启动内的写入 → 待重启', sameBoot.install.pendingRestart === true, sameBoot.install.reason);
ok('待重启带有最后一次应用时间', typeof sameBoot.install.at === 'string' && sameBoot.install.at.length > 0);

const nextBoot = collectConsoleData(profile, { stateDir: state, bootId: 'boot-b3' });
ok('宿主已重启 → 不再待重启', nextBoot.install.pendingRestart === false, nextBoot.install.reason);

const noId = collectConsoleData(profile, { stateDir: state });
ok('没有注入宿主身份 → unknown', noId.install.pendingRestart === null, noId.install.reason);

rmSync(tmp, { recursive: true, force: true });
console.log(fail ? 'CONSOLE_INSTALL_FAILED ' + fail : 'CONSOLE_INSTALL_OK');
process.exitCode = fail ? 1 : 0;
