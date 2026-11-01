# 创作闭环第一段：新建 → 试装 → 六级验证（2026-11-01）

闭环的四段里，先打通**新建 → 试装 → 自动检查**。导出那一段 `builder-export.mjs` 早已产出
`dsh.bundle.patch` 且用的是正确 `- insert:` 形式，本轮实测确认可用，未改动。

## 新增：`tools/new-plugin.mjs`

```bash
node tools/new-plugin.mjs <name> [--dir <parent>] [--template ui-page|route] [--dry-run] [--json]
# 也走统一入口：node tools/turnstile.mjs new-plugin <name> --dir <parent> --dry-run
```

生成 4 个文件：`package.json` / `cordis.patch.yml` / `lib/index.js` / `lib/page.html`，
内置了两条**曾经把 trial 卡在 L2 的坑**的规避：

| 坑 | 规避 |
|---|---|
| 没写 `dsh.bundle.patch` → 宿主报 `declares no dsh.bundle` | 默认写入 `{"bundle":{"patch":"./cordis.patch.yml"}}` |
| 顶层 `- id:` 加行 → 宿主报 `patch entry not found` | 生成 `- insert:` 包一层 |

## 本轮踩到的第三个坑（真实、已修）

第一版模板写了 `dsh.client: { inject: [] }`，mini **起不来**：

```
Error: client-modules: demo-widget dsh.client.platform must be a string
```

整个 profile 直接崩。现在服务端插件模板**不写 `dsh.client`**（要写就必须给 `platform`）。

## 端到端实测（mini 18770）

```
$ node tools/new-plugin.mjs demo-widget --dir %TEMP%
已创建 demo-widget（模板 ui-page）

$ node tools/sandbox-trial.mjs home/profiles/mini %TEMP%/demo-widget --keep
   ✓ L0 pass  bundles 29 / deps 29
   ✓ L1 pass  node_modules/demo-widget 存在
   · L2/L3/L4/L5 unknown（没连活宿主）
结论（static-only）：文件已写入，尚未重启验证加载——仍不能认为可用。

# 重启后带活宿主再验
  L0 pass / L1 pass / L2 pass（dump-config 命中）/
  L3 pass（/demo-widget → 200）/ L4 pass（页面含 demo-widget）/ L5 pass
verdict ok | verified-with-regression
```

## 测试

`tools/test-new-plugin.mjs` **12 条**：dry-run 不写盘、4 个文件、必须带 `dsh.bundle.patch`、
**必须不带 `dsh.client`**、`- insert:` 形式、注入 webServer、页面有可断言文本、重复创建拒绝、非法包名、未知模板。

```
test:all 20 套件全绿 · e2e-console 92/92
```

## 仍未做

- 闭环第三段「导出」还没接进命令注册表（`builder-export` 仍是独立脚本）；
- `sandbox-trial --restart-cmd` 之后 token 变化仍需手工重取，所以上面那轮是我手动重启+取 token 完成的；
- 搭建器 UI 里的「新建 → 导出 → 试装」按钮还没有。
