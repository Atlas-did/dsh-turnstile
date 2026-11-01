# 多标签页 / 外部修改保护（2026-11-01）

handoff P0 最后一条：页面保存是覆盖写，没有版本检查，两个标签页会互相静默覆盖。现在有了。

## 机制

| 位置 | 行为 |
|---|---|
| `GET /turnstile/page` | 返回 `version`（文件 mtime+size 的合成值，不需要额外存储） |
| `POST /turnstile/page` | 接受 `baseVersion`；与当前不一致 → **409 + 当前版本**，不写盘 |
| `builder.html` | 保存带 `baseVersion`；收到 409 → 提示「页面已在别处被修改，未覆盖」→ 用户选「重新载入」或「留在当前编辑」 |

没带 `baseVersion` 的旧客户端仍可写（向后兼容），行为与以前一致。

## 实测

```
ok  首次保存（无文件）成功   200
ok  GET 带 version           1793529029637.953
ok  过期版本保存被拒 409      409
ok  409 带回当前版本供重载    1793529029637.953
ok  当前版本保存成功          200
ok  保存后版本变了            1793529029637.953 → 1793529029656.7126
ok  没带 baseVersion 的旧客户端仍可写（兼容） 200
```

## 测试

```
test-page-version  7 条（真起一个 console-server，走真 HTTP）
test:all           33 套件全绿
e2e-builder        BUILDER_E2E_OK
e2e-builder-console BUILDER_CONSOLE_E2E_OK
```

## 仍未做

- 版本号是 mtime+size 合成值，同一毫秒内写入且大小相同理论上会漏（实践上极小概率）；
- 没有「比较两个版本」的 UI（只能选重载或覆盖自己的）；
- 页面树严格校验 / schema 迁移仍未做。
