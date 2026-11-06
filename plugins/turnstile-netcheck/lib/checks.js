import https from 'node:https';
import dns from 'node:dns/promises';

// Keep this list deliberately fixed: the page is a diagnostic, not an open URL fetcher.
export const TARGETS = Object.freeze([
  { id: 'github-page', label: 'GitHub 仓库页', url: 'https://github.com/Atlas-did/dsh-turnstile' },
  { id: 'github-git', label: 'Git smart HTTP', url: 'https://github.com/Atlas-did/dsh-turnstile.git/info/refs?service=git-upload-pack' },
  { id: 'opencode', label: 'OpenCode', url: 'https://opencode.ai/' },
  { id: 'deepseek', label: 'DeepSeek API', url: 'https://api.deepseek.com/' },
]);

const REACHABLE = (code) => Number.isInteger(code) && code >= 200 && code < 500;

function directRequest(target, resolved, timeoutMs) {
  return new Promise((resolve) => {
    const parsed = new URL(target.url);
    const started = Date.now();
    const req = https.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: { 'user-agent': 'dsh-turnstile-netcheck/0.1', accept: '*/*' },
      agent: false,
      lookup: (_hostname, options, callback) => options && options.all
        ? callback(null, [resolved])
        : callback(null, resolved.address, resolved.family),
      servername: parsed.hostname,
      rejectUnauthorized: true,
    }, (res) => {
      res.resume();
      resolve({ ok: REACHABLE(res.statusCode), statusCode: res.statusCode || 0, ms: Date.now() - started, address: resolved.address });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('timeout'));
    });
    req.once('error', (error) => resolve({ ok: false, statusCode: 0, ms: Date.now() - started, address: resolved.address, error: error.message }));
    req.end();
  });
}

export async function checkTarget(target, { lookup = dns.lookup, request = directRequest, timeoutMs = 8000 } = {}) {
  const started = Date.now();
  let address;
  try {
    const result = await lookup(new URL(target.url).hostname, { all: true, verbatim: true });
    address = Array.isArray(result) ? result : [result];
    address = address.filter((item) => item && item.address).sort((a, b) => a.family - b.family);
    if (!address.length) throw new Error('DNS returned no addresses');
  } catch (error) {
    return { id: target.id, label: target.label, url: target.url, ok: false, phase: 'dns', ms: Date.now() - started, error: error.message };
  }
  let lastError = null;
  let lastResult = null;
  for (const candidate of address) {
    try {
      const result = await request(target, candidate, timeoutMs);
      lastResult = result;
      if (result.ok) return { id: target.id, label: target.label, url: target.url, phase: 'https', ...result };
      lastError = result.error || new Error('HTTP ' + result.statusCode);
    } catch (error) { lastError = error; }
  }
  return { id: target.id, label: target.label, url: target.url, ok: false, phase: 'https', statusCode: lastResult?.statusCode || 0, ms: Date.now() - started, address: address.map((item) => item.address), error: lastError && lastError.message ? lastError.message : String(lastError || 'request failed') };
}

export async function runChecks({ targets = TARGETS, ...options } = {}) {
  const results = await Promise.all(targets.map((target) => checkTarget(target, options)));
  return { schema: 'turnstile/netcheck@1', direct: true, checkedAt: new Date().toISOString(), ok: results.every((result) => result.ok), results };
}
