// 修法：从通道结论推出「下一步做什么」。纯函数，CLI 与面板共用，避免两处各写一份。
//
// 规矩：每条修复必须带 rollback（回滚点），否则不允许输出——
// 今天出现过「给了个命令，但没说怎么退回去」的情况。

export const FIXES = Object.freeze({
  codex: {
    text: 'codex-cli 与 AA connector 协议不兼容：升级 AA 桌面端，或把 codex-cli 降回 AA 声明的版本',
    rollback: '无文件改动（只切版本）；降级前记下 codex --version',
  },
  ingest: {
    text: '检查出站：把 agents-anywhere.com 写入 NO_PROXY 后重启 AA（AA 是 Electron，改 shell 变量无效）',
    rollback: 'HKCU\\Environment\\NO_PROXY 删掉该域名，重启 AA',
  },
  dsh: {
    text: 'DSH 侧同步失败：确认 DSH 与插件版本一致，再看 AA 日志里是否有新的 sync.ack',
    rollback: '无文件改动',
  },
  'plugin-bridge': {
    text: '插件本地桥 PARSE_ERROR：插件与桌面端版本不匹配，装与 AA 同版本的插件',
    rollback: 'node_modules 里保留 .bak-sidebar 等备份后再升级',
  },
});

/** 只对 failing 的通道给修法；healthy / undetermined 不给。 */
export function actionsFor(channels) {
  const out = [];
  for (const ch of channels || []) {
    if (ch.verdict !== 'failing') continue;
    const fix = FIXES[ch.id];
    if (!fix) { out.push({ channel: ch.id, text: '未知通道，请人工判断', rollback: '无' }); continue; }
    out.push({ channel: ch.id, text: fix.text, rollback: fix.rollback });
  }
  return out;
}

/** undetermined 的通道要说明缺什么，不能沉默。 */
export function missingFor(channels) {
  return (channels || [])
    .filter((c) => c.verdict === 'undetermined')
    .map((c) => ({ channel: c.id, missing: c.missing || '证据不足' }));
}
