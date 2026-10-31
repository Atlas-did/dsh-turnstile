// Checks for the setup steps a beginner tutorial walks through, in the order the tutorial hits them:
// account/model, plugin market, bridge endpoint, credentials, engine gate, login records.
//
// Each check returns { id, level, message, next } so the caller can print a fix, not just a verdict.
// Pure where it can be: the rule is testable without a real DSH install.

const MIN = 60 * 1000;

/** The bridge writes endpoint.json when it starts; a stale file means the bridge is not running. */
export function checkBridge({ path, exists, mtimeMs, now = Date.now(), maxAgeMs = 10 * MIN }) {
  if (!path) return { id: 'bridge', level: 'skip', message: '没有配置 AA 桥接路径', next: '' };
  if (!exists) {
    return { id: 'bridge', level: 'fail', message: 'AA 一直显示“等待本地 bridge”：endpoint.json 不存在',
      next: 'dsh plugin --profile desktop add @agents-anywhere/dsh-bridge-next' };
  }
  const age = now - Number(mtimeMs || 0);
  if (age > maxAgeMs) {
    return { id: 'bridge', level: 'warn', message: 'endpoint.json 已 ' + Math.round(age / MIN) + ' 分钟没更新，桥接可能没在跑',
      next: '重启 DSH，并确认 AA 桌面端在同一台机器上运行' };
  }
  return { id: 'bridge', level: 'pass', message: 'endpoint.json 新鲜（' + Math.round(age / 1000) + ' 秒前）', next: '' };
}

/**
 * Which credential keys are present. Only names are returned - never values.
 * The tutorial asks for `agnes-api-key`; a missing key is why image generation silently fails.
 */
export function checkCredentials({ exists, keys, required = ['agnes-api-key'] }) {
  if (!exists) return { id: 'credentials', level: 'fail', message: '凭据文件不存在', next: '在 DSH 里登录一次以生成 ~/.dsh/.credentials.yaml' };
  const have = new Set(Array.isArray(keys) ? keys : []);
  const missing = required.filter((k) => !have.has(k));
  if (missing.length) {
    return { id: 'credentials', level: 'warn', message: '缺少凭据键：' + missing.join(', ') + '（生图/生视频会失败）',
      next: '把 key 写进 DSH 凭据（键名 ' + missing[0] + '）或 .env，然后重启客户端' };
  }
  return { id: 'credentials', level: 'pass', message: '需要的凭据键都在', next: '' };
}

/** A plugin row that exists but is disabled is the classic "装好了怎么没反应". */
export function checkPluginEnabled({ name, installed, disabled }) {
  if (!installed) return { id: 'plugin:' + name, level: 'fail', message: name + ' 未安装', next: 'dsh plugin --profile desktop add ' + name };
  if (disabled) return { id: 'plugin:' + name, level: 'warn', message: name + ' 已安装但被停用', next: '在控制台里启用，或 node tools/manage.mjs <profile> --enable ' + name + ' --yes' };
  return { id: 'plugin:' + name, level: 'pass', message: name + ' 已安装并启用', next: '' };
}

export function summarize(results) {
  const list = Array.isArray(results) ? results : [];
  const count = (l) => list.filter((r) => r.level === l).length;
  return { pass: count('pass'), warn: count('warn'), fail: count('fail'), skip: count('skip'), total: list.length };
}

if (typeof window !== 'undefined') window.TurnstileSetupChecks = { checkBridge, checkCredentials, checkPluginEnabled, summarize };
