# 剩余四项的收口（2026-11-01 第 3 轮）

目标清单：其他 POST 路由 body 上限 / baseVersion 强制 / 桌面端与兼容矩阵 / 重跑浏览器 e2e。

## 1. body 上限推到所有 POST 路由 ✅

新增 `plugins/turnstile-popup/lib/body.js`（宿主与控制台共用 `readJsonBody` / `readJsonText`），
宿主侧 8 个 POST 路由全部改用它，`req.destroy()` 的硬切断清零。

| 路由 | 上限 | 超限行为 |
|---|---|---|
| `/turnstile/run` | 1 MB | 413 JSON |
| `/turnstile/designer` | 1 MB | 413 |
| `/turnstile/view-state`、`/anchor`、`/fuse`、`/slot-map` 等 | 1 MB | 413 |
| `/turnstile/page`（保存页面） | 2 MB | 413「页面过大」 |

控制台侧同样处理，`test-json-body` 3 条行为断言（413 / 结构化错误 / 400）。

## 2. baseVersion 变成强制协议 ✅

以前：覆盖已有页面省略 `baseVersion` 也能写（只是「兼容保护」）。
现在：`writePage` 在目标已存在且没带版本时返回 `needsVersion`，两个服务器都回 **428**：

```
ok  覆盖已有页面必须带 baseVersion（否则 428）   428
```

搭建器一直带 `baseVersion`，因此用户体验不变；旧客户端会明确收到 428 而不是静默覆盖。

## 3. 浏览器 e2e 重跑（本轮新数字）✅

```
e2e-console-offline   103/103
e2e-panel-offline      42/42
e2e-builder-offline    BUILDER_E2E_OK
```

## 4. 桌面端与兼容矩阵（只读证据）

| 项 | 证据 |
|---|---|
| 技能已安装 | `~/.dsh/skills/turnstile/SKILL.md` 存在，本会话技能目录里能看到 `turnstile` |
| 桌面 profile 可体检 | `turnstile doctor desktop` → `ok:true`，10 处提醒（停用 1 / UI 抢占 9） |
| mini 运行时 | `@deepseek-ai/dsh@0.2.1-rc.3` |
| rc.4 / rc.5 / 0.2.2-alpha.2 | **未安装、未运行 → 仍 unknown**（不编造） |

## 途中修的一个真回归

批量替换 body 读取时，`/turnstile/view-state` 和 `/turnstile/anchor` 残留了旧变量 `body` →
`ReferenceError` → **面板 e2e 10/12 失败**。靠「面板 e2e」当场抓到，不是靠肉眼。

## 验证

```
test:all  exit 0，50 个 _OK
```

## 仍未做

- 桌面端「会话里说一句话触发技能」的实机体验（需要重启桌面并人工试）
- rc.4 / rc.5 / 0.2.2-alpha.2 兼容矩阵（没有装这些版本）
- 视觉人工验收（截图、对齐线手感）
