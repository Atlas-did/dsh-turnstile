# 代码质量审查的 P0 处置（2026-11-01）

外部审查（基线 `a63263e`）指出：功能齐但**证据链会失真**。这轮修 P0-1、P0-2，并用行为夹具锁住。

## P0-1：空健康数据被判成 L5 通过 → 已修

`verify-live` 的 L5 原来只看 `bad.length === 0`，于是 `{"items":[]}` 也能 pass，进而得出
`verified-with-regression`。现在：

| 情况 | 现在的判定 |
|---|---|
| health HTTP 非 2xx | **unknown**（不能据此判回归） |
| `items` 缺失 / 非数组 / 空数组 | **unknown** |
| `items` 里有 fail 或 `pits` 有 fail | **fail** |
| 没有 `--surfaces-before` | L5 可 pass（健康项确实全过），但 **claim 只能到 `verified`**，并明说「没有做装前基线对比」 |
| 有基线且无插件消失 | L5 pass，claim 才可能是 `verified-with-regression` |

行为夹具 `tools/test-l5-honesty.mjs`（6 条，真起假服务器）：

```
ok  空健康项不能判 L5 通过   unknown
ok  空健康项不能得出 verified-with-regression   verified
ok  health 非 2xx 记 unknown
ok  无基线时 claim 停在 verified
ok  无基线时说明没做对比
ok  健康项 fail → L5 fail
```

## P0-2：验收只看 L2 → 已修

`acceptance-mini` 原来用 `l2.status === 'pass'` 当整步成功。现在抽成纯函数
`tools/lib/acceptance.mjs`：

- `judgeVerify(report)`：要求 **L0–L5 全部 pass**、`claim === 'verified-with-regression'`、`report.ok === true`、层级不缺
- `judgeAcceptance(steps)`：任一步失败即失败，并指出是哪一步

行为夹具 `tools/test-acceptance-judge.mjs`（8 条）覆盖审查点名的反例：

```
ok  L2 pass 但 L3 fail → 不通过   L3 未通过（fail）：route 404
ok  L4 unknown → 不通过
ok  L5 fail → 不通过
ok  六层全 pass 但 claim 不是 verified-with-regression → 不通过
ok  缺层级 → 不通过
```

## 同时修掉 P1-4：测试污染仓库

`test-docs-smoke` 曾把 `report.mjs <profile> # 说明` 里的 `#` 当成输出文件，在仓库根写出一个
**被 git 跟踪的 `#` 文件**。现在：

- 行尾 shell 注释先剥掉
- 不再按文件名猜只读，改为显式白名单（`sanitize-docs` / `docs-index` / `skill-pack` / `release-check`）
- 删除了那个被误提交的 `#`

## 验证

```
test:all  exit 0（43 个 _OK 标记）
新增：test-l5-honesty 6 条 / test-acceptance-judge 8 条
```

## 仍未做（审查里剩下的）

| 项 | 状态 |
|---|---|
| P1-1 真实宿主页面保存没有版本保护 | ❌ 未做（独立控制台有，宿主没有） |
| P1-2 控制台 fixture:false 仍返回写死健康项 | ❌ 未做 |
| P1-3 acceptance 没有 try/finally 与事务边界 | ❌ 未做 |
| P1-5 恒真断言（`ok(..., true)`） | ❌ 未清 |
| P1-6 CI 没跑完整 test:all | ❌ 未改 |
| P2-1 页面校验不查属性声明 | ❌ 未做 |
| P2-2 moveMany 不查 draggable 能力 | ❌ 未做 |
| P2-3 fuse 逐条写非原子 | ❌ 未做 |
