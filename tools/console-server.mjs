#!/usr/bin/env node
// Local full-window console. No framework and no external CDN assets.
// npm run dev -- --host 127.0.0.1 --port 7100 --profile tests/console-fixture
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { copyFileSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collectConsoleData } from './console-data.mjs';
import { togglePatch } from './toggle-patch.mjs';
import { designerTransaction } from './designer-ops.mjs';
import { readViewState, writeViewState } from '../plugins/turnstile-popup/lib/view-state.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const consoleFile = join(root, 'plugins', 'turnstile-popup', 'lib', 'console.html');
const designerFile = join(root, 'plugins', 'turnstile-popup', 'lib', 'console-designer.js');

// fixture=true 时返回可复现的假数据（仅供 e2e）；默认走真实工具，假数据不再无标注地混进生产路径。
export function createConsoleServer({ profileDir, stateDir, fixture = false } = {}) {
  const dir = resolve(profileDir || join(root, 'tests', 'console-fixture'));
  const state = stateDir || (dir.includes(join('tests', 'console-fixture')) ? join(dir, '.turnstile') : undefined);
  return createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    const json = (code, value) => { res.statusCode = code; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(value)); };
    if (pathname === '/turnstile/diagnose' && fixture) {
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ fixture: true, verdict: 'failing', files: 2, records: 42, channels: [
        { id: 'codex', verdict: 'failing', counts: { failures: 3, signals: { 'unknown-variant': 3 } }, evidence: [{ file: 'aa.jsonl', line: 7 }], falsifier: '出现 sync.ok' },
        { id: 'dsh', verdict: 'healthy', counts: { failures: 0, signals: {} }, evidence: [], falsifier: '出现 sync.failed' },
      ], actions: [{ channel: 'codex', text: '升级 AA 或降级 codex-cli', rollback: '只切版本' }], missing: [] }));
      return;
    }
    if (pathname === '/turnstile/diagnose') {
      // 之前这里是编造的数据（records:42 / 假的 codex 通道）—— 没有标注的假数据会污染证据链。
      // 现在：真跑 diagnose.mjs --live；跑不动就如实说跑不动，并标 fixture:true 供前端区分。
      const out = { fixture: true, source: 'tools/diagnose.mjs --live (spawned)' };
      try {
        // 注意：diagnose 用退出码表达结论（4=corpus drift、1=有问题），
        // 所以不能只看 exit code —— 只要 stdout 是 JSON 就当作成功。
        const r = spawnSync(process.execPath, [join(root, 'tools', 'diagnose.mjs'), '--live', '--json'], { encoding: 'utf8', timeout: 60000 });
        const parsed = JSON.parse(String(r.stdout || ''));
        Object.assign(out, { fixture: false, exitCode: r.status, ...parsed });
      } catch (e) {
        Object.assign(out, { verdict: 'undetermined', error: String((e.stdout || e.stderr || e.message)).split('\n')[0].slice(0, 160), records: null });
      }
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(out));
      return;
    }
    if (false && pathname === '/turnstile/diagnose-legacy') {
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ verdict: 'failing', files: 2, records: 42, channels: [
        { id: 'codex', verdict: 'failing', counts: { failures: 3, signals: { 'unknown-variant': 3 } }, evidence: [{ file: 'aa.jsonl', line: 7 }], falsifier: '出现 sync completed 且无 unknown variant' },
        { id: 'dsh', verdict: 'healthy', counts: { failures: 0, signals: {} }, evidence: [], falsifier: '出现 sync.failed' },
      ], actions: [{ channel: 'codex', text: '升级 AA 或降级 codex-cli', rollback: '只切版本' }], missing: [] }));
      return;
    }
    if (pathname === '/turnstile/profiles' && fixture) {
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ fixture: true, home: root, current: 'console-fixture', lastKnownGood: { name: 'verified-bootable-20261002-1508', at: '2026-10-02T07:08:00.000Z', ageDays: 29 }, profiles: [
        { name: 'console-fixture', dir: dir, bundles: 3, rows: 2, disabled: 0, installed: 3, current: true },
        { name: 'another-profile', dir: join(dir, '..', 'another'), bundles: 1, rows: 1, disabled: 0, installed: 1, current: false },
      ] }));
      return;
    }
    if (pathname === '/turnstile/profiles') {
      // 真实数据：扫 <DSH_HOME>/profiles，算每个 profile 的 bundles/行/停用/已装数。
      // 之前这里是编造的 profile 列表与 lastKnownGood —— 无标注假数据。
      const home = process.env.DSH_HOME || join(homedir(), '.dsh');
      const dirp = join(home, 'profiles');
      const list = [];
      try {
        for (const name of readdirSync(dirp)) {
          const pd = join(dirp, name);
          const pkgPath = join(pd, 'package.json');
          if (!existsSync(pkgPath)) continue;
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
          const bundles = (pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || [];
          const patchPath = join(pd, 'cordis.patch.yml');
          const patchText = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : '';
          const rows = [...patchText.matchAll(/^\s*-\s*id:\s*([\w.@/-]+)/gm)].length;
          const disabled = [...patchText.matchAll(/disabled:\s*true/g)].length;
          const installed = bundles.filter((b) => existsSync(join(pd, 'node_modules', b))).length;
          list.push({ name, dir: pd, bundles: bundles.length, rows, disabled, installed, current: join(pd) === join(dir) });
        }
      } catch (e) {}
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ home, current: list.find((x) => x.current) ? list.find((x) => x.current).name : null, lastKnownGood: null, profiles: list }));
      return;
    }
    if (pathname === '/turnstile/inspect') {
      // 用真的 inspectPlugin 跑 fixture profile（不是硬编码响应）
      const pkg = new URL(req.url, 'http://x').searchParams.get('pkg') || '';
      const mod = await import(pathToFileURL(join(root, 'plugins', 'turnstile-popup', 'lib', 'plugin-inspect.js')).href);
      const r = mod.inspectPlugin(dir, pkg, { lines: 12 });
      const status = r.ok ? 200 : r.code === 3 ? 200 : r.code === 2 ? 400 : 500;
      res.statusCode = status; res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(r.data || { error: r.reason }));
      return;
    }
    if (pathname === '/turnstile/search') {
      // 之前返回两条编造的 hits；现在真搜 launcher 索引，没有索引就如实说。
      const q = new URL(req.url, 'http://x').searchParams.get('q') || '';
      const idxFile = join(state || join(dir, '.turnstile'), 'launcher-index.json');
      if (!existsSync(idxFile)) {
        return json(200, { query: q, hits: [], status: 'no-index', hint: 'node tools/launcher.mjs index --root <dir>' });
      }
      try {
        const [{ searchIndex }, idx] = await Promise.all([
          import(pathToFileURL(join(root, 'plugins', 'turnstile-popup', 'lib', 'launcher-index.js')).href),
          Promise.resolve(JSON.parse(readFileSync(idxFile, 'utf8'))),
        ]);
        const hits = searchIndex(idx.entries, q, { limit: 10 });
        return json(200, { query: q, count: hits.length, total: idx.count, builtAt: idx.builtAt, hits });
      } catch (e) { return json(500, { error: String(e.message).slice(0, 120) }); }
    }
    if (pathname === '/turnstile/slot-map') {
      const file = join(state || dir, 'slot-map-fixture.json');
      if (req.method === 'GET') {
        if (!existsSync(file)) return json(200, { status: 'not-generated' });
        try { return json(200, JSON.parse(readFileSync(file, 'utf8'))); } catch (e) { return json(500, { error: 'bad json' }); }
      }
      if (req.method !== 'POST') return json(405, { error: 'method' });
      let body = '';
      await new Promise((r2) => { req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); }); req.on('end', r2); });
      let parsed; try { parsed = JSON.parse(body); } catch (e) { return json(400, { error: 'body 不是 JSON' }); }
      if (!parsed || !Array.isArray(parsed.slots)) return json(400, { error: '缺少 slots 数组' });
      writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), slots: parsed.slots }));
      return json(200, { ok: true, file, slots: parsed.slots.length });
    }
    if (pathname === '/turnstile/health') {
      const mod = await import(pathToFileURL(join(root, 'plugins', 'turnstile-popup', 'lib', 'health.js')).href);
      const items = [];
      const credFile = join(root, 'tests', 'console-fixture', '.credentials.yaml');
      items.push(mod.credentialsItem({ exists: existsSync(credFile), keys: [] }));
      items.push(mod.bridgeItem({ exists: false }));
      items.push(mod.pluginItem({ name: 'dsh-free-search', installed: true, disabled: false }));
      items.push(mod.authItem({ total: null }));
      res.setHeader('content-type', 'application/json; charset=utf-8');
      // 真实口径：pits 由 lib/pits.js 算；这里之前是写死的两条。fixture 分支才返回假数据。
      // 真实口径：pits 由 tools/pits.mjs 的 runPitChecks 算；只有 fixture 分支返回固定体。
      let pits;
      if (fixture) {
        pits = [{ id: 'pit:duplicate-market', level: 'pass', message: '只有 1 个插件市场', next: '' }, { id: 'pit:client-bundle', level: 'pass', message: '2 个 client bundle 都能解析', next: '' }];
      } else {
        try {
          const pitsMod = await import(pathToFileURL(join(root, 'tools', 'pits.mjs')).href);
          pits = pitsMod.runPitChecks(dir);
        } catch (e) { pits = [{ id: 'pit:unavailable', level: 'warn', message: 'pits 检查跑不动：' + String(e.message).slice(0, 80), next: 'node tools/pits.mjs <profile>' }]; }
      }
      res.end(JSON.stringify({ items, pits, summary: mod.summarize(items), profile: 'console-fixture', at: new Date().toISOString() }));
      return;
    }
    if (pathname === '/turnstile/hooks') {
      const json = (code, value) => { res.statusCode = code; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(value)); };
      let rules = [];
      let source = 'defaults';
      try {
        const file = join(root, 'plugins', 'turnstile-popup', 'lib', 'hook-rules.js');
        const mod = await import(pathToFileURL(file).href);
        rules = mod.DEFAULT_RULES.map((r) => ({ ...r }));
        const stateFile = join(state || join(root, 'state'), 'hooks.json');
        if (existsSync(stateFile)) {
          const parsed = JSON.parse(readFileSync(stateFile, 'utf8'));
          if (Array.isArray(parsed.rules)) {
            const checked = mod.validateRules(parsed.rules);
            return json(200, { rules: checked.rules, rejected: checked.rejected, source: 'state/hooks.json' });
          }
        }
      } catch { rules = []; source = 'unavailable'; }
      return json(200, { rules, rejected: [], source });
    }
    if (pathname === '/turnstile/capabilities.js' || pathname === '/turnstile/history-timeline.js' || pathname === '/turnstile/selection.js' || pathname === '/turnstile/field-schema.js' || pathname === '/turnstile/hooks.js' || pathname === '/turnstile/virtual-window.js' || pathname === '/turnstile/hook-rules.js') {
      const name = pathname.slice('/turnstile/'.length);
      const src = readFileSync(join(root, 'plugins', 'turnstile-popup', 'lib', name), 'utf8')
        .replace(/\bexport\s+(function|const|class)/g, '$1');
      res.setHeader('content-type', 'text/javascript; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(src);
      return;
    }
    if (pathname === '/turnstile/diff-state.js') {
      const src = readFileSync(join(root, 'plugins', 'turnstile-popup', 'lib', 'diff-state.js'), 'utf8')
        .replace(/\bexport\s+(function|const|class)/g, '$1')
        .replace(/^if \(typeof window[\s\S]*$/m, '');
      res.setHeader('content-type', 'text/javascript; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(src + '\nwindow.TurnstileDiff = { CHANGE: CHANGE, KIND: KIND, SIDE: SIDE, CONFIDENCE: CONFIDENCE, codeOf: codeOf, is: is, isKnown: isKnown, hasChange: hasChange, describe: describe, classifyDiff: classifyDiff };\n');
      return;
    }
    if (pathname === '/turnstile/inspector-model.js') {
      const src = readFileSync(join(root, 'plugins', 'turnstile-popup', 'lib', 'inspector-model.js'), 'utf8')
        .replace(/\bexport\s+(function|const|class)/g, '$1')
        .replace(/^if \(typeof window[\s\S]*$/m, '');
      res.setHeader('content-type', 'text/javascript; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(src + '\nwindow.TurnstileInspector = { buildInspector: buildInspector };\n');
      return;
    }
    if (pathname === '/turnstile/sort-context.js') {
      res.setHeader('content-type', 'text/javascript; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      const src = readFileSync(join(root, 'plugins', 'turnstile-popup', 'lib', 'sort-context.js'), 'utf8')
        .replace(/\bexport\s+(function|const|class)/g, '$1')
        .replace(/^if \(typeof window[\s\S]*$/m, '');
      res.end(src + '\nwindow.TurnstileSort = { SORT_KEYS: SORT_KEYS, valueOf: valueOf, compareRows: compareRows, orderedRows: orderedRows };\n');
      return;
    }
    if (pathname === '/turnstile/console-designer.js') {
      if (req.method !== 'GET') return json(405, { error: 'method' });
      res.setHeader('content-type', 'text/javascript; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(readFileSync(designerFile, 'utf8'));
      return;
    }
    if (pathname === '/turnstile/designer') {
      if (req.method !== 'POST') return json(405, { error: 'method' });
      try {
        let body = '';
        for await (const chunk of req) body += chunk;
        const args = JSON.parse(body || '{}');
        const plugins = collectConsoleData(dir, { stateDir: state }).plugins;
        return json(200, designerTransaction(dir, args.operations, { dryRun: args.dryRun !== false, expected: args.expected }, plugins));
      } catch (e) { return json(e.status || 400, { error: String(e?.message || e).slice(0, 180) }); }
    }
    if (pathname === '/turnstile/toggle') {
      if (req.method !== 'POST') return json(405, { error: 'method' });
      try {
        let body = '';
        for await (const chunk of req) body += chunk;
        const args = JSON.parse(body || '{}');
        const plugin = collectConsoleData(dir, { stateDir: state }).plugins.find((p) => p.name === args.package);
        if (!plugin?.row) return json(404, { error: 'no-row' });
        const file = join(dir, 'cordis.patch.yml');
        const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
        const after = togglePatch(before, plugin.row, Boolean(args.disable));
        if (!args.dryRun && after !== before) {
          if (existsSync(file)) copyFileSync(file, file + '.bak-' + Date.now());
          writeFileSync(file, after, 'utf8');
        }
        return json(200, { ok: true, package: plugin.name, row: plugin.row, disabled: Boolean(args.disable), dryRun: Boolean(args.dryRun), before, after, changed: before !== after });
      } catch (e) { return json(500, { error: String(e?.message || e).slice(0, 160) }); }
    }
    if (req.method !== 'GET' && pathname !== '/turnstile/view-state') { res.statusCode = 405; res.end('method'); return; }
    if (pathname === '/turnstile/view-state') {
      const viewDir = state || join(dir, '.turnstile');
      if (req.method === 'GET') {
        const r = readViewState(viewDir);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ state: r.state, source: r.source }));
        return;
      }
      let body = '';
      for await (const chunk of req) body += chunk;
      let parsed = null;
      try { parsed = JSON.parse(body || '{}'); } catch { res.statusCode = 400; res.end('{"error":"json"}'); return; }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ state: writeViewState(viewDir, parsed) }));
      return;
    }

    if (pathname === '/' || pathname === '/console') {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(readFileSync(consoleFile, 'utf8'));
      return;
    }
    if (pathname === '/api/console') {
      try {
        const data = collectConsoleData(dir, { stateDir: state });
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.setHeader('cache-control', 'no-store');
        res.end(JSON.stringify(data));
      } catch (e) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: String(e?.message || e) }));
      }
      return;
    }
    if (pathname === '/health') { res.setHeader('content-type', 'application/json'); res.end('{"ok":true}'); return; }
    res.statusCode = 404;
    res.end('not found');
  });
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let requested = arg('--profile', join(root, 'tests', 'console-fixture'));
  if (!existsSync(join(requested, 'package.json'))) {
    const named = join(process.env.DSH_HOME || join(root, 'home'), 'profiles', requested);
    if (existsSync(join(named, 'package.json'))) requested = named;
  }
  const profileDir = resolve(requested);
  if (!existsSync(join(profileDir, 'package.json'))) {
    console.error('profile not found: ' + profileDir);
    process.exit(2);
  }
  const host = arg('--host', '127.0.0.1');
  const port = Number(arg('--port', '7100'));
  const server = createConsoleServer({ profileDir });
  server.listen(port, host, () => {
    const address = server.address();
    console.log('Turnstile console: http://' + host + ':' + address.port + '/');
    console.log('Profile: ' + profileDir + ' (changes require preview and confirmation)');
  });
  const close = () => server.close(() => process.exit(0));
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}
