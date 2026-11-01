// Verify a generated page plugin in a minimal isolated host. This is not a real DSH/mini installation.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';

export async function verifyExportedPlugin(outDir) {
  const evidence = { ok: false, scope: 'isolated-module-host', realDsh: false, outDir, route: null, boots: [], checks: [] };
  const check = (name, ok, detail = '') => {
    evidence.checks.push({ name, ok: Boolean(ok), detail: String(detail) });
    return Boolean(ok);
  };
  try {
    const manifestFile = join(outDir, 'package.json');
    const entryFile = join(outDir, 'lib', 'index.js');
    const pageFile = join(outDir, 'lib', 'page.json');
    if (!check('manifest', existsSync(manifestFile), manifestFile)) return evidence;
    if (!check('entry', existsSync(entryFile), entryFile)) return evidence;
    if (!check('page', existsSync(pageFile), pageFile)) return evidence;
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
    const page = JSON.parse(readFileSync(pageFile, 'utf8'));
    check('schema', page.schema === 'mini/page@1' && page.root && typeof page.root === 'object');
    evidence.route = '/' + manifest.name;
    check('patch-declaration', manifest.dsh?.bundle?.patch === './cordis.patch.yml' && existsSync(join(outDir, 'cordis.patch.yml')));

    const boot = async (label) => {
      const routes = [];
      const moduleUrl = pathToFileURL(entryFile).href + '?turnstile-verify=' + encodeURIComponent(label + '-' + Date.now());
      const mod = await import(moduleUrl);
      const ctx = { effect: (fn) => { fn(); }, webServer: { register: (route) => routes.push(route) } };
      mod.apply(ctx);
      const route = routes.find((r) => r.path === evidence.route);
      check(label + '-route-registration', Boolean(route), routes.map((r) => r.path).join(', '));
      if (!route) return;
      const server = createServer((req, res) => {
        const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
        if (pathname !== route.path) { res.writeHead(404); res.end('not found'); return; }
        route.handler(req, res);
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      try {
        const response = await fetch('http://127.0.0.1:' + server.address().port + evidence.route);
        const html = await response.text();
        evidence.boots.push({ label, status: response.status, doctype: /<!DOCTYPE html>/i.test(html), renderer: html.includes('TurnstilePageRender') });
        check(label + '-http', response.status === 200 && /<!DOCTYPE html>/i.test(html) && html.includes('TurnstilePageRender'), 'status=' + response.status);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    };
    await boot('initial');
    await boot('fixture-restart');
    evidence.ok = evidence.checks.every((c) => c.ok) && evidence.boots.length === 2;
    return evidence;
  } catch (e) {
    check('exception', false, String(e?.message || e).slice(0, 180));
    return evidence;
  }
}
