# 决策记录：2026-10-31 深夜「按推荐」全部通过

> 用户原话：「按推荐接下来任务你都按推荐，我接下来五六个小时都不会在」。
> 因此 docs/91 的 8 条 + SDS 审核新增的第 9 条，全部按我的推荐答案执行，逐条记录如下，便于日后追溯。

| # | 决策 | 采用值 |
|---|---|---|
| 1 | 主用户 | **你（本机主 profile）**；新手只留 docs/faq，不做 UI |
| 2 | diagnose 触发 | 手动 + 面板按钮；**不做崩溃钩子**（改时间戳快照 + diff） |
| 3 | 出站探测 | **改为「受害进程 × 它真实走的路径」**，不做 4×3 矩阵（假阳性 75% 已实测） |
| 4 | 结论格式 | `现象 / 证据(file+sha256+line) / 修法(可复制命令) / 推翻条件` |
| 5 | 面板动作 | 只做两类：跑诊断、复制修复命令；**不自动改代理/装插件** |
| 6 | mini 定位 | 沙盒验 profile 内写入与 UI；全局路径/外部进程写「缺什么条件」，**不用 cannot-reproduce 二元标签** |
| 7 | 坑的归类 | 代理/版本/双市场/client 加载 → 回归；sidebar 排版、md 渲染 → 只文档 |
| 8 | 完成标准 | 对 corpus 五用例（A/B/C/D/E）逐行一致，允许 undetermined |
| 9 | 作用域 | **默认 `--all`**（集合内出现过即算）；`--as-of <ts>` 可选，无数据时 undetermined |

## 因此敲定的实施顺序

```
S1 tools/lib/records.mjs     readRecords + 去重(seq) + UTC 归一 + sha256 校验
S2 tools/lib/classify.mjs    classify/aggregate 纯函数（severity 与 failure 分离）
S3 tools/diagnose.mjs        入口 + JSON 契约 + --all/--as-of
S4 面板只读渲染 S3 的 JSON
```

验收裁判：`tests/corpus/2026-10-31/`（13 文件，完整 64 位 sha256，aa 与 control 不同扫）。
