// CLI 与 UI 同源：doctor 的 issue 必须与 console-data 的 issue ID 一致（方案 02 验收）。
import { execFileSync } from 'node:child_process';
import { collectConsoleData } from '../tools/console-data.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const profileDir = join(here, '..', 'tests', 'console-fixture');
let doctor = null;
try {
  const out = execFileSync(process.execPath, [join(here, 'doctor.mjs'), profileDir, '--json'], { encoding: 'utf8', timeout: 120000 });
  doctor = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
} catch (e) { const s = String((e.stdout || '') + (e.stderr || '')); doctor = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)); }
const data = doctor.data || doctor;
const doctorIds = (data.issues || []).map((i) => i.id).sort();
const ui = collectConsoleData(profileDir, { stateDir: join(here, '..', 'state') });
const uiIds = (ui.issues || []).map((i) => i.id).sort();
ok('doctor 输出 issues', Array.isArray(data.issues), String(doctorIds.length));
ok('doctor 与 console-data 的 issue ID 完全一致', JSON.stringify(doctorIds) === JSON.stringify(uiIds), doctorIds.join(',') + ' vs ' + uiIds.join(','));
ok('两边都带三组', Boolean(data.issueGroups && ui.issueGroups));
const sev = (list) => list.map((i) => i.id + '=' + i.severity).sort().join(',');
ok('严重度也一致', sev(data.issues || []) === sev(ui.issues || []), sev(data.issues || []));
console.log(fail ? 'ISSUE_PARITY_FAILED ' + fail : 'ISSUE_PARITY_OK');
process.exitCode = fail ? 1 : 0;