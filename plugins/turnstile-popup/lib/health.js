// One-shot health scan: the checks a beginner needs, aggregated into one list the console can show.
// Every refused or doubtful item carries `next` (a command or a click), because a red dot without a fix
// is just anxiety.

export function item(id, level, message, next) {
  return { id, level, message, next: next || '' };
}

/** credentials: only key names are ever inspected, never values. */
export function credentialsItem({ exists, keys, required }) {
  const req = required && required.length ? required : ['agnes-api-key'];
  if (!exists) return item('credentials', 'fail', '凭据文件不存在（还没登录过）', '在 DSH 里登录一次');
  const have = new Set(Array.isArray(keys) ? keys : []);
  const missing = req.filter((k) => !have.has(k));
  if (missing.length) return item('credentials', 'warn', '缺少凭据键：' + missing.join(', '), '把凭据写进 ~/.dsh/.credentials.yaml 后重启客户端');
  return item('credentials', 'pass', '需要的凭据键都在');
}

export function bridgeItem({ exists, mtimeMs, now, maxAgeMs }) {
  const max = maxAgeMs || 10 * 60 * 1000;
  if (!exists) return item('bridge', 'fail', 'AA 卡在「等待本地 bridge」：endpoint.json 不存在', 'dsh plugin --profile desktop add @agents-anywhere/dsh-bridge-next');
  const age = (now || Date.now()) - Number(mtimeMs || 0);
  if (age > max) return item('bridge', 'warn', 'endpoint.json ' + Math.round(age / 60000) + ' 分钟没更新，桥接可能没在跑', '重启 DSH 与 AA 桌面端');
  return item('bridge', 'pass', '桥接端点新鲜');
}

export function pluginItem({ name, installed, disabled }) {
  if (!installed) return item('plugin:' + name, 'fail', name + ' 未安装', 'dsh plugin --profile desktop add ' + name);
  if (disabled) return item('plugin:' + name, 'warn', name + ' 已安装但被停用', '在控制台启用，或 manage.mjs --enable ' + name);
  return item('plugin:' + name, 'pass', name + ' 已安装并启用');
}

export function engineItem({ skipped, runtime }) {
  const list = Array.isArray(skipped) ? skipped : [];
  if (!list.length) return item('engines', 'pass', '没有插件被引擎闸门拦下' + (runtime ? '（' + runtime + '）' : ''));
  return item('engines', 'warn', '被引擎闸门拦下：' + list.join(', '), '装作者支持当前版本的新版本，或换 harness 版本');
}

export function authItem({ total, limit }) {
  const lim = Number(limit) || 60;
  if (total === null || total === undefined) return item('auth', 'skip', '登录记录数读不到（DSH 正在运行，库被锁）', '完全退出 DSH 后再体检');
  if (total >= lim) return item('auth', 'fail', '登录记录 ' + total + ' 条，已达上限（' + lim + '）', 'node tools/auth-records.mjs --prune');
  return item('auth', 'pass', '登录记录 ' + total + ' 条，在 ' + lim + ' 以内');
}

export function summarize(items) {
  const list = Array.isArray(items) ? items : [];
  const count = (l) => list.filter((r) => r.level === l).length;
  return { pass: count('pass'), warn: count('warn'), fail: count('fail'), skip: count('skip'), total: list.length };
}

if (typeof window !== 'undefined') window.TurnstileHealth = { item, credentialsItem, bridgeItem, pluginItem, engineItem, authItem, summarize };
