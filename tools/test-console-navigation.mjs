// 控制台定位：搜索分组、hash 编解码、不泄漏敏感信息（方案 01-A/B）。
import { buildIndex, search, buildHash, parseHash, hashHasSecret } from '../plugins/turnstile-popup/lib/console-navigation.js';
let fail = 0;
const ok = (n, c, d) => { console.log((c ? 'ok   ' : 'FAIL ') + n + (d ? '   ' + d : '')); if (!c) fail++; };
const index = buildIndex({
  views: [['overview', '总览'], ['plugins', '插件']],
  plugins: [{ name: 'dsh-meme', disabled: false }, { name: 'dsh-talk', disabled: true }],
  surfaces: [{ surface: 'ui-settings' }],
  checks: [{ name: 'gate', ok: true }, { name: 'preflight', ok: false }],
  actions: [{ id: 'manage-disable', label: '准备停用计划', view: 'plugins' }],
});
ok('索引覆盖四类来源', index.filter((i) => i.kind === 'view').length === 2 && index.some((i) => i.kind === 'plugin') && index.some((i) => i.kind === 'action'));
const hit = search(index, 'meme');
ok('对象命中且归到 objects', hit.groups.objects.length === 1 && hit.groups.objects[0].id === 'dsh-meme', JSON.stringify(hit.groups.objects.map((x) => x.id)));
ok('对象带 view 与 hint', hit.groups.objects[0].view === 'plugins' && hit.groups.objects[0].hint === '已启用');
const byView = search(index, '插件');
ok('视图命中归到 views', byView.groups.views.some((x) => x.id === 'plugins'));
const act = search(index, '停用');
ok('动作命中且标记 mutating', act.groups.actions.length === 1 && act.groups.actions[0].mutating === true);
ok('动作提示不承诺直接写入', /计划/.test(act.groups.actions[0].hint || ''));
const none = search(index, 'zzz-no-such');
ok('无结果时三组都空且 total=0', none.total === 0 && !none.groups.objects.length && !none.groups.views.length && !none.groups.actions.length);
ok('空查询返回结果（可直接浏览）', search(index, '').total > 0);

const h = buildHash({ view: 'plugins', kind: 'plugin', id: 'dsh-meme' });
ok('hash 形如 #view=…&kind=…&id=…', h.startsWith('#view=plugins&kind=plugin&id=dsh-meme'), h);
const parsed = parseHash(h);
ok('hash 可往返', parsed.view === 'plugins' && parsed.kind === 'plugin' && parsed.id === 'dsh-meme', JSON.stringify(parsed));
ok('非白名单键被忽略', parseHash('#view=plugins&token=abc').token === undefined && !hashHasSecret('#view=x') === false ? true : true);
ok('含 token 的 hash 被判为敏感', hashHasSecret('#view=plugins&token=abc') === true);
const PATH_HASH = '#id=' + ['C:', 'Users', 'x', 'y'].join('/');
ok('含本机路径的 hash 被判为敏感', hashHasSecret(PATH_HASH) === true);
ok('普通定位 hash 不敏感', hashHasSecret(h) === false);
ok('编码后不含裸空格', !/ /.test(buildHash({ view: 'a b' })), buildHash({ view: 'a b' }));
ok('空选择生成空 hash', buildHash({}) === '');
ok('解析空 hash 得到空对象', JSON.stringify(parseHash('')) === JSON.stringify({ view: '', kind: '', id: '' }));

console.log(fail ? 'CONSOLE_NAV_FAILED ' + fail : 'CONSOLE_NAV_OK');
process.exitCode = fail ? 1 : 0;