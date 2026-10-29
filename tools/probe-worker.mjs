// probe-worker.mjs — run ONE plugin against a stub ctx and report what it actually does.
// Spawned per plugin by tools/probe.mjs so a hang or crash cannot take the scan down.
// usage: node tools/probe-worker.mjs <entryFile> [exportName]
const entry = process.argv[2];
const exportName = process.argv[3] || '';
const provided = new Set();
const assigned = new Set();
const injected = new Set();
const events = new Set();
const IGNORED = new Set(['then', 'toJSON', 'inspect', 'constructor', 'prototype', 'hasOwnProperty', 'toString', 'valueOf']);

function makeStub() {
  const target = {
    provide(name) { if (typeof name === 'string') provided.add(name); return () => {}; },
    set(name) { if (typeof name === 'string') provided.add(name); },
    get(name) { if (typeof name === 'string') injected.add(name); return undefined; },
    on(name) { if (typeof name === 'string') events.add(name); return () => {}; },
    once() { return () => {}; },
    emit() { return false; },
    plugin() { return () => {}; },
    effect(fn) { try { if (typeof fn === 'function') { const d = fn(); return typeof d === 'function' ? d : () => {}; } } catch (e) { throw e; } return () => {}; },
    inject() { return undefined; },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    config: {},
  };
  return new Proxy(target, {
    get(t, prop) {
      if (typeof prop === 'symbol' || IGNORED.has(prop)) return t[prop];
      if (prop in t) return t[prop];
      injected.add(prop);
      return undefined;
    },
    set(t, prop, value) {
      if (typeof prop === 'string' && !(prop in t)) { assigned.add(prop); return true; }
      t[prop] = value; return true;
    },
  });
}

const report = (extra = {}) => {
  process.stdout.write(JSON.stringify({
    provided: [...provided].sort(),
    assigned: [...assigned].sort(),
    injected: [...injected].filter((n) => !provided.has(n)).sort(),
    events: [...events].sort(),
    ...extra,
  }));
  process.exit(0);
};

const tm = setTimeout(() => report({ timeout: true }), Number(process.env.PROBE_DEADLINE_MS || 6000));
tm.unref();

try {
  const mod = await import('file://' + entry.split(String.fromCharCode(92)).join('/'));
  const candidates = [];
  if (exportName && mod[exportName]) candidates.push(mod[exportName]);
  if (mod.apply) candidates.push(mod.apply);
  if (mod.default?.apply) candidates.push(mod.default.apply);
  if (mod.default && typeof mod.default === 'function') candidates.push(mod.default);
  if (!candidates.length) report({ noApply: true });
  const ctx = makeStub();
  for (const fn of candidates) {
    try { await fn(ctx, {}); break; } catch (e) {
      report({ applyError: String(e && e.message || e).slice(0, 160) });
    }
  }
  report();
} catch (e) {
  report({ importError: String(e && e.message || e).slice(0, 160) });
}
