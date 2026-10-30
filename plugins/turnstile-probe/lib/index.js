// Runtime probe: the ONLY place where we look at live loader state instead of guessing from files.
// It never throws: a probe that breaks boot is worse than no probe.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const name = 'turnstile-probe';
export const inject = ['webServer'];

function snapshot(ctx) {
  const out = { at: new Date().toISOString(), pid: process.pid, node: process.version, entries: [] };
  try {
    const rows = [...ctx.loader.entries()];
    out.total = rows.length;
    out.entries = rows.map((row) => {
      let state = null;
      let uid = null;
      let err = null;
      try {
        state = row.fiber ? String(row.fiber.state) : null;
        uid = row.fiber && row.fiber.uid != null ? String(row.fiber.uid) : null;
      } catch (e) { err = String((e && e.message) || e).slice(0, 80); }
      return {
        id: row.options && row.options.id ? String(row.options.id) : '?',
        name: row.options && row.options.name ? String(row.options.name) : '',
        state, uid, error: err,
        disabled: Boolean(row.disabled),
        active: Boolean(uid),
      };
    });
    out.active = out.entries.filter((e) => e.active).length;
    out.inactive = out.entries.filter((e) => !e.active).map((e) => e.id);
  } catch (e) {
    out.error = String((e && e.message) || e).slice(0, 160);
  }
  return out;
}

export function apply(ctx, config) {
  const profile = (config && config.profile) || 'mini';
  const stateDir = process.env.DSH_TURNSTILE_STATE || join(process.env.DSH_HOME || process.cwd(), 'turnstile-state');
  const write = (snap) => {
    try {
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(join(stateDir, 'runtime-' + profile + '.json'), JSON.stringify(snap, null, 2) + '\n');
      return true;
    } catch { return false; }
  };
  // Tool stream: session events carry tool/call and tool/result. Observe only, never intercept.
  const toolLog = [];
  try {
    ctx.on('session/event', (subject, event) => {
      try {
        const type = event && event.type;
        if (type !== 'tool/call' && type !== 'tool/result') return;
        const d = (event && event.data) || {};
        toolLog.push({
          type,
          tool: String(d.name || d.tool || d.toolName || '?'),
          atUptime: Number(process.uptime().toFixed(3)),
        });
        if (toolLog.length > 200) toolLog.shift();
      } catch { /* never break a session */ }
    });
  } catch { /* ignore */ }

  // Controlled experiment: record which services get provided at runtime. The wrapper only
  // observes AFTER the real call succeeds, so a failure here cannot change behaviour.
  const providedLog = [];
  try {
    const originalProvide = ctx.provide;
    if (typeof originalProvide === 'function' && !originalProvide.__turnstileWrapped) {
      const wrapped = function provide(serviceName, ...rest) {
        const result = originalProvide.call(this, serviceName, ...rest);
        let by = '';
        try {
          const stack = new Error().stack || '';
          // Skip our own frames: the first node_modules hit is the probe itself.
          const matches = [...stack.matchAll(/node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/g)]
            .map((m) => m[1].split(String.fromCharCode(92)).join('/'))
            .filter((name) => name.indexOf('turnstile-probe') === -1 && name !== '@deepseek-ai/cordis');
          // cordis appears in every stack; prefer the plugin frame beneath it.
          by = matches.length ? matches[0] : '';
        } catch { /* ignore */ }
        try { providedLog.push({ service: String(serviceName), by, atUptime: Number(process.uptime().toFixed(3)) }); } catch { /* ignore */ }
        return result;
      };
      wrapped.__turnstileWrapped = true;
      ctx.provide = wrapped;
    }
  } catch { /* a probe must never break boot */ }

  const bootAt = ctx ? snapshot(ctx) : {};
  const bootIds = new Set((bootAt.entries || []).filter((e) => e.active).map((e) => e.id));
  const appliedAtUptime = process.uptime();
  const bootSnapshot = {
    at: new Date().toISOString(),
    pid: process.pid,
    // How far into the process lifetime this plugin was applied — a cheap boot-time probe.
    appliedAtUptimeSeconds: Number(appliedAtUptime.toFixed(3)),
    entries: bootAt.entries || [],
    total: bootAt.total || 0,
    active: bootAt.active || 0,
    inactive: bootAt.inactive || [],
  };

  const snap = snapshot(ctx);
  snap.profile = profile;
  snap.stateDir = stateDir;
  snap.appliedAtUptimeSeconds = bootSnapshot.appliedAtUptimeSeconds;
  // Rows that were inert at apply time but have a fiber now: deferred activation, not failure.
  snap.activatedSinceBoot = (snap.entries || [])
    .filter((e) => e.active && !bootIds.has(e.id))
    .map((e) => e.name || e.id);
  snap.bootActive = bootIds.size;
  snap.providedAtRuntime = providedLog.slice();
  snap.toolStream = toolLog.slice(-50);
  snap.written = write(snap);

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/turnstile/runtime',
    handler: async (req, res) => {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      const now = snapshot(ctx);
      now.profile = profile;
      now.providedAtRuntime = providedLog.slice();
      now.toolStream = toolLog.slice(-50);
      now.appliedAtUptimeSeconds = bootSnapshot.appliedAtUptimeSeconds;
      now.activatedSinceBoot = (now.entries || []).filter((e) => e.active && !bootIds.has(e.id)).map((e) => e.name || e.id);
      write(now);
      res.end(JSON.stringify(now));
    },
  }), 'turnstile-probe: GET /turnstile/runtime');
}
