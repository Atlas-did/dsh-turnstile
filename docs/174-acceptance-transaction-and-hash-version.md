# 复审 P1-3 处置 + 版本号改成内容哈希（2026-11-01）

## P1-3：验收没有失败恢复 ✅

`acceptance-mini` 现在：

| 机制 | 行为 |
|---|---|
| 预检 | 记录原始 `package.json` 字节、目标是否已在 bundles/deps/node_modules |
| 默认拒绝 | 目标已存在时**拒绝执行**（`exit 3`），除非显式 `--overwrite` |
| 只回滚自己 | `rollbackOwnChanges()` 只恢复本次改动：package.json 复原 + 删掉本次装的目录（原本就有的目录不动） |
| 异常兜底 | `uncaughtException` → 回滚 → **仍写证据** → 退出码 1 |
| 证据 | 失败也会落 `mini-acceptance@1` JSON，标 `failedEarly` |

实测：`acc-tx2` 全流程通过（含 rollback-verified）。

## 顺手修的一个真 bug：版本号用 mtime+size 会撞

`test-page-store` 偶发失败（`用过一次的旧版本不能再写`）——同一毫秒内写入且大小相同，
mtime+size 得到同一个版本号，并发保护就漏了。

改成 **内容 sha256 前 16 位**：

```
ok  首次写入成功   95fb7535383854d5
ok  内容被改后旧版本不能再写
ok  内容变了版本也变   e024dcb9a0ab1b6c → 4b7d33ffaee2d84f
```

语义也随之更清楚：**版本代表内容**，同内容重写不算覆盖。

## 途中修的两个自己的 bug

1. `flushEvidence` 里的 `return` 放早了 → 脚本静默退出、什么都不打印。
2. `writePage` 用 `Number(baseVersion)` 比较字符串哈希 → 恒 NaN、当前版本也写不进去。

两条都是被测试当场抓出来的。

## 验证

```
test:all  exit 0，47 个 _OK
```

## 仍未做

| 项 | 状态 |
|---|---|
| P2-3 `fuse --apply` 逐条写非原子 | ❌ |
| 其他 POST 路由的请求体上限未统一 | ❌ |
| 桌面端验收 / 版本兼容矩阵 | ❌ 需真实环境 |
