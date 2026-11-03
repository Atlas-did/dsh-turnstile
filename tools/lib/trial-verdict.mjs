'use strict';
// 试装结论映射（纯函数）：latest 记录 + 宿主证据校验 → verdict / claim / summary。
// 这块以前埋在 CLI 中间，措辞一改测试就红（static-pass → static-only 那次），所以单独锁住。
export const LADDER = ['static-only', 'loaded', 'routable', 'verified', 'verified-with-regression'];

export function trialVerdict({ latest, hostLatest, hostCheck, file }) {
  const failed = Boolean(latest && (latest.verdict === 'fail' || latest.verdict === 'blocked'));
  const ladderClaim = latest && LADDER.includes(latest.verdict) ? latest.verdict : null;
  const loaded = Boolean(latest && !failed && hostCheck && hostCheck.ok);
  const verdict = !latest ? 'unknown' : failed ? 'fail' : loaded ? 'ok' : 'warn';
  const errors = (hostCheck && hostCheck.errors) || [];
  const summary = !latest ? '还没有试装记录'
    : failed ? '最近一次试装未通过：' + (latest.note || latest.verdict)
    : loaded ? '真实宿主重启与目标路由证据通过：' + latest.target + ' ' + (hostLatest && hostLatest.evidence && hostLatest.evidence.route && hostLatest.evidence.route.path) + '=200'
    : hostLatest && !hostCheck.ok ? '宿主证据未通过关联校验：' + errors.join('；')
    : latest.verdict === 'static-pass' || latest.verdict === 'static-only' ? '最近一次试装仅静态通过；真实宿主插件加载未验证'
    : ladderClaim ? '六级结论 ' + ladderClaim + '（加载层用 dump-config 判定，未采真实宿主证据）'
    : '最近一次试装记录为 ' + latest.verdict + '；请核对是否包含真实宿主加载证据';
  const claim = !latest ? 'unknown' : failed ? 'failed' : (ladderClaim || (loaded ? 'verified-with-regression' : 'static-only'));
  return { failed, loaded, verdict, claim, summary, ladderClaim, exitCode: verdict === 'fail' ? 1 : verdict === 'warn' ? 2 : 0, source: file };
}
