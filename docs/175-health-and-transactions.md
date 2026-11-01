# 主仓库复核后的收口（2026-11-01 第 2 轮）

这次直接改主仓库，不再建副本。复核点名的两个 P1 已修，另把 fuse 原子性补上。

## P1-a：控制台健康检查误报 ✅

根因：控制台把 `missing: []` 硬传进去，声明的包是否存在**从来没查过**。

修法：抽 `plugins/turnstile-popup/lib/health-collect.js`，**宿主与控制台共用同一份**：

| 项 | 真实来源 |
|---|---|
| credentials | `<DSH_HOME>/.credentials.yaml`（与宿主一致） |
| bridge | `~/.agents-anywhere/dsh-bridge/endpoint.json` 与 `<DSH_HOME>/agents-anywhere/bridge/endpoint.json`；**没安装 bridge 就跳过** |
| bundles | 读 profile 声明 → 逐个查 `node_modules` → 再让宿主 `createRequire` 解析（asar 提供的不算缺） |

行为反例 `test-health-collect.mjs`（6 条）：

```
ok  缺包被真实检出   {"id":"bundles","level":"fail","message":"缺包：definitely-missing-plugin"}
ok  已装的包不算缺
ok  凭据从 DSH_HOME 读（写进去就变 pass）
ok  未安装 bridge 时不报 bridge   ["credentials","bundles","auth"]
ok  真实模式的 profile 是真实路径
ok  真实模式不标 fixture
```

真机验证（mini 18770）：`bundles pass / 31 个 bundle 都能解析（2 个由宿主提供）`。

## P1-b：验收异常路径写不出证据 ✅

根因有两个：异常处理器**注册太晚**（预检解析 package.json 先抛），以及处理器读 `installedByUs` 时还在 TDZ。

修法：

- `state` 挪到最前，处理器在**预检之前**注册
- 处理器只读 `state`，不碰后面才初始化的 const
- `rollbackOwnChanges()` 返回真实结果，回滚失败**不会**再记成成功

故障注入 `test-acceptance-failure.mjs`（7 条，真的把 package.json 写坏）：

```
ok  早期异常退出码非 0   1
ok  早期异常仍然写出证据文件
ok  证据标了 failedEarly
ok  证据里有 unexpected-error 步骤
ok  目标已存在时退出码 3（且不改 package.json）
```

## P2-3：fuse 逐条写非原子 ✅

新增 `tools/lib/batch-write.mjs`：冻结本批文件 → 逐步执行 → 任一步失败**整批恢复**并记录失败点。
`fuse --apply` 改用它。

```
ok  全部成功时都写入
ok  中途失败时整批恢复
ok  失败点被记录   1
```

## 顺手修的两个真 bug（都是这轮改动引入/暴露的）

1. 宿主 `/turnstile/health` 返回 **400**：我把 `profile`/`dir`/`here` 从外层删了，handler 里引用到未定义变量。
2. `pits` 报 `Cannot find module 'acorn'`：宿主 cwd 不在仓库里。现在按 cwd → `DSH_TURNSTILE_HOME` → 包目录依次找，找不到就跳过语法检查并说明。

## 验证

```
test:all   exit 0，50 个 _OK
真机 mini  reload ok，health 返回真实 items + 真实 pits
```

## 仍未闭环（如实记录）

| 项 | 状态 |
|---|---|
| 其他 POST 路由的 body 上限 | 只统一了 `/turnstile/run` |
| 页面保存允许省略 baseVersion | 兼容保护，不是强制协议 |
| 桌面端技能验收 / rc.4·rc.5 兼容矩阵 / 视觉验收 | 本轮无证据 |
| 浏览器 e2e（console/panel/builder） | 本轮未重跑 |
