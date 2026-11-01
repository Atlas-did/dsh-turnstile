# P1.0/P1.1：验证分级 + 真机验证（2026-11-01）

回答一个问题：**「试装通过」到底证明了什么？**

## 六级证据

| 层 | 证明什么 | 证据从哪来 |
|---|---|---|
| L0 静态检查 | 清单/依赖/配置/源码没已知问题 | profile package.json 的 bundles/deps |
| L1 文件层 | 预期文件确实写入 | `node_modules/<pkg>/` + 入口文件 |
| L2 加载层 | **重启后宿主确实组合了它** | `dsh <profile> --dump-config` 命中 |
| L3 路由层 | 声明的路由真实可访问 | HTTP GET 每个路由的状态码 |
| L4 UI 层 | 预期内容真的出现 | 页面 HTML 含 `--expect` 的文本 |
| L5 回归层 | 原有功能没坏 | `/turnstile/health` 各条 pass |

**硬规则**：只认「连续通过的最高层」。中间断了，后面再绿也不算。

```
只过 L0/L1 → 静态检查通过，尚未验证真实运行——不能据此认为插件可用。
到 L2      → 宿主重启后确实加载了它，但还没有验证路由与界面。
到 L4      → 加载、路由、界面都有真实证据；未做回归对比前仍不排除影响别人。
到 L5      → 六层全部通过。
有失败层   → 不能认为可用：只验到「loaded」这一步，路由层失败（/x → 500）。
```

## 工具

```bash
node tools/verify-live.mjs <profile> --pkg <name> \
  [--dsh-bin <dsh/lib/bin.js>] [--base http://127.0.0.1:18770] [--token <t>] \
  [--routes /a,/b] [--expect 文本] [--json]
```

缺参数就**记 unknown**，不猜、不补：没连活宿主 → L3/L4/L5 unknown；没给 dump 命令 → L2 unknown。

## 真机实测（mini 18770）

```
$ node tools/verify-live.mjs mini --home <mini>/home --pkg turnstile-popup \
    --dsh-bin <mini>/runtime/.../dsh/lib/bin.js --base http://127.0.0.1:18770 --token $T --expect turnstile
  ✓ L0 静态检查   pass  bundles 28 / deps 28 | turnstile-popup ∈ bundles
  ✓ L1 文件层    pass  node_modules/turnstile-popup 存在
  ✓ L2 加载层    pass  dump-config 命中：# == turnstile-popup
  ✓ L3 路由层    pass  /turnstile/view-state → 200 | /turnstile/console → 200 …
  ✓ L4 UI 层   pass  /turnstile/console 含「turnstile」
  ✓ L5 回归层    pass  credentials=pass | bundles=pass | auth=skip
结论：六层全部通过：加载、路由、界面可见，且原有功能未回归。
```

反例（同一个工具）：

```
$ … --pkg not-installed-x
  ✗ L0 静态检查   fail  not-installed-x ∉ bundles
结论：不能认为可用：没有任何一层通过，静态检查失败（bundles 28 / deps 28）。  exit=1
```

## 途中修的两个真问题

1. **mini 的 `cordis.patch.yml` 有一个空的 `- insert:`**，宿主每次都报
   `patch: id is required for non-insert patches`。删掉那行（留 `.bak`），dump 不再告警。
2. **Node 25 + fetch + `process.exit()` 会触发 libuv 断言**（`UV_HANDLE_CLOSING`）。
   改成 `process.exitCode` + 清理 timer，测试不再崩。

## 测试

```
test-evidence     15 条：层级语义、断链规则、失败措辞、verdict 推导
test-verify-live   8 条：没证据必须 unknown、不在 bundles 必红、退出码、结论措辞
test:all          18 套件全绿
```

## 仍未做（下一批）

- `sandbox-trial` 还没接这条验证链（现在仍是自己那套「通过/失败」）；
- L4 只做文本包含判断，没有截图/DOM 断言；
- L5 只比 `/turnstile/health`，没有比「装前装后 UI 面差异」。
