// 文档命令冒烟：把文档里写的 node tools/... 真跑一遍（只跑只读的）。
// 目的：文档里的命令写法过期时能被发现，而不是等用户复制粘贴才报错。
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const fixture = 'tests/console-fixture';
const state = mkdtempSync(join(tmpdir(), 'docs-smoke-'));

// 只跑这些子命令：全部只读，不写 profile、不重启宿主
const SAFE = ['help', 'inspect', 'surfaces', 'doctor', 'slot-report', 'check-risk', 'check-conflict', 'check-engines', 'recommend', 'card', 'trial-status'];
const SKIP_FLAGS = /--apply|--yes|--keep|--token|--mini|preinstall|manage|snapshot|install|start|stop|delete|rm /;

const docsDir = join(root, 'docs');
const index = readFileSync(join(docsDir, 'README.md'), 'utf8');
const files = ['README.md', 'docs/README.md'].concat(
  [...index.matchAll(/\]\(([^)\s]+\.md)\)/g)].map((m) => 'docs/' + m[1]).filter((f) => existsSync(join(root, f)))
);

const cmds = new Set();
for (const f of files) {
  const text = readFileSync(join(root, f), 'utf8');
  for (const m of text.matchAll(/^\s*\$?\s*node tools\/([\w.-]+\.mjs)([^\n`]*)/gm)) {
    const script = m[1];
    const rest = (m[2] || '').trim();
    if (SKIP_FLAGS.test(rest)) continue;
    cmds.add(script + (rest ? ' ' + rest : ''));
  }
}

let fail = 0; const ran = []; const skipped = [];
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };

for (const raw of [...cmds].slice(0, 24)) {
  // 占位符能映射到夹具的就替换，映射不了的整条跳过（不假装跑过）
  const MAP = { '<profile>': fixture, '<profileDir>': fixture, '<pkg>': 'plug-alpha', '<plugin>': 'plug-alpha' };
  let cmdline = raw;
  for (const [k, v] of Object.entries(MAP)) cmdline = cmdline.split(k).join(v);
  if (/<[^>]+>/.test(cmdline)) { skipped.push(raw + ' → 占位符，跳过'); continue; }
  const [script, ...rest] = cmdline.split(/\s+/);
  const isTurnstile = script === 'turnstile.mjs';
  const sub = isTurnstile ? rest[0] : '';
  if (isTurnstile && !SAFE.includes(sub)) { skipped.push(raw); continue; }
  if (!isTurnstile && !/(read|check|scan|list|index|sanitize|report|smoke|verify|look)/.test(script)) { skipped.push(raw); continue; }
  const args = [join(root, 'tools', script)];
  for (const a of rest) {
    if (a.startsWith('<') || a.includes('<profile>') || a.includes('<pkg>') || a.includes('<mini')) continue;
    args.push(a.replace(/^(tests\/|\$TEMP)/, '$1'));
  }
  // 缺 profile 时补夹具，避免 usage 退出
  if (isTurnstile && ['inspect', 'surfaces', 'doctor', 'slot-report', 'check-risk', 'check-conflict', 'check-engines', 'trial-status'].includes(sub) && !args.some((a) => String(a).includes('console-fixture'))) {
    args.push(fixture);
  }
  try {
    execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 60000, env: Object.assign({}, process.env, { DSH_TURNSTILE_STATE: state }) });
    ran.push(raw);
  } catch (e) {
    const out = String((e.stdout || '') + (e.stderr || ''));
    // 检查类工具用非零退出表达「发现问题」，这不算文档过期
    if (e.status === 1 && /findings|FAIL|问题|风险/.test(out)) { ran.push(raw + '（以 1 退出：有发现）'); continue; }
    if (e.status === 3) { ran.push(raw + '（以 3 退出：unknown）'); continue; }
    skipped.push(raw + ' → ' + (out.trim().split('\n')[0] || 'exit ' + e.status));
  }
}

rmSync(state, { recursive: true, force: true });
const realErrors = skipped.filter((s) => s.includes(' → ') && !s.includes('占位符'));
ok('文档命令能跑（无 usage/ENOENT）', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
ok('至少真的跑了 5 条', ran.length >= 5, String(ran.length));
console.log(JSON.stringify({ found: cmds.size, ran: ran.length, skipped: skipped.length }, null, 1));
console.log(fail ? 'DOCS_SMOKE_FAILED ' + fail : 'DOCS_SMOKE_OK');
process.exitCode = fail ? 1 : 0;