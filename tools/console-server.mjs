#!/usr/bin/env node
// Local full-window console. No framework and no external CDN assets.
// npm run dev -- --host 127.0.0.1 --port 7100 --profile tests/console-fixture
import { createServer } from 'node:http';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectConsoleData } from './console-data.mjs';
import { togglePatch } from './toggle-patch.mjs';
import { designerTransaction } from './designer-ops.mjs';
import { readViewState, writeViewState } from '../plugins/turnstile-popup/lib/view-state.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const consoleFile = join(root, 'plugins', 'turnstile-popup', 'lib', 'console.html');
const designerFile = join(root, 'plugins', 'turnstile-popup', 'lib', 'console-designer.js');

export function createConsoleServer({ profileDir, stateDir } = {}) {
  const dir = resolve(profileDir || join(root, 'tests', 'console-fixture'));
  const state = stateDir || (dir.includes(join('tests', 'console-fixture')) ? join(dir, '.turnstile') : undefined);
  return createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    const json = (code, value) => { res.statusCode = code; res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(value)); };
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
