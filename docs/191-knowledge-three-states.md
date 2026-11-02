# 知识三态：current / stale / absent（2026-11-02）

方案 186 §4 要求把「版本不等就全盘丢弃」改成三态。这轮做完了。

## 之前

```js
if (k.dshVersion === runtimeVersion) { 用知识 } else { 什么都不做 → 退回 20 个硬编码 }
```

版本不等 = 知识完全不用，且没有人知道它「曾经有用」。

## 现在

| 状态 | 条件 | 行为 |
|---|---|---|
| `current` | 版本相同 | 知识可**断言**：命中即 `error`，退出码 6 |
| `stale` | 版本不同 | 知识只**提示**：`ctx-assign-stale`，severity `warning`，**不阻断** |
| `absent` | 没有知识文件 | 退回内置清单，并明写 `stale by construction` |

JSON 输出新增 `knowledge: { state, source, hints }`，消费者能知道结论建立在哪种知识上。

## 测试（7 条）

```
ok   current 下命中即 error（会阻断）   6
ok   stale 只给 ctx-assign-stale 提示
ok   stale 提示不是 error 且不阻断   0
ok   absent 时未知服务不产生任何冲突
```

## 真机（mini）

```
known services: 21 via knowledge (STALE: built for 0.2.1-rc.3; hints only)
knowledge: stale, hints: 148
```

没有 DSH_BIN 时运行时就 unknown，所以知识自然落到 stale —— 这是诚实的默认，
而不是「假装 163 条就是当前宿主的」。

## 仍未做

- `knowledge-gen` 生成的 163 条覆盖率仍缺独立分母（方案要求不称 100%）；
- Provision 卡还没接进 applyToken 绑定；
