// 三个「今天真踩过」的坑，做成可复跑的检查：
//   1. 双市场：我按教程装了第二个市场，而你本来就有 dshmarket。
//   2. git 依赖：一个 git+https 依赖让整个 pnpm 安装失败，我只能 npm pack + 手工拷贝。
//   3. client bundle 加载失败：`Unexpected token '}'` 至今没定位到文件，因为没人按 DSH 的注入方式解析过。
//
// 三条都返回 { id, level, message, next }，非通过项必须带 next。
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

export const MARKET_PATTERN = /(^|[/@])(dsh-market|dshmarket|plugin-market|dsh-market-place)$/i;

/** 1. 同一个 profile 里出现多个「插件市场」包 → 侧栏会重复入口。 */
export function duplicateMarkets(packages) {
  const markets = (packages || []).filter((p) => MARKET_PATTERN.test(String(p.name || '')));
  if (markets.length > 1) {
    return { id: 'pit:duplicate-market', level: 'warn',
      message: '装了 ' + markets.length + ' 个插件市场：' + markets.map((m) => m.name).join(', '),
      next: '只保留一个（pnpm remove 其余 + 从 dsh.profile.bundles 删掉）' };
  }
  return { id: 'pit:duplicate-market', level: 'pass', message: markets.length ? '只有 1 个插件市场' : '没有插件市场（可选装）', next: '' };
}

/** 2. git+https 依赖需要联网 fetch；代理不通时整条 pnpm 安装失败。 */
export function gitDependencies(deps) {
  const list = Object.entries(deps || {}).filter(([, v]) => /^(git\+|github:|gitlab:|https:\/\/github\.com\/)/.test(String(v)));
  if (list.length) {
    return { id: 'pit:git-dependency', level: 'warn',
      message: list.length + ' 个 git 依赖会让 pnpm 安装依赖网络：' + list.map(([k]) => k).join(', '),
      next: '改成本地 tarball：npm pack <已装目录> 到 vendor/ 并把依赖写成 file:./vendor/xxx.tgz' };
  }
  return { id: 'pit:git-dependency', level: 'pass', message: '没有 git 依赖', next: '' };
}

/**
 * 3. 按 DSH 的方式把 client bundle 当经典脚本解析：剥 `export`、包进函数体。
 * 这一步能抓到「Unexpected token '}'」这类只在注入时暴露的语法错误。
 */
export function checkClientSource(source) {
  const stripped = String(source || '')
    .replace(/\bexport\s+default\s+(function|class)\b/g, '$1')
    .replace(/\bexport\s+default\s+/g, 'const __default = ')
    .replace(/\bexport\s+(function|const|let|class|async)\b/g, '$1');
  try {
    // 包成函数体，模拟宿主注入；语法错误会在构造时抛出。
    new Function(stripped);
    return { ok: true, error: '' };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

export function clientBundles(profileDir) {
  const nm = join(profileDir, 'node_modules');
  if (!existsSync(nm)) return { id: 'pit:client-bundle', level: 'skip', message: '没有 node_modules', next: '' };
  const bad = [];
  const checked = [];
  const walk = (dir, depth) => {
    if (depth > 2) return;
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.')) continue;
      const p = join(dir, entry);
      let st; try { st = statSync(p); } catch { continue; }
      if (!st.isDirectory()) continue;
      if (entry.startsWith('@')) { walk(p, depth); continue; }
      for (const rel of ['lib/client.js', 'lib/client.mjs', 'dist/client.js']) {
        const f = join(p, rel);
        if (!existsSync(f)) continue;
        checked.push(entry);
        const res = checkClientSource(readFileSync(f, 'utf8'));
        if (!res.ok) bad.push({ pkg: entry, file: rel, error: res.error.slice(0, 120) });
      }
    }
  };
  walk(nm, 0);
  if (bad.length) {
    return { id: 'pit:client-bundle', level: 'fail',
      message: bad.length + ' 个 client bundle 解析失败：' + bad.map((b) => b.pkg + ' (' + b.error + ')').join('; '),
      next: '按报错修那个文件，或临时停用该插件', details: bad, checked: checked.length };
  }
  return { id: 'pit:client-bundle', level: 'pass', message: checked.length + ' 个 client bundle 都能解析', next: '', checked: checked.length };
}

/** 汇总：profileDir 上跑全部三条。 */
export function runPitChecks(profileDir) {
  const out = [];
  try {
    const pkg = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'));
    const bundles = (pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || [];
    out.push(duplicateMarkets(bundles.map((name) => ({ name }))));
    out.push(gitDependencies(pkg.dependencies));
  } catch (e) {
    out.push({ id: 'pit:profile', level: 'skip', message: '读不到 package.json', next: '' });
  }
  out.push(clientBundles(profileDir));
  return out;
}

if (typeof window !== 'undefined') window.TurnstilePits = { duplicateMarkets, gitDependencies, checkClientSource, clientBundles, runPitChecks };
