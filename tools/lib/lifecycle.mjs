'use strict';
// 插件身份与安装后生命周期（上游研究的第 1 批）。
// 原则：不建第二套全量事实库。这里只把已有事实（package.json / 磁盘安装 / 宿主启动）
// 分成不同来源并如实记录，缺依据时返回 unknown，绝不猜。
export const LIFECYCLE_SCHEMA = 'turnstile/lifecycle@1';

// 稳定身份只由包名决定：行 id、版本、显示名都会变，不能拿来当身份。
export function stableIdFor(packageName) {
  const name = String(packageName || '').trim().toLowerCase();
  return name ? 'plugin:' + name : '';
}

export function facts({ packageName, declaredVersion, installedVersion, enabled, bootId, observedBootId, sourceState }) {
  const declared = String(declaredVersion || '') || null;
  const installed = String(installedVersion || '') || null;
  const sameBoot = Boolean(bootId) && Boolean(observedBootId) && String(bootId) === String(observedBootId);
  // 「配置写了」「磁盘装了」「重启了」「运行时真加载了」是四个不同事实
  const pendingRestart = Boolean(bootId) && Boolean(observedBootId) && !sameBoot;
  const loadState = installed === null ? 'not-installed'
    : (observedBootId ? (sameBoot ? 'observed-this-boot' : 'observed-previous-boot') : 'never-observed');
  return {
    schema: LIFECYCLE_SCHEMA,
    stableId: stableIdFor(packageName),
    packageName: String(packageName || '') || null,
    version: { declared, installed, mismatch: Boolean(declared && installed && declared !== installed) },
    enabled: enabled === undefined ? null : Boolean(enabled),
    boot: { bootId: bootId ? String(bootId) : null, observedBootId: observedBootId ? String(observedBootId) : null, sameBoot },
    pendingRestart,
    loadState,
    // 上游目录状态：absent 只是「没看到」，不是「该删」
    sourceState: sourceState === 'current' || sourceState === 'delisted' ? sourceState : 'unknown',
  };
}

// 身份比较：能否确认是同一个插件？只回答「同一个 / 疑似改名 / 不是同一个」，绝不合并历史。
export function compareIdentity(prev, next) {
  const a = prev && prev.stableId ? prev : null;
  const b = next && next.stableId ? next : null;
  if (!a || !b) return { verdict: 'unknown', merged: false, evidence: ['缺少稳定身份，无法比较'] };
  if (a.stableId === b.stableId) return { verdict: 'same', merged: false, evidence: ['包名一致：' + a.packageName] };
  const evidence = [];
  const ra = new Set(prev.rowIds || []);
  const sharedRows = (next.rowIds || []).filter((r) => ra.has(r));
  if (sharedRows.length) evidence.push('共用 profile 行：' + sharedRows.join(', '));
  if (prev.version && next.version && prev.version.installed && prev.version.installed === next.version.installed) evidence.push('安装版本相同：' + prev.version.installed);
  // 即使证据指向改名，也只报告「疑似」，由人确认；自动合并会伪造历史
  return {
    verdict: evidence.length ? 'suspected-rename' : 'different',
    merged: false,
    evidence: evidence.length ? evidence : ['包名、行、版本都不重合'],
  };
}

// 待重启判断：只看「最后一次已应用的写操作」和「当前宿主启动身份」。
// 语义：写入发生在本次启动之后 → 宿主还没加载它 → pendingRestart=true；写入早于本次启动 → 已重启 → false。
// 缺 applyBootId（旧记录）或当前身份未知 → null，不猜。
export function restartState({ entries, currentBootId } = {}) {
  const applied = (Array.isArray(entries) ? entries : [])
    .filter((e) => e && e.status === 'applied')
    .sort((a, b) => String(a.settledAt || a.at || '').localeCompare(String(b.settledAt || b.at || '')));
  const last = applied[applied.length - 1] || null;
  if (!last) return { pendingRestart: null, reason: '没有已应用的写操作记录' };
  if (!last.bootId) return { pendingRestart: null, reason: '记录里没有 applyBootId，无法判断是否已重启' };
  if (!currentBootId) return { pendingRestart: null, reason: '当前宿主身份未知' };
  if (String(last.bootId) === String(currentBootId)) return { pendingRestart: true, reason: '写入发生在本次启动之后：宿主还没加载它' };
  return { pendingRestart: false, reason: '写入早于本次启动：宿主已重启' };
}

// 上游消失时的处置：已安装的只警告，未安装的才从目录消失（HACS 的保守策略）
export function onSourceMissing(record) {
  const installed = Boolean(record && record.version && record.version.installed);
  return {
    keepLocal: installed,
    sourceState: 'delisted',
    action: installed ? 'warn' : 'drop-from-catalog',
    reason: installed ? '本机仍安装，上游下架不等于删除' : '未安装，可以从目录移除',
  };
}
