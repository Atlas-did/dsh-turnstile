# 证据词统一（2026-11-01）

合并后最急的结构性债：`trial-status`/`host-evidence` 与 `verify-live` 的 `L0–L5` 是**两套说法**。
这轮把它们收成一套：**对外只有 `L0–L5` + 一个 `claim`**，`host-evidence` 降级为 L2/L3 的**证据来源**。

## 改了什么

| 文件 | 改动 |
|---|---|
| `tools/verify-live.mjs` | 新增 `--host-evidence <file>`：证据有效 → **L2 直接用 bootId 差异 + bundles 确认判定**（比 dump-config 硬）；证据无效 → 退回 dump，并在 note 里写明原因 |
| `tools/sandbox-trial.mjs` | journal 里记 **claim**（`static-only` / `verified-with-regression`…），不再记笼统的 `static-pass` |
| `tools/trial-status.mjs` | 输出 **`claim`** 字段；并把「六级通过（dump 判定）」与「真实宿主证据通过（bootId 判定）」讲成两句不同的话 |

## claim 词表（唯一一套）

```
static-only             只过了静态/文件层
loaded                  宿主组合里确实有它
routable                路由真实可访问
verified                加载、路由、界面都有证据
verified-with-regression 六层全过
failed / unknown        未通过 / 数据不足
```

## 实测（mini）

```
$ node tools/trial-status.mjs <mini> --json
  "claim": "verified-with-regression",
  "summary": "六级结论 verified-with-regression（加载层用 dump-config 判定，未采真实宿主证据）"
```

注意这句话**同时说清了结论和证据来源**：结论是六级通过，但加载层用的是 dump-config，
不是真实宿主证据。用户不会再以为两者等价。

## 测试

`tools/test-evidence-unify.mjs` 7 条：verify-live 收 host-evidence、无效时退回而非判死、
trial-status 有 claim、claim 只用阶梯词、没有第二套成功词、L0..L2→loaded、L0..L5→verified-with-regression。

```
test:all     32 套件全绿
e2e-console  98/98
真机 acceptance 仍通过（装→六级→卸→404→证据落盘）
```

## 仍未做

- `host-observe` 还没被 `verify-live` 自动调用（现在是「有人给了证据文件才用」）；
- L4 仍只做文本包含，host-evidence 的 SHA-256 还没用来校验页面内容；
- 桌面端验收仍未做。
