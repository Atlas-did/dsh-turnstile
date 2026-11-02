# 适配卡进快照 + 写后自动复探（2026-11-02）

方案 186 的两条收尾：§5「写后重新探测」与 §6.4「适配卡纳入快照」。

## 1. apply 之后自动复探 ✅

`provision --apply --token` 写完后立刻重新探测，并对比刚写的卡：

```
ok   apply 之后自动复探并报 current   {"verdict":"current","reason":""}
```

不一致时输出 `recheck: { verdict: 'stale', reason }` 并退出码 1 —— 卡片仍写入了，但明确告诉你要重跑。

## 2. 适配卡进快照 ✅

`profile-snapshot.mjs` 的 build() 现在记录：

```json
"provision": { "cardDigest": "…", "machineDigest": "…", "stale": false }
```

`--diff` 会单独列出「适配卡变化」：

```
ok  快照记录了适配卡 digest
ok  diff 报出新增插件 / UI 面计数变化 / 配置体积增长
```

意义：适配卡改变时可能**一个插件都没变**，但机器的适配方式变了——以前这种变化在快照里完全不可见。

## 验证

```
test:all              61 个套件 exit 0
test-provision        22 条
test-profile-snapshot 8 条（新增 1 条）
```

## 仍未做

- 快照目前**不保存卡文件本身**，只保存 digest（要比对内容还得看 state/provision 目录）；
- `knowledge-gen` 覆盖率仍缺独立分母；
