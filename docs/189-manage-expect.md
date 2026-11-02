# 计划指纹接进 manage（2026-11-02）

上一轮给 `safeWritePatch` 加了前置指纹参数，但没人用它 —— 等于有闸门没接电。
这轮把它接进 `manage.mjs` 的 dry-run → apply 链路。

## 行为

| 阶段 | 变化 |
|---|---|
| dry-run `--json` | 输出多一个 `expect`（当前 patch 内容的指纹） |
| apply | 接受 `--expect <指纹>`；与当前内容不符 → `STALE_PLAN`，不写、不留备份 |

```
ok   dry-run 给出指纹   9a2194e56effe8b7
ok   指纹不符时 apply 被拒
ok   被拒后文件保持别人的修改
ok   指纹一致时 apply 成功
```

## 为什么这个顺序重要

以前 dry-run 与 apply 之间隔了一次人工确认；如果有人（或另一个窗口）在这段时间改了 patch，
apply 会直接覆盖。现在覆盖前会先比指纹，不一致就要求重新出计划。

## 验证

```
test:all   59 个套件 exit 0
```

## 仍未做

- `anchor.mjs` 的写路径还没接 `--expect`（同一条命令族，应保持一致）；
- 面板/宿主路由的写入口仍未带指纹（属于批次三的 CommandDescriptor 统一）；
