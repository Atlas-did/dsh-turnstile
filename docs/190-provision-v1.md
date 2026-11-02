# Provision 第一版：只读探测 + 两层卡 + stale（2026-11-02）

按 `docs/186-provision-batch-schema.md` 落了最小实现 `tools/provision.mjs`。

## 能力范围

| 能力 | 状态 |
|---|---|
| 只读探测机器事实（平台/arch/node/DSH 版本/runtimeRoot） | ✅ 只读文件与 env |
| profile 卡（profile、插件声明与安装状态、adapterSelections） | ✅ |
| 两层卡 + digest 自校验 | ✅（卡引用 `machineDigest`） |
| stale 判定（机器 digest / 运行时指纹） | ✅ |
| 显式 `--write` 才落盘 | ✅ 默认一个字节都不写 |
| `--check` 对比现有卡与当前探测 | ✅ 输出 current / stale |

## 明确没做（诚实边界）

能力矩阵里 `slots.snapshot` / `approval.request` / `tools.register` **全部是 `unknown`**，
并写明原因：「需要宿主运行时的只读反射」/「有副作用，禁止在探测里调用」。

这是刻意的：CLI 探测拿不到宿主对象，与其猜「应该存在」，不如标 unknown。

## 测试（15 条）

```
ok   从 DSH_BIN 读出真实版本
ok   没有 DSH_BIN 时版本是 unknown
ok   能力探测全部如实 unknown（没有副作用调用）
ok   同一环境 digest 稳定
ok   卡片引用机器 digest
ok   当前机器 → 不 stale / 机器 digest 变化 → stale / 运行时变化 → stale
ok   不加 --write 时不创建 state 目录
ok   --write 写出机器与卡片两个文件
ok   --check 报 current
```

## 途中修的两个自己的 bug

1. `process.argv[1].endsWith('provision.mjs')` 对 `test-provision.mjs` 也成立 → 测试一跑就打印 usage。改成比 basename。
2. 卡 digest 把 `createdAt` 也算进去 → 每次探测都变；改成只对稳定字段做指纹。

## 真机输出（mini）

```
机器：win32/x64  node 25.8.0
DSH：unknown  运行时 (未探测到)      ← 没给 DSH_BIN 就如实 unknown
服务知识：163 条（0.2.1-rc.3）
profile：mini  插件 31（已安装 29）
能力：slots.snapshot=unknown  approval.request=unknown  tools.register=unknown
```

## 下一步

- 把 `provision --write` 接进采纳流程（applyToken 绑定 cardDigest + 机器指纹）；
- 卡片纳入 `profile-snapshot.mjs` 的回滚范围；
- `conflict.mjs` 的严格相等改成 current / stale / absent 三态。
