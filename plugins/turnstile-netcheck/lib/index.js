import { runChecks } from './checks.js';

export const name = 'turnstile-netcheck';
export const inject = ['webServer'];

const PAGE = '/turnstile/netcheck';
const JSON_ROUTE = '/turnstile/netcheck.json';

function sendJson(res, body) {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: JSON_ROUTE,
    handler: async (req, res) => sendJson(res, await runChecks()),
  }), 'turnstile-netcheck: GET /turnstile/netcheck.json');

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: PAGE,
    handler: async (req, res) => {
      res.statusCode = 200;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(`<!doctype html><meta charset="utf-8"><title>DSH 直连网络检查</title><style>body{font:14px system-ui, sans-serif;max-width:760px;margin:32px auto;padding:0 18px;color:#24292f}h1{font-size:22px}.sub{color:#57606a;margin-bottom:18px}.row{display:grid;grid-template-columns:180px 1fr auto;gap:12px;padding:9px 0;border-bottom:1px solid #d0d7de}.ok{color:#1a7f37}.bad{color:#cf222e}.mono{font:12px ui-monospace,monospace;overflow-wrap:anywhere}.note{margin-top:18px;color:#57606a;font-size:12px}</style><h1>DSH 直连网络检查</h1><div class="sub">固定目标 · Node HTTPS 直连 · 不使用 Clash / sidecar</div><main id="app">检查中…</main><script>const app=document.querySelector('#app');fetch('/turnstile/netcheck.json').then(r=>r.json()).then(d=>{app.innerHTML='<div class="row"><b>总结果</b><span class="'+(d.ok?'ok':'bad')+'">'+(d.ok?'可用':'有失败项')+'</span><span>'+new Date(d.checkedAt).toLocaleTimeString()+'</span></div>'+d.results.map(x=>'<div class="row"><span>'+x.label+'</span><span class="'+(x.ok?'ok':'bad')+'">'+(x.ok?'HTTP '+x.statusCode:'失败')+(x.error?' · '+x.error:'')+'</span><span>'+(x.ms||0)+'ms · '+(x.address||'-')+'</span></div>').join('')+'<p class="note">本页只说明直连路径。代理端口在线不代表直连可用，反之亦然。</p>'}).catch(e=>{app.innerHTML='<p class="bad">检查器失败：'+e.message+'</p>'})</script>`);
    },
  }), 'turnstile-netcheck: GET /turnstile/netcheck');
}
