'use strict';
import { stateFromLayer, phaseForLevel } from './check-phase.mjs';
// 验证分级（P1.0）：把「试装通过」拆成六层，谁都不能再拿 L0 冒充「可用」。
//   L0 静态检查   清单/依赖/配置/源码
//   L1 文件层     预期文件与配置确实写入
//   L2 加载层     重启后宿主确实组合/加载了它
//   L3 路由层     声明的路由真实可访问
//   L4 UI 层      页面里真的出现预期内容
//   L5 回归层     原有插件与界面没坏

export const LEVELS = [
  { id: 'L0', name: '静态检查', proves: '清单、依赖、配置、源码没有已知问题' },
  { id: 'L1', name: '文件层', proves: '预期文件与配置确实写入磁盘' },
  { id: 'L2', name: '加载层', proves: '重启后宿主确实组合了这一行（dump-config 里有它）' },
  { id: 'L3', name: '路由层', proves: '插件声明的路由真实可访问' },
  { id: 'L4', name: 'UI 层', proves: '预期内容真的出现在页面里' },
  { id: 'L5', name: '回归层', proves: '原有插件与主要界面没有因此坏掉' },
];

export const STATUS = { pass: 'pass', fail: 'fail', skip: 'skip', unknown: 'unknown' };


/** 每一层的结果：{level,status,evidence[],note} */
export function layer(id, status, evidence, note) {
  return { level: id, status, state: stateFromLayer(status), phase: phaseForLevel(id), evidence: (evidence || []).filter(Boolean).slice(0, 6), note: note || '' };
}

/** 只认「连续通过的最高层」：中间断了，后面再绿也不算数。 */
export function reached(layers) {
  let deepest = null;
  for (const l of LEVELS) {
    const got = layers.find((x) => x.level === l.id);
    if (!got || got.status !== STATUS.pass) break;
    deepest = l.id;
  }
  return deepest;
}

/** 人能听懂的结论——这是本模块存在的理由。 */
export function claimOf(layers, opts = {}) {
  const deep = reached(layers);
  const map = {
    L0: { code: 'static-only', text: '静态检查通过，尚未验证真实运行——不能据此认为插件可用。' },
    L1: { code: 'static-only', text: '文件已写入，尚未重启验证加载——仍不能认为可用。' },
    L2: { code: 'loaded', text: '宿主重启后确实加载了它，但还没有验证路由与界面。' },
    L3: { code: 'routable', text: '路由真实可访问，但界面内容未验证。' },
    L4: { code: 'verified', text: '加载、路由、界面都有真实证据；未做回归对比前仍不排除影响别人。' },
    L5: { code: 'verified-with-regression', text: '六层全部通过：加载、路由、界面可见，且原有功能未回归。' },
  };
  const firstFail = layers.find((x) => x.status === STATUS.fail);
  if (firstFail) {
    const name = LEVELS.find((l) => l.id === firstFail.level).name;
    const why = firstFail.evidence.length ? '（' + firstFail.evidence[0].slice(0, 60) + '）' : '';
    const proved = deep ? '只验到「' + map[deep].code + '」这一步，' : '没有任何一层通过，';
    return { code: 'failed', text: '不能认为可用：' + proved + name + '失败' + why + '。' };
  }
  if (!deep) return { code: 'unknown', text: '数据不足：没有任何一层给出证据。' };
  // L5 通过但没做基线对比（只看了 health）→ 不能宣称「回归已验证」
  if (deep === 'L5' && opts.regressionComplete === false) {
    return { code: 'verified', text: '加载、路由、界面都有真实证据，健康检查也通过；但**没有做装前基线对比**，不能声称回归已验证。' };
  }
  return map[deep];
}

/** 统一契约整形用：verdict 由层级推出来，不让调用方自己编。 */
export function verdictOf(layers) {
  if (layers.some((l) => l.status === STATUS.fail)) return 'fail';
  const deep = reached(layers);
  if (!deep) return 'unknown';
  if (deep === 'L5' || deep === 'L4') return 'ok';
  return 'warn';
}

export function renderReport({ pkg, profile, layers, claim, verdict }) {
  return {
    pkg, profile, verdict,
    claim: claim.code, claimText: claim.text, deepest: reached(layers),
    levels: layers,
    summary: pkg + '：' + claim.text,
  };
}
