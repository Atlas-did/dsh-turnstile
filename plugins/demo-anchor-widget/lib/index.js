// Minimal lab plugin: proves that `anchor` from the patch row actually moves something.
// Host side: expose the configured anchor over HTTP so the client half needs no config plumbing.
import { join } from 'node:path';

export const name = 'demo-anchor-widget';
export const inject = ['webServer'];

export function apply(ctx, config) {
  const anchor = (config && config.anchor) || '';
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/demo-anchor/config',
    handler: async (req, res) => {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ anchor }));
    },
  }), 'demo-anchor: GET /demo-anchor/config');
}
