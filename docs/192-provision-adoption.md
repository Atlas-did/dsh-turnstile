# Provision 采纳流：计划 → token → apply（2026-11-02）

方案 186 §5 要求「采纳操作也进入确认流」。这轮把 provision 接进已有的 applyToken。

## 三段

| 命令 | 行为 |
|---|---|
| `provision <profile> --plan` | 打印计划（cardDigest / machineDigest / runtimeFingerprint / stateDir）+ 发一次性 token，**不落盘** |
| `provision <profile> --apply --token <t>` | 校验 token（参数绑定 + 一次性 + 5 分钟 TTL），通过后才写两张卡 |
| `provision <profile> --apply`（无 token） | 直接拒绝，退出码 2 |

token 的 hash 覆盖整个 plan 对象，因此：

- 计划之后 DSH 版本 / runtimeRoot / profile 清单变化 → 卡片 digest 变化 → **token 不再匹配**，必须重新出计划；
- token 只能消费一次。

## 测试（新增 6 条，合计 21 条）

```
ok   --plan 给出计划与 token
ok   --plan 不落盘
ok   --apply 不带 token 被拒   2
ok   带正确 token 的 apply 成功
ok   token 只能消费一次   1
ok   计划后卡片内容变化 → token 不匹配被拒
```

## 仍然是「写之前先答应」

- 没有 `--write`/`--apply` 时一个字节都不写；
- 旧的无 token 直写路径 `--write` 保留，但输出里 `confirmed: false`，便于审计区分。

## 验证

```
test:all   61 个套件 exit 0
```

## 下一步

- 卡片纳入 `profile-snapshot` 的对比范围（现在快照只记录插件/UI 面/配置体积）；
- `provision --apply` 后再自动 `--check` 一次，把「写后复探」也变成默认；
