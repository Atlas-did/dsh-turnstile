# 外部反馈第 2 轮：17 条，修复记录

来源：`dsh-turnstile-反馈包-20261031 (1).zip`。上一轮修的 5 条它复测的是旧 commit；这里记**新修**的。

## 已修（第 2 轮）

| # | 问题 | 修法 | 验证 |
|---|---|---|---|
| B13 | 装到全新 profile 后宿主起不来（往 `[]` 后面追加 `- insert:`） | 新 `tools/install-panel.mjs`：先解析，空数组整体重写 | 5 checks + 真机 `/tmp/fresh` 全流程 exit 0 |
| B14 | 安装器写 `link:` 依赖，过不了自己的门禁 | 改 `file:./node_modules/turnstile-popup` | 同上，`dependency-risk PASS` |
| B15 | health 是作者本机清单 | 去掉硬编码包名；只报本 profile 声明的 bundle；bridge 项仅在该 profile 装了 bridge 时出现 | 实机：5 项（2 fail）→ **3 项（0 fail）** |
| B16 | 宿主自带 bundle 被标 missing | 用 `createRequire(process.argv[1])` 向宿主解析 | 实机：`28 个 bundle 都能解析（2 个由宿主提供）` |
| B17 | 两个端点读不同的 state 目录 | 统一 `stateBase()`：`DSH_TURNSTILE_STATE` → `DSH_TURNSTILE_HOME/state` → `DSH_HOME/turnstile-state`；preflight 也认 `DSH_TURNSTILE_STATE`；缺数据返回 200 `not-generated` + hint 而非 404 | 实机 report/occupancy 同为 200；`DSH_TURNSTILE_STATE=/tmp/st1` 时报告写进该目录 |

## 实机对比（mini profile）

```
修复前：pass 2 / warn 1 / fail 2 / skip 1   5 项
   fail | bundles 28 未安装            ← 自己把自己算成缺包
   fail | 缺包：@deepseek-ai/dsh-base… ← B16
修复后：pass 2 / warn 0 / fail 0 / skip 1   3 项
   pass | 28 个 bundle 都能解析（2 个由宿主提供）
```

## 本轮学到的（写进纪律）

1. **「我这台机器的现状」不是检查项**。health 里出现 `agnes-api-key`/`dshmarket`/固定路径，全是同一类错。
2. **一个状态目录**。两个端点读两个目录时，结论必然打架；`DSH_TURNSTILE_STATE` 现在是唯一权威。
3. **「没生成」是数据不是错误**：返回 404 会让面板显示成「坏了」。

## 仍未修（如实）

- B7 `anchor` 看不到 bundle 自带 patch 的行；
- B2 `selftest` 的 `bash -lc`（Windows）、`e2e-panel` 静态 import 可选依赖；
- B3 缺参数即崩（providers.mjs 等）、B9 doctor 位置参数、B10 engines 静默降级、B11 UI 绿点/两套壳。
