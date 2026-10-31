# 修法进面板，且每条必须带回滚点

之前 CLI 有修法、面板只有通道——同一件事两处实现，迟早分叉。这轮把它抽成共享模块：

```
tools/lib/actions.mjs   actionsFor(channels) / missingFor(channels)   纯函数
  ↑ CLI（tools/diagnose.mjs）        ↘ 插件路由（/turnstile/diagnose）
```

## 规矩

1. **只给 failing 的通道出修法**；healthy 不打扰，undetermined 只给「缺什么」。
2. **每条修法必须带 rollback**，否则不允许输出。今天出现过「给了命令但没说怎么退回去」的情况。
3. 面板渲染同一份 JSON，不重算。

## 实机验证（mini，17:4x）

```
$ curl .../turnstile/diagnose
verdict failing   actions ["codex","dsh","ingest","plugin-bridge"]   missing 0
```

四条失败通道各给一条修法，每条都带「回滚」。

## 测试

| 套件 | 条数 | 新增 |
|---|---|---|
| `tools/test-diagnose.mjs` | 6 → **9** | 修法只给 failing / 必须带回滚 / CLI 输出含回滚 |
| `console e2e` | 72 → **73** | 面板里能看到「回滚」二字 |

## 未做

- 修法目前是**文本 + 可复制命令**，不能一键执行（按 docs/96 决策 5：不自动改代理/装插件）。
- `missingFor` 在真实数据里目前恒为空（live 都能判出），只在 `--as-of` 过早时出现，已由 D 用例覆盖。
