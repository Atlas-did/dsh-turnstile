// S2 · 分类层：把 Record 映射到通道 + 信号，再聚合成通道结论。
//
// 两条规矩（都来自 2026-10-31 的真实错误）：
//   1. severity 与 failure 分开：`ingest request failed` 有 72 条 WARNING、40 条 ERROR；
//      按 level==='ERROR' 筛会漏掉整条通道。failure 由 signal 决定，不看 level。
//   2. 通道可以有历史：dsh 07:46–08:37Z 有 93 条 ERROR，之后 664 条 ack 恢复；
//      单值 verdict 会丢掉一半事实，所以给 history + lastFailureAt/recoveredAt。
//
// 纯函数，零 I/O：输入 Record[]，输出 Channel[]。

export const CHANNELS = Object.freeze({
  codex: 'codex',
  dsh: 'dsh',
  ingest: 'ingest',
  pluginBridge: 'plugin-bridge',
  backend: 'backend',
});

const FAILURE_SIGNALS = Object.freeze([
  'unknown-variant',        // codex 字段被拒（-32600）
  'ingest-failed',          // connector 上传失败（WARNING 或 ERROR 都算）
  'sync-interrupted',       // 同步中断重订阅
  'sync-failed',            // bridge.sync_failed
  'parse-error',            // 插件侧 JSON-RPC 解析失败
]);

/** 一条记录属于哪个通道、是什么信号。未知记录返回 channel=null（不猜）。 */
export function classify(record) {
  if (!record) return { channel: null, signal: null, severity: null };
  const name = String(record.name || '');
  const msg = String(record.message || '');
  const ex = JSON.stringify(record.exception || '');
  const hay = msg + ' ' + ex;
  const severity = record.level === 'error' ? 'error' : record.level === 'warn' || record.level === 'warning' ? 'warning' : 'info';

  if (/unknown variant/i.test(hay)) return { channel: CHANNELS.codex, signal: 'unknown-variant', severity };
  if (/ingest request failed|ingestSnapshot|authentication request failed/i.test(hay)) return { channel: CHANNELS.ingest, signal: 'ingest-failed', severity };
  if (/sync interrupted|resubscribing/i.test(hay)) return { channel: CHANNELS.ingest, signal: 'sync-interrupted', severity };
  if (/sync_failed|sync\.failed/i.test(hay)) return { channel: CHANNELS.dsh, signal: 'sync-failed', severity };
  if (record.eventCode === 'PARSE_ERROR') return { channel: CHANNELS.pluginBridge, signal: 'parse-error', severity };
  if (/dsh-bridge/.test(name)) return { channel: CHANNELS.dsh, signal: 'traffic', severity };
  if (/runtime_sync/.test(name)) return { channel: CHANNELS.dsh, signal: 'traffic', severity };
  if (/bridge\.host|meshcall/.test(name)) return { channel: CHANNELS.ingest, signal: 'traffic', severity };
  return { channel: null, signal: null, severity };
}

export function isFailure(signal) {
  return FAILURE_SIGNALS.includes(signal);
}

function span(list) {
  const ts = list.map((x) => x.ts).filter(Boolean).sort();
  return ts.length ? { from: ts[0], to: ts[ts.length - 1] } : null;
}

/**
 * 聚合。mode 决定作用域：
 *   'all'     集合内出现过失败即 failing（默认，见 docs/96 决策 9）
 *   'as-of'   以 asOf 时刻前的最后状态为准；无数据 → undetermined
 */
export function aggregate(records, { mode = 'all', asOf = null } = {}) {
  const byChannel = new Map();
  for (const r of records || []) {
    const c = classify(r);
    if (!c.channel) continue;
    if (!byChannel.has(c.channel)) byChannel.set(c.channel, []);
    byChannel.get(c.channel).push({ ...r, signal: c.signal, severity: c.severity });
  }

  const out = [];
  for (const [channel, list] of byChannel) {
    const failures = list.filter((x) => isFailure(x.signal)).sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    const history = failures.length
      ? [{ from: failures[0].ts, to: failures[failures.length - 1].ts, verdict: 'failing' }]
      : [];
    const lastFailureAt = failures.length ? failures[failures.length - 1].ts : null;
    const after = lastFailureAt ? list.filter((x) => x.ts && x.ts > lastFailureAt && !isFailure(x.signal)) : [];
    const recoveredAt = after.length ? after[after.length - 1].ts : null;
    let verdict;
    if (mode === 'as-of') {
      const before = asOf ? list.filter((x) => x.ts && x.ts <= asOf) : [];
      if (!before.length) verdict = 'undetermined';
      else {
        const lastFail = before.filter((x) => isFailure(x.signal)).map((x) => x.ts).sort().pop();
        const lastOk = before.filter((x) => !isFailure(x.signal) && x.ts).map((x) => x.ts).sort().pop();
        verdict = lastFail && (!lastOk || lastFail > lastOk) ? 'failing' : 'healthy';
      }
    } else {
      verdict = failures.length ? 'failing' : 'healthy';
    }
    out.push({
      id: channel,
      verdict,
      history,
      lastFailureAt,
      recoveredAt,
      counts: { records: list.length, failures: failures.length,
        bySeverity: { error: failures.filter((x) => x.severity === 'error').length, warning: failures.filter((x) => x.severity === 'warning').length },
        signals: failures.reduce((acc, x) => { acc[x.signal] = (acc[x.signal] || 0) + 1; return acc; }, {}) },
      span: span(list),
      missing: mode === 'as-of' && !list.length ? '该时点没有记录' : '',
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
