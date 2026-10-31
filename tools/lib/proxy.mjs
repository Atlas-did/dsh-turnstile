// NO_PROXY 是否真的生效：持久化 ≠ 生效。
//
// 2026-10-31 的事实：AA 的 ingest 被代理掐断，把 agents-anywhere.com 写进用户环境变量后 AA 恢复正常。
// 但「写进去了」和「跑着的进程读到了」是两件事——Electron 只在启动时读环境变量。
// 这个模块只做判定，不写注册表（写操作留给用户或显式命令）。

export function parseNoProxy(value) {
  return String(value || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** 支持精确域名、前导点、以及 * 通配（按段匹配）。 */
export function covers(entries, host) {
  const h = String(host || '').toLowerCase();
  if (!h) return false;
  for (const raw of entries || []) {
    const e = raw.replace(/^\./, '');
    if (e === h) return true;
    if (e.endsWith('.' + h)) return true;           // .anything.example.com 覆盖其它层级
    if (h.endsWith('.' + e)) return true;           // example.com 覆盖 api.example.com
    if (e.includes('*')) {
      const rx = new RegExp('^' + e.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
      if (rx.test(h)) return true;
    }
  }
  return false;
}

/**
 * 三态判定：用户级持久化值 / 当前进程值。
 * 关键区分：persisted 但 process 没有 → 进程需要重启才生效。
 */
export function checkNoProxy({ host, userValue, processValue }) {
  const userHas = covers(parseNoProxy(userValue), host);
  const procHas = covers(parseNoProxy(processValue), host);
  if (procHas) return { id: 'no-proxy', level: 'pass', message: host + ' 已在当前进程的 NO_PROXY 里', next: '' };
  if (userHas) {
    return { id: 'no-proxy', level: 'warn',
      message: host + ' 已写入用户环境变量，但当前进程没有读到（Electron 只在启动时读）',
      next: '完全退出并重启该进程（AA / DSH）后才会生效' };
  }
  return { id: 'no-proxy', level: 'warn',
    message: host + ' 不在 NO_PROXY 里，走代理时可能被掐断',
    next: 'setx NO_PROXY "%NO_PROXY%,' + host + '" 然后重启进程（或把它加进进程自己的配置）' };
}
