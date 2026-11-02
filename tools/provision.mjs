#!/usr/bin/env node
// Provision：只读探测 → 机器快照 + profile 适配卡（方案 docs/186）。
// 约束：探测不调用任何宿主副作用接口；不传 --write 时一个字节都不写。
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
export const PROBE_VERSION = '1';
export const MACHINE_KIND = 'turnstile/machine-snapshot@1';
export const CARD_KIND = 'turnstile/profile-card@1';
export const CAPABILITY_STATES = ['declared', 'detected', 'contract-passed', 'host-verified', 'unavailable', 'unknown'];

const canonical = (value) => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  return JSON.stringify(value == null ? null : value);
};
export const digestOf = (value) => createHash('sha256').update(canonical(value), 'utf8').digest('hex').slice(0, 16);

function readJson(file) { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } }

/** 只读探测：只读文件与环境变量，不调用宿主对象。 */
export function probeMachine(env = process.env) {
  const dshBin = env.DSH_BIN || '';
  const home = env.DSH_HOME || join(env.USERPROFILE || env.HOME || '', '.dsh');
  let version = ''; let runtimeRoot = ''; let source = 'unknown';
  if (dshBin && existsSync(dshBin)) {
    const pkg = readJson(join(dirname(dshBin), '..', 'package.json'));
    if (pkg && pkg.version) { version = String(pkg.version); source = 'package.json'; }
    runtimeRoot = dirname(dirname(dshBin));
  }
  const knowledge = readJson(join(root, 'knowledge', 'ctx-services.json'));
  const facts = {
    kind: MACHINE_KIND,
    probeVersion: PROBE_VERSION,
    platform: process.platform,
    arch: process.arch,
    node: process.version.replace(/^v/, ''),
    dsh: { version, runtimeRoot, home, source },
    capabilities: {
      // 只读探测到不了宿主对象，如实 unknown；宿主内探测留给以后
      'slots.snapshot': { state: 'unknown', source: 'cli-probe', missingReason: '需要宿主运行时的只读反射' },
      'approval.request': { state: 'unknown', source: 'cli-probe', missingReason: '有副作用，禁止在探测里调用' },
      'tools.register': { state: 'unknown', source: 'cli-probe', missingReason: '有副作用，禁止试注册' },
    },
    services: knowledge ? { count: (knowledge.services || []).length, generatedFor: knowledge.dshVersion || '', generator: 'knowledge-gen@1' } : { count: null, generatedFor: '', generator: '' },
    provenance: { host: 'cli', commands: ['probeMachine'] },
  };
  return Object.assign({}, facts, { probeDigest: digestOf(facts), probedAt: new Date().toISOString() });
}

export function probeProfile(profileDir, machine, env = process.env) {
  const pkg = readJson(join(profileDir, 'package.json')) || {};
  const bundles = (pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || [];
  const plugins = bundles.map((name) => ({ name, declared: true, installed: existsSync(join(profileDir, 'node_modules', name)) }));
  const patchText = existsSync(join(profileDir, 'cordis.patch.yml')) ? readFileSync(join(profileDir, 'cordis.patch.yml'), 'utf8') : '';
  const facts = {
    kind: CARD_KIND,
    profile: basename(profileDir),
    profileDir,
    machineDigest: machine.probeDigest,
    runtimeFingerprint: digestOf({ version: machine.dsh.version, runtimeRoot: machine.dsh.runtimeRoot, probeVersion: PROBE_VERSION }),
    adapterSelections: {
      platform: process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'macos' : 'linux'),
      stateDir: env.DSH_TURNSTILE_STATE || '',
      hotkey: process.platform === 'win32' ? 'powershell' : 'none',
    },
    plugins,
    slots: { source: 'unknown', observedAt: '' },
    evidence: [{ source: 'probe', observedAt: new Date().toISOString(), status: patchText ? 'present' : 'absent', locator: join(profileDir, 'cordis.patch.yml') }],
    provenance: { createdBy: 'cli', commands: ['probeProfile'], dshVersionAtProbe: machine.dsh.version },
  };
  // digest 只覆盖稳定事实：时间戳每次都不同，不能进指纹
  const stable = Object.assign({}, facts, {
    evidence: (facts.evidence || []).map((e) => ({ source: e.source, status: e.status, locator: e.locator })),
  });
  return Object.assign({}, facts, { cardDigest: digestOf(stable), createdAt: new Date().toISOString() });
}

/** 卡片是否仍然对得上当前机器（方案 186 §4）。 */
export function staleness(card, machine) {
  if (!card || !machine) return { isStale: true, reason: '缺少卡片或机器快照' };
  if (card.machineDigest !== machine.probeDigest) return { isStale: true, reason: '机器快照已变化' };
  const fp = digestOf({ version: machine.dsh.version, runtimeRoot: machine.dsh.runtimeRoot, probeVersion: PROBE_VERSION });
  if (card.runtimeFingerprint !== fp) return { isStale: true, reason: '运行时指纹已变化' };
  return { isStale: false, reason: '' };
}

/** 写卡片：只有显式 --write 才落盘；先打印摘要再写。 */
export function writeCards(machine, card, stateDir) {
  const dir = join(stateDir, 'provision');
  mkdirSync(dir, { recursive: true });
  const machineFile = join(dir, 'machine-' + machine.probeDigest + '.json');
  const cardFile = join(dir, 'profile-' + card.profile + '.json');
  writeFileSync(machineFile, JSON.stringify(machine, null, 2) + '\n');
  writeFileSync(cardFile, JSON.stringify(card, null, 2) + '\n');
  return { machineFile, cardFile };
}

// 注意：test-provision.mjs 也以 provision.mjs 结尾，必须比 basename
const isMain = process.argv[1] && basename(process.argv[1]) === 'provision.mjs';
if (isMain) {
  const argv = process.argv.slice(2);
  const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const has = (n) => argv.includes(n);
  const profileArg = argv.find((a) => !a.startsWith('--') && a !== val('--state'));
  if (!profileArg) { console.error('usage: node tools/provision.mjs <profileDir> [--json] [--write] [--state <dir>] [--check]'); process.exit(2); }
  const profileDir = profileArg;
  if (!existsSync(join(profileDir, 'package.json'))) { console.error('not a profile: ' + profileDir); process.exit(2); }

  const machine = probeMachine(process.env);
  const card = probeProfile(profileDir, machine, process.env);
  const stateDir = val('--state') || process.env.DSH_TURNSTILE_STATE || join(profileDir, '..', '..', 'turnstile-state');

  if (has('--check')) {
    const existing = readJson(join(stateDir, 'provision', 'profile-' + card.profile + '.json'));
    if (!existing) { console.log(JSON.stringify({ ok: false, verdict: 'unknown', reason: '还没有适配卡，先运行 provision --write' }, null, 2)); process.exit(3); }
    const stale = staleness(existing, machine);
    console.log(JSON.stringify({ ok: !stale.isStale, verdict: stale.isStale ? 'stale' : 'current', reason: stale.reason }, null, 2));
    process.exit(stale.isStale ? 1 : 0);
  }

  if (has('--write')) {
    const files = writeCards(machine, card, stateDir);
    console.log(JSON.stringify({ ok: true, wrote: files, machineDigest: machine.probeDigest, cardDigest: card.cardDigest }, null, 2));
    process.exit(0);
  }

  if (has('--json')) { console.log(JSON.stringify({ machine, card }, null, 2)); process.exit(0); }
  console.log('机器：' + machine.platform + '/' + machine.arch + '  node ' + machine.node);
  console.log('DSH：' + (machine.dsh.version || 'unknown') + '  运行时 ' + (machine.dsh.runtimeRoot || '(未探测到)'));
  console.log('服务知识：' + (machine.services.count == null ? 'unknown' : machine.services.count + ' 条（' + machine.services.generatedFor + '）'));
  console.log('profile：' + card.profile + '  插件 ' + card.plugins.length + '（已安装 ' + card.plugins.filter((p) => p.installed).length + '）');
  console.log('能力：' + Object.entries(machine.capabilities).map(([k, v]) => k + '=' + v.state).join('  '));
  console.log('');
  console.log('这是只读探测，没有写任何文件。加 --write 才会落盘（' + stateDir + '）。');
}
