# 一条命令跑完创作闭环（2026-11-01）

之前闭环要人工做两步：装完 → 手动重启 mini → 从日志里捞新 token → 再验。
现在一条命令：

```bash
node tools/new-plugin.mjs demo-widget --dir %TEMP%
node tools/sandbox-trial.mjs <mini-profile> %TEMP%/demo-widget --keep --mini <mini-root>
```

## 新增 `tools/lab-reload.mjs`

```bash
node tools/lab-reload.mjs [--mini <dir>] [--no-restart] [--json]
→ { ok, restarted, port, token, url, readyMs, health[] }
```

- stop → start → **轮询 `/turnstile/health` 直到 200**（最多 90s）
- token 取日志**最后一条**（追加写，第一条是旧 token）
- 没就绪就 `ok:false` + `bootNote`，不假装成功

实测：`已重启 mini 并取到新 token（9516ms）`

## `sandbox-trial --mini` 串起来

给 `--mini <root>` 后自动：
1. 跑 lab-reload 拿新 token
2. 推导 `--base`、`--home`、`--dsh-bin`
3. 按包名推 `--routes /<name>` 与 `--expect <name>`
4. 跑六级验证并把 claim 作为结论

## 端到端实测（mini 18770，一次命令）

```
   已重启 mini 并取到新 token（9516ms）
4. 验证：
   ✓ L0 pass  bundles 29 / deps 29
   ✓ L1 pass  node_modules/demo-widget 存在
   ✓ L2 pass  dump-config 命中：# == demo-widget
   ✓ L3 pass  /demo-widget → 200
   ✓ L4 pass  /demo-widget 含「demo-widget」
   ✓ L5 pass  credentials=pass bundles=pass auth=skip
结论（verified-with-regression）：六层全部通过：加载、路由、界面可见，且原有功能未回归。
```

页面真的能打开（curl 原文）：

```html
<h1 data-brand="demo-widget">demo-widget</h1>
```

## 注册表新增

| 命令 | 类型 | 说明 |
|---|---|---|
| `lab-reload` | 写（会中断会话） | 重启 mini + 取 token |
| `export-page` | 写 | 搭建器产物导出为插件 |
| `new-plugin` | 写（dry-run 安全） | 新建可加载插件骨架 |

## 测试

```
test-lab-reload  4 条（token/端口/health/restarted 标记；mini 没跑则明确 SKIPPED）
test:all        21 套件全绿 · e2e-console 92/92
```

## 仍未做

- 搭建器 UI 里的「新建 → 导出 → 试装」按钮（现在都还是命令行）；
- 导出那一步还没进「一条命令」，仍是单独 `node tools/builder-export.mjs`；
- `demo-widget` 现在留在 mini 里做展示，清理：删 `node_modules/demo-widget` 并从 bundles/deps 移除，或 `turnstile snapshot` 回滚。
