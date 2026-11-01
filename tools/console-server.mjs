#!/usr/bin/env node
// Local full-window console. No framework and no external CDN assets.
// npm run dev -- --host 127.0.0.1 --port 7100 --profile tests/console-fixture
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { copyFileSync, existsSync, readFileSync, statSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { readPage, writePage, pageVersion } from '../plugins/turnstile-popup/lib/page-store.js';
import { readJsonBody, readJsonText } from './lib/json-body.mjs';
import { homedir } from 'node:os';
import { validatePageTree } from '../plugins/turnstile-popup/lib/page-validate.js';
import { dirname, join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collectConsoleData } from './console-data.mjs';
import { togglePatch } from './toggle-patch.mjs';
import { designerTransaction } from './designer-ops.mjs';
import { readViewState, writeViewState } from '../plugins/turnstile-popup/lib/view-state.js';
import { exportPlugin } from '../plugins/turnstile-popup/lib/plugin-export.js';
import { verifyExportedPlugin } from '../plugins/turnstile-popup/lib/export-verify.js';
import { beginOperation, settleOperation, listOperations } from '../plugins/turnstile-popup/lib/journal.js';
import { randomUUID } from 'node:crypto';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pluginLib = join(root, 'plugins', 'turnstile-popup', 'lib');
const consoleFile = join(pluginLib, 'console.html');
const designerFile = join(pluginLib, 'console-designer.js');

// fixture=true 时返回可复现的假数据（仅供 e2e）；默认走真实工具，假数据不再无标注地混进生产路径。
export function createConsoleServer({ profileDir, stateDir, fixture = false } = {}) {
  const dir = resolve(profileDir || join(root, 'tests', 'console-fixture'));
  // 页面版本：文件 mtime+size 的哈希，够用来发现「别处改过」，不需要额外存储
  // 真实模式读 profile 里实际装了多少插件（不写死包名）
  const readInstalledPlugins = (profileDir) => {
    try {
      const pj = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'));
      const bundles = pj.dsh?.profile?.bundles || [];
      const deps = Object.keys(pj.dependencies || {});
      return { count: bundles.length, deps: deps.length };
    } catch { return { count: 0, deps: 0 }; }
  };

  const pageVersion = (file) => {
    try {
      const st = statSync(file);
      return Number(st.mtimeMs) + Number(st.size);
    } catch { return 0; }
  };

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
    if (pathname === '/turnstile/run') {
      // 与控制台插件同一个实现（02 设计 §4.3）：纯函数 + 同一份命令注册表
      if (req.method !== 'POST') return json(405, { error: 'method' });
      let parsed;
      try { parsed = await readJsonBody(req, { maxBytes: 1e6 }); }
      catch (e) {
        if (e && e.code === 'BODY_TOO_LARGE') return json(413, { error: '请求体过大（上限 ' + e.limit + ' 字节）' });
        return json(400, { error: 'body 不是 JSON：' + String(e.message).slice(0, 120) });
      }
      if (parsed && parsed.args && !parsed.args.profile) parsed.args.profile = dir;
      try {
        const mod = await import(pathToFileURL(join(root, 'plugins', 'turnstile-popup', 'lib', 'run-route.js')).href);
        const out = await mod.handleRun(parsed, { toolsRoot: join(root, 'tools') });
        return json(out.status, out.body);
      } catch (e) { return json(500, { ok: false, verdict: 'unknown', summary: String(e.message).slice(0, 160) }); }
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
      let parsed;
      try { parsed = await readJsonBody(req, { maxBytes: 1e6 }); }
      catch (e) {
        if (e && e.code === 'BODY_TOO_LARGE') return json(413, { error: '请求体过大（上限 ' + e.limit + ' 字节）' });
        return json(400, { error: 'body 不是 JSON：' + String(e.message).slice(0, 120) });
      }
      if (!parsed || !Array.isArray(parsed.slots)) return json(400, { error: '缺少 slots 数组' });
      writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), slots: parsed.slots }));
      return json(200, { ok: true, file, slots: parsed.slots.length });
    }
    if (pathname === '/turnstile/health') {
      const healthMod = await import(pathToFileURL(join(root, 'plugins', 'turnstile-popup', 'lib', 'health.js')).href);
      const collectMod = await import(pathToFileURL(join(root, 'plugins', 'turnstile-popup', 'lib', 'health-collect.js')).href);
      let items = [];
      let notes = [];
      if (fixture) {
        const credFile = join(root, 'tests', 'console-fixture', '.credentials.yaml');
        items = [
          healthMod.credentialsItem({ exists: existsSync(credFile), keys: [] }),
          healthMod.bridgeItem({ exists: false }),
          healthMod.pluginItem({ name: 'dsh-free-search', installed: true, disabled: false }),
          healthMod.authItem({ total: null }),
        ];
      } else {
        // 真实模式：与宿主同一份采集器（路径、缺包判定、bridge 安装规则都一致）
        const hostBases = [pathToFileURL(join(root, 'plugins', 'turnstile-popup', 'lib', 'index.js')).href];
        try { const bin = process.env.DSH_BIN; if (bin && existsSync(bin)) hostBases.push(bin); } catch {}
        const collected = collectMod.collectHealth({ profileDir: dir, hostBases });
        items = collected.items;
        notes = collected.notes;
      }
      let pits;
      if (fixture) {
        pits = [{ id: 'pit:duplicate-market', level: 'pass', message: '只有 1 个插件市场', next: '' }, { id: 'pit:client-bundle', level: 'pass', message: '2 个 client bundle 都能解析', next: '' }];
      } else {
        try {
          const pitsMod = await import(pathToFileURL(join(root, 'tools', 'pits.mjs')).href);
          pits = pitsMod.runPitChecks(dir);
        } catch (e) { pits = [{ id: 'pit:unavailable', level: 'warn', message: 'pits 检查跑不动：' + String(e.message).slice(0, 80), next: 'node tools/pits.mjs <profile>' }]; }
      }
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ items, pits, notes, summary: healthMod.summarize(items), profile: fixture ? 'console-fixture' : dir, fixture: Boolean(fixture), at: new Date().toISOString() }));
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
    if (pathname === '/turnstile/capabilities.js' || pathname === '/turnstile/history-timeline.js' || pathname === '/turnstile/selection.js' || pathname === '/turnstile/field-schema.js' || pathname === '/turnstile/hooks.js' || pathname === '/turnstile/virtual-window.js' || pathname === '/turnstile/hook-rules.js' || pathname === '/turnstile/annotations.js') {
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
    if (['/turnstile/console-designer.js','/turnstile/console-annotation-picker.js','/turnstile/console-annotation-pick.js','/turnstile/console-annotations.js'].includes(pathname)) {
      if (req.method !== 'GET') return json(405, { error: 'method' });
      res.setHeader('content-type', 'text/javascript; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      const src = readFileSync(join(pluginLib, pathname.replace('/turnstile/', '')), 'utf8').replace(/^export\s+(?=(function|const|let|class))/gm, '');
      res.end(src);
      return;
    }
    if (pathname === '/turnstile/audit') {
      if (req.method !== 'GET') return json(405, { error: 'method' });
      return json(200, { entries: listOperations(state || join(dir, '.turnstile')) });
    }
    if (pathname === '/turnstile/designer') {
      if (req.method !== 'POST') return json(405, { error: 'method' });
      const planId = randomUUID();
      const auditDir = state || join(dir, '.turnstile');
      let dryRun = true;
      let started = false;
      try {
        let body = '';
        try { body = await readJsonText(req, 1e6); }
        catch (e) { if (e && e.code === 'BODY_TOO_LARGE') return json(413, { error: '请求体过大（上限 ' + e.limit + ' 字节）' }); return json(400, { error: 'body 读不到：' + String(e.message).slice(0, 80) }); }
        const args = JSON.parse(body || '{}');
        dryRun = args.dryRun !== false;
        const summary = Array.isArray(args.operations) ? args.operations.slice(0, 100).map((op) => ({ type: String(op?.type || ''), package: String(op?.package || ''), disable: typeof op?.disable === 'boolean' ? op.disable : undefined, anchor: typeof op?.anchor === 'string' ? op.anchor : undefined })) : [];
        beginOperation(auditDir, { planId, kind: 'designer', dryRun, target: 'cordis.patch.yml', workspace: String(args.workspace || 'default').slice(0, 80), operationCount: summary.length, operations: summary });
        started = true;
        const plugins = collectConsoleData(dir, { stateDir: state }).plugins;
        const result = designerTransaction(dir, args.operations, { dryRun, expected: args.expected }, plugins);
        settleOperation(auditDir, planId, dryRun ? 'previewed' : 'applied', { changed: result.changed });
        return json(200, { ...result, auditId: planId });
      } catch (e) {
        if (started) { try { settleOperation(auditDir, planId, 'failed', String(e?.message || e).slice(0, 180)); } catch {} }
        return json(e.status || 400, { error: String(e?.message || e).slice(0, 180), details: e.details || [], auditId: started ? planId : undefined });
      }
    }
    if (pathname === '/turnstile/toggle') {
      if (req.method !== 'POST') return json(405, { error: 'method' });
      try {
        let body = '';
        try { body = await readJsonText(req, 1e6); }
        catch (e) { if (e && e.code === 'BODY_TOO_LARGE') return json(413, { error: '请求体过大（上限 ' + e.limit + ' 字节）' }); return json(400, { error: 'body 读不到：' + String(e.message).slice(0, 80) }); }
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
    // 页面创作与独立控制台共用同一份模型、渲染器和导出器。
    const pageFile = join(state || join(dir, '.turnstile'), 'page-console.json');
    if (pathname === '/turnstile/builder') {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(readFileSync(join(pluginLib, 'builder.html'), 'utf8'));
      return;
    }
    if (pathname === '/turnstile/page-model.js' || pathname === '/turnstile/page-render.js' || pathname === '/turnstile/page-validate.js' || pathname === '/turnstile/tokens.css') {
      const name = pathname.slice('/turnstile/'.length);
      const raw = readFileSync(join(pluginLib, name), 'utf8');
      if (name.endsWith('.css')) {
        res.setHeader('content-type', 'text/css; charset=utf-8');
        res.setHeader('cache-control', 'no-store');
        res.end(raw);
        return;
      }
      const src = raw.replace(/^export\s+(?=(function|const|let|class))/gm, '');
      res.setHeader('content-type', 'text/javascript; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(src);
      return;
    }
    if (pathname === '/turnstile/page') {
      if (req.method === 'GET') {
        const got = readPage(pageFile);
        if (!got.exists) return json(200, { status: 'not-generated', file: pageFile, version: 0 });
        if (!got.page) return json(500, { error: '读不出页面文件：' + (got.error || '') });
        try { return json(200, Object.assign(got.page, { version: got.version })); }
        catch (e) { return json(500, { error: '读不出页面文件：' + String(e.message).slice(0, 120) }); }
      }
      if (req.method !== 'POST') return json(405, { error: 'method' });
      try {
        let body = '';
        try { body = await readJsonText(req, 2e6); }
        catch (e) { if (e && e.code === 'BODY_TOO_LARGE') return json(413, { error: '页面过大（上限 ' + e.limit + ' 字节）' }); return json(400, { error: 'body 读不到：' + String(e.message).slice(0, 80) }); }
        const parsed = JSON.parse(body || '{}');
        // 严格校验页面树：坏页面不能进渲染器，也不能落盘
        const tree = validatePageTree(parsed.page);
        if (!tree.ok) return json(400, { error: '页面不合法：' + tree.errors[0], errors: tree.errors });
        if (parsed.page?.schema !== 'mini/page@1' || !parsed.page.root || typeof parsed.page.root !== 'object') return json(400, { error: '页面缺少 mini/page@1 schema 或有效 root' });
        const wrote = writePage(pageFile, parsed.page, { baseVersion: parsed.baseVersion });
        if (!wrote.ok && wrote.needsVersion) return json(428, { error: '覆盖已有页面必须带 baseVersion', version: wrote.version, needsVersion: true });
        if (!wrote.ok) return json(409, { error: '页面已被其他地方修改（当前版本 ' + wrote.version + '）', version: wrote.version, stale: true });
        return json(200, { ok: true, file: pageFile, version: wrote.version });
      } catch (e) { return json(400, { error: String(e?.message || e).slice(0, 160) }); }
    }
    if (pathname === '/turnstile/export') {
      if (req.method !== 'POST') return json(405, { error: 'method' });
      try {
        let body = '';
        try { body = await readJsonText(req, 2e6); }
        catch (e) { if (e && e.code === 'BODY_TOO_LARGE') return json(413, { error: '页面过大（上限 ' + e.limit + ' 字节）' }); return json(400, { error: 'body 读不到：' + String(e.message).slice(0, 80) }); }
        const parsed = JSON.parse(body || '{}');
        const renderer = readFileSync(join(pluginLib, 'page-render.js'), 'utf8');
        const result = exportPlugin(parsed.page, join(state || join(dir, '.turnstile'), 'exports', String(parsed.name || '')), { name: parsed.name, renderer });
        const verification = await verifyExportedPlugin(result.outDir);
        return json(200, { ok: verification.ok, ...result, verification });
      } catch (e) { return json(400, { error: String(e?.message || e).slice(0, 180) }); }
    }
    if (pathname === '/turnstile/view') {
      const html = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>页面预览</title><style>body{margin:0;padding:20px;background:#0b1117;color:#e9eff4;font:13px/1.5 system-ui}main{max-width:1100px;margin:auto}.empty{color:#96a5b2}</style></head><body><main id="root"></main><script src="/turnstile/page-render.js"></script><script>fetch("/turnstile/page").then(function(r){return r.json()}).then(function(j){var root=document.getElementById("root");if(!j.root){root.innerHTML="<p class=empty>还没有保存的页面。</p>";return;}root.append(window.TurnstilePageRender.render(j.root));}).catch(function(e){document.getElementById("root").textContent="读取失败："+e.message;});</script></body></html>';
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(html);
      return;
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
      let parsed;
      try { parsed = await readJsonBody(req, { maxBytes: 1e6 }); }
      catch (e) {
        if (e && e.code === 'BODY_TOO_LARGE') return json(413, { error: '请求体过大（上限 ' + e.limit + ' 字节）' });
        return json(400, { error: 'body 不是 JSON：' + String(e.message).slice(0, 120) });
      }
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
        const hostBases = [];
        if (process.env.DSH_BIN) hostBases.push(process.env.DSH_BIN);
        const data = collectConsoleData(dir, { stateDir: state, hostBases });
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
  // --fixture：显式用可复现的假数据（e2e/演示用）；默认走真实工具，假数据不会无声出现。
  const useFixture = process.argv.includes('--fixture');
  const server = createConsoleServer({ profileDir, fixture: useFixture });
  server.listen(port, host, () => {
    const address = server.address();
    console.log('Turnstile console: http://' + host + ':' + address.port + '/');
    console.log('Profile: ' + profileDir + ' (changes require preview and confirmation)');
    console.log('Data: ' + (useFixture ? 'FIXTURE（假数据，仅供演示）' : 'real（真跑工具）'));
  });
  const close = () => server.close(() => process.exit(0));
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}
