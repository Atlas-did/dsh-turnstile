# 装之前先看现状（preinstall）

今天最大的错不是「不知道版本」，是**照教程装第二个市场，而机器上早有一个**。
这一轮把它做成一个必须先跑的命令。

```
node tools/preinstall.mjs <profileDir> <package> [--json]
exit: 0 可以装 | 1 会撞车/有风险 | 2 用法错
```

## 在你机器上的实跑（真实案例回放）

```
$ node tools/preinstall.mjs ~/.dsh/profiles/desktop @ace-zone/dsh-market
preinstall · desktop ← @ace-zone/dsh-market
  已在 dependencies: false   node_modules: false
  现有市场: 只有 1 个插件市场
  git 依赖: 没有 git 依赖
  同族已存在: dshmarket
  结论: check-first
   · 同族包已存在：dshmarket
     → 确认不是重复功能的第二个实现（今天我们就是这样装了两个市场）
exit=1
```

**如果在今天下午先跑这一条，就不会有那两个市场并存。**

## 判什么

| 检查 | 触发条件 | 为什么 |
|---|---|---|
| 已在 bundles | 目标包已在 `dsh.profile.bundles` | 已经会随 profile 加载 |
| 已在 dependencies | 目标包在 `dependencies` | 重复 add 会改版本约束 |
| 同族命名 | 归一化后同名（`dsh-market` / `dshmarket` / `dsh_market`） | 今天踩的就是这个 |
| 第二个市场 | 目标像市场且已有一个 | 侧栏会重复入口 |
| git 依赖 | 现有依赖里有 `git+`/`github:` | pnpm 会因网络整条失败 |

## 测试

`tools/test-preinstall.mjs` — **5 checks**：已装同包 / 同族命名 / 第二个市场 / 干净可装 / git 依赖透传。

另外修了一个真 bug：`MARKET_PATTERN` 原来要求精确结尾，`dsh-plugin-market` 漏判；
现在按后缀匹配 `dsh-?market|dsh-?plugin-?market|plugin-?market|market-?place`。

## 尚未做的

- 没有强制拦截安装（DSH 的 `dsh plugin add` 是官方命令，我们不该偷偷拦）；这只是一个**该先跑的检查**。
- 没有把它接进面板按钮（面板目前只读，按 docs/96 决策 5）。
