# doctor / gate-map 也迁到 lib/ui-scan（2026-11-01 收尾）

上一轮只有 `ui-surfaces` 与 `occupancy` 用上 `tools/lib/ui-scan.mjs`，
外部审查第 1 条（面名口径漂移）还剩 doctor 与 gate-map 没迁。这轮补完。

## 改了什么

| 文件 | 改法 |
|---|---|
| `tools/lib/ui-scan.mjs` | 每个插件多带 `pkgPath`（gate-map 要显示「谁声明的」文件位置） |
| `tools/doctor.mjs` | 扫描块换成 `scanUi(profileDir, {onlyUiSurfaces:true})`，只做短名投影 |
| `tools/gate-map.mjs` | 同上，另用 `pkgPath` 补 `src`；旧循环用 `if (false)` 保留一版对照（下一步删） |
| `tools/console-server.mjs` | 删掉 `diagnose-legacy` 死代码（669 字符） |

## 证据

doctor（mini）：

```
== UI 抢占 ==
   ui-conversation        8  …
   ui-settings            7  …
   ui-renderer            4  …
   ui-slots               3  …
```

gate-map（mini）：`overlapped rows 0 | ui surfaces 14 | hot(>10) 0 | routes 0 | runs 1`

与 lib 一致：`ui surfaces 14` = `scanUi(onlyUiSurfaces:true)` 的面数。

## 测试扩展到四个工具

`occupancy-parity.test.mjs` 现在断言 6 条：

1. occupancy 有面行
2. occupancy 与 lib 计数一致
3. 面名已统一为短名
4. doctor 的 ui-conversation 计数与 lib 一致（夹具：1 vs 1）
5. gate-map 报出 ui 面数
6. gate-map 面数与 lib 一致（夹具：2 vs 2）

> 测试里给 doctor/gate-map 造了临时 `<home>/profiles/<name>` 布局 —— 它们不接受裸目录，只认 profile 名 + home。

## 仍未做

- gate-map 里保留的 `if (false)` 旧循环**还没删**（留着对照，删它属于清理，不改行为）；
- `slot-scan.mjs` 也扫 UI 面，未迁移；
- `grep -rln "profile.bundles" tools/*.mjs` 仍有若干命中（多数是读 bundles 计数，不是面扫描）。
